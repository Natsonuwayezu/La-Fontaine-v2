/* ═══════════════════════════════════════════════════════════════════
   js/core/formulas.js
   ═══════════════════════════════════════════════════════════════════
   Purpose : All grade computation, pass/fail decisions, ranking,
             and cell-color logic.
             These are pure functions — no API calls, no DOM writes.
             Academic term calculations are in academic-formulas.js.
             Finance calculations are in finance-formulas.js.
   Load order: AFTER state.js and utils.js.
   ═══════════════════════════════════════════════════════════════════ */

'use strict';

/* ═══════════════════════════════════════════════════════════════════
   1. GRADING SCALE LOOKUP  (Part 4.1, Part 10.7)
   ═══════════════════════════════════════════════════════════════════
   RULE: Always use state.gradingScale (loaded from DB).
         Fall back to DEFAULT_GRADES ONLY if the DB table is empty.
         Never hard-code grade boundaries here.
   ═══════════════════════════════════════════════════════════════════ */

/**
 * Return the active grading scale (DB rows or fallback).
 * Sorted from highest min to lowest.
 */
function getGradingScale() {
    const scale = (state.gradingScale && state.gradingScale.length > 0)
        ? state.gradingScale
        : DEFAULT_GRADES;
    return [...scale].sort((a, b) => Number(b.min) - Number(a.min));
}

/**
 * Get the pass mark percentage from school settings.
 * Falls back to 50 if not set. (Part 10.7)
 */
function getPassMark() {
    const pm = state.schoolSettings?.pass_mark
        || SCHOOL_DEFAULTS.pass_mark
        || '50';
    return parseFloat(pm) || 50;
}

/* ═══════════════════════════════════════════════════════════════════
   2. GRADE DETERMINATION  (Part 4.1)
   ═══════════════════════════════════════════════════════════════════ */

/**
 * Get the grade letter for a percentage score.
 * @param {number} pct - percentage (0–100)
 * @returns {string} grade letter e.g. 'A+', 'B', 'F'
 */
function getGrade(pct) {
    if (pct === null || pct === undefined || isNaN(Number(pct))) return '—';
    const p = Number(pct);
    const scale = getGradingScale();
    for (const band of scale) {
        if (p >= Number(band.min) && p <= Number(band.max)) {
            return band.grade;
        }
    }
    return 'F';
}

/**
 * Get the full grade band object for a percentage.
 * Returns { grade, min, max, desc, color } or null.
 */
function getGradeBand(pct) {
    if (pct === null || pct === undefined || isNaN(Number(pct))) return null;
    const p = Number(pct);
    const scale = getGradingScale();
    return scale.find(b => p >= Number(b.min) && p <= Number(b.max)) || null;
}

/**
 * Determine if a percentage is a passing score.
 * Uses the school's configured pass mark.
 * @param {number} pct
 * @returns {boolean}
 */
function isPassing(pct) {
    if (pct === null || pct === undefined || isNaN(Number(pct))) return false;
    return Number(pct) >= getPassMark();
}

/**
 * Determine if a raw score is passing given the max possible score.
 * @param {number} score  - raw score
 * @param {number} max    - maximum possible score
 */
function isPassingScore(score, max) {
    if (!max || max <= 0) return false;
    const pct = (Number(score) / Number(max)) * 100;
    return isPassing(pct);
}

/* ═══════════════════════════════════════════════════════════════════
   3. PROMOTION DECISION  (Part 4.4)
   ═══════════════════════════════════════════════════════════════════
   Primary promotion decisions:
     PROMOTED    — annual percentage ≥ pass mark
     REMEDIAL    — between 40% and pass_mark (conditional — can sit resits)
     REPEATED    — below 40%
     GRADUATED   — from P5 (no P6 — they exit the school)

   Nursery decisions use French labels (Part 7.1).
   ═══════════════════════════════════════════════════════════════════ */

const REMEDIAL_THRESHOLD = 40; // below this → definitely repeat (Part 4.4)

/**
 * Get the promotion decision for a student given their annual percentage.
 * @param {number} annualPct   - annual percentage score
 * @param {string} [className] - current class name (to detect P5/P6)
 * @returns {{ decision: string, label: string, labelFr?: string, color: string }}
 */
function getPromotionDecision(annualPct, className = '') {
    const pct = Number(annualPct) || 0;
    const passMark = getPassMark();
    const cls = (className || '').toUpperCase().trim();

    // P5 students graduate (no P6 in this school — Part 5.9)
    if (cls.includes('P6')) {
        return {
            decision: 'GRADUATED',
            label: 'GRADUATED',
            labelFr: 'DIPLÔMÉ(E)',
            color: '#2d6a4f',
        };
    }

    if (pct >= passMark) {
        return {
            decision: 'PROMOTED',
            label: 'PROMOTED',
            labelFr: 'PROMU(E)',
            color: '#2d6a4f',
        };
    }

    if (pct >= REMEDIAL_THRESHOLD) {
        return {
            decision: 'REMEDIAL',
            label: 'REMEDIAL COURSES',
            labelFr: 'COURS DE RATTRAPAGE',
            color: '#c99a3b',
        };
    }

    return {
        decision: 'REPEATED',
        label: 'MUST REPEAT',
        labelFr: 'DOIT REPRENDRE',
        color: '#c44536',
    };
}

/* ═══════════════════════════════════════════════════════════════════
   4. CELL COLOR CODING  (Part 8)
   ═══════════════════════════════════════════════════════════════════ */

/**
 * Return the CSS class and style for a score cell in the class register.
 * @param {number} score - raw score
 * @param {number} max   - maximum possible score for that column
 * @returns {{ cls: string, bg: string, text: string }}
 */
function getCellColor(score, max) {
    if (score === null || score === undefined || score === '' || max <= 0) {
        return { cls: '', bg: '', text: '' };
    }
    const pct = (Number(score) / Number(max)) * 100;
    for (const band of CELL_COLORS) {
        if (pct >= band.min && pct <= band.max) {
            return { cls: band.cls, bg: band.bg, text: band.text };
        }
    }
    return { cls: '', bg: '', text: '' };
}

/**
 * Build the inline style string for a score cell.
 * @param {number} score
 * @param {number} max
 */
function cellStyle(score, max) {
    const { bg, text } = getCellColor(score, max);
    if (!bg) return '';
    return `background:${bg};color:${text};`;
}

/* ═══════════════════════════════════════════════════════════════════
   5. RANKING ENGINE  (Part 4.7)
   ═══════════════════════════════════════════════════════════════════
   Ties are broken alphabetically by last_name, then first_name (A→Z).
   So two students with the same total both get the SAME rank, and the
   next rank is skipped (e.g. 1, 2, 2, 4…).
   ═══════════════════════════════════════════════════════════════════ */

/**
 * Rank an array of student score objects.
 * @param {Array<{ id, last_name, first_name, total }>} students
 * @returns {Array<{ ...student, rank }>} sorted and ranked
 */
function rankStudents(students) {
    if (!students || students.length === 0) return [];

    // Sort: highest total first; ties broken by name A→Z
    const sorted = [...students].sort((a, b) => {
        const diff = Number(b.total || 0) - Number(a.total || 0);
        if (diff !== 0) return diff;
        // Alphabetical tiebreak
        const la = String(a.last_name || '').toUpperCase();
        const lb = String(b.last_name || '').toUpperCase();
        if (la !== lb) return la < lb ? -1 : 1;
        const fa = String(a.first_name || '').toUpperCase();
        const fb = String(b.first_name || '').toUpperCase();
        return fa < fb ? -1 : 1;
    });

    // Assign ranks (same total → same rank; next rank skips)
    let currentRank = 1;
    sorted.forEach((student, idx) => {
        if (idx === 0) {
            student.rank = 1;
        } else {
            const prevTotal = Number(sorted[idx - 1].total || 0);
            const currTotal = Number(student.total || 0);
            if (currTotal === prevTotal) {
                student.rank = sorted[idx - 1].rank; // same rank (tie)
            } else {
                student.rank = idx + 1; // skip ranks for ties above
            }
        }
        currentRank = student.rank;
    });

    return sorted;
}

/**
 * Get the rank of a specific student from a ranked list.
 * @param {Array}  rankedList  - output of rankStudents()
 * @param {number} studentId
 * @returns {number|null}
 */
function getStudentRank(rankedList, studentId) {
    const found = rankedList.find(s => s.id === studentId);
    return found ? found.rank : null;
}

/* ═══════════════════════════════════════════════════════════════════
   6. CLASS STATISTICS  (Part 4.8)
   ═══════════════════════════════════════════════════════════════════ */

/**
 * Compute class-wide statistics from an array of student totals.
 * @param {number[]} totals - array of numeric total scores
 * @param {number}   maxTotal - maximum possible total score
 * @returns {{ count, mean, passRate, highest, lowest, stdDev }}
 */
function computeClassStats(totals, maxTotal) {
    const valid = totals.filter(t => t !== null && t !== undefined && !isNaN(t)).map(Number);

    if (valid.length === 0) {
        return { count: 0, mean: 0, passRate: 0, highest: 0, lowest: 0, stdDev: 0 };
    }

    const count = valid.length;
    const sum = valid.reduce((a, b) => a + b, 0);
    const mean = sum / count;
    const highest = Math.max(...valid);
    const lowest = Math.min(...valid);
    const passMark = getPassMark();

    const passing = maxTotal > 0
        ? valid.filter(t => (t / maxTotal) * 100 >= passMark)
        : valid.filter(t => t >= passMark);
    const passRate = (passing.length / count) * 100;

    // Standard deviation
    const variance = valid.reduce((acc, t) => acc + Math.pow(t - mean, 2), 0) / count;
    const stdDev = Math.sqrt(variance);

    return {
        count,
        mean: Math.round(mean * 10) / 10,
        passRate: Math.round(passRate * 10) / 10,
        highest,
        lowest,
        stdDev: Math.round(stdDev * 10) / 10,
    };
}

/**
 * Compute grade distribution from an array of percentages.
 * @param {number[]} percentages
 * @returns {Object} { 'A+': count, 'A': count, ... }
 */
function computeGradeDistribution(percentages) {
    const dist = {};
    const scale = getGradingScale();
    scale.forEach(b => { dist[b.grade] = 0; });

    percentages.forEach(pct => {
        if (pct === null || pct === undefined || isNaN(Number(pct))) return;
        const grade = getGrade(Number(pct));
        if (dist[grade] !== undefined) dist[grade]++;
        else dist[grade] = 1;
    });

    return dist;
}

/**
 * Compute the average score for a specific subject across a class.
 * @param {Array}  marks       - array of mark objects { subject_id, score, assessment_id }
 * @param {number} subjectId
 * @param {number} [termId]    - optional: filter to one term
 */
function computeSubjectAverage(marks, subjectId, termId) {
    const relevant = marks.filter(m => {
        if (m.subject_id !== subjectId) return false;
        if (termId && m.term_id !== termId) return false;
        return m.score !== null && m.score !== undefined && !isNaN(m.score);
    });

    if (relevant.length === 0) return null;

    const sum = relevant.reduce((a, m) => a + Number(m.score), 0);
    return Math.round((sum / relevant.length) * 10) / 10;
}

/* ═══════════════════════════════════════════════════════════════════
   7. ATTENDANCE RATE  (Part 4.8)
   ═══════════════════════════════════════════════════════════════════
   RULE: Late (L) counts as 0.5 day present.
         Excused (E) counts as present (doesn't reduce rate).
         Absent (A) counts as 0.
         Rate = (P + 0.5×L + E) / total_days × 100
   ═══════════════════════════════════════════════════════════════════ */

/**
 * Compute the attendance rate for a student.
 * @param {{ P: number, A: number, L: number, E: number }} counts
 * @returns {number} percentage (0–100)
 */
function computeAttendanceRate({ P = 0, A = 0, L = 0, E = 0 }) {
    const total = P + A + L + E;
    if (total <= 0) return 0;
    const present = P + (L * LATE_WEIGHT) + E;
    return Math.round((present / total) * 1000) / 10; // 1 decimal
}

/**
 * Count attendance codes from an array of attendance records.
 * @param {Array<{ status: 'P'|'A'|'L'|'E' }>} records
 * @returns {{ P, A, L, E, total }}
 */
function countAttendance(records) {
    const counts = { P: 0, A: 0, L: 0, E: 0 };
    records.forEach(r => {
        const s = r.status || r.attendance_status;
        if (counts[s] !== undefined) counts[s]++;
    });
    counts.total = counts.P + counts.A + counts.L + counts.E;
    return counts;
}

/**
 * Determine if a student is at-risk based on attendance rate.
 * @param {number} rate
 * @returns {{ risk: boolean, warning: boolean, label: string, color: string }}
 */
function getAttendanceRisk(rate) {
    if (rate < ATTENDANCE_THRESHOLDS.AT_RISK) {
        return { risk: true, warning: false, label: 'At Risk', color: '#c44536' };
    }
    if (rate < ATTENDANCE_THRESHOLDS.WARNING) {
        return { risk: false, warning: true, label: 'Warning', color: '#c99a3b' };
    }
    return { risk: false, warning: false, label: 'Good', color: '#2d6a4f' };
}

/* ═══════════════════════════════════════════════════════════════════
   8. SIBLING DISCOUNT CALCULATION  (Part 5.5)
   ═══════════════════════════════════════════════════════════════════
   The sibling discount is applied at the family level. The discount
   percentages are configured in the DB (family_discount_rules or
   stored in school_settings). This function applies whatever
   percentage is configured.
   ═══════════════════════════════════════════════════════════════════ */

/**
 * Calculate the discounted fee amount for a sibling.
 * @param {number} originalAmount
 * @param {number} discountPercent - e.g. 10 for 10%
 * @returns {number} discounted amount (never negative)
 */
function applySiblingDiscount(originalAmount, discountPercent) {
    const pct = Math.min(100, Math.max(0, Number(discountPercent) || 0));
    const discount = (Number(originalAmount) * pct) / 100;
    return Math.max(0, Math.round(Number(originalAmount) - discount));
}

/* ═══════════════════════════════════════════════════════════════════
   9. SCORE PERCENTAGE HELPERS
   ═══════════════════════════════════════════════════════════════════ */

/**
 * Compute a percentage given a score and maximum.
 * Returns null if max is 0 or score is missing.
 */
function scoreToPercent(score, max) {
    if (score === null || score === undefined || score === '') return null;
    if (!max || max <= 0) return null;
    return Math.round((Number(score) / Number(max)) * 1000) / 10;
}

/**
 * Compute a percentage for display, clamped to 0–100.
 */
function scoreToDisplayPercent(score, max) {
    const pct = scoreToPercent(score, max);
    if (pct === null) return null;
    return Math.min(100, Math.max(0, pct));
}

/**
 * Check if a score is the maximum (perfect score).
 */
function isPerfectScore(score, max) {
    return Number(score) >= Number(max);
}

/* ═══════════════════════════════════════════════════════════════════
   EXPOSE
   ═══════════════════════════════════════════════════════════════════ */

window.getGradingScale = getGradingScale;
window.getPassMark = getPassMark;
window.getGrade = getGrade;
window.getGradeBand = getGradeBand;
window.isPassing = isPassing;
window.isPassingScore = isPassingScore;
window.getPromotionDecision = getPromotionDecision;
window.getCellColor = getCellColor;
window.cellStyle = cellStyle;
window.rankStudents = rankStudents;
window.getStudentRank = getStudentRank;
window.computeClassStats = computeClassStats;
window.computeGradeDistribution = computeGradeDistribution;
window.computeSubjectAverage = computeSubjectAverage;
window.computeAttendanceRate = computeAttendanceRate;
window.countAttendance = countAttendance;
window.getAttendanceRisk = getAttendanceRisk;
window.applySiblingDiscount = applySiblingDiscount;
window.scoreToPercent = scoreToPercent;
window.scoreToDisplayPercent = scoreToDisplayPercent;
window.isPerfectScore = isPerfectScore;
window.REMEDIAL_THRESHOLD = REMEDIAL_THRESHOLD;