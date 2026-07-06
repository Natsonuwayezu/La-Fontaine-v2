/**
 * ECOLE LA FONTAINE — School Settings
 * School information, logo upload, report card settings, security, academic year
 * Last updated: 2026-07-03
 * 
 * CHANGES:
 * - Added Academic Year settings section
 * - Can set active academic year from settings
 * - Can set current term from settings
 * - Auto-refreshes data when year/term changes
 * - Prevents changes to inactive years where appropriate
 */


import {
    state,
    getCurrentUser,
    getCurrentAcademicYear,
    getCurrentTerm,
    getTermsByYear,
    updateState,
    setYearFilter
} from '../../core/state.js';
import { esc } from '../../core/utils.js';
import {
    updateSchoolSetting,
    getSchoolSettings,
    logActivity,
    update,
    get,
    getAll
} from '../../core/api.js';
import { refreshYearData } from '../../core/boot.js';

// ──────────────────────────────────────────────────────────────────────
// MAIN RENDER FUNCTION
// ──────────────────────────────────────────────────────────────────────

export async function renderSchoolSettings(container) {
    if (!container) return;

    const user = getCurrentUser();
    if (user?.role !== 'admin') {
        container.innerHTML = '<div class="alert alert-danger">Access denied. Admin privileges required.</div>';
        return;
    }

    await ensureStateLoaded();

    const settings = state.schoolSettings || {};
    const currentYear = getCurrentAcademicYear();
    const currentTerm = getCurrentTerm();
    const years = (state.academicYears || []).sort((a, b) => b.id - a.id);
    const terms = getTermsByYear(currentYear?.id);

    const logoPreview = settings.school_logo
        ? (settings.school_logo.startsWith('data:') || settings.school_logo.startsWith('http')
            ? `<img src="${settings.school_logo}" style="max-width:80px;max-height:80px;border-radius:8px;object-fit:contain;">`
            : `<span style="font-size:48px;">${settings.school_logo}</span>`)
        : '<span style="font-size:48px;">🏫</span>';

    container.innerHTML = `
        <div class="dash-card">
            <div class="dash-card-header">
                <span class="dash-card-title">🏫 School Settings</span>
                <button class="btn btn-sm btn-success" onclick="window._saveSchoolSettings()">💾 Save All</button>
            </div>
            <div class="dash-card-body">
                <!-- School Information -->
                <h4 style="margin-bottom:12px;">🏫 School Information</h4>
                <div class="form-grid">
                    <div class="form-group">
                        <label>School Name</label>
                        <input type="text" id="setting-school-name" class="form-control" value="${esc(settings.school_name || 'ECOLE LA FONTAINE')}">
                    </div>
                    <div class="form-group">
                        <label>School Motto</label>
                        <input type="text" id="setting-motto" class="form-control" value="${esc(settings.school_motto || 'We Excell')}">
                    </div>
                    <div class="form-group">
                        <label>Location / Address</label>
                        <input type="text" id="setting-location" class="form-control" value="${esc(settings.school_location || settings.school_address || 'Rubavu, Rwanda')}">
                    </div>
                    <div class="form-group">
                        <label>Phone Number</label>
                        <input type="text" id="setting-phone" class="form-control" value="${esc(settings.school_phone || '+250788534320')}">
                    </div>
                    <div class="form-group">
                        <label>Email Address</label>
                        <input type="email" id="setting-email" class="form-control" value="${esc(settings.school_email || 'info@ecolelafontaine.rw')}">
                    </div>
                    <div class="form-group">
                        <label>Website</label>
                        <input type="text" id="setting-website" class="form-control" value="${esc(settings.school_website || 'www.ecolelafontaine.rw')}">
                    </div>
                    <div class="form-group">
                        <label>PO Box</label>
                        <input type="text" id="setting-pobox" class="form-control" value="${esc(settings.school_pobox || 'Box 123, Rubavu')}">
                    </div>
                    <div class="form-group">
                        <label>Head Teacher Name</label>
                        <input type="text" id="setting-head-teacher" class="form-control" value="${esc(settings.head_teacher || settings.report_footer_line2 || 'UWAYO GANZA Eugene')}">
                    </div>
                </div>

                <!-- Academic Year Settings -->
                <h4 style="margin:20px 0 12px;">📅 Academic Year Settings</h4>
                <div class="form-grid">
                    <div class="form-group">
                        <label>Active Academic Year</label>
                        <select id="setting-academic-year" class="form-control" onchange="window._onAcademicYearChange(this.value)">
                            ${years.map(y => `
                                <option value="${y.id}" ${y.id === currentYear?.id ? 'selected' : ''}>
                                    ${esc(y.name)} ${y.is_active ? '🟢' : '📦'}
                                </option>
                            `).join('')}
                            ${!years.length ? '<option value="">— No years defined —</option>' : ''}
                        </select>
                        <small class="field-hint">Changing the academic year will reload all data.</small>
                    </div>
                    <div class="form-group">
                        <label>Current Term</label>
                        <select id="setting-term" class="form-control" ${!currentYear ? 'disabled' : ''}>
                            ${terms.map(t => `
                                <option value="${t.id}" ${t.id === currentTerm?.id ? 'selected' : ''}>
                                    ${esc(t.name)} ${t.id === currentTerm?.id ? '🟢' : ''}
                                </option>
                            `).join('')}
                            ${!terms.length ? '<option value="">— No terms defined —</option>' : ''}
                        </select>
                        <small class="field-hint">Select the currently active term for the selected academic year.</small>
                    </div>
                    <div class="form-group" style="grid-column:1/-1;">
                        <div style="background:var(--bg-tertiary);padding:8px 12px;border-radius:6px;font-size:0.8rem;color:var(--text-muted);">
                            📌 <strong>${currentYear ? esc(currentYear.name) : 'No active year'}</strong>
                            ${currentYear?.is_active ? '🟢 Active' : '🔒 Inactive'}
                            ${currentTerm ? `· ${esc(currentTerm.name)}` : ''}
                            ${currentYear && !currentYear.is_active ? '<br>⚠️ This year is inactive. Switch to an active year to make changes.' : ''}
                        </div>
                    </div>
                </div>

                <!-- Logo -->
                <h4 style="margin:20px 0 12px;">📷 School Logo</h4>
                <div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap;">
                    <div id="logo-preview" style="width:80px;height:80px;background:var(--bg-tertiary);border-radius:12px;display:flex;align-items:center;justify-content:center;overflow:hidden;border:1px solid var(--border-light);">
                        ${logoPreview}
                    </div>
                    <div>
                        <input type="file" id="setting-logo-file" accept="image/*" style="display:none;" onchange="window._previewSchoolLogo(this)">
                        <button class="btn btn-sm btn-outline" onclick="document.getElementById('setting-logo-file').click()">📤 Upload Logo</button>
                        <button class="btn btn-sm btn-outline" onclick="window._removeSchoolLogo()">🗑️ Remove</button>
                        <input type="hidden" id="setting-logo-data" value="${esc(settings.school_logo || '🏫')}">
                        <small class="field-hint" style="display:block;margin-top:4px;">Upload PNG, JPG, or GIF (max 2MB)</small>
                    </div>
                </div>

                <!-- Report Card Settings -->
                <h4 style="margin:20px 0 12px;">📄 Report Card Settings</h4>
                <div class="form-grid">
                    <div class="form-group full">
                        <label>Report Footer Line 1</label>
                        <input type="text" id="setting-footer-line1" class="form-control" value="${esc(settings.report_footer_line1 || 'Done at ECOLE LA FONTAINE')}">
                    </div>
                    <div class="form-group full">
                        <label>Report Footer Line 2 (Head Teacher)</label>
                        <input type="text" id="setting-footer-line2" class="form-control" value="${esc(settings.report_footer_line2 || 'UWAYO GANZA Eugene')}">
                    </div>
                    <div class="form-group">
                        <label>Head Teacher Title</label>
                        <input type="text" id="setting-head-title" class="form-control" value="${esc(settings.head_teacher_title || 'THE SCHOOL HEADTEACHER')}">
                    </div>
                    <div class="form-group">
                        <label>Default Pass Mark (%)</label>
                        <input type="number" id="setting-pass-mark" class="form-control" value="${settings.pass_mark || 50}" min="0" max="100">
                    </div>
                    <div class="form-group">
                        <label>Promotion Mark (%)</label>
                        <input type="number" id="setting-promotion-mark" class="form-control" value="${settings.promotion_mark || settings.pass_mark || 50}" min="0" max="100">
                    </div>
                </div>

                <!-- Security Settings -->
                <h4 style="margin:20px 0 12px;">🔐 Security Settings</h4>
                <div class="form-grid">
                    <div class="form-group">
                        <label>Admin Password</label>
                        <input type="password" id="setting-admin-pw" class="form-control" placeholder="Change password (leave blank to keep current)">
                    </div>
                    <div class="form-group">
                        <label>Confirm Password</label>
                        <input type="password" id="setting-admin-pw-confirm" class="form-control" placeholder="Confirm new password">
                    </div>
                    <div class="form-group">
                        <label>Session Timeout (minutes)</label>
                        <input type="number" id="setting-session-timeout" class="form-control" value="${settings.session_timeout || 30}" min="5" max="120">
                    </div>
                </div>
                <div style="margin-top:12px;font-size:0.8rem;color:var(--text-muted);">
                    ⚠️ Changing the admin password will log you out. You'll need to login with the new password.
                </div>
            </div>
        </div>
    `;

    // Register window functions
    window._saveSchoolSettings = saveSchoolSettings;
    window._previewSchoolLogo = previewSchoolLogo;
    window._removeSchoolLogo = removeSchoolLogo;
    window._onAcademicYearChange = onAcademicYearChange;
}

// ──────────────────────────────────────────────────────────────────────
// ON ACADEMIC YEAR CHANGE
// ──────────────────────────────────────────────────────────────────────

async function onAcademicYearChange(yearId) {
    if (!yearId) return;

    const year = (state.academicYears || []).find(y => y.id == yearId);
    if (!year) return;

    // Update the active year in database
    await updateWhere('academic_years', 'is_active=eq.true', { is_active: false });
    await update('academic_years', yearId, { is_active: true });

    // Refresh state
    await refreshYearData(yearId);

    // Update state
    state.currentAcadYear = year;
    setYearFilter(yearId);

    // Update terms dropdown
    const terms = getTermsByYear(yearId);
    const termSelect = document.getElementById('setting-term');
    if (termSelect) {
        termSelect.innerHTML = terms.map(t => `
            <option value="${t.id}">${esc(t.name)}</option>
        `).join('');
        if (terms.length) {
            termSelect.value = terms[0]?.id || '';
        }
    }

    // Update topbar
    updateTopbarYearAndTerm();

    // Log activity
    await logActivity(
        state.currentUser?.id,
        state.currentUser?.role,
        `Changed academic year to ${year.name}`,
        'settings',
        yearId
    );

    showToast(`📅 Switched to ${year.name}`, 'success');
    navigateTo('school-settings');
}

// ──────────────────────────────────────────────────────────────────────
// SAVE SCHOOL SETTINGS
// ──────────────────────────────────────────────────────────────────────

async function saveSchoolSettings() {
    const fields = [
        { id: 'school-name', key: 'school_name' },
        { id: 'motto', key: 'school_motto' },
        { id: 'location', key: 'school_location' },
        { id: 'phone', key: 'school_phone' },
        { id: 'email', key: 'school_email' },
        { id: 'website', key: 'school_website' },
        { id: 'pobox', key: 'school_pobox' },
        { id: 'head-teacher', key: 'head_teacher' },
        { id: 'footer-line1', key: 'report_footer_line1' },
        { id: 'footer-line2', key: 'report_footer_line2' },
        { id: 'head-title', key: 'head_teacher_title' },
        { id: 'pass-mark', key: 'pass_mark' },
        { id: 'promotion-mark', key: 'promotion_mark' },
        { id: 'session-timeout', key: 'session_timeout' },
    ];

    for (const f of fields) {
        const el = document.getElementById(`setting-${f.id}`);
        if (el) await updateSchoolSetting(f.key, el.value);
    }

    // Save current term
    const termSelect = document.getElementById('setting-term');
    if (termSelect && termSelect.value) {
        const term = (state.terms || []).find(t => t.id == termSelect.value);
        if (term) {
            await updateSchoolSetting('current_term', term.name);
            state.currentTerm = term;
        }
    }

    // Logo
    const logoData = document.getElementById('setting-logo-data')?.value;
    if (logoData && logoData !== '🏫') {
        await updateSchoolSetting('school_logo', logoData);
        applySchoolLogo(logoData);
    }

    // Password
    const newPw = document.getElementById('setting-admin-pw')?.value;
    const confirmPw = document.getElementById('setting-admin-pw-confirm')?.value;
    if (newPw && newPw.length >= 4) {
        if (newPw !== confirmPw) {
            showToast('Passwords do not match', 'error');
            return;
        }
        await updateSchoolSetting('admin_password', newPw);
        showToast('✅ Password updated. You will be logged out.', 'success');
        setTimeout(logout, 2000);
        return;
    }

    // Refresh settings
    state.schoolSettings = await getSchoolSettings();

    // Update sidebar logo
    applyLogoEverywhere();

    // Update topbar
    updateTopbarYearAndTerm();

    // Log activity
    await logActivity(
        state.currentUser?.id,
        state.currentUser?.role,
        'Updated school settings',
        'settings'
    );

    showToast('✅ School settings saved successfully', 'success');
}

// ──────────────────────────────────────────────────────────────────────
// PREVIEW SCHOOL LOGO
// ──────────────────────────────────────────────────────────────────────

function previewSchoolLogo(input) {
    const file = input?.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
        showToast('Logo too large. Max 2MB.', 'error');
        return;
    }

    const reader = new FileReader();
    reader.onload = function (e) {
        const preview = document.getElementById('logo-preview');
        if (preview) {
            preview.innerHTML = `<img src="${e.target.result}" style="width:100%;height:100%;object-fit:contain;">`;
        }
        document.getElementById('setting-logo-data').value = e.target.result;
        showToast('✅ Logo preview updated. Save settings to apply.', 'success', 3000);
    };
    reader.readAsDataURL(file);
}

// ──────────────────────────────────────────────────────────────────────
// REMOVE SCHOOL LOGO
// ──────────────────────────────────────────────────────────────────────

function removeSchoolLogo() {
    const preview = document.getElementById('logo-preview');
    if (preview) {
        preview.innerHTML = '<span style="font-size:48px;">🏫</span>';
    }
    document.getElementById('setting-logo-data').value = '🏫';
    showToast('✅ Logo removed. Save settings to apply.', 'success', 3000);
}

// ──────────────────────────────────────────────────────────────────────
// HELPER FUNCTIONS
// ──────────────────────────────────────────────────────────────────────

function showToast(message, type = 'info', duration = 3500) {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `<span class="toast-icon">${icons[type] || 'ℹ️'}</span><span class="toast-message">${esc(message)}</span>`;
    container.appendChild(toast);
    setTimeout(() => { toast.classList.add('hiding'); setTimeout(() => toast.remove(), 300); }, duration);
}

function applySchoolLogo(logoData) {
    if (!logoData) return;
    document.querySelectorAll('.sidebar-logo, .report-logo, .print-logo').forEach(el => {
        if (logoData.startsWith('data:image') || logoData.startsWith('http')) {
            el.innerHTML = `<img src="${logoData}" style="width:100%;height:100%;object-fit:cover;">`;
        } else {
            el.innerHTML = logoData;
        }
    });
}

function applyLogoEverywhere() {
    const logo = state.schoolSettings?.school_logo || '';
    if (!logo) return;
    applySchoolLogo(logo);
}

function updateTopbarYearAndTerm() {
    const yearEl = document.getElementById('prog-acad-year');
    if (yearEl && state.currentAcadYear) {
        yearEl.textContent = state.currentAcadYear.name;
    }
    const termEl = document.getElementById('prog-term-name');
    if (termEl && state.currentTerm) {
        termEl.textContent = state.currentTerm.name;
    }
}

function logout() {
    localStorage.removeItem('elf_user');
    localStorage.removeItem('elf_expiry');
    window.location.reload();
}

async function ensureStateLoaded() {
    if (!state.classes || !state.classes.length) {
        const fn = window.loadInitialData || (async () => {});
        await fn(false);
    }
}

function navigateTo(module) {
    if (typeof window.navigateTo === 'function') {
        window.navigateTo(module);
    } else {
        window.location.hash = module;
    }
}

async function updateWhere(table, filter, data) {
    const updateWhere = window.updateWhere || window.update || (async () => {});
    return updateWhere(table, filter, data);
}

async function _localUpdate(table, id, data) {
    const update = window.update || (async () => {});
    return _localUpdate(table, id, data);
}

// Export functions to window
window._saveSchoolSettings = saveSchoolSettings;
window._previewSchoolLogo = previewSchoolLogo;
window._removeSchoolLogo = removeSchoolLogo;
window._onAcademicYearChange = onAcademicYearChange;