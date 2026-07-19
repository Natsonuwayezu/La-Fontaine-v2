/* ═══════════════════════════════════════════════════════════════════
   js/modules/finance/manual-adjustments.js
   ═══════════════════════════════════════════════════════════════════
   Purpose : Correct a student_fees row's own amount directly (a data
             entry error — wrong fee assigned, wrong amount typed),
             as distinct from a waiver (fee-waivers.js — forgives part
             of a correctly-assigned fee) or a payment reversal
             (payment-reversals.js — undoes money received). Every
             adjustment requires a reason and is logged with a clear
             before/after amount for audit.

   Dependencies (plain-script globals loaded earlier in index.html):
   api.js: ensureStateLoaded, update, refreshTable
   data-loader.js: loadStudentFees
   finance-formulas.js: computeFeeBalance
   permissions.js: canManageFees, myId, myRole
   state.js: state
   utils.js: esc, fmtCurrency, fmtDate, debounce
   toast.js: showToast
   modals.js: showModal, closeModal, confirmDialog
   logger.js: logAction
   loaders.js: window.Loaders
   constants.js: DEBOUNCE_SEARCH
   ═══════════════════════════════════════════════════════════════════ */

'use strict';

async function renderManualAdjustments(container, params = {}) {
    if (!container) return;

    if (!canManageFees()) {
        container.innerHTML = `<div class="alert alert-danger">Access denied.</div>`;
        return;
    }

    container.innerHTML = `<div class="dashboard-page"><div class="loading-inline">Loading fees…</div></div>`;

    await ensureStateLoaded();
    await loadStudentFees();

    let selectedStudentId = params.studentId || null;

    function studentName(id) {
        const s = (state.students || []).find(s => s.id === parseInt(id));
        return s ? `${s.first_name} ${s.last_name}` : '—';
    }

    function feesForStudent(studentId) {
        return (state.studentFees || [])
            .filter(f => f.student_id === parseInt(studentId))
            .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
    }

    function render() {
        const fees = selectedStudentId ? feesForStudent(selectedStudentId) : [];

        container.innerHTML = `
            <div class="dashboard-page">
                <div class="settings-section">
                    <div class="settings-section__title">Manual Fee Adjustments</div>
                    <div class="settings-section__desc">Correct a fee amount that was assigned incorrectly. This changes the fee itself, not a payment or a waiver — every change requires a reason and is logged.</div>
                </div>

                <div class="setting-card" style="margin-bottom:16px;">
                    <div class="form-group">
                        <label class="form-label">Student</label>
                        <select id="ma-student-select" class="form-select">
                            <option value="">— Select a student —</option>
                            ${(state.students || []).map(s => `
                                <option value="${s.id}" ${String(s.id) === String(selectedStudentId) ? 'selected' : ''}>
                                    ${esc(s.last_name)}, ${esc(s.first_name)} (${esc(s.student_code || s.code || '')})
                                </option>
                            `).join('')}
                        </select>
                    </div>
                </div>

                ${selectedStudentId ? `
                    <table class="logs-table">
                        <thead><tr><th>Fee</th><th>Current Amount</th><th>Paid</th><th>Balance</th><th></th></tr></thead>
                        <tbody>
                            ${fees.map(fee => {
                                const bal = computeFeeBalance(fee);
                                return `
                                    <tr>
                                        <td>${esc(fee.fee_name || fee.description || 'Fee')}</td>
                                        <td>${fmtCurrency(fee.amount)}</td>
                                        <td>${fmtCurrency(fee.paid_amount || 0)}</td>
                                        <td>${fmtCurrency(bal.remaining)}</td>
                                        <td><button class="btn btn-sm btn-outline" data-adjust="${fee.id}">Adjust Amount</button></td>
                                    </tr>
                                `;
                            }).join('') || '<tr><td colspan="5" style="text-align:center; padding:20px;">No fees assigned to this student yet.</td></tr>'}
                        </tbody>
                    </table>
                ` : ''}
            </div>
        `;

        bindEvents();
    }

    function adjustForm(fee) {
        return `
            <form id="ma-adjust-form">
                <div class="setting-desc" style="margin-bottom:10px;">
                    Current amount: <strong>${fmtCurrency(fee.amount)}</strong> — already paid: <strong>${fmtCurrency(fee.paid_amount || 0)}</strong>
                </div>
                <div class="form-group">
                    <label class="form-label">Corrected Amount (RWF)</label>
                    <input type="number" name="new_amount" class="form-input" min="0" value="${fee.amount}" required>
                </div>
                <div class="form-group">
                    <label class="form-label">Reason (required)</label>
                    <textarea name="reason" class="form-input" rows="2" placeholder="e.g. Wrong fee category was assigned, amount entered incorrectly…" required></textarea>
                </div>
            </form>
        `;
    }

    function openAdjustModal(feeId) {
        const fee = (state.studentFees || []).find(f => String(f.id) === String(feeId));
        if (!fee) return;

        window.showModal(adjustForm(fee), {
            title: `Adjust: ${esc(fee.fee_name || fee.description || 'Fee')}`,
            footer: `<button class="btn btn-outline" data-close>Cancel</button>
                     <button class="btn btn-primary" id="ma-save-btn">Save Correction</button>`
        });

        document.getElementById('ma-save-btn').onclick = async () => {
            const form = document.getElementById('ma-adjust-form');
            const data = Object.fromEntries(new FormData(form).entries());
            const newAmount = Number(data.new_amount);
            const reason = data.reason?.trim();

            if (!Number.isFinite(newAmount) || newAmount < 0) {
                showToast('Invalid amount', 'error');
                return;
            }
            if (newAmount < Number(fee.paid_amount || 0)) {
                showToast('Amount too low', 'error', 'The new amount cannot be less than what has already been paid.');
                return;
            }
            if (!reason) {
                showToast('Reason required', 'error');
                return;
            }

            const oldAmount = Number(fee.amount);
            const ok = await confirmDialog(
                `Change this fee's amount from ${fmtCurrency(oldAmount)} to ${fmtCurrency(newAmount)}?`,
                'Confirm Adjustment'
            );
            if (!ok) return;

            const btn = document.getElementById('ma-save-btn');
            window.Loaders?.button?.start(btn, 'Saving...');
            try {
                await update('student_fees', fee.id, {
                    amount: newAmount,
                    is_paid: newAmount <= Number(fee.paid_amount || 0),
                    updated_at: new Date().toISOString(),
                });

                await refreshTable('student_fees');
                await logAction('FEE_AMOUNT_ADJUSTED', 'student_fees', fee.id, {
                    student_id: selectedStudentId,
                    old_amount: oldAmount,
                    new_amount: newAmount,
                    reason,
                    adjusted_by: myId(),
                }, 'warning');

                showToast('Fee adjusted', 'success', `${fmtCurrency(oldAmount)} → ${fmtCurrency(newAmount)}`);
                window.closeModal();
                await loadStudentFees();
                render();
            } catch (err) {
                showToast('Could not save adjustment', 'error', err.message);
            } finally {
                window.Loaders?.button?.stop(btn);
            }
        };
    }

    function bindEvents() {
        document.getElementById('ma-student-select')?.addEventListener('change', (e) => {
            selectedStudentId = e.target.value || null;
            render();
        });

        container.querySelectorAll('[data-adjust]').forEach(btn => {
            btn.addEventListener('click', () => openAdjustModal(btn.dataset.adjust));
        });
    }

    render();
}

function destroyManualAdjustments() {
    // Nothing to tear down — no timers/listeners outlive the container.
}

/* ═══════════════════════════════════════════════════════════════════
   EXPOSE
   ═══════════════════════════════════════════════════════════════════ */

window.renderManualAdjustments = renderManualAdjustments;
window.destroyManualAdjustments = destroyManualAdjustments;
