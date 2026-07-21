/* ═══════════════════════════════════════════════════════════════════
   js/modules/communication/announcement-center.js
   ═══════════════════════════════════════════════════════════════════
   The reading experience — what a teacher/accountant actually sees
   when they open announcements, distinct from announcements.js (the
   admin CRUD/scheduling/analytics view). Marks announcements read as
   they're expanded, which is what feeds the readCount/totalRecipients
   progress bar back on the admin side.

   Can render as a full page ('announcement-center' route) or be
   embedded inline in a dashboard widget via AnnouncementCenter.renderInto(el, { compact: true, limit: 3 }).
   ═══════════════════════════════════════════════════════════════════ */

const AnnouncementCenter = (() => {

  // MOCK_DATA — in the real system this reads from the same backing
  // store as announcements.js (core/api.js), filtered to status:
  // 'published' and to the current user's audience.
  const feed = [
    {
      id: 'ann-1', title: 'Term 3 Midterm Exam Schedule',
      body: 'Midterm exams begin Monday, August 4th. Please review the attached timetable with your class teacher. Students should arrive 15 minutes early on exam days, and all electronic devices must be left with the class teacher during the exam period.',
      audience: 'all', publishedAt: '2026-07-10T08:00:00', read: false, family: 'academics'
    },
    {
      id: 'ann-2', title: 'Staff Meeting \u2014 Friday 3PM',
      body: 'Mandatory staff meeting this Friday at 3:00 PM in the staff room to discuss the promotion criteria for this year.',
      audience: 'teachers', publishedAt: '2026-07-08T14:30:00', read: true, family: 'staff'
    },
    {
      id: 'ann-5', title: 'New Library Books Arrived',
      body: 'A new shipment of French and English reading books has arrived for the Primary section library. Classes are welcome to book a library visit slot with the front office.',
      audience: 'all', publishedAt: '2026-07-05T10:00:00', read: true, family: 'academics'
    }
  ];

  function escapeHTML(str) {
    const div = document.createElement('div');
    div.textContent = str ?? '';
    return div.innerHTML;
  }

  function timeAgo(iso) {
    const diffMs = Date.now() - new Date(iso).getTime();
    const days = Math.floor(diffMs / 86400000);
    if (days === 0) return 'Today';
    if (days === 1) return 'Yesterday';
    if (days < 7) return `${days} days ago`;
    return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
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
  }

  function updateUnreadCount(scope) {
    const el = scope.querySelector('#ac-unread-count');
    if (!el) return;
    const unread = feed.filter(a => !a.read).length;
    el.textContent = unread > 0 ? `${unread} unread` : 'All caught up';
  }

  function renderInto(target, opts = {}) {
    const { compact = false, limit = null } = opts;
    const items = limit ? feed.slice(0, limit) : feed;

    if (!items.length) {
      window.EmptyStates?.renderPreset(target, 'noData', { title: 'No announcements yet' });
      return;
    }

    target.innerHTML = items.map(a => `
      <div class="dash-card ${compact ? '' : ''}" style="margin-bottom:12px; ${a.read ? '' : `border-color:${MODULE_ACCENTS?.[a.family] || 'var(--accent)'}55;`}" data-ann-id="${a.id}">
        <div class="dash-card-header" style="cursor:pointer;" data-toggle="${a.id}">
          <span class="dash-card-title">
            ${!a.read ? `<span style="width:8px;height:8px;border-radius:50%;background:${MODULE_ACCENTS?.[a.family] || 'var(--accent)'};display:inline-block;margin-right:8px;"></span>` : ''}
            ${escapeHTML(a.title)}
          </span>
          <span class="dash-card-action">${timeAgo(a.publishedAt)}</span>
        </div>
        <div class="dash-card-body" data-body="${a.id}" style="${compact ? 'display:none;' : ''}">
          <p style="font-size:0.82rem; line-height:1.6; color:var(--card-text-muted,#94a3b8);">${escapeHTML(a.body)}</p>
        </div>
      </div>
    `).join('');

    if (!compact) {
      target.querySelectorAll('[data-toggle]').forEach(header => {
        header.addEventListener('click', () => {
          const id = header.dataset.toggle;
          const item = feed.find(a => a.id === id);
          const body = target.querySelector(`[data-body="${id}"]`);
          const isHidden = body.style.display === 'none';
          body.style.display = isHidden ? '' : 'none';
          if (isHidden && !item.read) {
            item.read = true;
            renderInto(target, opts); // re-render to drop the unread dot
            updateUnreadCount(document);
          }
        });
      });
    } else {
      target.querySelectorAll('.dash-card').forEach(card => {
        card.style.cursor = 'pointer';
        card.addEventListener('click', () => window.Router?.navigate('announcement-center'));
      });
    }
  }

  function markAllRead(container) {
    feed.forEach(a => { a.read = true; });
    renderInto(container.querySelector('#ac-feed'));
    updateUnreadCount(container);
    window.Toast?.success('All announcements marked as read');
  }

  function unreadCount() {
    return feed.filter(a => !a.read).length;
  }

  return { render, renderInto, unreadCount };
})();

// ─── EXPOSE ─────────────────────────────────────────────────────────
// window.AnnouncementCenter was never assigned anywhere in this file, and the router
// looks up window.renderAnnouncementCenter specifically (see core/router.js's
// moduleIdToRenderFn) — this page was completely unreachable via navigation
// despite being fully built.
window.AnnouncementCenter = AnnouncementCenter;
window.renderAnnouncementCenter = AnnouncementCenter.render;
