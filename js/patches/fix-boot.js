/**
 * ECOLE LA FONTAINE — Boot Fix
 * Ensures initApp and bootApp are available
 * Last updated: 2026-07-04
 */

(function () {
    console.log('[BootFix] Checking exports...');

    if (typeof window.initApp !== 'function') {
        console.warn('[BootFix] initApp missing — applying emergency fix');
        window.initApp = async function () {
            console.log('[BootFix] initApp fallback called');
            try {
                const module = await import('../core/boot.js');
                if (module.initApp) {
                    window.initApp = module.initApp;
                    return await module.initApp();
                }
            } catch (e) {
                console.error('[BootFix] Failed to load boot module:', e);
            }
            document.getElementById('login-page').style.display = 'flex';
            document.getElementById('app-page').style.display = 'none';
        };
    }

    if (typeof window.bootApp !== 'function') {
        console.warn('[BootFix] bootApp missing — applying emergency fix');
        window.bootApp = async function (user) {
            console.log('[BootFix] bootApp fallback called for:', user);
            try {
                const module = await import('../core/boot.js');
                if (module.bootApp) {
                    window.bootApp = module.bootApp;
                    return await module.bootApp(user);
                }
            } catch (e) {
                console.error('[BootFix] Failed to load boot module:', e);
            }
            document.getElementById('login-page').style.display = 'none';
            document.getElementById('app-page').style.display = 'block';
        };
    }

    console.log('[BootFix] Final status:');
    console.log('  initApp:', typeof window.initApp);
    console.log('  bootApp:', typeof window.bootApp);

    // ✅ DO NOT call initApp here — let main.js handle it
    console.log('[BootFix] Waiting for main.js to initialize');
})();