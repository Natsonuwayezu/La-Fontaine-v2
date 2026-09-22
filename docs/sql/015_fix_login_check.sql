-- ═══════════════════════════════════════════════════════════════════
-- 015_fix_login_check.sql
-- RUN THIS FIRST — clears lockout then fixes password comparison
-- ═══════════════════════════════════════════════════════════════════

-- STEP 0: Clear ALL login lockouts immediately
-- (Supabase has no CORS issue — the lockout is from our own code)
DELETE FROM login_attempts WHERE success = FALSE;

-- Clear for specific accounts if you want to be precise:
-- DELETE FROM login_attempts WHERE username = 'admin' AND role = 'admin';
-- DELETE FROM login_attempts WHERE username = 'Boniface' AND role = 'teacher';
-- DELETE FROM login_attempts WHERE username = 'Laurence' AND role = 'accountant';

-- Step 1: Make sure pgcrypto is enabled
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Step 2: Hash any plaintext passwords still in teachers table
-- (safe to run even if already hashed — crypt() output starts with $2)
UPDATE teachers
SET password = crypt(password, gen_salt('bf'))
WHERE password IS NOT NULL
  AND password NOT LIKE '$2%';

-- Step 3: Hash admin_password in school_settings if it's plaintext
UPDATE school_settings
SET value = crypt(value, gen_salt('bf'))
WHERE key = 'admin_password'
  AND value IS NOT NULL
  AND value NOT LIKE '$2%';

-- Step 4: Replace login_check with a version that handles both cases
CREATE OR REPLACE FUNCTION login_check(
    p_username TEXT,
    p_password TEXT,
    p_role     TEXT
)
RETURNS TABLE (
    id         INTEGER,
    username   TEXT,
    first_name TEXT,
    last_name  TEXT,
    role       TEXT,
    phone      TEXT,
    email      TEXT,
    is_active  BOOLEAN,
    class_id   INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    recent_failures INTEGER;
    matched_row     RECORD;
    is_success      BOOLEAN := FALSE;
    stored_pw       TEXT;
BEGIN
    -- ── Lockout check (5 failures in 15 minutes) ──────────────────
    SELECT COUNT(*) INTO recent_failures
    FROM login_attempts
    WHERE login_attempts.username    = p_username
      AND login_attempts.role        = p_role
      AND login_attempts.success     = FALSE
      AND login_attempts.attempted_at > NOW() - INTERVAL '15 minutes';

    IF recent_failures >= 10 THEN
        INSERT INTO login_attempts (username, role, success)
        VALUES (p_username, p_role, FALSE);
        RETURN; -- empty result = locked out (10 failures in 15 min)
    END IF;

    -- ── Admin login ───────────────────────────────────────────────
    IF p_role = 'admin' THEN
        SELECT value INTO stored_pw
        FROM school_settings
        WHERE key = 'admin_password';

        IF stored_pw IS NOT NULL THEN
            -- Try bcrypt first, fall back to plaintext
            IF (stored_pw LIKE '$2%' AND crypt(p_password, stored_pw) = stored_pw)
            OR (stored_pw NOT LIKE '$2%' AND stored_pw = p_password) THEN
                SELECT t.id, t.username, t.first_name, t.last_name, t.role,
                       t.phone, t.email, t.is_active, t.class_id
                INTO matched_row
                FROM teachers t
                WHERE t.role = 'admin'
                LIMIT 1;
            END IF;
        END IF;

    -- ── Teacher / Accountant login ────────────────────────────────
    ELSE
        SELECT t.id, t.username, t.first_name, t.last_name, t.role,
               t.phone, t.email, t.is_active, t.class_id,
               t.password AS pw
        INTO matched_row
        FROM teachers t
        WHERE LOWER(t.username) = LOWER(p_username)
          AND t.role             = p_role
          AND t.is_active        = TRUE
        LIMIT 1;

        IF matched_row.id IS NOT NULL THEN
            stored_pw := matched_row.pw;
            -- Check bcrypt hash OR plaintext match
            IF (stored_pw LIKE '$2%' AND crypt(p_password, stored_pw) = stored_pw)
            OR (stored_pw NOT LIKE '$2%' AND stored_pw = p_password) THEN
                is_success := TRUE;
            ELSE
                matched_row := NULL; -- password wrong
            END IF;
        END IF;
    END IF;

    is_success := (matched_row.id IS NOT NULL);
    INSERT INTO login_attempts (username, role, success)
    VALUES (p_username, p_role, is_success);

    IF is_success THEN
        RETURN QUERY
            SELECT matched_row.id,
                   matched_row.username,
                   matched_row.first_name,
                   matched_row.last_name,
                   matched_row.role,
                   matched_row.phone,
                   matched_row.email,
                   matched_row.is_active,
                   matched_row.class_id;
    END IF;
    -- Zero rows returned = invalid credentials
END;
$$;

-- Step 5: Grant execute to anon (needed for login page)
GRANT EXECUTE ON FUNCTION login_check(TEXT, TEXT, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION login_check(TEXT, TEXT, TEXT) TO authenticated;

-- Step 6: Make sure school_settings is readable by anon
GRANT SELECT ON school_settings TO anon;
GRANT SELECT ON school_settings TO authenticated;

-- Step 7: Make sure teachers table is readable by authenticated users
GRANT SELECT ON teachers TO authenticated;
GRANT SELECT ON teachers TO anon;

-- Step 8: Grant get_server_time
GRANT EXECUTE ON FUNCTION get_server_time() TO anon;
GRANT EXECUTE ON FUNCTION get_server_time() TO authenticated;

-- ── VERIFY ────────────────────────────────────────────────────────
-- Test admin login (replace 'Lafontaine2026' with actual password):
-- SELECT * FROM login_check('admin', 'Lafontaine2026', 'admin');

-- Check passwords are hashed:
SELECT username, role, 
       CASE WHEN password LIKE '$2%' THEN '✅ hashed' ELSE '❌ PLAINTEXT' END AS pw_status
FROM teachers
ORDER BY role, username;
