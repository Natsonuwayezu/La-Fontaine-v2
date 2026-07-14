/* ═══════════════════════════════════════════════════════════════════
   js/core/fees.js
   ═══════════════════════════════════════════════════════════════════
   Purpose : Fee management logic — assign fees to students, generate
             student_fee rows, apply credit balances, handle holiday
             fee routing. All actual DB writes go through api.js.
   References: backend.txt Part 2.14-2.18, Part 5.7
   Load order: AFTER finance-formulas.js and api.js.
   ═══════════════════════════════════════════════════════════════════ */

'use strict';

/* ═══════════════════════════════════════════════════════════════════
   1. FEE ASSIGNMENT TO STUDENT  (Part 5.7)
   ═══════════════════════════════════════════════════════════════════
   When a student is enrolled (or when fee_amounts change), fee rows
   are created in student_fees.

   Fee assignment rules:
   - applies_to='all'     → fee assigned to every student in the year
   - applies_to='class'   → fee assigned to students in a specific class
   - applies_to='student' → manually assigned to a specific student

   If the student already has a fee row for the same fee_amount_id
   and academic_year, skip (don't duplicate).
   ═══════════════════════════════════════════════════════════════════ */

/**
 * Determine which fee_amount rows should be assigned to a student.
 * Returns an array of fee_amount rows that the student should have.
 *
 * @param {Object} student        - student row { id, class_id, academic_year_id }
 * @param {Array}  feeAmounts     - all fee_amount rows for the academic year
 * @returns {Array} fee_amount rows applicable to this student
 */
function getFeeAmountsForStudent(student, feeAmounts) {
    return feeAmounts.filter(fa => {
        if (!fa.is_active) return false;
        if (Number(fa.academic_year_id) !== Number(student.academic_year_id)) return false;

        // Check applies_to
        if (fa.applies_to === 'all') return true;
        if (fa.applies_to === 'class' && Number(fa.class_id) === Number(student.class_id)) return true;
        if (fa.applies_to === 'student' && Number(fa.student_id) === Number(student.id)) return true;

        return false;
    });
}

/**
 * Build the student_fee insert payload for one student.
 * Skips fees the student already has (by fee_amount_id).
 *
 * @param {Object} student
 * @param {Array}  feeAmounts       - applicable fee_amounts (from getFeeAmountsForStudent)
 * @param {Array}  existingFees     - student_fee rows already in DB for this student
 * @returns {Array} rows ready to INSERT into student_fees
 */
function buildStudentFeeRows(student, feeAmounts, existingFees = []) {
    const existingFeeAmountIds = new Set(
        existingFees.map(f => Number(f.fee_amount_id))
    );

    const now = new Date().toISOString();

    return feeAmounts
        .filter(fa => !existingFeeAmountIds.has(Number(fa.id)))
        .map(fa => ({
            student_id        : student.id,
            fee_amount_id     : fa.id,
            academic_year_id  : student.academic_year_id,
            amount            : Number(fa.amount || 0),
            paid_amount       : 0,
            waived_amount     : 0,
            is_paid           : false,
            is_waived         : false,
            due_date          : fa.due_date || null,
            fee_name          : fa.name || fa.fee_name || '',
            fee_category_id   : fa.fee_category_id || null,
            frequency         : fa.frequency || 'termly',
            created_at        : now,
            updated_at        : now,
        }));
}

/**
 * Assign fees to a newly enrolled student.
 * Queries the DB for applicable fee_amounts, then inserts missing rows.
 *
 * @param {Object} student - just-inserted student row { id, class_id, academic_year_id }
 * @returns {Promise<{ assigned: number, skipped: number }>}
 */
async function assignFeesToStudent(student) {
    try {
        // Get all fee amounts for the academic year
        const feeAmounts = await getAll('fee_amounts', {
            academic_year_id : student.academic_year_id,
            is_active        : true,
        });

        if (!feeAmounts || feeAmounts.length === 0) {
            return { assigned: 0, skipped: 0 };
        }

        // Get applicable fees for this student
        const applicable = getFeeAmountsForStudent(student, feeAmounts);

        if (applicable.length === 0) {
            return { assigned: 0, skipped: 0 };
        }

        // Get existing fee rows to avoid duplicates
        const existingFees = await getAll('student_fees', {
            student_id        : student.id,
            academic_year_id  : student.academic_year_id,
        });

        // Build insert payload
        const toInsert = buildStudentFeeRows(student, applicable, existingFees);

        if (toInsert.length === 0) {
            return { assigned: 0, skipped: applicable.length };
        }

        // Insert all at once
        await insertMany('student_fees', toInsert);

        // Refresh state
        await refreshTable('student_fees');

        return {
            assigned : toInsert.length,
            skipped  : applicable.length - toInsert.length,
        };

    } catch (err) {
        console.error('[fees.js] assignFeesToStudent failed:', err.message);
        throw err;
    }
}

/* ═══════════════════════════════════════════════════════════════════
   2. BULK FEE ASSIGNMENT  (for when a new fee_amount is created)
   ═══════════════════════════════════════════════════════════════════
   When admin creates a new fee that applies to 'all' or 'class',
   we must retroactively create student_fee rows for all existing
   students who don't already have this fee.
   ═══════════════════════════════════════════════════════════════════ */

/**
 * Assign a single fee_amount row to all applicable students in bulk.
 *
 * @param {Object} feeAmount   - the new or updated fee_amount row
 * @param {Array}  students    - all active students for the academic year
 * @param {Array}  existingStudentFees - all student_fee rows for the year
 * @returns {Promise<{ assigned: number, skipped: number, errors: string[] }>}
 */
async function bulkAssignFee(feeAmount, students, existingStudentFees) {
    const now    = new Date().toISOString();
    const errors = [];
    let assigned = 0;
    let skipped  = 0;

    // Find students this fee applies to
    const applicable = students.filter(student => {
        if (feeAmount.applies_to === 'all')    return true;
        if (feeAmount.applies_to === 'class')  return Number(student.class_id) === Number(feeAmount.class_id);
        if (feeAmount.applies_to === 'student')return Number(student.id) === Number(feeAmount.student_id);
        return false;
    });

    if (applicable.length === 0) return { assigned: 0, skipped: 0, errors: [] };

    // Filter out students who already have this fee
    const existingByStudent = {};
    existingStudentFees.forEach(f => {
        if (!existingByStudent[f.student_id]) existingByStudent[f.student_id] = new Set();
        existingByStudent[f.student_id].add(Number(f.fee_amount_id));
    });

    const toInsert = applicable
        .filter(s => !existingByStudent[s.id]?.has(Number(feeAmount.id)))
        .map(s => ({
            student_id       : s.id,
            fee_amount_id    : feeAmount.id,
            academic_year_id : feeAmount.academic_year_id,
            amount           : Number(feeAmount.amount || 0),
            paid_amount      : 0,
            waived_amount    : 0,
            is_paid          : false,
            is_waived        : false,
            due_date         : feeAmount.due_date || null,
            fee_name         : feeAmount.name || feeAmount.fee_name || '',
            fee_category_id  : feeAmount.fee_category_id || null,
            frequency        : feeAmount.frequency || 'termly',
            created_at       : now,
            updated_at       : now,
        }));

    skipped = applicable.length - toInsert.length;

    if (toInsert.length === 0) return { assigned: 0, skipped, errors };

    // Insert in batches of 100 to avoid request size limits
    const BATCH = 100;
    for (let i = 0; i < toInsert.length; i += BATCH) {
        const batch = toInsert.slice(i, i + BATCH);
        try {
            await insertMany('student_fees', batch);
            assigned += batch.length;
        } catch (err) {
            errors.push(`Batch ${Math.floor(i / BATCH) + 1}: ${err.message}`);
        }
    }

    if (assigned > 0) await refreshTable('student_fees');

    return { assigned, skipped, errors };
}

/* ═══════════════════════════════════════════════════════════════════
   3. CREDIT BALANCE APPLICATION AT PAYMENT TIME  (Part 2.17)
   ═══════════════════════════════════════════════════════════════════ */

/**
 * Apply available credit balance to reduce outstanding fees.
 * This is called when recording a payment if the student has credit.
 * Writes to the DB (updates student_fees and student_credit_balance).
 *
 * @param {number} studentId
 * @param {number} creditToApply  - how much credit to use (≤ current balance)
 * @param {Array}  unpaidFees     - sorted student_fee rows (oldest first)
 * @returns {Promise<{ applied: number, feesUpdated: number }>}
 */
async function applyCredit(studentId, creditToApply, unpaidFees) {
    if (!creditToApply || creditToApply <= 0) return { applied: 0, feesUpdated: 0 };

    const plan = applyCreditBalance(creditToApply, unpaidFees);
    const now  = new Date().toISOString();
    let feesUpdated = 0;

    // Mark fully covered fees as paid
    for (const feeId of plan.feesCovered) {
        const fee = unpaidFees.find(f => f.id === feeId);
        if (!fee) continue;

        const owed = Math.max(0,
            Number(fee.amount || 0) -
            Number(fee.waived_amount || 0) -
            Number(fee.paid_amount || 0)
        );

        await update('student_fees', feeId, {
            paid_amount : Number(fee.paid_amount || 0) + owed,
            is_paid     : true,
            updated_at  : now,
        });
        feesUpdated++;
    }

    // Apply partial to one fee
    if (plan.partial) {
        const { feeId, amountFromCredit } = plan.partial;
        const fee = unpaidFees.find(f => f.id === feeId);
        if (fee) {
            const newPaid = Number(fee.paid_amount || 0) + amountFromCredit;
            await update('student_fees', feeId, {
                paid_amount: newPaid,
                updated_at : now,
            });
            feesUpdated++;
        }
    }

    // Reduce credit balance
    const creditRows = await getAll('student_credit_balance', { student_id: studentId });
    if (creditRows.length > 0) {
        const newCredit = Math.max(0, Number(creditRows[0].credit_amount || 0) - plan.creditUsed);
        await update('student_credit_balance', creditRows[0].id, {
            credit_amount: newCredit,
            updated_at   : now,
        });
    }

    await refreshTables(['student_fees', 'student_credit_balance']);

    return { applied: plan.creditUsed, feesUpdated };
}

/* ═══════════════════════════════════════════════════════════════════
   4. HOLIDAY FEE CREATION  (Part HOLIDAY_CONFIG)
   ═══════════════════════════════════════════════════════════════════
   Holiday fees are written to holiday_fees table, NEVER to student_fees.
   They are marked with apply_at_next_term=true so the admin knows
   to carry them forward.
   ═══════════════════════════════════════════════════════════════════ */

/**
 * Create a holiday fee for one or more students.
 * Writes to holiday_fees table regardless of resolveTable() —
 * holiday fees always go to their own table.
 *
 * @param {Object} feeData - { name, amount, description, fee_type }
 * @param {Array}  studentIds
 * @param {number} academicYearId
 * @returns {Promise<{ created: number }>}
 */
async function createHolidayFees(feeData, studentIds, academicYearId) {
    if (!studentIds || studentIds.length === 0) return { created: 0 };

    const now  = new Date().toISOString();
    const rows = studentIds.map(studentId => ({
        student_id          : studentId,
        academic_year_id    : academicYearId,
        name                : feeData.name || 'Holiday Fee',
        amount              : Number(feeData.amount || 0),
        paid_amount         : 0,
        is_paid             : false,
        fee_type            : feeData.fee_type || 'holiday',
        description         : feeData.description || null,
        apply_at_next_term  : true,   // Always apply at NEXT term start
        is_applied_next_term: false,
        created_at          : now,
        updated_at          : now,
    }));

    // Directly target holiday_fees — NOT via resolveTable()
    await insertMany('holiday_fees', rows);

    // Update holiday state
    await refreshTable('holiday_fees');

    return { created: rows.length };
}

/**
 * Mark holiday fees as applied at the start of the new term.
 * Called when admin clicks "Apply holiday fees to new term".
 *
 * @param {Array} holidayFeeIds - ids of holiday_fees rows to mark
 * @param {number} newTermId    - the term these fees are being applied to
 * @returns {Promise<void>}
 */
async function markHolidayFeesAsApplied(holidayFeeIds, newTermId) {
    if (!holidayFeeIds || holidayFeeIds.length === 0) return;

    const now = new Date().toISOString();

    for (const id of holidayFeeIds) {
        await update('holiday_fees', id, {
            is_applied_next_term : true,
            applied_term_id      : newTermId,
            applied_at           : now,
            updated_at           : now,
        });
    }

    await refreshTable('holiday_fees');
}

/* ═══════════════════════════════════════════════════════════════════
   5. FEE DELETION WITH SAFETY CHECKS  (Part 5.7)
   ═══════════════════════════════════════════════════════════════════
   A fee_amount can only be deleted if no student_fee rows have
   been paid against it. If any payments exist, it cannot be deleted
   (admin must reverse/waive instead).
   ═══════════════════════════════════════════════════════════════════ */

/**
 * Check if a fee_amount can be safely deleted.
 * Returns { canDelete: boolean, reason: string|null }.
 *
 * @param {number} feeAmountId
 * @param {Array}  studentFees - all student_fee rows
 * @param {Array}  payments    - all payment rows
 */
function canDeleteFeeAmount(feeAmountId, studentFees, payments) {
    // Any student_fee row with paid_amount > 0 blocks deletion
    const paidRows = studentFees.filter(f =>
        Number(f.fee_amount_id) === Number(feeAmountId) &&
        Number(f.paid_amount || 0) > 0
    );

    if (paidRows.length > 0) {
        return {
            canDelete : false,
            reason    : `This fee has been partially or fully paid by ${paidRows.length} student(s). Reverse or waive payments before deleting.`,
        };
    }

    return { canDelete: true, reason: null };
}

/* ═══════════════════════════════════════════════════════════════════
   6. FEE STATUS SUMMARY FOR DISPLAY
   ═══════════════════════════════════════════════════════════════════ */

/**
 * Get a display-ready status label and color for a student_fee row.
 * @param {Object} fee - student_fee row
 * @returns {{ label: string, color: string, badgeClass: string }}
 */
function getFeeStatusDisplay(fee) {
    if (fee.is_waived || Number(fee.waived_amount || 0) >= Number(fee.amount || 0)) {
        return { label: 'Waived', color: '#7c5cfc', badgeClass: 'badge-purple' };
    }
    if (fee.is_paid) {
        return { label: 'Paid', color: '#2d6a4f', badgeClass: 'badge-success' };
    }
    const paid = Number(fee.paid_amount || 0);
    if (paid > 0) {
        return { label: 'Partial', color: '#c99a3b', badgeClass: 'badge-warning' };
    }

    // Check if overdue
    if (fee.due_date && fee.due_date < todayISO()) {
        const { level } = getOverdueSeverity(fee.due_date);
        if (level === 'critical') return { label: 'Critical', color: '#c44536', badgeClass: 'badge-danger' };
        return { label: 'Overdue', color: '#c44536', badgeClass: 'badge-danger' };
    }

    return { label: 'Unpaid', color: '#c44536', badgeClass: 'badge-danger' };
}

/* ═══════════════════════════════════════════════════════════════════
   EXPOSE
   ═══════════════════════════════════════════════════════════════════ */

window.getFeeAmountsForStudent    = getFeeAmountsForStudent;
window.buildStudentFeeRows        = buildStudentFeeRows;
window.assignFeesToStudent        = assignFeesToStudent;
window.bulkAssignFee              = bulkAssignFee;
window.applyCredit                = applyCredit;
window.createHolidayFees          = createHolidayFees;
window.markHolidayFeesAsApplied   = markHolidayFeesAsApplied;
window.canDeleteFeeAmount         = canDeleteFeeAmount;
window.getFeeStatusDisplay        = getFeeStatusDisplay;