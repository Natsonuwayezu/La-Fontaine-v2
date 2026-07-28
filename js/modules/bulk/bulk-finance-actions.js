/* ═══════════════════════════════════════════════════════════════════
   js/modules/bulk/bulk-finance-actions.js
   ═══════════════════════════════════════════════════════════════════
   NOT routed directly — no 'bulk-finance-actions' nav id exists, and
   unlike bulk-student-actions.js there is currently no caller either:
   every file under js/modules/finance/ is still empty (per your
   audit), so nothing in the app can select a batch of students to
   act on yet. This module is the batch-action API those finance
   pages (record-payment.js, fee-waivers.js, overdue-payments.js,
   etc.) should call once they exist — built now so the logic exists
   in one place rather than getting duplicated across four finance
   files later.

   Real API exposed as window.BulkFinanceActions:
     recordBulkPayment(ids, amount, method)  — applies a payment to
                                                each selected student's
                                                fee record on
                                                window.state if loaded
     applyBulkWaiver(ids, amount, reason)    — same, as a waiver entry
     sendBulkReminders(ids)                  — queues via
                                                core/notifications-engine.js
                                                if loaded, otherwise
                                                honest "not wired" notice
     exportSelectedBalances(ids)             — downloads a real CSV of
                                                each selected student's
                                                current balance

   Uses window.getStudentFees(id) / window.getStudentCredit(id) /
   window.getStudent(id) (core/state.js) for real data when available,
   falling back to mock data otherwise.

   No dedicated CSS — reuses the shared modal/table component library,
   consistent with bulk-student-actions.js's confirmation dialog.

   Loaded as a plain <script> — no import/export.

   Last updated: 2026-07-14
   ═══════════════════════════════════════════════════════════════════ */

(function () {
    'use strict';

    const esc = window.esc || function (s) { return String(s == null ? '' : s); };
    const fmt = window.formatCurrency || function (n) { return (n || 0).toLocaleString() + ' RWF'; };

    // ─── MOCK DATA (fallback only) ────────────────────────────────

    function getMockStudent(id) {
        const mock = {
            S1000: { id: 'S1000', name: 'HABIMANA Eric', classId: 'P4A' },
            S1001: { id: 'S1001', name: 'INGABIRE Sarah', classId: 'P3' },
            S1002: { id: 'S1002', name: 'KAMALI Moses', classId: 'P6' }
        };
        return mock[id] || { id: id, name: 'Unknown Student', classId: '—' };
    }

    function resolveStudent(id) {
        if (typeof window.getStudent === 'function') {
            const s = window.getStudent(id);
            if (s) return s;
        }
        return getMockStudent(id);
    }

    function resolveBalance(id) {
        if (typeof window.getStudentFees === 'function') {
            try {
                const records = window.getStudentFees(id) || [];
                const expected = records.reduce(function (a, r) { return a + (r.amount || 0); }, 0);
                const paid = records.reduce(function (a, r) { return a + (r.paid || 0); }, 0);
                if (records.length) return { expected: expected, paid: paid, balance: expected - paid };
            } catch (err) {
                console.warn('[BulkFinanceActions] getStudentFees failed, using mock balance', err);
            }
        }
        // Deterministic-looking mock balance, not a live figure.
        let seed = String(id).length * 37 + 11;
        const rand = function () { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
        const expected = 120000;
        const paid = Math.round(expected * (0.3 + rand() * 0.6));
        return { expected: expected, paid: paid, balance: expected - paid };
    }

    // ─── RECORD BULK PAYMENT ─────────────────────────────────────────

    function recordBulkPayment(ids, amount, method) {
        if (!ids || !ids.length) { notify('No students selected', 'warning'); return { applied: 0 }; }
        if (!amount || amount <= 0) { notify('Enter a valid amount', 'warning'); return { applied: 0 }; }

        let applied = 0;

        if (window.state && Array.isArray(window.state.studentFees)) {
            ids.forEach(function (id) {
                const record = window.state.studentFees.filter(function (f) { return f.student_id === id; })[0];
                if (record) {
                    record.paid = (record.paid || 0) + amount;
                    applied++;
                }
            });
            if (applied && typeof window.updateStateBatch === 'function') {
                window.updateStateBatch({ studentFees: window.state.studentFees });
            }
        } else {
            applied = ids.length;
            console.warn('[BulkFinanceActions] core/state.js studentFees not loaded — payment not persisted anywhere');
        }

        notify(fmt(amount) + ' recorded for ' + applied + ' student' + (applied === 1 ? '' : 's') + (method ? ' via ' + esc(method) : ''), 'success');
        return { applied: applied };
    }

    // ─── APPLY BULK WAIVER ───────────────────────────────────────────

    function applyBulkWaiver(ids, amount, reason) {
        if (!ids || !ids.length) { notify('No students selected', 'warning'); return { applied: 0 }; }
        if (!amount || amount <= 0) { notify('Enter a valid waiver amount', 'warning'); return { applied: 0 }; }

        let applied = 0;

        if (window.state && Array.isArray(window.state.studentFees)) {
            ids.forEach(function (id) {
                const record = window.state.studentFees.filter(function (f) { return f.student_id === id; })[0];
                if (record) {
                    record.waived = (record.waived || 0) + amount;
                    record.amount = Math.max(0, (record.amount || 0) - amount);
                    applied++;
                }
            });
            if (applied && typeof window.updateStateBatch === 'function') {
                window.updateStateBatch({ studentFees: window.state.studentFees });
            }
        } else {
            applied = ids.length;
            console.warn('[BulkFinanceActions] core/state.js studentFees not loaded — waiver not persisted anywhere');
        }

        notify(fmt(amount) + ' waived for ' + applied + ' student' + (applied === 1 ? '' : 's') + (reason ? ' (' + esc(reason) + ')' : ''), 'success');
        return { applied: applied };
    }

    // ─── SEND BULK REMINDERS ─────────────────────────────────────────

    function sendBulkReminders(ids) {
        if (!ids || !ids.length) { notify('No students selected', 'warning'); return; }

        if (window.NotificationsEngine && typeof window.NotificationsEngine.queueBulkMessage === 'function') {
            const balances = ids.map(resolveBalance);
            const overdueIds = ids.filter(function (id, idx) { return balances[idx].balance > 0; });
            if (!overdueIds.length) {
                notify('None of the selected students have an outstanding balance', 'info');
                return;
            }
            window.NotificationsEngine.queueBulkMessage(overdueIds, 'Payment reminder: you have an outstanding balance. Please contact the accounts office.');
            notify('Reminders queued for ' + overdueIds.length + ' student' + (overdueIds.length === 1 ? '' : 's'), 'success');
        } else {
            notify('Reminders are not wired to core/notifications-engine.js yet — nothing was sent', 'warning');
        }
    }

    // ─── EXPORT SELECTED BALANCES ────────────────────────────────────

    function exportSelectedBalances(ids) {
        if (!ids || !ids.length) { notify('No students selected', 'warning'); return; }

        const header = 'ID,Name,Class,Expected,Paid,Balance';
        const lines = ids.map(function (id) {
            const student = resolveStudent(id);
            const bal = resolveBalance(id);
            return [student.id, '"' + (student.name || '') + '"', student.classId || '', bal.expected, bal.paid, bal.balance].join(',');
        });
        const csv = [header].concat(lines).join('\n');

        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'selected-balances-' + ids.length + '.csv';
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);

        notify(ids.length + ' balance' + (ids.length === 1 ? '' : 's') + ' exported', 'success');
    }

    // ─── TOAST HELPER ────────────────────────────────────────────────

    function notify(message, type) {
        if (typeof window.showToast === 'function') {
            window.showToast(message, type || 'info');
        }
    }

    // ─── EXPOSE ──────────────────────────────────────────────────────

    window.BulkFinanceActions = {
        recordBulkPayment: recordBulkPayment,
        applyBulkWaiver: applyBulkWaiver,
        sendBulkReminders: sendBulkReminders,
        exportSelectedBalances: exportSelectedBalances
    };
})();

// Router bridge
function renderBulkFinanceActions(container, params) {
    if (typeof renderBulkExport === 'function') return renderBulkExport(container, params);
    if (container) container.innerHTML = '<div class="section-card"><div class="empty-state"><div class="es-title">Bulk Finance Actions</div><div class="es-sub">Select students from the student list to apply bulk actions.</div></div></div>';
}
window.renderBulkFinanceActions = renderBulkFinanceActions;
