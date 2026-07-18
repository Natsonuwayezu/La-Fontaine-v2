/* ═══════════════════════════════════════════════════════════════════
   js/modules/finance/balances.js
   ═══════════════════════════════════════════════════════════════════
   Purpose : Outstanding balances view — all students sorted by
             balance (highest first), with class filter, search,
             quick-pay button, and export.
             Also shows credit balances (overpayments).
   Roles   : admin, accountant
   ═══════════════════════════════════════════════════════════════════ */

'use strict';

let _balFilter = { classId: '', status: 'all', search: '' };
let _balPage = 1;
const _balSize = 50;

async function renderBalances() {
    const app = document.getElementById('app');
    if (!canViewPayments()) {
        app.innerHTML = `<div class="alert alert-danger">Access denied.</div>`;
        return;
    }

    await ensureStateLoaded();
    await loadStudentFees();

    const activeYear = getActiveYear();

    app.innerHTML = `
    <div class="module-wrap">

        <div class="mod-topbar">
            <div class="mod-topbar-left">
                <h1 class="mod-title">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
                         stroke="var(--primary)" stroke-width="2">
                        <use href="assets/icons/sprite.svg#icon-wallet"/>
                    </svg>
                    Student Balances
                </h1>
                <span class="mod-meta">${esc(activeYear?.year_name || '—')}</span>
            </div>
            <div class="mod-topbar-right">
                <button class="topbar-btn" onclick="exportBalancesNow()">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                         stroke="currentColor" stroke-width="2">
                        <use href="assets/icons/sprite.svg#icon-download"/>
                    </svg>
                    Export
                </button>
                <button class="topbar-btn btn-fill" onclick="navigateTo('record-payment')">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                         stroke="currentColor" stroke-width="2">
                        <use href="assets/icons/sprite.svg#icon-plus-circle"/>
                    </svg>
                    Record Payment
                </button>
            </div>
        </div>

        <!-- KPI cards -->
        <div id="bal-kpis" class="stats-grid stats-grid-4" style="margin-bottom:16px;"></div>

        <!-- Filters -->
        <div class="filters-bar">
            <div class="filter-group">
                <label>Class</label>
                <select id="bal-class" class="select" onchange="balFilter('classId',this.value)">
                    <option value="">All Classes</option>
                    ${(state.classes || []).map(c =>
        `<option value="${c.id}">${esc(c.name)}</option>`
    ).join('')}
                </select>
            </div>
            <div class="filter-group">
                <label>Status</label>
                <select id="bal-status" class="select" onchange="balFilter('status',this.value)">
                    <option value="all">All Students</option>
                    <option value="owing">Owing Balance</option>
                    <option value="credit">Credit Balance</option>
                    <option value="settled">Fully Settled</option>
                </select>
            </div>
            <div class="search-group">
                <svg viewBox="0 0 24 24" fill="none" stroke-width="2">
                    <use href="assets/icons/sprite.svg#icon-search"/>
                </svg>
                <input type="text" placeholder="Search student…" class="input"
                       oninput="balFilter('search',this.value)">
            </div>
            <div class="filter-actions">
                <button class="btn btn-reset" onclick="balResetFilter()">Reset</button>
            </div>
        </div>

        <!-- Table -->
        <div class="section-card">
            <div id="bal-table-wrap">
                <div style="padding:40px;text-align:center;">Loading…</div>
            </div>
        </div>

    </div>`;

    _balRenderKPIs();
    _balRenderTable();
}

function _buildBalanceRows() {
    const yearId = getActiveYearId();
    const allFees = (state.studentFees || []).filter(f => f.academic_year_id === yearId);
    const credits = state.creditBalances || [];
    let students = (state.students || []).filter(s => !s.is_deleted);

    // Apply filters
    if (_balFilter.classId) students = students.filter(s => s.class_id === parseInt(_balFilter.classId));
    if (_balFilter.search) {
        const q = _balFilter.search.toLowerCase();
        students = students.filter(s =>
            `${s.first_name} ${s.last_name} ${s.code}`.toLowerCase().includes(q)
        );
    }

    // Compute balance per student
    let rows = students.map(student => {
        const fees = allFees.filter(f => f.student_id === student.id);
        const creditRow = credits.find(c => c.student_id === student.id);
        const creditBal = creditRow ? Number(creditRow.credit_amount || 0) : 0;
        const summary = computeStudentFeeSummary(fees, creditBal);
        const cls = getClass(student.class_id);
        return { student, cls, summary, creditBal };
    });

    // Status filter
    if (_balFilter.status === 'owing') rows = rows.filter(r => r.summary.outstanding > 0);
    if (_balFilter.status === 'credit') rows = rows.filter(r => r.creditBal > 0);
    if (_balFilter.status === 'settled') rows = rows.filter(r => r.summary.outstanding <= 0 && r.creditBal <= 0);

    // Sort: highest outstanding first
    rows.sort((a, b) => b.summary.outstanding - a.summary.outstanding);
    return rows;
}

function _balRenderKPIs() {
    const yearId = getActiveYearId();
    const allFees = (state.studentFees || []).filter(f => f.academic_year_id === yearId);
    const credits = state.creditBalances || [];
    const students = (state.students || []).filter(s => !s.is_deleted);

    let totalOwing = 0, totalCredit = 0, owingCount = 0, creditCount = 0;
    students.forEach(s => {
        const fees = allFees.filter(f => f.student_id === s.id);
        const cr = credits.find(c => c.student_id === s.id);
        const crBal = cr ? Number(cr.credit_amount || 0) : 0;
        const sum = computeStudentFeeSummary(fees, crBal);
        if (sum.outstanding > 0) { totalOwing += sum.outstanding; owingCount++; }
        if (crBal > 0) { totalCredit += crBal; creditCount++; }
    });

    const el = document.getElementById('bal-kpis');
    if (!el) return;
    el.innerHTML = `
    <div class="stat-card">
        <div class="stat-value c-danger">${fmtCurrency(totalOwing)}</div>
        <div class="stat-label">Total Outstanding</div>
        <div class="stat-sub">${owingCount} students owing</div>
    </div>
    <div class="stat-card">
        <div class="stat-value c-success">${fmtCurrency(totalCredit)}</div>
        <div class="stat-label">Total Credit Balances</div>
        <div class="stat-sub">${creditCount} students with credit</div>
    </div>
    <div class="stat-card">
        <div class="stat-value">${students.length - owingCount - creditCount}</div>
        <div class="stat-label">Fully Settled</div>
    </div>
    <div class="stat-card">
        <div class="stat-value">${students.length}</div>
        <div class="stat-label">Total Students</div>
    </div>`;
}

function _balRenderTable() {
    const allRows = _buildBalanceRows();
    const total = allRows.length;
    const start = (_balPage - 1) * _balSize;
    const paged = allRows.slice(start, start + _balSize);

    const wrap = document.getElementById('bal-table-wrap');
    if (!wrap) return;

    if (paged.length === 0) {
        wrap.innerHTML = `<div class="empty-state" style="padding:40px;">
            <div class="es-title">No students found</div>
        </div>`;
        return;
    }

    const rows = paged.map(({ student, cls, summary, creditBal }) => {
        const outColor = summary.outstanding > 0
            ? 'var(--color-danger)'
            : creditBal > 0 ? 'var(--teal)' : 'var(--color-success)';
        const status = summary.outstanding > 0 ? 'Owing'
            : creditBal > 0 ? 'Credit'
                : 'Settled';
        const statusClass = summary.outstanding > 0 ? 'badge-danger'
            : creditBal > 0 ? 'badge-info'
                : 'badge-success';

        return `
        <tr>
            <td>
                <div class="student-cell">
                    <span class="student-name">${esc(student.first_name)} ${esc(student.last_name)}</span>
                    <span class="student-code">${esc(student.code)}</span>
                </div>
            </td>
            <td>${esc(cls?.name || '—')}</td>
            <td class="text-right">${fmtCurrency(summary.effective)}</td>
            <td class="text-right" style="color:var(--color-success);">${fmtCurrency(summary.paid)}</td>
            <td class="text-right">${fmtCurrency(summary.waived)}</td>
            <td class="text-right" style="font-weight:700;color:${outColor};">
                ${summary.outstanding > 0 ? fmtCurrency(summary.outstanding)
                : creditBal > 0 ? `+ ${fmtCurrency(creditBal)} CR` : '—'}
            </td>
            <td><span class="badge ${statusClass}">${status}</span></td>
            <td>
                <div style="display:flex;gap:4px;">
                    ${summary.outstanding > 0 ? `
                    <button class="btn btn-sm btn-primary"
                            onclick="localStorage.setItem('elf_pay_student','${student.id}');navigateTo('record-payment')">
                        Pay
                    </button>` : ''}
                    <button class="btn btn-sm btn-ghost"
                            onclick="navigateTo('student-details',{studentId:${student.id}})">
                        View
                    </button>
                    <button class="btn btn-sm btn-ghost"
                            onclick="printStudentStatement(
                                getStudent(${student.id}),
                                state.studentFees.filter(f=>f.student_id===${student.id}),
                                state.payments.filter(p=>p.student_id===${student.id}),
                                ${creditBal},
                                getActiveYear())">
                        Statement
                    </button>
                </div>
            </td>
        </tr>`;
    }).join('');

    wrap.innerHTML = `
    <div class="table-wrap">
        <table class="data-table">
            <thead>
                <tr>
                    <th>Student</th>
                    <th>Class</th>
                    <th class="text-right">Expected</th>
                    <th class="text-right">Paid</th>
                    <th class="text-right">Waived</th>
                    <th class="text-right">Balance</th>
                    <th>Status</th>
                    <th>Actions</th>
                </tr>
            </thead>
            <tbody>${rows}</tbody>
        </table>
    </div>
    <div class="table-footer">
        <span>Showing ${start + 1}–${Math.min(start + _balSize, total)} of ${total} students</span>
        <div style="display:flex;gap:6px;">
            ${_balPage > 1 ? `<button class="btn btn-sm btn-ghost" onclick="balChangePage(${_balPage - 1})">Prev</button>` : ''}
            ${start + _balSize < total ? `<button class="btn btn-sm btn-ghost" onclick="balChangePage(${_balPage + 1})">Next</button>` : ''}
        </div>
    </div>`;
}

window.balFilter = function (key, val) { _balFilter[key] = val; _balPage = 1; _balRenderTable(); };
window.balResetFilter = function () {
    _balFilter = { classId: '', status: 'all', search: '' };
    ['bal-class', 'bal-status'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = id === 'bal-status' ? 'all' : '';
    });
    _balPage = 1;
    _balRenderTable();
};
window.balChangePage = function (p) { _balPage = p; _balRenderTable(); };

window.exportBalancesNow = function () {
    const rows = _buildBalanceRows();
    const data = rows.map(({ student, cls, summary, creditBal }) => ({
        'Student Code': student.code,
        'Last Name': student.last_name,
        'First Name': student.first_name,
        'Class': cls?.name || '',
        'Expected (RWF)': summary.effective,
        'Paid (RWF)': summary.paid,
        'Waived (RWF)': summary.waived,
        'Outstanding': summary.outstanding,
        'Credit Balance': creditBal,
        'Status': summary.outstanding > 0 ? 'Owing' : creditBal > 0 ? 'Credit' : 'Settled',
    }));
    exportAsCSV(data, `Balances_${getActiveYear()?.year_name || ''}`);
};

window.renderBalances = renderBalances;