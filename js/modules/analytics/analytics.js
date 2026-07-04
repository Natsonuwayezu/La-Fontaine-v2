/**
 * ECOLE LA FONTAINE — Analytics Dashboard
 * Advanced analytics with trends, subject analysis, teacher performance, and risk indicators
 * Last updated: 2026-07-03
 * 
 * CHANGES:
 * - Added academic year selector
 * - Analytics data filtered by selected academic year
 * - Year-over-year comparison support
 * - Multiple years shown in trend data
 * - Academic year label in all charts
 * - Support for viewing historical analytics
 */

import {
    state,
    getCurrentUser,
    getClassById,
    getSubjectById,
    getTermById,
    getCurrentAcademicYear,
    getActiveAcademicYearId,
    getYearData,
    getCurrentYearData,
    setYearFilter
} from '../../core/state.js';
import { esc, fmtDate, fmtPct, fmtCurrency } from '../../core/utils.js';
import { getGrade, getGradeClass, getCurrentPhase } from '../../core/formulas.js';
import { asciiHorizontalBar, gradeDistributionChart, trendIndicator, chartWithYear } from '../../ui/charts.js';
import { getAll, getYearData as apiGetYearData } from '../../core/api.js';

// ──────────────────────────────────────────────────────────────────────
// STATE
// ──────────────────────────────────────────────────────────────────────

let selectedYearId = null;
let analyticsCache = {};

// ──────────────────────────────────────────────────────────────────────
// MAIN RENDER FUNCTION
// ──────────────────────────────────────────────────────────────────────

export async function renderAnalytics(container) {
    if (!container) return;

    const user = getCurrentUser();
    if (user?.role !== 'admin') {
        container.innerHTML = '<div class="alert alert-danger">Access denied. Admin privileges required.</div>';
        return;
    }

    await ensureStateLoaded();

    const currentYear = getCurrentAcademicYear();
    const years = (state.academicYears || []).sort((a, b) => b.id - a.id);
    const currentTerm = state.currentTerm;
    const terms = (state.terms || [])
        .filter(t => t.academic_year_id === state.currentAcadYear?.id)
        .sort((a, b) => a.term_number - b.term_number);

    // Default to current year
    if (!selectedYearId) {
        selectedYearId = state.filters?.academic_year_id || currentYear?.id || null;
    }

    const classes = (state.classes || []).filter(c => c.is_active !== false);
    const subjects = (state.subjects || []).filter(s => s.is_active !== false);

    container.innerHTML = `
        <div class="analytics-module">
            <div class="dash-card">
                <div class="dash-card-header" style="flex-wrap:wrap;gap:8px;">
                    <span class="dash-card-title">📈 Analytics Dashboard</span>
                    <div class="btn-group" style="flex-wrap:wrap;gap:6px;">
                        <select id="analytics-year" onchange="window._loadAnalyticsData()" style="padding:6px 12px;border-radius:var(--r-md);border:1px solid var(--border-medium);">
                            ${years.map(y => `
                                <option value="${y.id}" ${y.id === selectedYearId ? 'selected' : ''}>
                                    ${esc(y.name)} ${y.id === currentYear?.id ? '🟢' : ''} ${y.is_active ? '✅' : '🔒'}
                                </option>
                            `).join('')}
                            <option value="all" ${selectedYearId === 'all' ? 'selected' : ''}>All Years</option>
                        </select>
                        <select id="analytics-term" onchange="window._loadAnalyticsData()" style="padding:6px 12px;border-radius:var(--r-md);border:1px solid var(--border-medium);">
                            ${terms.map(t => `<option value="${t.id}" ${t.id === currentTerm?.id ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}
                            <option value="all">All Terms</option>
                        </select>
                        <select id="analytics-class" onchange="window._loadAnalyticsData()" style="padding:6px 12px;border-radius:var(--r-md);border:1px solid var(--border-medium);">
                            <option value="">All Classes</option>
                            ${classes.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}
                        </select>
                        <select id="analytics-subject" onchange="window._loadAnalyticsData()" style="padding:6px 12px;border-radius:var(--r-md);border:1px solid var(--border-medium);">
                            <option value="">All Subjects</option>
                            ${subjects.map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join('')}
                        </select>
                        <button class="btn btn-sm btn-outline" onclick="window._exportAnalyticsReport()">📥 Export</button>
                        <button class="btn btn-sm btn-outline" onclick="window._loadAnalyticsData()">🔄 Refresh</button>
                    </div>
                </div>
                <div class="dash-card-body">
                    <div id="analytics-content">
                        <div class="loading-container"><div class="spinner"></div><p>Loading analytics...</p></div>
                    </div>
                </div>
            </div>
        </div>
    `;

    window._loadAnalyticsData = loadAnalyticsData;
    window._exportAnalyticsReport = exportAnalyticsReport;
    window._loadAnalyticsData = loadAnalyticsData;

    await loadAnalyticsData();
}

// ──────────────────────────────────────────────────────────────────────
// LOAD ANALYTICS DATA
// ──────────────────────────────────────────────────────────────────────

async function loadAnalyticsData() {
    const content = document.getElementById('analytics-content');
    if (!content) return;

    const yearId = document.getElementById('analytics-year')?.value;
    const termId = document.getElementById('analytics-term')?.value;
    const classId = document.getElementById('analytics-class')?.value;
    const subjectId = document.getElementById('analytics-subject')?.value;

    // Update selected year
    if (yearId) {
        selectedYearId = yearId === 'all' ? 'all' : parseInt(yearId);
        if (selectedYearId !== 'all') {
            setYearFilter(selectedYearId);
        } else {
            state.filters.academic_year_id = null;
        }
    }

    content.innerHTML = '<div class="loading-container"><div class="spinner"></div><p>Calculating analytics...</p></div>';

    try {
        const data = await calculateAnalytics(selectedYearId, termId, classId, subjectId);
        content.innerHTML = renderAnalyticsContent(data, selectedYearId);
    } catch (error) {
        console.error('[Analytics] Error:', error);
        content.innerHTML = `<div class="alert alert-danger">Error loading analytics: ${esc(error.message)}</div>`;
    }
}

// ──────────────────────────────────────────────────────────────────────
// GET YEAR LABEL
// ──────────────────────────────────────────────────────────────────────

function getYearLabel(yearId) {
    if (yearId === 'all') return 'All Years';
    const year = (state.academicYears || []).find(y => y.id === yearId);
    return year?.name || 'Current Year';
}

// ──────────────────────────────────────────────────────────────────────
// CALCULATE ANALYTICS
// ──────────────────────────────────────────────────────────────────────

async function calculateAnalytics(yearId, termId, classId, subjectId) {
    const students = state.students || [];
    const assessments = state.assessments || [];
    const marks = state.marks || [];
    const subjects = state.subjects || [];
    const classes = state.classes || [];

    // ── FILTER BY YEAR ──────────────────────────────────────────────────
    let yearStudents = students;
    let yearAssessments = assessments;
    let yearMarks = marks;

    if (yearId && yearId !== 'all') {
        yearStudents = students.filter(s => s.academic_year_id == yearId && s.status === 'Active');
        yearAssessments = assessments.filter(a => a.academic_year_id == yearId);
        yearMarks = marks.filter(m => m.academic_year_id == yearId && !m.is_archived);
    }

    // Filter by term
    let filteredAssessments = yearAssessments;
    if (termId && termId !== 'all') {
        filteredAssessments = yearAssessments.filter(a => a.term_id == termId);
    }

    // Filter by class
    if (classId) {
        filteredAssessments = filteredAssessments.filter(a => a.class_id == classId);
    }

    // Filter by subject
    if (subjectId) {
        filteredAssessments = filteredAssessments.filter(a => a.subject_id == subjectId);
    }

    const assessmentIds = new Set(filteredAssessments.map(a => a.id));
    const filteredMarks = yearMarks.filter(m => assessmentIds.has(m.assessment_id));

    // ── School-wide metrics ──
    const totalStudents = yearStudents.filter(s => s.status === 'Active').length;
    const totalAssessments = filteredAssessments.length;
    const totalMarks = filteredMarks.length;

    // ── Average scores ──
    const studentAverages = {};
    for (const mark of filteredMarks) {
        const assessment = filteredAssessments.find(a => a.id === mark.assessment_id);
        if (assessment && mark.score !== null && mark.score !== undefined) {
            if (!studentAverages[mark.student_id]) {
                studentAverages[mark.student_id] = { total: 0, max: 0, count: 0 };
            }
            studentAverages[mark.student_id].total += mark.score;
            studentAverages[mark.student_id].max += assessment.max_marks;
            studentAverages[mark.student_id].count++;
        }
    }

    let overallAvg = 0;
    let overallCount = 0;
    let passCount = 0;
    const passMark = parseFloat(state.schoolSettings?.pass_mark || 50);
    const gradeDist = { 'A+': 0, 'A': 0, 'B': 0, 'C': 0, 'D': 0, 'F': 0 };

    for (const [sid, data] of Object.entries(studentAverages)) {
        if (data.max > 0) {
            const pct = (data.total / data.max) * 100;
            overallAvg += pct;
            overallCount++;
            if (pct >= passMark) passCount++;
            const grade = getGrade(pct);
            if (grade in gradeDist) gradeDist[grade]++;
        }
    }

    const avgScore = overallCount > 0 ? overallAvg / overallCount : 0;
    const passRate = overallCount > 0 ? (passCount / overallCount) * 100 : 0;

    // ── Class performance ──
    const classPerformance = classes.map(cls => {
        const clsStudents = yearStudents.filter(s => s.class_id === cls.id && s.status === 'Active');
        const clsAssessments = filteredAssessments.filter(a => a.class_id === cls.id);
        let totalPct = 0, count = 0;
        for (const st of clsStudents) {
            let score = 0, max = 0;
            for (const a of clsAssessments) {
                const mark = filteredMarks.find(m => m.assessment_id === a.id && m.student_id === st.id);
                if (mark) { score += mark.score; max += a.max_marks; }
            }
            if (max > 0) { totalPct += (score / max) * 100; count++; }
        }
        const avg = count > 0 ? totalPct / count : 0;
        const grade = avg > 0 ? getGrade(avg) : '—';
        return {
            name: cls.name,
            students: clsStudents.length,
            avg,
            grade,
            assessments: clsAssessments.length,
            marks: clsAssessments.reduce((sum, a) => sum + filteredMarks.filter(m => m.assessment_id === a.id).length, 0),
        };
    }).filter(c => c.students > 0).sort((a, b) => b.avg - a.avg);

    // ── Subject performance ──
    const subjectPerformance = subjects.map(sub => {
        const subAssessments = filteredAssessments.filter(a => a.subject_id === sub.id);
        let totalPct = 0, count = 0;
        for (const a of subAssessments) {
            const subMarks = filteredMarks.filter(m => m.assessment_id === a.id);
            for (const m of subMarks) {
                totalPct += (m.score / a.max_marks) * 100;
                count++;
            }
        }
        const avg = count > 0 ? totalPct / count : 0;
        const grade = avg > 0 ? getGrade(avg) : '—';
        const passSubCount = subAssessments.reduce((sum, a) => {
            const subMarks = filteredMarks.filter(m => m.assessment_id === a.id);
            return sum + subMarks.filter(m => (m.score / a.max_marks) * 100 >= passMark).length;
        }, 0);
        const totalSubMarks = subAssessments.reduce((sum, a) => sum + filteredMarks.filter(m => m.assessment_id === a.id).length, 0);
        return {
            name: sub.name,
            code: sub.code || '',
            avg,
            grade,
            passRate: totalSubMarks > 0 ? (passSubCount / totalSubMarks) * 100 : 0,
            assessments: subAssessments.length,
            marks: totalSubMarks,
        };
    }).filter(s => s.marks > 0).sort((a, b) => b.avg - a.avg);

    // ── Trend data (year over year) ──
    const allYears = (state.academicYears || []).sort((a, b) => a.id - b.id);
    let yearTrendData = [];

    if (yearId === 'all') {
        // Show all years
        for (const year of allYears) {
            const yearAssess = assessments.filter(a => a.academic_year_id === year.id);
            const yearMarksFiltered = marks.filter(m => m.academic_year_id === year.id && !m.is_archived);
            let totalPct = 0, count = 0;
            for (const m of yearMarksFiltered) {
                const a = yearAssess.find(ass => ass.id === m.assessment_id);
                if (a && m.score !== null) {
                    totalPct += (m.score / a.max_marks) * 100;
                    count++;
                }
            }
            const avg = count > 0 ? totalPct / count : 0;
            yearTrendData.push({
                year: year.name,
                avg: avg,
                grade: avg > 0 ? getGrade(avg) : '—',
                assessments: yearAssess.length,
                marks: yearMarksFiltered.length,
                isActive: year.is_active,
                yearId: year.id,
            });
        }
    } else {
        // Show terms within selected year
        const terms = (state.terms || [])
            .filter(t => t.academic_year_id === yearId)
            .sort((a, b) => a.term_number - b.term_number);

        if (terms.length > 0) {
            for (const term of terms) {
                const termAssess = assessments.filter(a => a.term_id === term.id && a.academic_year_id === yearId);
                const termMarks = marks.filter(m => termAssess.some(a => a.id === m.assessment_id) && m.academic_year_id === yearId);
                let totalPct = 0, count = 0;
                for (const m of termMarks) {
                    const a = termAssess.find(ass => ass.id === m.assessment_id);
                    if (a && m.score !== null) {
                        totalPct += (m.score / a.max_marks) * 100;
                        count++;
                    }
                }
                const avg = count > 0 ? totalPct / count : 0;
                yearTrendData.push({
                    year: term.name,
                    avg: avg,
                    grade: avg > 0 ? getGrade(avg) : '—',
                    assessments: termAssess.length,
                    marks: termMarks.length,
                    isActive: true,
                    yearId: yearId,
                });
            }
        }
    }

    // ── Teacher performance ──
    const teachers = (state.teachers || []).filter(t => t.role === 'teacher' && t.status !== 'inactive');
    const teacherPerformance = [];

    for (const teacher of teachers) {
        const assignments = await getAll('teacher_assignments', { teacher_id: teacher.id }).catch(() => []);
        const classIds = [...new Set(assignments.map(a => a.class_id))];
        let totalAvg = 0, count = 0;

        for (const cid of classIds) {
            const clsStudents = yearStudents.filter(s => s.class_id === cid && s.status === 'Active');
            const clsAssessments = filteredAssessments.filter(a => a.class_id === cid);
            let clsTotal = 0, clsCount = 0;
            for (const st of clsStudents) {
                let score = 0, max = 0;
                for (const a of clsAssessments) {
                    const mark = filteredMarks.find(m => m.assessment_id === a.id && m.student_id === st.id);
                    if (mark) { score += mark.score; max += a.max_marks; }
                }
                if (max > 0) { clsTotal += (score / max) * 100; clsCount++; }
            }
            if (clsCount > 0) {
                totalAvg += clsTotal / clsCount;
                count++;
            }
        }

        if (count > 0) {
            const avg = totalAvg / count;
            teacherPerformance.push({
                name: teacher.name,
                avg: avg,
                grade: avg > 0 ? getGrade(avg) : '—',
                classes: classIds.length,
                assignments: assignments.length,
                students: classIds.reduce((sum, cid) => sum + yearStudents.filter(s => s.class_id === cid && s.status === 'Active').length, 0),
            });
        }
    }
    teacherPerformance.sort((a, b) => b.avg - a.avg);

    // ── Risk indicators ──
    const atRiskStudents = Object.entries(studentAverages)
        .filter(([sid, data]) => {
            if (data.max === 0) return false;
            const pct = (data.total / data.max) * 100;
            return pct < passMark;
        })
        .map(([sid, data]) => {
            const student = yearStudents.find(s => s.id == sid);
            const pct = data.max > 0 ? (data.total / data.max) * 100 : 0;
            return {
                id: sid,
                name: student ? `${student.first_name} ${student.last_name}` : 'Unknown',
                class: student ? getClassById(student.class_id)?.name || '—' : '—',
                pct: pct,
                grade: getGrade(pct),
                gap: passMark - pct,
            };
        })
        .sort((a, b) => a.pct - b.pct);

    // ── Top students ──
    const topStudents = Object.entries(studentAverages)
        .filter(([sid, data]) => data.max > 0)
        .map(([sid, data]) => {
            const student = yearStudents.find(s => s.id == sid);
            const pct = data.max > 0 ? (data.total / data.max) * 100 : 0;
            return {
                id: sid,
                name: student ? `${student.first_name} ${student.last_name}` : 'Unknown',
                class: student ? getClassById(student.class_id)?.name || '—' : '—',
                pct: pct,
                grade: getGrade(pct),
            };
        })
        .sort((a, b) => b.pct - a.pct)
        .slice(0, 10);

    // ── Year-over-year comparison ──
    const yearComparison = [];
    if (yearId !== 'all') {
        const currentYearData = yearTrendData.length > 0 ? yearTrendData : [];
        const previousYearId = parseInt(yearId) - 1;
        if (previousYearId > 0) {
            const prevAssess = assessments.filter(a => a.academic_year_id === previousYearId);
            const prevMarks = marks.filter(m => m.academic_year_id === previousYearId && !m.is_archived);
            let prevTotalPct = 0, prevCount = 0;
            for (const m of prevMarks) {
                const a = prevAssess.find(ass => ass.id === m.assessment_id);
                if (a && m.score !== null) {
                    prevTotalPct += (m.score / a.max_marks) * 100;
                    prevCount++;
                }
            }
            const prevAvg = prevCount > 0 ? prevTotalPct / prevCount : 0;
            yearComparison.push({
                year: 'Previous Year',
                avg: prevAvg,
                grade: prevAvg > 0 ? getGrade(prevAvg) : '—',
                assessments: prevAssess.length,
                marks: prevMarks.length,
            });
        }
        // Add current year
        if (currentYearData.length > 0) {
            const currentAvg = currentYearData.reduce((sum, d) => sum + d.avg, 0) / currentYearData.length;
            yearComparison.push({
                year: 'Current Year',
                avg: currentAvg,
                grade: currentAvg > 0 ? getGrade(currentAvg) : '—',
                assessments: currentYearData.reduce((sum, d) => sum + d.assessments, 0),
                marks: currentYearData.reduce((sum, d) => sum + d.marks, 0),
            });
        }
    }

    return {
        summary: {
            totalStudents,
            totalAssessments,
            totalMarks,
            avgScore,
            passRate,
            gradeDist,
            yearLabel: getYearLabel(yearId),
        },
        classPerformance,
        subjectPerformance,
        trendData: yearTrendData,
        yearComparison,
        teacherPerformance,
        atRiskStudents,
        topStudents,
        passMark,
        yearId,
    };
}

// ──────────────────────────────────────────────────────────────────────
// RENDER ANALYTICS CONTENT
// ──────────────────────────────────────────────────────────────────────

function renderAnalyticsContent(data, yearId) {
    const {
        summary, classPerformance, subjectPerformance, trendData,
        yearComparison, teacherPerformance, atRiskStudents, topStudents, passMark
    } = data;

    const yearLabel = getYearLabel(yearId);
    const isAllYears = yearId === 'all';

    // Year-over-year comparison HTML
    let comparisonHtml = '';
    if (yearComparison.length > 1) {
        comparisonHtml = `
            <div class="dash-card" style="margin-bottom:20px;background:var(--bg-secondary);border-radius:var(--r-lg);border:1px solid var(--border-light);overflow:hidden;">
                <div class="dash-card-header" style="padding:12px 16px;border-bottom:1px solid var(--border-light);">
                    <span style="font-weight:600;font-size:0.9rem;">📊 Year-over-Year Comparison</span>
                    <span style="font-size:0.7rem;color:var(--text-muted);">${yearComparison.map(y => y.year).join(' vs ')}</span>
                </div>
                <div class="dash-card-body" style="padding:12px 16px;">
                    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
                        ${yearComparison.map((y, i) => `
                            <div style="padding:12px;background:${i === yearComparison.length - 1 ? 'var(--role-light)' : 'var(--bg-tertiary)'};border-radius:8px;text-align:center;">
                                <div style="font-size:0.7rem;color:var(--text-muted);">${esc(y.year)}</div>
                                <div style="font-size:1.3rem;font-weight:700;color:${y.avg >= 70 ? 'var(--success)' : y.avg >= 50 ? 'var(--warning)' : 'var(--danger)'};">${y.avg.toFixed(1)}%</div>
                                <div><span class="badge ${getGradeClass(y.avg)}">${y.grade}</span></div>
                                <div style="font-size:0.65rem;color:var(--text-muted);margin-top:4px;">${y.assessments} assessments · ${y.marks} marks</div>
                            </div>
                        `).join('')}
                    </div>
                    ${yearComparison.length === 2 ? `
                        <div style="text-align:center;margin-top:8px;font-size:0.8rem;">
                            ${trendIndicator(yearComparison[1].avg - yearComparison[0].avg)}
                            <span style="color:var(--text-muted);margin-left:8px;">from ${esc(yearComparison[0].year)} to ${esc(yearComparison[1].year)}</span>
                        </div>
                    ` : ''}
                </div>
            </div>
        `;
    }

    return `
        <!-- YEAR LABEL -->
        <div style="margin-bottom:16px;padding:8px 16px;background:var(--bg-tertiary);border-radius:var(--r-md);display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">
            <span style="font-weight:600;font-size:0.9rem;">📅 ${esc(yearLabel)}</span>
            <span style="font-size:0.75rem;color:var(--text-muted);">
                ${isAllYears ? 'All years combined' : `${summary.totalStudents} students · ${summary.totalAssessments} assessments`}
            </span>
        </div>

        <!-- SUMMARY STATS -->
        <div class="stats-grid" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:12px;margin-bottom:20px;">
            <div class="stat-card" style="padding:14px 16px;background:var(--bg-secondary);border-radius:var(--r-lg);border:1px solid var(--border-light);">
                <div style="font-size:0.65rem;text-transform:uppercase;color:var(--text-muted);letter-spacing:0.5px;">Students</div>
                <div style="font-size:1.5rem;font-weight:700;">${summary.totalStudents}</div>
                <div style="font-size:0.7rem;color:var(--text-muted);">${isAllYears ? 'all years' : 'active'}</div>
            </div>
            <div class="stat-card" style="padding:14px 16px;background:var(--bg-secondary);border-radius:var(--r-lg);border:1px solid var(--border-light);">
                <div style="font-size:0.65rem;text-transform:uppercase;color:var(--text-muted);letter-spacing:0.5px;">Assessments</div>
                <div style="font-size:1.5rem;font-weight:700;">${summary.totalAssessments}</div>
                <div style="font-size:0.7rem;color:var(--text-muted);">this period</div>
            </div>
            <div class="stat-card" style="padding:14px 16px;background:var(--bg-secondary);border-radius:var(--r-lg);border:1px solid var(--border-light);">
                <div style="font-size:0.65rem;text-transform:uppercase;color:var(--text-muted);letter-spacing:0.5px;">Average</div>
                <div style="font-size:1.5rem;font-weight:700;color:${summary.avgScore >= 70 ? 'var(--success)' : summary.avgScore >= 50 ? 'var(--warning)' : 'var(--danger)'};">${summary.avgScore.toFixed(1)}%</div>
                <div style="font-size:0.7rem;color:var(--text-muted);">school-wide</div>
            </div>
            <div class="stat-card" style="padding:14px 16px;background:var(--bg-secondary);border-radius:var(--r-lg);border:1px solid var(--border-light);">
                <div style="font-size:0.65rem;text-transform:uppercase;color:var(--text-muted);letter-spacing:0.5px;">Pass Rate</div>
                <div style="font-size:1.5rem;font-weight:700;color:${summary.passRate >= 70 ? 'var(--success)' : summary.passRate >= 50 ? 'var(--warning)' : 'var(--danger)'};">${summary.passRate.toFixed(1)}%</div>
                <div style="font-size:0.7rem;color:var(--text-muted);">≥${passMark}%</div>
            </div>
            <div class="stat-card" style="padding:14px 16px;background:var(--bg-secondary);border-radius:var(--r-lg);border:1px solid var(--border-light);">
                <div style="font-size:0.65rem;text-transform:uppercase;color:var(--text-muted);letter-spacing:0.5px;">At-Risk</div>
                <div style="font-size:1.5rem;font-weight:700;color:var(--danger);">${atRiskStudents.length}</div>
                <div style="font-size:0.7rem;color:var(--text-muted);">below ${passMark}%</div>
            </div>
            <div class="stat-card" style="padding:14px 16px;background:var(--bg-secondary);border-radius:var(--r-lg);border:1px solid var(--border-light);">
                <div style="font-size:0.65rem;text-transform:uppercase;color:var(--text-muted);letter-spacing:0.5px;">Marks Entered</div>
                <div style="font-size:1.5rem;font-weight:700;">${summary.totalMarks.toLocaleString()}</div>
                <div style="font-size:0.7rem;color:var(--text-muted);">total records</div>
            </div>
        </div>

        <!-- GRADE DISTRIBUTION -->
        <div class="dash-card" style="margin-bottom:20px;background:var(--bg-secondary);border-radius:var(--r-lg);border:1px solid var(--border-light);overflow:hidden;">
            <div class="dash-card-header" style="padding:12px 16px;border-bottom:1px solid var(--border-light);">
                <span style="font-weight:600;font-size:0.9rem;">📊 Grade Distribution — ${esc(yearLabel)}</span>
            </div>
            <div class="dash-card-body" style="padding:12px 16px;">
                ${Object.values(summary.gradeDist).reduce((a, b) => a + b, 0) > 0
            ? gradeDistributionChart(summary.gradeDist, 30)
            : '<div style="text-align:center;padding:20px;color:var(--text-muted);">No grade data available</div>'
        }
            </div>
        </div>

        <!-- YEAR-OVER-YEAR COMPARISON -->
        ${comparisonHtml}

        <!-- TWO COLUMN: CLASS PERFORMANCE + SUBJECT PERFORMANCE -->
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px;">
            <div class="dash-card" style="background:var(--bg-secondary);border-radius:var(--r-lg);border:1px solid var(--border-light);overflow:hidden;">
                <div class="dash-card-header" style="padding:12px 16px;border-bottom:1px solid var(--border-light);display:flex;justify-content:space-between;align-items:center;">
                    <span style="font-weight:600;font-size:0.9rem;">🏫 Class Performance</span>
                    <span style="font-size:0.7rem;color:var(--text-muted);">${classPerformance.length} classes</span>
                </div>
                <div class="dash-card-body" style="padding:12px 16px;max-height:300px;overflow-y:auto;">
                    ${classPerformance.length ? classPerformance.map(c => `
                        <div style="display:flex;align-items:center;gap:10px;padding:4px 0;border-bottom:1px solid var(--border-light);">
                            <span style="min-width:80px;font-weight:500;font-size:0.8rem;">${esc(c.name)}</span>
                            <div style="flex:1;font-size:0.75rem;">
                                <span style="display:inline-block;width:${Math.min(c.avg, 100)}%;height:8px;background:${c.avg >= 70 ? '#10b981' : c.avg >= 50 ? '#f59e0b' : '#ef4444'};border-radius:4px;"></span>
                            </div>
                            <span style="font-size:0.75rem;font-weight:600;min-width:50px;text-align:right;">${c.avg.toFixed(1)}%</span>
                            <span class="badge ${getGradeClass(c.avg)}" style="font-size:0.65rem;">${c.grade}</span>
                        </div>
                    `).join('') : '<div style="text-align:center;padding:20px;color:var(--text-muted);">No data available</div>'}
                </div>
            </div>

            <div class="dash-card" style="background:var(--bg-secondary);border-radius:var(--r-lg);border:1px solid var(--border-light);overflow:hidden;">
                <div class="dash-card-header" style="padding:12px 16px;border-bottom:1px solid var(--border-light);display:flex;justify-content:space-between;align-items:center;">
                    <span style="font-weight:600;font-size:0.9rem;">📖 Subject Performance</span>
                    <span style="font-size:0.7rem;color:var(--text-muted);">${subjectPerformance.length} subjects</span>
                </div>
                <div class="dash-card-body" style="padding:12px 16px;max-height:300px;overflow-y:auto;">
                    ${subjectPerformance.length ? subjectPerformance.slice(0, 15).map(s => `
                        <div style="display:flex;align-items:center;gap:10px;padding:4px 0;border-bottom:1px solid var(--border-light);">
                            <span style="min-width:70px;font-weight:500;font-size:0.8rem;">${esc(s.code || s.name)}</span>
                            <div style="flex:1;font-size:0.75rem;">
                                <span style="display:inline-block;width:${Math.min(s.avg, 100)}%;height:8px;background:${s.avg >= 70 ? '#10b981' : s.avg >= 50 ? '#f59e0b' : '#ef4444'};border-radius:4px;"></span>
                            </div>
                            <span style="font-size:0.75rem;font-weight:600;min-width:50px;text-align:right;">${s.avg.toFixed(1)}%</span>
                            <span class="badge ${getGradeClass(s.avg)}" style="font-size:0.65rem;">${s.grade}</span>
                        </div>
                    `).join('') : '<div style="text-align:center;padding:20px;color:var(--text-muted);">No data available</div>'}
                </div>
            </div>
        </div>

        <!-- THREE COLUMN: TREND DATA + TEACHER PERFORMANCE + TOP STUDENTS -->
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px;margin-bottom:20px;">
            <!-- Trend Data -->
            <div class="dash-card" style="background:var(--bg-secondary);border-radius:var(--r-lg);border:1px solid var(--border-light);overflow:hidden;">
                <div class="dash-card-header" style="padding:12px 16px;border-bottom:1px solid var(--border-light);">
                    <span style="font-weight:600;font-size:0.9rem;">📈 ${isAllYears ? 'Year-over-Year Trends' : 'Term Trends'}</span>
                </div>
                <div class="dash-card-body" style="padding:12px 16px;font-size:0.8rem;">
                    ${trendData.length ? trendData.map((t, i) => {
            const change = i > 0 ? t.avg - trendData[i - 1].avg : 0;
            const changeDisplay = i > 0 ? (change > 0 ? `📈 +${change.toFixed(1)}%` : change < 0 ? `📉 ${change.toFixed(1)}%` : '➡️ 0%') : '';
            const isActive = t.isActive !== false;
            return `
                            <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid var(--border-light);">
                                <span style="font-weight:500;">${esc(t.year)} ${isActive ? '🟢' : '🔒'}</span>
                                <div>
                                    <span style="font-weight:600;color:${t.avg >= 70 ? 'var(--success)' : t.avg >= 50 ? 'var(--warning)' : 'var(--danger)'};">${t.avg.toFixed(1)}%</span>
                                    <span class="badge ${getGradeClass(t.avg)}" style="font-size:0.6rem;margin-left:4px;">${t.grade}</span>
                                    ${changeDisplay ? `<span style="font-size:0.65rem;color:${change > 0 ? 'var(--success)' : change < 0 ? 'var(--danger)' : 'var(--text-muted)'};margin-left:4px;">${changeDisplay}</span>` : ''}
                                </div>
                            </div>
                        `;
        }).join('') : '<div style="text-align:center;padding:20px;color:var(--text-muted);">No trend data</div>'}
                </div>
            </div>

            <!-- Teacher Performance -->
            <div class="dash-card" style="background:var(--bg-secondary);border-radius:var(--r-lg);border:1px solid var(--border-light);overflow:hidden;">
                <div class="dash-card-header" style="padding:12px 16px;border-bottom:1px solid var(--border-light);">
                    <span style="font-weight:600;font-size:0.9rem;">👩‍🏫 Teacher Performance</span>
                </div>
                <div class="dash-card-body" style="padding:12px 16px;max-height:250px;overflow-y:auto;font-size:0.8rem;">
                    ${teacherPerformance.length ? teacherPerformance.slice(0, 8).map((t, i) => `
                        <div style="display:flex;justify-content:space-between;align-items:center;padding:4px 0;border-bottom:1px solid var(--border-light);">
                            <div>
                                <span style="font-weight:500;">${i + 1}${i === 0 ? ' 🥇' : i === 1 ? ' 🥈' : i === 2 ? ' 🥉' : ''}</span>
                                <span style="margin-left:6px;">${esc(t.name)}</span>
                            </div>
                            <div>
                                <span style="font-weight:600;color:${t.avg >= 70 ? 'var(--success)' : t.avg >= 50 ? 'var(--warning)' : 'var(--danger)'};">${t.avg.toFixed(1)}%</span>
                                <span class="badge ${getGradeClass(t.avg)}" style="font-size:0.6rem;margin-left:4px;">${t.grade}</span>
                            </div>
                        </div>
                    `).join('') : '<div style="text-align:center;padding:20px;color:var(--text-muted);">No teacher data</div>'}
                </div>
            </div>

            <!-- Top Students -->
            <div class="dash-card" style="background:var(--bg-secondary);border-radius:var(--r-lg);border:1px solid var(--border-light);overflow:hidden;">
                <div class="dash-card-header" style="padding:12px 16px;border-bottom:1px solid var(--border-light);">
                    <span style="font-weight:600;font-size:0.9rem;">🏆 Top Students</span>
                </div>
                <div class="dash-card-body" style="padding:12px 16px;max-height:250px;overflow-y:auto;font-size:0.8rem;">
                    ${topStudents.length ? topStudents.map((s, i) => `
                        <div style="display:flex;justify-content:space-between;align-items:center;padding:4px 0;border-bottom:1px solid var(--border-light);">
                            <div>
                                <span style="font-weight:500;">${i + 1}${i === 0 ? ' 🥇' : i === 1 ? ' 🥈' : i === 2 ? ' 🥉' : ''}</span>
                                <span style="margin-left:6px;">${esc(s.name)}</span>
                                <span style="font-size:0.65rem;color:var(--text-muted);margin-left:4px;">${esc(s.class)}</span>
                            </div>
                            <div>
                                <span style="font-weight:600;color:${s.pct >= 80 ? 'var(--success)' : 'var(--warning)'};">${s.pct.toFixed(1)}%</span>
                                <span class="badge ${getGradeClass(s.pct)}" style="font-size:0.6rem;margin-left:4px;">${s.grade}</span>
                            </div>
                        </div>
                    `).join('') : '<div style="text-align:center;padding:20px;color:var(--text-muted);">No top students</div>'}
                </div>
            </div>
        </div>

        <!-- AT-RISK STUDENTS -->
        <div class="dash-card" style="background:var(--bg-secondary);border-radius:var(--r-lg);border:1px solid var(--border-light);overflow:hidden;">
            <div class="dash-card-header" style="padding:12px 16px;border-bottom:1px solid var(--border-light);display:flex;justify-content:space-between;align-items:center;">
                <span style="font-weight:600;font-size:0.9rem;">⚠️ At-Risk Students (Below ${passMark}%)</span>
                <span style="font-size:0.7rem;color:var(--text-muted);">${atRiskStudents.length} students</span>
            </div>
            <div class="dash-card-body" style="padding:0;">
                ${atRiskStudents.length ? `
                    <div style="overflow-x:auto;">
                        <table style="width:100%;border-collapse:collapse;font-size:0.8rem;">
                            <thead>
                                <tr style="background:var(--bg-tertiary);">
                                    <th style="padding:8px 12px;text-align:left;font-weight:600;font-size:0.65rem;text-transform:uppercase;color:var(--text-muted);">Student</th>
                                    <th style="padding:8px 12px;text-align:left;font-weight:600;font-size:0.65rem;text-transform:uppercase;color:var(--text-muted);">Class</th>
                                    <th style="padding:8px 12px;text-align:left;font-weight:600;font-size:0.65rem;text-transform:uppercase;color:var(--text-muted);">%</th>
                                    <th style="padding:8px 12px;text-align:left;font-weight:600;font-size:0.65rem;text-transform:uppercase;color:var(--text-muted);">Grade</th>
                                    <th style="padding:8px 12px;text-align:left;font-weight:600;font-size:0.65rem;text-transform:uppercase;color:var(--text-muted);">Gap</th>
                                    <th style="padding:8px 12px;text-align:left;font-weight:600;font-size:0.65rem;text-transform:uppercase;color:var(--text-muted);">Action</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${atRiskStudents.slice(0, 15).map(s => `
                                    <tr style="border-bottom:1px solid var(--border-light);">
                                        <td style="padding:8px 12px;font-weight:500;">${esc(s.name)}</td>
                                        <td style="padding:8px 12px;">${esc(s.class)}</td>
                                        <td style="padding:8px 12px;font-weight:600;color:var(--danger);">${s.pct.toFixed(1)}%</td>
                                        <td style="padding:8px 12px;"><span class="badge ${getGradeClass(s.pct)}">${s.grade}</span></td>
                                        <td style="padding:8px 12px;color:var(--danger);">${s.gap.toFixed(1)}%</td>
                                        <td style="padding:8px 12px;">
                                            <button class="btn btn-sm btn-outline" onclick="window.navigateToWithData('student-details',{student_id:${s.id}})" style="padding:2px 8px;font-size:0.65rem;">👁️ View</button>
                                        </td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                    ${atRiskStudents.length > 15 ? `<div style="padding:8px 12px;text-align:center;font-size:0.7rem;color:var(--text-muted);">+ ${atRiskStudents.length - 15} more</div>` : ''}
                ` : '<div style="text-align:center;padding:20px;color:var(--text-muted);">🎉 No at-risk students!</div>'}
            </div>
        </div>
    `;
}

// ──────────────────────────────────────────────────────────────────────
// EXPORT ANALYTICS REPORT
// ──────────────────────────────────────────────────────────────────────

function exportAnalyticsReport() {
    const content = document.getElementById('analytics-content');
    if (!content) {
        showToast('No analytics data to export', 'warning');
        return;
    }

    // Extract table data from the page
    const tables = content.querySelectorAll('table');
    if (!tables.length) {
        showToast('No tabular data to export', 'warning');
        return;
    }

    const wb = XLSX.utils.book_new();
    let sheetIndex = 1;

    for (const table of tables) {
        const ws = XLSX.utils.table_to_sheet(table);
        XLSX.utils.book_append_sheet(wb, ws, `Sheet${sheetIndex}`);
        sheetIndex++;
    }

    const yearLabel = getYearLabel(selectedYearId);
    XLSX.writeFile(wb, `Analytics_Report_${yearLabel.replace(/\s/g, '_')}_${new Date().toISOString().split('T')[0]}.xlsx`);
    showToast('✅ Analytics report exported', 'success');
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
    if (!state.classes.length) {
        const { loadInitialData } = await import('../../core/boot.js');
        await loadInitialData(false);
    }
}

// Export functions to window
window._loadAnalyticsData = loadAnalyticsData;
window._exportAnalyticsReport = exportAnalyticsReport;