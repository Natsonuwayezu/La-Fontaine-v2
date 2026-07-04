/**
 * ECOLE LA FONTAINE — Enroll Student Module
 * Complete student enrollment with fee assignment and academic year tracking
 * Last updated: 2026-07-03
 * 
 * CHANGES:
 * - Student is automatically enrolled in the current academic year
 * - Academic year is stored in the student record
 * - Fees are applied to the current academic year and term
 * - Student appears in all year-filtered lists (class register, marks, etc.)
 * - Added validation for academic year
 * - Auto-generates student code with year
 * - PREVENTS enrollment when no active academic year exists
 * - Shows warning when trying to enroll in inactive year
 */

import {
    state,
    getClassById,
    getCurrentUser,
    isAdmin,
    getCurrentAcademicYear,
    getActiveAcademicYearId,
    isCurrentYearEditable
} from '../../core/state.js';
import { esc, fmtCurrency } from '../../core/utils.js';
import { insert, update, getAll } from '../../core/api.js';
import { notifyAction } from '../../core/notifications.js';
import { getFeeAmount } from '../../core/fees.js';

// ──────────────────────────────────────────────────────────────────────
// MAIN RENDER FUNCTION
// ──────────────────────────────────────────────────────────────────────

export async function renderEnrollStudent(container) {
    if (!container) return;

    if (!isAdmin()) {
        container.innerHTML = '<div class="alert alert-danger">Access denied. Admin privileges required.</div>';
        return;
    }

    await ensureStateLoaded();

    const classes = (state.classes || []).filter(c => c.is_active !== false);
    const feeCategories = (state.feeCategories || []).filter(c => c.is_active !== false);
    const currentYear = getCurrentAcademicYear();
    const isEditable = isCurrentYearEditable();

    // Check if there's an active academic year
    if (!currentYear) {
        container.innerHTML = `
            <div class="alert alert-danger" style="margin:2rem;">
                <strong>❌ No active academic year found!</strong>
                <br>Please set an active academic year before enrolling students.
                <br><br>
                <button class="btn btn-primary" onclick="window.navigateTo('academic-years')">📅 Go to Academic Years</button>
            </div>
        `;
        return;
    }

    // Check if current year is editable
    if (!isEditable) {
        container.innerHTML = `
            <div class="alert alert-warning" style="margin:2rem;">
                <strong>⚠️ Cannot enroll students in inactive academic year!</strong>
                <br>The current academic year (${esc(currentYear.name)}) is not active.
                <br>Please activate this year or switch to an active year.
                <br><br>
                <button class="btn btn-primary" onclick="window.navigateTo('academic-years')">📅 Go to Academic Years</button>
            </div>
        `;
        return;
    }

    container.innerHTML = `
        <div class="dash-card">
            <div class="dash-card-header">
                <span class="dash-card-title">➕ Enroll New Student</span>
                <button class="btn btn-sm btn-outline" onclick="window.navigateTo('student-list')">← Back</button>
            </div>
            <div class="dash-card-body">
                <div class="alert alert-info" style="font-size:0.85rem;">
                    <strong>📅 Academic Year:</strong> ${esc(currentYear?.name || 'Current Year')}
                    <span class="badge badge-success" style="margin-left:8px;">🟢 Active</span>
                    <br><small style="color:var(--text-muted);">Student will be enrolled in the current active academic year.</small>
                </div>
                <div id="enroll-error" class="alert alert-danger" style="display:none;"></div>

                <div class="form-grid">
                    <div class="form-group">
                        <label>First Name *</label>
                        <input type="text" id="en-first" placeholder="First name" style="padding:8px 12px;border-radius:6px;border:1px solid var(--border-medium);width:100%;">
                    </div>
                    <div class="form-group">
                        <label>Last Name *</label>
                        <input type="text" id="en-last" placeholder="Last name" style="padding:8px 12px;border-radius:6px;border:1px solid var(--border-medium);width:100%;">
                    </div>
                    <div class="form-group">
                        <label>Class *</label>
                        <select id="en-class" onchange="window._previewFees()" style="padding:8px 12px;border-radius:6px;border:1px solid var(--border-medium);width:100%;">
                            <option value="">— Select class —</option>
                            ${classes.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Gender</label>
                        <select id="en-gender" style="padding:8px 12px;border-radius:6px;border:1px solid var(--border-medium);width:100%;">
                            <option value="">— Select —</option>
                            <option value="Male">Male</option>
                            <option value="Female">Female</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Date of Birth</label>
                        <input type="date" id="en-dob" style="padding:8px 12px;border-radius:6px;border:1px solid var(--border-medium);width:100%;">
                    </div>
                    <div class="form-group">
                        <label>Nationality</label>
                        <input type="text" id="en-nationality" placeholder="e.g., Rwandan" style="padding:8px 12px;border-radius:6px;border:1px solid var(--border-medium);width:100%;">
                    </div>
                    <div class="form-group" style="grid-column:1/-1;">
                        <label>Guardian Name *</label>
                        <input type="text" id="en-guardian" placeholder="Parent/guardian full name" style="padding:8px 12px;border-radius:6px;border:1px solid var(--border-medium);width:100%;">
                    </div>
                    <div class="form-group">
                        <label>Guardian Phone</label>
                        <input type="tel" id="en-phone" placeholder="+250 7xx xxx xxx" style="padding:8px 12px;border-radius:6px;border:1px solid var(--border-medium);width:100%;">
                    </div>
                    <div class="form-group">
                        <label>Guardian Email</label>
                        <input type="email" id="en-email" placeholder="guardian@email.com" style="padding:8px 12px;border-radius:6px;border:1px solid var(--border-medium);width:100%;">
                    </div>
                    <div class="form-group" style="grid-column:1/-1;">
                        <label>Enrollment Date</label>
                        <input type="date" id="en-date" value="${new Date().toISOString().split('T')[0]}" style="padding:8px 12px;border-radius:6px;border:1px solid var(--border-medium);width:100%;">
                    </div>
                    <div class="form-group" style="grid-column:1/-1;">
                        <label>Notes</label>
                        <textarea id="en-notes" rows="2" placeholder="Optional notes..." style="padding:8px 12px;border-radius:6px;border:1px solid var(--border-medium);width:100%;"></textarea>
                    </div>
                </div>

                <!-- Fee Selection -->
                <div id="fee-preview-section" style="display:none;margin-top:20px;border:1px solid var(--border-medium);border-radius:var(--r-lg);overflow:hidden;">
                    <div style="background:var(--bg-tertiary);padding:10px 16px;border-bottom:1px solid var(--border-light);display:flex;align-items:center;justify-content:space-between;">
                        <strong>💰 Fees to Apply on Enrollment</strong>
                        <label style="display:flex;align-items:center;gap:6px;font-size:0.8rem;font-weight:600;cursor:pointer;">
                            <input type="checkbox" id="enroll-fee-all" onchange="window._toggleAllFees()"> Select All
                        </label>
                    </div>
                    <div id="fee-preview-list" style="padding:0 16px;"></div>
                    <div id="fee-preview-total" style="padding:10px 16px;font-weight:700;background:var(--bg-tertiary);border-top:1px solid var(--border-light);"></div>
                    <div style="padding:8px 16px 12px;font-size:0.75rem;color:var(--text-muted);">
                        ✅ Only checked fees will be applied to the student's account for the current academic year.
                    </div>
                </div>

                <div class="btn-group" style="margin-top:20px;">
                    <button class="btn btn-success" onclick="window._submitEnroll()">✅ Enroll Student</button>
                    <button class="btn btn-outline" onclick="window._resetEnrollForm()">↻ Reset</button>
                </div>
            </div>
        </div>
    `;

    window._previewFees = previewFees;
    window._toggleAllFees = toggleAllFees;
    window._submitEnroll = submitEnroll;
    window._resetEnrollForm = resetEnrollForm;
}

// ──────────────────────────────────────────────────────────────────────
// PREVIEW FEES
// ──────────────────────────────────────────────────────────────────────

function previewFees() {
    const classId = document.getElementById('en-class')?.value;
    const section = document.getElementById('fee-preview-section');
    const listEl = document.getElementById('fee-preview-list');
    const totEl = document.getElementById('fee-preview-total');

    if (!classId) {
        section.style.display = 'none';
        return;
    }

    const activeCategories = (state.feeCategories || []).filter(c => c.is_active !== false);
    const fees = [];

    for (const cat of activeCategories) {
        let amount = getFeeAmount(cat.id, classId, state.currentAcadYear?.id);
        if (amount > 0) {
            fees.push({ id: cat.id, name: cat.name, amount });
        }
    }

    if (!fees.length) {
        section.style.display = 'none';
        return;
    }

    listEl.innerHTML = fees.map(f => `
        <div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border-light);">
            <input type="checkbox" class="enroll-fee-cb" value="${f.id}" data-amount="${f.amount}" checked onchange="window._updateFeeTotal()" style="width:16px;height:16px;flex-shrink:0;">
            <span style="flex:1;">${esc(f.name)}</span>
            <span style="font-weight:600;color:var(--role-secondary);">${fmtCurrency(f.amount)}</span>
        </div>
    `).join('');

    document.getElementById('enroll-fee-all').checked = true;
    updateFeeTotal();
    section.style.display = 'block';
}

// ──────────────────────────────────────────────────────────────────────
// TOGGLE ALL FEES
// ──────────────────────────────────────────────────────────────────────

function toggleAllFees() {
    const checked = document.getElementById('enroll-fee-all')?.checked;
    document.querySelectorAll('.enroll-fee-cb').forEach(cb => cb.checked = checked);
    updateFeeTotal();
}

// ──────────────────────────────────────────────────────────────────────
// UPDATE FEE TOTAL
// ──────────────────────────────────────────────────────────────────────

window._updateFeeTotal = function () {
    const checked = [...document.querySelectorAll('.enroll-fee-cb:checked')];
    const total = checked.reduce((s, cb) => s + parseFloat(cb.dataset.amount || 0), 0);
    const totEl = document.getElementById('fee-preview-total');
    if (totEl) {
        totEl.innerHTML = `
            <div style="display:flex;justify-content:space-between;">
                <span>TOTAL TO APPLY (${checked.length} fee${checked.length !== 1 ? 's' : ''})</span>
                <span style="color:var(--role-secondary);">${fmtCurrency(total)}</span>
            </div>
        `;
    }
};

// ──────────────────────────────────────────────────────────────────────
// SUBMIT ENROLL
// ──────────────────────────────────────────────────────────────────────

async function submitEnroll() {
    // ── CHECK IF YEAR IS EDITABLE ──────────────────────────────────────
    const isEditable = isCurrentYearEditable();
    if (!isEditable) {
        const errEl = document.getElementById('enroll-error');
        errEl.textContent = '❌ Cannot enroll students in an inactive academic year. Please activate the current year first.';
        errEl.style.display = 'block';
        return;
    }

    const first = document.getElementById('en-first')?.value.trim();
    const last = document.getElementById('en-last')?.value.trim();
    const classId = document.getElementById('en-class')?.value;
    const gender = document.getElementById('en-gender')?.value;
    const dob = document.getElementById('en-dob')?.value || null;
    const nationality = document.getElementById('en-nationality')?.value.trim();
    const guardian = document.getElementById('en-guardian')?.value.trim();
    const phone = document.getElementById('en-phone')?.value.trim();
    const email = document.getElementById('en-email')?.value.trim();
    const enrollmentDate = document.getElementById('en-date')?.value;
    const notes = document.getElementById('en-notes')?.value.trim();

    const errEl = document.getElementById('enroll-error');

    // ── VALIDATION ──────────────────────────────────────────────────────
    if (!first || !last || !classId || !guardian) {
        errEl.textContent = 'Please fill in all required fields (First Name, Last Name, Class, Guardian Name)';
        errEl.style.display = 'block';
        return;
    }

    errEl.style.display = 'none';

    // ── GET CURRENT ACADEMIC YEAR ─────────────────────────────────────
    const currentYear = getCurrentAcademicYear();
    if (!currentYear) {
        errEl.textContent = 'No active academic year found. Please set an active academic year first.';
        errEl.style.display = 'block';
        return;
    }

    // ── GENERATE STUDENT CODE ─────────────────────────────────────────
    const cls = getClassById(classId);
    const yearShort = currentYear.name?.slice(-2) || new Date().getFullYear().toString().slice(-2);
    const existingStudents = (state.students || []).filter(s => s.class_id == classId);
    const seq = existingStudents.length + 1;
    const code = `${cls?.code || 'STU'}-${yearShort}-${String(seq).padStart(4, '0')}`;

    const btn = document.querySelector('.btn-success');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-sm"></span> Enrolling...';

    try {
        // ── CREATE STUDENT WITH ACADEMIC YEAR ─────────────────────────
        const student = await insert('students', {
            first_name: first,
            last_name: last,
            class_id: parseInt(classId),
            student_code: code,
            academic_year_id: currentYear.id,  // ← Store current year
            gender: gender || null,
            date_of_birth: dob,
            nationality: nationality || null,
            guardian_name: guardian,
            guardian_phone: phone || null,
            guardian_email: email || null,
            enrollment_date: enrollmentDate || new Date().toISOString().split('T')[0],
            notes: notes || null,
            status: 'Active',
            is_deleted: false,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        });

        if (!student) {
            throw new Error('Failed to create student record');
        }

        // ── ADD TO STATE ──────────────────────────────────────────────
        state.students.push(student);

        // ── APPLY FEES FOR CURRENT YEAR & TERM ─────────────────────────
        const selectedFees = [...document.querySelectorAll('.enroll-fee-cb:checked')];
        let feesApplied = 0;

        for (const cb of selectedFees) {
            const categoryId = parseInt(cb.value);
            const amount = parseFloat(cb.dataset.amount) || 0;
            if (amount > 0) {
                await insert('student_fees', {
                    student_id: student.id,
                    fee_category_id: categoryId,
                    term_id: state.currentTerm?.id,
                    academic_year_id: currentYear.id,  // ← Store current year
                    amount: amount,
                    paid_amount: 0,
                    is_paid: false,
                    is_waived: false,
                    due_date: state.currentTerm?.end_date || null,
                    created_at: new Date().toISOString(),
                });
                feesApplied++;
            }
        }

        // ── RECORD CLASS HISTORY ──────────────────────────────────────
        try {
            await insert('student_class_history', {
                student_id: student.id,
                class_id: parseInt(classId),
                academic_year_id: currentYear.id,
                term_id: state.currentTerm?.id,
                start_date: enrollmentDate || new Date().toISOString().split('T')[0],
                status: 'active',
                created_at: new Date().toISOString(),
            });
        } catch (e) {
            console.warn('[Enroll] Class history not recorded:', e);
        }

        // ── LOG ACTIVITY ──────────────────────────────────────────────
        await notifyAction('student_enrolled', {
            message: `Enrolled ${first} ${last} (${code}) in ${cls?.name || 'class'} — ${currentYear.name}`,
            entity_type: 'students',
            entity_id: student.id,
            academic_year: currentYear.id,
        }, ['admin', 'teachers']);

        showToast(`✅ Student enrolled! Code: ${code} · ${currentYear.name}${feesApplied > 0 ? ` · ${feesApplied} fees applied` : ''}`, 'success');

        // ── NAVIGATE TO STUDENT DETAILS ──────────────────────────────
        localStorage.setItem('elf_view_student', student.id);
        setTimeout(() => navigateTo('student-details'), 500);

    } catch (error) {
        console.error('[Enroll]', error);
        errEl.textContent = 'Enrollment failed: ' + error.message;
        errEl.style.display = 'block';
        btn.disabled = false;
        btn.innerHTML = '✅ Enroll Student';
    }
}

// ──────────────────────────────────────────────────────────────────────
// RESET ENROLL FORM
// ──────────────────────────────────────────────────────────────────────

function resetEnrollForm() {
    ['en-first', 'en-last', 'en-class', 'en-gender', 'en-dob', 'en-nationality', 'en-guardian', 'en-phone', 'en-email', 'en-notes'].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            if (el.tagName === 'SELECT') el.value = '';
            else el.value = '';
        }
    });
    document.getElementById('en-date').value = new Date().toISOString().split('T')[0];
    document.getElementById('fee-preview-section').style.display = 'none';
    document.getElementById('enroll-error').style.display = 'none';
    showToast('Form reset', 'info', 1500);
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

async function ensureStateLoaded() {
    if (!state.classes.length) {
        const { loadInitialData } = await import('../../core/boot.js');
        await loadInitialData(false);
    }
}

// Export functions to window
window._previewFees = previewFees;
window._toggleAllFees = toggleAllFees;
window._submitEnroll = submitEnroll;
window._resetEnrollForm = resetEnrollForm;
window._updateFeeTotal = window._updateFeeTotal || updateFeeTotal;