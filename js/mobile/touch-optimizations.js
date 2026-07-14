/* ═══════════════════════════════════════════════════════════════════
   js/mobile/touch-optimizations.js — Touch device runtime adjustments
   ═══════════════════════════════════════════════════════════════════
   Applies a handful of one-time, app-wide tweaks for touch devices
   that are easier to do in JS than to fight in CSS alone: marking the
   body so CSS can target touch-only rules, killing the double-tap-to-
   zoom delay on interactive elements, and suppressing the sticky
   :hover state iOS/Android otherwise leave applied after a tap.

   Last updated: 2026-07-13
   ═══════════════════════════════════════════════════════════════════ */

const TouchOptimizations = (() => {

  // ─── DETECTION ──────────────────────────────────────────────────────

  /**
   * Check if the device supports touch input
   * @returns {boolean} True if touch is supported
   */
  function isTouchDevice() {
    return (
      window.matchMedia('(pointer: coarse)').matches ||
      'ontouchstart' in window ||
      navigator.maxTouchPoints > 0
    );
  }

  /**
   * Check if the device is a mobile device (touch + small screen)
   * @returns {boolean} True if mobile
   */
  function isMobileDevice() {
    return isTouchDevice() && window.innerWidth <= 820;
  }

  // ─── DEVICE MARKING ──────────────────────────────────────────────────

  /**
   * Add classes to the document element for CSS targeting
   */
  function markDevice() {
    if (isTouchDevice()) {
      document.documentElement.classList.add('is-touch-device');
      document.documentElement.classList.remove('is-pointer-device');
    } else {
      document.documentElement.classList.add('is-pointer-device');
      document.documentElement.classList.remove('is-touch-device');
    }

    if (isMobileDevice()) {
      document.documentElement.classList.add('is-mobile-device');
    } else {
      document.documentElement.classList.remove('is-mobile-device');
    }
  }

  // ─── STICKY HOVER FIX ───────────────────────────────────────────────

  /**
   * iOS/Android apply :hover on tap and only clear it on the next tap
   * elsewhere, which makes buttons look "stuck" highlighted. Briefly
   * blurring the element after touchend avoids that without disabling
   * hover styles altogether (still useful for keyboard/mouse users on
   * hybrid devices).
   */
  function clearStickyHover() {
    let timeoutId = null;

    document.addEventListener('touchend', (e) => {
      // Find the interactive element under the touch
      const target = e.target.closest(
        'button, a, .btn, .nav-child, .nav-group-header, ' +
        '.quick-btn, .hub-card, .nav-item, .tab-btn, .page-btn, ' +
        '.dropdown-item, .modal-close, .menu-toggle, .badge-pill'
      );

      if (target) {
        // Clear any existing timeout
        if (timeoutId) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }

        // Blur the element after a short delay to clear hover state
        timeoutId = setTimeout(() => {
          if (target && typeof target.blur === 'function') {
            target.blur();
          }
          timeoutId = null;
        }, 80);
      }
    }, { passive: true });
  }

  // ─── FAST TAP (Remove 300ms delay) ─────────────────────────────────

  /**
   * Prevents the ~300ms double-tap-to-zoom delay on interactive controls
   * without disabling pinch-zoom for the rest of the page (the meta
   * viewport tag intentionally does NOT set user-scalable=no).
   */
  function fastTapOnInteractive() {
    let lastTouchEnd = 0;
    let touchStartTarget = null;

    // Track touch start to know what was touched
    document.addEventListener('touchstart', (e) => {
      touchStartTarget = e.target.closest('button, a, .btn, .nav-item, .quick-btn, .tab-btn');
    }, { passive: true });

    document.addEventListener('touchend', (e) => {
      const now = Date.now();
      const target = e.target.closest('button, a, .btn, .nav-item, .quick-btn, .tab-btn');

      // Only prevent default if:
      // 1. It's been less than 300ms since the last touch
      // 2. We're on an interactive element
      // 3. The target matches the touch start target (no drag)
      if (now - lastTouchEnd <= 300 && target && target === touchStartTarget) {
        e.preventDefault();
        // Trigger a click event immediately
        if (typeof target.click === 'function') {
          target.click();
        }
      }

      lastTouchEnd = now;
      touchStartTarget = null;
    }, { passive: false });
  }

  // ─── PREVENT SCROLL ON DRAG ─────────────────────────────────────────

  /**
   * Prevents page scroll when dragging inside scrollable containers
   * to improve drag experience on touch devices.
   */
  function preventScrollOnDrag() {
    let isDragging = false;

    document.addEventListener('touchstart', (e) => {
      const target = e.target.closest(
        '.modal, .sidebar, .scrollable-container, ' +
        '.table-wrapper, .drag-handle, .modal-drag-handle'
      );
      if (target) {
        isDragging = true;
      }
    }, { passive: true });

    document.addEventListener('touchmove', (e) => {
      if (isDragging) {
        // Allow scroll inside the container, but prevent page-level scroll
        const target = e.target.closest(
          '.modal, .sidebar, .scrollable-container, ' +
          '.table-wrapper, .drag-handle, .modal-drag-handle'
        );
        if (target) {
          // Allow the container to handle the scroll
          return;
        }
        // If not in a scrollable container, prevent default
        e.preventDefault();
      }
    }, { passive: false });

    document.addEventListener('touchend', () => {
      isDragging = false;
    }, { passive: true });
  }

  // ─── PASSIVE SCROLL IMPROVEMENT ────────────────────────────────────

  /**
   * Improves scroll performance by ensuring scroll events are passive
   * and adding touch-action CSS hints via a style tag.
   */
  function improveScrollPerformance() {
    // Inject CSS to improve touch scrolling
    const style = document.createElement('style');
    style.textContent = `
            /* Touch optimization: improve scroll performance */
            .is-touch-device .scrollable-container,
            .is-touch-device .table-wrapper,
            .is-touch-device .sidebar-nav {
                -webkit-overflow-scrolling: touch;
                overscroll-behavior: contain;
            }

            .is-touch-device .modal-body {
                -webkit-overflow-scrolling: touch;
                overscroll-behavior: contain;
            }

            /* Prevent scroll chaining on modals and sidebars */
            .is-touch-device .modal,
            .is-touch-device .sidebar {
                overscroll-behavior: contain;
            }

            /* Disable pull-to-refresh on main content */
            .is-touch-device .main-content {
                overscroll-behavior: none;
            }
        `;
    document.head.appendChild(style);

    // Mark all scrollable containers
    document.addEventListener('DOMContentLoaded', () => {
      document.querySelectorAll(
        '.scrollable-container, .table-wrapper, .sidebar-nav, ' +
        '.modal-body, .data-table-wrapper'
      ).forEach(el => {
        el.classList.add('touch-scrollable');
      });
    });
  }

  // ─── ACTIVE STATE FOR TOUCH ─────────────────────────────────────────

  /**
   * Adds a visual active state for touch interactions that don't
   * naturally get :active styles on touch devices.
   */
  function addTouchActiveState() {
    let activeTimeout = null;

    document.addEventListener('touchstart', (e) => {
      const target = e.target.closest(
        'button, a, .btn, .nav-item, .quick-btn, .tab-btn, ' +
        '.page-btn, .hub-card, .card, .stat-card'
      );
      if (target) {
        // Clear any existing timeout
        if (activeTimeout) {
          clearTimeout(activeTimeout);
          activeTimeout = null;
        }

        // Add active class
        target.classList.add('touch-active');

        // Remove after a short delay
        activeTimeout = setTimeout(() => {
          target.classList.remove('touch-active');
          activeTimeout = null;
        }, 300);
      }
    }, { passive: true });
  }

  // ─── INIT ────────────────────────────────────────────────────────────

  /**
   * Initialize all touch optimizations
   */
  function init() {
    // Mark device type
    markDevice();

    // Only apply touch-specific optimizations on touch devices
    if (isTouchDevice()) {
      clearStickyHover();
      fastTapOnInteractive();
      preventScrollOnDrag();
      addTouchActiveState();

      // Apply scroll improvements on next frame
      requestAnimationFrame(() => {
        improveScrollPerformance();
      });
    }

    // Listen for breakpoint changes to re-mark device
    document.addEventListener('breakpointChanged', () => {
      markDevice();
    });

    // Also listen for window resize to update mobile status
    let resizeTimeout;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(() => {
        markDevice();
      }, 200);
    });
  }

  // ─── PUBLIC API ─────────────────────────────────────────────────────

  return {
    isTouchDevice: isTouchDevice,
    isMobileDevice: isMobileDevice,
    markDevice: markDevice,
    clearStickyHover: clearStickyHover,
    fastTapOnInteractive: fastTapOnInteractive,
    init: init
  };

})();

// ─── EXPOSE TO WINDOW ────────────────────────────────────────────────

window.TouchOptimizations = TouchOptimizations;

// Auto-initialize
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    TouchOptimizations.init();
  });
} else {
  TouchOptimizations.init();
}

export default TouchOptimizations;
export const {
  isTouchDevice,
  isMobileDevice,
  markDevice,
  clearStickyHover,
  fastTapOnInteractive,
  init
} = TouchOptimizations;