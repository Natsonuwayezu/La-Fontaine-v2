/* ═══════════════════════════════════════════════════════════════════
   tests/auth-tests.js
   ═══════════════════════════════════════════════════════════════════
   Tests for js/core/auth.js's login-lockout mechanism — the one part
   of auth.js testable without a real Supabase connection (doLogin,
   logout, and session management all require a live DB and are not
   covered here).

   This suite exists specifically because it caught a real bug while
   being written: _recordFailedAttempt() checked
   `status.count >= APP_CONFIG.maxFailedLogins`, but APP_CONFIG has no
   maxFailedLogins field (the real name is maxLoginAttempts) — so the
   lockout would never trigger, no matter how many times a login
   failed. See the fix in this same commit.
   ═══════════════════════════════════════════════════════════════════ */

const { loadScripts } = require('./helpers/load-scripts');

// auth.js's lockout counter lives under this fixed localStorage key —
// see the LOCKOUT_KEY const near the top of js/core/auth.js. It isn't
// exposed on window (private, by design), so the literal is used here.
const LOCKOUT_KEY = 'lf_login_attempts';

beforeAll(() => {
    loadScripts([
        'js/config/constants.js',
        'js/core/utils.js',
        'js/core/state.js',
        'js/core/auth.js',
    ]);
});

beforeEach(() => {
    localStorage.clear();
});

describe('checkLoginLockout', () => {
    test('reports not-locked when there is no attempt history', () => {
        expect(checkLoginLockout()).toEqual({ locked: false, minutesLeft: 0 });
    });

    test('reports not-locked below the max-attempts threshold', () => {
        localStorage.setItem(LOCKOUT_KEY, JSON.stringify({ count: 3, lockedUntil: null }));
        expect(checkLoginLockout().locked).toBe(false);
    });

    test('reports locked when lockedUntil is in the future (regression: maxFailedLogins typo)', () => {
        const future = new Date(Date.now() + 10 * 60 * 1000).toISOString();
        localStorage.setItem(LOCKOUT_KEY, JSON.stringify({ count: 5, lockedUntil: future }));
        const result = checkLoginLockout();
        expect(result.locked).toBe(true);
        expect(result.minutesLeft).toBeGreaterThan(0);
    });

    test('clears an expired lockout and reports not-locked', () => {
        const past = new Date(Date.now() - 1000).toISOString();
        localStorage.setItem(LOCKOUT_KEY, JSON.stringify({ count: 5, lockedUntil: past }));
        expect(checkLoginLockout()).toEqual({ locked: false, minutesLeft: 0 });
        expect(localStorage.getItem(LOCKOUT_KEY)).toBeNull();
    });

    test('APP_CONFIG.maxLoginAttempts is defined (regression guard for the typo fix)', () => {
        expect(APP_CONFIG.maxLoginAttempts).toBeGreaterThan(0);
        expect(APP_CONFIG.maxFailedLogins).toBeUndefined();
    });
});
