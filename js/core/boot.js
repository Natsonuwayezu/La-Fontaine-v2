/* ═══════════════════════════════════════════════════════════════════
   js/core/boot.js
   ═══════════════════════════════════════════════════════════════════
   Purpose : Application entry point. Called by js/main.js on
             DOMContentLoaded. Orchestrates the full startup sequence:
               1. Verify Supabase credentials exist
               2. Test DB connection
               3. Restore session or show login
               4. Render the app shell (sidebar + topbar)
               5. Navigate to the correct first module
   Load order: LAST of all core files, just before window-exposure.js.
   ═══════════════════════════════════════════════════════════════════ */

'use strict';

/* ─────────────────────────────────────────────────────────────────
   BOOT SEQUENCE
   ───────────────────────────────────────────────────────────────── */

/**
 * Main boot function. Called once by main.js on DOMContentLoaded.
 * Everything else in the app is triggered from here.
 */
async function boot() {
    console.info(`[Boot] ${APP_NAME} v${APP_VERSION} starting…`);

    // ── Step 1: Apply saved theme immediately (before any render) ──
    _applyInitialTheme();

    // ── Step 2: Register Service Worker ───────────────────────────
    // Non-blocking — do not await, let it register in background
    registerServiceWorker().catch(err => {
        console.warn('[Boot] SW registration failed:', err.message);
    });

    // ── Step 3: Init offline listeners ────────────────────────────
    initOfflineListeners();

    // ── Step 4: Open IndexedDB ─────────────────────────────────────
    await openOfflineDB().catch(err => {
        console.warn('[Boot] IndexedDB unavailable:', err.message);
    });

    // ── Step 5: Check for Supabase credentials ────────────────────
    if (!hasSupabaseCredentials()) {
        console.warn('[Boot] No Supabase credentials — showing API settings.');
        _showApiSetupScreen();
        return;
    }

    // ── Step 6: Test DB connection (non-blocking toast on fail) ───
    const connTest = await testSupabaseConnection();
    if (!connTest.ok) {
        console.warn('[Boot] Supabase connection test failed:', connTest.error);
        // Show a warning but continue — user might be offline and have a session
        if (typeof showToast === 'function') {
            showToast(
                `Database connection issue: ${connTest.error}`,
                'warning',
                8000
            );
        }
    }

    // ── Step 7: Render the app shell ──────────────────────────────
    // Shell renders sidebar + topbar + #app placeholder.
    // Do this before session check so the layout is ready.
    if (typeof renderShell === 'function') {
        await renderShell().catch(err => {
            console.error('[Boot] Shell render failed:', err.message);
        });
    }
    // Show app div (hidden on load to prevent flash before auth)
    const _appEl = document.getElementById('app');
    if (_appEl) _appEl.style.display = '';

    // ── Step 8: Check for existing session ────────────────────────
    const sessionRestored = await checkSession();

    if (sessionRestored) {
        // User is already logged in — navigate to correct module
        console.info('[Boot] Session restored. Navigating to app.');

        // Check if URL has a deep-link hash
        const hashModule = _moduleIdFromUrlHash();
        if (hashModule && canNavigateTo(hashModule)) {
            await navigateTo(hashModule);
        } else {
            // Navigate to role home
            const homeModule = DEFAULT_MODULE[state.currentUser?.role] || 'admin-dashboard';
            await navigateTo(homeModule);
        }

        // Start background sync polling
        if (typeof startSyncPolling === 'function') startSyncPolling();

        // Update offline badge
        if (typeof updateOfflineBadge === 'function') updateOfflineBadge().catch(() => { });

    } else {
        // No session — show login page
        console.info('[Boot] No session found. Showing login.');
        if (typeof hideSidebar === 'function') hideSidebar();
        if (typeof renderLoginPage === 'function') renderLoginPage();
    }

    console.info('[Boot] Boot sequence complete.');
}

/* ─────────────────────────────────────────────────────────────────
   INITIAL THEME APPLICATION
   ───────────────────────────────────────────────────────────────── */

/**
 * Apply the saved theme (dark/light) as early as possible to prevent
 * flash of wrong theme on load.
 */
function _applyInitialTheme() {
    const savedTheme = localStorage.getItem('lf_theme');
    if (savedTheme === 'dark' || savedTheme === 'light') {
        document.documentElement.setAttribute('data-theme', savedTheme);
    } else {
        // Detect system preference
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        document.documentElement.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
    }
}

/* ─────────────────────────────────────────────────────────────────
   INITIAL HASH NAVIGATION
   ───────────────────────────────────────────────────────────────── */

/**
 * Read a moduleId from the URL hash (e.g. /#marks-entry).
 * Returns null if hash is not a valid moduleId.
 */
function _moduleIdFromUrlHash() {
    const hash = window.location.hash.replace('#', '').trim();
    return (hash && MODULE_FILE_MAP[hash]) ? hash : null;
}

/* ─────────────────────────────────────────────────────────────────
   API SETUP SCREEN
   Shown when no Supabase credentials are stored.
   ───────────────────────────────────────────────────────────────── */

/**
 * Render a first-time setup screen asking the user to enter their
 * Supabase project URL and anon key.
 * This replaces the full app shell — no sidebar/topbar needed.
 */
function _showApiSetupScreen() {
    const body = document.body;
    body.innerHTML = `
        <div class="api-setup-screen">
            <div class="api-setup-card">
                <div class="api-setup-logo">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none"
                         stroke="var(--primary,#c44536)" stroke-width="1.5">
                        <path d="M22 10v6M2 10l10-5 10 5-10 5z"/>
                        <path d="M6 12v5c3 3 9 3 12 0v-5"/>
                    </svg>
                </div>
                <h1 class="api-setup-title">École La Fontaine</h1>
                <p class="api-setup-subtitle">First-time setup — connect to your database</p>

                <div class="form-group">
                    <label>Supabase Project URL</label>
                    <input type="url" id="setup-sb-url"
                           placeholder="https://xxxxx.supabase.co"
                           value="${esc(localStorage.getItem(APP_CONFIG.sbUrlKey) || '')}">
                </div>

                <div class="form-group">
                    <label>Supabase Anon Key</label>
                    <input type="password" id="setup-sb-key"
                           placeholder="eyJhbGciOi…"
                           value="${esc(localStorage.getItem(APP_CONFIG.sbKeyKey) || '')}">
                </div>

                <div class="api-setup-alert" id="setup-alert" style="display:none"></div>

                <button class="login-btn" id="setup-btn" onclick="testAndSaveSetup()">
                    Connect and Continue
                </button>

                <p class="api-setup-help">
                    Find these in your Supabase project under
                    <strong>Settings → API</strong>.
                </p>
            </div>
        </div>`;
}

/**
 * Test the entered credentials and save if valid.
 * Called by the setup screen's button.
 */
async function testAndSaveSetup() {
    const url = document.getElementById('setup-sb-url')?.value?.trim();
    const key = document.getElementById('setup-sb-key')?.value?.trim();
    const alert = document.getElementById('setup-alert');
    const btn = document.getElementById('setup-btn');

    if (!url || !key) {
        if (alert) { alert.textContent = 'Please enter both the URL and key.'; alert.style.display = 'block'; }
        return;
    }

    if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner-sm"></span> Testing…'; }

    try {
        // Temporarily set credentials to test
        saveSupabaseCredentials(url, key);

        const result = await testSupabaseConnection();

        if (result.ok) {
            // Reload the app fully now that credentials are set
            location.reload();
        } else {
            if (alert) {
                alert.textContent = result.error || 'Connection failed. Check your URL and key.';
                alert.style.display = 'block';
            }
            if (btn) { btn.disabled = false; btn.textContent = 'Connect and Continue'; }
        }
    } catch (err) {
        if (alert) { alert.textContent = err.message; alert.style.display = 'block'; }
        if (btn) { btn.disabled = false; btn.textContent = 'Connect and Continue'; }
    }
}

/* ─────────────────────────────────────────────────────────────────
   EXPOSE
   ───────────────────────────────────────────────────────────────── */

window.boot = boot;
window.testAndSaveSetup = testAndSaveSetup;