/**
 * ECOLE LA FONTAINE — Fee Waivers Module
 * Full and partial fee waivers with recurrence, history, and copy from previous years
 * Last updated: 2026-07-04
 * 
 * CHANGES:
 * - Added academic year filtering
 * - Added "Copy from Previous Year" functionality
 * - Added "Copy from Previous Term" functionality
 * - Year selector in UI
 * - Read-only mode for inactive years
 * - Bulk copy with selection
 */

import {
    state,
    getClassById,
    getStudentById,
    getCurrentUser,
    getCurrentAcademicYear,
    getTermsByYear,
    getYearData
} from '../../core/state.js';
import { esc, fmtCurrency, fmtDate, fmtAgo } from '../../core/utils.js';
import { getFullStudentBalance } from '../../core/fees.js';
import { insert, update, remove, getAll, get } from '../../core/api.js';
import { notifyAction } from '../../core/notifications.js';
import { exportToExcel } from '../../core/utils.js';

// ──────────────────────────────────────────────────────────────────────
// STATE
// ──────────────────────────────────────────────────────────────────────

let selectedYearId = null;
let waiverData = [];

// ──────────────────────────────────────────────────────────────────────
// MAIN RENDER FUNCTION
// ──────────────────────────────────────────────────────────────────────

export async function renderFeeWaivers(container) {
    if (!container) return;

    const user = getCurrentUser();
    if (user?.role === 'teacher') {
        container.innerHTML = '<div class="alert alert-danger">Access denied. Teachers cannot manage fee waivers.</div>';
        return;
    }

    await ensureStateLoaded();

    const waivers = (state.studentFees || []).filter(f => f.is_waived === true);
    const categories = state.feeCategories || [];
    const currentYear = getCurrentAcademicYear();
    const years = (state.academicYears || []).sort((a, b) => b.id - a.id);
    const terms = getTermsByYear(selectedYearId || currentYear?.id);

    // Default to current year
    if (!selectedYearId) {
        selectedYearId = currentYear?.id || null;
    }

    const selectedYear = years.find(y => y.id === selectedYearId);
    const isActiveYear = selectedYear?.is_active === true;
    const isCurrentYear = selectedYear?.id === currentYear?.id;

    // Filter waivers by selected year
    const yearWaivers = waivers.filter(f => f.academic_year_id == selectedYearId);

    // Summary stats
    const totalWaived = yearWaivers.reduce((a, f) => a + (f.amount || 0), 0);
    const totalStudents = new Set(yearWaivers.map(f => f.student_id)).size;

    // Build waiver list with student and category info
    const waiverList = yearWaivers.map(f => {
        const student = getStudentById(f.student_id);
        const cat = categories.find(c => c.id === f.fee_category_id);
        const cls = student ? getClassById(student.class_id) : null;
        return {
            ...f,
            student,
            category: cat,
            class: cls,
        };
    }).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    // Check if there are waivers from previous years to copy
    const previousYears = years.filter(y => y.id < selectedYearId);
    const hasPreviousWaivers = previousYears.some(y => {
        const prevWaivers = waivers.filter(f => f.academic_year_id === y.id);
        return prevWaivers.length > 0;
    });

    container.innerHTML = `
        <div class="dash-card">
            <div class="dash-card-header" style="flex-wrap:wrap;gap:8px;">
                <span class="dash-card-title">🎁 Fee Waivers</span>
                <div class="btn-group" style="flex-wrap:wrap;gap:6px;">
                    <select id="waiver-year-filter" onchange="window._refreshWaivers()" style="padding:6px 10px;border-radius:6px;border:1px solid var(--border-medium);font-size:0.8rem;">
                        ${years.map(y => `
                            <option value="${y.id}" ${y.id === selectedYearId ? 'selected' : ''}>
                                ${esc(y.name)} ${y.id === currentYear?.id ? '🟢' : ''}
                            </option>
                        `).join('')}
                    </select>
                    <button class="btn btn-sm btn-primary" onclick="window._openSmartWaiverModal()">➕ Add Waiver</button>
                    <button class="btn btn-sm btn-outline" onclick="window._openFullWaiverModal()">🎯 Full Waiver</button>
                    ${hasPreviousWaivers ? `<button class="btn btn-sm btn-outline" onclick="window._openCopyWaiversModal()">📋 Copy from Previous</button>` : ''}
                    <button class="btn btn-sm btn-outline" onclick="window._exportWaivers()">📥 Export</button>
                    <button class="btn btn-sm btn-outline" onclick="window._refreshWaivers()">🔄 Refresh</button>
                    ${!isActiveYear ? '<span class="badge badge-neutral" style="font-size:0.65rem;">🔒 Read-only</span>' : ''}
                </div>
            </div>
            <div class="dash-card-body">
                <div style="font-size:0.75rem;color:var(--text-muted);margin-bottom:12px;padding:6px 12px;background:var(--bg-tertiary);border-radius:6px;display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px;">
                    <span>📅 ${selectedYear?.name || 'All Years'} ${isActiveYear ? '🟢 Active' : '🔒 Inactive (Read-Only)'}</span>
                    <span>${isCurrentYear ? '✅ Current Year' : ''}</span>
                    <span>${waiverList.length} waivers · ${fmtCurrency(totalWaived)} waived</span>
                </div>

                <div class="stats-grid" style="grid-template-columns:repeat(3,1fr);margin-bottom:16px;">
                    <div class="stat-card" style="padding:12px;text-align:center;">
                        <div class="stat-value">${waiverList.length}</div>
                        <div class="stat-label">Total Waivers</div>
                    </div>
                    <div class="stat-card" style="padding:12px;text-align:center;">
                        <div class="stat-value" style="color:var(--success);">${fmtCurrency(totalWaived)}</div>
                        <div class="stat-label">Total Waived Amount</div>
                    </div>
                    <div class="stat-card" style="padding:12px;text-align:center;">
                        <div class="stat-value">${totalStudents}</div>
                        <div class="stat-label">Students with Waivers</div>
                    </div>
                </div>

                <div class="filters-bar" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px;margin-bottom:12px;">
                    <div class="form-group" style="margin:0;">
                        <label style="font-size:0.7rem;">Search</label>
                        <input type="text" id="waiver-search" placeholder="🔍 Search student..." oninput="window._filterWaivers()" style="padding:6px 10px;border-radius:6px;border:1px solid var(--border-medium);width:100%;">
                    </div>
                    <span class="result-count" id="waiver-count" style="align-self:center;font-size:0.8rem;color:var(--text-muted);"></span>
                </div>

                <div class="table-wrapper">
                    <table class="data-table" style="font-size:0.8rem;">
                        <thead>
                            <tr>
                                <th>Student</th>
                                <th>Class</th>
                                <th>Category</th>
                                <th style="text-align:right;">Amount Waived</th>
                                <th>Reason</th>
                                <th>Date</th>
                                <th style="text-align:center;">Action</th>
                            </tr>
                        </thead>
                        <tbody id="waiver-tbody">
                            <tr><td colspan="7" style="text-align:center;padding:40px;color:var(--text-muted);">No waivers recorded for this academic year</td></tr>
                        </tbody>
                    </table>
                </div>

                <div class="alert alert-info" style="margin-top:16px;font-size:0.8rem;">
                    <strong>📊 Impact of Waivers:</strong><br>
                    • Total fees removed from student balances: <strong>${fmtCurrency(totalWaived)}</strong><br>
                    • This amount is <strong>NOT included</strong> in student fee balances or financial reports.<br>
                    • Removing a waiver will add the amount back to the student's balance.
                    ${!isActiveYear ? '<br>• 🔒 This year is inactive — waivers cannot be added or removed.' : ''}
                </div>
            </div>
        </div>
    `;

    window._filterWaivers = filterWaivers;
    window._openSmartWaiverModal = openSmartWaiverModal;
    window._openFullWaiverModal = openFullWaiverModal;
    window._openCopyWaiversModal = openCopyWaiversModal;
    window._exportWaivers = exportWaivers;
    window._refreshWaivers = refreshWaivers;
    window._removeWaiver = removeWaiver;

    renderWaiverList(waiverList);
}

// ──────────────────────────────────────────────────────────────────────
// RENDER WAIVER LIST
// ──────────────────────────────────────────────────────────────────────

function renderWaiverList(waivers) {
    const tbody = document.getElementById('waiver-tbody');
    if (!tbody) return;

    if (!waivers.length) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:40px;color:var(--text-muted);">No waivers recorded for this academic year</td></tr>';
        return;
    }

    const countEl = document.getElementById('waiver-count');
    if (countEl) countEl.textContent = `${waivers.length} waiver${waivers.length !== 1 ? 's' : ''}`;

    tbody.innerHTML = waivers.map(w => {
        const isRecurring = w.waiver_recurring === true;
        return `
            <tr>
                <td><strong>${esc(w.student ? `${w.student.first_name} ${w.student.last_name}` : '—')}</strong><br><small style="color:var(--text-muted);">${esc(w.student?.student_code || '')}</small></td>
                <td>${esc(w.class?.name || '—')}</td>
                <td>${esc(w.category?.name || '—')}</td>
                <td style="text-align:right;color:var(--success);font-weight:600;">- ${fmtCurrency(w.amount)}${isRecurring ? ' 🔄' : ''}</td>
                <td style="font-size:0.8rem;">${esc(w.waiver_reason || w.notes || '—')}</td>
                <td style="font-size:0.8rem;">${fmtDate(w.created_at)}</td>
                <td style="text-align:center;">
                    ${w.waiver_recurring ? '<span class="badge badge-info" style="font-size:0.6rem;">🔄 Recurring</span>' : ''}
                    <button class="btn btn-sm btn-danger" onclick="window._removeWaiver(${w.id})" style="padding:2px 8px;font-size:0.7rem;">🗑️</button>
                </td>
            </tr>
        `;
    }).join('');
}

// ──────────────────────────────────────────────────────────────────────
// FILTER WAIVERS
// ──────────────────────────────────────────────────────────────────────

function filterWaivers() {
    const search = (document.getElementById('waiver-search')?.value || '').toLowerCase();
    const waivers = (state.studentFees || [])
        .filter(f => f.is_waived === true && f.academic_year_id == selectedYearId);
    const categories = state.feeCategories || [];

    let filtered = waivers.map(f => {
        const student = getStudentById(f.student_id);
        const cat = categories.find(c => c.id === f.fee_category_id);
        const cls = student ? getClassById(student.class_id) : null;
        return { ...f, student, category: cat, class: cls };
    });

    if (search) {
        filtered = filtered.filter(w =>
            (w.student?.first_name || '').toLowerCase().includes(search) ||
            (w.student?.last_name || '').toLowerCase().includes(search) ||
            (w.student?.student_code || '').toLowerCase().includes(search)
        );
    }

    filtered.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    renderWaiverList(filtered);
}

// ──────────────────────────────────────────────────────────────────────
// OPEN COPY WAIVERS MODAL
// ──────────────────────────────────────────────────────────────────────

function openCopyWaiversModal() {
    const years = (state.academicYears || [])
        .filter(y => y.id < selectedYearId)
        .sort((a, b) => b.id - a.id);

    const currentYear = state.academicYears.find(y => y.id === selectedYearId);
    const isReadOnly = !currentYear?.is_active;

    if (isReadOnly) {
        showToast('Cannot copy waivers to inactive academic year', 'warning');
        return;
    }

    const modalHtml = `
        <div class="modal-overlay" id="copy-waivers-modal">
            <div class="modal" style="max-width:500px;">
                <div class="modal-header">
                    <h3>📋 Copy Waivers from Previous Year</h3>
                    <button class="modal-close" onclick="window.closeModal('copy-waivers-modal')">✕</button>
                </div>
                <div class="modal-body">
                    <div class="alert alert-info" style="font-size:0.85rem;">
                        Copy waivers from a previous academic year to the current year.
                        Only waived fees will be copied.
                    </div>
                    <div class="form-grid">
                        <div class="form-group" style="grid-column:1/-1;">
                            <label>Source Academic Year *</label>
                            <select id="cw-source-year" style="padding:8px 12px;border-radius:6px;border:1px solid var(--border-medium);width:100%;">
                                <option value="">— Select Source Year —</option>
                                ${years.map(y => `
                                    <option value="${y.id}">${esc(y.name)} (${(state.studentFees || []).filter(f => f.is_waived === true && f.academic_year_id === y.id).length} waivers)</option>
                                `).join('')}
                            </select>
                        </div>
                        <div class="form-group" style="grid-column:1/-1;">
                            <label>Copy Options</label>
                            <div style="display:flex;flex-wrap:wrap;gap:12px;padding:8px 0;">
                                <label style="display:flex;align-items:center;gap:6px;cursor:pointer;">
                                    <input type="checkbox" id="cw-copy-recurring" checked> Recurring waivers only
                                </label>
                                <label style="display:flex;align-items:center;gap:6px;cursor:pointer;">
                                    <input type="checkbox" id="cw-overwrite-existing"> Overwrite existing waivers
                                </label>
                            </div>
                        </div>
                        <div class="form-group" style="grid-column:1/-1;">
                            <label>Preview</label>
                            <div id="cw-preview" style="background:var(--bg-tertiary);padding:10px;border-radius:6px;font-size:0.8rem;color:var(--text-muted);">
                                Select a source year to preview waivers
                            </div>
                        </div>
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-outline" onclick="window.closeModal('copy-waivers-modal')">Cancel</button>
                    <button class="btn btn-primary" onclick="window._executeCopyWaivers()">📋 Copy Waivers</button>
                </div>
            </div>
        </div>
    `;

    showModal(modalHtml);

    // Preview on source year change
    document.getElementById('cw-source-year').onchange = function () {
        const yearId = this.value;
        const preview = document.getElementById('cw-preview');
        if (!yearId) {
            preview.innerHTML = 'Select a source year to preview waivers';
            return;
        }

        const sourceWaivers = (state.studentFees || [])
            .filter(f => f.is_waived === true && f.academic_year_id == yearId);

        if (!sourceWaivers.length) {
            preview.innerHTML = '<div class="alert alert-info">No waivers found in the selected year</div>';
            return;
        }

        const students = new Set(sourceWaivers.map(f => f.student_id));
        const totalAmount = sourceWaivers.reduce((s, f) => s + (f.amount || 0), 0);

        preview.innerHTML = `
            <div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px;">
                <span>📋 ${sourceWaivers.length} waivers</span>
                <span>👥 ${students.size} students</span>
                <span>💰 ${fmtCurrency(totalAmount)} total waived</span>
            </div>
            <div style="margin-top:6px;font-size:0.7rem;color:var(--text-muted);">
                ${sourceWaivers.slice(0, 3).map(w => {
            const s = getStudentById(w.student_id);
            return `• ${s ? s.first_name + ' ' + s.last_name : '—'}: ${fmtCurrency(w.amount)}`;
        }).join('<br>')}
                ${sourceWaivers.length > 3 ? `<br>... and ${sourceWaivers.length - 3} more` : ''}
            </div>
        `;
    };
}

// ──────────────────────────────────────────────────────────────────────
// EXECUTE COPY WAIVERS
// ──────────────────────────────────────────────────────────────────────

window._executeCopyWaivers = async function () {
    const sourceYearId = document.getElementById('cw-source-year')?.value;
    const copyRecurring = document.getElementById('cw-copy-recurring')?.checked;
    const overwrite = document.getElementById('cw-overwrite-existing')?.checked;

    if (!sourceYearId) {
        showToast('Please select a source year', 'warning');
        return;
    }

    const sourceWaivers = (state.studentFees || [])
        .filter(f => f.is_waived === true && f.academic_year_id == sourceYearId);

    if (!sourceWaivers.length) {
        showToast('No waivers found in the selected year', 'warning');
        return;
    }

    // Filter recurring if needed
    let waiversToCopy = sourceWaivers;
    if (copyRecurring) {
        waiversToCopy = sourceWaivers.filter(f => f.waiver_recurring === true);
    }

    if (!waiversToCopy.length) {
        showToast('No recurring waivers found in the selected year', 'warning');
        return;
    }

    if (!await confirmDialog(
        `Copy ${waiversToCopy.length} waiver${waiversToCopy.length !== 1 ? 's' : ''} from ${(state.academicYears || []).find(y => y.id == sourceYearId)?.name} to ${(state.academicYears || []).find(y => y.id == selectedYearId)?.name}?\n\n${overwrite ? '⚠️ Existing waivers will be overwritten.' : '✅ Existing waivers will be skipped.'}`
    )) return;

    let copied = 0;
    let skipped = 0;

    for (const waiver of waiversToCopy) {
        // Check if waiver already exists for this student/category/year
        const existing = (state.studentFees || []).find(f =>
            f.student_id === waiver.student_id &&
            f.fee_category_id === waiver.fee_category_id &&
            f.academic_year_id == selectedYearId &&
            f.is_waived === true
        );

        if (existing && !overwrite) {
            skipped++;
            continue;
        }

        if (existing && overwrite) {
            // Update existing waiver
            await update('student_fees', existing.id, {
                amount: waiver.amount,
                waiver_reason: waiver.waiver_reason || waiver.notes || 'Copied from previous year',
                waiver_recurring: waiver.waiver_recurring,
                updated_at: new Date().toISOString(),
            });
            copied++;
            continue;
        }

        // Create new waiver
        await insert('student_fees', {
            student_id: waiver.student_id,
            fee_category_id: waiver.fee_category_id,
            term_id: state.currentTerm?.id,
            academic_year_id: selectedYearId,
            amount: waiver.amount,
            paid_amount: 0,
            is_paid: false,
            is_waived: true,
            waiver_reason: waiver.waiver_reason || waiver.notes || 'Copied from previous year',
            waiver_recurring: waiver.waiver_recurring,
            notes: `Copied from ${(state.academicYears || []).find(y => y.id == sourceYearId)?.name}`,
            created_at: new Date().toISOString(),
        });
        copied++;
    }

    closeModal('copy-waivers-modal');

    await refreshTable('student_fees');
    await notifyAction('waivers_copied', {
        message: `Copied ${copied} waivers from ${(state.academicYears || []).find(y => y.id == sourceYearId)?.name} to ${(state.academicYears || []).find(y => y.id == selectedYearId)?.name}`,
        entity_type: 'student_fees',
        source_year: sourceYearId,
        target_year: selectedYearId,
    }, ['admin', 'accountant']);

    showToast(`✅ Copied ${copied} waivers${skipped > 0 ? ` (${skipped} skipped)` : ''}`, 'success');
    renderFeeWaivers(document.getElementById('dynamic-content'));
};

// ──────────────────────────────────────────────────────────────────────
// OPEN SMART WAIVER MODAL
// ──────────────────────────────────────────────────────────────────────

function openSmartWaiverModal(prefillStudentId = null) {
    const isReadOnly = !isActiveYear();
    if (isReadOnly) {
        showToast('Cannot add waivers to inactive academic year', 'warning');
        return;
    }

    const students = (state.students || []).filter(s => s.status === 'Active' && s.academic_year_id == selectedYearId)
        .sort((a, b) => a.last_name.localeCompare(b.last_name));
    const cats = (state.feeCategories || []).filter(c => c.is_active !== false);

    const modalHtml = `
        <div class="modal-overlay" id="smart-waiver-modal">
            <div class="modal" style="max-width:540px;">
                <div class="modal-header">
                    <h3>🎁 Apply Fee Waiver</h3>
                    <button class="modal-close" onclick="window.closeModal('smart-waiver-modal')">✕</button>
                </div>
                <div class="modal-body">
                    <div class="form-grid">
                        <div class="form-group" style="grid-column:1/-1;">
                            <label>Student *</label>
                            <select id="sw-student" onchange="window._loadWaiverFees()" style="padding:8px 12px;border-radius:6px;border:1px solid var(--border-medium);width:100%;">
                                <option value="">— Select Student —</option>
                                ${students.map(s => `<option value="${s.id}" ${prefillStudentId == s.id ? 'selected' : ''}>${esc(s.first_name)} ${esc(s.last_name)} (${esc(getClassById(s.class_id)?.name || '—')})</option>`).join('')}
                            </select>
                        </div>
                        <div class="form-group" style="grid-column:1/-1;">
                            <label>Fee Category</label>
                            <select id="sw-category" onchange="window._updateWaiverAmount()" style="padding:8px 12px;border-radius:6px;border:1px solid var(--border-medium);width:100%;">
                                <option value="all">All Outstanding Fees</option>
                                ${cats.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}
                            </select>
                        </div>
                        <div class="form-group">
                            <label>Waiver Type</label>
                            <select id="sw-type" onchange="window._updateWaiverAmount()" style="padding:8px 12px;border-radius:6px;border:1px solid var(--border-medium);width:100%;">
                                <option value="full">Full Waiver (100%)</option>
                                <option value="percentage">Percentage Discount</option>
                                <option value="custom">Custom Amount (RWF)</option>
                            </select>
                        </div>
                        <div class="form-group" id="sw-amount-group" style="display:none;">
                            <label id="sw-amount-label">Amount / Percentage</label>
                            <input type="number" id="sw-amount" min="0" step="100" style="padding:8px 12px;border-radius:6px;border:1px solid var(--border-medium);width:100%;">
                        </div>
                        <div class="form-group" style="grid-column:1/-1;">
                            <label>Applies To</label>
                            <select id="sw-recurrence" style="padding:8px 12px;border-radius:6px;border:1px solid var(--border-medium);width:100%;">
                                <option value="once">This fee only (once-off)</option>
                                <option value="recurring">Every time this fee is renewed (recurring)</option>
                            </select>
                        </div>
                        <div class="form-group" style="grid-column:1/-1;">
                            <label>Reason *</label>
                            <textarea id="sw-reason" rows="2" placeholder="Reason for waiver (e.g., scholarship, financial hardship)…" style="padding:8px 12px;border-radius:6px;border:1px solid var(--border-medium);width:100%;"></textarea>
                        </div>
                        <div id="sw-fee-preview" class="form-group" style="grid-column:1/-1;"></div>
                    </div>
                    <div style="margin-top:12px;padding:8px 12px;background:var(--bg-tertiary);border-radius:6px;font-size:0.75rem;color:var(--text-muted);">
                        📅 Waiver will be applied to ${(state.academicYears || []).find(y => y.id === selectedYearId)?.name || 'current year'}
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-outline" onclick="window.closeModal('smart-waiver-modal')">Cancel</button>
                    <button class="btn btn-warning" onclick="window._submitSmartWaiver()">🎁 Apply Waiver</button>
                </div>
            </div>
        </div>
    `;

    showModal(modalHtml);

    // Auto-load fees if student pre-filled
    if (prefillStudentId) {
        setTimeout(() => window._loadWaiverFees(), 200);
    }

    document.getElementById('sw-type').onchange = window._updateWaiverAmount;
}

// ──────────────────────────────────────────────────────────────────────
// LOAD WAIVER FEES
// ──────────────────────────────────────────────────────────────────────

window._loadWaiverFees = function () {
    const studentId = document.getElementById('sw-student')?.value;
    const preview = document.getElementById('sw-fee-preview');
    if (!studentId || !preview) return;

    const fees = (state.studentFees || [])
        .filter(f => f.student_id == studentId &&
            !f.is_waived &&
            !f.is_credit &&
            !f.manually_deleted &&
            f.academic_year_id == selectedYearId);

    if (!fees.length) {
        preview.innerHTML = '<div class="alert alert-info">No outstanding fees found for this academic year</div>';
        return;
    }

    const total = fees.reduce((s, f) => s + (f.amount || 0), 0);
    const paid = fees.reduce((s, f) => s + (f.paid_amount || 0), 0);

    preview.innerHTML = `
        <div style="background:var(--bg-tertiary);padding:10px;border-radius:8px;font-size:0.82rem;">
            <strong>Outstanding:</strong> ${fees.length} fee(s) | Total: ${fmtCurrency(total)} | Paid: ${fmtCurrency(paid)} | <strong>Balance: ${fmtCurrency(Math.max(0, total - paid))}</strong>
        </div>
    `;
    window._updateWaiverAmount();
};

// ──────────────────────────────────────────────────────────────────────
// UPDATE WAIVER AMOUNT
// ──────────────────────────────────────────────────────────────────────

window._updateWaiverAmount = function () {
    const type = document.getElementById('sw-type')?.value;
    const group = document.getElementById('sw-amount-group');
    const label = document.getElementById('sw-amount-label');
    if (!group || !label) return;

    if (type === 'full') {
        group.style.display = 'none';
    } else if (type === 'percentage') {
        group.style.display = 'block';
        label.textContent = 'Discount Percentage (%)';
        document.getElementById('sw-amount').placeholder = 'e.g., 25 for 25%';
    } else {
        group.style.display = 'block';
        label.textContent = 'Custom Amount (RWF)';
        document.getElementById('sw-amount').placeholder = 'e.g., 50000';
    }
};

// ──────────────────────────────────────────────────────────────────────
// SUBMIT SMART WAIVER
// ──────────────────────────────────────────────────────────────────────

window._submitSmartWaiver = async function () {
    const studentId = document.getElementById('sw-student')?.value;
    const catId = document.getElementById('sw-category')?.value;
    const waiverType = document.getElementById('sw-type')?.value;
    const amount = parseFloat(document.getElementById('sw-amount')?.value) || 0;
    const recurrence = document.getElementById('sw-recurrence')?.value;
    const reason = document.getElementById('sw-reason')?.value.trim();

    if (!studentId) {
        showToast('Select a student', 'warning');
        return;
    }
    if (!reason) {
        showToast('Reason is required', 'warning');
        return;
    }
    if ((waiverType === 'percentage' || waiverType === 'custom') && !amount) {
        showToast('Enter the amount or percentage', 'warning');
        return;
    }

    // Get target fees for selected year
    let fees = (state.studentFees || [])
        .filter(f => f.student_id == studentId &&
            !f.is_waived &&
            !f.is_credit &&
            !f.manually_deleted &&
            f.academic_year_id == selectedYearId);

    if (catId !== 'all') {
        fees = fees.filter(f => f.fee_category_id == catId);
    }

    if (!fees.length) {
        showToast('No outstanding fees match the selection for this academic year', 'info');
        return;
    }

    if (!await confirmDialog(`Apply waiver to ${fees.length} fee(s)? ${recurrence === 'recurring' ? 'This will recur each term.' : 'Once-off only.'}`)) return;

    let ok = 0;
    for (const fee of fees) {
        let waivedAmount = fee.amount;
        if (waiverType === 'percentage') {
            waivedAmount = Math.round((amount / 100) * fee.amount);
        } else if (waiverType === 'custom') {
            waivedAmount = Math.min(amount, fee.amount);
        }

        const result = await update('student_fees', fee.id, {
            is_waived: true,
            waiver_reason: reason,
            waiver_type: waiverType,
            waiver_amount: waivedAmount,
            waiver_recurring: recurrence === 'recurring',
            notes: reason,
            updated_at: new Date().toISOString(),
        });
        if (result) ok++;
    }

    // If recurring, save a waiver template
    if (recurrence === 'recurring') {
        const waiverTemplate = {
            student_id: studentId,
            category_id: catId,
            waiver_type: waiverType,
            amount: amount,
            reason: reason,
            academic_year_id: selectedYearId,
            created_at: new Date().toISOString(),
        };
        try {
            await insert('waiver_templates', waiverTemplate);
        } catch (e) {
            const key = `recurring_waiver_${studentId}`;
            const existing = JSON.parse(localStorage.getItem(key) || '[]');
            existing.push(waiverTemplate);
            localStorage.setItem(key, JSON.stringify(existing));
        }
    }

    await refreshTable('student_fees');
    closeModal('smart-waiver-modal');

    await notifyAction('fee_waived', {
        message: `Waiver applied: ${waiverType} to ${ok} fee(s) for student #${studentId} in ${(state.academicYears || []).find(y => y.id === selectedYearId)?.name}`,
        entity_type: 'student_fees',
        student_id: studentId,
        academic_year: selectedYearId,
    }, ['admin', 'accountant']);

    showToast(`✅ Waiver applied to ${ok} fee(s)${recurrence === 'recurring' ? ' — will recur each term' : ''}`, 'success');
    renderFeeWaivers(document.getElementById('dynamic-content'));
};

// ──────────────────────────────────────────────────────────────────────
// OPEN FULL WAIVER MODAL
// ──────────────────────────────────────────────────────────────────────

function openFullWaiverModal() {
    const isReadOnly = !isActiveYear();
    if (isReadOnly) {
        showToast('Cannot add waivers to inactive academic year', 'warning');
        return;
    }

    const students = (state.students || []).filter(s => s.status === 'Active' && s.academic_year_id == selectedYearId)
        .sort((a, b) => a.last_name.localeCompare(b.last_name));

    const modalHtml = `
        <div class="modal-overlay" id="full-waiver-modal">
            <div class="modal" style="max-width:450px;">
                <div class="modal-header">
                    <h3>🎁 Full Fee Waiver</h3>
                    <button class="modal-close" onclick="window.closeModal('full-waiver-modal')">✕</button>
                </div>
                <div class="modal-body">
                    <div class="alert alert-warning" style="font-size:0.85rem;">⚠️ Waives ALL outstanding fees for this student in ${(state.academicYears || []).find(y => y.id === selectedYearId)?.name || 'current year'}.</div>
                    <div class="form-group" style="grid-column:1/-1;">
                        <label>Student *</label>
                        <select id="fwv-student" style="padding:8px 12px;border-radius:6px;border:1px solid var(--border-medium);width:100%;">
                            <option value="">— Select Student —</option>
                            ${students.map(s => `<option value="${s.id}">${esc(s.first_name)} ${esc(s.last_name)} (${esc(s.student_code || '')})</option>`).join('')}
                        </select>
                    </div>
                    <div class="form-group" style="grid-column:1/-1;">
                        <label>Reason *</label>
                        <textarea id="fwv-reason" rows="3" placeholder="Reason for full waiver…" style="padding:8px 12px;border-radius:6px;border:1px solid var(--border-medium);width:100%;"></textarea>
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-outline" onclick="window.closeModal('full-waiver-modal')">Cancel</button>
                    <button class="btn btn-warning" onclick="window._submitFullWaiver()">🎁 Apply</button>
                </div>
            </div>
        </div>
    `;

    showModal(modalHtml);
}

// ──────────────────────────────────────────────────────────────────────
// SUBMIT FULL WAIVER
// ──────────────────────────────────────────────────────────────────────

window._submitFullWaiver = async function () {
    const studentId = document.getElementById('fwv-student')?.value;
    const reason = document.getElementById('fwv-reason')?.value.trim();

    if (!studentId) {
        showToast('Select a student', 'warning');
        return;
    }
    if (!reason) {
        showToast('Reason is required', 'warning');
        return;
    }

    const fees = (state.studentFees || [])
        .filter(f => f.student_id == studentId &&
            !f.is_paid &&
            !f.is_waived &&
            !f.is_credit &&
            f.academic_year_id == selectedYearId);

    if (!fees.length) {
        showToast('No outstanding fees for this student in this academic year', 'info');
        return;
    }

    if (!await confirmDialog(`Waive ${fees.length} outstanding fee(s) for this student in ${(state.academicYears || []).find(y => y.id === selectedYearId)?.name}?`)) return;

    let ok = 0;
    for (const fee of fees) {
        const result = await update('student_fees', fee.id, {
            is_waived: true,
            waiver_reason: reason,
            notes: `Full waiver - ${reason}`,
            updated_at: new Date().toISOString(),
        });
        if (result) ok++;
    }

    await refreshTable('student_fees');
    closeModal('full-waiver-modal');

    await notifyAction('fee_waived', {
        message: `Full waiver applied to ${ok} fee(s) for student #${studentId} in ${(state.academicYears || []).find(y => y.id === selectedYearId)?.name}`,
        entity_type: 'student_fees',
        student_id: studentId,
        academic_year: selectedYearId,
    }, ['admin', 'accountant']);

    showToast(`✅ Full waiver applied — ${ok} fee(s) waived`, 'success');
    renderFeeWaivers(document.getElementById('dynamic-content'));
};

// ──────────────────────────────────────────────────────────────────────
// REMOVE WAIVER
// ──────────────────────────────────────────────────────────────────────

async function removeWaiver(feeId) {
    const isReadOnly = !isActiveYear();
    if (isReadOnly) {
        showToast('Cannot remove waivers from inactive academic year', 'warning');
        return;
    }

    if (!await confirmDialog('Remove this waiver? Student will owe this fee again.')) return;

    const result = await update('student_fees', feeId, {
        is_waived: false,
        waiver_reason: null,
        notes: 'Waiver removed',
        updated_at: new Date().toISOString(),
    });

    if (result) {
        const fee = (state.studentFees || []).find(f => f.id === feeId);
        if (fee) fee.is_waived = false;
        showToast('✅ Waiver removed', 'success');
        await notifyAction('waiver_removed', {
            message: `Waiver removed from fee #${feeId}`,
            entity_type: 'student_fees',
            fee_id: feeId,
        }, ['admin', 'accountant']);
        renderFeeWaivers(document.getElementById('dynamic-content'));
    } else {
        showToast('Failed to remove waiver', 'error');
    }
}

// ──────────────────────────────────────────────────────────────────────
// EXPORT WAIVERS
// ──────────────────────────────────────────────────────────────────────

function exportWaivers() {
    const waivers = (state.studentFees || [])
        .filter(f => f.is_waived === true && f.academic_year_id == selectedYearId);
    const categories = state.feeCategories || [];
    const year = state.academicYears.find(y => y.id === selectedYearId);

    const data = waivers.map(f => {
        const student = getStudentById(f.student_id);
        const cat = categories.find(c => c.id === f.fee_category_id);
        const cls = student ? getClassById(student.class_id) : null;
        return {
            'Student': student ? `${student.first_name} ${student.last_name}` : '—',
            'Student Code': student?.student_code || '',
            'Class': cls?.name || '',
            'Fee Category': cat?.name || '',
            'Amount Waived (RWF)': f.amount || 0,
            'Reason': f.waiver_reason || f.notes || '',
            'Date': fmtDate(f.created_at),
            'Recurring': f.waiver_recurring ? 'Yes' : 'No',
            'Academic Year': year?.name || '',
        };
    });

    if (!data.length) {
        showToast('No waivers to export', 'info');
        return;
    }

    const filename = `Fee_Waivers_${year?.name?.replace(/\s+/g, '_') || 'All'}_${new Date().toISOString().split('T')[0]}`;
    exportToExcel(data, filename);
    showToast('✅ Fee waivers exported', 'success');
}

// ──────────────────────────────────────────────────────────────────────
// CHECK IF YEAR IS ACTIVE
// ──────────────────────────────────────────────────────────────────────

function isActiveYear() {
    const year = state.academicYears.find(y => y.id === selectedYearId);
    return year?.is_active === true;
}

// ──────────────────────────────────────────────────────────────────────
// REFRESH WAIVERS
// ──────────────────────────────────────────────────────────────────────

async function refreshWaivers() {
    const yearId = document.getElementById('waiver-year-filter')?.value;
    if (yearId) {
        selectedYearId = parseInt(yearId);
    }
    await refreshTable('student_fees');
    renderFeeWaivers(document.getElementById('dynamic-content'));
    showToast('🔄 Refreshed', 'info', 1000);
}