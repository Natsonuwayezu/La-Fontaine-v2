/**
 * ECOLE LA FONTAINE — Permission Checks
 * Role-based access control helpers
 * Last updated: 2026-06-28
 */

import { state, isAdmin, isTeacher, isAccountant } from './state.js';

// ──────────────────────────────────────────────────────────────────────
// MODULE ACCESS
// ──────────────────────────────────────────────────────────────────────

/**
 * Check if the current user can access a module
 * @param {string} moduleId - Module ID
 * @returns {boolean} Can access
 */
export function canAccessModule(moduleId) {
    const role = state.currentUser?.role;
    if (!role) return false;
    if (role === 'admin') return true;

    const { TEACHER_BLOCKED_MODULES, ACCOUNTANT_BLOCKED_MODULES } = require('../config/navigation.js');
    if (role === 'teacher' && TEACHER_BLOCKED_MODULES.has(moduleId)) return false;
    if (role === 'accountant' && ACCOUNTANT_BLOCKED_MODULES.has(moduleId)) return false;
    return true;
}

/**
 * Check if the current user is a class teacher for a specific class
 * @param {number} classId - Class ID
 * @returns {boolean} Is class teacher
 */
export function isClassTeacher(classId) {
    const user = state.currentUser;
    if (!user || user.role !== 'teacher') return false;
    const cls = state.classes.find(c => c.id === parseInt(classId));
    return cls?.class_teacher_id === user.id;
}

/**
 * Check if a teacher can access a specific class (teacher of any subject in it)
 * @param {number} teacherId - Teacher ID
 * @param {number} classId - Class ID
 * @returns {Promise<boolean>}
 */
export async function canAccessClass(teacherId, classId) {
    if (isAdmin()) return true;
    if (isClassTeacher(classId)) return true;
    const assignments = await get('teacher_assignments', {
        teacher_id: teacherId,
        class_id: classId,
    });
    return assignments.length > 0;
}

// ──────────────────────────────────────────────────────────────────────
// FINANCE ACCESS
// ──────────────────────────────────────────────────────────────────────

export function canManageFees() {
    return isAdmin() || isAccountant();
}

export function canRecordPayment() {
    return isAdmin() || isAccountant();
}

export function canViewPayments() {
    return isAdmin() || isAccountant();
}

// ──────────────────────────────────────────────────────────────────────
// ACADEMIC ACCESS
// ──────────────────────────────────────────────────────────────────────

export function canEnterMarks() {
    return isAdmin() || isTeacher();
}

export function canViewClassRegister() {
    return isAdmin() || isTeacher();
}

export function canGenerateReportCards() {
    return isAdmin() || isTeacher();
}

// ──────────────────────────────────────────────────────────────────────
// ATTENDANCE ACCESS
// ──────────────────────────────────────────────────────────────────────

export function canRecordAttendance() {
    return isAdmin() || isTeacher() || isAccountant();
}

export function canViewAttendanceReports() {
    return isAdmin() || isTeacher() || isAccountant();
}

// ──────────────────────────────────────────────────────────────────────
// STAFF ACCESS
// ──────────────────────────────────────────────────────────────────────

export function canManageStaff() {
    return isAdmin();
}

export function canManageSubjects() {
    return isAdmin();
}

export function canAssignTeachers() {
    return isAdmin();
}

// ──────────────────────────────────────────────────────────────────────
// SETTINGS ACCESS
// ──────────────────────────────────────────────────────────────────────

export function canManageSettings() {
    return isAdmin();
}

export function canManageSystem() {
    return isAdmin();
}
// ──────────────────────────────────────────────────────────────────────
// YEAR EDIT GUARD
// ──────────────────────────────────────────────────────────────────────

/**
 * Returns true if given academic year is the active (current) year
 * @param {number} yearId
 * @returns {boolean}
 */
export function isActiveYear(yearId) {
    const { state } = { state: window._state };
    try {
        const s = window.__appState || {};
        const activeYear = (s.academicYears || []).find(y => y.is_active);
        return activeYear?.id === yearId;
    } catch (e) { return true; }
}
