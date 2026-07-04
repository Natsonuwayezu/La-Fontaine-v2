/**
 * ECOLE LA FONTAINE — Navigation Configuration
 * Defines sidebar menu structure per role
 * Last updated: 2026-06-28
 */

// ──────────────────────────────────────────────────────────────────────
// ROLE-BLOCKED MODULES
// ──────────────────────────────────────────────────────────────────────

// Teachers cannot access finance modules
const TEACHER_BLOCKED_MODULES = new Set([
    // ── Finance (All) ──
    'fee-structure', 'payment-history', 'record-payment', 'financial-reports',
    'overdue-payments', 'fee-waivers', 'receipts', 'carry-forward',
    'student-fee-status', 'finance-audit', 'manual-adjustments',
    'bulk-finance-actions', 'fee-assignments', 'fee-term-status',
    'credit-balances', 'discounts', 'family-fee-summary', 'balances',
    'finance-dashboard', 'receipt-printing', 'student-statements',

    // ── Student Management (Write Ops) ──
    'enroll-student', 'student-promotion', 'student-archive',
    'sibling-linking', 'family-management',

    // ── Staff & Timetable (Admin Only) ──
    'user-management', 'subjects', 'teacher-assignments',
    'teacher-performance', 'timetable', 'class-timetable',
    'staff-timetable', 'timetable-conflicts', 'timetable-import',

    // ── Settings (All) ──
    'school-settings', 'academic-calendar', 'academic-years',
    'class-management', 'grading-scale', 'grading-settings',
    'backup-restore', 'system-logs', 'api-settings', 'settings',
    'system-health', 'analytics-settings',

    // ── Bulk Operations ──
    'bulk-import', 'bulk-export',

    // ── Extended Academics ──
    'annual-register', 'rankings', 'marks-analysis', 'transcripts',
    'academic-reports', 'ranking-engine', 'report-generator',

    // ── Advanced Attendance ──
    'attendance-summary', 'attendance-analytics',
]);

// Accountants cannot access academic modules
const ACCOUNTANT_BLOCKED_MODULES = new Set([
    // ── Academics (All) ──
    'marks-entry', 'marks-database', 'class-register',
    'annual-register', 'assessments', 'report-cards',
    'rankings', 'statistics', 'timetable',
    'teacher-timetable', 'class-timetable', 'assessment-locking',
    'marks-analysis', 'marks-import-export', 'assessment-export',
    'register-export', 'report-generator', 'ranking-engine',
    'academic-reports', 'transcript', 'transcripts',

    // ── Teacher Assignments ──
    'teacher-assignments', 'teacher-performance',

    // ── Student Management (Write Ops) ──
    'enroll-student', 'student-promotion', 'student-archive',
    'sibling-linking', 'family-management',

    // ── Staff Management ──
    'user-management', 'subjects',

    // ── Settings (All) ──
    'school-settings', 'academic-calendar', 'academic-years',
    'class-management', 'grading-scale', 'grading-settings',
    'backup-restore', 'system-logs', 'api-settings', 'settings',
    'system-health', 'analytics-settings',

    // ── Bulk Operations ──
    'bulk-import', 'bulk-export',
]);

// ──────────────────────────────────────────────────────────────────────
// NAV_CONFIG — Full Menu Structure
// ──────────────────────────────────────────────────────────────────────

const NAV_CONFIG = {
    // ── ADMIN: Full Access ──────────────────────────────────────────
    admin: [
        {
            section: '🏠 Dashboard & Overview',
            items: [
                { id: 'admin-dashboard', icon: '📊', label: 'Dashboard' },
                { id: 'analytics', icon: '📈', label: 'Analytics' },
            ]
        },
        {
            section: '🔔 Communication',
            items: [
                { id: 'announcements', icon: '📢', label: 'Announcements' },
                { id: 'notification-center', icon: '🔔', label: 'Notification Center' },
                { id: 'reminders', icon: '⏰', label: 'Reminders' },
            ]
        },
        {
            section: '📋 Attendance',
            items: [
                { id: 'attendance', icon: '✅', label: 'Record Attendance' },
                { id: 'attendance-reports', icon: '📊', label: 'Attendance Reports' },
                { id: 'attendance-summary', icon: '📈', label: 'Attendance Summary' },
                { id: 'attendance-analytics', icon: '📊', label: 'Attendance Analytics' },
            ]
        },
        {
            section: '👥 Student Management',
            items: [
                { id: 'student-list', icon: '👥', label: 'All Students' },
                { id: 'enroll-student', icon: '➕', label: 'Enroll Student' },
                { id: 'student-details', icon: '🔍', label: 'Student Details' },
                { id: 'family-management', icon: '👨‍👩‍👧', label: 'Family Groups' },
                { id: 'student-promotion', icon: '🎓', label: 'Student Promotion' },
                { id: 'student-archive', icon: '📦', label: 'Student Archive' },
            ]
        },
        {
            section: '📚 Academics Core',
            items: [
                { id: 'marks-entry', icon: '📝', label: 'Marks Entry' },
                { id: 'marks-database', icon: '📋', label: 'Marks Database' },
                { id: 'class-register', icon: '📋', label: 'Class Register' },
                { id: 'report-cards', icon: '📄', label: 'Report Cards' },
                { id: 'transcripts', icon: '📜', label: 'Transcripts' },
                { id: 'academic-reports', icon: '📈', label: 'Academic Reports' },
                { id: 'statistics', icon: '📊', label: 'Statistics' },
            ]
        },
        {
            section: '💰 Finance Management',
            items: [
                { id: 'finance-dashboard', icon: '💰', label: 'Finance Dashboard' },
                { id: 'fee-structure', icon: '📋', label: 'Fee Structure' },
                { id: 'record-payment', icon: '💵', label: 'Record Payment' },
                { id: 'payment-history', icon: '📜', label: 'Payment History' },
                { id: 'receipt-printing', icon: '🧾', label: 'Receipts & Printing' },
                { id: 'overdue-payments', icon: '⚠️', label: 'Overdue Payments' },
                { id: 'fee-waivers', icon: '🎁', label: 'Fee Waivers' },
                { id: 'balances', icon: '⚖️', label: 'Student Balances' },
                { id: 'payment-reversals', icon: '↩️', label: 'Payment Reversals' },
                { id: 'financial-reports', icon: '📊', label: 'Financial Reports' },
                { id: 'fee-term-status', icon: '📊', label: 'Fee Term Status' },
                { id: 'carry-forward', icon: '📅', label: 'Fee Carry Forward' },
                { id: 'student-fee-status', icon: '📋', label: 'Student Fee Status' },
                { id: 'family-fee-summary', icon: '👨‍👩‍👧', label: 'Family Fee Summary' },
                { id: 'credit-balances', icon: '⭐', label: 'Credit Balances' },
                { id: 'discounts', icon: '🎁', label: 'Discounts' },
            ]
        },
        {
            section: '👨‍🏫 Staff & Timetable',
            items: [
                { id: 'user-management', icon: '👨‍🏫', label: 'Staff Management' },
                { id: 'subjects', icon: '📖', label: 'Subjects' },
                { id: 'teacher-assignments', icon: '📌', label: 'Teacher Assignments' },
                { id: 'teacher-performance', icon: '⭐', label: 'Teacher Performance' },
                { id: 'timetable', icon: '🕐', label: 'Master Timetable' },
            ]
        },
        {
            section: '⚙️ Settings & Configuration',
            items: [
                { id: 'school-settings', icon: '🏫', label: 'School Settings' },
                { id: 'academic-calendar', icon: '📅', label: 'Academic Calendar' },
                { id: 'academic-years', icon: '📆', label: 'Academic Years' },
                { id: 'class-management', icon: '🏛️', label: 'Class Management' },
                { id: 'grading-scale', icon: '📊', label: 'Grading Scale' },
                { id: 'backup-restore', icon: '💾', label: 'Backup & Restore' },
                { id: 'system-logs', icon: '📋', label: 'System Logs' },
                { id: 'api-settings', icon: '🔌', label: 'API Settings' },
                { id: 'settings', icon: '⚙️', label: 'System Settings' },
            ]
        },
        {
            section: '📦 Bulk Operations',
            items: [
                { id: 'bulk-import', icon: '📤', label: 'Bulk Import' },
                { id: 'bulk-export', icon: '📥', label: 'Bulk Export' },
            ]
        },
    ],

    // ── TEACHER: Academics + Own Classes ──────────────────────────
    teacher: [
        {
            section: '🏠 Dashboard',
            items: [
                { id: 'teacher-dashboard', icon: '📊', label: 'My Dashboard' },
                { id: 'notification-center', icon: '🔔', label: 'Notifications' },
            ]
        },
        {
            section: '📚 Academics',
            items: [
                { id: 'marks-entry', icon: '📝', label: 'Marks Entry' },
                { id: 'marks-database', icon: '📋', label: 'Marks Database' },
                { id: 'class-register', icon: '📋', label: 'Class Register' },
                { id: 'report-cards', icon: '📄', label: 'Report Cards' },
                { id: 'statistics', icon: '📊', label: 'Statistics' },
            ]
        },
        {
            section: '👥 Students',
            items: [
                { id: 'student-list', icon: '👥', label: 'All Students' },
                { id: 'student-details', icon: '🔍', label: 'Student Details' },
            ]
        },
        {
            section: '📋 Attendance',
            items: [
                { id: 'attendance', icon: '✅', label: 'Record Attendance' },
                { id: 'attendance-reports', icon: '📊', label: 'Attendance Reports' },
            ]
        },
        {
            section: '🕐 Timetable',
            items: [
                { id: 'teacher-timetable', icon: '🕐', label: 'My Timetable' },
            ]
        },
    ],

    // ── ACCOUNTANT: Finance + Attendance ──────────────────────────
    accountant: [
        {
            section: '🏠 Dashboard',
            items: [
                { id: 'accountant-dashboard', icon: '💰', label: 'Finance Dashboard' },
                { id: 'notification-center', icon: '🔔', label: 'Notifications' },
            ]
        },
        {
            section: '📋 Attendance',
            items: [
                { id: 'attendance', icon: '✅', label: 'Record Attendance' },
                { id: 'attendance-reports', icon: '📊', label: 'Attendance Reports' },
                { id: 'attendance-summary', icon: '📈', label: 'Attendance Summary' },
                { id: 'attendance-analytics', icon: '📊', label: 'Attendance Analytics' },
            ]
        },
        {
            section: '👥 Students',
            items: [
                { id: 'student-list', icon: '👥', label: 'All Students' },
                { id: 'student-details', icon: '🔍', label: 'Student Details' },
                { id: 'student-fee-status', icon: '📋', label: 'Student Fee Status' },
                { id: 'balances', icon: '⚖️', label: 'Balances' },
            ]
        },
        {
            section: '💰 Finance',
            items: [
                { id: 'fee-structure', icon: '📋', label: 'Fee Structure' },
                { id: 'record-payment', icon: '💵', label: 'Record Payment' },
                { id: 'payment-history', icon: '📜', label: 'Payment History' },
                { id: 'receipt-printing', icon: '🧾', label: 'Receipts' },
                { id: 'overdue-payments', icon: '⚠️', label: 'Overdue Payments' },
                { id: 'fee-waivers', icon: '🎁', label: 'Fee Waivers' },
                { id: 'payment-reversals', icon: '↩️', label: 'Payment Reversals' },
                { id: 'financial-reports', icon: '📊', label: 'Financial Reports' },
                { id: 'fee-term-status', icon: '📊', label: 'Fee Term Status' },
                { id: 'carry-forward', icon: '📅', label: 'Fee Carry Forward' },
                { id: 'family-fee-summary', icon: '👨‍👩‍👧', label: 'Family Fee Summary' },
                { id: 'credit-balances', icon: '⭐', label: 'Credit Balances' },
                { id: 'discounts', icon: '🎁', label: 'Discounts' },
            ]
        },
    ],
};

// ──────────────────────────────────────────────────────────────────────
// NAVIGATION HELPERS
// ──────────────────────────────────────────────────────────────────────

/**
 * Get the navigation config for a specific role
 * @param {string} role - 'admin' | 'teacher' | 'accountant'
 * @returns {Array} Filtered navigation sections
 */
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

/**
 * Find a nav item's label by ID
 * @param {string} id - Module ID
 * @param {string} role - User role
 * @returns {string} Display label
 */
function findNavLabel(id, role) {
    const config = getNavConfig(role);
    for (const section of config) {
        for (const item of section.items) {
            if (item.id === id) return item.label;
        }
    }
    return id;
}

/**
 * Get the default dashboard module for a role
 * @param {string} role - 'admin' | 'teacher' | 'accountant'
 * @returns {string} Module ID
 */
function getDefaultModule(role) {
    const map = {
        admin: 'admin-dashboard',
        accountant: 'accountant-dashboard',
        teacher: 'teacher-dashboard',
    };
    return map[role] || 'admin-dashboard';
}
// ── GLOBAL EXPORTS ──────────────────────────────────────────────────
window.NAV_CONFIG                  = NAV_CONFIG;
window.TEACHER_BLOCKED_MODULES     = TEACHER_BLOCKED_MODULES;
window.ACCOUNTANT_BLOCKED_MODULES  = ACCOUNTANT_BLOCKED_MODULES;
window.getNavConfig                = getNavConfig;
window.findNavLabel                = findNavLabel;
window.getDefaultModule            = getDefaultModule;
