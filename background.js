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
  if (!browser || !browser.runtime || !browser.runtime.sendMessage) return;
  browser.runtime.sendMessage(TST_ID, TST_REGISTER_MESSAGE)
    .then(response => {
      console.log('[TabSearch][TST] Registered with TST:', response);
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

/*
  // Get tree structure and log tabs with 'subtree-collapsed' state
  browser.runtime.sendMessage(TST_ID, {
    type: 'get-tree-structure',
    tabs: tabIds
  }).then(tree => {
    if (Array.isArray(tree)) {
      console.log('[TabSearch][TST] get-tree-structure response:', tree);

      const collapsedTabs = tree.filter(t => t.collapsed === true);
      if (collapsedTabs.length > 0) {
        // console.log('[TabSearch][TST] Tabs with subtree-collapsed state:', collapsedTabs.map(t => t.tab));
        console.log('[TabSearch][TST] Tabs with subtree-collapsed state:', collapsedTabs);

        // Expand the tree for these tabs
        browser.runtime.sendMessage(TST_ID, {
          type: 'expand-tree',
          tabs: collapsedTabs.map(t => t.tab), // Use the tab IDs from the collapsed tabs
          recursively: false
        }).then(() => {
          console.log('[TabSearch][TST] Expanded tree for tabs', collapsedTabs.map(t => t.tab));
        }).catch(err => {
          console.warn('[TabSearch][TST] Failed to expand tree for tabs:', err);
        });
      } else {
        console.log('[TabSearch][TST] No tabs with subtree-collapsed state');
      }
    } else {
      console.log('[TabSearch][TST] get-tree-structure response:', tree);
    }
  }).catch(err => {
    console.warn('[TabSearch][TST] Failed to get tree structure:', err);
  });
*/
  // Also expand the tree for these tabs recursively
  /*
  browser.runtime.sendMessage(TST_ID, {
    type: 'expand-tree',
    tabs: tabIds,
    recursively: true
  }).then(() => {
    console.log('[TabSearch][TST] Expanded tree for tabs', tabIds);
  }).catch(err => {
    console.warn('[TabSearch][TST] Failed to expand tree for tabs:', err);
  });
  */
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
}
// On extension startup, create a new tab, hide it, then close it (unless disabled by option)
/*
if (typeof browser !== 'undefined' && browser.tabs && browser.tabs.create && browser.tabs.hide && browser.tabs.remove && browser.storage && browser.storage.local) {
  browser.storage.local.get(['disableEmptyTab']).then((items) => {
    if (!items.disableEmptyTab) {
      browser.tabs.create({active: false, url: 'about:blank'}).then((tab) => {
        if (tab && typeof tab.id === 'number') {
          // Give the tab a moment to initialize (especially in Firefox)
          setTimeout(() => {
            browser.tabs.hide([tab.id]).then(() => {
              // After hiding, close the tab
              setTimeout(() => {
                browser.tabs.remove(tab.id);
              }, 300);
            });
          }, 500);
        }
      });
    }
  });
}
*/


// Hide and then show the last tab in the current window, only if the 4th option is disabled
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
  // For restoring TST tree structure after search
  let originalTSTTreeStructure = null;
  // Check if TST support is enabled
  const options = await browser.storage.local.get(['tstSupport']);
  const tstEnabled = options.tstSupport;
  console.log('Received message:', msg, 'from sender:', sender);
  if (msg.action === 'search-tabs') {

    if (tstEnabled) {

      // If TST support is enabled, register with TST (only once per session)
      registerWithTST();

      // Take a snapshot of the TST tree structure before search (for restoration)
      try {
        originalTSTTreeStructure = await browser.runtime.sendMessage(TST_ID, {
          type: 'get-tree-structure',
          tabs: '*'
        });
        console.log('[TabSearch][TST] Snapshot of original tree structure:', originalTSTTreeStructure);
      } catch (e) {
        console.warn('[TabSearch][TST] Failed to get original tree structure:', e);
      }

      // Expand all trees for all tabs before search
      browser.runtime.sendMessage(TST_ID, {
        type: 'expand-tree',
        tabs: '*', // Use '*' to expand all tabs
        recursively: true
      }).then(() => {
        console.log('[TabSearch][TST] Expanded all trees');
      }).catch(err => {
        console.warn('[TabSearch][TST] Failed to expand trees: ', err);
      });
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
    // Also, if content search is the only enabled search and term is less than 3 chars, unhide all and return
    const onlyContentSearch = searchContents && !searchTitles && !searchUrls;
    if (!term || (onlyContentSearch && term.length < 3)) {
      searchInProgress = false;
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
      // Only call if either searchTitles or searchUrls is enabled OR if searchContents is enabled and the term is >= 3 chars
      if (searchTitles || searchUrls || (searchContents && term.length >= 3)) {
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
    // After all tab hiding/unhiding is complete, add flattened state to all visible tabs (TST)
    if (tstEnabled) {
      const allTabs = await browser.tabs.query({});
      const visibleTabIds = allTabs.filter(tab => !tab.hidden).map(tab => tab.id);
      if (visibleTabIds.length > 0) {
        addFlattenedState(visibleTabIds);
      }
    }
  }
  // Listen for popup closed event
  if (msg.action === 'popup-closed') {
    // If TST support is enabled, remove flattened state from all tabs in one call
    if (tstEnabled) {
      const allTabs = await browser.tabs.query({});
      const allTabIds = allTabs.map(tab => tab.id);
      removeFlattenedState(allTabIds);
      // Restore the original TST tree structure if we have a snapshot
      if (originalTSTTreeStructure) {
        try {
          await browser.runtime.sendMessage(TST_ID, {
            type: 'set-tree-structure',
            structure: originalTSTTreeStructure
          });
          console.log('[TabSearch][TST] Restored original tree structure');
        } catch (e) {
          console.warn('[TabSearch][TST] Failed to restore original tree structure:', e);
        }
        originalTSTTreeStructure = null;
      }
    }
    searchInProgress = false;
    // Always try to show all hidden tabs, even if lastHiddenTabIds is empty
    try {
      const allTabs = await browser.tabs.query({});
      const hiddenTabIds = allTabs.filter(tab => tab.hidden).map(tab => tab.id);
      if (hiddenTabIds.length > 0) {
        // Start progress indicator for unhiding
        updateBadge(hiddenTabIds.length);
        startProgressIndicator(async () => {
          const tabsNow = await browser.tabs.query({});
          return tabsNow.filter(tab => tab.hidden).length;
        });
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
    // Select all matching tabs if option is enabled
    const items = await browser.storage.local.get(["selectMatchingTabs"]);
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
        }
      }
    }
    lastHiddenTabIds = [];
  }
});

// Listen for tab activation to restore hidden tabs
browser.tabs.onActivated.addListener(async (activeInfo) => {
  if (!searchInProgress && lastHiddenTabIds.length > 0) {
    try {
      const allTabs = await browser.tabs.query({});
      const hiddenTabIds = allTabs.filter(tab => tab.hidden).map(tab => tab.id);
      if (hiddenTabIds.length > 0) {
        updateBadge(hiddenTabIds.length);
        startProgressIndicator(async () => {
          const tabsNow = await browser.tabs.query({});
          return tabsNow.filter(tab => tab.hidden).length;
        });
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
    lastHiddenTabIds = [];
  }
});