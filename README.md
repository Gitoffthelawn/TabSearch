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
- **Pinned and Active Tabs Safety**: Firefox's `tabs.hide()` WebExtension API strictly prohibits hiding pinned tabs (`tab.pinned === true`) and currently active tabs (`tab.active === true`). In classic tab-hiding mode, any pinned tabs and the active tab will always remain visible on your tab strip even if they do not match your search query.
- **Native Tab Groups**: Firefox's `tabs.hide()` API operates on individual tabs, not group headers. In classic tab-hiding mode, Firefox currently leaves the native tab group header visible on the tab strip even if all member tabs within that group are hidden (Firefox platform limitation). Use the **Virtual Search Results Dashboard** mode to avoid seeing empty tab group headers.

### Search Behavior

- Supports real-time search (filter as you type) or manual search (on submit).
- Hides and shows tabs across all browser windows for comprehensive search.
    - The active tab in each window always remains visible, as it cannot be hidden.
- If search-affecting options are changed mid-search, the active search is cleared and tabs are restored to their pre-search state.
    - Search-affecting options are: Search URLs, Search tab titles, Search contents of loaded tabs, Virtual search results dashboard, Real-time search, Fuzzy matching, Support for Tree Style Tab (TST), and Auto-expand trees with matched tabs.
    - "Select all matching tabs on close" and "Disable initial hide action" do not interrupt an in-progress search.

### Keyboard, Appearance, and Productivity

- **Dark Theme with Sun/Moon Toggle**: One-click Sun/Moon toggle button in both the extension popup and Virtual Dashboard header with seamless, real-time bidirectional synchronization between both views. Defaults to following the system or browser's dark mode preference (`prefers-color-scheme: dark`) with manual override support.
- **Streamlined Search Bar & Dynamic Placeholder**: Dedicated search input maximizes typing space with natural `Enter` key execution in place of a redundant search button. The placeholder dynamically guides users with `"Search Term"` during real-time filtering and `"Search Term (Press Enter)"` when manual execution or Virtual Dashboard mode is enabled.
- **Unified Sub-Option Tree Hierarchy**: Clean, accessible tree connectors (`└──`) visually nest child sub-options (the fuzzy matching threshold slider and Tree Style Tab auto-expand option) beneath their parent checkboxes with dedicated rows that prevent text wrapping.
- Keyboard shortcut to open the search dialog.
    - Customizable via about:addons -> gear -> Manage Extension Shortcuts.
- Audio tab search: quickly find and focus tabs playing audio.
- Option to multi-select matching tabs after search is complete.
    - "Select all matching tabs on close" only applies when the search session ends.
- Shows the number of remaining tabs to be hidden/shown on the addon icon.

### Virtual Search Results Dashboard

- **Ideal for Low-Resource Machines & Multi-Window Setups**: Designed specifically to provide a unified view of search results across multiple windows, while helping users on low-resource machines by eliminating the performance overhead of hiding and showing potentially many tabs.
- Option to switch from traditional tab-hiding to a dedicated, consolidated search dashboard tab.
- Groups matching tabs by browser window with the active window listed first.
- Direct inline search refinement and real-time filtering without re-opening the popup.
- Interactive collapse/expand controls per window section with saved state.
- Keyboard navigation (Arrow Up/Down, Enter) to jump directly to target tabs across any window.
- Smart auto-close: automatically closes the dashboard tab when switching away to another tab or changing window focus (configurable via "Keep dashboard open after selecting a tab").
- Real-time tab lifecycle synchronization (updates dynamically when tabs are opened, closed, navigated, or moved).
- Native Firefox and Web Favicons:
    - Displays the authentic, full-color Firefox logo for native browser tabs (`about:blank`, `about:newtab`, `about:home`, `about:welcome`).
    - Dedicated Mozilla Photon SVG icons for protected internal pages (`about:addons`, `about:preferences`, `about:config`, `about:downloads`, `about:history`, `about:bookmarks`, `about:debugging`, `about:support`).
    - Neutral Firefox globe fallback for web pages without a favicon.
    - Adaptive light/dark theme support for all embedded SVGs.
- **Pinned Tabs Support & Visual Badges**: Matching pinned tabs are included in search results without modifying the tab strip, and are prominently tagged with a dedicated "Pinned" badge.

### Tree Style Tab (Optional)

- Optional support for Tree Style Tab (TST).
- TST search results are visually flattened during a search for faster scanning.
    - Matching tabs are left-aligned and rendered with symmetric horizontal spacing while the search is active.
    - The original tree structure is restored after the search ends.
- Optional auto-expand behavior for matched tabs in close-time multi-select flows.
    - The "Auto-expand trees with matched tabs" option is shown only when TST support is enabled.

### Permission Initialization

- One-time onboarding setup: On the first click of the addon icon after installation, TabSearch displays a welcome view with guidance on Firefox's native tab-hiding permission requirement.
- Option to disable the initial tab-hiding action (once the permission dialog has been granted).
    - The addon uses a temporary background tab to trigger Firefox's tab-hiding permission prompt without disturbing or shifting existing user tabs.
    - Once permission is granted, you can disable this initialization step.


## Search Dialog Behavior

- Opening the popup starts a search session scoped to the current state of visible/hidden tabs.
- While searching, changing some options will clear the search input and restore tabs to their pre-search state so results stay consistent.

### Options That Reset an Active Search

- Search URLs
- Search tab titles
- Search contents of loaded tabs
- Virtual search results dashboard
- Real-time search
- Fuzzy matching (titles and URLs)
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
<summary><strong>v0.8.2 (2026-09-27) - Virtual Search Results Dashboard, Dark Theme Mode, Permission Streamlining & Background Script Reliability</strong></summary>

### Major Highlights

1. **Virtual Search Results Dashboard**:
   - A high-performance alternative to traditional tab-hiding, designed specifically for heavy multi-window browsing sessions and older or resource-constrained machines.
   - Consolidates all matching tabs across all windows into a single, dedicated dashboard tab (`search-results.html`) without triggering mass tab strip reflows or hiding tabs in background windows.
   - Includes real-time inline query refinement, collapsible window sections with saved state, full keyboard traversal (Arrow Up/Down, Enter), and instant tab/window jump with automatic restoration of minimized windows.
   - Displays clear "Pinned" badges on matching pinned tabs to preserve visibility while honoring Firefox platform constraints.
2. **Dark Theme Mode with Sun/Moon Toggle**:
   - Added an accessible Sun/Moon icon toggle button to both the extension popup search bar and the Virtual Search Results Dashboard header.
   - Full real-time bidirectional synchronization: toggling the theme in either view instantly updates both interfaces.
   - System-adaptive: automatically follows the user's OS / Firefox dark mode preference (`prefers-color-scheme: dark`) when unset, while honoring manual overrides via persistent local storage.
3. **Popup Layout Streamlining & Dynamic Guidance**:
   - Redesigned search bar with natural `Enter` key submission, eliminating redundant buttons while keeping the popup compact alongside theme and audio controls.
   - Contextual placeholder text dynamically indicates active search mode (`"Search Term"` during real-time filtering vs. `"Search Term (Press Enter)"` for manual or dashboard execution).
   - Visual tree branch connectors (`└──`) neatly nest child sub-options (the fuzzy matching threshold slider and Tree Style Tab auto-expand option) beneath their parent checkboxes without text wrapping.
4. **Permission Streamlining & Least-Privilege Security**:
   - Eliminated unused `<all_urls>` host permissions from `manifest.json`.
   - Stops Firefox from displaying the persistent green attention dot under the toolbar icon on startup and eliminates unnecessary optional permission warnings in `about:addons`.
   - Requests only strictly required minimal permissions (`tabs`, `tabHide`, `storage`, `find`).
5. **New Post-Install Onboarding & Permission Flow**:
   - Elegant first-run welcome screen in `popup.html` presented only upon first opening the popup after installation.
   - Explains Firefox's native tab-hiding permission requirement and guides the user to select "Keep tabs hidden" before safely invoking the permission doorhanger via a temporary background tab.
6. **Tree Style Tab (TST) Resilience & Background Reliability**:
   - Persists TST hierarchy snapshots and active search locks to local storage, ensuring tree structures can be reliably restored even if Firefox suspends the background script during idle periods.
   - Maintains an active communication port heartbeat between popup and background scripts during search sessions to prevent premature background suspension and race conditions.

---

### Detailed Breakdown

#### 1. Virtual Search Results Dashboard Mode
- **Low-Resource & Multi-Window Optimization**: Built specifically for users with multi-window setups who want a unified view of search results, and for low-resource machines by eliminating the performance overhead of hiding and showing potentially many tabs.
- **Singleton Dashboard Tab**: Dedicated search dashboard page (`search-results.html`) consolidating search results across all browser windows into one organized tab.
- **Window Grouping & Priority**: Multi-window results are grouped by window, with the currently active window pinned first and remaining windows sorted in ascending window ID order.
- **Inline Query Refinement**: Live query input and search scope toggles (URLs, titles, page contents, fuzzy threshold) directly inside the dashboard.
- **Collapsible Window Sections**: Interactive per-window accordion controls with persistent collapsed/expanded state (`collapsedWindows`).
- **Keyboard Navigation**: Full keyboard traversal (Arrow Up, Arrow Down, Enter) that automatically skips collapsed windows and jumps directly to the highlighted tab.
- **Window Restoration on Jump**: Selecting a tab automatically un-minimizes/restores and focuses background windows.
- **Window Badges & Match Summary**: Real-time matching tab count badges on window headers and total matches summary counter.
- **Configurable Auto-Close**: Option to automatically close the dashboard tab when switching away to another tab or defocusing the window ("Keep dashboard open after selecting a tab").
- **Live Tab Lifecycle Sync**: Dynamic updates as tabs are created, updated, removed, moved, attached, or detached across windows within 1 second.
- **Authentic Firefox & Photon Branding**: Full-color Firefox logos for `about:blank`/`about:newtab`, dedicated Mozilla Photon SVGs for internal pages (`about:addons`, `about:preferences`, etc.), and clean globe fallbacks.
- **Pinned Tab Support & Visual Badges**: Matching pinned tabs are included in search results without modifying the tab strip, and are clearly tagged with an accessible "Pinned" badge.
- **Popup Synchronization**: Popup automatically disables and grays out non-applicable tab-hiding options when Virtual Dashboard mode is active.

#### 2. Dark Theme Mode & UI Refinements
- **Quick Theme Toggle**: Sun/Moon SVG button in both popup and dashboard with smooth hover feedback.
- **Bidirectional Sync**: Real-time cross-view synchronization via `browser.storage.onChanged`.
- **System Theme Detection**: Defaults to OS/browser `prefers-color-scheme`, with manual override saved to `browser.storage.local`.
- **High-Contrast Palette**: Theme-aware color variables ensuring compliant contrast across all elements, including window badges, inputs, sliders, and modals.
- **Dynamic Search Placeholder**: Automatically indicates `"Search Term (Press Enter)"` when manual searching or dashboard mode is active.
- **Tree-Style Sub-Option Branches**: Clean `└──` visual connectors with centered vertical stems for fuzzy slider and TST auto-expand options.

#### 3. Post-Install Onboarding & Permission Workflow
- **First-Run Welcome Screen**: Clean intro screen in `popup.html` presented only upon first opening the popup after installation.
- **Permission Guidance**: Clear explanation of Firefox's native tab-hiding permission requirement with explicit instructions on clicking "Keep tabs hidden".
- **Non-Disruptive Triggering**: Uses a temporary background tab to safely invoke Firefox's native permission doorhanger without shifting or disturbing the user's active browsing tabs.
- **Deferred Execution**: Zero intrusive prompts during initial addon installation; triggers only when the user deliberately opens TabSearch for the first time.

#### 4. Permission Streamlining & Least Privilege Security
- **Eliminated Unused Host Permissions**: Removed `host_permissions: ["<all_urls>"]` from `manifest.json`.
- **Eliminated Attention Dot & Optional Prompts**: Stops Firefox from displaying the green attention dot under the extension toolbar icon on startup and eliminates optional permission prompts in `about:addons`.
- **Updated Privacy Guarantees**: Updated `privacy.html` documentation to explicitly clarify zero broad host permissions (no access to cookies, web requests, credentials, or file systems), noting that user-enabled page content search operates strictly locally via Firefox's in-memory `find` API.
- **Manifest Integrity Tests**: Automated unit test suite (`tests/manifest.test.js`) verifying strict minimal permissions and version synchronization between `package.json` and `manifest.json`.

#### 5. Tree Style Tab (TST) Resilience & Background Reliability
- **Storage-Backed State Rehydration**: Serializes pre-search TST tree snapshots and active search locks to `browser.storage.local`, ensuring tree structures can be restored even if the background script is suspended by Firefox during idle periods.
- **Popup-Lifecycle Port Heartbeat**: Maintains an active communication port between popup and background scripts during search sessions to prevent premature background script suspension.
- **Search Queue & Lock Guarding**: Intercepts rapid keyboard input to process searches sequentially and avoids snapshot overwriting during rapid popup open/close transitions.
- **Restoration Grace Window**: Added delayed restoration safeguards to handle out-of-order Firefox tab activation events when closing the search popup.

#### 6. Documentation & Known Platform Limitations
- **Firefox Native Tab Groups Limitation**: Documented that Firefox leaves native tab group headers visible on the tab strip during tab-hiding searches even when all child tabs are hidden, as Firefox currently lacks an API to hide group headers (recommending the Virtual Dashboard mode as an alternative).
- **Firefox tabs.hide() Pinned & Active Tabs Restriction**: Clarified that Firefox's `tabs.hide()` WebExtension API strictly prohibits hiding pinned tabs and the currently active tab. In classic tab-hiding mode, non-matching pinned tabs remain visible on the tab strip by design. In Virtual Dashboard mode, matching pinned tabs are included in search results and prominently labeled with a "Pinned" badge.
</details>

<details>
<summary><strong>v0.7.1 (2026-07-04) - TST State Restoration Hardening and Permission Verification</strong></summary>

- **Tab Hide Permission Verification UI/UX**:
    - Added a user-friendly permission warning banner (`.permission-banner` with interactive controls) to `popup.html` when the `tabHide` browser permission is not yet active/confirmed.
    - Prompts the user to trigger the Firefox native permission doorhanger and guides them to choose "Keep" (allow).
    - **Deferred Verification**: Triggered only upon the first time the user opens the extension popup (clicking the addon icon) rather than at installation or startup, ensuring a non-intrusive install experience.
    - Integrates background verification check (`check-tabhide-permission` action) that programmatically verifies permission status using a temporary tab.
- **TST State Restoration Hardening** (mitigating [Issue #13](https://github.com/irvinm/TabSearch/issues/13) race conditions):
    - **State Locking (`snapshotInProgress`)**: Added module-level lock to ensure atomic TST state capture and prevent overwriting clean snapshots.
    - **Persistence Tracking (`originalTSTTreeSnapshotTaken`)**: Tracks pre-search tree states to prevent trying to restore un-snapshotted states.
    - **Error Boundaries (`try...finally`)**: Wrapped all main TST orchestration blocks to guarantee state tracking resets even on communication failures.
    - **Delayed Restoration & Activation Grace Window**: Handles Firefox out-of-order events upon popup close and preserves branch expansion for the newly activated tab.
    - **Search Operation Queue (`pendingSearchMsg`)**: Intercepts and queues rapid keyboard input to ensure search operations run sequentially and cleanly.
    - **Empty Search Term Restoration**: Triggers immediate restoration of tree states when the search input is cleared/emptied, even if the popup remains open.
    - **Awaiting Active Searches on Reset/Close**: Cancels pending search requests and awaits active search completion with a 5-second timeout safeguard to eliminate race conditions.
</details>




<details>
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
