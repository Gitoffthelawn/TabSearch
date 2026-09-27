const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {
  addFlattenedState,
  removeFlattenedState,
  restoreTabsToInitialState,
  resetSearchTrackingState,
  STORAGE_KEY_TST_SEARCH_STATE
} = require('../src/background.js');

const BACKGROUND_SOURCE = fs.readFileSync(
  path.join(__dirname, '..', 'src', 'background.js'),
  'utf8'
);

test('addFlattenedState - normalizes array of Tab objects to numeric tab IDs', async () => {
  const sentMessages = [];
  global.browser = {
    runtime: {
      sendMessage: async (targetId, message) => {
        sentMessages.push({ targetId, message });
        return { success: true };
      }
    }
  };

  const tabObjects = [
    { id: 101, title: 'Tab 1', active: false },
    { id: 102, title: 'Tab 2', active: true }
  ];

  await addFlattenedState(tabObjects);

  assert.equal(sentMessages.length, 1);
  assert.equal(sentMessages[0].message.type, 'add-tab-state');
  assert.deepEqual(sentMessages[0].message.tabs, [101, 102]);
  assert.equal(sentMessages[0].message.state, 'flattened');
});

test('addFlattenedState - normalizes single numeric tab ID and returns a Promise', async () => {
  const sentMessages = [];
  global.browser = {
    runtime: {
      sendMessage: async (targetId, message) => {
        sentMessages.push({ targetId, message });
        return { success: true };
      }
    }
  };

  const promise = addFlattenedState(42);
  assert.ok(promise && typeof promise.then === 'function', 'addFlattenedState must return a Promise');
  await promise;

  assert.equal(sentMessages.length, 1);
  assert.deepEqual(sentMessages[0].message.tabs, [42]);
});

test('addFlattenedState - handles empty or invalid tab inputs without throwing', async () => {
  const sentMessages = [];
  global.browser = {
    runtime: {
      sendMessage: async (targetId, message) => {
        sentMessages.push({ targetId, message });
        return { success: true };
      }
    }
  };

  await addFlattenedState([]);
  await addFlattenedState([null, undefined, 'not-a-number']);

  assert.equal(sentMessages.length, 0, 'Must not send message when no valid IDs exist');
});

test('removeFlattenedState - normalizes array of Tab objects to numeric tab IDs and returns a Promise', async () => {
  const sentMessages = [];
  global.browser = {
    runtime: {
      sendMessage: async (targetId, message) => {
        sentMessages.push({ targetId, message });
        return { success: true };
      }
    }
  };

  const tabObjects = [
    { id: 201, title: 'Tab A' },
    { id: 202, title: 'Tab B' }
  ];

  const promise = removeFlattenedState(tabObjects);
  assert.ok(promise && typeof promise.then === 'function', 'removeFlattenedState must return a Promise');
  await promise;

  assert.equal(sentMessages.length, 1);
  assert.equal(sentMessages[0].message.type, 'remove-tab-state');
  assert.deepEqual(sentMessages[0].message.tabs, [201, 202]);
  assert.equal(sentMessages[0].message.state, 'flattened');
});

test('restoreTabsToInitialState - rehydrates TST state from storage when in-memory flags were lost', async () => {
  const sentMessages = [];
  const shownTabs = [];
  let storageRemovedKeys = [];

  const storedSnapshot = {
    active: true,
    flattenedApplied: true,
    originalTSTTreeStructureByWindow: {
      1: [{ id: 10, children: [{ id: 11 }] }]
    },
    collapsedParents: {
      1: [{ id: 10 }]
    }
  };

  let tab11Hidden = true;
  global.browser = {
    action: {
      setBadgeText: () => {},
      setBadgeBackgroundColor: () => {}
    },
    tabs: {
      query: async () => [
        { id: 10, hidden: false, windowId: 1 },
        { id: 11, hidden: tab11Hidden, windowId: 1 }
      ],
      show: async (ids) => {
        shownTabs.push(...ids);
        if (ids.includes(11)) {
          tab11Hidden = false;
        }
      }
    },
    windows: {
      getAll: async () => [{ id: 1 }]
    },
    storage: {
      local: {
        get: async (keys) => {
          if (keys.includes(STORAGE_KEY_TST_SEARCH_STATE)) {
            return { [STORAGE_KEY_TST_SEARCH_STATE]: storedSnapshot };
          }
          if (keys.includes('tstSupport')) {
            return { tstSupport: true };
          }
          return {};
        },
        remove: async (keys) => {
          storageRemovedKeys.push(...keys);
        }
      }
    },
    runtime: {
      sendMessage: async (targetId, message) => {
        sentMessages.push({ targetId, message });
        if (message.type === 'get-light-tree') {
          return [{ id: 10, children: [{ id: 11 }] }];
        }
        return { success: true };
      }
    }
  };

  await restoreTabsToInitialState();

  // 1. Hidden tab must be unhidden
  assert.deepEqual(shownTabs, [11]);

  // 2. remove-tab-state must be sent to TST
  const removeStateMsg = sentMessages.find(m => m.message.type === 'remove-tab-state');
  assert.ok(removeStateMsg, 'remove-tab-state must be dispatched to TST');
  assert.deepEqual(removeStateMsg.message.tabs, [10, 11]);

  // 3. collapse-tree must be sent to TST for window 1 using rehydrated snapshot
  const collapseMsg = sentMessages.find(m => m.message.type === 'collapse-tree');
  assert.ok(collapseMsg, 'collapse-tree must be dispatched using rehydrated collapsedParents');
  assert.equal(collapseMsg.message.window, 1);

  // 4. Stored search state must be removed from storage
  assert.ok(
    storageRemovedKeys.includes(STORAGE_KEY_TST_SEARCH_STATE),
    'tstActiveSearchState must be removed from storage after restoration'
  );
});

test('resetSearchTrackingState - cleans up persisted search state from storage', async () => {
  let removedKey = null;
  global.browser = {
    storage: {
      local: {
        remove: async (keys) => {
          removedKey = keys[0];
        }
      }
    }
  };

  resetSearchTrackingState();
  assert.equal(removedKey, STORAGE_KEY_TST_SEARCH_STATE);
});

test('popup-lifecycle port handles heartbeat and replies with heartbeat-ack', () => {
  let connectListener = null;
  const mockBrowser = {
    runtime: {
      onConnect: {
        addListener: (fn) => {
          connectListener = fn;
        }
      }
    }
  };

  const context = vm.createContext({
    browser: mockBrowser,
    clearInterval,
    clearTimeout,
    console: { error() {}, log() {}, warn() {} },
    encodeURIComponent,
    module: { exports: {} },
    setInterval,
    setTimeout
  });

  vm.runInContext(BACKGROUND_SOURCE, context, { filename: 'background.js' });

  assert.ok(typeof connectListener === 'function', 'Must register onConnect listener in background.js');

  let messageListener = null;
  const postedMessages = [];
  const mockPort = {
    name: 'popup-lifecycle',
    onMessage: {
      addListener: (fn) => {
        messageListener = fn;
      }
    },
    postMessage: (msg) => {
      postedMessages.push(msg);
    }
  };

  connectListener(mockPort);
  assert.ok(messageListener, 'Must register onMessage listener on popup-lifecycle port');

  messageListener({ type: 'heartbeat' });
  assert.deepEqual(JSON.parse(JSON.stringify(postedMessages)), [{ type: 'heartbeat-ack' }]);
});

