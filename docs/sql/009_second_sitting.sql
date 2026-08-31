-- ═══════════════════════════════════════════════════════════════════
-- ECOLE LA FONTAINE — Second Sitting Migration
-- Run in Supabase SQL Editor after the holiday sessions migration.
-- ═══════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────
-- 1. Allow 'second_sitting' as an assessment phase
--    assessments.phase already accepts 'pre_midterm' | 'post_midterm'
--    We add 'second_sitting' to the allowed values.
-- ─────────────────────────────────────────────────────────────────
ALTER TABLE assessments
    DROP CONSTRAINT IF EXISTS assessments_phase_check;

ALTER TABLE assessments
    ADD CONSTRAINT assessments_phase_check
    CHECK (phase IN ('pre_midterm', 'post_midterm', 'second_sitting'));

-- ─────────────────────────────────────────────────────────────────
-- 2. Add second_sitting_score to marks table
--    Stored as a percentage (0-100) entered directly by teacher.
--    NULL = not taken / not applicable.
-- ─────────────────────────────────────────────────────────────────
ALTER TABLE marks
    ADD COLUMN IF NOT EXISTS second_sitting_score NUMERIC(5,2) DEFAULT NULL;

ALTER TABLE marks
    ADD COLUMN IF NOT EXISTS second_sitting_entered_by INTEGER
        REFERENCES teachers(id) ON DELETE SET NULL;

ALTER TABLE marks
    ADD COLUMN IF NOT EXISTS second_sitting_entered_at TIMESTAMPTZ DEFAULT NULL;

COMMENT ON COLUMN marks.second_sitting_score IS
    'Second sitting result stored as percentage (0-100). '
    'Used only for promotion eligibility — does NOT change the annual average. '
    'NULL means student did not sit second sitting or it was not applicable.';

-- ─────────────────────────────────────────────────────────────────
-- 3. Add promotion decision columns to students
--    Tracks first and final promotion decisions per academic year.
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS student_promotion_decisions (
    id                  SERIAL PRIMARY KEY,
    student_id          INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    academic_year_id    INTEGER NOT NULL REFERENCES academic_years(id) ON DELETE CASCADE,
    class_id            INTEGER REFERENCES classes(id) ON DELETE SET NULL,

    -- Annual average % (fixed — sum of 3 terms / max, not recalculated)
    annual_average_pct  NUMERIC(5,2),

    -- FIRST DECISION (before second sitting)
    -- 'promoted' | 'second_sitting' | 'repeated' | 'discontinued' |
    -- 'promoted_elsewhere' | 'repeated_elsewhere'
    first_decision      TEXT CHECK (first_decision IN (
                            'promoted', 'second_sitting', 'repeated',
                            'discontinued', 'promoted_elsewhere', 'repeated_elsewhere'
                        )),
    first_decision_by   INTEGER REFERENCES teachers(id) ON DELETE SET NULL,
    first_decision_at   TIMESTAMPTZ,

    -- FINAL DECISION (after second sitting)
    -- 'promoted' | 'repeated' | 'discontinued' |
    -- 'promoted_after_2nd' | 'repeated_after_2nd'
    final_decision      TEXT CHECK (final_decision IN (
                            'promoted', 'repeated', 'discontinued',
                            'promoted_after_2nd', 'repeated_after_2nd'
                        )),
    final_decision_by   INTEGER REFERENCES teachers(id) ON DELETE SET NULL,
    final_decision_at   TIMESTAMPTZ,

    -- Second sitting average % (only for core subjects)
    second_sitting_avg_pct NUMERIC(5,2),

    -- Whether student was auto-registered for second sitting
    auto_registered_2nd BOOLEAN DEFAULT FALSE,

    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE (student_id, academic_year_id)
);

CREATE INDEX IF NOT EXISTS idx_promo_decisions_student
    ON student_promotion_decisions(student_id);
CREATE INDEX IF NOT EXISTS idx_promo_decisions_year
    ON student_promotion_decisions(academic_year_id);
CREATE INDEX IF NOT EXISTS idx_promo_decisions_first
    ON student_promotion_decisions(first_decision);

ALTER TABLE student_promotion_decisions ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "Auth can manage promotion decisions"
    ON student_promotion_decisions FOR ALL
    USING (auth.role() IN ('authenticated', 'anon'));

-- ─────────────────────────────────────────────────────────────────
-- 4. Mark which assessments are 'core subjects'
--    Core = English, Kinyarwanda, Mathematics, Science, SRS, French
--    Used to determine which subjects count for second sitting.
-- ─────────────────────────────────────────────────────────────────
ALTER TABLE subjects
    ADD COLUMN IF NOT EXISTS is_core BOOLEAN DEFAULT TRUE;

COMMENT ON COLUMN subjects.is_core IS
    'TRUE = core subject eligible for second sitting. '
    'FALSE = non-core (Creative Arts, PE, etc.) — excluded from 2nd sitting.';

-- ─────────────────────────────────────────────────────────────────
-- 5. Verify
-- ─────────────────────────────────────────────────────────────────
SELECT
    table_name,
    (SELECT COUNT(*) FROM information_schema.columns c
     WHERE c.table_name = t.table_name AND c.table_schema = 'public') AS col_count
FROM information_schema.tables t
WHERE table_schema = 'public'
  AND table_name IN ('student_promotion_decisions', 'marks', 'assessments', 'subjects')
ORDER BY table_name;
