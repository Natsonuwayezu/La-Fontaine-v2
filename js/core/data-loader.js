/* ═══════════════════════════════════════════════════════════════════
   js/core/data-loader.js
   ═══════════════════════════════════════════════════════════════════
   Purpose : Load all application data into state after login.
             loadAllData() is the single entry point called by boot.js.
             Handles normal academic data AND holiday session data.
             Uses parallel fetching where safe, sequential where
             ordering matters (years → terms → holidays).
             Lazy-load strategies for large tables (marks, payments).
   References: backend.txt Part 6, Part 10.4
   Load order: AFTER api.js, state.js, formulas.js, cache.js.
   ═══════════════════════════════════════════════════════════════════ */

'use strict';

/* ─────────────────────────────────────────────────────────────────
   LOAD STRATEGIES
   ───────────────────────────────────────────────────────────────── */

/**
 * Tables that are small and always loaded eagerly (< 500 rows expected).
 * Loaded in parallel in a single Promise.all().
 */
const EAGER_TABLES = [
    'academic_years',
    'terms',
    'holidays',
    'classes',
    'subjects',
    'teachers',
    'families',
    'fee_categories',
    'fee_amounts',
    'grading_scale',
    'timetable_slots',
    'school_settings',
    'announcements',
];

/**
 * Tables that can be large and are lazy-loaded after the UI is ready.
 * Only loaded when a module that needs them is first opened.
 */
const LAZY_TABLES = [
    'students',         // loaded eagerly but refreshed lazily per module
    'assessments',      // loaded lazily when entering marks/register
    'marks',            // loaded lazily — very large
    'student_fees',     // loaded lazily — large
    'payments',         // loaded lazily
    'payment_allocations', // loaded lazily
    'notifications',    // loaded for the current user only
    'activityLogs',     // loaded only in system-logs module
];

/* ─────────────────────────────────────────────────────────────────
   MAIN DATA LOADER
   ───────────────────────────────────────────────────────────────── */

/**
 * Load all core data into state after a successful login.
 * Called once by boot.js and never again unless the user logs out
 * and back in.
 *
 * Loading order:
 *   Phase 1 (critical — app cannot render without these):
 *     school_settings, academic_years, classes, subjects, teachers
 *
 *   Phase 2 (important — needed by most modules):
 *     terms, grading_scale, families, fee_categories, fee_amounts,
 *     timetable_slots, announcements
 *
 *   Phase 3 (contextual — after UI is showing):
 *     students, holidays, notifications
 *
 *   Phase 4 (lazy — loaded on demand by individual modules):
 *     assessments, marks, student_fees, payments, etc.
 *
 *   Phase 5 (holiday mode — only if isHolidayMode() is true):
 *     holiday_marks, holiday_fees, holiday_enrollments, holiday_subjects
 *
 * @param {{ silent?: boolean }} [opts]
 * @returns {Promise<void>}
 */
async function loadAllData(opts = {}) {
    const silent = opts.silent === true;

    if (!silent) updateState('loading', true);

    try {
        // ── PHASE 1: Critical ─────────────────────────────────────
        await _loadPhase1();

        // Determine active year + term + phase immediately
        _resolveActiveYearTerm();
        computePhase();

        // ── PHASE 2: Important ────────────────────────────────────
        await _loadPhase2();

        // ── PHASE 3: Contextual ───────────────────────────────────
        await _loadPhase3();

        // ── PHASE 5: Holiday data (if in holiday mode) ────────────
        if (isHolidayMode()) {
            await _loadHolidayData();
        }

        // Populate caches
        await _prewarmCaches();

        console.info('[DataLoader] loadAllData complete.');

    } catch (err) {
        console.error('[DataLoader] loadAllData failed:', err.message);
        handleApiError(err, 'load application data');
        throw err; // Let boot.js decide what to do

    } finally {
        if (!silent) updateState('loading', false);
    }
}

/* ─────────────────────────────────────────────────────────────────
   PHASE 1 — Critical tables
   ───────────────────────────────────────────────────────────────── */

async function _loadPhase1() {
    const [settings, years, classes, subjects, teachers] = await Promise.all([
        getSchoolSettings().catch(() => ({})),
        getAll('academic_years', 'order=start_date.desc').catch(() => []),
        getAll('classes', 'order=sort_order.asc').catch(() => []),
        getAll('subjects', 'order=sort_order.asc').catch(() => []),
        getAll('teachers').catch(() => []),
    ]);

    updateStateBatch({
        schoolSettings: settings,
        academicYears: years,
        classes: classes,
        subjects: subjects,
        teachers: teachers,
    });
}

/* ─────────────────────────────────────────────────────────────────
   PHASE 2 — Important tables
   ───────────────────────────────────────────────────────────────── */

async function _loadPhase2() {
    const activeYearId = getActiveYearId();
    const termFilter = activeYearId
        ? `academic_year_id=eq.${activeYearId}&order=term_number.asc`
        : 'order=term_number.asc';

    const [terms, grading, families, feeCategories, feeAmounts, slots, announcements] =
        await Promise.all([
            getAll('terms', termFilter).catch(() => []),
            getAll('grading_scale', 'order=min.desc').catch(() => []),
            getAll('families').catch(() => []),
            getAll('fee_categories', 'order=sort_order.asc').catch(() => []),
            getAll('fee_amounts', activeYearId
                ? `academic_year_id=eq.${activeYearId}`
                : '').catch(() => []),
            getAll('timetable_slots').catch(() => []),
            getAll('announcements', 'order=created_at.desc&limit=50').catch(() => []),
        ]);

    updateStateBatch({
        terms: terms,
        gradingScale: grading.length > 0 ? grading : DEFAULT_GRADES,
        families: families,
        feeCategories: feeCategories,
        feeAmounts: feeAmounts,
        timetableSlots: slots,
        announcements: announcements,
    });

    // Re-resolve terms now that we have them
    _resolveActiveYearTerm();
    computePhase();
}

/* ─────────────────────────────────────────────────────────────────
   PHASE 3 — Contextual tables
   ───────────────────────────────────────────────────────────────── */

async function _loadPhase3() {
    const activeYearId = getActiveYearId();
    const userId = state.currentUser?.id;

    const [students, holidays, notifications] = await Promise.all([
        // Students: exclude soft-deleted
        getAll('students', 'is_deleted=eq.false&order=last_name.asc,first_name.asc')
            .catch(() => []),

        // Holidays for the active academic year only
        activeYearId
            ? getAll('holidays', `academic_year_id=eq.${activeYearId}&order=start_date.asc`)
                .catch(() => [])
            : Promise.resolve([]),

        // Notifications: current user only, most recent 100
        userId
            ? getAll('notifications',
                `recipient_id=eq.${userId}&order=created_at.desc&limit=100`)
                .catch(() => [])
            : Promise.resolve([]),
    ]);

    updateStateBatch({ students, holidays, notifications });

    // Cache students locally for offline use
    cacheStudentsLocally().catch(() => { });
}

/* ─────────────────────────────────────────────────────────────────
   HOLIDAY DATA LOADER  (Phase 5)
   ───────────────────────────────────────────────────────────────── */

/**
 * Load holiday-specific tables when holiday mode is active.
 * Writes to state.holidayMarks, holidayFees, holidayEnrollments,
 * holidaySubjects — never to the normal academic data keys.
 */
async function _loadHolidayData() {
    // 1. Always load all holiday_sessions so the topbar period switcher
    //    can show every available session regardless of mode
    const allSessions = await getAllRecords('holiday_sessions',
        'order=start_date.desc').catch(() => []);
    state.holidaySessions = allSessions;

    // 2. Resolve the active session
    let activeSession = state.activeHolidaySession;
    if (!activeSession) {
        const today = todayISO ? todayISO() : new Date().toISOString().split('T')[0];
        activeSession = allSessions.find(s =>
            s.status === 'active' &&
            s.start_date <= today &&
            (!s.end_date || s.end_date >= today)
        ) || null;
        state.activeHolidaySession = activeSession;
    }

    // 3. Restore saved active session from localStorage if not auto-detected
    if (!activeSession) {
        const savedId = parseInt(localStorage.getItem(HOLIDAY_CONFIG.activeSessionKey) || '0');
        if (savedId) {
            activeSession = allSessions.find(s => s.id === savedId) || null;
            state.activeHolidaySession = activeSession;
        }
    }

    if (!activeSession) {
        console.info('[DataLoader] No active holiday session — sessions loaded for switcher only.');
        return;
    }

    console.info('[DataLoader] Loading holiday session:', activeSession.name);
    await loadDataForHolidaySession(activeSession.id);
}

/**
 * Load all data for a specific holiday session.
 * Called when switching sessions from the period switcher.
 */
async function loadDataForHolidaySession(sessionId) {
    const filter = `holiday_session_id=eq.${sessionId}`;

    const [
        sessionClasses,
        sessionSubjects,
        sessionAssessments,
        sessionTeachers,
        holidayEnrollments,
        holidayMarks,
        holidayFees,
        holidaySubjects,
    ] = await Promise.all([
        getAll('session_classes',            `${filter}&order=display_order.asc`).catch(() => []),
        getAll('session_subjects',           `${filter}&order=display_order.asc`).catch(() => []),
        getAll('session_assessments',        filter).catch(() => []),
        getAll('session_teacher_assignments',filter).catch(() => []),
        getAll('holiday_enrollments',        filter).catch(() => []),
        getAllRecords('holiday_marks',        filter).catch(() => []),
        getAllRecords('holiday_fees',         filter).catch(() => []),
        getAll('holiday_subjects',           filter).catch(() => []),
    ]);

    updateStateBatch({
        sessionClasses,
        sessionSubjects,
        sessionAssessments,
        sessionTeachers,
        holidayEnrollments,
        holidayMarks,
        holidayFees,
        holidaySubjects,
    });

    // Load pending fee approvals for this session
    const pendingApprovals = await getAll('student_fees',
        `requires_approval=is.true&is_approved=is.false&source=eq.holiday_enrollment`
    ).catch(() => []);
    state.pendingFeeApprovals = pendingApprovals;

    // Refresh topbar period switcher
    if (window.TopbarPeriod) window.TopbarPeriod.refresh();

    console.info('[DataLoader] Holiday session data loaded:', {
        sessionId,
        classes: sessionClasses.length,
        subjects: sessionSubjects.length,
        enrollments: holidayEnrollments.length,
        marks: holidayMarks.length,
        fees: holidayFees.length,
        pendingApprovals: pendingApprovals.length,
    });
}

/* ─────────────────────────────────────────────────────────────────
   ACTIVE YEAR / TERM RESOLVER
   ───────────────────────────────────────────────────────────────── */

/**
 * After loading academic_years and terms, determine which year and
 * term should be "current" and write them to state.
 *
 * Priority:
 *   currentAcadYear : year with is_current=TRUE, else most recent
 *   currentTerm     : term with status='in_progress' in current year,
 *                     else term with highest term_number
 */
function _resolveActiveYearTerm() {
    const years = state.academicYears || [];
    const terms = state.terms || [];

    // Active year: DB flag first, then most recent by start_date
    const currentYear =
        years.find(y => y.is_current) ||
        years.reduce((latest, y) => {
            if (!latest) return y;
            return (y.start_date || '') > (latest.start_date || '') ? y : latest;
        }, null);

    state.currentAcadYear = currentYear || null;

    if (!currentYear) {
        state.currentTerm = null;
        return;
    }

    // Current term: in_progress first, then by term_number descending
    const yearTerms = terms.filter(t =>
        t.academic_year_id === currentYear.id
    );

    const currentTerm =
        yearTerms.find(t => t.status === 'in_progress') ||
        [...yearTerms].sort((a, b) => (b.term_number || 0) - (a.term_number || 0))[0] ||
        null;

    state.currentTerm = currentTerm;
}

/* ─────────────────────────────────────────────────────────────────
   CACHE PRE-WARMING
   ───────────────────────────────────────────────────────────────── */

/**
 * Pre-warm the most commonly used caches so first navigation is fast.
 * Only warms if data is already in state (no extra API calls).
 */
async function _prewarmCaches() {
    // Pre-compute balances for all students if student_fees are in state
    if (state.studentFees.length > 0 && state.students.length > 0) {
        const sample = state.students.slice(0, 20); // warm first 20 only
        sample.forEach(s => {
            try { getCachedBalance(s.id); } catch { /* silent */ }
        });
    }
}

/* ─────────────────────────────────────────────────────────────────
   LAZY LOAD FUNCTIONS
   Called by individual modules when they first need large datasets.
   ───────────────────────────────────────────────────────────────── */

/**
 * Load marks for a specific class + term combination.
 * Appends to state.marks without replacing marks for other classes.
 *
 * @param {number} classId
 * @param {number} termId
 */
async function loadMarksForClass(classId, termId) {
    if (!classId || !termId) return;

    // Check if we already have marks for this class+term
    const existing = state.marks.filter(m => {
        const a = state.assessments.find(a => a.id === m.assessment_id);
        return a && a.class_id === classId && a.term_id === termId;
    });

    // Load assessments first if we don't have them
    const assessmentsForClass = state.assessments.filter(a =>
        a.class_id === classId && a.term_id === termId
    );

    if (assessmentsForClass.length === 0) {
        await loadAssessmentsForClass(classId, termId);
    }

    // If we already have marks for these assessments, skip
    const assessmentIds = state.assessments
        .filter(a => a.class_id === classId && a.term_id === termId)
        .map(a => a.id);

    if (assessmentIds.length === 0) return;

    const existingAssIds = new Set(state.marks.map(m => m.assessment_id));
    const needLoad = assessmentIds.some(id => !existingAssIds.has(id));

    if (!needLoad && existing.length > 0) return; // already loaded

    try {
        // Build filter: assessment_id=in.(id1,id2,...)
        const idsStr = assessmentIds.join(',');
        const newMarks = await getAllRecords('marks',
            `assessment_id=in.(${idsStr})`
        );

        // Merge into state.marks (remove old marks for these assessments first)
        const filtered = state.marks.filter(m => !assessmentIds.includes(m.assessment_id));
        state.marks = [...filtered, ...newMarks];

        // Also load holiday marks if in holiday mode
        if (isHolidayMode()) {
            const holidayMarks = await getAllRecords('holiday_marks',
                `assessment_id=in.(${idsStr})`
            ).catch(() => []);
            const filteredHol = state.holidayMarks.filter(m => !assessmentIds.includes(m.assessment_id));
            state.holidayMarks = [...filteredHol, ...holidayMarks];
        }

        clearAcademicCaches();
        console.info(`[DataLoader] Loaded ${newMarks.length} marks for class ${classId}, term ${termId}.`);

    } catch (err) {
        console.warn('[DataLoader] loadMarksForClass failed:', err.message);
    }
}

/**
 * Load assessments for a class + term combination.
 * @param {number} classId
 * @param {number} termId
 */
async function loadAssessmentsForClass(classId, termId) {
    if (!classId || !termId) return;

    try {
        const newAssessments = await getAll('assessments',
            `class_id=eq.${classId}&term_id=eq.${termId}&order=created_at.asc`
        );

        // Merge
        const filtered = state.assessments.filter(a =>
            !(a.class_id === classId && a.term_id === termId)
        );
        state.assessments = [...filtered, ...newAssessments];

        console.info(`[DataLoader] Loaded ${newAssessments.length} assessments for class ${classId}.`);

    } catch (err) {
        console.warn('[DataLoader] loadAssessmentsForClass failed:', err.message);
    }
}

/**
 * Load student_fees for the active academic year if not yet loaded.
 * Called lazily by finance modules.
 */
async function loadStudentFees() {
    if (state.studentFees.length > 0) return; // already loaded

    const yearId = getActiveYearId();
    if (!yearId) return;

    try {
        const fees = await getAllRecords('student_fees',
            `academic_year_id=eq.${yearId}`
        );
        state.studentFees = fees;

        // Also load credit balances
        const credits = await getAll('student_credit_balance').catch(() => []);
        state.creditBalances = credits;

        clearFinanceCaches();
        console.info(`[DataLoader] Loaded ${fees.length} student fee rows.`);

    } catch (err) {
        console.warn('[DataLoader] loadStudentFees failed:', err.message);
    }
}

/**
 * Load payments for the active academic year.
 * Called lazily by finance modules.
 */
async function loadPayments() {
    if (state.payments.length > 0) return;

    const yearId = getActiveYearId();
    if (!yearId) return;

    try {
        const [payments, allocations] = await Promise.all([
            getAllRecords('payments',
                `academic_year_id=eq.${yearId}&order=payment_date.desc`
            ),
            getAllRecords('payment_allocations').catch(() => []),
        ]);

        updateStateBatch({
            payments: payments,
            paymentAllocations: allocations,
        });

        console.info(`[DataLoader] Loaded ${payments.length} payments.`);

    } catch (err) {
        console.warn('[DataLoader] loadPayments failed:', err.message);
    }
}

/**
 * Load all assessments for the active term.
 * Called by marks-database.js and class-register.js.
 */
async function loadAllAssessmentsForTerm(termId) {
    const tid = termId || getActiveTermId();
    if (!tid) return;

    try {
        const assessments = await getAllRecords('assessments',
            `term_id=eq.${tid}&order=class_id.asc,created_at.asc`
        );
        // Merge assessments for this term
        const filtered = state.assessments.filter(a => a.term_id !== tid);
        state.assessments = [...filtered, ...assessments];

        console.info(`[DataLoader] Loaded ${assessments.length} assessments for term ${tid}.`);

    } catch (err) {
        console.warn('[DataLoader] loadAllAssessmentsForTerm failed:', err.message);
    }
}

/**
 * Load all marks for the active term.
 * WARNING: This can be a very large dataset. Use loadMarksForClass
 * wherever possible instead.
 */
async function loadAllMarksForTerm(termId) {
    const tid = termId || getActiveTermId();
    if (!tid) return;

    // Ensure assessments are loaded first
    if (state.assessments.filter(a => a.term_id === tid).length === 0) {
        await loadAllAssessmentsForTerm(tid);
    }

    const assessmentIds = state.assessments
        .filter(a => a.term_id === tid)
        .map(a => a.id);

    if (assessmentIds.length === 0) return;

    try {
        const idsStr = assessmentIds.join(',');
        const marks = await getAllRecords('marks',
            `assessment_id=in.(${idsStr})`
        );

        // Replace all marks for this term
        const filtered = state.marks.filter(m =>
            !assessmentIds.includes(m.assessment_id)
        );
        state.marks = [...filtered, ...marks];

        clearAcademicCaches();
        console.info(`[DataLoader] Loaded ${marks.length} marks for term ${tid}.`);

    } catch (err) {
        console.warn('[DataLoader] loadAllMarksForTerm failed:', err.message);
    }
}

/* ─────────────────────────────────────────────────────────────────
   CROSS-YEAR DATA LOADER  (for annual register + annual totals)
   ───────────────────────────────────────────────────────────────── */

/**
 * Load marks for ALL THREE terms in the active academic year.
 * Required by annual-register.js and report-cards.js for annual view.
 *
 * Returns a termData object: { [termId]: { assessments, marks, termNumber } }
 *
 * @param {number} classId
 * @param {number} yearId
 */
async function loadAnnualDataForClass(classId, yearId) {
    const yr = yearId || getActiveYearId();
    if (!yr || !classId) return {};

    const yearTerms = state.terms.filter(t => t.academic_year_id === yr);
    const termData = {};

    await Promise.all(yearTerms.map(async term => {
        const assessments = await getAll('assessments',
            `class_id=eq.${classId}&term_id=eq.${term.id}&order=created_at.asc`
        ).catch(() => []);

        const idsStr = assessments.map(a => a.id).join(',');
        const marks = idsStr
            ? await getAllRecords('marks', `assessment_id=in.(${idsStr})`).catch(() => [])
            : [];

        termData[term.id] = {
            assessments,
            marks,
            termNumber: term.term_number,
        };
    }));

    return termData;
}

/* ─────────────────────────────────────────────────────────────────
   SETTINGS RELOAD
   ───────────────────────────────────────────────────────────────── */

/**
 * Reload school settings from the DB and update state.
 * Called by Settings modules after saving changes.
 */
async function reloadSchoolSettings() {
    invalidateSettingsCache();
    const settings = await getSchoolSettings();
    updateState('schoolSettings', settings);
    return settings;
}

/**
 * Reload the grading scale from DB and update state.
 * Called after Settings → Grading Scale saves.
 */
async function reloadGradingScale() {
    const scale = await getAll('grading_scale', 'order=min.desc').catch(() => []);
    updateState('gradingScale', scale.length > 0 ? scale : DEFAULT_GRADES);
    clearAcademicCaches(); // Grades depend on the scale
    return state.gradingScale;
}

/* ─────────────────────────────────────────────────────────────────
   RELOAD AFTER YEAR / TERM CHANGE  (sidebar selector)
   ───────────────────────────────────────────────────────────────── */

/**
 * Called when the user changes the year or term in the sidebar selector.
 * Reloads year-specific data without a full page reload.
 *
 * @param {number} yearId
 * @param {number} [termId]
 */
async function reloadForYear(yearId, termId) {
    updateState('selectedYearId', yearId || null);
    updateState('selectedTermId', termId || null);

    _resolveActiveYearTerm();
    computePhase();

    // Reload year-specific tables
    const [terms, fees, feeAmounts, holidays] = await Promise.all([
        getAll('terms', `academic_year_id=eq.${yearId}&order=term_number.asc`).catch(() => []),
        getAllRecords('student_fees', `academic_year_id=eq.${yearId}`).catch(() => []),
        getAll('fee_amounts', `academic_year_id=eq.${yearId}`).catch(() => []),
        getAll('holidays', `academic_year_id=eq.${yearId}&order=start_date.asc`).catch(() => []),
    ]);

    updateStateBatch({
        terms,
        studentFees: fees,
        feeAmounts,
        holidays,
        assessments: [], // clear — will reload lazily per module
        marks: [], // clear — will reload lazily per module
    });

    clearAllCaches();

    // Reload holiday data if now in holiday mode
    if (isHolidayMode()) {
        await _loadHolidayData();
    }
}

/* ─────────────────────────────────────────────────────────────────
   EXPOSE
   ───────────────────────────────────────────────────────────────── */

window.loadAllData = loadAllData;
window.loadMarksForClass = loadMarksForClass;
window.loadAssessmentsForClass = loadAssessmentsForClass;
window.loadStudentFees = loadStudentFees;
window.loadPayments = loadPayments;
window.loadAllAssessmentsForTerm = loadAllAssessmentsForTerm;
window.loadAllMarksForTerm = loadAllMarksForTerm;
window.loadAnnualDataForClass = loadAnnualDataForClass;
window.reloadSchoolSettings = reloadSchoolSettings;
window.reloadGradingScale = reloadGradingScale;
window.reloadForYear = reloadForYear;