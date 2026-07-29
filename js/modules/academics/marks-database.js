/* ═══════════════════════════════════════════════════════════════════
   js/modules/academics/marks-database.js
   ═══════════════════════════════════════════════════════════════════
   Rendered into #mainContent by core/router.js for 'marks-database'.

   Read-only, filterable, searchable cross-tab of every recorded mark
   for a class — one row per student, one column per assessment.
   Styled with css/modules/marks.css (marks-db-filters, grade-pill,
   subject-chip, marks-stat-strip) and the shared component library.

   Reads real state.students/classes/subjects/terms/assessments/marks
   (the same tables js/modules/academics/marks-entry.js writes to).
   Since a "row per student, column per assessment" layout only makes
   sense within a single class (different classes have different
   assessments), the Class filter is required — this page prompts for
   one instead of defaulting to a cross-class table that wouldn't line
   up. Subject/Term narrow which assessments show as columns.

   Last updated: 2026-07-28
   ═══════════════════════════════════════════════════════════════════ */

// esc is a plain-script global defined in core/utils.js, loaded earlier in index.html.

// ─── STATE ───────────────────────────────────────────────────────────

let filters = { classId: '', subjectId: 'all', termId: '', assessmentId: 'all', search: '' };
let currentPage = 1;
const ITEMS_PER_PAGE = 8;
let hasTriedLazyLoad = false;

// ─── OPTIONS (real) ──────────────────────────────────────────────────

function getClassOptions() {
    return [...(state.classes || [])].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
}

function getSubjectOptions() {
    return [...(state.subjects || [])].sort((a, b) => (a.sort_order || 99) - (b.sort_order || 99));
}

function getTermOptions() {
    return [...(state.terms || [])].sort((a, b) => (a.term_number || 0) - (b.term_number || 0));
}

const SUBJECT_COLORS = ['#3a7a5a', '#4a7a8a', '#b8983a', '#c45a4a', '#7a5a9a', '#4a5a9a', '#8a6a3a'];
function subjectColor(subjectId) {
    const idx = getSubjectOptions().findIndex(s => s.id === subjectId);
    return SUBJECT_COLORS[idx % SUBJECT_COLORS.length] || '#6a6a6a';
}

// ─── GRADE HELPERS ───────────────────────────────────────────────────

function getGradeClass(score, max) {
    if (score === null || score === undefined || !max) return '';
    const pct = (score / max) * 100;
    if (pct >= 90) return 'grade-Ap';
    if (pct >= 80) return 'grade-A';
    if (pct >= 70) return 'grade-B';
    if (pct >= 60) return 'grade-C';
    if (pct >= 50) return 'grade-D';
    return 'grade-F';
}

function getGradeLabel(score, max) {
    if (score === null || score === undefined || !max) return '—';
    const pct = (score / max) * 100;
    if (pct >= 90) return 'A+';
    if (pct >= 80) return 'A';
    if (pct >= 70) return 'B';
    if (pct >= 60) return 'C';
    if (pct >= 50) return 'D';
    return 'F';
}

// ─── DATA ────────────────────────────────────────────────────────────

/** Real assessments matching the current class/subject/term filters,
 *  used as the table's columns. */
function getVisibleAssessments() {
    if (!filters.classId) return [];
    return (state.assessments || []).filter(a => {
        if (String(a.class_id) !== String(filters.classId)) return false;
        if (filters.termId && String(a.term_id) !== String(filters.termId)) return false;
        if (filters.subjectId !== 'all' && String(a.subject_id) !== String(filters.subjectId)) return false;
        if (filters.assessmentId !== 'all' && String(a.id) !== String(filters.assessmentId)) return false;
        return true;
    }).sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')));
}

/** Real, active students in the selected class, each carrying a
 *  scores map keyed by assessment_id built from real state.marks. */
function getFilteredRows() {
    if (!filters.classId) return [];
    const cols = getVisibleAssessments();
    const marksByAssessment = new Map();
    (state.marks || []).forEach(m => {
        if (!marksByAssessment.has(m.assessment_id)) marksByAssessment.set(m.assessment_id, new Map());
        marksByAssessment.get(m.assessment_id).set(m.student_id, m);
    });

    return (state.students || [])
        .filter(s => String(s.class_id) === String(filters.classId) && !s.is_deleted && (s.status || 'Active') === 'Active')
        .filter(s => {
            if (!filters.search) return true;
            const name = `${s.first_name || ''} ${s.last_name || ''}`.toLowerCase();
            return name.includes(filters.search.toLowerCase());
        })
        .map(s => {
            const scores = {};
            cols.forEach(a => {
                const mark = marksByAssessment.get(a.id)?.get(s.id);
                scores[a.id] = mark && !mark.is_absent ? mark.score : (mark && mark.is_absent ? 'ABS' : null);
            });
            return {
                id: s.id,
                name: `${s.first_name || ''} ${s.last_name || ''}`.trim() || `Student #${s.id}`,
                scores,
            };
        })
        .sort((a, b) => a.name.localeCompare(b.name));
}

// ─── RENDER ────────────────────────────────────────────────────────

function renderMarksDatabase(container) {
    if (!container) {
        console.warn('[MarksDatabase] No container provided');
        return;
    }

    if (!filters.classId) {
        const firstClass = getClassOptions()[0];
        if (firstClass) filters.classId = String(firstClass.id);
    }
    if (!filters.termId && window.getActiveTermId) {
        filters.termId = String(window.getActiveTermId() || '');
    }

    const classOptions = getClassOptions();
    const subjectOptions = getSubjectOptions();
    const termOptions = getTermOptions();
    const assessmentOptions = filters.classId
        ? (state.assessments || []).filter(a =>
            String(a.class_id) === String(filters.classId) &&
            (!filters.termId || String(a.term_id) === String(filters.termId)) &&
            (filters.subjectId === 'all' || String(a.subject_id) === String(filters.subjectId))
        )
        : [];

    container.innerHTML = `
        <div class="marks-database-page">

            <!-- ═══ FILTERS ═══ -->
            <div class="marks-db-filters">
                <select class="marks-toolbar__select" id="db-class">
                    <option value="">Choose a class…</option>
                    ${classOptions.map(c => `<option value="${c.id}" ${String(c.id) === String(filters.classId) ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}
                </select>
                <select class="marks-toolbar__select" id="db-subject">
                    <option value="all">All Subjects</option>
                    ${subjectOptions.map(s => `<option value="${s.id}" ${String(s.id) === String(filters.subjectId) ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}
                </select>
                <select class="marks-toolbar__select" id="db-term">
                    <option value="">All Terms</option>
                    ${termOptions.map(t => `<option value="${t.id}" ${String(t.id) === String(filters.termId) ? 'selected' : ''}>Term ${esc(t.term_number)}</option>`).join('')}
                </select>
                <select class="marks-toolbar__select" id="db-assessment">
                    <option value="all">All Assessments</option>
                    ${assessmentOptions.map(a => `<option value="${a.id}" ${String(a.id) === String(filters.assessmentId) ? 'selected' : ''}>${esc(a.name)}</option>`).join('')}
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

    // assessments/marks for the active term are lazily loaded — trigger
    // once per visit if this session hasn't already, then re-render with
    // real data once available.
    const termId = filters.termId;
    const needsAssessments = termId && !(state.assessments || []).some(a => String(a.term_id) === String(termId));
    if (!hasTriedLazyLoad && termId && needsAssessments) {
        hasTriedLazyLoad = true;
        window.loadAllAssessmentsForTerm?.(termId)
            .then(() => window.loadAllMarksForTerm?.(termId))
            .then(() => { if (container.isConnected) renderMarksDatabase(container); })
            .catch(() => {});
    }
}

function renderSubjectLegend(container) {
    const el = container.querySelector('#db-subject-legend');
    if (!el) return;
    el.innerHTML = getSubjectOptions().map(s => {
        const color = subjectColor(s.id);
        return `
        <span class="subject-chip" style="background:${color}1f;color:${color};">
            <span class="subject-chip__dot" style="background:${color};"></span>${esc(s.name)}
        </span>
    `;
    }).join('');
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
            ${cols.map(a => `<th style="text-align:center;padding:10px 12px;white-space:nowrap;">${esc(a.name)}<div style="font-weight:400;font-size:0.65rem;opacity:0.6;">/${esc(a.max_score)}</div></th>`).join('')}
        </tr>
    `;
}

// ─── TABLE BODY ──────────────────────────────────────────────────────

function renderTableBody() {
    const tbody = document.getElementById('db-table-body');
    const countBadge = document.getElementById('db-count-badge');
    if (!tbody) return;

    if (!filters.classId) {
        tbody.innerHTML = `<tr><td style="text-align:center;padding:32px;color:var(--text-soft);">Choose a class above to see its marks.</td></tr>`;
        if (countBadge) countBadge.textContent = '';
        return;
    }

    const filtered = getFilteredRows();
    const cols = getVisibleAssessments();
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    const pageRows = filtered.slice(start, start + ITEMS_PER_PAGE);

    if (countBadge) countBadge.textContent = `Showing ${pageRows.length} of ${filtered.length} students`;

    if (!cols.length) {
        tbody.innerHTML = `<tr><td style="text-align:center;padding:24px;color:var(--text-soft);">No assessments recorded yet for this class/subject/term.</td></tr>`;
        return;
    }

    if (!pageRows.length) {
        tbody.innerHTML = `<tr><td colspan="${cols.length + 1}" style="text-align:center;padding:24px;color:var(--text-soft);">No matching students.</td></tr>`;
        return;
    }

    tbody.innerHTML = pageRows.map(r => `
        <tr>
            <td class="student-name-cell" style="position:sticky;left:0;background:var(--bg-card, #fcfaf8);font-weight:600;padding:8px 12px;white-space:nowrap;">${esc(r.name)}</td>
            ${cols.map(a => {
        const score = r.scores[a.id];
        if (score === 'ABS') {
            return `<td class="grade-cell" style="text-align:center;padding:8px 12px;"><span class="badge badge-neutral" title="Absent">ABS</span></td>`;
        }
        const gradeCls = getGradeClass(score, a.max_score);
        const gradeLabel = getGradeLabel(score, a.max_score);
        return `
                    <td class="grade-cell" style="text-align:center;padding:8px 12px;">
                        ${score !== null && score !== undefined
                ? `<span class="grade-pill ${gradeCls}" title="${esc(score)}/${esc(a.max_score)}">${esc(score)}</span> <span style="font-size:0.65rem;opacity:0.6;">${gradeLabel}</span>`
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
        if (s !== null && s !== undefined && s !== 'ABS' && a.max_score) allScores.push((s / a.max_score) * 100);
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
        filters.assessmentId = 'all';
        renderMarksDatabase(container);
    });
    container.querySelector('#db-subject')?.addEventListener('change', (e) => {
        filters.subjectId = e.target.value;
        filters.assessmentId = 'all';
        renderMarksDatabase(container);
    });
    container.querySelector('#db-term')?.addEventListener('change', (e) => {
        filters.termId = e.target.value;
        filters.assessmentId = 'all';
        renderMarksDatabase(container);
    });
    container.querySelector('#db-assessment')?.addEventListener('change', (e) => {
        filters.assessmentId = e.target.value;
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
    if (!filtered.length || !cols.length) {
        notify('Nothing to export for the current filters', 'warning');
        return;
    }
    const header = ['Student', ...cols.map(c => c.name)].join(',');
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

window.renderMarksDatabase = renderMarksDatabase;
window.destroyMarksDatabase = destroyMarksDatabase;
