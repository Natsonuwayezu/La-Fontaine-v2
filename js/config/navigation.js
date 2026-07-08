/**
 * ECOLE LA FONTAINE — Navigation Configuration
 * Consolidated to Font Awesome icons only
 * Last updated: 2026-07-07
 */

// ──────────────────────────────────────────────────────────────────────
// NAV_CONFIG — Full Menu Structure with Font Awesome icons
// ──────────────────────────────────────────────────────────────────────

const NAV_CONFIG = {
    admin: [
        {
            section: 'Dashboard',
            icon: 'fa-table-cells-large',
            items: [
                { id: 'admin-dashboard', icon: 'fa-gauge-high', label: 'Admin Dashboard' },
                { id: 'accountant-dashboard', icon: 'fa-chart-pie', label: 'Accountant Dashboard' },
                { id: 'teacher-dashboard', icon: 'fa-table', label: 'Teacher Dashboard' },
                { id: 'analytics', icon: 'fa-chart-line', label: 'Academic Analytics' },
                { id: 'finance-dashboard', icon: 'fa-sack-dollar', label: 'Finance Dashboard' },
            ]
        },
        {
            section: 'Communication',
            icon: 'fa-comments',
            items: [
                { id: 'notifications', icon: 'fa-bell', label: 'Notifications' },
                { id: 'announcements', icon: 'fa-bullhorn', label: 'Announcements' },
                { id: 'reminders', icon: 'fa-clock', label: 'Reminders' },
            ]
        },
        {
            section: 'Attendance',
            icon: 'fa-clipboard-check',
            items: [
                { id: 'attendance', icon: 'fa-pen-to-square', label: 'Record Attendance' },
                { id: 'attendance-reports', icon: 'fa-file-lines', label: 'Attendance Reports' },
                { id: 'attendance-summary', icon: 'fa-chart-bar', label: 'Attendance Summary' },
                { id: 'attendance-analytics', icon: 'fa-chart-line', label: 'Attendance Analytics' },
            ]
        },
        {
            section: 'Students',
            icon: 'fa-users',
            items: [
                { id: 'student-list', icon: 'fa-users', label: 'All Students' },
                { id: 'enroll-student', icon: 'fa-user-plus', label: 'Enroll Student' },
                { id: 'student-details', icon: 'fa-id-card', label: 'Student Profile' },
                { id: 'family-management', icon: 'fa-house-chimney-user', label: 'Family Management' },
                { id: 'student-archive', icon: 'fa-box-archive', label: 'Archive' },
                { id: 'student-fee-status', icon: 'fa-coins', label: 'Student Fee Status' },
            ]
        },
        {
            section: 'Academics',
            icon: 'fa-graduation-cap',
            items: [
                { id: 'assessments', icon: 'fa-clipboard-list', label: 'Assessments' },
                { id: 'marks-entry', icon: 'fa-pencil', label: 'Marks Entry' },
                { id: 'marks-database', icon: 'fa-database', label: 'Marks Database' },
                { id: 'class-register', icon: 'fa-table-list', label: 'Class Register' },
                { id: 'report-cards', icon: 'fa-file-invoice', label: 'Report Cards' },
                { id: 'transcripts', icon: 'fa-scroll', label: 'Transcripts' },
                { id: 'statistics', icon: 'fa-chart-pie', label: 'Statistics' },
            ]
        },
        {
            section: 'Finance',
            icon: 'fa-sack-dollar',
            items: [
                { id: 'finance-dashboard', icon: 'fa-chart-column', label: 'Finance Dashboard' },
                { id: 'fee-structure', icon: 'fa-list-ol', label: 'Fee Structure' },
                { id: 'record-payment', icon: 'fa-money-bill-wave', label: 'Record Payment' },
                { id: 'payment-history', icon: 'fa-clock-rotate-left', label: 'Payment History' },
                { id: 'receipts', icon: 'fa-receipt', label: 'Receipts' },
                { id: 'fee-waivers', icon: 'fa-tag', label: 'Waivers / Discounts' },
                { id: 'payment-reversals', icon: 'fa-rotate-left', label: 'Reversals' },
                { id: 'finance-audit', icon: 'fa-magnifying-glass-chart', label: 'Finance Audit' },
                { id: 'fee-term-status', icon: 'fa-calendar-check', label: 'Fee Term Status' },
                { id: 'student-fee-status', icon: 'fa-wallet', label: 'Student Fee Status' },
                { id: 'family-fee-summary', icon: 'fa-users-rectangle', label: 'Family Fee Summary' },
                { id: 'carry-forward', icon: 'fa-forward', label: 'Carry Forward' },
            ]
        },
        {
            section: 'Staff',
            icon: 'fa-chalkboard-user',
            items: [
                { id: 'user-management', icon: 'fa-users-gear', label: 'User Management' },
                { id: 'class-management', icon: 'fa-book', label: 'Class / Subjects' },
                { id: 'teacher-assignments', icon: 'fa-person-chalkboard', label: 'Teacher Assignments' },
                { id: 'teacher-performance', icon: 'fa-chart-line', label: 'Teacher Performance' },
                { id: 'timetable', icon: 'fa-calendar-days', label: 'Timetable' },
            ]
        },
        {
            section: 'Bulk Operations',
            icon: 'fa-layer-group',
            items: [
                { id: 'bulk-import', icon: 'fa-file-import', label: 'Bulk Import' },
                { id: 'bulk-export', icon: 'fa-file-export', label: 'Bulk Export' },
                { id: 'student-promotion', icon: 'fa-arrow-up-right-dots', label: 'Student Promotion' },
                { id: 'carry-forward', icon: 'fa-forward', label: 'Carry Forward' },
            ]
        },
        {
            section: 'Settings',
            icon: 'fa-gear',
            items: [
                { id: 'school-settings', icon: 'fa-school', label: 'School Settings' },
                { id: 'academic-calendar', icon: 'fa-calendar', label: 'Academic Calendar' },
                { id: 'grading-scale', icon: 'fa-star-half-stroke', label: 'Grading Settings' },
                { id: 'backup-restore', icon: 'fa-hard-drive', label: 'Backup & Restore' },
                { id: 'system-logs', icon: 'fa-list-check', label: 'System Logs' },
                { id: 'system-settings', icon: 'fa-plug', label: 'System / API Settings' },
                { id: 'system-health', icon: 'fa-heart-pulse', label: 'System Health' },
            ]
        },
        // In NAV_CONFIG.admin section, add:
        {
            section: 'Help',
            icon: 'fa-circle-question',
            items: [
                { id: 'help-center', icon: 'fa-circle-question', label: 'Help Center' },
                { id: 'faq', icon: 'fa-list', label: 'FAQ' },
                { id: 'support', icon: 'fa-envelope', label: 'Contact Support' },
            ]
        },
    ],

    // ── TEACHER ──────────────────────────────────────────────────────
    teacher: [
        {
            section: 'Dashboard',
            icon: 'fa-table-cells-large',
            items: [
                { id: 'teacher-dashboard', icon: 'fa-table', label: 'My Dashboard' },
                { id: 'notifications', icon: 'fa-bell', label: 'Notifications' },
            ]
        },
        {
            section: 'Academics',
            icon: 'fa-graduation-cap',
            items: [
                { id: 'marks-entry', icon: 'fa-pencil', label: 'Marks Entry' },
                { id: 'marks-database', icon: 'fa-database', label: 'Marks Database' },
                { id: 'class-register', icon: 'fa-table-list', label: 'Class Register' },
                { id: 'report-cards', icon: 'fa-file-invoice', label: 'Report Cards' },
                { id: 'statistics', icon: 'fa-chart-pie', label: 'Statistics' },
            ]
        },
        {
            section: 'Students',
            icon: 'fa-users',
            items: [
                { id: 'student-list', icon: 'fa-users', label: 'All Students' },
                { id: 'student-details', icon: 'fa-id-card', label: 'Student Details' },
            ]
        },
        {
            section: 'Attendance',
            icon: 'fa-clipboard-check',
            items: [
                { id: 'attendance', icon: 'fa-pen-to-square', label: 'Record Attendance' },
                { id: 'attendance-reports', icon: 'fa-file-lines', label: 'Attendance Reports' },
            ]
        },
        {
            section: 'Timetable',
            icon: 'fa-calendar-days',
            items: [
                { id: 'teacher-timetable', icon: 'fa-calendar-days', label: 'My Timetable' },
            ]
        },
    ],

    // ── ACCOUNTANT ──────────────────────────────────────────────────
    accountant: [
        {
            section: 'Dashboard',
            icon: 'fa-table-cells-large',
            items: [
                { id: 'accountant-dashboard', icon: 'fa-chart-pie', label: 'Finance Dashboard' },
                { id: 'notifications', icon: 'fa-bell', label: 'Notifications' },
            ]
        },
        {
            section: 'Attendance',
            icon: 'fa-clipboard-check',
            items: [
                { id: 'attendance', icon: 'fa-pen-to-square', label: 'Record Attendance' },
                { id: 'attendance-reports', icon: 'fa-file-lines', label: 'Attendance Reports' },
                { id: 'attendance-summary', icon: 'fa-chart-bar', label: 'Attendance Summary' },
                { id: 'attendance-analytics', icon: 'fa-chart-line', label: 'Attendance Analytics' },
            ]
        },
        {
            section: 'Students',
            icon: 'fa-users',
            items: [
                { id: 'student-list', icon: 'fa-users', label: 'All Students' },
                { id: 'student-details', icon: 'fa-id-card', label: 'Student Details' },
                { id: 'student-fee-status', icon: 'fa-wallet', label: 'Student Fee Status' },
            ]
        },
        {
            section: 'Finance',
            icon: 'fa-sack-dollar',
            items: [
                { id: 'fee-structure', icon: 'fa-list-ol', label: 'Fee Structure' },
                { id: 'record-payment', icon: 'fa-money-bill-wave', label: 'Record Payment' },
                { id: 'payment-history', icon: 'fa-clock-rotate-left', label: 'Payment History' },
                { id: 'receipts', icon: 'fa-receipt', label: 'Receipts' },
                { id: 'fee-waivers', icon: 'fa-tag', label: 'Waivers / Discounts' },
                { id: 'payment-reversals', icon: 'fa-rotate-left', label: 'Reversals' },
                { id: 'finance-audit', icon: 'fa-magnifying-glass-chart', label: 'Finance Audit' },
                { id: 'fee-term-status', icon: 'fa-calendar-check', label: 'Fee Term Status' },
                { id: 'student-fee-status', icon: 'fa-wallet', label: 'Student Fee Status' },
                { id: 'family-fee-summary', icon: 'fa-users-rectangle', label: 'Family Fee Summary' },
                { id: 'carry-forward', icon: 'fa-forward', label: 'Carry Forward' },
            ]
        },
    ],
};

// ─── ROLE-BLOCKED MODULES ──────────────────────────────────────────

const TEACHER_BLOCKED_MODULES = new Set([
    'finance-dashboard', 'fee-structure', 'record-payment', 'payment-history',
    'receipts', 'fee-waivers', 'payment-reversals', 'finance-audit',
    'fee-term-status', 'student-fee-status', 'family-fee-summary',
    'carry-forward', 'enroll-student', 'student-archive',
    'user-management', 'class-management', 'teacher-assignments',
    'teacher-performance', 'timetable', 'bulk-import', 'bulk-export',
    'student-promotion', 'school-settings', 'academic-calendar',
    'grading-scale', 'backup-restore', 'system-logs', 'system-settings',
    'system-health', 'analytics'
]);

const ACCOUNTANT_BLOCKED_MODULES = new Set([
    'marks-entry', 'marks-database', 'class-register', 'report-cards',
    'transcripts', 'statistics', 'assessments', 'teacher-performance',
    'timetable', 'enroll-student', 'student-archive',
    'user-management', 'class-management', 'teacher-assignments',
    'school-settings', 'academic-calendar', 'grading-scale',
    'backup-restore', 'system-logs', 'system-settings', 'system-health',
    'analytics', 'bulk-import', 'bulk-export', 'student-promotion'
]);

// ─── HELPERS ────────────────────────────────────────────────────────

function getNavConfig(role) {
    const config = NAV_CONFIG[role] || [];
    return config.map(section => ({
        ...section,
        items: section.items.filter(item => {
            if (role === 'teacher' && TEACHER_BLOCKED_MODULES.has(item.id)) return false;
            if (role === 'accountant' && ACCOUNTANT_BLOCKED_MODULES.has(item.id)) return false;
            return true;
        }),
    })).filter(section => section.items.length > 0);
}

function findNavLabel(id, role) {
    const config = getNavConfig(role);
    for (const section of config) {
        for (const item of section.items) {
            if (item.id === id) return item.label;
        }
    }
    return id;
}

function getDefaultModule(role) {
    const map = {
        admin: 'admin-dashboard',
        accountant: 'accountant-dashboard',
        teacher: 'teacher-dashboard',
    };
    return map[role] || 'admin-dashboard';
}

// ─── EXPORTS ────────────────────────────────────────────────────────

export {
    NAV_CONFIG,
    TEACHER_BLOCKED_MODULES,
    ACCOUNTANT_BLOCKED_MODULES,
    getNavConfig,
    findNavLabel,
    getDefaultModule,
};