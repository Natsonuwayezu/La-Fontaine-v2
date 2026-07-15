/* ═══════════════════════════════════════════════════════════════════
   js/modules/academics/statistics.js
   ═══════════════════════════════════════════════════════════════════
   Rendered into #mainContent by core/router.js for 'statistics'.

   Academics-specific comparative statistics: a subject-by-class
   comparison table with inline mini-bars, a CSS-animated grade
   distribution chart, and a subject/class performance heatmap.
   Distinct from js/modules/analytics/ (broader dashboard analytics) —
   this is specifically the tabular academic stats view reached from
   the Academics hub, per the header comment in statistics.css.

   Styled with css/modules/statistics.css. Loaded as a plain
   <script> — no import/export.

   Last updated: 2026-07-14
   ═══════════════════════════════════════════════════════════════════ */

(function () {
    'use strict';

    const esc = window.esc || function (s) { return String(s == null ? '' : s); };

    // ─── MOCK DATA ─────────────────────────────────────────────────

    const CLASSES = ['P1', 'P2', 'P3', 'P4A', 'P5B', 'P6'];
    const SUBJECTS = ['Mathematics', 'English', 'Kinyarwanda', 'Science', 'French'];

    function buildComparisonMatrix() {
        // classAverages[class][subject] = average %
        let seed = 71;
        const rand = function () { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
        const matrix = {};
        CLASSES.forEach(function (cls) {
            matrix[cls] = {};
            SUBJECTS.forEach(function (subj) {
                matrix[cls][subj] = Math.round(48 + rand() * 48);
            });
        });
        return matrix;
    }

    const GRADE_BANDS = [
        { key: 'A+', min: 90, color: '#3a7a5a', count: 34 },
        { key: 'A', min: 80, color: '#5a9a7a', count: 58 },
        { key: 'B', min: 70, color: '#4a7a8a', count: 92 },
        { key: 'C', min: 60, color: '#b8983a', count: 87 },
        { key: 'D', min: 50, color: '#c48a3a', count: 41 },
        { key: 'F', min: 0, color: '#c45a4a', count: 18 }
    ];

    // ─── STATE ───────────────────────────────────────────────────────

    let matrix = buildComparisonMatrix();
    let rootEl = null;

    // ─── HELPERS ─────────────────────────────────────────────────────

    function heatColor(pct) {
        if (pct >= 85) return '#059669';
        if (pct >= 70) return '#4a7a8a';
        if (pct >= 60) return '#b8983a';
        if (pct >= 50) return '#c48a3a';
        return '#c45a4a';
    }

    function classAverage(cls) {
        const vals = SUBJECTS.map(function (s) { return matrix[cls][s]; });
        return vals.reduce(function (a, b) { return a + b; }, 0) / vals.length;
    }

    function subjectAverage(subj) {
        const vals = CLASSES.map(function (c) { return matrix[c][subj]; });
        return vals.reduce(function (a, b) { return a + b; }, 0) / vals.length;
    }

    function bestWorstForRow(subj) {
        const vals = CLASSES.map(function (c) { return { cls: c, val: matrix[c][subj] }; });
        const best = vals.reduce(function (a, b) { return b.val > a.val ? b : a; });
        const worst = vals.reduce(function (a, b) { return b.val < a.val ? b : a; });
        return { best: best.cls, worst: worst.cls };
    }

    // ─── RENDER ──────────────────────────────────────────────────────

    function renderStatistics(container) {
        if (!container) {
            console.warn('[Statistics] No container provided');
            return;
        }
        rootEl = container;

        const totalStudents = GRADE_BANDS.reduce(function (a, b) { return a + b.count; }, 0);
        const overallAvg = SUBJECTS.reduce(function (a, s) { return a + subjectAverage(s); }, 0) / SUBJECTS.length;

        container.innerHTML =
            '<div class="statistics-page">' +

                '<div class="stats-summary-row">' +
                    statTile(totalStudents, 'Students Assessed') +
                    statTile(overallAvg.toFixed(1) + '%', 'School Average') +
                    statTile(CLASSES.length, 'Classes') +
                    statTile(SUBJECTS.length, 'Subjects Tracked') +
                '</div>' +

                '<div class="card" style="padding:16px;margin-bottom:16px;">' +
                    '<div style="display:flex;align-items:center;gap:6px;font-weight:700;font-size:0.85rem;margin-bottom:10px;"><i class="fa-solid fa-table-cells" style="color:var(--academics-accent, #8b5cf6);"></i> Subject × Class Comparison</div>' +
                    '<div class="stats-compare-wrap"><table class="stats-compare-table" id="stat-compare-table"></table></div>' +
                '</div>' +

                '<div class="card" style="padding:16px;margin-bottom:16px;">' +
                    '<div style="display:flex;align-items:center;gap:6px;font-weight:700;font-size:0.85rem;margin-bottom:10px;"><i class="fa-solid fa-chart-simple" style="color:var(--academics-accent, #8b5cf6);"></i> Grade Distribution</div>' +
                    '<div class="grade-distribution" id="stat-grade-distribution"></div>' +
                '</div>' +

                '<div class="card" style="padding:16px;">' +
                    '<div style="display:flex;align-items:center;gap:6px;font-weight:700;font-size:0.85rem;margin-bottom:10px;"><i class="fa-solid fa-border-all" style="color:var(--academics-accent, #8b5cf6);"></i> Performance Heatmap</div>' +
                    '<div style="overflow-x:auto;"><table id="stat-heatmap-table" style="border-collapse:collapse;width:100%;min-width:520px;"></table></div>' +
                '</div>' +

            '</div>';

        renderCompareTable();
        renderGradeDistribution();
        renderHeatmap();
    }

    function statTile(value, label) {
        return (
            '<div class="stats-summary-tile">' +
                '<div class="stats-summary-tile__value">' + value + '</div>' +
                '<div class="stats-summary-tile__label">' + esc(label) + '</div>' +
            '</div>'
        );
    }

    function renderCompareTable() {
        const table = rootEl.querySelector('#stat-compare-table');
        if (!table) return;

        const thead = '<thead><tr><th class="label-cell">Subject</th>' +
            CLASSES.map(function (c) { return '<th>' + c + '</th>'; }).join('') +
            '<th>School Avg</th></tr></thead>';

        const tbody = '<tbody>' + SUBJECTS.map(function (subj) {
            const bw = bestWorstForRow(subj);
            const rowAvg = subjectAverage(subj);
            const cells = CLASSES.map(function (cls) {
                const val = matrix[cls][subj];
                const cls2 = cls === bw.best ? 'best' : cls === bw.worst ? 'worst' : '';
                return '<td class="' + cls2 + '">' + val + '%</td>';
            }).join('');
            return (
                '<tr>' +
                    '<td class="label-cell">' + esc(subj) + '</td>' +
                    cells +
                    '<td><div class="stats-inline-bar">' +
                        '<div class="stats-inline-bar__track"><div class="stats-inline-bar__fill" style="width:' + rowAvg + '%;"></div></div>' +
                        '<span class="stats-inline-bar__value">' + rowAvg.toFixed(0) + '%</span>' +
                    '</div></td>' +
                '</tr>'
            );
        }).join('') + '</tbody>';

        table.innerHTML = thead + tbody;
    }

    function renderGradeDistribution() {
        const el = rootEl.querySelector('#stat-grade-distribution');
        if (!el) return;

        const maxCount = Math.max.apply(null, GRADE_BANDS.map(function (b) { return b.count; }));

        el.innerHTML = GRADE_BANDS.map(function (b) {
            const heightPct = maxCount ? Math.round((b.count / maxCount) * 100) : 0;
            return (
                '<div class="grade-distribution__bar-col">' +
                    '<div class="grade-distribution__count">' + b.count + '</div>' +
                    '<div class="grade-distribution__bar" style="height:0%;background:' + b.color + ';" data-target-height="' + heightPct + '"></div>' +
                    '<div class="grade-distribution__label">' + b.key + '</div>' +
                '</div>'
            );
        }).join('');

        // Animate to target height on next frame (matches the CSS
        // transition declared on .grade-distribution__bar).
        requestAnimationFrame(function () {
            Array.prototype.forEach.call(el.querySelectorAll('.grade-distribution__bar'), function (bar) {
                bar.style.height = bar.dataset.targetHeight + '%';
            });
        });
    }

    function renderHeatmap() {
        const table = rootEl.querySelector('#stat-heatmap-table');
        if (!table) return;

        const thead = '<thead><tr><th style="padding:8px;text-align:left;">Subject</th>' +
            CLASSES.map(function (c) { return '<th style="padding:8px;">' + c + '</th>'; }).join('') +
            '</tr></thead>';

        const tbody = '<tbody>' + SUBJECTS.map(function (subj) {
            const cells = CLASSES.map(function (cls) {
                const val = matrix[cls][subj];
                return '<td style="padding:6px;text-align:center;"><div class="heatmap-cell" style="background:' + heatColor(val) + ';">' + val + '</div></td>';
            }).join('');
            return '<tr><td style="padding:8px;font-weight:600;">' + esc(subj) + '</td>' + cells + '</tr>';
        }).join('') + '</tbody>';

        table.innerHTML = thead + tbody;
    }

    // ─── DESTROY ─────────────────────────────────────────────────────

    function destroyStatistics() {
        rootEl = null;
    }

    // ─── EXPOSE ──────────────────────────────────────────────────────

    window.renderStatistics = renderStatistics;
    window.destroyStatistics = destroyStatistics;
})();
