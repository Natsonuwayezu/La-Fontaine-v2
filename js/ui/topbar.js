/**
 * ECOLE LA FONTAINE — Topbar Component
 * Page title, user menu, notifications, theme toggle, year/term progress
 * Last updated: 2026-07-03
 * 
 * CHANGES:
 * - Added academic year detection from sidebar state
 * - Term progress reflects selected year (not just current)
 * - Shows correct term (1st/2nd/3rd) based on selected year
 * - 0% progress for future years, 100% for completed years
 * - Phase indicator (Pre/Post Midterm) based on selected year
 */


const state = window.state || {}; // global state alias
import {
    state,
    getCurrentUser,
    getCurrentAcademicYear,
    getActiveAcademicYearId,
    getTermsByYear,
    getTermStatus
} from '../core/state.js';
import { updateNotificationBadge, fetchUnreadNotifications } from '../core/notifications.js';
import { navigateTo } from '../core/router.js';
import { logout } from '../core/auth.js';
import { showProfileModal, showChangePasswordModal } from './modals.js';
import { toggleTheme } from './theme.js';
import { getCurrentPhase, termProgress } from '../core/formulas.js';
import { esc } from '../core/utils.js';

// ──────────────────────────────────────────────────────────────────────
// RENDER TOPBAR
// ──────────────────────────────────────────────────────────────────────

/**
 * Render/update the topbar user info
 */
export function renderTopbar() {
    const user = getCurrentUser();
    if (!user) return;

    updateTopbarUser(user);
    updateNotificationBadge();
    updateTopbarYearAndTerm();
}

// ──────────────────────────────────────────────────────────────────────
// TOPBAR USER
// ──────────────────────────────────────────────────────────────────────

export function updateTopbarUser(user) {
    if (!user) return;

    const nameEl = document.getElementById('topbar-username');
    const avatarEl = document.getElementById('topbar-avatar');
    const dropdownName = document.getElementById('dropdown-username');
    const dropdownRole = document.getElementById('dropdown-userrole');

    if (nameEl) nameEl.textContent = user.name || user.username || 'User';
    if (avatarEl) avatarEl.textContent = '👤';
    if (dropdownName) dropdownName.textContent = user.name || user.username || 'User';
    if (dropdownRole) dropdownRole.textContent = user.role ? (user.role.charAt(0).toUpperCase() + user.role.slice(1)) : '—';

    // Also update sidebar
    updateSidebarUser(user);
}

// ──────────────────────────────────────────────────────────────────────
// TOPBAR YEAR & TERM PROGRESS
// ──────────────────────────────────────────────────────────────────────

/**
 * Update the topbar with current year, term, and progress
 * Detects selected year from sidebar/state
 */
export function updateTopbarYearAndTerm() {
    // Get selected year from state (set by sidebar year selector)
    const selectedYearId = state.filters?.academic_year_id || state.currentAcadYear?.id;
    const selectedYear = (state.academicYears || []).find(y => y.id === selectedYearId);
    const currentYear = getCurrentAcademicYear();

    // Determine if selected year is active/current
    const isCurrentYear = selectedYear?.id === currentYear?.id;
    const isActiveYear = selectedYear?.is_active === true;

    // Get terms for selected year
    const terms = getTermsByYear(selectedYearId);
    const today = new Date().toISOString().split('T')[0];

    // Determine which term to show based on dates
    let activeTerm = null;
    let termIndex = 0;
    let progress = 0;
    let daysLeft = 0;
    let statusText = '';

    if (terms.length === 0) {
        // No terms defined for this year
        statusText = 'No terms defined';
        progress = 0;
    } else {
        // Find current term based on dates
        for (let i = 0; i < terms.length; i++) {
            const term = terms[i];
            if (term.start_date && term.end_date) {
                if (today >= term.start_date && today <= term.end_date) {
                    activeTerm = term;
                    termIndex = i;
                    break;
                }
            }
        }

        // If no active term found, determine if year is in future or past
        if (!activeTerm) {
            const firstTerm = terms[0];
            const lastTerm = terms[terms.length - 1];

            if (firstTerm?.start_date && today < firstTerm.start_date) {
                // Year hasn't started yet
                activeTerm = firstTerm;
                termIndex = 0;
                progress = 0;
                statusText = 'Not started';
            } else if (lastTerm?.end_date && today > lastTerm.end_date) {
                // Year is completed
                activeTerm = lastTerm;
                termIndex = terms.length - 1;
                progress = 100;
                statusText = 'Completed';
            } else {
                // Fallback: use first term
                activeTerm = firstTerm || terms[0];
                termIndex = 0;
            }
        }

        // Calculate progress for active term
        if (activeTerm) {
            const prog = termProgress(activeTerm);
            progress = prog.pct;
            daysLeft = prog.daysLeft;
            statusText = prog.text;
        }
    }

    // Get phase for active term
    const phase = activeTerm ? getCurrentPhase(activeTerm) : 'post_midterm';
    const phaseText = phase === 'pre_midterm' ? '📋 Pre-Midterm' : '📝 Post-Midterm';
    const phaseClass = phase === 'pre_midterm' ? 'phase-pre' : 'phase-post';

    // Build term display name
    const termName = activeTerm?.name || terms[0]?.name || 'No Term';
    const termNumber = activeTerm?.term_number || (termIndex + 1);
    const termDisplay = `Term ${termNumber}`;

    // Year status indicator
    let yearStatus = '';
    let yearStatusColor = '';
    if (isActiveYear && isCurrentYear) {
        yearStatus = '🟢';
        yearStatusColor = 'var(--success)';
    } else if (isActiveYear && !isCurrentYear) {
        yearStatus = '🟡';
        yearStatusColor = 'var(--warning)';
    } else if (!isActiveYear && selectedYear) {
        yearStatus = '🔒';
        yearStatusColor = 'var(--text-muted)';
    }

    // ── Update DOM ──

    // Term name
    const termNameEl = document.getElementById('prog-term-name');
    if (termNameEl) {
        termNameEl.textContent = termDisplay;
        termNameEl.title = `${termName} (${phaseText})`;
    }

    // Academic year
    const yearEl = document.getElementById('prog-acad-year');
    if (yearEl) {
        const yearDisplay = selectedYear?.name || '2025-2026';
        yearEl.textContent = `${yearDisplay} ${yearStatus}`;
        yearEl.style.color = yearStatusColor;
    }

    // Progress bar
    const fillEl = document.getElementById('prog-fill');
    if (fillEl) {
        fillEl.style.width = Math.min(100, progress) + '%';
        // Color based on progress
        if (progress >= 100) {
            fillEl.style.background = 'var(--success)';
        } else if (progress >= 75) {
            fillEl.style.background = 'var(--warning)';
        } else {
            fillEl.style.background = 'var(--role-primary)';
        }
    }

    // Progress text
    const textEl = document.getElementById('prog-text');
    if (textEl) {
        const isCompleted = progress >= 100;
        const isFuture = progress === 0 && activeTerm?.start_date && today < activeTerm.start_date;
        if (isCompleted) {
            textEl.textContent = '✅ Completed';
            textEl.style.color = 'var(--success)';
        } else if (isFuture) {
            textEl.textContent = '⏳ Not started';
            textEl.style.color = 'var(--text-muted)';
        } else {
            textEl.textContent = statusText || `${Math.round(progress)}% complete`;
            textEl.style.color = 'var(--text-muted)';
        }
    }

    // Days left
    const daysEl = document.getElementById('prog-days');
    if (daysEl) {
        if (progress >= 100) {
            daysEl.textContent = '0';
        } else if (daysLeft > 0) {
            daysEl.textContent = daysLeft;
        } else {
            daysEl.textContent = '—';
        }
    }

    // Phase indicator (compact badge in topbar right)
    const phaseIndicator = document.getElementById('phase-indicator-compact');
    if (phaseIndicator) {
        const isCompleted = progress >= 100;
        const isFuture = progress === 0 && activeTerm?.start_date && today < activeTerm.start_date;
        if (isCompleted) {
            phaseIndicator.textContent = '✅ Complete';
            phaseIndicator.className = 'phase-badge-compact phase-post';
            phaseIndicator.style.background = 'var(--success-bg)';
            phaseIndicator.style.color = 'var(--success)';
        } else if (isFuture) {
            phaseIndicator.textContent = '⏳ Upcoming';
            phaseIndicator.className = 'phase-badge-compact';
            phaseIndicator.style.background = 'var(--bg-tertiary)';
            phaseIndicator.style.color = 'var(--text-muted)';
        } else {
            phaseIndicator.textContent = phaseText;
            phaseIndicator.className = `phase-badge-compact ${phaseClass}`;
            phaseIndicator.style.background = '';
            phaseIndicator.style.color = '';
        }
    }

    // ── Year status tooltip ──
    const yearWrap = document.querySelector('.progress-label');
    if (yearWrap) {
        let tooltip = '';
        if (!selectedYear) {
            tooltip = 'No academic year selected';
        } else if (isActiveYear && isCurrentYear) {
            tooltip = `Active year — ${selectedYear.name}`;
        } else if (isActiveYear && !isCurrentYear) {
            tooltip = `Active year (not current) — ${selectedYear.name}`;
        } else {
            tooltip = `Inactive year — Read-only — ${selectedYear.name}`;
        }
        yearWrap.title = tooltip;
    }

    // ── Store current state for other modules ──
    window._topbarYearState = {
        selectedYearId,
        selectedYear,
        isCurrentYear,
        isActiveYear,
        activeTerm,
        progress,
        phase,
        termName: termDisplay,
    };
}

// ──────────────────────────────────────────────────────────────────────
// USER DROPDOWN
// ──────────────────────────────────────────────────────────────────────

export function toggleUserDropdown() {
    const dd = document.getElementById('user-dropdown');
    if (dd) dd.classList.toggle('open');
}

export function closeUserDropdown() {
    const dd = document.getElementById('user-dropdown');
    if (dd) dd.classList.remove('open');
}

// ──────────────────────────────────────────────────────────────────────
// NOTIFICATIONS
// ──────────────────────────────────────────────────────────────────────

export function initNotifications() {
    // Initial badge update
    updateNotificationBadge();

    // Start polling (if not already started)
    if (typeof startNotificationPolling === 'function') {
        startNotificationPolling(30000);
    }

    // Click on bell navigates to notification center
    const bell = document.querySelector('.notif-bell');
    if (bell) {
        bell.addEventListener('click', function (e) {
            e.stopPropagation();
            navigateTo('notification-center');
        });
    }
} 

// ──────────────────────────────────────────────────────────────────────
// THEME TOGGLE (in dropdown)
// ──────────────────────────────────────────────────────────────────────

export function updateThemeUI(theme) {
    const icon = document.getElementById('dropdown-theme-icon');
    const text = document.getElementById('dropdown-theme-text');
    if (icon) icon.textContent = theme === 'dark' ? '☀️' : '🌙';
    if (text) text.textContent = theme === 'dark' ? 'Light Mode' : 'Dark Mode';
}

// ──────────────────────────────────────────────────────────────────────
// INIT USER DROPDOWN
// ──────────────────────────────────────────────────────────────────────

export function initUserDropdown() {
    const dd = document.getElementById('user-dropdown');
    if (dd) dd.classList.remove('open');

    // Close on outside click
    document.addEventListener('click', function (e) {
        if (dd && !e.target.closest('.user-menu') && !e.target.closest('.user-dropdown')) {
            dd.classList.remove('open');
        }
    });
}

// ──────────────────────────────────────────────────────────────────────
// PAGE TITLE
// ──────────────────────────────────────────────────────────────────────

export function setPageTitle(title) {
    const el = document.getElementById('page-title');
    if (el) el.textContent = title;
}

// ──────────────────────────────────────────────────────────────────────
// SIDEBAR USER UPDATE (helper)
// ──────────────────────────────────────────────────────────────────────

function updateSidebarUser(user) {
    if (!user) return;
    const avatarEl = document.getElementById('sidebar-avatar');
    const nameEl = document.getElementById('sidebar-username');
    const roleEl = document.getElementById('sidebar-userrole');

    if (avatarEl) avatarEl.textContent = '👤';
    if (nameEl) nameEl.textContent = user.name || user.username || 'User';
    if (roleEl) roleEl.textContent = user.role ? (user.role.charAt(0).toUpperCase() + user.role.slice(1)) : '—';
}

// ──────────────────────────────────────────────────────────────────────
// EXPOSE GLOBALLY
// ──────────────────────────────────────────────────────────────────────

window.toggleUserDropdown = toggleUserDropdown;
window.showProfileModal = showProfileModal;
window.showChangePasswordModal = showChangePasswordModal;
window.toggleTheme = toggleTheme;
window.logout = logout;