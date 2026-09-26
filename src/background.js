// TST integration (directly included for MV3 background)
const TST_ADDON_ID = 'TabSearch@irvinm.addons.mozilla.org';
const TST_ID = 'treestyletab@piro.sakura.ne.jp';
const TST_REGISTER_MESSAGE = {
  type: 'register-self',
  name: 'TabSearch',
  icons: {
    16: 'images/search16.png',
    32: 'images/search32.png',
    64: 'images/search64.png',
    128: 'images/search128.png'
  },
  permissions: [
    'tabs',
    'activeTab',
    'contextMenus'
  ],
  listeningTypes: [
    'ready',
    'kTSTAPI_NOTIFY_READY',
    'kTSTAPI_NOTIFY_SHUTDOWN'
  ],
  // Register the custom tab state and its CSS
  // See: https://github.com/piroor/treestyletab/wiki/API-for-other-addons#register-self
  // Remove all indentation and hide the twisty icon in flattened state
  style: `
    .tab.flattened:not(.pinned) {
      margin-left: 0 !important;
      margin-right: 0 !important;
    }
    .tab.flattened:not(.pinned) tab-twisty::before {
      display: none !important;
    }
    .tab.flattened:not(.pinned) tab-item-substance {
      margin-left: var(--shift-tabs-for-scrollbar-distance) !important;
      margin-right: var(--shift-tabs-for-scrollbar-distance) !important;
      width: calc(100% - var(--shift-tabs-for-scrollbar-distance) - var(--shift-tabs-for-scrollbar-distance)) !important;
      max-width: calc(100% - var(--shift-tabs-for-scrollbar-distance) - var(--shift-tabs-for-scrollbar-distance)) !important;
      box-sizing: border-box !important;
    }
  `,
}

// Constants for timing tolerances
const POPUP_CLOSE_GRACE_MS = 250; // grace period after popup closed
const RECENT_ACTIVATION_WINDOW_MS = 500; // window to consider a tab activation recent
const STORAGE_KEY_TST_SEARCH_STATE = 'tstActiveSearchState';
const CONTENT_SEARCH_BATCH_SIZE = 6;

/**
 * Registers TabSearch as an external listener/integrator with Tree Style Tab (TST).
 *
 * @returns {void}
 */
function registerWithTST() {
  if (tstRegistered) return;
  if (!browser || !browser.runtime || !browser.runtime.sendMessage) return;
  browser.runtime.sendMessage(TST_ID, TST_REGISTER_MESSAGE)
    .then(response => {
      console.log('[TabSearch][TST] Registered with TST:', response);
      tstRegistered = true;
    })
    .catch(err => {
      console.warn('[TabSearch][TST] Could not register with TST:', err);
    });
}

/**
 * Adds the 'flattened' visual state to specified tab(s) via TST runtime messaging.
 * Normalizes input to numeric tab IDs to handle individual IDs, ID arrays, or tab objects.
 *
 * @param {number|browser.tabs.Tab|Array<number|browser.tabs.Tab>} tabId - Single tab ID/object or array of tab IDs/objects to flatten.
 * @returns {Promise<void>} Resolves when the message is processed by TST.
 */
function addFlattenedState(tabId) {
  const tabIds = (Array.isArray(tabId) ? tabId : [tabId])
    .map(t => (typeof t === 'object' && t !== null && 'id' in t ? t.id : t))
    .filter(id => typeof id === 'number' && !isNaN(id));

  if (tabIds.length === 0) return Promise.resolve();

  return browser.runtime.sendMessage(TST_ID, {
    type: 'add-tab-state',
    tabs: tabIds,
    state: 'flattened'
  }).then(() => {
    console.log('[TabSearch][TST] Added flattened state to tabs', tabIds);
  }).catch(err => {
    console.warn('[TabSearch][TST] Failed to add flattened state:', err);
  });
}

/**
 * Removes the 'flattened' visual state from specified tab(s) via TST runtime messaging.
 * Normalizes input to numeric tab IDs to handle individual IDs, ID arrays, or tab objects.
 *
 * @param {number|browser.tabs.Tab|Array<number|browser.tabs.Tab>} tabId - Single tab ID/object or array of tab IDs/objects to un-flatten.
 * @returns {Promise<void>} Resolves when the message is processed by TST.
 */
function removeFlattenedState(tabId) {
  const tabIds = (Array.isArray(tabId) ? tabId : [tabId])
    .map(t => (typeof t === 'object' && t !== null && 'id' in t ? t.id : t))
    .filter(id => typeof id === 'number' && !isNaN(id));

  flattenedStateAppliedThisSearch = false;
  if (tabIds.length === 0) return Promise.resolve();

  return browser.runtime.sendMessage(TST_ID, {
    type: 'remove-tab-state',
    tabs: tabIds,
    state: 'flattened'
  }).then(() => {
    console.log('[TabSearch][TST] Removed flattened state from tabs', tabIds);
  }).catch(err => {
    console.warn('[TabSearch][TST] Failed to remove flattened state:', err);
  });
}

/**
 * Triggers an initial transient tab hide to prompt Firefox's native tab-hiding doorhanger
 * if tab hiding is enabled and not opted out via user settings.
 * Always creates a temporary background tab that is immediately hidden and removed
 * so that no user tabs are ever disturbed, shifted, or flickered.
 *
 * @param {boolean} [force=false] - Whether to bypass the disableEmptyTab check.
 * @returns {Promise<boolean>} Resolves to true if the initial tab hide succeeded, false otherwise.
 */
let isTriggeringInitialHide = false;

async function triggerInitialTabHide(force = false) {
  if (
    typeof browser === 'undefined' || 
    !browser.tabs || !browser.tabs.hide || !browser.tabs.create || !browser.tabs.remove || !browser.windows ||
    !browser.storage || !browser.storage.local
  ) {
    return false;
  }

  if (isTriggeringInitialHide) {
    console.log('[TabSearch] Initial tabHide trigger already in progress; skipping duplicate.');
    return false;
  }

  isTriggeringInitialHide = true;
  try {
    const items = await browser.storage.local.get(['disableEmptyTab']);
    if (items.disableEmptyTab && !force) {
      console.log('[TabSearch] Initial tabHide trigger disabled by user setting.');
      return false;
    }

    console.log('[TabSearch] Triggering initial tabHide doorhanger prompt via temporary tab...');
    let win = null;
    try {
      if (typeof browser.windows.getLastFocused === 'function') {
        win = await browser.windows.getLastFocused({ windowTypes: ['normal'] }).catch(() => null);
      }
    } catch {
      win = null;
    }
    if (!win || !win.id) {
      try {
        if (typeof browser.windows.getCurrent === 'function') {
          win = await browser.windows.getCurrent().catch(() => null);
        }
      } catch {
        win = null;
      }
    }
    const createInfo = win && win.id ? { active: false, windowId: win.id } : { active: false };
    const tempTab = await browser.tabs.create(createInfo);

    try {
      await browser.tabs.hide([tempTab.id]);
      console.log('[TabSearch] Initial tabHide trigger executed successfully.');
      return true;
    } catch (hideErr) {
      console.warn('[TabSearch] Initial tabHide trigger failed:', hideErr);
      return false;
    } finally {
      await browser.tabs.remove(tempTab.id).catch(() => {});
    }
  } catch (err) {
    console.error('[TabSearch] Error in triggerInitialTabHide:', err);
    return false;
  } finally {
    isTriggeringInitialHide = false;
  }
}

/**
 * Backwards-compatible alias for triggerInitialTabHide.
 *
 * @param {boolean} [force=false] - Whether to bypass the disableEmptyTab check.
 * @returns {Promise<boolean>} Resolves to true if tab hiding succeeded.
 */
function verifyTabHidePermission(force = false) {
  return triggerInitialTabHide(force);
}

// Clean up deprecated keys from local storage
if (typeof browser !== 'undefined' && browser.storage && browser.storage.local) {
  if (typeof browser.storage.local.remove === 'function') {
    browser.storage.local.remove('tabHideConfirmed').catch(() => {});
  }
}

// Reset intro prompt flag on fresh install so the intro popup appears on first click
if (typeof browser !== 'undefined' && browser.runtime && browser.runtime.onInstalled) {
  browser.runtime.onInstalled.addListener((details) => {
    if (details.reason === 'install') {
      browser.storage.local.set({ hasCompletedIntroPrompt: false }).catch(() => {});
    }
  });
}

// On browser startup (fired when the browser profile starts, not on install),
// recover any dangling search state from previous session or crash, and attempt tab hide
// to trigger the Firefox permission prompt unless disabled by user
if (typeof browser !== 'undefined' && browser.runtime && browser.runtime.onStartup) {
  browser.runtime.onStartup.addListener(async () => {
    if (browser.storage && browser.storage.local) {
      try {
        // Check for dangling hidden tabs or un-restored TST state from a browser crash/shutdown
        const items = await browser.storage.local.get(['disableEmptyTab', 'virtualDashboard', STORAGE_KEY_TST_SEARCH_STATE]);
        if (items[STORAGE_KEY_TST_SEARCH_STATE]) {
          console.log('[TabSearch] Detected dangling search state on startup; restoring tabs...');
          await restoreTabsToInitialState();
        }

        if (!items.disableEmptyTab && !items.virtualDashboard) {
          await triggerInitialTabHide(false);
        }
      } catch (err) {
        console.warn('[TabSearch] onStartup tabHide trigger error:', err);
      }
    }
  });
}

let progressInterval = null;
let tabsToProcess = 0;
let searchInProgress = false;
let pendingSearchMsg = null;
let lastMatchedTabIds = [];
let dashboardTabId = null; // Singleton tab ID for the virtual dashboard
let isActivatingTab = false; // Flag to prevent window focus changes from tearing down dashboard prematurely
let originalTSTTreeStructureByWindow = {};     // Store the original TST tree structure for restoring after search, per window
let originalTSTTreeSnapshotTaken = false; // overall flag

let snapshotInProgress = false;                // Flag to avoid concurrent snapshots
let tstRegistered = false;                     // Flag to ensure TST is only registered once per session
let treesExpandedThisSearch = {};              // Flag to ensure trees are only expanded once per window per search
let flattenedStateAppliedThisSearch = false;   // Flag to ensure flattened state is only added once per search
let parents = {};
let collapsedParents = {};
let children = {};
let recentTabActivation = null;  // Track recent tab activations with timestamp

/**
 * Updates the extension badge text and background color to reflect hidden tab counts.
 *
 * @param {number} count - Number of hidden tabs (0 clears badge).
 * @returns {void}
 */
function updateBadge(count) {
  browser.action.setBadgeText({ text: count > 0 ? String(count) : '' });
  browser.action.setBadgeBackgroundColor({ color: '#2366d1' });
}

/**
 * Starts a recurring progress indicator polling getCountFn to dynamically update the badge text.
 *
 * @param {function(): Promise<number>} getCountFn - Asynchronous function returning remaining tab count.
 * @returns {void}
 */
function startProgressIndicator(getCountFn) {
  if (progressInterval) clearInterval(progressInterval);
  progressInterval = setInterval(async () => {
    const count = await getCountFn();
    updateBadge(count);
    if (count === 0) {
      clearInterval(progressInterval);
      progressInterval = null;
      updateBadge(0);
    }
  }, 500); // Update 2 times a second
}

/**
 * Restores all tabs to their unhidden state and restores TST tree structures and tab flattening.
 *
 * @param {number|null} [recentActivationToPreserve=null] - Optional tab ID of a recently activated tab to preserve.
 * @returns {Promise<void>} Resolves when tabs and TST tree states are restored.
 */
async function restoreTabsToInitialState(recentActivationToPreserve = null) {
  // Check if in-memory TST state was wiped (e.g. event page restarted during search)
  // and rehydrate from persistent storage if available
  if (!originalTSTTreeSnapshotTaken && !flattenedStateAppliedThisSearch) {
    if (typeof browser !== 'undefined' && browser.storage && browser.storage.local) {
      try {
        const items = await browser.storage.local.get([STORAGE_KEY_TST_SEARCH_STATE]);
        const persistedState = items[STORAGE_KEY_TST_SEARCH_STATE];
        if (persistedState && persistedState.active) {
          console.log('[TabSearch][TST] Rehydrating TST search state from storage...');
          flattenedStateAppliedThisSearch = !!persistedState.flattenedApplied;
          if (persistedState.originalTSTTreeStructureByWindow && Object.keys(persistedState.originalTSTTreeStructureByWindow).length > 0) {
            originalTSTTreeStructureByWindow = persistedState.originalTSTTreeStructureByWindow;
            originalTSTTreeSnapshotTaken = true;
            parents = persistedState.parents || {};
            children = persistedState.children || {};
            collapsedParents = persistedState.collapsedParents || {};
          }
        }
      } catch (err) {
        console.warn('[TabSearch][TST] Error rehydrating TST state from storage:', err);
      }
    }
  }

  const allTabs = await browser.tabs.query({});
  const allTabIds = allTabs.map(tab => tab.id);

  // Check user preference for TST support to provide an additional safety net
  let tstSupportEnabled = false;
  if (typeof browser !== 'undefined' && browser.storage && browser.storage.local) {
    try {
      const prefs = await browser.storage.local.get(['tstSupport']);
      tstSupportEnabled = !!prefs.tstSupport;
    } catch {}
  }

  // If flattened state was applied or TST support is enabled and any tabs were hidden,
  // ensure flattened state is stripped from all tabs and awaited before proceeding.
  const hiddenTabsExist = allTabs.some(tab => tab.hidden);
  if (flattenedStateAppliedThisSearch || (tstSupportEnabled && hiddenTabsExist)) {
    await removeFlattenedState(allTabIds);
  }

  try {
    const hiddenTabIds = allTabs.filter(tab => tab.hidden).map(tab => tab.id);
    if (hiddenTabIds.length > 0) {
      updateBadge(hiddenTabIds.length);
      startProgressIndicator(async () => {
        const tabsNow = await browser.tabs.query({});
        return tabsNow.filter(tab => tab.hidden).length;
      });
      console.log(`[TabSearch] Showing ${hiddenTabIds.length} hidden tabs:`, hiddenTabIds);
      await browser.tabs.show(hiddenTabIds);
      updateBadge(0);
      if (progressInterval) {
        clearInterval(progressInterval);
        progressInterval = null;
      }
    } else {
      updateBadge(0);
      if (progressInterval) {
        clearInterval(progressInterval);
        progressInterval = null;
      }
    }
  } catch (e) {
    updateBadge(0);
    if (progressInterval) {
      clearInterval(progressInterval);
      progressInterval = null;
    }
  }

  if (originalTSTTreeSnapshotTaken) {
    try {
      const activeTabsByWindow = {};
      const allWindows = await browser.windows.getAll({ populate: false });
      for (const window of allWindows) {
        const tabsInWindow = await browser.tabs.query({ windowId: window.id, active: true });
        if (tabsInWindow.length > 0) {
          activeTabsByWindow[window.id] = tabsInWindow[0].id;
        }
      }

      for (const [windowId, treeStructure] of Object.entries(originalTSTTreeStructureByWindow)) {
        try {
          let tabIdToPreserve;

          if (recentActivationToPreserve && recentActivationToPreserve.windowId === Number(windowId)) {
            tabIdToPreserve = recentActivationToPreserve.tabId;
            console.log(`[TabSearch][TST] Window ${windowId}: Will preserve manually selected tab ${tabIdToPreserve}`);
          } else {
            tabIdToPreserve = activeTabsByWindow[windowId];
            if (tabIdToPreserve) {
              console.log(`[TabSearch][TST] Window ${windowId}: Will preserve currently active tab ${tabIdToPreserve}`);
            }
          }

          let parentsToKeepExpanded = new Set();

          if (tabIdToPreserve && collapsedParents[windowId] && collapsedParents[windowId].length > 0) {
            try {
              const currentTree = await browser.runtime.sendMessage(TST_ID, {
                type: 'get-light-tree',
                tabs: '*',
                window: Number(windowId)
              });

              if (currentTree && Array.isArray(currentTree)) {
                const tabIdToNode = {};
                currentTree.forEach(node => { tabIdToNode[node.id] = node; });
                const tabNode = tabIdToNode[tabIdToPreserve];

                if (tabNode && tabNode.ancestorTabIds && tabNode.ancestorTabIds.length > 0) {
                  const collapsedParentIds = collapsedParents[windowId].map(parent => parent.id);

                  for (const ancestorId of tabNode.ancestorTabIds) {
                    if (collapsedParentIds.includes(ancestorId)) {
                      parentsToKeepExpanded.add(ancestorId);
                    }
                  }
                }
              }
            } catch (e) {
              console.warn('[TabSearch][TST] Failed to get current tree structure for tab visibility check:', e);
            }
          }

          const parentsToCollapse = collapsedParents[windowId].filter(parent => !parentsToKeepExpanded.has(parent.id));

          if (parentsToCollapse.length > 0) {
            await browser.runtime.sendMessage(TST_ID, {
              type: 'collapse-tree',
              window: Number(windowId),
              tabs: parentsToCollapse,
              recursively: false
            });
          }
        } catch (e) {
          console.warn(`[TabSearch][TST] Failed to restore tree for window ${windowId}:`, e);
        } finally {
          parents[windowId] = [];
          children[windowId] = [];
          collapsedParents[windowId] = [];
          treesExpandedThisSearch[windowId] = {};
        }
      }
    } catch (e) {
      console.warn('[TabSearch][TST] Failed to restore tree collapsed/expanded state:', e);
    }
  }

  // Clear persisted TST search state from storage now that restoration is complete
  if (typeof browser !== 'undefined' && browser.storage && browser.storage.local) {
    try {
      await browser.storage.local.remove([STORAGE_KEY_TST_SEARCH_STATE]);
    } catch (err) {
      console.warn('[TabSearch] Error clearing persisted TST search state:', err);
    }
  }
}

/**
 * Resets all in-memory search tracking, TST snapshot structures, and mutex flags.
 * Also cleans up any persisted TST search snapshot in local storage.
 *
 * @returns {void}
 */
function resetSearchTrackingState() {
  parents = {};
  children = {};
  collapsedParents = {};
  treesExpandedThisSearch = {};
  originalTSTTreeStructureByWindow = {};
  originalTSTTreeSnapshotTaken = false;
  snapshotInProgress = false;
  flattenedStateAppliedThisSearch = false;
  recentTabActivation = null;
  if (progressInterval) {
    clearInterval(progressInterval);
    progressInterval = null;
  }
  if (typeof browser !== 'undefined' && browser.storage && browser.storage.local) {
    browser.storage.local.remove([STORAGE_KEY_TST_SEARCH_STATE]).catch(() => {});
  }
}

/**
 * Calculates toHide and toShow tab ID arrays while strictly enforcing Firefox tabHide safety rules:
 * - Active tabs (tab.active === true) MUST NEVER be hidden.
 * - Pinned tabs (tab.pinned === true) MUST NEVER be hidden.
 *
 * @param {Array<browser.tabs.Tab>} allTabs - Complete array of tab objects to evaluate.
 * @param {Array<number>} matchedTabIds - Array of tab IDs that matched search criteria.
 * @returns {{toHide: Array<number>, toShow: Array<number>}} Object containing arrays of tab IDs to hide and show.
 */
function calculateTabsToHideAndShow(allTabs, matchedTabIds) {
  const matchedSet = new Set(matchedTabIds || []);
  const toHide = [];
  const toShow = [];

  for (const tab of allTabs) {
    const isMatch = matchedSet.has(tab.id);
    if (!isMatch && !tab.active && !tab.pinned) {
      if (!tab.hidden) toHide.push(tab.id);
    } else {
      if (tab.hidden) toShow.push(tab.id);
    }
  }

  return { toHide, toShow };
}

/**
 * Recursively traverses a Tree Style Tab (TST) node tree, identifying parents, leaf children,
 * and collapsed subtrees at any nesting depth.
 *
 * @param {Array<Object>} nodes - Array of TST tree node objects.
 * @param {Array<Object>} [parentsList=[]] - Accumulator array for parent nodes.
 * @param {Array<Object>} [childrenList=[]] - Accumulator array for leaf children.
 * @param {Array<Object>} [collapsedParentsList=[]] - Accumulator array for collapsed parent nodes.
 * @returns {{parents: Array<Object>, children: Array<Object>, collapsedParents: Array<Object>}} Flattened and categorized nodes.
 */
function walkTSTTree(nodes, parentsList = [], childrenList = [], collapsedParentsList = []) {
  if (!nodes || !Array.isArray(nodes)) {
    return { parents: parentsList, children: childrenList, collapsedParents: collapsedParentsList };
  }
  for (const node of nodes) {
    if (node.children && node.children.length > 0) {
      parentsList.push(node);
      if (node.states && node.states.includes("subtree-collapsed")) {
        collapsedParentsList.push(node);
      }
      walkTSTTree(node.children, parentsList, childrenList, collapsedParentsList);
    } else {
      childrenList.push(node);
    }
  }
  return { parents: parentsList, children: childrenList, collapsedParents: collapsedParentsList };
}

/**
 * Core search processor that executes tab searches, updates TST trees, hides/shows tabs, and selects matching tabs.
 *
 * @param {Object} msg - The search-tabs message payload.
 * @returns {Promise<void>} Resolves when search execution and tab state adjustments complete.
 */
async function executeSearch(msg) {
  let currentMsg = msg;
  while (currentMsg) {
    searchInProgress = true;
    try {
      const options = await browser.storage.local.get(['tstSupport']);
      const tstEnabled = options.tstSupport;

      if (tstEnabled) {
        // Register with TST (only once per session)
        registerWithTST();
        // Only take a snapshot if we haven't already in this session
        if (!originalTSTTreeSnapshotTaken && !snapshotInProgress) {
          snapshotInProgress = true;
          try {
            const allWindows = await browser.windows.getAll();
            let allValid = true;
            for (const win of allWindows) {
              const tree = await browser.runtime.sendMessage(TST_ID, {
                type: 'get-light-tree',
                window: win.id,
                tabs: '*'
              });
              if (tree !== null && tree !== undefined) {
                originalTSTTreeStructureByWindow[win.id] = tree;

                // Initialize/Reset tracking for this window
                parents[win.id] = [];
                children[win.id] = [];
                collapsedParents[win.id] = [];

                // Recursively traverse the TST tree so nested parents/collapsed
                // subtrees at any depth are correctly recorded.
                walkTSTTree(tree, parents[win.id], children[win.id], collapsedParents[win.id]);
                console.log(`[TabSearch][TST] Window ${win.id}: Found ${parents[win.id].length} parents, ${collapsedParents[win.id].length} collapsed.`);
              } else {
                allValid = false;
                console.warn(`[TabSearch][TST] Received invalid tree structure for window ${win.id}:`, tree);
              }
            }
            originalTSTTreeSnapshotTaken = Object.keys(originalTSTTreeStructureByWindow).length > 0;
            if (originalTSTTreeSnapshotTaken) {
              console.log(`[TabSearch][TST] Successfully snapshotted windows:`, Object.keys(originalTSTTreeStructureByWindow).join(', '));
            }
            if (!allValid) {
              console.warn(`[TabSearch][TST] Some windows failed to snapshot.`);
            }
          } catch (e) {
            console.warn('[TabSearch][TST] Failed to get original tree structure:', e);
          } finally {
            snapshotInProgress = false;
          }
        }

        // After all tab hiding/unhiding is complete, add flattened state to all visible tabs (TST)
        if (!flattenedStateAppliedThisSearch) {
          console.log('[TabSearch][TST] Adding flattened state to all tabs');
          const allTabs = await browser.tabs.query({});
          if (allTabs.length > 0) {
            await addFlattenedState(allTabs);
          }
          flattenedStateAppliedThisSearch = true;
        }

        // Persist TST snapshot and flattened state to storage to survive event page idle timeouts
        if (originalTSTTreeSnapshotTaken || flattenedStateAppliedThisSearch) {
          try {
            await browser.storage.local.set({
              [STORAGE_KEY_TST_SEARCH_STATE]: {
                active: true,
                flattenedApplied: flattenedStateAppliedThisSearch,
                originalTSTTreeStructureByWindow,
                parents,
                children,
                collapsedParents,
                timestamp: Date.now()
              }
            });
          } catch (storageErr) {
            console.warn('[TabSearch] Failed to persist TST search state:', storageErr);
          }
        }

        // Defensive check: only proceed with expansion if we successfully snapshotted the state
        if (originalTSTTreeSnapshotTaken) {
          // Expand all trees for all tabs in all windows before search (only once per window per search)
          const allWindows = await browser.windows.getAll();
          for (const win of allWindows) {
            // Double check flag in case search was reset during window query
            if (!originalTSTTreeStructureByWindow[win.id]) continue;

            if (!treesExpandedThisSearch[win.id]) {
              try {
                await browser.runtime.sendMessage(TST_ID, {
                  type: 'expand-tree',
                  window: win.id,
                  tabs: '*',
                  recursively: true
                });
                console.log(`[TabSearch][TST] Expanded all trees in window ${win.id}`);
                treesExpandedThisSearch[win.id] = true;
              } catch (err) {
                console.warn(`[TabSearch][TST] Failed to expand trees in window ${win.id}:`, err);
              }
            }
          }
        } else {
          console.warn('[TabSearch][TST] Skipping expansion: No valid snapshot of original state.');
        }
      }

      const term = currentMsg.term.toLowerCase();
      const searchUrls = currentMsg.searchUrls;
      const searchTitles = currentMsg.searchTitles;
      const searchContents = currentMsg.searchContents;
      const fuzzySearch = currentMsg.fuzzySearch;
      const fuzzyThreshold = (currentMsg.fuzzyThreshold !== undefined) ? currentMsg.fuzzyThreshold : 0.35;
      const tabs = await browser.tabs.query({});
      let toHide = [];
      let toShow = [];
      // If the search term is empty, restore everything to initial state and return
      if (!term) {
        lastMatchedTabIds = [];
        try {
          await restoreTabsToInitialState();
        } finally {
          resetSearchTrackingState();
        }
        return;
      }
      let matchedTabIds = [];

      if (fuzzySearch && (searchTitles || searchUrls)) {
        const fuseKeys = [];
        if (searchTitles) fuseKeys.push('title');
        if (searchUrls) fuseKeys.push('url');

        const fuse = new Fuse(tabs, {
          keys: fuseKeys,
          threshold: fuzzyThreshold,
          distance: 100,
          ignoreLocation: true,
          useTokenSearch: true
        });

        const results = fuse.search(term);
        matchedTabIds = results.map(r => r.item.id);
      } else {
        for (const tab of tabs) {
          const title = (tab.title || '').toLowerCase();
          const url = (tab.url || '').toLowerCase();
          let matches = false;
          if (searchTitles && title.includes(term)) matches = true;
          if (searchUrls && url.includes(term)) matches = true;
          if (matches) matchedTabIds.push(tab.id);
        }
      }

      // Content search with bounded concurrency (not fuzzy)
      if (searchContents && term.length >= 3 && browser.find && browser.find.find) {
        const candidateTabs = tabs.filter(tab =>
          !matchedTabIds.includes(tab.id) && tab.url && tab.url.startsWith('http')
        );

        for (let i = 0; i < candidateTabs.length; i += CONTENT_SEARCH_BATCH_SIZE) {
          const chunk = candidateTabs.slice(i, i + CONTENT_SEARCH_BATCH_SIZE);
          const results = await Promise.allSettled(
            chunk.map(async (tab) => {
              try {
                const findResult = await browser.find.find(term, { tabId: tab.id, caseSensitive: false });
                if (findResult && findResult.count && findResult.count > 0) {
                  return tab.id;
                }
              } catch (e) {
                console.warn('[TabSearch] Operation failed:', e);
              }
              return null;
            })
          );
          for (const res of results) {
            if (res.status === 'fulfilled' && res.value !== null) {
              matchedTabIds.push(res.value);
            }
          }
        }
      }

      // Determine final toHide and toShow lists based on matchedTabIds
      const partitioned = calculateTabsToHideAndShow(tabs, matchedTabIds);
      toHide = partitioned.toHide;
      toShow = partitioned.toShow;
      lastMatchedTabIds = matchedTabIds;
      // Progress indicator: set badge to number of tabs to hide or unhide
      let totalToProcess = toHide.length + toShow.length;
      updateBadge(totalToProcess);
      if (totalToProcess > 0) {
        startProgressIndicator(async () => {
          const allTabs = await browser.tabs.query({});
          // Count tabs that are still not hidden but should be hidden, and tabs that are still hidden but should be shown
          const stillToHide = toHide.filter(id => {
            const t = allTabs.find(tab => tab.id === id);
            return t && !t.hidden;
          }).length;
          const stillToShow = toShow.filter(id => {
            const t = allTabs.find(tab => tab.id === id);
            return t && t.hidden;
          }).length;
          return stillToHide + stillToShow;
        });
      } else {
        updateBadge(0);
        if (progressInterval) {
          clearInterval(progressInterval);
          progressInterval = null;
        }
      }

      // Hide tabs that don't match
      if (toHide.length > 0) {
        try {
          console.log(`[TabSearch] Hiding ${toHide.length} tabs:`, toHide);
          await browser.tabs.hide(toHide);
        } catch (e) { console.warn('[TabSearch] Operation failed:', e); }
      }
      // Unhide tabs that now match
      if (toShow.length > 0) {
        try {
          await browser.tabs.show(toShow);
        } catch (e) { console.warn('[TabSearch] Operation failed:', e); }
      }
    } finally {
      searchInProgress = false;
    }
    currentMsg = pendingSearchMsg;
    pendingSearchMsg = null;
  }
}
/**
 * Handles opening or focusing the singleton Virtual Results Dashboard tab.
 *
 * @param {string} query - The search query term to seed into the dashboard.
 * @returns {Promise<void>} Resolves when the dashboard tab is created, updated, or focused.
 */
async function handleOpenDashboard(query) {
  const url = browser.runtime.getURL('search-results.html') + '?q=' + encodeURIComponent(query || '');
  
  if (dashboardTabId !== null) {
    try {
      const tab = await browser.tabs.get(dashboardTabId);
      // Dashboard already exists: send update message, activate tab, focus its window
      try {
        await browser.runtime.sendMessage({ action: 'update-query', query: query });
      } catch (err) {
        console.warn('[TabSearch] Failed to send update-query message (tab might be loading):', err);
      }
      await browser.tabs.update(dashboardTabId, { active: true });
      const winUpdate = { focused: true };
      if (browser.windows.get) {
        const targetWin = await browser.windows.get(tab.windowId).catch(() => null);
        if (targetWin && targetWin.state === 'minimized') {
          winUpdate.state = 'normal';
        }
      }
      await browser.windows.update(tab.windowId, winUpdate);
      return;
    } catch (e) {
      console.log('[TabSearch] Dashboard tab with cached ID not found, performing query search...');
      dashboardTabId = null;
    }
  }
  
  // Fallback: search for existing results tab by URL
  try {
    const dashboardBaseUrl = browser.runtime.getURL('search-results.html');
    const tabs = await browser.tabs.query({});
    const existingTab = tabs.find(t => {
      if (!t.url) return false;
      return t.url === dashboardBaseUrl ||
             t.url.startsWith(dashboardBaseUrl + '?') ||
             t.url.startsWith(dashboardBaseUrl + '#');
    });
    if (existingTab) {
      dashboardTabId = existingTab.id;
      try {
        await browser.runtime.sendMessage({ action: 'update-query', query: query });
      } catch (err) {
        console.warn('[TabSearch] Failed to send update-query to existing tab:', err);
      }
      await browser.tabs.update(dashboardTabId, { active: true });
      const winUpdate = { focused: true };
      if (browser.windows.get) {
        const targetWin = await browser.windows.get(existingTab.windowId).catch(() => null);
        if (targetWin && targetWin.state === 'minimized') {
          winUpdate.state = 'normal';
        }
      }
      await browser.windows.update(existingTab.windowId, winUpdate);
      return;
    }
  } catch (e) {
    console.warn('[TabSearch] Error checking for existing search results tab:', e);
  }
  
  // Create a new dashboard tab in the active window
  try {
    const activeWin = await browser.windows.getLastFocused();
    const newTab = await browser.tabs.create({ url: url, active: true, windowId: activeWin.id });
    dashboardTabId = newTab.id;
  } catch (e) {
    console.error('[TabSearch] Failed to create search results tab:', e);
  }
}

let popupCloseInProgress = false;

/**
 * Handles popup closure: cleans up search/restores tab states,
 * and triggers tab hiding as a backup if disableEmptyTab is not checked.
 *
 * @returns {Promise<void>} Resolves when popup close handling completes.
 */
async function handlePopupClosed() {
  if (popupCloseInProgress) {
    return;
  }
  popupCloseInProgress = true;
  try {
    pendingSearchMsg = null;

    // Check if virtual dashboard mode is active, skip restoration if so
    let isVirtualDashboard = false;
    let isDisableEmptyTab = false;
    try {
      const items = await browser.storage.local.get(['virtualDashboard', 'disableEmptyTab']);
      isVirtualDashboard = !!items.virtualDashboard;
      isDisableEmptyTab = !!items.disableEmptyTab;
      if (isVirtualDashboard) {
        console.log('[TabSearch] popup-closed: Virtual dashboard mode active, skipping tab restoration');
        resetSearchTrackingState();
      }
    } catch (e) {
      console.warn('[TabSearch] Failed to check settings on popup-closed:', e);
    }

    if (!isVirtualDashboard) {
      // Wait for any active search to complete to avoid racing with restoration
      const startTime = Date.now();
      while (searchInProgress && (Date.now() - startTime < 5000)) {
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      if (searchInProgress) {
        console.warn('[TabSearch] Search in progress timed out during popup close, forcing cleanup.');
        searchInProgress = false;
      }

      // Sleep for 250ms to allow any pending tab updates to complete
      // Firefox seems to need a small delay here in case new tab is activated
      await new Promise(resolve => setTimeout(resolve, POPUP_CLOSE_GRACE_MS));

      // Check if there was a recent tab activation (within last 500ms)
      // This handles race conditions where onActivated might fire before or after popup-closed
      const now = Date.now();
      const wasRecentActivation = recentTabActivation && 
                                  (now - recentTabActivation.timestamp) < RECENT_ACTIVATION_WINDOW_MS;
      
      if (wasRecentActivation) {
        console.log('[TabSearch] Recent tab activation detected:', recentTabActivation.tabId);
      } else {
        console.log('[TabSearch] No recent tab activation, user likely clicked away');
      }
      
      try {
        await restoreTabsToInitialState(wasRecentActivation ? recentTabActivation : null);

        // Select all matching tabs if option is enabled
        const items = await browser.storage.local.get(["selectMatchingTabs", "tstSupport", "tstAutoExpand"]);
        // Check if the feature is enabled and if there are any tabs from the last match
        if (items.selectMatchingTabs && lastMatchedTabIds && lastMatchedTabIds.length > 0) {
          const allWindows = await browser.windows.getAll({ populate: false }); // Get all windows

          for (const window of allWindows) {
            const targetWindowId = window.id;
            const allTabsInWindow = await browser.tabs.query({ windowId: targetWindowId });
            const matchedTabsInWindow = allTabsInWindow.filter(tab => lastMatchedTabIds.includes(tab.id));

            // Only proceed if this specific window has matched tabs
            if (matchedTabsInWindow.length > 0) {
              let activeTabInWindow = matchedTabsInWindow.find(tab => tab.active);

              if (!activeTabInWindow) {
                // If none of the matched tabs in this window are active,
                // pick the first matched tab and make it active.
                activeTabInWindow = matchedTabsInWindow[0];
                // The activeTabInWindow is guaranteed to exist here because matchedTabsInWindow.length > 0
                await browser.tabs.update(activeTabInWindow.id, { active: true });
              }

              // Highlight all matched tabs in this window if there's more than one.
              // Highlighting a single tab is effectively just making it active, which is already handled.
              if (matchedTabsInWindow.length > 1) {
                await browser.tabs.highlight({
                  windowId: targetWindowId,
                  tabs: matchedTabsInWindow.map(tab => tab.index) // Use the tab's index property
                });
              }

              // TST auto-expand logic
              if (items.tstSupport && items.tstAutoExpand && matchedTabsInWindow.length > 0) {
                try {
                  // Get the tree structure for this window from TST
                  const tree = await browser.runtime.sendMessage(TST_ID, {
                    type: 'get-light-tree',
                    tabs: '*', // Get the full tree structure for all tabs in this window
                    window: targetWindowId
                  });
                  // For each matched tab, walk up its parent chain and collect all parent tab IDs
                  const parentIdsToExpand = new Set();
                  const tabIdToNode = {};
                  if (tree && Array.isArray(tree)) {
                    tree.forEach(node => { tabIdToNode[node.id] = node; });
                    for (const tab of matchedTabsInWindow) {
                      let current = tabIdToNode[tab.id];
                      // Use ancestorTabIds if available
                      const ancestorTabIds = current && Array.isArray(current.ancestorTabIds) ? current.ancestorTabIds : [];
                      ancestorTabIds.forEach(parentId => {
                        parentIdsToExpand.add(parentId);
                      });
                    }
                    if (parentIdsToExpand.size > 0) {
                      await browser.runtime.sendMessage(TST_ID, {
                        type: 'expand-tree',
                        window: targetWindowId,
                        tabs: Array.from(parentIdsToExpand),
                        recursively: false
                      });
                      console.log('[TabSearch][TST] Auto-expanded parent trees:', Array.from(parentIdsToExpand));
                    } else {
                      console.log('[TabSearch][TST] No parent trees to expand.');
                    }
                  }
                } catch (e) {
                  console.warn('[TabSearch][TST] Failed to auto-expand parent trees:', e);
                }
              }
            }
          }
          // After handling, clear lastMatchedTabIds so it doesn't persist for next popup
          lastMatchedTabIds = [];
        }
      } catch (e) {
        console.warn('[TabSearch] Error during popup closed handling:', e);
      } finally {
        // Reset all stateful objects to avoid stale data
        resetSearchTrackingState();
      }
    }

    // Ensure intro prompt is marked completed whenever the popup is closed
    try {
      await browser.storage.local.set({ hasCompletedIntroPrompt: true });
    } catch (err) {
      console.warn('[TabSearch] Error updating hasCompletedIntroPrompt on close:', err);
    }

    // Trigger backup tab hide if disableEmptyTab is unchecked and not in virtual dashboard mode
    if (!isVirtualDashboard && !isDisableEmptyTab) {
      try {
        await triggerInitialTabHide(false);
      } catch (err) {
        console.warn('[TabSearch] Error triggering initial tab hide on popup close:', err);
      }
    }
  } finally {
    setTimeout(() => {
      popupCloseInProgress = false;
    }, 500);
  }
}

if (typeof browser !== "undefined" && browser.runtime && browser.runtime.onConnect) {
  browser.runtime.onConnect.addListener((port) => {
    if (port.name === 'popup-lifecycle') {
      if (port.onMessage && typeof port.onMessage.addListener === 'function') {
        port.onMessage.addListener((msg) => {
          if (msg && msg.type === 'heartbeat') {
            try {
              if (typeof port.postMessage === 'function') {
                port.postMessage({ type: 'heartbeat-ack' });
              }
            } catch {
              // Port might have closed
            }
          }
        });
      }
      if (port.onDisconnect && typeof port.onDisconnect.addListener === 'function') {
        port.onDisconnect.addListener(async () => {
          try {
            await handlePopupClosed();
          } catch (err) {
            console.warn('[TabSearch] Error handling popup lifecycle disconnect:', err);
          }
        });
      }
    }
  });
}

if (typeof browser !== "undefined" && browser.runtime && browser.runtime.onMessage) {
browser.runtime.onMessage.addListener(async (msg, sender) => {

  console.log('[TabSearch] Received message:', msg, 'from sender:', sender);

  if (msg.action === 'open-dashboard') {
    await handleOpenDashboard(msg.query);
    return;
  }

  if (msg.action === 'activate-tab') {
    isActivatingTab = true;
    try {
      if (msg.windowId) {
        const winUpdate = { focused: true };
        if (browser.windows.get) {
          const targetWin = await browser.windows.get(msg.windowId).catch(() => null);
          if (targetWin && targetWin.state === 'minimized') {
            winUpdate.state = 'normal';
          }
        }
        await browser.windows.update(msg.windowId, winUpdate);
      }
      if (msg.tabId) {
        await browser.tabs.update(msg.tabId, { active: true });
      }
      if (msg.closeDashboard && dashboardTabId !== null) {
        await browser.tabs.remove(dashboardTabId).catch(() => {});
        dashboardTabId = null;
      }
    } catch (e) {
      console.warn('[TabSearch] Failed to activate tab from background:', e);
    } finally {
      // Allow focus change events to process normally after activation settles
      setTimeout(() => {
        isActivatingTab = false;
      }, 300);
    }
    return;
  }

  if (msg.action === 'clear-matched-tabs') {
    lastMatchedTabIds = [];
    return;
  }

  if (msg.action === 'trigger-initial-hide' || msg.action === 'check-tabhide-permission') {
    return await triggerInitialTabHide(msg.force || false);
  }

  if (msg.action === 'reset-search-state') {
    pendingSearchMsg = null;
    const startTime = Date.now();
    while (searchInProgress && (Date.now() - startTime < 5000)) {
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    if (searchInProgress) {
      console.warn('[TabSearch] Search in progress timed out during reset, forcing cleanup.');
      searchInProgress = false;
    }
    try {
      await restoreTabsToInitialState();
    } finally {
      lastMatchedTabIds = [];
      resetSearchTrackingState();
    }
    return;
  }

  if (msg.action === 'search-tabs') {
    if (searchInProgress) {
      pendingSearchMsg = msg;
      return;
    }
    await executeSearch(msg);
  }

  // Listen for popup closed event
  if (msg.action === 'popup-closed') {
    await handlePopupClosed();
  }
});

// Listen for tab activation changes - this helps us know when a user manually clicks a tab
browser.tabs.onActivated.addListener((activeInfo) => {
  // Track recent tab activations with timestamp
  recentTabActivation = {
    tabId: activeInfo.tabId,
    windowId: activeInfo.windowId,
    timestamp: Date.now()
  };
  console.log('[TabSearch] Tab activated:', activeInfo.tabId, 'in window', activeInfo.windowId);

  // Close dashboard if user clicks off onto another tab and keepDashboardOpen is disabled
  if (!isActivatingTab && dashboardTabId !== null && activeInfo.tabId !== dashboardTabId) {
    browser.storage.local.get(['keepDashboardOpen']).then((items) => {
      if (!items.keepDashboardOpen && !isActivatingTab && dashboardTabId !== null) {
        browser.tabs.remove(dashboardTabId).catch(() => {});
        dashboardTabId = null;
      }
    }).catch((err) => {
      console.warn('[TabSearch] Failed to check keepDashboardOpen on tab activation:', err);
    });
  }
});

// Reset dashboardTabId when the dashboard tab is closed by the user or browser
browser.tabs.onRemoved.addListener((tabId) => {
  if (tabId === dashboardTabId) {
    dashboardTabId = null;
  }
});

// Close dashboard if the user focuses a different browser window and keepDashboardOpen is disabled
browser.windows.onFocusChanged.addListener(async (focusedWindowId) => {
  if (!isActivatingTab && dashboardTabId !== null && focusedWindowId !== browser.windows.WINDOW_ID_NONE) {
    try {
      const tab = await browser.tabs.get(dashboardTabId);
      if (tab && tab.windowId !== focusedWindowId) {
        const items = await browser.storage.local.get(['keepDashboardOpen']);
        if (!items.keepDashboardOpen && !isActivatingTab && dashboardTabId !== null) {
          await browser.tabs.remove(dashboardTabId);
          dashboardTabId = null;
        }
      }
    } catch (e) {
      // Tab might have been closed already, reset reference
      dashboardTabId = null;
    }
  }
});
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    calculateTabsToHideAndShow,
    walkTSTTree,
    handlePopupClosed,
    triggerInitialTabHide,
    restoreTabsToInitialState,
    addFlattenedState,
    removeFlattenedState,
    resetSearchTrackingState,
    STORAGE_KEY_TST_SEARCH_STATE
  };
}
