// Virtual Search Results Dashboard Logic

let currentQuery = '';
let allTabs = [];
let matchedTabs = [];
let flatResults = []; // Flat array of currently visible tab objects, for keyboard navigation
let renderedGroups = {}; // windowId -> matched tabs, from the latest render
let renderedWindowIds = []; // Window IDs in displayed order, from the latest render
let focusedIndex = -1; // No highlight by default
let collapsedWindows = new Set();
let keepDashboardOpen = false;

// Search Options loaded from local storage
let searchUrls = true;
let searchTitles = true;
let searchContents = false;
let fuzzySearch = false;
let fuzzyThreshold = 0.35;
let currentStoredTheme = undefined;

const CONTENT_SEARCH_BATCH_SIZE = 6;
let currentDashboardTabId = null;
let activeSearchId = 0;
let lastContentSearchQuery = '';
let lastContentMatchedTabIds = new Set();
let unscannedContentTabIds = new Set();

/**
 * Resolves the effective theme ('dark' or 'light') based on explicit user preference or system color scheme.
 *
 * @param {string|undefined} storedTheme - The persisted theme preference ('dark', 'light', or undefined).
 * @returns {string} The effective theme ('dark' or 'light').
 */
function getEffectiveTheme(storedTheme) {
  if (storedTheme === 'dark' || storedTheme === 'light') {
    return storedTheme;
  }
  if (typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
    return 'dark';
  }
  return 'light';
}

/**
 * Applies the specified theme to the document and updates the theme toggle button icon and accessible title.
 *
 * @param {string} theme - The theme to apply ('dark' or 'light').
 * @param {HTMLElement|null} [toggleBtn] - The theme toggle button element, if available.
 * @returns {void}
 */
function applyTheme(theme, toggleBtn) {
  if (typeof document !== 'undefined' && document.documentElement && typeof document.documentElement.setAttribute === 'function') {
    document.documentElement.setAttribute('data-theme', theme);
  }
  const btn = toggleBtn || (typeof document !== 'undefined' && document.getElementById ? document.getElementById('theme-toggle-btn') : null);
  if (!btn) return;
  const isDark = theme === 'dark';
  btn.title = isDark ? 'Switch to light theme' : 'Switch to dark theme';
  if (typeof btn.setAttribute === 'function') {
    btn.setAttribute('aria-label', btn.title);
  }

  // Clear existing icon content safely without innerHTML
  if (typeof btn.removeChild === 'function') {
    while (btn.firstChild) {
      btn.removeChild(btn.firstChild);
    }
  }

  if (typeof btn.appendChild === 'function' && typeof document !== 'undefined' && typeof document.createElementNS === 'function') {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', '22');
    svg.setAttribute('height', '22');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');

    if (isDark) {
      // Sun icon
      if (svg.classList) {
        svg.classList.add('theme-icon-sun');
      }
      const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      circle.setAttribute('cx', '12');
      circle.setAttribute('cy', '12');
      circle.setAttribute('r', '5');
      svg.appendChild(circle);

      const rays = [
        ['12', '1', '12', '3'],
        ['12', '21', '12', '23'],
        ['4.22', '4.22', '5.64', '5.64'],
        ['18.36', '18.36', '19.78', '19.78'],
        ['1', '12', '3', '12'],
        ['21', '12', '23', '12'],
        ['4.22', '19.78', '5.64', '18.36'],
        ['18.36', '5.64', '19.78', '4.22']
      ];
      rays.forEach(([x1, y1, x2, y2]) => {
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', x1);
        line.setAttribute('y1', y1);
        line.setAttribute('x2', x2);
        line.setAttribute('y2', y2);
        svg.appendChild(line);
      });
    } else {
      // Moon icon
      if (svg.classList) {
        svg.classList.add('theme-icon-moon');
      }
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', 'M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z');
      svg.appendChild(path);
    }
    btn.appendChild(svg);
  }
}

/**
 * Toggles between 'dark' and 'light' theme, updates the UI, and persists the choice to browser storage.
 *
 * @param {string} currentEffectiveTheme - The currently active effective theme ('dark' or 'light').
 * @param {function(string): void} [onSave] - Optional callback receiving the newly persisted theme.
 * @returns {string} The newly selected theme.
 */
function toggleTheme(currentEffectiveTheme, onSave) {
  const newTheme = currentEffectiveTheme === 'dark' ? 'light' : 'dark';
  applyTheme(newTheme);
  if (typeof browser !== 'undefined' && browser.storage && browser.storage.local) {
    browser.storage.local.set({ theme: newTheme }).catch((err) => {
      console.error('[TabSearch] Error saving theme:', err);
    });
  }
  if (typeof onSave === 'function') {
    onSave(newTheme);
  }
  return newTheme;
}

// Early theme initialization to eliminate white flash
if (typeof browser !== 'undefined' && browser.storage && browser.storage.local) {
  browser.storage.local.get(['theme']).then((res) => {
    if (res && res.theme !== undefined) {
      currentStoredTheme = res.theme;
    }
    applyTheme(getEffectiveTheme(currentStoredTheme));
  }).catch(() => {
    applyTheme(getEffectiveTheme(undefined));
  });
} else {
  applyTheme(getEffectiveTheme(undefined));
}

if (typeof document !== 'undefined') {
document.addEventListener('DOMContentLoaded', async () => {
  const searchInput = document.getElementById('search');
  const keepOpenCheckbox = document.getElementById('keep-dashboard-open');
  const resultsContainer = document.getElementById('results-container');
  const themeToggleBtn = document.getElementById('theme-toggle-btn');

  if (themeToggleBtn) {
    themeToggleBtn.addEventListener('click', () => {
      const effective = getEffectiveTheme(currentStoredTheme);
      currentStoredTheme = toggleTheme(effective, (newTheme) => {
        currentStoredTheme = newTheme;
      });
    });
  }

  // 1. Retrieve query from URL parameter ?q=...
  const urlParams = new URLSearchParams(window.location.search);
  currentQuery = urlParams.get('q') || '';
  searchInput.value = currentQuery;

  // 2. Load stored options from storage
  await loadStoredOptions();

  // Populate options checkboxes and sliders on dashboard DOM
  document.getElementById('search-urls').checked = searchUrls;
  document.getElementById('search-titles').checked = searchTitles;
  document.getElementById('search-contents').checked = searchContents;
  document.getElementById('fuzzy-search').checked = fuzzySearch;
  document.getElementById('fuzzy-threshold').value = fuzzyThreshold;
  document.getElementById('threshold-value').textContent = fuzzyThreshold.toFixed(2);
  document.getElementById('threshold-row').hidden = !fuzzySearch;

  // Bind settings change listeners to persist preferences and update results
  document.getElementById('search-urls').addEventListener('change', (e) => {
    searchUrls = e.target.checked;
    browser.storage.local.set({ searchUrls });
    if (currentQuery.trim() || (!searchUrls && !searchTitles && !searchContents)) {
      performSearch();
    }
  });
  document.getElementById('search-titles').addEventListener('change', (e) => {
    searchTitles = e.target.checked;
    browser.storage.local.set({ searchTitles });
    if (currentQuery.trim() || (!searchUrls && !searchTitles && !searchContents)) {
      performSearch();
    }
  });
  document.getElementById('search-contents').addEventListener('change', (e) => {
    searchContents = e.target.checked;
    if (!searchContents) {
      lastContentSearchQuery = '';
      lastContentMatchedTabIds.clear();
      unscannedContentTabIds.clear();
    }
    browser.storage.local.set({ searchContents });
    if (currentQuery.trim() || (!searchUrls && !searchTitles && !searchContents)) {
      performSearch();
    }
  });
  document.getElementById('fuzzy-search').addEventListener('change', (e) => {
    fuzzySearch = e.target.checked;
    document.getElementById('threshold-row').hidden = !fuzzySearch;
    browser.storage.local.set({ fuzzySearch });
    if (currentQuery.trim()) {
      performSearch();
    }
  });
  document.getElementById('fuzzy-threshold').addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    document.getElementById('threshold-value').textContent = val.toFixed(2);
  });
  document.getElementById('fuzzy-threshold').addEventListener('change', (e) => {
    fuzzyThreshold = parseFloat(e.target.value);
    browser.storage.local.set({ fuzzyThreshold });
    if (currentQuery.trim()) {
      performSearch();
    }
  });

  // Bind option changes
  keepOpenCheckbox.checked = keepDashboardOpen;
  keepOpenCheckbox.addEventListener('change', (e) => {
    keepDashboardOpen = e.target.checked;
    browser.storage.local.set({ keepDashboardOpen: keepDashboardOpen });
  });

  // Bind Collapse All and Expand All buttons
  document.getElementById('collapse-all-btn').addEventListener('click', () => {
    const sections = document.querySelectorAll('.window-section');
    sections.forEach(section => {
      section.classList.add('collapsed');
      const winId = parseInt(section.dataset.windowId);
      if (!isNaN(winId)) {
        collapsedWindows.add(winId);
      }
      const header = section.querySelector('.window-header');
      if (header) {
        header.setAttribute('aria-expanded', 'false');
      }
    });
    saveCollapsedWindows();
    rebuildFlatResults();
    updateHighlightUI();
  });

  document.getElementById('expand-all-btn').addEventListener('click', () => {
    const sections = document.querySelectorAll('.window-section');
    sections.forEach(section => {
      section.classList.remove('collapsed');
      const winId = parseInt(section.dataset.windowId);
      if (!isNaN(winId)) {
        collapsedWindows.delete(winId);
      }
      const header = section.querySelector('.window-header');
      if (header) {
        header.setAttribute('aria-expanded', 'true');
      }
    });
    saveCollapsedWindows();
    rebuildFlatResults();
    updateHighlightUI();
  });

  // 3. Perform initial search
  await performSearch();

  // 4. Listen to real-time search refinement inputs
  let debounceTimer;
  searchInput.addEventListener('input', (e) => {
    currentQuery = e.target.value;
    // Update URL query parameters without reloading page
    const newUrl = new URL(window.location.href);
    newUrl.searchParams.set('q', currentQuery);
    window.history.replaceState(null, '', newUrl.searchString || newUrl.pathname + newUrl.search);

    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(async () => {
      await performSearch();
    }, searchContents ? 200 : 100);
  });

  // Focus the search input initially
  searchInput.focus();

  // 5. Handle message updates from background (singleton update-query)
  if (typeof browser !== 'undefined' && browser.runtime && browser.runtime.onMessage) {
    browser.runtime.onMessage.addListener((msg) => {
      console.log('[TabSearch][Dashboard] Received message:', msg);
      if (msg.action === 'update-query') {
        currentQuery = msg.query || '';
        searchInput.value = currentQuery;
        
        // Update URL
        const newUrl = new URL(window.location.href);
        newUrl.searchParams.set('q', currentQuery);
        window.history.replaceState(null, '', newUrl.searchString || newUrl.pathname + newUrl.search);

        performSearch();
        searchInput.focus();
      }
    });
  }

  // Listen for storage changes to sync preferences from the popup in real-time
  if (typeof browser !== 'undefined' && browser.storage && browser.storage.onChanged) {
    browser.storage.onChanged.addListener((changes) => {
      if (changes.theme) {
        currentStoredTheme = changes.theme.newValue;
        applyTheme(getEffectiveTheme(currentStoredTheme));
      }
      let preferenceChanged = false;
      const keys = ['searchUrls', 'searchTitles', 'searchContents', 'fuzzySearch', 'fuzzyThreshold'];
      for (const key of keys) {
        if (changes[key]) {
          preferenceChanged = true;
          break;
        }
      }
      if (preferenceChanged) {
        loadStoredOptions().then(() => {
          document.getElementById('search-urls').checked = searchUrls;
          document.getElementById('search-titles').checked = searchTitles;
          document.getElementById('search-contents').checked = searchContents;
          document.getElementById('fuzzy-search').checked = fuzzySearch;
          document.getElementById('fuzzy-threshold').value = fuzzyThreshold;
          document.getElementById('threshold-value').textContent = fuzzyThreshold.toFixed(2);
          document.getElementById('threshold-row').hidden = !fuzzySearch;
          performSearch();
        });
      }
    });
  }

  // 6. Handle Keyboard Navigation
  window.addEventListener('keydown', (e) => {
    if (flatResults.length === 0) return;
    if (!shouldHandleKeyboardNavigation(e.target, searchInput, e.defaultPrevented)) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      navigateHighlight(1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      navigateHighlight(-1);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const targetIndex = focusedIndex >= 0 ? focusedIndex : 0;
      if (flatResults[targetIndex]) {
        activateTab(flatResults[targetIndex]);
      }
    }
  });
});
}

/**
 * Asynchronously loads search options and collapsed window states from browser storage.
 *
 * @returns {Promise<void>} Resolves when options and collapsed windows are loaded.
 */
async function loadStoredOptions() {
  if (typeof browser !== 'undefined' && browser.storage && browser.storage.local) {
    try {
      const items = await browser.storage.local.get([
        'searchUrls',
        'searchTitles',
        'searchContents',
        'fuzzySearch',
        'fuzzyThreshold',
        'keepDashboardOpen',
        'collapsedWindows',
        'theme'
      ]);
      
      searchUrls = items.searchUrls !== undefined ? !!items.searchUrls : true;
      searchTitles = items.searchTitles !== undefined ? !!items.searchTitles : true;
      searchContents = items.searchContents !== undefined ? !!items.searchContents : false;
      fuzzySearch = items.fuzzySearch !== undefined ? !!items.fuzzySearch : false;
      fuzzyThreshold = items.fuzzyThreshold !== undefined ? parseFloat(items.fuzzyThreshold) : 0.35;
      keepDashboardOpen = items.keepDashboardOpen !== undefined ? !!items.keepDashboardOpen : false;
      if (items.theme !== undefined) {
        currentStoredTheme = items.theme;
      }
      applyTheme(getEffectiveTheme(currentStoredTheme));
      if (items.collapsedWindows && Array.isArray(items.collapsedWindows)) {
        collapsedWindows = new Set(items.collapsedWindows);
      }
    } catch (e) {
      console.warn('[TabSearch] Failed to load stored options:', e);
    }
  }
}

/**
 * Persists the set of collapsed window IDs into extension local storage.
 *
 * @returns {void}
 */
function saveCollapsedWindows() {
  if (typeof browser !== 'undefined' && browser.storage && browser.storage.local) {
    browser.storage.local.set({ collapsedWindows: Array.from(collapsedWindows) })
      .catch(e => console.warn('[TabSearch] Failed to save collapsedWindows:', e));
  }
}

let isSearching = false;
let pendingSearchRerun = false;
let searchDebounceTimer = null;

/**
 * Schedules search execution with debounce delay to prevent overlapping runs on rapid tab events.
 *
 * @param {number} [delay=100] - Debounce delay in milliseconds.
 * @returns {void}
 */
function scheduleSearch(delay = 100) {
  clearTimeout(searchDebounceTimer);
  searchDebounceTimer = setTimeout(() => {
    performSearch();
  }, delay);
}

/**
 * Filters open tabs based on the search query, active search scopes, and fuzzy search options.
 *
 * @param {Array<browser.tabs.Tab>} tabsList - Complete list of candidate tabs.
 * @param {string} query - The search query term.
 * @param {Object} [options={}] - Search configuration options.
 * @param {boolean} [options.searchUrls=true] - Whether to match against tab URLs.
 * @param {boolean} [options.searchTitles=true] - Whether to match against tab titles.
 * @param {boolean} [options.searchContents=false] - Whether page content search is enabled.
 * @param {boolean} [options.fuzzySearch=false] - Whether to use fuzzy approximate search.
 * @param {number} [options.fuzzyThreshold=0.35] - Fuzzy search match threshold (0.0 to 1.0).
 * @param {typeof import('fuse.js')|null} [FuseClass=null] - Optional injected Fuse class constructor.
 * @returns {Array<browser.tabs.Tab>} Array of tabs that match the search criteria.
 */
function filterMatchingTabs(tabsList, query, options = {}, FuseClass = null) {
  if (!tabsList || !Array.isArray(tabsList)) return [];
  const sUrls = options.searchUrls !== undefined ? !!options.searchUrls : true;
  const sTitles = options.searchTitles !== undefined ? !!options.searchTitles : true;
  const sContents = options.searchContents !== undefined ? !!options.searchContents : false;
  const fSearch = options.fuzzySearch !== undefined ? !!options.fuzzySearch : false;
  const fThreshold = options.fuzzyThreshold !== undefined ? parseFloat(options.fuzzyThreshold) : 0.35;

  if (!sUrls && !sTitles && !sContents) {
    return [];
  }

  const term = (query || "").trim().toLowerCase();
  if (!term) {
    return [...tabsList];
  }

  if (fSearch && (sTitles || sUrls)) {
    const FuseConstructor = FuseClass || (typeof Fuse !== "undefined" ? Fuse : null);
    if (FuseConstructor) {
      const keys = [];
      if (sTitles) keys.push("title");
      if (sUrls) keys.push("url");

      const fuse = new FuseConstructor(tabsList, {
        keys: keys,
        threshold: fThreshold,
        distance: 100,
        ignoreLocation: true,
        useTokenSearch: true
      });
      const results = fuse.search(term);
      return results.map(r => r.item);
    }
  }

  return tabsList.filter(tab => {
    const title = (tab.title || "").toLowerCase();
    const url = (tab.url || "").toLowerCase();
    let matches = false;
    if (sTitles && title.includes(term)) matches = true;
    if (sUrls && url.includes(term)) matches = true;
    return matches;
  });
}

/**
 * Groups matched tabs by window ID and orders window IDs with activeWindowId first,
 * followed by remaining windows in ascending numeric ID order.
 *
 * @param {Array<browser.tabs.Tab>} allTabsList - All open tabs across all browser windows.
 * @param {Array<browser.tabs.Tab>} matchedTabsList - Tabs matching the search query.
 * @param {number|null} activeWindowId - Window ID of the currently focused browser window.
 * @returns {{groups: Object.<number, Array<browser.tabs.Tab>>, windowIds: Array<number>, totalTabsPerWindow: Object.<number, number>}} Window groupings and metadata.
 */
function groupAndSortWindows(allTabsList, matchedTabsList, activeWindowId) {
  const totalTabsPerWindow = {};
  (allTabsList || []).forEach(tab => {
    if (!totalTabsPerWindow[tab.windowId]) {
      totalTabsPerWindow[tab.windowId] = 0;
    }
    totalTabsPerWindow[tab.windowId]++;
  });

  const groups = {};
  (matchedTabsList || []).forEach(tab => {
    if (!groups[tab.windowId]) {
      groups[tab.windowId] = [];
    }
    groups[tab.windowId].push(tab);
  });

  const windowIds = Object.keys(totalTabsPerWindow).map(Number).sort((a, b) => {
    if (a === activeWindowId) return -1;
    if (b === activeWindowId) return 1;
    return a - b;
  });

  return { groups, windowIds, totalTabsPerWindow };
}

/**
 * Rebuilds the flat keyboard navigation list from the latest render,
 * skipping tabs inside collapsed window sections (FR-010).
 *
 * @param {Array<number>} renderedWindowIds - Window IDs in displayed order.
 * @param {Object.<number, Array<browser.tabs.Tab>>} renderedGroups - Map of window ID to tab results.
 * @param {Set<number>|Array<number>} collapsedWindows - Set or array of currently collapsed window IDs.
 * @returns {Array<browser.tabs.Tab>} Flat ordered array of visible, navigable tab items.
 */
function buildFlatNavigationList(renderedWindowIds, renderedGroups, collapsedWindows) {
  const flat = [];
  const collapsedSet = collapsedWindows instanceof Set ? collapsedWindows : new Set(collapsedWindows || []);
  (renderedWindowIds || []).forEach((windowId) => {
    if (collapsedSet.has(windowId)) {
      return;
    }
    (renderedGroups[windowId] || []).forEach((tab) => flat.push(tab));
  });
  return flat;
}

/**
 * Calculates the next highlight index for keyboard navigation, wrapping around at list boundaries.
 *
 * @param {number} currentIndex - Current focused index (-1 if none focused).
 * @param {number} totalCount - Total number of navigable items.
 * @param {number} direction - Navigation direction (+1 for down/forward, -1 for up/backward).
 * @returns {number} Next index to highlight, or -1 if the list is empty.
 */
function navigateHighlightIndex(currentIndex, totalCount, direction) {
  if (!totalCount || totalCount <= 0) return -1;
  if (currentIndex === -1) {
    return direction === 1 ? 0 : totalCount - 1;
  }
  let next = currentIndex + direction;
  if (next < 0) {
    return totalCount - 1;
  }
  if (next >= totalCount) {
    return 0;
  }
  return next;
}

/**
 * Determines whether a global keydown event should be handled by the dashboard's
 * result list keyboard navigation or ignored to preserve native interactive control behavior.
 *
 * @param {EventTarget|null} target - The event target receiving the keyboard event.
 * @param {HTMLElement|null} searchInput - The primary search input element.
 * @param {boolean} [defaultPrevented=false] - Whether defaultPrevented is already set on the event.
 * @returns {boolean} True if the dashboard navigation should handle the event; false otherwise.
 */
function shouldHandleKeyboardNavigation(target, searchInput, defaultPrevented = false) {
  if (defaultPrevented) return false;
  if (!target) return true;
  if (target === searchInput) return true;
  if (typeof target.closest === 'function') {
    const interactive = target.closest('button, a, input, select, textarea, [role="button"]');
    if (interactive) return false;
  }
  return true;
}

/**
 * Removes stale or closed window IDs from the collapsedWindows set.
 *
 * @param {Set<number>} collapsedWindows - Set of collapsed window IDs.
 * @param {Set<number>|Array<number>} currentWindowIds - Currently open window IDs.
 * @returns {boolean} True if any stale window IDs were removed, false otherwise.
 */
function cleanStaleCollapsedWindows(collapsedWindows, currentWindowIds) {
  if (!collapsedWindows) return false;
  const currentSet = currentWindowIds instanceof Set ? currentWindowIds : new Set(currentWindowIds || []);
  let hasStale = false;
  const toDelete = [];
  for (const winId of collapsedWindows) {
    if (!currentSet.has(winId)) {
      toDelete.push(winId);
      hasStale = true;
    }
  }
  toDelete.forEach(id => collapsedWindows.delete(id));
  return hasStale;
}

/**
 * Executes a tab search across all browser windows and triggers DOM rendering.
 *
 * @returns {Promise<void>} Resolves when the search and render operations are finished.
 */
async function performSearch() {
  if (typeof browser === 'undefined' || !browser.tabs) return;

  if (isSearching) {
    pendingSearchRerun = true;
    return;
  }
  isSearching = true;

  try {
    // Query all open tabs across all windows
    const rawTabs = await browser.tabs.query({});
    
    // Exclude the dashboard tab itself from search results
    let currentTab = null;
    try {
      currentTab = await browser.tabs.getCurrent();
      if (currentTab) {
        currentDashboardTabId = currentTab.id;
      }
    } catch (e) {
      console.warn('[TabSearch] Failed to get current tab for dashboard exclusion:', e);
    }
    allTabs = currentTab ? rawTabs.filter(tab => tab.id !== currentTab.id) : rawTabs;

        const term = currentQuery.trim().toLowerCase();
    matchedTabs = filterMatchingTabs(allTabs, currentQuery, {
      searchUrls,
      searchTitles,
      searchContents,
      fuzzySearch,
      fuzzyThreshold
    });

    // Optional page content search with bounded concurrency
    if (term && searchContents && term.length >= 3 && browser.find && browser.find.find) {
      const isNewQuery = term !== lastContentSearchQuery;
      if (isNewQuery) {
        lastContentSearchQuery = term;
        lastContentMatchedTabIds.clear();
        unscannedContentTabIds.clear();
      }

      // Candidate tabs: for new query, all unmatched http tabs; for unchanged query, only unscanned tabs
      const candidateTabs = allTabs.filter(tab => {
        if (matchedTabs.some(t => t.id === tab.id)) return false;
        if (!tab.url || !tab.url.startsWith('http')) return false;
        return isNewQuery || unscannedContentTabIds.has(tab.id);
      });

      // Scan candidate tabs in bounded batches of 6
      if (candidateTabs.length > 0) {
        const thisSearchId = ++activeSearchId;
        for (let i = 0; i < candidateTabs.length; i += CONTENT_SEARCH_BATCH_SIZE) {
          if (thisSearchId !== activeSearchId) {
            return;
          }
          const chunk = candidateTabs.slice(i, i + CONTENT_SEARCH_BATCH_SIZE);
          const results = await Promise.allSettled(
            chunk.map(async (tab) => {
              try {
                const findResult = await browser.find.find(term, { tabId: tab.id, caseSensitive: false });
                if (findResult && findResult.count && findResult.count > 0) {
                  return tab.id;
                }
              } catch {
                // Ignore find failures on unloaded/protected pages
              }
              return null;
            })
          );

          if (thisSearchId !== activeSearchId) {
            return;
          }

          for (const res of results) {
            if (res.status === 'fulfilled' && res.value !== null) {
              lastContentMatchedTabIds.add(res.value);
            }
          }
        }
        candidateTabs.forEach(t => unscannedContentTabIds.delete(t.id));
      }

      // Add all cached content matches that are currently open and not already matched by title/url
      const currentMatchedIds = new Set(matchedTabs.map(t => t.id));
      for (const tab of allTabs) {
        if (!currentMatchedIds.has(tab.id) && lastContentMatchedTabIds.has(tab.id)) {
          matchedTabs.push(tab);
        }
      }
    } else {
      lastContentSearchQuery = '';
      lastContentMatchedTabIds.clear();
      unscannedContentTabIds.clear();
    }

    // Determine active window ID to sort priority
    let activeWindowId = null;
    try {
      const currentWindow = await browser.windows.getCurrent({ populate: false });
      activeWindowId = currentWindow.id;
    } catch (e) {
      console.warn('[TabSearch] Failed to get current window ID:', e);
    }

    // Render results grouped by window
    renderResults(activeWindowId);
  } catch (e) {
    console.error('[TabSearch] Error during dashboard search:', e);
  } finally {
    isSearching = false;
    if (pendingSearchRerun) {
      pendingSearchRerun = false;
      scheduleSearch(50);
    }
  }
}

/**
 * Rebuilds the flat keyboard navigation list from the latest render,
 * skipping tabs inside collapsed window sections (FR-010).
 *
 * @returns {void}
 */
function rebuildFlatResults() {
  flatResults = buildFlatNavigationList(renderedWindowIds, renderedGroups, collapsedWindows);
  if (focusedIndex >= flatResults.length) {
    focusedIndex = -1;
  }
}

/**
 * Determines the appropriate favicon URL for a tab, using native Firefox SVGs for internal or protected pages.
 *
 * @param {browser.tabs.Tab|null} tab - The tab object to inspect.
 * @returns {string} Path or URL to the appropriate favicon image.
 */
function getTabFaviconUrl(tab) {
  if (!tab) return 'images/firefox.svg';

  const url = (tab.url || '').trim();

  // If empty URL, about:blank, or any native Firefox about: page
  if (!url || url === 'about:blank' || url.startsWith('about:')) {
    if (url.startsWith('about:')) {
      const path = url.slice(6).toLowerCase();
      if (path.startsWith('addons')) return 'images/addon.svg';
      if (path.startsWith('preferences') || path.startsWith('settings') || path.startsWith('config')) return 'images/settings.svg';
      if (path.startsWith('downloads')) return 'images/downloads.svg';
      if (path.startsWith('history')) return 'images/history.svg';
      if (path.startsWith('bookmarks')) return 'images/bookmark.svg';
      if (path.startsWith('debugging') || path.startsWith('devtools') || path.startsWith('processes') || path.startsWith('performance') || path.startsWith('profiling')) return 'images/developer.svg';
    }
    // Native Firefox tabs (about:blank, about:newtab, about:home, about:welcome, etc.) use the Firefox logo
    return 'images/firefox.svg';
  }

  // Extension pages (moz-extension://)
  if (url.startsWith('moz-extension://')) {
    // If it's TabSearch's own page
    if (typeof browser !== 'undefined' && browser.runtime && browser.runtime.getURL && url.startsWith(browser.runtime.getURL(''))) {
      return 'images/search16.png';
    }
    // Other extensions
    return 'images/addon.svg';
  }

  // Regular web page with a valid favIconUrl that is not chrome:// or a loading placeholder
  if (tab.favIconUrl && !tab.favIconUrl.startsWith('chrome://') && !tab.favIconUrl.includes('loading')) {
    return tab.favIconUrl;
  }

  // Fallback to domain /favicon.ico for http/https
  if (url.startsWith('http://') || url.startsWith('https://')) {
    try {
      return new URL(url).origin + '/favicon.ico';
    } catch (e) {}
  }

  return 'images/default-favicon.svg';
}

/**
 * Creates a DOM element representing the "Pinned" badge for a tab result.
 *
 * @param {Document} [doc=document] - Optional document object (defaults to global document).
 * @returns {HTMLSpanElement|null} The styled pinned badge element containing an SVG icon and label, or null if document is unavailable.
 */
function createPinnedBadge(doc = (typeof document !== 'undefined' ? document : null)) {
  if (!doc) return null;
  const badge = doc.createElement('span');
  badge.className = 'tab-pinned-badge';
  badge.title = 'Pinned tab';
  badge.setAttribute('title', 'Pinned tab');
  badge.setAttribute('aria-label', 'Pinned tab');

  const svg = typeof doc.createElementNS === 'function'
    ? doc.createElementNS('http://www.w3.org/2000/svg', 'svg')
    : doc.createElement('svg');
  svg.setAttribute('class', 'tab-pinned-icon');
  if (svg.classList) {
    svg.classList.add('tab-pinned-icon');
  }
  svg.setAttribute('width', '10');
  svg.setAttribute('height', '10');
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('fill', 'currentColor');
  svg.setAttribute('aria-hidden', 'true');

  const path = typeof doc.createElementNS === 'function'
    ? doc.createElementNS('http://www.w3.org/2000/svg', 'path')
    : doc.createElement('path');
  path.setAttribute('d', 'M9.828.722a.5.5 0 0 1 .354.146l4.95 4.95a.5.5 0 0 1 0 .707c-.48.48-1.072.588-1.503.588-.177 0-.335-.018-.46-.039l-3.134 3.134a5.927 5.927 0 0 1 .16 1.013c.046.702-.032 1.687-.72 2.375a.5.5 0 0 1-.707 0l-2.829-2.828-3.182 3.182c-.195.195-1.219.902-1.414.707-.195-.195.512-1.219.707-1.414l3.182-3.182-2.828-2.829a.5.5 0 0 1 0-.707c.688-.688 1.673-.767 2.375-.72a5.922 5.922 0 0 1 1.013.16l3.134-3.133a2.772 2.772 0 0 1-.04-.461c0-.43.108-1.022.589-1.503a.5.5 0 0 1 .353-.146z');
  svg.appendChild(path);

  const text = doc.createElement('span');
  text.className = 'tab-pinned-text';
  text.textContent = 'Pinned';

  badge.appendChild(svg);
  badge.appendChild(text);
  return badge;
}

/**
 * Renders grouped tab search results into the dashboard DOM container.
 *
 * @param {number|null} activeWindowId - Window ID of the active browser window.
 * @returns {void}
 */
function renderResults(activeWindowId) {
  const container = document.getElementById('results-container');
  container.innerHTML = '';
  flatResults = [];

  const totalSummaryBadge = document.getElementById('total-summary-badge');
  if (totalSummaryBadge) {
    const tabWord = allTabs.length === 1 ? 'tab' : 'tabs';
    totalSummaryBadge.textContent = `${matchedTabs.length} / ${allTabs.length} ${tabWord}`;
  }

  if (matchedTabs.length === 0) {
    const noResultsDiv = document.createElement('div');
    noResultsDiv.className = 'no-results';
    noResultsDiv.textContent = 'No matching tabs found.';
    container.appendChild(noResultsDiv);
    focusedIndex = -1;
    return;
  }

  const { groups, windowIds, totalTabsPerWindow } = groupAndSortWindows(allTabs, matchedTabs, activeWindowId);

  // Clean any collapsed window IDs that no longer exist
  const staleRemoved = cleanStaleCollapsedWindows(collapsedWindows, windowIds);
  if (staleRemoved) {
    saveCollapsedWindows();
  }

  windowIds.forEach((windowId, index) => {
    const tabsInWindow = groups[windowId] || [];
    const totalCount = totalTabsPerWindow[windowId] || 0;
    const matchCount = tabsInWindow.length;

    // Window section container
    const section = document.createElement('div');
    section.className = 'window-section';
    section.dataset.windowId = windowId;

    const isCollapsed = collapsedWindows.has(windowId);
    if (isCollapsed) {
      section.classList.add('collapsed');
    }

    // Window header (accessible button behavior)
    const header = document.createElement('div');
    header.className = 'window-header';
    header.setAttribute('role', 'button');
    header.setAttribute('tabindex', '0');
    header.setAttribute('aria-expanded', String(!isCollapsed));
    header.setAttribute('aria-label', `Window ${index + 1}: ${matchCount} of ${totalCount} tabs. Toggle to collapse or expand.`);

    const titleSpan = document.createElement('span');
    titleSpan.className = 'window-title';

    const windowName = document.createElement('span');
    windowName.className = 'window-name';
    windowName.textContent = `Window ${index + 1}`;

    const badge = document.createElement('span');
    badge.className = 'window-badge';
    badge.textContent = `${matchCount} / ${totalCount} tabs`;

    titleSpan.appendChild(windowName);
    titleSpan.appendChild(badge);

    const toggleIcon = document.createElement('span');
    toggleIcon.className = 'window-toggle-icon';
    toggleIcon.textContent = '▼';

    header.appendChild(titleSpan);
    header.appendChild(toggleIcon);

    const toggleCollapse = () => {
      if (collapsedWindows.has(windowId)) {
        collapsedWindows.delete(windowId);
        section.classList.remove('collapsed');
        header.setAttribute('aria-expanded', 'true');
      } else {
        collapsedWindows.add(windowId);
        section.classList.add('collapsed');
        header.setAttribute('aria-expanded', 'false');
      }
      saveCollapsedWindows();
      rebuildFlatResults();
      updateHighlightUI();
    };

    // Click and keyboard toggle listeners
    header.addEventListener('click', toggleCollapse);
    header.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        toggleCollapse();
      }
    });

    section.appendChild(header);

      // Create tab list
      const tabListDiv = document.createElement('div');
      tabListDiv.className = 'tab-list';

      if (tabsInWindow.length === 0) {
        const emptyMsg = document.createElement('div');
        emptyMsg.className = 'empty-window-message';
        emptyMsg.textContent = 'No matching tabs in this window';
        tabListDiv.appendChild(emptyMsg);
      } else {
        tabsInWindow.forEach(tab => {
        const anchor = document.createElement('a');
        anchor.className = 'tab-item-link';
        anchor.href = '#';
        anchor.addEventListener('click', (e) => {
          e.preventDefault();
          activateTab(tab);
        });

        const tabItem = document.createElement('div');
        tabItem.className = 'tab-result-item';
        if (tab.pinned) {
          tabItem.classList.add('pinned');
        }
        tabItem.dataset.tabId = tab.id;

        // Favicon
        const faviconImg = document.createElement('img');
        faviconImg.className = 'tab-favicon';
        faviconImg.addEventListener('error', () => {
          const tabUrl = (tab.url || '').trim();
          if (!tabUrl || tabUrl === 'about:blank' || tabUrl.startsWith('about:')) {
            faviconImg.src = 'images/firefox.svg';
          } else if (!faviconImg.src.endsWith('default-favicon.svg')) {
            faviconImg.src = 'images/default-favicon.svg';
          }
        });
        faviconImg.src = getTabFaviconUrl(tab);

        // Tab Information (Title, URL)
        const tabInfo = document.createElement('div');
        tabInfo.className = 'tab-info';

        const titleRow = document.createElement('div');
        titleRow.className = 'tab-title-row';

        const titleText = document.createElement('span');
        titleText.className = 'tab-title-text';
        titleText.textContent = tab.title || 'Untitled Tab';
        titleRow.appendChild(titleText);

        if (tab.pinned) {
          titleRow.appendChild(createPinnedBadge());
        }

        const urlText = document.createElement('span');
        urlText.className = 'tab-url-text';
        urlText.textContent = tab.url || '';

        tabInfo.appendChild(titleRow);
        tabInfo.appendChild(urlText);

        tabItem.appendChild(faviconImg);
        tabItem.appendChild(tabInfo);

        anchor.appendChild(tabItem);
        tabListDiv.appendChild(anchor);
        });
      }

      section.appendChild(tabListDiv);
      container.appendChild(section);
    });

    renderedGroups = groups;
    renderedWindowIds = windowIds;
    rebuildFlatResults();
    updateHighlightUI();
  }

/**
 * Moves the keyboard highlight cursor through the visible tab list.
 *
 * @param {number} direction - Direction to navigate (+1 for down, -1 for up).
 * @returns {void}
 */
function navigateHighlight(direction) {
  if (flatResults.length === 0) return;

    focusedIndex = navigateHighlightIndex(focusedIndex, flatResults.length, direction);

  updateHighlightUI();
}

/**
 * Updates DOM highlight classes and scrolls the focused item into view.
 *
 * @returns {void}
 */
function updateHighlightUI() {
  const items = document.querySelectorAll('.window-section:not(.collapsed) .tab-result-item');
  items.forEach((item, index) => {
    if (index === focusedIndex) {
      item.classList.add('highlighted');
      // Scroll into view if needed
      item.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    } else {
      item.classList.remove('highlighted');
    }
  });
}

/**
 * Focuses the target window, activates the specified tab, and closes the dashboard if configured.
 *
 * @param {browser.tabs.Tab} tab - The tab to activate.
 * @returns {Promise<void>} Resolves once the window and tab have been focused.
 */
async function activateTab(tab) {
  if (typeof browser === 'undefined') return;

  try {
    // 1. Focus parent window
    if (browser.runtime && browser.runtime.sendMessage) {
      await browser.runtime.sendMessage({
        action: 'activate-tab',
        tabId: tab.id,
        windowId: tab.windowId,
        closeDashboard: !keepDashboardOpen
      });
      return;
    }

    // Fallback if runtime messaging is unavailable
    const winUpdate = { focused: true };
    if (browser.windows && browser.windows.get) {
      const targetWin = await browser.windows.get(tab.windowId).catch(() => null);
      if (targetWin && targetWin.state === 'minimized') {
        winUpdate.state = 'normal';
      }
    }
    await browser.windows.update(tab.windowId, winUpdate);
    // 2. Activate tab
    await browser.tabs.update(tab.id, { active: true });

    // 3. Close the dashboard if keepDashboardOpen is disabled
    if (!keepDashboardOpen) {
      const currentTab = await browser.tabs.getCurrent();
      await browser.tabs.remove(currentTab.id);
    }
  } catch (e) {
    console.error('[TabSearch] Failed to activate tab:', e);
  }
}

// 7. Dynamic listeners to sync tab state in real-time
if (typeof browser !== 'undefined' && browser.tabs) {
  // Reflect closed tabs immediately
  if (browser.tabs.onRemoved) {
    browser.tabs.onRemoved.addListener((tabId) => {
      console.log('[TabSearch] Tab removed:', tabId);
      lastContentMatchedTabIds.delete(tabId);
      unscannedContentTabIds.delete(tabId);
      scheduleSearch(50);
    });
  }

  // Reflect newly opened tabs
  if (browser.tabs.onCreated) {
    browser.tabs.onCreated.addListener((tab) => {
      console.log('[TabSearch] Tab created:', tab.id);
      unscannedContentTabIds.add(tab.id);
      scheduleSearch(100);
    });
  }

  // Reflect URL, title, favicon, loading status, or other tab updates
  if (browser.tabs.onUpdated) {
    browser.tabs.onUpdated.addListener((tabId, changeInfo) => {
      if (currentDashboardTabId && tabId === currentDashboardTabId) {
        return;
      }
      if (changeInfo.url) {
        lastContentMatchedTabIds.delete(tabId);
        unscannedContentTabIds.add(tabId);
      }
      if (changeInfo.status === 'complete') {
        unscannedContentTabIds.add(tabId);
      }
      const isRelevant = changeInfo.url || changeInfo.title ||
        changeInfo.status === 'complete' ||
        changeInfo.pinned !== undefined ||
        changeInfo.hidden !== undefined;
      if (isRelevant) {
        scheduleSearch(100);
      }
    });
  }

  // Reflect tabs moved within or across windows
  if (browser.tabs.onMoved) {
    browser.tabs.onMoved.addListener(() => {
      scheduleSearch(100);
    });
  }
  if (browser.tabs.onAttached) {
    browser.tabs.onAttached.addListener(() => {
      scheduleSearch(100);
    });
  }
  if (browser.tabs.onDetached) {
    browser.tabs.onDetached.addListener(() => {
      scheduleSearch(100);
    });
  }

  // Reflect opened or closed windows
  if (typeof browser.windows !== 'undefined') {
    if (browser.windows.onCreated) {
      browser.windows.onCreated.addListener(() => {
        scheduleSearch(100);
      });
    }
    if (browser.windows.onRemoved) {
      browser.windows.onRemoved.addListener(() => {
        scheduleSearch(50);
      });
    }
  }
}

  // Refresh whenever this dashboard tab or window regains focus or visibility
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        scheduleSearch(0);
      }
    });
  }
  if (typeof window !== 'undefined') {
    window.addEventListener('focus', () => {
      scheduleSearch(0);
    });
  }

  // Automatically close dashboard when user activates another tab unless keepDashboardOpen is enabled
  if (typeof browser !== "undefined" && browser.tabs && browser.tabs.onActivated) {
    browser.tabs.onActivated.addListener(async (activeInfo) => {
      if (keepDashboardOpen) return;
      try {
        const currentTab = await browser.tabs.getCurrent();
        if (currentTab && activeInfo.tabId !== currentTab.id) {
          console.log('[TabSearch] Another tab activated; closing dashboard tab', currentTab.id);
          await browser.tabs.remove(currentTab.id);
        }
      } catch (e) {
        console.warn('[TabSearch] Failed to close dashboard on tab deactivation:', e);
      }
    });
  }

  // Automatically close dashboard when user switches window focus unless keepDashboardOpen is enabled
  if (typeof browser !== "undefined" && browser.windows && browser.windows.onFocusChanged) {
    browser.windows.onFocusChanged.addListener(async (focusedWindowId) => {
      if (keepDashboardOpen || focusedWindowId === browser.windows.WINDOW_ID_NONE) return;
      try {
        const currentTab = await browser.tabs.getCurrent();
        if (currentTab && currentTab.windowId !== focusedWindowId) {
          console.log('[TabSearch] Window focus changed; closing dashboard tab', currentTab.id);
          await browser.tabs.remove(currentTab.id);
        }
      } catch (e) {
        console.warn('[TabSearch] Failed to close dashboard on window blur:', e);
      }
    });
  }

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    CONTENT_SEARCH_BATCH_SIZE,
    getTabFaviconUrl,
    filterMatchingTabs,
    groupAndSortWindows,
    buildFlatNavigationList,
    navigateHighlightIndex,
    shouldHandleKeyboardNavigation,
    cleanStaleCollapsedWindows,
    createPinnedBadge,
    getEffectiveTheme,
    applyTheme,
    toggleTheme
  };
}
