'use strict';
/* ═══════════════════════════════════════════════════════════════
   auth.js — Simple login exactly like old single-file version.
   Plain password comparison. No bcrypt. No lockout table.
   ═══════════════════════════════════════════════════════════════ */

const SESSION_KEY = 'elf_session';
const SESSION_TTL = 8 * 60 * 60 * 1000; // 8 hours

// ── Session ───────────────────────────────────────────────────
function saveSession(user) {
    localStorage.setItem(SESSION_KEY, JSON.stringify({
        ...user,
        _expires: Date.now() + SESSION_TTL,
    }));
}

function loadSession() {
    try {
        const raw = localStorage.getItem(SESSION_KEY);
        if (!raw) return null;
        const data = JSON.parse(raw);
        if (Date.now() > data._expires) { clearSession(); return null; }
        return data;
    } catch { return null; }
}

function clearSession() {
    localStorage.removeItem(SESSION_KEY);
}

// ── Login ─────────────────────────────────────────────────────
async function doLogin() {
    const role    = document.getElementById('login-role')?.value;
    const usernameEl = document.getElementById('login-username');
    const username   = usernameEl?.value?.trim() || '';
    const password   = document.getElementById('login-password')?.value || '';
    const alertEl    = document.getElementById('login-alert');
    const btn        = document.getElementById('login-btn');

    // Clear alert
    if (alertEl) { alertEl.textContent = ''; alertEl.style.display = 'none'; }

    // Validate
    if (!password) {
        showLoginError('Please enter your password.');
        return;
    }
    if (role !== 'admin' && !username) {
        showLoginError('Please enter your username.');
        return;
    }

    // Loading state
    if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner-sm"></span> Signing in...'; }

    try {
        let user = null;

        if (role === 'admin') {
            // Compare against school_settings.admin_password (plaintext)
            const rows = await getAll('school_settings');
            const settings = {};
            (rows || []).forEach(r => { settings[r.key] = r.value; });
            const adminPw = settings['admin_password'] || settings['admin_pass'] || '';

            if (!adminPw) {
                showLoginError('Admin password not configured. Run setup SQL first.');
                return;
            }
            if (password !== adminPw) {
                showLoginError('Invalid password.');
                return;
            }
            // Get admin teacher record
            const allTeachers = await getAll('teachers');
            const adminTeacher = (allTeachers || []).find(t => t.role === 'admin');
            user = {
                id        : adminTeacher?.id || 0,
                role      : 'admin',
                name      : adminTeacher
                    ? `${adminTeacher.first_name || ''} ${adminTeacher.last_name || ''}`.trim() || 'Administrator'
                    : 'Administrator',
                username  : 'admin',
                email     : adminTeacher?.email || '',
                class_id  : null,
            };

        } else {
            // Teacher or Accountant — compare plaintext password
            const allTeachers = await getAll('teachers');
            const found = (allTeachers || []).find(t =>
                (t.username || '').toLowerCase() === username.toLowerCase() &&
                t.role === role &&
                t.is_active !== false
            );

            if (!found) {
                showLoginError('Username not found or account inactive.');
                return;
            }
            if (found.password !== password) {
                showLoginError('Invalid password.');
                return;
            }
            user = {
                id       : found.id,
                role     : found.role,
                name     : `${found.first_name || ''} ${found.last_name || ''}`.trim() || found.username,
                username : found.username,
                email    : found.email    || '',
                phone    : found.phone    || '',
                class_id : found.class_id || null,
            };
        }

        // Login success
        state.currentUser = user;
        saveSession(user);

        // Log activity (non-blocking)
        if (typeof logActivity === 'function')
            logActivity(user.id, user.role, 'User logged in').catch(() => {});

        // Hand off to boot sequence
        await bootApp(user);

    } catch (err) {
        console.error('[Auth] doLogin error:', err.message);
        showLoginError('Login error: ' + err.message);
    } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = 'Sign In →'; }
    }
}

function showLoginError(msg) {
    const el = document.getElementById('login-alert');
    if (el) { el.textContent = msg; el.style.display = 'block'; }
}

// ── Logout ────────────────────────────────────────────────────
function doLogout() {
    clearSession();
    state.currentUser = null;
    // Clear state arrays
    if (typeof resetState === 'function') resetState();
    else {
        const s = window.state || {};
        for (const k of Object.keys(s)) {
            if (Array.isArray(s[k])) s[k] = [];
        }
    }
    showLoginPage();
}

// ── Show login page ───────────────────────────────────────────
function showLoginPage() {
    const lp  = document.getElementById('login-page');
    const app = document.getElementById('app-shell');
    const bl  = document.getElementById('boot-loader');
    if (lp)  lp.style.display  = 'flex';
    if (app) app.style.display  = 'none';
    if (bl)  bl.style.display   = 'none';

    // Reset form
    const role = document.getElementById('login-role');
    const pwd  = document.getElementById('login-password');
    const usr  = document.getElementById('login-username');
    const alt  = document.getElementById('login-alert');
    if (role) { role.value = 'admin'; onRoleChange(); }
    if (pwd)  pwd.value = '';
    if (usr)  usr.value = '';
    if (alt)  { alt.textContent = ''; alt.style.display = 'none'; }
}

// ── Open card ─────────────────────────────────────────────────
function openLoginCard() {
    const wrap = document.getElementById('card-wrap');
    if (wrap) {
        wrap.classList.add('open');
        // Particles
        const bg = document.getElementById('particles-bg');
        if (bg && !bg.children.length) {
            for (let k = 0; k < 18; k++) {
                const p = document.createElement('div');
                p.className = 'particle';
                const size = 20 + Math.random() * 80;
                p.style.cssText = [
                    `width:${size}px`,
                    `height:${size}px`,
                    `left:${Math.random()*100}%`,
                    `top:${Math.random()*100}%`,
                    `animation-duration:${10+Math.random()*20}s`,
                    `animation-delay:${-Math.random()*20}s`,
                ].join(';');
                bg.appendChild(p);
            }
        }
        // Focus password if admin selected
        setTimeout(() => {
            const role = document.getElementById('login-role')?.value;
            if (role === 'admin') {
                document.getElementById('login-password')?.focus();
            } else {
                document.getElementById('login-username')?.focus();
            }
        }, 900);
    }
}

// ── Role change ───────────────────────────────────────────────
function onRoleChange() {
    const role = document.getElementById('login-role')?.value;
    const uf   = document.getElementById('username-field');
    if (uf) uf.style.display = (role === 'admin') ? 'none' : 'block';
}

function toggleLoginPw() {
    const el = document.getElementById('login-password');
    if (el) el.type = el.type === 'password' ? 'text' : 'password';
}

// ── Expose ────────────────────────────────────────────────────
window.doLogin       = doLogin;
window.doLogout      = doLogout;
window.showLoginPage = showLoginPage;
window.openLoginCard = openLoginCard;
window.onRoleChange  = onRoleChange;
window.toggleLoginPw = toggleLoginPw;
window.loadSession   = loadSession;
window.saveSession   = saveSession;
window.clearSession  = clearSession;
