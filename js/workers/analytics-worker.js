/* ═══════════════════════════════════════════════════════════════════
   js/workers/analytics-worker.js — Analytics computation
   ═══════════════════════════════════════════════════════════════════
   Crunches the numbers behind css/modules/analytics.css and
   statistics.css screens (grade distributions, subject/class averages,
   trend lines over terms) so a school-wide recompute doesn't stall the
   UI thread. The main thread hands over raw marks records; this
   returns ready-to-chart aggregates for js/ui/charts.js to draw.

   Incoming message:
     { type: 'COMPUTE_DISTRIBUTION', payload: { marks: [{score}], gradeBands } }
     { type: 'COMPUTE_SUBJECT_AVERAGES', payload: { marksBySubject: { [subjectId]: [scores] } } }
     { type: 'COMPUTE_TREND', payload: { seriesByTerm: { [term]: [scores] } } }
     { type: 'COMPUTE_CLASS_STATS', payload: { marksByClass: { [classId]: [scores] } } }
     { type: 'COMPUTE_STUDENT_RANKINGS', payload: { students: [{id, scores}], classSize } }
     { type: 'COMPUTE_PASS_RATE', payload: { marks: [{score}], passMark } }

   Outgoing:
     { type: 'RESULT', payload: <shape depends on request>, requestType: <type> }
     { type: 'ERROR', payload: { message } }

   Last updated: 2026-07-13
   ═══════════════════════════════════════════════════════════════════ */

/* ═══════════════════════════════════════════════════════════════════
   UTILITY FUNCTIONS
   ═══════════════════════════════════════════════════════════════════ */

/**
 * Calculate the mean (average) of an array of numbers
 * @param {number[]} values - Array of numbers
 * @returns {number} The mean value
 */
function mean(values) {
  if (!values || values.length === 0) return 0;
  const sum = values.reduce((a, b) => a + b, 0);
  return sum / values.length;
}

/**
 * Calculate the median of an array of numbers
 * @param {number[]} values - Array of numbers
 * @returns {number} The median value
 */
function median(values) {
  if (!values || values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

/**
 * Calculate the standard deviation of an array of numbers
 * @param {number[]} values - Array of numbers
 * @returns {number} The standard deviation
 */
function standardDeviation(values) {
  if (!values || values.length < 2) return 0;
  const avg = mean(values);
  const squaredDiffs = values.map(v => (v - avg) ** 2);
  const variance = mean(squaredDiffs);
  return Math.sqrt(variance);
}

/**
 * Calculate the min and max of an array of numbers
 * @param {number[]} values - Array of numbers
 * @returns {object} { min, max }
 */
function minMax(values) {
  if (!values || values.length === 0) {
    return { min: 0, max: 0 };
  }
  return {
    min: Math.min(...values),
    max: Math.max(...values)
  };
}

/**
 * Calculate the percentile of a value in an array
 * @param {number[]} values - Array of numbers
 * @param {number} value - The value to find percentile for
 * @returns {number} The percentile (0-100)
 */
function percentile(values, value) {
  if (!values || values.length === 0) return 0;
  const countBelow = values.filter(v => v < value).length;
  return (countBelow / values.length) * 100;
}

/**
 * Round a number to a specified number of decimal places
 * @param {number} num - The number to round
 * @param {number} decimals - Number of decimal places
 * @returns {number} The rounded number
 */
function round(num, decimals = 2) {
  const factor = Math.pow(10, decimals);
  return Math.round(num * factor) / factor;
}

/* ═══════════════════════════════════════════════════════════════════
   COMPUTATION FUNCTIONS
   ═══════════════════════════════════════════════════════════════════ */

/**
 * Compute grade distribution from marks
 * @param {Array} marks - Array of { score } objects
 * @param {Array} gradeBands - Array of { letter, min, max, color }
 * @returns {Array} Grade distribution with counts and percentages
 */
function computeDistribution(marks, gradeBands) {
  if (!marks || marks.length === 0) {
    return gradeBands.map(b => ({
      letter: b.letter,
      count: 0,
      percentage: 0,
      color: b.color || '#6b5f56'
    }));
  }

  const counts = Object.fromEntries(gradeBands.map(b => [b.letter, 0]));
  const scores = marks.map(m => m.score).filter(s => s !== null && s !== undefined);

  scores.forEach(score => {
    const band = gradeBands.find(b => score >= b.min && score <= b.max);
    if (band) {
      counts[band.letter] = (counts[band.letter] || 0) + 1;
    }
  });

  const total = scores.length || 1;

  return gradeBands.map(b => ({
    letter: b.letter,
    count: counts[b.letter] || 0,
    percentage: round((counts[b.letter] || 0) / total * 100, 1),
    color: b.color || '#6b5f56',
    min: b.min,
    max: b.max
  }));
}

/**
 * Compute subject averages from marks grouped by subject
 * @param {object} marksBySubject - { [subjectId]: [scores] }
 * @returns {Array} Subject statistics
 */
function computeSubjectAverages(marksBySubject) {
  if (!marksBySubject || Object.keys(marksBySubject).length === 0) {
    return [];
  }

  return Object.entries(marksBySubject)
    .map(([subjectId, scores]) => {
      const validScores = scores.filter(s => s !== null && s !== undefined);
      const { min, max } = minMax(validScores);
      return {
        subjectId: subjectId,
        average: round(mean(validScores), 2),
        median: round(median(validScores), 2),
        stdDev: round(standardDeviation(validScores), 2),
        count: validScores.length,
        min: round(min, 2),
        max: round(max, 2),
        total: validScores.reduce((a, b) => a + b, 0)
      };
    })
    .sort((a, b) => b.average - a.average);
}

/**
 * Compute trend data from marks grouped by term
 * @param {object} seriesByTerm - { [term]: [scores] }
 * @returns {Array} Trend data with averages per term
 */
function computeTrend(seriesByTerm) {
  if (!seriesByTerm || Object.keys(seriesByTerm).length === 0) {
    return [];
  }

  return Object.entries(seriesByTerm)
    .map(([term, scores]) => {
      const validScores = scores.filter(s => s !== null && s !== undefined);
      return {
        term: term,
        average: round(mean(validScores), 2),
        median: round(median(validScores), 2),
        count: validScores.length,
        stdDev: round(standardDeviation(validScores), 2),
        min: round(minMax(validScores).min, 2),
        max: round(minMax(validScores).max, 2)
      };
    })
    .sort((a, b) => {
      // Sort by term order if possible
      const termOrder = ['Term 1', 'Term 2', 'Term 3', 'Annual'];
      const aIdx = termOrder.indexOf(a.term);
      const bIdx = termOrder.indexOf(b.term);
      if (aIdx !== -1 && bIdx !== -1) return aIdx - bIdx;
      return a.term.localeCompare(b.term);
    });
}

/**
 * Compute class statistics from marks grouped by class
 * @param {object} marksByClass - { [classId]: [scores] }
 * @returns {Array} Class statistics
 */
function computeClassStats(marksByClass) {
  if (!marksByClass || Object.keys(marksByClass).length === 0) {
    return [];
  }

  return Object.entries(marksByClass)
    .map(([classId, scores]) => {
      const validScores = scores.filter(s => s !== null && s !== undefined);
      const { min, max } = minMax(validScores);
      return {
        classId: classId,
        average: round(mean(validScores), 2),
        median: round(median(validScores), 2),
        stdDev: round(standardDeviation(validScores), 2),
        count: validScores.length,
        min: round(min, 2),
        max: round(max, 2),
        total: validScores.reduce((a, b) => a + b, 0)
      };
    })
    .sort((a, b) => b.average - a.average);
}

/**
 * Compute student rankings
 * @param {Array} students - Array of { id, scores } objects
 * @param {number} classSize - Total number of students in the class
 * @returns {Array} Ranked students
 */
function computeStudentRankings(students, classSize) {
  if (!students || students.length === 0) {
    return [];
  }

  const ranked = students.map(student => {
    const validScores = student.scores.filter(s => s !== null && s !== undefined);
    const average = mean(validScores);
    return {
      id: student.id,
      name: student.name || 'Unknown',
      average: round(average, 2),
      count: validScores.length,
      total: validScores.reduce((a, b) => a + b, 0)
    };
  });

  // Sort by average descending
  ranked.sort((a, b) => b.average - a.average);

  // Assign ranks with tie handling
  let currentRank = 1;
  let previousAverage = null;
  let skipCount = 0;

  ranked.forEach((student, index) => {
    if (previousAverage !== null && student.average !== previousAverage) {
      currentRank += skipCount + 1;
      skipCount = 0;
    } else if (index > 0) {
      skipCount++;
    }

    student.rank = currentRank;
    student.rankDisplay = `${currentRank} of ${classSize || ranked.length}`;
    previousAverage = student.average;
  });

  return ranked;
}

/**
 * Compute pass rate from marks
 * @param {Array} marks - Array of { score } objects
 * @param {number} passMark - The passing threshold (e.g., 50)
 * @returns {object} Pass rate statistics
 */
function computePassRate(marks, passMark = 50) {
  if (!marks || marks.length === 0) {
    return {
      total: 0,
      passed: 0,
      failed: 0,
      passRate: 0,
      failRate: 0
    };
  }

  const scores = marks.map(m => m.score).filter(s => s !== null && s !== undefined);
  const total = scores.length;
  const passed = scores.filter(s => s >= passMark).length;
  const failed = total - passed;

  return {
    total: total,
    passed: passed,
    failed: failed,
    passRate: round((passed / total) * 100, 2),
    failRate: round((failed / total) * 100, 2),
    passMark: passMark
  };
}

/**
 * Compute grade point average (GPA) from marks
 * @param {Array} marks - Array of { score } objects
 * @param {Array} gradeBands - Array of { letter, min, max, gpaValue }
 * @returns {object} GPA statistics
 */
function computeGPA(marks, gradeBands) {
  if (!marks || marks.length === 0) {
    return {
      gpa: 0,
      totalCredits: 0,
      gradePoints: 0
    };
  }

  const scores = marks.map(m => m.score).filter(s => s !== null && s !== undefined);
  let totalGradePoints = 0;

  scores.forEach(score => {
    const band = gradeBands.find(b => score >= b.min && score <= b.max);
    if (band && band.gpaValue !== undefined) {
      totalGradePoints += band.gpaValue;
    }
  });

  const avgGPA = scores.length > 0 ? totalGradePoints / scores.length : 0;

  return {
    gpa: round(avgGPA, 2),
    totalCredits: scores.length,
    gradePoints: round(totalGradePoints, 2),
    maxGPA: 4.0
  };
}

/* ═══════════════════════════════════════════════════════════════════
   MESSAGE HANDLER
   ═══════════════════════════════════════════════════════════════════ */

self.onmessage = function (e) {
  const { type, payload, id } = e.data;

  try {
    let result;
    let requestType = type;

    switch (type) {
      case 'COMPUTE_DISTRIBUTION':
        result = computeDistribution(payload.marks, payload.gradeBands);
        break;

      case 'COMPUTE_SUBJECT_AVERAGES':
        result = computeSubjectAverages(payload.marksBySubject);
        break;

      case 'COMPUTE_TREND':
        result = computeTrend(payload.seriesByTerm);
        break;

      case 'COMPUTE_CLASS_STATS':
        result = computeClassStats(payload.marksByClass);
        break;

      case 'COMPUTE_STUDENT_RANKINGS':
        result = computeStudentRankings(payload.students, payload.classSize);
        break;

      case 'COMPUTE_PASS_RATE':
        result = computePassRate(payload.marks, payload.passMark);
        break;

      case 'COMPUTE_GPA':
        result = computeGPA(payload.marks, payload.gradeBands);
        break;

      default:
        self.postMessage({
          type: 'ERROR',
          payload: { message: `Unknown analytics request: ${type}` },
          id: id
        });
        return;
    }

    self.postMessage({
      type: 'RESULT',
      payload: result,
      requestType: requestType,
      id: id
    });

  } catch (err) {
    self.postMessage({
      type: 'ERROR',
      payload: { message: err?.message || 'Analytics computation failed' },
      id: id
    });
  }
};

/* ═══════════════════════════════════════════════════════════════════
   ERROR HANDLING FOR UNCAUGHT ERRORS
   ═══════════════════════════════════════════════════════════════════ */

self.onerror = function (error) {
  self.postMessage({
    type: 'ERROR',
    payload: { message: error.message || 'Worker encountered an error' }
  });
};

/* ═══════════════════════════════════════════════════════════════════
   EXPOSE FUNCTIONS FOR TESTING (in non-worker environments)
   ═══════════════════════════════════════════════════════════════════ */

// These are only available when this file is loaded as a module
// (for testing purposes). In the worker context, they're not needed.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    mean,
    median,
    standardDeviation,
    minMax,
    percentile,
    round,
    computeDistribution,
    computeSubjectAverages,
    computeTrend,
    computeClassStats,
    computeStudentRankings,
    computePassRate,
    computeGPA
  };
}