/* ═══════════════════════════════════════════════════════════════════
   js/modules/finance/record-payment.js
   ═══════════════════════════════════════════════════════════════════
   Purpose : Record a student payment.
             - Student selector (searchable)
             - Fee list with CHECKBOX + individual amount input per row
             - Live running total as amounts are typed
             - FIFO allocation preview before saving
             - Credit balance display and auto-application
             - Holiday-mode aware: writes to correct tables
             - Auto-generates receipt and triggers print/download
   Roles   : admin, accountant
   ═══════════════════════════════════════════════════════════════════ */

'use strict';

async function renderRecordPayment(container, params = {}) {
    const app = container;
    if (!canRecordPayment()) {
        app.innerHTML = `<div class="alert alert-danger">Access denied.</div>`;
        return;
    }

    await ensureStateLoaded();
    await loadStudentFees();
    await loadPayments();

    const holiday = isHolidayMode();
    const activeYear = getActiveYear();
    const activeTerm = getActiveTerm();
    const today = todayISO();

    // Pre-selected student from localStorage (set by finance-dashboard debtor rows)
    const preselId = params.studentId
        || parseInt(localStorage.getItem('elf_pay_student') || '0', 10) || null;
    localStorage.removeItem('elf_pay_student');

    // Module-level state
    let currentStudentId = preselId || null;
    let selectedFeeIds = new Set();
    let enteredAmounts = {};    // feeId → string amount entered
    let currentCredit = 0;
    let currentFees = [];    // unpaid student_fee rows for current student

    /* ── HELPER: load fees for selected student ───────────────────── */
    function loadFeesForStudent(studentId) {
        if (!studentId) { currentFees = []; currentCredit = 0; return; }

        const yearId = getActiveYearId();
        currentFees = (state.studentFees || []).filter(f =>
            f.student_id === parseInt(studentId) &&
            f.academic_year_id === yearId &&
            !f.is_paid && !f.is_waived
        ).sort((a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0));

        // Credit balance
        const creditRow = (state.creditBalances || []).find(c =>
            c.student_id === parseInt(studentId)
        );
        currentCredit = creditRow ? Number(creditRow.credit_amount || 0) : 0;

        // Reset selections
        selectedFeeIds = new Set();
        enteredAmounts = {};
    }

    /* ── HELPER: compute live total from entered amounts ──────────── */
    function getLiveTotal() {
        let total = 0;
        selectedFeeIds.forEach(feeId => {
            const val = parseFloat(enteredAmounts[feeId] || 0);
            if (!isNaN(val) && val > 0) total += val;
        });
        return total;
    }

    /* ── HELPER: render fee table rows ───────────────────────────── */
    function buildFeeRows() {
        if (currentFees.length === 0) {
            return `<tr><td colspan="6" class="text-center" style="padding:32px;">
                No outstanding fees for this student in ${esc(activeYear?.year_name || 'this year')}.
            </td></tr>`;
        }

        return currentFees.map(fee => {
            const bal = computeFeeBalance(fee);
            const isChecked = selectedFeeIds.has(fee.id);
            const entered = enteredAmounts[fee.id] || '';
            const status = getFeeStatusDisplay(fee);

            return `
            <tr class="fee-row ${isChecked ? 'fee-row-selected' : ''}" data-fee-id="${fee.id}">
                <td style="padding:10px 8px;text-align:center;">
                    <input type="checkbox"
                           id="fee-chk-${fee.id}"
                           ${isChecked ? 'checked' : ''}
                           onchange="onFeeCheckboxChange(${fee.id}, this.checked)"
                           aria-label="Select ${esc(fee.fee_name || 'fee')}">
                </td>
                <td style="padding:10px 8px;">
                    <strong>${esc(fee.fee_name || '—')}</strong>
                    ${fee.due_date ? `<div class="fee-due" style="font-size:11px;color:var(--text-muted);">
                        Due: ${esc(fmtDate(fee.due_date))}
                        ${fee.due_date < today ? '<span class="badge badge-danger" style="font-size:9px;">Overdue</span>' : ''}
                    </div>` : ''}
                </td>
                <td style="padding:10px 8px;text-align:right;">${fmtCurrency(bal.amount)}</td>
                <td style="padding:10px 8px;text-align:right;color:var(--color-success);">${fmtCurrency(bal.paid)}</td>
                <td style="padding:10px 8px;text-align:right;font-weight:700;color:var(--color-danger);">${fmtCurrency(bal.remaining)}</td>
                <td style="padding:10px 8px;">
                    <input type="number"
                           id="fee-amt-${fee.id}"
                           class="input fee-amount-input ${isChecked ? '' : 'input-disabled'}"
                           min="0"
                           max="${bal.remaining}"
                           step="100"
                           placeholder="0"
                           value="${esc(entered)}"
                           ${isChecked ? '' : 'disabled readonly'}
                           oninput="onFeeAmountInput(${fee.id}, this.value)"
                           aria-label="Amount for ${esc(fee.fee_name || 'fee')}">
                </td>
            </tr>`;
        }).join('');
    }

    /* ── HELPER: render total row ────────────────────────────────── */
    function buildTotalRow() {
        const total = getLiveTotal();
        return `
        <tr class="fee-total-row">
            <td colspan="5" style="padding:10px 8px;text-align:right;font-weight:700;">
                TOTAL AMOUNT TO PAY
            </td>
            <td style="padding:10px 8px;font-size:1.1rem;font-weight:800;color:var(--primary);">
                ${fmtCurrency(total)}
            </td>
        </tr>`;
    }

    /* ── HELPER: render FIFO preview ─────────────────────────────── */
    function buildFIFOPreview() {
        const total = getLiveTotal();
        if (total <= 0 || selectedFeeIds.size === 0) return '';

        const selectedFees = currentFees.filter(f => selectedFeeIds.has(f.id));
        const preview = previewFIFOAllocation(total, selectedFees, currentCredit);

        const allocationRows = preview.allocations
            .filter(a => a.allocated > 0)
            .map(a => `
            <div class="fifo-row">
                <span class="fifo-fee-name">${esc(a.feeName)}</span>
                <span class="fifo-fee-alloc">${fmtCurrency(a.allocated)}</span>
                <span class="fifo-fee-rem ${a.isFullyPaid ? 'text-success' : 'text-warning'}">
                    ${a.isFullyPaid ? '✓ Fully Paid' : `${fmtCurrency(a.remaining)} remaining`}
                </span>
            </div>`).join('');

        return `
        <div class="fifo-preview">
            <div class="fifo-header">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                     stroke="currentColor" stroke-width="2">
                    <use href="assets/icons/sprite.svg#icon-list-checks"/>
                </svg>
                FIFO Allocation Preview
            </div>
            ${preview.creditUsed > 0 ? `
            <div class="fifo-row fifo-credit">
                <span>Credit Applied</span>
                <span class="text-success">— ${fmtCurrency(preview.creditUsed)}</span>
            </div>` : ''}
            ${allocationRows}
            ${preview.creditAdded > 0 ? `
            <div class="fifo-row fifo-credit">
                <span>Added to Credit Balance</span>
                <span class="text-success">+ ${fmtCurrency(preview.creditAdded)}</span>
            </div>` : ''}
        </div>`;
    }

    /* ── INITIAL RENDER ──────────────────────────────────────────── */
    const students = (state.students || [])
        .filter(s => !s.is_deleted && s.status !== 'Inactive')
        .sort((a, b) => (a.last_name || '').localeCompare(b.last_name || ''));

    app.innerHTML = `
    <div class="module-wrap">

        <div class="mod-topbar">
            <div class="mod-topbar-left">
                <h1 class="mod-title">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
                         stroke="var(--primary)" stroke-width="2">
                        <use href="assets/icons/sprite.svg#icon-credit-card"/>
                    </svg>
                    Record Payment
                </h1>
                <span class="mod-meta">
                    ${esc(activeYear?.year_name || '—')}
                    ${activeTerm ? ' · Term ' + activeTerm.term_number : ''}
                    ${holiday ? ' · <span class="holiday-badge">HOLIDAY SESSION</span>' : ''}
                </span>
            </div>
            <div class="mod-topbar-right">
                <button class="topbar-btn" onclick="navigateTo('payment-history')">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                         stroke="currentColor" stroke-width="2">
                        <use href="assets/icons/sprite.svg#icon-receipt"/>
                    </svg>
                    Payment History
                </button>
            </div>
        </div>

        <div class="two-col-grid" style="grid-template-columns:1fr 380px;">

            <!-- LEFT: Student + Fees -->
            <div class="section-card">

                <!-- Student selector -->
                <div class="form-section">
                    <h3 class="form-section-title">1. Select Student</h3>
                    <div class="form-row">
                        <div class="field">
                            <label class="field-label">Student *</label>
                            <div class="input-icon-wrap">
                                <svg viewBox="0 0 24 24" stroke-width="2" fill="none">
                                    <use href="assets/icons/sprite.svg#icon-search"/>
                                </svg>
                                <select id="pay-student" class="input"
                                        onchange="onStudentSelectChange(this.value)">
                                    <option value="">— Select a student —</option>
                                    ${students.map(s => {
        const cls = getClass(s.class_id);
        return `<option value="${s.id}"
                                                        ${s.id === preselId ? 'selected' : ''}>
                                            ${esc(s.last_name)}, ${esc(s.first_name)}
                                            (${esc(s.code)}) — ${esc(cls?.name || '?')}
                                        </option>`;
    }).join('')}
                                </select>
                            </div>
                        </div>
                        <div class="field">
                            <label class="field-label">Class</label>
                            <input type="text" id="pay-class" class="input" readonly>
                        </div>
                    </div>
                    <!-- Credit balance banner -->
                    <div id="credit-banner" style="display:none;" class="alert alert-info">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                             stroke="currentColor" stroke-width="2">
                            <use href="assets/icons/sprite.svg#icon-wallet"/>
                        </svg>
                        <span id="credit-banner-text"></span>
                    </div>
                </div>

                <!-- Fee table -->
                <div class="form-section" style="margin-top:20px;">
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
                        <h3 class="form-section-title" style="margin:0;">2. Select Fees &amp; Enter Amounts</h3>
                        <div style="display:flex;gap:6px;">
                            <button class="btn btn-sm btn-secondary" onclick="selectAllFees()">
                                Select All
                            </button>
                            <button class="btn btn-sm btn-ghost" onclick="clearAllFees()">
                                Clear All
                            </button>
                            <button class="btn btn-sm btn-secondary" onclick="fillMaxAmounts()">
                                Fill Max
                            </button>
                        </div>
                    </div>

                    <div class="table-wrap">
                        <table class="data-table" id="fee-table">
                            <thead>
                                <tr>
                                    <th style="width:40px;text-align:center;">Pay</th>
                                    <th>Fee</th>
                                    <th class="text-right">Total</th>
                                    <th class="text-right">Paid</th>
                                    <th class="text-right">Remaining</th>
                                    <th style="width:140px;">Amount to Pay</th>
                                </tr>
                            </thead>
                            <tbody id="fee-tbody">
                                <tr>
                                    <td colspan="6" class="text-center" style="padding:32px;color:var(--text-muted);">
                                        Select a student to see their fees.
                                    </td>
                                </tr>
                            </tbody>
                            <tfoot id="fee-tfoot"></tfoot>
                        </table>
                    </div>

                    <!-- FIFO Preview -->
                    <div id="fifo-preview-wrap"></div>
                </div>

                <!-- Payment details -->
                <div class="form-section" style="margin-top:20px;">
                    <h3 class="form-section-title">3. Payment Details</h3>
                    <div class="form-row">
                        <div class="field">
                            <label class="field-label">Payment Date *</label>
                            <input type="date" id="pay-date" class="input" value="${today}">
                        </div>
                        <div class="field">
                            <label class="field-label">Payment Method *</label>
                            <select id="pay-method" class="select">
                                ${PAYMENT_METHODS.map(m =>
        `<option value="${esc(m)}">${esc(m)}</option>`
    ).join('')}
                            </select>
                        </div>
                        <div class="field">
                            <label class="field-label">Reference / Transaction ID</label>
                            <input type="text" id="pay-ref" class="input"
                                   placeholder="Optional — MoMo code, cheque no.">
                        </div>
                        <div class="field" style="grid-column:1/-1;">
                            <label class="field-label">Notes</label>
                            <textarea id="pay-notes" class="input" rows="2"
                                      placeholder="Optional notes"></textarea>
                        </div>
                    </div>
                </div>

                <!-- Actions -->
                <div class="form-actions" style="margin-top:16px;">
                    <button class="btn btn-ghost" onclick="resetPaymentForm()">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                             stroke="currentColor" stroke-width="2">
                            <use href="assets/icons/sprite.svg#icon-rotate-ccw"/>
                        </svg>
                        Clear Form
                    </button>
                    <button class="btn btn-secondary" onclick="submitPaymentOnly()"
                            id="btn-pay-only">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                             stroke="currentColor" stroke-width="2">
                            <use href="assets/icons/sprite.svg#icon-save"/>
                        </svg>
                        Record Payment
                    </button>
                    <button class="btn btn-primary" onclick="submitPaymentAndPrint()"
                            id="btn-pay-print">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                             stroke="currentColor" stroke-width="2">
                            <use href="assets/icons/sprite.svg#icon-printer"/>
                        </svg>
                        Record &amp; Print Receipt
                    </button>
                </div>

            </div>

            <!-- RIGHT: Receipt preview -->
            <div class="section-card">
                <div class="section-header">
                    <h3>Receipt Preview</h3>
                </div>
                <div id="receipt-preview" class="receipt-preview-panel">
                    <div class="receipt-preview-empty">
                        <svg width="32" height="32" viewBox="0 0 24 24" fill="none"
                             stroke="currentColor" stroke-width="1.5" opacity="0.3">
                            <use href="assets/icons/sprite.svg#icon-receipt"/>
                        </svg>
                        <p>Select a student and enter amounts to preview the receipt.</p>
                    </div>
                </div>
            </div>

        </div>
    </div>`;

    /* ── Pre-select student if provided ──────────────────────────── */
    if (preselId) {
        setTimeout(() => onStudentSelectChange(preselId), 80);
    }

    /* ══════════════════════════════════════════════════════════════
       EVENT HANDLERS — registered on window for onclick= access
       ══════════════════════════════════════════════════════════════ */

    window.onStudentSelectChange = function (studentId) {
        currentStudentId = studentId ? parseInt(studentId, 10) : null;
        loadFeesForStudent(currentStudentId);

        // Update class field
        const student = getStudent(currentStudentId);
        const cls = student ? getClass(student.class_id) : null;
        const classEl = document.getElementById('pay-class');
        if (classEl) classEl.value = cls?.name || '';

        // Credit banner
        const banner = document.getElementById('credit-banner');
        const bannerText = document.getElementById('credit-banner-text');
        if (banner && bannerText) {
            if (currentCredit > 0) {
                bannerText.textContent =
                    `This student has a credit balance of ${fmtCurrency(currentCredit)} that will be applied first.`;
                banner.style.display = 'flex';
            } else {
                banner.style.display = 'none';
            }
        }

        _refreshFeeTable();
        _refreshReceiptPreview();
    };

    window.onFeeCheckboxChange = function (feeId, checked) {
        if (checked) {
            selectedFeeIds.add(feeId);
            // Auto-fill max remaining amount
            const fee = currentFees.find(f => f.id === feeId);
            if (fee) {
                const bal = computeFeeBalance(fee);
                enteredAmounts[feeId] = String(bal.remaining);
                const input = document.getElementById(`fee-amt-${feeId}`);
                if (input) {
                    input.value = bal.remaining;
                    input.disabled = false;
                    input.readOnly = false;
                    input.classList.remove('input-disabled');
                }
            }
        } else {
            selectedFeeIds.delete(feeId);
            enteredAmounts[feeId] = '';
            const input = document.getElementById(`fee-amt-${feeId}`);
            if (input) {
                input.value = '';
                input.disabled = true;
                input.readOnly = true;
                input.classList.add('input-disabled');
            }
        }
        _refreshTotalRow();
        _refreshFIFOPreview();
        _refreshReceiptPreview();
    };

    window.onFeeAmountInput = function (feeId, value) {
        const fee = currentFees.find(f => f.id === feeId);
        const bal = fee ? computeFeeBalance(fee) : { remaining: 0 };
        const val = parseFloat(value) || 0;

        // Clamp to remaining balance
        if (val > bal.remaining) {
            enteredAmounts[feeId] = String(bal.remaining);
            const input = document.getElementById(`fee-amt-${feeId}`);
            if (input) input.value = bal.remaining;
        } else {
            enteredAmounts[feeId] = value;
        }

        _refreshTotalRow();
        _refreshFIFOPreview();
        _refreshReceiptPreview();
    };

    window.selectAllFees = function () {
        currentFees.forEach(fee => {
            selectedFeeIds.add(fee.id);
            const bal = computeFeeBalance(fee);
            enteredAmounts[fee.id] = String(bal.remaining);
        });
        _refreshFeeTable();
        _refreshReceiptPreview();
    };

    window.clearAllFees = function () {
        selectedFeeIds = new Set();
        enteredAmounts = {};
        _refreshFeeTable();
        _refreshReceiptPreview();
    };

    window.fillMaxAmounts = function () {
        selectedFeeIds.forEach(feeId => {
            const fee = currentFees.find(f => f.id === feeId);
            if (fee) {
                const bal = computeFeeBalance(fee);
                enteredAmounts[feeId] = String(bal.remaining);
                const input = document.getElementById(`fee-amt-${feeId}`);
                if (input) input.value = bal.remaining;
            }
        });
        _refreshTotalRow();
        _refreshFIFOPreview();
        _refreshReceiptPreview();
    };

    window.resetPaymentForm = function () {
        currentStudentId = null;
        selectedFeeIds = new Set();
        enteredAmounts = {};
        currentFees = [];
        currentCredit = 0;

        const payStudent = document.getElementById('pay-student');
        if (payStudent) payStudent.value = '';
        const payClass = document.getElementById('pay-class');
        if (payClass) payClass.value = '';
        const payDate = document.getElementById('pay-date');
        if (payDate) payDate.value = today;
        const payRef = document.getElementById('pay-ref');
        if (payRef) payRef.value = '';
        const payNotes = document.getElementById('pay-notes');
        if (payNotes) payNotes.value = '';

        const creditBanner = document.getElementById('credit-banner');
        if (creditBanner) creditBanner.style.display = 'none';

        _refreshFeeTable();
        _refreshReceiptPreview();
    };

    window.submitPaymentOnly = () => _processPayment(false);
    window.submitPaymentAndPrint = () => _processPayment(true);

    /* ── CORE PAYMENT PROCESSOR ───────────────────────────────────── */
    async function _processPayment(printAfter = false) {
        // Validation
        if (!currentStudentId) {
            showToast('Please select a student.', 'warning'); return;
        }
        if (selectedFeeIds.size === 0) {
            showToast('Please select at least one fee to pay.', 'warning'); return;
        }

        const total = getLiveTotal();
        if (total <= 0) {
            showToast('Please enter amounts greater than zero.', 'warning'); return;
        }

        const date = document.getElementById('pay-date')?.value;
        const method = document.getElementById('pay-method')?.value;
        const ref = cleanInput(document.getElementById('pay-ref')?.value);
        const notes = cleanInput(document.getElementById('pay-notes')?.value);

        if (!date) { showToast('Please select a payment date.', 'warning'); return; }
        if (!method) { showToast('Please select a payment method.', 'warning'); return; }

        // Validate line items
        const selectedFeeList = currentFees.filter(f => selectedFeeIds.has(f.id));
        const validation = validatePaymentLineItems(selectedFeeList, enteredAmounts);
        if (validation.hasErrors) {
            showToast('Some amounts are invalid. Check highlighted fees.', 'error');
            Object.keys(validation.errors).forEach(feeId => {
                markFieldError(`fee-amt-${feeId}`, validation.errors[feeId]);
            });
            return;
        }

        // Disable submit buttons
        const btn1 = document.getElementById('btn-pay-only');
        const btn2 = document.getElementById('btn-pay-print');
        if (btn1) { btn1.disabled = true; btn1.textContent = 'Saving…'; }
        if (btn2) { btn2.disabled = true; btn2.textContent = 'Saving…'; }

        try {
            const receiptNo = await generateReceiptNumber();
            const now = new Date().toISOString();
            const yearId = getActiveYearId();
            const termId = getActiveTermId();
            const student = getStudent(currentStudentId);

            // Insert payment row
            const paymentRow = await insert('payments', {
                student_id: currentStudentId,
                academic_year_id: yearId,
                term_id: termId,
                total_amount: total,
                payment_date: date,
                payment_method: method,
                receipt_number: receiptNo,
                reference: ref,
                notes,
                is_reversed: false,
                recorded_by: state.currentUser?.id || null,
                recorded_by_name: state.currentUser?.name || '',
                student_name: student ? `${student.first_name} ${student.last_name}` : '',
                created_at: now,
                updated_at: now,
            });

            if (!paymentRow || !paymentRow.id) {
                throw new Error('Payment insert returned no ID.');
            }

            // FIFO allocation: apply amounts to each selected fee
            for (const fee of selectedFeeList) {
                const amount = parseFloat(enteredAmounts[fee.id] || 0);
                if (!amount || amount <= 0) continue;

                const currentPaid = Number(fee.paid_amount || 0);
                const newPaid = currentPaid + amount;
                const isFullyPaid = newPaid >= Number(fee.amount || 0) - Number(fee.waived_amount || 0);

                await update('student_fees', fee.id, {
                    paid_amount: newPaid,
                    is_paid: isFullyPaid,
                    updated_at: now,
                });

                await insert('payment_allocations', {
                    payment_id: paymentRow.id,
                    student_fee_id: fee.id,
                    amount,
                    created_at: now,
                });
            }

            // Handle overpayment → credit
            const preview = previewFIFOAllocation(total, selectedFeeList, currentCredit);
            if (preview.creditAdded > 0) {
                const existingCredit = (state.creditBalances || []).find(c =>
                    c.student_id === currentStudentId
                );
                if (existingCredit) {
                    await update('student_credit_balance', existingCredit.id, {
                        credit_amount: Number(existingCredit.credit_amount || 0) + preview.creditAdded,
                        updated_at: now,
                    });
                } else {
                    await insert('student_credit_balance', {
                        student_id: currentStudentId,
                        credit_amount: preview.creditAdded,
                        updated_at: now,
                    });
                }
            }

            // Refresh state
            await refreshTables(['payments', 'student_fees', 'payment_allocations',
                'student_credit_balance']);
            invalidateBalanceCache(currentStudentId);
            clearFinanceCaches();

            // Log + notify
            await logCreatePayment(paymentRow.id, currentStudentId, total, method);
            await notifyPaymentReceived(paymentRow, student || { code: '—' });

            // Build receipt line items for print
            const receiptLineItems = selectedFeeList
                .filter(f => parseFloat(enteredAmounts[f.id] || 0) > 0)
                .map(f => ({
                    feeId: f.id,
                    feeName: f.fee_name || '—',
                    owed: computeFeeBalance(f).remaining,
                    allocated: parseFloat(enteredAmounts[f.id] || 0),
                }));

            showToast(
                `Payment of ${fmtCurrency(total)} recorded — ${receiptNo}`,
                'success',
                5000
            );

            // Print receipt if requested
            if (printAfter && student) {
                printReceipt(paymentRow, student, receiptLineItems, total, false);
            }

            // Reset form
            resetPaymentForm();

        } catch (err) {
            handleApiError(err, 'record payment');
        } finally {
            if (btn1) { btn1.disabled = false; btn1.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><use href="assets/icons/sprite.svg#icon-save"/></svg> Record Payment`; }
            if (btn2) { btn2.disabled = false; btn2.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><use href="assets/icons/sprite.svg#icon-printer"/></svg> Record & Print Receipt`; }
        }
    }

    /* ── PRIVATE REFRESH HELPERS ─────────────────────────────────── */
    function _refreshFeeTable() {
        const tbody = document.getElementById('fee-tbody');
        const tfoot = document.getElementById('fee-tfoot');
        if (tbody) tbody.innerHTML = buildFeeRows();
        if (tfoot) tfoot.innerHTML = buildTotalRow();
        _refreshFIFOPreview();
    }

    function _refreshTotalRow() {
        const tfoot = document.getElementById('fee-tfoot');
        if (tfoot) tfoot.innerHTML = buildTotalRow();
    }

    function _refreshFIFOPreview() {
        const wrap = document.getElementById('fifo-preview-wrap');
        if (wrap) wrap.innerHTML = buildFIFOPreview();
    }

    function _refreshReceiptPreview() {
        const preview = document.getElementById('receipt-preview');
        if (!preview) return;

        const student = getStudent(currentStudentId);
        const cls = student ? getClass(student.class_id) : null;
        const total = getLiveTotal();
        const method = document.getElementById('pay-method')?.value || '—';
        const date = document.getElementById('pay-date')?.value || today;
        const s = state.schoolSettings || {};

        if (!student || total <= 0) {
            preview.innerHTML = `
            <div class="receipt-preview-empty">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none"
                     stroke="currentColor" stroke-width="1.5" opacity="0.3">
                    <use href="assets/icons/sprite.svg#icon-receipt"/>
                </svg>
                <p>Select a student and enter amounts to preview.</p>
            </div>`;
            return;
        }

        const lineItems = currentFees
            .filter(f => selectedFeeIds.has(f.id) && parseFloat(enteredAmounts[f.id] || 0) > 0)
            .map(f => `
            <div class="preview-fee-row">
                <span>${esc(f.fee_name || '—')}</span>
                <span>${fmtCurrency(parseFloat(enteredAmounts[f.id] || 0))}</span>
            </div>`).join('');

        preview.innerHTML = `
        <div class="receipt-preview-card">
            <div class="receipt-preview-school">
                <strong>${esc(s.school_name || APP_NAME)}</strong>
                <span>PAYMENT RECEIPT</span>
            </div>
            <div class="receipt-preview-divider"></div>
            <div class="receipt-preview-field">
                <span>Student</span>
                <span>${esc(student.first_name)} ${esc(student.last_name)}</span>
            </div>
            <div class="receipt-preview-field">
                <span>Code</span>
                <span>${esc(student.code)}</span>
            </div>
            <div class="receipt-preview-field">
                <span>Class</span>
                <span>${esc(cls?.name || '—')}</span>
            </div>
            <div class="receipt-preview-field">
                <span>Date</span>
                <span>${esc(fmtDate(date))}</span>
            </div>
            <div class="receipt-preview-field">
                <span>Method</span>
                <span>${esc(method)}</span>
            </div>
            <div class="receipt-preview-divider"></div>
            ${lineItems}
            <div class="receipt-preview-divider"></div>
            <div class="receipt-preview-total">
                <span>TOTAL</span>
                <span>${fmtCurrency(total)}</span>
            </div>
            <div class="receipt-preview-words">
                ${esc(amountInWords(total))}
            </div>
            ${currentCredit > 0 ? `
            <div class="receipt-preview-credit">
                Credit balance: ${fmtCurrency(currentCredit)}
            </div>` : ''}
        </div>`;
    }
}

window.renderRecordPayment = renderRecordPayment;