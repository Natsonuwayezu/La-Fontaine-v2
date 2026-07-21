/* ═══════════════════════════════════════════════════════════════════
   js/modules/attendance/attendance-analytics.js
   ═══════════════════════════════════════════════════════════════════
   Attendance trends, patterns, and insights over time. Markup matches
   css/modules/attendance.css's .attendance-chart-grid/.attendance-
   chart-card (.chart-head .title/.badge + .chart-container, height
   160px per the actual CSS) — verified against the file.

   The "insight" callout is a simple, honest heuristic computed from
   real fetched data (comparing the most recent half of the period's
   average rate to the earlier half) — not a fabricated prediction.
   ═══════════════════════════════════════════════════════════════════ */

const AttendanceAnalytics = (() => {

    const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    function esc(str) {
        if (window.esc) return window.esc(str);
        const div = document.createElement('div');
        div.textContent = str ?? '';
        return div.innerHTML;
    }

    function today() { return window.todayISO ? window.todayISO() : new Date().toISOString().slice(0, 10); }

    function daysAgoISO(n) {
        const d = new Date();
        d.setDate(d.getDate() - n);
        return d.toISOString().slice(0, 10);
    }

    function render(container) {
        if (!container) return;
        container.innerHTML = `
      <div class="dashboard-page">
        <div class="attendance-report-filters">
          <div class="filter-group">
            <label>Class</label>
            <select id="ana-class-select"><option value="">All classes</option>${classOptions()}</select>
          </div>
          <div class="filter-group">
            <label>Period</label>
            <select id="ana-period-select">
              <option value="7">Last 7 days</option>
              <option value="30" selected>Last 30 days</option>
              <option value="90">Last 90 days</option>
            </select>
          </div>
          <button class="btn btn-generate" id="ana-generate-btn">Update</button>
        </div>

        <div class="dash-card" id="ana-insight-card" style="margin-bottom:14px;">
          <div class="dash-card-body" id="ana-insight-body"></div>
        </div>

        <div class="attendance-chart-grid">
          <div class="attendance-chart-card">
            <div class="chart-head"><span class="title">Daily Attendance Rate</span><span class="badge" id="ana-trend-badge"></span></div>
            <div class="chart-container" id="ana-chart-trend"></div>
          </div>
          <div class="attendance-chart-card">
            <div class="chart-head"><span class="title">Day-of-Week Pattern</span><span class="badge">Average %</span></div>
            <div class="chart-container" id="ana-chart-dow"></div>
          </div>
          <div class="attendance-chart-card">
            <div class="chart-head"><span class="title">Status Breakdown</span><span class="badge" id="ana-total-badge"></span></div>
            <div class="chart-container" id="ana-chart-status"></div>
          </div>
          <div class="attendance-chart-card">
            <div class="chart-head"><span class="title">Class Comparison</span><span class="badge">Average %</span></div>
            <div class="chart-container" id="ana-chart-class"></div>
          </div>
        </div>
      </div>
    `;

        container.querySelector('#ana-generate-btn').addEventListener('click', () => generate(container));
        generate(container);
    }

    function classOptions() {
        if (window.state?.classes?.length) {
            return window.state.classes.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('');
        }
        return [...CLASS_LEVELS.nursery, ...CLASS_LEVELS.primary].map(c => `<option value="${c}">${c}</option>`).join('');
    }

    async function generate(container) {
        const classId = container.querySelector('#ana-class-select').value;
        const days = parseInt(container.querySelector('#ana-period-select').value, 10);
        const start = daysAgoISO(days);
        const end = today();

        const records = await fetchRange(classId, start, end);

        renderTrendChart(records, container);
        renderDayOfWeekChart(records);
        renderStatusChart(records, container);
        renderClassComparison(records, classId);
        renderInsight(records, container);
    }

    async function fetchRange(classId, start, end) {
        if (!window.getWhere) return [];
        const filters = [`date=gte.${start}`, `date=lte.${end}`];
        if (classId) filters.push(`class_id=eq.${classId}`);
        try { return await window.getWhere('attendance', filters.join('&')); }
        catch (err) { console.warn('AttendanceAnalytics: getWhere(attendance) failed', err); return []; }
    }

    function rateForRecords(records) {
        const counts = window.countAttendance ? window.countAttendance(records) : records.reduce((acc, r) => { acc[r.status] = (acc[r.status] || 0) + 1; return acc; }, { P: 0, A: 0, L: 0, E: 0 });
        if (window.computeAttendanceRate) return window.computeAttendanceRate(counts);
        const total = counts.P + counts.A + counts.L + counts.E;
        return total ? Math.round(((counts.P + counts.L * 0.5 + counts.E) / total) * 100) : 0;
    }

    function average(arr) {
        return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
    }

    function renderTrendChart(records, container) {
        const byDate = {};
        records.forEach(r => { (byDate[r.date] ??= []).push(r); });
        const dates = Object.keys(byDate).sort();

        const points = dates.map((d, i) => ({ x: i, y: rateForRecords(byDate[d]) }));
        const el = document.getElementById('ana-chart-trend');
        if (!points.length) {
            window.EmptyStates?.renderInto(el, { title: 'No data', message: 'No attendance recorded in this period.' });
            container.querySelector('#ana-trend-badge').textContent = '\u2014';
            return;
        }

        window.Charts?.line(el, { series: [{ label: 'Rate %', points }], height: 160, yFormat: (v) => `${v}%` });

        const half = Math.floor(points.length / 2);
        const recentAvg = average(points.slice(half).map(p => p.y));
        const earlierAvg = average(points.slice(0, half).map(p => p.y));
        const delta = Math.round(recentAvg - earlierAvg);
        container.querySelector('#ana-trend-badge').textContent = delta === 0 ? 'Stable' : (delta > 0 ? `\u2191 ${delta}%` : `\u2193 ${Math.abs(delta)}%`);
    }

    function renderDayOfWeekChart(records) {
        const byDow = { 1: [], 2: [], 3: [], 4: [], 5: [] }; // Mon-Fri only, schools don't run weekends
        records.forEach(r => {
            const dow = new Date(r.date + 'T00:00:00').getDay();
            if (byDow[dow]) byDow[dow].push(r);
        });
        const labels = [1, 2, 3, 4, 5].map(d => DAY_NAMES[d]);
        const values = [1, 2, 3, 4, 5].map(d => byDow[d].length ? rateForRecords(byDow[d]) : 0);

        window.Charts?.bar(document.getElementById('ana-chart-dow'), {
            labels, series: [{ label: 'Rate %', color: MODULE_ACCENTS?.attendance, values }], height: 160
        });
    }

    function renderStatusChart(records, container) {
        const counts = window.countAttendance ? window.countAttendance(records) : records.reduce((acc, r) => { acc[r.status] = (acc[r.status] || 0) + 1; return acc; }, { P: 0, A: 0, L: 0, E: 0 });
        const total = counts.P + counts.A + counts.L + counts.E;
        container.querySelector('#ana-total-badge').textContent = `${total} records`;

        if (!total) {
            window.EmptyStates?.renderInto(document.getElementById('ana-chart-status'), { title: 'No data' });
            return;
        }

        window.Charts?.donut(document.getElementById('ana-chart-status'), {
            segments: [
                { label: 'Present', value: counts.P, color: '#10b981' },
                { label: 'Absent', value: counts.A, color: '#ef4444' },
                { label: 'Late', value: counts.L, color: '#f59e0b' },
                { label: 'Excused', value: counts.E, color: '#3b82f6' }
            ],
            size: 140, centerLabel: total
        });
    }

    function renderClassComparison(records, classId) {
        const el = document.getElementById('ana-chart-class');
        if (classId || !window.state?.classes?.length) {
            window.EmptyStates?.renderInto(el, { title: 'Select "All classes"', message: 'Class comparison needs more than one class in view.' });
            return;
        }

        const byClass = {};
        records.forEach(r => { (byClass[r.class_id] ??= []).push(r); });

        const labels = [];
        const values = [];
        Object.entries(byClass).forEach(([cid, recs]) => {
            const cls = window.getClass?.(cid);
            labels.push(cls?.name || cid);
            values.push(rateForRecords(recs));
        });

        if (!labels.length) {
            window.EmptyStates?.renderInto(el, { title: 'No data', message: 'No attendance recorded in this period.' });
            return;
        }

        window.Charts?.bar(el, { labels, series: [{ label: 'Rate %', color: MODULE_ACCENTS?.academics, values }], height: 160 });
    }

    function renderInsight(records, container) {
        const el = container.querySelector('#ana-insight-body');
        if (!records.length) {
            el.innerHTML = `<span style="color:var(--card-text-muted,#475569);">Not enough data yet to surface an insight \u2014 record some attendance first.</span>`;
            return;
        }

        const byDate = {};
        records.forEach(r => { (byDate[r.date] ??= []).push(r); });
        const dates = Object.keys(byDate).sort();
        const half = Math.floor(dates.length / 2);
        const recentAvg = average(dates.slice(half).map(d => rateForRecords(byDate[d])));
        const earlierAvg = average(dates.slice(0, half).map(d => rateForRecords(byDate[d])));
        const delta = Math.round(recentAvg - earlierAvg);

        let text, icon;
        if (dates.length < 4) {
            text = 'Not enough distinct days recorded yet for a reliable trend \u2014 check back after a few more school days.';
            icon = 'fa-circle-info';
        } else if (delta <= -5) {
            text = `Attendance has dropped by ${Math.abs(delta)} percentage points in the more recent half of this period compared to the earlier half. Worth checking in with affected classes.`;
            icon = 'fa-triangle-exclamation';
        } else if (delta >= 5) {
            text = `Attendance has improved by ${delta} percentage points in the more recent half of this period \u2014 whatever changed is working.`;
            icon = 'fa-arrow-trend-up';
        } else {
            text = 'Attendance has stayed roughly stable across this period.';
            icon = 'fa-circle-check';
        }

        el.innerHTML = `<div style="display:flex; align-items:center; gap:10px;"><i class="fa-solid ${icon}" style="color:var(--attendance-accent,#f59e0b); font-size:1.1rem;"></i><span style="font-size:0.85rem; color:var(--card-text,#e2e8f0);">${esc(text)}</span></div>`;
    }

    return { render };
})();

// ─── EXPOSE ─────────────────────────────────────────────────────────
// window.AttendanceAnalytics was never assigned anywhere in this file, and the router
// looks up window.renderAttendanceAnalytics specifically (see core/router.js's
// moduleIdToRenderFn) — this page was completely unreachable via navigation
// despite being fully built.
window.AttendanceAnalytics = AttendanceAnalytics;
window.renderAttendanceAnalytics = AttendanceAnalytics.render;
