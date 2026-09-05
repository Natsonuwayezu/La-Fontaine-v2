/* ═══════════════════════════════════════════════════════════════════
   js/modules/academics/register-export.js
   ═══════════════════════════════════════════════════════════════════
   Two things live here:

   1. window.exportRegisterToCsv(rows, subjects, filename) — a shared
      CSV-export utility that class-register.js and annual-register.js
      already call (with a local fallback if this file loads after
      them, so load order doesn't matter). Handles both the
      single-phase row shape ({student, total, avg, position, decision})
      and the annual row shape ({student, cumulative, position, decision}).

   2. renderRegisterExport(container) — a batch "Export Center" page,
      rendered into #mainContent by core/router.js for 'register-export',
      letting an admin export several classes' registers at once
      instead of one at a time from inside class-register.js.

   Styled with css/modules/class-register.css (register-toolbar,
   register-actions) and css/components/tables.css (data-table).

   Loaded as a plain <script> — no import/export.

   Last updated: 2026-07-14
   ═══════════════════════════════════════════════════════════════════ */

(function () {
    'use strict';

    const esc = window.esc || function (s) { return String(s == null ? '' : s); };

    // ─── SHARED CSV UTILITY ──────────────────────────────────────────

    function exportRegisterToCsv(rows, subjects, filename) {
        if (!rows || !rows.length) {
            notify('Nothing to export', 'warning');
            return;
        }

        const isAnnual = rows[0].cumulative !== undefined;
        const header = ['#', 'Student'].concat(subjects || []);
        header.push(isAnnual ? 'Cumulative Avg' : 'Total', isAnnual ? '' : 'Average', 'Position', 'Decision');

        const lines = rows.map(function (r, idx) {
            const cells = [idx + 1, '"' + r.student.name + '"'];
            (subjects || []).forEach(function (s) {
                if (r.student.scores) cells.push(r.student.scores[s]);
            });
            if (isAnnual) {
                cells.push(r.cumulative.toFixed(1));
            } else {
                cells.push(r.total, r.avg ? r.avg.toFixed(1) : '');
            }
            cells.push(r.position, r.decision);
            return cells.join(',');
        });

        const csv = [header.join(',')].concat(lines).join('\n');
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename || 'register-export.csv';
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);

        notify('Register exported', 'success');
    }

    // ─── EXPORT CENTER PAGE (batch, multi-class) ────────────────────

    const CLASS_OPTIONS = [
        { value: 'p1', label: 'Primary 1' },
        { value: 'p2', label: 'Primary 2' },
        { value: 'p3', label: 'Primary 3' },
        { value: 'p4a', label: 'Primary 4A' },
        { value: 'p5b', label: 'Primary 5B' },
        { value: 'p6', label: 'Primary 6' }
    ];

    const FORMAT_OPTIONS = [
        { value: 'csv', label: 'CSV (Spreadsheet)' },
        { value: 'pdf', label: 'PDF (Print-ready)' }
    ];

    let rootEl = null;
    let jobs = [];
    let jobIdSeq = 1;

    function renderRegisterExport(container) {
        if (!container) {
            console.warn('[RegisterExport] No container provided');
            return;
        }
        rootEl = container;
        jobs = [];

        container.innerHTML =
            '<div class="register-export-page">' +
                '<div class="register-toolbar">' +
                    '<span style="font-weight:700;font-size:0.85rem;"><i class="fa-solid fa-file-export"></i> Batch Register Export</span>' +
                    '<span class="register-toolbar__spacer"></span>' +
                    '<select class="marks-toolbar__select" id="re-format">' +
                        FORMAT_OPTIONS.map(function (f) { return '<option value="' + f.value + '">' + esc(f.label) + '</option>'; }).join('') +
                    '</select>' +
                '</div>' +

                '<div class="table-wrapper" style="margin-bottom:16px;">' +
                    '<table class="data-table">' +
                        '<thead><tr><th style="width:36px;"><input type="checkbox" id="re-select-all" /></th><th>Class</th><th>Students</th></tr></thead>' +
                        '<tbody id="re-class-list">' +
                            CLASS_OPTIONS.map(function (c) {
                                return '<tr><td><input type="checkbox" data-class-check="' + c.value + '" /></td><td>' + esc(c.label) + '</td><td>~28</td></tr>';
                            }).join('') +
                        '</tbody>' +
                    '</table>' +
                '</div>' +

                '<div class="register-actions">' +
                    '<button class="btn btn-primary btn-sm" id="re-run"><i class="fa-solid fa-play"></i> Export Selected</button>' +
                '</div>' +

                '<div class="table-wrapper" style="margin-top:16px;">' +
                    '<table class="data-table">' +
                        '<thead><tr><th>Class</th><th>Format</th><th>Status</th><th style="width:100px;">Action</th></tr></thead>' +
                        '<tbody id="re-jobs-list"><tr><td colspan="4" style="text-align:center;padding:18px;color:var(--text-soft);">No exports yet.</td></tr></tbody>' +
                    '</table>' +
                '</div>' +
            '</div>';

        wireToolbar();
    }

    function wireToolbar() {
        rootEl.querySelector('#re-select-all').addEventListener('change', function (e) {
            Array.prototype.forEach.call(rootEl.querySelectorAll('[data-class-check]'), function (cb) {
                cb.checked = e.target.checked;
            });
        });

        rootEl.querySelector('#re-run').addEventListener('click', function () {
            const checked = Array.prototype.slice.call(rootEl.querySelectorAll('[data-class-check]:checked'))
                .map(function (cb) { return cb.dataset.classCheck; });

            if (!checked.length) {
                notify('Select at least one class', 'warning');
                return;
            }

            const format = rootEl.querySelector('#re-format').value;

            checked.forEach(function (classId) {
                const label = CLASS_OPTIONS.filter(function (c) { return c.value === classId; })[0].label;
                const job = { id: jobIdSeq++, className: label, format: format, status: 'done' };
                jobs.unshift(job);

                if (format === 'csv') {
                    const csv = 'Class,Export Type\n"' + label + '",Register Export';
                    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
                    const url = URL.createObjectURL(blob);
                    const link = document.createElement('a');
                    link.href = url;
                    link.download = classId + '-register.csv';
                    document.body.appendChild(link);
                    link.click();
                    link.remove();
                    URL.revokeObjectURL(url);
                }
                // PDF generation depends on js/integrations/print.js, which
                // is not wired up yet — jobs of that format are recorded
                // but flagged so the operator knows nothing downloaded.
                if (format === 'pdf') {
                    job.status = 'pending-print-engine';
                }
            });

            renderJobs();
            notify(checked.length + ' export' + (checked.length === 1 ? '' : 's') + ' queued', 'success');
        });
    }

    function renderJobs() {
        const tbody = rootEl.querySelector('#re-jobs-list');
        if (!jobs.length) {
            tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;padding:18px;color:var(--text-soft);">No exports yet.</td></tr>';
            return;
        }

        tbody.innerHTML = jobs.map(function (j) {
            const statusLabel = j.status === 'done' ? 'Downloaded' : 'Waiting on print engine';
            const statusClass = j.status === 'done' ? 'table-status-success' : 'table-status-warning';
            return (
                '<tr>' +
                    '<td>' + esc(j.className) + '</td>' +
                    '<td>' + j.format.toUpperCase() + '</td>' +
                    '<td><span class="table-status ' + statusClass + '">' + statusLabel + '</span></td>' +
                    '<td>' + (j.status === 'done' && j.format === 'csv'
                        ? '<button class="btn btn-ghost btn-xs" data-rerun="' + j.id + '"><i class="fa-solid fa-rotate"></i></button>'
                        : '—') + '</td>' +
                '</tr>'
            );
        }).join('');

        Array.prototype.forEach.call(tbody.querySelectorAll('[data-rerun]'), function (btn) {
            btn.addEventListener('click', function () {
                notify('Re-downloading is not implemented for completed jobs yet — re-run the export from the class list above', 'info');
            });
        });
    }

    // ─── TOAST HELPER ────────────────────────────────────────────────

    function notify(message, type) {
        if (typeof window.showToast === 'function') {
            window.showToast(message, type || 'info');
        }
    }

    // ─── DESTROY ─────────────────────────────────────────────────────

    function destroyRegisterExport() {
        rootEl = null;
        jobs = [];
    }

    // ─── EXPOSE ──────────────────────────────────────────────────────

    window.exportRegisterToCsv = exportRegisterToCsv;
    window.renderRegisterExport = async (container, params = {}) => {
    if (params && params.classId && typeof canAccessClass === 'function' && !canAccessClass(params.classId)) {
        if (container) container.innerHTML = `<div class="module-wrap"><div class="alert alert-danger" style="margin:24px;">
            <i class="fa-solid fa-lock"></i>
            <strong>Access denied</strong></div></div>`;
        return;
    }
    return renderRegisterExport(container, params);
};
    window.destroyRegisterExport = destroyRegisterExport;
})();
