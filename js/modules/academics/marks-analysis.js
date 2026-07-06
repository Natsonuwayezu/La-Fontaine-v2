/**
 * ECOLE LA FONTAINE — Marks Analysis Module
 * Statistical analysis of marks with ASCII charts
 * Last updated: 2026-07-03
 * 
 * CHANGES:
 * - Added academic year detection from sidebar state
 * - Uses selected year from state.filters.academic_year_id
 * - All data filtered by selected academic year
 * - Year indicator in the header
 * - Terms filtered by selected year
 */


import {
    state,
    getClassById,
    getSubjectById,
    getTermById,
    getCurrentAcademicYear,
    getActiveAcademicYearId,
    getTermsByYear,
    getYearData
} from '../../core/state.js';
import { esc, fmtPct } from '../../core/utils.js';
import { getGrade, getGradeClass } from '../../core/formulas.js';
import { asciiHorizontalBar, gradeDistributionChart, chartWithYear } from '../../ui/charts.js';
import { getAll } from '../../core/api.js';

// ──────────────────────────────────────────────────────────────────────
// STATE
// ──────────────────────────────────────────────────────────────────────

let selectedYearId = null;

// ──────────────────────────────────────────────────────────────────────
// MAIN RENDER FUNCTION
// ──────────────────────────────────────────────────────────────────────

export async function renderMarksAnalysis(container) {
    if (!container) return;

    const user = getCurrentUser();
    if (user?.role === 'accountant') {
        container.innerHTML = '<div class="alert alert-danger">Access denied. Accountant cannot access marks analysis.</div>';
        return;
    }

    await ensureStateLoaded();

    // Get selected year from state (set by sidebar)
    selectedYearId = state.filters?.academic_year_id || state.currentAcadYear?.id;
    const selectedYear = (state.academicYears || []).find(y => y.id === selectedYearId);
    const isActiveYear = selectedYear?.is_active === true;
    const years = (state.academicYears || []).sort((a, b) => b.id - a.id);

    let classes = (state.classes || []).filter(c => c.is_active !== false);
    if (user?.role === 'teacher') {
        const assignments = await getAll('teacher_assignments', { teacher_id: user.id });
        const classIds = [...new Set(assignments.map(a => a.class_id))];
        classes = classes.filter(c => classIds.includes(c.id));
    }

    // Get terms for the selected year
    const termsForYear = getTermsByYear(selectedYearId);
    const subjects = (state.subjects || []).filter(s => s.is_active !== false);

    container.innerHTML = `
        <div class="dash-card">
            <div class="dash-card-header" style="flex-wrap:wrap;gap:8px;">
                <span class="dash-card-title">📈 Marks Analysis / Analyse des Notes</span>
                <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;">
                    <select id="analysis-year-filter" onchange="window._onYearChange()" style="padding:6px 12px;border-radius:var(--r-md);border:1px solid var(--border-medium);font-size:0.8rem;">
                        ${years.map(y => `
                            <option value="${y.id}" ${y.id === selectedYearId ? 'selected' : ''}>
                                ${esc(y.name)} ${y.id === state.currentAcadYear?.id ? '🟢' : ''}
                            </option>
                        `).join('')}
                    </select>
                    <span class="badge ${isActiveYear ? 'badge-success' : 'badge-neutral'}" style="font-size:0.6rem;">
                        ${isActiveYear ? '🟢 Active' : '🔒 Read-only'}
                    </span>
                    <button class="btn btn-sm btn-outline" onclick="window._exportMarksAnalysis()">📥 Export</button>
                    <button class="btn btn-sm btn-outline" onclick="window._printMarksAnalysis()">🖨️ Print</button>
                </div>
            </div>
            <div class="dash-card-body">
                <div style="padding:4px 12px;margin-bottom:12px;background:var(--bg-tertiary);border-radius:6px;font-size:0.75rem;color:var(--text-muted);display:flex;justify-content:space-between;flex-wrap:wrap;">
                    <span>📅 ${esc(selectedYear?.name || 'Current Year')}</span>
                    <span>${isActiveYear ? '✅ Editable' : '🔒 Read-only (inactive year)'}</span>
                </div>
                <div class="filters-bar" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:8px;margin-bottom:16px;">
                    <div class="form-group" style="margin:0;">
                        <label style="font-size:0.7rem;">Class</label>
                        <select id="analysis-class" onchange="window._loadAnalysisData()" style="padding:6px 10px;border-radius:6px;border:1px solid var(--border-medium);width:100%;">
                            <option value="">All Classes</option>
                            ${classes.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}
                        </select>
                    </div>
                    <div class="form-group" style="margin:0;">
                        <label style="font-size:0.7rem;">Subject</label>
                        <select id="analysis-subject" onchange="window._loadAnalysisData()" style="padding:6px 10px;border-radius:6px;border:1px solid var(--border-medium);width:100%;">
                            <option value="">All Subjects</option>
                            ${subjects.map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join('')}
                        </select>
                    </div>
                    <div class="form-group" style="margin:0;">
                        <label style="font-size:0.7rem;">Term</label>
                        <select id="analysis-term" onchange="window._loadAnalysisData()" style="padding:6px 10px;border-radius:6px;border:1px solid var(--border-medium);width:100%;">
                            ${termsForYear.map(t => `<option value="${t.id}" ${t.id === state.currentTerm?.id ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}
                        </select>
                    </div>
                    <div style="display:flex;align-items:flex-end;gap:8px;">
                        <button class="btn btn-primary" onclick="window._loadAnalysisData()" style="padding:6px 16px;">📊 Load Analysis</button>
                    </div>
                </div>
                <div id="analysis-content">
                    <div class="loading-container"><div class="spinner"></div><p>Loading analysis...</p></div>
                </div>
            </div>
        </div>
    `;

    window._loadAnalysisData = loadAnalysisData;
    window._exportMarksAnalysis = exportMarksAnalysis;
    window._printMarksAnalysis = printMarksAnalysis;
    window._onYearChange = onYearChange;

    await loadAnalysisData();
}

// ──────────────────────────────────────────────────────────────────────
// ON YEAR CHANGE
// ──────────────────────────────────────────────────────────────────────

async function onYearChange() {
    const yearId = document.getElementById('analysis-year-filter')?.value;
    if (yearId) {
        selectedYearId = parseInt(yearId);
        // Update state filter
        state.filters.academic_year_id = selectedYearId;

        // Update term dropdown for the new year
        const termsForYear = getTermsByYear(selectedYearId);
        const termSelect = document.getElementById('analysis-term');
        if (termSelect) {
            const currentValue = termSelect.value;
            termSelect.innerHTML = termsForYear.map(t =>
                `<option value="${t.id}" ${t.id === state.currentTerm?.id ? 'selected' : ''}>${esc(t.name)}</option>`
            ).join('');
            // Restore selection if possible
            if (termsForYear.some(t => t.id == currentValue)) {
                termSelect.value = currentValue;
            }
        }

        await loadAnalysisData();
    }
}

// ──────────────────────────────────────────────────────────────────────
// LOAD ANALYSIS DATA
// ──────────────────────────────────────────────────────────────────────

async function loadAnalysisData() {
    const classId = document.getElementById('analysis-class')?.value;
    const subjectId = document.getElementById('analysis-subject')?.value;
    const termId = document.getElementById('analysis-term')?.value;
    const div = document.getElementById('analysis-content');
    if (!div) return;

    div.innerHTML = '<div class="loading-container"><div class="spinner"></div><p>Calculating...</p></div>';

    // Filter assessments by selected year
    let assessments = (state.assessments || [])
        .filter(a => a.academic_year_id == selectedYearId);

    if (termId) assessments = assessments.filter(a => a.term_id == termId);
    if (classId) assessments = assessments.filter(a => a.class_id == classId);
    if (subjectId) assessments = assessments.filter(a => a.subject_id == subjectId);

    if (!assessments.length) {
        div.innerHTML = `<div class="alert alert-info">No assessments found for the selected filters in ${(state.academicYears || []).find(y => y.id === selectedYearId)?.name || 'Current Year'}.</div>`;
        return;
    }

    const aIds = assessments.map(a => a.id);
    const marks = (state.marks || []).filter(m =>
        aIds.includes(m.assessment_id) &&
        m.academic_year_id == selectedYearId
    );

    // ── Per-assessment statistics ──
    const stats = assessments.map(a => {
        const aMarks = marks.filter(m => m.assessment_id === a.id);
        const scores = aMarks.map(m => m.score);
        const pcts = scores.map(s => (s / a.max_marks) * 100);
        const pass = pcts.filter(p => p >= 50).length;

        const avg = scores.length ? scores.reduce((s, v) => s + v, 0) / scores.length : 0;
        const avgPct = scores.length ? (avg / a.max_marks) * 100 : 0;

        const sorted = [...scores].sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);
        const median = sorted.length ? (sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2) : 0;

        return {
            id: a.id,
            name: a.assessment_name,
            type: a.assessment_type,
            maxMarks: a.max_marks,
            avgScore: avg,
            avgPct: avgPct,
            median: median,
            count: scores.length,
            highest: scores.length ? Math.max(...scores) : 0,
            lowest: scores.length ? Math.min(...scores) : 0,
            passRate: scores.length ? (pass / scores.length) * 100 : 0,
        };
    });

    // ── Overall grade distribution ──
    const allPcts = marks.map(m => {
        const a = assessments.find(x => x.id === m.assessment_id);
        return a ? (m.score / a.max_marks) * 100 : null;
    }).filter(v => v !== null);

    const gDist = { 'A+': 0, 'A': 0, 'B': 0, 'C': 0, 'D': 0, 'F': 0 };
    allPcts.forEach(p => { const g = getGrade(p); if (g in gDist) gDist[g]++; });

    // ── Build HTML ──
    const avgOverall = stats.length ? stats.reduce((s, a) => s + a.avgPct, 0) / stats.length : 0;
    const totalStudents = new Set(marks.map(m => m.student_id)).size;
    const totalAssessments = assessments.length;
    const selectedYear = (state.academicYears || []).find(y => y.id === selectedYearId);

    div.innerHTML = `
        <!-- Summary Stats -->
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:12px;margin-bottom:16px;">
            <div class="stat-card" style="padding:12px;text-align:center;">
                <div style="font-size:1.2rem;font-weight:700;">${totalAssessments}</div>
                <div style="font-size:0.65rem;color:var(--text-muted);text-transform:uppercase;">Assessments</div>
            </div>
            <div class="stat-card" style="padding:12px;text-align:center;">
                <div style="font-size:1.2rem;font-weight:700;color:${avgOverall >= 70 ? 'var(--success)' : avgOverall >= 50 ? 'var(--warning)' : 'var(--danger)'};">${avgOverall.toFixed(1)}%</div>
                <div style="font-size:0.65rem;color:var(--text-muted);text-transform:uppercase;">Average %</div>
            </div>
            <div class="stat-card" style="padding:12px;text-align:center;">
                <div style="font-size:1.2rem;font-weight:700;">${totalStudents}</div>
                <div style="font-size:0.65rem;color:var(--text-muted);text-transform:uppercase;">Students</div>
            </div>
            <div class="stat-card" style="padding:12px;text-align:center;">
                <div style="font-size:1.2rem;font-weight:700;">${marks.length}</div>
                <div style="font-size:0.65rem;color:var(--text-muted);text-transform:uppercase;">Total Marks</div>
            </div>
            <div class="stat-card" style="padding:12px;text-align:center;">
                <div style="font-size:0.8rem;font-weight:600;color:var(--text-secondary);">📅 ${esc(selectedYear?.name || 'Current Year')}</div>
            </div>
        </div>

        <!-- Grade Distribution -->
        <div class="dash-card" style="margin-bottom:16px;">
            <div class="dash-card-header" style="padding:8px 12px;">
                <span style="font-weight:600;font-size:0.85rem;">📊 Grade Distribution</span>
                <span style="font-size:0.65rem;color:var(--text-muted);">${esc(selectedYear?.name || '')}</span>
            </div>
            <div class="dash-card-body" style="padding:8px 12px;">
                ${allPcts.length ? gradeDistributionChart(gDist, 30) : '<div style="text-align:center;padding:20px;color:var(--text-muted);">No grade data available</div>'}
            </div>
        </div>

        <!-- Assessment Details Table -->
        <div class="dash-card">
            <div class="dash-card-header" style="padding:8px 12px;">
                <span style="font-weight:600;font-size:0.85rem;">📋 Assessment Details</span>
                <span style="font-size:0.65rem;color:var(--text-muted);">${esc(selectedYear?.name || '')}</span>
            </div>
            <div class="dash-card-body" style="padding:0;">
                <div class="table-wrapper">
                    <table class="data-table" style="font-size:0.75rem;">
                        <thead>
                            <tr>
                                <th>Assessment</th>
                                <th>Type</th>
                                <th style="text-align:right;">Max</th>
                                <th style="text-align:right;">Avg</th>
                                <th style="text-align:center;">Avg %</th>
                                <th style="text-align:right;">Median</th>
                                <th style="text-align:right;">High</th>
                                <th style="text-align:right;">Low</th>
                                <th style="text-align:center;">Pass Rate</th>
                                <th style="text-align:center;">Students</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${stats.map(s => `
                                <tr>
                                    <td><strong>${esc(s.name)}</strong></td>
                                    <td><span class="badge badge-neutral">${esc(s.type)}</span></td>
                                    <td style="text-align:right;">${s.maxMarks}</td>
                                    <td style="text-align:right;">${s.avgScore.toFixed(1)}</td>
                                    <td style="text-align:center;"><span class="badge ${getGradeClass(s.avgPct)}">${s.avgPct.toFixed(1)}%</span></td>
                                    <td style="text-align:right;">${s.median.toFixed(1)}</td>
                                    <td style="text-align:right;">${s.highest}</td>
                                    <td style="text-align:right;">${s.lowest}</td>
                                    <td style="text-align:center;">${s.passRate.toFixed(1)}%</td>
                                    <td style="text-align:center;">${s.count}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>

        <!-- Subject Performance Bars -->
        ${stats.length > 1 ? `
            <div class="dash-card" style="margin-top:16px;">
                <div class="dash-card-header" style="padding:8px 12px;">
                    <span style="font-weight:600;font-size:0.85rem;">📊 Assessment Performance Comparison</span>
                    <span style="font-size:0.65rem;color:var(--text-muted);">${esc(selectedYear?.name || '')}</span>
                </div>
                <div class="dash-card-body" style="padding:8px 12px;">
                    ${asciiHorizontalBar(stats.map(s => ({
        label: s.name.length > 15 ? s.name.slice(0, 12) + '…' : s.name,
        value: s.avgPct,
        color: s.avgPct >= 80 ? '#10b981' : s.avgPct >= 60 ? '#f59e0b' : '#ef4444'
    })), 35)}
                </div>
            </div>
        ` : ''}
    `;
}

// ──────────────────────────────────────────────────────────────────────
// EXPORT MARKS ANALYSIS
// ──────────────────────────────────────────────────────────────────────

function exportMarksAnalysis() {
    const table = document.querySelector('#analysis-content .data-table');
    if (!table) {
        showToast('Run analysis first', 'warning');
        return;
    }

    const selectedYear = (state.academicYears || []).find(y => y.id === selectedYearId);
    const filename = `Marks_Analysis${selectedYear ? '_' + selectedYear.name : ''}_${new Date().toISOString().split('T')[0]}`;

    const ws = XLSX.utils.table_to_sheet(table);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Marks_Analysis');
    XLSX.writeFile(wb, `${filename}.xlsx`);
    showToast('✅ Marks analysis exported', 'success');
}

// ──────────────────────────────────────────────────────────────────────
// PRINT MARKS ANALYSIS
// ──────────────────────────────────────────────────────────────────────

function printMarksAnalysis() {
    const content = document.getElementById('analysis-content');
    if (!content) return;

    const selectedYear = (state.academicYears || []).find(y => y.id === selectedYearId);
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
        showToast('Popup blocked. Please allow popups.', 'warning');
        return;
    }

    printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Marks Analysis</title>
            <style>
                body { font-family: Arial, sans-serif; padding: 20px; }
                table { width: 100%; border-collapse: collapse; font-size: 11px; }
                th, td { border: 1px solid #ccc; padding: 6px; }
                th { background: #1a3a5c; color: white; }
                h1, h2 { text-align: center; color: #1a3a5c; }
                .badge { display: inline-block; padding: 2px 8px; border-radius: 12px; font-size: 9px; font-weight: 600; }
                .grade-Ap { background: #d1fae5; color: #065f46; }
                .grade-A { background: #d1fae5; color: #065f46; }
                .grade-B { background: #fef3c7; color: #92400e; }
                .grade-C { background: #ffedd5; color: #9a3412; }
                .grade-D { background: #fee2e2; color: #991b1b; }
                .grade-F { background: #fee2e2; color: #991b1b; }
                .year-label { text-align: center; font-size: 12px; color: #64748b; margin-bottom: 12px; }
                @media print { body { padding: 0; } }
            </style>
        </head>
        <body>
            <h1>${esc(state.schoolSettings?.school_name || 'ECOLE LA FONTAINE')}</h1>
            <h2>Marks Analysis Report</h2>
            <div class="year-label">📅 ${selectedYear ? esc(selectedYear.name) : 'Current Year'}</div>
            <p style="text-align:center;">Generated on ${new Date().toLocaleString()}</p>
            ${content.innerHTML}
            <script>
                window.print();
                setTimeout(function() { window.close(); }, 500);
            <\/script>
        </body>
        </html>
    `);
    printWindow.document.close();
}

// ──────────────────────────────────────────────────────────────────────
// HELPER FUNCTIONS
// ──────────────────────────────────────────────────────────────────────

function showToast(message, type = 'info', duration = 3500) {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `<span class="toast-icon">${icons[type] || 'ℹ️'}</span><span class="toast-message">${esc(message)}</span>`;
    container.appendChild(toast);
    setTimeout(() => { toast.classList.add('hiding'); setTimeout(() => toast.remove(), 300); }, duration);
}

async function ensureStateLoaded() {
    if (!state.classes || !state.classes.length) {
        const fn = window.loadInitialData || (async () => {});
        await fn(false);
    }
}

// Export functions to window
window._loadAnalysisData = loadAnalysisData;
window._exportMarksAnalysis = exportMarksAnalysis;
window._printMarksAnalysis = printMarksAnalysis;
window._onYearChange = onYearChange;