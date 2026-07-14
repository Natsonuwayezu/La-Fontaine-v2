/* ═══════════════════════════════════════════════════════════════════
   js/workers/report-worker.js — Batch report card computation
   ═══════════════════════════════════════════════════════════════════
   Runs in a Web Worker (instantiated by core/print-engine.js or the
   reports module as `new Worker('js/workers/report-worker.js')`).
   Workers have no DOM access — this only computes the data each report
   card needs (grades, MG/EX/TOT, class ranking, pass/fail decision);
   the actual HTML/print rendering happens back on the main thread via
   html/templates/report-card-*.html once this posts its result.

   Incoming message:
     { type: 'GENERATE_BATCH', payload: { students, marksByStudent, gradeBands, passMark } }
       students: [{ id, name, classId }]
       marksByStudent: { [studentId]: { [subjectId]: number } }

   Outgoing messages:
     { type: 'PROGRESS', payload: { done, total } }   — one per student processed
     { type: 'COMPLETE', payload: { reports: [...] } }
     { type: 'ERROR', payload: { message } }

   Formula functions here intentionally duplicate the simplest parts of
   what will eventually be core/academic-formulas.js, since a worker
   can't reach into the main thread's global scope — importScripts()
   with that file's URL is the long-term fix once it exists and is
   written in a worker-safe (no `window`/`document`) style.

   Last updated: 2026-07-13
   ═══════════════════════════════════════════════════════════════════ */

/* global self, importScripts */

// ──────────────────────────────────────────────────────────────────────
//  HELPERS (worker-safe — no window, no document)
// ──────────────────────────────────────────────────────────────────────

/**
 * Get the grade letter for a score based on grade bands
 * @param {number} score - The score to grade
 * @param {Array} gradeBands - Array of { min, max, letter } objects
 * @param {string} defaultGrade - Fallback grade if no band matches
 * @returns {string} The grade letter
 */
function getGrade(score, gradeBands, defaultGrade = 'F') {
  if (score === null || score === undefined || isNaN(score)) {
    return defaultGrade;
  }

  if (!gradeBands || gradeBands.length === 0) {
    // Default grading scale if none provided
    if (score >= 90) return 'A+';
    if (score >= 80) return 'A';
    if (score >= 70) return 'B';
    if (score >= 60) return 'C';
    if (score >= 50) return 'D';
    return 'F';
  }

  // Find the matching grade band
  for (const band of gradeBands) {
    const min = band.min_percentage ?? band.min ?? 0;
    const max = band.max_percentage ?? band.max ?? 100;
    if (score >= min && score <= max) {
      return band.grade || band.letter || '—';
    }
  }

  return defaultGrade;
}

/**
 * Get the CSS class for a grade (for styling)
 * @param {string} grade - The grade letter
 * @returns {string} The CSS class
 */
function getGradeClass(grade) {
  const map = {
    'A+': 'grade-Ap',
    'A': 'grade-A',
    'B': 'grade-B',
    'C': 'grade-C',
    'D': 'grade-D',
    'F': 'grade-F'
  };
  return map[grade] || 'grade-neutral';
}

/**
 * Check if a score is passing
 * @param {number} score - The score to check
 * @param {number} passMark - The passing threshold
 * @returns {boolean} True if passing
 */
function isPassing(score, passMark = 50) {
  return score !== null && score !== undefined && !isNaN(score) && score >= passMark;
}

/**
 * Round a number to a specified decimal places
 * @param {number} value - The value to round
 * @param {number} decimals - Number of decimal places
 * @returns {number} The rounded value
 */
function roundTo(value, decimals = 2) {
  if (value === null || value === undefined || isNaN(value)) {
    return 0;
  }
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}

// ──────────────────────────────────────────────────────────────────────
//  REPORT COMPUTATION
// ──────────────────────────────────────────────────────────────────────

/**
 * Compute a single student report
 * @param {object} student - { id, name, classId }
 * @param {object} marks - { [subjectId]: score }
 * @param {Array} gradeBands - Grading scale
 * @param {number} passMark - Passing threshold
 * @param {object} options - Additional options
 * @returns {object} The computed report
 */
function computeStudentReport(student, marks, gradeBands, passMark, options = {}) {
  const subjectIds = Object.keys(marks);
  const subjectScores = [];

  let total = 0;
  let totalMax = 0;
  let passedCount = 0;
  let failedSubjects = [];

  // Process each subject
  for (const subjectId of subjectIds) {
    const score = marks[subjectId] || 0;
    const max = options.subjectMaxes?.[subjectId] || 100;
    const percentage = max > 0 ? (score / max) * 100 : 0;
    const grade = getGrade(percentage, gradeBands);
    const passing = isPassing(percentage, passMark);

    subjectScores.push({
      subjectId: subjectId,
      score: score,
      max: max,
      percentage: roundTo(percentage, 1),
      grade: grade,
      gradeClass: getGradeClass(grade),
      passing: passing
    });

    total += score;
    totalMax += max;

    if (passing) {
      passedCount++;
    } else {
      failedSubjects.push(subjectId);
    }
  }

  // Calculate overall
  const overallPercentage = totalMax > 0 ? (total / totalMax) * 100 : 0;
  const overallGrade = getGrade(overallPercentage, gradeBands);
  const average = subjectIds.length > 0 ? total / subjectIds.length : 0;

  // Determine decision
  let decision = 'pass';
  let decisionLabel = 'Promoted';
  let decisionClass = 'pass';
  let decisionColor = 'var(--success, #3a7a5a)';

  if (failedSubjects.length === 0) {
    decision = 'pass';
    decisionLabel = 'Promoted';
    decisionClass = 'pass';
    decisionColor = 'var(--success, #3a7a5a)';
  } else if (failedSubjects.length <= 2) {
    decision = 'remedial';
    decisionLabel = 'Holiday Remedial Courses';
    decisionClass = 'remedial';
    decisionColor = 'var(--warning, #b8983a)';
  } else {
    decision = 'fail';
    decisionLabel = 'Repeat Class';
    decisionClass = 'fail';
    decisionColor = 'var(--danger, #c45a4a)';
  }

  // Determine if promoted (for annual reports)
  const promoted = failedSubjects.length === 0 && overallPercentage >= passMark;

  return {
    // Student info
    studentId: student.id,
    studentName: student.name || `${student.first_name || ''} ${student.last_name || ''}`.trim(),
    studentCode: student.student_code || student.code || '—',
    classId: student.classId,
    className: student.className || student.class_name || '—',

    // Subject results
    subjects: subjectScores,
    subjectCount: subjectIds.length,
    passedCount: passedCount,
    failedCount: failedSubjects.length,
    failedSubjects: failedSubjects,

    // Totals
    totalScore: roundTo(total, 1),
    totalMax: totalMax,
    average: roundTo(average, 1),
    overallPercentage: roundTo(overallPercentage, 1),
    overallGrade: overallGrade,
    overallGradeClass: getGradeClass(overallGrade),

    // Decision
    decision: decision,
    decisionLabel: decisionLabel,
    decisionClass: decisionClass,
    decisionColor: decisionColor,
    promoted: promoted,
    isPassing: isPassing(overallPercentage, passMark),

    // Position (rank) — will be assigned later
    position: null,
    classSize: null,
    rankDisplay: null
  };
}

// ──────────────────────────────────────────────────────────────────────
//  RANKING
// ──────────────────────────────────────────────────────────────────────

/**
 * Assign rankings to reports within each class
 * @param {Array} reports - The reports to rank
 * @returns {Array} Reports with rankings assigned
 */
function assignRankings(reports) {
  // Group by class
  const byClass = {};
  for (const r of reports) {
    const key = r.classId || 'unknown';
    if (!byClass[key]) {
      byClass[key] = [];
    }
    byClass[key].push(r);
  }

  // Sort and rank each class
  for (const classId in byClass) {
    const classReports = byClass[classId];

    // Sort by overall percentage descending
    classReports.sort((a, b) => {
      if (b.overallPercentage !== a.overallPercentage) {
        return b.overallPercentage - a.overallPercentage;
      }
      // Tie-break by name
      return (a.studentName || '').localeCompare(b.studentName || '');
    });

    // Assign ranks with tie handling
    let rank = 1;
    let previousPct = null;
    let skipped = 0;

    for (let i = 0; i < classReports.length; i++) {
      const r = classReports[i];
      const currentPct = r.overallPercentage;

      if (previousPct !== null && currentPct !== previousPct) {
        rank = i + 1 - skipped;
      } else if (previousPct !== null && currentPct === previousPct) {
        skipped++;
      }

      r.position = rank;
      r.classSize = classReports.length;
      r.rankDisplay = getRankDisplay(rank, classReports.length);

      previousPct = currentPct;
    }
  }

  return reports;
}

/**
 * Get a human-readable rank display
 * @param {number} rank - The rank position
 * @param {number} total - Total students in class
 * @returns {string} Rank display string
 */
function getRankDisplay(rank, total) {
  if (!rank || !total) return '—';

  let suffix = 'th';
  if (rank === 1) suffix = 'st';
  else if (rank === 2) suffix = 'nd';
  else if (rank === 3) suffix = 'rd';

  // Ordinal
  const ordinal = `${rank}${suffix}`;

  // For French (Nursery) — simplified
  // The main thread will handle language-specific formatting

  return `${ordinal} of ${total}`;
}

// ──────────────────────────────────────────────────────────────────────
//  BATCH PROCESSING
// ──────────────────────────────────────────────────────────────────────

/**
 * Process a batch of students
 * @param {Array} students - List of students
 * @param {object} marksByStudent - Marks keyed by student ID
 * @param {Array} gradeBands - Grading scale
 * @param {number} passMark - Passing threshold
 * @param {object} options - Additional options
 * @returns {Array} Processed reports
 */
function processBatch(students, marksByStudent, gradeBands, passMark, options = {}) {
  const reports = [];
  const total = students.length;

  for (let i = 0; i < total; i++) {
    const student = students[i];
    const marks = marksByStudent[student.id] || {};

    // Compute report
    const report = computeStudentReport(
      student,
      marks,
      gradeBands,
      passMark,
      options
    );

    reports.push(report);

    // Send progress update
    self.postMessage({
      type: 'PROGRESS',
      payload: {
        done: i + 1,
        total: total,
        currentStudent: student.name || student.first_name || `Student ${student.id}`
      }
    });
  }

  // Assign rankings
  assignRankings(reports);

  return reports;
}

// ──────────────────────────────────────────────────────────────────────
//  MESSAGE HANDLER
// ──────────────────────────────────────────────────────────────────────

/**
 * Handle incoming messages from the main thread
 */
self.onmessage = function (e) {
  const { type, payload } = e.data || {};

  if (type !== 'GENERATE_BATCH') {
    self.postMessage({
      type: 'ERROR',
      payload: {
        message: `Unknown message type: ${type}. Expected GENERATE_BATCH.`
      }
    });
    return;
  }

  try {
    const {
      students,
      marksByStudent,
      gradeBands,
      passMark,
      options = {}
    } = payload || {};

    // Validate input
    if (!students || !Array.isArray(students) || students.length === 0) {
      self.postMessage({
        type: 'ERROR',
        payload: {
          message: 'Invalid or empty students array provided.'
        }
      });
      return;
    }

    if (!marksByStudent || typeof marksByStudent !== 'object') {
      self.postMessage({
        type: 'ERROR',
        payload: {
          message: 'Invalid marksByStudent object provided.'
        }
      });
      return;
    }

    const effectivePassMark = passMark ?? 50;
    const effectiveGradeBands = gradeBands && gradeBands.length > 0
      ? gradeBands
      : null;

    // Process the batch
    const reports = processBatch(
      students,
      marksByStudent,
      effectiveGradeBands,
      effectivePassMark,
      options
    );

    // Send completion with results
    self.postMessage({
      type: 'COMPLETE',
      payload: {
        reports: reports,
        summary: {
          total: reports.length,
          passed: reports.filter(r => r.isPassing).length,
          failed: reports.filter(r => !r.isPassing).length,
          promoted: reports.filter(r => r.promoted).length,
          remedial: reports.filter(r => r.decision === 'remedial').length,
          classCount: new Set(reports.map(r => r.classId)).size
        }
      }
    });

  } catch (err) {
    // Send error back to main thread
    self.postMessage({
      type: 'ERROR',
      payload: {
        message: err?.message || 'Unknown error occurred during report generation.',
        stack: err?.stack || null
      }
    });
  }
};

// ──────────────────────────────────────────────────────────────────────
//  SELF-TEST (optional — runs when worker is loaded)
// ──────────────────────────────────────────────────────────────────────

// Log that the worker is ready (only visible in worker console)
console.log('[Report Worker] Ready for batch report generation.');

// ──────────────────────────────────────────────────────────────────────
//  EXPOSE HELPERS (for debugging in worker console)
// ──────────────────────────────────────────────────────────────────────

// Make helpers available in the worker's global scope for debugging
self.getGrade = getGrade;
self.getGradeClass = getGradeClass;
self.isPassing = isPassing;
self.roundTo = roundTo;
self.computeStudentReport = computeStudentReport;
self.assignRankings = assignRankings;
self.getRankDisplay = getRankDisplay;
self.processBatch = processBatch;