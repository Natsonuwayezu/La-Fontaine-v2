/**
 * ECOLE LA FONTAINE — Credit Balances Module
 * Manage student credit balances (overpayments) and apply to fees
 * Last updated: 2026-07-04
 * 
 * CHANGES:
 * - Added academic year filtering
 * - Credit balances are now year-specific
 * - Year selector in filters
 * - Summary stats reflect selected year
 * - Read-only mode for inactive years
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
    getActiveAcademicYearId
} from '../../core/state.js';
import { esc, fmtCurrency, fmtDate } from '../../core/utils.js';
import { getStudentCreditBalance, getFullStudentBalance } from '../../core/fees.js';
import { insert, update, getAll, refreshTable } from '../../core/api.js';
import { notifyAction } from '../../core/notifications.js';
import { exportToExcel } from '../../core/utils.js';

// ──────────────────────────────────────────────────────────────────────
// STATE
// ──────────────────────────────────────────────────────────────────────

let selectedYearId = null;
let creditData = [];

// ──────────────────────────────────────────────────────────────────────
// MAIN RENDER FUNCTION
// ──────────────────────────────────────────────────────────────────────

export async function renderCreditBalances(container) {
    if (!container) return;

    const user = getCurrentUser();
    if (user?.role === 'teacher') {
        container.innerHTML = '<div class="alert alert-danger">Access denied. Teachers cannot view credit balances.</div>';
        return;
    }

    await ensureStateLoaded();

    const classes = (state.classes || []).filter(c => c.is_active !== false);
    const currentYear = getCurrentAcademicYear();
    const years = (state.academicYears || []).sort((a, b) => b.id - a.id);

    // Default to current year
    if (!selectedYearId) {
        selectedYearId = currentYear?.id || null;
    }

    const selectedYear = years.find(y => y.id === selectedYearId);
    const isActiveYear = selectedYear?.is_active === true;
    const isCurrentYear = selectedYear?.id === currentYear?.id;

    container.innerHTML = `
        <div class="dash-card">
            <div class="dash-card-header" style="flex-wrap:wrap;gap:8px;">
                <span class="dash-card-title">⭐ Credit Balances Management</span>
                <div class="btn-group" style="flex-wrap:wrap;gap:6px;">
                    <select id="credit-year" onchange="window._renderCreditTable()" style="padding:6px 10px;border-radius:6px;border:1px solid var(--border-medium);font-size:0.8rem;">
                        ${years.map(y => `
                            <option value="${y.id}" ${y.id === selectedYearId ? 'selected' : ''}>
                                ${esc(y.name)} ${y.id === currentYear?.id ? '🟢' : ''}
                            </option>
                        `).join('')}
                    </select>
                    <button class="btn btn-sm btn-outline" onclick="window._exportCreditBalances()">📥 Export</button>
                    <button class="btn btn-sm btn-outline" onclick="window._refreshCreditBalances()">🔄 Refresh</button>
                    ${!isActiveYear ? '<span class="badge badge-neutral" style="font-size:0.65rem;">🔒 Read-only</span>' : ''}
                </div>
            </div>
            <div class="dash-card-body">
                <div style="font-size:0.75rem;color:var(--text-muted);margin-bottom:12px;padding:6px 12px;background:var(--bg-tertiary);border-radius:6px;display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px;">
                    <span>📅 ${selectedYear?.name || 'All Years'} ${isActiveYear ? '🟢 Active' : '🔒 Inactive (Read-Only)'}</span>
                    <span>${isCurrentYear ? '✅ Current Year' : ''}</span>
                </div>

                <div class="filters-bar" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px;margin-bottom:16px;">
                    <div class="form-group" style="margin:0;">
                        <label style="font-size:0.7rem;">Class</label>
                        <select id="credit-class-filter" onchange="window._renderCreditTable()" style="padding:6px 10px;border-radius:6px;border:1px solid var(--border-medium);width:100%;">
                            <option value="">All Classes</option>
                            ${classes.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}
                        </select>
                    </div>
                    <div class="form-group" style="margin:0;">
                        <label style="font-size:0.7rem;">Status</label>
                        <select id="credit-status-filter" onchange="window._renderCreditTable()" style="padding:6px 10px;border-radius:6px;border:1px solid var(--border-medium);width:100%;">
                            <option value="">All Status</option>
                            <option value="has_credit">Has Credit ⭐</option>
                            <option value="no_credit">No Credit</option>
                        </select>
                    </div>
                    <div class="form-group" style="margin:0;grid-column:span 2;">
                        <label style="font-size:0.7rem;">Search</label>
                        <input type="text" id="credit-search" placeholder="🔍 Search student..." oninput="window._renderCreditTable()" style="padding:6px 10px;border-radius:6px;border:1px solid var(--border-medium);width:100%;">
                    </div>
                    <span class="result-count" id="credit-count" style="align-self:center;font-size:0.8rem;color:var(--text-muted);"></span>
                </div>

                <div class="table-wrapper" id="credit-table-container">
                    <div class="loading-container"><div class="spinner"></div><p>Loading credit balances...</p></div>
                </div>
            </div>
        </div>

        <div class="dash-card" style="margin-top:20px;">
            <div class="dash-card-header">
                <span class="dash-card-title">📊 Credit Summary</span>
            </div>
            <div class="dash-card-body">
                <div id="credit-summary-stats" class="stats-grid" style="grid-template-columns:repeat(4,1fr);">
                    <div class="loading-container"><div class="spinner"></div><p>Loading stats...</p></div>
                </div>
            </div>
        </div>
    `;

    window._renderCreditTable = renderCreditTable;
    window._exportCreditBalances = exportCreditBalances;
    window._refreshCreditBalances = refreshCreditBalances;
    window._applyCreditToFee = applyCreditToFee;

    await renderCreditTable();
    await renderCreditSummary();
}

// ──────────────────────────────────────────────────────────────────────
// RENDER CREDIT TABLE
// ──────────────────────────────────────────────────────────────────────

async function renderCreditTable() {
    const container = document.getElementById('credit-table-container');
    if (!container) return;

    const yearId = document.getElementById('credit-year')?.value;
    const classId = document.getElementById('credit-class-filter')?.value;
    const statusFilter = document.getElementById('credit-status-filter')?.value;
    const search = (document.getElementById('credit-search')?.value || '').toLowerCase();

    // Update selected year
    if (yearId) {
        selectedYearId = parseInt(yearId);
    }

    // Get students for selected year
    let students = (state.students || []).filter(s => s.status === 'Active' && !s.is_deleted);

    if (selectedYearId) {
        students = students.filter(s => s.academic_year_id == selectedYearId);
    }
    if (classId) students = students.filter(s => s.class_id == classId);
    if (search) {
        students = students.filter(s =>
            (s.first_name || '').toLowerCase().includes(search) ||
            (s.last_name || '').toLowerCase().includes(search) ||
            (s.student_code || '').toLowerCase().includes(search)
        );
    }

    const creditData = [];
    for (const student of students) {
        // Get year-specific credit
        const credit = getStudentCreditBalance(student.id);
        // Only show credit if it exists for this year's fees
        const hasYearCredit = credit.total > 0;

        if (hasYearCredit || statusFilter !== 'has_credit') {
            const balance = await getFullStudentBalance(student.id);
            creditData.push({
                student,
                credit,
                balance,
                class: getClassById(student.class_id),
                hasYearCredit,
            });
        }
    }

    // Filter by status
    let filtered = creditData;
    if (statusFilter === 'has_credit') {
        filtered = creditData.filter(d => d.credit.available > 0);
    } else if (statusFilter === 'no_credit') {
        filtered = creditData.filter(d => d.credit.available === 0);
    }

    const countEl = document.getElementById('credit-count');
    if (countEl) countEl.textContent = `${filtered.length} student${filtered.length !== 1 ? 's' : ''}`;

    if (!filtered.length) {
        container.innerHTML = `
            <div style="text-align:center;padding:40px;color:var(--text-muted);">
                ${students.length === 0 && selectedYearId ?
                `No students found for ${(state.academicYears || []).find(y => y.id === selectedYearId)?.name || 'selected year'}` :
                'No students with credit balances found.'}
            </div>
        `;
        return;
    }

    const rows = filtered.map(d => {
        const creditAvail = d.credit.available || 0;
        const hasCredit = creditAvail > 0;
        const statusClass = hasCredit ? 'badge-success' : 'badge-neutral';
        const statusText = hasCredit ? `⭐ ${fmtCurrency(creditAvail)}` : 'No Credit';

        return `
            <tr>
                <td><strong>${esc(d.student.first_name)} ${esc(d.student.last_name)}</strong></td>
                <td>${esc(d.student.student_code || '—')}</td>
                <td>${esc(d.class?.name || '—')}</td>
                <td style="text-align:right;">${fmtCurrency(d.credit.total)}</td>
                <td style="text-align:right;">${fmtCurrency(d.credit.used)}</td>
                <td style="text-align:right;font-weight:700;color:${hasCredit ? 'var(--success)' : 'var(--text-muted)'};">${fmtCurrency(creditAvail)}</td>
                <td style="text-align:center;"><span class="badge ${statusClass}">${statusText}</span></td>
                <td style="text-align:center;">
                    ${hasCredit ? `<button class="btn btn-sm btn-primary" onclick="window._applyCreditToFee(${d.student.id})" style="padding:2px 8px;font-size:0.7rem;">💰 Apply</button>` : ''}
                    <button class="btn btn-sm btn-outline" onclick="window.navigateToWithData('student-details', { student_id: ${d.student.id} })" style="padding:2px 6px;font-size:0.7rem;">👁️</button>
                </td>
            </tr>
        `;
    }).join('');

    container.innerHTML = `
        <table class="data-table" style="font-size:0.8rem;">
            <thead>
                <tr>
                    <th>Student</th>
                    <th>Code</th>
                    <th>Class</th>
                    <th style="text-align:right;">Total Credit</th>
                    <th style="text-align:right;">Used</th>
                    <th style="text-align:right;">Available</th>
                    <th style="text-align:center;">Status</th>
                    <th style="text-align:center;">Action</th>
                </tr>
            </thead>
            <tbody>${rows}</tbody>
        </table>
    `;

    // Store for export
    window._creditData = filtered;
}

// ──────────────────────────────────────────────────────────────────────
// RENDER CREDIT SUMMARY
// ──────────────────────────────────────────────────────────────────────

async function renderCreditSummary() {
    const container = document.getElementById('credit-summary-stats');
    if (!container) return;

    const students = (state.students || [])
        .filter(s => s.status === 'Active' && !s.is_deleted);

    // Filter by selected year
    let filteredStudents = students;
    if (selectedYearId) {
        filteredStudents = students.filter(s => s.academic_year_id == selectedYearId);
    }

    let totalCredit = 0, totalUsed = 0, totalAvailable = 0, studentsWithCredit = 0;

    for (const s of filteredStudents) {
        const credit = getStudentCreditBalance(s.id);
        totalCredit += credit.total;
        totalUsed += credit.used;
        totalAvailable += credit.available;
        if (credit.available > 0) studentsWithCredit++;
    }

    const yearName = (state.academicYears || []).find(y => y.id === selectedYearId)?.name || 'All Years';

    container.innerHTML = `
        <div class="stat-card" style="padding:14px;text-align:center;">
            <div class="stat-value" style="color:var(--info);">${fmtCurrency(totalCredit)}</div>
            <div class="stat-label">⭐ Total Credit Issued</div>
        </div>
        <div class="stat-card" style="padding:14px;text-align:center;">
            <div class="stat-value" style="color:var(--warning);">${fmtCurrency(totalUsed)}</div>
            <div class="stat-label">📤 Credit Used</div>
        </div>
        <div class="stat-card" style="padding:14px;text-align:center;">
            <div class="stat-value" style="color:var(--success);">${fmtCurrency(totalAvailable)}</div>
            <div class="stat-label">✅ Available</div>
        </div>
        <div class="stat-card" style="padding:14px;text-align:center;">
            <div class="stat-value">${studentsWithCredit}</div>
            <div class="stat-label">👥 Students with Credit</div>
        </div>
        <div class="stat-card" style="padding:14px;text-align:center;background:var(--bg-tertiary);">
            <div class="stat-value" style="font-size:0.8rem;font-weight:400;">${esc(yearName)}</div>
            <div class="stat-label">📅 Academic Year</div>
        </div>
    `;
}

// ──────────────────────────────────────────────────────────────────────
// APPLY CREDIT TO FEE
// ──────────────────────────────────────────────────────────────────────

async function applyCreditToFee(studentId) {
    const student = getStudentById(studentId);
    if (!student) {
        showToast('Student not found', 'error');
        return;
    }

    // Check if year is editable
    const year = (state.academicYears || []).find(y => y.id === selectedYearId);
    if (year && !year.is_active) {
        showToast('Cannot apply credit for inactive academic year', 'warning');
        return;
    }

    const credit = getStudentCreditBalance(studentId);
    if (credit.available <= 0) {
        showToast('No credit available for this student', 'warning');
        return;
    }

    // Find outstanding fees for the selected year
    let outstandingFees = (state.studentFees || [])
        .filter(f => f.student_id === studentId &&
            !f.is_paid &&
            !f.is_waived &&
            !f.is_credit);

    if (selectedYearId) {
        outstandingFees = outstandingFees.filter(f => f.academic_year_id == selectedYearId);
    }

    if (!outstandingFees.length) {
        showToast('No outstanding fees to apply credit to', 'warning');
        return;
    }

    // Sort by oldest first
    outstandingFees.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

    let remainingCredit = credit.available;
    let applied = 0;

    for (const fee of outstandingFees) {
        if (remainingCredit <= 0) break;

        const due = (fee.amount || 0) - (fee.paid_amount || 0);
        if (due <= 0) continue;

        const applyAmount = Math.min(remainingCredit, due);
        const newPaid = (fee.paid_amount || 0) + applyAmount;

        await update('student_fees', fee.id, {
            paid_amount: newPaid,
            is_paid: newPaid >= (fee.amount || 0),
            updated_at: new Date().toISOString(),
        });

        // Update credit used
        remainingCredit -= applyAmount;
        applied++;
    }

    // Update credit balance
    if (remainingCredit < credit.available) {
        const creditFees = (state.studentFees || [])
            .filter(f => f.student_id === studentId && f.is_credit === true);
        for (const cf of creditFees) {
            const used = (cf.paid_amount || 0) + (credit.available - remainingCredit);
            await update('student_fees', cf.id, {
                paid_amount: used,
                updated_at: new Date().toISOString(),
            });
            break;
        }
    }

    await refreshTable('student_fees');
    await notifyAction('credit_applied', {
        message: `Applied credit to ${applied} fee(s) for ${student.first_name} ${student.last_name}`,
        entity_type: 'student_fees',
        student_id: studentId,
        academic_year: selectedYearId,
    }, ['admin', 'accountant']);

    showToast(`✅ Applied credit to ${applied} fee(s)`, 'success');
    await renderCreditTable();
    await renderCreditSummary();
}

// ──────────────────────────────────────────────────────────────────────
// EXPORT CREDIT BALANCES
// ──────────────────────────────────────────────────────────────────────

async function exportCreditBalances() {
    const students = (state.students || [])
        .filter(s => s.status === 'Active' && !s.is_deleted);

    // Filter by selected year
    let filteredStudents = students;
    if (selectedYearId) {
        filteredStudents = students.filter(s => s.academic_year_id == selectedYearId);
    }

    const yearName = (state.academicYears || []).find(y => y.id === selectedYearId)?.name || 'All Years';
    const data = [];

    for (const s of filteredStudents) {
        const credit = getStudentCreditBalance(s.id);
        if (credit.total > 0) {
            const cls = getClassById(s.class_id);
            data.push({
                'Student Name': `${s.first_name} ${s.last_name}`,
                'Student Code': s.student_code || '',
                'Class': cls?.name || '',
                'Total Credit (RWF)': credit.total,
                'Credit Used (RWF)': credit.used,
                'Available Credit (RWF)': credit.available,
                'Status': credit.available > 0 ? 'Has Credit' : 'Fully Used',
                'Academic Year': yearName,
            });
        }
    }

    if (!data.length) {
        showToast('No credit balances to export', 'info');
        return;
    }

    const filename = `Credit_Balances_${yearName.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}`;
    exportToExcel(data, filename);
    showToast('✅ Credit balances exported', 'success');
}

// ──────────────────────────────────────────────────────────────────────
// REFRESH CREDIT BALANCES
// ──────────────────────────────────────────────────────────────────────

async function refreshCreditBalances() {
    await refreshTable('student_fees');
    await renderCreditTable();
    await renderCreditSummary();
    showToast('🔄 Refreshed', 'info', 1000);
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
    if (!state.classes || !state.classes.length) {
        const fn = window.loadInitialData || (async () => {});
        await fn(false);
    }
}

// Export functions to window
window._renderCreditTable = renderCreditTable;
window._exportCreditBalances = exportCreditBalances;
window._refreshCreditBalances = refreshCreditBalances;
window._applyCreditToFee = applyCreditToFee;