/* ═══════════════════════════════════════════════════════════════════
   tests/boot-chain-tests.js
   ═══════════════════════════════════════════════════════════════════
   Regression tests for the critical boot-chain bugs found and fixed
   in this session — all of them were silent (no syntax error, no
   thrown exception until runtime) and would have made the app
   completely unusable:

   - core/boot.js was never referenced in index.html's script list at
     all, despite defining and exposing window.boot — every page load
     threw "ReferenceError: boot is not defined" in main.js.
   - ui/sidebar.js, ui/topbar.js, ui/shell.js only exposed their
     namespace objects (window.Sidebar/Topbar/Shell), not the bare
     window.renderSidebar/renderTopbar/renderShell that
     window-exposure.js's own sanity check (and boot.js) expect.
   - The Supabase JS CDN script tag was missing from index.html
     entirely, so every database call failed silently.
   - grading-settings.js only exposed window.renderGradingSettings,
     not window.renderGradingScale — the name the router actually
     derives from the 'grading-scale' nav id — so Settings > Grading
     was unreachable even after the MODULE_FILE_MAP array-loading fix
     from an earlier session.

   These are checked via static inspection of the real source files
   (index.html and the relevant JS), not a full jsdom boot simulation —
   see tests/router-tests.js's similar source-inspection tests for why
   a full behavioral boot test isn't practical in this environment.
   ═══════════════════════════════════════════════════════════════════ */

const fs = require('fs');
const path = require('path');
const { REPO_ROOT } = require('./helpers/load-scripts');

const indexHtml = fs.readFileSync(path.join(REPO_ROOT, 'index.html'), 'utf8');

describe('index.html script list', () => {
    test('core/boot.js is referenced (regression: was entirely missing)', () => {
        expect(indexHtml).toMatch(/src="js\/core\/boot\.js"/);
    });

    test('boot.js loads before window-exposure.js and main.js, per its own documented load order', () => {
        const bootIdx = indexHtml.indexOf('src="js/core/boot.js"');
        const exposureIdx = indexHtml.indexOf('src="js/core/window-exposure.js"');
        const mainIdx = indexHtml.indexOf('src="js/main.js"');
        expect(bootIdx).toBeGreaterThan(-1);
        expect(bootIdx).toBeLessThan(exposureIdx);
        expect(bootIdx).toBeLessThan(mainIdx);
    });

    test('the Supabase JS CDN script is present and loads before supabase-config.js (regression: was entirely missing)', () => {
        expect(indexHtml).toMatch(/supabase-js@2/);
        const cdnIdx = indexHtml.search(/src="https:\/\/[^"]*supabase-js[^"]*"/);
        const configIdx = indexHtml.indexOf('src="js/config/supabase-config.js"');
        expect(cdnIdx).toBeGreaterThan(-1);
        expect(cdnIdx).toBeLessThan(configIdx);
    });
});

describe('window.renderSidebar / renderTopbar / renderShell aliases (regression)', () => {
    test('sidebar.js exposes window.renderSidebar in addition to window.Sidebar', () => {
        const src = fs.readFileSync(path.join(REPO_ROOT, 'js/ui/sidebar.js'), 'utf8');
        expect(src).toMatch(/window\.renderSidebar\s*=/);
    });

    test('topbar.js exposes window.renderTopbar in addition to window.Topbar', () => {
        const src = fs.readFileSync(path.join(REPO_ROOT, 'js/ui/topbar.js'), 'utf8');
        expect(src).toMatch(/window\.renderTopbar\s*=/);
    });

    test('shell.js exposes window.renderShell in addition to window.Shell', () => {
        const src = fs.readFileSync(path.join(REPO_ROOT, 'js/ui/shell.js'), 'utf8');
        expect(src).toMatch(/window\.renderShell\s*=/);
    });
});

describe('grading-settings.js exposes the router-derived name (regression)', () => {
    test('window.renderGradingScale is aliased, not just window.renderGradingSettings', () => {
        const src = fs.readFileSync(path.join(REPO_ROOT, 'js/modules/settings/grading-settings.js'), 'utf8');
        expect(src).toMatch(/window\.renderGradingScale\s*=/);
    });
});

describe('confirmDialog default button color (regression)', () => {
    test('default confirmClass is not btn-danger (was causing every confirmation dialog app-wide to show red, regardless of context)', () => {
        const src = fs.readFileSync(path.join(REPO_ROOT, 'js/ui/modals.js'), 'utf8');
        const m = src.match(/confirmClass\s*=\s*'([^']+)'/);
        expect(m).not.toBeNull();
        expect(m[1]).not.toBe('btn-danger');
    });

    test('genuinely destructive confirmations still opt into btn-danger explicitly', () => {
        const src = fs.readFileSync(path.join(REPO_ROOT, 'js/modules/finance/payment-reversals.js'), 'utf8');
        expect(src).toMatch(/confirmClass:\s*'btn-danger'/);
    });
});

describe('PWA update banner styling (regression: was completely unstyled)', () => {
    test('.pwa-update-banner has real CSS rules somewhere in css/', () => {
        const cssDir = path.join(REPO_ROOT, 'css');
        function findInDir(dir) {
            for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
                const full = path.join(dir, entry.name);
                if (entry.isDirectory()) {
                    if (findInDir(full)) return true;
                } else if (entry.name.endsWith('.css')) {
                    const content = fs.readFileSync(full, 'utf8');
                    if (/\.pwa-update-banner\s*\{/.test(content)) return true;
                }
            }
            return false;
        }
        expect(findInDir(cssDir)).toBe(true);
    });
});
