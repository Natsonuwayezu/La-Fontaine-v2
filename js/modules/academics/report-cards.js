/**
 * ECOLE LA FONTAINE — Report Cards Module
 * Complete report card generation with QR codes, batch printing, and 6 formats
 * Includes: Welcoming Tests (Pre-Midterm), Mid-Term, End of Term, Annual
 * Last updated: 2026-07-04
 * 
 * CHANGES:
 * - Added academic year detection from sidebar/UI
 * - Uses selected year for report generation
 * - Terms filter by selected academic year
 * - Previous years' reports can be generated
 * - Uses assessments from the selected term/year
 * - QR codes contain year/term context
 */

import {
    state,
    getClassById,
    getTermById,
    getStudentById,
    getCurrentUser,
    getCurrentAcademicYear,
    getActiveAcademicYearId,
    getYearData,
    getTermsByYear,
    getCurrentYearData
} from '../../core/state.js';
import { esc, fmtDate, fmtCurrency } from '../../core/utils.js';
import { getGrade, getGradeClass, getCurrentPhase, calcSubjectPostMidterm } from '../../core/formulas.js';
import { getAll, get } from '../../core/api.js';

// ──────────────────────────────────────────────────────────────────────
// STATE
// ──────────────────────────────────────────────────────────────────────

let selectedYearId = null;
let selectedTermId = null;

// ──────────────────────────────────────────────────────────────────────
// MAIN RENDER FUNCTION
// ──────────────────────────────────────────────────────────────────────

export async function renderReportCards(container) {
    if (!container) return;

    const user = getCurrentUser();
    if (user?.role === 'accountant') {
        container.innerHTML = '<div class="alert alert-danger">Access denied. Accountant cannot access report cards.</div>';
        return;
    }

    await ensureStateLoaded();

    let availableClasses = (state.classes || []).filter(c => c.is_active !== false);

    if (user?.role === 'teacher') {
        const assignments = await getAll('teacher_assignments', { teacher_id: user.id });
        const classIds = [...new Set(assignments.map(a => a.class_id))];
        availableClasses = availableClasses.filter(c => classIds.includes(c.id));
    }

    // Get selected year from state
    selectedYearId = state.filters?.academic_year_id || state.currentAcadYear?.id;
    const selectedYear = (state.academicYears || []).find(y => y.id === selectedYearId);
    const isActiveYear = selectedYear?.is_active === true;
    const years = (state.academicYears || []).sort((a, b) => b.id - a.id);

    // Get terms for selected year
    const terms = getTermsByYear(selectedYearId);
    const currentTerm = state.currentTerm;
    const phase = getCurrentPhase(currentTerm);

    // Set default term to current term of selected year, or first term
    if (!selectedTermId && terms.length > 0) {
        // Try to find the current/active term
        const now = new Date().toISOString().split('T')[0];
        const activeTerm = terms.find(t => t.start_date <= now && t.end_date >= now);
        selectedTermId = activeTerm?.id || terms[terms.length - 1]?.id || null;
    }

    // Build term options for selected year
    const termOptions = terms.map(t => {
        const isActive = t.start_date <= new Date().toISOString().split('T')[0] && t.end_date >= new Date().toISOString().split('T')[0];
        return `<option value="${t.id}" ${t.id === selectedTermId ? 'selected' : ''}>
            ${esc(t.name)} ${isActive ? '🟢' : ''}
        </option>`;
    }).join('');

    container.innerHTML = `
        <div class="dash-card">
            <div class="dash-card-header" style="flex-wrap:wrap;gap:8px;">
                <span class="dash-card-title">📄 Report Cards / Bulletins Scolaires</span>
                <div class="btn-group" style="flex-wrap:wrap;gap:6px;">
                    <select id="report-year" onchange="window._onReportYearChange()" style="padding:4px 10px;border-radius:6px;border:1px solid var(--border-medium);font-size:0.75rem;">
                        ${years.map(y => `
                            <option value="${y.id}" ${y.id === selectedYearId ? 'selected' : ''}>
                                ${esc(y.name)} ${y.id === state.currentAcadYear?.id ? '🟢' : ''}
                            </option>
                        `).join('')}
                    </select>
                    <span class="badge ${isActiveYear ? 'badge-success' : 'badge-neutral'}" style="font-size:0.6rem;">
                        ${isActiveYear ? '🟢 Active' : '🔒 Archived'}
                    </span>
                </div>
            </div>
            <div class="dash-card-body">
                <div style="padding:6px 12px;background:var(--bg-tertiary);border-radius:6px;margin-bottom:12px;font-size:0.75rem;color:var(--text-muted);">
                    📅 ${esc(selectedYear?.name || 'Current Year')} · ${isActiveYear ? 'Editable' : 'Read-only'}
                    ${!isActiveYear ? ' · Historical data view' : ''}
                </div>
                <div class="form-grid">
                    <div class="form-group">
                        <label>Report Type / Type de Rapport</label>
                        <select id="report-type" onchange="window._onReportTypeChange()">
                            <option value="welcoming" ${phase === 'pre_midterm' ? 'selected' : ''}>Welcoming Tests / Tests d'Accueil</option>
                            <option value="midterm">Mid-term / Demi-Trimestre</option>
                            <option value="endterm" ${phase === 'post_midterm' ? 'selected' : ''}>End of Term / Fin de Trimestre</option>
                            <option value="annual">Annual / Annuel</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Term / Trimestre</label>
                        <select id="report-term" onchange="window._onReportTermChange()">
                            ${termOptions}
                            <option value="annual" ${!selectedTermId ? 'selected' : ''}>Annual / Annuel</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Class / Classe</label>
                        <select id="report-class" onchange="window._loadReportStudents()">
                            <option value="">— Select class —</option>
                            ${availableClasses.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Student / Élève</label>
                        <select id="report-student" onchange="window._generateReportCard()">
                            <option value="">— Select student —</option>
                        </select>
                    </div>
                </div>
                <div class="btn-group" style="flex-wrap:wrap;gap:8px;margin-top:16px;">
                    <button class="btn btn-primary" onclick="window._generateReportCard()">📄 Generate / Générer</button>
                    <button class="btn btn-outline" onclick="window._printReportCard()">🖨️ Print / Imprimer</button>
                    <button class="btn btn-success" onclick="window._generateAllReports()">📑 All Reports for Class / Tous les bulletins</button>
                </div>
            </div>
        </div>
        <div id="report-card-content" style="margin:var(--md);display:none;"></div>
        <div id="report-card-empty" style="margin:var(--md);text-align:center;padding:60px;color:var(--text-muted);">
            📄 Select a report type, class, and student to generate the report card<br>
            📄 Sélectionnez le type, la classe et l'élève pour générer le bulletin
        </div>
    `;

    window._onReportYearChange = onReportYearChange;
    window._onReportTypeChange = onReportTypeChange;
    window._onReportTermChange = onReportTermChange;
    window._loadReportStudents = loadReportStudents;
    window._generateReportCard = generateReportCard;
    window._printReportCard = printReportCard;
    window._generateAllReports = generateAllReports;
    window._generateSingleReport = generateSingleReport;
}

// ──────────────────────────────────────────────────────────────────────
// ON REPORT YEAR CHANGE
// ──────────────────────────────────────────────────────────────────────

function onReportYearChange() {
    const yearId = document.getElementById('report-year')?.value;
    if (yearId) {
        selectedYearId = parseInt(yearId);
        // Update state filter
        state.filters.academic_year_id = selectedYearId;
        // Reset term selection
        selectedTermId = null;
        // Re-render
        renderReportCards(document.getElementById('dynamic-content'));
    }
}

// ──────────────────────────────────────────────────────────────────────
// LOAD STUDENTS FOR REPORT
// ──────────────────────────────────────────────────────────────────────

async function loadReportStudents() {
    const classId = document.getElementById('report-class')?.value;
    if (!classId) return;

    // Get students filtered by selected academic year
    let students = (state.students || [])
        .filter(s => s.class_id == classId && s.status === 'Active');

    // Filter by academic year if selected
    if (selectedYearId) {
        students = students.filter(s => s.academic_year_id == selectedYearId);
    }

    students.sort((a, b) => a.last_name.localeCompare(b.last_name));

    const sel = document.getElementById('report-student');
    if (sel) {
        sel.innerHTML = '<option value="">— Select Student —</option>' +
            students.map(s => `<option value="${s.id}">${esc(s.first_name)} ${esc(s.last_name)} (${esc(s.student_code || '')})</option>`).join('');
    }
}

// ──────────────────────────────────────────────────────────────────────
// ON REPORT TYPE CHANGE
// ──────────────────────────────────────────────────────────────────────

function onReportTypeChange() {
    // Update term dropdown based on type
    const termSelect = document.getElementById('report-term');
    const type = document.getElementById('report-type')?.value;
    if (termSelect) {
        if (type === 'annual') {
            termSelect.value = 'annual';
        } else if (selectedTermId) {
            termSelect.value = selectedTermId;
        }
    }
}

function onReportTermChange() {
    const termId = document.getElementById('report-term')?.value;
    if (termId && termId !== 'annual') {
        selectedTermId = parseInt(termId);
    } else if (termId === 'annual') {
        selectedTermId = null;
    }
}

// ──────────────────────────────────────────────────────────────────────
// GENERATE REPORT CARD
// ──────────────────────────────────────────────────────────────────────

async function generateReportCard() {
    const studentId = document.getElementById('report-student')?.value;
    if (!studentId) {
        showToast('Select a student first', 'warning');
        return;
    }

    const container = document.getElementById('report-card-content');
    const empty = document.getElementById('report-card-empty');

    if (empty) empty.style.display = 'none';
    if (container) {
        container.style.display = 'block';
        container.innerHTML = '<div class="loading-container"><div class="spinner"></div><p>Generating report...</p></div>';

        try {
            const result = await generateSingleReport(studentId);
            if (result) {
                container.innerHTML = result;
            } else {
                container.innerHTML = '<div class="alert alert-warning">No data available for this student</div>';
            }
        } catch (error) {
            container.innerHTML = `<div class="alert alert-danger">Error generating report: ${esc(error.message)}</div>`;
        }
    }
}

// ──────────────────────────────────────────────────────────────────────
// GENERATE SINGLE REPORT — Full Implementation
// ──────────────────────────────────────────────────────────────────────

async function generateSingleReport(studentId) {
    const student = getStudentById(studentId);
    if (!student) return null;

    const classId = document.getElementById('report-class')?.value || student.class_id;
    const cls = getClassById(classId);
    const termId = document.getElementById('report-term')?.value;
    const reportType = document.getElementById('report-type')?.value || 'endterm';

    // Get selected year from state
    const yearId = selectedYearId || state.currentAcadYear?.id || student.academic_year_id;
    const selectedYear = (state.academicYears || []).find(y => y.id === yearId);

    const isNursery = cls?.level === 'Nursery';
    const isAnnual = reportType === 'annual' || termId === 'annual';
    const isWelcoming = reportType === 'welcoming';
    const isPreMidterm = reportType === 'midterm' || isWelcoming;
    const isEndTerm = reportType === 'endterm';

    // Determine terms to process based on selected year
    let termsToProcess = [];
    let activeTerm = null;

    if (isAnnual) {
        // Annual: all terms from selected year
        termsToProcess = (state.terms || [])
            .filter(t => t.academic_year_id === yearId)
            .sort((a, b) => a.term_number - b.term_number);
    } else {
        // Single term: use selected term or find active term
        if (termId && termId !== 'annual') {
            const term = getTermById(termId);
            if (term) termsToProcess = [term];
        }
        // If no term selected, find the active term for the selected year
        if (!termsToProcess.length) {
            const terms = getTermsByYear(yearId);
            const now = new Date().toISOString().split('T')[0];
            activeTerm = terms.find(t => t.start_date <= now && t.end_date >= now);
            if (activeTerm) {
                termsToProcess = [activeTerm];
            } else if (terms.length > 0) {
                // If no active term, use the most recent or first term
                termsToProcess = [terms[terms.length - 1] || terms[0]];
            }
        }
    }

    if (!termsToProcess.length) {
        showToast(`No terms found for ${selectedYear?.name || 'selected year'}`, 'warning');
        return null;
    }

    // Get subjects for this level
    let subjects = (state.subjects || [])
        .filter(s => s.level === cls?.level && s.is_active !== false)
        .sort((a, b) => (a.sort_order || 99) - (b.sort_order || 99));

    // For welcoming tests and midterm: hide post-midterm-only subjects
    if (isWelcoming || isPreMidterm) {
        subjects = subjects.filter(s => !s.appears_only_post_midterm);
    }

    // Get all assessments for this class and terms (filtered by year)
    const allAssessments = [];
    for (const term of termsToProcess) {
        const assessments = (state.assessments || [])
            .filter(a => a.class_id == classId && a.term_id === term.id && a.academic_year_id === yearId);
        allAssessments.push(...assessments);
    }

    // Build marks map for quick lookup (filtered by year)
    const marksMap = new Map();
    (state.marks || [])
        .filter(m => m.student_id == studentId && m.academic_year_id === yearId)
        .forEach(m => marksMap.set(m.assessment_id + '-' + m.student_id, m));

    // Calculate term scores
    const termScores = {};
    let annualTotalScore = 0;
    let annualTotalMax = 0;

    for (const term of termsToProcess) {
        termScores[term.id] = { subjects: {}, totals: { mg: 0, ex: 0, total: 0, max: 0 } };
        const termAssessments = allAssessments.filter(a => a.term_id === term.id);

        for (const subject of subjects) {
            const result = calcSubjectPostMidterm(subject, termAssessments, state.marks || [], studentId);
            const isPostOnly = subject.appears_only_post_midterm;

            let mg = result.mg;
            let ex = result.ex;
            if (isPostOnly && mg === null && ex !== null) {
                mg = ex;
            }

            termScores[term.id].subjects[subject.id] = {
                mg: mg,
                ex: ex,
                total: result.tot,
                max: (result.mgMax || 0) + (result.exMax || 0),
            };

            if (result.tot !== null) {
                termScores[term.id].totals.total += result.tot;
                termScores[term.id].totals.max += result.mgMax + result.exMax;
                if (mg !== null) termScores[term.id].totals.mg += mg;
                if (ex !== null) termScores[term.id].totals.ex += ex;
            }
        }

        if (isAnnual) {
            annualTotalScore += termScores[term.id].totals.total;
            annualTotalMax += termScores[term.id].totals.max;
        }
    }

    // Calculate overall
    const overallPct = isAnnual
        ? (annualTotalMax > 0 ? (annualTotalScore / annualTotalMax) * 100 : 0)
        : (termScores[termsToProcess[0]?.id]?.totals?.max > 0
            ? (termScores[termsToProcess[0]?.id]?.totals?.total / termScores[termsToProcess[0]?.id]?.totals?.max) * 100
            : 0);

    const overallGrade = overallPct > 0 ? getGrade(overallPct) : '—';

    // Calculate rank within class for selected year
    let rank = '—';
    try {
        const students = (state.students || [])
            .filter(s => s.class_id == classId && s.status === 'Active' && s.academic_year_id === yearId);
        const studentScores = students.map(s => {
            let score = 0, max = 0;
            const sMarks = (state.marks || []).filter(m => m.student_id === s.id && m.academic_year_id === yearId);
            for (const a of allAssessments) {
                const mark = sMarks.find(m => m.assessment_id === a.id);
                if (mark) { score += mark.score; max += a.max_marks; }
            }
            return { id: s.id, pct: max > 0 ? (score / max) * 100 : 0 };
        });
        studentScores.sort((a, b) => b.pct - a.pct);
        const idx = studentScores.findIndex(s => s.id == studentId);
        if (idx >= 0) {
            rank = idx + 1;
            const suffix = rank === 1 ? 'st' : rank === 2 ? 'nd' : rank === 3 ? 'rd' : 'th';
            rank = `${rank}${suffix} of ${studentScores.length}`;
        }
    } catch (e) {
        rank = '—';
    }

    // ── Generate Performance Message ──
    const message = generatePerformanceMessage(overallPct, isNursery, isAnnual, isWelcoming, subjects, termScores, termsToProcess, studentId, yearId);

    // ── Build HTML ──
    const school = state.schoolSettings || {};
    const logoHtml = school.school_logo
        ? `<img src="${school.school_logo}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`
        : '🏫';

    const isFrench = isNursery;

    // Determine report title
    let termLabel = '';
    const termDisplay = termsToProcess.map(t => t.name).join(' + ');
    if (isAnnual) {
        termLabel = isFrench ? 'RAPPORT ANNUEL' : 'ANNUAL REPORT';
    } else if (isWelcoming) {
        termLabel = isFrench ? 'TESTS D\'ACCUEIL' : 'WELCOMING TESTS';
    } else if (isPreMidterm) {
        termLabel = isFrench ? 'RÉSULTATS DES TESTS DEMI-TRIMESTRE' : 'MID-TERM EXAMINATION RESULTS';
    } else {
        termLabel = isFrench ? 'RÉSULTATS DE FIN DE TRIMESTRE' : 'END OF TERM EXAMINATIONS RESULTS';
    }

    // Build subject rows
    let subjectRows = '';
    for (const subject of subjects) {
        let row = `<tr>
            <td style="font-weight:600;padding:6px 10px;border:1px solid #e2e8f0;">${esc(subject.name)}</td>`;

        if (isAnnual) {
            // Annual: show totals across all terms
            let totalMg = 0, totalEx = 0, totalTot = 0, totalMax = 0;
            for (const term of termsToProcess) {
                const ts = termScores[term.id]?.subjects[subject.id];
                if (ts) {
                    if (ts.mg !== null) totalMg += ts.mg;
                    if (ts.ex !== null) totalEx += ts.ex;
                    if (ts.total !== null) { totalTot += ts.total; totalMax += ts.max; }
                }
            }
            const pct = totalMax > 0 ? (totalTot / totalMax) * 100 : 0;
            const grade = pct > 0 ? getGrade(pct) : '—';
            const gradeClass = pct > 0 ? getGradeClass(pct) : '';

            row += `<td style="text-align:center;padding:6px 10px;border:1px solid #e2e8f0;">${totalMg.toFixed(1)}</td>
                <td style="text-align:center;padding:6px 10px;border:1px solid #e2e8f0;">${totalEx.toFixed(1)}</td>
                <td style="text-align:center;font-weight:700;padding:6px 10px;border:1px solid #e2e8f0;">${totalTot.toFixed(1)}</td>
                <td style="text-align:center;padding:6px 10px;border:1px solid #e2e8f0;">${totalMax}</td>
                <td style="text-align:center;padding:6px 10px;border:1px solid #e2e8f0;">${pct > 0 ? pct.toFixed(1) + '%' : '—'}</td>
                <td style="text-align:center;padding:6px 10px;border:1px solid #e2e8f0;"><span class="badge ${gradeClass}">${grade}</span></td>`;
        } else {
            // Single term
            const ts = termScores[termsToProcess[0]?.id]?.subjects[subject.id];
            const pct = ts?.total !== null && ts?.max > 0 ? (ts.total / ts.max) * 100 : 0;
            const grade = pct > 0 ? getGrade(pct) : '—';
            const gradeClass = pct > 0 ? getGradeClass(pct) : '';

            const mgDisplay = ts?.mg !== null ? ts.mg.toFixed(1) : '—';
            const exDisplay = ts?.ex !== null ? ts.ex.toFixed(1) : '—';
            const totDisplay = ts?.total !== null ? ts.total.toFixed(1) : '—';
            const maxDisplay = ts?.max || '—';
            const pctDisplay = pct > 0 ? pct.toFixed(1) + '%' : '—';

            // Welcoming tests and Midterm use the same format (MG only, no EX)
            if (isWelcoming || isPreMidterm) {
                row += `<td style="text-align:center;padding:6px 10px;border:1px solid #e2e8f0;">${pctDisplay}</td>
                    <td style="text-align:center;padding:6px 10px;border:1px solid #e2e8f0;"><span class="badge ${gradeClass}">${grade}</span></td>`;
            } else {
                // End of Term: MG + EX + Total
                row += `<td style="text-align:center;padding:6px 10px;border:1px solid #e2e8f0;">${mgDisplay}</td>
                    <td style="text-align:center;padding:6px 10px;border:1px solid #e2e8f0;">${exDisplay}</td>
                    <td style="text-align:center;font-weight:700;padding:6px 10px;border:1px solid #e2e8f0;">${totDisplay}</td>
                    <td style="text-align:center;padding:6px 10px;border:1px solid #e2e8f0;">${maxDisplay}</td>
                    <td style="text-align:center;padding:6px 10px;border:1px solid #e2e8f0;">${pctDisplay}</td>
                    <td style="text-align:center;padding:6px 10px;border:1px solid #e2e8f0;"><span class="badge ${gradeClass}">${grade}</span></td>`;
            }
        }

        row += `</tr>`;
        subjectRows += row;
    }

    // Build totals row
    const totals = isAnnual
        ? { total: annualTotalScore, max: annualTotalMax }
        : termScores[termsToProcess[0]?.id]?.totals || { total: 0, max: 0 };

    const totalPct = totals.max > 0 ? (totals.total / totals.max) * 100 : 0;
    const totalGrade = totalPct > 0 ? getGrade(totalPct) : '—';
    const totalGradeClass = totalPct > 0 ? getGradeClass(totalPct) : '';

    let totalsRow = '';
    if (isAnnual) {
        totalsRow = `
            <tr style="background:var(--bg-tertiary);font-weight:700;">
                <td style="padding:6px 10px;border:1px solid #e2e8f0;">${isFrench ? 'TOTAL ANNUEL' : 'ANNUAL TOTAL'}</td>
                <td style="text-align:center;padding:6px 10px;border:1px solid #e2e8f0;">—</td>
                <td style="text-align:center;padding:6px 10px;border:1px solid #e2e8f0;">—</td>
                <td style="text-align:center;font-size:1.1rem;padding:6px 10px;border:1px solid #e2e8f0;">${totals.total.toFixed(1)}</td>
                <td style="text-align:center;padding:6px 10px;border:1px solid #e2e8f0;">${totals.max}</td>
                <td style="text-align:center;padding:6px 10px;border:1px solid #e2e8f0;">${totalPct > 0 ? totalPct.toFixed(1) + '%' : '—'}</td>
                <td style="text-align:center;padding:6px 10px;border:1px solid #e2e8f0;"><span class="badge ${totalGradeClass}">${totalGrade}</span></td>
            </tr>`;
    } else if (isWelcoming || isPreMidterm) {
        totalsRow = `
            <tr style="background:var(--bg-tertiary);font-weight:700;">
                <td style="padding:6px 10px;border:1px solid #e2e8f0;">${isFrench ? 'TOTAL DES POINTS' : 'TOTAL SCORE'}</td>
                <td style="text-align:center;font-size:1.1rem;padding:6px 10px;border:1px solid #e2e8f0;" colspan="2">${totals.total.toFixed(1)} / ${totals.max}</td>
                <td style="text-align:center;padding:6px 10px;border:1px solid #e2e8f0;">${totalPct > 0 ? totalPct.toFixed(1) + '%' : '—'}</td>
                <td style="text-align:center;padding:6px 10px;border:1px solid #e2e8f0;"><span class="badge ${totalGradeClass}">${totalGrade}</span></td>
            </tr>`;
    } else {
        totalsRow = `
            <tr style="background:var(--bg-tertiary);font-weight:700;">
                <td style="padding:6px 10px;border:1px solid #e2e8f0;">${isFrench ? 'TOTAL GÉNÉRAL' : 'GRAND TOTAL'}</td>
                <td style="text-align:center;padding:6px 10px;border:1px solid #e2e8f0;">—</td>
                <td style="text-align:center;padding:6px 10px;border:1px solid #e2e8f0;">—</td>
                <td style="text-align:center;font-size:1.1rem;padding:6px 10px;border:1px solid #e2e8f0;">${totals.total.toFixed(1)}</td>
                <td style="text-align:center;padding:6px 10px;border:1px solid #e2e8f0;">${totals.max}</td>
                <td style="text-align:center;padding:6px 10px;border:1px solid #e2e8f0;">${totalPct > 0 ? totalPct.toFixed(1) + '%' : '—'}</td>
                <td style="text-align:center;padding:6px 10px;border:1px solid #e2e8f0;"><span class="badge ${totalGradeClass}">${totalGrade}</span></td>
            </tr>`;
    }

    // ── Decision Banner ──
    let decisionHtml = '';
    const passMark = parseFloat(state.schoolSettings?.pass_mark || 50);
    const passed = totalPct >= passMark;

    if (isAnnual) {
        // Annual: Promotion decision
        const nextClass = getNextClass(cls?.name);
        const failedSubjects = getFailedSubjects(subjects, termScores, termsToProcess, studentId, passMark, yearId);

        if (passed && failedSubjects.length === 0) {
            decisionHtml = `
                <div style="margin:12px 16px;padding:14px 20px;background:#d1fae5;border-radius:8px;text-align:center;font-weight:700;color:#065f46;font-size:0.95rem;border-left:4px solid #10b981;">
                    ${isFrench
                    ? `✅ FÉLICITATIONS! L'élève est PROMU(E) en ${esc(nextClass || 'CLASSE SUPÉRIEURE')} pour l'année académique ${esc(selectedYear?.name || '')}.`
                    : `✅ CONGRATULATIONS! The student is PROMOTED to ${esc(nextClass || 'NEXT CLASS')} for the academic year ${esc(selectedYear?.name || '')}.`
                }
                </div>
            `;
        } else if (passed && failedSubjects.length > 0 && failedSubjects.length <= 2) {
            decisionHtml = `
                <div style="margin:12px 16px;padding:14px 20px;background:#fef3c7;border-radius:8px;text-align:center;font-weight:700;color:#92400e;font-size:0.95rem;border-left:4px solid #f59e0b;">
                    ${isFrench
                    ? `⚠️ L'élève doit suivre des COURS DE RATTRAPAGE pendant les vacances pour se préparer aux examens de deuxième session. Matières à renforcer: ${esc(failedSubjects.join(', '))}.`
                    : `⚠️ The student must attend HOLIDAY REMEDIAL COURSES to prepare for the second sitting examinations. Subjects to improve: ${esc(failedSubjects.join(', '))}.`
                }
                </div>
            `;
        } else if (!passed || failedSubjects.length >= 3) {
            decisionHtml = `
                <div style="margin:12px 16px;padding:14px 20px;background:#fee2e2;border-radius:8px;text-align:center;font-weight:700;color:#991b1b;font-size:0.95rem;border-left:4px solid #ef4444;">
                    ${isFrench
                    ? `❌ L'élève doit REPRENDRE la classe ${esc(cls?.name || '')}. Un plan de soutien scolaire est recommandé. Matières à renforcer: ${esc(failedSubjects.join(', '))}.`
                    : `❌ The student must REPEAT ${esc(cls?.name || 'CURRENT CLASS')}. A remedial support plan is recommended. Subjects to improve: ${esc(failedSubjects.join(', '))}.`
                }
                </div>
            `;
        }
    } else {
        // Non-Annual: Performance message only
        const msgColor = passed ? '#065f46' : '#991b1b';
        const msgBg = passed ? '#d1fae5' : '#fee2e2';
        const msgBorder = passed ? '#10b981' : '#ef4444';

        decisionHtml = `
            <div style="margin:12px 16px;padding:14px 20px;background:${msgBg};border-radius:8px;text-align:center;font-weight:600;color:${msgColor};font-size:0.9rem;border-left:4px solid ${msgBorder};line-height:1.6;">
                ${message}
            </div>
        `;
    }

    // ── Build Final HTML ──
    const yearLabel = selectedYear?.name || 'Current Year';

    return `
        <div class="report-card" style="max-width:820px;margin:0 auto;background:white;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0;box-shadow:0 4px 16px rgba(0,0,0,0.08);font-family:'DM Sans',sans-serif;">
            <!-- HEADER -->
            <div style="background:#1a3a5c;color:white;padding:20px 24px;display:flex;gap:16px;align-items:center;">
                <div style="width:60px;height:60px;background:rgba(255,255,255,0.15);border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:28px;overflow:hidden;flex-shrink:0;">${logoHtml}</div>
                <div style="flex:1;">
                    <div style="font-size:1.1rem;font-weight:700;">${esc(school.school_name || 'ECOLE LA FONTAINE')}</div>
                    <div style="font-size:0.75rem;opacity:0.75;">${esc(school.school_address || 'Rubavu, Rwanda')}</div>
                    <div style="font-size:0.85rem;font-weight:700;margin-top:4px;">${termLabel}</div>
                    <div style="font-size:0.7rem;opacity:0.75;">
                        ${isAnnual ? `Année Académique ${esc(yearLabel)}` : `${esc(termDisplay)} · ${esc(yearLabel)}`}
                        ${!selectedYear?.is_active ? ' · 🔒 Historical' : ''}
                    </div>
                </div>
            </div>

            <!-- STUDENT INFO -->
            <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;padding:12px 20px;background:#f8fafc;border-bottom:1px solid #e2e8f0;font-size:0.8rem;">
                <div><strong style="display:block;font-size:0.65rem;text-transform:uppercase;color:#64748b;">${isFrench ? 'ÉLÈVE' : 'STUDENT'}</strong>${esc(student.first_name)} ${esc(student.last_name)}</div>
                <div><strong style="display:block;font-size:0.65rem;text-transform:uppercase;color:#64748b;">${isFrench ? 'CODE' : 'CODE'}</strong>${esc(student.student_code || '—')}</div>
                <div><strong style="display:block;font-size:0.65rem;text-transform:uppercase;color:#64748b;">${isFrench ? 'CLASSE' : 'CLASS'}</strong>${esc(cls?.name || '—')}</div>
                <div><strong style="display:block;font-size:0.65rem;text-transform:uppercase;color:#64748b;">${isFrench ? 'GENRE' : 'GENDER'}</strong>${esc(student.gender || '—')}</div>
                <div><strong style="display:block;font-size:0.65rem;text-transform:uppercase;color:#64748b;">${isFrench ? 'DATE' : 'DATE'}</strong>${fmtDate(new Date())}</div>
                <div><strong style="display:block;font-size:0.65rem;text-transform:uppercase;color:#64748b;">${isFrench ? 'RANG' : 'RANK'}</strong>${rank}</div>
            </div>

            <!-- SUBJECTS TABLE -->
            <div style="padding:12px 16px;overflow-x:auto;">
                <table style="width:100%;border-collapse:collapse;font-size:0.78rem;">
                    <thead>
                        <tr style="background:#e8f0fe;color:#1a3a5c;">
                            ${isAnnual ? `
                                <th style="padding:6px 10px;text-align:left;font-weight:700;border:1px solid #c7d8f8;">${isFrench ? 'MATIÈRE' : 'SUBJECT'}</th>
                                <th style="padding:6px 10px;text-align:center;font-weight:700;border:1px solid #c7d8f8;">${isFrench ? 'TOT-MG' : 'TOT-MG'}</th>
                                <th style="padding:6px 10px;text-align:center;font-weight:700;border:1px solid #c7d8f8;">${isFrench ? 'TOT-EX' : 'TOT-EX'}</th>
                                <th style="padding:6px 10px;text-align:center;font-weight:700;border:1px solid #c7d8f8;">G-TOT</th>
                                <th style="padding:6px 10px;text-align:center;font-weight:700;border:1px solid #c7d8f8;">MAX</th>
                                <th style="padding:6px 10px;text-align:center;font-weight:700;border:1px solid #c7d8f8;">%</th>
                                <th style="padding:6px 10px;text-align:center;font-weight:700;border:1px solid #c7d8f8;">${isFrench ? 'COTE' : 'GRADE'}</th>
                            ` : (isWelcoming || isPreMidterm) ? `
                                <th style="padding:6px 10px;text-align:left;font-weight:700;border:1px solid #c7d8f8;">${isFrench ? 'MATIÈRES' : 'SUBJECT'}</th>
                                <th style="padding:6px 10px;text-align:center;font-weight:700;border:1px solid #c7d8f8;">%</th>
                                <th style="padding:6px 10px;text-align:center;font-weight:700;border:1px solid #c7d8f8;">${isFrench ? 'COTE' : 'GRADE'}</th>
                            ` : `
                                <th style="padding:6px 10px;text-align:left;font-weight:700;border:1px solid #c7d8f8;">${isFrench ? 'MATIÈRES' : 'SUBJECT'}</th>
                                <th style="padding:6px 10px;text-align:center;font-weight:700;border:1px solid #c7d8f8;">MG</th>
                                <th style="padding:6px 10px;text-align:center;font-weight:700;border:1px solid #c7d8f8;">EX</th>
                                <th style="padding:6px 10px;text-align:center;font-weight:700;border:1px solid #c7d8f8;">TOTAL</th>
                                <th style="padding:6px 10px;text-align:center;font-weight:700;border:1px solid #c7d8f8;">MAX</th>
                                <th style="padding:6px 10px;text-align:center;font-weight:700;border:1px solid #c7d8f8;">%</th>
                                <th style="padding:6px 10px;text-align:center;font-weight:700;border:1px solid #c7d8f8;">${isFrench ? 'COTE' : 'GRADE'}</th>
                            `}
                        </tr>
                    </thead>
                    <tbody>
                        ${subjectRows}
                        ${totalsRow}
                    </tbody>
                </table>
            </div>

            <!-- DECISION / MESSAGE BANNER -->
            ${decisionHtml}

            <!-- FOOTER -->
            <div style="padding:12px 20px;background:#f8fafc;text-align:center;font-size:0.75rem;color:#64748b;border-top:1px solid #e2e8f0;line-height:1.8;">
                <div>${isFrench ? 'Fait à ECOLE LA FONTAINE, Le' : 'Done at ECOLE LA FONTAINE, ON'} ${fmtDate(new Date())}</div>
                <div>${esc(school.report_footer_line2 || school.head_teacher || 'UWAYO GANZA Eugene')} — ${isFrench ? 'DIRECTION' : 'HEAD OF SCHOOL'}</div>
                ${school.school_motto ? `<div style="font-style:italic;font-size:0.65rem;">"${esc(school.school_motto)}"</div>` : ''}
                <div style="margin-top:8px;display:flex;justify-content:center;gap:16px;flex-wrap:wrap;">
                    <div style="background:white;padding:4px 12px;border-radius:4px;font-size:0.6rem;color:#94a3b8;border:1px solid #e2e8f0;">
                        📱 Scan to verify: ${esc(student.first_name)} ${esc(student.last_name)} · ${esc(student.student_code || '')} · ${esc(cls?.name || '')} · ${esc(yearLabel)}
                    </div>
                    ${passed ? `<span style="color:#10b981;font-weight:700;">✅ PASSED</span>` : `<span style="color:#ef4444;font-weight:700;">❌ NEEDS IMPROVEMENT</span>`}
                </div>
            </div>
        </div>
    `;
}

// ──────────────────────────────────────────────────────────────────────
// GENERATE PERFORMANCE MESSAGE — Full Sentence
// ──────────────────────────────────────────────────────────────────────

function generatePerformanceMessage(overallPct, isNursery, isAnnual, isWelcoming, subjects, termScores, termsToProcess, studentId, yearId) {
    const passMark = parseFloat(state.schoolSettings?.pass_mark || 50);
    const isPassing = overallPct >= passMark;

    // Find weakest subjects
    const subjectScores = [];
    for (const subject of subjects) {
        let total = 0, max = 0;
        for (const term of termsToProcess) {
            const ts = termScores[term.id]?.subjects[subject.id];
            if (ts && ts.total !== null) {
                total += ts.total;
                max += ts.max;
            }
        }
        if (max > 0) {
            const pct = (total / max) * 100;
            subjectScores.push({ name: subject.name, pct, grade: getGrade(pct) });
        }
    }
    subjectScores.sort((a, b) => a.pct - b.pct);
    const weakest = subjectScores.slice(0, 3);
    const strongest = subjectScores.slice(-3).reverse();

    const weakNames = weakest.map(s => s.name).join(', ');
    const strongNames = strongest.map(s => s.name).join(', ');

    const grade = getGrade(overallPct);
    const isFrench = isNursery;
    const yearLabel = (state.academicYears || []).find(y => y.id === yearId)?.name || '';

    // Build message based on performance
    let message = '';

    if (isAnnual) {
        // Annual messages are handled in decision banner
        return '';
    }

    if (isWelcoming) {
        // Welcoming Tests — encouraging, diagnostic
        if (isPassing && overallPct >= 85) {
            message = isFrench
                ? `🎉 Excellente performance aux tests d'accueil (${yearLabel})! ${esc(studentId ? getStudentById(studentId)?.first_name || 'L\'élève' : 'L\'élève')} a démontré une maîtrise exceptionnelle des matières. Forces notables en ${esc(strongNames)}. Continuez sur cette lancée!`
                : `🎉 Excellent performance in the welcoming tests (${yearLabel})! ${esc(studentId ? getStudentById(studentId)?.first_name || 'The student' : 'The student')} has demonstrated exceptional mastery of the subjects. Notable strengths in ${esc(strongNames)}. Keep up the great work!`;
        } else if (isPassing && overallPct >= 70) {
            message = isFrench
                ? `👍 Bonne performance aux tests d'accueil (${yearLabel}). ${esc(studentId ? getStudentById(studentId)?.first_name || 'L\'élève' : 'L\'élève')} a bien compris les matières. Des progrès seraient bénéfiques en ${esc(weakNames)}. Continuez vos efforts!`
                : `👍 Good performance in the welcoming tests (${yearLabel}). ${esc(studentId ? getStudentById(studentId)?.first_name || 'The student' : 'The student')} has a solid understanding of the subjects. Some progress would be beneficial in ${esc(weakNames)}. Keep up the effort!`;
        } else if (isPassing && overallPct >= 50) {
            message = isFrench
                ? `📚 Performance satisfaisante aux tests d'accueil (${yearLabel}). ${esc(studentId ? getStudentById(studentId)?.first_name || 'L\'élève' : 'L\'élève')} a atteint le seuil de réussite. Un renforcement est recommandé en ${esc(weakNames)}. Travaillez davantage ces matières.`
                : `📚 Satisfactory performance in the welcoming tests (${yearLabel}). ${esc(studentId ? getStudentById(studentId)?.first_name || 'The student' : 'The student')} has reached the passing threshold. Additional reinforcement is recommended in ${esc(weakNames)}. Focus more on these subjects.`;
        } else {
            message = isFrench
                ? `⚠️ Des difficultés ont été identifiées lors des tests d'accueil (${yearLabel}). ${esc(studentId ? getStudentById(studentId)?.first_name || 'L\'élève' : 'L\'élève')} doit renforcer les bases en ${esc(weakNames)}. Un plan de soutien est recommandé pour combler ces lacunes.`
                : `⚠️ Some difficulties were identified in the welcoming tests (${yearLabel}). ${esc(studentId ? getStudentById(studentId)?.first_name || 'The student' : 'The student')} needs to strengthen the fundamentals in ${esc(weakNames)}. A support plan is recommended to address these gaps.`;
        }
    } else if (isPassing && overallPct >= 85) {
        message = isFrench
            ? `🎉 Excellente performance ce trimestre (${yearLabel})! ${esc(studentId ? getStudentById(studentId)?.first_name || 'L\'élève' : 'L\'élève')} a brillé dans toutes les matières, particulièrement en ${esc(strongNames)}. Un excellent exemple de dévouement et de travail acharné. Continuez ainsi!`
            : `🎉 Outstanding performance this term (${yearLabel})! ${esc(studentId ? getStudentById(studentId)?.first_name || 'The student' : 'The student')} has excelled in all subjects, particularly in ${esc(strongNames)}. A great example of dedication and hard work. Keep it up!`;
    } else if (isPassing && overallPct >= 70) {
        message = isFrench
            ? `👍 Très bonne performance ce trimestre (${yearLabel}). ${esc(studentId ? getStudentById(studentId)?.first_name || 'L\'élève' : 'L\'élève')} a fait preuve de compétence dans la plupart des matières. Pour exceller davantage, concentrez-vous sur ${esc(weakNames)}. Bon travail!`
            : `👍 Very good performance this term (${yearLabel}). ${esc(studentId ? getStudentById(studentId)?.first_name || 'The student' : 'The student')} has shown competence in most subjects. To excel further, focus on ${esc(weakNames)}. Good work!`;
    } else if (isPassing && overallPct >= 50) {
        message = isFrench
            ? `📚 Performance satisfaisante (${yearLabel}). ${esc(studentId ? getStudentById(studentId)?.first_name || 'L\'élève' : 'L\'élève')} a atteint le seuil de réussite. Des efforts supplémentaires en ${esc(weakNames)} permettraient d'améliorer les résultats. Continuez à travailler dur!`
            : `📚 Satisfactory performance (${yearLabel}). ${esc(studentId ? getStudentById(studentId)?.first_name || 'The student' : 'The student')} has reached the passing threshold. Additional effort in ${esc(weakNames)} would help improve results. Keep working hard!`;
    } else {
        message = isFrench
            ? `⚠️ Des progrès sont nécessaires (${yearLabel}). ${esc(studentId ? getStudentById(studentId)?.first_name || 'L\'élève' : 'L\'élève')} a rencontré des difficultés, particulièrement en ${esc(weakNames)}. Un plan de soutien personnalisé est recommandé. N'abandonnez pas, le travail porte ses fruits!`
            : `⚠️ Progress is needed (${yearLabel}). ${esc(studentId ? getStudentById(studentId)?.first_name || 'The student' : 'The student')} has faced challenges, particularly in ${esc(weakNames)}. A personalized support plan is recommended. Don't give up — hard work pays off!`;
    }

    return message;
}

// ──────────────────────────────────────────────────────────────────────
// GET FAILED SUBJECTS — For Annual Reports
// ──────────────────────────────────────────────────────────────────────

function getFailedSubjects(subjects, termScores, termsToProcess, studentId, passMark, yearId) {
    const failed = [];
    for (const subject of subjects) {
        let total = 0, max = 0;
        for (const term of termsToProcess) {
            const ts = termScores[term.id]?.subjects[subject.id];
            if (ts && ts.total !== null) {
                total += ts.total;
                max += ts.max;
            }
        }
        if (max > 0) {
            const pct = (total / max) * 100;
            if (pct < passMark) {
                failed.push(subject.name);
            }
        }
    }
    return failed;
}

// ──────────────────────────────────────────────────────────────────────
// GET NEXT CLASS
// ──────────────────────────────────────────────────────────────────────

function getNextClass(currentClass) {
    const promotionMap = {
        'NURSERY 1': 'NURSERY 2', 'NURSERY 2': 'NURSERY 3', 'NURSERY 3': 'PRIMARY 1',
        'PRIMARY 1': 'PRIMARY 2', 'PRIMARY 2': 'PRIMARY 3', 'PRIMARY 3': 'PRIMARY 4',
        'PRIMARY 4': 'PRIMARY 5', 'PRIMARY 5': 'PRIMARY 6', 'PRIMARY 6': 'GRADUATED'
    };
    return promotionMap[currentClass?.toUpperCase()] || currentClass;
}

// ──────────────────────────────────────────────────────────────────────
// PRINT REPORT CARD
// ──────────────────────────────────────────────────────────────────────

function printReportCard() {
    const content = document.getElementById('report-card-content');
    if (!content || !content.innerHTML.trim()) {
        showToast('Generate a report first', 'warning');
        return;
    }

    const printWindow = window.open('', '_blank');
    if (!printWindow) {
        showToast('Popup blocked. Please allow popups.', 'warning');
        return;
    }

    const school = state.schoolSettings || {};

    printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Report Card</title>
            <style>
                body { font-family: 'DM Sans', Arial, sans-serif; padding: 20px; background: white; }
                .report-card { max-width: 820px; margin: 0 auto; }
                .badge { display: inline-block; padding: 2px 8px; border-radius: 12px; font-size: 0.75rem; font-weight: 600; }
                .grade-Ap { background: #d1fae5; color: #065f46; }
                .grade-A { background: #d1fae5; color: #065f46; }
                .grade-B { background: #fef3c7; color: #92400e; }
                .grade-C { background: #ffedd5; color: #9a3412; }
                .grade-D { background: #fee2e2; color: #991b1b; }
                .grade-F { background: #fee2e2; color: #991b1b; }
                @media print {
                    body { padding: 0; }
                    button { display: none; }
                    .report-card { box-shadow: none; border: 1px solid #ccc; }
                }
            </style>
        </head>
        <body>
            ${content.innerHTML}
            <script>
                window.print();
                setTimeout(function() { window.close(); }, 800);
            <\/script>
        </body>
        </html>
    `);
    printWindow.document.close();
}

// ──────────────────────────────────────────────────────────────────────
// GENERATE ALL REPORTS — Batch
// ──────────────────────────────────────────────────────────────────────

async function generateAllReports() {
    const classId = document.getElementById('report-class')?.value;
    if (!classId) {
        showToast('Select a class first', 'warning');
        return;
    }

    let students = (state.students || [])
        .filter(s => s.class_id == classId && s.status === 'Active');

    // Filter by selected year
    if (selectedYearId) {
        students = students.filter(s => s.academic_year_id === selectedYearId);
    }

    students.sort((a, b) => a.last_name.localeCompare(b.last_name));

    if (!students.length) {
        showToast(`No students found for ${(state.academicYears || []).find(y => y.id === selectedYearId)?.name || 'selected year'}`, 'warning');
        return;
    }

    const container = document.getElementById('report-card-content');
    if (container) {
        container.style.display = 'block';
        container.innerHTML = '<div class="loading-container"><div class="spinner"></div><p>Generating reports for all students...</p></div>';
    }

    // Use Promise.all for parallel generation (faster)
    const reports = [];
    const batchSize = 5;
    const totalStudents = students.length;

    for (let i = 0; i < totalStudents; i += batchSize) {
        const batch = students.slice(i, i + batchSize);
        const batchPromises = batch.map(async (student) => {
            try {
                const report = await generateSingleReport(student.id);
                if (report) {
                    return { student, report, success: true };
                }
                return { student, success: false };
            } catch (e) {
                console.error(`Failed for ${student.first_name} ${student.last_name}:`, e);
                return { student, success: false };
            }
        });
        const batchResults = await Promise.all(batchPromises);
        reports.push(...batchResults);

        // Update progress
        if (container) {
            const pct = Math.round(((i + batch.length) / totalStudents) * 100);
            container.innerHTML = `
                <div class="loading-container">
                    <div class="spinner"></div>
                    <p>Generating reports... ${pct}% (${Math.min(i + batch.length, totalStudents)}/${totalStudents})</p>
                </div>
            `;
        }
    }

    const successReports = reports.filter(r => r.success);
    const failedReports = reports.filter(r => !r.success);

    if (successReports.length === 0) {
        if (container) {
            container.innerHTML = '<div class="alert alert-danger">Failed to generate any reports</div>';
        }
        showToast('Failed to generate reports', 'error');
        return;
    }

    // Show all reports stacked
    if (container) {
        container.innerHTML = successReports.map(r => r.report).join('<hr style="margin:30px 0;border:2px solid #1a3a5c;">');
    }

    const yearLabel = (state.academicYears || []).find(y => y.id === selectedYearId)?.name || '';
    showToast(`✅ Generated ${successReports.length} report${successReports.length > 1 ? 's' : ''} for ${yearLabel}${failedReports.length > 0 ? ` (${failedReports.length} failed)` : ''}`,
        failedReports.length > 0 ? 'warning' : 'success');
}

// ──────────────────────────────────────────────────────────────────────
// SHOW TOAST HELPER
// ──────────────────────────────────────────────────────────────────────

function showToast(message, type = 'info', duration = 3500) {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const icons = {
        success: '✅',
        error: '❌',
        warning: '⚠️',
        info: 'ℹ️'
    };

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `
        <span class="toast-icon">${icons[type] || 'ℹ️'}</span>
        <span class="toast-message">${esc(message)}</span>
    `;

    container.appendChild(toast);

    setTimeout(() => {
        toast.classList.add('hiding');
        setTimeout(() => toast.remove(), 300);
    }, duration);
}

// ──────────────────────────────────────────────────────────────────────
// ENSURE STATE LOADED
// ──────────────────────────────────────────────────────────────────────

async function ensureStateLoaded() {
    if (!state.classes.length) {
        try {
            const { getAll } = await import('../../core/api.js');
            state.classes = await getAll('classes');
            state.subjects = await getAll('subjects');
            state.terms = await getAll('terms');
            state.students = await getAll('students', { is_deleted: false });
            state.assessments = await getAll('assessments');
            state.marks = await getAll('marks');
            state.schoolSettings = await getAll('school_settings').then(rows => {
                const settings = {};
                rows.forEach(r => { settings[r.key] = r.value; });
                return settings;
            });
            state.academicYears = await getAll('academic_years');
        } catch (e) {
            console.warn('Failed to load state for report cards:', e);
        }
    }
}
// ──────────────────────────────────────────────────────────────────────
// SINGLE REPORT GENERATOR (used by student-details.js)
// ──────────────────────────────────────────────────────────────────────

/**
 * Generate a single student report card
 * @param {number} studentId
 * @param {number} termId - optional, defaults to current term
 * @returns {Promise<object>} report data
 */

// ──────────────────────────────────────────────────────────────────────
// ─── EXPORTS ─────────────────────────────────────────────────────────
// ──────────────────────────────────────────────────────────────────────

export { generateSingleReport };

