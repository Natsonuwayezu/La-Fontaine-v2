/* ═══════════════════════════════════════════════════════════════════
   js/modules/finance/student-statements.js
   ═══════════════════════════════════════════════════════════════════
   Purpose : Per-student account statement module.
             - Search / select student
             - Date range filter
             - Ledger table: fees (debit) + payments (credit)
               with running balance column
             - Balance summary box (outstanding / settled / credit)
             - Print A4 statement button
             - Export to CSV
             - Also supports family statement (all children combined)
   Roles   : admin, accountant
   ═══════════════════════════════════════════════════════════════════ */

'use strict';

let _ssStudentId = null;
let _ssDateFrom = '';
let _ssDateTo = '';
let _ssMode = 'student';   // 'student' | 'family'
let _ssFamilyId = null;

async function renderStudentStatements(params = {}) {
    const app = document.getElementById('app');
    if (!canViewPayments()) {
        app.innerHTML = `<div class="alert alert-danger">Access denied.</div>`;
        return;
    }

    await ensureStateLoaded();
    await loadStudentFees();
    await loadPayments();

    _ssStudentId = params.studentId || null;
    _ssFamilyId = params.familyId || null;
    _ssMode = _ssFamilyId ? 'family' : 'student';

    // Default date range: full active year
    const activeYear = getActiveYear();
    _ssDateFrom = activeYear?.start_date?.split('T')[0] || '';
    _ssDateTo = activeYear?.end_date?.split('T')[0] || todayISO();

    const students = (state.students || [])
        .filter(s => !s.is_deleted)
        .sort((a, b) => (a.last_name || '').localeCompare(b.last_name || ''));

    const families = (state.families || [])
        .sort((a, b) => (a.parent_name || '').localeCompare(b.parent_name || ''));

    app.innerHTML = `
    <div class="module-wrap">

        <div class="mod-topbar">
            <div class="mod-topbar-left">
                <h1 class="mod-title">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
                         stroke="var(--primary)" stroke-width="2">
                        <use href="assets/icons/sprite.svg#icon-file-text"/>
                    </svg>
                    Student Statements
                </h1>
                <span class="mod-meta">${esc(activeYear?.year_name || '—')}</span>
            </div>
            <div class="mod-topbar-right">
                <button class="topbar-btn" id="ss-btn-export" style="display:none"
                        onclick="ssExport()">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                         stroke="currentColor" stroke-width="2">
                        <use href="assets/icons/sprite.svg#icon-download"/>
                    </svg>
                    Export CSV
                </button>
                <button class="topbar-btn btn-fill" id="ss-btn-print" style="display:none"
                        onclick="ssPrint()">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                         stroke="currentColor" stroke-width="2">
                        <use href="assets/icons/sprite.svg#icon-printer"/>
                    </svg>
                    Print Statement
                </button>
            </div>
        </div>

        <!-- Selector card -->
        <div class="section-card" style="margin-bottom:16px;">

            <!-- Mode tabs -->
            <div class="tabs" style="margin-bottom:16px;">
                <button class="tab-btn ${_ssMode === 'student' ? 'active' : ''}"
                        onclick="ssSwitchMode('student')">
                    Individual Student
                </button>
                <button class="tab-btn ${_ssMode === 'family' ? 'active' : ''}"
                        onclick="ssSwitchMode('family')">
                    Family
                </button>
            </div>

            <div class="form-row" style="align-items:flex-end;">
                <!-- Student selector -->
                <div class="field" id="ss-student-field"
                     style="${_ssMode === 'family' ? 'display:none' : ''}; flex:2;">
                    <label class="field-label">Student</label>
                    <div class="input-icon-wrap">
                        <svg viewBox="0 0 24 24" fill="none" stroke-width="2">
                            <use href="assets/icons/sprite.svg#icon-search"/>
                        </svg>
                        <select id="ss-student-select" class="input"
                                onchange="ssSelectStudent(this.value)">
                            <option value="">— Select student —</option>
                            ${students.map(s => {
        const c = getClass(s.class_id);
        return `<option value="${s.id}"
                                    ${s.id === _ssStudentId ? 'selected' : ''}>
                                    ${esc(s.last_name)}, ${esc(s.first_name)}
                                    (${esc(s.code)}) — ${esc(c?.name || '?')}
                                </option>`;
    }).join('')}
                        </select>
                    </div>
                </div>

                <!-- Family selector -->
                <div class="field" id="ss-family-field"
                     style="${_ssMode === 'student' ? 'display:none' : ''}; flex:2;">
                    <label class="field-label">Family</label>
                    <select id="ss-family-select" class="input"
                            onchange="ssSelectFamily(this.value)">
                        <option value="">— Select family —</option>
                        ${families.map(f => `
                            <option value="${f.id}" ${f.id === _ssFamilyId ? 'selected' : ''}>
                                ${esc(f.family_code || '—')} — ${esc(f.parent_name || 'Unknown')}
                            </option>`
    ).join('')}
                    </select>
                </div>

                <!-- Date range -->
                <div class="field">
                    <label class="field-label">From</label>
                    <input type="date" id="ss-from" class="input"
                           value="${_ssDateFrom}"
                           onchange="ssDateChange()">
                </div>
                <div class="field">
                    <label class="field-label">To</label>
                    <input type="date" id="ss-to" class="input"
                           value="${_ssDateTo}"
                           onchange="ssDateChange()">
                </div>

                <div class="field" style="flex:0 0 auto;">
                    <button class="btn btn-secondary" onclick="ssLoad()">
                        Generate Statement
                    </button>
                </div>
            </div>
        </div>

        <!-- Statement content -->
        <div id="ss-content">
            <div class="empty-state">
                <div class="es-icon">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none"
                         stroke="currentColor" stroke-width="1.2" opacity="0.3">
                        <use href="assets/icons/sprite.svg#icon-file-text"/>
                    </svg>
                </div>
                <div class="es-title">Select a student or family above</div>
                <div class="es-sub">then click Generate Statement</div>
            </div>
        </div>

    </div>`;

    // Auto-load if params provided
    if (_ssStudentId || _ssFamilyId) {
        setTimeout(() => ssLoad(), 80);
    }
}

/* ── MODE / SELECTION ───────────────────────────────────────────── */
window.ssSwitchMode = function (mode) {
    _ssMode = mode;
    const sf = document.getElementById('ss-student-field');
    const ff = document.getElementById('ss-family-field');
    if (sf) sf.style.display = mode === 'student' ? '' : 'none';
    if (ff) ff.style.display = mode === 'family' ? '' : 'none';
    document.querySelectorAll('.tab-btn').forEach(b => {
        b.classList.toggle('active', b.textContent.toLowerCase().includes(mode));
    });
};

window.ssSelectStudent = function (id) { _ssStudentId = id ? parseInt(id) : null; };
window.ssSelectFamily = function (id) { _ssFamilyId = id ? parseInt(id) : null; };
window.ssDateChange = function () {
    _ssDateFrom = document.getElementById('ss-from')?.value || '';
    _ssDateTo = document.getElementById('ss-to')?.value || '';
};

/* ── LOAD / GENERATE ────────────────────────────────────────────── */
window.ssLoad = function () {
    _ssDateFrom = document.getElementById('ss-from')?.value || '';
    _ssDateTo = document.getElementById('ss-to')?.value || todayISO();

    if (_ssMode === 'family') {
        if (!_ssFamilyId) { showToast('Select a family.', 'warning'); return; }
        _ssRenderFamilyStatement();
    } else {
        if (!_ssStudentId) { showToast('Select a student.', 'warning'); return; }
        _ssRenderStudentStatement();
    }

    // Show action buttons
    const btnPrint = document.getElementById('ss-btn-print');
    const btnExport = document.getElementById('ss-btn-export');
    if (btnPrint) btnPrint.style.display = 'inline-flex';
    if (btnExport) btnExport.style.display = 'inline-flex';
};

/* ── STUDENT STATEMENT ──────────────────────────────────────────── */
function _ssRenderStudentStatement() {
    const content = document.getElementById('ss-content');
    const student = getStudent(_ssStudentId);
    if (!student) { content.innerHTML = `<div class="alert alert-danger">Student not found.</div>`; return; }

    const cls = getClass(student.class_id);
    const yearId = getActiveYearId();
    const fees = (state.studentFees || []).filter(f => f.student_id === _ssStudentId && f.academic_year_id === yearId);
    const payments = (state.payments || []).filter(p =>
        p.student_id === _ssStudentId && !p.is_reversed &&
        (!_ssDateFrom || (p.payment_date || '') >= _ssDateFrom) &&
        (!_ssDateTo || (p.payment_date || '') <= _ssDateTo)
    );
    const creditRow = (state.creditBalances || []).find(c => c.student_id === _ssStudentId);
    const creditBal = creditRow ? Number(creditRow.credit_amount || 0) : 0;
    const summary = computeStudentFeeSummary(fees, creditBal);

    content.innerHTML = _ssBuildStatementHTML(
        [student], [cls], fees, payments, creditBal, summary,
        `${student.first_name} ${student.last_name} (${student.code})`
    );
}

/* ── FAMILY STATEMENT ───────────────────────────────────────────── */
function _ssRenderFamilyStatement() {
    const content = document.getElementById('ss-content');
    const family = (state.families || []).find(f => f.id === _ssFamilyId);
    if (!family) { content.innerHTML = `<div class="alert alert-danger">Family not found.</div>`; return; }

    const children = (state.students || []).filter(s => s.family_id === _ssFamilyId && !s.is_deleted);
    if (children.length === 0) {
        content.innerHTML = `<div class="alert alert-warning">No children linked to this family.</div>`;
        return;
    }

    const yearId = getActiveYearId();
    const allFees = (state.studentFees || []).filter(f =>
        children.some(c => c.id === f.student_id) && f.academic_year_id === yearId
    );
    const allPayments = (state.payments || []).filter(p =>
        children.some(c => c.id === p.student_id) && !p.is_reversed &&
        (!_ssDateFrom || (p.payment_date || '') >= _ssDateFrom) &&
        (!_ssDateTo || (p.payment_date || '') <= _ssDateTo)
    );
    const allCredits = (state.creditBalances || []).filter(c => children.some(ch => ch.id === c.student_id));
    const totalCredit = allCredits.reduce((s, c) => s + Number(c.credit_amount || 0), 0);
    const summary = computeStudentFeeSummary(allFees, totalCredit);
    const classes = children.map(c => getClass(c.class_id));

    content.innerHTML = _ssBuildStatementHTML(
        children, classes, allFees, allPayments, totalCredit, summary,
        `${family.family_code || '—'} — ${family.parent_name || 'Family'}`,
        true
    );
}

/* ── BUILD STATEMENT HTML ───────────────────────────────────────── */
function _ssBuildStatementHTML(students, classes, fees, payments, creditBal, summary, title, isFamily = false) {
    const activeYear = getActiveYear();
    const today = fmtDate(todayISO());

    // Build ledger: combine fees (debits) + payments (credits), sorted by date
    const ledger = [
        ...fees.map(f => ({
            date: f.created_at?.split('T')[0] || '',
            desc: `Fee: ${f.fee_name || '—'}` + (isFamily ? ` (${(students.find(s => s.id === f.student_id)?.first_name) || '?'
                })` : ''),
            debit: Number(f.amount || 0) - Number(f.waived_amount || 0),
            credit: 0,
            type: 'fee',
            ref: '',
        })),
        ...payments.map(p => ({
            date: p.payment_date || '',
            desc: `Payment — ${p.payment_method || '—'}` + (isFamily ? ` (${(students.find(s => s.id === p.student_id)?.first_name) || '?'
                })` : ''),
            debit: 0,
            credit: Number(p.total_amount || 0),
            type: 'payment',
            ref: p.receipt_number || '',
        })),
    ].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

    // Running balance
    let running = 0;
    const tableRows = ledger.map(item => {
        running += item.debit - item.credit;
        const runColor = running > 0 ? 'var(--color-danger)' : 'var(--color-success)';
        return `
        <tr class="${item.type === 'payment' ? 'ledger-row-credit' : 'ledger-row-debit'}">
            <td style="font-size:12px;">${esc(fmtDate(item.date))}</td>
            <td>${esc(item.desc)}</td>
            <td style="font-family:monospace;font-size:11px;color:var(--text-muted);">${esc(item.ref)}</td>
            <td class="text-right" style="color:var(--color-danger);font-weight:${item.debit > 0 ? 700 : 400};">
                ${item.debit ? fmtCurrency(item.debit) : '—'}
            </td>
            <td class="text-right" style="color:var(--color-success);font-weight:${item.credit > 0 ? 700 : 400};">
                ${item.credit ? fmtCurrency(item.credit) : '—'}
            </td>
            <td class="text-right" style="font-weight:700;color:${runColor};">
                ${fmtCurrency(Math.abs(running))} ${running > 0 ? 'DR' : 'CR'}
            </td>
        </tr>`;
    }).join('') || `<tr><td colspan="6" class="text-center text-muted" style="padding:20px;">No transactions in this period.</td></tr>`;

    const outColor = summary.outstanding > 0 ? 'var(--color-danger)' : 'var(--color-success)';
    const outLabel = summary.outstanding > 0 ? 'AMOUNT DUE' : creditBal > 0 ? 'CREDIT BALANCE' : 'ACCOUNT SETTLED';

    return `
    <!-- Statement header -->
    <div class="section-card">
        <div class="statement-header-row">
            <div>
                <div class="statement-title">${esc(title)}</div>
                <div class="statement-meta">
                    ${isFamily ? 'Family Statement' : 'Student Statement'} ·
                    ${esc(activeYear?.year_name || '—')} ·
                    ${_ssDateFrom ? `${fmtDate(_ssDateFrom)} – ${fmtDate(_ssDateTo)}` : 'All dates'} ·
                    Printed: ${today}
                </div>
                ${!isFamily ? (() => {
            const s = students[0];
            const cls = classes[0];
            return `<div class="statement-student-info">
                        <span>${esc(s?.code || '')}</span>
                        <span>${esc(cls?.name || '—')}</span>
                        <span>${esc(s?.gender || '—')}</span>
                    </div>`;
        })() : ''}
            </div>
            <div class="statement-balance-box"
                 style="border-color:${outColor};">
                <div class="sbb-label">${outLabel}</div>
                <div class="sbb-amount" style="color:${outColor};">
                    ${summary.outstanding > 0
            ? fmtCurrency(summary.outstanding)
            : creditBal > 0
                ? fmtCurrency(creditBal)
                : fmtCurrency(0)}
                </div>
                <div class="sbb-words">
                    ${summary.outstanding > 0
            ? amountInWords(Math.round(summary.outstanding))
            : ''}
                </div>
            </div>
        </div>

        <!-- Summary bar -->
        <div class="statement-summary-bar">
            <div class="ssb-item">
                <span class="ssb-label">Total Fees</span>
                <span class="ssb-value">${fmtCurrency(summary.total)}</span>
            </div>
            <div class="ssb-item">
                <span class="ssb-label">Waivers</span>
                <span class="ssb-value">— ${fmtCurrency(summary.waived)}</span>
            </div>
            <div class="ssb-item">
                <span class="ssb-label">Net Expected</span>
                <span class="ssb-value">${fmtCurrency(summary.effective)}</span>
            </div>
            <div class="ssb-item">
                <span class="ssb-label">Total Paid</span>
                <span class="ssb-value" style="color:var(--color-success);">
                    ${fmtCurrency(summary.paid)}
                </span>
            </div>
            ${creditBal > 0 ? `
            <div class="ssb-item">
                <span class="ssb-label">Credit Balance</span>
                <span class="ssb-value" style="color:var(--teal);">
                    +${fmtCurrency(creditBal)}
                </span>
            </div>` : ''}
        </div>

        <!-- Ledger table -->
        <div class="table-wrap" style="margin-top:16px;">
            <table class="data-table">
                <thead>
                    <tr>
                        <th style="min-width:100px;">Date</th>
                        <th>Description</th>
                        <th style="min-width:120px;">Reference</th>
                        <th class="text-right">Debit (RWF)</th>
                        <th class="text-right">Credit (RWF)</th>
                        <th class="text-right">Balance</th>
                    </tr>
                </thead>
                <tbody>${tableRows}</tbody>
                <tfoot>
                    <tr>
                        <td colspan="3"><strong>TOTALS</strong></td>
                        <td class="text-right">
                            <strong style="color:var(--color-danger);">
                                ${fmtCurrency(ledger.reduce((s, r) => s + r.debit, 0))}
                            </strong>
                        </td>
                        <td class="text-right">
                            <strong style="color:var(--color-success);">
                                ${fmtCurrency(ledger.reduce((s, r) => s + r.credit, 0))}
                            </strong>
                        </td>
                        <td class="text-right">
                            <strong style="color:${outColor};">
                                ${fmtCurrency(summary.outstanding)} ${summary.outstanding > 0 ? 'DR' : 'CR'}
                            </strong>
                        </td>
                    </tr>
                </tfoot>
            </table>
        </div>

        <!-- Footer note -->
        <p class="statement-footer-note">
            Generated by ${esc(state.schoolSettings?.school_name || APP_NAME)} ·
            ${today} ·
            ${esc(state.currentUser?.name || '')}
        </p>
    </div>`;
}

/* ── PRINT ──────────────────────────────────────────────────────── */
window.ssPrint = function () {
    if (_ssMode === 'family' && _ssFamilyId) {
        const family = (state.families || []).find(f => f.id === _ssFamilyId);
        const children = (state.students || []).filter(s => s.family_id === _ssFamilyId && !s.is_deleted);
        const yearId = getActiveYearId();
        const allFees = (state.studentFees || []).filter(f => children.some(c => c.id === f.student_id) && f.academic_year_id === yearId);
        const allPay = (state.payments || []).filter(p => children.some(c => c.id === p.student_id) && !p.is_reversed);
        const allCr = (state.creditBalances || []).filter(c => children.some(ch => ch.id === c.student_id));
        const totalCr = allCr.reduce((s, c) => s + Number(c.credit_amount || 0), 0);
        // Use first child for the printStudentStatement
        if (children.length > 0) {
            printStudentStatement(children[0], allFees, allPay, totalCr, getActiveYear());
        }
        return;
    }

    if (!_ssStudentId) return;
    const student = getStudent(_ssStudentId);
    const yearId = getActiveYearId();
    const fees = (state.studentFees || []).filter(f => f.student_id === _ssStudentId && f.academic_year_id === yearId);
    const payments = (state.payments || []).filter(p => p.student_id === _ssStudentId && !p.is_reversed);
    const creditRow = (state.creditBalances || []).find(c => c.student_id === _ssStudentId);
    const creditBal = creditRow ? Number(creditRow.credit_amount || 0) : 0;
    printStudentStatement(student, fees, payments, creditBal, getActiveYear());
};

/* ── EXPORT ─────────────────────────────────────────────────────── */
window.ssExport = function () {
    const yearId = getActiveYearId();
    if (_ssMode === 'family' && _ssFamilyId) {
        const children = (state.students || []).filter(s => s.family_id === _ssFamilyId && !s.is_deleted);
        const allFees = (state.studentFees || []).filter(f => children.some(c => c.id === f.student_id) && f.academic_year_id === yearId);
        const allPay = (state.payments || []).filter(p => children.some(c => c.id === p.student_id) && !p.is_reversed);
        const rows = [
            ...allFees.map(f => {
                const s = getStudent(f.student_id);
                const b = computeFeeBalance(f);
                return { Date: fmtDate(f.created_at?.split('T')[0] || ''), Student: s ? `${s.first_name} ${s.last_name}` : '', Description: `Fee: ${f.fee_name || ''}`, Debit: b.effective, Credit: 0, Type: 'fee' };
            }),
            ...allPay.map(p => {
                const s = getStudent(p.student_id);
                return { Date: fmtDate(p.payment_date || ''), Student: s ? `${s.first_name} ${s.last_name}` : '', Description: `Payment — ${p.payment_method || ''}`, Debit: 0, Credit: p.total_amount, Type: 'payment' };
            }),
        ].sort((a, b) => a.Date < b.Date ? -1 : 1);
        exportAsCSV(rows, `Family_Statement`);
        return;
    }

    if (!_ssStudentId) return;
    const student = getStudent(_ssStudentId);
    const fees = (state.studentFees || []).filter(f => f.student_id === _ssStudentId && f.academic_year_id === yearId);
    const payments = (state.payments || []).filter(p => p.student_id === _ssStudentId && !p.is_reversed);
    const rows = [
        ...fees.map(f => {
            const b = computeFeeBalance(f);
            return { Date: fmtDate(f.created_at?.split('T')[0] || ''), Description: `Fee: ${f.fee_name || ''}`, Debit: b.effective, Credit: 0, Reference: '', Type: 'fee' };
        }),
        ...payments.map(p => ({
            Date: fmtDate(p.payment_date || ''), Description: `Payment — ${p.payment_method || ''}`,
            Debit: 0, Credit: p.total_amount, Reference: p.receipt_number || '', Type: 'payment'
        })),
    ].sort((a, b) => a.Date < b.Date ? -1 : 1);
    exportAsCSV(rows, `Statement_${student?.code || ''}`);
};

window.renderStudentStatements = renderStudentStatements;