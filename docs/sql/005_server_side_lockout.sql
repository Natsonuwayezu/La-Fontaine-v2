-- ═══════════════════════════════════════════════════════════════════
-- 005_server_side_lockout.sql
-- ═══════════════════════════════════════════════════════════════════
-- Ecole La Fontaine v2 — Phase 4 of the auth hardening roadmap
-- (see TODO.md). Real, server-enforced login lockout.
--
-- WHY THIS IS NEEDED
--
-- js/core/auth.js already has a lockout (checkLoginLockout(),
-- _recordFailedAttempt()) — 5 attempts, 15-minute lockout, matched
-- exactly by the numbers below. But it's tracked entirely in
-- localStorage. Clearing browser storage, an incognito window, or
-- calling the login_check() RPC directly (skipping the app's UI
-- entirely) all bypass it completely. This file adds the same rule
-- enforced by the database itself, which cannot be bypassed by
-- anything the client does.
--
-- This does NOT replace the client-side lockout — that one still
-- gives a fast, friendly "try again in N minutes" message without a
-- round trip. This is the backstop for when that's bypassed.
--
-- Run this after 001, 002, 003, and 004 (whichever 004 file applies -- if a "004_fix_unexplained_policies.sql" exists, run that too, it addresses a different, unrelated set of tables).
-- ═══════════════════════════════════════════════════════════════════


-- ───────────────────────────────────────────────────────────────────
-- PART 1 — login_attempts table
-- ───────────────────────────────────────────────────────────────────
-- Tracked by username+role (not IP — PostgREST/RPC calls don't
-- reliably expose the caller's real IP inside a plpgsql function
-- without extra request-header configuration, and username+role is
-- what actually matters here: it stops someone from brute-forcing a
-- SPECIFIC account regardless of which device/IP they're doing it from).

CREATE TABLE IF NOT EXISTS login_attempts (
    id           SERIAL PRIMARY KEY,
    username     TEXT NOT NULL,
    role         TEXT NOT NULL,
    success      BOOLEAN NOT NULL,
    attempted_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_login_attempts_lookup
    ON login_attempts (username, role, attempted_at);

ALTER TABLE login_attempts ENABLE ROW LEVEL SECURITY;

-- No anon policies at all, deliberately — this table is only ever
-- read/written from inside login_check() itself (SECURITY DEFINER,
-- bypasses RLS internally). The app has no legitimate reason to query
-- this table directly, and it shouldn't be able to clear its own
-- attempt history.


-- ───────────────────────────────────────────────────────────────────
-- PART 2 — login_check() enforces the lockout itself
-- ───────────────────────────────────────────────────────────────────
-- Same numbers as auth.js: 5 attempts, 15-minute window. If a
-- username+role combination has 5+ failed attempts in the last 15
-- minutes, this refuses to even check the password — a correct
-- password during a lockout is treated the same as a wrong one,
-- deliberately (this path only matters when someone is actively
-- trying to bypass the client-side check, so there's no friendly
-- "N minutes left" message here — that's the client-side lockout's
-- job in the normal case).
--
-- Every call — success or failure, admin or teacher/accountant —
-- gets logged, since this is the one funnel point every login goes
-- through regardless of client state.

CREATE OR REPLACE FUNCTION login_check(
    p_username TEXT,
    p_password TEXT,
    p_role TEXT
)
RETURNS TABLE (
    id INTEGER,
    username TEXT,
    first_name TEXT,
    last_name TEXT,
    role TEXT,
    phone TEXT,
    email TEXT,
    is_active BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    recent_failures INTEGER;
    matched_row RECORD;
    is_success BOOLEAN := FALSE;
BEGIN
    -- Lockout check
    SELECT COUNT(*) INTO recent_failures
    FROM login_attempts
    WHERE username = p_username
      AND role = p_role
      AND success = FALSE
      AND attempted_at > NOW() - INTERVAL '15 minutes';

    IF recent_failures >= 5 THEN
        INSERT INTO login_attempts (username, role, success) VALUES (p_username, p_role, FALSE);
        RETURN;
    END IF;

    -- Actual credential check (same logic as 003, hashed comparison)
    IF p_role = 'admin' THEN
        SELECT t.id, t.username, t.first_name, t.last_name, t.role,
               t.phone, t.email, t.is_active
        INTO matched_row
        FROM teachers t
        CROSS JOIN (
            SELECT value FROM school_settings WHERE key = 'admin_password'
        ) s
        WHERE t.role = 'admin'
          AND (t.username = p_username OR p_username = 'admin')
          AND crypt(p_password, s.value) = s.value
        LIMIT 1;
    ELSE
        SELECT t.id, t.username, t.first_name, t.last_name, t.role,
               t.phone, t.email, t.is_active
        INTO matched_row
        FROM teachers t
        WHERE t.username = p_username
          AND t.role = p_role
          AND crypt(p_password, t.password) = t.password
          AND t.is_active = TRUE
        LIMIT 1;
    END IF;

    is_success := (matched_row.id IS NOT NULL);
    INSERT INTO login_attempts (username, role, success) VALUES (p_username, p_role, is_success);

    IF is_success THEN
        RETURN QUERY SELECT matched_row.id, matched_row.username, matched_row.first_name,
                            matched_row.last_name, matched_row.role, matched_row.phone,
                            matched_row.email, matched_row.is_active;
    END IF;
    -- else: falls through, returns zero rows (same as before)
END;
$$;

GRANT EXECUTE ON FUNCTION login_check(TEXT, TEXT, TEXT) TO anon;


-- ───────────────────────────────────────────────────────────────────
-- PART 3 — Housekeeping: old attempt rows don't need to live forever
-- ───────────────────────────────────────────────────────────────────
-- Not scheduled automatically (Supabase's free/standard tiers don't
-- give you pg_cron by default) — run this by hand occasionally, or
-- ask about setting up pg_cron if you want it automatic later.

-- DELETE FROM login_attempts WHERE attempted_at < NOW() - INTERVAL '30 days';


-- ───────────────────────────────────────────────────────────────────
-- VERIFICATION
-- ───────────────────────────────────────────────────────────────────
-- 1. Log in correctly once as any role — confirm it still works.
-- 2. Deliberately fail a login 5 times in a row for a test account.
-- 3. On the 6th attempt, even with the CORRECT password, login should
--    fail (this is the server-side lockout kicking in, independent of
--    whatever the browser's localStorage says).
-- 4. Check the table directly to see it recording attempts:
SELECT username, role, success, attempted_at
FROM login_attempts
ORDER BY attempted_at DESC
LIMIT 20;
