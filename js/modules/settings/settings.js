/**
 * ECOLE LA FONTAINE — System Settings Hub
 * Central navigation to all settings modules
 * Last updated: 2026-07-03
 * 
 * CHANGES:
 * - Added Academic Year status in System Information
 * - Shows current active year and term
 * - Added year/term status badges
 * - Shows system health indicators
 * - Added quick links to year management
 */

import {
    state,
    getCurrentUser,
    getCurrentAcademicYear,
    getCurrentTerm,
    getTermsByYear,
    getActiveAcademicYearId
} from '../../core/state.js';
import { esc } from '../../core/utils.js';
import { APP_CONFIG } from '../../config/constants.js';
import { getSchoolSettings } from '../../core/api.js';

// ──────────────────────────────────────────────────────────────────────
// MAIN RENDER FUNCTION
// ──────────────────────────────────────────────────────────────────────

export async function renderSettings(container) {
    if (!container) return;

    const user = getCurrentUser();
    if (user?.role !== 'admin') {
        container.innerHTML = '<div class="alert alert-danger">Access denied. Admin privileges required.</div>';
        return;
    }

    await ensureStateLoaded();

    const currentYear = getCurrentAcademicYear();
    const currentTerm = getCurrentTerm();
    const terms = getTermsByYear(currentYear?.id);
    const settings = state.schoolSettings || {};

    const modules = [
        { id: 'school-settings', icon: '🏫', name: 'School Settings', description: 'School information, logo, contact details' },
        { id: 'academic-calendar', icon: '📅', name: 'Academic Calendar', description: 'Terms, holidays, auto-reset rules' },
        { id: 'academic-years', icon: '📆', name: 'Academic Years', description: 'Manage academic years and terms' },
        { id: 'class-management', icon: '🏛️', name: 'Class Management', description: 'Classes, sections, capacities' },
        { id: 'grading-scale', icon: '📊', name: 'Grading Scale', description: 'Grade boundaries and descriptions' },
        { id: 'user-management', icon: '👥', name: 'User Management', description: 'Staff accounts and roles' },
        { id: 'backup-restore', icon: '💾', name: 'Backup & Restore', description: 'Backup and restore system data' },
        { id: 'system-logs', icon: '📋', name: 'System Logs', description: 'View and export activity logs' },
        { id: 'api-settings', icon: '🔌', name: 'API Settings', description: 'Supabase connection settings' },
        { id: 'analytics-settings', icon: '📈', name: 'Analytics Settings', description: 'Analytics and reporting preferences' },
        { id: 'system-health', icon: '🩺', name: 'System Health', description: 'Monitor system performance' },
    ];

    // Calculate system health
    const totalTeachers = (state.teachers || []).filter(t => t.status !== 'inactive').length;
    const totalStudents = (state.students || []).length;
    const totalClasses = (state.classes || []).filter(c => c.is_active !== false).length;
    const totalSubjects = (state.subjects || []).filter(s => s.is_active !== false).length;
    const totalMarks = (state.marks || []).length;

    // Check if academic year is properly set
    const hasActiveYear = !!currentYear;
    const hasActiveTerm = !!currentTerm;
    const isYearActive = currentYear?.is_active === true;

    // Calculate term progress
    let termProgress = 0;
    let termStatus = 'Not started';
    let termStatusColor = 'var(--text-muted)';
    if (currentTerm?.start_date && currentTerm?.end_date) {
        const today = new Date().toISOString().split('T')[0];
        if (today >= currentTerm.start_date && today <= currentTerm.end_date) {
            const total = new Date(currentTerm.end_date) - new Date(currentTerm.start_date);
            const elapsed = new Date(today) - new Date(currentTerm.start_date);
            termProgress = total > 0 ? Math.round((elapsed / total) * 100) : 0;
            termStatus = `${termProgress}% complete`;
            termStatusColor = termProgress >= 75 ? 'var(--success)' : termProgress >= 50 ? 'var(--warning)' : 'var(--info)';
        } else if (today < currentTerm.start_date) {
            termStatus = '⏳ Upcoming';
            termStatusColor = 'var(--text-muted)';
        } else {
            termStatus = '✅ Completed';
            termStatusColor = 'var(--success)';
        }
    }

    // Get unread notifications count
    const unreadNotifications = (state.notifications || []).filter(n => !n.is_read).length;

    container.innerHTML = `
        <div class="settings-container">
            <!-- System Status Banner -->
            <div class="dash-card" style="border-left:4px solid ${hasActiveYear && isYearActive ? 'var(--success)' : 'var(--warning)'};">
                <div class="dash-card-body" style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">
                    <div>
                        <strong>📅 System Status:</strong>
                        ${hasActiveYear ? `
                            <span style="color:${isYearActive ? 'var(--success)' : 'var(--warning)'};">
                                ${isYearActive ? '🟢' : '🟡'} ${esc(currentYear.name)}
                            </span>
                            ${currentTerm ? `· ${esc(currentTerm.name)}` : ''}
                            <span style="color:${termStatusColor};font-size:0.8rem;">(${termStatus})</span>
                        ` : `
                            <span style="color:var(--danger);">❌ No active academic year set</span>
                        `}
                    </div>
                    <div>
                        <button class="btn btn-sm btn-primary" onclick="window.navigateTo('academic-years')">📅 Manage Years</button>
                        ${!hasActiveYear || !isYearActive ? `<button class="btn btn-sm btn-warning" onclick="window.navigateTo('school-settings')">⚙️ Set Active Year</button>` : ''}
                    </div>
                </div>
            </div>

            <!-- Settings Grid -->
            <div class="dash-card">
                <div class="dash-card-header">
                    <span class="dash-card-title">⚙️ System Settings</span>
                    <span style="font-size:0.75rem;color:var(--text-muted);">Version ${APP_CONFIG.version}</span>
                </div>
                <div class="dash-card-body">
                    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px;">
                        ${modules.map(module => `
                            <div class="setting-card" style="
                                background:var(--bg-secondary);
                                border:1px solid var(--border-light);
                                border-radius:var(--r-lg);
                                padding:14px 16px;
                                cursor:pointer;
                                transition:all 0.2s;
                                display:flex;
                                align-items:center;
                                gap:14px;
                            " onclick="window.navigateTo('${module.id}')" 
                               onmouseenter="this.style.transform='translateY(-2px)';this.style.boxShadow='var(--shadow-md)';" 
                               onmouseleave="this.style.transform='';this.style.boxShadow='';">
                                <div style="font-size:1.8rem;flex-shrink:0;">${module.icon}</div>
                                <div style="flex:1;min-width:0;">
                                    <div style="font-weight:700;font-size:0.9rem;margin-bottom:2px;">${module.name}</div>
                                    <div style="font-size:0.75rem;color:var(--text-muted);line-height:1.4;">${module.description}</div>
                                </div>
                                <div style="font-size:1.2rem;color:var(--text-muted);flex-shrink:0;">→</div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            </div>

            <!-- System Information -->
            <div class="dash-card" style="margin-top:20px;">
                <div class="dash-card-header">
                    <span class="dash-card-title">ℹ️ System Information</span>
                </div>
                <div class="dash-card-body">
                    <div class="form-grid">
                        <div class="form-group">
                            <label>Version</label>
                            <input readonly value="${APP_CONFIG.version}" class="form-control">
                        </div>
                        <div class="form-group">
                            <label>Environment</label>
                            <input readonly value="${window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' ? 'Development' : 'Production'}" class="form-control">
                        </div>
                        <div class="form-group">
                            <label>Database Status</label>
                            <input readonly value="${navigator.onLine ? '🟢 Connected' : '🔴 Offline'}" class="form-control">
                        </div>
                        <div class="form-group">
                            <label>Active Academic Year</label>
                            <input readonly value="${currentYear ? esc(currentYear.name) + (currentYear.is_active ? ' 🟢' : ' 🔒') : '❌ Not set'}" class="form-control" style="${currentYear?.is_active ? 'color:var(--success)' : 'color:var(--danger)'}">
                        </div>
                        <div class="form-group">
                            <label>Current Term</label>
                            <input readonly value="${currentTerm ? esc(currentTerm.name) + ' (' + termStatus + ')' : '❌ Not set'}" class="form-control">
                        </div>
                        <div class="form-group">
                            <label>Terms in Year</label>
                            <input readonly value="${terms.length}" class="form-control">
                        </div>
                        <div class="form-group">
                            <label>Total Students</label>
                            <input readonly value="${totalStudents.toLocaleString()}" class="form-control">
                        </div>
                        <div class="form-group">
                            <label>Active Teachers</label>
                            <input readonly value="${totalTeachers}" class="form-control">
                        </div>
                        <div class="form-group">
                            <label>Active Classes</label>
                            <input readonly value="${totalClasses}" class="form-control">
                        </div>
                        <div class="form-group">
                            <label>Subjects</label>
                            <input readonly value="${totalSubjects}" class="form-control">
                        </div>
                        <div class="form-group">
                            <label>Total Marks</label>
                            <input readonly value="${totalMarks.toLocaleString()}" class="form-control">
                        </div>
                        <div class="form-group">
                            <label>Unread Notifications</label>
                            <input readonly value="${unreadNotifications}" class="form-control" style="${unreadNotifications > 0 ? 'color:var(--danger);font-weight:700;' : ''}">
                        </div>
                    </div>
                </div>
            </div>

            <!-- Quick Actions -->
            <div class="dash-card" style="margin-top:20px;">
                <div class="dash-card-header">
                    <span class="dash-card-title">⚡ Quick Actions</span>
                </div>
                <div class="dash-card-body">
                    <div class="quick-actions" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px;">
                        <div class="quick-btn" onclick="window.navigateTo('school-settings')" style="padding:12px;text-align:center;cursor:pointer;border:1px solid var(--border-light);border-radius:var(--r-md);background:var(--bg-tertiary);transition:all 0.2s;" onmouseenter="this.style.background='var(--role-light)'" onmouseleave="this.style.background='var(--bg-tertiary)'">
                            <div style="font-size:1.5rem;">🏫</div>
                            <div style="font-size:0.75rem;font-weight:600;">School Info</div>
                        </div>
                        <div class="quick-btn" onclick="window.navigateTo('academic-years')" style="padding:12px;text-align:center;cursor:pointer;border:1px solid var(--border-light);border-radius:var(--r-md);background:var(--bg-tertiary);transition:all 0.2s;" onmouseenter="this.style.background='var(--role-light)'" onmouseleave="this.style.background='var(--bg-tertiary)'">
                            <div style="font-size:1.5rem;">📆</div>
                            <div style="font-size:0.75rem;font-weight:600;">Academic Years</div>
                        </div>
                        <div class="quick-btn" onclick="window.navigateTo('user-management')" style="padding:12px;text-align:center;cursor:pointer;border:1px solid var(--border-light);border-radius:var(--r-md);background:var(--bg-tertiary);transition:all 0.2s;" onmouseenter="this.style.background='var(--role-light)'" onmouseleave="this.style.background='var(--bg-tertiary)'">
                            <div style="font-size:1.5rem;">👥</div>
                            <div style="font-size:0.75rem;font-weight:600;">Staff</div>
                        </div>
                        <div class="quick-btn" onclick="window.navigateTo('backup-restore')" style="padding:12px;text-align:center;cursor:pointer;border:1px solid var(--border-light);border-radius:var(--r-md);background:var(--bg-tertiary);transition:all 0.2s;" onmouseenter="this.style.background='var(--role-light)'" onmouseleave="this.style.background='var(--bg-tertiary)'">
                            <div style="font-size:1.5rem;">💾</div>
                            <div style="font-size:0.75rem;font-weight:600;">Backup</div>
                        </div>
                        <div class="quick-btn" onclick="window.navigateTo('grading-scale')" style="padding:12px;text-align:center;cursor:pointer;border:1px solid var(--border-light);border-radius:var(--r-md);background:var(--bg-tertiary);transition:all 0.2s;" onmouseenter="this.style.background='var(--role-light)'" onmouseleave="this.style.background='var(--bg-tertiary)'">
                            <div style="font-size:1.5rem;">📊</div>
                            <div style="font-size:0.75rem;font-weight:600;">Grading</div>
                        </div>
                        <div class="quick-btn" onclick="window.navigateTo('system-health')" style="padding:12px;text-align:center;cursor:pointer;border:1px solid var(--border-light);border-radius:var(--r-md);background:var(--bg-tertiary);transition:all 0.2s;" onmouseenter="this.style.background='var(--role-light)'" onmouseleave="this.style.background='var(--bg-tertiary)'">
                            <div style="font-size:1.5rem;">🩺</div>
                            <div style="font-size:0.75rem;font-weight:600;">Health</div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Notifications -->
            <div class="dash-card" style="margin-top:20px;">
                <div class="dash-card-header">
                    <span class="dash-card-title">🔔 System Notifications</span>
                </div>
                <div class="dash-card-body">
                    <div class="alert ${unreadNotifications > 0 ? 'alert-info' : 'alert-success'}" style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">
                        <span>
                            ${unreadNotifications > 0 ? `📢 You have <strong>${unreadNotifications}</strong> unread notification${unreadNotifications > 1 ? 's' : ''}` : '✅ All caught up! No unread notifications.'}
                        </span>
                        <button class="btn btn-sm ${unreadNotifications > 0 ? 'btn-primary' : 'btn-outline'}" onclick="window.navigateTo('notification-center')">
                            ${unreadNotifications > 0 ? `📋 View (${unreadNotifications})` : '📋 View All'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;
}

// ──────────────────────────────────────────────────────────────────────
// HELPER FUNCTIONS
// ──────────────────────────────────────────────────────────────────────

async function ensureStateLoaded() {
    if (!state.classes.length) {
        const { loadInitialData } = await import('../../core/boot.js');
        await loadInitialData(false);
    }
}

// Export functions to window
window.navigateTo = window.navigateTo || function (module) {
    if (typeof window.navigateTo === 'function') {
        window.navigateTo(module);
    } else {
        window.location.hash = module;
    }
};