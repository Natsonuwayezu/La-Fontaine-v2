/* ═══════════════════════════════════════════════════════════════════
   js/modules/communication/notification-center.js
   ═══════════════════════════════════════════════════════════════════
   A compact dropdown preview of the most recent notifications —
   distinct from notifications.js (the full paginated inbox page).
   Meant to be attached to the topbar bell so a user gets an instant
   preview without leaving their current screen, with a "View all"
   link that navigates to the full inbox.

   NotificationCenter.attach(triggerEl) wires click-to-open/close and
   outside-click dismissal itself (independent of js/ui/dropdowns.js,
   since this needs its own unread-badge-sync behavior). To wire it to
   the existing topbar bell instead of that button's current direct
   navigation, replace the click handler on #topbar-notif-btn in
   js/ui/topbar.js with `NotificationCenter.attach(...)` — a one-line
   change left for whenever the topbar is revisited, so as not to
   touch that file in this pass.

   Reuses the .dropdown/.dropdown-item shape from topbar.css.
   ═══════════════════════════════════════════════════════════════════ */

const NotificationCenter = (() => {

  const PREVIEW_LIMIT = 6;

  function escapeHTML(str) {
    const div = document.createElement('div');
    div.textContent = str ?? '';
    return div.innerHTML;
  }

  function timeAgo(iso) {
    const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
    if (mins < 60) return `${mins}m`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h`;
    return `${Math.floor(hrs / 24)}d`;
  }

  // Reads the same underlying list Notifications (notifications.js) owns,
  // if that module has already been loaded; otherwise falls back to a
  // small local preview set so this widget still works if attached
  // before the full inbox module has ever been navigated to.
  function getPreviewItems() {
    if (window.Notifications?.__previewList) return window.Notifications.__previewList();
    return [
      { id: 'n1', type: 'payment', title: 'Payment received', message: '50,000 RWF from MUGISHA Jean', time: new Date(Date.now() - 20 * 60000).toISOString(), read: false },
      { id: 'n2', type: 'overdue', title: 'Overdue balance', message: 'HABIMANA Eric \u2014 85,000 RWF, 47 days', time: new Date(Date.now() - 3 * 3600000).toISOString(), read: false },
      { id: 'n3', type: 'marks', title: 'Marks saved', message: 'Primary 4A \u00b7 Mathematics Quiz 4', time: new Date(Date.now() - 26 * 3600000).toISOString(), read: true }
    ];
  }

  function unreadCount() {
    return window.Notifications?.unreadCount?.() ?? getPreviewItems().filter(n => !n.read).length;
  }

  let openPanel = null;

  function close() {
    openPanel?.remove();
    openPanel = null;
  }

  function buildPanel(triggerEl) {
    const items = getPreviewItems().slice(0, PREVIEW_LIMIT);
    const panel = document.createElement('div');
    panel.className = 'dropdown open';
    panel.style.position = 'fixed';
    panel.style.minWidth = '320px';
    panel.style.maxHeight = '70vh';
    panel.style.overflowY = 'auto';

    panel.innerHTML = `
      <div class="dropdown-header" style="justify-content:space-between; display:flex; align-items:center;">
        <span class="name">Notifications</span>
        <button class="dropdown-item" style="width:auto; padding:2px 8px;" data-mark-all>Mark all read</button>
      </div>
      <div class="dropdown-divider"></div>
      ${items.length ? items.map(n => `
        <button class="dropdown-item" data-notif="${n.id}" style="align-items:flex-start;">
          <span class="icon">${!n.read ? '<span style="width:6px;height:6px;border-radius:50%;background:var(--danger);display:inline-block;"></span>' : ''}</span>
          <span class="label" style="white-space:normal;">
            <strong>${escapeHTML(n.title)}</strong><br/>
            <span style="color:var(--dropdown-text,#94a3b8); font-size:0.72rem;">${escapeHTML(n.message)}</span>
          </span>
          <span class="shortcut">${timeAgo(n.time)}</span>
        </button>
      `).join('') : `<div class="dropdown-item" style="color:var(--dropdown-text,#94a3b8);">No notifications</div>`}
      <div class="dropdown-divider"></div>
      <button class="dropdown-item" data-view-all style="justify-content:center; font-weight:700; color:var(--accent-light,#60a5fa);">View all notifications</button>
    `;

    document.body.appendChild(panel);
    positionPanel(panel, triggerEl);

    panel.querySelector('[data-view-all]').addEventListener('click', () => {
      close();
      window.Router?.navigate('notifications');
    });
    panel.querySelector('[data-mark-all]').addEventListener('click', (e) => {
      e.stopPropagation();
      window.Notifications ? window.Notifications.markAllReadExternal?.() : null;
      close();
      window.Toast?.success('All notifications marked as read');
    });
    panel.querySelectorAll('[data-notif]').forEach(btn => {
      btn.addEventListener('click', () => {
        close();
        window.Router?.navigate('notifications');
      });
    });

    return panel;
  }

  function positionPanel(panel, triggerEl) {
    const rect = triggerEl.getBoundingClientRect();
    const panelRect = panel.getBoundingClientRect();
    let left = rect.right - panelRect.width;
    if (left < 8) left = 8;
    panel.style.top = `${rect.bottom + 8}px`;
    panel.style.left = `${left}px`;
  }

  function attach(triggerEl) {
    if (!triggerEl || triggerEl.dataset.notifCenterBound) return;
    triggerEl.dataset.notifCenterBound = 'true';

    triggerEl.addEventListener('click', (e) => {
      e.stopPropagation();
      if (openPanel) { close(); return; }
      openPanel = buildPanel(triggerEl);
    });

    document.addEventListener('click', (e) => {
      if (openPanel && !openPanel.contains(e.target) && !triggerEl.contains(e.target)) close();
    });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
    document.addEventListener('appResize', close);
  }

  return { attach, close, unreadCount };
})();
