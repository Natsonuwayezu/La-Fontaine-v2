/* ═══════════════════════════════════════════════════════════════════
   js/modules/staff/teachers.js
   ═══════════════════════════════════════════════════════════════════
   Read-oriented data layer over the `teachers` table (lookups, filters,
   dropdown lists) — used by class-management.js, teacher-assignments.js,
   teacher-performance.js, and the timetable modules. For account
   creation/editing/validation, see settings/users.js instead — that
   file owns the CRUD + form-validation side of this same table.

   Dependencies (plain-script globals loaded earlier in index.html):
   api.js: getAll
   state.js: state
   constants.js: USER_ROLES
   ═══════════════════════════════════════════════════════════════════ */

async function listTeachers() {
    if (!state.teachers.length) {
        state.teachers = await getAll('teachers');
    }
    return [...state.teachers].sort((a, b) =>
        `${a.first_name} ${a.last_name}`.localeCompare(`${b.first_name} ${b.last_name}`));
}

async function listTeachersByRole(role) {
    const all = await listTeachers();
    return all.filter(t => t.role === role);
}

async function getTeacherById(id) {
    const all = await listTeachers();
    return all.find(t => String(t.id) === String(id)) || null;
}

function teacherFullName(teacher) {
    if (!teacher) return '—';
    return `${teacher.first_name || ''} ${teacher.last_name || ''}`.trim() || '—';
}

async function activeTeachersOnly() {
    const all = await listTeachers();
    return all.filter(t => t.is_active !== false);
}

/* ═══════════════════════════════════════════════════════════════════
   EXPOSE
   ═══════════════════════════════════════════════════════════════════ */

window.listTeachers = listTeachers;
window.listTeachersByRole = listTeachersByRole;
window.getTeacherById = getTeacherById;
window.teacherFullName = teacherFullName;
window.activeTeachersOnly = activeTeachersOnly;

// Router bridge — teachers is a utility module, redirect to user-management
function renderTeachers(container, params) {
    if (typeof renderUserManagement === 'function') return renderUserManagement(container, params);
    if (container) container.innerHTML = '<div class="section-card"><div class="empty-state"><div class="es-title">Loading staff management…</div></div></div>';
}
window.renderTeachers = renderTeachers;
