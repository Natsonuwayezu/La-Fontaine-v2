/**
 * ECOLE LA FONTAINE — Teacher Assignments
 * Assign teachers to classes and subjects, class teacher management
 * Last updated: 2026-07-03
 * 
 * CHANGES:
 * - Added academic year tracking for all assignments
 * - Assignments are filtered by current academic year
 * - Class teacher assignments are year-specific
 * - Edit modal shows assignments for the selected year
 * - Year selector in assignment modal
 * - Historical assignments preserved when switching years
 * - Prevents editing assignments in inactive years
 */



const ensureStateLoaded = window.ensureStateLoaded || (async () => {}); // global from boot.js
import {
    state,
    getCurrentUser,
    getClassById,
    getSubjectById,
    getCurrentAcademicYear,
    getActiveAcademicYearId,
    isCurrentYearEditable,
    setYearFilter
} from '../../core/state.js';
import { esc } from '../../core/utils.js';
import { insert, remove, getAll, refreshTable, logActivity, update, updateWhere } from '../../core/api.js';
import { isActiveYear } from '../../core/permissions.js';
import { ensureStateLoaded } from '../../core/boot.js';

// ──────────────────────────────────────────────────────────────────────
// STATE
// ──────────────────────────────────────────────────────────────────────

let currentYearId = null;

// ──────────────────────────────────────────────────────────────────────
// MAIN RENDER FUNCTION
// ──────────────────────────────────────────────────────────────────────

export async function renderTeacherAssignments(container) {
    if (!container) return;

    const user = getCurrentUser();
    if (user?.role !== 'admin') {
        container.innerHTML = '<div class="alert alert-danger">Access denied. Admin privileges required.</div>';
        return;
    }

    await ensureStateLoaded();

    // Set current year from state filter or active year
    currentYearId = state.filters?.academic_year_id || getActiveAcademicYearId() || state.currentAcadYear?.id;

    const isEditable = isCurrentYearEditable();

    // Load assignments for current year
    let allAssignments = [];
    let yearAssignments = [];
    try {
        allAssignments = await getAll('teacher_assignments');
        yearAssignments = allAssignments.filter(a => a.academic_year_id == currentYearId);
    } catch (e) {
        allAssignments = [];
        yearAssignments = [];
    }

    const teachers = (state.teachers || []).filter(t => t.role === 'teacher' && t.status !== 'inactive');
    const classes = (state.classes || []).filter(c => c.is_active !== false);
    const subjects = (state.subjects || []).filter(s => s.is_active !== false);
    const years = (state.academicYears || []).sort((a, b) => b.id - a.id);

    // Build assignment map for current year
    const assignmentsByTeacher = new Map();
    for (const a of yearAssignments) {
        if (!assignmentsByTeacher.has(a.teacher_id)) {
            assignmentsByTeacher.set(a.teacher_id, []);
        }
        assignmentsByTeacher.get(a.teacher_id).push({
            class_id: a.class_id,
            subject_id: a.subject_id,
            class_name: getClassById(a.class_id)?.name || '—',
            subject_name: getSubjectById(a.subject_id)?.name || '—',
            is_class_teacher: a.is_class_teacher || false,
        });
    }

    // Get class teachers for current year
    const classTeachers = new Map();
    for (const cls of classes) {
        if (cls.class_teacher_id) {
            // Check if this class teacher is assigned for this year
            const hasAssignment = yearAssignments.some(a =>
                a.class_id === cls.id &&
                a.teacher_id === cls.class_teacher_id &&
                a.is_class_teacher
            );
            if (hasAssignment || !currentYearId) {
                classTeachers.set(cls.id, cls.class_teacher_id);
            }
        }
    }

    const selectedYear = years.find(y => y.id === currentYearId);

    container.innerHTML = `
        <div class="dash-card">
            <div class="dash-card-header" style="flex-wrap:wrap;gap:8px;">
                <span class="dash-card-title">📌 Teacher Assignments</span>
                <div class="btn-group" style="flex-wrap:wrap;gap:6px;">
                    <span style="font-size:0.75rem;color:var(--text-muted);padding:4px 12px;background:var(--bg-tertiary);border-radius:12px;display:flex;align-items:center;gap:4px;">
                        📅 ${esc(selectedYear?.name || 'Current Year')}
                        ${selectedYear?.is_active ? '🟢' : '🔒'}
                    </span>
                    <select id="assign-year-filter" onchange="window._filterAssignmentsByYear()" style="padding:4px 10px;border-radius:6px;border:1px solid var(--border-medium);font-size:0.8rem;">
                        ${years.map(y => `
                            <option value="${y.id}" ${y.id === currentYearId ? 'selected' : ''}>
                                ${esc(y.name)} ${y.id === state.currentAcadYear?.id ? '🟢' : ''}
                            </option>
                        `).join('')}
                    </select>
                    ${isEditable ? `
                        <button class="btn btn-sm btn-primary" onclick="window._openAssignmentModal()">➕ Assign</button>
                        <button class="btn btn-sm btn-outline" onclick="window._exportAssignments()">📥 Export</button>
                    ` : `
                        <span class="badge badge-neutral" style="font-size:0.7rem;">🔒 Read-Only</span>
                    `}
                    <button class="btn btn-sm btn-outline" onclick="window._refreshAssignments()">🔄 Refresh</button>
                </div>
            </div>
            <div class="dash-card-body" style="padding:0;">
                ${!isEditable ? `
                    <div class="alert alert-warning" style="margin:8px 16px;font-size:0.8rem;">
                        🔒 This academic year is inactive. Assignments are view-only.
                    </div>
                ` : ''}

                <!-- Tabs -->
                <div class="tabs" style="display:flex;gap:2px;border-bottom:2px solid var(--border-light);padding:0 16px;flex-wrap:wrap;">
                    <button class="tab-btn active" onclick="window._showAssignmentTab('subjects', event)" style="padding:10px 16px;font-size:0.8rem;">📋 Subject Assignments</button>
                    <button class="tab-btn" onclick="window._showAssignmentTab('class_teachers', event)" style="padding:10px 16px;font-size:0.8rem;">🏠 Class Teachers</button>
                    <button class="tab-btn" onclick="window._showAssignmentTab('matrix', event)" style="padding:10px 16px;font-size:0.8rem;">📊 Overview Matrix</button>
                </div>

                <!-- Subject Assignments -->
                <div id="assign-subjects-tab" style="padding:12px 16px;">
                    ${renderSubjectAssignments(teachers, assignmentsByTeacher, classTeachers, currentYearId, isEditable)}
                </div>

                <!-- Class Teachers -->
                <div id="assign-class-teachers-tab" style="display:none;padding:12px 16px;">
                    ${renderClassTeachers(classes, teachers, classTeachers, currentYearId, isEditable)}
                </div>

                <!-- Overview Matrix -->
                <div id="assign-matrix-tab" style="display:none;padding:12px 16px;">
                    ${renderAssignmentMatrix(teachers, classes, subjects, assignmentsByTeacher)}
                </div>
            </div>
        </div>

        <div class="dash-card" style="margin-top:20px;">
            <div class="dash-card-header">
                <span class="dash-card-title">📊 Assignment Statistics (${esc(selectedYear?.name || 'Current Year')})</span>
            </div>
            <div class="dash-card-body">
                <div class="stats-grid" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:12px;">
                    <div class="stat-card" style="padding:10px 14px;background:var(--bg-secondary);border-radius:var(--r-lg);border:1px solid var(--border-light);text-align:center;">
                        <div style="font-size:1.2rem;font-weight:700;">${teachers.length}</div>
                        <div style="font-size:0.65rem;color:var(--text-muted);text-transform:uppercase;">Teachers</div>
                    </div>
                    <div class="stat-card" style="padding:10px 14px;background:var(--bg-secondary);border-radius:var(--r-lg);border:1px solid var(--border-light);text-align:center;">
                        <div style="font-size:1.2rem;font-weight:700;">${yearAssignments.length}</div>
                        <div style="font-size:0.65rem;color:var(--text-muted);text-transform:uppercase;">Assignments</div>
                    </div>
                    <div class="stat-card" style="padding:10px 14px;background:var(--bg-secondary);border-radius:var(--r-lg);border:1px solid var(--border-light);text-align:center;">
                        <div style="font-size:1.2rem;font-weight:700;">${teachers.length ? (yearAssignments.length / teachers.length).toFixed(1) : 0}</div>
                        <div style="font-size:0.65rem;color:var(--text-muted);text-transform:uppercase;">Avg per Teacher</div>
                    </div>
                    <div class="stat-card" style="padding:10px 14px;background:var(--bg-secondary);border-radius:var(--r-lg);border:1px solid var(--border-light);text-align:center;">
                        <div style="font-size:1.2rem;font-weight:700;">${teachers.filter(t => !assignmentsByTeacher.has(t.id)).length}</div>
                        <div style="font-size:0.65rem;color:var(--text-muted);text-transform:uppercase;">Unassigned</div>
                    </div>
                </div>
                <div style="margin-top:12px;font-size:0.7rem;color:var(--text-muted);text-align:center;">
                    💡 Assignments are year-specific. Switch the year dropdown to view assignments from other years.
                </div>
            </div>
        </div>
    `;

    window._openAssignmentModal = openAssignmentModal;
    window._exportAssignments = exportAssignments;
    window._refreshAssignments = refreshAssignments;
    window._showAssignmentTab = showAssignmentTab;
    window._editTeacherAssignments = editTeacherAssignments;
    window._clearTeacherAssignments = clearTeacherAssignments;
    window._setClassTeacher = setClassTeacher;
    window._removeClassTeacher = removeClassTeacher;
    window._filterAssignmentsByYear = filterAssignmentsByYear;
}

// ──────────────────────────────────────────────────────────────────────
// FILTER ASSIGNMENTS BY YEAR
// ──────────────────────────────────────────────────────────────────────

async function filterAssignmentsByYear() {
    const yearId = document.getElementById('assign-year-filter')?.value;
    if (yearId) {
        currentYearId = parseInt(yearId);
        setYearFilter(currentYearId);
        renderTeacherAssignments(document.getElementById('dynamic-content'));
    }
}

// ──────────────────────────────────────────────────────────────────────
// RENDER SUBJECT ASSIGNMENTS
// ──────────────────────────────────────────────────────────────────────

function renderSubjectAssignments(teachers, assignmentsByTeacher, classTeachers, yearId, isEditable) {
    if (!teachers || !teachers.length) {
        return '<div style="text-align:center;padding:30px;color:var(--text-muted);">No teachers found</div>';
    }

    const year = (state.academicYears || []).find(y => y.id === yearId);

    return `
        <div style="margin-bottom:12px;font-size:0.75rem;color:var(--text-muted);">
            Showing assignments for <strong>${esc(year?.name || 'Current Year')}</strong>
            ${!isEditable ? ' 🔒 (Read-Only)' : ''}
        </div>
        <div class="table-wrapper">
            <table class="data-table">
                <thead>
                    <tr>
                        <th>Teacher</th>
                        <th>Class Teacher Of</th>
                        <th>Assigned Subjects & Classes</th>
                        <th>Load</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    ${teachers.map(t => {
        const teacherAssignments = assignmentsByTeacher.get(t.id) || [];
        const classTeacherId = classTeachers.get(t.id);
        const classTeacher = classTeacherId ? state.classes.find(c => c.id === classTeacherId) : null;
        const loadClass = teacherAssignments.length > 10 ? 'badge-danger' : (teacherAssignments.length > 5 ? 'badge-warning' : 'badge-success');
        return `
                            <tr>
                                <td><strong>${esc(t.first_name)} ${esc(t.last_name)}</strong></td>
                                <td>${classTeacher ? `<span class="badge badge-primary">🏠 ${esc(classTeacher.name)}</span>` : '<span style="color:var(--text-muted);">—</span>'}</td>
                                <td>
                                    <div style="display:flex;flex-wrap:wrap;gap:4px;">
                                        ${teacherAssignments.length ? teacherAssignments.map(a => `
                                            <span class="badge ${a.is_class_teacher ? 'badge-primary' : 'badge-info'}" style="font-size:0.7rem;">
                                                ${esc(a.class_name)} — ${esc(a.subject_name)}
                                                ${a.is_class_teacher ? ' 🏠' : ''}
                                            </span>
                                        `).join('') : '<span style="color:var(--text-muted);font-size:0.8rem;">No assignments</span>'}
                                    </div>
                                </td>
                                <td style="text-align:center;"><span class="badge ${loadClass}">${teacherAssignments.length}</span></td>
                                <td>
                                    ${isEditable ? `
                                        <button class="btn btn-sm btn-outline" onclick="window._editTeacherAssignments(${t.id})" style="padding:2px 8px;font-size:0.7rem;">✏️ Edit</button>
                                        <button class="btn btn-sm btn-danger" onclick="window._clearTeacherAssignments(${t.id})" style="padding:2px 8px;font-size:0.7rem;">🗑️ Clear</button>
                                    ` : `
                                        <button class="btn btn-sm btn-outline" onclick="window._viewTeacherAssignments(${t.id})" style="padding:2px 8px;font-size:0.7rem;">👁️ View</button>
                                    `}
                                </td>
                            </tr>
                        `;
    }).join('')}
                </tbody>
            </table>
        </div>
    `;
}

// ──────────────────────────────────────────────────────────────────────
// RENDER CLASS TEACHERS
// ──────────────────────────────────────────────────────────────────────

function renderClassTeachers(classes, teachers, classTeachers, yearId, isEditable) {
    if (!classes || !classes.length) {
        return '<div style="text-align:center;padding:30px;color:var(--text-muted);">No classes found</div>';
    }

    const year = (state.academicYears || []).find(y => y.id === yearId);

    return `
        <div style="margin-bottom:12px;font-size:0.75rem;color:var(--text-muted);">
            Class teacher assignments for <strong>${esc(year?.name || 'Current Year')}</strong>
            ${!isEditable ? ' 🔒 (Read-Only)' : ''}
        </div>
        <div class="table-wrapper">
            <table class="data-table">
                <thead>
                    <tr>
                        <th>Class</th>
                        <th>Class Teacher</th>
                        <th>Access Granted</th>
                        <th>Action</th>
                    </tr>
                </thead>
                <tbody>
                    ${classes.map(c => {
        const teacherId = classTeachers.get(c.id);
        const classTeacher = teacherId ? teachers.find(t => t.id === teacherId) : null;
        return `
                            <tr>
                                <td><strong>${esc(c.name)}</strong></td>
                                <td>${classTeacher ? `<strong>${esc(classTeacher.first_name)} ${esc(classTeacher.last_name)}</strong>` : '<span style="color:var(--text-muted);">(unassigned) ⚠️</span>'}</td>
                                <td>${classTeacher ? '<span class="badge badge-success">✅ Marks · Register · Attendance · Timetable</span>' : '<span style="color:var(--text-muted);">—</span>'}</td>
                                <td>
                                    ${isEditable ? `
                                        ${classTeacher
                    ? `<button class="btn btn-sm btn-outline" onclick="window._removeClassTeacher(${c.id})" style="padding:2px 8px;font-size:0.7rem;">Remove</button>`
                    : `<button class="btn btn-sm btn-primary" onclick="window._setClassTeacher(${c.id})" style="padding:2px 8px;font-size:0.7rem;">Assign</button>`
                }
                                    ` : `
                                        ${classTeacher ? '<span class="badge badge-neutral">🔒 View Only</span>' : '<span style="color:var(--text-muted);">—</span>'}
                                    `}
                                </td>
                            </tr>
                        `;
    }).join('')}
                </tbody>
            </table>
        </div>
    `;
}

// ──────────────────────────────────────────────────────────────────────
// RENDER ASSIGNMENT MATRIX
// ──────────────────────────────────────────────────────────────────────

function renderAssignmentMatrix(teachers, classes, subjects, assignmentsByTeacher) {
    if (!teachers.length || !classes.length || !subjects.length) {
        return '<div style="text-align:center;padding:30px;color:var(--text-muted);">Not enough data to display matrix</div>';
    }

    // Show top 8 teachers and top 6 subjects for readability
    const displayTeachers = teachers.slice(0, 8);
    const displaySubjects = subjects.slice(0, 6);

    return `
        <div class="table-wrapper">
            <table class="data-table" style="font-size:0.75rem;">
                <thead>
                    <tr>
                        <th>Teacher</th>
                        ${displaySubjects.map(s => `<th style="text-align:center;font-size:0.65rem;">${esc(s.code || s.name)}</th>`).join('')}
                        <th style="text-align:center;">Load</th>
                    </tr>
                </thead>
                <tbody>
                    ${displayTeachers.map(t => {
        const tAssignments = assignmentsByTeacher.get(t.id) || [];
        const classTeacherId = tAssignments.find(a => a.is_class_teacher)?.class_id;
        const classTeacher = classTeacherId ? state.classes.find(c => c.id === classTeacherId) : null;
        return `
                            <tr>
                                <td style="font-weight:500;font-size:0.75rem;">
                                    ${esc(t.first_name)} ${esc(t.last_name)}
                                    ${classTeacher ? `<span style="color:var(--success);font-size:0.6rem;"> 🏠 ${esc(classTeacher.name)}</span>` : ''}
                                </td>
                                ${displaySubjects.map(s => {
            const hasAssignment = tAssignments.some(a => a.subject_id === s.id);
            return `<td style="text-align:center;${hasAssignment ? 'color:var(--success);font-weight:700;' : 'color:var(--text-muted);'}">${hasAssignment ? '✅' : '—'}</td>`;
        }).join('')}
                                <td style="text-align:center;font-weight:600;">${tAssignments.length}</td>
                            </tr>
                        `;
    }).join('')}
                </tbody>
            </table>
        </div>
        ${teachers.length > 8 ? `<div style="margin-top:8px;font-size:0.7rem;color:var(--text-muted);text-align:center;">Showing 8 of ${teachers.length} teachers</div>` : ''}
    `;
}

// ──────────────────────────────────────────────────────────────────────
// SHOW ASSIGNMENT TAB
// ──────────────────────────────────────────────────────────────────────

function showAssignmentTab(tab, event) {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    if (event?.target) event.target.classList.add('active');

    document.getElementById('assign-subjects-tab').style.display = tab === 'subjects' ? 'block' : 'none';
    document.getElementById('assign-class-teachers-tab').style.display = tab === 'class_teachers' ? 'block' : 'none';
    document.getElementById('assign-matrix-tab').style.display = tab === 'matrix' ? 'block' : 'none';
}

// ──────────────────────────────────────────────────────────────────────
// OPEN ASSIGNMENT MODAL
// ──────────────────────────────────────────────────────────────────────

function openAssignmentModal() {
    if (!isCurrentYearEditable()) {
        showToast('Cannot edit assignments in an inactive academic year', 'warning');
        return;
    }

    const teachers = (state.teachers || []).filter(t => t.role === 'teacher' && t.status !== 'inactive');
    const classes = (state.classes || []).filter(c => c.is_active !== false);
    const subjects = (state.subjects || []).filter(s => s.is_active !== false);
    const yearId = currentYearId || getActiveAcademicYearId() || state.currentAcadYear?.id;
    const years = (state.academicYears || []).sort((a, b) => b.id - a.id);

    showModal(`
        <div class="modal-overlay" id="assign-modal">
            <div class="modal" style="max-width:500px;">
                <div class="modal-header">
                    <h3>➕ Assign Teacher</h3>
                    <button class="modal-close" onclick="window.closeModal('assign-modal')">✕</button>
                </div>
                <div class="modal-body">
                    <div class="form-grid">
                        <div class="form-group full">
                            <label>Teacher *</label>
                            <select id="assign-teacher" class="form-control">
                                <option value="">— Select Teacher —</option>
                                ${teachers.map(t => `<option value="${t.id}">${esc(t.first_name)} ${esc(t.last_name)}</option>`).join('')}
                            </select>
                        </div>
                        <div class="form-group full">
                            <label>Class *</label>
                            <select id="assign-class" class="form-control">
                                <option value="">— Select Class —</option>
                                ${classes.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}
                            </select>
                        </div>
                        <div class="form-group full">
                            <label>Subject *</label>
                            <select id="assign-subject" class="form-control">
                                <option value="">— Select Subject —</option>
                                ${subjects.map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join('')}
                            </select>
                        </div>
                        <div class="form-group full">
                            <label>Academic Year *</label>
                            <select id="assign-year" class="form-control">
                                ${years.map(y => `
                                    <option value="${y.id}" ${y.id === yearId ? 'selected' : ''}>
                                        ${esc(y.name)} ${y.id === state.currentAcadYear?.id ? '🟢' : ''}
                                    </option>
                                `).join('')}
                            </select>
                        </div>
                        <div class="form-group full">
                            <label>Class Teacher</label>
                            <select id="assign-is-class-teacher" class="form-control">
                                <option value="false">Subject Teacher Only</option>
                                <option value="true">Class Teacher (Full Access)</option>
                            </select>
                        </div>
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-outline" onclick="window.closeModal('assign-modal')">Cancel</button>
                    <button class="btn btn-primary" onclick="window._submitAssignment()">Assign</button>
                </div>
            </div>
        </div>
    `);

    window._submitAssignment = submitAssignment;
}

// ──────────────────────────────────────────────────────────────────────
// SUBMIT ASSIGNMENT
// ──────────────────────────────────────────────────────────────────────

async function submitAssignment() {
    const teacherId = document.getElementById('assign-teacher')?.value;
    const classId = document.getElementById('assign-class')?.value;
    const subjectId = document.getElementById('assign-subject')?.value;
    const yearId = document.getElementById('assign-year')?.value;
    const isClassTeacher = document.getElementById('assign-is-class-teacher')?.value === 'true';

    if (!teacherId || !classId || !subjectId || !yearId) {
        showToast('Please select teacher, class, subject, and academic year', 'warning');
        return;
    }

    // Check if assignment already exists for this year
    let existing = [];
    try {
        existing = await getAll('teacher_assignments', {
            teacher_id: teacherId,
            class_id: classId,
            subject_id: subjectId,
            academic_year_id: yearId,
        });
    } catch (e) {
        existing = [];
    }

    if (existing.length > 0) {
        showToast('This assignment already exists for this academic year', 'warning');
        return;
    }

    const result = await insert('teacher_assignments', {
        teacher_id: parseInt(teacherId),
        class_id: parseInt(classId),
        subject_id: parseInt(subjectId),
        academic_year_id: parseInt(yearId),
        is_class_teacher: isClassTeacher,
        created_at: new Date().toISOString(),
    });

    if (result) {
        // If this is a class teacher assignment, update the class record
        if (isClassTeacher) {
            await update('classes', classId, {
                class_teacher_id: parseInt(teacherId),
                updated_at: new Date().toISOString(),
            });
        }

        closeModal('assign-modal');
        await refreshTable('teacher_assignments');
        await refreshTable('classes');
        await logActivity(state.currentUser?.id, state.currentUser?.role,
            `Assigned teacher ${teacherId} to class ${classId} subject ${subjectId} for year ${yearId}${isClassTeacher ? ' (Class Teacher)' : ''}`);
        showToast('✅ Assignment created', 'success');
        renderTeacherAssignments(document.getElementById('dynamic-content'));
    } else {
        showToast('Failed to create assignment', 'error');
    }
}

// ──────────────────────────────────────────────────────────────────────
// EDIT TEACHER ASSIGNMENTS
// ──────────────────────────────────────────────────────────────────────

async function editTeacherAssignments(teacherId) {
    if (!isCurrentYearEditable()) {
        showToast('Cannot edit assignments in an inactive academic year', 'warning');
        return;
    }

    const teacher = state.teachers.find(t => t.id === teacherId);
    if (!teacher) return;

    const yearId = currentYearId || getActiveAcademicYearId() || state.currentAcadYear?.id;

    let existing = [];
    try {
        existing = await getAll('teacher_assignments', { teacher_id: teacherId, academic_year_id: yearId });
    } catch (e) {
        existing = [];
    }

    const classes = (state.classes || []).filter(c => c.is_active !== false);
    const subjects = (state.subjects || []).filter(s => s.is_active !== false);
    const existingSet = new Set(existing.map(a => `${a.class_id}|${a.subject_id}`));
    const existingClassTeacher = existing.find(a => a.is_class_teacher);
    const years = (state.academicYears || []).sort((a, b) => b.id - a.id);

    showModal(`
        <div class="modal-overlay" id="edit-assign-modal">
            <div class="modal" style="max-width:720px;">
                <div class="modal-header">
                    <h3>✏️ Edit Assignments — ${esc(teacher.first_name)} ${esc(teacher.last_name)}</h3>
                    <p style="font-size:0.75rem;color:var(--text-muted);margin:0;">Academic Year: ${esc(years.find(y => y.id === yearId)?.name || 'Current')}</p>
                    <button class="modal-close" onclick="window.closeModal('edit-assign-modal')">✕</button>
                </div>
                <div class="modal-body">
                    <div class="alert alert-info" style="font-size:0.8rem;">Check the boxes to assign the teacher to a class and subject combination for the selected academic year.</div>
                    <div class="form-group" style="margin-bottom:12px;">
                        <label>Academic Year</label>
                        <select id="edit-assign-year" class="form-control" onchange="window._reloadEditAssignments(${teacherId})">
                            ${years.map(y => `
                                <option value="${y.id}" ${y.id === yearId ? 'selected' : ''}>
                                    ${esc(y.name)} ${y.id === state.currentAcadYear?.id ? '🟢' : ''}
                                </option>
                            `).join('')}
                        </select>
                    </div>
                    <div class="form-group" style="margin-bottom:12px;">
                        <label>Class Teacher</label>
                        <select id="edit-is-class-teacher" class="form-control">
                            <option value="false" ${!existingClassTeacher ? 'selected' : ''}>Subject Teacher Only</option>
                            <option value="true" ${existingClassTeacher ? 'selected' : ''}>Class Teacher (Full Access)</option>
                        </select>
                    </div>
                    <div class="table-wrapper" style="max-height:400px;overflow-y:auto;">
                        <table class="data-table" style="font-size:0.75rem;">
                            <thead>
                                <tr>
                                    <th style="width:40px;">Assign</th>
                                    <th>Class</th>
                                    ${subjects.map(s => `<th style="text-align:center;font-size:0.65rem;">${esc(s.code || s.name)}</th>`).join('')}
                                </tr>
                            </thead>
                            <tbody>
                                ${classes.map(cls => `
                                    <tr>
                                        <td style="text-align:center;">
                                            <input type="checkbox" class="row-select-all" data-class="${cls.id}" onchange="window._toggleRowSubjects(${cls.id}, this.checked)">
                                        </td>
                                        <td><strong>${esc(cls.name)}</strong></td>
                                        ${subjects.map(s => `
                                            <td style="text-align:center;">
                                                <input type="checkbox" class="assign-cb" data-class="${cls.id}" data-subject="${s.id}" ${existingSet.has(`${cls.id}|${s.id}`) ? 'checked' : ''}>
                                            </td>
                                        `).join('')}
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-outline" onclick="window.closeModal('edit-assign-modal')">Cancel</button>
                    <button class="btn btn-primary" onclick="window._saveTeacherAssignments(${teacherId})">💾 Save</button>
                </div>
            </div>
        </div>
    `);

    window._toggleRowSubjects = toggleRowSubjects;
    window._saveTeacherAssignments = saveTeacherAssignments;
    window._reloadEditAssignments = reloadEditAssignments;
}

// ──────────────────────────────────────────────────────────────────────
// RELOAD EDIT ASSIGNMENTS
// ──────────────────────────────────────────────────────────────────────

async function reloadEditAssignments(teacherId) {
    const yearId = document.getElementById('edit-assign-year')?.value;
    if (yearId) {
        closeModal('edit-assign-modal');
        await editTeacherAssignments(teacherId);
    }
}

// ──────────────────────────────────────────────────────────────────────
// TOGGLE ROW SUBJECTS
// ──────────────────────────────────────────────────────────────────────

function toggleRowSubjects(classId, checked) {
    document.querySelectorAll(`.assign-cb[data-class="${classId}"]`).forEach(cb => cb.checked = checked);
}

// ──────────────────────────────────────────────────────────────────────
// SAVE TEACHER ASSIGNMENTS
// ──────────────────────────────────────────────────────────────────────

async function saveTeacherAssignments(teacherId) {
    const yearId = document.getElementById('edit-assign-year')?.value;
    const isClassTeacher = document.getElementById('edit-is-class-teacher')?.value === 'true';

    if (!yearId) {
        showToast('Please select an academic year', 'warning');
        return;
    }

    const selected = [];
    document.querySelectorAll('.assign-cb:checked').forEach(cb => {
        selected.push({
            class_id: parseInt(cb.dataset.class),
            subject_id: parseInt(cb.dataset.subject),
        });
    });

    // Remove existing assignments for this year
    await removeWhere('teacher_assignments', `teacher_id=eq.${teacherId} AND academic_year_id=eq.${yearId}`);

    // Insert new assignments
    let saved = 0;
    for (const s of selected) {
        const result = await insert('teacher_assignments', {
            teacher_id: teacherId,
            class_id: s.class_id,
            subject_id: s.subject_id,
            academic_year_id: parseInt(yearId),
            is_class_teacher: isClassTeacher,
            created_at: new Date().toISOString(),
        });
        if (result) saved++;
    }

    // Update class teacher in classes table if needed
    if (isClassTeacher && selected.length > 0) {
        // Set class teacher for the first class with assignments
        const firstClass = selected[0]?.class_id;
        if (firstClass) {
            await updateWhere('classes', `id=eq.${firstClass}`, {
                class_teacher_id: teacherId,
                updated_at: new Date().toISOString(),
            });
        }
    } else if (!isClassTeacher) {
        // Remove class teacher if unassigned
        await updateWhere('classes', `class_teacher_id=eq.${teacherId}`, {
            class_teacher_id: null,
            updated_at: new Date().toISOString(),
        });
    }

    closeModal('edit-assign-modal');
    await refreshTable('teacher_assignments');
    await refreshTable('classes');
    await logActivity(state.currentUser?.id, state.currentUser?.role,
        `Updated ${saved} assignments for teacher ${teacherId} for year ${yearId}`);
    showToast(`✅ Saved ${saved} assignments for ${state.academicYears.find(y => y.id == yearId)?.name || 'year'}`, 'success');
    renderTeacherAssignments(document.getElementById('dynamic-content'));
}

// ──────────────────────────────────────────────────────────────────────
// CLEAR TEACHER ASSIGNMENTS
// ──────────────────────────────────────────────────────────────────────

async function clearTeacherAssignments(teacherId) {
    if (!isCurrentYearEditable()) {
        showToast('Cannot clear assignments in an inactive academic year', 'warning');
        return;
    }

    const teacher = state.teachers.find(t => t.id === teacherId);
    if (!teacher) return;

    const yearId = currentYearId || getActiveAcademicYearId() || state.currentAcadYear?.id;
    const year = state.academicYears.find(y => y.id === yearId);

    let count = 0;
    try {
        const existing = await getAll('teacher_assignments', { teacher_id: teacherId, academic_year_id: yearId });
        count = existing.length;
    } catch (e) { }

    if (count === 0) {
        showToast(`No assignments to clear for ${year?.name || 'current year'}`, 'info');
        return;
    }

    if (!await confirmDialog(`Remove ALL ${count} assignments for ${teacher.first_name} ${teacher.last_name} in ${year?.name || 'current year'}?`)) return;

    await removeWhere('teacher_assignments', `teacher_id=eq.${teacherId} AND academic_year_id=eq.${yearId}`);
    await refreshTable('teacher_assignments');
    await refreshTable('classes');
    await logActivity(state.currentUser?.id, state.currentUser?.role,
        `Cleared ${count} assignments for teacher ${teacherId} for year ${yearId}`);
    showToast(`✅ Cleared ${count} assignments for ${year?.name || 'current year'}`, 'success');
    renderTeacherAssignments(document.getElementById('dynamic-content'));
}

// ──────────────────────────────────────────────────────────────────────
// SET CLASS TEACHER
// ──────────────────────────────────────────────────────────────────────

function setClassTeacher(classId) {
    if (!isCurrentYearEditable()) {
        showToast('Cannot assign class teacher in an inactive academic year', 'warning');
        return;
    }

    const teachers = (state.teachers || []).filter(t => t.role === 'teacher' && t.status !== 'inactive');
    const cls = state.classes.find(c => c.id === classId);
    const yearId = currentYearId || getActiveAcademicYearId() || state.currentAcadYear?.id;
    const years = (state.academicYears || []).sort((a, b) => b.id - a.id);

    showModal(`
        <div class="modal-overlay" id="set-class-teacher-modal">
            <div class="modal" style="max-width:400px;">
                <div class="modal-header">
                    <h3>🏠 Set Class Teacher — ${esc(cls?.name)}</h3>
                    <button class="modal-close" onclick="window.closeModal('set-class-teacher-modal')">✕</button>
                </div>
                <div class="modal-body">
                    <div class="form-group full">
                        <label>Select Teacher</label>
                        <select id="ct-teacher" class="form-control">
                            <option value="">— Select Teacher —</option>
                            ${teachers.map(t => `<option value="${t.id}">${esc(t.first_name)} ${esc(t.last_name)}</option>`).join('')}
                        </select>
                    </div>
                    <div class="form-group full">
                        <label>Academic Year</label>
                        <select id="ct-year" class="form-control">
                            ${years.map(y => `
                                <option value="${y.id}" ${y.id === yearId ? 'selected' : ''}>
                                    ${esc(y.name)} ${y.id === state.currentAcadYear?.id ? '🟢' : ''}
                                </option>
                            `).join('')}
                        </select>
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-outline" onclick="window.closeModal('set-class-teacher-modal')">Cancel</button>
                    <button class="btn btn-primary" onclick="window._doSetClassTeacher(${classId})">Assign</button>
                </div>
            </div>
        </div>
    `);

    window._doSetClassTeacher = doSetClassTeacher;
}

// ──────────────────────────────────────────────────────────────────────
// DO SET CLASS TEACHER
// ──────────────────────────────────────────────────────────────────────

async function doSetClassTeacher(classId) {
    const teacherId = document.getElementById('ct-teacher')?.value;
    const yearId = document.getElementById('ct-year')?.value;

    if (!teacherId) {
        showToast('Please select a teacher', 'warning');
        return;
    }

    if (!yearId) {
        showToast('Please select an academic year', 'warning');
        return;
    }

    // Remove existing class teacher assignment for this class/year
    await removeWhere('teacher_assignments',
        `class_id=eq.${classId} AND academic_year_id=eq.${yearId} AND is_class_teacher=eq.true`
    );

    // Add new class teacher assignment
    const result = await insert('teacher_assignments', {
        teacher_id: parseInt(teacherId),
        class_id: parseInt(classId),
        subject_id: null,
        academic_year_id: parseInt(yearId),
        is_class_teacher: true,
        created_at: new Date().toISOString(),
    });

    if (result) {
        // Update class
        await update('classes', classId, {
            class_teacher_id: parseInt(teacherId),
            updated_at: new Date().toISOString(),
        });
    }

    closeModal('set-class-teacher-modal');
    await refreshTable('classes');
    await refreshTable('teacher_assignments');
    await logActivity(state.currentUser?.id, state.currentUser?.role,
        `Set class teacher for class ${classId} to ${teacherId} for year ${yearId}`);
    showToast(`✅ Class teacher assigned for ${state.academicYears.find(y => y.id == yearId)?.name || 'year'}`, 'success');
    renderTeacherAssignments(document.getElementById('dynamic-content'));
}

// ──────────────────────────────────────────────────────────────────────
// REMOVE CLASS TEACHER
// ──────────────────────────────────────────────────────────────────────

async function removeClassTeacher(classId) {
    if (!isCurrentYearEditable()) {
        showToast('Cannot remove class teacher in an inactive academic year', 'warning');
        return;
    }

    const cls = state.classes.find(c => c.id === classId);
    if (!cls) return;

    if (!await confirmDialog(`Remove class teacher from ${cls.name}?`)) return;

    const yearId = currentYearId || getActiveAcademicYearId() || state.currentAcadYear?.id;

    // Remove class teacher assignment
    await removeWhere('teacher_assignments',
        `class_id=eq.${classId} AND academic_year_id=eq.${yearId} AND is_class_teacher=eq.true`
    );

    // Update class
    await update('classes', classId, {
        class_teacher_id: null,
        updated_at: new Date().toISOString(),
    });

    await refreshTable('classes');
    await refreshTable('teacher_assignments');
    await logActivity(state.currentUser?.id, state.currentUser?.role,
        `Removed class teacher for class ${classId} for year ${yearId}`);
    showToast('✅ Class teacher removed', 'success');
    renderTeacherAssignments(document.getElementById('dynamic-content'));
}

// ──────────────────────────────────────────────────────────────────────
// REFRESH ASSIGNMENTS
// ──────────────────────────────────────────────────────────────────────

async function refreshAssignments() {
    await refreshTable('teacher_assignments');
    await refreshTable('classes');
    renderTeacherAssignments(document.getElementById('dynamic-content'));
    showToast('🔄 Refreshed', 'info', 1500);
}

// ──────────────────────────────────────────────────────────────────────
// EXPORT ASSIGNMENTS
// ──────────────────────────────────────────────────────────────────────

function exportAssignments() {
    const yearId = currentYearId || state.currentAcadYear?.id;
    const year = state.academicYears.find(y => y.id === yearId);

    let assignments = state.teacher_assignments || [];
    if (yearId) {
        assignments = assignments.filter(a => a.academic_year_id === yearId);
    }

    if (!assignments.length) {
        showToast('No assignments to export', 'warning');
        return;
    }

    const data = assignments.map(a => {
        const teacher = state.teachers.find(t => t.id === a.teacher_id);
        const cls = state.classes.find(c => c.id === a.class_id);
        const sub = state.subjects.find(s => s.id === a.subject_id);
        const year = state.academicYears.find(y => y.id === a.academic_year_id);
        return {
            'Teacher': teacher ? `${teacher.first_name} ${teacher.last_name}` : '—',
            'Class': cls?.name || '—',
            'Subject': sub?.name || '—',
            'Academic Year': year?.name || '—',
            'Class Teacher': a.is_class_teacher ? 'Yes' : 'No',
        };
    });

    exportToExcel(data, `Teacher_Assignments_${year?.name || 'All'}_${new Date().toISOString().split('T')[0]}`);
    showToast('✅ Assignments exported', 'success');
}