const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const BACKGROUND_SOURCE = fs.readFileSync(
  path.join(__dirname, '..', 'src', 'background.js'),
  'utf8'
);

const toPlain = value => JSON.parse(JSON.stringify(value));

function createEvent() {
  const listeners = [];
  return {
    addListener(listener) {
      listeners.push(listener);
    },
    listeners
  };
}

function loadBackground({ initialTabs = [], lastFocusedWindowId = 1, windowStates = new Map() } = {}) {
  const calls = {
    createdTabs: [],
    queriedTabs: [],
    removedTabs: [],
    runtimeMessages: [],
    tabUpdates: [],
    windowUpdates: []
  };
  const tabs = new Map(initialTabs.map(tab => [tab.id, { ...tab }]));
  let nextTabId = Math.max(0, ...tabs.keys()) + 1;

  const runtimeOnMessage = createEvent();
  const browser = {
    action: {
      setBadgeBackgroundColor() {},
      setBadgeText() {}
    },
    runtime: {
      getURL(resource = '') {
        return `moz-extension://tabsearch/${resource}`;
      },
      onMessage: runtimeOnMessage,
      async sendMessage(...args) {
        calls.runtimeMessages.push(toPlain(args));
      }
    },
    storage: {
      local: {
        async get(keys) {
          if (Array.isArray(keys) && keys.includes('virtualDashboard')) {
            return { virtualDashboard: true };
          }
          return {};
        },
        async set() {},
        async remove() {}
      }
    },
    tabs: {
      onActivated: createEvent(),
      onRemoved: createEvent(),
      async create(createProperties) {
        calls.createdTabs.push(toPlain(createProperties));
        const tab = {
          id: nextTabId++,
          windowId: createProperties.windowId,
          url: createProperties.url,
          active: createProperties.active
        };
        tabs.set(tab.id, tab);
        return { ...tab };
      },
      async get(tabId) {
        if (!tabs.has(tabId)) {
          throw new Error(`Unknown tab ${tabId}`);
        }
        return { ...tabs.get(tabId) };
      },
      async query(queryInfo) {
        calls.queriedTabs.push(toPlain(queryInfo));
        return [...tabs.values()].map(tab => ({ ...tab }));
      },
      async remove(tabId) {
        calls.removedTabs.push(tabId);
        tabs.delete(tabId);
      },
      async update(tabId, updateProperties) {
        calls.tabUpdates.push({ tabId, updateProperties: toPlain(updateProperties) });
        const tab = { ...tabs.get(tabId), ...updateProperties };
        tabs.set(tabId, tab);
        return { ...tab };
      }
    },
    windows: {
      WINDOW_ID_NONE: -1,
      onFocusChanged: createEvent(),
      async getLastFocused() {
        return { id: lastFocusedWindowId };
      },
      async get(windowId) {
        return { id: windowId, state: windowStates.get(windowId) || 'normal' };
      },
      async update(windowId, updateProperties) {
        calls.windowUpdates.push({ windowId, updateProperties: toPlain(updateProperties) });
        return { id: windowId, ...updateProperties };
      }
    }
  };

  const context = vm.createContext({
    browser,
    clearInterval,
    clearTimeout,
    console: {
      error() {},
      log() {},
      warn() {}
    },
    Date,
    module: { exports: {} },
    setInterval,
    setTimeout
  });
  vm.runInContext(BACKGROUND_SOURCE, context, { filename: 'src/background.js' });

  assert.equal(runtimeOnMessage.listeners.length, 1, 'background message listener must register');
  return {
    browser,
    calls,
    handleMessage: runtimeOnMessage.listeners[0],
    tabs
  };
}

test('open-dashboard creates one active dashboard tab in the last-focused window', async () => {
  const { calls, handleMessage } = loadBackground({ lastFocusedWindowId: 42 });

  await handleMessage({ action: 'open-dashboard', query: 'docs & tabs' }, {});

  assert.deepEqual(calls.createdTabs, [{
    url: 'moz-extension://tabsearch/search-results.html?q=docs%20%26%20tabs',
    active: true,
    windowId: 42
  }]);
  assert.equal(calls.queriedTabs.length, 1);
});

test('open-dashboard reuses the cached dashboard and forwards the latest query', async () => {
  const { calls, handleMessage } = loadBackground({ lastFocusedWindowId: 8 });

  await handleMessage({ action: 'open-dashboard', query: 'first' }, {});
  await handleMessage({ action: 'open-dashboard', query: 'second' }, {});

  assert.equal(calls.createdTabs.length, 1, 'the second search must not create another dashboard');
  assert.deepEqual(calls.runtimeMessages, [[{ action: 'update-query', query: 'second' }]]);
  assert.deepEqual(calls.tabUpdates, [{ tabId: 1, updateProperties: { active: true } }]);
  assert.deepEqual(calls.windowUpdates, [{ windowId: 8, updateProperties: { focused: true } }]);
});

test('open-dashboard discovers an existing dashboard after background state is lost', async () => {
  const existingDashboard = {
    id: 77,
    windowId: 12,
    url: 'moz-extension://tabsearch/search-results.html?q=old'
  };
  const { calls, handleMessage } = loadBackground({
    initialTabs: [
      { id: 1, windowId: 1, url: 'https://example.com/' },
      existingDashboard
    ]
  });

  await handleMessage({ action: 'open-dashboard', query: 'replacement' }, {});

  assert.equal(calls.createdTabs.length, 0);
  assert.deepEqual(calls.runtimeMessages, [[{ action: 'update-query', query: 'replacement' }]]);
  assert.deepEqual(calls.tabUpdates, [{ tabId: 77, updateProperties: { active: true } }]);
  assert.deepEqual(calls.windowUpdates, [{ windowId: 12, updateProperties: { focused: true } }]);
});

test('open-dashboard recovers from a stale cached tab ID without creating a duplicate', async () => {
  const fixture = loadBackground({ lastFocusedWindowId: 3 });

  await fixture.handleMessage({ action: 'open-dashboard', query: 'first' }, {});
  fixture.tabs.delete(1);
  fixture.tabs.set(9, {
    id: 9,
    windowId: 6,
    url: 'moz-extension://tabsearch/search-results.html#restored'
  });
  await fixture.handleMessage({ action: 'open-dashboard', query: 'recovered' }, {});

  assert.equal(fixture.calls.createdTabs.length, 1);
  assert.deepEqual(fixture.calls.tabUpdates, [{ tabId: 9, updateProperties: { active: true } }]);
  assert.deepEqual(fixture.calls.windowUpdates, [{ windowId: 6, updateProperties: { focused: true } }]);
});

test('activate-tab focuses and activates the target before closing the dashboard', async () => {
  const { calls, handleMessage } = loadBackground({ lastFocusedWindowId: 4 });
  await handleMessage({ action: 'open-dashboard', query: 'target' }, {});

  await handleMessage({
    action: 'activate-tab',
    tabId: 99,
    windowId: 7,
    closeDashboard: true
  }, {});

  assert.deepEqual(calls.windowUpdates, [{ windowId: 7, updateProperties: { focused: true } }]);
  assert.deepEqual(calls.tabUpdates, [{ tabId: 99, updateProperties: { active: true } }]);
  assert.deepEqual(calls.removedTabs, [1]);
});

test('activate-tab preserves the dashboard when keep-open behavior is requested', async () => {
  const { calls, handleMessage } = loadBackground({ lastFocusedWindowId: 4 });
  await handleMessage({ action: 'open-dashboard', query: '' }, {});

  await handleMessage({
    action: 'activate-tab',
    tabId: 15,
    windowId: 5,
    closeDashboard: false
  }, {});

  assert.deepEqual(calls.windowUpdates, [{ windowId: 5, updateProperties: { focused: true } }]);
  assert.deepEqual(calls.tabUpdates, [{ tabId: 15, updateProperties: { active: true } }]);
  assert.deepEqual(calls.removedTabs, []);
});

test('activate-tab restores minimized parent window to normal state and focuses it (FR-007)', async () => {
  const windowStates = new Map([[7, 'minimized']]);
  const { calls, handleMessage } = loadBackground({ lastFocusedWindowId: 4, windowStates });
  await handleMessage({ action: 'open-dashboard', query: '' }, {});

  await handleMessage({
    action: 'activate-tab',
    tabId: 99,
    windowId: 7,
    closeDashboard: true
  }, {});

  assert.deepEqual(calls.windowUpdates, [{ windowId: 7, updateProperties: { focused: true, state: 'normal' } }]);
  assert.deepEqual(calls.tabUpdates, [{ tabId: 99, updateProperties: { active: true } }]);
});

test('tabs.onActivated auto-close ignores tab activation in a different window', async () => {
  const { browser, calls, handleMessage, tabs } = loadBackground({ lastFocusedWindowId: 4 });
  await handleMessage({ action: 'open-dashboard', query: '' }, {});

  // Dashboard was created as tab 1 in window 4
  assert.equal(calls.createdTabs.length, 1);
  const dashboardTabId = 1;

  // Simulate tab 50 activating in another window (window 9)
  tabs.set(50, { id: 50, windowId: 9 });
  await browser.tabs.onActivated.listeners[0]({ tabId: 50, windowId: 9 });

  // Dashboard must NOT be closed
  assert.equal(calls.removedTabs.length, 0);
});

test('tabs.onActivated auto-close closes dashboard when another tab in the same window is activated', async () => {
  const { browser, calls, handleMessage, tabs } = loadBackground({ lastFocusedWindowId: 4 });
  await handleMessage({ action: 'open-dashboard', query: '' }, {});

  // Dashboard was created as tab 1 in window 4
  assert.equal(calls.createdTabs.length, 1);
  const dashboardTabId = 1;

  // Simulate tab 50 activating in the SAME window (window 4)
  tabs.set(50, { id: 50, windowId: 4 });
  await browser.tabs.onActivated.listeners[0]({ tabId: 50, windowId: 4 });

  // Dashboard MUST be closed
  assert.deepEqual(calls.removedTabs, [dashboardTabId]);
});

