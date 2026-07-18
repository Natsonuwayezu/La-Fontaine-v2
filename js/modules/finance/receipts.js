/* ═══════════════════════════════════════════════════════════════════
   js/modules/finance/receipts.js
   ═══════════════════════════════════════════════════════════════════
   Purpose : Browse recorded payments as receipts, reprint any of them
             (A4 or thermal), and export the visible list to Excel.
             For general payment browsing/filtering by class/date, see
             payment-history.js; this page is specifically about the
             receipt document itself.

             Reconstructs each receipt's line items from
             state.paymentAllocations joined against state.studentFees
             for fee names — print-engine.js's buildReceiptA4() doc
             comment already anticipates this exact path ("from
             validatePaymentLineItems() or payment_allocations").

   Dependencies (plain-script globals loaded earlier in index.html):
   api.js: ensureStateLoaded
   data-loader.js: loadPayments, loadStudentFees
   print-engine.js: printReceipt
   integrations/xlsx.js: XLSXIntegration (bare reference — not window-
                          exposed by that file, but loads earlier in
                          index.html so it's in scope like any other
                          plain-script global)
   permissions.js: canViewPayments
   state.js: state
   utils.js: esc, fmtCurrency, fmtDate, debounce
   toast.js: showToast
   constants.js: DEBOUNCE_SEARCH
   ═══════════════════════════════════════════════════════════════════ */

'use strict';

async function renderReceipts(container, params = {}) {
    if (!container) return;

    if (!canViewPayments()) {
        container.innerHTML = `<div class="alert alert-danger">Access denied.</div>`;
        return;
    }

    container.innerHTML = `<div class="dashboard-page"><div class="loading-inline">Loading receipts…</div></div>`;

    await ensureStateLoaded();
    await loadPayments();
    await loadStudentFees();

    let searchQuery = '';

    function studentName(id) {
        const s = (state.students || []).find(s => s.id === parseInt(id));
        return s ? `${s.first_name} ${s.last_name}` : '—';
    }

    function filteredPayments() {
        const rows = [...(state.payments || [])].sort((a, b) => new Date(b.payment_date || 0) - new Date(a.payment_date || 0));
        if (!searchQuery) return rows;
        return rows.filter(p =>
            (p.receipt_number || '').toLowerCase().includes(searchQuery) ||
            studentName(p.student_id).toLowerCase().includes(searchQuery)
        );
    }

    /**
     * Reconstruct a payment's line items from payment_allocations,
     * joined against student_fees for the fee name. Falls back to a
     * single generic line if no allocation rows are found (older
     * payments recorded before allocations were tracked, or the
     * allocations table hasn't loaded).
     */
    function buildLineItemsForPayment(payment) {
        const allocations = (state.paymentAllocations || []).filter(a => a.payment_id === payment.id);
        if (!allocations.length) {
            return [{ feeName: 'Payment', owed: payment.amount, allocated: payment.amount }];
        }
        return allocations.map(a => {
            const fee = (state.studentFees || []).find(f => f.id === a.student_fee_id);
            return {
                feeName: fee?.fee_name || fee?.description || 'Fee',
                owed: fee ? computeFeeBalance(fee).remaining + Number(a.amount) : Number(a.amount),
                allocated: Number(a.amount),
            };
        });
    }

    function printOne(paymentId, thermal) {
        const payment = (state.payments || []).find(p => p.id === parseInt(paymentId));
        if (!payment) { showToast('Payment not found', 'error'); return; }
        const student = (state.students || []).find(s => s.id === payment.student_id);
        if (!student) { showToast('Student record not found', 'error'); return; }

        const lineItems = buildLineItemsForPayment(payment);
        const total = lineItems.reduce((sum, li) => sum + Number(li.allocated || 0), 0);
        printReceipt(payment, student, lineItems, total || payment.amount, thermal);
    }

    async function exportVisible() {
        const rows = filteredPayments();
        if (!rows.length) { showToast('Nothing to export', 'error', 'No receipts match the current search.'); return; }

        try {
            await XLSXIntegration.exportRows(`receipts_${todayISO()}.xlsx`, [{
                name: 'Receipts',
                rows: rows.map(p => ({
                    'Receipt #': p.receipt_number || `RCP-${p.id}`,
                    'Date': fmtDate(p.payment_date),
                    'Student': studentName(p.student_id),
                    'Amount (RWF)': p.amount,
                    'Method': p.payment_method || '—',
                })),
            }]);
            showToast('Export ready', 'success', `${rows.length} receipt${rows.length === 1 ? '' : 's'} exported.`);
        } catch (err) {
            showToast('Export failed', 'error', err.message);
        }
    }

    function render() {
        const rows = filteredPayments();

        container.innerHTML = `
            <div class="dashboard-page">
                <div class="settings-section">
                    <div class="settings-section__title">Receipts</div>
                    <div class="settings-section__desc">${rows.length} receipt${rows.length === 1 ? '' : 's'}. Reprint any receipt, or export the current list.</div>
                </div>

                <div class="filters-bar">
                    <input type="text" class="form-input" id="rc-search" placeholder="Search receipt # or student name…" value="${esc(searchQuery)}">
                    <button class="btn btn-outline" id="rc-export-btn"><i class="fa-solid fa-file-export"></i> Export List</button>
                </div>

                <table class="logs-table">
                    <thead><tr><th>Receipt #</th><th>Date</th><th>Student</th><th>Amount</th><th>Method</th><th></th></tr></thead>
                    <tbody>
                        ${rows.map(p => `
                            <tr>
                                <td>${esc(p.receipt_number || `RCP-${p.id}`)}</td>
                                <td>${fmtDate(p.payment_date)}</td>
                                <td>${esc(studentName(p.student_id))}</td>
                                <td>${fmtCurrency(p.amount)}</td>
                                <td><span class="badge">${esc(p.payment_method || '—')}</span></td>
                                <td style="display:flex; gap:6px;">
                                    <button class="btn btn-sm btn-outline" data-print="${p.id}" data-thermal="0" title="Print A4"><i class="fa-solid fa-print"></i> A4</button>
                                    <button class="btn btn-sm btn-outline" data-print="${p.id}" data-thermal="1" title="Print thermal"><i class="fa-solid fa-receipt"></i> Thermal</button>
                                </td>
                            </tr>
                        `).join('') || '<tr><td colspan="6" style="text-align:center; padding:24px;">No receipts match this search.</td></tr>'}
                    </tbody>
                </table>
            </div>
        `;

        bindEvents();
    }

    function bindEvents() {
        document.getElementById('rc-search')?.addEventListener('input', debounce((e) => {
            searchQuery = e.target.value.trim().toLowerCase();
            render();
        }, DEBOUNCE_SEARCH));

        document.getElementById('rc-export-btn')?.addEventListener('click', exportVisible);

        container.querySelectorAll('[data-print]').forEach(btn => {
            btn.addEventListener('click', () => printOne(btn.dataset.print, btn.dataset.thermal === '1'));
        });
    }

    render();
}

function destroyReceipts() {
    // Nothing to tear down — no timers/listeners outlive the container.
}

/* ═══════════════════════════════════════════════════════════════════
   EXPOSE
   ═══════════════════════════════════════════════════════════════════ */

window.renderReceipts = renderReceipts;
window.destroyReceipts = destroyReceipts;
