/**
 * ECOLE LA FONTAINE — Main Entry Point
 * Last updated: 2026-07-04
 */


import { initApp, bootApp } from './core/boot.js';
import { state, getCurrentAcademicYear } from './core/state.js';
import { checkAuth, logout } from './core/auth.js';
import { initTheme } from './ui/theme.js';
import { initSidebar, closeSidebarMobile } from './ui/sidebar.js';
import { initPWA } from './ui/shell.js';
import { initOfflineSupport } from './core/offline.js';
import { initUserDropdown, initNotifications } from './ui/topbar.js';
import { showToast } from './ui/toast.js';
import { closeModal } from './ui/modals.js';
import { openHelpCenter, closeHelpCenter } from './modules/help/help-center.js';

let appInitialized = false;
let bootTime = Date.now();

async function initApplication() {
    // ✅ Guard against double initialization
    if (appInitialized) {
        console.warn('[Main] App already initialized — skipping');
        return;
    }

    console.log('🚀 ECOLE LA FONTAINE v9.0 — Initializing...');

    try {
        initParticles();
        initTheme();
        initOfflineSupport();
        initPWA();
        initBackToTop();

        initSidebar();
        initUserDropdown();
        initNotifications();

        const storedUser = checkAuth();

        if (storedUser) {
            state.currentUser = storedUser;
            const savedYearId = localStorage.getItem('elf_selected_year');
            if (savedYearId) {
                state.filters = state.filters || {};
                state.filters.academic_year_id = parseInt(savedYearId);
            }
            // ✅ Only boot if not already booted
            if (!window._booted) {
                window._booted = true;
                await bootApp(storedUser);
            }
        } else {
            showLoginPage();
        }

        setupGlobalEventListeners();

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
    // ════════════════════════════════════════════════════════════
    //  NEW — Ctrl+K / Cmd+K → Open Help Center
    // ════════════════════════════════════════════════════════════
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();

        // Check if help center is already open
        const container = document.getElementById('help-center-container');
        if (container && container.classList.contains('show')) {
            // If already open, focus the search input
            const input = document.getElementById('help-search-input');
            if (input) input.focus();
        } else {
            // Open help center
            if (typeof openHelpCenter === 'function') {
                openHelpCenter();
            } else {
                console.warn('[Main] Help Center not available');
                showToast('❓ Help Center — Press Ctrl+K to open', 'info', 2000);
            }
        }
        return;
    }
    document.addEventListener('keydown', function (e) {
        // Ctrl+L or Cmd+L → command palette (future)
        if ((e.ctrlKey || e.metaKey) && e.key === 'l') {
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
    let btn = document.getElementById('back-to-top');

    if (!btn) {
        btn = document.createElement('button');
        btn.id = 'back-to-top';
        btn.innerHTML = '⬆';
        btn.setAttribute('aria-label', 'Back to top');
        btn.style.cssText = `
            position: fixed;
            bottom: 90px;
            right: 24px;
            width: 44px;
            height: 44px;
            border-radius: 50%;
            background: var(--role-primary, #1a3a5c);
            color: white;
            border: none;
            font-size: 20px;
            cursor: pointer;
            box-shadow: 0 4px 16px rgba(0, 0, 0, 0.25);
            z-index: 999;
            display: none;
            align-items: center;
            justify-content: center;
            transition: all 0.3s ease;
            opacity: 0;
            transform: translateY(20px) scale(0.9);
        `;

        // Hover effect
        btn.addEventListener('mouseenter', function () {
            this.style.transform = 'scale(1.1)';
            this.style.boxShadow = '0 6px 24px rgba(0, 0, 0, 0.35)';
        });
        btn.addEventListener('mouseleave', function () {
            this.style.transform = 'scale(1)';
            this.style.boxShadow = '0 4px 16px rgba(0, 0, 0, 0.25)';
        });

        // Click to scroll
        btn.addEventListener('click', function () {
            window.scrollTo({ top: 0, behavior: 'smooth' });
        });

        document.body.appendChild(btn);
        console.log('[Main] Back-to-top button created on right side');
    }

    // Show/hide on scroll
    let isVisible = false;
    window.addEventListener('scroll', function () {
        const scrollY = window.scrollY || window.pageYOffset;
        const shouldShow = scrollY > 300;

        if (shouldShow && !isVisible) {
            btn.style.display = 'flex';
            // Trigger animation
            requestAnimationFrame(() => {
                btn.style.opacity = '1';
                btn.style.transform = 'translateY(0) scale(1)';
            });
            isVisible = true;
        } else if (!shouldShow && isVisible) {
            btn.style.opacity = '0';
            btn.style.transform = 'translateY(20px) scale(0.9)';
            setTimeout(() => {
                if (!shouldShow) {
                    btn.style.display = 'none';
                }
            }, 300);
            isVisible = false;
        }
    }, { passive: true });

    // Check initial state
    if (window.scrollY > 300) {
        btn.style.display = 'flex';
        btn.style.opacity = '1';
        btn.style.transform = 'translateY(0) scale(1)';
        isVisible = true;
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