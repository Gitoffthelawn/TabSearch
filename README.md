![CI/CD](https://github.com/irvinm/TabSearch/workflows/CI/CD/badge.svg) ![Mozilla Add-on](https://img.shields.io/amo/users/Tab-Search?style=flat-square) ![](https://img.shields.io/amo/v/Tab-Search.svg?style=flat-square)


# TabSearch

## Inspiration
- As a power user of Tree Style Tab (TST) and a user usually with large sessions with many tabs, I wanted to create a unique experience primarily focused on vertical tab solutions utilitzing Firefox's native ability to hide tabs.  When doing searches, tabs that do not meet your search criteria will be hidden until you find the tab you want or cancel the search.  Tabs are only hidden temporarily and never permanently.  This addon works independantly of vertical tab solutions and will work for everyone.
  
## Features

- Search open tabs by URL, title, or page content (text inside loaded tabs).
- Hide all non-matching tabs for a focused search experience.
- Hides and shows tabs across all browser windows for a comprehensive search.
    - The active tab in each window always remains visible, as it cannot be hidden.
- Real-time search (filter as you type) or manual search (on submit).
- Audio tab search: quickly find and focus tabs playing audio.
- Keyboard shortcut for quick access to the search dialog.
    - Customizable keyboard shortcut via about:addons → gear → Manage Extension Shortcuts.
- Option to disable the initial tab hiding action (once the privacy dialog is accepted).
    - The addon hides and shows the last tab on startup to trigger Firefox’s permission prompt without interfering with the search dialog. Once permission is granted, you can disable this behavior. See the limitations section for more information and links.
- Never hides pinned or active tabs.
- Tab hiding is temporary: all tabs are restored when the search is cleared or the popup is closed.
- Keyboard shortcut to open the search dialog.
- Shows the number of remaining tabs to be hidden/shown on the addon icon
- Option to multi-select matching tabs after search is complete


## Limitations

- Content search only works on loaded, regular web pages (not special pages like about:blank or browser settings).
    - Tabs that are unloaded (discarded) cannot be searched until loaded.
- Search is case-insensitive and uses simple substring matching (not true fuzzy search).
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
- No fuzzy matching or typo tolerance (feature possibly planned).
- Performance may degrade with very large tab sets.
- Real-time searching may be slow on older or slower machines.
- Does not detect if another extension is also using the `tabs.hide()` API (may cause conflicts).
- Some features (like content search) may not work on all tab types.


## Addon Icon

[Search icons created by Maxim Basinski Premium - Flaticon](https://www.flaticon.com/free-icons/search)


## Changelog

<details id="History"><summary>History</summary>

### v0.5.1
- Performance improvements via reduced actions for TST
    - (TST) Ensure register with TST only once per session
    - (TST) Only "expand all trees" once per search per window
    - (TST) Only apply "flatted" style once per search
    - (TST) Refactor tree restoration process to only call parents, not every tab

### v0.5.0
- Added initial support for Tree Style Tab (TST)
    - Interacts directly with TST to apply a flattening style to matched tabs while searching and to remove any twistys
    - Expands all trees during the search to ensure visibility
    - Restores the original state of tress (expanded/collapsed) after the search is complete
- If options of the search are changed mid-search, the search is cleared and restarted
    - Want consistent results and not have to worry if changing an option mid-search is logical or not
- Disabled being able to use "tab" to switch between UI elements
    - There is a Firefox limitation that popup.html can be destroyed too fast to generate an "unload" event to be processed
    - Monitoring for "focusout" works well, but also included keyboard transitions to other UI elements
- Added new option for TST to "auto-expand" trees if the option to "Select all matching tabs on close" is also enabled
    - This would ensure you can visually find all the highlighted tabs even if they were buried in collapsed trees

### v0.4.1
  - Fixed [Select all matching tabs on close - Multiple windows not working](https://github.com/irvinm/TabSearch/issues/2)
    - Selecting matching tabs across multiple windows should now work
    - There is a Firefox limitation that dragging tabs has to be done PER window

### v0.4.0
- Added new option to multi-select matching tabs

### v0.3.0
- Added support to show the number of tabs still to be processed (hidden or shown) to the addon icon counter
- Reduced the amount of white-space near the borders of the search popup
- Disabled the search button when "real-time searches" are enabled
- Cleaned up some logic around options to avoid searches from being cleared mid-search

### v0.2.0
- Updated styling for the search dialog.
- Added support for searching tabs playing audio:
    - 0 matches: Shows a custom dialog indicating no tabs were found.
    - 1 match: Switches directly to that tab.
    - 2+ matches: Hides all non-audio tabs.

### v0.1.0
- Initial release support for:
    - Searching tab URL
    - Searching tab title
    - Searching tab content (text inside loaded tabs)
    - Option to initially hide a tab in order to get Firefox to ask for explicit permission
    - Option for real-time search (filter as you type) or manual search (on submit)
    - Keyboard short-cut support to bring up search dialog
    - Support to change key assignment via standard about:addons → gear → Manage Extension Shortcuts
</details>
