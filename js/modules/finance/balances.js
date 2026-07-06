/**
 * ECOLE LA FONTAINE — Student Balances Module
 * View all student balances with filtering, export, and academic year support
 * Last updated: 2026-07-04
 * 
 * CHANGES:
 * - Added academic year filtering
 * - Balances are now year-specific
 * - Year selector in filters
 * - Summary stats reflect selected year
 * - Read-only mode for inactive years
 */


import {
    state,
    getClassById,
    getCurrentUser,
    isAdmin,
    isAccountant,
    getCurrentAcademicYear,
    getActiveAcademicYearId,
    getCurrentYearStudents,
    getCurrentYearData,
    getYearData
} from '../../core/state.js';
import { esc, fmtCurrency, fmtDate } from '../../core/utils.js';
import { getFullStudentBalance, getStudentCreditBalance } from '../../core/fees.js';
import { exportToExcel } from '../../core/utils.js';
import { refreshTable } from '../../core/api.js';

// ──────────────────────────────────────────────────────────────────────
// STATE
// ──────────────────────────────────────────────────────────────────────

let selectedYearId = null;
let balanceData = [];

// ──────────────────────────────────────────────────────────────────────
// MAIN RENDER FUNCTION
// ──────────────────────────────────────────────────────────────────────

export async function renderBalances(container) {
    if (!container) return;

    const user = getCurrentUser();
    if (!isAdmin() && !isAccountant()) {
        container.innerHTML = '<div class="alert alert-danger">Access denied.</div>';
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
                <span class="dash-card-title">💰 Student Fee Balances</span>
                <div class="btn-group" style="flex-wrap:wrap;gap:6px;">
                    <select id="bal-year" onchange="window._loadBalances()" style="padding:6px 10px;border-radius:6px;border:1px solid var(--border-medium);font-size:0.8rem;">
                        ${years.map(y => `
                            <option value="${y.id}" ${y.id === selectedYearId ? 'selected' : ''}>
                                ${esc(y.name)} ${y.id === currentYear?.id ? '🟢' : ''}
                            </option>
                        `).join('')}
                    </select>
                    <button class="btn btn-sm btn-outline" onclick="window._exportBalances()">📥 Export</button>
                    <button class="btn btn-sm btn-outline" onclick="window._refreshBalances()">🔄 Refresh</button>
                    ${!isActiveYear ? '<span class="badge badge-neutral" style="font-size:0.65rem;">🔒 Read-only</span>' : ''}
                </div>
            </div>
            <div class="dash-card-body">
                <div class="filters-bar" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px;margin-bottom:16px;">
                    <div class="form-group" style="margin:0;">
                        <label style="font-size:0.7rem;">Class</label>
                        <select id="bal-class" onchange="window._loadBalances()" style="padding:6px 10px;border-radius:6px;border:1px solid var(--border-medium);width:100%;">
                            <option value="">All Classes</option>
                            ${classes.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}
                        </select>
                    </div>
                    <div class="form-group" style="margin:0;">
                        <label style="font-size:0.7rem;">Status</label>
                        <select id="bal-status" onchange="window._loadBalances()" style="padding:6px 10px;border-radius:6px;border:1px solid var(--border-medium);width:100%;">
                            <option value="">All</option>
                            <option value="positive">Has Balance 🔴</option>
                            <option value="zero">Paid ✅</option>
                            <option value="credit">Has Credit ⭐</option>
                        </select>
                    </div>
                    <div class="form-group" style="margin:0;grid-column:span 2;">
                        <label style="font-size:0.7rem;">Search</label>
                        <input type="text" id="bal-search" placeholder="🔍 Search student name or code..." oninput="window._loadBalances()" style="padding:6px 10px;border-radius:6px;border:1px solid var(--border-medium);width:100%;">
                    </div>
                    <span class="result-count" id="bal-count" style="align-self:center;font-size:0.8rem;color:var(--text-muted);"></span>
                </div>

                <div style="font-size:0.75rem;color:var(--text-muted);margin-bottom:12px;padding:6px 12px;background:var(--bg-tertiary);border-radius:6px;display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px;">
                    <span>📅 ${selectedYear?.name || 'All Years'} ${isActiveYear ? '🟢 Active' : '🔒 Inactive (Read-Only)'}</span>
                    <span>${isCurrentYear ? '✅ Current Year' : ''}</span>
                </div>

                <div class="table-wrapper">
                    <table class="data-table" style="font-size:0.8rem;">
                        <thead>
                            <tr>
                                <th>Student</th>
                                <th>Code</th>
                                <th>Class</th>
                                <th style="text-align:right;">Total Fees</th>
                                <th style="text-align:right;">Paid</th>
                                <th style="text-align:right;">Balance</th>
                                <th style="text-align:right;">Credit</th>
                                <th style="text-align:center;">Status</th>
                                <th style="text-align:center;">Action</th>
                            </tr>
                        </thead>
                        <tbody id="bal-tbody">
                            <tr><td colspan="9" style="text-align:center;padding:40px;color:var(--text-muted);">Loading...</td></tr>
                        </tbody>
                    </table>
                </div>

                <!-- Summary Stats -->
                <div id="bal-summary" style="margin-top:16px;display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:12px;"></div>
            </div>
        </div>
    `;

    window._loadBalances = loadBalances;
    window._exportBalances = exportBalances;
    window._refreshBalances = refreshBalances;

    await loadBalances();
}

// ──────────────────────────────────────────────────────────────────────
// LOAD BALANCES
// ──────────────────────────────────────────────────────────────────────

async function loadBalances() {
    const tbody = document.getElementById('bal-tbody');
    const summary = document.getElementById('bal-summary');
    if (!tbody) return;

    const yearId = document.getElementById('bal-year')?.value;
    const classId = document.getElementById('bal-class')?.value;
    const statusFilter = document.getElementById('bal-status')?.value;
    const search = (document.getElementById('bal-search')?.value || '').toLowerCase();

    // Update selected year
    if (yearId) {
        selectedYearId = parseInt(yearId);
    }

    // Get students for selected year (only active students)
    let students = (state.students || [])
        .filter(s => s.status === 'Active' && !s.is_deleted);

    // Filter by academic year
    if (selectedYearId) {
        students = students.filter(s => s.academic_year_id == selectedYearId);
    }

    // Additional filters
    if (classId) students = students.filter(s => s.class_id == classId);
    if (search) {
        students = students.filter(s =>
            (s.first_name || '').toLowerCase().includes(search) ||
            (s.last_name || '').toLowerCase().includes(search) ||
            (s.student_code || '').toLowerCase().includes(search)
        );
    }

    // Sort by name
    students.sort((a, b) => a.last_name.localeCompare(b.last_name));

    let totalFees = 0, totalPaid = 0, totalBalance = 0, totalCredit = 0;
    let positiveCount = 0, zeroCount = 0, creditCount = 0;
    let rows = '';

    for (const student of students) {
        const balance = await getFullStudentBalance(student.id);
        const credit = getStudentCreditBalance(student.id);
        const cls = getClassById(student.class_id);

        // Only count fees for the selected year
        const yearFees = (state.studentFees || [])
            .filter(f => f.student_id === student.id && f.academic_year_id == selectedYearId);

        const yearTotal = yearFees.reduce((sum, f) => sum + (f.is_waived ? (f.paid_amount || 0) : (f.amount || 0)), 0);
        const yearPaid = yearFees.reduce((sum, f) => sum + (f.paid_amount || 0), 0);
        const yearBalance = yearTotal - yearPaid;
        const yearCredit = credit.available > 0 ? credit.available : 0;

        totalFees += yearTotal;
        totalPaid += yearPaid;
        totalBalance += yearBalance;
        totalCredit += yearCredit;

        if (yearBalance > 0) positiveCount++;
        else if (yearBalance === 0) zeroCount++;
        if (yearCredit > 0) creditCount++;

        // Apply status filter
        if (statusFilter === 'positive' && yearBalance <= 0) continue;
        if (statusFilter === 'zero' && yearBalance !== 0) continue;
        if (statusFilter === 'credit' && yearCredit <= 0) continue;

        const balanceDisplay = yearBalance > 0
            ? `<span style="color:var(--danger);font-weight:600;">${fmtCurrency(yearBalance)}</span>`
            : yearBalance === 0
                ? `<span style="color:var(--success);">${fmtCurrency(yearBalance)}</span>`
                : `<span style="color:var(--info);">${fmtCurrency(yearBalance)}</span>`;

        const statusClass = yearBalance > 0 ? 'badge-danger' : (yearBalance === 0 ? 'badge-success' : 'badge-info');
        const statusText = yearBalance > 0 ? '🔴 Due' : (yearBalance === 0 ? '✅ Paid' : '⭐ Credit');

        const creditDisplay = yearCredit > 0 ? fmtCurrency(yearCredit) : '—';

        rows += `
            <tr>
                <td><strong>${esc(student.first_name)} ${esc(student.last_name)}</strong></td>
                <td><code style="font-size:0.7rem;">${esc(student.student_code || '—')}</code></td>
                <td>${esc(cls?.name || '—')}</td>
                <td style="text-align:right;">${fmtCurrency(yearTotal)}</td>
                <td style="text-align:right;color:var(--success);">${fmtCurrency(yearPaid)}</td>
                <td style="text-align:right;">${balanceDisplay}</td>
                <td style="text-align:right;color:var(--info);">${creditDisplay}</td>
                <td style="text-align:center;"><span class="badge ${statusClass}">${statusText}</span></td>
                <td style="text-align:center;">
                    <button class="btn btn-sm btn-outline" onclick="window.navigateToWithData('record-payment', { student_id: ${student.id} })" style="padding:2px 6px;font-size:0.7rem;">💰</button>
                    <button class="btn btn-sm btn-outline" onclick="window.navigateToWithData('student-details', { student_id: ${student.id} })" style="padding:2px 6px;font-size:0.7rem;">👁️</button>
                </td>
            </tr>
        `;
    }

    const countEl = document.getElementById('bal-count');
    if (countEl) countEl.textContent = `${students.length} student${students.length !== 1 ? 's' : ''}`;

    if (!rows) {
        tbody.innerHTML = `
            <tr><td colspan="9" style="text-align:center;padding:40px;color:var(--text-muted);">
                ${students.length === 0 && selectedYearId ?
                `No students found for ${(state.academicYears || []).find(y => y.id === selectedYearId)?.name || 'selected year'}` :
                'No students found'}
            </td></tr>
        `;
    } else {
        tbody.innerHTML = rows;
    }

    // Summary
    const collectionRate = totalFees > 0 ? (totalPaid / totalFees) * 100 : 0;
    const yearName = (state.academicYears || []).find(y => y.id === selectedYearId)?.name || 'All Years';

    summary.innerHTML = `
        <div class="stat-card" style="padding:8px;text-align:center;">
            <div class="stat-value">${students.length}</div>
            <div class="stat-label">👥 Students</div>
        </div>
        <div class="stat-card" style="padding:8px;text-align:center;">
            <div class="stat-value" style="color:var(--danger);">${fmtCurrency(totalBalance)}</div>
            <div class="stat-label">🔴 Outstanding</div>
        </div>
        <div class="stat-card" style="padding:8px;text-align:center;background:var(--success-bg);">
            <div class="stat-value" style="color:var(--success);">${fmtCurrency(totalPaid)}</div>
            <div class="stat-label">✅ Collected</div>
        </div>
        <div class="stat-card" style="padding:8px;text-align:center;background:var(--info-bg);">
            <div class="stat-value" style="color:var(--info);">${fmtCurrency(totalCredit)}</div>
            <div class="stat-label">⭐ Credit Available</div>
        </div>
        <div class="stat-card" style="padding:8px;text-align:center;">
            <div class="stat-value">${collectionRate.toFixed(1)}%</div>
            <div class="stat-label">📊 Collection Rate</div>
        </div>
        <div class="stat-card" style="padding:8px;text-align:center;background:var(--bg-tertiary);">
            <div class="stat-value" style="font-size:0.8rem;font-weight:400;">${esc(yearName)}</div>
            <div class="stat-label">📅 Academic Year</div>
        </div>
    `;

    // Store for export
    window._balanceData = {
        students,
        totalFees,
        totalPaid,
        totalBalance,
        totalCredit,
        collectionRate,
        yearName,
        selectedYearId,
    };
}

// ──────────────────────────────────────────────────────────────────────
// EXPORT BALANCES
// ──────────────────────────────────────────────────────────────────────

function exportBalances() {
    const students = (state.students || []).filter(s => s.status === 'Active' && !s.is_deleted);

    // Filter by selected year
    let filteredStudents = students;
    if (selectedYearId) {
        filteredStudents = students.filter(s => s.academic_year_id == selectedYearId);
    }

    const yearName = (state.academicYears || []).find(y => y.id === selectedYearId)?.name || 'All Years';

    const data = filteredStudents.map(s => {
        const balance = getFullStudentBalance(s.id);
        const credit = getStudentCreditBalance(s.id);
        const cls = getClassById(s.class_id);

        // Year-specific fees
        const yearFees = (state.studentFees || [])
            .filter(f => f.student_id === s.id && f.academic_year_id == selectedYearId);

        const yearTotal = yearFees.reduce((sum, f) => sum + (f.is_waived ? (f.paid_amount || 0) : (f.amount || 0)), 0);
        const yearPaid = yearFees.reduce((sum, f) => sum + (f.paid_amount || 0), 0);

        return {
            'Student': `${s.first_name} ${s.last_name}`,
            'Code': s.student_code || '',
            'Class': cls?.name || '',
            'Total Fees (RWF)': yearTotal,
            'Paid (RWF)': yearPaid,
            'Balance (RWF)': yearTotal - yearPaid,
            'Credit (RWF)': credit.available > 0 ? credit.available : 0,
            'Status': yearTotal - yearPaid > 0 ? 'Due' : (yearTotal - yearPaid === 0 ? 'Paid' : 'Credit'),
            'Academic Year': yearName,
        };
    });

    const filename = `Student_Balances_${yearName.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}`;
    exportToExcel(data, filename);
    showToast('✅ Balances exported', 'success');
}

// ──────────────────────────────────────────────────────────────────────
// REFRESH BALANCES
// ──────────────────────────────────────────────────────────────────────

async function refreshBalances() {
    await refreshTable('students');
    await refreshTable('student_fees');
    await refreshTable('payments');
    await loadBalances();
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
window._loadBalances = loadBalances;
window._exportBalances = exportBalances;
window._refreshBalances = refreshBalances;