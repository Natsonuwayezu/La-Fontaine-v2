/* ═══════════════════════════════════════════════════════════════════
   js/ui/sidebar.js — Sidebar controller
   ═══════════════════════════════════════════════════════════════════
   Renders the sidebar from NAV_SECTIONS (imported from config/navigation.js)
   into #app-sidebar, wires up group expand/collapse, the hub overlay
   (a section's label opens a full module-picker grid), the Year/Term
   badge dropdowns, and mobile open/close + desktop collapse.

   Selecting a year/term does NOT talk to the topbar directly — it
   dispatches `academicPeriodChanged` on document (Rule #9). Any module,
   not just the topbar, can listen for this to re-scope its data.

   Role filtering is applied via js/config/role-permissions.js before
   rendering.

   Last updated: 2026-07-14
   ═══════════════════════════════════════════════════════════════════ */

// NAV_SECTIONS, NAV_MODULE_INDEX, getNavLabel (config/navigation.js) and
// canAccess, canAccessDashboard (config/role-permissions.js) are plain-script
// globals, both loaded earlier in index.html — no import needed.
// NOTE: this file previously called a function named canAccessModule(), which
// doesn't exist in role-permissions.js — fixed below to use the real function, canAccess().

// ─── MOCK DATA ──────────────────────────────────────────────────────
// Replace with real data from core/data-loader.js
const YEAR_TERM_DATA = {
  '2025-2026': {
    locked: false,
    activeTerm: 'Term 3',
    lockedTerms: ['Term 1', 'Term 2'],
    progress: { 'Term 1': 100, 'Term 2': 100, 'Term 3': 68 },
    days: { 'Term 3': 24 }
  },
  '2026-2027': {
    locked: true,
    activeTerm: null,
    lockedTerms: ['Term 1', 'Term 2', 'Term 3'],
    progress: {},
    days: {}
  },
  '2027-2028': {
    locked: true,
    activeTerm: null,
    lockedTerms: ['Term 1', 'Term 2', 'Term 3'],
    progress: {},
    days: {}
  }
};

/* ═══════════════════════════════════════════════════════════════════
   STATE
   ═══════════════════════════════════════════════════════════════════ */

const sidebarState = {
  currentYear: '2025-2026',
  currentTerm: 'Term 3',
  openGroup: null,
  activeModule: 'admin-dashboard',
  role: 'admin' // Set by auth
};

/* ═══════════════════════════════════════════════════════════════════
   HELPERS
   ═══════════════════════════════════════════════════════════════════ */

/**
 * Create an element from HTML string
 */
function el(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

/**
 * Get the SVG for a locked icon (used in badge dots)
 */
function lockIconSvg() {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <rect x="4" y="10" width="16" height="10" rx="2"/>
        <path d="M8 10V7a4 4 0 0 1 8 0v3"/>
    </svg>`;
}

/**
 * Get the chevron SVG
 */
function chevronSvg() {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="6 9 12 15 18 9"/>
    </svg>`;
}

/* ═══════════════════════════════════════════════════════════════════
   RENDER FUNCTIONS
   ═══════════════════════════════════════════════════════════════════ */

/**
 * Main render — builds the entire sidebar
 */
function render() {
  const mount = document.getElementById('app-sidebar');
  if (!mount) return;

  // Filter sections by role
  const filteredSections = filterNavByRole();

  mount.innerHTML = `
        <div class="sidebar-header">
            <div class="school-brand">
                <div class="logo-box">
                    <svg viewBox="0 0 40 40" fill="none" stroke="currentColor" stroke-width="2">
                        <rect x="6" y="6" width="28" height="28" rx="4"/>
                        <path d="M12 12h16M12 18h16M12 24h10"/>
                    </svg>
                </div>
                <div class="brand-text">
                    <div class="brand-name">ECOLE LA FONTAINE</div>
                    <div class="brand-sub">School Management System</div>
                </div>
                <button class="sidebar-collapse-btn" id="sidebar-collapse-btn" title="Collapse sidebar" aria-label="Collapse sidebar">
                    ${chevronSvg()}
                </button>
            </div>
            <div class="badge-row" id="badge-row"></div>
        </div>
        <nav class="sidebar-nav" id="sidebar-nav"></nav>
        <div class="user-profile">
            <div class="user-avatar">UG</div>
            <div class="user-info">
                <div class="user-name">UWAYO GANZA Eugene</div>
                <div class="user-role">${sidebarState.role === 'admin' ? 'Administrator' : sidebarState.role === 'teacher' ? 'Teacher' : 'Accountant'}</div>
            </div>
            <div class="logout-btn" id="sidebar-logout-btn" title="Log out">
                <i class="fa-solid fa-right-from-bracket"></i>
            </div>
        </div>
    `;

  renderBadgeRow();
  renderNav(filteredSections);
  bindEvents();
}

/**
 * Filter navigation sections by the current user's role
 */
function filterNavByRole() {
  const filtered = {};

  Object.entries(NAV_SECTIONS).forEach(([sectionId, section]) => {
    const visibleItems = section.items.filter(item => {
      // Check if the role can access this module
      return canAccess(sidebarState.role, item.id);
    });

    if (visibleItems.length > 0) {
      filtered[sectionId] = {
        ...section,
        items: visibleItems
      };
    }
  });

  return filtered;
}

/**
 * Render the Year/Term badge row
 */
function renderBadgeRow() {
  const row = document.getElementById('badge-row');
  if (!row) return;

  const yearData = YEAR_TERM_DATA[sidebarState.currentYear];

  row.innerHTML = `
        <span class="badge-pill" id="year-pill">
            <span class="dot ${yearData.locked ? 'locked' : 'green'}">
                ${yearData.locked ? lockIconSvg() : ''}
            </span>
            <strong>${sidebarState.currentYear.replace('-', ' \u2013 ')}</strong>
            ${chevronSvg()}
        </span>
        <div class="badge-dropdown" id="year-dropdown">
            ${Object.keys(YEAR_TERM_DATA).map(y => `
                <div class="badge-dropdown-item ${y === sidebarState.currentYear ? 'active' : ''} ${YEAR_TERM_DATA[y].locked ? 'locked' : ''}" data-year="${y}">
                    <span>${y.replace('-', ' \u2013 ')}</span>
                    ${YEAR_TERM_DATA[y].locked ? '<i class="fa-solid fa-lock lock-icon"></i>' : ''}
                    <i class="fa-solid fa-check check"></i>
                </div>
            `).join('')}
        </div>

        <span class="badge-pill" id="term-pill">
            <span class="dot blue"></span>
            <strong>${sidebarState.currentTerm}</strong>
            ${chevronSvg()}
        </span>
        <div class="badge-dropdown" id="term-dropdown">
            ${['Term 1', 'Term 2', 'Term 3'].map(t => {
    const locked = yearData.lockedTerms.includes(t);
    return `
                    <div class="badge-dropdown-item ${t === sidebarState.currentTerm ? 'active' : ''} ${locked ? 'locked' : ''}" data-term="${t}">
                        <span>${t}</span>
                        ${locked ? '<i class="fa-solid fa-lock lock-icon"></i>' : ''}
                        <i class="fa-solid fa-check check"></i>
                    </div>
                `;
  }).join('')}
        </div>

        <button class="help-button" id="sidebar-help-btn">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round">
                <circle cx="12" cy="12" r="9"/>
                <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/>
                <circle cx="12" cy="17" r="0.5" fill="currentColor"/>
            </svg>
            <span class="tooltip">Help</span>
        </button>
    `;

  // Bind badge dropdown events
  document.getElementById('year-pill')?.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleBadgeDropdown('year-dropdown', 'year-pill');
  });

  document.getElementById('term-pill')?.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleBadgeDropdown('term-dropdown', 'term-pill');
  });

  document.getElementById('sidebar-help-btn')?.addEventListener('click', () => {
    if (window.Router) window.Router.navigate('help');
    closeBadgeDropdowns();
  });

  // Year dropdown items
  document.querySelectorAll('#year-dropdown [data-year]').forEach(item => {
    item.addEventListener('click', () => selectYear(item.dataset.year));
  });

  // Term dropdown items
  document.querySelectorAll('#term-dropdown [data-term]').forEach(item => {
    item.addEventListener('click', () => selectTerm(item.dataset.term));
  });
}

/**
 * Render the navigation tree
 * @param {object} filteredSections - Sections filtered by role
 */
function renderNav(filteredSections) {
  const nav = document.getElementById('sidebar-nav');
  if (!nav) return;

  const sections = Object.keys(filteredSections);

  // Build section labels
  const sectionLabels = sections.length > 0 ? `
        <div class="nav-section-label">${sidebarState.role === 'admin' ? 'Overview' : 'Main'}</div>
    ` : '';

  const groups = sections.map(id => {
    const sec = filteredSections[id];
    const isOpen = sidebarState.openGroup === id;

    return `
            <div class="nav-group ${isOpen ? 'open' : ''}" id="grp-${id}">
                <div class="nav-group-header ${isOpen ? 'open' : ''}" data-group="${id}">
                    <i class="fa-solid ${sec.icon}"></i>
                    <span class="label" data-hub="${id}">${sec.label}</span>
                    ${chevronSvg()}
                </div>
                <div class="nav-children ${isOpen ? 'open' : ''}" id="ch-${id}">
                    <div class="nav-children-inner">
                        ${sec.items.map(item => `
                            <div class="nav-child ${item.id === sidebarState.activeModule ? 'active' : ''}" data-module="${item.id}">
                                <span class="child-dot"></span>
                                <span class="child-label">${item.label}</span>
                                ${item.badge ? `<span class="child-badge">${item.badge}</span>` : ''}
                            </div>
                        `).join('')}
                    </div>
                </div>
            </div>
        `;
  }).join('');

  nav.innerHTML = sectionLabels + groups;

  // Bind group header clicks
  nav.querySelectorAll('.nav-group-header').forEach(header => {
    header.addEventListener('click', (e) => {
      if (e.target.closest('[data-hub]')) return;
      toggleGroup(header.dataset.group);
    });
  });

  // Bind hub label clicks (opens the hub overlay)
  nav.querySelectorAll('[data-hub]').forEach(label => {
    label.addEventListener('click', (e) => {
      e.stopPropagation();
      openHub(label.dataset.hub);
    });
  });

  // Bind nav child clicks
  nav.querySelectorAll('.nav-child').forEach(child => {
    child.addEventListener('click', () => navigate(child.dataset.module));
  });
}

/* ═══════════════════════════════════════════════════════════════════
   GROUP TOGGLE
   ═══════════════════════════════════════════════════════════════════ */

/**
 * Toggle a navigation group open/closed
 * @param {string} id - The group ID (e.g., 'dashboard', 'finance')
 */
function toggleGroup(id) {
  const header = document.querySelector(`#grp-${id} .nav-group-header`);
  const children = document.getElementById(`ch-${id}`);
  if (!header || !children) return;

  const isOpen = children.classList.contains('open');

  // Close previously open group
  if (sidebarState.openGroup && sidebarState.openGroup !== id) {
    const prevHeader = document.querySelector(`#grp-${sidebarState.openGroup} .nav-group-header`);
    const prevChildren = document.getElementById(`ch-${sidebarState.openGroup}`);
    if (prevHeader) prevHeader.classList.remove('open');
    if (prevChildren) prevChildren.classList.remove('open');
  }

  header.classList.toggle('open', !isOpen);
  children.classList.toggle('open', !isOpen);
  sidebarState.openGroup = isOpen ? null : id;
}

/* ═══════════════════════════════════════════════════════════════════
   HUB OVERLAY
   ═══════════════════════════════════════════════════════════════════ */

/**
 * Ensure the hub overlay exists in the DOM
 */
function ensureHubOverlay() {
  if (document.getElementById('hub-overlay')) return;

  document.body.insertAdjacentHTML('beforeend', `
        <div class="hub-overlay" id="hub-overlay">
            <div class="hub-panel">
                <div class="hub-header">
                    <div class="hub-header-icon" id="hub-header-icon"></div>
                    <div style="flex:1;min-width:0;">
                        <h2 id="hub-title">Section</h2>
                        <div class="hub-header-sub" id="hub-sub"></div>
                    </div>
                    <button class="hub-close" id="hub-close">
                        <i class="fa-solid fa-xmark"></i>
                    </button>
                </div>
                <div class="hub-body">
                    <div class="hub-grid" id="hub-grid"></div>
                </div>
            </div>
        </div>
    `);

  document.getElementById('hub-close')?.addEventListener('click', closeHub);
  document.getElementById('hub-overlay')?.addEventListener('click', (e) => {
    if (e.target.id === 'hub-overlay') closeHub();
  });
}

/**
 * Open the hub overlay for a specific section
 * @param {string} sectionId - The section key (e.g., 'dashboard', 'finance')
 */
function openHub(sectionId) {
  const sec = NAV_SECTIONS[sectionId];
  if (!sec) return;

  // Filter items by role
  const visibleItems = sec.items.filter(item => canAccess(sidebarState.role, item.id));
  if (visibleItems.length === 0) return;

  ensureHubOverlay();

  document.getElementById('hub-title').textContent = sec.label;
  document.getElementById('hub-sub').textContent = sec.desc;

  const iconEl = document.getElementById('hub-header-icon');
  iconEl.style.background = sec.bg || 'rgba(106, 138, 186, 0.12)';
  iconEl.style.color = sec.color || '#6a8aba';
  iconEl.innerHTML = `<i class="fa-solid ${sec.icon}"></i>`;

  const grid = document.getElementById('hub-grid');
  grid.innerHTML = visibleItems.map(item => `
        <div class="hub-card" data-module="${item.id}">
            <div class="hub-card-icon" style="background:${sec.bg || 'rgba(106, 138, 186, 0.12)'};color:${sec.color || '#6a8aba'}">
                <i class="fa-solid ${item.icon}"></i>
            </div>
            <div class="hub-card-title">${item.label}</div>
            <div class="hub-card-desc">${item.desc || ''}</div>
        </div>
    `).join('');

  grid.querySelectorAll('.hub-card').forEach(card => {
    card.addEventListener('click', () => {
      closeHub();
      navigate(card.dataset.module);
    });
  });

  document.getElementById('hub-overlay').classList.add('show');
  document.body.style.overflow = 'hidden';
}

/**
 * Close the hub overlay
 */
function closeHub() {
  document.getElementById('hub-overlay')?.classList.remove('show');
  document.body.style.overflow = '';
}

/* ═══════════════════════════════════════════════════════════════════
   BADGE DROPDOWNS
   ═══════════════════════════════════════════════════════════════════ */

/**
 * Toggle a badge dropdown open/closed
 * @param {string} dropdownId - The dropdown element ID
 * @param {string} pillId - The pill element ID
 */
function toggleBadgeDropdown(dropdownId, pillId) {
  // Close other open dropdowns
  document.querySelectorAll('.badge-dropdown.open').forEach(d => {
    if (d.id !== dropdownId) d.classList.remove('open');
  });
  document.querySelectorAll('.badge-pill.open').forEach(p => {
    if (p.id !== pillId) p.classList.remove('open');
  });

  document.getElementById(dropdownId)?.classList.toggle('open');
  document.getElementById(pillId)?.classList.toggle('open');
}

/**
 * Close all badge dropdowns
 */
function closeBadgeDropdowns() {
  document.querySelectorAll('.badge-dropdown.open').forEach(d => d.classList.remove('open'));
  document.querySelectorAll('.badge-pill.open').forEach(p => p.classList.remove('open'));
}

/**
 * Select a year from the dropdown
 * @param {string} year - The year key (e.g., '2025-2026')
 */
function selectYear(year) {
  const data = YEAR_TERM_DATA[year];
  sidebarState.currentYear = year;
  sidebarState.currentTerm = data.activeTerm || 'Term 1';
  renderBadgeRow();
  emitPeriodChange();
  closeBadgeDropdowns();
}

/**
 * Select a term from the dropdown
 * @param {string} term - The term name (e.g., 'Term 3')
 */
function selectTerm(term) {
  const data = YEAR_TERM_DATA[sidebarState.currentYear];
  sidebarState.currentTerm = term;
  renderBadgeRow();
  emitPeriodChange();
  closeBadgeDropdowns();
}

/**
 * Emit the academicPeriodChanged event
 */
function emitPeriodChange() {
  const data = YEAR_TERM_DATA[sidebarState.currentYear];
  const locked = data.locked || data.lockedTerms.includes(sidebarState.currentTerm);
  const progress = data.progress?.[sidebarState.currentTerm] ?? 0;
  const days = data.days?.[sidebarState.currentTerm] ?? null;

  document.dispatchEvent(new CustomEvent('academicPeriodChanged', {
    detail: {
      year: sidebarState.currentYear,
      term: sidebarState.currentTerm,
      locked,
      isActive: !locked && data.activeTerm === sidebarState.currentTerm,
      progress,
      daysRemaining: days
    }
  }));
}

/* ═══════════════════════════════════════════════════════════════════
   NAVIGATION
   ═══════════════════════════════════════════════════════════════════ */

/**
 * Navigate to a module
 * @param {string} moduleId - The module ID to navigate to
 */
function navigate(moduleId) {
  sidebarState.activeModule = moduleId;

  // Update active states
  document.querySelectorAll('.nav-child.active').forEach(e => e.classList.remove('active'));
  const activeChild = document.querySelector(`.nav-child[data-module="${moduleId}"]`);
  if (activeChild) activeChild.classList.add('active');

  // Use Router if available
  if (window.Router) {
    window.Router.navigate(moduleId);
  } else {
    console.log('[Sidebar] Navigate to:', moduleId);
  }

  closeMobileSidebar();
  closeBadgeDropdowns();
  closeHub();
}

/* ═══════════════════════════════════════════════════════════════════
   MOBILE SIDEBAR
   ═══════════════════════════════════════════════════════════════════ */

/**
 * Open the sidebar on mobile
 */
function openMobileSidebar() {
  document.getElementById('app-sidebar')?.classList.add('mobile-open');
  document.getElementById('sidebar-overlay-el')?.classList.add('show');
  document.body.style.overflow = 'hidden';
}

/**
 * Close the sidebar on mobile
 */
function closeMobileSidebar() {
  if (window.innerWidth > 820) return;
  document.getElementById('app-sidebar')?.classList.remove('mobile-open');
  document.getElementById('sidebar-overlay-el')?.classList.remove('show');
  document.body.style.overflow = '';
}

/**
 * Ensure the mobile overlay exists
 */
function ensureMobileOverlay() {
  if (document.getElementById('sidebar-overlay-el')) return;
  const overlay = el(`<div class="sidebar-overlay" id="sidebar-overlay-el"></div>`);
  document.body.appendChild(overlay);
  overlay.addEventListener('click', closeMobileSidebar);
}

/**
 * Toggle desktop sidebar collapse
 */
function toggleCollapse() {
  document.getElementById('app-sidebar')?.classList.toggle('collapsed');
}

/* ═══════════════════════════════════════════════════════════════════
   INITIALIZATION & EVENT BINDING
   ═══════════════════════════════════════════════════════════════════ */

/**
 * Bind all sidebar events
 */
function bindEvents() {
  // Collapse button
  document.getElementById('sidebar-collapse-btn')?.addEventListener('click', toggleCollapse);

  // Logout button
  document.getElementById('sidebar-logout-btn')?.addEventListener('click', () => {
    if (window.Auth) window.Auth.logout();
  });

  // Close dropdowns on outside click
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.badge-pill') && !e.target.closest('.badge-dropdown')) {
      closeBadgeDropdowns();
    }
  });

  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeMobileSidebar();
      closeHub();
      closeBadgeDropdowns();
    }
    // Ctrl+B or Cmd+B to toggle sidebar
    if ((e.ctrlKey || e.metaKey) && e.key === 'b') {
      e.preventDefault();
      if (window.innerWidth <= 820) {
        document.getElementById('app-sidebar')?.classList.toggle('mobile-open');
      } else {
        toggleCollapse();
      }
    }
  });

  // Window resize — close mobile sidebar on larger screens
  window.addEventListener('resize', () => {
    if (window.innerWidth > 820) closeMobileSidebar();
  });
}

/**
 * Initialize the sidebar
 * @param {string} role - The user's role ('admin', 'teacher', 'accountant')
 */
function init(role = 'admin') {
  sidebarState.role = role || 'admin';
  render();
  ensureMobileOverlay();

  // Set initial active module from localStorage or default
  const savedModule = localStorage.getItem('elf_active_module');
  if (savedModule && NAV_MODULE_INDEX[savedModule]) {
    sidebarState.activeModule = savedModule;
  }

  // Emit initial period change
  setTimeout(emitPeriodChange, 100);

  console.log('[Sidebar] Initialized with role:', sidebarState.role);
}

/* ═══════════════════════════════════════════════════════════════════
   PUBLIC API
   ═══════════════════════════════════════════════════════════════════ */

const Sidebar = {
  init,
  render,
  navigate,
  openMobileSidebar,
  closeMobileSidebar,
  toggleGroup,
  openHub,
  closeHub,
  selectYear,
  selectTerm,
  emitPeriodChange,
  getState: () => ({ ...sidebarState })
};

// ─── AUTO-INIT ──────────────────────────────────────────────────────

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => Sidebar.init());
} else {
  Sidebar.init();
}

// ─── EXPOSE ─────────────────────────────────────────────────────────

window.Sidebar = Sidebar;
// window-exposure.js's sanity check (and the boot.js convention used
// throughout this app) expects a bare window.renderSidebar — this was
// never aliased, only the Sidebar namespace itself was exposed.
window.renderSidebar = Sidebar.render;