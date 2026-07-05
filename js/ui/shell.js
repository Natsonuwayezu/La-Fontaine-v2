/**
 * ECOLE LA FONTAINE — Shell UI Helpers
 * PWA, back-to-top, and other shell utilities
 * Last updated: 2026-06-28
 */


const state = window.state || {}; // global state alias
import { state } from '../core/state.js';
import { showToast } from './toast.js';
import { applySchoolLogo } from './theme.js';

// ──────────────────────────────────────────────────────────────────────
// PWA SUPPORT
// ──────────────────────────────────────────────────────────────────────

let deferredPrompt = null;

/**
 * Initialize PWA support
 */
export function initPWA() {
    // Service worker registration
    registerServiceWorker();
    console.log('[PWA] Initialized');

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

    // Show install prompt
    if (!isStandalone() && !localStorage.getItem('pwa_prompt_shown')) {
        setTimeout(() => {
            const btn = document.getElementById('pwa-install-btn');
            if (btn && btn.style.display !== 'none') {
                showToast('📲 Install app for a better experience', 'info', 5000);
                localStorage.setItem('pwa_prompt_shown', 'true');
            }
        }, 3000);
    }
}

/**
 * Register service worker
 */
async function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) {
        console.log('[PWA] Service Worker not supported');
        return false;
    }
    const proto = window.location.protocol;
    const host = window.location.hostname;
    if (proto !== 'https:' && host !== 'localhost' && host !== '127.0.0.1') {
        console.log('[PWA] Service Worker requires HTTPS (or localhost)');
        return false;
    }
    try {
        const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
        console.log('[PWA] Service Worker registered:', registration.scope);
        return true;
    } catch (error) {
        console.error('[PWA] Service Worker registration failed:', error);
        return false;
    }
}

/**
 * Generate PWA manifest dynamically
 */
function generateManifest() {
    const settings = state.schoolSettings || {};
    const schoolName = settings.school_name || 'ECOLE LA FONTAINE';
    const logo = settings.school_logo || '';
    const fallback = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Crect width='100' height='100' rx='20' fill='%231a3a5c'/%3E%3Ctext x='50' y='70' font-size='60' text-anchor='middle' fill='white'%3E%F0%9F%8F%AB%3C/text%3E%3C/svg%3E";
    const iconSrc = (logo && (logo.startsWith('data:') || logo.startsWith('http'))) ? logo : fallback;

    const manifest = {
        name: schoolName,
        short_name: schoolName.substring(0, 12),
        description: settings.school_motto || 'School Management System',
        start_url: '/',
        display: 'standalone',
        theme_color: '#1a3a5c',
        background_color: '#0f172a',
        icons: [
            { src: iconSrc, sizes: '192x192', type: 'image/png' },
            { src: iconSrc, sizes: '512x512', type: 'image/png' },
        ],
    };

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
 * Cache offline page
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
 * Check if running in standalone mode
 */
export function isStandalone() {
    return window.matchMedia('(display-mode: standalone)').matches ||
        window.navigator.standalone === true;
}

/**
 * Install PWA (trigger install prompt)
 */
export async function installPWA() {
    if (!deferredPrompt) {
        showToast('App is already installed or cannot be installed in this browser.', 'info');
        return;
    }
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') showToast('✅ Installing ECOLE LA FONTAINE…', 'success');
    deferredPrompt = null;
    const btn = document.getElementById('pwa-install-btn');
    if (btn) btn.style.display = 'none';
}

// ──────────────────────────────────────────────────────────────────────
// BACK TO TOP
// ──────────────────────────────────────────────────────────────────────

export function initBackToTop() {
    const btn = document.getElementById('back-to-top');
    if (!btn) return;

    window.addEventListener('scroll', function () {
        btn.style.display = window.scrollY > 300 ? 'flex' : 'none';
    }, { passive: true });

    btn.addEventListener('click', function () {
        window.scrollTo({ top: 0, behavior: 'smooth' });
    });
}

// ──────────────────────────────────────────────────────────────────────
// EXPOSE GLOBALLY
// ──────────────────────────────────────────────────────────────────────

window.installPWA = installPWA;