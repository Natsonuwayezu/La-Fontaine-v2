/* ═══════════════════════════════════════════════════════════════════
   js/modules/finance/overdue-payments.js
   ═══════════════════════════════════════════════════════════════════
   Purpose : Overdue fee management.
             - Classify all unpaid fees into severity buckets:
               Critical (30+ days), Warning (15-30), Mild (7-15),
               Recent (1-7 days)
             - Filter by class, severity, fee category
             - Quick-pay per student
             - Export overdue list
             - Send reminder notification to all overdue students
   Roles   : admin, accountant
   ═══════════════════════════════════════════════════════════════════ */

'use strict';

let _odFilter = { classId: '', severity: 'all', catId: '', search: '' };
let _odPage   = 1;
const _odSize = 50;

async function renderOverduePayments() {
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
                         stroke="var(--color-danger)" stroke-width="2">
                        <use href="assets/icons/sprite.svg#icon-alert-triangle"/>
                    </svg>
                    Overdue Payments
                </h1>
                <span class="mod-meta">${esc(activeYear?.year_name || '—')}</span>
            </div>
            <div class="mod-topbar-right">
                <button class="topbar-btn" onclick="odExport()">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                         stroke="currentColor" stroke-width="2">
                        <use href="assets/icons/sprite.svg#icon-download"/>
                    </svg>
                    Export
                </button>
                <button class="topbar-btn" onclick="odSendReminders()">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                         stroke="currentColor" stroke-width="2">
                        <use href="assets/icons/sprite.svg#icon-bell"/>
                    </svg>
                    Send Reminders
                </button>
                <button class="topbar-btn btn-fill" onclick="navigateTo('record-payment')">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                         stroke="currentColor" stroke-width="2">
                        <use href="assets/icons/sprite.svg#icon-credit-card"/>
                    </svg>
                    Record Payment
                </button>
            </div>
        </div>

        <!-- KPI severity cards -->
        <div id="od-kpis" class="stats-grid stats-grid-4" style="margin-bottom:16px;"></div>

        <!-- Filters -->
        <div class="filters-bar">
            <div class="filter-group">
                <label>Severity</label>
                <select id="od-severity" class="select" onchange="odFilter('severity',this.value)">
                    <option value="all">All Overdue</option>
                    <option value="critical">Critical (30+ days)</option>
                    <option value="warning">Warning (15-30 days)</option>
                    <option value="mild">Mild (7-15 days)</option>
                    <option value="recent">Recent (1-7 days)</option>
                </select>
            </div>
            <div class="filter-group">
                <label>Class</label>
                <select id="od-class" class="select" onchange="odFilter('classId',this.value)">
                    <option value="">All Classes</option>
                    ${(state.classes||[]).map(c =>
                        `<option value="${c.id}">${esc(c.name)}</option>`
                    ).join('')}
                </select>
            </div>
            <div class="filter-group">
                <label>Fee Category</label>
                <select id="od-cat" class="select" onchange="odFilter('catId',this.value)">
                    <option value="">All Categories</option>
                    ${(state.feeCategories||[]).map(c =>
                        `<option value="${c.id}">${esc(c.name)}</option>`
                    ).join('')}
                </select>
            </div>
            <div class="search-group">
                <svg viewBox="0 0 24 24" fill="none" stroke-width="2">
                    <use href="assets/icons/sprite.svg#icon-search"/>
                </svg>
                <input type="text" placeholder="Search student…" class="input"
                       oninput="odFilter('search',this.value)">
            </div>
            <div class="filter-actions">
                <button class="btn btn-reset" onclick="odResetFilter()">Reset</button>
            </div>
        </div>

        <!-- Table -->
        <div class="section-card">
            <div id="od-table-wrap">
                <div style="padding:40px;text-align:center;color:var(--text-muted);">
                    Computing overdue fees…
                </div>
            </div>
        </div>

    </div>`;

    _odRenderKPIs();
    _odRenderTable();
}

/* ── GET ALL OVERDUE FEES (filtered) ────────────────────────────── */
function _odGetOverdue() {
    const yearId  = getActiveYearId();
    const today   = todayISO();

    let fees = (state.studentFees||[]).filter(f =>
        f.academic_year_id === yearId &&
        !f.is_paid &&
        !f.is_waived &&
        f.due_date &&
        f.due_date < today
    );

    // Compute days overdue and remaining for each
    fees = fees.map(f => {
        const bal  = computeFeeBalance(f);
        const sev  = getOverdueSeverity(f.due_date);
        return { ...f, remaining: bal.remaining, days_overdue: sev.days, severity: sev.level };
    }).filter(f => f.remaining > 0);

    // Apply filters
    if (_odFilter.severity !== 'all') {
        fees = fees.filter(f => f.severity === _odFilter.severity);
    }
    if (_odFilter.classId) {
        const clsStudents = new Set(
            (state.students||[]).filter(s => s.class_id === parseInt(_odFilter.classId)).map(s=>s.id)
        );
        fees = fees.filter(f => clsStudents.has(f.student_id));
    }
    if (_odFilter.catId) {
        fees = fees.filter(f => f.fee_category_id === parseInt(_odFilter.catId));
    }
    if (_odFilter.search) {
        const q = _odFilter.search.toLowerCase();
        fees = fees.filter(f => {
            const s = getStudent(f.student_id);
            return s && `${s.first_name} ${s.last_name} ${s.code}`.toLowerCase().includes(q);
        });
    }

    // Sort: most critical first (highest days_overdue)
    return fees.sort((a,b) => b.days_overdue - a.days_overdue);
}

/* ── KPI CARDS ─────────────────────────────────────────────────── */
function _odRenderKPIs() {
    const yearId = getActiveYearId();
    const today  = todayISO();
    const allFees = (state.studentFees||[]).filter(f =>
        f.academic_year_id === yearId && !f.is_paid && !f.is_waived &&
        f.due_date && f.due_date < today
    ).map(f => {
        const bal = computeFeeBalance(f);
        const sev = getOverdueSeverity(f.due_date);
        return { ...f, remaining: bal.remaining, severity: sev.level };
    }).filter(f => f.remaining > 0);

    const buckets = classifyOverdueFees(allFees.map(f => ({ ...f, days_overdue: getOverdueSeverity(f.due_date).days })));

    const totalAmt = allFees.reduce((s,f) => s + f.remaining, 0);

    const el = document.getElementById('od-kpis');
    if (!el) return;

    el.innerHTML = `
    <div class="stat-card" style="border-top:3px solid var(--color-danger);" onclick="odFilter('severity','critical')" style="cursor:pointer;">
        <div class="stat-value c-danger">${buckets.critical.length}</div>
        <div class="stat-label">Critical (30+ days)</div>
        <div class="stat-sub">${fmtCurrency(buckets.critical.reduce((s,f)=>s+(f.remaining||0),0))}</div>
    </div>
    <div class="stat-card" style="border-top:3px solid var(--color-warning);" onclick="odFilter('severity','warning')">
        <div class="stat-value c-warning">${buckets.warning.length}</div>
        <div class="stat-label">Warning (15-30 days)</div>
        <div class="stat-sub">${fmtCurrency(buckets.warning.reduce((s,f)=>s+(f.remaining||0),0))}</div>
    </div>
    <div class="stat-card" style="border-top:3px solid #f59e0b;">
        <div class="stat-value" style="color:#b45309;">${buckets.mild.length}</div>
        <div class="stat-label">Mild (7-15 days)</div>
        <div class="stat-sub">${fmtCurrency(buckets.mild.reduce((s,f)=>s+(f.remaining||0),0))}</div>
    </div>
    <div class="stat-card" style="border-top:3px solid var(--color-success);">
        <div class="stat-value">${buckets.recent.length}</div>
        <div class="stat-label">Recent (1-7 days)</div>
        <div class="stat-sub">Total: ${fmtCurrency(totalAmt)}</div>
    </div>`;
}

/* ── TABLE ─────────────────────────────────────────────────────── */
function _odRenderTable() {
    const allOverdue = _odGetOverdue();
    const total      = allOverdue.length;
    const start      = (_odPage-1) * _odSize;
    const paged      = allOverdue.slice(start, start+_odSize);

    const wrap = document.getElementById('od-table-wrap');
    if (!wrap) return;

    if (paged.length === 0) {
        wrap.innerHTML = `
        <div class="empty-state" style="padding:48px;">
            <div class="es-icon">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none"
                     stroke="var(--color-success)" stroke-width="1.2" opacity="0.5">
                    <use href="assets/icons/sprite.svg#icon-check-circle"/>
                </svg>
            </div>
            <div class="es-title" style="color:var(--color-success);">No overdue fees!</div>
            <div class="es-sub">All fees are up to date.</div>
        </div>`;
        return;
    }

    const SEV_COLORS = {
        critical : 'var(--color-danger)',
        warning  : 'var(--color-warning)',
        mild     : '#b45309',
        recent   : 'var(--color-success)',
        not_yet  : 'var(--text-muted)',
    };

    const rows = paged.map(fee => {
        const student  = getStudent(fee.student_id);
        const cls      = student ? getClass(student.class_id) : null;
        const sevColor = SEV_COLORS[fee.severity] || 'var(--text-muted)';
        const sevLabel = fee.severity ? fee.severity.charAt(0).toUpperCase() + fee.severity.slice(1) : '—';

        return `
        <tr>
            <td>
                <div class="student-cell">
                    <span class="student-name">
                        ${student ? `${esc(student.first_name)} ${esc(student.last_name)}` : `#${fee.student_id}`}
                    </span>
                    <span class="student-code">${student ? esc(student.code) : ''}</span>
                </div>
            </td>
            <td>${esc(cls?.name || '—')}</td>
            <td>${esc(fee.fee_name || '—')}</td>
            <td>${esc(fmtDate(fee.due_date))}</td>
            <td class="text-center">
                <span class="badge" style="background:${sevColor}20;color:${sevColor};font-weight:700;">
                    ${fee.days_overdue}d
                </span>
            </td>
            <td class="text-center">
                <span class="badge" style="background:${sevColor}20;color:${sevColor};">
                    ${esc(sevLabel)}
                </span>
            </td>
            <td class="text-right" style="font-weight:700;color:var(--color-danger);">
                ${fmtCurrency(fee.remaining)}
            </td>
            <td>
                <div style="display:flex;gap:4px;">
                    <button class="btn btn-sm btn-primary"
                            onclick="localStorage.setItem('elf_pay_student','${fee.student_id}');navigateTo('record-payment')">
                        Pay Now
                    </button>
                    <button class="btn btn-sm btn-ghost"
                            onclick="navigateTo('student-fees',{studentId:${fee.student_id}})">
                        Details
                    </button>
                    <button class="btn btn-sm btn-ghost"
                            onclick="navigateTo('fee-waivers',{studentId:${fee.student_id},feeId:${fee.id}})">
                        Waive
                    </button>
                </div>
            </td>
        </tr>`;
    }).join('');

    const totalOwing = allOverdue.reduce((s,f) => s+(f.remaining||0), 0);

    wrap.innerHTML = `
    <div class="table-wrap">
        <table class="data-table">
            <thead>
                <tr>
                    <th>Student</th>
                    <th>Class</th>
                    <th>Fee</th>
                    <th>Due Date</th>
                    <th class="text-center">Days Overdue</th>
                    <th class="text-center">Severity</th>
                    <th class="text-right">Outstanding</th>
                    <th>Actions</th>
                </tr>
            </thead>
            <tbody>${rows}</tbody>
        </table>
    </div>
    <div class="table-footer">
        <span>
            ${total} overdue fee${total!==1?'s':''} ·
            <strong style="color:var(--color-danger);">${fmtCurrency(totalOwing)}</strong> total outstanding
        </span>
        <div style="display:flex;gap:6px;">
            ${_odPage>1 ? `<button class="btn btn-sm btn-ghost" onclick="odChangePage(${_odPage-1})">Prev</button>`:''}
            ${start+_odSize<total ? `<button class="btn btn-sm btn-ghost" onclick="odChangePage(${_odPage+1})">Next</button>`:''}
        </div>
    </div>`;
}

/* ── FILTER HANDLERS ────────────────────────────────────────────── */
window.odFilter = function(key, val) {
    _odFilter[key] = val;
    _odPage = 1;
    _odRenderTable();
};
window.odResetFilter = function() {
    _odFilter = { classId:'', severity:'all', catId:'', search:'' };
    ['od-severity','od-class','od-cat'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = id==='od-severity' ? 'all' : '';
    });
    _odPage = 1;
    _odRenderTable();
};
window.odChangePage = function(p) { _odPage=p; _odRenderTable(); };

/* ── EXPORT ─────────────────────────────────────────────────────── */
window.odExport = function() {
    const rows = _odGetOverdue();
    exportOverdueFees(rows, `Overdue_${getActiveYear()?.year_name||''}`);
};

/* ── SEND REMINDERS ─────────────────────────────────────────────── */
window.odSendReminders = async function() {
    const rows = _odGetOverdue();
    if (rows.length === 0) {
        showToast('No overdue fees to send reminders for.', 'info');
        return;
    }

    const confirmed = await confirmDialog(
        `Send overdue payment notifications to ${new Set(rows.map(r=>r.student_id)).size} student(s)?`,
        'Send Reminders',
        { confirmText: 'Send', confirmClass: 'btn-primary' }
    );
    if (!confirmed) return;

    await notifyOverdueFees(rows);
    showToast('Overdue notifications sent to admins and accountants.', 'success');
};

window.renderOverduePayments = renderOverduePayments;