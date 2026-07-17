# Troubleshooting

## "Nothing happens" / a page is completely blank after clicking a nav item

Open the browser console first — nearly every failure mode in this app surfaces there as an uncaught error, not a silent failure.

### `Uncaught SyntaxError: Identifier 'X' has already been declared`

**The single most common failure in this codebase.** Every JS file loads as a classic `<script>` tag sharing one global scope (see `architecture.md`) — if two files both declare a top-level `const X`, `let X`, or `function X`, the **second file to load throws this error and its entire contents fail to execute**, not just the colliding name.

This has happened repeatedly across this project's history: `ANNUAL_MAX`, `esc`, `scoreToPercent`, `getStudentRank`, `state` (in `sidebar.js`), `serializeForm`/`clearForm`, `openPrintWindow`/`printElement` were all real instances, each one silently killing an entire file until found and fixed.

**How to check:** search the whole `js/` tree for the identifier named in the error:
```bash
grep -rn "^const NAME\|^function NAME\b" js/ --include="*.js"
```
If it's declared in more than one file that both load on the same page, that's the bug. Either remove the redundant declaration (keeping whichever file's version is actually used/more complete) or rename one of them.

**Before adding any new top-level name**, grep for it first — this is cheap insurance against re-introducing this bug class.

### `ReferenceError: X is not defined`

The mirror-image bug: something is *used* as a bare identifier but never declared anywhere. This codebase has had several of these too — `TEACHER_ROLES`, `LOG_ACTIONS`, `SCHOOL_DEFAULTS`, `APP_NAME`/`APP_VERSION` were all referenced in one file but only ever defined (if at all) somewhere that doesn't actually exist, or under a different name. `APP_NAME`/`APP_VERSION` was the most severe instance — it broke `core/router.js`'s dynamic module loading for *every* page navigation.

**How to check:**
```bash
grep -rn "\bNAME\b" js/ --include="*.js"       # everywhere it's used
grep -rn "^const NAME\|^function NAME" js/ --include="*.js"   # where it's (supposedly) defined
```
If the second command returns nothing, it was never defined — check for a typo'd near-miss (e.g. `APP_CONFIG.maxLoginAttempts` vs the referenced `APP_CONFIG.maxFailedLogins`) before adding a fresh definition.

### A router-loaded page renders blank with no console error

Check that `MODULE_FILE_MAP` in `core/router.js` actually points at the file exposing the render function — `moduleIdToRenderFn(moduleId)` mechanically converts the nav id to a PascalCase function name (`'grading-scale'` → `renderGradingScale`), and if the page is split into a data-layer file + a render-page file (see `architecture.md`), the **last** file in that moduleId's array mapping must be the one exposing that exact function. This exact mistake happened with `grading-scale` (pointed at the data file, not the render page) — see `tests/router-tests.js`'s regression test for it.

### A toast/notification silently doesn't appear

Check which API the calling code uses:
- `window.showToast(message, type, options)` — the real, original function in `js/ui/toast.js`.
- `window.Toast?.success(title, message)` / `.error()` / `.warning()` / `.info()` — an object-style wrapper added later around `showToast`. If you see `window.Toast?.` calls with the `?.` swallowing a "Toast is undefined" failure, confirm `js/ui/toast.js` has the `window.Toast = {...}` block near the bottom of the file — without it, every one of those calls is a silent no-op.

## Login lockout doesn't seem to work / never locks out

Check that `js/core/auth.js`'s lockout check reads `APP_CONFIG.maxLoginAttempts` — an earlier version referenced a field named `maxFailedLogins`, which didn't exist, so `count >= undefined` was always `false` and the feature silently never triggered. Covered by `tests/auth-tests.js`.

## Tests fail with `window is not defined` or `structuredClone is not defined`

- `window is not defined` inside a Jest test almost always means a test file (or a helper it calls) tried to load app source files with plain `node -e` / `require()` instead of going through `tests/helpers/load-scripts.js` inside an actual Jest test run (`npx jest ...`) — the app's files assume a `window`/`document` global, which only exists once `jest-environment-jsdom` has set up the sandbox for that test file.
- `structuredClone is not defined` means `jest.config.js`'s `setupFiles` doesn't include `tests/helpers/jsdom-polyfills.js` before `fake-indexeddb/auto` — `jest-environment-jsdom` doesn't backport this Node global into its sandbox, and `fake-indexeddb` needs it internally.

## Running `node -c` on a file passes, but the browser still throws a SyntaxError

`node -c` only checks that a single file parses in isolation — it can't catch the shared-global-scope collision bugs above, since those only manifest when **two specific files load together on the same page**. Use the repo-wide scan instead:

```bash
python3 -c "
import re
with open('index.html') as f: html = f.read()
files = re.findall(r'src=\"(js/[^\"]+)\"', html)
declared = {}
for path in files:
    with open(path, encoding='utf-8') as fh: content = fh.read()
    for m in re.finditer(r'^(?:const|let)\s+([A-Za-z_\$][A-Za-z0-9_\$]*)\s*=', content, re.MULTILINE):
        declared.setdefault(m.group(1), []).append(path)
    for m in re.finditer(r'^(?:async\s+)?function\s+([A-Za-z_\$][A-Za-z0-9_\$]*)\s*\(', content, re.MULTILINE):
        declared.setdefault(m.group(1), []).append(path)
for name, files in sorted(declared.items()):
    if len(files) > 1: print(name, files)
"
```
This checks only the files `index.html` loads directly (always-loaded core/ui/mobile files) — page modules loaded on demand by the router have a lower-but-nonzero version of the same risk if two colliding modules both get loaded in the same session without a full page reload between them.

## Supabase requests fail / nothing loads any data

- Confirm you're serving over `http://`/`https://`, not opening `index.html` via `file://` (see `setup-guide.md`).
- Check `js/config/supabase-config.js` (or the in-app Database Connection panel) has a valid URL and anon key for a real project.
- Check the browser network tab for the actual Supabase error response — RLS policy rejections and missing-table errors both look like generic fetch failures from the app's side.
