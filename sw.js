/* ═══════════════════════════════════════════════════════════════════
   sw.js
   ═══════════════════════════════════════════════════════════════════
   Root-level service worker. Registered by js/core/pwa.js's
   registerServiceWorker() via navigator.serviceWorker.register('/sw.js',
   { scope: '/' }).

   PRECACHE_FILES below is a DELIBERATE, MANUAL COPY of pwa.js's
   PWA_CACHE_FILES array — not shared by reference, because this file
   runs in the Service Worker global scope (no `window`, no DOM) and
   pwa.js is written as a plain script that assigns to `window.X`,
   which would throw if importScripts()'d directly into this scope.
   pwa.js's own header comment above that array says exactly this:
   "This list is also referenced in sw.js for the precache list. Keep
   both in sync when adding new files." — so duplication here is the
   intended design, not an oversight. If you add a new CSS/JS file to
   PWA_CACHE_FILES in pwa.js, add it here too.

   Strategy:
     - Same-origin app-shell files (everything in PRECACHE_FILES):
       cache-first, falling back to network, and caching whatever the
       network returns for anything not already precached.
     - Supabase requests (any *.supabase.co host — covers both the
       default project and the documented localStorage sb_url
       override in js/config/supabase-config.js): NEVER cached here.
       Live student/marks/finance data must always hit the network;
       offline queuing for writes is core/offline.js's job, at the
       app layer, not this service worker's.
     - Cross-origin CDN requests (Font Awesome, Tabler icons, Google
       Fonts): left to the browser's own HTTP cache — not intercepted.
     - Navigation requests that fail while offline fall back to
       /offline.html.

   Messages handled (sent via js/core/pwa.js's sendSWMessage()):
     { type: 'SKIP_WAITING' }  — activate the waiting worker immediately
     { type: 'FORCE_UPDATE' }  — re-fetch and re-cache every precached file

   Last updated: 2026-07-19
   ═══════════════════════════════════════════════════════════════════ */

'use strict';

/* ─────────────────────────────────────────────────────────────────
   CACHE VERSIONING
   Bump CACHE_VERSION on any deploy that changes precached file
   contents so activate() cleans up the old cache instead of serving
   stale files forever.
   ───────────────────────────────────────────────────────────────── */

const CACHE_VERSION = 'v9.0.1';
const CACHE_NAME = `lafontaine-shell-${CACHE_VERSION}`;

/* ─────────────────────────────────────────────────────────────────
   PRECACHE FILE LIST — manual copy of pwa.js's PWA_CACHE_FILES.
   Keep both arrays in sync.
   ───────────────────────────────────────────────────────────────── */

const PRECACHE_FILES = [
    // Root
    '/',
    '/index.html',
    '/offline.html',
    '/qr-verify.html',
    '/site.webmanifest',

    // Icons
    '/assets/icons/sprite.svg',
    '/assets/icons/icon-manifest.json',

    // Fonts
    '/assets/fonts/plus-jakarta-sans/PlusJakartaSans-VariableFont_wght.ttf',
    '/assets/fonts/plus-jakarta-sans/PlusJakartaSans-Italic-VariableFont_wght.ttf',
    '/assets/fonts/playfair-display/PlayfairDisplay-Regular.ttf',
    '/assets/fonts/playfair-display/PlayfairDisplay-Italic.ttf',
    '/assets/fonts/dm-sans/DMSans-Regular.ttf',
    '/assets/fonts/dm-sans/DMSans-Medium.ttf',

    // CSS — base
    '/css/base/reset.css',
    '/css/base/variables.css',
    '/css/base/typography.css',

    // CSS — themes
    '/css/themes/dark.css',
    '/css/themes/light.css',

    // CSS — layouts
    '/css/layouts/grid.css',
    '/css/layouts/spacing.css',
    '/css/layouts/positioning.css',

    // CSS — components
    '/css/components/alerts.css',
    '/css/components/badges.css',
    '/css/components/buttons.css',
    '/css/components/cards.css',
    '/css/components/dropdown.css',
    '/css/components/forms.css',
    '/css/components/loaders.css',
    '/css/components/modals.css',
    '/css/components/pagination.css',
    '/css/components/sidebar.css',
    '/css/components/skeleton.css',
    '/css/components/tables.css',
    '/css/components/tabs.css',
    '/css/components/toast.css',
    '/css/components/topbar.css',

    // CSS — modules
    '/css/modules/login.css',
    '/css/modules/dashboard.css',
    '/css/modules/attendance.css',
    '/css/modules/marks.css',
    '/css/modules/class-register.css',
    '/css/modules/assessments.css',
    '/css/modules/reports.css',
    '/css/modules/finance.css',
    '/css/modules/students.css',
    '/css/modules/teachers.css',
    '/css/modules/timetable.css',
    '/css/modules/settings.css',
    '/css/modules/statistics.css',
    '/css/modules/analytics.css',
    '/css/modules/notifications.css',

    // CSS — print
    '/css/print/print.css',
    '/css/print/report-cards-print.css',
    '/css/print/receipts-print.css',
    '/css/print/receipts-thermal-print.css',
    '/css/print/marksheets-print.css',
    '/css/print/statements-print.css',
    '/css/print/transcripts-print.css',

    // CSS — responsive
    '/css/responsive/tablet.css',
    '/css/responsive/mobile.css',
    '/css/responsive/touch.css',
    '/css/responsive/responsive-sidebar.css',
    '/css/responsive/responsive-topbar.css',

    // JS — config
    '/js/config/constants.js',
    '/js/config/supabase-config.js',
    '/js/config/navigation.js',
    '/js/config/role-permissions.js',

    // JS — core
    '/js/core/boot.js',
    '/js/core/state.js',
    '/js/core/api.js',
    '/js/core/auth.js',
    '/js/core/router.js',
    '/js/core/formulas.js',
    '/js/core/academic-formulas.js',
    '/js/core/finance-formulas.js',
    '/js/core/fees.js',
    '/js/core/utils.js',
    '/js/core/validators.js',
    '/js/core/sanitizers.js',
    '/js/core/offline.js',
    '/js/core/sync-engine.js',
    '/js/core/logger.js',
    '/js/core/notifications-engine.js',
    '/js/core/permissions.js',
    '/js/core/cache.js',
    '/js/core/data-loader.js',
    '/js/core/export-engine.js',
    '/js/core/print-engine.js',
    '/js/core/verification-engine.js',
    '/js/core/search-engine.js',
    '/js/core/backup-engine.js',
    '/js/core/error-handler.js',
    '/js/core/pwa.js',
    '/js/core/window-exposure.js',

    // JS — ui
    '/js/ui/shell.js',
    '/js/ui/sidebar.js',
    '/js/ui/topbar.js',
    '/js/ui/modals.js',
    '/js/ui/toast.js',
    '/js/ui/theme.js',
    '/js/ui/tables.js',
    '/js/ui/forms.js',
    '/js/ui/cards.js',
    '/js/ui/charts.js',
    '/js/ui/skeletons.js',
    '/js/ui/dropdowns.js',
    '/js/ui/tabs.js',
    '/js/ui/pagination.js',
    '/js/ui/empty-states.js',
    '/js/ui/tooltips.js',
    '/js/ui/context-menu.js',
    '/js/ui/responsive-ui.js',

    '/js/main.js',
];

/* ─────────────────────────────────────────────────────────────────
   INSTALL — precache the app shell.
   Uses individual cache.put() calls instead of cache.addAll() so a
   single missing/failing file (e.g. a module still mid-development)
   doesn't abort the entire precache — addAll() is all-or-nothing and
   would leave the SW permanently stuck failing to install otherwise.
   ───────────────────────────────────────────────────────────────── */

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) =>
            Promise.all(
                PRECACHE_FILES.map((url) =>
                    fetch(url, { cache: 'no-cache' })
                        .then((response) => {
                            if (response.ok) return cache.put(url, response);
                            console.warn('[SW] Skipped precache (bad response):', url, response.status);
                        })
                        .catch((err) => {
                            console.warn('[SW] Skipped precache (fetch failed):', url, err.message);
                        })
                )
            )
        )
    );
});

/* ─────────────────────────────────────────────────────────────────
   ACTIVATE — drop any cache from a previous CACHE_VERSION.
   ───────────────────────────────────────────────────────────────── */

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((names) =>
            Promise.all(
                names
                    .filter((name) => name.startsWith('lafontaine-shell-') && name !== CACHE_NAME)
                    .map((name) => caches.delete(name))
            )
        ).then(() => self.clients.claim())
    );
});

/* ─────────────────────────────────────────────────────────────────
   HELPERS
   ───────────────────────────────────────────────────────────────── */

function isSupabaseRequest(url) {
    return /(^|\.)supabase\.co$/.test(url.hostname);
}

function isSameOrigin(url) {
    return url.origin === self.location.origin;
}

/* ─────────────────────────────────────────────────────────────────
   FETCH
   ───────────────────────────────────────────────────────────────── */

self.addEventListener('fetch', (event) => {
    const request = event.request;

    if (request.method !== 'GET') return; // never intercept writes

    const url = new URL(request.url);

    // Live backend data — always network, never cached here.
    if (isSupabaseRequest(url)) return;

    // Cross-origin CDN assets (Font Awesome, Tabler, Google Fonts) —
    // leave entirely to the browser's own HTTP cache.
    if (!isSameOrigin(url)) return;

    // Same-origin app shell — cache-first, network fallback, and
    // opportunistically cache anything new the network returns.
    event.respondWith(
        caches.match(request).then((cached) => {
            if (cached) return cached;

            return fetch(request)
                .then((response) => {
                    if (response.ok) {
                        const clone = response.clone();
                        caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
                    }
                    return response;
                })
                .catch(() => {
                    // Offline and not precached — fall back to the offline
                    // page for navigations, otherwise fail honestly.
                    if (request.mode === 'navigate') {
                        return caches.match('/offline.html');
                    }
                    return new Response('', { status: 503, statusText: 'Offline' });
                });
        })
    );
});

/* ─────────────────────────────────────────────────────────────────
   MESSAGE — SKIP_WAITING and FORCE_UPDATE, matching pwa.js's
   sendSWMessage()/forceSWUpdate() exactly.
   ───────────────────────────────────────────────────────────────── */

self.addEventListener('message', (event) => {
    const data = event.data || {};

    if (data.type === 'SKIP_WAITING') {
        self.skipWaiting();
        return;
    }

    if (data.type === 'FORCE_UPDATE') {
        caches.open(CACHE_NAME).then((cache) => {
            PRECACHE_FILES.forEach((url) => {
                fetch(url, { cache: 'reload' })
                    .then((response) => {
                        if (response.ok) cache.put(url, response);
                    })
                    .catch(() => { /* leave whatever was already cached in place */ });
            });
        });
    }
});