# ECOLE LA FONTAINE v2 — MASTER TODO LIST
Last updated: 2026-08-20

---

## AUTH HARDENING ROADMAP (going phase by phase, per Natso's decision)

Google Sign-In only — Apple/iCloud dropped (the $99/year Apple Developer
Program cost wasn't worth it given Natso mainly wants device-unlock via
fingerprint/Face ID/PIN, which doesn't need Apple at all — that's WebAuthn,
a browser API, not tied to either Google or Apple).

- [x] **Phase 1 — Run `docs/sql/001_enable_rls_baseline.sql`** — DONE, confirmed by Natso (2026-08-20)
- [x] **Phase 2 — Wire `auth.js` to actually call `login_check()`** — DONE (2026-08-20)
      doLogin() now calls the real login_check() RPC; password never
      fetched to the browser during login. Also found and fixed a
      regression Phase 1's SQL had silently caused: changePassword()
      called getById('teachers', userId) expecting a .password field
      to compare against — but Phase 1's REVOKE SELECT (password) ...
      FROM anon made that field permanently undefined, so every
      non-admin's self-service password change was broken (old-password
      check always failed) from the moment the SQL was run. Fixed to
      verify via login_check() instead, and to use the new
      validatePasswordStrength() instead of a bare 6-char check.
- [ ] **Phase 3 — Hash passwords** (bcrypt via pgcrypto, inside `login_check()`)
      One-time migration for existing plaintext rows; check with Natso
      before running if anyone might be mid-session (old plaintext won't
      work after).
- [ ] **Phase 4 — Real server-side login lockout**
      New `login_attempts` table, enforced inside `login_check()` itself —
      current lockout lives only in localStorage (auth.js), trivially
      bypassed by clearing storage/incognito/hitting the API directly.
- [ ] **Phase 5 — Google Sign-In**
      Natso: create free Google Cloud project + OAuth consent screen +
      Client ID/Secret, add to Supabase Auth provider settings.
      Then: build the button + account-linking logic (match by email to
      an existing teachers row, or route to Phase 7's approval flow).
- [ ] **Phase 6 — Device unlock via WebAuthn (fingerprint/Face ID/PIN)**
      New `webauthn_credentials` table + challenge/verify functions.
      Rides on the device's own biometric/PIN prompt, no separate
      biometric system to build. Real, standalone piece of work — do
      after Phases 2-4 are solid and tested.
      🔴 URGENT NOTE found while doing Phase 2: the EXISTING "biometric
      login" (auth.js: isBiometricAvailable/enableBiometricLogin/
      tryBiometricLogin/disableBiometricLogin) is not real WebAuthn.
      enableBiometricLogin() just sets a localStorage flag — no
      credential is ever actually registered (no navigator.credentials.
      create() call exists anywhere). tryBiometricLogin() calls
      navigator.credentials.get() with a hardcoded all-zero challenge
      and, if it ever succeeds, doesn't verify WHICH credential/user
      matched — it just restores whatever session was last saved in
      localStorage. On a personal device this mostly just fails
      harmlessly. On a SHARED school device, if any resident credential
      exists for this origin from prior use, this could authenticate as
      the WRONG person with no real per-user check. Needs a decision
      from Natso: disable the "Enable Fingerprint" toggle now as a
      precaution, or leave it until Phase 6 replaces it for real.
- [ ] **Phase 7 — Self-registration + admin approval**
      New `pending_registrations` table + form (name, email, phone, ID
      number, previous school, requested role, password) + admin
      approval page that creates the real teachers row on approval.
      Can run in parallel with Phase 5/6.

---

## EMOJI CLEANUP (project rule: no emojis in the app UI — use Font
Awesome/SVG; canvas/SVG-text rendering contexts are the only exception)

46 of ~130 instances fixed so far (topbar.js, constants.js, theme.js,
tables.js, modals.js, charts.js, dropdowns.js, cards.js, sidebar.js,
accountant-dashboard.js, fee-term-status.js, enroll-student.js,
fee-approvals.js, record-payment.js, holidays-enrollment.js,
holidays-marks.js, holiday.css). Remaining:

- [ ] `offline.html` (18 instances)
- [ ] `qr-verify.html` (17 instances)
- [ ] `404.html` (14 instances)
- [ ] `js/modules/help/help-data.js` (8 instances)
- [ ] `js/modules/help/help-templates.js` (8 instances)
- [ ] `js/modules/help/help-center.js` (7 instances)
- [ ] `html/partials/help-center.html` (3 instances)

Deliberately left as-is (real exception, not an oversight):
`js/integrations/qrcode.js` + `js/config/constants.js`'s QR badge emoji
— render via Canvas `fillText()` and raw SVG `<text>`, contexts where
Font Awesome's webfont isn't reliably drawable.

Also worth a repo-wide re-sweep once the above is done — the emoji
detection pattern used so far may not cover every Unicode block (e.g.
variation selectors, some regional/flag ranges), so the true remaining
count could be slightly different from what's listed here.

---

## 🔴 DO FIRST (login broken)

- [ ] **Fix index.html — login shows immediately, app shell hidden until auth**
      - Hide #app with display:none on page load via inline style
      - boot.js already calls renderLoginPage() which sets app.innerHTML
      - Remove the confirm-overlay from index.html body (it's handled by modals.js)
      - User must see ONLY the login card on first load, nothing else

---

## 🔴 CRITICAL FIXES (from HOLIDAY_SESSION_LOGIC.md)

- [ ] **`getTermById` and `getSessionSubjectsForClass` — referenced but not defined**
      Add to state.js / utils.js as simple lookups
- [ ] **`calculateStudentRank` vs `calculateStudentRankFull` name mismatch**
      One call site passes 5 args to 2-arg version — always returns rank 0
- [ ] **Chart variables undeclared** (`statsChart`, `monthlyChart`, `methodChart`)
      Declare as `let x = null;` at module scope — else ReferenceError on first use
- [ ] **Enrollment receipt downloaded empty**
      Pass created payment object directly into receipt fn, don't re-fetch from state
- [ ] **Financial dashboards computing "Total Expected" from fee catalog**
      Must use `state.studentFees` filtered by `is_approved !== false`
- [ ] **`state.terms` loaded unfiltered across all years**
      Filter to `academic_year_id == currentYearId` when loading

---

## 🟠 HOLIDAY SYSTEM REDESIGN (complete rebuild per your instructions)

### Architecture
- 2 modes only: NORMAL mode | HOLIDAY mode
- Mode stored in school_settings.holiday_mode_active (all users see same mode)
- Admin can hard-switch via Settings toggle
- Auto-switch: term ends → next day = holiday mode (Term N Holiday)
- Auto-switch back: next term start date → normal mode

### Sidebar (single source of truth — remove topbar period switcher)
- [ ] **Remove TopbarPeriod from topbar.js** completely
- [ ] **Redesign sidebar top section**:
      - Year dropdown (all academic years)
      - In NORMAL mode: Term dropdown (pulls terms from selected year)
      - In HOLIDAY mode: "Term 1 Holiday / Term 2 Holiday / Term 3 Holiday"
        Each holiday term has its own holiday_session_id
- [ ] **Sidebar nav changes dynamically by mode**:
      NORMAL mode nav:           HOLIDAY mode nav:
      - Marks Entry              - Holiday Marks Entry
      - Marks Database           - Holiday Marks Database
      - Class Register           - Holiday Class Register
      - Assessments              - Holiday Assessments
      - Report Cards             - Holiday Reports
      - Rankings                 - Holiday Rankings
      (Finance section stays the same in both modes)
      (Settings, Staff stay the same)
      (Student List always shows real classes, never holiday classes)

### Holiday Session IDs
- [ ] **Each holiday has its own unique ID** (holiday_session_id)
      - "Term 1 Holiday 2025-2026" → id: 1
      - "Term 2 Holiday 2025-2026" → id: 2
      - "Term 3 Holiday 2025-2026" → id: 3
      - "Term 1 Holiday 2026-2027" → id: 4
      - Never mixed — every mark/fee/enrollment/report tagged with this ID
- [ ] **Auto-create holiday session** when term ends:
      - term N ends → create holiday_sessions row for "Term N Holiday YYYY"
      - Link to academic_year_id so they never mix across years

### Holiday Teacher Assignments
- [ ] **session_teacher_assignments with "Copy from last holiday" button**
      - When creating new holiday session, offer to copy assignments from previous holiday
      - Only clear current-year rows when saving (not all-time rows)
      - Tagged with holiday_session_id + academic_year_id

### Holiday Reports
- [ ] **Holiday Report Cards (same format as pre-midterm)**
      - Uses only session_subjects for this holiday class
      - Uses session_teacher_assignments for teacher names
      - Shows rank within holiday class
      - Scores displayed as /100-scaled (18/20 → shows as 90)
      - Tagged with holiday_session_id in snapshot
- [ ] **Holiday Class Register** — grid like normal class register
      - Only enrolled students for that holiday class
      - Columns = assessments for that class/subject/session
- [ ] **Holiday Rankings** — rank within holiday class by overall %

### Auto-switching Rules
- [ ] Term status → 'completed':
      1. Lock all assessments for that term
      2. Create report card snapshots for all students (for QR)
      3. Create notification to admin
      4. Log auto-action
      5. Next day: auto-activate "Term N Holiday" session
      6. school_settings.holiday_mode_active = true
- [ ] Holiday end date reached OR next term start:
      1. Deactivate holiday mode
      2. school_settings.holiday_mode_active = false
      3. Notify admin
      4. Log auto-action

---

## 🟡 LOGGING & NOTIFICATIONS (every action)

### System Logs — write on EVERY action
- [ ] Mark entry: who, class, assessment, student count, avg score, timestamp
- [ ] Fee recorded: who, student, amount, method, receipt number, timestamp
- [ ] Report downloaded/printed: who, student, report type, timestamp
- [ ] CSV exported: who, module, row count, timestamp
- [ ] QR generated: who, document, token, timestamp
- [ ] Auto-save: SYSTEM, table, record count, timestamp
- [ ] Fee auto-applied: SYSTEM, student, fee name, amount, timestamp
- [ ] Mode switch (normal↔holiday): who/SYSTEM, from→to, reason, timestamp
- [ ] Assessment locked/unlocked: who, assessment, timestamp
- [ ] Login/logout: who, timestamp, success/fail
- [ ] Enrollment: who, student, class, fees assigned, timestamp
- [ ] Copy holiday assignments: who, from session, to session, count, timestamp

### Notifications — role-targeted (not broadcast)
- [ ] Admin gets: mode switches, fee approval queue changes, new enrollments,
      system errors, term completion, assessment lock events
- [ ] Teacher gets: their assessment locked/unlocked, marks deadline warning
- [ ] Accountant gets: payment recorded, fee approval needed, new fees assigned
- [ ] Notification row: user_id, title, body, type, is_read, created_at, link

---

## 🟡 MARKS SYSTEM IMPROVEMENTS

- [ ] **Add updated_at to marks table** (via migration)
- [ ] **Marks database view**: show date saved on assessment dropdown
- [ ] **Marks form**: show "Created [date] · Last updated [date]"
- [ ] **Assessment auto-lock: 7 days after assessment date**
      (currently: end of term only — change to also lock 7 days after date)
- [ ] **End of term**: lock ALL assessments → create snapshots → notify admin
- [ ] **Unlock requires admin action** + log + notification

---

## 🟡 FEE SYSTEM IMPROVEMENTS

- [ ] **Verify partial payment → auto-approved** (not just full payment)
- [ ] **Notification to admin when fees enter approval queue**
- [ ] **holidays-fees.js full rewrite** — session-aware, tagged with holiday_session_id
- [ ] **Fee totals everywhere** must filter `is_approved !== false`
      (unapproved fees must not inflate totals in dashboards)

---

## 🟡 DATABASE MIGRATIONS NEEDED

- [ ] Run `supabase-migration-holiday-sessions.sql`
- [ ] Run `supabase-migration-qr-snapshots.sql`
- [ ] Add `academic_year_id` to: marks, assessments, payments,
      student_fees, teacher_assignments, timetable_slots
- [ ] Add `updated_at` to marks table
- [ ] Add `holiday_session_id` to: holiday_marks, holiday_fees,
      holiday_enrollments, holiday_subjects (if not done)
- [ ] Add `is_approved`, `requires_approval`, `source`, `waived_amount`
      to student_fees (if not done)

---

## 🟡 SCORING CONVENTION (from ZIP doc)

- [ ] **All holiday marks displayed as /100-scaled** (18/20 → 90)
      NOT the raw score — consistent with pre-midterm convention
- [ ] **Holiday rank**: compute from all enrolled students in that holiday class
      using /100-scaled percentages — currently hardcoded to `—`
- [ ] **Historical roster**: use `getRosterForClassAndYear(classId, yearId)`
      derives from marks if class_enrollments not populated

---

## 🟡 QR SYSTEM WIRING

- [ ] Wire `createReportCardSnapshot()` into report-cards.js print button
- [ ] Wire `createReceiptSnapshot()` into receipts.js print button  
- [ ] Test: scan QR → correct frozen PDF auto-downloads

---

## 🟢 SECOND SITTING (after above complete)

- [ ] Second sitting marks module
      - Only students who failed in main exam
      - Separate from holiday marks
      - Own report card type

---

## 🟢 DOCUMENTATION (after all features confirmed)

- [ ] Update PROJECT_TREE.md
- [ ] Update README.md  
- [ ] Update docs/database-schema.md
- [ ] Add parseInt radix to remaining parseInt() calls in modules

---

## ✅ COMPLETED

- [x] boot.js crash — hasSupabaseCredentials/testSupabaseConnection/saveSupabaseCredentials
- [x] help-data.js syntax error
- [x] All 16 wiring health checks passing (92 modules, 64 scripts, 47 CSS)
- [x] Holiday phase 1: HOLIDAY_CONFIG, state.js period system, topbar switcher
- [x] Holiday phase 2: enrollment, marks entry/register, fee-approvals, CSS theme
- [x] QR verification system — token-based, auto-download, snapshots
- [x] 14 Kimi audit bugs fixed
- [x] All mock data replaced in dashboards, marks-entry, student modules
- [x] ES module imports removed from help files
- [x] window.Router.navigate → navigateTo everywhere
- [x] showConfirmDialog → confirmDialog in fee-structure.js
- [x] Duplicate showToast removed from dashboards
- [x] window.renderXxx bridges for all 92 MODULE_FILE_MAP IDs
- [x] backend.txt / frontend.txt removed
- [x] index.html CSS + script order fixed (multiple times)
