/* ═══════════════════════════════════════════════════════════════════
   js/modules/finance/fee-waivers.js
   ═══════════════════════════════════════════════════════════════════
   Purpose : Grant fee waivers (full / percentage / partial) with a
             reason, and keep an audit trail of every waiver granted.
             - Student search -> outstanding fee list
             - Waiver type chips (full / percentage / partial) with a
               live preview of the resulting balance via computeWaiver()
             - Reason required on every waiver (audit requirement)
             - Writes both the fee_waivers audit table AND the
               denormalized waived_amount/is_waived fields on
               student_fees (the fields computeFeeBalance() actually
               reads for balance calculations)
             - Recent waivers list for review, newest first
   Roles   : admin, accountant (canGrantWaivers())

   Table: fee_waivers { id, student_fee_id, student_id, waiver_type,
                          waiver_value, waived_amount, reason,
                          granted_by, granted_by_name, created_at }
   This table existed in BACKUP_ALL_TABLES but nothing wrote to it
   before this file — it was a placeholder waiting for this page.

   Dependencies (plain-script globals loaded earlier in index.html):
   api.js: getAll, insert, update, refreshTable, refreshTables
   data-loader.js: loadStudentFees
   finance-formulas.js: computeFeeBalance, computeWaiver
   fees.js: getFeeStatusDisplay
   permissions.js: canGrantWaivers, myId, myRole
   state.js: state, getActiveYearId, getActiveYear
   utils.js: esc, fmtCurrency, fmtDate, debounce
   toast.js: showToast
   modals.js: confirmDialog
   logger.js: logAction
   loaders.js: window.Loaders
   ═══════════════════════════════════════════════════════════════════ */

'use strict';

async function renderFeeWaivers(container, params = {}) {
    if (!container) return;

    if (!canGrantWaivers()) {
        container.innerHTML = `<div class="alert alert-danger">Access denied.</div>`;
        return;
    }

    container.innerHTML = `<div class="dashboard-page"><div class="loading-inline">Loading fee waivers…</div></div>`;

    await ensureStateLoaded();
    await loadStudentFees();
    const recentWaivers = await getAll('fee_waivers').catch(() => []);
    recentWaivers.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));

    let selectedStudentId = params.studentId || null;
    let selectedFee = null;
    let waiverType = 'full';
    let waiverValue = 100;

    function studentName(id) {
        const s = (state.students || []).find(s => s.id === parseInt(id));
        return s ? `${s.first_name} ${s.last_name}` : '—';
    }

    function outstandingFeesFor(studentId) {
        return (state.studentFees || []).filter(f =>
            f.student_id === parseInt(studentId) &&
            !f.is_paid && !f.is_waived
        ).sort((a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0));
    }

    function render() {
        const fees = selectedStudentId ? outstandingFeesFor(selectedStudentId) : [];

        container.innerHTML = `
            <div class="dashboard-page">
                <div class="settings-section">
                    <div class="settings-section__title">Fee Waivers</div>
                    <div class="settings-section__desc">Grant a full, percentage, or partial waiver on an outstanding fee. Every waiver requires a reason and is logged for audit.</div>
                </div>

                <div class="setting-card" style="margin-bottom:16px;">
                    <div class="form-group">
                        <label class="form-label">Student</label>
                        <select id="fw-student-select" class="form-select">
                            <option value="">— Select a student —</option>
                            ${(state.students || []).map(s => `
                                <option value="${s.id}" ${String(s.id) === String(selectedStudentId) ? 'selected' : ''}>
                                    ${esc(s.last_name)}, ${esc(s.first_name)} (${esc(s.student_code || s.code || '')})
                                </option>
                            `).join('')}
                        </select>
                    </div>
                </div>

                ${selectedStudentId ? renderFeeList(fees) : ''}
                ${selectedFee ? renderWaiverForm() : ''}

                <div class="settings-section__title" style="margin-top:24px;">Recent Waivers</div>
                <table class="logs-table">
                    <thead><tr><th>Student</th><th>Type</th><th>Amount Waived</th><th>Reason</th><th>Granted By</th><th>When</th></tr></thead>
                    <tbody>
                        ${recentWaivers.slice(0, 50).map(w => `
                            <tr>
                                <td>${esc(studentName(w.student_id))}</td>
                                <td><span class="waiver-type-chip" style="display:inline-block;">${esc(w.waiver_type)}</span></td>
                                <td>${fmtCurrency(w.waived_amount)}</td>
                                <td>${esc(w.reason || '—')}</td>
                                <td>${esc(w.granted_by_name || '—')}</td>
                                <td>${fmtDate(w.created_at)}</td>
                            </tr>
                        `).join('') || '<tr><td colspan="6" style="text-align:center; padding:20px;">No waivers granted yet.</td></tr>'}
                    </tbody>
                </table>
            </div>
        `;

        bindEvents();
    }

    function renderFeeList(fees) {
        if (!fees.length) {
            return `<div class="setting-card" style="text-align:center; padding:24px;">No outstanding, unwaived fees for this student.</div>`;
        }
        return `
            <table class="logs-table" style="margin-bottom:16px;">
                <thead><tr><th>Fee</th><th>Amount</th><th>Balance</th><th>Status</th><th></th></tr></thead>
                <tbody>
                    ${fees.map(fee => {
                        const bal = computeFeeBalance(fee);
                        const status = getFeeStatusDisplay(fee);
                        return `
                            <tr class="fee-row ${selectedFee?.id === fee.id ? 'fee-row-selected' : ''}">
                                <td>${esc(fee.fee_name || fee.description || 'Fee')}</td>
                                <td>${fmtCurrency(fee.amount)}</td>
                                <td>${fmtCurrency(bal.remaining)}</td>
                                <td><span class="badge ${status.badgeClass}">${esc(status.label)}</span></td>
                                <td><button class="btn btn-sm btn-primary" data-select-fee="${fee.id}">Waive</button></td>
                            </tr>
                        `;
                    }).join('')}
                </tbody>
            </table>
        `;
    }

    function renderWaiverForm() {
        const bal = computeFeeBalance(selectedFee);
        const preview = computeWaiver(bal.effective, waiverType, waiverValue);

        return `
            <div class="setting-card" id="fw-waiver-form" style="margin-bottom:16px;">
                <div class="setting-title">Waive: ${esc(selectedFee.fee_name || selectedFee.description || 'Fee')}</div>

                <div class="waiver-type-row" style="margin:14px 0;">
                    <div class="waiver-type-chip ${waiverType === 'full' ? 'selected' : ''}" data-waiver-type="full">Full</div>
                    <div class="waiver-type-chip ${waiverType === 'percentage' ? 'selected' : ''}" data-waiver-type="percentage">Percentage</div>
                    <div class="waiver-type-chip ${waiverType === 'partial' ? 'selected' : ''}" data-waiver-type="partial">Partial Amount</div>
                </div>

                ${waiverType !== 'full' ? `
                    <div class="form-group">
                        <label class="form-label">${waiverType === 'percentage' ? 'Percentage (%)' : 'Amount (RWF)'}</label>
                        <input type="number" id="fw-waiver-value" class="form-input" value="${waiverValue}" min="0" ${waiverType === 'percentage' ? 'max="100"' : ''}>
                    </div>
                ` : ''}

                <div class="setting-desc" style="margin:10px 0;">
                    Waiving <strong>${fmtCurrency(preview.waivedAmount)}</strong> — new balance:
                    <strong>${fmtCurrency(Math.max(0, bal.remaining - preview.waivedAmount))}</strong>
                </div>

                <div class="form-group">
                    <label class="form-label">Reason (required)</label>
                    <textarea id="fw-reason" class="form-input" rows="2" placeholder="e.g. Financial hardship, sibling discount, scholarship…"></textarea>
                </div>

                <div style="display:flex; gap:10px;">
                    <button class="btn btn-primary" id="fw-confirm-btn">Grant Waiver</button>
                    <button class="btn btn-outline" id="fw-cancel-btn">Cancel</button>
                </div>
            </div>
        `;
    }

    async function grantWaiver() {
        const reasonEl = document.getElementById('fw-reason');
        const reason = reasonEl?.value.trim();
        if (!reason) {
            showToast('Reason required', 'error', 'Please explain why this waiver is being granted.');
            return;
        }

        const btn = document.getElementById('fw-confirm-btn');
        const ok = await confirmDialog(
            `Grant this waiver? This will reduce the amount owed for ${esc(studentName(selectedStudentId))}.`,
            'Confirm Waiver'
        );
        if (!ok) return;

        window.Loaders?.button?.start(btn, 'Granting...');
        try {
            const bal = computeFeeBalance(selectedFee);
            const result = computeWaiver(bal.effective, waiverType, waiverValue);

            await update('student_fees', selectedFee.id, {
                waived_amount: Number(selectedFee.waived_amount || 0) + result.waivedAmount,
                is_waived: waiverType === 'full' || (result.waivedAmount >= bal.remaining),
                updated_at: new Date().toISOString(),
            });

            const waiverRow = await insert('fee_waivers', {
                student_fee_id: selectedFee.id,
                student_id: selectedStudentId,
                waiver_type: waiverType,
                waiver_value: waiverType === 'full' ? null : waiverValue,
                waived_amount: result.waivedAmount,
                reason,
                granted_by: myId(),
                granted_by_name: state.currentUser?.name || myRole(),
            });

            await refreshTables(['student_fees', 'fee_waivers']);
            await logAction('FEE_WAIVER_GRANTED', 'fee_waivers', waiverRow?.id, {
                student_id: selectedStudentId, amount: result.waivedAmount, type: waiverType
            });

            showToast('Waiver granted', 'success', `${fmtCurrency(result.waivedAmount)} waived.`);
            selectedFee = null;
            waiverType = 'full';
            waiverValue = 100;
            await refreshLocalFeesAndRender();
        } catch (err) {
            showToast('Could not grant waiver', 'error', err.message);
        } finally {
            window.Loaders?.button?.stop(btn);
        }
    }

    async function refreshLocalFeesAndRender() {
        await loadStudentFees();
        const updated = await getAll('fee_waivers').catch(() => []);
        updated.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
        recentWaivers.length = 0;
        recentWaivers.push(...updated);
        render();
    }

    function bindEvents() {
        document.getElementById('fw-student-select')?.addEventListener('change', (e) => {
            selectedStudentId = e.target.value || null;
            selectedFee = null;
            render();
        });

        container.querySelectorAll('[data-select-fee]').forEach(btn => {
            btn.addEventListener('click', () => {
                selectedFee = outstandingFeesFor(selectedStudentId).find(f => String(f.id) === btn.dataset.selectFee);
                waiverType = 'full';
                waiverValue = 100;
                render();
                document.getElementById('fw-waiver-form')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            });
        });

        container.querySelectorAll('[data-waiver-type]').forEach(chip => {
            chip.addEventListener('click', () => {
                waiverType = chip.dataset.waiverType;
                waiverValue = waiverType === 'percentage' ? 100 : 0;
                render();
            });
        });

        document.getElementById('fw-waiver-value')?.addEventListener('input', (e) => {
            waiverValue = Number(e.target.value) || 0;
            render();
        });

        document.getElementById('fw-confirm-btn')?.addEventListener('click', grantWaiver);
        document.getElementById('fw-cancel-btn')?.addEventListener('click', () => {
            selectedFee = null;
            render();
        });
    }

    render();
}

function destroyFeeWaivers() {
    // Nothing to tear down — no timers/listeners outlive the container.
}

/* ═══════════════════════════════════════════════════════════════════
   EXPOSE
   ═══════════════════════════════════════════════════════════════════ */

window.renderFeeWaivers = renderFeeWaivers;
window.destroyFeeWaivers = destroyFeeWaivers;
