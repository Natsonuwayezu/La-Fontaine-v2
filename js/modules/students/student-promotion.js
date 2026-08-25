/* ═══════════════════════════════════════════════════════════════════
   js/modules/students/student-promotion.js
   ═══════════════════════════════════════════════════════════════════
   End-of-year batch workflow: pick a class, review each student's
   pre-filled decision seeded from the real, shared getPromotionDecision()
   formula (core/formulas.js — the same one used elsewhere in the
   grading engine), adjust individually if needed, then execute as one
   real batch of database updates with a determinate progress overlay.

   "Next class" is resolved via the real classes table's sort_order
   column (state.classes, confirmed in js/modules/settings/
   class-management.js as the school's actual progression ordering) —
   the class with sort_order = current.sort_order + 1 — rather than a
   hardcoded name-string chain that only worked for one specific set of
   class names.

   Last updated: 2026-07-29
   ═══════════════════════════════════════════════════════════════════ */

const StudentPromotion = (() => {

  const DECISION_OPTIONS = [
    { value: 'promote',      label: 'Promoted',                  color: 'var(--success)' },
    { value: 'second_sitting', label: '2nd Sitting',             color: 'var(--warning)' },
    { value: 'repeat',       label: 'Repeated',                  color: 'var(--danger)' },
    { value: 'transfer',     label: 'Promoted elsewhere',         color: 'var(--accent-light, #60a5fa)' },
    { value: 'graduate',     label: 'Graduate',                   color: 'var(--academics-accent, #8b5cf6)' },
    { value: 'discontinued', label: 'Discontinued',               color: 'var(--text-muted)' },
  ];

  // Final decisions after 2nd sitting
  const FINAL_DECISION_OPTIONS = [
    { value: 'promoted',          label: 'Promoted' },
    { value: 'repeated',          label: 'Repeated' },
    { value: 'promoted_after_2nd',label: 'Promoted after 2nd sitting' },
    { value: 'repeated_after_2nd',label: 'Repeated after 2nd sitting' },
    { value: 'discontinued',      label: 'Discontinued' },
  ];

  // Maps the real getPromotionDecision() formula's decision codes to
  // this page's editable dropdown values -- teachers can still override
  // (e.g. to "transfer" instead of "repeat"), the formula just seeds a
  // sensible starting point instead of everyone defaulting to "promote".
  const FORMULA_TO_OPTION = {
    PROMOTED:  'promote',
    GRADUATED: 'graduate',
    REMEDIAL:  'second_sitting',  // below promotion mark → 2nd sitting first
    REPEATED:  'repeat',
  };

  let selectedClassId = null;
  let roster = [];

  function escapeHTML(str) {
    const div = document.createElement('div');
    div.textContent = str ?? '';
    return div.innerHTML;
  }

  function getClassOptions() {
    return [...(state.classes || [])].sort((a, b) => (a.sort_order || 99) - (b.sort_order || 99));
  }

  function getNextClass(currentClass) {
    if (!currentClass) return null;
    return (state.classes || []).find(c => c.sort_order === (currentClass.sort_order || 0) + 1) || null;
  }

  // ─── DATA ────────────────────────────────────────────────────────

  /** Real students in the class, with a real annual average (across
   *  every real mark for this student in the active academic year,
   *  not just the current term) and a decision seeded from the real
   *  shared getPromotionDecision() formula. */
  function buildRoster(classId) {
    const cls = (state.classes || []).find(c => c.id === Number(classId));
    if (!cls) return [];

    const yearTermIds = new Set((state.terms || [])
      .filter(t => !window.getActiveYearId || t.academic_year_id === window.getActiveYearId())
      .map(t => t.id));
    const yearAssessmentIds = new Set((state.assessments || [])
      .filter(a => yearTermIds.has(a.term_id))
      .map(a => a.id));

    return (state.students || [])
      .filter(s => String(s.class_id) === String(classId) && !s.is_deleted && (s.status || 'Active') === 'Active')
      .map(s => {
        const myMarks = (state.marks || []).filter(m =>
          m.student_id === s.id && yearAssessmentIds.has(m.assessment_id) && !m.is_absent && m.score !== null && m.score !== undefined
        );
        const pcts = myMarks.map(m => {
          const a = (state.assessments || []).find(x => x.id === m.assessment_id);
          return a?.max_score ? (m.score / a.max_score) * 100 : null;
        }).filter(p => p !== null);
        const average = pcts.length ? Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length) : 0;

        const formulaResult = getPromotionDecision(average, cls.name);

        // Compute 2nd sitting average % (core subjects only, stored in marks.second_sitting_score)
        const yearTermIds2 = new Set((state.terms || [])
          .filter(t => !window.getActiveYearId || t.academic_year_id === window.getActiveYearId())
          .map(t => t.id));
        const ssAssmnts = (state.assessments || []).filter(a =>
          a.class_id === Number(classId) && yearTermIds2.has(a.term_id) && a.phase === 'second_sitting');
        const ssScores = ssAssmnts.map(a => {
          const m = (state.marks || []).find(m => m.student_id === s.id && m.assessment_id === a.id);
          return m?.second_sitting_score ?? null;
        }).filter(p => p !== null);
        const ssAverage = ssScores.length
          ? ssScores.reduce((a, b) => a + b, 0) / ssScores.length : null;

        // Promotion decision from DB (if already saved)
        const savedDecision = (state.promotionDecisions || []).find(d =>
          d.student_id === s.id && d.academic_year_id === (window.getActiveYearId?.() || null));

        return {
          id: s.id,
          name: `${s.first_name || ''} ${s.last_name || ''}`.trim() || `Student #${s.id}`,
          code: s.code || '',
          average,
          ssAverage,
          hasMarks: pcts.length > 0,
          decision: savedDecision?.first_decision || FORMULA_TO_OPTION[formulaResult.decision] || 'promote',
          finalDecision: savedDecision?.final_decision || null,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  // ─── RENDER ────────────────────────────────────────────────────────

  function render(container) {
    if (!container) return;
    const classOptions = getClassOptions();
    container.innerHTML = `
      <div class="dashboard-page">
        <div class="reports-toolbar">
          <select class="form-select" id="promo-class-select" style="min-width:220px;">
            <option value="">Select a class...</option>
            ${classOptions.map(c => `<option value="${c.id}">${escapeHTML(c.name)}</option>`).join('')}
          </select>
          <div class="reports-toolbar__spacer"></div>
          <span class="result-count" id="promo-count"></span>
        </div>
        <div id="promo-body"></div>
      </div>
    `;

    container.querySelector('#promo-class-select').addEventListener('change', (e) => loadClass(container, e.target.value));
  }

  function loadClass(container, classId) {
    selectedClassId = classId;
    const body = container.querySelector('#promo-body');
    if (!classId) { body.innerHTML = ''; container.querySelector('#promo-count').textContent = ''; return; }

    const cls = (state.classes || []).find(c => c.id === Number(classId));
    roster = buildRoster(classId);
    container.querySelector('#promo-count').textContent = `${roster.length} students`;

    if (!roster.length) {
      window.EmptyStates?.renderPreset(body, 'noData', { title: 'No students in this class', message: 'Nothing to promote here.' });
      return;
    }

    const nextClass = getNextClass(cls);

    body.innerHTML = `
      <div class="dash-card">
        <div class="dash-card-header">
          <span class="dash-card-title">${escapeHTML(cls.name)} \u2192 ${nextClass ? escapeHTML(nextClass.name) : 'Graduation'}</span>
          <div style="display:flex; gap:8px;">
            <button class="btn btn-sm btn-outline" data-bulk-set="promote">Set all: Promote</button>
            <button class="btn btn-sm btn-outline" data-bulk-set="repeat">Set all: Repeat</button>
          </div>
        </div>
        <div class="dash-card-body no-padding" id="promo-table-wrap"></div>
      </div>
      <div class="form-actions" style="margin-top:16px;">
        <button class="btn btn-primary btn-lg" id="promo-execute-btn"><i class="fa-solid fa-arrow-up-right-dots"></i> Execute Promotion</button>
      </div>
    `;

    renderTable(body);

    body.querySelectorAll('[data-bulk-set]').forEach(btn => {
      btn.addEventListener('click', () => {
        roster.forEach(s => { s.decision = btn.dataset.bulkSet; });
        renderTable(body);
      });
    });

    body.querySelector('#promo-execute-btn').addEventListener('click', () => executePromotion(container));
  }

  function renderTable(body) {
    const wrap = body.querySelector('#promo-table-wrap');
    wrap.innerHTML = `
      <table class="data-table">
        <thead><tr><th>Student</th><th style="text-align:center;">Average</th><th style="text-align:center;">Decision</th></tr></thead>
        <tbody>${roster.map(s => `
          <tr>
            <td>${escapeHTML(s.name)}</td>
            <td style="text-align:center; color:${s.average < 50 ? 'var(--danger)' : 'var(--success)'};">${s.hasMarks ? `${s.average}%` : '<span style="color:var(--text-soft);">No marks</span>'}</td>
            <td style="text-align:center;">
              <select class="form-select" data-decision="${s.id}" style="min-width:130px;">
                ${DECISION_OPTIONS.map(o => `<option value="${o.value}" ${s.decision === o.value ? 'selected' : ''}>${o.label}</option>`).join('')}
              </select>
            </td>
          </tr>
        `).join('')}</tbody>
      </table>
    `;
    wrap.querySelectorAll('[data-decision]').forEach(sel => {
      sel.addEventListener('change', () => {
        roster.find(s => s.id === parseInt(sel.dataset.decision, 10)).decision = sel.value;
      });
    });
  }

  // ─── EXECUTE (real batch DB updates) ─────────────────────────────────

  async function executePromotion(container) {
    const summary = roster.reduce((acc, s) => { acc[s.decision] = (acc[s.decision] || 0) + 1; return acc; }, {});
    const summaryText = Object.entries(summary).map(([k, v]) => `${v} ${DECISION_OPTIONS.find(o => o.value === k)?.label.toLowerCase()}`).join(', ');

    const cls = (state.classes || []).find(c => c.id === Number(selectedClassId));
    const nextClass = getNextClass(cls);

    const confirmed = await window.confirmDialog(
      `${summaryText}. This updates each student's class assignment for the new academic year and cannot be easily undone in bulk.`,
      `Promote ${roster.length} students?`,
      { confirmText: 'Execute Promotion', confirmClass: 'btn-danger' }
    );
    if (!confirmed) return;

    const handle = window.Loaders?.task?.show('students', {
      label: 'Processing promotions\u2026',
      sub: `0 / ${roster.length} students`,
      determinate: true
    });

    let failCount = 0;

    for (let i = 0; i < roster.length; i++) {
      const s = roster[i];
      try {
        if (s.decision === 'promote') {
          if (nextClass) {
            await update('students', s.id, { class_id: nextClass.id });
            const raw = (state.students || []).find(x => x.id === s.id);
            if (raw) raw.class_id = nextClass.id;
          } else {
            // Promoting out of the top class with no defined next class
            // is effectively a graduation.
            await update('students', s.id, { status: 'Graduated' });
            const raw = (state.students || []).find(x => x.id === s.id);
            if (raw) raw.status = 'Graduated';
          }
        } else if (s.decision === 'graduate') {
          await update('students', s.id, { status: 'Graduated' });
          const raw = (state.students || []).find(x => x.id === s.id);
          if (raw) raw.status = 'Graduated';
        } else if (s.decision === 'transfer') {
          await update('students', s.id, { status: 'Transferred' });
          const raw = (state.students || []).find(x => x.id === s.id);
          if (raw) raw.status = 'Transferred';
        }
        // 'repeat' — student stays in the same class_id, nothing to write.
      } catch (err) {
        failCount++;
        console.warn(`[StudentPromotion] failed to update student ${s.id}:`, err.message);
      }

      handle?.setProgress(Math.round(((i + 1) / roster.length) * 100));
      handle?.setSub(`${i + 1} / ${roster.length} students`);
    }

    handle?.hide();

    if (failCount > 0) {
      window.Toast?.warning('Promotion completed with errors', `${roster.length - failCount} of ${roster.length} students updated successfully; ${failCount} failed — check the console and retry those individually.`);
    } else {
      window.Toast?.success('Promotion complete', `${roster.length} students in ${escapeHTML(cls.name)} processed: ${summaryText}.`);
    }

    container.querySelector('#promo-class-select').value = '';
    container.querySelector('#promo-body').innerHTML = '';
    container.querySelector('#promo-count').textContent = '';
  }

  return { render };
})();

// ─── EXPOSE ─────────────────────────────────────────────────────────

window.StudentPromotion = StudentPromotion;
window.renderStudentPromotion = StudentPromotion.render;
