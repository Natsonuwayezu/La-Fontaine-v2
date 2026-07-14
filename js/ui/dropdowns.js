/* ═══════════════════════════════════════════════════════════════════
   js/ui/dropdowns.js — Generic dropdown menu controller
   ═══════════════════════════════════════════════════════════════════
   Purpose: Provide ad-hoc action menus for table rows, cards,
   filter menus, and other UI elements.

   Distinct from sidebar.js/topbar.js which have their own hand-wired
   dropdowns for specific components.

   Usage:
     Dropdown.attach(triggerEl, items | (closeFn) => items, opts?)
     Dropdown.closeAll()

   Menu Item Structure:
     { label: 'Edit', icon: '✏️', onClick: () => {}, danger?: false, divider?: false }

   Expected CSS: .dropdown, .dropdown-item, .dropdown-item.danger,
   .dropdown-divider from css/components/dropdown.css.

   Last updated: 2026-07-14
   ═══════════════════════════════════════════════════════════════════ */

const Dropdown = (() => {

  /* ═══════════════════════════════════════════════════════════════
     STATE
     ═══════════════════════════════════════════════════════════════ */

  let openMenu = null; // { el, trigger, placement }
  let closeCallback = null;

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
   * Generate a unique ID for menu items
   * @returns {string} Unique ID
   */
  function generateId() {
    return 'dropdown-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
  }

  /**
   * Get the scroll position of the trigger's container
   * @param {HTMLElement} trigger - The trigger element
   * @returns {object} { scrollX, scrollY }
   */
  function getContainerScroll(trigger) {
    let parent = trigger.parentElement;
    let scrollX = window.scrollX;
    let scrollY = window.scrollY;

    while (parent) {
      const style = getComputedStyle(parent);
      if (style.overflow === 'auto' || style.overflow === 'scroll' ||
        style.overflowY === 'auto' || style.overflowY === 'scroll') {
        scrollX = parent.scrollLeft;
        scrollY = parent.scrollTop;
        break;
      }
      parent = parent.parentElement;
    }

    return { scrollX, scrollY };
  }

  /* ═══════════════════════════════════════════════════════════════
     CORE FUNCTIONS
     ═══════════════════════════════════════════════════════════════ */

  /**
   * Close all open dropdowns
   */
  function closeAll() {
    if (openMenu) {
      if (openMenu.el && openMenu.el.parentNode) {
        openMenu.el.remove();
      }
      if (openMenu.trigger) {
        openMenu.trigger.classList.remove('is-open');
        openMenu.trigger.setAttribute('aria-expanded', 'false');
      }
      openMenu = null;
      closeCallback = null;
    }
  }

  /**
   * Build the dropdown menu HTML
   * @param {Array} items - Array of menu items
   * @param {string} id - Unique ID for the menu
   * @returns {HTMLElement} The menu element
   */
  function buildMenu(items, id) {
    const menu = document.createElement('div');
    menu.className = 'dropdown open';
    menu.id = id;
    menu.setAttribute('role', 'menu');
    menu.setAttribute('aria-label', 'Dropdown menu');
    menu.style.position = 'fixed';
    menu.style.minWidth = '180px';
    menu.style.maxWidth = '320px';

    // Build items
    const itemsHtml = items.map((item, index) => {
      if (item.divider) {
        return `<div class="dropdown-divider" role="separator" data-index="${index}"></div>`;
      }

      const iconHtml = item.icon ? `<span class="icon">${item.icon}</span>` : '';
      const dangerClass = item.danger ? ' danger' : '';
      const disabledClass = item.disabled ? ' disabled' : '';
      const shortcutHtml = item.shortcut ? `<span class="shortcut">${escapeHTML(item.shortcut)}</span>` : '';

      return `
                <button class="dropdown-item${dangerClass}${disabledClass}" 
                        role="menuitem" 
                        data-index="${index}" 
                        ${item.disabled ? 'disabled' : ''}
                        tabindex="${item.disabled ? '-1' : '0'}">
                    ${iconHtml}
                    <span class="label">${escapeHTML(item.label)}</span>
                    ${shortcutHtml}
                </button>
            `;
    }).join('');

    menu.innerHTML = itemsHtml;
    return menu;
  }

  /**
   * Position the dropdown menu relative to the trigger
   * @param {HTMLElement} menu - The menu element
   * @param {HTMLElement} trigger - The trigger element
   * @param {string} placement - Placement option
   */
  function positionMenu(menu, trigger, placement = 'bottom-end') {
    const rect = trigger.getBoundingClientRect();
    const menuRect = menu.getBoundingClientRect();

    const padding = 8;
    let top = rect.bottom + padding;
    let left = rect.right - menuRect.width;

    // ── Vertical positioning ────────────────────────────────────

    if (placement.startsWith('top')) {
      top = rect.top - menuRect.height - padding;
    } else if (placement === 'bottom-start') {
      top = rect.bottom + padding;
    } else if (placement === 'bottom-end') {
      top = rect.bottom + padding;
    } else if (placement === 'top-start') {
      top = rect.top - menuRect.height - padding;
    } else if (placement === 'top-end') {
      top = rect.top - menuRect.height - padding;
    }

    // Fallback if menu overflows bottom
    if (top + menuRect.height > window.innerHeight - padding) {
      top = rect.top - menuRect.height - padding;
    }

    // Fallback if menu overflows top
    if (top < padding) {
      top = rect.bottom + padding;
    }

    // ── Horizontal positioning ──────────────────────────────────

    if (placement === 'bottom-start' || placement === 'top-start') {
      left = rect.left;
    } else if (placement === 'bottom-end' || placement === 'top-end') {
      left = rect.right - menuRect.width;
    }

    // Keep within viewport
    if (left + menuRect.width > window.innerWidth - padding) {
      left = window.innerWidth - menuRect.width - padding;
    }
    if (left < padding) {
      left = padding;
    }

    // Apply position
    menu.style.top = `${top}px`;
    menu.style.left = `${left}px`;
  }

  /* ═══════════════════════════════════════════════════════════════
     PUBLIC API
     ═══════════════════════════════════════════════════════════════ */

  /**
   * Attach a dropdown to a trigger element
   * @param {HTMLElement} triggerEl - The trigger element
   * @param {Array|Function} itemsOrFn - Menu items or function returning items
   * @param {object} opts - Configuration options
   * @param {string} opts.placement - 'bottom-start', 'bottom-end', 'top-start', 'top-end'
   * @param {number} opts.offset - Additional offset in pixels
   * @param {string} opts.className - Additional CSS class for the menu
   * @param {function} opts.onOpen - Callback when menu opens
   * @param {function} opts.onClose - Callback when menu closes
   * @returns {object} { destroy: function } for cleanup
   */
  function attach(triggerEl, itemsOrFn, opts = {}) {
    if (!triggerEl) return { destroy: () => { } };

    const {
      placement = 'bottom-end',
      offset = 0,
      className = '',
      onOpen = null,
      onClose = null
    } = opts;

    let menuId = generateId();

    /**
     * Get the menu items
     * @returns {Array} Array of menu items
     */
    function getItems() {
      return typeof itemsOrFn === 'function' ? itemsOrFn(closeAll) : itemsOrFn;
    }

    /**
     * Open the dropdown
     * @param {Event} event - The triggering event
     */
    function openDropdown(event) {
      if (event) {
        event.stopPropagation();
        event.preventDefault();
      }

      // If this dropdown is already open, close it
      if (openMenu && openMenu.trigger === triggerEl) {
        closeAll();
        return;
      }

      // Close any other open dropdown
      closeAll();

      const items = getItems();
      if (!items || items.length === 0) return;

      // Build and position the menu
      const menu = buildMenu(items, menuId);
      if (className) {
        menu.classList.add(className);
      }

      // Add offset
      if (offset) {
        menu.style.marginTop = `${offset}px`;
      }

      document.body.appendChild(menu);

      // Position after layout
      requestAnimationFrame(() => {
        positionMenu(menu, triggerEl, placement);

        // Add animation class
        menu.style.animation = 'dropdownIn 0.15s cubic-bezier(0.22, 1, 0.36, 1)';
      });

      // Mark trigger as open
      triggerEl.classList.add('is-open');
      triggerEl.setAttribute('aria-expanded', 'true');

      // Store state
      openMenu = { el: menu, trigger: triggerEl, placement };
      closeCallback = onClose || null;

      // Fire onOpen callback
      if (onOpen) onOpen(menu, items);

      // ── Bind item clicks ────────────────────────────────────

      menu.querySelectorAll('.dropdown-item:not(.disabled)').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const index = parseInt(btn.dataset.index, 10);
          const item = items[index];
          if (item && item.onClick && !item.disabled) {
            const shouldClose = item.closeOnClick !== false;
            if (shouldClose) {
              closeAll();
            }
            item.onClick(e);
          }
        });
      });

      // ── Keyboard navigation ─────────────────────────────────

      const itemButtons = menu.querySelectorAll('.dropdown-item:not(.disabled)');
      if (itemButtons.length > 0) {
        // Focus the first item
        itemButtons[0].focus();

        // Arrow key navigation
        menu.addEventListener('keydown', (e) => {
          const current = document.activeElement;
          const buttons = menu.querySelectorAll('.dropdown-item:not(.disabled)');
          const currentIndex = Array.from(buttons).indexOf(current);

          if (e.key === 'ArrowDown') {
            e.preventDefault();
            const nextIndex = (currentIndex + 1) % buttons.length;
            buttons[nextIndex].focus();
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            const prevIndex = (currentIndex - 1 + buttons.length) % buttons.length;
            buttons[prevIndex].focus();
          } else if (e.key === 'Home') {
            e.preventDefault();
            buttons[0].focus();
          } else if (e.key === 'End') {
            e.preventDefault();
            buttons[buttons.length - 1].focus();
          } else if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            if (current) current.click();
          }
        });
      }
    }

    // ── Bind trigger events ─────────────────────────────────────

    triggerEl.addEventListener('click', openDropdown);

    // ── Return cleanup function ─────────────────────────────────

    return {
      destroy: () => {
        triggerEl.removeEventListener('click', openDropdown);
        if (openMenu && openMenu.trigger === triggerEl) {
          closeAll();
        }
      },
      open: openDropdown,
      close: closeAll,
      isOpen: () => openMenu && openMenu.trigger === triggerEl
    };
  }

  /**
   * Show a dropdown programmatically at a specific position
   * @param {number} x - X coordinate
   * @param {number} y - Y coordinate
   * @param {Array} items - Menu items
   * @param {object} opts - Configuration options
   * @returns {object} { close: function }
   */
  function showAt(x, y, items, opts = {}) {
    const { className = '', onClose = null } = opts;

    // Close any open dropdown
    closeAll();

    if (!items || items.length === 0) return { close: closeAll };

    const menuId = generateId();
    const menu = buildMenu(items, menuId);
    if (className) menu.classList.add(className);

    // Position at the specified coordinates
    menu.style.position = 'fixed';
    menu.style.top = `${y}px`;
    menu.style.left = `${x}px`;
    menu.style.animation = 'dropdownIn 0.15s cubic-bezier(0.22, 1, 0.36, 1)';

    document.body.appendChild(menu);

    // Adjust position to stay within viewport
    requestAnimationFrame(() => {
      const rect = menu.getBoundingClientRect();
      const padding = 8;

      if (rect.right > window.innerWidth - padding) {
        menu.style.left = `${window.innerWidth - rect.width - padding}px`;
      }
      if (rect.bottom > window.innerHeight - padding) {
        menu.style.top = `${window.innerHeight - rect.height - padding}px`;
      }
      if (rect.left < padding) {
        menu.style.left = `${padding}px`;
      }
      if (rect.top < padding) {
        menu.style.top = `${padding}px`;
      }
    });

    openMenu = { el: menu, trigger: null, placement: 'custom' };
    closeCallback = onClose || null;

    // ── Bind item clicks ────────────────────────────────────────

    menu.querySelectorAll('.dropdown-item:not(.disabled)').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const index = parseInt(btn.dataset.index, 10);
        const item = items[index];
        if (item && item.onClick && !item.disabled) {
          const shouldClose = item.closeOnClick !== false;
          if (shouldClose) {
            closeAll();
          }
          item.onClick(e);
        }
      });
    });

    return { close: closeAll };
  }

  /* ═══════════════════════════════════════════════════════════════
     GLOBAL EVENT LISTENERS
     ═══════════════════════════════════════════════════════════════ */

  // Close on click outside
  document.addEventListener('click', (e) => {
    if (openMenu) {
      const isTrigger = openMenu.trigger && openMenu.trigger.contains(e.target);
      const isMenu = openMenu.el && openMenu.el.contains(e.target);
      if (!isTrigger && !isMenu) {
        closeAll();
      }
    }
  });

  // Close on Escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeAll();
    }
  });

  // Close on window resize
  window.addEventListener('resize', () => {
    if (openMenu) closeAll();
  });

  // Close on app resize event (from shell.js)
  document.addEventListener('appResize', () => {
    if (openMenu) closeAll();
  });

  // ─── Inject animation keyframes ──────────────────────────────────

  const styleId = 'dropdown-styles';
  if (!document.getElementById(styleId)) {
    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
            @keyframes dropdownIn {
                from {
                    opacity: 0;
                    transform: scale(0.96) translateY(-6px);
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

            .dropdown {
                background: var(--bg-card, #fcfaf8);
                border: 1px solid var(--border-light, #e8e0d8);
                border-radius: var(--r-md, 10px);
                box-shadow: var(--shadow-lg, 0 10px 15px -3px rgba(26, 20, 16, 0.08));
                min-width: 180px;
                max-width: 320px;
                padding: 4px 0;
                z-index: var(--z-dropdown, 1100);
            }

            [data-theme="dark"] .dropdown {
                background: var(--bg-card, #241d18);
                border-color: var(--border-light, rgba(240, 235, 230, 0.06));
                box-shadow: var(--shadow-lg, 0 10px 15px -3px rgba(0, 0, 0, 0.30));
            }

            .dropdown-item {
                display: flex;
                align-items: center;
                gap: 10px;
                padding: 8px 16px;
                font-size: 0.825rem;
                font-weight: 500;
                color: var(--text-body, #2c241e);
                width: 100%;
                text-align: left;
                background: transparent;
                border: none;
                cursor: pointer;
                font-family: inherit;
                transition: background 0.15s, color 0.15s;
                border-radius: 0;
            }

            [data-theme="dark"] .dropdown-item {
                color: var(--text-body, #d4ccc6);
            }

            .dropdown-item:hover {
                background: var(--bg-hover, #f5f0eb);
                color: var(--text-dark, #1a1410);
            }

            [data-theme="dark"] .dropdown-item:hover {
                background: var(--bg-hover, rgba(240, 235, 230, 0.04));
                color: var(--text-dark, #f0ebe6);
            }

            .dropdown-item:focus-visible {
                outline: 2px solid var(--role-primary, #2d1f3a);
                outline-offset: -2px;
            }

            .dropdown-item.danger {
                color: var(--danger, #c45a4a);
            }

            .dropdown-item.danger:hover {
                background: var(--danger-bg, #f0e0dc);
                color: var(--danger, #c45a4a);
            }

            [data-theme="dark"] .dropdown-item.danger:hover {
                background: var(--danger-bg, rgba(196, 90, 74, 0.15));
                color: var(--danger, #d46a5a);
            }

            .dropdown-item .icon {
                font-size: 1rem;
                width: 20px;
                text-align: center;
                flex-shrink: 0;
                opacity: 0.6;
            }

            .dropdown-item .label {
                flex: 1;
            }

            .dropdown-divider {
                height: 1px;
                background: var(--border-light, #e8e0d8);
                margin: 4px 12px;
            }

            [data-theme="dark"] .dropdown-divider {
                background: var(--border-light, rgba(240, 235, 230, 0.06));
            }

            .trigger.is-open {
                position: relative;
                z-index: calc(var(--z-dropdown, 1100) + 1);
            }
        `;
    document.head.appendChild(style);
  }

  /* ═══════════════════════════════════════════════════════════════
     EXPORTS
     ═══════════════════════════════════════════════════════════════ */

  return {
    attach,
    showAt,
    closeAll,
    isOpen: () => openMenu !== null
  };

})();

// ─── EXPOSE TO WINDOW ───────────────────────────────────────────────
window.Dropdown = Dropdown;

export default Dropdown;