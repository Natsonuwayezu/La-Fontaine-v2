/**
 * ECOLE LA FONTAINE — Financial Reports Module
 * Comprehensive financial reports with filters, charts, and exports
 * Last updated: 2026-07-04
 * 
 * CHANGES:
 * - Added academic year filtering
 * - Reports are now year-specific
 * - Year selector in filters
 * - Read-only mode for inactive years
 * - Export includes academic year
 */


const state = window.state || {}; // global state alias
import {
    state,
    getClassById,
    getStudentById,
    getCurrentUser,
    getCurrentAcademicYear,
    getActiveAcademicYearId,
    getYearData
} from '../../core/state.js';
import { esc, fmtCurrency, fmtDate, fmtPct } from '../../core/utils.js';
import { getFullStudentBalance } from '../../core/fees.js';
import { exportToExcel } from '../../core/utils.js';
import { asciiHorizontalBar } from '../../ui/charts.js';

// ──────────────────────────────────────────────────────────────────────
// STATE
// ──────────────────────────────────────────────────────────────────────

let currentReportData = null;
let selectedYearId = null;
let currentFilter = {
    type: 'all',
    classId: null,
    studentId: null,
    categoryId: null,
};

// ──────────────────────────────────────────────────────────────────────
// MAIN RENDER FUNCTION
// ──────────────────────────────────────────────────────────────────────

export async function renderFinancialReports(container) {
    if (!container) return;

    const user = getCurrentUser();
    if (user?.role === 'teacher') {
        container.innerHTML = '<div class="alert alert-danger">Access denied. Teachers cannot view financial reports.</div>';
        return;
    }

    await ensureStateLoaded();

    const classes = (state.classes || []).filter(c => c.is_active !== false);
    const categories = (state.feeCategories || []).filter(c => c.is_active !== false);
    const students = (state.students || []).filter(s => s.status === 'Active');
    const currentYear = getCurrentAcademicYear();
    const years = (state.academicYears || []).sort((a, b) => b.id - a.id);

    // Default to current year
    if (!selectedYearId) {
        selectedYearId = currentYear?.id || null;
    }

    const selectedYear = years.find(y => y.id === selectedYearId);
    const isActiveYear = selectedYear?.is_active === true;
    const isCurrentYear = selectedYear?.id === currentYear?.id;

    container.innerHTML = `
        <div class="dash-card">
            <div class="dash-card-header" style="flex-wrap:wrap;gap:8px;">
                <span class="dash-card-title">📊 Financial Reports</span>
                <div class="btn-group" style="flex-wrap:wrap;gap:6px;">
                    <select id="fr-year-filter" onchange="window._loadFinancialReportsData()" style="padding:6px 10px;border-radius:6px;border:1px solid var(--border-medium);font-size:0.8rem;">
                        ${years.map(y => `
                            <option value="${y.id}" ${y.id === selectedYearId ? 'selected' : ''}>
                                ${esc(y.name)} ${y.id === currentYear?.id ? '🟢' : ''}
                            </option>
                        `).join('')}
                    </select>
                    <button class="btn btn-sm btn-outline" onclick="window._exportFinancialReport()">📥 Export</button>
                    <button class="btn btn-sm btn-outline" onclick="window._printFinancialReport()">🖨️ Print</button>
                    <button class="btn btn-sm btn-outline" onclick="window._resetReportFilters()">↻ Reset</button>
                    ${!isActiveYear ? '<span class="badge badge-neutral" style="font-size:0.65rem;">🔒 Read-only</span>' : ''}
                </div>
            </div>
            <div class="dash-card-body">
                <div style="font-size:0.75rem;color:var(--text-muted);padding:6px 12px;background:var(--bg-tertiary);border-radius:6px;margin-bottom:12px;display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px;">
                    <span>📅 ${selectedYear?.name || 'All Years'} ${isActiveYear ? '🟢 Active' : '🔒 Inactive (Read-Only)'}</span>
                    <span>${isCurrentYear ? '✅ Current Year' : ''}</span>
                </div>

                <div class="filters-bar" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px;margin-bottom:16px;">
                    <div class="form-group" style="margin:0;">
                        <label style="font-size:0.7rem;">Filter Type</label>
                        <select id="report-filter-type" onchange="window._updateReportFilters()" style="padding:6px 10px;border-radius:6px;border:1px solid var(--border-medium);width:100%;">
                            <option value="all">📊 All Students</option>
                            <option value="class">🏛️ By Class</option>
                            <option value="student">👤 By Student</option>
                            <option value="category">🏷️ By Fee Category</option>
                        </select>
                    </div>
                    <div class="form-group" id="filter-class-group" style="margin:0;display:none;">
                        <label style="font-size:0.7rem;">Select Class</label>
                        <select id="report-filter-class" onchange="window._updateReportFilters()" style="padding:6px 10px;border-radius:6px;border:1px solid var(--border-medium);width:100%;">
                            <option value="">All Classes</option>
                            ${classes.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}
                        </select>
                    </div>
                    <div class="form-group" id="filter-student-group" style="margin:0;display:none;">
                        <label style="font-size:0.7rem;">Select Student</label>
                        <select id="report-filter-student" onchange="window._updateReportFilters()" style="padding:6px 10px;border-radius:6px;border:1px solid var(--border-medium);width:100%;">
                            <option value="">All Students</option>
                            ${students.map(s => `<option value="${s.id}">${esc(s.first_name)} ${esc(s.last_name)}</option>`).join('')}
                        </select>
                    </div>
                    <div class="form-group" id="filter-category-group" style="margin:0;display:none;">
                        <label style="font-size:0.7rem;">Select Category</label>
                        <select id="report-filter-category" onchange="window._updateReportFilters()" style="padding:6px 10px;border-radius:6px;border:1px solid var(--border-medium);width:100%;">
                            <option value="">All Categories</option>
                            ${categories.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}
                        </select>
                    </div>
                    <div style="display:flex;align-items:flex-end;gap:8px;">
                        <button class="btn btn-primary" onclick="window._generateFinancialReport()" style="padding:6px 16px;">📊 Generate</button>
                    </div>
                </div>
                <div id="financial-report-content">
                    <div class="alert alert-info" style="text-align:center;padding:40px;">Select filters and click Generate to view report</div>
                </div>
            </div>
        </div>
    `;

    window._updateReportFilters = updateReportFilters;
    window._generateFinancialReport = generateFinancialReport;
    window._exportFinancialReport = exportFinancialReport;
    window._printFinancialReport = printFinancialReport;
    window._resetReportFilters = resetReportFilters;
    window._loadFinancialReportsData = loadFinancialReportsData;

    updateReportFilters();
}

// ──────────────────────────────────────────────────────────────────────
// LOAD FINANCIAL REPORTS DATA (Year Change Handler)
// ──────────────────────────────────────────────────────────────────────

async function loadFinancialReportsData() {
    const yearId = document.getElementById('fr-year-filter')?.value;
    if (yearId) {
        selectedYearId = parseInt(yearId);
        renderFinancialReports(document.getElementById('dynamic-content'));
    }
}

// ──────────────────────────────────────────────────────────────────────
// UPDATE REPORT FILTERS
// ──────────────────────────────────────────────────────────────────────

function updateReportFilters() {
    const type = document.getElementById('report-filter-type')?.value;
    const classGroup = document.getElementById('filter-class-group');
    const studentGroup = document.getElementById('filter-student-group');
    const categoryGroup = document.getElementById('filter-category-group');

    if (classGroup) classGroup.style.display = type === 'class' ? 'block' : 'none';
    if (studentGroup) studentGroup.style.display = type === 'student' ? 'block' : 'none';
    if (categoryGroup) categoryGroup.style.display = type === 'category' ? 'block' : 'none';

    currentFilter.type = type || 'all';
}

// ──────────────────────────────────────────────────────────────────────
// GENERATE FINANCIAL REPORT
// ──────────────────────────────────────────────────────────────────────

async function generateFinancialReport() {
    const container = document.getElementById('financial-report-content');
    if (!container) return;

    const filterType = document.getElementById('report-filter-type')?.value || 'all';
    const classId = document.getElementById('report-filter-class')?.value;
    const studentId = document.getElementById('report-filter-student')?.value;
    const categoryId = document.getElementById('report-filter-category')?.value;
    const yearId = document.getElementById('fr-year-filter')?.value || selectedYearId;

    currentFilter.type = filterType;
    currentFilter.classId = classId || null;
    currentFilter.studentId = studentId || null;
    currentFilter.categoryId = categoryId || null;

    // Update selected year
    if (yearId) {
        selectedYearId = parseInt(yearId);
    }

    container.innerHTML = '<div class="loading-container"><div class="spinner"></div><p>Generating report...</p></div>';

    try {
        // Get students for selected year
        let students = (state.students || [])
            .filter(s => s.status === 'Active' && !s.is_deleted);

        // Filter by academic year
        if (selectedYearId) {
            students = students.filter(s => s.academic_year_id == selectedYearId);
        }

        // Apply additional filters
        if (filterType === 'class' && classId) {
            students = students.filter(s => s.class_id == classId);
        } else if (filterType === 'student' && studentId) {
            students = students.filter(s => s.id == studentId);
        }

        if (!students.length) {
            container.innerHTML = `<div class="alert alert-info">No students found for ${(state.academicYears || []).find(y => y.id === selectedYearId)?.name || 'selected year'} with the selected filters.</div>`;
            return;
        }

        // Calculate financial data
        let totalFees = 0, totalPaid = 0, totalWaived = 0;
        const studentData = [];

        for (const student of students) {
            let fees = (state.studentFees || []).filter(f =>
                f.student_id === student.id &&
                !f.is_credit &&
                !f.manually_deleted &&
                f.academic_year_id == selectedYearId
            );

            if (filterType === 'category' && categoryId) {
                fees = fees.filter(f => f.fee_category_id == categoryId);
            }

            const total = fees.reduce((a, f) => a + (f.is_waived ? (f.paid_amount || 0) : f.amount), 0);
            const paid = fees.reduce((a, f) => a + (f.paid_amount || 0), 0);
            const waived = fees.filter(f => f.is_waived).reduce((a, f) => a + f.amount, 0);
            const balance = Math.max(0, total - paid);
            const pct = total > 0 ? (paid / total) * 100 : 100;
            const cls = getClassById(student.class_id);

            totalFees += total;
            totalPaid += paid;
            totalWaived += waived;

            studentData.push({
                student,
                class: cls,
                total,
                paid,
                balance,
                waived,
                pct,
                feeCount: fees.length,
                status: balance === 0 ? 'paid' : (paid > 0 ? 'partial' : 'unpaid'),
            });
        }

        // Sort by balance descending
        studentData.sort((a, b) => b.balance - a.balance);

        const overallRate = totalFees > 0 ? (totalPaid / totalFees) * 100 : 0;
        const paidCount = studentData.filter(s => s.status === 'paid').length;
        const partialCount = studentData.filter(s => s.status === 'partial').length;
        const unpaidCount = studentData.filter(s => s.status === 'unpaid').length;

        const yearName = (state.academicYears || []).find(y => y.id === selectedYearId)?.name || 'Current Year';

        // Build HTML
        container.innerHTML = `
            <!-- Summary Stats -->
            <div class="stats-grid" style="grid-template-columns:repeat(7,1fr);margin-bottom:16px;">
                <div class="stat-card" style="padding:12px;text-align:center;">
                    <div class="stat-value">${students.length}</div>
                    <div class="stat-label">👥 Students</div>
                </div>
                <div class="stat-card" style="padding:12px;text-align:center;">
                    <div class="stat-value">${fmtCurrency(totalFees)}</div>
                    <div class="stat-label">💰 Total Fees</div>
                </div>
                <div class="stat-card" style="padding:12px;text-align:center;background:var(--success-bg);">
                    <div class="stat-value" style="color:var(--success);">${fmtCurrency(totalPaid)}</div>
                    <div class="stat-label">✅ Collected</div>
                </div>
                <div class="stat-card" style="padding:12px;text-align:center;background:var(--danger-bg);">
                    <div class="stat-value" style="color:var(--danger);">${fmtCurrency(totalFees - totalPaid)}</div>
                    <div class="stat-label">🔴 Outstanding</div>
                </div>
                <div class="stat-card" style="padding:12px;text-align:center;">
                    <div class="stat-value" style="color:${overallRate >= 80 ? 'var(--success)' : overallRate >= 60 ? 'var(--warning)' : 'var(--danger)'};">${overallRate.toFixed(1)}%</div>
                    <div class="stat-label">📊 Collection Rate</div>
                </div>
                <div class="stat-card" style="padding:12px;text-align:center;background:var(--info-bg);">
                    <div class="stat-value" style="color:var(--info);">${fmtCurrency(totalWaived)}</div>
                    <div class="stat-label">🎁 Waived</div>
                </div>
                <div class="stat-card" style="padding:12px;text-align:center;background:var(--bg-tertiary);">
                    <div class="stat-value" style="font-size:0.8rem;font-weight:400;">${esc(yearName)}</div>
                    <div class="stat-label">📅 Year</div>
                </div>
            </div>

            <!-- Status Distribution -->
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px;">
                <div class="dash-card">
                    <div class="dash-card-header" style="padding:8px 12px;">
                        <span style="font-weight:600;font-size:0.85rem;">📊 Payment Status</span>
                    </div>
                    <div class="dash-card-body" style="padding:8px 12px;">
                        <div style="display:flex;gap:12px;flex-wrap:wrap;">
                            <div><span style="color:var(--success);">✅ Paid:</span> ${paidCount} (${(paidCount / students.length * 100).toFixed(1)}%)</div>
                            <div><span style="color:var(--warning);">🟡 Partial:</span> ${partialCount} (${(partialCount / students.length * 100).toFixed(1)}%)</div>
                            <div><span style="color:var(--danger);">❌ Unpaid:</span> ${unpaidCount} (${(unpaidCount / students.length * 100).toFixed(1)}%)</div>
                        </div>
                        <div style="margin-top:8px;background:var(--border-light);border-radius:99px;height:8px;overflow:hidden;display:flex;">
                            <div style="width:${(paidCount / students.length * 100)}%;background:var(--success);height:100%;"></div>
                            <div style="width:${(partialCount / students.length * 100)}%;background:var(--warning);height:100%;"></div>
                            <div style="width:${(unpaidCount / students.length * 100)}%;background:var(--danger);height:100%;"></div>
                        </div>
                    </div>
                </div>
                <div class="dash-card">
                    <div class="dash-card-header" style="padding:8px 12px;">
                        <span style="font-weight:600;font-size:0.85rem;">🏛️ Collection by Class</span>
                    </div>
                    <div class="dash-card-body" style="padding:8px 12px;">
                        ${(() => {
                const classData = {};
                for (const d of studentData) {
                    const name = d.class?.name || 'Unknown';
                    if (!classData[name]) classData[name] = { total: 0, paid: 0 };
                    classData[name].total += d.total;
                    classData[name].paid += d.paid;
                }
                const classRates = Object.entries(classData).map(([name, data]) => ({
                    label: name,
                    rate: data.total > 0 ? (data.paid / data.total) * 100 : 0,
                })).sort((a, b) => a.rate - b.rate);
                return classRates.length ? asciiHorizontalBar(classRates, 25) : '<div style="text-align:center;padding:20px;color:var(--text-muted);">No class data</div>';
            })()}
                    </div>
                </div>
            </div>

            <!-- Detailed Table -->
            <div class="dash-card">
                <div class="dash-card-header" style="padding:8px 12px;">
                    <span style="font-weight:600;font-size:0.85rem;">📋 Student Fee Details — ${esc(yearName)}</span>
                    <span style="font-size:0.7rem;color:var(--text-muted);">${studentData.length} students</span>
                </div>
                <div class="dash-card-body" style="padding:0;">
                    <div class="table-wrapper">
                        <table class="data-table" style="font-size:0.8rem;">
                            <thead>
                                <tr>
                                    <th>Student</th>
                                    <th>Code</th>
                                    <th>Class</th>
                                    <th style="text-align:right;">Total</th>
                                    <th style="text-align:right;">Paid</th>
                                    <th style="text-align:right;">Balance</th>
                                    <th style="text-align:center;">%</th>
                                    <th style="text-align:center;">Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${studentData.map(d => {
                const statusClass = d.status === 'paid' ? 'badge-success' : d.status === 'partial' ? 'badge-warning' : 'badge-danger';
                const statusText = d.status === 'paid' ? '✅ Paid' : d.status === 'partial' ? '🟡 Partial' : '❌ Unpaid';
                return `
                                        <tr>
                                            <td><strong>${esc(d.student.first_name)} ${esc(d.student.last_name)}</strong></td>
                                            <td>${esc(d.student.student_code || '—')}</td>
                                            <td>${esc(d.class?.name || '—')}</td>
                                            <td style="text-align:right;">${fmtCurrency(d.total)}</td>
                                            <td style="text-align:right;color:var(--success);">${fmtCurrency(d.paid)}</td>
                                            <td style="text-align:right;${d.balance > 0 ? 'color:var(--danger);font-weight:600;' : 'color:var(--success);'}">${fmtCurrency(d.balance)}</td>
                                            <td style="text-align:center;">${d.pct.toFixed(0)}%</td>
                                            <td style="text-align:center;"><span class="badge ${statusClass}">${statusText}</span></td>
                                        </tr>
                                    `;
            }).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        `;

        currentReportData = {
            studentData,
            totalFees,
            totalPaid,
            totalWaived,
            overallRate,
            yearName,
            selectedYearId,
            studentsCount: students.length
        };

    } catch (error) {
        container.innerHTML = `<div class="alert alert-danger">Error generating report: ${esc(error.message)}</div>`;
    }
}

// ──────────────────────────────────────────────────────────────────────
// EXPORT FINANCIAL REPORT
// ──────────────────────────────────────────────────────────────────────

function exportFinancialReport() {
    if (!currentReportData) {
        showToast('Generate a report first', 'warning');
        return;
    }

    const yearName = currentReportData.yearName || 'All Years';

    const data = currentReportData.studentData.map(d => ({
        'Student': `${d.student.first_name} ${d.student.last_name}`,
        'Student Code': d.student.student_code || '',
        'Class': d.class?.name || '',
        'Total Fees (RWF)': d.total,
        'Paid (RWF)': d.paid,
        'Balance (RWF)': d.balance,
        'Waived (RWF)': d.waived,
        'Payment %': d.pct.toFixed(1),
        'Status': d.status === 'paid' ? 'Paid' : d.status === 'partial' ? 'Partial' : 'Unpaid',
        'Fee Count': d.feeCount,
        'Academic Year': yearName,
    }));

    const filename = `Financial_Report_${yearName.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}`;
    exportToExcel(data, filename);
    showToast('✅ Financial report exported', 'success');
}

// ──────────────────────────────────────────────────────────────────────
// PRINT FINANCIAL REPORT
// ──────────────────────────────────────────────────────────────────────

function printFinancialReport() {
    const container = document.getElementById('financial-report-content');
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
    const yearName = currentReportData?.yearName || '';

    printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Financial Report${yearName ? ' - ' + yearName : ''}</title>
            <style>
                body { font-family: Arial, sans-serif; padding: 20px; }
                table { width: 100%; border-collapse: collapse; font-size: 10px; }
                th, td { border: 1px solid #ccc; padding: 4px 6px; }
                th { background: #1a3a5c; color: white; }
                h1, h2 { text-align: center; color: #1a3a5c; }
                .badge { display: inline-block; padding: 1px 6px; border-radius: 10px; font-size: 8px; font-weight: 600; }
                .badge-success { background: #d1fae5; color: #065f46; }
                .badge-warning { background: #fef3c7; color: #92400e; }
                .badge-danger { background: #fee2e2; color: #991b1b; }
                .stat-card { padding: 8px; text-align: center; background: #f8fafc; border-radius: 4px; }
                .year-label { text-align: center; font-size: 14px; color: #64748b; margin-bottom: 16px; }
                @media print { body { padding: 0; } }
            </style>
        </head>
        <body>
            <h1>${esc(school.school_name || 'ECOLE LA FONTAINE')}</h1>
            <h2>Financial Report</h2>
            ${yearName ? `<div class="year-label">📅 ${esc(yearName)}</div>` : ''}
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
// RESET REPORT FILTERS
// ──────────────────────────────────────────────────────────────────────

function resetReportFilters() {
    document.getElementById('report-filter-type').value = 'all';
    document.getElementById('report-filter-class').value = '';
    document.getElementById('report-filter-student').value = '';
    document.getElementById('report-filter-category').value = '';
    // Don't reset year filter
    updateReportFilters();
    document.getElementById('financial-report-content').innerHTML = '<div class="alert alert-info" style="text-align:center;padding:40px;">Filters reset. Click Generate to view report.</div>';
    showToast('Filters reset', 'info', 1500);
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
window._updateReportFilters = updateReportFilters;
window._generateFinancialReport = generateFinancialReport;
window._exportFinancialReport = exportFinancialReport;
window._printFinancialReport = printFinancialReport;
window._resetReportFilters = resetReportFilters;
window._loadFinancialReportsData = loadFinancialReportsData;