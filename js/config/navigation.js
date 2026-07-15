/* ═══════════════════════════════════════════════════════════════════
   js/config/navigation.js — Canonical navigation registry
   ═══════════════════════════════════════════════════════════════════
   Single source of truth for the sidebar's nav groups/items and the
   hub overlay descriptions. js/ui/sidebar.js reads NAV_SECTIONS from
   here rather than defining its own copy.

   js/config/role-permissions.js filters this list per signed-in role
   before sidebar.js renders it.

   Last updated: 2026-07-13
   ═══════════════════════════════════════════════════════════════════ */

const NAV_SECTIONS = {
  dashboard: {
    label: 'Dashboard',
    icon: 'fa-table-cells-large',
    color: 'var(--accent, #6a8aba)',
    bg: 'rgba(106, 138, 186, 0.12)',
    desc: 'Your central command center — role-specific dashboards and live school metrics.',
    items: [
      { id: 'admin-dashboard', label: 'Admin Dashboard', icon: 'fa-gauge-high', desc: 'School-wide overview, attendance today, recent activity' },
      { id: 'accountant-dashboard', label: 'Accountant Dashboard', icon: 'fa-chart-pie', desc: 'Collection rates, overdue alerts, today\'s payments' },
      { id: 'teacher-dashboard', label: 'Teacher Dashboard', icon: 'fa-table', desc: 'My classes, pending marks, next periods' },
      { id: 'analytics', label: 'Academic Analytics', icon: 'fa-chart-line', desc: 'Performance trends, subject analysis, grade distribution' },
      { id: 'finance-dashboard', label: 'Finance Dashboard', icon: 'fa-sack-dollar', desc: 'Real-time financial overview and fee status' }
    ]
  },
  comms: {
    label: 'Communication',
    icon: 'fa-comments',
    color: 'var(--accent, #6a8aba)',
    bg: 'rgba(106, 138, 186, 0.12)',
    desc: 'Notifications, announcements, and personal reminders.',
    items: [
      { id: 'notifications', label: 'Notifications', icon: 'fa-bell', desc: 'System alerts, payment confirmations, marks updates', badge: 3 },
      { id: 'announcements', label: 'Announcements', icon: 'fa-bullhorn', desc: 'Publish school-wide announcements with read tracking' },
      { id: 'reminders', label: 'Reminders', icon: 'fa-clock', desc: 'Personal reminders with due dates' }
    ]
  },
  attendance: {
    label: 'Attendance',
    icon: 'fa-clipboard-check',
    color: 'var(--warning, #b8983a)',
    bg: 'rgba(184, 152, 58, 0.12)',
    desc: 'Record, monitor, and analyze daily attendance.',
    items: [
      { id: 'attendance', label: 'Record Attendance', icon: 'fa-pen-to-square', desc: 'Mark daily attendance in bulk' },
      { id: 'attendance-reports', label: 'Reports', icon: 'fa-file-lines', desc: 'By class and date range, export to Excel' },
      { id: 'attendance-summary', label: 'Summary', icon: 'fa-chart-bar', desc: 'Rates per student and class' },
      { id: 'attendance-analytics', label: 'Analytics', icon: 'fa-chart-line', desc: 'Trends and patterns over time' }
    ]
  },
  students: {
    label: 'Students',
    icon: 'fa-users',
    color: 'var(--info, #4a7a8a)',
    bg: 'rgba(74, 122, 138, 0.12)',
    desc: 'Manage the complete student lifecycle.',
    items: [
      { id: 'student-list', label: 'All Students', icon: 'fa-users', desc: 'Search, filter, and manage enrolled students' },
      { id: 'enroll-student', label: 'Enroll Student', icon: 'fa-user-plus', desc: 'Register new students with auto fee assignment' },
      { id: 'student-details', label: 'Student Profile', icon: 'fa-id-card', desc: 'Academic records, fee history, family info' },
      { id: 'family-management', label: 'Family Management', icon: 'fa-house-chimney-user', desc: 'Sibling linking and family discounts' },
      { id: 'student-archive', label: 'Archive', icon: 'fa-box-archive', desc: 'Graduated or transferred students' },
      { id: 'student-fee-status', label: 'Student Fee Status', icon: 'fa-coins', desc: 'Live balance view per student' }
    ]
  },
  academics: {
    label: 'Academics',
    icon: 'fa-graduation-cap',
    color: 'var(--purple, #8a6aaa)',
    bg: 'rgba(138, 106, 170, 0.12)',
    desc: 'Assessments, marks entry, registers, report cards, transcripts.',
    items: [
      { id: 'assessments', label: 'Assessments', icon: 'fa-clipboard-list', desc: 'Create and lock assessments by class/subject/term' },
      { id: 'marks-entry', label: 'Marks Entry', icon: 'fa-pencil', desc: 'Live-validated entry with batch save' },
      { id: 'marks-database', label: 'Marks Database', icon: 'fa-database', desc: 'Browse and edit marks across assessments' },
      { id: 'class-register', label: 'Class Register', icon: 'fa-table-list', desc: 'Pre/Post/Annual layouts, Nursery and Primary' },
      { id: 'report-cards', label: 'Report Cards', icon: 'fa-file-invoice', desc: 'Individual and batch generation with QR codes' },
      { id: 'transcripts', label: 'Transcripts', icon: 'fa-scroll', desc: 'Full academic history' },
      { id: 'statistics', label: 'Statistics', icon: 'fa-chart-pie', desc: 'Compare performance by subject, class, term' }
    ]
  },
  holidays: {
    label: 'Holidays',
    icon: 'fa-umbrella-beach',
    color: 'var(--warning, #b8983a)',
    bg: 'rgba(184, 152, 58, 0.12)',
    desc: 'Holiday-only marks and fees — isolated from the regular term tables.',
    items: [
      { id: 'holidays-marks', label: 'Holiday Marks', icon: 'fa-book-open', desc: 'Remedial/holiday coursework marks, kept separate from the register' },
      { id: 'holidays-fees', label: 'Holiday Fees', icon: 'fa-money-bill', desc: 'Fees specific to the holiday period (e.g. holiday camp)' }
    ]
  },
  finance: {
    label: 'Finance',
    icon: 'fa-sack-dollar',
    color: 'var(--success, #3a7a5a)',
    bg: 'rgba(58, 122, 90, 0.12)',
    desc: 'Fee collection, receipts, waivers, overdue alerts, reporting.',
    items: [
      { id: 'finance-dashboard', label: 'Finance Dashboard', icon: 'fa-chart-column', desc: 'Collection rates and recent payments' },
      { id: 'fee-structure', label: 'Fee Structure', icon: 'fa-list-ol', desc: 'Fee categories and amounts per class/year' },
      { id: 'record-payment', label: 'Record Payment', icon: 'fa-money-bill-wave', desc: 'FIFO auto-allocation, instant receipt' },
      { id: 'payment-history', label: 'Payment History', icon: 'fa-clock-rotate-left', desc: 'Filter by student, class, date, method' },
      { id: 'receipts', label: 'Receipts', icon: 'fa-receipt', desc: 'Print, reprint, export' },
      { id: 'fee-waivers', label: 'Waivers / Discounts', icon: 'fa-tag', desc: 'With reason and audit trail' },
      { id: 'payment-reversals', label: 'Reversals', icon: 'fa-rotate-left', desc: 'Reverse with balance recalculation' },
      { id: 'finance-audit', label: 'Finance Audit', icon: 'fa-magnifying-glass-chart', desc: 'Audit trail for all transactions' },
      { id: 'family-fee-summary', label: 'Family Fee Summary', icon: 'fa-users-rectangle', desc: 'By family group' }
    ]
  },
  staff: {
    label: 'Staff',
    icon: 'fa-chalkboard-user',
    color: 'var(--danger, #c45a4a)',
    bg: 'rgba(196, 90, 74, 0.12)',
    desc: 'Staff accounts, assignments, performance, master timetable.',
    items: [
      { id: 'user-management', label: 'User Management', icon: 'fa-users-gear', desc: 'Teacher/accountant accounts and roles' },
      { id: 'class-management', label: 'Class / Subjects', icon: 'fa-book', desc: 'Class names, levels, class teacher assignment' },
      { id: 'teacher-assignments', label: 'Teacher Assignments', icon: 'fa-person-chalkboard', desc: 'Visual matrix view' },
      { id: 'teacher-performance', label: 'Teacher Performance', icon: 'fa-chart-line', desc: 'Completion rates and class averages' },
      { id: 'timetable', label: 'Timetable', icon: 'fa-calendar-days', desc: 'Master grid with conflict detection' }
    ]
  },
  bulk: {
    label: 'Bulk Operations',
    icon: 'fa-layer-group',
    color: 'var(--text-soft, #6b5f56)',
    bg: 'rgba(107, 95, 86, 0.10)',
    desc: 'Mass import/export and year-end workflows.',
    items: [
      { id: 'bulk-import', label: 'Bulk Import', icon: 'fa-file-import', desc: 'Students, marks, payments, teachers' },
      { id: 'bulk-export', label: 'Bulk Export', icon: 'fa-file-export', desc: 'Excel/JSON, full DB backup' },
      { id: 'student-promotion', label: 'Student Promotion', icon: 'fa-arrow-up-right-dots', desc: 'Promote or repeat, batch processing' },
      { id: 'carry-forward', label: 'Carry Forward', icon: 'fa-forward', desc: 'Outstanding balances to next term/year' }
    ]
  },
  settings: {
    label: 'Settings',
    icon: 'fa-gear',
    color: 'var(--text-soft, #6b5f56)',
    bg: 'rgba(107, 95, 86, 0.10)',
    desc: 'School profile, academic years, grading rules, maintenance.',
    items: [
      { id: 'school-settings', label: 'School Settings', icon: 'fa-school', desc: 'Name, logo, head teacher, contact details' },
      { id: 'academic-calendar', label: 'Academic Calendar', icon: 'fa-calendar', desc: 'Years, terms, midterm dates' },
      { id: 'grading-scale', label: 'Grading Settings', icon: 'fa-star-half-stroke', desc: 'Grade boundaries, colors, pass mark' },
      { id: 'backup-restore', label: 'Backup & Restore', icon: 'fa-hard-drive', desc: 'Full DB backup, auto-schedule, restore' },
      { id: 'system-logs', label: 'System Logs', icon: 'fa-list-check', desc: 'Audit trail of user actions' },
      { id: 'system-health', label: 'System Health', icon: 'fa-heart-pulse', desc: 'App performance and connectivity' }
    ]
  },
  help: {
    label: 'Help',
    icon: 'fa-circle-question',
    color: 'var(--text-soft, #6b5f56)',
    bg: 'rgba(107, 95, 86, 0.10)',
    desc: 'Support and documentation.',
    items: [
      { id: 'help-center', label: 'Help Center', icon: 'fa-circle-question', desc: 'Browse help articles and guides' },
      { id: 'faq', label: 'FAQ', icon: 'fa-list', desc: 'Frequently asked questions' },
      { id: 'support', label: 'Contact Support', icon: 'fa-envelope', desc: 'Reach out to the support team' }
    ]
  }
};

/**
 * Flat lookup: moduleId -> { sectionId, item }
 * Used by core/router.js to resolve a route straight to its nav entry
 * without walking the tree.
 */
const NAV_MODULE_INDEX = (() => {
  const index = {};
  Object.entries(NAV_SECTIONS).forEach(([sectionId, section]) => {
    section.items.forEach((item) => {
      index[item.id] = { sectionId, ...item };
    });
  });
  return index;
})();

// ─── HELPERS ────────────────────────────────────────────────────────

/**
 * Get the full navigation configuration for a specific section
 * @param {string} sectionId - The section key (e.g., 'dashboard', 'finance')
 * @returns {object|null} The section object or null if not found
 */
function getNavSection(sectionId) {
  return NAV_SECTIONS[sectionId] || null;
}

/**
 * Get all items for a specific section
 * @param {string} sectionId - The section key
 * @returns {array} Array of items or empty array
 */
function getNavItems(sectionId) {
  const section = getNavSection(sectionId);
  return section ? section.items : [];
}

/**
 * Find a module by its ID in the flat index
 * @param {string} moduleId - The module ID to find
 * @returns {object|null} The module entry or null
 */
function findNavModule(moduleId) {
  return NAV_MODULE_INDEX[moduleId] || null;
}

/**
 * Get the label for a module ID
 * @param {string} moduleId - The module ID
 * @returns {string} The module label or the ID itself
 */
function getNavLabel(moduleId) {
  const entry = findNavModule(moduleId);
  return entry ? entry.label : moduleId;
}

/**
 * Get the default module for a role
 * @param {string} role - The user role
 * @returns {string} The default module ID
 */
function getDefaultModule(role) {
  const map = {
    admin: 'admin-dashboard',
    accountant: 'accountant-dashboard',
    teacher: 'teacher-dashboard'
  };
  return map[role] || 'admin-dashboard';
}

// ─── EXPORTS ────────────────────────────────────────────────────────

window.NAV_SECTIONS = NAV_SECTIONS;
window.NAV_MODULE_INDEX = NAV_MODULE_INDEX;
window.getNavSection = getNavSection;
window.getNavItems = getNavItems;
window.findNavModule = findNavModule;
window.getNavLabel = getNavLabel;
window.getDefaultModule = getDefaultModule;