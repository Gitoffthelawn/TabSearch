// Audio search button handler

// Audio search button handler
function searchAudioTabs() {
  if (!browser || !browser.tabs) return;
  browser.tabs.query({audible: true}).then((audibleTabs) => {
    if (audibleTabs.length === 0) {
      alert('No tabs are currently playing audio.');
      return;
    }
    if (audibleTabs.length === 1) {
      // Only one tab playing audio: switch directly
      browser.tabs.update(audibleTabs[0].id, {active: true});
      // Do NOT close the popup
      return;
    }
    // More than one: hide all other tabs (show only audible)
    browser.tabs.query({currentWindow: true}).then((allTabs) => {
      const audibleTabIds = audibleTabs.map(tab => tab.id);
      const toHide = allTabs.filter(tab => !tab.audible && !tab.pinned && !tab.active).map(tab => tab.id);
      if (toHide.length > 0 && browser.tabs.hide) {
        browser.tabs.hide(toHide);
        // Do NOT change the current active tab or close the popup
      }
    });
  });
}

document.addEventListener('DOMContentLoaded', function() {
  var audioBtn = document.getElementById('audio-search-btn');
  if (audioBtn) {
    audioBtn.addEventListener('click', searchAudioTabs);
  }
});
// Log when popup.html is opened
console.warn('[TabSearch] popup.html opened at', new Date().toISOString());
// Log document.activeElement on every focus change
document.addEventListener('focusin', (e) => {
  console.log('[TabSearch] focusin: document.activeElement:', document.activeElement, document.activeElement && document.activeElement.id);
});
document.addEventListener('focusout', (e) => {
  setTimeout(() => {
    console.log('[TabSearch] focusout: document.activeElement:', document.activeElement, document.activeElement && document.activeElement.id);
  }, 0);
});

// Handle privacy info button click (must be in external JS due to CSP)
document.addEventListener('DOMContentLoaded', function() {
  var btn = document.getElementById('privacy-info-btn');
  if (btn) {
    btn.addEventListener('click', function(e) {
      e.preventDefault();
      var url = browser.runtime.getURL('privacy.html');
      window.open(url, '_blank');
    });
  }
  var contentsBtn = document.getElementById('search-contents-info-btn');
  if (contentsBtn) {
    contentsBtn.addEventListener('click', function(e) {
      e.preventDefault();
      var url = browser.runtime.getURL('search-contents.html');
      window.open(url, '_blank');
    });
  }
});
// Utility to get and set options in storage

function saveOptions(options) {
  console.log('Saving options:', options);

  if (browser && browser.storage && browser.storage.local) {
    browser.storage.local.set(options).then(
      () => {},
      (err) => { console.error('Failed to save options:', err); }
    );
  }
}

function loadOptions(callback) {
  if (browser && browser.storage && browser.storage.local) {
    browser.storage.local.get(["searchUrls", "searchTitles", "searchContents", "realtimeSearch", "disableEmptyTab"]).then(callback);
  }
}

function updateSearchButtonState() {
  const searchBtn = document.getElementById('search-btn');
  const searchInput = document.getElementById('search');
  const urlsChecked = document.getElementById('search-urls').checked;
  const titlesChecked = document.getElementById('search-titles').checked;
  const contentsChecked = document.getElementById('search-contents').checked;
  const realtimeChecked = document.getElementById('realtime-search').checked;
  const enableSearch = urlsChecked || titlesChecked || contentsChecked;
  if (realtimeChecked) {
    searchBtn.disabled = true;
  } else {
    searchBtn.disabled = !enableSearch;
  }
  if (searchInput) {
    searchInput.disabled = !enableSearch;
  }
}

document.getElementById('search').addEventListener('keydown', function(e) {
  if (e.key === 'Enter') {
    doSearch();
  }
});
document.getElementById('search-btn').addEventListener('click', doSearch);


// Attach all DOMContentLoaded logic in a single listener
window.addEventListener('DOMContentLoaded', function() {
  let searchInput;
  // Notify background when popup is closed
  window.addEventListener('unload', function() {
    console.log('[TabSearch] popup.html closed at', new Date().toISOString());
    if (browser && browser.runtime && browser.runtime.sendMessage) {
      browser.runtime.sendMessage({ action: 'popup-closed' });
    }
  });


  loadOptions(function(items) {
    // Only use defaults if all are undefined, otherwise use stored values
    const allUndefined =
      typeof items.searchUrls === 'undefined' &&
      typeof items.searchTitles === 'undefined' &&
      typeof items.searchContents === 'undefined' &&
      typeof items.realtimeSearch === 'undefined' &&
      typeof items.disableEmptyTab === 'undefined';


    let urlsChecked = allUndefined ? true : (typeof items.searchUrls === 'undefined' ? true : !!items.searchUrls);
    let titlesChecked = allUndefined ? true : (typeof items.searchTitles === 'undefined' ? true : !!items.searchTitles);
    let contentsChecked = allUndefined ? true : (typeof items.searchContents === 'undefined' ? true : !!items.searchContents); // default true
    let realtimeChecked = allUndefined ? true : (typeof items.realtimeSearch === 'undefined' ? true : !!items.realtimeSearch);
    let disableEmptyTabChecked = allUndefined ? false : (typeof items.disableEmptyTab === 'undefined' ? false : !!items.disableEmptyTab);

    document.getElementById('search-urls').checked = urlsChecked;
    document.getElementById('search-titles').checked = titlesChecked;
    document.getElementById('search-contents').checked = contentsChecked;
    document.getElementById('realtime-search').checked = realtimeChecked;
    document.getElementById('disable-empty-tab').checked = disableEmptyTabChecked;

    // If all were undefined, save the defaults so future loads are correct
    if (allUndefined) {
      saveOptions({ searchUrls: true, searchTitles: true, searchContents: true, realtimeSearch: true, disableEmptyTab: false });
    }
    updateSearchButtonState();


  searchInput = document.getElementById('search');

  // If searchInput is not found, log an error and return
  if (!searchInput) {
    console.error('Search input element not found');
  } else {
    console.log('Search input element found:', searchInput);

    // Robustly focus/select using MutationObserver with logging
    console.log('[TabSearch] About to robustly focus/select search input');
    
    function robustFocusSelect(input) {
      // Defensive: skip if input is not present
      if (!input) {
        console.warn('[TabSearch] robustFocusSelect: input is null or undefined');
        return;
      }
      // Helper: check if input is visible and enabled
      function isInputReady(inp) {
        console.log('[TabSearch] Checking if input is ready:', inp);
        return inp.offsetParent !== null && !inp.disabled && inp.tabIndex !== -1;
      }
      // Focus/select logic with retry and blur detection
      let attempts = 0;
      let blurDetected = false;
      function tryFocusSelect() {
        if (blurDetected) return;
        if (isInputReady(input)) {
          console.log('[TabSearch] Input is ready, focusing and selecting:', input);
          input.focus();
          input.select();
          attempts++;
          // If input is focused, stop retrying
          if (document.activeElement === input) {
            console.log('[TabSearch] Search input === document.activeElement:', input, document.activeElement);
            return;
          }
        }
        if (attempts < 10 && !blurDetected) {
          setTimeout(tryFocusSelect, 100);
        }
      }
      // Listen for blur to stop retrying if user interacts elsewhere
      input.addEventListener('blur', function onBlur() {
        blurDetected = true;
        input.removeEventListener('blur', onBlur);
      });
      // If input is not ready, use MutationObserver to wait for it
      if (!isInputReady(input)) {
        const observer = new MutationObserver(() => {
          if (isInputReady(input)) {
            observer.disconnect();
            tryFocusSelect();
          }
        });
        observer.observe(document.body, { childList: true, subtree: true, attributes: true });
      } else {
        setTimeout(tryFocusSelect, 0);
      }
    }
    robustFocusSelect(searchInput);

    // Real-time search handler (must be inside this block so searchInput is defined)
    searchInput.addEventListener('input', function() {
      if (document.getElementById('realtime-search').checked) {
        doSearch();
      }
    });

    //searchInput.focus();
    //searchInput.select();

  }
  });

  function saveAllOptions() {
    saveOptions({
      searchUrls: document.getElementById('search-urls').checked,
      searchTitles: document.getElementById('search-titles').checked,
      searchContents: document.getElementById('search-contents').checked,
      realtimeSearch: document.getElementById('realtime-search').checked,
      disableEmptyTab: document.getElementById('disable-empty-tab').checked
    });
  }
  document.getElementById('search-urls').addEventListener('change', function(e) {
    const prev = document.activeElement;
    saveAllOptions();
    updateSearchButtonState();
    if (prev && prev !== document.getElementById('search')) prev.focus();
  });
  document.getElementById('search-titles').addEventListener('change', function(e) {
    const prev = document.activeElement;
    saveAllOptions();
    updateSearchButtonState();
    if (prev && prev !== document.getElementById('search')) prev.focus();
  });
  document.getElementById('search-contents').addEventListener('change', function(e) {
    const prev = document.activeElement;
    saveAllOptions();
    updateSearchButtonState();
    if (prev && prev !== document.getElementById('search')) prev.focus();
  });
  document.getElementById('realtime-search').addEventListener('change', function() {
    saveAllOptions();
    updateSearchButtonState();
  });
  document.getElementById('disable-empty-tab').addEventListener('change', function() {
    saveAllOptions();
  });

  // Real-time search handler
  if (searchInput) {
    searchInput.addEventListener('input', function() {
      if (document.getElementById('realtime-search').checked) {
        doSearch();
      }
    });
  }
});

function doSearch() {
  const term = document.getElementById('search').value.trim();
  const searchUrls = document.getElementById('search-urls').checked;
  const searchTitles = document.getElementById('search-titles').checked;
  const searchContents = document.getElementById('search-contents').checked;
  const realtimeSearch = document.getElementById('realtime-search').checked;
  if (!searchUrls && !searchTitles && !searchContents) return;
  if (term || realtimeSearch) {
    browser.runtime.sendMessage({ action: 'search-tabs', term, searchUrls, searchTitles, searchContents });
    // Only close popup if not real-time
    if (!realtimeSearch) {
      // window.close(); // Optional: close popup after search
    }
  }
}