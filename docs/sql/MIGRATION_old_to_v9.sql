-- ═══════════════════════════════════════════════════════════════════
-- MIGRATION: Old Ecole La Fontaine DB → New v9.0 DB
-- 
-- HOW TO USE:
-- 1. Open your OLD Supabase project → SQL Editor
-- 2. Run the EXPORT section — copy the output
-- 3. Open your NEW Supabase project → SQL Editor  
-- 4. Paste and run the INSERT statements
--
-- OR: If both are the same project (same DB, new schema only):
-- Just run the COPY sections below directly.
--
-- RUN ORDER (foreign keys matter):
--   1. academic_years
--   2. terms
--   3. classes
--   4. subjects
--   5. teachers
--   6. school_settings
--   7. grading_scale
--   8. holidays
--   9. students (after classes)
--  10. families + guardians (after students)
--  11. teacher_assignments (after teachers + classes)
--  12. fee_categories + fee_amounts
--  13. student_fees (after students + fee_categories)
--  14. payments + payment_allocations
--  15. assessments (after classes + subjects + terms)
--  16. marks (after assessments + students)
--  17. attendance_records → attendance (renamed + column map)
--  18. timetable_slots
--  19. announcements
--  20. session_* tables (holiday programme data)
-- ═══════════════════════════════════════════════════════════════════

-- ── STEP 1: Core lookup tables ─────────────────────────────────────

-- academic_years: same structure ✅
INSERT INTO academic_years (id, year_name, start_date, end_date, status, is_current, created_at)
SELECT id, year_name, start_date, end_date, status, is_current, created_at
FROM academic_years
ON CONFLICT (id) DO UPDATE SET
    year_name  = EXCLUDED.year_name,
    status     = EXCLUDED.status,
    is_current = EXCLUDED.is_current;

-- terms: same structure ✅
INSERT INTO terms (id, academic_year_id, term_number, term_label, start_date, end_date, status, created_at)
SELECT id, academic_year_id, term_number, 
       COALESCE(term_label, 'Term '||term_number),
       start_date, end_date, status, created_at
FROM terms
ON CONFLICT (id) DO UPDATE SET
    status     = EXCLUDED.status,
    end_date   = EXCLUDED.end_date;

-- classes: same structure + add level column default ✅
INSERT INTO classes (id, name, sort_order, is_active, class_teacher_id, created_at)
SELECT id, name, sort_order, is_active, class_teacher_id, created_at
FROM classes
ON CONFLICT (id) DO UPDATE SET
    name             = EXCLUDED.name,
    class_teacher_id = EXCLUDED.class_teacher_id,
    is_active        = EXCLUDED.is_active;

-- Set level: nursery/primary based on class name
UPDATE classes SET level = 'nursery'
WHERE LOWER(name) LIKE '%nursery%'
   OR LOWER(name) LIKE '%maternelle%'
   OR LOWER(name) LIKE '%nur%';
UPDATE classes SET level = 'primary'
WHERE level IS NULL OR level = '';

-- subjects: same structure ✅
INSERT INTO subjects (id, name, is_core, sort_order, created_at)
SELECT id, name, is_core, sort_order, created_at
FROM subjects
ON CONFLICT (id) DO UPDATE SET
    name    = EXCLUDED.name,
    is_core = EXCLUDED.is_core;

-- teachers / users: same structure ✅
INSERT INTO teachers (id, username, password, first_name, last_name, role, 
                      email, phone, class_id, is_active, created_at)
SELECT id, username, password, first_name, last_name, role,
       email, phone, class_id, is_active, created_at
FROM teachers
ON CONFLICT (id) DO UPDATE SET
    username   = EXCLUDED.username,
    first_name = EXCLUDED.first_name,
    last_name  = EXCLUDED.last_name,
    role       = EXCLUDED.role,
    email      = EXCLUDED.email,
    phone      = EXCLUDED.phone,
    class_id   = EXCLUDED.class_id,
    is_active  = EXCLUDED.is_active;

-- school_settings: key-value table ✅
INSERT INTO school_settings (key, value, updated_at)
SELECT key, value, updated_at
FROM school_settings
ON CONFLICT (key) DO UPDATE SET
    value      = EXCLUDED.value,
    updated_at = EXCLUDED.updated_at;

-- grading_scale ✅
INSERT INTO grading_scale (id, grade_letter, min_percent, max_percent, gpa_points, description)
SELECT id, grade_letter, min_percent, max_percent, gpa_points, description
FROM grading_scale
ON CONFLICT (id) DO NOTHING;

-- holidays ✅
INSERT INTO holidays (id, holiday_name, holiday_date, academic_year_id, created_at)
SELECT id, holiday_name, holiday_date, academic_year_id, created_at
FROM holidays
ON CONFLICT (id) DO NOTHING;

-- ── STEP 2: Students + families ────────────────────────────────────

-- families: old has family_code, guardian_name, guardian_phone, guardian_email, address ✅
INSERT INTO families (id, family_code, guardian_name, guardian_phone, 
                      guardian_email, address, academic_year_id, created_at)
SELECT id, family_code, guardian_name, guardian_phone,
       guardian_email, address, academic_year_id, created_at
FROM families
ON CONFLICT (id) DO UPDATE SET
    guardian_name  = EXCLUDED.guardian_name,
    guardian_phone = EXCLUDED.guardian_phone;

-- guardians: same structure ✅
INSERT INTO guardians (id, first_name, last_name, relationship, phone, 
                       email, national_id, occupation, address, created_at)
SELECT id, first_name, last_name, relationship, phone,
       email, national_id, occupation, address, created_at
FROM guardians
ON CONFLICT (id) DO NOTHING;

-- students: core columns ✅
INSERT INTO students (id, student_code, first_name, last_name, class_id,
                      gender, date_of_birth, guardian_name, guardian_phone,
                      family_id, status, is_deleted, created_at)
SELECT id, student_code, first_name, last_name, class_id,
       gender, date_of_birth, guardian_name, guardian_phone,
       family_id, status, is_deleted, created_at
FROM students
ON CONFLICT (id) DO UPDATE SET
    class_id      = EXCLUDED.class_id,
    status        = EXCLUDED.status,
    guardian_name = EXCLUDED.guardian_name,
    guardian_phone= EXCLUDED.guardian_phone;

-- student_guardians link table (new in v9) — create from families data
INSERT INTO student_guardians (student_id, guardian_id, is_primary, created_at)
SELECT s.id, g.id, TRUE, NOW()
FROM students s
JOIN guardians g ON g.id IN (
    SELECT id FROM guardians WHERE family_id = s.family_id LIMIT 1
)
WHERE NOT EXISTS (
    SELECT 1 FROM student_guardians sg 
    WHERE sg.student_id = s.id AND sg.guardian_id = g.id
)
ON CONFLICT DO NOTHING;

-- ── STEP 3: Staff assignments ───────────────────────────────────────

-- teacher_assignments ✅
INSERT INTO teacher_assignments (id, teacher_id, class_id, subject_id, 
                                  academic_year_id, term_id, created_at)
SELECT id, teacher_id, class_id, subject_id,
       academic_year_id, term_id, created_at
FROM teacher_assignments
ON CONFLICT (id) DO NOTHING;

-- timetable_slots ✅
INSERT INTO timetable_slots (id, class_id, subject_id, teacher_id,
                              day_of_week, period_number, start_time, end_time,
                              academic_year_id, created_at)
SELECT id, class_id, subject_id, teacher_id,
       day_of_week, period_number, start_time, end_time,
       academic_year_id, created_at
FROM timetable_slots
ON CONFLICT (id) DO NOTHING;

-- ── STEP 4: Academics ──────────────────────────────────────────────

-- assessments: old has assessment_type → new has assessment_category
INSERT INTO assessments (id, class_id, subject_id, term_id, academic_year_id,
                         assessment_name, max_marks, assessment_category,
                         phase, is_locked, created_by, created_at)
SELECT id, class_id, subject_id, term_id, academic_year_id,
       assessment_name, max_marks,
       -- Map old assessment_type to new assessment_category
       CASE 
           WHEN LOWER(assessment_type) LIKE '%welcom%'  THEN 'welcoming'
           WHEN LOWER(assessment_type) LIKE '%midterm%' THEN 'midterm_exam'
           WHEN LOWER(assessment_type) LIKE '%quiz%'    THEN 'quiz'
           WHEN LOWER(assessment_type) LIKE '%test%'    THEN 'test'
           WHEN LOWER(assessment_type) LIKE '%school%exam%' THEN 'school_exam'
           WHEN LOWER(assessment_type) LIKE '%district%'    THEN 'district_exam'
           WHEN LOWER(assessment_type) LIKE '%nesa%'        THEN 'nesa_exam'
           WHEN LOWER(assessment_type) LIKE '%holiday%'     THEN 'holiday'
           ELSE 'test'
       END,
       COALESCE(phase, 'pre_midterm'),
       COALESCE(is_locked, FALSE),
       created_by, created_at
FROM assessments
ON CONFLICT (id) DO NOTHING;

-- marks ✅
INSERT INTO marks (id, assessment_id, student_id, score, is_absent,
                   entered_by, entered_at, academic_year_id, created_at)
SELECT id, assessment_id, student_id, score, is_absent,
       entered_by, entered_at, academic_year_id, created_at
FROM marks
ON CONFLICT (id) DO NOTHING;

-- ── STEP 5: Attendance (table rename + column map) ─────────────────
-- OLD: attendance_records (attendance_date, teacher_id, updated_by, created_by)
-- NEW: attendance (date, recorded_by)

INSERT INTO attendance (student_id, class_id, date, status, notes,
                        recorded_by, academic_year_id, term_id,
                        updated_at, created_at)
SELECT 
    ar.student_id,
    ar.class_id,
    ar.attendance_date       AS date,
    ar.status,
    ar.notes,
    COALESCE(ar.teacher_id, ar.created_by, ar.updated_by) AS recorded_by,
    ar.academic_year_id,
    ar.term_id,
    COALESCE(ar.updated_at, ar.created_at, NOW()),
    COALESCE(ar.created_at, NOW())
FROM attendance_records ar
ON CONFLICT (student_id, date, academic_year_id, term_id) DO NOTHING;

-- ── STEP 6: Finance ────────────────────────────────────────────────

-- fee_categories ✅
INSERT INTO fee_categories (id, name, description, is_core, is_active, 
                             default_amount, sort_order, created_at)
SELECT id, name, description, 
       COALESCE(is_core, TRUE),
       COALESCE(is_active, TRUE),
       COALESCE(default_amount, 0),
       COALESCE(sort_order, 99),
       created_at
FROM fee_categories
ON CONFLICT (id) DO NOTHING;

-- fee_amounts ✅
INSERT INTO fee_amounts (id, fee_category_id, class_id, academic_year_id,
                         amount, created_at)
SELECT id, fee_category_id, class_id, academic_year_id, amount, created_at
FROM fee_amounts
ON CONFLICT (id) DO NOTHING;

-- student_fees ✅
INSERT INTO student_fees (id, student_id, fee_category_id, term_id,
                          academic_year_id, amount, paid_amount,
                          is_paid, is_waived, status, created_at)
SELECT id, student_id, fee_category_id, term_id,
       academic_year_id, amount, paid_amount,
       is_paid, is_waived,
       CASE WHEN is_paid THEN 'paid' WHEN is_waived THEN 'waived' ELSE 'pending' END,
       created_at
FROM student_fees
ON CONFLICT (id) DO NOTHING;

-- payments ✅
INSERT INTO payments (id, student_id, amount, receipt_number, payment_date,
                      payment_method, academic_year_id, term_id,
                      recorded_by, notes, created_at)
SELECT id, student_id, amount, receipt_number, payment_date,
       payment_method, academic_year_id, term_id,
       recorded_by, notes, created_at
FROM payments
ON CONFLICT (id) DO NOTHING;

-- payment_allocations ✅
INSERT INTO payment_allocations (id, payment_id, student_fee_id, amount, created_at)
SELECT id, payment_id, student_fee_id, amount, created_at
FROM payment_allocations
ON CONFLICT (id) DO NOTHING;

-- ── STEP 7: Communication ──────────────────────────────────────────

-- announcements ✅
INSERT INTO announcements (id, title, body, target_role, academic_year_id,
                           created_by, created_at)
SELECT id, title, body, target_role, academic_year_id,
       created_by, created_at
FROM announcements
ON CONFLICT (id) DO NOTHING;

-- ── STEP 8: Holiday programme ──────────────────────────────────────

-- session_classes ✅
INSERT INTO session_classes (id, holiday_session_id, class_id, teacher_id, created_at)
SELECT id, holiday_session_id, class_id, teacher_id, created_at
FROM session_classes
ON CONFLICT (id) DO NOTHING;

-- session_subjects ✅
INSERT INTO session_subjects (id, session_class_id, subject_id, created_at)
SELECT id, session_class_id, subject_id, created_at
FROM session_subjects
ON CONFLICT (id) DO NOTHING;

-- session_enrollments ✅
INSERT INTO session_enrollments (id, session_class_id, student_id, 
                                  enrolled_at, created_at)
SELECT id, session_class_id, student_id, enrolled_at, created_at
FROM session_enrollments
ON CONFLICT (id) DO NOTHING;

-- session_teacher_assignments ✅
INSERT INTO session_teacher_assignments (id, session_class_id, teacher_id,
                                          subject_id, created_at)
SELECT id, session_class_id, teacher_id, subject_id, created_at
FROM session_teacher_assignments
ON CONFLICT (id) DO NOTHING;

-- session_assessments ✅
INSERT INTO session_assessments (id, session_class_id, session_subject_id,
                                  assessment_name, max_marks, created_at)
SELECT id, session_class_id, session_subject_id,
       assessment_name, max_marks, created_at
FROM session_assessments
ON CONFLICT (id) DO NOTHING;

-- session_marks ✅
INSERT INTO session_marks (id, session_assessment_id, student_id,
                            score, entered_by, created_at)
SELECT id, session_assessment_id, student_id, score, entered_by, created_at
FROM session_marks
ON CONFLICT (id) DO NOTHING;

-- ── STEP 9: Student archive ────────────────────────────────────────
INSERT INTO student_archive (id, student_id, reason, archived_at,
                              academic_year_id, created_at)
SELECT id, student_id, reason, archived_at, academic_year_id, created_at
FROM student_archive
ON CONFLICT (id) DO NOTHING;

-- ── STEP 10: Class enrollments (new v9 table) ──────────────────────
-- Build from students.class_id + current year
INSERT INTO class_enrollments (student_id, class_id, academic_year_id,
                                enrolled_at, is_active)
SELECT s.id, s.class_id, 
       (SELECT id FROM academic_years WHERE is_current = TRUE LIMIT 1),
       COALESCE(s.created_at, NOW()),
       TRUE
FROM students s
WHERE s.class_id IS NOT NULL
  AND s.status = 'Active'
  AND s.is_deleted = FALSE
ON CONFLICT (student_id, class_id, academic_year_id) DO NOTHING;

-- ── STEP 11: Sequence reset (so new inserts don't conflict) ────────
SELECT setval('students_id_seq',       (SELECT MAX(id) FROM students) + 1);
SELECT setval('teachers_id_seq',       (SELECT MAX(id) FROM teachers) + 1);
SELECT setval('classes_id_seq',        (SELECT MAX(id) FROM classes) + 1);
SELECT setval('assessments_id_seq',    (SELECT MAX(id) FROM assessments) + 1);
SELECT setval('marks_id_seq',          (SELECT MAX(id) FROM marks) + 1);
SELECT setval('payments_id_seq',       (SELECT MAX(id) FROM payments) + 1);
SELECT setval('student_fees_id_seq',   (SELECT MAX(id) FROM student_fees) + 1);
SELECT setval('families_id_seq',       (SELECT MAX(id) FROM families) + 1);
SELECT setval('announcements_id_seq',  (SELECT MAX(id) FROM announcements) + 1);
SELECT setval('attendance_id_seq',     COALESCE((SELECT MAX(id) FROM attendance), 0) + 1);

-- ── VERIFICATION ───────────────────────────────────────────────────
SELECT 
    'students'           AS tbl, COUNT(*) AS rows FROM students UNION ALL
SELECT 'teachers',        COUNT(*) FROM teachers UNION ALL
SELECT 'classes',         COUNT(*) FROM classes UNION ALL
SELECT 'assessments',     COUNT(*) FROM assessments UNION ALL
SELECT 'marks',           COUNT(*) FROM marks UNION ALL
SELECT 'attendance',      COUNT(*) FROM attendance UNION ALL
SELECT 'payments',        COUNT(*) FROM payments UNION ALL
SELECT 'student_fees',    COUNT(*) FROM student_fees UNION ALL
SELECT 'families',        COUNT(*) FROM families UNION ALL
SELECT 'announcements',   COUNT(*) FROM announcements
ORDER BY tbl;
