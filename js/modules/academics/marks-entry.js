/* ═══════════════════════════════════════════════════════════════════
   js/modules/academics/marks-entry.js
   ═══════════════════════════════════════════════════════════════════
   Rendered into #mainContent by core/router.js for 'marks-entry'.
   Accepts an optional { assessmentId } param (set when navigating here
   from academics/assessments.js's "Enter Marks" button); without one,
   shows a class + assessment picker first.

   Teacher-facing grid for entering marks against a single assessment.
   Styled with css/modules/marks.css (toolbar, entry table, mark
   inputs, validation popup, save bar) plus the shared component
   library. Uses the shared validateMarkValue()/showMarkValidationPopup()
   from core/validators.js for the 3-choice out-of-range flow (no
   native prompt()/confirm()) instead of a separate ad-hoc popup.

   Reads/writes the real `marks` table (student_id, assessment_id,
   score, is_absent, entered_by, entered_at) via core/api.js. The
   assessment itself (class/subject/type/name/max_score/date/phase) is
   defined on the Assessments page, not here -- this page only edits
   scores and the locked flag for whichever assessment is selected.

   Last updated: 2026-07-28
   ═══════════════════════════════════════════════════════════════════ */

// esc, fmtDate, notify-equivalents (showToast) are plain-script globals
// from core/utils.js, loaded earlier in index.html.

// ─── STATE ───────────────────────────────────────────────────────────

let currentAssessmentId = null;
let currentAssessment = null;
let roster = [];              // [{ student_id, name, score, is_absent, markId }]
let currentPage = 1;
const ITEMS_PER_PAGE = 10;
let dirtyStudentIds = new Set();
let lastSavedAt = null;
let chartInstances = { distribution: null };
let hasTriedLazyLoad = false;

// ─── GRADE / STATUS LOGIC ────────────────────────────────────────────

function getGrade(score) {
    if (score === null || score === undefined || !currentAssessment) return { grade: '—', cls: '' };
    const pct = (score / currentAssessment.max_score) * 100;
    if (pct >= 90) return { grade: 'A+', cls: 'grade-Ap' };
    if (pct >= 80) return { grade: 'A', cls: 'grade-A' };
    if (pct >= 70) return { grade: 'B', cls: 'grade-B' };
    if (pct >= 60) return { grade: 'C', cls: 'grade-C' };
    if (pct >= 50) return { grade: 'D', cls: 'grade-D' };
    return { grade: 'F', cls: 'grade-F' };
}

function getStatus(score, isAbsent) {
    if (isAbsent) return { label: 'Absent', badgeCls: 'badge-neutral' };
    if (score === null || score === undefined) return { label: '—', badgeCls: 'badge-light' };
    const pct = (score / currentAssessment.max_score) * 100;
    if (pct >= 60) return { label: 'Pass', badgeCls: 'badge-success' };
    if (pct >= 50) return { label: 'Low', badgeCls: 'badge-warning' };
    return { label: 'Fail', badgeCls: 'badge-danger' };
}

function getInputClass(score, isAbsent) {
    if (isAbsent) return '';
    if (score === null || score === undefined) return 'mark-empty';
    const pct = (score / currentAssessment.max_score) * 100;
    if (pct >= 60) return 'mark-pass';
    if (pct >= 50) return 'mark-borderline';
    return 'mark-fail';
}

// ─── DATA ────────────────────────────────────────────────────────────

function buildRoster() {
    const marksByStudent = new Map(
        (state.marks || [])
            .filter(m => m.assessment_id === currentAssessment.id)
            .map(m => [m.student_id, m])
    );

    return (state.students || [])
        .filter(s => String(s.class_id) === String(currentAssessment.class_id) && !s.is_deleted && (s.status || 'Active') === 'Active')
        .map(s => {
            const mark = marksByStudent.get(s.id);
            return {
                student_id: s.id,
                name: `${s.first_name || ''} ${s.last_name || ''}`.trim() || `Student #${s.id}`,
                score: mark ? mark.score : null,
                is_absent: mark ? !!mark.is_absent : false,
                markId: mark ? mark.id : null,
            };
        })
        .sort((a, b) => a.name.localeCompare(b.name));
}

// ─── RENDER ────────────────────────────────────────────────────────

function renderMarksEntry(container, params = {}) {
    if (!container) {
        console.warn('[MarksEntry] No container provided');
        return;
    }

    if (params.assessmentId) currentAssessmentId = params.assessmentId;

    currentAssessment = currentAssessmentId
        ? (state.assessments || []).find(a => a.id === currentAssessmentId)
        : null;

    if (!currentAssessment) {
        renderPicker(container);
        return;
    }

    roster = buildRoster();
    currentPage = 1;
    dirtyStudentIds = new Set();
    lastSavedAt = null;

    const classMap = new Map((state.classes || []).map(c => [c.id, c.name]));
    const subjectMap = new Map((state.subjects || []).map(s => [s.id, s.name]));

    container.innerHTML = `
        <div class="marks-entry-page">

            <!-- ═══ TOOLBAR ═══ -->
            <div class="marks-toolbar">
                <button class="btn btn-ghost btn-sm" id="me-change-assessment"><i class="fa-solid fa-arrow-left"></i> Change Assessment</button>
                <span class="marks-toolbar__info"><strong>${esc(currentAssessment.name)}</strong> · ${esc(classMap.get(currentAssessment.class_id) || '—')} · ${esc(subjectMap.get(currentAssessment.subject_id) || '—')} · ${esc(currentAssessment.type)} · Max ${esc(currentAssessment.max_score)}${currentAssessment.date ? ' · ' + esc(fmtDate(currentAssessment.date)) : ''}</span>

                <span class="marks-toolbar__spacer"></span>

                <span class="assessment-lock-badge ${currentAssessment.locked ? 'locked' : 'open'}" id="me-lock-badge">
                    <i class="fa-solid ${currentAssessment.locked ? 'fa-lock' : 'fa-lock-open'}"></i>
                    ${currentAssessment.locked ? 'Locked' : 'Open'}
                </span>
                <button class="btn ${currentAssessment.locked ? 'btn-outline-warning' : 'btn-outline-danger'} btn-sm" id="me-lock-btn">
                    <i class="fa-solid ${currentAssessment.locked ? 'fa-lock-open' : 'fa-lock'}"></i> ${currentAssessment.locked ? 'Unlock' : 'Lock'}
                </button>
            </div>

            ${currentAssessment.locked ? `<div class="alert alert-warning" style="margin-bottom:16px;"><i class="fa-solid fa-lock"></i> This assessment is locked. Unlock it above to make changes.</div>` : ''}

            <!-- ═══ STAT STRIP ═══ -->
            <div class="card" style="padding:4px 0;margin-bottom:16px;">
                <div class="marks-stat-strip" id="me-stat-strip"></div>
            </div>

            <!-- ═══ ENTRY TABLE ═══ -->
            <div class="marks-entry-wrap">
                <div class="marks-toolbar" style="border:none;border-bottom:1px solid var(--card-border, rgba(255,255,255,0.07));border-radius:0;margin-bottom:0;">
                    <span class="title" style="font-weight:700;font-size:0.85rem;"><i class="fa-solid fa-table"></i> Marks Entry</span>
                    <span class="marks-toolbar__spacer"></span>
                    <button class="btn btn-ghost btn-sm" id="me-select-all"><i class="fa-regular fa-square-check"></i> Select All</button>
                    <button class="btn btn-ghost btn-sm" id="me-mark-absent"><i class="fa-regular fa-circle-xmark"></i> Mark Absent</button>
                    <button class="btn btn-primary btn-sm" id="me-save-all"><i class="fa-solid fa-floppy-disk"></i> Save All</button>
                </div>
                <table class="marks-entry-table">
                    <thead>
                        <tr>
                            <th class="col-num">#</th>
                            <th>Student</th>
                            <th>Score / <span id="me-max-label">${currentAssessment.max_score}</span></th>
                            <th>%</th>
                            <th>Grade</th>
                            <th>Absent</th>
                            <th>Status</th>
                        </tr>
                    </thead>
                    <tbody id="me-table-body"></tbody>
                </table>
                <div class="pagination-wrapper">
                    <div class="pagination-info" id="me-pagination-info"></div>
                    <div class="pagination-controls" id="me-pagination"></div>
                </div>
            </div>

            <!-- ═══ SCORE DISTRIBUTION ═══ -->
            <div class="dash-card" style="margin-top:16px;">
                <div class="chart-head">
                    <span class="title"><i class="fa-solid fa-chart-bar" style="color:var(--academics-accent, #8b5cf6);margin-right:6px;"></i> Score Distribution</span>
                    <span class="badge" id="me-dist-count"></span>
                </div>
                <div class="chart-container">
                    <canvas id="me-distribution-chart"></canvas>
                </div>
            </div>

            <!-- ═══ SAVE BAR ═══ -->
            <div class="marks-save-bar">
                <div style="display:flex;gap:8px;">
                    <button class="btn btn-primary btn-sm" id="me-save"><i class="fa-solid fa-floppy-disk"></i> Save Marks</button>
                    <button class="btn btn-outline-danger btn-sm" id="me-clear"><i class="fa-regular fa-trash-can"></i> Clear All</button>
                </div>
                <div class="marks-save-bar__status" id="me-save-status"></div>
            </div>

        </div>
    `;

    renderTable();
    renderDistributionChart();
    wireToolbar(container);
    wireFooter(container);

    // marks/assessments for the active term are lazily loaded — trigger
    // once per visit if this session hasn't already, then rebuild the
    // roster with real data once available.
    const termId = currentAssessment.term_id;
    const needsMarks = !(state.marks || []).some(m => m.assessment_id === currentAssessment.id);
    if (!hasTriedLazyLoad && needsMarks && termId) {
        hasTriedLazyLoad = true;
        window.loadMarksForClass?.(currentAssessment.class_id, termId)
            .then(() => {
                if (!container.isConnected) return;
                roster = buildRoster();
                renderTable();
                renderDistributionChart();
            })
            .catch(() => {});
    }
}

// ─── ASSESSMENT PICKER (shown when no assessment is selected) ───────

function renderPicker(container) {
    const classOptions = [...(state.classes || [])].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    const termId = window.getActiveTermId ? window.getActiveTermId() : null;

    container.innerHTML = `
        <div class="marks-entry-page">
            <div class="card" style="max-width:480px;margin:40px auto;padding:24px;">
                <h3 style="margin-bottom:16px;"><i class="fa-solid fa-pen-to-square" style="color:var(--academics-accent, #8b5cf6);"></i> Select an Assessment</h3>
                <div class="field" style="margin-bottom:14px;">
                    <label>Class</label>
                    <select id="me-picker-class" style="width:100%;">
                        <option value="">Choose a class…</option>
                        ${classOptions.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}
                    </select>
                </div>
                <div class="field" style="margin-bottom:14px;">
                    <label>Assessment</label>
                    <select id="me-picker-assessment" style="width:100%;" disabled>
                        <option value="">Choose a class first…</option>
                    </select>
                </div>
                <button class="btn btn-primary btn-sm" id="me-picker-go" style="width:100%;" disabled>Open</button>
                <div style="margin-top:16px;text-align:center;">
                    <button class="btn btn-ghost btn-sm" id="me-picker-new"><i class="fa-solid fa-plus"></i> Create a new assessment instead</button>
                </div>
            </div>
        </div>
    `;

    const classSel = container.querySelector('#me-picker-class');
    const assessmentSel = container.querySelector('#me-picker-assessment');
    const goBtn = container.querySelector('#me-picker-go');

    classSel.addEventListener('change', () => {
        const classId = classSel.value;
        assessmentSel.innerHTML = '';
        if (!classId) {
            assessmentSel.disabled = true;
            assessmentSel.innerHTML = `<option value="">Choose a class first…</option>`;
            goBtn.disabled = true;
            return;
        }
        const forClass = (state.assessments || []).filter(a =>
            String(a.class_id) === String(classId) && (!termId || String(a.term_id) === String(termId))
        );
        if (!forClass.length) {
            assessmentSel.disabled = true;
            assessmentSel.innerHTML = `<option value="">No assessments for this class yet</option>`;
            goBtn.disabled = true;
            return;
        }
        assessmentSel.disabled = false;
        assessmentSel.innerHTML = forClass.map(a => `<option value="${a.id}">${esc(a.name)} (${esc(a.type)})</option>`).join('');
        goBtn.disabled = false;
    });

    goBtn.addEventListener('click', () => {
        const id = parseInt(assessmentSel.value, 10);
        if (!id) return;
        currentAssessmentId = id;
        renderMarksEntry(container);
    });

    container.querySelector('#me-picker-new')?.addEventListener('click', () => {
        window.navigateTo('assessments');
    });

    // assessments for the active term may not be loaded yet
    const needsAssessments = termId && !(state.assessments || []).some(a => String(a.term_id) === String(termId));
    if (needsAssessments) {
        window.loadAllAssessmentsForTerm?.(termId).then(() => {
            if (container.isConnected && classSel.value) {
                classSel.dispatchEvent(new Event('change'));
            }
        }).catch(() => {});
    }
}

// ─── TABLE ────────────────────────────────────────────────────────

function renderTable() {
    const tbody = document.getElementById('me-table-body');
    if (!tbody) return;

    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    const end = Math.min(start + ITEMS_PER_PAGE, roster.length);
    const pageData = roster.slice(start, end);
    const locked = currentAssessment.locked;

    tbody.innerHTML = pageData.map((s, idx) => {
        const globalIdx = start + idx + 1;
        const grade = getGrade(s.score);
        const status = getStatus(s.score, s.is_absent);
        const displayScore = s.score !== null && s.score !== undefined ? s.score : '';

        return `
            <tr data-row-id="${s.student_id}">
                <td class="student-num-cell">${globalIdx}</td>
                <td class="student-name-cell">${esc(s.name)}</td>
                <td>
                    <input
                        type="number"
                        class="marks-input ${getInputClass(s.score, s.is_absent)}"
                        value="${displayScore}"
                        min="0"
                        max="${currentAssessment.max_score}"
                        data-id="${s.student_id}"
                        ${s.is_absent || locked ? 'disabled' : ''}
                    /> / ${currentAssessment.max_score}
                </td>
                <td>${s.score !== null && s.score !== undefined ? Math.round((s.score / currentAssessment.max_score) * 100) + '%' : '—'}</td>
                <td><span class="badge ${grade.cls}">${grade.grade}</span></td>
                <td><input type="checkbox" class="checkbox" data-absent-id="${s.student_id}" ${s.is_absent ? 'checked' : ''} ${locked ? 'disabled' : ''} /></td>
                <td><span class="badge ${status.badgeCls}">${esc(status.label)}</span></td>
            </tr>
        `;
    }).join('');

    tbody.querySelectorAll('.marks-input').forEach(input => {
        input.addEventListener('change', (e) => handleScoreChange(e.target));
    });
    tbody.querySelectorAll('[data-absent-id]').forEach(cb => {
        cb.addEventListener('change', (e) => {
            const id = parseInt(e.target.dataset.absentId, 10);
            const student = roster.find(s => s.student_id === id);
            if (!student) return;
            student.is_absent = e.target.checked;
            if (student.is_absent) student.score = null;
            markDirty(id);
            renderTable();
            renderDistributionChart();
        });
    });

    renderPagination();
    renderStatStrip();
}

async function handleScoreChange(input) {
    const id = parseInt(input.dataset.id, 10);
    const student = roster.find(s => s.student_id === id);
    if (!student) return;

    const raw = input.value.trim();
    const numeric = raw === '' ? null : Number(raw);
    const validation = validateMarkValue(raw, currentAssessment.max_score);

    if (!validation.valid) {
        const choice = await showMarkValidationPopup({
            score: raw,
            maxScore: currentAssessment.max_score,
            studentName: student.name,
            assessmentName: currentAssessment.name,
            issue: validation.issue,
        });

        if (choice === 'correct') {
            input.value = student.score !== null && student.score !== undefined ? student.score : '';
            return;
        }
        if (choice === 'absent') {
            student.is_absent = true;
            student.score = null;
        } else {
            // 'save' — record the out-of-range value as-is
            student.score = numeric;
        }
        markDirty(id);
        renderTable();
        renderDistributionChart();
        return;
    }

    student.score = numeric;
    markDirty(id);
    renderTable();
    renderDistributionChart();
}

// ─── STAT STRIP ──────────────────────────────────────────────────────

function renderStatStrip() {
    const el = document.getElementById('me-stat-strip');
    if (!el) return;

    const total = roster.length;
    const entered = roster.filter(s => s.score !== null && s.score !== undefined).length;
    const missing = total - entered - roster.filter(s => s.is_absent).length;
    const scored = roster.filter(s => s.score !== null && s.score !== undefined);
    const avg = scored.length ? (scored.reduce((sum, s) => sum + s.score, 0) / scored.length) : 0;
    const passCount = scored.filter(s => (s.score / currentAssessment.max_score) * 100 >= 60).length;
    const passRate = scored.length ? (passCount / scored.length) * 100 : 0;
    const highest = scored.length ? Math.max(...scored.map(s => s.score)) : 0;

    const items = [
        { value: total, label: 'Students' },
        { value: entered, label: 'Entered' },
        { value: Math.max(missing, 0), label: 'Missing' },
        { value: `${avg.toFixed(1)}<span class="suffix">/${currentAssessment.max_score}</span>`, label: 'Average' },
        { value: `${passRate.toFixed(1)}<span class="suffix">%</span>`, label: 'Pass Rate' },
        { value: highest, label: 'Highest' }
    ];

    el.innerHTML = items.map(i => `
        <div class="marks-stat-strip__item">
            <div class="marks-stat-strip__value">${i.value}</div>
            <div class="marks-stat-strip__label">${i.label}</div>
        </div>
    `).join('');
}

// ─── PAGINATION ──────────────────────────────────────────────────────

function renderPagination() {
    const info = document.getElementById('me-pagination-info');
    const controls = document.getElementById('me-pagination');
    if (!info || !controls) return;

    const totalPages = Math.max(1, Math.ceil(roster.length / ITEMS_PER_PAGE));
    const start = (currentPage - 1) * ITEMS_PER_PAGE + 1;
    const end = Math.min(currentPage * ITEMS_PER_PAGE, roster.length);

    info.innerHTML = `Showing <span class="range">${roster.length ? start : 0}–${end}</span> of <span class="total">${roster.length}</span> students`;

    let html = `<button class="page-btn ${currentPage === 1 ? 'disabled' : ''}" data-page-delta="-1"><i class="fa-solid fa-chevron-left"></i></button>`;
    for (let i = 1; i <= totalPages; i++) {
        html += `<button class="page-btn ${i === currentPage ? 'active' : ''}" data-page-go="${i}">${i}</button>`;
    }
    html += `<button class="page-btn ${currentPage === totalPages ? 'disabled' : ''}" data-page-delta="1"><i class="fa-solid fa-chevron-right"></i></button>`;
    controls.innerHTML = html;

    controls.querySelectorAll('[data-page-go]').forEach(btn => {
        btn.addEventListener('click', () => {
            currentPage = parseInt(btn.dataset.pageGo, 10);
            renderTable();
        });
    });
    controls.querySelectorAll('[data-page-delta]').forEach(btn => {
        btn.addEventListener('click', () => {
            const totalP = Math.max(1, Math.ceil(roster.length / ITEMS_PER_PAGE));
            const next = currentPage + parseInt(btn.dataset.pageDelta, 10);
            if (next < 1 || next > totalP) return;
            currentPage = next;
            renderTable();
        });
    });
}

// ─── SCORE DISTRIBUTION CHART ────────────────────────────────────────

function computeDistribution() {
    const bands = [
        { key: 'A+', min: 90, color: '#3a7a5a' },
        { key: 'A', min: 80, color: '#1a4a2a' },
        { key: 'B', min: 70, color: '#1a3a5a' },
        { key: 'C', min: 60, color: '#6a4a10' },
        { key: 'D', min: 50, color: '#7a3a1a' },
        { key: 'F', min: 0, color: '#8a2a1a' }
    ];
    const scored = roster.filter(s => s.score !== null && s.score !== undefined);
    const counts = bands.map(() => 0);

    scored.forEach(s => {
        const pct = (s.score / currentAssessment.max_score) * 100;
        const idx = bands.findIndex(b => pct >= b.min);
        counts[idx === -1 ? bands.length - 1 : idx]++;
    });

    return { bands, counts, total: scored.length };
}

function renderDistributionChart() {
    const canvas = document.getElementById('me-distribution-chart');
    const badge = document.getElementById('me-dist-count');
    if (!canvas) return;

    const { bands, counts, total } = computeDistribution();
    if (badge) badge.textContent = `${total} students`;

    if (chartInstances.distribution) chartInstances.distribution.destroy();
    chartInstances.distribution = new Chart(canvas.getContext('2d'), {
        type: 'bar',
        data: {
            labels: bands.map(b => b.key),
            datasets: [{
                label: 'Students',
                data: counts,
                backgroundColor: bands.map(b => b.color),
                borderRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: (ctx) => {
                            const pct = total ? Math.round((ctx.parsed.y / total) * 100) : 0;
                            return `${ctx.parsed.y} students (${pct}%)`;
                        }
                    }
                }
            },
            scales: {
                y: { beginAtZero: true, ticks: { stepSize: 1 }, grid: { color: 'rgba(26,20,16,0.04)' } },
                x: { grid: { display: false } }
            }
        }
    });
}

// ─── TOOLBAR WIRING ──────────────────────────────────────────────────

function wireToolbar(container) {
    container.querySelector('#me-change-assessment')?.addEventListener('click', () => {
        currentAssessmentId = null;
        currentAssessment = null;
        renderMarksEntry(container);
    });

    container.querySelector('#me-lock-btn')?.addEventListener('click', async () => {
        const nextLocked = !currentAssessment.locked;
        try {
            await update('assessments', currentAssessment.id, { locked: nextLocked });
            currentAssessment.locked = nextLocked;
            renderMarksEntry(container);
            notify(nextLocked ? 'Assessment locked' : 'Assessment unlocked', 'info');
        } catch (err) {
            notify(`Could not update lock status: ${err.message}`, 'error');
        }
    });

    container.querySelector('#me-select-all')?.addEventListener('click', () => {
        if (currentAssessment.locked) return;
        document.querySelectorAll('.marks-entry-table [data-absent-id]').forEach(cb => { cb.checked = true; cb.dispatchEvent(new Event('change')); });
        notify('All visible rows marked absent-checked — review before saving', 'info');
    });

    container.querySelector('#me-mark-absent')?.addEventListener('click', () => {
        if (currentAssessment.locked) return;
        const checked = Array.from(document.querySelectorAll('.marks-entry-table [data-absent-id]:checked'));
        if (!checked.length) {
            notify('Select students first', 'warning');
            return;
        }
        checked.forEach(cb => {
            const id = parseInt(cb.dataset.absentId, 10);
            const student = roster.find(s => s.student_id === id);
            if (student) { student.is_absent = true; student.score = null; markDirty(id); }
        });
        renderTable();
        renderDistributionChart();
        notify(`${checked.length} students marked absent`, 'success');
    });

    container.querySelector('#me-save-all')?.addEventListener('click', () => saveMarks());
}

// ─── FOOTER WIRING ───────────────────────────────────────────────────

function wireFooter(container) {
    container.querySelector('#me-save')?.addEventListener('click', () => saveMarks());
    container.querySelector('#me-clear')?.addEventListener('click', () => {
        showClearAllConfirm(container);
    });

    renderSaveStatus();
}

function showClearAllConfirm(container) {
    if (currentAssessment.locked) {
        notify('This assessment is locked', 'warning');
        return;
    }
    const overlay = document.getElementById('modalOverlay');
    if (!overlay) {
        if (window.confirm(`Clear all ${roster.length} entered marks for this assessment? This cannot be undone.`)) {
            doClearAll();
        }
        return;
    }
    overlay.innerHTML = `
        <div class="modal-panel modal-sm" style="max-width:420px;">
            <div class="modal-header"><h2>Clear All Marks</h2></div>
            <div class="modal-body">
                <p>Clear all <strong>${roster.length}</strong> entered marks for this assessment? This cannot be undone.</p>
            </div>
            <div class="modal-footer" style="display:flex;gap:8px;">
                <button class="btn btn-danger" id="me-confirm-clear" style="flex:1;">Clear All</button>
                <button class="btn btn-secondary" id="me-cancel-clear" style="flex:1;">Cancel</button>
            </div>
        </div>
    `;
    overlay.classList.add('show');
    const cleanup = () => { overlay.classList.remove('show'); overlay.innerHTML = ''; };
    document.getElementById('me-confirm-clear').addEventListener('click', () => { cleanup(); doClearAll(); });
    document.getElementById('me-cancel-clear').addEventListener('click', cleanup);
}

function doClearAll() {
    roster.forEach(s => {
        if (!s.is_absent) { s.score = null; markDirty(s.student_id); }
    });
    renderTable();
    renderDistributionChart();
    notify('All marks cleared locally — click Save to persist', 'warning');
}

function markDirty(studentId) {
    dirtyStudentIds.add(studentId);
    renderSaveStatus();
}

function renderSaveStatus() {
    const el = document.getElementById('me-save-status');
    if (!el) return;

    if (dirtyStudentIds.size > 0) {
        el.className = 'marks-save-bar__status dirty';
        el.innerHTML = `<i class="fa-solid fa-circle-exclamation"></i> ${dirtyStudentIds.size} unsaved change${dirtyStudentIds.size === 1 ? '' : 's'}`;
    } else if (lastSavedAt) {
        el.className = 'marks-save-bar__status saved';
        el.innerHTML = `<i class="fa-solid fa-circle-check"></i> Saved at ${lastSavedAt}`;
    } else {
        el.className = 'marks-save-bar__status';
        el.textContent = 'No changes yet';
    }
}

async function saveMarks() {
    if (currentAssessment.locked) {
        notify('This assessment is locked — unlock it first', 'warning');
        return;
    }
    if (dirtyStudentIds.size === 0) {
        notify('No changes to save', 'info');
        return;
    }

    const saveBtn = document.getElementById('me-save');
    const saveAllBtn = document.getElementById('me-save-all');
    if (saveBtn) saveBtn.disabled = true;
    if (saveAllBtn) saveAllBtn.disabled = true;

    const dirty = roster.filter(s => dirtyStudentIds.has(s.student_id));
    const toInsert = dirty.filter(s => !s.markId);
    const toUpdate = dirty.filter(s => s.markId);
    const now = new Date().toISOString();

    try {
        const jobs = [];

        if (toInsert.length) {
            jobs.push(insertMany('marks', toInsert.map(s => ({
                student_id       : s.student_id,
                assessment_id    : currentAssessment.id,
                score            : s.score,
                is_absent        : s.is_absent,
                entered_by       : state.currentUser?.id ?? null,
                entered_by_name  : state.currentUser?.name || null,
                entered_at       : now,
                created_at       : now,
                updated_at       : now,
                academic_year_id : currentAssessment.academic_year_id || state.currentAcadYear?.id || null,
                term_id          : currentAssessment.term_id          || state.currentTerm?.id    || null,
            }))));
        }

        toUpdate.forEach(s => {
            jobs.push(update('marks', s.markId, {
                score            : s.score,
                is_absent        : s.is_absent,
                entered_by       : state.currentUser?.id ?? null,
                entered_by_name  : state.currentUser?.name || null,
                entered_at       : now,
                updated_at       : now,
                academic_year_id : currentAssessment.academic_year_id || state.currentAcadYear?.id || null,
                term_id          : currentAssessment.term_id          || state.currentTerm?.id    || null,
            }));
        });

        const results = await Promise.all(jobs);

        // Merge newly-inserted rows into state.marks (and this roster)
        // so their real IDs are known for the next save without a
        // full reload, and so other pages reading state.marks see them.
        if (toInsert.length) {
            const inserted = results[0]; // insertMany() resolves to an array
            state.marks = [...(state.marks || []), ...inserted];
            inserted.forEach(row => {
                const s = roster.find(r => r.student_id === row.student_id);
                if (s) s.markId = row.id;
            });
        }
        toUpdate.forEach(s => {
            const existing = (state.marks || []).find(m => m.id === s.markId);
            if (existing) { existing.score = s.score; existing.is_absent = s.is_absent; }
        });

        dirtyStudentIds = new Set();
        lastSavedAt = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
        renderSaveStatus();
        notify(`Saved ${dirty.length} mark${dirty.length === 1 ? '' : 's'}`, 'success');
    } catch (err) {
        notify(`Could not save marks: ${err.message}`, 'error');
    } finally {
        if (saveBtn) saveBtn.disabled = false;
        if (saveAllBtn) saveAllBtn.disabled = false;
    }
}

// ─── TOAST HELPER (defers to the real toast.js if present) ─────────

function notify(message, type = 'info') {
    if (typeof window.showToast === 'function') {
        window.showToast(message, type);
    }
}

// ─── DESTROY ─────────────────────────────────────────────────────────

function destroyMarksEntry() {
    if (chartInstances.distribution) {
        chartInstances.distribution.destroy();
        chartInstances.distribution = null;
    }
}

// ─── EXPOSE ──────────────────────────────────────────────────────────

window.renderMarksEntry = renderMarksEntry;
window.destroyMarksEntry = destroyMarksEntry;
