/* ═══════════════════════════════════════════════════════════════════
   js/modules/finance/student-fees.js
   ═══════════════════════════════════════════════════════════════════
   Purpose : Per-student fee breakdown.
             - Search/select student
             - Show all assigned fees: amount, waived, paid, balance
             - Payment history for that student
             - Quick-pay, waive, remove buttons per fee row
             - Credit balance display
             - Tabs: Fees | Payments | Statement
   Roles   : admin, accountant
   ═══════════════════════════════════════════════════════════════════ */

'use strict';

let _sfStudentId = null;
let _sfTab = 'fees';

async function renderStudentFees(params = {}) {
    const app = document.getElementById('app');
    if (!canViewPayments()) {
        app.innerHTML = `<div class="alert alert-danger">Access denied.</div>`;
        return;
    }

    await ensureStateLoaded();
    await loadStudentFees();
    await loadPayments();

    _sfStudentId = params.studentId || null;
    _sfTab = 'fees';

    const activeYear = getActiveYear();
    const students = (state.students || [])
        .filter(s => !s.is_deleted)
        .sort((a, b) => (a.last_name || '').localeCompare(b.last_name || ''));

    app.innerHTML = `
    <div class="module-wrap">

        <div class="mod-topbar">
            <div class="mod-topbar-left">
                <h1 class="mod-title">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
                         stroke="var(--primary)" stroke-width="2">
                        <use href="assets/icons/sprite.svg#icon-user"/>
                    </svg>
                    Student Fees
                </h1>
                <span class="mod-meta">${esc(activeYear?.year_name || '—')}</span>
            </div>
            <div class="mod-topbar-right">
                <button class="topbar-btn" id="sf-btn-pay" style="display:none"
                        onclick="sfPayAll()">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                         stroke="currentColor" stroke-width="2">
                        <use href="assets/icons/sprite.svg#icon-credit-card"/>
                    </svg>
                    Record Payment
                </button>
                <button class="topbar-btn" id="sf-btn-statement" style="display:none"
                        onclick="sfPrintStatement()">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                         stroke="currentColor" stroke-width="2">
                        <use href="assets/icons/sprite.svg#icon-file-text"/>
                    </svg>
                    Print Statement
                </button>
            </div>
        </div>

        <!-- Student selector -->
        <div class="section-card" style="margin-bottom:16px;">
            <div class="field">
                <label class="field-label">Select Student</label>
                <div class="input-icon-wrap">
                    <svg viewBox="0 0 24 24" fill="none" stroke-width="2">
                        <use href="assets/icons/sprite.svg#icon-search"/>
                    </svg>
                    <select id="sf-student-select" class="input"
                            onchange="sfSelectStudent(this.value)">
                        <option value="">— Select a student —</option>
                        ${students.map(s => {
        const c = getClass(s.class_id);
        return `<option value="${s.id}"
                                ${s.id === _sfStudentId ? 'selected' : ''}>
                                ${esc(s.last_name)}, ${esc(s.first_name)}
                                (${esc(s.code)}) — ${esc(c?.name || '?')}
                            </option>`;
    }).join('')}
                    </select>
                </div>
            </div>
        </div>

        <!-- Content area -->
        <div id="sf-content">
            <div class="empty-state">
                <div class="es-icon"><svg width="48" height="48" viewBox="0 0 24 24" fill="none"
                     stroke="currentColor" stroke-width="1.2" opacity="0.3">
                    <use href="assets/icons/sprite.svg#icon-user"/>
                </svg></div>
                <div class="es-title">Select a student above</div>
            </div>
        </div>

    </div>`;

    if (_sfStudentId) {
        setTimeout(() => sfSelectStudent(_sfStudentId), 80);
    }
}

/* ── SELECT STUDENT ─────────────────────────────────────────────── */
window.sfSelectStudent = function (studentId) {
    _sfStudentId = studentId ? parseInt(studentId) : null;
    _sfTab = 'fees';

    const btnPay = document.getElementById('sf-btn-pay');
    const btnStmt = document.getElementById('sf-btn-statement');
    const content = document.getElementById('sf-content');

    if (!_sfStudentId) {
        if (btnPay) btnPay.style.display = 'none';
        if (btnStmt) btnStmt.style.display = 'none';
        content.innerHTML = `<div class="empty-state">
            <div class="es-title">Select a student above</div></div>`;
        return;
    }

    if (btnPay) btnPay.style.display = 'inline-flex';
    if (btnStmt) btnStmt.style.display = 'inline-flex';

    _sfRenderContent();
};

/* ── RENDER CONTENT ─────────────────────────────────────────────── */
function _sfRenderContent() {
    const content = document.getElementById('sf-content');
    if (!content || !_sfStudentId) return;

    const student = getStudent(_sfStudentId);
    if (!student) { content.innerHTML = `<div class="alert alert-danger">Student not found.</div>`; return; }

    const cls = getClass(student.class_id);
    const yearId = getActiveYearId();
    const fees = (state.studentFees || []).filter(f =>
        f.student_id === _sfStudentId && f.academic_year_id === yearId
    );
    const payments = (state.payments || []).filter(p =>
        p.student_id === _sfStudentId && !p.is_reversed
    ).sort((a, b) => new Date(b.payment_date) - new Date(a.payment_date));

    const creditRow = (state.creditBalances || []).find(c => c.student_id === _sfStudentId);
    const creditBal = creditRow ? Number(creditRow.credit_amount || 0) : 0;
    const summary = computeStudentFeeSummary(fees, creditBal);

    content.innerHTML = `
    <!-- Student info bar -->
    <div class="student-info-bar">
        <div class="student-avatar-lg">
            ${esc((student.first_name || '?')[0].toUpperCase())}
        </div>
        <div class="student-info-details">
            <div class="student-full-name">${esc(student.first_name)} ${esc(student.last_name)}</div>
            <div class="student-meta-row">
                <span>${esc(student.code)}</span>
                <span>${esc(cls?.name || '—')}</span>
                <span>${esc(student.gender || '—')}</span>
                <span>${esc(student.status || 'Active')}</span>
            </div>
        </div>
        <div class="student-balance-summary">
            <div class="sbs-item">
                <span class="sbs-label">Expected</span>
                <span class="sbs-value">${fmtCurrency(summary.effective)}</span>
            </div>
            <div class="sbs-item">
                <span class="sbs-label">Paid</span>
                <span class="sbs-value" style="color:var(--color-success);">${fmtCurrency(summary.paid)}</span>
            </div>
            <div class="sbs-item">
                <span class="sbs-label">Outstanding</span>
                <span class="sbs-value" style="color:${summary.outstanding > 0 ? 'var(--color-danger)' : 'var(--color-success)'};">
                    ${fmtCurrency(summary.outstanding)}
                </span>
            </div>
            ${creditBal > 0 ? `
            <div class="sbs-item">
                <span class="sbs-label">Credit</span>
                <span class="sbs-value" style="color:var(--teal);">+${fmtCurrency(creditBal)}</span>
            </div>` : ''}
        </div>
    </div>

    <!-- Tabs -->
    <div class="tabs" style="margin:16px 0 0;">
        <button class="tab-btn ${_sfTab === 'fees' ? 'active' : ''}"
                onclick="sfSwitchTab('fees')">
            Fees (${fees.length})
        </button>
        <button class="tab-btn ${_sfTab === 'payments' ? 'active' : ''}"
                onclick="sfSwitchTab('payments')">
            Payments (${payments.length})
        </button>
    </div>

    <div class="section-card" style="border-top-left-radius:0;">
        <div id="sf-tab-content">${_sfBuildTabContent(fees, payments, creditBal)}</div>
    </div>`;
}

window.sfSwitchTab = function (tab) {
    _sfTab = tab;
    const student = getStudent(_sfStudentId);
    const yearId = getActiveYearId();
    const fees = (state.studentFees || []).filter(f =>
        f.student_id === _sfStudentId && f.academic_year_id === yearId
    );
    const payments = (state.payments || []).filter(p =>
        p.student_id === _sfStudentId && !p.is_reversed
    ).sort((a, b) => new Date(b.payment_date) - new Date(a.payment_date));
    const creditBal = ((state.creditBalances || []).find(c => c.student_id === _sfStudentId)?.credit_amount) || 0;

    // Update active tab button
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.textContent.toLowerCase().startsWith(tab));
    });
    const tc = document.getElementById('sf-tab-content');
    if (tc) tc.innerHTML = _sfBuildTabContent(fees, payments, creditBal);
};

function _sfBuildTabContent(fees, payments, creditBal) {
    if (_sfTab === 'fees') return _sfBuildFeesTab(fees, creditBal);
    return _sfBuildPaymentsTab(payments);
}

function _sfBuildFeesTab(fees, creditBal) {
    if (fees.length === 0) {
        return `<div class="empty-state" style="padding:32px;">
            <div class="es-title">No fees assigned</div>
            <div class="es-sub">
                <button class="btn btn-primary" onclick="navigateTo('fee-assignments')">
                    Assign Fees
                </button>
            </div>
        </div>`;
    }

    const rows = fees.map(fee => {
        const bal = computeFeeBalance(fee);
        const status = getFeeStatusDisplay(fee);
        const sev = fee.due_date ? getOverdueSeverity(fee.due_date) : null;

        return `
        <tr>
            <td>
                <strong>${esc(fee.fee_name || '—')}</strong>
                ${fee.due_date ? `<div style="font-size:11px;color:${sev?.level === 'critical' ? 'var(--color-danger)' : 'var(--text-muted)'};">
                    Due: ${esc(fmtDate(fee.due_date))}
                    ${sev && sev.days > 0 ? `(${sev.days}d overdue)` : ''}
                </div>` : ''}
            </td>
            <td class="text-right">${fmtCurrency(bal.amount)}</td>
            <td class="text-right" style="color:var(--color-success);">${fmtCurrency(bal.waived)}</td>
            <td class="text-right">${fmtCurrency(bal.paid)}</td>
            <td class="text-right" style="font-weight:${bal.remaining > 0 ? 700 : 400};
                color:${bal.remaining > 0 ? 'var(--color-danger)' : 'var(--color-success)'};">
                ${fmtCurrency(bal.remaining)}
            </td>
            <td>
                <span class="badge" style="background:${status.color}20;color:${status.color};">
                    ${esc(status.label)}
                </span>
            </td>
            <td>
                <div style="display:flex;gap:4px;">
                    ${!fee.is_paid && !fee.is_waived ? `
                    <button class="btn btn-sm btn-primary"
                            onclick="sfPayFee(${fee.id})">Pay</button>
                    <button class="btn btn-sm btn-ghost"
                            onclick="sfWaiveFee(${fee.id},'${esc(fee.fee_name || '')}')">Waive</button>
                    ` : ''}
                    ${!fee.is_paid ? `
                    <button class="btn btn-sm btn-ghost"
                            onclick="sfRemoveFee(${fee.id},'${esc(fee.fee_name || '')}')">Remove</button>
                    ` : ''}
                </div>
            </td>
        </tr>`;
    }).join('');

    return `
    <div class="table-wrap">
        <table class="data-table">
            <thead>
                <tr>
                    <th>Fee</th>
                    <th class="text-right">Amount</th>
                    <th class="text-right">Waived</th>
                    <th class="text-right">Paid</th>
                    <th class="text-right">Remaining</th>
                    <th>Status</th>
                    <th>Actions</th>
                </tr>
            </thead>
            <tbody>${rows}</tbody>
        </table>
    </div>
    ${creditBal > 0 ? `
    <div class="alert alert-info" style="margin-top:12px;">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <use href="assets/icons/sprite.svg#icon-wallet"/>
        </svg>
        Credit balance: <strong>${fmtCurrency(creditBal)}</strong> — will be applied to next payment.
        <button class="btn btn-sm btn-ghost" style="margin-left:8px;"
                onclick="navigateTo('credit-balances')">Manage Credit</button>
    </div>` : ''}
    <div style="margin-top:12px;display:flex;gap:8px;">
        <button class="btn btn-primary" onclick="sfPayAll()">Record Payment</button>
        <button class="btn btn-secondary" onclick="navigateTo('fee-assignments')">Manage Assignments</button>
    </div>`;
}

function _sfBuildPaymentsTab(payments) {
    if (payments.length === 0) {
        return `<div class="empty-state" style="padding:32px;">
            <div class="es-title">No payments recorded yet</div>
            <button class="btn btn-primary" onclick="sfPayAll()">Record First Payment</button>
        </div>`;
    }

    const rows = payments.map(p => `
    <tr>
        <td style="font-family:monospace;font-size:12px;">${esc(p.receipt_number || '—')}</td>
        <td>${esc(fmtDate(p.payment_date || ''))}</td>
        <td class="text-right" style="font-weight:700;">${fmtCurrency(p.total_amount)}</td>
        <td>${esc(p.payment_method || '—')}</td>
        <td>${p.reference ? esc(p.reference) : '—'}</td>
        <td>${p.notes ? esc(p.notes) : '—'}</td>
        <td>
            <div style="display:flex;gap:4px;">
                <button class="btn btn-sm btn-ghost"
                        onclick="sfReprintReceipt(${p.id})">Receipt</button>
                ${iAmAdmin() ? `
                <button class="btn btn-sm btn-ghost"
                        onclick="navigateTo('payment-reversals',{paymentId:${p.id}})">Reverse</button>
                ` : ''}
            </div>
        </td>
    </tr>`).join('');

    const total = payments.reduce((s, p) => s + Number(p.total_amount || 0), 0);

    return `
    <div class="table-wrap">
        <table class="data-table">
            <thead>
                <tr>
                    <th>Receipt No.</th>
                    <th>Date</th>
                    <th class="text-right">Amount</th>
                    <th>Method</th>
                    <th>Reference</th>
                    <th>Notes</th>
                    <th>Actions</th>
                </tr>
            </thead>
            <tbody>${rows}</tbody>
            <tfoot>
                <tr>
                    <td colspan="2"><strong>TOTAL PAID</strong></td>
                    <td class="text-right" style="font-weight:800;color:var(--color-success);">
                        ${fmtCurrency(total)}
                    </td>
                    <td colspan="4"></td>
                </tr>
            </tfoot>
        </table>
    </div>`;
}

/* ── ACTIONS ─────────────────────────────────────────────────────── */
window.sfPayAll = function () {
    if (!_sfStudentId) return;
    localStorage.setItem('elf_pay_student', String(_sfStudentId));
    navigateTo('record-payment');
};

window.sfPayFee = function (feeId) {
    if (!_sfStudentId) return;
    localStorage.setItem('elf_pay_student', String(_sfStudentId));
    localStorage.setItem('elf_pay_fee_ids', JSON.stringify([feeId]));
    navigateTo('record-payment');
};

window.sfWaiveFee = function (feeId, feeName) {
    navigateTo('fee-waivers', { studentId: _sfStudentId, feeId });
};

window.sfRemoveFee = async function (feeId, feeName) {
    const confirmed = await confirmDialog(
        `Remove fee "${feeName}"?`,
        'Remove Fee',
        { confirmText: 'Remove', confirmClass: 'btn-danger' }
    );
    if (!confirmed) return;
    try {
        await remove('student_fees', feeId);
        showToast('Fee removed.', 'success');
        await refreshTable('student_fees');
        _sfRenderContent();
    } catch (err) { handleApiError(err, 'remove fee'); }
};

window.sfReprintReceipt = function (paymentId) {
    const payment = (state.payments || []).find(p => p.id === paymentId);
    const student = getStudent(_sfStudentId);
    if (!payment || !student) { showToast('Cannot find receipt data.', 'error'); return; }
    const allocs = (state.paymentAllocations || []).filter(a => a.payment_id === paymentId);
    const lines = allocs.map(a => ({
        feeName: (state.studentFees || []).find(f => f.id === a.student_fee_id)?.fee_name || '—',
        allocated: a.amount,
        owed: a.amount,
    }));
    printReceipt(payment, student, lines, payment.total_amount, false);
};

window.sfPrintStatement = function () {
    if (!_sfStudentId) return;
    const student = getStudent(_sfStudentId);
    const yearId = getActiveYearId();
    const fees = (state.studentFees || []).filter(f => f.student_id === _sfStudentId && f.academic_year_id === yearId);
    const payments = (state.payments || []).filter(p => p.student_id === _sfStudentId && !p.is_reversed);
    const creditRow = (state.creditBalances || []).find(c => c.student_id === _sfStudentId);
    const creditBal = creditRow ? Number(creditRow.credit_amount || 0) : 0;
    printStudentStatement(student, fees, payments, creditBal, getActiveYear());
};

window.renderStudentFees = renderStudentFees;