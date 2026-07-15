/* ═══════════════════════════════════════════════════════════════════
   js/modules/staff/teacher-performance.js
   ═══════════════════════════════════════════════════════════════════
   Rendered into #app-main by core/router.js for the 'teacher-performance'
   nav item. Per-teacher completion rate (marks entered vs. expected,
   via core/academic-formulas.js's calcCompletionRate) and their
   classes' average scores for the active term.

   Dependencies (plain-script globals loaded earlier in index.html):
   api.js: getAll
   state.js: state, getActiveTermId
   academic-formulas.js: calcCompletionRate
   staff/teachers.js: activeTeachersOnly, teacherFullName
   utils.js: esc
   ═══════════════════════════════════════════════════════════════════ */

const TeacherPerformance = (() => {

    async function render(container) {
        if (!container) return;
        container.innerHTML = `<div class="dashboard-page"><div class="loading-inline">Loading teacher performance…</div></div>`;

        await ensureStateLoaded();
        const termId = getActiveTermId();
        const [teachers, assessments, marks, assignments] = await Promise.all([
            activeTeachersOnly(),
            getAll('assessments').catch(() => []),
            getAll('marks').catch(() => []),
            getAll('teacher_assignments').catch(() => [])
        ]);

        const rows = teachers.map(t => {
            const completion = calcCompletionRate(t.id, termId, assessments, marks);
            const classIds = assignments.filter(a => String(a.teacher_id) === String(t.id)).map(a => a.class_id);
            const classAvg = computeClassAverage(classIds, marks, assessments);
            return { teacher: t, completion, classAvg, classCount: new Set(classIds).size };
        });

        container.innerHTML = `
            <div class="dashboard-page">
                <div class="settings-section">
                    <div class="settings-section__title">Teacher Performance</div>
                    <div class="settings-section__desc">Assessment completion rate and class averages for the active term.</div>
                </div>

                ${rows.map(r => renderRow(r)).join('') || '<div class="setting-desc">No active teachers found.</div>'}
            </div>
        `;
    }

    function computeClassAverage(classIds, marks, assessments) {
        if (!classIds.length) return null;
        const assessmentIds = new Set(assessments.filter(a => classIds.includes(a.class_id)).map(a => a.id));
        const relevantMarks = marks.filter(m => assessmentIds.has(m.assessment_id) && m.score !== null && m.score !== undefined);
        if (!relevantMarks.length) return null;
        const sum = relevantMarks.reduce((acc, m) => acc + Number(m.score), 0);
        return Math.round((sum / relevantMarks.length) * 10) / 10;
    }

    function bandClass(pct) {
        if (pct >= 80) return 'high';
        if (pct >= 50) return 'mid';
        return 'low';
    }

    function renderRow(r) {
        const pct = Math.round(r.completion.pct || 0);
        return `
            <div class="performance-row">
                <div class="performance-row__avatar">${esc(initials(r.teacher))}</div>
                <div class="performance-row__name">
                    ${esc(teacherFullName(r.teacher))}
                    <div class="setting-desc">${r.classCount} class${r.classCount === 1 ? '' : 'es'} · avg ${r.classAvg !== null ? r.classAvg + '%' : '—'}</div>
                </div>
                <div class="performance-row__bar">
                    <div class="performance-row__bar-fill ${bandClass(pct)}" style="width:${pct}%;"></div>
                </div>
                <div class="performance-row__pct">${pct}%</div>
            </div>
        `;
    }

    function initials(t) {
        return `${(t.first_name || '')[0] || ''}${(t.last_name || '')[0] || ''}`.toUpperCase();
    }

    return { render };
})();

window.renderTeacherPerformance = TeacherPerformance.render;
window.TeacherPerformance = TeacherPerformance;
