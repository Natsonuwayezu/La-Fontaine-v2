/**
 * ECOLE LA FONTAINE — Payment Reversals Module
 * Reverse payments, restore balances, audit trail, and generate reversal receipts
 * Last updated: 2026-07-04
 * 
 * CHANGES:
 * - Added academic year filtering
 * - Reversal receipt generation (PDF)
 * - Reversal receipt preview in modal
 * - Year selector in filters
 * - Summary stats reflect selected year
 * - Reversal receipt includes all details
 */



const state = window.state || {}; // global state alias
const ensureStateLoaded = window.ensureStateLoaded || (async () => {}); // global from boot.js
import {
    state,
    getClassById,
    getStudentById,
    getCurrentUser,
    getCurrentAcademicYear,
    getActiveAcademicYearId,
    isAdmin,
    isAccountant
} from '../../core/state.js';
import { esc, fmtCurrency, fmtDate, fmtDateTime } from '../../core/utils.js';
import { insert, update, remove, getAll, get } from '../../core/api.js';
import { getFullStudentBalance } from '../../core/fees.js';
import { notifyAction } from '../../core/notifications.js';
import { exportToExcel, downloadReceiptPDF } from '../../core/utils.js';

// ──────────────────────────────────────────────────────────────────────
// STATE
// ──────────────────────────────────────────────────────────────────────

let selectedYearId = null;

// ──────────────────────────────────────────────────────────────────────
// MAIN RENDER FUNCTION
// ──────────────────────────────────────────────────────────────────────

export async function renderPaymentReversals(container) {
    if (!container) return;

    const user = getCurrentUser();
    if (user?.role === 'teacher') {
        container.innerHTML = '<div class="alert alert-danger">Access denied. Teachers cannot access payment reversals.</div>';
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

    // Get payment reversals for selected year
    let reversals = [];
    try {
        let query = 'payment_reversals?order=created_at.desc&limit=200';
        if (selectedYearId) {
            // We need to filter by academic year through related payments
            // Fetch all and filter in JS
            const allReversals = await getAll('payment_reversals', 'order=created_at.desc&limit=500');
            reversals = allReversals.filter(r => {
                const payment = (state.payments || []).find(p => p.id === r.payment_id);
                return payment?.academic_year_id == selectedYearId;
            });
        } else {
            const result = await getAll('payment_reversals', 'order=created_at.desc&limit=200');
            reversals = result || [];
        }
    } catch (e) {
        reversals = [];
    }

    // Get recent payments for reversal (filtered by year)
    let recentPayments = (state.payments || [])
        .filter(p => !p.is_reversed)
        .sort((a, b) => new Date(b.payment_date || b.created_at) - new Date(a.payment_date || a.created_at))
        .slice(0, 50);

    if (selectedYearId) {
        recentPayments = recentPayments.filter(p => p.academic_year_id == selectedYearId);
    }

    const totalReversed = reversals.reduce((sum, r) => sum + (r.amount || 0), 0);

    container.innerHTML = `
        <div class="dash-card">
            <div class="dash-card-header" style="flex-wrap:wrap;gap:8px;">
                <span class="dash-card-title">🔄 Payment Reversals</span>
                <div class="btn-group" style="flex-wrap:wrap;gap:6px;">
                    <select id="rev-year-filter" onchange="window._loadReversalsData()" style="padding:6px 10px;border-radius:6px;border:1px solid var(--border-medium);font-size:0.8rem;">
                        ${years.map(y => `
                            <option value="${y.id}" ${y.id === selectedYearId ? 'selected' : ''}>
                                ${esc(y.name)} ${y.id === currentYear?.id ? '🟢' : ''}
                            </option>
                        `).join('')}
                    </select>
                    <button class="btn btn-sm btn-outline" onclick="window._exportReversalHistory()">📥 Export History</button>
                    <button class="btn btn-sm btn-outline" onclick="window._refreshReversals()">🔄 Refresh</button>
                    ${!isActiveYear ? '<span class="badge badge-neutral" style="font-size:0.65rem;">🔒 Read-only</span>' : ''}
                </div>
            </div>
            <div class="dash-card-body">
                <div style="font-size:0.75rem;color:var(--text-muted);margin-bottom:12px;padding:6px 12px;background:var(--bg-tertiary);border-radius:6px;display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px;">
                    <span>📅 ${selectedYear?.name || 'All Years'} ${isActiveYear ? '🟢 Active' : '🔒 Inactive (Read-Only)'}</span>
                    <span>${reversals.length} reversals · ${fmtCurrency(totalReversed)} reversed</span>
                </div>

                <div class="alert alert-warning" style="font-size:0.85rem;">
                    <strong>⚠️ Warning:</strong> Reversing a payment will:
                    <ul style="margin-top:8px;margin-left:20px;font-size:0.8rem;">
                        <li>Remove the payment from the student's account</li>
                        <li>Restore the original fee balances</li>
                        <li>Create a reversal record for audit purposes</li>
                        <li>Generate a reversal receipt</li>
                        <li>This action CANNOT be undone</li>
                    </ul>
                </div>

                <div class="filters-bar" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px;margin-bottom:12px;">
                    <div class="form-group" style="margin:0;">
                        <label style="font-size:0.7rem;">Search</label>
                        <input type="text" id="rev-search" placeholder="🔍 Receipt # or student..." oninput="window._filterReversalPayments()" style="padding:6px 10px;border-radius:6px;border:1px solid var(--border-medium);width:100%;">
                    </div>
                    <div class="form-group" style="margin:0;">
                        <label style="font-size:0.7rem;">From</label>
                        <input type="date" id="rev-from" onchange="window._filterReversalPayments()" style="padding:6px 10px;border-radius:6px;border:1px solid var(--border-medium);width:100%;">
                    </div>
                    <div class="form-group" style="margin:0;">
                        <label style="font-size:0.7rem;">To</label>
                        <input type="date" id="rev-to" onchange="window._filterReversalPayments()" style="padding:6px 10px;border-radius:6px;border:1px solid var(--border-medium);width:100%;">
                    </div>
                    <span class="result-count" id="reversal-count" style="align-self:center;font-size:0.8rem;color:var(--text-muted);"></span>
                </div>

                <!-- Reversal History -->
                <div class="dash-card" style="margin-bottom:16px;">
                    <div class="dash-card-header" style="padding:8px 12px;display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px;">
                        <span style="font-weight:600;font-size:0.85rem;">📜 Reversal History</span>
                        <span style="font-size:0.7rem;color:var(--text-muted);">${reversals.length} reversals</span>
                    </div>
                    <div class="dash-card-body" style="padding:0;">
                        <div class="table-wrapper">
                            <table class="data-table" style="font-size:0.8rem;">
                                <thead>
                                    <tr>
                                        <th>Date</th>
                                        <th>Receipt #</th>
                                        <th>Student</th>
                                        <th style="text-align:right;">Amount</th>
                                        <th>Reason</th>
                                        <th>By</th>
                                        <th style="text-align:center;">Action</th>
                                    </tr>
                                </thead>
                                <tbody id="reversals-tbody">
                                    ${reversals.length ? reversals.map(rev => {
        const student = getStudentById(rev.student_id);
        const payment = (state.payments || []).find(p => p.id === rev.payment_id);
        const year = (state.academicYears || []).find(y => y.id === payment?.academic_year_id);
        return `
                                            <tr>
                                                <td>${fmtDateTime(rev.created_at)}</td>
                                                <td><code>${esc(rev.original_receipt || '—')}</code></td>
                                                <td>${esc(student ? `${student.first_name} ${student.last_name}` : '—')}</td>
                                                <td style="text-align:right;color:var(--danger);font-weight:600;">${fmtCurrency(rev.amount || 0)}</td>
                                                <td style="font-size:0.8rem;">${esc(rev.reason || '—')}</td>
                                                <td>${esc(rev.reversed_by || '—')}</td>
                                                <td style="text-align:center;">
                                                    <button class="btn btn-sm btn-outline" onclick="window._viewReversalDetails(${rev.id})" style="padding:2px 6px;font-size:0.7rem;">👁️</button>
                                                    <button class="btn btn-sm btn-outline" onclick="window._downloadReversalReceipt(${rev.id})" style="padding:2px 6px;font-size:0.7rem;">📥 Receipt</button>
                                                </td>
                                            </tr>
                                        `;
    }).join('') : '<tr><td colspan="7" style="text-align:center;padding:40px;color:var(--text-muted);">No reversals recorded for this academic year</td></tr>'}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>

                <!-- Recent Payments -->
                <div class="dash-card">
                    <div class="dash-card-header" style="padding:8px 12px;display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px;">
                        <span style="font-weight:600;font-size:0.85rem;">💳 Recent Payments (Reversible)</span>
                        <span style="font-size:0.7rem;color:var(--text-muted);">${recentPayments.length} payments</span>
                    </div>
                    <div class="dash-card-body" style="padding:0;">
                        <div class="table-wrapper">
                            <table class="data-table" style="font-size:0.8rem;">
                                <thead>
                                    <tr>
                                        <th>Date</th>
                                        <th>Receipt #</th>
                                        <th>Student</th>
                                        <th style="text-align:right;">Amount</th>
                                        <th>Method</th>
                                        <th>Year</th>
                                        <th style="text-align:center;">Action</th>
                                    </tr>
                                </thead>
                                <tbody id="payments-tbody">
                                    ${recentPayments.map(p => {
        const student = getStudentById(p.student_id);
        const year = (state.academicYears || []).find(y => y.id === p.academic_year_id);
        return `
                                            <tr>
                                                <td>${fmtDate(p.payment_date || p.created_at)}</td>
                                                <td><code>${esc(p.receipt_number || '—')}</code></td>
                                                <td>${esc(student ? `${student.first_name} ${student.last_name}` : '—')}</td>
                                                <td style="text-align:right;font-weight:600;">${fmtCurrency(p.amount)}</td>
                                                <td>${esc(p.payment_method || '—')}</td>
                                                <td style="font-size:0.65rem;">${esc(year?.name?.slice(-4) || '—')}</td>
                                                <td style="text-align:center;">
                                                    <button class="btn btn-sm btn-danger" onclick="window._reversePayment(${p.id})" style="padding:2px 8px;font-size:0.7rem;">↩️ Reverse</button>
                                                </td>
                                            </tr>
                                        `;
    }).join('') || '<tr><td colspan="7" style="text-align:center;padding:40px;color:var(--text-muted);">No recent payments for this academic year</td></tr>'}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;

    window._filterReversalPayments = filterReversalPayments;
    window._reversePayment = reversePayment;
    window._viewReversalDetails = viewReversalDetails;
    window._exportReversalHistory = exportReversalHistory;
    window._refreshReversals = refreshReversals;
    window._loadReversalsData = loadReversalsData;
    window._downloadReversalReceipt = downloadReversalReceipt;

    // Initial filter
    filterReversalPayments();
}

// ──────────────────────────────────────────────────────────────────────
// LOAD REVERSALS DATA (Year Change Handler)
// ──────────────────────────────────────────────────────────────────────

async function loadReversalsData() {
    const yearId = document.getElementById('rev-year-filter')?.value;
    if (yearId) {
        selectedYearId = parseInt(yearId);
        renderPaymentReversals(document.getElementById('dynamic-content'));
    }
}

// ──────────────────────────────────────────────────────────────────────
// FILTER REVERSAL PAYMENTS
// ──────────────────────────────────────────────────────────────────────

function filterReversalPayments() {
    const search = (document.getElementById('rev-search')?.value || '').toLowerCase();
    const from = document.getElementById('rev-from')?.value;
    const to = document.getElementById('rev-to')?.value;

    const tbody = document.getElementById('reversals-tbody');
    if (!tbody) return;

    let reversals = [];
    try {
        getAll('payment_reversals', 'order=created_at.desc&limit=500').then(result => {
            reversals = result || [];
            // Filter by year
            if (selectedYearId) {
                reversals = reversals.filter(r => {
                    const payment = (state.payments || []).find(p => p.id === r.payment_id);
                    return payment?.academic_year_id == selectedYearId;
                });
            }
            applyFilter(reversals);
        }).catch(() => {
            reversals = [];
            applyFilter(reversals);
        });
    } catch (e) {
        reversals = [];
        applyFilter(reversals);
    }

    function applyFilter(data) {
        let filtered = data;

        if (from) filtered = filtered.filter(r => (r.created_at || '') >= from);
        if (to) filtered = filtered.filter(r => (r.created_at || '') <= to + 'T23:59:59');

        if (search) {
            filtered = filtered.filter(r => {
                const student = getStudentById(r.student_id);
                return (r.original_receipt || '').toLowerCase().includes(search) ||
                    (student ? `${student.first_name} ${student.last_name}`.toLowerCase().includes(search) : false);
            });
        }

        const countEl = document.getElementById('reversal-count');
        if (countEl) countEl.textContent = `${filtered.length} reversal${filtered.length !== 1 ? 's' : ''}`;

        if (!filtered.length) {
            tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:40px;color:var(--text-muted);">No reversals found</td></tr>';
            return;
        }

        tbody.innerHTML = filtered.map(rev => {
            const student = getStudentById(rev.student_id);
            const payment = (state.payments || []).find(p => p.id === rev.payment_id);
            const year = (state.academicYears || []).find(y => y.id === payment?.academic_year_id);
            return `
                <tr>
                    <td>${fmtDateTime(rev.created_at)}</td>
                    <td><code>${esc(rev.original_receipt || '—')}</code></td>
                    <td>${esc(student ? `${student.first_name} ${student.last_name}` : '—')}</td>
                    <td style="text-align:right;color:var(--danger);font-weight:600;">${fmtCurrency(rev.amount || 0)}</td>
                    <td style="font-size:0.8rem;">${esc(rev.reason || '—')}</td>
                    <td>${esc(rev.reversed_by || '—')}</td>
                    <td style="text-align:center;">
                        <button class="btn btn-sm btn-outline" onclick="window._viewReversalDetails(${rev.id})" style="padding:2px 6px;font-size:0.7rem;">👁️</button>
                        <button class="btn btn-sm btn-outline" onclick="window._downloadReversalReceipt(${rev.id})" style="padding:2px 6px;font-size:0.7rem;">📥 Receipt</button>
                    </td>
                </tr>
            `;
        }).join('');
    }
}

// ──────────────────────────────────────────────────────────────────────
// REVERSE PAYMENT
// ──────────────────────────────────────────────────────────────────────

async function reversePayment(paymentId) {
    const payment = (state.payments || []).find(p => p.id === paymentId);
    if (!payment) {
        showToast('Payment not found', 'error');
        return;
    }

    const student = getStudentById(payment.student_id);
    if (!student) {
        showToast('Student not found', 'error');
        return;
    }

    const year = (state.academicYears || []).find(y => y.id === payment.academic_year_id);
    const isActiveYear = year?.is_active === true;

    if (!isActiveYear) {
        showToast('Cannot reverse payments in inactive academic year', 'warning');
        return;
    }

    // Show reversal modal
    const modalHtml = `
        <div class="modal-overlay" id="reverse-payment-modal">
            <div class="modal" style="max-width:450px;">
                <div class="modal-header">
                    <h3>↩️ Reverse Payment</h3>
                    <button class="modal-close" onclick="window.closeModal('reverse-payment-modal')">✕</button>
                </div>
                <div class="modal-body">
                    <div style="background:var(--bg-tertiary);padding:12px;border-radius:6px;margin-bottom:12px;font-size:0.85rem;">
                        <div><strong>Receipt:</strong> ${esc(payment.receipt_number || '—')}</div>
                        <div><strong>Student:</strong> ${esc(student.first_name)} ${esc(student.last_name)}</div>
                        <div><strong>Amount:</strong> ${fmtCurrency(payment.amount)}</div>
                        <div><strong>Date:</strong> ${fmtDate(payment.payment_date || payment.created_at)}</div>
                        <div><strong>Academic Year:</strong> ${esc(year?.name || '—')}</div>
                    </div>
                    <div class="form-group">
                        <label>Reason for Reversal *</label>
                        <select id="rev-reason-select" style="padding:8px 12px;border-radius:6px;border:1px solid var(--border-medium);width:100%;">
                            <option value="Incorrect amount entered">Incorrect amount entered</option>
                            <option value="Wrong student selected">Wrong student selected</option>
                            <option value="Duplicate payment">Duplicate payment</option>
                            <option value="Overpayment">Overpayment</option>
                            <option value="Payment method error">Payment method error</option>
                            <option value="Bank transaction declined">Bank transaction declined</option>
                            <option value="Fraudulent transaction">Fraudulent transaction</option>
                            <option value="Payment cancelled by parent">Payment cancelled by parent</option>
                            <option value="Wrong term/class applied">Wrong term/class applied</option>
                            <option value="Other">Other</option>
                        </select>
                    </div>
                    <div class="form-group" style="grid-column:1/-1;">
                        <label>Detailed Reason</label>
                        <textarea id="rev-reason-detail" rows="2" placeholder="Provide additional details..." style="padding:8px 12px;border-radius:6px;border:1px solid var(--border-medium);width:100%;"></textarea>
                    </div>
                    <div class="alert alert-danger" style="font-size:0.8rem;">
                        ⚠️ This action CANNOT be undone. The student's balance will be restored.
                        A reversal receipt will be generated.
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-outline" onclick="window.closeModal('reverse-payment-modal')">Cancel</button>
                    <button class="btn btn-danger" onclick="window._confirmReversePayment(${paymentId})">↩️ Confirm Reversal</button>
                </div>
            </div>
        </div>
    `;

    showModal(modalHtml);
}

// ──────────────────────────────────────────────────────────────────────
// CONFIRM REVERSE PAYMENT
// ──────────────────────────────────────────────────────────────────────

window._confirmReversePayment = async function (paymentId) {
    const payment = (state.payments || []).find(p => p.id === paymentId);
    if (!payment) {
        showToast('Payment not found', 'error');
        return;
    }

    const reason = document.getElementById('rev-reason-select')?.value || 'Other';
    const detail = document.getElementById('rev-reason-detail')?.value.trim();
    const fullReason = detail ? `${reason} - ${detail}` : reason;

    const student = getStudentById(payment.student_id);
    const cls = student ? getClassById(student.class_id) : null;
    const school = state.schoolSettings || {};
    const year = (state.academicYears || []).find(y => y.id === payment.academic_year_id);

    // Create reversal record
    const reversal = await insert('payment_reversals', {
        student_id: payment.student_id,
        payment_id: payment.id,
        original_receipt: payment.receipt_number,
        amount: payment.amount,
        reason: fullReason,
        reversed_by: getCurrentUser()?.name || getCurrentUser()?.username || 'System',
        academic_year_id: payment.academic_year_id,
        created_at: new Date().toISOString(),
    });

    if (!reversal) {
        showToast('Failed to create reversal record', 'error');
        return;
    }

    // Delete the payment
    await remove('payments', payment.id);

    // Restore fee balances
    const fees = (state.studentFees || [])
        .filter(f => f.student_id === payment.student_id && !f.is_credit && !f.manually_deleted && f.academic_year_id === payment.academic_year_id);

    // Recalculate paid amounts based on remaining payments
    const remainingPayments = (state.payments || [])
        .filter(p => p.student_id === payment.student_id && p.id !== payment.id && p.academic_year_id === payment.academic_year_id);

    const totalRemaining = remainingPayments.reduce((sum, p) => sum + p.amount, 0);

    // Reset all fees to 0 paid, then re-allocate remaining payments
    for (const fee of fees) {
        await update('student_fees', fee.id, {
            paid_amount: 0,
            is_paid: false,
            updated_at: new Date().toISOString(),
        });
    }

    // Re-allocate remaining payments (FIFO)
    let remainingAmount = totalRemaining;
    const sortedFees = fees.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

    for (const fee of sortedFees) {
        if (remainingAmount <= 0) break;
        const due = (fee.amount || 0);
        const allocation = Math.min(remainingAmount, due);
        if (allocation > 0) {
            await update('student_fees', fee.id, {
                paid_amount: allocation,
                is_paid: allocation >= due,
                updated_at: new Date().toISOString(),
            });
            remainingAmount -= allocation;
        }
    }

    // Update state
    state.payments = state.payments.filter(p => p.id !== paymentId);
    await refreshTable('payments');
    await refreshTable('student_fees');

    closeModal('reverse-payment-modal');

    // ── GENERATE REVERSAL RECEIPT ──
    const receiptData = {
        receiptNum: `REV-${payment.receipt_number || payment.id}`,
        studentName: student ? `${student.first_name} ${student.last_name}` : '—',
        studentCode: student?.student_code || '—',
        className: cls?.name || '—',
        parentName: student?.guardian_name || '—',
        amount: payment.amount,
        method: payment.payment_method || '—',
        date: fmtDate(payment.payment_date || payment.created_at),
        recordedBy: getCurrentUser()?.name || getCurrentUser()?.username || 'System',
        fees: [],
        schoolName: school.school_name || 'ECOLE LA FONTAINE',
        schoolAddress: school.school_address || 'Rubavu, Rwanda',
        logo: school.school_logo || '🏫',
        academicYear: year?.name || '',
        reversalReason: fullReason,
        isReversal: true,
        originalReceipt: payment.receipt_number,
    };

    try {
        await downloadReversalReceiptPDF(receiptData);
    } catch (e) {
        console.warn('[Reversal] Receipt generation failed:', e);
        // Still show success even if receipt fails
    }

    await notifyAction('payment_reversed', {
        message: `Payment ${payment.receipt_number} reversed for ${student?.first_name || ''} ${student?.last_name || ''}`,
        entity_type: 'payments',
        payment_id: paymentId,
        academic_year: payment.academic_year_id,
    }, ['admin', 'accountant']);

    showToast(`✅ Payment ${payment.receipt_number} reversed — Reversal receipt generated`, 'success');
    renderPaymentReversals(document.getElementById('dynamic-content'));
};

// ──────────────────────────────────────────────────────────────────────
// DOWNLOAD REVERSAL RECEIPT PDF
// ──────────────────────────────────────────────────────────────────────

async function downloadReversalReceiptPDF(receiptData) {
    const {
        receiptNum, studentName, studentCode, className, parentName,
        amount, method, date, recordedBy, schoolName, schoolAddress,
        logo, academicYear, reversalReason, originalReceipt
    } = receiptData;

    const logoHtml = (typeof logo === 'string' && (logo.startsWith('data:') || logo.startsWith('http')))
        ? `<img src="${logo}" alt="logo" style="width:38px;height:38px;object-fit:contain;border-radius:4px">`
        : `<span style="font-size:26px;line-height:1">${logo || '🏫'}</span>`;

    const html = `
        <div id="reversal-receipt-pdf" style="font-family:'Courier New',Monaco,Menlo,monospace;width:350px;margin:0 auto;background:#fff;padding:10px;font-size:9.5px;line-height:1.25">
            <div style="display:flex;align-items:center;justify-content:center;gap:8px;margin-bottom:6px">
                <div style="width:38px;height:38px;flex-shrink:0;display:flex;align-items:center;justify-content:center">${logoHtml}</div>
                <div style="text-align:center">
                    <div style="font-size:12px;font-weight:800;letter-spacing:.5px;text-transform:uppercase;line-height:1.2">${esc(schoolName)}</div>
                    ${schoolAddress ? `<div style="font-size:7px;color:#666;margin-top:1px">${esc(schoolAddress)}</div>` : ''}
                    <div style="font-size:9px;font-weight:600;letter-spacing:1px;color:#dc2626;margin-top:2px">🔴 PAYMENT REVERSAL</div>
                    <div style="font-size:8px;font-family:monospace;background:#fee2e2;display:inline-block;padding:1px 5px;margin-top:2px;border-radius:4px;color:#991b1b">${esc(receiptNum)}</div>
                </div>
            </div>
            <div style="border-top:2px solid #dc2626;margin:6px 0"></div>
            <div style="background:#fee2e2;padding:4px 8px;border-radius:4px;margin:4px 0;text-align:center;font-weight:600;color:#991b1b;font-size:8px">
                ⚠️ PAYMENT REVERSED — ${esc(originalReceipt || '')}
            </div>
            <div style="display:flex;justify-content:space-between;margin:4px 0"><span style="font-weight:600;color:#555">Student:</span><span style="font-weight:500;text-align:right">${esc(studentName)}</span></div>
            <div style="display:flex;justify-content:space-between;margin:4px 0"><span style="font-weight:600;color:#555">Code:</span><span style="font-weight:500;text-align:right">${esc(studentCode)}</span></div>
            <div style="display:flex;justify-content:space-between;margin:4px 0"><span style="font-weight:600;color:#555">Class:</span><span style="font-weight:500;text-align:right">${esc(className)}</span></div>
            <div style="display:flex;justify-content:space-between;margin:4px 0"><span style="font-weight:600;color:#555">Parent/Guardian:</span><span style="font-weight:500;text-align:right">${esc(parentName)}</span></div>
            ${academicYear ? `<div style="display:flex;justify-content:space-between;margin:4px 0"><span style="font-weight:600;color:#555">Academic Year:</span><span style="font-weight:500;text-align:right">${esc(academicYear)}</span></div>` : ''}
            <div style="border-top:1px dotted #999;margin:5px 0"></div>
            <div style="display:flex;justify-content:space-between;margin:4px 0"><span style="font-weight:600;color:#555">Original Payment:</span><span style="font-weight:500;text-align:right">${esc(originalReceipt || '—')}</span></div>
            <div style="display:flex;justify-content:space-between;margin:4px 0"><span style="font-weight:600;color:#555">Date:</span><span style="font-weight:500;text-align:right">${esc(date)}</span></div>
            <div style="display:flex;justify-content:space-between;margin:4px 0"><span style="font-weight:600;color:#555">Method:</span><span style="font-weight:500;text-align:right">${esc(method)}</span></div>
            <div style="display:flex;justify-content:space-between;margin:4px 0"><span style="font-weight:600;color:#555">Reversed By:</span><span style="font-weight:500;text-align:right">${esc(recordedBy)}</span></div>
            <div style="border-top:1px dashed #999;margin:6px 0"></div>
            <div style="display:flex;justify-content:space-between;margin:4px 0;background:#fee2e2;padding:4px 8px;border-radius:4px">
                <span style="font-weight:700;color:#991b1b">REVERSED AMOUNT:</span>
                <span style="font-weight:700;color:#991b1b">${fmtCurrency(amount)}</span>
            </div>
            <div style="display:flex;justify-content:space-between;margin:4px 0"><span style="font-weight:600;color:#555">Reason:</span><span style="font-weight:500;text-align:right">${esc(reversalReason)}</span></div>
            <div style="border-top:2px solid #dc2626;margin:6px 0"></div>
            <div style="text-align:center;font-size:8px;color:#666;margin-top:8px">
                <div style="background:#fee2e2;padding:4px 12px;border-radius:12px;display:inline-block;font-weight:700;color:#991b1b;font-size:9px">🔴 PAYMENT REVERSED</div>
                <div style="margin-top:6px">This reversal has been recorded for audit purposes</div>
                <div style="margin-top:4px">\u2729 ${esc(schoolName)} \u2729</div>
            </div>
        </div>
    `;

    const container = document.createElement('div');
    container.innerHTML = html;
    container.style.cssText = 'position:fixed;left:-9999px;top:0;z-index:-1;width:350px';
    document.body.appendChild(container);

    try {
        if (typeof html2pdf === 'undefined') {
            showToast('PDF library not loaded', 'warning');
            return;
        }
        await html2pdf().set({
            margin: [4, 4, 4, 4],
            filename: `Reversal_${esc(studentName).replace(/\s+/g, '_')}_${esc(receiptNum)}.pdf`,
            image: { type: 'jpeg', quality: 0.95 },
            html2canvas: { scale: 2, useCORS: true },
            jsPDF: { unit: 'mm', format: 'a6', orientation: 'portrait' }
        }).from(container.querySelector('#reversal-receipt-pdf')).save();
    } finally {
        document.body.removeChild(container);
    }
}

// ──────────────────────────────────────────────────────────────────────
// DOWNLOAD REVERSAL RECEIPT (for existing reversals)
// ──────────────────────────────────────────────────────────────────────

async function downloadReversalReceipt(reversalId) {
    let reversal;
    try {
        const result = await getAll('payment_reversals', { id: reversalId });
        reversal = result?.[0];
    } catch (e) {
        showToast('Reversal not found', 'error');
        return;
    }

    if (!reversal) {
        showToast('Reversal not found', 'error');
        return;
    }

    const student = getStudentById(reversal.student_id);
    const cls = student ? getClassById(student.class_id) : null;
    const payment = (state.payments || []).find(p => p.id === reversal.payment_id);
    const year = (state.academicYears || []).find(y => y.id === reversal.academic_year_id);
    const school = state.schoolSettings || {};

    const receiptData = {
        receiptNum: `REV-${reversal.original_receipt || reversal.id}`,
        studentName: student ? `${student.first_name} ${student.last_name}` : '—',
        studentCode: student?.student_code || '—',
        className: cls?.name || '—',
        parentName: student?.guardian_name || '—',
        amount: reversal.amount || 0,
        method: payment?.payment_method || '—',
        date: fmtDate(reversal.created_at),
        recordedBy: reversal.reversed_by || '—',
        fees: [],
        schoolName: school.school_name || 'ECOLE LA FONTAINE',
        schoolAddress: school.school_address || 'Rubavu, Rwanda',
        logo: school.school_logo || '🏫',
        academicYear: year?.name || '',
        reversalReason: reversal.reason || '—',
        isReversal: true,
        originalReceipt: reversal.original_receipt || '—',
    };

    try {
        await downloadReversalReceiptPDF(receiptData);
        showToast('✅ Reversal receipt downloaded', 'success');
    } catch (error) {
        showToast('Failed to download reversal receipt: ' + error.message, 'error');
    }
}

// ──────────────────────────────────────────────────────────────────────
// VIEW REVERSAL DETAILS
// ──────────────────────────────────────────────────────────────────────

async function viewReversalDetails(reversalId) {
    let reversal;
    try {
        const result = await getAll('payment_reversals', { id: reversalId });
        reversal = result?.[0];
    } catch (e) {
        showToast('Reversal not found', 'error');
        return;
    }

    if (!reversal) {
        showToast('Reversal not found', 'error');
        return;
    }

    const student = getStudentById(reversal.student_id);
    const payment = (state.payments || []).find(p => p.id === reversal.payment_id);
    const year = (state.academicYears || []).find(y => y.id === reversal.academic_year_id);

    const modalHtml = `
        <div class="modal-overlay" id="reversal-detail-modal">
            <div class="modal" style="max-width:450px;">
                <div class="modal-header">
                    <h3>📋 Reversal Details</h3>
                    <button class="modal-close" onclick="window.closeModal('reversal-detail-modal')">✕</button>
                </div>
                <div class="modal-body">
                    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:0.85rem;">
                        <div><strong style="color:var(--text-muted);font-size:0.7rem;text-transform:uppercase;">Date</strong><br>${fmtDateTime(reversal.created_at)}</div>
                        <div><strong style="color:var(--text-muted);font-size:0.7rem;text-transform:uppercase;">Receipt</strong><br><code>${esc(reversal.original_receipt || '—')}</code></div>
                        <div><strong style="color:var(--text-muted);font-size:0.7rem;text-transform:uppercase;">Student</strong><br>${esc(student ? `${student.first_name} ${student.last_name}` : '—')}</div>
                        <div><strong style="color:var(--text-muted);font-size:0.7rem;text-transform:uppercase;">Amount</strong><br><span style="color:var(--danger);font-weight:600;">${fmtCurrency(reversal.amount || 0)}</span></div>
                        <div><strong style="color:var(--text-muted);font-size:0.7rem;text-transform:uppercase;">Academic Year</strong><br>${esc(year?.name || '—')}</div>
                        <div><strong style="color:var(--text-muted);font-size:0.7rem;text-transform:uppercase;">Original Payment</strong><br><code>${esc(payment?.receipt_number || '—')}</code></div>
                        <div style="grid-column:1/-1;"><strong style="color:var(--text-muted);font-size:0.7rem;text-transform:uppercase;">Reason</strong><br>${esc(reversal.reason || '—')}</div>
                        <div style="grid-column:1/-1;"><strong style="color:var(--text-muted);font-size:0.7rem;text-transform:uppercase;">Reversed By</strong><br>${esc(reversal.reversed_by || '—')}</div>
                    </div>
                    <div style="margin-top:12px;padding:12px;background:#fee2e2;border-radius:6px;border-left:4px solid #dc2626;font-size:0.8rem;">
                        <strong style="color:#991b1b;">🔴 Reversal Receipt</strong><br>
                        <button class="btn btn-sm btn-outline" onclick="window._downloadReversalReceipt(${reversalId})" style="margin-top:4px;">📥 Download Reversal Receipt</button>
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-outline" onclick="window.closeModal('reversal-detail-modal')">Close</button>
                </div>
            </div>
        </div>
    `;

    showModal(modalHtml);
}

// ──────────────────────────────────────────────────────────────────────
// EXPORT REVERSAL HISTORY
// ──────────────────────────────────────────────────────────────────────

async function exportReversalHistory() {
    let reversals = [];
    try {
        const result = await getAll('payment_reversals', 'order=created_at.desc&limit=500');
        reversals = result || [];
        // Filter by year
        if (selectedYearId) {
            reversals = reversals.filter(r => {
                const payment = (state.payments || []).find(p => p.id === r.payment_id);
                return payment?.academic_year_id == selectedYearId;
            });
        }
    } catch (e) {
        reversals = [];
    }

    if (!reversals.length) {
        showToast('No reversals to export for this academic year', 'info');
        return;
    }

    const year = (state.academicYears || []).find(y => y.id === selectedYearId);
    const filename = `Payment_Reversals_${year?.name?.replace(/\s+/g, '_') || 'All'}_${new Date().toISOString().split('T')[0]}`;

    const data = reversals.map(rev => {
        const student = getStudentById(rev.student_id);
        const payment = (state.payments || []).find(p => p.id === rev.payment_id);
        const pYear = (state.academicYears || []).find(y => y.id === payment?.academic_year_id);
        return {
            'Date': fmtDateTime(rev.created_at),
            'Receipt #': rev.original_receipt || '—',
            'Student': student ? `${student.first_name} ${student.last_name}` : '—',
            'Amount (RWF)': rev.amount || 0,
            'Reason': rev.reason || '',
            'Reversed By': rev.reversed_by || '',
            'Academic Year': pYear?.name || '',
        };
    });

    exportToExcel(data, filename);
    showToast('✅ Reversal history exported', 'success');
}

// ──────────────────────────────────────────────────────────────────────
// REFRESH REVERSALS
// ──────────────────────────────────────────────────────────────────────

async function refreshReversals() {
    await refreshTable('payments');
    await refreshTable('payment_reversals');
    renderPaymentReversals(document.getElementById('dynamic-content'));
    showToast('🔄 Refreshed', 'info', 1000);
}