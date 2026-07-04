/**
 * ECOLE LA FONTAINE — Academic Years Management
 * Create, edit, clone, and set active academic years
 * Last updated: 2026-07-03
 * 
 * CHANGES:
 * - Added validation when setting a year as active
 * - Automatically reloads data when year changes
 * - Updates sidebar year selector when status changes
 * - Shows warning when deactivating current year
 * - Prevents deletion of years with active students/marks
 * - Updates topbar when year status changes
 */

import {
    state,
    getCurrentUser,
    getCurrentAcademicYear,
    getActiveAcademicYearId,
    setYearFilter,
    resetFilters
} from '../../core/state.js';
import { esc, fmtDate } from '../../core/utils.js';
import { insert, update, remove, getAll, refreshTable, logActivity, get } from '../../core/api.js';
import { refreshYearData } from '../../core/boot.js';

// ──────────────────────────────────────────────────────────────────────
// MAIN RENDER FUNCTION
// ──────────────────────────────────────────────────────────────────────

export async function renderAcademicYears(container) {
    if (!container) return;

    const user = getCurrentUser();
    if (user?.role !== 'admin') {
        container.innerHTML = '<div class="alert alert-danger">Access denied. Admin privileges required.</div>';
        return;
    }

    await ensureStateLoaded();

    const currentYear = state.currentAcadYear;
    const years = [...(state.academicYears || [])].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    container.innerHTML = `
        <div class="dash-card">
            <div class="dash-card-header">
                <span class="dash-card-title">📅 Academic Years Management</span>
                <div class="btn-group">
                    <button class="btn btn-sm btn-primary" onclick="window._openAddYearModal()">➕ Add Academic Year</button>
                    <button class="btn btn-sm btn-outline" onclick="window._exportAcademicYearsData()">📥 Export</button>
                    <button class="btn btn-sm btn-outline" onclick="window._refreshAcademicYears()">🔄 Refresh</button>
                </div>
            </div>
            <div class="dash-card-body" style="padding:0;">
                <div class="table-wrapper">
                    <table class="data-table">
                        <thead>
                            <tr>
                                <th>Year Name</th>
                                <th>Start Date</th>
                                <th>End Date</th>
                                <th>Status</th>
                                <th>Terms</th>
                                <th>Students</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${years.length ? years.map(year => {
        const termCount = (state.terms || []).filter(t => t.academic_year_id === year.id).length;
        const studentCount = (state.students || []).filter(s => s.academic_year_id === year.id && !s.is_deleted).length;
        const isActive = year.is_active;
        const isCurrent = year.id === currentYear?.id;

        return `
                                    <tr class="${isActive ? 'active-year' : ''}" style="${isActive ? 'background:var(--role-light);' : ''}">
                                        <td>
                                            <strong>${esc(year.name)}</strong>
                                            ${isActive ? '<span class="badge badge-success">🟢 Active</span>' : ''}
                                        </td>
                                        <td>${fmtDate(year.start_date)}</td>
                                        <td>${fmtDate(year.end_date)}</td>
                                        <td>
                                            <select onchange="window._setAcademicYearStatus(${year.id}, this.value)" class="form-control" style="width:120px;padding:4px;font-size:0.75rem;">
                                                <option value="active" ${isActive ? 'selected' : ''}>🟢 Active</option>
                                                <option value="inactive" ${!isActive ? 'selected' : ''}>🔒 Inactive</option>
                                            </select>
                                        </td>
                                        <td>
                                            <button class="btn btn-sm btn-outline" onclick="window._viewYearTerms(${year.id})">📋 ${termCount} Terms</button>
                                        </td>
                                        <td style="text-align:center;">${studentCount}</td>
                                        <td>
                                            <button class="btn btn-sm btn-outline" onclick="window._editAcademicYear(${year.id})" title="Edit">✏️</button>
                                            <button class="btn btn-sm btn-primary" onclick="window._cloneAcademicYear(${year.id})" title="Clone">📋</button>
                                            <button class="btn btn-sm btn-danger" onclick="window._deleteAcademicYear(${year.id}, '${esc(year.name)}')" title="Delete" ${isActive ? 'disabled' : ''}>🗑️</button>
                                        </td>
                                    </tr>
                                `;
    }).join('') : '<tr><td colspan="7" style="text-align:center;padding:20px;color:var(--text-muted);">No academic years found</td></tr>'}
                        </tbody>
                    </table>
                </div>
                <div style="padding:12px 16px;border-top:1px solid var(--border-light);font-size:0.75rem;color:var(--text-muted);">
                    💡 Only one academic year can be active at a time. Setting a year as active will deactivate the current one.
                    <br>⚠️ Deleting an academic year will remove all associated terms, assessments, and marks.
                </div>
            </div>
        </div>
    `;

    window._openAddYearModal = openAddYearModal;
    window._exportAcademicYearsData = exportAcademicYearsData;
    window._setAcademicYearStatus = setAcademicYearStatus;
    window._viewYearTerms = viewYearTerms;
    window._editAcademicYear = editAcademicYear;
    window._cloneAcademicYear = cloneAcademicYear;
    window._deleteAcademicYear = deleteAcademicYear;
    window._refreshAcademicYears = refreshAcademicYears;
}

// ──────────────────────────────────────────────────────────────────────
// OPEN ADD YEAR MODAL
// ──────────────────────────────────────────────────────────────────────

function openAddYearModal() {
    const currentYear = getCurrentAcademicYear();
    const nextYearName = currentYear ? `${parseInt(currentYear.name?.slice(0, 4) || new Date().getFullYear()) + 1}-${parseInt(currentYear.name?.slice(5, 9) || new Date().getFullYear()) + 2}` : `${new Date().getFullYear() + 1}-${new Date().getFullYear() + 2}`;

    showModal(`
        <div class="modal-overlay" id="add-year-modal">
            <div class="modal" style="max-width:450px;">
                <div class="modal-header">
                    <h3>📅 Add Academic Year</h3>
                    <button class="modal-close" onclick="window.closeModal('add-year-modal')">✕</button>
                </div>
                <div class="modal-body">
                    <div class="form-grid">
                        <div class="form-group full">
                            <label>Year Name *</label>
                            <input type="text" id="ay-name" class="form-control" placeholder="e.g., 2026-2027" value="${esc(nextYearName)}">
                        </div>
                        <div class="form-group">
                            <label>Start Date *</label>
                            <input type="date" id="ay-start" class="form-control" value="${currentYear?.end_date || ''}">
                        </div>
                        <div class="form-group">
                            <label>End Date *</label>
                            <input type="date" id="ay-end" class="form-control" value="${currentYear?.end_date ? new Date(new Date(currentYear.end_date).setFullYear(new Date(currentYear.end_date).getFullYear() + 1)).toISOString().split('T')[0] : ''}">
                        </div>
                        <div class="form-group full">
                            <label>Set as active</label>
                            <select id="ay-active" class="form-control">
                                <option value="true">Yes (activate immediately)</option>
                                <option value="false" selected>No (create as inactive)</option>
                            </select>
                        </div>
                    </div>
                    <div style="margin-top:12px;padding:8px 12px;background:var(--bg-tertiary);border-radius:6px;font-size:0.75rem;color:var(--text-muted);">
                        📅 Creating a new academic year will not affect existing data.
                        ${currentYear ? `Current year: ${esc(currentYear.name)}` : ''}
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-outline" onclick="window.closeModal('add-year-modal')">Cancel</button>
                    <button class="btn btn-primary" onclick="window._saveAcademicYear()">💾 Save</button>
                </div>
            </div>
        </div>
    `);

    window._saveAcademicYear = saveAcademicYear;
}

// ──────────────────────────────────────────────────────────────────────
// SAVE ACADEMIC YEAR
// ──────────────────────────────────────────────────────────────────────

async function saveAcademicYear() {
    const name = document.getElementById('ay-name')?.value.trim();
    const start = document.getElementById('ay-start')?.value;
    const end = document.getElementById('ay-end')?.value;
    const active = document.getElementById('ay-active')?.value === 'true';

    if (!name || !start || !end) {
        showToast('Name, start date, and end date are required', 'warning');
        return;
    }

    if (new Date(start) >= new Date(end)) {
        showToast('Start date must be before end date', 'warning');
        return;
    }

    // Check for duplicate name
    if (state.academicYears.some(y => y.name === name)) {
        showToast('An academic year with this name already exists', 'warning');
        return;
    }

    // If setting as active, deactivate all others
    if (active) {
        for (const y of state.academicYears) {
            if (y.is_active) {
                await update('academic_years', y.id, { is_active: false, updated_at: new Date().toISOString() });
            }
        }
    }

    const result = await insert('academic_years', {
        name: name,
        start_date: start,
        end_date: end,
        is_active: active,
        created_at: new Date().toISOString(),
    });

    if (result) {
        closeModal('add-year-modal');
        await refreshTable('academic_years');
        await refreshTable('terms');

        // If active, refresh all data
        if (active) {
            await refreshYearData(result.id);
            updateSidebarYearSelector();
        }

        await logActivity(state.currentUser?.id, state.currentUser?.role, `Created academic year: ${name}`);
        showToast(`✅ Academic year "${name}" created${active ? ' and activated' : ''}`, 'success');
        renderAcademicYears(document.getElementById('dynamic-content'));
    } else {
        showToast('Failed to create academic year', 'error');
    }
}

// ──────────────────────────────────────────────────────────────────────
// EDIT ACADEMIC YEAR
// ──────────────────────────────────────────────────────────────────────

async function editAcademicYear(yearId) {
    const year = state.academicYears.find(y => y.id === yearId);
    if (!year) {
        showToast('Year not found', 'error');
        return;
    }

    showModal(`
        <div class="modal-overlay" id="edit-year-modal">
            <div class="modal" style="max-width:450px;">
                <div class="modal-header">
                    <h3>✏️ Edit Academic Year</h3>
                    <button class="modal-close" onclick="window.closeModal('edit-year-modal')">✕</button>
                </div>
                <div class="modal-body">
                    <div class="form-grid">
                        <div class="form-group full">
                            <label>Year Name *</label>
                            <input type="text" id="ey-name" class="form-control" value="${esc(year.name)}">
                        </div>
                        <div class="form-group">
                            <label>Start Date *</label>
                            <input type="date" id="ey-start" class="form-control" value="${year.start_date || ''}">
                        </div>
                        <div class="form-group">
                            <label>End Date *</label>
                            <input type="date" id="ey-end" class="form-control" value="${year.end_date || ''}">
                        </div>
                        <div class="form-group full">
                            <label>Status</label>
                            <select id="ey-active" class="form-control">
                                <option value="true" ${year.is_active ? 'selected' : ''}>🟢 Active</option>
                                <option value="false" ${!year.is_active ? 'selected' : ''}>🔒 Inactive</option>
                            </select>
                        </div>
                    </div>
                    <div style="margin-top:12px;padding:8px 12px;background:var(--bg-tertiary);border-radius:6px;font-size:0.75rem;color:var(--text-muted);">
                        ${year.is_active ? '⚠️ This year is currently active. Deactivating it will make data read-only.' : 'ℹ️ This year is inactive. Activating it will make data editable.'}
                        <br>${year.is_active ? '💡 To change dates of an active year, deactivate it first, then edit.' : ''}
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-outline" onclick="window.closeModal('edit-year-modal')">Cancel</button>
                    <button class="btn btn-primary" onclick="window._updateAcademicYear(${yearId})">💾 Save</button>
                </div>
            </div>
        </div>
    `);

    window._updateAcademicYear = updateAcademicYear;
}

// ──────────────────────────────────────────────────────────────────────
// UPDATE ACADEMIC YEAR
// ──────────────────────────────────────────────────────────────────────

async function updateAcademicYear(yearId) {
    const name = document.getElementById('ey-name')?.value.trim();
    const start = document.getElementById('ey-start')?.value;
    const end = document.getElementById('ey-end')?.value;
    const active = document.getElementById('ey-active')?.value === 'true';

    if (!name || !start || !end) {
        showToast('Name, start date, and end date are required', 'warning');
        return;
    }

    if (new Date(start) >= new Date(end)) {
        showToast('Start date must be before end date', 'warning');
        return;
    }

    // Check for duplicate name (excluding current year)
    if (state.academicYears.some(y => y.id !== yearId && y.name === name)) {
        showToast('An academic year with this name already exists', 'warning');
        return;
    }

    const wasActive = state.academicYears.find(y => y.id === yearId)?.is_active;

    // If setting as active, deactivate all others
    if (active) {
        for (const y of state.academicYears) {
            if (y.id !== yearId && y.is_active) {
                await update('academic_years', y.id, { is_active: false, updated_at: new Date().toISOString() });
            }
        }
    }

    await update('academic_years', yearId, {
        name: name,
        start_date: start,
        end_date: end,
        is_active: active,
        updated_at: new Date().toISOString(),
    });

    closeModal('edit-year-modal');
    await refreshTable('academic_years');
    await refreshTable('terms');

    // If status changed, refresh data
    if (wasActive !== active) {
        if (active) {
            await refreshYearData(yearId);
        }
        updateSidebarYearSelector();
        updateTopbarYear();
    }

    await logActivity(state.currentUser?.id, state.currentUser?.role, `Updated academic year: ${name} (active: ${active})`);
    showToast(`✅ Academic year "${name}" updated`, 'success');
    renderAcademicYears(document.getElementById('dynamic-content'));
}

// ──────────────────────────────────────────────────────────────────────
// CLONE ACADEMIC YEAR
// ──────────────────────────────────────────────────────────────────────

async function cloneAcademicYear(yearId) {
    const source = state.academicYears.find(y => y.id === yearId);
    if (!source) {
        showToast('Year not found', 'error');
        return;
    }

    const newName = prompt('Name for cloned year:', source.name + ' (Copy)');
    if (!newName) return;

    // Check for duplicate name
    if (state.academicYears.some(y => y.name === newName)) {
        showToast('An academic year with this name already exists', 'warning');
        return;
    }

    // Create new year
    const result = await insert('academic_years', {
        name: newName,
        start_date: source.start_date,
        end_date: source.end_date,
        is_active: false,
        created_at: new Date().toISOString(),
    });

    if (!result) {
        showToast('Failed to clone academic year', 'error');
        return;
    }

    // Copy terms
    const sourceTerms = (state.terms || []).filter(t => t.academic_year_id === yearId);
    for (const t of sourceTerms) {
        await insert('terms', {
            name: t.name,
            term_number: t.term_number,
            start_date: t.start_date,
            end_date: t.end_date,
            midterm_date: t.midterm_date,
            academic_year_id: result.id,
            is_active: t.is_active || false,
            created_at: new Date().toISOString(),
        });
    }

    await refreshTable('academic_years');
    await refreshTable('terms');
    await logActivity(state.currentUser?.id, state.currentUser?.role, `Cloned academic year: ${source.name} → ${newName}`);
    showToast(`✅ Academic year "${newName}" cloned with ${sourceTerms.length} terms`, 'success');
    renderAcademicYears(document.getElementById('dynamic-content'));
}

// ──────────────────────────────────────────────────────────────────────
// DELETE ACADEMIC YEAR
// ──────────────────────────────────────────────────────────────────────

async function deleteAcademicYear(yearId, yearName) {
    const year = state.academicYears.find(y => y.id === yearId);
    if (!year) return;

    if (year.is_active) {
        showToast('❌ Cannot delete the active academic year', 'error');
        return;
    }

    // Check if there are any students in this year
    const studentCount = (state.students || []).filter(s => s.academic_year_id === yearId && !s.is_deleted).length;
    if (studentCount > 0) {
        if (!await confirmDialog(
            `⚠️ WARNING: ${studentCount} students are associated with "${yearName}".\n\n` +
            `Deleting this year will remove all associated:\n` +
            `• Students (${studentCount})\n` +
            `• Terms and assessments\n` +
            `• Marks and attendance records\n\n` +
            `This action CANNOT be undone.\n\n` +
            `Are you sure you want to delete "${yearName}"?`
        )) return;
    } else {
        if (!await confirmDialog(
            `⚠️ Delete academic year "${yearName}"?\n\n` +
            `This will also delete all its terms and assessments.\n` +
            `This action CANNOT be undone.\n\n` +
            `Are you sure?`
        )) return;
    }

    // Delete terms
    const terms = (state.terms || []).filter(t => t.academic_year_id === yearId);
    for (const t of terms) {
        // Delete assessments for this term
        const assessments = (state.assessments || []).filter(a => a.term_id === t.id);
        for (const a of assessments) {
            // Delete marks for this assessment
            await removeWhere('marks', `assessment_id=eq.${a.id}`);
            await remove('assessments', a.id);
        }
        await remove('terms', t.id);
    }

    // Delete year
    await remove('academic_years', yearId);

    await refreshTable('academic_years');
    await refreshTable('terms');
    await refreshTable('assessments');
    await refreshTable('marks');

    await logActivity(state.currentUser?.id, state.currentUser?.role, `Deleted academic year: ${yearName} (${studentCount} students affected)`);
    showToast(`✅ Academic year "${yearName}" deleted`, 'success');
    renderAcademicYears(document.getElementById('dynamic-content'));
}

// ──────────────────────────────────────────────────────────────────────
// SET ACADEMIC YEAR STATUS
// ──────────────────────────────────────────────────────────────────────

async function setAcademicYearStatus(yearId, status) {
    const active = status === 'active';
    const year = state.academicYears.find(y => y.id === yearId);
    if (!year) return;

    // If already in this state, do nothing
    if (year.is_active === active) {
        showToast(`Year is already ${active ? 'active' : 'inactive'}`, 'info');
        return;
    }

    // If activating, confirm
    if (active) {
        const currentActive = state.academicYears.find(y => y.is_active);
        if (currentActive) {
            if (!await confirmDialog(
                `⚠️ Activate "${year.name}"?\n\n` +
                `This will deactivate "${currentActive.name}".\n` +
                `All data will switch to "${year.name}".\n\n` +
                `Are you sure?`
            )) return;
        }
    } else {
        // Deactivating current year
        if (year.is_active) {
            if (!await confirmDialog(
                `⚠️ Deactivate "${year.name}"?\n\n` +
                `This will make all data read-only for this year.\n` +
                `You won't be able to add or edit data for this year.\n\n` +
                `Are you sure?`
            )) return;
        }
    }

    // If activating, deactivate all others
    if (active) {
        for (const y of state.academicYears) {
            if (y.id !== yearId && y.is_active) {
                await update('academic_years', y.id, { is_active: false, updated_at: new Date().toISOString() });
            }
        }
    }

    await update('academic_years', yearId, {
        is_active: active,
        updated_at: new Date().toISOString()
    });

    await refreshTable('academic_years');

    // Refresh data if activated
    if (active) {
        await refreshYearData(yearId);
    }

    // Update UI
    updateSidebarYearSelector();
    updateTopbarYear();
    updateTopbarYearAndTerm();

    await logActivity(state.currentUser?.id, state.currentUser?.role, `Set academic year "${year.name}" to ${status}`);
    showToast(`✅ "${year.name}" is now ${active ? '🟢 Active' : '🔒 Inactive'}`, active ? 'success' : 'warning');
    renderAcademicYears(document.getElementById('dynamic-content'));
}

// ──────────────────────────────────────────────────────────────────────
// VIEW YEAR TERMS
// ──────────────────────────────────────────────────────────────────────

function viewYearTerms(yearId) {
    const year = state.academicYears.find(y => y.id === yearId);
    const terms = (state.terms || []).filter(t => t.academic_year_id === yearId).sort((a, b) => a.term_number - b.term_number);

    showModal(`
        <div class="modal-overlay" id="year-terms-modal">
            <div class="modal" style="max-width:550px;">
                <div class="modal-header">
                    <h3>📅 Terms — ${esc(year?.name)}</h3>
                    <button class="modal-close" onclick="window.closeModal('year-terms-modal')">✕</button>
                </div>
                <div class="modal-body">
                    <div class="table-wrapper">
                        <table class="data-table">
                            <thead>
                                <tr>
                                    <th>#</th>
                                    <th>Term Name</th>
                                    <th>Start</th>
                                    <th>End</th>
                                    <th>Midterm</th>
                                    <th>Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${terms.map(t => `
                                    <tr>
                                        <td style="text-align:center;">${t.term_number}</td>
                                        <td><strong>${esc(t.name)}</strong></td>
                                        <td>${fmtDate(t.start_date)}</td>
                                        <td>${fmtDate(t.end_date)}</td>
                                        <td>${fmtDate(t.midterm_date)}</td>
                                        <td><span class="badge ${t.is_active ? 'badge-success' : 'badge-neutral'}">${t.is_active ? 'Active' : 'Inactive'}</span></td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-outline" onclick="window.closeModal('year-terms-modal')">Close</button>
                    <button class="btn btn-primary" onclick="window.closeModal('year-terms-modal'); window.navigateTo('academic-calendar')">📅 Manage Terms</button>
                </div>
            </div>
        </div>
    `);
}

// ──────────────────────────────────────────────────────────────────────
// REFRESH ACADEMIC YEARS
// ──────────────────────────────────────────────────────────────────────

async function refreshAcademicYears() {
    await refreshTable('academic_years');
    await refreshTable('terms');
    await refreshTable('assessments');
    showToast('🔄 Refreshed', 'info', 1500);
    renderAcademicYears(document.getElementById('dynamic-content'));
}

// ──────────────────────────────────────────────────────────────────────
// EXPORT ACADEMIC YEARS DATA
// ──────────────────────────────────────────────────────────────────────

function exportAcademicYearsData() {
    const data = (state.academicYears || []).flatMap(y => {
        const terms = (state.terms || []).filter(t => t.academic_year_id === y.id);
        if (terms.length) {
            return terms.map(t => ({
                'Academic Year': y.name,
                'Term': t.name,
                'Term #': t.term_number,
                'Start': fmtDate(t.start_date),
                'End': fmtDate(t.end_date),
                'Midterm': fmtDate(t.midterm_date),
                'Year Active': y.is_active ? 'Yes' : 'No',
                'Term Active': t.is_active ? 'Yes' : 'No',
            }));
        }
        return [{
            'Academic Year': y.name,
            'Term': '(no terms)',
            'Term #': '',
            'Start': fmtDate(y.start_date),
            'End': fmtDate(y.end_date),
            'Midterm': '',
            'Year Active': y.is_active ? 'Yes' : 'No',
            'Term Active': '',
        }];
    });

    exportToExcel(data, `Academic_Years_${new Date().toISOString().split('T')[0]}`);
    showToast('✅ Academic years exported', 'success');
}

// ──────────────────────────────────────────────────────────────────────
// HELPER FUNCTIONS
// ──────────────────────────────────────────────────────────────────────

function updateSidebarYearSelector() {
    // Find and update sidebar year selector
    const select = document.getElementById('sidebar-year-select');
    if (select) {
        const activeYear = state.academicYears.find(y => y.is_active);
        if (activeYear) {
            select.value = activeYear.id;
        }
    }
    // Rebuild sidebar year selector
    if (typeof buildYearSelector === 'function') {
        buildYearSelector();
    }
}

function updateTopbarYear() {
    const yearEl = document.getElementById('prog-acad-year');
    if (yearEl && state.currentAcadYear) {
        const isActive = state.currentAcadYear.is_active;
        const icon = isActive ? '🟢' : '🔒';
        yearEl.textContent = `${state.currentAcadYear.name} ${icon}`;
        yearEl.style.color = isActive ? 'var(--success)' : 'var(--text-muted)';
    }
}

function updateTopbarYearAndTerm() {
    if (typeof window.updateTopbarYearAndTerm === 'function') {
        window.updateTopbarYearAndTerm();
    }
}

function showToast(message, type = 'info', duration = 3500) {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `<span class="toast-icon">${icons[type] || 'ℹ️'}</span><span class="toast-message">${esc(message)}</span>`;
    container.appendChild(toast);
    setTimeout(() => { toast.classList.add('hiding'); setTimeout(() => toast.remove(), 300); }, duration);
}

function confirmDialog(message) {
    return new Promise((resolve) => {
        const modalId = `confirm-modal-${Date.now()}`;
        const html = `
            <div class="modal-overlay" id="${modalId}">
                <div class="modal modal-sm">
                    <div class="modal-header"><h3>⚠️ Confirm</h3><button class="modal-close" onclick="window.closeModal('${modalId}')">✕</button></div>
                    <div class="modal-body"><pre style="white-space:pre-wrap;font-family:inherit;font-size:0.9rem;">${esc(message)}</pre></div>
                    <div class="modal-footer">
                        <button class="btn btn-outline" onclick="window.closeModal('${modalId}'); window._confirmResolve(false)">Cancel</button>
                        <button class="btn btn-danger" onclick="window.closeModal('${modalId}'); window._confirmResolve(true)">Confirm</button>
                    </div>
                </div>
            </div>
        `;
        showModal(html);
        window._confirmResolve = resolve;
    });
}

function showModal(html) {
    const container = document.getElementById('modals-container');
    if (container) container.innerHTML = html;
}

function closeModal(modalId) {
    if (modalId) {
        const modal = document.getElementById(modalId);
        if (modal) modal.remove();
    } else {
        const container = document.getElementById('modals-container');
        if (container) container.innerHTML = '';
    }
}

function removeWhere(table, filterStr) {
    return new Promise((resolve, reject) => {
        import('../../core/api.js').then(({ removeWhere }) => {
            removeWhere(table, filterStr).then(resolve).catch(reject);
        }).catch(reject);
    });
}

function exportToExcel(data, filename) {
    if (!data?.length) {
        showToast('No data to export', 'warning');
        return;
    }
    if (typeof XLSX === 'undefined') {
        showToast('SheetJS library not loaded', 'warning');
        return;
    }
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Data');
    XLSX.writeFile(wb, `${filename}.xlsx`);
}

async function ensureStateLoaded() {
    if (!state.classes.length) {
        const { loadInitialData } = await import('../../core/boot.js');
        await loadInitialData(false);
    }
}

// Export functions to window
window._openAddYearModal = openAddYearModal;
window._exportAcademicYearsData = exportAcademicYearsData;
window._setAcademicYearStatus = setAcademicYearStatus;
window._viewYearTerms = viewYearTerms;
window._editAcademicYear = editAcademicYear;
window._cloneAcademicYear = cloneAcademicYear;
window._deleteAcademicYear = deleteAcademicYear;
window._refreshAcademicYears = refreshAcademicYears;
window._saveAcademicYear = saveAcademicYear;
window._updateAcademicYear = updateAcademicYear;