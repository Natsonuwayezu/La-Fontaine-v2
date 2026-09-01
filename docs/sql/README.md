# docs/sql/ — Database Migrations

SQL migrations for École La Fontaine v9.0.
Run in Supabase SQL Editor in order, top to bottom.
Each file is idempotent where practical — safe to re-run.
Check for errors after each file before moving to the next.

---

## Run Order

| # | File | What it does | Status |
|---|---|---|---|
| 001 | `001_enable_rls_baseline.sql` | Enables Row Level Security on all 43 tables. Creates `login_check(email, password)` RPC for secure server-side authentication. Adds hard-delete protection on marks, payments, system_logs, verifications, snapshots. | Run |
| 002 | `002_tighten_delete_protection.sql` | Removes overly-broad `anon_all_<table>` policies that bypassed delete protection on several tables. Adds protection to verifications and snapshot tables. Fixes live policy conflicts found in `pg_policies` audit. | Run |
| 003 | `003_hash_passwords.sql` | Adds bcrypt password hashing via DB trigger on `school_settings`. One-time migration converts any existing plaintext password rows to hashes. Updates `login_check()` to compare input against bcrypt hash using `pgcrypto`. | Run |
| 004 | `004_fix_unexplained_policies.sql` | Removes conflicting and duplicate RLS policies discovered during live audit of `pg_policies`. Replaces with clean, non-overlapping policies. | Run |
| 005 | `005_server_side_lockout.sql` | Adds login lockout inside `login_check()`: 5 failed attempts per 15 minutes triggers a lockout period. Creates `login_attempts` table (no anon access, no user-readable). Auto-clears expired lockout records. | Run |
| 006 | `006_google_oauth_login.sql` | Creates `oauth_login_check(email TEXT)` RPC for Google Sign-In. Matches Google-verified email to a teacher record in the `teachers` table without exposing or checking passwords. Returns the same session structure as `login_check()`. | Run |
| 007 | `007_holiday_sessions.sql` | Creates the full holiday session system: `holiday_sessions`, `session_classes`, `session_subjects`, `session_teacher_assignments`, `session_assessments`, `fee_approval_log`. Adds `holiday_session_id` FK to `holiday_marks`, `holiday_fees`, `holiday_enrollments`, `holiday_subjects`. Adds `is_approved`, `requires_approval`, `waived_amount`, `source` columns to `student_fees`. Enables RLS on all new tables. | Run |
| 008 | `008_qr_snapshots.sql` | Creates QR verification system: `verifications`, `report_card_snapshots`, `receipt_snapshots`, `transcript_snapshots`. Each snapshot stores a frozen JSON payload and a one-time verification token. Token is embedded in QR code on printed documents. `qr-verify.html` fetches and renders by token. | Run |
| 009 | `009_second_sitting.sql` | Second sitting support: allows `phase = 'second_sitting'` in `assessments.phase` check constraint. Adds `second_sitting_score`, `second_sitting_entered_by`, `second_sitting_entered_at` to `marks`. Creates `student_promotion_decisions` table (first_decision + final_decision per student per academic year). Adds `is_core BOOLEAN DEFAULT TRUE` to `subjects` to flag which subjects count for second sitting. | Run |

---

## tables.json

Full schema export from Supabase. Contains every table's columns, data types,
primary keys, foreign keys, unique constraints, check constraints, and indexes.
Used during development to audit JS insert/update payloads against real column names.
Do not modify manually — regenerate from Supabase if schema changes.

---

## Notes

- Always run in order. Later migrations depend on objects created by earlier ones.
- If a migration partially fails: fix the error, then re-run only the failed file.
  Most statements use `IF NOT EXISTS` and `IF EXISTS` guards.
- After running 007-009: reload the app and verify holiday mode, QR scanning,
  and second sitting entry work correctly.
- The `login_attempts` table (created by 005) has no user-visible UI —
  it is managed entirely by the `login_check()` function.
- Never manually edit `login_check()` or `oauth_login_check()` without understanding
  the auth flow in `js/core/auth.js`.
