/**
 * ECOLE LA FONTAINE — Carry Forward Module
 * Carry forward unpaid fees from one academic year/term to the next
 * Last updated: 2026-07-04
 * 
 * CHANGES:
 * - Added academic year detection from state
 * - Source year is now the selected year (from sidebar)
 * - Target year must be after source year
 * - Only shows fees from selected year
 * - Read-only for inactive years
 */


const state = window.state || {}; // global state alias
import {
    state,
    getClassById,
    getStudentById,
    getCurrentUser,
    isAdmin,
    isAccountant,
    getCurrentAcademicYear,
    getActiveAcademicYearId,
    getYearData,
    getTermsByYear,
    getCurrentYearData
} from '../../core/state.js';
import { esc, fmtCurrency, fmtDate, fmtPct } from '../../core/utils.js';
import { insert, update, getAll, get } from '../../core/api.js';
import { getFullStudentBalance } from '../../core/fees.js';
import { notifyAction } from '../../core/notifications.js';
import { exportToExcel } from '../../core/utils.js';

// ──────────────────────────────────────────────────────────────────────
// STATE
// ──────────────────────────────────────────────────────────────────────

let carryPreviewData = [];
let selectedSourceYearId = null;

// ──────────────────────────────────────────────────────────────────────
// MAIN RENDER FUNCTION
// ──────────────────────────────────────────────────────────────────────

export async function renderCarryForward(container) {
    if (!container) return;

    const user = getCurrentUser();
    if (user?.role !== 'admin' && user?.role !== 'accountant') {
        container.innerHTML = '<div class="alert alert-danger">Access denied. Admin or Accountant privileges required.</div>';
        return;
    }

    await ensureStateLoaded();

    // Get selected year from state (set by sidebar)
    const selectedYearId = state.filters?.academic_year_id || state.currentAcadYear?.id;
    const sourceYear = (state.academicYears || []).find(y => y.id === selectedYearId);
    const currentYear = getCurrentAcademicYear();

    // Only allow carry forward from active years
    const isSourceActive = sourceYear?.is_active === true;

    // Get future years (after source year)
    const futureYears = (state.academicYears || [])
        .filter(y => y.id > selectedYearId)
        .sort((a, b) => a.id - b.id);

    const classes = (state.classes || []).filter(c => c.is_active !== false);

    // If no source year selected, use current year
    if (!selectedSourceYearId) {
        selectedSourceYearId = selectedYearId || currentYear?.id;
    }

    container.innerHTML = `
        <div class="dash-card">
            <div class="dash-card-header" style="flex-wrap:wrap;gap:8px;">
                <span class="dash-card-title">🔄 Carry Forward Unpaid Fees</span>
                <div class="btn-group" style="flex-wrap:wrap;gap:6px;">
                    <select id="carry-source-year" onchange="window._onSourceYearChange()" style="padding:6px 10px;border-radius:6px;border:1px solid var(--border-medium);font-size:0.8rem;">
                        ${(state.academicYears || []).sort((a, b) => b.id - a.id).map(y => `
                            <option value="${y.id}" ${y.id === selectedSourceYearId ? 'selected' : ''}>
                                ${esc(y.name)} ${y.id === currentYear?.id ? '🟢' : (y.is_active ? '🟡' : '🔒')}
                            </option>
                        `).join('')}
                    </select>
                    ${!isSourceActive ? '<span class="badge badge-neutral" style="font-size:0.65rem;">🔒 Read-only</span>' : ''}
                </div>
            </div>
            <div class="dash-card-body">
                <div class="alert alert-warning" style="font-size:0.85rem;">
                    <strong>⚠️ Important:</strong> This will transfer unpaid fees from <strong>${esc(sourceYear?.name || 'selected year')}</strong>
                    to the selected target year. Paid fees will NOT be carried forward.
                    ${!isSourceActive ? '<br><strong>🔒 This year is inactive. Carry forward is not available for inactive years.</strong>' : ''}
                </div>

                <div class="form-grid" style="margin-bottom:20px;">
                    <div class="form-group">
                        <label>From Academic Year</label>
                        <input type="text" readonly value="${esc(sourceYear?.name || 'Current Year')} ${isSourceActive ? '🟢 Active' : '🔒 Inactive'}" style="padding:8px 12px;border-radius:6px;border:1px solid var(--border-medium);background:var(--bg-tertiary);width:100%;">
                    </div>
                    <div class="form-group">
                        <label>To Academic Year *</label>
                        <select id="carry-target-year" style="padding:8px 12px;border-radius:6px;border:1px solid var(--border-medium);width:100%;" ${!isSourceActive ? 'disabled' : ''}>
                            <option value="">-- Select Target Year --</option>
                            ${futureYears.map(y => `<option value="${y.id}">${esc(y.name)} ${y.is_active ? '🟢' : '🔒'}</option>`).join('')}
                        </select>
                        ${!futureYears.length ? '<small style="color:var(--text-muted);">No future years available</small>' : ''}
                    </div>
                    <div class="form-group">
                        <label>Filter by Class</label>
                        <select id="carry-class-filter" style="padding:8px 12px;border-radius:6px;border:1px solid var(--border-medium);width:100%;" ${!isSourceActive ? 'disabled' : ''}>
                            <option value="">All Classes</option>
                            ${classes.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Minimum Balance to Carry (RWF)</label>
                        <input type="number" id="carry-min-balance" value="0" min="0" step="1000" style="padding:8px 12px;border-radius:6px;border:1px solid var(--border-medium);width:100%;" ${!isSourceActive ? 'disabled' : ''}>
                    </div>
                </div>

                <div class="btn-group" style="margin-bottom:20px;" ${!isSourceActive ? 'style="opacity:0.5;"' : ''}>
                    <button class="btn btn-outline" onclick="window._previewCarryForward()" ${!isSourceActive ? 'disabled' : ''}>👁️ Preview</button>
                    <button class="btn btn-warning" onclick="window._executeCarryForward()" ${!isSourceActive ? 'disabled' : ''}>🔄 Execute Carry Forward</button>
                    <button class="btn btn-outline" onclick="window._exportCarryPreview()" ${!isSourceActive ? 'disabled' : ''}>📥 Export Preview</button>
                </div>

                <div id="carry-preview-container" style="display:none;">
                    <h4 style="margin-bottom:8px;">📋 Preview: Fees to be Carried Forward</h4>
                    <div id="carry-preview-table" class="table-wrapper">
                        <div class="loading-container"><div class="spinner"></div><p>Loading preview...</p></div>
                    </div>
                </div>
            </div>
        </div>

        <div class="dash-card" style="margin-top:20px;">
            <div class="dash-card-header">
                <span class="dash-card-title">📜 Carry Forward History</span>
                <button class="btn btn-sm btn-outline" onclick="window._loadCarryHistory()">🔄 Refresh</button>
            </div>
            <div class="dash-card-body">
                <div id="carry-history-container" class="table-wrapper">
                    <div class="loading-container"><div class="spinner"></div><p>Loading history...</p></div>
                </div>
            </div>
        </div>
    `;

    window._previewCarryForward = previewCarryForward;
    window._executeCarryForward = executeCarryForward;
    window._exportCarryPreview = exportCarryPreview;
    window._loadCarryHistory = loadCarryHistory;
    window._onSourceYearChange = onSourceYearChange;

    await loadCarryHistory();
}

// ──────────────────────────────────────────────────────────────────────
// ON SOURCE YEAR CHANGE
// ──────────────────────────────────────────────────────────────────────

function onSourceYearChange() {
    const yearId = document.getElementById('carry-source-year')?.value;
    if (yearId) {
        selectedSourceYearId = parseInt(yearId);
        // Update the from year display and refresh the page
        renderCarryForward(document.getElementById('dynamic-content'));
    }
}

// ──────────────────────────────────────────────────────────────────────
// PREVIEW CARRY FORWARD
// ──────────────────────────────────────────────────────────────────────

async function previewCarryForward() {
    const sourceYearId = selectedSourceYearId || state.filters?.academic_year_id || state.currentAcadYear?.id;
    const targetYearId = document.getElementById('carry-target-year')?.value;
    const classFilter = document.getElementById('carry-class-filter')?.value;
    const minBalance = parseFloat(document.getElementById('carry-min-balance')?.value) || 0;

    if (!targetYearId) {
        showToast('Please select a target academic year', 'warning');
        return;
    }

    if (targetYearId == sourceYearId) {
        showToast('Target year must be different from source year', 'warning');
        return;
    }

    const container = document.getElementById('carry-preview-container');
    const table = document.getElementById('carry-preview-table');

    container.style.display = 'block';
    table.innerHTML = '<div class="loading-container"><div class="spinner"></div><p>Generating preview...</p></div>';

    // Get all active students in source year
    let students = (state.students || [])
        .filter(s => s.status === 'Active' && !s.is_deleted && s.academic_year_id == sourceYearId);

    if (classFilter) {
        students = students.filter(s => s.class_id == classFilter);
    }

    const sourceYear = (state.academicYears || []).find(y => y.id == sourceYearId);
    const feesToCarry = [];
    let totalAmount = 0;

    for (const student of students) {
        // Get outstanding fees for this student in the source year
        const studentFees = (state.studentFees || [])
            .filter(f =>
                f.student_id === student.id &&
                !f.is_paid &&
                !f.is_waived &&
                !f.is_credit &&
                f.academic_year_id == sourceYearId
            );

        for (const fee of studentFees) {
            const due = (fee.amount || 0) - (fee.paid_amount || 0);
            if (due > minBalance) {
                const cls = getClassById(student.class_id);
                feesToCarry.push({
                    student: student,
                    class: cls,
                    fee: fee,
                    amount: due,
                    category: (state.feeCategories || []).find(c => c.id === fee.fee_category_id)?.name || 'Unknown',
                });
                totalAmount += due;
            }
        }
    }

    carryPreviewData = feesToCarry;

    if (!feesToCarry.length) {
        table.innerHTML = `
            <div class="alert alert-info">
                No unpaid fees to carry forward from ${sourceYear?.name || 'selected year'}.
                ${students.length === 0 ? '<br>No active students found in this year.' : ''}
            </div>
        `;
        return;
    }

    const rows = feesToCarry.map((f, i) => `
        <tr>
            <td>${i + 1}</td>
            <td><strong>${esc(f.student.first_name)} ${esc(f.student.last_name)}</strong></td>
            <td>${esc(f.student.student_code || '—')}</td>
            <td>${esc(f.class?.name || '—')}</td>
            <td>${esc(f.category)}</td>
            <td style="text-align:right;font-weight:600;">${fmtCurrency(f.amount)}</td>
        </tr>
    `).join('');

    table.innerHTML = `
        <div style="display:flex;justify-content:space-between;margin-bottom:12px;padding:8px 12px;background:var(--bg-tertiary);border-radius:6px;flex-wrap:wrap;gap:8px;">
            <span><strong>📅 Source:</strong> ${esc(sourceYear?.name || '—')}</span>
            <span><strong>🎯 Target:</strong> ${esc((state.academicYears || []).find(y => y.id == targetYearId)?.name || '—')}</span>
            <span><strong>📋 Records:</strong> ${feesToCarry.length}</span>
            <span><strong>💰 Total:</strong> ${fmtCurrency(totalAmount)}</span>
        </div>
        <table class="data-table" style="font-size:0.8rem;">
            <thead>
                <tr>
                    <th>#</th>
                    <th>Student</th>
                    <th>Code</th>
                    <th>Class</th>
                    <th>Fee Category</th>
                    <th style="text-align:right;">Amount</th>
                </tr>
            </thead>
            <tbody>${rows}</tbody>
        </table>
    `;

    showToast(`✅ ${feesToCarry.length} fees ready to carry forward (${fmtCurrency(totalAmount)})`, 'info');
}

// ──────────────────────────────────────────────────────────────────────
// EXECUTE CARRY FORWARD
// ──────────────────────────────────────────────────────────────────────

async function executeCarryForward() {
    if (!carryPreviewData.length) {
        showToast('Run preview first', 'warning');
        return;
    }

    const sourceYearId = selectedSourceYearId || state.filters?.academic_year_id || state.currentAcadYear?.id;
    const targetYearId = document.getElementById('carry-target-year')?.value;

    if (!targetYearId) {
        showToast('Please select a target academic year', 'warning');
        return;
    }

    const sourceYear = (state.academicYears || []).find(y => y.id == sourceYearId);
    const targetYear = (state.academicYears || []).find(y => y.id == targetYearId);

    if (!await confirmDialog(
        `⚠️ CARRY FORWARD CONFIRMATION\n\n` +
        `This will transfer ${carryPreviewData.length} unpaid fee(s) from:\n` +
        `📅 ${sourceYear?.name || 'Current Year'} → ${targetYear?.name || 'Next Year'}\n` +
        `💰 Total Amount: ${fmtCurrency(carryPreviewData.reduce((sum, f) => sum + f.amount, 0))}\n\n` +
        `This action CANNOT be undone.\n\n` +
        `Proceed?`
    )) return;

    const btn = document.querySelector('.btn-warning');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-sm"></span> Processing...';

    let carried = 0;
    let errors = 0;

    try {
        const targetTerm = (state.terms || []).find(t => t.academic_year_id == targetYearId);

        for (const item of carryPreviewData) {
            try {
                await insert('student_fees', {
                    student_id: item.student.id,
                    fee_category_id: item.fee.fee_category_id,
                    term_id: targetTerm?.id || null,
                    academic_year_id: parseInt(targetYearId),
                    amount: item.amount,
                    paid_amount: 0,
                    is_paid: false,
                    is_waived: false,
                    is_credit: false,
                    notes: `Carried forward from ${sourceYear?.name || 'previous year'} (original fee ID: ${item.fee.id})`,
                    due_date: targetTerm?.end_date || null,
                    created_at: new Date().toISOString(),
                });
                carried++;
            } catch (e) {
                errors++;
                console.error('[CarryForward] Error:', e);
            }
        }

        await notifyAction('carry_forward', {
            message: `Carried forward ${carried} fees from ${sourceYear?.name || 'previous year'} to ${targetYear?.name || 'next year'}`,
            entity_type: 'student_fees',
            details: { sourceYear: sourceYearId, targetYear: targetYearId, count: carried },
        }, ['admin', 'accountant']);

        await refreshTable('student_fees');

        showToast(`✅ Carried forward ${carried} fees${errors ? ` (${errors} errors)` : ''}`, errors ? 'warning' : 'success');

        carryPreviewData = [];
        document.getElementById('carry-preview-container').style.display = 'none';

        // Refresh history
        await loadCarryHistory();

    } catch (error) {
        showToast('Error during carry forward: ' + error.message, 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = '🔄 Execute Carry Forward';
    }
}

// ──────────────────────────────────────────────────────────────────────
// EXPORT CARRY PREVIEW
// ──────────────────────────────────────────────────────────────────────

function exportCarryPreview() {
    if (!carryPreviewData.length) {
        showToast('Run preview first', 'warning');
        return;
    }

    const sourceYear = (state.academicYears || []).find(y => y.id == selectedSourceYearId);
    const targetYearId = document.getElementById('carry-target-year')?.value;
    const targetYear = (state.academicYears || []).find(y => y.id == targetYearId);

    const data = carryPreviewData.map(f => ({
        'Student Name': `${f.student.first_name} ${f.student.last_name}`,
        'Student Code': f.student.student_code || '',
        'Class': f.class?.name || '',
        'Fee Category': f.category,
        'Amount (RWF)': f.amount,
        'Original Fee ID': f.fee.id,
        'Due Date': fmtDate(f.fee.due_date),
        'Source Year': sourceYear?.name || '',
        'Target Year': targetYear?.name || '',
    }));

    const filename = `Carry_Forward_${sourceYear?.name?.replace(/\s+/g, '_') || 'Preview'}_${new Date().toISOString().split('T')[0]}`;
    exportToExcel(data, filename);
    showToast('✅ Carry forward preview exported', 'success');
}

// ──────────────────────────────────────────────────────────────────────
// LOAD CARRY HISTORY
// ──────────────────────────────────────────────────────────────────────

async function loadCarryHistory() {
    const container = document.getElementById('carry-history-container');
    if (!container) return;

    container.innerHTML = '<div class="loading-container"><div class="spinner"></div><p>Loading history...</p></div>';

    try {
        // Find fees that were carried forward (look for notes indicating carry forward)
        const fees = (state.studentFees || [])
            .filter(f => (f.notes || '').toLowerCase().includes('carried forward'))
            .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
            .slice(0, 100);

        if (!fees.length) {
            container.innerHTML = '<div class="alert alert-info">No carry forward history found.</div>';
            return;
        }

        const rows = fees.map(f => {
            const student = getStudentById(f.student_id);
            const cls = getClassById(student?.class_id);
            const term = getTermById(f.term_id);
            const year = (state.academicYears || []).find(y => y.id === f.academic_year_id);
            return `
                <tr>
                    <td>${fmtDate(f.created_at)}</td>
                    <td><strong>${esc(student ? `${student.first_name} ${student.last_name}` : '—')}</strong></td>
                    <td>${esc(cls?.name || '—')}</td>
                    <td style="text-align:right;font-weight:600;">${fmtCurrency(f.amount)}</td>
                    <td>${esc(term?.name || '—')}</td>
                    <td>${esc(year?.name || '—')}</td>
                    <td style="font-size:0.65rem;color:var(--text-muted);">${esc(f.notes || '')}</td>
                </tr>
            `;
        }).join('');

        container.innerHTML = `
            <table class="data-table" style="font-size:0.8rem;">
                <thead>
                    <tr>
                        <th>Date</th>
                        <th>Student</th>
                        <th>Class</th>
                        <th style="text-align:right;">Amount</th>
                        <th>Term</th>
                        <th>Year</th>
                        <th>Notes</th>
                    </tr>
                </thead>
                <tbody>${rows}</tbody>
            </table>
        `;

    } catch (error) {
        container.innerHTML = `<div class="alert alert-danger">Error loading history: ${esc(error.message)}</div>`;
    }
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

function getTermById(id) {
    return (state.terms || []).find(t => t.id === parseInt(id));
}

async function ensureStateLoaded() {
    if (!state.classes || !state.classes.length) {
        const fn = window.loadInitialData || (async () => {});
        await fn(false);
    }
}

async function refreshTable(table) {
    const getAll = window.getAll || (async () => []);
    if (table === 'student_fees') {
        state.studentFees = await getAll('student_fees');
    }
}

function confirmDialog(message) {
    return new Promise((resolve) => {
        const modalId = `confirm-modal-${Date.now()}`;
        const html = `
            <div class="modal-overlay" id="${modalId}">
                <div class="modal modal-sm">
                    <div class="modal-header"><h3>⚠️ Confirm</h3><button class="modal-close" onclick="window.closeModal('${modalId}')">✕</button></div>
                    <div class="modal-body"><pre style="white-space:pre-wrap;font-family:inherit;margin:0;">${esc(message)}</pre></div>
                    <div class="modal-footer">
                        <button class="btn btn-outline" onclick="window.closeModal('${modalId}'); window._confirmResolve(false)">Cancel</button>
                        <button class="btn btn-danger" onclick="window.closeModal('${modalId}'); window._confirmResolve(true)">Confirm</button>
                    </div>
                </div>
            </div>
        `;
        showModal(html);
        window._confirmResolve = resolve;
    });
}

function showModal(html) {
    const container = document.getElementById('modals-container');
    if (container) container.innerHTML = html;
}

function closeModal(modalId) {
    if (modalId) {
        const modal = document.getElementById(modalId);
        if (modal) modal.remove();
    } else {
        const container = document.getElementById('modals-container');
        if (container) container.innerHTML = '';
    }
}

// Export functions to window
window._previewCarryForward = previewCarryForward;
window._executeCarryForward = executeCarryForward;
window._exportCarryPreview = exportCarryPreview;
window._loadCarryHistory = loadCarryHistory;
window._onSourceYearChange = onSourceYearChange;