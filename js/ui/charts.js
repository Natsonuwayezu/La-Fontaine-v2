/* ═══════════════════════════════════════════════════════════════════
   js/ui/charts.js — Complete Chart Module
   ═══════════════════════════════════════════════════════════════════
   Supports both ASCII charts (no dependencies, SVG-based) and
   Chart.js (interactive). All charts use warm, rich colors —
   no pure white (#FFFFFF), no pure black (#000000).

   ── ASCII Charts (No Dependencies) ──
   Charts.asciiHorizontalBar(data, maxWidth, filledChar, emptyChar)
   Charts.asciiVerticalBar(data, maxHeight, barChar)
   Charts.gradeDistributionChart(distribution, maxWidth)
   Charts.progressBar(pct, width, color)
   Charts.trendIndicator(change)

   ── SVG Charts (No Dependencies) ──
   Charts.line(container, opts)
   Charts.bar(container, opts)
   Charts.donut(container, opts)

   ── Chart.js Wrappers (Interactive) ──
   Charts.createChart(canvasId, type, data, options)
   Charts.createBarChart(canvasId, labels, dataset, label, colors)
   Charts.createLineChart(canvasId, labels, datasets)
   Charts.createDoughnutChart(canvasId, labels, data, colors)
   Charts.createPieChart(canvasId, labels, data, colors)

   ── Data Helpers ──
   Charts.getClassPerformanceData(yearId)
   Charts.getFeeCollectionData(yearId)
   Charts.getPaymentMethodData()
   Charts.calculateGradeDistribution()

   Last updated: 2026-07-14
   ═══════════════════════════════════════════════════════════════════ */

// state and getGrade are plain-script globals from core/state.js and core/formulas.js,
// both loaded earlier in index.html — no import needed.
// (getCurrentUser, getCurrentTerm, getCurrentYear, esc were imported here previously
// but never used in this file — removed as dead code.)

/* ═══════════════════════════════════════════════════════════════════
   COLOR PALETTE — Warm, rich, no pure white, no pure black
   ═══════════════════════════════════════════════════════════════════ */

const PALETTE = [
  '#6a8aba', // Soft blue
  '#8a6aaa', // Soft purple
  '#5a8a6a', // Soft green
  '#c9a84c', // Warm gold
  '#c45a4a', // Warm red
  '#4a8a9a', // Soft teal
  '#c57586', // Soft rose
  '#8a7a72', // Warm gray
  '#7a5a7a', // Soft mauve
  '#3a7a5a', // Deep sage
];

const GRADE_COLORS = {
  'A+': '#5a9a7a',
  'A': '#7aaa8a',
  'B': '#8a9aba',
  'C': '#c9a84c',
  'D': '#c48a3a',
  'F': '#c45a4a',
};

/* ═══════════════════════════════════════════════════════════════════
   HELPERS
   ═══════════════════════════════════════════════════════════════════ */

function escapeHTML(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}

function getColor(index, customColor = null) {
  if (customColor) return customColor;
  return PALETTE[index % PALETTE.length];
}

function formatPct(value, decimals = 1) {
  return value.toFixed(decimals) + '%';
}

/* ═══════════════════════════════════════════════════════════════════
   SECTION 1 — ASCII CHARTS (No Dependencies)
   ═══════════════════════════════════════════════════════════════════ */

/**
 * Generate an ASCII horizontal bar chart
 * @param {Array} data - Array of { label, value, color? } objects
 * @param {number} maxWidth - Maximum width of the bar in characters
 * @param {string} filledChar - Character for filled portion
 * @param {string} emptyChar - Character for empty portion
 * @returns {string} HTML string
 */
function asciiHorizontalBar(data, maxWidth = 30, filledChar = '█', emptyChar = '░') {
  if (!data || !data.length) {
    return '<div style="text-align:center;padding:20px;color:var(--text-muted);">No data available</div>';
  }

  const maxValue = Math.max(...data.map(d => d.value), 1);
  const bars = data.map(d => {
    const width = Math.round((d.value / maxValue) * maxWidth);
    const bar = filledChar.repeat(Math.max(0, width)) + emptyChar.repeat(Math.max(0, maxWidth - width));
    const pct = (d.value / maxValue * 100).toFixed(0);
    const color = d.color || '';
    const colorStyle = color ? `style="color:${color};"` : '';
    return `<div style="display:flex;align-items:center;gap:8px;margin:3px 0;">
            <span style="min-width:80px;font-size:0.75rem;color:var(--text-secondary);">${escapeHTML(d.label)}</span>
            <span style="flex:1;font-family:monospace;font-size:0.75rem;${colorStyle}">${bar}</span>
            <span style="min-width:36px;text-align:right;font-size:0.7rem;font-weight:600;color:var(--text-primary);">${pct}%</span>
        </div>`;
  }).join('');
  return `<div style="padding:4px 0;">${bars}</div>`;
}

/**
 * Generate an ASCII vertical bar chart
 * @param {Array} data - Array of { label, value, color? } objects
 * @param {number} maxHeight - Maximum height of the chart
 * @param {string} barChar - Character for bars
 * @returns {string} HTML string
 */
function asciiVerticalBar(data, maxHeight = 8, barChar = '▓') {
  if (!data || !data.length) {
    return '<div style="text-align:center;padding:20px;color:var(--text-muted);">No data available</div>';
  }

  const maxValue = Math.max(...data.map(d => d.value), 1);
  const scaled = data.map(d => Math.round((d.value / maxValue) * maxHeight));

  let html = '<div style="font-family:monospace;font-size:0.65rem;text-align:center;">';
  for (let row = maxHeight; row > 0; row--) {
    html += '<div style="display:flex;justify-content:center;gap:4px;">';
    for (let i = 0; i < scaled.length; i++) {
      const isFilled = scaled[i] >= row;
      const color = data[i]?.color || '';
      const colorStyle = color ? `style="color:${color};"` : '';
      html += `<span ${colorStyle}>${isFilled ? barChar : ' '}</span>`;
    }
    html += '</div>';
  }
  html += '<div style="display:flex;justify-content:center;gap:4px;margin-top:4px;">';
  for (const d of data) {
    html += `<span style="font-size:0.55rem;color:var(--text-muted);">${escapeHTML(d.label)}</span>`;
  }
  html += '</div></div>';
  return html;
}

/**
 * Generate a grade distribution chart
 * @param {Object} distribution - Grade distribution object
 * @param {number} maxWidth - Maximum width of bars
 * @returns {string} HTML string
 */
function gradeDistributionChart(distribution = null, maxWidth = 25) {
  if (!distribution) {
    distribution = calculateGradeDistribution();
  }

  const grades = ['A+', 'A', 'B', 'C', 'D', 'F'];
  const total = Object.values(distribution).reduce((a, b) => a + b, 0);

  if (total === 0) {
    return '<div style="text-align:center;padding:20px;color:var(--text-muted);">No grade data available</div>';
  }

  const data = grades.map(g => ({
    label: g,
    value: distribution[g] || 0,
    color: GRADE_COLORS[g] || '#8a7a72',
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
 * Progress bar (ASCII)
 * @param {number} pct - Percentage (0-100)
 * @param {number} width - Width in characters
 * @param {string} color - Optional color
 * @returns {string} HTML string
 */
function progressBar(pct, width = 20, color = '') {
  const filled = Math.round((pct / 100) * width);
  const bar = '█'.repeat(Math.max(0, filled)) + '░'.repeat(Math.max(0, width - filled));
  const colorStyle = color ? `style="color:${color};"` : '';
  return `<span style="font-family:monospace;font-size:0.75rem;${colorStyle}">${bar}</span> <span style="font-size:0.7rem;font-weight:600;">${pct.toFixed(1)}%</span>`;
}

/**
 * Trend indicator
 * @param {number} change - Change in percentage
 * @returns {string} HTML string
 */
function trendIndicator(change) {
  if (change > 0) {
    return `<span style="color:var(--success, #5a9a7a);">↑ ${change.toFixed(1)}%</span>`;
  }
  if (change < 0) {
    return `<span style="color:var(--danger, #c45a4a);">↓ ${Math.abs(change).toFixed(1)}%</span>`;
  }
  return `<span style="color:var(--text-muted, #a8988e);">→ 0%</span>`;
}

/* ═══════════════════════════════════════════════════════════════════
   SECTION 2 — SVG CHARTS (No Dependencies)
   ═══════════════════════════════════════════════════════════════════ */

/**
 * Create an SVG line chart
 * @param {HTMLElement} container - Container element
 * @param {Object} opts - Options
 * @param {Array} opts.series - Series data [{ label, color, points: [{x, y}] }]
 * @param {number} opts.width - Chart width (default: container width)
 * @param {number} opts.height - Chart height (default: 220)
 * @param {Function} opts.yFormat - Format function for y-axis labels
 */
function line(container, opts) {
  const {
    series = [],
    width = container.clientWidth || 480,
    height = 220,
    yFormat = (v) => v,
    showLegend = true
  } = opts;

  if (!series.length) {
    container.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text-muted);">No data available</div>';
    return;
  }

  const padding = { top: 16, right: 16, bottom: 28, left: 40 };
  const allPoints = series.flatMap(s => s.points);
  const xs = allPoints.map(p => p.x);
  const ys = allPoints.map(p => p.y);
  const xMin = Math.min(...xs);
  const xMax = Math.max(...xs);
  const yMin = Math.min(0, ...ys);
  const yMax = Math.max(...ys) * 1.1 || 1;

  const plotW = width - padding.left - padding.right;
  const plotH = height - padding.top - padding.bottom;

  const scaleX = (x) => padding.left + ((x - xMin) / (xMax - xMin || 1)) * plotW;
  const scaleY = (y) => padding.top + plotH - ((y - yMin) / (yMax - yMin || 1)) * plotH;

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.setAttribute('width', '100%');
  svg.setAttribute('height', height);
  svg.setAttribute('preserveAspectRatio', 'none');

  // Gridlines
  const gridSteps = 4;
  for (let i = 0; i <= gridSteps; i++) {
    const y = padding.top + (plotH / gridSteps) * i;
    const lineEl = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    lineEl.setAttribute('x1', padding.left);
    lineEl.setAttribute('x2', width - padding.right);
    lineEl.setAttribute('y1', y);
    lineEl.setAttribute('y2', y);
    lineEl.setAttribute('stroke', 'rgba(180, 170, 160, 0.10)');
    lineEl.setAttribute('stroke-width', '1');
    svg.appendChild(lineEl);

    const value = yMax - ((yMax - yMin) / gridSteps) * i;
    const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    label.setAttribute('x', padding.left - 8);
    label.setAttribute('y', y + 4);
    label.setAttribute('text-anchor', 'end');
    label.setAttribute('fill', 'var(--text-muted, #a8988e)');
    label.setAttribute('font-size', '10');
    label.textContent = yFormat(Math.round(value));
    svg.appendChild(label);
  }

  // Series
  series.forEach((s, i) => {
    const color = s.color || PALETTE[i % PALETTE.length];
    const sorted = [...s.points].sort((a, b) => a.x - b.x);

    // Area
    const pathD = sorted.map((p, idx) =>
      `${idx === 0 ? 'M' : 'L'} ${scaleX(p.x)} ${scaleY(p.y)}`
    ).join(' ');

    const areaD = `${pathD} L ${scaleX(sorted[sorted.length - 1].x)} ${scaleY(yMin)} L ${scaleX(sorted[0].x)} ${scaleY(yMin)} Z`;
    const gradId = `chartGrad-${Math.random().toString(36).slice(2, 9)}`;
    const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    const grad = document.createElementNS('http://www.w3.org/2000/svg', 'linearGradient');
    grad.setAttribute('id', gradId);
    grad.setAttribute('x1', '0');
    grad.setAttribute('y1', '0');
    grad.setAttribute('x2', '0');
    grad.setAttribute('y2', '1');
    const stop1 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
    stop1.setAttribute('offset', '0%');
    stop1.setAttribute('stop-color', color);
    stop1.setAttribute('stop-opacity', '0.20');
    const stop2 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
    stop2.setAttribute('offset', '100%');
    stop2.setAttribute('stop-color', color);
    stop2.setAttribute('stop-opacity', '0');
    grad.appendChild(stop1);
    grad.appendChild(stop2);
    defs.appendChild(grad);
    svg.appendChild(defs);

    const area = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    area.setAttribute('d', areaD);
    area.setAttribute('fill', `url(#${gradId})`);
    area.setAttribute('stroke', 'none');
    svg.appendChild(area);

    // Line
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', pathD);
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', color);
    path.setAttribute('stroke-width', '2.5');
    path.setAttribute('stroke-linecap', 'round');
    path.setAttribute('stroke-linejoin', 'round');
    svg.appendChild(path);

    // Points
    sorted.forEach(p => {
      const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      circle.setAttribute('cx', scaleX(p.x));
      circle.setAttribute('cy', scaleY(p.y));
      circle.setAttribute('r', '3.5');
      circle.setAttribute('fill', color);
      circle.setAttribute('stroke', 'var(--bg-card, #fcfaf8)');
      circle.setAttribute('stroke-width', '2');
      svg.appendChild(circle);
    });
  });

  container.innerHTML = '';
  container.appendChild(svg);

  if (showLegend && series.length > 1) {
    appendLegend(container, series.map((s, i) => ({
      label: s.label,
      color: s.color || PALETTE[i % PALETTE.length]
    })));
  }
}

/**
 * Create an SVG bar chart
 * @param {HTMLElement} container - Container element
 * @param {Object} opts - Options
 * @param {Array} opts.labels - X-axis labels
 * @param {Array} opts.series - Series data [{ label, color, values: [...] }]
 * @param {number} opts.height - Chart height (default: 220)
 * @param {boolean} opts.stacked - Stack bars (default: false)
 */
function bar(container, opts) {
  const {
    labels = [],
    series = [],
    height = 220,
    width = container.clientWidth || 480,
    stacked = false,
    showLegend = true
  } = opts;

  if (!labels.length || !series.length) {
    container.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text-muted);">No data available</div>';
    return;
  }

  const padding = { top: 16, right: 16, bottom: 32, left: 40 };
  const plotW = width - padding.left - padding.right;
  const plotH = height - padding.top - padding.bottom;

  const maxVal = stacked
    ? Math.max(...labels.map((_, i) => series.reduce((sum, s) => sum + (s.values[i] || 0), 0)))
    : Math.max(...series.flatMap(s => s.values));
  const yMax = maxVal * 1.15 || 1;

  const groupWidth = plotW / labels.length;
  const barWidth = stacked ? groupWidth * 0.55 : (groupWidth * 0.7) / series.length;

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.setAttribute('width', '100%');
  svg.setAttribute('height', height);
  svg.setAttribute('preserveAspectRatio', 'none');

  // Gridlines
  const gridSteps = 4;
  for (let i = 0; i <= gridSteps; i++) {
    const y = padding.top + (plotH / gridSteps) * i;
    const lineEl = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    lineEl.setAttribute('x1', padding.left);
    lineEl.setAttribute('x2', width - padding.right);
    lineEl.setAttribute('y1', y);
    lineEl.setAttribute('y2', y);
    lineEl.setAttribute('stroke', 'rgba(180, 170, 160, 0.10)');
    lineEl.setAttribute('stroke-width', '1');
    svg.appendChild(lineEl);
  }

  // Bars
  labels.forEach((label, i) => {
    const groupX = padding.left + i * groupWidth + groupWidth * 0.15;
    let stackY = padding.top + plotH;

    series.forEach((s, si) => {
      const color = s.color || PALETTE[si % PALETTE.length];
      const value = s.values[i] || 0;
      const barH = (value / yMax) * plotH;
      const x = stacked ? groupX + groupWidth * 0.075 : groupX + si * barWidth;
      const y = stacked ? stackY - barH : padding.top + plotH - barH;
      if (stacked) stackY -= barH;

      const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      rect.setAttribute('x', x);
      rect.setAttribute('y', y);
      rect.setAttribute('width', barWidth);
      rect.setAttribute('height', Math.max(0, barH));
      rect.setAttribute('rx', '4');
      rect.setAttribute('fill', color);
      svg.appendChild(rect);
    });

    const labelEl = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    labelEl.setAttribute('x', groupX + groupWidth * 0.35);
    labelEl.setAttribute('y', height - 10);
    labelEl.setAttribute('text-anchor', 'middle');
    labelEl.setAttribute('fill', 'var(--text-muted, #a8988e)');
    labelEl.setAttribute('font-size', '10');
    labelEl.textContent = label;
    svg.appendChild(labelEl);
  });

  container.innerHTML = '';
  container.appendChild(svg);

  if (showLegend && series.length > 1) {
    appendLegend(container, series.map((s, i) => ({
      label: s.label,
      color: s.color || PALETTE[i % PALETTE.length]
    })));
  }
}

/**
 * Create an SVG donut chart
 * @param {HTMLElement} container - Container element
 * @param {Object} opts - Options
 * @param {Array} opts.segments - Segment data [{ label, value, color }]
 * @param {number} opts.size - Chart size (default: 180)
 * @param {number} opts.thickness - Ring thickness (default: 24)
 * @param {string} opts.centerLabel - Center label (default: total)
 */
function donut(container, opts) {
  const {
    segments = [],
    size = 180,
    thickness = 24,
    centerLabel = null
  } = opts;

  const total = segments.reduce((sum, s) => sum + s.value, 0) || 1;
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;
  const center = size / 2;

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', `0 0 ${size} ${size}`);
  svg.setAttribute('width', size);
  svg.setAttribute('height', size);

  // Background ring
  const bgCircle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  bgCircle.setAttribute('cx', center);
  bgCircle.setAttribute('cy', center);
  bgCircle.setAttribute('r', radius);
  bgCircle.setAttribute('fill', 'none');
  bgCircle.setAttribute('stroke', 'rgba(180, 170, 160, 0.06)');
  bgCircle.setAttribute('stroke-width', thickness);
  svg.appendChild(bgCircle);

  let offset = 0;
  segments.forEach((seg, i) => {
    const color = seg.color || PALETTE[i % PALETTE.length];
    const fraction = seg.value / total;
    const dash = fraction * circumference;

    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('cx', center);
    circle.setAttribute('cy', center);
    circle.setAttribute('r', radius);
    circle.setAttribute('fill', 'none');
    circle.setAttribute('stroke', color);
    circle.setAttribute('stroke-width', thickness);
    circle.setAttribute('stroke-dasharray', `${dash} ${circumference - dash}`);
    circle.setAttribute('stroke-dashoffset', -offset);
    circle.setAttribute('transform', `rotate(-90 ${center} ${center})`);
    circle.setAttribute('stroke-linecap', segments.length > 1 ? 'butt' : 'round');
    svg.appendChild(circle);
    offset += dash;
  });

  // Center label
  const labelText = centerLabel !== null ? centerLabel : total;
  const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  text.setAttribute('x', center);
  text.setAttribute('y', center + 5);
  text.setAttribute('text-anchor', 'middle');
  text.setAttribute('font-size', '18');
  text.setAttribute('font-weight', '800');
  text.setAttribute('fill', 'var(--text-primary, #2c241e)');
  text.textContent = labelText;
  svg.appendChild(text);

  const wrap = document.createElement('div');
  wrap.className = 'chart-svg-wrap';
  wrap.style.display = 'flex';
  wrap.style.alignItems = 'center';
  wrap.style.gap = '18px';
  wrap.style.flexWrap = 'wrap';
  wrap.appendChild(svg);

  const legend = document.createElement('div');
  legend.className = 'chart-legend';
  legend.style.display = 'flex';
  legend.style.flexDirection = 'column';
  legend.style.alignItems = 'flex-start';
  legend.style.gap = '4px';
  legend.innerHTML = segments.map((s, i) => `
        <div class="chart-legend-item" style="display:flex;align-items:center;gap:8px;font-size:0.75rem;color:var(--text-secondary);">
            <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${s.color || PALETTE[i % PALETTE.length]};flex-shrink:0;"></span>
            ${escapeHTML(s.label)} — <strong>${Math.round((s.value / total) * 100)}%</strong>
        </div>
    `).join('');
  wrap.appendChild(legend);

  container.innerHTML = '';
  container.appendChild(wrap);
}

/**
 * Append legend to a chart container
 * @param {HTMLElement} container - Container element
 * @param {Array} items - Legend items [{ label, color }]
 */
function appendLegend(container, items) {
  const legend = document.createElement('div');
  legend.className = 'chart-legend';
  legend.style.display = 'flex';
  legend.style.flexWrap = 'wrap';
  legend.style.gap = '12px';
  legend.style.marginTop = '12px';
  legend.style.justifyContent = 'center';
  legend.innerHTML = items.map(it => `
        <div class="chart-legend-item" style="display:flex;align-items:center;gap:6px;font-size:0.7rem;color:var(--text-secondary);">
            <span style="display:inline-block;width:10px;height:10px;border-radius:3px;background:${it.color};flex-shrink:0;"></span>
            ${escapeHTML(it.label)}
        </div>
    `).join('');
  container.appendChild(legend);
}

/* ═══════════════════════════════════════════════════════════════════
   SECTION 3 — CHART.JS WRAPPERS (Interactive)
   ═══════════════════════════════════════════════════════════════════ */

/**
 * Create a Chart.js chart in a canvas element
 * @param {string} canvasId - ID of the canvas element
 * @param {string} type - 'bar', 'line', 'doughnut', 'pie'
 * @param {object} data - Chart data
 * @param {object} options - Chart options
 * @returns {object|null} Chart instance or null
 */
function createChart(canvasId, type, data, options = {}) {
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

  const defaultOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        labels: {
          color: getComputedStyle(document.documentElement).getPropertyValue('--text-secondary').trim() || '#6b5f56',
          boxWidth: 12,
          padding: 12,
        }
      }
    },
    scales: (type === 'line' || type === 'bar') ? {
      y: {
        beginAtZero: true,
        grid: {
          color: 'rgba(180, 170, 160, 0.06)',
        },
        ticks: {
          color: getComputedStyle(document.documentElement).getPropertyValue('--text-muted').trim() || '#a8988e',
        }
      },
      x: {
        grid: { display: false },
        ticks: {
          color: getComputedStyle(document.documentElement).getPropertyValue('--text-muted').trim() || '#a8988e',
        }
      }
    } : {}
  };

  const mergedOptions = {
    ...defaultOptions,
    ...options,
    plugins: {
      ...defaultOptions.plugins,
      ...(options.plugins || {})
    },
    scales: {
      ...defaultOptions.scales,
      ...(options.scales || {})
    }
  };

  const chart = new Chart(canvas, {
    type: type,
    data: data,
    options: mergedOptions
  });

  canvas._chart = chart;
  return chart;
}

/**
 * Create a bar chart
 * @param {string} canvasId - Canvas ID
 * @param {Array} labels - X-axis labels
 * @param {Array} dataset - Data values
 * @param {string} label - Dataset label
 * @param {Array} colors - Optional colors
 * @returns {object|null} Chart instance
 */
function createBarChart(canvasId, labels, dataset, label = 'Value', colors = null) {
  const bgColors = colors || labels.map((_, i) => PALETTE[i % PALETTE.length]);
  const borderColors = bgColors.map(c => c);

  return createChart(canvasId, 'bar', {
    labels: labels,
    datasets: [{
      label: label,
      data: dataset,
      backgroundColor: bgColors.map(c => c + 'CC'),
      borderColor: borderColors,
      borderWidth: 1,
      borderRadius: 6,
    }]
  });
}

/**
 * Create a line chart
 * @param {string} canvasId - Canvas ID
 * @param {Array} labels - X-axis labels
 * @param {Array} datasets - Dataset array [{ label, data, color, fill }]
 * @returns {object|null} Chart instance
 */
function createLineChart(canvasId, labels, datasets) {
  const chartData = {
    labels: labels,
    datasets: datasets.map(ds => ({
      label: ds.label,
      data: ds.data,
      borderColor: ds.color || PALETTE[0],
      backgroundColor: (ds.color || PALETTE[0]) + '20',
      tension: 0.3,
      fill: ds.fill !== undefined ? ds.fill : false,
      pointBackgroundColor: ds.color || PALETTE[0],
      pointRadius: 4,
    }))
  };

  return createChart(canvasId, 'line', chartData);
}

/**
 * Create a doughnut chart
 * @param {string} canvasId - Canvas ID
 * @param {Array} labels - Labels
 * @param {Array} data - Data values
 * @param {Array} colors - Optional colors
 * @param {number} cutout - Cutout percentage (default: 60)
 * @returns {object|null} Chart instance
 */
function createDoughnutChart(canvasId, labels, data, colors = null, cutout = 60) {
  const bgColors = colors || labels.map((_, i) => PALETTE[i % PALETTE.length]);

  return createChart(canvasId, 'doughnut', {
    labels: labels,
    datasets: [{
      data: data,
      backgroundColor: bgColors,
      borderColor: getComputedStyle(document.documentElement).getPropertyValue('--bg-card').trim() || '#fcfaf8',
      borderWidth: 2,
    }]
  }, {
    cutout: cutout + '%',
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
 * @param {string} canvasId - Canvas ID
 * @param {Array} labels - Labels
 * @param {Array} data - Data values
 * @param {Array} colors - Optional colors
 * @returns {object|null} Chart instance
 */
function createPieChart(canvasId, labels, data, colors = null) {
  const bgColors = colors || labels.map((_, i) => PALETTE[i % PALETTE.length]);

  return createChart(canvasId, 'pie', {
    labels: labels,
    datasets: [{
      data: data,
      backgroundColor: bgColors,
      borderColor: getComputedStyle(document.documentElement).getPropertyValue('--bg-card').trim() || '#fcfaf8',
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

/* ═══════════════════════════════════════════════════════════════════
   SECTION 4 — DATA HELPERS
   ═══════════════════════════════════════════════════════════════════ */

/**
 * Calculate grade distribution from state
 * @param {number} yearId - Optional academic year ID
 * @returns {Object} Grade distribution { 'A+': count, 'A': count, ... }
 */
function calculateGradeDistribution(yearId = null) {
  const distribution = { 'A+': 0, 'A': 0, 'B': 0, 'C': 0, 'D': 0, 'F': 0 };
  const marks = state.marks || [];
  const assessments = state.assessments || [];
  const students = state.students || [];

  if (!marks.length || !assessments.length) return distribution;

  for (const mark of marks) {
    const assessment = assessments.find(a => a.id === mark.assessment_id);
    if (!assessment || assessment.max_marks <= 0) continue;

    // Filter by year if provided
    if (yearId && assessment.academic_year_id !== yearId) continue;

    const pct = (mark.score / assessment.max_marks) * 100;
    const grade = getGrade(pct);
    if (distribution[grade] !== undefined) distribution[grade]++;
  }

  return distribution;
}

/**
 * Get class performance data for charts
 * @param {number} yearId - Optional academic year ID
 * @returns {Array} Array of { label, value, color, students }
 */
function getClassPerformanceData(yearId = null) {
  const classes = (state.classes || []).filter(c => c.is_active !== false);
  const students = (state.students || []).filter(s => s.status === 'Active');
  const marks = (state.marks || []);
  const assessments = (state.assessments || []);

  return classes.map(cls => {
    const clsStudents = students.filter(s => s.class_id === cls.id);
    const clsAssessments = assessments.filter(a => a.class_id === cls.id);

    let totalPct = 0;
    let count = 0;

    for (const student of clsStudents) {
      let score = 0;
      let max = 0;
      for (const assessment of clsAssessments) {
        const mark = marks.find(m =>
          m.assessment_id === assessment.id &&
          m.student_id === student.id
        );
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
      color: avg >= 80 ? '#5a9a7a' : avg >= 60 ? '#c9a84c' : '#c45a4a',
      students: count,
    };
  }).filter(d => d.students > 0);
}

/**
 * Get fee collection data for charts
 * @param {number} yearId - Optional academic year ID
 * @returns {Array} Array of { label, value, color, expected, collected }
 */
function getFeeCollectionData(yearId = null) {
  const classes = (state.classes || []).filter(c => c.is_active !== false);
  const studentFees = (state.studentFees || []).filter(f => !f.is_waived && !f.is_credit);

  return classes.map(cls => {
    const classStudents = (state.students || []).filter(s =>
      s.class_id === cls.id && s.status === 'Active'
    );
    const studentIds = classStudents.map(s => s.id);

    let total = 0;
    let paid = 0;

    for (const fee of studentFees) {
      if (!studentIds.includes(fee.student_id)) continue;
      total += fee.amount || 0;
      paid += fee.paid_amount || 0;
    }

    const rate = total > 0 ? (paid / total) * 100 : 0;
    return {
      label: cls.name,
      value: rate,
      color: rate >= 80 ? '#5a9a7a' : rate >= 60 ? '#c9a84c' : '#c45a4a',
      expected: total,
      collected: paid,
    };
  }).filter(d => d.expected > 0);
}

/**
 * Get payment method distribution
 * @returns {Array} Array of { label, value, amount }
 */
function getPaymentMethodData() {
  const payments = (state.payments || []).filter(p => !p.is_reversed);
  const methods = {};

  for (const payment of payments) {
    const method = payment.payment_method || 'Other';
    methods[method] = (methods[method] || 0) + payment.amount;
  }

  const total = Object.values(methods).reduce((a, b) => a + b, 0) || 1;

  return Object.entries(methods).map(([label, amount]) => ({
    label: label,
    value: (amount / total) * 100,
    amount: amount,
  })).sort((a, b) => b.value - a.value);
}

/**
 * Wrap a chart with a year header
 * @param {string} title - Chart title
 * @param {string} chartHtml - Chart HTML
 * @param {number} yearId - Academic year ID (optional)
 * @returns {string} Wrapped chart HTML
 */
function chartWithYear(title, chartHtml, yearId = null) {
  const year = getYearLabel(yearId);
  const yearLabel = year ? ` — ${year}` : '';
  const isActive = yearId ? (state.academicYears || []).find(y => y.id === yearId)?.is_active : true;
  const statusIcon = isActive ? '●' : '🔒';

  return `
        <div style="margin-bottom:12px;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
                <span style="font-weight:600;font-size:0.85rem;color:var(--text-primary);">${escapeHTML(title)}</span>
                <span style="font-size:0.65rem;color:var(--text-muted);">${statusIcon} ${escapeHTML(yearLabel)}</span>
            </div>
            ${chartHtml}
        </div>
    `;
}

/**
 * Get year label helper
 * @param {number} yearId - Academic year ID
 * @returns {string} Year label
 */
function getYearLabel(yearId) {
  if (!yearId) {
    const activeYear = (state.academicYears || []).find(y => y.is_active);
    return activeYear?.name || 'Current Year';
  }
  const year = (state.academicYears || []).find(y => y.id === yearId);
  return year?.name || 'Unknown Year';
}

/* ═══════════════════════════════════════════════════════════════════
   SECTION 5 — LIVE RESIZE SUPPORT
   ═══════════════════════════════════════════════════════════════════ */

const liveCharts = new Map();

/**
 * Register a live chart for resize support
 * @param {HTMLElement} container - Container element
 * @param {Function} renderFn - Render function to call on resize
 */
function registerLive(container, renderFn) {
  liveCharts.set(container, renderFn);
}

// Listen for appResize event
document.addEventListener('appResize', () => {
  liveCharts.forEach((renderFn, container) => {
    if (document.body.contains(container)) {
      renderFn();
    }
  });
});

/* ═══════════════════════════════════════════════════════════════════
   SECTION 6 — WINDOW EXPOSURE (for onclick handlers)
   ═══════════════════════════════════════════════════════════════════ */

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