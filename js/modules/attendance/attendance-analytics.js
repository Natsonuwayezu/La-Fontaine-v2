/**
 * ECOLE LA FONTAINE — Attendance Analytics Module
 * Advanced attendance analytics with trends, patterns, and correlations
 * Last updated: 2026-07-03
 * 
 * CHANGES:
 * - Added academic year selector
 * - Analytics data filtered by selected academic year
 * - Year-over-year attendance comparison
 * - Term-level trends within selected year
 * - Academic year label in all charts
 */



const state = window.state || {}; // global state alias
const ensureStateLoaded = window.ensureStateLoaded || (async () => {}); // global from boot.js
import {
    state,
    getClassById,
    getCurrentUser,
    isAdmin,
    isTeacher,
    isAccountant,
    getCurrentAcademicYear,
    getActiveAcademicYearId,
    getTermsByYear,
    setYearFilter,
    getCurrentYearData
} from '../../core/state.js';
import { esc, fmtDate } from '../../core/utils.js';
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

export async function renderAttendanceAnalytics(container) {
    if (!container) return;

    const user = getCurrentUser();
    if (!isAdmin() && !isTeacher() && !isAccountant()) {
        container.innerHTML = '<div class="alert alert-danger">Access denied.</div>';
        return;
    }

    await ensureStateLoaded();

    const currentYear = getCurrentAcademicYear();
    const years = (state.academicYears || []).sort((a, b) => b.id - a.id);
    const terms = getTermsByYear(currentYear?.id);

    // Default to current year
    if (!selectedYearId) {
        selectedYearId = state.filters?.academic_year_id || currentYear?.id || null;
    }

    let classes = (state.classes || []).filter(c => c.is_active !== false);
    if (isTeacher()) {
        const assignments = await getAll('teacher_assignments', { teacher_id: user.id });
        const classIds = new Set(assignments.map(a => a.class_id));
        const classTeacherClasses = classes.filter(c => c.class_teacher_id === user.id);
        classIds.forEach(id => classIds.add(id));
        classes = classes.filter(c => classIds.has(c.id) || classTeacherClasses.some(ct => ct.id === c.id));
    }

    container.innerHTML = `
        <div class="dash-card">
            <div class="dash-card-header" style="flex-wrap:wrap;gap:8px;">
                <span class="dash-card-title">📈 Attendance Analytics</span>
                <div class="btn-group" style="flex-wrap:wrap;gap:6px;">
                    <select id="analytics-year" onchange="window._loadAttendanceAnalytics()" style="padding:6px 12px;border-radius:var(--r-md);border:1px solid var(--border-medium);font-size:0.8rem;">
                        ${years.map(y => `
                            <option value="${y.id}" ${y.id === selectedYearId ? 'selected' : ''}>
                                ${esc(y.name)} ${y.id === currentYear?.id ? '🟢' : ''} ${y.is_active ? '✅' : '🔒'}
                            </option>
                        `).join('')}
                        <option value="all" ${selectedYearId === 'all' ? 'selected' : ''}>All Years</option>
                    </select>
                    <select id="analytics-term" onchange="window._loadAttendanceAnalytics()" style="padding:6px 12px;border-radius:var(--r-md);border:1px solid var(--border-medium);">
                        <option value="all">All Terms</option>
                        ${terms.map(t => `<option value="${t.id}">${esc(t.name)}</option>`).join('')}
                    </select>
                    <select id="analytics-class" onchange="window._loadAttendanceAnalytics()" style="padding:6px 12px;border-radius:var(--r-md);border:1px solid var(--border-medium);">
                        <option value="">All Classes</option>
                        ${classes.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}
                    </select>
                    <select id="analytics-period" onchange="window._loadAttendanceAnalytics()" style="padding:6px 12px;border-radius:var(--r-md);border:1px solid var(--border-medium);">
                        <option value="week">Last 7 Days</option>
                        <option value="month">Last 30 Days</option>
                        <option value="term">Current Term</option>
                        <option value="year">Academic Year</option>
                    </select>
                    <button class="btn btn-sm btn-outline" onclick="window._exportAttendanceAnalytics()">📥 Export</button>
                    <button class="btn btn-sm btn-outline" onclick="window._refreshAnalytics()">🔄 Refresh</button>
                </div>
            </div>
            <div class="dash-card-body">
                <div id="analytics-charts">
                    <div class="loading-container"><div class="spinner"></div><p>Loading analytics...</p></div>
                </div>
            </div>
        </div>
    `;

    window._loadAttendanceAnalytics = loadAttendanceAnalytics;
    window._exportAttendanceAnalytics = exportAttendanceAnalytics;
    window._refreshAnalytics = refreshAnalytics;

    await loadAttendanceAnalytics();
}

// ──────────────────────────────────────────────────────────────────────
// LOAD ATTENDANCE ANALYTICS
// ──────────────────────────────────────────────────────────────────────

async function loadAttendanceAnalytics() {
    const container = document.getElementById('analytics-charts');
    if (!container) return;

    const yearId = document.getElementById('analytics-year')?.value;
    const termId = document.getElementById('analytics-term')?.value;
    const classId = document.getElementById('analytics-class')?.value;
    const period = document.getElementById('analytics-period')?.value || 'month';

    // Update selected year
    if (yearId) {
        selectedYearId = yearId === 'all' ? 'all' : parseInt(yearId);
        if (selectedYearId !== 'all') {
            setYearFilter(selectedYearId);
        } else {
            state.filters.academic_year_id = null;
        }
    }

    container.innerHTML = '<div class="loading-container"><div class="spinner"></div><p>Computing analytics...</p></div>';

    try {
        // Determine date range
        const now = new Date();
        let startDate, endDate = now.toISOString().split('T')[0];

        // If year is selected, use term dates from that year
        let termFilter = '';
        if (selectedYearId && selectedYearId !== 'all') {
            const terms = getTermsByYear(selectedYearId);
            if (terms.length > 0) {
                // Use first term start and last term end
                const firstTerm = terms[0];
                const lastTerm = terms[terms.length - 1];
                if (termId && termId !== 'all') {
                    const selectedTerm = terms.find(t => t.id == termId);
                    if (selectedTerm) {
                        startDate = selectedTerm.start_date || startDate;
                        endDate = selectedTerm.end_date || endDate;
                    }
                } else {
                    startDate = firstTerm.start_date || startDate;
                    endDate = lastTerm.end_date || endDate;
                }
            }
        }

        // Override with period selection
        switch (period) {
            case 'week':
                startDate = new Date(now.getTime() - 7 * 86400000).toISOString().split('T')[0];
                break;
            case 'month':
                startDate = new Date(now.getTime() - 30 * 86400000).toISOString().split('T')[0];
                break;
            case 'term':
                if (!startDate) {
                    startDate = state.currentTerm?.start_date || new Date(now.getTime() - 90 * 86400000).toISOString().split('T')[0];
                }
                break;
            case 'year':
            default:
                if (!startDate) {
                    startDate = state.currentAcadYear?.start_date || new Date(now.getTime() - 365 * 86400000).toISOString().split('T')[0];
                }
                break;
        }

        // Build query with year filter
        let query = `attendance?limit=10000&date=gte.${startDate}&date=lte.${endDate}`;
        if (classId) query += '&class_id=eq.' + classId;
        if (selectedYearId && selectedYearId !== 'all') {
            // Add term filter if we have a specific term
            if (termId && termId !== 'all') {
                const terms = getTermsByYear(selectedYearId);
                const selectedTerm = terms.find(t => t.id == termId);
                if (selectedTerm) {
                    query += `&date=gte.${selectedTerm.start_date}&date=lte.${selectedTerm.end_date}`;
                }
            }
        }

        let records = [];
        try {
            const result = await getAll('attendance', query);
            records = result || [];
        } catch (e) {
            records = [];
        }

        // Get students filtered by year
        let students = (state.students || []).filter(s => s.status === 'Active');
        if (selectedYearId && selectedYearId !== 'all') {
            students = students.filter(s => s.academic_year_id == selectedYearId);
        }
        if (classId) students = students.filter(s => s.class_id == classId);

        // Get year label
        const yearLabel = selectedYearId === 'all' ? 'All Years' : (state.academicYears || []).find(y => y.id === selectedYearId)?.name || 'Current Year';

        if (!records.length) {
            container.innerHTML = `
                <div class="alert alert-info">
                    No attendance records found for ${esc(yearLabel)} in the selected period.
                    <br><small>Try adjusting the filters or adding attendance records.</small>
                </div>
            `;
            return;
        }

        // ── 1. Daily Trend ──
        const dailyData = {};
        const dates = [...new Set(records.map(r => r.date))].sort();

        for (const date of dates) {
            const dayRecords = records.filter(r => r.date === date);
            const present = dayRecords.filter(r => r.status === 'present').length;
            const total = dayRecords.length;
            dailyData[date] = { present, total, rate: total > 0 ? (present / total) * 100 : 0 };
        }

        const dailyLabels = dates.slice(-14);
        const dailyRates = dailyLabels.map(d => dailyData[d]?.rate || 0);

        // ── 2. Day of Week Pattern ──
        const dowNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
        const dowData = {};

        for (const rec of records) {
            const dow = new Date(rec.date + 'T00:00:00').getDay();
            const dowName = dowNames[dow === 0 ? 6 : dow - 1];
            if (!dowData[dowName]) dowData[dowName] = { present: 0, total: 0 };
            dowData[dowName].total++;
            if (rec.status === 'present') dowData[dowName].present++;
        }

        const dowRates = dowNames.map(d => {
            const data = dowData[d] || { present: 0, total: 0 };
            return { label: d, rate: data.total > 0 ? (data.present / data.total) * 100 : 0 };
        });

        // ── 3. Class Comparison ──
        const classData = {};
        for (const rec of records) {
            const cls = getClassById(rec.class_id);
            const className = cls?.name || 'Unknown';
            if (!classData[className]) classData[className] = { present: 0, total: 0 };
            classData[className].total++;
            if (rec.status === 'present') classData[className].present++;
        }

        const classRates = Object.entries(classData)
            .map(([name, data]) => ({
                label: name,
                rate: data.total > 0 ? (data.present / data.total) * 100 : 0,
            }))
            .sort((a, b) => a.rate - b.rate);

        // ── 4. Year-over-Year Comparison ──
        let yearComparison = [];
        if (selectedYearId !== 'all' && selectedYearId) {
            const currentYearData = records;
            const currentRate = records.length > 0 ? (records.filter(r => r.status === 'present').length / records.length) * 100 : 0;

            const prevYearId = parseInt(selectedYearId) - 1;
            if (prevYearId > 0) {
                let prevQuery = `attendance?limit=10000&date=gte.${startDate}&date=lte.${endDate}`;
                if (classId) prevQuery += '&class_id=eq.' + classId;
                // Adjust dates for previous year
                const prevStart = new Date(startDate);
                prevStart.setFullYear(prevStart.getFullYear() - 1);
                const prevEnd = new Date(endDate);
                prevEnd.setFullYear(prevEnd.getFullYear() - 1);
                prevQuery = `attendance?limit=10000&date=gte.${prevStart.toISOString().split('T')[0]}&date=lte.${prevEnd.toISOString().split('T')[0]}`;
                if (classId) prevQuery += '&class_id=eq.' + classId;

                let prevRecords = [];
                try {
                    const result = await getAll('attendance', prevQuery);
                    prevRecords = result || [];
                } catch (e) {
                    prevRecords = [];
                }

                const prevRate = prevRecords.length > 0 ? (prevRecords.filter(r => r.status === 'present').length / prevRecords.length) * 100 : 0;
                yearComparison = [
                    { year: 'Previous Year', rate: prevRate, records: prevRecords.length },
                    { year: 'Current Year', rate: currentRate, records: currentYearData.length },
                ];
            }
        }

        // ── 5. Overall Stats ──
        const totalPresent = records.filter(r => r.status === 'present').length;
        const totalAbsent = records.filter(r => r.status === 'absent').length;
        const totalLate = records.filter(r => r.status === 'late').length;
        const totalExcused = records.filter(r => r.status === 'excused').length;
        const overallRate = records.length > 0 ? (totalPresent / records.length) * 100 : 0;

        // ── Build HTML ──
        container.innerHTML = `
            <!-- Year Label -->
            <div style="margin-bottom:12px;padding:8px 12px;background:var(--bg-tertiary);border-radius:var(--r-md);display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">
                <span style="font-weight:600;font-size:0.9rem;">📅 ${esc(yearLabel)}</span>
                <span style="font-size:0.75rem;color:var(--text-muted);">
                    ${records.length} records · ${students.length} students
                </span>
            </div>

            <!-- Stats -->
            <div class="stats-grid" style="grid-template-columns:repeat(6,1fr);margin-bottom:16px;">
                <div class="stat-card" style="padding:10px;text-align:center;">
                    <div class="stat-value">${records.length}</div>
                    <div class="stat-label">📋 Records</div>
                </div>
                <div class="stat-card" style="padding:10px;text-align:center;background:var(--success-bg);">
                    <div class="stat-value" style="color:var(--success);">${totalPresent}</div>
                    <div class="stat-label">✅ Present</div>
                </div>
                <div class="stat-card" style="padding:10px;text-align:center;background:var(--danger-bg);">
                    <div class="stat-value" style="color:var(--danger);">${totalAbsent}</div>
                    <div class="stat-label">❌ Absent</div>
                </div>
                <div class="stat-card" style="padding:10px;text-align:center;background:var(--warning-bg);">
                    <div class="stat-value" style="color:var(--warning);">${totalLate}</div>
                    <div class="stat-label">⏰ Late</div>
                </div>
                <div class="stat-card" style="padding:10px;text-align:center;background:var(--info-bg);">
                    <div class="stat-value" style="color:var(--info);">${totalExcused}</div>
                    <div class="stat-label">📋 Excused</div>
                </div>
                <div class="stat-card" style="padding:10px;text-align:center;">
                    <div class="stat-value" style="color:${overallRate >= 85 ? 'var(--success)' : overallRate >= 75 ? 'var(--warning)' : 'var(--danger)'};">${overallRate.toFixed(1)}%</div>
                    <div class="stat-label">📊 Overall Rate</div>
                </div>
            </div>

            <!-- Year-over-Year Comparison -->
            ${yearComparison.length > 1 ? `
                <div class="dash-card" style="margin-bottom:16px;">
                    <div class="dash-card-header" style="padding:8px 12px;">
                        <span style="font-weight:600;font-size:0.85rem;">📊 Year-over-Year Comparison</span>
                    </div>
                    <div class="dash-card-body" style="padding:8px 12px;">
                        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
                            ${yearComparison.map((y, i) => `
                                <div style="padding:12px;background:${i === yearComparison.length - 1 ? 'var(--role-light)' : 'var(--bg-tertiary)'};border-radius:8px;text-align:center;">
                                    <div style="font-size:0.7rem;color:var(--text-muted);">${esc(y.year)}</div>
                                    <div style="font-size:1.3rem;font-weight:700;color:${y.rate >= 85 ? 'var(--success)' : y.rate >= 75 ? 'var(--warning)' : 'var(--danger)'};">${y.rate.toFixed(1)}%</div>
                                    <div style="font-size:0.65rem;color:var(--text-muted);">${y.records} records</div>
                                </div>
                            `).join('')}
                        </div>
                        ${yearComparison.length === 2 ? `
                            <div style="text-align:center;margin-top:8px;font-size:0.8rem;">
                                ${yearComparison[1].rate - yearComparison[0].rate > 0 ? '📈' : '📉'} 
                                ${(yearComparison[1].rate - yearComparison[0].rate).toFixed(1)}% from previous year
                            </div>
                        ` : ''}
                    </div>
                </div>
            ` : ''}

            <!-- Daily Trend -->
            <div class="dash-card" style="margin-bottom:16px;">
                <div class="dash-card-header" style="padding:8px 12px;">
                    <span style="font-weight:600;font-size:0.85rem;">📈 Daily Attendance Trend (Last 14 Days)</span>
                </div>
                <div class="dash-card-body" style="padding:8px 12px;">
                    <div style="display:flex;align-items:flex-end;height:120px;gap:4px;padding:8px 0;">
                        ${dailyLabels.map((date, i) => {
            const rate = dailyRates[i] || 0;
            const height = Math.max(4, (rate / 100) * 100);
            const color = rate >= 85 ? '#10b981' : rate >= 75 ? '#f59e0b' : '#ef4444';
            return `
                                <div style="flex:1;display:flex;flex-direction:column;align-items:center;height:100%;justify-content:flex-end;">
                                    <div style="width:100%;height:${height}%;background:${color};border-radius:3px 3px 0 0;min-height:4px;"></div>
                                    <div style="font-size:0.5rem;color:var(--text-muted);margin-top:4px;transform:rotate(-45deg);white-space:nowrap;">${fmtDate(date)}</div>
                                </div>
                            `;
        }).join('')}
                    </div>
                    <div style="display:flex;justify-content:space-between;font-size:0.65rem;color:var(--text-muted);">
                        <span>🟢 ≥85%</span>
                        <span>🟡 75-84%</span>
                        <span>🔴 &lt;75%</span>
                        <span>📊 Average: ${overallRate.toFixed(1)}%</span>
                    </div>
                </div>
            </div>

            <!-- Day of Week Pattern + Class Comparison -->
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px;">
                <div class="dash-card">
                    <div class="dash-card-header" style="padding:8px 12px;">
                        <span style="font-weight:600;font-size:0.85rem;">📊 Day of Week Pattern</span>
                    </div>
                    <div class="dash-card-body" style="padding:8px 12px;">
                        ${asciiHorizontalBar(dowRates.map(d => ({
            label: d.label,
            value: d.rate,
            color: d.rate >= 85 ? '#10b981' : d.rate >= 75 ? '#f59e0b' : '#ef4444'
        })), 25)}
                    </div>
                </div>
                <div class="dash-card">
                    <div class="dash-card-header" style="padding:8px 12px;">
                        <span style="font-weight:600;font-size:0.85rem;">🏛️ Class Comparison</span>
                    </div>
                    <div class="dash-card-body" style="padding:8px 12px;">
                        ${classRates.length ? asciiHorizontalBar(classRates.slice(0, 8).map(d => ({
            label: d.label.length > 12 ? d.label.slice(0, 10) + '…' : d.label,
            value: d.rate,
            color: d.rate >= 85 ? '#10b981' : d.rate >= 75 ? '#f59e0b' : '#ef4444'
        })), 25) : '<div style="text-align:center;padding:20px;color:var(--text-muted);">No class data</div>'}
                    </div>
                </div>
            </div>

            <!-- At-Risk Students -->
            <div class="dash-card">
                <div class="dash-card-header" style="padding:8px 12px;">
                    <span style="font-weight:600;font-size:0.85rem;">⚠️ At-Risk Students (Rate < 75%)</span>
                </div>
                <div class="dash-card-body" style="padding:0;">
                    ${students.length ? (() => {
                const studentRates = students.map(s => {
                    const sRecords = records.filter(r => r.student_id === s.id);
                    const present = sRecords.filter(r => r.status === 'present').length;
                    const total = sRecords.length;
                    const rate = total > 0 ? (present / total) * 100 : 0;
                    return { ...s, rate, total };
                }).filter(s => s.rate < 75 && s.total > 0).sort((a, b) => a.rate - b.rate);

                if (!studentRates.length) {
                    return '<div style="padding:20px;text-align:center;color:var(--text-muted);">🎉 No at-risk students!</div>';
                }

                return `
                            <div class="table-wrapper">
                                <table class="data-table" style="font-size:0.8rem;">
                                    <thead>
                                        <tr>
                                            <th>Student</th>
                                            <th>Code</th>
                                            <th style="text-align:center;">Days</th>
                                            <th style="text-align:center;color:var(--danger);">Absent</th>
                                            <th style="text-align:center;">Rate</th>
                                            <th style="text-align:center;">Action</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        ${studentRates.map(s => {
                    const sRecords = records.filter(r => r.student_id === s.id);
                    const absent = sRecords.filter(r => r.status === 'absent').length;
                    return `
                                                <tr>
                                                    <td><strong>${esc(s.first_name)} ${esc(s.last_name)}</strong></td>
                                                    <td>${esc(s.student_code || '—')}</td>
                                                    <td style="text-align:center;">${s.total}</td>
                                                    <td style="text-align:center;color:var(--danger);">${absent}</td>
                                                    <td style="text-align:center;"><span class="badge badge-danger">${s.rate.toFixed(1)}%</span></td>
                                                    <td style="text-align:center;">
                                                        <button class="btn btn-sm btn-outline" onclick="window.navigateToWithData('student-details',{student_id:${s.id}})" style="padding:2px 8px;font-size:0.7rem;">👁️ View</button>
                                                    </td>
                                                </tr>
                                            `;
                }).join('')}
                                    </tbody>
                                </table>
                            </div>
                        `;
            })() : '<div style="padding:20px;text-align:center;color:var(--text-muted);">No students</div>'}
                </div>
            </div>
        `;

        window._attAnalyticsData = { records, overallRate, dailyData, dowData, classData, yearLabel };

    } catch (error) {
        container.innerHTML = `<div class="alert alert-danger">Error loading analytics: ${esc(error.message)}</div>`;
    }
}

// ──────────────────────────────────────────────────────────────────────
// EXPORT ATTENDANCE ANALYTICS
// ──────────────────────────────────────────────────────────────────────

function exportAttendanceAnalytics() {
    const data = window._attAnalyticsData;
    if (!data) {
        showToast('Load analytics first', 'warning');
        return;
    }

    const yearLabel = data.yearLabel || 'Current Year';

    const rows = data.records.map(r => {
        const student = getStudentById(r.student_id);
        const cls = getClassById(r.class_id);
        return {
            'Date': r.date,
            'Student': student ? `${student.first_name} ${student.last_name}` : '—',
            'Class': cls?.name || '—',
            'Status': r.status,
            'Notes': r.notes || '',
            'Recorded By': r.recorded_by || '',
            'Academic Year': yearLabel,
        };
    });

    exportToExcel(rows, `Attendance_Analytics_${yearLabel.replace(/\s/g, '_')}_${new Date().toISOString().split('T')[0]}`);
    showToast('✅ Attendance analytics exported', 'success');
}

// ──────────────────────────────────────────────────────────────────────
// REFRESH ANALYTICS
// ──────────────────────────────────────────────────────────────────────

async function refreshAnalytics() {
    await refreshTable('attendance');
    await loadAttendanceAnalytics();
    showToast('🔄 Refreshed', 'info', 1000);
} 