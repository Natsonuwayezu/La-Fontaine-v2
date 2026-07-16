/* ═══════════════════════════════════════════════════════════════════
   tests/performance-tests.js
   ═══════════════════════════════════════════════════════════════════
   Tests for teacher-performance metrics: calcCompletionRate() from
   core/academic-formulas.js (used by staff/teacher-performance.js to
   show assessment-completion rate per teacher), plus class-average
   and ranking calculations that feed the same performance view.
   ═══════════════════════════════════════════════════════════════════ */

const { loadScripts } = require('./helpers/load-scripts');

beforeAll(() => {
    loadScripts([
        'js/config/constants.js',
        'js/core/utils.js',
        'js/core/state.js',
        'js/core/formulas.js',
        'js/core/academic-formulas.js',
    ]);
});

describe('calcCompletionRate', () => {
    const termId = 'term-1';

    test('a teacher with no assessments this term gets a neutral 100%, not a penalty', () => {
        const result = calcCompletionRate('t1', termId, [], []);
        expect(result).toEqual({ completed: 0, total: 0, pct: 100 });
    });

    test('marks entered for every assessment gives 100% completion', () => {
        const assessments = [
            { id: 'a1', created_by: 't1', term_id: termId },
            { id: 'a2', created_by: 't1', term_id: termId },
        ];
        const marks = [
            { assessment_id: 'a1', score: 45 },
            { assessment_id: 'a2', score: 38 },
        ];
        const result = calcCompletionRate('t1', termId, assessments, marks);
        expect(result).toEqual({ completed: 2, total: 2, pct: 100 });
    });

    test('partially entered marks give a proportional completion rate', () => {
        const assessments = [
            { id: 'a1', created_by: 't1', term_id: termId },
            { id: 'a2', created_by: 't1', term_id: termId },
            { id: 'a3', created_by: 't1', term_id: termId },
            { id: 'a4', created_by: 't1', term_id: termId },
        ];
        const marks = [{ assessment_id: 'a1', score: 20 }];
        const result = calcCompletionRate('t1', termId, assessments, marks);
        expect(result).toEqual({ completed: 1, total: 4, pct: 25 });
    });

    test('an assessment with only null/undefined scores does not count as completed', () => {
        const assessments = [{ id: 'a1', created_by: 't1', term_id: termId }];
        const marks = [{ assessment_id: 'a1', score: null }, { assessment_id: 'a1', score: undefined }];
        const result = calcCompletionRate('t1', termId, assessments, marks);
        expect(result.completed).toBe(0);
    });

    test('only counts assessments belonging to this teacher and this term', () => {
        const assessments = [
            { id: 'a1', created_by: 't1', term_id: termId },
            { id: 'a2', created_by: 't2', term_id: termId },      // different teacher
            { id: 'a3', created_by: 't1', term_id: 'other-term' }, // different term
        ];
        const marks = [{ assessment_id: 'a1', score: 10 }, { assessment_id: 'a2', score: 10 }, { assessment_id: 'a3', score: 10 }];
        const result = calcCompletionRate('t1', termId, assessments, marks);
        expect(result.total).toBe(1);
        expect(result.completed).toBe(1);
    });
});

describe('rankStudents (used for class-average context on the performance page)', () => {
    test('produces a stable ranking that can be used to derive a class average', () => {
        const students = [
            { id: 1, first_name: 'A', last_name: 'A', total: 60 },
            { id: 2, first_name: 'B', last_name: 'B', total: 80 },
            { id: 3, first_name: 'C', last_name: 'C', total: 70 },
        ];
        const ranked = rankStudents(students);
        const avg = ranked.reduce((sum, s) => sum + s.total, 0) / ranked.length;
        expect(avg).toBeCloseTo(70);
        expect(ranked[0].total).toBe(80); // highest total ranks first
    });
});
