/* ═══════════════════════════════════════════════════════════════════
   js/ui/topbar.js — Topbar controller
   ═══════════════════════════════════════════════════════════════════
   Renders into #app-topbar. Row 2 (year/term/progress/phase/days) is
   driven entirely by the `academicPeriodChanged` event dispatched from
   js/ui/sidebar.js — this file never reaches into sidebar state
   directly, so either side can change independently.

   Profile / Change Password / Biometrics open real modals via the
   Modals API (js/ui/modals.js — not yet built; calls below will throw
   until that file exists, same as any other forward-referenced module
   in this build). Theme toggling defers to js/ui/theme.js, sign-out to
   core/auth.js, in-app navigation to core/router.js.
   ═══════════════════════════════════════════════════════════════════ */

const Topbar = (() => {

  let deferredInstallPrompt = null;
  let clockTimer = null;

  function render() {
    const mount = document.getElementById('app-topbar');
    if (!mount) return;

    mount.innerHTML = `
      <div class="topbar-row1">
        <div class="topbar-left">
          <button class="hamburger-btn" id="topbar-hamburger" aria-label="Toggle sidebar">
            <i class="fa-solid fa-bars"></i>
          </button>
          <div class="page-title-group">
            <div class="page-title" id="topbar-page-title"><span class="highlight">Dashboard</span></div>
            <div class="page-subtitle" id="topbar-page-subtitle">School Management System</div>
          </div>
        </div>

        <div class="topbar-center">
          <div class="date-display">
            <span class="date-icon"><i class="fa-regular fa-calendar"></i></span>
            <span class="date-text">
              <span class="day" id="topbar-day">--</span>
              <span id="topbar-month">---</span>
              <span class="year" id="topbar-year-num">----</span>
            </span>
            <span class="divider"></span>
            <span class="time-text" id="topbar-time">--:--</span>
          </div>
        </div>

        <div class="topbar-right">
          <button class="install-btn" id="topbar-install-btn">
            <i class="fa-solid fa-download"></i> Install
          </button>

          <button class="icon-btn" id="topbar-notif-btn" title="Notifications">
            <i class="fa-solid fa-bell"></i>
            <span class="notif-count" id="topbar-notif-count">3</span>
          </button>

          <div class="user-menu" id="topbar-user-menu">
            <div class="user-avatar">UG</div>
            <div class="user-info">
              <span class="name">UWAYO GANZA</span>
              <span class="role">Head Teacher</span>
            </div>
            <span class="chevron"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg></span>

            <div class="dropdown" id="topbar-user-dropdown">
              <div class="dropdown-header">
                <div class="user-avatar">UG</div>
                <div class="user-info"><span class="name">UWAYO GANZA Eugene</span></div>
              </div>
              <div class="dropdown-divider"></div>
              <button class="dropdown-item" data-action="profile">
                <span class="icon"><i class="fa-solid fa-user"></i></span><span class="label">My Profile</span>
              </button>
              <button class="dropdown-item" data-action="change-password">
                <span class="icon"><i class="fa-solid fa-key"></i></span><span class="label">Change Password</span>
              </button>
              <button class="dropdown-item" data-action="biometrics">
                <span class="icon"><i class="fa-solid fa-fingerprint"></i></span><span class="label">Biometrics Setup</span>
              </button>
              <button class="dropdown-item" data-action="theme">
                <span class="icon"><i class="fa-solid fa-moon" id="topbar-theme-icon"></i></span>
                <span class="label" id="topbar-theme-label">Dark Mode</span>
              </button>
              <div class="dropdown-divider"></div>
              <button class="dropdown-item" data-action="settings">
                <span class="icon"><i class="fa-solid fa-gear"></i></span><span class="label">Settings</span>
              </button>
              <button class="dropdown-item" data-action="help">
                <span class="icon"><i class="fa-solid fa-circle-question"></i></span><span class="label">Help Center</span>
              </button>
              <div class="dropdown-divider"></div>
              <button class="dropdown-item danger" data-action="logout">
                <span class="icon"><i class="fa-solid fa-right-from-bracket"></i></span><span class="label">Sign Out</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      <div class="topbar-row2">
        <div class="year-badge">
          <span class="status-dot" id="topbar-status-dot"></span>
          <span>Year:</span>
          <strong id="topbar-year-label">\u2014</strong>
        </div>
        <div class="term-badge"><strong id="topbar-term-label">\u2014</strong></div>
        <div class="progress-container">
          <div class="progress-bar"><div class="progress-fill" id="topbar-progress-fill" style="width:0%"></div></div>
          <span class="progress-text" id="topbar-progress-text">0%</span>
        </div>
        <span class="phase-badge upcoming" id="topbar-phase-badge">\u2014</span>
        <span class="days-remaining" id="topbar-days-remaining" style="display:none;">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/></svg>
          <strong id="topbar-days-num">\u2014</strong> days left
        </span>
      </div>
    `;

    wireEvents();
  }

  function wireEvents() {
    document.getElementById('topbar-hamburger')?.addEventListener('click', () => {
      if (window.Sidebar) window.Sidebar.openMobileSidebar();
    });

    document.getElementById('topbar-notif-btn')?.addEventListener('click', () => {
      if (window.Router) window.Router.navigate('notifications');
    });

    const menu = document.getElementById('topbar-user-menu');
    const dropdown = document.getElementById('topbar-user-dropdown');
    menu?.addEventListener('click', (e) => {
      if (e.target.closest('.dropdown-item')) return;
      menu.classList.toggle('open');
      dropdown.classList.toggle('open');
    });

    document.addEventListener('click', (e) => {
      if (menu && !menu.contains(e.target)) {
        menu.classList.remove('open');
        dropdown.classList.remove('open');
      }
    });

    dropdown?.querySelectorAll('.dropdown-item').forEach(item => {
      item.addEventListener('click', () => handleDropdownAction(item.dataset.action));
    });

    document.getElementById('topbar-install-btn')?.addEventListener('click', triggerInstall);

    document.addEventListener('academicPeriodChanged', (e) => updatePeriodStrip(e.detail));
  }

  function handleDropdownAction(action) {
    document.getElementById('topbar-user-menu')?.classList.remove('open');
    document.getElementById('topbar-user-dropdown')?.classList.remove('open');

    switch (action) {
      case 'profile':
        window.Modals?.open('profile');
        break;
      case 'change-password':
        window.Modals?.open('change-password');
        break;
      case 'biometrics':
        window.Modals?.open('biometrics-setup');
        break;
      case 'theme':
        toggleTheme();
        break;
      case 'settings':
        window.Router?.navigate('school-settings');
        break;
      case 'help':
        window.Router?.navigate('help');
        break;
      case 'logout':
        window.Modals?.open('confirm-logout'); // custom confirm, never window.confirm()
        break;
    }
  }

  function toggleTheme() {
    if (window.Theme) {
      window.Theme.toggle();
      syncThemeLabel();
    }
  }

  function syncThemeLabel() {
    const isDark = (document.documentElement.getAttribute('data-theme') || 'dark') === 'dark';
    const icon = document.getElementById('topbar-theme-icon');
    const label = document.getElementById('topbar-theme-label');
    if (!icon || !label) return;
    icon.className = isDark ? 'fa-solid fa-moon' : 'fa-solid fa-sun';
    label.textContent = isDark ? 'Dark Mode' : 'Light Mode';
  }

  // ── Page title (called by core/router.js on navigation) ─────────
  function setPageTitle(title, subtitle) {
    const titleEl = document.getElementById('topbar-page-title');
    const subEl = document.getElementById('topbar-page-subtitle');
    if (titleEl) titleEl.innerHTML = `<span class="highlight">${title}</span>`;
    if (subEl && subtitle) subEl.textContent = subtitle;
  }

  // ── Academic period strip (Rule #9) ──────────────────────────────
  function updatePeriodStrip(detail) {
    const { year, term, locked, isActive, progress, daysRemaining } = detail;

    document.getElementById('topbar-year-label').textContent = year.replace('-', ' \u2013 ');
    document.getElementById('topbar-term-label').textContent = term;

    const dot = document.getElementById('topbar-status-dot');
    dot.className = 'status-dot';
    dot.innerHTML = '';
    if (locked) {
      dot.classList.add('locked');
      dot.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="4" y="10" width="16" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>';
    } else if (isActive) {
      dot.classList.add('active');
    } else {
      dot.classList.add('inactive');
    }

    const fill = document.getElementById('topbar-progress-fill');
    const pct = Math.max(0, Math.min(100, progress || 0));
    fill.style.width = pct + '%';
    fill.classList.toggle('is-locked', !!locked);
    document.getElementById('topbar-progress-text').textContent = pct + '%';

    const phase = document.getElementById('topbar-phase-badge');
    if (locked && pct === 0) { phase.textContent = 'Locked'; phase.className = 'phase-badge locked'; }
    else if (pct >= 100) { phase.textContent = 'Complete'; phase.className = 'phase-badge complete'; }
    else if (pct > 75) { phase.textContent = 'Post-Midterm'; phase.className = 'phase-badge post'; }
    else if (pct > 0) { phase.textContent = 'Pre-Midterm'; phase.className = 'phase-badge pre'; }
    else { phase.textContent = 'Upcoming'; phase.className = 'phase-badge upcoming'; }

    const daysWrap = document.getElementById('topbar-days-remaining');
    if (daysRemaining != null && !locked) {
      daysWrap.style.display = '';
      document.getElementById('topbar-days-num').textContent = daysRemaining;
    } else {
      daysWrap.style.display = 'none';
    }
  }

  // ── Date / time clock ─────────────────────────────────────────────
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  function tickClock() {
    const now = new Date();
    document.getElementById('topbar-day').textContent = now.getDate();
    document.getElementById('topbar-month').textContent = MONTHS[now.getMonth()];
    document.getElementById('topbar-year-num').textContent = now.getFullYear();
    document.getElementById('topbar-time').textContent =
      `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  }

  // ── PWA install prompt ────────────────────────────────────────────
  function initInstallPrompt() {
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      deferredInstallPrompt = e;
      document.getElementById('topbar-install-btn')?.classList.add('show');
    });
    window.addEventListener('appinstalled', () => {
      document.getElementById('topbar-install-btn')?.classList.remove('show');
      deferredInstallPrompt = null;
    });
  }

  function triggerInstall() {
    if (!deferredInstallPrompt) return;
    deferredInstallPrompt.prompt();
    deferredInstallPrompt.userChoice.then((choice) => {
      if (choice.outcome === 'accepted') {
        document.getElementById('topbar-install-btn')?.classList.remove('show');
      }
      deferredInstallPrompt = null;
    });
  }

  function init() {
    render();
    syncThemeLabel();
    tickClock();
    clockTimer = setInterval(tickClock, 30000);
    initInstallPrompt();
  }

  return { init, setPageTitle };
})();

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', Topbar.init);
} else {
  Topbar.init();
}
