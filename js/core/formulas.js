/**
 * ECOLE LA FONTAINE — Academic Formulas
 * Grading, MG/EX calculation, ranking, term progress
 * Last updated: 2026-06-28
 */


const state = window.state || {}; // global state alias
import { state, getClassById, getCurrentTerm } from './state.js';
import { DEFAULT_GRADES } from '../config/constants.js';

// ──────────────────────────────────────────────────────────────────────
// GRADING SCALE
// ──────────────────────────────────────────────────────────────────────

/**
 * Get the grade for a percentage score
 * @param {number} pct - Percentage (0-100)
 * @param {Array} scale - Optional custom scale
 * @returns {string} Grade letter
 */
export function getGrade(pct, scale = null) {
    if (pct === null || pct === undefined || isNaN(pct)) return '—';
    const gradingScale = scale || state.gradingScale || DEFAULT_GRADES;
    for (const g of gradingScale) {
        const minVal = g.min_percentage !== undefined ? g.min_percentage : g.min;
        const maxVal = g.max_percentage !== undefined ? g.max_percentage : g.max;
        if (pct >= minVal && pct <= maxVal) return g.grade;
    }
    return 'F';
}

/**
 * Get the CSS class for a grade badge
 * @param {number} pct - Percentage
 * @returns {string} CSS class name
 */
export function getGradeClass(pct) {
    if (pct === null || pct === undefined || isNaN(pct)) return 'badge-neutral';
    const g = getGrade(pct);
    const map = {
        'A+': 'grade-Ap',
        'A': 'grade-A',
        'B': 'grade-B',
        'C': 'grade-C',
        'D': 'grade-D',
        'F': 'grade-F',
    };
    return map[g] || 'badge-neutral';
}

/**
 * Alias for getGrade
 */
export function calculateGrade(percentage) {
    return getGrade(percentage);
}

/**
 * Check if a score is passing
 * @param {number} pct - Percentage
 * @param {number} passMark - Pass mark (default from settings)
 * @returns {boolean} Is passing
 */
export function isPassing(pct, passMark = null) {
    if (pct === null || pct === undefined || isNaN(pct)) return false;
    const mark = passMark || parseFloat(state.schoolSettings?.pass_mark || 50);
    return pct >= mark;
}

// ──────────────────────────────────────────────────────────────────────
// CONTINUOUS ASSESSMENT (MG) CALCULATION
// ──────────────────────────────────────────────────────────────────────

/**
 * Calculate MG score from raw scores and max marks
 * @param {number[]} scores - Raw scores
 * @param {number[]} maxes - Max marks per assessment
 * @param {number} mgMax - MG max (e.g., 50)
 * @returns {number|null} Calculated MG
 */
export function calcMG(scores, maxes, mgMax) {
    if (!scores?.length || !maxes?.length) return null;
    const avgRaw = scores.reduce((a, b) => a + b, 0) / scores.length;
    const avgMax = maxes.reduce((a, b) => a + b, 0) / maxes.length;
    return avgMax > 0 ? (avgRaw / avgMax) * mgMax : null;
}

/**
 * Calculate EX score (same formula as MG)
 */
export function calcEX(scores, maxes, exMax) {
    return calcMG(scores, maxes, exMax);
}

/**
 * Calculate pre-midterm score for Primary (percentage)
 * @param {number[]} scores - Raw scores
 * @param {number[]} maxes - Max marks
 * @returns {number|null} Percentage
 */
export function calcPreMidtermPrimary(scores, maxes) {
    if (!scores?.length || !maxes?.length) return null;
    const avgRaw = scores.reduce((a, b) => a + b, 0) / scores.length;
    const avgMax = maxes.reduce((a, b) => a + b, 0) / maxes.length;
    return avgMax > 0 ? (avgRaw / avgMax) * 100 : null;
}

/**
 * Calculate pre-midterm score for Nursery (raw average)
 * @param {number[]} scores - Raw scores
 * @returns {number|null} Average
 */
export function calcPreMidtermNursery(scores) {
    if (!scores?.length) return null;
    return scores.reduce((a, b) => a + b, 0) / scores.length;
}

// ──────────────────────────────────────────────────────────────────────
// POST-MIDTERM SUBJECT CALCULATION
// ──────────────────────────────────────────────────────────────────────

/**
 * Calculate post-midterm for one subject
 * @param {object} subject - Subject object
 * @param {Array} assessments - All assessments
 * @param {Array} marks - All marks
 * @param {number} studentId - Student ID
 * @returns {object} { mg, ex, tot, mgMax, exMax }
 */
export function calcSubjectPostMidterm(subject, assessments, marks, studentId) {
    const mgMax = subject.mg_max || 50;
    const exMax = subject.ex_max || 50;

    const mgAssessments = assessments.filter(a =>
        a.subject_id === subject.id &&
        !['Exam', 'Final Exam'].includes(a.assessment_type)
    );
    const exAssessments = assessments.filter(a =>
        a.subject_id === subject.id &&
        ['Exam', 'Final Exam'].includes(a.assessment_type)
    );

    const mgScores = mgAssessments
        .map(a => marks.find(m => m.assessment_id === a.id && m.student_id === studentId)?.score)
        .filter(v => v !== undefined && v !== null);
    const exScores = exAssessments
        .map(a => marks.find(m => m.assessment_id === a.id && m.student_id === studentId)?.score)
        .filter(v => v !== undefined && v !== null);

    let mg = calcMG(mgScores, mgAssessments.map(a => a.max_marks), mgMax);
    let ex = calcEX(exScores, exAssessments.map(a => a.max_marks), exMax);

    // Post-midterm only subjects: MG = EX (auto-copy)
    if (subject.appears_only_post_midterm && mg === null && ex !== null) {
        mg = ex;
    }

    const tot = (mg !== null || ex !== null) ? (mg || 0) + (ex || 0) : null;

    return { mg, ex, tot, mgMax, exMax };
}

/**
 * Calculate annual subject result (3 terms combined)
 */
export function calcSubjectAnnual(subject, assessments, marks, studentId) {
    return calcSubjectPostMidterm(subject, assessments, marks, studentId);
}

// ──────────────────────────────────────────────────────────────────────
// TERM PROGRESS
// ──────────────────────────────────────────────────────────────────────

/**
 * Calculate term progress percentage and days remaining
 * @param {object} term - Term object
 * @returns {object} { pct, daysLeft, text }
 */
export function termProgress(term = null) {
    const currentTerm = term || state.currentTerm;
    if (!currentTerm?.start_date || !currentTerm?.end_date) {
        return { pct: 0, daysLeft: 0, text: 'No term data' };
    }

    const start = new Date(currentTerm.start_date);
    const end = new Date(currentTerm.end_date);
    const now = new Date();

    if (now < start) {
        return { pct: 0, daysLeft: Math.ceil((end - start) / 86400000), text: 'Not started' };
    }
    if (now > end) {
        return { pct: 100, daysLeft: 0, text: 'Term ended' };
    }

    const pct = ((now - start) / (end - start)) * 100;
    const daysLeft = Math.ceil((end - now) / 86400000);
    return { pct: Math.round(pct), daysLeft, text: `${Math.round(pct)}% complete` };
}

// ──────────────────────────────────────────────────────────────────────
// PHASE DETECTION
// ──────────────────────────────────────────────────────────────────────

/**
 * Get the current academic phase (pre_midterm or post_midterm)
 * @param {object} term - Term object
 * @returns {string} 'pre_midterm' | 'post_midterm'
 */
export function getCurrentPhase(term = null) {
    const currentTerm = term || state.currentTerm;
    if (!currentTerm?.midterm_date) return 'post_midterm';
    return new Date() < new Date(currentTerm.midterm_date) ? 'pre_midterm' : 'post_midterm';
}

// ──────────────────────────────────────────────────────────────────────
// RANKING
// ──────────────────────────────────────────────────────────────────────

/**
 * Rank students and assign ranks with tie-breaking
 * @param {Array} students - Array of student objects with .percentage
 * @returns {Array} Ranked students with .rank and .rankDisplay
 */
export function rankStudents(students) {
    const sorted = [...students].sort((a, b) => {
        if (b.percentage !== a.percentage) return b.percentage - a.percentage;
        return (a.name || '').localeCompare(b.name || '');
    });

    let rank = 1;
    sorted.forEach((s, i) => {
        if (i > 0 && s.percentage === sorted[i - 1].percentage) {
            s.rank = sorted[i - 1].rank;
        } else {
            s.rank = rank;
        }
        rank = s.rank + 1;
        s.rankDisplay = `${s.rank} of ${sorted.length}`;
    });

    return sorted;
}

/**
 * Get the ordinal suffix for a number
 * @param {number} n - Number
 * @returns {string} Ordinal suffix (e.g., 'st', 'nd', 'rd', 'th')
 */
export function getOrdinalSuffix(n) {
    if (n === 1) return 'st';
    if (n === 2) return 'nd';
    if (n === 3) return 'rd';
    return 'th';
}

// ──────────────────────────────────────────────────────────────────────
// GPA CALCULATION
// ──────────────────────────────────────────────────────────────────────

/**
 * Calculate GPA from percentages
 * @param {number[]} percentages - Array of percentages
 * @param {string} scale - '4.0' or '5.0'
 * @returns {string} GPA
 */
export function calculateGPA(percentages, scale = '4.0') {
    if (!percentages?.length) return '—';
    const avg = percentages.reduce((a, b) => a + b, 0) / percentages.length;

    if (scale === '4.0') {
        if (avg >= 90) return '4.0';
        if (avg >= 85) return '3.7';
        if (avg >= 80) return '3.3';
        if (avg >= 75) return '3.0';
        if (avg >= 70) return '2.7';
        if (avg >= 65) return '2.3';
        if (avg >= 60) return '2.0';
        if (avg >= 55) return '1.7';
        if (avg >= 50) return '1.0';
        return '0.0';
    }

    if (scale === '5.0') {
        return (avg / 20).toFixed(1);
    }

    return avg.toFixed(1) + '%';
}