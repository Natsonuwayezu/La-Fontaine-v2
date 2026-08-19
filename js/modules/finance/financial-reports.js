/* ═══════════════════════════════════════════════════════════════════
   js/modules/finance/financial-reports.js
   ═══════════════════════════════════════════════════════════════════
   Rendered into #mainContent by core/router.js for 'financial-reports'.

   NOTE ON ROUTING: this nav id is NOT currently in js/config/
   navigation.js's finance.items array (checked directly — only
   finance-dashboard, fee-structure, record-payment, payment-history,
   receipts, fee-waivers, payment-reversals, finance-audit, and
   family-fee-summary are registered there). It IS documented in
   PROJECT_TREE.md ("Collection report, by-class, by-method,
   date-range export") and IS listed in js/config/role-permissions.js,
   so it's a real, intended module — just add an item to
   navigation.js's finance group to make it reachable from the
   sidebar; nothing else needs to change.

   REAL FORMULA FUNCTIONS USED (core/finance-formulas.js — verified
   by reading that file directly, not assumed):
     computeCollectionStats(studentFees)   -> { totalExpected, totalCollected,
                                                 totalOutstanding, collectionRate,
                                                 totalStudents, fullPayers,
                                                 partialPayers, nonPayers }
     computePaymentTrend(payments, groupBy)-> [{ period, total }]
     computeMethodBreakdown(payments)      -> [{ method, total, count, pct }]

   FIELD-NAME NOTES (DB schema to be reconciled separately — code is
   the source of truth for now, per project decision):
     1. RESOLVED: the codebase standardizes on `total_amount` for a
        payment's amount (used consistently across finance-formulas.js,
        export-engine.js, notifications-engine.js, print-engine.js,
        search-engine.js, offline.js, validators.js, student-fees.js,
        student-statements.js, and here). payment-history.js and
        payment-reversals.js previously read the wrong field (`amount`)
        and have been corrected to match. The live `payments` table
        needs a `total_amount` column (rename or add) to match.
        normalizePayment() below is kept as a defensive fallback for
        any rows that predate this fix.
     2. The `student_fees` table needs a numeric waived-amount column —
        currently only a boolean `is_waived` + `waiver_reason`/
        `waiver_by` exist. computeStudentFeeSummary() (called
        internally by computeCollectionStats) reads `fee.waived_amount`
        as a number. This defaults safely to 0 (no crash), it just
        means waived amounts won't reduce "expected" totals until that
        column is added.

   Uses window.state.payments / .studentFees / .students / .classes
   (core/state.js). student_fees/payments are lazily-loaded large
   tables — if either is empty when this page renders, it triggers the
   real loadStudentFees()/loadPayments()/loadAllData() lazy-loaders and
   re-renders once available, rather than showing zeros or fabricating
   data (the mock generators this file used to fall back to when state
   was empty have been removed).

   No dedicated CSS exists for a "reports" layout in
   css/modules/finance.css (confirmed — that file only covers
   fee-card/payment-category/receipt/waiver components). Reuses the
   shared component library instead, same as bulk-export.js.

   Loaded as a plain <script> — no import/export.

   Last updated: 2026-07-19
   ═══════════════════════════════════════════════════════════════════ */

(function () {
    'use strict';

    const esc = window.esc || function (s) { return String(s == null ? '' : s); };
    const fmtCurrency = window.fmtCurrency || window.formatCurrency || function (n) {
        if (n === null || n === undefined || n === '' || isNaN(Number(n))) return '— RWF';
        return Number(n).toLocaleString('en-US', { maximumFractionDigits: 0 }) + ' RWF';
    };
    const fmtPct = window.fmtPct || function (n, d) {
        if (n === null || n === undefined || isNaN(Number(n))) return '—';
        return Number(n).toFixed(d == null ? 1 : d) + '%';
    };
    const fmtDate = window.fmtDate || function (s) {
        if (!s) return '—';
        const [y, m, d] = String(s).split('T')[0].split('-').map(Number);
        return new Date(y, m - 1, d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
    };

    // ─── NORMALIZATION SHIM ──────────────────────────────────────────
    // Defensive fallback for any rows written before this codebase
    // standardized on total_amount/waived_amount (see the earlier
    // record-payment.js/payment-history.js fixes this session) — not
    // mock data, just tolerance for older rows.

    function normalizePayment(p) {
        return Object.assign({}, p, {
            total_amount: p.total_amount != null ? p.total_amount : p.amount
        });
    }

    function normalizeFee(f) {
        return Object.assign({}, f, {
            waived_amount: f.waived_amount != null ? f.waived_amount : 0
        });
    }

    // ─── DATA ACCESS (real state only — lazy-loaded on render below
    //     if empty, rather than falling back to fabricated data) ──────

    function getClasses() {
        return (window.state && Array.isArray(window.state.classes)) ? window.state.classes : [];
    }

    function getStudents() {
        return (window.state && Array.isArray(window.state.students)) ? window.state.students : [];
    }

    function studentName(s) {
        return ((s.first_name || '') + ' ' + (s.last_name || '')).trim() || ('Student #' + s.id);
    }

    function getStudentFees() {
        const raw = (window.state && Array.isArray(window.state.studentFees)) ? window.state.studentFees : [];
        return raw.map(normalizeFee);
    }

    function getPayments() {
        const raw = (window.state && Array.isArray(window.state.payments)) ? window.state.payments : [];
        return raw.map(normalizePayment);
    }

    // ─── FORMULA ACCESS (real functions, with a defensive check) ────

    function hasFormulas() {
        return typeof window.computeCollectionStats === 'function'
            && typeof window.computePaymentTrend === 'function'
            && typeof window.computeMethodBreakdown === 'function';
    }

    // ─── STATE ───────────────────────────────────────────────────────

    let filters = { from: last30DaysStart(), to: (window.todayISO ? window.todayISO() : new Date().toISOString().slice(0, 10)), classId: 'all' };
    let rootEl = null;
    let chartInstances = { trend: null, method: null };
    let hasTriedLazyLoad = false;

    function last30DaysStart() {
        const d = new Date();
        d.setDate(d.getDate() - 30);
        return d.toISOString().slice(0, 10);
    }

    // ─── FILTERING ───────────────────────────────────────────────────

    function getFilteredPayments() {
        const students = getStudents();
        const studentClassMap = {};
        students.forEach(function (s) { studentClassMap[s.id] = s.class_id; });

        return getPayments().filter(function (p) {
            if (p.is_reversed) return false;
            if (p.payment_date < filters.from || p.payment_date > filters.to) return false;
            if (filters.classId !== 'all' && studentClassMap[p.student_id] !== parseInt(filters.classId, 10)) return false;
            return true;
        });
    }

    function getFilteredStudentFees() {
        const students = getStudents();
        const studentClassMap = {};
        students.forEach(function (s) { studentClassMap[s.id] = s.class_id; });

        return getStudentFees().filter(function (f) {
            if (filters.classId !== 'all' && studentClassMap[f.student_id] !== parseInt(filters.classId, 10)) return false;
            return true;
        });
    }

    // ─── RENDER ──────────────────────────────────────────────────────

    function renderFinancialReports(container) {
        if (!container) {
            console.warn('[FinancialReports] No container provided');
            return;
        }
        rootEl = container;

        container.innerHTML =
            '<div class="financial-reports-page">' +

            '<div class="card" style="padding:14px 16px;margin-bottom:16px;display:flex;gap:12px;flex-wrap:wrap;align-items:center;">' +
            '<label style="font-size:0.78rem;font-weight:600;">From</label>' +
            '<input type="date" id="fr-from" value="' + esc(filters.from) + '" />' +
            '<label style="font-size:0.78rem;font-weight:600;">To</label>' +
            '<input type="date" id="fr-to" value="' + esc(filters.to) + '" />' +
            '<label style="font-size:0.78rem;font-weight:600;">Class</label>' +
            '<select id="fr-class">' +
            '<option value="all">All Classes</option>' +
            getClasses().map(function (c) { return '<option value="' + c.id + '">' + esc(c.name) + '</option>'; }).join('') +
            '</select>' +
            '<button class="btn-primary" id="fr-run"><i class="fa-solid fa-play"></i> Run Report</button>' +
            '<span style="margin-left:auto;"></span>' +
            '<button class="btn-outline-primary" id="fr-export"><i class="fa-solid fa-file-export"></i> Export CSV</button>' +
            '</div>' +

            (hasFormulas() ? '' :
                '<div class="card" style="padding:12px 16px;margin-bottom:16px;background:rgba(196,90,74,0.08);border:1px solid rgba(196,90,74,0.25);">' +
                '<i class="fa-solid fa-triangle-exclamation" style="color:#c45a4a;"></i> ' +
                '<strong>core/finance-formulas.js is not loaded</strong> — showing zeros. Load that script before this module for real numbers.' +
                '</div>'
            ) +

            '<div id="fr-summary-tiles" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-bottom:16px;"></div>' +

            '<div style="display:grid;grid-template-columns:1.4fr 1fr;gap:16px;margin-bottom:16px;">' +
            '<div class="card" style="padding:16px;">' +
            '<div style="font-weight:700;font-size:0.85rem;margin-bottom:10px;"><i class="fa-solid fa-chart-line"></i> Payment Trend</div>' +
            '<div style="position:relative;height:240px;"><canvas id="fr-trend-chart"></canvas></div>' +
            '</div>' +
            '<div class="card" style="padding:16px;">' +
            '<div style="font-weight:700;font-size:0.85rem;margin-bottom:10px;"><i class="fa-solid fa-chart-pie"></i> By Payment Method</div>' +
            '<div style="position:relative;height:200px;"><canvas id="fr-method-chart"></canvas></div>' +
            '<div class="table-wrapper" style="margin-top:10px;"><table class="data-table" id="fr-method-table"></table></div>' +
            '</div>' +
            '</div>' +

            '<div class="card" style="padding:16px;">' +
            '<div style="font-weight:700;font-size:0.85rem;margin-bottom:10px;"><i class="fa-solid fa-table-cells"></i> Collection by Class</div>' +
            '<div class="table-wrapper"><table class="data-table data-table-hover" id="fr-class-table"></table></div>' +
            '</div>' +

            '</div>';

        wireToolbar();
        runReport();

        // These are lazily-loaded (or, for classes/students, may simply
        // not have finished loading yet at boot) — trigger once per
        // visit if needed, then re-render with real numbers.
        const needsCore = getClasses().length === 0 || getStudents().length === 0;
        const needsFees = getStudentFees().length === 0;
        const needsPayments = getPayments().length === 0;
        if (!hasTriedLazyLoad && (needsCore || needsFees || needsPayments)) {
            hasTriedLazyLoad = true;
            Promise.all([
                needsCore ? (window.loadAllData ? window.loadAllData({ silent: true }) : Promise.resolve()) : Promise.resolve(),
                needsFees ? (window.loadStudentFees ? window.loadStudentFees() : Promise.resolve()) : Promise.resolve(),
                needsPayments ? (window.loadPayments ? window.loadPayments() : Promise.resolve()) : Promise.resolve(),
            ]).then(function () {
                if (rootEl && rootEl.isConnected) { renderFinancialReports(rootEl); }
            }).catch(function () {});
        }
    }

    function wireToolbar() {
        rootEl.querySelector('#fr-from').addEventListener('change', function (e) { filters.from = e.target.value; });
        rootEl.querySelector('#fr-to').addEventListener('change', function (e) { filters.to = e.target.value; });
        rootEl.querySelector('#fr-class').addEventListener('change', function (e) { filters.classId = e.target.value; });
        rootEl.querySelector('#fr-run').addEventListener('click', runReport);
        rootEl.querySelector('#fr-export').addEventListener('click', exportCsv);
    }

    // ─── REPORT EXECUTION ────────────────────────────────────────────

    function runReport() {
        const payments = getFilteredPayments();
        const fees = getFilteredStudentFees();

        const stats = hasFormulas()
            ? window.computeCollectionStats(fees)
            : { totalExpected: 0, totalCollected: 0, totalOutstanding: 0, collectionRate: 0, totalStudents: 0, fullPayers: 0, partialPayers: 0, nonPayers: 0 };

        const trend = hasFormulas() ? window.computePaymentTrend(payments, 'day') : [];
        const methodBreakdown = hasFormulas() ? window.computeMethodBreakdown(payments) : [];

        renderSummaryTiles(stats);
        renderTrendChart(trend);
        renderMethodChart(methodBreakdown);
        renderMethodTable(methodBreakdown);
        renderClassTable(fees, payments);

        notify('Report updated (' + payments.length + ' payment' + (payments.length === 1 ? '' : 's') + ' in range)', 'success');
    }

    function renderSummaryTiles(stats) {
        const el = rootEl.querySelector('#fr-summary-tiles');
        if (!el) return;

        const tiles = [
            { value: fmtCurrency(stats.totalExpected), label: 'Expected' },
            { value: fmtCurrency(stats.totalCollected), label: 'Collected' },
            { value: fmtCurrency(stats.totalOutstanding), label: 'Outstanding' },
            { value: fmtPct(stats.collectionRate), label: 'Collection Rate' },
            { value: stats.fullPayers, label: 'Fully Paid' },
            { value: stats.nonPayers, label: 'Not Paid' }
        ];

        el.innerHTML = tiles.map(function (t) {
            return (
                '<div class="card" style="padding:12px 14px;text-align:center;">' +
                '<div style="font-family:\'Playfair Display\', serif;font-size:1.3rem;font-weight:700;">' + t.value + '</div>' +
                '<div style="font-size:0.7rem;color:var(--text-soft, #6b5f56);text-transform:uppercase;letter-spacing:0.4px;margin-top:2px;">' + esc(t.label) + '</div>' +
                '</div>'
            );
        }).join('');
    }

    function renderTrendChart(trend) {
        const canvas = rootEl.querySelector('#fr-trend-chart');
        if (!canvas) return;
        if (chartInstances.trend) chartInstances.trend.destroy();

        chartInstances.trend = new Chart(canvas.getContext('2d'), {
            type: 'line',
            data: {
                labels: trend.map(function (t) { return t.period; }),
                datasets: [{
                    label: 'Collected',
                    data: trend.map(function (t) { return t.total; }),
                    borderColor: '#3a7a5a',
                    backgroundColor: 'rgba(58,122,90,0.15)',
                    fill: true,
                    tension: 0.3,
                    pointRadius: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: { callbacks: { label: function (ctx) { return fmtCurrency(ctx.parsed.y); } } }
                },
                scales: {
                    y: { beginAtZero: true, ticks: { callback: function (v) { return (v / 1000) + 'K'; } } },
                    x: { grid: { display: false } }
                }
            }
        });
    }

    function renderMethodChart(breakdown) {
        const canvas = rootEl.querySelector('#fr-method-chart');
        if (!canvas) return;
        if (chartInstances.method) chartInstances.method.destroy();

        const colors = ['#3a7a5a', '#4a7a8a', '#b8983a', '#c45a4a', '#8b5cf6'];

        chartInstances.method = new Chart(canvas.getContext('2d'), {
            type: 'doughnut',
            data: {
                labels: breakdown.map(function (m) { return m.method; }),
                datasets: [{
                    data: breakdown.map(function (m) { return m.total; }),
                    backgroundColor: breakdown.map(function (m, i) { return colors[i % colors.length]; }),
                    borderWidth: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '60%',
                plugins: { legend: { position: 'bottom', labels: { boxWidth: 8, padding: 6, font: { size: 10 } } } }
            }
        });
    }

    function renderMethodTable(breakdown) {
        const table = rootEl.querySelector('#fr-method-table');
        if (!table) return;

        if (!breakdown.length) {
            table.innerHTML = '<tbody><tr><td style="padding:10px;color:var(--text-soft);">No payments in range.</td></tr></tbody>';
            return;
        }

        table.innerHTML =
            '<thead><tr><th>Method</th><th>Total</th><th>%</th></tr></thead>' +
            '<tbody>' + breakdown.map(function (m) {
                return '<tr><td>' + esc(m.method) + '</td><td>' + fmtCurrency(m.total) + '</td><td>' + fmtPct(m.pct) + '</td></tr>';
            }).join('') + '</tbody>';
    }

    function renderClassTable(fees, payments) {
        const table = rootEl.querySelector('#fr-class-table');
        if (!table) return;

        const students = getStudents();
        const classes = getClasses();
        const studentClassMap = {};
        students.forEach(function (s) { studentClassMap[s.id] = s.class_id; });

        const feesByClass = {};
        fees.forEach(function (f) {
            const cid = studentClassMap[f.student_id];
            feesByClass[cid] = feesByClass[cid] || [];
            feesByClass[cid].push(f);
        });

        const paymentsByClass = {};
        payments.forEach(function (p) {
            const cid = studentClassMap[p.student_id];
            paymentsByClass[cid] = (paymentsByClass[cid] || 0) + Number(p.total_amount || 0);
        });

        const rows = classes.map(function (c) {
            const classFees = feesByClass[c.id] || [];
            const stats = hasFormulas()
                ? window.computeCollectionStats(classFees)
                : { totalExpected: 0, totalCollected: 0, collectionRate: 0, totalStudents: 0 };
            return {
                name: c.name,
                expected: stats.totalExpected,
                collected: paymentsByClass[c.id] || 0,
                rate: stats.totalExpected ? Math.round(((paymentsByClass[c.id] || 0) / stats.totalExpected) * 1000) / 10 : 0,
                students: stats.totalStudents
            };
        });

        table.innerHTML =
            '<thead><tr><th>Class</th><th>Students</th><th>Expected</th><th>Collected (in range)</th><th>Rate</th></tr></thead>' +
            '<tbody>' + rows.map(function (r) {
                const statusClass = r.rate >= 90 ? 'table-status-success' : r.rate >= 60 ? 'table-status-warning' : 'table-status-danger';
                return (
                    '<tr>' +
                    '<td style="font-weight:600;">' + esc(r.name) + '</td>' +
                    '<td>' + r.students + '</td>' +
                    '<td>' + fmtCurrency(r.expected) + '</td>' +
                    '<td>' + fmtCurrency(r.collected) + '</td>' +
                    '<td><span class="table-status ' + statusClass + '">' + fmtPct(r.rate) + '</span></td>' +
                    '</tr>'
                );
            }).join('') + '</tbody>';
    }

    // ─── CSV EXPORT ──────────────────────────────────────────────────

    function exportCsv() {
        const payments = getFilteredPayments();
        if (!payments.length) {
            notify('No payments in the selected range to export', 'warning');
            return;
        }

        const students = getStudents();
        const studentNameMap = {};
        students.forEach(function (s) { studentNameMap[s.id] = studentName(s); });

        const header = 'Receipt,Student,Amount,Method,Date';
        const lines = payments.map(function (p) {
            return [
                p.receipt_number || '',
                '"' + (studentNameMap[p.student_id] || 'Unknown') + '"',
                p.total_amount, p.payment_method, p.payment_date
            ].join(',');
        });
        const csv = [header].concat(lines).join('\n');

        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'financial-report-' + filters.from + '-to-' + filters.to + '.csv';
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);

        notify('Report exported (' + payments.length + ' rows)', 'success');
    }

    // ─── TOAST HELPER ────────────────────────────────────────────────

    function notify(message, type) {
        if (typeof window.showToast === 'function') {
            window.showToast(message, type || 'info');
        }
    }

    // ─── DESTROY ─────────────────────────────────────────────────────

    function destroyFinancialReports() {
        if (chartInstances.trend) { chartInstances.trend.destroy(); chartInstances.trend = null; }
        if (chartInstances.method) { chartInstances.method.destroy(); chartInstances.method = null; }
        rootEl = null;
    }

    // ─── EXPOSE ──────────────────────────────────────────────────────

    window.renderFinancialReports = renderFinancialReports;
    window.destroyFinancialReports = destroyFinancialReports;
})();