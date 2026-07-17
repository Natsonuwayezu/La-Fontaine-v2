/* ═══════════════════════════════════════════════════════════════════
   js/modules/finance/fee-structure.js
   ═══════════════════════════════════════════════════════════════════
   Purpose : Manage fee categories and fee amounts.
             - CRUD fee categories (Tuition, Transport, Meals, etc.)
             - Create fee amounts per category per academic year
             - Set applies_to: all | class | student
             - Set due date, frequency, mandatory flag
             - Bulk assign new fee to all applicable students
             - Holiday fees are handled in holidays-fees.js (separate)
   Roles   : admin, accountant
   ═══════════════════════════════════════════════════════════════════ */

'use strict';

/* ── Module-level state ─────────────────────────────────────────── */
let _feeFilter = { yearId: null, categoryId: '', appliesToClass: '' };

async function renderFeeStructure() {
    const app = document.getElementById('app');
    if (!canManageFees()) {
        app.innerHTML = `<div class="alert alert-danger">Access denied.</div>`;
        return;
    }

    await ensureStateLoaded();
    _feeFilter.yearId = getActiveYearId();

    _renderFeeStructureShell(app);
    await _loadFeeStructureData();
}

function _renderFeeStructureShell(app) {
    const activeYear = getActiveYear();
    const years = state.academicYears || [];

    app.innerHTML = `
    <div class="module-wrap">

        <div class="mod-topbar">
            <div class="mod-topbar-left">
                <h1 class="mod-title">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
                         stroke="var(--primary)" stroke-width="2">
                        <use href="assets/icons/sprite.svg#icon-dollar-sign"/>
                    </svg>
                    Fee Structure
                </h1>
                <span class="mod-meta">${esc(activeYear?.year_name || '—')}</span>
            </div>
            <div class="mod-topbar-right">
                <select class="select select-sm" id="fee-year-filter"
                        onchange="onFeeYearFilter(this.value)">
                    ${years.map(y =>
        `<option value="${y.id}" ${y.id === _feeFilter.yearId ? 'selected' : ''}>
                            ${esc(y.year_name)}
                        </option>`
    ).join('')}
                </select>
                <button class="topbar-btn" onclick="openAddFeeCategory()">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                         stroke="currentColor" stroke-width="2">
                        <use href="assets/icons/sprite.svg#icon-folder-plus"/>
                    </svg>
                    Add Category
                </button>
                <button class="topbar-btn btn-fill" onclick="openAddFeeAmount()">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                         stroke="currentColor" stroke-width="2">
                        <use href="assets/icons/sprite.svg#icon-plus-circle"/>
                    </svg>
                    Add Fee
                </button>
            </div>
        </div>

        <!-- Category summary cards -->
        <div id="fee-category-cards" class="stats-grid stats-grid-3">
            <div class="skeleton skeleton-stat-card"></div>
            <div class="skeleton skeleton-stat-card"></div>
            <div class="skeleton skeleton-stat-card"></div>
        </div>

        <!-- Filters -->
        <div class="filters-bar">
            <div class="filter-group">
                <label>Category</label>
                <select id="filter-cat" class="select" onchange="onFeeCategoryFilter(this.value)">
                    <option value="">All Categories</option>
                </select>
            </div>
            <div class="filter-group">
                <label>Applies To</label>
                <select id="filter-applies" class="select" onchange="onFeeAppliesToFilter(this.value)">
                    <option value="">All</option>
                    <option value="all">All Students</option>
                    <option value="class">Specific Class</option>
                    <option value="student">Specific Student</option>
                </select>
            </div>
            <div class="filter-group">
                <label>Class</label>
                <select id="filter-fee-class" class="select" onchange="onFeeClassFilter(this.value)">
                    <option value="">All Classes</option>
                    ${(state.classes || []).map(c =>
        `<option value="${c.id}">${esc(c.name)}</option>`
    ).join('')}
                </select>
            </div>
            <div class="filter-actions">
                <button class="btn btn-reset" onclick="resetFeeFilters()">Reset</button>
            </div>
        </div>

        <!-- Fee amounts table -->
        <div class="section-card">
            <div id="fee-amounts-wrap">
                <div class="skeleton skeleton-table-header"></div>
                ${Array(4).fill('<div class="skeleton skeleton-table-row"></div>').join('')}
            </div>
        </div>

    </div>

    <!-- Add/Edit Category Modal -->
    <div class="modal-overlay" id="modal-overlay" onclick="onModalOverlayClick(event)">
    </div>`;
}

async function _loadFeeStructureData() {
    const yearId = _feeFilter.yearId;

    // Refresh categories
    await refreshTable('fee_categories');

    // Load fee amounts for selected year
    const feeAmounts = await getAll('fee_amounts',
        yearId ? `academic_year_id=eq.${yearId}&order=created_at.asc` : 'order=created_at.asc'
    ).catch(() => []);

    state.feeAmounts = feeAmounts;

    // Also load student fees count per fee amount (to know how many students have it)
    const allStudentFees = (state.studentFees.length > 0)
        ? state.studentFees
        : await getAll('student_fees',
            yearId ? `academic_year_id=eq.${yearId}&select=fee_amount_id,is_paid` : 'select=fee_amount_id,is_paid'
        ).catch(() => []);

    _renderCategoryCards();
    _renderFeeAmountsTable(feeAmounts, allStudentFees);
    _populateCategoryFilter();
}

function _renderCategoryCards() {
    const wrap = document.getElementById('fee-category-cards');
    if (!wrap) return;

    const categories = state.feeCategories || [];
    if (categories.length === 0) {
        wrap.innerHTML = `
        <div class="empty-state" style="grid-column:1/-1;">
            <div class="es-icon"><svg width="48" height="48" viewBox="0 0 24 24" fill="none"
                 stroke="currentColor" stroke-width="1.2" opacity="0.3">
                <use href="assets/icons/sprite.svg#icon-dollar-sign"/>
            </svg></div>
            <div class="es-title">No fee categories yet</div>
            <div class="es-sub">Click "Add Category" to create your first fee category.</div>
        </div>`;
        return;
    }

    wrap.innerHTML = categories.map(cat => {
        const catAmounts = (state.feeAmounts || []).filter(a => a.fee_category_id === cat.id);
        const totalAmt = catAmounts.reduce((s, a) => s + Number(a.amount || 0), 0);
        return `
        <div class="stat-card" style="cursor:pointer;" onclick="onFeeCategoryFilter('${cat.id}')">
            <div class="stat-value" style="font-size:1.1rem;">${esc(cat.name)}</div>
            <div class="stat-label">${catAmounts.length} fee amount${catAmounts.length !== 1 ? 's' : ''}</div>
            <div class="stat-sub" style="font-weight:600;color:var(--primary);">
                Avg: ${fmtCurrency(catAmounts.length ? totalAmt / catAmounts.length : 0)}
            </div>
            <div style="display:flex;gap:6px;margin-top:8px;">
                <button class="btn btn-sm btn-secondary"
                        onclick="event.stopPropagation();openEditFeeCategory(${cat.id})">Edit</button>
                <button class="btn btn-sm btn-ghost"
                        onclick="event.stopPropagation();deleteFeeCategory(${cat.id},'${esc(cat.name)}')">Delete</button>
            </div>
        </div>`;
    }).join('');
}

function _renderFeeAmountsTable(feeAmounts, allStudentFees) {
    const wrap = document.getElementById('fee-amounts-wrap');
    if (!wrap) return;

    // Apply filters
    let filtered = feeAmounts;
    if (_feeFilter.categoryId) {
        filtered = filtered.filter(a => a.fee_category_id === parseInt(_feeFilter.categoryId));
    }
    if (_feeFilter.appliesToClass) {
        filtered = filtered.filter(a => {
            if (_feeFilter.appliesToClass === 'all') return a.applies_to === 'all';
            if (_feeFilter.appliesToClass === 'class') return a.applies_to === 'class';
            if (_feeFilter.appliesToClass === 'student') return a.applies_to === 'student';
            return true;
        });
    }
    if (_feeFilter.appliesToClass === 'class' && _feeFilter.classId) {
        filtered = filtered.filter(a => a.class_id === parseInt(_feeFilter.classId));
    }

    // Build student fee index for each fee amount
    const sfIndex = {};
    allStudentFees.forEach(sf => {
        if (!sfIndex[sf.fee_amount_id]) sfIndex[sf.fee_amount_id] = { total: 0, paid: 0 };
        sfIndex[sf.fee_amount_id].total++;
        if (sf.is_paid) sfIndex[sf.fee_amount_id].paid++;
    });

    if (filtered.length === 0) {
        wrap.innerHTML = `
        <div class="empty-state" style="padding:40px;">
            <div class="es-icon"><svg width="40" height="40" viewBox="0 0 24 24" fill="none"
                 stroke="currentColor" stroke-width="1.2" opacity="0.3">
                <use href="assets/icons/sprite.svg#icon-dollar-sign"/>
            </svg></div>
            <div class="es-title">No fees found</div>
            <div class="es-sub">Adjust your filters or add a new fee.</div>
        </div>`;
        return;
    }

    const rows = filtered.map(fee => {
        const cat = (state.feeCategories || []).find(c => c.id === fee.fee_category_id);
        const cls = fee.class_id ? getClass(fee.class_id) : null;
        const student = fee.student_id ? getStudent(fee.student_id) : null;
        const sf = sfIndex[fee.id] || { total: 0, paid: 0 };

        let appliesToLabel = '';
        if (fee.applies_to === 'all') appliesToLabel = 'All Students';
        else if (fee.applies_to === 'class') appliesToLabel = cls?.name || 'Class';
        else if (fee.applies_to === 'student') appliesToLabel = student
            ? `${student.first_name} ${student.last_name}` : 'Student';

        return `
        <tr>
            <td>
                <strong>${esc(fee.name || '—')}</strong>
                ${fee.description ? `<div class="text-muted" style="font-size:11px;">${esc(fee.description)}</div>` : ''}
            </td>
            <td>
                <span class="badge badge-neutral">${esc(cat?.name || '—')}</span>
            </td>
            <td class="text-right" style="font-weight:700;">${fmtCurrency(fee.amount)}</td>
            <td>${esc(fee.frequency || '—')}</td>
            <td>${esc(appliesToLabel)}</td>
            <td>${fee.due_date ? esc(fmtDate(fee.due_date)) : '—'}</td>
            <td class="text-center">
                ${fee.is_mandatory
                ? '<span class="badge badge-danger">Required</span>'
                : '<span class="badge badge-neutral">Optional</span>'}
            </td>
            <td class="text-center">
                ${sf.total > 0
                ? `<span title="${sf.paid} paid of ${sf.total}">${sf.paid}/${sf.total}</span>`
                : '<span class="text-muted">0</span>'}
            </td>
            <td>
                <div style="display:flex;gap:4px;">
                    <button class="btn btn-sm btn-secondary"
                            onclick="openEditFeeAmount(${fee.id})">Edit</button>
                    <button class="btn btn-sm btn-primary"
                            onclick="bulkAssignFeeToStudents(${fee.id},'${esc(fee.name)}')">
                        Assign
                    </button>
                    <button class="btn btn-sm btn-ghost"
                            onclick="confirmDeleteFeeAmount(${fee.id},'${esc(fee.name)}')">
                        Delete
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
                    <th>Fee Name</th>
                    <th>Category</th>
                    <th class="text-right">Amount</th>
                    <th>Frequency</th>
                    <th>Applies To</th>
                    <th>Due Date</th>
                    <th class="text-center">Type</th>
                    <th class="text-center">Assigned</th>
                    <th>Actions</th>
                </tr>
            </thead>
            <tbody>${rows}</tbody>
        </table>
    </div>
    <div class="table-footer">
        <span>${filtered.length} fee amount${filtered.length !== 1 ? 's' : ''}</span>
        <button class="btn btn-sm btn-ghost"
                onclick="exportFeeStatus(state.students,state.feeCategories,state.studentFees)">
            Export Status
        </button>
    </div>`;
}

function _populateCategoryFilter() {
    const sel = document.getElementById('filter-cat');
    if (!sel) return;
    const cats = state.feeCategories || [];
    sel.innerHTML = `<option value="">All Categories</option>` +
        cats.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('');
}

/* ── FILTER HANDLERS ────────────────────────────────────────────── */
window.onFeeYearFilter = async function (yearId) {
    _feeFilter.yearId = parseInt(yearId);
    updateState('selectedYearId', parseInt(yearId));
    await _loadFeeStructureData();
};

window.onFeeCategoryFilter = function (catId) {
    _feeFilter.categoryId = catId;
    const sel = document.getElementById('filter-cat');
    if (sel) sel.value = catId;
    _renderFeeAmountsTable(state.feeAmounts, state.studentFees);
};

window.onFeeAppliesToFilter = function (val) {
    _feeFilter.appliesToClass = val;
    _renderFeeAmountsTable(state.feeAmounts, state.studentFees);
};

window.onFeeClassFilter = function (classId) {
    _feeFilter.classId = classId;
    _renderFeeAmountsTable(state.feeAmounts, state.studentFees);
};

window.resetFeeFilters = function () {
    _feeFilter.categoryId = '';
    _feeFilter.appliesToClass = '';
    _feeFilter.classId = '';
    const selCat = document.getElementById('filter-cat');
    if (selCat) selCat.value = '';
    const selApp = document.getElementById('filter-applies');
    if (selApp) selApp.value = '';
    const selCls = document.getElementById('filter-fee-class');
    if (selCls) selCls.value = '';
    _renderFeeAmountsTable(state.feeAmounts, state.studentFees);
};

/* ── ADD / EDIT FEE CATEGORY MODAL ─────────────────────────────── */
window.openAddFeeCategory = function () {
    _openFeeCategoryModal(null);
};
window.openEditFeeCategory = function (catId) {
    const cat = (state.feeCategories || []).find(c => c.id === catId);
    _openFeeCategoryModal(cat);
};

function _openFeeCategoryModal(cat) {
    const overlay = document.getElementById('modal-overlay');
    const isEdit = Boolean(cat);

    overlay.innerHTML = `
    <div class="modal-panel">
        <div class="modal-header">
            <h2>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
                     stroke="var(--primary)" stroke-width="2">
                    <use href="assets/icons/sprite.svg#icon-folder-plus"/>
                </svg>
                ${isEdit ? 'Edit' : 'Add'} Fee Category
            </h2>
            <button class="close-modal" onclick="closeModal()">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                     stroke="currentColor" stroke-width="2">
                    <use href="assets/icons/sprite.svg#icon-x"/>
                </svg>
            </button>
        </div>
        <div class="form-group">
            <label>Category Name *</label>
            <input type="text" id="cat-name" class="input"
                   value="${esc(cat?.name || '')}"
                   placeholder="e.g. Tuition, Transport, Meals">
        </div>
        <div class="form-group">
            <label>Description</label>
            <textarea id="cat-desc" class="input" rows="2"
                      placeholder="Optional">${esc(cat?.description || '')}</textarea>
        </div>
        <div class="form-group">
            <label>Sort Order</label>
            <input type="number" id="cat-sort" class="input"
                   value="${esc(String(cat?.sort_order || 0))}" min="0">
        </div>
        <div class="form-actions">
            <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
            <button class="btn btn-primary" onclick="saveFeeCategoryModal(${cat?.id || 'null'})">
                ${isEdit ? 'Save Changes' : 'Create Category'}
            </button>
        </div>
    </div>`;

    overlay.classList.add('show');
    document.getElementById('cat-name')?.focus();
}

window.saveFeeCategoryModal = async function (catId) {
    const name = cleanInput(document.getElementById('cat-name')?.value);
    const desc = cleanInput(document.getElementById('cat-desc')?.value);
    const sort = cleanInt(document.getElementById('cat-sort')?.value) || 0;

    if (!name) { showToast('Category name is required.', 'warning'); return; }

    const now = new Date().toISOString();

    try {
        if (catId) {
            await update('fee_categories', catId, { name, description: desc, sort_order: sort, updated_at: now });
            showToast(`Category "${name}" updated.`, 'success');
        } else {
            await insert('fee_categories', {
                name, description: desc, sort_order: sort,
                created_at: now, updated_at: now,
            });
            showToast(`Category "${name}" created.`, 'success');
        }
        closeModal();
        await _loadFeeStructureData();
    } catch (err) {
        handleApiError(err, 'save fee category');
    }
};

window.deleteFeeCategory = async function (catId, catName) {
    const confirm = await showConfirmDialog(
        `Delete category "${catName}"?`,
        'All fee amounts in this category must be deleted first.',
        'Delete', 'danger'
    );
    if (!confirm) return;

    const has = (state.feeAmounts || []).some(a => a.fee_category_id === catId);
    if (has) {
        showToast('Cannot delete — this category has fee amounts. Delete them first.', 'error');
        return;
    }

    try {
        await remove('fee_categories', catId);
        showToast(`Category "${catName}" deleted.`, 'success');
        await _loadFeeStructureData();
    } catch (err) {
        handleApiError(err, 'delete fee category');
    }
};

/* ── ADD / EDIT FEE AMOUNT MODAL ────────────────────────────────── */
window.openAddFeeAmount = function () {
    _openFeeAmountModal(null);
};
window.openEditFeeAmount = function (feeId) {
    const fee = (state.feeAmounts || []).find(f => f.id === feeId);
    _openFeeAmountModal(fee);
};

function _openFeeAmountModal(fee) {
    const overlay = document.getElementById('modal-overlay');
    const isEdit = Boolean(fee);
    const cats = state.feeCategories || [];
    const classes = state.classes || [];
    const years = state.academicYears || [];
    const students = (state.students || []).filter(s => !s.is_deleted);

    overlay.innerHTML = `
    <div class="modal-panel">
        <div class="modal-header">
            <h2>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
                     stroke="var(--primary)" stroke-width="2">
                    <use href="assets/icons/sprite.svg#icon-dollar-sign"/>
                </svg>
                ${isEdit ? 'Edit' : 'Add'} Fee Amount
            </h2>
            <button class="close-modal" onclick="closeModal()">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                     stroke="currentColor" stroke-width="2">
                    <use href="assets/icons/sprite.svg#icon-x"/>
                </svg>
            </button>
        </div>
        <div class="form-row">
            <div class="form-group">
                <label>Fee Name *</label>
                <input type="text" id="fa-name" class="input"
                       value="${esc(fee?.name || '')}"
                       placeholder="e.g. Term 1 Tuition">
            </div>
            <div class="form-group">
                <label>Category *</label>
                <select id="fa-cat" class="select">
                    <option value="">— Select —</option>
                    ${cats.map(c =>
        `<option value="${c.id}" ${fee?.fee_category_id === c.id ? 'selected' : ''}>
                            ${esc(c.name)}
                        </option>`
    ).join('')}
                </select>
            </div>
        </div>
        <div class="form-row">
            <div class="form-group">
                <label>Amount (RWF) *</label>
                <input type="number" id="fa-amount" class="input"
                       value="${esc(String(fee?.amount || ''))}" min="0" step="500">
            </div>
            <div class="form-group">
                <label>Frequency *</label>
                <select id="fa-freq" class="select">
                    ${FEE_FREQUENCIES.map(f =>
        `<option value="${f}" ${fee?.frequency === f ? 'selected' : ''}>
                            ${esc(f)}
                        </option>`
    ).join('')}
                </select>
            </div>
        </div>
        <div class="form-row">
            <div class="form-group">
                <label>Academic Year *</label>
                <select id="fa-year" class="select">
                    ${years.map(y =>
        `<option value="${y.id}"
                            ${(fee?.academic_year_id === y.id || y.id === _feeFilter.yearId) ? 'selected' : ''}>
                            ${esc(y.year_name)}
                        </option>`
    ).join('')}
                </select>
            </div>
            <div class="form-group">
                <label>Due Date</label>
                <input type="date" id="fa-due" class="input"
                       value="${esc(fee?.due_date || '')}">
            </div>
        </div>
        <div class="form-row">
            <div class="form-group">
                <label>Applies To *</label>
                <select id="fa-applies" class="select"
                        onchange="onFeeAppliesToChange(this.value)">
                    ${FEE_APPLY_TO.map(t =>
        `<option value="${t}" ${fee?.applies_to === t ? 'selected' : ''}>
                            ${t === 'all' ? 'All Students' : t === 'class' ? 'Specific Class' : 'Specific Student'}
                        </option>`
    ).join('')}
                </select>
            </div>
            <div class="form-group" id="fa-class-wrap"
                 style="${fee?.applies_to === 'class' ? '' : 'display:none'}">
                <label>Class</label>
                <select id="fa-class" class="select">
                    <option value="">— Select —</option>
                    ${classes.map(c =>
        `<option value="${c.id}" ${fee?.class_id === c.id ? 'selected' : ''}>
                            ${esc(c.name)}
                        </option>`
    ).join('')}
                </select>
            </div>
            <div class="form-group" id="fa-student-wrap"
                 style="${fee?.applies_to === 'student' ? '' : 'display:none'}">
                <label>Student</label>
                <select id="fa-student" class="select">
                    <option value="">— Select —</option>
                    ${students.map(s => {
        const c = getClass(s.class_id);
        return `<option value="${s.id}" ${fee?.student_id === s.id ? 'selected' : ''}>
                            ${esc(s.last_name)}, ${esc(s.first_name)} (${esc(c?.name || '?')})
                        </option>`;
    }).join('')}
                </select>
            </div>
        </div>
        <div class="form-row">
            <div class="form-group">
                <label>Description</label>
                <input type="text" id="fa-desc" class="input"
                       value="${esc(fee?.description || '')}"
                       placeholder="Optional notes">
            </div>
            <div class="form-group" style="display:flex;align-items:center;gap:8px;padding-top:22px;">
                <label class="checkbox-custom">
                    <input type="checkbox" id="fa-mandatory"
                           ${fee?.is_mandatory !== false ? 'checked' : ''}>
                    Mandatory Fee
                </label>
                <label class="checkbox-custom">
                    <input type="checkbox" id="fa-active"
                           ${fee?.is_active !== false ? 'checked' : ''}>
                    Active
                </label>
            </div>
        </div>
        <div class="form-actions">
            <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
            <button class="btn btn-primary" onclick="saveFeeAmountModal(${fee?.id || 'null'})">
                ${isEdit ? 'Save Changes' : 'Create Fee'}
            </button>
        </div>
    </div>`;

    overlay.classList.add('show');
}

window.onFeeAppliesToChange = function (val) {
    const clsWrap = document.getElementById('fa-class-wrap');
    const stuWrap = document.getElementById('fa-student-wrap');
    if (clsWrap) clsWrap.style.display = val === 'class' ? '' : 'none';
    if (stuWrap) stuWrap.style.display = val === 'student' ? '' : 'none';
};

window.saveFeeAmountModal = async function (feeId) {
    const name = cleanInput(document.getElementById('fa-name')?.value);
    const catId = cleanInt(document.getElementById('fa-cat')?.value);
    const amount = cleanNumber(document.getElementById('fa-amount')?.value);
    const freq = document.getElementById('fa-freq')?.value;
    const yearId = cleanInt(document.getElementById('fa-year')?.value);
    const due = cleanDate(document.getElementById('fa-due')?.value);
    const appliesTo = document.getElementById('fa-applies')?.value;
    const classId = cleanInt(document.getElementById('fa-class')?.value);
    const studentId = cleanInt(document.getElementById('fa-student')?.value);
    const desc = cleanInput(document.getElementById('fa-desc')?.value);
    const mandatory = document.getElementById('fa-mandatory')?.checked !== false;
    const active = document.getElementById('fa-active')?.checked !== false;

    // Validate
    const { valid, errors } = validateFeeForm({ name, amount });
    if (!valid) { showToast(Object.values(errors)[0], 'warning'); return; }
    if (!catId) { showToast('Please select a category.', 'warning'); return; }
    if (!yearId) { showToast('Please select an academic year.', 'warning'); return; }
    if (appliesTo === 'class' && !classId) {
        showToast('Please select a class.', 'warning'); return;
    }
    if (appliesTo === 'student' && !studentId) {
        showToast('Please select a student.', 'warning'); return;
    }

    const now = new Date().toISOString();
    const data = {
        name, fee_category_id: catId, amount, frequency: freq,
        academic_year_id: yearId, due_date: due,
        applies_to: appliesTo,
        class_id: appliesTo === 'class' ? classId : null,
        student_id: appliesTo === 'student' ? studentId : null,
        description: desc, is_mandatory: mandatory, is_active: active,
        updated_at: now,
    };

    try {
        if (feeId) {
            await update('fee_amounts', feeId, data);
            showToast(`Fee "${name}" updated.`, 'success');
        } else {
            data.created_at = now;
            const newFee = await insert('fee_amounts', data);
            showToast(`Fee "${name}" created.`, 'success');

            // Offer to bulk assign
            if (newFee?.id) {
                setTimeout(() => {
                    showToast(
                        `Assign "${name}" to existing students now?`,
                        'info', 0,
                        [{ label: 'Assign Now', fn: () => bulkAssignFeeToStudents(newFee.id, name) }]
                    );
                }, 500);
            }
        }

        closeModal();
        await _loadFeeStructureData();
    } catch (err) {
        handleApiError(err, 'save fee amount');
    }
};

/* ── BULK ASSIGN ────────────────────────────────────────────────── */
window.bulkAssignFeeToStudents = async function (feeId, feeName) {
    const confirm = await showConfirmDialog(
        `Assign "${feeName}" to all applicable students?`,
        'This will create student_fee rows for every student who matches this fee\'s "Applies To" setting and does not already have it.',
        'Assign', 'primary'
    );
    if (!confirm) return;

    showToast('Assigning fee to students…', 'info', 3000);

    try {
        const fee = (state.feeAmounts || []).find(f => f.id === feeId);
        if (!fee) { showToast('Fee not found.', 'error'); return; }

        const students = (state.students || []).filter(s => !s.is_deleted && s.status !== 'Inactive');
        const result = await bulkAssignFee(fee, students, state.studentFees);

        showToast(
            `Assigned to ${result.assigned} student(s). ${result.skipped} already had it.` +
            (result.errors.length ? ` ${result.errors.length} error(s).` : ''),
            result.errors.length ? 'warning' : 'success',
            5000
        );

        await refreshTable('student_fees');
        clearFinanceCaches();
        await _loadFeeStructureData();

    } catch (err) {
        handleApiError(err, 'bulk assign fee');
    }
};

/* ── DELETE FEE AMOUNT ──────────────────────────────────────────── */
window.confirmDeleteFeeAmount = async function (feeId, feeName) {
    const fee = (state.feeAmounts || []).find(f => f.id === feeId);
    const check = canDeleteFeeAmount(feeId, state.studentFees, state.payments);

    if (!check.canDelete) {
        await showConfirmDialog(
            `Cannot delete "${feeName}"`,
            check.reason,
            'OK', 'neutral'
        );
        return;
    }

    const confirm = await showConfirmDialog(
        `Delete fee "${feeName}"?`,
        'This will also remove all student_fee rows for this fee that have not been paid.',
        'Delete', 'danger'
    );
    if (!confirm) return;

    try {
        // Remove unpaid student_fee rows first
        await removeWhere('student_fees',
            `fee_amount_id=eq.${feeId}&is_paid=is.false`
        );
        await remove('fee_amounts', feeId);
        showToast(`Fee "${feeName}" deleted.`, 'success');
        await _loadFeeStructureData();
    } catch (err) {
        handleApiError(err, 'delete fee amount');
    }
};

window.renderFeeStructure = renderFeeStructure;