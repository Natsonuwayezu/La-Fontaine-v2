/* ═══════════════════════════════════════════════════════════════════
   js/ui/context-menu.js — Right-click context menu
   ═══════════════════════════════════════════════════════════════════
   Purpose: Provide a custom context menu that replaces the browser's
   native right-click menu on bound elements.

   Features:
   - Right-click (desktop) and long-press (mobile) support
   - Auto-positioning to keep menu within viewport
   - Keyboard accessibility (Escape to close)
   - Click outside to close
   - Reuses .dropdown / .dropdown-item classes for visual consistency

   Usage:
     ContextMenu.attach(el, itemsOrFn)
     ContextMenu.show(x, y, items)
     ContextMenu.hide()

   itemsOrFn can be:
     - An array of item objects: { label, icon?, danger?, onClick?, divider? }
     - A function that returns an array (receives the bound element)

   Expected CSS: .dropdown, .dropdown-item, .dropdown-divider from
   css/components/dropdown.css (or topbar.css).

   Last updated: 2026-07-14
   ═══════════════════════════════════════════════════════════════════ */

const ContextMenu = (() => {

  /* ═══════════════════════════════════════════════════════════════
     STATE
     ═══════════════════════════════════════════════════════════════ */

  let longPressTimer = null;
  let isVisible = false;
  let currentItems = [];
  let activeElement = null;

  /* ═══════════════════════════════════════════════════════════════
     HELPERS
     ═══════════════════════════════════════════════════════════════ */

  /**
   * Escape HTML to prevent XSS
   * @param {string} str - The string to escape
   * @returns {string} Escaped string
   */
  function escapeHTML(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  /**
   * Get or create the context menu root element
   * @returns {HTMLElement} The root element
   */
  function getRoot() {
    let root = document.getElementById('context-menu-root');

    if (!root) {
      root = document.createElement('div');
      root.id = 'context-menu-root';
      root.style.cssText = `
                position: fixed;
                inset: 0;
                pointer-events: none;
                z-index: var(--z-dropdown, 1100);
            `;
      document.body.appendChild(root);
    }

    return root;
  }

  /**
   * Position the menu to stay within the viewport
   * @param {HTMLElement} menuEl - The menu element
   * @param {number} x - Desired x position
   * @param {number} y - Desired y position
   */
  function positionMenu(menuEl, x, y) {
    const rect = menuEl.getBoundingClientRect();
    const padding = 8;

    let left = x;
    let top = y;

    // Adjust horizontally if menu would overflow the right edge
    if (left + rect.width > window.innerWidth - padding) {
      left = window.innerWidth - rect.width - padding;
    }

    // Adjust horizontally if menu would overflow the left edge
    if (left < padding) {
      left = padding;
    }

    // Adjust vertically if menu would overflow the bottom edge
    if (top + rect.height > window.innerHeight - padding) {
      top = window.innerHeight - rect.height - padding;
    }

    // Adjust vertically if menu would overflow the top edge
    if (top < padding) {
      top = padding;
    }

    menuEl.style.left = `${left}px`;
    menuEl.style.top = `${top}px`;
  }

  /* ═══════════════════════════════════════════════════════════════
     PUBLIC API
     ═══════════════════════════════════════════════════════════════ */

  /**
   * Hide the context menu
   */
  function hide() {
    const root = getRoot();
    root.classList.remove('is-visible');
    root.innerHTML = '';
    isVisible = false;
    currentItems = [];
    activeElement = null;

    // Restore pointer events so clicks pass through
    root.style.pointerEvents = 'none';
  }

  /**
   * Show the context menu at a specific position
   * @param {number} x - X coordinate (pixels from left)
   * @param {number} y - Y coordinate (pixels from top)
   * @param {Array} items - Array of menu items
   */
  function show(x, y, items) {
    if (!items || items.length === 0) return;

    const root = getRoot();
    hide();

    currentItems = items;
    isVisible = true;
    activeElement = document.activeElement;

    // Build the menu HTML
    const itemsHtml = items.map((item, index) => {
      if (item.divider) {
        return `<div class="dropdown-divider" data-index="${index}"></div>`;
      }

      const iconHtml = item.icon ? `<span class="icon">${item.icon}</span>` : '';
      const dangerClass = item.danger ? ' danger' : '';
      const disabledClass = item.disabled ? ' disabled' : '';
      const shortcutHtml = item.shortcut ? `<span class="shortcut">${escapeHTML(item.shortcut)}</span>` : '';

      return `
                <button class="dropdown-item${dangerClass}${disabledClass}" data-index="${index}" ${item.disabled ? 'disabled' : ''}>
                    ${iconHtml}
                    <span class="label">${escapeHTML(item.label)}</span>
                    ${shortcutHtml}
                </button>
            `;
    }).join('');

    root.innerHTML = `
            <div class="dropdown open" style="position:fixed; pointer-events:auto; min-width:180px;">
                ${itemsHtml}
            </div>
        `;

    root.classList.add('is-visible');
    root.style.pointerEvents = 'auto';

    // Position the menu within viewport
    const menuEl = root.firstElementChild;
    if (menuEl) {
      // Use requestAnimationFrame to ensure layout is complete
      requestAnimationFrame(() => {
        positionMenu(menuEl, x, y);

        // Add a small animation class for smooth appearance
        menuEl.style.animation = 'contextMenuIn 0.15s cubic-bezier(0.22, 1, 0.36, 1)';
      });
    }

    // Bind click events to menu items
    menuEl?.querySelectorAll('.dropdown-item:not(.disabled)').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const index = parseInt(btn.dataset.index, 10);
        const item = items[index];
        if (item && item.onClick && !item.disabled) {
          hide();
          item.onClick(e);
        }
      });
    });
  }

  /**
   * Attach context menu to an element
   * @param {HTMLElement} el - The element to attach to
   * @param {Array|Function} itemsOrFn - Menu items or a function that returns them
   * @param {object} options - Configuration options
   * @param {boolean} options.preventNative - Prevent native context menu (default: true)
   * @param {number} options.longPressDelay - Delay for long press in ms (default: 500)
   */
  function attach(el, itemsOrFn, options = {}) {
    if (!el) return;

    const {
      preventNative = true,
      longPressDelay = 500
    } = options;

    /**
     * Get the menu items
     * @returns {Array} Array of menu items
     */
    function getItems() {
      return typeof itemsOrFn === 'function' ? itemsOrFn(el) : itemsOrFn;
    }

    /**
     * Handle opening the menu at a specific position
     * @param {number} x - X coordinate
     * @param {number} y - Y coordinate
     */
    function openMenu(x, y) {
      const items = getItems();
      if (!items || items.length === 0) return;
      show(x, y, items);
    }

    // ── Right-click (desktop) ──────────────────────────────────

    el.addEventListener('contextmenu', (e) => {
      if (preventNative) {
        e.preventDefault();
        e.stopPropagation();
      }
      openMenu(e.clientX, e.clientY);
    });

    // ── Long press (mobile) ────────────────────────────────────

    el.addEventListener('touchstart', (e) => {
      const touch = e.touches[0];
      if (!touch) return;

      // Clear any existing timer
      clearTimeout(longPressTimer);

      // Start the long press timer
      longPressTimer = setTimeout(() => {
        const items = getItems();
        if (!items || items.length === 0) return;

        // Prevent default to avoid scrolling while menu is open
        e.preventDefault();

        // Use the touch position for the menu
        openMenu(touch.clientX, touch.clientY);

        // Haptic feedback if available
        if (navigator.vibrate) {
          navigator.vibrate(15);
        }
      }, longPressDelay);
    }, { passive: true });

    el.addEventListener('touchmove', () => {
      // Cancel long press on touch move (user is scrolling)
      clearTimeout(longPressTimer);
    }, { passive: true });

    el.addEventListener('touchend', () => {
      // Clear the timer on touch end
      clearTimeout(longPressTimer);
    }, { passive: true });

    el.addEventListener('touchcancel', () => {
      // Clear the timer if touch is cancelled
      clearTimeout(longPressTimer);
    }, { passive: true });

    // ── Store reference for cleanup ────────────────────────────

    el._contextMenuAttached = true;
    el._contextMenuCleanup = () => {
      el.removeEventListener('contextmenu', openMenu);
      el.removeEventListener('touchstart', null);
      el.removeEventListener('touchmove', null);
      el.removeEventListener('touchend', null);
      el.removeEventListener('touchcancel', null);
      delete el._contextMenuAttached;
      delete el._contextMenuCleanup;
    };

    return el;
  }

  /**
   * Detach context menu from an element
   * @param {HTMLElement} el - The element to detach from
   */
  function detach(el) {
    if (el && el._contextMenuCleanup) {
      el._contextMenuCleanup();
    }
  }

  /**
   * Check if the context menu is currently visible
   * @returns {boolean} True if visible
   */
  function isOpen() {
    return isVisible;
  }

  /**
   * Get the currently active menu items
   * @returns {Array} Array of menu items
   */
  function getCurrentItems() {
    return currentItems;
  }

  /* ═══════════════════════════════════════════════════════════════
     GLOBAL EVENT LISTENERS
     ═══════════════════════════════════════════════════════════════ */

  // Close on click outside
  document.addEventListener('click', (e) => {
    const root = getRoot();
    if (isVisible && !root.contains(e.target)) {
      hide();
    }
  });

  // Close on Escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isVisible) {
      hide();
    }
  });

  // Close on window resize
  window.addEventListener('resize', () => {
    if (isVisible) hide();
  });

  // Close on app resize event (from shell.js)
  document.addEventListener('appResize', () => {
    if (isVisible) hide();
  });

  // Close on scroll (only if menu is visible)
  document.addEventListener('scroll', () => {
    if (isVisible) hide();
  }, { passive: true, capture: true });

  // ─── Inject animation keyframes ──────────────────────────────────

  const styleId = 'context-menu-styles';
  if (!document.getElementById(styleId)) {
    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
            @keyframes contextMenuIn {
                from {
                    opacity: 0;
                    transform: scale(0.96) translateY(-4px);
                }
                to {
                    opacity: 1;
                    transform: scale(1) translateY(0);
                }
            }

            .dropdown-item.disabled {
                opacity: 0.4;
                cursor: not-allowed;
                pointer-events: none;
            }

            .dropdown-item .shortcut {
                font-size: 0.7rem;
                color: var(--text-muted, #a8988e);
                margin-left: auto;
                padding-left: 12px;
                opacity: 0.6;
            }

            [data-theme="dark"] .dropdown-item .shortcut {
                color: var(--text-muted, #6b5f56);
            }

            #context-menu-root.is-visible {
                pointer-events: auto;
            }

            #context-menu-root .dropdown {
                animation: contextMenuIn 0.15s cubic-bezier(0.22, 1, 0.36, 1);
                box-shadow: var(--shadow-lg, 0 10px 15px -3px rgba(26, 20, 16, 0.08));
                border: 1px solid var(--border-light, #e8e0d8);
                border-radius: var(--r-md, 10px);
                background: var(--bg-card, #fcfaf8);
                min-width: 180px;
                padding: 4px 0;
                max-width: 320px;
            }

            [data-theme="dark"] #context-menu-root .dropdown {
                background: var(--bg-card, #241d18);
                border-color: var(--border-light, rgba(240, 235, 230, 0.06));
                box-shadow: var(--shadow-lg, 0 10px 15px -3px rgba(0, 0, 0, 0.30));
            }

            #context-menu-root .dropdown-item {
                padding: 8px 16px;
                font-size: 0.825rem;
                font-weight: 500;
                color: var(--text-body, #2c241e);
                display: flex;
                align-items: center;
                gap: 10px;
                width: 100%;
                text-align: left;
                background: transparent;
                border: none;
                cursor: pointer;
                font-family: inherit;
                transition: background 0.15s, color 0.15s;
                border-radius: 0;
            }

            [data-theme="dark"] #context-menu-root .dropdown-item {
                color: var(--text-body, #d4ccc6);
            }

            #context-menu-root .dropdown-item:hover {
                background: var(--bg-hover, #f5f0eb);
                color: var(--text-dark, #1a1410);
            }

            [data-theme="dark"] #context-menu-root .dropdown-item:hover {
                background: var(--bg-hover, rgba(240, 235, 230, 0.04));
                color: var(--text-dark, #f0ebe6);
            }

            #context-menu-root .dropdown-item.danger {
                color: var(--danger, #c45a4a);
            }

            #context-menu-root .dropdown-item.danger:hover {
                background: var(--danger-bg, #f0e0dc);
                color: var(--danger, #c45a4a);
            }

            [data-theme="dark"] #context-menu-root .dropdown-item.danger:hover {
                background: var(--danger-bg, rgba(196, 90, 74, 0.15));
                color: var(--danger, #d46a5a);
            }

            #context-menu-root .dropdown-item .icon {
                font-size: 1rem;
                width: 20px;
                text-align: center;
                flex-shrink: 0;
                opacity: 0.6;
            }

            #context-menu-root .dropdown-item .label {
                flex: 1;
            }

            #context-menu-root .dropdown-divider {
                height: 1px;
                background: var(--border-light, #e8e0d8);
                margin: 4px 12px;
            }

            [data-theme="dark"] #context-menu-root .dropdown-divider {
                background: var(--border-light, rgba(240, 235, 230, 0.06));
            }
        `;
    document.head.appendChild(style);
  }

  /* ═══════════════════════════════════════════════════════════════
     EXPORTS
     ═══════════════════════════════════════════════════════════════ */

  return {
    attach,
    detach,
    show,
    hide,
    isOpen,
    getCurrentItems
  };

})();

// ─── EXPOSE TO WINDOW ───────────────────────────────────────────────
window.ContextMenu = ContextMenu;
