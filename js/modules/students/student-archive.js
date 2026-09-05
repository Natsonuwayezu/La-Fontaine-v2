/* ═══════════════════════════════════════════════════════════════════
   js/modules/students/student-archive.js
   ═══════════════════════════════════════════════════════════════════
   Students who are no longer active (graduated, transferred, or
   manually archived). Restorable back to active status with a
   confirmation, since restoring affects class rosters and fee
   assignments going forward.

   Reads real state.students where status != 'Active'. There's no
   dedicated archive_reason/archived_at column on the real students
   table yet (a real gap worth adding later) -- "Date" uses updated_at
   as the best available proxy for when the status last changed, and
   "Reason" shows s.archive_reason if present, '—' otherwise, rather
   than fabricating one.

   Last updated: 2026-07-29
   ═══════════════════════════════════════════════════════════════════ */

const StudentArchive = (() => {

  function escapeHTML(str) {
    const div = document.createElement('div');
    div.textContent = str ?? '';
    return div.innerHTML;
  }

  function getArchived() {
    const classMap = new Map((state.classes || []).map(c => [c.id, c.name]));
    return (state.students || [])
      .filter(s => !s.is_deleted && (s.status || 'Active') !== 'Active')
      .map(s => ({
        id: s.id,
        name: `${s.first_name || ''} ${s.last_name || ''}`.trim() || `Student #${s.id}`,
        classId: classMap.get(s.class_id) || '—',
        status: s.status,
        date: s.updated_at ? s.updated_at.slice(0, 10) : '—',
        reason: s.archive_reason || '—',
      }));
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
            <option value="">All statuses</option>
            <option value="Graduated">Graduated</option>
            <option value="Transferred">Transferred</option>
            <option value="Archived">Withdrawn / Other</option>
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
    const status = container.querySelector('#arch-reason-filter').value;
    return getArchived().filter(s => {
      if (q && !s.name.toLowerCase().includes(q)) return false;
      if (status && s.status !== status) return false;
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
        { key: 'name', label: 'Student', sortable: true, render: (s) => `<div style="font-weight:600;">${escapeHTML(s.name)}</div>` },
        { key: 'classId', label: 'Last Class', sortable: true },
        { key: 'status', label: 'Status', align: 'center', render: (s) => `<span class="student-status-badge ${escapeHTML((s.status || '').toLowerCase())}">${escapeHTML(s.status)}</span>` },
        { key: 'date', label: 'Date', sortable: true, render: (s) => s.date !== '—' ? esc(fmtDate(s.date)) : '—' },
        { key: 'reason', label: 'Reason', render: (s) => `<span class="archive-reason-badge">${escapeHTML(s.reason)}</span>` },
        { key: 'actions', label: '', align: 'right', render: (s) => `<button class="btn btn-sm btn-outline" data-restore="${s.id}">Restore</button>` }
      ],
      data,
      onRowClick: (row) => window.navigateTo('student-profile', { studentId: row.id }),
      emptyState: { title: 'No archived students', message: 'Graduated, transferred, or withdrawn students will appear here.' }
    });

    wrap.querySelectorAll('[data-restore]').forEach(btn => {
      btn.addEventListener('click', (e) => { e.stopPropagation(); restoreStudent(container, parseInt(btn.dataset.restore, 10)); });
    });
  }

  async function restoreStudent(container, studentId) {
    const student = getArchived().find(s => s.id === studentId);
    if (!student) return;

    const confirmed = await window.confirmDialog(
      `${student.name} will be reactivated into ${student.classId} with active status. Fee assignments for the current term will need to be reviewed.`,
      'Restore this student?',
      { confirmText: 'Restore' }
    );
    if (!confirmed) return;

    try {
      await update('students', studentId, { status: 'Active' });
      const raw = (state.students || []).find(s => s.id === studentId);
      if (raw) raw.status = 'Active';
      window.Toast?.success('Student restored', `${student.name} is now active in ${student.classId}.`);
      renderTable(container);
    } catch (err) {
      window.Toast?.error('Could not restore student', err?.message);
    }
  
    if (typeof loadAllData === 'function') loadAllData({ silent: true }).catch(() => {});}

  return { render };
})();

// ─── EXPOSE ─────────────────────────────────────────────────────────

window.StudentArchive = StudentArchive;
window.renderStudentArchive = StudentArchive.render;
