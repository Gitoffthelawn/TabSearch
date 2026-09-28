## Summary
Find tabs fast by title, URL, or page text. View results in a dedicated Virtual Dashboard tab or temporarily hide non-matching tabs. Includes Tree Style Tab support, fuzzy search, and close-time multi-select.

## Description
**Tab Search helps you find the right tab without tab chaos.**

Whether you have dozens or hundreds of tabs across multiple windows, Tab Search lets you quickly find what you need. Choose between a dedicated **Virtual Search Results Dashboard** or classic **Tab Hiding** mode to streamline your browsing.

**Two Ways to Search**
- **Virtual Search Results Dashboard**: Consolidates matches from all windows into a single, clean dashboard tab. Ideal for multi-window workspaces wanting a unified view of search results, and for low-resource machines by eliminating the performance overhead of hiding and showing many tabs. Groups tabs by window, supports instant jump/activation, keyboard navigation (Arrow Up/Down, Enter), collapsible window groups, and live sync as tabs open or close. Automatically closes when you switch away (or stays open if preferred). Displays clear "Pinned" badges for pinned tabs.
- **Tab Hiding Mode**: Temporarily hides non-matching tabs directly in your browser tab strip for a clutter-free view, then restores all tabs when your search ends.

**What you can do**
- Search open tabs across all windows by URL, title, or page text (content search)
- **Fuzzy matching**: Typo-tolerant search with multi-word support (Powered by Fuse.js v7.3.0) with an adjustable threshold slider
- Real-time filtering while typing or on-demand manual search (with dynamic placeholder guidance and Enter key execution)
- Streamlined compact popup design with intuitive visual tree connectors for nested options (fuzzy threshold slider and Tree Style Tab controls)
- Audio tab search: quickly locate and switch to tabs playing audio
- Authentic native Firefox icons: full-color Firefox logos for `about:newtab`/`about:blank` and Photon SVGs for `about:addons`, `about:preferences`, and developer tools
- Optionally multi-select all matching tabs when the search session ends
- Progress counter on the toolbar icon badge while tabs are processed
- **Dark Theme with Sun/Moon Toggle**: One-click quick theme toggle in both the popup and Virtual Dashboard with real-time bidirectional synchronization, plus automatic system dark mode detection
- Theme-responsive documentation and help guides
- Guided post-install setup: clear first-run onboarding walks you through granting Firefox's tab-hiding permission

**Tree Style Tab support (optional)**
- Seamless integration with [Tree Style Tab](https://addons.mozilla.org/en-US/firefox/addon/tree-style-tab/)
- Visually flattens matched tabs during search for fast vertical scanning
- Automatically restores original tree structure when the search concludes
- Optional auto-expand for matched trees in multi-select workflows
- Background state reliability: maintains an active connection while the popup is open to prevent background suspension, backed by local storage rehydration so tree expand/collapse states are never lost

**Privacy and permissions (plain language)**
- Runs 100% locally in your browser; no data is ever collected or sent to external servers
- Strictly minimal permissions: requests only essential tab and storage APIs; requires zero broad host permissions (no "all URLs" access) and has no access to browsing history, cookies, or credentials
- Uses standard Firefox tab APIs to display or temporarily hide tabs during search
- Hidden tabs are temporary and always restored after search
- Firefox prompts for permission the first time tab hiding is activated; a guided welcome screen makes this setup effortless

**Important notes**
- Page content search works on loaded, regular web pages (requires at least 3 characters)
- Supports both standard substring matching and typo-tolerant fuzzy matching
- Pinned and active tabs are never hidden: Firefox's `tabs.hide()` API strictly prohibits hiding pinned tabs and the active tab in each window. In classic tab-hiding mode, they remain visible on your tab strip even when non-matching. In the Virtual Search Results Dashboard, matching pinned tabs are included and highlighted with an accessible "Pinned" badge.
- **Native Tab Groups**: When using classic tab hiding mode, Firefox currently leaves the native tab group header visible on the tab strip even if all member tabs are hidden (Firefox platform limitation; use the Virtual Dashboard mode if you prefer not to see empty group headers)

**Support and source**
- Source and issues: [GitHub - irvinm/TabSearch](https://github.com/irvinm/TabSearch)
- Full changelog & release history: [README.md on GitHub](https://github.com/irvinm/TabSearch#changelog)

