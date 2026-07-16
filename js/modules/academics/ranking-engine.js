/* ═══════════════════════════════════════════════════════════════════
   js/modules/academics/ranking-engine.js
   ═══════════════════════════════════════════════════════════════════
   Pure computation module — no render(container), nothing routed to
   directly. Exposes window.RankingEngine, a small set of ranking
   functions shared by rankings.js, class-register.js, and
   report-cards.js so ranking/tie-break logic lives in exactly one
   place instead of being reimplemented per screen.

   Loaded as a plain <script> — no import/export.

   Last updated: 2026-07-14
   ═══════════════════════════════════════════════════════════════════ */

(function () {
    'use strict';

    /**
     * Assigns 1-based positions to a list of { id, score } entries.
     * Ties share the same position; the position sequence skips ahead
     * by the tie-group size (standard competition ranking: 1,2,2,4).
     * @param {Array<{id:*, score:number}>} entries
     * @returns {Map<*, number>} id -> position
     */
    function assignPositions(entries) {
        const sorted = entries.slice().sort(function (a, b) { return b.score - a.score; });
        const positions = new Map();
        let lastScore = null;
        let lastPos = 0;

        sorted.forEach(function (entry, idx) {
            if (entry.score !== lastScore) {
                lastPos = idx + 1;
                lastScore = entry.score;
            }
            positions.set(entry.id, lastPos);
        });

        return positions;
    }

    /**
     * Ranks students within a single class by average score across a
     * set of subjects.
     * @param {Array<{id:*, name:string, scores:Object<string,number>}>} students
     * @param {string[]} subjects
     * @returns {Array} students sorted by rank, each annotated with
     *          { average, position, total }
     */
    function computeClassRanking(students, subjects) {
        const withAverages = students.map(function (s) {
            const values = subjects.map(function (subj) { return s.scores[subj] || 0; });
            const total = values.reduce(function (a, b) { return a + b; }, 0);
            return { student: s, total: total, average: total / subjects.length };
        });

        const positions = assignPositions(withAverages.map(function (w) {
            return { id: w.student.id, score: w.average };
        }));

        return withAverages
            .map(function (w) {
                return {
                    student: w.student,
                    total: w.total,
                    average: w.average,
                    position: positions.get(w.student.id)
                };
            })
            .sort(function (a, b) { return a.position - b.position; });
    }

    /**
     * Ranks classes against each other by their own average score
     * (e.g. for a school-wide "best performing class" list).
     * @param {Array<{id:*, name:string, average:number}>} classes
     * @returns {Array} classes sorted by rank, annotated with { position }
     */
    function computeSchoolRanking(classes) {
        const positions = assignPositions(classes.map(function (c) {
            return { id: c.id, score: c.average };
        }));

        return classes
            .map(function (c) {
                return Object.assign({}, c, { position: positions.get(c.id) });
            })
            .sort(function (a, b) { return a.position - b.position; });
    }

    /**
     * Ranks students by their score in a single subject only.
     * @param {Array<{id:*, name:string, scores:Object<string,number>}>} students
     * @param {string} subject
     * @returns {Array} students sorted by rank in that subject
     */
    function computeSubjectRanking(students, subject) {
        const scored = students.map(function (s) {
            return { student: s, score: s.scores[subject] || 0 };
        });

        const positions = assignPositions(scored.map(function (s) {
            return { id: s.student.id, score: s.score };
        }));

        return scored
            .map(function (s) {
                return { student: s.student, score: s.score, position: positions.get(s.student.id) };
            })
            .sort(function (a, b) { return a.position - b.position; });
    }

    /**
     * Simple decision classifier shared by register/report views —
     * kept here so the pass/remedial/fail thresholds are defined once.
     * @param {number} average percentage 0-100
     * @returns {'pass'|'remedial'|'fail'}
     */
    function classifyDecision(average) {
        if (average >= 60) return 'pass';
        if (average >= 50) return 'remedial';
        return 'fail';
    }

    // ─── EXPOSE ──────────────────────────────────────────────────────

    window.RankingEngine = {
        assignPositions: assignPositions,
        computeClassRanking: computeClassRanking,
        computeSchoolRanking: computeSchoolRanking,
        computeSubjectRanking: computeSubjectRanking,
        classifyDecision: classifyDecision
    };
})();
