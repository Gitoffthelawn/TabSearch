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

function addFlattenedState(tabId) {
  // Support both single tabId and array of tabIds
  const tabIds = Array.isArray(tabId) ? tabId : [tabId];
  browser.runtime.sendMessage(TST_ID, {
    type: 'add-tab-state',
    tabs: tabIds,
    state: 'flattened'
  }).then(() => {
    console.log('[TabSearch][TST] Added flattened state to tabs', tabIds);
  }).catch(err => {
    console.warn('[TabSearch][TST] Failed to add flattened state:', err);
  });
}

function removeFlattenedState(tabId) {
  // Support both single tabId and array of tabIds
  const tabIds = Array.isArray(tabId) ? tabId : [tabId];
  browser.runtime.sendMessage(TST_ID, {
    type: 'remove-tab-state',
    tabs: tabIds,
    state: 'flattened'
  }).then(() => {
    console.log('[TabSearch][TST] Removed flattened state from tabs', tabIds);
  }).catch(err => {
    console.warn('[TabSearch][TST] Failed to remove flattened state:', err);
  });
  flattenedStateAppliedThisSearch = false;
}

function verifyTabHidePermission(force = false) {
  if (
    typeof browser === 'undefined' || 
    !browser.tabs || !browser.tabs.hide || !browser.tabs.show || !browser.tabs.query || !browser.windows ||
    !browser.storage || !browser.storage.local
  ) {
    return Promise.resolve(false);
  }

  return browser.storage.local.get(['tabHideConfirmed', 'disableEmptyTab']).then((items) => {
    if (items.tabHideConfirmed && !force) {
      console.log('[TabSearch] tabHide permission already confirmed.');
      return true;
    }
    if (items.disableEmptyTab && !force) {
      console.log('[TabSearch] Startup tabHide check disabled by user setting.');
      return false;
    }

    console.log('[TabSearch] Verifying tabHide permission...');
    return browser.windows.getCurrent().then((win) => {
      const queryInfo = win && win.id ? { windowId: win.id } : {};
      return browser.tabs.query(queryInfo).then((tabs) => {
        if (tabs.length === 0) {
          return false;
        }

        // Find a tab we can safely hide (must not be active, and must not be pinned)
        const targetTab = tabs.find(t => !t.active && !t.pinned);
        let checkPromise;
        let isTemp = false;

        if (targetTab) {
          checkPromise = Promise.resolve(targetTab);
        } else {
          // If no safe tab, create a temporary one in the background
          isTemp = true;
          const createInfo = win && win.id ? { active: false, windowId: win.id } : { active: false };
          checkPromise = browser.tabs.create(createInfo);
        }

        return checkPromise.then((tab) => {
          return browser.tabs.hide([tab.id]).then(() => {
            console.log('[TabSearch] tabHide permission is active.');
            // Only persist confirmation when explicitly triggered by user (force=true)
            // The startup check triggers the doorhanger but doesn't mark as confirmed,
            // so the popup banner will appear if the user dismissed the doorhanger.
            if (force) {
              browser.storage.local.set({ tabHideConfirmed: true });
            }
            if (isTemp) {
              browser.tabs.remove(tab.id).catch(() => {});
            } else {
              setTimeout(() => {
                browser.tabs.show([tab.id]).catch(err => {
                  console.warn('[TabSearch] Failed to show verified tab:', err);
                });
              }, 200);
            }
            return true;
          }).catch((err) => {
            console.warn('[TabSearch] tabHide permission is NOT active:', err);
            browser.storage.local.set({ tabHideConfirmed: false });
            if (isTemp) {
              browser.tabs.remove(tab.id).catch(() => {});
            }
            return false;
          });
        });
      });
    });
  }).catch((err) => {
    console.error('[TabSearch] Error in verifyTabHidePermission:', err);
    return false;
  });
}

// Note: tabHide permission verification is triggered on first popup open, not on startup.

let progressInterval = null;
let tabsToProcess = 0;
let searchInProgress = false;
let pendingSearchMsg = null;
let lastMatchedTabIds = [];
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

function updateBadge(count) {
  browser.action.setBadgeText({ text: count > 0 ? String(count) : '' });
  browser.action.setBadgeBackgroundColor({ color: '#2366d1' });
}

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

async function restoreTabsToInitialState(recentActivationToPreserve = null) {
  const allTabs = await browser.tabs.query({});

  // Use flattenedStateAppliedThisSearch rather than the current tstSupport storage
  // value, because the option may already have been toggled off before this runs.
  if (flattenedStateAppliedThisSearch) {
    const allTabIds = allTabs.map(tab => tab.id);
    removeFlattenedState(allTabIds);
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
}

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
}


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
                function walkTree(nodes) {
                  for (const node of nodes) {
                    if (node.children && node.children.length > 0) {
                      parents[win.id].push(node);
                      if (node.states && node.states.includes('subtree-collapsed')) {
                        collapsedParents[win.id].push(node);
                      }
                      walkTree(node.children);
                    } else {
                      children[win.id].push(node);
                    }
                  }
                }
                walkTree(tree);
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
            addFlattenedState(allTabs);
          }
          flattenedStateAppliedThisSearch = true;
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

      // Parallel content search (not fuzzy)
      if (searchContents && term.length >= 3) {
        for (const tab of tabs) {
          // Skip if already matched via title/url
          if (matchedTabIds.includes(tab.id)) continue;
          if (tab.url && tab.url.startsWith('http')) {
            try {
              const findResult = await browser.find.find(term, { tabId: tab.id, caseSensitive: false });
              if (findResult && findResult.count && findResult.count > 0) {
                matchedTabIds.push(tab.id);
              }
            } catch (e) { console.warn('[TabSearch] Operation failed:', e); }
          }
        }
      }

      // Determine final toHide and toShow lists based on matchedTabIds
      for (const tab of tabs) {
        const isMatch = matchedTabIds.includes(tab.id);
        if (!isMatch && !tab.active && !tab.pinned) {
          if (!tab.hidden) toHide.push(tab.id);
        } else {
          if (tab.hidden) toShow.push(tab.id);
        }
      }
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
browser.runtime.onMessage.addListener(async (msg, sender) => {

  console.log('[TabSearch] Received message:', msg, 'from sender:', sender);

  if (msg.action === 'clear-matched-tabs') {
    lastMatchedTabIds = [];
    return;
  }

  if (msg.action === 'check-tabhide-permission') {
    return await verifyTabHidePermission(msg.force || false);
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
  }  // Listen for popup closed event
  if (msg.action === 'popup-closed') {
    pendingSearchMsg = null;

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
});