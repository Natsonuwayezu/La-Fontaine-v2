/**
 * ECOLE LA FONTAINE — ASCII Charts
 * All charts use ASCII characters — no Chart.js dependency
 * Last updated: 2026-07-03
 * 
 * CHANGES:
 * - Added getCurrentYearData() for year-aware charts
 * - Charts now use data from selected academic year
 * - Added year indicator in chart titles
 * - Added functions for year-specific chart data
 */

import {
    state,
    getCurrentAcademicYear,
    getActiveAcademicYearId,
    getCurrentYearData,
    getCurrentYearStudents,
    getCurrentYearMarks
} from '../core/state.js';
import { esc } from '../core/utils.js';
import { getGrade } from '../core/formulas.js';

// ──────────────────────────────────────────────────────────────────────
// HORIZONTAL BAR CHART
// ──────────────────────────────────────────────────────────────────────

/**
 * Generate an ASCII horizontal bar chart
 * @param {Array} data - Array of {label, value, color?} objects
 * @param {number} maxWidth - Maximum width in characters
 * @param {string} filledChar - Character for filled portion (default '█')
 * @param {string} emptyChar - Character for empty portion (default '░')
 * @returns {string} ASCII chart HTML
 */
export function asciiHorizontalBar(data, maxWidth = 40, filledChar = '█', emptyChar = '░') {
    const maxValue = Math.max(...data.map(d => d.value), 1);
    const bars = data.map(d => {
        const width = Math.round((d.value / maxValue) * maxWidth);
        const bar = filledChar.repeat(width) + emptyChar.repeat(maxWidth - width);
        const pct = (d.value / maxValue * 100).toFixed(0);
        const color = d.color || '';
        return `<div style="display:flex;align-items:center;gap:8px;margin:2px 0;">
            <span style="min-width:120px;font-size:0.8rem;">${esc(d.label)}</span>
            <span style="flex:1;font-family:monospace;font-size:0.8rem;${color ? 'color:' + color : ''}">${bar}</span>
            <span style="min-width:40px;text-align:right;font-size:0.75rem;font-weight:600;">${pct}%</span>
        </div>`;
    }).join('');
    return `<div style="padding:4px 0;">${bars}</div>`;
}

// ──────────────────────────────────────────────────────────────────────
// VERTICAL BAR CHART
// ──────────────────────────────────────────────────────────────────────

/**
 * Generate an ASCII vertical bar chart
 * @param {Array} data - Array of {label, value, color?} objects
 * @param {number} maxHeight - Maximum height in characters
 * @param {string} barChar - Character for bars (default '▓')
 * @returns {string} ASCII chart HTML
 */
export function asciiVerticalBar(data, maxHeight = 8, barChar = '▓') {
    const maxValue = Math.max(...data.map(d => d.value), 1);
    const scaled = data.map(d => Math.round((d.value / maxValue) * maxHeight));

    let html = '<div style="font-family:monospace;font-size:0.7rem;text-align:center;">';
    for (let row = maxHeight; row > 0; row--) {
        html += '<div style="display:flex;justify-content:center;gap:4px;">';
        for (const d of scaled) {
            const isFilled = d >= row;
            const color = data[scaled.indexOf(d)]?.color || '';
            html += `<span style="${color ? 'color:' + color : ''}">${isFilled ? barChar : ' '}</span>`;
        }
        html += '</div>';
    }
    html += '<div style="display:flex;justify-content:center;gap:4px;margin-top:4px;">';
    for (const d of data) {
        html += `<span style="font-size:0.6rem;">${esc(d.label)}</span>`;
    }
    html += '</div></div>';
    return html;
}

// ──────────────────────────────────────────────────────────────────────
// GRADE DISTRIBUTION CHART
// ──────────────────────────────────────────────────────────────────────

/**
 * Generate a grade distribution chart for current year data
 * @param {object} distribution - { A+: count, A: count, ... }
 * @param {number} maxWidth - Maximum width in characters
 * @param {number} yearId - Academic year ID (optional)
 * @returns {string} ASCII chart HTML
 */
export function gradeDistributionChart(distribution, maxWidth = 30, yearId = null) {
    // If no distribution provided, calculate from current year data
    if (!distribution) {
        distribution = calculateGradeDistribution(yearId);
    }

    const grades = ['A+', 'A', 'B', 'C', 'D', 'F'];
    const colors = ['#10b981', '#34d399', '#60a5fa', '#fbbf24', '#f97316', '#ef4444'];
    const total = Object.values(distribution).reduce((a, b) => a + b, 0);

    const data = grades.map((g, i) => ({
        label: g,
        value: distribution[g] || 0,
        color: colors[i],
        pct: total > 0 ? (distribution[g] || 0) / total * 100 : 0,
    }));

    const maxValue = Math.max(...data.map(d => d.value), 1);
    const bars = data.map(d => {
        const width = Math.round((d.value / maxValue) * maxWidth);
        const bar = '█'.repeat(width) + '░'.repeat(maxWidth - width);
        return `<div style="display:flex;align-items:center;gap:8px;margin:2px 0;">
            <span style="min-width:30px;font-weight:700;color:${d.color};">${d.label}</span>
            <span style="flex:1;font-family:monospace;font-size:0.8rem;color:${d.color};">${bar}</span>
            <span style="min-width:40px;text-align:right;font-size:0.75rem;font-weight:600;">${d.pct.toFixed(1)}%</span>
            <span style="min-width:50px;text-align:right;font-size:0.7rem;color:var(--text-muted);">(${d.value})</span>
        </div>`;
    }).join('');

    const year = getYearLabel(yearId);
    const yearLabel = year ? ` — ${year}` : '';

    return `
        <div style="padding:4px 0;">
            <div style="font-size:0.7rem;color:var(--text-muted);margin-bottom:6px;">📅 Grade Distribution${yearLabel}</div>
            ${bars}
        </div>
    `;
}

// ──────────────────────────────────────────────────────────────────────
// PROGRESS BAR
// ──────────────────────────────────────────────────────────────────────

/**
 * Generate a simple progress bar
 * @param {number} pct - Percentage (0-100)
 * @param {number} width - Width in characters
 * @param {string} color - Optional color
 * @returns {string} ASCII progress bar
 */
export function progressBar(pct, width = 20, color = '') {
    const filled = Math.round((pct / 100) * width);
    const bar = '█'.repeat(filled) + '░'.repeat(width - filled);
    const colorStyle = color ? `style="color:${color};"` : '';
    return `<span font-family:monospace;font-size:0.8rem;${colorStyle}>${bar}</span> <span style="font-size:0.75rem;font-weight:600;">${pct.toFixed(1)}%</span>`;
}

// ──────────────────────────────────────────────────────────────────────
// TREND INDICATOR
// ──────────────────────────────────────────────────────────────────────

/**
 * Generate a trend indicator (up/down/stable)
 * @param {number} change - Percentage change
 * @returns {string} Trend HTML
 */
export function trendIndicator(change) {
    if (change > 0) return `<span style="color:var(--success);">📈 +${change.toFixed(1)}%</span>`;
    if (change < 0) return `<span style="color:var(--danger);">📉 ${change.toFixed(1)}%</span>`;
    return `<span style="color:var(--text-muted);">➡️ 0%</span>`;
}

// ──────────────────────────────────────────────────────────────────────
// YEAR-AWARE CHART DATA HELPERS
// ──────────────────────────────────────────────────────────────────────

/**
 * Get the label for a year ID
 * @param {number} yearId - Academic year ID
 * @returns {string} Year label
 */
function getYearLabel(yearId) {
    if (!yearId) {
        const activeYear = getCurrentAcademicYear();
        return activeYear?.name || 'Current Year';
    }
    const year = (state.academicYears || []).find(y => y.id === yearId);
    return year?.name || 'Unknown Year';
}

/**
 * Calculate grade distribution for a specific year
 * @param {number} yearId - Academic year ID (optional, uses current if not provided)
 * @returns {object} Grade distribution
 */
export function calculateGradeDistribution(yearId = null) {
    const distribution = { 'A+': 0, 'A': 0, 'B': 0, 'C': 0, 'D': 0, 'F': 0 };

    // Get marks for the specified year
    let marks = state.marks || [];
    if (yearId) {
        marks = marks.filter(m => m.academic_year_id == yearId && !m.is_archived);
    } else {
        // Use current year filter
        marks = getCurrentYearMarks();
    }

    if (!marks.length) return distribution;

    // Get assessments for max marks
    const assessmentIds = [...new Set(marks.map(m => m.assessment_id))];
    const assessments = (state.assessments || []).filter(a => assessmentIds.includes(a.id));

    // Calculate percentages and grade each mark
    for (const mark of marks) {
        const assessment = assessments.find(a => a.id === mark.assessment_id);
        if (!assessment) continue;

        const pct = assessment.max_marks > 0 ? (mark.score / assessment.max_marks) * 100 : 0;
        const grade = getGrade(pct);
        if (distribution[grade] !== undefined) {
            distribution[grade]++;
        }
    }

    return distribution;
}

/**
 * Get class performance data for a specific year
 * @param {number} yearId - Academic year ID (optional)
 * @returns {Array} Class performance data
 */
export function getClassPerformanceData(yearId = null) {
    const year = yearId || state.filters?.academic_year_id || state.currentAcadYear?.id;
    const classes = (state.classes || []).filter(c => c.is_active !== false);

    return classes.map(cls => {
        const students = (state.students || [])
            .filter(s => s.class_id === cls.id && s.status === 'Active' && (year ? s.academic_year_id == year : true));

        const assessments = (state.assessments || [])
            .filter(a => a.class_id === cls.id && (year ? a.academic_year_id == year : true));

        let totalPct = 0;
        let count = 0;

        for (const student of students) {
            let score = 0, max = 0;
            const studentMarks = (state.marks || [])
                .filter(m => m.student_id === student.id && (year ? m.academic_year_id == year : true) && !m.is_archived);

            for (const assessment of assessments) {
                const mark = studentMarks.find(m => m.assessment_id === assessment.id);
                if (mark) {
                    score += mark.score;
                    max += assessment.max_marks;
                }
            }

            if (max > 0) {
                totalPct += (score / max) * 100;
                count++;
            }
        }

        const avg = count > 0 ? totalPct / count : 0;
        return {
            label: cls.name,
            value: avg,
            color: avg >= 80 ? '#10b981' : avg >= 60 ? '#f59e0b' : '#ef4444',
            students: count,
        };
    }).filter(d => d.students > 0);
}

/**
 * Get fee collection data for a specific year
 * @param {number} yearId - Academic year ID (optional)
 * @returns {Array} Fee collection data
 */
export function getFeeCollectionData(yearId = null) {
    const year = yearId || state.filters?.academic_year_id || state.currentAcadYear?.id;
    const classes = (state.classes || []).filter(c => c.is_active !== false);

    return classes.map(cls => {
        const students = (state.students || [])
            .filter(s => s.class_id === cls.id && s.status === 'Active' && (year ? s.academic_year_id == year : true));

        let totalFees = 0;
        let totalPaid = 0;

        for (const student of students) {
            const fees = (state.studentFees || [])
                .filter(f => f.student_id === student.id && (year ? f.academic_year_id == year : true) && !f.is_waived && !f.is_credit);

            for (const fee of fees) {
                totalFees += fee.amount || 0;
                totalPaid += fee.paid_amount || 0;
            }
        }

        const rate = totalFees > 0 ? (totalPaid / totalFees) * 100 : 0;
        return {
            label: cls.name,
            value: rate,
            color: rate >= 80 ? '#10b981' : rate >= 60 ? '#f59e0b' : '#ef4444',
            expected: totalFees,
            collected: totalPaid,
        };
    }).filter(d => d.expected > 0);
}

/**
 * Get attendance summary for a specific year
 * @param {number} yearId - Academic year ID (optional)
 * @returns {Array} Attendance data
 */
export function getAttendanceData(yearId = null) {
    const year = yearId || state.filters?.academic_year_id || state.currentAcadYear?.id;
    const classes = (state.classes || []).filter(c => c.is_active !== false);

    // Try to get attendance records
    let attendanceRecords = state.attendance || [];
    if (year) {
        const terms = (state.terms || []).filter(t => t.academic_year_id == year);
        const termIds = terms.map(t => t.id);
        attendanceRecords = attendanceRecords.filter(a => termIds.includes(a.term_id));
    }

    return classes.map(cls => {
        const students = (state.students || [])
            .filter(s => s.class_id === cls.id && s.status === 'Active' && (year ? s.academic_year_id == year : true));

        const classAttendance = attendanceRecords.filter(a => a.class_id === cls.id);
        const totalDays = classAttendance.length > 0 ? [...new Set(classAttendance.map(a => a.date))].length : 0;
        let presentCount = 0;

        for (const student of students) {
            const studentAttendance = classAttendance.filter(a => a.student_id === student.id);
            const present = studentAttendance.filter(a => a.status === 'present' || a.status === 'late').length;
            presentCount += present;
        }

        const totalPossible = students.length * totalDays;
        const rate = totalPossible > 0 ? (presentCount / totalPossible) * 100 : 0;

        return {
            label: cls.name,
            value: rate,
            color: rate >= 85 ? '#10b981' : rate >= 75 ? '#f59e0b' : '#ef4444',
            students: students.length,
            days: totalDays,
        };
    }).filter(d => d.days > 0);
}

// ──────────────────────────────────────────────────────────────────────
// CHART WITH YEAR HEADER
// ──────────────────────────────────────────────────────────────────────

/**
 * Wrap a chart with a year header
 * @param {string} title - Chart title
 * @param {string} chartHtml - Chart HTML
 * @param {number} yearId - Academic year ID (optional)
 * @returns {string} Wrapped chart HTML
 */
export function chartWithYear(title, chartHtml, yearId = null) {
    const year = getYearLabel(yearId);
    const yearLabel = year ? ` — ${year}` : '';
    const isActive = yearId ? (state.academicYears || []).find(y => y.id === yearId)?.is_active : true;
    const statusIcon = isActive ? '🟢' : '🔒';

    return `
        <div style="margin-bottom:12px;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
                <span style="font-weight:600;font-size:0.85rem;">${esc(title)}</span>
                <span style="font-size:0.65rem;color:var(--text-muted);">${statusIcon} ${yearLabel}</span>
            </div>
            ${chartHtml}
        </div>
    `;
}

// ──────────────────────────────────────────────────────────────────────
// EXPOSE GLOBALLY
// ──────────────────────────────────────────────────────────────────────

window.asciiHorizontalBar = asciiHorizontalBar;
window.asciiVerticalBar = asciiVerticalBar;
window.gradeDistributionChart = gradeDistributionChart;
window.progressBar = progressBar;
window.trendIndicator = trendIndicator;
window.calculateGradeDistribution = calculateGradeDistribution;
window.getClassPerformanceData = getClassPerformanceData;
window.getFeeCollectionData = getFeeCollectionData;
window.getAttendanceData = getAttendanceData;
window.chartWithYear = chartWithYear;