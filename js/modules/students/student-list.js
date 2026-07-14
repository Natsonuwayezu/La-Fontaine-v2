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

  // MOCK_DATA — replace with core/api.js
  const MOCK_STUDENTS = [
    { id: 'STU-2024-0012', name: 'MUGISHA Jean', classId: 'Primary 4A', status: 'active', feeStatus: 'partial', gender: 'M' },
    { id: 'STU-2023-0088', name: 'UWERA Grace', classId: 'Primary 5B', status: 'active', feeStatus: 'paid', gender: 'F' },
    { id: 'STU-2022-0140', name: 'HABIMANA Eric', classId: 'Primary 6', status: 'active', feeStatus: 'unpaid', gender: 'M' },
    { id: 'STU-2024-0201', name: 'KAMALI Moses', classId: 'Primary 3A', status: 'active', feeStatus: 'paid', gender: 'M' },
    { id: 'STU-2024-0202', name: 'KAMALI Jean', classId: 'Primary 2', status: 'active', feeStatus: 'partial', gender: 'M' },
    { id: 'STU-2023-0175', name: 'NIYONZIMA Claude', classId: 'Primary 1', status: 'active', feeStatus: 'paid', gender: 'M' },
    { id: 'STU-2021-0033', name: 'INGABIRE Sarah', classId: 'Primary 2', status: 'active', feeStatus: 'unpaid', gender: 'F' },
    { id: 'STU-2020-0004', name: 'MUGABO Patrick', classId: 'Primary 6', status: 'transferred', feeStatus: 'paid', gender: 'M' },
    { id: 'STU-2019-0210', name: 'TUYISHIME Alice', classId: 'Primary 6', status: 'graduated', feeStatus: 'paid', gender: 'F' }
  ];

  let currentView = 'table';
  let table = null;
  let workerIndexed = false;

  function escapeHTML(str) {
    const div = document.createElement('div');
    div.textContent = str ?? '';
    return div.innerHTML;
  }

  function initials(name) {
    return name.split(' ').map(w => w[0]).slice(0, 2).join('');
  }

  function ensureSearchWorker() {
    if (!window.searchWorkerInstance && window.Worker) {
      try { window.searchWorkerInstance = new Worker('js/workers/search-worker.js'); }
      catch { window.searchWorkerInstance = null; }
    }
    if (window.searchWorkerInstance && !workerIndexed) {
      window.searchWorkerInstance.postMessage({ type: 'INDEX', payload: { collection: 'students', items: MOCK_STUDENTS, fields: ['name', 'id'] } });
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
    ensureSearchWorker();

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
  }

  function populateClassFilter(container) {
    const select = container.querySelector('#stu-class-filter');
    const classes = [...CLASS_LEVELS.nursery, ...CLASS_LEVELS.primary];
    select.innerHTML += classes.map(c => `<option value="${c}">${c}</option>`).join('');
  }

  function getFilteredData(container) {
    const search = container.querySelector('#stu-search').value.trim().toLowerCase();
    const classFilter = container.querySelector('#stu-class-filter').value;
    const statusFilter = container.querySelector('#stu-status-filter').value;

    return MOCK_STUDENTS.filter(s => {
      if (search && !s.name.toLowerCase().includes(search) && !s.id.toLowerCase().includes(search)) return false;
      if (classFilter && s.classId !== classFilter) return false;
      if (statusFilter && s.status !== statusFilter) return false;
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
                <div style="font-size:0.68rem; color:var(--card-text-muted,#475569);">${escapeHTML(s.id)}</div>
              </div>
            </div>`
        },
        { key: 'classId', label: 'Class', sortable: true },
        { key: 'status', label: 'Status', align: 'center', render: (s) => `<span class="student-status-badge ${s.status}">${s.status}</span>` },
        { key: 'feeStatus', label: 'Fee Status', align: 'center', render: (s) => `<span class="fee-status-chip ${s.feeStatus}">${s.feeStatus}</span>` },
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
        <div class="student-card__class">${escapeHTML(s.classId)}</div>
        <div class="student-card__badges">
          <span class="student-status-badge ${s.status}">${s.status}</span>
          <span class="fee-status-chip ${s.feeStatus}">${s.feeStatus}</span>
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
          window.Toast?.success('Export started', `Preparing export for ${selectedIds.length} students.`);
        } else {
          window.Router?.navigate('student-promotion');
        }
      };
    });
  }

  return { render };
})();
