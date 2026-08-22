/* ═══════════════════════════════════════════════════════════════════
   js/core/auth.js
   ═══════════════════════════════════════════════════════════════════
   Purpose : Authentication — login, logout, session persistence,
             idle timeout (40 min), biometric login, failed-login
             lockout (4 attempts), and role-based post-login routing.
             All session data is stored in localStorage under
             APP_CONFIG.sessionKey.
   References: backend.txt Part 3.1-3.4, Part 13
   Load order: AFTER data-loader.js, logger.js, router.js.
   ═══════════════════════════════════════════════════════════════════ */

'use strict';

/* ─────────────────────────────────────────────────────────────────
   SESSION STORAGE SCHEMA
   Stored in localStorage as JSON under APP_CONFIG.sessionKey:
   {
     userId     : number,
     role       : string,
     firstName  : string,
     lastName   : string,
     username   : string,
     email      : string,
     loginTime  : ISO string,
     lastActive : ISO string,
   }
   ───────────────────────────────────────────────────────────────── */

/* ─────────────────────────────────────────────────────────────────
   IDLE TIMER
   ───────────────────────────────────────────────────────────────── */

let _idleTimer = null;
let _idleWarnTimer = null;
let _idleWarnShown = false;

/**
 * Reset the idle countdown.
 * Called on every user interaction (click, keypress, scroll).
 */
function _resetIdleTimer() {
    clearTimeout(_idleTimer);
    clearTimeout(_idleWarnTimer);
    _idleWarnShown = false;

    // Show warning at 35 minutes
    _idleWarnTimer = setTimeout(() => {
        if (!_idleWarnShown && state.currentUser) {
            _idleWarnShown = true;
            _showIdleWarning();
        }
    }, APP_CONFIG.idleWarningAt);

    // Force logout at 40 minutes
    _idleTimer = setTimeout(() => {
        if (state.currentUser) {
            console.info('[Auth] Session timed out due to inactivity.');
            logout({ reason: 'idle_timeout', silent: false });
        }
    }, APP_CONFIG.sessionDuration);

    // Update lastActive in session
    _touchSession();
}

/**
 * Attach idle event listeners.
 * Called once after login.
 */
function _startIdleWatcher() {
    const EVENTS = ['click', 'keydown', 'scroll', 'mousemove', 'touchstart', 'touchmove'];
    EVENTS.forEach(ev => {
        document.addEventListener(ev, _resetIdleTimer, { passive: true });
    });
    _resetIdleTimer(); // Start counting immediately
}

/**
 * Remove idle event listeners.
 * Called on logout.
 */
function _stopIdleWatcher() {
    clearTimeout(_idleTimer);
    clearTimeout(_idleWarnTimer);
    const EVENTS = ['click', 'keydown', 'scroll', 'mousemove', 'touchstart', 'touchmove'];
    EVENTS.forEach(ev => {
        document.removeEventListener(ev, _resetIdleTimer);
    });
}

/**
 * Show a warning toast/modal before auto-logout.
 */
function _showIdleWarning() {
    if (typeof showToast === 'function') {
        showToast(
            'You have been inactive for 35 minutes. You will be logged out in 5 minutes.',
            'warning',
            10000
        );
    }
}

/* ─────────────────────────────────────────────────────────────────
   SESSION PERSISTENCE
   ───────────────────────────────────────────────────────────────── */

/**
 * Save the current user session to localStorage.
 * @param {Object} user - teacher row from DB
 */
function _saveSession(user) {
    const session = {
        userId: user.id,
        role: user.role,
        firstName: user.first_name || '',
        lastName: user.last_name || '',
        username: user.username || '',
        email: user.email || '',
        loginTime: new Date().toISOString(),
        lastActive: new Date().toISOString(),
    };
    localStorage.setItem(APP_CONFIG.sessionKey, JSON.stringify(session));
}

/**
 * Update lastActive timestamp in session.
 * Called by _resetIdleTimer() on every interaction.
 */
let _lastTouchTime = 0;
function _touchSession() {
    const now = Date.now();
    if (now - _lastTouchTime < 5000) return; // Throttle: max once per 5s
    _lastTouchTime = now;
    try {
        const raw = localStorage.getItem(APP_CONFIG.sessionKey);
        if (!raw) return;
        const session = JSON.parse(raw);
        session.lastActive = new Date().toISOString();
        localStorage.setItem(APP_CONFIG.sessionKey, JSON.stringify(session));
    } catch { /* silent */ }
}

/**
 * Read and validate the stored session.
 * Returns the session object if valid and not expired, else null.
 */
function _readSession() {
    try {
        const raw = localStorage.getItem(APP_CONFIG.sessionKey);
        if (!raw) return null;

        const session = JSON.parse(raw);
        if (!session.userId || !session.role) return null;

        // Check if session has expired based on lastActive
        const lastActive = new Date(session.lastActive).getTime();
        const elapsed = Date.now() - lastActive;

        if (isNaN(elapsed) || elapsed > APP_CONFIG.sessionDuration) {
            localStorage.removeItem(APP_CONFIG.sessionKey);
            return null;
        }

        return session;
    } catch {
        return null;
    }
}

/**
 * Clear the session from localStorage.
 */
function _clearSession() {
    localStorage.removeItem(APP_CONFIG.sessionKey);
}

/* ─────────────────────────────────────────────────────────────────
   FAILED LOGIN LOCKOUT  (Part 13)
   ───────────────────────────────────────────────────────────────── */

const LOCKOUT_KEY = 'lf_login_attempts';
const LOCKOUT_DURATION = 15 * 60 * 1000; // 15 minutes lockout

/**
 * Return { count, lockedUntil } from localStorage.
 */
function _getLockoutStatus() {
    try {
        const raw = localStorage.getItem(LOCKOUT_KEY);
        if (!raw) return { count: 0, lockedUntil: null };
        return JSON.parse(raw);
    } catch {
        return { count: 0, lockedUntil: null };
    }
}

/**
 * Record a failed login attempt and lock if threshold reached.
 */
function _recordFailedAttempt() {
    const status = _getLockoutStatus();
    status.count++;

    if (status.count >= APP_CONFIG.maxLoginAttempts) {
        status.lockedUntil = new Date(Date.now() + LOCKOUT_DURATION).toISOString();
    }

    localStorage.setItem(LOCKOUT_KEY, JSON.stringify(status));
    return status;
}

/**
 * Clear failed attempt counter on successful login.
 */
function _clearFailedAttempts() {
    localStorage.removeItem(LOCKOUT_KEY);
}

/**
 * Check if login is currently locked.
 * Returns { locked: boolean, minutesLeft: number }
 */
function checkLoginLockout() {
    const status = _getLockoutStatus();
    if (!status.lockedUntil) return { locked: false, minutesLeft: 0 };

    const remaining = new Date(status.lockedUntil).getTime() - Date.now();
    if (remaining <= 0) {
        // Lockout expired — clear it
        localStorage.removeItem(LOCKOUT_KEY);
        return { locked: false, minutesLeft: 0 };
    }

    return {
        locked: true,
        minutesLeft: Math.ceil(remaining / 60000),
    };
}

/* ─────────────────────────────────────────────────────────────────
   LOGIN  (Part 3.1)
   ───────────────────────────────────────────────────────────────── */

/**
 * Attempt to log in with a role, username, and password.
 * Returns { success: boolean, error: string|null, user: Object|null }.
 *
 * Authentication flow (Phase 2 of the auth hardening roadmap — see
 * TODO.md):
 *   1. Check lockout status (still client-side/localStorage — Phase 4
 *      moves this server-side too, since this alone is bypassable)
 *   2. Call login_check(username, password, role) — a Postgres
 *      function (docs/sql/001_enable_rls_baseline.sql) that does the
 *      actual lookup + password comparison entirely server-side and
 *      returns a safe row with no password column, ever
 *   3. Check is_active flag
 *   4. Save session, load data, navigate to dashboard
 *
 * NOTE: passwords are still stored as plain text in the database
 * itself (school_settings.admin_password, teachers.password) — this
 * function no longer fetches that value to the browser at all, but
 * the column contents still need real hashing (Phase 3, not done yet).
 *
 * @param {string} role     - 'admin' | 'teacher' | 'accountant'
 * @param {string} username
 * @param {string} password
 */
async function doLogin(role, username, password) {
    // 1. Lockout check
    const lockout = checkLoginLockout();
    if (lockout.locked) {
        return {
            success: false,
            error: `Too many failed attempts. Try again in ${lockout.minutesLeft} minute(s).`,
            user: null,
        };
    }

    if (!role || !username || !password) {
        return { success: false, error: 'Please fill in all fields.', user: null };
    }

    try {
        // 2. Real login check — runs entirely server-side via the
        // login_check() Postgres function (docs/sql/001_enable_rls_baseline.sql).
        // The password value is never fetched to this browser at all,
        // win or lose — a real change from the previous flow, which
        // fetched the full teachers row (password column included) and
        // compared it here in the client. The admin dual-password-source
        // check (school_settings.admin_password OR teachers.password)
        // and the "state not loaded yet, query fresh" fallback both
        // moved server-side into the function itself.
        const rows = await callRPC('login_check', {
            p_username: username,
            p_password: password,
            p_role: role,
        });

        if (!rows || rows.length === 0) {
            _recordFailedAttempt();
            return { success: false, error: 'Invalid username or password.', user: null };
        }

        const user = rows[0];

        // 3. Active check
        if (user.is_active === false) {
            return { success: false, error: 'Your account has been deactivated. Contact admin.', user: null };
        }

        return await _completeLogin(user);

    } catch (err) {
        handleApiError(err, 'login');
        return { success: false, error: 'Login failed. Check your connection.', user: null };
    }
}

/**
 * Complete the login flow after credential verification.
 * @param {Object} user - teacher row
 */
async function _completeLogin(user) {
    // Clear failed attempts on success
    _clearFailedAttempts();

    // Save session
    _saveSession(user);

    // Set current user in state
    updateState('currentUser', {
        id: user.id,
        role: user.role,
        first_name: user.first_name || '',
        last_name: user.last_name || '',
        username: user.username || '',
        email: user.email || '',
        name: `${user.first_name || ''} ${user.last_name || ''}`.trim(),
    });

    // Log the login
    await logLogin(user.id, user.role);

    // Load all data
    await loadAllData();

    // Load user notifications
    await loadUserNotifications().catch(() => { });

    // Start idle watcher and background sync
    _startIdleWatcher();
    startSyncPolling();

    // Run daily overdue check (silent — one per day)
    runDailyOverdueCheck().catch(() => { });

    // Register SW if not already done
    await registerServiceWorker().catch(() => { });

    // Navigate to role-appropriate dashboard
    const homeModule = DEFAULT_MODULE[user.role] || 'admin-dashboard';
    navigateTo(homeModule);

    return { success: true, error: null, user: state.currentUser };
}

/* ─────────────────────────────────────────────────────────────────
   LOGOUT  (Part 3.4)
   ───────────────────────────────────────────────────────────────── */

/**
 * Log out the current user.
 * Clears session, resets state, stops timers, shows login screen.
 *
 * @param {Object} [opts]
 * @param {string}  [opts.reason]  - 'manual' | 'idle_timeout' | 'forced'
 * @param {boolean} [opts.silent]  - if true, skip toasts
 */
async function logout(opts = {}) {
    const { reason = 'manual', silent = false } = opts;

    const userId = state.currentUser?.id;

    if (userId) {
        await logLogout(userId).catch(() => { });
    }

    // Stop timers and polling
    _stopIdleWatcher();
    stopSyncPolling();

    // Clear session from storage
    _clearSession();

    // Clear biometric credential reference
    localStorage.removeItem('lf_biometric_enabled');

    // Reset all state
    resetState();

    // Clear caches
    clearAllCaches();

    // Show appropriate message
    if (!silent && typeof showToast === 'function') {
        if (reason === 'idle_timeout') {
            showToast('You were logged out due to inactivity.', 'info', 5000);
        } else {
            showToast('You have been logged out.', 'info', 3000);
        }
    }

    // Navigate to login
    if (typeof navigateTo === 'function') {
        navigateTo('login');
    } else {
        location.reload();
    }
}

/* ─────────────────────────────────────────────────────────────────
   SESSION CHECK  (Part 3.3)
   ───────────────────────────────────────────────────────────────── */

/**
 * Check if a valid session exists in localStorage.
 * If found, restore the user session and return to the app.
 * Called by boot.js on every page load.
 *
 * @returns {Promise<boolean>} true if session restored, false if user must log in
 */
async function checkSession() {
    const session = _readSession();

    if (!session) {
        console.info('[Auth] No valid session found.');
        return false;
    }

    // Restore current user into state
    updateState('currentUser', {
        id: session.userId,
        role: session.role,
        first_name: session.firstName,
        last_name: session.lastName,
        username: session.username,
        email: session.email,
        name: `${session.firstName} ${session.lastName}`.trim(),
    });

    console.info(`[Auth] Session restored for: ${session.username} (${session.role})`);

    try {
        // Load all data (same as after login)
        await loadAllData({ silent: true });
        await loadUserNotifications().catch(() => { });

        _startIdleWatcher();
        startSyncPolling();
        runDailyOverdueCheck().catch(() => { });

        return true;

    } catch (err) {
        console.error('[Auth] Session restore failed — forcing re-login:', err.message);
        _clearSession();
        resetState();
        return false;
    }
}

/* ─────────────────────────────────────────────────────────────────
   BIOMETRIC LOGIN  (Part 3.5)
   Uses the WebAuthn API (navigator.credentials) where supported.
   Falls back gracefully on unsupported browsers.
   ───────────────────────────────────────────────────────────────── */

/**
 * Check if biometric/WebAuthn is available on this device.
 */
function isBiometricAvailable() {
    return typeof window.PublicKeyCredential !== 'undefined' &&
        typeof navigator.credentials?.get === 'function';
}

/**
 * Check if biometric login is enabled for the current user.
 */
function isBiometricEnabled() {
    return localStorage.getItem('lf_biometric_enabled') === 'true';
}

/**
 * Trigger biometric authentication (fingerprint/face ID).
 * This is a simplified implementation — in production you would
 * need a full WebAuthn registration flow.
 *
 * For this school system, biometric is used as a second-factor
 * quick-unlock after the initial password login, not as a
 * standalone authentication method.
 *
 * @returns {Promise<boolean>} true if biometric succeeded
 */
async function tryBiometricLogin() {
    if (!isBiometricAvailable()) {
        if (typeof showToast === 'function') {
            showToast('Biometric authentication is not supported on this device.', 'warning');
        }
        return false;
    }

    if (!isBiometricEnabled()) {
        if (typeof showToast === 'function') {
            showToast('Biometric login is not set up. Log in with password first.', 'info');
        }
        return false;
    }

    try {
        // For a school's local network app, we use a simple presence
        // confirmation (touching the fingerprint sensor) rather than
        // full server-side challenge/response.
        const credential = await navigator.credentials.get({
            publicKey: {
                challenge: new Uint8Array(32),    // in production: server-issued challenge
                rpId: window.location.hostname,
                userVerification: 'preferred',
                timeout: 30000,
            },
        });

        if (credential) {
            // Biometric succeeded — restore last session automatically
            const session = _readSession();
            if (!session) {
                if (typeof showToast === 'function') {
                    showToast('No saved session found. Please log in with password.', 'info');
                }
                return false;
            }

            updateState('currentUser', {
                id: session.userId,
                role: session.role,
                first_name: session.firstName,
                last_name: session.lastName,
                username: session.username,
                email: session.email,
                name: `${session.firstName} ${session.lastName}`.trim(),
            });

            await loadAllData({ silent: true });
            await loadUserNotifications().catch(() => { });
            _startIdleWatcher();
            startSyncPolling();

            const homeModule = DEFAULT_MODULE[session.role] || 'admin-dashboard';
            navigateTo(homeModule);

            return true;
        }
        return false;

    } catch (err) {
        // User cancelled or sensor failed — fall back to password
        if (err.name !== 'NotAllowedError') {
            console.warn('[Auth] Biometric login failed:', err.message);
        }
        return false;
    }
}

/**
 * Enable biometric login for the current session.
 * Called from Settings → My Profile → Enable Fingerprint.
 */
async function enableBiometricLogin() {
    if (!isBiometricAvailable()) {
        if (typeof showToast === 'function') {
            showToast('Biometric authentication is not supported on this device.', 'error');
        }
        return false;
    }

    try {
        // In production: register a WebAuthn credential with the server.
        // For this app: just mark biometric as enabled in localStorage.
        localStorage.setItem('lf_biometric_enabled', 'true');

        if (typeof showToast === 'function') {
            showToast('Biometric login enabled. You can now use your fingerprint/face.', 'success');
        }
        return true;
    } catch (err) {
        console.warn('[Auth] Enable biometric failed:', err.message);
        return false;
    }
}

/**
 * Disable biometric login.
 */
function disableBiometricLogin() {
    localStorage.removeItem('lf_biometric_enabled');
    if (typeof showToast === 'function') {
        showToast('Biometric login has been disabled.', 'info');
    }
}

/* ─────────────────────────────────────────────────────────────────
   PASSWORD CHANGE
   ───────────────────────────────────────────────────────────────── */

/**
 * Change the password for a teacher account.
 * Admin can change any user's password. Teachers can only change
 * their own.
 *
 * @param {number} userId      - teacher.id
 * @param {string} oldPassword - current password (required for non-admin)
 * @param {string} newPassword - new password
 * @returns {Promise<{ success: boolean, error: string|null }>}
 */
async function changePassword(userId, oldPassword, newPassword) {
    const strength = validatePasswordStrength(newPassword, 'New password');
    if (!strength.valid) {
        return { success: false, error: strength.error };
    }

    try {
        // teachers_public (docs/sql/001_enable_rls_baseline.sql) never
        // includes the password column — this fetch is safe and RLS
        // allows it, unlike fetching from `teachers` directly.
        const user = await getById('teachers_public', userId);
        if (!user) {
            return { success: false, error: 'User not found.' };
        }

        // Non-admin must verify old password — done via the same
        // real, server-side login_check() doLogin() uses, so the
        // current password value is never fetched to this browser
        // either. (Previously this compared user.password directly,
        // which the RLS baseline's column-level REVOKE now makes
        // permanently undefined — that old comparison would always
        // fail for a non-admin, locking out self-service password
        // changes entirely until this fix.)
        if (!iAmAdmin()) {
            const verifyRows = await callRPC('login_check', {
                p_username: user.username,
                p_password: oldPassword,
                p_role: user.role,
            });
            if (!verifyRows || verifyRows.length === 0) {
                return { success: false, error: 'Current password is incorrect.' };
            }
        }

        await update('teachers', userId, {
            password: newPassword,
            updated_at: new Date().toISOString(),
        });

        await logAction('CHANGE_PASSWORD', 'teachers', userId, {
            changed_by: state.currentUser?.id,
        });

        // Refresh teachers in state
        await refreshTable('teachers');

        return { success: true, error: null };

    } catch (err) {
        handleApiError(err, 'change password');
        return { success: false, error: err.message };
    }
}

/**
 * Admin resets a user's password to a new value without needing
 * the old password.
 *
 * @param {number} userId
 * @param {string} newPassword
 */
async function adminResetPassword(userId, newPassword) {
    if (!iAmAdmin()) {
        return { success: false, error: 'Only administrators can reset passwords.' };
    }
    return changePassword(userId, null, newPassword);
}

/* ─────────────────────────────────────────────────────────────────
   LOGIN FORM RENDERING HELPER
   ───────────────────────────────────────────────────────────────── */

/**
 * Render the login page into #app.
 * Called by router.js when no session is found at boot.
 */
function renderLoginPage() {
    const lockout = checkLoginLockout();
    const biometricEnabled = isBiometricAvailable() && isBiometricEnabled();

    const app = document.getElementById('app');
    if (!app) return;
    app.style.display = ''; // show app (was hidden on load to prevent flash)

    const schoolName = state.schoolSettings?.school_name || SCHOOL_DEFAULTS.school_name;
    const schoolMotto = state.schoolSettings?.school_motto || SCHOOL_DEFAULTS.school_motto;

    app.innerHTML = `
    <div id="login-page">
        <div class="particles-bg" id="particles-bg"></div>

        <div class="login-scene">
            <div class="card-wrap" id="login-card-wrap">

                <!-- Fold cover — click to open -->
                <div class="fold-cover" id="fold-cover" onclick="openLoginCard()">
                    <div class="cover-title">
                        <svg width="28" height="28" viewBox="0 0 24 24" fill="none"
                             stroke="currentColor" stroke-width="1.5">
                            <path d="M22 10v6M2 10l10-5 10 5-10 5z"/>
                            <path d="M6 12v5c3 3 9 3 12 0v-5"/>
                        </svg>
                        ${esc(schoolName)}
                    </div>
                </div>

                <!-- Login card -->
                <div class="login-card">
                    <div class="login-content">
                        <!-- Logo -->
                        <div class="logo-box">
                            ${getSchoolLogoHtml(state.schoolSettings?.school_logo || '', '100%')}
                        </div>

                        <div class="school-name">${esc(schoolName)}</div>
                        <div class="login-subtitle">${esc(schoolMotto)}</div>

                        <!-- Alert -->
                        <div class="login-alert" id="login-alert" role="alert">
                            ${lockout.locked
            ? `Account locked. Try again in ${lockout.minutesLeft} minute(s).`
            : ''}
                        </div>

                        <!-- Form -->
                        <div class="login-form">
                            <!-- Role selector -->
                            <div class="login-field">
                                <select id="login-role" ${lockout.locked ? 'disabled' : ''}
                                        onchange="onRoleChange(this.value)">
                                    <option value="">Select your role…</option>
                                    <option value="admin">Administrator</option>
                                    <option value="teacher">Teacher</option>
                                    <option value="accountant">Accountant</option>
                                </select>
                            </div>

                            <!-- Username (hidden until role selected) -->
                            <div class="login-field" id="username-field" style="display:none">
                                <input type="text" id="login-username"
                                       placeholder="Username"
                                       autocomplete="username"
                                       ${lockout.locked ? 'disabled' : ''}
                                       onkeydown="if(event.key==='Enter') document.getElementById('login-password')?.focus()">
                            </div>

                            <!-- Password -->
                            <div class="login-field pw-wrap" id="password-field" style="display:none">
                                <input type="password" id="login-password"
                                       placeholder="Password"
                                       autocomplete="current-password"
                                       ${lockout.locked ? 'disabled' : ''}
                                       onkeydown="if(event.key==='Enter') submitLogin()">
                                <button class="pw-toggle" onclick="togglePasswordVisibility()"
                                        type="button" aria-label="Toggle password visibility">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                                         stroke="currentColor" stroke-width="2" id="pw-eye-icon">
                                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                                        <circle cx="12" cy="12" r="3"/>
                                    </svg>
                                </button>
                            </div>

                            <!-- Login button -->
                            <button class="login-btn" id="login-btn"
                                    onclick="submitLogin()"
                                    style="display:none"
                                    ${lockout.locked ? 'disabled' : ''}>
                                Sign In
                            </button>

                            <!-- Biometric button -->
                            <div id="biometric-btn-wrap" style="display:${biometricEnabled ? 'block' : 'none'}">
                                <button class="login-btn" onclick="tryBiometricLogin()">
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
                                         stroke="currentColor" stroke-width="1.5">
                                        <path d="M12 1a3 3 0 100 6 3 3 0 000-6z"/>
                                        <path d="M6 8a6 6 0 0112 0"/>
                                        <path d="M3 15a9 9 0 0118 0"/>
                                        <path d="M1 20a11 11 0 0122 0"/>
                                    </svg>
                                    Sign in with Biometric
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

            </div>
        </div>
    </div>`;

    // Show alert if locked
    if (lockout.locked) {
        const alertEl = document.getElementById('login-alert');
        if (alertEl) alertEl.style.display = 'block';
    }

    // Spawn particles
    _spawnParticles();

    // Open card with slight delay for entrance effect
    setTimeout(() => openLoginCard(), 100);
}

/**
 * Open the login card (fold animation).
 */
function openLoginCard() {
    const wrap = document.getElementById('login-card-wrap');
    if (wrap) wrap.classList.add('open');
}

/**
 * Show username/password fields when a role is selected.
 */
function onRoleChange(role) {
    const usernameField = document.getElementById('username-field');
    const passwordField = document.getElementById('password-field');
    const loginBtn = document.getElementById('login-btn');

    if (role) {
        if (usernameField) usernameField.style.display = 'block';
        if (passwordField) passwordField.style.display = 'block';
        if (loginBtn) loginBtn.style.display = 'block';
        setTimeout(() => {
            document.getElementById('login-username')?.focus();
        }, 100);
    } else {
        if (usernameField) usernameField.style.display = 'none';
        if (passwordField) passwordField.style.display = 'none';
        if (loginBtn) loginBtn.style.display = 'none';
    }
}

/**
 * Toggle password field visibility.
 */
function togglePasswordVisibility() {
    const input = document.getElementById('login-password');
    const icon = document.getElementById('pw-eye-icon');
    if (!input) return;
    if (input.type === 'password') {
        input.type = 'text';
        if (icon) icon.innerHTML = `
            <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94"/>
            <path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19"/>
            <line x1="1" y1="1" x2="23" y2="23"/>`;
    } else {
        input.type = 'password';
        if (icon) icon.innerHTML = `
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
            <circle cx="12" cy="12" r="3"/>`;
    }
}

/**
 * Handle the login form submit.
 * Called by the Sign In button's onclick.
 */
async function submitLogin() {
    const role = document.getElementById('login-role')?.value?.trim();
    const username = document.getElementById('login-username')?.value?.trim();
    const password = document.getElementById('login-password')?.value;
    const alertEl = document.getElementById('login-alert');
    const btn = document.getElementById('login-btn');

    if (alertEl) { alertEl.style.display = 'none'; alertEl.textContent = ''; }

    if (!role || !username || !password) {
        if (alertEl) {
            alertEl.textContent = 'Please fill in all fields.';
            alertEl.style.display = 'block';
        }
        return;
    }

    // Loading state
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = `<span class="spinner-sm"></span> Signing in…`;
    }

    const result = await doLogin(role, username, password);

    if (!result.success) {
        if (alertEl) {
            alertEl.textContent = result.error || 'Login failed.';
            alertEl.style.display = 'block';
        }
        if (btn) {
            btn.disabled = false;
            btn.textContent = 'Sign In';
        }
    }
    // On success, doLogin calls navigateTo() which replaces the login page
}

/**
 * Spawn floating particle divs for the login page background animation.
 */
function _spawnParticles() {
    const container = document.getElementById('particles-bg');
    if (!container) return;

    for (let i = 0; i < 12; i++) {
        const p = document.createElement('div');
        p.className = 'particle';
        const size = 8 + Math.random() * 20;
        const left = Math.random() * 100;
        const delay = Math.random() * 10;
        const dur = 12 + Math.random() * 10;

        p.style.cssText = `
            width:${size}px; height:${size}px;
            left:${left}%;
            animation-delay:${delay}s;
            animation-duration:${dur}s;`;
        container.appendChild(p);
    }
}

/* ─────────────────────────────────────────────────────────────────
   EXPOSE
   ───────────────────────────────────────────────────────────────── */

window.doLogin = doLogin;
window.logout = logout;
window.checkSession = checkSession;
window.renderLoginPage = renderLoginPage;
window.openLoginCard = openLoginCard;
window.onRoleChange = onRoleChange;
window.submitLogin = submitLogin;
window.togglePasswordVisibility = togglePasswordVisibility;
window.checkLoginLockout = checkLoginLockout;
window.isBiometricAvailable = isBiometricAvailable;
window.isBiometricEnabled = isBiometricEnabled;
window.tryBiometricLogin = tryBiometricLogin;
window.enableBiometricLogin = enableBiometricLogin;
window.disableBiometricLogin = disableBiometricLogin;
window.changePassword = changePassword;
window.adminResetPassword = adminResetPassword;