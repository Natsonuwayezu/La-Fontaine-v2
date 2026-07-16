/* ═══════════════════════════════════════════════════════════════════
   js/modules/academics/rankings.js
   ═══════════════════════════════════════════════════════════════════
   Rendered into #mainContent by core/router.js for 'rankings'.

   Three ranking views (tabs): class ranking (students within one
   class), subject ranking (students within one class, one subject),
   and school ranking (classes against each other). Computation is
   delegated to window.RankingEngine (ranking-engine.js) so the
   tie-break logic lives in one place; a local fallback covers the
   case where that script hasn't loaded yet.

   Styled with css/modules/statistics.css (ranking-list, ranking-row,
   stats-summary-row) and css/components/tabs.css.

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

    const SUBJECTS = ['Mathematics', 'English', 'Kinyarwanda', 'Science'];

    function buildMockStudents() {
        const names = [
            'HABIMANA Eric', 'INGABIRE Sarah', 'KAMALI Moses', 'MUGISHA Jean',
            'NIYONZIMA Claire', 'UWERA Grace', 'ISHIMWE Jean', 'MUKAMANA Ange',
            'MUGISHA Paul', 'NKURUNZIZA Alice', 'HABIMANA Jean', 'KAMALI Grace'
        ];
        let seed = 61;
        const rand = function () { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };

        return names.map(function (name, idx) {
            const scores = {};
            SUBJECTS.forEach(function (s) { scores[s] = Math.round(40 + rand() * 60); });
            return { id: idx + 1, name: name, scores: scores };
        });
    }

    const SCHOOL_CLASSES = [
        { id: 'p3', name: 'Primary 3', average: 84.2 },
        { id: 'p6', name: 'Primary 6', average: 79.1 },
        { id: 'p1', name: 'Primary 1', average: 74.6 },
        { id: 'p5b', name: 'Primary 5B', average: 71.8 },
        { id: 'p2', name: 'Primary 2', average: 68.4 },
        { id: 'p4a', name: 'Primary 4A', average: 63.9 }
    ];

    // ─── STATE ───────────────────────────────────────────────────────

    let state = { tab: 'class', classId: 'p4a', subject: SUBJECTS[0] };
    let rootEl = null;

    // ─── FALLBACK RANKING (used only if ranking-engine.js isn't loaded) ─

    function fallbackAssignPositions(entries) {
        const sorted = entries.slice().sort(function (a, b) { return b.score - a.score; });
        const positions = {};
        let lastScore = null, lastPos = 0;
        sorted.forEach(function (e, idx) {
            if (e.score !== lastScore) { lastPos = idx + 1; lastScore = e.score; }
            positions[e.id] = lastPos;
        });
        return positions;
    }

    function getEngine() {
        return window.RankingEngine || {
            computeClassRanking: function (students, subjects) {
                const withAvg = students.map(function (s) {
                    const vals = subjects.map(function (subj) { return s.scores[subj] || 0; });
                    const total = vals.reduce(function (a, b) { return a + b; }, 0);
                    return { student: s, total: total, average: total / subjects.length };
                });
                const pos = fallbackAssignPositions(withAvg.map(function (w) { return { id: w.student.id, score: w.average }; }));
                return withAvg.map(function (w) { return Object.assign({}, w, { position: pos[w.student.id] }); })
                    .sort(function (a, b) { return a.position - b.position; });
            },
            computeSubjectRanking: function (students, subject) {
                const scored = students.map(function (s) { return { student: s, score: s.scores[subject] || 0 }; });
                const pos = fallbackAssignPositions(scored.map(function (s) { return { id: s.student.id, score: s.score }; }));
                return scored.map(function (s) { return Object.assign({}, s, { position: pos[s.student.id] }); })
                    .sort(function (a, b) { return a.position - b.position; });
            },
            computeSchoolRanking: function (classes) {
                const pos = fallbackAssignPositions(classes.map(function (c) { return { id: c.id, score: c.average }; }));
                return classes.map(function (c) { return Object.assign({}, c, { position: pos[c.id] }); })
                    .sort(function (a, b) { return a.position - b.position; });
            }
        };
    }

    // ─── RENDER ──────────────────────────────────────────────────────

    function renderRankings(container) {
        if (!container) {
            console.warn('[Rankings] No container provided');
            return;
        }
        rootEl = container;

        container.innerHTML =
            '<div class="rankings-page">' +
                '<div class="tabs tabs-pill" id="rk-tabs">' +
                    '<button class="tab-btn' + (state.tab === 'class' ? ' active' : '') + '" data-tab="class">Class Ranking</button>' +
                    '<button class="tab-btn' + (state.tab === 'subject' ? ' active' : '') + '" data-tab="subject">Subject Ranking</button>' +
                    '<button class="tab-btn' + (state.tab === 'school' ? ' active' : '') + '" data-tab="school">School Ranking</button>' +
                '</div>' +
                '<div class="stats-filter-row" id="rk-filters" style="margin-top:14px;"></div>' +
                '<div class="stats-summary-row" id="rk-summary"></div>' +
                '<div class="ranking-list" id="rk-list"></div>' +
            '</div>';

        renderFilters();
        renderView();
        wireTabs();
    }

    function renderFilters() {
        const el = rootEl.querySelector('#rk-filters');
        if (!el) return;

        if (state.tab === 'school') {
            el.innerHTML = '';
            return;
        }

        let html = '<select class="marks-toolbar__select" id="rk-class-select">' +
            CLASS_OPTIONS.map(function (c) { return '<option value="' + c.value + '"' + (c.value === state.classId ? ' selected' : '') + '>' + esc(c.label) + '</option>'; }).join('') +
            '</select>';

        if (state.tab === 'subject') {
            html += '<select class="marks-toolbar__select" id="rk-subject-select">' +
                SUBJECTS.map(function (s) { return '<option value="' + s + '"' + (s === state.subject ? ' selected' : '') + '>' + esc(s) + '</option>'; }).join('') +
                '</select>';
        }

        el.innerHTML = html;

        const classSelect = el.querySelector('#rk-class-select');
        if (classSelect) classSelect.addEventListener('change', function (e) { state.classId = e.target.value; renderView(); });

        const subjectSelect = el.querySelector('#rk-subject-select');
        if (subjectSelect) subjectSelect.addEventListener('change', function (e) { state.subject = e.target.value; renderView(); });
    }

    function renderView() {
        const engine = getEngine();
        const listEl = rootEl.querySelector('#rk-list');
        const summaryEl = rootEl.querySelector('#rk-summary');
        if (!listEl || !summaryEl) return;

        if (state.tab === 'class') {
            const students = buildMockStudents();
            const ranked = engine.computeClassRanking(students, SUBJECTS);
            renderSummary(summaryEl, [
                { value: ranked.length, label: 'Students' },
                { value: (ranked.reduce(function (a, r) { return a + r.average; }, 0) / ranked.length).toFixed(1) + '%', label: 'Class Average' },
                { value: ranked[0] ? ranked[0].average.toFixed(1) + '%' : '—', label: 'Top Score' }
            ]);
            listEl.innerHTML = ranked.map(function (r) {
                return rankRowHtml(r.position, r.student.name, r.average.toFixed(1) + '%');
            }).join('');
        } else if (state.tab === 'subject') {
            const students = buildMockStudents();
            const ranked = engine.computeSubjectRanking(students, state.subject);
            renderSummary(summaryEl, [
                { value: ranked.length, label: 'Students' },
                { value: (ranked.reduce(function (a, r) { return a + r.score; }, 0) / ranked.length).toFixed(1) + '%', label: 'Average (' + state.subject + ')' },
                { value: ranked[0] ? ranked[0].score + '%' : '—', label: 'Top Score' }
            ]);
            listEl.innerHTML = ranked.map(function (r) {
                return rankRowHtml(r.position, r.student.name, r.score + '%');
            }).join('');
        } else {
            const ranked = engine.computeSchoolRanking(SCHOOL_CLASSES);
            renderSummary(summaryEl, [
                { value: ranked.length, label: 'Classes' },
                { value: (ranked.reduce(function (a, r) { return a + r.average; }, 0) / ranked.length).toFixed(1) + '%', label: 'School Average' },
                { value: ranked[0] ? ranked[0].name : '—', label: 'Top Class' }
            ]);
            listEl.innerHTML = ranked.map(function (r) {
                return rankRowHtml(r.position, r.name, r.average.toFixed(1) + '%');
            }).join('');
        }
    }

    function rankRowHtml(position, name, scoreText) {
        return (
            '<div class="ranking-row">' +
                '<div class="ranking-row__pos">' + position + '</div>' +
                '<div class="ranking-row__name">' + esc(name) + '</div>' +
                '<div class="ranking-row__score">' + scoreText + '</div>' +
            '</div>'
        );
    }

    function renderSummary(el, tiles) {
        el.innerHTML = tiles.map(function (t) {
            return (
                '<div class="stats-summary-tile">' +
                    '<div class="stats-summary-tile__value">' + t.value + '</div>' +
                    '<div class="stats-summary-tile__label">' + esc(t.label) + '</div>' +
                '</div>'
            );
        }).join('');
    }

    // ─── TABS ────────────────────────────────────────────────────────

    function wireTabs() {
        rootEl.querySelector('#rk-tabs').addEventListener('click', function (e) {
            const btn = e.target.closest('.tab-btn');
            if (!btn) return;
            state.tab = btn.dataset.tab;
            Array.prototype.forEach.call(rootEl.querySelectorAll('.tab-btn'), function (b) {
                b.classList.toggle('active', b === btn);
            });
            renderFilters();
            renderView();
        });
    }

    // ─── DESTROY ─────────────────────────────────────────────────────

    function destroyRankings() {
        rootEl = null;
    }

    // ─── EXPOSE ──────────────────────────────────────────────────────

    window.renderRankings = renderRankings;
    window.destroyRankings = destroyRankings;
})();
