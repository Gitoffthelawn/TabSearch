const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const BACKGROUND_SOURCE = fs.readFileSync(
  path.join(__dirname, '..', 'src', 'background.js'),
  'utf8'
);

function createEvent() {
  let listener;
  return {
    addListener(callback) {
      listener = callback;
    },
    get listener() {
      return listener;
    }
  };
}

function loadBackground(options = {}) {
  const calls = {
    created: [],
    hidden: [],
    removed: [],
    sentMessages: [],
    shown: [],
    stored: [],
    tabUpdates: [],
    windowUpdates: []
  };
  const events = {
    message: createEvent(),
    onConnect: createEvent(),
    onInstalled: createEvent(),
    startup: createEvent(),
    tabActivated: createEvent(),
    tabRemoved: createEvent(),
    windowFocusChanged: createEvent()
  };

  const storageGet = async (keys) => {
    if (options.storageGet) {
      const custom = await options.storageGet(keys);
      if (custom && custom.virtualDashboard !== undefined) {
        return custom;
      }
    }
    if (Array.isArray(keys) && keys.includes('virtualDashboard')) {
      return { virtualDashboard: true };
    }
    return options.storageGet ? options.storageGet(keys) : {};
  };

  const browser = {
    action: {
      setBadgeText: () => {},
      setBadgeBackgroundColor: () => {}
    },
    runtime: {
      getURL: (resource = '') => `moz-extension://tabsearch/${resource}`,
      onConnect: events.onConnect,
      onInstalled: events.onInstalled,
      onMessage: events.message,
      onStartup: events.startup,
      sendMessage: async (...args) => {
        calls.sentMessages.push(args);
        if (options.sendMessage) return options.sendMessage(...args);
        return undefined;
      }
    },
    storage: {
      local: {
        get: storageGet,
        set: async (value) => {
          calls.stored.push(value);
        },
        remove: async (keys) => {
          calls.storageRemoved = keys;
        }
      }
    },
    tabs: {
      create: async (createProperties) => {
        calls.created.push(createProperties);
        if (options.createTab) return options.createTab(createProperties);
        return { id: 50, windowId: createProperties.windowId, ...createProperties };
      },
      get: async (tabId) => {
        if (options.getTab) return options.getTab(tabId);
        return { id: tabId, windowId: 7 };
      },
      hide: async (tabIds) => {
        calls.hidden.push(tabIds);
        if (options.hideTabs) return options.hideTabs(tabIds);
        return undefined;
      },
      onActivated: events.tabActivated,
      onRemoved: events.tabRemoved,
      query: async (queryInfo) => {
        if (options.queryTabs) return options.queryTabs(queryInfo);
        return [];
      },
      remove: async (tabId) => {
        calls.removed.push(tabId);
      },
      show: async (tabIds) => {
        calls.shown.push(tabIds);
      },
      update: async (tabId, updateProperties) => {
        calls.tabUpdates.push([tabId, updateProperties]);
        return { id: tabId, ...updateProperties };
      }
    },
    windows: {
      WINDOW_ID_NONE: -1,
      getCurrent: async () => ({ id: 7 }),
      getLastFocused: async () => ({ id: 7 }),
      onFocusChanged: events.windowFocusChanged,
      update: async (windowId, updateProperties) => {
        calls.windowUpdates.push([windowId, updateProperties]);
        return { id: windowId, ...updateProperties };
      }
    }
  };

  const context = vm.createContext({
    browser,
    clearInterval,
    clearTimeout: options.clearTimeout || clearTimeout,
    console: { error() {}, log() {}, warn() {} },
    encodeURIComponent,
    module: { exports: {} },
    setInterval,
    setTimeout: options.setTimeout || ((callback) => {
      callback();
      return 1;
    })
  });
  vm.runInContext(BACKGROUND_SOURCE, context, { filename: 'background.js' });

  return { calls, context, events };
}

function backgroundFunction(context, functionName) {
  return vm.runInContext(functionName, context);
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

test('handleOpenDashboard creates an encoded dashboard URL in the active window', async () => {
  const { calls, context } = loadBackground();

  await backgroundFunction(context, 'handleOpenDashboard')('release notes & tabs');

  assert.deepEqual(plain(calls.created), [{
    url: 'moz-extension://tabsearch/search-results.html?q=release%20notes%20%26%20tabs',
    active: true,
    windowId: 7
  }]);
  assert.equal(calls.sentMessages.length, 0);
});

test('handleOpenDashboard reuses its cached singleton and focuses its original window', async () => {
  const { calls, context } = loadBackground();
  const handleOpenDashboard = backgroundFunction(context, 'handleOpenDashboard');

  await handleOpenDashboard('first');
  await handleOpenDashboard('second');

  assert.equal(calls.created.length, 1, 'a second dashboard tab must not be created');
  assert.deepEqual(plain(calls.sentMessages.at(-1)), [{ action: 'update-query', query: 'second' }]);
  assert.deepEqual(plain(calls.tabUpdates.at(-1)), [50, { active: true }]);
  assert.deepEqual(plain(calls.windowUpdates.at(-1)), [7, { focused: true }]);
});

test('handleOpenDashboard discovers an existing dashboard after its cached ID is lost', async () => {
  const existingDashboard = {
    id: 81,
    windowId: 12,
    url: 'moz-extension://tabsearch/search-results.html?q=old'
  };
  const { calls, context } = loadBackground({
    queryTabs: async () => [
      { id: 1, windowId: 2, url: 'https://example.com/search-results.html' },
      existingDashboard
    ]
  });

  await backgroundFunction(context, 'handleOpenDashboard')('new query');

  assert.equal(calls.created.length, 0);
  assert.deepEqual(plain(calls.tabUpdates), [[81, { active: true }]]);
  assert.deepEqual(plain(calls.windowUpdates), [[12, { focused: true }]]);
  assert.deepEqual(plain(calls.sentMessages), [[{ action: 'update-query', query: 'new query' }]]);
});

test('handleOpenDashboard recovers from a stale cached tab ID by creating a replacement', async () => {
  const { calls, context } = loadBackground({
    getTab: async () => { throw new Error('missing tab'); }
  });
  vm.runInContext('dashboardTabId = 999', context);

  await backgroundFunction(context, 'handleOpenDashboard')('replacement');

  assert.equal(calls.created.length, 1);
  assert.match(calls.created[0].url, /\?q=replacement$/);
});

test('activate-tab message focuses and activates the target, then closes the dashboard by default', async () => {
  const { calls, context, events } = loadBackground();
  await backgroundFunction(context, 'handleOpenDashboard')('query');

  await events.message.listener({
    action: 'activate-tab',
    tabId: 91,
    windowId: 13,
    closeDashboard: true
  }, {});

  assert.deepEqual(plain(calls.windowUpdates.at(-1)), [13, { focused: true }]);
  assert.deepEqual(plain(calls.tabUpdates.at(-1)), [91, { active: true }]);
  assert.deepEqual(calls.removed, [50]);
  assert.equal(vm.runInContext('dashboardTabId', context), null);
});

test('triggerInitialTabHide always creates, hides, and removes a temporary tab without touching real tabs', async () => {
  const tabs = [
    { id: 1, active: true, pinned: false, url: 'https://active.example/' },
    { id: 2, active: false, pinned: true, url: 'https://pinned.example/' },
    { id: 5, active: false, pinned: false, url: 'https://safe.example/' }
  ];
  const { calls, context } = loadBackground({
    storageGet: async () => ({ hasCompletedIntro: true, disableEmptyTab: false }),
    queryTabs: async () => tabs,
    createTab: async (createProperties) => ({ id: 99, windowId: 7, ...createProperties })
  });

  const granted = await backgroundFunction(context, 'triggerInitialTabHide')(false);

  assert.equal(granted, true);
  assert.deepEqual(plain(calls.created), [{ active: false, windowId: 7 }]);
  assert.deepEqual(plain(calls.hidden), [[99]]);
  assert.deepEqual(calls.removed, [99]);
  assert.equal(calls.shown.length, 0, 'real tabs must never be hidden or shown');
  assert.equal(calls.stored.length, 0, 'tabHideConfirmed must not be stored');
});

test('triggerInitialTabHide handles a failed trigger and cleans up its temporary tab in finally block', async () => {
  const { calls, context } = loadBackground({
    createTab: async (createProperties) => ({ id: 45, windowId: 7, ...createProperties }),
    hideTabs: async () => { throw new Error('permission denied'); }
  });

  const granted = await backgroundFunction(context, 'triggerInitialTabHide')(true);

  assert.equal(granted, false);
  assert.equal(calls.stored.length, 0, 'tabHideConfirmed must not be stored on failure');
  assert.deepEqual(calls.removed, [45]);
});

test('triggerInitialTabHide honors user opt-out without probing tabs and provides backwards-compatible alias', async () => {
  const optedOut = loadBackground({
    storageGet: async () => ({ disableEmptyTab: true })
  });
  const normal = loadBackground({
    storageGet: async () => ({ disableEmptyTab: false }),
    createTab: async (createProperties) => ({ id: 77, windowId: 7, ...createProperties })
  });

  assert.equal(await backgroundFunction(optedOut.context, 'triggerInitialTabHide')(false), false);
  assert.equal(await backgroundFunction(optedOut.context, 'verifyTabHidePermission')(false), false);
  assert.equal(optedOut.calls.created.length, 0);
  assert.equal(optedOut.calls.hidden.length, 0);

  assert.equal(await backgroundFunction(normal.context, 'triggerInitialTabHide')(false), true);
  assert.deepEqual(plain(normal.calls.created), [{ active: false, windowId: 7 }]);
  assert.deepEqual(plain(normal.calls.hidden), [[77]]);
  assert.deepEqual(normal.calls.removed, [77]);
});

test('triggerInitialTabHide force parameter bypasses disableEmptyTab opt-out', async () => {
  const forced = loadBackground({
    storageGet: async () => ({ disableEmptyTab: true }),
    createTab: async (createProperties) => ({ id: 66, windowId: 7, ...createProperties })
  });

  // Without force: should skip due to disableEmptyTab
  assert.equal(await backgroundFunction(forced.context, 'triggerInitialTabHide')(false), false);
  assert.equal(forced.calls.created.length, 0);

  // With force (e.g. from intro screen button click): should execute probe
  assert.equal(await backgroundFunction(forced.context, 'triggerInitialTabHide')(true), true);
  assert.deepEqual(plain(forced.calls.created), [{ active: false, windowId: 7 }]);
  assert.deepEqual(plain(forced.calls.hidden), [[66]]);
  assert.deepEqual(forced.calls.removed, [66]);
});

test('addon install / load never triggers tab hiding automatically', async () => {
  const { calls, events } = loadBackground({
    storageGet: async () => ({ virtualDashboard: false, disableEmptyTab: false }),
    createTab: async (createProperties) => ({ id: 99, windowId: 7, ...createProperties })
  });

  if (events.onInstalled.listener) {
    await events.onInstalled.listener({ reason: 'install' });
  }
  // Let any fire-and-forget async work settle before asserting.
  await new Promise(resolve => setImmediate(resolve));

  // Zero tabs created or hidden on install/load
  assert.equal(calls.created.length, 0);
  assert.equal(calls.hidden.length, 0);
});

test('runtime.onStartup triggers tab hiding via temporary tab when disableEmptyTab is false', async () => {
  const { calls, events } = loadBackground({
    storageGet: async () => ({ virtualDashboard: false, disableEmptyTab: false }),
    createTab: async (createProperties) => ({ id: 55, windowId: 7, ...createProperties })
  });

  await events.startup.listener();

  assert.deepEqual(plain(calls.created), [{ active: false, windowId: 7 }]);
  assert.deepEqual(plain(calls.hidden), [[55]]);
  assert.deepEqual(calls.removed, [55]);
});

test('runtime.onStartup skips tab hiding when disableEmptyTab is true', async () => {
  const { calls, events } = loadBackground({
    storageGet: async () => ({ virtualDashboard: false, disableEmptyTab: true }),
    createTab: async (createProperties) => ({ id: 55, windowId: 7, ...createProperties })
  });

  await events.startup.listener();

  assert.equal(calls.created.length, 0);
  assert.equal(calls.hidden.length, 0);
  assert.equal(calls.removed.length, 0);
});

test('runtime.onStartup skips tab hiding when virtualDashboard is true', async () => {
  const { calls, events } = loadBackground({
    storageGet: async () => ({ virtualDashboard: true, disableEmptyTab: false }),
    createTab: async (createProperties) => ({ id: 55, windowId: 7, ...createProperties })
  });

  await events.startup.listener();

  assert.equal(calls.created.length, 0);
  assert.equal(calls.hidden.length, 0);
  assert.equal(calls.removed.length, 0);
});

test('runtime.onStartup does not unhide hidden tabs if TabSearch saved search state is absent', async () => {
  const { calls, events } = loadBackground({
    storageGet: async () => ({ virtualDashboard: false, disableEmptyTab: true }),
    queryTabs: async () => [{ id: 10, hidden: true }],
    createTab: async (createProperties) => ({ id: 55, windowId: 7, ...createProperties })
  });

  await events.startup.listener();

  assert.equal(calls.shown.length, 0, 'Must not unhide tabs managed by other extensions');
});

test('runtime.onStartup restores tabs if TabSearch saved search state is present', async () => {
  const { calls, events } = loadBackground({
    storageGet: async () => ({
      virtualDashboard: false,
      disableEmptyTab: true,
      tstActiveSearchState: { active: true }
    }),
    queryTabs: async () => [{ id: 10, hidden: true }],
    createTab: async (createProperties) => ({ id: 55, windowId: 7, ...createProperties })
  });

  await events.startup.listener();

  assert.deepEqual(plain(calls.shown), [[10]]);
});

test('popup-closed triggers tab hiding via temporary tab when disableEmptyTab is not checked and virtualDashboard is false', async () => {
  const { calls, events } = loadBackground({
    storageGet: async () => ({ virtualDashboard: false, disableEmptyTab: false }),
    createTab: async (createProperties) => ({ id: 88, windowId: 7, ...createProperties })
  });

  await events.message.listener({ action: 'popup-closed' }, {});

  assert.deepEqual(plain(calls.created), [{ active: false, windowId: 7 }]);
  assert.deepEqual(plain(calls.hidden), [[88]]);
  assert.deepEqual(calls.removed, [88]);
});

test('popup-closed skips tab hiding when disableEmptyTab is checked', async () => {
  const { calls, events } = loadBackground({
    storageGet: async () => ({ virtualDashboard: false, disableEmptyTab: true }),
    createTab: async (createProperties) => ({ id: 88, windowId: 7, ...createProperties })
  });

  await events.message.listener({ action: 'popup-closed' }, {});

  assert.equal(calls.created.length, 0);
  assert.equal(calls.hidden.length, 0);
  assert.equal(calls.removed.length, 0);
});

test('popup-closed skips tab hiding when virtualDashboard is true', async () => {
  const { calls, events } = loadBackground({
    storageGet: async () => ({ virtualDashboard: true, disableEmptyTab: false }),
    createTab: async (createProperties) => ({ id: 88, windowId: 7, ...createProperties })
  });

  await events.message.listener({ action: 'popup-closed' }, {});

  assert.equal(calls.created.length, 0);
  assert.equal(calls.hidden.length, 0);
  assert.equal(calls.removed.length, 0);
});

test('popup-closed marks hasCompletedIntroPrompt true so intro never re-appears after clicking off', async () => {
  const { calls, events } = loadBackground({
    storageGet: async () => ({ hasCompletedIntroPrompt: false, disableEmptyTab: true })
  });

  await events.message.listener({ action: 'popup-closed' }, {});

  const storedIntro = calls.stored.find(item => item.hasCompletedIntroPrompt !== undefined);
  assert.ok(storedIntro, 'hasCompletedIntroPrompt must be persisted on popup close');
  assert.equal(storedIntro.hasCompletedIntroPrompt, true);
});

test('popup-lifecycle port disconnect triggers tab hiding when disableEmptyTab is not checked', async () => {
  const { calls, events } = loadBackground({
    storageGet: async () => ({ virtualDashboard: false, disableEmptyTab: false }),
    createTab: async (createProperties) => ({ id: 99, windowId: 7, ...createProperties })
  });

  const disconnectEvent = createEvent();
  const port = {
    name: 'popup-lifecycle',
    onDisconnect: disconnectEvent
  };

  events.onConnect.listener(port);
  await disconnectEvent.listener();

  assert.deepEqual(plain(calls.created), [{ active: false, windowId: 7 }]);
  assert.deepEqual(plain(calls.hidden), [[99]]);
  assert.deepEqual(calls.removed, [99]);
});

test('popup-lifecycle port disconnect skips tab hiding when disableEmptyTab is checked', async () => {
  const { calls, events } = loadBackground({
    storageGet: async () => ({ virtualDashboard: false, disableEmptyTab: true }),
    createTab: async (createProperties) => ({ id: 99, windowId: 7, ...createProperties })
  });

  const disconnectEvent = createEvent();
  const port = {
    name: 'popup-lifecycle',
    onDisconnect: disconnectEvent
  };

  events.onConnect.listener(port);
  await disconnectEvent.listener();

  assert.equal(calls.created.length, 0);
  assert.equal(calls.hidden.length, 0);
  assert.equal(calls.removed.length, 0);
});
