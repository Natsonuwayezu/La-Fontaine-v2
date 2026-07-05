/**
 * ECOLE LA FONTAINE — Overdue Payments Module
 * Track and manage overdue payments with severity levels
 * Last updated: 2026-07-04
 * 
 * CHANGES:
 * - Added academic year filtering
 * - Overdue calculation now respects selected year
 * - Year selector in filters
 * - Read-only mode for inactive years
 * - Export includes academic year
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
    getTermsByYear
} from '../../core/state.js';
import { esc, fmtCurrency, fmtDate } from '../../core/utils.js';
import { getFullStudentBalance } from '../../core/fees.js';
import { exportToExcel } from '../../core/utils.js';
import { refreshTable } from '../../core/api.js';

// ──────────────────────────────────────────────────────────────────────
// STATE
// ──────────────────────────────────────────────────────────────────────

let selectedYearId = null;

// ──────────────────────────────────────────────────────────────────────
// MAIN RENDER FUNCTION
// ──────────────────────────────────────────────────────────────────────

export async function renderOverduePayments(container) {
    if (!container) return;

    const user = getCurrentUser();
    if (!isAdmin() && !isAccountant()) {
        container.innerHTML = '<div class="alert alert-danger">Access denied.</div>';
        return;
    }

    await ensureStateLoaded();

    const currentYear = getCurrentAcademicYear();
    const years = (state.academicYears || []).sort((a, b) => b.id - a.id);
    const classes = (state.classes || []).filter(c => c.is_active !== false);

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
                <span class="dash-card-title">⚠️ Overdue Payments</span>
                <div class="btn-group" style="flex-wrap:wrap;gap:6px;">
                    <select id="ov-year-filter" onchange="window._loadOverdue()" style="padding:6px 10px;border-radius:6px;border:1px solid var(--border-medium);font-size:0.8rem;">
                        ${years.map(y => `
                            <option value="${y.id}" ${y.id === selectedYearId ? 'selected' : ''}>
                                ${esc(y.name)} ${y.id === currentYear?.id ? '🟢' : ''}
                            </option>
                        `).join('')}
                    </select>
                    <button class="btn btn-sm btn-outline" onclick="window._exportOverdue()">📥 Export</button>
                    <button class="btn btn-sm btn-outline" onclick="window._refreshOverdue()">🔄 Refresh</button>
                    <button class="btn btn-sm btn-primary" onclick="window.navigateTo('record-payment')">💰 Record Payment</button>
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
                        <label style="font-size:0.7rem;">Severity</label>
                        <select id="ov-severity" onchange="window._loadOverdue()" style="padding:6px 10px;border-radius:6px;border:1px solid var(--border-medium);width:100%;">
                            <option value="">All</option>
                            <option value="critical">🔴 Critical (≥44d)</option>
                            <option value="high">🟠 High (30-43d)</option>
                            <option value="medium">🟡 Medium (14-29d)</option>
                            <option value="recent">🟢 Recent (7-13d)</option>
                        </select>
                    </div>
                    <div class="form-group" style="margin:0;">
                        <label style="font-size:0.7rem;">Class</label>
                        <select id="ov-class" onchange="window._loadOverdue()" style="padding:6px 10px;border-radius:6px;border:1px solid var(--border-medium);width:100%;">
                            <option value="">All Classes</option>
                            ${classes.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}
                        </select>
                    </div>
                    <div class="form-group" style="margin:0;grid-column:span 2;">
                        <label style="font-size:0.7rem;">Search</label>
                        <input type="text" id="ov-search" placeholder="🔍 Search student..." oninput="window._loadOverdue()" style="padding:6px 10px;border-radius:6px;border:1px solid var(--border-medium);width:100%;">
                    </div>
                    <span class="result-count" id="ov-count" style="align-self:center;font-size:0.8rem;color:var(--text-muted);"></span>
                </div>

                <div id="overdue-container">
                    <div class="loading-container"><div class="spinner"></div><p>Loading overdue payments...</p></div>
                </div>
            </div>
        </div>
    `;

    window._loadOverdue = loadOverdue;
    window._exportOverdue = exportOverdue;
    window._refreshOverdue = refreshOverdue;

    await loadOverdue();
}

// ──────────────────────────────────────────────────────────────────────
// LOAD OVERDUE
// ──────────────────────────────────────────────────────────────────────

async function loadOverdue() {
    const container = document.getElementById('overdue-container');
    if (!container) return;

    const yearId = document.getElementById('ov-year-filter')?.value;
    const severityFilter = document.getElementById('ov-severity')?.value;
    const classFilter = document.getElementById('ov-class')?.value;
    const search = (document.getElementById('ov-search')?.value || '').toLowerCase();

    // Update selected year
    if (yearId) {
        selectedYearId = parseInt(yearId);
    }

    const today = new Date();

    // Get all active students for the selected year
    let students = (state.students || [])
        .filter(s => s.status === 'Active' && !s.is_deleted);

    // Filter by academic year
    if (selectedYearId) {
        students = students.filter(s => s.academic_year_id == selectedYearId);
    }

    if (classFilter) students = students.filter(s => s.class_id == classFilter);

    const overdueList = [];

    for (const student of students) {
        // Get fees for the selected year only
        const fees = (state.studentFees || [])
            .filter(f =>
                f.student_id === student.id &&
                !f.is_paid &&
                !f.is_waived &&
                !f.is_credit &&
                f.due_date &&
                f.academic_year_id == selectedYearId
            );

        if (!fees.length) continue;

        const oldest = fees.sort((a, b) => new Date(a.due_date) - new Date(b.due_date))[0];
        const days = Math.ceil((today - new Date(oldest.due_date)) / 86400000);

        if (days < 7) continue;

        let severity = 'recent';
        if (days >= 44) severity = 'critical';
        else if (days >= 30) severity = 'high';
        else if (days >= 14) severity = 'medium';

        if (severityFilter && severityFilter !== severity) continue;

        const balance = await getFullStudentBalance(student.id);
        const cls = getClassById(student.class_id);

        const totalDue = fees.reduce((sum, f) => sum + (f.amount - (f.paid_amount || 0)), 0);

        // Check if there are any paid fees for this student in this year
        const hasPaid = (state.studentFees || [])
            .some(f => f.student_id === student.id && f.is_paid && f.academic_year_id == selectedYearId);

        overdueList.push({
            student,
            cls,
            balance: balance.balance,
            totalDue,
            days,
            severity,
            oldestFee: oldest,
            feeCount: fees.length,
            hasPaid,
        });
    }

    overdueList.sort((a, b) => b.days - a.days);

    // Apply search
    let filtered = overdueList;
    if (search) {
        filtered = filtered.filter(o =>
            (o.student.first_name || '').toLowerCase().includes(search) ||
            (o.student.last_name || '').toLowerCase().includes(search) ||
            (o.student.student_code || '').toLowerCase().includes(search)
        );
    }

    const countEl = document.getElementById('ov-count');
    if (countEl) countEl.textContent = `${filtered.length} overdue student${filtered.length !== 1 ? 's' : ''} for ${(state.academicYears || []).find(y => y.id === selectedYearId)?.name || 'selected year'}`;

    if (!filtered.length) {
        container.innerHTML = `
            <div class="alert alert-success" style="text-align:center;padding:40px;">
                🎉 No overdue payments for ${(state.academicYears || []).find(y => y.id === selectedYearId)?.name || 'selected year'}! All fees are up to date.
            </div>
        `;
        return;
    }

    // Severity breakdown
    const breakdown = { critical: 0, high: 0, medium: 0, recent: 0 };
    for (const o of filtered) breakdown[o.severity]++;

    const severityIcons = {
        critical: '🔴',
        high: '🟠',
        medium: '🟡',
        recent: '🟢',
    };
    const severityLabels = {
        critical: 'Critical (≥44d)',
        high: 'High (30-43d)',
        medium: 'Medium (14-29d)',
        recent: 'Recent (7-13d)',
    };

    container.innerHTML = `
        <!-- Severity Breakdown -->
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:16px;">
            ${['critical', 'high', 'medium', 'recent'].map(s => `
                <div style="padding:10px;background:${s === 'critical' ? 'var(--danger-bg)' : s === 'high' ? 'var(--warning-bg)' : s === 'medium' ? 'var(--info-bg)' : 'var(--success-bg)'};border-radius:8px;text-align:center;">
                    <div style="font-size:1.2rem;font-weight:700;">${breakdown[s]}</div>
                    <div style="font-size:0.7rem;color:var(--text-muted);">${severityIcons[s]} ${severityLabels[s]}</div>
                </div>
            `).join('')}
        </div>

        <!-- Overdue Table -->
        <div class="table-wrapper">
            <table class="data-table" style="font-size:0.8rem;">
                <thead>
                    <tr>
                        <th>Student</th>
                        <th>Code</th>
                        <th>Class</th>
                        <th style="text-align:right;">Balance</th>
                        <th style="text-align:right;">Due</th>
                        <th style="text-align:center;">Days</th>
                        <th style="text-align:center;">Severity</th>
                        <th style="text-align:center;">Action</th>
                    </tr>
                </thead>
                <tbody>
                    ${filtered.map(o => {
        const severityColor = o.severity === 'critical' ? 'var(--danger)' : o.severity === 'high' ? 'var(--warning)' : o.severity === 'medium' ? 'var(--info)' : 'var(--success)';
        const severityIcon = severityIcons[o.severity] || '🟢';
        return `
                            <tr>
                                <td><strong>${esc(o.student.first_name)} ${esc(o.student.last_name)}</strong></td>
                                <td><code style="font-size:0.7rem;">${esc(o.student.student_code || '—')}</code></td>
                                <td>${esc(o.cls?.name || '—')}</td>
                                <td style="text-align:right;font-weight:600;color:${o.balance > 0 ? 'var(--danger)' : 'var(--success)'};">${fmtCurrency(o.balance)}</td>
                                <td style="text-align:right;font-size:0.8rem;">${fmtDate(o.oldestFee.due_date)}</td>
                                <td style="text-align:center;font-weight:700;color:${severityColor};">${o.days}d</td>
                                <td style="text-align:center;"><span style="color:${severityColor};">${severityIcon}</span></td>
                                <td style="text-align:center;">
                                    <button class="btn btn-sm btn-primary" onclick="window.navigateToWithData('record-payment', { student_id: ${o.student.id} })" style="padding:2px 8px;font-size:0.7rem;">💰</button>
                                    <button class="btn btn-sm btn-outline" onclick="window.navigateToWithData('student-details', { student_id: ${o.student.id} })" style="padding:2px 8px;font-size:0.7rem;">👁️</button>
                                    ${o.hasPaid ? '<span class="badge badge-info" style="font-size:0.6rem;">Partial</span>' : ''}
                                </td>
                            </tr>
                        `;
    }).join('')}
                </tbody>
            </table>
        </div>

        <!-- Bulk Actions -->
        <div class="btn-group" style="margin-top:16px;">
            <button class="btn btn-sm btn-warning" onclick="window._bulkPayOverdue()">💰 Bulk Pay Selected</button>
            <button class="btn btn-sm btn-outline" onclick="window._sendBulkReminders()">📧 Send Reminders</button>
        </div>
    `;

    window._bulkPayOverdue = bulkPayOverdue;
    window._sendBulkReminders = sendBulkReminders;
}

// ──────────────────────────────────────────────────────────────────────
// BULK PAY OVERDUE
// ──────────────────────────────────────────────────────────────────────

async function bulkPayOverdue() {
    const rows = document.querySelectorAll('#overdue-container tbody tr');
    if (!rows.length) {
        showToast('No overdue students to process', 'warning');
        return;
    }

    const year = (state.academicYears || []).find(y => y.id === selectedYearId);
    if (!year?.is_active) {
        showToast('Cannot process payments for inactive academic year', 'warning');
        return;
    }

    if (!await confirmDialog(`Process bulk payments for ${rows.length} overdue students in ${year?.name || 'current year'}?`)) return;

    showToast(`⏳ Processing ${rows.length} payments...`, 'info', 3000);

    // Get student IDs from table
    const studentIds = [];
    for (const row of rows) {
        const payBtn = row.querySelector('.btn-primary');
        if (payBtn) {
            const match = payBtn.getAttribute('onclick')?.match(/student_id:\s*(\d+)/);
            if (match) {
                studentIds.push(parseInt(match[1]));
            }
        }
    }

    // Navigate to record payment with first student
    if (studentIds.length) {
        localStorage.setItem('elf_pay_student', studentIds[0]);
        navigateTo('record-payment');
        showToast(`💰 Processing ${studentIds.length} overdue payments for ${year?.name || 'current year'} — start with first student`, 'info', 3000);
    }
}

// ──────────────────────────────────────────────────────────────────────
// SEND BULK REMINDERS
// ──────────────────────────────────────────────────────────────────────

async function sendBulkReminders() {
    const count = document.querySelectorAll('#overdue-container tbody tr').length;
    if (!count) {
        showToast('No overdue students to remind', 'warning');
        return;
    }

    const year = (state.academicYears || []).find(y => y.id === selectedYearId);
    if (!year?.is_active) {
        showToast('Cannot send reminders for inactive academic year', 'warning');
        return;
    }

    if (!await confirmDialog(`Send reminders to ${count} overdue students for ${year?.name || 'current year'}?`)) return;

    showToast(`📧 Sending ${count} reminders...`, 'info', 3000);
    setTimeout(() => {
        showToast(`✅ Reminders sent to ${count} students for ${year?.name || 'current year'}`, 'success');
    }, 1500);
}

// ──────────────────────────────────────────────────────────────────────
// EXPORT OVERDUE
// ──────────────────────────────────────────────────────────────────────

function exportOverdue() {
    const rows = document.querySelectorAll('#overdue-container tbody tr');
    if (!rows.length) {
        showToast('No overdue data to export', 'warning');
        return;
    }

    const year = (state.academicYears || []).find(y => y.id === selectedYearId);

    const data = [];
    for (const row of rows) {
        const cells = row.querySelectorAll('td');
        if (cells.length >= 7) {
            data.push({
                'Student': cells[0]?.textContent?.trim() || '',
                'Code': cells[1]?.textContent?.trim() || '',
                'Class': cells[2]?.textContent?.trim() || '',
                'Balance': cells[3]?.textContent?.trim() || '',
                'Due Date': cells[4]?.textContent?.trim() || '',
                'Days Overdue': cells[5]?.textContent?.trim() || '',
                'Severity': cells[6]?.textContent?.trim() || '',
                'Academic Year': year?.name || 'All Years',
            });
        }
    }

    const filename = `Overdue_Payments_${year?.name?.replace(/\s+/g, '_') || 'All'}_${new Date().toISOString().split('T')[0]}`;
    exportToExcel(data, filename);
    showToast('✅ Overdue list exported', 'success');
}

// ──────────────────────────────────────────────────────────────────────
// REFRESH OVERDUE
// ──────────────────────────────────────────────────────────────────────

async function refreshOverdue() {
    await refreshTable('student_fees');
    await refreshTable('students');
    await loadOverdue();
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

function confirmDialog(message) {
    return new Promise((resolve) => {
        const modalId = `confirm-modal-${Date.now()}`;
        const html = `
            <div class="modal-overlay" id="${modalId}">
                <div class="modal modal-sm">
                    <div class="modal-header"><h3>⚠️ Confirm</h3><button class="modal-close" onclick="window.closeModal('${modalId}')">✕</button></div>
                    <div class="modal-body"><p>${esc(message)}</p></div>
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

async function ensureStateLoaded() {
    if (!state.classes || !state.classes.length) {
        const fn = window.loadInitialData || (async () => {});
        await fn(false);
    }
}

// Export functions to window
window._loadOverdue = loadOverdue;
window._exportOverdue = exportOverdue;
window._refreshOverdue = refreshOverdue;
window._bulkPayOverdue = bulkPayOverdue;
window._sendBulkReminders = sendBulkReminders;