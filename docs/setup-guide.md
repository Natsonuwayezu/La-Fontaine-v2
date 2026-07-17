# Setup Guide

## Prerequisites

- A modern browser
- [Node.js](https://nodejs.org/) (for running the test suite only — the app itself needs no build step)
- A [Supabase](https://supabase.com) project (free tier is enough for development)
- A local static file server (see "Running the app" below — plain `file://` won't work fully, see note)

## Clone and install

```bash
git clone https://github.com/Natsonuwayezu/La-Fontaine-v2.git
cd La-Fontaine-v2
npm install
```

`npm install` only pulls in Jest and test-related packages (`jest`, `jest-environment-jsdom`, `fake-indexeddb`) — nothing the app itself depends on at runtime. See `package.json`.

## Configure Supabase

1. Create a Supabase project.
2. In the SQL editor, create the tables listed in `database-schema.md` (there's no migration file in this repo yet to run directly — that's a gap worth closing).
3. Open `js/config/supabase-config.js` and set your project URL and anon key — either by editing `DEFAULT_SUPABASE_URL`/`DEFAULT_SUPABASE_KEY` directly, or at runtime via `setSupabaseCredentials(url, key)` (also reachable through the in-app **Settings → Database Connection** panel, `settings/api-settings.js`, once you can log in).

## Running the app

This is a static site with no build step, but it's **not** safe to open `index.html` directly via `file://`:

- Fetches to Supabase and the service-worker registration both behave inconsistently or fail outright under `file://`.
- Use any local static server, for example:
  ```bash
  npx serve .
  # or
  python3 -m http.server 8080
  ```
  then visit `http://localhost:<port>/index.html`.

## Running the tests

```bash
npm test              # run once
npm run test:watch    # watch mode
npm run test:coverage # with coverage
```

The suite doesn't need Supabase, a browser, or the app running — it loads the real source files into a Jest+jsdom environment directly. See `architecture.md`'s "Testing approach" section for how that works, and `tests/helpers/load-scripts.js` for the loader itself.

## Known setup gaps

- **`core/boot.js`, `core/router.js`, `core/auth.js`, `core/window-exposure.js`, `main.js`** are the app's entry point and were empty for a long stretch of this project's history — they're now written, but if you're working from an older checkout, the app won't boot at all until you're on a commit after `core files`/`other modules` in the git history.
- **`html/partials/*.html` and `html/templates/*.html` are all still empty** (18 files) — the shell markup (sidebar, topbar, login screen, modals, print templates) needs to be written before the visual design work in `to-be-changed.txt`-style specs can be finished. Nothing currently renders any real HTML shell for these.
- No `.env` file or environment-variable convention exists yet — Supabase credentials live in `js/config/supabase-config.js` directly (or `localStorage`, once changed via the Settings UI). Don't commit real production credentials to that file.
