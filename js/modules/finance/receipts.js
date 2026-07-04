/**
 * ECOLE LA FONTAINE — Receipts Module
 * View, filter, print, and export receipts with academic year support
 * Last updated: 2026-07-04
 * 
 * CHANGES:
 * - Added academic year filtering
 * - Receipts are now year-specific
 * - Year selector in filters
 * - Summary stats reflect selected year
 * - Receipt export includes academic year
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
import { exportToExcel, downloadReceiptPDF } from '../../core/utils.js';
import { refreshTable } from '../../core/api.js';

// ──────────────────────────────────────────────────────────────────────
// STATE
// ──────────────────────────────────────────────────────────────────────

let selectedYearId = null;

// ──────────────────────────────────────────────────────────────────────
// MAIN RENDER FUNCTION
// ──────────────────────────────────────────────────────────────────────

export async function renderReceiptPrinting(container) {
    if (!container) return;

    await ensureStateLoaded();

    const currentYear = getCurrentAcademicYear();
    const years = (state.academicYears || []).sort((a, b) => b.id - a.id);

    // Default to current year
    if (!selectedYearId) {
        selectedYearId = currentYear?.id || null;
    }

    const selectedYear = years.find(y => y.id === selectedYearId);
    const isActiveYear = selectedYear?.is_active === true;

    // Filter payments by selected year
    let payments = (state.payments || [])
        .filter(p => !p.is_reversed);

    if (selectedYearId) {
        payments = payments.filter(p => p.academic_year_id == selectedYearId);
    }

    payments.sort((a, b) => new Date(b.payment_date || b.created_at) - new Date(a.payment_date || a.created_at));

    const totalAmount = payments.reduce((a, p) => a + (p.amount || 0), 0);
    const uniqueStudents = new Set(payments.map(p => p.student_id)).size;

    container.innerHTML = `
        <div class="dash-card">
            <div class="dash-card-header" style="flex-wrap:wrap;gap:8px;">
                <span class="dash-card-title">🧾 Receipts</span>
                <div class="btn-group" style="flex-wrap:wrap;gap:6px;">
                    <select id="rec-year-filter" onchange="window._loadReceiptsData()" style="padding:6px 10px;border-radius:6px;border:1px solid var(--border-medium);font-size:0.8rem;">
                        ${years.map(y => `
                            <option value="${y.id}" ${y.id === selectedYearId ? 'selected' : ''}>
                                ${esc(y.name)} ${y.id === currentYear?.id ? '🟢' : ''}
                            </option>
                        `).join('')}
                    </select>
                    <button class="btn btn-sm btn-outline" onclick="window._bulkPrintReceipts()">📄 Bulk Print</button>
                    <button class="btn btn-sm btn-outline" onclick="window._exportReceiptsList()">📥 Export List</button>
                    <button class="btn btn-sm btn-outline" onclick="window._refreshReceipts()">🔄 Refresh</button>
                    ${!isActiveYear ? '<span class="badge badge-neutral" style="font-size:0.65rem;">🔒 Read-only</span>' : ''}
                </div>
            </div>
            <div class="dash-card-body">
                <!-- Summary -->
                <div style="font-size:0.75rem;color:var(--text-muted);margin-bottom:12px;padding:6px 12px;background:var(--bg-tertiary);border-radius:6px;display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px;">
                    <span>📅 ${selectedYear?.name || 'All Years'} ${isActiveYear ? '🟢 Active' : '🔒 Inactive (Read-Only)'}</span>
                    <span>${payments.length} receipts · ${fmtCurrency(totalAmount)} total</span>
                </div>

                <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:12px;margin-bottom:16px;">
                    <div class="stat-card" style="padding:10px;text-align:center;">
                        <div class="stat-value">${payments.length}</div>
                        <div class="stat-label">📋 Receipts</div>
                    </div>
                    <div class="stat-card" style="padding:10px;text-align:center;">
                        <div class="stat-value" style="color:var(--success);">${fmtCurrency(totalAmount)}</div>
                        <div class="stat-label">💰 Total</div>
                    </div>
                    <div class="stat-card" style="padding:10px;text-align:center;">
                        <div class="stat-value">${uniqueStudents}</div>
                        <div class="stat-label">👥 Students</div>
                    </div>
                    <div class="stat-card" style="padding:10px;text-align:center;">
                        <div class="stat-value">${new Set(payments.map(p => p.payment_method)).size}</div>
                        <div class="stat-label">💳 Methods</div>
                    </div>
                </div>

                <!-- Filters -->
                <div class="filters-bar" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px;margin-bottom:16px;">
                    <div class="form-group" style="margin:0;">
                        <label style="font-size:0.7rem;">Search</label>
                        <input type="text" id="rec-search" placeholder="🔍 Receipt #, student..." oninput="window._filterReceipts()" style="padding:6px 10px;border-radius:6px;border:1px solid var(--border-medium);width:100%;">
                    </div>
                    <div class="form-group" style="margin:0;">
                        <label style="font-size:0.7rem;">From</label>
                        <input type="date" id="rec-from" onchange="window._filterReceipts()" style="padding:6px 10px;border-radius:6px;border:1px solid var(--border-medium);width:100%;">
                    </div>
                    <div class="form-group" style="margin:0;">
                        <label style="font-size:0.7rem;">To</label>
                        <input type="date" id="rec-to" onchange="window._filterReceipts()" style="padding:6px 10px;border-radius:6px;border:1px solid var(--border-medium);width:100%;">
                    </div>
                    <div class="form-group" style="margin:0;">
                        <label style="font-size:0.7rem;">Method</label>
                        <select id="rec-method" onchange="window._filterReceipts()" style="padding:6px 10px;border-radius:6px;border:1px solid var(--border-medium);width:100%;">
                            <option value="">All Methods</option>
                            <option value="Cash">Cash</option>
                            <option value="Mobile-Money">Mobile-Money</option>
                            <option value="Bank Transfer">Bank Transfer</option>
                            <option value="Cheque">Cheque</option>
                        </select>
                    </div>
                    <span class="result-count" id="rec-count" style="align-self:center;font-size:0.8rem;color:var(--text-muted);"></span>
                </div>

                <!-- Receipts Table -->
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
                                <th>Year</th>
                                <th style="text-align:center;">Actions</th>
                            </tr>
                        </thead>
                        <tbody id="receipts-tbody">
                            <tr><td colspan="8" style="text-align:center;padding:40px;color:var(--text-muted);">Loading...</td></tr>
                        </tbody>
                    </table>
                </div>
            </div>
        </div>

        <!-- Receipt Settings -->
        <div class="dash-card" style="margin-top:20px;">
            <div class="dash-card-header">
                <span class="dash-card-title">⚙️ Receipt Settings</span>
            </div>
            <div class="dash-card-body">
                <div class="form-grid">
                    <div class="form-group">
                        <label>Default Format</label>
                        <select id="rec-format" onchange="window._saveReceiptSetting()" style="padding:8px 12px;border-radius:6px;border:1px solid var(--border-medium);width:100%;">
                            <option value="standard" ${localStorage.getItem('receipt_format') === 'standard' || !localStorage.getItem('receipt_format') ? 'selected' : ''}>Standard</option>
                            <option value="compact" ${localStorage.getItem('receipt_format') === 'compact' ? 'selected' : ''}>Compact</option>
                            <option value="detailed" ${localStorage.getItem('receipt_format') === 'detailed' ? 'selected' : ''}>Detailed</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Include Logo</label>
                        <select id="rec-logo" onchange="window._saveReceiptSetting()" style="padding:8px 12px;border-radius:6px;border:1px solid var(--border-medium);width:100%;">
                            <option value="yes" ${localStorage.getItem('receipt_include_logo') !== 'no' ? 'selected' : ''}>Yes</option>
                            <option value="no" ${localStorage.getItem('receipt_include_logo') === 'no' ? 'selected' : ''}>No</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Include Signatures</label>
                        <select id="rec-signatures" onchange="window._saveReceiptSetting()" style="padding:8px 12px;border-radius:6px;border:1px solid var(--border-medium);width:100%;">
                            <option value="yes" ${localStorage.getItem('receipt_include_signatures') !== 'no' ? 'selected' : ''}>Yes</option>
                            <option value="no" ${localStorage.getItem('receipt_include_signatures') === 'no' ? 'selected' : ''}>No</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Auto-Print After Payment</label>
                        <select id="rec-auto-print" onchange="window._saveReceiptSetting()" style="padding:8px 12px;border-radius:6px;border:1px solid var(--border-medium);width:100%;">
                            <option value="yes" ${localStorage.getItem('receipt_auto_print') === 'yes' ? 'selected' : ''}>Yes</option>
                            <option value="no" ${localStorage.getItem('receipt_auto_print') !== 'yes' ? 'selected' : ''}>No</option>
                        </select>
                    </div>
                </div>
                <div class="btn-group" style="margin-top:12px;">
                    <button class="btn btn-sm btn-outline" onclick="window._previewReceiptSettings()">👁️ Preview Settings</button>
                </div>
            </div>
        </div>
    `;

    window._filterReceipts = filterReceipts;
    window._bulkPrintReceipts = bulkPrintReceipts;
    window._exportReceiptsList = exportReceiptsList;
    window._printReceipt = printReceipt;
    window._downloadReceipt = downloadReceipt;
    window._saveReceiptSetting = saveReceiptSetting;
    window._previewReceiptSettings = previewReceiptSettings;
    window._refreshReceipts = refreshReceipts;
    window._loadReceiptsData = loadReceiptsData;

    filterReceipts();
}

// ──────────────────────────────────────────────────────────────────────
// LOAD RECEIPTS DATA (Year Change Handler)
// ──────────────────────────────────────────────────────────────────────

async function loadReceiptsData() {
    const yearId = document.getElementById('rec-year-filter')?.value;
    if (yearId) {
        selectedYearId = parseInt(yearId);
        renderReceiptPrinting(document.getElementById('dynamic-content'));
    }
}

// ──────────────────────────────────────────────────────────────────────
// FILTER RECEIPTS
// ──────────────────────────────────────────────────────────────────────

function filterReceipts() {
    const search = (document.getElementById('rec-search')?.value || '').toLowerCase();
    const from = document.getElementById('rec-from')?.value;
    const to = document.getElementById('rec-to')?.value;
    const method = document.getElementById('rec-method')?.value;

    let payments = (state.payments || [])
        .filter(p => !p.is_reversed);

    // Year filter (already applied in render)
    if (selectedYearId) {
        payments = payments.filter(p => p.academic_year_id == selectedYearId);
    }

    payments.sort((a, b) => new Date(b.payment_date || b.created_at) - new Date(a.payment_date || a.created_at));

    if (from) payments = payments.filter(p => (p.payment_date || p.created_at || '') >= from);
    if (to) payments = payments.filter(p => (p.payment_date || p.created_at || '') <= to);
    if (method) payments = payments.filter(p => p.payment_method === method);

    if (search) {
        payments = payments.filter(p => {
            const student = getStudentById(p.student_id);
            return (p.receipt_number || '').toLowerCase().includes(search) ||
                (student ? (student.first_name + ' ' + student.last_name).toLowerCase().includes(search) : false);
        });
    }

    const countEl = document.getElementById('rec-count');
    if (countEl) countEl.textContent = `${payments.length} receipt${payments.length !== 1 ? 's' : ''}`;

    const tbody = document.getElementById('receipts-tbody');
    if (!tbody) return;

    if (!payments.length) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:40px;color:var(--text-muted);">No receipts found for this academic year</td></tr>';
        return;
    }

    const year = (state.academicYears || []).find(y => y.id === selectedYearId);

    tbody.innerHTML = payments.map(p => {
        const student = getStudentById(p.student_id);
        const cls = student ? getClassById(student.class_id) : null;
        const pYear = (state.academicYears || []).find(y => y.id === p.academic_year_id);
        return `
            <tr>
                <td><code style="font-size:0.7rem;">${esc(p.receipt_number || '—')}</code></td>
                <td style="font-size:0.8rem;">${fmtDate(p.payment_date || p.created_at)}</td>
                <td><strong>${student ? esc(student.first_name + ' ' + student.last_name) : '—'}</strong></td>
                <td>${esc(cls?.name || '—')}</td>
                <td style="text-align:right;font-weight:600;">${fmtCurrency(p.amount)}</td>
                <td><span class="badge badge-neutral">${esc(p.payment_method || '—')}</span></td>
                <td style="font-size:0.65rem;">${esc(pYear?.name?.slice(-4) || '—')}</td>
                <td style="text-align:center;">
                    <button class="btn btn-sm btn-outline" onclick="window._printReceipt(${p.id})" style="padding:2px 8px;font-size:0.7rem;">🧾 Print</button>
                    <button class="btn btn-sm btn-outline" onclick="window._downloadReceipt(${p.id})" style="padding:2px 8px;font-size:0.7rem;">📥 PDF</button>
                </td>
            </tr>
        `;
    }).join('');
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
    const format = localStorage.getItem('receipt_format') || 'standard';
    const includeLogo = localStorage.getItem('receipt_include_logo') !== 'no';
    const includeSignatures = localStorage.getItem('receipt_include_signatures') !== 'no';
    const year = (state.academicYears || []).find(y => y.id === payment.academic_year_id);

    const printWindow = window.open('', '_blank');
    if (!printWindow) {
        showToast('Popup blocked. Please allow popups.', 'warning');
        return;
    }

    const logoHtml = includeLogo && school.school_logo
        ? `<div style="font-size:24px;">🏫</div>`
        : '';

    const signaturesHtml = includeSignatures ? `
        <div style="display:flex;justify-content:space-between;margin-top:16px;padding-top:12px;border-top:1px solid #ccc;">
            <div style="text-align:center;flex:1;">
                <div style="border-top:1px solid #000;padding-top:4px;margin:0 20px;">Cashier</div>
            </div>
            <div style="text-align:center;flex:1;">
                <div style="border-top:1px solid #000;padding-top:4px;margin:0 20px;">Head of School</div>
            </div>
        </div>
    ` : '';

    const compact = format === 'compact';
    const detailed = format === 'detailed';

    printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Receipt ${esc(payment.receipt_number)}</title>
            <style>
                body { font-family: ${compact ? "'Courier New', monospace" : "Arial, sans-serif"}; padding: 20px; max-width: ${compact ? '320px' : '500px'}; margin: 0 auto; }
                .header { text-align: center; border-bottom: 2px solid #1a3a5c; padding-bottom: 10px; }
                .header h2 { margin: 0; color: #1a3a5c; font-size: ${compact ? '16px' : '20px'}; }
                .row { display: flex; justify-content: space-between; padding: ${compact ? '3px 0' : '6px 0'}; border-bottom: ${compact ? '1px dotted #eee' : '1px solid #eee'}; }
                .total { font-size: ${compact ? '16px' : '20px'}; font-weight: bold; text-align: center; padding: 10px; background: #d1fae5; border-radius: 8px; margin: 10px 0; }
                .footer { text-align: center; font-size: 10px; color: #666; margin-top: 16px; border-top: 1px solid #ccc; padding-top: 10px; }
                .detail-row { display: flex; justify-content: space-between; font-size: 11px; padding: 2px 0; border-bottom: 1px dotted #f0f0f0; }
                @media print { body { padding: 0; } }
            </style>
        </head>
        <body>
            <div class="header">
                ${logoHtml}
                <h2>${esc(school.school_name || 'ECOLE LA FONTAINE')}</h2>
                ${!compact ? `<div style="font-size:11px;color:#666;">${esc(school.school_address || 'Rubavu, Rwanda')}</div>` : ''}
                ${!compact ? `<div style="font-size:11px;color:#666;">Tel: ${esc(school.school_phone || '')}</div>` : ''}
                <div style="font-size:${compact ? '11px' : '13px'};margin:4px 0;font-weight:bold;">PAYMENT RECEIPT</div>
                <div style="font-size:${compact ? '10px' : '12px'};color:#666;">${esc(payment.receipt_number)}</div>
                ${year ? `<div style="font-size:${compact ? '8px' : '10px'};color:#666;">📅 ${esc(year.name)}</div>` : ''}
            </div>
            <div style="margin:${compact ? '6px 0' : '10px 0'};">
                <div class="row"><span>Date:</span><span>${fmtDate(payment.payment_date || payment.created_at)}</span></div>
                <div class="row"><span>Student:</span><span>${student ? esc(student.first_name + ' ' + student.last_name) : '—'}</span></div>
                <div class="row"><span>Class:</span><span>${esc(cls?.name || '—')}</span></div>
                <div class="row"><span>Method:</span><span>${esc(payment.payment_method || '—')}</span></div>
                ${payment.reference ? `<div class="row"><span>Reference:</span><span>${esc(payment.reference)}</span></div>` : ''}
                ${payment.notes && !compact ? `<div class="row"><span>Notes:</span><span style="text-align:right;">${esc(payment.notes)}</span></div>` : ''}
                ${detailed ? `
                    <div style="margin:8px 0;padding:8px;background:#f8fafc;border-radius:4px;">
                        <div style="font-weight:bold;margin-bottom:4px;">Fee Breakdown:</div>
                        ${(() => {
                const fees = (state.studentFees || []).filter(f => f.student_id === payment.student_id && !f.is_credit && f.academic_year_id == payment.academic_year_id);
                return fees.slice(0, 5).map(f => {
                    const cat = state.feeCategories.find(c => c.id === f.fee_category_id);
                    return `<div class="detail-row"><span>${esc(cat?.name || 'Fee')}</span><span>${fmtCurrency(f.amount)}</span></div>`;
                }).join('') || '<div class="detail-row"><span>No fee details</span><span>—</span></div>';
            })()}
                    </div>
                ` : ''}
            </div>
            <div style="border-bottom:2px solid #1a3a5c;margin:${compact ? '6px 0' : '10px 0'};"></div>
            <div class="total">${fmtCurrency(payment.amount)}</div>
            <div style="text-align:center;font-size:${compact ? '10px' : '12px'};color:#666;">Thank you for your payment</div>
            ${signaturesHtml}
            <div class="footer">
                Generated on ${new Date().toLocaleString()}
                ${payment.receipt_number ? ` · #${esc(payment.receipt_number)}` : ''}
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
// DOWNLOAD RECEIPT PDF
// ──────────────────────────────────────────────────────────────────────

async function downloadReceipt(paymentId) {
    const payment = state.payments.find(p => p.id === paymentId);
    if (!payment) {
        showToast('Payment not found', 'error');
        return;
    }

    const student = getStudentById(payment.student_id);
    const cls = student ? getClassById(student.class_id) : null;
    const school = state.schoolSettings || {};
    const year = (state.academicYears || []).find(y => y.id === payment.academic_year_id);

    const receiptData = {
        receiptNum: payment.receipt_number || `RCP-${payment.id}`,
        studentName: student ? `${student.first_name} ${student.last_name}` : '—',
        studentCode: student?.student_code || '—',
        className: cls?.name || '—',
        parentName: student?.guardian_name || '—',
        amount: payment.amount,
        method: payment.payment_method || '—',
        date: fmtDate(payment.payment_date || payment.created_at),
        recordedBy: payment.recorded_by ? { role: 'staff', name: payment.recorded_by } : null,
        fees: [],
        schoolName: school.school_name || 'ECOLE LA FONTAINE',
        schoolAddress: school.school_address || 'Rubavu, Rwanda',
        logo: school.school_logo || '🏫',
        academicYear: year?.name || '',
    };

    try {
        await downloadReceiptPDF(receiptData);
        showToast('✅ Receipt downloaded', 'success');
    } catch (error) {
        showToast('Failed to download receipt: ' + error.message, 'error');
    }
}

// ──────────────────────────────────────────────────────────────────────
// BULK PRINT RECEIPTS
// ──────────────────────────────────────────────────────────────────────

function bulkPrintReceipts() {
    let payments = (state.payments || [])
        .filter(p => p.receipt_number && !p.is_reversed);

    if (selectedYearId) {
        payments = payments.filter(p => p.academic_year_id == selectedYearId);
    }

    payments.sort((a, b) => new Date(b.payment_date || b.created_at) - new Date(a.payment_date || a.created_at));

    if (!payments.length) {
        showToast('No receipts to print', 'warning');
        return;
    }

    const year = (state.academicYears || []).find(y => y.id === selectedYearId);
    if (!confirmDialog(`Print ${payments.length} receipts from ${year?.name || 'current year'}? Multiple windows will open.`)) return;

    let printed = 0;
    for (const p of payments.slice(0, 20)) {
        setTimeout(() => {
            printReceipt(p.id);
            printed++;
        }, printed * 300);
    }

    showToast(`✅ Sent ${Math.min(payments.length, 20)} receipts to print${payments.length > 20 ? ` (${payments.length - 20} more not printed)` : ''}`, 'success');
}

// ──────────────────────────────────────────────────────────────────────
// EXPORT RECEIPTS LIST
// ──────────────────────────────────────────────────────────────────────

function exportReceiptsList() {
    let payments = (state.payments || [])
        .filter(p => !p.is_reversed);

    if (selectedYearId) {
        payments = payments.filter(p => p.academic_year_id == selectedYearId);
    }

    payments.sort((a, b) => new Date(b.payment_date || b.created_at) - new Date(a.payment_date || a.created_at));

    const year = (state.academicYears || []).find(y => y.id === selectedYearId);
    const filename = `Receipts_${year?.name?.replace(/\s+/g, '_') || 'All'}_${new Date().toISOString().split('T')[0]}`;

    const data = payments.map(p => {
        const student = getStudentById(p.student_id);
        const cls = student ? getClassById(student.class_id) : null;
        const pYear = (state.academicYears || []).find(y => y.id === p.academic_year_id);
        return {
            'Receipt #': p.receipt_number || '',
            'Date': fmtDate(p.payment_date || p.created_at),
            'Student': student ? `${student.first_name} ${student.last_name}` : '—',
            'Class': cls?.name || '—',
            'Amount (RWF)': p.amount || 0,
            'Method': p.payment_method || '—',
            'Reference': p.reference || '',
            'Academic Year': pYear?.name || '',
        };
    });

    exportToExcel(data, filename);
    showToast('✅ Receipts list exported', 'success');
}

// ──────────────────────────────────────────────────────────────────────
// SAVE RECEIPT SETTING
// ──────────────────────────────────────────────────────────────────────

function saveReceiptSetting() {
    const format = document.getElementById('rec-format')?.value;
    const logo = document.getElementById('rec-logo')?.value;
    const signatures = document.getElementById('rec-signatures')?.value;
    const autoPrint = document.getElementById('rec-auto-print')?.value;

    if (format) localStorage.setItem('receipt_format', format);
    if (logo) localStorage.setItem('receipt_include_logo', logo);
    if (signatures) localStorage.setItem('receipt_include_signatures', signatures);
    if (autoPrint) localStorage.setItem('receipt_auto_print', autoPrint);

    showToast('✅ Receipt settings saved', 'success');
}

// ──────────────────────────────────────────────────────────────────────
// PREVIEW RECEIPT SETTINGS
// ──────────────────────────────────────────────────────────────────────

function previewReceiptSettings() {
    const format = localStorage.getItem('receipt_format') || 'standard';
    const includeLogo = localStorage.getItem('receipt_include_logo') !== 'no';
    const includeSignatures = localStorage.getItem('receipt_include_signatures') !== 'no';

    const modalHtml = `
        <div class="modal-overlay" id="receipt-preview-modal">
            <div class="modal" style="max-width:450px;">
                <div class="modal-header">
                    <h3>👁️ Receipt Preview</h3>
                    <button class="modal-close" onclick="window.closeModal('receipt-preview-modal')">✕</button>
                </div>
                <div class="modal-body">
                    <div style="border:1px solid var(--border-medium);border-radius:8px;padding:16px;font-family:${format === 'compact' ? "'Courier New', monospace" : "Arial, sans-serif"};max-width:${format === 'compact' ? '320px' : '100%'};margin:0 auto;">
                        <div style="text-align:center;border-bottom:2px solid #1a3a5c;padding-bottom:8px;">
                            ${includeLogo ? '<div style="font-size:20px;">🏫</div>' : ''}
                            <div style="font-weight:bold;font-size:${format === 'compact' ? '14px' : '18px'};color:#1a3a5c;">ECOLE LA FONTAINE</div>
                            ${format !== 'compact' ? '<div style="font-size:10px;color:#666;">Rubavu, Rwanda</div>' : ''}
                            <div style="font-size:${format === 'compact' ? '10px' : '12px'};font-weight:bold;">PAYMENT RECEIPT</div>
                            <div style="font-size:${format === 'compact' ? '9px' : '11px'};color:#666;">RCP-PREVIEW-001</div>
                        </div>
                        <div style="margin:8px 0;">
                            <div style="display:flex;justify-content:space-between;padding:${format === 'compact' ? '2px 0' : '4px 0'};border-bottom:1px dotted #eee;font-size:${format === 'compact' ? '11px' : '13px'};">
                                <span>Date:</span><span>${new Date().toLocaleDateString()}</span>
                            </div>
                            <div style="display:flex;justify-content:space-between;padding:${format === 'compact' ? '2px 0' : '4px 0'};border-bottom:1px dotted #eee;font-size:${format === 'compact' ? '11px' : '13px'};">
                                <span>Student:</span><span>Sample Student</span>
                            </div>
                            <div style="display:flex;justify-content:space-between;padding:${format === 'compact' ? '2px 0' : '4px 0'};border-bottom:1px dotted #eee;font-size:${format === 'compact' ? '11px' : '13px'};">
                                <span>Amount:</span><span style="font-weight:bold;">50,000 RWF</span>
                            </div>
                            <div style="display:flex;justify-content:space-between;padding:${format === 'compact' ? '2px 0' : '4px 0'};font-size:${format === 'compact' ? '11px' : '13px'};">
                                <span>Method:</span><span>Cash</span>
                            </div>
                        </div>
                        <div style="border-bottom:2px solid #1a3a5c;margin:6px 0;"></div>
                        <div style="text-align:center;font-size:${format === 'compact' ? '14px' : '18px'};font-weight:bold;padding:8px;background:#d1fae5;border-radius:8px;">
                            50,000 RWF
                        </div>
                        ${includeSignatures ? `
                            <div style="display:flex;justify-content:space-between;margin-top:12px;padding-top:8px;border-top:1px solid #ccc;font-size:10px;">
                                <div style="text-align:center;flex:1;"><div style="border-top:1px solid #000;padding-top:4px;margin:0 10px;">Cashier</div></div>
                                <div style="text-align:center;flex:1;"><div style="border-top:1px solid #000;padding-top:4px;margin:0 10px;">Head of School</div></div>
                            </div>
                        ` : ''}
                        <div style="text-align:center;font-size:9px;color:#666;margin-top:8px;border-top:1px solid #ccc;padding-top:6px;">
                            Preview · ${format.charAt(0).toUpperCase() + format.slice(1)} Format
                        </div>
                    </div>
                    <div style="margin-top:12px;font-size:0.8rem;color:var(--text-muted);text-align:center;">
                        Format: ${format} · Logo: ${includeLogo ? 'Yes' : 'No'} · Signatures: ${includeSignatures ? 'Yes' : 'No'}
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-outline" onclick="window.closeModal('receipt-preview-modal')">Close</button>
                </div>
            </div>
        </div>
    `;

    showModal(modalHtml);
}

// ──────────────────────────────────────────────────────────────────────
// REFRESH RECEIPTS
// ──────────────────────────────────────────────────────────────────────

async function refreshReceipts() {
    await refreshTable('payments');
    await filterReceipts();
    showToast('🔄 Refreshed', 'info', 1000);
}