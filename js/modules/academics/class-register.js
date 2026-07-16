/* ═══════════════════════════════════════════════════════════════════
   js/modules/academics/class-register.js
   ═══════════════════════════════════════════════════════════════════
   Rendered into #mainContent by core/router.js for 'class-register'.

   The class register grid — one row per student, one column group
   per subject, with computed columns (MG/EX/TOT/Position/Decision).
   Supports the 6 layout variants described in class-register.css:
   {Nursery, Primary} x {Pre-Midterm, Post-Midterm, Annual}. Nursery
   uses French column labels per the project's bilingual convention;
   Primary uses English. Print styling reuses these same class names
   (css/print/marksheets-print.css), so nothing here is print-specific.

   Loaded as a plain <script> — no import/export. Shared helpers are
   read off window: esc (core/utils.js), showToast (ui/toast.js),
   rankClassList (this module falls back to a local ranker if
   ranking-engine.js hasn't loaded yet), exportRegisterToCsv
   (register-export.js, optional — falls back to an inline CSV export
   if that module isn't loaded).

   Last updated: 2026-07-14
   ═══════════════════════════════════════════════════════════════════ */

(function () {
    'use strict';

    const esc = window.esc || function (s) { return String(s == null ? '' : s); };

    // ─── MOCK DATA ─────────────────────────────────────────────────

    const CLASS_OPTIONS = [
        { value: 'p4a', label: 'Primary 4A', section: 'primary' },
        { value: 'p3', label: 'Primary 3', section: 'primary' },
        { value: 'p5b', label: 'Primary 5B', section: 'primary' },
        { value: 'p6', label: 'Primary 6', section: 'primary' },
        { value: 'n1', label: 'Nursery 1 (Maternelle)', section: 'nursery' },
        { value: 'n2', label: 'Nursery 2 (Moyenne)', section: 'nursery' }
    ];

    const PHASE_OPTIONS = [
        { value: 'pre', label: 'Pre-Midterm' },
        { value: 'post', label: 'Post-Midterm' },
        { value: 'annual', label: 'Annual' }
    ];

    const SUBJECTS_PRIMARY = ['Mathematics', 'English', 'Kinyarwanda', 'Science', 'French', 'Social Studies'];
    const SUBJECTS_NURSERY = ['Langage', 'Motricité', 'Éveil', 'Arts'];

    function buildMockStudents(section) {
        const names = section === 'nursery'
            ? ['KAMANZI Aline', 'NDAYISHIMIYE Eric', 'UWIMANA Divine', 'HAKIZIMANA Josiane', 'MUGISHA Yves', 'IRAKOZE Sandrine']
            : ['HABIMANA Eric', 'INGABIRE Sarah', 'KAMALI Moses', 'MUGISHA Jean', 'NIYONZIMA Claire', 'UWERA Grace',
               'ISHIMWE Jean', 'MUKAMANA Ange', 'MUGISHA Paul', 'NKURUNZIZA Alice', 'HABIMANA Jean', 'KAMALI Grace',
               'MUGISHA Grace', 'UWIMANA Alice', 'BIZIMANA Eric', 'NSHIMIYE Paul', 'MUTONI Divine', 'KAGABO Fabrice',
               'UMUTONI Aline', 'NIYOMUGABO Eric', 'MUKANDAYISENGA Jo', 'HAKIZIMANA Paul', 'IRADUKUNDA Sonia',
               'RUTAYISIRE Eric', 'UWASE Diane', 'NDAYISABA Alex', 'KWIZERA Blaise', 'AKIMANA Belise'];

        const subjects = section === 'nursery' ? SUBJECTS_NURSERY : SUBJECTS_PRIMARY;
        let seed = 31;
        const rand = function () { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };

        return names.map(function (name, idx) {
            const scores = {};
            subjects.forEach(function (subj) {
                scores[subj] = Math.round(40 + rand() * 60);
            });
            return { id: idx + 1, name: name, scores: scores };
        });
    }

    // ─── STATE ───────────────────────────────────────────────────────

    let state = {
        classId: 'p4a',
        phase: 'post'
    };
    let rootEl = null;

    // ─── COMPUTATION HELPERS ────────────────────────────────────────

    function currentSection() {
        const cls = CLASS_OPTIONS.filter(function (c) { return c.value === state.classId; })[0];
        return cls ? cls.section : 'primary';
    }

    function currentSubjects() {
        return currentSection() === 'nursery' ? SUBJECTS_NURSERY : SUBJECTS_PRIMARY;
    }

    function computeRows() {
        const students = buildMockStudents(currentSection());
        const subjects = currentSubjects();

        const withTotals = students.map(function (s) {
            const values = subjects.map(function (subj) { return s.scores[subj]; });
            const total = values.reduce(function (a, b) { return a + b; }, 0);
            const avg = total / subjects.length;
            return { student: s, total: total, avg: avg };
        });

        // Rank by average descending, ties share the same position
        const sorted = withTotals.slice().sort(function (a, b) { return b.avg - a.avg; });
        const positionMap = {};
        let lastAvg = null;
        let lastPos = 0;
        sorted.forEach(function (row, idx) {
            if (row.avg !== lastAvg) {
                lastPos = idx + 1;
                lastAvg = row.avg;
            }
            positionMap[row.student.id] = lastPos;
        });

        return withTotals.map(function (row) {
            const decision = row.avg >= 60 ? 'pass' : row.avg >= 50 ? 'remedial' : 'fail';
            return {
                student: row.student,
                total: row.total,
                avg: row.avg,
                position: positionMap[row.student.id],
                decision: decision
            };
        });
    }

    function decisionLabel(decision) {
        if (decision === 'pass') return 'Pass';
        if (decision === 'remedial') return 'Remedial';
        return 'Fail';
    }

    // ─── RENDER ──────────────────────────────────────────────────────

    function renderClassRegister(container) {
        if (!container) {
            console.warn('[ClassRegister] No container provided');
            return;
        }
        rootEl = container;

        container.innerHTML =
            '<div class="class-register-page">' +
                '<div class="register-toolbar">' +
                    '<select class="marks-toolbar__select" id="cr-class">' +
                        CLASS_OPTIONS.map(function (o) {
                            return '<option value="' + o.value + '"' + (o.value === state.classId ? ' selected' : '') + '>' + esc(o.label) + '</option>';
                        }).join('') +
                    '</select>' +
                    '<select class="marks-toolbar__select" id="cr-phase">' +
                        PHASE_OPTIONS.map(function (o) {
                            return '<option value="' + o.value + '"' + (o.value === state.phase ? ' selected' : '') + '>' + esc(o.label) + '</option>';
                        }).join('') +
                    '</select>' +
                    '<span class="register-layout-badge" id="cr-layout-badge"></span>' +
                    '<span class="register-toolbar__spacer"></span>' +
                    '<button class="btn btn-outline-primary btn-sm" id="cr-export"><i class="fa-solid fa-file-export"></i> Export CSV</button>' +
                    '<button class="btn btn-primary btn-sm" id="cr-print"><i class="fa-solid fa-print"></i> Print</button>' +
                '</div>' +
                '<div class="register-wrap"><table class="register-table" id="cr-table"></table></div>' +
                '<div class="register-legend">' +
                    '<span class="register-legend-item"><span class="register-legend-swatch" style="background:#059669;"></span> Pass (≥60%)</span>' +
                    '<span class="register-legend-item"><span class="register-legend-swatch" style="background:#d97706;"></span> Remedial (50–59%)</span>' +
                    '<span class="register-legend-item"><span class="register-legend-swatch" style="background:#dc2626;"></span> Fail (&lt;50%)</span>' +
                '</div>' +
            '</div>';

        renderTable();
        wireToolbar();
    }

    function renderTable() {
        const table = rootEl.querySelector('#cr-table');
        const badge = rootEl.querySelector('#cr-layout-badge');
        if (!table) return;

        const section = currentSection();
        const isNursery = section === 'nursery';
        const subjects = currentSubjects();
        const rows = computeRows();
        const phaseLabel = PHASE_OPTIONS.filter(function (p) { return p.value === state.phase; })[0].label;

        if (badge) badge.textContent = (isNursery ? 'Nursery' : 'Primary') + ' · ' + phaseLabel;

        table.className = 'register-table' + (isNursery ? ' register--nursery' : '') + (state.phase === 'annual' ? ' register--annual' : '');

        const mgLabel = isNursery ? 'MOY' : 'AVG';
        const totLabel = isNursery ? 'TOT' : 'TOT';
        const posLabel = isNursery ? 'RANG' : 'POS';
        const decLabel = isNursery ? 'DÉCISION' : 'DECISION';
        const nameLabel = isNursery ? 'ÉLÈVE' : 'STUDENT';
        const numLabel = '#';

        let thead =
            '<thead><tr>' +
                '<th class="reg-num-cell">' + numLabel + '</th>' +
                '<th class="reg-name-cell" style="text-align:left;">' + nameLabel + '</th>' +
                subjects.map(function (s) { return '<th>' + esc(s) + '</th>'; }).join('') +
                '<th class="computed-col">' + totLabel + '</th>' +
                '<th class="computed-col">' + mgLabel + '</th>' +
                '<th class="computed-col">' + posLabel + '</th>' +
                '<th class="computed-col">' + decLabel + '</th>' +
            '</tr></thead>';

        let tbody = '<tbody>' + rows.map(function (r, idx) {
            return (
                '<tr>' +
                    '<td class="reg-num-cell">' + (idx + 1) + '</td>' +
                    '<td class="reg-name-cell">' + esc(r.student.name) + '</td>' +
                    subjects.map(function (s) { return '<td>' + r.student.scores[s] + '</td>'; }).join('') +
                    '<td class="computed-col">' + r.total + '</td>' +
                    '<td class="computed-col">' + r.avg.toFixed(1) + '%</td>' +
                    '<td class="computed-col">' + r.position + '</td>' +
                    '<td class="computed-col register-decision-cell ' + r.decision + '">' + decisionLabel(r.decision) + '</td>' +
                '</tr>'
            );
        }).join('') + '</tbody>';

        table.innerHTML = thead + tbody;
    }

    // ─── TOOLBAR ─────────────────────────────────────────────────────

    function wireToolbar() {
        rootEl.querySelector('#cr-class').addEventListener('change', function (e) {
            state.classId = e.target.value;
            renderTable();
        });
        rootEl.querySelector('#cr-phase').addEventListener('change', function (e) {
            state.phase = e.target.value;
            renderTable();
        });
        rootEl.querySelector('#cr-export').addEventListener('click', exportCsv);
        rootEl.querySelector('#cr-print').addEventListener('click', function () {
            window.print();
        });
    }

    // ─── EXPORT ──────────────────────────────────────────────────────

    function exportCsv() {
        if (typeof window.exportRegisterToCsv === 'function') {
            window.exportRegisterToCsv(computeRows(), currentSubjects(), state.classId + '-' + state.phase + '-register.csv');
            return;
        }

        const subjects = currentSubjects();
        const rows = computeRows();
        const header = ['#', 'Student'].concat(subjects).concat(['Total', 'Average', 'Position', 'Decision']).join(',');
        const lines = rows.map(function (r, idx) {
            const cells = [idx + 1, '"' + r.student.name + '"'].concat(subjects.map(function (s) { return r.student.scores[s]; }))
                .concat([r.total, r.avg.toFixed(1), r.position, decisionLabel(r.decision)]);
            return cells.join(',');
        });
        const csv = [header].concat(lines).join('\n');

        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = state.classId + '-' + state.phase + '-register.csv';
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);

        notify('Register exported', 'success');
    }

    // ─── TOAST HELPER ────────────────────────────────────────────────

    function notify(message, type) {
        if (typeof window.showToast === 'function') {
            window.showToast(message, type || 'info');
        }
    }

    // ─── DESTROY ─────────────────────────────────────────────────────

    function destroyClassRegister() {
        rootEl = null;
    }

    // ─── EXPOSE ──────────────────────────────────────────────────────

    window.renderClassRegister = renderClassRegister;
    window.destroyClassRegister = destroyClassRegister;
})();
