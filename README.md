# Ecole La Fontaine — School Management System (v9.0)

A browser-based school management system for École La Fontaine (Rubavu, Rwanda), covering student records, academics (marks, report cards, rankings), attendance, finance, staff/timetable management, and communication — built as a plain-script web app backed by Supabase.

## Status at a glance

This is an active rebuild. Not everything is wired up yet — see [`architecture.md`](./architecture.md) for how the pieces fit together and [`changelog.md`](./changelog.md) for what's been done recently.

**Working today:** app boot, login, routing, the full Settings section, the full Staff section (including a manually-built timetable with conflict checking), student records, academic marks entry and report cards, communication (announcements/reminders/notifications), PWA/offline support, and a Jest test suite covering the core calculation logic.

**Not yet built:** the Finance module, the Attendance module, bulk import/export tools, the two holiday-mode variants (`js/modules/holidays/`), the Excel/print/QR integrations (`js/integrations/`), the backup/export engines (`js/core/backup-engine.js`, `js/core/export-engine.js`), and all 18 HTML partial templates (`html/partials/`, `html/templates/`) are still empty placeholder files.

## Quick start

See [`setup-guide.md`](./setup-guide.md) for full setup instructions. In short:

```bash
git clone https://github.com/Natsonuwayezu/La-Fontaine-v2.git
cd La-Fontaine-v2
npm install        # for the test suite only — the app itself has no build step
npm test            # runs the Jest suite (10 suites, ~130 tests)
```

The app itself is a static site — open `index.html` in a browser (via a local server, not `file://` — see the setup guide) once you've configured a Supabase project.

## Tech stack

- **Frontend:** vanilla HTML/CSS/JS — no framework, no bundler, no build step. Every JS file is a classic `<script>` tag (not an ES module); see `architecture.md` for why this matters.
- **Backend:** [Supabase](https://supabase.com) (Postgres + REST API), configured in `js/config/supabase-config.js`.
- **PWA:** service worker + offline IndexedDB queue for marks/payments (`js/core/pwa.js`, `js/core/offline.js`).
- **Tests:** Jest + jsdom (`npm test`), with a custom loader (`tests/helpers/load-scripts.js`) that runs the app's plain-script files in the test environment the same way `index.html` does.

## Documentation index

| Doc | Covers |
|---|---|
| [`architecture.md`](./architecture.md) | Folder structure, script loading model, router, module patterns, known gotchas |
| [`setup-guide.md`](./setup-guide.md) | Local dev setup, Supabase configuration, running tests |
| [`database-schema.md`](./database-schema.md) | Every Supabase table this app reads/writes, with columns |
| [`permissions.md`](./permissions.md) | Roles, the two permission systems, module access rules |
| [`academics-workflow.md`](./academics-workflow.md) | Assessments → marks → grading → report cards → ranking |
| [`finance-workflow.md`](./finance-workflow.md) | Intended fee/payment workflow (module not yet built — formulas are) |
| [`deployment.md`](./deployment.md) | Hosting, Supabase project setup, PWA/service-worker notes |
| [`troubleshooting.md`](./troubleshooting.md) | Common errors and how to diagnose them |
| [`changelog.md`](./changelog.md) | Dated log of major changes |

## Project structure (top level)

```
js/
  config/       — constants, navigation, role-permissions, Supabase config
  core/         — state, api, auth, router, formulas, validators, etc.
  ui/           — shell, sidebar, topbar, modals, toast, tables, forms, etc.
  modules/      — one folder per feature area (students, academics, staff,
                  settings, communication, finance*, attendance*, ...)
  workers/      — Web Workers for search/export/reports/analytics
  mobile/       — touch/gesture/responsive-navigation helpers
  integrations/ — xlsx/print/qrcode (*mostly still empty)
css/            — fully built, organized by base/components/layouts/modules/themes
html/           — partials and print templates (*all still empty)
tests/          — Jest suite + the script-loading test helper
docs/           — you are here
tools/          — import-checking scripts used during the ES-module cleanup
```

\* = not yet built, see Status above.
