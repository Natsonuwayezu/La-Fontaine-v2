-- ═══════════════════════════════════════════════════════════════════
-- 006_google_oauth_login.sql
-- ═══════════════════════════════════════════════════════════════════
-- Ecole La Fontaine v2 — Phase 5 of the auth hardening roadmap
-- (see TODO.md). Server-side support for Google Sign-In.
--
-- Google itself verifies the person's identity — by the time
-- js/core/auth.js's handleGoogleRedirect() calls this function, it
-- already has a confirmed, Google-verified email address. This
-- function's only job is: does that email belong to a real,
-- currently-active teacher row? Same security posture as
-- login_check() — SECURITY DEFINER, never returns the password
-- column, and (like login_check()) doesn't need anon to have direct
-- SELECT access to the real email column for this to work safely.
--
-- REQUIRED SETUP THIS FILE DOES NOT AND CANNOT DO (Natso's action,
-- outside the database entirely):
--   1. Google Cloud Console: create a project, configure the OAuth
--      consent screen, create OAuth 2.0 credentials (Client ID +
--      Secret) — free, no Apple-style membership fee.
--   2. Supabase Dashboard -> Authentication -> Providers -> Google:
--      paste that Client ID + Secret, enable the provider.
--   3. In the same Google Cloud OAuth client, add this exact
--      Authorized redirect URI (Supabase needs this one, not your
--      app's own URL): https://<your-project-ref>.supabase.co/auth/v1/callback
--      (find <your-project-ref> in your Supabase project URL/settings)
--
-- Until all three are done, clicking "Sign in with Google" will fail
-- with a clear error from Supabase — that's expected, not a bug in
-- this file or the app code.
--
-- Run this after 001-005.
-- ═══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION oauth_login_check(
    p_email TEXT
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
    RETURN QUERY
    SELECT
        t.id::INTEGER, t.username::TEXT, t.first_name::TEXT, t.last_name::TEXT,
        t.role::TEXT, t.phone::TEXT, t.email::TEXT, t.is_active::BOOLEAN
    FROM teachers t
    WHERE t.email IS NOT NULL
      AND lower(t.email) = lower(p_email)
      AND t.is_active = TRUE
    ORDER BY t.id
    LIMIT 1;
END;
$$;

GRANT EXECUTE ON FUNCTION oauth_login_check(TEXT) TO anon;


-- ───────────────────────────────────────────────────────────────────
-- VERIFICATION
-- ───────────────────────────────────────────────────────────────────
-- Before testing the real Google flow, sanity-check this function
-- directly with an email you know exists on a teacher row:
--   SELECT * FROM oauth_login_check('someone@example.com');
-- Should return exactly one row if that email matches an active
-- teacher, zero rows otherwise.
--
-- Full end-to-end test (after the 3 setup steps above are done):
-- click "Sign in with Google" on the login page, sign in with an
-- account whose email matches an existing teacher's email column,
-- confirm it lands you in the app logged in as that person. Then try
-- a Google account whose email does NOT match anyone — confirm you
-- get the "No account found" message instead of an error or a silent
-- failure.
