/* ═══════════════════════════════════════════════════════════════════
   js/core/permissions.js
   ═══════════════════════════════════════════════════════════════════
   Purpose : Runtime permission checks used directly inside module
             render functions to show/hide buttons, columns, and
             sections based on the current user's role.
             Config-level permission sets live in role-permissions.js.
             This file is the runtime layer that reads state.currentUser
             and returns boolean decisions instantly (no async).
   Load order: AFTER role-permissions.js and state.js.
   ═══════════════════════════════════════════════════════════════════ */

'use strict';

/* ═══════════════════════════════════════════════════════════════════
   1. ROLE SHORTCUTS
   ═══════════════════════════════════════════════════════════════════ */

/** Return the current user's role string or empty string. */
function myRole() {
    return state.currentUser?.role || '';
}

/** Return the current user's id or null. */
function myId() {
    return state.currentUser?.id || null;
}

/** True if the current user is admin. */
function iAmAdmin() {
    return myRole() === 'admin';
}

/** True if the current user is a teacher. */
function iAmTeacher() {
    return myRole() === 'teacher';
}

/** True if the current user is an accountant. */
function iAmAccountant() {
    return myRole() === 'accountant';
}

/* ═══════════════════════════════════════════════════════════════════
   2. MODULE ACCESS CHECKS  (Part 3.2)
   ═══════════════════════════════════════════════════════════════════ */

/**
 * True if the current user can navigate to a given module.
 * @param {string}  moduleId
 * @param {boolean} [holidayMode] - pass isHolidayMode() if already computed
 */
function canNavigateTo(moduleId, holidayMode) {
    const role = myRole();
    const holiday = holidayMode !== undefined ? holidayMode : isHolidayMode();
    return canAccess(role, moduleId, holiday);
}

/**
 * True if the current user is blocked from a module.
 * Used by router.js before rendering.
 */
function isBlocked(moduleId) {
    return !canNavigateTo(moduleId);
}

/* ═══════════════════════════════════════════════════════════════════
   3. ENTITY PERMISSIONS
   ═══════════════════════════════════════════════════════════════════ */

/** True if current user can create students. */
function canCreateStudents() { return iAmAdmin(); }

/** True if current user can edit a student. */
function canEditStudent() { return iAmAdmin(); }

/** True if current user can archive a student. */
function canArchiveStudent() { return iAmAdmin(); }

/** True if current user can promote students. */
function canPromoteStudents() { return iAmAdmin(); }

/**
 * True if current user can enter marks for a given assessment.
 * A teacher can only enter marks for assessments they created,
 * UNLESS they are the class teacher (expanded access).
 *
 * @param {Object} assessment - assessment row
 */
function canEnterMarks(assessment) {
    if (iAmAdmin()) return true;
    if (!iAmTeacher()) return false;
    if (!assessment) return false;

    // Teacher can always edit their own assessments
    if (assessment.created_by === myId()) return true;

    // Class teacher gets access to all assessments in their class
    const cls = getClass(assessment.class_id);
    if (cls && cls.class_teacher_id === myId()) return true;

    return false;
}

/** True if current user can lock/unlock assessments. */
function canLockAssessments() { return iAmAdmin(); }

/** True if current user can delete an assessment. */
function canDeleteAssessment(assessment) {
    if (iAmAdmin()) return true;
    if (iAmTeacher() && assessment?.created_by === myId()) return true;
    return false;
}

/** True if current user can view the full marks database. */
function canViewMarksDB() { return iAmAdmin(); }

/** True if current user can view/generate report cards. */
function canViewReportCards() { return iAmAdmin(); }

/** True if current user can view annual register. */
function canViewAnnualRegister() { return iAmAdmin(); }

/* Finance */

/** True if current user can record payments. */
function canRecordPayment() { return iAmAdmin() || iAmAccountant(); }

/** True if current user can view payment history. */
function canViewPayments() { return iAmAdmin() || iAmAccountant(); }

/** True if current user can create fee categories/amounts. */
function canManageFees() { return iAmAdmin() || iAmAccountant(); }

/** True if current user can grant waivers. */
function canGrantWaivers() { return iAmAdmin() || iAmAccountant(); }

/** True if current user can reverse a payment. */
function canReversePayment() { return iAmAdmin(); }

/** True if current user can view financial reports. */
function canViewFinanceReports() { return iAmAdmin() || iAmAccountant(); }

/* Staff */

/** True if current user can manage teachers/accountants. */
function canManageStaff() { return iAmAdmin(); }

/** True if current user can manage subjects. */
function canManageSubjects() { return iAmAdmin(); }

/** True if current user can reset another user's password. */
function canResetPassword(targetUserId) {
    if (iAmAdmin()) return true;
    // Users can reset their own
    return targetUserId === myId();
}

/* Settings */

/** True if current user can access school settings. */
function canManageSettings() { return iAmAdmin(); }

/** True if current user can update the grading scale. */
function canManageGrading() { return iAmAdmin(); }

/** True if current user can perform backups. */
function canBackup() { return iAmAdmin(); }

/** True if current user can view system logs. */
function canViewLogs() { return iAmAdmin(); }

/* Announcements */

/** True if current user can create announcements. */
function canCreateAnnouncements() { return iAmAdmin(); }

/* ═══════════════════════════════════════════════════════════════════
   4. TEACHER-SPECIFIC: CLASS OWNERSHIP  (Part 3.2)
   ═══════════════════════════════════════════════════════════════════ */

/**
 * True if the current teacher is the designated class teacher
 * for a given classId. Class teachers get expanded access.
 * @param {number} classId
 */
function iAmClassTeacher(classId) {
    if (!iAmTeacher()) return false;
    const cls = getClass(classId);
    return cls?.class_teacher_id === myId();
}

/**
 * Return all class IDs the current teacher is assigned to teach
 * (via teacher_assignments) for the active term.
 * @returns {number[]}
 */
function myAssignedClassIds() {
    const termId = getActiveTermId();
    return (state.timetableSlots || [])
        .filter(s => s.teacher_id === myId() && s.term_id === termId)
        .map(s => s.class_id)
        .filter((id, idx, arr) => arr.indexOf(id) === idx); // unique
}

/**
 * Return all subject IDs the current teacher is assigned to teach.
 * @returns {number[]}
 */
function myAssignedSubjectIds() {
    const termId = getActiveTermId();
    // Check teacher_assignments table (loaded into state if available)
    const assignments = (state.teacherAssignments || state.timetableSlots || []);
    return assignments
        .filter(a => a.teacher_id === myId() && a.term_id === termId)
        .map(a => a.subject_id)
        .filter((id, idx, arr) => id && arr.indexOf(id) === idx);
}

/**
 * True if the current teacher can see a specific class's data.
 * @param {number} classId
 */
function canSeeClass(classId) {
    if (iAmAdmin() || iAmAccountant()) return true;
    if (!iAmTeacher()) return false;
    // Class teacher sees all
    if (iAmClassTeacher(classId)) return true;
    // Assigned teacher sees their class
    return myAssignedClassIds().includes(classId);
}

/* ═══════════════════════════════════════════════════════════════════
   5. UI VISIBILITY HELPERS
   Used directly in template strings inside module render functions.
   Returns '' (empty string) to show or 'display:none' to hide.
   ═══════════════════════════════════════════════════════════════════ */

/**
 * Return 'display:none' if condition is false, '' otherwise.
 * Usage: <button style="${showIf(iAmAdmin())}">Delete</button>
 */
function showIf(condition) {
    return condition ? '' : 'display:none';
}

/**
 * Return 'display:none' if condition is true (inverse of showIf).
 */
function hideIf(condition) {
    return condition ? 'display:none' : '';
}

/**
 * Return CSS class 'hidden' if condition is false.
 * Usage: <button class="btn ${visibleIf(iAmAdmin())}">Delete</button>
 */
function visibleIf(condition) {
    return condition ? '' : 'hidden';
}

/**
 * Return 'disabled' attribute string if condition is true.
 * Usage: <button ${disabledIf(!canSave)}>Save</button>
 */
function disabledIf(condition) {
    return condition ? 'disabled' : '';
}

/**
 * Return 'readonly' attribute if condition is true.
 */
function readonlyIf(condition) {
    return condition ? 'readonly' : '';
}

/* ═══════════════════════════════════════════════════════════════════
   6. DOM-BASED PERMISSION ENFORCEMENT
   Apply after rendering to hide elements the user cannot access.
   ═══════════════════════════════════════════════════════════════════ */

/**
 * Hide all elements with data-role="admin" from non-admin users.
 * Also hides data-role="accountant" from teachers, etc.
 * Called after any module renders into #app.
 *
 * Usage in HTML templates:
 *   <button data-role="admin">Delete</button>
 *   <div data-role="admin,accountant">Finance only</div>
 */
function enforceRoleVisibility() {
    const role = myRole();
    document.querySelectorAll('[data-role]').forEach(el => {
        const allowedRoles = el.dataset.role.split(',').map(r => r.trim());
        if (!allowedRoles.includes(role)) {
            el.style.display = 'none';
        }
    });
}

/**
 * Disable form fields for users without edit permission.
 * Add data-perm="edit-student" to inputs that require edit rights.
 */
function enforceFormPermissions() {
    if (iAmAdmin()) return; // admin sees everything

    document.querySelectorAll('[data-perm]').forEach(el => {
        const perm = el.dataset.perm;

        let allowed = false;
        switch (perm) {
            case 'edit-student': allowed = canEditStudent(); break;
            case 'record-payment': allowed = canRecordPayment(); break;
            case 'manage-fees': allowed = canManageFees(); break;
            case 'grant-waiver': allowed = canGrantWaivers(); break;
            case 'manage-staff': allowed = canManageStaff(); break;
            case 'manage-settings': allowed = canManageSettings(); break;
            default: allowed = iAmAdmin();
        }

        if (!allowed) {
            el.setAttribute('disabled', 'true');
            el.setAttribute('readonly', 'true');
        }
    });
}

/* ═══════════════════════════════════════════════════════════════════
   7. HOLIDAY MODE VISIBILITY
   ═══════════════════════════════════════════════════════════════════ */

/**
 * Show or hide holiday-specific UI sections based on current mode.
 * Called after rendering by modules that have both normal and holiday views.
 */
function applyHolidayVisibility() {
    const holiday = isHolidayMode();

    // Show holiday-only sections
    document.querySelectorAll('[data-holiday="only"]').forEach(el => {
        el.style.display = holiday ? '' : 'none';
    });

    // Hide in-holiday sections
    document.querySelectorAll('[data-holiday="hide"]').forEach(el => {
        el.style.display = holiday ? 'none' : '';
    });
}

/* ═══════════════════════════════════════════════════════════════════
   EXPOSE
   ═══════════════════════════════════════════════════════════════════ */

window.myRole = myRole;
window.myId = myId;
window.iAmAdmin = iAmAdmin;
window.iAmTeacher = iAmTeacher;
window.iAmAccountant = iAmAccountant;
window.canNavigateTo = canNavigateTo;
window.isBlocked = isBlocked;
window.canCreateStudents = canCreateStudents;
window.canEditStudent = canEditStudent;
window.canArchiveStudent = canArchiveStudent;
window.canPromoteStudents = canPromoteStudents;
window.canEnterMarks = canEnterMarks;
window.canLockAssessments = canLockAssessments;
window.canDeleteAssessment = canDeleteAssessment;
window.canViewMarksDB = canViewMarksDB;
window.canViewReportCards = canViewReportCards;
window.canViewAnnualRegister = canViewAnnualRegister;
window.canRecordPayment = canRecordPayment;
window.canViewPayments = canViewPayments;
window.canManageFees = canManageFees;
window.canGrantWaivers = canGrantWaivers;
window.canReversePayment = canReversePayment;
window.canViewFinanceReports = canViewFinanceReports;
window.canManageStaff = canManageStaff;
window.canManageSubjects = canManageSubjects;
window.canResetPassword = canResetPassword;
window.canManageSettings = canManageSettings;
window.canManageGrading = canManageGrading;
window.canBackup = canBackup;
window.canViewLogs = canViewLogs;
window.canCreateAnnouncements = canCreateAnnouncements;
window.iAmClassTeacher = iAmClassTeacher;
window.myAssignedClassIds = myAssignedClassIds;
window.myAssignedSubjectIds = myAssignedSubjectIds;
window.canSeeClass = canSeeClass;
window.showIf = showIf;
window.hideIf = hideIf;
window.visibleIf = visibleIf;
window.disabledIf = disabledIf;
window.readonlyIf = readonlyIf;
window.enforceRoleVisibility = enforceRoleVisibility;
window.enforceFormPermissions = enforceFormPermissions;
window.applyHolidayVisibility = applyHolidayVisibility;