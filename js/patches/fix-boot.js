/**
 * ECOLE LA FONTAINE — Boot Fix
 * Ensures initApp and bootApp are always available
 * Last updated: 2026-07-04
 * NOTE: Plain script (NOT a module) — runs in global scope
 */

(function () {
    console.log('[BootFix] Checking exports...');

    // initApp fallback — if boot.js module hasn't exported yet
    if (typeof window.initApp !== 'function') {
        console.warn('[BootFix] initApp missing — applying fallback');
        window.initApp = async function () {
            console.log('[BootFix] initApp fallback called');
            // Show login page as safe default
            const loginPage = document.getElementById('login-page');
            const appPage   = document.getElementById('app-page');
            if (loginPage) loginPage.style.display = 'flex';
            if (appPage)   appPage.style.display   = 'none';
        };
    }

    // bootApp fallback
    if (typeof window.bootApp !== 'function') {
        console.warn('[BootFix] bootApp missing — applying fallback');
        window.bootApp = async function (user) {
            console.log('[BootFix] bootApp fallback — showing app for:', user?.name);
            const loginPage = document.getElementById('login-page');
            const appPage   = document.getElementById('app-page');
            if (loginPage) loginPage.style.display = 'none';
            if (appPage)   appPage.style.display   = 'block';
        };
    }

    console.log('[BootFix] initApp:', typeof window.initApp);
    console.log('[BootFix] bootApp:', typeof window.bootApp);
})();
