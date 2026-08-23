-- ═══════════════════════════════════════════════════════════════════
-- 003_hash_passwords.sql
-- ═══════════════════════════════════════════════════════════════════
-- Ecole La Fontaine v2 — Phase 3 of the auth hardening roadmap
-- (see TODO.md). Moves from plaintext to real bcrypt password hashing.
--
-- DESIGN: a database trigger, not an app-code change
--
-- Every place the app sets a password — user-management.js creating a
-- teacher, an admin resetting someone's password, changePassword()'s
-- self-service flow — all go through the same two calls:
--   insert('teachers', { ..., password: plaintext })
--   update('teachers', id, { password: plaintext })
-- via PostgREST. Rather than changing every one of those call sites
-- to hash before sending, a BEFORE INSERT/UPDATE trigger on `teachers`
-- hashes the incoming value transparently, server-side, no matter who
-- or what sends it. login_check() (docs/sql/001) is updated to compare
-- against the hash instead of a plain string. Net result: ZERO
-- js/core/auth.js changes needed for this phase — verified by
-- checking every real password-writing code path first.
--
-- Run this after 001 and 002, on the same live database. Idempotent.
-- ═══════════════════════════════════════════════════════════════════


-- ───────────────────────────────────────────────────────────────────
-- PART 1 — Enable pgcrypto (bcrypt lives here, ships with Supabase)
-- ───────────────────────────────────────────────────────────────────

CREATE EXTENSION IF NOT EXISTS pgcrypto;


-- ───────────────────────────────────────────────────────────────────
-- PART 2 — Auto-hash trigger for teachers.password
-- ───────────────────────────────────────────────────────────────────
-- Only hashes if the incoming value doesn't already look like a
-- bcrypt hash (starts with $2a$/$2b$/$2y$) — this makes the trigger
-- safe to leave in place forever: it hashes a genuine new plaintext
-- password on the way in, but won't try to re-hash a value that's
-- already hashed (e.g. if a row is ever updated for an unrelated
-- column and password comes along unchanged in the same payload).

CREATE OR REPLACE FUNCTION hash_teacher_password()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.password IS NOT NULL
       AND NEW.password !~ '^\$2[aby]\$'
    THEN
        NEW.password := crypt(NEW.password, gen_salt('bf'));
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_hash_teacher_password ON teachers;
CREATE TRIGGER trg_hash_teacher_password
    BEFORE INSERT OR UPDATE OF password ON teachers
    FOR EACH ROW
    EXECUTE FUNCTION hash_teacher_password();


-- ───────────────────────────────────────────────────────────────────
-- PART 3 — Same for school_settings' admin_password row
-- ───────────────────────────────────────────────────────────────────
-- school_settings is key-value (id, key, value, updated_at) — the
-- trigger only acts when the row being written has key = 'admin_password'.

CREATE OR REPLACE FUNCTION hash_admin_password()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.key = 'admin_password'
       AND NEW.value IS NOT NULL
       AND NEW.value !~ '^\$2[aby]\$'
    THEN
        NEW.value := crypt(NEW.value, gen_salt('bf'));
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_hash_admin_password ON school_settings;
CREATE TRIGGER trg_hash_admin_password
    BEFORE INSERT OR UPDATE OF value ON school_settings
    FOR EACH ROW
    EXECUTE FUNCTION hash_admin_password();


-- ───────────────────────────────────────────────────────────────────
-- PART 4 — One-time migration: hash every existing plaintext row
-- ───────────────────────────────────────────────────────────────────
-- Safe to re-run — the WHERE clause skips anything already hashed.
-- NOTE: run this in the same session as Parts 1-3 above, not before
-- them — pgcrypto's crypt()/gen_salt() need the extension enabled first.

UPDATE teachers
SET password = crypt(password, gen_salt('bf'))
WHERE password IS NOT NULL
  AND password !~ '^\$2[aby]\$';

UPDATE school_settings
SET value = crypt(value, gen_salt('bf'))
WHERE key = 'admin_password'
  AND value IS NOT NULL
  AND value !~ '^\$2[aby]\$';


-- ───────────────────────────────────────────────────────────────────
-- PART 5 — Update login_check() to compare against the hash
-- ───────────────────────────────────────────────────────────────────
-- crypt(candidate, stored_hash) re-hashes the candidate using the
-- salt embedded in stored_hash, then compares — the standard bcrypt
-- verification pattern. Everything else about this function (its
-- signature, what it returns, the admin-vs-teacher branching) is
-- unchanged from 001 — only the comparison itself changes.

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
BEGIN
    IF p_role = 'admin' THEN
        RETURN QUERY
        SELECT
            t.id::INTEGER, t.username::TEXT, t.first_name::TEXT, t.last_name::TEXT,
            t.role::TEXT, t.phone::TEXT, t.email::TEXT, t.is_active::BOOLEAN
        FROM teachers t
        CROSS JOIN (
            SELECT value FROM school_settings WHERE key = 'admin_password'
        ) s
        WHERE t.role = 'admin'
          AND (t.username = p_username OR p_username = 'admin')
          AND crypt(p_password, s.value) = s.value
        LIMIT 1;
    ELSE
        RETURN QUERY
        SELECT
            t.id::INTEGER, t.username::TEXT, t.first_name::TEXT, t.last_name::TEXT,
            t.role::TEXT, t.phone::TEXT, t.email::TEXT, t.is_active::BOOLEAN
        FROM teachers t
        WHERE t.username = p_username
          AND t.role = p_role
          AND crypt(p_password, t.password) = t.password
          AND t.is_active = TRUE
        LIMIT 1;
    END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION login_check(TEXT, TEXT, TEXT) TO anon;


-- ───────────────────────────────────────────────────────────────────
-- VERIFICATION
-- ───────────────────────────────────────────────────────────────────
-- Run this after everything above. Every password/value should now
-- start with $2 — if any row doesn't, Part 4's migration missed it
-- (likely a NULL password, which is fine and expected to be skipped).

SELECT id, username, LEFT(password, 4) AS password_prefix FROM teachers WHERE password IS NOT NULL;
SELECT key, LEFT(value, 4) AS value_prefix FROM school_settings WHERE key = 'admin_password';

-- Then: actually log in as each role (admin, teacher, accountant) to
-- confirm real login still works before considering this phase done.
