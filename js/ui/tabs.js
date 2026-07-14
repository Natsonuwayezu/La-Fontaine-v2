/* ═══════════════════════════════════════════════════════════════════
   js/ui/tabs.js — Generic tab-group controller
   ═══════════════════════════════════════════════════════════════════
   Purpose: Manage tabbed interfaces throughout the application.

   Works for every tab-styled control in the app — settings tabs,
   profile tabs, phase tabs, report-type tabs — as long as the markup
   follows the convention: a group container with clickable items
   carrying [data-tab="key"], and sibling panels carrying
   [data-tab-panel="key"].

   Features:
   - Keyboard navigation (Left/Right, Home/End)
   - ARIA attributes for accessibility
   - Change events with callback
   - Persistence via localStorage (optional)
   - Auto-initialization for all tab groups

   Usage:
     // Manual initialization
     Tabs.init(groupEl, {
       onChange: (key) => { console.log('Tab changed to:', key); },
       persist: true,
       persistKey: 'my-tabs'
     })

     // Auto-initialize all groups
     Tabs.initAll()

     // Activate a specific tab
     Tabs.activate(groupEl, 'tab-key')

   Last updated: 2026-07-14
   ═══════════════════════════════════════════════════════════════════ */

const Tabs = (() => {

  /* ═══════════════════════════════════════════════════════════════
     STATE
     ═══════════════════════════════════════════════════════════════ */

  const groups = new Map(); // groupEl -> { items, options, activeKey }

  /* ═══════════════════════════════════════════════════════════════
     CORE FUNCTIONS
     ═══════════════════════════════════════════════════════════════ */

  /**
   * Activate a specific tab within a group
   * @param {HTMLElement} groupEl - The tab group container
   * @param {string} key - The tab key to activate
   * @param {object} options - Optional configuration
   * @param {boolean} options.silent - Don't trigger onChange callback
   * @param {boolean} options.persist - Save to localStorage
   */
  function activate(groupEl, key, options = {}) {
    if (!groupEl) return;

    const { silent = false, persist = true } = options;

    // Get all tab items in this group
    const items = groupEl.querySelectorAll('[data-tab]');
    let found = false;

    items.forEach(item => {
      const isActive = item.dataset.tab === key;
      item.classList.toggle('active', isActive);
      item.setAttribute('aria-selected', isActive ? 'true' : 'false');
      item.setAttribute('tabindex', isActive ? '0' : '-1');

      if (isActive) found = true;
    });

    // If key not found, do nothing
    if (!found) return;

    // Update panels
    const panelScope = groupEl.dataset.panelScope
      ? document.querySelector(groupEl.dataset.panelScope)
      : groupEl.parentElement;

    if (panelScope) {
      panelScope.querySelectorAll('[data-tab-panel]').forEach(panel => {
        const isActive = panel.dataset.tabPanel === key;
        panel.hidden = !isActive;
        panel.setAttribute('aria-hidden', !isActive ? 'true' : 'false');
      });
    }

    // Update state
    groupEl.dataset.activeTab = key;
    const groupData = groups.get(groupEl);
    if (groupData) {
      groupData.activeKey = key;
    }

    // Persist to localStorage
    if (persist && groupData?.options?.persistKey) {
      try {
        localStorage.setItem(groupData.options.persistKey, key);
      } catch (_) { /* ignore */ }
    }

    // Trigger change event
    if (!silent && groupData?.options?.onChange) {
      groupData.options.onChange(key, groupData);
    }

    // Dispatch custom event
    groupEl.dispatchEvent(new CustomEvent('tabChanged', {
      detail: { key, group: groupData }
    }));
  }

  /**
   * Initialize a tab group
   * @param {HTMLElement} groupEl - The tab group container
   * @param {object} options - Configuration options
   * @param {Function} options.onChange - Callback when tab changes
   * @param {boolean} options.persist - Save to localStorage (default: false)
   * @param {string} options.persistKey - Key for localStorage (default: groupEl id)
   * @param {string} options.initialKey - Initial tab key (overrides active class)
   */
  function init(groupEl, options = {}) {
    if (!groupEl || groupEl.dataset.tabsBound === 'true') return;

    const {
      onChange = null,
      persist = false,
      persistKey = groupEl.id || 'tabs-state',
      initialKey = null
    } = options;

    // Mark as initialized
    groupEl.dataset.tabsBound = 'true';
    groupEl.setAttribute('role', 'tablist');

    // Get all tab items
    const items = [...groupEl.querySelectorAll('[data-tab]')];

    // Store group data
    groups.set(groupEl, {
      items,
      options: { onChange, persist, persistKey, initialKey },
      activeKey: null
    });

    // Set up each tab item
    items.forEach((item, index) => {
      const key = item.dataset.tab;

      // ARIA attributes
      item.setAttribute('role', 'tab');
      item.setAttribute('aria-controls', `panel-${key}`);
      item.setAttribute('aria-selected', 'false');
      item.setAttribute('tabindex', '-1');

      // Add click handler
      item.addEventListener('click', () => {
        activate(groupEl, key);
      });

      // Keyboard navigation
      item.addEventListener('keydown', (e) => {
        let targetIdx = null;

        if (e.key === 'ArrowRight') {
          targetIdx = (index + 1) % items.length;
        } else if (e.key === 'ArrowLeft') {
          targetIdx = (index - 1 + items.length) % items.length;
        } else if (e.key === 'Home') {
          targetIdx = 0;
        } else if (e.key === 'End') {
          targetIdx = items.length - 1;
        }

        if (targetIdx !== null) {
          e.preventDefault();
          const target = items[targetIdx];
          target.focus();
          activate(groupEl, target.dataset.tab);
        }
      });
    });

    // Set up panels
    const panelScope = groupEl.dataset.panelScope
      ? document.querySelector(groupEl.dataset.panelScope)
      : groupEl.parentElement;

    if (panelScope) {
      panelScope.querySelectorAll('[data-tab-panel]').forEach(panel => {
        panel.setAttribute('role', 'tabpanel');
        panel.setAttribute('aria-hidden', 'true');
      });
    }

    // Determine initial tab
    let initialTabKey = null;

    // 1. Check localStorage persistence
    if (persist && persistKey) {
      try {
        const saved = localStorage.getItem(persistKey);
        if (saved && items.some(i => i.dataset.tab === saved)) {
          initialTabKey = saved;
        }
      } catch (_) { /* ignore */ }
    }

    // 2. Check explicitly provided initialKey
    if (!initialTabKey && initialKey && items.some(i => i.dataset.tab === initialKey)) {
      initialTabKey = initialKey;
    }

    // 3. Check active class in markup
    if (!initialTabKey) {
      const activeItem = items.find(i => i.classList.contains('active'));
      if (activeItem) initialTabKey = activeItem.dataset.tab;
    }

    // 4. Fallback to first item
    if (!initialTabKey && items.length > 0) {
      initialTabKey = items[0].dataset.tab;
    }

    // Activate the initial tab silently
    if (initialTabKey) {
      activate(groupEl, initialTabKey, { silent: true, persist: false });
    }

    return groupEl;
  }

  /**
   * Initialize all tab groups in the DOM
   * @param {HTMLElement} root - Root element to search within (default: document)
   * @param {string} selector - CSS selector for tab groups (default: '[data-tab-group]')
   */
  function initAll(root = document, selector = '[data-tab-group]') {
    const groups = root.querySelectorAll(selector);
    groups.forEach(group => {
      // Check if options are stored in data attributes
      const options = {
        persist: group.dataset.persist === 'true',
        persistKey: group.dataset.persistKey || group.id || 'tabs-state',
        initialKey: group.dataset.initialTab || null
      };
      init(group, options);
    });
    return groups;
  }

  /**
   * Get the currently active tab key for a group
   * @param {HTMLElement} groupEl - The tab group container
   * @returns {string|null} The active tab key or null
   */
  function getActiveKey(groupEl) {
    if (!groupEl) return null;
    return groupEl.dataset.activeTab || null;
  }

  /**
   * Get the currently active tab item element
   * @param {HTMLElement} groupEl - The tab group container
   * @returns {HTMLElement|null} The active tab element or null
   */
  function getActiveItem(groupEl) {
    if (!groupEl) return null;
    const key = getActiveKey(groupEl);
    if (!key) return null;
    return groupEl.querySelector(`[data-tab="${key}"]`);
  }

  /**
   * Check if a group is initialized
   * @param {HTMLElement} groupEl - The tab group container
   * @returns {boolean} True if initialized
   */
  function isInitialized(groupEl) {
    return groupEl?.dataset.tabsBound === 'true';
  }

  /**
   * Destroy a tab group (clean up event listeners)
   * @param {HTMLElement} groupEl - The tab group container
   */
  function destroy(groupEl) {
    if (!groupEl) return;

    const groupData = groups.get(groupEl);
    if (!groupData) return;

    // Remove event listeners from items
    groupData.items.forEach(item => {
      item.removeEventListener('click', null);
      item.removeEventListener('keydown', null);
    });

    // Clear data
    groups.delete(groupEl);
    delete groupEl.dataset.tabsBound;
    delete groupEl.dataset.activeTab;
  }

  /**
   * Refresh a tab group (re-sync state)
   * @param {HTMLElement} groupEl - The tab group container
   * @param {string} key - Tab key to activate (optional)
   */
  function refresh(groupEl, key = null) {
    if (!groupEl) return;

    const currentKey = key || getActiveKey(groupEl);
    if (currentKey) {
      activate(groupEl, currentKey, { silent: true, persist: false });
    } else {
      // Re-initialize if no active key
      const groupData = groups.get(groupEl);
      if (groupData && groupData.items.length > 0) {
        activate(groupEl, groupData.items[0].dataset.tab, { silent: true, persist: false });
      }
    }
  }

  /* ═══════════════════════════════════════════════════════════════
     HELPERS FOR COMMON PATTERNS
     ═══════════════════════════════════════════════════════════════ */

  /**
   * Create a tab group dynamically
   * @param {HTMLElement} container - Container to append the tabs to
   * @param {object} config - Tab configuration
   * @param {Array} config.tabs - Array of { key, label, icon?, panel }
   * @param {string} config.activeKey - Initially active tab
   * @param {Function} config.onChange - Change callback
   * @param {boolean} config.persist - Persist to localStorage
   * @param {string} config.persistKey - localStorage key
   * @returns {HTMLElement} The created tab group
   */
  function create(container, config) {
    const {
      tabs = [],
      activeKey = null,
      onChange = null,
      persist = false,
      persistKey = 'dynamic-tabs'
    } = config;

    if (!container || tabs.length === 0) return null;

    // Create group container
    const group = document.createElement('div');
    group.className = 'tabs';
    group.dataset.tabGroup = 'true';
    group.setAttribute('role', 'tablist');

    // Create tab items
    const items = tabs.map(tab => {
      const item = document.createElement('button');
      item.className = 'tab-btn';
      item.dataset.tab = tab.key;
      item.setAttribute('role', 'tab');
      item.innerHTML = tab.icon ? `${tab.icon} ${tab.label}` : tab.label;
      return item;
    });

    // Append items to group
    items.forEach(item => group.appendChild(item));

    // Create panels
    const panelContainer = document.createElement('div');
    panelContainer.className = 'tab-panels';

    tabs.forEach(tab => {
      const panel = document.createElement('div');
      panel.className = 'tab-panel';
      panel.dataset.tabPanel = tab.key;
      panel.setAttribute('role', 'tabpanel');
      panel.hidden = true;

      // If panel content is a string, set it directly
      if (typeof tab.panel === 'string') {
        panel.innerHTML = tab.panel;
      } else if (tab.panel instanceof HTMLElement) {
        panel.appendChild(tab.panel);
      }

      panelContainer.appendChild(panel);
    });

    // Append panels to container
    container.appendChild(group);
    container.appendChild(panelContainer);

    // Initialize the tabs
    const initialKey = activeKey || (tabs.length > 0 ? tabs[0].key : null);

    init(group, {
      onChange,
      persist,
      persistKey,
      initialKey
    });

    return group;
  }

  /* ═══════════════════════════════════════════════════════════════
     EXPORTS
     ═══════════════════════════════════════════════════════════════ */

  return {
    // Core API
    init,
    initAll,
    activate,
    destroy,
    refresh,

    // Query API
    getActiveKey,
    getActiveItem,
    isInitialized,

    // Dynamic creation
    create,

    // Group registry (for debugging)
    getGroups: () => groups
  };

})();

// ─── EXPOSE TO WINDOW ───────────────────────────────────────────────
window.Tabs = Tabs;

export default Tabs;