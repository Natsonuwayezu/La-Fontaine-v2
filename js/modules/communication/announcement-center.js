/* ═══════════════════════════════════════════════════════════════════
   js/modules/communication/announcement-center.js
   ═══════════════════════════════════════════════════════════════════
   The reading experience — what a teacher/accountant actually sees
   when they open announcements, distinct from announcements.js (the
   admin CRUD/publish view).

   Reads real state.announcements, filtered to status: 'published' and
   to the current user's role via target_roles (the same field
   announcements.js writes and notifyAnnouncementPublished() reads).

   Per-user read tracking: there's no dedicated announcement_reads
   table, but publishing an announcement already creates a real
   notification row per recipient (type: 'announcement', with
   meta.announcement_id linking back) via notifyAnnouncementPublished().
   This reuses that real link rather than inventing a second, separate
   read-tracking mechanism — expanding an announcement marks its linked
   notification read via the same real markNotificationRead() function
   notifications.js already uses.

   Can render as a full page ('announcement-center' route) or be
   embedded inline in a dashboard widget via
   AnnouncementCenter.renderInto(el, { compact: true, limit: 3 }).
   Last updated: 2026-07-29
   ═══════════════════════════════════════════════════════════════════ */

const AnnouncementCenter = (() => {

  function escapeHTML(str) {
    const div = document.createElement('div');
    div.textContent = str ?? '';
    return div.innerHTML;
  }

  function timeAgo(iso) {
    if (!iso) return '\u2014';
    const diffMs = Date.now() - new Date(iso).getTime();
    const days = Math.floor(diffMs / 86400000);
    if (days === 0) return 'Today';
    if (days === 1) return 'Yesterday';
    if (days < 7) return `${days} days ago`;
    return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  }

  /** Published announcements addressed to the current user's role. */
  function getFeed() {
    const myRole = state.currentUser?.role;
    return (state.announcements || [])
      .filter(a => a.status === 'published')
      .filter(a => {
        const roles = a.target_roles || ['all'];
        return roles.includes('all') || roles.includes(myRole) || (myRole === 'teacher' && roles.includes('teachers')) || (myRole === 'accountant' && roles.includes('accountants')) || (myRole === 'admin' && roles.includes('admin'));
      })
      .sort((a, b) => String(b.published_at || '').localeCompare(String(a.published_at || '')));
  }

  /** The real notification linked to this announcement for the
   *  current user, if any — used to know/mark whether I've read it. */
  function linkedNotification(announcementId) {
    return (state.notifications || []).find(n => n.type === 'announcement' && n.meta?.announcement_id === announcementId);
  }

  function isRead(announcementId) {
    const n = linkedNotification(announcementId);
    return n ? !!n.is_read : true; // no linked notification (e.g. I authored it) — nothing to mark unread
  }

  function render(container) {
    if (!container) return;
    container.innerHTML = `
      <div class="dashboard-page">
        <div class="reports-toolbar">
          <h2 style="font-family:'Syne',sans-serif; font-size:1.1rem; color:var(--card-text,#e2e8f0);">Announcements</h2>
          <div class="reports-toolbar__spacer"></div>
          <span id="ac-unread-count" style="font-size:0.78rem; color:var(--card-text-muted,#475569);"></span>
          <button class="btn btn-outline btn-sm" id="ac-mark-all">Mark all as read</button>
        </div>
        <div id="ac-feed"></div>
      </div>
    `;
    container.querySelector('#ac-mark-all').addEventListener('click', () => markAllRead(container));
    renderInto(container.querySelector('#ac-feed'));
    updateUnreadCount(container);

    if (!state.announcements || state.announcements.length === 0) {
      window.loadAllData?.({ silent: true }).then(() => {
        if (container.isConnected) { renderInto(container.querySelector('#ac-feed')); updateUnreadCount(container); }
      }).catch(() => {});
    }
  }

  function updateUnreadCount(scope) {
    const el = scope.querySelector('#ac-unread-count');
    if (!el) return;
    const unread = getFeed().filter(a => !isRead(a.id)).length;
    el.textContent = unread > 0 ? `${unread} unread` : 'All caught up';
  }

  function renderInto(target, opts = {}) {
    const { compact = false, limit = null } = opts;
    const feed = getFeed();
    const items = limit ? feed.slice(0, limit) : feed;

    if (!items.length) {
      window.EmptyStates?.renderPreset(target, 'noData', { title: 'No announcements yet' });
      return;
    }

    target.innerHTML = items.map(a => {
      const read = isRead(a.id);
      const accent = MODULE_ACCENTS?.academics || 'var(--accent)';
      return `
      <div class="dash-card" style="margin-bottom:12px; ${read ? '' : `border-color:${accent}55;`}" data-ann-id="${a.id}">
        <div class="dash-card-header" style="cursor:pointer;" data-toggle="${a.id}">
          <span class="dash-card-title">
            ${!read ? `<span style="width:8px;height:8px;border-radius:50%;background:${accent};display:inline-block;margin-right:8px;"></span>` : ''}
            ${escapeHTML(a.title)}
          </span>
          <span class="dash-card-action">${timeAgo(a.published_at)}</span>
        </div>
        <div class="dash-card-body" data-body="${a.id}" style="${compact ? 'display:none;' : ''}">
          <p style="font-size:0.82rem; line-height:1.6; color:var(--card-text-muted,#94a3b8);">${escapeHTML(a.body)}</p>
        </div>
      </div>
    `;
    }).join('');

    if (!compact) {
      target.querySelectorAll('[data-toggle]').forEach(header => {
        header.addEventListener('click', async () => {
          const id = Number(header.dataset.toggle);
          const body = target.querySelector(`[data-body="${id}"]`);
          const isHidden = body.style.display === 'none';
          body.style.display = isHidden ? '' : 'none';
          if (isHidden && !isRead(id)) {
            const n = linkedNotification(id);
            if (n) { await window.markNotificationRead?.(n.id); n.is_read = true; }
            renderInto(target, opts); // re-render to drop the unread dot
            updateUnreadCount(document);
          }
        });
      });
    } else {
      target.querySelectorAll('.dash-card').forEach(card => {
        card.style.cursor = 'pointer';
        card.addEventListener('click', () => window.navigateTo('announcement-center'));
      });
    }
  }

  async function markAllRead(container) {
    const unreadIds = getFeed().filter(a => !isRead(a.id)).map(a => linkedNotification(a.id)?.id).filter(Boolean);
    await Promise.all(unreadIds.map(id => window.markNotificationRead?.(id)));
    unreadIds.forEach(id => { const n = (state.notifications || []).find(x => x.id === id); if (n) n.is_read = true; });
    renderInto(container.querySelector('#ac-feed'));
    updateUnreadCount(container);
    window.Toast?.success('All announcements marked as read');
  }

  function unreadCount() {
    return getFeed().filter(a => !isRead(a.id)).length;
  }

  return { render, renderInto, unreadCount };
})();

// ─── EXPOSE ─────────────────────────────────────────────────────────

window.AnnouncementCenter = AnnouncementCenter;
window.renderAnnouncementCenter = AnnouncementCenter.render;
