'use strict';
/* ═══════════════════════════════════════════════════════════════
   state.js — Single global state object. Simple and flat.
   ═══════════════════════════════════════════════════════════════ */

const state = {
    currentUser     : null,
    schoolSettings  : {},
    academicYears   : [],
    terms           : [],
    classes         : [],
    subjects        : [],
    teachers        : [],
    students        : [],
    studentFees     : [],
    payments        : [],
    paymentAllocations: [],
    feeCategories   : [],
    feeAmounts      : [],
    assessments     : [],
    marks           : [],
    attendance      : [],
    announcements   : [],
    holidays        : [],
    guardians       : [],
    families        : [],
    teacherAssignments: [],
    timetableSlots  : [],
    conductScores   : [],
    discountRules   : [],
    gradingScale    : [],
    notifications   : [],
};

function updateStateBatch(updates) {
    for (const [key, val] of Object.entries(updates)) {
        if (val !== undefined) state[key] = val;
    }
}

function resetState() {
    for (const key of Object.keys(state)) {
        if (Array.isArray(state[key]))    state[key] = [];
        else if (typeof state[key] === 'object' && state[key] !== null)
            state[key] = {};
        else state[key] = null;
    }
}

// ── Helpers modules use ───────────────────────────────────────
function getActiveYear() {
    return state.academicYears.find(y => y.is_current) || state.academicYears[0] || null;
}

function getActiveTerm() {
    const year = getActiveYear();
    if (!year) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const yearTerms = state.terms.filter(t => t.academic_year_id === year.id);
    return yearTerms.find(t =>
        new Date(t.start_date) <= today && today <= new Date(t.end_date)
    ) || yearTerms[0] || null;
}

function getStudent(id) {
    return state.students.find(s => s.id === id) || null;
}

function getClass(id) {
    return state.classes.find(c => c.id === id) || null;
}

function getSubject(id) {
    return state.subjects.find(s => s.id === id) || null;
}

function getTeacher(id) {
    return state.teachers.find(t => t.id === id) || null;
}

function getMyClass() {
    const u = state.currentUser;
    if (!u || u.role !== 'teacher' || !u.class_id) return null;
    return getClass(u.class_id);
}

function canAccessClass(classId) {
    const u = state.currentUser;
    if (!u) return false;
    if (u.role === 'admin' || u.role === 'accountant') return true;
    return u.class_id === classId;
}

function getAccessibleClassIds() {
    const u = state.currentUser;
    if (!u) return [];
    if (u.role === 'admin' || u.role === 'accountant')
        return state.classes.map(c => c.id);
    return u.class_id ? [u.class_id] : [];
}

function getHistoricalRoster(classId, termId, yearId) {
    return state.students.filter(s =>
        s.class_id === classId &&
        s.status === 'Active' &&
        !s.is_deleted
    ).sort((a, b) => (a.last_name || '').localeCompare(b.last_name || ''));
}

// ── Grade helper ──────────────────────────────────────────────
function getGrade(pct) {
    if (pct === null || pct === undefined) return '—';
    const scale = state.gradingScale;
    if (scale && scale.length) {
        const g = scale.find(r => pct >= Number(r.min_percent) && pct <= Number(r.max_percent));
        if (g) return g.grade_letter;
    }
    // Default Rwanda grading
    if (pct >= 90) return 'A+';
    if (pct >= 80) return 'A';
    if (pct >= 75) return 'B';
    if (pct >= 70) return 'C';
    if (pct >= 60) return 'D';
    if (pct >= 50) return 'S';
    return 'F';
}

// ── Expose ────────────────────────────────────────────────────
window.state              = state;
window.updateStateBatch   = updateStateBatch;
window.resetState         = resetState;
window.getActiveYear      = getActiveYear;
window.getActiveTerm      = getActiveTerm;
window.getStudent         = getStudent;
window.getClass           = getClass;
window.getSubject         = getSubject;
window.getTeacher         = getTeacher;
window.getMyClass         = getMyClass;
window.canAccessClass     = canAccessClass;
window.getAccessibleClassIds = getAccessibleClassIds;
window.getHistoricalRoster   = getHistoricalRoster;
window.getGrade              = getGrade;
