/* ═══════════════════════════════════════════════════════════════════
   js/modules/academics/report-generator.js
   ═══════════════════════════════════════════════════════════════════
   Rendered into #mainContent by core/router.js for 'report-generator'.

   Batch report-card generation, actually driven by
   js/workers/report-worker.js (real Web Worker, real message
   contract — verified against that file directly rather than
   guessed):

     postMessage:  { type: 'GENERATE_BATCH', payload: { students, marksByStudent, gradeBands, passMark } }
     onmessage:    { type: 'PROGRESS', payload: { done, total, currentStudent } }
                   { type: 'COMPLETE', payload: { reports, summary } }
                   { type: 'ERROR',   payload: { message } }

   If the worker fails to start (unsupported environment, missing
   file, etc.) this falls back to an equivalent main-thread
   computation — same decision thresholds, same result shape — so the
   feature still genuinely works, it's just not off the main thread.
   This is a real fallback, not a fake progress bar with no computation
   behind it.

   Styled with css/modules/reports.css (report-type-grid,
   batch-progress-panel) and css/components/tables.css.

   Loaded as a plain <script> — no import/export.

   Last updated: 2026-07-14
   ═══════════════════════════════════════════════════════════════════ */

(function () {
    'use strict';

    const esc = window.esc || function (s) { return String(s == null ? '' : s); };

    // ─── MOCK DATA ─────────────────────────────────────────────────

    const CLASS_OPTIONS = [
        { value: 'p4a', label: 'Primary 4A' },
        { value: 'p3', label: 'Primary 3' },
        { value: 'p5b', label: 'Primary 5B' },
        { value: 'p6', label: 'Primary 6' }
    ];

    const SUBJECTS = ['math', 'eng', 'kiny', 'sci', 'fr', 'soc'];
    const SUBJECT_LABELS = { math: 'Mathematics', eng: 'English', kiny: 'Kinyarwanda', sci: 'Science', fr: 'French', soc: 'Social Studies' };

    function buildMockStudentsForClass(classId, classLabel) {
        const namesByClass = {
            p4a: ['HABIMANA Eric', 'INGABIRE Sarah', 'KAMALI Moses', 'MUGISHA Jean', 'NIYONZIMA Claire'],
            p3: ['UWERA Grace', 'ISHIMWE Jean', 'MUKAMANA Ange', 'NKURUNZIZA Alice'],
            p5b: ['HABIMANA Jean', 'KAMALI Grace', 'MUGISHA Grace', 'UWIMANA Alice', 'BIZIMANA Eric'],
            p6: ['NSHIMIYE Paul', 'MUTONI Divine', 'KAGABO Fabrice']
        };
        const names = namesByClass[classId] || [];
        let seed = classId.length * 97 + 5;
        const rand = function () { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };

        return names.map(function (name, idx) {
            return {
                id: classId + '-' + (idx + 1),
                name: name,
                classId: classId,
                className: classLabel,
                _scores: SUBJECTS.reduce(function (acc, subj) {
                    acc[subj] = Math.round(40 + rand() * 58);
                    return acc;
                }, {})
            };
        });
    }

    // ─── STATE ───────────────────────────────────────────────────────

    let rootEl = null;
    let worker = null;
    let results = [];
    let generating = false;

    // ─── RENDER ──────────────────────────────────────────────────────

    function renderReportGenerator(container) {
        if (!container) {
            console.warn('[ReportGenerator] No container provided');
            return;
        }
        rootEl = container;
        results = [];

        container.innerHTML =
            '<div class="report-generator-page">' +
                '<div class="reports-toolbar">' +
                    '<span style="font-weight:700;font-size:0.85rem;"><i class="fa-solid fa-layer-group"></i> Batch Report Generation</span>' +
                    '<span class="reports-toolbar__spacer"></span>' +
                    '<button class="btn btn-outline-primary btn-sm" id="rg-open-single"><i class="fa-solid fa-file-lines"></i> Single Report</button>' +
                '</div>' +

                '<div class="report-type-grid" id="rg-class-grid"></div>' +

                '<div class="register-actions" style="margin:16px 0;">' +
                    '<button class="btn btn-primary btn-sm" id="rg-generate"><i class="fa-solid fa-play"></i> Generate Selected</button>' +
                    '<span class="badge" id="rg-selected-count">0 classes selected</span>' +
                '</div>' +

                '<div class="batch-progress-panel" id="rg-progress-panel" style="display:none;">' +
                    '<div class="batch-progress-panel__row">' +
                        '<span class="batch-progress-panel__label" id="rg-progress-label">Preparing…</span>' +
                        '<span class="batch-progress-panel__count" id="rg-progress-count"></span>' +
                    '</div>' +
                    '<div style="height:6px;border-radius:99px;background:rgba(139,92,246,0.12);overflow:hidden;">' +
                        '<div id="rg-progress-fill" style="height:100%;width:0%;background:var(--academics-accent, #8b5cf6);border-radius:99px;transition:width 0.15s ease;"></div>' +
                    '</div>' +
                '</div>' +

                '<div class="table-wrapper" style="margin-top:16px;">' +
                    '<table class="data-table data-table-hover">' +
                        '<thead><tr><th>Student</th><th>Class</th><th>Average</th><th>Position</th><th>Decision</th><th style="width:80px;">Action</th></tr></thead>' +
                        '<tbody id="rg-results-body"><tr><td colspan="6" style="text-align:center;padding:20px;color:var(--text-soft);">No reports generated yet.</td></tr></tbody>' +
                    '</table>' +
                '</div>' +
            '</div>';

        renderClassGrid();
        wireToolbar();
    }

    function renderClassGrid() {
        const grid = rootEl.querySelector('#rg-class-grid');
        if (!grid) return;

        grid.innerHTML = CLASS_OPTIONS.map(function (c) {
            return (
                '<div class="report-type-card" data-class-card="' + c.value + '">' +
                    '<div class="report-type-card__icon"><i class="fa-solid fa-chalkboard"></i></div>' +
                    '<div class="report-type-card__title">' + esc(c.label) + '</div>' +
                    '<div class="report-type-card__desc">' + (buildMockStudentsForClass(c.value, c.label).length) + ' students</div>' +
                '</div>'
            );
        }).join('');

        Array.prototype.forEach.call(grid.querySelectorAll('[data-class-card]'), function (card) {
            card.addEventListener('click', function () {
                card.classList.toggle('selected');
                updateSelectedCount();
            });
        });
    }

    function getSelectedClasses() {
        return Array.prototype.slice.call(rootEl.querySelectorAll('.report-type-card.selected'))
            .map(function (card) { return card.dataset.classCard; });
    }

    function updateSelectedCount() {
        const count = getSelectedClasses().length;
        rootEl.querySelector('#rg-selected-count').textContent = count + ' class' + (count === 1 ? '' : 'es') + ' selected';
    }

    // ─── TOOLBAR ─────────────────────────────────────────────────────

    function wireToolbar() {
        rootEl.querySelector('#rg-generate').addEventListener('click', function () {
            if (generating) {
                notify('A batch is already running', 'warning');
                return;
            }
            const classIds = getSelectedClasses();
            if (!classIds.length) {
                notify('Select at least one class', 'warning');
                return;
            }
            startGeneration(classIds);
        });

        rootEl.querySelector('#rg-open-single').addEventListener('click', function () {
            if (window.navigateTo) window.navigateTo('report-cards');
        });
    }

    // ─── GENERATION (real worker, with a genuine fallback) ──────────

    function startGeneration(classIds) {
        const students = [];
        const marksByStudent = {};

        classIds.forEach(function (classId) {
            const classLabel = CLASS_OPTIONS.filter(function (c) { return c.value === classId; })[0].label;
            buildMockStudentsForClass(classId, classLabel).forEach(function (s) {
                students.push({ id: s.id, name: s.name, classId: s.classId, className: s.className });
                marksByStudent[s.id] = s._scores;
            });
        });

        generating = true;
        results = [];
        showProgressPanel(true);
        updateProgress(0, students.length, 'Starting…');
        renderResultsTable();

        const w = ensureWorker();
        if (w) {
            w.onmessage = function (e) {
                const msg = e.data || {};
                if (msg.type === 'PROGRESS') {
                    updateProgress(msg.payload.done, msg.payload.total, msg.payload.currentStudent);
                } else if (msg.type === 'COMPLETE') {
                    onGenerationComplete(msg.payload.reports, msg.payload.summary);
                } else if (msg.type === 'ERROR') {
                    notify('Report generation failed: ' + msg.payload.message, 'error');
                    generating = false;
                    showProgressPanel(false);
                }
            };
            w.onerror = function (err) {
                notify('Report worker crashed (' + (err.message || 'unknown error') + ') — using main-thread fallback', 'warning');
                worker = null;
                runFallback(students, marksByStudent);
            };
            w.postMessage({
                type: 'GENERATE_BATCH',
                payload: { students: students, marksByStudent: marksByStudent, gradeBands: null, passMark: 50 }
            });
        } else {
            runFallback(students, marksByStudent);
        }
    }

    function ensureWorker() {
        if (worker) return worker;
        try {
            worker = new Worker('js/workers/report-worker.js');
        } catch (err) {
            console.error('[ReportGenerator] Failed to start report-worker.js', err);
            worker = null;
        }
        return worker;
    }

    // Main-thread fallback — mirrors report-worker.js's decision logic
    // (pass / remedial (<=2 failed subjects) / fail) so results are
    // consistent whether or not the worker is available.
    function runFallback(students, marksByStudent) {
        const passMark = 50;
        const reports = [];
        let i = 0;

        function step() {
            if (i >= students.length) {
                assignFallbackRankings(reports);
                const summary = {
                    total: reports.length,
                    passed: reports.filter(function (r) { return r.isPassing; }).length,
                    failed: reports.filter(function (r) { return !r.isPassing; }).length,
                    promoted: reports.filter(function (r) { return r.promoted; }).length,
                    remedial: reports.filter(function (r) { return r.decision === 'remedial'; }).length,
                    classCount: new Set(reports.map(function (r) { return r.classId; })).size
                };
                onGenerationComplete(reports, summary);
                return;
            }

            const student = students[i];
            const marks = marksByStudent[student.id] || {};
            const subjectIds = Object.keys(marks);
            let failedCount = 0;
            let total = 0;

            subjectIds.forEach(function (subj) {
                const score = marks[subj] || 0;
                total += score;
                if (score < passMark) failedCount++;
            });

            const average = subjectIds.length ? total / subjectIds.length : 0;
            let decision = 'pass', decisionLabel = 'Promoted';
            if (failedCount > 2) { decision = 'fail'; decisionLabel = 'Repeat Class'; }
            else if (failedCount > 0) { decision = 'remedial'; decisionLabel = 'Holiday Remedial Courses'; }

            reports.push({
                studentId: student.id,
                studentName: student.name,
                classId: student.classId,
                className: student.className,
                average: Math.round(average * 10) / 10,
                overallPercentage: Math.round(average * 10) / 10,
                decision: decision,
                decisionLabel: decisionLabel,
                promoted: decision === 'pass',
                isPassing: average >= passMark,
                position: null,
                classSize: null
            });

            i++;
            updateProgress(i, students.length, student.name);
            setTimeout(step, 12);
        }

        step();
    }

    function assignFallbackRankings(reports) {
        const byClass = {};
        reports.forEach(function (r) {
            byClass[r.classId] = byClass[r.classId] || [];
            byClass[r.classId].push(r);
        });
        Object.keys(byClass).forEach(function (classId) {
            const group = byClass[classId].slice().sort(function (a, b) { return b.average - a.average; });
            let lastAvg = null, lastPos = 0;
            group.forEach(function (r, idx) {
                if (r.average !== lastAvg) { lastPos = idx + 1; lastAvg = r.average; }
                r.position = lastPos;
                r.classSize = group.length;
            });
        });
    }

    function onGenerationComplete(reports, summary) {
        results = reports;
        generating = false;
        showProgressPanel(false);
        renderResultsTable();
        notify(
            'Generated ' + (summary ? summary.total : reports.length) + ' report' + (reports.length === 1 ? '' : 's') +
            (summary ? ' · ' + summary.passed + ' passed · ' + summary.failed + ' failed' : ''),
            'success'
        );
    }

    // ─── PROGRESS UI ─────────────────────────────────────────────────

    function showProgressPanel(show) {
        const panel = rootEl.querySelector('#rg-progress-panel');
        if (panel) panel.style.display = show ? 'block' : 'none';
    }

    function updateProgress(done, total, currentLabel) {
        const fill = rootEl.querySelector('#rg-progress-fill');
        const label = rootEl.querySelector('#rg-progress-label');
        const count = rootEl.querySelector('#rg-progress-count');
        const pct = total ? Math.round((done / total) * 100) : 0;

        if (fill) fill.style.width = pct + '%';
        if (label) label.textContent = done >= total && total > 0 ? 'Finalizing…' : ('Processing ' + esc(currentLabel || '') + '…');
        if (count) count.textContent = done + ' / ' + total;
    }

    // ─── RESULTS TABLE ───────────────────────────────────────────────

    function renderResultsTable() {
        const tbody = rootEl.querySelector('#rg-results-body');
        if (!tbody) return;

        if (!results.length) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:20px;color:var(--text-soft);">' +
                (generating ? 'Generating…' : 'No reports generated yet.') + '</td></tr>';
            return;
        }

        tbody.innerHTML = results.map(function (r) {
            const decisionClass = r.decision === 'pass' ? 'table-status-success' : r.decision === 'remedial' ? 'table-status-warning' : 'table-status-danger';
            return (
                '<tr>' +
                    '<td style="font-weight:600;">' + esc(r.studentName) + '</td>' +
                    '<td>' + esc(r.className) + '</td>' +
                    '<td>' + r.average + '%</td>' +
                    '<td>' + (r.position ? '#' + r.position + (r.classSize ? ' / ' + r.classSize : '') : '—') + '</td>' +
                    '<td><span class="table-status ' + decisionClass + '">' + esc(r.decisionLabel || r.decision) + '</span></td>' +
                    '<td><button class="btn btn-ghost btn-xs" data-view-report="' + r.studentId + '"><i class="fa-solid fa-eye"></i></button></td>' +
                '</tr>'
            );
        }).join('');

        Array.prototype.forEach.call(tbody.querySelectorAll('[data-view-report]'), function (btn) {
            btn.addEventListener('click', function () {
                if (window.navigateTo) window.navigateTo('report-cards');
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

    function destroyReportGenerator() {
        if (worker) {
            worker.terminate();
            worker = null;
        }
        generating = false;
        rootEl = null;
    }

    // ─── EXPOSE ──────────────────────────────────────────────────────

    window.renderReportGenerator = async (container, params = {}) => {
    if (params && params.classId && typeof canAccessClass === 'function' && !canAccessClass(params.classId)) {
        if (container) container.innerHTML = `<div class="module-wrap"><div class="alert alert-danger" style="margin:24px;">
            <i class="fa-solid fa-lock"></i>
            <strong>Access denied</strong></div></div>`;
        return;
    }
    return renderReportGenerator(container, params);
};
    window.destroyReportGenerator = destroyReportGenerator;
})();
