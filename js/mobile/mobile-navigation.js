/* ═══════════════════════════════════════════════════════════════════
   js/mobile/mobile-navigation.js — Mobile-only navigation aids
   ═══════════════════════════════════════════════════════════════════
   Two additions that only make sense on a phone-sized screen:
   1. A bottom quick-nav bar for the handful of most-used destinations
      (Dashboard, Students, Marks, Finance, More → opens the sidebar).
   2. Edge-swipe-from-left-side-of-screen to open the sidebar, as a
      supplement to the hamburger button (js/mobile/gestures.js).

   Expected CSS: `.mobile-quick-nav`, `.mobile-quick-nav__item`
   (+ `.active`), `.mobile-quick-nav__icon`, `.mobile-quick-nav__label`.
   Only rendered/shown below the mobile breakpoint (also gated by CSS
   media query as a second safety net).

   Last updated: 2026-07-13
   ═══════════════════════════════════════════════════════════════════ */

const MobileNavigation = (() => {

  // ─── CONFIGURATION ───────────────────────────────────────────────────

  const QUICK_NAV_ITEMS = [
    {
      id: 'admin-dashboard',
      label: 'Home',
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>'
    },
    {
      id: 'student-list',
      label: 'Students',
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>'
    },
    {
      id: 'marks-entry',
      label: 'Marks',
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>'
    },
    {
      id: 'record-payment',
      label: 'Finance',
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v20M17 5.5c0-1.93-2.24-3.5-5-3.5s-5 1.57-5 3.5 2.24 3.5 5 3.5 5 1.57 5 3.5-2.24 3.5-5 3.5-5-1.57-5-3.5"/></svg>'
    },
    {
      id: '__more__',
      label: 'More',
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/></svg>'
    }
  ];

  let quickNavBar = null;
  let edgeSwipeDetach = null;
  let resizeTimeout = null;

  // ─── HELPERS ────────────────────────────────────────────────────────

  /**
   * Check if mobile breakpoint is active
   * @returns {boolean} True if mobile
   */
  function isMobile() {
    if (window.ResponsiveUI && typeof window.ResponsiveUI.isMobile === 'function') {
      return window.ResponsiveUI.isMobile();
    }
    return window.innerWidth <= 820;
  }

  /**
   * Get the current active module from router or sidebar
   * @returns {string} The active module ID
   */
  function getActiveModule() {
    if (window.Router && typeof window.Router.getCurrentModule === 'function') {
      return window.Router.getCurrentModule();
    }
    if (window.state && window.state.currentModule) {
      return window.state.currentModule;
    }
    return localStorage.getItem('elf_module') || 'admin-dashboard';
  }

  // ─── RENDER ──────────────────────────────────────────────────────────

  /**
   * Render the mobile quick navigation bar
   */
  function render() {
    // Avoid duplicate rendering
    if (document.querySelector('.mobile-quick-nav')) return;

    const bar = document.createElement('nav');
    bar.className = 'mobile-quick-nav';
    bar.setAttribute('aria-label', 'Quick navigation');

    bar.innerHTML = QUICK_NAV_ITEMS.map(item => `
            <button class="mobile-quick-nav__item" data-quick-nav="${item.id}">
                <span class="mobile-quick-nav__icon">${item.icon}</span>
                <span class="mobile-quick-nav__label">${item.label}</span>
            </button>
        `).join('');

    document.body.appendChild(bar);
    quickNavBar = bar;

    // Bind click events
    bar.querySelectorAll('[data-quick-nav]').forEach(btn => {
      btn.addEventListener('click', function (e) {
        const id = this.dataset.quickNav;
        handleQuickNavClick(id, this);
      });
    });

    // Set initial active state
    const activeModule = getActiveModule();
    setActive(activeModule);

    // Sync visibility
    syncVisibility();
  }

  /**
   * Handle quick navigation button click
   * @param {string} id - The module ID or special key
   * @param {HTMLElement} btn - The clicked button element
   */
  function handleQuickNavClick(id, btn) {
    if (id === '__more__') {
      // Open sidebar
      if (window.Sidebar && typeof window.Sidebar.openMobileSidebar === 'function') {
        window.Sidebar.openMobileSidebar();
      } else if (window.toggleSidebar) {
        window.toggleSidebar();
      }
      return;
    }

    // Navigate to the module
    if (window.Router && typeof window.Router.navigate === 'function') {
      window.Router.navigate(id);
    } else if (window.navigateTo) {
      window.navigateTo(id);
    } else if (window.loadModule) {
      window.loadModule(id);
    }

    // Update active state
    setActive(id);
  }

  // ─── STATE MANAGEMENT ──────────────────────────────────────────────

  /**
   * Set the active quick navigation item
   * @param {string} moduleId - The active module ID
   */
  function setActive(moduleId) {
    if (!quickNavBar) return;
    document.querySelectorAll('.mobile-quick-nav__item').forEach(btn => {
      const isActive = btn.dataset.quickNav === moduleId;
      btn.classList.toggle('active', isActive);
      if (isActive) {
        btn.setAttribute('aria-current', 'page');
      } else {
        btn.removeAttribute('aria-current');
      }
    });
  }

  /**
   * Sync visibility based on mobile breakpoint
   */
  function syncVisibility() {
    if (!quickNavBar) return;
    const show = isMobile();
    quickNavBar.style.display = show ? 'flex' : 'none';

    // Also add/remove class on body for CSS styling
    document.body.classList.toggle('has-mobile-nav', show);
  }

  // ─── EDGE SWIPE ─────────────────────────────────────────────────────

  /**
   * Bind edge swipe to open sidebar
   */
  function bindEdgeSwipe() {
    // Clean up existing binding
    if (edgeSwipeDetach) {
      edgeSwipeDetach();
      edgeSwipeDetach = null;
    }

    if (typeof window.Gestures !== 'undefined' && window.Gestures.onEdgeSwipeRight) {
      edgeSwipeDetach = window.Gestures.onEdgeSwipeRight(24, function () {
        if (window.Sidebar && typeof window.Sidebar.openMobileSidebar === 'function') {
          window.Sidebar.openMobileSidebar();
        } else if (window.toggleSidebar) {
          window.toggleSidebar();
        }
      });
    }
  }

  // ─── INIT ────────────────────────────────────────────────────────────

  /**
   * Initialize mobile navigation
   */
  function init() {
    render();
    bindEdgeSwipe();
    syncVisibility();

    // Listen for breakpoint changes
    document.addEventListener('breakpointChanged', function () {
      syncVisibility();
    });

    // Listen for navigation changes to update active state
    document.addEventListener('navigationChanged', function (e) {
      if (e.detail && e.detail.moduleId) {
        setActive(e.detail.moduleId);
      }
    });

    // Also listen for sidebar open/close to sync
    document.addEventListener('sidebarToggled', function () {
      // Re-sync visibility after sidebar changes
      syncVisibility();
    });

    // Clean up on page unload
    window.addEventListener('beforeunload', function () {
      if (edgeSwipeDetach) {
        edgeSwipeDetach();
        edgeSwipeDetach = null;
      }
      if (resizeTimeout) {
        clearTimeout(resizeTimeout);
        resizeTimeout = null;
      }
    });
  }

  // ─── PUBLIC API ─────────────────────────────────────────────────────

  return {
    setActive: setActive,
    syncVisibility: syncVisibility,
    render: render,
    init: init,
    isMobile: isMobile
  };

})();

// ─── EXPOSE TO WINDOW ────────────────────────────────────────────────

window.MobileNavigation = MobileNavigation;
