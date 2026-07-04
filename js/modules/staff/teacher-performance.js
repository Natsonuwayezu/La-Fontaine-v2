/**
 * ECOLE LA FONTAINE — Teacher Performance
 * Performance metrics, ranking, and analysis for teachers
 * Last updated: 2026-07-03
 * 
 * CHANGES:
 * - Added academic year filtering
 * - Performance metrics are now year-specific
 * - Added year selector in the UI
 * - Teachers can be filtered by academic year
 * - Historical performance data can be viewed
 */

import {
    state,
    getCurrentUser,
    getClassById,
    getSubjectById,
    getCurrentAcademicYear,
    getActiveAcademicYearId,
    getYearData,
    getCurrentYearData
} from '../../core/state.js';
import { esc, fmtDate, fmtPct } from '../../core/utils.js';
import { getGrade, getGradeClass } from '../../core/formulas.js';
import { getAll, get, getYearData as apiGetYearData } from '../../core/api.js';

// ──────────────────────────────────────────────────────────────────────
// STATE
// ──────────────────────────────────────────────────────────────────────

let selectedYearId = null;
let performanceData = [];

// ──────────────────────────────────────────────────────────────────────
// MAIN RENDER FUNCTION
// ──────────────────────────────────────────────────────────────────────

export async function renderTeacherPerformance(container) {
    if (!container) return;

    const user = getCurrentUser();
    if (user?.role !== 'admin') {
        container.innerHTML = '<div class="alert alert-danger">Access denied. Admin privileges required.</div>';
        return;
    }

    await ensureStateLoaded();

    const teachers = (state.teachers || []).filter(t => t.role === 'teacher' && t.status !== 'inactive');
    const currentYear = getCurrentAcademicYear();
    const years = (state.academicYears || []).sort((a, b) => b.id - a.id);

    // Default to current year
    if (!selectedYearId) {
        selectedYearId = currentYear?.id || null;
    }

    // Calculate performance metrics for selected year
    performanceData = await calculateTeacherPerformance(teachers, selectedYearId);

    // Calculate summary stats
    const highPerformers = performanceData.filter(t => t.avgPerformance >= 70).length;
    const lowPerformers = performanceData.filter(t => t.avgPerformance < 50).length;
    const totalMarks = performanceData.reduce((sum, t) => sum + t.marksEntered, 0);
    const totalTeachers = performanceData.length;

    container.innerHTML = `
        <div class="dash-card">
            <div class="dash-card-header" style="flex-wrap:wrap;gap:8px;">
                <span class="dash-card-title">⭐ Teacher Performance</span>
                <div class="btn-group" style="flex-wrap:wrap;gap:6px;">
                    <select id="perf-year-filter" onchange="window._loadTeacherPerformance()" style="padding:6px 12px;border-radius:6px;border:1px solid var(--border-medium);font-size:0.8rem;">
                        ${years.map(y => `
                            <option value="${y.id}" ${y.id === selectedYearId ? 'selected' : ''}>
                                ${esc(y.name)} ${y.id === currentYear?.id ? '🟢' : ''}
                            </option>
                        `).join('')}
                    </select>
                    <button class="btn btn-sm btn-outline" onclick="window._exportTeacherPerformance()">📥 Export</button>
                    <button class="btn btn-sm btn-outline" onclick="window._refreshTeacherPerformance()">🔄 Refresh</button>
                </div>
            </div>
            <div class="dash-card-body" style="padding:0;">
                <div class="stats-grid" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:12px;padding:12px 16px;border-bottom:1px solid var(--border-light);background:var(--bg-tertiary);">
                    <div style="text-align:center;">
                        <div style="font-size:1.2rem;font-weight:700;">${totalTeachers}</div>
                        <div style="font-size:0.65rem;color:var(--text-muted);text-transform:uppercase;">Teachers</div>
                    </div>
                    <div style="text-align:center;">
                        <div style="font-size:1.2rem;font-weight:700;color:var(--success);">${highPerformers}</div>
                        <div style="font-size:0.65rem;color:var(--text-muted);text-transform:uppercase;">High Performers (≥70%)</div>
                    </div>
                    <div style="text-align:center;">
                        <div style="font-size:1.2rem;font-weight:700;color:var(--danger);">${lowPerformers}</div>
                        <div style="font-size:0.65rem;color:var(--text-muted);text-transform:uppercase;">Needs Improvement (&lt;50%)</div>
                    </div>
                    <div style="text-align:center;">
                        <div style="font-size:1.2rem;font-weight:700;">${totalMarks.toLocaleString()}</div>
                        <div style="font-size:0.65rem;color:var(--text-muted);text-transform:uppercase;">Total Marks</div>
                    </div>
                    <div style="text-align:center;">
                        <div style="font-size:0.8rem;font-weight:600;color:var(--text-secondary);">
                            📅 ${years.find(y => y.id === selectedYearId)?.name || 'All Years'}
                        </div>
                    </div>
                </div>

                <div class="filters-bar" style="padding:8px 16px;border-bottom:1px solid var(--border-light);display:flex;gap:12px;flex-wrap:wrap;align-items:center;">
                    <input type="text" id="perf-search" placeholder="🔍 Search teacher..." oninput="window._filterTeacherPerformance()" style="padding:6px 12px;border-radius:6px;border:1px solid var(--border-medium);flex:1;min-width:150px;">
                    <span class="result-count" id="perf-count" style="font-size:0.8rem;color:var(--text-muted);">${totalTeachers} teachers</span>
                </div>

                <div class="table-wrapper">
                    <table class="data-table" id="teacher-perf-table">
                        <thead>
                            <tr>
                                <th style="width:50px;">Rank</th>
                                <th>Teacher</th>
                                <th>Department</th>
                                <th>Classes</th>
                                <th>Subjects</th>
                                <th>Avg %</th>
                                <th>Grade</th>
                                <th>Marks</th>
                                <th>Trend</th>
                                <th>Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${performanceData.length ? performanceData.map((tp, idx) => {
        const trendIcon = tp.trend > 0 ? '📈' : tp.trend < 0 ? '📉' : '📊';
        const trendColor = tp.trend > 0 ? 'var(--success)' : tp.trend < 0 ? 'var(--danger)' : 'var(--text-muted)';
        return `
                                    <tr>
                                        <td style="text-align:center;font-weight:700;">${idx + 1}${idx === 0 ? ' 🥇' : idx === 1 ? ' 🥈' : idx === 2 ? ' 🥉' : ''}</td>
                                        <td><strong>${esc(tp.teacher.first_name)} ${esc(tp.teacher.last_name)}</strong></td>
                                        <td>${esc(tp.teacher.department || 'General')}</td>
                                        <td style="text-align:center;">${tp.classCount}</td>
                                        <td style="text-align:center;">${tp.subjectCount}</td>
                                        <td style="text-align:center;"><span class="badge ${tp.performanceClass}">${tp.avgPerformance > 0 ? tp.avgPerformance.toFixed(1) + '%' : '—'}</span></td>
                                        <td style="text-align:center;">${tp.performanceGrade}</td>
                                        <td style="text-align:center;">${tp.marksEntered}</td>
                                        <td style="text-align:center;color:${trendColor};">${trendIcon}</td>
                                        <td>
                                            <button class="btn btn-sm btn-outline" onclick="window._viewTeacherPerformanceDetails(${tp.teacher.id})" style="padding:2px 8px;font-size:0.7rem;">👁️</button>
                                        </td>
                                    </tr>
                                `;
    }).join('') : '<tr><td colspan="10" style="text-align:center;padding:20px;color:var(--text-muted);">No teacher performance data available for this academic year</td></tr>'}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    `;

    window._exportTeacherPerformance = exportTeacherPerformance;
    window._refreshTeacherPerformance = refreshTeacherPerformance;
    window._viewTeacherPerformanceDetails = viewTeacherPerformanceDetails;
    window._filterTeacherPerformance = filterTeacherPerformance;
    window._loadTeacherPerformance = loadTeacherPerformance;
    window._teacherPerformanceData = performanceData;
}

// ──────────────────────────────────────────────────────────────────────
// CALCULATE TEACHER PERFORMANCE
// ──────────────────────────────────────────────────────────────────────

async function calculateTeacherPerformance(teachers, yearId) {
    const performanceData = [];

    for (const teacher of teachers) {
        let assignments = [];
        try {
            assignments = await getAll('teacher_assignments', { teacher_id: teacher.id });
        } catch (e) {
            assignments = [];
        }

        const classIds = [...new Set(assignments.map(a => a.class_id))];
        const subjectIds = [...new Set(assignments.map(a => a.subject_id))];

        let totalStudentPerformance = 0;
        let totalClasses = 0;
        let totalMarksEntered = 0;
        let totalAssessments = 0;
        let previousPerformance = 0;

        // Get current term for the selected year
        const terms = (state.terms || [])
            .filter(t => t.academic_year_id === yearId)
            .sort((a, b) => a.term_number - b.term_number);
        const currentTermId = terms[terms.length - 1]?.id;

        for (const classId of classIds) {
            // Get students for this class in the selected year
            const students = (state.students || [])
                .filter(s => s.class_id === classId && s.status === 'Active' && s.academic_year_id === yearId);

            // Get assessments for this class in the selected year
            const assessments = (state.assessments || []).filter(a =>
                a.class_id === classId &&
                a.academic_year_id === yearId &&
                (currentTermId ? a.term_id === currentTermId : true) &&
                subjectIds.includes(a.subject_id)
            );

            totalAssessments += assessments.length;

            let classTotalPct = 0;
            let studentCount = 0;

            for (const student of students) {
                let studentScore = 0;
                let studentMax = 0;

                for (const assessment of assessments) {
                    const mark = (state.marks || []).find(m =>
                        m.assessment_id === assessment.id &&
                        m.student_id === student.id &&
                        m.academic_year_id === yearId
                    );
                    if (mark) {
                        studentScore += mark.score;
                        studentMax += assessment.max_marks;
                    }
                }

                if (studentMax > 0) {
                    classTotalPct += (studentScore / studentMax) * 100;
                    studentCount++;
                }
            }

            if (studentCount > 0) {
                totalStudentPerformance += classTotalPct / studentCount;
                totalClasses++;
            }

            // Count marks entered by this teacher for this year
            const teacherMarks = (state.marks || []).filter(m => {
                const assessment = (state.assessments || []).find(a => a.id === m.assessment_id);
                return assessment &&
                    subjectIds.includes(assessment.subject_id) &&
                    classIds.includes(assessment.class_id) &&
                    m.academic_year_id === yearId;
            });
            totalMarksEntered += teacherMarks.length;
        }

        const avgPerformance = totalClasses > 0 ? totalStudentPerformance / totalClasses : 0;
        const performanceGrade = avgPerformance > 0 ? getGrade(avgPerformance) : '—';
        const performanceClass = avgPerformance > 0 ? getGradeClass(avgPerformance) : '';

        // Calculate trend (compare to previous year if available)
        let trend = 0;
        if (yearId) {
            const previousYearId = parseInt(yearId) - 1;
            if (previousYearId > 0) {
                const prevPerformance = await calculateTeacherPerformanceForYear(teacher.id, previousYearId);
                if (prevPerformance > 0) {
                    trend = avgPerformance - prevPerformance;
                }
            }
        }

        performanceData.push({
            teacher: teacher,
            classCount: classIds.length,
            subjectCount: subjectIds.length,
            avgPerformance: avgPerformance,
            performanceGrade: performanceGrade,
            performanceClass: performanceClass,
            marksEntered: totalMarksEntered,
            assessmentCount: totalAssessments,
            assignments: assignments.length,
            trend: trend,
        });
    }

    // Sort by performance (highest first)
    performanceData.sort((a, b) => b.avgPerformance - a.avgPerformance);

    return performanceData;
}

// ──────────────────────────────────────────────────────────────────────
// CALCULATE TEACHER PERFORMANCE FOR A SPECIFIC YEAR
// ──────────────────────────────────────────────────────────────────────

async function calculateTeacherPerformanceForYear(teacherId, yearId) {
    if (!yearId) return 0;

    try {
        let assignments = [];
        try {
            assignments = await getAll('teacher_assignments', { teacher_id: teacherId });
        } catch (e) {
            assignments = [];
        }

        const classIds = [...new Set(assignments.map(a => a.class_id))];
        const subjectIds = [...new Set(assignments.map(a => a.subject_id))];

        let totalStudentPerformance = 0;
        let totalClasses = 0;

        for (const classId of classIds) {
            const students = (state.students || [])
                .filter(s => s.class_id === classId && s.status === 'Active' && s.academic_year_id === yearId);

            const assessments = (state.assessments || []).filter(a =>
                a.class_id === classId &&
                a.academic_year_id === yearId &&
                subjectIds.includes(a.subject_id)
            );

            let classTotalPct = 0;
            let studentCount = 0;

            for (const student of students) {
                let studentScore = 0;
                let studentMax = 0;

                for (const assessment of assessments) {
                    const mark = (state.marks || []).find(m =>
                        m.assessment_id === assessment.id &&
                        m.student_id === student.id &&
                        m.academic_year_id === yearId
                    );
                    if (mark) {
                        studentScore += mark.score;
                        studentMax += assessment.max_marks;
                    }
                }

                if (studentMax > 0) {
                    classTotalPct += (studentScore / studentMax) * 100;
                    studentCount++;
                }
            }

            if (studentCount > 0) {
                totalStudentPerformance += classTotalPct / studentCount;
                totalClasses++;
            }
        }

        return totalClasses > 0 ? totalStudentPerformance / totalClasses : 0;
    } catch (e) {
        return 0;
    }
}

// ──────────────────────────────────────────────────────────────────────
// LOAD TEACHER PERFORMANCE
// ──────────────────────────────────────────────────────────────────────

async function loadTeacherPerformance() {
    const yearId = document.getElementById('perf-year-filter')?.value;
    if (yearId) {
        selectedYearId = parseInt(yearId);
        renderTeacherPerformance(document.getElementById('dynamic-content'));
    }
}

// ──────────────────────────────────────────────────────────────────────
// VIEW TEACHER PERFORMANCE DETAILS
// ──────────────────────────────────────────────────────────────────────

function viewTeacherPerformanceDetails(teacherId) {
    const data = window._teacherPerformanceData?.find(t => t.teacher.id === teacherId);
    if (!data) {
        showToast('Teacher not found', 'error');
        return;
    }

    const t = data.teacher;
    const year = (state.academicYears || []).find(y => y.id === selectedYearId);

    showModal(`
        <div class="modal-overlay" id="perf-detail-modal">
            <div class="modal" style="max-width:550px;">
                <div class="modal-header">
                    <h3>👩‍🏫 ${esc(t.first_name)} ${esc(t.last_name)}</h3>
                    <button class="modal-close" onclick="window.closeModal('perf-detail-modal')">✕</button>
                </div>
                <div class="modal-body">
                    <div style="margin-bottom:12px;padding:8px 12px;background:var(--bg-tertiary);border-radius:6px;font-size:0.8rem;">
                        📅 ${esc(year?.name || 'Current Year')}
                    </div>
                    <div class="form-grid">
                        <div class="form-group"><label>Department</label><input readonly value="${esc(t.department || 'General')}" class="form-control"></div>
                        <div class="form-group"><label>Classes</label><input readonly value="${data.classCount}" class="form-control"></div>
                        <div class="form-group"><label>Subjects</label><input readonly value="${data.subjectCount}" class="form-control"></div>
                        <div class="form-group"><label>Average %</label><input readonly value="${data.avgPerformance > 0 ? data.avgPerformance.toFixed(1) + '%' : '—'}" class="form-control" style="color:${data.avgPerformance >= 70 ? 'var(--success)' : data.avgPerformance >= 50 ? 'var(--warning)' : 'var(--danger)'};font-weight:700;"></div>
                        <div class="form-group"><label>Grade</label><input readonly value="${data.performanceGrade}" class="form-control"></div>
                        <div class="form-group"><label>Marks Entered</label><input readonly value="${data.marksEntered}" class="form-control"></div>
                        <div class="form-group full"><label>Assessments</label><input readonly value="${data.assessmentCount}" class="form-control"></div>
                        <div class="form-group full"><label>Trend</label>
                            <span style="color:${data.trend > 0 ? 'var(--success)' : data.trend < 0 ? 'var(--danger)' : 'var(--text-muted)'};font-weight:600;">
                                ${data.trend > 0 ? '📈 Improving (+' + data.trend.toFixed(1) + '%)' : data.trend < 0 ? '📉 Declining (' + data.trend.toFixed(1) + '%)' : '📊 Stable'}
                            </span>
                        </div>
                        <div class="form-group full"><label>Status</label>
                            <span class="badge ${data.avgPerformance >= 70 ? 'badge-success' : data.avgPerformance >= 50 ? 'badge-warning' : 'badge-danger'}">
                                ${data.avgPerformance >= 70 ? '🏆 Excellent' : data.avgPerformance >= 50 ? '📊 Average' : '⚠️ Needs Improvement'}
                            </span>
                        </div>
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-outline" onclick="window.closeModal('perf-detail-modal')">Close</button>
                    <button class="btn btn-primary" onclick="window.closeModal('perf-detail-modal'); window.navigateTo('teacher-assignments')">📋 View Assignments</button>
                </div>
            </div>
        </div>
    `);
}

// ──────────────────────────────────────────────────────────────────────
// FILTER TEACHER PERFORMANCE
// ──────────────────────────────────────────────────────────────────────

function filterTeacherPerformance() {
    const search = document.getElementById('perf-search')?.value?.toLowerCase() || '';
    const rows = document.querySelectorAll('#teacher-perf-table tbody tr');

    let visible = 0;
    rows.forEach(row => {
        const text = row.textContent.toLowerCase();
        const show = !search || text.includes(search);
        row.style.display = show ? '' : 'none';
        if (show) visible++;
    });

    const count = document.getElementById('perf-count');
    if (count) count.textContent = `${visible} teacher${visible !== 1 ? 's' : ''}`;
}

// ──────────────────────────────────────────────────────────────────────
// EXPORT TEACHER PERFORMANCE
// ──────────────────────────────────────────────────────────────────────

function exportTeacherPerformance() {
    const data = window._teacherPerformanceData || [];

    if (!data.length) {
        showToast('No performance data to export', 'warning');
        return;
    }

    const year = (state.academicYears || []).find(y => y.id === selectedYearId);
    const exportData = data.map(t => ({
        'Teacher': `${t.teacher.first_name} ${t.teacher.last_name}`,
        'Department': t.teacher.department || 'General',
        'Classes': t.classCount,
        'Subjects': t.subjectCount,
        'Average %': t.avgPerformance > 0 ? t.avgPerformance.toFixed(1) : 0,
        'Grade': t.performanceGrade,
        'Marks Entered': t.marksEntered,
        'Assessments': t.assessmentCount,
        'Assignments': t.assignments,
        'Trend': t.trend > 0 ? 'Improving' : t.trend < 0 ? 'Declining' : 'Stable',
        'Academic Year': year?.name || 'Current Year',
    }));

    exportToExcel(exportData, `Teacher_Performance_${year?.name || 'Current'}_${new Date().toISOString().split('T')[0]}`);
    showToast('✅ Teacher performance exported', 'success');
}

// ──────────────────────────────────────────────────────────────────────
// REFRESH TEACHER PERFORMANCE
// ──────────────────────────────────────────────────────────────────────

async function refreshTeacherPerformance() {
    renderTeacherPerformance(document.getElementById('dynamic-content'));
    showToast('🔄 Refreshed', 'info', 1500);
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

function exportToExcel(data, filename) {
    if (!data?.length) {
        showToast('No data to export', 'warning');
        return;
    }
    if (typeof XLSX === 'undefined') {
        showToast('SheetJS library not loaded', 'warning');
        return;
    }
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Data');
    XLSX.writeFile(wb, `${filename}.xlsx`);
}

function showModal(html) {
    const container = document.getElementById('modals-container');
    if (container) container.innerHTML = html;
}

function closeModal(modalId) {
    if (modalId) {
        const modal = document.getElementById(modalId);
        if (modal) modal.remove();
    } else {
        const container = document.getElementById('modals-container');
        if (container) container.innerHTML = '';
    }
}

async function ensureStateLoaded() {
    if (!state.classes.length) {
        const { loadInitialData } = await import('../../core/boot.js');
        await loadInitialData(false);
    }
}

// Export functions to window
window._exportTeacherPerformance = exportTeacherPerformance;
window._refreshTeacherPerformance = refreshTeacherPerformance;
window._viewTeacherPerformanceDetails = viewTeacherPerformanceDetails;
window._filterTeacherPerformance = filterTeacherPerformance;
window._loadTeacherPerformance = loadTeacherPerformance;