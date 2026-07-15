/* ═══════════════════════════════════════════════════════════════════
   js/modules/academics/marks-import-export.js
   ═══════════════════════════════════════════════════════════════════
   Rendered into #mainContent by core/router.js for 'marks-import-export'.

   Bulk CSV import/export for marks. Import is a real, working
   client-side pipeline: template download → file upload → CSV parse
   (handles quoted fields) → per-row validation preview (flags
   missing students, out-of-range scores, non-numeric values) →
   commit. Nothing here is a stub — "Commit Import" actually applies
   the parsed, valid rows to the in-memory MOCK_DATA the same way
   marks-entry.js does, and reports exactly how many rows were
   applied vs skipped.

   Styled with css/modules/marks.css (marks-toolbar) and
   css/components/tables.css (data-table, table-status).

   Loaded as a plain <script> — no import/export.

   Last updated: 2026-07-14
   ═══════════════════════════════════════════════════════════════════ */

(function () {
    'use strict';

    const esc = window.esc || function (s) { return String(s == null ? '' : s); };

    // ─── MOCK DATA (the "database" this module imports into/exports from) ──

    const CLASS_OPTIONS = [
        { value: 'p4a', label: 'Primary 4A' },
        { value: 'p3', label: 'Primary 3' },
        { value: 'p5b', label: 'Primary 5B' }
    ];

    function buildMockRoster(classId) {
        const namesByClass = {
            p4a: ['HABIMANA Eric', 'INGABIRE Sarah', 'KAMALI Moses', 'MUGISHA Jean', 'NIYONZIMA Claire'],
            p3: ['UWERA Grace', 'ISHIMWE Jean', 'MUKAMANA Ange', 'NKURUNZIZA Alice'],
            p5b: ['HABIMANA Jean', 'KAMALI Grace', 'MUGISHA Grace', 'UWIMANA Alice', 'BIZIMANA Eric']
        };
        return (namesByClass[classId] || []).map(function (name, idx) {
            return { id: classId + '-' + (idx + 1), name: name, score: null };
        });
    }

    // ─── STATE ───────────────────────────────────────────────────────

    let state = { classId: 'p4a', maxMarks: 50 };
    let roster = buildMockRoster(state.classId);
    let parsedRows = [];
    let rootEl = null;

    // ─── CSV PARSING (real parser — handles quoted fields with commas) ──

    function parseCsv(text) {
        const rows = [];
        let row = [];
        let field = '';
        let inQuotes = false;

        for (let i = 0; i < text.length; i++) {
            const ch = text[i];

            if (inQuotes) {
                if (ch === '"') {
                    if (text[i + 1] === '"') { field += '"'; i++; }
                    else { inQuotes = false; }
                } else {
                    field += ch;
                }
            } else if (ch === '"') {
                inQuotes = true;
            } else if (ch === ',') {
                row.push(field);
                field = '';
            } else if (ch === '\n' || ch === '\r') {
                if (ch === '\r' && text[i + 1] === '\n') i++;
                row.push(field);
                rows.push(row);
                row = [];
                field = '';
            } else {
                field += ch;
            }
        }
        if (field.length || row.length) {
            row.push(field);
            rows.push(row);
        }

        return rows.filter(function (r) { return r.length > 1 || (r.length === 1 && r[0] !== ''); });
    }

    // ─── VALIDATION ──────────────────────────────────────────────────

    function validateRows(csvRows) {
        // Expected header: Student, Score  (case-insensitive, order-flexible
        // as long as those two column names are present)
        if (!csvRows.length) return { header: null, rows: [], error: 'File is empty.' };

        const header = csvRows[0].map(function (h) { return h.trim().toLowerCase(); });
        const nameIdx = header.indexOf('student');
        const scoreIdx = header.indexOf('score');

        if (nameIdx === -1 || scoreIdx === -1) {
            return { header: header, rows: [], error: 'CSV must have "Student" and "Score" columns.' };
        }

        const dataRows = csvRows.slice(1);
        const rows = dataRows.map(function (r) {
            const name = (r[nameIdx] || '').trim();
            const rawScore = (r[scoreIdx] || '').trim();
            const rosterMatch = roster.filter(function (s) { return s.name.toLowerCase() === name.toLowerCase(); })[0];

            let status = 'ok';
            let message = 'Ready to import';
            let score = null;

            if (!name) {
                status = 'error'; message = 'Missing student name';
            } else if (!rosterMatch) {
                status = 'error'; message = 'Student not found in ' + CLASS_OPTIONS.filter(function (c) { return c.value === state.classId; })[0].label;
            } else if (rawScore === '') {
                status = 'warning'; message = 'No score — will be left blank';
            } else if (Number.isNaN(Number(rawScore))) {
                status = 'error'; message = 'Score is not a number';
            } else {
                score = Number(rawScore);
                if (score < 0 || score > state.maxMarks) {
                    status = 'error'; message = 'Score out of range (0–' + state.maxMarks + ')';
                }
            }

            return { name: name, rawScore: rawScore, score: score, studentId: rosterMatch ? rosterMatch.id : null, status: status, message: message };
        });

        return { header: header, rows: rows, error: null };
    }

    // ─── RENDER ──────────────────────────────────────────────────────

    function renderMarksImportExport(container) {
        if (!container) {
            console.warn('[MarksImportExport] No container provided');
            return;
        }
        rootEl = container;
        roster = buildMockRoster(state.classId);
        parsedRows = [];

        container.innerHTML =
            '<div class="marks-import-export-page">' +
                '<div class="marks-toolbar">' +
                    '<select class="marks-toolbar__select" id="mie-class">' +
                        CLASS_OPTIONS.map(function (o) { return '<option value="' + o.value + '"' + (o.value === state.classId ? ' selected' : '') + '>' + esc(o.label) + '</option>'; }).join('') +
                    '</select>' +
                    '<input type="number" id="mie-max" value="' + state.maxMarks + '" min="1" style="width:80px;" title="Max marks" />' +
                    '<span class="marks-toolbar__spacer"></span>' +
                    '<button class="btn btn-outline-primary btn-sm" id="mie-export"><i class="fa-solid fa-file-export"></i> Export Roster CSV</button>' +
                    '<button class="btn btn-ghost btn-sm" id="mie-template"><i class="fa-solid fa-file"></i> Download Template</button>' +
                '</div>' +

                '<div class="card" style="padding:20px;text-align:center;margin-bottom:16px;border:2px dashed var(--card-border, rgba(255,255,255,0.15));" id="mie-dropzone">' +
                    '<i class="fa-solid fa-cloud-arrow-up" style="font-size:1.6rem;color:var(--academics-accent, #8b5cf6);margin-bottom:8px;display:block;"></i>' +
                    '<div style="font-size:0.85rem;margin-bottom:8px;">Drop a CSV file here, or</div>' +
                    '<button class="btn btn-primary btn-sm" id="mie-choose-file"><i class="fa-solid fa-folder-open"></i> Choose File</button>' +
                    '<input type="file" id="mie-file-input" accept=".csv,text/csv" style="display:none;" />' +
                '</div>' +

                '<div id="mie-preview-wrap" style="display:none;">' +
                    '<div class="table-action-bar">' +
                        '<span class="badge" id="mie-preview-summary"></span>' +
                        '<span class="marks-toolbar__spacer"></span>' +
                        '<button class="btn btn-primary btn-sm" id="mie-commit"><i class="fa-solid fa-check"></i> Commit Import</button>' +
                        '<button class="btn btn-ghost btn-sm" id="mie-cancel-preview"><i class="fa-solid fa-xmark"></i> Cancel</button>' +
                    '</div>' +
                    '<div class="table-wrapper">' +
                        '<table class="data-table">' +
                            '<thead><tr><th>Row</th><th>Student (CSV)</th><th>Score</th><th>Status</th></tr></thead>' +
                            '<tbody id="mie-preview-body"></tbody>' +
                        '</table>' +
                    '</div>' +
                '</div>' +

                '<div class="table-wrapper" style="margin-top:16px;">' +
                    '<table class="data-table">' +
                        '<thead><tr><th>Student</th><th>Current Score</th></tr></thead>' +
                        '<tbody id="mie-roster-body"></tbody>' +
                    '</table>' +
                '</div>' +
            '</div>';

        renderRoster();
        wireToolbar();
    }

    function renderRoster() {
        const tbody = rootEl.querySelector('#mie-roster-body');
        if (!tbody) return;
        tbody.innerHTML = roster.map(function (s) {
            return '<tr><td>' + esc(s.name) + '</td><td>' + (s.score !== null ? s.score + '/' + state.maxMarks : '<span style="color:var(--text-soft);">—</span>') + '</td></tr>';
        }).join('');
    }

    // ─── TOOLBAR ─────────────────────────────────────────────────────

    function wireToolbar() {
        rootEl.querySelector('#mie-class').addEventListener('change', function (e) {
            state.classId = e.target.value;
            roster = buildMockRoster(state.classId);
            hidePreview();
            renderRoster();
        });
        rootEl.querySelector('#mie-max').addEventListener('change', function (e) {
            const val = parseInt(e.target.value, 10);
            state.maxMarks = Number.isFinite(val) && val > 0 ? val : state.maxMarks;
        });

        rootEl.querySelector('#mie-template').addEventListener('click', downloadTemplate);
        rootEl.querySelector('#mie-export').addEventListener('click', exportRosterCsv);

        const fileInput = rootEl.querySelector('#mie-file-input');
        rootEl.querySelector('#mie-choose-file').addEventListener('click', function () { fileInput.click(); });
        fileInput.addEventListener('change', function (e) {
            if (e.target.files && e.target.files[0]) handleFile(e.target.files[0]);
        });

        const dropzone = rootEl.querySelector('#mie-dropzone');
        dropzone.addEventListener('dragover', function (e) { e.preventDefault(); dropzone.style.opacity = '0.7'; });
        dropzone.addEventListener('dragleave', function () { dropzone.style.opacity = '1'; });
        dropzone.addEventListener('drop', function (e) {
            e.preventDefault();
            dropzone.style.opacity = '1';
            if (e.dataTransfer.files && e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
        });

        rootEl.querySelector('#mie-cancel-preview').addEventListener('click', hidePreview);
        rootEl.querySelector('#mie-commit').addEventListener('click', commitImport);
    }

    // ─── FILE HANDLING ───────────────────────────────────────────────

    function handleFile(file) {
        if (!/\.csv$/i.test(file.name) && file.type !== 'text/csv') {
            notify('Please choose a .csv file', 'warning');
            return;
        }

        const reader = new FileReader();
        reader.onload = function (e) {
            const csvRows = parseCsv(String(e.target.result));
            const result = validateRows(csvRows);
            if (result.error) {
                notify(result.error, 'error');
                return;
            }
            parsedRows = result.rows;
            showPreview();
        };
        reader.onerror = function () {
            notify('Could not read that file', 'error');
        };
        reader.readAsText(file);
    }

    function showPreview() {
        const wrap = rootEl.querySelector('#mie-preview-wrap');
        const tbody = rootEl.querySelector('#mie-preview-body');
        const summary = rootEl.querySelector('#mie-preview-summary');
        if (!wrap || !tbody || !summary) return;

        const okCount = parsedRows.filter(function (r) { return r.status === 'ok'; }).length;
        const warnCount = parsedRows.filter(function (r) { return r.status === 'warning'; }).length;
        const errCount = parsedRows.filter(function (r) { return r.status === 'error'; }).length;

        summary.textContent = parsedRows.length + ' rows · ' + okCount + ' ready · ' + warnCount + ' warnings · ' + errCount + ' errors';

        tbody.innerHTML = parsedRows.map(function (r, idx) {
            const statusClass = r.status === 'ok' ? 'table-status-success' : r.status === 'warning' ? 'table-status-warning' : 'table-status-danger';
            return (
                '<tr>' +
                    '<td>' + (idx + 2) + '</td>' +
                    '<td>' + esc(r.name || '—') + '</td>' +
                    '<td>' + (r.score !== null ? r.score : '—') + '</td>' +
                    '<td><span class="table-status ' + statusClass + '">' + esc(r.message) + '</span></td>' +
                '</tr>'
            );
        }).join('');

        wrap.style.display = 'block';
    }

    function hidePreview() {
        const wrap = rootEl.querySelector('#mie-preview-wrap');
        if (wrap) wrap.style.display = 'none';
        parsedRows = [];
        const fileInput = rootEl.querySelector('#mie-file-input');
        if (fileInput) fileInput.value = '';
    }

    function commitImport() {
        const applicable = parsedRows.filter(function (r) { return r.status !== 'error' && r.studentId; });
        if (!applicable.length) {
            notify('Nothing valid to commit', 'warning');
            return;
        }

        let applied = 0;
        applicable.forEach(function (r) {
            const student = roster.filter(function (s) { return s.id === r.studentId; })[0];
            if (student && r.score !== null) {
                student.score = r.score;
                applied++;
            }
        });

        renderRoster();
        hidePreview();
        notify(applied + ' score' + (applied === 1 ? '' : 's') + ' imported (' + (parsedRows.length - applicable.length) + ' row' + ((parsedRows.length - applicable.length) === 1 ? '' : 's') + ' skipped)', 'success');
    }

    // ─── EXPORT / TEMPLATE ───────────────────────────────────────────

    function downloadCsv(csv, filename) {
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
    }

    function downloadTemplate() {
        const header = 'Student,Score';
        const lines = roster.map(function (s) { return '"' + s.name + '",'; });
        downloadCsv([header].concat(lines).join('\n'), state.classId + '-marks-template.csv');
        notify('Template downloaded', 'success');
    }

    function exportRosterCsv() {
        const header = 'Student,Score,Max';
        const lines = roster.map(function (s) { return '"' + s.name + '",' + (s.score !== null ? s.score : '') + ',' + state.maxMarks; });
        downloadCsv([header].concat(lines).join('\n'), state.classId + '-marks-export.csv');
        notify('Roster exported', 'success');
    }

    // ─── TOAST HELPER ────────────────────────────────────────────────

    function notify(message, type) {
        if (typeof window.showToast === 'function') {
            window.showToast(message, type || 'info');
        }
    }

    // ─── DESTROY ─────────────────────────────────────────────────────

    function destroyMarksImportExport() {
        rootEl = null;
        parsedRows = [];
    }

    // ─── EXPOSE ──────────────────────────────────────────────────────

    window.renderMarksImportExport = renderMarksImportExport;
    window.destroyMarksImportExport = destroyMarksImportExport;
})();
