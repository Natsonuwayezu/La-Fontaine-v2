/**
 * ECOLE LA FONTAINE — Fee & Finance Formulas
 * Balance calculation, credit management, financial stats
 * Last updated: 2026-06-28
 */


const state = window.state || {}; // global state alias
import { state } from './state.js';

// ──────────────────────────────────────────────────────────────────────
// STUDENT FEE BALANCE
// ──────────────────────────────────────────────────────────────────────

/**
 * Calculate a student's fee balance
 * @param {number} studentId - Student ID
 * @returns {object} { total, paid, balance, credit, pct, hasCredit, waivedTotal }
 */
export function studentFeeBalance(studentId) {
    const allFees = (state.studentFees || []).filter(f => f.student_id === parseInt(studentId));

    const waivedFees = allFees.filter(f => f.is_waived === true);
    const activeFees = allFees.filter(f => !f.is_waived && !f.is_credit);
    const creditFees = allFees.filter(f => f.is_credit === true);

    const total = activeFees.reduce((a, f) => a + (f.amount || 0), 0);
    const waivedTotal = waivedFees.reduce((a, f) => a + (f.amount || 0), 0);
    const creditBal = creditFees.reduce((a, f) => a + (f.paid_amount || f.credit_amount || 0), 0);

    const paidFromFees = activeFees.reduce((a, f) => a + (f.paid_amount || 0), 0);
    const payments = (state.payments || []).filter(p => p.student_id === parseInt(studentId));
    const totalPmts = payments.reduce((a, p) => a + (p.amount || 0), 0);
    const effectivePaid = Math.max(paidFromFees, totalPmts);

    const rawBalance = total - effectivePaid;
    const balance = Math.max(0, rawBalance);
    const credit = Math.max(0, -rawBalance) + creditBal;
    const pct = total > 0 ? Math.min(100, Math.round((effectivePaid / total) * 100)) : (effectivePaid > 0 ? 100 : 0);

    return {
        total,
        paid: effectivePaid,
        balance,
        credit,
        pct,
        hasCredit: credit > 0,
        waivedTotal,
    };
}

/**
 * Get full student balance (async — tries DB view first)
 * @param {number} studentId - Student ID
 * @returns {Promise<object>} Balance object
 */
export async function getFullStudentBalance(studentId) {
    // Try DB view first (most accurate)
    try {
        const result = await apiRequest(`student_balances?student_id=eq.${studentId}`, 'GET');
        if (result.success && result.data?.length > 0) {
            const v = result.data[0];
            const total = v.total_fees || 0;
            const paid = v.total_paid || 0;
            const balance = v.balance || Math.max(0, total - paid);
            const credit = Math.max(0, paid - total);
            return {
                total,
                paid,
                balance,
                credit,
                hasCredit: credit > 0,
                pct: total > 0 ? Math.min(100, (paid / total) * 100) : (paid > 0 ? 100 : 0),
                waivedTotal: 0,
            };
        }
    } catch (e) {
        // View doesn't exist — fall through
    }

    // Fallback: in-memory calculation
    return studentFeeBalance(studentId);
}

// ──────────────────────────────────────────────────────────────────────
// STUDENT CREDIT BALANCE
// ──────────────────────────────────────────────────────────────────────

/**
 * Get a student's credit balance
 * @param {number} studentId - Student ID
 * @returns {object} { total, used, available }
 */
export function getStudentCreditBalance(studentId) {
    const creditFees = (state.studentFees || []).filter(f =>
        f.student_id === parseInt(studentId) &&
        f.is_credit === true
    );

    const totalCredit = creditFees.reduce((sum, f) => sum + (f.credit_amount || 0), 0);
    const usedCredit = creditFees.reduce((sum, f) => sum + (f.paid_amount || 0), 0);
    const available = totalCredit - usedCredit;

    return {
        total: totalCredit,
        used: usedCredit,
        available: Math.max(0, available),
    };
}

// ──────────────────────────────────────────────────────────────────────
// FINANCIAL STATISTICS
// ──────────────────────────────────────────────────────────────────────

/**
 * Calculate school-wide financial statistics
 * @param {object} data - Data object with payments, studentFees, students
 * @returns {object} Financial stats
 */
export function calculateFinancialStats(data = null) {
    const payments = data?.payments || state.payments || [];
    const studentFees = data?.studentFees || state.studentFees || [];
    const students = data?.students || state.students || [];

    const totalFees = studentFees.reduce((sum, f) => sum + (f.amount || 0), 0);
    const totalPaid = payments.reduce((sum, p) => sum + (p.amount || 0), 0);
    const outstanding = totalFees - totalPaid;
    const collectionRate = totalFees > 0 ? (totalPaid / totalFees) * 100 : 0;

    // Payment method breakdown
    const methodBreakdown = {};
    payments.forEach(p => {
        const method = p.payment_method || 'Other';
        methodBreakdown[method] = (methodBreakdown[method] || 0) + p.amount;
    });

    // Monthly collection trend
    const monthlyTrend = {};
    payments.forEach(p => {
        const month = (p.payment_date || p.created_at || '').slice(0, 7);
        if (month) {
            monthlyTrend[month] = (monthlyTrend[month] || 0) + p.amount;
        }
    });

    // Class-wise collection
    const classCollection = {};
    for (const student of students) {
        const className = student.class_name || 'Unknown';
        const studentFeesTotal = studentFees
            .filter(f => f.student_id === student.id && !f.is_waived && !f.is_credit)
            .reduce((sum, f) => sum + (f.amount || 0), 0);
        const studentPaid = payments
            .filter(p => p.student_id === student.id)
            .reduce((sum, p) => sum + (p.amount || 0), 0);

        if (!classCollection[className]) {
            classCollection[className] = { expected: 0, collected: 0 };
        }
        classCollection[className].expected += studentFeesTotal;
        classCollection[className].collected += studentPaid;
    }

    // Overdue statistics
    const today = new Date();
    const overdueFees = studentFees.filter(f =>
        !f.is_paid &&
        !f.is_waived &&
        f.due_date &&
        new Date(f.due_date) < today
    );
    const overdueAmount = overdueFees.reduce((sum, f) => sum + (f.amount - (f.paid_amount || 0)), 0);

    return {
        totalFees,
        totalPaid,
        outstanding,
        collectionRate,
        methodBreakdown,
        monthlyTrend,
        classCollection,
        overdueAmount,
        overdueCount: overdueFees.length,
    };
}

// ──────────────────────────────────────────────────────────────────────
// FEE AMOUNT LOOKUP
// ──────────────────────────────────────────────────────────────────────

/**
 * Get the fee amount for a category, class, and year
 * @param {number} categoryId - Fee category ID
 * @param {number} classId - Class ID
 * @param {number} yearId - Academic year ID
 * @returns {number} Fee amount (defaults to category amount)
 */
export function getFeeAmount(categoryId, classId, yearId) {
    const category = (state.feeCategories || []).find(c => c.id === parseInt(categoryId));
    if (!category) return 0;

    // Check for class override
    const override = (state.feeAmounts || []).find(fa =>
        fa.fee_category_id === parseInt(categoryId) &&
        fa.class_id === parseInt(classId) &&
        fa.academic_year_id === parseInt(yearId)
    );

    return override?.amount || category.amount || 0;
}