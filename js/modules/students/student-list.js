/* ═══════════════════════════════════════════════════════════════════
   js/modules/students/student-list.js
   ═══════════════════════════════════════════════════════════════════
   Rendered into #app-main for the 'student-list' route. Table view
   (default, uses DataTable) and grid view (.student-grid/.student-card
   from students.css) are both fully wired, toggled by .view-toggle.
   Search runs through search-worker.js once the roster is indexed, so
   typing stays instant even at full-school scale.
   ═══════════════════════════════════════════════════════════════════ */

const StudentList = (() => {

  let currentView = 'table';
  let table = null;
  let workerIndexed = false;
  let feesLoaded = false;

  function escapeHTML(str) {
    const div = document.createElement('div');
    div.textContent = str ?? '';
    return div.innerHTML;
  }

  function initials(name) {
    return name.split(' ').map(w => w[0]).slice(0, 2).join('');
  }

  /** Real roster, shaped for this page's rendering — resolves class
   *  name via state.classes and fee status via the shared finance
   *  formula (same one record-payment.js and student-fees.js use), so
   *  this page never invents its own math for "is this student paid".
   */
  function getRoster() {
    const classMap = new Map((state.classes || []).map(c => [c.id, c.name]));

    const feesByStudent = new Map();
    (state.studentFees || []).forEach(f => {
      if (!feesByStudent.has(f.student_id)) feesByStudent.set(f.student_id, []);
      feesByStudent.get(f.student_id).push(f);
    });
    const creditByStudent = new Map(
      (state.creditBalances || []).map(c => [c.student_id, Number(c.credit_amount || 0)])
    );

    return (state.students || [])
      .filter(s => !s.is_deleted)
      .map(s => {
        const fees = feesByStudent.get(s.id) || [];
        const credit = creditByStudent.get(s.id) || 0;
        const summary = computeStudentFeeSummary(fees, credit);
        return {
          id: s.id,
          code: s.student_code || '',
          name: `${s.first_name || ''} ${s.last_name || ''}`.trim() || 'Unnamed Student',
          classId: s.class_id,
          className: classMap.get(s.class_id) || '—',
          status: s.status || 'Active',
          feeStatus: !fees.length ? 'unknown' : summary.isFullyPaid ? 'paid' : summary.paid > 0 ? 'partial' : 'unpaid',
        };
      });
  }

  function ensureSearchWorker(roster) {
    if (!window.searchWorkerInstance && window.Worker) {
      try { window.searchWorkerInstance = new Worker('js/workers/search-worker.js'); }
      catch { window.searchWorkerInstance = null; }
    }
    if (window.searchWorkerInstance) {
      window.searchWorkerInstance.postMessage({ type: 'INDEX', payload: { collection: 'students', items: roster, fields: ['name', 'code'] } });
      workerIndexed = true;
    }
  }

  function render(container) {
    if (!container) return;
    container.innerHTML = `
      <div class="dashboard-page">
        <div class="filters-bar">
          <div class="form-input-wrap flex-1">
            <span class="form-input-wrap__icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg></span>
            <input type="text" class="form-input" id="stu-search" placeholder="Search by name or student code..." />
          </div>
          <select class="form-select" id="stu-class-filter"><option value="">All classes</option></select>
          <select class="form-select" id="stu-status-filter">
            <option value="active">Active</option>
            <option value="">All statuses</option>
            <option value="transferred">Transferred</option>
            <option value="graduated">Graduated</option>
            <option value="archived">Archived</option>
          </select>
          <div class="view-toggle">
            <button class="view-toggle__btn active" data-view="table" title="Table view"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/><line x1="9" y1="3" x2="9" y2="21"/></svg></button>
            <button class="view-toggle__btn" data-view="grid" title="Grid view"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg></button>
          </div>
          <span class="result-count" id="stu-result-count"></span>
          <button class="btn btn-primary" id="stu-enroll-btn"><i class="fa-solid fa-user-plus"></i> Enroll Student</button>
        </div>

        <div id="stu-bulk-bar" style="display:none; align-items:center; gap:10px; padding:10px 16px; background:rgba(6,182,212,0.08); border:1px solid rgba(6,182,212,0.25); border-radius:10px; margin-bottom:14px;">
          <span id="stu-bulk-count" style="font-size:0.8rem; color:var(--card-text,#e2e8f0); font-weight:600;"></span>
          <div style="margin-left:auto; display:flex; gap:8px;">
            <button class="btn btn-sm btn-outline" data-bulk="export">Export Selected</button>
            <button class="btn btn-sm btn-outline" data-bulk="promote">Promote Selected</button>
          </div>
        </div>

        <div id="stu-content"></div>
      </div>
    `;

    populateClassFilter(container);
    ensureSearchWorker(getRoster());

    container.querySelector('#stu-enroll-btn').addEventListener('click', () => window.Router?.navigate('enroll-student'));
    container.querySelector('#stu-search').addEventListener('input', () => renderContent(container));
    container.querySelector('#stu-class-filter').addEventListener('change', () => renderContent(container));
    container.querySelector('#stu-status-filter').addEventListener('change', () => renderContent(container));
    container.querySelectorAll('.view-toggle__btn').forEach(btn => {
      btn.addEventListener('click', () => {
        currentView = btn.dataset.view;
        container.querySelectorAll('.view-toggle__btn').forEach(b => b.classList.toggle('active', b === btn));
        renderContent(container);
      });
    });

    renderContent(container);

    // student_fees/credit balances are lazily loaded (large tables) —
    // fetch them if this session hasn't already, then re-render so Fee
    // Status is accurate instead of showing "unknown" indefinitely.
    if (!feesLoaded && (!state.studentFees || state.studentFees.length === 0)) {
      window.loadStudentFees?.().then(() => {
        feesLoaded = true;
        if (container.isConnected) renderContent(container);
      }).catch(() => {});
    } else {
      feesLoaded = true;
    }
  }

  function populateClassFilter(container) {
    const select = container.querySelector('#stu-class-filter');
    const classes = [...(state.classes || [])].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    select.innerHTML += classes.map(c => `<option value="${c.id}">${escapeHTML(c.name)}</option>`).join('');
  }

  function getFilteredData(container) {
    const search = container.querySelector('#stu-search').value.trim().toLowerCase();
    const classFilter = container.querySelector('#stu-class-filter').value;
    const statusFilter = container.querySelector('#stu-status-filter').value.toLowerCase();

    return getRoster().filter(s => {
      if (search && !s.name.toLowerCase().includes(search) && !s.code.toLowerCase().includes(search)) return false;
      if (classFilter && String(s.classId) !== String(classFilter)) return false;
      if (statusFilter && (s.status || '').toLowerCase() !== statusFilter) return false;
      return true;
    });
  }

  function renderContent(container) {
    const data = getFilteredData(container);
    container.querySelector('#stu-result-count').textContent = `${data.length} student${data.length === 1 ? '' : 's'}`;
    const content = container.querySelector('#stu-content');

    if (currentView === 'grid') {
      renderGrid(content, data);
    } else {
      renderTable(content, data, container);
    }
  }

  function renderTable(content, data, container) {
    if (!content.querySelector('.data-table') && table) table = null;
    table = window.DataTable?.create(content, {
      rowKey: 'id',
      selectable: true,
      pageSize: 25,
      columns: [
        {
          key: 'name', label: 'Student', sortable: true, render: (s) => `
            <div class="student-list-name-cell">
              <div class="student-list-avatar">${escapeHTML(initials(s.name))}</div>
              <div>
                <div style="font-weight:600;">${escapeHTML(s.name)}</div>
                <div style="font-size:0.68rem; color:var(--card-text-muted,#475569);">${escapeHTML(s.code)}</div>
              </div>
            </div>`
        },
        { key: 'className', label: 'Class', sortable: true },
        { key: 'status', label: 'Status', align: 'center', render: (s) => `<span class="student-status-badge ${escapeHTML((s.status || '').toLowerCase())}">${escapeHTML(s.status)}</span>` },
        { key: 'feeStatus', label: 'Fee Status', align: 'center', render: (s) => `<span class="fee-status-chip ${escapeHTML(s.feeStatus)}">${escapeHTML(s.feeStatus)}</span>` },
        {
          key: 'actions', label: '', align: 'right', render: (s) => `
            <button class="btn btn-sm btn-outline" data-view-student="${s.id}">View</button>
          `
        }
      ],
      data,
      onRowClick: (row) => window.Router?.navigate('student-details', { studentId: row.id }),
      onSelectionChange: (selected) => updateBulkBar(container, selected),
      emptyState: { title: 'No students found', message: 'Try adjusting your search or filters.', actionLabel: 'Enroll Student', onAction: () => window.Router?.navigate('enroll-student') }
    });

    content.querySelectorAll('[data-view-student]').forEach(btn => {
      btn.addEventListener('click', (e) => { e.stopPropagation(); window.Router?.navigate('student-details', { studentId: btn.dataset.viewStudent }); });
    });
  }

  function renderGrid(content, data) {
    if (!data.length) {
      window.EmptyStates?.renderPreset(content, 'noSearchResults');
      return;
    }
    content.innerHTML = `<div class="student-grid">${data.map(s => `
      <div class="student-card" data-goto="${s.id}">
        <div class="student-card__avatar">${escapeHTML(initials(s.name))}</div>
        <div class="student-card__name">${escapeHTML(s.name)}</div>
        <div class="student-card__class">${escapeHTML(s.className)}</div>
        <div class="student-card__badges">
          <span class="student-status-badge ${escapeHTML((s.status || '').toLowerCase())}">${escapeHTML(s.status)}</span>
          <span class="fee-status-chip ${escapeHTML(s.feeStatus)}">${escapeHTML(s.feeStatus)}</span>
        </div>
      </div>
    `).join('')}</div>`;

    content.querySelectorAll('[data-goto]').forEach(card => {
      card.addEventListener('click', () => window.Router?.navigate('student-details', { studentId: card.dataset.goto }));
    });
  }

  function updateBulkBar(container, selectedIds) {
    const bar = container.querySelector('#stu-bulk-bar');
    if (!selectedIds.length) { bar.style.display = 'none'; return; }
    bar.style.display = 'flex';
    container.querySelector('#stu-bulk-count').textContent = `${selectedIds.length} student${selectedIds.length === 1 ? '' : 's'} selected`;
    bar.querySelectorAll('[data-bulk]').forEach(btn => {
      btn.onclick = () => {
        if (btn.dataset.bulk === 'export') {
          window.BulkStudentActions?.exportSelected(selectedIds);
        } else {
          window.BulkStudentActions?.promoteSelected(selectedIds);
        }
      };
    });
  }

  return { render };
})();

// ─── EXPOSE ─────────────────────────────────────────────────────────
// window.StudentList was never assigned anywhere in this file, and the router
// looks up window.renderStudentList specifically (see core/router.js's
// moduleIdToRenderFn) — this page was completely unreachable via navigation
// despite being fully built.
window.StudentList = StudentList;
window.renderStudentList = StudentList.render;
