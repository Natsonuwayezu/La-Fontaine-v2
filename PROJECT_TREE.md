# ECOLE LA FONTAINE — PROJECT TREE v3
# Clean, deduplicated, single-responsibility.
# No patches/, no duplicate flat files, no version suffixes.
# Every file has one job. Go part by part.
# Last updated: 2026-07-12
# ─────────────────────────────────────────────────────────────

La-Fontaine/
│
├── index.html                          # App shell only: <head>, sidebar slot, topbar slot, #app, CDN links
├── offline.html                        # Shown by SW when fully offline with no cache
├── 404.html                            # Not-found page
├── sw.js                               # Service worker: cache strategy, offline queue, sync
├── site.webmanifest                    # PWA manifest
├── README.md                           # Project overview
├── backend.txt                         # Single source of truth — DB schema, formulas, rules
├── frontend.txt                        # Wireframes and UI specs
│
├── assets/
│   │
│   ├── logos/                          # School branding (all sizes)
│   │   ├── school-logo.png
│   │   ├── school-logo-light.png       # Light variant for dark backgrounds
│   │   ├── favicon.ico
│   │   ├── favicon-16x16.png
│   │   ├── favicon-32x32.png
│   │   ├── apple-touch-icon.png
│   │   ├── android-chrome-192x192.png
│   │   ├── android-chrome-512x512.png
│   │   ├── icon-72x72.png
│   │   ├── icon-96x96.png
│   │   ├── icon-128x128.png
│   │   ├── icon-144x144.png
│   │   ├── icon-152x152.png
│   │   ├── icon-192x192.png
│   │   ├── icon-384x384.png
│   │   └── icon-512x512.png
│   │
│   ├── fonts/                          # Self-hosted — no CDN dependency for offline
│   │   ├── plus-jakarta-sans/
│   │   │   ├── PlusJakartaSans-Regular.ttf
│   │   │   ├── PlusJakartaSans-Medium.ttf
│   │   │   ├── PlusJakartaSans-SemiBold.ttf
│   │   │   ├── PlusJakartaSans-Italic-VariableFont_wght.ttf
│   │   │   ├── PlusJakartaSans-VariableFont_wght.ttf
│   │   │   └── PlusJakartaSans-Bold.ttf
│   │   ├── playfair-display/
│   │   │   ├── PlayfairDisplay-Regular.ttf
│   │   │   ├── PlayfairDisplay-Italic-VariableFont_wght.ttf
│   │   │   ├── PlayfairDisplay-VariableFont_wght.ttf
│   │   │   ├── PlayfairDisplay-Italic.ttf
│   │   │   └── PlayfairDisplay-Bold.ttf
│   │   └── dm-sans/
│   │       ├── DMSans-Regular.ttf
│   │       ├── DMSans-Italic.ttf
│   │       ├── DMSans-VariableFont_opsz,wght.ttf
│   │       └── DMSans-Medium.ttf
│   │
│   ├── icons/
│   │   ├── sprite.svg                  # 190 Lucide icons as <symbol> — single file, offline-safe
│   │   └── icon-manifest.json          # { id, name, category } index for icon-picker UI
│   │
│   ├── images/
│   │   ├── avatars/                    # Default user avatar placeholders
│   │   └── placeholders/              # Empty-state illustrations (SVG drawings, no external)
│   │
│   └── audio/
│       ├── alerts/                     # Short alert sounds (optional, for desktop)
│       └── notifications/
│
├── css/
│   │
│   ├── base/
│   │   ├── reset.css                   # * box-sizing, margin/padding reset
│   │   ├── variables.css               # :root tokens — colors, spacing, radius, shadows, z-index
│   │   └── typography.css              # @font-face declarations, body/heading type scale
│   │
│   ├── themes/
│   │   ├── dark.css                    # [data-theme="dark"] overrides
│   │   └── light.css                   # [data-theme="light"] overrides
│   │
│   ├── layouts/
│   │   ├── grid.css                    # .grid-*, .flex-*, .col-* utility classes
│   │   ├── spacing.css                 # .mt-*, .p-*, gap utilities
│   │   └── positioning.css             # .sticky, .fixed, .z-* helpers
│   │
│   ├── components/
│   │   ├── alerts.css                  # .alert, .alert-success/warning/danger/info
│   │   ├── badges.css                  # .badge, .badge-sm, status pill variants
│   │   ├── buttons.css                 # .btn, .btn-primary/secondary/outline/ghost/danger/success
│   │   ├── cards.css                   # .card, .stat-card, .card-hover, .card-elevated
│   │   ├── dropdown.css                # .dropdown, .dropdown-menu, .dropdown-item
│   │   ├── forms.css                   # .input, .select, .field, .label, .toggle, .checkbox
│   │   ├── loaders.css                 # .spinner, .skeleton, .progress-bar
│   │   ├── modals.css                  # .modal-overlay, .modal, .modal-header/body/footer
│   │   ├── pagination.css              # .pagination, .page-btn
│   │   ├── sidebar.css                 # #sidebar, .nav-section, .nav-item, .sidebar-footer
│   │   ├── skeleton.css                # .skeleton shimmer animation variants
│   │   ├── tables.css                  # .data-table, .table-wrap, .table-compact, .table-striped
│   │   ├── tabs.css                    # .tabs, .tab-btn, .tab-content
│   │   ├── toast.css                   # .toast, .toast-success/error/warning/info, slide animations
│   │   └── topbar.css                  # #topbar, .topbar-left/right, .notif-bell, .user-menu
│   │
│   ├── modules/                        # Per-module overrides (only unique styles not in components)
│   │   ├── login.css
│   │   ├── dashboard.css
│   │   ├── attendance.css
│   │   ├── marks.css                   # Marks grid, inline validation popup, cell color coding
│   │   ├── class-register.css          # Wide table, sticky columns, phase-aware columns
│   │   ├── assessments.css
│   │   ├── reports.css                 # Report card layout (nursery + primary), print optimized
│   │   ├── finance.css
│   │   ├── students.css
│   │   ├── teachers.css
│   │   ├── timetable.css
│   │   ├── settings.css
│   │   ├── statistics.css
│   │   ├── analytics.css
│   │   └── notifications.css
│   │
│   ├── print/                          # @media print rules — each scoped to its document type
│   │   ├── print.css                   # Global print resets (hide sidebar, topbar, etc.)
│   │   ├── report-cards-print.css      # Report card page breaks, margins, QR box
│   │   ├── receipts-print.css          # A4 receipt layout
│   │   ├── receipts-thermal-print.css  # 80mm thermal — monospace, compact
│   │   ├── marksheets-print.css        # Register/class-list landscape print
│   │   ├── statements-print.css        # Student statement print
│   │   └── transcripts-print.css
│   │
│   └── responsive/
│       ├── tablet.css                  # @media (max-width: 1024px)
│       ├── mobile.css                  # @media (max-width: 768px)
│       ├── touch.css                   # Touch-specific tap targets, hover overrides
│       ├── responsive-sidebar.css      # Sidebar collapse/overlay on small screens
│       └── responsive-topbar.css       # Topbar stacking on mobile
│
├── js/
│   │
│   ├── config/
│   │   ├── supabase-config.js          # SB URL + key read from localStorage 'sb_url'/'sb_key'
│   │   ├── constants.js                # CLASS_LIST, SUBJECT_LISTS, PASS_MARK default, RECEIPT_PREFIX
│   │   ├── navigation.js               # NAV_SECTIONS array — module IDs, labels, icons, roles
│   │   └── role-permissions.js         # TEACHER_BLOCKED_MODULES, ACCOUNTANT_BLOCKED_MODULES sets
│   │
│   ├── core/                           # Loaded first, no module-specific code here
│   │   ├── boot.js                     # Entry: init state → auth check → loadData → renderShell
│   │   ├── state.js                    # window.state object + updateState() + cache maps
│   │   ├── api.js                      # get/insert/update/delete/upsert Supabase REST wrappers
│   │   ├── auth.js                     # doLogin, logout, session, idle timer (40min), biometric
│   │   ├── router.js                   # navigateTo, loadModule, role-gate, active nav highlight
│   │   ├── formulas.js                 # getGrade, isPassing, calcMG, calcEX, calcTOT, rankStudents
│   │   ├── academic-formulas.js        # Pre/post midterm calculations, annual totals, denominator rule
│   │   ├── finance-formulas.js         # Fee balance, FIFO allocation, credit deduction, overdue severity
│   │   ├── fees.js                     # assignFeesToStudent, generateStudentFees, applyCredit
│   │   ├── utils.js                    # esc, formatCurrency, fmtDate, amountInWords, asciiBar, debounce
│   │   ├── validators.js               # validateMark (3-choice popup), validateFee, validateForm
│   │   ├── sanitizers.js               # esc() XSS guard, safe innerHTML helpers
│   │   ├── offline.js                  # IndexedDB queue, syncOfflineMarks, online/offline listeners
│   │   ├── sync-engine.js              # Background sync, conflict resolution (server wins), badge count
│   │   ├── logger.js                   # logAction → system_logs table, with entity_type + details JSONB
│   │   ├── notifications-engine.js     # Auto-trigger notifications on payment/marks/overdue events
│   │   ├── permissions.js              # canAccess(role, moduleId), canEdit, canDelete
│   │   ├── cache.js                    # studentBalances Map, classStats Map, ranks Map — with TTL
│   │   ├── data-loader.js              # loadAllData(), refreshTable(name), lazy-load strategies
│   │   ├── export-engine.js            # exportToExcel (SheetJS), exportToPDF helpers
│   │   ├── print-engine.js             # printElement, printReport, openPrintWindow
│   │   ├── search-engine.js            # Global search across students/fees/marks, fuzzy match
│   │   ├── backup-engine.js            # doFullBackup, restoreFromBackup, autoBackupSchedule
│   │   ├── error-handler.js            # window.onerror, unhandledrejection → showToast + logAction
│   │   ├── pwa.js                      # SW registration, installPWA prompt, update notification
│   │   └── window-exposure.js          # All window.* exports for onclick= handlers (single place)
│   │
│   ├── ui/                             # Reusable UI primitives — no business logic
│   │   ├── shell.js                    # renderSidebar, renderTopbar, initShell
│   │   ├── sidebar.js                  # toggleSection, toggleSidebar, setActiveNav, updateBellCount
│   │   ├── topbar.js                   # renderTopbar, phase badge, term/year selectors, sync badge
│   │   ├── modals.js                   # showModal, closeModal, confirmDialog (Promise<bool>)
│   │   ├── toast.js                    # showToast(msg, type, duration) — success/error/warning/info
│   │   ├── theme.js                    # toggleTheme, applyTheme, detectSystemPreference
│   │   ├── tables.js                   # buildTable(cols, rows, opts), sortTable, filterTable
│   │   ├── forms.js                    # buildField, serializeForm, clearForm, validateFormUI
│   │   ├── cards.js                    # buildStatCard, buildListCard, buildHorizontalCard
│   │   ├── charts.js                   # ASCII bar/column charts (no Chart.js) + canvas sparkline
│   │   ├── skeletons.js                # showSkeleton, hideSkeleton — per-module patterns
│   │   ├── dropdowns.js                # initDropdown, positionDropdown, closeAllDropdowns
│   │   ├── tabs.js                     # initTabs, switchTab, tabState
│   │   ├── pagination.js               # buildPagination, goToPage, itemsPerPage selector
│   │   ├── empty-states.js             # buildEmptyState(icon, title, subtitle, action)
│   │   ├── tooltips.js                 # initTooltips, showTooltip, hideTooltip
│   │   ├── context-menu.js             # Right-click context menu for table rows
│   │   └── responsive-ui.js            # Responsive table → cards on mobile, stacked forms
│   │
│   ├── integrations/                   # Thin wrappers around external libs
│   │   ├── xlsx.js                     # SheetJS wrapper: exportSheet, importSheet
│   │   ├── qrcode.js                   # QR generation via qrcode.js — encodes verify URL
│   │   └── print.js                    # html2canvas/print helpers for PDF-style output
│   │
│   ├── mobile/                         # Mobile-specific enhancements
│   │   ├── gestures.js                 # Swipe to open/close sidebar, pull-to-refresh
│   │   ├── touch-optimizations.js      # 300ms tap delay fix, passive scroll listeners
│   │   ├── mobile-tables.js            # Card-mode rendering for tables on small screens
│   │   ├── mobile-navigation.js        # Bottom-nav bar for mobile, back-button handling
│   │   └── mobile-modals.js            # Full-screen modals on mobile, slide-up sheets
│   │
│   ├── workers/                        # Web workers for heavy computation off main thread
│   │   ├── report-worker.js            # Batch report card generation
│   │   ├── export-worker.js            # Large Excel exports
│   │   ├── analytics-worker.js         # School-wide stats computation
│   │   └── search-worker.js            # Fuzzy search index building
│   │
│   ├── modules/
│   │   │
│   │   ├── dashboard/
│   │   │   ├── admin-dashboard.js      # KPI cards, collection chart, quick-action buttons, recent activity
│   │   │   ├── accountant-dashboard.js # Collection rate, overdue list, daily totals, fee trends
│   │   │   └── teacher-dashboard.js    # My classes, completion rate, pending marks, today's timetable
│   │   │
│   │   ├── attendance/
│   │   │   ├── attendance-entry.js     # Daily mark (P/A/L/E), class filter, holiday check, save
│   │   │   ├── attendance-reports.js   # Per-student attendance, at-risk flags (<75%), export
│   │   │   ├── attendance-summary.js   # Class summary, term totals, ASCII calendar heatmap
│   │   │   └── attendance-analytics.js # Trend chart, absence patterns, comparison across terms
│   │   │
│   │   ├── students/
│   │   │   ├── student-list.js         # Searchable/filterable list, quick actions, export
│   │   │   ├── enroll-student.js       # Form + STU-YYYY-NNNN code gen + credit check + fee assignment
│   │   │   ├── student-details.js      # Tabs: Info | Fees | Academics | Family | History
│   │   │   ├── student-profile.js      # Profile card, edit modal, status change
│   │   │   ├── family-management.js    # FAM code, sibling discount, link/unlink students
│   │   │   ├── sibling-linking.js      # Drag/search to link siblings, discount preview
│   │   │   ├── student-promotion.js    # Preview → confirm batch, per-student action, rollback
│   │   │   └── student-archive.js      # Soft-delete list (is_deleted=TRUE), restore, audit trail
│   │   │
│   │   ├── academics/
│   │   │   ├── marks-entry.js          # Inline grid, 3-choice validation popup, save + offline queue
│   │   │   ├── marks-database.js       # Filter/view all marks by class+subject+term, edit, lock
│   │   │   ├── marks-analysis.js       # Per-subject analysis, weak students, improvement trends
│   │   │   ├── marks-import-export.js  # Excel import/export template for bulk mark entry
│   │   │   ├── assessments.js          # CRUD assessments, phase-aware types, lock/unlock
│   │   │   ├── assessment-locking.js   # Bulk lock/unlock, confirmation, notify teacher
│   │   │   ├── class-register.js       # Dynamic column layout per phase/level, sticky cols, color cells
│   │   │   ├── register-export.js      # Export register to Excel, landscape print
│   │   │   ├── annual-register.js      # 3-term aggregated view, annual totals, ANNUAL_G_TOT
│   │   │   ├── report-cards.js         # Nursery (FR) + Primary (EN), QR code image, batch print
│   │   │   ├── report-generator.js     # Template engine: fill data → render → print/download
│   │   │   ├── ranking-engine.js       # Compute ranks (ties broken by name A→Z), cache results
│   │   │   ├── rankings.js             # Display class rankings, filter by term/phase, export
│   │   │   ├── transcripts.js          # Multi-term academic transcript per student
│   │   │   ├── statistics.js           # Pass rate, grade distribution, subject averages, ASCII charts
│   │   │   └── academic-reports.js     # Teacher performance report, class comparison, term summary
│   │   │
│   │   ├── holidays/
│   │   │   ├── holidays-marks.js       # Holiday-period marks → separate tables, NEVER mixed with term data
│   │   │   └── holidays-fees.js        # Holiday fees → tracked separately, applied at NEXT term start
│   │   │
│   │   ├── finance/
│   │   │   ├── finance-dashboard.js    # Collection KPIs, method breakdown, monthly trend, top debtors
│   │   │   ├── fee-structure.js        # Fee categories CRUD, amounts per class/year, mandatory flag
│   │   │   ├── fee-assignments.js      # Assign fees to students/classes, bulk assignment, preview
│   │   │   ├── fee-term-status.js      # Fee status grid: all students × all fees × term, filter
│   │   │   ├── record-payment.js       # Checkbox + amount input per fee row, live sum, FIFO alloc, receipt
│   │   │   ├── payment-history.js      # Full payment ledger, filter by date/method/student, export
│   │   │   ├── receipts.js             # A4 receipt + 80mm thermal, print, reprint, download
│   │   │   ├── overdue-payments.js     # Severity buckets (Critical/Warning/Mild), filter, bulk action
│   │   │   ├── fee-waivers.js          # Full/partial/% waiver form, reason log, balance recalc
│   │   │   ├── credit-balances.js      # Student credit table, auto-deduct preview, manual adjust
│   │   │   ├── balances.js             # Outstanding balances per student/class, export
│   │   │   ├── student-fees.js         # Per-student fee breakdown: amount/paid/waived/balance
│   │   │   ├── student-statements.js   # Printable statement: all fees + payments + running balance
│   │   │   ├── family-fee-summary.js   # Family-level fee view with sibling discount applied
│   │   │   ├── payment-reversals.js    # Reverse payment, recompute allocations, log, notify
│   │   │   ├── manual-adjustments.js   # Admin credit/debit adjustments with mandatory reason
│   │   │   ├── discounts.js            # Family discount management, bulk apply
│   │   │   ├── carry-forward.js        # End-of-year balance carry-forward to next year
│   │   │   ├── finance-audit.js        # Audit trail: all financial events with diff view
│   │   │   └── financial-reports.js    # Collection report, by-class, by-method, date-range export
│   │   │
│   │   ├── staff/
│   │   │   ├── user-management.js      # CRUD teachers/accountants, role, status, reset password
│   │   │   ├── teachers.js             # Teacher list, profile card, class assignments overview
│   │   │   ├── subjects.js             # Subject CRUD, mg/ex max, post_midterm_only flag, level
│   │   │   ├── teacher-assignments.js  # Assign teacher → subject → class → term, conflict check
│   │   │   ├── teacher-performance.js  # Class avg, completion rate (formula 4.9), on-time rate
│   │   │   ├── timetable.js            # Master timetable: visual grid (day × period × class)
│   │   │   ├── class-timetable.js      # Single class weekly timetable view + print
│   │   │   ├── teacher-timetable.js    # Single teacher's weekly schedule view
│   │   │   ├── staff-timetable.js      # All-staff timetable overview
│   │   │   ├── timetable-conflicts.js  # Detect and highlight double-bookings
│   │   │   ├── timetable-generator.js  # Auto-generate timetable from assignments
│   │   │   └── timetable-import.js     # Import timetable from Excel template
│   │   │
│   │   ├── communication/
│   │   │   ├── announcements.js        # Draft/send/schedule, in-app + email + SMS channels
│   │   │   ├── announcement-center.js  # Inbox view: all received announcements, filter by type
│   │   │   ├── notifications.js        # Notification list, mark-read, mark-all-read, filter
│   │   │   ├── notification-center.js  # Full notification management, bulk actions, settings
│   │   │   └── reminders.js            # Set/manage reminders, recurring, snooze
│   │   │
│   │   ├── analytics/
│   │   │   ├── analytics.js            # School-wide KPI dashboard, ASCII charts, trend analysis
│   │   │   ├── statistics.js           # Aggregate stats: pass rate, grade dist, class ranking
│   │   │   ├── analytics-settings.js   # Configure analytics date ranges, comparison periods
│   │   │   └── system-health.js        # DB connectivity, API latency, SW status, storage usage
│   │   │
│   │   ├── settings/
│   │   │   ├── school-settings.js      # School name, motto, phone, email, footer lines, logo upload
│   │   │   ├── academic-calendar.js    # Visual calendar: holiday blocks, term markers, event dots
│   │   │   ├── academic-years.js       # Year CRUD, set current, term management (dates + midterm)
│   │   │   ├── class-management.js     # Class CRUD, assign class teacher, sort order
│   │   │   ├── grading-scale.js        # Grade bands CRUD, live preview table, pass mark config
│   │   │   ├── grading-settings.js     # Pass mark %, grade display format, promotion thresholds
│   │   │   ├── holidays.js             # Holiday CRUD (Public/Vacation/Event), recurring flag
│   │   │   ├── backup-restore.js       # Manual backup (JSON), restore with confirm, auto-schedule
│   │   │   ├── system-logs.js          # Filterable log table: action, entity, user, timestamp
│   │   │   ├── api-settings.js         # Supabase URL + key entry, connection test, save
│   │   │   ├── settings.js             # System settings: session timeout, date format, language
│   │   │   └── users.js                # User profile, change password, biometric setup
│   │   │
│   │   └── bulk/
│   │       ├── bulk-import.js          # Excel → students or marks import with preview + validation
│   │       ├── bulk-export.js          # Export any dataset to Excel/CSV with column selection
│   │       ├── bulk-finance-actions.js # Bulk fee apply, bulk waive, bulk send overdue notice
│   │       └── bulk-student-actions.js # Bulk enroll, bulk promote, bulk archive with preview
│   │
│   └── main.js                         # Script entry: import order, DOMContentLoaded → boot.js
│
├── html/
│   │
│   ├── partials/                       # HTML fragments injected into #app at runtime
│   │   ├── login.html                  # Full login page: role select, username/password, biometric btn
│   │   ├── sidebar.html                # Sidebar markup template (populated by sidebar.js)
│   │   ├── topbar.html                 # Topbar markup (populated by topbar.js)
│   │   ├── toast-container.html        # #toast-container — always in DOM
│   │   ├── modal-container.html        # #modal-overlay — always in DOM
│   │   ├── loaders.html                # Full-page + inline skeleton loader templates
│   │   ├── empty-states.html           # Empty state SVG drawings + text templates
│   │   ├── term-progress-bar.html      # Term progress banner (% complete, days remaining)
│   │   └── footer.html                 # App footer (version, year, school name)
│   │
│   └── templates/                      # Printable/standalone document templates
│       ├── report-card-nursery.html    # Nursery report card (French) — pre/post/annual variants
│       ├── report-card-primary.html    # Primary report card (English) — pre/post/annual variants
│       ├── receipt-standard.html       # A4 receipt — school header, fee table, amount in words
│       ├── receipt-thermal.html        # 80mm thermal receipt — compact monospace, no tables
│       ├── student-statement.html      # Statement of account: all fees + payments + balance
│       ├── attendance-template.html    # Printable attendance sheet per class per day/week
│       ├── finance-template.html       # Finance summary report template
│       ├── ranking-template.html       # Class rankings printable table
│       └── transcript-template.html    # Multi-term academic transcript
│
├── templates/
│   └── exports/
│       ├── marks-template.xlsx         # Excel import template for bulk marks entry
│       ├── students-template.xlsx      # Excel import template for bulk student enrollment
│       └── finance-template.xlsx       # Excel import template for bulk fee/payment data
│
├── qr-verify.html                      # Standalone QR scan page — fetches + displays student report
│                                       # URL: /qr-verify.html?s=STU-2026-0045&t=2&y=3
│                                       # No sidebar. Public-facing. Reads from Supabase directly.
│
├── docs/
│   ├── README.md
│   ├── architecture.md                 # How files connect, load order, module boundaries
│   ├── database-schema.md              # Mirror of backend.txt Part 2 — 26 tables
│   ├── academics-workflow.md           # Marks → register → report card flow
│   ├── finance-workflow.md             # Enrollment → fees → payment → receipt flow
│   ├── permissions.md                  # Role access matrix
│   ├── deployment.md                   # GitHub Pages / self-host setup
│   ├── setup-guide.md                  # Supabase setup, first-run checklist
│   ├── changelog.md                    # Version history
│   └── troubleshooting.md
│
├── tests/
│   ├── auth-tests.js
│   ├── marks-tests.js                  # Formula validation, denominator rule, grade calculation
│   ├── finance-tests.js                # FIFO allocation, credit deduction, overdue severity
│   ├── attendance-tests.js             # Rate calculation, holiday exclusion
│   ├── offline-tests.js                # Queue, sync, conflict resolution
│   ├── router-tests.js                 # Role gates, module blocking
│   ├── validation-tests.js             # 3-choice mark popup, form validation
│   ├── timetable-tests.js
│   ├── ui-tests.js
│   └── performance-tests.js
│
├── data/
│   ├── demo/                           # Demo seed data JSON (safe to wipe)
│   ├── imports/                        # Temp landing zone for imported files
│   ├── exports/                        # Generated exports (gitignored)
│   └── temp/                           # Scratch (gitignored)
│
└── backups/
    ├── daily/                          # Auto-backup JSON files (gitignored)
    ├── weekly/
    ├── monthly/
    └── emergency/


# ═══════════════════════════════════════════════════════════════
# FILE COUNT SUMMARY
# ═══════════════════════════════════════════════════════════════

# Root files                            8
# assets/logos/                         16
# assets/fonts/                         8
# assets/icons/                         2
# assets/images/                        (placeholder PNGs, added as needed)
# css/base/                             3
# css/themes/                           2
# css/layouts/                          3
# css/components/                       15
# css/modules/                          15
# css/print/                            7
# css/responsive/                       5
# js/config/                            4
# js/core/                              26
# js/ui/                                18
# js/integrations/                      3
# js/mobile/                            5
# js/workers/                           4
# js/modules/dashboard/                 3
# js/modules/attendance/                4
# js/modules/students/                  8
# js/modules/academics/                 15
# js/modules/holidays/                  2   ← holiday isolation
# js/modules/finance/                   21
# js/modules/staff/                     12
# js/modules/communication/             5
# js/modules/analytics/                 4
# js/modules/settings/                  12
# js/modules/bulk/                      4
# js/main.js                            1
# html/partials/                        9
# html/templates/                       9
# templates/exports/                    3
# qr-verify.html                        1
# docs/                                 10
# tests/                                10
# ────────────────────────────────────────
# TOTAL (approx)                        ~318 source files
#
# RULES:
#   - No file less than 100 or exceeds 5000 lines
#   - No patches/ folder — patches go into the correct module
#   - No duplicate flat files alongside their subfoldered versions
#   - No version suffixes (-v1, -98, -old)
#   - No emergency-fix.js or missing-functions.js
#   - Holiday data NEVER touches term tables
#   - window-exposure.js is the single place for all window.* exports

# ═══════════════════════════════════════════════════════════════
# LOAD ORDER (index.html <script> tags)
# ═══════════════════════════════════════════════════════════════
#
# 1.  css/base/reset.css
# 2.  css/base/variables.css
# 3.  css/base/typography.css
# 4.  css/themes/dark.css + light.css
# 5.  css/layouts/*.css
# 6.  css/components/*.css
# 7.  css/modules/*.css
# 8.  css/responsive/*.css
# 9.  css/print/*.css
#
# 10. js/config/constants.js
# 11. js/config/supabase-config.js
# 12. js/config/navigation.js
# 13. js/config/role-permissions.js
#
# 14. js/core/state.js
# 15. js/core/api.js
# 16. js/core/utils.js
# 17. js/core/sanitizers.js
# 18. js/core/validators.js
# 19. js/core/formulas.js
# 20. js/core/academic-formulas.js
# 21. js/core/finance-formulas.js
# 22. js/core/fees.js
# 23. js/core/logger.js
# 24. js/core/permissions.js
# 25. js/core/cache.js
# 26. js/core/offline.js
# 27. js/core/sync-engine.js
# 28. js/core/notifications-engine.js
# 29. js/core/error-handler.js
# 30. js/core/export-engine.js
# 31. js/core/print-engine.js
# 32. js/core/search-engine.js
# 33. js/core/backup-engine.js
# 34. js/core/data-loader.js
# 35. js/core/pwa.js
# 36. js/core/auth.js
# 37. js/core/router.js
#
# 38. js/ui/*.js (all UI primitives)
# 39. js/integrations/*.js
# 40. js/mobile/*.js
#
# 41. js/modules/**/*.js (all modules — lazy-loaded by router on demand)
#
# 42. js/core/window-exposure.js        ← LAST: exposes window.* after all defs
# 43. js/main.js                        ← ENTRY POINT: DOMContentLoaded → boot()
