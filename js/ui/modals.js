/**
 * ECOLE LA FONTAINE — Modal System
 * Clean modal management with overlays
 * Last updated: 2026-06-28
 */

// ──────────────────────────────────────────────────────────────────────
// SHOW MODAL
// ──────────────────────────────────────────────────────────────────────

/**
 * Show a modal with HTML content
 * @param {string} html - Modal HTML content
 */
export function showModal(html) {
    const container = document.getElementById('modals-container');
    if (!container) return;
    container.innerHTML = html;

    // Auto-close on overlay click
    const overlay = container.querySelector('.modal-overlay');
    if (overlay) {
        overlay.addEventListener('click', function (e) {
            if (e.target === this) closeModal();
        });
    }

    // Prevent body scroll
    document.body.style.overflow = 'hidden';
}

/**
 * Close the current modal
 * @param {string} [modalId] - Optional modal ID to close
 */
export function closeModal(modalId = null) {
    const container = document.getElementById('modals-container');
    if (!container) return;

    if (modalId) {
        const modal = document.getElementById(modalId);
        if (modal) modal.remove();
    } else {
        container.innerHTML = '';
    }

    // Restore body scroll
    document.body.style.overflow = '';
}

// ──────────────────────────────────────────────────────────────────────
// CONFIRM DIALOG
// ──────────────────────────────────────────────────────────────────────

/**
 * Show a confirmation dialog
 * @param {string} message - Confirmation message
 * @param {string} title - Dialog title
 * @returns {Promise<boolean>} User's choice
 */
export function confirmDialog(message, title = 'Confirm') {
    return new Promise((resolve) => {
        const modalId = `confirm-modal-${Date.now()}`;
        const html = `
            <div class="modal-overlay" id="${modalId}">
                <div class="modal" style="max-width:420px;background:var(--bg-secondary);border-radius:12px;box-shadow:var(--shadow-xl);overflow:hidden;">
                    <div class="modal-header" style="padding:16px 20px;border-bottom:1px solid var(--border-light);display:flex;justify-content:space-between;align-items:center;">
                        <h3 style="margin:0;font-size:1rem;">⚠️ ${esc(title)}</h3>
                        <button class="modal-close" onclick="window.closeModal('${modalId}')" style="background:none;border:none;font-size:1.2rem;cursor:pointer;color:var(--text-muted);padding:4px;">✕</button>
                    </div>
                    <div class="modal-body" style="padding:20px;">
                        <p style="margin:0;font-size:0.95rem;color:var(--text-primary);">${esc(message)}</p>
                    </div>
                    <div class="modal-footer" style="padding:12px 20px;border-top:1px solid var(--border-light);display:flex;justify-content:flex-end;gap:8px;">
                        <button class="btn btn-outline" onclick="window.closeModal('${modalId}'); window._confirmResolve(false)" style="padding:8px 16px;border-radius:6px;border:1px solid var(--border-medium);background:transparent;cursor:pointer;font-size:0.85rem;">Cancel</button>
                        <button class="btn btn-danger" onclick="window.closeModal('${modalId}'); window._confirmResolve(true)" style="padding:8px 16px;border-radius:6px;border:none;background:var(--danger);color:#fff;cursor:pointer;font-size:0.85rem;">Confirm</button>
                    </div>
                </div>
            </div>
        `;

        showModal(html);
        window._confirmResolve = resolve;
    });
}

// ──────────────────────────────────────────────────────────────────────
// PROFILE & PASSWORD MODALS
// ──────────────────────────────────────────────────────────────────────

/**
 * Show the user profile modal
 */
export function showProfileModal() {
    const user = state?.currentUser;
    if (!user) return;

    const teacher = user.role !== 'admin'
        ? (state?.teachers || []).find(t => t.id === user.id)
        : null;

    const roleEmojis = { admin: '👨‍💼', accountant: '💰', teacher: '👩‍🏫' };

    showModal(`
        <div class="modal-overlay">
            <div class="modal" style="max-width:480px;background:var(--bg-secondary);border-radius:12px;box-shadow:var(--shadow-xl);overflow:hidden;">
                <div class="modal-header" style="padding:16px 20px;border-bottom:1px solid var(--border-light);display:flex;justify-content:space-between;align-items:center;">
                    <h3 style="margin:0;font-size:1rem;">👤 My Profile</h3>
                    <button class="modal-close" onclick="window.closeModal()" style="background:none;border:none;font-size:1.2rem;cursor:pointer;color:var(--text-muted);padding:4px;">✕</button>
                </div>
                <div class="modal-body" style="padding:20px;">
                    <div style="text-align:center;margin-bottom:16px;font-size:3rem;">${roleEmojis[user.role] || '👤'}</div>
                    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
                        <div><label style="font-size:0.75rem;color:var(--text-muted);display:block;font-weight:600;">Full Name</label><div style="font-weight:500;">${esc(user.name)}</div></div>
                        <div><label style="font-size:0.75rem;color:var(--text-muted);display:block;font-weight:600;">Username</label><div style="font-weight:500;">${esc(user.username || '')}</div></div>
                        <div><label style="font-size:0.75rem;color:var(--text-muted);display:block;font-weight:600;">Role</label><div style="font-weight:500;text-transform:capitalize;">${esc(user.role)}</div></div>
                        <div><label style="font-size:0.75rem;color:var(--text-muted);display:block;font-weight:600;">Email</label><div style="font-weight:500;">${esc(teacher?.email || user.email || '—')}</div></div>
                        ${teacher?.phone ? `<div style="grid-column:1/-1;"><label style="font-size:0.75rem;color:var(--text-muted);display:block;font-weight:600;">Phone</label><div style="font-weight:500;">${esc(teacher.phone)}</div></div>` : ''}
                    </div>
                </div>
                <div class="modal-footer" style="padding:12px 20px;border-top:1px solid var(--border-light);display:flex;justify-content:flex-end;gap:8px;">
                    <button class="btn btn-outline" onclick="window.closeModal()" style="padding:8px 16px;border-radius:6px;border:1px solid var(--border-medium);background:transparent;cursor:pointer;font-size:0.85rem;">Close</button>
                    <button class="btn btn-primary" onclick="window.closeModal(); window.showChangePasswordModal && window.showChangePasswordModal()" style="padding:8px 16px;border-radius:6px;border:none;background:var(--role-primary);color:#fff;cursor:pointer;font-size:0.85rem;">Change Password</button>
                </div>
            </div>
        </div>
    `);
}

/**
 * Show the change password modal
 */
export function showChangePasswordModal() {
    showModal(`
        <div class="modal-overlay">
            <div class="modal" style="max-width:420px;background:var(--bg-secondary);border-radius:12px;box-shadow:var(--shadow-xl);overflow:hidden;">
                <div class="modal-header" style="padding:16px 20px;border-bottom:1px solid var(--border-light);display:flex;justify-content:space-between;align-items:center;">
                    <h3 style="margin:0;font-size:1rem;">🔒 Change Password</h3>
                    <button class="modal-close" onclick="window.closeModal()" style="background:none;border:none;font-size:1.2rem;cursor:pointer;color:var(--text-muted);padding:4px;">✕</button>
                </div>
                <div class="modal-body" style="padding:20px;">
                    <div id="pw-error" style="display:none;background:var(--danger-bg);color:var(--danger);padding:10px;border-radius:6px;margin-bottom:12px;font-size:0.85rem;"></div>
                    <div style="margin-bottom:12px;">
                        <label style="font-size:0.8rem;font-weight:600;display:block;margin-bottom:4px;">Current Password</label>
                        <div style="display:flex;gap:8px;">
                            <input type="password" id="pw-current" placeholder="Current password" style="flex:1;padding:10px 12px;border-radius:6px;border:1px solid var(--border-medium);background:var(--bg-secondary);font-size:0.9rem;">
                            <button class="toggle-pw" onclick="this.previousElementSibling.type=this.previousElementSibling.type==='password'?'text':'password'" style="padding:8px 12px;border-radius:6px;border:1px solid var(--border-medium);background:transparent;cursor:pointer;">👁️</button>
                        </div>
                    </div>
                    <div style="margin-bottom:12px;">
                        <label style="font-size:0.8rem;font-weight:600;display:block;margin-bottom:4px;">New Password</label>
                        <div style="display:flex;gap:8px;">
                            <input type="password" id="pw-new" placeholder="New password (min 4 chars)" style="flex:1;padding:10px 12px;border-radius:6px;border:1px solid var(--border-medium);background:var(--bg-secondary);font-size:0.9rem;">
                            <button class="toggle-pw" onclick="this.previousElementSibling.type=this.previousElementSibling.type==='password'?'text':'password'" style="padding:8px 12px;border-radius:6px;border:1px solid var(--border-medium);background:transparent;cursor:pointer;">👁️</button>
                        </div>
                    </div>
                    <div>
                        <label style="font-size:0.8rem;font-weight:600;display:block;margin-bottom:4px;">Confirm New Password</label>
                        <div style="display:flex;gap:8px;">
                            <input type="password" id="pw-confirm" placeholder="Repeat new password" style="flex:1;padding:10px 12px;border-radius:6px;border:1px solid var(--border-medium);background:var(--bg-secondary);font-size:0.9rem;">
                            <button class="toggle-pw" onclick="this.previousElementSibling.type=this.previousElementSibling.type==='password'?'text':'password'" style="padding:8px 12px;border-radius:6px;border:1px solid var(--border-medium);background:transparent;cursor:pointer;">👁️</button>
                        </div>
                    </div>
                </div>
                <div class="modal-footer" style="padding:12px 20px;border-top:1px solid var(--border-light);display:flex;justify-content:flex-end;gap:8px;">
                    <button class="btn btn-outline" onclick="window.closeModal()" style="padding:8px 16px;border-radius:6px;border:1px solid var(--border-medium);background:transparent;cursor:pointer;font-size:0.85rem;">Cancel</button>
                    <button class="btn btn-primary" onclick="window.submitChangePassword()" style="padding:8px 16px;border-radius:6px;border:none;background:var(--role-primary);color:#fff;cursor:pointer;font-size:0.85rem;">Update Password</button>
                </div>
            </div>
        </div>
    `);
}

// ──────────────────────────────────────────────────────────────────────
// SUBMIT CHANGE PASSWORD
// ──────────────────────────────────────────────────────────────────────

export async function submitChangePassword() {
    const cur = document.getElementById('pw-current')?.value;
    const nw = document.getElementById('pw-new')?.value;
    const conf = document.getElementById('pw-confirm')?.value;
    const errEl = document.getElementById('pw-error');
    const showErr = msg => { if (errEl) { errEl.textContent = msg; errEl.style.display = 'block'; } };

    if (!cur || !nw || !conf) return showErr('All fields are required');
    if (nw !== conf) return showErr('New passwords do not match');
    if (nw.length < 4) return showErr('Password must be at least 4 characters');
    if (nw === cur) return showErr('New password must differ from current');

    const result = await changePassword(cur, nw);
    if (!result.ok) return showErr(result.error);

    showToast('Password updated! Logging out...', 'success');
    closeModal();
    setTimeout(logout, 1500);
}

// ──────────────────────────────────────────────────────────────────────
// EXPOSE GLOBALLY
// ──────────────────────────────────────────────────────────────────────

window.showModal = showModal;
window.closeModal = closeModal;
window.confirmDialog = confirmDialog;
window.showProfileModal = showProfileModal;
window.showChangePasswordModal = showChangePasswordModal;
window.submitChangePassword = submitChangePassword;