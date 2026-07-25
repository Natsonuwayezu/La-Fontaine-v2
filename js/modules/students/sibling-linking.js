/* ═══════════════════════════════════════════════════════════════════
   js/modules/students/sibling-linking.js — Sibling/family link picker
   ═══════════════════════════════════════════════════════════════════
   A focused, reusable component rather than a full page: a searchable
   picker modal for finding an existing student (or family) to link a
   student to. Used by:
   - family-management.js (linking two existing students into one family)
   - enroll-student.js (step 2: "does this student have siblings already
     enrolled?")

   SiblingLinking.openPicker({
     excludeStudentId,      // don't show the student being linked, in results
     onSelect(student),     // called with the chosen student record
     title, subtitle
   })

   MOCK_DATA search pool below stands in for core/api.js's student
   search until that exists; search-worker.js integration (INDEX once,
   QUERY per keystroke) is wired so this scales to the full roster
   without re-filtering client-side on every keypress once real data
   volume warrants it.
   ═══════════════════════════════════════════════════════════════════ */

const SiblingLinking = (() => {

  const MOCK_STUDENTS = [
    { id: 'STU-2024-0012', name: 'MUGISHA Jean', classId: 'Primary 4A', familyId: null },
    { id: 'STU-2024-0013', name: 'MUGISHA Aline', classId: 'Primary 2', familyId: null },
    { id: 'STU-2023-0088', name: 'UWERA Grace', classId: 'Primary 5B', familyId: 'FAM-0041' },
    { id: 'STU-2023-0089', name: 'UWERA Divine', classId: 'Primary 1', familyId: 'FAM-0041' },
    { id: 'STU-2022-0140', name: 'HABIMANA Eric', classId: 'Primary 6', familyId: null },
    { id: 'STU-2024-0201', name: 'KAMALI Moses', classId: 'Primary 3A', familyId: null },
    { id: 'STU-2024-0202', name: 'KAMALI Jean', classId: 'Primary 2', familyId: null },
    { id: 'STU-2023-0175', name: 'NIYONZIMA Claude', classId: 'Primary 1', familyId: null }
  ];

  let workerIndexed = false;

  function ensureWorker() {
    if (!window.searchWorkerInstance && window.Worker) {
      try {
        window.searchWorkerInstance = new Worker('js/workers/search-worker.js');
      } catch {
        window.searchWorkerInstance = null; // e.g. file:// protocol without a server
      }
    }
    if (window.searchWorkerInstance && !workerIndexed) {
      window.searchWorkerInstance.postMessage({
        type: 'INDEX',
        payload: { collection: 'siblingPicker', items: MOCK_STUDENTS, fields: ['name', 'id'] }
      });
      workerIndexed = true;
    }
  }

  function escapeHTML(str) {
    const div = document.createElement('div');
    div.textContent = str ?? '';
    return div.innerHTML;
  }

  function localFilter(query, excludeId) {
    const q = query.trim().toLowerCase();
    return MOCK_STUDENTS
      .filter(s => s.id !== excludeId)
      .filter(s => !q || s.name.toLowerCase().includes(q) || s.id.toLowerCase().includes(q));
  }

  function renderResults(modal, results) {
    const list = modal.querySelector('[data-results]');
    if (!results.length) {
      list.innerHTML = `<div style="padding:20px; text-align:center; color:var(--card-text-muted,#475569); font-size:0.82rem;">No students found.</div>`;
      return;
    }
    list.innerHTML = results.map(s => `
      <div class="family-tree-node" style="cursor:pointer;" data-pick="${s.id}">
        <div class="family-tree-node__avatar">${escapeHTML(s.name.split(' ').map(w => w[0]).slice(0, 2).join(''))}</div>
        <div>
          <div class="family-tree-node__name">${escapeHTML(s.name)}</div>
          <div class="family-tree-node__relation">${escapeHTML(s.classId)} \u00b7 ${escapeHTML(s.id)}${s.familyId ? ' \u00b7 Already in a family' : ''}</div>
        </div>
      </div>
    `).join('');

    list.querySelectorAll('[data-pick]').forEach(row => {
      row.addEventListener('click', () => {
        const student = MOCK_STUDENTS.find(s => s.id === row.dataset.pick);
        modal.dispatchEvent(new CustomEvent('pickerSelect', { detail: student }));
      });
    });
  }

  window.Modals?.register('sibling-picker', () => {
    const opts = _activeOpts;
    return {
      title: opts.title || 'Link to Existing Student',
      subtitle: opts.subtitle || 'Search by name or student code',
      size: 'sm',
      body: `
        <div class="form-input-wrap" style="margin-bottom:12px;">
          <span class="form-input-wrap__icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg></span>
          <input type="text" class="form-input" data-search placeholder="Search students..." autofocus />
        </div>
        <div data-results style="max-height:320px; overflow-y:auto; display:flex; flex-direction:column; gap:6px;"></div>
      `,
      footer: `<button class="btn btn-outline" data-modal-close>Cancel</button>`,
      onMount(modal, record) {
        ensureWorker();
        renderResults(modal, localFilter('', opts.excludeStudentId));

        const searchInput = modal.querySelector('[data-search]');
        let debounceTimer = null;
        searchInput.addEventListener('input', () => {
          clearTimeout(debounceTimer);
          debounceTimer = setTimeout(() => {
            renderResults(modal, localFilter(searchInput.value, opts.excludeStudentId));
          }, 120);
        });

        modal.addEventListener('pickerSelect', (e) => {
          window.Modals?.close(record);
          opts.onSelect?.(e.detail);
        });
      }
    };
  });

  let _activeOpts = {};

  function openPicker(opts = {}) {
    _activeOpts = opts;
    window.Modals?.open('sibling-picker');
  }

  return { openPicker };
})();

// Router bridge — sibling linking opens as a modal/picker, not a full page
window.renderSiblingLinking = function(container, params) {
    if (!container) return;
    container.innerHTML = `
    <div class="mod-topbar">
        <div class="mod-topbar-left">
            <h1 class="mod-title">
                <i class="fa-solid fa-link"></i>
                Sibling Linking
            </h1>
        </div>
    </div>
    <div class="section-card" style="padding:32px;text-align:center;">
        <p>Use the sibling picker from the student profile to link siblings.</p>
        <button class="btn btn-primary" onclick="navigateTo('student-list')">
            Go to Student List
        </button>
    </div>`;
};
