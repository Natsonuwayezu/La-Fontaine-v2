/* ═══════════════════════════════════════════════════════════════════
   js/modules/finance/payment-history.js
   ═══════════════════════════════════════════════════════════════════
   Purpose : Browse every recorded payment. Filter by student, class,
             date range, and payment method. Read-only audit view —
             for reprinting/exporting a specific receipt, see
             receipts.js; for reversing a payment, see the (not yet
             built) payment-reversals.js.

   Table: payments (loaded into state.payments by
          core/data-loader.js's loadPayments(), which also loads
          state.paymentAllocations in the same call)

   Dependencies (plain-script globals loaded earlier in index.html):
   api.js: ensureStateLoaded
   data-loader.js: loadPayments
   permissions.js: canViewPayments
   state.js: state, getClass
   utils.js: esc, fmtCurrency, fmtDate, debounce
   constants.js: DEBOUNCE_SEARCH
   ═══════════════════════════════════════════════════════════════════ */

'use strict';

async function renderPaymentHistory(container, params = {}) {
    if (!container) return;

    if (!canViewPayments()) {
        container.innerHTML = `<div class="alert alert-danger">Access denied.</div>`;
        return;
    }

    container.innerHTML = `<div class="dashboard-page"><div class="loading-inline">Loading payment history…</div></div>`;

    await ensureStateLoaded();
    await loadPayments();

    const filters = {
        student: params.studentId ? String(params.studentId) : '',
        classId: '',
        method: '',
        from: '',
        to: '',
    };

    function studentName(id) {
        const s = (state.students || []).find(s => s.id === parseInt(id));
        return s ? `${s.first_name} ${s.last_name}` : '—';
    }

    function className(classId) {
        const c = getClass(classId);
        return c ? c.name : '—';
    }

    function filteredPayments() {
        return (state.payments || []).filter(p => {
            if (filters.student && String(p.student_id) !== filters.student) return false;
            if (filters.classId) {
                const s = (state.students || []).find(s => s.id === p.student_id);
                if (!s || String(s.class_id) !== filters.classId) return false;
            }
            if (filters.method && p.payment_method !== filters.method) return false;
            if (filters.from && p.payment_date < filters.from) return false;
            if (filters.to && p.payment_date > filters.to + 'T23:59:59') return false;
            return true;
        }).sort((a, b) => new Date(b.payment_date || 0) - new Date(a.payment_date || 0));
    }

    function render() {
        const rows = filteredPayments();
        const total = rows.reduce((sum, p) => sum + Number(p.amount || 0), 0);
        const methods = [...new Set((state.payments || []).map(p => p.payment_method).filter(Boolean))];

        container.innerHTML = `
            <div class="dashboard-page">
                <div class="settings-section">
                    <div class="settings-section__title">Payment History</div>
                    <div class="settings-section__desc">${rows.length} payment${rows.length === 1 ? '' : 's'} — ${fmtCurrency(total)} total.</div>
                </div>

                <div class="filters-bar">
                    <select class="form-select" id="ph-class-filter">
                        <option value="">All Classes</option>
                        ${(state.classes || []).map(c => `<option value="${c.id}" ${filters.classId === String(c.id) ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}
                    </select>
                    <select class="form-select" id="ph-method-filter">
                        <option value="">All Methods</option>
                        ${methods.map(m => `<option value="${esc(m)}" ${filters.method === m ? 'selected' : ''}>${esc(m)}</option>`).join('')}
                    </select>
                    <input type="date" class="form-input" id="ph-from-filter" value="${filters.from}">
                    <input type="date" class="form-input" id="ph-to-filter" value="${filters.to}">
                    <input type="text" class="form-input" id="ph-student-search" placeholder="Search student…">
                    ${filters.student ? `<button class="btn btn-sm btn-outline" id="ph-clear-student">Clear Student Filter</button>` : ''}
                </div>

                <table class="logs-table">
                    <thead>
                        <tr><th>Date</th><th>Receipt #</th><th>Student</th><th>Class</th><th>Amount</th><th>Method</th></tr>
                    </thead>
                    <tbody>
                        ${rows.map(p => `
                            <tr>
                                <td>${fmtDate(p.payment_date)}</td>
                                <td>${esc(p.receipt_number || `RCP-${p.id}`)}</td>
                                <td>${esc(studentName(p.student_id))}</td>
                                <td>${esc(className((state.students || []).find(s => s.id === p.student_id)?.class_id))}</td>
                                <td>${fmtCurrency(p.amount)}</td>
                                <td><span class="badge">${esc(p.payment_method || '—')}</span></td>
                            </tr>
                        `).join('') || '<tr><td colspan="6" style="text-align:center; padding:24px;">No payments match these filters.</td></tr>'}
                    </tbody>
                </table>
            </div>
        `;

        bindEvents();
    }

    function bindEvents() {
        document.getElementById('ph-class-filter')?.addEventListener('change', (e) => {
            filters.classId = e.target.value; render();
        });
        document.getElementById('ph-method-filter')?.addEventListener('change', (e) => {
            filters.method = e.target.value; render();
        });
        document.getElementById('ph-from-filter')?.addEventListener('change', (e) => {
            filters.from = e.target.value; render();
        });
        document.getElementById('ph-to-filter')?.addEventListener('change', (e) => {
            filters.to = e.target.value; render();
        });
        document.getElementById('ph-student-search')?.addEventListener('input', debounce((e) => {
            const q = e.target.value.trim().toLowerCase();
            if (!q) { filters.student = ''; render(); return; }
            const match = (state.students || []).find(s => `${s.first_name} ${s.last_name}`.toLowerCase().includes(q));
            filters.student = match ? String(match.id) : '__none__';
            render();
        }, DEBOUNCE_SEARCH));
        document.getElementById('ph-clear-student')?.addEventListener('click', () => {
            filters.student = ''; render();
        });
    }

    render();
}

function destroyPaymentHistory() {
    // Nothing to tear down — no timers/listeners outlive the container.
}

/* ═══════════════════════════════════════════════════════════════════
   EXPOSE
   ═══════════════════════════════════════════════════════════════════ */

window.renderPaymentHistory = renderPaymentHistory;
window.destroyPaymentHistory = destroyPaymentHistory;
