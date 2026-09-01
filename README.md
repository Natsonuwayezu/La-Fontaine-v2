# École La Fontaine — School Management System v9.0

A full-stack Progressive Web App (PWA) for École La Fontaine, Rubavu, Rwanda.
Built with vanilla JavaScript, Supabase (PostgreSQL), and Font Awesome 6.
Runs offline-capable on any device — desktop, tablet, or mobile.

---

## Quick Start

1. Open the app at your deployed URL or run locally:
   ```
   npx serve .
   ```
2. On first load, enter your Supabase Project URL and anon key in the setup screen.
3. Log in with your school admin credentials.
4. Run SQL migrations `007`, `008`, `009` in Supabase SQL Editor (see `docs/sql/README.md`).

---

## What It Does

### Academic Management
- Term-by-term marks entry with pre-midterm (TS) and post-midterm (EX) phases
- Annual report cards matching Rwanda Ministry of Education format exactly:
  TS | EX | TOT | GR per term × 3 terms, Annual TOT | MAX | % | GR, Second Sitting %
- Class registers showing full student × assessment grids
- Rankings within each class per term and annually
- Second sitting marks entry for students below promotion threshold
- Student promotion with First Decision and Final Decision per student

### Holiday Programme
- Full holiday session management separate from the academic year
- Holiday classes, subjects, teacher assignments, assessments, marks
- Holiday report cards in pre-midterm format
- Holiday fees separate from normal student_fees (holiday_fees table)
- Fee approval workflow for all holiday enrollment fees
- Auto-switch between normal and holiday mode by date

### Finance
- Student fee assignment, payment recording, waiver management
- Receipt generation, payment history, credit balance tracking
- Fee approval queue for enrollment and holiday fees
- Family fee summaries, overdue payment tracking
- Carry-forward of unpaid balances between terms

### Student Management
- Student enrollment (4-step wizard) with guardian information
- Class transfers tracked in class_enrollments and student_class_history
- Student profiles with full payment and academic history
- Promotion decisions saved per student per academic year
- Family grouping with sibling discount support

### Staff & Timetable
- Teacher directory with subject and class assignments
- Timetable management with conflict detection
- Class teacher assignment controls module access

### Communication
- School-wide announcements
- Role-targeted in-app notifications
- Automated reminders

### Settings & System
- School settings, academic years, term dates, grading scale
- Google Sign-In support for teacher accounts
- Full database backup and restore
- System audit log (every action recorded with actor, timestamp, context)
- QR code verification on printed reports and receipts

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Vanilla JavaScript (ES5/6, no framework, no bundler) |
| Backend | Supabase (PostgreSQL + PostgREST + Auth) |
| PWA | Service Worker, Web App Manifest, offline-first |
| Icons | Font Awesome 6 (webfont) |
| Charts | Chart.js |
| Excel | SheetJS (xlsx) |
| QR Codes | Canvas-based (qrcode.js) |
| Fonts | DM Sans, Plus Jakarta Sans, Playfair Display |
| Tests | Jest (13 test suites) |

---

## Repository Structure

```
/
├── index.html              App shell and entry point
├── offline.html            PWA offline fallback
├── qr-verify.html          QR code verification (standalone page)
├── 404.html                Error page
├── sw.js                   Service worker
├── site.webmanifest        PWA manifest
├── assets/                 Fonts, icons, logos
├── css/                    All stylesheets (52 files)
│   ├── base/               Variables, reset, typography
│   ├── components/         UI components
│   ├── layouts/            Grid, spacing, positioning
│   ├── modules/            Per-module styles
│   ├── print/              Print stylesheets
│   ├── responsive/         Mobile and tablet breakpoints
│   └── themes/             Light, dark, holiday themes
├── js/                     All JavaScript (161 files, ~60k lines)
│   ├── config/             App config, navigation, permissions, Supabase
│   ├── core/               API, auth, boot, state, router, data-loader
│   ├── ui/                 Sidebar, topbar, modals, toast, shell
│   ├── modules/            All feature modules (86 routes)
│   ├── integrations/       QR, print, Excel
│   ├── mobile/             Touch and mobile optimizations
│   └── workers/            Background workers
├── html/
│   ├── partials/           HTML fragments
│   └── templates/          Print templates
├── data/demo/              Seed/demo data (JSON)
├── docs/                   Documentation
│   ├── sql/                SQL migrations 001-009
│   └── *.md                Architecture, workflows, permissions
└── tests/                  Jest test suites (13 files)
```

---

## Architecture Principles

1. **Single-page app** — `index.html` is the only entry point. Router lazy-loads module JS.
2. **No framework, no bundler** — plain `<script>` tags, global functions, `window.renderXxx`.
3. **Supabase as backend** — all data via PostgREST. RLS enforced on every table.
4. **Holiday mode** — two modes: NORMAL and HOLIDAY. Mode stored in `school_settings`.
   Sidebar is the single source of truth for period switching.
5. **Historical roster** — `getHistoricalRoster(classId, termId, yearId)` uses
   `class_enrollments` for accurate student counts at any point in time.
6. **Class teacher access** — `canAccessClass(classId)` enforced before any class data render.
7. **Full context on every write** — every DB insert/update includes `academic_year_id`,
   `term_id`, timestamps, and actor (who did it).
8. **Audit trail** — every action logged via `logAction()` to `system_logs`.
9. **Offline-first** — service worker caches all static assets. Writes queued when offline.

---

## Roles

| Role | Access |
|---|---|
| `admin` | Full access to everything |
| `teacher` | Marks entry, class register, reports — own class only |
| `accountant` | Finance modules — all classes |

---

## SQL Migrations

Run in order in Supabase SQL Editor. See `docs/sql/README.md` for full details.

| File | Status |
|---|---|
| `001_enable_rls_baseline.sql` | Run |
| `002_tighten_delete_protection.sql` | Run |
| `003_hash_passwords.sql` | Run |
| `004_fix_unexplained_policies.sql` | Run |
| `005_server_side_lockout.sql` | Run |
| `006_google_oauth_login.sql` | Run |
| `007_holiday_sessions.sql` | Run |
| `008_qr_snapshots.sql` | Run |
| `009_second_sitting.sql` | Run |

---

## Development

```bash
# Run tests
npm test

# Serve locally
npx serve .

# No build step needed — edit JS/CSS files directly
```

---

## School Information

École La Fontaine · Rubavu, Rwanda · Ecole Primaire  
System version: v9.0.0  
Database: Supabase (PostgreSQL 15)
