/**
 * ECOLE LA FONTAINE — Subjects Management
 * Manage subjects with MG/EX settings, level, and sorting
 * Last updated: 2026-06-29
 */



const state = window.state || {}; // global state alias
const ensureStateLoaded = window.ensureStateLoaded || (async () => {}); // global from boot.js
import { state, getCurrentUser } from '../../core/state.js';
import { esc } from '../../core/utils.js';
import { insert, update, remove, refreshTable, logActivity } from '../../core/api.js';

// ──────────────────────────────────────────────────────────────────────
// MAIN RENDER FUNCTION
// ──────────────────────────────────────────────────────────────────────

export async function renderSubjects(container) {
    if (!container) return;

    const user = getCurrentUser();
    if (user?.role !== 'admin') {
        container.innerHTML = '<div class="alert alert-danger">Access denied. Admin privileges required.</div>';
        return;
    }

    await ensureStateLoaded();

    const nurserySubjects = (state.subjects || []).filter(s => s.level === 'Nursery').sort((a, b) => (a.sort_order || 99) - (b.sort_order || 99));
    const primarySubjects = (state.subjects || []).filter(s => s.level === 'Primary').sort((a, b) => (a.sort_order || 99) - (b.sort_order || 99));

    container.innerHTML = `
        <div class="dash-card">
            <div class="dash-card-header" style="flex-wrap:wrap;gap:8px;">
                <span class="dash-card-title">📖 Subjects</span>
                <div class="btn-group" style="flex-wrap:wrap;gap:6px;">
                    <button class="btn btn-sm btn-primary" onclick="window._openAddSubjectModal()">➕ Add Subject</button>
                    <button class="btn btn-sm btn-success" onclick="window._saveAllSubjects()">💾 Save All</button>
                    <button class="btn btn-sm btn-outline" onclick="window._exportSubjects()">📥 Export</button>
                </div>
            </div>
            <div class="dash-card-body" style="padding:0;">
                <!-- Tabs -->
                <div class="tabs" style="display:flex;gap:2px;border-bottom:2px solid var(--border-light);padding:0 16px;flex-wrap:wrap;">
                    <button class="tab-btn active" onclick="window._showSubjectTab('nursery', event)" style="padding:10px 16px;font-size:0.8rem;">🎒 Nursery (${nurserySubjects.length})</button>
                    <button class="tab-btn" onclick="window._showSubjectTab('primary', event)" style="padding:10px 16px;font-size:0.8rem;">📚 Primary (${primarySubjects.length})</button>
                </div>

                <!-- Nursery Subjects -->
                <div id="nursery-subjects" style="padding:12px 16px;">
                    ${renderSubjectTable(nurserySubjects, 'Nursery')}
                </div>

                <!-- Primary Subjects -->
                <div id="primary-subjects" style="display:none;padding:12px 16px;">
                    ${renderSubjectTable(primarySubjects, 'Primary')}
                </div>
            </div>
        </div>
    `;

    window._openAddSubjectModal = openAddSubjectModal;
    window._saveAllSubjects = saveAllSubjects;
    window._exportSubjects = exportSubjects;
    window._showSubjectTab = showSubjectTab;
    window._toggleSubjectStatus = toggleSubjectStatus;
    window._deleteSubject = deleteSubject;
}

// ──────────────────────────────────────────────────────────────────────
// RENDER SUBJECT TABLE
// ──────────────────────────────────────────────────────────────────────

function renderSubjectTable(subjects, level) {
    if (!subjects || !subjects.length) {
        return `<div style="text-align:center;padding:30px;color:var(--text-muted);">No ${level} subjects found</div>`;
    }

    return `
        <div class="table-wrapper">
            <table class="data-table">
                <thead>
                    <tr>
                        <th style="width:40px;">#</th>
                        <th>Subject Name</th>
                        <th>Code</th>
                        <th style="width:70px;">MG Max</th>
                        <th style="width:70px;">EX Max</th>
                        <th style="width:120px;">Post-Mid Only</th>
                        <th>Status</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    ${subjects.map((s, i) => `
                        <tr>
                            <td style="text-align:center;">${i + 1}</td>
                            <td><input type="text" id="subj-name-${s.id}" class="form-control" style="width:100%;padding:4px 8px;" value="${esc(s.name)}" placeholder="Subject name"></td>
                            <td><code>${esc(s.code || '—')}</code></td>
                            <td><input type="number" id="subj-mg-${s.id}" class="form-control" style="width:60px;padding:4px;" value="${s.mg_max || 50}" min="0" max="100"></td>
                            <td><input type="number" id="subj-ex-${s.id}" class="form-control" style="width:60px;padding:4px;" value="${s.ex_max || 50}" min="0" max="100"></td>
                            <td style="text-align:center;"><input type="checkbox" id="subj-midonly-${s.id}" ${s.appears_only_post_midterm ? 'checked' : ''}></td>
                            <td><span class="badge ${s.is_active !== false ? 'badge-success' : 'badge-danger'}">${s.is_active !== false ? 'Active' : 'Hidden'}</span></td>
                            <td>
                                <button class="btn btn-sm btn-outline" onclick="window._toggleSubjectStatus(${s.id})" style="padding:2px 8px;font-size:0.7rem;">${s.is_active !== false ? 'Hide' : 'Show'}</button>
                                <button class="btn btn-sm btn-danger" onclick="window._deleteSubject(${s.id}, '${esc(s.name)}')" style="padding:2px 8px;font-size:0.7rem;">🗑️</button>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
    `;
}

// ──────────────────────────────────────────────────────────────────────
// SHOW SUBJECT TAB
// ──────────────────────────────────────────────────────────────────────

function showSubjectTab(tab, event) {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    if (event?.target) event.target.classList.add('active');

    document.getElementById('nursery-subjects').style.display = tab === 'nursery' ? 'block' : 'none';
    document.getElementById('primary-subjects').style.display = tab === 'primary' ? 'block' : 'none';
}

// ──────────────────────────────────────────────────────────────────────
// OPEN ADD SUBJECT MODAL
// ──────────────────────────────────────────────────────────────────────

function openAddSubjectModal() {
    showModal(`
        <div class="modal-overlay" id="add-subject-modal">
            <div class="modal" style="max-width:450px;">
                <div class="modal-header">
                    <h3>➕ Add Subject</h3>
                    <button class="modal-close" onclick="window.closeModal('add-subject-modal')">✕</button>
                </div>
                <div class="modal-body">
                    <div class="form-grid">
                        <div class="form-group full">
                            <label>Subject Name *</label>
                            <input type="text" id="subj-name" class="form-control" placeholder="e.g., Mathematics">
                        </div>
                        <div class="form-group">
                            <label>Code *</label>
                            <input type="text" id="subj-code" class="form-control" placeholder="e.g., MATH">
                        </div>
                        <div class="form-group">
                            <label>Level *</label>
                            <select id="subj-level" class="form-control">
                                <option value="Primary">Primary</option>
                                <option value="Nursery">Nursery</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label>MG Max</label>
                            <input type="number" id="subj-mg" class="form-control" value="50" min="0" max="100">
                        </div>
                        <div class="form-group">
                            <label>EX Max</label>
                            <input type="number" id="subj-ex" class="form-control" value="50" min="0" max="100">
                        </div>
                        <div class="form-group">
                            <label>Post-Midterm Only</label>
                            <select id="subj-midonly" class="form-control">
                                <option value="false">No</option>
                                <option value="true">Yes</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label>Sort Order</label>
                            <input type="number" id="subj-order" class="form-control" value="${(state.subjects || []).length + 1}" min="1">
                        </div>
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-outline" onclick="window.closeModal('add-subject-modal')">Cancel</button>
                    <button class="btn btn-primary" onclick="window._createSubject()">💾 Save</button>
                </div>
            </div>
        </div>
    `);

    window._createSubject = createSubject;
}

// ──────────────────────────────────────────────────────────────────────
// CREATE SUBJECT
// ──────────────────────────────────────────────────────────────────────

async function createSubject() {
    const name = document.getElementById('subj-name')?.value.trim();
    const code = document.getElementById('subj-code')?.value.trim().toUpperCase();
    const level = document.getElementById('subj-level')?.value || 'Primary';
    const mgMax = parseInt(document.getElementById('subj-mg')?.value) || 50;
    const exMax = parseInt(document.getElementById('subj-ex')?.value) || 50;
    const midonly = document.getElementById('subj-midonly')?.value === 'true';
    const order = parseInt(document.getElementById('subj-order')?.value) || (state.subjects.length + 1);

    if (!name || !code) {
        showToast('Name and code are required', 'warning');
        return;
    }

    const result = await insert('subjects', {
        name: name,
        code: code,
        level: level,
        mg_max: mgMax,
        ex_max: exMax,
        appears_only_post_midterm: midonly,
        sort_order: order,
        is_active: true,
        created_at: new Date().toISOString(),
    });

    if (result) {
        closeModal('add-subject-modal');
        await refreshTable('subjects');
        await logActivity(state.currentUser?.id, state.currentUser?.role, `Added subject: ${name}`);
        showToast('✅ Subject created', 'success');
        renderSubjects(document.getElementById('dynamic-content'));
    } else {
        showToast('Failed to create subject', 'error');
    }
}

// ──────────────────────────────────────────────────────────────────────
// SAVE ALL SUBJECTS
// ──────────────────────────────────────────────────────────────────────

async function saveAllSubjects() {
    const subjects = state.subjects || [];
    let saved = 0;

    for (const s of subjects) {
        const name = document.getElementById(`subj-name-${s.id}`)?.value.trim();
        const mg = parseInt(document.getElementById(`subj-mg-${s.id}`)?.value);
        const ex = parseInt(document.getElementById(`subj-ex-${s.id}`)?.value);
        const midonly = document.getElementById(`subj-midonly-${s.id}`)?.checked;

        if (name && name !== s.name) {
            await update('subjects', s.id, { name: name });
            saved++;
        }
        if (mg && mg !== s.mg_max) {
            await update('subjects', s.id, { mg_max: mg });
            saved++;
        }
        if (ex && ex !== s.ex_max) {
            await update('subjects', s.id, { ex_max: ex });
            saved++;
        }
        if (midonly !== s.appears_only_post_midterm) {
            await update('subjects', s.id, { appears_only_post_midterm: midonly });
            saved++;
        }
    }

    await refreshTable('subjects');
    await logActivity(state.currentUser?.id, state.currentUser?.role, `Updated ${saved} subject fields`);
    showToast(`✅ Saved ${saved} subject updates`, 'success');
    renderSubjects(document.getElementById('dynamic-content'));
}

// ──────────────────────────────────────────────────────────────────────
// TOGGLE SUBJECT STATUS
// ──────────────────────────────────────────────────────────────────────

async function toggleSubjectStatus(subjectId) {
    const subject = state.subjects.find(s => s.id === subjectId);
    if (!subject) return;

    const newStatus = subject.is_active !== false ? false : true;
    await update('subjects', subjectId, {
        is_active: newStatus,
        updated_at: new Date().toISOString(),
    });

    await refreshTable('subjects');
    await logActivity(state.currentUser?.id, state.currentUser?.role, `${newStatus ? 'Activated' : 'Deactivated'} subject: ${subject.name}`);
    showToast(`✅ Subject ${newStatus ? 'activated' : 'hidden'}`, 'success');
    renderSubjects(document.getElementById('dynamic-content'));
}

// ──────────────────────────────────────────────────────────────────────
// DELETE SUBJECT
// ──────────────────────────────────────────────────────────────────────

async function deleteSubject(subjectId, subjectName) {
    // Check if subject has assessments
    const hasAssessments = (state.assessments || []).some(a => a.subject_id === subjectId);
    if (hasAssessments) {
        showToast(`Cannot delete "${subjectName}" — it has existing assessments. Hide it instead.`, 'warning');
        return;
    }

    if (!await confirmDialog(`Delete subject "${subjectName}"? This cannot be undone.`)) return;

    const result = await remove('subjects', subjectId);
    if (result) {
        await refreshTable('subjects');
        await logActivity(state.currentUser?.id, state.currentUser?.role, `Deleted subject: ${subjectName}`);
        showToast('✅ Subject deleted', 'success');
        renderSubjects(document.getElementById('dynamic-content'));
    } else {
        showToast('Failed to delete subject', 'error');
    }
}

// ──────────────────────────────────────────────────────────────────────
// EXPORT SUBJECTS
// ──────────────────────────────────────────────────────────────────────

function exportSubjects() {
    const subjects = state.subjects || [];

    if (!subjects.length) {
        showToast('No subjects to export', 'warning');
        return;
    }

    const data = subjects.map(s => ({
        'Name': s.name,
        'Code': s.code || '',
        'Level': s.level || '',
        'MG Max': s.mg_max || 50,
        'EX Max': s.ex_max || 50,
        'Post-Midterm Only': s.appears_only_post_midterm ? 'Yes' : 'No',
        'Sort Order': s.sort_order || 0,
        'Status': s.is_active !== false ? 'Active' : 'Inactive',
    }));

    exportToExcel(data, `Subjects_Export_${new Date().toISOString().split('T')[0]}`);
    showToast('✅ Subjects exported', 'success');
}