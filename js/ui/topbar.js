/* ═══════════════════════════════════════════════════════════════════
   js/ui/topbar.js — Topbar controller
   ═══════════════════════════════════════════════════════════════════
   Renders into #app-topbar. Row 2 (year/term/progress/phase/days) is
   driven entirely by the `academicPeriodChanged` event dispatched from
   js/ui/sidebar.js — this file never reaches into sidebar state
   directly, so either side can change independently.

   Profile / Change Password / Biometrics open real modals via the
   Modals API (js/ui/modals.js). Theme toggling defers to js/ui/theme.js,
   sign-out to core/auth.js, in-app navigation to core/router.js.

   Last updated: 2026-07-14
   ═══════════════════════════════════════════════════════════════════ */

const Topbar = (() => {

  /* ═══════════════════════════════════════════════════════════════
     STATE
     ═══════════════════════════════════════════════════════════════ */

  let deferredInstallPrompt = null;
  let clockTimer = null;
  let isInitialized = false;

  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  /* ═══════════════════════════════════════════════════════════════
     RENDER
     ═══════════════════════════════════════════════════════════════ */

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
                        <div class="page-title" id="topbar-page-title">
                            <span class="highlight">Dashboard</span>
                        </div>
                        <div class="page-subtitle" id="topbar-page-subtitle">
                            School Management System
                        </div>
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
                        <div class="user-avatar" id="topbar-user-avatar">UG</div>
                        <div class="user-info">
                            <span class="name" id="topbar-user-name">UWAYO GANZA</span>
                            <span class="role" id="topbar-user-role">Head Teacher</span>
                        </div>
                        <span class="chevron">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                                <polyline points="6 9 12 15 18 9" />
                            </svg>
                        </span>

                        <div class="dropdown" id="topbar-user-dropdown">
                            <div class="dropdown-header">
                                <div class="user-avatar">UG</div>
                                <div class="user-info">
                                    <span class="name">UWAYO GANZA Eugene</span>
                                </div>
                            </div>
                            <div class="dropdown-divider"></div>
                            <button class="dropdown-item" data-action="profile">
                                <span class="icon"><i class="fa-solid fa-user"></i></span>
                                <span class="label">My Profile</span>
                            </button>
                            <button class="dropdown-item" data-action="change-password">
                                <span class="icon"><i class="fa-solid fa-key"></i></span>
                                <span class="label">Change Password</span>
                            </button>
                            <button class="dropdown-item" data-action="biometrics">
                                <span class="icon"><i class="fa-solid fa-fingerprint"></i></span>
                                <span class="label">Biometrics Setup</span>
                            </button>
                            <button class="dropdown-item" data-action="theme">
                                <span class="icon"><i class="fa-solid fa-moon" id="topbar-theme-icon"></i></span>
                                <span class="label" id="topbar-theme-label">Dark Mode</span>
                            </button>
                            <div class="dropdown-divider"></div>
                            <button class="dropdown-item" data-action="settings">
                                <span class="icon"><i class="fa-solid fa-gear"></i></span>
                                <span class="label">Settings</span>
                            </button>
                            <button class="dropdown-item" data-action="help">
                                <span class="icon"><i class="fa-solid fa-circle-question"></i></span>
                                <span class="label">Help Center</span>
                            </button>
                            <div class="dropdown-divider"></div>
                            <button class="dropdown-item danger" data-action="logout">
                                <span class="icon"><i class="fa-solid fa-right-from-bracket"></i></span>
                                <span class="label">Sign Out</span>
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            <div class="topbar-row2">
                <div class="year-badge">
                    <span class="status-dot" id="topbar-status-dot"></span>
                    <span>Year:</span>
                    <strong id="topbar-year-label">—</strong>
                </div>
                <div class="term-badge">
                    <strong id="topbar-term-label">—</strong>
                </div>
                <div class="progress-container">
                    <div class="progress-bar">
                        <div class="progress-fill" id="topbar-progress-fill" style="width:0%"></div>
                    </div>
                    <span class="progress-text" id="topbar-progress-text">0%</span>
                </div>
                <span class="phase-badge upcoming" id="topbar-phase-badge">—</span>
                <span class="days-remaining" id="topbar-days-remaining" style="display:none;">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <circle cx="12" cy="12" r="9" />
                        <path d="M12 7v5l3 3" />
                    </svg>
                    <strong id="topbar-days-num">—</strong> days left
                </span>
            </div>
        `;

    wireEvents();
    isInitialized = true;
  }

  /* ═══════════════════════════════════════════════════════════════
     EVENT WIRING
     ═══════════════════════════════════════════════════════════════ */

  function wireEvents() {
    // ── Hamburger ──────────────────────────────────────────────
    document.getElementById('topbar-hamburger')?.addEventListener('click', () => {
      if (window.Sidebar) {
        window.Sidebar.openMobileSidebar();
      }
    });

    // ── Notifications ──────────────────────────────────────────
    document.getElementById('topbar-notif-btn')?.addEventListener('click', () => {
      if (window.Router) {
        navigateTo('notifications');
      }
    });

    // ── User Menu ──────────────────────────────────────────────
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

    // ── Dropdown Items ─────────────────────────────────────────
    dropdown?.querySelectorAll('.dropdown-item').forEach((item) => {
      item.addEventListener('click', () => {
        handleDropdownAction(item.dataset.action);
      });
    });

    // ── Install Button ─────────────────────────────────────────
    document.getElementById('topbar-install-btn')?.addEventListener('click', triggerInstall);

    // ── Academic Period Change ────────────────────────────────
    document.addEventListener('academicPeriodChanged', (e) => {
      if (e.detail) {
        updatePeriodStrip(e.detail);
      }
    });
  }

  /* ═══════════════════════════════════════════════════════════════
     DROPDOWN ACTIONS
     ═══════════════════════════════════════════════════════════════ */

  function handleDropdownAction(action) {
    // Close the dropdown
    const menu = document.getElementById('topbar-user-menu');
    const dropdown = document.getElementById('topbar-user-dropdown');
    if (menu) menu.classList.remove('open');
    if (dropdown) dropdown.classList.remove('open');

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
        window.Modals?.open('confirm-logout');
        break;
      default:
        console.warn('[Topbar] Unknown action:', action);
    }
  }

  /* ═══════════════════════════════════════════════════════════════
     THEME
     ═══════════════════════════════════════════════════════════════ */

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

  /* ═══════════════════════════════════════════════════════════════
     PAGE TITLE
     ═══════════════════════════════════════════════════════════════ */

  /**
   * Set the page title and subtitle (called by core/router.js on navigation)
   * @param {string} title - The page title
   * @param {string} subtitle - Optional subtitle
   */
  function setPageTitle(title, subtitle) {
    const titleEl = document.getElementById('topbar-page-title');
    const subEl = document.getElementById('topbar-page-subtitle');

    if (titleEl) {
      titleEl.innerHTML = `<span class="highlight">${title}</span>`;
    }
    if (subEl && subtitle) {
      subEl.textContent = subtitle;
    }
  }

  /* ═══════════════════════════════════════════════════════════════
     ACADEMIC PERIOD STRIP
     ═══════════════════════════════════════════════════════════════ */

  /**
   * Update the academic period strip (year, term, progress, phase, days)
   * @param {object} detail - The period details from academicPeriodChanged event
   */
  function updatePeriodStrip(detail) {
    const {
      year,
      term,
      locked = false,
      isActive = true,
      progress = 0,
      daysRemaining = null
    } = detail || {};

    // ── Year ────────────────────────────────────────────────────
    const yearLabel = document.getElementById('topbar-year-label');
    if (yearLabel) {
      yearLabel.textContent = year ? year.replace('-', ' – ') : '—';
    }

    // ── Term ────────────────────────────────────────────────────
    const termLabel = document.getElementById('topbar-term-label');
    if (termLabel) {
      termLabel.textContent = term || '—';
    }

    // ── Status Dot ─────────────────────────────────────────────
    const dot = document.getElementById('topbar-status-dot');
    if (dot) {
      dot.className = 'status-dot';
      dot.innerHTML = '';

      if (locked) {
        dot.classList.add('locked');
        dot.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                    <rect x="4" y="10" width="16" height="10" rx="2" />
                    <path d="M8 10V7a4 4 0 0 1 8 0v3" />
                </svg>`;
      } else if (isActive) {
        dot.classList.add('active');
      } else {
        dot.classList.add('inactive');
      }
    }

    // ── Progress ───────────────────────────────────────────────
    const fill = document.getElementById('topbar-progress-fill');
    const pctText = document.getElementById('topbar-progress-text');

    if (fill) {
      const pct = Math.max(0, Math.min(100, progress || 0));
      fill.style.width = pct + '%';
      fill.classList.toggle('is-locked', !!locked);
    }

    if (pctText) {
      pctText.textContent = Math.round(progress || 0) + '%';
    }

    // ── Phase Badge ────────────────────────────────────────────
    const phase = document.getElementById('topbar-phase-badge');
    if (phase) {
      const pct = progress || 0;

      if (locked && pct === 0) {
        phase.innerHTML = '<i class="fa-solid fa-lock"></i> Locked';
        phase.className = 'phase-badge locked';
      } else if (pct >= 100) {
        phase.innerHTML = '<i class="fa-solid fa-circle-check"></i> Complete';
        phase.className = 'phase-badge complete';
      } else if (pct > 75) {
        phase.innerHTML = '<i class="fa-solid fa-pen-to-square"></i> Post-Midterm';
        phase.className = 'phase-badge post';
      } else if (pct > 0) {
        phase.innerHTML = '<i class="fa-solid fa-clipboard-list"></i> Pre-Midterm';
        phase.className = 'phase-badge pre';
      } else {
        phase.innerHTML = '<i class="fa-regular fa-hourglass-half"></i> Upcoming';
        phase.className = 'phase-badge upcoming';
      }
    }

    // ── Days Remaining ─────────────────────────────────────────
    const daysWrap = document.getElementById('topbar-days-remaining');
    const daysNum = document.getElementById('topbar-days-num');

    if (daysWrap && daysNum) {
      if (daysRemaining !== null && daysRemaining !== undefined && !locked) {
        daysWrap.style.display = '';
        daysNum.textContent = daysRemaining;
      } else {
        daysWrap.style.display = 'none';
      }
    }
  }

  /* ═══════════════════════════════════════════════════════════════
     CLOCK
     ═══════════════════════════════════════════════════════════════ */

  function tickClock() {
    const now = new Date();

    const dayEl = document.getElementById('topbar-day');
    const monthEl = document.getElementById('topbar-month');
    const yearEl = document.getElementById('topbar-year-num');
    const timeEl = document.getElementById('topbar-time');

    if (dayEl) dayEl.textContent = String(now.getDate()).padStart(2, '0');
    if (monthEl) monthEl.textContent = MONTHS[now.getMonth()];
    if (yearEl) yearEl.textContent = now.getFullYear();

    if (timeEl) {
      const hours = String(now.getHours()).padStart(2, '0');
      const minutes = String(now.getMinutes()).padStart(2, '0');
      timeEl.textContent = `${hours}:${minutes}`;
    }
  }

  /* ═══════════════════════════════════════════════════════════════
     PWA INSTALL PROMPT
     ═══════════════════════════════════════════════════════════════ */

  function initInstallPrompt() {
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      deferredInstallPrompt = e;
      const btn = document.getElementById('topbar-install-btn');
      if (btn) btn.classList.add('show');
    });

    window.addEventListener('appinstalled', () => {
      const btn = document.getElementById('topbar-install-btn');
      if (btn) btn.classList.remove('show');
      deferredInstallPrompt = null;
    });
  }

  function triggerInstall() {
    if (!deferredInstallPrompt) return;

    deferredInstallPrompt.prompt();
    deferredInstallPrompt.userChoice.then((choice) => {
      if (choice.outcome === 'accepted') {
        const btn = document.getElementById('topbar-install-btn');
        if (btn) btn.classList.remove('show');
      }
      deferredInstallPrompt = null;
    });
  }

  /* ═══════════════════════════════════════════════════════════════
     USER INFO UPDATE
     ═══════════════════════════════════════════════════════════════ */

  /**
   * Update the user information displayed in the topbar
   * @param {object} user - User object with name, role, initials
   */
  function setUserInfo(user) {
    if (!user) return;

    const nameEl = document.getElementById('topbar-user-name');
    const roleEl = document.getElementById('topbar-user-role');
    const avatarEl = document.getElementById('topbar-user-avatar');

    if (nameEl) nameEl.textContent = user.name || 'User';
    if (roleEl) roleEl.textContent = user.role || '—';

    if (avatarEl) {
      if (user.initials) {
        avatarEl.textContent = user.initials;
      } else if (user.name) {
        const parts = user.name.split(' ');
        avatarEl.textContent = parts.length > 1
          ? `${parts[0][0]}${parts[1][0]}`.toUpperCase()
          : parts[0].substring(0, 2).toUpperCase();
      }
    }

    // Also update dropdown header
    const dropdownAvatar = document.querySelector('#topbar-user-dropdown .dropdown-header .user-avatar');
    const dropdownName = document.querySelector('#topbar-user-dropdown .dropdown-header .user-info .name');

    if (dropdownAvatar && avatarEl) {
      dropdownAvatar.textContent = avatarEl.textContent;
    }
    if (dropdownName && nameEl) {
      dropdownName.textContent = nameEl.textContent;
    }
  }

  /* ═══════════════════════════════════════════════════════════════
     NOTIFICATION BADGE
     ═══════════════════════════════════════════════════════════════ */

  /**
   * Update the notification badge count
   * @param {number} count - Number of unread notifications
   */
  function setNotificationCount(count) {
    const badge = document.getElementById('topbar-notif-count');
    if (!badge) return;

    if (count > 0) {
      badge.textContent = count > 99 ? '99+' : String(count);
      badge.style.display = '';
    } else {
      badge.style.display = 'none';
    }
  }

  /* ═══════════════════════════════════════════════════════════════
     INITIALIZATION
     ═══════════════════════════════════════════════════════════════ */

  function init() {
    if (isInitialized) return;

    render();
    syncThemeLabel();
    tickClock();
    initInstallPrompt();

    // Update clock every 30 seconds
    clockTimer = setInterval(tickClock, 30000);

    console.log('[Topbar] Initialized');

    // Close period dropdown on outside click
}

  function destroy() {
    if (clockTimer) {
      clearInterval(clockTimer);
      clockTimer = null;
    }
    isInitialized = false;
    console.log('[Topbar] Destroyed');
  }

  /* ═══════════════════════════════════════════════════════════════
     PUBLIC API
     ═══════════════════════════════════════════════════════════════ */

  return {
    init,
    destroy,
    render,
    setPageTitle,
    setUserInfo,
    setNotificationCount,
    updatePeriodStrip,
    syncThemeLabel,
    tickClock
  };

})();

// ─── AUTO-INIT ──────────────────────────────────────────────────────
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', Topbar.init);
} else {
  Topbar.init();
}


// Period switching is handled by sidebar.js
// Period switching handled by sidebar.js
// ─── EXPOSE TO WINDOW ───────────────────────────────────────────────
window.Topbar = Topbar;
// Same reasoning as ui/sidebar.js's window.renderSidebar alias.
window.renderTopbar = Topbar.render;
