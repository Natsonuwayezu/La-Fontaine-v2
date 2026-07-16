/* ═══════════════════════════════════════════════════════════════════
   tests/attendance-tests.js
   ═══════════════════════════════════════════════════════════════════
   Tests for the attendance-rate and at-risk logic in core/formulas.js
   (computeAttendanceRate, countAttendance, getAttendanceRisk) and the
   ATTENDANCE_* constants they depend on.

   NOTE: js/modules/attendance/ (attendance-entry.js, attendance-
   reports.js, attendance-summary.js, attendance-analytics.js) is still
   completely empty — there is no UI or DB-backed module to test yet.
   These tests cover the pure calculation logic that already exists in
   formulas.js and that those modules will eventually be built on.
   ═══════════════════════════════════════════════════════════════════ */

const { loadScripts } = require('./helpers/load-scripts');

beforeAll(() => {
    loadScripts([
        'js/config/constants.js',
        'js/core/utils.js',
        'js/core/state.js',
        'js/core/formulas.js',
    ]);
});

describe('ATTENDANCE_* constants (exercised via countAttendance/computeAttendanceRate)', () => {
    test('all four status codes are recognized by countAttendance', () => {
        const counts = countAttendance([
            { status: 'P' }, { status: 'A' }, { status: 'L' }, { status: 'E' },
        ]);
        expect(counts).toEqual({ P: 1, A: 1, L: 1, E: 1, total: 4 });
    });
});

describe('computeAttendanceRate', () => {
    test('all present is a 100% rate', () => {
        expect(computeAttendanceRate({ P: 20, A: 0, L: 0, E: 0 })).toBe(100);
    });

    test('absences reduce the rate proportionally', () => {
        expect(computeAttendanceRate({ P: 15, A: 5, L: 0, E: 0 })).toBe(75);
    });

    test('late days count as half-present, per LATE_WEIGHT', () => {
        // 8 present + 2 late(*0.5=1) = 9 / 10 = 90%
        expect(computeAttendanceRate({ P: 8, A: 0, L: 2, E: 0 })).toBe(90);
    });

    test('excused absences count as fully present', () => {
        expect(computeAttendanceRate({ P: 18, A: 0, L: 0, E: 2 })).toBe(100);
    });

    test('zero total records returns 0, not NaN or a crash', () => {
        expect(computeAttendanceRate({ P: 0, A: 0, L: 0, E: 0 })).toBe(0);
    });
});

describe('countAttendance', () => {
    test('tallies a list of records by status code', () => {
        const records = [
            { status: 'P' }, { status: 'P' }, { status: 'A' }, { status: 'L' },
        ];
        const counts = countAttendance(records);
        expect(counts).toEqual({ P: 2, A: 1, L: 1, E: 0, total: 4 });
    });

    test('supports the alternate field name attendance_status', () => {
        const counts = countAttendance([{ attendance_status: 'P' }]);
        expect(counts.P).toBe(1);
    });

    test('ignores records with an unrecognized status rather than crashing', () => {
        const counts = countAttendance([{ status: 'UNKNOWN' }, { status: 'P' }]);
        expect(counts.total).toBe(1);
    });
});

describe('getAttendanceRisk', () => {
    test('below the AT_RISK threshold is flagged as at-risk', () => {
        const result = getAttendanceRisk(60);
        expect(result.risk).toBe(true);
        expect(result.label).toBe('At Risk');
    });

    test('between AT_RISK and WARNING thresholds is a warning, not at-risk', () => {
        const result = getAttendanceRisk(80);
        expect(result.risk).toBe(false);
        expect(result.warning).toBe(true);
    });

    test('above the WARNING threshold is good standing', () => {
        const result = getAttendanceRisk(95);
        expect(result.risk).toBe(false);
        expect(result.warning).toBe(false);
        expect(result.label).toBe('Good');
    });
});
