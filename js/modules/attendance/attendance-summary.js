/**
 * ECOLE LA FONTAINE — Attendance Summary Module
 * High-level attendance summary with rates and at-risk students
 * Last updated: 2026-07-03
 * 
 * CHANGES:
 * - Added academic year filtering
 * - Attendance data is now year-specific
 * - Shows term/phase information based on selected year
 * - Only shows attendance from current academic year by default
 * - Year indicator in summary header
 */


import {
    state,
    getClassById,
    getCurrentUser,
    isAdmin,
    isTeacher,
    isAccountant,
    getCurrentAcademicYear,
    getActiveAcademicYearId,
    getCurrentYearData,
    getTermsByYear,
    getStartOfTerm
} from '../../core/state.js';
import { esc, fmtDate, fmtPct } from '../../core/utils.js';
import { getAll, get, getYearData as apiGetYearData } from '../../core/api.js';
import { exportToExcel } from '../../core/utils.js';
import { asciiHorizontalBar } from '../../ui/charts.js';

// ──────────────────────────────────────────────────────────────────────
// STATE
// ──────────────────────────────────────────────────────────────────────

let selectedYearId = null;

// ──────────────────────────────────────────────────────────────────────
// MAIN RENDER FUNCTION
// ──────────────────────────────────────────────────────────────────────

export async function renderAttendanceSummary(container) {
    if (!container) return;

    const user = getCurrentUser();
    if (!isAdmin() && !isTeacher() && !isAccountant()) {
        container.innerHTML = '<div class="alert alert-danger">Access denied.</div>';
        return;
    }

    await ensureStateLoaded();

    let classes = (state.classes || []).filter(c => c.is_active !== false);
    if (isTeacher()) {
        const assignments = await getAll('teacher_assignments', { teacher_id: user.id });
        const classIds = new Set(assignments.map(a => a.class_id));
        const classTeacherClasses = classes.filter(c => c.class_teacher_id === user.id);
        classIds.forEach(id => classIds.add(id));
        classes = classes.filter(c => classIds.has(c.id) || classTeacherClasses.some(ct => ct.id === c.id));
    }

    const currentYear = getCurrentAcademicYear();
    const years = (state.academicYears || []).sort((a, b) => b.id - a.id);
    const today = new Date().toISOString().split('T')[0];

    // Default to current year
    if (!selectedYearId) {
        selectedYearId = state.filters?.academic_year_id || currentYear?.id || null;
    }

    // Get terms for selected year to determine default date range
    const selectedYear = (state.academicYears || []).find(y => y.id === selectedYearId);
    const terms = getTermsByYear(selectedYearId);
    const firstTerm = terms[0];
    const lastTerm = terms[terms.length - 1];
    const defaultStart = firstTerm?.start_date || getStartOfTerm();
    const defaultEnd = lastTerm?.end_date || today;

    container.innerHTML = `
        <div class="dash-card">
            <div class="dash-card-header">
                <span class="dash-card-title">📊 Attendance Summary</span>
                <div class="btn-group">
                    <select id="summary-year" onchange="window._onSummaryYearChange()" style="padding:6px 12px;border-radius:6px;border:1px solid var(--border-medium);font-size:0.8rem;">
                        ${years.map(y => `
                            <option value="${y.id}" ${y.id === selectedYearId ? 'selected' : ''}>
                                ${esc(y.name)} ${y.id === currentYear?.id ? '🟢' : ''} ${y.is_active ? '✅' : '🔒'}
                            </option>
                        `).join('')}
                    </select>
                    <button class="btn btn-sm btn-outline" onclick="window._exportAttendanceSummary()">📥 Export</button>
                    <button class="btn btn-sm btn-outline" onclick="window._refreshSummary()">🔄 Refresh</button>
                </div>
            </div>
            <div class="dash-card-body">
                <div class="form-grid" style="margin-bottom:16px;">
                    <div class="form-group">
                        <label>Class</label>
                        <select id="summary-class" onchange="window._loadAttendanceSummary()" style="padding:8px 12px;border-radius:6px;border:1px solid var(--border-medium);width:100%;">
                            <option value="">All Classes</option>
                            ${classes.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Start Date</label>
                        <input type="date" id="summary-start" value="${defaultStart}" style="padding:8px 12px;border-radius:6px;border:1px solid var(--border-medium);width:100%;">
                    </div>
                    <div class="form-group">
                        <label>End Date</label>
                        <input type="date" id="summary-end" value="${defaultEnd}" style="padding:8px 12px;border-radius:6px;border:1px solid var(--border-medium);width:100%;">
                    </div>
                    <div class="form-group" style="align-self:flex-end;">
                        <button class="btn btn-primary" onclick="window._loadAttendanceSummary()" style="width:100%;">🔍 Load Summary</button>
                    </div>
                </div>
                <div id="attendance-summary-container"></div>
            </div>
        </div>
    `;

    window._loadAttendanceSummary = loadAttendanceSummary;
    window._exportAttendanceSummary = exportAttendanceSummary;
    window._refreshSummary = refreshSummary;
    window._onSummaryYearChange = onSummaryYearChange;

    // Auto-load with default year
    await loadAttendanceSummary();
}

// ──────────────────────────────────────────────────────────────────────
// ON YEAR CHANGE
// ──────────────────────────────────────────────────────────────────────

function onSummaryYearChange() {
    const yearId = document.getElementById('summary-year')?.value;
    if (yearId) {
        selectedYearId = parseInt(yearId);
        // Update date range based on selected year's terms
        const terms = getTermsByYear(selectedYearId);
        const firstTerm = terms[0];
        const lastTerm = terms[terms.length - 1];
        const today = new Date().toISOString().split('T')[0];

        const startEl = document.getElementById('summary-start');
        const endEl = document.getElementById('summary-end');
        if (startEl && firstTerm?.start_date) startEl.value = firstTerm.start_date;
        if (endEl && lastTerm?.end_date) endEl.value = lastTerm.end_date;

        // Update state filter
        state.filters.academic_year_id = selectedYearId;

        loadAttendanceSummary();
    }
}

// ──────────────────────────────────────────────────────────────────────
// LOAD ATTENDANCE SUMMARY
// ──────────────────────────────────────────────────────────────────────

async function loadAttendanceSummary() {
    const container = document.getElementById('attendance-summary-container');
    if (!container) return;

    const classId = document.getElementById('summary-class')?.value;
    const startDate = document.getElementById('summary-start')?.value;
    const endDate = document.getElementById('summary-end')?.value;
    const yearId = selectedYearId || state.filters?.academic_year_id || state.currentAcadYear?.id;

    container.innerHTML = '<div class="loading-container"><div class="spinner"></div><p>Loading attendance summary...</p></div>';

    try {
        // Build query with year filter
        let query = 'attendance?limit=10000';
        if (classId) query += '&class_id=eq.' + classId;
        if (startDate) query += '&date=gte.' + startDate;
        if (endDate) query += '&date=lte.' + endDate;

        // Add year filter through terms
        if (yearId) {
            const terms = getTermsByYear(yearId);
            const termIds = terms.map(t => t.id);
            if (termIds.length) {
                query += '&term_id=in.(' + termIds.join(',') + ')';
            }
        }

        let records = [];
        try {
            const result = await getAll('attendance', query);
            records = result || [];
        } catch (e) {
            records = [];
        }

        // Get students for this year
        let students = (state.students || [])
            .filter(s => s.status === 'Active' && (yearId ? s.academic_year_id == yearId : true));
        if (classId) students = students.filter(s => s.class_id == classId);

        if (!students.length) {
            container.innerHTML = '<div class="alert alert-info">No students found for the selected filters.</div>';
            return;
        }

        // Calculate stats per student
        const studentStats = {};
        for (const s of students) {
            studentStats[s.id] = {
                student: s,
                present: 0,
                absent: 0,
                late: 0,
                excused: 0,
                total: 0,
            };
        }

        for (const rec of records) {
            if (studentStats[rec.student_id]) {
                studentStats[rec.student_id][rec.status] = (studentStats[rec.student_id][rec.status] || 0) + 1;
                studentStats[rec.student_id].total++;
            }
        }

        // Calculate class stats
        const classStats = {};
        for (const s of students) {
            const cls = getClassById(s.class_id);
            if (!classStats[cls?.id]) {
                classStats[cls?.id] = {
                    name: cls?.name || '—',
                    students: 0,
                    present: 0,
                    absent: 0,
                    late: 0,
                    excused: 0,
                    total: 0,
                };
            }
            classStats[cls?.id].students++;
            const stats = studentStats[s.id];
            classStats[cls?.id].present += stats.present;
            classStats[cls?.id].absent += stats.absent;
            classStats[cls?.id].late += stats.late;
            classStats[cls?.id].excused += stats.excused;
            classStats[cls?.id].total += stats.total;
        }

        // Calculate rates
        const summaryData = Object.values(classStats).map(c => {
            const rate = c.total > 0 ? ((c.present + c.late * 0.5) / c.total * 100) : 0;
            return { ...c, rate };
        });

        const overallRate = students.length > 0 && records.length > 0
            ? (records.filter(r => r.status === 'present').length / records.length * 100)
            : 0;

        const selectedYear = (state.academicYears || []).find(y => y.id === yearId);
        const isActiveYear = selectedYear?.is_active !== false;

        // Build HTML
        container.innerHTML = `
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;padding:8px 12px;background:var(--bg-tertiary);border-radius:6px;">
                <span style="font-weight:600;font-size:0.85rem;">📅 ${esc(selectedYear?.name || 'All Years')} ${isActiveYear ? '🟢' : '🔒'}</span>
                <span style="font-size:0.7rem;color:var(--text-muted);">
                    ${startDate && endDate ? `📆 ${fmtDate(startDate)} → ${fmtDate(endDate)}` : 'All dates'}
                    ${records.length ? ` · ${records.length} records` : ''}
                </span>
            </div>

            <div class="stats-grid" style="grid-template-columns:repeat(4,1fr);margin-bottom:16px;">
                <div class="stat-card" style="padding:12px;text-align:center;">
                    <div class="stat-value">${students.length}</div>
                    <div class="stat-label">👥 Students</div>
                </div>
                <div class="stat-card" style="padding:12px;text-align:center;">
                    <div class="stat-value">${records.length}</div>
                    <div class="stat-label">📋 Records</div>
                </div>
                <div class="stat-card" style="padding:12px;text-align:center;">
                    <div class="stat-value" style="color:${overallRate >= 85 ? 'var(--success)' : overallRate >= 75 ? 'var(--warning)' : 'var(--danger)'};">${overallRate.toFixed(1)}%</div>
                    <div class="stat-label">📊 Overall Rate</div>
                </div>
                <div class="stat-card" style="padding:12px;text-align:center;">
                    <div class="stat-value">${Object.keys(classStats).length}</div>
                    <div class="stat-label">🏛️ Classes</div>
                </div>
            </div>

            ${summaryData.length ? `
                <div class="dash-card" style="margin-bottom:16px;">
                    <div class="dash-card-header" style="padding:8px 12px;">
                        <span style="font-weight:600;font-size:0.85rem;">📊 Class Attendance Rates</span>
                    </div>
                    <div class="dash-card-body" style="padding:8px 12px;">
                        ${asciiHorizontalBar(summaryData.map(c => ({
            label: c.name,
            value: c.rate,
            color: c.rate >= 85 ? '#10b981' : c.rate >= 75 ? '#f59e0b' : '#ef4444'
        })), 30)}
                        <div style="display:flex;justify-content:space-between;margin-top:8px;font-size:0.65rem;color:var(--text-muted);">
                            <span>🟢 ≥85%</span>
                            <span>🟡 75-84%</span>
                            <span>🔴 &lt;75%</span>
                            <span>🎯 Target: 85%</span>
                        </div>
                    </div>
                </div>
            ` : ''}

            <div class="dash-card">
                <div class="dash-card-header" style="padding:8px 12px;">
                    <span style="font-weight:600;font-size:0.85rem;">📋 Student Attendance Details</span>
                    <span style="font-size:0.7rem;color:var(--text-muted);">${selectedYear?.name || 'All Years'}</span>
                </div>
                <div class="dash-card-body" style="padding:0;">
                    <div class="table-wrapper">
                        <table class="data-table" style="font-size:0.8rem;">
                            <thead>
                                <tr>
                                    <th>Student</th>
                                    <th>Code</th>
                                    <th style="text-align:center;">Days</th>
                                    <th style="text-align:center;color:var(--success);">Present</th>
                                    <th style="text-align:center;color:var(--danger);">Absent</th>
                                    <th style="text-align:center;color:var(--warning);">Late</th>
                                    <th style="text-align:center;">Rate</th>
                                    <th style="text-align:center;">Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${Object.values(studentStats).map(s => {
            const rate = s.total > 0 ? ((s.present + s.late * 0.5) / s.total * 100) : 0;
            const rateClass = rate >= 85 ? 'badge-success' : rate >= 75 ? 'badge-warning' : 'badge-danger';
            const status = rate >= 85 ? '✅ Good' : rate >= 75 ? '⚠️ Warning' : '🔴 At Risk';
            return `
                                        <tr>
                                            <td><strong>${esc(s.student.first_name)} ${esc(s.student.last_name)}</strong></td>
                                            <td>${esc(s.student.student_code || '—')}</td>
                                            <td style="text-align:center;">${s.total}</td>
                                            <td style="text-align:center;color:var(--success);">${s.present}</td>
                                            <td style="text-align:center;color:var(--danger);">${s.absent}</td>
                                            <td style="text-align:center;color:var(--warning);">${s.late}</td>
                                            <td style="text-align:center;"><span class="badge ${rateClass}">${rate.toFixed(1)}%</span></td>
                                            <td style="text-align:center;">${status}</td>
                                        </tr>
                                    `;
        }).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        `;

        window._attSummaryData = { studentStats, summaryData, overallRate, selectedYear };

    } catch (error) {
        container.innerHTML = `<div class="alert alert-danger">Error loading summary: ${esc(error.message)}</div>`;
    }
}

// ──────────────────────────────────────────────────────────────────────
// EXPORT ATTENDANCE SUMMARY
// ──────────────────────────────────────────────────────────────────────

function exportAttendanceSummary() {
    const data = window._attSummaryData;
    if (!data) {
        showToast('Load attendance summary first', 'warning');
        return;
    }

    const yearLabel = data.selectedYear?.name || 'All Years';

    const rows = Object.values(data.studentStats).map(s => ({
        'Student': `${s.student.first_name} ${s.student.last_name}`,
        'Code': s.student.student_code || '',
        'Academic Year': yearLabel,
        'Total Days': s.total,
        'Present': s.present,
        'Absent': s.absent,
        'Late': s.late,
        'Excused': s.excused,
        'Rate (%)': s.total > 0 ? ((s.present + s.late * 0.5) / s.total * 100).toFixed(1) : 0,
        'Status': s.total > 0 ? ((s.present + s.late * 0.5) / s.total * 100 >= 85 ? 'Good' : (s.present + s.late * 0.5) / s.total * 100 >= 75 ? 'Warning' : 'At Risk') : '—',
    }));

    exportToExcel(rows, `Attendance_Summary_${yearLabel.replace(/\s/g, '_')}_${new Date().toISOString().split('T')[0]}`);
    showToast('✅ Attendance summary exported', 'success');
}

// ──────────────────────────────────────────────────────────────────────
// REFRESH SUMMARY
// ──────────────────────────────────────────────────────────────────────

async function refreshSummary() {
    await refreshTable('attendance');
    await loadAttendanceSummary();
    showToast('🔄 Refreshed', 'info', 1000);
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

async function refreshTable(table) {
    const getAll = window.getAll || (async () => []);
    if (table === 'attendance') {
        state.attendance = await getAll('attendance');
    }
}

// Export functions to window
window._loadAttendanceSummary = loadAttendanceSummary;
window._exportAttendanceSummary = exportAttendanceSummary;
window._refreshSummary = refreshSummary;
window._onSummaryYearChange = onSummaryYearChange;