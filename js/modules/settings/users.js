/* ═══════════════════════════════════════════════════════════════════
   js/modules/settings/users.js
   ═══════════════════════════════════════════════════════════════════
   Data layer for staff accounts. Despite the name, there is no
   separate `users` table — state.teachers "includes admin + accountants
   + teachers" (see core/state.js), so all staff accounts of every role
   live in the `teachers` table, distinguished by their `role` column.

   No render() — consumed by staff/user-management.js (the actual
   'user-management' nav page).

   Table: teachers { id, first_name, last_name, role, username, email,
                       phone, password, is_active }

   Dependencies (plain-script globals loaded earlier in index.html):
   api.js: getAll, insert, update, remove, refreshTable
   validators.js: validateTeacherForm
   sanitizers.js: cleanName, cleanEmail, cleanPhone
   state.js: state
   toast.js: showToast
   logger.js: logAction
   constants.js: USER_ROLES, USER_ROLE_LABELS
   ═══════════════════════════════════════════════════════════════════ */

async function listUsers() {
    if (!state.teachers.length) {
        state.teachers = await getAll('teachers');
    }
    return [...state.teachers].sort((a, b) =>
        `${a.first_name} ${a.last_name}`.localeCompare(`${b.first_name} ${b.last_name}`));
}

async function createUser(data) {
    const { valid, errors } = validateTeacherForm(data, true);
    if (!valid) return { success: false, errors };

    const existing = await listUsers();
    if (existing.some(u => u.username?.toLowerCase() === data.username.trim().toLowerCase())) {
        return { success: false, errors: { username: 'This username is already taken.' } };
    }

    const row = await insert('teachers', {
        first_name: cleanName(data.first_name),
        last_name: cleanName(data.last_name),
        role: data.role,
        username: data.username.trim(),
        email: cleanEmail(data.email),
        phone: cleanPhone(data.phone),
        password: data.password, // NOTE: hashing/auth flow lives in core/auth.js, not yet written
        is_active: true
    });
    await refreshTable('teachers');
    await logAction('USER_CREATED', 'teachers', row?.id, { username: data.username, role: data.role });
    return { success: true, row };
}

async function updateUser(id, data) {
    const { valid, errors } = validateTeacherForm(data, false);
    if (!valid) return { success: false, errors };

    const payload = {
        first_name: cleanName(data.first_name),
        last_name: cleanName(data.last_name),
        role: data.role,
        username: data.username.trim(),
        email: cleanEmail(data.email),
        phone: cleanPhone(data.phone),
    };
    if (data.password) payload.password = data.password;

    await update('teachers', id, payload);
    await refreshTable('teachers');
    await logAction('USER_UPDATED', 'teachers', id, { username: data.username, role: data.role });
    return { success: true };
}

async function setUserActive(id, isActive) {
    await update('teachers', id, { is_active: !!isActive });
    await refreshTable('teachers');
    await logAction(isActive ? 'USER_ACTIVATED' : 'USER_SUSPENDED', 'teachers', id);
    return { success: true };
}

async function deleteUser(id) {
    const currentId = state.currentUser?.id;
    if (id === currentId) {
        
        if (typeof loadAllData === 'function') loadAllData({ silent: true }).catch(() => {});
        showToast('Cannot delete', 'error', "You can't delete your own account while logged in.");
        return { success: false };
    }
    await remove('teachers', id);
    await refreshTable('teachers');
    await logAction('USER_DELETED', 'teachers', id, null, 'warning');
    return { success: true };
}

/* ═══════════════════════════════════════════════════════════════════
   EXPOSE
   ═══════════════════════════════════════════════════════════════════ */

window.listUsers = listUsers;
window.createUser = createUser;
window.updateUser = updateUser;
window.setUserActive = setUserActive;
window.deleteUser = deleteUser;

// Router bridge — users is a utility module used by user-management.js
function renderUsers(container, params) {
    if (typeof renderUserManagement === 'function') return renderUserManagement(container, params);
    if (container) container.innerHTML = '<div class="section-card"><div class="empty-state"><div class="es-title">User Management</div><div class="es-sub">Loading…</div></div></div>';
}
window.renderUsers = renderUsers;
