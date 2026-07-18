/* ═══════════════════════════════════════════════════════════════════
   js/modules/finance/payment-reversals.js
   ═══════════════════════════════════════════════════════════════════
   Purpose : Reverse a recorded payment, with full balance
             recalculation and a required reason. Admin-only
             (canReversePayment()) — this undoes real money-received
             records, unlike a waiver or credit adjustment.

   What reversing a payment does:
     1. For each payment_allocations row tied to the payment, subtracts
        that allocated amount back off the corresponding student_fees
        row's paid_amount (and clears is_paid if it had been fully paid).
     2. If the payment created an overflow credit balance
        (see finance-formulas.js's applyCreditBalance /
        core/api.js's allocatePaymentFIFO), reduces
        student_credit_balance by that same overflow amount, clamped at
        0 — NOTE: if that credit has since been spent elsewhere (applied
        to a different fee via credit-balances.js), this will not claw
        that back; it only undoes the overflow this exact payment
        created. Flagged in the confirmation dialog.
     3. Marks the payment itself: is_reversed = true, reversed_at,
        reversed_by, reversed_reason (new fields — payments had no
        reversal tracking before this file).
     4. Logs via the existing logReversePayment() convenience wrapper.

   Dependencies (plain-script globals loaded earlier in index.html):
   api.js: ensureStateLoaded, update, refreshTables
   data-loader.js: loadPayments, loadStudentFees
   finance-formulas.js: computeFeeBalance
   permissions.js: canReversePayment, myId, myRole
   logger.js: logReversePayment
   state.js: state
   utils.js: esc, fmtCurrency, fmtDate, debounce
   toast.js: showToast
   modals.js: confirmDialog
   loaders.js: window.Loaders
   constants.js: DEBOUNCE_SEARCH
   ═══════════════════════════════════════════════════════════════════ */

'use strict';

async function renderPaymentReversals(container, params = {}) {
    if (!container) return;

    if (!canReversePayment()) {
        container.innerHTML = `<div class="alert alert-danger">Access denied. Only admins can reverse payments.</div>`;
        return;
    }

    container.innerHTML = `<div class="dashboard-page"><div class="loading-inline">Loading payments…</div></div>`;

    await ensureStateLoaded();
    await loadPayments();
    await loadStudentFees();

    let searchQuery = '';

    function studentName(id) {
        const s = (state.students || []).find(s => s.id === parseInt(id));
        return s ? `${s.first_name} ${s.last_name}` : '—';
    }

    function reversiblePayments() {
        const rows = (state.payments || []).filter(p => !p.is_reversed);
        const sorted = [...rows].sort((a, b) => new Date(b.payment_date || 0) - new Date(a.payment_date || 0));
        if (!searchQuery) return sorted;
        return sorted.filter(p =>
            (p.receipt_number || '').toLowerCase().includes(searchQuery) ||
            studentName(p.student_id).toLowerCase().includes(searchQuery)
        );
    }

    function reversedPayments() {
        return (state.payments || [])
            .filter(p => p.is_reversed)
            .sort((a, b) => new Date(b.reversed_at || 0) - new Date(a.reversed_at || 0))
            .slice(0, 20);
    }

    function render() {
        const rows = reversiblePayments();
        const reversed = reversedPayments();

        container.innerHTML = `
            <div class="dashboard-page">
                <div class="settings-section">
                    <div class="settings-section__title">Payment Reversals</div>
                    <div class="settings-section__desc">Reversing a payment restores the fee balance it covered. This cannot be undone — admin only.</div>
                </div>

                <div class="filters-bar">
                    <input type="text" class="form-input" id="pr-search" placeholder="Search receipt # or student name…" value="${esc(searchQuery)}">
                </div>

                <table class="logs-table" style="margin-bottom:24px;">
                    <thead><tr><th>Receipt #</th><th>Date</th><th>Student</th><th>Amount</th><th>Method</th><th></th></tr></thead>
                    <tbody>
                        ${rows.map(p => `
                            <tr>
                                <td>${esc(p.receipt_number || `RCP-${p.id}`)}</td>
                                <td>${fmtDate(p.payment_date)}</td>
                                <td>${esc(studentName(p.student_id))}</td>
                                <td>${fmtCurrency(p.amount)}</td>
                                <td><span class="badge">${esc(p.payment_method || '—')}</span></td>
                                <td><button class="btn btn-sm btn-outline" data-reverse="${p.id}"><i class="fa-solid fa-rotate-left"></i> Reverse</button></td>
                            </tr>
                        `).join('') || '<tr><td colspan="6" style="text-align:center; padding:24px;">No payments match this search.</td></tr>'}
                    </tbody>
                </table>

                <div class="settings-section__title">Recently Reversed</div>
                <table class="logs-table">
                    <thead><tr><th>Receipt #</th><th>Student</th><th>Amount</th><th>Reason</th><th>Reversed By</th><th>When</th></tr></thead>
                    <tbody>
                        ${reversed.map(p => `
                            <tr>
                                <td>${esc(p.receipt_number || `RCP-${p.id}`)}</td>
                                <td>${esc(studentName(p.student_id))}</td>
                                <td>${fmtCurrency(p.amount)}</td>
                                <td>${esc(p.reversed_reason || '—')}</td>
                                <td>${esc(p.reversed_by_name || '—')}</td>
                                <td>${fmtDate(p.reversed_at)}</td>
                            </tr>
                        `).join('') || '<tr><td colspan="6" style="text-align:center; padding:20px;">No payments have been reversed yet.</td></tr>'}
                    </tbody>
                </table>
            </div>
        `;

        bindEvents();
    }

    function reasonForm() {
        return `
            <form id="pr-reason-form">
                <div class="form-group">
                    <label class="form-label">Reason (required)</label>
                    <textarea name="reason" class="form-input" rows="3" placeholder="e.g. Duplicate entry, wrong student, payment returned/bounced…" required></textarea>
                </div>
            </form>
        `;
    }

    async function reversePayment(paymentId) {
        const payment = (state.payments || []).find(p => p.id === parseInt(paymentId));
        if (!payment) { showToast('Payment not found', 'error'); return; }

        const allocations = (state.paymentAllocations || []).filter(a => a.payment_id === payment.id);
        const allocatedTotal = allocations.reduce((sum, a) => sum + Number(a.amount || 0), 0);
        const overflowCredit = Math.max(0, Number(payment.amount || 0) - allocatedTotal);

        window.showModal(reasonForm(), {
            title: `Reverse Payment ${payment.receipt_number || `RCP-${payment.id}`}`,
            footer: `<button class="btn btn-outline" data-close>Cancel</button>
                     <button class="btn btn-danger" id="pr-confirm-reverse-btn">Reverse Payment</button>`
        });

        document.getElementById('pr-confirm-reverse-btn').onclick = async () => {
            const form = document.getElementById('pr-reason-form');
            const reason = new FormData(form).get('reason')?.toString().trim();
            if (!reason) { showToast('Reason required', 'error'); return; }

            const warningExtra = overflowCredit > 0
                ? ` This payment also created ${fmtCurrency(overflowCredit)} of credit balance — that will be removed too (if it hasn't already been applied elsewhere).`
                : '';
            const ok = await confirmDialog(
                `Reverse ${fmtCurrency(payment.amount)} for ${esc(studentName(payment.student_id))}? This restores the fee balance it covered and cannot be undone.${warningExtra}`,
                'Confirm Reversal'
            );
            if (!ok) return;

            const btn = document.getElementById('pr-confirm-reverse-btn');
            window.Loaders?.button?.start(btn, 'Reversing...');
            try {
                // 1. Undo each allocation's effect on its student_fees row.
                for (const alloc of allocations) {
                    const fee = (state.studentFees || []).find(f => f.id === alloc.student_fee_id);
                    if (!fee) continue;
                    const newPaid = Math.max(0, Number(fee.paid_amount || 0) - Number(alloc.amount || 0));
                    await update('student_fees', fee.id, {
                        paid_amount: newPaid,
                        is_paid: false,
                        updated_at: new Date().toISOString(),
                    });
                }

                // 2. Claw back any overflow credit this payment created.
                if (overflowCredit > 0) {
                    const creditRow = (state.creditBalances || []).find(c => c.student_id === payment.student_id);
                    if (creditRow) {
                        const newCredit = Math.max(0, Number(creditRow.credit_amount || 0) - overflowCredit);
                        await update('student_credit_balance', creditRow.id, {
                            credit_amount: newCredit, updated_at: new Date().toISOString()
                        });
                    }
                }

                // 3. Mark the payment as reversed.
                await update('payments', payment.id, {
                    is_reversed: true,
                    reversed_at: new Date().toISOString(),
                    reversed_by: myId(),
                    reversed_by_name: state.currentUser?.name || myRole(),
                    reversed_reason: reason,
                });

                await refreshTables(['payments', 'payment_allocations', 'student_fees', 'student_credit_balance']);
                await logReversePayment(payment.id, payment.student_id, payment.amount, reason);

                showToast('Payment reversed', 'success', `${fmtCurrency(payment.amount)} reversed for ${studentName(payment.student_id)}.`);
                window.closeModal();
                render();
            } catch (err) {
                showToast('Could not reverse payment', 'error', err.message);
            } finally {
                window.Loaders?.button?.stop(btn);
            }
        };
    }

    function bindEvents() {
        document.getElementById('pr-search')?.addEventListener('input', debounce((e) => {
            searchQuery = e.target.value.trim().toLowerCase();
            render();
        }, DEBOUNCE_SEARCH));

        container.querySelectorAll('[data-reverse]').forEach(btn => {
            btn.addEventListener('click', () => reversePayment(btn.dataset.reverse));
        });
    }

    render();
}

function destroyPaymentReversals() {
    // Nothing to tear down — no timers/listeners outlive the container.
}

/* ═══════════════════════════════════════════════════════════════════
   EXPOSE
   ═══════════════════════════════════════════════════════════════════ */

window.renderPaymentReversals = renderPaymentReversals;
window.destroyPaymentReversals = destroyPaymentReversals;
