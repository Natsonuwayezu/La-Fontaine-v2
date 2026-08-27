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
- [ ] **Phase 2.5 — Run `docs/sql/002_tighten_delete_protection.sql`** *(Natso's action)*
      Found by auditing the LIVE pg_policies output Natso ran after a
      corrected version of 001: leftover broad anon_all_<table> (cmd=ALL)
      policies were undermining the intended no-delete protection on 7
      tables (assessments, attendance, marks, payment_allocations,
      payments, student_credit_balance, student_fees) and the no-insert
      restriction on school_settings — RLS policies are additive, so any
      matching permissive policy grants access regardless of narrower
      ones existing alongside it. Also locks down 4 frozen-document
      tables (verifications, receipt_snapshots, report_card_snapshots,
      transcript_snapshots) that should never be hard-deletable but
      weren't protected at all — confirmed by checking every real call
      site, they're only ever insert()-ed (or, for verifications,
      updated for scan_count) by core/verification-engine.js.
- [ ] **Phase 3 — Run `docs/sql/003_hash_passwords.sql`** *(Natso's action)*
      Real bcrypt hashing via a database trigger — zero app-code
      changes needed, verified against every real password-writing
      call site first (insert/update('teachers', ...) is the only path,
      no matter who calls it). Includes a one-time migration for
      existing plaintext rows. IMPORTANT: after running, actually log
      in as each role (admin/teacher/accountant) before considering
      this done — the file's own verification query only confirms rows
      look hashed, not that login still works.
- [ ] **Phase 4 (SQL file 005) — Run `docs/sql/005_server_side_lockout.sql`** *(Natso's action)*
      Real login lockout enforced inside login_check() itself (5
      attempts/15 minutes, matching auth.js's existing client-side
      numbers exactly) — closes the gap where the current lockout only
      lives in localStorage and is bypassed by clearing storage,
      incognito, or calling the RPC directly. New login_attempts table
      with zero anon policies — only login_check() (SECURITY DEFINER)
      touches it. Verify by deliberately failing a test login 5 times,
      then confirming the 6th attempt fails even with the correct
      password.
- [ ] **Phase 5 — Google Sign-In** — code + SQL written (2026-08-24), needs Natso's external setup before it can work
      Built: "Sign in with Google" button on the login page,
      signInWithGoogle()/handleGoogleRedirect() in auth.js, wired into
      boot.js right before the normal session check, and
      docs/sql/006_google_oauth_login.sql's oauth_login_check()
      function (same security posture as login_check() — never
      exposes the password column, matches by Google-verified email
      only). Also fixed a real bug found while touching this file:
      window.supabaseClient was a one-time snapshot from module load
      that never updated if credentials changed later
      (setSupabaseCredentials()/resetSupabaseCredentials() reassign
      the module-scoped variable, not this property) — replaced with
      a live getter. Nothing currently read the stale one directly,
      but it was exactly the kind of trap Phase 5's own new code could
      have walked into.
      *(Natso's action, required before this can work at all):*
      1. Google Cloud Console: free project + OAuth consent screen +
         Client ID/Secret (no cost, unlike Apple's $99/year)
      2. Supabase Dashboard → Authentication → Providers → Google:
         paste the Client ID/Secret, enable the provider
      3. In the same Google OAuth client, add Supabase's callback URL
         as an authorized redirect URI (exact URL in 006's header)
      Then: run 006, and actually test the full round trip — sign in
      with a Google account whose email matches an existing teacher,
      confirm it logs you in as that person; then try one that doesn't
      match, confirm you get "No account found" cleanly. I can't test
      this end-to-end myself (no way to complete a real Google OAuth
      redirect from here), so this genuinely needs Natso's hands-on
      verification before calling it done.
      Not handled yet, deliberately deferred: what happens when a
      Google email doesn't match anyone currently just shows an error
      message — routing that into Phase 7's registration/approval flow
      instead is real follow-up work once Phase 7 exists.
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
      Can run in parallel with Phase 5/6. Per Natso (2026-08-20): the
      registration form should also be aware of `guardians`/
      `student_guardians` (see the DATABASE TABLES LINKAGE section below)
      — design this together once that analysis happens, not before.

---

## DATABASE TABLES LINKAGE & CLEANUP (do AFTER the auth phases above)

Reviewed `docs/sql/tables.json` (2026-08-23) — real findings below, not
acted on yet per Natso's instruction to finish the auth phases first.

🔴 **Needs Natso to confirm urgently, may already be broken in production:**
`school_settings` has 0 rows in the export. `login_check()` (001/003/004)
requires a row with `key = 'admin_password'` to exist for admin login to
ever succeed. If that row genuinely doesn't exist, admin login has been
failing since Phase 2 shipped. Natso needs to try logging in as admin
and confirm; if it fails, insert the row (see chat for exact SQL).

🔴 **Real bug, not yet fixed:** `family-management.js` (written this
session) references `families.parent_name` and
`families.sibling_discount_pct` — neither column exists on the real
table (real columns: `family_code`, `total_children`, `active_children`,
`notes`). Traced the wrong assumption back to a PRE-EXISTING file,
`family-fee-summary.js`, which has the exact same wrong field
references and is presumably also broken — this predates this
session's work, not introduced by it. The real discount mechanism
turned out to be a proper rules engine (`discount_rules` table:
discount_type/discount_value/target_type/applies_to/conditions jsonb/
priority/max_discount, plus a `auto_apply_family_discounts()` DB
function) that must have been added after those files were written.
Needs a real redesign of the family-discount UI around the rules
engine, not a simple field-rename — deferred to the dedicated
database-linkage pass.

**Big opportunity found:** `guardians` (262 rows) and
`student_guardians` (262 rows) are real, already-populated tables with
a much richer model than the app currently uses — national ID, phone,
email, occupation, employer, full address (province/district/sector/
cell/village), primary/emergency-contact flags. The entire current app
(student-profile.js, enroll-student.js, family-management.js) only
ever reads/writes the flat `guardian_name`/`guardian_phone`/
`guardian_email` text fields directly on the `students` row, never
touching this relational data at all. This is exactly what Phase 7's
registration form should be built against instead of free-text fields.

**Confirmed empty shell tables (reserved names, zero columns defined
yet):** `webauthn_credentials`, `webauthn_challenges`,
`custom_oauth_providers`, `oauth_clients`, `oauth_authorizations`,
`oauth_client_states`, `oauth_consents`. Worth keeping these exact
table names when Phase 6 (WebAuthn) gets designed for real, since
they're already reserved.

**Bigger backend than the app currently uses, not investigated in
depth yet:** a whole holiday-session fee-approval subsystem
(`fee_approval_requests`, `fee_auto_apply_notifications`, `session_fees`,
functions like `apply_session_fee_to_class`/`approve_session_fee`/
`waive_session_fee`/`record_session_fee_payment`), a family
auto-detection system (`auto_create_families_from_guardians`/
`auto_detect_families`/`auto_match_student_to_family`), a second-sitting
exam system (`second_sitting_config`/`second_sitting_marks`/
`second_sitting_students`), and promotion history tables
(`promotion_batches`, `promotion_thresholds`, `student_promotions`,
`student_promotion_records`) — none of which the current JS app reads
from or writes to. Needs its own dedicated investigation pass to figure
out what's finished-but-unwired vs. abandoned vs. still in progress.

**Also found:** `teachers` has several real columns not in any current
view/query — `name` (separate from first_name/last_name), `department`,
`hire_date`, `qualification`, `profile_photo`, `last_login`. Worth
deciding whether `teachers_public` (001) should expose these.

Per Natso (2026-08-20): the following are confirmed intentional
future-feature tables, not stale — don't drop or deprioritize without
discussion: `backups`, `push_subscriptions`, `discount_rules`,
`student_class_history`, `promotions`, `promotion_batches`,
`student_promotions`, `student_promotion_records`, `fee_templates`,
`student_fee_history`, `marks_archive`, `student_archive`.
(`students_old` was confirmed genuinely stale and already removed by
Natso directly.)
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

---

## 🔴 NEXT SESSION (confirmed from review)

### Registration form update
- [ ] **Student enrollment form (enroll-student.js)** — update to match current DB schema
      - Remove fields that don't exist in students table
      - Add fields that are missing but in the DB
      - Review fee assignment section (already has discount/approval logic)
      - Verify all field names match DB column names exactly

### Fee categories page
- [ ] **fee-categories.js** — review and update
      - Ensure is_core flag is usable for second sitting subject selection
      - Add default_amount field for holiday fee auto-assignment
      - Ensure fee_config column on holiday_sessions is accessible
      - Link to fee-approvals workflow

### Other confirmed pending
- [ ] Run supabase-migration-second-sitting.sql in Supabase SQL Editor
- [ ] Run supabase-migration-holiday-sessions.sql
- [ ] Run supabase-migration-qr-snapshots.sql
- [ ] Wire createReportCardSnapshot() into report-cards.js print button (QR code on printed report)
