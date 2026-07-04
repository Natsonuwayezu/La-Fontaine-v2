/**
 * ECOLE LA FONTAINE — Module Router
 * Navigation and module loading
 * Last updated: 2026-07-03
 */

import { state } from './state.js';
import { isAdmin, isTeacher, isAccountant } from './state.js';
import {
    findNavLabel,
    getNavConfig,
    TEACHER_BLOCKED_MODULES,
    ACCOUNTANT_BLOCKED_MODULES
} from '../config/navigation.js';
import { STORAGE_KEYS } from '../config/constants.js';
import { showToast } from '../ui/toast.js';
import { esc } from './utils.js';

// ──────────────────────────────────────────────────────────────────────
// NAV DATA (for passing context between modules)
// ──────────────────────────────────────────────────────────────────────

const _navData = {};

export function navigateToWithData(page, data) {
    _navData[page] = data;
    navigateTo(page);
}

export function getNavData(page) {
    const d = _navData[page];
    delete _navData[page];
    return d;
}

// ──────────────────────────────────────────────────────────────────────
// SHORTCUT NAVIGATION HELPERS
// ──────────────────────────────────────────────────────────────────────

export const goToMarksEntry = (id) => navigateToWithData('marks-entry', { assessment_id: id });
export const goToReportCard = (id) => navigateToWithData('report-cards', { report_student_id: id });
export const goToClassRegister = (id) => navigateToWithData('class-register', { class_id: id });
export const goToStudentFees = (id) => navigateToWithData('student-fees', { fee_student_id: id });
export const goToStudentDetails = (id) => navigateToWithData('student-details', { student_id: id });
export const goToRecordPayment = (id) => navigateToWithData('record-payment', { student_id: id });

// ──────────────────────────────────────────────────────────────────────
// MODULE REGISTRY
// ──────────────────────────────────────────────────────────────────────

// All render functions are imported dynamically via the registry
// This allows us to keep the router clean and load modules on-demand

const MODULE_REGISTRY = {

    // ── Dashboard ──
    'admin-dashboard': () => import('../modules/dashboard/admin-dashboard.js').then(m => m.renderAdminDashboard),
    'teacher-dashboard': () => import('../modules/dashboard/teacher-dashboard.js').then(m => m.renderTeacherDashboard),
    'accountant-dashboard': () => import('../modules/dashboard/accountant-dashboard.js').then(m => m.renderAccountantDashboard),

    // ── Academics ──
    'marks-entry': () => import('../modules/academics/marks-entry.js').then(m => m.renderMarksEntry),
    'marks-database': () => import('../modules/academics/marks-database.js').then(m => m.renderMarksDatabase),
    'marks-analysis': () => import('../modules/academics/marks-analysis.js').then(m => m.renderMarksAnalysis),
    'marks-import-export': () => import('../modules/academics/marks-import-export.js').then(m => m.renderMarksImportExport),
    'class-register': () => import('../modules/academics/class-register.js').then(m => m.renderClassRegister),
    'report-cards': () => import('../modules/academics/report-cards.js').then(m => m.renderReportCards),
    'transcripts': () => import('../modules/academics/transcripts.js').then(m => m.renderTranscripts),
    'assessments': () => import('../modules/academics/assessments.js').then(m => m.renderAssessments),
    'assessment-locking': () => import('../modules/academics/assessment-locking.js').then(m => m.renderAssessmentLocking),
    'annual-register': () => import('../modules/academics/annual-register.js').then(m => m.renderAnnualRegister),

    // ── Students ──
    'student-list': () => import('../modules/students/student-list.js').then(m => m.renderStudentList),
    'student-details': () => import('../modules/students/student-details.js').then(m => m.renderStudentDetails),
    'enroll-student': () => import('../modules/students/enroll-student.js').then(m => m.renderEnrollStudent),
    'student-promotion': () => import('../modules/students/student-promotion.js').then(m => m.renderStudentPromotion),
    'student-archive': () => import('../modules/students/student-archive.js').then(m => m.renderStudentArchive),
    'family-management': () => import('../modules/students/family-management.js').then(m => m.renderFamilyManagement),
    'sibling-linking': () => import('../modules/students/sibling-linking.js').then(m => m.renderSiblingLinking),

    // ── Attendance ──
    'attendance': () => import('../modules/attendance/attendance-entry.js').then(m => m.renderAttendanceEntry),
    'attendance-reports': () => import('../modules/attendance/attendance-reports.js').then(m => m.renderAttendanceReports),
    'attendance-summary': () => import('../modules/attendance/attendance-summary.js').then(m => m.renderAttendanceSummary),
    'attendance-analytics': () => import('../modules/attendance/attendance-analytics.js').then(m => m.renderAttendanceAnalytics),

    // ── Finance ──
    'finance-dashboard': () => import('../modules/finance/finance-dashboard.js').then(m => m.renderFinanceDashboard),
    'fee-structure': () => import('../modules/finance/fee-structure.js').then(m => m.renderFeeStructure),
    'record-payment': () => import('../modules/finance/record-payment.js').then(m => m.renderRecordPayment),
    'payment-history': () => import('../modules/finance/payment-history.js').then(m => m.renderPaymentHistory),
    'receipt-printing': () => import('../modules/finance/receipts.js').then(m => m.renderReceiptPrinting),
    'overdue-payments': () => import('../modules/finance/overdue-payments.js').then(m => m.renderOverduePayments),
    'fee-waivers': () => import('../modules/finance/fee-waivers.js').then(m => m.renderFeeWaivers),
    'balances': () => import('../modules/finance/balances.js').then(m => m.renderBalances),
    'payment-reversals': () => import('../modules/finance/payment-reversals.js').then(m => m.renderPaymentReversals),
    'financial-reports': () => import('../modules/finance/financial-reports.js').then(m => m.renderFinancialReports),
    'fee-term-status': () => import('../modules/finance/fee-term-status.js').then(m => m.renderFeeTermStatus),
    'carry-forward': () => import('../modules/finance/carry-forward.js').then(m => m.renderCarryForward),
    'student-fee-status': () => import('../modules/finance/student-fee-status.js').then(m => m.renderStudentFeeStatus),
    'family-fee-summary': () => import('../modules/finance/family-fee-summary.js').then(m => m.renderFamilyFeeSummary),
    'credit-balances': () => import('../modules/finance/credit-balances.js').then(m => m.renderCreditBalances),
    'discounts': () => import('../modules/finance/discounts.js').then(m => m.renderDiscounts),

    // ── Staff ──
    'user-management': () => import('../modules/staff/user-management.js').then(m => m.renderUserManagement),
    'subjects': () => import('../modules/staff/subjects.js').then(m => m.renderSubjects),
    'teacher-assignments': () => import('../modules/staff/teacher-assignments.js').then(m => m.renderTeacherAssignments),
    'teacher-performance': () => import('../modules/staff/teacher-performance.js').then(m => m.renderTeacherPerformance),
    'timetable': () => import('../modules/staff/timetable.js').then(m => m.renderTimetable),
    'timetable-conflicts': () => import('../modules/staff/timetable-conflicts.js').then(m => m.renderTimetableConflicts),
    'class-timetable': () => import('../modules/staff/timetable.js').then(m => m.renderClassTimetable),
    'teacher-timetable': () => import('../modules/staff/timetable.js').then(m => m.renderTeacherTimetable),

    // ── Settings ──
    'school-settings': () => import('../modules/settings/school-settings.js').then(m => m.renderSchoolSettings),
    'academic-calendar': () => import('../modules/settings/academic-calendar.js').then(m => m.renderAcademicCalendar),
    'academic-years': () => import('../modules/settings/academic-years.js').then(m => m.renderAcademicYears),
    'class-management': () => import('../modules/settings/class-management.js').then(m => m.renderClassManagement),
    'grading-scale': () => import('../modules/settings/grading-scale.js').then(m => m.renderGradingScale),
    'backup-restore': () => import('../modules/settings/backup-restore.js').then(m => m.renderBackupRestore),
    'system-logs': () => import('../modules/settings/system-logs.js').then(m => m.renderSystemLogs),
    'api-settings': () => import('../modules/settings/api-settings.js').then(m => m.renderApiSettings),
    'settings': () => import('../modules/settings/settings.js').then(m => m.renderSettings),

    // ── Communication ──
    'notifications': () => import('../modules/communication/notifications.js').then(m => m.renderNotifications),
    'notification-center': () => import('../modules/communication/announcement-center.js').then(m => m.renderNotificationCenter),
    'announcements': () => import('../modules/communication/announcements.js').then(m => m.renderAnnouncements),
    'reminders': () => import('../modules/communication/reminders.js').then(m => m.renderReminders),

    // ── Bulk ──
    'bulk-import': () => import('../modules/bulk/bulk-import.js').then(m => m.renderBulkImport),
    'bulk-export': () => import('../modules/bulk/bulk-export.js').then(m => m.renderBulkExport),

    // ── Analytics ──
    'analytics': () => import('../modules/analytics/analytics.js').then(m => m.renderAnalytics),
    'analytics-settings': () => import('../modules/analytics/analytics-settings.js').then(m => m.renderAnalyticsSettings),
    'system-health': () => import('../modules/analytics/system-health.js').then(m => m.renderSystemHealth),

    // ── Reports ──
    'academic-reports': () => import('../modules/academics/academic-reports.js').then(m => m.renderAcademicReports),
    'transcript': () => import('../modules/academics/transcripts.js').then(m => m.renderTranscripts),
    'rankings': () => import('../modules/academics/rankings.js').then(m => m.renderRankings),
    'ranking-engine': () => import('../modules/academics/ranking-engine.js').then(m => m.renderRankingEngine),
    'report-generator': () => import('../modules/academics/report-generator.js').then(m => m.renderReportGenerator),
    'assessment-export': () => import('../modules/academics/assessment-export.js').then(m => m.renderAssessmentExport),
    'register-export': () => import('../modules/academics/register-export.js').then(m => m.renderRegisterExport),

    // ── Finance Extended ──
    'finance-audit': () => import('../modules/finance/finance-audit.js').then(m => m.renderFinanceAudit),
    'manual-adjustments': () => import('../modules/finance/manual-adjustments.js').then(m => m.renderManualAdjustments),
    'bulk-finance-actions': () => import('../modules/finance/bulk-finance-actions.js').then(m => m.renderBulkFinanceActions),
    'student-statements': () => import('../modules/finance/student-statements.js').then(m => m.renderStudentStatements),
    'fee-assignments': () => import('../modules/finance/fee-assignments.js').then(m => m.renderFeeAssignments),
    'fee-structures': () => import('../modules/finance/fee-structures.js').then(m => m.renderFeeStructures),

    // ── Timetable Extended ──
    'timetable-import': () => import('../modules/staff/timetable-import.js').then(m => m.renderTimetableImport),
    'staff-timetable': () => import('../modules/staff/timetable.js').then(m => m.renderStaffTimetable),

    // ── Student Extended ──
    'student-fees': () => import('../modules/students/student-fees.js').then(m => m.renderStudentFees),
    'bulk-student-actions': () => import('../modules/students/bulk-student-actions.js').then(m => m.renderBulkStudentActions),
};

// ──────────────────────────────────────────────────────────────────────
// NAVIGATE
// ──────────────────────────────────────────────────────────────────────

/**
 * Navigate to a module by ID
 * @param {string} moduleId - Module ID to load
 */
export async function navigateTo(moduleId) {
    const role = state.currentUser?.role;

    // ── Role-based access control ──
    if (role === 'teacher' && TEACHER_BLOCKED_MODULES.has(moduleId)) {
        showAccessDenied('Finance modules are not available for Teacher accounts.');
        return;
    }
    if (role === 'accountant' && ACCOUNTANT_BLOCKED_MODULES.has(moduleId)) {
        showAccessDenied('Academic modules are not available for Accountant accounts.');
        return;
    }

    // ── Update UI ──
    setActiveNav(moduleId);
    const label = findNavLabel(moduleId, role);
    const pageTitle = document.getElementById('page-title');
    if (pageTitle) pageTitle.textContent = label || moduleId;

    state.currentModule = moduleId;
    localStorage.setItem(STORAGE_KEYS.MODULE || 'elf_module', moduleId);

    // Close mobile sidebar
    closeSidebarMobile();

    // ── Load the module ──
    await loadModule(moduleId);

    // Scroll to top
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ──────────────────────────────────────────────────────────────────────
// LOAD MODULE
// ──────────────────────────────────────────────────────────────────────

/**
 * Load a module by ID (render it into #dynamic-content)
 * @param {string} id - Module ID
 */
export async function loadModule(id) {
    const el = document.getElementById('dynamic-content');
    if (!el) return;

    el.innerHTML = `
        <div class="loading-container">
            <div class="spinner"></div>
            <p>Loading ${id.replace('-', ' ')}...</p>
        </div>
    `;

    try {
        const loader = MODULE_REGISTRY[id];

        if (!loader) {
            // Module not found — show 404
            el.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">🔍</div>
                    <div class="empty-state-title">Module Not Found</div>
                    <div class="empty-state-message">
                        The module "<strong>${esc(id)}</strong>" does not exist or has not been implemented yet.
                    </div>
                    <div class="empty-state-action">
                        <button class="btn btn-primary" onclick="window.navigateTo('admin-dashboard')">
                            ← Back to Dashboard
                        </button>
                    </div>
                </div>
            `;
            return;
        }

        // Load the module dynamically
        const renderFn = await loader();

        if (typeof renderFn !== 'function') {
            throw new Error(`Module "${id}" does not export a render function`);
        }

        await renderFn(el);

    } catch (err) {
        console.error(`[Module ${id}] Error:`, err);

        el.innerHTML = `
            <div class="alert alert-danger" style="margin: var(--lg);">
                <div class="alert-icon">❌</div>
                <div class="alert-content">
                    <div class="alert-title">Error Loading Module</div>
                    <p>${esc(err.message || 'Unknown error occurred')}</p>
                    <div style="margin-top: var(--md);">
                        <button class="btn btn-outline" onclick="window.navigateTo('admin-dashboard')">
                            ← Back to Dashboard
                        </button>
                        <button class="btn btn-outline" onclick="window.location.reload()">
                            🔄 Reload Page
                        </button>
                    </div>
                </div>
            </div>
        `;
    }
}

// ──────────────────────────────────────────────────────────────────────
// ACCESS DENIED
// ──────────────────────────────────────────────────────────────────────

function showAccessDenied(message) {
    const content = document.getElementById('dynamic-content');
    if (content) {
        content.innerHTML = `
            <div class="alert alert-danger" style="margin: var(--lg);">
                <div class="alert-icon">🚫</div>
                <div class="alert-content">
                    <div class="alert-title">Access Denied</div>
                    <p>${esc(message || 'You do not have permission to view this module.')}</p>
                    <div style="margin-top: var(--md);">
                        <button class="btn btn-outline" onclick="window.navigateTo('admin-dashboard')">
                            ← Back to Dashboard
                        </button>
                    </div>
                </div>
            </div>
        `;
    }
    showToast('🚫 ' + (message || 'Access denied.'), 'warning');
}

// ──────────────────────────────────────────────────────────────────────
// ACTIVE NAV HIGHLIGHT
// ──────────────────────────────────────────────────────────────────────

function setActiveNav(id) {
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
    const el = document.getElementById(`nav-${id}`);
    if (el) {
        el.classList.add('active');
        const section = el.closest('.nav-section');
        if (section) section.classList.remove('collapsed');
    }
}

// ──────────────────────────────────────────────────────────────────────
// SIDEBAR HELPERS (minimal — full implementation in ui/sidebar.js)
// ──────────────────────────────────────────────────────────────────────

function closeSidebarMobile() {
    const sidebar = document.getElementById('sidebar');
    if (sidebar) sidebar.classList.remove('mobile-open');
    const overlay = document.querySelector('.sidebar-overlay');
    if (overlay) overlay.remove();
}

// ──────────────────────────────────────────────────────────────────────
// GET LAST MODULE (for session restore)
// ──────────────────────────────────────────────────────────────────────

export function getLastModule() {
    return localStorage.getItem(STORAGE_KEYS.MODULE || 'elf_module') || null;
}

// ──────────────────────────────────────────────────────────────────────
// EXPOSE TO WINDOW (for inline onclick handlers)
// ──────────────────────────────────────────────────────────────────────

window.navigateTo = navigateTo;
window.loadModule = loadModule;
window.navigateToWithData = navigateToWithData;
window.getNavData = getNavData;
window.goToMarksEntry = goToMarksEntry;
window.goToReportCard = goToReportCard;
window.goToClassRegister = goToClassRegister;
window.goToStudentFees = goToStudentFees;
window.goToStudentDetails = goToStudentDetails;
window.goToRecordPayment = goToRecordPayment;
window.getLastModule = getLastModule;