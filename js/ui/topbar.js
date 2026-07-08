/**
 * ECOLE LA FONTAINE — Topbar Component
 * Last updated: 2026-07-07
 */

import { state, getCurrentUser, getCurrentAcademicYear, getTermsByYear } from '../core/state.js';
import { updateNotificationBadge } from '../core/notifications.js';
import { navigateTo } from '../core/router.js';
import { logout } from '../core/auth.js';
import { showProfileModal, showChangePasswordModal } from './modals.js';
import { toggleTheme, getCurrentTheme } from './theme.js';
import { getCurrentPhase, termProgress } from '../core/formulas.js';
import { showToast } from './toast.js';
import { esc } from '../core/utils.js';

// ──────────────────────────────────────────────────────────────────────
// RENDER TOPBAR
// ──────────────────────────────────────────────────────────────────────

export function renderTopbar() {
    const user = getCurrentUser();
    if (!user) return;

    updateTopbarUser(user);
    updateNotificationBadge();
    updateDateTime();
    updateTopbarYearAndTerm();
    updateThemeUI();

    // Start clock
    if (!window._clockInterval) {
        window._clockInterval = setInterval(updateDateTime, 30000);
    }
}

// ──────────────────────────────────────────────────────────────────────
// UPDATE TOPBAR USER
// ──────────────────────────────────────────────────────────────────────

export function updateTopbarUser(user) {
    if (!user) return;

    const nameEl = document.getElementById('topbarUserName');
    const roleEl = document.getElementById('topbarUserRole');
    const avatarEl = document.getElementById('topbarUserAvatar');
    const dropdownAvatar = document.querySelector('.dropdown-header .user-avatar');
    const dropdownName = document.querySelector('.dropdown-header .user-info .name');

    const displayName = user.name || user.username || 'User';
    const displayRole = user.role ? user.role.charAt(0).toUpperCase() + user.role.slice(1) : '—';
    const initials = displayName.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);

    if (nameEl) nameEl.textContent = displayName;
    if (roleEl) roleEl.textContent = displayRole;
    if (avatarEl) avatarEl.textContent = initials || '👤';
    if (dropdownAvatar) dropdownAvatar.textContent = initials || '👤';
    if (dropdownName) dropdownName.textContent = displayName;

    // Also update sidebar
    updateSidebarUser(user);
}

// ──────────────────────────────────────────────────────────────────────
// UPDATE DATE & TIME
// ──────────────────────────────────────────────────────────────────────

export function updateDateTime() {
    const now = new Date();
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    const dayEl = document.getElementById('currentDay');
    const monthEl = document.getElementById('currentMonth');
    const yearEl = document.getElementById('currentYear');
    const timeEl = document.getElementById('currentTime');

    if (dayEl) dayEl.textContent = now.getDate();
    if (monthEl) monthEl.textContent = months[now.getMonth()];
    if (yearEl) yearEl.textContent = now.getFullYear();

    if (timeEl) {
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        timeEl.textContent = `${hours}:${minutes}`;
    }
}

// ──────────────────────────────────────────────────────────────────────
// UPDATE THEME UI
// ──────────────────────────────────────────────────────────────────────

export function updateThemeUI() {
    const theme = getCurrentTheme() || 'dark';
    const icon = document.getElementById('dropdownThemeIcon');
    const label = document.getElementById('dropdownThemeLabel');

    if (icon) {
        icon.className = theme === 'dark' ? 'fa-solid fa-moon' : 'fa-solid fa-sun';
    }
    if (label) {
        label.textContent = theme === 'dark' ? 'Dark Mode' : 'Light Mode';
    }
}

// ──────────────────────────────────────────────────────────────────────
// UPDATE TOPBAR YEAR & TERM
// ──────────────────────────────────────────────────────────────────────

export function updateTopbarYearAndTerm() {
    const selectedYearId = state.filters?.academic_year_id || state.currentAcadYear?.id;
    const selectedYear = (state.academicYears || []).find(y => y.id === selectedYearId);
    const currentYear = getCurrentAcademicYear();

    const isActiveYear = selectedYear?.is_active === true;
    const isCurrentYear = selectedYear?.id === currentYear?.id;

    const terms = getTermsByYear(selectedYearId);
    const today = new Date().toISOString().split('T')[0];

    let activeTerm = null;
    let progress = 0;
    let daysLeft = 0;
    let termDisplay = 'No Term';

    if (terms.length > 0) {
        for (const term of terms) {
            if (term.start_date && term.end_date) {
                if (today >= term.start_date && today <= term.end_date) {
                    activeTerm = term;
                    break;
                }
            }
        }

        if (!activeTerm) {
            const firstTerm = terms[0];
            const lastTerm = terms[terms.length - 1];
            if (firstTerm?.start_date && today < firstTerm.start_date) {
                activeTerm = firstTerm;
                progress = 0;
            } else if (lastTerm?.end_date && today > lastTerm.end_date) {
                activeTerm = lastTerm;
                progress = 100;
            } else {
                activeTerm = firstTerm || terms[0];
            }
        }

        if (activeTerm) {
            const prog = termProgress(activeTerm);
            progress = prog.pct;
            daysLeft = prog.daysLeft;
            termDisplay = activeTerm.name || `Term ${activeTerm.term_number || 1}`;
        }
    }

    // ─── Update DOM ──────────────────────────────────────────────────

    // Academic Year
    const yearEl = document.getElementById('academicYear');
    if (yearEl) {
        yearEl.textContent = selectedYear?.name || '2025 – 2026';
    }

    // Term
    const termEl = document.getElementById('termDisplay');
    if (termEl) {
        termEl.textContent = termDisplay;
    }

    // Status Dot
    const statusDot = document.getElementById('yearStatus');
    if (statusDot) {
        if (!isActiveYear || !isCurrentYear) {
            statusDot.className = 'status-dot locked';
            statusDot.textContent = '🔒';
            statusDot.style.fontSize = '10px';
            statusDot.style.display = 'inline-flex';
            statusDot.style.alignItems = 'center';
            statusDot.style.justifyContent = 'center';
            statusDot.style.width = '14px';
            statusDot.style.height = '14px';
            statusDot.style.borderRadius = '50%';
            statusDot.style.background = 'var(--warning)';
            statusDot.style.color = '#0a1628';
        } else {
            statusDot.className = 'status-dot active';
            statusDot.textContent = '';
            statusDot.style.fontSize = '';
            statusDot.style.display = '';
            statusDot.style.width = '6px';
            statusDot.style.height = '6px';
            statusDot.style.borderRadius = '50%';
            statusDot.style.background = 'var(--success)';
        }
    }

    // Progress Bar
    const fillEl = document.getElementById('progressFill');
    const textEl = document.getElementById('progressText');
    if (fillEl && textEl) {
        const pct = Math.min(100, progress);
        fillEl.style.width = pct + '%';
        textEl.textContent = pct + '%';

        if (pct >= 100) {
            fillEl.style.background = 'var(--success)';
        } else if (!isActiveYear) {
            fillEl.style.background = 'var(--warning)';
        } else {
            fillEl.style.background = 'linear-gradient(90deg, var(--accent), var(--success))';
        }
    }

    // Days Left
    const daysEl = document.getElementById('daysLeft');
    if (daysEl) {
        if (progress >= 100) {
            daysEl.textContent = '0';
        } else if (daysLeft > 0) {
            daysEl.textContent = daysLeft;
        } else {
            daysEl.textContent = '—';
        }
    }

    // Phase Badge
    const phaseEl = document.getElementById('phaseBadge');
    if (phaseEl) {
        const phase = activeTerm ? getCurrentPhase(activeTerm) : 'post_midterm';

        if (progress >= 100) {
            phaseEl.textContent = '✅ Complete';
            phaseEl.className = 'phase-badge complete';
        } else if (progress === 0 && activeTerm?.start_date && today < activeTerm.start_date) {
            phaseEl.textContent = '⏳ Upcoming';
            phaseEl.className = 'phase-badge upcoming';
        } else if (!isActiveYear) {
            phaseEl.textContent = '🔒 Locked';
            phaseEl.className = 'phase-badge locked';
        } else if (phase === 'pre_midterm') {
            phaseEl.textContent = '📋 Pre-Midterm';
            phaseEl.className = 'phase-badge pre';
        } else {
            phaseEl.textContent = '📝 Post-Midterm';
            phaseEl.className = 'phase-badge post';
        }
    }
}

// ──────────────────────────────────────────────────────────────────────
// TOGGLE USER DROPDOWN
// ──────────────────────────────────────────────────────────────────────

export function toggleUserDropdown() {
    const dd = document.getElementById('userDropdown');
    const menu = document.getElementById('userMenu');
    if (dd) {
        dd.classList.toggle('open');
        if (menu) menu.classList.toggle('open');
    }
}

export function closeUserDropdown() {
    const dd = document.getElementById('userDropdown');
    const menu = document.getElementById('userMenu');
    if (dd) dd.classList.remove('open');
    if (menu) menu.classList.remove('open');
}

// ──────────────────────────────────────────────────────────────────────
// INIT USER DROPDOWN
// ──────────────────────────────────────────────────────────────────────

export function initUserDropdown() {
    // Close dropdown on outside click
    document.addEventListener('click', function (e) {
        const menu = document.getElementById('userMenu');
        const dd = document.getElementById('userDropdown');
        if (menu && dd && !menu.contains(e.target)) {
            dd.classList.remove('open');
            menu.classList.remove('open');
        }
    });

    console.log('[Topbar] User dropdown initialized');
}

// ──────────────────────────────────────────────────────────────────────
// INIT NOTIFICATIONS (placeholder)
// ──────────────────────────────────────────────────────────────────────

export function initNotifications() {
    // Notifications are handled by updateNotificationBadge in renderTopbar
    console.log('[Topbar] Notifications initialized');
}

// ──────────────────────────────────────────────────────────────────────
// HANDLE THEME TOGGLE
// ──────────────────────────────────────────────────────────────────────

export function handleThemeToggle() {
    toggleTheme();
    updateThemeUI();
    const theme = getCurrentTheme() || 'dark';
    showToast(theme === 'dark' ? '🌙 Dark mode activated' : '☀️ Light mode activated', 'info');
}

// ──────────────────────────────────────────────────────────────────────
// HANDLE INSTALL
// ──────────────────────────────────────────────────────────────────────

let deferredPrompt = null;

export function initPWAInstall() {
    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        deferredPrompt = e;
        const btn = document.getElementById('installBtn');
        if (btn) btn.classList.add('show');
    });

    window.addEventListener('appinstalled', () => {
        const btn = document.getElementById('installBtn');
        if (btn) btn.classList.remove('show');
        deferredPrompt = null;
        showToast('✅ App installed successfully!', 'success');
    });
}

export function installApp() {
    if (deferredPrompt) {
        deferredPrompt.prompt();
        deferredPrompt.userChoice.then((choiceResult) => {
            if (choiceResult.outcome === 'accepted') {
                const btn = document.getElementById('installBtn');
                if (btn) btn.classList.remove('show');
            }
            deferredPrompt = null;
        });
    } else {
        showToast('App is already installed or cannot be installed in this browser.', 'info');
    }
}

// ──────────────────────────────────────────────────────────────────────
// SIDEBAR USER UPDATE (helper)
// ──────────────────────────────────────────────────────────────────────

function updateSidebarUser(user) {
    if (!user) return;
    const avatarEl = document.getElementById('sidebarUserAvatar');
    const nameEl = document.getElementById('sidebarUserName');
    const roleEl = document.getElementById('sidebarUserRole');

    const displayName = user.name || user.username || 'User';
    const displayRole = user.role ? user.role.charAt(0).toUpperCase() + user.role.slice(1) : '—';
    const initials = displayName.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);

    if (avatarEl) avatarEl.textContent = initials || '👤';
    if (nameEl) nameEl.textContent = displayName;
    if (roleEl) roleEl.textContent = displayRole;
}

// ──────────────────────────────────────────────────────────────────────
// INIT TOPBAR
// ──────────────────────────────────────────────────────────────────────

export function initTopbar() {
    // PWA install
    initPWAInstall();

    // Initial render
    renderTopbar();

    console.log('✅ Topbar initialized');
}

// ──────────────────────────────────────────────────────────────────────
// EXPOSE GLOBALLY
// ──────────────────────────────────────────────────────────────────────

window.toggleUserDropdown = toggleUserDropdown;
window.showProfileModal = showProfileModal;
window.showChangePasswordModal = showChangePasswordModal;
window.handleThemeToggle = handleThemeToggle;
window.installApp = installApp;
window.logout = logout;
window.navigateTo = navigateTo;