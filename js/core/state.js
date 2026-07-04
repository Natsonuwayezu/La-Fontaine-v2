/**
 * ECOLE LA FONTAINE — Global State Management
 * Single source of truth for all application data
 * Last updated: 2026-07-03
 * 
 * CHANGES:
 * - Added marksArchive to state
 * - Added studentClassHistory to state
 * - Added studentPromotions to state
 * - Added studentPromotionRecords to state
 * - Added getYearData() helper
 * - Added getCurrentYearData() helper
 * - Added getHistoricalMarks() helper
 * - Added getStudentPromotionHistory() helper
 * - Added getStudentClassHistory() helper
 */

// ──────────────────────────────────────────────────────────────────────
// STATE OBJECT
// ──────────────────────────────────────────────────────────────────────

export const state = {
    // ── User & Session ──────────────────────────────────────────────
    currentUser: null,
    currentModule: null,

    // ── Academic ─────────────────────────────────────────────────────
    classes: [],
    subjects: [],
    terms: [],
    academicYears: [],
    currentTerm: null,
    currentAcadYear: null,
    currentPhase: null,  // 'pre_midterm' | 'post_midterm'

    // ── People ───────────────────────────────────────────────────────
    students: [],
    teachers: [],
    families: [],

    // ── Marks & Assessments ──────────────────────────────────────────
    assessments: [],
    marks: [],
    marksArchive: [],      // NEW: Archived marks for historical viewing

    // ── Finance ──────────────────────────────────────────────────────
    feeCategories: [],
    feeAmounts: [],
    studentFees: [],
    payments: [],

    // ── System & Config ──────────────────────────────────────────────
    schoolSettings: {},
    gradingScale: [],
    activityLogs: [],

    // ── Communication ────────────────────────────────────────────────
    announcements: [],
    notifications: [],
    reminders: [],

    // ── Timetable ────────────────────────────────────────────────────
    timetableSlots: [],

    // ── Holidays ─────────────────────────────────────────────────────
    holidays: [],

    // ── Promotions ───────────────────────────────────────────────────
    studentPromotions: [],           // NEW: Batch promotion records
    studentPromotionRecords: [],     // NEW: Per-student promotion records
    studentClassHistory: [],         // NEW: Class history per student

    // ── UI State ─────────────────────────────────────────────────────
    loading: false,
    offline: false,

    // ── Filters ──────────────────────────────────────────────────────
    filters: {
        academic_year_id: null,      // NEW: Current filtered year
        term_id: null,               // NEW: Current filtered term
        include_archived: false,     // NEW: Show archived marks
    },

    // ── Cache ────────────────────────────────────────────────────────
    cache: {
        studentBalances: new Map(),
        classStats: new Map(),
        ranks: new Map(),
        yearData: new Map(),         // NEW: Cache for year-specific data
        lastUpdate: Date.now(),
    },

    // ── Subscribers ──────────────────────────────────────────────────
    subscribers: new Map(),
};

// ──────────────────────────────────────────────────────────────────────
// STATE HELPERS
// ──────────────────────────────────────────────────────────────────────

/**
 * Update a top-level state key and invalidate caches
 * @param {string} key - State key to update
 * @param {any} value - New value
 */
export function updateState(key, value) {
    state[key] = value;
    invalidateCache();
}

/**
 * Invalidate all cached data
 * @param {string} [key] - Optional specific cache key to clear
 */
export function invalidateCache(key) {
    if (key) {
        if (state.cache[key] && typeof state.cache[key].clear === 'function') {
            state.cache[key].clear();
        }
    } else {
        state.cache.studentBalances.clear();
        state.cache.classStats.clear();
        state.cache.ranks.clear();
        state.cache.yearData.clear();
    }
    state.cache.lastUpdate = Date.now();
}

/**
 * Subscribe to state changes
 * @param {string} key - State key to watch
 * @param {Function} callback - Function to call on change
 * @returns {Function} Unsubscribe function
 */
export function subscribe(key, callback) {
    if (!state.subscribers.has(key)) {
        state.subscribers.set(key, new Set());
    }
    state.subscribers.get(key).add(callback);

    return () => {
        state.subscribers.get(key)?.delete(callback);
    };
}

/**
 * Notify subscribers of a state change
 * @param {string} key - State key that changed
 * @param {any} value - New value
 */
export function notifySubscribers(key, value) {
    const callbacks = state.subscribers.get(key);
    if (callbacks) {
        callbacks.forEach(cb => {
            try { cb(value); } catch (e) { console.warn('[State] Subscriber error:', e); }
        });
    }
}

// ──────────────────────────────────────────────────────────────────────
// YEAR-SPECIFIC DATA ACCESSORS
// ──────────────────────────────────────────────────────────────────────

/**
 * Get data filtered by academic year
 * @param {string} dataKey - State key (students, marks, assessments, etc.)
 * @param {number} yearId - Academic year ID
 * @param {object} extraFilters - Additional filters
 * @returns {Array} Filtered data
 */
export function getYearData(dataKey, yearId, extraFilters = {}) {
    const data = state[dataKey] || [];
    const yearIdNum = parseInt(yearId);

    return data.filter(item => {
        // Check academic_year_id match
        if (item.academic_year_id !== undefined) {
            if (parseInt(item.academic_year_id) !== yearIdNum) return false;
        }
        // Check extra filters
        for (const [key, value] of Object.entries(extraFilters)) {
            if (item[key] !== value) return false;
        }
        return true;
    });
}

/**
 * Get current year data (uses active academic year)
 * @param {string} dataKey - State key
 * @param {object} extraFilters - Additional filters
 * @returns {Array} Filtered data
 */
export function getCurrentYearData(dataKey, extraFilters = {}) {
    const yearId = state.filters.academic_year_id || state.currentAcadYear?.id;
    if (!yearId) return state[dataKey] || [];
    return getYearData(dataKey, yearId, extraFilters);
}

/**
 * Get active students for current year
 * @returns {Array} Active students
 */
export function getCurrentYearStudents() {
    const yearId = state.filters.academic_year_id || state.currentAcadYear?.id;
    return (state.students || []).filter(s =>
        s.academic_year_id == yearId &&
        s.status === 'Active' &&
        !s.is_deleted
    );
}

/**
 * Get marks for current year (excluding archived)
 * @param {number} studentId - Optional student ID filter
 * @returns {Array} Marks
 */
export function getCurrentYearMarks(studentId = null) {
    const yearId = state.filters.academic_year_id || state.currentAcadYear?.id;
    let marks = (state.marks || []).filter(m =>
        m.academic_year_id == yearId &&
        !m.is_archived
    );
    if (studentId) {
        marks = marks.filter(m => m.student_id == studentId);
    }
    return marks;
}

/**
 * Get archived marks for a student/year
 * @param {number} studentId - Student ID
 * @param {number} yearId - Academic year ID
 * @returns {Array} Archived marks
 */
export function getArchivedMarks(studentId, yearId) {
    return (state.marksArchive || []).filter(m =>
        m.student_id == studentId &&
        m.academic_year_id == yearId
    );
}

/**
 * Get all marks (active + archived) for a student
 * @param {number} studentId - Student ID
 * @param {number} yearId - Academic year ID
 * @returns {Array} All marks
 */
export function getAllStudentMarks(studentId, yearId) {
    const active = getCurrentYearMarks(studentId);
    const archived = getArchivedMarks(studentId, yearId);
    return [...active, ...archived];
}

// ──────────────────────────────────────────────────────────────────────
// PROMOTION HELPERS
// ──────────────────────────────────────────────────────────────────────

/**
 * Get promotion records for a student
 * @param {number} studentId - Student ID
 * @returns {Array} Promotion records
 */
export function getStudentPromotionHistory(studentId) {
    return (state.studentPromotionRecords || [])
        .filter(r => r.student_id == studentId)
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
}

/**
 * Get promotion batch by ID
 * @param {number} batchId - Promotion batch ID
 * @returns {object|null} Promotion batch
 */
export function getPromotionBatch(batchId) {
    return (state.studentPromotions || []).find(p => p.id == batchId) || null;
}

/**
 * Get all promotions for a student across all years
 * @param {number} studentId - Student ID
 * @returns {Array} Promotions with batch details
 */
export function getStudentPromotionsWithDetails(studentId) {
    const records = getStudentPromotionHistory(studentId);
    return records.map(record => {
        const batch = getPromotionBatch(record.promotion_id);
        const fromClass = getClassById(record.from_class_id);
        const toClass = getClassById(record.to_class_id);
        const fromYear = state.academicYears.find(y => y.id === record.from_academic_year_id);
        const toYear = state.academicYears.find(y => y.id === record.to_academic_year_id);
        return {
            ...record,
            batch,
            fromClass,
            toClass,
            fromYear,
            toYear
        };
    });
}

/**
 * Get class history for a student
 * @param {number} studentId - Student ID
 * @returns {Array} Class history records
 */
export function getStudentClassHistory(studentId) {
    return (state.studentClassHistory || [])
        .filter(h => h.student_id == studentId)
        .sort((a, b) => (a.academic_year_id || 0) - (b.academic_year_id || 0));
}

/**
 * Get students who were in a specific class in a specific year
 * @param {number} classId - Class ID
 * @param {number} yearId - Academic year ID
 * @returns {Array} Students
 */
export function getStudentsByClassAndYear(classId, yearId) {
    const history = (state.studentClassHistory || [])
        .filter(h => h.class_id == classId && h.academic_year_id == yearId);
    const studentIds = history.map(h => h.student_id);
    return (state.students || []).filter(s => studentIds.includes(s.id));
}

// ──────────────────────────────────────────────────────────────────────
// LOOKUP HELPERS (read from state)
// ──────────────────────────────────────────────────────────────────────

export function getClassById(id) {
    return state.classes.find(c => c.id === parseInt(id)) || null;
}

export function getSubjectById(id) {
    return state.subjects.find(s => s.id === parseInt(id)) || null;
}

export function getTermById(id) {
    return state.terms.find(t => t.id === parseInt(id)) || null;
}

export function getStudentById(id) {
    return state.students.find(s => s.id === parseInt(id)) || null;
}

export function getTeacherById(id) {
    return state.teachers.find(t => t.id === parseInt(id)) || null;
}

export function getFamilyById(id) {
    return state.families.find(f => f.id === parseInt(id)) || null;
}

export function getCurrentUser() {
    return state.currentUser;
}

export function getCurrentAcademicYear() {
    return state.currentAcadYear;
}

export function getCurrentTerm() {
    return state.currentTerm;
}

/**
 * Get active academic year ID from state or settings
 * @returns {number|null} Academic year ID
 */
export function getActiveAcademicYearId() {
    return state.currentAcadYear?.id ||
        state.filters.academic_year_id ||
        state.schoolSettings?.active_academic_year_id ||
        null;
}

// ──────────────────────────────────────────────────────────────────────
// ROLE HELPERS
// ──────────────────────────────────────────────────────────────────────

export function isAdmin() {
    return state.currentUser?.role === 'admin';
}

export function isTeacher() {
    return state.currentUser?.role === 'teacher';
}

export function isAccountant() {
    return state.currentUser?.role === 'accountant';
}

export function hasRole(role) {
    return state.currentUser?.role === role;
}

export function canRecordAttendance() {
    return isAdmin() || isTeacher() || isAccountant();
}

export function canAccessStudentFees() {
    return isAdmin() || isAccountant();
}

// ──────────────────────────────────────────────────────────────────────
// STUDENT HELPERS
// ──────────────────────────────────────────────────────────────────────

export function studentFullName(student) {
    if (!student) return '';
    return `${student.first_name || ''} ${student.last_name || ''}`.trim();
}

export function studentSortName(student) {
    if (!student) return '';
    return `${student.last_name || ''} ${student.first_name || ''}`.trim();
}

export function sortStudentsAlphabetically(students) {
    return [...(students || [])].sort((a, b) =>
        studentSortName(a).localeCompare(studentSortName(b))
    );
}

/**
 * Get students by academic year
 * @param {number} yearId - Academic year ID
 * @param {string} status - Student status filter
 * @returns {Array} Students
 */
export function getStudentsByYear(yearId, status = 'Active') {
    return (state.students || []).filter(s =>
        s.academic_year_id == yearId &&
        s.status === status &&
        !s.is_deleted
    );
}

/**
 * Get all students who were in a class (including historical)
 * @param {number} classId - Class ID
 * @param {number} yearId - Academic year ID (optional)
 * @returns {Array} Students
 */
export function getStudentsForClass(classId, yearId = null) {
    const year = yearId || state.filters.academic_year_id || state.currentAcadYear?.id;
    if (year) {
        return getStudentsByClassAndYear(classId, year);
    }
    return (state.students || []).filter(s => s.class_id == classId && !s.is_deleted);
}

// ──────────────────────────────────────────────────────────────────────
// TERM HELPERS
// ──────────────────────────────────────────────────────────────────────

export function getTermStatus(term) {
    if (!term) return 'upcoming';
    if (term.id === state.currentTerm?.id) return 'current';
    const today = new Date().toISOString().slice(0, 10);
    if (term.end_date && term.end_date < today) return 'completed';
    if (term.start_date && term.start_date > today) return 'upcoming';
    return 'current';
}

export function getStartOfTerm() {
    return state.currentTerm?.start_date || new Date().toISOString().split('T')[0];
}

/**
 * Get terms for a specific academic year
 * @param {number} yearId - Academic year ID
 * @returns {Array} Terms
 */
export function getTermsByYear(yearId) {
    return (state.terms || []).filter(t => t.academic_year_id == yearId)
        .sort((a, b) => (a.term_number || 0) - (b.term_number || 0));
}

// ──────────────────────────────────────────────────────────────────────
// CACHE HELPERS
// ──────────────────────────────────────────────────────────────────────

/**
 * Get cached data or compute if not present
 * @param {string} cacheKey - Cache key
 * @param {Function} computeFn - Function to compute data
 * @param {number} ttl - Time to live in milliseconds (default: 5 min)
 * @returns {any} Cached or computed data
 */
export function getCachedOrCompute(cacheKey, computeFn, ttl = 5 * 60 * 1000) {
    const now = Date.now();
    const cached = state.cache.yearData.get(cacheKey);

    if (cached && (now - cached.timestamp) < ttl) {
        return cached.data;
    }

    const data = computeFn();
    state.cache.yearData.set(cacheKey, { data, timestamp: now });
    return data;
}

/**
 * Clear year-specific cache
 * @param {number} yearId - Academic year ID (optional)
 */
export function clearYearCache(yearId = null) {
    if (yearId) {
        // Remove only cache entries for this year
        for (const [key] of state.cache.yearData) {
            if (key.includes(`year_${yearId}`)) {
                state.cache.yearData.delete(key);
            }
        }
    } else {
        state.cache.yearData.clear();
    }
}

// ──────────────────────────────────────────────────────────────────────
// FILTER HELPERS
// ──────────────────────────────────────────────────────────────────────

/**
 * Set active academic year filter
 * @param {number} yearId - Academic year ID
 */
export function setYearFilter(yearId) {
    state.filters.academic_year_id = parseInt(yearId);
    clearYearCache(yearId);
    notifySubscribers('filters', state.filters);
}

/**
 * Set active term filter
 * @param {number} termId - Term ID
 */
export function setTermFilter(termId) {
    state.filters.term_id = parseInt(termId);
    notifySubscribers('filters', state.filters);
}

/**
 * Toggle archived marks visibility
 * @param {boolean} include - Whether to include archived marks
 */
export function setIncludeArchived(include) {
    state.filters.include_archived = include;
    notifySubscribers('filters', state.filters);
}

/**
 * Get current filter state
 * @returns {object} Current filters
 */
export function getFilters() {
    return { ...state.filters };
}

/**
 * Reset all filters
 */
export function resetFilters() {
    state.filters = {
        academic_year_id: state.currentAcadYear?.id || null,
        term_id: state.currentTerm?.id || null,
        include_archived: false,
    };
    notifySubscribers('filters', state.filters);
}

// ──────────────────────────────────────────────────────────────────────
// INITIALIZATION
// ──────────────────────────────────────────────────────────────────────

/**
 * Initialize state with default filters
 */
export function initState() {
    if (state.currentAcadYear) {
        state.filters.academic_year_id = state.currentAcadYear.id;
    }
    if (state.currentTerm) {
        state.filters.term_id = state.currentTerm.id;
    }
    state.filters.include_archived = false;
}