/**
 * ECOLE LA FONTAINE — Assessments Module
 * Manage assessments: create, edit, lock, delete, filter — with academic year support
 * Last updated: 2026-07-03
 * 
 * CHANGES:
 * - Added academic year filtering (uses selected year from sidebar)
 * - Assessments are year-specific
 * - Create assessment uses selected academic year
 * - View assessment shows year context
 * - Export includes academic year
 */

import {
    state,
    getClassById,
    getSubjectById,
    getTermById,
    getCurrentUser,
    getCurrentAcademicYear,
    getActiveAcademicYearId,
    getYearData
} from '../../core/state.js';
import { esc, fmtDate, fmtAgo } from '../../core/utils.js';
import { getCurrentPhase, getGrade, getGradeClass } from '../../core/formulas.js';
import { insert, update, remove, getAll, get } from '../../core/api.js';
import { notifyAction } from '../../core/notifications.js';

// ──────────────────────────────────────────────────────────────────────
// STATE
// ──────────────────────────────────────────────────────────────────────

let selectedYearId = null;

// ──────────────────────────────────────────────────────────────────────
// MAIN RENDER FUNCTION
// ──────────────────────────────────────────────────────────────────────

export async function renderAssessments(container) {
    if (!container) return;

    const user = getCurrentUser();
    const isAdmin = user?.role === 'admin';
    const isTeacher = user?.role === 'teacher';
    const isAccountant = user?.role === 'accountant';

    if (isAccountant) {
        container.innerHTML = '<div class="alert alert-danger">Access denied. Accountant cannot access assessments.</div>';
        return;
    }

    await ensureStateLoaded();

    // Get selected year from state (set by sidebar)
    selectedYearId = state.filters?.academic_year_id || state.currentAcadYear?.id;
    const selectedYear = (state.academicYears || []).find(y => y.id === selectedYearId);
    const isActiveYear = selectedYear?.is_active === true;
    const years = (state.academicYears || []).sort((a, b) => b.id - a.id);

    const currentTerm = state.currentTerm;
    const today = new Date();

    // Get assessments for selected year
    let allAssessments = (state.assessments || [])
        .filter(a => a.academic_year_id === selectedYearId);

    // Filter by teacher
    let teacherAssignments = [];
    let teacherClassIds = [];
    if (isTeacher) {
        teacherAssignments = await getAll('teacher_assignments', { teacher_id: user.id });
        teacherClassIds = [...new Set(teacherAssignments.map(a => a.class_id))];
        allAssessments = allAssessments.filter(a => teacherClassIds.includes(a.class_id));
    }

    // Categorize
    const upcoming = allAssessments.filter(a => {
        if (a.is_locked) return false;
        if (!a.due_date) return false;
        return new Date(a.due_date) >= today;
    }).sort((a, b) => new Date(a.due_date) - new Date(b.due_date));

    const completed = allAssessments.filter(a => {
        if (a.is_locked) return false;
        if (!a.due_date) return false;
        return new Date(a.due_date) < today;
    }).sort((a, b) => new Date(b.date || b.created_at) - new Date(a.date || a.created_at));

    const locked = allAssessments.filter(a => a.is_locked === true)
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    // Helper functions
    function getDaysLeft(dueDate) {
        if (!dueDate) return null;
        const days = Math.ceil((new Date(dueDate) - today) / (1000 * 60 * 60 * 24));
        if (days < 0) return null;
        if (days === 0) return 'Today';
        if (days === 1) return 'Tomorrow';
        return `${days} days`;
    }

    function getAssessmentAverage(assessmentId) {
        const marks = (state.marks || []).filter(m => m.assessment_id === assessmentId && m.academic_year_id === selectedYearId);
        if (!marks.length) return null;
        const assessment = state.assessments.find(a => a.id === assessmentId);
        if (!assessment) return null;
        const totalPct = marks.reduce((sum, m) => sum + ((m.score / assessment.max_marks) * 100), 0);
        return totalPct / marks.length;
    }

    function canTeacherEdit(assessment) {
        if (!isTeacher) return false;
        return teacherAssignments.some(a => a.class_id === assessment.class_id && a.subject_id === assessment.subject_id);
    }

    // Build HTML
    const yearLabel = selectedYear?.name || 'All Years';
    const isActive = isActiveYear;

    container.innerHTML = `
        <div class="dash-card">
            <div class="dash-card-header" style="flex-wrap:wrap;gap:8px;">
                <span class="dash-card-title">📝 ASSESSMENTS</span>
                <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
                    <select id="assess-year-filter" onchange="window._loadAssessmentsByYear()" style="padding:4px 10px;border-radius:6px;border:1px solid var(--border-medium);font-size:0.75rem;">
                        ${years.map(y => `
                            <option value="${y.id}" ${y.id === selectedYearId ? 'selected' : ''}>
                                ${esc(y.name)} ${y.id === state.currentAcadYear?.id ? '🟢' : ''}
                            </option>
                        `).join('')}
                    </select>
                    <span class="badge ${isActive ? 'badge-success' : 'badge-neutral'}" style="font-size:0.6rem;">
                        ${isActive ? '🟢 Editable' : '🔒 Read-only'}
                    </span>
                    <button class="btn btn-sm btn-outline" onclick="window._refreshAssessments()">🔄 Refresh</button>
                    ${isAdmin && isActive ? `<button class="btn btn-sm btn-primary" onclick="window._openCreateAssessment()">➕ Create</button>` : ''}
                    <button class="btn btn-sm btn-outline" onclick="window._exportAssessments()">📥 Export</button>
                </div>
            </div>
            <div class="dash-card-body" style="padding:0;">
                <div style="padding:6px 16px;background:var(--bg-tertiary);border-bottom:1px solid var(--border-light);font-size:0.7rem;color:var(--text-muted);">
                    📅 ${esc(yearLabel)} · ${allAssessments.length} assessments total
                    ${!isActive ? ' · 🔒 Read-only (inactive year)' : ''}
                </div>

                <!-- UPCOMING -->
                <div style="padding:12px 16px;border-bottom:1px solid var(--border-light);">
                    <h4 style="margin-bottom:8px;font-size:0.9rem;">📋 UPCOMING (${upcoming.length})</h4>
                    ${upcoming.length ? `
                        <div class="table-wrapper">
                            <table class="data-table" style="font-size:0.78rem;">
                                <thead>
                                    <tr>
                                        <th>Assessment</th>
                                        <th>Class</th>
                                        <th>Subject</th>
                                        <th>Due</th>
                                        <th>Status</th>
                                        <th>Action</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${upcoming.map(a => {
        const cls = getClassById(a.class_id);
        const sub = getSubjectById(a.subject_id);
        const daysLeft = getDaysLeft(a.due_date);
        const statusClass = daysLeft === 'Today' || daysLeft === 'Tomorrow' ? 'badge-warning' : 'badge-info';
        const statusText = daysLeft ? (daysLeft === 'Today' ? '⚠️ Due Today' : daysLeft === 'Tomorrow' ? '⚠️ Due Tomorrow' : `Due in ${daysLeft}`) : 'No due date';
        const canEdit = (isAdmin || (isTeacher && canTeacherEdit(a))) && isActive;
        return `
                                            <tr>
                                                <td><strong>${esc(a.assessment_name)}</strong><br><small>${esc(a.assessment_type)}</small></td>
                                                <td>${esc(cls?.name || '—')}</td>
                                                <td>${esc(sub?.name || '—')}</td>
                                                <td>${fmtDate(a.due_date)}</td>
                                                <td><span class="badge ${statusClass}">${statusText}</span></td>
                                                <td>
                                                    <button class="btn btn-sm btn-outline" onclick="window._viewAssessment(${a.id})" style="padding:2px 8px;font-size:0.7rem;">👁️</button>
                                                    ${canEdit ? `<button class="btn btn-sm btn-outline" onclick="window._editAssessment(${a.id})" style="padding:2px 8px;font-size:0.7rem;">✏️</button>` : ''}
                                                </td>
                                            </tr>
                                        `;
    }).join('')}
                                </tbody>
                            </table>
                        </div>
                    ` : '<div style="text-align:center;padding:16px;color:var(--text-muted);">No upcoming assessments</div>'}
                </div>

                <!-- COMPLETED -->
                <div style="padding:12px 16px;border-bottom:1px solid var(--border-light);">
                    <h4 style="margin-bottom:8px;font-size:0.9rem;">📋 COMPLETED (${completed.length})</h4>
                    ${completed.length ? `
                        <div class="table-wrapper">
                            <table class="data-table" style="font-size:0.78rem;">
                                <thead>
                                    <tr>
                                        <th>Assessment</th>
                                        <th>Class</th>
                                        <th>Subject</th>
                                        <th>Date</th>
                                        <th>Avg %</th>
                                        <th>Action</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${completed.map(a => {
        const cls = getClassById(a.class_id);
        const sub = getSubjectById(a.subject_id);
        const avg = getAssessmentAverage(a.id);
        const canEdit = (isAdmin || (isTeacher && canTeacherEdit(a))) && isActive;
        return `
                                            <tr>
                                                <td><strong>${esc(a.assessment_name)}</strong><br><small>${esc(a.assessment_type)}</small></td>
                                                <td>${esc(cls?.name || '—')}</td>
                                                <td>${esc(sub?.name || '—')}</td>
                                                <td>${fmtDate(a.date || a.created_at)}</td>
                                                <td>${avg !== null ? `<span class="badge ${getGradeClass(avg)}">${avg.toFixed(1)}%</span>` : '<span class="badge badge-neutral">—</span>'}</td>
                                                <td>
                                                    <button class="btn btn-sm btn-outline" onclick="window._viewAssessment(${a.id})" style="padding:2px 8px;font-size:0.7rem;">👁️</button>
                                                    ${canEdit && !a.is_locked ? `<button class="btn btn-sm btn-warning" onclick="window._lockAssessment(${a.id})" style="padding:2px 8px;font-size:0.7rem;">🔒</button>` : ''}
                                                </td>
                                            </tr>
                                        `;
    }).join('')}
                                </tbody>
                            </table>
                        </div>
                    ` : '<div style="text-align:center;padding:16px;color:var(--text-muted);">No completed assessments</div>'}
                </div>

                <!-- LOCKED -->
                <div style="padding:12px 16px;">
                    <h4 style="margin-bottom:8px;font-size:0.9rem;">📋 LOCKED (${locked.length})</h4>
                    ${locked.length ? `
                        <div class="table-wrapper">
                            <table class="data-table" style="font-size:0.78rem;">
                                <thead>
                                    <tr>
                                        <th>Assessment</th>
                                        <th>Class</th>
                                        <th>Subject</th>
                                        <th>Term</th>
                                        <th>Avg %</th>
                                        <th>Action</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${locked.map(a => {
        const cls = getClassById(a.class_id);
        const sub = getSubjectById(a.subject_id);
        const term = getTermById(a.term_id);
        const avg = getAssessmentAverage(a.id);
        const canUnlock = isAdmin && isActive;
        return `
                                            <tr>
                                                <td><strong>${esc(a.assessment_name)}</strong><br><small>${esc(a.assessment_type)}</small></td>
                                                <td>${esc(cls?.name || '—')}</td>
                                                <td>${esc(sub?.name || '—')}</td>
                                                <td>${esc(term?.name || '—')}</td>
                                                <td>${avg !== null ? `<span class="badge ${getGradeClass(avg)}">${avg.toFixed(1)}%</span>` : '<span class="badge badge-neutral">—</span>'}</td>
                                                <td>
                                                    <button class="btn btn-sm btn-outline" onclick="window._viewAssessment(${a.id})" style="padding:2px 8px;font-size:0.7rem;">👁️</button>
                                                    ${canUnlock ? `<button class="btn btn-sm btn-outline" onclick="window._unlockAssessment(${a.id})" style="padding:2px 8px;font-size:0.7rem;">🔓</button>` : ''}
                                                </td>
                                            </tr>
                                        `;
    }).join('')}
                                </tbody>
                            </table>
                        </div>
                    ` : '<div style="text-align:center;padding:16px;color:var(--text-muted);">No locked assessments</div>'}
                </div>
            </div>
        </div>
    `;

    window._refreshAssessments = refreshAssessments;
    window._openCreateAssessment = openCreateAssessment;
    window._viewAssessment = viewAssessment;
    window._editAssessment = editAssessment;
    window._lockAssessment = lockAssessment;
    window._unlockAssessment = unlockAssessment;
    window._exportAssessments = exportAssessments;
    window._loadAssessmentsByYear = loadAssessmentsByYear;
}

// ──────────────────────────────────────────────────────────────────────
// LOAD ASSESSMENTS BY YEAR
// ──────────────────────────────────────────────────────────────────────

async function loadAssessmentsByYear() {
    const yearId = document.getElementById('assess-year-filter')?.value;
    if (yearId) {
        selectedYearId = parseInt(yearId);
        // Update state filter
        state.filters.academic_year_id = selectedYearId;
        renderAssessments(document.getElementById('dynamic-content'));
    }
}

// ──────────────────────────────────────────────────────────────────────
// REFRESH ASSESSMENTS
// ──────────────────────────────────────────────────────────────────────

async function refreshAssessments() {
    await refreshTable('assessments');
    await refreshTable('marks');
    renderAssessments(document.getElementById('dynamic-content'));
    showToast('🔄 Refreshed', 'info', 1000);
}

// ──────────────────────────────────────────────────────────────────────
// OPEN CREATE ASSESSMENT
// ──────────────────────────────────────────────────────────────────────

function openCreateAssessment() {
    const classes = (state.classes || []).filter(c => c.is_active !== false);
    const subjects = (state.subjects || []).filter(s => s.is_active !== false);
    const terms = (state.terms || []).filter(t => t.academic_year_id === selectedYearId);
    const phase = getCurrentPhase();
    const selectedYear = (state.academicYears || []).find(y => y.id === selectedYearId);
    const isActive = selectedYear?.is_active === true;

    if (!isActive) {
        showToast('Cannot create assessments in an inactive year', 'warning');
        return;
    }

    const modalHtml = `
        <div class="modal-overlay" id="create-assessment-modal">
            <div class="modal" style="max-width:500px;">
                <div class="modal-header">
                    <h3>➕ Create Assessment</h3>
                    <span style="font-size:0.7rem;color:var(--text-muted);">📅 ${esc(selectedYear?.name || 'Current Year')}</span>
                    <button class="modal-close" onclick="window.closeModal('create-assessment-modal')">✕</button>
                </div>
                <div class="modal-body">
                    <div class="form-grid">
                        <div class="form-group">
                            <label>Class *</label>
                            <select id="new-assess-class" style="padding:8px 12px;border-radius:6px;border:1px solid var(--border-medium);width:100%;">
                                ${classes.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}
                            </select>
                        </div>
                        <div class="form-group">
                            <label>Subject *</label>
                            <select id="new-assess-subject" style="padding:8px 12px;border-radius:6px;border:1px solid var(--border-medium);width:100%;">
                                ${subjects.map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join('')}
                            </select>
                        </div>
                        <div class="form-group">
                            <label>Term *</label>
                            <select id="new-assess-term" style="padding:8px 12px;border-radius:6px;border:1px solid var(--border-medium);width:100%;">
                                ${terms.map(t => `<option value="${t.id}" ${t.id === state.currentTerm?.id ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}
                            </select>
                        </div>
                        <div class="form-group">
                            <label>Type *</label>
                            <select id="new-assess-type" style="padding:8px 12px;border-radius:6px;border:1px solid var(--border-medium);width:100%;">
                                <option value="Quiz">Quiz</option>
                                <option value="Assignment">Assignment</option>
                                <option value="Mid-term">Mid-term</option>
                                <option value="Exam">Exam</option>
                                <option value="Final Exam">Final Exam</option>
                            </select>
                        </div>
                        <div class="form-group" style="grid-column:1/-1;">
                            <label>Assessment Name</label>
                            <input type="text" id="new-assess-name" placeholder="e.g., Quiz 4" style="padding:8px 12px;border-radius:6px;border:1px solid var(--border-medium);width:100%;">
                        </div>
                        <div class="form-group">
                            <label>Max Marks *</label>
                            <input type="number" id="new-assess-max" value="50" min="1" max="200" style="padding:8px 12px;border-radius:6px;border:1px solid var(--border-medium);width:100%;">
                        </div>
                        <div class="form-group">
                            <label>Due Date</label>
                            <input type="date" id="new-assess-due" style="padding:8px 12px;border-radius:6px;border:1px solid var(--border-medium);width:100%;">
                        </div>
                        <div style="grid-column:1/-1;padding:8px 12px;background:var(--bg-tertiary);border-radius:6px;font-size:0.75rem;color:var(--text-muted);">
                            📅 Assessment will be created for ${esc(selectedYear?.name || 'Current Year')}
                        </div>
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-outline" onclick="window.closeModal('create-assessment-modal')">Cancel</button>
                    <button class="btn btn-primary" onclick="window._createAssessment()">💾 Create</button>
                </div>
            </div>
        </div>
    `;

    showModal(modalHtml);
}

// ──────────────────────────────────────────────────────────────────────
// CREATE ASSESSMENT
// ──────────────────────────────────────────────────────────────────────

window._createAssessment = async function () {
    const classId = parseInt(document.getElementById('new-assess-class')?.value);
    const subjectId = parseInt(document.getElementById('new-assess-subject')?.value);
    const termId = parseInt(document.getElementById('new-assess-term')?.value);
    const type = document.getElementById('new-assess-type')?.value;
    const name = document.getElementById('new-assess-name')?.value.trim();
    const max = parseInt(document.getElementById('new-assess-max')?.value);
    const due = document.getElementById('new-assess-due')?.value;

    if (!classId || !subjectId || !termId || !max) {
        showToast('Please fill all required fields', 'warning');
        return;
    }

    const assessmentName = name || `${type} - ${getSubjectById(subjectId)?.name || 'Subject'}`;

    // Use selected year for the assessment
    const yearId = selectedYearId || state.currentAcadYear?.id;

    const result = await insert('assessments', {
        class_id: classId,
        subject_id: subjectId,
        term_id: termId,
        academic_year_id: yearId,
        assessment_type: type,
        assessment_name: assessmentName,
        max_marks: max,
        due_date: due || null,
        is_locked: false,
        created_by: getCurrentUser()?.id,
        created_at: new Date().toISOString(),
    });

    if (result) {
        state.assessments.push(result);
        closeModal('create-assessment-modal');
        showToast('✅ Assessment created', 'success');
        await notifyAction('assessment_created', {
            message: `Assessment "${assessmentName}" created for ${(state.academicYears || []).find(y => y.id === yearId)?.name || 'Current Year'}`,
            entity_type: 'assessments',
            entity_id: result.id,
        }, ['admin']);
        renderAssessments(document.getElementById('dynamic-content'));
    } else {
        showToast('Failed to create assessment', 'error');
    }
};

// ──────────────────────────────────────────────────────────────────────
// VIEW ASSESSMENT
// ──────────────────────────────────────────────────────────────────────

window._viewAssessment = function (assessmentId) {
    const a = state.assessments.find(x => x.id === assessmentId);
    if (!a) return;

    const cls = getClassById(a.class_id);
    const sub = getSubjectById(a.subject_id);
    const term = getTermById(a.term_id);
    const year = (state.academicYears || []).find(y => y.id === a.academic_year_id);
    const marks = (state.marks || []).filter(m => m.assessment_id === assessmentId);
    const scores = marks.map(m => m.score);
    const avg = scores.length ? scores.reduce((s, v) => s + v, 0) / scores.length : null;
    const pass = scores.length ? scores.filter(s => (s / a.max_marks) * 100 >= 50).length : 0;

    const modalHtml = `
        <div class="modal-overlay" id="view-assessment-modal">
            <div class="modal" style="max-width:500px;">
                <div class="modal-header">
                    <h3>📋 Assessment Details</h3>
                    <span style="font-size:0.7rem;color:var(--text-muted);">📅 ${esc(year?.name || '—')}</span>
                    <button class="modal-close" onclick="window.closeModal('view-assessment-modal')">✕</button>
                </div>
                <div class="modal-body">
                    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:0.85rem;">
                        <div><strong style="color:var(--text-muted);font-size:0.7rem;text-transform:uppercase;">Name</strong><br>${esc(a.assessment_name)}</div>
                        <div><strong style="color:var(--text-muted);font-size:0.7rem;text-transform:uppercase;">Type</strong><br>${esc(a.assessment_type)}</div>
                        <div><strong style="color:var(--text-muted);font-size:0.7rem;text-transform:uppercase;">Class</strong><br>${esc(cls?.name || '—')}</div>
                        <div><strong style="color:var(--text-muted);font-size:0.7rem;text-transform:uppercase;">Subject</strong><br>${esc(sub?.name || '—')}</div>
                        <div><strong style="color:var(--text-muted);font-size:0.7rem;text-transform:uppercase;">Term</strong><br>${esc(term?.name || '—')}</div>
                        <div><strong style="color:var(--text-muted);font-size:0.7rem;text-transform:uppercase;">Academic Year</strong><br>${esc(year?.name || '—')}</div>
                        <div><strong style="color:var(--text-muted);font-size:0.7rem;text-transform:uppercase;">Max Marks</strong><br>${a.max_marks}</div>
                        <div><strong style="color:var(--text-muted);font-size:0.7rem;text-transform:uppercase;">Due Date</strong><br>${fmtDate(a.due_date)}</div>
                        <div><strong style="color:var(--text-muted);font-size:0.7rem;text-transform:uppercase;">Status</strong><br><span class="badge ${a.is_locked ? 'badge-danger' : 'badge-success'}">${a.is_locked ? '🔒 Locked' : '✅ Open'}</span></div>
                        <div><strong style="color:var(--text-muted);font-size:0.7rem;text-transform:uppercase;">Marks Entered</strong><br>${marks.length}</div>
                        <div><strong style="color:var(--text-muted);font-size:0.7rem;text-transform:uppercase;">Average Score</strong><br>${avg !== null ? avg.toFixed(1) : '—'}</div>
                        <div style="grid-column:1/-1;"><strong style="color:var(--text-muted);font-size:0.7rem;text-transform:uppercase;">Pass Rate</strong><br>${scores.length ? ((pass / scores.length) * 100).toFixed(1) + '%' : '—'}</div>
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-outline" onclick="window.closeModal('view-assessment-modal')">Close</button>
                    ${!a.is_locked ? `<button class="btn btn-primary" onclick="window.closeModal('view-assessment-modal'); window.navigateToWithData('marks-entry', { assessment_id: ${a.id} })">✏️ Enter Marks</button>` : ''}
                </div>
            </div>
        </div>
    `;

    showModal(modalHtml);
};

// ──────────────────────────────────────────────────────────────────────
// EDIT ASSESSMENT
// ──────────────────────────────────────────────────────────────────────

window._editAssessment = function (assessmentId) {
    const a = state.assessments.find(x => x.id === assessmentId);
    if (!a) return;

    if (a.is_locked && !isAdmin()) {
        showToast('🔒 Assessment is locked', 'warning');
        return;
    }

    const selectedYear = (state.academicYears || []).find(y => y.id === selectedYearId);
    const isActive = selectedYear?.is_active === true;

    if (!isActive && !isAdmin()) {
        showToast('🔒 Cannot edit assessments in an inactive year', 'warning');
        return;
    }

    const modalHtml = `
        <div class="modal-overlay" id="edit-assessment-modal">
            <div class="modal" style="max-width:450px;">
                <div class="modal-header">
                    <h3>✏️ Edit Assessment</h3>
                    <span style="font-size:0.7rem;color:var(--text-muted);">📅 ${esc(selectedYear?.name || 'Current Year')}</span>
                    <button class="modal-close" onclick="window.closeModal('edit-assessment-modal')">✕</button>
                </div>
                <div class="modal-body">
                    <div class="form-grid">
                        <div class="form-group" style="grid-column:1/-1;">
                            <label>Assessment Name *</label>
                            <input type="text" id="edit-assess-name" value="${esc(a.assessment_name)}" style="padding:8px 12px;border-radius:6px;border:1px solid var(--border-medium);width:100%;">
                        </div>
                        <div class="form-group">
                            <label>Max Marks *</label>
                            <input type="number" id="edit-assess-max" value="${a.max_marks}" min="1" max="200" style="padding:8px 12px;border-radius:6px;border:1px solid var(--border-medium);width:100%;">
                        </div>
                        <div class="form-group">
                            <label>Due Date</label>
                            <input type="date" id="edit-assess-due" value="${a.due_date || ''}" style="padding:8px 12px;border-radius:6px;border:1px solid var(--border-medium);width:100%;">
                        </div>
                        <div class="form-group" style="grid-column:1/-1;">
                            <label>Type</label>
                            <select id="edit-assess-type" style="padding:8px 12px;border-radius:6px;border:1px solid var(--border-medium);width:100%;">
                                <option value="Quiz" ${a.assessment_type === 'Quiz' ? 'selected' : ''}>Quiz</option>
                                <option value="Assignment" ${a.assessment_type === 'Assignment' ? 'selected' : ''}>Assignment</option>
                                <option value="Mid-term" ${a.assessment_type === 'Mid-term' ? 'selected' : ''}>Mid-term</option>
                                <option value="Exam" ${a.assessment_type === 'Exam' ? 'selected' : ''}>Exam</option>
                                <option value="Final Exam" ${a.assessment_type === 'Final Exam' ? 'selected' : ''}>Final Exam</option>
                            </select>
                        </div>
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-outline" onclick="window.closeModal('edit-assessment-modal')">Cancel</button>
                    <button class="btn btn-primary" onclick="window._saveEditAssessment(${a.id})">💾 Save</button>
                </div>
            </div>
        </div>
    `;

    showModal(modalHtml);
};

// ──────────────────────────────────────────────────────────────────────
// SAVE EDIT ASSESSMENT
// ──────────────────────────────────────────────────────────────────────

window._saveEditAssessment = async function (assessmentId) {
    const name = document.getElementById('edit-assess-name')?.value.trim();
    const max = parseInt(document.getElementById('edit-assess-max')?.value);
    const due = document.getElementById('edit-assess-due')?.value;
    const type = document.getElementById('edit-assess-type')?.value;

    if (!name || !max) {
        showToast('Name and max marks required', 'warning');
        return;
    }

    const result = await update('assessments', assessmentId, {
        assessment_name: name,
        max_marks: max,
        due_date: due || null,
        assessment_type: type,
        updated_at: new Date().toISOString(),
    });

    if (result) {
        const a = state.assessments.find(x => x.id === assessmentId);
        if (a) { a.assessment_name = name; a.max_marks = max; a.due_date = due || null; a.assessment_type = type; }
        closeModal('edit-assessment-modal');
        showToast('✅ Assessment updated', 'success');
        renderAssessments(document.getElementById('dynamic-content'));
    } else {
        showToast('Failed to update assessment', 'error');
    }
};

// ──────────────────────────────────────────────────────────────────────
// LOCK / UNLOCK ASSESSMENT
// ──────────────────────────────────────────────────────────────────────

window._lockAssessment = async function (assessmentId) {
    const selectedYear = (state.academicYears || []).find(y => y.id === selectedYearId);
    if (!selectedYear?.is_active) {
        showToast('Cannot lock assessments in an inactive year', 'warning');
        return;
    }

    if (!await confirmDialog('Lock this assessment? Marks will become read-only.')) return;

    const result = await update('assessments', assessmentId, {
        is_locked: true,
        updated_at: new Date().toISOString(),
    });

    if (result) {
        const a = state.assessments.find(x => x.id === assessmentId);
        if (a) a.is_locked = true;
        showToast('🔒 Assessment locked', 'success');
        await notifyAction('assessment_locked', {
            message: `Assessment locked in ${selectedYear?.name || 'Current Year'}`,
            entity_type: 'assessments',
            entity_id: assessmentId,
        }, ['admin', 'teacher']);
        renderAssessments(document.getElementById('dynamic-content'));
    } else {
        showToast('Failed to lock assessment', 'error');
    }
};

window._unlockAssessment = async function (assessmentId) {
    if (!await confirmDialog('Unlock this assessment? Marks will become editable.')) return;

    const result = await update('assessments', assessmentId, {
        is_locked: false,
        updated_at: new Date().toISOString(),
    });

    if (result) {
        const a = state.assessments.find(x => x.id === assessmentId);
        if (a) a.is_locked = false;
        showToast('🔓 Assessment unlocked', 'success');
        renderAssessments(document.getElementById('dynamic-content'));
    } else {
        showToast('Failed to unlock assessment', 'error');
    }
};

// ──────────────────────────────────────────────────────────────────────
// EXPORT ASSESSMENTS
// ──────────────────────────────────────────────────────────────────────

function exportAssessments() {
    const year = (state.academicYears || []).find(y => y.id === selectedYearId);
    const data = (state.assessments || [])
        .filter(a => a.academic_year_id === selectedYearId)
        .map(a => {
            const cls = getClassById(a.class_id);
            const sub = getSubjectById(a.subject_id);
            const term = getTermById(a.term_id);
            const marks = (state.marks || []).filter(m => m.assessment_id === a.id);
            const avg = marks.length ? marks.reduce((s, m) => s + m.score, 0) / marks.length : null;
            return {
                'Assessment': a.assessment_name,
                'Type': a.assessment_type,
                'Class': cls?.name || '—',
                'Subject': sub?.name || '—',
                'Term': term?.name || '—',
                'Academic Year': year?.name || '—',
                'Max Marks': a.max_marks,
                'Due Date': fmtDate(a.due_date),
                'Marks Entered': marks.length,
                'Average Score': avg !== null ? avg.toFixed(1) : '—',
                'Locked': a.is_locked ? 'Yes' : 'No',
                'Created': fmtDate(a.created_at),
            };
        });

    const filename = `Assessments${year ? '_' + year.name : ''}_${new Date().toISOString().split('T')[0]}`;
    exportToExcel(data, filename);
    showToast('✅ Assessments exported', 'success');
}