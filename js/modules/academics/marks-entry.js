/**
 * ECOLE LA FONTAINE — Marks Entry Module
 * Complete marks entry with validation, offline support, and bulk actions
 * Last updated: 2026-07-03
 * 
 * CHANGES:
 * - Added academic year validation (only active year can edit)
 * - Added term validation (only current/active term can edit)
 * - Cannot enter marks for completed terms
 * - Cannot enter marks for future terms
 * - Read-only mode for inactive years/terms
 * - Year/term indicator in UI
 */



const ensureStateLoaded = window.ensureStateLoaded || (async () => {}); // global from boot.js
import {
    state,
    getCurrentUser,
    getClassById,
    getSubjectById,
    getTermById,
    getCurrentAcademicYear,
    getActiveAcademicYearId,
    getTermsByYear,
    getTermStatus,
    isCurrentYearEditable
} from '../../core/state.js';
import { esc, fmtDate, fmtPct } from '../../core/utils.js';
import { getGrade, getGradeClass, getCurrentPhase } from '../../core/formulas.js';
import { insert, update, getAll, get } from '../../core/api.js';
import { notifyAction } from '../../core/notifications.js';
import { saveMarksOffline, syncOfflineMarks } from '../../core/offline.js';
import { ensureStateLoaded } from '../../core/boot.js';

// ──────────────────────────────────────────────────────────────────────
// STATE
// ──────────────────────────────────────────────────────────────────────

let currentAssessmentId = null;
let currentClassId = null;
let currentSubjectId = null;
let marksData = [];
let validationErrors = [];
let selectedYearId = null;
let selectedTermId = null;

// ──────────────────────────────────────────────────────────────────────
// MAIN RENDER FUNCTION
// ──────────────────────────────────────────────────────────────────────

export async function renderMarksEntry(container) {
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
    const isYearActive = selectedYear?.is_active === true;

    // Get terms for selected year
    const terms = getTermsByYear(selectedYearId);
    const today = new Date().toISOString().split('T')[0];
    const currentTerm = state.currentTerm;

    // Find active term (the one we're currently in)
    let activeTerm = null;
    let isTermActive = false;
    let termStatus = '';

    for (const term of terms) {
        if (term.start_date && term.end_date) {
            if (today >= term.start_date && today <= term.end_date) {
                activeTerm = term;
                isTermActive = true;
                termStatus = 'active';
                break;
            }
        }
    }

    // If no active term found, check if year is completed
    const lastTerm = terms[terms.length - 1];
    if (!isTermActive && lastTerm?.end_date && today > lastTerm.end_date) {
        termStatus = 'completed';
        isTermActive = false;
        activeTerm = lastTerm;
    } else if (!isTermActive && terms[0]?.start_date && today < terms[0].start_date) {
        termStatus = 'future';
        isTermActive = false;
        activeTerm = terms[0];
    } else if (!isTermActive && terms.length > 0) {
        activeTerm = terms[0];
        isTermActive = false;
        termStatus = 'unknown';
    }

    // Determine if marks can be edited
    const canEdit = isYearActive && isTermActive;
    const readOnlyReason = !canEdit
        ? (!isYearActive ? 'Year is inactive' : 'Term is not active')
        : '';

    let availClasses = (state.classes || []).filter(c => c.is_active !== false);

    if (user?.role === 'teacher') {
        const assignments = await getAll('teacher_assignments', { teacher_id: user.id });
        const classIds = [...new Set(assignments.map(a => a.class_id))];
        availClasses = availClasses.filter(c => classIds.includes(c.id));
        if (availClasses.length === 0) {
            container.innerHTML = `<div class="alert alert-warning">You have not been assigned to any classes.</div>`;
            return;
        }
    }

    // Get pre-selected assessment from nav data
    const navData = window.getNavData?.('marks-entry') || {};
    const preSelectedAssessment = navData.assessment_id || null;

    const phase = getCurrentPhase(activeTerm || currentTerm);
    const yearLabel = selectedYear?.name || 'Current Year';
    const termLabel = activeTerm?.name || 'No Active Term';

    container.innerHTML = `
        <div class="dash-card">
            <div class="dash-card-header">
                <span class="dash-card-title">✏️ MARKS ENTRY</span>
                <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
                    <span style="padding:3px 10px;border-radius:20px;font-size:.75rem;font-weight:700;${phase === 'pre_midterm' ? 'background:#dbeafe;color:#1e40af' : 'background:#d1fae5;color:#065f46'}">
                        ${phase === 'pre_midterm' ? '📋 PRE-MIDTERM' : '📝 POST-MIDTERM'}
                    </span>
                    <span style="font-size:.75rem;color:var(--text-muted);">${esc(termLabel)} · ${esc(yearLabel)}</span>
                    ${canEdit ? '<span class="badge badge-success">🟢 Editable</span>' : `<span class="badge badge-danger">🔒 ${esc(readOnlyReason)}</span>`}
                    <button class="btn btn-sm btn-outline" onclick="window._showExistingAssessments()">📋 Existing</button>
                    <button class="btn btn-sm btn-outline" onclick="window._refreshMarksView()">🔄 Refresh</button>
                </div>
            </div>
            <div class="dash-card-body">
                ${!canEdit ? `
                    <div class="alert alert-warning" style="font-size:0.85rem;margin-bottom:12px;">
                        ⚠️ ${readOnlyReason}. Marks are read-only. 
                        ${!isYearActive ? 'Switch to an active year to enter marks.' : 'Wait for the term to start.'}
                    </div>
                ` : ''}
                <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:12px;align-items:end;">
                    <div class="form-group" style="margin:0;">
                        <label>Class *</label>
                        <select id="me-class" onchange="window._loadSubjectsAndStudents()" ${!canEdit ? 'disabled' : ''}>
                            <option value="">— Select —</option>
                            ${availClasses.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}
                        </select>
                    </div>
                    <div class="form-group" style="margin:0;">
                        <label>Subject *</label>
                        <select id="me-subject" onchange="window._updateMaxFromSubject()" ${!canEdit ? 'disabled' : ''}>
                            <option value="">— Select class first —</option>
                        </select>
                    </div>
                    <div class="form-group" style="margin:0;">
                        <label>Assessment Type *</label>
                        <select id="me-type" onchange="window._updateMaxFromSubject()" ${!canEdit ? 'disabled' : ''}>
                            <option value="Quiz">Quiz</option>
                            <option value="Assignment">Assignment</option>
                            <option value="Mid-term">Mid-term</option>
                            ${phase === 'post_midterm' ? `
                                <option value="Exam">Exam</option>
                                <option value="Final Exam">Final Exam</option>
                            ` : `
                                <option value="Exam" disabled style="color:var(--text-muted);">Exam (post-midterm only)</option>
                            `}
                        </select>
                    </div>
                    <div class="form-group" style="margin:0;">
                        <label>Assessment Name</label>
                        <input type="text" id="me-name" placeholder="e.g. Quiz 3" value="" ${!canEdit ? 'disabled' : ''}>
                    </div>
                    <div class="form-group" style="margin:0;">
                        <label>Max Marks</label>
                        <input type="number" id="me-max" value="50" min="1" max="200" ${!canEdit ? 'disabled' : ''}>
                    </div>
                    <div class="form-group" style="margin:0;">
                        <label>Date</label>
                        <input type="date" id="me-date" value="${new Date().toISOString().split('T')[0]}" ${!canEdit ? 'disabled' : ''}>
                    </div>
                </div>
                <div style="margin-top:12px;display:flex;align-items:center;gap:16px;flex-wrap:wrap;">
                    <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:.85rem;">
                        <input type="checkbox" id="me-lock-after" ${!canEdit ? 'disabled' : ''}> Lock after saving
                    </label>
                    <button class="btn btn-primary" onclick="window._loadStudentsTable()" ${!canEdit ? 'disabled' : ''}>📋 Load Students</button>
                    <button class="btn btn-sm btn-outline" onclick="window._showAssessmentSelector()" ${!canEdit ? 'disabled' : ''}>📋 Select Existing</button>
                </div>
                <div id="existing-assessments" style="margin-top:8px;font-size:0.8rem;"></div>
                <div style="margin-top:8px;padding:6px 12px;background:var(--bg-tertiary);border-radius:6px;font-size:0.7rem;color:var(--text-muted);">
                    📅 ${esc(yearLabel)} · ${esc(termLabel)} 
                    ${canEdit ? '· ✅ Editing allowed' : '· 🔒 Read-only'}
                    ${activeTerm?.start_date ? `· ${fmtDate(activeTerm.start_date)} → ${fmtDate(activeTerm.end_date)}` : ''}
                </div>
            </div>
        </div>

        <div class="dash-card" id="me-table-card" style="display:none;">
            <div class="dash-card-header">
                <span class="dash-card-title" id="me-table-title">📝 Student Marks</span>
                <span id="me-summary" style="font-size:.82rem;color:var(--text-muted);"></span>
                ${!canEdit ? '<span class="badge badge-danger">🔒 Read-only</span>' : ''}
            </div>
            <div class="dash-card-body" style="padding:0;">
                <div class="table-wrapper">
                    <table class="data-table">
                        <thead>
                            <tr>
                                <th style="width:40px;text-align:center;">#</th>
                                <th>Student Name</th>
                                <th style="width:120px;text-align:center;">Score</th>
                                <th style="width:60px;text-align:center;">/ Max</th>
                                <th style="width:100px;text-align:center;">% Grade</th>
                                <th style="width:80px;text-align:center;">Status</th>
                            </tr>
                        </thead>
                        <tbody id="me-tbody"></tbody>
                    </table>
                </div>
                <div id="me-pagination" class="pagination" style="padding:12px;border-top:1px solid var(--border-light);"></div>
                <div id="me-offline-notice" style="display:none;padding:10px 16px;background:var(--warning-bg);border-top:1px solid var(--border-light);font-size:.85rem;color:var(--warning);">
                    📴 Offline — marks will sync when connection restores.
                </div>
            </div>
            <div style="position:sticky;bottom:0;z-index:10;padding:12px 16px;border-top:1px solid var(--border-light);background:var(--bg-primary);display:flex;gap:10px;flex-wrap:wrap;align-items:center;box-shadow:0 -2px 8px rgba(0,0,0,.08);">
                <button class="btn btn-success" id="me-save-btn" onclick="window._saveMarks()" ${!canEdit ? 'disabled' : ''}>💾 Save to DB</button>
                <button class="btn btn-outline" onclick="window._clearMarksTable()" ${!canEdit ? 'disabled' : ''}>🗑️ Clear</button>
                <button class="btn btn-outline" onclick="window._exportMarksExcel()">📥 Export</button>
                <button class="btn btn-outline" onclick="window._markAllPresent()" ${!canEdit ? 'disabled' : ''}>✅ All Present</button>
                <span id="me-status-label" style="margin-left:auto;font-size:.82rem;color:var(--text-muted);"></span>
            </div>
        </div>
    `;

    // ── Register global functions ──
    window._loadSubjectsAndStudents = loadSubjectsAndStudents;
    window._loadStudentsTable = loadStudentsTable;
    window._updateMaxFromSubject = updateMaxFromSubject;
    window._saveMarks = saveMarks;
    window._clearMarksTable = clearMarksTable;
    window._exportMarksExcel = exportMarksExcel;
    window._markAllPresent = markAllPresent;
    window._showExistingAssessments = showExistingAssessments;
    window._showAssessmentSelector = showAssessmentSelector;
    window._refreshMarksView = refreshMarksView;

    // ── If pre-selected, load it ──
    if (preSelectedAssessment) {
        const assessment = state.assessments.find(a => a.id === preSelectedAssessment);
        if (assessment) {
            setTimeout(() => {
                document.getElementById('me-class').value = assessment.class_id;
                loadSubjectsAndStudents();
                setTimeout(() => {
                    document.getElementById('me-subject').value = assessment.subject_id;
                    updateMaxFromSubject();
                    document.getElementById('me-type').value = assessment.assessment_type;
                    document.getElementById('me-name').value = assessment.assessment_name;
                    document.getElementById('me-max').value = assessment.max_marks;
                    document.getElementById('me-date').value = assessment.date || assessment.created_at?.split('T')[0] || '';
                    loadStudentsTable();
                }, 200);
            }, 300);
        }
    }
}

// ──────────────────────────────────────────────────────────────────────
// CHECK IF MARKS CAN BE EDITED
// ──────────────────────────────────────────────────────────────────────

function canEditMarks() {
    const selectedYear = (state.academicYears || []).find(y => y.id === selectedYearId);
    if (!selectedYear?.is_active) return false;

    // Check if selected year has an active term
    const terms = getTermsByYear(selectedYearId);
    const today = new Date().toISOString().split('T')[0];

    for (const term of terms) {
        if (term.start_date && term.end_date) {
            if (today >= term.start_date && today <= term.end_date) {
                return true;
            }
        }
    }

    return false;
}

// ──────────────────────────────────────────────────────────────────────
// GET ACTIVE TERM FOR SELECTED YEAR
// ──────────────────────────────────────────────────────────────────────

function getActiveTermForYear(yearId) {
    const terms = getTermsByYear(yearId);
    const today = new Date().toISOString().split('T')[0];

    for (const term of terms) {
        if (term.start_date && term.end_date) {
            if (today >= term.start_date && today <= term.end_date) {
                return term;
            }
        }
    }

    // If no active term, return the last term (or first)
    return terms[terms.length - 1] || terms[0] || null;
}

// ──────────────────────────────────────────────────────────────────────
// LOAD SUBJECTS AND STUDENTS
// ──────────────────────────────────────────────────────────────────────

async function loadSubjectsAndStudents() {
    const classId = document.getElementById('me-class')?.value;
    const subjectSel = document.getElementById('me-subject');
    if (!classId || !subjectSel) return;

    const cls = getClassById(classId);
    const subjects = (state.subjects || [])
        .filter(s => s.level === cls?.level && s.is_active !== false)
        .sort((a, b) => (a.sort_order || 99) - (b.sort_order || 99));

    subjectSel.innerHTML = '<option value="">— Select Subject —</option>' +
        subjects.map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join('');

    // Auto-select first subject
    if (subjects.length === 1) {
        subjectSel.value = subjects[0].id;
        updateMaxFromSubject();
    }
}

// ──────────────────────────────────────────────────────────────────────
// UPDATE MAX FROM SUBJECT
// ──────────────────────────────────────────────────────────────────────

function updateMaxFromSubject() {
    const subjectId = document.getElementById('me-subject')?.value;
    const maxInput = document.getElementById('me-max');
    if (!subjectId || !maxInput) return;

    const subject = getSubjectById(subjectId);
    if (subject) {
        const total = (subject.mg_max || 50) + (subject.ex_max || 50);
        maxInput.value = total;
    }
}

// ──────────────────────────────────────────────────────────────────────
// LOAD STUDENTS TABLE
// ──────────────────────────────────────────────────────────────────────

async function loadStudentsTable() {
    const classId = document.getElementById('me-class')?.value;
    const subjectId = document.getElementById('me-subject')?.value;
    const type = document.getElementById('me-type')?.value;
    const name = document.getElementById('me-name')?.value.trim();
    const max = parseInt(document.getElementById('me-max')?.value) || 50;
    const date = document.getElementById('me-date')?.value;

    const tbody = document.getElementById('me-tbody');
    const tableCard = document.getElementById('me-table-card');
    const summary = document.getElementById('me-summary');

    if (!classId || !subjectId || !name) {
        if (tbody) tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:20px;">Select class, subject, and enter assessment name</td></tr>';
        if (tableCard) tableCard.style.display = 'none';
        return;
    }

    // Check if editing is allowed
    const canEdit = canEditMarks();

    // Find or create assessment
    const termId = state.currentTerm?.id;
    let assessment = (state.assessments || []).find(a =>
        a.class_id == classId &&
        a.subject_id == subjectId &&
        a.assessment_name === name &&
        a.term_id === termId &&
        a.academic_year_id === selectedYearId
    );

    if (!assessment && canEdit) {
        // Create assessment
        const newAssessment = await insert('assessments', {
            class_id: parseInt(classId),
            subject_id: parseInt(subjectId),
            term_id: termId,
            academic_year_id: selectedYearId || state.currentAcadYear?.id,
            assessment_type: type,
            assessment_name: name,
            max_marks: max,
            date: date || new Date().toISOString().split('T')[0],
            is_locked: false,
            created_by: getCurrentUser()?.id,
            created_at: new Date().toISOString(),
        });
        if (newAssessment) {
            state.assessments.push(newAssessment);
            assessment = newAssessment;
        }
    }

    if (!assessment) {
        if (!canEdit) {
            showToast('🔒 Cannot create assessment in inactive year/term', 'warning');
        } else {
            showToast('Failed to create assessment', 'error');
        }
        return;
    }

    currentAssessmentId = assessment.id;
    currentClassId = classId;
    currentSubjectId = subjectId;

    // Get students
    const students = (state.students || [])
        .filter(s => s.class_id == classId && s.status === 'Active')
        .sort((a, b) => a.last_name.localeCompare(b.last_name));

    if (!students.length) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:20px;">No active students in this class</td></tr>';
        tableCard.style.display = 'block';
        return;
    }

    // Get existing marks
    const existingMarks = (state.marks || [])
        .filter(m => m.assessment_id === assessment.id);

    const marksMap = new Map(existingMarks.map(m => [m.student_id, m]));

    // Build table rows
    let rows = students.map((student, idx) => {
        const mark = marksMap.get(student.id);
        const score = mark?.score ?? '';
        const pct = mark && assessment.max_marks > 0 ? (mark.score / assessment.max_marks) * 100 : null;
        const gradeCell = pct !== null && pct !== undefined && pct !== ''
            ? `<span class="badge ${getGradeClass(pct)}">${pct.toFixed(1)}% — ${getGrade(pct)}</span>`
            : '<span class="badge badge-neutral">—</span>';

        const status = mark ? '✅ Entered' : '⏳ Pending';

        return `
            <tr data-student-id="${student.id}">
                <td style="text-align:center;">${idx + 1}</td>
                <td><strong>${esc(student.first_name)} ${esc(student.last_name)}</strong><br><small style="color:var(--text-muted);">${esc(student.student_code || '')}</small></td>
                <td style="text-align:center;">
                    <input type="number" class="mark-input form-control"
                        style="width:80px;text-align:center;padding:4px 6px;border-radius:4px;border:1px solid var(--border-medium);${!canEdit ? 'background:var(--bg-disabled);cursor:not-allowed;' : ''}"
                        data-student-id="${student.id}"
                        data-assessment-id="${assessment.id}"
                        data-max="${assessment.max_marks}"
                        value="${score}"
                        min="0" max="${assessment.max_marks}" step="0.5"
                        onchange="window._validateMarkInput(this)"
                        oninput="window._updateMarkGrade(this, ${assessment.max_marks})"
                        ${!canEdit ? 'disabled' : ''}>
                </td>
                <td style="text-align:center;">${assessment.max_marks}</td>
                <td style="text-align:center;" id="grade-cell-${student.id}">${gradeCell}</td>
                <td style="text-align:center;">
                    <span class="badge ${mark ? 'badge-success' : 'badge-neutral'}">${status}</span>
                    ${canEdit ? `<button class="btn btn-sm btn-outline" style="padding:2px 6px;font-size:0.7rem;" onclick="window._toggleAbsent(${student.id})" title="Mark Absent">🚫</button>` : ''}
                </td>
            </tr>
        `;
    });

    tbody.innerHTML = rows.join('');
    tableCard.style.display = 'block';
    summary.textContent = `${students.length} students · ${existingMarks.length} marks entered${!canEdit ? ' · 🔒 Read-only' : ''}`;

    // Update pagination
    const pagination = document.getElementById('me-pagination');
    if (pagination) pagination.innerHTML = '';

    // Check offline status
    const offlineNotice = document.getElementById('me-offline-notice');
    if (offlineNotice) {
        offlineNotice.style.display = navigator.onLine ? 'none' : 'block';
    }

    // Update save button state
    const saveBtn = document.getElementById('me-save-btn');
    if (saveBtn) {
        saveBtn.disabled = !canEdit;
        saveBtn.title = !canEdit ? 'Marks are read-only for this year/term' : '';
    }
}

// ──────────────────────────────────────────────────────────────────────
// VALIDATE MARK INPUT
// ──────────────────────────────────────────────────────────────────────

window._validateMarkInput = function (input) {
    if (!canEditMarks()) {
        showToast('🔒 Cannot edit marks in inactive year/term', 'warning');
        input.value = input.dataset.originalValue || '';
        return;
    }

    const value = parseFloat(input.value);
    const max = parseFloat(input.dataset.max) || 100;

    if (input.value === '' || input.value === null || input.value === undefined) {
        return;
    }

    if (isNaN(value) || value < 0) {
        showToast(`❌ Invalid score. Please enter a number between 0 and ${max}.`, 'error');
        input.value = '';
        return;
    }

    if (value > max) {
        showToast(`❌ Score exceeds maximum (${max}).`, 'error');
        input.value = max;
        window._updateMarkGrade(input, max);
        return;
    }

    input.style.borderColor = 'var(--success)';
    setTimeout(() => {
        input.style.borderColor = '';
    }, 1500);

    window._updateMarkGrade(input, max);
};

// ──────────────────────────────────────────────────────────────────────
// UPDATE MARK GRADE (live)
// ──────────────────────────────────────────────────────────────────────

window._updateMarkGrade = function (input, maxMarks) {
    const studentId = input.dataset.studentId;
    const cell = document.getElementById(`grade-cell-${studentId}`);
    if (!cell) return;

    const value = parseFloat(input.value);
    if (isNaN(value) || value < 0) {
        cell.innerHTML = '<span class="badge badge-neutral">—</span>';
        return;
    }

    const pct = (value / maxMarks) * 100;
    cell.innerHTML = `<span class="badge ${getGradeClass(pct)}">${pct.toFixed(1)}% — ${getGrade(pct)}</span>`;

    const row = input.closest('tr');
    if (row) {
        const statusCell = row.querySelector('td:last-child .badge');
        if (statusCell) {
            statusCell.textContent = '✅ Entered';
            statusCell.className = 'badge badge-success';
        }
    }
};

// ──────────────────────────────────────────────────────────────────────
// TOGGLE ABSENT
// ──────────────────────────────────────────────────────────────────────

window._toggleAbsent = function (studentId) {
    if (!canEditMarks()) {
        showToast('🔒 Cannot edit marks in inactive year/term', 'warning');
        return;
    }

    const input = document.querySelector(`.mark-input[data-student-id="${studentId}"]`);
    if (!input) return;

    const max = parseFloat(input.dataset.max) || 100;
    const currentValue = parseFloat(input.value);

    if (isNaN(currentValue) || currentValue < 0) {
        input.value = 0;
        window._updateMarkGrade(input, max);
        showToast('✅ Marked as absent (score set to 0)', 'info', 1500);
    } else if (currentValue === 0) {
        input.value = '';
        input.dispatchEvent(new Event('change'));
        const cell = document.getElementById(`grade-cell-${studentId}`);
        if (cell) cell.innerHTML = '<span class="badge badge-neutral">—</span>';
        showToast('Cleared absence mark', 'info', 1500);
    } else {
        if (confirm(`Set score to 0 for this student?`)) {
            input.value = 0;
            window._updateMarkGrade(input, max);
            showToast('✅ Marked as absent', 'info', 1500);
        }
    }
};

// ──────────────────────────────────────────────────────────────────────
// SAVE MARKS
// ──────────────────────────────────────────────────────────────────────

async function saveMarks() {
    if (!canEditMarks()) {
        showToast('🔒 Cannot save marks in inactive year/term', 'warning');
        return;
    }

    const inputs = [...document.querySelectorAll('.mark-input')];
    if (!inputs.length) {
        showToast('No marks to save', 'warning');
        return;
    }

    const assessmentId = currentAssessmentId;
    if (!assessmentId) {
        showToast('No assessment loaded', 'warning');
        return;
    }

    // Collect marks to save
    const toSave = [];
    let hasErrors = false;

    for (const input of inputs) {
        const studentId = parseInt(input.dataset.studentId);
        const value = input.value.trim();
        const max = parseFloat(input.dataset.max) || 100;

        if (value === '' || value === null || value === undefined) continue;

        const score = parseFloat(value);
        if (isNaN(score) || score < 0) {
            showToast(`Invalid score for student ${studentId}`, 'error');
            hasErrors = true;
            continue;
        }

        if (score > max) {
            showToast(`Score ${score} exceeds max ${max}`, 'error');
            hasErrors = true;
            continue;
        }

        toSave.push({
            student_id: studentId,
            assessment_id: assessmentId,
            score: score,
        });
    }

    if (hasErrors) {
        showToast('Please fix errors before saving', 'error');
        return;
    }

    if (!toSave.length) {
        showToast('No marks to save (all empty)', 'info');
        return;
    }

    // Check term is still active
    if (!canEditMarks()) {
        showToast('🔒 Term is no longer active. Cannot save marks.', 'warning');
        return;
    }

    // Save
    const btn = document.getElementById('me-save-btn');
    if (btn) { btn.disabled = true; btn.innerHTML = '<span class="loader-inline"></span> Saving...'; }

    try {
        let saved = 0, errors = 0;

        if (!navigator.onLine) {
            await saveMarksOffline({
                assessmentId: assessmentId,
                classId: currentClassId,
                subjectId: currentSubjectId,
                marks: toSave,
                assessmentName: document.getElementById('me-name')?.value || 'Assessment',
                assessmentType: document.getElementById('me-type')?.value || 'Quiz',
                maxMarks: parseInt(document.getElementById('me-max')?.value) || 50,
                academicYearId: selectedYearId,
                termId: state.currentTerm?.id,
            });
            showToast(`📴 Saved ${toSave.length} marks offline — will sync when online`, 'warning');
            const notice = document.getElementById('me-offline-notice');
            if (notice) notice.style.display = 'block';
            saved = toSave.length;
        } else {
            for (const mark of toSave) {
                const existing = (state.marks || []).find(m =>
                    m.assessment_id === mark.assessment_id &&
                    m.student_id === mark.student_id
                );

                let result;
                if (existing) {
                    result = await update('marks', existing.id, {
                        score: mark.score,
                        academic_year_id: selectedYearId,
                        term_id: state.currentTerm?.id,
                        updated_at: new Date().toISOString(),
                    });
                } else {
                    result = await insert('marks', {
                        assessment_id: mark.assessment_id,
                        student_id: mark.student_id,
                        score: mark.score,
                        academic_year_id: selectedYearId,
                        term_id: state.currentTerm?.id,
                        entered_by: getCurrentUser()?.id,
                        entered_at: new Date().toISOString(),
                    });
                }

                if (result) saved++; else errors++;
            }

            await refreshTable('marks');

            await notifyAction('marks_import', {
                message: `${saved} marks saved for ${document.getElementById('me-name')?.value || ''} (${(state.academicYears || []).find(y => y.id === selectedYearId)?.name || 'Current Year'})`,
                entity_type: 'marks',
                entity_id: assessmentId,
            }, ['admin']);

            const lockAfter = document.getElementById('me-lock-after')?.checked;
            if (lockAfter) {
                await update('assessments', assessmentId, { is_locked: true });
                const assessment = state.assessments.find(a => a.id === assessmentId);
                if (assessment) assessment.is_locked = true;
                showToast('🔒 Assessment locked', 'info', 1500);
            }
        }

        if (saved > 0) {
            showToast(`✅ ${saved} marks saved${errors > 0 ? ` (${errors} errors)` : ''}`, errors > 0 ? 'warning' : 'success');
            document.getElementById('me-status-label').textContent = `Last saved: ${new Date().toLocaleTimeString()}`;
            await loadStudentsTable();
        } else {
            showToast('No marks were saved', 'warning');
        }
    } catch (error) {
        console.error('[Marks] Save error:', error);
        showToast('Error saving marks: ' + error.message, 'error');
    } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = '💾 Save to DB'; }
    }
}

// ──────────────────────────────────────────────────────────────────────
// CLEAR MARKS TABLE
// ──────────────────────────────────────────────────────────────────────

async function clearMarksTable() {
    if (!canEditMarks()) {
        showToast('🔒 Cannot clear marks in inactive year/term', 'warning');
        return;
    }

    if (!currentAssessmentId) {
        showToast('No assessment loaded', 'warning');
        return;
    }

    if (!await confirmDialog('Clear all marks for this assessment? This cannot be undone.')) return;

    const marksToDelete = (state.marks || []).filter(m => m.assessment_id === currentAssessmentId);
    for (const mark of marksToDelete) {
        await remove('marks', mark.id);
    }

    await refreshTable('marks');
    await loadStudentsTable();
    showToast('✅ Marks cleared for this assessment', 'success');
}

// ──────────────────────────────────────────────────────────────────────
// EXPORT MARKS TO EXCEL
// ──────────────────────────────────────────────────────────────────────

function exportMarksExcel() {
    if (!currentAssessmentId) {
        showToast('No assessment loaded', 'warning');
        return;
    }

    const assessment = state.assessments.find(a => a.id === currentAssessmentId);
    if (!assessment) {
        showToast('Assessment not found', 'error');
        return;
    }

    const students = (state.students || [])
        .filter(s => s.class_id === assessment.class_id && s.status === 'Active')
        .sort((a, b) => a.last_name.localeCompare(b.last_name));

    const marksMap = new Map(
        (state.marks || [])
            .filter(m => m.assessment_id === currentAssessmentId)
            .map(m => [m.student_id, m])
    );

    const year = (state.academicYears || []).find(y => y.id === selectedYearId);
    const data = students.map(s => {
        const mark = marksMap.get(s.id);
        return {
            'Student Code': s.student_code || '',
            'Student Name': `${s.first_name} ${s.last_name}`,
            'Academic Year': year?.name || '',
            'Score': mark?.score ?? '',
            'Max Marks': assessment.max_marks,
            'Percentage': mark ? ((mark.score / assessment.max_marks) * 100).toFixed(1) + '%' : '',
            'Grade': mark ? getGrade((mark.score / assessment.max_marks) * 100) : '',
        };
    });

    const filename = `${assessment.assessment_name.replace(/\s/g, '_')}_${year?.name || 'Current'}_${new Date().toISOString().split('T')[0]}`;
    exportToExcel(data, filename);
    showToast('✅ Marks exported', 'success');
}

// ──────────────────────────────────────────────────────────────────────
// MARK ALL PRESENT
// ──────────────────────────────────────────────────────────────────────

function markAllPresent() {
    if (!canEditMarks()) {
        showToast('🔒 Cannot edit marks in inactive year/term', 'warning');
        return;
    }

    const inputs = document.querySelectorAll('.mark-input');
    const max = parseInt(document.getElementById('me-max')?.value) || 50;

    inputs.forEach(input => {
        if (input.value === '' || input.value === null || input.value === undefined) {
            input.value = max;
            window._updateMarkGrade(input, max);
        }
    });

    showToast(`✅ Filled ${inputs.length} marks with max value`, 'info', 2000);
}

// ──────────────────────────────────────────────────────────────────────
// SHOW EXISTING ASSESSMENTS
// ──────────────────────────────────────────────────────────────────────

async function showExistingAssessments() {
    const classId = document.getElementById('me-class')?.value;
    const subjectId = document.getElementById('me-subject')?.value;
    const container = document.getElementById('existing-assessments');
    if (!container) return;

    if (!classId) {
        container.innerHTML = '<div style="color:var(--text-muted);font-size:0.8rem;">Select a class first</div>';
        return;
    }

    const assessments = (state.assessments || [])
        .filter(a => a.class_id == classId && (!subjectId || a.subject_id == subjectId))
        .filter(a => a.academic_year_id === selectedYearId)
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    if (!assessments.length) {
        container.innerHTML = '<div style="color:var(--text-muted);font-size:0.8rem;">No existing assessments for this year</div>';
        return;
    }

    container.innerHTML = `
        <div style="margin-top:8px;">
            <strong>Existing assessments (${assessments.length}):</strong>
            <div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:4px;">
                ${assessments.map(a => `
                    <button class="btn btn-sm btn-outline" style="padding:2px 10px;font-size:0.7rem;" onclick="window._loadAssessment(${a.id})">
                        ${esc(a.assessment_name)} (${a.assessment_type}) ${a.is_locked ? '🔒' : ''}
                    </button>
                `).join('')}
            </div>
        </div>
    `;
}

// ──────────────────────────────────────────────────────────────────────
// LOAD ASSESSMENT
// ──────────────────────────────────────────────────────────────────────

window._loadAssessment = async function (assessmentId) {
    const assessment = state.assessments.find(a => a.id === assessmentId);
    if (!assessment) return;

    const canEdit = canEditMarks();

    document.getElementById('me-class').value = assessment.class_id;
    await loadSubjectsAndStudents();

    setTimeout(() => {
        document.getElementById('me-subject').value = assessment.subject_id;
        updateMaxFromSubject();
        document.getElementById('me-type').value = assessment.assessment_type;
        document.getElementById('me-name').value = assessment.assessment_name;
        document.getElementById('me-max').value = assessment.max_marks;
        document.getElementById('me-date').value = assessment.date || assessment.created_at?.split('T')[0] || '';

        if (assessment.is_locked || !canEdit) {
            showToast(assessment.is_locked ? '🔒 This assessment is locked — read-only' : '🔒 This year/term is not active — read-only', 'warning');
            document.querySelectorAll('.mark-input').forEach(el => el.disabled = true);
        } else {
            document.querySelectorAll('.mark-input').forEach(el => el.disabled = false);
        }

        loadStudentsTable();
    }, 200);
};

// ──────────────────────────────────────────────────────────────────────
// SHOW ASSESSMENT SELECTOR
// ──────────────────────────────────────────────────────────────────────

function showAssessmentSelector() {
    const classId = document.getElementById('me-class')?.value;
    if (!classId) {
        showToast('Select a class first', 'warning');
        return;
    }

    const assessments = (state.assessments || [])
        .filter(a => a.class_id == classId && a.academic_year_id === selectedYearId)
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    if (!assessments.length) {
        showToast('No assessments found for this class in this year', 'info');
        return;
    }

    const canEdit = canEditMarks();

    const modalHtml = `
        <div class="modal-overlay" id="assessment-selector-modal">
            <div class="modal" style="max-width:500px;">
                <div class="modal-header">
                    <h3>📋 Select Assessment</h3>
                    <span style="font-size:0.7rem;color:var(--text-muted);">${(state.academicYears || []).find(y => y.id === selectedYearId)?.name || 'Current Year'}</span>
                    <button class="modal-close" onclick="window.closeModal('assessment-selector-modal')">✕</button>
                </div>
                <div class="modal-body">
                    <div style="max-height:400px;overflow-y:auto;">
                        ${assessments.map(a => {
        const cls = getClassById(a.class_id);
        const sub = getSubjectById(a.subject_id);
        const isLocked = a.is_locked || !canEdit;
        return `
                                <div style="padding:10px;border-bottom:1px solid var(--border-light);cursor:pointer;display:flex;justify-content:space-between;align-items:center;" onclick="window._loadAssessment(${a.id}); window.closeModal('assessment-selector-modal');">
                                    <div>
                                        <div style="font-weight:600;">${esc(a.assessment_name)}</div>
                                        <div style="font-size:0.8rem;color:var(--text-muted);">${esc(cls?.name || '')} · ${esc(sub?.name || '')} · ${a.assessment_type}</div>
                                    </div>
                                    <span class="badge ${isLocked ? 'badge-danger' : 'badge-success'}">${isLocked ? '🔒 Read-only' : '✅ Open'}</span>
                                </div>
                            `;
    }).join('')}
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-outline" onclick="window.closeModal('assessment-selector-modal')">Close</button>
                </div>
            </div>
        </div>
    `;

    showModal(modalHtml);
}

// ──────────────────────────────────────────────────────────────────────
// REFRESH MARKS VIEW
// ──────────────────────────────────────────────────────────────────────

async function refreshMarksView() {
    await refreshTable('assessments');
    await refreshTable('marks');
    if (currentAssessmentId) {
        await loadStudentsTable();
    }
    showToast('🔄 Refreshed', 'info', 1000);
}