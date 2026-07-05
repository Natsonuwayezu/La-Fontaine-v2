/**
 * ECOLE LA FONTAINE — Assessment Locking Module
 * Bulk lock/unlock assessments, auto-lock settings, academic year support
 * Last updated: 2026-07-03
 * 
 * CHANGES:
 * - Added academic year filtering for assessments
 * - Lock/unlock operations are year-aware
 * - Auto-lock settings apply to current year assessments
 * - Read-only mode for inactive years
 * - Year indicator in the UI
 */


const state = window.state || {}; // global state alias
import {
    state,
    getClassById,
    getSubjectById,
    getTermById,
    getCurrentUser,
    getCurrentAcademicYear,
    getActiveAcademicYearId,
    isCurrentYearEditable
} from '../../core/state.js';
import { esc, fmtDate } from '../../core/utils.js';
import { update, getAll, get, updateSchoolSetting } from '../../core/api.js';
import { notifyAction } from '../../core/notifications.js';

// ──────────────────────────────────────────────────────────────────────
// STATE
// ──────────────────────────────────────────────────────────────────────

let selectedYearId = null;

// ──────────────────────────────────────────────────────────────────────
// MAIN RENDER FUNCTION
// ──────────────────────────────────────────────────────────────────────

export async function renderAssessmentLocking(container) {
    if (!container) return;

    const user = getCurrentUser();
    if (user?.role !== 'admin') {
        container.innerHTML = '<div class="alert alert-danger">Access denied. Admin privileges required.</div>';
        return;
    }

    await ensureStateLoaded();

    const currentYear = getCurrentAcademicYear();
    const years = (state.academicYears || []).sort((a, b) => b.id - a.id);

    // Default to current year
    if (!selectedYearId) {
        selectedYearId = currentYear?.id || null;
    }

    const terms = (state.terms || []).filter(t => t.academic_year_id === selectedYearId);
    const classes = (state.classes || []).filter(c => c.is_active !== false);
    const selectedYear = (state.academicYears || []).find(y => y.id === selectedYearId);
    const isEditable = selectedYear?.is_active === true;

    container.innerHTML = `
        <div class="dash-card">
            <div class="dash-card-header" style="flex-wrap:wrap;gap:8px;">
                <span class="dash-card-title">🔒 Assessment Locking Manager</span>
                <div class="btn-group" style="flex-wrap:wrap;gap:6px;">
                    <select id="lock-year-filter" onchange="window._loadLockAssessments()" style="padding:6px 12px;border-radius:6px;border:1px solid var(--border-medium);font-size:0.8rem;">
                        ${years.map(y => `
                            <option value="${y.id}" ${y.id === selectedYearId ? 'selected' : ''}>
                                ${esc(y.name)} ${y.id === currentYear?.id ? '🟢' : ''}
                            </option>
                        `).join('')}
                    </select>
                    ${isEditable ? `<button class="btn btn-sm btn-warning" onclick="window._openBulkLockModal()">🔒 Bulk Lock/Unlock</button>` : ''}
                    <button class="btn btn-sm btn-outline" onclick="window._refreshLockList()">🔄 Refresh</button>
                </div>
            </div>
            <div class="dash-card-body">
                ${!isEditable && selectedYear ? `
                    <div class="alert alert-warning" style="margin-bottom:16px;font-size:0.85rem;">
                        🔒 <strong>${esc(selectedYear.name)}</strong> is inactive. Assessment locking is read-only for this year.
                        <br>Switch to an active year to lock/unlock assessments.
                    </div>
                ` : ''}
                <div class="filters-bar" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px;margin-bottom:16px;">
                    <div class="form-group" style="margin:0;">
                        <label style="font-size:0.7rem;">Term</label>
                        <select id="lock-term-filter" onchange="window._filterLockAssessments()" style="padding:6px 10px;border-radius:6px;border:1px solid var(--border-medium);width:100%;">
                            <option value="">All Terms</option>
                            ${terms.map(t => `<option value="${t.id}">${esc(t.name)}</option>`).join('')}
                        </select>
                    </div>
                    <div class="form-group" style="margin:0;">
                        <label style="font-size:0.7rem;">Class</label>
                        <select id="lock-class-filter" onchange="window._filterLockAssessments()" style="padding:6px 10px;border-radius:6px;border:1px solid var(--border-medium);width:100%;">
                            <option value="">All Classes</option>
                            ${classes.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}
                        </select>
                    </div>
                    <div class="form-group" style="margin:0;">
                        <label style="font-size:0.7rem;">Search</label>
                        <input type="text" id="lock-search" placeholder="Search assessments..." oninput="window._filterLockAssessments()" style="padding:6px 10px;border-radius:6px;border:1px solid var(--border-medium);width:100%;">
                    </div>
                    <span class="result-count" id="lock-count" style="align-self:center;font-size:0.8rem;color:var(--text-muted);"></span>
                </div>
                <div class="table-wrapper" id="assessment-lock-table">
                    <div class="loading-container"><div class="spinner"></div><p>Loading assessments...</p></div>
                </div>
            </div>
        </div>

        <div class="dash-card" style="margin-top:20px;">
            <div class="dash-card-header">
                <span class="dash-card-title">📋 Locking Rules</span>
                <span style="font-size:0.7rem;color:var(--text-muted);">📅 ${selectedYear?.name || 'All Years'}</span>
            </div>
            <div class="dash-card-body">
                <div class="alert alert-info" style="font-size:0.85rem;">
                    <strong>Locking Rules:</strong>
                    <ul style="margin-top:8px;margin-left:20px;">
                        <li>🔒 <strong>Locked assessments</strong> cannot be edited by teachers</li>
                        <li>🔓 <strong>Unlocked assessments</strong> can be edited by assigned teachers</li>
                        <li>⏰ Assessments can be auto-locked when term ends (configure below)</li>
                        <li>👑 Only administrators can lock/unlock assessments</li>
                        <li>📅 Locking applies to the selected academic year</li>
                    </ul>
                </div>
                <div class="form-group" style="margin-top:12px;">
                    <label>Auto-lock after days past due date</label>
                    <div style="display:flex;gap:12px;align-items:center;">
                        <input type="number" id="auto-lock-days" value="${state.schoolSettings?.auto_lock_days || 7}" min="0" max="90" style="padding:8px 12px;border-radius:6px;border:1px solid var(--border-medium);width:100px;" ${!isEditable ? 'disabled' : ''}>
                        <button class="btn btn-sm btn-primary" onclick="window._saveAutoLockSettings()" ${!isEditable ? 'disabled' : ''}>💾 Save Setting</button>
                    </div>
                    <small class="field-hint">0 = disabled. Assessments will auto-lock X days after due date passes.</small>
                </div>
            </div>
        </div>
    `;

    window._filterLockAssessments = filterLockAssessments;
    window._refreshLockList = refreshLockList;
    window._openBulkLockModal = openBulkLockModal;
    window._saveAutoLockSettings = saveAutoLockSettings;
    window._toggleAssessmentLock = toggleAssessmentLock;
    window._loadLockAssessments = loadLockAssessments;

    await filterLockAssessments();
}

// ──────────────────────────────────────────────────────────────────────
// LOAD LOCK ASSESSMENTS (Year Change)
// ──────────────────────────────────────────────────────────────────────

async function loadLockAssessments() {
    const yearId = document.getElementById('lock-year-filter')?.value;
    if (yearId) {
        selectedYearId = parseInt(yearId);
        renderAssessmentLocking(document.getElementById('dynamic-content'));
    }
}

// ──────────────────────────────────────────────────────────────────────
// FILTER LOCK ASSESSMENTS
// ──────────────────────────────────────────────────────────────────────

async function filterLockAssessments() {
    const container = document.getElementById('assessment-lock-table');
    if (!container) return;

    const termId = document.getElementById('lock-term-filter')?.value;
    const classId = document.getElementById('lock-class-filter')?.value;
    const search = (document.getElementById('lock-search')?.value || '').toLowerCase();

    let list = (state.assessments || []);

    // Filter by selected academic year
    if (selectedYearId) {
        list = list.filter(a => a.academic_year_id == selectedYearId);
    }

    if (termId) list = list.filter(a => a.term_id == termId);
    if (classId) list = list.filter(a => a.class_id == classId);
    if (search) list = list.filter(a => (a.assessment_name || '').toLowerCase().includes(search));

    const countEl = document.getElementById('lock-count');
    if (countEl) countEl.textContent = `${list.length} assessment${list.length !== 1 ? 's' : ''}`;

    const selectedYear = (state.academicYears || []).find(y => y.id === selectedYearId);
    const isEditable = selectedYear?.is_active === true;

    if (!list.length) {
        container.innerHTML = `<div style="text-align:center;padding:40px;color:var(--text-muted);">
            No assessments match the filters${selectedYear ? ` in ${esc(selectedYear.name)}` : ''}.
        </div>`;
        return;
    }

    const rows = list.map(a => {
        const cls = getClassById(a.class_id);
        const sub = getSubjectById(a.subject_id);
        const term = getTermById(a.term_id);
        const marks = (state.marks || []).filter(m => m.assessment_id === a.id && m.academic_year_id == selectedYearId);
        const isLocked = a.is_locked || false;

        return `
            <tr>
                <td><strong>${esc(a.assessment_name)}</strong></td>
                <td>${esc(cls?.name || '—')}</td>
                <td>${esc(sub?.name || '—')}</td>
                <td>${esc(term?.name || '—')}</td>
                <td>${esc(a.assessment_type || '—')}</td>
                <td>${fmtDate(a.due_date || a.created_at)}</td>
                <td><span class="badge ${isLocked ? 'badge-danger' : 'badge-success'}">${isLocked ? '🔒 Locked' : '🔓 Open'}</span></td>
                <td>${marks.length}</td>
                <td>
                    ${isEditable ? `
                        <button class="btn btn-sm ${isLocked ? 'btn-success' : 'btn-warning'}" onclick="window._toggleAssessmentLock(${a.id}, ${isLocked})" style="padding:2px 10px;font-size:0.7rem;">
                            ${isLocked ? '🔓 Unlock' : '🔒 Lock'}
                        </button>
                    ` : `
                        <span style="font-size:0.65rem;color:var(--text-muted);">🔒 Read-only</span>
                    `}
                </td>
            </tr>
        `;
    }).join('');

    container.innerHTML = `
        <table class="data-table" style="font-size:0.78rem;">
            <thead>
                <tr>
                    <th>Title</th>
                    <th>Class</th>
                    <th>Subject</th>
                    <th>Term</th>
                    <th>Type</th>
                    <th>Date</th>
                    <th>Status</th>
                    <th>Marks</th>
                    <th>Action</th>
                </tr>
            </thead>
            <tbody>${rows}</tbody>
        </table>
    `;
}

// ──────────────────────────────────────────────────────────────────────
// REFRESH LOCK LIST
// ──────────────────────────────────────────────────────────────────────

async function refreshLockList() {
    await refreshTable('assessments');
    await filterLockAssessments();
    showToast('🔄 Refreshed', 'info', 1000);
}

// ──────────────────────────────────────────────────────────────────────
// TOGGLE ASSESSMENT LOCK
// ──────────────────────────────────────────────────────────────────────

async function toggleAssessmentLock(assessmentId, isLocked) {
    // Check if year is editable
    const selectedYear = (state.academicYears || []).find(y => y.id === selectedYearId);
    if (!selectedYear?.is_active) {
        showToast('🔒 Cannot modify — this academic year is inactive', 'warning');
        return;
    }

    const newState = !isLocked;
    if (!await confirmDialog(`${newState ? 'Lock' : 'Unlock'} this assessment?`)) return;

    const result = await update('assessments', assessmentId, {
        is_locked: newState,
        updated_at: new Date().toISOString(),
    });

    if (result) {
        const a = state.assessments.find(x => x.id === assessmentId);
        if (a) a.is_locked = newState;
        showToast(`✅ Assessment ${newState ? 'locked' : 'unlocked'}`, 'success');
        await filterLockAssessments();
    } else {
        showToast('Failed to update assessment', 'error');
    }
}

// ──────────────────────────────────────────────────────────────────────
// OPEN BULK LOCK MODAL
// ──────────────────────────────────────────────────────────────────────

function openBulkLockModal() {
    // Check if year is editable
    const selectedYear = (state.academicYears || []).find(y => y.id === selectedYearId);
    if (!selectedYear?.is_active) {
        showToast('🔒 Cannot modify — this academic year is inactive', 'warning');
        return;
    }

    const terms = (state.terms || []).filter(t => t.academic_year_id === selectedYearId);
    const classes = (state.classes || []).filter(c => c.is_active !== false);

    const modalHtml = `
        <div class="modal-overlay" id="bulk-lock-modal">
            <div class="modal" style="max-width:450px;">
                <div class="modal-header">
                    <h3>🔒 Bulk Lock / Unlock — ${esc(selectedYear?.name || '')}</h3>
                    <button class="modal-close" onclick="window.closeModal('bulk-lock-modal')">✕</button>
                </div>
                <div class="modal-body">
                    <div class="alert alert-warning" style="font-size:0.85rem;">⚠️ Applies to ALL assessments matching filters in ${esc(selectedYear?.name || 'this year')}.</div>
                    <div class="form-grid">
                        <div class="form-group">
                            <label>Term</label>
                            <select id="bulk-lock-term" style="padding:8px 12px;border-radius:6px;border:1px solid var(--border-medium);width:100%;">
                                <option value="">All Terms</option>
                                ${terms.map(t => `<option value="${t.id}">${esc(t.name)}</option>`).join('')}
                            </select>
                        </div>
                        <div class="form-group">
                            <label>Class</label>
                            <select id="bulk-lock-class" style="padding:8px 12px;border-radius:6px;border:1px solid var(--border-medium);width:100%;">
                                <option value="">All Classes</option>
                                ${classes.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}
                            </select>
                        </div>
                    </div>
                    <div style="margin-top:12px;font-size:0.85rem;color:var(--text-muted);">
                        <span id="bulk-lock-count">Loading...</span>
                        <br><small>📅 ${esc(selectedYear?.name || '')}</small>
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-outline" onclick="window.closeModal('bulk-lock-modal')">Cancel</button>
                    <button class="btn btn-warning" onclick="window._executeBulkLock(true)">🔒 Lock All</button>
                    <button class="btn btn-success" onclick="window._executeBulkLock(false)">🔓 Unlock All</button>
                </div>
            </div>
        </div>
    `;

    showModal(modalHtml);

    // Count assessments
    const termId = document.getElementById('bulk-lock-term')?.value;
    const classId = document.getElementById('bulk-lock-class')?.value;
    let list = (state.assessments || []).filter(a => a.academic_year_id == selectedYearId);
    if (termId) list = list.filter(a => a.term_id == termId);
    if (classId) list = list.filter(a => a.class_id == classId);
    document.getElementById('bulk-lock-count').textContent = `${list.length} assessment${list.length !== 1 ? 's' : ''} will be affected`;
}

// ──────────────────────────────────────────────────────────────────────
// EXECUTE BULK LOCK
// ──────────────────────────────────────────────────────────────────────

window._executeBulkLock = async function (lock) {
    const termId = document.getElementById('bulk-lock-term')?.value;
    const classId = document.getElementById('bulk-lock-class')?.value;

    let list = (state.assessments || []).filter(a => a.academic_year_id == selectedYearId);
    if (termId) list = list.filter(a => a.term_id == termId);
    if (classId) list = list.filter(a => a.class_id == classId);

    if (!list.length) {
        showToast('No assessments match the filters', 'warning');
        return;
    }

    // Double-check year is editable
    const selectedYear = (state.academicYears || []).find(y => y.id === selectedYearId);
    if (!selectedYear?.is_active) {
        showToast('🔒 Cannot modify — this academic year is inactive', 'warning');
        return;
    }

    closeModal('bulk-lock-modal');

    showToast(`⏳ Processing ${list.length} assessments...`, 'info', 3000);

    let done = 0;
    for (const a of list) {
        const result = await update('assessments', a.id, {
            is_locked: lock,
            updated_at: new Date().toISOString(),
        });
        if (result) { a.is_locked = lock; done++; }
    }

    showToast(`✅ ${done} assessments ${lock ? 'locked' : 'unlocked'} in ${selectedYear?.name || ''}`, 'success');
    await notifyAction('assessment_locked', {
        message: `Bulk ${lock ? 'lock' : 'unlock'} of ${done} assessments in ${selectedYear?.name || ''}`,
        entity_type: 'assessments',
        academic_year: selectedYearId,
    }, ['admin', 'teacher']);
    await filterLockAssessments();
};

// ──────────────────────────────────────────────────────────────────────
// SAVE AUTO-LOCK SETTINGS
// ──────────────────────────────────────────────────────────────────────

async function saveAutoLockSettings() {
    const days = parseInt(document.getElementById('auto-lock-days')?.value) || 0;
    await updateSchoolSetting('auto_lock_days', String(days));
    state.schoolSettings.auto_lock_days = days;
    showToast(`✅ Auto-lock setting saved (${days} days)`, 'success');
}

// ──────────────────────────────────────────────────────────────────────
// HELPER FUNCTIONS
// ──────────────────────────────────────────────────────────────────────

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

function confirmDialog(message) {
    return new Promise((resolve) => {
        const modalId = `confirm-modal-${Date.now()}`;
        const html = `
            <div class="modal-overlay" id="${modalId}">
                <div class="modal modal-sm">
                    <div class="modal-header"><h3>⚠️ Confirm</h3><button class="modal-close" onclick="window.closeModal('${modalId}')">✕</button></div>
                    <div class="modal-body"><p>${esc(message)}</p></div>
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

async function ensureStateLoaded() {
    if (!state.classes || !state.classes.length) {
        const fn = window.loadInitialData || (async () => {});
        await fn(false);
    }
}

async function refreshTable(table) {
    const getAll = window.getAll || (async () => []);
    if (table === 'assessments') {
        state.assessments = await getAll('assessments');
    }
}

// Export functions to window
window._filterLockAssessments = filterLockAssessments;
window._refreshLockList = refreshLockList;
window._openBulkLockModal = openBulkLockModal;
window._saveAutoLockSettings = saveAutoLockSettings;
window._toggleAssessmentLock = toggleAssessmentLock;
window._loadLockAssessments = loadLockAssessments;
window._executeBulkLock = window._executeBulkLock || function () { };