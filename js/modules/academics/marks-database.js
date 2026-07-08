/**
 * ECOLE LA FONTAINE — Marks Database Module
 * Browse, search, filter, and edit all marks records
 * Last updated: 2026-07-03
 * 
 * CHANGES:
 * - Added academic year detection from sidebar state
 * - Uses selected year from state.filters.academic_year_id
 * - Year filter in the UI
 * - All data filtered by selected academic year
 * - Year indicator in the header
 * - Read-only mode for inactive years
 */



const ensureStateLoaded = window.ensureStateLoaded || (async () => { }); // global from boot.js
import {
    state,
    getClassById,
    getSubjectById,
    getStudentById,
    getTermById,
    getCurrentUser,
    getCurrentAcademicYear,
    getActiveAcademicYearId,
    getTermsByYear,
    getYearData
} from '../../core/state.js';
import { esc, fmtDate, fmtPct, fmtDateTime } from '../../core/utils.js';
import { getGrade, getGradeClass } from '../../core/formulas.js';
import { update, remove, getAll, insert } from '../../core/api.js';
import { notifyAction } from '../../core/notifications.js';
import { exportToExcel } from '../../core/utils.js';
import { ensureStateLoaded } from '../../core/boot.js';

// ──────────────────────────────────────────────────────────────────────
// STATE
// ──────────────────────────────────────────────────────────────────────

let currentFilter = {
    classId: '',
    subjectId: '',
    assessmentId: '',
    studentId: '',
    termId: '',
    yearId: null,
};

let selectedYearId = null;

// ──────────────────────────────────────────────────────────────────────
// MAIN RENDER FUNCTION
// ──────────────────────────────────────────────────────────────────────

export async function renderMarksDatabase(container) {
    if (!container) return;

    const user = getCurrentUser();
    if (user?.role === 'accountant') {
        container.innerHTML = '<div class="alert alert-danger">Access denied. Accountant cannot access marks.</div>';
        return;
    }

    await ensureStateLoaded();

    // Get selected year from state (set by sidebar)
    selectedYearId = state.filters?.academic_year_id || state.currentAcadYear?.id;
    const selectedYear = (state.academicYears || []).find(y => y.id === selectedYearId);
    const isActiveYear = selectedYear?.is_active === true;
    const years = (state.academicYears || []).sort((a, b) => b.id - a.id);

    let availableClasses = (state.classes || []).filter(c => c.is_active !== false);

    if (user?.role === 'teacher') {
        const assignments = await getAll('teacher_assignments', { teacher_id: user.id });
        const classIds = [...new Set(assignments.map(a => a.class_id))];
        availableClasses = availableClasses.filter(c => classIds.includes(c.id));
        if (availableClasses.length === 0) {
            container.innerHTML = `<div class="alert alert-warning">You have not been assigned to any classes.</div>`;
            return;
        }
    }

    const classes = availableClasses;
    const subjects = (state.subjects || []).filter(s => s.is_active !== false);
    const terms = getTermsByYear(selectedYearId);

    container.innerHTML = `
        <div class="dash-card">
            <div class="dash-card-header" style="flex-wrap:wrap;gap:8px;">
                <span class="dash-card-title">🗄️ Marks Database</span>
                <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;">
                    <select id="db-year-filter" onchange="window._onYearChange()" style="padding:6px 12px;border-radius:var(--r-md);border:1px solid var(--border-medium);font-size:0.8rem;">
                        ${years.map(y => `
                            <option value="${y.id}" ${y.id === selectedYearId ? 'selected' : ''}>
                                ${esc(y.name)} ${y.id === state.currentAcadYear?.id ? '🟢' : ''}
                            </option>
                        `).join('')}
                    </select>
                    <span class="badge ${isActiveYear ? 'badge-success' : 'badge-neutral'}" style="font-size:0.6rem;">
                        ${isActiveYear ? '🟢 Editable' : '🔒 Read-only'}
                    </span>
                    <button class="btn btn-sm btn-outline" onclick="window._refreshMarksData()">🔄 Refresh</button>
                    <button class="btn btn-sm btn-outline" onclick="window._exportAllMarks()">📤 Export All</button>
                </div>
            </div>
            <div class="dash-card-body">
                <div style="padding:4px 12px;background:var(--bg-tertiary);border-radius:var(--r-sm);margin-bottom:12px;font-size:0.75rem;color:var(--text-muted);display:flex;justify-content:space-between;flex-wrap:wrap;">
                    <span>📅 ${esc(selectedYear?.name || 'Current Year')}</span>
                    <span>${isActiveYear ? '✅ Editable' : '🔒 Read-only (inactive year)'}</span>
                </div>

                <div class="filters-bar" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px;margin-bottom:16px;">
                    <div class="form-group" style="margin:0;">
                        <label style="font-size:0.7rem;">Class</label>
                        <select id="db-class" onchange="window._loadDatabaseSubjects()" style="padding:6px 10px;border-radius:6px;border:1px solid var(--border-medium);width:100%;">
                            <option value="">All Classes</option>
                            ${classes.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}
                        </select>
                    </div>
                    <div class="form-group" style="margin:0;">
                        <label style="font-size:0.7rem;">Subject</label>
                        <select id="db-subject" onchange="window._loadDatabaseAssessments()" style="padding:6px 10px;border-radius:6px;border:1px solid var(--border-medium);width:100%;">
                            <option value="">All Subjects</option>
                            ${subjects.map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join('')}
                        </select>
                    </div>
                    <div class="form-group" style="margin:0;">
                        <label style="font-size:0.7rem;">Assessment</label>
                        <select id="db-assessment" onchange="window._loadMarksData()" style="padding:6px 10px;border-radius:6px;border:1px solid var(--border-medium);width:100%;">
                            <option value="">All Assessments</option>
                        </select>
                    </div>
                    <div class="form-group" style="margin:0;">
                        <label style="font-size:0.7rem;">Term</label>
                        <select id="db-term" onchange="window._loadMarksData()" style="padding:6px 10px;border-radius:6px;border:1px solid var(--border-medium);width:100%;">
                            <option value="">All Terms</option>
                            ${terms.map(t => `<option value="${t.id}" ${t.id === state.currentTerm?.id ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}
                        </select>
                    </div>
                    <div class="form-group" style="margin:0;">
                        <label style="font-size:0.7rem;">Student</label>
                        <input type="text" id="db-student" placeholder="Search student..." style="padding:6px 10px;border-radius:6px;border:1px solid var(--border-medium);width:100%;" oninput="window._loadMarksData()">
                    </div>
                    <div style="display:flex;align-items:flex-end;gap:8px;">
                        <button class="btn btn-primary" onclick="window._loadMarksData()" style="padding:6px 16px;">🔍 Search</button>
                        <button class="btn btn-outline" onclick="window._resetMarksFilters()" style="padding:6px 16px;">↻ Reset</button>
                    </div>
                </div>
                <div id="marks-database-content">
                    <div class="alert alert-info" style="text-align:center;padding:40px;">👆 Select filters and click Search to view marks</div>
                </div>
            </div>
        </div>
    `;

    window._loadDatabaseSubjects = loadDatabaseSubjects;
    window._loadDatabaseAssessments = loadDatabaseAssessments;
    window._loadMarksData = loadMarksData;
    window._refreshMarksData = refreshMarksData;
    window._exportAllMarks = exportAllMarks;
    window._resetMarksFilters = resetMarksFilters;
    window._editMark = editMark;
    window._lockAssessment = lockAssessment;
    window._onYearChange = onYearChange;

    // Load initial data
    await loadMarksData();
}

// ──────────────────────────────────────────────────────────────────────
// ON YEAR CHANGE
// ──────────────────────────────────────────────────────────────────────

async function onYearChange() {
    const yearId = document.getElementById('db-year-filter')?.value;
    if (yearId) {
        selectedYearId = parseInt(yearId);
        state.filters.academic_year_id = selectedYearId;

        // Update term dropdown for the new year
        const terms = getTermsByYear(selectedYearId);
        const termSelect = document.getElementById('db-term');
        if (termSelect) {
            const currentValue = termSelect.value;
            termSelect.innerHTML = '<option value="">All Terms</option>' +
                terms.map(t => `<option value="${t.id}" ${t.id === state.currentTerm?.id ? 'selected' : ''}>${esc(t.name)}</option>`).join('');
            if (terms.some(t => t.id == currentValue)) {
                termSelect.value = currentValue;
            }
        }

        await loadMarksData();
    }
}

// ──────────────────────────────────────────────────────────────────────
// LOAD DATABASE SUBJECTS
// ──────────────────────────────────────────────────────────────────────

async function loadDatabaseSubjects() {
    const classId = document.getElementById('db-class')?.value;
    const subjectSel = document.getElementById('db-subject');
    if (!subjectSel) return;

    let subjects = (state.subjects || []).filter(s => s.is_active !== false);

    if (classId) {
        const cls = getClassById(classId);
        subjects = subjects.filter(s => s.level === cls?.level);
    }

    subjectSel.innerHTML = '<option value="">All Subjects</option>' +
        subjects.map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join('');

    await loadDatabaseAssessments();
}

// ──────────────────────────────────────────────────────────────────────
// LOAD DATABASE ASSESSMENTS
// ──────────────────────────────────────────────────────────────────────

async function loadDatabaseAssessments() {
    const classId = document.getElementById('db-class')?.value;
    const subjectId = document.getElementById('db-subject')?.value;
    const termId = document.getElementById('db-term')?.value;
    const assSel = document.getElementById('db-assessment');
    if (!assSel) return;

    let assessments = (state.assessments || [])
        .filter(a => a.academic_year_id == selectedYearId);

    if (classId) assessments = assessments.filter(a => a.class_id == classId);
    if (subjectId) assessments = assessments.filter(a => a.subject_id == subjectId);
    if (termId) assessments = assessments.filter(a => a.term_id == termId);

    assessments.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    assSel.innerHTML = '<option value="">All Assessments</option>' +
        assessments.map(a => {
            const cls = getClassById(a.class_id);
            const sub = getSubjectById(a.subject_id);
            return `<option value="${a.id}">${esc(a.assessment_name)} (${esc(cls?.name || '?')} · ${esc(sub?.name || '?')})</option>`;
        }).join('');
}

// ──────────────────────────────────────────────────────────────────────
// LOAD MARKS DATA
// ──────────────────────────────────────────────────────────────────────

async function loadMarksData() {
    const container = document.getElementById('marks-database-content');
    if (!container) return;

    const classId = document.getElementById('db-class')?.value;
    const subjectId = document.getElementById('db-subject')?.value;
    const assessmentId = document.getElementById('db-assessment')?.value;
    const termId = document.getElementById('db-term')?.value;
    const studentSearch = document.getElementById('db-student')?.value?.toLowerCase() || '';

    container.innerHTML = '<div class="loading-container"><div class="spinner"></div><p>Loading marks...</p></div>';

    // Get assessments for the selected year
    let assessments = (state.assessments || [])
        .filter(a => a.academic_year_id == selectedYearId);

    if (classId) assessments = assessments.filter(a => a.class_id == classId);
    if (subjectId) assessments = assessments.filter(a => a.subject_id == subjectId);
    if (assessmentId) assessments = assessments.filter(a => a.id == assessmentId);
    if (termId) assessments = assessments.filter(a => a.term_id == termId);

    if (!assessments.length) {
        container.innerHTML = '<div class="alert alert-info">No assessments found for the selected filters in this academic year.</div>';
        return;
    }

    const assessmentIds = assessments.map(a => a.id);
    let marks = (state.marks || [])
        .filter(m => assessmentIds.includes(m.assessment_id) && m.academic_year_id == selectedYearId && !m.is_archived);

    // Get students for the selected year
    let students = (state.students || [])
        .filter(s => s.status === 'Active' && s.academic_year_id == selectedYearId);

    if (classId) students = students.filter(s => s.class_id == classId);
    if (studentSearch) {
        students = students.filter(s =>
            (s.first_name || '').toLowerCase().includes(studentSearch) ||
            (s.last_name || '').toLowerCase().includes(studentSearch) ||
            (s.student_code || '').toLowerCase().includes(studentSearch)
        );
    }

    if (!students.length && !marks.length) {
        container.innerHTML = '<div class="alert alert-info">No students or marks found for the selected filters.</div>';
        return;
    }

    // Build marks map
    const marksMap = new Map();
    for (const mark of marks) {
        const key = `${mark.assessment_id}-${mark.student_id}`;
        marksMap.set(key, mark);
    }

    // Build table
    const isEditable = selectedYearId ? (state.academicYears || []).find(y => y.id === selectedYearId)?.is_active === true : true;

    let tableHtml = `
        <div class="table-wrapper">
            <table class="data-table" style="font-size:0.8rem;">
                <thead>
                    <tr>
                        <th>Student</th>
                        <th>Class</th>
                        <th>Subject</th>
                        <th>Assessment</th>
                        <th style="text-align:right;">Score</th>
                        <th style="text-align:right;">Max</th>
                        <th style="text-align:center;">%</th>
                        <th style="text-align:center;">Grade</th>
                        <th>Date</th>
                        <th>Status</th>
                        <th style="text-align:center;">Actions</th>
                    </tr>
                </thead>
                <tbody>
    `;

    for (const assessment of assessments) {
        const cls = getClassById(assessment.class_id);
        const sub = getSubjectById(assessment.subject_id);
        const term = getTermById(assessment.term_id);
        const isLocked = assessment.is_locked;

        for (const student of students) {
            const key = `${assessment.id}-${student.id}`;
            const mark = marksMap.get(key);

            const score = mark?.score ?? '—';
            const max = assessment.max_marks || '—';
            const pct = mark ? (mark.score / assessment.max_marks) * 100 : null;
            const grade = pct !== null ? getGrade(pct) : '—';
            const gradeClass = pct !== null ? getGradeClass(pct) : '';

            const statusClass = mark ? (isLocked ? 'badge-info' : 'badge-success') : 'badge-neutral';
            const statusText = mark ? (isLocked ? '🔒 Locked' : '✅ Entered') : '⏳ Pending';

            tableHtml += `
                <tr>
                    <td><strong>${esc(student.first_name)} ${esc(student.last_name)}</strong><br><small style="color:var(--text-muted);">${esc(student.student_code || '')}</small></td>
                    <td>${esc(cls?.name || '—')}</td>
                    <td>${esc(sub?.name || '—')}</td>
                    <td>${esc(assessment.assessment_name)}<br><small style="color:var(--text-muted);">${esc(assessment.assessment_type)}</small></td>
                    <td style="text-align:right;font-weight:600;">${score}</td>
                    <td style="text-align:right;">${max}</td>
                    <td style="text-align:center;">${pct !== null ? pct.toFixed(1) + '%' : '—'}</td>
                    <td style="text-align:center;"><span class="badge ${gradeClass}">${grade}</span></td>
                    <td style="font-size:0.7rem;">${fmtDate(assessment.date || assessment.created_at)}</td>
                    <td><span class="badge ${statusClass}">${statusText}</span></td>
                    <td style="text-align:center;">
                        ${isEditable && !isLocked ? `<button class="btn btn-sm btn-outline" onclick="window._editMark(${assessment.id}, ${student.id})" style="padding:2px 6px;font-size:0.7rem;">✏️</button>` : ''}
                        ${isEditable && !isLocked ? `<button class="btn btn-sm btn-outline" onclick="window._deleteMark(${assessment.id}, ${student.id})" style="padding:2px 6px;font-size:0.7rem;color:var(--danger);">🗑️</button>` : ''}
                        ${isLocked ? `<span style="font-size:0.7rem;color:var(--text-muted);">🔒</span>` : ''}
                    </td>
                </tr>
            `;
        }
    }

    tableHtml += `
                </tbody>
            </table>
        </div>
        <div style="margin-top:12px;font-size:0.8rem;color:var(--text-muted);display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px;">
            <span>Showing ${students.length} students × ${assessments.length} assessments</span>
            <span>
                ${!isEditable ? '🔒 Read-only (inactive year)' : ''}
                ${assessmentId && isEditable ? `<button class="btn btn-sm btn-outline" onclick="window._lockAssessment(${assessmentId})" style="padding:2px 10px;font-size:0.7rem;">🔒 Lock Assessment</button>` : ''}
            </span>
        </div>
    `;

    container.innerHTML = tableHtml;
}

// ──────────────────────────────────────────────────────────────────────
// EDIT MARK
// ──────────────────────────────────────────────────────────────────────

async function editMark(assessmentId, studentId) {
    const assessment = state.assessments.find(a => a.id === assessmentId);
    const student = getStudentById(studentId);
    if (!assessment || !student) return;

    const isEditable = selectedYearId ? (state.academicYears || []).find(y => y.id === selectedYearId)?.is_active === true : true;

    if (!isEditable) {
        showToast('Cannot edit marks in an inactive year', 'warning');
        return;
    }

    if (assessment.is_locked) {
        showToast('🔒 Assessment is locked', 'warning');
        return;
    }

    const key = `${assessmentId}-${studentId}`;
    const marksMap = new Map();
    (state.marks || []).forEach(m => {
        marksMap.set(`${m.assessment_id}-${m.student_id}`, m);
    });
    const existing = marksMap.get(key);
    const currentScore = existing?.score ?? '';

    const modalHtml = `
        <div class="modal-overlay" id="edit-mark-modal">
            <div class="modal" style="max-width:400px;">
                <div class="modal-header">
                    <h3>✏️ Edit Mark</h3>
                    <span style="font-size:0.7rem;color:var(--text-muted);">📅 ${(state.academicYears || []).find(y => y.id === selectedYearId)?.name || 'Current Year'}</span>
                    <button class="modal-close" onclick="window.closeModal('edit-mark-modal')">✕</button>
                </div>
                <div class="modal-body">
                    <div style="margin-bottom:12px;">
                        <div style="font-size:0.8rem;color:var(--text-muted);">Student</div>
                        <div style="font-weight:600;">${esc(student.first_name)} ${esc(student.last_name)}</div>
                    </div>
                    <div style="margin-bottom:12px;">
                        <div style="font-size:0.8rem;color:var(--text-muted);">Assessment</div>
                        <div style="font-weight:600;">${esc(assessment.assessment_name)} (${assessment.max_marks} max)</div>
                    </div>
                    <div class="form-group">
                        <label>Score</label>
                        <input type="number" id="edit-score" value="${currentScore}" min="0" max="${assessment.max_marks}" step="0.5" style="padding:8px 12px;border-radius:6px;border:1px solid var(--border-medium);width:100%;">
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-outline" onclick="window.closeModal('edit-mark-modal')">Cancel</button>
                    <button class="btn btn-primary" onclick="window._saveEditedMark(${assessmentId}, ${studentId})">💾 Save</button>
                </div>
            </div>
        </div>
    `;

    showModal(modalHtml);
}

// ──────────────────────────────────────────────────────────────────────
// SAVE EDITED MARK
// ──────────────────────────────────────────────────────────────────────

window._saveEditedMark = async function (assessmentId, studentId) {
    const score = parseFloat(document.getElementById('edit-score')?.value);
    if (isNaN(score) || score < 0) {
        showToast('Please enter a valid score', 'warning');
        return;
    }

    const assessment = state.assessments.find(a => a.id === assessmentId);
    if (!assessment) {
        showToast('Assessment not found', 'error');
        return;
    }

    if (score > assessment.max_marks) {
        showToast(`Score exceeds max (${assessment.max_marks})`, 'warning');
        return;
    }

    const key = `${assessmentId}-${studentId}`;
    const marksMap = new Map();
    (state.marks || []).forEach(m => {
        marksMap.set(`${m.assessment_id}-${m.student_id}`, m);
    });
    const existing = marksMap.get(key);

    const user = getCurrentUser();
    let result;

    const payload = {
        score: score,
        academic_year_id: selectedYearId,
        updated_at: new Date().toISOString(),
    };

    if (existing) {
        result = await update('marks', existing.id, payload);
        if (result) {
            existing.score = score;
            showToast('✅ Mark updated', 'success');
        }
    } else {
        payload.assessment_id = assessmentId;
        payload.student_id = studentId;
        payload.entered_by = user?.id;
        payload.entered_at = new Date().toISOString();
        result = await insert('marks', payload);
        if (result) {
            state.marks.push(result);
            showToast('✅ Mark created', 'success');
        }
    }

    if (result) {
        await notifyAction('marks_edited', {
            message: `Mark edited for ${esc(assessment.assessment_name)} in ${(state.academicYears || []).find(y => y.id === selectedYearId)?.name || 'Current Year'}`,
            entity_type: 'marks',
            entity_id: assessmentId,
        }, ['admin', 'teacher']);
        closeModal('edit-mark-modal');
        await loadMarksData();
    } else {
        showToast('Failed to save mark', 'error');
    }
};

// ──────────────────────────────────────────────────────────────────────
// DELETE MARK
// ──────────────────────────────────────────────────────────────────────

window._deleteMark = async function (assessmentId, studentId) {
    const isEditable = selectedYearId ? (state.academicYears || []).find(y => y.id === selectedYearId)?.is_active === true : true;

    if (!isEditable) {
        showToast('Cannot delete marks in an inactive year', 'warning');
        return;
    }

    if (!await confirmDialog('Delete this mark? This cannot be undone.')) return;

    const key = `${assessmentId}-${studentId}`;
    const marksMap = new Map();
    (state.marks || []).forEach(m => {
        marksMap.set(`${m.assessment_id}-${m.student_id}`, m);
    });
    const existing = marksMap.get(key);

    if (!existing) {
        showToast('Mark not found', 'error');
        return;
    }

    const result = await remove('marks', existing.id);
    if (result) {
        const idx = state.marks.findIndex(m => m.id === existing.id);
        if (idx !== -1) state.marks.splice(idx, 1);
        showToast('✅ Mark deleted', 'success');
        await notifyAction('marks_edited', {
            message: 'Mark deleted',
            entity_type: 'marks',
            entity_id: assessmentId,
        }, ['admin']);
        await loadMarksData();
    } else {
        showToast('Failed to delete mark', 'error');
    }
};

// ──────────────────────────────────────────────────────────────────────
// LOCK ASSESSMENT
// ──────────────────────────────────────────────────────────────────────

window._lockAssessment = async function (assessmentId) {
    const isEditable = selectedYearId ? (state.academicYears || []).find(y => y.id === selectedYearId)?.is_active === true : true;

    if (!isEditable) {
        showToast('Cannot lock assessments in an inactive year', 'warning');
        return;
    }

    const assessment = state.assessments.find(a => a.id === assessmentId);
    if (!assessment) return;

    const newState = !assessment.is_locked;
    if (!await confirmDialog(`${newState ? 'Lock' : 'Unlock'} this assessment?`)) return;

    const result = await update('assessments', assessmentId, {
        is_locked: newState,
        updated_at: new Date().toISOString(),
    });

    if (result) {
        assessment.is_locked = newState;
        showToast(`✅ Assessment ${newState ? 'locked' : 'unlocked'}`, 'success');
        await notifyAction('assessment_locked', {
            message: `Assessment ${assessment.assessment_name} ${newState ? 'locked' : 'unlocked'} in ${(state.academicYears || []).find(y => y.id === selectedYearId)?.name || 'Current Year'}`,
            entity_type: 'assessments',
            entity_id: assessmentId,
        }, ['admin', 'teacher']);
        await loadMarksData();
    } else {
        showToast('Failed to update assessment', 'error');
    }
};

// ──────────────────────────────────────────────────────────────────────
// REFRESH MARKS DATA
// ──────────────────────────────────────────────────────────────────────

async function refreshMarksData() {
    await refreshTable('assessments');
    await refreshTable('marks');
    await loadMarksData();
    showToast('🔄 Data refreshed', 'info', 1500);
}

// ──────────────────────────────────────────────────────────────────────
// EXPORT ALL MARKS
// ──────────────────────────────────────────────────────────────────────

function exportAllMarks() {
    const container = document.getElementById('marks-database-content');
    const table = container?.querySelector('table');
    if (!table) {
        showToast('No data to export', 'warning');
        return;
    }

    const selectedYear = (state.academicYears || []).find(y => y.id === selectedYearId);
    const filename = `Marks_Export${selectedYear ? '_' + selectedYear.name : ''}_${new Date().toISOString().split('T')[0]}`;

    const ws = XLSX.utils.table_to_sheet(table);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Marks');
    XLSX.writeFile(wb, `${filename}.xlsx`);
    showToast('✅ Marks exported', 'success');
}

// ──────────────────────────────────────────────────────────────────────
// RESET FILTERS
// ──────────────────────────────────────────────────────────────────────

function resetMarksFilters() {
    ['db-class', 'db-subject', 'db-assessment', 'db-term', 'db-student'].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            if (el.tagName === 'SELECT') el.value = '';
            else el.value = '';
        }
    });
    loadMarksData();
}