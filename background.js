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

browser.runtime.onMessage.addListener(async (msg, sender) => {
  if (msg.action === 'search-tabs') {
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
      const hiddenTabIds = tabs.filter(tab => tab.hidden).map(tab => tab.id);
      if (hiddenTabIds.length > 0) {
        try {
          await browser.tabs.show(hiddenTabIds);
        } catch (e) {}
      }
      lastHiddenTabIds = [];
      return;
    }
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
        if (!matches && !tab.active && !tab.pinned) {
          if (!tab.hidden) toHide.push(tab.id);
        } else {
          if (tab.hidden) toShow.push(tab.id);
        }
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
  }
  // Listen for popup closed event
  if (msg.action === 'popup-closed') {
    // Always try to show all hidden tabs, even if lastHiddenTabIds is empty
    try {
      const allTabs = await browser.tabs.query({});
      const hiddenTabIds = allTabs.filter(tab => tab.hidden).map(tab => tab.id);
      if (hiddenTabIds.length > 0) {
        await browser.tabs.show(hiddenTabIds);
      }
    } catch (e) {}
    lastHiddenTabIds = [];
  }
});

// Listen for tab activation to restore hidden tabs
browser.tabs.onActivated.addListener(async (activeInfo) => {
  if (lastHiddenTabIds.length > 0) {
    try {
      await browser.tabs.show(lastHiddenTabIds);
    } catch (e) {}
    lastHiddenTabIds = [];
  }
});