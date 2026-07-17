# Architecture

## The one rule that matters most: plain scripts, shared global scope

Every JS file in this app is loaded by `index.html` as a classic `<script src="...">` tag — **not** `<script type="module">`. This is a deliberate, load-bearing choice, not an oversight:

- Module scripts require the page to be served over `http(s)://`; opening `index.html` directly (`file://`) fails with a CORS error. Plain scripts don't have that restriction.
- It keeps every file's globals reachable from every other file without an import graph to maintain.

The tradeoff: **all classic scripts on the page share one global scope.** Two consequences that have caused real bugs in this codebase (see `troubleshooting.md`):

1. **`import`/`export` syntax is a hard parse error** in a non-module script — the whole file silently executes zero lines. Every file was audited and converted off this pattern (see `changelog.md`), but if you're porting in new code, strip `import`/`export` and expose things via `window.X = X` instead.
2. **A top-level `const`/`let`/`function` name declared in two files that both load on the page throws `SyntaxError: Identifier already declared`** the moment the second file parses — and that error kills the *entire* second file, not just the colliding name. This has happened at least 7 times across this codebase (`ANNUAL_MAX`, `esc`, `scoreToPercent`, `getStudentRank`, `state`, `serializeForm`/`clearForm`, `openPrintWindow`/`printElement`). **Before adding a new top-level name to any always-loaded file, grep the rest of `js/` for it first.**

Because of #2, a function that's only used internally in one file should still get a reasonably specific name — `esc`, `state`, and `render` are exactly the kind of short, generic names that collide.

## Load order (`index.html`)

Scripts load in this order, synchronously, at the end of `<body>`:

```
config/  (constants, navigation, role-permissions, supabase-config)
  ↓
core/    (state → utils → sanitizers → validators → api → formulas →
          academic-formulas → finance-formulas → fees → permissions →
          auth → router → cache → logger → error-handler →
          notifications-engine → offline → sync-engine → pwa →
          print-engine)
  ↓
ui/      (shell → sidebar → topbar → modals → toast → theme → tables →
          forms → cards → charts → skeletons → dropdowns → tabs →
          pagination → empty-states → tooltips → context-menu →
          responsive-ui → loaders)
  ↓
mobile/  (gestures → mobile-navigation → mobile-tables → mobile-modals →
          touch-optimizations)
  ↓
main.js  (boot)
```

Order matters for the reasons above — a file can use a bare identifier (`esc(...)`, `state.role`) or a `window.X` reference to anything declared in a file that loaded earlier, without needing to import it.

## Page modules aren't preloaded — the router injects them

Files under `js/modules/` are **not** listed in `index.html`. `core/router.js` loads them on demand:

1. `navigateTo(moduleId)` looks up `moduleId` in `MODULE_FILE_MAP` (in `router.js`).
2. Each entry is either a single file path, or an **array** of paths for pages that split into a data-layer file + a render-page file (see below). Files load in array order via `document.createElement('script')`, appended to `<head>` — same shared global scope as everything else.
3. Once loaded, the router calls `window[moduleIdToRenderFn(moduleId)](container, params)` — `moduleIdToRenderFn` is a mechanical conversion, e.g. `'grading-scale'` → `renderGradingScale`. **The last file in an array mapping must be the one that exposes that exact function name.** `container` is `document.getElementById('moduleContent')` — the real "Dynamic content rendered here" element in `index.html`, **not** `#app` (the whole shell, sidebar/topbar included) and not `#app-main` (referenced in a few file header comments, but that id doesn't actually exist anywhere). Every top-level page module's render function must accept `container` as its first argument — this convention is uniform across every author in this codebase (settings/, staff/, academics/, dashboard/, attendance/, students/, communication/).
4. Loaded files are tracked by file path (not by moduleId) in `_loadedFiles`, so a companion file shared across multiple pages (e.g. `staff/teachers.js`, used by three different staff pages) is only ever injected once.

> This container-passing step was broken for a long stretch of this project's history — `navigateTo` called `renderFn(params)` with no container at all, so no page could ever render anything visible, with no console error to show for it. See `troubleshooting.md` for the full story if you're chasing something that smells similar.

### The data-layer / render-page split

Several `settings/` and `staff/` modules split into two files:

| Nav id | Data layer (no render fn) | Render page |
|---|---|---|
| `academic-calendar` | `settings/academic-years.js` | `settings/academic-calendar.js` |
| `grading-scale` | `settings/grading-scale.js` | `settings/grading-settings.js` |
| `user-management` | `settings/users.js` | `staff/user-management.js` |
| `teacher-assignments` | `staff/teachers.js`, `staff/subjects.js` | `staff/teacher-assignments.js` |
| `teacher-performance` | `staff/teachers.js` | `staff/teacher-performance.js` |
| `timetable` | `staff/teachers.js`, `staff/subjects.js`, `staff/timetable-conflicts.js`, `staff/class-timetable.js`, `staff/teacher-timetable.js`, `staff/staff-timetable.js`, `staff/timetable-import.js` | `staff/timetable.js` |

If you add a new split-file page, add the array to `MODULE_FILE_MAP` yourself — the router has no automatic discovery. `tests/router-tests.js` has a regression test for exactly this (the `grading-scale` entry originally pointed at the data file instead of the render page, which would have made that whole page unreachable).

## State and data flow

- **`core/state.js`** holds one mutable `state` object (current user, active year/term, cached lists of classes/subjects/teachers/students, etc.) — not a store with subscriptions, just a shared object everything reads and mutates directly.
- **`core/api.js`** wraps every Supabase table read/write (`getAll`, `getById`, `getWhere`, `insert`, `update`, `remove`, `insertMany`) plus a `REFRESH_MAP` used by `refreshTable(name)` to reload `state.X` after a write.
- **`core/formulas.js`** / **`core/academic-formulas.js`** / **`core/finance-formulas.js`** hold pure calculation logic (grading, ranking, attendance rate, fee balances) — no DOM, no DB calls, which is exactly why they're the most heavily unit-tested part of the app (see `tests/`).
- **`core/validators.js`** / **`core/sanitizers.js`** hold shared form validation and input-cleaning functions, reused across every module's forms.

## Two permission systems (not yet reconciled)

`config/role-permissions.js` (`canAccess`, `canEdit`, `canCreate`, ...) and `core/permissions.js` (`myRole`, `canNavigateTo`, `isBlocked`, ...) overlap in purpose. Both are currently in use in different places. See `permissions.md`.

## Testing approach

Since there's no build step and no CommonJS/ES-module structure, `tests/helpers/load-scripts.js` loads real source files into Jest's jsdom global scope with a single combined `eval()` call — deliberately combined (not one `eval()` per file), because separate `eval()` calls don't reliably share top-level `const`/`let` bindings with each other's function closures in this environment, even though `window.X` assignments always work. See the comment at the top of that file for the full explanation. Tests cover the pure-logic layer (`formulas.js`, `validators.js`, `finance-formulas.js`, timetable conflict detection) plus real jsdom DOM behavior for toast/modals and real IndexedDB behavior (via `fake-indexeddb`) for the offline queue.
