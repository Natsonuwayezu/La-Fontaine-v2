/**
 * ECOLE LA FONTAINE — Charts Module
 * Supports both ASCII charts (no dependencies) and Chart.js (interactive)
 * Last updated: 2026-07-07
 */

import { state, getCurrentYearData } from '../core/state.js';
import { getGrade } from '../core/formulas.js';
import { esc } from '../core/utils.js';

// ──────────────────────────────────────────────────────────────────────
// ASCII CHARTS (No Dependencies)
// ──────────────────────────────────────────────────────────────────────

/**
 * Generate an ASCII horizontal bar chart
 */
export function asciiHorizontalBar(data, maxWidth = 30, filledChar = '█', emptyChar = '░') {
    if (!data || !data.length) return '<div style="text-align:center;padding:20px;color:var(--text-muted);">No data available</div>';

    const maxValue = Math.max(...data.map(d => d.value), 1);
    const bars = data.map(d => {
        const width = Math.round((d.value / maxValue) * maxWidth);
        const bar = filledChar.repeat(Math.max(0, width)) + emptyChar.repeat(Math.max(0, maxWidth - width));
        const pct = (d.value / maxValue * 100).toFixed(0);
        const color = d.color || '';
        return `<div style="display:flex;align-items:center;gap:8px;margin:3px 0;">
            <span style="min-width:80px;font-size:0.75rem;color:var(--text-secondary);">${esc(d.label)}</span>
            <span style="flex:1;font-family:monospace;font-size:0.75rem;${color ? 'color:' + color : ''}">${bar}</span>
            <span style="min-width:36px;text-align:right;font-size:0.7rem;font-weight:600;color:var(--text-primary);">${pct}%</span>
        </div>`;
    }).join('');
    return `<div style="padding:4px 0;">${bars}</div>`;
}

/**
 * Generate an ASCII vertical bar chart
 */
export function asciiVerticalBar(data, maxHeight = 8, barChar = '▓') {
    if (!data || !data.length) return '<div style="text-align:center;padding:20px;color:var(--text-muted);">No data available</div>';

    const maxValue = Math.max(...data.map(d => d.value), 1);
    const scaled = data.map(d => Math.round((d.value / maxValue) * maxHeight));

    let html = '<div style="font-family:monospace;font-size:0.65rem;text-align:center;">';
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
        html += `<span style="font-size:0.55rem;color:var(--text-muted);">${esc(d.label)}</span>`;
    }
    html += '</div></div>';
    return html;
}

/**
 * Generate a grade distribution chart
 */
export function gradeDistributionChart(distribution, maxWidth = 25) {
    if (!distribution) {
        distribution = calculateGradeDistribution();
    }
    const grades = ['A+', 'A', 'B', 'C', 'D', 'F'];
    const colors = ['#10b981', '#34d399', '#60a5fa', '#fbbf24', '#f97316', '#ef4444'];
    const total = Object.values(distribution).reduce((a, b) => a + b, 0);

    if (total === 0) {
        return '<div style="text-align:center;padding:20px;color:var(--text-muted);">No grade data available</div>';
    }

    const data = grades.map((g, i) => ({
        label: g,
        value: distribution[g] || 0,
        color: colors[i],
        pct: (distribution[g] || 0) / total * 100,
    }));

    const maxValue = Math.max(...data.map(d => d.value), 1);
    const bars = data.map(d => {
        const width = Math.round((d.value / maxValue) * maxWidth);
        const bar = '█'.repeat(Math.max(0, width)) + '░'.repeat(Math.max(0, maxWidth - width));
        return `<div style="display:flex;align-items:center;gap:8px;margin:2px 0;">
            <span style="min-width:30px;font-weight:700;color:${d.color};font-size:0.75rem;">${d.label}</span>
            <span style="flex:1;font-family:monospace;font-size:0.75rem;color:${d.color};">${bar}</span>
            <span style="min-width:40px;text-align:right;font-size:0.7rem;font-weight:600;color:var(--text-primary);">${d.pct.toFixed(1)}%</span>
            <span style="min-width:30px;text-align:right;font-size:0.65rem;color:var(--text-muted);">(${d.value})</span>
        </div>`;
    }).join('');

    return `<div style="padding:4px 0;">${bars}</div>`;
}

/**
 * Calculate grade distribution from state
 */
export function calculateGradeDistribution(yearId = null) {
    const distribution = { 'A+': 0, 'A': 0, 'B': 0, 'C': 0, 'D': 0, 'F': 0 };
    const marks = state.marks || [];
    const assessments = state.assessments || [];

    for (const mark of marks) {
        const assessment = assessments.find(a => a.id === mark.assessment_id);
        if (!assessment || assessment.max_marks <= 0) continue;
        const pct = (mark.score / assessment.max_marks) * 100;
        const grade = getGrade(pct);
        if (distribution[grade] !== undefined) distribution[grade]++;
    }

    return distribution;
}

/**
 * Progress bar (ASCII)
 */
export function progressBar(pct, width = 20, color = '') {
    const filled = Math.round((pct / 100) * width);
    const bar = '█'.repeat(Math.max(0, filled)) + '░'.repeat(Math.max(0, width - filled));
    const colorStyle = color ? `style="color:${color};"` : '';
    return `<span style="font-family:monospace;font-size:0.75rem;${colorStyle}">${bar}</span> <span style="font-size:0.7rem;font-weight:600;">${pct.toFixed(1)}%</span>`;
}

/**
 * Trend indicator
 */
export function trendIndicator(change) {
    if (change > 0) return `<span style="color:var(--success);">📈 +${change.toFixed(1)}%</span>`;
    if (change < 0) return `<span style="color:var(--danger);">📉 ${change.toFixed(1)}%</span>`;
    return `<span style="color:var(--text-muted);">➡️ 0%</span>`;
}

// ──────────────────────────────────────────────────────────────────────
// CHART.JS WRAPPERS (Interactive Charts)
// ──────────────────────────────────────────────────────────────────────

/**
 * Create a Chart.js chart in a canvas element
 * @param {string} canvasId - ID of the canvas element
 * @param {string} type - 'bar', 'line', 'doughnut', 'pie'
 * @param {object} data - Chart data
 * @param {object} options - Chart options
 */
export function createChart(canvasId, type, data, options = {}) {
    if (typeof Chart === 'undefined') {
        console.warn('[Charts] Chart.js not loaded');
        return null;
    }

    const canvas = document.getElementById(canvasId);
    if (!canvas) {
        console.warn(`[Charts] Canvas #${canvasId} not found`);
        return null;
    }

    // Destroy existing chart
    if (canvas._chart) {
        canvas._chart.destroy();
    }

    const chart = new Chart(canvas, {
        type: type,
        data: data,
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    labels: {
                        color: getComputedStyle(document.documentElement).getPropertyValue('--text-secondary').trim() || 'rgba(255,255,255,0.7)',
                        boxWidth: 12,
                        padding: 12,
                    }
                }
            },
            scales: type === 'line' || type === 'bar' ? {
                y: {
                    beginAtZero: true,
                    grid: {
                        color: 'rgba(255,255,255,0.04)',
                    },
                    ticks: {
                        color: getComputedStyle(document.documentElement).getPropertyValue('--text-muted').trim() || 'rgba(255,255,255,0.4)',
                    }
                },
                x: {
                    grid: { display: false },
                    ticks: {
                        color: getComputedStyle(document.documentElement).getPropertyValue('--text-muted').trim() || 'rgba(255,255,255,0.4)',
                    }
                }
            } : {},
            ...options
        }
    });

    canvas._chart = chart;
    return chart;
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

/**
 * Get year label helper
 */
function getYearLabel(yearId) {
    if (!yearId) {
        const activeYear = state.academicYears?.find(y => y.is_active);
        return activeYear?.name || 'Current Year';
    }
    const year = (state.academicYears || []).find(y => y.id === yearId);
    return year?.name || 'Unknown Year';
}

/**
 * Create a bar chart
 */
export function createBarChart(canvasId, labels, dataset, label = 'Value', colors = null) {
    const defaultColors = ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444', '#f472b6'];
    const bgColors = colors || labels.map((_, i) => defaultColors[i % defaultColors.length]);

    return createChart(canvasId, 'bar', {
        labels: labels,
        datasets: [{
            label: label,
            data: dataset,
            backgroundColor: bgColors.map(c => c + 'CC'),
            borderColor: bgColors,
            borderWidth: 1,
            borderRadius: 6,
        }]
    });
}

/**
 * Create a line chart
 */
export function createLineChart(canvasId, labels, datasets) {
    return createChart(canvasId, 'line', {
        labels: labels,
        datasets: datasets.map(ds => ({
            label: ds.label,
            data: ds.data,
            borderColor: ds.color || '#3b82f6',
            backgroundColor: (ds.color || '#3b82f6') + '20',
            tension: 0.3,
            fill: ds.fill !== undefined ? ds.fill : false,
            pointBackgroundColor: ds.color || '#3b82f6',
            pointRadius: 4,
        }))
    });
}

/**
 * Create a doughnut chart
 */
export function createDoughnutChart(canvasId, labels, data, colors = null) {
    const defaultColors = ['#10b981', '#3b82f6', '#f59e0b', '#8b5cf6', '#ef4444', '#f472b6'];
    const bgColors = colors || labels.map((_, i) => defaultColors[i % defaultColors.length]);

    return createChart(canvasId, 'doughnut', {
        labels: labels,
        datasets: [{
            data: data,
            backgroundColor: bgColors,
            borderColor: getComputedStyle(document.documentElement).getPropertyValue('--bg-secondary').trim() || '#0f172a',
            borderWidth: 2,
        }]
    }, {
        cutout: '60%',
        plugins: {
            legend: {
                position: 'bottom',
                labels: {
                    padding: 12,
                    usePointStyle: true,
                    pointStyle: 'circle',
                }
            }
        }
    });
}

/**
 * Create a pie chart
 */
export function createPieChart(canvasId, labels, data, colors = null) {
    const defaultColors = ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444', '#f472b6'];
    const bgColors = colors || labels.map((_, i) => defaultColors[i % defaultColors.length]);

    return createChart(canvasId, 'pie', {
        labels: labels,
        datasets: [{
            data: data,
            backgroundColor: bgColors,
            borderColor: getComputedStyle(document.documentElement).getPropertyValue('--bg-secondary').trim() || '#0f172a',
            borderWidth: 2,
        }]
    }, {
        plugins: {
            legend: {
                position: 'bottom',
                labels: {
                    padding: 12,
                    usePointStyle: true,
                    pointStyle: 'circle',
                }
            }
        }
    });
}

// ──────────────────────────────────────────────────────────────────────
// DATA HELPERS
// ──────────────────────────────────────────────────────────────────────

/**
 * Get class performance data for charts
 */
export function getClassPerformanceData(yearId = null) {
    const classes = (state.classes || []).filter(c => c.is_active !== false);
    const students = (state.students || []).filter(s => !s.is_deleted);
    const marks = (state.marks || []).filter(m => !m.is_archived);
    const assessments = (state.assessments || []);

    return classes.map(cls => {
        const clsStudents = students.filter(s => s.class_id === cls.id && s.status === 'Active');
        const clsAssessments = assessments.filter(a => a.class_id === cls.id);

        let totalPct = 0, count = 0;
        for (const student of clsStudents) {
            let score = 0, max = 0;
            for (const assessment of clsAssessments) {
                const mark = marks.find(m => m.assessment_id === assessment.id && m.student_id === student.id);
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
 * Get fee collection data for charts
 */
export function getFeeCollectionData(yearId = null) {
    const classes = (state.classes || []).filter(c => c.is_active !== false);
    const studentFees = (state.studentFees || []).filter(f => !f.is_waived && !f.is_credit);

    return classes.map(cls => {
        const fees = studentFees.filter(f => f.class_id === cls.id);
        let total = 0, paid = 0;
        for (const fee of fees) {
            total += fee.amount || 0;
            paid += fee.paid_amount || 0;
        }
        const rate = total > 0 ? (paid / total) * 100 : 0;
        return {
            label: cls.name,
            value: rate,
            color: rate >= 80 ? '#10b981' : rate >= 60 ? '#f59e0b' : '#ef4444',
            expected: total,
            collected: paid,
        };
    }).filter(d => d.expected > 0);
}

/**
 * Get payment method distribution
 */
export function getPaymentMethodData() {
    const payments = (state.payments || []).filter(p => !p.is_reversed);
    const methods = {};
    for (const payment of payments) {
        const method = payment.payment_method || 'Other';
        methods[method] = (methods[method] || 0) + payment.amount;
    }
    const total = Object.values(methods).reduce((a, b) => a + b, 0);
    return Object.entries(methods).map(([label, amount]) => ({
        label: label,
        value: total > 0 ? (amount / total) * 100 : 0,
        amount: amount,
    })).sort((a, b) => b.value - a.value);
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
window.createChart = createChart;
window.createBarChart = createBarChart;
window.createLineChart = createLineChart;
window.createDoughnutChart = createDoughnutChart;
window.createPieChart = createPieChart;
window.getClassPerformanceData = getClassPerformanceData;
window.getFeeCollectionData = getFeeCollectionData;
window.getPaymentMethodData = getPaymentMethodData;
window.chartWithYear = chartWithYear;

console.log('📊 Charts module loaded — ASCII + Chart.js support');