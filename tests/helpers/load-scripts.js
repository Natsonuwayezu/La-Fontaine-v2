/* ═══════════════════════════════════════════════════════════════════
   tests/helpers/load-scripts.js
   ═══════════════════════════════════════════════════════════════════
   The app's source files are plain classic <script> files (no
   require/import/module.exports — they attach to `window`, exactly
   as index.html loads them in the browser). This helper loads them
   into Jest's jsdom global scope the same way, so `window.X = X`
   assignments (and their un-exported top-level `const`/`function`
   declarations) become available to the test file exactly as they
   are to any other plain <script> in index.html.

   Usage in a test file:
     const { loadScripts } = require('./helpers/load-scripts');
     loadScripts(['js/config/constants.js', 'js/core/validators.js']);
   ═══════════════════════════════════════════════════════════════════ */

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '../..');

/**
 * Load one or more source files (relative to the repo root) into the
 * current Jest jsdom global scope, in the given order — as ONE combined
 * eval, not one eval per file. This matters: separate eval() calls do
 * not reliably share top-level const/let bindings with each other's
 * function closures (a function defined in file B that references a
 * bare `const` from file A can fail to resolve it if A and B were each
 * eval'd separately). Concatenating and evaluating once matches how
 * multiple classic <script> tags actually share one global scope in a
 * real browser — which is the behavior these files are written to rely
 * on in index.html.
 * @param {string[]} relativePaths
 */
function loadScripts(relativePaths) {
    const combined = relativePaths
        .map(rel => {
            const fullPath = path.join(REPO_ROOT, rel);
            return fs.readFileSync(fullPath, 'utf8');
        })
        .join('\n;\n');
    // Direct eval (not vm.runInThisContext, which targets Node's real
    // global and misses Jest's per-test jsdom sandbox) — this runs in
    // the realm Jest already set up as `window`/`global` for this test
    // file, exactly like index.html loading these files via <script src>.
    // eslint-disable-next-line no-eval
    (0, eval)(combined);
}

module.exports = { loadScripts, REPO_ROOT };
