/* ═══════════════════════════════════════════════════════════════════
   js/core/finance-formulas.js
   ═══════════════════════════════════════════════════════════════════
   Purpose : All finance computation logic — pure functions only.
             Fee balance, FIFO allocation preview, credit deduction,
             waiver application, overdue severity, collection stats,
             and holiday fee separation.
             API writes (actual DB inserts) are in api.js.
   References: backend.txt Part 2.14-2.19, Part 4.10-4.12
   Load order: AFTER formulas.js and utils.js.
   ═══════════════════════════════════════════════════════════════════ */

'use strict';

/* ═══════════════════════════════════════════════════════════════════
   1. STUDENT FEE SUMMARY  (Part 4.10)
   ═══════════════════════════════════════════════════════════════════ */

/**
 * Compute the fee summary for one student:
 *   total    = sum of all student_fee amounts (before waivers)
 *   waived   = sum of waived amounts
 *   effective= total - waived (what they actually owe)
 *   paid     = sum of paid_amounts
 *   balance  = effective - paid (remaining to pay; negative = credit)
 *   credit   = any overpayment stored in student_credit_balance
 *   outstanding = max(0, balance - credit)
 *
 * @param {Array}  studentFees   - student_fee rows for this student+year
 * @param {number} creditBalance - from student_credit_balance table
 * @returns {{
 *   total, waived, effective, paid, balance, credit, outstanding,
 *   isFullyPaid: boolean, hasCredit: boolean
 * }}
 */
function computeStudentFeeSummary(studentFees, creditBalance = 0) {
    let total = 0;
    let waived = 0;
    let paid = 0;

    studentFees.forEach(fee => {
        total += Number(fee.amount || 0);
        waived += Number(fee.waived_amount || 0);
        paid += Number(fee.paid_amount || 0);
    });

    const effective = Math.max(0, total - waived);
    const balance = effective - paid;              // positive = still owes, negative = overpaid
    const credit = Number(creditBalance || 0);
    const outstanding = Math.max(0, balance - credit); // 0 if credit covers remaining

    return {
        total,
        waived,
        effective,
        paid,
        balance,
        credit,
        outstanding,
        isFullyPaid: outstanding <= 0,
        hasCredit: credit > 0 || balance < 0,
    };
}

/* ═══════════════════════════════════════════════════════════════════
   2. INDIVIDUAL FEE BALANCE  (Part 4.10)
   ═══════════════════════════════════════════════════════════════════ */

/**
 * Compute balance for a single student_fee row.
 * @param {Object} fee - student_fee row
 * @returns {{ amount, waived, effective, paid, remaining, isFullyPaid }}
 */
function computeFeeBalance(fee) {
    const amount = Number(fee.amount || 0);
    const waived = Number(fee.waived_amount || 0);
    const paid = Number(fee.paid_amount || 0);
    const effective = Math.max(0, amount - waived);
    const remaining = Math.max(0, effective - paid);

    return {
        amount,
        waived,
        effective,
        paid,
        remaining,
        isFullyPaid: remaining <= 0 || fee.is_paid === true || fee.is_waived === true,
    };
}

/* ═══════════════════════════════════════════════════════════════════
   3. FIFO ALLOCATION PREVIEW  (Part 4.11)
   ═══════════════════════════════════════════════════════════════════
   Before saving a payment to the DB, preview how it will be split
   across outstanding fees using First-In-First-Out.
   Returns the allocation plan without writing anything.
   ═══════════════════════════════════════════════════════════════════ */

/**
 * Preview FIFO allocation of a payment amount across unpaid fees.
 * Fees are ordered by created_at ASC (oldest first).
 *
 * @param {number} paymentAmount   - total payment in RWF
 * @param {Array}  unpaidFees      - student_fee rows sorted by created_at ASC
 * @param {number} [creditBalance] - existing credit to apply first
 * @returns {{
 *   allocations : Array<{ feeId, feeName, owed, allocated, remaining }>,
 *   totalAllocated : number,
 *   creditUsed   : number,
 *   creditAdded  : number,
 *   leftover     : number,
 *   fullyCovers  : boolean,
 * }}
 */
function previewFIFOAllocation(paymentAmount, unpaidFees, creditBalance = 0) {
    let remaining = Number(paymentAmount);
    let creditUsed = 0;
    const allocations = [];

    // Apply existing credit first — credit ADDS to the pool of money
    // available to pay down fees (payment + credit), it must never
    // reduce it. The full credit balance is drawn into the pool here;
    // whatever isn't needed to cover fees flows back out as
    // `creditAdded` below, so nothing is lost either way.
    if (creditBalance > 0) {
        creditUsed = Number(creditBalance);
        remaining += creditUsed;
    }

    // Sort by created_at ascending if not already sorted
    const sorted = [...unpaidFees].sort((a, b) => {
        const da = a.created_at || a.due_date || '';
        const db = b.created_at || b.due_date || '';
        return da < db ? -1 : da > db ? 1 : 0;
    });

    for (const fee of sorted) {
        if (remaining <= 0) break;

        const owed = Math.max(0,
            Number(fee.amount || 0) -
            Number(fee.waived_amount || 0) -
            Number(fee.paid_amount || 0)
        );

        if (owed <= 0) {
            allocations.push({
                feeId: fee.id,
                feeName: fee.fee_name || fee.name || `Fee #${fee.id}`,
                owed: 0,
                allocated: 0,
                remaining: 0,
                isFullyPaid: true,
            });
            continue;
        }

        const allocated = Math.min(remaining, owed);
        remaining -= allocated;

        allocations.push({
            feeId: fee.id,
            feeName: fee.fee_name || fee.name || `Fee #${fee.id}`,
            owed,
            allocated,
            remaining: owed - allocated,
            isFullyPaid: allocated >= owed,
        });
    }

    // Any remaining after all fees = new credit
    const creditAdded = Math.max(0, remaining);
    const totalAllocated = (Number(paymentAmount) + creditUsed) - creditAdded;
    const totalOwed = sorted.reduce((sum, f) =>
        sum + Math.max(0,
            Number(f.amount || 0) -
            Number(f.waived_amount || 0) -
            Number(f.paid_amount || 0)
        ), 0
    );

    return {
        allocations,
        totalAllocated,
        creditUsed,
        creditAdded,
        leftover: creditAdded,
        fullyCovers: totalOwed <= (Number(paymentAmount) + creditBalance),
    };
}

/* ═══════════════════════════════════════════════════════════════════
   4. WAIVER COMPUTATION  (Part 2.18)
   ═══════════════════════════════════════════════════════════════════ */

/**
 * Compute the waiver amount for a single fee.
 * @param {number} feeAmount       - original fee amount
 * @param {string} waiverType      - 'full' | 'partial' | 'percentage'
 * @param {number} [waiverValue]   - amount (partial) or percent (percentage)
 * @returns {{ waivedAmount: number, effectiveAmount: number }}
 */
function computeWaiver(feeAmount, waiverType, waiverValue = 0) {
    const amount = Number(feeAmount || 0);
    let waivedAmount = 0;

    if (waiverType === 'full') {
        waivedAmount = amount;
    } else if (waiverType === 'percentage') {
        const pct = Math.min(100, Math.max(0, Number(waiverValue)));
        waivedAmount = Math.round((amount * pct) / 100);
    } else if (waiverType === 'partial') {
        waivedAmount = Math.min(amount, Math.max(0, Number(waiverValue)));
    }

    return {
        waivedAmount,
        effectiveAmount: Math.max(0, amount - waivedAmount),
    };
}

/* ═══════════════════════════════════════════════════════════════════
   5. CREDIT BALANCE APPLICATION  (Part 2.17)
   ═══════════════════════════════════════════════════════════════════ */

/**
 * Compute how to apply a credit balance to remaining fees.
 * Returns which fees are fully covered and how much credit is left.
 *
 * @param {number} creditBalance
 * @param {Array}  unpaidFees
 * @returns {{
 *   creditUsed    : number,
 *   creditRemaining: number,
 *   feesCovered   : number[],  // fee IDs fully covered by credit
 *   partial       : { feeId, amountFromCredit }|null
 * }}
 */
function applyCreditBalance(creditBalance, unpaidFees) {
    let remaining = Number(creditBalance);
    const feesCovered = [];
    let partial = null;

    const sorted = [...unpaidFees].sort((a, b) => {
        const da = a.created_at || '';
        const db = b.created_at || '';
        return da < db ? -1 : da > db ? 1 : 0;
    });

    for (const fee of sorted) {
        if (remaining <= 0) break;

        const owed = Math.max(0,
            Number(fee.amount || 0) -
            Number(fee.waived_amount || 0) -
            Number(fee.paid_amount || 0)
        );
        if (owed <= 0) continue;

        if (remaining >= owed) {
            feesCovered.push(fee.id);
            remaining -= owed;
        } else {
            partial = { feeId: fee.id, amountFromCredit: remaining };
            remaining = 0;
        }
    }

    return {
        creditUsed: Number(creditBalance) - remaining,
        creditRemaining: remaining,
        feesCovered,
        partial,
    };
}

/* ═══════════════════════════════════════════════════════════════════
   6. COLLECTION STATISTICS  (Part 4.12)
   ═══════════════════════════════════════════════════════════════════ */

/**
 * Compute school-wide or class-level fee collection statistics.
 *
 * @param {Array} studentFees   - student_fee rows (filtered by year/class as needed)
 * @returns {{
 *   totalExpected    : number,   // sum of all fee amounts (minus waivers)
 *   totalCollected   : number,   // sum of paid_amounts
 *   totalOutstanding : number,
 *   collectionRate   : number,   // percentage
 *   totalStudents    : number,
 *   fullPayers       : number,   // students with 0 outstanding
 *   partialPayers    : number,
 *   nonPayers        : number,
 * }}
 */
function computeCollectionStats(studentFees) {
    if (!studentFees || studentFees.length === 0) {
        return {
            totalExpected: 0,
            totalCollected: 0,
            totalOutstanding: 0,
            collectionRate: 0,
            totalStudents: 0,
            fullPayers: 0,
            partialPayers: 0,
            nonPayers: 0,
        };
    }

    // Group fees by student
    const byStudent = {};
    studentFees.forEach(fee => {
        if (!byStudent[fee.student_id]) byStudent[fee.student_id] = [];
        byStudent[fee.student_id].push(fee);
    });

    let totalExpected = 0;
    let totalCollected = 0;
    let fullPayers = 0;
    let partialPayers = 0;
    let nonPayers = 0;

    Object.values(byStudent).forEach(fees => {
        const summary = computeStudentFeeSummary(fees, 0);
        totalExpected += summary.effective;
        totalCollected += summary.paid;

        if (summary.outstanding <= 0) {
            fullPayers++;
        } else if (summary.paid > 0) {
            partialPayers++;
        } else {
            nonPayers++;
        }
    });

    const totalOutstanding = Math.max(0, totalExpected - totalCollected);
    const collectionRate = totalExpected > 0
        ? Math.round((totalCollected / totalExpected) * 1000) / 10
        : 0;

    return {
        totalExpected,
        totalCollected,
        totalOutstanding,
        collectionRate,
        totalStudents: Object.keys(byStudent).length,
        fullPayers,
        partialPayers,
        nonPayers,
    };
}

/**
 * Compute daily/monthly payment totals from payments array.
 * @param {Array}  payments  - payment rows with payment_date and total_amount
 * @param {string} groupBy   - 'day' | 'month'
 * @returns {Array<{ period: string, total: number }>}
 */
function computePaymentTrend(payments, groupBy = 'month') {
    const grouped = {};

    payments.forEach(p => {
        if (!p.payment_date || !p.total_amount) return;
        const d = String(p.payment_date).substring(0, groupBy === 'day' ? 10 : 7);
        grouped[d] = (grouped[d] || 0) + Number(p.total_amount);
    });

    return Object.entries(grouped)
        .map(([period, total]) => ({ period, total }))
        .sort((a, b) => a.period < b.period ? -1 : 1);
}

/**
 * Compute payment method breakdown.
 * @param {Array} payments
 * @returns {Array<{ method: string, total: number, count: number, pct: number }>}
 */
function computeMethodBreakdown(payments) {
    const methods = {};
    let grandTotal = 0;

    payments.forEach(p => {
        const method = p.payment_method || 'Unknown';
        if (!methods[method]) methods[method] = { total: 0, count: 0 };
        methods[method].total += Number(p.total_amount || 0);
        methods[method].count++;
        grandTotal += Number(p.total_amount || 0);
    });

    return Object.entries(methods)
        .map(([method, data]) => ({
            method,
            total: data.total,
            count: data.count,
            pct: grandTotal > 0 ? Math.round((data.total / grandTotal) * 1000) / 10 : 0,
        }))
        .sort((a, b) => b.total - a.total);
}

/* ═══════════════════════════════════════════════════════════════════
   7. OVERDUE BUCKETS  (Part 4.12)
   ═══════════════════════════════════════════════════════════════════ */

/**
 * Classify an array of overdue student_fee rows into severity buckets.
 * A fee is overdue if it has a due_date that has passed and is not paid.
 *
 * @param {Array} studentFees
 * @returns {{
 *   critical : Array,   // > 30 days overdue
 *   warning  : Array,   // 15-30 days
 *   mild     : Array,   // 7-15 days
 *   recent   : Array,   // 1-7 days
 *   total    : number
 * }}
 */
function classifyOverdueFees(studentFees) {
    const today = todayISO();
    const buckets = { critical: [], warning: [], mild: [], recent: [], total: 0 };

    studentFees.forEach(fee => {
        if (fee.is_paid || fee.is_waived) return;
        if (!fee.due_date || fee.due_date >= today) return;

        const remaining = Math.max(0,
            Number(fee.amount || 0) -
            Number(fee.waived_amount || 0) -
            Number(fee.paid_amount || 0)
        );
        if (remaining <= 0) return;

        const days = daysBetween(fee.due_date, today);
        const enriched = { ...fee, days_overdue: days, remaining };

        if (days >= OVERDUE_SEVERITY.CRITICAL) buckets.critical.push(enriched);
        else if (days >= OVERDUE_SEVERITY.WARNING) buckets.warning.push(enriched);
        else if (days >= OVERDUE_SEVERITY.MILD) buckets.mild.push(enriched);
        else buckets.recent.push(enriched);

        buckets.total++;
    });

    return buckets;
}

/* ═══════════════════════════════════════════════════════════════════
   8. CARRY-FORWARD COMPUTATION  (Part 5.8)
   ═══════════════════════════════════════════════════════════════════
   At end-of-year, any credit balance carries forward to the next year.
   Outstanding balances are noted but not automatically transferred
   (admin reviews first).
   ═══════════════════════════════════════════════════════════════════ */

/**
 * Compute the carry-forward summary for all students at year end.
 * @param {Array}  students
 * @param {Array}  studentFees      - all student_fee rows for the year
 * @param {Array}  creditBalances   - student_credit_balance rows
 * @returns {Array<{
 *   student_id, name, credit, outstanding, carryForwardCredit
 * }>}
 */
function computeCarryForward(students, studentFees, creditBalances) {
    const creditMap = {};
    creditBalances.forEach(c => {
        creditMap[c.student_id] = Number(c.credit_amount || 0);
    });

    const feesByStudent = {};
    studentFees.forEach(f => {
        if (!feesByStudent[f.student_id]) feesByStudent[f.student_id] = [];
        feesByStudent[f.student_id].push(f);
    });

    return students.map(student => {
        const fees = feesByStudent[student.id] || [];
        const credit = creditMap[student.id] || 0;
        const summary = computeStudentFeeSummary(fees, credit);
        const name = `${student.first_name || ''} ${student.last_name || ''}`.trim();

        return {
            student_id: student.id,
            student_code: student.code,
            name,
            credit: summary.credit,
            outstanding: summary.outstanding,
            carryForwardCredit: Math.max(0, summary.credit - summary.balance),
        };
    });
}

/* ═══════════════════════════════════════════════════════════════════
   9. HOLIDAY FEE SEPARATION  (Part HOLIDAY_CONFIG)
   ═══════════════════════════════════════════════════════════════════
   Holiday fees are stored in holiday_fees table and are NEVER
   mixed with student_fees from the normal academic year.
   They are flagged for application at the START of the next term.
   This function summarizes the holiday fees for one student.
   ═══════════════════════════════════════════════════════════════════ */

/**
 * Summarize holiday fees for one student.
 * @param {Array}  holidayFees  - holiday_fees rows for this student
 * @returns {{
 *   total, paid, balance, pendingNextTerm,
 *   isFullyPaid: boolean
 * }}
 */
function computeHolidayFeeSummary(holidayFees) {
    if (!holidayFees || holidayFees.length === 0) {
        return { total: 0, paid: 0, balance: 0, pendingNextTerm: 0, isFullyPaid: true };
    }

    let total = 0;
    let paid = 0;

    holidayFees.forEach(f => {
        total += Number(f.amount || 0);
        paid += Number(f.paid_amount || 0);
    });

    const balance = Math.max(0, total - paid);
    // Fees not yet applied at term start
    const pendingNextTerm = holidayFees
        .filter(f => !f.is_applied_next_term && !f.is_paid)
        .reduce((sum, f) => sum + Math.max(0, Number(f.amount || 0) - Number(f.paid_amount || 0)), 0);

    return {
        total,
        paid,
        balance,
        pendingNextTerm,
        isFullyPaid: balance <= 0,
    };
}

/**
 * Get the list of holiday fees that should be applied at next term start.
 * Called by the "Start new term" workflow.
 *
 * @param {Array} holidayFees - all holiday_fees for the current year
 * @returns {Array} holiday_fees rows pending application
 */
function getHolidayFeesPendingApplication(holidayFees) {
    return holidayFees.filter(f =>
        !f.is_applied_next_term &&
        Number(f.amount || 0) > Number(f.paid_amount || 0)
    );
}

/* ═══════════════════════════════════════════════════════════════════
   10. RECEIPT CALCULATION HELPERS
   ═══════════════════════════════════════════════════════════════════ */

/**
 * Given selected fees and entered amounts from the payment form,
 * compute the validated total.
 *
 * Rules:
 *   - Amount per fee cannot exceed the remaining balance for that fee
 *   - Total across all fees = payment total
 *   - Negative amounts are not allowed
 *
 * @param {Array}  selectedFees    - fee objects that were checked
 * @param {Object} enteredAmounts  - { feeId: enteredAmount }
 * @returns {{
 *   lineItems    : Array<{ feeId, feeName, owed, entered, valid }>
 *   total        : number,
 *   hasErrors    : boolean,
 *   errors       : Object  // { feeId: errorMsg }
 * }}
 */
function validatePaymentLineItems(selectedFees, enteredAmounts) {
    const lineItems = [];
    const errors = {};
    let total = 0;

    selectedFees.forEach(fee => {
        const owed = computeFeeBalance(fee).remaining;
        const entered = Number(enteredAmounts[fee.id] || 0);

        const item = {
            feeId: fee.id,
            feeName: fee.fee_name || fee.name || `Fee #${fee.id}`,
            owed,
            entered,
            valid: true,
        };

        if (entered < 0) {
            item.valid = false;
            errors[fee.id] = 'Amount cannot be negative.';
        } else if (entered > owed) {
            item.valid = false;
            errors[fee.id] = `Amount exceeds the remaining balance of ${fmtCurrency(owed)}.`;
        }

        total += item.valid ? entered : 0;
        lineItems.push(item);
    });

    return {
        lineItems,
        total,
        hasErrors: Object.keys(errors).length > 0,
        errors,
    };
}

/* ═══════════════════════════════════════════════════════════════════
   EXPOSE
   ═══════════════════════════════════════════════════════════════════ */

window.computeStudentFeeSummary = computeStudentFeeSummary;
window.computeFeeBalance = computeFeeBalance;
window.previewFIFOAllocation = previewFIFOAllocation;
window.computeWaiver = computeWaiver;
window.applyCreditBalance = applyCreditBalance;
window.computeCollectionStats = computeCollectionStats;
window.computePaymentTrend = computePaymentTrend;
window.computeMethodBreakdown = computeMethodBreakdown;
window.classifyOverdueFees = classifyOverdueFees;
window.computeCarryForward = computeCarryForward;
window.computeHolidayFeeSummary = computeHolidayFeeSummary;
window.getHolidayFeesPendingApplication = getHolidayFeesPendingApplication;
window.validatePaymentLineItems = validatePaymentLineItems;