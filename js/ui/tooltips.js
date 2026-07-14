/* ═══════════════════════════════════════════════════════════════════
   js/ui/tooltips.js — Tooltip controller
   ═══════════════════════════════════════════════════════════════════
   Purpose: Provide tooltips for any element with a `data-tooltip`
   attribute. A single shared tooltip element (#tooltip-root) is
   repositioned rather than creating a new node per element.

   Usage:
     <button data-tooltip="Click to save" data-tooltip-placement="bottom">
       Save
     </button>

   Features:
   - Automatic hover/focus detection
   - Four placements: top (default), bottom, left, right
   - Auto-positioning to keep tooltip within viewport
   - Delayed hide to prevent flicker
   - Keyboard accessible (focusin/focusout)

   Expected CSS: .tooltip-root, .tooltip-root.is-visible,
   .tooltip-arrow classes in css/components/tooltips.css.

   Last updated: 2026-07-14
   ═══════════════════════════════════════════════════════════════════ */

const Tooltips = (() => {

  /* ═══════════════════════════════════════════════════════════════
     STATE
     ═══════════════════════════════════════════════════════════════ */

  let hideTimer = null;
  let showTimer = null;
  let currentTarget = null;
  let isVisible = false;

  const DEFAULT_PLACEMENT = 'top';
  const VIEWPORT_PADDING = 12;
  const HIDE_DELAY = 60;
  const SHOW_DELAY = 150;

  /* ═══════════════════════════════════════════════════════════════
     HELPERS
     ═══════════════════════════════════════════════════════════════ */

  /**
   * Get or create the tooltip root element
   * @returns {HTMLElement} The root element
   */
  function getRoot() {
    let root = document.getElementById('tooltip-root');

    if (!root) {
      root = document.createElement('div');
      root.id = 'tooltip-root';
      root.className = 'tooltip-root';
      root.setAttribute('role', 'tooltip');
      root.setAttribute('aria-hidden', 'true');
      root.style.cssText = `
                position: fixed;
                padding: 6px 14px;
                border-radius: var(--r-sm, 6px);
                font-size: 0.78rem;
                font-weight: 500;
                line-height: 1.4;
                max-width: 280px;
                pointer-events: none;
                z-index: var(--z-tooltip, 1200);
                opacity: 0;
                transition: opacity 0.15s ease, transform 0.15s ease;
                transform: scale(0.95);
                background: var(--bg-card, #fcfaf8);
                color: var(--text-body, #2c241e);
                border: 1px solid var(--border-light, #e8e0d8);
                box-shadow: var(--shadow-md, 0 4px 6px -1px rgba(26, 20, 16, 0.08));
                font-family: var(--font-sans, 'DM Sans', sans-serif);
            `;
      document.body.appendChild(root);

      // Inject tooltip styles if not already present
      injectStyles();
    }

    return root;
  }

  /**
   * Inject tooltip styles if not already present
   */
  function injectStyles() {
    const styleId = 'tooltip-styles';
    if (document.getElementById(styleId)) return;

    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
            .tooltip-root {
                position: fixed;
                padding: 6px 14px;
                border-radius: var(--r-sm, 6px);
                font-size: 0.78rem;
                font-weight: 500;
                line-height: 1.4;
                max-width: 280px;
                pointer-events: none;
                z-index: var(--z-tooltip, 1200);
                opacity: 0;
                transition: opacity 0.15s ease, transform 0.15s ease;
                transform: scale(0.95);
                background: var(--bg-card, #fcfaf8);
                color: var(--text-body, #2c241e);
                border: 1px solid var(--border-light, #e8e0d8);
                box-shadow: var(--shadow-md, 0 4px 6px -1px rgba(26, 20, 16, 0.08));
                font-family: var(--font-sans, 'DM Sans', sans-serif);
                text-align: center;
            }

            [data-theme="dark"] .tooltip-root {
                background: var(--bg-card, #241d18);
                color: var(--text-body, #d4ccc6);
                border-color: var(--border-light, rgba(240, 235, 230, 0.06));
                box-shadow: var(--shadow-md, 0 4px 6px -1px rgba(0, 0, 0, 0.30));
            }

            .tooltip-root.is-visible {
                opacity: 1;
                transform: scale(1);
            }

            .tooltip-root .tooltip-arrow {
                position: absolute;
                width: 8px;
                height: 8px;
                background: var(--bg-card, #fcfaf8);
                border: 1px solid var(--border-light, #e8e0d8);
                transform: rotate(45deg);
                pointer-events: none;
            }

            [data-theme="dark"] .tooltip-root .tooltip-arrow {
                background: var(--bg-card, #241d18);
                border-color: var(--border-light, rgba(240, 235, 230, 0.06));
            }

            .tooltip-root.placement-top .tooltip-arrow {
                bottom: -5px;
                left: 50%;
                margin-left: -4px;
                border-top: none;
                border-left: none;
            }

            .tooltip-root.placement-bottom .tooltip-arrow {
                top: -5px;
                left: 50%;
                margin-left: -4px;
                border-bottom: none;
                border-right: none;
            }

            .tooltip-root.placement-left .tooltip-arrow {
                right: -5px;
                top: 50%;
                margin-top: -4px;
                border-left: none;
                border-bottom: none;
            }

            .tooltip-root.placement-right .tooltip-arrow {
                left: -5px;
                top: 50%;
                margin-top: -4px;
                border-right: none;
                border-top: none;
            }

            /* Tooltip variants */
            .tooltip-root.tooltip-success {
                border-color: var(--success, #3a7a5a);
            }

            .tooltip-root.tooltip-success .tooltip-arrow {
                border-color: var(--success, #3a7a5a);
            }

            .tooltip-root.tooltip-danger {
                border-color: var(--danger, #c45a4a);
            }

            .tooltip-root.tooltip-danger .tooltip-arrow {
                border-color: var(--danger, #c45a4a);
            }

            .tooltip-root.tooltip-warning {
                border-color: var(--warning, #b8983a);
            }

            .tooltip-root.tooltip-warning .tooltip-arrow {
                border-color: var(--warning, #b8983a);
            }

            .tooltip-root.tooltip-info {
                border-color: var(--info, #4a7a8a);
            }

            .tooltip-root.tooltip-info .tooltip-arrow {
                border-color: var(--info, #4a7a8a);
            }
        `;
    document.head.appendChild(style);
  }

  /**
   * Create the arrow element
   * @param {string} placement - The placement direction
   * @returns {HTMLElement} The arrow element
   */
  function createArrow(placement) {
    const arrow = document.createElement('div');
    arrow.className = 'tooltip-arrow';
    return arrow;
  }

  /**
   * Position the tooltip relative to the target element
   * @param {HTMLElement} root - The tooltip root element
   * @param {HTMLElement} target - The target element
   * @param {string} placement - The desired placement
   */
  function positionTooltip(root, target, placement) {
    const targetRect = target.getBoundingClientRect();
    const tipRect = root.getBoundingClientRect();

    let top, left;

    // Calculate position based on placement
    switch (placement) {
      case 'bottom':
        top = targetRect.bottom + VIEWPORT_PADDING;
        left = targetRect.left + (targetRect.width / 2) - (tipRect.width / 2);
        break;
      case 'left':
        top = targetRect.top + (targetRect.height / 2) - (tipRect.height / 2);
        left = targetRect.left - tipRect.width - VIEWPORT_PADDING;
        break;
      case 'right':
        top = targetRect.top + (targetRect.height / 2) - (tipRect.height / 2);
        left = targetRect.right + VIEWPORT_PADDING;
        break;
      default: // top
        top = targetRect.top - tipRect.height - VIEWPORT_PADDING;
        left = targetRect.left + (targetRect.width / 2) - (tipRect.width / 2);
        break;
    }

    // Keep within viewport horizontally
    if (left < VIEWPORT_PADDING) {
      left = VIEWPORT_PADDING;
    } else if (left + tipRect.width > window.innerWidth - VIEWPORT_PADDING) {
      left = window.innerWidth - tipRect.width - VIEWPORT_PADDING;
    }

    // Keep within viewport vertically
    if (top < VIEWPORT_PADDING) {
      top = VIEWPORT_PADDING;
    } else if (top + tipRect.height > window.innerHeight - VIEWPORT_PADDING) {
      top = window.innerHeight - tipRect.height - VIEWPORT_PADDING;
    }

    // Apply position (using fixed positioning so no scroll offset needed)
    root.style.top = `${top}px`;
    root.style.left = `${left}px`;
  }

  /* ═══════════════════════════════════════════════════════════════
     PUBLIC API
     ═══════════════════════════════════════════════════════════════ */

  /**
   * Show a tooltip for a target element
   * @param {HTMLElement} target - The target element
   * @param {string} [text] - Override the tooltip text (optional)
   * @param {string} [placement] - Override the placement (optional)
   * @param {string} [variant] - Style variant (success, danger, warning, info)
   */
  function show(target, text, placement, variant) {
    if (!target) return;

    const root = getRoot();
    clearTimeout(hideTimer);
    clearTimeout(showTimer);

    // Get tooltip text from attribute or override
    const tooltipText = text || target.dataset.tooltip;
    if (!tooltipText) return;

    // Get placement from attribute or override
    const tooltipPlacement = placement || target.dataset.tooltipPlacement || DEFAULT_PLACEMENT;

    // Set content
    root.textContent = tooltipText;

    // Set placement class
    root.className = `tooltip-root placement-${tooltipPlacement}`;

    // Add variant class if provided
    if (variant) {
      root.classList.add(`tooltip-${variant}`);
    }

    // Add arrow
    const arrow = createArrow(tooltipPlacement);
    // Remove old arrow if exists
    const oldArrow = root.querySelector('.tooltip-arrow');
    if (oldArrow) oldArrow.remove();
    root.appendChild(arrow);

    // Set aria attributes
    root.setAttribute('aria-hidden', 'false');

    // Store target reference
    currentTarget = target;

    // Position and show with a small delay to allow layout to settle
    showTimer = setTimeout(() => {
      positionTooltip(root, target, tooltipPlacement);
      root.classList.add('is-visible');
      isVisible = true;
    }, SHOW_DELAY);
  }

  /**
   * Hide the tooltip
   * @param {number} [delay] - Delay in ms before hiding (default: HIDE_DELAY)
   */
  function hide(delay = HIDE_DELAY) {
    clearTimeout(hideTimer);
    clearTimeout(showTimer);

    hideTimer = setTimeout(() => {
      const root = getRoot();
      root.classList.remove('is-visible');
      root.setAttribute('aria-hidden', 'true');
      isVisible = false;
      currentTarget = null;
    }, delay);
  }

  /**
   * Force hide the tooltip immediately
   */
  function hideImmediate() {
    clearTimeout(hideTimer);
    clearTimeout(showTimer);

    const root = getRoot();
    root.classList.remove('is-visible');
    root.setAttribute('aria-hidden', 'true');
    isVisible = false;
    currentTarget = null;
  }

  /**
   * Check if a tooltip is currently visible
   * @returns {boolean} True if visible
   */
  function isOpen() {
    return isVisible;
  }

  /**
   * Get the current target element
   * @returns {HTMLElement|null} The current target or null
   */
  function getCurrentTarget() {
    return currentTarget;
  }

  /**
   * Update tooltip content for the current target
   * @param {string} text - New tooltip text
   */
  function updateContent(text) {
    if (!isVisible || !currentTarget) return;
    const root = getRoot();
    root.textContent = text;
  }

  /* ═══════════════════════════════════════════════════════════════
     DELEGATED EVENT BINDING
     ═══════════════════════════════════════════════════════════════ */

  function bindDelegated() {
    // Mouse enter → show tooltip
    document.addEventListener('mouseover', (e) => {
      const target = e.target.closest('[data-tooltip]');
      if (target && target !== currentTarget) {
        show(target);
      }
    });

    // Mouse leave → hide tooltip
    document.addEventListener('mouseout', (e) => {
      const target = e.target.closest('[data-tooltip]');
      if (target) {
        hide();
      }
    });

    // Focus enter → show tooltip
    document.addEventListener('focusin', (e) => {
      const target = e.target.closest('[data-tooltip]');
      if (target && target !== currentTarget) {
        show(target);
      }
    });

    // Focus leave → hide tooltip
    document.addEventListener('focusout', (e) => {
      const target = e.target.closest('[data-tooltip]');
      if (target) {
        hide();
      }
    });

    // Scroll → hide tooltip (position would be invalid)
    window.addEventListener('scroll', () => {
      if (isVisible) hideImmediate();
    }, { passive: true, capture: true });

    // Resize → hide tooltip
    window.addEventListener('resize', () => {
      if (isVisible) hideImmediate();
    }, { passive: true });

    // App resize event (from shell.js)
    document.addEventListener('appResize', () => {
      if (isVisible) hideImmediate();
    });

    // Click on tooltip target → hide (previes tooltip from blocking clicks)
    document.addEventListener('click', (e) => {
      const target = e.target.closest('[data-tooltip]');
      if (target && isVisible) {
        hideImmediate();
      }
    });
  }

  /* ═══════════════════════════════════════════════════════════════
     INITIALIZATION
     ═══════════════════════════════════════════════════════════════ */

  // Bind events on load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bindDelegated);
  } else {
    bindDelegated();
  }

  // Also ensure root exists
  getRoot();

  /* ═══════════════════════════════════════════════════════════════
     EXPORTS
     ═══════════════════════════════════════════════════════════════ */

  return {
    show,
    hide,
    hideImmediate,
    isOpen,
    getCurrentTarget,
    updateContent
  };

})();

// ─── EXPOSE TO WINDOW ───────────────────────────────────────────────
window.Tooltips = Tooltips;

export default Tooltips;