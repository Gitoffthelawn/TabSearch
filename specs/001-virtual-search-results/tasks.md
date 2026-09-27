# Tasks: Virtual Search Results Dashboard

**Input**: Design documents from `/specs/001-virtual-search-results/`

**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/

**Tests**: Unit tests are MANDATORY per Constitution v1.3.0 Principle V (mandating automated unit tests and ≥ 80% JSDoc docstring coverage). Core logic and helper utilities must have automated test cases run via `npm test`.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

* **[P]**: Can run in parallel (different files, no dependencies)
* **[Story]**: Which user story this task belongs to (US1, US2, US3, US4)
* Includes exact file paths in descriptions

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Option keys registration and basic UI variables styling

- [x] T001 Register settings options `virtualDashboard` and `keepDashboardOpen` in `src/popup.js`
- [x] T002 Update styles in `src/common.css` to define dashboard container, window headers, and list items variables

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core singleton messaging structure and page skeletons

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [x] T003 Implement initial listener for `open-dashboard` in `src/background.js`
- [x] T004 Create page skeleton for `src/search-results.html` linked to `common.css` and `search-results.js`
- [x] T005 Create script skeleton for `src/search-results.js` containing empty browser runtime listeners

**Checkpoint**: Foundation ready - user story implementation can now begin

---

## Phase 3: User Story 1 - Configure and Enable Virtual Dashboard Mode (Priority: P1) 🎯 MVP

**Goal**: Save and load settings, route searches to the background script

**Independent Test**: Toggle setting in popup, submit search, and verify it fires message instead of traditional search.

### Implementation for User Story 1

- [x] T006 [P] [US1] Add preference setting checkbox for "Virtual Search Results Dashboard" in `src/popup.html`
- [x] T007 [US1] Add logic to load, save, and handle changes for `virtualDashboard` checkbox in `src/popup.js`
- [x] T008 [US1] Modify search submit handler in `src/popup.js` (`doSearch`) to send `open-dashboard` message and close popup when setting is active

**Checkpoint**: User Story 1 (MVP entry point) complete and testable.

---

## Phase 4: User Story 2 - View Consolidated Search Results and Jump to Tab (Priority: P1)

**Goal**: Group matching tabs, render window sections, and activate focused tab

**Independent Test**: Perform search, verify dashboard lists matching tabs grouped by window (active first), click a tab to switch.

### Implementation for User Story 2

- [x] T009 [US2] Update `open-dashboard` listener in `src/background.js` to create new tab if missing, focus existing tab if present, and front its parent window
- [x] T010 [US2] Prevent background tab restoration process in `src/background.js` (`popup-closed` event) when searching in virtual dashboard mode
- [x] T011 [P] [US2] Implement tab query, fuzzy filtering, and grouping logic by window ID in `src/search-results.js`, loading and applying the popup's search options from storage (Search URLs, Search tab titles, Search contents of loaded tabs, and Fuzzy matching threshold) so the dashboard matches the same tabs the popup would (FR-009)
- [x] T012 [P] [US2] Sort grouped window sections with active window first, followed by others in ascending window ID order in `src/search-results.js`
- [x] T013 [P] [US2] Implement rendering of grouped windows and tabs to the page DOM in `src/search-results.js`, including the "No matching tabs found" empty state
- [x] T014 [US2] Add click handlers in `src/search-results.js` to activate the target tab, focus and restore its parent window (if minimized), and close the dashboard unless `keepDashboardOpen` is true (FR-007)

**Checkpoint**: Basic consolidated dashboard with click-to-activate is fully functional.

---

## Phase 5: User Story 3 - Refine Search and Navigate via Keyboard (Priority: P2)

**Goal**: Refine search queries in real-time and navigate matches via arrow/enter keys

**Independent Test**: Type in dashboard query box to refine results; use arrow keys to highlight and Enter to activate a tab.

### Implementation for User Story 3

- [x] T015 [P] [US3] Add search query input field and "Keep dashboard open" checkbox to `src/search-results.html`
- [x] T016 [US3] Implement keyup search filtering logic in `src/search-results.js` to refresh matching tabs in real-time
- [x] T017 [US3] Implement message listener for `update-query` in `src/search-results.js` to update the dashboard query from popup searches
- [x] T018 [US3] Add keyboard event listener in `src/search-results.js` (Arrow Up, Arrow Down, Enter) to navigate highlighted results and activate them

**Checkpoint**: Power-user keyboard controls and inline query refinements are complete.

---

## Phase 6: User Story 4 - Expand/Collapse Window Sections (Priority: P3)

**Goal**: Support collapsing and expanding window groups to manage visual space

**Independent Test**: Click window header section to hide and show its tabs.

### Implementation for User Story 4

- [x] T019 [P] [US4] Add expand/collapse CSS classes and headers toggles in `src/search-results.html`
- [x] T020 [US4] Implement toggle collapse logic in `src/search-results.js` that tracks collapsed state per window ID and persists it to the `collapsedWindows` storage key

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Theme matching, real-time tab sync (created/updated/closed), and quickstart validation

- [x] T021 [P] Style results dashboard and handle dark/light theme options in `src/common.css`
- [x] T022 Implement tab closed listener (`browser.tabs.onRemoved`) in `src/search-results.js` to update list in real-time
- [x] T023 Run manual verification scenarios in `specs/001-virtual-search-results/quickstart.md`
- [x] T024 Implement tab created/updated listeners (`browser.tabs.onCreated`, `browser.tabs.onUpdated`) in `src/search-results.js` so newly opened tabs and tabs whose title/URL change to match the query are added to the results in real-time (FR-012)

---

## Phase 8: Clarification Follow-ups (2026-08-30)

**Purpose**: Close gaps introduced by the 2026-08-30 clarification session (FR-013, FR-010)

- [x] T025 [P] [US2] Add a "Searching…" loading placeholder to `src/search-results.html` and show/replace it in `src/search-results.js` once the first render completes (FR-013)
- [x] T026 [US3] Exclude tabs in collapsed window sections from the keyboard navigation list in `src/search-results.js` so Arrow Up/Down/Enter only affect visible results (FR-010)

---

## Phase 9: Release (Principles V & VII)

**Purpose**: Automated testing, documentation review, versioning & release hygiene per Constitution v1.3.0

- [x] T027 Bump version in `package.json` and `src/manifest.json` to the applicable release target (both files MUST stay in sync, Semantic Versioning; pre-release builds may use an optional fourth version component)
- [x] T028 Review and update `README.md` (changelog & documentation) and `AMO/AMO_DESCRIPTION.md` (store description)
- [x] T029 Implement and maintain automated unit test suites in `tests/` covering dashboard filtering, window grouping/sorting, and background routing (`tests/dashboard-behavior.test.js`, `tests/background-dashboard.test.js`, `tests/window-grouping.test.js`, `tests/search.test.js`)
- [x] T030 Verify Docstring & JSDoc Coverage Gate (≥ 80% coverage with `@param` and `@returns`) across all touched functions per Constitution v1.3.0 Principle V
- [x] T031 Execute automated unit test suite (`npm test`) and linter (`npx web-ext lint`) with 0 errors
- [x] T032 Run `npm run build` and verify the `.xpi` artifact is produced in `web-ext-artifacts/`

---

## Dependencies & Execution Order

### Phase Dependencies
* Phase 1 (Setup) is independent.
* Phase 2 (Foundational) depends on Phase 1 completion and blocks all user stories.
* Phase 3 (US1) and Phase 4 (US2) must be complete to verify the core end-to-end dashboard flows.
* Phase 5 (US3) and Phase 6 (US4) build on top of the rendered list from US2.
* Phase 7 (Polish) is done at the end.
* Phase 8 (Clarification Follow-ups) builds on Phase 4 (rendered list) and Phase 6 (collapse state).
* Phase 9 (Release) runs last, after all feature tasks and manual quickstart verification are complete.

### Parallel Opportunities
* All tasks marked with `[P]` (T006, T011, T012, T013, T015, T019, T021, T025) represent implementations in separate files (HTML/CSS vs background scripts) that can proceed in parallel without conflicts.
