/* ═══════════════════════════════════════════════════════════════════
   js/ui/pwa.js — PWA & Shell UI Helpers
   ═══════════════════════════════════════════════════════════════════
   Manages Progressive Web App features including:
   - Service worker registration
   - Install prompt handling
   - Dynamic manifest generation
   - Offline page caching
   - Back-to-top button

   Relies on state.schoolSettings for school branding in the manifest.

   Last updated: 2026-07-14
   ═══════════════════════════════════════════════════════════════════ */

// state (core/state.js) and showToast (ui/toast.js) are plain-script globals,
// both loaded earlier in index.html — no import needed.
// NOTE: this file is not currently wired into index.html — see project notes;
// js/core/pwa.js already handles service-worker registration and is loaded instead.

/* ═══════════════════════════════════════════════════════════════════
   PWA — Service Worker & Installation
   ═══════════════════════════════════════════════════════════════════ */

let deferredPrompt = null;

/**
 * Initialize PWA support
 */
function initPWA() {
    // Service worker registration
    registerServiceWorker();

    // Install prompt
    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        deferredPrompt = e;
        const btn = document.getElementById('pwa-install-btn');
        if (btn) btn.style.display = 'inline-flex';
        console.log('[PWA] Installation prompt available');
    });

    window.addEventListener('appinstalled', () => {
        deferredPrompt = null;
        const btn = document.getElementById('pwa-install-btn');
        if (btn) btn.style.display = 'none';
        showToast('✅ App installed successfully!', 'success');
        console.log('[PWA] App installed');
    });

    // Generate manifest
    generateManifest();

    // Cache offline page
    cacheOfflinePage();

    // Show install prompt for first-time visitors
    if (!isStandalone() && !localStorage.getItem('pwa_prompt_shown')) {
        setTimeout(() => {
            const btn = document.getElementById('pwa-install-btn');
            if (btn && btn.style.display !== 'none') {
                showToast('📲 Install app for a better experience', 'info', 5000);
                localStorage.setItem('pwa_prompt_shown', 'true');
            }
        }, 3000);
    }

    console.log('[PWA] Initialized');
}

/**
 * Register the service worker
 * @returns {Promise<boolean>} True if registration succeeded
 */
async function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) {
        console.log('[PWA] Service Worker not supported');
        return false;
    }

    const proto = window.location.protocol;
    const host = window.location.hostname;

    // Service Worker requires HTTPS (or localhost)
    if (proto !== 'https:' && host !== 'localhost' && host !== '127.0.0.1') {
        console.log('[PWA] Service Worker requires HTTPS (or localhost)');
        return false;
    }

    try {
        const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
        console.log('[PWA] Service Worker registered:', registration.scope);

        // Check for updates
        registration.addEventListener('updatefound', () => {
            const newWorker = registration.installing;
            if (!newWorker) return;

            newWorker.addEventListener('statechange', () => {
                if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                    showToast('🔄 New version available — refresh to update', 'info', 8000);
                }
            });
        });

        return true;
    } catch (error) {
        console.error('[PWA] Service Worker registration failed:', error);
        return false;
    }
}

/**
 * Generate PWA manifest dynamically from school settings
 */
function generateManifest() {
    const settings = state.schoolSettings || {};
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

/**
 * Cache the offline fallback page
 */
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

/**
 * Check if the app is running in standalone (installed PWA) mode
 * @returns {boolean} True if running as a standalone PWA
 */
function isStandalone() {
    return window.matchMedia('(display-mode: standalone)').matches ||
        window.navigator.standalone === true;
}

/**
 * Trigger the PWA install prompt
 */
async function installPWA() {
    if (!deferredPrompt) {
        showToast('App is already installed or cannot be installed in this browser.', 'info');
        return;
    }

    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;

    if (outcome === 'accepted') {
        showToast('✅ Installing ECOLE LA FONTAINE…', 'success');
    }

    deferredPrompt = null;
    const btn = document.getElementById('pwa-install-btn');
    if (btn) btn.style.display = 'none';
}

/* ═══════════════════════════════════════════════════════════════════
   BACK TO TOP BUTTON
   ═══════════════════════════════════════════════════════════════════ */

/**
 * Initialize the back-to-top button
 */
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

/* ═══════════════════════════════════════════════════════════════════
   EXPOSE TO WINDOW
   ═══════════════════════════════════════════════════════════════════ */

window.installPWA = installPWA;
window.initPWA = initPWA;
window.isStandalone = isStandalone;
window.initBackToTop = initBackToTop;