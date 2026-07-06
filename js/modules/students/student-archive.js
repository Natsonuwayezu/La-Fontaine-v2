/**
 * ECOLE LA FONTAINE — Student Archive Module
 * Manage archived students: restore, permanent delete, auto-archive
 * Last updated: 2026-06-29
 */



const ensureStateLoaded = window.ensureStateLoaded || (async () => {}); // global from boot.js
import { state, getClassById, getCurrentUser } from '../../core/state.js';
import { esc, fmtDate } from '../../core/utils.js';
import { update, remove, getAll } from '../../core/api.js';
import { notifyAction } from '../../core/notifications.js';

// ──────────────────────────────────────────────────────────────────────
// MAIN RENDER FUNCTION
// ──────────────────────────────────────────────────────────────────────

export async function renderStudentArchive(container) {
    if (!container) return;

    const user = getCurrentUser();
    if (user?.role !== 'admin') {
        container.innerHTML = '<div class="alert alert-danger">Access denied. Admin privileges required.</div>';
        return;
    }

    await ensureStateLoaded();

    const archived = (state.students || []).filter(s => s.is_deleted || s.status === 'Graduated' || s.status === 'Transferred');

    const inactiveStudents = (state.students || []).filter(s => s.status === 'Inactive' && !s.is_deleted);
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
    const autoArchiveCandidates = inactiveStudents.filter(s => new Date(s.updated_at || s.created_at) < oneYearAgo);

    container.innerHTML = `
        <div class="dash-card">
            <div class="dash-card-header">
                <span class="dash-card-title">📦 Student Archive</span>
                <div class="btn-group">
                    <button class="btn btn-sm btn-warning" onclick="window._runAutoArchive()">🔄 Run Auto-Archive Now</button>
                    <button class="btn btn-sm btn-outline" onclick="window._refreshArchive()">🔄 Refresh</button>
                </div>
            </div>
            <div class="dash-card-body">
                ${autoArchiveCandidates.length > 0 ? `
                    <div class="alert alert-info" style="font-size:0.85rem;">
                        ⚠️ ${autoArchiveCandidates.length} students have been inactive for over 1 year and are ready for archiving.
                        <button class="btn btn-sm btn-primary" onclick="window._runAutoArchive()" style="margin-left:8px;">Archive Now</button>
                    </div>
                ` : ''}

                <div class="filters-bar" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px;margin-bottom:16px;">
                    <div class="form-group" style="margin:0;">
                        <label style="font-size:0.7rem;">Status</label>
                        <select id="archive-status" onchange="window._filterArchive()" style="padding:6px 10px;border-radius:6px;border:1px solid var(--border-medium);width:100%;">
                            <option value="">All</option>
                            <option value="Archived">Archived</option>
                            <option value="Graduated">Graduated</option>
                            <option value="Transferred">Transferred</option>
                        </select>
                    </div>
                    <div class="form-group" style="margin:0;">
                        <label style="font-size:0.7rem;">Search</label>
                        <input type="text" id="archive-search" placeholder="🔍 Search name or code..." oninput="window._filterArchive()" style="padding:6px 10px;border-radius:6px;border:1px solid var(--border-medium);width:100%;">
                    </div>
                    <span class="result-count" id="archive-count" style="align-self:center;font-size:0.8rem;color:var(--text-muted);"></span>
                </div>

                <div class="table-wrapper">
                    <table class="data-table" style="font-size:0.8rem;">
                        <thead>
                            <tr>
                                <th>Name</th>
                                <th>Code</th>
                                <th>Class (Last)</th>
                                <th>Status</th>
                                <th>Archived</th>
                                <th style="text-align:center;">Actions</th>
                            </tr>
                        </thead>
                        <tbody id="archive-tbody">
                            <tr><td colspan="6" style="text-align:center;padding:40px;color:var(--text-muted);">Loading...</td></tr>
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    `;

    window._filterArchive = filterArchive;
    window._runAutoArchive = runAutoArchive;
    window._refreshArchive = refreshArchive;
    window._restoreStudent = restoreStudent;
    window._permanentDelete = permanentDelete;

    await filterArchive();
}

// ──────────────────────────────────────────────────────────────────────
// FILTER ARCHIVE
// ──────────────────────────────────────────────────────────────────────

async function filterArchive() {
    const tbody = document.getElementById('archive-tbody');
    if (!tbody) return;

    const status = document.getElementById('archive-status')?.value;
    const search = (document.getElementById('archive-search')?.value || '').toLowerCase();

    let students = (state.students || []).filter(s => s.is_deleted || s.status === 'Graduated' || s.status === 'Transferred');

    if (status === 'Archived') students = students.filter(s => s.is_deleted);
    else if (status === 'Graduated') students = students.filter(s => s.status === 'Graduated');
    else if (status === 'Transferred') students = students.filter(s => s.status === 'Transferred');

    if (search) {
        students = students.filter(s =>
            (s.first_name || '').toLowerCase().includes(search) ||
            (s.last_name || '').toLowerCase().includes(search) ||
            (s.student_code || '').toLowerCase().includes(search)
        );
    }

    students.sort((a, b) => a.last_name.localeCompare(b.last_name));

    const countEl = document.getElementById('archive-count');
    if (countEl) countEl.textContent = `${students.length} archived student${students.length !== 1 ? 's' : ''}`;

    if (!students.length) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:40px;color:var(--text-muted);">No archived students found</td></tr>';
        return;
    }

    tbody.innerHTML = students.map(s => {
        const cls = getClassById(s.class_id);
        const statusDisplay = s.is_deleted ? 'Archived' : s.status || '—';
        const statusClass = s.is_deleted ? 'badge-neutral' : s.status === 'Graduated' ? 'badge-info' : 'badge-warning';

        return `
            <tr>
                <td><strong>${esc(s.first_name)} ${esc(s.last_name)}</strong></td>
                <td><code>${esc(s.student_code || '—')}</code></td>
                <td>${esc(cls?.name || '—')}</td>
                <td><span class="badge ${statusClass}">${esc(statusDisplay)}</span></td>
                <td style="font-size:0.7rem;">${fmtDate(s.archived_at || s.updated_at || s.created_at)}</td>
                <td style="text-align:center;">
                    <button class="btn btn-sm btn-success" onclick="window._restoreStudent(${s.id})" title="Restore" style="padding:2px 8px;font-size:0.7rem;">♻️ Restore</button>
                    <button class="btn btn-sm btn-danger" onclick="window._permanentDelete(${s.id})" title="Permanent Delete" style="padding:2px 8px;font-size:0.7rem;">🗑️ Delete</button>
                </td>
            </tr>
        `;
    }).join('');
}

// ──────────────────────────────────────────────────────────────────────
// RESTORE STUDENT
// ──────────────────────────────────────────────────────────────────────

async function restoreStudent(studentId) {
    if (!await confirmDialog('Restore this student to Active status?')) return;

    const result = await update('students', studentId, {
        is_deleted: false,
        status: 'Active',
        updated_at: new Date().toISOString(),
    });

    if (result) {
        const idx = state.students.findIndex(s => s.id === studentId);
        if (idx !== -1) {
            state.students[idx].is_deleted = false;
            state.students[idx].status = 'Active';
        }
        showToast('✅ Student restored', 'success');
        await filterArchive();
    } else {
        showToast('Failed to restore student', 'error');
    }
}

// ──────────────────────────────────────────────────────────────────────
// PERMANENT DELETE
// ──────────────────────────────────────────────────────────────────────

async function permanentDelete(studentId) {
    const student = state.students.find(s => s.id === studentId);
    if (!student) return;

    if (!await confirmDialog(`⚠️ PERMANENTLY DELETE ${student.first_name} ${student.last_name}? All records will be lost. CANNOT be undone.`)) return;
    if (!await confirmDialog('Final confirmation — permanently delete?')) return;

    const result = await remove('students', studentId);

    if (result) {
        state.students = state.students.filter(s => s.id !== studentId);
        showToast('✅ Student permanently deleted', 'success');
        await filterArchive();
    } else {
        showToast('Failed to delete student', 'error');
    }
}

// ──────────────────────────────────────────────────────────────────────
// RUN AUTO-ARCHIVE
// ──────────────────────────────────────────────────────────────────────

async function runAutoArchive() {
    const days = parseInt(state.schoolSettings?.auto_archive_days) || 365;
    const cutoff = new Date(Date.now() - days * 86400000).toISOString();
    const toArchive = (state.students || []).filter(s =>
        s.status !== 'Active' &&
        !s.is_deleted &&
        s.updated_at &&
        s.updated_at < cutoff
    );

    if (!toArchive.length) {
        showToast(`No students eligible for auto-archive (${days} days threshold)`, 'info');
        return;
    }

    if (!await confirmDialog(`Auto-archive ${toArchive.length} inactive students (inactive > ${days} days)?`)) return;

    let archived = 0;
    for (const s of toArchive) {
        const result = await update('students', s.id, {
            is_deleted: true,
            archived_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        });
        if (result) archived++;
    }

    await refreshTable('students');
    showToast(`✅ Auto-archived ${archived} students`, 'success');
    await filterArchive();
}

// ──────────────────────────────────────────────────────────────────────
// REFRESH ARCHIVE
// ──────────────────────────────────────────────────────────────────────

async function refreshArchive() {
    await refreshTable('students');
    await filterArchive();
    showToast('🔄 Refreshed', 'info', 1000);
}