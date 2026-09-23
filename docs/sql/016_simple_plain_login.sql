-- ═══════════════════════════════════════════════════════════════════
-- 016_simple_plain_login.sql
-- Sets up plain text password login.
-- No bcrypt. No lockout table. Works immediately.
-- RUN THIS NOW in Supabase SQL Editor.
-- ═══════════════════════════════════════════════════════════════════

-- 1. Make sure admin_password exists in school_settings (plaintext)
INSERT INTO school_settings (key, value, updated_at)
VALUES ('admin_password', 'Lafontaine2026', NOW())
ON CONFLICT (key) DO UPDATE SET value = 'Lafontaine2026', updated_at = NOW();

-- 2. Make sure teacher passwords are plaintext
--    If they were hashed by 003_hash_passwords.sql, reset them:
UPDATE teachers SET password = 'Boniface'  WHERE username = 'Boniface';
UPDATE teachers SET password = 'Laurence'  WHERE username = 'Laurence';
-- Add more teachers here if needed:
-- UPDATE teachers SET password = 'yourpassword' WHERE username = 'yourusername';

-- 3. Grant SELECT on school_settings to anon
--    (needed so login page can read admin_password)
GRANT SELECT ON school_settings TO anon;
GRANT SELECT ON teachers        TO anon;
GRANT SELECT ON teachers        TO authenticated;
GRANT SELECT, UPDATE ON teachers TO anon;

-- 4. Verify — these should all return rows:
SELECT key, value FROM school_settings WHERE key = 'admin_password';
SELECT id, username, role, LEFT(password, 10) AS pw_preview, is_active FROM teachers ORDER BY role;
