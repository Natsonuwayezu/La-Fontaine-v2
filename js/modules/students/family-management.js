/* ═══════════════════════════════════════════════════════════════════
   js/modules/students/family-management.js
   ═══════════════════════════════════════════════════════════════════
   Manage family groups: view existing families as a tree, create new
   families, link/unlink siblings (via sibling-linking.js's shared
   picker rather than duplicating that search UI), and configure the
   automatic family discount percentage.

   Reads/writes the real `families` table (id, code, parent_name,
   sibling_discount_pct) and links students via their real family_id
   column, using generateFamilyCode() and the shared
   computeStudentFeeSummary() formula for each member's real balance
   — the same functions record-payment.js/student-fees.js already use.

   Last updated: 2026-07-29
   ═══════════════════════════════════════════════════════════════════ */

const FamilyManagement = (() => {

  function escapeHTML(str) {
    const div = document.createElement('div');
    div.textContent = str ?? '';
    return div.innerHTML;
  }

  function initials(name) {
    return name.split(' ').map(w => w[0]).slice(0, 2).join('');
  }

  // ─── DATA ────────────────────────────────────────────────────────

  function getFamilies() {
    const classMap = new Map((state.classes || []).map(c => [c.id, c.name]));
    const yearId = window.getActiveYearId ? window.getActiveYearId() : null;

    return (state.families || []).map(f => {
      const members = (state.students || [])
        .filter(s => s.family_id === f.id && !s.is_deleted)
        .map(s => {
          const fees = (state.studentFees || []).filter(sf => sf.student_id === s.id && (!yearId || sf.academic_year_id === yearId));
          const credit = (state.creditBalances || []).find(c => c.student_id === s.id);
          const summary = computeStudentFeeSummary(fees, credit ? Number(credit.credit_amount || 0) : 0);
          return {
            id: s.id,
            name: `${s.first_name || ''} ${s.last_name || ''}`.trim() || `Student #${s.id}`,
            classId: classMap.get(s.class_id) || '\u2014',
            balance: summary.outstanding,
          };
        });
      return {
        id: f.id,
        code: f.code,
        name: f.parent_name || f.code || `Family #${f.id}`,
        discountPct: Number(f.sibling_discount_pct || 0),
        members,
      };
    });
  }

  // ─── RENDER ────────────────────────────────────────────────────────

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

    // families/students may still be loading — re-render once settled
    if (!state.families || state.families.length === 0) {
      window.loadAllData?.({ silent: true }).then(() => {
        if (container.isConnected) renderList(container);
      }).catch(() => {});
    }
  }

  function renderList(container) {
    const q = container.querySelector('#fam-search').value.trim().toLowerCase();
    const all = getFamilies();
    const filtered = !q ? all : all.filter(f =>
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
              <span style="color:${m.balance <= 0 ? 'var(--success)' : 'var(--warning)'}; font-weight:600; font-size:0.78rem;">${fmtCurrency(m.balance)}</span>
              <button class="btn btn-sm btn-outline" data-view-student="${m.id}">View</button>
              <button class="modal-close" data-unlink="${f.id}:${m.id}" title="Remove from family">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </span>
          </div>
        `).join('')}
        ${!f.members.length ? `<div style="padding:12px; color:var(--card-text-muted,#475569); font-size:0.8rem;">No students linked yet.</div>` : ''}
      </div>
    `).join('');

    wireCardEvents(container, list);
  }

  function wireCardEvents(container, list) {
    list.querySelectorAll('[data-link-sibling]').forEach(btn => {
      btn.addEventListener('click', () => {
        const family = getFamilies().find(f => f.id === Number(btn.dataset.linkSibling));
        window.SiblingLinking?.openPicker({
          title: `Link a Student to ${family.name}`,
          subtitle: 'Search by name',
          onSelect: async (student) => {
            if (family.members.some(m => m.id === student.id)) {
              window.Toast?.warning('Already linked', `${student.name} is already in this family.`);
              return;
            }
            try {
              await update('students', student.id, { family_id: family.id });
              const raw = (state.students || []).find(s => s.id === student.id);
              if (raw) raw.family_id = family.id;
              renderList(container);
              window.Toast?.success('Student linked', `${student.name} added to ${family.name}.`);
            } catch (err) {
              window.Toast?.error('Could not link student', err?.message);
            }
          }
        });
      });
    });

    list.querySelectorAll('[data-discount]').forEach(btn => btn.addEventListener('click', () => openDiscountEditor(container, Number(btn.dataset.discount))));
    list.querySelectorAll('[data-view-student]').forEach(btn => btn.addEventListener('click', () => window.navigateTo('student-profile', { studentId: Number(btn.dataset.viewStudent) })));
    list.querySelectorAll('[data-unlink]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const [familyId, studentId] = btn.dataset.unlink.split(':').map(Number);
        const family = getFamilies().find(f => f.id === familyId);
        const member = family.members.find(m => m.id === studentId);

        const confirmed = await window.confirmDialog(
          `${member.name} will no longer be linked to ${family.name}, and will stop receiving any family discount.`,
          'Remove from family?',
          { confirmText: 'Remove', confirmClass: 'btn-danger' }
        );
        if (!confirmed) return;

        try {
          await update('students', studentId, { family_id: null });
          const raw = (state.students || []).find(s => s.id === studentId);
          if (raw) raw.family_id = null;

          // A discount requires 2+ linked members — if this drops below
          // that, clear it in the database too, not just the UI.
          const remaining = family.members.length - 1;
          if (remaining < 2 && family.discountPct > 0) {
            await update('families', familyId, { sibling_discount_pct: 0 });
            const rawFamily = (state.families || []).find(f => f.id === familyId);
            if (rawFamily) rawFamily.sibling_discount_pct = 0;
          }

          renderList(container);
          window.Toast?.success('Removed from family');
        } catch (err) {
          window.Toast?.error('Could not remove student', err?.message);
        }
      });
    });
  }

  async function createNewFamily(container) {
    window.SiblingLinking?.openPicker({
      title: 'Create Family \u2014 Add First Student',
      subtitle: 'Search for a student to start a new family group',
      onSelect: async (student) => {
        try {
          const raw = (state.students || []).find(s => s.id === student.id);
          const code = await generateFamilyCode();
          const created = await insert('families', {
            code,
            parent_name: raw?.guardian_name || `${student.name.split(' ')[0]} Family`,
            sibling_discount_pct: 0,
          });
          state.families = [...(state.families || []), created];

          await update('students', student.id, { family_id: created.id });
          if (raw) raw.family_id = created.id;

          renderList(container);
          window.Toast?.success('Family created', `${created.parent_name} created with ${student.name}. Link another student to enable the family discount.`);
        } catch (err) {
          window.Toast?.error('Could not create family', err?.message);
        }
      }
    });
  }

  // ─── DISCOUNT EDITOR ─────────────────────────────────────────────────

  function openDiscountEditor(container, familyId) {
    const family = getFamilies().find(f => f.id === familyId);
    if (!family) return;

    const modalId = window.showModal(`
        <div class="form-group">
          <label>Discount percentage</label>
          <div class="currency-input-wrap">
            <input type="number" class="form-input" id="fam-discount-pct" min="0" max="100" value="${family.discountPct}" />
            <span class="currency-input-wrap__suffix">%</span>
          </div>
          <div class="form-hint">${family.members.length < 2 ? 'This family needs at least 2 linked students for a discount to apply.' : ''}</div>
        </div>
      `, {
      title: `Discount \u2014 ${family.name}`,
      size: 'sm',
      closeOnOutside: true,
      closeOnEscape: true,
      footer: `
        <button class="btn btn-outline" id="fam-discount-cancel">Cancel</button>
        <button class="btn btn-primary" id="fam-discount-save">Save</button>
      `,
    });

    const modal = document.getElementById(modalId);
    if (!modal) return;

    modal.querySelector('#fam-discount-cancel')?.addEventListener('click', () => window.closeModal(modalId));
    modal.querySelector('#fam-discount-save')?.addEventListener('click', async () => {
      const raw = parseInt(modal.querySelector('#fam-discount-pct').value, 10) || 0;
      const pct = family.members.length >= 2 ? Math.max(0, Math.min(100, raw)) : 0;

      try {
        await update('families', family.id, { sibling_discount_pct: pct });
        const rawFamily = (state.families || []).find(f => f.id === family.id);
        if (rawFamily) rawFamily.sibling_discount_pct = pct;

        window.closeModal(modalId);
        window.Toast?.success('Discount updated', `${family.name} now has a ${pct}% family discount.`);
        renderList(container);
      } catch (err) {
        window.Toast?.error('Could not update discount', err?.message);
      }
    });
  }

  return { render };
})();

// ─── EXPOSE ─────────────────────────────────────────────────────────

window.FamilyManagement = FamilyManagement;
window.renderFamilyManagement = FamilyManagement.render;
