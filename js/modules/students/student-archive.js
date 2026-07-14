/* ═══════════════════════════════════════════════════════════════════
   js/modules/students/student-archive.js
   ═══════════════════════════════════════════════════════════════════
   Students who are no longer active (graduated, transferred, or
   manually archived). Restorable back to active status with a
   confirmation, since restoring affects class rosters and fee
   assignments going forward.
   ═══════════════════════════════════════════════════════════════════ */

const StudentArchive = (() => {

  // MOCK_DATA — replace with core/api.js (status != 'active')
  const MOCK_ARCHIVED = [
    { id: 'STU-2019-0210', name: 'TUYISHIME Alice', classId: 'Primary 6', status: 'graduated', date: '2026-06-28', reason: 'Completed Primary 6' },
    { id: 'STU-2020-0004', name: 'MUGABO Patrick', classId: 'Primary 6', status: 'transferred', date: '2026-05-15', reason: 'Family relocated to Kigali' },
    { id: 'STU-2018-0077', name: 'NDAYAMBAJE Eric', classId: 'Primary 5B', status: 'transferred', date: '2026-03-02', reason: 'Transferred to St. Joseph School' },
    { id: 'STU-2017-0012', name: 'UWIMANA Claudine', classId: 'Primary 6', status: 'graduated', date: '2025-11-20', reason: 'Completed Primary 6' },
    { id: 'STU-2021-0303', name: 'HAKIZIMANA Paul', classId: 'Primary 3A', status: 'archived', date: '2026-02-10', reason: 'Withdrawn \u2014 non-payment' }
  ];

  function escapeHTML(str) {
    const div = document.createElement('div');
    div.textContent = str ?? '';
    return div.innerHTML;
  }

  function render(container) {
    if (!container) return;
    container.innerHTML = `
      <div class="dashboard-page">
        <div class="archive-filter-row">
          <div class="form-input-wrap flex-1" style="max-width:280px;">
            <span class="form-input-wrap__icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg></span>
            <input type="text" class="form-input" id="arch-search" placeholder="Search archived students..." />
          </div>
          <select class="form-select" id="arch-reason-filter">
            <option value="">All reasons</option>
            <option value="graduated">Graduated</option>
            <option value="transferred">Transferred</option>
            <option value="archived">Withdrawn / Other</option>
          </select>
          <span class="result-count" id="arch-count"></span>
        </div>
        <div id="arch-table-wrap" style="margin-top:14px;"></div>
      </div>
    `;

    container.querySelector('#arch-search').addEventListener('input', () => renderTable(container));
    container.querySelector('#arch-reason-filter').addEventListener('change', () => renderTable(container));

    renderTable(container);
  }

  function filtered(container) {
    const q = container.querySelector('#arch-search').value.trim().toLowerCase();
    const reason = container.querySelector('#arch-reason-filter').value;
    return MOCK_ARCHIVED.filter(s => {
      if (q && !s.name.toLowerCase().includes(q) && !s.id.toLowerCase().includes(q)) return false;
      if (reason && s.status !== reason) return false;
      return true;
    });
  }

  function renderTable(container) {
    const data = filtered(container);
    container.querySelector('#arch-count').textContent = `${data.length} student${data.length === 1 ? '' : 's'}`;
    const wrap = container.querySelector('#arch-table-wrap');

    window.DataTable?.create(wrap, {
      rowKey: 'id',
      pageSize: 20,
      columns: [
        { key: 'name', label: 'Student', sortable: true, render: (s) => `<div style="font-weight:600;">${escapeHTML(s.name)}</div><div style="font-size:0.68rem; color:var(--card-text-muted,#475569);">${escapeHTML(s.id)}</div>` },
        { key: 'classId', label: 'Last Class', sortable: true },
        { key: 'status', label: 'Status', align: 'center', render: (s) => `<span class="student-status-badge ${s.status}">${s.status}</span>` },
        { key: 'date', label: 'Date', sortable: true },
        { key: 'reason', label: 'Reason', render: (s) => `<span class="archive-reason-badge">${escapeHTML(s.reason)}</span>` },
        { key: 'actions', label: '', align: 'right', render: (s) => `<button class="btn btn-sm btn-outline" data-restore="${s.id}">Restore</button>` }
      ],
      data,
      onRowClick: (row) => window.Router?.navigate('student-profile', { studentId: row.id }),
      emptyState: { title: 'No archived students', message: 'Graduated, transferred, or withdrawn students will appear here.' }
    });

    wrap.querySelectorAll('[data-restore]').forEach(btn => {
      btn.addEventListener('click', (e) => { e.stopPropagation(); restoreStudent(container, btn.dataset.restore); });
    });
  }

  async function restoreStudent(container, studentId) {
    const student = MOCK_ARCHIVED.find(s => s.id === studentId);
    const confirmed = await window.Modals?.confirm({
      title: 'Restore this student?',
      message: `${student.name} will be reactivated into ${student.classId} with active status. Fee assignments for the current term will need to be reviewed.`,
      confirmLabel: 'Restore',
      tone: 'info'
    });
    if (!confirmed) return;

    // TODO(api): core/api.js status update back to 'active'
    window.Toast?.success('Student restored', `${student.name} is now active in ${student.classId}.`);
    renderTable(container);
  }

  return { render };
})();
