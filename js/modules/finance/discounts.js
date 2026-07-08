/**
 * ECOLE LA FONTAINE — Discounts Module
 * Manage discount rules, sibling discounts, bulk discounts with academic year support
 * Last updated: 2026-07-04
 * 
 * CHANGES:
 * - Added academic year filtering
 * - Discounts are now year-specific
 * - Year selector in filters
 * - Read-only mode for inactive years
 * - Discount applications respect selected year
 */



const ensureStateLoaded = window.ensureStateLoaded || (async () => {}); // global from boot.js
import {
    state,
    getClassById,
    getStudentById,
    getCurrentUser,
    isAdmin,
    isAccountant,
    getCurrentAcademicYear,
    getActiveAcademicYearId,
    getYearData,
    getCurrentYearData
} from '../../core/state.js';
import { esc, fmtCurrency, fmtDate } from '../../core/utils.js';
import { insert, update, remove, getAll, get } from '../../core/api.js';
import { notifyAction } from '../../core/notifications.js';
import { exportToExcel } from '../../core/utils.js';
import { ensureStateLoaded } from '../../core/boot.js';

// ──────────────────────────────────────────────────────────────────────
// STATE
// ──────────────────────────────────────────────────────────────────────

let selectedYearId = null;

// ──────────────────────────────────────────────────────────────────────
// MAIN RENDER FUNCTION
// ──────────────────────────────────────────────────────────────────────

export async function renderDiscounts(container) {
    if (!container) return;

    const user = getCurrentUser();
    if (user?.role === 'teacher') {
        container.innerHTML = '<div class="alert alert-danger">Access denied. Teachers cannot manage discounts.</div>';
        return;
    }

    await ensureStateLoaded();

    const families = state.families || [];
    const classes = (state.classes || []).filter(c => c.is_active !== false);
    const feeCategories = (state.feeCategories || []).filter(c => c.is_active !== false);
    const currentYear = getCurrentAcademicYear();
    const years = (state.academicYears || []).sort((a, b) => b.id - a.id);

    // Default to current year
    if (!selectedYearId) {
        selectedYearId = currentYear?.id || null;
    }

    const selectedYear = years.find(y => y.id === selectedYearId);
    const isActiveYear = selectedYear?.is_active === true;
    const isCurrentYear = selectedYear?.id === currentYear?.id;

    // Auto-detect sibling groups (filtered by year)
    const siblingGroups = [];
    const guardianMap = new Map();
    const studentsWithoutFamily = (state.students || [])
        .filter(s => !s.family_id && s.status === 'Active' && s.academic_year_id == selectedYearId);

    for (const student of studentsWithoutFamily) {
        const key = (student.guardian_name || '').toLowerCase().trim();
        if (key) {
            if (!guardianMap.has(key)) guardianMap.set(key, []);
            guardianMap.get(key).push(student);
        }
    }

    for (const [guardian, students] of guardianMap) {
        if (students.length > 1) {
            siblingGroups.push({ guardian, students });
        }
    }

    container.innerHTML = `
        <div class="dash-card">
            <div class="dash-card-header" style="flex-wrap:wrap;gap:8px;">
                <span class="dash-card-title">🎁 Discounts Management</span>
                <div class="btn-group" style="flex-wrap:wrap;gap:6px;">
                    <select id="disc-year-filter" onchange="window._loadDiscountsData()" style="padding:6px 10px;border-radius:6px;border:1px solid var(--border-medium);font-size:0.8rem;">
                        ${years.map(y => `
                            <option value="${y.id}" ${y.id === selectedYearId ? 'selected' : ''}>
                                ${esc(y.name)} ${y.id === currentYear?.id ? '🟢' : ''}
                            </option>
                        `).join('')}
                    </select>
                    <button class="btn btn-sm btn-primary" onclick="window._openAddDiscountRule()">➕ Add Discount Rule</button>
                    <button class="btn btn-sm btn-outline" onclick="window._exportDiscountsData()">📥 Export</button>
                    <button class="btn btn-sm btn-outline" onclick="window._refreshDiscounts()">🔄 Refresh</button>
                    ${!isActiveYear ? '<span class="badge badge-neutral" style="font-size:0.65rem;">🔒 Read-only</span>' : ''}
                </div>
            </div>
            <div class="dash-card-body">
                <div style="font-size:0.75rem;color:var(--text-muted);margin-bottom:12px;padding:6px 12px;background:var(--bg-tertiary);border-radius:6px;display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px;">
                    <span>📅 ${selectedYear?.name || 'All Years'} ${isActiveYear ? '🟢 Active' : '🔒 Inactive (Read-Only)'}</span>
                    <span>${isCurrentYear ? '✅ Current Year' : ''}</span>
                </div>

                <div class="tabs" style="display:flex;gap:2px;border-bottom:2px solid var(--border-light);margin-bottom:16px;">
                    <button class="tab-btn active" onclick="window._showDiscountTab('family', event)">🏠 Family Discounts</button>
                    <button class="tab-btn" onclick="window._showDiscountTab('sibling', event)">👨‍👩‍👧 Sibling Discounts</button>
                    <button class="tab-btn" onclick="window._showDiscountTab('bulk', event)">📦 Bulk Discounts</button>
                    <button class="tab-btn" onclick="window._showDiscountTab('rules', event)">📋 Discount Rules</button>
                </div>

                <!-- Family Discounts Tab -->
                <div id="family-discounts-tab">
                    <div class="table-wrapper">
                        <table class="data-table" style="font-size:0.8rem;">
                            <thead>
                                <tr>
                                    <th>Family Code</th>
                                    <th>Guardian Name</th>
                                    <th>Students</th>
                                    <th style="text-align:right;">Discount Amount</th>
                                    <th>Discount Type</th>
                                    <th style="text-align:center;">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${families.map(f => {
        const studentCount = (state.students || [])
            .filter(s => s.family_id === f.id && s.status === 'Active' && s.academic_year_id == selectedYearId).length;
        return `
                                        <tr>
                                            <td><code>${esc(f.family_code)}</code></td>
                                            <td><strong>${esc(f.guardian_name || '—')}</strong></td>
                                            <td style="text-align:center;">${studentCount}</td>
                                            <td style="text-align:right;">${fmtCurrency(f.discount_amount || 0)}</td>
                                            <td><span class="badge badge-info">${f.discount_type || 'Fixed'}</span></td>
                                            <td style="text-align:center;">
                                                <button class="btn btn-sm btn-outline" onclick="window._editFamilyDiscount(${f.id})" style="padding:2px 6px;font-size:0.7rem;">✏️</button>
                                                <button class="btn btn-sm btn-primary" onclick="window._applyFamilyDiscountToAll(${f.id})" style="padding:2px 6px;font-size:0.7rem;">💰 Apply</button>
                                            </td>
                                        </tr>
                                    `;
    }).join('') || '<tr><td colspan="6" style="text-align:center;padding:40px;color:var(--text-muted);">No families found for this academic year</td></tr>'}
                            </tbody>
                        </table>
                    </div>
                </div>

                <!-- Sibling Discounts Tab -->
                <div id="sibling-discounts-tab" style="display:none;">
                    <div class="alert alert-info" style="font-size:0.85rem;">Auto-detected sibling groups without family associations for ${selectedYear?.name || 'current year'}.</div>
                    ${siblingGroups.length > 0 ? `
                        <div class="table-wrapper">
                            <table class="data-table" style="font-size:0.8rem;">
                                <thead>
                                    <tr>
                                        <th>Guardian Name</th>
                                        <th>Siblings</th>
                                        <th style="text-align:center;">Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${siblingGroups.map(group => `
                                        <tr>
                                            <td><strong>${esc(group.guardian)}</strong></td>
                                            <td>${group.students.map(s => `${esc(s.first_name)} ${esc(s.last_name)}`).join(', ')}</td>
                                            <td style="text-align:center;">
                                                <button class="btn btn-sm btn-primary" onclick="window._createFamilyFromSiblings('${group.students.map(s => s.id).join(',')}', '${esc(group.guardian)}')">🏠 Create Family</button>
                                                <button class="btn btn-sm btn-outline" onclick="window._applySiblingDiscount('${group.students.map(s => s.id).join(',')}', 5000)">💰 Apply 5,000 RWF</button>
                                            </td>
                                        </tr>
                                    `).join('')}
                                </tbody>
                            </table>
                        </div>
                    ` : '<div class="alert alert-success" style="font-size:0.85rem;">No unlinked sibling groups detected for this academic year</div>'}
                </div>

                <!-- Bulk Discounts Tab -->
                <div id="bulk-discounts-tab" style="display:none;">
                    <div class="form-grid" style="margin-bottom:16px;">
                        <div class="form-group">
                            <label>Select Class</label>
                            <select id="bulk-discount-class" style="padding:8px 12px;border-radius:6px;border:1px solid var(--border-medium);width:100%;">
                                <option value="">All Classes</option>
                                ${classes.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}
                            </select>
                        </div>
                        <div class="form-group">
                            <label>Discount Type</label>
                            <select id="bulk-discount-type" style="padding:8px 12px;border-radius:6px;border:1px solid var(--border-medium);width:100%;">
                                <option value="fixed">Fixed Amount (RWF)</option>
                                <option value="percentage">Percentage (%)</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label>Discount Value</label>
                            <input type="number" id="bulk-discount-value" min="0" step="1000" style="padding:8px 12px;border-radius:6px;border:1px solid var(--border-medium);width:100%;">
                        </div>
                        <div class="form-group">
                            <label>Apply to Fee Category</label>
                            <select id="bulk-discount-category" style="padding:8px 12px;border-radius:6px;border:1px solid var(--border-medium);width:100%;">
                                <option value="">All Categories</option>
                                ${feeCategories.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}
                            </select>
                        </div>
                        <div class="form-group">
                            <label>Academic Year</label>
                            <select id="bulk-discount-year" style="padding:8px 12px;border-radius:6px;border:1px solid var(--border-medium);width:100%;">
                                ${years.map(y => `
                                    <option value="${y.id}" ${y.id === selectedYearId ? 'selected' : ''}>
                                        ${esc(y.name)} ${y.id === currentYear?.id ? '🟢' : ''}
                                    </option>
                                `).join('')}
                            </select>
                        </div>
                    </div>
                    <div class="btn-group">
                        <button class="btn btn-warning" onclick="window._previewBulkDiscount()">👁️ Preview</button>
                        <button class="btn btn-primary" onclick="window._applyBulkDiscountToClass()">🎁 Apply Discount</button>
                    </div>
                    <div id="bulk-discount-preview" style="margin-top:16px;display:none;"></div>
                </div>

                <!-- Discount Rules Tab -->
                <div id="discount-rules-tab" style="display:none;">
                    <div class="alert alert-info" style="font-size:0.85rem;">Create reusable discount rules for different scenarios.</div>
                    <div id="discount-rules-list">
                        <div class="loading-container"><div class="spinner"></div><p>Loading rules...</p></div>
                    </div>
                </div>
            </div>
        </div>
    `;

    window._showDiscountTab = showDiscountTab;
    window._openAddDiscountRule = openAddDiscountRule;
    window._exportDiscountsData = exportDiscountsData;
    window._refreshDiscounts = refreshDiscounts;
    window._editFamilyDiscount = editFamilyDiscount;
    window._applyFamilyDiscountToAll = applyFamilyDiscountToAll;
    window._createFamilyFromSiblings = createFamilyFromSiblings;
    window._applySiblingDiscount = applySiblingDiscount;
    window._previewBulkDiscount = previewBulkDiscount;
    window._applyBulkDiscountToClass = applyBulkDiscountToClass;
    window._loadDiscountsData = loadDiscountsData;

    await loadDiscountRules();
    await loadDiscountsData();
}

// ──────────────────────────────────────────────────────────────────────
// LOAD DISCOUNTS DATA (Year Change Handler)
// ──────────────────────────────────────────────────────────────────────

async function loadDiscountsData() {
    const yearId = document.getElementById('disc-year-filter')?.value;
    if (yearId) {
        selectedYearId = parseInt(yearId);
        renderDiscounts(document.getElementById('dynamic-content'));
    }
}

// ──────────────────────────────────────────────────────────────────────
// SHOW DISCOUNT TAB
// ──────────────────────────────────────────────────────────────────────

function showDiscountTab(tabName, event) {
    ['family', 'sibling', 'bulk', 'rules'].forEach(t => {
        const el = document.getElementById(`${t}-discounts-tab`);
        if (el) el.style.display = t === tabName ? 'block' : 'none';
    });
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    if (event?.target) event.target.classList.add('active');
}

// ──────────────────────────────────────────────────────────────────────
// LOAD DISCOUNT RULES
// ──────────────────────────────────────────────────────────────────────

async function loadDiscountRules() {
    const container = document.getElementById('discount-rules-list');
    if (!container) return;

    let discounts = [];
    try {
        const result = await getAll('discounts', 'order=created_at.desc&limit=200');
        discounts = result || [];
        state.discounts = discounts;
    } catch (e) {
        discounts = [];
    }

    if (!discounts.length) {
        container.innerHTML = '<div class="alert alert-info">No discount rules created yet.</div>';
        return;
    }

    const rows = discounts.map(d => {
        const cat = state.feeCategories.find(c => c.id === d.fee_category_id);
        const statusClass = d.is_active !== false ? 'badge-success' : 'badge-neutral';
        const statusText = d.is_active !== false ? 'Active' : 'Inactive';
        return `
            <tr>
                <td><strong>${esc(d.name)}</strong></td>
                <td>${esc(cat?.name || 'All Fees')}</td>
                <td>${d.discount_type === 'percentage' ? 'Percentage' : 'Fixed Amount'}</td>
                <td>${d.discount_type === 'percentage' ? d.discount_value + '%' : fmtCurrency(d.discount_value)}</td>
                <td>${esc(d.condition || 'always')}</td>
                <td><span class="badge ${statusClass}">${statusText}</span></td>
                <td style="text-align:center;">
                    <button class="btn btn-sm btn-danger" onclick="window._deleteDiscountRule(${d.id})" style="padding:2px 6px;font-size:0.7rem;">🗑️</button>
                </td>
            </tr>
        `;
    }).join('');

    container.innerHTML = `
        <div class="table-wrapper">
            <table class="data-table" style="font-size:0.8rem;">
                <thead>
                    <tr>
                        <th>Name</th>
                        <th>Applies To</th>
                        <th>Type</th>
                        <th>Value</th>
                        <th>Condition</th>
                        <th>Status</th>
                        <th style="text-align:center;">Action</th>
                    </tr>
                </thead>
                <tbody>${rows}</tbody>
            </table>
        </div>
    `;
}

// ──────────────────────────────────────────────────────────────────────
// OPEN ADD DISCOUNT RULE
// ──────────────────────────────────────────────────────────────────────

function openAddDiscountRule() {
    const categories = state.feeCategories || [];
    const years = (state.academicYears || []).sort((a, b) => b.id - a.id);
    const currentYear = getCurrentAcademicYear();

    const modalHtml = `
        <div class="modal-overlay" id="add-discount-modal">
            <div class="modal" style="max-width:450px;">
                <div class="modal-header">
                    <h3>💰 Add Discount Rule</h3>
                    <button class="modal-close" onclick="window.closeModal('add-discount-modal')">✕</button>
                </div>
                <div class="modal-body">
                    <div class="form-grid">
                        <div class="form-group" style="grid-column:1/-1;">
                            <label>Discount Name *</label>
                            <input type="text" id="disc-name" placeholder="e.g., Sibling Discount" style="padding:8px 12px;border-radius:6px;border:1px solid var(--border-medium);width:100%;">
                        </div>
                        <div class="form-group" style="grid-column:1/-1;">
                            <label>Applies To</label>
                            <select id="disc-category" style="padding:8px 12px;border-radius:6px;border:1px solid var(--border-medium);width:100%;">
                                <option value="">All Fees</option>
                                ${categories.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}
                            </select>
                        </div>
                        <div class="form-group">
                            <label>Type</label>
                            <select id="disc-type" style="padding:8px 12px;border-radius:6px;border:1px solid var(--border-medium);width:100%;">
                                <option value="percentage">Percentage (%)</option>
                                <option value="fixed">Fixed Amount (RWF)</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label>Value *</label>
                            <input type="number" id="disc-value" placeholder="e.g., 10 for 10%" min="0" step="1" style="padding:8px 12px;border-radius:6px;border:1px solid var(--border-medium);width:100%;">
                        </div>
                        <div class="form-group" style="grid-column:1/-1;">
                            <label>Academic Year</label>
                            <select id="disc-year" style="padding:8px 12px;border-radius:6px;border:1px solid var(--border-medium);width:100%;">
                                ${years.map(y => `
                                    <option value="${y.id}" ${y.id === selectedYearId || y.id === currentYear?.id ? 'selected' : ''}>
                                        ${esc(y.name)} ${y.id === currentYear?.id ? '🟢' : ''}
                                    </option>
                                `).join('')}
                            </select>
                        </div>
                        <div class="form-group" style="grid-column:1/-1;">
                            <label>Condition</label>
                            <select id="disc-condition" style="padding:8px 12px;border-radius:6px;border:1px solid var(--border-medium);width:100%;">
                                <option value="always">Always Apply</option>
                                <option value="sibling">Has Sibling Enrolled</option>
                                <option value="scholarship">Scholarship</option>
                                <option value="staff">Staff Child</option>
                            </select>
                        </div>
                    </div>
                    <div style="margin-top:12px;padding:8px 12px;background:var(--bg-tertiary);border-radius:6px;font-size:0.75rem;color:var(--text-muted);">
                        📅 This rule will be applied to the selected academic year.
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-outline" onclick="window.closeModal('add-discount-modal')">Cancel</button>
                    <button class="btn btn-primary" onclick="window._saveDiscountRule()">💾 Save Rule</button>
                </div>
            </div>
        </div>
    `;

    showModal(modalHtml);
}

// ──────────────────────────────────────────────────────────────────────
// SAVE DISCOUNT RULE
// ──────────────────────────────────────────────────────────────────────

window._saveDiscountRule = async function () {
    const name = document.getElementById('disc-name')?.value.trim();
    const categoryId = document.getElementById('disc-category')?.value;
    const type = document.getElementById('disc-type')?.value;
    const value = parseFloat(document.getElementById('disc-value')?.value);
    const condition = document.getElementById('disc-condition')?.value;
    const yearId = document.getElementById('disc-year')?.value;

    if (!name || isNaN(value) || value <= 0) {
        showToast('Name and value are required', 'warning');
        return;
    }

    const result = await insert('discounts', {
        name: name,
        fee_category_id: categoryId || null,
        discount_type: type,
        discount_value: value,
        condition: condition || 'always',
        academic_year_id: yearId || null,
        is_active: true,
        created_at: new Date().toISOString(),
    });

    if (result) {
        closeModal('add-discount-modal');
        state.discounts = state.discounts || [];
        state.discounts.push(result);
        showToast('✅ Discount rule saved', 'success');
        await loadDiscountRules();
    } else {
        showToast('Failed to save discount rule', 'error');
    }
};

// ──────────────────────────────────────────────────────────────────────
// DELETE DISCOUNT RULE
// ──────────────────────────────────────────────────────────────────────

window._deleteDiscountRule = async function (id) {
    if (!await confirmDialog('Delete this discount rule?')) return;

    const result = await remove('discounts', id);
    if (result) {
        state.discounts = (state.discounts || []).filter(d => d.id !== id);
        showToast('✅ Discount rule deleted', 'success');
        await loadDiscountRules();
    } else {
        showToast('Failed to delete discount rule', 'error');
    }
};

// ──────────────────────────────────────────────────────────────────────
// EDIT FAMILY DISCOUNT
// ──────────────────────────────────────────────────────────────────────

async function editFamilyDiscount(familyId) {
    const family = state.families.find(f => f.id === familyId);
    if (!family) return;

    const modalHtml = `
        <div class="modal-overlay" id="edit-family-disc-modal">
            <div class="modal" style="max-width:400px;">
                <div class="modal-header">
                    <h3>✏️ Edit Family Discount — ${esc(family.family_code)}</h3>
                    <button class="modal-close" onclick="window.closeModal('edit-family-disc-modal')">✕</button>
                </div>
                <div class="modal-body">
                    <div class="form-group">
                        <label>Discount Amount (RWF)</label>
                        <input type="number" id="edit-family-disc-amount" value="${family.discount_amount || 0}" min="0" step="1000" style="padding:8px 12px;border-radius:6px;border:1px solid var(--border-medium);width:100%;">
                    </div>
                    <div class="form-group">
                        <label>Discount Type</label>
                        <select id="edit-family-disc-type" style="padding:8px 12px;border-radius:6px;border:1px solid var(--border-medium);width:100%;">
                            <option value="fixed" ${family.discount_type === 'fixed' || !family.discount_type ? 'selected' : ''}>Fixed Amount</option>
                            <option value="percentage" ${family.discount_type === 'percentage' ? 'selected' : ''}>Percentage</option>
                        </select>
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-outline" onclick="window.closeModal('edit-family-disc-modal')">Cancel</button>
                    <button class="btn btn-primary" onclick="window._saveEditFamilyDiscount(${familyId})">💾 Save</button>
                </div>
            </div>
        </div>
    `;

    showModal(modalHtml);
}

// ──────────────────────────────────────────────────────────────────────
// SAVE EDIT FAMILY DISCOUNT
// ──────────────────────────────────────────────────────────────────────

window._saveEditFamilyDiscount = async function (familyId) {
    const amount = parseFloat(document.getElementById('edit-family-disc-amount')?.value) || 0;
    const type = document.getElementById('edit-family-disc-type')?.value || 'fixed';

    const result = await update('families', familyId, {
        discount_amount: amount,
        discount_type: type,
        updated_at: new Date().toISOString(),
    });

    if (result) {
        const idx = state.families.findIndex(f => f.id === familyId);
        if (idx !== -1) {
            state.families[idx].discount_amount = amount;
            state.families[idx].discount_type = type;
        }
        closeModal('edit-family-disc-modal');
        showToast('✅ Family discount updated', 'success');
        renderDiscounts(document.getElementById('dynamic-content'));
    } else {
        showToast('Failed to update family discount', 'error');
    }
};

// ──────────────────────────────────────────────────────────────────────
// APPLY FAMILY DISCOUNT TO ALL
// ──────────────────────────────────────────────────────────────────────

async function applyFamilyDiscountToAll(familyId) {
    const family = state.families.find(f => f.id === familyId);
    if (!family || !family.discount_amount) {
        showToast('No discount configured for this family', 'warning');
        return;
    }

    const members = (state.students || [])
        .filter(s => s.family_id === familyId && s.status === 'Active' && s.academic_year_id == selectedYearId);

    if (!members.length) {
        showToast('No active students in this family for the selected academic year', 'warning');
        return;
    }

    if (!await confirmDialog(`Apply ${fmtCurrency(family.discount_amount)} discount to ${members.length} student(s) in family ${family.family_code} for ${(state.academicYears || []).find(y => y.id === selectedYearId)?.name || 'current year'}?`)) return;

    let applied = 0;
    for (const student of members) {
        await insert('student_fees', {
            student_id: student.id,
            fee_category_id: null,
            term_id: state.currentTerm?.id,
            academic_year_id: selectedYearId,
            amount: -family.discount_amount,
            paid_amount: family.discount_amount,
            is_paid: true,
            is_waived: false,
            is_discount: true,
            discount_reason: `Family discount - ${family.family_code}`,
            created_at: new Date().toISOString(),
        });
        applied++;
    }

    await refreshTable('student_fees');
    await notifyAction('discount_applied', {
        message: `Applied family discount to ${applied} students in ${family.family_code} for ${(state.academicYears || []).find(y => y.id === selectedYearId)?.name || 'current year'}`,
        entity_type: 'families',
        family_id: familyId,
        academic_year: selectedYearId,
    }, ['admin', 'accountant']);

    showToast(`✅ Applied discount to ${applied} student(s)`, 'success');
}

// ──────────────────────────────────────────────────────────────────────
// CREATE FAMILY FROM SIBLINGS
// ──────────────────────────────────────────────────────────────────────

async function createFamilyFromSiblings(studentIdsStr, guardianName) {
    const studentIds = studentIdsStr.split(',').map(id => parseInt(id.trim())).filter(Boolean);
    const students = studentIds.map(id => getStudentById(id)).filter(Boolean);

    if (!students.length) return;

    const familyCode = `FAM-${Date.now().toString().slice(-6)}`;

    const newFamily = await insert('families', {
        family_code: familyCode,
        guardian_name: guardianName || students[0].guardian_name || 'Family',
        guardian_phone: students[0].guardian_phone || null,
        created_at: new Date().toISOString(),
    });

    if (!newFamily) {
        showToast('Failed to create family', 'error');
        return;
    }

    let linked = 0;
    for (const s of students) {
        const result = await update('students', s.id, {
            family_id: newFamily.id,
            academic_year_id: selectedYearId,
            updated_at: new Date().toISOString(),
        });
        if (result) linked++;
    }

    await refreshTable('students');
    await refreshTable('families');
    showToast(`✅ Created family ${familyCode} with ${linked} students`, 'success');
    renderDiscounts(document.getElementById('dynamic-content'));
}

// ──────────────────────────────────────────────────────────────────────
// APPLY SIBLING DISCOUNT
// ──────────────────────────────────────────────────────────────────────

async function applySiblingDiscount(studentIdsStr, amount) {
    const studentIds = studentIdsStr.split(',').map(id => parseInt(id.trim())).filter(Boolean);

    let applied = 0;
    for (const sid of studentIds) {
        const student = getStudentById(sid);
        if (!student) continue;

        await insert('student_fees', {
            student_id: sid,
            fee_category_id: null,
            term_id: state.currentTerm?.id,
            academic_year_id: selectedYearId,
            amount: -amount,
            paid_amount: amount,
            is_paid: true,
            is_waived: false,
            is_discount: true,
            discount_reason: 'Sibling discount',
            created_at: new Date().toISOString(),
        });
        applied++;
    }

    await refreshTable('student_fees');
    showToast(`✅ Applied ${fmtCurrency(amount)} sibling discount to ${applied} student(s)`, 'success');
}

// ──────────────────────────────────────────────────────────────────────
// PREVIEW BULK DISCOUNT
// ──────────────────────────────────────────────────────────────────────

function previewBulkDiscount() {
    const classId = document.getElementById('bulk-discount-class')?.value;
    const type = document.getElementById('bulk-discount-type')?.value;
    const value = parseFloat(document.getElementById('bulk-discount-value')?.value);
    const yearId = document.getElementById('bulk-discount-year')?.value || selectedYearId;
    const preview = document.getElementById('bulk-discount-preview');

    if (!classId || isNaN(value) || value <= 0) {
        showToast('Select class and enter a discount value first', 'warning');
        return;
    }

    const students = (state.students || [])
        .filter(s => s.class_id == classId && s.status === 'Active' && s.academic_year_id == yearId);
    const cls = getClassById(classId);
    const year = (state.academicYears || []).find(y => y.id == yearId);

    const totalFees = students.reduce((sum, s) => {
        const fees = (state.studentFees || [])
            .filter(f => f.student_id === s.id && !f.is_paid && !f.is_waived && f.academic_year_id == yearId);
        return sum + fees.reduce((s2, f) => s2 + f.amount, 0);
    }, 0);

    const discTotal = type === 'percentage' ? totalFees * (value / 100) : students.length * value;

    preview.innerHTML = `
        <div class="alert alert-info">
            <strong>Preview:</strong> ${students.length} students in ${esc(cls?.name || 'class')}<br>
            📅 ${year?.name || 'Current Year'}<br>
            Total Fees: ${fmtCurrency(totalFees)} · Discount: ${type === 'percentage' ? value + '%' : fmtCurrency(value)} per student<br>
            <strong>Total Discount: ${fmtCurrency(discTotal)}</strong>
        </div>
    `;
    preview.style.display = 'block';
}

// ──────────────────────────────────────────────────────────────────────
// APPLY BULK DISCOUNT TO CLASS
// ──────────────────────────────────────────────────────────────────────

async function applyBulkDiscountToClass() {
    const classId = document.getElementById('bulk-discount-class')?.value;
    const categoryId = document.getElementById('bulk-discount-category')?.value;
    const type = document.getElementById('bulk-discount-type')?.value;
    const value = parseFloat(document.getElementById('bulk-discount-value')?.value);
    const yearId = document.getElementById('bulk-discount-year')?.value || selectedYearId;

    if (!classId || isNaN(value) || value <= 0) {
        showToast('Select class and enter a valid discount value', 'warning');
        return;
    }

    const students = (state.students || [])
        .filter(s => s.class_id == classId && s.status === 'Active' && s.academic_year_id == yearId);

    if (!students.length) {
        showToast('No active students in selected class for this academic year', 'warning');
        return;
    }

    const year = (state.academicYears || []).find(y => y.id == yearId);
    const isActiveYear = year?.is_active === true;

    if (!isActiveYear) {
        showToast('Cannot apply discounts to inactive academic year', 'warning');
        return;
    }

    if (!await confirmDialog(`Apply ${type === 'percentage' ? value + '%' : fmtCurrency(value)} discount to ${students.length} students for ${year?.name || 'current year'}?`)) return;

    let applied = 0;
    for (const student of students) {
        const fees = (state.studentFees || [])
            .filter(f => f.student_id === student.id &&
                (!categoryId || f.fee_category_id == categoryId) &&
                !f.is_paid && !f.is_waived &&
                f.academic_year_id == yearId);

        for (const fee of fees) {
            const discAmount = type === 'percentage' ? fee.amount * (value / 100) : Math.min(value, fee.amount);
            await update('student_fees', fee.id, {
                amount: Math.max(0, fee.amount - discAmount),
                updated_at: new Date().toISOString(),
            });
            applied++;
        }
    }

    await refreshTable('student_fees');
    await notifyAction('discount_applied', {
        message: `Applied bulk discount to ${students.length} students in class for ${year?.name || 'current year'}`,
        entity_type: 'student_fees',
        academic_year: yearId,
    }, ['admin', 'accountant']);

    showToast(`✅ Applied discount to ${applied} fee records`, 'success');
    renderDiscounts(document.getElementById('dynamic-content'));
}

// ──────────────────────────────────────────────────────────────────────
// EXPORT DISCOUNTS DATA
// ──────────────────────────────────────────────────────────────────────

function exportDiscountsData() {
    const discounts = state.discounts || [];
    const year = (state.academicYears || []).find(y => y.id === selectedYearId);

    const data = discounts.map(d => ({
        'Name': d.name,
        'Applies To': state.feeCategories.find(c => c.id === d.fee_category_id)?.name || 'All Fees',
        'Type': d.discount_type === 'percentage' ? 'Percentage' : 'Fixed Amount',
        'Value': d.discount_type === 'percentage' ? d.discount_value + '%' : d.discount_value,
        'Condition': d.condition || 'Always',
        'Academic Year': year?.name || 'All Years',
        'Active': d.is_active !== false ? 'Yes' : 'No',
        'Created': fmtDate(d.created_at),
    }));

    const filename = `Discounts_${year?.name?.replace(/\s+/g, '_') || 'All'}_${new Date().toISOString().split('T')[0]}`;
    exportToExcel(data, filename);
    showToast('✅ Discounts exported', 'success');
}

// ──────────────────────────────────────────────────────────────────────
// REFRESH DISCOUNTS
// ──────────────────────────────────────────────────────────────────────

async function refreshDiscounts() {
    await refreshTable('families');
    await refreshTable('discounts');
    renderDiscounts(document.getElementById('dynamic-content'));
    showToast('🔄 Refreshed', 'info', 1000);
}