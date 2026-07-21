/* ═══════════════════════════════════════════════════════════════════
   js/modules/staff/user-management.js
   ═══════════════════════════════════════════════════════════════════
   Rendered into #app-main by core/router.js for the 'user-management'
   nav item. Manages staff accounts (admin/accountant/teacher — all in
   the `teachers` table, see settings/users.js's header comment for
   why). Data layer and validation live in settings/users.js, loaded
   just before this file.

   Dependencies (plain-script globals loaded earlier in index.html):
   settings/users.js: listUsers, createUser, updateUser, setUserActive, deleteUser
   staff/teachers.js: teacherFullName
   state.js: state
   utils.js: esc
   toast.js: showToast
   modals.js: showModal, closeModal, confirmDialog
   loaders.js: window.Loaders
   constants.js: USER_ROLES, USER_ROLE_LABELS
   ═══════════════════════════════════════════════════════════════════ */

const UserManagement = (() => {

    async function render(container) {
        if (!container) return;
        container.innerHTML = `<div class="dashboard-page"><div class="loading-inline">Loading staff accounts…</div></div>`;

        const users = await listUsers();

        container.innerHTML = `
            <div class="dashboard-page">
                <div class="settings-section">
                    <div class="settings-section__title">User Management</div>
                    <div class="settings-section__desc">Teacher and accountant accounts, roles, and access.</div>
                </div>

                <div style="display:flex; justify-content:flex-end; margin-bottom:12px;">
                    <button class="btn btn-primary" id="add-user-btn"><i class="fa-solid fa-user-plus"></i> Add Staff Account</button>
                </div>

                <div class="teacher-grid">
                    ${users.map(u => renderUserCard(u)).join('') || '<div class="setting-desc">No staff accounts yet.</div>'}
                </div>
            </div>
        `;

        bindEvents(container);
    }

    function renderUserCard(u) {
        const isActive = u.is_active !== false;
        return `
            <div class="teacher-card" data-user-id="${u.id}">
                <div class="teacher-avatar">${esc(initials(u))}</div>
                <div class="teacher-name">${esc(teacherFullName(u))}</div>
                <div class="teacher-details">
                    <span class="role-badge ${esc(u.role)}"><span class="dot"></span>${esc(USER_ROLE_LABELS[u.role] || u.role)}</span>
                    <span class="role-badge ${isActive ? 'active' : 'suspended'}">${isActive ? 'Active' : 'Suspended'}</span>
                </div>
                <div class="teacher-details" style="margin-top:6px;">
                    <span class="teacher-class-tag">@${esc(u.username)}</span>
                    ${u.email ? `<span class="teacher-class-tag">${esc(u.email)}</span>` : ''}
                </div>
                <div style="display:flex; gap:8px; margin-top:10px;">
                    <button class="btn btn-sm btn-outline" data-edit-user="${u.id}"><i class="fa-solid fa-pen"></i> Edit</button>
                    <button class="btn btn-sm btn-outline" data-toggle-active="${u.id}" data-active="${isActive}">
                        <i class="fa-solid fa-${isActive ? 'ban' : 'check'}"></i> ${isActive ? 'Suspend' : 'Activate'}
                    </button>
                    <button class="btn btn-sm btn-outline" data-delete-user="${u.id}"><i class="fa-solid fa-trash"></i></button>
                </div>
            </div>
        `;
    }

    function initials(u) {
        return `${(u.first_name || '')[0] || ''}${(u.last_name || '')[0] || ''}`.toUpperCase();
    }

    function userForm(existing = null) {
        return `
            <form id="user-form">
                <div class="form-group" style="display:flex; gap:10px;">
                    <div style="flex:1;"><label class="form-label">First Name</label>
                        <input type="text" name="first_name" class="form-input" value="${existing ? esc(existing.first_name) : ''}" required></div>
                    <div style="flex:1;"><label class="form-label">Last Name</label>
                        <input type="text" name="last_name" class="form-input" value="${existing ? esc(existing.last_name) : ''}" required></div>
                </div>
                <div class="form-group"><label class="form-label">Role</label>
                    <select name="role" class="form-select" required>
                        ${USER_ROLES.map(r => `<option value="${r}" ${existing?.role === r ? 'selected' : ''}>${USER_ROLE_LABELS[r]}</option>`).join('')}
                    </select></div>
                <div class="form-group"><label class="form-label">Username</label>
                    <input type="text" name="username" class="form-input" value="${existing ? esc(existing.username) : ''}" required></div>
                <div class="form-group"><label class="form-label">Email (optional)</label>
                    <input type="email" name="email" class="form-input" value="${existing ? esc(existing.email || '') : ''}"></div>
                <div class="form-group"><label class="form-label">Phone (optional)</label>
                    <input type="tel" name="phone" class="form-input" value="${existing ? esc(existing.phone || '') : ''}"></div>
                <div class="form-group"><label class="form-label">${existing ? 'New Password (leave blank to keep current)' : 'Password'}</label>
                    <input type="password" name="password" class="form-input" ${existing ? '' : 'required'}></div>
            </form>
        `;
    }

    function bindEvents(container) {
        container.querySelector('#add-user-btn')?.addEventListener('click', () => openUserModal(container));

        container.querySelectorAll('[data-edit-user]').forEach(btn => {
            btn.addEventListener('click', async () => {
                const users = await listUsers();
                const user = users.find(u => String(u.id) === btn.dataset.editUser);
                openUserModal(container, user);
            });
        });

        container.querySelectorAll('[data-toggle-active]').forEach(btn => {
            btn.addEventListener('click', async () => {
                const isActive = btn.dataset.active === 'true';
                await setUserActive(btn.dataset.toggleActive, !isActive);
                showToast(isActive ? 'Account suspended' : 'Account activated', 'success');
                render(container);
            });
        });

        container.querySelectorAll('[data-delete-user]').forEach(btn => {
            btn.addEventListener('click', async () => {
                const ok = await confirmDialog('Delete this staff account? This cannot be undone.', 'Delete Account', { confirmClass: 'btn-danger' });
                if (!ok) return;
                const result = await deleteUser(btn.dataset.deleteUser);
                if (result.success) render(container);
            });
        });
    }

    function openUserModal(container, existing = null) {
        window.showModal(userForm(existing), {
            title: existing ? 'Edit Staff Account' : 'Add Staff Account',
            footer: `<button class="btn btn-outline" data-close>Cancel</button>
                     <button class="btn btn-primary" id="save-user-btn">Save</button>`
        });

        document.getElementById('save-user-btn').onclick = async () => {
            const btn = document.getElementById('save-user-btn');
            window.Loaders?.button?.start(btn, 'Saving...');
            try {
                const form = document.getElementById('user-form');
                const data = Object.fromEntries(new FormData(form).entries());
                const result = existing ? await updateUser(existing.id, data) : await createUser(data);

                if (result.success) {
                    showToast(existing ? 'Account updated' : 'Account created', 'success');
                    window.closeModal();
                    render(container);
                } else {
                    showToast('Please fix the errors', 'error', Object.values(result.errors || {})[0]);
                }
            } finally {
                window.Loaders?.button?.stop(btn);
            }
        };
    }

    return { render };
})();

window.renderUserManagement = UserManagement.render;
window.UserManagement = UserManagement;
