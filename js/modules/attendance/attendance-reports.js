/* ═══════════════════════════════════════════════════════════════════
   js/modules/attendance/attendance-reports.js
   ═══════════════════════════════════════════════════════════════════
   Generates a per-student attendance report over a date range,
   optionally scoped to one class. Markup matches css/modules/
   attendance.css's .attendance-report-filters/.attendance-ranking-list
   exactly (verified against the file). Real data via window.getWhere
   on the 'attendance' table + window.countAttendance/computeAttendanceRate
   from core/formulas.js.
   ═══════════════════════════════════════════════════════════════════ */

const AttendanceReports = (() => {

  function esc(str) {
    if (window.esc) return window.esc(str);
    const div = document.createElement('div');
    div.textContent = str ?? '';
    return div.innerHTML;
  }

  function today() {
    return window.todayISO ? window.todayISO() : new Date().toISOString().slice(0, 10);
  }

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
            <select id="rep-class-select"><option value="">All classes</option>${classOptions()}</select>
          </div>
          <div class="filter-group">
            <label>From</label>
            <input type="date" id="rep-start-date" value="${firstOfMonth()}" max="${today()}" />
          </div>
          <div class="filter-group">
            <label>To</label>
            <input type="date" id="rep-end-date" value="${today()}" max="${today()}" />
          </div>
          <button class="btn btn-generate" id="rep-generate-btn">Generate Report</button>
          <button class="btn btn-export" id="rep-export-btn">Export</button>
        </div>
        <div class="two-col">
          <div class="dash-card">
            <div class="dash-card-header"><span class="dash-card-title">Attendance by Student</span><span class="dash-card-action" id="rep-range-label"></span></div>
            <div class="dash-card-body no-padding" id="rep-table-wrap"></div>
          </div>
          <div class="dash-card">
            <div class="dash-card-header"><span class="dash-card-title">Lowest Attendance</span></div>
            <div class="dash-card-body"><div class="attendance-ranking-list" id="rep-ranking-list"></div></div>
          </div>
        </div>
      </div>
    `;

    container.querySelector('#rep-generate-btn').addEventListener('click', () => generate(container));
    container.querySelector('#rep-export-btn').addEventListener('click', () => exportReport());

    generate(container); // sensible default view on first load
  }

  function classOptions() {
    if (window.state?.classes?.length) {
      return window.state.classes.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('');
    }
    return [...CLASS_LEVELS.nursery, ...CLASS_LEVELS.primary].map(c => `<option value="${c}">${c}</option>`).join('');
  }

  let lastReportRows = [];

  async function generate(container) {
    const classId = container.querySelector('#rep-class-select').value;
    const start = container.querySelector('#rep-start-date').value;
    const end = container.querySelector('#rep-end-date').value;
    container.querySelector('#rep-range-label').textContent = `${start} \u2192 ${end}`;

    const tableWrap = container.querySelector('#rep-table-wrap');
    if (window.Skeletons) window.Skeletons.showTableRows(tableWrap, { columns: 6, rows: 6 });

    const records = await fetchAttendanceRange(classId, start, end);
    const students = await fetchStudentsForRecords(records, classId);

    const rows = students.map(s => {
      const studentRecords = records.filter(r => r.student_id === s.id);
      const counts = window.countAttendance ? window.countAttendance(studentRecords) : fallbackCount(studentRecords);
      const rate = window.computeAttendanceRate ? window.computeAttendanceRate(counts) : fallbackRate(counts);
      const risk = window.getAttendanceRisk ? window.getAttendanceRisk(rate) : fallbackRisk(rate);
      return { id: s.id, name: s.name, classId: s.classId, ...counts, rate, risk };
    }).sort((a, b) => a.rate - b.rate);

    lastReportRows = rows;
    renderReportTable(tableWrap, rows);
    renderRankingList(container.querySelector('#rep-ranking-list'), rows);
  }

  function fallbackCount(records) {
    return records.reduce((acc, r) => { acc[r.status] = (acc[r.status] || 0) + 1; return acc; }, { P: 0, A: 0, L: 0, E: 0 });
  }
  function fallbackRate(counts) {
    const total = counts.P + counts.A + counts.L + counts.E;
    return total ? Math.round(((counts.P + counts.L * 0.5 + counts.E) / total) * 100) : 0;
  }
  function fallbackRisk(rate) {
    if (rate < 75) return { label: 'At Risk', color: 'danger' };
    if (rate < 90) return { label: 'Warning', color: 'warning' };
    return { label: 'Good', color: 'good' };
  }

  async function fetchAttendanceRange(classId, start, end) {
    if (!window.getWhere) return [];
    const filters = [`date=gte.${start}`, `date=lte.${end}`];
    if (classId) filters.push(`class_id=eq.${classId}`);
    try {
      return await window.getWhere('attendance', filters.join('&'));
    } catch (err) {
      console.warn('AttendanceReports: getWhere(attendance) failed', err);
      return [];
    }
  }

  async function fetchStudentsForRecords(records, classId) {
    const ids = [...new Set(records.map(r => r.student_id))];
    if (window.state?.students?.length) {
      const pool = classId ? window.getStudentsInClass?.(classId) || window.state.students : window.state.students;
      return pool
        .filter(s => ids.length === 0 || ids.includes(s.id))
        .map(s => ({ id: s.id, name: s.full_name || `${s.first_name || ''} ${s.last_name || ''}`.trim(), classId: window.getClass?.(s.class_id)?.name || s.class_id }));
    }
    // Fallback so the report page isn't blank before real data loads.
    console.warn('AttendanceReports: no real student directory available — showing an empty report until core/state.js has data.');
    return [];
  }

  function renderReportTable(wrap, rows) {
    window.DataTable?.create(wrap, {
      rowKey: 'id',
      pageSize: 15,
      columns: [
        { key: 'name', label: 'Student', sortable: true, render: (r) => `${esc(r.name)} <span style="font-size:0.68rem;color:var(--card-text-muted,#475569);">${esc(r.id)}</span>` },
        { key: 'classId', label: 'Class', sortable: true },
        { key: 'P', label: 'Present', align: 'center', render: (r) => `<span class="attendance-status-badge present">${r.P}</span>` },
        { key: 'A', label: 'Absent', align: 'center', render: (r) => `<span class="attendance-status-badge absent">${r.A}</span>` },
        { key: 'L', label: 'Late', align: 'center', render: (r) => `<span class="attendance-status-badge late">${r.L}</span>` },
        { key: 'E', label: 'Excused', align: 'center', render: (r) => `<span class="attendance-status-badge excused">${r.E}</span>` },
        { key: 'rate', label: 'Rate', sortable: true, align: 'center', render: (r) => `<span class="attendance-days-badge ${r.risk.color === 'good' ? 'good' : (r.risk.color === 'warning' ? 'warning' : 'danger')}">${r.rate}%</span>` }
      ],
      data: rows,
      emptyState: { title: 'No attendance records', message: 'No attendance was recorded in this date range yet.' }
    });
  }

  function renderRankingList(el, rows) {
    const bottom5 = [...rows].slice(0, 5);
    if (!bottom5.length) {
      window.EmptyStates?.renderInto(el, { title: 'No data', message: 'Generate a report to see rankings.' });
      return;
    }
    const medalClass = ['gold', 'silver', 'bronze'];
    el.innerHTML = bottom5.map((r, i) => `
      <div class="rank-item">
        <span class="pos ${medalClass[i] || ''}">${i + 1}</span>
        <div class="info"><div class="name">${esc(r.name)}</div><div class="class">${esc(r.classId || '')}</div></div>
        <span class="rate">${r.rate}%</span>
      </div>
    `).join('');
  }

  function exportReport() {
    if (!lastReportRows.length) {
      window.Toast?.warning('Nothing to export', 'Generate a report first.');
      return;
    }
    let worker;
    try { worker = new Worker('js/workers/export-worker.js'); }
    catch { window.Toast?.error('Export unavailable', 'Web Workers are not supported in this environment.'); return; }

    worker.onmessage = (e) => {
      const { type, payload } = e.data;
      if (type === 'COMPLETE') {
        const url = URL.createObjectURL(payload.blob);
        const a = document.createElement('a');
        a.href = url; a.download = `attendance-report-${new Date().toISOString().slice(0, 10)}.xlsx`;
        document.body.appendChild(a); a.click(); a.remove();
        URL.revokeObjectURL(url);
        window.Toast?.success('Export ready');
        worker.terminate();
      } else if (type === 'ERROR') {
        window.Toast?.error('Export failed', payload.message);
        worker.terminate();
      }
    };

    worker.postMessage({
      type: 'EXPORT_XLSX',
      payload: {
        sheets: [{
          name: 'Attendance Report',
          rows: lastReportRows.map(r => ({
            'Student Code': r.id, 'Name': r.name, 'Class': r.classId,
            'Present': r.P, 'Absent': r.A, 'Late': r.L, 'Excused': r.E, 'Rate %': r.rate
          }))
        }]
      }
    });
  }

  return { render };
})();

// ─── EXPOSE ─────────────────────────────────────────────────────────
// window.AttendanceReports was never assigned anywhere in this file, and the router
// looks up window.renderAttendanceReports specifically (see core/router.js's
// moduleIdToRenderFn) — this page was completely unreachable via navigation
// despite being fully built.
window.AttendanceReports = AttendanceReports;
window.renderAttendanceReports = AttendanceReports.render;
