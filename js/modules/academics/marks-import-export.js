/**
 * ECOLE LA FONTAINE — Marks Import / Export Module
 * Bulk import marks from Excel, export marks to Excel
 * Last updated: 2026-07-03
 * 
 * CHANGES:
 * - Added academic year filtering (uses selected year from sidebar)
 * - Added active term validation — cannot import/export marks for inactive years
 * - Added term validation — only current/active term can be used for import
 * - Export now filters by selected academic year
 * - Assessment creation uses selected academic year
 * - Read-only mode for inactive years
 */



const ensureStateLoaded = window.ensureStateLoaded || (async () => {}); // global from boot.js
import {
    state,
    getClassById,
    getSubjectById,
    getStudentById,
    getCurrentUser,
    getCurrentAcademicYear,
    getActiveAcademicYearId,
    getCurrentTerm,
    getTermsByYear,
    getYearData,
    isCurrentYearEditable
} from '../../core/state.js';
import { esc, fmtDate, exportToExcel } from '../../core/utils.js';
import { getGrade, getGradeClass } from '../../core/formulas.js';
import { insert, update, getAll, get } from '../../core/api.js';
import { notifyAction } from '../../core/notifications.js';

// ──────────────────────────────────────────────────────────────────────
// STATE
// ──────────────────────────────────────────────────────────────────────

let selectedYearId = null;
let activeTermId = null;

// ──────────────────────────────────────────────────────────────────────
// MAIN RENDER FUNCTION
// ──────────────────────────────────────────────────────────────────────

export async function renderMarksImportExport(container) {
    if (!container) return;

    const user = getCurrentUser();
    if (user?.role === 'accountant') {
        container.innerHTML = '<div class="alert alert-danger">Access denied. Accountant cannot access marks import/export.</div>';
        return;
    }

    await ensureStateLoaded();

    // Get selected year from state
    selectedYearId = state.filters?.academic_year_id || state.currentAcadYear?.id;
    const selectedYear = (state.academicYears || []).find(y => y.id === selectedYearId);
    const isActive = selectedYear?.is_active === true;
    const currentTerm = getCurrentTerm();
    activeTermId = currentTerm?.id;

    // Get terms for selected year
    const termsForYear = getTermsByYear(selectedYearId);
    const isTermActive = (termId) => {
        if (!termId) return false;
        const term = termsForYear.find(t => t.id === termId);
        if (!term) return false;
        const today = new Date().toISOString().split('T')[0];
        return term.start_date <= today && term.end_date >= today;
    };

    const classes = (state.classes || []).filter(c => c.is_active !== false);
    const subjects = (state.subjects || []).filter(s => s.is_active !== false);
    const years = (state.academicYears || []).sort((a, b) => b.id - a.id);

    container.innerHTML = `
        <div class="dash-card">
            <div class="dash-card-header" style="flex-wrap:wrap;gap:8px;">
                <span class="dash-card-title">📤 Marks Import / Export</span>
                <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
                    <select id="mie-year-filter" onchange="window._reloadMarksImportExport()" style="padding:4px 10px;border-radius:6px;border:1px solid var(--border-medium);font-size:0.75rem;">
                        ${years.map(y => `
                            <option value="${y.id}" ${y.id === selectedYearId ? 'selected' : ''}>
                                ${esc(y.name)} ${y.id === state.currentAcadYear?.id ? '🟢' : ''}
                            </option>
                        `).join('')}
                    </select>
                    <span class="badge ${isActive ? 'badge-success' : 'badge-neutral'}" style="font-size:0.6rem;">
                        ${isActive ? '🟢 Editable' : '🔒 Read-only'}
                    </span>
                    ${!isActive ? '<span class="badge badge-warning" style="font-size:0.6rem;">⛔ Import Disabled</span>' : ''}
                </div>
            </div>
            <div class="dash-card-body">
                <!-- Warning for inactive year -->
                ${!isActive ? `
                    <div class="alert alert-warning" style="margin-bottom:16px;font-size:0.85rem;">
                        <strong>⛔ Read-Only Mode:</strong> ${esc(selectedYear?.name || 'This academic year')} is inactive.
                        You cannot import or modify marks for this year.
                    </div>
                ` : ''}

                <!-- Tabs -->
                <div class="tabs" style="display:flex;gap:2px;border-bottom:2px solid var(--border-light);margin-bottom:16px;">
                    <button class="tab-btn active" onclick="window._switchMarksTab('export', event)">📤 Export</button>
                    <button class="tab-btn" onclick="window._switchMarksTab('import', event)">📥 Import</button>
                    <button class="tab-btn" onclick="window._switchMarksTab('template', event)">📄 Template</button>
                </div>

                <!-- Export Tab -->
                <div id="marks-export-tab">
                    <div class="form-grid" style="margin-bottom:16px;">
                        <div class="form-group">
                            <label>Export Type</label>
                            <select id="export-type" onchange="window._toggleExportOptions()" style="padding:8px 12px;border-radius:6px;border:1px solid var(--border-medium);">
                                <option value="by_assessment">By Assessment</option>
                                <option value="by_class">By Class</option>
                                <option value="by_student">By Student</option>
                            </select>
                        </div>
                        <div class="form-group" id="export-class-group">
                            <label>Class</label>
                            <select id="export-class" onchange="window._loadExportStudents()" style="padding:8px 12px;border-radius:6px;border:1px solid var(--border-medium);">
                                <option value="">All Classes</option>
                                ${classes.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}
                            </select>
                        </div>
                        <div class="form-group" id="export-subject-group">
                            <label>Subject</label>
                            <select id="export-subject" onchange="window._loadExportAssessments()" style="padding:8px 12px;border-radius:6px;border:1px solid var(--border-medium);">
                                <option value="">All Subjects</option>
                                ${subjects.map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join('')}
                            </select>
                        </div>
                        <div class="form-group" id="export-assessment-group">
                            <label>Assessment</label>
                            <select id="export-assessment" style="padding:8px 12px;border-radius:6px;border:1px solid var(--border-medium);">
                                <option value="">Select Assessment</option>
                            </select>
                        </div>
                        <div class="form-group" id="export-term-group">
                            <label>Term</label>
                            <select id="export-term" style="padding:8px 12px;border-radius:6px;border:1px solid var(--border-medium);">
                                <option value="">All Terms</option>
                                ${termsForYear.map(t => `<option value="${t.id}" ${t.id === activeTermId ? 'selected' : ''}>${esc(t.name)} ${t.id === activeTermId ? '🟢' : ''}</option>`).join('')}
                            </select>
                        </div>
                        <div class="form-group" id="export-student-group" style="display:none;">
                            <label>Student</label>
                            <select id="export-student" style="padding:8px 12px;border-radius:6px;border:1px solid var(--border-medium);">
                                <option value="">Select Student</option>
                            </select>
                        </div>
                    </div>
                    <div style="font-size:0.7rem;color:var(--text-muted);margin-bottom:12px;">
                        📅 Exporting data from ${esc(selectedYear?.name || 'Current Year')}
                        ${activeTermId ? ` · Active Term: ${esc(termsForYear.find(t => t.id === activeTermId)?.name || '—')}` : ''}
                    </div>
                    <div class="btn-group">
                        <button class="btn btn-primary" onclick="window._executeMarksExport()">📤 Export Marks</button>
                        <button class="btn btn-outline" onclick="window._resetExportForm()">↻ Reset</button>
                    </div>
                    <div id="export-preview" style="margin-top:16px;display:none;"></div>
                </div>

                <!-- Import Tab -->
                <div id="marks-import-tab" style="display:none;">
                    <div class="alert alert-info">
                        <strong>Import Instructions:</strong> Upload an Excel file with columns: <strong>Student Code</strong>, <strong>Score</strong>.
                        The assessment will be created if it doesn't exist.
                        ${!isActive ? '<br><strong>⛔ Import is disabled for inactive years.</strong>' : ''}
                    </div>
                    <div class="form-grid" style="margin-bottom:16px;">
                        <div class="form-group">
                            <label>Class *</label>
                            <select id="import-class" style="padding:8px 12px;border-radius:6px;border:1px solid var(--border-medium);" ${!isActive ? 'disabled' : ''}>
                                <option value="">Select Class</option>
                                ${classes.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}
                            </select>
                        </div>
                        <div class="form-group">
                            <label>Subject *</label>
                            <select id="import-subject" style="padding:8px 12px;border-radius:6px;border:1px solid var(--border-medium);" ${!isActive ? 'disabled' : ''}>
                                <option value="">Select Subject</option>
                                ${subjects.map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join('')}
                            </select>
                        </div>
                        <div class="form-group">
                            <label>Term * (Must be active)</label>
                            <select id="import-term" style="padding:8px 12px;border-radius:6px;border:1px solid var(--border-medium);" ${!isActive ? 'disabled' : ''}>
                                <option value="">Select Term</option>
                                ${termsForYear.map(t => `
                                    <option value="${t.id}" ${t.id === activeTermId ? 'selected' : ''}>
                                        ${esc(t.name)} ${t.id === activeTermId ? '🟢 Active' : (isTermActive(t.id) ? '🟡 Current' : '🔒 Closed')}
                                    </option>
                                `).join('')}
                            </select>
                        </div>
                        <div class="form-group">
                            <label>Assessment Name *</label>
                            <input type="text" id="import-assessment-name" placeholder="e.g., Quiz 4" style="padding:8px 12px;border-radius:6px;border:1px solid var(--border-medium);" ${!isActive ? 'disabled' : ''}>
                        </div>
                        <div class="form-group">
                            <label>Assessment Type *</label>
                            <select id="import-assessment-type" style="padding:8px 12px;border-radius:6px;border:1px solid var(--border-medium);" ${!isActive ? 'disabled' : ''}>
                                <option value="Quiz">Quiz</option>
                                <option value="Assignment">Assignment</option>
                                <option value="Mid-term">Mid-term</option>
                                <option value="Exam">Exam</option>
                                <option value="Final Exam">Final Exam</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label>Max Marks *</label>
                            <input type="number" id="import-max-marks" value="50" min="1" max="200" style="padding:8px 12px;border-radius:6px;border:1px solid var(--border-medium);" ${!isActive ? 'disabled' : ''}>
                        </div>
                        <div class="form-group">
                            <label>Date</label>
                            <input type="date" id="import-date" value="${new Date().toISOString().split('T')[0]}" style="padding:8px 12px;border-radius:6px;border:1px solid var(--border-medium);" ${!isActive ? 'disabled' : ''}>
                        </div>
                    </div>
                    ${!isActive ? `
                        <div class="alert alert-warning" style="margin-bottom:16px;">
                            ⛔ Import is disabled because ${esc(selectedYear?.name || 'this academic year')} is inactive.
                            Please switch to an active year to import marks.
                        </div>
                    ` : ''}
                    <div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin-bottom:16px;">
                        <button class="btn btn-outline" onclick="window._downloadMarksTemplate()" ${!isActive ? 'disabled' : ''}>📥 Download Template</button>
                        <input type="file" id="import-file" accept=".xlsx,.xls,.csv" style="display:none;" onchange="window._previewMarksImport()" ${!isActive ? 'disabled' : ''}>
                        <button class="btn btn-primary" onclick="document.getElementById('import-file').click()" ${!isActive ? 'disabled' : ''}>📂 Choose File</button>
                        <button class="btn btn-success" id="import-btn" style="display:none;" onclick="window._executeMarksImport()" ${!isActive ? 'disabled' : ''}>✅ Import Marks</button>
                    </div>
                    <div id="import-preview" style="display:none;"></div>
                </div>

                <!-- Template Tab -->
                <div id="marks-template-tab" style="display:none;">
                    <div class="alert alert-info">
                        <strong>Template Generator:</strong> Download a template with your class students pre-filled.
                    </div>
                    <div class="form-grid" style="margin-bottom:16px;">
                        <div class="form-group">
                            <label>Class *</label>
                            <select id="template-class" onchange="window._previewTemplateData()" style="padding:8px 12px;border-radius:6px;border:1px solid var(--border-medium);">
                                <option value="">Select Class</option>
                                ${classes.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}
                            </select>
                        </div>
                        <div class="form-group">
                            <label>Subject *</label>
                            <select id="template-subject" style="padding:8px 12px;border-radius:6px;border:1px solid var(--border-medium);">
                                <option value="">Select Subject</option>
                                ${subjects.map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join('')}
                            </select>
                        </div>
                        <div class="form-group">
                            <label>Term</label>
                            <select id="template-term" style="padding:8px 12px;border-radius:6px;border:1px solid var(--border-medium);">
                                ${termsForYear.map(t => `
                                    <option value="${t.id}" ${t.id === activeTermId ? 'selected' : ''}>
                                        ${esc(t.name)} ${t.id === activeTermId ? '🟢' : ''}
                                    </option>
                                `).join('')}
                            </select>
                        </div>
                        <div class="form-group">
                            <label>Assessment Name</label>
                            <input type="text" id="template-name" placeholder="e.g., Quiz 4" style="padding:8px 12px;border-radius:6px;border:1px solid var(--border-medium);">
                        </div>
                        <div class="form-group">
                            <label>Max Marks</label>
                            <input type="number" id="template-max" value="50" min="1" max="200" style="padding:8px 12px;border-radius:6px;border:1px solid var(--border-medium);">
                        </div>
                    </div>
                    <div class="btn-group">
                        <button class="btn btn-primary" onclick="window._downloadMarksTemplate()">📥 Generate Template</button>
                    </div>
                    <div id="template-preview" style="margin-top:16px;display:none;"></div>
                </div>
            </div>
        </div>
    `;

    window._switchMarksTab = switchMarksTab;
    window._toggleExportOptions = toggleExportOptions;
    window._loadExportAssessments = loadExportAssessments;
    window._loadExportStudents = loadExportStudents;
    window._executeMarksExport = executeMarksExport;
    window._resetExportForm = resetExportForm;
    window._previewMarksImport = previewMarksImport;
    window._executeMarksImport = executeMarksImport;
    window._downloadMarksTemplate = downloadMarksTemplate;
    window._previewTemplateData = previewTemplateData;
    window._reloadMarksImportExport = reloadMarksImportExport;

    await loadExportAssessments();
}

// ──────────────────────────────────────────────────────────────────────
// RELOAD MARKS IMPORT EXPORT
// ──────────────────────────────────────────────────────────────────────

async function reloadMarksImportExport() {
    const yearId = document.getElementById('mie-year-filter')?.value;
    if (yearId) {
        selectedYearId = parseInt(yearId);
        state.filters.academic_year_id = selectedYearId;
        renderMarksImportExport(document.getElementById('dynamic-content'));
    }
}

// ──────────────────────────────────────────────────────────────────────
// SWITCH TAB
// ──────────────────────────────────────────────────────────────────────

function switchMarksTab(tabName, event) {
    ['export', 'import', 'template'].forEach(t => {
        const el = document.getElementById(`marks-${t}-tab`);
        if (el) el.style.display = t === tabName ? 'block' : 'none';
    });
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    if (event?.target) event.target.classList.add('active');
}

// ──────────────────────────────────────────────────────────────────────
// TOGGLE EXPORT OPTIONS
// ──────────────────────────────────────────────────────────────────────

function toggleExportOptions() {
    const type = document.getElementById('export-type')?.value;
    const classGroup = document.getElementById('export-class-group');
    const subjectGroup = document.getElementById('export-subject-group');
    const assessmentGroup = document.getElementById('export-assessment-group');
    const termGroup = document.getElementById('export-term-group');
    const studentGroup = document.getElementById('export-student-group');

    if (classGroup) classGroup.style.display = type !== 'by_student' ? 'block' : 'none';
    if (subjectGroup) subjectGroup.style.display = type === 'by_assessment' ? 'block' : 'none';
    if (assessmentGroup) assessmentGroup.style.display = type === 'by_assessment' ? 'block' : 'none';
    if (termGroup) termGroup.style.display = type !== 'by_student' ? 'block' : 'none';
    if (studentGroup) studentGroup.style.display = type === 'by_student' ? 'block' : 'none';

    if (type === 'by_assessment') loadExportAssessments();
    if (type === 'by_student') loadExportStudents();
}

// ──────────────────────────────────────────────────────────────────────
// LOAD EXPORT ASSESSMENTS
// ──────────────────────────────────────────────────────────────────────

async function loadExportAssessments() {
    const classId = document.getElementById('export-class')?.value;
    const subjectId = document.getElementById('export-subject')?.value;
    const termId = document.getElementById('export-term')?.value;
    const assSel = document.getElementById('export-assessment');
    if (!assSel) return;

    let assessments = (state.assessments || [])
        .filter(a => a.academic_year_id === selectedYearId);

    if (classId) assessments = assessments.filter(a => a.class_id == classId);
    if (subjectId) assessments = assessments.filter(a => a.subject_id == subjectId);
    if (termId) assessments = assessments.filter(a => a.term_id == termId);

    assessments.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    assSel.innerHTML = '<option value="">— Select Assessment —</option>' +
        assessments.map(a => {
            const cls = getClassById(a.class_id);
            const sub = getSubjectById(a.subject_id);
            return `<option value="${a.id}">${esc(a.assessment_name)} — ${esc(cls?.name || '?')} (${esc(sub?.name || '?')})</option>`;
        }).join('');
}

// ──────────────────────────────────────────────────────────────────────
// LOAD EXPORT STUDENTS
// ──────────────────────────────────────────────────────────────────────

async function loadExportStudents() {
    const classId = document.getElementById('export-class')?.value;
    const stuSel = document.getElementById('export-student');
    if (!stuSel) return;

    let students = (state.students || [])
        .filter(s => s.status === 'Active' && s.academic_year_id === selectedYearId);

    if (classId) students = students.filter(s => s.class_id == classId);

    students.sort((a, b) => a.last_name.localeCompare(b.last_name));

    stuSel.innerHTML = '<option value="">— Select Student —</option>' +
        students.map(s => `<option value="${s.id}">${esc(s.first_name)} ${esc(s.last_name)} (${esc(s.student_code || '')})</option>`).join('');
}

// ──────────────────────────────────────────────────────────────────────
// EXECUTE MARKS EXPORT
// ──────────────────────────────────────────────────────────────────────

async function executeMarksExport() {
    const type = document.getElementById('export-type')?.value;
    const classId = document.getElementById('export-class')?.value;
    const subjectId = document.getElementById('export-subject')?.value;
    const assessmentId = document.getElementById('export-assessment')?.value;
    const termId = document.getElementById('export-term')?.value;
    const studentId = document.getElementById('export-student')?.value;
    const preview = document.getElementById('export-preview');

    if (type === 'by_assessment' && !assessmentId) {
        showToast('Please select an assessment', 'warning');
        return;
    }
    if (type === 'by_student' && !studentId) {
        showToast('Please select a student', 'warning');
        return;
    }

    preview.style.display = 'block';
    preview.innerHTML = '<div class="spinner-sm"></div> Generating export...';

    try {
        let data = [];
        const year = (state.academicYears || []).find(y => y.id === selectedYearId);
        const filename = `Marks_${year?.name || 'Current'}_${new Date().toISOString().split('T')[0]}`;

        if (type === 'by_assessment') {
            data = await exportMarksByAssessment(assessmentId);
        } else if (type === 'by_class') {
            data = await exportClassMarks(classId, termId);
        } else if (type === 'by_student') {
            data = await exportStudentMarks(studentId, termId);
        }

        if (data && data.length > 0) {
            exportToExcel(data, filename);
            preview.innerHTML = `<div class="alert alert-success">✅ Exported ${data.length} records from ${year?.name || 'Current Year'}</div>`;
            setTimeout(() => preview.style.display = 'none', 3000);
        } else {
            preview.innerHTML = '<div class="alert alert-warning">No data to export for this year</div>';
        }
    } catch (error) {
        preview.innerHTML = `<div class="alert alert-danger">Error: ${esc(error.message)}</div>`;
    }
}

// ──────────────────────────────────────────────────────────────────────
// EXPORT MARKS BY ASSESSMENT
// ──────────────────────────────────────────────────────────────────────

async function exportMarksByAssessment(assessmentId) {
    const assessment = state.assessments.find(a => a.id == assessmentId);
    if (!assessment) return [];

    const students = (state.students || [])
        .filter(s => s.class_id === assessment.class_id && s.status === 'Active' && s.academic_year_id === selectedYearId)
        .sort((a, b) => a.last_name.localeCompare(b.last_name));

    const marksMap = new Map(
        (state.marks || [])
            .filter(m => m.assessment_id === assessmentId && m.academic_year_id === selectedYearId)
            .map(m => [m.student_id, m])
    );

    const cls = getClassById(assessment.class_id);
    const sub = getSubjectById(assessment.subject_id);

    return students.map(s => {
        const mark = marksMap.get(s.id);
        const score = mark?.score ?? '';
        const pct = mark && assessment.max_marks > 0 ? (mark.score / assessment.max_marks) * 100 : null;
        return {
            'Student Code': s.student_code || '',
            'Student Name': `${s.first_name} ${s.last_name}`,
            'Class': cls?.name || '',
            'Subject': sub?.name || '',
            'Assessment': assessment.assessment_name,
            'Academic Year': (state.academicYears || []).find(y => y.id === selectedYearId)?.name || '',
            'Score': score,
            'Max Marks': assessment.max_marks,
            'Percentage': pct !== null ? pct.toFixed(1) + '%' : '—',
            'Grade': pct !== null ? getGrade(pct) : '—',
        };
    });
}

// ──────────────────────────────────────────────────────────────────────
// EXPORT CLASS MARKS
// ──────────────────────────────────────────────────────────────────────

async function exportClassMarks(classId, termId) {
    const cls = getClassById(classId);
    const students = (state.students || [])
        .filter(s => s.class_id == classId && s.status === 'Active' && s.academic_year_id === selectedYearId)
        .sort((a, b) => a.last_name.localeCompare(b.last_name));

    const assessments = (state.assessments || [])
        .filter(a => a.class_id == classId && a.academic_year_id === selectedYearId && (!termId || a.term_id == termId))
        .sort((a, b) => a.id - b.id);

    if (!assessments.length) {
        showToast('No assessments found for this class in this year', 'warning');
        return [];
    }

    const marksMap = new Map();
    (state.marks || [])
        .filter(m => m.academic_year_id === selectedYearId)
        .forEach(m => {
            marksMap.set(`${m.assessment_id}-${m.student_id}`, m);
        });

    const year = (state.academicYears || []).find(y => y.id === selectedYearId);

    return students.map(s => {
        const row = {
            'Student Code': s.student_code || '',
            'Student Name': `${s.first_name} ${s.last_name}`,
            'Academic Year': year?.name || '',
        };

        for (const a of assessments) {
            const mark = marksMap.get(`${a.id}-${s.id}`);
            const score = mark?.score ?? '';
            const pct = mark && a.max_marks > 0 ? (mark.score / a.max_marks) * 100 : null;
            row[`${a.assessment_name} (/${a.max_marks})`] = score;
            if (pct !== null) {
                row[`${a.assessment_name} (%)`] = pct.toFixed(1) + '%';
            }
        }

        return row;
    });
}

// ──────────────────────────────────────────────────────────────────────
// EXPORT STUDENT MARKS
// ──────────────────────────────────────────────────────────────────────

async function exportStudentMarks(studentId, termId) {
    const student = getStudentById(studentId);
    if (!student) return [];

    const assessments = (state.assessments || [])
        .filter(a => a.class_id === student.class_id && a.academic_year_id === selectedYearId && (!termId || a.term_id == termId))
        .sort((a, b) => a.id - b.id);

    const marksMap = new Map();
    (state.marks || [])
        .filter(m => m.academic_year_id === selectedYearId)
        .forEach(m => {
            marksMap.set(`${m.assessment_id}-${m.student_id}`, m);
        });

    const cls = getClassById(student.class_id);
    const year = (state.academicYears || []).find(y => y.id === selectedYearId);

    return assessments.map(a => {
        const mark = marksMap.get(`${a.id}-${studentId}`);
        const score = mark?.score ?? '';
        const pct = mark && a.max_marks > 0 ? (mark.score / a.max_marks) * 100 : null;
        const sub = getSubjectById(a.subject_id);
        return {
            'Academic Year': year?.name || '',
            'Class': cls?.name || '',
            'Subject': sub?.name || '',
            'Assessment': a.assessment_name,
            'Score': score,
            'Max Marks': a.max_marks,
            'Percentage': pct !== null ? pct.toFixed(1) + '%' : '—',
            'Grade': pct !== null ? getGrade(pct) : '—',
            'Date': fmtDate(a.date || a.created_at),
        };
    });
}

// ──────────────────────────────────────────────────────────────────────
// PREVIEW MARKS IMPORT
// ──────────────────────────────────────────────────────────────────────

async function previewMarksImport() {
    const file = document.getElementById('import-file')?.files[0];
    if (!file) {
        showToast('Select a file first', 'warning');
        return;
    }

    const preview = document.getElementById('import-preview');
    const importBtn = document.getElementById('import-btn');
    if (!preview) return;

    try {
        const data = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = e => {
                try {
                    const wb = XLSX.read(e.target.result, { type: 'array' });
                    const ws = wb.Sheets[wb.SheetNames[0]];
                    resolve(XLSX.utils.sheet_to_json(ws));
                } catch (err) { reject(err); }
            };
            reader.onerror = reject;
            reader.readAsArrayBuffer(file);
        });

        window._importData = data;

        const firstRow = data[0] || {};
        const hasStudentCode = Object.keys(firstRow).some(k => k.toLowerCase().includes('code'));
        const hasScore = Object.keys(firstRow).some(k => k.toLowerCase().includes('score'));

        if (!hasStudentCode || !hasScore) {
            preview.innerHTML = '<div class="alert alert-danger">❌ File must contain "Student Code" and "Score" columns</div>';
            preview.style.display = 'block';
            importBtn.style.display = 'none';
            return;
        }

        preview.innerHTML = `
            <div class="alert alert-success">✅ Found <strong>${data.length}</strong> records</div>
            <div class="table-wrapper">
                <table class="data-table" style="font-size:0.78rem;">
                    <thead><tr>${Object.keys(firstRow).map(k => `<th>${esc(k)}</th>`).join('')}</tr></thead>
                    <tbody>
                        ${data.slice(0, 10).map(r => `
                            <tr>${Object.values(r).map(v => `<td>${esc(String(v))}</td>`).join('')}</tr>
                        `).join('')}
                        ${data.length > 10 ? `<tr><td colspan="${Object.keys(firstRow).length}" style="text-align:center;color:var(--text-muted);">... and ${data.length - 10} more rows</td></tr>` : ''}
                    </tbody>
                </table>
            </div>
            ${!isCurrentYearEditable() ? `<div class="alert alert-warning" style="margin-top:12px;">⛔ Import is disabled for inactive years.</div>` : ''}
        `;
        preview.style.display = 'block';
        importBtn.style.display = isCurrentYearEditable() ? 'inline-flex' : 'none';

    } catch (e) {
        preview.innerHTML = `<div class="alert alert-danger">Error reading file: ${esc(e.message)}</div>`;
        preview.style.display = 'block';
    }
}

// ──────────────────────────────────────────────────────────────────────
// EXECUTE MARKS IMPORT — With Active Term Validation
// ──────────────────────────────────────────────────────────────────────

async function executeMarksImport() {
    // Check if year is active
    if (!isCurrentYearEditable()) {
        showToast('⛔ Cannot import marks — this academic year is inactive', 'warning');
        return;
    }

    const classId = document.getElementById('import-class')?.value;
    const subjectId = document.getElementById('import-subject')?.value;
    const termId = document.getElementById('import-term')?.value;
    const assessmentName = document.getElementById('import-assessment-name')?.value.trim();
    const assessmentType = document.getElementById('import-assessment-type')?.value;
    const maxMarks = parseFloat(document.getElementById('import-max-marks')?.value);
    const assessmentDate = document.getElementById('import-date')?.value;
    const rows = window._importData;

    if (!classId || !subjectId || !termId || !assessmentName || !maxMarks) {
        showToast('Please fill all required fields', 'warning');
        return;
    }

    // Validate term is active
    const termsForYear = getTermsByYear(selectedYearId);
    const selectedTerm = termsForYear.find(t => t.id == termId);
    if (!selectedTerm) {
        showToast('Invalid term selected', 'warning');
        return;
    }

    const today = new Date().toISOString().split('T')[0];
    const isTermActive = selectedTerm.start_date <= today && selectedTerm.end_date >= today;

    if (!isTermActive) {
        showToast(`⛔ Cannot import marks for ${selectedTerm.name} — this term is closed or not yet started`, 'warning');
        return;
    }

    if (!rows || !rows.length) {
        showToast('No data to import', 'warning');
        return;
    }

    const btn = document.getElementById('import-btn');
    const originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-sm"></span> Importing...';

    try {
        const students = (state.students || [])
            .filter(s => s.class_id == classId && s.status === 'Active' && s.academic_year_id === selectedYearId);

        // Find or create assessment with academic year
        let assessmentId = null;
        const existingAssessment = (state.assessments || []).find(a =>
            a.class_id == classId &&
            a.subject_id == subjectId &&
            a.assessment_name === assessmentName &&
            a.term_id == termId &&
            a.academic_year_id === selectedYearId
        );

        if (existingAssessment) {
            assessmentId = existingAssessment.id;
        } else {
            const newAssessment = await insert('assessments', {
                class_id: parseInt(classId),
                subject_id: parseInt(subjectId),
                term_id: parseInt(termId),
                academic_year_id: selectedYearId,
                assessment_type: assessmentType,
                assessment_name: assessmentName,
                max_marks: maxMarks,
                date: assessmentDate || new Date().toISOString().split('T')[0],
                is_locked: false,
                created_by: getCurrentUser()?.id,
                created_at: new Date().toISOString(),
            });
            if (newAssessment) {
                state.assessments.push(newAssessment);
                assessmentId = newAssessment.id;
            }
        }

        if (!assessmentId) {
            showToast('Failed to create/find assessment', 'error');
            return;
        }

        let imported = 0;
        let notFound = 0;
        let invalidScores = 0;

        const marksMap = new Map();
        (state.marks || [])
            .filter(m => m.academic_year_id === selectedYearId)
            .forEach(m => {
                marksMap.set(`${m.assessment_id}-${m.student_id}`, m);
            });

        for (const row of rows) {
            let studentCode = row['Student Code'] || row['student_code'] || row['Code'] || '';
            let studentName = row['Student Name'] || row['Student'] || row['student_name'] || '';
            let score = parseFloat(row['Score'] || row['Marks'] || row['score'] || 0);

            let student = students.find(s => s.student_code === studentCode);
            if (!student && studentName) {
                student = students.find(s => `${s.first_name} ${s.last_name}`.toLowerCase() === studentName.toLowerCase());
            }

            if (!student) {
                notFound++;
                continue;
            }

            if (isNaN(score) || score < 0 || score > maxMarks) {
                invalidScores++;
                continue;
            }

            const key = `${assessmentId}-${student.id}`;
            const existing = marksMap.get(key);

            if (existing) {
                await update('marks', existing.id, { score: score });
            } else {
                await insert('marks', {
                    assessment_id: assessmentId,
                    student_id: student.id,
                    score: score,
                    academic_year_id: selectedYearId,
                    term_id: parseInt(termId),
                    entered_by: getCurrentUser()?.id,
                    entered_at: new Date().toISOString(),
                });
            }
            imported++;
        }

        await refreshTable('marks');

        const year = (state.academicYears || []).find(y => y.id === selectedYearId);
        await notifyAction('marks_import', {
            message: `Imported ${imported} marks from Excel into ${year?.name || 'Current Year'} (${selectedTerm.name})`,
            entity_type: 'marks',
            entity_id: assessmentId,
        }, ['admin']);

        showToast(`✅ Imported ${imported} marks into ${selectedTerm.name} (${notFound} students not found, ${invalidScores} invalid)`, imported > 0 ? 'success' : 'warning');

        document.getElementById('import-file').value = '';
        document.getElementById('import-preview').style.display = 'none';
        window._importData = null;

    } catch (error) {
        showToast('Import failed: ' + error.message, 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalText;
    }
}

// ──────────────────────────────────────────────────────────────────────
// DOWNLOAD MARKS TEMPLATE
// ──────────────────────────────────────────────────────────────────────

function downloadMarksTemplate() {
    const classId = document.getElementById('template-class')?.value;
    const subjectId = document.getElementById('template-subject')?.value;
    const termId = document.getElementById('template-term')?.value;
    const assessmentName = document.getElementById('template-name')?.value.trim() || 'Assessment';
    const maxMarks = document.getElementById('template-max')?.value || 50;

    if (!classId) {
        showToast('Please select a class', 'warning');
        return;
    }

    const students = (state.students || [])
        .filter(s => s.class_id == classId && s.status === 'Active' && s.academic_year_id === selectedYearId)
        .sort((a, b) => a.last_name.localeCompare(b.last_name));

    if (!students.length) {
        showToast('No active students in this class for this year', 'warning');
        return;
    }

    const cls = getClassById(classId);
    const sub = getSubjectById(subjectId);
    const year = (state.academicYears || []).find(y => y.id === selectedYearId);
    const term = (state.terms || []).find(t => t.id == termId);

    const data = students.map(s => ({
        'Student Code': s.student_code || '',
        'Student Name': `${s.first_name} ${s.last_name}`,
        'Score': '',
        'Max Marks': maxMarks,
        'Notes': `Max: ${maxMarks} | ${term?.name || ''} ${year?.name || ''}`,
    }));

    const filename = `${cls?.name}_${sub?.name || 'Subject'}_${assessmentName.replace(/\s/g, '_')}_Template`;
    exportToExcel(data, filename);
    showToast('✅ Template downloaded', 'success');
}

// ──────────────────────────────────────────────────────────────────────
// PREVIEW TEMPLATE DATA
// ──────────────────────────────────────────────────────────────────────

function previewTemplateData() {
    const classId = document.getElementById('template-class')?.value;
    const preview = document.getElementById('template-preview');
    if (!classId) {
        preview.style.display = 'none';
        return;
    }

    const students = (state.students || [])
        .filter(s => s.class_id == classId && s.status === 'Active' && s.academic_year_id === selectedYearId)
        .slice(0, 5);

    const cls = getClassById(classId);
    const year = (state.academicYears || []).find(y => y.id === selectedYearId);

    if (!students.length) {
        preview.innerHTML = `<div class="alert alert-warning">No active students in ${esc(cls?.name || 'this class')} for ${year?.name || 'this year'}</div>`;
        preview.style.display = 'block';
        return;
    }

    preview.innerHTML = `
        <div class="alert alert-info">📋 Preview: ${students.length} student(s) from ${esc(cls?.name)} (${esc(year?.name || 'Current Year')})</div>
        <div class="table-wrapper">
            <table class="data-table" style="font-size:0.78rem;">
                <thead>
                    <tr>
                        <th>Student Code</th>
                        <th>Student Name</th>
                        <th>Score</th>
                        <th>Max Marks</th>
                        <th>Notes</th>
                    </tr>
                </thead>
                <tbody>
                    ${students.map(s => `
                        <tr>
                            <td>${esc(s.student_code || '')}</td>
                            <td>${esc(s.first_name)} ${esc(s.last_name)}</td>
                            <td><input type="text" placeholder="Enter score" style="width:80px;padding:4px;border:1px solid var(--border-light);border-radius:4px;"></td>
                            <td>${document.getElementById('template-max')?.value || 50}</td>
                            <td><input type="text" placeholder="Optional" style="width:100px;padding:4px;border:1px solid var(--border-light);border-radius:4px;"></td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
    `;
    preview.style.display = 'block';
}

// ──────────────────────────────────────────────────────────────────────
// RESET EXPORT FORM
// ──────────────────────────────────────────────────────────────────────

function resetExportForm() {
    ['export-type', 'export-class', 'export-subject', 'export-assessment', 'export-term', 'export-student'].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            if (el.tagName === 'SELECT') el.value = '';
            else el.value = '';
        }
    });
    toggleExportOptions();
    showToast('Form reset', 'info', 1500);
}