/* ═══════════════════════════════════════════════════════════════════
   js/modules/students/sibling-linking.js — Sibling/family link picker
   ═══════════════════════════════════════════════════════════════════
   A focused, reusable component rather than a full page: a searchable
   picker modal for finding an existing student to link to a family.
   Used by:
   - family-management.js (linking a student into an existing family,
     or starting a new one)
   - enroll-student.js (step 2: "does this student have siblings
     already enrolled?")

   SiblingLinking.openPicker({
     excludeStudentId,      // don't show the student being linked, in results
     onSelect(student),     // called with { id, name, classId, familyId }
     title, subtitle
   })

   Searches the real state.students roster (active, non-deleted),
   resolving class name via state.classes. Uses the real showModal()/
   closeModal() functions from core/ui/modals.js directly rather than
   an invented Modals.register/open/close namespace that doesn't exist.

   Last updated: 2026-07-29
   ═══════════════════════════════════════════════════════════════════ */

const SiblingLinking = (() => {

  function escapeHTML(str) {
    const div = document.createElement('div');
    div.textContent = str ?? '';
    return div.innerHTML;
  }

  function getPool() {
    const classMap = new Map((state.classes || []).map(c => [c.id, c.name]));
    return (state.students || [])
      .filter(s => !s.is_deleted && (s.status || 'Active') === 'Active')
      .map(s => ({
        id: s.id,
        name: `${s.first_name || ''} ${s.last_name || ''}`.trim() || `Student #${s.id}`,
        classId: classMap.get(s.class_id) || '\u2014',
        familyId: s.family_id || null,
      }));
  }

  function localFilter(query, excludeId) {
    const q = query.trim().toLowerCase();
    return getPool()
      .filter(s => s.id !== excludeId)
      .filter(s => !q || s.name.toLowerCase().includes(q))
      .slice(0, 30);
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
          <div class="family-tree-node__relation">${escapeHTML(s.classId)}${s.familyId ? ' \u00b7 Already in a family' : ''}</div>
        </div>
      </div>
    `).join('');

    list.querySelectorAll('[data-pick]').forEach(row => {
      row.addEventListener('click', () => {
        const student = getPool().find(s => String(s.id) === row.dataset.pick);
        modal.dispatchEvent(new CustomEvent('pickerSelect', { detail: student }));
      });
    });
  }

  function openPicker(opts = {}) {
    const modalId = window.showModal(`
        <div class="form-input-wrap" style="margin-bottom:12px;">
          <span class="form-input-wrap__icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg></span>
          <input type="text" class="form-input" data-search placeholder="Search students..." autofocus />
        </div>
        <div data-results style="max-height:320px; overflow-y:auto; display:flex; flex-direction:column; gap:6px;"></div>
      `, {
      title: opts.title || 'Link to Existing Student',
      size: 'sm',
      closeOnOutside: true,
      closeOnEscape: true,
      footer: `<button class="btn btn-outline" id="sib-picker-cancel">Cancel</button>`,
    });

    const modal = document.getElementById(modalId);
    if (!modal) return;

    modal.querySelector('#sib-picker-cancel')?.addEventListener('click', () => window.closeModal(modalId));

    renderResults(modal, localFilter('', opts.excludeStudentId));

    const searchInput = modal.querySelector('[data-search]');
    let debounceTimer = null;
    searchInput?.addEventListener('input', () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        renderResults(modal, localFilter(searchInput.value, opts.excludeStudentId));
      }, 120);
    });

    modal.addEventListener('pickerSelect', (e) => {
      window.closeModal(modalId);
      opts.onSelect?.(e.detail);
    });
  }

  return { openPicker };
})();

// Router bridge — sibling linking opens as a picker modal, not a full page
window.renderSiblingLinking = function (container) {
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
        <p>Use "Link Student" from Family Management, or the sibling picker during enrollment, to link siblings.</p>
        <button class="btn btn-primary" onclick="window.navigateTo('family-management')">
            Go to Family Management
        </button>
    </div>`;
};

window.SiblingLinking = SiblingLinking;
