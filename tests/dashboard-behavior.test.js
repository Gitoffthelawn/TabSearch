const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const DASHBOARD_SOURCE = fs.readFileSync(
  path.join(__dirname, '..', 'src', 'search-results.js'),
  'utf8'
);

function loadDashboard(options = {}) {
  const calls = {
    find: [],
    messages: [],
    removed: [],
    tabUpdates: [],
    windowUpdates: []
  };
  const listeners = {
    onActivated: [],
    onAttached: [],
    onCreated: [],
    onDetached: [],
    onMoved: [],
    onRemoved: [],
    onUpdated: []
  };
  const browser = {
    find: {
      find: async (term, findOptions) => {
        calls.find.push([term, findOptions]);
        return options.find ? options.find(term, findOptions) : { count: 0 };
      }
    },
    runtime: options.runtime === false ? {} : {
      sendMessage: async (message) => {
        calls.messages.push(message);
      }
    },
    storage: {
      local: {
        get: async () => options.storedOptions || {},
        set: async () => {}
      }
    },
    tabs: {
      getCurrent: async () => options.currentTab === undefined ? { id: 99, windowId: 1 } : options.currentTab,
      query: async () => options.tabs || [],
      remove: async (tabId) => { calls.removed.push(tabId); },
      update: async (tabId, updateProperties) => {
        calls.tabUpdates.push([tabId, updateProperties]);
      },
      onActivated: { addListener: (fn) => listeners.onActivated.push(fn) },
      onAttached: { addListener: (fn) => listeners.onAttached.push(fn) },
      onCreated: { addListener: (fn) => listeners.onCreated.push(fn) },
      onDetached: { addListener: (fn) => listeners.onDetached.push(fn) },
      onMoved: { addListener: (fn) => listeners.onMoved.push(fn) },
      onRemoved: { addListener: (fn) => listeners.onRemoved.push(fn) },
      onUpdated: { addListener: (fn) => listeners.onUpdated.push(fn) }
    },
    windows: {
      getCurrent: async () => ({ id: options.activeWindowId || 1 }),
      update: async (windowId, updateProperties) => {
        calls.windowUpdates.push([windowId, updateProperties]);
      }
    }
  };

  const context = vm.createContext({
    browser,
    clearTimeout,
    console: { error() {}, log() {}, warn() {} },
    module: { exports: {} },
    setTimeout
  });
  vm.runInContext(DASHBOARD_SOURCE, context, { filename: 'search-results.js' });
  return { calls, context, listeners };
}

function dashboardFunction(context, functionName) {
  return vm.runInContext(functionName, context);
}

function dashboardState(context) {
  return JSON.parse(vm.runInContext(
    'JSON.stringify({ allTabs, matchedTabs, keepDashboardOpen, searchUrls, searchTitles, searchContents, fuzzySearch, fuzzyThreshold, collapsedWindows: Array.from(collapsedWindows) })',
    context
  ));
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

test('performSearch excludes the dashboard itself and augments title matches with page-content matches', async () => {
  const tabs = [
    { id: 99, windowId: 1, title: 'Dashboard', url: 'moz-extension://tabsearch/search-results.html' },
    { id: 1, windowId: 2, title: 'Needle documentation', url: 'https://docs.example/' },
    { id: 2, windowId: 3, title: 'Unrelated', url: 'https://content.example/' },
    { id: 3, windowId: 3, title: 'Protected', url: 'about:config' }
  ];
  const { calls, context } = loadDashboard({
    activeWindowId: 3,
    tabs,
    find: async (_term, { tabId }) => ({ count: tabId === 2 ? 1 : 0 })
  });
  const renderedWindowIds = [];
  context.captureRender = (windowId) => renderedWindowIds.push(windowId);
  vm.runInContext("currentQuery = 'needle'; searchContents = true; renderResults = captureRender", context);

  await dashboardFunction(context, 'performSearch')();

  const state = dashboardState(context);
  assert.deepEqual(state.allTabs.map(tab => tab.id), [1, 2, 3]);
  assert.deepEqual(state.matchedTabs.map(tab => tab.id), [1, 2]);
  assert.deepEqual(plain(calls.find), [['needle', { tabId: 2, caseSensitive: false }]]);
  assert.deepEqual(renderedWindowIds, [3]);
});

test('performSearch does not run page-content lookups for queries shorter than three characters', async () => {
  const { calls, context } = loadDashboard({
    tabs: [{ id: 1, windowId: 1, title: 'Other', url: 'https://example.com/' }],
    currentTab: null
  });
  context.captureRender = () => {};
  vm.runInContext("currentQuery = 'ab'; searchTitles = false; searchUrls = false; searchContents = true; renderResults = captureRender", context);

  await dashboardFunction(context, 'performSearch')();

  assert.equal(calls.find.length, 0);
  assert.deepEqual(dashboardState(context).matchedTabs, []);
});

test('performSearch caches content search results and avoids rescanning when query is unchanged', async () => {
  const tabs = [
    { id: 1, windowId: 1, title: 'Alpha', url: 'https://example.com/1' },
    { id: 2, windowId: 1, title: 'Beta', url: 'https://example.com/2' }
  ];
  const calls = { find: [] };
  const { context } = loadDashboard({
    tabs,
    currentTab: null,
    find: async (term, { tabId, caseSensitive }) => {
      calls.find.push([term, { tabId, caseSensitive }]);
      return { count: tabId === 2 ? 1 : 0 };
    }
  });
  context.captureRender = () => {};
  vm.runInContext("currentQuery = 'testquery'; searchContents = true; searchTitles = false; searchUrls = false; renderResults = captureRender", context);

  // First run: calls find for candidate tabs
  await dashboardFunction(context, 'performSearch')();
  assert.equal(calls.find.length, 2);
  assert.deepEqual(dashboardState(context).matchedTabs.map(t => t.id), [2]);

  // Second run with identical query (e.g. triggered by tab event): reuses cache without calling find again
  await dashboardFunction(context, 'performSearch')();
  assert.equal(calls.find.length, 2, 'Content search must not re-scan tabs when query is unchanged');
  assert.deepEqual(dashboardState(context).matchedTabs.map(t => t.id), [2]);
});

test('performSearch invalidates cached content match when matching tab navigates to a new URL', async () => {
  const tabs = [
    { id: 1, windowId: 1, title: 'Alpha', url: 'https://example.com/alpha' },
    { id: 2, windowId: 1, title: 'Beta', url: 'https://example.com/beta' }
  ];
  let betaHasMatch = true;
  const calls = { find: [] };
  const { context, listeners } = loadDashboard({
    tabs,
    currentTab: null,
    find: async (term, { tabId, caseSensitive }) => {
      calls.find.push([term, { tabId, caseSensitive }]);
      if (tabId === 2 && betaHasMatch) {
        return { count: 1 };
      }
      return { count: 0 };
    }
  });
  context.captureRender = () => {};
  vm.runInContext("currentQuery = 'testquery'; searchContents = true; searchTitles = false; searchUrls = false; renderResults = captureRender", context);

  // Initial search: tab 2 matches via content
  await dashboardFunction(context, 'performSearch')();
  assert.equal(calls.find.length, 2);
  assert.deepEqual(dashboardState(context).matchedTabs.map(t => t.id), [2]);

  // Tab 2 navigates to a new URL where it no longer contains matching content
  betaHasMatch = false;
  tabs[1].url = 'https://example.com/beta-navigated';
  listeners.onUpdated.forEach(fn => fn(2, { url: 'https://example.com/beta-navigated' }));

  // Re-run search with unchanged query: should re-scan only tab 2 and remove it from matchedTabs
  await dashboardFunction(context, 'performSearch')();
  assert.equal(calls.find.length, 3, 'Must scan only the navigated tab');
  assert.equal(calls.find[2][1].tabId, 2);
  assert.deepEqual(dashboardState(context).matchedTabs.map(t => t.id), []);
});

test('performSearch scans newly created and loaded tabs without rescanning existing cached tabs', async () => {
  const tabs = [
    { id: 1, windowId: 1, title: 'Alpha', url: 'https://example.com/alpha' }
  ];
  const calls = { find: [] };
  const { context, listeners } = loadDashboard({
    tabs,
    currentTab: null,
    find: async (term, { tabId, caseSensitive }) => {
      calls.find.push([term, { tabId, caseSensitive }]);
      return { count: 1 };
    }
  });
  context.captureRender = () => {};
  vm.runInContext("currentQuery = 'testquery'; searchContents = true; searchTitles = false; searchUrls = false; renderResults = captureRender", context);

  // Initial search: tab 1 is scanned and matches
  await dashboardFunction(context, 'performSearch')();
  assert.equal(calls.find.length, 1);
  assert.deepEqual(dashboardState(context).matchedTabs.map(t => t.id), [1]);

  // A new tab is created and finishes loading
  const newTab = { id: 2, windowId: 1, title: 'New Tab', url: 'https://example.com/new' };
  tabs.push(newTab);
  listeners.onCreated.forEach(fn => fn(newTab));
  listeners.onUpdated.forEach(fn => fn(2, { status: 'complete' }));

  // Re-run search: query is unchanged, tab 1 remains cached, only tab 2 is scanned
  await dashboardFunction(context, 'performSearch')();
  assert.equal(calls.find.length, 2, 'Only newly loaded tab should be scanned');
  assert.equal(calls.find[1][1].tabId, 2);
  assert.deepEqual(dashboardState(context).matchedTabs.map(t => t.id), [1, 2]);
});

test('performSearch cleans up cached matches when a matching tab is closed', async () => {
  const tabs = [
    { id: 1, windowId: 1, title: 'Alpha', url: 'https://example.com/alpha' },
    { id: 2, windowId: 1, title: 'Beta', url: 'https://example.com/beta' }
  ];
  const { context, listeners } = loadDashboard({
    tabs,
    currentTab: null,
    find: async (term, { tabId }) => ({ count: tabId === 2 ? 1 : 0 })
  });
  context.captureRender = () => {};
  vm.runInContext("currentQuery = 'testquery'; searchContents = true; searchTitles = false; searchUrls = false; renderResults = captureRender", context);

  // Initial search: tab 2 matches
  await dashboardFunction(context, 'performSearch')();
  assert.deepEqual(dashboardState(context).matchedTabs.map(t => t.id), [2]);

  // Tab 2 is closed
  tabs.splice(1, 1);
  listeners.onRemoved.forEach(fn => fn(2));

  // Re-run search
  await dashboardFunction(context, 'performSearch')();
  assert.deepEqual(dashboardState(context).matchedTabs.map(t => t.id), []);
});

test('loadStoredOptions applies persisted booleans, threshold, keep-open, and collapsed windows', async () => {
  const { context } = loadDashboard({
    storedOptions: {
      searchUrls: false,
      searchTitles: true,
      searchContents: true,
      fuzzySearch: true,
      fuzzyThreshold: '0.62',
      keepDashboardOpen: true,
      collapsedWindows: [4, 9]
    }
  });

  await dashboardFunction(context, 'loadStoredOptions')();

  assert.deepEqual(dashboardState(context), {
    allTabs: [],
    matchedTabs: [],
    keepDashboardOpen: true,
    searchUrls: false,
    searchTitles: true,
    searchContents: true,
    fuzzySearch: true,
    fuzzyThreshold: 0.62,
    collapsedWindows: [4, 9]
  });
});

test('activateTab delegates activation and requests dashboard closure by default', async () => {
  const { calls, context } = loadDashboard();

  await dashboardFunction(context, 'activateTab')({ id: 21, windowId: 8 });

  assert.deepEqual(plain(calls.messages), [{
    action: 'activate-tab',
    tabId: 21,
    windowId: 8,
    closeDashboard: true
  }]);
  assert.equal(calls.windowUpdates.length, 0, 'background messaging owns the activation transaction');
});

test('activateTab preserves the dashboard when keep-open is enabled', async () => {
  const { calls, context } = loadDashboard();
  vm.runInContext('keepDashboardOpen = true', context);

  await dashboardFunction(context, 'activateTab')({ id: 22, windowId: 9 });

  assert.equal(calls.messages[0].closeDashboard, false);
});

test('activateTab falls back to direct Firefox APIs when runtime messaging is unavailable', async () => {
  const { calls, context } = loadDashboard({
    runtime: false,
    currentTab: { id: 99, windowId: 1 }
  });

  await dashboardFunction(context, 'activateTab')({ id: 23, windowId: 10 });

  assert.deepEqual(plain(calls.windowUpdates), [[10, { focused: true }]]);
  assert.deepEqual(plain(calls.tabUpdates), [[23, { active: true }]]);
  assert.deepEqual(calls.removed, [99]);
});

test('dashboard onActivated listener ignores activations in other windows', async () => {
  const { calls, listeners } = loadDashboard({
    currentTab: { id: 99, windowId: 1 }
  });

  // Activation in a different window (window 2)
  await listeners.onActivated[0]({ tabId: 5, windowId: 2 });
  assert.equal(calls.removed.length, 0);
});

test('dashboard onActivated listener closes dashboard when another tab in same window activates', async () => {
  const { calls, listeners } = loadDashboard({
    currentTab: { id: 99, windowId: 1 }
  });

  // Activation in the same window (window 1)
  await listeners.onActivated[0]({ tabId: 5, windowId: 1 });
  assert.deepEqual(calls.removed, [99]);
});

