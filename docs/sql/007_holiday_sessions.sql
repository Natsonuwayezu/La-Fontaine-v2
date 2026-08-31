-- ═══════════════════════════════════════════════════════════════════
-- ECOLE LA FONTAINE — Holiday Sessions Migration
-- ═══════════════════════════════════════════════════════════════════
-- Run in Supabase SQL Editor. Safe to re-run (uses IF NOT EXISTS).
--
-- Purpose: Add a holiday_sessions table so every mark, fee, enrollment
-- and subject is tagged to a SPECIFIC holiday session (e.g. "Holiday
-- 2025-T3", "Holiday 2026-T1") — never mixed across sessions or years.
--
-- Also adds:
--   - is_approved / approved_by / approved_at / rejection_reason
--     to student_fees (fee approval workflow)
--   - holiday_session_id FK to all holiday_* tables
--   - session_classes, session_subjects, session_teacher_assignments,
--     session_assessments, session_marks (holiday academic tables)
-- ═══════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────
-- 1. HOLIDAY_SESSIONS — the anchor table
--    One row per holiday period (e.g. "Long Holiday 2026")
--    Links to a row in the holidays table AND to an academic_year.
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS holiday_sessions (
    id                  SERIAL PRIMARY KEY,
    name                TEXT NOT NULL,                        -- e.g. "Long Holiday 2025-2026"
    academic_year_id    INTEGER REFERENCES academic_years(id) ON DELETE CASCADE,
    holiday_id          INTEGER REFERENCES holidays(id) ON DELETE SET NULL,
    -- Which term just finished (helps label the session)
    after_term_number   SMALLINT CHECK (after_term_number IN (1,2,3)),
    start_date          DATE NOT NULL,
    end_date            DATE,                                  -- nullable until confirmed
    status              TEXT NOT NULL DEFAULT 'upcoming'
                            CHECK (status IN ('upcoming','active','completed')),
    -- Auto-activation: when should the app switch into this holiday?
    auto_activate       BOOLEAN DEFAULT TRUE,
    -- Visual theming for this session
    theme_color         TEXT DEFAULT '#d97706',               -- amber = holiday
    icon                TEXT DEFAULT '🏖️',
    description         TEXT,
    created_by          INTEGER REFERENCES teachers(id) ON DELETE SET NULL,
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_holiday_sessions_year
    ON holiday_sessions(academic_year_id);
CREATE INDEX IF NOT EXISTS idx_holiday_sessions_status
    ON holiday_sessions(status);

COMMENT ON TABLE holiday_sessions IS
    'One row per holiday period. Every holiday mark/fee/enrollment is '
    'tagged to a specific holiday_session_id so data from different '
    'holidays is never mixed. The app reads the active session from '
    'the row where status=active and today is between start/end_date.';

-- ─────────────────────────────────────────────────────────────────
-- 2. SESSION_CLASSES — holiday class groupings
--    Separate from the regular classes table.
--    e.g. "Holiday Primary 3", "Holiday Primary 5", "Special Class"
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS session_classes (
    id                  SERIAL PRIMARY KEY,
    holiday_session_id  INTEGER NOT NULL REFERENCES holiday_sessions(id) ON DELETE CASCADE,
    name                TEXT NOT NULL,                        -- "Holiday Primary 3"
    display_order       SMALLINT DEFAULT 0,
    max_students        SMALLINT DEFAULT 40,
    is_active           BOOLEAN DEFAULT TRUE,
    created_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_session_classes_session
    ON session_classes(holiday_session_id);

-- ─────────────────────────────────────────────────────────────────
-- 3. SESSION_SUBJECTS — subjects per holiday class
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS session_subjects (
    id                  SERIAL PRIMARY KEY,
    session_class_id    INTEGER NOT NULL REFERENCES session_classes(id) ON DELETE CASCADE,
    holiday_session_id  INTEGER NOT NULL REFERENCES holiday_sessions(id) ON DELETE CASCADE,
    name                TEXT NOT NULL,                        -- "Mathematics", "English"
    max_marks           NUMERIC(6,2) DEFAULT 100,
    display_order       SMALLINT DEFAULT 0,
    is_active           BOOLEAN DEFAULT TRUE
);

CREATE INDEX IF NOT EXISTS idx_session_subjects_class
    ON session_subjects(session_class_id);

-- ─────────────────────────────────────────────────────────────────
-- 4. HOLIDAY_ENROLLMENTS — upgrade with session FK
--    (adds holiday_session_id to existing table)
-- ─────────────────────────────────────────────────────────────────
ALTER TABLE holiday_enrollments
    ADD COLUMN IF NOT EXISTS holiday_session_id INTEGER
        REFERENCES holiday_sessions(id) ON DELETE CASCADE;

ALTER TABLE holiday_enrollments
    ADD COLUMN IF NOT EXISTS session_class_id INTEGER
        REFERENCES session_classes(id) ON DELETE SET NULL;

ALTER TABLE holiday_enrollments
    ADD COLUMN IF NOT EXISTS enrolled_at TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE holiday_enrollments
    ADD COLUMN IF NOT EXISTS enrolled_by INTEGER
        REFERENCES teachers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_holiday_enrollments_session
    ON holiday_enrollments(holiday_session_id);
CREATE INDEX IF NOT EXISTS idx_holiday_enrollments_session_class
    ON holiday_enrollments(session_class_id);

-- ─────────────────────────────────────────────────────────────────
-- 5. SESSION_TEACHER_ASSIGNMENTS — who teaches what in holiday
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS session_teacher_assignments (
    id                  SERIAL PRIMARY KEY,
    holiday_session_id  INTEGER NOT NULL REFERENCES holiday_sessions(id) ON DELETE CASCADE,
    teacher_id          INTEGER NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
    session_class_id    INTEGER NOT NULL REFERENCES session_classes(id) ON DELETE CASCADE,
    session_subject_id  INTEGER REFERENCES session_subjects(id) ON DELETE SET NULL,
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (holiday_session_id, teacher_id, session_class_id, session_subject_id)
);

-- ─────────────────────────────────────────────────────────────────
-- 6. SESSION_ASSESSMENTS — tests/quizzes in holiday classes
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS session_assessments (
    id                  SERIAL PRIMARY KEY,
    holiday_session_id  INTEGER NOT NULL REFERENCES holiday_sessions(id) ON DELETE CASCADE,
    session_class_id    INTEGER NOT NULL REFERENCES session_classes(id) ON DELETE CASCADE,
    session_subject_id  INTEGER NOT NULL REFERENCES session_subjects(id) ON DELETE CASCADE,
    name                TEXT NOT NULL,                        -- "Test 1", "Final Exam"
    max_marks           NUMERIC(6,2) NOT NULL DEFAULT 100,
    date                DATE,
    is_locked           BOOLEAN DEFAULT FALSE,
    created_by          INTEGER REFERENCES teachers(id) ON DELETE SET NULL,
    created_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_session_assessments_session
    ON session_assessments(holiday_session_id);
CREATE INDEX IF NOT EXISTS idx_session_assessments_class
    ON session_assessments(session_class_id);

-- ─────────────────────────────────────────────────────────────────
-- 7. HOLIDAY_MARKS — upgrade with session FK
-- ─────────────────────────────────────────────────────────────────
ALTER TABLE holiday_marks
    ADD COLUMN IF NOT EXISTS holiday_session_id INTEGER
        REFERENCES holiday_sessions(id) ON DELETE CASCADE;

ALTER TABLE holiday_marks
    ADD COLUMN IF NOT EXISTS session_assessment_id INTEGER
        REFERENCES session_assessments(id) ON DELETE CASCADE;

ALTER TABLE holiday_marks
    ADD COLUMN IF NOT EXISTS session_class_id INTEGER
        REFERENCES session_classes(id) ON DELETE SET NULL;

ALTER TABLE holiday_marks
    ADD COLUMN IF NOT EXISTS session_subject_id INTEGER
        REFERENCES session_subjects(id) ON DELETE SET NULL;

ALTER TABLE holiday_marks
    ADD COLUMN IF NOT EXISTS is_absent BOOLEAN DEFAULT FALSE;

ALTER TABLE holiday_marks
    ADD COLUMN IF NOT EXISTS entered_by INTEGER
        REFERENCES teachers(id) ON DELETE SET NULL;

ALTER TABLE holiday_marks
    ADD COLUMN IF NOT EXISTS entered_at TIMESTAMPTZ DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_holiday_marks_session
    ON holiday_marks(holiday_session_id);
CREATE INDEX IF NOT EXISTS idx_holiday_marks_student
    ON holiday_marks(student_id);

-- ─────────────────────────────────────────────────────────────────
-- 8. HOLIDAY_FEES — upgrade with session FK
-- ─────────────────────────────────────────────────────────────────
ALTER TABLE holiday_fees
    ADD COLUMN IF NOT EXISTS holiday_session_id INTEGER
        REFERENCES holiday_sessions(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_holiday_fees_session
    ON holiday_fees(holiday_session_id);

-- ─────────────────────────────────────────────────────────────────
-- 9. HOLIDAY_SUBJECTS — upgrade with session FK (legacy table)
-- ─────────────────────────────────────────────────────────────────
ALTER TABLE holiday_subjects
    ADD COLUMN IF NOT EXISTS holiday_session_id INTEGER
        REFERENCES holiday_sessions(id) ON DELETE CASCADE;

-- ─────────────────────────────────────────────────────────────────
-- 10. STUDENT_FEES — fee approval columns
-- ─────────────────────────────────────────────────────────────────
ALTER TABLE student_fees
    ADD COLUMN IF NOT EXISTS is_approved     BOOLEAN DEFAULT NULL;
    -- NULL  = no approval needed (legacy/auto-approved fees)
    -- FALSE = pending approval
    -- TRUE  = approved

ALTER TABLE student_fees
    ADD COLUMN IF NOT EXISTS approved_by     INTEGER REFERENCES teachers(id) ON DELETE SET NULL;

ALTER TABLE student_fees
    ADD COLUMN IF NOT EXISTS approved_at     TIMESTAMPTZ;

ALTER TABLE student_fees
    ADD COLUMN IF NOT EXISTS rejection_reason TEXT;

ALTER TABLE student_fees
    ADD COLUMN IF NOT EXISTS requires_approval BOOLEAN DEFAULT FALSE;
    -- Set TRUE for fees created during enrollment or holiday enrollment

ALTER TABLE student_fees
    ADD COLUMN IF NOT EXISTS source          TEXT DEFAULT 'manual';
    -- 'enrollment' | 'holiday_enrollment' | 'bulk_assign' | 'manual'

CREATE INDEX IF NOT EXISTS idx_student_fees_approval
    ON student_fees(is_approved) WHERE is_approved = FALSE;

-- ─────────────────────────────────────────────────────────────────
-- 11. FEE_APPROVAL_LOG — audit trail of approval decisions
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS fee_approval_log (
    id              SERIAL PRIMARY KEY,
    student_fee_id  INTEGER NOT NULL REFERENCES student_fees(id) ON DELETE CASCADE,
    student_id      INTEGER REFERENCES students(id) ON DELETE SET NULL,
    action          TEXT NOT NULL CHECK (action IN ('approved','rejected','auto_approved')),
    acted_by        INTEGER REFERENCES teachers(id) ON DELETE SET NULL,
    acted_at        TIMESTAMPTZ DEFAULT NOW(),
    note            TEXT
);

CREATE INDEX IF NOT EXISTS idx_fee_approval_log_fee
    ON fee_approval_log(student_fee_id);

-- ─────────────────────────────────────────────────────────────────
-- 12. RLS POLICIES
-- ─────────────────────────────────────────────────────────────────
ALTER TABLE holiday_sessions              ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_classes               ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_subjects              ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_teacher_assignments   ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_assessments           ENABLE ROW LEVEL SECURITY;
ALTER TABLE fee_approval_log              ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read session data
CREATE POLICY IF NOT EXISTS "Auth can read holiday_sessions"
    ON holiday_sessions FOR SELECT USING (auth.role() IN ('authenticated','anon'));
CREATE POLICY IF NOT EXISTS "Auth can read session_classes"
    ON session_classes FOR SELECT USING (auth.role() IN ('authenticated','anon'));
CREATE POLICY IF NOT EXISTS "Auth can read session_subjects"
    ON session_subjects FOR SELECT USING (auth.role() IN ('authenticated','anon'));
CREATE POLICY IF NOT EXISTS "Auth can read session_assessments"
    ON session_assessments FOR SELECT USING (auth.role() IN ('authenticated','anon'));
CREATE POLICY IF NOT EXISTS "Auth can read session_teacher_assignments"
    ON session_teacher_assignments FOR SELECT USING (auth.role() IN ('authenticated','anon'));

-- All authenticated users can insert/update/delete session data
CREATE POLICY IF NOT EXISTS "Auth can write holiday_sessions"
    ON holiday_sessions FOR ALL USING (auth.role() IN ('authenticated','anon'));
CREATE POLICY IF NOT EXISTS "Auth can write session_classes"
    ON session_classes FOR ALL USING (auth.role() IN ('authenticated','anon'));
CREATE POLICY IF NOT EXISTS "Auth can write session_subjects"
    ON session_subjects FOR ALL USING (auth.role() IN ('authenticated','anon'));
CREATE POLICY IF NOT EXISTS "Auth can write session_assessments"
    ON session_assessments FOR ALL USING (auth.role() IN ('authenticated','anon'));
CREATE POLICY IF NOT EXISTS "Auth can write session_teacher_assignments"
    ON session_teacher_assignments FOR ALL USING (auth.role() IN ('authenticated','anon'));
CREATE POLICY IF NOT EXISTS "Auth can write fee_approval_log"
    ON fee_approval_log FOR ALL USING (auth.role() IN ('authenticated','anon'));

-- ─────────────────────────────────────────────────────────────────
-- 13. VERIFY
-- ─────────────────────────────────────────────────────────────────
SELECT table_name,
    (SELECT COUNT(*) FROM information_schema.columns c
     WHERE c.table_name = t.table_name AND c.table_schema = 'public') AS columns
FROM information_schema.tables t
WHERE table_schema = 'public'
AND table_name IN (
    'holiday_sessions','session_classes','session_subjects',
    'session_teacher_assignments','session_assessments','fee_approval_log'
)
ORDER BY table_name;
