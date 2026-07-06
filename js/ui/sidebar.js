/**
 * ECOLE LA FONTAINE — Sidebar Component
 * Navigation sidebar with collapse, sections, mobile support, and year selector
 * Last updated: 2026-07-03
 * 
 * CHANGES:
 * - Added academic year selector in sidebar footer
 * - Year selection affects all data displayed
 * - Read-only mode for inactive years
 * - Visual indicators for active/inactive years
 */


import { getNavConfig, findNavLabel } from '../config/navigation.js';
import { STORAGE_KEYS } from '../config/constants.js';
import { state, setYearFilter, getCurrentAcademicYear, getActiveAcademicYearId } from '../core/state.js';
import { navigateTo } from '../core/router.js';
import { refreshYearData } from '../core/boot.js';
import { esc } from '../core/utils.js';

// ──────────────────────────────────────────────────────────────────────
// BUILD SIDEBAR
// ──────────────────────────────────────────────────────────────────────

/**
 * Build the sidebar navigation for a role
 * @param {string} role - 'admin' | 'teacher' | 'accountant'
 */
export function buildSidebar(role) {
    const sidebar = document.getElementById('sidebar');
    if (!sidebar) return;

    const navContainer = document.getElementById('sidebar-nav');
    if (!navContainer) return;

    const config = getNavConfig(role);

    navContainer.innerHTML = config.map(section => {
        const sectionId = `sec-${section.section.replace(/\s/g, '').replace(/[^a-zA-Z0-9]/g, '')}`;
        return `
            <div class="nav-section" id="${sectionId}">
                <div class="nav-section-title" onclick="window.toggleNavSection(this.parentElement)">
                    ${section.section}
                    <span class="nav-section-arrow">▾</span>
                </div>
                <div class="nav-section-items">
                    ${section.items.map(item => `
                        <div class="nav-item" id="nav-${item.id}" onclick="window.navigateTo('${item.id}')">
                            <span class="nav-icon">${item.icon}</span>
                            <span>${item.label}</span>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }).join('');

    // Restore collapsed sections
    restoreCollapsedSections();

    // Update user info
    updateSidebarUser(state.currentUser);

    // Build year selector in footer
    buildYearSelector();
}

// ──────────────────────────────────────────────────────────────────────
// SIDEBAR USER INFO
// ──────────────────────────────────────────────────────────────────────

export function updateSidebarUser(user) {
    if (!user) return;
    const avatar = document.getElementById('sidebar-avatar');
    const name = document.getElementById('sidebar-username');
    const role = document.getElementById('sidebar-userrole');

    if (avatar) avatar.textContent = '👤';
    if (name) name.textContent = user.name || user.username || 'User';
    if (role) role.textContent = user.role ? (user.role.charAt(0).toUpperCase() + user.role.slice(1)) : '—';
}

// ──────────────────────────────────────────────────────────────────────
// YEAR SELECTOR IN SIDEBAR FOOTER
// ──────────────────────────────────────────────────────────────────────

function buildYearSelector() {
    const footer = document.querySelector('.sidebar-footer');
    if (!footer) return;

    const years = (state.academicYears || []).sort((a, b) => b.id - a.id);
    const currentYear = getCurrentAcademicYear();
    const activeYearId = state.filters.academic_year_id || currentYear?.id;

    // Check if year selector already exists
    let yearSelector = footer.querySelector('.sidebar-year-selector');
    if (yearSelector) {
        yearSelector.remove();
    }

    // Only show for admin and accountant (teachers see current year only)
    const role = state.currentUser?.role;
    if (role === 'teacher') {
        // Teachers: show read-only year label
        const label = document.createElement('div');
        label.className = 'sidebar-year-label';
        label.style.cssText = `
            font-size: 0.6rem;
            color: var(--text-muted);
            padding: 4px 8px;
            border-top: 1px solid var(--border-light);
            margin-top: 4px;
            text-align: center;
        `;
        label.textContent = `📅 ${currentYear?.name || 'Current Year'}`;
        footer.appendChild(label);
        return;
    }

    // Admin/Accountant: show year selector
    const container = document.createElement('div');
    container.className = 'sidebar-year-selector';
    container.style.cssText = `
        padding: 6px 8px;
        border-top: 1px solid var(--border-light);
        margin-top: 4px;
        width: 100%;
    `;

    const currentYearObj = years.find(y => y.id === activeYearId);
    const isActiveYear = currentYearObj?.is_active;

    container.innerHTML = `
        <div style="display:flex;align-items:center;gap:6px;font-size:0.65rem;color:var(--text-muted);margin-bottom:4px;">
            <span>📅</span>
            <span style="flex:1;">Academic Year</span>
            ${isActiveYear ? '<span class="badge badge-success" style="font-size:0.5rem;padding:1px 6px;">Active</span>' : ''}
        </div>
        <select id="sidebar-year-select" onchange="window._onSidebarYearChange(this.value)" style="
            width:100%;
            padding:4px 6px;
            border-radius:4px;
            border:1px solid var(--border-light);
            background:var(--bg-secondary);
            color:var(--text-primary);
            font-size:0.7rem;
            cursor:pointer;
        ">
            ${years.map(y => `
                <option value="${y.id}" ${y.id === activeYearId ? 'selected' : ''}>
                    ${esc(y.name)} ${y.is_active ? '🟢' : '📦'}
                </option>
            `).join('')}
        </select>
        <div style="font-size:0.55rem;color:var(--text-muted);margin-top:3px;text-align:center;">
            ${isActiveYear ? '✅ Editable' : '🔒 Read-only (inactive year)'}
        </div>
    `;

    footer.appendChild(container);

    // Store the year selector for updates
    window._yearSelectorContainer = container;
}

// ──────────────────────────────────────────────────────────────────────
// SIDEBAR YEAR CHANGE HANDLER
// ──────────────────────────────────────────────────────────────────────

async function onSidebarYearChange(yearId) {
    if (!yearId) return;

    const year = (state.academicYears || []).find(y => y.id == yearId);
    if (!year) return;

    // Check if year is active (editable)
    const isActive = year.is_active;

    // Update state filter
    setYearFilter(yearId);

    // Update current academic year in state
    state.currentAcadYear = year;

    // Refresh data for this year
    await refreshYearData(yearId);

    // Update year selector UI
    updateYearSelectorUI(yearId);

    // Update topbar
    updateTopbarYear();

    // Show notification
    const statusIcon = isActive ? '🟢' : '📦';
    const statusText = isActive ? 'Active (editable)' : 'Inactive (read-only)';
    showToast(`📅 Switched to ${year.name} — ${statusText}`, isActive ? 'success' : 'info', 3000);

    // Reload current module with new year data
    const currentModule = state.currentModule || 'admin-dashboard';
    navigateTo(currentModule);
}

// ──────────────────────────────────────────────────────────────────────
// UPDATE YEAR SELECTOR UI
// ──────────────────────────────────────────────────────────────────────

function updateYearSelectorUI(yearId) {
    const select = document.getElementById('sidebar-year-select');
    if (select) {
        select.value = yearId;
    }

    // Update the label
    const container = window._yearSelectorContainer;
    if (container) {
        const year = (state.academicYears || []).find(y => y.id == yearId);
        const isActive = year?.is_active;

        const statusLabel = container.querySelector('.badge');
        const statusText = container.querySelector('div:last-child');

        if (statusLabel) {
            statusLabel.textContent = isActive ? 'Active' : 'Inactive';
            statusLabel.className = `badge ${isActive ? 'badge-success' : 'badge-neutral'}`;
            statusLabel.style.cssText = 'font-size:0.5rem;padding:1px 6px;';
        }

        if (statusText) {
            statusText.textContent = isActive ? '✅ Editable' : '🔒 Read-only (inactive year)';
        }
    }
}

// ──────────────────────────────────────────────────────────────────────
// UPDATE TOPBAR YEAR
// ──────────────────────────────────────────────────────────────────────

function updateTopbarYear() {
    const yearEl = document.getElementById('prog-acad-year');
    if (yearEl && state.currentAcadYear) {
        yearEl.textContent = state.currentAcadYear.name;
    }
}

// ──────────────────────────────────────────────────────────────────────
// CHECK IF CURRENT YEAR IS EDITABLE
// ──────────────────────────────────────────────────────────────────────

export function isCurrentYearEditable() {
    const yearId = state.filters.academic_year_id || state.currentAcadYear?.id;
    const year = (state.academicYears || []).find(y => y.id == yearId);
    return year?.is_active === true;
}

// ──────────────────────────────────────────────────────────────────────
// SECTION COLLAPSE
// ──────────────────────────────────────────────────────────────────────

export function toggleNavSection(element) {
    if (!element) return;
    element.classList.toggle('collapsed');

    const collapsed = [];
    document.querySelectorAll('.nav-section.collapsed').forEach(s => collapsed.push(s.id));
    localStorage.setItem(STORAGE_KEYS.COLLAPSED_SECTIONS, JSON.stringify(collapsed));
}

export function restoreCollapsedSections() {
    try {
        const saved = localStorage.getItem(STORAGE_KEYS.COLLAPSED_SECTIONS);
        if (saved) {
            JSON.parse(saved).forEach(id => {
                const el = document.getElementById(id);
                if (el) el.classList.add('collapsed');
            });
        }
    } catch (e) {
        // Ignore
    }
}

// ──────────────────────────────────────────────────────────────────────
// SIDEBAR TOGGLE (Mobile + Desktop)
// ──────────────────────────────────────────────────────────────────────

export function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    if (!sidebar) return;

    // Mobile: overlay drawer
    if (window.innerWidth <= 768) {
        sidebar.classList.toggle('mobile-open');

        let overlay = document.querySelector('.sidebar-overlay');
        if (!overlay && sidebar.classList.contains('mobile-open')) {
            overlay = document.createElement('div');
            overlay.className = 'sidebar-overlay';
            overlay.onclick = closeSidebarMobile;
            document.body.appendChild(overlay);
        } else if (overlay) {
            overlay.remove();
        }
        return;
    }

    // Desktop: collapse to icon-only
    sidebar.classList.toggle('collapsed');
}

export function closeSidebarMobile() {
    const sidebar = document.getElementById('sidebar');
    if (sidebar) sidebar.classList.remove('mobile-open');
    const overlay = document.querySelector('.sidebar-overlay');
    if (overlay) overlay.remove();
}

// ──────────────────────────────────────────────────────────────────────
// INIT SIDEBAR
// ──────────────────────────────────────────────────────────────────────

export function initSidebar() {
    const sidebar = document.getElementById('sidebar');
    if (sidebar) {
        sidebar.classList.remove('mobile-open');
        // Desktop: start expanded
        if (window.innerWidth > 768) {
            sidebar.classList.remove('collapsed');
        }
    }

    // Close on Escape key
    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') closeSidebarMobile();
    });

    // Window resize handler
    window.addEventListener('resize', function () {
        if (window.innerWidth > 768) {
            closeSidebarMobile();
        }
    });

    // Click outside to close (desktop + mobile)
    document.addEventListener('click', function (e) {
        const sidebar = document.getElementById('sidebar');
        if (!sidebar) return;

        // If sidebar is open on mobile and click is outside
        if (sidebar.classList.contains('mobile-open') &&
            !e.target.closest('.sidebar') &&
            !e.target.closest('#menu-toggle')) {
            closeSidebarMobile();
        }
    });

    // Build year selector if not already built
    buildYearSelector();
}

// ──────────────────────────────────────────────────────────────────────
// ACTIVE NAV ITEM
// ──────────────────────────────────────────────────────────────────────

export function setActiveNav(id) {
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
    const el = document.getElementById(`nav-${id}`);
    if (el) {
        el.classList.add('active');
        const section = el.closest('.nav-section');
        if (section) section.classList.remove('collapsed');
    }
    localStorage.setItem(STORAGE_KEYS.MODULE, id);
}

// ──────────────────────────────────────────────────────────────────────
// HELPER FUNCTIONS
// ──────────────────────────────────────────────────────────────────────

function showToast(message, type = 'info', duration = 3500) {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `<span class="toast-icon">${icons[type] || 'ℹ️'}</span><span class="toast-message">${esc(message)}</span>`;
    container.appendChild(toast);
    setTimeout(() => { toast.classList.add('hiding'); setTimeout(() => toast.remove(), 300); }, duration);
}

// ──────────────────────────────────────────────────────────────────────
// EXPOSE GLOBALLY
// ──────────────────────────────────────────────────────────────────────

window.toggleSidebar = toggleSidebar;
window.toggleNavSection = toggleNavSection;
window.closeSidebarMobile = closeSidebarMobile;
window._onSidebarYearChange = onSidebarYearChange;