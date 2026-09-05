/* ═══════════════════════════════════════════════════════════════════
   js/modules/attendance/attendance-summary.js
   ═══════════════════════════════════════════════════════════════════
   Attendance rates per student and class, flagging at-risk students
   below 75% (per the nav description in js/config/navigation.js).
   Markup matches css/modules/attendance.css's .attendance-stats
   (verified against the file: .stat-card > .number.{present,absent,
   late,excused,total,rate} + .label).
   ═══════════════════════════════════════════════════════════════════ */

const AttendanceSummary = (() => {

    const AT_RISK_THRESHOLD = (typeof ATTENDANCE_THRESHOLDS !== 'undefined') ? ATTENDANCE_THRESHOLDS.AT_RISK : 75;

    function esc(str) {
        if (window.esc) return window.esc(str);
        const div = document.createElement('div');
        div.textContent = str ?? '';
        return div.innerHTML;
    }

    function today() { return window.todayISO ? window.todayISO() : new Date().toISOString().slice(0, 10); }
    function firstOfMonth() {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
    }

    function render(container) {
        if (!container) return;
        container.innerHTML = `
      <div class="dashboard-page">
        <div class="attendance-report-filters">
          <div class="filter-group">
            <label>Class</label>
            <select id="sum-class-select"><option value="">All classes</option>${classOptions()}</select>
          </div>
          <div class="filter-group">
            <label>From</label>
            <input type="date" id="sum-start-date" value="${firstOfMonth()}" max="${today()}" />
          </div>
          <div class="filter-group">
            <label>To</label>
            <input type="date" id="sum-end-date" value="${today()}" max="${today()}" />
          </div>
          <button class="btn btn-generate" id="sum-generate-btn">Update Summary</button>
        </div>

        <div class="attendance-stats" id="sum-stats"></div>

        <div class="dash-card">
          <div class="dash-card-header">
            <span class="dash-card-title">Per-Student Rates</span>
            <span class="dash-card-action" id="sum-at-risk-count"></span>
          </div>
          <div class="dash-card-body no-padding" id="sum-table-wrap"></div>
        </div>
      </div>
    `;

        container.querySelector('#sum-generate-btn').addEventListener('click', () => generate(container));
        generate(container);
    }

    function classOptions() {
        if (window.state?.classes?.length) {
            return window.state.classes.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('');
        }
        return [...CLASS_LEVELS.nursery, ...CLASS_LEVELS.primary].map(c => `<option value="${c}">${c}</option>`).join('');
    }

    async function generate(container) {
        const classId = container.querySelector('#sum-class-select').value;
        const start = container.querySelector('#sum-start-date').value;
        const end = container.querySelector('#sum-end-date').value;

        const statsEl = container.querySelector('#sum-stats');
        const tableWrap = container.querySelector('#sum-table-wrap');
        if (window.Skeletons) { window.Skeletons.showIn(statsEl, 'card', 6); window.Skeletons.showTableRows(tableWrap, { columns: 4, rows: 6 }); }

        const records = await fetchRange(classId, start, end);
        const totals = window.countAttendance ? window.countAttendance(records) : fallbackCount(records);
        const rate = window.computeAttendanceRate ? window.computeAttendanceRate(totals) : fallbackRate(totals);

        renderStats(statsEl, totals, rate);

        const students = await fetchStudents(classId);
        const perStudent = students.map(s => {
            const own = records.filter(r => r.student_id === s.id);
            const counts = window.countAttendance ? window.countAttendance(own) : fallbackCount(own);
            const studentRate = window.computeAttendanceRate ? window.computeAttendanceRate(counts) : fallbackRate(counts);
            return { id: s.id, name: s.name, classId: s.classId, rate: studentRate, atRisk: studentRate < AT_RISK_THRESHOLD };
        }).sort((a, b) => a.rate - b.rate);

        const atRiskCount = perStudent.filter(s => s.atRisk).length;
        container.querySelector('#sum-at-risk-count').textContent = atRiskCount > 0
            ? `${atRiskCount} student${atRiskCount === 1 ? '' : 's'} at risk (< ${AT_RISK_THRESHOLD}%)`
            : 'No students at risk';

        renderTable(tableWrap, perStudent);
    }

    function fallbackCount(records) {
        return records.reduce((acc, r) => { acc[r.status] = (acc[r.status] || 0) + 1; return acc; }, { P: 0, A: 0, L: 0, E: 0 });
    }
    function fallbackRate(counts) {
        const total = counts.P + counts.A + counts.L + counts.E;
        return total ? Math.round(((counts.P + counts.L * 0.5 + counts.E) / total) * 100) : 0;
    }

    async function fetchRange(classId, start, end) {
        if (!window.getWhere) return [];
        const filters = [`date=gte.${start}`, `date=lte.${end}`];
        if (classId) filters.push(`class_id=eq.${classId}`);
        try { return await window.getWhere('attendance', filters.join('&')); }
        catch (err) { console.warn('AttendanceSummary: getWhere(attendance) failed', err); return []; }
    }

    async function fetchStudents(classId) {
        if (window.state?.students?.length) {
            const pool = classId ? (window.getStudentsInClass?.(classId) || []) : window.state.students;
            return pool.map(s => ({ id: s.id, name: s.full_name || `${s.first_name || ''} ${s.last_name || ''}`.trim(), classId: window.getClass?.(s.class_id)?.name || s.class_id }));
        }
        console.warn('AttendanceSummary: no real student directory available yet.');
        return [];
    }

    function renderStats(el, totals, rate) {
        const total = totals.P + totals.A + totals.L + totals.E;
        el.innerHTML = `
      <div class="stat-card"><div class="number total">${total}</div><div class="label">Total Records</div></div>
      <div class="stat-card"><div class="number present">${totals.P}</div><div class="label">Present</div></div>
      <div class="stat-card"><div class="number absent">${totals.A}</div><div class="label">Absent</div></div>
      <div class="stat-card"><div class="number late">${totals.L}</div><div class="label">Late</div></div>
      <div class="stat-card"><div class="number excused">${totals.E}</div><div class="label">Excused</div></div>
      <div class="stat-card"><div class="number rate">${rate}%</div><div class="label">Attendance Rate</div></div>
    `;
    }

    function renderTable(wrap, rows) {
        window.DataTable?.create(wrap, {
            rowKey: 'id',
            pageSize: 20,
            columns: [
                { key: 'name', label: 'Student', sortable: true, render: (r) => `${esc(r.name)} ${r.atRisk ? '<span class="attendance-event-badge" style="background:rgba(196,90,74,0.12); color:var(--attendance-absent,#c45a4a);">At Risk</span>' : ''}` },
                { key: 'classId', label: 'Class', sortable: true },
                { key: 'rate', label: 'Rate', sortable: true, align: 'center', render: (r) => `<span class="attendance-days-badge ${r.rate < AT_RISK_THRESHOLD ? 'danger' : (r.rate < 90 ? 'warning' : 'good')}">${r.rate}%</span>` }
            ],
            data: rows,
            onRowClick: (row) => window.Router?.navigate('student-profile', { studentId: row.id }),
            emptyState: { title: 'No data yet', message: 'No attendance recorded in this range.' }
        });
    }

    return { render };
})();

// ─── EXPOSE ─────────────────────────────────────────────────────────
// window.AttendanceSummary was never assigned anywhere in this file, and the router
// looks up window.renderAttendanceSummary specifically (see core/router.js's
// moduleIdToRenderFn) — this page was completely unreachable via navigation
// despite being fully built.
window.AttendanceSummary = AttendanceSummary;
window.renderAttendanceSummary = async (container, params = {}) => {
    if (params && params.classId && typeof canAccessClass === 'function' && !canAccessClass(params.classId)) {
        if (container) container.innerHTML = `<div class="module-wrap"><div class="alert alert-danger" style="margin:24px;">
            <i class="fa-solid fa-lock"></i>
            <strong>Access denied</strong></div></div>`;
        return;
    }
    return AttendanceSummary.render(container, params);
};
