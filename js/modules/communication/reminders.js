/* ═══════════════════════════════════════════════════════════════════
   js/modules/communication/reminders.js — Personal reminders
   ═══════════════════════════════════════════════════════════════════
   Personal, per-user task reminders — distinct from announcements
   (school-wide broadcast) and notifications (system-generated
   alerts). Grouped into Overdue / Today / Upcoming / Completed.

   Rendered into #app-main for the 'reminders' route.
   ═══════════════════════════════════════════════════════════════════ */

const Reminders = (() => {

  // MOCK_DATA — replace with core/api.js, scoped to the signed-in user
  let reminders = [
    { id: 'r1', title: 'Finish Primary 4A marks entry', dueDate: '2026-07-12', linkedModule: 'marks-entry', done: false },
    { id: 'r2', title: 'Call MUGISHA family re: overdue balance', dueDate: '2026-07-14', linkedModule: 'record-payment', done: false },
    { id: 'r3', title: 'Prepare Term 3 midterm question papers', dueDate: '2026-07-14', linkedModule: null, done: false },
    { id: 'r4', title: 'Submit attendance summary to head teacher', dueDate: '2026-07-16', linkedModule: 'attendance-reports', done: false },
    { id: 'r5', title: 'Order new library books', dueDate: '2026-07-25', linkedModule: null, done: false },
    { id: 'r6', title: 'Review Term 2 report cards', dueDate: '2026-06-30', linkedModule: 'report-cards', done: true }
  ];

  function escapeHTML(str) {
    const div = document.createElement('div');
    div.textContent = str ?? '';
    return div.innerHTML;
  }

  function todayISO() {
    return new Date().toISOString().slice(0, 10);
  }

  function groupReminders() {
    const today = todayISO();
    const groups = { overdue: [], today: [], upcoming: [], completed: [] };
    reminders.forEach(r => {
      if (r.done) groups.completed.push(r);
      else if (r.dueDate < today) groups.overdue.push(r);
      else if (r.dueDate === today) groups.today.push(r);
      else groups.upcoming.push(r);
    });
    Object.values(groups).forEach(list => list.sort((a, b) => a.dueDate.localeCompare(b.dueDate)));
    return groups;
  }

  function formatDate(iso) {
    return new Date(iso + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
  }

  function render(container) {
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
            <input type="checkbox" data-toggle="${r.id}" ${r.done ? 'checked' : ''} />
            <span class="checkbox__box"><svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg></span>
          </label>
          <div style="flex:1; min-width:0;">
            <div style="font-size:0.85rem; color:var(--card-text,#e2e8f0); ${r.done ? 'text-decoration:line-through; opacity:0.6;' : ''}">${escapeHTML(r.title)}</div>
            <div style="font-size:0.7rem; color:var(--card-text-muted,#475569);">${formatDate(r.dueDate)}${r.linkedModule ? ` \u00b7 <a data-goto="${r.linkedModule}" style="color:var(--accent-light,#60a5fa); cursor:pointer;">Open</a>` : ''}</div>
          </div>
          <button class="btn btn-sm btn-outline" data-edit="${r.id}">Edit</button>
          <button class="modal-close" data-delete="${r.id}" title="Delete">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
          </button>
        </div>
      `).join('');
    });

    wrap.querySelectorAll('[data-toggle]').forEach(cb => {
      cb.addEventListener('change', () => {
        const r = reminders.find(x => x.id === cb.dataset.toggle);
        r.done = cb.checked;
        renderGroups(container);
        if (cb.checked) window.Toast?.success('Reminder completed', r.title);
      });
    });
    wrap.querySelectorAll('[data-edit]').forEach(btn => {
      btn.addEventListener('click', () => openEditor(container, reminders.find(r => r.id === btn.dataset.edit)));
    });
    wrap.querySelectorAll('[data-delete]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const r = reminders.find(x => x.id === btn.dataset.delete);
        const confirmed = await window.Modals?.confirm({
          title: 'Delete reminder?', message: `"${r.title}" will be removed.`, confirmLabel: 'Delete', tone: 'danger', danger: true
        });
        if (!confirmed) return;
        reminders = reminders.filter(x => x.id !== r.id);
        renderGroups(container);
      });
    });
    wrap.querySelectorAll('[data-goto]').forEach(link => {
      link.addEventListener('click', () => window.Router?.navigate(link.dataset.goto));
    });
  }

  let _editingReminder = null;
  let _editingContainer = null;

  window.Modals?.register('reminder-editor', () => {
    const existing = _editingReminder;
    return {
      title: existing ? 'Edit Reminder' : 'New Reminder',
      size: 'sm',
      body: `
        <div style="display:flex; flex-direction:column; gap:14px;">
          <div class="form-group">
            <label>What needs to be done? <span class="required">*</span></label>
            <input type="text" class="form-input" data-field="title" value="${existing ? escapeHTML(existing.title) : ''}" placeholder="e.g. Finish marks entry for Primary 4A" />
            <div class="form-hint"></div>
          </div>
          <div class="form-group">
            <label>Due date <span class="required">*</span></label>
            <input type="date" class="form-input" data-field="dueDate" value="${existing?.dueDate || todayISO()}" />
          </div>
        </div>
      `,
      footer: `
        <button class="btn btn-outline" data-modal-close>Cancel</button>
        <button class="btn btn-primary" data-save>${existing ? 'Save Changes' : 'Add Reminder'}</button>
      `,
      onMount(modal, record) {
        modal.querySelector('[data-save]').addEventListener('click', () => {
          const result = window.Forms?.validate(modal, { title: [window.Forms.rules.required('A title is required')] });
          if (result && !result.valid) return;

          const title = modal.querySelector('[data-field="title"]').value;
          const dueDate = modal.querySelector('[data-field="dueDate"]').value;

          if (existing) {
            existing.title = title;
            existing.dueDate = dueDate;
            window.Toast?.success('Reminder updated');
          } else {
            reminders.push({ id: `r${Date.now()}`, title, dueDate, linkedModule: null, done: false });
            window.Toast?.success('Reminder added');
          }
          window.Modals?.close(record);
          renderGroups(_editingContainer);
        });
      }
    };
  });

  function openEditor(container, existing) {
    _editingReminder = existing || null;
    _editingContainer = container;
    window.Modals?.open('reminder-editor');
  }

  return { render };
})();

// ─── EXPOSE ─────────────────────────────────────────────────────────
// window.Reminders was never assigned anywhere in this file, and the router
// looks up window.renderReminders specifically (see core/router.js's
// moduleIdToRenderFn) — this page was completely unreachable via navigation
// despite being fully built.
window.Reminders = Reminders;
window.renderReminders = Reminders.render;
