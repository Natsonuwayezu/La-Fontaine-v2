/* ═══════════════════════════════════════════════════════════════════
   js/ui/shell.js — App shell controller
   ═══════════════════════════════════════════════════════════════════
   Expects (from index.html): #boot-loader, #app, #login-root,
   #app-sidebar (rendered by sidebar.js), #app-main.

   Responsibilities:
   - Switch between #login-root and #app based on auth state
   - Hide the boot loader once the shell is ready to show
   - Persist/restore sidebar collapsed state across sessions
   - Broadcast a debounced `appResize` event other modules (charts.js,
     tables.js) listen to instead of each attaching their own resize
     listener

   Last updated: 2026-07-14
   ═══════════════════════════════════════════════════════════════════ */

const Shell = (() => {

  const COLLAPSE_KEY = 'elf_sidebar_collapsed';
  let resizeTimer = null;

  /* ═══════════════════════════════════════════════════════════════
     SHELL VISIBILITY
     ═══════════════════════════════════════════════════════════════ */

  /**
   * Show the main app and hide the login screen
   */
  function showApp() {
    const loginRoot = document.getElementById('login-root');
    const app = document.getElementById('app');

    if (loginRoot) loginRoot.setAttribute('hidden', '');
    if (app) app.removeAttribute('hidden');

    restoreCollapseState();
    hideBootLoader();
  }

  /**
   * Show the login screen and hide the main app
   */
  function showLogin() {
    const app = document.getElementById('app');
    const loginRoot = document.getElementById('login-root');

    if (app) app.setAttribute('hidden', '');
    if (loginRoot) loginRoot.removeAttribute('hidden');

    hideBootLoader();
  }

  /**
   * Hide the boot loader with a smooth fade-out
   */
  function hideBootLoader() {
    const loader = document.getElementById('boot-loader');
    if (!loader) return;

    loader.classList.add('is-hidden');
    setTimeout(() => {
      if (loader.parentNode) loader.remove();
    }, 550);
  }

  /* ═══════════════════════════════════════════════════════════════
     SIDEBAR COLLAPSE PERSISTENCE
     ═══════════════════════════════════════════════════════════════ */

  /**
   * Restore sidebar collapse state from localStorage
   */
  function restoreCollapseState() {
    // Collapse is desktop-only — skip on mobile
    if (window.innerWidth <= 820) return;

    let collapsed = false;
    try {
      collapsed = localStorage.getItem(COLLAPSE_KEY) === 'true';
    } catch (_) { /* ignore */ }

    const sidebar = document.getElementById('app-sidebar');
    if (sidebar) {
      sidebar.classList.toggle('collapsed', collapsed);
    }
  }

  /**
   * Persist sidebar collapse state to localStorage
   * @param {boolean} collapsed - Whether the sidebar is collapsed
   */
  function persistCollapseState(collapsed) {
    try {
      localStorage.setItem(COLLAPSE_KEY, String(collapsed));
    } catch (_) { /* storage unavailable */ }
  }

  /**
   * Watch for sidebar class changes and persist the state
   * This keeps any future call site (keyboard shortcut, etc.) in sync
   */
  function watchCollapseToggle() {
    const sidebar = document.getElementById('app-sidebar');
    if (!sidebar) return;

    const observer = new MutationObserver(() => {
      persistCollapseState(sidebar.classList.contains('collapsed'));
    });

    observer.observe(sidebar, {
      attributes: true,
      attributeFilter: ['class']
    });
  }

  /* ═══════════════════════════════════════════════════════════════
     RESIZE BROADCASTING
     ═══════════════════════════════════════════════════════════════ */

  /**
   * Initialize a debounced resize event broadcaster
   * Other modules (charts.js, tables.js) listen to 'appResize'
   * instead of each attaching their own resize listener
   */
  function initResizeBroadcast() {
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        document.dispatchEvent(new CustomEvent('appResize', {
          detail: {
            width: window.innerWidth,
            height: window.innerHeight
          }
        }));
      }, 150);
    });
  }

  /* ═══════════════════════════════════════════════════════════════
     INITIALIZATION
     ═══════════════════════════════════════════════════════════════ */

  /**
   * Initialize the shell
   */
  function init() {
    watchCollapseToggle();
    initResizeBroadcast();

    // Actual auth-state decision belongs to core/auth.js once it exists.
    // For now default to the login screen so the shell isn't left in an
    // ambiguous state before that file is wired in.
    if (!window.Auth) {
      showLogin();
    }
  }

  // ── Auto-initialize ──────────────────────────────────────────────

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  /* ═══════════════════════════════════════════════════════════════
     PUBLIC API
     ═══════════════════════════════════════════════════════════════ */

  return {
    init,
    showApp,
    showLogin,
    hideBootLoader,
    restoreCollapseState,
    persistCollapseState
  };

})();

// ─── EXPOSE TO WINDOW ───────────────────────────────────────────────
window.Shell = Shell;
// window-exposure.js's sanity check (and boot.js's own step-7 comment,
// "Shell renders sidebar + topbar + #app placeholder") expect a bare
// window.renderShell — Shell has no separate "render" concept (it
// auto-initializes via its own DOMContentLoaded listener above), so
// this aliases to the same init() that auto-init already calls;
// re-running it here is what boot.js's step 7 intends, and is safe
// since init() only sets up DOM structure/listeners.
window.renderShell = Shell.init;
