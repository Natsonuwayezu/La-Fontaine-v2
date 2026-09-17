-- ═══════════════════════════════════════════════════════════════════
-- 014_fix_anon_grants.sql
-- Fixes login failure caused by missing GRANT SELECT on tables
-- that the app reads before or during login.
-- Run this FIRST if login is failing.
-- ═══════════════════════════════════════════════════════════════════

-- The login page reads school_settings to show school name/logo.
-- RLS policies exist but GRANT SELECT was missing → 403 for anon.
GRANT SELECT ON school_settings TO anon;
GRANT SELECT ON school_settings TO authenticated;

-- teachers table is read by login_check RPC (SECURITY DEFINER bypasses RLS)
-- but teachers_public view needs grant for the login page avatar display
GRANT SELECT ON teachers_public TO anon;
GRANT SELECT ON teachers_public TO authenticated;

-- academic_years, terms, classes needed immediately after login
GRANT SELECT ON academic_years TO anon, authenticated;
GRANT SELECT ON terms          TO anon, authenticated;
GRANT SELECT ON classes        TO anon, authenticated;
GRANT SELECT ON subjects       TO anon, authenticated;
GRANT SELECT ON teachers       TO authenticated;

-- Fee categories needed for enrollment form (pre-login registration in future)
GRANT SELECT ON fee_categories TO anon, authenticated;
GRANT SELECT ON fee_amounts     TO anon, authenticated;

-- Ensure login_check RPC is callable by anon (needed for login)
GRANT EXECUTE ON FUNCTION login_check(TEXT, TEXT, TEXT) TO anon;

-- Ensure get_server_time is callable by anon (needed for time sync on boot)
GRANT EXECUTE ON FUNCTION get_server_time() TO anon, authenticated;

-- Verify: check current anon grants
SELECT grantee, table_name, privilege_type
FROM information_schema.role_table_grants
WHERE grantee = 'anon'
  AND table_name IN ('school_settings','teachers','academic_years','terms','classes')
ORDER BY table_name;
