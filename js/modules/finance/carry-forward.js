/* ═══════════════════════════════════════════════════════════════════
   js/modules/finance/carry-forward.js
   ═══════════════════════════════════════════════════════════════════
   Purpose : Carry an unpaid balance forward from one term into a new
             one — for every student who still owes money at the end
             of a term, creates a new student_fees row in the target
             term named "Balance Carried Forward" for the outstanding
             amount, so it shows up in the new term's fee list rather
             than silently disappearing when the term changes.

             Does not touch the original term's fee rows at all (their
             balance remains visible there too, for historical
             accuracy) — this only adds a new row in the target term.

   Dependencies (plain-script globals loaded earlier in index.html):
   api.js: ensureStateLoaded, getAll, insert, refreshTable
   data-loader.js: loadStudentFees
   finance-formulas.js: computeFeeBalance
   permissions.js: canManageFees, myId, myRole
   state.js: state, getActiveYearId
   utils.js: esc, fmtCurrency
   toast.js: showToast
   modals.js: confirmDialog
   logger.js: logAction
   loaders.js: window.Loaders
   ═══════════════════════════════════════════════════════════════════ */

'use strict';

async function renderCarryForward(container, params = {}) {
    if (!container) return;

    if (!canManageFees()) {
        container.innerHTML = `<div class="alert alert-danger">Access denied.</div>`;
        return;
    }

    container.innerHTML = `<div class="dashboard-page"><div class="loading-inline">Loading terms…</div></div>`;

    await ensureStateLoaded();
    await loadStudentFees();

    const terms = [...(state.terms || [])].sort((a, b) => (a.term_number || 0) - (b.term_number || 0));
    let sourceTermId = params.sourceTermId || '';
    let targetTermId = params.targetTermId || '';
    let preview = [];

    function studentName(id) {
        const s = (state.students || []).find(s => s.id === parseInt(id));
        return s ? `${s.first_name} ${s.last_name}` : '—';
    }

    function computePreview() {
        if (!sourceTermId) { preview = []; return; }
        const feesInSource = (state.studentFees || []).filter(f => String(f.term_id) === String(sourceTermId));
        const byStudent = {};
        feesInSource.forEach(f => {
            const bal = computeFeeBalance(f).remaining;
            if (bal <= 0) return;
            byStudent[f.student_id] = (byStudent[f.student_id] || 0) + bal;
        });
        preview = Object.entries(byStudent)
            .map(([studentId, balance]) => ({ studentId: Number(studentId), balance }))
            .sort((a, b) => b.balance - a.balance);
    }

    function render() {
        computePreview();
        const totalCarry = preview.reduce((sum, p) => sum + p.balance, 0);

        container.innerHTML = `
            <div class="dashboard-page">
                <div class="settings-section">
                    <div class="settings-section__title">Carry Forward Balances</div>
                    <div class="settings-section__desc">Move unpaid balances from one term into the next as a new fee, so nothing is lost when the term changes.</div>
                </div>

                <div class="setting-card" style="margin-bottom:16px; display:flex; gap:16px; flex-wrap:wrap;">
                    <div class="form-group" style="flex:1; min-width:200px;">
                        <label class="form-label">From Term</label>
                        <select id="cf-source-term" class="form-select">
                            <option value="">— Select source term —</option>
                            ${terms.map(t => `<option value="${t.id}" ${String(t.id) === String(sourceTermId) ? 'selected' : ''}>Term ${t.term_number}</option>`).join('')}
                        </select>
                    </div>
                    <div class="form-group" style="flex:1; min-width:200px;">
                        <label class="form-label">To Term</label>
                        <select id="cf-target-term" class="form-select">
                            <option value="">— Select target term —</option>
                            ${terms.map(t => `<option value="${t.id}" ${String(t.id) === String(targetTermId) ? 'selected' : ''}>Term ${t.term_number}</option>`).join('')}
                        </select>
                    </div>
                </div>

                ${sourceTermId ? `
                    <div class="settings-section__desc" style="margin-bottom:10px;">
                        ${preview.length} student${preview.length === 1 ? '' : 's'} with an outstanding balance — ${fmtCurrency(totalCarry)} total.
                    </div>
                    <table class="logs-table" style="margin-bottom:16px;">
                        <thead><tr><th>Student</th><th>Outstanding Balance</th></tr></thead>
                        <tbody>
                            ${preview.map(p => `
                                <tr><td>${esc(studentName(p.studentId))}</td><td>${fmtCurrency(p.balance)}</td></tr>
                            `).join('') || '<tr><td colspan="2" style="text-align:center; padding:20px;">No outstanding balances in this term.</td></tr>'}
                        </tbody>
                    </table>
                    <button class="btn btn-primary" id="cf-run-btn" ${(!targetTermId || !preview.length) ? 'disabled' : ''}>
                        <i class="fa-solid fa-arrow-right-long"></i> Carry ${preview.length} Balance${preview.length === 1 ? '' : 's'} Forward
                    </button>
                ` : ''}
            </div>
        `;

        bindEvents();
    }

    async function runCarryForward() {
        if (!targetTermId || !preview.length) return;
        if (String(sourceTermId) === String(targetTermId)) {
            showToast('Invalid selection', 'error', 'Source and target term must be different.');
            return;
        }

        const totalCarry = preview.reduce((sum, p) => sum + p.balance, 0);
        const ok = await confirmDialog(
            `Create a new "Balance Carried Forward" fee for ${preview.length} student${preview.length === 1 ? '' : 's'} in the target term, totaling ${fmtCurrency(totalCarry)}? This does not modify the original term's fees.`,
            'Confirm Carry Forward'
        );
        if (!ok) return;

        const btn = document.getElementById('cf-run-btn');
        window.Loaders?.button?.start(btn, 'Processing...');
        try {
            let created = 0;
            for (const p of preview) {
                await insert('student_fees', {
                    student_id: p.studentId,
                    term_id: targetTermId,
                    fee_name: 'Balance Carried Forward',
                    description: `Carried forward from a previous term`,
                    amount: p.balance,
                    paid_amount: 0,
                    waived_amount: 0,
                    is_paid: false,
                    is_waived: false,
                });
                created++;
            }

            await refreshTable('student_fees');
            await logAction('BALANCES_CARRIED_FORWARD', 'student_fees', null, {
                source_term_id: sourceTermId, target_term_id: targetTermId,
                students: created, total: totalCarry
            });

            showToast('Balances carried forward', 'success', `${created} student${created === 1 ? '' : 's'}, ${fmtCurrency(totalCarry)} total.`);
            await loadStudentFees();
            render();
        } catch (err) {
            showToast('Could not carry balances forward', 'error', err.message);
        } finally {
            window.Loaders?.button?.stop(btn);
        }
    
    if (typeof loadAllData === 'function') loadAllData({ silent: true }).catch(() => {});}

    function bindEvents() {
        document.getElementById('cf-source-term')?.addEventListener('change', (e) => {
            sourceTermId = e.target.value; render();
        });
        document.getElementById('cf-target-term')?.addEventListener('change', (e) => {
            targetTermId = e.target.value; render();
        });
        document.getElementById('cf-run-btn')?.addEventListener('click', runCarryForward);
    }

    render();
}

function destroyCarryForward() {
    // Nothing to tear down — no timers/listeners outlive the container.
}

/* ═══════════════════════════════════════════════════════════════════
   EXPOSE
   ═══════════════════════════════════════════════════════════════════ */

window.renderCarryForward = renderCarryForward;
window.destroyCarryForward = destroyCarryForward;
