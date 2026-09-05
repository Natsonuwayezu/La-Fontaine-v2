/* ═══════════════════════════════════════════════════════════════════
   js/modules/communication/notifications.js — Notifications inbox
   ═══════════════════════════════════════════════════════════════════
   Full-page notification list (what the topbar bell navigates to).
   For a compact dropdown preview instead of a full navigation, see
   notification-center.js.

   Rendered into #app-main for the 'notifications' route.
   ═══════════════════════════════════════════════════════════════════ */

const Notifications = (() => {

  const TYPE_META = {
    payment:   { icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v20M17 5.5c0-1.93-2.24-3.5-5-3.5s-5 1.57-5 3.5 2.24 3.5 5 3.5 5 1.57 5 3.5-2.24 3.5-5 3.5-5-1.57-5-3.5"/></svg>', color: MODULE_ACCENTS?.finance, label: 'Payment', route: 'payment-history' },
    marks:     { icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>', color: MODULE_ACCENTS?.academics, label: 'Marks', route: 'marks-database' },
    attendance:{ icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>', color: MODULE_ACCENTS?.attendance, label: 'Attendance', route: 'attendance-reports' },
    system:    { icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>', color: MODULE_ACCENTS?.system, label: 'System', route: 'system-logs' },
    overdue:   { icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/></svg>', color: 'var(--danger)', route: 'payment-history' }
  };

  // Real state.notifications, loaded per-user at boot by
  // core/notifications-engine.js's loadUserNotifications() (or lazily
  // triggered below if this session hasn't loaded them yet).
  function getNotifications() {
    return state.notifications || [];
  }

  let pager = null;
  let activeFilter = '';

  function escapeHTML(str) {
    const div = document.createElement('div');
    div.textContent = str ?? '';
    return div.innerHTML;
  }

  function timeAgo(iso) {
    const diffMs = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diffMs / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (days < 7) return `${days}d ago`;
    return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  }

  function render(container) {
    if (!container) return;
    container.innerHTML = `
      <div class="dashboard-page">
        <div class="filters-bar">
          <h2 style="font-family:'Syne',sans-serif; font-size:1.1rem; color:var(--card-text,#e2e8f0); margin-right:8px;">Notifications</h2>
          <select class="form-select" id="notif-type-filter">
            <option value="">All types</option>
            <option value="payment">Payment</option>
            <option value="overdue">Overdue</option>
            <option value="marks">Marks</option>
            <option value="attendance">Attendance</option>
            <option value="system">System</option>
          </select>
          <label class="checkbox checkbox-sm" style="margin-left:6px;">
            <input type="checkbox" id="notif-unread-only" />
            <span class="checkbox__box"><svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg></span>
            Unread only
          </label>
          <span class="result-count" id="notif-count"></span>
          <div class="filter-actions">
            <button class="btn btn-outline btn-sm" id="notif-mark-all">Mark all read</button>
          </div>
        </div>
        <div class="dash-card" style="margin-top:14px;">
          <div class="dash-card-body no-padding" id="notif-list"></div>
        </div>
        <div id="notif-pager" style="display:flex; justify-content:center; margin-top:14px;"></div>
      </div>
    `;

    container.querySelector('#notif-type-filter').addEventListener('change', () => renderList(container));
    container.querySelector('#notif-unread-only').addEventListener('change', () => renderList(container));
    container.querySelector('#notif-mark-all').addEventListener('click', () => markAllRead(container));

    renderList(container);
  }

  function filteredList(container) {
    const type = container.querySelector('#notif-type-filter').value;
    const unreadOnly = container.querySelector('#notif-unread-only').checked;
    return getNotifications()
      .filter(n => !type || n.type === type)
      .filter(n => !unreadOnly || !n.is_read)
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  }

  function renderList(container) {
    const list = filteredList(container);
    container.querySelector('#notif-count').textContent = `${list.length} notification${list.length === 1 ? '' : 's'}`;

    const listEl = container.querySelector('#notif-list');
    if (!list.length) {
      window.EmptyStates?.renderPreset(listEl, 'noSearchResults', { title: 'No notifications', message: 'Nothing matches your current filters.' });
      container.querySelector('#notif-pager').innerHTML = '';
      return;
    }

    const pageSize = 8;
    if (!pager) {
      pager = window.Pagination?.create(container.querySelector('#notif-pager'), {
        totalItems: list.length, pageSize, onPageChange: () => paintPage(container, list, pageSize)
      });
    } else {
      pager.setTotalItems(list.length);
    }
    paintPage(container, list, pageSize);
  }

  function paintPage(container, list, pageSize) {
    const page = pager?.getPage() || 1;
    const start = (page - 1) * pageSize;
    const pageItems = list.slice(start, start + pageSize);
    const listEl = container.querySelector('#notif-list');

    listEl.innerHTML = pageItems.map(n => {
      const meta = TYPE_META[n.type] || TYPE_META.system;
      return `
        <div class="activity-item" style="${n.is_read ? '' : `background:${meta.color}0d;`}" data-id="${n.id}">
          <div class="activity-icon" style="background:${meta.color}22; color:${meta.color};">${meta.icon}</div>
          <div class="activity-body">
            <div class="activity-text">
              ${!n.is_read ? `<span style="width:6px;height:6px;border-radius:50%;background:${meta.color};display:inline-block;margin-right:6px;"></span>` : ''}
              <strong>${escapeHTML(meta.label || n.type)}</strong> \u2014 ${escapeHTML(n.message)}
            </div>
            <div class="activity-time">${timeAgo(n.created_at)}</div>
          </div>
          <button class="btn btn-sm btn-outline" data-view="${n.id}">View</button>
          <button class="modal-close" data-dismiss="${n.id}" title="Dismiss" style="margin-left:4px;">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
      `;
    }).join('');

    listEl.querySelectorAll('[data-view]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = parseInt(btn.dataset.view, 10);
        const n = getNotifications().find(x => x.id === id);
        if (!n) return;
        if (!n.is_read) {
          await window.markNotificationRead?.(id);
          n.is_read = true;
        }
        window.navigateTo((TYPE_META[n.type] || TYPE_META.system).route);
      });
    });
    listEl.querySelectorAll('[data-dismiss]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = parseInt(btn.dataset.dismiss, 10);
        try {
          await window.remove('notifications', id);
    if (typeof loadAllData === 'function') loadAllData({ silent: true }).catch(() => {});
          state.notifications = getNotifications().filter(x => x.id !== id);
          renderList(container);
        } catch (err) {
          window.Toast?.error('Could not dismiss notification', err?.message);
        }
      });
    });
  }

  async function markAllRead(container) {
    await window.markAllNotificationsRead?.();
    renderList(container);
    window.Toast?.success('All notifications marked as read');
  }

  function unreadCount() {
    return getNotifications().filter(n => !n.is_read).length;
  }

  // Small hooks consumed by notification-center.js's compact dropdown,
  // so it can preview/act on the same real state.notifications this
  // full inbox page reads, rather than keeping a separate mock list.
  function previewList() {
    return [...getNotifications()].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  }

  return { render, unreadCount, __previewList: previewList };
})();

// ─── EXPOSE ─────────────────────────────────────────────────────────

window.Notifications = Notifications;
window.renderNotifications = Notifications.render;
