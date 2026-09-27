# Implementation Plan: Virtual Search Results Dashboard

**Branch**: `001-virtual-search-results` | **Date**: 2026-07-04 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/001-virtual-search-results/spec.md`

**Note**: This template is filled in by the `/speckit.plan` command. See `.specify/templates/plan-template.md` for the execution workflow.

## Summary

This feature implements a "Virtual Search Results Dashboard" mode as an alternative to the traditional tab-hiding search mode. Users managing large browser sessions (e.g., 50+ windows and 500+ tabs) can enable this mode to view all matching tabs consolidated on a single dashboard page (`src/search-results.html`). Selecting a result focuses its parent window and activates the tab. The technical approach involves using a singleton tab managed by the background script, updating its contents via runtime messaging, and dynamically rendering matching tabs grouped by their windows.

## Technical Context

**Language/Version**: JavaScript (ES6+), HTML5, CSS3

**Primary Dependencies**: None (reuses existing `src/fuse.basic.min.js` utility)

**Storage**: `browser.storage.local` (for storing `virtualDashboard`, `keepDashboardOpen`, and `collapsedWindows` preferences)

**Testing**: Automated unit testing via Node.js native test runner (`npm test`) using `node:test` and `node:assert`, combined with manual verification in Firefox executing scenarios in `quickstart.md`.

**Target Platform**: Firefox (Manifest V3, utilizing background scripts)

**Project Type**: Browser Extension

**Performance Goals** (URL/title/fuzzy matching; content search excluded per spec SC-001/SC-004):
* Render and group 500+ tabs across 50+ windows in under 1 second for URL/title/fuzzy matching.
* Refine search results on keypress in under 100ms for URL/title/fuzzy matching; content search re-runs on the same debounced cycle with no strict bound.
* Activate a target tab and window in under 250ms.

**Constraints**:
* Must adhere to Manifest V3 APIs and security policies.
* Must enforce a strict singleton pattern for the dashboard tab.
* Virtual Search Results Dashboard mode must NOT hide background tabs to avoid performance bottlenecks in large sessions.

**Scale/Scope**: Session scale of 50+ windows and 500+ tabs. Active window at the top of the grouping, remaining windows in ascending window ID order.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Evaluated against the ratified constitution (v1.4.0):

- **I. Simplicity** — ✅ Pass. Vanilla JS/HTML/CSS; zero npm dependencies.
- **II. Firefox-Only Target** — ✅ Pass. Uses the `browser` API surface; Firefox (Manifest V3) is the sole target.
- **III. Performance** — ✅ Pass. Targets (50+ windows / 500+ tabs, render <1s, filter <100ms, activate <250ms) are stated and verified via quickstart Scenario 5.
- **IV. Privacy & Permissions** — ✅ Pass. No new permissions; reuses existing `tabs`, `tabHide`, `storage`, `find` surface.
- **V. Verification (NON-NEGOTIABLE)** — ✅ Pass. Automated unit test suite executed via `npm test` across unit test suites in `tests/`, comprehensive JSDoc docstrings with ≥ 80% coverage on all touched functions, and manual verification via `quickstart.md` scenarios (1–5).
- **VI. Minimal Dependencies** — ✅ Pass. Zero new npm dependencies; uses built-in `node:test` and vendored `src/fuse.basic.min.js`.
- **VII. Versioning & Release Hygiene** — ✅ Pass. Synchronized `version` in `package.json` and `manifest.json`, changelog in `README.md`, store listing in `AMO/AMO_DESCRIPTION.md`, and built `.xpi` artifact in `web-ext-artifacts/`.

All gates pass. No Complexity Tracking entries required.

## Project Structure

### Documentation (this feature)

```text
specs/001-virtual-search-results/
├── plan.md              # This file
├── research.md          # Decisions, rationale, and alternatives
├── data-model.md        # Extension storage and runtime page state schemas
├── quickstart.md        # Manual verification guide
├── contracts/
│   └── messaging.md     # Message formats between popup, background, and dashboard
└── tasks.md             # Actionable checklists (created by next step)
```

### Source Code & Tests (repository root)

```text
src/
├── background.js        # [MODIFY] Check virtualDashboard setting, manage singleton dashboard tab, route queries, handle focus/window fronting
├── common.css           # [MODIFY] Shared styles (ensure dark/light themes work)
├── popup.html           # [MODIFY] Add setting checkbox for virtualDashboard
├── popup.js             # [MODIFY] Add setting toggle logic, load/save virtualDashboard, handle search submission
├── search-results.html  # [NEW] Dashboard page UI
└── search-results.js    # [NEW] Dashboard search, display, real-time sync, and keyboard navigation
tests/
├── background-dashboard.test.js # [NEW/MODIFY] Test singleton routing and tab/window fronting
├── dashboard-behavior.test.js   # [NEW/MODIFY] Test real-time synchronization and UI interactions
├── search.test.js               # [MODIFY] Test search options and filtering parity
└── window-grouping.test.js      # [NEW/MODIFY] Test tab grouping and window ordering
```

**Structure Decision**: Single extension project structure mapping modifications to the `src/` directory.

## Complexity Tracking

*No violations to track.*
