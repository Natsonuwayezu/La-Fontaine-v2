/* ═══════════════════════════════════════════════════════════════════
   js/modules/finance/credit-balances.js
   ═══════════════════════════════════════════════════════════════════
   Purpose : View and manage student credit balances (overpayments not
             yet applied to a fee).
             - List every student with a credit balance > 0
             - "Apply to Fees" — FIFO-applies the credit against that
               student's outstanding fees, via the existing
               core/fees.js applyCredit() (oldest fee first)
             - "Adjust" — manual correction (add or subtract), with a
               required reason, logged for audit
             - Search to jump to a specific student, including those
               with a zero balance (to manually add credit, e.g. a
               parent overpaid outside the normal payment flow)

   Table: student_credit_balance { id, student_id, credit_amount, updated_at }
   Was referenced throughout core/fees.js/core/api.js already (e.g.
   applyCredit(), allocatePaymentFIFO()'s overflow handling) but had
   no dedicated page and no REFRESH_MAP entry — state.creditBalances
   was never actually populated anywhere before this file. Added the
   REFRESH_MAP entry in core/api.js in the same session as this file.

   Dependencies (plain-script globals loaded earlier in index.html):
   api.js: getAll, insert, update, refreshTable, refreshTables
   data-loader.js: loadStudentFees
   finance-formulas.js: applyCreditBalance
   fees.js: applyCredit
   permissions.js: canManageFees, myId, myRole
   state.js: state
   utils.js: esc, fmtCurrency, fmtDate, debounce
   toast.js: showToast
   modals.js: showModal, closeModal, confirmDialog
   logger.js: logAction
   loaders.js: window.Loaders
   ═══════════════════════════════════════════════════════════════════ */

'use strict';

async function renderCreditBalances(container, params = {}) {
    if (!container) return;

    if (!canManageFees()) {
        container.innerHTML = `<div class="alert alert-danger">Access denied.</div>`;
        return;
    }

    container.innerHTML = `<div class="dashboard-page"><div class="loading-inline">Loading credit balances…</div></div>`;

    await ensureStateLoaded();
    await loadStudentFees();
    state.creditBalances = await getAll('student_credit_balance').catch(() => []);

    let searchQuery = '';

    function studentName(id) {
        const s = (state.students || []).find(s => s.id === parseInt(id));
        return s ? `${s.first_name} ${s.last_name}` : '—';
    }

    function outstandingFeesFor(studentId) {
        return (state.studentFees || []).filter(f =>
            f.student_id === parseInt(studentId) && !f.is_paid && !f.is_waived
        );
    }

    function creditRows() {
        const rows = (state.creditBalances || []).filter(c => Number(c.credit_amount || 0) > 0);
        if (!searchQuery) return rows;
        return rows.filter(c => studentName(c.student_id).toLowerCase().includes(searchQuery));
    }

    function render() {
        const rows = creditRows();
        const totalCredit = rows.reduce((sum, c) => sum + Number(c.credit_amount || 0), 0);

        container.innerHTML = `
            <div class="dashboard-page">
                <div class="settings-section">
                    <div class="settings-section__title">Credit Balances</div>
                    <div class="settings-section__desc">Students with an overpayment not yet applied to a fee. ${rows.length} student${rows.length === 1 ? '' : 's'}, ${fmtCurrency(totalCredit)} total.</div>
                </div>

                <div class="filters-bar">
                    <input type="text" class="form-input" id="cb-search" placeholder="Search by student name…" value="${esc(searchQuery)}">
                    <button class="btn btn-outline" id="cb-add-credit-btn"><i class="fa-solid fa-plus"></i> Add Credit Manually</button>
                </div>

                <table class="logs-table">
                    <thead><tr><th>Student</th><th>Credit Balance</th><th>Outstanding Fees</th><th></th></tr></thead>
                    <tbody>
                        ${rows.map(c => {
                            const owed = outstandingFeesFor(c.student_id);
                            const owedTotal = owed.reduce((sum, f) => sum + computeFeeBalance(f).remaining, 0);
                            return `
                                <tr>
                                    <td>${esc(studentName(c.student_id))}</td>
                                    <td><span class="fee-status-chip credit">${fmtCurrency(c.credit_amount)}</span></td>
                                    <td>${owed.length ? `${owed.length} fee${owed.length === 1 ? '' : 's'} — ${fmtCurrency(owedTotal)}` : 'None'}</td>
                                    <td style="display:flex; gap:8px;">
                                        ${owed.length ? `<button class="btn btn-sm btn-primary" data-apply-credit="${c.student_id}">Apply to Fees</button>` : ''}
                                        <button class="btn btn-sm btn-outline" data-adjust-credit="${c.student_id}">Adjust</button>
                                    </td>
                                </tr>
                            `;
                        }).join('') || '<tr><td colspan="4" style="text-align:center; padding:24px;">No students currently have a credit balance.</td></tr>'}
                    </tbody>
                </table>
            </div>
        `;

        bindEvents();
    }

    async function applyCreditToFees(studentId) {
        const creditRow = (state.creditBalances || []).find(c => c.student_id === parseInt(studentId));
        const credit = creditRow ? Number(creditRow.credit_amount || 0) : 0;
        const owed = outstandingFeesFor(studentId);

        if (!credit || !owed.length) return;

        const preview = applyCreditBalance(credit, owed);
        const coveredCount = preview.feesCovered.length + (preview.partial ? 1 : 0);

        const ok = await confirmDialog(
            `Apply ${fmtCurrency(preview.creditUsed)} of credit to ${esc(studentName(studentId))}'s outstanding fees? ` +
            `This will fully or partially cover ${coveredCount} fee${coveredCount === 1 ? '' : 's'}.`,
            'Apply Credit'
        );
        if (!ok) return;

        try {
            const result = await applyCredit(studentId, credit, owed);
            await logAction('CREDIT_APPLIED', 'student_credit_balance', creditRow?.id, {
                student_id: studentId, applied: result.applied, feesUpdated: result.feesUpdated
            });
            showToast('Credit applied', 'success', `${fmtCurrency(result.applied)} applied across ${result.feesUpdated} fee${result.feesUpdated === 1 ? '' : 's'}.`);
            state.creditBalances = await getAll('student_credit_balance').catch(() => []);
            render();
        } catch (err) {
            showToast('Could not apply credit', 'error', err.message);
        }
    }

    function adjustForm(studentId, existing) {
        const current = existing ? Number(existing.credit_amount || 0) : 0;
        return `
            <form id="cb-adjust-form">
                <div class="setting-desc" style="margin-bottom:10px;">Current balance: <strong>${fmtCurrency(current)}</strong></div>
                <div class="form-group">
                    <label class="form-label">Adjustment</label>
                    <select name="direction" class="form-select">
                        <option value="add">Add credit</option>
                        <option value="subtract">Remove credit</option>
                    </select>
                </div>
                <div class="form-group">
                    <label class="form-label">Amount (RWF)</label>
                    <input type="number" name="amount" class="form-input" min="0" required>
                </div>
                <div class="form-group">
                    <label class="form-label">Reason (required)</label>
                    <textarea name="reason" class="form-input" rows="2" placeholder="e.g. Manual correction, refund adjustment…" required></textarea>
                </div>
            </form>
        `;
    }

    function openAdjustModal(studentId) {
        const existing = (state.creditBalances || []).find(c => c.student_id === parseInt(studentId));
        window.showModal(adjustForm(studentId, existing), {
            title: `Adjust Credit — ${esc(studentName(studentId))}`,
            footer: `<button class="btn btn-outline" data-close>Cancel</button>
                     <button class="btn btn-primary" id="cb-save-adjust-btn">Save</button>`
        });

        document.getElementById('cb-save-adjust-btn').onclick = async () => {
            const form = document.getElementById('cb-adjust-form');
            const data = Object.fromEntries(new FormData(form).entries());
            const amount = Number(data.amount);

            if (!amount || amount <= 0) {
                showToast('Invalid amount', 'error', 'Enter a positive amount.');
                return;
            }
            if (!data.reason?.trim()) {
                showToast('Reason required', 'error');
                return;
            }

            const current = existing ? Number(existing.credit_amount || 0) : 0;
            const delta = data.direction === 'add' ? amount : -amount;
            const newBalance = Math.max(0, current + delta);

            try {
                if (existing) {
                    await update('student_credit_balance', existing.id, {
                        credit_amount: newBalance, updated_at: new Date().toISOString()
                    });
                } else {
                    await insert('student_credit_balance', {
                        student_id: studentId, credit_amount: newBalance
                    });
                }
                await logAction('CREDIT_ADJUSTED', 'student_credit_balance', existing?.id, {
                    student_id: studentId, direction: data.direction, amount, reason: data.reason
                });
                showToast('Credit balance updated', 'success');
                window.closeModal();
                state.creditBalances = await getAll('student_credit_balance').catch(() => []);
                render();
            } catch (err) {
                showToast('Could not update balance', 'error', err.message);
            }
        };
    }

    function openAddCreditSearch() {
        const studentsWithoutCredit = (state.students || []).filter(s =>
            !(state.creditBalances || []).some(c => c.student_id === s.id && Number(c.credit_amount || 0) > 0)
        );

        window.showModal(`
            <div class="form-group">
                <label class="form-label">Student</label>
                <select id="cb-new-select" class="form-select">
                    <option value="">— Select a student —</option>
                    ${studentsWithoutCredit.map(s => `
                        <option value="${s.id}">${esc(s.last_name)}, ${esc(s.first_name)} (${esc(s.student_code || s.code || '')})</option>
                    `).join('')}
                </select>
            </div>
        `, {
            title: 'Add Credit Manually',
            footer: `<button class="btn btn-outline" data-close>Cancel</button>
                     <button class="btn btn-primary" id="cb-new-continue-btn">Continue</button>`
        });

        document.getElementById('cb-new-continue-btn').onclick = () => {
            const studentId = document.getElementById('cb-new-select').value;
            if (!studentId) {
                showToast('Select a student', 'error');
                return;
            }
            window.closeModal();
            openAdjustModal(studentId);
        };
    }

    function bindEvents() {
        document.getElementById('cb-search')?.addEventListener('input', debounce((e) => {
            searchQuery = e.target.value.trim().toLowerCase();
            render();
        }, DEBOUNCE_SEARCH));

        document.getElementById('cb-add-credit-btn')?.addEventListener('click', openAddCreditSearch);

        container.querySelectorAll('[data-apply-credit]').forEach(btn => {
            btn.addEventListener('click', () => applyCreditToFees(btn.dataset.applyCredit));
        });

        container.querySelectorAll('[data-adjust-credit]').forEach(btn => {
            btn.addEventListener('click', () => openAdjustModal(btn.dataset.adjustCredit));
        });
    }

    render();
}

function destroyCreditBalances() {
    // Nothing to tear down — no timers/listeners outlive the container.
}

/* ═══════════════════════════════════════════════════════════════════
   EXPOSE
   ═══════════════════════════════════════════════════════════════════ */

window.renderCreditBalances = renderCreditBalances;
window.destroyCreditBalances = destroyCreditBalances;
