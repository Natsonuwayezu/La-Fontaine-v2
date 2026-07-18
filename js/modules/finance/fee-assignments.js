/* ═══════════════════════════════════════════════════════════════════
   js/modules/finance/fee-assignments.js
   ═══════════════════════════════════════════════════════════════════
   Purpose : Manage fee assignments — which students/classes have
             which fee amounts assigned for the active year.
             - View all assignments with status
             - Assign a fee to individual student or whole class
             - Remove an assignment (only if unpaid)
             - Detect missing assignments (students without a fee)
             - Bulk assign all fees to all eligible students
   Roles   : admin, accountant
   ═══════════════════════════════════════════════════════════════════ */

'use strict';

let _faFilter = { classId: '', feeAmountId: '', status: '', search: '' };
let _faPage = 1;
const _faPageSize = 50;

async function renderFeeAssignments() {
    const app = document.getElementById('app');
    if (!canManageFees()) {
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
                        <use href="assets/icons/sprite.svg#icon-clipboard-check"/>
                    </svg>
                    Fee Assignments
                </h1>
                <span class="mod-meta">${esc(activeYear?.year_name || '—')}</span>
            </div>
            <div class="mod-topbar-right">
                <button class="topbar-btn" onclick="openMissingAssignmentsModal()">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                         stroke="currentColor" stroke-width="2">
                        <use href="assets/icons/sprite.svg#icon-alert-triangle"/>
                    </svg>
                    Missing Assignments
                </button>
                <button class="topbar-btn" onclick="openBulkAssignModal()">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                         stroke="currentColor" stroke-width="2">
                        <use href="assets/icons/sprite.svg#icon-users"/>
                    </svg>
                    Bulk Assign
                </button>
                <button class="topbar-btn btn-fill" onclick="openAssignFeeModal()">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                         stroke="currentColor" stroke-width="2">
                        <use href="assets/icons/sprite.svg#icon-plus-circle"/>
                    </svg>
                    Assign Fee
                </button>
            </div>
        </div>

        <!-- Summary KPIs -->
        <div id="fa-kpis" class="stats-grid stats-grid-4" style="margin-bottom:16px;"></div>

        <!-- Filters -->
        <div class="filters-bar">
            <div class="filter-group">
                <label>Class</label>
                <select id="fa-filter-class" class="select" onchange="faApplyFilter('classId',this.value)">
                    <option value="">All Classes</option>
                    ${(state.classes || []).map(c =>
        `<option value="${c.id}">${esc(c.name)}</option>`
    ).join('')}
                </select>
            </div>
            <div class="filter-group">
                <label>Fee</label>
                <select id="fa-filter-fee" class="select" onchange="faApplyFilter('feeAmountId',this.value)">
                    <option value="">All Fees</option>
                    ${(state.feeAmounts || []).filter(f => f.academic_year_id === getActiveYearId()).map(f =>
        `<option value="${f.id}">${esc(f.name)}</option>`
    ).join('')}
                </select>
            </div>
            <div class="filter-group">
                <label>Status</label>
                <select id="fa-filter-status" class="select" onchange="faApplyFilter('status',this.value)">
                    <option value="">All</option>
                    <option value="paid">Paid</option>
                    <option value="partial">Partial</option>
                    <option value="unpaid">Unpaid</option>
                    <option value="waived">Waived</option>
                </select>
            </div>
            <div class="search-group">
                <svg viewBox="0 0 24 24" fill="none" stroke-width="2">
                    <use href="assets/icons/sprite.svg#icon-search"/>
                </svg>
                <input type="text" id="fa-search" class="input"
                       placeholder="Search student name or code…"
                       oninput="faApplyFilter('search',this.value)">
            </div>
            <div class="filter-actions">
                <button class="btn btn-reset" onclick="faResetFilters()">Reset</button>
            </div>
        </div>

        <!-- Table -->
        <div class="section-card">
            <div id="fa-table-wrap">
                ${_skeletonRows(6)}
            </div>
        </div>

    </div>`;

    _faRenderTable();
    _faRenderKPIs();
}

/* ── KPI BAR ──────────────────────────────────────────────────────── */
function _faRenderKPIs() {
    const yearId = getActiveYearId();
    const allFees = (state.studentFees || []).filter(f => f.academic_year_id === yearId);
    const students = (state.students || []).filter(s => !s.is_deleted);
    const feeAmounts = (state.feeAmounts || []).filter(f => f.academic_year_id === yearId);

    const assigned = new Set(allFees.map(f => f.student_id)).size;
    const unassigned = students.length - assigned;
    const totalRows = allFees.length;
    const paidRows = allFees.filter(f => f.is_paid).length;

    const el = document.getElementById('fa-kpis');
    if (!el) return;
    el.innerHTML = `
        <div class="stat-card">
            <div class="stat-value">${students.length}</div>
            <div class="stat-label">Active Students</div>
        </div>
        <div class="stat-card">
            <div class="stat-value c-success">${assigned}</div>
            <div class="stat-label">Students with Fees</div>
        </div>
        <div class="stat-card">
            <div class="stat-value ${unassigned > 0 ? 'c-warning' : ''}">${unassigned}</div>
            <div class="stat-label">Without Any Fee</div>
        </div>
        <div class="stat-card">
            <div class="stat-value">${totalRows}</div>
            <div class="stat-label">Total Fee Rows</div>
            <div class="stat-sub">${paidRows} paid</div>
        </div>`;
}

/* ── TABLE ────────────────────────────────────────────────────────── */
function _faRenderTable() {
    const yearId = getActiveYearId();
    let rows = (state.studentFees || []).filter(f => f.academic_year_id === yearId);

    // Apply filters
    if (_faFilter.classId) {
        const classStudents = new Set(
            (state.students || []).filter(s => s.class_id === parseInt(_faFilter.classId)).map(s => s.id)
        );
        rows = rows.filter(f => classStudents.has(f.student_id));
    }
    if (_faFilter.feeAmountId) {
        rows = rows.filter(f => f.fee_amount_id === parseInt(_faFilter.feeAmountId));
    }
    if (_faFilter.status) {
        rows = rows.filter(f => {
            const status = getFeeStatusDisplay(f).label.toLowerCase();
            return status.includes(_faFilter.status);
        });
    }
    if (_faFilter.search) {
        const q = _faFilter.search.toLowerCase();
        rows = rows.filter(f => {
            const s = getStudent(f.student_id);
            if (!s) return false;
            return `${s.first_name} ${s.last_name} ${s.code}`.toLowerCase().includes(q);
        });
    }

    const total = rows.length;
    const start = (_faPage - 1) * _faPageSize;
    const paged = rows.slice(start, start + _faPageSize);

    const wrap = document.getElementById('fa-table-wrap');
    if (!wrap) return;

    if (paged.length === 0) {
        wrap.innerHTML = `
        <div class="empty-state" style="padding:40px;">
            <div class="es-icon"><svg width="40" height="40" viewBox="0 0 24 24" fill="none"
                 stroke="currentColor" stroke-width="1.2" opacity="0.3">
                <use href="assets/icons/sprite.svg#icon-clipboard-check"/>
            </svg></div>
            <div class="es-title">No assignments found</div>
            <div class="es-sub">Adjust filters or assign fees to students.</div>
        </div>`;
        return;
    }

    const tableRows = paged.map(fee => {
        const student = getStudent(fee.student_id);
        const cls = student ? getClass(student.class_id) : null;
        const feeAmt = (state.feeAmounts || []).find(f => f.id === fee.fee_amount_id);
        const bal = computeFeeBalance(fee);
        const status = getFeeStatusDisplay(fee);

        return `
        <tr>
            <td>
                <div class="student-cell">
                    <span class="student-name">
                        ${student ? `${esc(student.first_name)} ${esc(student.last_name)}` : `ID:${fee.student_id}`}
                    </span>
                    <span class="student-code">${student ? esc(student.code) : ''}</span>
                </div>
            </td>
            <td>${esc(cls?.name || '—')}</td>
            <td>${esc(fee.fee_name || feeAmt?.name || '—')}</td>
            <td class="text-right">${fmtCurrency(bal.amount)}</td>
            <td class="text-right" style="color:var(--color-success);">${fmtCurrency(bal.waived)}</td>
            <td class="text-right">${fmtCurrency(bal.paid)}</td>
            <td class="text-right" style="font-weight:${bal.remaining > 0 ? '700' : '400'};
                color:${bal.remaining > 0 ? 'var(--color-danger)' : 'var(--color-success)'};">
                ${fmtCurrency(bal.remaining)}
            </td>
            <td>
                <span class="badge" style="background:${status.color}20;color:${status.color};">
                    ${esc(status.label)}
                </span>
            </td>
            <td>${fee.due_date ? esc(fmtDate(fee.due_date)) : '—'}</td>
            <td>
                <div style="display:flex;gap:4px;flex-wrap:wrap;">
                    ${!fee.is_paid && student ? `
                    <button class="btn btn-sm btn-primary"
                            onclick="localStorage.setItem('elf_pay_student','${fee.student_id}');navigateTo('record-payment')">
                        Pay
                    </button>` : ''}
                    ${!fee.is_paid && !fee.is_waived ? `
                    <button class="btn btn-sm btn-ghost"
                            onclick="removeAssignment(${fee.id},'${esc(fee.fee_name || 'fee')}')">
                        Remove
                    </button>` : ''}
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
                    <th>Fee</th>
                    <th class="text-right">Amount</th>
                    <th class="text-right">Waived</th>
                    <th class="text-right">Paid</th>
                    <th class="text-right">Remaining</th>
                    <th>Status</th>
                    <th>Due Date</th>
                    <th>Actions</th>
                </tr>
            </thead>
            <tbody>${tableRows}</tbody>
        </table>
    </div>
    <div class="table-footer">
        <span>Showing ${start + 1}–${Math.min(start + _faPageSize, total)} of ${total}</span>
        <div style="display:flex;gap:6px;">
            ${_faPage > 1 ? `<button class="btn btn-sm btn-ghost" onclick="faChangePage(${_faPage - 1})">Prev</button>` : ''}
            ${start + _faPageSize < total ? `<button class="btn btn-sm btn-ghost" onclick="faChangePage(${_faPage + 1})">Next</button>` : ''}
        </div>
    </div>`;
}

/* ── FILTER HANDLERS ──────────────────────────────────────────────── */
window.faApplyFilter = function (key, value) {
    _faFilter[key] = value;
    _faPage = 1;
    _faRenderTable();
};

window.faResetFilters = function () {
    _faFilter = { classId: '', feeAmountId: '', status: '', search: '' };
    _faPage = 1;
    ['fa-filter-class', 'fa-filter-fee', 'fa-filter-status', 'fa-search'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
    _faRenderTable();
};

window.faChangePage = function (page) {
    _faPage = page;
    _faRenderTable();
};

/* ── REMOVE ASSIGNMENT ────────────────────────────────────────────── */
window.removeAssignment = async function (feeId, feeName) {
    const confirmed = await confirmDialog(
        `Remove assignment "${feeName}"?`,
        'Remove Fee Assignment',
        { confirmText: 'Remove', confirmClass: 'btn-danger' }
    );
    if (!confirmed) return;

    try {
        await remove('student_fees', feeId);
        showToast('Fee assignment removed.', 'success');
        await refreshTable('student_fees');
        _faRenderTable();
        _faRenderKPIs();
    } catch (err) {
        handleApiError(err, 'remove assignment');
    }
};

/* ── ASSIGN FEE MODAL ─────────────────────────────────────────────── */
window.openAssignFeeModal = function () {
    const feeAmounts = (state.feeAmounts || []).filter(f => f.academic_year_id === getActiveYearId());
    const students = (state.students || []).filter(s => !s.is_deleted).sort((a, b) => a.last_name.localeCompare(b.last_name));
    const classes = state.classes || [];

    const content = `
    <div class="form-group">
        <label>Fee *</label>
        <select id="af-fee" class="select">
            <option value="">— Select Fee —</option>
            ${feeAmounts.map(f => `<option value="${f.id}">${esc(f.name)} — ${fmtCurrency(f.amount)}</option>`).join('')}
        </select>
    </div>
    <div class="form-group">
        <label>Assign To *</label>
        <select id="af-type" class="select" onchange="onAssignTypeChange(this.value)">
            <option value="student">Specific Student</option>
            <option value="class">Entire Class</option>
        </select>
    </div>
    <div id="af-student-wrap" class="form-group">
        <label>Student</label>
        <select id="af-student" class="select">
            <option value="">— Select Student —</option>
            ${students.map(s => {
        const c = getClass(s.class_id);
        return `<option value="${s.id}">${esc(s.last_name)}, ${esc(s.first_name)} (${esc(c?.name || '?')})</option>`;
    }).join('')}
        </select>
    </div>
    <div id="af-class-wrap" class="form-group" style="display:none;">
        <label>Class</label>
        <select id="af-class" class="select">
            <option value="">— Select Class —</option>
            ${classes.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}
        </select>
    </div>
    <div class="form-row">
        <div class="form-group">
            <label>Override Amount (optional)</label>
            <input type="number" id="af-amount" class="input" placeholder="Leave blank to use fee default" min="0">
        </div>
        <div class="form-group">
            <label>Due Date (optional)</label>
            <input type="date" id="af-due" class="input">
        </div>
    </div>`;

    showModal(content, {
        title: 'Assign Fee',
        size: 'md',
        footer: `
            <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
            <button class="btn btn-primary" onclick="submitAssignFee()">Assign</button>`
    });
};

window.onAssignTypeChange = function (type) {
    const sw = document.getElementById('af-student-wrap');
    const cw = document.getElementById('af-class-wrap');
    if (sw) sw.style.display = type === 'student' ? '' : 'none';
    if (cw) cw.style.display = type === 'class' ? '' : 'none';
};

window.submitAssignFee = async function () {
    const feeAmountId = parseInt(document.getElementById('af-fee')?.value);
    const type = document.getElementById('af-type')?.value;
    const studentId = parseInt(document.getElementById('af-student')?.value || '0') || null;
    const classId = parseInt(document.getElementById('af-class')?.value || '0') || null;
    const amountOvr = cleanNumber(document.getElementById('af-amount')?.value);
    const due = cleanDate(document.getElementById('af-due')?.value);

    if (!feeAmountId) { showToast('Please select a fee.', 'warning'); return; }
    if (type === 'student' && !studentId) { showToast('Please select a student.', 'warning'); return; }
    if (type === 'class' && !classId) { showToast('Please select a class.', 'warning'); return; }

    const feeAmt = (state.feeAmounts || []).find(f => f.id === feeAmountId);
    if (!feeAmt) { showToast('Fee not found.', 'error'); return; }

    const now = new Date().toISOString();
    const yearId = getActiveYearId();
    const amount = amountOvr !== null ? amountOvr : Number(feeAmt.amount);

    try {
        if (type === 'student') {
            // Check not already assigned
            const existing = (state.studentFees || []).find(f =>
                f.student_id === studentId && f.fee_amount_id === feeAmountId
            );
            if (existing) {
                showToast('This fee is already assigned to this student.', 'warning');
                return;
            }
            await insert('student_fees', {
                student_id: studentId, fee_amount_id: feeAmountId,
                academic_year_id: yearId, amount, paid_amount: 0,
                waived_amount: 0, is_paid: false, is_waived: false,
                due_date: due || feeAmt.due_date || null,
                fee_name: feeAmt.name, fee_category_id: feeAmt.fee_category_id,
                frequency: feeAmt.frequency, created_at: now, updated_at: now,
            });
            showToast('Fee assigned to student.', 'success');
        } else {
            // Assign to all students in class
            const classStudents = (state.students || []).filter(s =>
                s.class_id === classId && !s.is_deleted
            );
            const existingIds = new Set(
                (state.studentFees || [])
                    .filter(f => f.fee_amount_id === feeAmountId)
                    .map(f => f.student_id)
            );
            const toInsert = classStudents
                .filter(s => !existingIds.has(s.id))
                .map(s => ({
                    student_id: s.id, fee_amount_id: feeAmountId,
                    academic_year_id: yearId, amount, paid_amount: 0,
                    waived_amount: 0, is_paid: false, is_waived: false,
                    due_date: due || feeAmt.due_date || null,
                    fee_name: feeAmt.name, fee_category_id: feeAmt.fee_category_id,
                    frequency: feeAmt.frequency, created_at: now, updated_at: now,
                }));

            if (toInsert.length === 0) {
                showToast('All students in this class already have this fee.', 'info');
                closeModal();
                return;
            }
            await insertMany('student_fees', toInsert);
            showToast(`Fee assigned to ${toInsert.length} student(s).`, 'success');
        }

        closeModal();
        await refreshTable('student_fees');
        _faRenderTable();
        _faRenderKPIs();
    } catch (err) {
        handleApiError(err, 'assign fee');
    }
};

/* ── MISSING ASSIGNMENTS MODAL ────────────────────────────────────── */
window.openMissingAssignmentsModal = function () {
    const yearId = getActiveYearId();
    const feeAmounts = (state.feeAmounts || []).filter(f =>
        f.academic_year_id === yearId && f.applies_to === 'all' && f.is_active !== false
    );
    const students = (state.students || []).filter(s => !s.is_deleted);

    const missing = [];
    feeAmounts.forEach(fee => {
        const assignedIds = new Set(
            (state.studentFees || [])
                .filter(f => f.fee_amount_id === fee.id)
                .map(f => f.student_id)
        );
        const missingStudents = students.filter(s => !assignedIds.has(s.id));
        if (missingStudents.length > 0) {
            missing.push({ fee, count: missingStudents.length, students: missingStudents });
        }
    });

    if (missing.length === 0) {
        showToast('All fees are correctly assigned to all eligible students.', 'success');
        return;
    }

    const rows = missing.map(m => `
    <div class="missing-row">
        <div class="missing-fee-name">${esc(m.fee.name)}</div>
        <div class="missing-count">${m.count} student(s) missing</div>
        <button class="btn btn-sm btn-primary"
                onclick="fixMissingAssignment(${m.fee.id},'${esc(m.fee.name)}',${m.count})">
            Fix Now
        </button>
    </div>`).join('');

    showModal(`
    <div style="display:flex;flex-direction:column;gap:12px;">
        <p style="color:var(--text-muted);font-size:14px;">
            The following fees are not assigned to all eligible students:
        </p>
        <div style="display:flex;flex-direction:column;gap:8px;">${rows}</div>
    </div>`, {
        title: 'Missing Fee Assignments',
        size: 'md',
        footer: `
            <button class="btn btn-ghost" onclick="closeModal()">Close</button>
            <button class="btn btn-primary" onclick="fixAllMissing()">Fix All</button>`
    });

    // Store missing for fixAll
    window._faMissing = missing;
};

window.fixMissingAssignment = async function (feeId, feeName, count) {
    const confirmed = await confirmDialog(
        `Assign "${feeName}" to ${count} missing student(s)?`,
        'Fix Missing Assignment',
        { confirmText: 'Assign', confirmClass: 'btn-primary' }
    );
    if (!confirmed) return;

    closeModal();
    showToast(`Assigning "${feeName}" to ${count} students…`, 'info', 3000);

    const fee = (state.feeAmounts || []).find(f => f.id === feeId);
    const students = (state.students || []).filter(s => !s.is_deleted);
    const result = await bulkAssignFee(fee, students, state.studentFees);

    showToast(`Assigned to ${result.assigned} student(s).`, 'success');
    await refreshTable('student_fees');
    _faRenderTable();
    _faRenderKPIs();
};

window.fixAllMissing = async function () {
    const missing = window._faMissing || [];
    if (missing.length === 0) return;
    closeModal();

    showToast(`Fixing ${missing.length} missing assignment(s)…`, 'info', 4000);
    for (const { fee } of missing) {
        const students = (state.students || []).filter(s => !s.is_deleted);
        await bulkAssignFee(fee, students, state.studentFees).catch(() => { });
    }
    showToast('All missing assignments fixed.', 'success');
    await refreshTable('student_fees');
    _faRenderTable();
    _faRenderKPIs();
};

/* ── BULK ASSIGN MODAL ────────────────────────────────────────────── */
window.openBulkAssignModal = function () {
    const feeAmounts = (state.feeAmounts || []).filter(f => f.academic_year_id === getActiveYearId());

    const content = `
    <p style="color:var(--text-muted);margin-bottom:12px;">
        Select one or more fees to assign to ALL eligible students in the current year.
        Students who already have a fee will be skipped.
    </p>
    <div style="display:flex;flex-direction:column;gap:6px;max-height:300px;overflow-y:auto;">
        ${feeAmounts.map(f => `
        <label class="checkbox-custom" style="padding:6px 0;">
            <input type="checkbox" class="bulk-fee-chk" value="${f.id}">
            ${esc(f.name)} — ${fmtCurrency(f.amount)} (${esc(f.applies_to)})
        </label>`).join('')}
    </div>`;

    showModal(content, {
        title: 'Bulk Assign Fees',
        size: 'md',
        footer: `
            <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
            <button class="btn btn-primary" onclick="submitBulkAssign()">Assign Selected</button>`
    });
};

window.submitBulkAssign = async function () {
    const checked = [...document.querySelectorAll('.bulk-fee-chk:checked')].map(el => parseInt(el.value));
    if (checked.length === 0) { showToast('Select at least one fee.', 'warning'); return; }

    closeModal();
    showToast(`Assigning ${checked.length} fee(s) to all eligible students…`, 'info', 4000);

    let totalAssigned = 0;
    for (const feeId of checked) {
        const fee = (state.feeAmounts || []).find(f => f.id === feeId);
        if (!fee) continue;
        const students = (state.students || []).filter(s => !s.is_deleted);
        const result = await bulkAssignFee(fee, students, state.studentFees).catch(() => ({ assigned: 0 }));
        totalAssigned += result.assigned || 0;
    }

    showToast(`Bulk assignment complete — ${totalAssigned} new assignments created.`, 'success');
    await refreshTable('student_fees');
    _faRenderTable();
    _faRenderKPIs();
};

function _skeletonRows(n) {
    return `<div class="skeleton skeleton-table-header"></div>` +
        Array(n).fill('<div class="skeleton skeleton-table-row"></div>').join('');
}

window.renderFeeAssignments = renderFeeAssignments;