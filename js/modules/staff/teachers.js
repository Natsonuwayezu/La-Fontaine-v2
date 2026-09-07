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
    // Cross-module navigation
    const _ns = document.createElement('div');
    _ns.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap;padding:8px 16px;';
    _ns.innerHTML = `<button class="btn btn-ghost btn-sm" onclick="navigateTo('teacher-assignments')"><i class="fa-solid fa-chalkboard"></i> Assignments</button>         <button class="btn btn-ghost btn-sm" onclick="navigateTo('subjects')"><i class="fa-solid fa-book"></i> Subjects</button>`;
    setTimeout(() => { if (container && container.firstChild) container.insertBefore(_ns, container.firstChild); }, 50);

    if (typeof renderUserManagement === 'function') return renderUserManagement(container, params);
    if (container) container.innerHTML = '<div class="section-card"><div class="empty-state"><div class="es-title">Loading staff management…</div></div></div>';
}
window.renderTeachers = renderTeachers;
