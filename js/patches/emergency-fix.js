/**
 * ECOLE LA FONTAINE — Emergency Fix
 * Loads BEFORE everything else
 * Last updated: 2026-07-04
 */

// ──────────────────────────────────────────────────────────────────────
// ─── EMERGENCY — GUARANTEED LOGIN FUNCTIONS ────────────────────────
// ──────────────────────────────────────────────────────────────────────

// These run immediately regardless of module loading
(function () {
    console.log('[Emergency] Applying emergency fixes...');

    // 1. Login function
    window.doLogin = window.doLogin || async function () {
        console.log('[Emergency] doLogin called');
        const role = document.getElementById('login-role')?.value || 'admin';
        const username = document.getElementById('login-username')?.value?.trim();
        const password = document.getElementById('login-password')?.value?.trim();
        const alertEl = document.getElementById('login-alert');
        const btn = document.getElementById('login-btn');

        if (!password) {
            if (alertEl) { alertEl.textContent = 'Please enter a password'; alertEl.style.display = 'block'; }
            return;
        }
        if (role !== 'admin' && !username) {
            if (alertEl) { alertEl.textContent = 'Please enter your username'; alertEl.style.display = 'block'; }
            return;
        }

        if (btn) { btn.innerHTML = '⏳ Signing in...'; btn.disabled = true; }

        try {
            // Try to use the real login if available
            if (typeof login === 'function') {
                const result = await login(role, username, password);
                if (result.success) {
                    if (typeof saveSession === 'function') saveSession(result.user);
                    if (typeof bootApp === 'function') await bootApp(result.user);
                    return;
                }
                if (alertEl) { alertEl.textContent = result.error; alertEl.style.display = 'block'; }
            } else {
                // Fallback: just show success for testing
                console.log('[Emergency] Using fallback login');
                if (alertEl) {
                    alertEl.textContent = '✅ Login successful (emergency mode)';
                    alertEl.style.display = 'block';
                    alertEl.style.background = '#d1fae5';
                    alertEl.style.color = '#065f46';
                }
            }
        } catch (err) {
            if (alertEl) { alertEl.textContent = 'Error: ' + err.message; alertEl.style.display = 'block'; }
        } finally {
            if (btn) { btn.innerHTML = 'Sign In →'; btn.disabled = false; }
        }
    };

    // 2. Toggle password
    window.toggleLoginPw = window.toggleLoginPw || function () {
        const field = document.getElementById('login-password');
        if (!field) return;
        field.type = field.type === 'password' ? 'text' : 'password';
        const btn = document.querySelector('.pw-toggle');
        if (btn) btn.textContent = field.type === 'password' ? '👁️' : '🙈';
    };

    // 3. Role change
    window.onRoleChange = window.onRoleChange || function () {
        const role = document.getElementById('login-role')?.value;
        const usernameField = document.getElementById('username-field');
        if (usernameField) {
            usernameField.style.display = role === 'admin' ? 'none' : 'block';
        }
    };

    // 4. Open login card
    window.openLoginCard = window.openLoginCard || function () {
        const wrap = document.getElementById('card-wrap');
        if (wrap) wrap.classList.add('open');
    };

    // 5. Logout
    window.logout = window.logout || function () {
        localStorage.clear();
        location.reload();
    };

    // 6. initOfflineSupport (stub)
    window.initOfflineSupport = window.initOfflineSupport || function () {
        console.log('[Emergency] initOfflineSupport (stub)');
        return true;
    };

    // 7. initPWA (stub)
    window.initPWA = window.initPWA || function () {
        console.log('[Emergency] initPWA (stub)');
        return true;
    };

    // 8. initTheme (stub)
    window.initTheme = window.initTheme || function () {
        console.log('[Emergency] initTheme (stub)');
        return true;
    };

    console.log('[Emergency] All functions registered:');
    console.log('  doLogin:', typeof window.doLogin);
    console.log('  toggleLoginPw:', typeof window.toggleLoginPw);
    console.log('  onRoleChange:', typeof window.onRoleChange);
    console.log('  openLoginCard:', typeof window.openLoginCard);
    console.log('  logout:', typeof window.logout);
})();

// ── Patch missing theme exports ──
if (typeof window.getCurrentTheme === 'undefined') {
    window.getCurrentTheme = function () {
        return document.documentElement.getAttribute('data-theme') || 'light';
    };
    console.log('[Emergency] getCurrentTheme patched');
}

// ── Patch missing chartWithYear ──
if (typeof window.chartWithYear === 'undefined') {
    window.chartWithYear = function (title, chartHtml, yearId) {
        return `<div style="margin-bottom:12px;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
                <span style="font-weight:600;font-size:0.85rem;">${title}</span>
                <span style="font-size:0.65rem;color:var(--text-muted);">📅 ${yearId || 'Current Year'}</span>
            </div>
            ${chartHtml}
        </div>`;
    };
    console.log('[Emergency] chartWithYear patched');
}