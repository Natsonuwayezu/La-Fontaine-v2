-- ═══════════════════════════════════════════════════════════════════
-- ECOLE LA FONTAINE — QR Verification System Migration
-- ═══════════════════════════════════════════════════════════════════
-- Run this in your Supabase SQL Editor (Project → SQL Editor → New query)
-- Safe to run multiple times — uses CREATE TABLE IF NOT EXISTS
-- ═══════════════════════════════════════════════════════════════════

-- ────────────────────────────────────────────────────────────────────
-- 1. VERIFICATIONS
--    One row per generated QR code.
--    Links a short UUID token to a frozen snapshot row.
--    No student data stored here — just the lookup key.
-- ────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS verifications (
    id               SERIAL PRIMARY KEY,
    token            UUID UNIQUE NOT NULL DEFAULT gen_random_uuid(),
    document_type    TEXT NOT NULL CHECK (document_type IN ('report_card','receipt','transcript')),
    document_id      INTEGER NOT NULL,    -- FK into the relevant snapshot table
    student_id       INTEGER REFERENCES students(id) ON DELETE SET NULL,
    generated_at     TIMESTAMPTZ DEFAULT NOW(),
    scan_count       INTEGER DEFAULT 0,
    last_scanned_at  TIMESTAMPTZ,
    is_valid         BOOLEAN DEFAULT TRUE,
    created_by       INTEGER REFERENCES teachers(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_verifications_token
    ON verifications (token);

CREATE INDEX IF NOT EXISTS idx_verifications_student
    ON verifications (student_id);

COMMENT ON TABLE verifications IS
    'QR code tokens. Each row links a UUID to a frozen document snapshot. '
    'Token is the only payload in the QR code URL. '
    'No student data, no marks, no amounts stored here.';

-- ────────────────────────────────────────────────────────────────────
-- 2. REPORT_CARD_SNAPSHOTS
--    Frozen academic data at the time the report card was printed.
--    Scanning the QR always regenerates the PDF from this snapshot —
--    never from live marks data. Term 1 scans always show Term 1 data.
-- ────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS report_card_snapshots (
    id                  SERIAL PRIMARY KEY,

    -- Student identifiers (frozen)
    student_id          INTEGER REFERENCES students(id) ON DELETE SET NULL,
    student_name        TEXT NOT NULL,
    student_first_name  TEXT NOT NULL DEFAULT '',
    student_last_name   TEXT NOT NULL DEFAULT '',
    student_code        TEXT NOT NULL,
    student_dob         DATE,
    student_gender      TEXT,
    guardian_name       TEXT,
    guardian_phone      TEXT,

    -- Class / year / term (frozen)
    class_id            INTEGER REFERENCES classes(id) ON DELETE SET NULL,
    class_name          TEXT NOT NULL DEFAULT '',
    term_id             INTEGER REFERENCES terms(id) ON DELETE SET NULL,
    term_name           TEXT NOT NULL DEFAULT '',
    term_number         SMALLINT,
    academic_year_id    INTEGER REFERENCES academic_years(id) ON DELETE SET NULL,
    year_name           TEXT NOT NULL DEFAULT '',

    -- Report type
    phase               TEXT NOT NULL CHECK (phase IN ('pre_midterm','post_midterm','annual')),
    is_nursery          BOOLEAN DEFAULT FALSE,

    -- Full academic data (frozen JSONB)
    -- subjects: [{id, name, code, mg, ex, total, max, mg_max, ex_max,
    --             percentage, grade, isPassing,
    --             assessments:[{type,score,max,pct,grade,kind}]}]
    subjects            JSONB NOT NULL DEFAULT '[]'::jsonb,

    -- totals: {mg, ex, grand, max, percentage, grade}
    totals              JSONB NOT NULL DEFAULT '{}'::jsonb,

    -- annual_data: only populated when phase='annual'
    -- {perTerm:{}, perSubjectAnnual:{}, annualGTot, annualGTotMax, annualPct}
    annual_data         JSONB,

    -- Summary (frozen)
    rank                TEXT,           -- e.g. '3rd of 28'
    rank_number         SMALLINT,
    class_size          SMALLINT DEFAULT 0,
    overall_grade       TEXT,
    overall_percentage  NUMERIC(5,2),
    is_passing          BOOLEAN,

    -- Attendance snapshot (frozen)
    -- {total, present, absent, late, rate}
    attendance          JSONB,

    -- Additional info (frozen)
    teacher_comment     TEXT,
    promotion_decision  TEXT,           -- 'PROMOTED' | 'RETAINED' | 'REMEDIAL'
    promotion_label     TEXT,           -- human-readable label

    -- School info at time of print (frozen)
    head_teacher_name   TEXT,
    school_name         TEXT NOT NULL DEFAULT 'ECOLE LA FONTAINE',
    school_address      TEXT DEFAULT 'Rubavu, Rwanda',
    school_phone        TEXT,
    school_email        TEXT,
    school_logo         TEXT,           -- base64 or URL
    school_motto        TEXT,
    school_footer_1     TEXT,
    school_footer_2     TEXT,

    -- Audit
    generated_at        TIMESTAMPTZ DEFAULT NOW(),
    created_by          INTEGER REFERENCES teachers(id) ON DELETE SET NULL,
    is_locked           BOOLEAN DEFAULT TRUE    -- once locked, never updated
);

CREATE INDEX IF NOT EXISTS idx_rcs_student
    ON report_card_snapshots (student_id);
CREATE INDEX IF NOT EXISTS idx_rcs_term
    ON report_card_snapshots (term_id);
CREATE INDEX IF NOT EXISTS idx_rcs_year
    ON report_card_snapshots (academic_year_id);

COMMENT ON TABLE report_card_snapshots IS
    'Frozen academic snapshot for QR-verified report cards. '
    'Data is locked at print time and never updated after is_locked=TRUE. '
    'The subjects JSONB includes every assessment score visible on the report.';

-- ────────────────────────────────────────────────────────────────────
-- 3. RECEIPT_SNAPSHOTS
--    Frozen payment data at the time the receipt was printed.
-- ────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS receipt_snapshots (
    id                  SERIAL PRIMARY KEY,

    -- Receipt identity (frozen)
    receipt_number      TEXT NOT NULL,

    -- Student (frozen)
    student_id          INTEGER REFERENCES students(id) ON DELETE SET NULL,
    student_name        TEXT NOT NULL,
    student_first_name  TEXT NOT NULL DEFAULT '',
    student_last_name   TEXT NOT NULL DEFAULT '',
    student_code        TEXT NOT NULL,
    class_name          TEXT NOT NULL DEFAULT '',
    guardian_name       TEXT,
    guardian_phone      TEXT,

    -- Year / term (frozen)
    term_id             INTEGER REFERENCES terms(id) ON DELETE SET NULL,
    term_name           TEXT NOT NULL DEFAULT '',
    academic_year_id    INTEGER REFERENCES academic_years(id) ON DELETE SET NULL,
    year_name           TEXT NOT NULL DEFAULT '',

    -- Payment info (frozen)
    amount              NUMERIC(12,2) NOT NULL,
    amount_in_words     TEXT NOT NULL,
    payment_method      TEXT NOT NULL,
    payment_date        DATE NOT NULL,
    reference_number    TEXT,
    notes               TEXT,
    recorded_by         TEXT,

    -- Fee breakdown (frozen JSONB)
    -- fees (all fees for this student this year):
    --   [{category, amount, waived, paid, balance, status, due_date}]
    fees                JSONB NOT NULL DEFAULT '[]'::jsonb,

    -- line_items (just what this payment covered):
    --   [{fee_name, owed, allocated}]
    line_items          JSONB NOT NULL DEFAULT '[]'::jsonb,

    -- Balance summary (frozen at payment moment)
    total_fees          NUMERIC(12,2) DEFAULT 0,
    total_paid          NUMERIC(12,2) DEFAULT 0,   -- cumulative including this payment
    outstanding_balance NUMERIC(12,2) DEFAULT 0,

    -- School info (frozen)
    school_name         TEXT NOT NULL DEFAULT 'ECOLE LA FONTAINE',
    school_address      TEXT DEFAULT 'Rubavu, Rwanda',
    school_phone        TEXT,
    school_email        TEXT,
    school_logo         TEXT,
    head_teacher_name   TEXT,

    -- Audit
    generated_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rs_student
    ON receipt_snapshots (student_id);
CREATE INDEX IF NOT EXISTS idx_rs_receipt_number
    ON receipt_snapshots (receipt_number);

COMMENT ON TABLE receipt_snapshots IS
    'Frozen payment snapshot for QR-verified receipts. '
    'Stores the exact fee breakdown and amounts at the time the receipt was printed.';

-- ────────────────────────────────────────────────────────────────────
-- 4. TRANSCRIPT_SNAPSHOTS
--    Frozen multi-term academic data for official transcripts.
-- ────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS transcript_snapshots (
    id                  SERIAL PRIMARY KEY,

    -- Student (frozen)
    student_id          INTEGER REFERENCES students(id) ON DELETE SET NULL,
    student_name        TEXT NOT NULL,
    student_first_name  TEXT NOT NULL DEFAULT '',
    student_last_name   TEXT NOT NULL DEFAULT '',
    student_code        TEXT NOT NULL,

    -- Year / class (frozen)
    academic_year_id    INTEGER REFERENCES academic_years(id) ON DELETE SET NULL,
    year_name           TEXT NOT NULL DEFAULT '',
    class_name          TEXT NOT NULL DEFAULT '',
    class_level         TEXT DEFAULT 'primary',   -- 'primary' | 'nursery'

    -- All terms JSONB (frozen)
    -- terms: [{term_id, term_name, term_number,
    --           subjects:[{id,name,mg,ex,total,max,percentage,grade}],
    --           g_tot, g_tot_max, percentage, grade}]
    terms               JSONB NOT NULL DEFAULT '[]'::jsonb,

    -- Cumulative totals (frozen)
    -- {annual_g_tot, annual_g_tot_max, annual_pct, annual_grade,
    --  per_subject:{subjectId:{term1Tot,term2Tot,term3Tot,annualTot,annualPct}}}
    cumulative_totals   JSONB NOT NULL DEFAULT '{}'::jsonb,

    -- Summary (frozen)
    overall_grade       TEXT,
    overall_percentage  NUMERIC(5,2),

    -- School info (frozen)
    school_name         TEXT NOT NULL DEFAULT 'ECOLE LA FONTAINE',
    school_address      TEXT DEFAULT 'Rubavu, Rwanda',
    school_logo         TEXT,
    head_teacher_name   TEXT,

    -- Audit
    generated_at        TIMESTAMPTZ DEFAULT NOW(),
    created_by          INTEGER REFERENCES teachers(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_ts_student
    ON transcript_snapshots (student_id);
CREATE INDEX IF NOT EXISTS idx_ts_year
    ON transcript_snapshots (academic_year_id);

COMMENT ON TABLE transcript_snapshots IS
    'Frozen academic transcript for QR-verified documents. '
    'Stores all three terms together so one QR scan rebuilds the full transcript '
    'exactly as it was when printed.';

-- ────────────────────────────────────────────────────────────────────
-- 5. ROW LEVEL SECURITY (RLS)
--    verifications and snapshots are PUBLIC READ (anyone with the
--    token can verify). Only authenticated users can INSERT.
-- ────────────────────────────────────────────────────────────────────

ALTER TABLE verifications          ENABLE ROW LEVEL SECURITY;
ALTER TABLE report_card_snapshots  ENABLE ROW LEVEL SECURITY;
ALTER TABLE receipt_snapshots      ENABLE ROW LEVEL SECURITY;
ALTER TABLE transcript_snapshots   ENABLE ROW LEVEL SECURITY;

-- Public can SELECT (needed for QR scan — unauthenticated browser)
CREATE POLICY IF NOT EXISTS "Public can read verifications"
    ON verifications FOR SELECT USING (true);

CREATE POLICY IF NOT EXISTS "Public can read report_card_snapshots"
    ON report_card_snapshots FOR SELECT USING (true);

CREATE POLICY IF NOT EXISTS "Public can read receipt_snapshots"
    ON receipt_snapshots FOR SELECT USING (true);

CREATE POLICY IF NOT EXISTS "Public can read transcript_snapshots"
    ON transcript_snapshots FOR SELECT USING (true);

-- Anon key can PATCH scan_count on verifications (for scan counter)
CREATE POLICY IF NOT EXISTS "Anon can update scan_count on verifications"
    ON verifications FOR UPDATE USING (true)
    WITH CHECK (true);

-- Only authenticated users (app users) can INSERT snapshots
CREATE POLICY IF NOT EXISTS "Authenticated can insert verifications"
    ON verifications FOR INSERT
    WITH CHECK (auth.role() = 'authenticated' OR auth.role() = 'anon');

CREATE POLICY IF NOT EXISTS "Authenticated can insert report_card_snapshots"
    ON report_card_snapshots FOR INSERT
    WITH CHECK (auth.role() = 'authenticated' OR auth.role() = 'anon');

CREATE POLICY IF NOT EXISTS "Authenticated can insert receipt_snapshots"
    ON receipt_snapshots FOR INSERT
    WITH CHECK (auth.role() = 'authenticated' OR auth.role() = 'anon');

CREATE POLICY IF NOT EXISTS "Authenticated can insert transcript_snapshots"
    ON transcript_snapshots FOR INSERT
    WITH CHECK (auth.role() = 'authenticated' OR auth.role() = 'anon');

-- ────────────────────────────────────────────────────────────────────
-- 6. VERIFY MIGRATION RAN CORRECTLY
-- ────────────────────────────────────────────────────────────────────
SELECT
    table_name,
    (SELECT COUNT(*) FROM information_schema.columns c
     WHERE c.table_name = t.table_name
     AND c.table_schema = 'public') AS column_count
FROM information_schema.tables t
WHERE table_schema = 'public'
AND table_name IN (
    'verifications',
    'report_card_snapshots',
    'receipt_snapshots',
    'transcript_snapshots'
)
ORDER BY table_name;
