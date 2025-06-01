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
  console.log('Received message:', msg, 'from sender:', sender);
  if (msg.action === 'search-tabs') {
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
  }
  // Listen for popup closed event
  if (msg.action === 'popup-closed') {
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
    if (items.selectMatchingTabs && lastMatchedTabIds && lastMatchedTabIds.length > 0) {
      // Find the active tab among the matched tabs
      const allTabs = await browser.tabs.query({});
      const matchedTabs = allTabs.filter(tab => lastMatchedTabIds.includes(tab.id));
      let activeTab = matchedTabs.find(tab => tab.active);
      if (!activeTab) {
        // If the active tab is not in the matched set, pick the first matched tab as active
        activeTab = matchedTabs[0];
        if (activeTab) {
          await browser.tabs.update(activeTab.id, { active: true });
        }
      }
      // Highlight all matched tabs in their window
      if (activeTab) {
        const matchedTabIdsInWindow = matchedTabs.filter(tab => tab.windowId === activeTab.windowId).map(tab => tab.id);
        if (matchedTabIdsInWindow.length > 1) {
          await browser.tabs.highlight({ windowId: activeTab.windowId, tabs: matchedTabIdsInWindow.map(id => allTabs.findIndex(tab => tab.id === id)) });
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