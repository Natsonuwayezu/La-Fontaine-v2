/* ═══════════════════════════════════════════════════════════════════
   js/modules/communication/announcements.js — Announcement management
   ═══════════════════════════════════════════════════════════════════
   Admin-facing: create, edit, schedule, publish, and track read rates
   on school-wide announcements. The consumption/reading side (what
   teachers/parents actually see) is announcement-center.js.

   Rendered into #app-main for the 'announcements' route.
   ═══════════════════════════════════════════════════════════════════ */

const Announcements = (() => {

  const AUDIENCES = [
    { id: 'all', label: 'Everyone', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/></svg>' },
    { id: 'teachers', label: 'Teachers', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/></svg>' },
    { id: 'accountants', label: 'Accountants', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v20M17 5.5c0-1.93-2.24-3.5-5-3.5s-5 1.57-5 3.5 2.24 3.5 5 3.5 5 1.57 5 3.5-2.24 3.5-5 3.5-5-1.57-5-3.5"/></svg>' },
    { id: 'class', label: 'Specific Class', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>' }
  ];

  // MOCK_DATA — replace with core/api.js once available
  let announcements = [
    {
      id: 'ann-1', title: 'Term 3 Midterm Exam Schedule', body: 'Midterm exams begin Monday, August 4th. Please review the attached timetable with your class teacher.',
      audience: 'all', status: 'published', publishedAt: '2026-07-10T08:00:00', readCount: 312, totalRecipients: 428
    },
    {
      id: 'ann-2', title: 'Staff Meeting \u2014 Friday 3PM', body: 'Mandatory staff meeting this Friday at 3:00 PM in the staff room to discuss the promotion criteria for this year.',
      audience: 'teachers', status: 'published', publishedAt: '2026-07-08T14:30:00', readCount: 18, totalRecipients: 22
    },
    {
      id: 'ann-3', title: 'Holiday Camp Registration Open', body: 'Registration for the August holiday camp is now open. Spaces are limited \u2014 register at the accounts office.',
      audience: 'all', status: 'scheduled', scheduledFor: '2026-07-20T07:00:00', readCount: 0, totalRecipients: 428
    },
    {
      id: 'ann-4', title: 'Primary 4A Field Trip Reminder', body: 'Reminder: permission slips for the Primary 4A museum trip are due by end of week.',
      audience: 'class', classId: 'Primary 4A', status: 'draft', readCount: 0, totalRecipients: 28
    }
  ];

  function escapeHTML(str) {
    const div = document.createElement('div');
    div.textContent = str ?? '';
    return div.innerHTML;
  }

  function formatDate(iso) {
    if (!iso) return '\u2014';
    return new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  function statusBadge(a) {
    const map = {
      published: { label: 'Published', color: 'var(--success)' },
      scheduled: { label: 'Scheduled', color: 'var(--warning)' },
      draft: { label: 'Draft', color: 'var(--card-text-muted, #475569)' }
    };
    const s = map[a.status] || map.draft;
    return `<span style="font-size:0.65rem; font-weight:700; padding:2px 9px; border-radius:99px; background:${s.color}22; color:${s.color};">${s.label}</span>`;
  }

  function audienceLabel(a) {
    if (a.audience === 'class') return `Class: ${escapeHTML(a.classId || '\u2014')}`;
    return AUDIENCES.find(x => x.id === a.audience)?.label || a.audience;
  }

  function render(container) {
    if (!container) return;
    container.innerHTML = `
      <div class="dashboard-page">
        <div class="reports-toolbar">
          <h2 style="font-family:'Syne',sans-serif; font-size:1.1rem; color:var(--card-text,#e2e8f0);">Announcements</h2>
          <div class="reports-toolbar__spacer"></div>
          <select class="form-select" id="ann-status-filter" style="min-width:140px;">
            <option value="">All statuses</option>
            <option value="published">Published</option>
            <option value="scheduled">Scheduled</option>
            <option value="draft">Draft</option>
          </select>
          <button class="btn btn-primary" id="ann-new-btn"><i class="fa-solid fa-plus"></i> New Announcement</button>
        </div>
        <div class="report-type-grid" id="ann-grid" style="grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));"></div>
      </div>
    `;

    container.querySelector('#ann-new-btn').addEventListener('click', () => openEditor());
    container.querySelector('#ann-status-filter').addEventListener('change', (e) => renderGrid(container, e.target.value));

    renderGrid(container, '');
  }

  function renderGrid(container, statusFilter) {
    const grid = container.querySelector('#ann-grid');
    const filtered = statusFilter ? announcements.filter(a => a.status === statusFilter) : announcements;

    if (!filtered.length) {
      window.EmptyStates?.renderPreset(grid, 'noData', { title: 'No announcements', message: 'Create your first announcement to get started.' });
      return;
    }

    grid.innerHTML = filtered.map(a => `
      <div class="report-type-card" style="text-align:left; cursor:default;" data-id="${a.id}">
        <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:8px; margin-bottom:8px;">
          <div style="font-weight:700; font-size:0.92rem; color:var(--card-text,#e2e8f0);">${escapeHTML(a.title)}</div>
          ${statusBadge(a)}
        </div>
        <p style="font-size:0.78rem; color:var(--card-text-muted,#475569); line-height:1.5; margin-bottom:10px; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden;">${escapeHTML(a.body)}</p>
        <div style="display:flex; justify-content:space-between; align-items:center; font-size:0.7rem; color:var(--card-text-muted,#475569);">
          <span>${audienceLabel(a)}</span>
          <span>${a.status === 'published' ? `${a.readCount}/${a.totalRecipients} read` : formatDate(a.scheduledFor || a.publishedAt)}</span>
        </div>
        ${a.status === 'published' ? `
          <div class="progress-bar" style="margin-top:8px;">
            <div class="progress-fill" style="width:${Math.round((a.readCount / a.totalRecipients) * 100)}%;"></div>
          </div>` : ''}
        <div style="display:flex; gap:6px; margin-top:12px;">
          <button class="btn btn-sm btn-outline" data-edit="${a.id}">Edit</button>
          ${a.status === 'draft' ? `<button class="btn btn-sm btn-primary" data-publish="${a.id}">Publish Now</button>` : ''}
          <button class="btn btn-sm btn-outline" data-delete="${a.id}" style="margin-left:auto; color:var(--danger);">Delete</button>
        </div>
      </div>
    `).join('');

    grid.querySelectorAll('[data-edit]').forEach(btn => btn.addEventListener('click', () => openEditor(announcements.find(a => a.id === btn.dataset.edit))));
    grid.querySelectorAll('[data-publish]').forEach(btn => btn.addEventListener('click', () => publishNow(container, btn.dataset.publish)));
    grid.querySelectorAll('[data-delete]').forEach(btn => btn.addEventListener('click', () => deleteAnnouncement(container, btn.dataset.delete)));
  }

  async function publishNow(container, id) {
    const a = announcements.find(x => x.id === id);
    const confirmed = await window.Modals?.confirm({
      title: 'Publish this announcement?',
      message: `"${a.title}" will be sent immediately to ${audienceLabel(a)}.`,
      confirmLabel: 'Publish',
      tone: 'info'
    });
    if (!confirmed) return;
    a.status = 'published';
    a.publishedAt = new Date().toISOString();
    window.Toast?.success('Announcement published', `Sent to ${a.totalRecipients} recipients.`);
    renderGrid(container, container.querySelector('#ann-status-filter').value);
  }

  async function deleteAnnouncement(container, id) {
    const a = announcements.find(x => x.id === id);
    const confirmed = await window.Modals?.confirm({
      title: 'Delete announcement?',
      message: `"${a.title}" will be permanently removed. This cannot be undone.`,
      confirmLabel: 'Delete',
      tone: 'danger',
      danger: true
    });
    if (!confirmed) return;
    announcements = announcements.filter(x => x.id !== id);
    window.Toast?.success('Announcement deleted');
    renderGrid(container, container.querySelector('#ann-status-filter').value);
  }

  // Stashes the record being edited (if any) right before opening the
  // shared 'announcement-editor' modal, since Modals' registered builder
  // functions take no arguments (see js/ui/modals.js register()).
  let _editingRecord = null;

  function openEditor(existing) {
    _editingRecord = existing || null;
    window.Modals?.open('announcement-editor');
  }

  window.Modals?.register('announcement-editor', () => {
    const existing = _editingRecord;
    const isEdit = !!existing;

    return {
      title: isEdit ? 'Edit Announcement' : 'New Announcement',
      size: 'md',
      body: `
        <div style="display:flex; flex-direction:column; gap:14px;">
          <div class="form-group">
            <label>Title <span class="required">*</span></label>
            <input type="text" class="form-input" data-field="title" value="${existing ? escapeHTML(existing.title) : ''}" placeholder="e.g. Term 3 Exam Schedule" />
            <div class="form-hint"></div>
          </div>
          <div class="form-group">
            <label>Message <span class="required">*</span></label>
            <textarea class="form-textarea" data-field="body" placeholder="Write the announcement...">${existing ? escapeHTML(existing.body) : ''}</textarea>
            <div class="form-hint"></div>
          </div>
          <div class="form-group">
            <label>Audience</label>
            <div class="radio-card-group">
              ${AUDIENCES.map(a => `
                <label class="radio-card">
                  <input type="radio" name="audience" value="${a.id}" ${(existing?.audience || 'all') === a.id ? 'checked' : ''} />
                  ${a.icon}<span>${a.label}</span>
                </label>
              `).join('')}
            </div>
          </div>
          <div class="form-group" data-class-select-wrap style="${(existing?.audience === 'class') ? '' : 'display:none;'}">
            <label>Which class?</label>
            <select class="form-select" data-field="classId">
              ${CLASS_LEVELS ? [...CLASS_LEVELS.nursery, ...CLASS_LEVELS.primary].map(c => `<option value="${c}" ${existing?.classId === c ? 'selected' : ''}>${c}</option>`).join('') : ''}
            </select>
          </div>
          <label class="toggle-switch">
            <input type="checkbox" data-field="scheduleLater" ${existing?.status === 'scheduled' ? 'checked' : ''} />
            <span class="toggle-switch__track"><span class="toggle-switch__thumb"></span></span>
            <span class="toggle-switch__label">Schedule for later instead of publishing now</span>
          </label>
          <div class="form-group" data-schedule-wrap style="${existing?.status === 'scheduled' ? '' : 'display:none;'}">
            <label>Publish date &amp; time</label>
            <input type="datetime-local" class="form-input" data-field="scheduledFor" value="${existing?.scheduledFor ? existing.scheduledFor.slice(0, 16) : ''}" />
          </div>
        </div>
      `,
      footer: `
        <button class="btn btn-outline" data-modal-close>Cancel</button>
        <button class="btn btn-outline" data-save-draft>Save as Draft</button>
        <button class="btn btn-primary" data-save-submit>${isEdit ? 'Save Changes' : 'Publish'}</button>
      `,
      onMount(modal, record) {
        modal.querySelectorAll('input[name="audience"]').forEach(radio => {
          radio.addEventListener('change', () => {
            modal.querySelector('[data-class-select-wrap]').style.display = radio.value === 'class' && radio.checked ? '' : 'none';
          });
        });
        modal.querySelector('[data-field="scheduleLater"]').addEventListener('change', (e) => {
          modal.querySelector('[data-schedule-wrap]').style.display = e.target.checked ? '' : 'none';
        });

        function collect(status) {
          const errors = window.Forms?.validate(modal, {
            title: [window.Forms.rules.required('Title is required')],
            body: [window.Forms.rules.required('Message is required')]
          });
          if (errors && !errors.valid) return null;

          const audience = modal.querySelector('input[name="audience"]:checked')?.value || 'all';
          const scheduleLater = modal.querySelector('[data-field="scheduleLater"]').checked;
          return {
            title: modal.querySelector('[data-field="title"]').value,
            body: modal.querySelector('[data-field="body"]').value,
            audience,
            classId: audience === 'class' ? modal.querySelector('[data-field="classId"]').value : null,
            status: status === 'submit' ? (scheduleLater ? 'scheduled' : 'published') : 'draft',
            scheduledFor: scheduleLater ? modal.querySelector('[data-field="scheduledFor"]').value : null
          };
        }

        modal.querySelector('[data-save-draft]').addEventListener('click', () => save(collect('draft'), record));
        modal.querySelector('[data-save-submit]').addEventListener('click', () => save(collect('submit'), record));
      }
    };
  });

  function save(data, modalRecord) {
    if (!data) return; // validation failed
    if (_editingRecord) {
      Object.assign(_editingRecord, data);
      window.Toast?.success('Announcement updated');
    } else {
      announcements.unshift({
        id: `ann-${Date.now()}`,
        readCount: 0,
        totalRecipients: data.audience === 'class' ? 30 : (data.audience === 'teachers' ? 22 : 428),
        publishedAt: data.status === 'published' ? new Date().toISOString() : null,
        ...data
      });
      window.Toast?.success(data.status === 'draft' ? 'Draft saved' : (data.status === 'scheduled' ? 'Announcement scheduled' : 'Announcement published'));
    }
    window.Modals?.close(modalRecord);
    const container = document.getElementById('app-main');
    if (container) renderGrid(container, container.querySelector('#ann-status-filter')?.value || '');
  }

  return { render, openEditor };
})();
