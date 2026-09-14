-- ═══════════════════════════════════════════════════════════════════
-- 012_webauthn_schema.sql
-- Real schema for webauthn_credentials and webauthn_challenges.
-- These tables exist as empty shells — this adds the real columns.
-- Used by the 4 Edge Functions in supabase/functions/webauthn-*/
-- Run after 011_wire_missing_tables.sql.
-- ═══════════════════════════════════════════════════════════════════

-- webauthn_credentials — one row per registered device per user
ALTER TABLE webauthn_credentials
    ADD COLUMN IF NOT EXISTS user_id       INTEGER NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
    ADD COLUMN IF NOT EXISTS credential_id TEXT    NOT NULL,
    ADD COLUMN IF NOT EXISTS public_key    TEXT    NOT NULL,
    ADD COLUMN IF NOT EXISTS sign_count    BIGINT  NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS device_label  TEXT,
    ADD COLUMN IF NOT EXISTS transports    TEXT,
    ADD COLUMN IF NOT EXISTS is_active     BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS last_used_at  TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS created_at    TIMESTAMPTZ DEFAULT NOW(),
    ADD COLUMN IF NOT EXISTS updated_at    TIMESTAMPTZ DEFAULT NOW();

-- Unique per device per user
CREATE UNIQUE INDEX IF NOT EXISTS idx_webauthn_cred_unique
    ON webauthn_credentials(user_id, credential_id);

CREATE INDEX IF NOT EXISTS idx_webauthn_cred_user
    ON webauthn_credentials(user_id) WHERE is_active = TRUE;

-- webauthn_challenges — one-time challenges (5 min expiry)
ALTER TABLE webauthn_challenges
    ADD COLUMN IF NOT EXISTS user_id    INTEGER REFERENCES teachers(id) ON DELETE CASCADE,
    ADD COLUMN IF NOT EXISTS challenge  TEXT    NOT NULL,
    ADD COLUMN IF NOT EXISTS type       TEXT    NOT NULL CHECK (type IN ('registration','authentication')),
    ADD COLUMN IF NOT EXISTS used       BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ NOT NULL,
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_webauthn_challenges_user
    ON webauthn_challenges(user_id, type, used);
CREATE INDEX IF NOT EXISTS idx_webauthn_challenges_exp
    ON webauthn_challenges(expires_at) WHERE used = FALSE;

-- RLS: Edge Functions use SERVICE_ROLE key (bypasses RLS).
-- No anon or authenticated policies needed — intentional.
-- These tables must ONLY be accessed through the Edge Functions.
ALTER TABLE webauthn_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE webauthn_challenges   ENABLE ROW LEVEL SECURITY;

-- Auto-cleanup job (optional): delete expired used challenges older than 1 day
-- Run manually or via pg_cron if available:
-- DELETE FROM webauthn_challenges WHERE used = TRUE AND created_at < NOW() - INTERVAL '1 day';

-- Verify columns
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('webauthn_credentials','webauthn_challenges')
ORDER BY table_name, ordinal_position;
