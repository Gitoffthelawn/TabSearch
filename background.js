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
    .tab.flattened:not(.pinned) tab-twisty::before {
      display: none !important;
    }
    .tab.flattened:not(.pinned) tab-item-substance {
      margin-left: var(--shift-tabs-for-scrollbar-distance) !important;
    }
  `,
}

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

// Hide and then show the last tab in the current window, only if "Disable initial hide option" is disabled
if (
  typeof browser !== 'undefined' &&
  browser.tabs && browser.tabs.query && browser.tabs.hide && browser.tabs.show && browser.windows &&
  browser.storage && browser.storage.local
) {
  browser.storage.local.get(['disableEmptyTab']).then((items) => {
    if (!items.disableEmptyTab) {
      browser.windows.getCurrent().then((win) => {
        browser.tabs.query({windowId: win.id}).then((tabs) => {
          if (tabs.length > 0) {
            const lastTab = tabs[tabs.length - 1];
            browser.tabs.hide([lastTab.id]).then(() => {
              setTimeout(() => {
                browser.tabs.show([lastTab.id]);
              }, 500);
            });
          }
        });
      });
    }
  });
}

let lastHiddenTabIds = [];
let progressInterval = null;
let tabsToProcess = 0;
let searchInProgress = false;
let lastMatchedTabIds = [];
let originalTSTTreeStructureByWindow = {};     // Store the original TST tree structure for restoring after search, per window
let originalTSTTreeSnapshotTaken = false;
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

browser.runtime.onMessage.addListener(async (msg, sender) => {

  // Check if TST support is enabled
  const options = await browser.storage.local.get(['tstSupport']);
  const tstEnabled = options.tstSupport;
  console.log('[TabSearch] Received message:', msg, 'from sender:', sender);

  if (msg.action === 'clear-matched-tabs') {
    lastMatchedTabIds = [];
    return;
  }

  if (msg.action === 'search-tabs') {
    if (tstEnabled) {
      // Register with TST (only once per session)
      registerWithTST();
      // Only take a snapshot if we haven't already in this session
      if (!originalTSTTreeSnapshotTaken) {
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

              // clear parents[win.id] and children[win.id] if they exist
              if (!parents[win.id]) parents[win.id] = [];
              if (!children[win.id]) children[win.id] = [];
              if (!collapsedParents[win.id]) collapsedParents[win.id] = [];

              // console.log(`[TabSearch][TST] PRE: Found ${parents[win.id].length} parent tabs in window ${win.id}`, parents[win.id].slice());
              for (const tab of originalTSTTreeStructureByWindow[win.id]) {
                // Only push parent once, not per child
                if (tab.children.length > 0) {
                  parents[win.id].push(tab);
                  // console.log(`[TabSearch][TST] Found parent tab in window ${win.id} - state is ${tab.states}: `, tab);
                  if (tab.states && tab.states.includes("subtree-collapsed")) {
                    collapsedParents[win.id].push(tab);
                    // console.log(`[TabSearch][TST] Parent tab in window ${win.id} is collapsed: `, tab);
                  }
                } else {
                  children[win.id].push(tab);
                }
              }
              // Log the list of parents and children for debugging
              console.log(`[TabSearch][TST] Found ${parents[win.id].length} parent tabs in window ${win.id}`, parents[win.id].slice());
              console.log(`[TabSearch][TST] Found ${children[win.id].length} child tabs in window ${win.id}`, children[win.id].slice());
              console.log(`[TabSearch][TST] Found ${collapsedParents[win.id].length} collapsed parent tabs in window ${win.id}`, collapsedParents[win.id].slice());
            } else {
              allValid = false;
              console.warn(`[TabSearch][TST] Received invalid tree structure for window ${win.id}:`, tree);
            }
            if (allValid) {
              originalTSTTreeSnapshotTaken = true;
              console.log(`[TabSearch][TST] Snapshot of original tree structure for window ${win.id}:`, originalTSTTreeStructureByWindow[win.id]);
            }
          }
        } catch (e) {
          console.warn('[TabSearch][TST] Failed to get original tree structure:', e);
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

      // Expand all trees for all tabs in all windows before search (only once per window per search)
      const allWindows = await browser.windows.getAll();
      for (const win of allWindows) {
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
    }

    searchInProgress = true;
    const term = msg.term.toLowerCase();
    const searchUrls = msg.searchUrls;
    const searchTitles = msg.searchTitles;
    const searchContents = msg.searchContents;
    const tabs = await browser.tabs.query({});
    let toHide = [];
    let toShow = [];
    // If the search term is empty, unhide all tabs and return
    if (!term) {
      searchInProgress = false;
      lastMatchedTabIds = [];
      const hiddenTabIds = tabs.filter(tab => tab.hidden).map(tab => tab.id);
      if (hiddenTabIds.length > 0) {
        // Start progress indicator for unhiding
        updateBadge(hiddenTabIds.length);
        startProgressIndicator(async () => {
          const tabsNow = await browser.tabs.query({});
          return tabsNow.filter(tab => tab.hidden).length;
        });
        try {
          await browser.tabs.show(hiddenTabIds);
        } catch (e) {}
      } else {
        updateBadge(0);
        if (progressInterval) {
          clearInterval(progressInterval);
          progressInterval = null;
        }
      }
      lastHiddenTabIds = [];
      return;
    }
    let matchedTabIds = [];
    for (const tab of tabs) {
      const title = (tab.title || '').toLowerCase();
      const url = (tab.url || '').toLowerCase();
      let matches = false;
      if (searchTitles && title.includes(term)) matches = true;
      if (searchUrls && url.includes(term)) matches = true;
      // If not matched by title or url, and searchContents is enabled, try content search (only if term >= 3 chars)
      if (!matches && searchContents && term.length >= 3 && tab.url && tab.url.startsWith('http')) {
        try {
          // Only works in Firefox and with proper permissions
          const findResult = await browser.find.find(term, { tabId: tab.id, caseSensitive: false });
          if (findResult && findResult.count && findResult.count > 0) {
            matches = true;
          }
        } catch (e) {
          // browser.find.find may fail on some tabs (e.g., special pages)
        }
      }
      // Always allow title/url search for any non-empty term
      // Only allow content search if term >= 3
      if (
        (searchTitles || searchUrls) ||
        (searchContents && term.length >= 3)
      ) {
        if (matches) matchedTabIds.push(tab.id);
        if (!matches && !tab.active && !tab.pinned) {
          if (!tab.hidden) toHide.push(tab.id);
        } else {
          if (tab.hidden) toShow.push(tab.id);
        }
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
      } catch (e) {}
    }
    // Unhide tabs that now match
    if (toShow.length > 0) {
      try {
        await browser.tabs.show(toShow);
      } catch (e) {}
    }
    // Track all currently hidden tabs by this addon
    lastHiddenTabIds = Array.from(new Set([...(lastHiddenTabIds || []), ...toHide]));
    // If no tabs are hidden, consider search done
    if (toHide.length === 0 && toShow.length === 0) {
      searchInProgress = false;
    }
  }  // Listen for popup closed event
  if (msg.action === 'popup-closed') {

    // Check if there was a recent tab activation (within last 200ms)
    // This handles race conditions where onActivated might fire before or after popup-closed
    const now = Date.now();
    const wasRecentActivation = recentTabActivation && 
                                (now - recentTabActivation.timestamp) < 200;
    
    if (wasRecentActivation) {
      console.log('[TabSearch] Recent tab activation detected:', recentTabActivation.tabId);
    } else {
      console.log('[TabSearch] No recent tab activation, user likely clicked away');
    }
    
    const allTabs = await browser.tabs.query({});

    // If TST support is enabled, remove flattened state from all tabs in one call
    if (tstEnabled) {
      const allTabIds = allTabs.map(tab => tab.id);
      removeFlattenedState(allTabIds);
    }

    // Always try to show all hidden tabs, even if lastHiddenTabIds is empty
    try {
      const hiddenTabIds = allTabs.filter(tab => tab.hidden).map(tab => tab.id);
      if (hiddenTabIds.length > 0) {
        // Start progress indicator for unhiding
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
    }    // Now restore the collapsed/expanded state of trees
    if (tstEnabled && originalTSTTreeSnapshotTaken && originalTSTTreeStructureByWindow) {
      try {
        // Determine which tab should be kept visible
        let tabToKeepVisible = null;
        
        if (wasRecentActivation) {
          // User clicked on a specific tab - keep that tab visible
          tabToKeepVisible = recentTabActivation.tabId;
          console.log(`[TabSearch][TST] Will preserve visibility for manually selected tab: ${tabToKeepVisible}`);
        } else {
          // User clicked away - use currently active tab in each window (existing behavior)
          console.log('[TabSearch][TST] Will preserve visibility for currently active tabs');
        }

        // First, identify which tab is currently active in each window (for click-away scenario)
        const activeTabsByWindow = {};
        const allWindows = await browser.windows.getAll({ populate: false });
        for (const window of allWindows) {
          const tabsInWindow = await browser.tabs.query({ windowId: window.id, active: true });
          if (tabsInWindow.length > 0) {
            activeTabsByWindow[window.id] = tabsInWindow[0].id;
          }
        }        for (const [windowId, treeStructure] of Object.entries(originalTSTTreeStructureByWindow)) {
          // Determine which tab to preserve visibility for in this window
          let tabIdToPreserve;
          
          if (wasRecentActivation && recentTabActivation.windowId === Number(windowId)) {
            // This is the window where the user manually selected a tab
            tabIdToPreserve = recentTabActivation.tabId;
            console.log(`[TabSearch][TST] Window ${windowId}: Will preserve manually selected tab ${tabIdToPreserve}`);
          } else {
            // For other windows, preserve the currently active tab
            tabIdToPreserve = activeTabsByWindow[windowId];
            if (tabIdToPreserve) {
              console.log(`[TabSearch][TST] Window ${windowId}: Will preserve currently active tab ${tabIdToPreserve}`);
            }
          }
          
          let parentsToKeepExpanded = new Set();
          
          // If there's a tab to preserve in this window, check if it would be hidden by collapsing trees
          if (tabIdToPreserve && collapsedParents[windowId] && collapsedParents[windowId].length > 0) {
            // Get current tree structure to find the tab's ancestors
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
                
                console.log(`[TabSearch][TST] Window ${windowId}: Looking for tab ${tabIdToPreserve} in tree`);
                console.log(`[TabSearch][TST] Window ${windowId}: Tab node found:`, tabNode ? `Yes (ancestors: ${tabNode.ancestorTabIds})` : 'No');
                
                if (tabNode && tabNode.ancestorTabIds && tabNode.ancestorTabIds.length > 0) {
                  // Check if any of the tab's ancestors are in the list of parents to collapse
                  const collapsedParentIds = collapsedParents[windowId].map(parent => parent.id);
                  console.log(`[TabSearch][TST] Window ${windowId}: Originally collapsed parent IDs:`, collapsedParentIds);
                  console.log(`[TabSearch][TST] Window ${windowId}: Tab ${tabIdToPreserve} ancestor IDs:`, tabNode.ancestorTabIds);
                  
                  for (const ancestorId of tabNode.ancestorTabIds) {
                    if (collapsedParentIds.includes(ancestorId)) {
                      parentsToKeepExpanded.add(ancestorId);
                      console.log(`[TabSearch][TST] Window ${windowId}: Keeping parent ${ancestorId} expanded to preserve visibility of tab ${tabIdToPreserve}`);
                    }
                  }
                } else {
                  console.log(`[TabSearch][TST] Window ${windowId}: Tab ${tabIdToPreserve} has no ancestors or is not in a tree`);
                }
              }
            } catch (e) {
              console.warn('[TabSearch][TST] Failed to get current tree structure for tab visibility check:', e);
            }
          }
            // Filter out parents that should be kept expanded to preserve tab visibility
          const parentsToCollapse = collapsedParents[windowId].filter(parent => !parentsToKeepExpanded.has(parent.id));
          
          if (parentsToCollapse.length > 0) {
            console.log(`[TabSearch][TST] Window ${windowId}: Collapsing ${parentsToCollapse.length} trees (keeping ${parentsToKeepExpanded.size} expanded for tab ${tabIdToPreserve})`);
            console.log(`[TabSearch][TST] Window ${windowId}: Parents to collapse:`, parentsToCollapse.map(p => p.id));
            console.log(`[TabSearch][TST] Window ${windowId}: Parents to keep expanded:`, Array.from(parentsToKeepExpanded));
            await browser.runtime.sendMessage(TST_ID, {
              type: 'collapse-tree',
              window: Number(windowId),
              tabs: parentsToCollapse,
              recursively: false
            });
          } else {
            console.log(`[TabSearch][TST] Window ${windowId}: No trees to collapse (all ${collapsedParents[windowId].length} kept expanded for tab ${tabIdToPreserve})`);
          }
          
          // Clear the tracking arrays for this window
          parents[windowId] = [];
          children[windowId] = [];
          collapsedParents[windowId] = [];
          treesExpandedThisSearch[windowId] = {};
          originalTSTTreeStructureByWindow[windowId] = treeStructure;
        }
      } catch (e) {
        console.warn('[TabSearch][TST] Failed to restore tree collapsed/expanded state:', e);
      }
    }

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
    }    // Reset all stateful objects to avoid stale data
    lastHiddenTabIds = [];
    searchInProgress = false;
    parents = {};
    children = {};
    collapsedParents = {};
    treesExpandedThisSearch = {};
    originalTSTTreeStructureByWindow = {};
    originalTSTTreeSnapshotTaken = false;
    recentTabActivation = null;  // Clear the recent activation tracking
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