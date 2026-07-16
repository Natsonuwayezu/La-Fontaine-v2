/* ═══════════════════════════════════════════════════════════════════
   tests/offline-tests.js
   ═══════════════════════════════════════════════════════════════════
   Tests for js/core/offline.js's IndexedDB-based offline queue for
   marks and payments. Uses fake-indexeddb (configured in
   jest.config.js's setupFiles) to exercise the real IndexedDB code
   path — no mocking of openOfflineDB/idbAdd/etc. themselves.
   ═══════════════════════════════════════════════════════════════════ */

const { loadScripts } = require('./helpers/load-scripts');

beforeAll(() => {
    loadScripts([
        'js/config/constants.js',
        'js/core/utils.js',
        'js/core/state.js',
        'js/core/offline.js',
    ]);
});

describe('queueMarksOffline / getPendingCount', () => {
    test('a fresh database has zero pending items', async () => {
        expect(await getPendingCount()).toBe(0);
    });

    test('queuing marks increases the pending count', async () => {
        const before = await getPendingCount();
        await queueMarksOffline([
            { assessment_id: 'a1', student_id: 's1', score: 45 },
            { assessment_id: 'a1', student_id: 's2', score: 38 },
        ]);
        const after = await getPendingCount();
        expect(after).toBe(before + 2);
    });

    test('queuing an empty array does not throw and does not add anything', async () => {
        const before = await getPendingCount();
        await expect(queueMarksOffline([])).resolves.toBeUndefined();
        expect(await getPendingCount()).toBe(before);
    });
});

describe('queuePaymentOffline / getPendingCount', () => {
    test('queuing a payment increases the pending count', async () => {
        const before = await getPendingCount();
        await queuePaymentOffline({ student_id: 's1', amount: 20000, method: 'cash' });
        expect(await getPendingCount()).toBe(before + 1);
    });
});

describe('cacheStudentsLocally / getCachedStudents', () => {
    test('with no students in state, nothing is cached', async () => {
        state.students = [];
        await cacheStudentsLocally();
        expect(await getCachedStudents()).toEqual([]);
    });

    test('caches the current students list and reads it back', async () => {
        state.students = [
            { id: 'stu-1', first_name: 'Aline', last_name: 'Uwase' },
            { id: 'stu-2', first_name: 'Eric', last_name: 'Niyonzima' },
        ];
        await cacheStudentsLocally();
        const cached = await getCachedStudents();
        expect(cached).toHaveLength(2);
        expect(cached.map(s => s.id).sort()).toEqual(['stu-1', 'stu-2']);
    });

    test('re-caching replaces the previous cache rather than appending to it', async () => {
        state.students = [{ id: 'stu-only', first_name: 'Solo', last_name: 'Student' }];
        await cacheStudentsLocally();
        const cached = await getCachedStudents();
        expect(cached).toHaveLength(1);
        expect(cached[0].id).toBe('stu-only');
    });
});
