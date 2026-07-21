# Changelog

Dated log of major changes, grouped by session. For full commit-level detail, see `git log`.

## 2026-07-19 — Boot chain fully fixed; app can actually run for the first time

The most consequential session in this project's history — every fix below was independently blocking the app from working at all, discovered by finally trying to actually boot it:

- **`core/boot.js` was never referenced in `index.html`** despite being fully written — added it in the correct load position (last of `js/core/`, before `window-exposure.js`/`main.js`). This alone was the direct cause of "ReferenceError: boot is not defined" on every load.
- **The Supabase JS CDN script tag was entirely missing** from `index.html` — added before `supabase-config.js`. Every database call had been failing from the first line.
- **`ui/sidebar.js`/`topbar.js`/`shell.js` never exposed `window.renderSidebar`/`renderTopbar`/`renderShell`** — only their namespace objects. Added the missing aliases; `shell.js` additionally needed `init` added to its public API so it could be aliased from outside its IIFE.
- **17 fully-built, nav-registered pages were completely unreachable** — the entire Students module, entire Attendance module, entire Communication module, `admin-dashboard.js`, both `holidays-*.js` files — none of them ever assigned the router-derived `window.render<X>` name, only their IIFE namespace object. Fixed all 17. Built a permanent Jest suite (`tests/module-exposure-tests.js`, 75 tests) that sandbox-loads every `MODULE_FILE_MAP` entry and verifies the real exposure — this class of bug should never make it to production silently again.
- **`grading-settings.js` was still missing its router-derived alias** even after an earlier session's `MODULE_FILE_MAP` array-loading fix — it exposed `renderGradingSettings` (matching its filename) but the router needed `renderGradingScale` (matching the nav id). Added the second alias.
- **Every confirmation dialog app-wide showed a red "Confirm" button**, including for completely routine actions — `confirmDialog()`'s default `confirmClass` was `'btn-danger'` and nothing overrode it. Changed the default to `'btn-primary'`; added explicit `btn-danger` overrides to the genuinely destructive confirmations (delete class/term/subject/account, remove assignment, reverse payment, restore backup).
- Finished the finance module: `manual-adjustments.js`, `discounts.js`, `carry-forward.js`, plus (merged in from a parallel session and integration-fixed) `overdue-payments.js`, `student-statements.js`, `balances.js`, `fee-term-status.js`, `student-fees.js`, `fee-assignments.js`, and a much richer rewrite of `financial-reports.js`. **Every file in `js/modules/finance/` is now built** — this was the last module folder with empty files.
- Fixed the render-signature mismatch (`render(params)` + own `#app` lookup, instead of the router's real `render(container, params)`) in 10 more files merged in from a parallel session across this and recent sessions — same bug, same fix, each time.
- Wired `student-list.js`'s bulk action bar (previously a fake-toast stub) to the real `window.BulkStudentActions` API, and added `bulk-student-actions.js` as a load companion for the `'student-list'` nav id since it has no route of its own.
- Fixed a real, unstyled-since-creation CSS class mismatch: `admin-dashboard.js`, `accountant-dashboard.js`, `teacher-dashboard.js`, and `marks-entry.js` used an invented `chart-card`/`fee-chart-card` class family (30+ occurrences) that never existed in `dashboard.css` — renamed to the real `dash-card` family and added the one missing piece (`.dash-card-badge`) to the stylesheet.
- Added real CSS for `.pwa-update-banner` (the "new version available" notice `core/pwa.js` already builds correctly — the update-detection logic itself was solid, just never had any styling).
- Confirmed and left alone: `qr-verify.html` (a more complete, independently-built version already existed in the repo), and the PWA update-notification flow itself (`updatefound` → banner → `SKIP_WAITING` → `controllerchange` → reload — already correctly implemented in `core/pwa.js`/`sw.js`, this session only added its missing CSS).
- Documented but not fixed (out of scope for this pass, noted in `troubleshooting.md`): a dead, hardcoded `#confirmOverlay` dialog left over in `index.html` from early development (calls functions that don't exist anywhere, harmlessly inert); `html/partials/*` still not wired into `index.html`.

Full suite: 12 test suites, 221 tests, all passing (up from 136 — added `boot-chain-tests.js` and `module-exposure-tests.js`).

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
