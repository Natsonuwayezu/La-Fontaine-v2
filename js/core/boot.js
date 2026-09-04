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
    _setBootProgress(10);

    // ── Step 2: Register Service Worker ───────────────────────────
    // Non-blocking — do not await, let it register in background
    if (typeof registerServiceWorker === 'function') {
        registerServiceWorker().catch(err => {
            console.warn('[Boot] SW registration failed:', err.message);
        });
    } else {
        console.warn('[Boot] registerServiceWorker not available — skipping SW registration.');
        // If you need it, you can define a dummy function:
        // window.registerServiceWorker = () => Promise.resolve();
    }

    // ── Step 3: Init offline listeners ────────────────────────────
    initOfflineListeners();

    // ── Step 4: Open IndexedDB ─────────────────────────────────────
    await openOfflineDB().catch(err => {
        console.warn('[Boot] IndexedDB unavailable:', err.message);
    });
    _setBootProgress(30);

    // ── Step 5: Check for Supabase credentials ────────────────────
    if (!hasSupabaseCredentials()) {
        console.warn('[Boot] No Supabase credentials — showing API settings.');
        _hideBootLoader(); // _showApiSetupScreen replaces body.innerHTML entirely
        _showApiSetupScreen();
        return;
    }

    // ── Step 6: Test DB connection (non-blocking toast on fail) ───
    const connTest = await testSupabaseConnection();
    _setBootProgress(50);
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
    _setBootProgress(70);
    // Show app div (hidden on load to prevent flash before auth)
    const _appEl = document.getElementById('app');
    if (_appEl) _appEl.style.display = '';

    // ── Step 8: Check for existing session ────────────────────────
    // A returning Google OAuth redirect (Phase 5) takes priority —
    // it carries its own one-time ?code= param that must be consumed
    // before anything else touches the URL or the session state.
    const handledGoogleRedirect = await handleGoogleRedirect().catch(err => {
        console.error('[Boot] Google redirect handling failed:', err.message);
        return false;
    });

    const sessionRestored = handledGoogleRedirect
        ? !!state.currentUser
        : await checkSession();

    if (sessionRestored) {
        // User is already logged in — navigate to correct module
        console.info('[Boot] Session restored. Navigating to app.');
        _setBootProgress(85);

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

        // Dashboard is actually rendered now — safe to reveal it.
        _setBootProgress(100);
        _hideBootLoader();

    } else {
        // No session — show login page
        console.info('[Boot] No session found. Showing login.');
        if (typeof hideSidebar === 'function') hideSidebar();
        if (typeof renderLoginPage === 'function') renderLoginPage();
        _setBootProgress(100);
        _hideBootLoader();
    }

    console.info('[Boot] Boot sequence complete.');
}

/* ─────────────────────────────────────────────────────────────────
   BOOT LOADER CONTROL
   The #boot-loader element (index.html) is the first thing painted,
   before any JS runs — these just update its progress and hide it
   once there's something real underneath to reveal, rather than
   revealing blank/unstyled content while login or the dashboard is
   still loading.
   ───────────────────────────────────────────────────────────────── */

function _setBootProgress(pct) {
    const fill = document.getElementById('boot-loader-progress');
    if (fill) fill.style.width = pct + '%';
}

function _hideBootLoader() {
    const el = document.getElementById('boot-loader');
    if (el) el.classList.add('is-hidden');
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


/* ─────────────────────────────────────────────────────────────────
   AUTO HOLIDAY MODE SWITCH
   Runs on boot + every 10 minutes. Checks if today falls within an
   active holiday_session → activates holiday mode automatically.
   ───────────────────────────────────────────────────────────────── */
function _setupAutoHolidaySwitch() {
    _checkAndSwitchMode();
    setInterval(_checkAndSwitchMode, 10 * 60 * 1000);
}

async function _checkAndSwitchMode() {
    try {
        const today = new Date().toISOString().split('T')[0];
        const sessions = state.holidaySessions || [];
        const shouldBeActive = sessions.find(s =>
            s.status === 'active' &&
            s.auto_activate !== false &&
            s.start_date <= today &&
            (!s.end_date || s.end_date >= today)
        );
        const currentlyHoliday = typeof isHolidayMode === 'function' && isHolidayMode();
        if (shouldBeActive && !currentlyHoliday) {
            if (typeof activateHolidayMode === 'function') activateHolidayMode(shouldBeActive);
            if (typeof loadDataForHolidaySession === 'function')
                await loadDataForHolidaySession(shouldBeActive.id);
            if (typeof Sidebar !== 'undefined' && Sidebar.refresh) Sidebar.refresh();
            _logAutoSwitch('normal', 'holiday', shouldBeActive.name);
            console.info('[Boot] Auto-activated holiday mode:', shouldBeActive.name);
        } else if (!shouldBeActive && currentlyHoliday) {
            if (typeof deactivateHolidayMode === 'function') deactivateHolidayMode();
            if (typeof applyPeriodTheme === 'function') applyPeriodTheme();
            if (typeof loadAllData === 'function') await loadAllData({ silent: true });
            if (typeof Sidebar !== 'undefined' && Sidebar.refresh) Sidebar.refresh();
            _logAutoSwitch('holiday', 'normal', 'Session ended');
            console.info('[Boot] Auto-deactivated holiday mode — session ended.');
        }
    } catch (err) {
        console.warn('[Boot] Auto-switch check failed:', err.message);
    }
}

function _logAutoSwitch(fromMode, toMode, reason) {
    const now = new Date().toISOString();
    if (typeof insert !== 'function') return;
    insert('system_logs', {
        action_type: 'auto_mode_switch',
        description: `SYSTEM: ${fromMode} → ${toMode}: ${reason}`,
        actor_id: null,
        actor_name: 'SYSTEM',
        created_at: now,
        metadata: JSON.stringify({ fromMode, toMode, reason }),
    }).catch(() => { });
    const admins = (state.users || []).filter(u => u.role === 'admin');
    admins.forEach(admin => {
        insert('notifications', {
            user_id: admin.id,
            title: `Mode switched: ${fromMode} → ${toMode}`,
            body: reason,
            type: 'mode_switch',
            is_read: false,
            created_at: now,
        }).catch(() => { });
    });
}

window.boot = boot;
window.testAndSaveSetup = testAndSaveSetup;
    if (typeof applyPeriodTheme === 'function') applyPeriodTheme();
