/* ═══════════════════════════════════════════════════════════════════
   js/modules/communication/reminders.js — Personal reminders
   ═══════════════════════════════════════════════════════════════════
   Personal, per-user task reminders — distinct from announcements
   (school-wide broadcast) and notifications (system-generated
   alerts). Grouped into Overdue / Today / Upcoming / Completed.

   Reads/writes a `reminders` table (id, user_id, title, due_date,
   linked_module, is_done, created_at). Unlike the other communication
   files fixed this session, no other real code anywhere references a
   reminders table to confirm field names against — this establishes
   the schema, following the same naming conventions already used
   throughout (snake_case, is_ prefix for booleans, _id suffix for
   foreign keys). The live table itself still needs creating, same as
   the other schema gaps already noted this session.

   Rendered into #app-main for the 'reminders' route.
   Last updated: 2026-07-29
   ═══════════════════════════════════════════════════════════════════ */

const Reminders = (() => {

  let reminders = [];
  let loaded = false;

  function escapeHTML(str) {
    const div = document.createElement('div');
    div.textContent = str ?? '';
    return div.innerHTML;
  }

  async function loadReminders() {
    if (!state.currentUser?.id) return;
    try {
      reminders = await window.getWhere('reminders', `user_id=eq.${state.currentUser.id}`);
    } catch (err) {
      console.warn('[Reminders] could not load reminders:', err.message);
      reminders = [];
    }
    loaded = true;
  }

  function groupReminders() {
    const today = todayISO();
    const groups = { overdue: [], today: [], upcoming: [], completed: [] };
    reminders.forEach(r => {
      if (r.is_done) groups.completed.push(r);
      else if (r.due_date < today) groups.overdue.push(r);
      else if (r.due_date === today) groups.today.push(r);
      else groups.upcoming.push(r);
    });
    Object.values(groups).forEach(list => list.sort((a, b) => String(a.due_date || '').localeCompare(String(b.due_date || ''))));
    return groups;
  }

  function formatDate(iso) {
    if (!iso) return '\u2014';
    return new Date(iso + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
  }

  async function render(container) {
    if (!container) return;
    container.innerHTML = `
      <div class="dashboard-page">
        <div class="reports-toolbar">
          <h2 style="font-family:'Syne',sans-serif; font-size:1.1rem; color:var(--card-text,#e2e8f0);">Reminders</h2>
          <div class="reports-toolbar__spacer"></div>
          <button class="btn btn-primary" id="rem-new-btn"><i class="fa-solid fa-plus"></i> New Reminder</button>
        </div>
        <div id="rem-groups"></div>
      </div>
    `;
    container.querySelector('#rem-new-btn').addEventListener('click', () => openEditor(container));

    if (!loaded) await loadReminders();
    renderGroups(container);
  }

  const GROUP_META = {
    overdue: { label: 'Overdue', color: 'var(--danger)' },
    today: { label: 'Today', color: 'var(--warning)' },
    upcoming: { label: 'Upcoming', color: 'var(--accent-light, #60a5fa)' },
    completed: { label: 'Completed', color: 'var(--success)' }
  };

  function renderGroups(container) {
    const groups = groupReminders();
    const wrap = container.querySelector('#rem-groups');

    const sections = Object.entries(groups)
      .filter(([, list]) => list.length > 0)
      .map(([key, list]) => `
        <div class="dash-card" style="margin-bottom:14px;">
          <div class="dash-card-header">
            <span class="dash-card-title" style="color:${GROUP_META[key].color};">${GROUP_META[key].label}</span>
            <span class="dash-card-action">${list.length}</span>
          </div>
          <div class="dash-card-body no-padding" data-group="${key}"></div>
        </div>
      `).join('');

    if (!sections) {
      window.EmptyStates?.renderPreset(wrap, 'noData', { title: 'No reminders', message: 'Create a reminder to keep track of tasks.', actionLabel: 'New Reminder', onAction: () => openEditor(container) });
      return;
    }

    wrap.innerHTML = sections;

    Object.entries(groups).forEach(([key, list]) => {
      const groupEl = wrap.querySelector(`[data-group="${key}"]`);
      if (!groupEl || !list.length) return;
      groupEl.innerHTML = list.map(r => `
        <div class="reminder-row" style="display:flex; align-items:center; gap:12px; padding:10px 16px; border-bottom:1px solid var(--card-border, rgba(255,255,255,0.05));">
          <label class="checkbox">
            <input type="checkbox" data-toggle="${r.id}" ${r.is_done ? 'checked' : ''} />
            <span class="checkbox__box"><svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg></span>
          </label>
          <div style="flex:1; min-width:0;">
            <div style="font-size:0.85rem; color:var(--card-text,#e2e8f0); ${r.is_done ? 'text-decoration:line-through; opacity:0.6;' : ''}">${escapeHTML(r.title)}</div>
            <div style="font-size:0.7rem; color:var(--card-text-muted,#475569);">${formatDate(r.due_date)}${r.linked_module ? ` \u00b7 <a data-goto="${r.linked_module}" style="color:var(--accent-light,#60a5fa); cursor:pointer;">Open</a>` : ''}</div>
          </div>
          <button class="btn btn-sm btn-outline" data-edit="${r.id}">Edit</button>
          <button class="modal-close" data-delete="${r.id}" title="Delete">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
          </button>
        </div>
      `).join('');
    });

    wrap.querySelectorAll('[data-toggle]').forEach(cb => {
      cb.addEventListener('change', async () => {
        const id = Number(cb.dataset.toggle);
        const r = reminders.find(x => x.id === id);
        if (!r) return;
        try {
          await update('reminders', id, { is_done: cb.checked });
          r.is_done = cb.checked;
          renderGroups(container);
          if (cb.checked) window.Toast?.success('Reminder completed', r.title);
        } catch (err) {
          cb.checked = !cb.checked;
          window.Toast?.error('Could not update reminder', err?.message);
        }
      });
    });
    wrap.querySelectorAll('[data-edit]').forEach(btn => {
      btn.addEventListener('click', () => openEditor(container, reminders.find(r => r.id === Number(btn.dataset.edit))));
    });
    wrap.querySelectorAll('[data-delete]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = Number(btn.dataset.delete);
        const r = reminders.find(x => x.id === id);
        if (!r) return;
        const confirmed = await window.confirmDialog(`"${r.title}" will be removed.`, 'Delete reminder?', { confirmText: 'Delete', confirmClass: 'btn-danger' });
        if (!confirmed) return;
        try {
          await window.remove('reminders', id);
          reminders = reminders.filter(x => x.id !== id);
          renderGroups(container);
        } catch (err) {
          window.Toast?.error('Could not delete reminder', err?.message);
        }
      });
    });
    wrap.querySelectorAll('[data-goto]').forEach(link => {
      link.addEventListener('click', () => window.navigateTo(link.dataset.goto));
    });
  }

  // ─── EDITOR MODAL ────────────────────────────────────────────────

  function openEditor(container, existing) {
    const modalId = window.showModal(`
        <div style="display:flex; flex-direction:column; gap:14px;">
          <div class="form-group">
            <label>What needs to be done? <span class="required">*</span></label>
            <input type="text" class="form-input" data-field="title" value="${existing ? escapeHTML(existing.title) : ''}" placeholder="e.g. Finish marks entry for Primary 4A" />
          </div>
          <div class="form-group">
            <label>Due date <span class="required">*</span></label>
            <input type="date" class="form-input" data-field="due_date" value="${existing?.due_date || todayISO()}" />
          </div>
        </div>
      `, {
      title: existing ? 'Edit Reminder' : 'New Reminder',
      size: 'sm',
      closeOnOutside: true,
      closeOnEscape: true,
      footer: `
        <button class="btn btn-outline" id="rem-modal-cancel">Cancel</button>
        <button class="btn btn-primary" id="rem-modal-save">${existing ? 'Save Changes' : 'Add Reminder'}</button>
      `,
    });

    const modal = document.getElementById(modalId);
    if (!modal) return;

    modal.querySelector('#rem-modal-cancel')?.addEventListener('click', () => window.closeModal(modalId));
    modal.querySelector('#rem-modal-save')?.addEventListener('click', async () => {
      const title = modal.querySelector('[data-field="title"]').value.trim();
      const dueDate = modal.querySelector('[data-field="due_date"]').value;
      if (!title || !dueDate) {
        window.Toast?.warning('A title and due date are both required');
        return;
      }

      try {
        if (existing) {
          await update('reminders', existing.id, { title, due_date: dueDate });
          existing.title = title;
          existing.due_date = dueDate;
          window.Toast?.success('Reminder updated');
        } else {
          const created = await insert('reminders', {
            user_id: state.currentUser?.id ?? null,
            title, due_date: dueDate,
            linked_module: null, is_done: false,
            created_at: new Date().toISOString(),
          });
          reminders.push(created);
          window.Toast?.success('Reminder added');
        }
        window.closeModal(modalId);
        renderGroups(container);
      } catch (err) {
        window.Toast?.error('Could not save reminder', err?.message);
      }
    });
  }

  return { render };
})();

// ─── EXPOSE ─────────────────────────────────────────────────────────

window.Reminders = Reminders;
window.renderReminders = Reminders.render;
