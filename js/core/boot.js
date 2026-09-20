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

    // ── STEP 1: Apply theme immediately (no flash) ─────────────────
    _applyInitialTheme();

    // ── STEP 2: Show login page immediately ────────────────────────
    // Login page is static HTML in index.html — already visible.
    // Just make sure boot-loader and app are hidden.
    const loginPage  = document.getElementById('login-page');
    const bootLoader = document.getElementById('boot-loader');
    const appEl      = document.getElementById('app');
    if (loginPage)  loginPage.style.display  = 'flex';
    if (bootLoader) bootLoader.style.display  = 'none';
    if (appEl)      appEl.style.display       = 'none';

    // ── STEP 3: Non-blocking background tasks (don't await) ────────
    syncServerTime().catch(() => {});
    if (typeof registerServiceWorker === 'function')
        registerServiceWorker().catch(() => {});
    if (typeof initOfflineListeners === 'function')
        initOfflineListeners();
    if (typeof openOfflineDB === 'function')
        openOfflineDB().catch(() => {});

    // ── STEP 4: Check credentials ──────────────────────────────────
    if (!hasSupabaseCredentials()) {
        _hideBootLoader();
        _showApiSetupScreen();
        return;
    }

    // ── STEP 5: Check for Google OAuth redirect ────────────────────
    const handledGoogle = await handleGoogleRedirect().catch(() => false);
    if (handledGoogle && state.currentUser) {
        // Google login succeeded — go to app
        await _postLoginBoot();
        return;
    }

    // ── STEP 6: Check existing session ────────────────────────────
    const sessionValid = await _checkSessionQuick();
    if (sessionValid) {
        // Returning user with valid session — skip login page
        if (loginPage) loginPage.style.display = 'none';
        await _postLoginBoot();
        return;
    }

    // ── STEP 7: No session — login page is already showing ─────────
    // Initialize login page particles and biometric button
    _initLoginPage();
    console.info('[Boot] Login page ready');
}

/**
 * Check if a saved session is valid WITHOUT loading all data.
 * Fast — just reads localStorage.
 */
async function _checkSessionQuick() {
    try {
        const session = typeof _readSession === 'function' ? _readSession() : null;
        if (!session || !session.user || !session.user.id) return false;
        const now = Date.now();
        if (session.expiresAt && now > session.expiresAt) {
            if (typeof _clearSession === 'function') _clearSession();
            return false;
        }
        // Restore user into state without loading all data yet
        state.currentUser = session.user;
        return true;
    } catch (e) {
        return false;
    }
}

/**
 * Called after login (password/Google/biometric) or valid session restore.
 * Shows boot-loader, loads critical data, renders shell, hides boot-loader.
 */
async function _postLoginBoot() {
    const loginPage  = document.getElementById('login-page');
    const bootLoader = document.getElementById('boot-loader');
    const appEl      = document.getElementById('app');

    // Hide login, show boot loader
    if (loginPage)  loginPage.style.display  = 'none';
    if (bootLoader) { bootLoader.style.display = 'flex'; }
    if (appEl)      appEl.style.display       = 'none';

    _setBootProgress(10);
    _setBootMsg('Loading school data…');

    try {
        // ── Critical data (must have before rendering shell) ────────
        // Phase 1: school settings + academic year + terms + classes
        await _loadCriticalData();
        _setBootProgress(45);
        _setBootMsg('Building interface…');

        // ── Render shell (sidebar + topbar) ────────────────────────
        if (typeof renderShell === 'function') {
            await renderShell().catch(err =>
                console.error('[Boot] Shell render failed:', err.message));
        }
        _setBootProgress(65);

        // ── Apply period theme now that we have year/term data ──────
        if (typeof applyPeriodTheme === 'function') applyPeriodTheme();

        // ── Show app ────────────────────────────────────────────────
        if (bootLoader) bootLoader.style.display = 'none';
        if (appEl)      appEl.style.display       = '';

        _setBootProgress(80);
        _setBootMsg('Loading students…');

        // ── Navigate to home module ──────────────────────────────────
        const role   = state.currentUser?.role || 'admin';
        const home   = DEFAULT_MODULE[role] || 'admin-dashboard';
        if (typeof navigateTo === 'function') navigateTo(home);

        // ── Load remaining data in background ────────────────────────
        // Students, marks, fees etc. load AFTER the dashboard shows.
        // Modules use skeleton screens while this completes.
        _loadBackgroundData().then(() => {
            _setBootProgress(100);
            if (typeof applyPeriodTheme === 'function') applyPeriodTheme();
            if (typeof _setupAutoHolidaySwitch === 'function') _setupAutoHolidaySwitch();
            if (typeof startSyncPolling === 'function') startSyncPolling();
            if (typeof runDailyOverdueCheck === 'function') runDailyOverdueCheck().catch(()=>{});
            if (typeof loadUserNotifications === 'function') loadUserNotifications().catch(()=>{});
            console.info('[Boot] All data loaded');
        }).catch(err => console.warn('[Boot] Background load error:', err.message));

    } catch (err) {
        console.error('[Boot] Post-login boot failed:', err);
        if (bootLoader) bootLoader.style.display = 'none';
        if (appEl)      appEl.style.display       = '';
        showToast('Some data failed to load. Please refresh.', 'warning');
    }
}

/**
 * Load ONLY the data needed to render the shell and dashboard:
 * school settings, academic years, terms, classes.
 * Fast — 4 parallel requests.
 */
async function _loadCriticalData() {
    const [settings, years, terms, classes] = await Promise.all([
        typeof getSchoolSettings === 'function'
            ? getSchoolSettings().catch(() => ({}))
            : Promise.resolve({}),
        getAll('academic_years', 'order=year_name.desc').catch(() => []),
        getAll('terms', 'order=term_number.asc').catch(() => []),
        getAll('classes', 'is_active=eq.true&order=sort_order.asc').catch(() => []),
    ]);
    if (typeof updateStateBatch === 'function') {
        updateStateBatch({
            schoolSettings  : settings,
            academicYears   : years  || [],
            terms           : terms  || [],
            classes         : classes || [],
        });
    } else {
        state.schoolSettings = settings;
        state.academicYears  = years  || [];
        state.terms          = terms  || [];
        state.classes        = classes || [];
    }
    // Auto-select active year + term
    if (typeof _autoSelectPeriod === 'function') _autoSelectPeriod();
}

/**
 * Load everything else after the dashboard is visible.
 * Students, marks, fees, teachers, assessments, etc.
 */
async function _loadBackgroundData() {
    if (typeof loadAllData === 'function') {
        await loadAllData({ silent: true });
    }
}

/**
 * Initialise login page: particles animation + biometric button visibility.
 */
function _initLoginPage() {
    // Particles
    const container = document.getElementById('particles-bg');
    if (container && !container.children.length) {
        for (let k = 0; k < 15; k++) {
            const p = document.createElement('div');
            p.className = 'particle';
            const size = 20 + Math.random() * 60;
            p.style.cssText = [
                `width:${size}px`,
                `height:${size}px`,
                `left:${Math.random()*100}%`,
                `top:${Math.random()*100}%`,
                `animation-duration:${12 + Math.random()*18}s`,
                `animation-delay:${-Math.random()*20}s`,
            ].join(';');
            container.appendChild(p);
        }
    }

    // Show biometric button if available and registered
    const bioWrap = document.getElementById('biometric-wrap');
    if (bioWrap) {
        const avail   = typeof isBiometricAvailable === 'function' && isBiometricAvailable();
        const enabled = typeof isBiometricEnabled   === 'function' && isBiometricEnabled();
        bioWrap.style.display = (avail && enabled) ? 'block' : 'none';
    }

    // Show Google button
    const gBtn = document.getElementById('google-btn');
    if (gBtn) gBtn.style.display = 'flex';

    // Show lockout banner if applicable
    if (typeof _checkLockout === 'function') {
        const lockout = _checkLockout();
        const banner  = document.getElementById('lockout-banner');
        const msgEl   = document.getElementById('lockout-msg');
        if (banner && lockout.locked) {
            banner.style.display = 'flex';
            if (msgEl) msgEl.textContent = `Too many failed attempts. Try again in ${lockout.minutesLeft} minute(s).`;
        }
    }
}

/** Called from auth.js renderLoginPage() — now just a no-op since HTML is static */
window.renderLoginPage = function() {
    const loginPage = document.getElementById('login-page');
    const appEl     = document.getElementById('app');
    const bootEl    = document.getElementById('boot-loader');
    if (loginPage) loginPage.style.display = 'flex';
    if (appEl)     appEl.style.display      = 'none';
    if (bootEl)    bootEl.style.display     = 'none';
    _initLoginPage();
};

/** Called from auth.js _completeLogin() after login succeeds */
window.showPostLoginLoader = function() {
    _postLoginBoot();
};

/** openLoginCard — called by the fold cover onclick */
window.openLoginCard = function() {
    const wrap = document.getElementById('card-wrap');
    if (wrap) {
        wrap.classList.add('open');
        // Focus first field after animation
        setTimeout(() => {
            const role = document.getElementById('login-role');
            if (role) role.focus();
        }, 900);
    }
};

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
        const today = typeof todayISO === 'function' ? todayISO() : new Date().toISOString().split('T')[0];
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
