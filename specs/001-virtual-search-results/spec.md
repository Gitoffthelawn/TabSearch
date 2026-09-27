# Feature Specification: Virtual Search Results Dashboard

**Feature Branch**: `001-virtual-search-results`

**Created**: 2026-07-04

**Status**: Final

**Input**: User description: "Use the contents of Virtual-Search-Results.md as the next feature to be implemented."

## Clarifications

### Session 2026-07-04

- Q: What search matching strategy should the query input field on the dashboard support? → A: The dashboard page mirrors the popup search options (Search URLs, Search tab titles, Search contents of loaded tabs, and Fuzzy matching with a configurable threshold), loading and syncing preferences from extension storage (specified in FR-009).
- Q: If the dashboard tab is already open in Window A, and the user runs a search from the popup in Window B, what should happen? → A: Update the dashboard tab in Window A, focus that tab, and bring Window A to the front (specified in FR-004).

### Session 2026-08-30

- Q: How should the <100ms real-time filter target (SC-004) interact with "Search contents of loaded tabs" on the dashboard? → A: The 100ms bound applies to URL/title/fuzzy matching only; content search re-runs on the same debounced keystroke cycle with no strict latency bound, since it performs per-tab content lookups that may take longer on large tab sets.
- Q: What should the dashboard display when the query is empty (e.g., the user clears the input box)? → A: List all tabs grouped by window (empty query = no filter), consistent with the popup's existing empty-search behavior.
- Q: How should arrow-key navigation treat results inside collapsed (hidden) window sections? → A: Arrow navigation skips collapsed sections — only visible results can be highlighted or selected with Enter (specified in FR-010).
- Q: Should the dashboard show a loading indicator while initial results are being computed? → A: Yes — show a simple "Searching…" placeholder until the first render completes, then replace it with the results list or the no-results message (specified in FR-013).
- Q: What is the canonical ordering rule for window sections, given Firefox exposes no window creation timestamp? → A: Active window first, then remaining windows in ascending window ID order ("chronological" dropped as not implementable; specified in FR-005).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Configure and Enable Virtual Dashboard Mode (Priority: P1)

A user with a complex workspace (many windows and tabs) wants to switch from the default Tab Hiding mode to the Virtual Search Results Dashboard mode in the extension's popup settings so that they can view consolidated search results instead of hiding tabs in separate windows.

**Why this priority**: High priority because it is the entry point that allows the user to opt-in to the new mode.

**Independent Test**: Toggle the preference setting in the popup, run a search, and verify that the virtual dashboard tab is created and activated.

**Acceptance Scenarios**:

1. **Given** the extension popup is open, **When** the user checks the option for "Virtual Search Results Dashboard" and performs a search, **Then** the preference is saved in extension storage and the dashboard tab is created.
2. **Given** a fresh installation of the extension, **When** the user performs a search without changing settings, **Then** the default search mode remains "Tab Hiding" (traditional behavior of hiding non-matching tabs in each window).

---

### User Story 2 - View Consolidated Search Results and Jump to Tab (Priority: P1)

A user searches for a term across multiple windows and wants to see all matching tabs listed in a single, dedicated dashboard tab, and click any search result to jump directly to that tab.

**Why this priority**: This is the core functionality and main value proposition of the virtual dashboard mode.

**Independent Test**: Search for a term that matches tabs in multiple windows, verify results are grouped by window in the dashboard tab, click a result, and verify that the target tab is activated and its parent window is focused.

**Acceptance Scenarios**:

1. **Given** matching tabs exist in multiple windows, **When** the user initiates a search in Virtual Dashboard mode, **Then** a single "Search Results" tab opens containing all matches grouped by their original window.
2. **Given** the dashboard tab is open, **When** the user clicks on a search result, **Then** the target tab becomes the active tab, its parent window is focused, and the dashboard tab is closed by default.
3. **Given** the dashboard tab is open with the "Keep dashboard open after selecting a tab" option checked, **When** the user clicks on a search result, **Then** the target tab is activated and its parent window is focused, but the dashboard tab remains open.

---

### User Story 3 - Refine Search and Navigate via Keyboard (Priority: P2)

A user wants to quickly refine their search query directly from the dashboard tab and navigate results using keyboard shortcuts (arrow keys and Enter) for maximum efficiency without using the mouse.

**Why this priority**: Enhances usability and efficiency for power users managing large sessions.

**Independent Test**: Focus the search query box on the dashboard page, type a new query, verify results update in real-time, press Arrow Up/Down to navigate results, and press Enter to select a result.

**Acceptance Scenarios**:

1. **Given** the dashboard tab is open, **When** the user types a new query in the dashboard's search query box, **Then** the list of matching tabs updates in real-time.
2. **Given** the dashboard tab is open, **When** the user presses Arrow Up or Arrow Down, **Then** the focus highlights the previous or next search result.
3. **Given** a search result is highlighted using keyboard navigation, **When** the user presses Enter, **Then** the target tab is activated and focused, following the "keep open" preference for closing the dashboard.

---

### User Story 4 - Expand/Collapse Window Sections in Dashboard (Priority: P3)

A user with many matching windows wants to collapse sections in the dashboard to clean up the view and focus on specific windows.

**Why this priority**: Low priority because it is a nice-to-have organization feature.

**Independent Test**: Click collapse/expand toggle on a window header in the dashboard, verify it toggles the visibility of the tabs under that window.

**Acceptance Scenarios**:

1. **Given** search results are displayed in the dashboard, **When** the user clicks the collapse button/header of a window section, **Then** the tabs within that window section are hidden from view.
2. **Given** a window section is collapsed, **When** the user clicks the expand button/header, **Then** the tabs within that window section are shown again.

### Edge Cases

- **Tab closed while dashboard is open**: When a tab included in the search results is closed by the user, the dashboard must synchronize in real-time and remove that tab from the list of results to prevent dead link clicks.
- **Search initiated with dashboard already open (Singleton)**: If a search is initiated while a dashboard tab is already open, the existing dashboard tab must be updated with the new query and focused, rather than opening a new tab.
- **No search results**: If no tabs match the search query, the dashboard page must display a clear "No matching tabs found" message.
- **Minimized/Background window activation**: When selecting a result, if the target window is minimized, the window must be restored and focused.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST store the user preference for "Search mode" (`virtualDashboard` boolean preference) in the extension's local storage (`browser.storage.local`), defaulting to `false` (which executes the traditional tab-hiding behavior).
- **FR-002**: The popup UI MUST provide a setting toggle or checkbox to switch between "Tab Hiding" and "Virtual Search Results Dashboard" modes.
- **FR-003**: When a search is performed with the virtual dashboard mode enabled and no dashboard tab exists yet, the background script MUST open a local extension page (`search-results.html`) in a new tab in the active window.
- **FR-004**: The background script MUST enforce a singleton pattern for the dashboard tab. If the dashboard is already open in a different window, it MUST update the search query, activate that tab, and bring its parent window to the front.
- **FR-005**: The dashboard page MUST display matching tabs grouped by their parent window, listing the window ID and count of matching tabs. The sections MUST be ordered with the active window first, followed by remaining windows in ascending window ID order.
- **FR-006**: The dashboard page MUST allow users to collapse and expand individual window sections by clicking on the window headers, persisting the collapsed window IDs in local storage (`collapsedWindows`).
- **FR-007**: Clicking a search result in the dashboard MUST focus its parent window (restoring the window if minimized) and activate the target tab.
- **FR-008**: The dashboard page MUST include a checkbox to "Keep dashboard open after selecting a tab" (persisted in local storage under `keepDashboardOpen`), which defaults to unchecked; selecting a result MUST close the dashboard tab unless this checkbox is checked.
- **FR-009**: The dashboard page MUST include a search query input field that filters and updates the listed matching tabs in real-time as the user types, using the same search options that the popup provides (such as Search URLs, Search tab titles, Search contents of loaded tabs, and Fuzzy matching, loaded from storage). When the query is empty, the dashboard MUST list all tabs grouped by window (no filtering).
- **FR-010**: The dashboard page MUST support full keyboard navigation using Arrow Up, Arrow Down, and Enter to highlight and select results. Arrow navigation MUST skip tabs inside collapsed window sections; only visible results can be highlighted or selected.
- **FR-011**: The extension MUST NOT hide any tabs when searching in Virtual Search Results Dashboard mode.
- **FR-012**: The dashboard page MUST dynamically update its results when tabs are created, updated, or closed in the background, reflecting each change within 1 second.
- **FR-013**: While results are being computed, the dashboard page MUST display a simple "Searching…" loading placeholder, and MUST replace it with the results list (or the no-results message) once the first render completes.

### Key Entities *(include if feature involves data)*

- **Search Mode Option**: Represents the user preference for search mode (`virtualDashboard` boolean option). Persisted in local browser storage (`browser.storage.local`).
- **Dashboard State**: Active dashboard tab configuration including current search query, keep-open preference (`keepDashboardOpen`), collapsed window IDs (`collapsedWindows`), and the real-time list of matching tab references.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users with 50+ windows and 500+ tabs see search results consolidated on a single dashboard page in under 1 second from initiating search for URL, title, and fuzzy matching (content search excluded, per SC-004).
- **SC-002**: Activating a search result focuses the target window and tab in less than 250ms.
- **SC-003**: Keyboard navigation allows navigating and opening any visible result using only Arrow keys and Enter without requiring mouse interaction.
- **SC-004**: Real-time filtering updates the results list in under 100ms from keypress for URL, title, and fuzzy matching. Content search ("Search contents of loaded tabs") re-runs on the same debounced keystroke cycle and has no strict latency bound, as it performs per-tab content lookups.

## Assumptions

- Browser extension APIs (`browser.storage`, `browser.tabs`, `browser.windows`) are supported by Firefox (Manifest V3), the sole target browser.
- The dashboard is packaged as a local extension resource `src/search-results.html`.
- The dashboard automatically inherits or respects the user's system dark/light theme settings via CSS `@media (prefers-color-scheme)` queries and shared CSS design tokens.
- Bulk operations (such as multi-select checkboxes for closing or moving tabs) are out of scope for the initial release.
