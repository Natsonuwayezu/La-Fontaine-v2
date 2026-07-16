/* ═══════════════════════════════════════════════════════════════════
   js/modules/academics/transcripts.js
   ═══════════════════════════════════════════════════════════════════
   Rendered into #mainContent by core/router.js for 'transcripts'.

   Multi-year academic transcript — one .transcript-year-block per
   year attended, each with its own subject table, followed by an
   overall cumulative summary. Reuses report-cards.js's header/
   subject-table/summary/QR building blocks (same reports.css
   classes) since a transcript is structurally "several report cards'
   worth of subject data stacked under one document shell."

   Loaded as a plain <script> — no import/export.

   Last updated: 2026-07-14
   ═══════════════════════════════════════════════════════════════════ */

(function () {
    'use strict';

    const esc = window.esc || function (s) { return String(s == null ? '' : s); };

    // ─── MOCK DATA ─────────────────────────────────────────────────

    const STUDENT_OPTIONS = [
        { value: 1, label: 'HABIMANA Eric', admissionNo: 'ELF-1000' },
        { value: 2, label: 'INGABIRE Sarah', admissionNo: 'ELF-1001' },
        { value: 3, label: 'KAMALI Moses', admissionNo: 'ELF-1002' }
    ];

    const SUBJECTS = ['Mathematics', 'English', 'Kinyarwanda', 'Science', 'French'];
    const YEARS = ['2023–2024 (Primary 2)', '2024–2025 (Primary 3)', '2025–2026 (Primary 4A)'];

    function buildTranscript(studentId) {
        let seed = studentId * 131 + 7;
        const rand = function () { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };

        return YEARS.map(function (year) {
            const scores = {};
            SUBJECTS.forEach(function (s) { scores[s] = Math.round(45 + rand() * 50); });
            const total = SUBJECTS.reduce(function (a, s) { return a + scores[s]; }, 0);
            const average = total / SUBJECTS.length;
            return { year: year, scores: scores, average: average };
        });
    }

    function gradeLabel(score) {
        if (score >= 90) return 'A+';
        if (score >= 80) return 'A';
        if (score >= 70) return 'B';
        if (score >= 60) return 'C';
        if (score >= 50) return 'D';
        return 'F';
    }

    function decisionFor(average) {
        if (window.RankingEngine) return window.RankingEngine.classifyDecision(average);
        if (average >= 60) return 'pass';
        if (average >= 50) return 'remedial';
        return 'fail';
    }

    // ─── STATE ───────────────────────────────────────────────────────

    let state = { studentId: 1 };
    let rootEl = null;

    // ─── RENDER ──────────────────────────────────────────────────────

    function renderTranscripts(container) {
        if (!container) {
            console.warn('[Transcripts] No container provided');
            return;
        }
        rootEl = container;

        container.innerHTML =
            '<div class="transcripts-page">' +
                '<div class="reports-toolbar">' +
                    '<select class="marks-toolbar__select" id="tr-student">' +
                        STUDENT_OPTIONS.map(function (s) { return '<option value="' + s.value + '"' + (s.value === state.studentId ? ' selected' : '') + '>' + esc(s.label) + '</option>'; }).join('') +
                    '</select>' +
                    '<span class="reports-toolbar__spacer"></span>' +
                    '<button class="btn btn-primary btn-sm" id="tr-print"><i class="fa-solid fa-print"></i> Print</button>' +
                '</div>' +
                '<div id="tr-preview"></div>' +
            '</div>';

        renderPreview();
        wireToolbar();
    }

    function renderPreview() {
        const el = rootEl.querySelector('#tr-preview');
        if (!el) return;

        const student = STUDENT_OPTIONS.filter(function (s) { return s.value === state.studentId; })[0];
        const years = buildTranscript(state.studentId);
        const cumulativeAvg = years.reduce(function (a, y) { return a + y.average; }, 0) / years.length;
        const decision = decisionFor(cumulativeAvg);

        el.innerHTML =
            '<div class="transcript-doc">' +
                '<div class="report-header">' +
                    '<div class="report-logo"><i class="fa-solid fa-graduation-cap" style="color:#fff;font-size:1.4rem;"></i></div>' +
                    '<div>' +
                        '<div class="report-school-name">École La Fontaine</div>' +
                        '<div class="report-school-meta">Rubavu, Rwanda · Trilingual Nursery &amp; Primary School</div>' +
                        '<div class="report-title">Academic Transcript</div>' +
                    '</div>' +
                '</div>' +
                '<div class="report-info">' +
                    '<div class="report-info-item"><div class="k">Student</div><div class="v">' + esc(student.label) + '</div></div>' +
                    '<div class="report-info-item"><div class="k">Admission No.</div><div class="v">' + esc(student.admissionNo) + '</div></div>' +
                    '<div class="report-info-item"><div class="k">Years Covered</div><div class="v">' + years.length + '</div></div>' +
                '</div>' +

                years.map(function (yearData) {
                    return (
                        '<div class="transcript-year-block">' +
                            '<div class="transcript-year-title">' + esc(yearData.year) + '</div>' +
                            '<table class="report-subjects">' +
                                '<thead><tr><th style="text-align:left;">Subject</th><th>Score</th><th>Grade</th></tr></thead>' +
                                '<tbody>' + SUBJECTS.map(function (subj) {
                                    const score = yearData.scores[subj];
                                    return '<tr><td class="subj-name">' + esc(subj) + '</td><td>' + score + '%</td><td>' + gradeLabel(score) + '</td></tr>';
                                }).join('') + '</tbody>' +
                            '</table>' +
                            '<div style="text-align:right;font-size:0.75rem;margin-top:4px;color:#64748b;">Year Average: <strong>' + yearData.average.toFixed(1) + '%</strong> (' + gradeLabel(yearData.average) + ')</div>' +
                        '</div>'
                    );
                }).join('') +

                '<div class="report-summary">' +
                    '<div class="report-summary-item"><div class="summary-value">' + years.length + '</div><div class="summary-label">Years</div></div>' +
                    '<div class="report-summary-item"><div class="summary-value">' + cumulativeAvg.toFixed(1) + '%</div><div class="summary-label">Cumulative Average</div></div>' +
                    '<div class="report-summary-item"><div class="summary-value">' + gradeLabel(cumulativeAvg) + '</div><div class="summary-label">Overall Grade</div></div>' +
                '</div>' +
                '<div class="report-decision-banner ' + decision + '">' + (decision === 'pass' ? 'STRONG ACADEMIC STANDING' : decision === 'remedial' ? 'SATISFACTORY STANDING' : 'BELOW EXPECTED STANDING') + '</div>' +
                '<div class="report-footer">' +
                    '<div class="report-signature-line">Registrar</div>' +
                    '<div class="report-qr-block">' + qrMarkup() + '<span class="report-qr-block__label">Scan to verify this transcript online</span></div>' +
                    '<div class="report-signature-line">Head Teacher</div>' +
                '</div>' +
            '</div>';
    }

    function qrMarkup() {
        if (typeof window.qrPlaceholderSVG === 'function') {
            return '<img src="' + window.qrPlaceholderSVG() + '" alt="Verification QR code" />';
        }
        return '<div style="width:72px;height:72px;border-radius:4px;background:#e2e8f0;display:flex;align-items:center;justify-content:center;color:#94a3b8;font-size:0.6rem;text-align:center;">QR pending</div>';
    }

    // ─── TOOLBAR ─────────────────────────────────────────────────────

    function wireToolbar() {
        rootEl.querySelector('#tr-student').addEventListener('change', function (e) {
            state.studentId = parseInt(e.target.value, 10);
            renderPreview();
        });
        rootEl.querySelector('#tr-print').addEventListener('click', function () {
            window.print();
        });
    }

    // ─── DESTROY ─────────────────────────────────────────────────────

    function destroyTranscripts() {
        rootEl = null;
    }

    // ─── EXPOSE ──────────────────────────────────────────────────────

    window.renderTranscripts = renderTranscripts;
    window.destroyTranscripts = destroyTranscripts;
})();
