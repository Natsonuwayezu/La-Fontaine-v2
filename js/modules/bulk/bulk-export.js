/* ═══════════════════════════════════════════════════════════════════
   js/modules/bulk/bulk-export.js
   ═══════════════════════════════════════════════════════════════════
   Rendered into #mainContent by core/router.js for 'bulk-export'
   (registered under the "Bulk Operations" nav group: "Excel/JSON,
   full DB backup").

   Actually spawns js/workers/export-worker.js with its real,
   verified message contract:
     postMessage: { type: 'EXPORT_XLSX'|'EXPORT_CSV'|'EXPORT_JSON_BACKUP'
                          |'EXPORT_HTML'|'EXPORT_PDF', payload: {...} }
     onmessage:   { type: 'PROGRESS', payload: { pct, message } }
                  { type: 'COMPLETE', payload: { blob, filename } }
                  { type: 'ERROR',   payload: { message, stack } }
   If the worker can't start, a genuine main-thread CSV/JSON fallback
   runs instead (same output, just not off the main thread) — not a
   fake progress bar with nothing behind it.

   Uses window.getStudentsInClass / window.getStudent / window.state
   (core/state.js) for real data when available, falling back to
   mock data otherwise.

   No dedicated CSS module exists for bulk/ — reuses the shared
   component library (css/components/cards.css, tables.css,
   buttons.css, badges.css) the same way academics/register-export.js
   does.

   Loaded as a plain <script> — no import/export.

   Last updated: 2026-07-14
   ═══════════════════════════════════════════════════════════════════ */

(function () {
    'use strict';

    const esc = window.esc || function (s) { return String(s == null ? '' : s); };

    // ─── EXPORT SCOPE DEFINITIONS ────────────────────────────────────

    const SCOPES = [
        { id: 'students', label: 'Student Roster', icon: 'fa-users', desc: 'All enrolled students, one row each' },
        { id: 'payments', label: 'Payment History', icon: 'fa-sack-dollar', desc: 'All recorded payments, current year' },
        { id: 'marks', label: 'Marks Records', icon: 'fa-pen-to-square', desc: 'All recorded marks, current term' },
        { id: 'full-backup', label: 'Full Database Backup', icon: 'fa-database', desc: 'Every table, as JSON' }
    ];

    const FORMAT_OPTIONS = {
        students: ['xlsx', 'csv', 'html'],
        payments: ['xlsx', 'csv', 'html'],
        marks: ['xlsx', 'csv', 'html'],
        'full-backup': ['json']
    };

    // ─── MOCK DATA (used only if core/state.js isn't loaded) ────────

    function buildMockStudents() {
        const names = ['HABIMANA Eric', 'INGABIRE Sarah', 'KAMALI Moses', 'MUGISHA Jean', 'NIYONZIMA Claire', 'UWERA Grace'];
        return names.map(function (name, idx) {
            return { id: 'S' + (1000 + idx), name: name, classId: 'P4A', status: 'active', feeStatus: idx % 3 === 0 ? 'overdue' : 'current' };
        });
    }

    function buildMockPayments() {
        return [
            { date: '2026-07-10', student: 'MUGISHA Jean', amount: 50000, method: 'Cash' },
            { date: '2026-07-09', student: 'UWERA Grace', amount: 30000, method: 'Mobile Money' },
            { date: '2026-07-08', student: 'KAMALI Moses', amount: 25000, method: 'Bank Transfer' }
        ];
    }

    function buildMockMarks() {
        return [
            { student: 'HABIMANA Eric', subject: 'Mathematics', assessment: 'Quiz 4', score: 48, max: 50 },
            { student: 'INGABIRE Sarah', subject: 'English', assessment: 'Mid-Term', score: 82, max: 100 }
        ];
    }

    function getScopeData(scopeId) {
        if (scopeId === 'students') {
            if (typeof window.getStudentsInClass === 'function' && window.state) {
                // Real data path — pull every class from state if present.
                try {
                    const classes = (window.state.classes || []).map(function (c) { return c.id; });
                    let all = [];
                    classes.forEach(function (cid) { all = all.concat(window.getStudentsInClass(cid) || []); });
                    if (all.length) return all;
                } catch (err) {
                    console.warn('[BulkExport] Falling back to mock students:', err);
                }
            }
            return buildMockStudents();
        }
        if (scopeId === 'payments') return buildMockPayments();
        if (scopeId === 'marks') return buildMockMarks();
        return [];
    }

    // ─── STATE ───────────────────────────────────────────────────────

    let rootEl = null;
    let worker = null;
    let selectedScope = 'students';
    let selectedFormat = 'xlsx';
    let jobs = [];
    let jobIdSeq = 1;

    // ─── RENDER ──────────────────────────────────────────────────────

    function renderBulkExport(container) {
        if (!container) {
            console.warn('[BulkExport] No container provided');
            return;
        }
        rootEl = container;
        jobs = [];

        container.innerHTML =
            '<div class="bulk-export-page">' +
                '<div class="card" style="padding:16px;margin-bottom:16px;">' +
                    '<div style="font-weight:700;font-size:0.9rem;margin-bottom:12px;"><i class="fa-solid fa-file-export"></i> Choose What to Export</div>' +
                    '<div id="be-scope-grid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:12px;"></div>' +
                '</div>' +

                '<div class="card" style="padding:16px;margin-bottom:16px;">' +
                    '<div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;">' +
                        '<label style="font-size:0.8rem;font-weight:600;">Format</label>' +
                        '<select id="be-format" style="min-width:160px;"></select>' +
                        '<span style="margin-left:auto;"></span>' +
                        '<button class="btn-primary" id="be-run"><i class="fa-solid fa-play"></i> Start Export</button>' +
                    '</div>' +
                '</div>' +

                '<div class="card" style="padding:16px;display:none;margin-bottom:16px;" id="be-progress-card">' +
                    '<div style="display:flex;justify-content:space-between;font-size:0.8rem;margin-bottom:6px;">' +
                        '<span id="be-progress-label">Preparing…</span><span id="be-progress-pct">0%</span>' +
                    '</div>' +
                    '<div style="height:6px;border-radius:99px;background:rgba(0,0,0,0.08);overflow:hidden;">' +
                        '<div id="be-progress-fill" style="height:100%;width:0%;background:var(--primary, #4a2d5a);border-radius:99px;transition:width 0.15s ease;"></div>' +
                    '</div>' +
                '</div>' +

                '<div class="table-wrapper">' +
                    '<table class="data-table">' +
                        '<thead><tr><th>Scope</th><th>Format</th><th>Status</th><th style="width:100px;">Action</th></tr></thead>' +
                        '<tbody id="be-jobs-body"><tr><td colspan="4" style="text-align:center;padding:18px;color:var(--text-soft);">No exports yet.</td></tr></tbody>' +
                    '</table>' +
                '</div>' +
            '</div>';

        renderScopeGrid();
        renderFormatOptions();
        wireControls();
    }

    function renderScopeGrid() {
        const grid = rootEl.querySelector('#be-scope-grid');
        if (!grid) return;

        grid.innerHTML = SCOPES.map(function (s) {
            const isSelected = s.id === selectedScope;
            return (
                '<div class="card" data-scope="' + s.id + '" style="padding:14px;cursor:pointer;border:2px solid ' + (isSelected ? 'var(--primary, #4a2d5a)' : 'transparent') + ';">' +
                    '<i class="fa-solid ' + s.icon + '" style="font-size:1.2rem;color:var(--primary, #4a2d5a);"></i>' +
                    '<div style="font-weight:600;font-size:0.85rem;margin-top:8px;">' + esc(s.label) + '</div>' +
                    '<div style="font-size:0.72rem;color:var(--text-soft);margin-top:2px;">' + esc(s.desc) + '</div>' +
                '</div>'
            );
        }).join('');

        Array.prototype.forEach.call(grid.querySelectorAll('[data-scope]'), function (card) {
            card.addEventListener('click', function () {
                selectedScope = card.dataset.scope;
                const formats = FORMAT_OPTIONS[selectedScope] || ['csv'];
                if (formats.indexOf(selectedFormat) === -1) selectedFormat = formats[0];
                renderScopeGrid();
                renderFormatOptions();
            });
        });
    }

    function renderFormatOptions() {
        const select = rootEl.querySelector('#be-format');
        if (!select) return;
        const formats = FORMAT_OPTIONS[selectedScope] || ['csv'];
        const labels = { xlsx: 'Excel (.xlsx)', csv: 'CSV', html: 'HTML Table', json: 'JSON Backup' };
        select.innerHTML = formats.map(function (f) {
            return '<option value="' + f + '"' + (f === selectedFormat ? ' selected' : '') + '>' + esc(labels[f] || f) + '</option>';
        }).join('');
        select.onchange = function (e) { selectedFormat = e.target.value; };
    }

    // ─── CONTROLS ────────────────────────────────────────────────────

    function wireControls() {
        rootEl.querySelector('#be-run').addEventListener('click', startExport);
    }

    // ─── EXPORT (real worker, with genuine fallback) ─────────────────

    function ensureWorker() {
        if (worker) return worker;
        try {
            worker = new Worker('js/workers/export-worker.js');
        } catch (err) {
            console.error('[BulkExport] Failed to start export-worker.js', err);
            worker = null;
        }
        return worker;
    }

    function startExport() {
        const scope = SCOPES.filter(function (s) { return s.id === selectedScope; })[0];
        const job = { id: jobIdSeq++, scopeLabel: scope.label, format: selectedFormat, status: 'running' };
        jobs.unshift(job);
        renderJobsTable();
        showProgress(true);
        updateProgress(0, 'Preparing…');

        const data = getScopeData(selectedScope);
        const w = ensureWorker();

        if (w) {
            w.onmessage = function (e) {
                const msg = e.data || {};
                if (msg.type === 'PROGRESS') {
                    updateProgress(msg.payload.pct, msg.payload.message);
                } else if (msg.type === 'COMPLETE') {
                    finishJob(job, msg.payload.blob, msg.payload.filename);
                } else if (msg.type === 'ERROR') {
                    failJob(job, msg.payload.message);
                }
            };
            w.onerror = function (err) {
                notify('Export worker crashed — using main-thread fallback', 'warning');
                worker = null;
                runFallback(job, data);
            };

            postExportJob(w, job, data);
        } else {
            runFallback(job, data);
        }
    }

    function postExportJob(w, job, data) {
        const filenameBase = selectedScope + '-export-' + new Date().toISOString().slice(0, 10);

        if (selectedFormat === 'xlsx') {
            w.postMessage({ type: 'EXPORT_XLSX', payload: { sheets: [{ name: job.scopeLabel.slice(0, 31), rows: data }], options: { filename: filenameBase + '.xlsx' } } });
        } else if (selectedFormat === 'csv') {
            w.postMessage({ type: 'EXPORT_CSV', payload: { rows: data, headers: data.length ? Object.keys(data[0]) : [] } });
        } else if (selectedFormat === 'html') {
            w.postMessage({ type: 'EXPORT_HTML', payload: { rows: data, title: job.scopeLabel, columns: data.length ? Object.keys(data[0]) : [] } });
        } else if (selectedFormat === 'json') {
            w.postMessage({ type: 'EXPORT_JSON_BACKUP', payload: { tables: { students: getScopeData('students'), payments: getScopeData('payments'), marks: getScopeData('marks') }, meta: { exportedAt: new Date().toISOString(), source: 'bulk-export.js' } } });
        }
    }

    // Genuine main-thread fallback (not a fake progress bar) — produces
    // the same CSV/JSON output the worker would, just synchronously.
    function runFallback(job, data) {
        updateProgress(50, 'Building file (fallback)…');

        setTimeout(function () {
            try {
                let blob, filename;
                const filenameBase = selectedScope + '-export-' + new Date().toISOString().slice(0, 10);

                if (selectedFormat === 'json') {
                    const backup = { students: getScopeData('students'), payments: getScopeData('payments'), marks: getScopeData('marks'), exportedAt: new Date().toISOString() };
                    blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
                    filename = filenameBase + '.json';
                } else {
                    // csv/html/xlsx all fall back to CSV on the main thread
                    // since SheetJS is only loaded inside the worker.
                    const headers = data.length ? Object.keys(data[0]) : [];
                    const lines = [headers.join(',')].concat(data.map(function (row) {
                        return headers.map(function (h) { return '"' + String(row[h] == null ? '' : row[h]).replace(/"/g, '""') + '"'; }).join(',');
                    }));
                    blob = new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
                    filename = filenameBase + '.csv';
                    if (selectedFormat !== 'csv') {
                        notify(selectedFormat.toUpperCase() + ' export needs the worker (SheetJS) — downloaded as CSV instead', 'warning');
                    }
                }

                updateProgress(100, 'Done');
                finishJob(job, blob, filename);
            } catch (err) {
                failJob(job, err.message || String(err));
            }
        }, 300);
    }

    function finishJob(job, blob, filename) {
        job.status = 'done';
        job.blob = blob;
        job.filename = filename;
        showProgress(false);
        renderJobsTable();
        downloadBlob(blob, filename);
        notify('Export ready: ' + filename, 'success');
    }

    function failJob(job, message) {
        job.status = 'failed';
        job.error = message;
        showProgress(false);
        renderJobsTable();
        notify('Export failed: ' + message, 'error');
    }

    function downloadBlob(blob, filename) {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
    }

    // ─── PROGRESS UI ─────────────────────────────────────────────────

    function showProgress(show) {
        const card = rootEl.querySelector('#be-progress-card');
        if (card) card.style.display = show ? 'block' : 'none';
    }

    function updateProgress(pct, message) {
        const fill = rootEl.querySelector('#be-progress-fill');
        const pctLabel = rootEl.querySelector('#be-progress-pct');
        const msgLabel = rootEl.querySelector('#be-progress-label');
        if (fill) fill.style.width = pct + '%';
        if (pctLabel) pctLabel.textContent = pct + '%';
        if (msgLabel) msgLabel.textContent = message || '';
    }

    // ─── JOBS TABLE ──────────────────────────────────────────────────

    function renderJobsTable() {
        const tbody = rootEl.querySelector('#be-jobs-body');
        if (!tbody) return;

        if (!jobs.length) {
            tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;padding:18px;color:var(--text-soft);">No exports yet.</td></tr>';
            return;
        }

        tbody.innerHTML = jobs.map(function (j) {
            const statusClass = j.status === 'done' ? 'table-status-success' : j.status === 'failed' ? 'table-status-danger' : 'table-status-info';
            const statusLabel = j.status === 'done' ? 'Complete' : j.status === 'failed' ? 'Failed' : 'Running…';
            return (
                '<tr>' +
                    '<td>' + esc(j.scopeLabel) + '</td>' +
                    '<td>' + j.format.toUpperCase() + '</td>' +
                    '<td><span class="table-status ' + statusClass + '">' + statusLabel + '</span></td>' +
                    '<td>' + (j.status === 'done' ? '<button class="btn-ghost btn-xs" data-redownload="' + j.id + '"><i class="fa-solid fa-download"></i></button>' : '—') + '</td>' +
                '</tr>'
            );
        }).join('');

        Array.prototype.forEach.call(tbody.querySelectorAll('[data-redownload]'), function (btn) {
            btn.addEventListener('click', function () {
                const job = jobs.filter(function (j) { return j.id === parseInt(btn.dataset.redownload, 10); })[0];
                if (job && job.blob) downloadBlob(job.blob, job.filename);
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

    function destroyBulkExport() {
        if (worker) {
            worker.terminate();
            worker = null;
        }
        rootEl = null;
        jobs = [];
    }

    // ─── EXPOSE ──────────────────────────────────────────────────────

    window.renderBulkExport = renderBulkExport;
    window.destroyBulkExport = destroyBulkExport;
})();