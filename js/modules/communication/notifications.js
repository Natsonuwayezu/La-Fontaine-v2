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

  // MOCK_DATA — replace with core/api.js / core/notifications-engine.js
  let notifications = [
    { id: 'n1', type: 'payment', title: 'Payment received', message: '50,000 RWF from MUGISHA Jean \u00b7 Receipt R-042', time: '2026-07-14T10:42:00', read: false },
    { id: 'n2', type: 'overdue', title: 'Overdue balance', message: 'HABIMANA Eric is 47 days overdue \u00b7 85,000 RWF balance', time: '2026-07-14T08:20:00', read: false },
    { id: 'n3', type: 'marks', title: 'Marks saved', message: '28 marks saved for Primary 4A \u00b7 Mathematics Quiz 4', time: '2026-07-13T15:10:00', read: true },
    { id: 'n4', type: 'attendance', title: 'Low attendance alert', message: 'Primary 1 attendance dropped below 85% this week', time: '2026-07-13T09:00:00', read: false },
    { id: 'n5', type: 'system', title: 'Backup completed', message: 'Automatic backup created \u00b7 12.8 MB', time: '2026-07-12T02:00:00', read: true },
    { id: 'n6', type: 'payment', title: 'Payment received', message: '30,000 RWF from UWERA Grace \u00b7 Receipt R-041', time: '2026-07-12T09:15:00', read: true },
    { id: 'n7', type: 'marks', title: 'Assessment locked', message: 'Mid-Term assessment locked for Primary 5B', time: '2026-07-11T16:00:00', read: true },
    { id: 'n8', type: 'system', title: 'New student enrolled', message: 'HABIMANA Grace enrolled in Primary 2', time: '2026-07-11T11:30:00', read: true }
  ];

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
    return notifications
      .filter(n => !type || n.type === type)
      .filter(n => !unreadOnly || !n.read)
      .sort((a, b) => new Date(b.time) - new Date(a.time));
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
        <div class="activity-item" style="${n.read ? '' : `background:${meta.color}0d;`}" data-id="${n.id}">
          <div class="activity-icon" style="background:${meta.color}22; color:${meta.color};">${meta.icon}</div>
          <div class="activity-body">
            <div class="activity-text">
              ${!n.read ? `<span style="width:6px;height:6px;border-radius:50%;background:${meta.color};display:inline-block;margin-right:6px;"></span>` : ''}
              <strong>${escapeHTML(n.title)}</strong> \u2014 ${escapeHTML(n.message)}
            </div>
            <div class="activity-time">${timeAgo(n.time)}</div>
          </div>
          <button class="btn btn-sm btn-outline" data-view="${n.id}">View</button>
          <button class="modal-close" data-dismiss="${n.id}" title="Dismiss" style="margin-left:4px;">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
      `;
    }).join('');

    listEl.querySelectorAll('[data-view]').forEach(btn => {
      btn.addEventListener('click', () => {
        const n = notifications.find(x => x.id === btn.dataset.view);
        n.read = true;
        window.Router?.navigate((TYPE_META[n.type] || TYPE_META.system).route);
      });
    });
    listEl.querySelectorAll('[data-dismiss]').forEach(btn => {
      btn.addEventListener('click', () => {
        notifications = notifications.filter(x => x.id !== btn.dataset.dismiss);
        renderList(container);
      });
    });
  }

  function markAllRead(container) {
    notifications.forEach(n => { n.read = true; });
    renderList(container);
    window.Toast?.success('All notifications marked as read');
  }

  function unreadCount() {
    return notifications.filter(n => !n.read).length;
  }

  // Small hooks consumed by notification-center.js's compact dropdown,
  // so it can preview/act on the same underlying data this full inbox
  // page owns rather than keeping a separate mock list once this module
  // has actually been loaded.
  function previewList() {
    return [...notifications].sort((a, b) => new Date(b.time) - new Date(a.time));
  }

  function markAllReadExternal() {
    notifications.forEach(n => { n.read = true; });
  }

  return { render, unreadCount, __previewList: previewList, markAllReadExternal };
})();
