/* ═══════════════════════════════════════════════════════════════════
   js/modules/academics/marks-database.js
   ═══════════════════════════════════════════════════════════════════
   Rendered into #mainContent by core/router.js for 'marks-database'.

   Read-only, filterable, searchable cross-tab of every recorded mark
   for a class/subject — one row per student, one column per
   assessment. Styled with css/modules/marks.css (marks-db-filters,
   grade-pill, subject-chip, marks-stat-strip) and the shared
   component library (badges.css, buttons.css, pagination.css).

   MOCK_DATA stands in for the real Supabase query until core/api.js
   is wired up; the shape mirrors what the eventual API response
   should look like (one row per student, keyed scores per assessment id).

   Last updated: 2026-07-14
   ═══════════════════════════════════════════════════════════════════ */

import { esc } from '../../core/utils.js';

// ─── MOCK DATA ─────────────────────────────────────────────────────

const CLASS_OPTIONS = [
    { value: 'all', label: 'All Classes' },
    { value: 'p4a', label: 'Primary 4A' },
    { value: 'p3', label: 'Primary 3' },
    { value: 'p5b', label: 'Primary 5B' },
    { value: 'p6', label: 'Primary 6' }
];

const SUBJECT_OPTIONS = [
    { value: 'all', label: 'All Subjects', color: '#8b5cf6' },
    { value: 'math', label: 'Mathematics', color: '#3a7a5a' },
    { value: 'eng', label: 'English', color: '#4a7a8a' },
    { value: 'kiny', label: 'Kinyarwanda', color: '#b8983a' },
    { value: 'sci', label: 'Science', color: '#c45a4a' }
];

const TERM_OPTIONS = [
    { value: 'all', label: 'All Terms' },
    { value: '3', label: 'Term 3' },
    { value: '2', label: 'Term 2' },
    { value: '1', label: 'Term 1' }
];

const ASSESSMENTS = [
    { id: 'quiz1', label: 'Quiz 1', max: 20 },
    { id: 'quiz2', label: 'Quiz 2', max: 20 },
    { id: 'quiz3', label: 'Quiz 3', max: 20 },
    { id: 'quiz4', label: 'Quiz 4', max: 50 },
    { id: 'midterm', label: 'Mid-Term', max: 100 },
    { id: 'assignment', label: 'Assignment', max: 30 },
    { id: 'exam1', label: 'Exam 1', max: 100 }
];

function buildMockRows() {
    // Deterministic-looking mock scores per student per assessment.
    // Some cells are intentionally null to represent "not entered".
    const names = [
        'HABIMANA Eric', 'INGABIRE Sarah', 'KAMALI Moses', 'MUGISHA Jean',
        'NIYONZIMA Claire', 'UWERA Grace', 'ISHIMWE Jean', 'MUKAMANA Ange',
        'MUGISHA Paul', 'NKURUNZIZA Alice', 'HABIMANA Jean', 'KAMALI Grace',
        'MUGISHA Grace', 'UWIMANA Alice', 'BIZIMANA Eric', 'NSHIMIYE Paul',
        'MUTONI Divine', 'KAGABO Fabrice', 'UMUTONI Aline', 'NIYOMUGABO Eric',
        'MUKANDAYISENGA Jo', 'HAKIZIMANA Paul', 'IRADUKUNDA Sonia',
        'RUTAYISIRE Eric', 'UWASE Diane', 'NDAYISABA Alex', 'KWIZERA Blaise',
        'AKIMANA Belise'
    ];

    let seed = 17;
    const rand = () => {
        seed = (seed * 9301 + 49297) % 233280;
        return seed / 233280;
    };

    return names.map((name, idx) => {
        const scores = {};
        ASSESSMENTS.forEach(a => {
            const skip = rand() < 0.08;
            scores[a.id] = skip ? null : Math.round(a.max * (0.35 + rand() * 0.62));
        });
        return {
            id: idx + 1,
            name,
            classId: 'p4a',
            subject: 'math',
            term: '3',
            scores
        };
    });
}

// ─── STATE ───────────────────────────────────────────────────────────

let rows = buildMockRows();
let filters = { classId: 'all', subject: 'all', term: 'all', assessment: 'all', search: '' };
let currentPage = 1;
const ITEMS_PER_PAGE = 8;

// ─── GRADE HELPERS ───────────────────────────────────────────────────

function getGradeClass(score, max) {
    if (score === null || score === undefined) return '';
    const pct = (score / max) * 100;
    if (pct >= 90) return 'grade-Ap';
    if (pct >= 80) return 'grade-A';
    if (pct >= 70) return 'grade-B';
    if (pct >= 60) return 'grade-C';
    if (pct >= 50) return 'grade-D';
    return 'grade-F';
}

function getGradeLabel(score, max) {
    if (score === null || score === undefined) return '—';
    const pct = (score / max) * 100;
    if (pct >= 90) return 'A+';
    if (pct >= 80) return 'A';
    if (pct >= 70) return 'B';
    if (pct >= 60) return 'C';
    if (pct >= 50) return 'D';
    return 'F';
}

// ─── FILTERING ───────────────────────────────────────────────────────

function getFilteredRows() {
    return rows.filter(r => {
        if (filters.classId !== 'all' && r.classId !== filters.classId) return false;
        if (filters.subject !== 'all' && r.subject !== filters.subject) return false;
        if (filters.term !== 'all' && r.term !== filters.term) return false;
        if (filters.search && !r.name.toLowerCase().includes(filters.search.toLowerCase())) return false;
        return true;
    });
}

function getVisibleAssessments() {
    if (filters.assessment === 'all') return ASSESSMENTS;
    return ASSESSMENTS.filter(a => a.id === filters.assessment);
}

// ─── RENDER ────────────────────────────────────────────────────────

function renderMarksDatabase(container) {
    if (!container) {
        console.warn('[MarksDatabase] No container provided');
        return;
    }

    container.innerHTML = `
        <div class="marks-database-page">

            <!-- ═══ FILTERS ═══ -->
            <div class="marks-db-filters">
                <select class="marks-toolbar__select" id="db-class">
                    ${CLASS_OPTIONS.map(o => `<option value="${o.value}" ${o.value === filters.classId ? 'selected' : ''}>${esc(o.label)}</option>`).join('')}
                </select>
                <select class="marks-toolbar__select" id="db-subject">
                    ${SUBJECT_OPTIONS.map(o => `<option value="${o.value}" ${o.value === filters.subject ? 'selected' : ''}>${esc(o.label)}</option>`).join('')}
                </select>
                <select class="marks-toolbar__select" id="db-term">
                    ${TERM_OPTIONS.map(o => `<option value="${o.value}" ${o.value === filters.term ? 'selected' : ''}>${esc(o.label)}</option>`).join('')}
                </select>
                <select class="marks-toolbar__select" id="db-assessment">
                    <option value="all" ${filters.assessment === 'all' ? 'selected' : ''}>All Assessments</option>
                    ${ASSESSMENTS.map(a => `<option value="${a.id}" ${a.id === filters.assessment ? 'selected' : ''}>${esc(a.label)}</option>`).join('')}
                </select>
                <input type="text" id="db-search" placeholder="Search student..." value="${esc(filters.search)}" style="min-width:180px;" />
                <button class="btn btn-primary btn-sm" id="db-search-btn"><i class="fa-solid fa-magnifying-glass"></i> Search</button>
                <span class="marks-toolbar__spacer"></span>
                <button class="btn btn-outline-primary btn-sm" id="db-export"><i class="fa-solid fa-file-export"></i> Export CSV</button>
            </div>

            <!-- ═══ QUICK STATS ═══ -->
            <div class="card" style="padding:4px 0;margin-bottom:16px;">
                <div class="marks-stat-strip" id="db-stat-strip"></div>
            </div>

            <!-- ═══ SUBJECT LEGEND ═══ -->
            <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px;" id="db-subject-legend"></div>

            <!-- ═══ MARKS TABLE ═══ -->
            <div class="marks-entry-wrap">
                <div class="marks-toolbar" style="border:none;border-bottom:1px solid var(--card-border, rgba(255,255,255,0.07));border-radius:0;margin-bottom:0;">
                    <span class="title" style="font-weight:700;font-size:0.85rem;"><i class="fa-solid fa-table"></i> Marks Table</span>
                    <span class="marks-toolbar__spacer"></span>
                    <span class="badge" id="db-count-badge"></span>
                </div>
                <div style="overflow-x:auto;">
                    <table class="marks-db-table" id="db-table" style="width:100%;border-collapse:collapse;min-width:640px;">
                        <thead id="db-table-head"></thead>
                        <tbody id="db-table-body"></tbody>
                    </table>
                </div>
                <div class="pagination-wrapper">
                    <div class="pagination-info" id="db-pagination-info"></div>
                    <div class="pagination-controls" id="db-pagination"></div>
                </div>
            </div>

        </div>
    `;

    renderSubjectLegend(container);
    renderAll();
    wireFilters(container);
}

function renderSubjectLegend(container) {
    const el = container.querySelector('#db-subject-legend');
    if (!el) return;
    el.innerHTML = SUBJECT_OPTIONS.filter(s => s.value !== 'all').map(s => `
        <span class="subject-chip" style="background:${s.color}1f;color:${s.color};">
            <span class="subject-chip__dot" style="background:${s.color};"></span>${esc(s.label)}
        </span>
    `).join('');
}

function renderAll() {
    renderTableHead();
    renderTableBody();
    renderPagination();
    renderStatStrip();
}

// ─── TABLE HEAD ──────────────────────────────────────────────────────

function renderTableHead() {
    const thead = document.getElementById('db-table-head');
    if (!thead) return;

    const cols = getVisibleAssessments();
    thead.innerHTML = `
        <tr>
            <th style="position:sticky;left:0;z-index:2;background:var(--bg-card, #fcfaf8);text-align:left;padding:10px 12px;">Student</th>
            ${cols.map(a => `<th style="text-align:center;padding:10px 12px;white-space:nowrap;">${esc(a.label)}<div style="font-weight:400;font-size:0.65rem;opacity:0.6;">/${a.max}</div></th>`).join('')}
        </tr>
    `;
}

// ─── TABLE BODY ──────────────────────────────────────────────────────

function renderTableBody() {
    const tbody = document.getElementById('db-table-body');
    const countBadge = document.getElementById('db-count-badge');
    if (!tbody) return;

    const filtered = getFilteredRows();
    const cols = getVisibleAssessments();
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    const pageRows = filtered.slice(start, start + ITEMS_PER_PAGE);

    if (countBadge) countBadge.textContent = `Showing ${pageRows.length} of ${filtered.length} students`;

    if (!pageRows.length) {
        tbody.innerHTML = `<tr><td colspan="${cols.length + 1}" style="text-align:center;padding:24px;color:var(--text-soft);">No matching students.</td></tr>`;
        return;
    }

    tbody.innerHTML = pageRows.map(r => `
        <tr>
            <td class="student-name-cell" style="position:sticky;left:0;background:var(--bg-card, #fcfaf8);font-weight:600;padding:8px 12px;white-space:nowrap;">${esc(r.name)}</td>
            ${cols.map(a => {
        const score = r.scores[a.id];
        const gradeCls = getGradeClass(score, a.max);
        const gradeLabel = getGradeLabel(score, a.max);
        return `
                    <td class="grade-cell" style="text-align:center;padding:8px 12px;">
                        ${score !== null && score !== undefined
                ? `<span class="grade-pill ${gradeCls}" title="${score}/${a.max}">${score}</span> <span style="font-size:0.65rem;opacity:0.6;">${gradeLabel}</span>`
                : `<span style="color:var(--text-muted);">—</span>`}
                    </td>
                `;
    }).join('')}
        </tr>
    `).join('');
}

// ─── STAT STRIP ──────────────────────────────────────────────────────

function renderStatStrip() {
    const el = document.getElementById('db-stat-strip');
    if (!el) return;

    const filtered = getFilteredRows();
    const cols = getVisibleAssessments();
    const allScores = [];
    filtered.forEach(r => cols.forEach(a => {
        const s = r.scores[a.id];
        if (s !== null && s !== undefined) allScores.push((s / a.max) * 100);
    }));

    const total = allScores.length;
    const avg = total ? allScores.reduce((a, b) => a + b, 0) / total : 0;
    const highest = total ? Math.max(...allScores) : 0;
    const lowest = total ? Math.min(...allScores) : 0;
    const passCount = allScores.filter(s => s >= 60).length;
    const passRate = total ? (passCount / total) * 100 : 0;

    const items = [
        { value: total, label: 'Total Marks' },
        { value: `${avg.toFixed(1)}<span class="suffix">%</span>`, label: 'Average' },
        { value: `${passRate.toFixed(1)}<span class="suffix">%</span>`, label: 'Pass Rate' },
        { value: `${highest.toFixed(0)}<span class="suffix">%</span>`, label: 'Highest' },
        { value: `${lowest.toFixed(0)}<span class="suffix">%</span>`, label: 'Lowest' },
        { value: filtered.length, label: 'Students' }
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
    const info = document.getElementById('db-pagination-info');
    const controls = document.getElementById('db-pagination');
    if (!info || !controls) return;

    const filtered = getFilteredRows();
    const totalPages = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE));
    const start = filtered.length ? (currentPage - 1) * ITEMS_PER_PAGE + 1 : 0;
    const end = Math.min(currentPage * ITEMS_PER_PAGE, filtered.length);

    info.innerHTML = `Showing <span class="range">${start}–${end}</span> of <span class="total">${filtered.length}</span> students`;

    let html = `<button class="page-btn ${currentPage === 1 ? 'disabled' : ''}" data-page-delta="-1"><i class="fa-solid fa-chevron-left"></i></button>`;
    for (let i = 1; i <= totalPages; i++) {
        html += `<button class="page-btn ${i === currentPage ? 'active' : ''}" data-page-go="${i}">${i}</button>`;
    }
    html += `<button class="page-btn ${currentPage === totalPages ? 'disabled' : ''}" data-page-delta="1"><i class="fa-solid fa-chevron-right"></i></button>`;
    controls.innerHTML = html;

    controls.querySelectorAll('[data-page-go]').forEach(btn => {
        btn.addEventListener('click', () => {
            currentPage = parseInt(btn.dataset.pageGo, 10);
            renderTableBody();
            renderPagination();
        });
    });
    controls.querySelectorAll('[data-page-delta]').forEach(btn => {
        btn.addEventListener('click', () => {
            const totalP = Math.max(1, Math.ceil(getFilteredRows().length / ITEMS_PER_PAGE));
            const next = currentPage + parseInt(btn.dataset.pageDelta, 10);
            if (next < 1 || next > totalP) return;
            currentPage = next;
            renderTableBody();
            renderPagination();
        });
    });
}

// ─── FILTER WIRING ───────────────────────────────────────────────────

function wireFilters(container) {
    container.querySelector('#db-class')?.addEventListener('change', (e) => {
        filters.classId = e.target.value;
        applyFilters();
    });
    container.querySelector('#db-subject')?.addEventListener('change', (e) => {
        filters.subject = e.target.value;
        applyFilters();
    });
    container.querySelector('#db-term')?.addEventListener('change', (e) => {
        filters.term = e.target.value;
        applyFilters();
    });
    container.querySelector('#db-assessment')?.addEventListener('change', (e) => {
        filters.assessment = e.target.value;
        renderTableHead();
        applyFilters();
    });
    container.querySelector('#db-search')?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            filters.search = e.target.value;
            applyFilters();
        }
    });
    container.querySelector('#db-search-btn')?.addEventListener('click', () => {
        const input = container.querySelector('#db-search');
        filters.search = input ? input.value : '';
        applyFilters();
    });
    container.querySelector('#db-export')?.addEventListener('click', () => exportCsv());
}

function applyFilters() {
    currentPage = 1;
    renderTableBody();
    renderPagination();
    renderStatStrip();
}

// ─── CSV EXPORT ──────────────────────────────────────────────────────

function exportCsv() {
    const filtered = getFilteredRows();
    const cols = getVisibleAssessments();
    const header = ['Student', ...cols.map(c => c.label)].join(',');
    const lines = filtered.map(r => {
        const cells = cols.map(a => {
            const s = r.scores[a.id];
            return s !== null && s !== undefined ? s : '';
        });
        return [`"${r.name}"`, ...cells].join(',');
    });
    const csv = [header, ...lines].join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'marks-database-export.csv';
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);

    notify('CSV export started', 'success');
}

// ─── TOAST HELPER ────────────────────────────────────────────────────

function notify(message, type = 'info') {
    if (typeof window.showToast === 'function') {
        window.showToast(message, type);
    }
}

// ─── DESTROY ─────────────────────────────────────────────────────────

function destroyMarksDatabase() {
    // No chart instances or intervals in this module — nothing to tear down
    // yet, but kept as a named export so router.js has a consistent
    // destroy() contract across every academics module.
}

// ─── EXPOSE ──────────────────────────────────────────────────────────

export { renderMarksDatabase, destroyMarksDatabase };
export default renderMarksDatabase;