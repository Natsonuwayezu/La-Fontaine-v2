/* ═══════════════════════════════════════════════════════════════════
   js/modules/academics/annual-register.js
   ═══════════════════════════════════════════════════════════════════
   Rendered into #mainContent by core/router.js for 'annual-register'.

   The wide annual variant of the register: one column group per term
   (Term 1 / Term 2 / Term 3) per subject, plus a cumulative average,
   final position, and final decision. Uses class-register.css's
   register--annual modifier (min-width 1200px, .term-divider border).

   Loaded as a plain <script> — no import/export. Shared helpers read
   off window: esc, showToast, exportRegisterToCsv (optional).

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
    const TERMS = ['Term 1', 'Term 2', 'Term 3'];

    function buildMockStudents() {
        const names = [
            'HABIMANA Eric', 'INGABIRE Sarah', 'KAMALI Moses', 'MUGISHA Jean',
            'NIYONZIMA Claire', 'UWERA Grace', 'ISHIMWE Jean', 'MUKAMANA Ange',
            'MUGISHA Paul', 'NKURUNZIZA Alice', 'HABIMANA Jean', 'KAMALI Grace'
        ];

        let seed = 47;
        const rand = function () { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };

        return names.map(function (name, idx) {
            const termScores = {};
            TERMS.forEach(function (term) {
                termScores[term] = {};
                SUBJECTS.forEach(function (subj) {
                    termScores[term][subj] = Math.round(40 + rand() * 60);
                });
            });
            return { id: idx + 1, name: name, termScores: termScores };
        });
    }

    // ─── STATE ───────────────────────────────────────────────────────

    let state = { classId: 'p4a' };
    let rootEl = null;

    // ─── COMPUTATION ─────────────────────────────────────────────────

    function termAverage(student, term) {
        const vals = SUBJECTS.map(function (s) { return student.termScores[term][s]; });
        return vals.reduce(function (a, b) { return a + b; }, 0) / SUBJECTS.length;
    }

    function cumulativeAverage(student) {
        const termAvgs = TERMS.map(function (t) { return termAverage(student, t); });
        return termAvgs.reduce(function (a, b) { return a + b; }, 0) / termAvgs.length;
    }

    function computeRows() {
        const students = buildMockStudents();

        const withAvg = students.map(function (s) {
            return { student: s, cumulative: cumulativeAverage(s) };
        });

        const sorted = withAvg.slice().sort(function (a, b) { return b.cumulative - a.cumulative; });
        const positionMap = {};
        let lastAvg = null;
        let lastPos = 0;
        sorted.forEach(function (row, idx) {
            if (row.cumulative !== lastAvg) {
                lastPos = idx + 1;
                lastAvg = row.cumulative;
            }
            positionMap[row.student.id] = lastPos;
        });

        return withAvg.map(function (row) {
            const decision = row.cumulative >= 60 ? 'pass' : row.cumulative >= 50 ? 'remedial' : 'fail';
            return {
                student: row.student,
                cumulative: row.cumulative,
                position: positionMap[row.student.id],
                decision: decision
            };
        });
    }

    function decisionLabel(decision) {
        if (decision === 'pass') return 'Promoted';
        if (decision === 'remedial') return 'Remedial';
        return 'Repeat';
    }

    // ─── RENDER ──────────────────────────────────────────────────────

    function renderAnnualRegister(container) {
        if (!container) {
            console.warn('[AnnualRegister] No container provided');
            return;
        }
        rootEl = container;

        container.innerHTML =
            '<div class="annual-register-page">' +
                '<div class="register-toolbar">' +
                    '<select class="marks-toolbar__select" id="ar-class">' +
                        CLASS_OPTIONS.map(function (o) {
                            return '<option value="' + o.value + '"' + (o.value === state.classId ? ' selected' : '') + '>' + esc(o.label) + '</option>';
                        }).join('') +
                    '</select>' +
                    '<span class="register-layout-badge">Annual · All Terms</span>' +
                    '<span class="register-toolbar__spacer"></span>' +
                    '<button class="btn btn-outline-primary btn-sm" id="ar-export"><i class="fa-solid fa-file-export"></i> Export CSV</button>' +
                    '<button class="btn btn-primary btn-sm" id="ar-print"><i class="fa-solid fa-print"></i> Print</button>' +
                '</div>' +
                '<div class="register-wrap"><table class="register-table register--annual" id="ar-table"></table></div>' +
                '<div class="register-legend">' +
                    '<span class="register-legend-item"><span class="register-legend-swatch" style="background:#059669;"></span> Promoted (≥60%)</span>' +
                    '<span class="register-legend-item"><span class="register-legend-swatch" style="background:#d97706;"></span> Remedial (50–59%)</span>' +
                    '<span class="register-legend-item"><span class="register-legend-swatch" style="background:#dc2626;"></span> Repeat (&lt;50%)</span>' +
                '</div>' +
            '</div>';

        renderTable();
        wireToolbar();
    }

    function renderTable() {
        const table = rootEl.querySelector('#ar-table');
        if (!table) return;

        const rows = computeRows();

        // Sub-header row: per term, one <th> per subject (abbreviated) plus
        // a term-average column; the first cell of each new term gets the
        // .term-divider border.
        let subHeaderCells = '';
        TERMS.forEach(function (term, ti) {
            SUBJECTS.forEach(function (subj, si) {
                const isFirstOfTerm = si === 0;
                subHeaderCells += '<th' + (isFirstOfTerm && ti > 0 ? ' class="term-divider"' : '') + '>' + esc(subj.slice(0, 4)) + '</th>';
            });
            subHeaderCells += '<th class="computed-col">AVG</th>';
        });

        const thead = '<thead><tr>' +
            '<th class="reg-num-cell" rowspan="2">#</th>' +
            '<th class="reg-name-cell" rowspan="2" style="text-align:left;">STUDENT</th>' +
            TERMS.map(function (term, ti) {
                return '<th class="group-header' + (ti > 0 ? ' term-divider' : '') + '" colspan="' + (SUBJECTS.length + 1) + '">' + esc(term) + '</th>';
            }).join('') +
            '<th class="computed-col" rowspan="2">CUM. AVG</th>' +
            '<th class="computed-col" rowspan="2">POS</th>' +
            '<th class="computed-col" rowspan="2">DECISION</th>' +
        '</tr><tr>' + subHeaderCells + '</tr></thead>';

        const tbody = '<tbody>' + rows.map(function (r, idx) {
            let cells = '<td class="reg-num-cell">' + (idx + 1) + '</td>' +
                '<td class="reg-name-cell">' + esc(r.student.name) + '</td>';
            TERMS.forEach(function (term, ti) {
                SUBJECTS.forEach(function (subj, si) {
                    const isFirstOfTerm = si === 0;
                    cells += '<td' + (isFirstOfTerm && ti > 0 ? ' class="term-divider"' : '') + '>' + r.student.termScores[term][subj] + '</td>';
                });
                cells += '<td class="computed-col">' + termAverage(r.student, term).toFixed(1) + '</td>';
            });
            cells += '<td class="computed-col">' + r.cumulative.toFixed(1) + '%</td>' +
                '<td class="computed-col">' + r.position + '</td>' +
                '<td class="computed-col register-decision-cell ' + r.decision + '">' + decisionLabel(r.decision) + '</td>';
            return '<tr>' + cells + '</tr>';
        }).join('') + '</tbody>';

        table.innerHTML = thead + tbody;
    }

    // ─── TOOLBAR ─────────────────────────────────────────────────────

    function wireToolbar() {
        rootEl.querySelector('#ar-class').addEventListener('change', function (e) {
            state.classId = e.target.value;
            renderTable();
        });
        rootEl.querySelector('#ar-export').addEventListener('click', exportCsv);
        rootEl.querySelector('#ar-print').addEventListener('click', function () {
            window.print();
        });
    }

    // ─── EXPORT ──────────────────────────────────────────────────────

    function exportCsv() {
        const rows = computeRows();

        if (typeof window.exportRegisterToCsv === 'function') {
            window.exportRegisterToCsv(rows, SUBJECTS, state.classId + '-annual-register.csv');
            return;
        }

        const header = ['#', 'Student'];
        TERMS.forEach(function (term) {
            SUBJECTS.forEach(function (s) { header.push(term + ' ' + s); });
            header.push(term + ' Avg');
        });
        header.push('Cumulative Avg', 'Position', 'Decision');

        const lines = rows.map(function (r, idx) {
            const cells = [idx + 1, '"' + r.student.name + '"'];
            TERMS.forEach(function (term) {
                SUBJECTS.forEach(function (s) { cells.push(r.student.termScores[term][s]); });
                cells.push(termAverage(r.student, term).toFixed(1));
            });
            cells.push(r.cumulative.toFixed(1), r.position, decisionLabel(r.decision));
            return cells.join(',');
        });

        const csv = [header.join(',')].concat(lines).join('\n');
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = state.classId + '-annual-register.csv';
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);

        notify('Annual register exported', 'success');
    }

    // ─── TOAST HELPER ────────────────────────────────────────────────

    function notify(message, type) {
        if (typeof window.showToast === 'function') {
            window.showToast(message, type || 'info');
        }
    }

    // ─── DESTROY ─────────────────────────────────────────────────────

    function destroyAnnualRegister() {
        rootEl = null;
    }

    // ─── EXPOSE ──────────────────────────────────────────────────────

    window.renderAnnualRegister = async (container, params = {}) => {
    if (params && params.classId && typeof canAccessClass === 'function' && !canAccessClass(params.classId)) {
        if (container) container.innerHTML = `<div class="module-wrap"><div class="alert alert-danger" style="margin:24px;">
            <i class="fa-solid fa-lock"></i>
            <strong>Access denied</strong></div></div>`;
        return;
    }
    return renderAnnualRegister(container, params);
};
    window.destroyAnnualRegister = destroyAnnualRegister;
})();
