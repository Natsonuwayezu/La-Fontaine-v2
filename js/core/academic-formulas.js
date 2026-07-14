/* ═══════════════════════════════════════════════════════════════════
   js/core/academic-formulas.js
   ═══════════════════════════════════════════════════════════════════
   Purpose : All academic mark aggregation formulas.
             MG (continuous assessment), EX (exam), TOT (term total),
             pre-midterm and post-midterm phase calculations,
             annual totals (ANNUAL_G_TOT), and the denominator rule
             that prevents zero-denominator division.
             These are pure functions — no API calls, no DOM writes.
   References: backend.txt Part 4 (Formulas), Part 2.13 (marks table)
   Load order: AFTER formulas.js.
   ═══════════════════════════════════════════════════════════════════ */

'use strict';

/* ═══════════════════════════════════════════════════════════════════
   1. DENOMINATOR RULE  (Part 4.3)
   ═══════════════════════════════════════════════════════════════════
   When computing MG or EX for a subject, the denominator is the sum
   of max_scores of all assessments that have been entered (i.e. have
   at least one mark recorded), NOT the theoretical maximum from the
   subject definition.

   Example: Subject max_mg = 50. Three MG assessments were created
   with max_score 20, 15, 15. If only two have marks recorded so far,
   the denominator is 35 (20+15), not 50 or 45.

   This prevents unfair averaging when not all assessments are done.
   ═══════════════════════════════════════════════════════════════════ */

/**
 * Filter assessments to only those that have at least one mark recorded
 * for any student in the class. "Has marks" means at least one non-null
 * score exists in the marks array for that assessment_id.
 *
 * @param {Array}  assessments - assessment rows for the subject+class+term
 * @param {Array}  marks       - all mark rows for the class+term
 * @returns {Array} subset of assessments that have at least one mark
 */
function getActiveAssessments(assessments, marks) {
    const assessmentIdsWithMarks = new Set(
        marks
            .filter(m => m.score !== null && m.score !== undefined)
            .map(m => m.assessment_id)
    );
    return assessments.filter(a => assessmentIdsWithMarks.has(a.id));
}

/**
 * Compute the effective denominator (sum of max_scores) for a set
 * of active assessments.
 *
 * @param {Array} assessments - subset returned by getActiveAssessments()
 * @returns {number}
 */
function computeDenominator(assessments) {
    return assessments.reduce((sum, a) => sum + Number(a.max_score || 0), 0);
}

/* ═══════════════════════════════════════════════════════════════════
   2. MG CALCULATION  (Part 4.2 — Continuous Assessment Average)
   ═══════════════════════════════════════════════════════════════════
   MG = (sum of student's scores on MG-type assessments) /
        (sum of max_scores for active MG assessments) × mg_max

   Returned scaled to the subject's mg_max (e.g. 50 for most subjects).
   Returns null if no active assessments have marks yet.
   ═══════════════════════════════════════════════════════════════════ */

/**
 * Compute the MG (continuous assessment score) for one student on
 * one subject in one term phase.
 *
 * @param {number} studentId
 * @param {Array}  mgAssessments - MG-type assessments for this subject+class+term
 * @param {Array}  marks         - mark rows for the class+term+subject
 * @param {number} mgMax         - subject's mg_max column value (e.g. 50)
 * @returns {number|null}        - scaled MG score, or null if no data
 */
function calcMG(studentId, mgAssessments, marks, mgMax) {
    if (!mgAssessments || mgAssessments.length === 0) return null;
    if (!mgMax || mgMax <= 0) return null;

    // Only assessments that have at least one mark in the class
    const active = getActiveAssessments(mgAssessments, marks);
    if (active.length === 0) return null;

    const denominator = computeDenominator(active);
    if (denominator <= 0) return null;

    // Sum of student's scores on active MG assessments
    const studentMarks = marks.filter(m =>
        m.student_id === studentId &&
        active.some(a => a.id === m.assessment_id) &&
        m.score !== null && m.score !== undefined
    );

    if (studentMarks.length === 0) return null;

    const studentSum = studentMarks.reduce((sum, m) => sum + Number(m.score), 0);

    // Scale to mg_max
    const scaled = (studentSum / denominator) * Number(mgMax);
    return Math.round(scaled * 10) / 10;
}

/* ═══════════════════════════════════════════════════════════════════
   3. EX CALCULATION  (Part 4.2 — Exam Score)
   ═══════════════════════════════════════════════════════════════════
   EX = (sum of student's scores on EX-type assessments) /
        (sum of max_scores for active EX assessments) × ex_max

   Scaled to the subject's ex_max (e.g. 50 for most subjects).
   Returns null if no exam assessments have marks.
   EX-type assessments only exist in the post-midterm phase.
   ═══════════════════════════════════════════════════════════════════ */

/**
 * Compute the EX (exam) score for one student on one subject.
 *
 * @param {number} studentId
 * @param {Array}  exAssessments - EX-type assessments for this subject+class+term
 * @param {Array}  marks
 * @param {number} exMax         - subject's ex_max (e.g. 50)
 * @returns {number|null}
 */
function calcEX(studentId, exAssessments, marks, exMax) {
    if (!exAssessments || exAssessments.length === 0) return null;
    if (!exMax || exMax <= 0) return null;

    const active = getActiveAssessments(exAssessments, marks);
    if (active.length === 0) return null;

    const denominator = computeDenominator(active);
    if (denominator <= 0) return null;

    const studentMarks = marks.filter(m =>
        m.student_id === studentId &&
        active.some(a => a.id === m.assessment_id) &&
        m.score !== null && m.score !== undefined
    );

    if (studentMarks.length === 0) return null;

    const studentSum = studentMarks.reduce((sum, m) => sum + Number(m.score), 0);
    const scaled = (studentSum / denominator) * Number(exMax);
    return Math.round(scaled * 10) / 10;
}

/* ═══════════════════════════════════════════════════════════════════
   4. TOT CALCULATION  (Part 4.2 — Term Subject Total)
   ═══════════════════════════════════════════════════════════════════
   TOT = MG + EX

   For pre-midterm phase: only MG assessments exist, so TOT = MG only
   (EX is null/0 at this stage).

   For post-midterm phase: TOT = MG + EX (full subject total).

   TOT is the subject-level score used in the class register.
   Maximum TOT = mg_max + ex_max (e.g. 50 + 50 = 100 for most subjects).
   ═══════════════════════════════════════════════════════════════════ */

/**
 * Compute the TOT (term total) for one student on one subject.
 *
 * @param {number|null} mg - MG score (null if not computed yet)
 * @param {number|null} ex - EX score (null in pre-midterm or not entered)
 * @returns {number|null}  - null if both inputs are null
 */
function calcTOT(mg, ex) {
    const hasMG = mg !== null && mg !== undefined && !isNaN(Number(mg));
    const hasEX = ex !== null && ex !== undefined && !isNaN(Number(ex));

    if (!hasMG && !hasEX) return null;

    const mgVal = hasMG ? Number(mg) : 0;
    const exVal = hasEX ? Number(ex) : 0;

    return Math.round((mgVal + exVal) * 10) / 10;
}

/* ═══════════════════════════════════════════════════════════════════
   5. PRE-MIDTERM PHASE TOTALS  (Part 4.5)
   ═══════════════════════════════════════════════════════════════════
   Pre-midterm = Only MG assessments have been recorded.
   The register shows: MG per subject, and G_TOT = sum of all subject MGs.

   PRE_MAX (maximum possible) = sum of all subjects' mg_max values.
   ═══════════════════════════════════════════════════════════════════ */

/**
 * Compute the pre-midterm G_TOT (grand total of all subject MGs)
 * for one student.
 *
 * @param {number}   studentId
 * @param {Array}    subjects     - subject rows for this class level
 * @param {Array}    assessments  - all MG assessments for this class+term
 * @param {Array}    marks        - all marks for this class+term
 * @returns {{ gTot: number|null, perSubject: Object }}
 *   perSubject = { subjectId: mg_value_or_null, ... }
 */
function calcPreMidtermTotals(studentId, subjects, assessments, marks) {
    const perSubject = {};
    let gTot = null;
    let hasAny = false;

    subjects.forEach(subject => {
        // Only MG-type assessments (Quiz, Assignment, Observation, Midterm)
        const subjectAssessments = assessments.filter(a =>
            a.subject_id === subject.id && MG_TYPES.includes(a.type)
        );

        const mg = calcMG(studentId, subjectAssessments, marks, subject.mg_max);
        perSubject[subject.id] = { mg, ex: null, tot: mg };

        if (mg !== null) {
            gTot = (gTot || 0) + mg;
            hasAny = true;
        }
    });

    return {
        gTot: hasAny ? Math.round((gTot || 0) * 10) / 10 : null,
        perSubject,
        phase: 'pre_midterm',
    };
}

/* ═══════════════════════════════════════════════════════════════════
   6. POST-MIDTERM PHASE TOTALS  (Part 4.5)
   ═══════════════════════════════════════════════════════════════════
   Post-midterm = Both MG and EX assessments are recorded.
   The register shows: MG, EX, TOT per subject, and G_TOT = sum of all TOTs.

   G_TOT_MAX = sum of all subjects' (mg_max + ex_max).
   For primary: max = 660 per term (see backend.txt Part 4.5).
   For nursery: max = 800 per term.
   ═══════════════════════════════════════════════════════════════════ */

/**
 * Compute the post-midterm G_TOT (grand total) for one student.
 *
 * @param {number} studentId
 * @param {Array}  subjects
 * @param {Array}  assessments
 * @param {Array}  marks
 * @returns {{ gTot: number|null, perSubject: Object, gTotPct: number|null }}
 */
function calcPostMidtermTotals(studentId, subjects, assessments, marks) {
    const perSubject = {};
    let gTot = null;
    let hasAny = false;

    subjects.forEach(subject => {
        // Skip subjects that only appear post-midterm if they have
        // the appears_only_post_midterm flag but we are computing totals
        // — they ARE included here since we are post-midterm

        const mgAssessments = assessments.filter(a =>
            a.subject_id === subject.id && MG_TYPES.includes(a.type)
        );
        const exAssessments = assessments.filter(a =>
            a.subject_id === subject.id && EX_TYPES.includes(a.type)
        );

        const mg = calcMG(studentId, mgAssessments, marks, subject.mg_max);
        const ex = calcEX(studentId, exAssessments, marks, subject.ex_max);
        const tot = calcTOT(mg, ex);

        perSubject[subject.id] = { mg, ex, tot };

        if (tot !== null) {
            gTot = (gTot || 0) + tot;
            hasAny = true;
        }
    });

    // Compute percentage
    const maxTot = subjects.reduce((sum, s) =>
        sum + Number(s.mg_max || 0) + Number(s.ex_max || 0), 0
    );

    const gTotPct = (hasAny && maxTot > 0)
        ? Math.round(((gTot || 0) / maxTot) * 1000) / 10
        : null;

    return {
        gTot: hasAny ? Math.round((gTot || 0) * 10) / 10 : null,
        gTotPct,
        maxTot,
        perSubject,
        phase: 'post_midterm',
    };
}

/* ═══════════════════════════════════════════════════════════════════
   7. ANNUAL TOTALS  (Part 4.5, Part 4.6)
   ═══════════════════════════════════════════════════════════════════
   ANNUAL_G_TOT = sum of G_TOT across all 3 terms (post-midterm only).
   ANNUAL_G_TOT_MAX:
     Primary : 1980 (3 × 660)
     Nursery : 2400 (3 × 800)

   Annual percentage = ANNUAL_G_TOT / ANNUAL_G_TOT_MAX × 100.
   Annual rank is computed from ANNUAL_G_TOT across the class.
   ═══════════════════════════════════════════════════════════════════ */

/**
 * Compute the annual totals for one student across 3 terms.
 *
 * @param {number} studentId
 * @param {Array}  subjects      - subject rows for this class level
 * @param {Object} termData      - { [termId]: { assessments, marks } }
 *                                 Pre-loaded data for each term
 * @param {string} level         - 'primary' | 'nursery'
 * @returns {{
 *   annualGTot     : number|null,
 *   annualGTotMax  : number,
 *   annualPct      : number|null,
 *   perTerm        : Object,       // termId → post-midterm totals
 *   perSubjectAnnual: Object,      // subjectId → { term1Tot, term2Tot, term3Tot, annualTot }
 * }}
 */
function calcAnnualTotals(studentId, subjects, termData, level = 'primary') {
    const annualGTotMax = level === 'nursery' ? ANNUAL_MAX.nursery : ANNUAL_MAX.primary;
    const perTerm = {};
    const perSubjectAnnual = {};

    // Initialize per-subject annual accumulator
    subjects.forEach(sub => {
        perSubjectAnnual[sub.id] = {
            term1Tot: null,
            term2Tot: null,
            term3Tot: null,
            annualTot: null,
            annualPct: null,
        };
    });

    let annualGTot = null;
    let hasAnyTerm = false;

    // Process each term's post-midterm totals
    Object.entries(termData).forEach(([termId, { assessments, marks, termNumber }]) => {
        const result = calcPostMidtermTotals(studentId, subjects, assessments, marks);
        perTerm[termId] = result;

        if (result.gTot !== null) {
            annualGTot = (annualGTot || 0) + result.gTot;
            hasAnyTerm = true;
        }

        // Accumulate per-subject totals
        subjects.forEach(sub => {
            const termTot = result.perSubject[sub.id]?.tot ?? null;
            const key = `term${termNumber || 1}Tot`;
            if (perSubjectAnnual[sub.id]) {
                perSubjectAnnual[sub.id][key] = termTot;
            }
        });
    });

    // Compute annual totals per subject
    subjects.forEach(sub => {
        const s = perSubjectAnnual[sub.id];
        const termTots = [s.term1Tot, s.term2Tot, s.term3Tot].filter(t => t !== null);
        if (termTots.length > 0) {
            s.annualTot = Math.round(termTots.reduce((a, b) => a + b, 0) * 10) / 10;
            const subjectMax = (Number(sub.mg_max || 0) + Number(sub.ex_max || 0)) * 3;
            s.annualPct = subjectMax > 0
                ? Math.round((s.annualTot / subjectMax) * 1000) / 10
                : null;
        }
    });

    const annualGTotRounded = hasAnyTerm
        ? Math.round((annualGTot || 0) * 10) / 10
        : null;

    const annualPct = (annualGTotRounded !== null && annualGTotMax > 0)
        ? Math.round((annualGTotRounded / annualGTotMax) * 1000) / 10
        : null;

    return {
        annualGTot: annualGTotRounded,
        annualGTotMax,
        annualPct,
        perTerm,
        perSubjectAnnual,
    };
}

/* ═══════════════════════════════════════════════════════════════════
   8. TEACHER COMPLETION RATE  (Part 4.9)
   ═══════════════════════════════════════════════════════════════════
   Completion rate = number of assessments with at least one mark /
                     total number of assessments created by the teacher
                     for this term.

   Used in teacher-performance.js to show how much marking is done.
   ═══════════════════════════════════════════════════════════════════ */

/**
 * Compute a teacher's mark completion rate for a term.
 * @param {number} teacherId
 * @param {number} termId
 * @param {Array}  allAssessments - all assessments for the term
 * @param {Array}  allMarks       - all marks for the term
 * @returns {{ completed: number, total: number, pct: number }}
 */
function calcCompletionRate(teacherId, termId, allAssessments, allMarks) {
    const teacherAssessments = allAssessments.filter(a =>
        a.created_by === teacherId && a.term_id === termId
    );

    if (teacherAssessments.length === 0) {
        return { completed: 0, total: 0, pct: 100 };
    }

    const assessmentIdsWithMarks = new Set(
        allMarks
            .filter(m => m.score !== null && m.score !== undefined)
            .map(m => m.assessment_id)
    );

    const completed = teacherAssessments.filter(a =>
        assessmentIdsWithMarks.has(a.id)
    ).length;

    return {
        completed,
        total: teacherAssessments.length,
        pct: Math.round((completed / teacherAssessments.length) * 100),
    };
}

/* ═══════════════════════════════════════════════════════════════════
   9. CLASS REGISTER ROW BUILDER  (Part 8)
   ═══════════════════════════════════════════════════════════════════
   Builds the data rows for the class register table for all students
   in a class, for a given phase.

   Returns an array of row objects:
   {
     student     : { id, code, first_name, last_name, ... },
     subjects    : { subjectId: { mg, ex, tot } },
     gTot        : number|null,
     gTotMax     : number,
     gTotPct     : number|null,
     grade       : string,
     rank        : number|null,   // set after all rows computed
     isPassing   : boolean,
   }
   ═══════════════════════════════════════════════════════════════════ */

/**
 * Build register rows for all students in a class for a given phase.
 *
 * @param {Array}  students     - students in the class (not deleted)
 * @param {Array}  subjects     - subjects for this class level
 * @param {Array}  assessments  - all assessments for class+term
 * @param {Array}  marks        - all marks for class+term
 * @param {string} phase        - 'pre_midterm' | 'post_midterm'
 * @returns {Array} rows with rank set
 */
function buildRegisterRows(students, subjects, assessments, marks, phase) {
    const rows = students.map(student => {
        let result;
        if (phase === 'pre_midterm') {
            result = calcPreMidtermTotals(student.id, subjects, assessments, marks);
        } else {
            result = calcPostMidtermTotals(student.id, subjects, assessments, marks);
        }

        const gTotMax = phase === 'pre_midterm'
            ? subjects.reduce((sum, s) => sum + Number(s.mg_max || 0), 0)
            : subjects.reduce((sum, s) => sum + Number(s.mg_max || 0) + Number(s.ex_max || 0), 0);

        const grade = getGrade(result.gTotPct ?? null);
        const passing = result.gTotPct !== null
            ? isPassing(result.gTotPct)
            : false;

        return {
            student,
            subjects: result.perSubject,
            gTot: result.gTot,
            gTotMax,
            gTotPct: result.gTotPct ?? null,
            grade,
            isPassing: passing,
            rank: null, // filled in after sorting
            total: result.gTot, // alias for rankStudents()
            last_name: student.last_name,
            first_name: student.first_name,
            id: student.id,
        };
    });

    // Assign ranks using the rankStudents() function from formulas.js
    const ranked = rankStudents(rows);

    // Copy rank back onto each row
    const rankMap = {};
    ranked.forEach(r => { rankMap[r.id] = r.rank; });
    rows.forEach(r => { r.rank = rankMap[r.id] || null; });

    // Return sorted by rank
    return rows.sort((a, b) => (a.rank || 999) - (b.rank || 999));
}

/* ═══════════════════════════════════════════════════════════════════
   10. ANNUAL REGISTER BUILDER  (Part 4.6)
   ═══════════════════════════════════════════════════════════════════ */

/**
 * Build the annual register rows for all students, using 3-term data.
 *
 * @param {Array}  students
 * @param {Array}  subjects
 * @param {Object} allTermData  - { [termId]: { assessments, marks, termNumber } }
 * @param {string} level        - 'primary' | 'nursery'
 * @returns {Array} rows sorted by annual rank
 */
function buildAnnualRegisterRows(students, subjects, allTermData, level = 'primary') {
    const rows = students.map(student => {
        const annual = calcAnnualTotals(student.id, subjects, allTermData, level);
        const grade = getGrade(annual.annualPct);
        const passing = annual.annualPct !== null ? isPassing(annual.annualPct) : false;
        const decision = getPromotionDecision(
            annual.annualPct ?? 0,
            // Class name comes from the student object via a join
            student.class_name || student.class_code || ''
        );

        return {
            student,
            perTerm: annual.perTerm,
            perSubjectAnnual: annual.perSubjectAnnual,
            annualGTot: annual.annualGTot,
            annualGTotMax: annual.annualGTotMax,
            annualPct: annual.annualPct,
            grade,
            isPassing: passing,
            decision,
            rank: null,
            total: annual.annualGTot,
            last_name: student.last_name,
            first_name: student.first_name,
            id: student.id,
        };
    });

    // Rank by annual total
    const ranked = rankStudents(rows);
    const rankMap = {};
    ranked.forEach(r => { rankMap[r.id] = r.rank; });
    rows.forEach(r => { r.rank = rankMap[r.id] || null; });

    return rows.sort((a, b) => (a.rank || 999) - (b.rank || 999));
}

/* ═══════════════════════════════════════════════════════════════════
   11. INDIVIDUAL STUDENT REPORT DATA  (Part 7)
   ═══════════════════════════════════════════════════════════════════
   Aggregates all data needed to render one student's report card.
   ═══════════════════════════════════════════════════════════════════ */

/**
 * Compute all data needed for a single student's report card.
 *
 * @param {Object} student    - student row
 * @param {Array}  subjects   - subjects for the student's class level
 * @param {Array}  assessments
 * @param {Array}  marks
 * @param {string} phase      - 'pre_midterm' | 'post_midterm'
 * @param {Array}  classRankedRows - already-ranked register rows (for rank lookup)
 * @returns {Object} reportData
 */
function buildStudentReportData(student, subjects, assessments, marks, phase, classRankedRows = []) {
    let result;
    if (phase === 'pre_midterm') {
        result = calcPreMidtermTotals(student.id, subjects, assessments, marks);
    } else {
        result = calcPostMidtermTotals(student.id, subjects, assessments, marks);
    }

    const gTotMax = subjects.reduce((sum, s) =>
        sum + Number(s.mg_max || 0) + (phase === 'post_midterm' ? Number(s.ex_max || 0) : 0), 0
    );

    const rank = getStudentRank(classRankedRows, student.id);
    const grade = getGrade(result.gTotPct ?? null);
    const passing = result.gTotPct !== null ? isPassing(result.gTotPct) : false;

    // Build per-subject rows for the report card table
    const subjectRows = subjects.map(sub => {
        const subData = result.perSubject[sub.id] || {};

        const mg = subData.mg ?? null;
        const ex = subData.ex ?? null;
        const tot = subData.tot ?? null;
        const max = phase === 'pre_midterm'
            ? Number(sub.mg_max)
            : Number(sub.mg_max) + Number(sub.ex_max);
        const pct = scoreToPercent(tot, max);
        const grade = getGrade(pct);

        return {
            subject: sub,
            mg,
            ex,
            tot,
            max,
            pct,
            grade,
            isPassing: pct !== null ? isPassing(pct) : false,
        };
    });

    return {
        student,
        subjectRows,
        gTot: result.gTot,
        gTotMax,
        gTotPct: result.gTotPct ?? null,
        grade,
        isPassing: passing,
        rank,
        classSize: classRankedRows.length,
        phase,
    };
}

/* ═══════════════════════════════════════════════════════════════════
   12. MISSING MARKS DETECTION  (Part 4.9)
   ═══════════════════════════════════════════════════════════════════ */

/**
 * Find students in a class who are missing marks for an assessment.
 * @param {number} assessmentId
 * @param {Array}  students     - students in the class
 * @param {Array}  marks        - all marks for the assessment
 * @returns {Array} students who have no mark for the assessment
 */
function findMissingMarks(assessmentId, students, marks) {
    const studentIdsWithMarks = new Set(
        marks
            .filter(m => m.assessment_id === assessmentId &&
                m.score !== null && m.score !== undefined && !m.is_absent)
            .map(m => m.student_id)
    );
    return students.filter(s => !studentIdsWithMarks.has(s.id));
}

/**
 * Check if all students in a class have marks for a given assessment.
 * @param {number} assessmentId
 * @param {Array}  students
 * @param {Array}  marks
 * @returns {boolean}
 */
function isAssessmentComplete(assessmentId, students, marks) {
    return findMissingMarks(assessmentId, students, marks).length === 0;
}

/* ═══════════════════════════════════════════════════════════════════
   EXPOSE
   ═══════════════════════════════════════════════════════════════════ */

window.getActiveAssessments = getActiveAssessments;
window.computeDenominator = computeDenominator;
window.calcMG = calcMG;
window.calcEX = calcEX;
window.calcTOT = calcTOT;
window.calcPreMidtermTotals = calcPreMidtermTotals;
window.calcPostMidtermTotals = calcPostMidtermTotals;
window.calcAnnualTotals = calcAnnualTotals;
window.calcCompletionRate = calcCompletionRate;
window.buildRegisterRows = buildRegisterRows;
window.buildAnnualRegisterRows = buildAnnualRegisterRows;
window.buildStudentReportData = buildStudentReportData;
window.findMissingMarks = findMissingMarks;
window.isAssessmentComplete = isAssessmentComplete;