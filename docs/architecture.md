# École La Fontaine v9.0 — System Architecture

---

## Overview

École La Fontaine is a single-page Progressive Web App (PWA) built with vanilla JavaScript
and Supabase as the backend. There is no build step, no bundler, and no JavaScript framework.
All 161 JS files are loaded via plain `<script>` tags in `index.html`. The app runs
offline-capable on desktop, tablet, and mobile.

---

## Layer Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Browser / PWA                                 │
│  index.html  ─── sw.js (cache-first, offline fallback)               │
│  qr-verify.html (standalone, no shell)                               │
└─────────────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      Config Layer                                    │
│  constants.js   navigation.js   role-permissions.js   supabase-config.js │
└─────────────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────────┐
│                       Core Layer                                     │
│  api.js   auth.js   boot.js   state.js   router.js   data-loader.js │
│  logger.js   notifications-engine.js   validators.js                │
│  verification-engine.js   print-engine.js   export-engine.js        │
└─────────────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────────┐
│                        UI Layer                                      │
│  sidebar.js   topbar.js   shell.js   modals.js   toast.js           │
│  loaders.js   charts.js   tables.js   forms.js   dropdowns.js       │
└─────────────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     Module Layer (86 routes)                         │
│  academics/   attendance/   students/   finance/   holidays/         │
│  staff/   settings/   dashboard/   communication/   analytics/       │
│  bulk/   help/                                                       │
└─────────────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      Supabase Backend                                │
│  PostgreSQL 15 + PostgREST + Auth + Storage                         │
│  43 tables + 9 SQL migrations + RLS on every table                  │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Script Load Order

Scripts are loaded in a strict dependency order in `index.html`:

1. **Config** — `constants.js`, `navigation.js`, `role-permissions.js`, `supabase-config.js`
2. **Core** — `api.js`, `state.js`, `cache.js`, `validators.js`, `formulas.js`,
   `academic-formulas.js`, `finance-formulas.js`, `fees.js`, `logger.js`,
   `notifications-engine.js`, `error-handler.js`, `export-engine.js`,
   `print-engine.js`, `verification-engine.js`, `backup-engine.js`,
   `offline-sync.js`, `sync-engine.js`, `data-loader.js`, `router.js`, `auth.js`
3. **UI** — `shell.js`, `sidebar.js`, `topbar.js`, `modals.js`, `toast.js`,
   `loaders.js`, `charts.js`, `cards.js`, `forms.js`, `tables.js`,
   `dropdowns.js`, `pagination.js`, `empty-states.js`, `context-menu.js`,
   `responsive-ui.js`, `theme.js`
4. **Integrations** — `qrcode.js`, `print.js`, `xlsx.js`
5. **Mobile** — `gestures.js`, `mobile-modals.js`, `mobile-navigation.js`,
   `mobile-tables.js`, `touch-optimizations.js`
6. **Help** — `help-data.js`, `help-templates.js`, `help-search.js`, `help-center.js`
7. **Modules** — all 86 module files (lazy-loaded by router on first navigation)
8. **Boot** — `boot.js`
9. **Main** — `main.js`

---

## Routing

`router.js` contains `MODULE_FILE_MAP` — an object mapping 86 module IDs to file paths.

When `navigateTo(moduleId, params)` is called:
1. Check if module file already loaded (via script tag presence).
2. If not: dynamically inject `<script src="...">`. Wait for load.
3. Call `window.renderXxx(container, params)` where `container = getElementById('moduleContent')`.
4. Update sidebar active state.
5. Update browser URL hash.

Every module file must expose `window.renderModuleName(container, params)` on the global
scope — no ES modules, no `import`/`export`.

---

## State Management

`state.js` holds a single global `state` object with 45 top-level keys.
All modules read from and write to this object directly.

### State shape (key groups)

**User context:**
`currentUser`, `currentModule`

**Academic context:**
`currentAcadYear`, `currentTerm`, `currentPhase`, `selectedYearId`, `selectedTermId`

**Master data:**
`academicYears[]`, `terms[]`, `holidays[]`, `classes[]`, `subjects[]`, `teachers[]`,
`families[]`, `students[]`, `gradingScale[]`, `schoolSettings{}`

**Transactional data:**
`assessments[]`, `marks[]`, `feeCategories[]`, `feeAmounts[]`, `studentFees[]`,
`creditBalances[]`, `payments[]`, `paymentAllocations[]`

**Communication:**
`announcements[]`, `notifications[]`, `activityLogs[]`, `timetableSlots[]`

**Holiday mode:**
`holidaySessions[]`, `activeHolidaySession`, `sessionClasses[]`, `sessionSubjects[]`,
`sessionAssessments[]`, `sessionTeachers[]`, `holidayEnrollments[]`, `holidayMarks[]`,
`holidayFees[]`, `pendingFeeApprovals[]`, `periodMode`

**Roster tracking:**
`classEnrollments[]`, `studentClassHistory[]`

**Promotion:**
`promotionDecisions[]`

### State updates

- `updateState(key, value)` — updates one key, notifies subscribers.
- `updateStateBatch(obj)` — updates multiple keys atomically.
- `invalidateCache(key)` — clears derived caches for related keys.
- `subscribe(key, fn)` — registers a callback for state changes on a key.

---

## Holiday Mode — Two-State Machine

The app operates in exactly two modes:

```
  NORMAL ◄────────────────────────────────► HOLIDAY
  (academic term)                          (holiday session)

  data: classes, marks, student_fees       data: session_classes, holiday_marks,
        assessments, payments                    holiday_fees, session_assessments
```

### Mode transitions

**Manual (admin):** Settings toggle → writes `school_settings.holiday_mode_active`.
All users see new mode within 30 seconds (sync-engine polling).

**Automatic (boot.js):** Every 10 minutes, `_checkAndSwitchMode()` runs:
- Finds `holiday_sessions` where `status='active'` and today within `start_date / end_date`.
- If found and not in holiday mode → `activateHolidayMode(session)`.
- If in holiday mode and session ended → `deactivateHolidayMode()`.
- Both transitions: log to `system_logs` + notify all admins.

### Mode effects

| Area | Normal mode | Holiday mode |
|---|---|---|
| Sidebar nav | Standard academic items | Holiday equivalents swapped |
| Term selector | term_number 1/2/3 | Term 1/2/3 Holiday sessions |
| Marks saved to | `marks` table | `holiday_marks` table |
| Fees saved to | `student_fees` table | `holiday_fees` table |
| Body class | `mode-normal` | `mode-holiday` |
| CSS theme | Default | Amber (holiday.css) |

### resolveTable()

`resolveTable(normalTable, holidayTable)` — returns the correct table for the current mode.
Called before every data write to ensure marks and fees never cross between modes.

---

## Class Teacher Access Control

Every class-level module enforces teacher restrictions:

1. `getMyClass()` — finds the class where `classes.class_teacher_id` equals the current
   teacher's `id`. Returns `null` for admin (admin sees all).
2. `canAccessClass(classId)` — returns `true` if admin, accountant, or teacher's own class.
3. `getAccessibleClassIds()` — returns array of allowed class IDs for the current user.

Modules that enforce this:
- `marks-entry.js`, `class-register.js`, `report-cards.js`, `rankings.js`,
  `second-sitting.js`, `student-promotion.js`, `holidays-marks.js`,
  `holidays-reports.js`, `holidays-rankings.js`.

---

## Historical Roster

Student lists must be accurate for any point in time, not just today.

Problem: A student can join in Term 1 (total = 22), leave in Term 2 (total = 21),
and a different student joins in Term 3 (total = 22). The same class has different
rosters in each term.

Solution: `getHistoricalRoster(classId, termId, yearId)`:
1. Query `classEnrollments` filtered by `class_id + term_id + academic_year_id + is_active = true`.
2. Map enrollment records to student objects.
3. Fall back to `students.class_id` only if no enrollment records exist for that period.

Used by: `report-cards.js`, `class-register.js`, `rankings.js`, `marks-entry.js`,
`attendance-entry.js`, `student-promotion.js`.

---

## Data Integrity

Every DB insert and update includes full context so no record is silently incomplete:

| Field | What it identifies |
|---|---|
| `academic_year_id` | Which year this record belongs to |
| `term_id` | Which term (for marks, fees, payments, attendance) |
| `created_at` | When the record was created |
| `updated_at` | When the record was last modified |
| `entered_by` / `recorded_by` | Which user performed the action (ID) |
| `entered_by_name` / `recorded_by_name` | Human-readable actor name |
| `enrollment_id` | Links mark to the exact class enrollment snapshot |

### class_enrollments

Written on:
- New student enrollment (`enroll-student.js`)
- Class change in student profile (`student-details.js`)
- Holiday enrollment (`holidays-enrollment.js`)

Columns: `student_id`, `class_id`, `academic_year_id`, `term_id`, `enrollment_date`,
`is_active`, `status`, `enrolled_by`, `notes`, `created_at`, `updated_at`.

### student_class_history

Written on:
- New enrollment (reason: `new_enrollment`)
- Class change (reason: `class_change`)
- Transfer out (reason: `transferred`)

Columns: `student_id`, `class_id`, `from_class_id`, `academic_year_id`, `term_id`,
`start_date`, `end_date`, `status`, `reason`, `recorded_by`, `created_at`.

---

## Audit Trail

Every action is logged via `logAction(action, entityType, entityId, details, level)` in
`logger.js`. This writes to `system_logs` with real column names:
- `user_id` — actor from `state.currentUser`
- `action` — string action type (e.g. `marks_entry`, `payment_recorded`, `mode_switch`)
- `entity_type` — table name (e.g. `marks`, `payments`, `students`)
- `entity_id` — primary key of the affected record
- `details` — JSONB with full context (amounts, names, before/after values)

Never use raw `insert('system_logs', {...})` — always `logAction()`.

---

## Notifications

Notifications are role-targeted (not broadcast to all users):

- Admin gets: mode switches, fee approval queue changes, new enrollments, term completions.
- Teacher gets: assessment locked/unlocked for their class, marks deadline warnings.
- Accountant gets: new fees needing approval, payment recorded.

Written via `sendNotification()` or `notifyAdmins()` in `notifications-engine.js`.
Columns: `recipient_id`, `sender_id`, `type`, `title`, `message`, `action_url`,
`is_read`, `category`, `recipient_role`, `academic_year_id`, `term_id`.

---

## QR Code Verification

Printed report cards and receipts carry a QR code that links to a frozen snapshot.

Flow:
1. Print button calls `createReportCardSnapshot(studentId, yearId)` in `verification-engine.js`.
2. Snapshot: serializes all report data to JSON, stores in `report_card_snapshots`.
3. Generates unique one-time token. Embeds token URL in QR code via `qrcode.js`.
4. User scans QR code → opens `qr-verify.html?token=...`.
5. `qr-verify.html` fetches snapshot by token. Auto-downloads frozen PDF.
6. Token marked as used (cannot be reused for tampering).

---

## Offline Strategy

Service worker (`sw.js`) uses cache-first for static assets:
- All CSS, JS, fonts, icons are precached at install.
- App shell is always available offline.
- API calls go network-first with no offline fallback (data requires connection).
- Failed writes are queued to IndexedDB by `offline-sync.js`.
- Queue is replayed when `online` event fires.

---

## Security

- **RLS** — Supabase Row Level Security enabled on all 43 tables. No table is accessible
  without authentication.
- **Login** — `login_check()` RPC on the DB side. Password compared against bcrypt hash.
  Lockout after 5 failed attempts per 15 minutes (tracked in `login_attempts` table).
- **Google OAuth** — `oauth_login_check(email)` RPC verifies Google-authenticated email
  matches a teacher record without exposing password.
- **No anon write** — All write policies require `auth.role() = 'authenticated'`.
- **Delete protection** — Marks, payments, system_logs, snapshots cannot be hard-deleted.
  Soft-delete pattern used (status flags or archival).
- **Session** — Stored in localStorage with TTL. `_touchSession()` refreshes every 5 min.
  `_readSession()` guards against NaN elapsed time.

---

## PWA

- `site.webmanifest` — name, icons, `display: standalone`, `theme_color`.
- Service worker registered in `main.js`.
- Installable on iOS (Add to Home Screen), Android (PWA install prompt), Chrome.
- Offline page: `offline.html` served by service worker when network unavailable.
