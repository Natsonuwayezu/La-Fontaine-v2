'use strict';
/* ═══════════════════════════════════════════════════════════════
   router.js — Handles navigateTo(moduleId, params)
   Finds the render function for the module and calls it.
   ═══════════════════════════════════════════════════════════════ */

const ROUTES = {
    // Dashboards
    'admin-dashboard'     : 'renderAdminDashboard',
    'teacher-dashboard'   : 'renderTeacherDashboard',
    'accountant-dashboard': 'renderAccountantDashboard',

    // Academics
    'marks-entry'         : 'renderMarksEntry',
    'marks-database'      : 'renderMarksDatabase',
    'class-register'      : 'renderClassRegister',
    'assessments'         : 'renderAssessments',
    'report-cards'        : 'renderReportCards',
    'rankings'            : 'renderRankings',
    'second-sitting'      : 'renderSecondSitting',

    // Students
    'student-list'        : 'renderStudentList',
    'student-profile'     : 'renderStudentProfile',
    'enroll-student'      : 'renderEnrollStudent',
    'student-promotion'   : 'renderStudentPromotion',
    'student-archive'     : 'renderStudentArchive',
    'family-management'   : 'renderFamilyManagement',
    'bulk-import'         : 'renderBulkImport',

    // Finance
    'record-payment'      : 'renderRecordPayment',
    'student-fees'        : 'renderStudentFees',
    'fee-structure'       : 'renderFeeStructure',
    'fee-approvals'       : 'renderFeeApprovals',
    'payment-history'     : 'renderPaymentHistory',
    'overdue-payments'    : 'renderOverduePayments',
    'fee-waivers'         : 'renderFeeWaivers',

    // Attendance
    'attendance-entry'    : 'renderAttendanceEntry',
    'attendance-reports'  : 'renderAttendanceReports',
    'attendance-summary'  : 'renderAttendanceSummary',

    // Staff
    'teachers'            : 'renderTeachers',
    'subjects'            : 'renderSubjects',
    'teacher-assignments' : 'renderTeacherAssignments',
    'class-timetable'     : 'renderTimetable',

    // Holidays
    'holidays-enrollment' : 'renderHolidaysEnrollment',
    'holidays-marks'      : 'renderHolidaysMarks',
    'holidays-fees'       : 'renderHolidaysFees',
    'holidays-reports'    : 'renderHolidaysReports',
    'holidays-rankings'   : 'renderHolidaysRankings',

    // Analytics & Settings
    'analytics'           : 'renderAnalytics',
    'school-settings'     : 'renderSchoolSettings',
    'academic-years'      : 'renderAcademicYears',
    'class-management'    : 'renderClassManagement',
    'grading-settings'    : 'renderGradingSettings',
    'users'               : 'renderUsers',
    'system-logs'         : 'renderSystemLogs',

    // Communication
    'announcements'       : 'renderAnnouncements',
    'notifications'       : 'renderNotifications',
};

let _currentModule = null;

async function navigateTo(moduleId, params = {}) {
    const fnName = ROUTES[moduleId];
    if (!fnName) {
        console.warn('[Router] Unknown module:', moduleId);
        return;
    }
    const fn = window[fnName];
    if (typeof fn !== 'function') {
        console.warn('[Router] Render function not found:', fnName);
        return;
    }

    _currentModule = moduleId;

    // Update page title
    const title = document.getElementById('page-title');
    if (title) title.textContent = _moduleName(moduleId);

    // Highlight active nav item
    if (typeof _setActiveNav === 'function') _setActiveNav(moduleId);

    // Get content container
    const container = document.getElementById('dynamic-content');
    if (!container) return;

    // Show skeleton
    container.innerHTML = `
        <div style="padding:20px;">
          <div class="skeleton" style="height:28px;width:200px;border-radius:8px;margin-bottom:16px;"></div>
          <div class="skeleton" style="height:14px;width:80%;border-radius:4px;margin-bottom:10px;"></div>
          <div class="skeleton" style="height:14px;width:60%;border-radius:4px;margin-bottom:10px;"></div>
          <div class="skeleton" style="height:14px;width:70%;border-radius:4px;margin-bottom:24px;"></div>
          <div class="skeleton" style="height:200px;border-radius:10px;"></div>
        </div>`;

    // Close mobile sidebar
    document.getElementById('sidebar')?.classList.remove('mobile-open');
    document.getElementById('sidebar-overlay')?.classList.remove('show');

    // Update URL hash
    history.pushState({ moduleId, params }, '', `#${moduleId}`);

    try {
        await fn(container, params);
    } catch (err) {
        console.error('[Router] Module error:', moduleId, err);
        container.innerHTML = `
            <div style="padding:40px;text-align:center;color:#dc2626;">
                <div style="font-size:2rem;margin-bottom:12px;">⚠️</div>
                <div style="font-weight:700;margin-bottom:8px;">Module Error</div>
                <div style="font-size:13px;color:#94a3b8;">${esc(err.message)}</div>
            </div>`;
    }
}

function _moduleName(id) {
    return id.split('-').map(w => w[0].toUpperCase() + w.slice(1)).join(' ');
}

// Handle browser back/forward
window.addEventListener('popstate', e => {
    const moduleId = e.state?.moduleId || location.hash.slice(1);
    if (moduleId && ROUTES[moduleId]) navigateTo(moduleId, e.state?.params || {});
});

window.navigateTo = navigateTo;
window.ROUTES     = ROUTES;
