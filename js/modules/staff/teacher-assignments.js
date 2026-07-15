/* ═══════════════════════════════════════════════════════════════════
   js/modules/staff/teacher-assignments.js
   ═══════════════════════════════════════════════════════════════════
   Rendered into #app-main by core/router.js for the 'teacher-assignments'
   nav item. Visual matrix: teachers (rows) × classes (columns), each
   cell a toggle for whether that teacher is assigned to that class.
   This is the summary "who teaches where" assignment, simpler than
   the full day/period timetable_slots grid in staff/timetable.js.

   Table: teacher_assignments { id, teacher_id, class_id, subject_id }
   (state.teacherAssignments is not in core/api.js's REFRESH_MAP yet —
   loaded directly here instead.)

   Dependencies (plain-script globals loaded earlier in index.html):
   api.js: getAll, insert, remove
   state.js: state
   staff/teachers.js: activeTeachersOnly, teacherFullName
   utils.js: esc
   toast.js: showToast
   logger.js: logAction
   ═══════════════════════════════════════════════════════════════════ */

const TeacherAssignments = (() => {

    let assignments = [];

    async function loadAssignments() {
        assignments = await getAll('teacher_assignments').catch(() => []);
        state.teacherAssignments = assignments;
        return assignments;
    }

    async function render(container) {
        if (!container) return;
        container.innerHTML = `<div class="dashboard-page"><div class="loading-inline">Loading assignment matrix…</div></div>`;

        await ensureStateLoaded();
        await loadAssignments();
        const teachers = await activeTeachersOnly();
        const classes = state.classes;

        container.innerHTML = `
            <div class="dashboard-page">
                <div class="settings-section">
                    <div class="settings-section__title">Teacher Assignments</div>
                    <div class="settings-section__desc">Click a cell to assign or unassign a teacher to a class. Click a filled cell to choose the subject.</div>
                </div>

                <div class="assignment-matrix-wrap">
                    <table class="assignment-matrix">
                        <thead>
                            <tr>
                                <th>Teacher</th>
                                ${classes.map(c => `<th>${esc(c.code)}</th>`).join('')}
                            </tr>
                        </thead>
                        <tbody>
                            ${teachers.map(t => `
                                <tr>
                                    <td class="row-header">${esc(teacherFullName(t))}</td>
                                    ${classes.map(c => {
                                        const existing = assignments.find(a => String(a.teacher_id) === String(t.id) && String(a.class_id) === String(c.id));
                                        return `<td><div class="assignment-cell ${existing ? 'assigned' : ''}" data-teacher="${t.id}" data-class="${c.id}" title="${existing ? esc(subjectName(existing.subject_id)) : 'Not assigned'}"></div></td>`;
                                    }).join('')}
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        `;

        bindEvents(container);
    }

    function subjectName(id) {
        return (state.subjects.find(s => String(s.id) === String(id)) || {}).name || '';
    }

    function bindEvents(container) {
        container.querySelectorAll('.assignment-cell').forEach(cell => {
            cell.addEventListener('click', () => handleCellClick(container, cell));
        });
    }

    async function handleCellClick(container, cell) {
        const teacherId = cell.dataset.teacher;
        const classId = cell.dataset.class;
        const existing = assignments.find(a => String(a.teacher_id) === String(teacherId) && String(a.class_id) === String(classId));

        if (existing) {
            const ok = await confirmDialog('Remove this teacher-class assignment?', 'Remove Assignment');
            if (!ok) return;
            await remove('teacher_assignments', existing.id);
            await logAction('TEACHER_ASSIGNMENT_REMOVED', 'teacher_assignments', existing.id);
            showToast('Assignment removed', 'success');
            render(container);
            return;
        }

        window.showModal(`
            <form id="assign-form">
                <div class="form-group">
                    <label class="form-label">Subject</label>
                    <select name="subject_id" class="form-select" required>
                        ${state.subjects.map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join('')}
                    </select>
                </div>
            </form>
        `, {
            title: 'Assign Teacher to Class',
            footer: `<button class="btn btn-outline" data-close>Cancel</button><button class="btn btn-primary" id="save-assign-btn">Assign</button>`
        });

        document.getElementById('save-assign-btn').onclick = async () => {
            const form = document.getElementById('assign-form');
            const subjectId = new FormData(form).get('subject_id');
            const row = await insert('teacher_assignments', { teacher_id: teacherId, class_id: classId, subject_id: subjectId });
            await logAction('TEACHER_ASSIGNMENT_CREATED', 'teacher_assignments', row?.id, { teacher_id: teacherId, class_id: classId });
            showToast('Teacher assigned', 'success');
            window.closeModal();
            render(container);
        };
    }

    function destroy() { assignments = []; }

    return { render, destroy };
})();

window.renderTeacherAssignments = TeacherAssignments.render;
window.TeacherAssignments = TeacherAssignments;
