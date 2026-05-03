![CI/CD](https://github.com/irvinm/TabSearch/workflows/CI/CD/badge.svg) ![Mozilla Add-on](https://img.shields.io/amo/users/Tab-Search?style=flat-square) ![](https://img.shields.io/amo/v/Tab-Search.svg?style=flat-square)


# TabSearch

## Inspiration
- As a power user of Tree Style Tab (TST) and a user usually with large sessions with many tabs, I wanted to create a unique experience primarily focused on vertical tab solutions utilitzing Firefox's native ability to hide tabs.  When doing searches, tabs that do not meet your search criteria will be hidden until you find the tab you want or cancel the search.  Tabs are only hidden temporarily and never permanently.  This addon works independantly of vertical tab solutions and will work for everyone.
  
## Features

### Core Search

- Search open tabs by URL, title, or page content (text inside loaded tabs).
- **Fuzzy Matching**: Powered by Fuse.js v7.3.0 with Token Search for superior multi-word matching (e.g., "Mail Google" finds "Google Mail") and a configurable threshold slider (0.0 to 1.0).
- Hide all non-matching tabs for a focused search experience.
- Tab hiding is temporary: all tabs are restored when the search is cleared or the popup is closed.
- Never hides pinned or active tabs.

### Search Behavior

- Supports real-time search (filter as you type) or manual search (on submit).
- Hides and shows tabs across all browser windows for comprehensive search.
    - The active tab in each window always remains visible, as it cannot be hidden.
- If search-affecting options are changed mid-search, the active search is cleared and tabs are restored to their pre-search state.
    - Search-affecting options are: Search URLs, Search tab titles, Search contents of loaded tabs, Real-time search, Support for Tree Style Tab (TST), and Auto-expand trees with matched tabs.
    - "Select all matching tabs on close" and "Disable initial hide action" do not interrupt an in-progress search.

### Keyboard and Productivity

- Keyboard shortcut to open the search dialog.
    - Customizable via about:addons -> gear -> Manage Extension Shortcuts.
- Audio tab search: quickly find and focus tabs playing audio.
- Option to multi-select matching tabs after search is complete.
    - "Select all matching tabs on close" only applies when the search session ends.
- Shows the number of remaining tabs to be hidden/shown on the addon icon.

### Tree Style Tab (Optional)

- Optional support for Tree Style Tab (TST).
- TST search results are visually flattened during a search for faster scanning.
    - Matching tabs are left-aligned and rendered with symmetric horizontal spacing while the search is active.
    - The original tree structure is restored after the search ends.
- Optional auto-expand behavior for matched tabs in close-time multi-select flows.
    - The "Auto-expand trees with matched tabs" option is shown only when TST support is enabled.

### Permission Initialization

- Option to disable the initial tab-hiding action (once the privacy dialog is accepted).
    - The addon briefly hides and shows the last tab on startup to trigger Firefox's tab-hiding permission prompt.
    - Once permission is granted, you can disable this startup initialization step.


## Search Dialog Behavior

- Opening the popup starts a search session scoped to the current state of visible/hidden tabs.
- While searching, changing some options will clear the search input and restore tabs to their pre-search state so results stay consistent.

### Options That Reset an Active Search

- Search URLs
- Search tab titles
- Search contents of loaded tabs
- Real-time search
- Support for Tree Style Tab (TST)
- Auto-expand trees with matched tabs

### Options That Do Not Reset an Active Search

- Select all matching tabs on close
- Disable initial hide action

### Notes

- "Select all matching tabs on close" applies when the search session ends; it does not change in-progress filtering.
- "Disable initial hide action" only affects the startup permission initialization step; it does not change matching/filtering during a search.
- "Auto-expand trees with matched tabs" is only shown when TST support is enabled.
- Clicking either blue info button cancels any active search, restores tab visibility/state, opens the help page in a new active tab, and closes the popup.


## Limitations

- Content search only works on loaded, regular web pages (not special pages like about:blank or browser settings).
    - Tabs that are unloaded (discarded) cannot be searched until loaded.
- Search is case-insensitive. Standard search uses substring matching, while Fuzzy Matching uses Fuse.js.
- Hiding or unhiding a large number of tabs may be slow, especially with many open tabs.
- Uses the `tabs.hide()` API, which requires explicit user permission and may show a privacy dialog on first use.
    - [Mozilla Discourse Discussion](https://discourse.mozilla.org/t/initial-tabs-hide-warning-dialog/142979/4)
    - [Mozilla Bugzilla Report](https://bugzilla.mozilla.org/show_bug.cgi?id=1964491)
- Opening the search dialog should select the search input field by default, but a Firefox bug may require you to click the input field manually.
    - [Mozilla Discourse Discussion](https://discourse.mozilla.org/t/use-of-autofocus-in-popup-html-not-consistent/143017/2)
    - [Mozilla Bugzilla Report](https://bugzilla.mozilla.org/show_bug.cgi?id=1877410)
- Tab content search requires at least 3 characters in the search term.
- When "Select all matching tabs on close" is enabled with multiple open windows, there is a Firefox limitation that dragging tabs has to be done PER window.


## Known Issues

- Initial use will trigger a Firefox privacy dialog about tab hiding (expected behavior).
    - If permission is not granted, the dialog may reappear and cause UI conflicts.

- Performance may degrade with very large tab sets.
- Real-time searching may be slow on older or slower machines.
- Does not detect if another extension is also using the `tabs.hide()` API (may cause conflicts).
- Some features (like content search) may not work on all tab types.


## Addon Icon

[Search icons created by Maxim Basinski Premium - Flaticon](https://www.flaticon.com/free-icons/search)


## Changelog

<details open>
<summary><strong>v0.7.0 (2026-05-03) - Fuzzy Matching and Documentation Overhaul</strong></summary>

- Added **Fuzzy Matching** powered by Fuse.js v7.3.0.
    - Integrated **Token Search** for superior multi-word matching (e.g., searching "Mail Google" finds "Google Mail").
    - Intelligent relevance ranking using BM25-style IDF weighting.
    - User-configurable threshold slider (0.0 to 1.0) in the popup.
    - Persisted settings across browser sessions.
- Standardized Documentation & Guidance.
    - Added theme-aware (Light/Dark mode) info pages for Fuzzy Matching, Privacy, and Search Contents.
    - Standardized page titles and added addon favicons to all extension pages.
- TST Hardening and Mitigations.
    - Implemented mitigations for [Issue #13](https://github.com/irvinm/TabSearch/issues/13) regarding TST tree restoration reliability.
    - Implemented state locking and robust error boundaries for TST communication.
- UI/UX Refinements.
    - Modernized all info pages with a unified card-based layout and standardized typography.
    - Improved "Close Guide" button reliability across all help pages.
</details>

<details>
<summary><strong>v0.6.0 (2026-04-25) - Popup UX and TST Improvements</strong></summary>

- Clarified option reset behavior in the popup.
    - Search-affecting options clear the active search and restore tabs to their pre-search state.
    - Both TST options ("Support for Tree Style Tab" and "Auto-expand trees with matched tabs") now reset an active search to ensure TST state is fully restored.
    - "Select all matching tabs on close" and "Disable initial hide action" do not reset an active search.
- Updated the TST search presentation.
    - Flattened search results now keep a consistent left and right gutter while searching.
    - Added defensive TST CSS so custom tab margins are less likely to break the flattened search layout.
- Updated the popup relationship between TST options.
    - The "Auto-expand trees with matched tabs" option is now progressively disclosed and only shown when TST support is enabled.
- Updated info-button behavior in the popup.
    - Opening privacy/content help now first resets any active search, then opens the help page in an active tab and closes the popup.
</details>

<details>
<summary><strong>v0.5.5 (2025-06-18) - Manual Selection and Collapsed Tree Fixes</strong></summary>

- Fixed https://github.com/irvinm/TabSearch/issues/11.
    - (General) Fixed issue where manually selecting a tab from a search would not make that tab the active tab.
    - (TST) Fixed issue where manually selecting a tab that was in a collapsed tree would be selected, but when the tree was restored (collapsed), the parent ends up becoming the active tab.
</details>

<details>
<summary><strong>v0.5.2 (2025-06-15) - Tree Tracking and Logging Cleanup</strong></summary>

- Updated logic for tracking TST parents and tree states.
- Updated the logging to ensure "[TabSearch]" is included for all statements.
</details>

<details>
<summary><strong>v0.5.1 (2025-06-14) - TST Performance Optimizations</strong></summary>

- Performance improvements via reduced actions for TST.
    - (TST) Ensure register with TST only once per session.
    - (TST) Only "expand all trees" once per search per window.
    - (TST) Only apply "flattened" style once per search.
    - (TST) Refactor tree restoration process to only call parents, not every tab.
</details>

<details>
<summary><strong>v0.5.0 (2025-06-12) - Initial Tree Style Tab Support</strong></summary>

- Added initial support for Tree Style Tab (TST).
    - Interacts directly with TST to apply a flattening style to matched tabs while searching and to remove any twistys.
    - Expands all trees during the search to ensure visibility.
    - Restores the original state of trees (expanded/collapsed) after the search is complete.
- If search-affecting options are changed mid-search, the search is cleared and restarted.
    - This keeps behavior consistent when search options are changed during an active session.
- Disabled being able to use "tab" to switch between UI elements.
    - There is a Firefox limitation that popup.html can be destroyed too fast to generate an "unload" event to be processed.
    - Monitoring for "focusout" works well, but also included keyboard transitions to other UI elements.
- Added new option for TST to "auto-expand" trees if the option to "Select all matching tabs on close" is also enabled.
    - This ensures you can visually find all highlighted tabs even if they were buried in collapsed trees.
</details>

<details>
<summary><strong>v0.4.1 (2025-05-31) - Multi-Window Close-Time Selection Fix</strong></summary>

- Fixed [Select all matching tabs on close - Multiple windows not working](https://github.com/irvinm/TabSearch/issues/2).
    - Selecting matching tabs across multiple windows should now work.
    - There is a Firefox limitation that dragging tabs has to be done per window.
</details>

<details>
<summary><strong>v0.4.0 (2025-05-29) - Close-Time Multi-Select Option</strong></summary>

- Added new option to multi-select matching tabs.
</details>

<details>
<summary><strong>v0.3.0 (2025-05-27) - Search Counter and Popup UX Improvements</strong></summary>

- Added support to show the number of tabs still to be processed (hidden or shown) in the addon icon counter.
- Reduced the amount of whitespace near the borders of the search popup.
- Disabled the search button when "real-time searches" are enabled.
- Cleaned up some logic around options to avoid searches from being cleared mid-search.
</details>

<details>
<summary><strong>v0.2.0 (2025-05-25) - Audio Tab Search Experience</strong></summary>

- Updated styling for the search dialog.
- Added support for searching tabs playing audio.
    - 0 matches: Shows a custom dialog indicating no tabs were found.
    - 1 match: Switches directly to that tab.
    - 2+ matches: Hides all non-audio tabs.
</details>

<details>
<summary><strong>v0.1.0 (2025-05-22) - Initial Release</strong></summary>

- Initial release support for:
    - Searching tab URL.
    - Searching tab title.
    - Searching tab content (text inside loaded tabs).
    - Option to initially hide a tab in order to get Firefox to ask for explicit permission.
    - Option for real-time search (filter as you type) or manual search (on submit).
    - Keyboard shortcut support to bring up search dialog.
    - Support to change key assignment via standard about:addons -> gear -> Manage Extension Shortcuts.
</details>
