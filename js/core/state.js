/* ═══════════════════════════════════════════════════════════════════
   js/core/state.js
   ═══════════════════════════════════════════════════════════════════
   Purpose : Single global state object for the entire app.
             All modules read from state. Only updateState() writes.
             Also owns holiday mode detection — the most critical
             runtime flag that controls data routing across the app.
   Load order: AFTER all config files, BEFORE api.js.
   ═══════════════════════════════════════════════════════════════════ */

'use strict';

/* ═══════════════════════════════════════════════════════════════════
   THE STATE OBJECT
   Mirrors Part 10.4 of backend.txt exactly.
   Every key here corresponds to a DB table or a computed value.
   ═══════════════════════════════════════════════════════════════════ */

const state = {

    /* ── User & Session ──────────────────────────────────────────── */
    currentUser: null,   // { id, role, name, username, email }
    currentModule: null,   // active module ID string

    /* ── Academic Context ────────────────────────────────────────── */
    // These are set at login and updated when sidebar selectors change.
    // EVERY module must use these — never assume "current" year/term.
    currentAcadYear: null,   // academic_year row object (is_current=TRUE)
    currentTerm: null,   // term row object
    currentPhase: null,   // 'pre_midterm' | 'post_midterm' — computed from today vs midterm_date

    // Sidebar-selected context (can differ from system current)
    // When user picks a different year/term from the sidebar selectors,
    // selectedYear and selectedTerm are updated without changing currentAcadYear.
    // All modules should use: getActiveYear() / getActiveTerm() helpers below.
    selectedYearId: null,   // academic_year.id chosen in sidebar selector
    selectedTermId: null,   // term.id chosen in sidebar selector

    /* ── DB Table Data ───────────────────────────────────────────── */
    academicYears: [],     // all academic_year rows
    terms: [],     // all term rows
    holidays: [],     // holiday rows for active year
    classes: [],     // sorted by sort_order ASC
    subjects: [],     // sorted by sort_order ASC
    teachers: [],     // includes admin + accountants + teachers
    families: [],
    students: [],     // WHERE is_deleted = FALSE only
    assessments: [],
    marks: [],
    feeCategories: [],
    feeAmounts: [],
    studentFees: [],
    payments: [],
    paymentAllocations: [],
    schoolSettings: {},     // { key: value } map from school_settings
    gradingScale: [],     // loaded from DB; fallback to DEFAULT_GRADES
    announcements: [],
    notifications: [],
    timetableSlots: [],
    activityLogs: [],

    /* ── Holiday Session Data ────────────────────────────────────── */
    // Separate collections — never mix with normal academic data.
    // Populated only when isHolidayMode() returns true.
    holidayMarks: [],   // holiday_marks table rows
    holidayFees: [],   // holiday_fees table rows
    holidayEnrollments: [],   // holiday_enrollments — students in holiday program
    holidaySubjects: [],   // holiday_subjects — custom subjects for holiday

    /* ── UI State ────────────────────────────────────────────────── */
    loading: false,
    offline: false,
    sidebarOpen: true,

    /* ── Cache (avoids redundant recalculation) ──────────────────── */
    cache: {
        studentBalances: new Map(),  // studentId → { total, paid, balance, credit }
        classStats: new Map(),  // classId+termId → { avg, passRate, etc }
        ranks: new Map(),  // classId+termId+phase → studentId → rank
        lastUpdate: Date.now(),
    },

    /* ── Reactive Subscribers ────────────────────────────────────── */
    // key → Set of callback functions
    // modules can subscribe to state changes via subscribe(key, fn)
    subscribers: new Map(),
};

/* ═══════════════════════════════════════════════════════════════════
   STATE WRITERS
   All mutations go through updateState() so cache is always
   invalidated and subscribers are always notified.
   ═══════════════════════════════════════════════════════════════════ */

/**
 * Write a value to a top-level key in state.
 * Invalidates all derived caches and notifies any subscribers.
 *
 * @param {string} key   - top-level key in the state object
 * @param {*}      value - new value to assign
 */
function updateState(key, value) {
    state[key] = value;
    invalidateCache();
    notifySubscribers(key, value);
}

/**
 * Batch update multiple state keys at once.
 * More efficient than calling updateState() in a loop because
 * cache and subscribers are only touched once.
 *
 * @param {Object} updates - { key: value, ... }
 */
function updateStateBatch(updates) {
    Object.entries(updates).forEach(([key, value]) => {
        state[key] = value;
    });
    invalidateCache();
    // Notify per key so subscribers can react selectively
    Object.entries(updates).forEach(([key, value]) => {
        notifySubscribers(key, value);
    });
}

/* ═══════════════════════════════════════════════════════════════════
   CACHE MANAGEMENT
   ═══════════════════════════════════════════════════════════════════ */

/**
 * Clear derived caches.
 * Call after any mutation to students, marks, fees, or payments.
 * @param {string} [key] - if given, only clears that specific cache map
 */
function invalidateCache(key) {
    if (key && state.cache[key] instanceof Map) {
        state.cache[key].clear();
    } else {
        state.cache.studentBalances.clear();
        state.cache.classStats.clear();
        state.cache.ranks.clear();
    }
    state.cache.lastUpdate = Date.now();
}

/* ═══════════════════════════════════════════════════════════════════
   REACTIVE SUBSCRIPTIONS
   Lightweight pub/sub so modules can react to state changes without
   polling. Example:
     subscribe('students', () => refreshStudentList());
   ═══════════════════════════════════════════════════════════════════ */

/**
 * Subscribe a callback to changes on a state key.
 * Returns an unsubscribe function.
 */
function subscribe(key, callback) {
    if (!state.subscribers.has(key)) {
        state.subscribers.set(key, new Set());
    }
    state.subscribers.get(key).add(callback);
    // Return unsubscribe function
    return () => {
        const subs = state.subscribers.get(key);
        if (subs) subs.delete(callback);
    };
}

/**
 * Fire all callbacks subscribed to a given state key.
 * Called internally by updateState() — never call directly.
 */
function notifySubscribers(key, value) {
    const subs = state.subscribers.get(key);
    if (!subs || subs.size === 0) return;
    subs.forEach(cb => {
        try { cb(value, key); } catch (e) {
            console.warn(`[State] Subscriber error for key "${key}":`, e);
        }
    });
}

/* ═══════════════════════════════════════════════════════════════════
   ACTIVE YEAR / TERM HELPERS
   Modules MUST use these instead of reading state.currentAcadYear
   directly, because the user may have selected a different year/term
   from the sidebar selector.
   ═══════════════════════════════════════════════════════════════════ */

/**
 * Return the academic year the user is currently working in.
 * Priority: sidebar selection → system current year → latest year.
 */
function getActiveYear() {
    if (state.selectedYearId) {
        const found = state.academicYears.find(y => y.id === state.selectedYearId);
        if (found) return found;
    }
    return state.currentAcadYear
        || state.academicYears.find(y => y.is_current)
        || state.academicYears[state.academicYears.length - 1]
        || null;
}

/**
 * Return the term the user is currently working in.
 * Priority: sidebar selection → current term from settings → term 1.
 */
function getActiveTerm() {
    if (state.selectedTermId) {
        const found = state.terms.find(t => t.id === state.selectedTermId);
        if (found) return found;
    }
    return state.currentTerm
        || state.terms.find(t => t.status === 'in_progress')
        || state.terms.find(t => t.term_number === 1)
        || null;
}

/**
 * Return the active academic year ID (shorthand).
 */
function getActiveYearId() {
    return getActiveYear()?.id || null;
}

/**
 * Return the active term ID (shorthand).
 */
function getActiveTermId() {
    return getActiveTerm()?.id || null;
}

/* ═══════════════════════════════════════════════════════════════════
   PHASE DETECTION
   The phase controls what subject columns are visible, what
   assessment types are allowed, and what report card titles are used.
   (Part 3.3, backend.txt)
   ═══════════════════════════════════════════════════════════════════ */

/**
 * Compute the current phase based on today's date vs the active
 * term's midterm_date.
 *
 * - 'pre_midterm'  : today is BEFORE midterm_date
 * - 'post_midterm' : today is ON OR AFTER midterm_date
 * - null           : no active term found
 *
 * Updates state.currentPhase as a side effect.
 */
function computePhase() {
    const term = getActiveTerm();
    if (!term || !term.midterm_date) {
        state.currentPhase = null;
        return null;
    }
    const today = new Date();
    const midterm = new Date(term.midterm_date);
    const phase = today < midterm ? 'pre_midterm' : 'post_midterm';
    state.currentPhase = phase;
    return phase;
}

/**
 * Return the current phase string. Uses cached state.currentPhase
 * if set; otherwise recomputes.
 */
function getCurrentPhase() {
    return state.currentPhase || computePhase();
}

/* ═══════════════════════════════════════════════════════════════════
   HOLIDAY MODE DETECTION
   ═══════════════════════════════════════════════════════════════════
   Holiday mode is active when BOTH of these are true:
     1. The active academic year has all 3 terms with status='completed'
     2. Today's date falls within a holiday block in the holidays table
        OR the admin has manually activated holiday mode via localStorage.

   When holiday mode is active:
     - A moving banner is shown at the top of every page.
     - Marks entry writes to holiday_marks table (not marks).
     - Fee recording writes to holiday_fees table (not student_fees).
     - Holiday subjects (separate list) are used.
     - Only students enrolled in holiday_enrollments are shown.
     - Holiday fees are flagged for application at NEXT term start.

   CRITICAL: Holiday data must NEVER be mixed with normal term data.
   ═══════════════════════════════════════════════════════════════════ */

/**
 * Returns true if the app is currently in holiday mode.
 * This is the main gate checked by every data-writing module
 * before deciding which table to write to.
 */
function isHolidayMode() {
    // 1. Admin can manually force holiday mode via localStorage
    const forced = localStorage.getItem(HOLIDAY_CONFIG.sessionKey);
    if (forced === 'true') return true;

    // 2. Check if all 3 terms in the active year are completed
    const activeYear = getActiveYear();
    if (!activeYear) return false;

    const yearTerms = state.terms.filter(t => t.academic_year_id === activeYear.id);
    if (yearTerms.length < 3) return false;

    const allCompleted = yearTerms.every(t => t.status === 'completed');
    if (!allCompleted) return false;

    // 3. Check if today falls within a registered holiday block
    const today = todayString();
    const inHolidayBlock = state.holidays.some(h => {
        if (!h.start_date || !h.end_date) return false;
        return today >= h.start_date && today <= h.end_date;
    });

    // If all terms are done AND we're in a holiday block → holiday mode
    if (inHolidayBlock) return true;

    // 4. If all terms are completed but we are NOT in a registered holiday
    //    block (e.g. between terms), return false — normal mode.
    return false;
}

/**
 * Allow the admin to manually activate holiday mode regardless of dates.
 * Used by Settings → Academic Calendar when admin clicks
 * "Start Holiday Session".
 */
function activateHolidayMode() {
    localStorage.setItem(HOLIDAY_CONFIG.sessionKey, 'true');
    state.currentPhase = null; // reset phase — not applicable in holiday mode
    console.info('[Holiday] Holiday mode manually activated.');
}

/**
 * Deactivate manually-forced holiday mode.
 * Called when admin starts a new term.
 */
function deactivateHolidayMode() {
    localStorage.removeItem(HOLIDAY_CONFIG.sessionKey);
    console.info('[Holiday] Holiday mode deactivated.');
}

/* ═══════════════════════════════════════════════════════════════════
   TERM PROGRESS
   (Part 4.10)
   ═══════════════════════════════════════════════════════════════════ */

/**
 * Return an object describing how far through the active term we are.
 * Returns null if no active term or dates are missing.
 *
 * @returns {{ percent: number, daysRemaining: number, daysIn: number, total: number } | null}
 */
function getTermProgress() {
    const term = getActiveTerm();
    if (!term || !term.start_date || !term.end_date) return null;

    const start = new Date(term.start_date).getTime();
    const end = new Date(term.end_date).getTime();
    const today = Date.now();
    const total = end - start;

    if (total <= 0) return null;

    const elapsed = Math.max(0, Math.min(today - start, total));
    const percent = Math.round((elapsed / total) * 100);
    const MS_PER_DAY = 86400000;
    const daysRemaining = Math.max(0, Math.ceil((end - today) / MS_PER_DAY));
    const daysIn = Math.max(0, Math.floor((today - start) / MS_PER_DAY));

    return {
        percent,
        daysRemaining,
        daysIn,
        total: Math.ceil(total / MS_PER_DAY),
    };
}

/* ═══════════════════════════════════════════════════════════════════
   STATE VALIDATION
   ═══════════════════════════════════════════════════════════════════ */

/**
 * Returns true if the core data tables have been loaded into state.
 * Used by loadInitialData() to skip re-loading if state is fresh.
 */
function isStateLoaded() {
    return (
        state.classes.length > 0 &&
        state.subjects.length > 0 &&
        state.terms.length > 0 &&
        Object.keys(state.schoolSettings).length > 0
    );
}

/**
 * Reset state to initial empty values.
 * Called on logout to wipe all user-specific data from memory.
 */
function resetState() {
    // Preserve only app-level (non-user) fields
    state.currentUser = null;
    state.currentModule = null;
    state.currentAcadYear = null;
    state.currentTerm = null;
    state.currentPhase = null;
    state.selectedYearId = null;
    state.selectedTermId = null;

    state.academicYears = [];
    state.terms = [];
    state.holidays = [];
    state.classes = [];
    state.subjects = [];
    state.teachers = [];
    state.families = [];
    state.students = [];
    state.assessments = [];
    state.marks = [];
    state.feeCategories = [];
    state.feeAmounts = [];
    state.studentFees = [];
    state.payments = [];
    state.paymentAllocations = [];
    state.schoolSettings = {};
    state.gradingScale = [];
    state.announcements = [];
    state.notifications = [];
    state.timetableSlots = [];
    state.activityLogs = [];

    // Holiday data
    state.holidayMarks = [];
    state.holidayFees = [];
    state.holidayEnrollments = [];
    state.holidaySubjects = [];

    // UI
    state.loading = false;
    state.offline = false;
    state.sidebarOpen = true;

    // Cache
    invalidateCache();

    // Keep subscribers — they are wired at module load time
    console.info('[State] State reset on logout.');
}

/* ═══════════════════════════════════════════════════════════════════
   CONVENIENCE LOOKUPS
   Frequently used lookups that would otherwise be repeated everywhere.
   ═══════════════════════════════════════════════════════════════════ */

/** Get a class object by id. */
function getClass(classId) {
    return state.classes.find(c => c.id === classId) || null;
}

/** Get a subject object by id. */
function getSubject(subjectId) {
    return state.subjects.find(s => s.id === subjectId) || null;
}

/** Get a teacher object by id. */
function getTeacher(teacherId) {
    return state.teachers.find(t => t.id === teacherId) || null;
}

/** Get a student object by id. */
function getStudent(studentId) {
    return state.students.find(s => s.id === studentId) || null;
}

/** Get a student object by code (e.g. 'STU-2026-0045'). */
function getStudentByCode(code) {
    return state.students.find(s => s.code === code) || null;
}

/** Get a term object by id. */
function getTerm(termId) {
    return state.terms.find(t => t.id === termId) || null;
}

/** Get an academic year object by id. */
function getAcadYear(yearId) {
    return state.academicYears.find(y => y.id === yearId) || null;
}

/** Get a fee category object by id. */
function getFeeCategory(catId) {
    return state.feeCategories.find(c => c.id === catId) || null;
}

/** Return all active students in a given class. */
function getStudentsInClass(classId) {
    return state.students.filter(s => s.class_id === classId && !s.is_deleted);
}

/** Return all subjects for a given level ('nursery' | 'primary'). */
function getSubjectsByLevel(level) {
    return state.subjects
        .filter(s => s.level === level && s.is_active !== false)
        .sort((a, b) => (a.sort_order || 99) - (b.sort_order || 99));
}

/** Return assessments for a class + subject + term combination. */
function getAssessmentsFor(classId, subjectId, termId) {
    return state.assessments.filter(a =>
        a.class_id === classId &&
        a.subject_id === subjectId &&
        a.term_id === termId
    );
}

/** Return the mark record for a student on a specific assessment. */
function getMarkFor(assessmentId, studentId) {
    return state.marks.find(m =>
        m.assessment_id === assessmentId &&
        m.student_id === studentId
    ) || null;
}

/** Return all student_fee rows for a given student in the active year. */
function getStudentFees(studentId, yearId) {
    const yr = yearId || getActiveYearId();
    return state.studentFees.filter(f =>
        f.student_id === studentId &&
        f.academic_year_id === yr
    );
}

/** Return the credit balance for a student. */
function getStudentCredit(studentId) {
    // student_credit_balance is loaded as part of studentFees or separately
    // Check cache first
    const cached = state.cache.studentBalances.get(studentId);
    if (cached) return cached.credit || 0;
    return 0;
}

/** Return unread notification count for current user. */
function getUnreadNotificationCount() {
    const userId = state.currentUser?.id;
    if (!userId) return 0;
    return state.notifications.filter(n =>
        n.recipient_id === userId && !n.is_read
    ).length;
}

/* ═══════════════════════════════════════════════════════════════════
   DATE HELPERS used within state
   ═══════════════════════════════════════════════════════════════════ */

/** Return today's date as 'YYYY-MM-DD' in local time. */
function todayString() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

/* ═══════════════════════════════════════════════════════════════════
   EXPOSE ON WINDOW
   ═══════════════════════════════════════════════════════════════════ */

window.state = state;
window.updateState = updateState;
window.updateStateBatch = updateStateBatch;
window.invalidateCache = invalidateCache;
window.subscribe = subscribe;

window.getActiveYear = getActiveYear;
window.getActiveTerm = getActiveTerm;
window.getActiveYearId = getActiveYearId;
window.getActiveTermId = getActiveTermId;
window.computePhase = computePhase;
window.getCurrentPhase = getCurrentPhase;
window.getTermProgress = getTermProgress;
window.isStateLoaded = isStateLoaded;
window.resetState = resetState;

window.isHolidayMode = isHolidayMode;
window.activateHolidayMode = activateHolidayMode;
window.deactivateHolidayMode = deactivateHolidayMode;

window.getClass = getClass;
window.getSubject = getSubject;
window.getTeacher = getTeacher;
window.getStudent = getStudent;
window.getStudentByCode = getStudentByCode;
window.getTerm = getTerm;
window.getAcadYear = getAcadYear;
window.getFeeCategory = getFeeCategory;
window.getStudentsInClass = getStudentsInClass;
window.getSubjectsByLevel = getSubjectsByLevel;
window.getAssessmentsFor = getAssessmentsFor;
window.getMarkFor = getMarkFor;
window.getStudentFees = getStudentFees;
window.getStudentCredit = getStudentCredit;
window.getUnreadNotificationCount = getUnreadNotificationCount;
window.todayString = todayString;