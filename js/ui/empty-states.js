/* ═══════════════════════════════════════════════════════════════════
   js/ui/empty-states.js — Empty state renderer
   ═══════════════════════════════════════════════════════════════════
   Purpose: Render consistent empty state messages when tables/lists
   have zero rows to show.

   Usage:
     EmptyStates.renderInto(container, {
       icon: svgString,
       title: 'No records yet',
       message: 'Once data is added, it will show up here.',
       actionLabel: 'Add Record',
       onAction: () => {}
     })

     // Or use a preset:
     EmptyStates.renderPreset(container, 'noData', {
       actionLabel: 'Add Student',
       onAction: () => navigateTo('enroll-student')
     })

   Presets:
     - noData          : No records yet
     - noSearchResults : No matches found
     - noConnection    : Connection issue
     - noAccess        : Access denied
     - noUpdates       : No updates available
     - noFees          : No fees assigned

   Expected CSS classes: .empty-state, .empty-state-icon,
   .empty-state-title, .empty-state-message, .empty-state-action.

   Last updated: 2026-07-14
   ═══════════════════════════════════════════════════════════════════ */

const EmptyStates = (() => {

  /* ═══════════════════════════════════════════════════════════════
     ICONS
     ═══════════════════════════════════════════════════════════════ */

  const ICONS = {
    // Default — document/empty box
    default: `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="M3 7h18M3 7l2 13a2 2 0 0 0 2 1.8h10a2 2 0 0 0 2-1.8L21 7M3 7l1.5-3.5A2 2 0 0 1 6.34 2h11.32a2 2 0 0 1 1.84 1.5L21 7"/>
                <path d="M9 11h6"/>
            </svg>
        `,

    // Search — magnifying glass
    search: `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="11" cy="11" r="8"/>
                <path d="m21 21-4.35-4.35"/>
            </svg>
        `,

    // Connection — wifi / signal
    connection: `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="M1 1l22 22"/>
                <path d="M16.72 11.06a10.94 10.94 0 0 1 2.28 1.49"/>
                <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39"/>
                <path d="M10.71 5.05a16 16 0 0 1 11.87 3.95"/>
                <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88"/>
                <path d="M8.53 16.11a6 6 0 0 1 6.95 0"/>
                <path d="M12 20h.01"/>
            </svg>
        `,

    // Lock — access denied
    lock: `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
            </svg>
        `,

    // Wallet — no fees
    wallet: `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="M20 6V4a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-2"/>
                <path d="M16 14h.01"/>
                <path d="M20 10H4"/>
                <path d="M16 10v4"/>
            </svg>
        `,

    // Inbox — no updates
    inbox: `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="M22 12h-4l-3 4-3-4H2"/>
                <path d="M22 12v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v6z"/>
            </svg>
        `,

    // Graduation — no students
    graduation: `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="M22 10v6M2 10l10-5 10 5-10 5z"/>
                <path d="M6 12v5c0 3 2.5 4 6 4s6-1 6-4v-5"/>
                <path d="M12 22v-7"/>
            </svg>
        `,

    // Chart — no data
    chart: `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="M12 20V10"/>
                <path d="M18 20V4"/>
                <path d="M6 20v-4"/>
                <rect x="2" y="18" width="20" height="2" rx="1"/>
            </svg>
        `,

    // Calendar — no events
    calendar: `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                <line x1="16" y1="2" x2="16" y2="6"/>
                <line x1="8" y1="2" x2="8" y2="6"/>
                <line x1="3" y1="10" x2="21" y2="10"/>
            </svg>
        `
  };

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
   * Get an icon by name or return the provided icon string
   * @param {string} iconName - Name of the icon or SVG string
   * @returns {string} SVG string
   */
  function getIcon(iconName) {
    if (!iconName) return ICONS.default;
    return ICONS[iconName] || iconName;
  }

  /* ═══════════════════════════════════════════════════════════════
     PRESETS
     ═══════════════════════════════════════════════════════════════ */

  const PRESETS = {
    noData: {
      icon: 'default',
      title: 'No records yet',
      message: 'Once data is added, it will show up here.'
    },

    noSearchResults: {
      icon: 'search',
      title: 'No matches found',
      message: 'Try adjusting your search or filters.'
    },

    noConnection: {
      icon: 'connection',
      title: 'Connection issue',
      message: 'Could not reach the server. Check your internet connection and try again.'
    },

    noAccess: {
      icon: 'lock',
      title: 'Access denied',
      message: 'You do not have permission to view this content.'
    },

    noUpdates: {
      icon: 'inbox',
      title: 'No updates available',
      message: 'Check back later for new notifications and announcements.'
    },

    noFees: {
      icon: 'wallet',
      title: 'No fees assigned',
      message: 'This student does not have any outstanding fees.'
    },

    noStudents: {
      icon: 'graduation',
      title: 'No students enrolled',
      message: 'Enroll students to start building your school community.'
    },

    noDataChart: {
      icon: 'chart',
      title: 'No data to display',
      message: 'Once marks and assessments are recorded, charts will appear here.'
    },

    noEvents: {
      icon: 'calendar',
      title: 'No events scheduled',
      message: 'Add events to the calendar to keep everyone informed.'
    },

    noPayments: {
      icon: 'wallet',
      title: 'No payments recorded',
      message: 'Record payments to track financial activity.'
    },

    noMarks: {
      icon: 'chart',
      title: 'No marks entered',
      message: 'Enter marks to generate registers and report cards.'
    },

    noAssessments: {
      icon: 'default',
      title: 'No assessments created',
      message: 'Create assessments to start recording student marks.'
    },

    noNotifications: {
      icon: 'inbox',
      title: 'No notifications',
      message: 'You\'re all caught up!'
    },

    noReminders: {
      icon: 'calendar',
      title: 'No reminders set',
      message: 'Create reminders to stay on top of your tasks.'
    }
  };

  /* ═══════════════════════════════════════════════════════════════
     PUBLIC API
     ═══════════════════════════════════════════════════════════════ */

  /**
   * Render an empty state into a container
   * @param {HTMLElement} container - The container element
   * @param {object} spec - Configuration
   * @param {string} spec.icon - Icon name or SVG string (default: 'default')
   * @param {string} spec.title - Title text (required)
   * @param {string} spec.message - Optional description text
   * @param {string} spec.actionLabel - Button label (optional)
   * @param {Function} spec.onAction - Button click handler (optional)
   * @param {string} spec.actionIcon - Icon for the action button (optional)
   * @param {string} spec.actionVariant - Button variant (primary, secondary, outline)
   * @param {number} spec.iconSize - Size of the icon in pixels (default: 64)
   */
  function renderInto(container, spec = {}) {
    if (!container) return;

    const {
      icon = 'default',
      title = 'Nothing here yet',
      message = '',
      actionLabel = '',
      onAction = null,
      actionIcon = '',
      actionVariant = 'primary',
      iconSize = 64
    } = spec;

    const iconSvg = getIcon(icon);
    const actionBtnHtml = actionLabel ? `
            <button class="btn btn-${actionVariant} empty-state-action" data-empty-action>
                ${actionIcon ? `<span class="btn-icon">${actionIcon}</span>` : ''}
                ${escapeHTML(actionLabel)}
            </button>
        ` : '';

    container.innerHTML = `
            <div class="empty-state" style="display:flex; flex-direction:column; align-items:center; justify-content:center; text-align:center; padding:48px 24px; min-height:240px;">
                <div class="empty-state-icon" style="font-size:${iconSize}px; width:${iconSize}px; height:${iconSize}px; margin-bottom:16px; color:var(--text-muted, #a8988e); opacity:0.4; flex-shrink:0;">
                    ${iconSvg}
                </div>
                <div class="empty-state-title" style="font-family:'Syne',sans-serif; font-size:20px; font-weight:700; color:var(--text-dark, #1a1410); margin-bottom:6px;">
                    ${escapeHTML(title)}
                </div>
                ${message ? `
                    <div class="empty-state-message" style="font-size:14px; color:var(--text-soft, #6b5f56); max-width:420px; margin:0 auto 20px; line-height:1.6;">
                        ${escapeHTML(message)}
                    </div>
                ` : ''}
                ${actionBtnHtml}
            </div>
        `;

    // Bind action handler
    if (onAction) {
      const btn = container.querySelector('[data-empty-action]');
      if (btn) {
        btn.addEventListener('click', onAction);
      }
    }

    // Store the spec for potential updates
    container._emptyStateSpec = spec;
  }

  /**
   * Render a preset empty state
   * @param {HTMLElement} container - The container element
   * @param {string} presetName - Name of the preset to use
   * @param {object} overrides - Override specific fields
   */
  function renderPreset(container, presetName, overrides = {}) {
    const preset = PRESETS[presetName];
    if (!preset) {
      console.warn(`[EmptyStates] Preset "${presetName}" not found, using "noData"`);
      renderInto(container, { ...PRESETS.noData, ...overrides });
      return;
    }

    renderInto(container, { ...preset, ...overrides });
  }

  /**
   * Update an existing empty state (preserves the container)
   * @param {HTMLElement} container - The container element
   * @param {object} updates - Fields to update
   */
  function update(container, updates = {}) {
    if (!container) return;
    const spec = container._emptyStateSpec || {};
    renderInto(container, { ...spec, ...updates });
  }

  /**
   * Check if the container currently shows an empty state
   * @param {HTMLElement} container - The container element
   * @returns {boolean} True if empty state is visible
   */
  function isVisible(container) {
    if (!container) return false;
    return container.querySelector('.empty-state') !== null;
  }

  /**
   * Get the current empty state spec from a container
   * @param {HTMLElement} container - The container element
   * @returns {object|null} The spec object or null
   */
  function getSpec(container) {
    return container?._emptyStateSpec || null;
  }

  /**
   * Register a custom preset
   * @param {string} name - Preset name
   * @param {object} spec - The preset configuration
   */
  function registerPreset(name, spec) {
    if (PRESETS[name]) {
      console.warn(`[EmptyStates] Preset "${name}" already exists, overwriting.`);
    }
    PRESETS[name] = spec;
  }

  /**
   * Get all available presets
   * @returns {object} All presets
   */
  function getPresets() {
    return { ...PRESETS };
  }

  /**
   * Get a specific preset
   * @param {string} name - Preset name
   * @returns {object|null} The preset or null
   */
  function getPreset(name) {
    return PRESETS[name] || null;
  }

  /* ═══════════════════════════════════════════════════════════════
     EXPORTS
     ═══════════════════════════════════════════════════════════════ */

  return {
    renderInto,
    renderPreset,
    update,
    isVisible,
    getSpec,
    registerPreset,
    getPresets,
    getPreset,
    PRESETS,
    ICONS
  };

})();

// ─── EXPOSE TO WINDOW ───────────────────────────────────────────────
window.EmptyStates = EmptyStates;
