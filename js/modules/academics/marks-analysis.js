/* ═══════════════════════════════════════════════════════════════════
   js/modules/academics/marks-analysis.js
   ═══════════════════════════════════════════════════════════════════
   Rendered into #mainContent by core/router.js for 'marks-analysis'.

   Deeper analysis of recorded marks than marks-database.js's raw
   browsing view: a score trend line across assessments (Chart.js —
   a real chart, not a CSS-only bar), a subject comparison table with
   inline bars, and a weakest/strongest subject summary. Distinct
   from js/modules/academics/statistics.js (class-vs-class comparison)
   — this is specifically trend-over-time analysis for one class.

   Styled with css/modules/statistics.css (stats-compare-table,
   stats-inline-bar, stats-summary-row).

   Loaded as a plain <script> — no import/export. Requires Chart.js
   to already be loaded by index.html (it is, for the dashboards).

   Last updated: 2026-07-14
   ═══════════════════════════════════════════════════════════════════ */

(function () {
    'use strict';

    const esc = window.esc || function (s) { return String(s == null ? '' : s); };

    // ─── MOCK DATA ─────────────────────────────────────────────────

    const CLASS_OPTIONS = [
        { value: 'p4a', label: 'Primary 4A' },
        { value: 'p3', label: 'Primary 3' },
        { value: 'p5b', label: 'Primary 5B' }
    ];

    const SUBJECTS = ['Mathematics', 'English', 'Kinyarwanda', 'Science', 'French'];
    const ASSESSMENT_LABELS = ['Quiz 1', 'Quiz 2', 'Quiz 3', 'Mid-Term', 'Quiz 4', 'Exam 1'];

    function buildTrendData(classId) {
        let seed = classId.length * 53 + 3;
        const rand = function () { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };

        const bySubject = {};
        SUBJECTS.forEach(function (subj) {
            let base = 55 + rand() * 15;
            bySubject[subj] = ASSESSMENT_LABELS.map(function () {
                base += (rand() - 0.35) * 6;
                base = Math.max(35, Math.min(96, base));
                return Math.round(base);
            });
        });
        return bySubject;
    }

    // ─── STATE ───────────────────────────────────────────────────────

    let state = { classId: 'p4a', focusSubject: 'all' };
    let rootEl = null;
    let chartInstance = null;

    // ─── RENDER ──────────────────────────────────────────────────────

    function renderMarksAnalysis(container) {
        if (!container) {
            console.warn('[MarksAnalysis] No container provided');
            return;
        }
        rootEl = container;

        container.innerHTML =
            '<div class="marks-analysis-page">' +
                '<div class="marks-toolbar">' +
                    '<select class="marks-toolbar__select" id="ma-class">' +
                        CLASS_OPTIONS.map(function (o) { return '<option value="' + o.value + '"' + (o.value === state.classId ? ' selected' : '') + '>' + esc(o.label) + '</option>'; }).join('') +
                    '</select>' +
                    '<select class="marks-toolbar__select" id="ma-subject">' +
                        '<option value="all">All Subjects</option>' +
                        SUBJECTS.map(function (s) { return '<option value="' + s + '"' + (s === state.focusSubject ? ' selected' : '') + '>' + esc(s) + '</option>'; }).join('') +
                    '</select>' +
                '</div>' +

                '<div class="stats-summary-row" id="ma-summary"></div>' +

                '<div class="card" style="padding:16px;margin-bottom:16px;">' +
                    '<div style="display:flex;align-items:center;gap:6px;font-weight:700;font-size:0.85rem;margin-bottom:10px;"><i class="fa-solid fa-chart-line" style="color:var(--academics-accent, #8b5cf6);"></i> Score Trend Across Assessments</div>' +
                    '<div style="position:relative;height:260px;"><canvas id="ma-trend-chart"></canvas></div>' +
                '</div>' +

                '<div class="card" style="padding:16px;">' +
                    '<div style="display:flex;align-items:center;gap:6px;font-weight:700;font-size:0.85rem;margin-bottom:10px;"><i class="fa-solid fa-table-cells" style="color:var(--academics-accent, #8b5cf6);"></i> Subject Comparison (Latest Assessment)</div>' +
                    '<table class="stats-compare-table" id="ma-compare-table"></table>' +
                '</div>' +
            '</div>';

        renderView();
        wireToolbar();
    }

    function renderView() {
        const bySubject = buildTrendData(state.classId);
        renderSummary(bySubject);
        renderTrendChart(bySubject);
        renderCompareTable(bySubject);
    }

    function renderSummary(bySubject) {
        const el = rootEl.querySelector('#ma-summary');
        if (!el) return;

        const latestBySubject = SUBJECTS.map(function (s) {
            return { subject: s, value: bySubject[s][bySubject[s].length - 1] };
        });
        const strongest = latestBySubject.reduce(function (a, b) { return b.value > a.value ? b : a; });
        const weakest = latestBySubject.reduce(function (a, b) { return b.value < a.value ? b : a; });
        const overallAvg = latestBySubject.reduce(function (a, s) { return a + s.value; }, 0) / latestBySubject.length;

        el.innerHTML = [
            { value: overallAvg.toFixed(1) + '%', label: 'Class Average (Latest)' },
            { value: strongest.subject, label: 'Strongest Subject (' + strongest.value + '%)' },
            { value: weakest.subject, label: 'Weakest Subject (' + weakest.value + '%)' },
            { value: ASSESSMENT_LABELS.length, label: 'Assessments Tracked' }
        ].map(function (t) {
            return (
                '<div class="stats-summary-tile">' +
                    '<div class="stats-summary-tile__value">' + t.value + '</div>' +
                    '<div class="stats-summary-tile__label">' + esc(t.label) + '</div>' +
                '</div>'
            );
        }).join('');
    }

    function renderTrendChart(bySubject) {
        const canvas = rootEl.querySelector('#ma-trend-chart');
        if (!canvas) return;

        const palette = ['#3a7a5a', '#4a7a8a', '#b8983a', '#c45a4a', '#8b5cf6'];
        const subjectsToShow = state.focusSubject === 'all' ? SUBJECTS : [state.focusSubject];

        const datasets = subjectsToShow.map(function (subj, idx) {
            const color = palette[SUBJECTS.indexOf(subj) % palette.length] || palette[idx % palette.length];
            return {
                label: subj,
                data: bySubject[subj],
                borderColor: color,
                backgroundColor: color,
                tension: 0.35,
                pointRadius: 3,
                fill: false
            };
        });

        if (chartInstance) chartInstance.destroy();
        chartInstance = new Chart(canvas.getContext('2d'), {
            type: 'line',
            data: { labels: ASSESSMENT_LABELS, datasets: datasets },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: subjectsToShow.length > 1, position: 'bottom', labels: { boxWidth: 10, padding: 6 } }
                },
                scales: {
                    y: { beginAtZero: false, min: 30, max: 100, grid: { color: 'rgba(26,20,16,0.04)' }, ticks: { callback: function (v) { return v + '%'; } } },
                    x: { grid: { display: false } }
                }
            }
        });
    }

    function renderCompareTable(bySubject) {
        const table = rootEl.querySelector('#ma-compare-table');
        if (!table) return;

        const thead = '<thead><tr><th class="label-cell">Subject</th><th>Latest Score</th><th>Trend</th></tr></thead>';
        const tbody = '<tbody>' + SUBJECTS.map(function (subj) {
            const series = bySubject[subj];
            const latest = series[series.length - 1];
            const prev = series[series.length - 2] != null ? series[series.length - 2] : latest;
            const delta = latest - prev;
            const trendIcon = delta > 0 ? 'fa-arrow-trend-up' : delta < 0 ? 'fa-arrow-trend-down' : 'fa-minus';
            const trendColor = delta > 0 ? '#059669' : delta < 0 ? '#c45a4a' : '#94a3b8';
            return (
                '<tr>' +
                    '<td class="label-cell">' + esc(subj) + '</td>' +
                    '<td><div class="stats-inline-bar">' +
                        '<div class="stats-inline-bar__track"><div class="stats-inline-bar__fill" style="width:' + latest + '%;"></div></div>' +
                        '<span class="stats-inline-bar__value">' + latest + '%</span>' +
                    '</div></td>' +
                    '<td style="color:' + trendColor + ';"><i class="fa-solid ' + trendIcon + '"></i> ' + (delta > 0 ? '+' : '') + delta + '</td>' +
                '</tr>'
            );
        }).join('') + '</tbody>';

        table.innerHTML = thead + tbody;
    }

    // ─── TOOLBAR ─────────────────────────────────────────────────────

    function wireToolbar() {
        rootEl.querySelector('#ma-class').addEventListener('change', function (e) {
            state.classId = e.target.value;
            renderView();
        });
        rootEl.querySelector('#ma-subject').addEventListener('change', function (e) {
            state.focusSubject = e.target.value;
            renderView();
        });
    }

    // ─── DESTROY ─────────────────────────────────────────────────────

    function destroyMarksAnalysis() {
        if (chartInstance) {
            chartInstance.destroy();
            chartInstance = null;
        }
        rootEl = null;
    }

    // ─── EXPOSE ──────────────────────────────────────────────────────

    window.renderMarksAnalysis = renderMarksAnalysis;
    window.destroyMarksAnalysis = destroyMarksAnalysis;
})();
