/* ═══════════════════════════════════════════════════════════════════
   tests/module-exposure-tests.js
   ═══════════════════════════════════════════════════════════════════
   The single highest-value test in this suite, added after finding 17
   fully-built, real, nav-registered pages (the entire Students module,
   entire Attendance module, entire Communication module, admin-
   dashboard.js, both holidays modules) that were completely
   unreachable via navigation — each one built and syntax-valid, but
   never assigned to the exact window.render<X> name core/router.js's
   moduleIdToRenderFn() derives from its nav id. No syntax error, no
   thrown exception at load time — the page just silently never
   rendered when clicked.

   This loads each MODULE_FILE_MAP entry's file(s) into an isolated
   sandbox (a Proxy-based fake global that resolves any undefined
   cross-file dependency to a harmless stub, so a file's own top-level
   code — which only DEFINES functions and assigns to window; it never
   CALLS another file's functions at the top level — can execute to
   completion without needing that file's entire real dependency chain
   loaded). It then checks, for real, that the exact function name the
   router will look up was actually assigned.

   A handful of moduleIds are real, intentional exceptions — reusable
   components or data-layer files invoked directly by other pages
   rather than served as a standalone page — see ALLOWED_NON_PAGES.
   ═══════════════════════════════════════════════════════════════════ */

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { REPO_ROOT } = require('./helpers/load-scripts');

// moduleIds confirmed (by checking config/navigation.js and cross-file
// callers) to be reusable components or data-layer companions, not
// standalone pages — they're expected to have no render<X> function.
const ALLOWED_NON_PAGES = new Set([
    'sibling-linking',       // modal picker (window.SiblingLinking.openPicker), no nav route
    'notification-center',   // topbar bell dropdown (window.NotificationCenter.attach), no nav route
    'analytics-settings',    // settings modal invoked from analytics.js, no nav route
    'bulk-finance-actions',  // action library called from finance pages, no nav route
    'bulk-student-actions',  // action library called from student-list.js, no nav route
    'academic-years',        // data layer for academic-calendar.js
    'teachers',               // data layer for several staff/ pages
    'subjects',                // data layer for several staff/settings pages
    'holidays',                // data layer for settings/academic-calendar.js's Holidays tab
    'settings',                 // shared SettingsTabs shell, not a page itself
    'users',                    // data layer for staff/user-management.js
    'ranking-engine',        // supporting logic for academics/rankings.js
    'timetable-conflicts',   // supporting logic for staff/timetable.js
    'staff-timetable',       // sub-view invoked by staff/timetable.js, not standalone
]);

function moduleIdToRenderFn(moduleId) {
    return 'render' + moduleId
        .split('-')
        .map(w => w.charAt(0).toUpperCase() + w.slice(1))
        .join('');
}

function getModuleFileMapEntries() {
    const routerSrc = fs.readFileSync(path.join(REPO_ROOT, 'js/core/router.js'), 'utf8');
    const block = routerSrc.match(/const MODULE_FILE_MAP = \{([\s\S]*?)\n\};/)[1];
    return [...block.matchAll(/'([\w-]+)':\s*(\[[^\]]*\]|'[^']*')/g)].map(m => {
        const paths = [...m[2].matchAll(/'([^']+)'/g)].map(p => p[1]);
        return { moduleId: m[1], paths };
    });
}

/**
 * Load `content` into an isolated sandbox where any undefined global
 * read returns a harmless callable/indexable stub, but real
 * `window.X = ...` assignments are tracked precisely (not confused
 * with the stub fallback) — see this file's header comment.
 */
function loadInSandbox(content) {
    const assigned = {};
    function makeStub() {
        return new Proxy(function () { return makeStub(); }, {
            get(target, prop) {
                if (prop === Symbol.toPrimitive) return () => '';
                if (prop in target) return target[prop];
                return makeStub();
            },
            set(target, prop, value) { target[prop] = value; return true; },
        });
    }
    const sandbox = new Proxy({}, {
        get(target, prop) {
            if (prop === 'window') return sandbox;
            if (prop === 'console') return console;
            if (prop === 'document') return makeStub();
            if (['Object', 'Array', 'Math', 'JSON', 'Date', 'Number', 'String', 'Boolean',
                 'Promise', 'Map', 'Set', 'Error', 'RegExp', 'parseInt', 'parseFloat', 'isNaN',
                 'undefined', 'NaN', 'Infinity', 'globalThis', 'Symbol'].includes(prop)) {
                return global[prop];
            }
            if (prop in assigned) return assigned[prop];
            if (prop in target) return target[prop];
            return makeStub();
        },
        set(target, prop, value) { assigned[prop] = value; target[prop] = value; return true; },
        has() { return true; },
    });
    vm.createContext(sandbox);
    vm.runInContext(content, sandbox, { timeout: 2000 });
    return assigned;
}

describe('every real page in MODULE_FILE_MAP exposes the render function the router will look for', () => {
    const entries = getModuleFileMapEntries().filter(e => !ALLOWED_NON_PAGES.has(e.moduleId));

    test.each(entries.map(e => [e.moduleId, e.paths]))('%s', (moduleId, paths) => {
        const lastPath = paths[paths.length - 1];
        const fullPath = path.join(REPO_ROOT, lastPath);
        const content = fs.readFileSync(fullPath, 'utf8').trim();

        if (!content) return; // legitimately pending/unbuilt file — not this test's concern

        const fnName = moduleIdToRenderFn(moduleId);
        const assigned = loadInSandbox(content);

        expect(assigned).toHaveProperty(fnName);
        expect(typeof assigned[fnName]).toBe('function');
        // First declared (non-default) param should be present — a
        // render(params = {}) function has .length 0 and is the exact
        // shape of the render-signature bug found repeatedly this
        // session (router calls renderFn(container, params)).
        expect(assigned[fnName].length).toBeGreaterThanOrEqual(1);
    });
});
