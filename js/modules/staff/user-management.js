/**
 * ECOLE LA FONTAINE — User Management
 * Manage staff accounts: teachers, accountants, admins
 * Last updated: 2026-06-29
 */



const state = window.state || {}; // global state alias
const ensureStateLoaded = window.ensureStateLoaded || (async () => {}); // global from boot.js
import { state, getCurrentUser } from '../../core/state.js';
import { esc, fmtDate, fmtDateTime } from '../../core/utils.js';
import { insert, update, remove, getAll, refreshTable, logActivity } from '../../core/api.js';

// ──────────────────────────────────────────────────────────────────────
// MAIN RENDER FUNCTION
// ──────────────────────────────────────────────────────────────────────

export async function renderUserManagement(container) {
    if (!container) return;

    const user = getCurrentUser();
    if (user?.role !== 'admin') {
        container.innerHTML = '<div class="alert alert-danger">Access denied. Admin privileges required.</div>';
        return;
    }

    await ensureStateLoaded();

    const users = state.teachers || [];

    container.innerHTML = `
        <div class="dash-card">
            <div class="dash-card-header" style="flex-wrap:wrap;gap:8px;">
                <span class="dash-card-title">👥 Staff & User Management</span>
                <div class="btn-group" style="flex-wrap:wrap;gap:6px;">
                    <button class="btn btn-sm btn-primary" onclick="window._openAddStaffModal()">➕ Create User</button>
                    <button class="btn btn-sm btn-outline" onclick="window._exportStaff()">📥 Export</button>
                    <button class="btn btn-sm btn-outline" onclick="window._refreshStaffList()">🔄 Refresh</button>
                </div>
            </div>
            <div class="dash-card-body" style="padding:0;">
                <!-- Filters -->
                <div style="padding:12px 16px;border-bottom:1px solid var(--border-light);display:flex;flex-wrap:wrap;gap:8px;align-items:center;background:var(--bg-tertiary);">
                    <select id="staff-role-filter" class="form-control" style="width:130px;" onchange="window._filterStaffList()">
                        <option value="">All Roles</option>
                        <option value="teacher">👩‍🏫 Teachers</option>
                        <option value="accountant">💰 Accountants</option>
                        <option value="admin">👨‍💼 Admins</option>
                    </select>
                    <select id="staff-status-filter" class="form-control" style="width:130px;" onchange="window._filterStaffList()">
                        <option value="">All Status</option>
                        <option value="active">Active</option>
                        <option value="inactive">Inactive</option>
                    </select>
                    <input type="text" id="staff-search" class="form-control flex-1" placeholder="🔍 Search by name, email, username..." oninput="window._filterStaffList()">
                    <span class="result-count" id="staff-count"></span>
                </div>

                <!-- Table -->
                <div class="table-wrapper">
                    <table class="data-table">
                        <thead>
                            <tr>
                                <th>Name</th>
                                <th>Username</th>
                                <th>Role</th>
                                <th>Email</th>
                                <th>Status</th>
                                <th>Last Login</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody id="staff-tbody">
                            ${renderStaffTable(users)}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>

        <div class="dash-card" style="margin-top:20px;">
            <div class="dash-card-header">
                <span class="dash-card-title">📊 Staff Statistics</span>
            </div>
            <div class="dash-card-body">
                <div class="stats-grid" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:12px;">
                    <div class="stat-card" style="padding:10px 14px;background:var(--bg-secondary);border-radius:var(--r-lg);border:1px solid var(--border-light);text-align:center;">
                        <div style="font-size:1.2rem;font-weight:700;">${users.filter(u => u.role === 'teacher' && u.status !== 'inactive').length}</div>
                        <div style="font-size:0.65rem;color:var(--text-muted);text-transform:uppercase;">Teachers</div>
                    </div>
                    <div class="stat-card" style="padding:10px 14px;background:var(--bg-secondary);border-radius:var(--r-lg);border:1px solid var(--border-light);text-align:center;">
                        <div style="font-size:1.2rem;font-weight:700;">${users.filter(u => u.role === 'accountant' && u.status !== 'inactive').length}</div>
                        <div style="font-size:0.65rem;color:var(--text-muted);text-transform:uppercase;">Accountants</div>
                    </div>
                    <div class="stat-card" style="padding:10px 14px;background:var(--bg-secondary);border-radius:var(--r-lg);border:1px solid var(--border-light);text-align:center;">
                        <div style="font-size:1.2rem;font-weight:700;">${users.filter(u => u.role === 'admin' && u.status !== 'inactive').length}</div>
                        <div style="font-size:0.65rem;color:var(--text-muted);text-transform:uppercase;">Admins</div>
                    </div>
                    <div class="stat-card" style="padding:10px 14px;background:var(--bg-secondary);border-radius:var(--r-lg);border:1px solid var(--border-light);text-align:center;">
                        <div style="font-size:1.2rem;font-weight:700;">${users.filter(u => u.status === 'inactive').length}</div>
                        <div style="font-size:0.65rem;color:var(--text-muted);text-transform:uppercase;">Inactive</div>
                    </div>
                </div>
            </div>
        </div>
    `;

    window._openAddStaffModal = openAddStaffModal;
    window._exportStaff = exportStaff;
    window._refreshStaffList = refreshStaffList;
    window._filterStaffList = filterStaffList;
    window._editStaff = editStaff;
    window._deleteStaff = deleteStaff;
    window._toggleStaffStatus = toggleStaffStatus;
    window._resetStaffPassword = resetStaffPassword;
}

// ──────────────────────────────────────────────────────────────────────
// RENDER STAFF TABLE
// ──────────────────────────────────────────────────────────────────────

function renderStaffTable(users) {
    if (!users || !users.length) {
        return '<tr><td colspan="7" style="text-align:center;padding:20px;color:var(--text-muted);">No staff members found</td></tr>';
    }

    return users.map(u => `
        <tr>
            <td><strong>${esc(u.first_name || '')} ${esc(u.last_name || '')}</strong></td>
            <td><code>${esc(u.username || '—')}</code></td>
            <td><span class="badge ${u.role === 'admin' ? 'badge-danger' : u.role === 'accountant' ? 'badge-warning' : 'badge-info'}">${esc(u.role || '—')}</span></td>
            <td>${esc(u.email || '—')}</td>
            <td><span class="badge ${u.status !== 'inactive' ? 'badge-success' : 'badge-danger'}">${u.status !== 'inactive' ? 'Active' : 'Inactive'}</span></td>
            <td style="font-size:0.75rem;">${u.last_login ? fmtDateTime(u.last_login) : 'Never'}</td>
            <td>
                <div style="display:flex;gap:4px;flex-wrap:wrap;">
                    <button class="btn btn-sm btn-outline" onclick="window._editStaff(${u.id})" style="padding:2px 8px;font-size:0.7rem;">✏️</button>
                    <button class="btn btn-sm btn-outline" onclick="window._resetStaffPassword(${u.id})" style="padding:2px 8px;font-size:0.7rem;">🔑</button>
                    <button class="btn btn-sm ${u.status !== 'inactive' ? 'btn-danger' : 'btn-success'}" onclick="window._toggleStaffStatus(${u.id})" style="padding:2px 8px;font-size:0.7rem;">${u.status !== 'inactive' ? 'Deactivate' : 'Activate'}</button>
                </div>
            </td>
        </tr>
    `).join('');
}

// ──────────────────────────────────────────────────────────────────────
// FILTER STAFF LIST
// ──────────────────────────────────────────────────────────────────────

function filterStaffList() {
    const role = document.getElementById('staff-role-filter')?.value;
    const status = document.getElementById('staff-status-filter')?.value;
    const search = document.getElementById('staff-search')?.value?.toLowerCase() || '';

    let users = state.teachers || [];

    if (role) users = users.filter(u => u.role === role);
    if (status === 'active') users = users.filter(u => u.status !== 'inactive');
    if (status === 'inactive') users = users.filter(u => u.status === 'inactive');
    if (search) {
        users = users.filter(u =>
            (u.first_name || '').toLowerCase().includes(search) ||
            (u.last_name || '').toLowerCase().includes(search) ||
            (u.username || '').toLowerCase().includes(search) ||
            (u.email || '').toLowerCase().includes(search)
        );
    }

    const tbody = document.getElementById('staff-tbody');
    if (tbody) tbody.innerHTML = renderStaffTable(users);

    const count = document.getElementById('staff-count');
    if (count) count.textContent = `${users.length} staff member${users.length !== 1 ? 's' : ''}`;
}

// ──────────────────────────────────────────────────────────────────────
// OPEN ADD STAFF MODAL
// ──────────────────────────────────────────────────────────────────────

function openAddStaffModal() {
    showModal(`
        <div class="modal-overlay" id="add-staff-modal">
            <div class="modal" style="max-width:500px;">
                <div class="modal-header">
                    <h3>➕ Create Staff Member</h3>
                    <button class="modal-close" onclick="window.closeModal('add-staff-modal')">✕</button>
                </div>
                <div class="modal-body">
                    <div class="form-grid">
                        <div class="form-group">
                            <label>First Name *</label>
                            <input type="text" id="staff-first" class="form-control" placeholder="First name">
                        </div>
                        <div class="form-group">
                            <label>Last Name *</label>
                            <input type="text" id="staff-last" class="form-control" placeholder="Last name">
                        </div>
                        <div class="form-group">
                            <label>Email</label>
                            <input type="email" id="staff-email" class="form-control" placeholder="email@school.com">
                        </div>
                        <div class="form-group">
                            <label>Phone</label>
                            <input type="text" id="staff-phone" class="form-control" placeholder="+250 788 534 320">
                        </div>
                        <div class="form-group">
                            <label>Username *</label>
                            <input type="text" id="staff-username" class="form-control" placeholder="e.g., john.doe">
                        </div>
                        <div class="form-group">
                            <label>Password *</label>
                            <input type="password" id="staff-password" class="form-control" placeholder="Min 4 characters">
                        </div>
                        <div class="form-group">
                            <label>Role *</label>
                            <select id="staff-role" class="form-control">
                                <option value="teacher">👩‍🏫 Teacher</option>
                                <option value="accountant">💰 Accountant</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label>Status</label>
                            <select id="staff-status" class="form-control">
                                <option value="active">Active</option>
                                <option value="inactive">Inactive</option>
                            </select>
                        </div>
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-outline" onclick="window.closeModal('add-staff-modal')">Cancel</button>
                    <button class="btn btn-primary" onclick="window._saveStaff()">💾 Save</button>
                </div>
            </div>
        </div>
    `);

    window._saveStaff = saveStaff;
}

// ──────────────────────────────────────────────────────────────────────
// SAVE STAFF
// ──────────────────────────────────────────────────────────────────────

async function saveStaff() {
    const firstName = document.getElementById('staff-first')?.value.trim();
    const lastName = document.getElementById('staff-last')?.value.trim();
    const email = document.getElementById('staff-email')?.value.trim() || null;
    const phone = document.getElementById('staff-phone')?.value.trim() || null;
    const username = document.getElementById('staff-username')?.value.trim();
    const password = document.getElementById('staff-password')?.value;
    const role = document.getElementById('staff-role')?.value;
    const status = document.getElementById('staff-status')?.value || 'active';

    if (!firstName || !lastName || !username || !password) {
        showToast('First name, last name, username, and password are required', 'warning');
        return;
    }

    if (password.length < 4) {
        showToast('Password must be at least 4 characters', 'warning');
        return;
    }

    // Check for duplicate username
    const existing = (state.teachers || []).find(u => u.username === username);
    if (existing) {
        showToast('Username already exists', 'warning');
        return;
    }

    const result = await insert('teachers', {
        first_name: firstName,
        last_name: lastName,
        email: email,
        phone: phone,
        username: username,
        password: password,
        role: role || 'teacher',
        status: status,
        created_at: new Date().toISOString(),
    });

    if (result) {
        closeModal('add-staff-modal');
        await refreshTable('teachers');
        await logActivity(state.currentUser?.id, state.currentUser?.role, `Added staff: ${firstName} ${lastName}`);
        showToast('✅ Staff member created', 'success');
        refreshStaffList();
    } else {
        showToast('Failed to create staff member', 'error');
    }
}

// ──────────────────────────────────────────────────────────────────────
// EDIT STAFF
// ──────────────────────────────────────────────────────────────────────

async function editStaff(staffId) {
    const staff = state.teachers.find(u => u.id === staffId);
    if (!staff) {
        showToast('Staff member not found', 'error');
        return;
    }

    showModal(`
        <div class="modal-overlay" id="edit-staff-modal">
            <div class="modal" style="max-width:500px;">
                <div class="modal-header">
                    <h3>✏️ Edit Staff — ${esc(staff.first_name)} ${esc(staff.last_name)}</h3>
                    <button class="modal-close" onclick="window.closeModal('edit-staff-modal')">✕</button>
                </div>
                <div class="modal-body">
                    <div class="form-grid">
                        <div class="form-group">
                            <label>First Name *</label>
                            <input type="text" id="es-first" class="form-control" value="${esc(staff.first_name || '')}">
                        </div>
                        <div class="form-group">
                            <label>Last Name *</label>
                            <input type="text" id="es-last" class="form-control" value="${esc(staff.last_name || '')}">
                        </div>
                        <div class="form-group">
                            <label>Email</label>
                            <input type="email" id="es-email" class="form-control" value="${esc(staff.email || '')}">
                        </div>
                        <div class="form-group">
                            <label>Phone</label>
                            <input type="text" id="es-phone" class="form-control" value="${esc(staff.phone || '')}">
                        </div>
                        <div class="form-group">
                            <label>Username *</label>
                            <input type="text" id="es-username" class="form-control" value="${esc(staff.username || '')}">
                        </div>
                        <div class="form-group">
                            <label>New Password (leave blank to keep current)</label>
                            <input type="password" id="es-password" class="form-control" placeholder="New password">
                        </div>
                        <div class="form-group">
                            <label>Role</label>
                            <select id="es-role" class="form-control">
                                <option value="teacher" ${staff.role === 'teacher' ? 'selected' : ''}>👩‍🏫 Teacher</option>
                                <option value="accountant" ${staff.role === 'accountant' ? 'selected' : ''}>💰 Accountant</option>
                                <option value="admin" ${staff.role === 'admin' ? 'selected' : ''}>👨‍💼 Admin</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label>Status</label>
                            <select id="es-status" class="form-control">
                                <option value="active" ${staff.status !== 'inactive' ? 'selected' : ''}>Active</option>
                                <option value="inactive" ${staff.status === 'inactive' ? 'selected' : ''}>Inactive</option>
                            </select>
                        </div>
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-outline" onclick="window.closeModal('edit-staff-modal')">Cancel</button>
                    <button class="btn btn-danger" onclick="window._deleteStaff(${staffId})">🗑️ Delete</button>
                    <button class="btn btn-primary" onclick="window._updateStaff(${staffId})">💾 Save</button>
                </div>
            </div>
        </div>
    `);

    window._updateStaff = updateStaff;
}

// ──────────────────────────────────────────────────────────────────────
// UPDATE STAFF
// ──────────────────────────────────────────────────────────────────────

async function updateStaff(staffId) {
    const firstName = document.getElementById('es-first')?.value.trim();
    const lastName = document.getElementById('es-last')?.value.trim();
    const email = document.getElementById('es-email')?.value.trim() || null;
    const phone = document.getElementById('es-phone')?.value.trim() || null;
    const username = document.getElementById('es-username')?.value.trim();
    const password = document.getElementById('es-password')?.value;
    const role = document.getElementById('es-role')?.value;
    const status = document.getElementById('es-status')?.value || 'active';

    if (!firstName || !lastName || !username) {
        showToast('First name, last name, and username are required', 'warning');
        return;
    }

    const data = {
        first_name: firstName,
        last_name: lastName,
        email: email,
        phone: phone,
        username: username,
        role: role,
        status: status,
        updated_at: new Date().toISOString(),
    };

    if (password && password.length >= 4) {
        data.password = password;
    } else if (password && password.length < 4) {
        showToast('Password must be at least 4 characters', 'warning');
        return;
    }

    // Check for duplicate username
    const existing = (state.teachers || []).find(u => u.username === username && u.id !== staffId);
    if (existing) {
        showToast('Username already exists', 'warning');
        return;
    }

    const result = await update('teachers', staffId, data);
    if (result) {
        closeModal('edit-staff-modal');
        await refreshTable('teachers');
        await logActivity(state.currentUser?.id, state.currentUser?.role, `Updated staff: ${firstName} ${lastName}`);
        showToast('✅ Staff member updated', 'success');
        refreshStaffList();
    } else {
        showToast('Failed to update staff member', 'error');
    }
}

// ──────────────────────────────────────────────────────────────────────
// DELETE STAFF
// ──────────────────────────────────────────────────────────────────────

async function deleteStaff(staffId) {
    const staff = state.teachers.find(u => u.id === staffId);
    if (!staff) return;

    if (!await confirmDialog(`Delete ${staff.first_name} ${staff.last_name}? This cannot be undone.`)) return;

    closeModal('edit-staff-modal');
    const result = await remove('teachers', staffId);
    if (result) {
        await refreshTable('teachers');
        await logActivity(state.currentUser?.id, state.currentUser?.role, `Deleted staff: ${staff.first_name} ${staff.last_name}`);
        showToast('✅ Staff member deleted', 'success');
        refreshStaffList();
    } else {
        showToast('Failed to delete staff member', 'error');
    }
}

// ──────────────────────────────────────────────────────────────────────
// TOGGLE STAFF STATUS
// ──────────────────────────────────────────────────────────────────────

async function toggleStaffStatus(staffId) {
    const staff = state.teachers.find(u => u.id === staffId);
    if (!staff) return;

    const newStatus = staff.status === 'inactive' ? 'active' : 'inactive';
    const action = newStatus === 'active' ? 'Activate' : 'Deactivate';

    if (!await confirmDialog(`${action} ${staff.first_name} ${staff.last_name}?`)) return;

    const result = await update('teachers', staffId, {
        status: newStatus,
        updated_at: new Date().toISOString(),
    });

    if (result) {
        await refreshTable('teachers');
        await logActivity(state.currentUser?.id, state.currentUser?.role, `${action}d staff: ${staff.first_name} ${staff.last_name}`);
        showToast(`✅ Staff member ${action}d`, 'success');
        refreshStaffList();
    } else {
        showToast(`Failed to ${action} staff member`, 'error');
    }
}

// ──────────────────────────────────────────────────────────────────────
// RESET STAFF PASSWORD
// ──────────────────────────────────────────────────────────────────────

function resetStaffPassword(staffId) {
    const staff = state.teachers.find(u => u.id === staffId);
    if (!staff) {
        showToast('Staff member not found', 'error');
        return;
    }

    showModal(`
        <div class="modal-overlay" id="reset-pw-modal">
            <div class="modal" style="max-width:400px;">
                <div class="modal-header">
                    <h3>🔑 Reset Password — ${esc(staff.first_name)} ${esc(staff.last_name)}</h3>
                    <button class="modal-close" onclick="window.closeModal('reset-pw-modal')">✕</button>
                </div>
                <div class="modal-body">
                    <div class="form-grid">
                        <div class="form-group full">
                            <label>New Password *</label>
                            <input type="password" id="rp-new" class="form-control" placeholder="Enter new password">
                        </div>
                        <div class="form-group full">
                            <label>Confirm Password *</label>
                            <input type="password" id="rp-confirm" class="form-control" placeholder="Confirm new password">
                        </div>
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-outline" onclick="window.closeModal('reset-pw-modal')">Cancel</button>
                    <button class="btn btn-primary" onclick="window._doResetPassword(${staffId})">🔑 Reset</button>
                </div>
            </div>
        </div>
    `);

    window._doResetPassword = doResetPassword;
}

// ──────────────────────────────────────────────────────────────────────
// DO RESET PASSWORD
// ──────────────────────────────────────────────────────────────────────

async function doResetPassword(staffId) {
    const newPw = document.getElementById('rp-new')?.value;
    const confirmPw = document.getElementById('rp-confirm')?.value;

    if (!newPw || newPw.length < 4) {
        showToast('Password must be at least 4 characters', 'warning');
        return;
    }

    if (newPw !== confirmPw) {
        showToast('Passwords do not match', 'warning');
        return;
    }

    const result = await update('teachers', staffId, {
        password: newPw,
        updated_at: new Date().toISOString(),
    });

    if (result) {
        closeModal('reset-pw-modal');
        await logActivity(state.currentUser?.id, state.currentUser?.role, `Reset password for staff ID ${staffId}`);
        showToast('✅ Password reset successfully', 'success');
    } else {
        showToast('Failed to reset password', 'error');
    }
}

// ──────────────────────────────────────────────────────────────────────
// REFRESH STAFF LIST
// ──────────────────────────────────────────────────────────────────────

async function refreshStaffList() {
    await refreshTable('teachers');
    filterStaffList();
    showToast('🔄 Staff list refreshed', 'info', 1500);
}

// ──────────────────────────────────────────────────────────────────────
// EXPORT STAFF
// ──────────────────────────────────────────────────────────────────────

function exportStaff() {
    const users = state.teachers || [];

    if (!users.length) {
        showToast('No staff to export', 'warning');
        return;
    }

    const data = users.map(u => ({
        'First Name': u.first_name || '',
        'Last Name': u.last_name || '',
        'Username': u.username || '',
        'Role': u.role || '',
        'Email': u.email || '',
        'Phone': u.phone || '',
        'Status': u.status !== 'inactive' ? 'Active' : 'Inactive',
        'Last Login': u.last_login ? fmtDateTime(u.last_login) : 'Never',
        'Created': fmtDateTime(u.created_at),
    }));

    exportToExcel(data, `Staff_Export_${new Date().toISOString().split('T')[0]}`);
    showToast('✅ Staff exported', 'success');
}