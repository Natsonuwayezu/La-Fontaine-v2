/* ═══════════════════════════════════════════════════════════════════
   js/config/role-permissions.js — Role permission map
   ═══════════════════════════════════════════════════════════════════
   Single source of truth for role-based access control.
   Defines which module IDs are blocked per role, and provides
   canAccess() / canEdit() / canDelete() helpers used throughout
   the app.

   Three roles (constants.js): admin, teacher, accountant.

   Shape: ROLE_PERMISSIONS[role] = {
     modules: '*' | [moduleId, ...]   — which NAV_MODULE_INDEX entries are visible
     actions: { actionKey: true|false }  — fine-grained capability flags
   }

   Admin can see: My Dashboard + Finance Dashboard + Analytics
   Teacher can see: My Dashboard only
   Accountant can see: My Dashboard + Finance Dashboard

   Load order: AFTER constants.js, BEFORE navigation.js.

   Last updated: 2026-07-14
   ═══════════════════════════════════════════════════════════════════ */

'use strict';

/* ═══════════════════════════════════════════════════════════════════
   BLOCKED MODULE SETS (Part 3.2)
   These are the moduleIds that the listed role is NOT allowed to see
   or navigate to. The router checks this before loading any module.
   ═══════════════════════════════════════════════════════════════════ */

/**
 * Modules the ACCOUNTANT role cannot access.
 * Accountants only see: finance, attendance, their own profile, notifications.
 */
const ACCOUNTANT_BLOCKED_MODULES = new Set([
  // ── All academic modules ──
  'marks-entry',
  'marks-database',
  'marks-analysis',
  'marks-import-export',
  'assessments',
  'assessment-locking',
  'class-register',
  'annual-register',
  'report-cards',
  'rankings',
  'transcripts',
  'statistics',
  'academic-reports',
  'holidays-marks',

  // ── Student management (except viewing for payment context) ──
  'enroll-student',
  'student-promotion',
  'student-archive',
  'sibling-linking',

  // ── Staff management ──
  'user-management',
  'subjects',
  'teacher-assignments',
  'teacher-performance',

  // ── Timetable ──
  'timetable',
  'class-timetable',
  'teacher-timetable',
  'timetable-conflicts',

  // ── Settings (except own profile) ──
  'school-settings',
  'academic-years',
  'academic-calendar',
  'class-management',
  'grading-scale',
  'api-settings',
  'backup-restore',
  'system-logs',

  // ── Analytics (admin only) ──
  'analytics',
  'analytics-settings',
  'system-health',

  // ── Bulk operations ──
  'bulk-import',
  'bulk-student-actions',
  'student-promotion',

  // ── Finance admin-only ──
  'finance-audit',
  'manual-adjustments'
]);

/**
 * Modules the TEACHER role cannot access.
 * Teachers only see: their own academics, attendance, student list,
 * timetable, notifications, and their own profile.
 */
const TEACHER_BLOCKED_MODULES = new Set([
  // ── All finance modules ──
  'finance-dashboard',
  'fee-structure',
  'fee-assignments',
  'fee-term-status',
  'record-payment',
  'payment-history',
  'receipts',
  'overdue-payments',
  'fee-waivers',
  'credit-balances',
  'balances',
  'student-fees',
  'student-statements',
  'family-fee-summary',
  'payment-reversals',
  'manual-adjustments',
  'discounts',
  'carry-forward',
  'finance-audit',
  'financial-reports',
  'holidays-fees',

  // ── Admin-only student management ──
  'enroll-student',
  'student-promotion',
  'student-archive',
  'family-management',
  'sibling-linking',

  // ── Admin-only academic ──
  'annual-register',
  'academic-reports',

  // ── Staff management ──
  'user-management',
  'teacher-assignments',
  'teacher-performance',
  'subjects',

  // ── Settings (except own profile) ──
  'school-settings',
  'academic-years',
  'academic-calendar',
  'class-management',
  'grading-scale',
  'api-settings',
  'backup-restore',
  'system-logs',

  // ── Analytics (admin only) ──
  'analytics',
  'analytics-settings',
  'system-health',

  // ── Bulk operations ──
  'bulk-import',
  'bulk-export',
  'bulk-finance-actions',
  'bulk-student-actions',

  // ── Announcements (teachers can read, but not create) ──
  'announcements',

  // ── Finance audit ──
  'finance-audit'
]);

/**
 * Admin has no blocked modules — admin can access everything.
 */
const ADMIN_BLOCKED_MODULES = new Set(); // Empty

/* ═══════════════════════════════════════════════════════════════════
   ROLE PERMISSIONS MAP
   Used by navigation.js and router.js for module filtering.
   ═══════════════════════════════════════════════════════════════════ */

const ROLE_PERMISSIONS = {
  admin: {
    // Admin sees every module in NAV_SECTIONS
    modules: '*',
    // Dashboard modules visible to admin: their own + analytics + finance
    dashboardModules: [
      'admin-dashboard',
      'analytics',
      'finance-dashboard'
    ],
    actions: {
      manageUsers: true,
      manageSettings: true,
      manageAcademicCalendar: true,
      manageGradingScale: true,
      viewFinanceAudit: true,
      reverseFinancePayments: true,
      applyFeeWaivers: true,
      lockAssessments: true,
      editLockedAssessments: true,
      bulkImportExport: true,
      manageBackups: true,
      viewSystemLogs: true,
      promoteStudents: true,
      manageTimetable: true,
      manageFamily: true,
      viewAllReports: true,
      manageHolidays: true
    }
  },

  teacher: {
    // Teacher sees only academic and attendance modules
    modules: [
      'teacher-dashboard',
      'notifications',
      'reminders',
      'attendance',
      'attendance-reports',
      'attendance-summary',
      'attendance-analytics',
      'student-list',
      'student-details',
      'assessments',
      'marks-entry',
      'marks-database',
      'marks-analysis',
      'class-register',
      'report-cards',
      'transcripts',
      'statistics',
      'holidays-marks',
      'timetable',
      'teacher-timetable'
    ],
    // Dashboard modules visible to teacher: only their own
    dashboardModules: [
      'teacher-dashboard'
    ],
    actions: {
      manageUsers: false,
      manageSettings: false,
      manageAcademicCalendar: false,
      manageGradingScale: false,
      viewFinanceAudit: false,
      reverseFinancePayments: false,
      applyFeeWaivers: false,
      lockAssessments: false,
      editLockedAssessments: false,
      bulkImportExport: false,
      manageBackups: false,
      viewSystemLogs: false,
      promoteStudents: false,
      manageTimetable: false,
      manageFamily: false,
      viewAllReports: false,
      manageHolidays: false
    }
  },

  accountant: {
    // Accountant sees finance and attendance modules
    modules: [
      'accountant-dashboard',
      'finance-dashboard',
      'notifications',
      'reminders',
      'student-list',
      'student-details',
      'student-fee-status',
      'family-management',
      'fee-structure',
      'record-payment',
      'payment-history',
      'receipts',
      'fee-waivers',
      'payment-reversals',
      'family-fee-summary',
      'holidays-fees',
      'bulk-export',
      'attendance',
      'attendance-reports',
      'attendance-summary',
      'attendance-analytics'
    ],
    // Dashboard modules visible to accountant: their own + finance
    dashboardModules: [
      'accountant-dashboard',
      'finance-dashboard'
    ],
    actions: {
      manageUsers: false,
      manageSettings: false,
      manageAcademicCalendar: false,
      manageGradingScale: false,
      viewFinanceAudit: true,
      reverseFinancePayments: true,
      applyFeeWaivers: true,
      lockAssessments: false,
      editLockedAssessments: false,
      bulkImportExport: false,
      manageBackups: false,
      viewSystemLogs: false,
      promoteStudents: false,
      manageTimetable: false,
      manageFamily: true,
      viewAllReports: false,
      manageHolidays: false
    }
  }
};

/* ═══════════════════════════════════════════════════════════════════
   CLASS TEACHER EXTRA RIGHTS
   A teacher whose id matches classes.class_teacher_id gets
   expanded access beyond their normal teacher role. (Part 3.2)
   ═══════════════════════════════════════════════════════════════════ */

const CLASS_TEACHER_EXTRA_ACCESS = [
  'attendance-entry',
  'attendance-reports',
  'attendance-summary',
  'class-register',
  'timetable'
];

/* ═══════════════════════════════════════════════════════════════════
   FINE-GRAINED PERMISSION RULES
   Beyond module-level access. Used by individual modules before
   showing edit/delete buttons.
   ═══════════════════════════════════════════════════════════════════ */

const PERMISSIONS = {
  // ── Students ──
  students: {
    create: ['admin'],
    read: ['admin', 'teacher'],
    update: ['admin'],
    delete: ['admin'], // soft-delete only
    archive: ['admin'],
    promote: ['admin']
  },

  // ── Marks ──
  marks: {
    create: ['admin', 'teacher'],
    read: ['admin', 'teacher'],
    update: ['admin', 'teacher'],
    delete: ['admin'],
    lock: ['admin'],
    unlock: ['admin']
  },

  // ── Assessments ──
  assessments: {
    create: ['admin', 'teacher'],
    read: ['admin', 'teacher'],
    update: ['admin', 'teacher'],
    delete: ['admin'],
    lock: ['admin'],
    unlock: ['admin']
  },

  // ── Finance ──
  payments: {
    create: ['admin', 'accountant'],
    read: ['admin', 'accountant'],
    update: [], // payments cannot be edited, only reversed
    delete: [], // never hard-delete payments
    reverse: ['admin']
  },
  fees: {
    create: ['admin', 'accountant'],
    read: ['admin', 'accountant'],
    update: ['admin', 'accountant'],
    delete: ['admin'],
    waive: ['admin', 'accountant']
  },

  // ── Staff ──
  teachers: {
    create: ['admin'],
    read: ['admin'],
    update: ['admin'],
    delete: ['admin'],
    resetPw: ['admin']
  },

  // ── Settings ──
  settings: {
    read: ['admin', 'teacher', 'accountant'],
    update: ['admin']
  },

  // ── Announcements ──
  announcements: {
    create: ['admin'],
    read: ['admin', 'teacher', 'accountant'],
    update: ['admin'],
    delete: ['admin']
  },

  // ── Reports / Exports ──
  reports: {
    generate: ['admin', 'teacher'],
    export: ['admin', 'accountant'],
    print: ['admin', 'teacher', 'accountant']
  },

  // ── Holiday data ──
  holiday_marks: {
    create: ['admin', 'teacher'],
    read: ['admin', 'teacher'],
    update: ['admin', 'teacher'],
    delete: ['admin']
  },
  holiday_fees: {
    create: ['admin', 'accountant'],
    read: ['admin', 'accountant'],
    update: ['admin', 'accountant'],
    delete: ['admin']
  }
};

/* ═══════════════════════════════════════════════════════════════════
   HELPER FUNCTIONS
   ═══════════════════════════════════════════════════════════════════ */

/**
 * Check if a role can access a specific module.
 * Always returns true for 'admin'.
 * Checks TEACHER_BLOCKED_MODULES and ACCOUNTANT_BLOCKED_MODULES.
 *
 * @param {string}  role       - 'admin' | 'teacher' | 'accountant'
 * @param {string}  moduleId   - the target module id
 * @param {boolean} isHoliday  - true when app is in holiday mode
 * @returns {boolean} True if the role can access the module
 */
function canAccess(role, moduleId, isHoliday = false) {
  if (!role || !moduleId) return false;

  // Admin has full access
  if (role === 'admin') return true;

  // Check role-specific blocked sets
  if (role === 'accountant' && ACCOUNTANT_BLOCKED_MODULES.has(moduleId)) return false;
  if (role === 'teacher' && TEACHER_BLOCKED_MODULES.has(moduleId)) return false;

  // Holiday-only modules are blocked outside of holiday mode
  const navItem = (typeof MODULE_MAP !== 'undefined') ? MODULE_MAP[moduleId] : null;
  if (navItem && navItem.holidayOnly && !isHoliday) return false;

  return true;
}

/**
 * Check a fine-grained permission on a specific entity type.
 *
 * @param {string} role     - 'admin' | 'teacher' | 'accountant'
 * @param {string} entity   - key in PERMISSIONS (e.g. 'marks', 'payments')
 * @param {string} action   - 'create' | 'read' | 'update' | 'delete' | etc.
 * @returns {boolean} True if the role can perform the action
 */
function can(role, entity, action) {
  if (!role || !entity || !action) return false;
  const entityPerms = PERMISSIONS[entity];
  if (!entityPerms) return false;
  const allowed = entityPerms[action] || [];
  return allowed.includes(role);
}

/**
 * Check if a role can access a dashboard module.
 *
 * @param {string} role     - The user role
 * @param {string} moduleId - The module ID to check
 * @returns {boolean} True if the role can access the dashboard module
 */
function canAccessDashboard(role, moduleId) {
  const perms = ROLE_PERMISSIONS[role];
  if (!perms) return false;

  // Admin with '*' can access all dashboards
  if (perms.modules === '*') {
    return perms.dashboardModules.includes(moduleId);
  }

  // Teacher only sees their own dashboard
  // Accountant sees their own + finance dashboard
  return perms.dashboardModules.includes(moduleId);
}

/**
 * Check if a role can perform a specific action from ROLE_PERMISSIONS.
 *
 * @param {string} role      - The user role
 * @param {string} actionKey - The action key to check
 * @returns {boolean} True if the role can perform the action
 */
function canPerformAction(role, actionKey) {
  const perms = ROLE_PERMISSIONS[role];
  if (!perms) return false;
  return !!perms.actions?.[actionKey];
}

/**
 * Get all modules a role can access.
 *
 * @param {string} role - The user role
 * @returns {array|string} Array of module IDs or '*' for all
 */
function getAccessibleModules(role) {
  const perms = ROLE_PERMISSIONS[role];
  if (!perms) return [];
  return perms.modules;
}

/**
 * Get the dashboard modules for a role.
 *
 * @param {string} role - The user role
 * @returns {array} Array of dashboard module IDs
 */
function getDashboardModules(role) {
  const perms = ROLE_PERMISSIONS[role];
  if (!perms) return [];
  return perms.dashboardModules || [];
}

// ─── Short-hand helpers ─────────────────────────────────────────────

function canEdit(role, entity) { return can(role, entity, 'update'); }
function canDelete(role, entity) { return can(role, entity, 'delete'); }
function canCreate(role, entity) { return can(role, entity, 'create'); }
function canRead(role, entity) { return can(role, entity, 'read'); }

// ─── Current user helpers ───────────────────────────────────────────

/**
 * Check if the currently logged-in user is an admin.
 * Reads from window.state (available after state.js is loaded).
 */
function isAdmin() {
  return window.state?.currentUser?.role === 'admin';
}

/**
 * Check if the currently logged-in user is a teacher.
 */
function isTeacher() {
  return window.state?.currentUser?.role === 'teacher';
}

/**
 * Check if the currently logged-in user is an accountant.
 */
function isAccountant() {
  return window.state?.currentUser?.role === 'accountant';
}

/**
 * Return the current user's role string, or null if not logged in.
 */
function currentRole() {
  return window.state?.currentUser?.role || null;
}

/**
 * Return the current user's ID, or null if not logged in.
 */
function currentUserId() {
  return window.state?.currentUser?.id || null;
}

/**
 * Check if a teacher is the class teacher for a given class.
 * If yes, they get expanded access (CLASS_TEACHER_EXTRA_ACCESS).
 *
 * @param {number} teacherId - teacher's DB id
 * @param {number} classId   - class's DB id
 * @returns {boolean} True if the teacher is the class teacher
 */
function isClassTeacher(teacherId, classId) {
  if (!teacherId || !classId) return false;
  const cls = window.state?.classes?.find(c => c.id === classId);
  return cls && cls.class_teacher_id === teacherId;
}

/* ═══════════════════════════════════════════════════════════════════
   EXPOSE TO WINDOW
   ═══════════════════════════════════════════════════════════════════ */

window.ADMIN_BLOCKED_MODULES = ADMIN_BLOCKED_MODULES;
window.TEACHER_BLOCKED_MODULES = TEACHER_BLOCKED_MODULES;
window.ACCOUNTANT_BLOCKED_MODULES = ACCOUNTANT_BLOCKED_MODULES;
window.CLASS_TEACHER_EXTRA_ACCESS = CLASS_TEACHER_EXTRA_ACCESS;
window.ROLE_PERMISSIONS = ROLE_PERMISSIONS;
window.PERMISSIONS = PERMISSIONS;

window.canAccess = canAccess;
window.can = can;
window.canEdit = canEdit;
window.canDelete = canDelete;
window.canCreate = canCreate;
window.canRead = canRead;
window.canAccessDashboard = canAccessDashboard;
window.canPerformAction = canPerformAction;
window.getAccessibleModules = getAccessibleModules;
window.getDashboardModules = getDashboardModules;
window.isAdmin = isAdmin;
window.isTeacher = isTeacher;
window.isAccountant = isAccountant;
window.currentRole = currentRole;
window.currentUserId = currentUserId;
window.isClassTeacher = isClassTeacher;

/* ═══════════════════════════════════════════════════════════════════
   EXPORTS (for ES module usage)
   ═══════════════════════════════════════════════════════════════════ */

export {
  ADMIN_BLOCKED_MODULES,
  TEACHER_BLOCKED_MODULES,
  ACCOUNTANT_BLOCKED_MODULES,
  CLASS_TEACHER_EXTRA_ACCESS,
  ROLE_PERMISSIONS,
  PERMISSIONS,
  canAccess,
  can,
  canEdit,
  canDelete,
  canCreate,
  canRead,
  canAccessDashboard,
  canPerformAction,
  getAccessibleModules,
  getDashboardModules,
  isAdmin,
  isTeacher,
  isAccountant,
  currentRole,
  currentUserId,
  isClassTeacher
};