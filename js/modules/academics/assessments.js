/* ═══════════════════════════════════════════════════════════════════
   js/modules/academics/assessments.js
   ═══════════════════════════════════════════════════════════════════
   Rendered into #mainContent by core/router.js for 'assessments'.

   Create, browse, and manage assessments (quizzes, assignments,
   exams) by class/subject/phase. Styled with css/modules/assessments.css
   (assessment-grid, assessment-card, lock-toggle, phase-chip-select,
   assessment-type-badge) and the shared modal component
   (css/components/modals.css) for the creation form.

   MOCK_DATA stands in for the real Supabase table until core/api.js
   is wired up.

   Last updated: 2026-07-14
   ═══════════════════════════════════════════════════════════════════ */

// esc is a plain-script global from core/utils.js, loaded earlier in index.html.

// ─── MOCK DATA ─────────────────────────────────────────────────────

const CLASS_OPTIONS = [
    { value: 'all', label: 'All Classes' },
    { value: 'p4a', label: 'Primary 4A' },
    { value: 'p3', label: 'Primary 3' },
    { value: 'p5b', label: 'Primary 5B' },
    { value: 'p6', label: 'Primary 6' },
    { value: 'p1', label: 'Primary 1' },
    { value: 'p2', label: 'Primary 2' }
];

const SUBJECT_OPTIONS = [
    { value: 'math', label: 'Mathematics' },
    { value: 'eng', label: 'English' },
    { value: 'kiny', label: 'Kinyarwanda' },
    { value: 'sci', label: 'Science' },
    { value: 'fr', label: 'French' },
    { value: 'soc', label: 'Social Studies' }
];

const TYPE_OPTIONS = ['quiz', 'assignment', 'exam', 'project'];

let assessmentsData = [
    { id: 1, name: 'Quiz 4', classId: 'p4a', className: 'Primary 4A', subject: 'Mathematics', type: 'quiz', phase: 'Post-Midterm', maxMarks: 50, dueDate: '2026-06-26', entered: 22, total: 28, locked: false },
    { id: 2, name: 'Mid-Term Exam', classId: 'p4a', className: 'Primary 4A', subject: 'Mathematics', type: 'exam', phase: 'Post-Midterm', maxMarks: 100, dueDate: '2026-06-20', entered: 28, total: 28, locked: true },
    { id: 3, name: 'Composition 3', classId: 'p5b', className: 'Primary 5B', subject: 'English', type: 'assignment', phase: 'Post-Midterm', maxMarks: 30, dueDate: '2026-06-24', entered: 16, total: 31, locked: false },
    { id: 4, name: 'Science Fair Project', classId: 'p6', className: 'Primary 6', subject: 'Science', type: 'project', phase: 'Annual', maxMarks: 40, dueDate: '2026-07-10', entered: 0, total: 26, locked: false },
    { id: 5, name: 'Quiz 3', classId: 'p3', className: 'Primary 3', subject: 'Kinyarwanda', type: 'quiz', phase: 'Post-Midterm', maxMarks: 20, dueDate: '2026-06-18', entered: 24, total: 24, locked: true },
    { id: 6, name: 'Final Exam', classId: 'p1', className: 'Primary 1', subject: 'Mathematics', type: 'exam', phase: 'Annual', maxMarks: 100, dueDate: '2026-07-15', entered: 0, total: 22, locked: false },
    { id: 7, name: 'French Homework 5', classId: 'p2', className: 'Primary 2', subject: 'French', type: 'assignment', phase: 'Pre-Midterm', maxMarks: 20, dueDate: '2026-05-30', entered: 20, total: 20, locked: true },
    { id: 8, name: 'Social Studies Quiz 2', classId: 'p4a', className: 'Primary 4A', subject: 'Social Studies', type: 'quiz', phase: 'Pre-Midterm', maxMarks: 20, dueDate: '2026-05-15', entered: 28, total: 28, locked: true }
];

let nextId = 9;

// ─── STATE ───────────────────────────────────────────────────────────

let filters = { classId: 'all', phase: 'all' };
let formOpen = false;
let formPhaseSelection = 'Post-Midterm';

const PHASES = ['Pre-Midterm', 'Post-Midterm', 'Annual'];

// ─── HELPERS ─────────────────────────────────────────────────────────

function getFiltered() {
    return assessmentsData.filter(a => {
        if (filters.classId !== 'all' && a.classId !== filters.classId) return false;
        if (filters.phase !== 'all' && a.phase !== filters.phase) return false;
        return true;
    });
}

function completionPct(a) {
    return a.total ? Math.round((a.entered / a.total) * 100) : 0;
}

// ─── RENDER ────────────────────────────────────────────────────────

function renderAssessments(container) {
    if (!container) {
        console.warn('[Assessments] No container provided');
        return;
    }

    container.innerHTML = `
        <div class="assessments-page">

            <!-- ═══ TOOLBAR ═══ -->
            <div class="assessment-toolbar">
                <select class="marks-toolbar__select" id="as-class-filter">
                    ${CLASS_OPTIONS.map(o => `<option value="${o.value}" ${o.value === filters.classId ? 'selected' : ''}>${esc(o.label)}</option>`).join('')}
                </select>
                <select class="marks-toolbar__select" id="as-phase-filter">
                    <option value="all" ${filters.phase === 'all' ? 'selected' : ''}>All Phases</option>
                    ${PHASES.map(p => `<option value="${esc(p)}" ${p === filters.phase ? 'selected' : ''}>${esc(p)}</option>`).join('')}
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
                                ${CLASS_OPTIONS.filter(o => o.value !== 'all').map(o => `<option value="${o.value}">${esc(o.label)}</option>`).join('')}
                            </select>
                        </div>
                        <div class="field">
                            <label>Subject</label>
                            <select id="as-form-subject">
                                ${SUBJECT_OPTIONS.map(o => `<option value="${o.value}">${esc(o.label)}</option>`).join('')}
                            </select>
                        </div>
                        <div class="field">
                            <label>Type</label>
                            <select id="as-form-type">
                                ${TYPE_OPTIONS.map(t => `<option value="${t}">${t.charAt(0).toUpperCase() + t.slice(1)}</option>`).join('')}
                            </select>
                        </div>
                        <div class="field">
                            <label>Max Marks</label>
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
                                ${PHASES.map(p => `<span class="phase-chip ${p === formPhaseSelection ? 'selected' : ''}" data-phase="${esc(p)}">${esc(p)}</span>`).join('')}
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
}

function renderGrid() {
    const grid = document.getElementById('as-grid');
    if (!grid) return;

    const filtered = getFiltered();

    if (!filtered.length) {
        grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:32px;color:var(--text-soft);">No assessments match these filters.</div>`;
        return;
    }

    grid.innerHTML = filtered.map(a => {
        const pct = completionPct(a);
        return `
            <div class="assessment-card">
                <div class="assessment-card-header">
                    <div>
                        <div class="assessment-card-title">${esc(a.name)}</div>
                        <div class="assessment-card-sub">${esc(a.className)} · ${esc(a.subject)}</div>
                    </div>
                    <span class="assessment-type-badge ${a.type}">${esc(a.type)}</span>
                </div>
                <div class="assessment-card-body">
                    <div class="assessment-meta-row"><span class="k">Phase</span><span class="v">${esc(a.phase)}</span></div>
                    <div class="assessment-meta-row"><span class="k">Max Marks</span><span class="v">${a.maxMarks}</span></div>
                    <div class="assessment-meta-row"><span class="k">Due</span><span class="v">${esc(a.dueDate)}</span></div>
                    <div class="assessment-completion">
                        <div class="progress-bar" style="height:6px;border-radius:99px;background:rgba(255,255,255,0.08);overflow:hidden;">
                            <div style="height:100%;width:${pct}%;background:var(--academics-accent, #8b5cf6);border-radius:99px;"></div>
                        </div>
                        <span class="assessment-completion__pct">${pct}%</span>
                    </div>
                    <div class="assessment-meta-row"><span class="k">Entered</span><span class="v">${a.entered}/${a.total}</span></div>
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
        el.addEventListener('click', () => {
            const id = parseInt(el.dataset.toggleLock, 10);
            const a = assessmentsData.find(x => x.id === id);
            if (!a) return;
            a.locked = !a.locked;
            renderGrid();
            notify(a.locked ? `${a.name} locked` : `${a.name} unlocked`, 'info');
        });
    });

    grid.querySelectorAll('[data-open-entry]').forEach(btn => {
        btn.addEventListener('click', () => {
            navigateTo('marks-entry');
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

    container.querySelector('#as-form-submit')?.addEventListener('click', () => {
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

        const classLabel = CLASS_OPTIONS.find(c => c.value === classSel.value)?.label || classSel.value;
        const subjectLabel = SUBJECT_OPTIONS.find(s => s.value === subjectSel.value)?.label || subjectSel.value;

        assessmentsData.unshift({
            id: nextId++,
            name,
            classId: classSel.value,
            className: classLabel,
            subject: subjectLabel,
            type: typeSel.value,
            phase: formPhaseSelection,
            maxMarks: parseInt(maxInput.value, 10) || 100,
            dueDate: dateInput.value || '—',
            entered: 0,
            total: 28,
            locked: false
        });

        closeAssessmentModal();
        renderGrid();
        notify(`${name} created`, 'success');
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
