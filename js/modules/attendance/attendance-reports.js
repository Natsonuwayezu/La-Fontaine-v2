/**
 * ECOLE LA FONTAINE — Attendance Reports Module
 * Generate and export attendance reports with filters
 * Last updated: 2026-07-03
 * 
 * CHANGES:
 * - Added academic year filtering
 * - Reports show data for selected academic year
 * - Year selector in filters
 * - Term options filtered by selected year
 * - Student list filtered by selected year
 * - Export includes year information
 */

import {
    state,
    getClassById,
    getStudentById,
    getCurrentUser,
    getCurrentAcademicYear,
    getActiveAcademicYearId,
    isAdmin,
    isTeacher,
    isAccountant
} from '../../core/state.js';
import { esc, fmtDate, fmtPct } from '../../core/utils.js';
import { getAll, getYearData } from '../../core/api.js';
import { exportToExcel } from '../../core/utils.js';

// ──────────────────────────────────────────────────────────────────────
// MAIN RENDER FUNCTION
// ──────────────────────────────────────────────────────────────────────

export async function renderAttendanceReports(container) {
    if (!container) return;

    const user = getCurrentUser();
    if (!isAdmin() && !isTeacher() && !isAccountant()) {
        container.innerHTML = '<div class="alert alert-danger">Access denied.</div>';
        return;
    }

    await ensureStateLoaded();

    let classes = (state.classes || []).filter(c => c.is_active !== false)
        .sort((a, b) => (a.sort_order || 99) - (b.sort_order || 99));

    if (isTeacher()) {
        const assignments = await getAll('teacher_assignments', { teacher_id: user.id });
        const classIds = new Set(assignments.map(a => a.class_id));
        // Also include classes where user is class teacher
        const classTeacherClasses = classes.filter(c => c.class_teacher_id === user.id);
        classIds.forEach(id => classIds.add(id));
        classes = classes.filter(c => classIds.has(c.id) || classTeacherClasses.some(ct => ct.id === c.id));
    }

    const currentYear = getCurrentAcademicYear();
    const years = (state.academicYears || []).sort((a, b) => b.id - a.id);
    const selectedYearId = state.filters?.academic_year_id || currentYear?.id;

    // Get terms for selected year
    const terms = (state.terms || [])
        .filter(t => t.academic_year_id === selectedYearId)
        .sort((a, b) => a.term_number - b.term_number);

    // Get students for selected year
    const students = (state.students || [])
        .filter(s => s.academic_year_id === selectedYearId && s.status === 'Active')
        .sort((a, b) => a.last_name.localeCompare(b.last_name));

    const today = new Date().toISOString().split('T')[0];
    const monthStart = today.slice(0, 8) + '01';

    container.innerHTML = `
        <div class="dash-card">
            <div class="dash-card-header">
                <span class="dash-card-title">📊 Attendance Reports</span>
                <div class="btn-group">
                    <select id="att-year-filter" onchange="window._refreshAttendanceReports()" style="padding:6px 12px;border-radius:6px;border:1px solid var(--border-medium);font-size:0.8rem;">
                        ${years.map(y => `
                            <option value="${y.id}" ${y.id === selectedYearId ? 'selected' : ''}>
                                ${esc(y.name)} ${y.id === currentYear?.id ? '🟢' : ''} ${y.is_active ? '✅' : '🔒'}
                            </option>
                        `).join('')}
                    </select>
                    <button class="btn btn-sm btn-outline" onclick="window._printAttendanceReport()">🖨️ Print</button>
                    <button class="btn btn-sm btn-outline" onclick="window._exportAttReport()">📥 Excel</button>
                </div>
            </div>
            <div class="dash-card-body">
                <div class="form-grid" style="margin-bottom:16px;">
                    <div class="form-group">
                        <label>Report Type</label>
                        <select id="att-rtype" onchange="window._toggleAttReportFields()" style="padding:8px 12px;border-radius:6px;border:1px solid var(--border-medium);width:100%;">
                            <option value="daily">Daily Absent List</option>
                            <option value="class">Class Summary</option>
                            <option value="term">Term Summary</option>
                            <option value="student">Individual Student</option>
                        </select>
                    </div>
                    <div class="form-group" id="fg-class">
                        <label>Class</label>
                        <select id="att-rclass" style="padding:8px 12px;border-radius:6px;border:1px solid var(--border-medium);width:100%;">
                            <option value="">All Classes</option>
                            ${classes.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}
                        </select>
                    </div>
                    <div class="form-group" id="fg-date">
                        <label>Date</label>
                        <input type="date" id="att-rdate" value="${today}" style="padding:8px 12px;border-radius:6px;border:1px solid var(--border-medium);width:100%;">
                    </div>
                    <div class="form-group" id="fg-dates" style="display:none;">
                        <label>From</label>
                        <input type="date" id="att-rfrom" value="${monthStart}" style="padding:8px 12px;border-radius:6px;border:1px solid var(--border-medium);width:100%;">
                    </div>
                    <div class="form-group" id="fg-datee" style="display:none;">
                        <label>To</label>
                        <input type="date" id="att-rto" value="${today}" style="padding:8px 12px;border-radius:6px;border:1px solid var(--border-medium);width:100%;">
                    </div>
                    <div class="form-group" id="fg-term" style="display:none;">
                        <label>Term</label>
                        <select id="att-rterm" style="padding:8px 12px;border-radius:6px;border:1px solid var(--border-medium);width:100%;">
                            ${terms.map(t => `<option value="${t.id}" ${t.id === state.currentTerm?.id ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}
                        </select>
                    </div>
                    <div class="form-group" id="fg-student" style="display:none;">
                        <label>Student</label>
                        <select id="att-rstudent" style="padding:8px 12px;border-radius:6px;border:1px solid var(--border-medium);width:100%;">
                            <option value="">— Select student —</option>
                            ${students.map(s => `<option value="${s.id}">${esc(s.first_name)} ${esc(s.last_name)} (${esc(s.student_code || '')})</option>`).join('')}
                        </select>
                    </div>
                    <div class="form-group" style="align-self:flex-end;">
                        <button class="btn btn-primary" onclick="window._generateAttReport()" style="width:100%;">📊 Generate</button>
                    </div>
                </div>
                <div style="font-size:0.7rem;color:var(--text-muted);margin-bottom:12px;padding:8px 12px;background:var(--bg-tertiary);border-radius:6px;">
                    📅 Academic Year: <strong>${esc(years.find(y => y.id === selectedYearId)?.name || 'All')}</strong>
                    ${selectedYearId !== currentYear?.id ? ' 🔒 Read-only' : ''}
                </div>
                <div id="att-report-output"></div>
            </div>
        </div>
    `;

    window._toggleAttReportFields = toggleAttReportFields;
    window._generateAttReport = generateAttReport;
    window._printAttendanceReport = printAttendanceReport;
    window._exportAttReport = exportAttReport;
    window._refreshAttendanceReports = refreshAttendanceReports;

    toggleAttReportFields();
}

// ──────────────────────────────────────────────────────────────────────
// REFRESH ATTENDANCE REPORTS
// ──────────────────────────────────────────────────────────────────────

async function refreshAttendanceReports() {
    const yearId = document.getElementById('att-year-filter')?.value;
    if (yearId) {
        state.filters.academic_year_id = parseInt(yearId);
        // Re-render with new year
        renderAttendanceReports(document.getElementById('dynamic-content'));
        showToast('📅 Attendance reports refreshed', 'info', 1500);
    }
}

// ──────────────────────────────────────────────────────────────────────
// TOGGLE ATTENDANCE REPORT FIELDS
// ──────────────────────────────────────────────────────────────────────

function toggleAttReportFields() {
    const type = document.getElementById('att-rtype')?.value;

    const fgClass = document.getElementById('fg-class');
    const fgStudent = document.getElementById('fg-student');
    const fgTerm = document.getElementById('fg-term');
    const fgDate = document.getElementById('fg-date');
    const fgDates = document.getElementById('fg-dates');
    const fgDatee = document.getElementById('fg-datee');

    if (fgClass) fgClass.style.display = ['daily', 'class', 'term'].includes(type) ? '' : 'none';
    if (fgStudent) fgStudent.style.display = type === 'student' ? '' : 'none';
    if (fgTerm) fgTerm.style.display = type === 'term' ? '' : 'none';
    if (fgDate) fgDate.style.display = type === 'daily' ? '' : 'none';
    if (fgDates) fgDates.style.display = ['class', 'term', 'student'].includes(type) ? '' : 'none';
    if (fgDatee) fgDatee.style.display = ['class', 'term', 'student'].includes(type) ? '' : 'none';
}

// ──────────────────────────────────────────────────────────────────────
// GENERATE ATTENDANCE REPORT
// ──────────────────────────────────────────────────────────────────────

async function generateAttReport() {
    const type = document.getElementById('att-rtype')?.value || 'daily';
    const classId = document.getElementById('att-rclass')?.value;
    const termId = document.getElementById('att-rterm')?.value;
    const studentId = document.getElementById('att-rstudent')?.value;
    const date = document.getElementById('att-rdate')?.value;
    const dateFrom = document.getElementById('att-rfrom')?.value;
    const dateTo = document.getElementById('att-rto')?.value;
    const yearId = document.getElementById('att-year-filter')?.value || state.filters?.academic_year_id;

    const container = document.getElementById('att-report-output');
    if (!container) return;

    container.innerHTML = '<div class="loading-container"><div class="spinner"></div><p>Generating report...</p></div>';

    try {
        let query = 'attendance?limit=10000&order=date.desc';

        // Add academic year filter
        if (yearId) {
            // Get terms for this year to filter attendance by date range
            const yearTerms = (state.terms || []).filter(t => t.academic_year_id == yearId);
            if (yearTerms.length > 0) {
                const startDates = yearTerms.map(t => t.start_date).filter(Boolean);
                const endDates = yearTerms.map(t => t.end_date).filter(Boolean);
                if (startDates.length) {
                    const earliestStart = startDates.sort()[0];
                    query += `&date=gte.${earliestStart}`;
                }
                if (endDates.length) {
                    const latestEnd = endDates.sort().reverse()[0];
                    query += `&date=lte.${latestEnd}`;
                }
            }
        }

        if (classId) query += '&class_id=eq.' + classId;
        if (studentId) query += '&student_id=eq.' + studentId;
        if (date) query += '&date=eq.' + date;
        if (dateFrom) query += '&date=gte.' + dateFrom;
        if (dateTo) query += '&date=lte.' + dateTo;
        if (termId) {
            const term = state.terms.find(t => t.id == termId);
            if (term?.start_date) query += '&date=gte.' + term.start_date;
            if (term?.end_date) query += '&date=lte.' + term.end_date;
        }

        let records = [];
        try {
            const result = await getAll('attendance', query);
            records = result || [];
        } catch (e) {
            records = [];
        }

        if (!records.length) {
            const year = (state.academicYears || []).find(y => y.id == yearId);
            container.innerHTML = `
                <div class="alert alert-info">
                    No attendance records found for the selected filters.
                    ${year ? ` (${esc(year.name)})` : ''}
                    <br><small style="color:var(--text-muted);">Try selecting a different academic year or date range.</small>
                </div>
            `;
            return;
        }

        // Build report based on type
        if (type === 'daily') {
            container.innerHTML = renderDailyReport(records, classId, date, yearId);
        } else if (type === 'class') {
            container.innerHTML = renderClassReport(records, classId, yearId);
        } else if (type === 'term') {
            container.innerHTML = renderTermReport(records, classId, termId, yearId);
        } else if (type === 'student') {
            container.innerHTML = renderStudentReport(records, studentId, yearId);
        }

        // Store for export
        window._attReportData = { records, type, classId, termId, studentId, yearId };

    } catch (error) {
        container.innerHTML = `<div class="alert alert-danger">Error generating report: ${esc(error.message)}</div>`;
    }
}

// ──────────────────────────────────────────────────────────────────────
// RENDER DAILY REPORT
// ──────────────────────────────────────────────────────────────────────

function renderDailyReport(records, classId, date, yearId) {
    const year = (state.academicYears || []).find(y => y.id == yearId);
    const students = (state.students || []).filter(s => s.class_id == classId && s.status === 'Active' && s.academic_year_id == yearId);
    const cls = getClassById(classId);

    const statusMap = {};
    for (const rec of records) {
        statusMap[rec.student_id] = rec;
    }

    const rows = students.map(s => {
        const rec = statusMap[s.id];
        const status = rec?.status || '—';
        const notes = rec?.notes || '';
        const statusClass = status === 'present' ? 'badge-success' : status === 'absent' ? 'badge-danger' : status === 'late' ? 'badge-warning' : 'badge-info';
        return `
            <tr>
                <td><strong>${esc(s.first_name)} ${esc(s.last_name)}</strong></td>
                <td>${esc(s.student_code || '—')}</td>
                <td><span class="badge ${statusClass}">${esc(status)}</span></td>
                <td style="font-size:0.8rem;">${esc(notes)}</td>
            </tr>
        `;
    }).join('');

    const present = records.filter(r => r.status === 'present').length;
    const absent = records.filter(r => r.status === 'absent').length;
    const late = records.filter(r => r.status === 'late').length;
    const excused = records.filter(r => r.status === 'excused').length;
    const total = students.length;

    return `
        <div class="dash-card">
            <div class="dash-card-header">
                <span class="dash-card-title">📋 Daily Attendance — ${esc(cls?.name || 'All Classes')} (${fmtDate(date)})</span>
                <span style="font-size:0.7rem;color:var(--text-muted);">${esc(year?.name || '')}</span>
            </div>
            <div class="dash-card-body">
                <div class="stats-grid" style="grid-template-columns:repeat(5,1fr);margin-bottom:16px;">
                    <div class="stat-card" style="padding:10px;text-align:center;"><div class="stat-value" style="color:var(--text-primary);">${total}</div><div class="stat-label">Total</div></div>
                    <div class="stat-card" style="padding:10px;text-align:center;background:var(--success-bg);"><div class="stat-value" style="color:var(--success);">${present}</div><div class="stat-label">✅ Present</div></div>
                    <div class="stat-card" style="padding:10px;text-align:center;background:var(--danger-bg);"><div class="stat-value" style="color:var(--danger);">${absent}</div><div class="stat-label">❌ Absent</div></div>
                    <div class="stat-card" style="padding:10px;text-align:center;background:var(--warning-bg);"><div class="stat-value" style="color:var(--warning);">${late}</div><div class="stat-label">⏰ Late</div></div>
                    <div class="stat-card" style="padding:10px;text-align:center;background:var(--info-bg);"><div class="stat-value" style="color:var(--info);">${excused}</div><div class="stat-label">📋 Excused</div></div>
                </div>
                <div class="table-wrapper">
                    <table class="data-table" style="font-size:0.85rem;">
                        <thead>
                            <tr>
                                <th>Student</th>
                                <th>Code</th>
                                <th>Status</th>
                                <th>Notes</th>
                            </tr>
                        </thead>
                        <tbody>${rows || '<tr><td colspan="4" style="text-align:center;padding:20px;color:var(--text-muted);">No records found</td></tr>'}</tbody>
                    </table>
                </div>
            </div>
        </div>
    `;
}

// ──────────────────────────────────────────────────────────────────────
// RENDER CLASS REPORT
// ──────────────────────────────────────────────────────────────────────

function renderClassReport(records, classId, yearId) {
    const year = (state.academicYears || []).find(y => y.id == yearId);
    const students = (state.students || []).filter(s => s.class_id == classId && s.status === 'Active' && s.academic_year_id == yearId);
    const cls = getClassById(classId);

    const studentStats = {};
    for (const s of students) {
        studentStats[s.id] = { present: 0, absent: 0, late: 0, excused: 0, total: 0 };
    }

    for (const rec of records) {
        if (studentStats[rec.student_id]) {
            studentStats[rec.student_id][rec.status] = (studentStats[rec.student_id][rec.status] || 0) + 1;
            studentStats[rec.student_id].total++;
        }
    }

    const rows = students.map(s => {
        const stats = studentStats[s.id] || { present: 0, absent: 0, late: 0, excused: 0, total: 0 };
        const rate = stats.total > 0 ? ((stats.present + stats.late * 0.5) / stats.total * 100) : 0;
        const rateClass = rate >= 85 ? 'badge-success' : rate >= 75 ? 'badge-warning' : 'badge-danger';
        return `
            <tr>
                <td><strong>${esc(s.first_name)} ${esc(s.last_name)}</strong></td>
                <td>${esc(s.student_code || '—')}</td>
                <td style="text-align:center;">${stats.total}</td>
                <td style="text-align:center;color:var(--success);">${stats.present || 0}</td>
                <td style="text-align:center;color:var(--danger);">${stats.absent || 0}</td>
                <td style="text-align:center;color:var(--warning);">${stats.late || 0}</td>
                <td style="text-align:center;">${stats.excused || 0}</td>
                <td style="text-align:center;"><span class="badge ${rateClass}">${rate.toFixed(1)}%</span></td>
            </tr>
        `;
    }).join('');

    const totalDays = records.length ? new Set(records.map(r => r.date)).size : 0;
    const overallRate = students.length ? records.filter(r => r.status === 'present').length / records.length * 100 : 0;

    return `
        <div class="dash-card">
            <div class="dash-card-header">
                <span class="dash-card-title">📋 Class Attendance Summary — ${esc(cls?.name || 'Class')}</span>
                <span style="font-size:0.7rem;color:var(--text-muted);">${esc(year?.name || '')}</span>
            </div>
            <div class="dash-card-body">
                <div class="stats-grid" style="grid-template-columns:repeat(3,1fr);margin-bottom:16px;">
                    <div class="stat-card" style="padding:10px;text-align:center;"><div class="stat-value">${students.length}</div><div class="stat-label">Students</div></div>
                    <div class="stat-card" style="padding:10px;text-align:center;"><div class="stat-value">${totalDays}</div><div class="stat-label">Days</div></div>
                    <div class="stat-card" style="padding:10px;text-align:center;"><div class="stat-value" style="color:${overallRate >= 85 ? 'var(--success)' : 'var(--warning)'};">${overallRate.toFixed(1)}%</div><div class="stat-label">Overall Rate</div></div>
                </div>
                <div class="table-wrapper">
                    <table class="data-table" style="font-size:0.85rem;">
                        <thead>
                            <tr>
                                <th>Student</th>
                                <th>Code</th>
                                <th style="text-align:center;">Days</th>
                                <th style="text-align:center;">Present</th>
                                <th style="text-align:center;">Absent</th>
                                <th style="text-align:center;">Late</th>
                                <th style="text-align:center;">Excused</th>
                                <th style="text-align:center;">Rate</th>
                            </tr>
                        </thead>
                        <tbody>${rows || '<tr><td colspan="8" style="text-align:center;padding:20px;color:var(--text-muted);">No records found</td></tr>'}</tbody>
                    </table>
                </div>
            </div>
        </div>
    `;
}

// ──────────────────────────────────────────────────────────────────────
// RENDER TERM REPORT
// ──────────────────────────────────────────────────────────────────────

function renderTermReport(records, classId, termId, yearId) {
    const year = (state.academicYears || []).find(y => y.id == yearId);
    const term = state.terms.find(t => t.id == termId);
    const cls = getClassById(classId);
    const students = (state.students || []).filter(s => s.class_id == classId && s.status === 'Active' && s.academic_year_id == yearId);

    const studentStats = {};
    for (const s of students) {
        studentStats[s.id] = { present: 0, absent: 0, late: 0, excused: 0, total: 0 };
    }

    for (const rec of records) {
        if (studentStats[rec.student_id]) {
            studentStats[rec.student_id][rec.status] = (studentStats[rec.student_id][rec.status] || 0) + 1;
            studentStats[rec.student_id].total++;
        }
    }

    const rows = students.map(s => {
        const stats = studentStats[s.id] || { present: 0, absent: 0, late: 0, excused: 0, total: 0 };
        const rate = stats.total > 0 ? ((stats.present + stats.late * 0.5) / stats.total * 100) : 0;
        const rateClass = rate >= 85 ? 'badge-success' : rate >= 75 ? 'badge-warning' : 'badge-danger';
        return `
            <tr>
                <td><strong>${esc(s.first_name)} ${esc(s.last_name)}</strong></td>
                <td>${esc(s.student_code || '—')}</td>
                <td style="text-align:center;">${stats.total}</td>
                <td style="text-align:center;color:var(--success);">${stats.present || 0}</td>
                <td style="text-align:center;color:var(--danger);">${stats.absent || 0}</td>
                <td style="text-align:center;color:var(--warning);">${stats.late || 0}</td>
                <td style="text-align:center;">${stats.excused || 0}</td>
                <td style="text-align:center;"><span class="badge ${rateClass}">${rate.toFixed(1)}%</span></td>
            </tr>
        `;
    }).join('');

    const totalDays = records.length ? new Set(records.map(r => r.date)).size : 0;
    const overallRate = students.length ? records.filter(r => r.status === 'present').length / records.length * 100 : 0;

    return `
        <div class="dash-card">
            <div class="dash-card-header">
                <span class="dash-card-title">📋 Term Attendance Summary — ${esc(cls?.name || 'Class')} (${esc(term?.name || 'Term')})</span>
                <span style="font-size:0.7rem;color:var(--text-muted);">${esc(year?.name || '')}</span>
            </div>
            <div class="dash-card-body">
                <div class="stats-grid" style="grid-template-columns:repeat(4,1fr);margin-bottom:16px;">
                    <div class="stat-card" style="padding:10px;text-align:center;"><div class="stat-value">${students.length}</div><div class="stat-label">Students</div></div>
                    <div class="stat-card" style="padding:10px;text-align:center;"><div class="stat-value">${totalDays}</div><div class="stat-label">Days</div></div>
                    <div class="stat-card" style="padding:10px;text-align:center;"><div class="stat-value">${overallRate.toFixed(1)}%</div><div class="stat-label">Overall Rate</div></div>
                    <div class="stat-card" style="padding:10px;text-align:center;"><div class="stat-value">${records.length}</div><div class="stat-label">Records</div></div>
                </div>
                <div class="table-wrapper">
                    <table class="data-table" style="font-size:0.85rem;">
                        <thead>
                            <tr>
                                <th>Student</th>
                                <th>Code</th>
                                <th style="text-align:center;">Days</th>
                                <th style="text-align:center;">Present</th>
                                <th style="text-align:center;">Absent</th>
                                <th style="text-align:center;">Late</th>
                                <th style="text-align:center;">Excused</th>
                                <th style="text-align:center;">Rate</th>
                            </tr>
                        </thead>
                        <tbody>${rows || '<tr><td colspan="8" style="text-align:center;padding:20px;color:var(--text-muted);">No records found</td></tr>'}</tbody>
                    </table>
                </div>
            </div>
        </div>
    `;
}

// ──────────────────────────────────────────────────────────────────────
// RENDER STUDENT REPORT
// ──────────────────────────────────────────────────────────────────────

function renderStudentReport(records, studentId, yearId) {
    const year = (state.academicYears || []).find(y => y.id == yearId);
    const student = getStudentById(studentId);
    if (!student) return '<div class="alert alert-warning">Student not found</div>';

    const dates = [...new Set(records.map(r => r.date))].sort();
    const statusMap = {};
    for (const rec of records) {
        statusMap[rec.date] = rec;
    }

    const rows = dates.map(date => {
        const rec = statusMap[date];
        const status = rec?.status || '—';
        const notes = rec?.notes || '';
        const statusClass = status === 'present' ? 'badge-success' : status === 'absent' ? 'badge-danger' : status === 'late' ? 'badge-warning' : 'badge-info';
        return `
            <tr>
                <td>${fmtDate(date)}</td>
                <td><span class="badge ${statusClass}">${esc(status)}</span></td>
                <td style="font-size:0.8rem;">${esc(notes)}</td>
            </tr>
        `;
    }).join('');

    const present = records.filter(r => r.status === 'present').length;
    const absent = records.filter(r => r.status === 'absent').length;
    const late = records.filter(r => r.status === 'late').length;
    const excused = records.filter(r => r.status === 'excused').length;
    const total = records.length;
    const rate = total > 0 ? ((present + late * 0.5) / total * 100) : 0;
    const rateClass = rate >= 85 ? 'badge-success' : rate >= 75 ? 'badge-warning' : 'badge-danger';

    const cls = getClassById(student.class_id);

    return `
        <div class="dash-card">
            <div class="dash-card-header">
                <span class="dash-card-title">👤 Student Attendance — ${esc(student.first_name)} ${esc(student.last_name)}</span>
                <span style="font-size:0.7rem;color:var(--text-muted);">${esc(year?.name || '')}</span>
            </div>
            <div class="dash-card-body">
                <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:16px;">
                    <div style="padding:10px;background:var(--bg-tertiary);border-radius:8px;text-align:center;">
                        <div style="font-size:0.7rem;color:var(--text-muted);text-transform:uppercase;">Student</div>
                        <div style="font-weight:600;">${esc(student.first_name)} ${esc(student.last_name)}</div>
                        <div style="font-size:0.8rem;color:var(--text-muted);">${esc(student.student_code || '')}</div>
                    </div>
                    <div style="padding:10px;background:var(--bg-tertiary);border-radius:8px;text-align:center;">
                        <div style="font-size:0.7rem;color:var(--text-muted);text-transform:uppercase;">Class</div>
                        <div style="font-weight:600;">${esc(cls?.name || '—')}</div>
                    </div>
                    <div style="padding:10px;background:var(--bg-tertiary);border-radius:8px;text-align:center;">
                        <div style="font-size:0.7rem;color:var(--text-muted);text-transform:uppercase;">Attendance Rate</div>
                        <div style="font-size:1.2rem;font-weight:700;color:${rate >= 85 ? 'var(--success)' : 'var(--warning)'};">${rate.toFixed(1)}%</div>
                        <div style="font-size:0.7rem;color:var(--text-muted);">${total} days</div>
                    </div>
                </div>
                <div class="stats-grid" style="grid-template-columns:repeat(4,1fr);margin-bottom:16px;">
                    <div class="stat-card" style="padding:8px;text-align:center;background:var(--success-bg);"><div class="stat-value" style="color:var(--success);font-size:1.2rem;">${present}</div><div class="stat-label">✅ Present</div></div>
                    <div class="stat-card" style="padding:8px;text-align:center;background:var(--danger-bg);"><div class="stat-value" style="color:var(--danger);font-size:1.2rem;">${absent}</div><div class="stat-label">❌ Absent</div></div>
                    <div class="stat-card" style="padding:8px;text-align:center;background:var(--warning-bg);"><div class="stat-value" style="color:var(--warning);font-size:1.2rem;">${late}</div><div class="stat-label">⏰ Late</div></div>
                    <div class="stat-card" style="padding:8px;text-align:center;background:var(--info-bg);"><div class="stat-value" style="color:var(--info);font-size:1.2rem;">${excused}</div><div class="stat-label">📋 Excused</div></div>
                </div>
                <div class="table-wrapper">
                    <table class="data-table" style="font-size:0.85rem;">
                        <thead>
                            <tr>
                                <th>Date</th>
                                <th>Status</th>
                                <th>Notes</th>
                            </tr>
                        </thead>
                        <tbody>${rows || '<tr><td colspan="3" style="text-align:center;padding:20px;color:var(--text-muted);">No records found</td></tr>'}</tbody>
                    </table>
                </div>
            </div>
        </div>
    `;
}

// ──────────────────────────────────────────────────────────────────────
// PRINT ATTENDANCE REPORT
// ──────────────────────────────────────────────────────────────────────

function printAttendanceReport() {
    const container = document.getElementById('att-report-output');
    if (!container || !container.querySelector('table')) {
        showToast('Generate a report first', 'warning');
        return;
    }

    const printWindow = window.open('', '_blank');
    if (!printWindow) {
        showToast('Popup blocked. Please allow popups.', 'warning');
        return;
    }

    const school = state.schoolSettings || {};
    const yearId = document.getElementById('att-year-filter')?.value || state.filters?.academic_year_id;
    const year = (state.academicYears || []).find(y => y.id == yearId);

    printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Attendance Report</title>
            <style>
                body { font-family: Arial, sans-serif; padding: 20px; }
                table { width: 100%; border-collapse: collapse; font-size: 11px; }
                th, td { border: 1px solid #ccc; padding: 6px; }
                th { background: #1a3a5c; color: white; }
                h1, h2 { text-align: center; color: #1a3a5c; }
                .badge { display: inline-block; padding: 2px 8px; border-radius: 12px; font-size: 9px; font-weight: 600; }
                .badge-success { background: #d1fae5; color: #065f46; }
                .badge-danger { background: #fee2e2; color: #991b1b; }
                .badge-warning { background: #fef3c7; color: #92400e; }
                .badge-info { background: #dbeafe; color: #1e40af; }
                .year-label { text-align: center; font-size: 12px; color: #64748b; margin-bottom: 10px; }
                @media print { body { padding: 0; } }
            </style>
        </head>
        <body>
            <h1>${esc(school.school_name || 'ECOLE LA FONTAINE')}</h1>
            <h2>Attendance Report</h2>
            <div class="year-label">📅 ${esc(year?.name || 'Current Year')}</div>
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

// ──────────────────────────────────────────────────────────────────────
// EXPORT ATTENDANCE REPORT
// ──────────────────────────────────────────────────────────────────────

function exportAttReport() {
    const container = document.getElementById('att-report-output');
    const table = container?.querySelector('table');
    if (!table) {
        showToast('Generate a report first', 'warning');
        return;
    }

    const yearId = document.getElementById('att-year-filter')?.value || state.filters?.academic_year_id;
    const year = (state.academicYears || []).find(y => y.id == yearId);

    const ws = XLSX.utils.table_to_sheet(table);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Attendance_Report');
    const filename = `Attendance_Report${year ? '_' + year.name : ''}_${new Date().toISOString().split('T')[0]}`;
    XLSX.writeFile(wb, `${filename}.xlsx`);
    showToast('✅ Attendance report exported', 'success');
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
window._toggleAttReportFields = toggleAttReportFields;
window._generateAttReport = generateAttReport;
window._printAttendanceReport = printAttendanceReport;
window._exportAttReport = exportAttReport;
window._refreshAttendanceReports = refreshAttendanceReports;