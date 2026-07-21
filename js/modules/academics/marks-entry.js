/* ═══════════════════════════════════════════════════════════════════
   js/modules/academics/marks-entry.js
   ═══════════════════════════════════════════════════════════════════
   Rendered into #mainContent by core/router.js for 'marks-entry'.

   Teacher-facing grid for entering marks against a single assessment
   (class + subject + type + max marks). Styled with the real project
   CSS: css/modules/marks.css (toolbar, phase tabs, entry table, mark
   inputs, validation popup, save bar) plus the shared component
   library (css/components/badges.css grade pills, buttons.css,
   pagination.css). No native prompt()/confirm() — the 3-choice
   validation popup replaces it per the marks.css header comment.

   MOCK_DATA below stands in for the real class roster + assessment
   record until core/api.js can query Supabase; the shape mirrors
   what the eventual API response should look like.

   Last updated: 2026-07-14
   ═══════════════════════════════════════════════════════════════════ */

// esc is a plain-script global defined in core/utils.js, loaded earlier in index.html.

// ─── MOCK DATA ─────────────────────────────────────────────────────

const CLASS_OPTIONS = [
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

const TYPE_OPTIONS = [
    { value: 'quiz', label: 'Quiz' },
    { value: 'assignment', label: 'Assignment' },
    { value: 'midterm', label: 'Mid-Term' },
    { value: 'exam', label: 'Exam' },
    { value: 'final', label: 'Final Exam' }
];

const PHASES = ['Pre-Midterm', 'Post-Midterm', 'Annual'];

function buildMockStudents() {
    return [
        { id: 1, name: 'HABIMANA Eric', score: 48, absent: false },
        { id: 2, name: 'INGABIRE Sarah', score: 45, absent: false },
        { id: 3, name: 'KAMALI Moses', score: 42, absent: false },
        { id: 4, name: 'MUGISHA Jean', score: 38, absent: false },
        { id: 5, name: 'NIYONZIMA Claire', score: 35, absent: false },
        { id: 6, name: 'UWERA Grace', score: 28, absent: false },
        { id: 7, name: 'ISHIMWE Jean', score: 25, absent: false },
        { id: 8, name: 'MUKAMANA Ange', score: 18, absent: false },
        { id: 9, name: 'MUGISHA Paul', score: null, absent: true },
        { id: 10, name: 'NKURUNZIZA Alice', score: 12, absent: false },
        { id: 11, name: 'HABIMANA Jean', score: 47, absent: false },
        { id: 12, name: 'KAMALI Grace', score: 30, absent: false },
        { id: 13, name: 'MUGISHA Grace', score: 22, absent: false },
        { id: 14, name: 'UWIMANA Alice', score: 40, absent: false },
        { id: 15, name: 'BIZIMANA Eric', score: null, absent: false },
        { id: 16, name: 'NSHIMIYE Paul', score: 33, absent: false },
        { id: 17, name: 'MUTONI Divine', score: 44, absent: false },
        { id: 18, name: 'KAGABO Fabrice', score: null, absent: false },
        { id: 19, name: 'UMUTONI Aline', score: 41, absent: false },
        { id: 20, name: 'NIYOMUGABO Eric', score: 19, absent: false },
        { id: 21, name: 'MUKANDAYISENGA Jo', score: null, absent: false },
        { id: 22, name: 'HAKIZIMANA Paul', score: 36, absent: false },
        { id: 23, name: 'IRADUKUNDA Sonia', score: null, absent: false },
        { id: 24, name: 'RUTAYISIRE Eric', score: 29, absent: false },
        { id: 25, name: 'UWASE Diane', score: 46, absent: false },
        { id: 26, name: 'NDAYISABA Alex', score: 15, absent: false },
        { id: 27, name: 'KWIZERA Blaise', score: 39, absent: false },
        { id: 28, name: 'AKIMANA Belise', score: 37, absent: false }
    ];
}

// ─── STATE ───────────────────────────────────────────────────────────
// Real state (not MOCK_DATA) — the current entry session.

let assessment = {
    classId: 'p4a',
    subject: 'math',
    type: 'quiz',
    name: 'Quiz 4',
    maxMarks: 50,
    date: '2026-06-26',
    phase: 'Post-Midterm',
    locked: false
};

let students = buildMockStudents();
let currentPage = 1;
const ITEMS_PER_PAGE = 10;
let dirtyCount = 0;
let lastSavedAt = null;
let chartInstances = { distribution: null };
let activePopup = null;

// ─── GRADE / STATUS LOGIC ────────────────────────────────────────────

function getGrade(score) {
    if (score === null || score === undefined) return { grade: '—', cls: '' };
    const pct = (score / assessment.maxMarks) * 100;
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
    const pct = (score / assessment.maxMarks) * 100;
    if (pct >= 60) return { label: 'Pass', badgeCls: 'badge-success' };
    if (pct >= 50) return { label: 'Low', badgeCls: 'badge-warning' };
    return { label: 'Fail', badgeCls: 'badge-danger' };
}

function getInputClass(score, isAbsent) {
    if (isAbsent) return '';
    if (score === null || score === undefined) return 'mark-empty';
    const pct = (score / assessment.maxMarks) * 100;
    if (pct >= 60) return 'mark-pass';
    if (pct >= 50) return 'mark-borderline';
    return 'mark-fail';
}

// ─── RENDER ────────────────────────────────────────────────────────

function renderMarksEntry(container) {
    if (!container) {
        console.warn('[MarksEntry] No container provided');
        return;
    }

    container.innerHTML = `
        <div class="marks-entry-page">

            <!-- ═══ TOOLBAR ═══ -->
            <div class="marks-toolbar">
                <select class="marks-toolbar__select" id="me-class">
                    ${CLASS_OPTIONS.map(o => `<option value="${o.value}" ${o.value === assessment.classId ? 'selected' : ''}>${esc(o.label)}</option>`).join('')}
                </select>
                <select class="marks-toolbar__select" id="me-subject">
                    ${SUBJECT_OPTIONS.map(o => `<option value="${o.value}" ${o.value === assessment.subject ? 'selected' : ''}>${esc(o.label)}</option>`).join('')}
                </select>
                <select class="marks-toolbar__select" id="me-type">
                    ${TYPE_OPTIONS.map(o => `<option value="${o.value}" ${o.value === assessment.type ? 'selected' : ''}>${esc(o.label)}</option>`).join('')}
                </select>
                <input type="text" id="me-name" value="${esc(assessment.name)}" placeholder="Assessment name" style="min-width:140px;" />
                <input type="number" id="me-max" value="${assessment.maxMarks}" min="1" style="width:80px;" title="Max marks" />
                <input type="date" id="me-date" value="${esc(assessment.date)}" />

                <div class="phase-tabs" id="me-phase-tabs">
                    ${PHASES.map(p => `<span class="phase-tab ${p === assessment.phase ? 'active' : ''}" data-phase="${esc(p)}">${esc(p)}</span>`).join('')}
                </div>

                <span class="marks-toolbar__spacer"></span>

                <span class="assessment-lock-badge ${assessment.locked ? 'locked' : 'open'}" id="me-lock-badge">
                    <i class="fa-solid ${assessment.locked ? 'fa-lock' : 'fa-lock-open'}"></i>
                    ${assessment.locked ? 'Locked' : 'Open'}
                </span>
                <button class="btn btn-secondary btn-sm" id="me-load-btn">
                    <i class="fa-solid fa-users"></i> Load Students
                </button>
                <button class="btn ${assessment.locked ? 'btn-outline-warning' : 'btn-outline-danger'} btn-sm" id="me-lock-btn">
                    <i class="fa-solid ${assessment.locked ? 'fa-lock-open' : 'fa-lock'}"></i> ${assessment.locked ? 'Unlock' : 'Lock'}
                </button>
            </div>

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
                            <th>Score / <span id="me-max-label">${assessment.maxMarks}</span></th>
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
                    <button class="btn btn-ghost btn-sm" id="me-review"><i class="fa-regular fa-file-lines"></i> Review &amp; Summary</button>
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
}

// ─── TABLE ────────────────────────────────────────────────────────

function renderTable() {
    const tbody = document.getElementById('me-table-body');
    if (!tbody) return;

    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    const end = Math.min(start + ITEMS_PER_PAGE, students.length);
    const pageData = students.slice(start, end);

    tbody.innerHTML = pageData.map((s, idx) => {
        const globalIdx = start + idx + 1;
        const grade = getGrade(s.score);
        const status = getStatus(s.score, s.absent);
        const displayScore = s.score !== null && s.score !== undefined ? s.score : '';

        return `
            <tr data-row-id="${s.id}">
                <td class="student-num-cell">${globalIdx}</td>
                <td class="student-name-cell">${esc(s.name)}</td>
                <td>
                    <input
                        type="number"
                        class="marks-input ${getInputClass(s.score, s.absent)}"
                        value="${displayScore}"
                        min="0"
                        max="${assessment.maxMarks}"
                        data-id="${s.id}"
                        ${s.absent ? 'disabled' : ''}
                    /> / ${assessment.maxMarks}
                </td>
                <td>${s.score !== null && s.score !== undefined ? Math.round((s.score / assessment.maxMarks) * 100) + '%' : '—'}</td>
                <td><span class="badge ${grade.cls}">${grade.grade}</span></td>
                <td><input type="checkbox" class="checkbox" data-absent-id="${s.id}" ${s.absent ? 'checked' : ''} /></td>
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
            const student = students.find(s => s.id === id);
            if (!student) return;
            student.absent = e.target.checked;
            if (student.absent) student.score = null;
            markDirty();
            renderTable();
            renderStatStrip();
            renderDistributionChart();
        });
    });

    renderPagination();
    renderStatStrip();
}

function handleScoreChange(input) {
    const id = parseInt(input.dataset.id, 10);
    const student = students.find(s => s.id === id);
    if (!student) return;

    const raw = input.value.trim();
    const numeric = raw === '' ? null : Number(raw);

    if (numeric !== null && (Number.isNaN(numeric) || numeric > assessment.maxMarks || numeric < 0)) {
        showValidationPopup(input, student, numeric);
        return;
    }

    student.score = numeric;
    markDirty();
    renderTable();
    renderDistributionChart();
}

// ─── VALIDATION POPUP (replaces native prompt/confirm) ─────────────

function closeValidationPopup() {
    if (activePopup) {
        activePopup.remove();
        activePopup = null;
    }
}

function showValidationPopup(input, student, attemptedValue) {
    closeValidationPopup();

    const outOfRange = attemptedValue !== null && !Number.isNaN(attemptedValue);
    const clamped = outOfRange ? Math.max(0, Math.min(assessment.maxMarks, attemptedValue)) : 0;

    const popup = document.createElement('div');
    popup.className = 'mark-validation-popup';
    popup.innerHTML = `
        <div class="mark-validation-popup__msg">
            ${outOfRange
            ? `<strong>${esc(String(attemptedValue))}</strong> is outside the valid range (0–${assessment.maxMarks}) for ${esc(student.name)}.`
            : `That doesn't look like a valid number for ${esc(student.name)}.`}
        </div>
        <div class="mark-validation-popup__choices">
            ${outOfRange ? `<button class="mark-validation-popup__choice primary" data-action="clamp">Use ${clamped}/${assessment.maxMarks}</button>` : ''}
            <button class="mark-validation-popup__choice" data-action="retry">Re-enter</button>
            <button class="mark-validation-popup__choice cancel" data-action="cancel">Cancel</button>
        </div>
    `;

    const rect = input.getBoundingClientRect();
    popup.style.position = 'fixed';
    popup.style.top = `${rect.bottom + 6}px`;
    popup.style.left = `${rect.left}px`;
    document.body.appendChild(popup);
    activePopup = popup;

    popup.querySelector('[data-action="clamp"]')?.addEventListener('click', () => {
        student.score = clamped;
        markDirty();
        closeValidationPopup();
        renderTable();
        renderDistributionChart();
    });
    popup.querySelector('[data-action="retry"]').addEventListener('click', () => {
        closeValidationPopup();
        input.value = student.score !== null && student.score !== undefined ? student.score : '';
        input.focus();
    });
    popup.querySelector('[data-action="cancel"]').addEventListener('click', () => {
        closeValidationPopup();
        input.value = student.score !== null && student.score !== undefined ? student.score : '';
    });

    setTimeout(() => {
        document.addEventListener('click', onDocClickCloseValidation, { once: true });
    }, 0);
}

function onDocClickCloseValidation(e) {
    if (activePopup && !activePopup.contains(e.target)) {
        closeValidationPopup();
    }
}

// ─── STAT STRIP ──────────────────────────────────────────────────────

function renderStatStrip() {
    const el = document.getElementById('me-stat-strip');
    if (!el) return;

    const total = students.length;
    const entered = students.filter(s => s.score !== null && s.score !== undefined).length;
    const missing = total - entered - students.filter(s => s.absent).length;
    const scored = students.filter(s => s.score !== null && s.score !== undefined);
    const avg = scored.length ? (scored.reduce((sum, s) => sum + s.score, 0) / scored.length) : 0;
    const passCount = scored.filter(s => (s.score / assessment.maxMarks) * 100 >= 60).length;
    const passRate = scored.length ? (passCount / scored.length) * 100 : 0;
    const highest = scored.length ? Math.max(...scored.map(s => s.score)) : 0;

    const items = [
        { value: total, label: 'Students' },
        { value: entered, label: 'Entered' },
        { value: Math.max(missing, 0), label: 'Missing' },
        { value: `${avg.toFixed(1)}<span class="suffix">/${assessment.maxMarks}</span>`, label: 'Average' },
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

    const totalPages = Math.max(1, Math.ceil(students.length / ITEMS_PER_PAGE));
    const start = (currentPage - 1) * ITEMS_PER_PAGE + 1;
    const end = Math.min(currentPage * ITEMS_PER_PAGE, students.length);

    info.innerHTML = `Showing <span class="range">${start}–${end}</span> of <span class="total">${students.length}</span> students`;

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
            const totalP = Math.max(1, Math.ceil(students.length / ITEMS_PER_PAGE));
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
    const scored = students.filter(s => s.score !== null && s.score !== undefined);
    const counts = bands.map(b => 0);

    scored.forEach(s => {
        const pct = (s.score / assessment.maxMarks) * 100;
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
    container.querySelector('#me-class')?.addEventListener('change', (e) => {
        assessment.classId = e.target.value;
        loadStudentsForContext();
    });
    container.querySelector('#me-subject')?.addEventListener('change', (e) => {
        assessment.subject = e.target.value;
    });
    container.querySelector('#me-type')?.addEventListener('change', (e) => {
        assessment.type = e.target.value;
    });
    container.querySelector('#me-name')?.addEventListener('change', (e) => {
        assessment.name = e.target.value;
    });
    container.querySelector('#me-max')?.addEventListener('change', (e) => {
        const val = parseInt(e.target.value, 10);
        assessment.maxMarks = Number.isFinite(val) && val > 0 ? val : assessment.maxMarks;
        document.getElementById('me-max-label').textContent = assessment.maxMarks;
        renderTable();
        renderDistributionChart();
    });
    container.querySelector('#me-date')?.addEventListener('change', (e) => {
        assessment.date = e.target.value;
    });

    container.querySelector('#me-phase-tabs')?.addEventListener('click', (e) => {
        const tab = e.target.closest('.phase-tab');
        if (!tab) return;
        assessment.phase = tab.dataset.phase;
        container.querySelectorAll('.phase-tab').forEach(t => t.classList.toggle('active', t === tab));
    });

    container.querySelector('#me-load-btn')?.addEventListener('click', () => loadStudentsForContext());

    container.querySelector('#me-lock-btn')?.addEventListener('click', () => {
        assessment.locked = !assessment.locked;
        renderMarksEntry(container);
        notify(assessment.locked ? 'Assessment locked' : 'Assessment unlocked', 'info');
    });

    container.querySelector('#me-select-all')?.addEventListener('click', () => {
        document.querySelectorAll('.marks-entry-table [data-absent-id]').forEach(cb => { cb.checked = true; });
        notify('All rows selected', 'info');
    });

    container.querySelector('#me-mark-absent')?.addEventListener('click', () => {
        const checked = Array.from(document.querySelectorAll('.marks-entry-table [data-absent-id]:checked'));
        if (!checked.length) {
            notify('Select students first', 'warning');
            return;
        }
        checked.forEach(cb => {
            const id = parseInt(cb.dataset.absentId, 10);
            const student = students.find(s => s.id === id);
            if (student) { student.absent = true; student.score = null; }
        });
        markDirty();
        renderTable();
        renderStatStrip();
        renderDistributionChart();
        notify(`${checked.length} students marked absent`, 'success');
    });

    container.querySelector('#me-save-all')?.addEventListener('click', () => saveMarks());
}

function loadStudentsForContext() {
    // TODO: replace with a real API call keyed on assessment.classId/subject/type
    students = buildMockStudents();
    currentPage = 1;
    dirtyCount = 0;
    renderTable();
    renderDistributionChart();
    notify('Students loaded', 'success');
}

// ─── FOOTER WIRING ───────────────────────────────────────────────────

function wireFooter(container) {
    container.querySelector('#me-save')?.addEventListener('click', () => saveMarks());
    container.querySelector('#me-review')?.addEventListener('click', () => {
        notify('Review & Summary is not wired to a real view yet', 'info');
    });
    container.querySelector('#me-clear')?.addEventListener('click', () => {
        showClearAllConfirm();
    });

    renderSaveStatus();
}

function showClearAllConfirm() {
    closeValidationPopup();
    const popup = document.createElement('div');
    popup.className = 'mark-validation-popup';
    popup.style.position = 'fixed';
    popup.style.top = '50%';
    popup.style.left = '50%';
    popup.style.transform = 'translate(-50%, -50%)';
    popup.innerHTML = `
        <div class="mark-validation-popup__msg">
            Clear all <strong>${students.length}</strong> entered marks for this assessment? This cannot be undone.
        </div>
        <div class="mark-validation-popup__choices">
            <button class="mark-validation-popup__choice primary" data-action="confirm-clear">Clear All</button>
            <button class="mark-validation-popup__choice cancel" data-action="cancel-clear">Cancel</button>
        </div>
    `;
    document.body.appendChild(popup);
    activePopup = popup;

    popup.querySelector('[data-action="confirm-clear"]').addEventListener('click', () => {
        students.forEach(s => { if (!s.absent) s.score = null; });
        markDirty();
        closeValidationPopup();
        renderTable();
        renderDistributionChart();
        notify('All marks cleared', 'warning');
    });
    popup.querySelector('[data-action="cancel-clear"]').addEventListener('click', closeValidationPopup);
}

function markDirty() {
    dirtyCount++;
    renderSaveStatus();
}

function renderSaveStatus() {
    const el = document.getElementById('me-save-status');
    if (!el) return;

    if (dirtyCount > 0) {
        el.className = 'marks-save-bar__status dirty';
        el.innerHTML = `<i class="fa-solid fa-circle-exclamation"></i> ${dirtyCount} unsaved change${dirtyCount === 1 ? '' : 's'}`;
    } else if (lastSavedAt) {
        el.className = 'marks-save-bar__status saved';
        el.innerHTML = `<i class="fa-solid fa-circle-check"></i> Saved at ${lastSavedAt}`;
    } else {
        el.className = 'marks-save-bar__status';
        el.textContent = 'No changes yet';
    }
}

function saveMarks() {
    // TODO: replace with a real API call persisting `students` for this assessment
    dirtyCount = 0;
    const now = new Date();
    lastSavedAt = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    renderSaveStatus();
    notify('Marks saved', 'success');
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
    closeValidationPopup();
    document.removeEventListener('click', onDocClickCloseValidation);
}

// ─── EXPOSE ──────────────────────────────────────────────────────────

window.renderMarksEntry = renderMarksEntry;
window.destroyMarksEntry = destroyMarksEntry;