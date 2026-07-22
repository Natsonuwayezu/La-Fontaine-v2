/* ═══════════════════════════════════════════════════════════════════
   js/modules/academics/report-cards.js
   ═══════════════════════════════════════════════════════════════════
   Rendered into #mainContent by core/router.js for 'report-cards'.

   Single-student report card preview + print, matching the printed
   document 1:1 (css/modules/reports.css screen styles mirror
   css/print/report-cards-print.css so what you see here is what
   prints/PDFs). Ranking comes from window.RankingEngine
   (ranking-engine.js) when available.

   The QR block uses window.qrPlaceholderSVG() from core/utils.js if
   present (per the project's documented fallback for when
   js/integrations/qrcode.js hasn't been written yet); otherwise a
   plain placeholder box is shown instead of inventing a fake QR image.

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
        { value: 'p5b', label: 'Primary 5B' }
    ];

    const SUBJECTS = ['Mathematics', 'English', 'Kinyarwanda', 'Science', 'French', 'Social Studies'];

    function buildMockStudents() {
        const names = ['HABIMANA Eric', 'INGABIRE Sarah', 'KAMALI Moses', 'MUGISHA Jean', 'NIYONZIMA Claire'];
        let seed = 83;
        const rand = function () { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };

        return names.map(function (name, idx) {
            const scores = {};
            SUBJECTS.forEach(function (s) { scores[s] = Math.round(45 + rand() * 50); });
            const comments = {};
            SUBJECTS.forEach(function (s) {
                const avg = scores[s];
                comments[s] = avg >= 80 ? 'Excellent work' : avg >= 60 ? 'Good progress' : avg >= 50 ? 'Needs more practice' : 'Requires support';
            });
            return { id: idx + 1, name: name, admissionNo: 'ELF-' + (1000 + idx), scores: scores, comments: comments };
        });
    }

    // ─── STATE ───────────────────────────────────────────────────────

    let state = { classId: 'p4a', studentId: 1 };
    let rootEl = null;

    // ─── COMPUTATION ─────────────────────────────────────────────────

    function getStudents() {
        return buildMockStudents();
    }

    function getRanking(students) {
        if (window.RankingEngine) {
            return window.RankingEngine.computeClassRanking(students, SUBJECTS);
        }
        const withAvg = students.map(function (s) {
            const vals = SUBJECTS.map(function (subj) { return s.scores[subj]; });
            const total = vals.reduce(function (a, b) { return a + b; }, 0);
            return { student: s, total: total, average: total / SUBJECTS.length };
        });
        return withAvg.slice().sort(function (a, b) { return b.average - a.average; })
            .map(function (w, idx) { return Object.assign({}, w, { position: idx + 1 }); });
    }

    function decisionFor(average) {
        if (window.RankingEngine) return window.RankingEngine.classifyDecision(average);
        if (average >= 60) return 'pass';
        if (average >= 50) return 'remedial';
        return 'fail';
    }

    function decisionLabel(decision) {
        if (decision === 'pass') return 'PROMOTED TO NEXT CLASS';
        if (decision === 'remedial') return 'REMEDIAL REQUIRED';
        return 'RECOMMENDED FOR REPEAT';
    }

    // QR data URL — populated async before print
    let _qrDataUrl = null;
    let _qrToken = null;
    let _qrFilename = null;

    function qrMarkup(dataUrl) {
        if (dataUrl) {
            return (
                '<img src="' + dataUrl + '" alt="Verification QR code" ' +
                'width="72" height="72" style="border-radius:4px;"/>'
            );
        }
        // Fallback placeholder while async QR generates
        return (
            '<div style="width:72px;height:72px;border-radius:4px;' +
            'background:#e2e8f0;display:flex;align-items:center;' +
            'justify-content:center;color:#94a3b8;font-size:0.55rem;' +
            'text-align:center;line-height:1.3;">QR<br/>generating</div>'
        );
    }

    // ─── RENDER ──────────────────────────────────────────────────────

    function renderReportCards(container) {
        if (!container) {
            console.warn('[ReportCards] No container provided');
            return;
        }
        rootEl = container;

        const students = getStudents();

        container.innerHTML =
            '<div class="report-cards-page">' +
            '<div class="reports-toolbar">' +
            '<select class="marks-toolbar__select" id="rc-class">' +
            CLASS_OPTIONS.map(function (o) { return '<option value="' + o.value + '"' + (o.value === state.classId ? ' selected' : '') + '>' + esc(o.label) + '</option>'; }).join('') +
            '</select>' +
            '<select class="marks-toolbar__select" id="rc-student">' +
            students.map(function (s) { return '<option value="' + s.id + '"' + (s.id === state.studentId ? ' selected' : '') + '>' + esc(s.name) + '</option>'; }).join('') +
            '</select>' +
            '<span class="reports-toolbar__spacer"></span>' +
            '<button class="btn btn-outline-primary btn-sm" id="rc-open-generator"><i class="fa-solid fa-layer-group"></i> Batch Generate</button>' +
            '<button class="btn btn-primary btn-sm" id="rc-print"><i class="fa-solid fa-print"></i> Print</button>' +
            '</div>' +
            '<div id="rc-preview"></div>' +
            '</div>';

        renderPreview();
        wireToolbar();
    }

    function renderPreview() {
        const el = rootEl.querySelector('#rc-preview');
        if (!el) return;

        const students = getStudents();
        const student = students.filter(function (s) { return s.id === state.studentId; })[0] || students[0];
        const ranking = getRanking(students);
        const myRank = ranking.filter(function (r) { return r.student.id === student.id; })[0];
        const decision = decisionFor(myRank.average);
        const classLabel = CLASS_OPTIONS.filter(function (c) { return c.value === state.classId; })[0].label;
        const total = SUBJECTS.reduce(function (a, s) { return a + student.scores[s]; }, 0);

        el.innerHTML =
            '<div class="report-card">' +
            '<div class="report-header">' +
            '<div class="report-logo"><i class="fa-solid fa-graduation-cap" style="color:#fff;font-size:1.4rem;"></i></div>' +
            '<div>' +
            '<div class="report-school-name">École La Fontaine</div>' +
            '<div class="report-school-meta">Rubavu, Rwanda · Trilingual Nursery &amp; Primary School</div>' +
            '<div class="report-title">Academic Report Card</div>' +
            '</div>' +
            '</div>' +
            '<div class="report-info">' +
            infoItem('Student', student.name) +
            infoItem('Class', classLabel) +
            infoItem('Admission No.', student.admissionNo) +
            '</div>' +
            '<table class="report-subjects">' +
            '<thead><tr><th style="text-align:left;">Subject</th><th>Score</th><th>Grade</th><th>Comment</th></tr></thead>' +
            '<tbody>' + SUBJECTS.map(function (subj) {
                const score = student.scores[subj];
                return (
                    '<tr>' +
                    '<td class="subj-name">' + esc(subj) + '</td>' +
                    '<td>' + score + '%</td>' +
                    '<td>' + gradeLabel(score) + '</td>' +
                    '<td class="subj-comment">' + esc(student.comments[subj]) + '</td>' +
                    '</tr>'
                );
            }).join('') + '</tbody>' +
            '</table>' +
            '<div class="report-summary">' +
            summaryItem(total, 'Total') +
            summaryItem(myRank.average.toFixed(1) + '%', 'Average') +
            summaryItem('#' + myRank.position, 'Position') +
            summaryItem(gradeLabel(myRank.average), 'Overall Grade') +
            '</div>' +
            '<div class="report-decision-banner ' + decision + '">' + decisionLabel(decision) + '</div>' +
            '<div class="report-footer">' +
            '<div class="report-signature-line">Class Teacher</div>' +
            '<div class="report-qr-block">' + qrMarkup(_qrDataUrl) + '<span class="report-qr-block__label">Scan to verify this report card online</span></div>' +
            '<div class="report-signature-line">Head Teacher</div>' +
            '</div>' +
            '</div>';
    }

    function infoItem(k, v) {
        return '<div class="report-info-item"><div class="k">' + esc(k) + '</div><div class="v">' + esc(v) + '</div></div>';
    }

    function summaryItem(value, label) {
        return '<div class="report-summary-item"><div class="summary-value">' + value + '</div><div class="summary-label">' + esc(label) + '</div></div>';
    }

    function gradeLabel(score) {
        if (score >= 90) return 'A+';
        if (score >= 80) return 'A';
        if (score >= 70) return 'B';
        if (score >= 60) return 'C';
        if (score >= 50) return 'D';
        return 'F';
    }

    // ─── TOOLBAR ─────────────────────────────────────────────────────

    function wireToolbar() {
        rootEl.querySelector('#rc-class').addEventListener('change', function (e) {
            state.classId = e.target.value;
            renderPreview();
        });
        rootEl.querySelector('#rc-student').addEventListener('change', function (e) {
            state.studentId = parseInt(e.target.value, 10);
            renderPreview();
        });
        rootEl.querySelector('#rc-print').addEventListener('click', function () {
            window.print();
        });
        rootEl.querySelector('#rc-open-generator').addEventListener('click', function () {
            if (window.navigateTo) window.navigateTo('report-generator');
        });
    }

    // ─── DESTROY ─────────────────────────────────────────────────────

    function destroyReportCards() {
        rootEl = null;
    }

    // ─── EXPOSE ──────────────────────────────────────────────────────

    window.renderReportCards = renderReportCards;
    window.destroyReportCards = destroyReportCards;
})();
