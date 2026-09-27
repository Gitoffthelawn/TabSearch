---
name: webext-workflow
description: Validate, lint, run live Firefox testing, or build release packages for the TabSearch Firefox WebExtension.
---

# WebExtension Development & Release Workflow

Use this skill when developing, testing, linting, or packaging the TabSearch extension.

---

## 1. Automated Testing & Code Validation

Before committing code or preparing a release, always run the automated unit tests and validate against Mozilla's WebExtension standards:

```bash
# 1. Run automated unit tests
npm test

# 2. Run WebExtension linter
npx web-ext lint
```

### Verification Criteria:

- `npm test` must complete with **0 failures**.
- `npx web-ext lint` must output `errors 0`.
- Review any warnings (e.g. `UNSAFE_VAR_ASSIGNMENT` to `innerHTML`) and ensure untrusted user or tab data is never passed to `innerHTML`.

---

## 2. Live Testing in Firefox

To launch an isolated Firefox instance with TabSearch pre-installed and auto-reloading upon file changes:

```bash
npx web-ext run --source-dir src
```

### Useful Flags:

- Test with a specific profile:
     ```bash
     npx web-ext run --source-dir src --firefox-profile "path/to/test-profile"
     ```
- Keep console open for background script logs:
     ```bash
     npx web-ext run --source-dir src --browser-console
     ```

### Key Verification Checklist during Manual Testing:

1. **Search Matching**: Search by URL, title, and loaded content across multiple windows.
2. **Tab Hiding**: Verify non-matching tabs are hidden, and restored when search is cleared.
3. **Active/Pinned Tab Safety**: Confirm active tab and pinned tabs are **never** hidden.
4. **TST Integration**: If Tree Style Tab is active, verify tree flattening during search and hierarchy restoration on clear.
5. **Dashboard Tab**: Check virtual search results dashboard (`search-results.html`), keyboard navigation (Arrow Up/Down, Enter), and collapse/expand window sections.

---

## 3. Release Packaging & Signing

TabSearch uses `web-ext-config.cjs` to configure build and packaging options.

### Build Unsigned Package

To build an unsigned distributable package for testing or manual AMO submission:

```bash
npm run build
```

The output package will be generated inside `web-ext-artifacts/` named `${name}-${version}.xpi`.

### Sign Package (AMO Distribution)

To generate a signed package via the Mozilla Add-ons (AMO) signing API:

```bash
npm run sign -- --api-key <AMO_JWT_ISSUER> --api-secret <AMO_JWT_SECRET>
```

---

## 4. Release Hygiene & Version Bump Checklist

When publishing a new release:

1. **Sync Version Numbers**: Ensure `version` in `package.json` and `src/manifest.json` match exactly (Semantic Versioning `MAJOR.MINOR.PATCH` or `MAJOR.MINOR.PATCH.BUILD`, preserving the optional fourth component for pre-release builds).
2. **Update Documentation**: Review and update both `README.md` (version & changelog) and `AMO/AMO_DESCRIPTION.md` (store description & release notes).
3. **Run Unit Tests**: Execute `npm test` and verify zero failures.
4. **Run Linter**: Execute `npx web-ext lint` and verify zero errors.
5. **Generate Artifact**: Run `npm run build` to create the final `.xpi` artifact in `web-ext-artifacts/`.
