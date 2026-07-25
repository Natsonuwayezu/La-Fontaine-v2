/* ═══════════════════════════════════════════════════════════════════
   js/modules/students/family-management.js
   ═══════════════════════════════════════════════════════════════════
   Manage family groups: view existing families as a tree, create new
   families, link/unlink siblings (via sibling-linking.js's shared
   picker rather than duplicating that search UI), and configure the
   automatic family discount percentage.
   ═══════════════════════════════════════════════════════════════════ */

const FamilyManagement = (() => {

  // MOCK_DATA — replace with core/api.js
  let families = [
    {
      id: 'FAM-0041', name: 'UWERA Family', discountPct: 10,
      members: [
        { id: 'STU-2023-0088', name: 'UWERA Grace', classId: 'Primary 5B', balance: '0 RWF' },
        { id: 'STU-2023-0089', name: 'UWERA Divine', classId: 'Primary 1', balance: '15,000 RWF' }
      ]
    },
    {
      id: 'FAM-0055', name: 'KAMALI Family', discountPct: 0,
      members: [
        { id: 'STU-2024-0201', name: 'KAMALI Moses', classId: 'Primary 3A', balance: '0 RWF' },
        { id: 'STU-2024-0202', name: 'KAMALI Jean', classId: 'Primary 2', balance: '30,000 RWF' }
      ]
    }
  ];

  function escapeHTML(str) {
    const div = document.createElement('div');
    div.textContent = str ?? '';
    return div.innerHTML;
  }

  function initials(name) {
    return name.split(' ').map(w => w[0]).slice(0, 2).join('');
  }

  function render(container) {
    if (!container) return;
    container.innerHTML = `
      <div class="dashboard-page">
        <div class="reports-toolbar">
          <div class="form-input-wrap flex-1" style="max-width:340px;">
            <span class="form-input-wrap__icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg></span>
            <input type="text" class="form-input" id="fam-search" placeholder="Search families or students..." />
          </div>
          <div class="reports-toolbar__spacer"></div>
          <button class="btn btn-primary" id="fam-new-btn"><i class="fa-solid fa-house-chimney-user"></i> New Family Group</button>
        </div>
        <div id="fam-list"></div>
      </div>
    `;

    container.querySelector('#fam-search').addEventListener('input', () => renderList(container));
    container.querySelector('#fam-new-btn').addEventListener('click', () => createNewFamily(container));

    renderList(container);
  }

  function renderList(container) {
    const q = container.querySelector('#fam-search').value.trim().toLowerCase();
    const filtered = !q ? families : families.filter(f =>
      f.name.toLowerCase().includes(q) || f.members.some(m => m.name.toLowerCase().includes(q))
    );

    const list = container.querySelector('#fam-list');
    if (!filtered.length) {
      window.EmptyStates?.renderPreset(list, 'noSearchResults', { title: 'No families found' });
      return;
    }

    list.innerHTML = filtered.map(f => `
      <div class="family-summary-card" style="margin-bottom:14px;" data-family="${f.id}">
        <div class="family-summary-header">
          <span class="family-summary-header__name">${escapeHTML(f.name)}</span>
          <div style="display:flex; align-items:center; gap:10px;">
            ${f.discountPct > 0 ? `<span class="family-discount-badge">${f.discountPct}% discount</span>` : ''}
            <button class="btn btn-sm btn-outline" data-discount="${f.id}">Set Discount</button>
            <button class="btn btn-sm btn-outline" data-link-sibling="${f.id}"><i class="fa-solid fa-link"></i> Link Student</button>
          </div>
        </div>
        ${f.members.map(m => `
          <div class="family-member-row">
            <span style="display:flex; align-items:center; gap:8px;">
              <span class="family-tree-node__avatar" style="width:26px;height:26px;font-size:0.6rem;">${escapeHTML(initials(m.name))}</span>
              ${escapeHTML(m.name)} <span style="color:var(--card-text-muted,#475569);">\u00b7 ${escapeHTML(m.classId)}</span>
            </span>
            <span style="display:flex; align-items:center; gap:10px;">
              <span style="color:${m.balance === '0 RWF' ? 'var(--success)' : 'var(--warning)'}; font-weight:600; font-size:0.78rem;">${escapeHTML(m.balance)}</span>
              <button class="btn btn-sm btn-outline" data-view-student="${m.id}">View</button>
              <button class="modal-close" data-unlink="${f.id}:${m.id}" title="Remove from family">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </span>
          </div>
        `).join('')}
      </div>
    `).join('');

    wireCardEvents(container, list);
  }

  function wireCardEvents(container, list) {
    list.querySelectorAll('[data-link-sibling]').forEach(btn => {
      btn.addEventListener('click', () => {
        const family = families.find(f => f.id === btn.dataset.linkSibling);
        window.SiblingLinking?.openPicker({
          title: `Link a Student to ${family.name}`,
          subtitle: 'Search by name or student code',
          onSelect: (student) => {
            if (family.members.some(m => m.id === student.id)) {
              window.Toast?.warning('Already linked', `${student.name} is already in this family.`);
              return;
            }
            family.members.push({ id: student.id, name: student.name, classId: student.classId, balance: '0 RWF' });
            renderList(container);
            window.Toast?.success('Student linked', `${student.name} added to ${family.name}.`);
          }
        });
      });
    });

    list.querySelectorAll('[data-discount]').forEach(btn => btn.addEventListener('click', () => openDiscountEditor(container, btn.dataset.discount)));
    list.querySelectorAll('[data-view-student]').forEach(btn => btn.addEventListener('click', () => window.Router?.navigate('student-profile', { studentId: btn.dataset.viewStudent })));
    list.querySelectorAll('[data-unlink]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const [familyId, studentId] = btn.dataset.unlink.split(':');
        const family = families.find(f => f.id === familyId);
        const member = family.members.find(m => m.id === studentId);
        const confirmed = await window.Modals?.confirm({
          title: 'Remove from family?',
          message: `${member.name} will no longer be linked to ${family.name}, and will stop receiving any family discount.`,
          confirmLabel: 'Remove', tone: 'warning'
        });
        if (!confirmed) return;
        family.members = family.members.filter(m => m.id !== studentId);
        if (family.members.length < 2) family.discountPct = 0; // discount requires 2+ linked
        renderList(container);
        window.Toast?.success('Removed from family');
      });
    });
  }

  function createNewFamily(container) {
    window.SiblingLinking?.openPicker({
      title: 'Create Family \u2014 Add First Student',
      subtitle: 'Search for a student to start a new family group',
      onSelect: (student) => {
        const newFamily = {
          id: `FAM-${Date.now()}`,
          name: `${student.name.split(' ')[0]} Family`,
          discountPct: 0,
          members: [{ id: student.id, name: student.name, classId: student.classId, balance: '0 RWF' }]
        };
        families.unshift(newFamily);
        renderList(container);
        window.Toast?.success('Family created', `${newFamily.name} created with ${student.name}. Link another student to enable the family discount.`);
      }
    });
  }

  window.Modals?.register('family-discount-editor', () => {
    const family = _activeFamilyForDiscount;
    return {
      title: `Discount \u2014 ${family.name}`,
      subtitle: 'Applied automatically across all linked siblings\u2019 tuition fees',
      size: 'sm',
      body: `
        <div class="form-group">
          <label>Discount percentage</label>
          <div class="currency-input-wrap">
            <input type="number" class="form-input" data-field="pct" min="0" max="100" value="${family.discountPct}" />
            <span class="currency-input-wrap__suffix">%</span>
          </div>
          <div class="form-hint">${family.members.length < 2 ? 'This family needs at least 2 linked students for a discount to apply.' : ''}</div>
        </div>
      `,
      footer: `
        <button class="btn btn-outline" data-modal-close>Cancel</button>
        <button class="btn btn-primary" data-save-discount>Save</button>
      `,
      onMount(modal, record) {
        modal.querySelector('[data-save-discount]').addEventListener('click', () => {
          const pct = Math.max(0, Math.min(100, parseInt(modal.querySelector('[data-field="pct"]').value, 10) || 0));
          family.discountPct = family.members.length >= 2 ? pct : 0;
          window.Modals?.close(record);
          window.Toast?.success('Discount updated', `${family.name} now has a ${family.discountPct}% family discount.`);
          const container = document.getElementById('moduleContent');
          if (container) renderList(container);
        });
      }
    };
  });

  let _activeFamilyForDiscount = null;

  function openDiscountEditor(container, familyId) {
    _activeFamilyForDiscount = families.find(f => f.id === familyId);
    window.Modals?.open('family-discount-editor');
  }

  return { render };
})();

// ─── EXPOSE ─────────────────────────────────────────────────────────
// window.FamilyManagement was never assigned anywhere in this file, and the router
// looks up window.renderFamilyManagement specifically (see core/router.js's
// moduleIdToRenderFn) — this page was completely unreachable via navigation
// despite being fully built.
window.FamilyManagement = FamilyManagement;
window.renderFamilyManagement = FamilyManagement.render;
