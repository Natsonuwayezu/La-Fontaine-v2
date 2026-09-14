-- ═══════════════════════════════════════════════════════════════════
-- 013_report_card_schema.sql
-- Adds fields needed for the 5 report card types:
--   - classes.level (nursery|primary)
--   - subjects: ts_max, ex_max, coefficient
--   - Assessment phase enum update
-- ═══════════════════════════════════════════════════════════════════

-- 1. Add level to classes table
ALTER TABLE classes
    ADD COLUMN IF NOT EXISTS level TEXT NOT NULL DEFAULT 'primary'
        CHECK (level IN ('nursery','primary'));

-- Update existing classes based on name patterns (admin can correct in UI)
UPDATE classes SET level = 'nursery'
WHERE LOWER(name) LIKE '%nursery%'
   OR LOWER(name) LIKE '%maternelle%'
   OR LOWER(name) LIKE '%nur%'
   OR LOWER(name) LIKE '%nurs%';

-- 2. Add subject maxima columns
ALTER TABLE subjects
    ADD COLUMN IF NOT EXISTS ts_max      NUMERIC(6,2) DEFAULT 50,
    ADD COLUMN IF NOT EXISTS ex_max      NUMERIC(6,2) DEFAULT 50,
    ADD COLUMN IF NOT EXISTS coefficient INTEGER      DEFAULT 6;

-- Set defaults based on subject type (admin adjusts in subjects page)
-- Core subjects: ts_max=50, ex_max=50, total=100
-- Science/Social: ts_max=40, ex_max=40, total=80
-- Reading/Creative Arts: ts_max=20, ex_max=20, total=40
-- Sports: ts_max=10, ex_max=10, total=20

-- 3. Add assessment_category to assessments table
--    to track which report card phase each assessment belongs to
ALTER TABLE assessments
    ADD COLUMN IF NOT EXISTS assessment_category TEXT DEFAULT 'test'
        CHECK (assessment_category IN (
            'welcoming',      -- first 2 weeks of term, primary only
            'test',           -- regular class test
            'quiz',           -- short quiz
            'midterm_exam',   -- midterm examination
            'school_exam',    -- end of term school exam
            'district_exam',  -- term 2 primary: district exam
            'nesa_exam',      -- term 3 primary: NESA exam
            'holiday',        -- holiday session assessment
            'second_sitting', -- second sitting exam
            'other'           -- other assessments
        ));

-- 4. Add welcoming_cutoff_date to terms table
--    After this date, welcoming category disappears from marks entry
ALTER TABLE terms
    ADD COLUMN IF NOT EXISTS welcoming_cutoff_date DATE,
    ADD COLUMN IF NOT EXISTS midterm_date          DATE,
    ADD COLUMN IF NOT EXISTS end_of_term_date      DATE;

-- 5. Add conduct score per student per term
CREATE TABLE IF NOT EXISTS conduct_scores (
    id               SERIAL PRIMARY KEY,
    student_id       INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    class_id         INTEGER NOT NULL REFERENCES classes(id)  ON DELETE CASCADE,
    term_id          INTEGER NOT NULL REFERENCES terms(id)    ON DELETE CASCADE,
    academic_year_id INTEGER NOT NULL REFERENCES academic_years(id) ON DELETE CASCADE,
    score            NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (score >= 0 AND score <= 40),
    recorded_by      INTEGER REFERENCES teachers(id) ON DELETE SET NULL,
    notes            TEXT,
    created_at       TIMESTAMPTZ DEFAULT NOW(),
    updated_at       TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(student_id, term_id)
);
ALTER TABLE conduct_scores ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='conduct_scores'
                 AND policyname='Auth conduct_scores') THEN
    CREATE POLICY "Auth conduct_scores" ON conduct_scores FOR ALL
        USING (auth.role() IN ('authenticated','anon'));
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_conduct_scores_student ON conduct_scores(student_id);
CREATE INDEX IF NOT EXISTS idx_conduct_scores_term    ON conduct_scores(term_id);

-- Verify
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('classes','subjects','assessments','terms','conduct_scores')
  AND column_name IN ('level','ts_max','ex_max','coefficient',
                      'assessment_category','welcoming_cutoff_date',
                      'midterm_date','end_of_term_date')
ORDER BY table_name, column_name;
