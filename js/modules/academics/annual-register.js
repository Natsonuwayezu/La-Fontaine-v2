/**
 * ECOLE LA FONTAINE — Annual Register Module
 * Full-year combined register with 3 terms per subject
 * Last updated: 2026-07-03
 * 
 * CHANGES:
 * - Added academic year detection from sidebar/state
 * - Uses selected year from state.filters.academic_year_id
 * - Shows year indicator in header
 * - Read-only for inactive years
 * - Handles years with no terms gracefully
 */


const state = window.state || {}; // global state alias
import {
    state,
    getClassById,
    getTermById,
    getCurrentUser,
    getCurrentAcademicYear,
    getActiveAcademicYearId,
    getTermsByYear,
    getYearData
} from '../../core/state.js';
import { esc, fmtDate, fmtPct } from '../../core/utils.js';
import { getGrade, getGradeClass, calcSubjectPostMidterm } from '../../core/formulas.js';
import { exportToExcel } from '../../core/utils.js';
import { getAll } from '../../core/api.js';

// ──────────────────────────────────────────────────────────────────────
// STATE
// ──────────────────────────────────────────────────────────────────────

let selectedYearId = null;

// ──────────────────────────────────────────────────────────────────────
// MAIN RENDER FUNCTION
// ──────────────────────────────────────────────────────────────────────

export async function renderAnnualRegister(container) {
    if (!container) return;

    const user = getCurrentUser();
    if (user?.role === 'accountant') {
        container.innerHTML = '<div class="alert alert-danger">Access denied. Accountant cannot access annual register.</div>';
        return;
    }

    await ensureStateLoaded();

    let classes = (state.classes || []).filter(c => c.is_active !== false);

    if (user?.role === 'teacher') {
        const assignments = await getAll('teacher_assignments', { teacher_id: user.id });
        const classIds = [...new Set(assignments.map(a => a.class_id))];
        classes = classes.filter(c => classIds.includes(c.id));
    }

    // Get selected year from state (set by sidebar)
    selectedYearId = state.filters?.academic_year_id || state.currentAcadYear?.id;
    const selectedYear = (state.academicYears || []).find(y => y.id === selectedYearId);
    const currentYear = getCurrentAcademicYear();
    const years = (state.academicYears || []).sort((a, b) => b.id - a.id);

    const isActiveYear = selectedYear?.is_active === true;
    const isCurrentYear = selectedYear?.id === currentYear?.id;

    container.innerHTML = `
        <div class="dash-card">
            <div class="dash-card-header" style="flex-wrap:wrap;gap:8px;">
                <span class="dash-card-title">📊 ANNUAL REGISTER / REGISTRE ANNUEL</span>
                <div class="btn-group" style="flex-wrap:wrap;gap:6px;">
                    <select id="annual-year-filter" onchange="window._loadAnnualRegister()" style="padding:6px 12px;border-radius:var(--r-md);border:1px solid var(--border-medium);font-size:0.8rem;">
                        ${years.map(y => `
                            <option value="${y.id}" ${y.id === selectedYearId ? 'selected' : ''}>
                                ${esc(y.name)} ${y.id === currentYear?.id ? '🟢' : (y.is_active ? '🟡' : '🔒')}
                            </option>
                        `).join('')}
                    </select>
                    <select id="annual-class" onchange="window._loadAnnualRegister()" style="padding:6px 12px;border-radius:var(--r-md);border:1px solid var(--border-medium);">
                        ${classes.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}
                    </select>
                    <button class="btn btn-sm btn-outline" onclick="window._exportAnnualRegister()">📤 Export</button>
                    <button class="btn btn-sm btn-outline" onclick="window._printAnnualRegister()">🖨️ Print</button>
                    ${!isActiveYear ? `<span class="badge badge-neutral" style="font-size:0.65rem;">🔒 Read-only</span>` : ''}
                </div>
            </div>
            <div class="dash-card-body" style="padding:0;">
                <div style="padding:8px 16px;background:var(--bg-tertiary);border-bottom:1px solid var(--border-light);font-size:0.75rem;color:var(--text-muted);display:flex;justify-content:space-between;flex-wrap:wrap;gap:4px;">
                    <span>📅 ${esc(selectedYear?.name || 'No Year Selected')} ${isCurrentYear ? '🟢 Current' : (isActiveYear ? '🟡 Active' : '🔒 Inactive')}</span>
                    <span>${isActiveYear ? '✅ Editable' : '🔒 Read-only (inactive year)'}</span>
                </div>
                <div id="annual-register-container">
                    <div class="loading-container"><div class="spinner"></div><p>Loading annual register...</p></div>
                </div>
            </div>
        </div>
    `;

    window._loadAnnualRegister = loadAnnualRegister;
    window._exportAnnualRegister = exportAnnualRegister;
    window._printAnnualRegister = printAnnualRegister;

    // Auto-load first class
    if (classes.length) {
        document.getElementById('annual-class').value = classes[0].id;
        await loadAnnualRegister();
    }
}

// ──────────────────────────────────────────────────────────────────────
// LOAD ANNUAL REGISTER
// ──────────────────────────────────────────────────────────────────────

async function loadAnnualRegister() {
    const classId = document.getElementById('annual-class')?.value;
    const yearId = document.getElementById('annual-year-filter')?.value;

    if (yearId) {
        selectedYearId = parseInt(yearId);
        // Update state filter
        state.filters.academic_year_id = selectedYearId;
    }

    if (!classId) return;

    const cls = getClassById(classId);
    const body = document.getElementById('annual-register-container');
    if (!body) return;

    body.innerHTML = '<div class="loading-container"><div class="spinner"></div><p>Loading annual register...</p></div>';

    // Get the year object
    const year = (state.academicYears || []).find(y => y.id === selectedYearId);

    await renderAnnualTable(cls, body, year);
}

// ──────────────────────────────────────────────────────────────────────
// RENDER ANNUAL TABLE
// ──────────────────────────────────────────────────────────────────────

async function renderAnnualTable(cls, container, year) {
    if (!cls) {
        container.innerHTML = '<div class="alert alert-info">Select a class to view the annual register</div>';
        return;
    }

    const isNursery = cls.level === 'Nursery';
    const yearId = selectedYearId || state.currentAcadYear?.id;

    // Get students for this class in the selected year
    const students = (state.students || [])
        .filter(s => s.class_id === cls.id && s.status === 'Active' && s.academic_year_id === yearId)
        .sort((a, b) => a.last_name.localeCompare(b.last_name));

    if (!students.length) {
        const yearName = year?.name || 'this year';
        container.innerHTML = `<div class="alert alert-info">No active students in this class for ${esc(yearName)}</div>`;
        return;
    }

    // Get terms for the selected year
    let terms = getTermsByYear(yearId);
    if (!terms.length) {
        container.innerHTML = `<div class="alert alert-warning">No terms defined for ${esc(year?.name || 'this academic year')}</div>`;
        return;
    }
    terms.sort((a, b) => a.term_number - b.term_number);

    const subjects = (state.subjects || [])
        .filter(s => s.level === cls.level && s.is_active !== false)
        .sort((a, b) => (a.sort_order || 99) - (b.sort_order || 99));

    // ── Build Header ──
    let headerRow = `<tr>
        <th class="cr-col-rank" style="position:sticky;left:0;z-index:2;background:var(--bg-tertiary);">#</th>
        <th class="cr-col-name" style="position:sticky;left:44px;z-index:2;background:var(--bg-tertiary);min-width:180px;">${isNursery ? 'Élève' : 'Student'}</th>`;

    for (const term of terms) {
        headerRow += `<th colspan="${subjects.length * 2 + 1}" style="text-align:center;font-size:0.72rem;">${esc(term.name)}</th>`;
    }
    headerRow += `<th colspan="3" style="text-align:center;font-size:0.72rem;">${isNursery ? 'ANNUEL' : 'ANNUAL'}</th></tr>`;

    // Subject header
    let subjectHeader = `<tr><th class="cr-col-rank"></th><th class="cr-col-name"></th>`;
    for (const term of terms) {
        for (const subject of subjects) {
            subjectHeader += `<th colspan="2" style="text-align:center;font-size:0.55rem;">${esc(subject.code || subject.name)}</th>`;
        }
        subjectHeader += `<th style="text-align:center;font-size:0.55rem;">T-TOT</th>`;
    }
    subjectHeader += `<th style="text-align:center;font-size:0.55rem;">G-TOT</th><th style="text-align:center;font-size:0.55rem;">%</th><th style="text-align:center;font-size:0.55rem;">${isNursery ? 'COTE' : 'GRADE'}</th></tr>`;

    // MG/EX sub-header
    let mgExHeader = `<tr><th class="cr-col-rank"></th><th class="cr-col-name"></th>`;
    for (const term of terms) {
        for (const subject of subjects) {
            mgExHeader += `<th style="text-align:center;font-size:0.5rem;">MG</th><th style="text-align:center;font-size:0.5rem;">EX</th>`;
        }
        mgExHeader += `<th></th>`;
    }
    mgExHeader += `<th></th><th></th><th></th></tr>`;

    // ── Build Student Data ──
    const studentData = [];

    // Get assessments for this class and year
    const allAssessments = (state.assessments || [])
        .filter(a => a.class_id === cls.id && a.academic_year_id === yearId);

    for (const student of students) {
        const row = { student, termData: [] };
        let annualTotMg = 0, annualTotEx = 0, annualGTot = 0, annualMax = 0;

        for (const term of terms) {
            const termAssessments = allAssessments.filter(a => a.term_id === term.id);
            const termRow = { subjectScores: [] };
            let termTotMg = 0, termTotEx = 0, termGTot = 0, termMax = 0;

            for (const subject of subjects) {
                const result = calcSubjectPostMidterm(subject, termAssessments, state.marks || [], student.id);
                const isPostOnly = subject.appears_only_post_midterm;

                let mg = result.mg;
                let ex = result.ex;
                if (isPostOnly && mg === null && ex !== null) {
                    mg = ex;
                }

                termRow.subjectScores.push({ mg, ex, tot: result.tot });

                if (mg !== null) { termTotMg += mg; annualTotMg += mg; }
                if (ex !== null) { termTotEx += ex; annualTotEx += ex; }
                if (result.tot !== null) {
                    termGTot += result.tot;
                    annualGTot += result.tot;
                    termMax += result.mgMax + result.exMax;
                    annualMax += result.mgMax + result.exMax;
                }
            }

            termRow.totMg = termTotMg;
            termRow.totEx = termTotEx;
            termRow.gTot = termGTot;
            termRow.max = termMax;
            termRow.pct = termMax > 0 ? (termGTot / termMax) * 100 : 0;
            row.termData.push(termRow);
        }

        row.annualTotMg = annualTotMg;
        row.annualTotEx = annualTotEx;
        row.annualGTot = annualGTot;
        row.annualMax = annualMax;
        row.annualPct = annualMax > 0 ? (annualGTot / annualMax) * 100 : 0;
        row.annualGrade = row.annualPct > 0 ? getGrade(row.annualPct) : '—';
        studentData.push(row);
    }

    // Sort and rank
    studentData.sort((a, b) => b.annualPct - a.annualPct);
    studentData.forEach((s, i) => {
        s.rank = i + 1;
        const suffix = isNursery ? (s.rank === 1 ? 'er' : 'e') : (s.rank === 1 ? 'st' : s.rank === 2 ? 'nd' : s.rank === 3 ? 'rd' : 'th');
        s.rankDisplay = isNursery ? `${s.rank}${suffix} sur ${studentData.length}` : `${s.rank}${suffix} of ${studentData.length}`;
    });

    // ── Build Rows ──
    const rows = studentData.map(sd => {
        let rowHtml = `<tr>
            <td class="cr-col-rank" style="position:sticky;left:0;z-index:1;background:var(--bg-secondary);text-align:center;font-weight:700;">${sd.rank}</td>
            <td class="cr-col-name" style="position:sticky;left:44px;z-index:1;background:var(--bg-secondary);font-weight:600;">${esc(sd.student.first_name)} ${esc(sd.student.last_name)}</td>`;

        for (const termData of sd.termData) {
            for (const score of termData.subjectScores) {
                const mgDisplay = score.mg !== null ? score.mg.toFixed(1) : '—';
                const exDisplay = score.ex !== null ? score.ex.toFixed(1) : '—';
                rowHtml += `<td style="text-align:center;">${mgDisplay}</td><td style="text-align:center;">${exDisplay}</td>`;
            }
            rowHtml += `<td style="text-align:center;font-weight:600;">${termData.gTot.toFixed(1)}</td>`;
        }

        const pctDisplay = sd.annualPct > 0 ? sd.annualPct.toFixed(1) + '%' : '—';
        const gradeDisplay = sd.annualGrade !== '—' ? `<span class="badge ${getGradeClass(sd.annualPct)}">${sd.annualGrade}</span>` : '—';

        rowHtml += `<td style="text-align:center;font-weight:700;">${sd.annualGTot.toFixed(1)}</td>
            <td style="text-align:center;">${pctDisplay}</td>
            <td style="text-align:center;">${gradeDisplay}</td></tr>`;

        return rowHtml;
    });

    // ── Average Row ──
    let avgRow = `<tr style="background:var(--bg-tertiary);font-weight:700;">
        <td colspan="2" style="text-align:right;padding:8px 12px;">${isNursery ? 'MOYENNE' : 'AVERAGE'}</td>`;

    for (const term of terms) {
        for (const subject of subjects) {
            const validMgs = studentData.map(s => s.termData[terms.indexOf(term)]?.subjectScores[subjects.indexOf(subject)]?.mg).filter(v => v !== null);
            const validExs = studentData.map(s => s.termData[terms.indexOf(term)]?.subjectScores[subjects.indexOf(subject)]?.ex).filter(v => v !== null);
            const avgMg = validMgs.length ? validMgs.reduce((a, b) => a + b, 0) / validMgs.length : 0;
            const avgEx = validExs.length ? validExs.reduce((a, b) => a + b, 0) / validExs.length : 0;
            avgRow += `<td style="text-align:center;">${avgMg > 0 ? avgMg.toFixed(1) : '—'}</td><td style="text-align:center;">${avgEx > 0 ? avgEx.toFixed(1) : '—'}</td>`;
        }
        const validTerms = studentData.map(s => s.termData[terms.indexOf(term)]?.gTot).filter(v => v !== null && v > 0);
        const avgTerm = validTerms.length ? validTerms.reduce((a, b) => a + b, 0) / validTerms.length : 0;
        avgRow += `<td style="text-align:center;">${avgTerm > 0 ? avgTerm.toFixed(1) : '—'}</td>`;
    }

    const avgAnnual = studentData.reduce((a, s) => a + s.annualPct, 0) / (studentData.length || 1);
    avgRow += `<td style="text-align:center;font-weight:700;">—</td>
        <td style="text-align:center;">${avgAnnual > 0 ? avgAnnual.toFixed(1) + '%' : '—'}</td>
        <td style="text-align:center;">${avgAnnual > 0 ? getGrade(avgAnnual) : '—'}</td></tr>`;

    // ── Build Final HTML ──
    const yearLabel = year?.name || 'Current Year';
    const isActive = year?.is_active === true;

    container.innerHTML = `
        <div style="padding:4px 12px;background:var(--bg-tertiary);border-bottom:1px solid var(--border-light);font-size:0.7rem;color:var(--text-muted);display:flex;justify-content:space-between;flex-wrap:wrap;">
            <span>📅 ${esc(yearLabel)} ${isActive ? '🟢' : '🔒'}</span>
            <span>${students.length} students · ${terms.length} terms · ${subjects.length} subjects</span>
            ${!isActive ? '<span class="badge badge-neutral">🔒 Read-only</span>' : ''}
        </div>
        <div class="cr-table-wrapper" style="overflow:auto;max-height:70vh;border:1px solid var(--border-light);border-radius:var(--r-md);">
            <table class="data-table cr-table" style="min-width:1200px;border-collapse:separate;border-spacing:0;font-size:0.72rem;white-space:nowrap;">
                <thead style="position:sticky;top:0;z-index:3;">
                    ${headerRow}
                    ${subjectHeader}
                    ${mgExHeader}
                </thead>
                <tbody>
                    ${rows.join('')}
                    ${avgRow}
                </tbody>
            </table>
        </div>
    `;
}

// ──────────────────────────────────────────────────────────────────────
// EXPORT ANNUAL REGISTER
// ──────────────────────────────────────────────────────────────────────

function exportAnnualRegister() {
    const table = document.querySelector('#annual-register-container .cr-table');
    if (!table) {
        showToast('No data to export', 'warning');
        return;
    }

    const year = (state.academicYears || []).find(y => y.id === selectedYearId);
    const filename = `Annual_Register${year ? '_' + year.name : ''}_${new Date().toISOString().split('T')[0]}`;

    const ws = XLSX.utils.table_to_sheet(table);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Annual_Register');
    XLSX.writeFile(wb, `${filename}.xlsx`);
    showToast('✅ Annual register exported', 'success');
}

// ──────────────────────────────────────────────────────────────────────
// PRINT ANNUAL REGISTER
// ──────────────────────────────────────────────────────────────────────

function printAnnualRegister() {
    const container = document.getElementById('annual-register-container');
    if (!container) return;

    const printWindow = window.open('', '_blank');
    if (!printWindow) {
        showToast('Popup blocked. Please allow popups.', 'warning');
        return;
    }

    const school = state.schoolSettings || {};
    const year = (state.academicYears || []).find(y => y.id === selectedYearId);

    printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Annual Register${year ? ' - ' + year.name : ''}</title>
            <style>
                body { font-family: Arial, sans-serif; padding: 20px; font-size: 10px; }
                table { width: 100%; border-collapse: collapse; }
                th, td { border: 1px solid #ccc; padding: 4px 6px; text-align: center; }
                th { background: #1a3a5c; color: white; font-weight: 700; }
                h1 { text-align: center; color: #1a3a5c; }
                .badge { display: inline-block; padding: 1px 6px; border-radius: 10px; font-size: 8px; }
                .grade-Ap { background: #d1fae5; color: #065f46; }
                .grade-A { background: #d1fae5; color: #065f46; }
                .grade-B { background: #fef3c7; color: #92400e; }
                .grade-C { background: #ffedd5; color: #9a3412; }
                .grade-D { background: #fee2e2; color: #991b1b; }
                .grade-F { background: #fee2e2; color: #991b1b; }
                .year-label { text-align: center; font-size: 14px; color: #64748b; margin-bottom: 16px; }
                @media print { body { padding: 0; } }
            </style>
        </head>
        <body>
            <h1>${esc(school.school_name || 'ECOLE LA FONTAINE')}</h1>
            <h2 style="text-align:center;">Annual Register</h2>
            <div class="year-label">📅 ${year ? esc(year.name) : 'Current Year'} · Generated on ${new Date().toLocaleString()}</div>
            ${container.innerHTML}
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

// ──────────────────────────────────────────────────────────────────────
// EXPOSE GLOBALLY
// ──────────────────────────────────────────────────────────────────────

window._loadAnnualRegister = loadAnnualRegister;
window._exportAnnualRegister = exportAnnualRegister;
window._printAnnualRegister = printAnnualRegister;