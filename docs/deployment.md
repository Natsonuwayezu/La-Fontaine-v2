# Deployment

## Hosting

This is a static site (HTML/CSS/JS, no build step) — any static host works: GitHub Pages, Netlify, Vercel, a plain nginx/Apache server, etc. The one requirement is **serving over `https://` (or `http://` for local testing)**, never `file://` — both the Supabase fetches and the service worker registration (`/sw.js`, absolute-pathed) need a real origin.

Because `sw.js` registers at the root path (`navigator.serviceWorker.register('/sw.js', ...)` in `core/pwa.js`), the app must be deployed at a domain/subdomain root or a host that supports rewriting so `/sw.js` resolves correctly — it won't work cleanly from a non-root subpath (e.g. `example.com/la-fontaine/`) without adjusting the registration scope.

## Supabase project

1. Set up tables per `database-schema.md`.
2. Point `js/config/supabase-config.js` at the production project URL/anon key (or use the in-app Database Connection panel post-deploy — see `setup-guide.md`).
3. Set Row Level Security policies appropriate to the three roles (`admin`, `accountant`, `teacher`) — this repo's client-side `permissions.js`/`role-permissions.js` checks are **not** a substitute for RLS; they only control what the UI shows, not what the database will actually accept.

## PWA / offline

- `sw.js` (service worker) and `site.webmanifest` are both present at the repo root.
- `core/pwa.js` generates the web manifest **dynamically at runtime** from `state.schoolSettings` (school name/motto/logo) rather than relying solely on the static `site.webmanifest` — see the `generateManifest()` function there.
- The offline-cache file list (used by both `sw.js` and `core/pwa.js`) is the `PWA_CACHE_FILES` array in `core/pwa.js` — if you add new core files that should be available offline, add them there too.
- `offline.html` is the fallback page shown with no connectivity and no cached page match.
- Marks and payments entered while offline queue into IndexedDB (`core/offline.js`) and sync automatically once connectivity returns (`core/sync-engine.js`).

## Cache-busting

`router.js` appends `?v=${APP_VERSION}` to every dynamically-loaded module script URL (`APP_CONFIG` in `constants.js` — actually `APP_VERSION`, check that constant exists and is bumped on release). Bump this on each deploy so returning users' browsers/service-worker caches pick up new module code rather than serving a stale cached copy.

## What's not production-ready yet

- No CI/CD pipeline exists in this repo (no `.github/workflows`, no build/deploy script).
- No environment-variable convention — Supabase credentials are read from a JS file / localStorage, not `.env`. Don't commit real credentials.
- The Finance and Attendance modules are still empty — don't deploy this as a finance-of-record system until those are built (see `finance-workflow.md` and the project root's audit notes).
