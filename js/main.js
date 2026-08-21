/* ═══════════════════════════════════════════════════════════════════
   js/main.js
   ═══════════════════════════════════════════════════════════════════
   Purpose : The final script loaded by index.html.
             Waits for DOMContentLoaded then calls boot().
             This is intentionally tiny — all logic lives in boot.js
             and the files it loads.
   Load order: ABSOLUTE LAST — after window-exposure.js.
   ═══════════════════════════════════════════════════════════════════ */

'use strict';

/* ─────────────────────────────────────────────────────────────────
   ENTRY POINT
   ───────────────────────────────────────────────────────────────── */

if (document.readyState === 'loading') {
    // DOM not yet ready — wait for it
    document.addEventListener('DOMContentLoaded', _start);
} else {
    // DOM already ready (script loaded late / deferred)
    _start();
}

async function _start() {
    try {
        await boot();
    } catch (err) {
        // boot() has its own error handling but this is the final safety net
        console.error('[Main] Fatal boot error:', err);

        // boot() has its own boot-loader hide calls on its normal paths,
        // but a thrown error here means one of those was never reached —
        // without this, the boot-loader (z-index 100000) would cover the
        // error message below forever.
        const bootLoader = document.getElementById('boot-loader');
        if (bootLoader) bootLoader.classList.add('is-hidden');

        const app = document.getElementById('app');
        if (app) {
            app.style.display = '';
            app.innerHTML = `
                <div style="display:flex;align-items:center;justify-content:center;
                            min-height:100vh;padding:24px;text-align:center;
                            font-family:-apple-system,sans-serif;background:#f5f0eb;">
                    <div>
                        <svg width="48" height="48" viewBox="0 0 24 24" fill="none"
                             stroke="#c44536" stroke-width="1.5" style="margin-bottom:16px;">
                            <circle cx="12" cy="12" r="10"/>
                            <line x1="12" y1="8" x2="12" y2="12"/>
                            <line x1="12" y1="16" x2="12.01" y2="16"/>
                        </svg>
                        <h2 style="color:#1a1410;margin:0 0 8px;">Application failed to start</h2>
                        <p style="color:#6b5f56;margin:0 0 20px;max-width:340px;">
                            ${err?.message || 'An unexpected error occurred during startup.'}
                        </p>
                        <button onclick="location.reload()"
                                style="padding:10px 24px;border:none;border-radius:8px;
                                       background:#c44536;color:#fff;font-size:14px;
                                       font-weight:600;cursor:pointer;">
                            Reload App
                        </button>
                    </div>
                </div>`;
        }
    }
}