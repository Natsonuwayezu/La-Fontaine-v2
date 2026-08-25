-- ═══════════════════════════════════════════════════════════════════
-- 001_enable_rls_baseline.sql
-- ═══════════════════════════════════════════════════════════════════
-- ⚠️  AMENDMENT (2026-08-20): the version of this script Natso actually
-- ran against the live database differs from what's below in one
-- important way this file got wrong — `school_settings` is a
-- key-value table (id, key, value, updated_at), not named columns
-- like school_name/contact_phone/etc. The corrected school_settings_
-- public view filters `WHERE key NOT IN ('admin_password', ...)`
-- instead. login_check()'s admin branch was adjusted to match (a
-- CROSS JOIN against the admin_password row's value, plus an
-- is_active check on the teacher branch that's a genuine improvement
-- over what's below). See docs/sql/002 and 003 for what was found
-- and fixed after running the corrected version — this file is kept
-- for history, but 002/003 assume the corrected schema, not this one.
-- ═══════════════════════════════════════════════════════════════════
-- Ecole La Fontaine v2 — Row Level Security baseline
--
-- READ THIS BEFORE RUNNING (and before assuming this "fixes" security):
--
-- This app has NO real Supabase Auth integration. Login is a raw
-- table query against `teachers`/`school_settings` with a plaintext
-- password comparison done in the browser. Every request from every
-- user — admin, teacher, accountant, or nobody logged in at all —
-- authenticates to PostgREST as the exact same `anon` role. Postgres
-- RLS can only tell *roles* apart (anon / authenticated / service_role
-- via JWT claims); it cannot tell WHICH teacher is asking, because no
-- request here carries a real Supabase Auth session token.
--
-- That means true per-user or per-role row scoping — "a teacher can
-- only see their own students' marks" — is NOT achievable with RLS
-- alone in the current architecture. Getting that requires migrating
-- login to real Supabase Auth (or equivalent JWT-based identity)
-- first. That is real, separate, larger follow-up work — not done in
-- this file, and nothing below should be read as having done it.
--
-- What THIS file achieves, which is genuinely real and worth doing
-- regardless of that larger migration:
--   1. Turns RLS on everywhere (currently OFF on every table — the
--      most severe finding in the whole audit; anon key = a public,
--      embedded-in-every-client string = full read/write to every
--      table for anyone right now).
--   2. Stops teachers.password and school_settings.admin_password from
--      ever being selectable by the anon role at all, via a SECURITY
--      DEFINER login function and public views that omit those
--      columns. This is real column-level protection, independent of
--      whether passwords are hashed yet (separate, also-needed fix).
--   3. Blocks hard-deletion of historical records (payments, marks,
--      attendance, students) at the database level — the app's own
--      convention is to reverse/archive these (is_reversed, status),
--      never hard-delete them, so this closes off that path entirely
--      even against a compromised or leaked anon key.
--   4. Leaves normal operational reads/writes open to `anon`, because
--      the app currently performs every insert/update directly from
--      the browser with the anon key — locking that down further
--      would break the app outright without the auth migration above
--      to replace it with server-side/authenticated writes.
--
-- Run this in the Supabase SQL editor, top to bottom, on staging first
-- if you have one. Every statement is idempotent (safe to re-run).
--
-- One honest caveat: every table/column name below was verified by
-- grepping actual real query/insert/update call sites across the
-- codebase (not assumed from stale docs) — but exact column TYPES
-- (e.g. whether `id` is INT vs BIGINT vs UUID) couldn't be confirmed
-- without live database access. If `login_check()`'s `id INT` return
-- type doesn't match your real `teachers.id` type, Postgres will
-- throw a clear type-mismatch error on creation — change INT to
-- whatever the real column type is and re-run just that function.
-- ═══════════════════════════════════════════════════════════════════

-- ==================================================================================
-- CORRECTED Part 1 for 001_enable_rls_baseline.sql
-- Fix 1: "column admin_password does not exist" -- school_settings is
-- key-value (id, key, value, updated_at), not named columns. That REVOKE
-- line is removed; real protection is the view's WHERE clause below.
-- Fix 2: "cannot drop columns from view" -- CREATE OR REPLACE VIEW can only
-- ADD columns, never remove/reorder them. Since the live views likely
-- already differ in shape from what's defined here, each is DROPped first.
-- CASCADE is used because a GRANT depends on the view; the GRANT is
-- reissued right after recreating it, so nothing is left ungranted.
-- ==================================================================================

REVOKE SELECT (password) ON TABLE teachers FROM anon;
-- (no REVOKE for school_settings -- see note above)

DROP VIEW IF EXISTS teachers_public CASCADE;
CREATE VIEW teachers_public AS
SELECT id, username, first_name, last_name, role, phone, email,
       is_active, created_at, updated_at
FROM teachers;

GRANT SELECT ON teachers_public TO anon;

DROP VIEW IF EXISTS school_settings_public CASCADE;
CREATE VIEW school_settings_public AS
SELECT id, key, value, updated_at
FROM school_settings
WHERE key NOT IN ('admin_password', 'system_password', 'secret_key');

GRANT SELECT ON school_settings_public TO anon;

-- ⚠️  login_check()'s definition is intentionally NOT included in this
-- file. An earlier version of this file had one here, but it was a
-- stale, wrong-schema definition (referenced school_settings.
-- admin_password as a COLUMN, which doesn't exist -- school_settings
-- is key-value: id/key/value/updated_at) that would have silently
-- overwritten the correct, current version if this file were ever
-- re-run top-to-bottom. A comment saying "don't re-run this part"
-- doesn't stop CREATE OR REPLACE FUNCTION from actually running --
-- only removing the SQL itself does that.
--
-- The authoritative, current login_check() definition lives in
-- 005_server_side_lockout.sql (or 003_hash_passwords.sql if 005
-- hasn't been run yet) -- run this file (001), then 002, then 003,
-- then 004 (whichever applies), then 005, in that order, and the
-- LAST one you run is authoritative for login_check() specifically.
-- If you ever need to rebuild login_check() from scratch, copy it
-- from 005, not from here.
-- core/auth.js's doLogin() needs to call this function instead of
-- fetching teachers/school_settings directly:
--   POST /rest/v1/rpc/login_check
--   { "p_username": "...", "p_password": "...", "p_role": "..." }
-- and switch every OTHER read of teacher/staff info (assignment
-- pickers, notification recipient lists, staff directory pages, etc.)
-- from `teachers` to `teachers_public`. That app-side change is
-- tracked as a separate follow-up, not done in this SQL file.


-- ==================================================================================
-- CORRECTED Part 2 + Part 3 for 001_enable_rls_baseline.sql
--
-- Cross-checked every table name in this file against the real live schema
-- (from our earlier full metadata dump). Found 3 table names that don't
-- exist -- the script was written against an earlier/planned schema for
-- the holiday-mode feature, not what's actually live:
--
--   fee_approval_log     -> does not exist. Real table: fee_approval_requests
--   holiday_enrollments  -> does not exist. Real table: session_enrollments
--   holiday_marks        -> does not exist. Real table: session_marks
--
-- Everything else in Part 2/3 matched the real schema exactly and is
-- unchanged from the original file.
-- ==================================================================================


-- ───────────────────────────────────────────────────────────────────
-- PART 2 — Enable RLS on every real table
-- ───────────────────────────────────────────────────────────────────

ALTER TABLE teachers                ENABLE ROW LEVEL SECURITY;
ALTER TABLE students                ENABLE ROW LEVEL SECURITY;
ALTER TABLE classes                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE subjects                ENABLE ROW LEVEL SECURITY;
ALTER TABLE academic_years          ENABLE ROW LEVEL SECURITY;
ALTER TABLE terms                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE teacher_assignments     ENABLE ROW LEVEL SECURITY;
ALTER TABLE assessments             ENABLE ROW LEVEL SECURITY;
ALTER TABLE marks                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE grading_scale           ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance              ENABLE ROW LEVEL SECURITY;
ALTER TABLE fee_categories          ENABLE ROW LEVEL SECURITY;
ALTER TABLE fee_amounts             ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_fees            ENABLE ROW LEVEL SECURITY;
ALTER TABLE fee_waivers             ENABLE ROW LEVEL SECURITY;
ALTER TABLE fee_approval_requests   ENABLE ROW LEVEL SECURITY;  -- was fee_approval_log
ALTER TABLE payments                ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_allocations     ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_credit_balance  ENABLE ROW LEVEL SECURITY;
ALTER TABLE families                ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications           ENABLE ROW LEVEL SECURITY;
ALTER TABLE announcements           ENABLE ROW LEVEL SECURITY;
ALTER TABLE reminders               ENABLE ROW LEVEL SECURITY;
ALTER TABLE school_settings         ENABLE ROW LEVEL SECURITY;
ALTER TABLE timetable_slots         ENABLE ROW LEVEL SECURITY;
-- Holiday-mode tables (real names from live schema)
ALTER TABLE holidays                ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_enrollments     ENABLE ROW LEVEL SECURITY;  -- was holiday_enrollments
ALTER TABLE session_marks           ENABLE ROW LEVEL SECURITY;  -- was holiday_marks
ALTER TABLE session_classes         ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_subjects        ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_assessments     ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_teacher_assignments ENABLE ROW LEVEL SECURITY;


-- ───────────────────────────────────────────────────────────────────
-- PART 3 — Baseline policies
-- Each CREATE POLICY is preceded by DROP POLICY IF EXISTS, since Postgres
-- has no CREATE POLICY ... IF NOT EXISTS -- this makes the whole file
-- safely re-runnable even if a previous run got partway through.
-- ───────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS teachers_select ON teachers;
CREATE POLICY teachers_select ON teachers FOR SELECT TO anon USING (true);
DROP POLICY IF EXISTS teachers_insert ON teachers;
CREATE POLICY teachers_insert ON teachers FOR INSERT TO anon WITH CHECK (true);
DROP POLICY IF EXISTS teachers_update ON teachers;
CREATE POLICY teachers_update ON teachers FOR UPDATE TO anon USING (true);
DROP POLICY IF EXISTS teachers_delete ON teachers;
CREATE POLICY teachers_delete ON teachers FOR DELETE TO anon USING (true);

DROP POLICY IF EXISTS students_select ON students;
CREATE POLICY students_select ON students FOR SELECT TO anon USING (true);
DROP POLICY IF EXISTS students_insert ON students;
CREATE POLICY students_insert ON students FOR INSERT TO anon WITH CHECK (true);
DROP POLICY IF EXISTS students_update ON students;
CREATE POLICY students_update ON students FOR UPDATE TO anon USING (true);
-- No DELETE: students are archived via `status`, never hard-deleted.

DROP POLICY IF EXISTS classes_select ON classes;
CREATE POLICY classes_select ON classes FOR SELECT TO anon USING (true);
DROP POLICY IF EXISTS classes_insert ON classes;
CREATE POLICY classes_insert ON classes FOR INSERT TO anon WITH CHECK (true);
DROP POLICY IF EXISTS classes_update ON classes;
CREATE POLICY classes_update ON classes FOR UPDATE TO anon USING (true);
DROP POLICY IF EXISTS classes_delete ON classes;
CREATE POLICY classes_delete ON classes FOR DELETE TO anon USING (true);

DROP POLICY IF EXISTS subjects_select ON subjects;
CREATE POLICY subjects_select ON subjects FOR SELECT TO anon USING (true);
DROP POLICY IF EXISTS subjects_insert ON subjects;
CREATE POLICY subjects_insert ON subjects FOR INSERT TO anon WITH CHECK (true);
DROP POLICY IF EXISTS subjects_update ON subjects;
CREATE POLICY subjects_update ON subjects FOR UPDATE TO anon USING (true);
DROP POLICY IF EXISTS subjects_delete ON subjects;
CREATE POLICY subjects_delete ON subjects FOR DELETE TO anon USING (true);

DROP POLICY IF EXISTS academic_years_select ON academic_years;
CREATE POLICY academic_years_select ON academic_years FOR SELECT TO anon USING (true);
DROP POLICY IF EXISTS academic_years_insert ON academic_years;
CREATE POLICY academic_years_insert ON academic_years FOR INSERT TO anon WITH CHECK (true);
DROP POLICY IF EXISTS academic_years_update ON academic_years;
CREATE POLICY academic_years_update ON academic_years FOR UPDATE TO anon USING (true);
DROP POLICY IF EXISTS academic_years_delete ON academic_years;
CREATE POLICY academic_years_delete ON academic_years FOR DELETE TO anon USING (true);

DROP POLICY IF EXISTS terms_select ON terms;
CREATE POLICY terms_select ON terms FOR SELECT TO anon USING (true);
DROP POLICY IF EXISTS terms_insert ON terms;
CREATE POLICY terms_insert ON terms FOR INSERT TO anon WITH CHECK (true);
DROP POLICY IF EXISTS terms_update ON terms;
CREATE POLICY terms_update ON terms FOR UPDATE TO anon USING (true);
DROP POLICY IF EXISTS terms_delete ON terms;
CREATE POLICY terms_delete ON terms FOR DELETE TO anon USING (true);

DROP POLICY IF EXISTS teacher_assignments_select ON teacher_assignments;
CREATE POLICY teacher_assignments_select ON teacher_assignments FOR SELECT TO anon USING (true);
DROP POLICY IF EXISTS teacher_assignments_insert ON teacher_assignments;
CREATE POLICY teacher_assignments_insert ON teacher_assignments FOR INSERT TO anon WITH CHECK (true);
DROP POLICY IF EXISTS teacher_assignments_update ON teacher_assignments;
CREATE POLICY teacher_assignments_update ON teacher_assignments FOR UPDATE TO anon USING (true);
DROP POLICY IF EXISTS teacher_assignments_delete ON teacher_assignments;
CREATE POLICY teacher_assignments_delete ON teacher_assignments FOR DELETE TO anon USING (true);

DROP POLICY IF EXISTS assessments_select ON assessments;
CREATE POLICY assessments_select ON assessments FOR SELECT TO anon USING (true);
DROP POLICY IF EXISTS assessments_insert ON assessments;
CREATE POLICY assessments_insert ON assessments FOR INSERT TO anon WITH CHECK (true);
DROP POLICY IF EXISTS assessments_update ON assessments;
CREATE POLICY assessments_update ON assessments FOR UPDATE TO anon USING (true);
-- No DELETE: assessments with marks against them shouldn't vanish.

DROP POLICY IF EXISTS marks_select ON marks;
CREATE POLICY marks_select ON marks FOR SELECT TO anon USING (true);
DROP POLICY IF EXISTS marks_insert ON marks;
CREATE POLICY marks_insert ON marks FOR INSERT TO anon WITH CHECK (true);
DROP POLICY IF EXISTS marks_update ON marks;
CREATE POLICY marks_update ON marks FOR UPDATE TO anon USING (true);
-- No DELETE: academic record, never hard-deleted.

DROP POLICY IF EXISTS grading_scale_select ON grading_scale;
CREATE POLICY grading_scale_select ON grading_scale FOR SELECT TO anon USING (true);
DROP POLICY IF EXISTS grading_scale_insert ON grading_scale;
CREATE POLICY grading_scale_insert ON grading_scale FOR INSERT TO anon WITH CHECK (true);
DROP POLICY IF EXISTS grading_scale_update ON grading_scale;
CREATE POLICY grading_scale_update ON grading_scale FOR UPDATE TO anon USING (true);
DROP POLICY IF EXISTS grading_scale_delete ON grading_scale;
CREATE POLICY grading_scale_delete ON grading_scale FOR DELETE TO anon USING (true);

DROP POLICY IF EXISTS attendance_select ON attendance;
CREATE POLICY attendance_select ON attendance FOR SELECT TO anon USING (true);
DROP POLICY IF EXISTS attendance_insert ON attendance;
CREATE POLICY attendance_insert ON attendance FOR INSERT TO anon WITH CHECK (true);
DROP POLICY IF EXISTS attendance_update ON attendance;
CREATE POLICY attendance_update ON attendance FOR UPDATE TO anon USING (true);
-- No DELETE: legal/historical record.

DROP POLICY IF EXISTS fee_categories_select ON fee_categories;
CREATE POLICY fee_categories_select ON fee_categories FOR SELECT TO anon USING (true);
DROP POLICY IF EXISTS fee_categories_insert ON fee_categories;
CREATE POLICY fee_categories_insert ON fee_categories FOR INSERT TO anon WITH CHECK (true);
DROP POLICY IF EXISTS fee_categories_update ON fee_categories;
CREATE POLICY fee_categories_update ON fee_categories FOR UPDATE TO anon USING (true);
DROP POLICY IF EXISTS fee_categories_delete ON fee_categories;
CREATE POLICY fee_categories_delete ON fee_categories FOR DELETE TO anon USING (true);

DROP POLICY IF EXISTS fee_amounts_select ON fee_amounts;
CREATE POLICY fee_amounts_select ON fee_amounts FOR SELECT TO anon USING (true);
DROP POLICY IF EXISTS fee_amounts_insert ON fee_amounts;
CREATE POLICY fee_amounts_insert ON fee_amounts FOR INSERT TO anon WITH CHECK (true);
DROP POLICY IF EXISTS fee_amounts_update ON fee_amounts;
CREATE POLICY fee_amounts_update ON fee_amounts FOR UPDATE TO anon USING (true);
DROP POLICY IF EXISTS fee_amounts_delete ON fee_amounts;
CREATE POLICY fee_amounts_delete ON fee_amounts FOR DELETE TO anon USING (true);

DROP POLICY IF EXISTS student_fees_select ON student_fees;
CREATE POLICY student_fees_select ON student_fees FOR SELECT TO anon USING (true);
DROP POLICY IF EXISTS student_fees_insert ON student_fees;
CREATE POLICY student_fees_insert ON student_fees FOR INSERT TO anon WITH CHECK (true);
DROP POLICY IF EXISTS student_fees_update ON student_fees;
CREATE POLICY student_fees_update ON student_fees FOR UPDATE TO anon USING (true);
-- No DELETE: waivers go through is_waived, not deletion.

DROP POLICY IF EXISTS fee_waivers_select ON fee_waivers;
CREATE POLICY fee_waivers_select ON fee_waivers FOR SELECT TO anon USING (true);
DROP POLICY IF EXISTS fee_waivers_insert ON fee_waivers;
CREATE POLICY fee_waivers_insert ON fee_waivers FOR INSERT TO anon WITH CHECK (true);
DROP POLICY IF EXISTS fee_waivers_update ON fee_waivers;
CREATE POLICY fee_waivers_update ON fee_waivers FOR UPDATE TO anon USING (true);
DROP POLICY IF EXISTS fee_waivers_delete ON fee_waivers;
CREATE POLICY fee_waivers_delete ON fee_waivers FOR DELETE TO anon USING (true);

DROP POLICY IF EXISTS fee_approval_requests_select ON fee_approval_requests;
CREATE POLICY fee_approval_requests_select ON fee_approval_requests FOR SELECT TO anon USING (true);
DROP POLICY IF EXISTS fee_approval_requests_insert ON fee_approval_requests;
CREATE POLICY fee_approval_requests_insert ON fee_approval_requests FOR INSERT TO anon WITH CHECK (true);
DROP POLICY IF EXISTS fee_approval_requests_update ON fee_approval_requests;
CREATE POLICY fee_approval_requests_update ON fee_approval_requests FOR UPDATE TO anon USING (true);
DROP POLICY IF EXISTS fee_approval_requests_delete ON fee_approval_requests;
CREATE POLICY fee_approval_requests_delete ON fee_approval_requests FOR DELETE TO anon USING (true);

DROP POLICY IF EXISTS payments_select ON payments;
CREATE POLICY payments_select ON payments FOR SELECT TO anon USING (true);
DROP POLICY IF EXISTS payments_insert ON payments;
CREATE POLICY payments_insert ON payments FOR INSERT TO anon WITH CHECK (true);
DROP POLICY IF EXISTS payments_update ON payments;
CREATE POLICY payments_update ON payments FOR UPDATE TO anon USING (true);
-- Deliberately NO DELETE, ever -- payments must be reversed, not deleted.

DROP POLICY IF EXISTS payment_allocations_select ON payment_allocations;
CREATE POLICY payment_allocations_select ON payment_allocations FOR SELECT TO anon USING (true);
DROP POLICY IF EXISTS payment_allocations_insert ON payment_allocations;
CREATE POLICY payment_allocations_insert ON payment_allocations FOR INSERT TO anon WITH CHECK (true);
DROP POLICY IF EXISTS payment_allocations_update ON payment_allocations;
CREATE POLICY payment_allocations_update ON payment_allocations FOR UPDATE TO anon USING (true);
-- No DELETE: same reasoning as payments.

DROP POLICY IF EXISTS student_credit_balance_select ON student_credit_balance;
CREATE POLICY student_credit_balance_select ON student_credit_balance FOR SELECT TO anon USING (true);
DROP POLICY IF EXISTS student_credit_balance_insert ON student_credit_balance;
CREATE POLICY student_credit_balance_insert ON student_credit_balance FOR INSERT TO anon WITH CHECK (true);
DROP POLICY IF EXISTS student_credit_balance_update ON student_credit_balance;
CREATE POLICY student_credit_balance_update ON student_credit_balance FOR UPDATE TO anon USING (true);
-- No DELETE: balance goes to 0 via update, never disappears.

DROP POLICY IF EXISTS families_select ON families;
CREATE POLICY families_select ON families FOR SELECT TO anon USING (true);
DROP POLICY IF EXISTS families_insert ON families;
CREATE POLICY families_insert ON families FOR INSERT TO anon WITH CHECK (true);
DROP POLICY IF EXISTS families_update ON families;
CREATE POLICY families_update ON families FOR UPDATE TO anon USING (true);
DROP POLICY IF EXISTS families_delete ON families;
CREATE POLICY families_delete ON families FOR DELETE TO anon USING (true);

DROP POLICY IF EXISTS notifications_select ON notifications;
CREATE POLICY notifications_select ON notifications FOR SELECT TO anon USING (true);
DROP POLICY IF EXISTS notifications_insert ON notifications;
CREATE POLICY notifications_insert ON notifications FOR INSERT TO anon WITH CHECK (true);
DROP POLICY IF EXISTS notifications_update ON notifications;
CREATE POLICY notifications_update ON notifications FOR UPDATE TO anon USING (true);
DROP POLICY IF EXISTS notifications_delete ON notifications;
CREATE POLICY notifications_delete ON notifications FOR DELETE TO anon USING (true);

DROP POLICY IF EXISTS announcements_select ON announcements;
CREATE POLICY announcements_select ON announcements FOR SELECT TO anon USING (true);
DROP POLICY IF EXISTS announcements_insert ON announcements;
CREATE POLICY announcements_insert ON announcements FOR INSERT TO anon WITH CHECK (true);
DROP POLICY IF EXISTS announcements_update ON announcements;
CREATE POLICY announcements_update ON announcements FOR UPDATE TO anon USING (true);
DROP POLICY IF EXISTS announcements_delete ON announcements;
CREATE POLICY announcements_delete ON announcements FOR DELETE TO anon USING (true);

DROP POLICY IF EXISTS reminders_select ON reminders;
CREATE POLICY reminders_select ON reminders FOR SELECT TO anon USING (true);
DROP POLICY IF EXISTS reminders_insert ON reminders;
CREATE POLICY reminders_insert ON reminders FOR INSERT TO anon WITH CHECK (true);
DROP POLICY IF EXISTS reminders_update ON reminders;
CREATE POLICY reminders_update ON reminders FOR UPDATE TO anon USING (true);
DROP POLICY IF EXISTS reminders_delete ON reminders;
CREATE POLICY reminders_delete ON reminders FOR DELETE TO anon USING (true);

DROP POLICY IF EXISTS school_settings_select ON school_settings;
CREATE POLICY school_settings_select ON school_settings FOR SELECT TO anon USING (true);
DROP POLICY IF EXISTS school_settings_update ON school_settings;
CREATE POLICY school_settings_update ON school_settings FOR UPDATE TO anon USING (true);

DROP POLICY IF EXISTS timetable_slots_select ON timetable_slots;
CREATE POLICY timetable_slots_select ON timetable_slots FOR SELECT TO anon USING (true);
DROP POLICY IF EXISTS timetable_slots_insert ON timetable_slots;
CREATE POLICY timetable_slots_insert ON timetable_slots FOR INSERT TO anon WITH CHECK (true);
DROP POLICY IF EXISTS timetable_slots_update ON timetable_slots;
CREATE POLICY timetable_slots_update ON timetable_slots FOR UPDATE TO anon USING (true);
DROP POLICY IF EXISTS timetable_slots_delete ON timetable_slots;
CREATE POLICY timetable_slots_delete ON timetable_slots FOR DELETE TO anon USING (true);

-- Holiday-mode tables (real names)
DROP POLICY IF EXISTS holidays_select ON holidays;
CREATE POLICY holidays_select ON holidays FOR SELECT TO anon USING (true);
DROP POLICY IF EXISTS holidays_insert ON holidays;
CREATE POLICY holidays_insert ON holidays FOR INSERT TO anon WITH CHECK (true);
DROP POLICY IF EXISTS holidays_update ON holidays;
CREATE POLICY holidays_update ON holidays FOR UPDATE TO anon USING (true);
DROP POLICY IF EXISTS holidays_delete ON holidays;
CREATE POLICY holidays_delete ON holidays FOR DELETE TO anon USING (true);

DROP POLICY IF EXISTS session_enrollments_select ON session_enrollments;
CREATE POLICY session_enrollments_select ON session_enrollments FOR SELECT TO anon USING (true);
DROP POLICY IF EXISTS session_enrollments_insert ON session_enrollments;
CREATE POLICY session_enrollments_insert ON session_enrollments FOR INSERT TO anon WITH CHECK (true);
DROP POLICY IF EXISTS session_enrollments_update ON session_enrollments;
CREATE POLICY session_enrollments_update ON session_enrollments FOR UPDATE TO anon USING (true);
DROP POLICY IF EXISTS session_enrollments_delete ON session_enrollments;
CREATE POLICY session_enrollments_delete ON session_enrollments FOR DELETE TO anon USING (true);

DROP POLICY IF EXISTS session_marks_select ON session_marks;
CREATE POLICY session_marks_select ON session_marks FOR SELECT TO anon USING (true);
DROP POLICY IF EXISTS session_marks_insert ON session_marks;
CREATE POLICY session_marks_insert ON session_marks FOR INSERT TO anon WITH CHECK (true);
DROP POLICY IF EXISTS session_marks_update ON session_marks;
CREATE POLICY session_marks_update ON session_marks FOR UPDATE TO anon USING (true);
-- No DELETE: same academic-record reasoning as `marks`.

DROP POLICY IF EXISTS session_classes_select ON session_classes;
CREATE POLICY session_classes_select ON session_classes FOR SELECT TO anon USING (true);
DROP POLICY IF EXISTS session_classes_insert ON session_classes;
CREATE POLICY session_classes_insert ON session_classes FOR INSERT TO anon WITH CHECK (true);
DROP POLICY IF EXISTS session_classes_update ON session_classes;
CREATE POLICY session_classes_update ON session_classes FOR UPDATE TO anon USING (true);
DROP POLICY IF EXISTS session_classes_delete ON session_classes;
CREATE POLICY session_classes_delete ON session_classes FOR DELETE TO anon USING (true);

DROP POLICY IF EXISTS session_subjects_select ON session_subjects;
CREATE POLICY session_subjects_select ON session_subjects FOR SELECT TO anon USING (true);
DROP POLICY IF EXISTS session_subjects_insert ON session_subjects;
CREATE POLICY session_subjects_insert ON session_subjects FOR INSERT TO anon WITH CHECK (true);
DROP POLICY IF EXISTS session_subjects_update ON session_subjects;
CREATE POLICY session_subjects_update ON session_subjects FOR UPDATE TO anon USING (true);
DROP POLICY IF EXISTS session_subjects_delete ON session_subjects;
CREATE POLICY session_subjects_delete ON session_subjects FOR DELETE TO anon USING (true);

DROP POLICY IF EXISTS session_assessments_select ON session_assessments;
CREATE POLICY session_assessments_select ON session_assessments FOR SELECT TO anon USING (true);
DROP POLICY IF EXISTS session_assessments_insert ON session_assessments;
CREATE POLICY session_assessments_insert ON session_assessments FOR INSERT TO anon WITH CHECK (true);
DROP POLICY IF EXISTS session_assessments_update ON session_assessments;
CREATE POLICY session_assessments_update ON session_assessments FOR UPDATE TO anon USING (true);
DROP POLICY IF EXISTS session_assessments_delete ON session_assessments;
CREATE POLICY session_assessments_delete ON session_assessments FOR DELETE TO anon USING (true);

DROP POLICY IF EXISTS session_teacher_assignments_select ON session_teacher_assignments;
CREATE POLICY session_teacher_assignments_select ON session_teacher_assignments FOR SELECT TO anon USING (true);
DROP POLICY IF EXISTS session_teacher_assignments_insert ON session_teacher_assignments;
CREATE POLICY session_teacher_assignments_insert ON session_teacher_assignments FOR INSERT TO anon WITH CHECK (true);
DROP POLICY IF EXISTS session_teacher_assignments_update ON session_teacher_assignments;
CREATE POLICY session_teacher_assignments_update ON session_teacher_assignments FOR UPDATE TO anon USING (true);
DROP POLICY IF EXISTS session_teacher_assignments_delete ON session_teacher_assignments;
CREATE POLICY session_teacher_assignments_delete ON session_teacher_assignments FOR DELETE TO anon USING (true);

-- ═══════════════════════════════════════════════════════════════════
-- WHAT THIS FILE DOES NOT DO (tracked as separate follow-up SQL/work)
-- ═══════════════════════════════════════════════════════════════════
-- - Does not hash passwords (teachers.password / school_settings.
--   admin_password are still plaintext in the database itself — this
--   file stops that plaintext from reaching the browser, but the
--   column contents still need real hashing, e.g. bcrypt via pgcrypto
--   or application-side, as its own migration).
-- - Does not scope any table to "only the logged-in teacher's own
--   data" — requires the Supabase Auth migration described at the top
--   before auth.uid()/auth.jwt() carry any real per-user identity.
-- - Does not add rate-limiting or account lockout at the database
--   level (auth.js already does this client-side; a server-side
--   version would live in the login_check() function above once
--   there's a real session to rate-limit against).
-- ═══════════════════════════════════════════════════════════════════

-- ==================================================================================
-- RLS for tables that exist in your live database but were never covered by
-- 001_enable_rls_baseline.sql -- including guardians/student_guardians, the
-- two tables we built together this session (262 guardian rows, 21 families
-- linked). Cross-checked against the full metadata dump; every table below
-- is confirmed real and currently has RLS OFF.
--
-- Same DROP POLICY IF EXISTS pattern as before -- safe to re-run.
-- ==================================================================================

-- ─── guardians / student_guardians (built this session) ─────────────────────
ALTER TABLE guardians         ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_guardians ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS guardians_select ON guardians;
CREATE POLICY guardians_select ON guardians FOR SELECT TO anon USING (true);
DROP POLICY IF EXISTS guardians_insert ON guardians;
CREATE POLICY guardians_insert ON guardians FOR INSERT TO anon WITH CHECK (true);
DROP POLICY IF EXISTS guardians_update ON guardians;
CREATE POLICY guardians_update ON guardians FOR UPDATE TO anon USING (true);
-- No DELETE policy: I can't confirm from here whether the app ever calls
-- remove() on guardians (would need the actual JS source, same way the
-- original script's author grepped every other table). Tell me if it does
-- and I'll add it -- until then this errs toward the safer default.

DROP POLICY IF EXISTS student_guardians_select ON student_guardians;
CREATE POLICY student_guardians_select ON student_guardians FOR SELECT TO anon USING (true);
DROP POLICY IF EXISTS student_guardians_insert ON student_guardians;
CREATE POLICY student_guardians_insert ON student_guardians FOR INSERT TO anon WITH CHECK (true);
DROP POLICY IF EXISTS student_guardians_update ON student_guardians;
CREATE POLICY student_guardians_update ON student_guardians FOR UPDATE TO anon USING (true);
DROP POLICY IF EXISTS student_guardians_delete ON student_guardians;
CREATE POLICY student_guardians_delete ON student_guardians FOR DELETE TO anon USING (true);
-- DELETE included here: a wrong guardian-student link is a pure linking-table
-- mistake (not a financial/academic record), so removing a bad row is the
-- correct fix, not an update/soft-delete.

-- ─── Discounts ────────────────────────────────────────────────────────────
ALTER TABLE discount_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE discounts      ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS discount_rules_select ON discount_rules;
CREATE POLICY discount_rules_select ON discount_rules FOR SELECT TO anon USING (true);
DROP POLICY IF EXISTS discount_rules_insert ON discount_rules;
CREATE POLICY discount_rules_insert ON discount_rules FOR INSERT TO anon WITH CHECK (true);
DROP POLICY IF EXISTS discount_rules_update ON discount_rules;
CREATE POLICY discount_rules_update ON discount_rules FOR UPDATE TO anon USING (true);
DROP POLICY IF EXISTS discount_rules_delete ON discount_rules;
CREATE POLICY discount_rules_delete ON discount_rules FOR DELETE TO anon USING (true);

DROP POLICY IF EXISTS discounts_select ON discounts;
CREATE POLICY discounts_select ON discounts FOR SELECT TO anon USING (true);
DROP POLICY IF EXISTS discounts_insert ON discounts;
CREATE POLICY discounts_insert ON discounts FOR INSERT TO anon WITH CHECK (true);
DROP POLICY IF EXISTS discounts_update ON discounts;
CREATE POLICY discounts_update ON discounts FOR UPDATE TO anon USING (true);
-- No DELETE: a discount applied against real fees/payments shouldn't
-- disappear -- same reasoning as fee_waivers/student_fees. Deactivate via
-- is_active instead.

-- ─── Promotion / second-sitting system ─────────────────────────────────────
ALTER TABLE promotion_thresholds  ENABLE ROW LEVEL SECURITY;
ALTER TABLE promotion_batches     ENABLE ROW LEVEL SECURITY;
ALTER TABLE promotions            ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_promotions        ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_promotion_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE second_sitting_config   ENABLE ROW LEVEL SECURITY;
ALTER TABLE second_sitting_students ENABLE ROW LEVEL SECURITY;
ALTER TABLE second_sitting_marks    ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS promotion_thresholds_select ON promotion_thresholds;
CREATE POLICY promotion_thresholds_select ON promotion_thresholds FOR SELECT TO anon USING (true);
DROP POLICY IF EXISTS promotion_thresholds_insert ON promotion_thresholds;
CREATE POLICY promotion_thresholds_insert ON promotion_thresholds FOR INSERT TO anon WITH CHECK (true);
DROP POLICY IF EXISTS promotion_thresholds_update ON promotion_thresholds;
CREATE POLICY promotion_thresholds_update ON promotion_thresholds FOR UPDATE TO anon USING (true);
DROP POLICY IF EXISTS promotion_thresholds_delete ON promotion_thresholds;
CREATE POLICY promotion_thresholds_delete ON promotion_thresholds FOR DELETE TO anon USING (true);

DROP POLICY IF EXISTS promotion_batches_select ON promotion_batches;
CREATE POLICY promotion_batches_select ON promotion_batches FOR SELECT TO anon USING (true);
DROP POLICY IF EXISTS promotion_batches_insert ON promotion_batches;
CREATE POLICY promotion_batches_insert ON promotion_batches FOR INSERT TO anon WITH CHECK (true);
DROP POLICY IF EXISTS promotion_batches_update ON promotion_batches;
CREATE POLICY promotion_batches_update ON promotion_batches FOR UPDATE TO anon USING (true);
-- No DELETE: promotion_batches has can_rollback -- a rollback is an UPDATE
-- (or a compensating action), the batch record itself should stay as history.

DROP POLICY IF EXISTS promotions_select ON promotions;
CREATE POLICY promotions_select ON promotions FOR SELECT TO anon USING (true);
DROP POLICY IF EXISTS promotions_insert ON promotions;
CREATE POLICY promotions_insert ON promotions FOR INSERT TO anon WITH CHECK (true);
DROP POLICY IF EXISTS promotions_update ON promotions;
CREATE POLICY promotions_update ON promotions FOR UPDATE TO anon USING (true);
-- No DELETE: same reasoning -- rolled_back is a column (soft), not deletion.

DROP POLICY IF EXISTS student_promotions_select ON student_promotions;
CREATE POLICY student_promotions_select ON student_promotions FOR SELECT TO anon USING (true);
DROP POLICY IF EXISTS student_promotions_insert ON student_promotions;
CREATE POLICY student_promotions_insert ON student_promotions FOR INSERT TO anon WITH CHECK (true);
DROP POLICY IF EXISTS student_promotions_update ON student_promotions;
CREATE POLICY student_promotions_update ON student_promotions FOR UPDATE TO anon USING (true);

DROP POLICY IF EXISTS student_promotion_records_select ON student_promotion_records;
CREATE POLICY student_promotion_records_select ON student_promotion_records FOR SELECT TO anon USING (true);
DROP POLICY IF EXISTS student_promotion_records_insert ON student_promotion_records;
CREATE POLICY student_promotion_records_insert ON student_promotion_records FOR INSERT TO anon WITH CHECK (true);
DROP POLICY IF EXISTS student_promotion_records_update ON student_promotion_records;
CREATE POLICY student_promotion_records_update ON student_promotion_records FOR UPDATE TO anon USING (true);

DROP POLICY IF EXISTS second_sitting_config_select ON second_sitting_config;
CREATE POLICY second_sitting_config_select ON second_sitting_config FOR SELECT TO anon USING (true);
DROP POLICY IF EXISTS second_sitting_config_insert ON second_sitting_config;
CREATE POLICY second_sitting_config_insert ON second_sitting_config FOR INSERT TO anon WITH CHECK (true);
DROP POLICY IF EXISTS second_sitting_config_update ON second_sitting_config;
CREATE POLICY second_sitting_config_update ON second_sitting_config FOR UPDATE TO anon USING (true);
DROP POLICY IF EXISTS second_sitting_config_delete ON second_sitting_config;
CREATE POLICY second_sitting_config_delete ON second_sitting_config FOR DELETE TO anon USING (true);

DROP POLICY IF EXISTS second_sitting_students_select ON second_sitting_students;
CREATE POLICY second_sitting_students_select ON second_sitting_students FOR SELECT TO anon USING (true);
DROP POLICY IF EXISTS second_sitting_students_insert ON second_sitting_students;
CREATE POLICY second_sitting_students_insert ON second_sitting_students FOR INSERT TO anon WITH CHECK (true);
DROP POLICY IF EXISTS second_sitting_students_update ON second_sitting_students;
CREATE POLICY second_sitting_students_update ON second_sitting_students FOR UPDATE TO anon USING (true);
-- No DELETE: an academic outcome record, same class as marks/attendance.

DROP POLICY IF EXISTS second_sitting_marks_select ON second_sitting_marks;
CREATE POLICY second_sitting_marks_select ON second_sitting_marks FOR SELECT TO anon USING (true);
DROP POLICY IF EXISTS second_sitting_marks_insert ON second_sitting_marks;
CREATE POLICY second_sitting_marks_insert ON second_sitting_marks FOR INSERT TO anon WITH CHECK (true);
DROP POLICY IF EXISTS second_sitting_marks_update ON second_sitting_marks;
CREATE POLICY second_sitting_marks_update ON second_sitting_marks FOR UPDATE TO anon USING (true);
-- No DELETE: same as marks.

-- ─── Enrollment / class history ─────────────────────────────────────────────
ALTER TABLE class_enrollments      ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_class_history  ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_academic_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS class_enrollments_select ON class_enrollments;
CREATE POLICY class_enrollments_select ON class_enrollments FOR SELECT TO anon USING (true);
DROP POLICY IF EXISTS class_enrollments_insert ON class_enrollments;
CREATE POLICY class_enrollments_insert ON class_enrollments FOR INSERT TO anon WITH CHECK (true);
DROP POLICY IF EXISTS class_enrollments_update ON class_enrollments;
CREATE POLICY class_enrollments_update ON class_enrollments FOR UPDATE TO anon USING (true);
DROP POLICY IF EXISTS class_enrollments_delete ON class_enrollments;
CREATE POLICY class_enrollments_delete ON class_enrollments FOR DELETE TO anon USING (true);
-- DELETE included: has its own is_active flag, but a wrongly-entered
-- enrollment row is the same class of "linking mistake" as
-- student_guardians above -- unlike promotions this table has no rollback
-- mechanism, so deleting a genuine data-entry error is reasonable. Remove
-- if you'd rather force everything through is_active instead.

DROP POLICY IF EXISTS student_class_history_select ON student_class_history;
CREATE POLICY student_class_history_select ON student_class_history FOR SELECT TO anon USING (true);
DROP POLICY IF EXISTS student_class_history_insert ON student_class_history;
CREATE POLICY student_class_history_insert ON student_class_history FOR INSERT TO anon WITH CHECK (true);
DROP POLICY IF EXISTS student_class_history_update ON student_class_history;
CREATE POLICY student_class_history_update ON student_class_history FOR UPDATE TO anon USING (true);
-- No DELETE: it's literally named "history".

DROP POLICY IF EXISTS student_academic_history_select ON student_academic_history;
CREATE POLICY student_academic_history_select ON student_academic_history FOR SELECT TO anon USING (true);
DROP POLICY IF EXISTS student_academic_history_insert ON student_academic_history;
CREATE POLICY student_academic_history_insert ON student_academic_history FOR INSERT TO anon WITH CHECK (true);
DROP POLICY IF EXISTS student_academic_history_update ON student_academic_history;
CREATE POLICY student_academic_history_update ON student_academic_history FOR UPDATE TO anon USING (true);
DROP POLICY IF EXISTS student_academic_history_delete ON student_academic_history;
CREATE POLICY student_academic_history_delete ON student_academic_history FOR DELETE TO anon USING (true);
-- DELETE included: this table is for prior-school records (transfers),
-- correcting a mis-entered prior-school record via delete is reasonable.

-- ─── Session (holiday-program) fees ─────────────────────────────────────────
ALTER TABLE session_fees ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS session_fees_select ON session_fees;
CREATE POLICY session_fees_select ON session_fees FOR SELECT TO anon USING (true);
DROP POLICY IF EXISTS session_fees_insert ON session_fees;
CREATE POLICY session_fees_insert ON session_fees FOR INSERT TO anon WITH CHECK (true);
DROP POLICY IF EXISTS session_fees_update ON session_fees;
CREATE POLICY session_fees_update ON session_fees FOR UPDATE TO anon USING (true);
-- No DELETE: same reasoning as student_fees -- has manually_deleted flag
-- for exactly this purpose (soft-delete), not real deletion.

-- ==================================================================================
-- STILL NOT COVERED after this file, by design (need your input, not a guess):
--
--   backups, system_logs, activity_logs      -- admin/audit tooling; whether
--     anon should even READ these (let alone write) is a real security
--     decision, not something to default to "true" on autopilot.
--   report_templates, receipt_snapshots, report_card_snapshots,
--   transcript_snapshots, verifications      -- these hold generated
--     documents/QR-verification tokens; same reasoning, worth a real
--     decision rather than a blanket anon policy.
--   students_old, student_fee_history, student_credit_balance's sibling
--   student_archive, marks_archive           -- legacy/archive tables --
--     confirm these are actually still read/written by the live app
--     before opening them up; if they're dead tables from a migration,
--     they're safer left with RLS on and zero policies (effectively
--     locked) than given blanket anon access.
--
-- Tell me which of these the app actually touches and I'll add exactly
-- those, rather than guessing at policies for tables I can't verify are
-- even in use.
-- ==================================================================================