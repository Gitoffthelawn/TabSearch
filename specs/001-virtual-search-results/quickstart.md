# Quickstart Validation Guide

This guide details the scenarios to verify the Virtual Search Results Dashboard feature.

## Prerequisites

1. Load the TabSearch extension into Firefox:
   * Open `about:debugging#/runtime/this-firefox` and click **Load Temporary Add-on...**, then select `src/manifest.json`.
2. Ensure you have multiple browser windows open, with at least 5-10 tabs across them containing distinct titles/URLs to search.

---

## Validation Scenarios

### Scenario 1: Enabling Virtual Dashboard Mode
1. Click the TabSearch extension icon to open the popup.
2. Find the new option **Virtual Search Results Dashboard** and check it.
3. Verify that the checkbox stays checked (persisted in storage) by closing and reopening the popup.

### Scenario 2: Opening Dashboard and Navigation
1. Open the popup, enter a search term that matches multiple tabs across different windows, and click **Search** (or press **Enter**).
2. **Expected Outcome**:
    * A new tab `search-results.html` opens in the current window.
    * The query box contains the search term.
    * While results are being computed, a "Searching…" placeholder is shown, then replaced by the results list.
    * Search results are displayed, grouped by window (with the active window section at the top, followed by other windows in ascending window ID order).
 3. Click a search result.
 4. **Expected Outcome**:
    * The browser focuses the target tab in its parent window.
    * The dashboard tab closes automatically (default behavior).
    * **SC-002**: Activation completes in **under 250ms**.
      *Measurement*: Check **Keep dashboard open** first (so the console stays alive), then in the dashboard's DevTools console run `const t0 = performance.now(); document.querySelector('.window-section:not(.collapsed) .tab-result-item').click(); browser.tabs.onActivated.addListener((d) => console.log('SC-002 ms:', performance.now() - t0, 'tab', d.tabId));`. The logged delta must be < 250.
 5. Minimize the parent window of a matching tab, then select that tab's result from the dashboard.
    **Expected Outcome**: The minimized window is restored and focused, and the target tab becomes active.

### Scenario 3: Singleton Tab Verification
1. Open multiple windows.
2. In Window A, perform a search in Virtual Dashboard mode. Verify the dashboard tab is created in Window A.
3. Go to Window B, open the popup, and run a different search term.
4. **Expected Outcome**:
   * No new tab is opened in Window B.
   * Window A is brought to the front and focused.
   * The existing dashboard tab in Window A is selected, and its results are updated to reflect the new search term.

### Scenario 4: Real-time Refinement & Keyboard Controls
1. Open the search results dashboard.
 2. Focus the search input field on the dashboard page and type a different search keyword.
 3. Verify that the results update in real-time under 100ms.
 4. Collapse one window section via its header. Press **Arrow Down**/**Arrow Up** through the full list.
    **Expected Outcome**: the highlight never enters the collapsed section.
 5. Press **Arrow Down** and **Arrow Up** to navigate through the listed search results.
 6. Highlight a result and press **Enter**.
 7. **Expected Outcome**:
    * The highlighted tab is activated, and its window is brought to the front.
    * **SC-002**: Activation via Enter also completes in **under 250ms** (use the Scenario 2 console measurement, pressing Enter on the highlighted result instead of clicking).
 8. Re-open/activate the dashboard, check the option **Keep dashboard open after selecting a tab**, and repeat.
 9. **Expected Outcome**:
    * The highlighted tab is activated, but the dashboard tab remains open in the background.

### Scenario 5: Performance at Scale (SC-001, SC-004)
1. Open **50+ windows** with **500+ tabs** total (distinct titles/URLs), or use a script to create them.
2. Open the popup, enter a search term that matches a large subset of tabs, and click **Search**.
3. **Expected Outcome (SC-001)**: The dashboard tab renders all matching tabs grouped by window in **under 1 second** from initiating the search (URL/title/fuzzy matching; content search excluded).
   * *Measurement*: Record absolute timestamps (`performance.timeOrigin + performance.now()` or `Date.now()`) at the moment search is clicked in the popup and when the first result is painted in the dashboard (or use the DevTools Performance panel). The delta must be < 1000ms.
4. With the dashboard open and focused on the search input, type a single character.
5. **Expected Outcome (SC-004)**: The results list updates in **under 100ms** from the keypress (URL/title/fuzzy matching; content search excluded).
   * *Measurement*: In the DevTools Performance panel, record typing a single character into the search input. Measure the total elapsed time from the keypress event to the paint event of the updated search results (ensuring neither pre-handler dispatch delay nor post-render paint is excluded). The duration must be < 100ms.
