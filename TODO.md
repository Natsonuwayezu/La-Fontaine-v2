# ECOLE LA FONTAINE v2 — TODO
Last updated: 2026-08-31

---

## 🔴 NATSON ACTIONS (requires your access)

### SQL migrations — run in Supabase SQL Editor in order:
- [ ] Run docs/sql/007_holiday_sessions.sql
- [ ] Run docs/sql/008_qr_snapshots.sql
- [ ] Run docs/sql/009_second_sitting.sql

### Auth phases (already coded, SQL only):
- [ ] Run docs/sql/002_tighten_delete_protection.sql
- [ ] Run docs/sql/003_hash_passwords.sql — then test login as every role
- [ ] Run docs/sql/005_server_side_lockout.sql
- [ ] Google OAuth Phase 5: set up Google Cloud Console + Supabase Auth,
      then run docs/sql/006_google_oauth_login.sql

### Urgent verification:
- [ ] Confirm admin login works — school_settings must have row with key='admin_password'

---

## 🟠 CODE REMAINING

### Registration form (enroll-student.js)
- [ ] Align form fields with real students table columns
- [ ] Wire guardians + student_guardians tables (262 rows in DB)
      instead of flat guardian_name/phone/email on students row
- [ ] Fee assignment to use real fee_categories correctly

### Fee categories (fee-categories.js)
- [ ] Add is_core toggle (second sitting eligible)
- [ ] Add default_amount for holiday fee auto-assignment
- [ ] Link to fee-approvals workflow

### Family management (family-management.js)
- [ ] Bug: references families.parent_name + sibling_discount_pct (do not exist)
      Real columns: family_code, total_children, active_children, notes
- [ ] Redesign around discount_rules table + auto_apply_family_discounts() function

### QR wiring
- [ ] createReportCardSnapshot() called from report-cards.js print button
- [ ] createReceiptSnapshot() called from record-payment.js
- [ ] Test full flow: print, scan, qr-verify.html, frozen PDF auto-downloads

### Assessment lock
- [ ] Auto-lock 7 days after assessment date
- [ ] On term completed: lock all + create snapshots + notify admin

### Auth
- [ ] Phase 6 WebAuthn: real fingerprint/Face ID (current is fake localStorage flag)
- [ ] Phase 7 Self-registration: pending_registrations + admin approval flow

---

## 🟡 BACKEND SUBSYSTEMS NOT YET WIRED (in tables.json, not used by JS)

- [ ] Holiday fee-approval: fee_approval_requests, apply_session_fee_to_class()
- [ ] Family auto-detection: auto_create_families_from_guardians()
- [ ] Promotion batch history: promotion_batches, student_promotion_records
- [ ] Teachers extra columns: department, hire_date, qualification, profile_photo

---

## 🟢 DOCUMENTATION

- [ ] Update PROJECT_TREE.md
- [ ] Update README.md
- [ ] Update docs/database-schema.md (after 007-009 run)

---

## ✅ COMPLETED THIS SESSION

- [x] Login — app hidden on load, shows only after auth
- [x] Holiday system: enrollment, marks, fees, reports, rankings, auto-switch
- [x] Holiday CSS theme: amber, sidebar indicator, mode banner
- [x] Sidebar: real year/term/session selector, holiday nav swap, TopbarPeriod removed
- [x] Fee approvals: full workflow, auto-approve, reject, bulk approve, audit log
- [x] Annual report cards: matches PDF exactly with 2nd sitting column
- [x] Second sitting: uses real second_sitting_students + second_sitting_marks tables
- [x] Student promotion: first + final decisions, saves to student_promotion_decisions
- [x] Class teacher access: getMyClass(), canAccessClass(), getAccessibleClassIds()
- [x] Historical roster: getHistoricalRoster() fixes 22-21 student count problem
- [x] Data integrity: all DB writes carry year_id, term_id, timestamps, actor
- [x] class_enrollments + student_class_history on every enrollment/class change
- [x] SQL migrations 007-009 in docs/sql/
- [x] system_logs via logAction(), notifications with correct columns
- [x] payments amount fixed, marks fully populated
- [x] 38/38 health checks passing
