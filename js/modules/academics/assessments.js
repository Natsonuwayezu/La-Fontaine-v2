/* ═══════════════════════════════════════════════════════════════════
   js/modules/academics/assessments.js
   ═══════════════════════════════════════════════════════════════════
   Rendered into #mainContent by core/router.js for 'assessments'.

   Create, browse, and manage assessments (quizzes, assignments,
   exams) by class/subject/phase. Styled with css/modules/assessments.css
   (assessment-grid, assessment-card, lock-toggle, phase-chip-select,
   assessment-type-badge) and the shared modal component
   (css/components/modals.css) for the creation form.

   Reads/writes the real `assessments` table via core/api.js. Field
   names and the two real phase values ('pre_midterm'/'post_midterm')
   match what core/academic-formulas.js's grading engine already
   expects (a.type against the real ASSESSMENT_TYPES list, a.subject_id,
   a.max_score, a.date, a.locked, a.name) -- chosen deliberately so this
   data is usable by that engine once report-cards.js/class-register.js
   are wired up to call it, rather than inventing a shape that would
   need re-migrating later.

   Last updated: 2026-07-27
   ═══════════════════════════════════════════════════════════════════ */

// esc, notify-equivalents (showToast) are plain-script globals from
// core/utils.js, loaded earlier in index.html.

// ─── STATE ───────────────────────────────────────────────────────────

let filters = { classId: 'all', phase: 'all' };
let formOpen = false;
let formPhaseSelection = 'pre_midterm';
let hasTriedLazyLoad = false;

const PHASES = [
  { value: 'pre_midterm', label: 'Pre-Midterm' },
  { value: 'post_midterm', label: 'Post-Midterm' },
];
const phaseLabel = (value) => PHASES.find(p => p.value === value)?.label || value;

// Maps the real ASSESSMENT_TYPES values to the CSS-safe, single-word
// modifier classes assessments.css already defines colors for.
const TYPE_BADGE_CLASS = {
  'Quiz': 'quiz',
  'Assignment': 'homework',
  'Mid-term': 'exam',
  'Exam': 'exam',
  'Final Exam': 'exam',
};

// ─── HELPERS ─────────────────────────────────────────────────────────

function getClassOptions() {
  return [...(state.classes || [])].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
}

function getSubjectOptions() {
  return [...(state.subjects || [])].sort((a, b) => (a.sort_order || 99) - (b.sort_order || 99));
}

function getFiltered() {
  const termId = window.getActiveTermId ? window.getActiveTermId() : null;
  return (state.assessments || [])
    .filter(a => !termId || String(a.term_id) === String(termId))
    .filter(a => {
      if (filters.classId !== 'all' && String(a.class_id) !== String(filters.classId)) return false;
      if (filters.phase !== 'all' && a.phase !== filters.phase) return false;
      return true;
    })
    .sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
}

/** Roster size for a class = active, non-deleted students in it. */
function rosterSize(classId) {
  return (state.students || []).filter(s =>
    String(s.class_id) === String(classId) && !s.is_deleted && (s.status || 'Active') === 'Active'
  ).length;
}

/** How many distinct students have at least one mark recorded for this
 *  assessment, out of the class roster. */
function completionCounts(assessment) {
  const total = rosterSize(assessment.class_id);
  const entered = new Set(
    (state.marks || [])
      .filter(m => m.assessment_id === assessment.id && m.score !== null && m.score !== undefined)
      .map(m => m.student_id)
  ).size;
  return { entered, total };
}

function completionPct({ entered, total }) {
  return total ? Math.round((entered / total) * 100) : 0;
}

// ─── RENDER ────────────────────────────────────────────────────────

function renderAssessments(container) {
  if (!container) {
    console.warn('[Assessments] No container provided');
    return;
  }

  const classOptions = getClassOptions();
  const subjectOptions = getSubjectOptions();

  container.innerHTML = `
        <div class="assessments-page">

            <!-- ═══ TOOLBAR ═══ -->
            <div class="assessment-toolbar">
                <select class="marks-toolbar__select" id="as-class-filter">
                    <option value="all">All Classes</option>
                    ${classOptions.map(c => `<option value="${c.id}" ${String(c.id) === String(filters.classId) ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}
                </select>
                <select class="marks-toolbar__select" id="as-phase-filter">
                    <option value="all" ${filters.phase === 'all' ? 'selected' : ''}>All Phases</option>
                    ${PHASES.map(p => `<option value="${esc(p.value)}" ${p.value === filters.phase ? 'selected' : ''}>${esc(p.label)}</option>`).join('')}
                </select>
                <span class="assessment-toolbar__spacer"></span>
                <button class="btn btn-primary btn-sm" id="as-new-btn"><i class="fa-solid fa-plus"></i> New Assessment</button>
            </div>

            <!-- ═══ ASSESSMENT GRID ═══ -->
            <div class="assessment-grid" id="as-grid"></div>

        </div>

        <!-- ═══ CREATE MODAL ═══ -->
        <div class="modal-overlay" id="as-modal-overlay" style="display:none;">
            <div class="modal modal-md">
                <div class="modal-header">
                    <span><i class="fa-solid fa-plus" style="color:var(--academics-accent, #8b5cf6);margin-right:8px;"></i>New Assessment</span>
                    <button class="modal-close" id="as-modal-close"><i class="fa-solid fa-xmark"></i></button>
                </div>
                <div class="modal-body">
                    <div class="assessment-form-grid">
                        <div class="field">
                            <label>Class</label>
                            <select id="as-form-class">
                                ${classOptions.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}
                            </select>
                        </div>
                        <div class="field">
                            <label>Subject</label>
                            <select id="as-form-subject">
                                ${subjectOptions.map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join('')}
                            </select>
                        </div>
                        <div class="field">
                            <label>Type</label>
                            <select id="as-form-type">
                                ${(window.ASSESSMENT_TYPES || ['Quiz', 'Assignment', 'Mid-term', 'Exam', 'Final Exam']).map(t => `<option value="${esc(t)}">${esc(t)}</option>`).join('')}
                            </select>
                        </div>
                        <div class="field">
                            <label>Max Score</label>
                            <input type="number" id="as-form-max" value="50" min="1" />
                        </div>
                        <div class="field span-2">
                            <label>Name</label>
                            <input type="text" id="as-form-name" placeholder="e.g. Quiz 5" />
                        </div>
                        <div class="field">
                            <label>Due Date</label>
                            <input type="date" id="as-form-date" />
                        </div>
                        <div class="field span-2">
                            <label>Phase</label>
                            <div class="phase-chip-select" id="as-form-phase-select">
                                ${PHASES.map(p => `<span class="phase-chip ${p.value === formPhaseSelection ? 'selected' : ''}" data-phase="${esc(p.value)}">${esc(p.label)}</span>`).join('')}
                            </div>
                        </div>
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-ghost btn-sm" id="as-form-cancel">Cancel</button>
                    <button class="btn btn-primary btn-sm" id="as-form-submit"><i class="fa-solid fa-check"></i> Create Assessment</button>
                </div>
            </div>
        </div>
    `;

  renderGrid();
  wireToolbar(container);
  wireModal(container);

  // assessments/marks for the active term are lazily loaded -- trigger
  // once per visit if this session hasn't already, then re-render with
  // real completion counts once available.
  const termId = window.getActiveTermId ? window.getActiveTermId() : null;
  const needsAssessments = termId && !(state.assessments || []).some(a => String(a.term_id) === String(termId));
  if (!hasTriedLazyLoad && termId && needsAssessments) {
    hasTriedLazyLoad = true;
    window.loadAllAssessmentsForTerm?.(termId)
      .then(() => window.loadAllMarksForTerm?.(termId))
      .then(() => { if (container.isConnected) renderGrid(); })
      .catch(() => {});
  }
}

function renderGrid() {
  const grid = document.getElementById('as-grid');
  if (!grid) return;

  const classMap = new Map((state.classes || []).map(c => [c.id, c.name]));
  const subjectMap = new Map((state.subjects || []).map(s => [s.id, s.name]));
  const filtered = getFiltered();

  if (!filtered.length) {
    grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:32px;color:var(--text-soft);">No assessments match these filters.</div>`;
    return;
  }

  grid.innerHTML = filtered.map(a => {
    const counts = completionCounts(a);
    const pct = completionPct(counts);
    return `
            <div class="assessment-card">
                <div class="assessment-card-header">
                    <div>
                        <div class="assessment-card-title">${esc(a.name)}</div>
                        <div class="assessment-card-sub">${esc(classMap.get(a.class_id) || '—')} · ${esc(subjectMap.get(a.subject_id) || '—')}</div>
                    </div>
                    <span class="assessment-type-badge ${TYPE_BADGE_CLASS[a.type] || ''}">${esc(a.type)}</span>
                </div>
                <div class="assessment-card-body">
                    <div class="assessment-meta-row"><span class="k">Phase</span><span class="v">${esc(phaseLabel(a.phase))}</span></div>
                    <div class="assessment-meta-row"><span class="k">Max Score</span><span class="v">${esc(a.max_score)}</span></div>
                    <div class="assessment-meta-row"><span class="k">Due</span><span class="v">${a.date ? esc(fmtDate(a.date)) : '—'}</span></div>
                    <div class="assessment-completion">
                        <div class="progress-bar" style="height:6px;border-radius:99px;background:rgba(255,255,255,0.08);overflow:hidden;">
                            <div style="height:100%;width:${pct}%;background:var(--academics-accent, #8b5cf6);border-radius:99px;"></div>
                        </div>
                        <span class="assessment-completion__pct">${pct}%</span>
                    </div>
                    <div class="assessment-meta-row"><span class="k">Entered</span><span class="v">${counts.entered}/${counts.total}</span></div>
                </div>
                <div class="assessment-card-footer">
                    <div class="lock-toggle ${a.locked ? 'locked' : ''}" data-toggle-lock="${a.id}">
                        <div class="lock-toggle__track"><div class="lock-toggle__thumb"></div></div>
                        <span class="lock-toggle__label">${a.locked ? 'Locked' : 'Open'}</span>
                    </div>
                    <button class="btn btn-ghost btn-sm" data-open-entry="${a.id}"><i class="fa-solid fa-pen-to-square"></i> Enter Marks</button>
                </div>
            </div>
        `;
  }).join('');

  grid.querySelectorAll('[data-toggle-lock]').forEach(el => {
    el.addEventListener('click', async () => {
      const id = parseInt(el.dataset.toggleLock, 10);
      const a = (state.assessments || []).find(x => x.id === id);
      if (!a) return;
      const nextLocked = !a.locked;
      try {
        await update('assessments', id, { locked: nextLocked });
        a.locked = nextLocked;
        renderGrid();
        notify(nextLocked ? `${a.name} locked` : `${a.name} unlocked`, 'info');
      } catch (err) {
        notify(`Could not update lock status: ${err.message}`, 'error');
      }
    });
  });

  grid.querySelectorAll('[data-open-entry]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = parseInt(btn.dataset.openEntry, 10);
      window.navigateTo('marks-entry', { assessmentId: id });
    });
  });
}

// ─── TOOLBAR / FILTERS ───────────────────────────────────────────────

function wireToolbar(container) {
  container.querySelector('#as-class-filter')?.addEventListener('change', (e) => {
    filters.classId = e.target.value;
    renderGrid();
  });
  container.querySelector('#as-phase-filter')?.addEventListener('change', (e) => {
    filters.phase = e.target.value;
    renderGrid();
  });
  container.querySelector('#as-new-btn')?.addEventListener('click', () => openModal());
}

// ─── MODAL ───────────────────────────────────────────────────────────

function openModal() {
  const overlay = document.getElementById('as-modal-overlay');
  if (overlay) overlay.style.display = 'flex';
  formOpen = true;
}

function closeAssessmentModal() {
  const overlay = document.getElementById('as-modal-overlay');
  if (overlay) overlay.style.display = 'none';
  formOpen = false;
}

function wireModal(container) {
  container.querySelector('#as-modal-close')?.addEventListener('click', closeAssessmentModal);
  container.querySelector('#as-form-cancel')?.addEventListener('click', closeAssessmentModal);
  container.querySelector('#as-modal-overlay')?.addEventListener('click', (e) => {
    if (e.target.id === 'as-modal-overlay') closeAssessmentModal();
  });

  container.querySelector('#as-form-phase-select')?.addEventListener('click', (e) => {
    const chip = e.target.closest('.phase-chip');
    if (!chip) return;
    formPhaseSelection = chip.dataset.phase;
    container.querySelectorAll('.phase-chip').forEach(c => c.classList.toggle('selected', c === chip));
  });

  container.querySelector('#as-form-submit')?.addEventListener('click', async (e) => {
    const submitBtn = e.currentTarget;
    const classSel = document.getElementById('as-form-class');
    const subjectSel = document.getElementById('as-form-subject');
    const typeSel = document.getElementById('as-form-type');
    const maxInput = document.getElementById('as-form-max');
    const nameInput = document.getElementById('as-form-name');
    const dateInput = document.getElementById('as-form-date');

    const name = nameInput.value.trim();
    if (!name) {
      notify('Assessment name is required', 'warning');
      return;
    }
    if (!classSel.value || !subjectSel.value) {
      notify('Class and subject are required', 'warning');
      return;
    }

    const termId = window.getActiveTermId ? window.getActiveTermId() : null;
    if (!termId) {
      notify('No active academic term is set -- cannot create an assessment', 'error');
      return;
    }

    const payload = {
      name,
      class_id: parseInt(classSel.value, 10),
      subject_id: parseInt(subjectSel.value, 10),
      type: typeSel.value,
      phase: formPhaseSelection,
      max_score: parseInt(maxInput.value, 10) || 100,
      date: dateInput.value || null,
      term_id: termId,
      created_by: state.currentUser?.id ?? null,
      locked: false,
    };

    submitBtn.disabled = true;
    try {
      const created = await insert('assessments', payload);
      state.assessments = [...(state.assessments || []), created];
      closeAssessmentModal();
      renderGrid();
      notify(`${name} created`, 'success');
    } catch (err) {
      notify(`Could not create assessment: ${err.message}`, 'error');
    } finally {
      submitBtn.disabled = false;
    }
  });
}

// ─── TOAST HELPER ────────────────────────────────────────────────────

function notify(message, type = 'info') {
  if (typeof window.showToast === 'function') {
    window.showToast(message, type);
  }
}

// ─── DESTROY ─────────────────────────────────────────────────────────

function destroyAssessments() {
  closeAssessmentModal();
}

// ─── EXPOSE ──────────────────────────────────────────────────────────

window.renderAssessments = renderAssessments;
window.destroyAssessments = destroyAssessments;
