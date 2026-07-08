/**
 * ECOLE LA FONTAINE — Family Management Module
 * Create, edit, delete families; link/unlink students; sibling discounts
 * Last updated: 2026-06-29
 */



const ensureStateLoaded = window.ensureStateLoaded || (async () => {}); // global from boot.js
import { state, getClassById, getCurrentUser, isAdmin } from '../../core/state.js';
import { esc, fmtDate, fmtCurrency } from '../../core/utils.js';
import { getFullStudentBalance } from '../../core/fees.js';
import { insert, update, remove, getAll } from '../../core/api.js';
import { notifyAction } from '../../core/notifications.js';
import { ensureStateLoaded } from '../../core/boot.js';

// ──────────────────────────────────────────────────────────────────────
// MAIN RENDER FUNCTION
// ──────────────────────────────────────────────────────────────────────

export async function renderFamilyManagement(container) {
    if (!container) return;

    const user = getCurrentUser();
    if (user?.role !== 'admin') {
        container.innerHTML = '<div class="alert alert-danger">Access denied. Admin privileges required.</div>';
        return;
    }

    await ensureStateLoaded();

    const families = state.families || [];
    const students = state.students || [];

    // Detect potential siblings (unlinked students with same guardian name)
    const unlinkedStudents = students.filter(s => !s.family_id && s.status === 'Active');
    const guardianMap = new Map();
    for (const s of unlinkedStudents) {
        const key = (s.guardian_name || '').toLowerCase().trim();
        if (key) {
            if (!guardianMap.has(key)) guardianMap.set(key, []);
            guardianMap.get(key).push(s);
        }
    }
    const potentialSiblings = Array.from(guardianMap.values()).filter(g => g.length > 1);

    container.innerHTML = `
        <div class="dash-card">
            <div class="dash-card-header">
                <span class="dash-card-title">👨‍👩‍👧 Family Management</span>
                <div class="btn-group">
                    <button class="btn btn-sm btn-primary" onclick="window._openCreateFamily()">➕ Create Family</button>
                    <button class="btn btn-sm btn-outline" onclick="window._refreshFamilies()">🔄 Refresh</button>
                    <button class="btn btn-sm btn-outline" onclick="window._exportFamilies()">📥 Export</button>
                </div>
            </div>
            <div class="dash-card-body">
                <div class="tabs" style="display:flex;gap:2px;border-bottom:2px solid var(--border-light);margin-bottom:16px;">
                    <button class="tab-btn active" onclick="window._switchFamilyTab('families', event)">🏠 Families (${families.length})</button>
                    <button class="tab-btn" onclick="window._switchFamilyTab('unlinked', event)">📋 Unlinked (${unlinkedStudents.length})</button>
                    ${potentialSiblings.length > 0 ? `<button class="tab-btn" onclick="window._switchFamilyTab('auto', event)">🔍 Auto-Detect (${potentialSiblings.length})</button>` : ''}
                </div>

                <!-- Families Tab -->
                <div id="families-tab">
                    <div class="filters-bar" style="display:flex;gap:8px;margin-bottom:12px;">
                        <input type="text" id="family-search" placeholder="🔍 Search family code or guardian..." oninput="window._filterFamilies()" style="padding:6px 10px;border-radius:6px;border:1px solid var(--border-medium);flex:1;">
                        <span class="result-count" id="family-count" style="align-self:center;font-size:0.8rem;color:var(--text-muted);"></span>
                    </div>
                    <div class="table-wrapper">
                        <table class="data-table" style="font-size:0.8rem;">
                            <thead>
                                <tr>
                                    <th>Family Code</th>
                                    <th>Guardian Name</th>
                                    <th>Phone</th>
                                    <th>Students</th>
                                    <th style="text-align:right;">Discount</th>
                                    <th style="text-align:center;">Actions</th>
                                </tr>
                            </thead>
                            <tbody id="family-tbody">
                                <tr><td colspan="6" style="text-align:center;padding:40px;color:var(--text-muted);">Loading...</td></tr>
                            </tbody>
                        </table>
                    </div>
                </div>

                <!-- Unlinked Tab -->
                <div id="unlinked-tab" style="display:none;">
                    <div class="filters-bar" style="display:flex;gap:8px;margin-bottom:12px;">
                        <input type="text" id="unlinked-search" placeholder="🔍 Search unlinked students..." oninput="window._filterUnlinked()" style="padding:6px 10px;border-radius:6px;border:1px solid var(--border-medium);flex:1;">
                        <span class="result-count" id="unlinked-count" style="align-self:center;font-size:0.8rem;color:var(--text-muted);"></span>
                    </div>
                    <div class="table-wrapper">
                        <table class="data-table" style="font-size:0.8rem;">
                            <thead>
                                <tr>
                                    <th style="width:40px;"><input type="checkbox" id="select-all-unlinked" onchange="window._toggleSelectAllUnlinked()"></th>
                                    <th>Student</th>
                                    <th>Class</th>
                                    <th>Guardian</th>
                                    <th>Phone</th>
                                    <th style="text-align:center;">Action</th>
                                </tr>
                            </thead>
                            <tbody id="unlinked-tbody">
                                <tr><td colspan="6" style="text-align:center;padding:40px;color:var(--text-muted);">Loading...</td></tr>
                            </tbody>
                        </table>
                    </div>
                    <div class="btn-group" style="margin-top:12px;">
                        <button class="btn btn-primary" onclick="window._bulkLinkStudents()">🔗 Link Selected</button>
                    </div>
                </div>

                <!-- Auto-Detect Tab -->
                ${potentialSiblings.length > 0 ? `
                    <div id="auto-tab" style="display:none;">
                        <div class="alert alert-info" style="font-size:0.85rem;">🔍 Detected ${potentialSiblings.length} groups of students with the same guardian name.</div>
                        <div id="auto-groups-container">
                            ${potentialSiblings.map((group, idx) => `
                                <div class="dash-card" style="margin-bottom:8px;border:1px solid var(--border-light);border-radius:var(--r-md);overflow:hidden;">
                                    <div class="dash-card-header" style="padding:8px 12px;background:var(--bg-tertiary);display:flex;justify-content:space-between;align-items:center;">
                                        <span><strong>${esc(group[0].guardian_name)}</strong> (${group.length} students)</span>
                                        <button class="btn btn-sm btn-primary" onclick="window._createFamilyFromGroup('${group.map(s => s.id).join(',')}')">🏠 Create Family</button>
                                    </div>
                                    <div class="dash-card-body" style="padding:8px 12px;">
                                        ${group.map(s => {
        const cls = getClassById(s.class_id);
        return `<div style="display:flex;gap:16px;padding:4px 0;border-bottom:1px solid var(--border-light);font-size:0.85rem;">
                                                <span><strong>${esc(s.first_name)} ${esc(s.last_name)}</strong></span>
                                                <span style="color:var(--text-muted);">${esc(cls?.name || '—')}</span>
                                                <span style="color:var(--text-muted);">${esc(s.student_code || '')}</span>
                                            </div>`;
    }).join('')}
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                ` : ''}
            </div>
        </div>
    `;

    window._switchFamilyTab = switchFamilyTab;
    window._filterFamilies = filterFamilies;
    window._filterUnlinked = filterUnlinked;
    window._toggleSelectAllUnlinked = toggleSelectAllUnlinked;
    window._bulkLinkStudents = bulkLinkStudents;
    window._openCreateFamily = openCreateFamily;
    window._createFamilyFromGroup = createFamilyFromGroup;
    window._editFamily = editFamily;
    window._deleteFamily = deleteFamily;
    window._unlinkStudent = unlinkStudent;
    window._refreshFamilies = refreshFamilies;
    window._exportFamilies = exportFamilies;

    await filterFamilies();
    await renderUnlinked();
}

// ──────────────────────────────────────────────────────────────────────
// SWITCH FAMILY TAB
// ──────────────────────────────────────────────────────────────────────

function switchFamilyTab(tabName, event) {
    ['families', 'unlinked', 'auto'].forEach(t => {
        const el = document.getElementById(`${t}-tab`);
        if (el) el.style.display = t === tabName ? 'block' : 'none';
    });
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    if (event?.target) event.target.classList.add('active');
}

// ──────────────────────────────────────────────────────────────────────
// FILTER FAMILIES
// ──────────────────────────────────────────────────────────────────────

function filterFamilies() {
    const tbody = document.getElementById('family-tbody');
    if (!tbody) return;

    const search = (document.getElementById('family-search')?.value || '').toLowerCase();
    const families = (state.families || []);

    const filtered = families.filter(f =>
        (f.family_code || '').toLowerCase().includes(search) ||
        (f.guardian_name || '').toLowerCase().includes(search) ||
        (f.guardian_phone || '').includes(search)
    );

    const countEl = document.getElementById('family-count');
    if (countEl) countEl.textContent = `${filtered.length} famil${filtered.length !== 1 ? 'ies' : 'y'}`;

    if (!filtered.length) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:40px;color:var(--text-muted);">No families found</td></tr>';
        return;
    }

    tbody.innerHTML = filtered.map(f => {
        const members = (state.students || []).filter(s => s.family_id === f.id && s.status === 'Active');
        return `
            <tr>
                <td><code><strong>${esc(f.family_code)}</strong></code></td>
                <td>${esc(f.guardian_name || '—')}</td>
                <td>${esc(f.guardian_phone || '—')}</td>
                <td style="text-align:center;">${members.length}</td>
                <td style="text-align:right;">${fmtCurrency(f.discount_amount || 0)}</td>
                <td style="text-align:center;">
                    <button class="btn btn-sm btn-outline" onclick="window._editFamily(${f.id})" style="padding:2px 6px;font-size:0.7rem;">✏️</button>
                    <button class="btn btn-sm btn-danger" onclick="window._deleteFamily(${f.id})" style="padding:2px 6px;font-size:0.7rem;">🗑️</button>
                </td>
            </tr>
        `;
    }).join('');
}

// ──────────────────────────────────────────────────────────────────────
// RENDER UNLINKED STUDENTS
// ──────────────────────────────────────────────────────────────────────

function renderUnlinked() {
    const tbody = document.getElementById('unlinked-tbody');
    if (!tbody) return;

    const search = (document.getElementById('unlinked-search')?.value || '').toLowerCase();
    let students = (state.students || []).filter(s => !s.family_id && s.status === 'Active');

    if (search) {
        students = students.filter(s =>
            (s.first_name || '').toLowerCase().includes(search) ||
            (s.last_name || '').toLowerCase().includes(search) ||
            (s.student_code || '').toLowerCase().includes(search) ||
            (s.guardian_name || '').toLowerCase().includes(search)
        );
    }

    students.sort((a, b) => a.last_name.localeCompare(b.last_name));

    const countEl = document.getElementById('unlinked-count');
    if (countEl) countEl.textContent = `${students.length} student${students.length !== 1 ? 's' : ''}`;

    if (!students.length) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:40px;color:var(--text-muted);">No unlinked students found</td></tr>';
        return;
    }

    tbody.innerHTML = students.map(s => {
        const cls = getClassById(s.class_id);
        return `
            <tr>
                <td><input type="checkbox" class="unlinked-cb" value="${s.id}"></td>
                <td><strong>${esc(s.first_name)} ${esc(s.last_name)}</strong></td>
                <td>${esc(cls?.name || '—')}</td>
                <td>${esc(s.guardian_name || '—')}</td>
                <td>${esc(s.guardian_phone || '—')}</td>
                <td style="text-align:center;">
                    <button class="btn btn-sm btn-primary" onclick="window._linkStudentToFamily(${s.id})" style="padding:2px 8px;font-size:0.7rem;">🔗 Link</button>
                </td>
            </tr>
        `;
    }).join('');
}

// ──────────────────────────────────────────────────────────────────────
// FILTER UNLINKED
// ──────────────────────────────────────────────────────────────────────

function filterUnlinked() {
    renderUnlinked();
}

// ──────────────────────────────────────────────────────────────────────
// TOGGLE SELECT ALL UNLINKED
// ──────────────────────────────────────────────────────────────────────

function toggleSelectAllUnlinked() {
    const checked = document.getElementById('select-all-unlinked')?.checked || false;
    document.querySelectorAll('.unlinked-cb').forEach(cb => cb.checked = checked);
}

// ──────────────────────────────────────────────────────────────────────
// BULK LINK STUDENTS
// ──────────────────────────────────────────────────────────────────────

async function bulkLinkStudents() {
    const selected = [...document.querySelectorAll('.unlinked-cb:checked')];
    if (!selected.length) {
        showToast('No students selected', 'warning');
        return;
    }

    // Create new family or select existing
    const familyCode = prompt(`Create a new family for ${selected.length} student(s)?\nEnter family code:`, `FAM-${Date.now().toString().slice(-6)}`);
    if (!familyCode) return;

    const guardianName = prompt('Guardian name for this family:') || 'Family';

    const newFamily = await insert('families', {
        family_code: familyCode.toUpperCase(),
        guardian_name: guardianName,
        created_at: new Date().toISOString(),
    });

    if (!newFamily) {
        showToast('Failed to create family', 'error');
        return;
    }

    let linked = 0;
    for (const cb of selected) {
        const studentId = parseInt(cb.value);
        const result = await update('students', studentId, {
            family_id: newFamily.id,
            updated_at: new Date().toISOString(),
        });
        if (result) linked++;
    }

    await refreshTable('students');
    await refreshTable('families');
    showToast(`✅ Created family ${familyCode} with ${linked} students`, 'success');
    await renderUnlinked();
    await filterFamilies();
}

// ──────────────────────────────────────────────────────────────────────
// LINK STUDENT TO FAMILY
// ──────────────────────────────────────────────────────────────────────

async function linkStudentToFamily(studentId) {
    const student = getStudentById(studentId);
    if (!student) return;

    const families = state.families || [];
    if (!families.length) {
        showToast('No families exist. Create a family first.', 'warning');
        return;
    }

    const modalHtml = `
        <div class="modal-overlay" id="link-student-modal">
            <div class="modal" style="max-width:400px;">
                <div class="modal-header">
                    <h3>🔗 Link Student to Family</h3>
                    <button class="modal-close" onclick="window.closeModal('link-student-modal')">✕</button>
                </div>
                <div class="modal-body">
                    <p><strong>${esc(student.first_name)} ${esc(student.last_name)}</strong></p>
                    <div class="form-group">
                        <label>Select Family</label>
                        <select id="link-family-select" style="padding:8px 12px;border-radius:6px;border:1px solid var(--border-medium);width:100%;">
                            ${families.map(f => `<option value="${f.id}">${esc(f.family_code)} — ${esc(f.guardian_name || 'No guardian')}</option>`).join('')}
                        </select>
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-outline" onclick="window.closeModal('link-student-modal')">Cancel</button>
                    <button class="btn btn-primary" onclick="window._confirmLinkStudent(${studentId})">🔗 Link</button>
                </div>
            </div>
        </div>
    `;

    showModal(modalHtml);
}

// ──────────────────────────────────────────────────────────────────────
// CONFIRM LINK STUDENT
// ──────────────────────────────────────────────────────────────────────

window._confirmLinkStudent = async function (studentId) {
    const familyId = document.getElementById('link-family-select')?.value;
    if (!familyId) {
        showToast('Select a family', 'warning');
        return;
    }

    const result = await update('students', studentId, {
        family_id: parseInt(familyId),
        updated_at: new Date().toISOString(),
    });

    if (result) {
        closeModal('link-student-modal');
        showToast('✅ Student linked to family', 'success');
        await refreshTable('students');
        await renderUnlinked();
        await filterFamilies();
    } else {
        showToast('Failed to link student', 'error');
    }
};

// ──────────────────────────────────────────────────────────────────────
// OPEN CREATE FAMILY
// ──────────────────────────────────────────────────────────────────────

function openCreateFamily() {
    const modalHtml = `
        <div class="modal-overlay" id="create-family-modal">
            <div class="modal" style="max-width:450px;">
                <div class="modal-header">
                    <h3>➕ Create Family</h3>
                    <button class="modal-close" onclick="window.closeModal('create-family-modal')">✕</button>
                </div>
                <div class="modal-body">
                    <div class="form-grid">
                        <div class="form-group" style="grid-column:1/-1;">
                            <label>Family Code *</label>
                            <input type="text" id="cf-code" placeholder="e.g., FAM-001" style="padding:8px 12px;border-radius:6px;border:1px solid var(--border-medium);width:100%;">
                        </div>
                        <div class="form-group" style="grid-column:1/-1;">
                            <label>Guardian Name</label>
                            <input type="text" id="cf-guardian" placeholder="Guardian name" style="padding:8px 12px;border-radius:6px;border:1px solid var(--border-medium);width:100%;">
                        </div>
                        <div class="form-group">
                            <label>Phone</label>
                            <input type="text" id="cf-phone" placeholder="Phone number" style="padding:8px 12px;border-radius:6px;border:1px solid var(--border-medium);width:100%;">
                        </div>
                        <div class="form-group">
                            <label>Email</label>
                            <input type="email" id="cf-email" placeholder="Email address" style="padding:8px 12px;border-radius:6px;border:1px solid var(--border-medium);width:100%;">
                        </div>
                        <div class="form-group" style="grid-column:1/-1;">
                            <label>Address</label>
                            <textarea id="cf-address" rows="2" placeholder="Address" style="padding:8px 12px;border-radius:6px;border:1px solid var(--border-medium);width:100%;"></textarea>
                        </div>
                        <div class="form-group">
                            <label>Discount Amount (RWF)</label>
                            <input type="number" id="cf-discount" value="0" min="0" step="1000" style="padding:8px 12px;border-radius:6px;border:1px solid var(--border-medium);width:100%;">
                        </div>
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-outline" onclick="window.closeModal('create-family-modal')">Cancel</button>
                    <button class="btn btn-primary" onclick="window._saveFamily()">💾 Create</button>
                </div>
            </div>
        </div>
    `;

    showModal(modalHtml);
}

// ──────────────────────────────────────────────────────────────────────
// SAVE FAMILY
// ──────────────────────────────────────────────────────────────────────

window._saveFamily = async function () {
    const code = document.getElementById('cf-code')?.value.trim().toUpperCase();
    const guardian = document.getElementById('cf-guardian')?.value.trim();
    const phone = document.getElementById('cf-phone')?.value.trim();
    const email = document.getElementById('cf-email')?.value.trim();
    const address = document.getElementById('cf-address')?.value.trim();
    const discount = parseFloat(document.getElementById('cf-discount')?.value) || 0;

    if (!code) {
        showToast('Family code is required', 'warning');
        return;
    }

    // Check for duplicate code
    if ((state.families || []).some(f => f.family_code === code)) {
        showToast('Family code already exists', 'warning');
        return;
    }

    const result = await insert('families', {
        family_code: code,
        guardian_name: guardian || null,
        guardian_phone: phone || null,
        guardian_email: email || null,
        address: address || null,
        discount_amount: discount,
        created_at: new Date().toISOString(),
    });

    if (result) {
        state.families.push(result);
        closeModal('create-family-modal');
        showToast('✅ Family created', 'success');
        await filterFamilies();
        await renderUnlinked();
    } else {
        showToast('Failed to create family', 'error');
    }
};

// ──────────────────────────────────────────────────────────────────────
// CREATE FAMILY FROM GROUP
// ──────────────────────────────────────────────────────────────────────

async function createFamilyFromGroup(studentIdsStr) {
    const studentIds = studentIdsStr.split(',').map(id => parseInt(id.trim())).filter(Boolean);
    const students = studentIds.map(id => state.students.find(s => s.id === id)).filter(Boolean);

    if (!students.length) return;

    const familyCode = `FAM-${Date.now().toString().slice(-6)}`;
    const guardianName = students[0].guardian_name || 'Family';

    const newFamily = await insert('families', {
        family_code: familyCode,
        guardian_name: guardianName,
        guardian_phone: students[0].guardian_phone || null,
        created_at: new Date().toISOString(),
    });

    if (!newFamily) {
        showToast('Failed to create family', 'error');
        return;
    }

    let linked = 0;
    for (const s of students) {
        const result = await update('students', s.id, {
            family_id: newFamily.id,
            updated_at: new Date().toISOString(),
        });
        if (result) linked++;
    }

    await refreshTable('students');
    await refreshTable('families');
    showToast(`✅ Created family ${familyCode} with ${linked} students`, 'success');
    await filterFamilies();
    await renderUnlinked();
    switchFamilyTab('families', { target: document.querySelector('[data-tab="families"]') });
}

// ──────────────────────────────────────────────────────────────────────
// EDIT FAMILY
// ──────────────────────────────────────────────────────────────────────

async function editFamily(familyId) {
    const family = state.families.find(f => f.id === familyId);
    if (!family) return;

    const modalHtml = `
        <div class="modal-overlay" id="edit-family-modal">
            <div class="modal" style="max-width:450px;">
                <div class="modal-header">
                    <h3>✏️ Edit Family — ${esc(family.family_code)}</h3>
                    <button class="modal-close" onclick="window.closeModal('edit-family-modal')">✕</button>
                </div>
                <div class="modal-body">
                    <div class="form-grid">
                        <div class="form-group" style="grid-column:1/-1;">
                            <label>Guardian Name</label>
                            <input type="text" id="ef-guardian" value="${esc(family.guardian_name || '')}" style="padding:8px 12px;border-radius:6px;border:1px solid var(--border-medium);width:100%;">
                        </div>
                        <div class="form-group">
                            <label>Phone</label>
                            <input type="text" id="ef-phone" value="${esc(family.guardian_phone || '')}" style="padding:8px 12px;border-radius:6px;border:1px solid var(--border-medium);width:100%;">
                        </div>
                        <div class="form-group">
                            <label>Email</label>
                            <input type="email" id="ef-email" value="${esc(family.guardian_email || '')}" style="padding:8px 12px;border-radius:6px;border:1px solid var(--border-medium);width:100%;">
                        </div>
                        <div class="form-group" style="grid-column:1/-1;">
                            <label>Address</label>
                            <textarea id="ef-address" rows="2" style="padding:8px 12px;border-radius:6px;border:1px solid var(--border-medium);width:100%;">${esc(family.address || '')}</textarea>
                        </div>
                        <div class="form-group">
                            <label>Discount Amount (RWF)</label>
                            <input type="number" id="ef-discount" value="${family.discount_amount || 0}" min="0" step="1000" style="padding:8px 12px;border-radius:6px;border:1px solid var(--border-medium);width:100%;">
                        </div>
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-outline" onclick="window.closeModal('edit-family-modal')">Cancel</button>
                    <button class="btn btn-primary" onclick="window._saveEditFamily(${familyId})">💾 Save</button>
                </div>
            </div>
        </div>
    `;

    showModal(modalHtml);
}

// ──────────────────────────────────────────────────────────────────────
// SAVE EDIT FAMILY
// ──────────────────────────────────────────────────────────────────────

window._saveEditFamily = async function (familyId) {
    const guardian = document.getElementById('ef-guardian')?.value.trim();
    const phone = document.getElementById('ef-phone')?.value.trim();
    const email = document.getElementById('ef-email')?.value.trim();
    const address = document.getElementById('ef-address')?.value.trim();
    const discount = parseFloat(document.getElementById('ef-discount')?.value) || 0;

    const result = await update('families', familyId, {
        guardian_name: guardian || null,
        guardian_phone: phone || null,
        guardian_email: email || null,
        address: address || null,
        discount_amount: discount,
        updated_at: new Date().toISOString(),
    });

    if (result) {
        const idx = state.families.findIndex(f => f.id === familyId);
        if (idx !== -1) {
            state.families[idx] = { ...state.families[idx], guardian_name: guardian, guardian_phone: phone, guardian_email: email, address: address, discount_amount: discount };
        }
        closeModal('edit-family-modal');
        showToast('✅ Family updated', 'success');
        await filterFamilies();
    } else {
        showToast('Failed to update family', 'error');
    }
};

// ──────────────────────────────────────────────────────────────────────
// DELETE FAMILY
// ──────────────────────────────────────────────────────────────────────

async function deleteFamily(familyId) {
    const family = state.families.find(f => f.id === familyId);
    if (!family) return;

    const members = (state.students || []).filter(s => s.family_id === familyId);
    const warning = members.length > 0
        ? `Family "${family.family_code}" has ${members.length} student(s). They will become unlinked. Continue?`
        : `Delete family "${family.family_code}"?`;

    if (!await confirmDialog(warning)) return;

    // Unlink all students
    for (const s of members) {
        await update('students', s.id, { family_id: null, updated_at: new Date().toISOString() });
    }

    const result = await remove('families', familyId);

    if (result) {
        state.families = state.families.filter(f => f.id !== familyId);
        showToast('✅ Family deleted', 'success');
        await filterFamilies();
        await renderUnlinked();
    } else {
        showToast('Failed to delete family', 'error');
    }
}

// ──────────────────────────────────────────────────────────────────────
// UNLINK STUDENT
// ──────────────────────────────────────────────────────────────────────

async function unlinkStudent(studentId) {
    const student = getStudentById(studentId);
    if (!student) return;

    if (!await confirmDialog(`Remove ${student.first_name} ${student.last_name} from their family?`)) return;

    const result = await update('students', studentId, {
        family_id: null,
        updated_at: new Date().toISOString(),
    });

    if (result) {
        student.family_id = null;
        showToast('✅ Student unlinked', 'success');
        await renderUnlinked();
        await filterFamilies();
    } else {
        showToast('Failed to unlink student', 'error');
    }
}

// ──────────────────────────────────────────────────────────────────────
// REFRESH FAMILIES
// ──────────────────────────────────────────────────────────────────────

async function refreshFamilies() {
    await refreshTable('families');
    await refreshTable('students');
    await filterFamilies();
    await renderUnlinked();
    showToast('🔄 Refreshed', 'info', 1000);
}

// ──────────────────────────────────────────────────────────────────────
// EXPORT FAMILIES
// ──────────────────────────────────────────────────────────────────────

function exportFamilies() {
    const families = state.families || [];
    const data = families.map(f => {
        const members = (state.students || []).filter(s => s.family_id === f.id && s.status === 'Active');
        return {
            'Family Code': f.family_code || '',
            'Guardian Name': f.guardian_name || '',
            'Phone': f.guardian_phone || '',
            'Email': f.guardian_email || '',
            'Address': f.address || '',
            'Students': members.length,
            'Discount Amount': f.discount_amount || 0,
            'Created': fmtDate(f.created_at),
        };
    });

    exportToExcel(data, `Families_${new Date().toISOString().split('T')[0]}`);
    showToast('✅ Families exported', 'success');
}