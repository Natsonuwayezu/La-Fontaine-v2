/**
 * ECOLE LA FONTAINE — Payment History Module
 * View, filter, search, and export all payments with academic year support
 * Last updated: 2026-07-04
 * 
 * CHANGES:
 * - Added academic year filtering
 * - Year selector in filters
 * - Payments filtered by selected year
 * - Summary stats reflect selected year
 * - Export includes academic year
 */


import {
    state,
    getStudentById,
    getClassById,
    getCurrentUser,
    getCurrentAcademicYear,
    getActiveAcademicYearId
} from '../../core/state.js';
import { esc, fmtCurrency, fmtDate } from '../../core/utils.js';
import { exportToExcel } from '../../core/utils.js';
import { refreshTable } from '../../core/api.js';

// ──────────────────────────────────────────────────────────────────────
// STATE
// ──────────────────────────────────────────────────────────────────────

let selectedYearId = null;

// ──────────────────────────────────────────────────────────────────────
// MAIN RENDER FUNCTION
// ──────────────────────────────────────────────────────────────────────

export async function renderPaymentHistory(container) {
    if (!container) return;

    const user = getCurrentUser();
    if (user?.role === 'teacher') {
        container.innerHTML = '<div class="alert alert-danger">Access denied. Teachers cannot view payment history.</div>';
        return;
    }

    await ensureStateLoaded();

    const currentYear = getCurrentAcademicYear();
    const years = (state.academicYears || []).sort((a, b) => b.id - a.id);

    // Default to current year
    if (!selectedYearId) {
        selectedYearId = currentYear?.id || null;
    }

    const selectedYear = years.find(y => y.id === selectedYearId);
    const isActiveYear = selectedYear?.is_active === true;
    const isCurrentYear = selectedYear?.id === currentYear?.id;

    // Get payments for selected year
    let payments = (state.payments || []);
    if (selectedYearId) {
        payments = payments.filter(p => p.academic_year_id == selectedYearId);
    }

    const totalPayments = payments.reduce((a, p) => a + (p.amount || 0), 0);
    const methods = [...new Set(payments.map(p => p.payment_method))];

    container.innerHTML = `
        <div class="dash-card">
            <div class="dash-card-header" style="flex-wrap:wrap;gap:8px;">
                <span class="dash-card-title">📜 Payment History</span>
                <div class="btn-group" style="flex-wrap:wrap;gap:6px;">
                    <select id="ph-year-filter" onchange="window._loadPaymentHistoryData()" style="padding:6px 10px;border-radius:6px;border:1px solid var(--border-medium);font-size:0.8rem;">
                        ${years.map(y => `
                            <option value="${y.id}" ${y.id === selectedYearId ? 'selected' : ''}>
                                ${esc(y.name)} ${y.id === currentYear?.id ? '🟢' : ''}
                            </option>
                        `).join('')}
                    </select>
                    <button class="btn btn-sm btn-outline" onclick="window._exportPaymentHistory()">📥 Export</button>
                    <button class="btn btn-sm btn-outline" onclick="window._refreshPayments()">🔄 Refresh</button>
                    <button class="btn btn-sm btn-primary" onclick="window.navigateTo('record-payment')">💰 Record Payment</button>
                    ${!isActiveYear ? '<span class="badge badge-neutral" style="font-size:0.65rem;">🔒 Read-only</span>' : ''}
                </div>
            </div>
            <div class="dash-card-body">
                <div style="font-size:0.75rem;color:var(--text-muted);margin-bottom:12px;padding:6px 12px;background:var(--bg-tertiary);border-radius:6px;display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px;">
                    <span>📅 ${selectedYear?.name || 'All Years'} ${isActiveYear ? '🟢 Active' : '🔒 Inactive (Read-Only)'}</span>
                    <span>${isCurrentYear ? '✅ Current Year' : ''}</span>
                </div>

                <!-- Summary Stats -->
                <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:12px;margin-bottom:16px;">
                    <div class="stat-card" style="padding:10px;text-align:center;">
                        <div class="stat-value">${payments.length}</div>
                        <div class="stat-label">📋 Payments</div>
                    </div>
                    <div class="stat-card" style="padding:10px;text-align:center;">
                        <div class="stat-value" style="color:var(--success);">${fmtCurrency(totalPayments)}</div>
                        <div class="stat-label">💰 Total</div>
                    </div>
                    <div class="stat-card" style="padding:10px;text-align:center;">
                        <div class="stat-value">${payments.length ? (totalPayments / payments.length).toFixed(0) : 0}</div>
                        <div class="stat-label">📊 Average</div>
                    </div>
                    <div class="stat-card" style="padding:10px;text-align:center;">
                        <div class="stat-value">${methods.length}</div>
                        <div class="stat-label">💳 Methods</div>
                    </div>
                </div>

                <!-- Filters -->
                <div class="filters-bar" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px;margin-bottom:16px;">
                    <div class="form-group" style="margin:0;">
                        <label style="font-size:0.7rem;">Search</label>
                        <input type="text" id="ph-search" placeholder="🔍 Receipt #, student..." oninput="window._filterPayments()" style="padding:6px 10px;border-radius:6px;border:1px solid var(--border-medium);width:100%;">
                    </div>
                    <div class="form-group" style="margin:0;">
                        <label style="font-size:0.7rem;">Method</label>
                        <select id="ph-method" onchange="window._filterPayments()" style="padding:6px 10px;border-radius:6px;border:1px solid var(--border-medium);width:100%;">
                            <option value="">All Methods</option>
                            <option value="Cash">Cash</option>
                            <option value="Mobile-Money">Mobile-Money</option>
                            <option value="Bank Transfer">Bank Transfer</option>
                            <option value="Cheque">Cheque</option>
                        </select>
                    </div>
                    <div class="form-group" style="margin:0;">
                        <label style="font-size:0.7rem;">From</label>
                        <input type="date" id="ph-from" onchange="window._filterPayments()" style="padding:6px 10px;border-radius:6px;border:1px solid var(--border-medium);width:100%;">
                    </div>
                    <div class="form-group" style="margin:0;">
                        <label style="font-size:0.7rem;">To</label>
                        <input type="date" id="ph-to" onchange="window._filterPayments()" style="padding:6px 10px;border-radius:6px;border:1px solid var(--border-medium);width:100%;">
                    </div>
                    <span class="result-count" id="ph-count" style="align-self:center;font-size:0.8rem;color:var(--text-muted);"></span>
                </div>

                <!-- Payments Table -->
                <div class="table-wrapper">
                    <table class="data-table" style="font-size:0.8rem;">
                        <thead>
                            <tr>
                                <th>Receipt #</th>
                                <th>Date</th>
                                <th>Student</th>
                                <th>Class</th>
                                <th style="text-align:right;">Amount</th>
                                <th>Method</th>
                                <th>Type</th>
                                <th style="text-align:center;">Actions</th>
                            </tr>
                        </thead>
                        <tbody id="ph-tbody">
                            <tr><td colspan="8" style="text-align:center;padding:40px;color:var(--text-muted);">Loading...</td></tr>
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    `;

    window._filterPayments = filterPayments;
    window._exportPaymentHistory = exportPaymentHistory;
    window._refreshPayments = refreshPayments;
    window._printReceipt = printReceipt;
    window._reversePayment = reversePayment;
    window._loadPaymentHistoryData = loadPaymentHistoryData;

    filterPayments();
}

// ──────────────────────────────────────────────────────────────────────
// LOAD PAYMENT HISTORY DATA (Year Change Handler)
// ──────────────────────────────────────────────────────────────────────

function loadPaymentHistoryData() {
    const yearId = document.getElementById('ph-year-filter')?.value;
    if (yearId) {
        selectedYearId = parseInt(yearId);
        renderPaymentHistory(document.getElementById('dynamic-content'));
    }
}

// ──────────────────────────────────────────────────────────────────────
// FILTER PAYMENTS
// ──────────────────────────────────────────────────────────────────────

function filterPayments() {
    const search = (document.getElementById('ph-search')?.value || '').toLowerCase();
    const method = document.getElementById('ph-method')?.value;
    const from = document.getElementById('ph-from')?.value;
    const to = document.getElementById('ph-to')?.value;

    let payments = (state.payments || [])
        .sort((a, b) => new Date(b.payment_date || b.created_at) - new Date(a.payment_date || a.created_at));

    // Filter by academic year
    if (selectedYearId) {
        payments = payments.filter(p => p.academic_year_id == selectedYearId);
    }

    if (method) payments = payments.filter(p => p.payment_method === method);
    if (from) payments = payments.filter(p => (p.payment_date || p.created_at || '') >= from);
    if (to) payments = payments.filter(p => (p.payment_date || p.created_at || '') <= to);

    if (search) {
        payments = payments.filter(p => {
            const student = getStudentById(p.student_id);
            return (p.receipt_number || '').toLowerCase().includes(search) ||
                (student ? (student.first_name + ' ' + student.last_name).toLowerCase().includes(search) : false);
        });
    }

    const countEl = document.getElementById('ph-count');
    const year = (state.academicYears || []).find(y => y.id === selectedYearId);
    if (countEl) {
        const yearLabel = year ? ` (${year.name})` : '';
        countEl.textContent = `${payments.length} payment${payments.length !== 1 ? 's' : ''}${yearLabel}`;
    }

    const tbody = document.getElementById('ph-tbody');
    if (!tbody) return;

    if (!payments.length) {
        tbody.innerHTML = `
            <tr><td colspan="8" style="text-align:center;padding:40px;color:var(--text-muted);">
                No payments found for ${year?.name || 'selected year'}
            </td></tr>
        `;
        return;
    }

    const totalDisplay = payments.reduce((a, p) => a + (p.amount || 0), 0);

    tbody.innerHTML = payments.map(p => {
        const student = getStudentById(p.student_id);
        const cls = student ? getClassById(student.class_id) : null;
        const isCredit = p.is_credit_payment === true || p.is_credit_addition === true;
        const typeText = isCredit ? (p.is_credit_addition ? '⭐ Credit Added' : '💰 Credit Used') : '💵 Cash Payment';
        const typeClass = isCredit ? (p.is_credit_addition ? 'badge-success' : 'badge-info') : 'badge-primary';

        return `
            <tr>
                <td><code style="font-size:0.7rem;">${esc(p.receipt_number || '—')}</code></td>
                <td style="font-size:0.8rem;">${fmtDate(p.payment_date || p.created_at)}</td>
                <td><strong>${student ? esc(student.first_name + ' ' + student.last_name) : '—'}</strong></td>
                <td>${esc(cls?.name || '—')}</td>
                <td style="text-align:right;font-weight:600;">${fmtCurrency(p.amount)}</td>
                <td><span class="badge badge-neutral">${esc(p.payment_method || '—')}</span></td>
                <td><span class="badge ${typeClass}">${typeText}</span></td>
                <td style="text-align:center;">
                    <button class="btn btn-sm btn-outline" onclick="window._printReceipt(${p.id})" style="padding:2px 6px;font-size:0.7rem;">🧾</button>
                    ${!isCredit ? `<button class="btn btn-sm btn-danger" onclick="window._reversePayment(${p.id})" style="padding:2px 6px;font-size:0.7rem;">↩️</button>` : ''}
                </td>
            </tr>
        `;
    }).join('');

    // Update summary stats with filtered totals
    const summaryContainer = document.querySelector('.stat-card');
    if (summaryContainer) {
        const totalEl = document.querySelector('.stat-value[style*="color:var(--success);"]');
        if (totalEl) {
            totalEl.textContent = fmtCurrency(totalDisplay);
        }
    }
}

// ──────────────────────────────────────────────────────────────────────
// PRINT RECEIPT
// ──────────────────────────────────────────────────────────────────────

function printReceipt(paymentId) {
    const payment = state.payments.find(p => p.id === paymentId);
    if (!payment) {
        showToast('Payment not found', 'error');
        return;
    }

    const student = getStudentById(payment.student_id);
    const cls = student ? getClassById(student.class_id) : null;
    const school = state.schoolSettings || {};
    const year = (state.academicYears || []).find(y => y.id === payment.academic_year_id);

    const printWindow = window.open('', '_blank');
    if (!printWindow) {
        showToast('Popup blocked. Please allow popups.', 'warning');
        return;
    }

    printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Receipt ${esc(payment.receipt_number)}</title>
            <style>
                body { font-family: 'Courier New', monospace; padding: 20px; max-width: 400px; margin: 0 auto; }
                .header { text-align: center; border-bottom: 2px solid #1a3a5c; padding-bottom: 10px; }
                .header h2 { margin: 0; color: #1a3a5c; }
                .row { display: flex; justify-content: space-between; padding: 4px 0; border-bottom: 1px dotted #eee; }
                .total { font-size: 18px; font-weight: bold; text-align: center; padding: 10px; background: #d1fae5; border-radius: 8px; margin: 10px 0; }
                .footer { text-align: center; font-size: 11px; color: #666; margin-top: 20px; border-top: 1px solid #ccc; padding-top: 10px; }
                .year-label { text-align: center; font-size: 11px; color: #666; margin: 4px 0; }
                @media print { body { padding: 0; } }
            </style>
        </head>
        <body>
            <div class="header">
                <div style="font-size:24px;">🏫</div>
                <h2>${esc(school.school_name || 'ECOLE LA FONTAINE')}</h2>
                <div style="font-size:11px;color:#666;">${esc(school.school_address || 'Rubavu, Rwanda')}</div>
                <div style="font-size:11px;color:#666;">Tel: ${esc(school.school_phone || '')}</div>
            </div>
            <div style="text-align:center;margin:8px 0;">
                <strong>PAYMENT RECEIPT</strong>
            </div>
            <div class="year-label">📅 ${year?.name || ''}</div>
            <div style="border-bottom:2px solid #1a3a5c;margin-bottom:10px;"></div>
            <div class="row"><span>Receipt #:</span><strong>${esc(payment.receipt_number)}</strong></div>
            <div class="row"><span>Date:</span><span>${fmtDate(payment.payment_date || payment.created_at)}</span></div>
            <div class="row"><span>Student:</span><span>${student ? esc(student.first_name + ' ' + student.last_name) : '—'}</span></div>
            <div class="row"><span>Class:</span><span>${esc(cls?.name || '—')}</span></div>
            <div class="row"><span>Method:</span><span>${esc(payment.payment_method || '—')}</span></div>
            ${payment.reference ? `<div class="row"><span>Reference:</span><span>${esc(payment.reference)}</span></div>` : ''}
            ${payment.notes ? `<div class="row"><span>Notes:</span><span style="text-align:right;">${esc(payment.notes)}</span></div>` : ''}
            <div style="border-bottom:2px solid #1a3a5c;margin:8px 0;"></div>
            <div class="total">${fmtCurrency(payment.amount)}</div>
            <div style="text-align:center;font-size:11px;color:#666;">Thank you for your payment</div>
            <div class="footer">
                Generated on ${new Date().toLocaleString()}
            </div>
            <script>
                window.print();
                setTimeout(function() { window.close(); }, 500);
            <\/script>
        </body>
        </html>
    `);
    printWindow.document.close();
}

// ──────────────────────────────────────────────────────────────────────
// REVERSE PAYMENT
// ──────────────────────────────────────────────────────────────────────

async function reversePayment(paymentId) {
    const payment = state.payments.find(p => p.id === paymentId);
    if (!payment) {
        showToast('Payment not found', 'error');
        return;
    }

    const year = (state.academicYears || []).find(y => y.id === payment.academic_year_id);
    const yearLabel = year ? ` (${year.name})` : '';

    if (!await confirmDialog(
        `⚠️ Reverse Payment\n\n` +
        `Receipt: ${payment.receipt_number}\n` +
        `Amount: ${fmtCurrency(payment.amount)}\n` +
        `Student: ${payment.student_id ? (getStudentById(payment.student_id)?.first_name || '') + ' ' + (getStudentById(payment.student_id)?.last_name || '') : '—'}\n` +
        `Academic Year: ${year?.name || '—'}\n\n` +
        `This action CANNOT be undone.\n\n` +
        `Proceed?`
    )) return;

    // Navigate to payment reversals module
    localStorage.setItem('elf_reverse_payment', paymentId);
    navigateTo('payment-reversals');
}

// ──────────────────────────────────────────────────────────────────────
// EXPORT PAYMENT HISTORY
// ──────────────────────────────────────────────────────────────────────

function exportPaymentHistory() {
    let payments = (state.payments || [])
        .sort((a, b) => new Date(b.payment_date || b.created_at) - new Date(a.payment_date || a.created_at));

    // Filter by selected year
    if (selectedYearId) {
        payments = payments.filter(p => p.academic_year_id == selectedYearId);
    }

    const year = (state.academicYears || []).find(y => y.id === selectedYearId);
    const yearLabel = year?.name?.replace(/\s+/g, '_') || 'All';

    const data = payments.map(p => {
        const student = getStudentById(p.student_id);
        const cls = student ? getClassById(student.class_id) : null;
        return {
            'Receipt #': p.receipt_number || '',
            'Date': fmtDate(p.payment_date || p.created_at),
            'Student': student ? `${student.first_name} ${student.last_name}` : '—',
            'Class': cls?.name || '—',
            'Amount (RWF)': p.amount || 0,
            'Method': p.payment_method || '—',
            'Reference': p.reference || '',
            'Notes': p.notes || '',
            'Recorded By': p.recorded_by || '',
            'Academic Year': year?.name || '',
        };
    });

    const filename = `Payment_History_${yearLabel}_${new Date().toISOString().split('T')[0]}`;
    exportToExcel(data, filename);
    showToast('✅ Payment history exported', 'success');
}

// ──────────────────────────────────────────────────────────────────────
// REFRESH PAYMENTS
// ──────────────────────────────────────────────────────────────────────

async function refreshPayments() {
    await refreshTable('payments');
    await filterPayments();
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

async function ensureStateLoaded() {
    if (!state.classes || !state.classes.length) {
        const fn = window.loadInitialData || (async () => {});
        await fn(false);
    }
}

// Export functions to window
window._filterPayments = filterPayments;
window._exportPaymentHistory = exportPaymentHistory;
window._refreshPayments = refreshPayments;
window._printReceipt = printReceipt;
window._reversePayment = reversePayment;
window._loadPaymentHistoryData = loadPaymentHistoryData;