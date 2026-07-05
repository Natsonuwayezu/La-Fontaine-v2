/**
 * ECOLE LA FONTAINE — Class Management
 * Add, edit, reorder classes with capacity and status management
 * Last updated: 2026-07-03
 * 
 * CHANGES:
 * - Added academic year filtering for student counts
 * - Classes show student counts for selected year only
 * - Utilization calculated based on current year students
 * - Added year selector in statistics section
 * - Class list shows which students are in the current year
 */


const state = window.state || {}; // global state alias
import {
    state,
    getCurrentUser,
    getCurrentAcademicYear,
    getActiveAcademicYearId,
    getCurrentYearStudents,
    getStudentsByYear
} from '../../core/state.js';
import { esc, fmtPct } from '../../core/utils.js';
import { insert, update, remove, refreshTable, logActivity } from '../../core/api.js';

// ──────────────────────────────────────────────────────────────────────
// STATE
// ──────────────────────────────────────────────────────────────────────

let selectedYearId = null;

// ──────────────────────────────────────────────────────────────────────
// MAIN RENDER FUNCTION
// ──────────────────────────────────────────────────────────────────────

export async function renderClassManagement(container) {
    if (!container) return;

    const user = getCurrentUser();
    if (user?.role !== 'admin') {
        container.innerHTML = '<div class="alert alert-danger">Access denied. Admin privileges required.</div>';
        return;
    }

    await ensureStateLoaded();

    const classes = [...(state.classes || [])]
        .filter(c => c.is_active !== false)
        .sort((a, b) => (a.sort_order || 99) - (b.sort_order || 99));

    const currentYear = getCurrentAcademicYear();
    const years = (state.academicYears || []).sort((a, b) => b.id - a.id);

    // Default to current year
    if (!selectedYearId) {
        selectedYearId = currentYear?.id || null;
    }

    // Get students for selected year
    const yearStudents = selectedYearId
        ? (state.students || []).filter(s => s.academic_year_id === selectedYearId && s.status === 'Active' && !s.is_deleted)
        : (state.students || []).filter(s => s.status === 'Active' && !s.is_deleted);

    const totalStudents = yearStudents.length;
    const totalCapacity = classes.reduce((sum, c) => sum + (c.capacity || 40), 0);
    const avgUtilization = totalCapacity > 0 ? (totalStudents / totalCapacity) * 100 : 0;

    const isActiveYear = selectedYearId ? (state.academicYears || []).find(y => y.id === selectedYearId)?.is_active : true;

    container.innerHTML = `
        <div class="dash-card">
            <div class="dash-card-header" style="flex-wrap:wrap;gap:8px;">
                <span class="dash-card-title">🏛️ Class Management</span>
                <div class="btn-group" style="flex-wrap:wrap;gap:6px;">
                    <select id="cm-year-filter" onchange="window._loadClassManagement()" style="padding:6px 12px;border-radius:6px;border:1px solid var(--border-medium);font-size:0.8rem;">
                        ${years.map(y => `
                            <option value="${y.id}" ${y.id === selectedYearId ? 'selected' : ''}>
                                ${esc(y.name)} ${y.id === currentYear?.id ? '🟢' : ''} ${y.is_active ? '' : '🔒'}
                            </option>
                        `).join('')}
                    </select>
                    <button class="btn btn-sm btn-primary" onclick="window._openAddClassModal()">➕ Add Class</button>
                    <button class="btn btn-sm btn-outline" onclick="window._exportClassesData()">📥 Export</button>
                    <button class="btn btn-sm btn-outline" onclick="window._refreshClassManagement()">🔄 Refresh</button>
                </div>
            </div>
            <div class="dash-card-body" style="padding:0;">
                <div style="padding:8px 16px;border-bottom:1px solid var(--border-light);background:var(--bg-tertiary);font-size:0.75rem;color:var(--text-muted);display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px;">
                    <span>📅 Showing data for: <strong>${years.find(y => y.id === selectedYearId)?.name || 'All Years'}</strong></span>
                    <span>${isActiveYear ? '🟢 Editable' : '🔒 Read-only'}</span>
                </div>
                <div class="table-wrapper">
                    <table class="data-table">
                        <thead>
                            <tr>
                                <th>Order</th>
                                <th>Class</th>
                                <th>Code</th>
                                <th>Level</th>
                                <th>Students (${selectedYearId ? years.find(y => y.id === selectedYearId)?.name?.slice(-2) || 'Yr' : 'All'})</th>
                                <th>Capacity</th>
                                <th>Utilization</th>
                                <th>Status</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${classes.map((c, idx) => {
        const studentCount = selectedYearId
            ? (state.students || []).filter(s => s.class_id === c.id && s.academic_year_id === selectedYearId && s.status === 'Active' && !s.is_deleted).length
            : (state.students || []).filter(s => s.class_id === c.id && s.status === 'Active' && !s.is_deleted).length;
        const capacity = c.capacity || 40;
        const utilization = capacity > 0 ? (studentCount / capacity) * 100 : 0;
        const utilClass = utilization >= 100 ? 'badge-danger' : (utilization >= 90 ? 'badge-warning' : 'badge-success');
        const isEditable = isActiveYear;
        return `
                                    <tr>
                                        <td style="text-align:center;white-space:nowrap;">
                                            <button class="btn btn-sm btn-outline" onclick="window._moveClassUp(${c.id})" title="Move Up" style="padding:2px 6px;" ${!isEditable ? 'disabled' : ''}>▲</button>
                                            ${c.sort_order || idx + 1}
                                            <button class="btn btn-sm btn-outline" onclick="window._moveClassDown(${c.id})" title="Move Down" style="padding:2px 6px;" ${!isEditable ? 'disabled' : ''}>▼</button>
                                        </td>
                                        <td><strong>${esc(c.name)}</strong></td>
                                        <td>${esc(c.code || '—')}</td>
                                        <td><span class="badge ${c.level === 'Nursery' ? 'badge-info' : 'badge-primary'}">${esc(c.level || '—')}</span></td>
                                        <td style="text-align:center;">${studentCount}</td>
                                        <td style="text-align:center;">
                                            <input type="number" id="cap-${c.id}" class="form-control" style="width:70px;padding:4px;" value="${capacity}" min="1" onchange="window._updateClassCapacity(${c.id})" ${!isEditable ? 'disabled' : ''}>
                                        </td>
                                        <td style="text-align:center;"><span class="badge ${utilClass}">${utilization.toFixed(0)}%</span></td>
                                        <td style="text-align:center;"><span class="badge ${c.is_active !== false ? 'badge-success' : 'badge-danger'}">${c.is_active !== false ? 'Active' : 'Inactive'}</span></td>
                                        <td>
                                            <button class="btn btn-sm btn-outline" onclick="window._editClass(${c.id})" title="Edit" ${!isEditable ? 'disabled' : ''}>✏️</button>
                                            <button class="btn btn-sm ${c.is_active !== false ? 'btn-danger' : 'btn-success'}" onclick="window._toggleClassActive(${c.id}, ${c.is_active !== false})" ${!isEditable ? 'disabled' : ''}>${c.is_active !== false ? 'Deactivate' : 'Activate'}</button>
                                            <button class="btn btn-sm btn-outline" onclick="window._viewClassStudents(${c.id})" title="View Students">👥</button>
                                        </td>
                                    </tr>
                                `;
    }).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>

        <div class="dash-card" style="margin-top:20px;">
            <div class="dash-card-header">
                <span class="dash-card-title">📊 Class Statistics</span>
                <span style="font-size:0.7rem;color:var(--text-muted);">${selectedYearId ? years.find(y => y.id === selectedYearId)?.name || 'All Years' : 'All Years'}</span>
            </div>
            <div class="dash-card-body">
                <div class="stats-grid" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:12px;">
                    <div class="stat-card" style="padding:12px 16px;background:var(--bg-secondary);border-radius:var(--r-lg);border:1px solid var(--border-light);text-align:center;">
                        <div style="font-size:1.2rem;font-weight:700;">${classes.length}</div>
                        <div style="font-size:0.7rem;color:var(--text-muted);">Active Classes</div>
                    </div>
                    <div class="stat-card" style="padding:12px 16px;background:var(--bg-secondary);border-radius:var(--r-lg);border:1px solid var(--border-light);text-align:center;">
                        <div style="font-size:1.2rem;font-weight:700;">${totalStudents}</div>
                        <div style="font-size:0.7rem;color:var(--text-muted);">Total Students (${selectedYearId ? years.find(y => y.id === selectedYearId)?.name?.slice(-2) || 'Yr' : 'All'})</div>
                    </div>
                    <div class="stat-card" style="padding:12px 16px;background:var(--bg-secondary);border-radius:var(--r-lg);border:1px solid var(--border-light);text-align:center;">
                        <div style="font-size:1.2rem;font-weight:700;">${avgUtilization.toFixed(0)}%</div>
                        <div style="font-size:0.7rem;color:var(--text-muted);">Avg. Utilization</div>
                    </div>
                    <div class="stat-card" style="padding:12px 16px;background:var(--bg-secondary);border-radius:var(--r-lg);border:1px solid var(--border-light);text-align:center;">
                        <div style="font-size:1.2rem;font-weight:700;">${classes.filter(c => c.level === 'Nursery').length} / ${classes.filter(c => c.level !== 'Nursery').length}</div>
                        <div style="font-size:0.7rem;color:var(--text-muted);">Nursery / Primary</div>
                    </div>
                </div>
            </div>
        </div>
    `;

    window._openAddClassModal = openAddClassModal;
    window._exportClassesData = exportClassesData;
    window._moveClassUp = moveClassUp;
    window._moveClassDown = moveClassDown;
    window._updateClassCapacity = updateClassCapacity;
    window._toggleClassActive = toggleClassActive;
    window._editClass = editClass;
    window._viewClassStudents = viewClassStudents;
    window._loadClassManagement = loadClassManagement;
    window._refreshClassManagement = refreshClassManagement;
}

// ──────────────────────────────────────────────────────────────────────
// LOAD CLASS MANAGEMENT WITH YEAR FILTER
// ──────────────────────────────────────────────────────────────────────

async function loadClassManagement() {
    const yearId = document.getElementById('cm-year-filter')?.value;
    if (yearId) {
        selectedYearId = parseInt(yearId);
        renderClassManagement(document.getElementById('dynamic-content'));
    }
}

// ──────────────────────────────────────────────────────────────────────
// OPEN ADD CLASS MODAL
// ──────────────────────────────────────────────────────────────────────

function openAddClassModal() {
    const isEditable = isYearEditable();
    if (!isEditable) {
        showToast('Cannot add classes in an inactive academic year', 'warning');
        return;
    }

    showModal(`
        <div class="modal-overlay" id="add-class-modal">
            <div class="modal" style="max-width:450px;">
                <div class="modal-header">
                    <h3>➕ Add Class</h3>
                    <button class="modal-close" onclick="window.closeModal('add-class-modal')">✕</button>
                </div>
                <div class="modal-body">
                    <div class="form-grid">
                        <div class="form-group full">
                            <label>Class Name *</label>
                            <input type="text" id="nc-name" class="form-control" placeholder="e.g., PRIMARY 1">
                        </div>
                        <div class="form-group">
                            <label>Level *</label>
                            <select id="nc-level" class="form-control">
                                <option value="Primary">Primary</option>
                                <option value="Nursery">Nursery</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label>Code</label>
                            <input type="text" id="nc-code" class="form-control" placeholder="e.g., P1">
                        </div>
                        <div class="form-group">
                            <label>Capacity</label>
                            <input type="number" id="nc-capacity" class="form-control" value="30" min="1">
                        </div>
                        <div class="form-group full">
                            <label>Sort Order</label>
                            <input type="number" id="nc-order" class="form-control" value="${(state.classes || []).length + 1}" min="1">
                        </div>
                    </div>
                    <div style="margin-top:12px;padding:8px 12px;background:var(--bg-tertiary);border-radius:6px;font-size:0.75rem;color:var(--text-muted);">
                        📅 Classes added in the current academic year will be available for all years.
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-outline" onclick="window.closeModal('add-class-modal')">Cancel</button>
                    <button class="btn btn-primary" onclick="window._saveClass()">💾 Save</button>
                </div>
            </div>
        </div>
    `);

    window._saveClass = saveClass;
}

// ──────────────────────────────────────────────────────────────────────
// SAVE CLASS
// ──────────────────────────────────────────────────────────────────────

async function saveClass() {
    const name = document.getElementById('nc-name')?.value.trim();
    const level = document.getElementById('nc-level')?.value;
    const code = document.getElementById('nc-code')?.value.trim().toUpperCase();
    const capacity = parseInt(document.getElementById('nc-capacity')?.value) || 30;
    const sortOrder = parseInt(document.getElementById('nc-order')?.value) || (state.classes.length + 1);

    if (!name) {
        showToast('Class name is required', 'warning');
        return;
    }

    const result = await insert('classes', {
        name: name,
        level: level,
        code: code || null,
        capacity: capacity,
        sort_order: sortOrder,
        is_active: true,
        created_at: new Date().toISOString(),
    });

    if (result) {
        closeModal('add-class-modal');
        await refreshTable('classes');
        await logActivity(state.currentUser?.id, state.currentUser?.role, `Added class: ${name}`);
        showToast('✅ Class added', 'success');
        renderClassManagement(document.getElementById('dynamic-content'));
    } else {
        showToast('Failed to add class', 'error');
    }
}

// ──────────────────────────────────────────────────────────────────────
// EDIT CLASS
// ──────────────────────────────────────────────────────────────────────

async function editClass(classId) {
    const cls = state.classes.find(c => c.id === classId);
    if (!cls) {
        showToast('Class not found', 'error');
        return;
    }

    const isEditable = isYearEditable();
    if (!isEditable) {
        showToast('Cannot edit classes in an inactive academic year', 'warning');
        return;
    }

    showModal(`
        <div class="modal-overlay" id="edit-class-modal">
            <div class="modal" style="max-width:450px;">
                <div class="modal-header">
                    <h3>✏️ Edit Class</h3>
                    <button class="modal-close" onclick="window.closeModal('edit-class-modal')">✕</button>
                </div>
                <div class="modal-body">
                    <div class="form-grid">
                        <div class="form-group full">
                            <label>Class Name *</label>
                            <input type="text" id="ec-name" class="form-control" value="${esc(cls.name)}">
                        </div>
                        <div class="form-group">
                            <label>Level</label>
                            <select id="ec-level" class="form-control">
                                <option value="Primary" ${cls.level === 'Primary' ? 'selected' : ''}>Primary</option>
                                <option value="Nursery" ${cls.level === 'Nursery' ? 'selected' : ''}>Nursery</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label>Code</label>
                            <input type="text" id="ec-code" class="form-control" value="${esc(cls.code || '')}">
                        </div>
                        <div class="form-group">
                            <label>Capacity</label>
                            <input type="number" id="ec-capacity" class="form-control" value="${cls.capacity || 30}" min="1">
                        </div>
                        <div class="form-group full">
                            <label>Sort Order</label>
                            <input type="number" id="ec-order" class="form-control" value="${cls.sort_order || 1}" min="1">
                        </div>
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-outline" onclick="window.closeModal('edit-class-modal')">Cancel</button>
                    <button class="btn btn-primary" onclick="window._updateClass(${classId})">💾 Save</button>
                </div>
            </div>
        </div>
    `);

    window._updateClass = updateClass;
}

// ──────────────────────────────────────────────────────────────────────
// UPDATE CLASS
// ──────────────────────────────────────────────────────────────────────

async function updateClass(classId) {
    const name = document.getElementById('ec-name')?.value.trim();
    const level = document.getElementById('ec-level')?.value;
    const code = document.getElementById('ec-code')?.value.trim().toUpperCase();
    const capacity = parseInt(document.getElementById('ec-capacity')?.value) || 30;
    const sortOrder = parseInt(document.getElementById('ec-order')?.value) || 1;

    if (!name) {
        showToast('Class name is required', 'warning');
        return;
    }

    await update('classes', classId, {
        name: name,
        level: level,
        code: code || null,
        capacity: capacity,
        sort_order: sortOrder,
        updated_at: new Date().toISOString(),
    });

    closeModal('edit-class-modal');
    await refreshTable('classes');
    await logActivity(state.currentUser?.id, state.currentUser?.role, `Updated class: ${name}`);
    showToast('✅ Class updated', 'success');
    renderClassManagement(document.getElementById('dynamic-content'));
}

// ──────────────────────────────────────────────────────────────────────
// TOGGLE CLASS ACTIVE
// ──────────────────────────────────────────────────────────────────────

async function toggleClassActive(classId, isActive) {
    const cls = state.classes.find(c => c.id === classId);
    if (!cls) return;

    const isEditable = isYearEditable();
    if (!isEditable) {
        showToast('Cannot modify classes in an inactive academic year', 'warning');
        return;
    }

    // Check if class has students before deactivating
    if (isActive) {
        const studentCount = (state.students || []).filter(s => s.class_id === classId && s.status === 'Active').length;
        if (studentCount > 0 && !await confirmDialog(
            `⚠️ This class has ${studentCount} active students.\n` +
            `Deactivating will remove it from active lists.\n\n` +
            `Continue?`
        )) return;
    }

    await update('classes', classId, {
        is_active: !isActive,
        updated_at: new Date().toISOString(),
    });

    await refreshTable('classes');
    await logActivity(state.currentUser?.id, state.currentUser?.role, `${isActive ? 'Deactivated' : 'Activated'} class: ${cls.name}`);
    showToast(`✅ Class ${isActive ? 'deactivated' : 'activated'}`, 'success');
    renderClassManagement(document.getElementById('dynamic-content'));
}

// ──────────────────────────────────────────────────────────────────────
// UPDATE CLASS CAPACITY
// ──────────────────────────────────────────────────────────────────────

async function updateClassCapacity(classId) {
    const capacity = parseInt(document.getElementById(`cap-${classId}`)?.value);
    if (isNaN(capacity) || capacity < 1) {
        showToast('Please enter a valid capacity', 'warning');
        return;
    }

    await update('classes', classId, {
        capacity: capacity,
        updated_at: new Date().toISOString(),
    });

    await refreshTable('classes');
    showToast('✅ Capacity updated', 'success');
    renderClassManagement(document.getElementById('dynamic-content'));
}

// ──────────────────────────────────────────────────────────────────────
// MOVE CLASS UP
// ──────────────────────────────────────────────────────────────────────

async function moveClassUp(classId) {
    const classes = [...(state.classes || [])].sort((a, b) => (a.sort_order || 99) - (b.sort_order || 99));
    const idx = classes.findIndex(c => c.id === classId);
    if (idx <= 0) return;

    const current = classes[idx];
    const previous = classes[idx - 1];

    // Swap sort orders
    await update('classes', current.id, { sort_order: previous.sort_order });
    await update('classes', previous.id, { sort_order: current.sort_order });

    await refreshTable('classes');
    showToast('✅ Class moved up', 'success');
    renderClassManagement(document.getElementById('dynamic-content'));
}

// ──────────────────────────────────────────────────────────────────────
// MOVE CLASS DOWN
// ──────────────────────────────────────────────────────────────────────

async function moveClassDown(classId) {
    const classes = [...(state.classes || [])].sort((a, b) => (a.sort_order || 99) - (b.sort_order || 99));
    const idx = classes.findIndex(c => c.id === classId);
    if (idx < 0 || idx >= classes.length - 1) return;

    const current = classes[idx];
    const next = classes[idx + 1];

    // Swap sort orders
    await update('classes', current.id, { sort_order: next.sort_order });
    await update('classes', next.id, { sort_order: current.sort_order });

    await refreshTable('classes');
    showToast('✅ Class moved down', 'success');
    renderClassManagement(document.getElementById('dynamic-content'));
}

// ──────────────────────────────────────────────────────────────────────
// VIEW CLASS STUDENTS
// ──────────────────────────────────────────────────────────────────────

function viewClassStudents(classId) {
    const cls = state.classes.find(c => c.id === classId);
    if (!cls) {
        showToast('Class not found', 'error');
        return;
    }

    // Get students for selected year
    const students = (state.students || [])
        .filter(s => s.class_id === classId && s.status === 'Active' && !s.is_deleted && (selectedYearId ? s.academic_year_id === selectedYearId : true))
        .sort((a, b) => a.last_name.localeCompare(b.last_name));

    if (!students.length) {
        showToast(`No active students in ${cls.name}${selectedYearId ? ' for the selected year' : ''}`, 'info');
        return;
    }

    const year = (state.academicYears || []).find(y => y.id === selectedYearId);

    showModal(`
        <div class="modal-overlay" id="class-students-modal">
            <div class="modal" style="max-width:600px;">
                <div class="modal-header">
                    <h3>👥 Students in ${esc(cls.name)} (${students.length})</h3>
                    <button class="modal-close" onclick="window.closeModal('class-students-modal')">✕</button>
                </div>
                <div class="modal-body">
                    ${year ? `<div style="padding:8px 12px;background:var(--bg-tertiary);border-radius:6px;margin-bottom:12px;font-size:0.75rem;color:var(--text-muted);">📅 ${esc(year.name)}</div>` : ''}
                    <div class="table-wrapper">
                        <table class="data-table">
                            <thead>
                                <tr>
                                    <th>Code</th>
                                    <th>Name</th>
                                    <th>Gender</th>
                                    <th>Guardian</th>
                                    <th>Year</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${students.map(s => {
        const syear = (state.academicYears || []).find(y => y.id === s.academic_year_id);
        return `
                                        <tr>
                                            <td><code>${esc(s.student_code || '—')}</code></td>
                                            <td><strong>${esc(s.first_name)} ${esc(s.last_name)}</strong></td>
                                            <td>${esc(s.gender || '—')}</td>
                                            <td>${esc(s.guardian_name || '—')}</td>
                                            <td>${syear ? esc(syear.name) : '—'}</td>
                                        </tr>
                                    `;
    }).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-outline" onclick="window.closeModal('class-students-modal')">Close</button>
                    <button class="btn btn-primary" onclick="window.closeModal('class-students-modal'); window.navigateToWithData('student-list', { class_id: ${classId} })">📋 View All</button>
                </div>
            </div>
        </div>
    `);
}

// ──────────────────────────────────────────────────────────────────────
// EXPORT CLASSES DATA
// ──────────────────────────────────────────────────────────────────────

function exportClassesData() {
    const year = (state.academicYears || []).find(y => y.id === selectedYearId);
    const data = (state.classes || []).map(c => {
        const studentCount = selectedYearId
            ? (state.students || []).filter(s => s.class_id === c.id && s.academic_year_id === selectedYearId && s.status === 'Active' && !s.is_deleted).length
            : (state.students || []).filter(s => s.class_id === c.id && s.status === 'Active' && !s.is_deleted).length;
        return {
            'Class': c.name,
            'Code': c.code || '',
            'Level': c.level || '',
            'Capacity': c.capacity || 40,
            'Students': studentCount,
            'Utilization %': c.capacity ? ((studentCount / c.capacity) * 100).toFixed(1) : 0,
            'Status': c.is_active !== false ? 'Active' : 'Inactive',
            'Sort Order': c.sort_order || 0,
            'Academic Year': year?.name || 'All Years',
        };
    });

    exportToExcel(data, `Classes_Export_${year?.name || 'All'}_${new Date().toISOString().split('T')[0]}`);
    showToast('✅ Classes exported', 'success');
}

// ──────────────────────────────────────────────────────────────────────
// REFRESH CLASS MANAGEMENT
// ──────────────────────────────────────────────────────────────────────

async function refreshClassManagement() {
    await refreshTable('classes');
    await refreshTable('students');
    showToast('🔄 Refreshed', 'info', 1500);
    renderClassManagement(document.getElementById('dynamic-content'));
}

// ──────────────────────────────────────────────────────────────────────
// HELPER FUNCTIONS
// ──────────────────────────────────────────────────────────────────────

function isYearEditable() {
    if (!selectedYearId) return true;
    const year = (state.academicYears || []).find(y => y.id === selectedYearId);
    return year?.is_active !== false;
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
        const loadInitialData = window.loadInitialData || (async () => {});
        await loadInitialData(false);
    }
}

// Export functions to window
window._openAddClassModal = openAddClassModal;
window._exportClassesData = exportClassesData;
window._moveClassUp = moveClassUp;
window._moveClassDown = moveClassDown;
window._updateClassCapacity = updateClassCapacity;
window._toggleClassActive = toggleClassActive;
window._editClass = editClass;
window._viewClassStudents = viewClassStudents;
window._loadClassManagement = loadClassManagement;
window._refreshClassManagement = refreshClassManagement;
window._saveClass = saveClass;
window._updateClass = updateClass;