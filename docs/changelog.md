# École La Fontaine — Changelog

---

## v9.0.0 — 2026-08-31

Major release. Full holiday programme system, second sitting, annual report cards
matching PDF template, data integrity overhaul, class teacher access control.

### New Features

**Holiday Programme (complete system)**
- Holiday sessions with unique IDs — different sessions never mix
- Holiday enrollment: students into session classes with fee assignment and discount support
- Holiday marks entry and register: session-aware, marks tagged with holiday_session_id
- Holiday report cards: pre-midterm format, session-specific subjects and teachers
- Holiday rankings: within each holiday class, tie-aware, medal display for top 3
- Holiday fees: separate holiday_fees table (not student_fees), session fee configuration,
  per-class fee overrides, auto-assign to enrolled students, partial payment support
- Holiday mode: two-mode state machine (NORMAL / HOLIDAY). Auto-switches by date.
  Manual hard-switch by admin. Sidebar is single source of truth. Amber CSS theme.
- Fee approval workflow: all enrollment and holiday fees go through approval queue.
  Auto-approve if already paid. Reject deletes the fee. Bulk approve. Audit log.

**Second Sitting**
- Marks entry using real second_sitting_students and second_sitting_marks tables
- Auto-register via auto_register_second_sitting_students Supabase RPC
- Core subjects only (subjects.is_core flag)
- Score as percentage (0-100), not raw marks
- Annual average unchanged — 2nd sitting shown in separate column only
- Available only after Term 3 status = completed

**Annual Report Cards**
- Matches Rwanda Ministry of Education PDF format exactly
- Columns: TS | EX | TOT | GR per term × 3 terms + Annual TOT | MAX | % | GR + 2nd Sitting %
- Annual % fixed — never recalculated after second sitting
- FIRST DECISION checkboxes (6 options) and FINAL DECISION checkboxes (5 options)
- First decision auto-seeded from annual % vs promotion_mark threshold
- Decisions saved to student_promotion_decisions table

**Student Promotion**
- First Decision + Final Decision per student
- Final Decision enabled only when First = 2nd Sitting
- Saves to student_promotion_decisions with all context

**Class Teacher Access Control**
- getMyClass() — finds class where class_teacher_id matches current user
- canAccessClass(classId) — enforced in marks-entry, class-register, report-cards,
  rankings, second-sitting, student-promotion, holiday marks/reports/rankings
- getAccessibleClassIds() — returns allowed class IDs for current user

**Historical Roster**
- getHistoricalRoster(classId, termId, yearId) — uses class_enrollments for accuracy
- Fixes the 22→21 student count problem across all modules
- Falls back to students.class_id if no enrollment records exist

**Data Integrity**
- Every marks insert/update: academic_year_id, term_id, entered_by_name, updated_at
- Every payment insert: amount (not total_amount), academic_year_id, term_id, recorded_by_name
- Every student_fees insert: fee_category_id, amount, term_id, due_date
- Every grading_scale insert: academic_year_id
- Every assessments insert: academic_year_id
- class_enrollments row created on every new enrollment and class change
- student_class_history row created on every enrollment and class change
- All system_logs writes via logAction() with correct schema columns
- All notifications via sendNotification() with correct schema columns

### New Files
- js/modules/holidays/holidays-enrollment.js
- js/modules/holidays/holidays-marks.js (rewritten)
- js/modules/holidays/holidays-fees.js (rewritten)
- js/modules/holidays/holidays-reports.js
- js/modules/holidays/holidays-rankings.js
- js/modules/finance/fee-approvals.js
- js/modules/academics/second-sitting.js
- js/modules/academics/report-cards.js (rewritten)
- css/themes/holiday.css
- docs/sql/007_holiday_sessions.sql
- docs/sql/008_qr_snapshots.sql
- docs/sql/009_second_sitting.sql

### Modified Files
- js/core/state.js — getMyClass, canAccessClass, getAccessibleClassIds, getHistoricalRoster,
  getTermById, getSessionSubjectsForClass, getRosterForClassAndYear, full holiday state
- js/core/boot.js — boot loader wiring, auto-holiday-switch polling every 10 min
- js/core/data-loader.js — loadDataForHolidaySession, session-aware _loadHolidayData
- js/ui/sidebar.js — real state-driven year/term/session selector, holiday nav swap,
  sidebarSelectYear/Term/Session, _getFilteredSections, YEAR_TERM_DATA mock removed
- js/ui/topbar.js — TopbarPeriod removed (sidebar handles all period switching)
- js/config/navigation.js — all holiday and second-sitting routes added
- js/core/router.js — all holiday and second-sitting routes added
- js/modules/academics/marks-entry.js — full column payloads, historical roster
- js/modules/students/enroll-student.js — class_enrollments, student_class_history,
  full payment payload, discount and approval logic for fees
- js/modules/students/student-profile.js — amount (not total_amount), updated_at
- js/modules/students/student-promotion.js — first+final decisions, student_promotion_decisions
- js/modules/finance/record-payment.js — amount, academic_year_id, term_id
- js/modules/finance/fee-assignments.js — fee_category_id, amount, term_id, due_date
- js/modules/settings/grading-scale.js — academic_year_id on every save
- js/core/notifications-engine.js — correct column names (recipient_id, academic_year_id)
- js/core/boot.js — system_logs via logAction(), notifications with correct columns

### SQL Migrations
- 001: RLS baseline, login_check RPC, delete protection
- 002: Tightened delete protection gaps
- 003: bcrypt password hashing
- 004: Fixed conflicting RLS policies
- 005: Server-side login lockout (5 attempts / 15 min)
- 006: Google OAuth login via oauth_login_check RPC
- 007: Holiday sessions system
- 008: QR verification snapshots
- 009: Second sitting tables, student_promotion_decisions, is_core on subjects

### Bug Fixes
- Fixed: confirmOverlay showing before login (removed dead HTML)
- Fixed: #app visible before auth resolves (display:none on load)
- Fixed: window.Router.navigate calls (all replaced with navigateTo())
- Fixed: showConfirmDialog (all replaced with confirmDialog())
- Fixed: marks-entry using mock CLASS_OPTIONS (now reads from state.classes)
- Fixed: duplicate window.XXX bridges (cleaned in wiring audit)
- Fixed: total_amount in payment payloads (should be amount)
- Fixed: state.studentFees referenced in holiday enrollment (should be state.holidayFees)
- Fixed: YEAR_TERM_DATA mock in sidebar (replaced with real state)
- Fixed: state.currentYear string comparison (now uses YearId integers)
- Fixed: TopbarPeriod conflict with sidebar period selector (TopbarPeriod removed)

---

## v8.x — 2026-Q1/Q2

- Auth hardening phases 1-6 (RLS, bcrypt, lockout, Google OAuth)
- Service worker cache improvements
- Mobile layout optimizations
- Marks database with unlock workflow
- Fee carry-forward module
- Student archive and restore
- Teacher performance tracking
- Timetable conflict detection

---

## v7.x — 2025-Q3/Q4

- Multi-year academic support
- Class-level timetable management
- Attendance analytics
- Financial reports module
- Family fee summaries
- Payment reversals

---

## v6.x — 2025-Q1/Q2

- Rankings engine
- Class register export (Excel/PDF)
- Fee waivers with audit trail
- Credit balance management
- Reminders system
- Analytics dashboard

---

## v5.x — 2024-Q3/Q4

- Assessment phase system (pre_midterm / post_midterm)
- Grade scale configuration
- Bulk student operations
- Communication module (announcements, notifications)
- Help center

---

## v1.0–v4.x — 2023-2024

- Initial PWA shell and service worker
- Supabase integration
- Student enrollment wizard
- Marks entry and basic report cards
- Fee assignment and payment recording
- Teacher dashboard
- Admin dashboard
- Print engine for receipts and reports
