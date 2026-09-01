# École La Fontaine v9.0 — Complete Project Tree

Every file in the repository. No omissions.
Last updated: 2026-08-31 · v9.0.0 · 161 JS files · 52 CSS files · 86 routes · ~60,000 lines

---

## Root Files

| File | Purpose |
|---|---|
| `index.html` | Single-page app shell. Contains sidebar, topbar, module container, modal overlay, toast container. `#app` hidden on load until auth resolves. All 161 module scripts loaded here. |
| `offline.html` | PWA offline fallback. Shown by service worker when network unavailable. |
| `qr-verify.html` | Standalone QR verification page. Reads token from URL, fetches snapshot from Supabase, auto-downloads frozen PDF. Uses Font Awesome for status icons. |
| `404.html` | 404 error page with navigation back to app. |
| `sw.js` | Service worker v9.0.1. Precaches all CSS, JS, fonts, icons. Handles offline fallback. Cache-first strategy for static assets, network-first for API calls. |
| `site.webmanifest` | PWA manifest — app name, icons, theme color, display mode. |
| `README.md` | Project overview, setup guide, tech stack, architecture principles, role matrix, SQL migration status. |
| `TODO.md` | Living task list — current remaining work items. |
| `PROJECT_TREE.md` | This file. Complete file-by-file documentation. |
| `MASTER_AUDIT_PROMPT.md` | AI session prompt used for code auditing sessions. |
| `package.json` | NPM config — jest dependency for tests. |
| `jest.config.js` | Jest test runner configuration. |
| `LICENSE` | MIT license. |

---

## assets/

### assets/fonts/dm-sans/
DM Sans variable font used for all UI body text and interface labels.
- `DMSans-Regular.ttf`
- `DMSans-Medium.ttf`
- `DMSans-Italic.ttf`
- `DMSans-VariableFont_opsz,wght.ttf`
- `DMSans-Italic-VariableFont_opsz,wght.ttf`

### assets/fonts/playfair-display/
Playfair Display serif font used for report card headings and formal document titles.
- `PlayfairDisplay-Regular.ttf`
- `PlayfairDisplay-Bold.ttf`
- `PlayfairDisplay-Italic.ttf`
- `PlayfairDisplay-VariableFont_wght.ttf`
- `PlayfairDisplay-Italic-VariableFont_wght.ttf`

### assets/fonts/plus-jakarta-sans/
Plus Jakarta Sans used for dashboard headings and statistics displays.
- `PlusJakartaSans-Regular.ttf`
- `PlusJakartaSans-Medium.ttf`
- `PlusJakartaSans-SemiBold.ttf`
- `PlusJakartaSans-Bold.ttf`
- `PlusJakartaSans-VariableFont_wght.ttf`
- `PlusJakartaSans-Italic-VariableFont_wght.ttf`

### assets/icons/
- `sprite.svg` — SVG sprite containing 3 school logo icons only. All UI icons use Font Awesome 6 webfont.
- `apple-touch-icon.png` — iOS home screen icon.
- `icon-192.png`, `icon-512.png` — Standard PWA icons.
- `icon-maskable-192.png`, `icon-maskable-512.png` — Maskable adaptive icons.
- `icon-monochrome-96.png` — Monochrome icon for notification badges.
- `icon-manifest.json` — Icon manifest metadata.
- `favicon.ico` — Browser favicon.

### assets/logos/
Full set of school logo icons in all required PWA sizes:
16×16, 32×32, 128×128, 144×144, 152×152, 192×192, 384×384, 512×512 (PNG),
plus Android Chrome, Apple Touch, and favicon variants.

---

## css/

### css/base/
Foundation styles loaded first on every page.
- `variables.css` — All CSS custom properties: `--color-primary`, `--color-success`, `--color-danger`, `--color-warning`, `--text`, `--text-muted`, `--card-bg`, `--card-border`, `--border`, font stacks, spacing scale, border radii, shadow definitions, z-index scale.
- `reset.css` — Normalize and CSS reset. Box-sizing border-box universal.
- `typography.css` — Font size scale, line heights, heading weights, paragraph spacing.

### css/components/
Reusable UI component styles.
- `alerts.css` — `.alert`, `.alert-info`, `.alert-success`, `.alert-warning`, `.alert-danger`.
- `badges.css` — `.badge`, `.badge-success`, `.badge-warning`, `.badge-danger`, `.badge-neutral`.
- `buttons.css` — `.btn`, `.btn-primary`, `.btn-secondary`, `.btn-danger`, `.btn-success`, `.btn-ghost`, `.btn-sm`, `.btn-fill`.
- `cards.css` — `.section-card`, `.stat-card`, `.stats-grid`, `.stats-grid-3`, `.stats-grid-4`.
- `dropdown.css` — `.dropdown`, `.dropdown-menu`, `.dropdown-item`.
- `forms.css` — `.input`, `.select`, `.field`, `.field-label`, `.form-group`, `.form-row`, `.two-col-grid`.
- `loaders.css` — `#boot-loader` animated school emblem with progress bar. `.skeleton`, `.spinner`.
- `modals.css` — `.modal-overlay`, `.modal-panel`, `.modal-header`, `.modal-body`, `.modal-footer`. Sizes: sm, md (default), lg, xl.
- `pagination.css` — `.pagination`, `.page-btn`.
- `sidebar.css` — Full sidebar layout: `.sidebar`, `.sidebar-header`, `.sidebar-nav`, `.nav-item`, `.nav-section`, `.badge-pill`, `.badge-dropdown`, `.badge-dropdown-item`.
- `skeleton.css` — Skeleton loading screens for all module types.
- `tables.css` — `.data-table`, `.table-wrap`, `.table-footer`, `.student-cell`, `.student-name`, `.student-code`.
- `tabs.css` — `.tabs`, `.tab-btn`.
- `toast.css` — `.toast-container`, `.toast`, `.toast-success`, `.toast-warning`, `.toast-danger`, `.toast-info`.
- `topbar.css` — `.topbar`, `.topbar-row1`, `.topbar-row2`, `.topbar-btn`.

### css/layouts/
- `grid.css` — `.grid-2`, `.grid-3`, `.grid-4`, `.two-col-grid`, `.three-col-grid`.
- `spacing.css` — Margin and padding utility classes.
- `positioning.css` — Flex utilities, position helpers.

### css/modules/
Per-module stylesheets. Loaded via `<link>` in `index.html`.
- `analytics.css` — Analytics charts and metric cards.
- `assessments.css` — Assessment cards, lock indicators, phase badges.
- `attendance.css` — Attendance grid, status dots (Present/Absent/Late).
- `class-register.css` — Register grid scrollable table, assessment column headers.
- `dashboard.css` — Dashboard KPI cards, quick-action buttons, activity feed.
- `finance.css` — Finance tables, payment status badges, receipt layout.
- `help-center.css` — Help card grid, search bar, category filters.
- `login.css` — Login card, setup form, Supabase credentials form.
- `marks.css` — Marks entry table, absent checkbox, grade display cell.
- `notifications.css` — Notification list, unread indicator, notification types.
- `reports.css` — Report card print layout, section headings, decision checkboxes.
- `settings.css` — Settings page sections, toggle switches, save indicators.
- `students.css` — Student list, enrollment wizard steps, profile photo placeholder.
- `timetable.css` — Timetable grid by day and period, conflict highlight.
- `teachers.css` — Teacher cards, assignment matrix.
- `holiday.css` *(in themes/)* — Holiday mode amber theme. See themes/ below.

### css/print/
Print-specific stylesheets. Applied via `@media print` and print windows.
- `print.css` — Base print reset: hide sidebar, topbar, buttons. Set A4/Letter page size.
- `marksheets-print.css` — Marks list print layout for physical marksheets.
- `receipts-print.css` — A4 receipt print layout with school header, fee breakdown, signatures.
- `receipts-thermal-print.css` — 58mm/80mm thermal receipt printer layout.
- `report-cards-print.css` — Annual report card A4 print with exact column widths matching Rwanda Ministry format.
- `statements-print.css` — Student account statement print layout.
- `transcripts-print.css` — Academic transcript print layout.

### css/responsive/
Breakpoint-specific overrides.
- `mobile.css` — Styles for screens ≤480px. Collapses sidebar, stacks layout.
- `responsive-sidebar.css` — Sidebar hide/show at breakpoints, overlay mode.
- `responsive-topbar.css` — Topbar layout adjustments for small screens.
- `tablet.css` — Tablet (481–768px) layout adjustments.
- `touch.css` — Touch target sizing (min 44px), tap highlight, scroll momentum.

### css/themes/
- `light.css` — Light mode CSS variable overrides: white backgrounds, dark text, blue primary.
- `dark.css` — Dark mode CSS variable overrides: `#0d1b2e` backgrounds, `#e2e8f0` text, navy primary.
- `holiday.css` — Holiday mode amber theme applied when `body.mode-holiday`:
  - Sidebar: amber border and indicator bar, amber nav active state.
  - Topbar: replaced by sidebar period selector.
  - `.holiday-banner`, `.holiday-badge-inline`, `.sidebar-holiday-indicator` components.
  - `.badge-pill.holiday-pill`, `.dot.amber` for term selector.
  - `.page-body::before` holiday mode strip below topbar.
  - `.fappr-source-holiday` badge in fee approvals table.
  - Fee approval pending pulse animation dot.
  - `body.mode-normal` resets all holiday styles.

---

## data/demo/

25 JSON seed files used for development and testing. Not loaded at runtime.
Each file contains sample rows matching the real Supabase table schema.

`academic-years.json`, `activity-logs.json`, `announcements.json`, `assessments.json`,
`classes.json`, `families.json`, `fee-amounts.json`, `fee-categories.json`,
`grading-scale.json`, `holiday-enrollments.json`, `holiday-fees.json`,
`holiday-marks.json`, `holiday-subjects.json`, `holidays.json`, `marks.json`,
`notifications.json`, `payment-allocations.json`, `payments.json`,
`school-settings.json`, `student-fees.json`, `students.json`, `subjects.json`,
`teachers.json`, `terms.json`, `timetable-slots.json`.

---

## docs/

### docs/README.md
Index of all documentation files with descriptions.

### docs/academics-workflow.md
Marks entry flow, assessment phases (pre_midterm → post_midterm → second_sitting),
report card generation, second sitting registration, annual promotion decisions.

### docs/architecture.md
System architecture: SPA routing, state management, Supabase integration, offline strategy,
holiday mode two-state machine, class teacher access control, historical roster design.

### docs/changelog.md
Version history from v1.0 through v9.0.0.

### docs/database-schema.md
All 43 database tables with column descriptions. Updated to reflect migrations 001-009.
Includes: students, classes, marks, assessments, student_fees, payments, payment_allocations,
holiday_sessions, session_classes, session_subjects, session_assessments, session_teacher_assignments,
fee_approval_log, second_sitting_students, second_sitting_marks, student_promotion_decisions,
verifications, report_card_snapshots, receipt_snapshots, transcript_snapshots, and all others.

### docs/deployment.md
Deployment steps: Supabase project setup, custom domain, PWA install, service worker,
environment configuration, backup strategy.

### docs/finance-workflow.md
Fee assignment, payment recording, approval queue, waiver flow, carry-forward,
holiday fee workflow, credit balance, family discounts.

### docs/permissions.md
Role permission matrix across all 86 modules:
admin (full access), teacher (own class only), accountant (finance + student read).

### docs/setup-guide.md
First-run setup: Supabase credentials, admin password, school settings,
academic year creation, term dates, class setup, subject assignment.

### docs/troubleshooting.md
Common issues: login failures, missing data, RLS errors, offline sync,
service worker cache clearing, Supabase quota, print issues.

### docs/sql/

SQL migrations to run manually in Supabase SQL Editor, in order.
See `docs/sql/README.md` for the full run-order table and per-file descriptions.

| File | What it does |
|---|---|
| `001_enable_rls_baseline.sql` | Enables Row Level Security on all 43 tables. Creates `login_check()` RPC for secure auth. Blocks hard deletion of marks, payments, system_logs, snapshots. |
| `002_tighten_delete_protection.sql` | Removes overly-broad `anon_all_<table>` policies that bypassed delete protection. Adds protection to verifications + snapshots tables. |
| `003_hash_passwords.sql` | bcrypt password hashing via DB trigger. One-time migration for existing plaintext rows. Updated `login_check()` compares against hash. |
| `004_fix_unexplained_policies.sql` | Fixes conflicting RLS policies found during live `pg_policies` audit. |
| `005_server_side_lockout.sql` | Login lockout inside `login_check()` — 5 attempts / 15 minutes. Creates `login_attempts` table with no anon access. |
| `006_google_oauth_login.sql` | `oauth_login_check(email)` RPC for Google Sign-In flow. Matches Google-verified email to teacher without exposing password. |
| `007_holiday_sessions.sql` | Creates `holiday_sessions`, `session_classes`, `session_subjects`, `session_teacher_assignments`, `session_assessments`, `fee_approval_log`. Adds holiday FKs to `holiday_marks`, `holiday_fees`, `holiday_enrollments`. Adds `is_approved`, `requires_approval`, `waived_amount`, `source` to `student_fees`. |
| `008_qr_snapshots.sql` | Creates `verifications`, `report_card_snapshots`, `receipt_snapshots`, `transcript_snapshots`. Each stores a frozen PDF payload and one-time verification token. |
| `009_second_sitting.sql` | Allows `phase='second_sitting'` in assessments. Adds `second_sitting_score`, `second_sitting_entered_by/at` to `marks`. Creates `student_promotion_decisions` table. Adds `is_core` to `subjects`. |

`tables.json` — Full export of all table schemas from Supabase, used during development
to audit insert payloads against real column names.

---

## html/

### html/partials/
HTML fragments for reference and manual integration. Not auto-included.
- `empty-states.html` — Empty state templates for all modules.
- `footer.html` — Footer HTML fragment.
- `help-center.html` — Help center HTML structure.
- `loaders.html` — Boot loader and skeleton screen HTML.
- `login.html` — Login card HTML fragment.
- `modal-container.html` — Modal overlay and panel HTML.
- `sidebar.html` — Full sidebar HTML fragment.
- `term-progress-bar.html` — Term progress indicator HTML.
- `toast-container.html` — Toast notification container HTML.
- `topbar.html` — Topbar HTML fragment.

### html/templates/
Print-ready HTML templates used by the print engine.
- `attendance-template.html` — Daily attendance sheet print template.
- `finance-template.html` — Finance report print template.
- `ranking-template.html` — Class rankings print template.
- `receipt-standard.html` — Standard A4 payment receipt.
- `receipt-thermal.html` — Thermal printer receipt (58mm/80mm).
- `report-card-nursery.html` — Nursery/pre-primary report card template.
- `report-card-primary.html` — Primary report card matching Rwanda Ministry format.
- `student-statement.html` — Student account statement print template.
- `transcript-template.html` — Academic transcript print template.

---

## js/

### js/main.js
App entry point. Calls `boot()` after DOM ready. Registers service worker.
Exposes `window.App` version and metadata.

---

### js/config/

#### js/config/constants.js
All app-wide configuration constants.
- `APP_CONFIG` — version (`9.0.0`), cache TTL values (`settingsCacheTTL: 600000`), pagination defaults.
- `HOLIDAY_CONFIG` — `sessionKey`, `modeKey`, `activeSessionKey` for localStorage. Banner color `#d97706` (amber). Theme class `mode-holiday`. Icon `🏖️`. All holiday DB table names. `feesRequireApproval: true`. Auto-activate/deactivate day offsets.
- `PERIOD_MODES` — `{ NORMAL: 'normal', HOLIDAY: 'holiday' }`.
- `PERIOD_THEME` — Color, label, and icon per mode.
- `BACKUP_ALL_TABLES` — Array of all 43 table names for full backup.
- Grading scale defaults, promotion mark default (50%), currency format (RWF).

#### js/config/navigation.js
`NAV_SECTIONS` — all sidebar navigation items organized by role-visible section.
Each item: `{ id, label, icon (FA class), desc, roles? }`.

Sections: Dashboards | Attendance | Students | Academics | Holidays | Finance |
Staff & Timetable | Communication | Analytics | Settings | Help.

Holiday mode activates nav swap in `sidebar.js._getFilteredSections()`:
- Marks Entry → Holiday Marks Entry
- Class Register → Holiday Class Register
- Assessments → Holiday Enrollment
- Report Cards → Holiday Reports
- Rankings → Holiday Rankings

#### js/config/role-permissions.js
`canAccess(moduleId, role)` — returns boolean.
- `admin`: access to all 86 modules.
- `teacher`: marks-entry, marks-database, class-register, report-cards, rankings,
  assessments, attendance-entry, holidays-marks, holidays-reports, holidays-rankings,
  second-sitting, teacher-dashboard, teacher-timetable.
- `accountant`: all finance modules + student read-only modules.

#### js/config/supabase-config.js
Supabase client initialization.
- `hasSupabaseCredentials()` — checks localStorage for saved URL + key.
- `testSupabaseConnection()` — pings Supabase to verify credentials work.
- `saveSupabaseCredentials(url, key)` — persists to localStorage.
- `getSupabaseClient()` — returns configured Supabase client singleton.

---

### js/core/

#### js/core/api.js
All database operations. Wraps Supabase PostgREST.
- `getAll(table, queryString)` — GET with filter string.
- `getAllRecords(table, queryString)` — GET with pagination (all rows).
- `insert(table, payload)` → inserted row with `id`.
- `update(table, id, payload)` → updated row.
- `remove(table, id)` → deletes row.
- `upsert(table, payload, onConflict)` → upsert.
- `insertMany(table, rows)` → bulk insert array.
- `apiFetch(path, method, body)` → raw PostgREST/RPC call.
- `getCount(table, filter)` → integer row count.
- `REFRESH_MAP` — maps table name to `state` key for post-write cache invalidation.

#### js/core/auth.js
Authentication flow.
- `doLogin(email, password)` — calls `login_check()` RPC. Sets session in localStorage. Handles lockout (5 attempts / 15 min).
- `doGoogleLogin()` — initiates Google OAuth via Supabase Auth. Calls `oauth_login_check(email)` to resolve teacher record.
- `checkSession()` — restores session from localStorage on boot. Returns true if valid.
- `doLogout()` — clears session, navigates to login.
- `renderLoginPage()` — renders login card with email/password + Google Sign-In button. Shows `#app`.
- `_touchSession(userId)` — updates `last_seen` every 5 minutes (throttled).
- `_readSession()` — reads and validates session object. Guards against `NaN` elapsed time.

#### js/core/boot.js
App startup sequence (10 steps):
1. Show boot loader with animated school emblem and progress bar.
2. Check Supabase credentials → show setup screen if missing.
3. Load school settings from DB.
4. Initialize state.
5. Load all data (`loadAllData()`).
6. Render app shell (sidebar + topbar).
7. Show `#app` (hidden on load to prevent flash before auth).
8. Check for existing session.
9. Navigate to default module or login page.
10. Start auto-holiday-switch polling (every 10 minutes).

Auto holiday mode switch:
- `_setupAutoHolidaySwitch()` — runs immediately + every 10 min.
- `_checkAndSwitchMode()` — compares `holiday_sessions[].start_date/end_date` against today. Activates/deactivates holiday mode automatically. Notifies all admins. Logs to `system_logs`.
- `_logAutoSwitch(from, to, reason)` — calls `logAction()` + creates notification for every admin user.

#### js/core/cache.js
In-memory TTL cache for repeated API calls.
- `cacheGet(key)`, `cacheSet(key, value, ttl)`, `cacheInvalidate(key)`.
- Used by `data-loader.js` for school settings and grading scale.

#### js/core/data-loader.js
Loads all state from Supabase in parallel.
- `loadAllData(opts)` — loads all 43 tables into `state.*`. Called on login and period switch.
- `reloadForYear(yearId)` — reloads year-specific data when year changes in sidebar.
- `loadDataForHolidaySession(sessionId)` — loads `session_classes`, `session_subjects`, `session_assessments`, `session_teacher_assignments`, `holiday_enrollments`, `holiday_marks`, `holiday_fees`, `pendingFeeApprovals` for one holiday session.
- `_loadHolidayData()` — auto-detects active session by date range + status. Falls back to localStorage `activeSessionKey`.
All exposed on `window`.

#### js/core/error-handler.js
Global error boundary.
- `handleApiError(err, context)` — shows toast with context, logs to console.
- `window.onerror` handler — catches uncaught JS errors.
- `window.onunhandledrejection` — catches unhandled promise rejections.

#### js/core/export-engine.js
- `exportAsCSV(data, filename)` — converts array-of-objects to CSV, triggers download.
- `exportAsPDF(html, filename, options)` — opens print window with styled HTML.
- `exportAsXLSX(data, filename, sheets)` — uses SheetJS to create Excel file.

#### js/core/fees.js
Fee calculation helpers used across finance modules.
- `computeStudentBalance(studentId)` — total owed minus paid.
- `computeFamilyBalance(familyId)` — sum across all family members.
- `applyDiscount(amount, discountPct)` — returns discounted amount.

#### js/core/finance-formulas.js
Finance computation formulas.
- `computeCollectionRate(classId, termId)` — % of expected fees collected.
- `computeOutstanding(yearId, termId)` — total unpaid across all students.
- `computeTermRevenue(termId)` — total payments in a term.

#### js/core/formulas.js
General computation helpers.
- `getGrade(pct)` — returns letter grade: A(80+), B(75-79), C(70-74), D(65-69), E(60-64), S(50-59), F(0-49).
- `fmtCurrency(amount)` — formats as `RWF X,XXX`.
- `fmtDate(isoStr)` — formats as `DD Mon YYYY`.
- `fmtPct(value, decimals)` — formats as percentage string.
- `cleanInput(str)` — trims and sanitizes text input.
- `esc(str)` — HTML entity escape for innerHTML safety.

#### js/core/academic-formulas.js
Academic computation helpers.
- `computeTermAverage(studentId, classId, termId)` — weighted average across all subjects.
- `computeAnnualAverage(studentId, classId, yearId)` — average across all 3 terms.
- `computeRankInClass(studentId, classId, termId)` — position among classmates.
- `getPromotionDecision(average, className)` — returns PROMOTED / REMEDIAL / GRADUATED based on school settings.

#### js/core/logger.js
System audit log writer.
- `logAction(action, entityType, entityId, details, level)` — writes to `system_logs` with correct schema: `user_id`, `action`, `entity_type`, `entity_id`, `details` (JSONB). Actor resolved from `state.currentUser`. Non-blocking (fire-and-forget).

#### js/core/notifications-engine.js
In-app notification writer.
- `sendNotification(recipientId, type, title, message, opts)` — inserts to `notifications` table with: `recipient_id`, `sender_id`, `type`, `title`, `message`, `action_url`, `is_read: false`, `category`, `academic_year_id`, `term_id`, `created_by`.
- `notifyAdmins(type, title, message, opts)` — sends to all users with role `admin`.
- `notifyRole(role, type, title, message)` — sends to all users of a role.

#### js/core/offline-sync.js
Offline write queue management.
- Queues failed API writes to IndexedDB when offline.
- Replays queue when connection restored.
- `window.addEventListener('online', ...)` trigger.

#### js/core/print-engine.js
Print orchestration.
- `printHTML(html, opts)` — opens print window, writes styled HTML, triggers `window.print()`.
- `printReportCard(studentId, yearId)` — assembles report card HTML and prints.
- `printReceipt(paymentId)` — assembles receipt HTML and prints.

#### js/core/router.js
Module routing. `MODULE_FILE_MAP` maps 86 module IDs to JS file paths.
- `navigateTo(moduleId, params)` — lazy-loads module JS, calls `window.renderXxx(container, params)`.
- Module IDs: `admin-dashboard`, `accountant-dashboard`, `teacher-dashboard`, `attendance-entry`, `attendance-reports`, `attendance-summary`, `attendance-analytics`, `enroll-student`, `student-details`, `student-profile`, `family-management`, `sibling-linking`, `student-promotion`, `student-archive`, `marks-entry`, `marks-database`, `marks-analysis`, `marks-import-export`, `assessments`, `second-sitting`, `assessment-locking`, `class-register`, `register-export`, `annual-register`, `report-generator`, `ranking-engine`, `statistics`, `academic-reports`, `holidays-enrollment`, `holidays-marks`, `holidays-reports`, `holidays-rankings`, `finance-dashboard`, `fee-structure`, `fee-assignments`, `fee-term-status`, `record-payment`, `payment-history`, `receipts`, `overdue-payments`, `fee-waivers`, `fee-approvals`, `credit-balances`, `balances`, `student-fees`, `student-statements`, `family-fee-summary`, `payment-reversals`, `manual-adjustments`, `discounts`, `carry-forward`, `finance-audit`, `help-center`, `faq`, `support`, `financial-reports`, `holidays-fees`, `teachers`, `subjects`, `class-timetable`, `teacher-timetable`, `staff-timetable`, `timetable-conflicts`, `timetable-generator`, `timetable-import`, `announcements`, `announcement-center`, `notifications`, `notification-center`, `reminders`, `analytics`, `analytics-settings`, `system-health`, `school-settings`, `academic-years`, `grading-settings`, `holidays`, `backup-restore`, `system-logs`, `api-settings`, `settings`, `users`, `bulk-import`, `bulk-export`, `bulk-finance-actions`, `bulk-student-actions`.

#### js/core/state.js
Global application state and helpers. All functions exposed on `window`.

**State shape:**
```
{
  currentUser, currentModule, currentAcadYear, currentTerm, currentPhase,
  selectedYearId, selectedTermId, academicYears[], terms[], holidays[],
  classes[], subjects[], teachers[], families[], students[], assessments[],
  marks[], feeCategories[], feeAmounts[], studentFees[], creditBalances[],
  payments[], paymentAllocations[], schoolSettings{}, gradingScale[],
  announcements[], notifications[], timetableSlots[], activityLogs[],
  holidaySessions[], activeHolidaySession, sessionClasses[], sessionSubjects[],
  sessionAssessments[], sessionTeachers[], holidayEnrollments[], holidayMarks[],
  holidayFees[], pendingFeeApprovals[], periodMode, promotionDecisions[],
  classEnrollments[], studentClassHistory[]
}
```

**Period helpers:**
- `isHolidayMode()` — checks localStorage override → `activeHolidaySession` → date-range auto-detect.
- `getCurrentPeriodMode()` — returns `'normal'` or `'holiday'`.
- `getActiveHolidaySession()` / `getActiveHolidaySessionId()`.
- `setActiveHolidaySession(session)` — sets session + localStorage.
- `resolveTable(normalTable, holidayTable)` — returns correct table name for current mode.
- `activateHolidayMode(session)` — sets `periodMode`, stores sessionId, adds `mode-holiday` class to body.
- `deactivateHolidayMode()` — clears all holiday state, removes class, clears localStorage.
- `checkAutoHolidayActivation()` / `checkAutoHolidayDeactivation()`.

**Academic helpers:**
- `getActiveYear()` / `getActiveTerm()` / `getActiveYearId()` / `getActiveTermId()`.
- `computePhase()` / `getCurrentPhase()` — `pre_midterm` or `post_midterm` based on today's date.
- `getTermProgress(termId)` — % of term elapsed.

**Lookup helpers:**
- `getClass(id)`, `getSubject(id)`, `getTeacher(id)`, `getStudent(id)`, `getStudentByCode(code)`.
- `getTerm(id)`, `getAcadYear(id)`, `getFeeCategory(id)`.
- `getStudentsInClass(classId)`, `getSubjectsByLevel(level)`.
- `getAssessmentsFor(classId, termId, subjectId)`.
- `getMarkFor(studentId, assessmentId)`.
- `getStudentFees(studentId, yearId)`, `getStudentCredit(studentId)`.
- `getUnreadNotificationCount()`.
- `getTermById(id)` — simple term lookup by id.
- `getSessionSubjectsForClass(classId)` — filters `sessionSubjects` by `session_class_id`.
- `getRosterForClassAndYear(classId, yearId)` — derives from marks if `class_enrollments` empty.

**Class teacher access control:**
- `getMyClass()` — returns the class where `class_teacher_id` matches current user's teacher_id. Returns null for admin.
- `canAccessClass(classId)` — true if admin, accountant, or teacher's own class.
- `getAccessibleClassIds()` — array of classIds the current user may access.

**Historical roster:**
- `getHistoricalRoster(classId, termId, yearId)` — queries `classEnrollments` filtered by `class_id + term_id + academic_year_id + is_active=true`. Falls back to `students.class_id` if no enrollment records. Used by report cards, class register, rankings to get accurate student count for any historical term.

#### js/core/sync-engine.js
Multi-user sync. Polls for remote changes every 30 seconds when app is active.
Updates `state.*` keys that changed. Shows notification when new data arrives.

#### js/core/validators.js
Form validation functions.
- `validateEmail(email)` — RFC-compliant email check.
- `validatePassword(password)` — min 8 chars, at least 1 uppercase, 1 lowercase, 1 digit or symbol.
- `validateRequired(fields)` — checks array of field values are non-empty.
- `validateStudentForm(data)` — validates enrollment form fields.
- `validateTeacherForm(data)` — validates teacher form.
- `validateAcademicYearForm(data)` — validates year + term dates.
- `validateHolidayForm(data)` — validates holiday session dates.
- `validateTimetableSlot(data)` — validates no conflicts.

#### js/core/verification-engine.js
QR code verification and document snapshots.
- `createReportCardSnapshot(studentId, yearId)` — freezes report card data to `report_card_snapshots`. Generates unique token. Returns token for QR embedding.
- `createReceiptSnapshot(paymentId)` — freezes receipt to `receipt_snapshots`. Returns token.
- `verifyToken(token)` — fetches snapshot by token from `verifications` table. Returns frozen document data.
- Used by `qr-verify.html` to serve verified frozen PDFs.

#### js/core/backup-engine.js
Full database backup.
- `runBackup()` — exports all 43 tables to JSON. Packages as ZIP. Triggers download.
- `restoreBackup(zipFile)` — imports from backup ZIP. Validates schema before writing.

---

### js/ui/

#### js/ui/sidebar.js
Full sidebar rendering and interaction. Single source of truth for period switching.

**Year/term selector (top of sidebar):**
- Reads `state.academicYears`, `state.terms`, `state.holidaySessions` — all real state, no mocks.
- In NORMAL mode: year dropdown + term dropdown (terms of selected year).
- In HOLIDAY mode: year dropdown + holiday session dropdown (Term 1/2/3 Holiday).
- Selecting a session calls `activateHolidayMode(session)` + `loadDataForHolidaySession(id)`.
- Amber styling on holiday pill via `holiday.css`.

**Navigation:**
- `_getFilteredSections()` — applies role permissions + holiday mode nav swap.
- `renderNav(sections)` — renders nav items with active state, badge counts, group open/close.
- `sidebarSelectYear(yearId)` — switches year, resets term, calls `emitPeriodChange()`.
- `sidebarSelectTerm(termId)` — switches term, deactivates holiday mode if needed.
- `sidebarSelectSession(sessionId)` — activates holiday mode, loads session data.
- `toggleBadgeDropdown(dropdownId, pillId)` — opens/closes year or term dropdown.

#### js/ui/topbar.js
Topbar rendering. Notifications bell, search bar, user menu with logout.
Period switching removed — handled entirely by sidebar.

#### js/ui/shell.js
App shell assembly.
- `renderShell()` — writes sidebar + topbar HTML into `#app`. Sets up event listeners. Returns after shell is ready.

#### js/ui/modals.js
- `showModal(content, opts)` — opts: `{ title, size, footer, showClose, id, onClose }`.
- `closeModal()` — closes active modal.
- `confirmDialog(message, title, opts)` → `Promise<boolean>`. opts: `{ confirmText, confirmClass, cancelText }`.

#### js/ui/toast.js
- `showToast(message, type, opts)` — type: `success | warning | danger | info`. opts: `{ duration, actions, persistent }`.

#### js/ui/loaders.js
- Boot loader: `#boot-loader` with animated school emblem SVG + progress bar.
- `showLoader(moduleId)` / `hideLoader(moduleId)` — per-module loading state.
- `showSkeleton(container, type)` — renders skeleton screen for list/table/card layouts.

#### js/ui/charts.js
Chart.js wrappers.
- `renderBarChart(canvas, data, opts)`.
- `renderLineChart(canvas, data, opts)`.
- `renderDoughnutChart(canvas, data, opts)`.
- Auto-destroys previous chart instance before re-rendering.

#### js/ui/cards.js
KPI card components.
- `renderStatCard(el, value, label, sub, color)`.
- `renderTrendCard(el, value, trend, label)`.

#### js/ui/forms.js
Form helpers.
- `serializeForm(formEl)` — returns key-value object from form fields.
- `populateForm(formEl, data)` — fills form fields from object.
- `clearForm(formEl)` — resets all fields.
- `setFieldError(fieldId, message)` / `clearFieldError(fieldId)`.

#### js/ui/tables.js
Sortable data table helpers.
- `makeSortable(tableEl)` — adds click-to-sort on `<th>` elements.
- `filterTable(tableEl, query)` — client-side row filtering.

#### js/ui/dropdowns.js
Dropdown menu components.
- `initDropdowns()` — wires all `[data-dropdown]` elements.
- `closeAllDropdowns()` — closes any open dropdown.

#### js/ui/pagination.js
- `renderPagination(containerEl, total, page, size, onPage)` — renders prev/next/page buttons.

#### js/ui/empty-states.js
- `renderEmptyState(container, opts)` — opts: `{ icon, title, sub, action, actionLabel }`.

#### js/ui/context-menu.js
- `initContextMenu(el, items)` — right-click context menu on table rows.

#### js/ui/responsive-ui.js
- `initResponsive()` — detects viewport size, sets body class, triggers sidebar hide/show.

#### js/ui/theme.js
- `applyTheme(theme)` — switches between light/dark/system themes. Persists to localStorage.

#### js/ui/tables.js (continued)
Handles column show/hide via `[data-col]` toggles. Export visible rows to CSV.

---

### js/modules/

#### js/modules/dashboard/admin-dashboard.js
Admin overview dashboard.
- KPI cards: total students, total teachers, current term fees collected vs expected, attendance rate.
- Pending approvals count (links to fee-approvals module).
- Recent activity feed from `system_logs`.
- Quick action buttons: Enroll student, Record payment, New announcement.
- All data from real state — no mocks.

#### js/modules/dashboard/teacher-dashboard.js
Teacher overview.
- Class at a glance: student count (via `getHistoricalRoster`), subjects, assessments due.
- Recent marks entered by this teacher.
- Upcoming assessments for teacher's class.
- Attendance summary for teacher's class.

#### js/modules/dashboard/accountant-dashboard.js
Finance overview.
- Total collected this term vs expected.
- Outstanding balance by class.
- Recent payments (last 10).
- Fee approval queue size (links to fee-approvals).
- Payment method breakdown chart.

---

#### js/modules/academics/assessments.js
Assessment management.
- Create assessment: name, phase (pre_midterm / post_midterm), subject, class, term, max marks, date.
- Edit assessment name, max marks, date.
- Lock/unlock assessment (admin only) — locked assessments cannot be edited in marks-entry.
- Assessment auto-lock: 7 days after assessment date or at term completion.
- All inserts include `academic_year_id`, `term_id`, `created_by`.

#### js/modules/academics/marks-entry.js
Mark entry for a class assessment.
- Select class → term → subject → assessment → enter marks per student.
- Roster from `getHistoricalRoster(classId, termId)` — accurate historical count.
- Class teacher restriction enforced: teacher sees only their own class.
- Absent checkbox disables score input. Grade displayed live as marks are typed.
- TS (pre_midterm) and EX (post_midterm) tabs per term.
- Save via `insertMany('marks', rows)` — payload includes `academic_year_id`, `term_id`, `entered_by`, `entered_by_name`, `entered_at`, `created_at`, `updated_at`.
- Update via `update('marks', id, payload)` — same fields.
- Locked assessment: save button hidden, read-only display.

#### js/modules/academics/marks-database.js
View and edit all saved marks.
- Filter by class, term, subject, assessment, phase.
- Shows created date and last updated date per mark row.
- Admin can unlock and edit any mark with reason logged.
- Export to CSV.
- Marks from `state.marks` — read directly from state, no re-fetch.

#### js/modules/academics/marks-analysis.js
Class performance analysis.
- Class average per subject per term, trend charts.
- Subject comparison: which subject has lowest average.
- Student distribution by grade band (A/B/C/D/E/S/F).
- Exportable as PDF or CSV.

#### js/modules/academics/marks-import-export.js
Bulk marks import from Excel template.
- Download template (class-specific, assessment-specific).
- Upload filled template → validates, previews, confirms before writing.
- Export all marks for a class/term to Excel.

#### js/modules/academics/report-cards.js
Annual report cards matching Rwanda Ministry of Education PDF format exactly.
- Columns: Maxima (TS | EX | TOT | GR) + 3 terms (TS | EX | TOT | GR each) + Annual Total (TOT | MAX | % | GR) + 2nd Sitting %.
- Annual % is FIXED — computed from raw marks sum / max. Never recalculated after 2nd sitting.
- 2nd sitting % column: core subjects only, read from `second_sitting_marks.second_percentage`.
- Core vs non-core subjects separated with section headers.
- Conduct row: 40 per term, 120 annual.
- Total row, Percentage row, Position row.
- Class Teacher Remarks + Parent Signature rows.
- Grading scale table: A(80-100), B(75-79), C(70-74), D(65-69), E(60-64), S(50-59), F(0-49).
- FIRST DECISION checkboxes: Promoted / 2nd Sitting / Repeated / Discontinued / Promoted elsewhere / Repeated elsewhere.
- FINAL DECISION checkboxes: Promoted / Repeated / Discontinued / Promoted after 2nd sitting / Repeated after 2nd sitting.
- First decision auto-seeded from annual % vs `school_settings.promotion_mark`.
- Class teacher restriction: teacher sees only their own class. Admin sees all.
- Roster from `getHistoricalRoster()` — correct student count per term.
- Print single student or entire class as multi-page PDF.

#### js/modules/academics/second-sitting.js
Second sitting marks entry. Available only after Term 3 status = `completed`.
- Automatically shows only students below promotion threshold.
- Only core subjects shown (`subjects.is_core = true`).
- Uses real DB tables: `second_sitting_students` (who is registered) + `second_sitting_marks` (per-subject scores).
- Auto-register via Supabase RPC `auto_register_second_sitting_students`.
- Score entered as percentage (0-100) — not raw marks.
- Stored in `second_sitting_marks.second_percentage`.
- Annual average is NOT changed — 2nd sitting is additive, shown only in its column.
- Color feedback: green ≥ promotion mark, red = still failing.
- Save per student or save all.
- On save: updates `second_sitting_students.status = 'completed'`.
- Logs every save to `system_logs` via `logAction()`.
- Class teacher restriction: teacher sees only their own class.

#### js/modules/academics/student-promotion.js (in students/ but listed here for context)
See students/ section below.

#### js/modules/academics/rankings.js
Class rankings per term and annual.
- Ranked by percentage (descending). Tie-aware (same rank for equal averages).
- Class teacher restriction: teacher sees only their own class.
- Export to CSV.
- Uses `getHistoricalRoster()` for accurate student list.

#### js/modules/academics/class-register.js
Full class register grid.
- Students (rows) × assessments (columns) per term.
- Class teacher restriction: teacher sees only their own class.
- Uses `getHistoricalRoster()` — correct student count per term.
- Export to Excel.

#### js/modules/academics/annual-register.js
Annual marks summary register for a class.
- All subjects, all terms, annual totals per student.
- Export to Excel.

#### js/modules/academics/register-export.js
Excel and PDF export of class registers.

#### js/modules/academics/assessment-locking.js
Admin tool to lock/unlock individual assessments.
- Lock: prevents marks-entry edits. Shown as locked padlock icon.
- Unlock: requires confirmation + reason. Logged to `system_logs`.

#### js/modules/academics/marks-import-export.js
Bulk marks import from Excel and export.

#### js/modules/academics/report-generator.js
Report generator for custom academic reports (not annual report cards).

#### js/modules/academics/ranking-engine.js
Rank computation engine for statistics and analytics modules.

#### js/modules/academics/statistics.js
Class statistics: distribution, percentiles, min/max/average per assessment.

#### js/modules/academics/academic-reports.js
Printed academic reports: term summary, class performance, subject rankings.

---

#### js/modules/attendance/attendance-entry.js
Daily attendance entry.
- Class teacher enters Present/Absent/Late per student.
- Roster from `getHistoricalRoster()`.
- Inserts to `attendance` table with `academic_year_id`, `term_id`, `recorded_by`, `recorded_by_name`.

#### js/modules/attendance/attendance-reports.js
Attendance reports: summary per student, per class, per month.

#### js/modules/attendance/attendance-analytics.js
Attendance trend analysis: attendance rate over time, chronic absenteeism flags.

#### js/modules/attendance/attendance-summary.js
Per-student attendance summary: total days, days present, days absent, attendance %.

---

#### js/modules/holidays/holidays-enrollment.js
Enroll students into holiday session classes with fee assignment.
- Session selector — switch between any holiday session.
- Student search (excludes already-enrolled students for this session).
- Holiday class selector.
- Fee assignment: select fee categories, enter amount per category.
  - Entered amount < full price → difference auto-waived (`waived_amount`).
  - All holiday enrollment fees → `holiday_fees` table (NOT `student_fees`).
  - All tagged with `holiday_session_id` — never mixed across sessions.
  - All go to approval queue (`requires_approval = true`, `is_approved = false`).
- Manage Classes: add/delete session classes, add subjects to classes.
- Unenroll with confirmation.
- View fees per student: shows amount, discount, net, approval status.
- KPI cards: total enrolled, classes, fees pending approval.

#### js/modules/holidays/holidays-marks.js
Holiday session marks management.
Two tabs: Marks Entry | Marks Register.
- Session selector in topbar.
- Marks Entry: class → subject → assessment → score per enrolled student.
  - Absent checkbox disables score.
  - Live grade display.
  - Save All persists to `holiday_marks` with `holiday_session_id` tag.
  - New Assessment creates `session_assessments` row.
- Marks Register: grid view (enrolled students × assessments).
  - Color-coded: green ≥ 80%, red < 50%.
  - Per-student average and grade.
  - Export to CSV.
- Every mark tagged: `holiday_session_id`, `session_class_id`, `session_subject_id`, `session_assessment_id`.

#### js/modules/holidays/holidays-fees.js
Holiday session fee management. Three tabs:

**Tab 1 — Fee Overview:**
- All `holiday_fees` rows for the selected session.
- Filters: class, status (paid/unpaid/pending approval/free), student search.
- Shows: fee name, amount, discount, net, paid, balance.
- Status badges: Paid / Partial / Pending Approval / Unpaid / Free.
- Quick Pay button → opens Tab 3 for that fee.

**Tab 2 — Configure Session Fees:**
- Set session-wide fee (name + amount). Amount = 0 means free session.
- Override fee per class (e.g. advanced class costs more).
- Fee config stored as JSON in `holiday_sessions.fee_config`.
- Auto-Assign button: assigns configured fee to all enrolled students who don't have one. Skips free sessions and already-assigned. Logs via `logAction()`.

**Tab 3 — Record Payment:**
- Student search (only students with unpaid holiday fees).
- Lists outstanding fees for selected student.
- Payment form: amount, method (cash/bank/mobile money/cheque), reference.
- Supports partial payment.
- On pay: `paid_amount` updated, `is_paid` set, `is_approved = true` (paying removes from approval queue).
- Logs to `system_logs` via `logAction()`.

All fees in `holiday_fees` table — completely separate from `student_fees`. Every row has `holiday_session_id`.

#### js/modules/holidays/holidays-reports.js
Holiday report cards in pre-midterm format.
- Session selector.
- Class panel + student list on left. Report preview on right.
- Uses `session_subjects` and `session_teacher_assignments` for this holiday class only.
- Uses `holiday_marks` tagged with `holiday_session_id`.
- Rank computed within holiday class only (not whole school).
- Print single student or entire class.
- Report header: school name, academic year, class, session name.
- Table: subjects × assessments with score/max format, per-subject average %, grade.
- Overall average and grade in footer row.

#### js/modules/holidays/holidays-rankings.js
Rankings within each holiday session class.
- Tab per holiday class, session selector.
- Ranked by average % across all session subjects.
- Tie-aware rank assignment.
- Medal icons for top 3 positions.
- Per-subject average % columns.
- Export to CSV.

---

#### js/modules/finance/record-payment.js
Record student fee payment.
- Student search, outstanding fees list.
- Payment form: amount, method, reference, notes.
- Inserts to `payments` table with `amount`, `academic_year_id`, `term_id`, `receipt_number`, `recorded_by`, `recorded_by_name`.
- Updates `student_fees.paid_amount` and `is_paid`.
- Creates `payment_allocations` row linking payment to fee.
- Generates receipt number. Logs via `logAction()`.

#### js/modules/finance/fee-assignments.js
Assign fees from fee catalog to students.
- Select class, fee category, amount, due date, term.
- Inserts to `student_fees` with `fee_category_id`, `amount`, `term_id`, `academic_year_id`, `due_date`, `notes`.
- Bulk assign to all students in a class.

#### js/modules/finance/fee-approvals.js
Fee approval workflow.
- Lists all `student_fees` where `requires_approval = true` and `is_approved = false`.
- Auto-approves fees where `paid_amount > 0` (already paid before review).
- Approve: `is_approved = true`, logs to `fee_approval_log` + `system_logs`.
- Reject: deletes fee row, logs rejection with reason.
- Approve All button for bulk approval.
- Filters by source (enrollment/holiday), class, student search.
- KPI cards: pending count, enrollment vs holiday split, auto-approved count.

#### js/modules/finance/fee-structure.js
Manage fee categories and amounts.
- Create/edit fee categories with name, type, default amount.
- `is_core` flag marks category as second-sitting eligible.
- `default_amount` used by holiday fee auto-assignment.

#### js/modules/finance/fee-term-status.js
Fee payment status grid by term.
- Students × fee categories, showing paid/unpaid/partial per cell.

#### js/modules/finance/fee-waivers.js
Grant fee waivers with reason and audit trail.

#### js/modules/finance/carry-forward.js
Carry unpaid fees from one term to the next.

#### js/modules/finance/balances.js
Student account balance overview.

#### js/modules/finance/credit-balances.js
Overpayment credit management. Apply credit to future fees.

#### js/modules/finance/discounts.js
Sibling and scholarship discounts.

#### js/modules/finance/family-fee-summary.js
Family-level fee summary across all siblings.

#### js/modules/finance/finance-dashboard.js
Finance overview: collection rate, outstanding balance, payment trends, method breakdown.

#### js/modules/finance/finance-audit.js
Finance audit trail: all payments, adjustments, waivers in chronological order.

#### js/modules/finance/financial-reports.js
Financial reports: income by term, outstanding by class, collection rate trends.

#### js/modules/finance/payment-history.js
Full payment history with filters by student, date range, method.

#### js/modules/finance/receipts.js
Receipt management: view, reprint, search by receipt number.

#### js/modules/finance/overdue-payments.js
Overdue fee tracking with aging buckets (0-30, 31-60, 60+ days).

#### js/modules/finance/payment-reversals.js
Reverse an erroneous payment with reason and audit trail.

#### js/modules/finance/manual-adjustments.js
Manual balance adjustments with required reason.

#### js/modules/finance/student-fees.js
Per-student fee ledger: all assigned fees, payments, balance.

#### js/modules/finance/student-statements.js
Generate student account statements (PDF/print).

---

#### js/modules/students/student-list.js
Full student directory.
- Filter by class, status, year, search by name/code.
- Sortable columns.
- Bulk actions: promote, archive, export.
- Links to student profile.

#### js/modules/students/enroll-student.js
New student enrollment wizard (4 steps).
1. Personal details: names, date of birth, gender, registration number.
2. Guardian information: guardian name, phone, relationship.
3. Class assignment and academic year.
4. Fee assignment from fee catalog with initial payment recording.
After save:
- Inserts to `students` table.
- Creates `class_enrollments` row (`is_active: true`, `enrollment_date`, `term_id`, `academic_year_id`, `enrolled_by`).
- Creates `student_class_history` row (audit trail).
- Assigns fees with `requires_approval = true`, `source = 'enrollment'`.
- Records initial payment if provided (in `payments` + `payment_allocations`).

#### js/modules/students/student-profile.js
Student profile view.
- Academic summary: marks per term, overall average, rank.
- Fee summary: assigned fees, payments, balance.
- Attendance summary.
- Quick record payment from profile.
- `amount` column (not `total_amount`) for all payment inserts.

#### js/modules/students/student-details.js
Edit student details: names, guardian info, class, status.
Class change creates new `class_enrollments` row and closes old one.

#### js/modules/students/student-promotion.js
Student promotion decisions after Term 3.
- Class teacher sees only their class. Admin sees all.
- Table columns: Student | Code | Annual % | 2nd Sitting % | First Decision | Final Decision.
- First Decision options: Promoted / 2nd Sitting / Repeated / Discontinued / Promoted elsewhere / Repeated elsewhere.
- Final Decision options (enabled only when First = 2nd Sitting): Promoted / Repeated / Promoted after 2nd sitting / Repeated after 2nd sitting / Discontinued.
- First Decision auto-seeded from annual % vs `promotion_mark` threshold.
- After save: all decisions written to `student_promotion_decisions` per student per year.
- Promoted students: `students.class_id` advanced to next class by `sort_order`.
- All decisions logged via `logAction()`.

#### js/modules/students/student-archive.js
Archived student management. View, restore, or permanently remove.

#### js/modules/students/family-management.js
Family grouping for sibling discounts.
- Groups students by `family_code`.
- Shows `total_children`, `active_children`, `notes` per family.
- Links to `discount_rules` table for automatic sibling discount application.

#### js/modules/students/sibling-linking.js
Manual sibling linking within families.

---

#### js/modules/staff/teachers.js
Teacher directory: name, subjects, classes assigned, contact info.

#### js/modules/staff/teacher-assignments.js
Assign teachers to class/subject combinations per academic year.
Inserts include `academic_year_id`.

#### js/modules/staff/subjects.js
Subject management.
- `is_core` flag: marks subject as core (eligible for second sitting + shown in annual report).
- `sort_order`: controls display order in marks entry and report cards.

#### js/modules/staff/timetable.js, timetable-generator.js, timetable-import.js, timetable-conflicts.js
Full timetable management: create slots, auto-generate, import from Excel, detect conflicts.

#### js/modules/staff/class-timetable.js, teacher-timetable.js, staff-timetable.js
Role-specific timetable views.

#### js/modules/staff/teacher-performance.js
Teacher performance metrics: marks entry completion rate, assessment creation, attendance recording.

#### js/modules/staff/user-management.js
Create/edit teacher user accounts. Set roles. Reset passwords.

---

#### js/modules/settings/school-settings.js
School name, address, phone, head teacher name/title, logo, `promotion_mark` threshold.

#### js/modules/settings/academic-years.js
Academic year management: create year, set year as active, view terms.

#### js/modules/settings/academic-calendar.js
Term date management: set start/end dates for each term. Triggers auto-holiday-switch recalculation.

#### js/modules/settings/class-management.js
Class management: create/edit classes, set `sort_order` (determines promotion path), assign class teachers.

#### js/modules/settings/grading-scale.js
Grade thresholds per academic year. Inserts include `academic_year_id`.
Default: A(80+), B(75-79), C(70-74), D(65-69), E(60-64), S(50-59), F(0-49).

#### js/modules/settings/grading-settings.js
Advanced grading configuration: pass mark, promotion mark.

#### js/modules/settings/holidays.js
Holiday session management.
- Create/edit holiday sessions: name, start date, end date, after which term.
- Set status: upcoming / active / completed.
- Each session has unique `id` — `holiday_session_id` foreign key on all holiday data.
- `auto_activate: true` enables date-based auto-switching.

#### js/modules/settings/backup-restore.js
Full database backup to JSON. Restore from backup.

#### js/modules/settings/api-settings.js
Supabase credentials management. Test connection. Save URL + key.

#### js/modules/settings/system-logs.js
View system audit log: all actions, filtered by user/action type/date range.

#### js/modules/settings/system-health.js
System health dashboard: Supabase connection status, cache stats, sync status.

#### js/modules/settings/users.js
User account management: roles, passwords, Google OAuth status.

#### js/modules/settings/settings.js
Settings hub with navigation to all settings sub-pages.

---

#### js/modules/communication/announcements.js, announcement-center.js
Post and view school-wide announcements. Target by role or all users.

#### js/modules/communication/notifications.js, notification-center.js
In-app notification management. Notifications from real `state.notifications`. Mark as read.

#### js/modules/communication/reminders.js
Automated reminder management: fee due dates, attendance, assessment deadlines.

---

#### js/modules/analytics/analytics.js
School performance analytics: marks trends, fee collection trends, attendance trends.

#### js/modules/analytics/analytics-settings.js
Configure analytics: which metrics to show, comparison periods.

---

#### js/modules/bulk/bulk-student-actions.js
Bulk promote, archive, export selected students.

#### js/modules/bulk/bulk-import.js
Bulk student import from Excel template.

#### js/modules/bulk/bulk-export.js
Bulk data export: students, marks, fees, payments.

#### js/modules/bulk/bulk-finance-actions.js
Bulk fee assignment, bulk payment recording.

---

#### js/modules/help/help-center.js, help-data.js, help-search.js, help-templates.js
In-app help center: searchable help cards by category. No emoji in innerHTML — all FA icons.

---

### js/integrations/

#### js/integrations/qrcode.js
Canvas-based QR code generation. Renders QR with school emblem badge.
Emoji (🎓💰📜) retained in Canvas `fillText()` — FA webfont unreliable in Canvas context.
Used by verification-engine.js for report card and receipt QR codes.

#### js/integrations/print.js
Print window management: open, write, print, close.

#### js/integrations/xlsx.js
SheetJS wrapper for reading and writing Excel files.

---

### js/mobile/

- `gestures.js` — Swipe detection, touch drag.
- `mobile-modals.js` — Bottom-sheet modals for mobile.
- `mobile-navigation.js` — Mobile bottom nav bar.
- `mobile-tables.js` — Horizontal scroll wrapper for data tables.
- `touch-optimizations.js` — Input zoom prevention, fast tap.

---

### js/workers/

- `analytics-worker.js` — Background analytics computation.
- `export-worker.js` — Background file export.
- `report-worker.js` — Background report generation.
- `search-worker.js` — Background full-text search.

---

## templates/

Print-ready HTML templates for receipts, reports, registers, transcripts.
All use inline CSS for print compatibility.

---

## tests/

13 Jest test suites. Run with `npm test`.

| File | Coverage |
|---|---|
| `auth-tests.js` | doLogin, checkSession, lockout, Google OAuth |
| `boot-chain-tests.js` | Boot sequence, renderShell, auto-holiday-switch |
| `marks-entry-tests.js` | Insert payloads, absent flag, enrollment_id |
| `marks-tests.js` | Grade computation, averages, rank |
| `finance-tests.js` | Fee assignment, payment, balance, carry-forward |
| `attendance-tests.js` | Attendance entry, summary, analytics |
| `router-tests.js` | navigateTo, MODULE_FILE_MAP coverage |
| `ui-tests.js` | showModal, confirmDialog, showToast |
| `module-exposure-tests.js` | All 86 window.renderXxx exposed |
| `offline-tests.js` | Queue, replay, service worker |
| `performance-tests.js` | Load time, state access, render speed |
| `timetable-tests.js` | Conflict detection, slot validation |
| `validation-tests.js` | Email, password, required fields |

**Test helpers:**
- `tests/helpers/jsdom-polyfills.js` — JSDOM patches for Canvas, localStorage, fetch.
- `tests/helpers/load-scripts.js` — Script loader for vanilla JS test environment.

---

## Key Architecture Rules (enforced throughout codebase)

1. Router calls `renderFn(container, params)` — `container = getElementById('moduleContent')`.
2. All UI icons: Font Awesome 6 webfont. Exception: `qrcode.js` uses Canvas `fillText()` where webfont cannot render reliably.
3. `confirmDialog(message, title, opts)` → `Promise<boolean>`.
4. `showToast(message, type, opts)` for all user feedback.
5. `showModal(content, opts)` for all overlays.
6. Data writes check `isHolidayMode()` + `resolveTable()` before choosing table.
7. Every module exposes `window.renderXxx(container, params)`.
8. `esc()` on ALL dynamic values in `innerHTML`.
9. No ES module `import`/`export` — plain `<script>` tags, global functions.
10. Script load order: config → core → ui → integrations → mobile → help → modules → boot → main.
11. Holiday mode: NORMAL | HOLIDAY. Mode in `school_settings.holiday_mode_active` + localStorage. Sidebar = single source of truth for switching.
12. Historical roster: always `getHistoricalRoster(classId, termId, yearId)` — never `students.class_id` for class lists.
13. Class teacher access: `canAccessClass(classId)` checked before rendering class data.
14. Every DB insert/update: includes `academic_year_id`, `term_id`, `created_at`, `updated_at`, actor fields (`entered_by`, `recorded_by`, etc.).
15. All system audit writes: `logAction(action, entityType, entityId, details)` — never raw `insert('system_logs')`.
16. All notifications: `sendNotification()` or `notifyAdmins()` — never raw `insert('notifications')`.
17. Supabase RLS enforced on all 43 tables. No anon write access to core tables.
