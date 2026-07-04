/**
 * ECOLE LA FONTAINE — Main Entry Point
 * Initializes the entire application, loads all modules, and starts the app
 * Last updated: 2026-07-03
 * 
 * CHANGES:
 * - Added academic year initialization on boot
 * - Loads year-specific data after login
 * - Sets up year filter from saved preference
 * - Handles year switching at app level
 * - Initializes term progress with selected year
 */

// ──────────────────────────────────────────────────────────────────────
// IMPORTS — All core modules are loaded via script tags in index.html
// This file serves as the application orchestrator
// ──────────────────────────────────────────────────────────────────────

// ──────────────────────────────────────────────────────────────────────
// APPLICATION STATE
// ──────────────────────────────────────────────────────────────────────

import { initOfflineSupport } from './core/offline.js';

let appInitialized = false;
let bootTime = Date.now();

// ──────────────────────────────────────────────────────────────────────
// MAIN INITIALIZATION
// ──────────────────────────────────────────────────────────────────────

/**
 * Main application entry point
 * Called from DOMContentLoaded event in index.html
 */
async function initApplication() {
    if (appInitialized) {
        console.warn('[Main] App already initialized');
        return;
    }

    console.log('🚀 ECOLE LA FONTAINE v9.0 — Initializing...');

    try {
        // ── 1. Initialize core systems ──
        initParticles();
        initTheme();
        initOfflineSupport();
        initPWA();
        initBackToTop();

        // ── 2. Initialize UI components ──
        initSidebar();
        initUserDropdown();
        initNotifications();

        // ── 3. Check for existing session ──
        const storedUser = checkAuth();

        if (storedUser) {
            // ── 4. User is logged in — boot the app ──
            state.currentUser = storedUser;

            // ── 5. Restore saved year preference ──
            const savedYearId = localStorage.getItem('elf_selected_year');
            if (savedYearId) {
                state.filters = state.filters || {};
                state.filters.academic_year_id = parseInt(savedYearId);
            }

            await bootApp(storedUser);
        } else {
            // ── 6. Show login page ──
            showLoginPage();
        }

        // ── 7. Setup global event listeners ──
        setupGlobalEventListeners();

        // ── 8. Mark as initialized ──
        appInitialized = true;
        bootTime = Date.now();

        console.log(`✅ ECOLE LA FONTAINE v9.0 — Initialized in ${Date.now() - bootTime}ms`);

    } catch (error) {
        console.error('[Main] Initialization failed:', error);
        showToast('⚠️ Failed to initialize application. Please refresh the page.', 'error');
    }
}

// ──────────────────────────────────────────────────────────────────────
// SHOW LOGIN PAGE
// ──────────────────────────────────────────────────────────────────────

function showLoginPage() {
    const loginPage = document.getElementById('login-page');
    const appPage = document.getElementById('app-page');

    if (loginPage) loginPage.style.display = 'flex';
    if (appPage) appPage.style.display = 'none';

    // Reset login form
    const cardWrap = document.getElementById('card-wrap');
    if (cardWrap) cardWrap.classList.remove('open');

    const passwordInput = document.getElementById('login-password');
    if (passwordInput) passwordInput.value = '';

    const alertEl = document.getElementById('login-alert');
    if (alertEl) alertEl.style.display = 'none';

    // Check for biometric support
    if (typeof initBiometricSupport === 'function') {
        initBiometricSupport();
    }
}

// ──────────────────────────────────────────────────────────────────────
// SETUP GLOBAL EVENT LISTENERS
// ──────────────────────────────────────────────────────────────────────

function setupGlobalEventListeners() {
    // ── Keyboard shortcuts ──
    document.addEventListener('keydown', function (e) {
        // Ctrl+K or Cmd+K → command palette (future)
        if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
            e.preventDefault();
            // Open command palette (future implementation)
            console.log('[Main] Command palette triggered');
        }

        // Escape key handling
        if (e.key === 'Escape') {
            // Close modals
            if (typeof closeModal === 'function') {
                const modals = document.querySelectorAll('.modal-overlay');
                if (modals.length > 0) {
                    closeModal();
                }
            }
            // Close sidebar on mobile
            if (typeof closeSidebarMobile === 'function') {
                closeSidebarMobile();
            }
            // Close user dropdown
            const dd = document.getElementById('user-dropdown');
            if (dd) dd.classList.remove('open');
        }
    });

    // ── Window resize ──
    let resizeTimeout;
    window.addEventListener('resize', function () {
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(() => {
            // Close mobile sidebar on resize to desktop
            if (window.innerWidth > 768) {
                if (typeof closeSidebarMobile === 'function') {
                    closeSidebarMobile();
                }
            }
            // Update any responsive elements
        }, 250);
    });

    // ── Online/offline status ──
    window.addEventListener('online', function () {
        showToast('📶 Internet connection restored', 'success', 3000);
        if (typeof syncOfflineMarks === 'function') {
            syncOfflineMarks();
        }
        // Refresh year data if needed
        if (state.currentUser) {
            refreshYearDataIfNeeded();
        }
    });

    window.addEventListener('offline', function () {
        showToast('📴 Internet connection lost — working offline', 'warning', 3000);
    });

    // ── Before unload — save session and year preference ──
    window.addEventListener('beforeunload', function () {
        const user = state.currentUser;
        if (user) {
            localStorage.setItem('elf_last_login', new Date().toISOString());
        }
        // Save current year preference
        const yearId = state.filters?.academic_year_id || state.currentAcadYear?.id;
        if (yearId) {
            localStorage.setItem('elf_selected_year', String(yearId));
        }
    });

    // ── Visibility change — refresh notifications on return ──
    document.addEventListener('visibilitychange', function () {
        if (document.visibilityState === 'visible' && state.currentUser) {
            if (typeof fetchUnreadNotifications === 'function') {
                fetchUnreadNotifications();
            }
            // Refresh year data if needed
            refreshYearDataIfNeeded();
        }
    });

    // ── Click outside to close dropdowns ──
    document.addEventListener('click', function (e) {
        // User dropdown
        const dd = document.getElementById('user-dropdown');
        if (dd && !e.target.closest('.user-menu') && !e.target.closest('.user-dropdown')) {
            dd.classList.remove('open');
        }

        // Sidebar overlay
        const sidebar = document.getElementById('sidebar');
        if (sidebar?.classList.contains('mobile-open') &&
            !e.target.closest('.sidebar') &&
            !e.target.closest('#menu-toggle')) {
            if (typeof closeSidebarMobile === 'function') {
                closeSidebarMobile();
            }
        }
    });

    // ── Modal overlay click to close ──
    document.getElementById('modals-container')?.addEventListener('click', function (e) {
        if (e.target.classList.contains('modal-overlay')) {
            if (typeof closeModal === 'function') {
                closeModal();
            }
        }
    });

    console.log('[Main] Global event listeners registered');
}

// ──────────────────────────────────────────────────────────────────────
// REFRESH YEAR DATA IF NEEDED
// ──────────────────────────────────────────────────────────────────────

async function refreshYearDataIfNeeded() {
    const currentYearId = state.filters?.academic_year_id || state.currentAcadYear?.id;
    if (!currentYearId) return;

    // Check if data is stale (older than 5 minutes)
    const lastUpdate = state.cache?.lastUpdate || 0;
    if (Date.now() - lastUpdate > 5 * 60 * 1000) {
        if (typeof refreshYearData === 'function') {
            await refreshYearData(currentYearId);
        }
    }
}

// ──────────────────────────────────────────────────────────────────────
// INIT PARTICLES
// ──────────────────────────────────────────────────────────────────────

function initParticles() {
    const container = document.getElementById('particles-bg');
    if (!container) return;

    const colors = ['#00b4d8', '#c9a84c', '#e07a5f', '#3b82f6', '#10b981'];
    const count = 24;

    for (let i = 0; i < count; i++) {
        const particle = document.createElement('div');
        particle.className = 'particle';
        const size = 4 + Math.random() * 20;
        const color = colors[Math.floor(Math.random() * colors.length)];
        particle.style.cssText = `
            width: ${size}px;
            height: ${size}px;
            left: ${Math.random() * 100}%;
            top: ${Math.random() * 100}%;
            background: ${color};
            opacity: ${0.05 + Math.random() * 0.15};
            animation-duration: ${8 + Math.random() * 15}s;
            animation-delay: ${-Math.random() * 20}s;
            position: absolute;
            border-radius: 50%;
            pointer-events: none;
        `;
        container.appendChild(particle);
    }

    console.log('[Main] Particles initialized');
}

// ──────────────────────────────────────────────────────────────────────
// INIT BACK TO TOP BUTTON
// ──────────────────────────────────────────────────────────────────────

function initBackToTop() {
    const btn = document.getElementById('back-to-top');
    if (!btn) {
        // Create back-to-top button if it doesn't exist
        const newBtn = document.createElement('button');
        newBtn.id = 'back-to-top';
        newBtn.innerHTML = '⬆';
        newBtn.style.cssText = `
            position: fixed;
            bottom: 80px;
            right: 20px;
            width: 44px;
            height: 44px;
            border-radius: 50%;
            background: var(--role-primary);
            color: white;
            border: none;
            font-size: 20px;
            cursor: pointer;
            box-shadow: var(--shadow-lg);
            z-index: 100;
            display: none;
            transition: all 0.3s ease;
        `;
        document.body.appendChild(newBtn);
    }

    const button = document.getElementById('back-to-top');
    if (button) {
        window.addEventListener('scroll', function () {
            button.style.display = window.scrollY > 300 ? 'flex' : 'none';
        }, { passive: true });

        button.addEventListener('click', function () {
            window.scrollTo({ top: 0, behavior: 'smooth' });
        });
    }
}

// ──────────────────────────────────────────────────────────────────────
// YEAR STATE INITIALIZATION
// ──────────────────────────────────────────────────────────────────────

/**
 * Initialize academic year state after login
 * Restores saved year preference or uses current active year
 */
export function initYearState() {
    const currentYear = getCurrentAcademicYear();
    const savedYearId = localStorage.getItem('elf_selected_year');

    // Try to use saved year first
    let yearId = savedYearId ? parseInt(savedYearId) : null;

    // Validate saved year exists
    if (yearId) {
        const yearExists = (state.academicYears || []).some(y => y.id === yearId);
        if (!yearExists) {
            yearId = null;
        }
    }

    // Fallback to current active year
    if (!yearId) {
        yearId = currentYear?.id || null;
    }

    // Set the filter
    if (yearId) {
        state.filters = state.filters || {};
        state.filters.academic_year_id = yearId;
        localStorage.setItem('elf_selected_year', String(yearId));
    }

    // Update current academic year
    const year = (state.academicYears || []).find(y => y.id === yearId);
    if (year) {
        state.currentAcadYear = year;
    }

    console.log('[Main] Year state initialized:', {
        yearId,
        yearName: year?.name,
        savedYearId,
        isActive: year?.is_active
    });

    return yearId;
}

// ──────────────────────────────────────────────────────────────────────
// EXPOSE GLOBALLY
// ──────────────────────────────────────────────────────────────────────

// Ensure all critical functions are available globally
window.initApplication = initApplication;
window.initParticles = initParticles;
window.showLoginPage = showLoginPage;
window.setupGlobalEventListeners = setupGlobalEventListeners;
window.initBackToTop = initBackToTop;
window.initYearState = initYearState;

// ──────────────────────────────────────────────────────────────────────
// AUTO-START ON DOM READY
// ──────────────────────────────────────────────────────────────────────

// The DOMContentLoaded event handler in index.html calls initApplication
// This is a safety net in case the inline script fails
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApplication);
} else {
    // DOM already loaded, start immediately
    initApplication();
}

console.log('✅ main.js loaded — ready to initialize');