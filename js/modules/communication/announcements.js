/* ═══════════════════════════════════════════════════════════════════
   js/modules/communication/announcements.js — Announcement management
   ═══════════════════════════════════════════════════════════════════
   Admin-facing: create, edit, publish, and delete school-wide
   announcements. The consumption/reading side (what teachers/
   accountants actually see) is announcement-center.js.

   Reads/writes the real `announcements` table (title, body,
   target_roles, status, created_by, created_at, published_at).
   target_roles matches exactly what core/notifications-engine.js's
   notifyAnnouncementPublished() already expects (an array of
   'all'/'teachers'/'accountants'/'admin') -- publishing here calls
   that real function directly to actually notify recipients, rather
   than a separate announcement being an inert row nothing reacts to.
   There's no real 'class'-targeted or 'scheduled for later' delivery
   mechanism anywhere in this codebase (no cron/deferred-publish job
   exists), so those options from the original mock are not offered
   here rather than pretending they work.

   Read-tracking ("N of M people have read this") would need a
   cross-user query this session can't reliably build from client
   state alone -- shown instead as the real recipient-role headcount
   at publish time via the same getTeacherIds()/getAccountantIds()/
   getAdminIds() helpers the engine function itself uses.

   Rendered into #moduleContent for the 'announcements' route.
   Last updated: 2026-07-29
   ═══════════════════════════════════════════════════════════════════ */

const Announcements = (() => {

  const AUDIENCES = [
    { id: 'all', label: 'Everyone', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/></svg>' },
    { id: 'teachers', label: 'Teachers', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/></svg>' },
    { id: 'accountants', label: 'Accountants', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v20M17 5.5c0-1.93-2.24-3.5-5-3.5s-5 1.57-5 3.5 2.24 3.5 5 3.5 5 1.57 5 3.5-2.24 3.5-5 3.5-5-1.57-5-3.5"/></svg>' },
    { id: 'admin', label: 'Admin', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>' }
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
      draft: { label: 'Draft', color: 'var(--card-text-muted, #475569)' }
    };
    const s = map[a.status] || map.draft;
    return `<span style="font-size:0.65rem; font-weight:700; padding:2px 9px; border-radius:99px; background:${s.color}22; color:${s.color};">${s.label}</span>`;
  }

  function audienceLabel(a) {
    const roles = a.target_roles || ['all'];
    return roles.map(r => AUDIENCES.find(x => x.id === r)?.label || r).join(', ');
  }

  /** Real headcount of who target_roles resolves to, using the same
   *  recipient-resolution helpers notifyAnnouncementPublished() itself
   *  uses -- so this number matches who actually got notified. */
  function recipientCount(targetRoles) {
    if ((targetRoles || []).includes('all')) {
      return (state.teachers || []).filter(t => t.is_active !== false).length;
    }
    const ids = new Set();
    if (targetRoles.includes('teachers')) window.getTeacherIds().forEach(id => ids.add(id));
    if (targetRoles.includes('accountants')) window.getAccountantIds().forEach(id => ids.add(id));
    if (targetRoles.includes('admin')) window.getAdminIds().forEach(id => ids.add(id));
    return ids.size;
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
            <option value="draft">Draft</option>
          </select>
          <button class="btn btn-primary" id="ann-new-btn"><i class="fa-solid fa-plus"></i> New Announcement</button>
        </div>
        <div class="report-type-grid" id="ann-grid" style="grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));"></div>
      </div>
    `;

    container.querySelector('#ann-new-btn').addEventListener('click', () => openEditor(container));
    container.querySelector('#ann-status-filter').addEventListener('change', (e) => renderGrid(container, e.target.value));

    renderGrid(container, '');

    if (!state.announcements || state.announcements.length === 0) {
      window.loadAllData?.({ silent: true }).then(() => {
        if (container.isConnected) renderGrid(container, container.querySelector('#ann-status-filter')?.value || '');
      }).catch(() => {});
    }
  }

  function renderGrid(container, statusFilter) {
    const grid = container.querySelector('#ann-grid');
    const all = [...(state.announcements || [])].sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
    const filtered = statusFilter ? all.filter(a => a.status === statusFilter) : all;

    if (!filtered.length) {
      window.EmptyStates?.renderPreset(grid, 'noData', { title: 'No announcements', message: 'Create your first announcement to get started.' });
      return;
    }

    grid.innerHTML = filtered.map(a => {
      const total = recipientCount(a.target_roles || ['all']);
      return `
      <div class="report-type-card" style="text-align:left; cursor:default;" data-id="${a.id}">
        <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:8px; margin-bottom:8px;">
          <div style="font-weight:700; font-size:0.92rem; color:var(--card-text,#e2e8f0);">${escapeHTML(a.title)}</div>
          ${statusBadge(a)}
        </div>
        <p style="font-size:0.78rem; color:var(--card-text-muted,#475569); line-height:1.5; margin-bottom:10px; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden;">${escapeHTML(a.body)}</p>
        <div style="display:flex; justify-content:space-between; align-items:center; font-size:0.7rem; color:var(--card-text-muted,#475569);">
          <span>${audienceLabel(a)}</span>
          <span>${a.status === 'published' ? `Sent to ${total} people` : `Draft \u00b7 ${formatDate(a.created_at)}`}</span>
        </div>
        <div style="display:flex; gap:6px; margin-top:12px;">
          ${a.status === 'draft' ? `<button class="btn btn-sm btn-outline" data-edit="${a.id}">Edit</button>` : ''}
          ${a.status === 'draft' ? `<button class="btn btn-sm btn-primary" data-publish="${a.id}">Publish Now</button>` : ''}
          <button class="btn btn-sm btn-outline" data-delete="${a.id}" style="margin-left:auto; color:var(--danger);">Delete</button>
        </div>
      </div>
    `;
    }).join('');

    grid.querySelectorAll('[data-edit]').forEach(btn => btn.addEventListener('click', () => openEditor(container, (state.announcements || []).find(a => a.id === Number(btn.dataset.edit)))));
    grid.querySelectorAll('[data-publish]').forEach(btn => btn.addEventListener('click', () => publishNow(container, Number(btn.dataset.publish))));
    grid.querySelectorAll('[data-delete]').forEach(btn => btn.addEventListener('click', () => deleteAnnouncement(container, Number(btn.dataset.delete))));
  }

  async function publishNow(container, id) {
    const a = (state.announcements || []).find(x => x.id === id);
    if (!a) return;

    const confirmed = await window.confirmDialog(
      `"${a.title}" will be sent immediately to ${audienceLabel(a)} (${recipientCount(a.target_roles)} people).`,
      'Publish this announcement?',
      { confirmText: 'Publish' }
    );
    if (!confirmed) return;

    try {
      const now = new Date().toISOString();
      await update('announcements', id, { status: 'published', published_at: now });
      a.status = 'published';
      a.published_at = now;
      await window.notifyAnnouncementPublished?.(a);
      window.Toast?.success('Announcement published', `Sent to ${recipientCount(a.target_roles)} recipients.`);
      renderGrid(container, container.querySelector('#ann-status-filter').value);
    } catch (err) {
      window.Toast?.error('Could not publish announcement', err?.message);
    }
  }

  async function deleteAnnouncement(container, id) {
    const a = (state.announcements || []).find(x => x.id === id);
    if (!a) return;

    const confirmed = await window.confirmDialog(
      `"${a.title}" will be permanently removed. This cannot be undone.`,
      'Delete announcement?',
      { confirmText: 'Delete', confirmClass: 'btn-danger' }
    );
    if (!confirmed) return;

    try {
      await window.remove('announcements', id);
      state.announcements = (state.announcements || []).filter(x => x.id !== id);
      window.Toast?.success('Announcement deleted');
      renderGrid(container, container.querySelector('#ann-status-filter').value);
    } catch (err) {
      window.Toast?.error('Could not delete announcement', err?.message);
    }
  }

  // ─── EDITOR MODAL ────────────────────────────────────────────────

  function openEditor(container, existing) {
    const isEdit = !!existing;
    const modalId = window.showModal(`
        <div style="display:flex; flex-direction:column; gap:14px;">
          <div class="form-group">
            <label>Title <span class="required">*</span></label>
            <input type="text" class="form-input" data-field="title" value="${existing ? escapeHTML(existing.title) : ''}" placeholder="e.g. Term 3 Exam Schedule" />
          </div>
          <div class="form-group">
            <label>Message <span class="required">*</span></label>
            <textarea class="form-textarea" data-field="body" placeholder="Write the announcement...">${existing ? escapeHTML(existing.body) : ''}</textarea>
          </div>
          <div class="form-group">
            <label>Audience</label>
            <div class="radio-card-group">
              ${AUDIENCES.map(a => `
                <label class="radio-card">
                  <input type="radio" name="audience" value="${a.id}" ${(existing?.target_roles?.[0] || 'all') === a.id ? 'checked' : ''} />
                  ${a.icon}<span>${a.label}</span>
                </label>
              `).join('')}
            </div>
          </div>
        </div>
      `, {
      title: isEdit ? 'Edit Announcement' : 'New Announcement',
      size: 'md',
      closeOnOutside: true,
      closeOnEscape: true,
      footer: `
        <button class="btn btn-outline" id="ann-modal-cancel">Cancel</button>
        <button class="btn btn-outline" id="ann-save-draft">Save as Draft</button>
        <button class="btn btn-primary" id="ann-save-submit">${isEdit ? 'Save & Publish' : 'Publish'}</button>
      `,
    });

    const modal = document.getElementById(modalId);
    if (!modal) return;

    modal.querySelector('#ann-modal-cancel')?.addEventListener('click', () => window.closeModal(modalId));

    function collect() {
      const title = modal.querySelector('[data-field="title"]').value.trim();
      const body = modal.querySelector('[data-field="body"]').value.trim();
      if (!title || !body) {
        window.Toast?.warning('Title and message are both required');
        return null;
      }
      const audience = modal.querySelector('input[name="audience"]:checked')?.value || 'all';
      return { title, body, target_roles: [audience] };
    }

    modal.querySelector('#ann-save-draft')?.addEventListener('click', () => save(container, modalId, collect(), existing, 'draft'));
    modal.querySelector('#ann-save-submit')?.addEventListener('click', () => save(container, modalId, collect(), existing, 'published'));
  }

  async function save(container, modalId, data, existing, status) {
    if (!data) return; // validation failed

    try {
      if (existing) {
        await update('announcements', existing.id, { ...data, status });
        Object.assign(existing, data, { status });
        if (status === 'published' && !existing.published_at) {
          const now = new Date().toISOString();
          await update('announcements', existing.id, { published_at: now });
          existing.published_at = now;
          await window.notifyAnnouncementPublished?.(existing);
        }
        window.Toast?.success('Announcement updated');
      } else {
        const now = new Date().toISOString();
        const created = await insert('announcements', {
          ...data,
          status,
          created_by: state.currentUser?.id ?? null,
          created_at: now,
          published_at: status === 'published' ? now : null,
        });
        state.announcements = [created, ...(state.announcements || [])];
        if (status === 'published') await window.notifyAnnouncementPublished?.(created);
        window.Toast?.success(status === 'draft' ? 'Draft saved' : 'Announcement published');
      }

      window.closeModal(modalId);
      renderGrid(container, container.querySelector('#ann-status-filter')?.value || '');
    } catch (err) {
      window.Toast?.error('Could not save announcement', err?.message);
    }
  }

  return { render, openEditor };
})();

// ─── EXPOSE ─────────────────────────────────────────────────────────

window.Announcements = Announcements;
window.renderAnnouncements = Announcements.render;
