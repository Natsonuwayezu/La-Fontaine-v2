/* ═══════════════════════════════════════════════════════════════════
   tests/marks-entry-tests.js
   ═══════════════════════════════════════════════════════════════════
   Tests for js/modules/academics/marks-entry.js's real-data logic —
   buildRoster() (joining state.students + state.marks into the
   per-assessment roster) and the grade/status helpers — added when
   this file was rewritten from a MOCK_DATA stub whose "Save" button
   never actually persisted anything to real backing coverage.
   ═══════════════════════════════════════════════════════════════════ */

const { loadScripts } = require('./helpers/load-scripts');

// buildRoster()/getGrade()/getStatus() all read the module's internal
// `currentAssessment`, which is set by renderMarksEntry() as a side
// effect of a real DOM render (container.innerHTML, chart creation,
// etc.) rather than being a pure function of its arguments — exercising
// the full render path isn't practical in this jsdom+eval test harness
// (Chart.js, #modalOverlay lookups, etc.), and a second, separate
// eval() call from this test file wouldn't share the same let-binding
// scope as the one loadScripts already created (see that helper's own
// header comment). The parts of the logic that don't depend on
// currentAssessment are covered directly below; the roster-join and
// score-percentage logic itself was verified by hand against the real
// state.students/state.marks shapes during the rewrite.

beforeAll(() => {
    loadScripts([
        'js/config/constants.js',
        'js/core/utils.js',
        'js/core/state.js',
        'js/core/sanitizers.js',
        'js/core/validators.js',
        'js/modules/academics/marks-entry.js',
    ]);
});

describe('getGrade / getStatus — paths that do not depend on currentAssessment', () => {
    test('a null or undefined score has no grade', () => {
        expect(getGrade(null).grade).toBe('—');
        expect(getGrade(undefined).grade).toBe('—');
    });

    test('an absent student is reported as Absent regardless of score', () => {
        expect(getStatus(0, true).label).toBe('Absent');
        expect(getStatus(null, true).label).toBe('Absent');
    });
});

describe('validateMarkValue integration (shared with core/validators.js)', () => {
    test('an empty string is valid (not yet entered)', () => {
        expect(validateMarkValue('', 50).valid).toBe(true);
    });
    test('a score above max_score is flagged OVER_MAX, matching the popup this file shows', () => {
        expect(validateMarkValue(60, 50).issue).toBe('OVER_MAX');
    });
});
