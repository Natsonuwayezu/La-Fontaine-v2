/* ═══════════════════════════════════════════════════════════════════
   tests/router-tests.js
   ═══════════════════════════════════════════════════════════════════
   Tests for js/core/router.js's pure logic: moduleIdToRenderFn()
   (nav id → expected render function name), and MODULE_FILE_MAP (nav
   id → source file path, or array of paths for pages split into a
   data-layer file + a render-page file). navigateTo() itself does
   full page rendering + DB calls and isn't covered here.

   The MODULE_FILE_MAP tests check against the real filesystem — if a
   path in the map is ever mistyped or a file gets renamed/moved
   without updating the map, these tests fail immediately instead of
   surfacing as a runtime 404 the next time someone happens to click
   that nav item.
   ═══════════════════════════════════════════════════════════════════ */

const fs = require('fs');
const path = require('path');
const { loadScripts, REPO_ROOT } = require('./helpers/load-scripts');

beforeAll(() => {
    loadScripts([
        'js/config/constants.js',
        'js/core/utils.js',
        'js/core/state.js',
        'js/core/logger.js',
        'js/core/permissions.js',
        'js/core/error-handler.js',
        'js/core/router.js',
    ]);
});

describe('moduleIdToRenderFn', () => {
    test('converts a simple hyphenated id to PascalCase render-function name', () => {
        expect(moduleIdToRenderFn('academic-calendar')).toBe('renderAcademicCalendar');
    });

    test('handles a single-word id', () => {
        expect(moduleIdToRenderFn('timetable')).toBe('renderTimetable');
    });

    test('handles a longer multi-hyphen id', () => {
        expect(moduleIdToRenderFn('teacher-assignments')).toBe('renderTeacherAssignments');
    });

    test('matches the actual window.renderX function names used across settings/ and staff/', () => {
        expect(moduleIdToRenderFn('school-settings')).toBe('renderSchoolSettings');
        expect(moduleIdToRenderFn('backup-restore')).toBe('renderBackupRestore');
        expect(moduleIdToRenderFn('system-logs')).toBe('renderSystemLogs');
        expect(moduleIdToRenderFn('user-management')).toBe('renderUserManagement');
    });
});

describe('APP_NAME / APP_VERSION (regression: used to be undefined everywhere)', () => {
    test('both are defined as bare top-level constants', () => {
        // router.js's loadModuleScript() builds every dynamic module-load
        // URL as `filePath + '?v=' + APP_VERSION` — if this were undefined,
        // navigating to ANY page would throw ReferenceError.
        expect(typeof APP_NAME).toBe('string');
        expect(APP_NAME.length).toBeGreaterThan(0);
        expect(typeof APP_VERSION).toBe('string');
        expect(APP_VERSION.length).toBeGreaterThan(0);
    });

    test('match the values in APP_CONFIG', () => {
        expect(APP_NAME).toBe(APP_CONFIG.name);
        expect(APP_VERSION).toBe(APP_CONFIG.version);
    });
});

describe('safeRenderModule (regression: used to wipe #app instead of #moduleContent on error)', () => {
    beforeEach(() => {
        document.body.innerHTML = `
            <div id="app">
                <aside id="sidebar">SIDEBAR CONTENT</aside>
                <div id="moduleContent"></div>
            </div>
        `;
    });

    test('a successful render leaves the sidebar untouched', async () => {
        await safeRenderModule('test-module', () => {
            document.getElementById('moduleContent').innerHTML = '<p>Page content</p>';
        });
        expect(document.getElementById('sidebar').textContent).toBe('SIDEBAR CONTENT');
        expect(document.getElementById('moduleContent').innerHTML).toContain('Page content');
    });

    test('a failed render shows the error inside #moduleContent, not by wiping #app (regression)', async () => {
        await safeRenderModule('test-module', () => {
            throw new Error('Simulated render failure');
        });
        // The sidebar must still exist — #app itself must not have been wiped.
        expect(document.getElementById('sidebar')).not.toBeNull();
        expect(document.getElementById('sidebar').textContent).toBe('SIDEBAR CONTENT');
        // The error UI should have landed in #moduleContent instead.
        expect(document.getElementById('moduleContent').innerHTML).toContain('module-error');
    });
});

describe('navigateTo passes a real container element to render functions (regression)', () => {
    // A full behavioral test of navigateTo() isn't practical here: it calls
    // loadModuleScript(), which injects a real <script src> tag — and jsdom
    // doesn't execute or fetch dynamically-injected scripts by default, so
    // that promise would simply never resolve. Instead, this asserts against
    // the router's own source text that it derives #moduleContent and passes
    // it into renderFn — a direct regression guard for the exact bug that
    // was fixed (renderFn(params) instead of renderFn(container, params)).
    const routerSource = fs.readFileSync(path.join(REPO_ROOT, 'js/core/router.js'), 'utf8');

    test('derives #moduleContent as the render container', () => {
        expect(routerSource).toMatch(/getElementById\(\s*['"]moduleContent['"]\s*\)/);
    });

    test('calls renderFn with the derived container, not with params alone', () => {
        expect(routerSource).toMatch(/renderFn\(\s*moduleContainer\s*,\s*params\s*\)/);
    });

    test('the skeleton loader also targets #moduleContent, not #app (regression)', () => {
        const skeletonFnMatch = routerSource.match(/function _showModuleSkeleton[\s\S]*?\n}/);
        expect(skeletonFnMatch).not.toBeNull();
        expect(skeletonFnMatch[0]).toMatch(/getElementById\(\s*['"]moduleContent['"]\s*\)/);
        expect(skeletonFnMatch[0]).not.toMatch(/getElementById\(\s*['"]app['"]\s*\)/);
    });
});

describe('MODULE_FILE_MAP entries with companion data-layer files', () => {
    test('at least the known split pages use an array mapping', () => {
        const arrayMappings = Object.entries(MODULE_FILE_MAP).filter(([, v]) => Array.isArray(v));
        const ids = arrayMappings.map(([id]) => id);
        expect(ids).toEqual(expect.arrayContaining([
            'academic-calendar', 'grading-scale', 'user-management',
            'teacher-assignments', 'teacher-performance', 'timetable',
        ]));
    });

    test('regression: grading-scale must load grading-settings.js (the actual render page), not just grading-scale.js (the data layer)', () => {
        const mapped = MODULE_FILE_MAP['grading-scale'];
        expect(Array.isArray(mapped)).toBe(true);
        expect(mapped).toContain('js/modules/settings/grading-settings.js');
    });

    test('every array-mapped moduleId ends with a file that plausibly matches its render function name', () => {
        const arrayMappings = Object.entries(MODULE_FILE_MAP).filter(([, v]) => Array.isArray(v));
        for (const [moduleId, files] of arrayMappings) {
            const lastFile = files[files.length - 1];
            const lastFileBase = lastFile.split('/').pop().replace('.js', '');
            const moduleWords = moduleId.split('-');
            const fileWords = lastFileBase.split('-');
            const overlap = moduleWords.some(w => fileWords.includes(w));
            expect({ moduleId, lastFile, overlap }).toEqual({ moduleId, lastFile, overlap: true });
        }
    });

    test('loadModuleScript is exposed for the router to call during navigation', () => {
        expect(typeof loadModuleScript).toBe('function');
    });
});

describe('MODULE_FILE_MAP', () => {
    test('every mapped file path actually exists on disk', () => {
        const missing = [];
        for (const [moduleId, mapped] of Object.entries(MODULE_FILE_MAP)) {
            const filePaths = Array.isArray(mapped) ? mapped : [mapped];
            for (const filePath of filePaths) {
                const fullPath = path.join(REPO_ROOT, filePath);
                if (!fs.existsSync(fullPath)) missing.push(`${moduleId} -> ${filePath}`);
            }
        }
        expect(missing).toEqual([]);
    });

    const KNOWN_PENDING_MODULES = new Set([
        'overdue-payments', 'student-statements',
    ]);

    test('no module outside the known-pending list has an empty (stub) file', () => {
        const unexpectedlyEmpty = [];
        for (const [moduleId, mapped] of Object.entries(MODULE_FILE_MAP)) {
            if (KNOWN_PENDING_MODULES.has(moduleId)) continue;
            const filePaths = Array.isArray(mapped) ? mapped : [mapped];
            for (const filePath of filePaths) {
                const fullPath = path.join(REPO_ROOT, filePath);
                if (fs.existsSync(fullPath) && fs.statSync(fullPath).size === 0) {
                    unexpectedlyEmpty.push(`${moduleId} -> ${filePath}`);
                }
            }
        }
        expect(unexpectedlyEmpty).toEqual([]);
    });

    test('has at least one entry per major section (dashboard, settings, staff)', () => {
        const ids = Object.keys(MODULE_FILE_MAP);
        expect(ids.some(id => id.includes('dashboard'))).toBe(true);
        expect(ids).toEqual(expect.arrayContaining(['school-settings', 'grading-scale', 'backup-restore']));
        expect(ids).toEqual(expect.arrayContaining(['timetable', 'user-management']));
    });
});
