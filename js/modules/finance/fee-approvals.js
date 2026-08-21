/* ═══════════════════════════════════════════════════════════════════
   js/modules/finance/fee-approvals.js
   ═══════════════════════════════════════════════════════════════════
   Purpose : Fee approval workflow.
             - Lists all pending student_fees where
               requires_approval=true AND is_approved=false
               AND is NOT already paid (fully or partially)
             - Admin/accountant can approve or reject each fee
             - Approve → is_approved=true, log entry, fee stays
             - Reject  → fee row deleted, log entry, student notified
             - Already paid (fully or partially) → auto-removed from
               approval queue (auto_approved, fee kept)
             - Filters by: source (enrollment/holiday), class, date
             - Shows both normal-mode enrollment fees AND
               holiday session enrollment fees in one view,
               clearly labelled
   Roles   : admin, accountant
   ═══════════════════════════════════════════════════════════════════ */

'use strict';

let _faFilter = { source: 'all', classId: '', search: '' };
let _faPage   = 1;
const _faSize = 50;

async function renderFeeApprovals(container, params = {}) {
    if (!container) return;
    if (!canManageFees()) {
        container.innerHTML = `<div class="alert alert-danger">Access denied.</div>`;
        return;
    }

    await ensureStateLoaded();

    container.innerHTML = `
    <div class="module-wrap">

        <div class="mod-topbar">
            <div class="mod-topbar-left">
                <h1 class="mod-title">
                    <i class="fa-solid fa-clipboard-check"></i>
                    Fee Approvals
                </h1>
                <span class="mod-meta" id="fa-pending-count">Loading…</span>
            </div>
            <div class="mod-topbar-right">
                <button class="topbar-btn btn-fill" onclick="faApproveAll()"
                        id="fa-approve-all-btn" style="display:none;">
                    <i class="fa-solid fa-check-double"></i>
                    Approve All Pending
                </button>
            </div>
        </div>

        <!-- Info banner -->
        <div class="alert alert-info" style="margin-bottom:16px;">
            <i class="fa-solid fa-circle-info"></i>
            Fees created during student enrollment or holiday enrollment require approval.
            Fees that are already paid (even partially) are automatically approved and
            removed from this list.
        </div>

        <!-- KPI cards -->
        <div id="fappr-kpis" class="stats-grid stats-grid-4" style="margin-bottom:16px;"></div>

        <!-- Filters -->
        <div class="filters-bar">
            <div class="filter-group">
                <label>Source</label>
                <select class="select" onchange="faApplyFilter('source',this.value)">
                    <option value="all">All Sources</option>
                    <option value="enrollment">Student Enrollment</option>
                    <option value="holiday_enrollment">Holiday Enrollment</option>
                </select>
            </div>
            <div class="filter-group">
                <label>Class</label>
                <select class="select" onchange="faApplyFilter('classId',this.value)">
                    <option value="">All Classes</option>
                    ${(state.classes||[]).map(c =>
                        `<option value="${c.id}">${esc(c.name)}</option>`
                    ).join('')}
                </select>
            </div>
            <div class="search-group">
                <i class="fa-solid fa-magnifying-glass"></i>
                <input type="text" class="input" placeholder="Search student…"
                       oninput="faApplyFilter('search',this.value)">
            </div>
            <div class="filter-actions">
                <button class="btn btn-reset" onclick="faResetFilter()">Reset</button>
            </div>
        </div>

        <!-- Table -->
        <div class="section-card">
            <div id="fappr-table-wrap">
                <div style="padding:40px;text-align:center;color:var(--text-muted);">
                    Loading pending fees…
                </div>
            </div>
        </div>

    </div>`;

    await _faLoadAndRender();
}

/* ── LOAD & AUTO-APPROVE PAID FEES ─────────────────────────────── */
async function _faLoadAndRender() {
    // Get all fees that require approval and are not yet decided
    const pending = await getAll('student_fees',
        'requires_approval=is.true&is_approved=is.false&order=created_at.desc'
    ).catch(() => []);

    // Auto-approve any that are already paid (fully or partially)
    const toAutoApprove = pending.filter(f =>
        Number(f.paid_amount || 0) > 0
    );

    if (toAutoApprove.length > 0) {
        await Promise.all(toAutoApprove.map(f =>
            _faAutoApprove(f)
        ));
    }

    // Remaining: unpaid, pending approval
    state.pendingFeeApprovals = pending.filter(f =>
        Number(f.paid_amount || 0) === 0
    );

    _faRenderKPIs(pending, toAutoApprove.length);
    _faRenderTable();

    // Show/hide approve-all button
    const btn = document.getElementById('fa-approve-all-btn');
    if (btn) btn.style.display = state.pendingFeeApprovals.length > 0 ? 'inline-flex' : 'none';

    // Update count badge
    const count = document.getElementById('fa-pending-count');
    if (count) count.textContent = `${state.pendingFeeApprovals.length} pending`;
}

async function _faAutoApprove(fee) {
    const now = new Date().toISOString();
    await update('student_fees', fee.id, {
        is_approved  : true,
        approved_by  : state.currentUser?.id || null,
        approved_at  : now,
        updated_at   : now,
    }).catch(() => {});
    await insert('fee_approval_log', {
        student_fee_id: fee.id,
        student_id    : fee.student_id,
        action        : 'auto_approved',
        acted_by      : state.currentUser?.id || null,
        acted_at      : now,
        note          : 'Auto-approved: fee already paid before review.',
    }).catch(() => {});
}

/* ── KPI CARDS ─────────────────────────────────────────────────── */
function _faRenderKPIs(allPending, autoApprovedCount) {
    const el = document.getElementById('fappr-kpis');
    if (!el) return;

    const enrollCount  = allPending.filter(f => f.source === 'enrollment').length;
    const holidayCount = allPending.filter(f => f.source === 'holiday_enrollment').length;
    const totalAmt     = state.pendingFeeApprovals
        .reduce((s,f) => s + Number(f.amount||0) - Number(f.waived_amount||0), 0);

    el.innerHTML = `
    <div class="stat-card">
        <div class="stat-value c-warning">${state.pendingFeeApprovals.length}</div>
        <div class="stat-label">Pending Approval</div>
        <div class="stat-sub">${fmtCurrency(totalAmt)} total</div>
    </div>
    <div class="stat-card">
        <div class="stat-value">${enrollCount}</div>
        <div class="stat-label">From Enrollment</div>
    </div>
    <div class="stat-card">
        <div class="stat-value">${holidayCount}</div>
        <div class="stat-label">From Holiday Enrollment</div>
    </div>
    <div class="stat-card">
        <div class="stat-value c-success">${autoApprovedCount}</div>
        <div class="stat-label">Auto-Approved (already paid)</div>
    </div>`;
}

/* ── TABLE ─────────────────────────────────────────────────────── */
function _faRenderTable() {
    let rows = [...(state.pendingFeeApprovals || [])];

    // Apply filters
    if (_faFilter.source !== 'all') {
        rows = rows.filter(f => f.source === _faFilter.source);
    }
    if (_faFilter.classId) {
        const classStudents = new Set(
            (state.students||[]).filter(s => s.class_id === parseInt(_faFilter.classId)).map(s=>s.id)
        );
        rows = rows.filter(f => classStudents.has(f.student_id));
    }
    if (_faFilter.search) {
        const q = _faFilter.search.toLowerCase();
        rows = rows.filter(f => {
            const s = getStudent(f.student_id);
            return s && `${s.first_name} ${s.last_name} ${s.code}`.toLowerCase().includes(q);
        });
    }

    const total = rows.length;
    const start = (_faPage-1) * _faSize;
    const paged = rows.slice(start, start+_faSize);

    const wrap = document.getElementById('fappr-table-wrap');
    if (!wrap) return;

    if (paged.length === 0) {
        wrap.innerHTML = `
        <div class="empty-state" style="padding:48px;">
            <div class="es-icon"><i class="fa-solid fa-clipboard-check"
                style="font-size:48px;opacity:0.3;color:var(--color-success);"></i></div>
            <div class="es-title" style="color:var(--color-success);">No pending approvals</div>
            <div class="es-sub">All enrollment fees have been reviewed.</div>
        </div>`;
        return;
    }

    const tableRows = paged.map(fee => {
        const student  = getStudent(fee.student_id);
        const cls      = student ? getClass(student.class_id) : null;
        const amount   = Number(fee.amount||0) - Number(fee.waived_amount||0);
        const discount = Number(fee.waived_amount||0);

        const sourceLabel = fee.source === 'holiday_enrollment'
            ? `<span class="badge" style="background:rgba(217,119,6,0.15);color:#d97706;"><i class="fa-solid fa-umbrella-beach"></i> Holiday</span>`
            : `<span class="badge badge-neutral">Enrollment</span>`;

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
            <td>${esc(cls?.name||'—')}</td>
            <td>${esc(fee.fee_name||'—')}</td>
            <td>${sourceLabel}</td>
            <td class="text-right">${fmtCurrency(Number(fee.amount||0))}</td>
            <td class="text-right" style="color:var(--color-success);">
                ${discount > 0 ? `— ${fmtCurrency(discount)}` : '—'}
            </td>
            <td class="text-right" style="font-weight:700;">
                ${fmtCurrency(amount)}
            </td>
            <td>${fee.due_date ? esc(fmtDate(fee.due_date)) : '—'}</td>
            <td>
                <div style="display:flex;gap:4px;">
                    <button class="btn btn-sm btn-success"
                            onclick="faApproveFee(${fee.id},'${esc(fee.fee_name||'')}')">
                        <i class="fa-solid fa-check"></i> Approve
                    </button>
                    <button class="btn btn-sm btn-danger"
                            onclick="faRejectFee(${fee.id},'${esc(fee.fee_name||'')}',${fee.student_id})">
                        <i class="fa-solid fa-xmark"></i> Reject
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
                    <th>Fee Name</th>
                    <th>Source</th>
                    <th class="text-right">Original</th>
                    <th class="text-right">Discount</th>
                    <th class="text-right">Net Amount</th>
                    <th>Due Date</th>
                    <th>Action</th>
                </tr>
            </thead>
            <tbody>${tableRows}</tbody>
        </table>
    </div>
    <div class="table-footer">
        <span>${total} pending fee${total!==1?'s':''}</span>
        <div style="display:flex;gap:6px;">
            ${_faPage>1 ? `<button class="btn btn-sm btn-ghost" onclick="faChangePage(${_faPage-1})">Prev</button>`:''}
            ${start+_faSize<total ? `<button class="btn btn-sm btn-ghost" onclick="faChangePage(${_faPage+1})">Next</button>`:''}
        </div>
    </div>`;
}

/* ── APPROVE ────────────────────────────────────────────────────── */
window.faApproveFee = async function(feeId, feeName) {
    try {
        const now = new Date().toISOString();
        await update('student_fees', feeId, {
            is_approved : true,
            approved_by : state.currentUser?.id || null,
            approved_at : now,
            updated_at  : now,
        });
        await insert('fee_approval_log', {
            student_fee_id: feeId,
            action        : 'approved',
            acted_by      : state.currentUser?.id || null,
            acted_at      : now,
        });
        state.pendingFeeApprovals = state.pendingFeeApprovals.filter(f => f.id !== feeId);
        showToast(`"${feeName}" approved.`, 'success');
        _faRenderTable();
        _updatePendingCount();
    } catch(err) { handleApiError(err, 'approve fee'); }
};

/* ── REJECT ─────────────────────────────────────────────────────── */
window.faRejectFee = async function(feeId, feeName, studentId) {
    const confirmed = await confirmDialog(
        `Reject and delete "${feeName}"?`,
        'Reject Fee',
        { confirmText: 'Reject & Delete', confirmClass: 'btn-danger' }
    );
    if (!confirmed) return;

    // Ask for rejection reason
    const reason = window.prompt('Rejection reason (optional):') || '';

    try {
        const now = new Date().toISOString();
        await insert('fee_approval_log', {
            student_fee_id  : feeId,
            student_id      : studentId,
            action          : 'rejected',
            acted_by        : state.currentUser?.id || null,
            acted_at        : now,
            note            : reason,
        });
        await remove('student_fees', feeId);
        state.pendingFeeApprovals = state.pendingFeeApprovals.filter(f => f.id !== feeId);
        showToast(`"${feeName}" rejected and removed.`, 'success');
        _faRenderTable();
        _updatePendingCount();
    } catch(err) { handleApiError(err, 'reject fee'); }
};

/* ── APPROVE ALL ────────────────────────────────────────────────── */
window.faApproveAll = async function() {
    const pending = state.pendingFeeApprovals || [];
    if (pending.length === 0) return;

    const confirmed = await confirmDialog(
        `Approve all ${pending.length} pending fee(s)?`,
        'Approve All',
        { confirmText: 'Approve All', confirmClass: 'btn-primary' }
    );
    if (!confirmed) return;

    showToast(`Approving ${pending.length} fees…`, 'info', { duration: 3000 });
    const now = new Date().toISOString();

    let approved = 0;
    for (const fee of pending) {
        try {
            await update('student_fees', fee.id, {
                is_approved : true,
                approved_by : state.currentUser?.id || null,
                approved_at : now,
                updated_at  : now,
            });
            await insert('fee_approval_log', {
                student_fee_id: fee.id,
                student_id    : fee.student_id,
                action        : 'approved',
                acted_by      : state.currentUser?.id || null,
                acted_at      : now,
            });
            approved++;
        } catch(e) { /* continue */ }
    }

    state.pendingFeeApprovals = [];
    showToast(`${approved} fee(s) approved.`, 'success');
    await _faLoadAndRender();
};

/* ── FILTER HANDLERS ────────────────────────────────────────────── */
window.faApplyFilter  = (k, v) => { _faFilter[k]=v; _faPage=1; _faRenderTable(); };
window.faResetFilter  = () => { _faFilter={source:'all',classId:'',search:''}; _faPage=1; _faRenderTable(); };
window.faChangePage   = (p) => { _faPage=p; _faRenderTable(); };

function _updatePendingCount() {
    const el = document.getElementById('fa-pending-count');
    if (el) el.textContent = `${state.pendingFeeApprovals.length} pending`;
    const btn = document.getElementById('fa-approve-all-btn');
    if (btn) btn.style.display = state.pendingFeeApprovals.length > 0 ? 'inline-flex' : 'none';
}

window.renderFeeApprovals = renderFeeApprovals;
