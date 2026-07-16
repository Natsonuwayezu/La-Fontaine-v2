/* ═══════════════════════════════════════════════════════════════════
   tests/marks-tests.js
   ═══════════════════════════════════════════════════════════════════
   Tests for js/core/formulas.js — grade lookup, pass/fail, promotion
   decisions, and student ranking — and the mark-value validation used
   by js/modules/academics/marks-entry.js. academic-formulas.js's
   completion-rate logic is covered separately in performance-tests.js.
   ═══════════════════════════════════════════════════════════════════ */

const { loadScripts } = require('./helpers/load-scripts');

beforeAll(() => {
    loadScripts([
        'js/config/constants.js',
        'js/core/utils.js',
        'js/core/state.js',
        'js/core/formulas.js',
        'js/core/sanitizers.js',
        'js/core/validators.js',
    ]);
});

beforeEach(() => {
    // Reset to the DB-empty fallback path (DEFAULT_GRADES / SCHOOL_DEFAULTS.pass_mark)
    state.gradingScale = [];
    state.schoolSettings = {};
});

describe('getGrade / getGradeBand (DEFAULT_GRADES fallback)', () => {
    test('returns the correct letter grade for a high score', () => {
        expect(getGrade(95)).not.toBe('—');
        expect(getGrade(95)).not.toBe('F');
    });

    test('returns F for a very low score', () => {
        expect(getGrade(5)).toBe('F');
    });

    test('returns — for a null/invalid percentage', () => {
        expect(getGrade(null)).toBe('—');
        expect(getGrade(undefined)).toBe('—');
        expect(getGrade('not a number')).toBe('—');
    });

    test('a custom DB grading scale overrides the default', () => {
        state.gradingScale = [
            { grade: 'CUSTOM-TOP', min: 90, max: 100 },
            { grade: 'CUSTOM-LOW', min: 0, max: 89.99 },
        ];
        expect(getGrade(95)).toBe('CUSTOM-TOP');
        expect(getGrade(50)).toBe('CUSTOM-LOW');
    });
});

describe('isPassing / isPassingScore', () => {
    test('uses the default pass mark (50) when no school setting is configured', () => {
        expect(isPassing(50)).toBe(true);
        expect(isPassing(49)).toBe(false);
    });

    test('respects a custom pass mark from school settings', () => {
        state.schoolSettings.pass_mark = '60';
        expect(isPassing(55)).toBe(false);
        expect(isPassing(65)).toBe(true);
    });

    test('isPassingScore converts a raw score/max to a percentage first', () => {
        expect(isPassingScore(30, 50)).toBe(true);  // 60%
        expect(isPassingScore(20, 50)).toBe(false); // 40%
    });

    test('isPassingScore is false for a zero or missing max score', () => {
        expect(isPassingScore(10, 0)).toBe(false);
    });
});

describe('rankStudents', () => {
    test('ranks by total descending, alphabetically tie-broken', () => {
        const students = [
            { id: 1, first_name: 'Zed', last_name: 'Zulu', total: 80 },
            { id: 2, first_name: 'Amy', last_name: 'Alpha', total: 90 },
            { id: 3, first_name: 'Bob', last_name: 'Beta', total: 90 },
        ];
        const ranked = rankStudents(students);
        expect(ranked[0].id).toBe(2); // Amy — tied for 1st, wins alphabetically
        expect(ranked[0].rank).toBe(1);
        expect(ranked[1].id).toBe(3); // Bob — tied for 1st too
        expect(ranked[1].rank).toBe(1);
        expect(ranked[2].id).toBe(1); // Zed — 3rd, ranks skip to 3 after the tie
        expect(ranked[2].rank).toBe(3);
    });

    test('returns an empty array for no students', () => {
        expect(rankStudents([])).toEqual([]);
        expect(rankStudents(null)).toEqual([]);
    });
});

describe('getPromotionDecision', () => {
    test('a high annual percentage is promoted', () => {
        expect(getPromotionDecision(75).decision).toBe('PROMOTED');
    });
    test('a very low annual percentage is repeated', () => {
        expect(getPromotionDecision(20).decision).toBe('REPEATED');
    });
});

describe('validateMarkValue (marks-entry.js input validation)', () => {
    test('accepts an empty value as "not yet entered"', () => {
        expect(validateMarkValue('', 100).valid).toBe(true);
    });
    test('rejects a score above the assessment maximum', () => {
        expect(validateMarkValue(120, 100).issue).toBe('OVER_MAX');
    });
});
