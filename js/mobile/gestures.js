/* ═══════════════════════════════════════════════════════════════════
   js/mobile/gestures.js — Touch gesture detection
   ═══════════════════════════════════════════════════════════════════
   Generic swipe recognizer other mobile/*.js files build on:

   Gestures.onSwipe(el, {
     onSwipeLeft, onSwipeRight, onSwipeUp, onSwipeDown,
     onDragMove(deltaX, deltaY),   // fires continuously while dragging
     onDragEnd(deltaX, deltaY),    // fires once on release, before the
                                    // swipe direction callback (if any)
     threshold = 60,               // px needed to count as a swipe
     axis = 'both' | 'x' | 'y'
   })

   Deliberately not a full gesture library (no pinch/rotate) — this app
   only needs swipe-to-open/close (sidebar), swipe-to-dismiss (modal
   sheet, toast), and edge-swipe detection.

   Last updated: 2026-07-13
   ═══════════════════════════════════════════════════════════════════ */

const Gestures = (() => {

  /**
   * Attach swipe detection to an element
   * @param {HTMLElement} el - The element to attach swipe detection to
   * @param {object} opts - Configuration options
   * @param {number} opts.threshold - Pixels needed to count as a swipe (default: 60)
   * @param {string} opts.axis - 'both' | 'x' | 'y' (default: 'both')
   * @param {function} opts.onSwipeLeft - Called when swipe left detected
   * @param {function} opts.onSwipeRight - Called when swipe right detected
   * @param {function} opts.onSwipeUp - Called when swipe up detected
   * @param {function} opts.onSwipeDown - Called when swipe down detected
   * @param {function} opts.onDragMove - Called continuously during drag (deltaX, deltaY)
   * @param {function} opts.onDragEnd - Called on release (deltaX, deltaY)
   * @returns {function} Detach function to remove event listeners
   */
  function onSwipe(el, opts = {}) {
    if (!el) return () => { };

    const threshold = opts.threshold ?? 60;
    const axis = opts.axis ?? 'both';

    let startX = 0;
    let startY = 0;
    let tracking = false;

    function handleStart(e) {
      const touch = e.touches ? e.touches[0] : e;
      startX = touch.clientX;
      startY = touch.clientY;
      tracking = true;
    }

    function handleMove(e) {
      if (!tracking) return;
      const touch = e.touches ? e.touches[0] : e;
      const dx = touch.clientX - startX;
      const dy = touch.clientY - startY;
      if (opts.onDragMove) {
        opts.onDragMove(dx, dy);
      }
    }

    function handleEnd(e) {
      if (!tracking) return;
      tracking = false;

      const touch = e.changedTouches ? e.changedTouches[0] : e;
      const dx = touch.clientX - startX;
      const dy = touch.clientY - startY;

      if (opts.onDragEnd) {
        opts.onDragEnd(dx, dy);
      }

      const absX = Math.abs(dx);
      const absY = Math.abs(dy);

      if (axis !== 'y' && absX > threshold && absX > absY) {
        if (dx > 0) {
          if (opts.onSwipeRight) opts.onSwipeRight(dx);
        } else {
          if (opts.onSwipeLeft) opts.onSwipeLeft(dx);
        }
      } else if (axis !== 'x' && absY > threshold && absY > absX) {
        if (dy > 0) {
          if (opts.onSwipeDown) opts.onSwipeDown(dy);
        } else {
          if (opts.onSwipeUp) opts.onSwipeUp(dy);
        }
      }
    }

    el.addEventListener('touchstart', handleStart, { passive: true });
    el.addEventListener('touchmove', handleMove, { passive: true });
    el.addEventListener('touchend', handleEnd, { passive: true });

    // Return a detach function so callers can clean up if the element
    // is removed dynamically (e.g. a modal instance closing).
    return function detach() {
      el.removeEventListener('touchstart', handleStart);
      el.removeEventListener('touchmove', handleMove);
      el.removeEventListener('touchend', handleEnd);
    };
  }

  /**
   * Detects a swipe starting within `edgeWidth` px of the screen's left edge
   * Used for "swipe from edge to open sidebar".
   * @param {number} edgeWidth - Width of the edge zone in pixels (default: 30)
   * @param {function} callback - Called when an edge swipe is detected
   * @returns {function} Detach function
   */
  function onEdgeSwipeRight(edgeWidth = 30, callback) {
    let startX = null;
    let startY = null;

    function handleStart(e) {
      const touch = e.touches[0];
      startX = touch.clientX <= edgeWidth ? touch.clientX : null;
      startY = touch.clientY;
    }

    function handleEnd(e) {
      if (startX === null) return;
      const endX = e.changedTouches[0].clientX;
      const endY = e.changedTouches[0].clientY;
      const dx = endX - startX;
      const dy = Math.abs(endY - startY);

      // Only trigger if horizontal movement is significantly more than vertical
      if (dx > 50 && dy < 100) {
        callback();
      }
      startX = null;
    }

    document.addEventListener('touchstart', handleStart, { passive: true });
    document.addEventListener('touchend', handleEnd, { passive: true });

    return function detach() {
      document.removeEventListener('touchstart', handleStart);
      document.removeEventListener('touchend', handleEnd);
    };
  }

  /**
   * Attach swipe detection to a modal for drag-to-dismiss
   * @param {HTMLElement} modalEl - The modal element
   * @param {function} onDismiss - Called when dismissed
   * @param {number} threshold - Swipe threshold (default: 120)
   * @returns {function} Detach function
   */
  function onModalSwipeDown(modalEl, onDismiss, threshold = 120) {
    if (!modalEl) return () => { };

    let dismissed = false;

    return onSwipe(modalEl, {
      axis: 'y',
      threshold: threshold,
      onDragMove: function (dx, dy) {
        if (dy > 0) {
          modalEl.style.transition = 'none';
          modalEl.style.transform = `translateY(${dy}px)`;
          // Dim the backdrop as the modal slides down
          const overlay = modalEl.closest('.modal-overlay');
          if (overlay) {
            const progress = Math.min(1, dy / (threshold * 1.5));
            overlay.style.opacity = 1 - progress * 0.3;
          }
        }
      },
      onDragEnd: function (dx, dy) {
        modalEl.style.transition = '';
        if (dy <= threshold) {
          modalEl.style.transform = ''; // snap back
          const overlay = modalEl.closest('.modal-overlay');
          if (overlay) {
            overlay.style.opacity = '';
          }
        }
      },
      onSwipeDown: function () {
        if (dismissed) return;
        dismissed = true;
        if (onDismiss) onDismiss();
        // Also try to find and click the close button
        const closeBtn = modalEl.querySelector('[data-modal-close]');
        if (closeBtn) {
          closeBtn.click();
        } else {
          const overlay = modalEl.closest('.modal-overlay');
          if (overlay) {
            overlay.click();
          }
        }
      }
    });
  }

  return {
    onSwipe,
    onEdgeSwipeRight,
    onModalSwipeDown
  };

})();

// ─── EXPOSE TO WINDOW ────────────────────────────────────────────────

window.Gestures = Gestures;

export default Gestures;
export const { onSwipe, onEdgeSwipeRight, onModalSwipeDown } = Gestures;