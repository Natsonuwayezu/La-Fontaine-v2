/* ═══════════════════════════════════════════════════════════════════
   tests/finance-tests.js
   ═══════════════════════════════════════════════════════════════════
   Tests for js/core/finance-formulas.js — fee balances, waivers,
   FIFO payment allocation, and credit balance application. All pure
   functions, no DB access.
   ═══════════════════════════════════════════════════════════════════ */

const { loadScripts } = require('./helpers/load-scripts');

beforeAll(() => {
    loadScripts([
        'js/config/constants.js',
        'js/core/utils.js',
        'js/core/finance-formulas.js',
    ]);
});

describe('computeStudentFeeSummary', () => {
    test('sums fees, waivers, and payments into a correct balance', () => {
        const fees = [
            { amount: 50000, waived_amount: 0, paid_amount: 30000 },
            { amount: 20000, waived_amount: 5000, paid_amount: 0 },
        ];
        const summary = computeStudentFeeSummary(fees, 0);
        expect(summary.total).toBe(70000);
        expect(summary.waived).toBe(5000);
        expect(summary.effective).toBe(65000);
        expect(summary.paid).toBe(30000);
        expect(summary.balance).toBe(35000);
        expect(summary.outstanding).toBe(35000);
        expect(summary.isFullyPaid).toBe(false);
    });

    test('a credit balance reduces outstanding but not the underlying balance', () => {
        const fees = [{ amount: 50000, waived_amount: 0, paid_amount: 20000 }];
        const summary = computeStudentFeeSummary(fees, 30000);
        expect(summary.balance).toBe(30000);
        expect(summary.outstanding).toBe(0);
        expect(summary.isFullyPaid).toBe(true);
        expect(summary.hasCredit).toBe(true);
    });

    test('an empty fee list is fully paid with zero balance', () => {
        const summary = computeStudentFeeSummary([], 0);
        expect(summary.total).toBe(0);
        expect(summary.isFullyPaid).toBe(true);
    });
});

describe('computeFeeBalance', () => {
    test('computes remaining balance for a single fee row', () => {
        const result = computeFeeBalance({ amount: 10000, waived_amount: 2000, paid_amount: 3000 });
        expect(result.effective).toBe(8000);
        expect(result.remaining).toBe(5000);
        expect(result.isFullyPaid).toBe(false);
    });

    test('a fee flagged is_paid is fully paid even if the math says otherwise', () => {
        const result = computeFeeBalance({ amount: 10000, waived_amount: 0, paid_amount: 0, is_paid: true });
        expect(result.isFullyPaid).toBe(true);
    });
});

describe('computeWaiver', () => {
    test('a full waiver zeroes out the effective amount', () => {
        const result = computeWaiver(15000, 'full');
        expect(result.waivedAmount).toBe(15000);
        expect(result.effectiveAmount).toBe(0);
    });

    test('a percentage waiver is calculated and rounded correctly', () => {
        const result = computeWaiver(10000, 'percentage', 25);
        expect(result.waivedAmount).toBe(2500);
        expect(result.effectiveAmount).toBe(7500);
    });

    test('a percentage waiver clamps to 100% even if given a larger value', () => {
        const result = computeWaiver(10000, 'percentage', 500);
        expect(result.waivedAmount).toBe(10000);
    });

    test('a partial waiver cannot exceed the original fee amount', () => {
        const result = computeWaiver(5000, 'partial', 999999);
        expect(result.waivedAmount).toBe(5000);
        expect(result.effectiveAmount).toBe(0);
    });
});

describe('applyCreditBalance', () => {
    test('applies credit to the oldest fees first (FIFO)', () => {
        const fees = [
            { id: 'f1', amount: 10000, waived_amount: 0, paid_amount: 0, created_at: '2026-01-01' },
            { id: 'f2', amount: 10000, waived_amount: 0, paid_amount: 0, created_at: '2026-02-01' },
        ];
        const result = applyCreditBalance(15000, fees);
        expect(result.feesCovered).toEqual(['f1']);
        expect(result.partial).toEqual({ feeId: 'f2', amountFromCredit: 5000 });
        expect(result.creditRemaining).toBe(0);
    });

    test('leftover credit is reported when it covers everything owed', () => {
        const fees = [{ id: 'f1', amount: 5000, waived_amount: 0, paid_amount: 0, created_at: '2026-01-01' }];
        const result = applyCreditBalance(20000, fees);
        expect(result.feesCovered).toEqual(['f1']);
        expect(result.creditRemaining).toBe(15000);
    });
});

describe('computeCollectionStats', () => {
    test('returns all zeros for an empty fee list', () => {
        const stats = computeCollectionStats([]);
        expect(stats.totalExpected).toBe(0);
        expect(stats.collectionRate).toBe(0);
    });
});
