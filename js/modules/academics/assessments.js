/* ═══════════════════════════════════════════════════════════════════
   js/modules/analytics/analytics.js
   ═══════════════════════════════════════════════════════════════════
   Rendered into #mainContent by core/router.js for 'analytics'
   ("Academic Analytics" — registered under the Dashboard hub in
   navigation.js, alongside admin/accountant/teacher/finance
   dashboards).

   Styled with css/modules/analytics.css, which defines its OWN
   self-contained theme layer (--analytics---chart - custom
   properties) independent of the base design tokens.Two distinct
   button conventions exist in that file and are used exactly as
    defined, not normalized:
- .analytics - page - header.actions.btn / .btn.primary(compound)
    - .analytics - filters - bar.filter - btn / .filter - btn.primary(compound)
    - .analytics - filter - modal.filter - panel.filter - footer
        .btn - primary / .btn - ghost / .btn - danger(dash - suffixed)
   This file intentionally does NOT reproduce analytics.css's
    .analytics - topbar(brand mark, greeting, theme toggle) — that
   would duplicate the real app shell's topbar (ui/topbar.js) once
this renders inside #mainContent. .analytics - page - header is the
   actual page - level header for this context.

   Loaded as a plain < script > — no import/export. Uses
window.RankingEngine(academics / ranking - engine.js) for the top
   performers list if it's loaded; falls back to a local ranker
otherwise.

   Last updated: 2026-07 - 14
   ═══════════════════════════════════════════════════════════════════ */

    (function () {
        'use strict';

        const esc = window.esc || function (s) { return String(s == null ? '' : s); };

        // ─── MOCK DATA ─────────────────────────────────────────────────

        const CLASS_OPTIONS = [
            { value: 'all', label: 'All Classes' },
            { value: 'p1', label: 'Primary 1' }, { value: 'p2', label: 'Primary 2' },
            { value: 'p3', label: 'Primary 3' }, { value: 'p4a', label: 'Primary 4A' },
            { value: 'p5b', label: 'Primary 5B' }, { value: 'p6', label: 'Primary 6' }
        ];
        const TERM_OPTIONS = [
            { value: 'current', label: 'Current Term' },
            { value: 'term2', label: 'Term 2' },
            { value: 'term1', label: 'Term 1' }
        ];
        const SUBJECT_OPTIONS = [
            { value: 'all', label: 'All Subjects' },
            { value: 'math', label: 'Mathematics' }, { value: 'eng', label: 'English' },
            { value: 'kiny', label: 'Kinyarwanda' }, { value: 'sci', label: 'Science' }
        ];

        const TREND_LABELS = ['Quiz 1', 'Quiz 2', 'Quiz 3', 'Mid-Term', 'Quiz 4', 'Exam 1'];

        function seededRand(seed) {
            let s = seed;
            return function () { s = (s * 9301 + 49297) % 233280; return s / 233280; };
        }

        function filterSeed(filters) {
            const str = filters.classId + '|' + filters.term + '|' + filters.subject;
            let h = 7;
            for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) % 100000;
            return h + 11;
        }

        function getTrendData(filters) {
            const rand = seededRand(filterSeed(filters));
            let base = 62 + rand() * 10;
            return TREND_LABELS.map(function () {
                base += (rand() - 0.3) * 5;
                base = Math.max(45, Math.min(95, base));
                return Math.round(base);
            });
        }

        function getGradeDistribution(filters) {
            const rand = seededRand(filterSeed(filters) + 3);
            const palette = [
                { label: 'A+', color: '#5a8a6a' }, { label: 'A', color: '#7aaa8a' },
                { label: 'B', color: '#6a8aba' }, { label: 'C', color: '#c9a84c' },
                { label: 'D', color: '#c57586' }, { label: 'F', color: '#c45a4a' }
            ];
            return palette.map(function (g) { return Object.assign({}, g, { value: Math.round(15 + rand() * 80) }); });
        }

        const ALL_SUBJECTS = [
            { subject: 'Mathematics', key: 'math' }, { subject: 'English', key: 'eng' },
            { subject: 'Kinyarwanda', key: 'kiny' }, { subject: 'Science', key: 'sci' },
            { subject: 'French', key: 'fr' }, { subject: 'Social Studies', key: 'soc' }
        ];

        function getSubjectComparison(filters) {
            const rand = seededRand(filterSeed(filters) + 5);
            const rows = ALL_SUBJECTS.map(function (s) {
                return { subject: s.subject, key: s.key, avg: Math.round((50 + rand() * 45) * 10) / 10, trend: Math.round((rand() - 0.4) * 8 * 10) / 10 };
            });
            return filters.subject === 'all' ? rows : rows.filter(function (r) { return r.key === filters.subject; });
        }

        const ALL_TOP_PERFORMERS = [
            { id: 1, name: 'HABIMANA Eric', classKey: 'p3', classId: 'Primary 3', average: 96 },
            { id: 2, name: 'MUGISHA Jean', classKey: 'p4a', classId: 'Primary 4A', average: 92 },
            { id: 3, name: 'KAMALI Moses', classKey: 'p6', classId: 'Primary 6', average: 88 },
            { id: 4, name: 'UWERA Grace', classKey: 'p5b', classId: 'Primary 5B', average: 85 },
            { id: 5, name: 'INGABIRE Sarah', classKey: 'p2', classId: 'Primary 2', average: 78 },
            { id: 6, name: 'NIYONZIMA Claire', classKey: 'p1', classId: 'Primary 1', average: 74 }
        ];

        function getTopPerformers(filters) {
            const pool = filters.classId === 'all' ? ALL_TOP_PERFORMERS : ALL_TOP_PERFORMERS.filter(function (s) { return s.classKey === filters.classId; });
            return pool.length ? pool : ALL_TOP_PERFORMERS.slice(0, 3);
        }

        const ALL_AT_RISK = [
            { id: 1, name: 'MUGISHA Grace', classKey: 'p1', classId: 'Primary 1', average: 42 },
            { id: 2, name: 'HABIMANA Jean', classKey: 'p1', classId: 'Primary 1', average: 48 },
            { id: 3, name: 'KAMALI Jean', classKey: 'p2', classId: 'Primary 2', average: 52 },
            { id: 4, name: 'UWERA Grace', classKey: 'p2', classId: 'Primary 2', average: 55 },
            { id: 5, name: 'MUGISHA Paul', classKey: 'p3', classId: 'Primary 3', average: 46 },
            { id: 6, name: 'ISHIMWE Jean', classKey: 'p4a', classId: 'Primary 4A', average: 51 }
        ];

        function getAtRisk(filters) {
            return filters.classId === 'all' ? ALL_AT_RISK : ALL_AT_RISK.filter(function (s) { return s.classKey === filters.classId; });
        }

        const HEATMAP_CLASSES = ['P1', 'P2', 'P3', 'P4A', 'P5B', 'P6'];
        const HEATMAP_SUBJECTS = ['Mathematics', 'English', 'Kinyarwanda', 'Science'];

        function buildHeatmapMatrix() {
            let seed = 41;
            const rand = function () { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
            const matrix = {};
            HEATMAP_SUBJECTS.forEach(function (subj) {
                matrix[subj] = {};
                HEATMAP_CLASSES.forEach(function (cls) {
                    matrix[subj][cls] = Math.round(48 + rand() * 48);
                });
            });
            return matrix;
        }

        // ─── STATE ───────────────────────────────────────────────────────

        let filters = getInitialFilters();

        function getInitialFilters() {
            if (typeof window.getAnalyticsSettings === 'function') {
                const s = window.getAnalyticsSettings();
                return { classId: s.defaultClassId, term: s.defaultTerm, subject: s.defaultSubject };
            }
            return { classId: 'all', term: 'current', subject: 'all' };
        }

        function getAtRiskThreshold() {
            if (typeof window.getAnalyticsSettings === 'function') {
                return window.getAnalyticsSettings().atRiskThreshold;
            }
            return 50;
        }
        let rootEl = null;
        let chartInstances = { trend: null, grade: null };

        // ─── HELPERS ─────────────────────────────────────────────────────

        function cellClass(pct) {
            if (pct >= 80) return 'cell-excellent';
            if (pct >= 65) return 'cell-good';
            if (pct >= 50) return 'cell-fair';
            return 'cell-poor';
        }

        function heatmapColor(pct) {
            if (pct >= 80) return 'rgba(90, 138, 106, 0.40)';
            if (pct >= 65) return 'rgba(106, 138, 186, 0.40)';
            if (pct >= 50) return 'rgba(201, 168, 76, 0.40)';
            return 'rgba(196, 90, 74, 0.40)';
        }

        function getRanked(list) {
            if (window.RankingEngine) {
                const positions = window.RankingEngine.assignPositions(list.map(function (s) { return { id: s.id, score: s.average }; }));
                return list.slice().sort(function (a, b) { return positions.get(a.id) - positions.get(b.id); });
            }
            return list.slice().sort(function (a, b) { return b.average - a.average; });
        }

        // ─── RENDER ──────────────────────────────────────────────────────

        function renderAnalytics(container) {
            if (!container) {
                console.warn('[Analytics] No container provided');
                return;
            }
            rootEl = container;

            container.innerHTML =
                '<div class="analytics-page">' +
                '<div class="analytics-app">' +

                '<div class="analytics-page-header">' +
                '<div class="title"><i class="fa-solid fa-chart-line"></i> Academic Analytics</div>' +
                '<div class="actions">' +
                '<button class="btn" id="an-settings"><i class="fa-solid fa-sliders"></i> Settings</button>' +
                '<button class="btn" id="an-export"><i class="fa-solid fa-file-export"></i> Export</button>' +
                '<button class="btn primary" id="an-refresh"><i class="fa-solid fa-rotate"></i> Refresh</button>' +
                '</div>' +
                '</div>' +

                '<div class="analytics-filters-bar">' +
                '<div class="filter-group"><label>Class</label>' +
                '<select id="an-class">' + CLASS_OPTIONS.map(function (o) { return '<option value="' + o.value + '"' + (o.value === filters.classId ? ' selected' : '') + '>' + esc(o.label) + '</option>'; }).join('') + '</select>' +
                '</div>' +
                '<div class="filter-group"><label>Term</label>' +
                '<select id="an-term">' + TERM_OPTIONS.map(function (o) { return '<option value="' + o.value + '"' + (o.value === filters.term ? ' selected' : '') + '>' + esc(o.label) + '</option>'; }).join('') + '</select>' +
                '</div>' +
                '<div class="filter-group"><label>Subject</label>' +
                '<select id="an-subject">' + SUBJECT_OPTIONS.map(function (o) { return '<option value="' + o.value + '"' + (o.value === filters.subject ? ' selected' : '') + '>' + esc(o.label) + '</option>'; }).join('') + '</select>' +
                '</div>' +
                '<button class="filter-btn" id="an-more-filters"><i class="fa-solid fa-sliders"></i> More Filters <span class="badge" id="an-filter-badge">0</span></button>' +
                '</div>' +

                '<div class="analysis-grid">' +

                '<div class="analysis-card">' +
                '<div class="card-head"><span class="title"><i class="fa-solid fa-chart-line"></i> Performance Trend</span><span class="badge">Last 6 Assessments</span></div>' +
                '<div class="chart-container tall"><canvas id="an-trend-chart"></canvas></div>' +
                '</div>' +

                '<div class="analysis-card">' +
                '<div class="card-head"><span class="title"><i class="fa-solid fa-chart-pie"></i> Grade Distribution</span><span class="badge" id="an-grade-count"></span></div>' +
                '<div class="chart-container tall"><canvas id="an-grade-chart"></canvas></div>' +
                '</div>' +

                '<div class="analysis-card">' +
                '<div class="card-head"><span class="title"><i class="fa-solid fa-table-cells"></i> Subject Comparison</span><span class="badge">This Term</span></div>' +
                '<div class="analytics-table-wrap"><table id="an-subject-table"></table></div>' +
                '</div>' +

                '<div class="analysis-card">' +
                '<div class="card-head"><span class="title"><i class="fa-solid fa-medal"></i> Top Performers</span><button class="action-btn" data-nav="rankings">View All →</button></div>' +
                '<div class="analytics-table-wrap"><table id="an-top-table"></table></div>' +
                '</div>' +

                '<div class="analysis-card">' +
                '<div class="card-head"><span class="title"><i class="fa-solid fa-triangle-exclamation"></i> At-Risk Students</span><button class="action-btn" data-nav="statistics">View All →</button></div>' +
                '<div class="analytics-table-wrap"><table id="an-risk-table"></table></div>' +
                '</div>' +

                '<div class="analysis-card full">' +
                '<div class="card-head"><span class="title"><i class="fa-solid fa-border-all"></i> Class × Subject Heatmap</span><span class="badge">School-wide</span></div>' +
                '<div class="analytics-table-wrap"><table class="heatmap-table" id="an-heatmap"></table></div>' +
                '<div class="heatmap-legend">' +
                '<span class="item"><span class="swatch excellent"></span> ≥80%</span>' +
                '<span class="item"><span class="swatch good"></span> 65–79%</span>' +
                '<span class="item"><span class="swatch fair"></span> 50–64%</span>' +
                '<span class="item"><span class="swatch poor"></span> &lt;50%</span>' +
                '</div>' +
                '</div>' +

                '</div>' +

                '<div class="analytics-footer">ECOLE LA FONTAINE · Academic Analytics <span>·</span> v9.0</div>' +

                '</div>' +

                '<div class="analytics-filter-modal" id="an-filter-modal">' +
                '<div class="filter-panel">' +
                '<div class="filter-header"><h2><i class="fa-solid fa-sliders"></i> Advanced Filters</h2><button class="close-filter" id="an-modal-close"><i class="fa-solid fa-xmark"></i></button></div>' +
                '<div class="filter-body">' +
                '<div class="field"><label>Class</label><select id="an-modal-class">' + CLASS_OPTIONS.map(function (o) { return '<option value="' + o.value + '">' + esc(o.label) + '</option>'; }).join('') + '</select></div>' +
                '<div class="field"><label>Subject</label><select id="an-modal-subject">' + SUBJECT_OPTIONS.map(function (o) { return '<option value="' + o.value + '">' + esc(o.label) + '</option>'; }).join('') + '</select></div>' +
                '<div class="field full"><label>Compare Against</label><select id="an-modal-compare"><option value="none">No comparison</option><option value="previous-term">Previous Term</option><option value="school-average">School Average</option></select></div>' +
                '</div>' +
                '<div class="filter-footer">' +
                '<button class="btn-primary" id="an-modal-apply">Apply Filters</button>' +
                '<button class="btn-ghost" id="an-modal-reset">Reset</button>' +
                '<button class="btn-danger" id="an-modal-cancel" style="margin-left:auto;">Cancel</button>' +
                '</div>' +
                '</div>' +
                '</div>';

            renderView();
            wireHeader();
            wireFilters();
            wireModal();
        }

        function renderView() {
            renderSubjectTable();
            renderTopTable();
            renderRiskTable();
            renderHeatmap();
            renderTrendChart();
            renderGradeChart();
        }

        // ─── TABLES ──────────────────────────────────────────────────────

        function renderSubjectTable() {
            const table = rootEl.querySelector('#an-subject-table');
            if (!table) return;
            table.innerHTML =
                '<thead><tr><th>Subject</th><th>Average</th><th>Trend</th></tr></thead>' +
                '<tbody>' + getSubjectComparison(filters).map(function (s) {
                    const trendIcon = s.trend > 0 ? 'fa-arrow-trend-up' : s.trend < 0 ? 'fa-arrow-trend-down' : 'fa-minus';
                    const trendClass = s.trend > 0 ? 'cell-excellent' : s.trend < 0 ? 'cell-poor' : '';
                    return '<tr><td>' + esc(s.subject) + '</td><td class="' + cellClass(s.avg) + '">' + s.avg.toFixed(1) + '%</td>' +
                        '<td class="' + trendClass + '"><i class="fa-solid ' + trendIcon + '"></i> ' + (s.trend > 0 ? '+' : '') + s.trend + '%</td></tr>';
                }).join('') + '</tbody>';
        }

        function renderTopTable() {
            const table = rootEl.querySelector('#an-top-table');
            if (!table) return;
            const ranked = getRanked(getTopPerformers(filters));
            const medalClasses = ['gold', 'silver', 'bronze'];
            table.innerHTML =
                '<thead><tr><th>#</th><th>Student</th><th>Class</th><th>Average</th></tr></thead>' +
                '<tbody>' + ranked.map(function (s, idx) {
                    const medalCls = medalClasses[idx] || '';
                    return '<tr><td><span class="rank-badge ' + medalCls + '">' + (idx + 1) + '</span></td>' +
                        '<td>' + esc(s.name) + '</td><td>' + esc(s.classId) + '</td><td class="cell-excellent">' + s.average + '%</td></tr>';
                }).join('') + '</tbody>';
        }

        function renderRiskTable() {
            const table = rootEl.querySelector('#an-risk-table');
            if (!table) return;
            const threshold = getAtRiskThreshold();
            table.innerHTML =
                '<thead><tr><th>Student</th><th>Class</th><th>Average</th><th>Status</th></tr></thead>' +
                '<tbody>' + getAtRisk(filters).map(function (s) {
                    const status = s.average < threshold ? 'fail' : 'warn';
                    return '<tr><td>' + esc(s.name) + '</td><td>' + esc(s.classId) + '</td><td class="cell-poor">' + s.average + '%</td>' +
                        '<td><span class="status-badge ' + status + '">' + (status === 'fail' ? 'Failing' : 'At Risk') + '</span></td></tr>';
                }).join('') + '</tbody>';
        }

        function renderHeatmap() {
            const table = rootEl.querySelector('#an-heatmap');
            if (!table) return;
            const matrix = buildHeatmapMatrix();

            const thead = '<thead><tr><th></th>' + HEATMAP_CLASSES.map(function (c) { return '<th>' + c + '</th>'; }).join('') + '</tr></thead>';
            const tbody = '<tbody>' + HEATMAP_SUBJECTS.map(function (subj) {
                const rowAvg = HEATMAP_CLASSES.reduce(function (a, c) { return a + matrix[subj][c]; }, 0) / HEATMAP_CLASSES.length;
                return '<tr><td class="cell-label">' + esc(subj) + '</td>' +
                    HEATMAP_CLASSES.map(function (c) {
                        const val = matrix[subj][c];
                        return '<td style="background:' + heatmapColor(val) + ';">' + val + '</td>';
                    }).join('') +
                    '</tr>';
            }).join('') + '</tbody>';

            table.innerHTML = thead + tbody;
        }

        // ─── CHARTS ──────────────────────────────────────────────────────

        function renderTrendChart() {
            const canvas = rootEl.querySelector('#an-trend-chart');
            if (!canvas) return;
            if (chartInstances.trend) chartInstances.trend.destroy();
            const chartType = (typeof window.getAnalyticsSettings === 'function' ? window.getAnalyticsSettings().trendChartType : 'line') || 'line';
            chartInstances.trend = new Chart(canvas.getContext('2d'), {
                type: chartType,
                data: {
                    labels: TREND_LABELS,
                    datasets: [{
                        label: 'School Average (%)',
                        data: getTrendData(filters),
                        borderColor: '#6a8aba',
                        backgroundColor: chartType === 'bar' ? '#6a8aba' : 'rgba(106, 138, 186, 0.15)',
                        borderRadius: chartType === 'bar' ? 4 : 0,
                        fill: chartType === 'line',
                        tension: 0.35,
                        pointRadius: chartType === 'line' ? 3 : 0
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { display: false } },
                    scales: {
                        y: { beginAtZero: false, min: 50, max: 100, grid: { color: 'rgba(240,235,230,0.04)' }, ticks: { callback: function (v) { return v + '%'; } } },
                        x: { grid: { display: false } }
                    }
                }
            });
        }

        function renderGradeChart() {
            const canvas = rootEl.querySelector('#an-grade-chart');
            if (!canvas) return;
            if (chartInstances.grade) chartInstances.grade.destroy();
            const dist = getGradeDistribution(filters);
            const countBadge = rootEl.querySelector('#an-grade-count');
            if (countBadge) countBadge.textContent = dist.reduce(function (a, g) { return a + g.value; }, 0) + ' students';
            chartInstances.grade = new Chart(canvas.getContext('2d'), {
                type: 'doughnut',
                data: {
                    labels: dist.map(function (g) { return g.label; }),
                    datasets: [{
                        data: dist.map(function (g) { return g.value; }),
                        backgroundColor: dist.map(function (g) { return g.color; }),
                        borderWidth: 2
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    cutout: '65%',
                    plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, padding: 6 } } }
                }
            });
        }

        // ─── HEADER / EXPORT / REFRESH ───────────────────────────────────

        function wireHeader() {
            rootEl.querySelector('#an-settings').addEventListener('click', function () {
                if (typeof window.openAnalyticsSettings === 'function') {
                    window.openAnalyticsSettings();
                } else {
                    notify('Analytics settings module not loaded', 'warning');
                }
            });

            rootEl.querySelector('#an-export').addEventListener('click', function () {
                const header = 'Subject,Average,Trend';
                const lines = getSubjectComparison(filters).map(function (s) { return '"' + s.subject + '",' + s.avg.toFixed(1) + ',' + s.trend; });
                const csv = [header].concat(lines).join('\n');
                const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
                const url = URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = url;
                link.download = 'analytics-subject-comparison.csv';
                document.body.appendChild(link);
                link.click();
                link.remove();
                URL.revokeObjectURL(url);
                notify('Analytics exported', 'success');
            });

            rootEl.querySelector('#an-refresh').addEventListener('click', function () {
                renderView();
                notify('Analytics refreshed', 'success');
            });

            Array.prototype.forEach.call(rootEl.querySelectorAll('[data-nav]'), function (el) {
                el.style.cursor = 'pointer';
                el.addEventListener('click', function () {
                    if (window.navigateTo) window.navigateTo(el.dataset.nav);
                });
            });
        }

        // ─── FILTERS BAR ─────────────────────────────────────────────────

        function wireFilters() {
            rootEl.querySelector('#an-class').addEventListener('change', function (e) { filters.classId = e.target.value; renderView(); });
            rootEl.querySelector('#an-term').addEventListener('change', function (e) { filters.term = e.target.value; renderView(); });
            rootEl.querySelector('#an-subject').addEventListener('change', function (e) { filters.subject = e.target.value; renderView(); });
            rootEl.querySelector('#an-more-filters').addEventListener('click', function () {
                rootEl.querySelector('#an-filter-modal').classList.add('show');
            });
        }

        // ─── FILTER MODAL ────────────────────────────────────────────────

        function wireModal() {
            const modal = rootEl.querySelector('#an-filter-modal');
            rootEl.querySelector('#an-modal-close').addEventListener('click', function () { modal.classList.remove('show'); });
            rootEl.querySelector('#an-modal-cancel').addEventListener('click', function () { modal.classList.remove('show'); });
            modal.addEventListener('click', function (e) { if (e.target === modal) modal.classList.remove('show'); });

            rootEl.querySelector('#an-modal-apply').addEventListener('click', function () {
                const modalClass = rootEl.querySelector('#an-modal-class').value;
                const modalSubject = rootEl.querySelector('#an-modal-subject').value;
                const compareMode = rootEl.querySelector('#an-modal-compare').value;

                filters.classId = modalClass;
                filters.subject = modalSubject;

                // Keep the top filters bar in sync so it doesn't silently
                // disagree with what the modal just applied.
                const topClass = rootEl.querySelector('#an-class');
                const topSubject = rootEl.querySelector('#an-subject');
                if (topClass) topClass.value = modalClass;
                if (topSubject) topSubject.value = modalSubject;

                const activeCount = (modalClass !== 'all' ? 1 : 0) + (modalSubject !== 'all' ? 1 : 0) + (compareMode !== 'none' ? 1 : 0);
                rootEl.querySelector('#an-filter-badge').textContent = activeCount;

                modal.classList.remove('show');
                renderView();
                notify('Filters applied', 'success');
            });

            rootEl.querySelector('#an-modal-reset').addEventListener('click', function () {
                rootEl.querySelector('#an-modal-class').value = 'all';
                rootEl.querySelector('#an-modal-subject').value = 'all';
                rootEl.querySelector('#an-modal-compare').value = 'none';
                rootEl.querySelector('#an-filter-badge').textContent = '0';
            });
        }

        // ─── TOAST HELPER ────────────────────────────────────────────────

        function notify(message, type) {
            if (typeof window.showToast === 'function') {
                window.showToast(message, type || 'info');
            }
        }

        // ─── DESTROY ─────────────────────────────────────────────────────

        function destroyAnalytics() {
            if (chartInstances.trend) { chartInstances.trend.destroy(); chartInstances.trend = null; }
            if (chartInstances.grade) { chartInstances.grade.destroy(); chartInstances.grade = null; }
            rootEl = null;
        }

        // ─── EXPOSE ──────────────────────────────────────────────────────

        window.renderAnalytics = renderAnalytics;
        window.destroyAnalytics = destroyAnalytics;
    })();