/**
 * ECOLE LA FONTAINE — Class Register Module
 * Complete class register with 6 formats (Nursery/Pre/Post/Annual, Primary/Pre/Post/Annual)
 * Last updated: 2026-07-03
 * 
 * CHANGES:
 * - Added academic year detection from sidebar state
 * - Uses selected year from state.filters.academic_year_id
 * - Term dropdown shows terms for the selected year
 * - All data filtered by selected academic year
 * - Year indicator in the header
 */



const ensureStateLoaded = window.ensureStateLoaded || (async () => {}); // global from boot.js
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
import { esc, fmtDate, fmtPct } from '../../core/utils.js';
import { getGrade, getGradeClass, calcSubjectPostMidterm, calcPreMidtermPrimary, calcPreMidtermNursery, getCurrentPhase } from '../../core/formulas.js';
import { exportToExcel } from '../../core/utils.js';
import { getAll } from '../../core/api.js';

// ──────────────────────────────────────────────────────────────────────
// STATE
// ──────────────────────────────────────────────────────────────────────

let selectedYearId = null;

// ──────────────────────────────────────────────────────────────────────
// MAIN RENDER FUNCTION
// ──────────────────────────────────────────────────────────────────────

export async function renderClassRegister(container) {
    if (!container) return;

    const user = getCurrentUser();
    if (user?.role === 'accountant') {
        container.innerHTML = '<div class="alert alert-danger">Access denied. Accountant cannot access class register.</div>';
        return;
    }

    await ensureStateLoaded();

    // Get selected year from state (set by sidebar)
    selectedYearId = state.filters?.academic_year_id || state.currentAcadYear?.id;
    const selectedYear = (state.academicYears || []).find(y => y.id === selectedYearId);
    const isActiveYear = selectedYear?.is_active === true;
    const years = (state.academicYears || []).sort((a, b) => b.id - a.id);

    const termObj = state.currentTerm;
    let classes = (state.classes || []).filter(c => c.is_active !== false);

    if (user?.role === 'teacher') {
        const assignments = await getAll('teacher_assignments', { teacher_id: user.id });
        const classIds = [...new Set(assignments.map(a => a.class_id))];
        classes = classes.filter(c => classIds.includes(c.id));
    }

    // Get terms for the selected year
    const termsForYear = getTermsByYear(selectedYearId);

    container.innerHTML = `
        <div class="dash-card">
            <div class="dash-card-header" style="flex-wrap:wrap;gap:8px;">
                <span class="dash-card-title">📋 CLASS REGISTER</span>
                <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;">
                    <select id="cr-year-filter" onchange="window._onYearChange()" style="padding:6px 12px;border-radius:var(--r-md);border:1px solid var(--border-medium);font-size:0.8rem;">
                        ${years.map(y => `
                            <option value="${y.id}" ${y.id === selectedYearId ? 'selected' : ''}>
                                ${esc(y.name)} ${y.id === state.currentAcadYear?.id ? '🟢' : ''}
                            </option>
                        `).join('')}
                    </select>
                    <select id="cr-class-select" onchange="window._renderCRTable()" style="padding:6px 12px;border-radius:var(--r-md);border:1px solid var(--border-medium);">
                        ${classes.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}
                    </select>
                    <select id="cr-term-select" onchange="window._renderCRTable()" style="padding:6px 12px;border-radius:var(--r-md);border:1px solid var(--border-medium);">
                        ${termsForYear.map(t => `<option value="${t.id}" ${t.id === termObj?.id ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}
                        <option value="annual">📊 Annual / Annuel</option>
                    </select>
                    <span class="badge ${isActiveYear ? 'badge-success' : 'badge-neutral'}" style="font-size:0.6rem;">
                        ${isActiveYear ? '🟢 Active' : '🔒 Read-only'}
                    </span>
                    <button class="btn btn-sm btn-outline" onclick="window._exportCRToExcel()">📤 Export</button>
                    <button class="btn btn-sm btn-outline" onclick="window._printCR()">🖨️ Print</button>
                </div>
            </div>
            <div class="dash-card-body" style="padding:0;">
                <div style="padding:4px 16px;background:var(--bg-tertiary);border-bottom:1px solid var(--border-light);font-size:0.7rem;color:var(--text-muted);display:flex;justify-content:space-between;flex-wrap:wrap;">
                    <span>📅 ${esc(selectedYear?.name || 'Current Year')}</span>
                    <span>${isActiveYear ? '✅ Editable' : '🔒 Read-only (inactive year)'}</span>
                </div>
                <div id="cr-table-container"><div class="loading-container"><div class="spinner"></div><p>Loading register...</p></div></div>
            </div>
        </div>
    `;

    window._renderCRTable = renderCRTable;
    window._exportCRToExcel = exportCRToExcel;
    window._printCR = printCR;
    window._onYearChange = onYearChange;

    await renderCRTable();
}

// ──────────────────────────────────────────────────────────────────────
// ON YEAR CHANGE
// ──────────────────────────────────────────────────────────────────────

async function onYearChange() {
    const yearId = document.getElementById('cr-year-filter')?.value;
    if (yearId) {
        selectedYearId = parseInt(yearId);
        // Update state filter
        state.filters.academic_year_id = selectedYearId;

        // Update term dropdown for the new year
        const termsForYear = getTermsByYear(selectedYearId);
        const termSelect = document.getElementById('cr-term-select');
        if (termSelect) {
            const currentValue = termSelect.value;
            termSelect.innerHTML = termsForYear.map(t =>
                `<option value="${t.id}" ${t.id === state.currentTerm?.id ? 'selected' : ''}>${esc(t.name)}</option>`
            ).join('') + '<option value="annual">📊 Annual / Annuel</option>';
            // Restore selection if possible
            if (termsForYear.some(t => t.id == currentValue)) {
                termSelect.value = currentValue;
            }
        }

        await renderCRTable();
    }
}

// ──────────────────────────────────────────────────────────────────────
// RENDER CLASS REGISTER TABLE
// ──────────────────────────────────────────────────────────────────────

async function renderCRTable() {
    const classId = document.getElementById('cr-class-select')?.value;
    const termId = document.getElementById('cr-term-select')?.value;
    const container = document.getElementById('cr-table-container');
    if (!container) return;

    if (!classId) {
        container.innerHTML = '<div class="alert alert-info">Select a class to view the register</div>';
        return;
    }

    // "Annual" option routes to annual register
    if (termId === 'annual') {
        const cls = getClassById(classId);
        container.innerHTML = '<div class="loading-container"><div class="spinner"></div><p>Loading annual register...</p></div>';
        await renderAnnualRegister(cls, container);
        return;
    }

    const cls = getClassById(classId);
    const term = getTermById(termId);
    const isNursery = cls?.level === 'Nursery';
    const phase = getCurrentPhase(term);

    // Get students for the selected year
    const students = (state.students || [])
        .filter(s => s.class_id == classId && s.status === 'Active' && s.academic_year_id == selectedYearId)
        .sort((a, b) => a.last_name.localeCompare(b.last_name));

    if (!students.length) {
        container.innerHTML = '<div class="alert alert-info">No active students in this class for the selected academic year</div>';
        return;
    }

    // Get subjects for this level
    let subjects = (state.subjects || [])
        .filter(s => s.level === cls?.level && s.is_active !== false)
        .sort((a, b) => (a.sort_order || 99) - (b.sort_order || 99));

    // Filter subjects based on phase
    if (phase === 'pre_midterm') {
        subjects = subjects.filter(s => !s.appears_only_post_midterm);
    }

    // Get assessments for this class, term, and year
    const assessments = (state.assessments || [])
        .filter(a => a.class_id == classId && a.term_id == termId && a.academic_year_id == selectedYearId);

    // Build the table
    let html = '';

    if (phase === 'pre_midterm') {
        if (isNursery) {
            html = renderNurseryPreMidterm(students, subjects, assessments, term);
        } else {
            html = renderPrimaryPreMidterm(students, subjects, assessments, term);
        }
    } else {
        if (isNursery) {
            html = renderNurseryPostMidterm(students, subjects, assessments, term);
        } else {
            html = renderPrimaryPostMidterm(students, subjects, assessments, term);
        }
    }

    container.innerHTML = html;
}

// ──────────────────────────────────────────────────────────────────────
// NURSERY PRE-MIDTERM
// ──────────────────────────────────────────────────────────────────────

function renderNurseryPreMidterm(students, subjects, assessments, term) {
    // Build header
    let headerRow = `<tr><th class="cr-col-rank" style="position:sticky;left:0;z-index:2;background:var(--bg-tertiary);">#</th>
        <th class="cr-col-name" style="position:sticky;left:44px;z-index:2;background:var(--bg-tertiary);min-width:180px;">Élève</th>`;

    for (const subject of subjects) {
        headerRow += `<th colspan="2" style="text-align:center;font-size:0.75rem;">${esc(subject.name)}<br><span style="font-weight:400;font-size:0.6rem;">NOTE / COTE</span></th>`;
    }
    headerRow += `<th style="text-align:center;">TOTAL</th><th style="text-align:center;">%</th><th style="text-align:center;">COTE</th><th style="text-align:center;">RANG</th></tr>`;

    // Build data rows
    const rows = [];
    const studentData = [];

    for (const student of students) {
        const row = { student, scores: [], total: 0, max: 0 };
        let totalScore = 0, totalMax = 0;

        for (const subject of subjects) {
            const subjectAssessments = assessments.filter(a => a.subject_id === subject.id);
            let rawScore = 0, rawMax = 0, count = 0;

            for (const a of subjectAssessments) {
                const mark = (state.marks || []).find(m =>
                    m.assessment_id === a.id &&
                    m.student_id === student.id &&
                    m.academic_year_id === selectedYearId
                );
                if (mark && mark.score !== null && mark.score !== undefined) {
                    rawScore += mark.score;
                    rawMax += a.max_marks;
                    count++;
                }
            }

            let note = null;
            let cote = '—';

            if (count > 0) {
                const avgRaw = rawScore / count;
                const avgMax = rawMax / count;
                note = avgMax > 0 ? (avgRaw / avgMax) * subject.mg_max : 0;
                cote = note !== null ? getGrade((note / subject.mg_max) * 100) : '—';
                totalScore += note || 0;
                totalMax += subject.mg_max;
            }

            row.scores.push({ note, cote });
        }

        row.total = totalScore;
        row.max = totalMax;
        row.pct = totalMax > 0 ? (totalScore / totalMax) * 100 : 0;
        row.grade = row.pct > 0 ? getGrade(row.pct) : '—';
        studentData.push(row);
    }

    // Sort by percentage descending
    studentData.sort((a, b) => b.pct - a.pct);

    // Assign ranks
    studentData.forEach((s, i) => {
        s.rank = i + 1;
        const rankSuffix = s.rank === 1 ? 'er' : 'e';
        s.rankDisplay = `${s.rank}${rankSuffix} sur ${studentData.length}`;
    });

    // Build rows
    for (const sd of studentData) {
        let rowHtml = `<tr>
            <td class="cr-col-rank" style="position:sticky;left:0;z-index:1;background:var(--bg-secondary);text-align:center;font-weight:700;">${sd.rank}</td>
            <td class="cr-col-name" style="position:sticky;left:44px;z-index:1;background:var(--bg-secondary);font-weight:600;">${esc(sd.student.first_name)} ${esc(sd.student.last_name)}</td>`;

        for (const score of sd.scores) {
            const noteDisplay = score.note !== null ? score.note.toFixed(1) : '—';
            const coteDisplay = score.cote !== '—' ? `<span class="badge ${getGradeClass((score.note / (subjects[0]?.mg_max || 50)) * 100)}">${score.cote}</span>` : '—';
            rowHtml += `<td style="text-align:center;">${noteDisplay}</td><td style="text-align:center;">${coteDisplay}</td>`;
        }

        const pctDisplay = sd.pct > 0 ? sd.pct.toFixed(1) + '%' : '—';
        const gradeDisplay = sd.grade !== '—' ? `<span class="badge ${getGradeClass(sd.pct)}">${sd.grade}</span>` : '—';

        rowHtml += `<td style="text-align:center;font-weight:600;">${sd.total.toFixed(1)}</td>
            <td style="text-align:center;">${pctDisplay}</td>
            <td style="text-align:center;">${gradeDisplay}</td>
            <td style="text-align:center;font-weight:700;">${sd.rankDisplay}</td></tr>`;

        rows.push(rowHtml);
    }

    // Calculate averages
    const avgRow = `<tr style="background:var(--bg-tertiary);font-weight:700;">
        <td colspan="2" style="text-align:right;padding:8px 12px;">MOYENNE</td>
        ${subjects.map((subject, idx) => {
        const validNotes = studentData.map(s => s.scores[idx]?.note).filter(n => n !== null && n !== undefined);
        const avg = validNotes.length > 0 ? validNotes.reduce((a, b) => a + b, 0) / validNotes.length : 0;
        const avgPct = subject.mg_max > 0 ? (avg / subject.mg_max) * 100 : 0;
        return `<td style="text-align:center;">${avg > 0 ? avg.toFixed(1) : '—'}</td><td style="text-align:center;">${avgPct > 0 ? `<span class="badge ${getGradeClass(avgPct)}">${getGrade(avgPct)}</span>` : '—'}</td>`;
    }).join('')}
        <td colspan="4"></td>
    </tr>`;

    const tableHtml = `
        <div class="cr-table-wrapper" style="overflow:auto;max-height:70vh;border:1px solid var(--border-light);border-radius:var(--r-md);">
            <table class="data-table cr-table" style="min-width:900px;border-collapse:separate;border-spacing:0;font-size:0.78rem;white-space:nowrap;">
                <thead style="position:sticky;top:0;z-index:3;">
                    ${headerRow}
                </thead>
                <tbody>
                    ${rows.join('')}
                    ${avgRow}
                </tbody>
            </table>
        </div>
    `;

    return tableHtml;
}

// ──────────────────────────────────────────────────────────────────────
// PRIMARY PRE-MIDTERM
// ──────────────────────────────────────────────────────────────────────

function renderPrimaryPreMidterm(students, subjects, assessments, term) {
    // Similar structure but with percentages instead of raw scores
    let headerRow = `<tr><th class="cr-col-rank" style="position:sticky;left:0;z-index:2;background:var(--bg-tertiary);">#</th>
        <th class="cr-col-name" style="position:sticky;left:44px;z-index:2;background:var(--bg-tertiary);min-width:180px;">Student</th>`;

    for (const subject of subjects) {
        headerRow += `<th colspan="2" style="text-align:center;font-size:0.75rem;">${esc(subject.name)}<br><span style="font-weight:400;font-size:0.6rem;">% / GRADE</span></th>`;
    }
    headerRow += `<th style="text-align:center;">%</th><th style="text-align:center;">GRADE</th><th style="text-align:center;">RANK</th></tr>`;

    const studentData = [];

    for (const student of students) {
        const row = { student, scores: [], totalPct: 0, count: 0 };

        for (const subject of subjects) {
            const subjectAssessments = assessments.filter(a => a.subject_id === subject.id);
            let rawScore = 0, rawMax = 0, count = 0;

            for (const a of subjectAssessments) {
                const mark = (state.marks || []).find(m =>
                    m.assessment_id === a.id &&
                    m.student_id === student.id &&
                    m.academic_year_id === selectedYearId
                );
                if (mark && mark.score !== null && mark.score !== undefined) {
                    rawScore += mark.score;
                    rawMax += a.max_marks;
                    count++;
                }
            }

            let pct = null;
            let grade = '—';

            if (count > 0) {
                const avgRaw = rawScore / count;
                const avgMax = rawMax / count;
                pct = avgMax > 0 ? (avgRaw / avgMax) * 100 : 0;
                grade = pct !== null ? getGrade(pct) : '—';
                row.totalPct += pct || 0;
                row.count++;
            }

            row.scores.push({ pct, grade });
        }

        row.avgPct = row.count > 0 ? row.totalPct / row.count : 0;
        row.grade = row.avgPct > 0 ? getGrade(row.avgPct) : '—';
        studentData.push(row);
    }

    // Sort and rank
    studentData.sort((a, b) => b.avgPct - a.avgPct);
    studentData.forEach((s, i) => {
        s.rank = i + 1;
        s.rankDisplay = `${s.rank} of ${studentData.length}`;
    });

    // Build rows
    const rows = studentData.map(sd => {
        let rowHtml = `<tr>
            <td class="cr-col-rank" style="position:sticky;left:0;z-index:1;background:var(--bg-secondary);text-align:center;font-weight:700;">${sd.rank}</td>
            <td class="cr-col-name" style="position:sticky;left:44px;z-index:1;background:var(--bg-secondary);font-weight:600;">${esc(sd.student.first_name)} ${esc(sd.student.last_name)}</td>`;

        for (const score of sd.scores) {
            const pctDisplay = score.pct !== null ? score.pct.toFixed(1) + '%' : '—';
            const gradeDisplay = score.grade !== '—' ? `<span class="badge ${getGradeClass(score.pct)}">${score.grade}</span>` : '—';
            rowHtml += `<td style="text-align:center;">${pctDisplay}</td><td style="text-align:center;">${gradeDisplay}</td>`;
        }

        const avgDisplay = sd.avgPct > 0 ? sd.avgPct.toFixed(1) + '%' : '—';
        const gradeDisplay = sd.grade !== '—' ? `<span class="badge ${getGradeClass(sd.avgPct)}">${sd.grade}</span>` : '—';

        rowHtml += `<td style="text-align:center;font-weight:600;">${avgDisplay}</td>
            <td style="text-align:center;">${gradeDisplay}</td>
            <td style="text-align:center;font-weight:700;">${sd.rankDisplay}</td></tr>`;

        return rowHtml;
    });

    // Average row
    const avgRow = `<tr style="background:var(--bg-tertiary);font-weight:700;">
        <td colspan="2" style="text-align:right;padding:8px 12px;">AVERAGE</td>
        ${subjects.map((subject, idx) => {
        const validPcts = studentData.map(s => s.scores[idx]?.pct).filter(p => p !== null && p !== undefined);
        const avg = validPcts.length > 0 ? validPcts.reduce((a, b) => a + b, 0) / validPcts.length : 0;
        return `<td style="text-align:center;">${avg > 0 ? avg.toFixed(1) + '%' : '—'}</td><td style="text-align:center;">${avg > 0 ? `<span class="badge ${getGradeClass(avg)}">${getGrade(avg)}</span>` : '—'}</td>`;
    }).join('')}
        <td colspan="3"></td>
    </tr>`;

    return `
        <div class="cr-table-wrapper" style="overflow:auto;max-height:70vh;border:1px solid var(--border-light);border-radius:var(--r-md);">
            <table class="data-table cr-table" style="min-width:900px;border-collapse:separate;border-spacing:0;font-size:0.78rem;white-space:nowrap;">
                <thead style="position:sticky;top:0;z-index:3;">
                    ${headerRow}
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
// NURSERY POST-MIDTERM
// ──────────────────────────────────────────────────────────────────────

function renderNurseryPostMidterm(students, subjects, assessments, term) {
    let headerRow = `<tr><th class="cr-col-rank" style="position:sticky;left:0;z-index:2;background:var(--bg-tertiary);">#</th>
        <th class="cr-col-name" style="position:sticky;left:44px;z-index:2;background:var(--bg-tertiary);min-width:180px;">Élève</th>`;

    for (const subject of subjects) {
        const isPostOnly = subject.appears_only_post_midterm;
        headerRow += `<th colspan="3" style="text-align:center;font-size:0.75rem;">${esc(subject.name)}${isPostOnly ? ' ★' : ''}<br><span style="font-weight:400;font-size:0.6rem;">MG / EX / TOT</span></th>`;
    }
    headerRow += `<th style="text-align:center;">TOT_MG</th><th style="text-align:center;">TOT_EX</th><th style="text-align:center;">G_TOT</th><th style="text-align:center;">%</th><th style="text-align:center;">COTE</th><th style="text-align:center;">RANG</th></tr>`;

    const studentData = [];

    for (const student of students) {
        const row = { student, scores: [], totMg: 0, totEx: 0, gTot: 0, maxTot: 0 };

        for (const subject of subjects) {
            const result = calcSubjectPostMidterm(subject, assessments, state.marks || [], student.id);
            const isPostOnly = subject.appears_only_post_midterm;

            let mg = result.mg;
            let ex = result.ex;
            if (isPostOnly && mg === null && ex !== null) {
                mg = ex;
            }

            const mgDisplay = mg !== null ? mg.toFixed(1) : '—';
            const exDisplay = ex !== null ? ex.toFixed(1) : '—';
            const totDisplay = result.tot !== null ? result.tot.toFixed(1) : '—';

            row.scores.push({ mg, ex, tot: result.tot, mgMax: result.mgMax, exMax: result.exMax });

            if (mg !== null) row.totMg += mg;
            if (ex !== null) row.totEx += ex;
            if (result.tot !== null) {
                row.gTot += result.tot;
                row.maxTot += result.mgMax + result.exMax;
            }
        }

        row.pct = row.maxTot > 0 ? (row.gTot / row.maxTot) * 100 : 0;
        row.grade = row.pct > 0 ? getGrade(row.pct) : '—';
        studentData.push(row);
    }

    studentData.sort((a, b) => b.pct - a.pct);
    studentData.forEach((s, i) => {
        s.rank = i + 1;
        const rankSuffix = s.rank === 1 ? 'er' : 'e';
        s.rankDisplay = `${s.rank}${rankSuffix} sur ${studentData.length}`;
    });

    const rows = studentData.map(sd => {
        let rowHtml = `<tr>
            <td class="cr-col-rank" style="position:sticky;left:0;z-index:1;background:var(--bg-secondary);text-align:center;font-weight:700;">${sd.rank}</td>
            <td class="cr-col-name" style="position:sticky;left:44px;z-index:1;background:var(--bg-secondary);font-weight:600;">${esc(sd.student.first_name)} ${esc(sd.student.last_name)}</td>`;

        for (const score of sd.scores) {
            const mgDisplay = score.mg !== null ? score.mg.toFixed(1) : '—';
            const exDisplay = score.ex !== null ? score.ex.toFixed(1) : '—';
            const totDisplay = score.tot !== null ? score.tot.toFixed(1) : '—';
            rowHtml += `<td style="text-align:center;">${mgDisplay}</td><td style="text-align:center;">${exDisplay}</td><td style="text-align:center;font-weight:600;">${totDisplay}</td>`;
        }

        const pctDisplay = sd.pct > 0 ? sd.pct.toFixed(1) + '%' : '—';
        const gradeDisplay = sd.grade !== '—' ? `<span class="badge ${getGradeClass(sd.pct)}">${sd.grade}</span>` : '—';

        rowHtml += `<td style="text-align:center;font-weight:600;">${sd.totMg.toFixed(1)}</td>
            <td style="text-align:center;font-weight:600;">${sd.totEx.toFixed(1)}</td>
            <td style="text-align:center;font-weight:700;">${sd.gTot.toFixed(1)}</td>
            <td style="text-align:center;">${pctDisplay}</td>
            <td style="text-align:center;">${gradeDisplay}</td>
            <td style="text-align:center;font-weight:700;">${sd.rankDisplay}</td></tr>`;

        return rowHtml;
    });

    return `
        <div class="cr-table-wrapper" style="overflow:auto;max-height:70vh;border:1px solid var(--border-light);border-radius:var(--r-md);">
            <table class="data-table cr-table" style="min-width:900px;border-collapse:separate;border-spacing:0;font-size:0.78rem;white-space:nowrap;">
                <thead style="position:sticky;top:0;z-index:3;">
                    ${headerRow}
                </thead>
                <tbody>
                    ${rows.join('')}
                </tbody>
            </table>
        </div>
    `;
}

// ──────────────────────────────────────────────────────────────────────
// PRIMARY POST-MIDTERM
// ──────────────────────────────────────────────────────────────────────

function renderPrimaryPostMidterm(students, subjects, assessments, term) {
    let headerRow = `<tr><th class="cr-col-rank" style="position:sticky;left:0;z-index:2;background:var(--bg-tertiary);">#</th>
        <th class="cr-col-name" style="position:sticky;left:44px;z-index:2;background:var(--bg-tertiary);min-width:180px;">Student</th>`;

    for (const subject of subjects) {
        const isPostOnly = subject.appears_only_post_midterm;
        headerRow += `<th colspan="3" style="text-align:center;font-size:0.75rem;">${esc(subject.name)}${isPostOnly ? ' ★' : ''}<br><span style="font-weight:400;font-size:0.6rem;">MG / EX / TOT</span></th>`;
    }
    headerRow += `<th style="text-align:center;">TOT_MG</th><th style="text-align:center;">TOT_EX</th><th style="text-align:center;">G_TOT</th><th style="text-align:center;">%</th><th style="text-align:center;">GRADE</th><th style="text-align:center;">RANK</th></tr>`;

    const studentData = [];

    for (const student of students) {
        const row = { student, scores: [], totMg: 0, totEx: 0, gTot: 0, maxTot: 0 };

        for (const subject of subjects) {
            const result = calcSubjectPostMidterm(subject, assessments, state.marks || [], student.id);
            const isPostOnly = subject.appears_only_post_midterm;

            let mg = result.mg;
            let ex = result.ex;
            if (isPostOnly && mg === null && ex !== null) {
                mg = ex;
            }

            row.scores.push({ mg, ex, tot: result.tot, mgMax: result.mgMax, exMax: result.exMax });

            if (mg !== null) row.totMg += mg;
            if (ex !== null) row.totEx += ex;
            if (result.tot !== null) {
                row.gTot += result.tot;
                row.maxTot += result.mgMax + result.exMax;
            }
        }

        row.pct = row.maxTot > 0 ? (row.gTot / row.maxTot) * 100 : 0;
        row.grade = row.pct > 0 ? getGrade(row.pct) : '—';
        studentData.push(row);
    }

    studentData.sort((a, b) => b.pct - a.pct);
    studentData.forEach((s, i) => {
        s.rank = i + 1;
        s.rankDisplay = `${s.rank} of ${studentData.length}`;
    });

    const rows = studentData.map(sd => {
        let rowHtml = `<tr>
            <td class="cr-col-rank" style="position:sticky;left:0;z-index:1;background:var(--bg-secondary);text-align:center;font-weight:700;">${sd.rank}</td>
            <td class="cr-col-name" style="position:sticky;left:44px;z-index:1;background:var(--bg-secondary);font-weight:600;">${esc(sd.student.first_name)} ${esc(sd.student.last_name)}</td>`;

        for (const score of sd.scores) {
            const mgDisplay = score.mg !== null ? score.mg.toFixed(1) : '—';
            const exDisplay = score.ex !== null ? score.ex.toFixed(1) : '—';
            const totDisplay = score.tot !== null ? score.tot.toFixed(1) : '—';
            rowHtml += `<td style="text-align:center;">${mgDisplay}</td><td style="text-align:center;">${exDisplay}</td><td style="text-align:center;font-weight:600;">${totDisplay}</td>`;
        }

        const pctDisplay = sd.pct > 0 ? sd.pct.toFixed(1) + '%' : '—';
        const gradeDisplay = sd.grade !== '—' ? `<span class="badge ${getGradeClass(sd.pct)}">${sd.grade}</span>` : '—';

        rowHtml += `<td style="text-align:center;font-weight:600;">${sd.totMg.toFixed(1)}</td>
            <td style="text-align:center;font-weight:600;">${sd.totEx.toFixed(1)}</td>
            <td style="text-align:center;font-weight:700;">${sd.gTot.toFixed(1)}</td>
            <td style="text-align:center;">${pctDisplay}</td>
            <td style="text-align:center;">${gradeDisplay}</td>
            <td style="text-align:center;font-weight:700;">${sd.rankDisplay}</td></tr>`;

        return rowHtml;
    });

    return `
        <div class="cr-table-wrapper" style="overflow:auto;max-height:70vh;border:1px solid var(--border-light);border-radius:var(--r-md);">
            <table class="data-table cr-table" style="min-width:900px;border-collapse:separate;border-spacing:0;font-size:0.78rem;white-space:nowrap;">
                <thead style="position:sticky;top:0;z-index:3;">
                    ${headerRow}
                </thead>
                <tbody>
                    ${rows.join('')}
                </tbody>
            </table>
        </div>
    `;
}

// ──────────────────────────────────────────────────────────────────────
// ANNUAL REGISTER
// ──────────────────────────────────────────────────────────────────────

async function renderAnnualRegister(cls, container) {
    if (!cls) {
        container.innerHTML = '<div class="alert alert-info">Select a class to view the annual register</div>';
        return;
    }

    const isNursery = cls.level === 'Nursery';
    const students = (state.students || [])
        .filter(s => s.class_id === cls.id && s.status === 'Active' && s.academic_year_id == selectedYearId)
        .sort((a, b) => a.last_name.localeCompare(b.last_name));

    if (!students.length) {
        container.innerHTML = '<div class="alert alert-info">No active students in this class for the selected academic year</div>';
        return;
    }

    const terms = getTermsByYear(selectedYearId);
    const subjects = (state.subjects || [])
        .filter(s => s.level === cls.level && s.is_active !== false)
        .sort((a, b) => (a.sort_order || 99) - (b.sort_order || 99));

    // Build header with 3 terms
    let headerRow = `<tr><th class="cr-col-rank" style="position:sticky;left:0;z-index:2;background:var(--bg-tertiary);">#</th>
        <th class="cr-col-name" style="position:sticky;left:44px;z-index:2;background:var(--bg-tertiary);min-width:180px;">${isNursery ? 'Élève' : 'Student'}</th>`;

    for (const term of terms) {
        headerRow += `<th colspan="${subjects.length * 2 + 1}" style="text-align:center;font-size:0.75rem;">${esc(term.name)}</th>`;
    }
    headerRow += `<th colspan="3" style="text-align:center;font-size:0.75rem;">${isNursery ? 'ANNUEL' : 'ANNUAL'}</th></tr>`;

    // Subject header
    let subjectHeader = `<tr><th class="cr-col-rank"></th><th class="cr-col-name"></th>`;
    for (const term of terms) {
        for (const subject of subjects) {
            subjectHeader += `<th colspan="2" style="text-align:center;font-size:0.6rem;">${esc(subject.code || subject.name)}</th>`;
        }
        subjectHeader += `<th style="text-align:center;font-size:0.6rem;">T-TOT</th>`;
    }
    subjectHeader += `<th style="text-align:center;font-size:0.6rem;">G-TOT</th><th style="text-align:center;font-size:0.6rem;">%</th><th style="text-align:center;font-size:0.6rem;">${isNursery ? 'COTE' : 'GRADE'}</th></tr>`;

    // MG/EX sub-header
    let mgExHeader = `<tr><th class="cr-col-rank"></th><th class="cr-col-name"></th>`;
    for (const term of terms) {
        for (const subject of subjects) {
            mgExHeader += `<th style="text-align:center;font-size:0.55rem;">MG</th><th style="text-align:center;font-size:0.55rem;">EX</th>`;
        }
        mgExHeader += `<th></th>`;
    }
    mgExHeader += `<th></th><th></th><th></th></tr>`;

    // Build student data
    const studentData = [];

    for (const student of students) {
        const row = { student, termData: [] };
        let annualTotMg = 0, annualTotEx = 0, annualGTot = 0, annualMax = 0;

        for (const term of terms) {
            const termAssessments = (state.assessments || [])
                .filter(a => a.class_id === cls.id && a.term_id === term.id && a.academic_year_id == selectedYearId);

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
        const rankSuffix = isNursery ? (s.rank === 1 ? 'er' : 'e') : (s.rank === 1 ? 'st' : s.rank === 2 ? 'nd' : s.rank === 3 ? 'rd' : 'th');
        s.rankDisplay = isNursery ? `${s.rank}${rankSuffix} sur ${studentData.length}` : `${s.rank}${rankSuffix} of ${studentData.length}`;
    });

    // Build rows
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

    container.innerHTML = `
        <div class="cr-table-wrapper" style="overflow:auto;max-height:70vh;border:1px solid var(--border-light);border-radius:var(--r-md);">
            <table class="data-table cr-table" style="min-width:1200px;border-collapse:separate;border-spacing:0;font-size:0.72rem;white-space:nowrap;">
                <thead style="position:sticky;top:0;z-index:3;">
                    ${headerRow}
                    ${subjectHeader}
                    ${mgExHeader}
                </thead>
                <tbody>
                    ${rows.join('')}
                </tbody>
            </table>
        </div>
    `;
}

// ──────────────────────────────────────────────────────────────────────
// EXPORT TO EXCEL
// ──────────────────────────────────────────────────────────────────────

function exportCRToExcel() {
    const table = document.querySelector('#cr-table-container .cr-table');
    if (!table) {
        showToast('No data to export', 'warning');
        return;
    }

    const selectedYear = (state.academicYears || []).find(y => y.id === selectedYearId);
    const filename = `Class_Register${selectedYear ? '_' + selectedYear.name : ''}_${new Date().toISOString().split('T')[0]}`;

    const ws = XLSX.utils.table_to_sheet(table);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Class_Register');
    XLSX.writeFile(wb, `${filename}.xlsx`);
    showToast('✅ Class register exported', 'success');
}

// ──────────────────────────────────────────────────────────────────────
// PRINT
// ──────────────────────────────────────────────────────────────────────

function printCR() {
    const container = document.getElementById('cr-table-container');
    if (!container) {
        showToast('No data to print', 'warning');
        return;
    }

    const printWindow = window.open('', '_blank');
    if (!printWindow) {
        showToast('Popup blocked. Please allow popups.', 'warning');
        return;
    }

    const title = document.querySelector('.dash-card-title')?.textContent || 'Class Register';
    const school = state.schoolSettings || {};
    const selectedYear = (state.academicYears || []).find(y => y.id === selectedYearId);

    printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>${esc(title)}</title>
            <style>
                body { font-family: Arial, sans-serif; padding: 20px; font-size: 11px; }
                table { width: 100%; border-collapse: collapse; }
                th, td { border: 1px solid #ccc; padding: 4px 6px; text-align: center; }
                th { background: #1a3a5c; color: white; font-weight: 700; }
                h1 { text-align: center; color: #1a3a5c; }
                .cr-col-rank, .cr-col-name { position: sticky; background: white; }
                @media print { body { padding: 0; } button { display: none; } }
                .badge { display: inline-block; padding: 1px 6px; border-radius: 10px; font-size: 9px; }
                .grade-Ap { background: #d1fae5; color: #065f46; }
                .grade-A { background: #d1fae5; color: #065f46; }
                .grade-B { background: #fef3c7; color: #92400e; }
                .grade-C { background: #ffedd5; color: #9a3412; }
                .grade-D { background: #fee2e2; color: #991b1b; }
                .grade-F { background: #fee2e2; color: #991b1b; }
                .year-label { text-align: center; font-size: 12px; color: #64748b; margin-bottom: 12px; }
            </style>
        </head>
        <body>
            <h1>${esc(school.school_name || 'ECOLE LA FONTAINE')}</h1>
            <h2 style="text-align:center;">${esc(title)}</h2>
            <div class="year-label">📅 ${selectedYear ? esc(selectedYear.name) : 'Current Year'}</div>
            <p style="text-align:center;">Generated on ${new Date().toLocaleString()}</p>
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