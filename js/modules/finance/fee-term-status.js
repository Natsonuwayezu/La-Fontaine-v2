/* ═══════════════════════════════════════════════════════════════════
   js/modules/finance/fee-term-status.js
   ═══════════════════════════════════════════════════════════════════
   Purpose : Fee Payment Status grid — shows every student as a row
             and every fee category as a column, color-coded by
             payment status. Quick scan of who paid what.
             Filters: class, term, fee category, payment status.
             Click any cell to open record-payment for that student.
   Roles   : admin, accountant
   ═══════════════════════════════════════════════════════════════════ */

'use strict';

let _ftsFilter = { classId: '', search: '' };

async function renderFeeTermStatus() {
    const app = document.getElementById('app');
    if (!canViewPayments()) {
        app.innerHTML = `<div class="alert alert-danger">Access denied.</div>`;
        return;
    }

    await ensureStateLoaded();
    await loadStudentFees();

    const activeYear = getActiveYear();
    const activeTerm = getActiveTerm();

    app.innerHTML = `
    <div class="module-wrap">

        <div class="mod-topbar">
            <div class="mod-topbar-left">
                <h1 class="mod-title">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
                         stroke="var(--primary)" stroke-width="2">
                        <use href="assets/icons/sprite.svg#icon-grid-3x3"/>
                    </svg>
                    Fee Payment Status
                </h1>
                <span class="mod-meta">
                    ${esc(activeYear?.year_name || '—')}
                    ${activeTerm ? ' · Term ' + activeTerm.term_number : ''}
                </span>
            </div>
            <div class="mod-topbar-right">
                <button class="topbar-btn" onclick="exportFeeStatus(
                    _ftsGetFilteredStudents(),
                    state.feeCategories,
                    state.studentFees)">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                         stroke="currentColor" stroke-width="2">
                        <use href="assets/icons/sprite.svg#icon-download"/>
                    </svg>
                    Export
                </button>
            </div>
        </div>

        <!-- Legend -->
        <div class="filters-bar" style="flex-wrap:wrap;gap:8px;margin-bottom:8px;">
            <div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap;">
                <span style="font-size:12px;font-weight:600;color:var(--text-muted);">Legend:</span>
                <span class="fts-legend-item fts-paid">Paid</span>
                <span class="fts-legend-item fts-partial">Partial</span>
                <span class="fts-legend-item fts-unpaid">Unpaid</span>
                <span class="fts-legend-item fts-waived">Waived</span>
                <span class="fts-legend-item fts-none">Not Assigned</span>
            </div>
        </div>

        <!-- Filters -->
        <div class="filters-bar">
            <div class="filter-group">
                <label>Class</label>
                <select id="fts-class" class="select" onchange="ftsFilter('classId',this.value)">
                    <option value="">All Classes</option>
                    ${(state.classes||[]).map(c =>
                        `<option value="${c.id}">${esc(c.name)}</option>`
                    ).join('')}
                </select>
            </div>
            <div class="search-group">
                <svg viewBox="0 0 24 24" fill="none" stroke-width="2">
                    <use href="assets/icons/sprite.svg#icon-search"/>
                </svg>
                <input type="text" placeholder="Search student…"
                       oninput="ftsFilter('search',this.value)" class="input">
            </div>
            <div class="filter-actions">
                <button class="btn btn-reset" onclick="ftsResetFilter()">Reset</button>
            </div>
        </div>

        <!-- Summary stats -->
        <div id="fts-stats" class="stats-grid stats-grid-4" style="margin-bottom:12px;"></div>

        <!-- Grid -->
        <div class="section-card" style="overflow:auto;">
            <div id="fts-grid">
                <div style="padding:40px;text-align:center;color:var(--text-muted);">
                    Loading…
                </div>
            </div>
        </div>

    </div>`;

    _ftsRender();
}

/* ── FILTER HELPERS ──────────────────────────────────────────────── */
window.ftsFilter = function(key, val) {
    _ftsFilter[key] = val;
    _ftsRender();
};
window.ftsResetFilter = function() {
    _ftsFilter = { classId: '', search: '' };
    const cls = document.getElementById('fts-class');
    if (cls) cls.value = '';
    _ftsRender();
};
window._ftsGetFilteredStudents = function() {
    let students = (state.students||[]).filter(s => !s.is_deleted);
    if (_ftsFilter.classId) students = students.filter(s => s.class_id === parseInt(_ftsFilter.classId));
    if (_ftsFilter.search) {
        const q = _ftsFilter.search.toLowerCase();
        students = students.filter(s =>
            `${s.first_name} ${s.last_name} ${s.code}`.toLowerCase().includes(q)
        );
    }
    return students.sort((a,b) => {
        const ca = getClass(a.class_id)?.sort_order || 99;
        const cb = getClass(b.class_id)?.sort_order || 99;
        if (ca !== cb) return ca - cb;
        return (a.last_name||'').localeCompare(b.last_name||'');
    });
};

/* ── MAIN RENDER ─────────────────────────────────────────────────── */
function _ftsRender() {
    const yearId      = getActiveYearId();
    const students    = window._ftsGetFilteredStudents();
    const categories  = (state.feeCategories||[]).sort((a,b) => (a.sort_order||99)-(b.sort_order||99));
    const allFees     = (state.studentFees||[]).filter(f => f.academic_year_id === yearId);

    // Build index: studentId → { catId → [fees] }
    const idx = {};
    allFees.forEach(f => {
        if (!idx[f.student_id]) idx[f.student_id] = {};
        const catId = f.fee_category_id || 0;
        if (!idx[f.student_id][catId]) idx[f.student_id][catId] = [];
        idx[f.student_id][catId].push(f);
    });

    // Summary stats
    let totalPaid = 0, totalPartial = 0, totalUnpaid = 0, totalWaived = 0;

    // Build rows
    const rows = students.map(student => {
        const cls     = getClass(student.class_id);
        const studentFees = allFees.filter(f => f.student_id === student.id);
        const summary = computeStudentFeeSummary(studentFees, 0);

        const cells = categories.map(cat => {
            const catFees = (idx[student.id]||{})[cat.id] || [];
            if (catFees.length === 0) {
                return `<td class="fts-cell fts-none" title="Not assigned">—</td>`;
            }

            const totalAmt  = catFees.reduce((s, f) => s + Number(f.amount||0) - Number(f.waived_amount||0), 0);
            const paidAmt   = catFees.reduce((s, f) => s + Number(f.paid_amount||0), 0);
            const allWaived = catFees.every(f => f.is_waived);
            const allPaid   = catFees.every(f => f.is_paid) && !allWaived;
            const anyPaid   = paidAmt > 0 && !allPaid;

            let cls2, label, title;
            if (allWaived)      { cls2='fts-waived';  label='W'; title=`Waived`; totalWaived++; }
            else if (allPaid)   { cls2='fts-paid';    label='✓'; title=`Paid: ${fmtCurrency(paidAmt)}`; totalPaid++; }
            else if (anyPaid)   { cls2='fts-partial'; label='P'; title=`Partial: ${fmtCurrency(paidAmt)}/${fmtCurrency(totalAmt)}`; totalPartial++; }
            else                { cls2='fts-unpaid';  label='✗'; title=`Unpaid: ${fmtCurrency(totalAmt)}`; totalUnpaid++; }

            return `<td class="fts-cell ${cls2}" title="${esc(title)}"
                        onclick="ftsOpenPayment(${student.id})" style="cursor:pointer;">
                ${label}
            </td>`;
        }).join('');

        const outstandingColor = summary.outstanding > 0 ? 'var(--color-danger)' : 'var(--color-success)';

        return `
        <tr>
            <td class="fts-student-cell">
                <div class="student-name">${esc(student.first_name)} ${esc(student.last_name)}</div>
                <div class="student-code">${esc(student.code)}</div>
            </td>
            <td class="fts-class-cell">${esc(cls?.name||'—')}</td>
            ${cells}
            <td class="text-right" style="font-weight:700;color:${outstandingColor};">
                ${fmtCurrency(summary.outstanding)}
            </td>
        </tr>`;
    }).join('');

    // Stats bar
    const statsEl = document.getElementById('fts-stats');
    if (statsEl) {
        statsEl.innerHTML = `
        <div class="stat-card"><div class="stat-value c-success">${totalPaid}</div>
            <div class="stat-label">Fully Paid</div></div>
        <div class="stat-card"><div class="stat-value c-warning">${totalPartial}</div>
            <div class="stat-label">Partial</div></div>
        <div class="stat-card"><div class="stat-value c-danger">${totalUnpaid}</div>
            <div class="stat-label">Unpaid</div></div>
        <div class="stat-card"><div class="stat-value">${totalWaived}</div>
            <div class="stat-label">Waived</div></div>`;
    }

    const grid = document.getElementById('fts-grid');
    if (!grid) return;

    if (students.length === 0) {
        grid.innerHTML = `<div class="empty-state" style="padding:40px;">
            <div class="es-title">No students found</div>
        </div>`;
        return;
    }

    const catHeaders = categories.map(c =>
        `<th class="fts-cat-header" title="${esc(c.name)}">${esc(c.name.substring(0,8))}${c.name.length>8?'…':''}</th>`
    ).join('');

    grid.innerHTML = `
    <div style="overflow-x:auto;">
        <table class="data-table fts-table">
            <thead>
                <tr>
                    <th style="min-width:160px;">Student</th>
                    <th style="min-width:80px;">Class</th>
                    ${catHeaders}
                    <th class="text-right" style="min-width:100px;">Outstanding</th>
                </tr>
            </thead>
            <tbody>${rows}</tbody>
        </table>
    </div>
    <div class="table-footer">
        <span>${students.length} student${students.length!==1?'s':''} · ${categories.length} fee categor${categories.length!==1?'ies':'y'}</span>
        <span style="font-size:11px;color:var(--text-muted);">Click any cell to record payment</span>
    </div>`;
}

window.ftsOpenPayment = function(studentId) {
    localStorage.setItem('elf_pay_student', String(studentId));
    navigateTo('record-payment');
};

window.renderFeeTermStatus = renderFeeTermStatus;