/* ═══════════════════════════════════════════════════════════════════
   js/core/cache.js
   ═══════════════════════════════════════════════════════════════════
   Purpose : Manage computed-value caches that prevent redundant
             recalculation across modules.
             Three main caches:
               studentBalances — per-student fee summary
               classStats      — per-class academic statistics
               ranks           — per-class+term+phase ranking arrays
             Each entry has a TTL. Stale entries are skipped and
             recomputed on next access.
             All mutations to marks/fees/payments call invalidateCache()
             in state.js which calls clearAll() here.
   Load order: AFTER state.js, finance-formulas.js, formulas.js.
   ═══════════════════════════════════════════════════════════════════ */

'use strict';

/* ─────────────────────────────────────────────────────────────────
   TTL CONFIG
   ───────────────────────────────────────────────────────────────── */

const CACHE_TTL = {
    studentBalances: 5 * 60 * 1000,   // 5 minutes
    classStats: 10 * 60 * 1000,   // 10 minutes
    ranks: 10 * 60 * 1000,   // 10 minutes
    schoolSettings: APP_CONFIG.settingsCacheTTL,
};

/* ─────────────────────────────────────────────────────────────────
   INTERNAL TYPED CACHE MAPS
   Each entry: { value, storedAt }
   ───────────────────────────────────────────────────────────────── */

const _balanceCache = new Map();   // key: studentId
const _statsCache = new Map();   // key: `${classId}_${termId}_${phase}`
const _ranksCache = new Map();   // key: `${classId}_${termId}_${phase}`

/* ─────────────────────────────────────────────────────────────────
   GENERIC CACHE HELPERS
   ───────────────────────────────────────────────────────────────── */

/**
 * Read from a cache map.
 * Returns the stored value if still valid, or null if stale/missing.
 */
function cacheGet(map, key, ttl) {
    const entry = map.get(key);
    if (!entry) return null;
    if (Date.now() - entry.storedAt > ttl) {
        map.delete(key);
        return null;
    }
    return entry.value;
}

/**
 * Write a value to a cache map with the current timestamp.
 */
function cacheSet(map, key, value) {
    map.set(key, { value, storedAt: Date.now() });
    return value;
}

/* ─────────────────────────────────────────────────────────────────
   1. STUDENT BALANCE CACHE
   ───────────────────────────────────────────────────────────────── */

/**
 * Get cached fee summary for a student, or compute + cache it now.
 *
 * @param {number} studentId
 * @param {boolean} [forceRefresh] - bypass cache and recompute
 * @returns {{
 *   total, waived, effective, paid, balance, credit, outstanding,
 *   isFullyPaid, hasCredit
 * }}
 */
function getCachedBalance(studentId, forceRefresh = false) {
    if (!forceRefresh) {
        const cached = cacheGet(_balanceCache, studentId, CACHE_TTL.studentBalances);
        if (cached) return cached;
    }

    // Compute from state
    const fees = (state.studentFees || []).filter(f =>
        f.student_id === studentId &&
        f.academic_year_id === getActiveYearId()
    );

    // Credit balance — find in state or default 0
    const creditRow = (state.creditBalances || []).find(c => c.student_id === studentId);
    const credit = creditRow ? Number(creditRow.credit_amount || 0) : 0;

    const summary = computeStudentFeeSummary(fees, credit);
    summary.credit = credit; // ensure credit is on the object

    cacheSet(_balanceCache, studentId, summary);

    // Also update the state.cache.studentBalances map for compatibility
    state.cache.studentBalances.set(studentId, summary);

    return summary;
}

/**
 * Get balances for multiple students at once.
 * Returns a Map of studentId → summary.
 *
 * @param {number[]} studentIds
 */
function getCachedBalances(studentIds) {
    const result = new Map();
    studentIds.forEach(id => {
        result.set(id, getCachedBalance(id));
    });
    return result;
}

/**
 * Invalidate the balance cache for a specific student.
 * Call after any payment, waiver, or fee assignment for that student.
 */
function invalidateBalanceCache(studentId) {
    _balanceCache.delete(studentId);
    state.cache.studentBalances.delete(studentId);
}

/* ─────────────────────────────────────────────────────────────────
   2. CLASS STATISTICS CACHE
   ───────────────────────────────────────────────────────────────── */

/**
 * Get cached class statistics, or compute + cache them.
 *
 * @param {number} classId
 * @param {number} termId
 * @param {string} phase  - 'pre_midterm' | 'post_midterm'
 * @param {boolean} [forceRefresh]
 * @returns {{ count, mean, passRate, highest, lowest, stdDev } | null}
 */
function getCachedClassStats(classId, termId, phase, forceRefresh = false) {
    const key = `${classId}_${termId}_${phase}`;

    if (!forceRefresh) {
        const cached = cacheGet(_statsCache, key, CACHE_TTL.classStats);
        if (cached) return cached;
    }

    // Compute from state
    const students = getStudentsInClass(classId);
    if (students.length === 0) return null;

    const subjects = getSubjectsByLevel(
        students[0]?.level ||
        (CLASS_LIST.find(c => c.name === getClass(classId)?.name)?.level || 'primary')
    );

    const assessments = (state.assessments || []).filter(a =>
        a.class_id === classId && a.term_id === termId
    );
    const marks = (state.marks || []).filter(m =>
        assessments.some(a => a.id === m.assessment_id)
    );

    const rows = buildRegisterRows(students, subjects, assessments, marks, phase);
    const totals = rows.map(r => r.gTot).filter(t => t !== null);

    const maxTot = subjects.reduce((sum, s) =>
        sum + Number(s.mg_max || 0) + (phase === 'post_midterm' ? Number(s.ex_max || 0) : 0), 0
    );

    const stats = computeClassStats(totals, maxTot);

    cacheSet(_statsCache, key, stats);
    state.cache.classStats.set(key, stats);

    return stats;
}

/**
 * Invalidate stats cache for a class+term.
 * Call after marks are saved for that class.
 */
function invalidateStatsCache(classId, termId) {
    ['pre_midterm', 'post_midterm'].forEach(phase => {
        const key = `${classId}_${termId}_${phase}`;
        _statsCache.delete(key);
        state.cache.classStats.delete(key);
    });
}

/* ─────────────────────────────────────────────────────────────────
   3. RANK CACHE
   ───────────────────────────────────────────────────────────────── */

/**
 * Get cached ranking list for a class+term+phase, or compute it.
 *
 * @param {number} classId
 * @param {number} termId
 * @param {string} phase
 * @param {boolean} [forceRefresh]
 * @returns {Array} ranked rows from buildRegisterRows()
 */
function getCachedRanks(classId, termId, phase, forceRefresh = false) {
    const key = `${classId}_${termId}_${phase}`;

    if (!forceRefresh) {
        const cached = cacheGet(_ranksCache, key, CACHE_TTL.ranks);
        if (cached) return cached;
    }

    // Build ranked rows
    const students = getStudentsInClass(classId);
    if (students.length === 0) return [];

    // Determine level from class
    const cls = getClass(classId);
    const level = cls?.level ||
        (CLASS_LIST.find(c => c.name === cls?.name)?.level || 'primary');

    const subjects = getSubjectsByLevel(level);

    const assessments = (state.assessments || []).filter(a =>
        a.class_id === classId && a.term_id === termId
    );
    const marks = (state.marks || []).filter(m =>
        assessments.some(a => a.id === m.assessment_id)
    );

    const rows = buildRegisterRows(students, subjects, assessments, marks, phase);

    cacheSet(_ranksCache, key, rows);
    state.cache.ranks.set(key, rows);

    return rows;
}

/**
 * Get the cached rank for a specific student in a class+term+phase.
 * @param {number} studentId
 * @param {number} classId
 * @param {number} termId
 * @param {string} phase
 * @returns {number|null}
 */
function getCachedStudentRank(studentId, classId, termId, phase) {
    const rows = getCachedRanks(classId, termId, phase);
    const row = rows.find(r => r.student.id === studentId || r.id === studentId);
    return row ? row.rank : null;
}

/**
 * Invalidate rank cache for a class+term.
 */
function invalidateRankCache(classId, termId) {
    ['pre_midterm', 'post_midterm'].forEach(phase => {
        const key = `${classId}_${termId}_${phase}`;
        _ranksCache.delete(key);
        state.cache.ranks.delete(key);
    });
}

/* ─────────────────────────────────────────────────────────────────
   4. CLEAR ALL CACHES
   ───────────────────────────────────────────────────────────────── */

/**
 * Clear every cache. Called by updateState() in state.js after
 * any data mutation.
 */
function clearAllCaches() {
    _balanceCache.clear();
    _statsCache.clear();
    _ranksCache.clear();
    state.cache.studentBalances.clear();
    state.cache.classStats.clear();
    state.cache.ranks.clear();
    state.cache.lastUpdate = Date.now();
}

/**
 * Clear only finance-related caches.
 * Called after payments, fees, waivers.
 */
function clearFinanceCaches() {
    _balanceCache.clear();
    state.cache.studentBalances.clear();
    state.cache.lastUpdate = Date.now();
}

/**
 * Clear only academic caches.
 * Called after marks are saved.
 */
function clearAcademicCaches() {
    _statsCache.clear();
    _ranksCache.clear();
    state.cache.classStats.clear();
    state.cache.ranks.clear();
    state.cache.lastUpdate = Date.now();
}

/* ─────────────────────────────────────────────────────────────────
   5. CACHE SIZE REPORTING  (for system-health.js)
   ───────────────────────────────────────────────────────────────── */

/**
 * Return current cache sizes and TTL settings for the health dashboard.
 */
function getCacheReport() {
    return {
        studentBalances: {
            entries: _balanceCache.size,
            ttlMin: CACHE_TTL.studentBalances / 60000,
        },
        classStats: {
            entries: _statsCache.size,
            ttlMin: CACHE_TTL.classStats / 60000,
        },
        ranks: {
            entries: _ranksCache.size,
            ttlMin: CACHE_TTL.ranks / 60000,
        },
        lastUpdate: new Date(state.cache.lastUpdate).toISOString(),
    };
}

/* ─────────────────────────────────────────────────────────────────
   EXPOSE
   ───────────────────────────────────────────────────────────────── */

window.getCachedBalance = getCachedBalance;
window.getCachedBalances = getCachedBalances;
window.invalidateBalanceCache = invalidateBalanceCache;
window.getCachedClassStats = getCachedClassStats;
window.invalidateStatsCache = invalidateStatsCache;
window.getCachedRanks = getCachedRanks;
window.getCachedStudentRank = getCachedStudentRank;
window.invalidateRankCache = invalidateRankCache;
window.clearAllCaches = clearAllCaches;
window.clearFinanceCaches = clearFinanceCaches;
window.clearAcademicCaches = clearAcademicCaches;
window.getCacheReport = getCacheReport;
window.CACHE_TTL = CACHE_TTL;