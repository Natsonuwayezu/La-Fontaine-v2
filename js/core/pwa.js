/* ═══════════════════════════════════════════════════════════════════
   js/core/pwa.js
   ═══════════════════════════════════════════════════════════════════
   Purpose : Progressive Web App support.
             Service Worker registration, install-to-homescreen
             prompt, update detection and notification, dynamic
             manifest generation, offline page caching, the
             back-to-top button, and the full list of files
             pre-cached for offline use.
   Load order: AFTER error-handler.js — one of the last core files.
   Note: js/ui/pwa.js was a second, overlapping PWA implementation
   (duplicate service-worker registration and install-prompt handling)
   that was never actually loaded by index.html. It has been merged
   into this file — generateManifest(), cacheOfflinePage(), and
   initBackToTop() came from there — and can be deleted from the repo.
   ═══════════════════════════════════════════════════════════════════ */

'use strict';

/* ─────────────────────────────────────────────────────────────────
   INSTALL PROMPT
   ───────────────────────────────────────────────────────────────── */

let _deferredInstallPrompt = null;

/**
 * Capture the browser's beforeinstallprompt event so we can show
 * our own styled "Install App" button at the right time,
 * instead of relying on the browser's default prompt.
 */
window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    _deferredInstallPrompt = e;
    _showInstallButton();
});

/**
 * Show the custom install button in the sidebar footer or topbar.
 */
function _showInstallButton() {
    const btn = document.getElementById('pwa-install-btn');
    if (btn) btn.style.display = 'inline-flex';
}

/**
 * Trigger the native install dialog when the user clicks our install button.
 * Called from the install button's onclick handler.
 */
async function installPWA() {
    if (!_deferredInstallPrompt) {
        if (typeof showToast === 'function') {
            showToast(
                'This app is already installed, or your browser does not support installation.',
                'info',
                4000
            );
        }
        return;
    }

    _deferredInstallPrompt.prompt();
    const { outcome } = await _deferredInstallPrompt.userChoice;

    if (outcome === 'accepted') {
        if (typeof showToast === 'function') {
            showToast('App installed successfully! You can now use it offline.', 'success', 4000);
        }
        await logAction('PWA_INSTALLED', null, null, { outcome });
    }

    _deferredInstallPrompt = null;

    // Hide the install button once installed
    const btn = document.getElementById('pwa-install-btn');
    if (btn) btn.style.display = 'none';
}

/**
 * Handle the appinstalled event — fired when the PWA is added to homescreen.
 */
window.addEventListener('appinstalled', () => {
    _deferredInstallPrompt = null;
    const btn = document.getElementById('pwa-install-btn');
    if (btn) btn.style.display = 'none';
    console.info('[PWA] App installed to homescreen.');
});

/* ─────────────────────────────────────────────────────────────────
   SERVICE WORKER REGISTRATION
   ───────────────────────────────────────────────────────────────── */

let _swRegistration = null;

/**
 * Register the service worker (sw.js at root).
 * Must be called once at boot after the DOM is ready.
 */
async function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) {
        console.warn('[PWA] Service Workers are not supported in this browser.');
        return null;
    }

    try {
        const reg = await navigator.serviceWorker.register('/sw.js', {
            scope: '/',
        });

        _swRegistration = reg;
        console.info('[PWA] Service Worker registered. Scope:', reg.scope);

        // Listen for updates
        reg.addEventListener('updatefound', () => {
            const newWorker = reg.installing;
            if (!newWorker) return;

            newWorker.addEventListener('statechange', () => {
                if (
                    newWorker.state === 'installed' &&
                    navigator.serviceWorker.controller
                ) {
                    // New SW installed and old one still in control — show update prompt
                    _showUpdateNotification(reg);
                }
            });
        });

        // Check for updates every 60 minutes
        setInterval(() => reg.update().catch(() => { }), 60 * 60 * 1000);

        return reg;

    } catch (err) {
        console.error('[PWA] Service Worker registration failed:', err.message);
        return null;
    }
}

/* ─────────────────────────────────────────────────────────────────
   UPDATE NOTIFICATION
   ───────────────────────────────────────────────────────────────── */

/**
 * Show a banner telling the user a new version is available.
 * The user can click "Update" to reload and activate the new SW.
 */
function _showUpdateNotification(reg) {
    const existing = document.getElementById('pwa-update-banner');
    if (existing) return; // already shown

    const banner = document.createElement('div');
    banner.id = 'pwa-update-banner';
    banner.className = 'pwa-update-banner';
    banner.setAttribute('role', 'alert');
    banner.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
             stroke="currentColor" stroke-width="2">
            <polyline points="23 4 23 10 17 10"/>
            <path d="M20.49 15a9 9 0 11-2.12-9.36L23 10"/>
        </svg>
        <span>A new version of this app is available.</span>
        <button class="btn btn-sm" onclick="window.applyPWAUpdate()">Update now</button>
        <button class="pwa-update-dismiss" onclick="this.parentElement.remove()">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
                 stroke="currentColor" stroke-width="2">
                <line x1="18" y1="6" x2="6" y2="18"/>
                <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
        </button>`;

    // Insert at top of body, above topbar
    document.body.insertBefore(banner, document.body.firstChild);

    // Store reg for applyPWAUpdate
    window._pendingSwReg = reg;
}

/**
 * Activate the waiting service worker and reload the page.
 * Called when the user clicks "Update now".
 */
function applyPWAUpdate() {
    const reg = window._pendingSwReg || _swRegistration;
    if (reg && reg.waiting) {
        reg.waiting.postMessage({ type: 'SKIP_WAITING' });
    }
    // Reload after a short delay to let the new SW take control
    setTimeout(() => location.reload(), 200);
}

/**
 * Listen for the new SW taking control, then reload automatically.
 */
navigator.serviceWorker?.addEventListener('controllerchange', () => {
    if (document.visibilityState === 'visible') {
        location.reload();
    }
});

/* ─────────────────────────────────────────────────────────────────
   CACHE MANIFEST
   This list is also referenced in sw.js for the precache list.
   Keep both in sync when adding new files.
   ───────────────────────────────────────────────────────────────── */

const PWA_CACHE_FILES = [
    // Root
    '/',
    '/index.html',
    '/offline.html',
    '/qr-verify.html',
    '/site.webmanifest',

    // Icons sprite
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

    // CSS — components (all)
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
   DISPLAY MODE DETECTION
   ───────────────────────────────────────────────────────────────── */

/**
 * Return 'standalone' if the app is running as an installed PWA,
 * 'browser' otherwise. Used for conditional UI (e.g. hide address bar notice).
 */
function getPWADisplayMode() {
    if (window.matchMedia('(display-mode: standalone)').matches) return 'standalone';
    if (window.navigator.standalone === true) return 'standalone'; // iOS Safari
    return 'browser';
}

/**
 * True if running as installed PWA.
 */
function isInstalledPWA() {
    return getPWADisplayMode() === 'standalone';
}

/* ─────────────────────────────────────────────────────────────────
   DYNAMIC MANIFEST
   ───────────────────────────────────────────────────────────────── */
/* Merged in from js/ui/pwa.js — builds the web app manifest at runtime
   from the school's own branding (name, motto, logo) in
   state.schoolSettings, instead of a static manifest file. Should be
   called once during app init (from boot.js, once written). */

function generateManifest() {
    const settings = (typeof state !== 'undefined' && state.schoolSettings) || {};
    const schoolName = settings.school_name || 'ECOLE LA FONTAINE';
    const motto = settings.school_motto || 'School Management System';
    const logo = settings.school_logo || '';

    // Fallback icon if no logo is set
    const fallbackIcon = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Crect width='100' height='100' rx='20' fill='%232d1f3a'/%3E%3Ctext x='50' y='70' font-size='60' text-anchor='middle' fill='%23f0ebe6'%3E%F0%9F%8F%AB%3C/text%3E%3C/svg%3E";

    const iconSrc = (logo && (logo.startsWith('data:') || logo.startsWith('http'))) ? logo : fallbackIcon;

    const manifest = {
        name: schoolName,
        short_name: schoolName.substring(0, 12),
        description: motto,
        start_url: '/',
        display: 'standalone',
        theme_color: '#2d1f3a',
        background_color: '#1a1410',
        icons: [
            { src: iconSrc, sizes: '192x192', type: 'image/png' },
            { src: iconSrc, sizes: '512x512', type: 'image/png' }
        ]
    };

    // Inject the manifest into the page
    const blob = new Blob([JSON.stringify(manifest)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    let link = document.querySelector('link[rel="manifest"]');
    if (!link) {
        link = document.createElement('link');
        link.rel = 'manifest';
        document.head.appendChild(link);
    }
    link.href = url;
}

/* ─────────────────────────────────────────────────────────────────
   OFFLINE PAGE CACHING
   ───────────────────────────────────────────────────────────────── */
/* Merged in from js/ui/pwa.js — immediately caches offline.html on init,
   as a fallback alongside the service worker's own install-time caching
   (offline.html is also listed in PWA_CACHE_FILES below). */

async function cacheOfflinePage() {
    if (!('caches' in window)) return;

    try {
        const cache = await caches.open('ecole-cache-v1');
        await cache.add('/offline.html');
        console.log('[PWA] Offline page cached');
    } catch (err) {
        console.warn('[PWA] Could not cache offline page:', err.message);
    }
}

/* ─────────────────────────────────────────────────────────────────
   BACK TO TOP BUTTON
   ───────────────────────────────────────────────────────────────── */
/* Merged in from js/ui/pwa.js — the only UI-facing feature that file had
   which this one didn't. Expects an element with id="back-to-top" in the
   page shell. Should be called once during app init. */

function initBackToTop() {
    const btn = document.getElementById('back-to-top');
    if (!btn) return;

    // Show/hide based on scroll position
    window.addEventListener('scroll', () => {
        btn.style.display = window.scrollY > 300 ? 'flex' : 'none';
    }, { passive: true });

    // Scroll to top on click
    btn.addEventListener('click', () => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
    });
}

/* ─────────────────────────────────────────────────────────────────
   SW MESSAGE PASSING
   ───────────────────────────────────────────────────────────────── */

/**
 * Send a message to the active service worker.
 * Used to trigger SKIP_WAITING and other SW commands.
 */
function sendSWMessage(message) {
    if (navigator.serviceWorker?.controller) {
        navigator.serviceWorker.controller.postMessage(message);
    }
}

/**
 * Force the SW to re-cache all PWA_CACHE_FILES.
 * Useful after a deploy. Called from system-health.js.
 */
function forceSWUpdate() {
    sendSWMessage({ type: 'FORCE_UPDATE' });
    if (_swRegistration) {
        _swRegistration.update().catch(() => { });
    }
}

/* ─────────────────────────────────────────────────────────────────
   SW STATUS CHECK
   ───────────────────────────────────────────────────────────────── */

/**
 * Return the current service worker status for the health dashboard.
 * @returns {{ supported, registered, active, waiting, scope }}
 */
async function getSWStatus() {
    if (!('serviceWorker' in navigator)) {
        return { supported: false, registered: false, active: false, waiting: false, scope: '' };
    }

    const reg = await navigator.serviceWorker.getRegistration('/').catch(() => null);
    if (!reg) {
        return { supported: true, registered: false, active: false, waiting: false, scope: '' };
    }

    return {
        supported: true,
        registered: true,
        active: !!reg.active,
        waiting: !!reg.waiting,
        scope: reg.scope || '/',
        updateFound: !!reg.installing,
    };
}

/* ─────────────────────────────────────────────────────────────────
   EXPOSE
   ───────────────────────────────────────────────────────────────── */

window.installPWA = installPWA;
window.applyPWAUpdate = applyPWAUpdate;
window.registerServiceWorker = registerServiceWorker;
window.getPWADisplayMode = getPWADisplayMode;
window.isInstalledPWA = isInstalledPWA;
window.isStandalone = isInstalledPWA; // alias — js/ui/pwa.js (now merged in) called this isStandalone()
window.sendSWMessage = sendSWMessage;
window.forceSWUpdate = forceSWUpdate;
window.getSWStatus = getSWStatus;
window.PWA_CACHE_FILES = PWA_CACHE_FILES;
window.generateManifest = generateManifest;
window.cacheOfflinePage = cacheOfflinePage;
window.initBackToTop = initBackToTop;