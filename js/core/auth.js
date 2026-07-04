/**
 * ECOLE LA FONTAINE — Authentication & Session Management
 * Login, logout, session handling, biometric auth
 * Last updated: 2026-07-04
 * 
 * CHANGES:
 * - Added window exports for inline onclick handlers
 * - Fixed toggleLoginPw and doLogin not being global
 * - Added onRoleChange handler
 * - Added login form helpers
 */

import { state, updateState } from './state.js';
import { logActivity, getSchoolSettings, updateSchoolSetting, get, getById } from './api.js';
import { APP_CONFIG, STORAGE_KEYS } from '../config/constants.js';
import { bootApp } from './boot.js';

// ──────────────────────────────────────────────────────────────────────
// SESSION MANAGEMENT
// ──────────────────────────────────────────────────────────────────────

/**
 * Check if a valid session exists
 * @returns {object|null} User object or null
 */
export function checkAuth() {
    const stored = localStorage.getItem(STORAGE_KEYS.USER);
    const expiry = localStorage.getItem(STORAGE_KEYS.EXPIRY);
    if (!stored || !expiry) return null;
    if (Date.now() > parseInt(expiry)) {
        clearSession();
        return null;
    }
    try {
        return JSON.parse(stored);
    } catch (e) {
        clearSession();
        return null;
    }
}

/**
 * Save a user session
 * @param {object} user - User object
 */
export function saveSession(user) {
    localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(user));
    localStorage.setItem(STORAGE_KEYS.EXPIRY, String(Date.now() + APP_CONFIG.sessionDuration));
}

/**
 * Clear the current session
 */
export function clearSession() {
    localStorage.removeItem(STORAGE_KEYS.USER);
    localStorage.removeItem(STORAGE_KEYS.EXPIRY);
}

/**
 * Reset session expiry (on user activity)
 */
export function resetSessionExpiry() {
    if (checkAuth()) {
        localStorage.setItem(STORAGE_KEYS.EXPIRY, String(Date.now() + APP_CONFIG.sessionDuration));
    }
}

// ──────────────────────────────────────────────────────────────────────
// LOGIN
// ──────────────────────────────────────────────────────────────────────

/**
 * Login a user
 * @param {string} role - 'admin' | 'teacher' | 'accountant'
 * @param {string} username - Username (not required for admin)
 * @param {string} password - Password
 * @returns {Promise<{success, user?, error?}>}
 */
export async function login(role, username, password) {
    // ── Admin login ──
    if (role === 'admin') {
        const settings = await getSchoolSettings();
        const adminPw = settings.admin_password || 'admin123';
        if (password !== adminPw) {
            return { success: false, error: 'Invalid password' };
        }
        const headTeacher = settings.head_teacher || 'UWAYO GANZA Eugene';
        const user = {
            id: 0,
            role: 'admin',
            name: headTeacher,
            username: 'admin',
        };
        await logActivity(0, 'admin', 'User logged in');
        return { success: true, user };
    }

    // ── Teacher / Accountant login ──
    const rows = await get('teachers', { username });
    const found = rows.find(r => r.username === username && r.password === password);
    if (!found) {
        return { success: false, error: 'Invalid username or password' };
    }
    if (found.status === 'inactive' || found.is_active === false) {
        return { success: false, error: 'Account is inactive' };
    }
    if (found.role !== role) {
        return { success: false, error: `Invalid role. You are registered as ${found.role}.` };
    }

    await update('teachers', found.id, { last_login: new Date().toISOString() });
    const user = {
        id: found.id,
        role: found.role,
        name: `${found.first_name || ''} ${found.last_name || ''}`.trim() || found.username,
        username: found.username,
        email: found.email,
    };
    await logActivity(found.id, found.role, 'User logged in');
    return { success: true, user };
}

// ──────────────────────────────────────────────────────────────────────
// LOGOUT
// ──────────────────────────────────────────────────────────────────────

/**
 * Log out the current user
 */
export async function logout() {
    const user = state.currentUser;
    if (user) {
        await logActivity(user.id, user.role, 'User logged out').catch(() => { });
    }

    clearSession();

    // Clear cached state
    if (typeof clearStateCache === 'function') {
        await clearStateCache().catch(() => { });
    }

    // Reset in-memory state
    const cacheableKeys = [
        'classes', 'subjects', 'terms', 'academicYears',
        'students', 'teachers', 'assessments', 'marks',
        'feeCategories', 'feeAmounts', 'studentFees', 'payments',
        'families', 'activityLogs', 'gradingScale',
    ];
    for (const key of cacheableKeys) {
        if (Array.isArray(state[key])) state[key] = [];
        else if (key === 'schoolSettings') state[key] = {};
        else state[key] = null;
    }
    state.currentUser = null;
    state.currentTerm = null;
    state.currentAcadYear = null;

    // Clear notification timer if any
    if (window._sessionTimer) {
        clearInterval(window._sessionTimer);
        window._sessionTimer = null;
    }

    // Hide app, show login
    const appPage = document.getElementById('app-page');
    const loginPage = document.getElementById('login-page');
    if (appPage) appPage.style.display = 'none';
    if (loginPage) {
        loginPage.style.display = 'flex';
        const cardWrap = document.getElementById('card-wrap');
        if (cardWrap) cardWrap.classList.remove('open');
        const passwordInput = document.getElementById('login-password');
        if (passwordInput) passwordInput.value = '';
    }

    showToast('Logged out successfully', 'info');
}

// ──────────────────────────────────────────────────────────────────────
// CHANGE PASSWORD
// ──────────────────────────────────────────────────────────────────────

/**
 * Change the current user's password
 * @param {string} currentPw - Current password
 * @param {string} newPw - New password
 * @returns {Promise<{ok, error?}>}
 */
export async function changePassword(currentPw, newPw) {
    const user = state.currentUser;
    if (!user) return { ok: false, error: 'Not authenticated' };

    if (user.role === 'admin') {
        const settings = await getSchoolSettings();
        if (settings.admin_password !== currentPw) {
            return { ok: false, error: 'Current password is incorrect' };
        }
        await updateSchoolSetting('admin_password', newPw);
    } else {
        const teacher = await getById('teachers', user.id);
        if (!teacher || teacher.password !== currentPw) {
            return { ok: false, error: 'Current password is incorrect' };
        }
        await update('teachers', user.id, { password: newPw });
    }
    await logActivity(user.id, user.role, 'Changed password');
    return { ok: true };
}

// ──────────────────────────────────────────────────────────────────────
// BIOMETRIC AUTH (WebAuthn)
// ──────────────────────────────────────────────────────────────────────

/**
 * Set up biometric login (WebAuthn)
 * @returns {Promise<boolean>}
 */
export async function setupBiometricLogin() {
    if (!window.PublicKeyCredential) {
        showToast('Biometric login is not supported in this browser', 'warning');
        return false;
    }

    const available = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable().catch(() => false);
    if (!available) {
        showToast('No biometric hardware found on this device', 'warning');
        return false;
    }

    // Check if already registered
    if (localStorage.getItem(STORAGE_KEYS.BIOMETRIC_CRED)) {
        const remove = confirm('Biometric login is already set up. Remove it?');
        if (remove) {
            localStorage.removeItem(STORAGE_KEYS.BIOMETRIC_CRED);
            localStorage.removeItem(STORAGE_KEYS.BIOMETRIC_USER);
            showToast('Biometric login removed', 'info');
            return true;
        }
        return false;
    }

    const username = document.getElementById('login-username')?.value?.trim() || state.currentUser?.username || '';
    if (!username) {
        showToast('Enter your username first, then set up biometrics', 'warning');
        return false;
    }

    try {
        const enc = new TextEncoder();
        const credential = await navigator.credentials.create({
            publicKey: {
                challenge: crypto.getRandomValues(new Uint8Array(32)),
                rp: {
                    name: state.schoolSettings?.school_name || 'Ecole La Fontaine',
                    id: location.hostname || 'localhost',
                },
                user: {
                    id: enc.encode(username + '_elf'),
                    name: username,
                    displayName: username,
                },
                pubKeyCredParams: [
                    { alg: -7, type: 'public-key' },
                    { alg: -257, type: 'public-key' },
                ],
                authenticatorSelection: {
                    userVerification: 'required',
                    residentKey: 'preferred',
                },
                timeout: 60000,
            }
        });

        const credId = btoa(String.fromCharCode(...new Uint8Array(credential.rawId)));
        localStorage.setItem(STORAGE_KEYS.BIOMETRIC_CRED, credId);
        localStorage.setItem(STORAGE_KEYS.BIOMETRIC_USER, JSON.stringify({
            username,
            password: document.getElementById('login-password')?.value || '',
        }));

        const wrap = document.getElementById('biometric-btn-wrap');
        if (wrap) wrap.style.display = 'block';
        showToast('✅ Biometric login set up! Use fingerprint/face next time.', 'success');
        return true;
    } catch (err) {
        if (err.name !== 'NotAllowedError') {
            showToast('Biometric setup failed: ' + err.message, 'error');
        }
        return false;
    }
}

/**
 * Authenticate with biometrics
 * @returns {Promise<object|null>} User object or null
 */
export async function doBiometricLogin() {
    const stored = localStorage.getItem(STORAGE_KEYS.BIOMETRIC_CRED);
    if (!stored) {
        showToast('No biometric credentials stored. Please set up first.', 'warning');
        return null;
    }

    try {
        const challenge = crypto.getRandomValues(new Uint8Array(32));
        await navigator.credentials.get({
            publicKey: {
                challenge,
                allowCredentials: [{
                    type: 'public-key',
                    id: Uint8Array.from(atob(stored.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0)),
                }],
                userVerification: 'required',
                timeout: 60000,
            }
        });

        const userData = JSON.parse(localStorage.getItem(STORAGE_KEYS.BIOMETRIC_USER) || '{}');
        const user = {
            id: userData.userId || 0,
            role: userData.role || 'admin',
            name: userData.name || 'Administrator',
            username: userData.username || 'admin',
        };
        return user;
    } catch (e) {
        showToast('Biometric login failed: ' + e.message, 'error');
        return null;
    }
}

// ──────────────────────────────────────────────────────────────────────
// ─── LOGIN PAGE UI HELPERS — EXPOSED TO WINDOW ─────────────────────
// ──────────────────────────────────────────────────────────────────────

/**
 * Toggle password field visibility
 * Called from login page 👁️ button
 */
window.toggleLoginPw = function () {
    const field = document.getElementById('login-password');
    if (!field) return;
    field.type = field.type === 'password' ? 'text' : 'password';
    // Update button text/icon if needed
    const btn = document.querySelector('.pw-toggle');
    if (btn) {
        btn.textContent = field.type === 'password' ? '👁️' : '🙈';
    }
};

/**
 * Handle role selection change
 * Shows/hides username field for admin
 */
window.onRoleChange = function () {
    const role = document.getElementById('login-role')?.value;
    const usernameField = document.getElementById('username-field');
    if (!usernameField) return;
    usernameField.style.display = role === 'admin' ? 'none' : 'block';
    // Clear username when admin is selected
    if (role === 'admin') {
        document.getElementById('login-username').value = '';
    }
};

/**
 * Open the login card (flip animation)
 */
window.openLoginCard = function () {
    const wrap = document.getElementById('card-wrap');
    if (wrap) {
        wrap.classList.add('open');
        setTimeout(() => {
            const pw = document.getElementById('login-password');
            if (pw) pw.focus();
        }, 700);
    }
};

/**
 * Handle login form submission
 * Called from login page "Sign In" button and Enter key
 */
window.doLogin = async function () {
    const role = document.getElementById('login-role')?.value || 'admin';
    const username = document.getElementById('login-username')?.value?.trim();
    const password = document.getElementById('login-password')?.value?.trim();
    const alertEl = document.getElementById('login-alert');
    const btn = document.getElementById('login-btn');

    // Reset alert
    if (alertEl) {
        alertEl.style.display = 'none';
        alertEl.textContent = '';
    }

    // Validate
    if (!password) {
        if (alertEl) {
            alertEl.textContent = 'Please enter a password';
            alertEl.style.display = 'block';
        }
        return;
    }
    if (role !== 'admin' && !username) {
        if (alertEl) {
            alertEl.textContent = 'Please enter your username';
            alertEl.style.display = 'block';
        }
        return;
    }

    // Show loading state
    if (btn) {
        btn.innerHTML = '<span class="loader-inline"></span> Signing in...';
        btn.disabled = true;
    }

    try {
        const result = await login(role, username, password);
        if (!result.success) {
            if (alertEl) {
                alertEl.textContent = result.error || 'Login failed';
                alertEl.style.display = 'block';
            }
            // Clear password on failure
            document.getElementById('login-password').value = '';
            return;
        }
        state.currentUser = result.user;
        saveSession(result.user);
        await bootApp(result.user);
    } catch (err) {
        if (alertEl) {
            alertEl.textContent = 'Login error: ' + err.message;
            alertEl.style.display = 'block';
        }
        document.getElementById('login-password').value = '';
    } finally {
        if (btn) {
            btn.innerHTML = 'Sign In →';
            btn.disabled = false;
        }
    }
};

/**
 * Handle biometric login button click
 */
window.doBiometricLogin = async function () {
    const user = await doBiometricLogin();
    if (user) {
        state.currentUser = user;
        saveSession(user);
        await bootApp(user);
    }
};

/**
 * Setup biometric login from the login page or user dropdown
 */
window.setupBiometricLogin = async function () {
    await setupBiometricLogin();
};

// ──────────────────────────────────────────────────────────────────────
// ─── INITIALIZE BIOMETRIC SUPPORT ON LOGIN PAGE ─────────────────────
// ──────────────────────────────────────────────────────────────────────

/**
 * Check if biometric login is available and show the button
 */
export async function initBiometricSupport() {
    if (!window.PublicKeyCredential) return;
    const available = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable().catch(() => false);
    if (!available) return;

    const wrap = document.getElementById('biometric-btn-wrap');
    if (!wrap) return;

    // Check if user has stored credentials
    const hasCred = !!localStorage.getItem(STORAGE_KEYS.BIOMETRIC_CRED);
    if (hasCred) {
        wrap.style.display = 'block';
    }
}

// ──────────────────────────────────────────────────────────────────────
// ─── EXPOSE LOGOUT TO WINDOW ─────────────────────────────────────────
// ──────────────────────────────────────────────────────────────────────

window.logout = logout;