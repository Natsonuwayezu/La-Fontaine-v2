/* ═══════════════════════════════════════════════════════════════════
   tests/timetable-tests.js
   ═══════════════════════════════════════════════════════════════════
   Tests for the timetable conflict-detection system: the low-level
   validateTimetableSlot() in validators.js, and the friendlier wrapper
   + batch pipeline in staff/timetable-conflicts.js (checkSlotConflicts,
   checkBatchConflicts) that staff/timetable.js, timetable-generator.js,
   and timetable-import.js all depend on.

   Note: staff/timetable.js, timetable-generator.js, and
   timetable-import.js are UI page files (DOM rendering + modals) and
   are exercised indirectly here through their shared logic layer
   rather than directly, since that logic layer is what's reused by
   all three of them.
   ═══════════════════════════════════════════════════════════════════ */

const { loadScripts } = require('./helpers/load-scripts');

beforeAll(() => {
    loadScripts([
        'js/config/constants.js',
        'js/core/utils.js',
        'js/core/sanitizers.js',
        'js/core/validators.js',
        'js/core/state.js',
        'js/modules/staff/teachers.js',
        'js/modules/staff/subjects.js',
        'js/modules/staff/timetable-conflicts.js',
        'js/modules/staff/timetable-import.js',
    ]);
});

beforeEach(() => {
    state.teachers = [
        { id: 't1', first_name: 'Jean', last_name: 'Uwimana' },
        { id: 't2', first_name: 'Alice', last_name: 'Mukamana' },
    ];
    state.subjects = [{ id: 's1', name: 'Mathematics', code: 'MATH' }];
});

describe('validateTimetableSlot (low-level)', () => {
    const existing = [
        { id: 1, class_id: 'c1', teacher_id: 't1', day_of_week: 1, period_number: 1 },
    ];

    test('flags a CLASS conflict when the same class already has a slot at that time', () => {
        const newSlot = { class_id: 'c1', teacher_id: 't2', day_of_week: 1, period_number: 1 };
        const conflicts = validateTimetableSlot(newSlot, existing);
        expect(conflicts.some(c => c.type === 'CLASS')).toBe(true);
    });

    test('flags a TEACHER conflict when the same teacher is double-booked', () => {
        const newSlot = { class_id: 'c2', teacher_id: 't1', day_of_week: 1, period_number: 1 };
        const conflicts = validateTimetableSlot(newSlot, existing);
        expect(conflicts.some(c => c.type === 'TEACHER')).toBe(true);
    });

    test('does not conflict on a different day or period', () => {
        expect(validateTimetableSlot(
            { class_id: 'c1', teacher_id: 't1', day_of_week: 2, period_number: 1 }, existing
        )).toHaveLength(0);
        expect(validateTimetableSlot(
            { class_id: 'c1', teacher_id: 't1', day_of_week: 1, period_number: 2 }, existing
        )).toHaveLength(0);
    });

    test('excludeId lets a slot be checked against itself when editing', () => {
        const editedSlot = { class_id: 'c1', teacher_id: 't1', day_of_week: 1, period_number: 1 };
        expect(validateTimetableSlot(editedSlot, existing, 1)).toHaveLength(0);
    });
});

describe('checkSlotConflicts (friendly wrapper)', () => {
    test('resolves a teacher conflict to a human-readable message with the teacher\'s name', async () => {
        const existing = [{ id: 1, class_id: 'c1', teacher_id: 't1', day_of_week: 1, period_number: 1 }];
        const newSlot = { class_id: 'c2', teacher_id: 't1', day_of_week: 1, period_number: 1 };

        const conflicts = await checkSlotConflicts(newSlot, existing);
        expect(conflicts).toHaveLength(1);
        expect(conflicts[0].type).toBe('TEACHER');
        expect(conflicts[0].message).toContain('Jean Uwimana');
    });

    test('returns no conflicts for a genuinely free slot', async () => {
        const conflicts = await checkSlotConflicts(
            { class_id: 'c1', teacher_id: 't1', day_of_week: 3, period_number: 4 }, []
        );
        expect(conflicts).toHaveLength(0);
    });
});

describe('checkBatchConflicts (used by timetable-generator.js and timetable-import.js)', () => {
    test('accepts a batch of slots with no conflicts among themselves or with existing data', async () => {
        const batch = [
            { class_id: 'c1', teacher_id: 't1', day_of_week: 1, period_number: 1 },
            { class_id: 'c2', teacher_id: 't2', day_of_week: 1, period_number: 1 },
        ];
        const { valid, invalid } = await checkBatchConflicts(batch, []);
        expect(valid).toHaveLength(2);
        expect(invalid).toHaveLength(0);
    });

    test('rejects only the conflicting rows within a batch, keeping the rest', async () => {
        const batch = [
            { class_id: 'c1', teacher_id: 't1', day_of_week: 1, period_number: 1 }, // ok
            { class_id: 'c1', teacher_id: 't2', day_of_week: 1, period_number: 1 }, // conflicts with row above (same class/slot)
            { class_id: 'c2', teacher_id: 't2', day_of_week: 2, period_number: 1 }, // ok
        ];
        const { valid, invalid } = await checkBatchConflicts(batch, []);
        expect(valid).toHaveLength(2);
        expect(invalid).toHaveLength(1);
    });

    test('checks the batch against already-saved slots too, not just against itself', async () => {
        const existing = [{ id: 99, class_id: 'c1', teacher_id: 't1', day_of_week: 1, period_number: 1 }];
        const batch = [{ class_id: 'c1', teacher_id: 't2', day_of_week: 1, period_number: 1 }];
        const { valid, invalid } = await checkBatchConflicts(batch, existing);
        expect(valid).toHaveLength(0);
        expect(invalid).toHaveLength(1);
    });
});

describe('renderConflictPanel', () => {
    test('renders nothing for an empty conflict list', () => {
        expect(renderConflictPanel([])).toBe('');
        expect(renderConflictPanel(null)).toBe('');
    });

    test('renders the conflict count and messages when there are conflicts', () => {
        const html = renderConflictPanel([
            { slot: { class_id: 'c1' }, conflicts: [{ message: 'Test conflict message' }] }
        ]);
        expect(html).toContain('conflict-panel');
        expect(html).toContain('Test conflict message');
    });
});

describe('CSV import row resolution (staff/timetable-import.js)', () => {
    beforeEach(() => {
        state.classes = [{ id: 'c1', code: 'P1A', name: 'Primary 1A' }];
        state.subjects = [{ id: 's1', code: 'MATH', name: 'Mathematics' }];
        state.teachers = [{ id: 't1', first_name: 'Jean', last_name: 'Uwimana', username: 'juwimana' }];
    });

    test('resolves valid codes to a proper slot object', () => {
        const { slot, error } = resolveImportRow({
            class_code: 'P1A', subject_code: 'MATH', teacher_username: 'juwimana',
            day: 'Monday', period_number: '1'
        });
        expect(error).toBeNull();
        expect(slot).toEqual({ class_id: 'c1', subject_id: 's1', teacher_id: 't1', day_of_week: 1, period_number: 1 });
    });

    test('reports a clear error for an unknown teacher username', () => {
        const { slot, error } = resolveImportRow({
            class_code: 'P1A', subject_code: 'MATH', teacher_username: 'nobody',
            day: 'Monday', period_number: '1'
        });
        expect(slot).toBeNull();
        expect(error).toContain('nobody');
    });

    test('parseTimetableCSV rejects a file missing required columns', () => {
        const { errors } = parseTimetableCSV('class_code,subject_code\nP1A,MATH');
        expect(errors.length).toBeGreaterThan(0);
    });

    test('parseTimetableCSV parses a well-formed file into row objects', () => {
        const csv = 'class_code,subject_code,teacher_username,day,period_number\nP1A,MATH,juwimana,Monday,1';
        const { rows, errors } = parseTimetableCSV(csv);
        expect(errors).toHaveLength(0);
        expect(rows).toHaveLength(1);
        expect(rows[0].class_code).toBe('P1A');
    });
});
