-- ═══════════════════════════════════════════════════════════════════
-- 011_wire_missing_tables.sql
-- Enables RLS and adds missing columns to app tables that exist
-- in the DB as empty shells. Run after 010_rwanda_locations.sql.
-- ═══════════════════════════════════════════════════════════════════

-- 1. discount_rules
ALTER TABLE discount_rules ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='discount_rules'
                 AND policyname='Auth discount_rules') THEN
    CREATE POLICY "Auth discount_rules" ON discount_rules FOR ALL
        USING (auth.role() IN ('authenticated','anon'));
  END IF;
END $$;
ALTER TABLE discount_rules
    ADD COLUMN IF NOT EXISTS is_active        BOOLEAN DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS academic_year_id INTEGER REFERENCES academic_years(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS notes            TEXT,
    ADD COLUMN IF NOT EXISTS created_at       TIMESTAMPTZ DEFAULT NOW(),
    ADD COLUMN IF NOT EXISTS updated_at       TIMESTAMPTZ DEFAULT NOW();
CREATE INDEX IF NOT EXISTS idx_discount_rules_year ON discount_rules(academic_year_id);

-- 2. payment_reversals
ALTER TABLE payment_reversals ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='payment_reversals'
                 AND policyname='Auth payment_reversals') THEN
    CREATE POLICY "Auth payment_reversals" ON payment_reversals FOR ALL
        USING (auth.role() IN ('authenticated','anon'));
  END IF;
END $$;
ALTER TABLE payment_reversals
    ADD COLUMN IF NOT EXISTS academic_year_id INTEGER REFERENCES academic_years(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS term_id          INTEGER REFERENCES terms(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS notes            TEXT,
    ADD COLUMN IF NOT EXISTS updated_at       TIMESTAMPTZ DEFAULT NOW();
CREATE INDEX IF NOT EXISTS idx_payment_reversals_student ON payment_reversals(student_id);

-- 3. reminders
ALTER TABLE reminders ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='reminders'
                 AND policyname='Auth reminders') THEN
    CREATE POLICY "Auth reminders" ON reminders FOR ALL
        USING (auth.role() IN ('authenticated','anon'));
  END IF;
END $$;
ALTER TABLE reminders
    ADD COLUMN IF NOT EXISTS academic_year_id INTEGER REFERENCES academic_years(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS term_id          INTEGER REFERENCES terms(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS class_id         INTEGER REFERENCES classes(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS student_id       INTEGER REFERENCES students(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS is_sent          BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS sent_at          TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS updated_at       TIMESTAMPTZ DEFAULT NOW();
CREATE INDEX IF NOT EXISTS idx_reminders_year ON reminders(academic_year_id);

-- 4. student_archive
ALTER TABLE student_archive ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='student_archive'
                 AND policyname='Auth student_archive') THEN
    CREATE POLICY "Auth student_archive" ON student_archive FOR ALL
        USING (auth.role() IN ('authenticated','anon'));
  END IF;
END $$;
ALTER TABLE student_archive
    ADD COLUMN IF NOT EXISTS academic_year_id INTEGER REFERENCES academic_years(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS archived_by      INTEGER REFERENCES teachers(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS restore_notes    TEXT,
    ADD COLUMN IF NOT EXISTS restored_at      TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS restored_by      INTEGER REFERENCES teachers(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS updated_at       TIMESTAMPTZ DEFAULT NOW();
CREATE INDEX IF NOT EXISTS idx_student_archive_student ON student_archive(student_id);

-- 5. student_academic_history
ALTER TABLE student_academic_history ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='student_academic_history'
                 AND policyname='Auth student_academic_history') THEN
    CREATE POLICY "Auth student_academic_history" ON student_academic_history FOR ALL
        USING (auth.role() IN ('authenticated','anon'));
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_student_acad_hist_student ON student_academic_history(student_id);
CREATE INDEX IF NOT EXISTS idx_student_acad_hist_year    ON student_academic_history(academic_year_id);

-- 6. webauthn_credentials
ALTER TABLE webauthn_credentials ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='webauthn_credentials'
                 AND policyname='Auth webauthn_credentials') THEN
    CREATE POLICY "Auth webauthn_credentials" ON webauthn_credentials FOR ALL
        USING (auth.role() IN ('authenticated','anon'));
  END IF;
END $$;

-- 7. webauthn_challenges
ALTER TABLE webauthn_challenges ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='webauthn_challenges'
                 AND policyname='Auth webauthn_challenges') THEN
    CREATE POLICY "Auth webauthn_challenges" ON webauthn_challenges FOR ALL
        USING (auth.role() IN ('authenticated','anon'));
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_webauthn_challenges_exp
    ON webauthn_challenges(expires_at) WHERE expires_at IS NOT NULL;

-- 8. promotion_batches
ALTER TABLE promotion_batches ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='promotion_batches'
                 AND policyname='Auth promotion_batches') THEN
    CREATE POLICY "Auth promotion_batches" ON promotion_batches FOR ALL
        USING (auth.role() IN ('authenticated','anon'));
  END IF;
END $$;

-- 9. second_sitting_config (create if not exists)
CREATE TABLE IF NOT EXISTS second_sitting_config (
    id               SERIAL PRIMARY KEY,
    academic_year_id INTEGER NOT NULL REFERENCES academic_years(id) ON DELETE CASCADE,
    promotion_mark   NUMERIC(5,2) NOT NULL DEFAULT 50,
    exam_date        DATE,
    notes            TEXT,
    is_active        BOOLEAN DEFAULT TRUE,
    created_by       INTEGER REFERENCES teachers(id) ON DELETE SET NULL,
    created_at       TIMESTAMPTZ DEFAULT NOW(),
    updated_at       TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(academic_year_id)
);
ALTER TABLE second_sitting_config ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='second_sitting_config'
                 AND policyname='Auth second_sitting_config') THEN
    CREATE POLICY "Auth second_sitting_config" ON second_sitting_config FOR ALL
        USING (auth.role() IN ('authenticated','anon'));
  END IF;
END $$;

-- Legacy tables (do NOT drop without backup):
-- students_old, student_promotions, student_promotion_records,
-- promotion_thresholds, session_fees, session_marks, session_enrollments,
-- activity_logs, marks_archive, student_fee_history, fee_approval_requests,
-- fee_auto_apply_notifications, discounts, promotions, backups

SELECT table_name FROM information_schema.tables
WHERE table_schema='public'
  AND table_name IN ('discount_rules','payment_reversals','reminders',
                     'student_archive','student_academic_history',
                     'webauthn_credentials','webauthn_challenges',
                     'promotion_batches','second_sitting_config')
ORDER BY table_name;
