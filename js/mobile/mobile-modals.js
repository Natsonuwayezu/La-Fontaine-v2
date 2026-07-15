/* ═══════════════════════════════════════════════════════════════════
   js/mobile/mobile-modals.js — Bottom-sheet drag-to-dismiss
   ═══════════════════════════════════════════════════════════════════
   css/components/modals.css already collapses .modal to a bottom sheet
   under 640px. This adds the interaction layer on top: a small drag
   handle at the top of the sheet, and a swipe-down gesture (via
   js/mobile/gestures.js) that dismisses the modal once dragged past a
   threshold, with the sheet following the finger in between.

   Hooks into every modal by observing #modal-container for new
   `.modal-instance` nodes (js/ui/modals.js creates these dynamically),
   so no change to modals.js itself is required.

   Expected CSS: `.modal-drag-handle`.

   Last updated: 2026-07-13
   ═══════════════════════════════════════════════════════════════════ */

const MobileModals = (() => {

  /**
   * Check if the current viewport is mobile-sized
   * @returns {boolean} True if mobile
   */
  function isMobile() {
    // Try ResponsiveUI first, fallback to window width
    if (window.ResponsiveUI && typeof window.ResponsiveUI.isMobile === 'function') {
      return window.ResponsiveUI.isMobile();
    }
    return window.innerWidth <= 640;
  }

  /**
   * Add a drag handle to the modal if it doesn't already have one
   * @param {HTMLElement} modalEl - The modal element
   */
  function addDragHandle(modalEl) {
    if (modalEl.querySelector('.modal-drag-handle')) return;

    const handle = document.createElement('div');
    handle.className = 'modal-drag-handle';
    handle.setAttribute('aria-label', 'Drag to dismiss');
    modalEl.insertBefore(handle, modalEl.firstChild);
  }

  /**
   * Bind swipe-to-dismiss to a modal
   * @param {HTMLElement} instanceEl - The modal instance container
   * @param {HTMLElement} modalEl - The modal element
   */
  function bindDragToDismiss(instanceEl, modalEl) {
    if (!isMobile()) return;
    if (modalEl.dataset.dragBound === 'true') return;
    modalEl.dataset.dragBound = 'true';

    // Add a small delay before binding to avoid interfering with
    // the modal's open animation
    setTimeout(() => {
      if (typeof window.Gestures !== 'undefined' && window.Gestures.onModalSwipeDown) {
        window.Gestures.onModalSwipeDown(
          modalEl,
          function onDismiss() {
            // Find and click the close button or overlay
            const closeBtn = modalEl.querySelector('[data-modal-close]');
            if (closeBtn) {
              closeBtn.click();
            } else {
              const overlay = instanceEl.querySelector('.modal-overlay');
              if (overlay) {
                overlay.click();
              }
            }
          },
          120 // threshold in px
        );
      } else {
        // Fallback: use the generic onSwipe if onModalSwipeDown isn't available
        if (typeof window.Gestures !== 'undefined' && window.Gestures.onSwipe) {
          let dismissed = false;
          window.Gestures.onSwipe(modalEl, {
            axis: 'y',
            threshold: 120,
            onDragMove: function (dx, dy) {
              if (dy > 0) {
                modalEl.style.transition = 'none';
                modalEl.style.transform = `translateY(${dy}px)`;
              }
            },
            onDragEnd: function (dx, dy) {
              modalEl.style.transition = '';
              if (dy <= 120) {
                modalEl.style.transform = '';
              }
            },
            onSwipeDown: function () {
              if (dismissed) return;
              dismissed = true;
              const closeBtn = modalEl.querySelector('[data-modal-close]');
              if (closeBtn) {
                closeBtn.click();
              } else {
                const overlay = instanceEl.querySelector('.modal-overlay');
                if (overlay) {
                  overlay.click();
                }
              }
            }
          });
        }
      }
    }, 200);
  }

  /**
   * Enhance a modal instance with mobile behavior
   * @param {HTMLElement} instanceEl - The modal instance container
   */
  function enhance(instanceEl) {
    const modalEl = instanceEl.querySelector('.modal');
    if (!modalEl) return;

    // Add drag handle if mobile
    if (isMobile()) {
      addDragHandle(modalEl);
    }

    // Bind swipe-to-dismiss
    bindDragToDismiss(instanceEl, modalEl);
  }

  /**
   * Watch for new modal instances and enhance them
   */
  function watch() {
    const container = document.getElementById('modals-container');
    if (!container) {
      // Retry if container not yet available
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', watch);
      }
      return;
    }

    // Enhance any existing modals
    container.querySelectorAll('.modal-instance').forEach(enhance);

    // Watch for new modals
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === 1 && node.classList && node.classList.contains('modal-instance')) {
            enhance(node);
          }
        });
      });
    });

    observer.observe(container, { childList: true });

    // Also watch for theme changes that might affect mobile state
    const themeObserver = new MutationObserver(() => {
      // Re-enhance modals if mobile state changed
      container.querySelectorAll('.modal-instance').forEach((instance) => {
        const modalEl = instance.querySelector('.modal');
        if (modalEl) {
          // Check if drag handle should exist
          const hasHandle = modalEl.querySelector('.modal-drag-handle');
          const shouldHaveHandle = isMobile();
          if (shouldHaveHandle && !hasHandle) {
            addDragHandle(modalEl);
          } else if (!shouldHaveHandle && hasHandle) {
            hasHandle.remove();
          }
        }
      });
    });

    // Watch for theme changes on the document element
    const htmlEl = document.documentElement;
    themeObserver.observe(htmlEl, { attributes: true, attributeFilter: ['data-theme'] });

    // Also watch for resize events
    let resizeTimeout;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(() => {
        // Re-evaluate mobile state for all modals
        container.querySelectorAll('.modal-instance').forEach((instance) => {
          const modalEl = instance.querySelector('.modal');
          if (modalEl) {
            const hasHandle = modalEl.querySelector('.modal-drag-handle');
            const shouldHaveHandle = isMobile();
            if (shouldHaveHandle && !hasHandle) {
              addDragHandle(modalEl);
            } else if (!shouldHaveHandle && hasHandle) {
              hasHandle.remove();
            }
          }
        });
      }, 200);
    });
  }

  // ─── INIT ────────────────────────────────────────────────────────────

  // Start watching when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', watch);
  } else {
    watch();
  }

  // ─── PUBLIC API ──────────────────────────────────────────────────────

  return {
    isMobile: isMobile,
    addDragHandle: addDragHandle,
    bindDragToDismiss: bindDragToDismiss,
    enhance: enhance,
    watch: watch
  };

})();

// ─── EXPOSE TO WINDOW ────────────────────────────────────────────────

window.MobileModals = MobileModals;
