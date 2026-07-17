# Changelog

Dated log of major changes, grouped by session. For full commit-level detail, see `git log`.

## 2026-07-17 — Critical navigation bug, docs

- **Fixed the most severe bug found in this project's history**: `core/router.js`'s `navigateTo()` never passed a container DOM element to page render functions — it called `renderFn(params)` where every render function across the entire app expects `render(container)`. This meant no page could ever render anything visible, on any navigation, with no console error. Fixed to derive `#moduleContent` and pass it correctly.
- Fixed two related bugs in the same area: `_showModuleSkeleton()` and `safeRenderModule()`'s error path both used to wipe the *entire* `#app` shell (sidebar/topbar included) instead of just the content area.
- Fixed `DEFAULT_MODULE` — referenced in 5 places (including the post-login redirect) but never defined anywhere.
- Documented (not yet fixed): dead `renderApp()` function in `sanitizers.js` with a misleading comment; a `#login-root` element referenced by `shell.js`/`auth.js` that doesn't exist in `index.html`.
- Added `window.Toast` object-style wrapper (`.success()`/`.error()`/`.warning()`/`.info()`) to `toast.js` — ~20 pre-existing call sites across the students/communication modules were silently no-op-ing without it.
- Fixed `APP_NAME`/`APP_VERSION` — referenced in 6 places including every dynamic module load, never defined.
- Wrote all 10 `docs/` files (this one included).
- Merged in: HTML templates, license, project assets, and the full attendance module (built externally during this same window).

## 2026-07-16 — Test suite, more latent bugs

- Set up a real Jest + jsdom test suite from scratch (`package.json`, `jest.config.js`, `tests/helpers/load-scripts.js` — a custom loader since the app's files are plain scripts, not CommonJS/ES modules).
- 10 test suites, ~130 tests covering validators, timetable conflict detection, finance formulas, grading/ranking, attendance calculations, teacher performance, login lockout, router module-mapping, UI/DOM behavior, and the offline IndexedDB queue.
- Found and fixed while writing tests: `SCHOOL_DEFAULTS` (undefined, broke `getPassMark()` and the whole grading cascade), `APP_CONFIG.maxFailedLogins` (wrong field name, silently disabled login lockout), and a second wave of duplicate top-level declarations (`esc` in `toast.js`, `scoreToPercent`/`getStudentRank` in `academic-formulas.js`, `state` in `sidebar.js`, `serializeForm`/`clearForm` in `sanitizers.js`, `openPrintWindow`/`printElement` in `utils.js`) — each one silently killing an entire file due to the shared-global-scope model (see `architecture.md`).
- Fixed a router/module-loading gap: several settings/staff pages split into a data-layer file + a render-page file, but the router only loaded one file per nav id. Extended `MODULE_FILE_MAP` to support array mappings; fixed the `grading-scale` entry, which pointed at the wrong file entirely.
- Merged in: `core/boot.js`, `core/router.js`, `core/auth.js`, `core/window-exposure.js`, `main.js`, `core/backup-engine.js`, `core/export-engine.js` (all previously empty), plus a large batch of already-complete academics modules (all 16 files).

## 2026-07-15 — Settings and Staff modules; the ES-module bug

- Converted 37 files from ES `import`/`export` syntax to the plain-script `window.X =` pattern — `index.html` loads every file as a classic `<script>`, not `type="module"`, so those 37 files were throwing a parse error and executing zero lines each. Found and fixed several real bugs surfaced by the conversion (`canAccessModule` → `canAccess`, a broken `buttonLoader()` call, a wrong constant name in `accountant-dashboard.js`).
- Built out all 12 files in `js/modules/settings/` (school profile, academic years/terms, grading scale, class/subject management, database connection panel, backup/restore, system logs) and all 12 files in `js/modules/staff/` (user management, teacher/subject data layer, timetable system with manual conflict-checked entry, teacher assignments matrix, teacher performance) — both were 100% empty placeholders before this session.
- Found and fixed the first instance of the "referenced but never defined" bug pattern: `TEACHER_ROLES` (used by `validateTeacherForm()`, never defined) and `LOG_ACTIONS` (used in 20 places in `logger.js`, never defined).
- Merged in a second duplicate `pwa.js` (in `js/ui/`) into the canonical `js/core/pwa.js`, keeping the unique parts (dynamic manifest generation, offline page caching, back-to-top button) and deleting the redundant file.

## 2026-07-12 to 2026-07-14 — Full rebuild, CSS, initial modules

- "Full rebuild" — the current v9.0 architecture (plain-script pattern, `js/config` + `js/core` + `js/ui` + `js/modules` folder structure) replaced an earlier version.
- Full CSS system built out (`css/base`, `css/components`, `css/layouts`, `css/modules`, `css/themes`, `css/responsive`, `css/print`) — 50 files, all complete.
- Initial batch of modules added (communication, some student modules, some dashboard files).

## 2026-07-04 to 2026-07-08 — Earlier iteration

- A series of targeted fixes to a prior version of the app: console errors on init, login flow, `ensureStateLoaded`, dynamic `import()` calls, Supabase config key handling. Largely superseded by the 2026-07-12 full rebuild.

---

**Known bug pattern across this project's history, worth naming explicitly**: two recurring failure modes account for the large majority of "why doesn't this work" bugs found and fixed above — (1) a name referenced somewhere but never defined anywhere (`ReferenceError`), and (2) a top-level name declared in two files that both load on the same page (`SyntaxError: already declared`, which silently kills the *entire* second file). See `troubleshooting.md` for how to diagnose both, and check for both before assuming new code that "looks right" but doesn't work has a logic bug rather than one of these two.
