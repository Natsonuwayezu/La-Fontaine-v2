/* ═══════════════════════════════════════════════════════════════════
   js/modules/finance/finance-audit.js
   ═══════════════════════════════════════════════════════════════════
   Purpose : Audit trail for all finance-related actions — payments,
             reversals, waivers, credit adjustments, and fee
             assignments — read from the same system_logs table
             settings/system-logs.js reads (written by every
             logAction()/logX() call across the app), filtered down to
             finance-relevant actions only. Same underlying data source
             as system-logs.js, but scoped and framed for finance
             review rather than general system administration.

   Dependencies (plain-script globals loaded earlier in index.html):
   api.js: getAll
   permissions.js: canViewFinanceReports
   utils.js: esc, fmtCurrency, fmtDate, debounce
   constants.js: DEBOUNCE_SEARCH
   ═══════════════════════════════════════════════════════════════════ */

'use strict';

const FINANCE_AUDIT_ACTIONS = [
    'CREATE_PAYMENT', 'REVERSE_PAYMENT', 'WAIVE_FEE',
    'FEE_WAIVER_GRANTED', 'CREDIT_APPLIED', 'CREDIT_ADJUSTED',
];

async function renderFinanceAudit(container, params = {}) {
    if (!container) return;

    if (!canViewFinanceReports()) {
        container.innerHTML = `<div class="alert alert-danger">Access denied.</div>`;
        return;
    }

    container.innerHTML = `<div class="dashboard-page"><div class="loading-inline">Loading finance audit trail…</div></div>`;

    const allLogs = (await getAll('system_logs').catch(() => []))
        .filter(l => FINANCE_AUDIT_ACTIONS.includes(l.action))
        .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));

    let filters = { action: '', from: '', to: '' };

    function applyFilters() {
        return allLogs.filter(l => {
            if (filters.action && l.action !== filters.action) return false;
            if (filters.from && l.created_at < filters.from) return false;
            if (filters.to && l.created_at > filters.to + 'T23:59:59') return false;
            return true;
        });
    }

    function actionLabel(action) {
        const labels = {
            CREATE_PAYMENT: 'Payment Recorded',
            REVERSE_PAYMENT: 'Payment Reversed',
            WAIVE_FEE: 'Fee Waived',
            FEE_WAIVER_GRANTED: 'Waiver Granted',
            CREDIT_APPLIED: 'Credit Applied',
            CREDIT_ADJUSTED: 'Credit Adjusted',
        };
        return labels[action] || action;
    }

    function actionBadgeClass(action) {
        if (action === 'REVERSE_PAYMENT') return 'error';
        if (action === 'WAIVE_FEE' || action === 'FEE_WAIVER_GRANTED') return 'warn';
        return 'ok';
    }

    function render() {
        const rows = applyFilters();
        const totalAmount = rows.reduce((sum, l) => {
            const amt = l.details?.amount || l.details?.applied || 0;
            return sum + Number(amt || 0);
        }, 0);

        container.innerHTML = `
            <div class="dashboard-page">
                <div class="settings-section">
                    <div class="settings-section__title">Finance Audit Trail</div>
                    <div class="settings-section__desc">${rows.length} finance action${rows.length === 1 ? '' : 's'} logged. Combined amount: ${fmtCurrency(totalAmount)}.</div>
                </div>

                <div class="filters-bar">
                    <select class="form-select" id="fa-action-filter">
                        <option value="">All Actions</option>
                        ${FINANCE_AUDIT_ACTIONS.map(a => `<option value="${a}" ${filters.action === a ? 'selected' : ''}>${actionLabel(a)}</option>`).join('')}
                    </select>
                    <input type="date" class="form-input" id="fa-from-filter" value="${filters.from}">
                    <input type="date" class="form-input" id="fa-to-filter" value="${filters.to}">
                </div>

                <table class="logs-table">
                    <thead>
                        <tr><th>When</th><th>Action</th><th>By</th><th>Details</th></tr>
                    </thead>
                    <tbody>
                        ${rows.map(l => `
                            <tr>
                                <td>${fmtDate(l.created_at)}</td>
                                <td><span class="badge ${actionBadgeClass(l.action)}">${esc(actionLabel(l.action))}</span></td>
                                <td>${esc(l.performed_by_name || 'System')}</td>
                                <td>${renderDetails(l)}</td>
                            </tr>
                        `).join('') || '<tr><td colspan="4" style="text-align:center; padding:24px;">No finance actions match these filters.</td></tr>'}
                    </tbody>
                </table>
            </div>
        `;

        bindEvents();
    }

    function renderDetails(log) {
        const d = log.details || {};
        const parts = [];
        if (d.amount !== undefined) parts.push(`Amount: ${fmtCurrency(d.amount)}`);
        if (d.applied !== undefined) parts.push(`Applied: ${fmtCurrency(d.applied)}`);
        if (d.type) parts.push(`Type: ${esc(d.type)}`);
        if (d.reason) parts.push(`Reason: ${esc(d.reason)}`);
        if (d.direction) parts.push(`Direction: ${esc(d.direction)}`);
        return parts.join(' · ') || '—';
    }

    function bindEvents() {
        document.getElementById('fa-action-filter')?.addEventListener('change', (e) => {
            filters.action = e.target.value; render();
        });
        document.getElementById('fa-from-filter')?.addEventListener('change', (e) => {
            filters.from = e.target.value; render();
        });
        document.getElementById('fa-to-filter')?.addEventListener('change', (e) => {
            filters.to = e.target.value; render();
        });
    }

    render();
}

function destroyFinanceAudit() {
    // Nothing to tear down — no timers/listeners outlive the container.
}

/* ═══════════════════════════════════════════════════════════════════
   EXPOSE
   ═══════════════════════════════════════════════════════════════════ */

window.renderFinanceAudit = renderFinanceAudit;
window.destroyFinanceAudit = destroyFinanceAudit;
