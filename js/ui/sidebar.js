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

// ─── REAL DATA HELPERS ──────────────────────────────────────────────
// Year/term data derived from state (loaded by data-loader.js)

function _sidebarGetYears() {
  return (state.academicYears || [])
    .slice()
    .sort((a, b) => (b.year_name || '').localeCompare(a.year_name || ''));
}

function _sidebarGetTermsForYear(yearId) {
  return (state.terms || [])
    .filter(t => t.academic_year_id === yearId)
    .sort((a, b) => a.term_number - b.term_number);
}

function _sidebarGetHolidaySessionsForYear(yearId) {
  return (state.holidaySessions || [])
    .filter(s => s.academic_year_id === yearId)
    .sort((a, b) => (a.after_term_number||0) - (b.after_term_number||0));
}

/* ═══════════════════════════════════════════════════════════════════
   STATE
   ═══════════════════════════════════════════════════════════════════ */

const sidebarState = {
  currentYearId : null,   // academic_year_id (integer)
  currentTermId : null,   // term id in normal mode, holiday_session_id in holiday mode
  openGroup     : null,
  activeModule  : 'admin-dashboard',
  role          : 'admin',
  periodMode    : 'normal', // 'normal' | 'holiday' — mirrors state.periodMode
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

  // ── Resolve current year/term from state ──────────────────────────
  const inHoliday = typeof isHolidayMode === 'function' && isHolidayMode();
  sidebarState.periodMode = inHoliday ? 'holiday' : 'normal';

  // Sync yearId with state
  if (!sidebarState.currentYearId) {
    const activeYear = typeof getActiveYear === 'function' ? getActiveYear() : null;
    sidebarState.currentYearId = activeYear?.id || null;
  }
  const years = _sidebarGetYears();
  const currentYear = years.find(y => y.id === sidebarState.currentYearId) || years[0];
  if (currentYear) sidebarState.currentYearId = currentYear.id;

  // Sync termId
  const terms    = _sidebarGetTermsForYear(sidebarState.currentYearId);
  const sessions = _sidebarGetHolidaySessionsForYear(sidebarState.currentYearId);

  if (!sidebarState.currentTermId) {
    if (inHoliday) {
      const activeSess = typeof getActiveHolidaySession === 'function' ? getActiveHolidaySession() : null;
      sidebarState.currentTermId = activeSess?.id || sessions[0]?.id || null;
    } else {
      const activeTerm = typeof getActiveTerm === 'function' ? getActiveTerm() : null;
      sidebarState.currentTermId = activeTerm?.id || terms[0]?.id || null;
    }
  }

  const currentTerm    = terms.find(t => t.id === sidebarState.currentTermId);
  const currentSession = sessions.find(s => s.id === sidebarState.currentTermId);

  // Build year pill label
  const yearLabel = currentYear?.year_name || '—';

  // Build term/session pill label
  let termLabel;
  if (inHoliday) {
    termLabel = currentSession
      ? (currentSession.icon||'🏖️') + ' ' + (currentSession.name || 'Holiday')
      : '— Holiday —';
  } else {
    termLabel = currentTerm ? `Term ${currentTerm.term_number}` : '— Term —';
  }

  // Build year dropdown options
  const yearOptions = years.map(y => `
    <div class="badge-dropdown-item ${y.id === sidebarState.currentYearId ? 'active' : ''}"
         data-year-id="${y.id}" onclick="sidebarSelectYear(${y.id})">
      ${esc(y.year_name)}
      ${y.id === (typeof getActiveYear === 'function' ? getActiveYear()?.id : null) ? ' ●' : ''}
    </div>`).join('');

  // Build term/session dropdown options
  let termOptions;
  if (inHoliday) {
    termOptions = sessions.length
      ? sessions.map(s => `
        <div class="badge-dropdown-item ${s.id === sidebarState.currentTermId ? 'active' : ''}"
             data-session-id="${s.id}" onclick="sidebarSelectSession(${s.id})">
          ${esc(s.icon||'🏖️')} ${esc(s.name||'Holiday')}
          ${s.status === 'active' ? ' ●' : ''}
        </div>`).join('')
      : '<div class="badge-dropdown-item" style="color:var(--text-muted);">No holiday sessions</div>';
  } else {
    termOptions = terms.length
      ? terms.map(t => {
          const progress = t.status === 'completed' ? 100
            : t.status === 'active' ? 65 : 0;
          return `
        <div class="badge-dropdown-item ${t.id === sidebarState.currentTermId ? 'active' : ''} ${t.status === 'completed' ? 'locked' : ''}"
             data-term-id="${t.id}" onclick="sidebarSelectTerm(${t.id})">
          Term ${t.term_number}
          <span class="term-status-dot ${t.status}">${t.status === 'completed' ? '🔒' : t.status === 'active' ? '●' : '○'}</span>
        </div>`}).join('')
      : '<div class="badge-dropdown-item" style="color:var(--text-muted);">No terms</div>';
  }

  // ── Holiday mode indicator ─────────────────────────────────────
  const holidayBadge = inHoliday
    ? `<div class="sidebar-holiday-indicator">🏖️ Holiday Mode</div>`
    : '';

  // NOTE: yearData was previously from YEAR_TERM_DATA mock — now from real state
  const _yearData_compat = { locked: false };

  row.innerHTML = `
        ${holidayBadge}
        <span class="badge-pill" id="year-pill">
            <span class="dot green">
                
            </span>
            <strong>${sidebarState.currentYear.replace('-', ' \u2013 ')}</strong>
            ${chevronSvg()}
        </span>
        <div class="badge-dropdown" id="year-dropdown">
            ${yearOptions}
        </div>
            `).join('')}
        </div>

        <span class="badge-pill" id="term-pill">
            <span class="dot ${inHoliday?'amber':'blue'}"></span>
            <strong>${termLabel}</strong>
            ${chevronSvg()}
        </span>
        <div class="badge-dropdown" id="term-dropdown">
            ${termOptions}
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
    navigateTo('help-center');
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
/**
 * Get filtered nav sections — applies role permissions + holiday mode nav swap.
 * In holiday mode, academic items are replaced with their holiday equivalents.
 */
function _getFilteredSections() {
  const inHoliday = sidebarState.periodMode === 'holiday' ||
    (typeof isHolidayMode === 'function' && isHolidayMode());

  // Get base sections from navigation config
  const all = typeof NAV_SECTIONS !== 'undefined' ? NAV_SECTIONS : {};

  // Apply role filtering
  const filtered = {};
  for (const [key, sec] of Object.entries(all)) {
    if (sec.roles && !sec.roles.includes(sidebarState.role)) continue;
    const items = (sec.items||[]).filter(item=>
      typeof canAccess !== 'function' || canAccess(item.id, sidebarState.role)
    );
    if (items.length === 0 && key !== 'dashboard') continue;

    if (inHoliday) {
      // In holiday mode: swap academic items for holiday equivalents
      const swapMap = {
        'marks-entry'    : { id:'holidays-marks',      label:'Holiday Marks Entry',   icon:'fa-book-open' },
        'marks-database' : { id:'holidays-marks',      label:'Holiday Marks Register', icon:'fa-table-cells' },
        'class-register' : { id:'holidays-marks',      label:'Holiday Class Register', icon:'fa-list-check' },
        'assessments'    : { id:'holidays-enrollment', label:'Holiday Enrollment',    icon:'fa-user-plus' },
        'report-cards'   : { id:'holidays-marks',      label:'Holiday Reports',        icon:'fa-file-lines' },
        'rankings'       : { id:'holidays-marks',      label:'Holiday Rankings',       icon:'fa-trophy' },
      };
      const swappedItems = items.map(item => swapMap[item.id]
        ? { ...item, ...swapMap[item.id] }
        : item
      );
      // Deduplicate swapped items
      const seen = new Set();
      filtered[key] = { ...sec, items: swappedItems.filter(i=>{
        if(seen.has(i.id)) return false; seen.add(i.id); return true;
      })};
    } else {
      filtered[key] = { ...sec, items };
    }
  }
  return filtered;
}

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
  // Support both string name and numeric ID
  const yr = (state.academicYears||[]).find(y=>y.year_name===year||y.id===parseInt(year));
  if (yr) sidebarState.currentYearId = yr.id;
  sidebarState.currentTermId = null;
  renderBadgeRow();
  emitPeriodChange();
  closeBadgeDropdowns();
}

function sidebarSelectYear(yearId) {
  sidebarState.currentYearId = yearId;
  sidebarState.currentTermId = null;
  renderBadgeRow();
  renderNav(_getFilteredSections());
  emitPeriodChange();
  closeBadgeDropdowns();
}

/**
 * Select a term from the dropdown
 * @param {string} term - The term name (e.g., 'Term 3')
 */
function selectTerm(term) {
  const t = (state.terms||[]).find(t=>`Term ${t.term_number}`===term||t.id===parseInt(term));
  if (t) sidebarState.currentTermId = t.id;
  renderBadgeRow();
  emitPeriodChange();
  closeBadgeDropdowns();
}

function sidebarSelectTerm(termId) {
  sidebarState.currentTermId = termId;
  sidebarState.periodMode    = 'normal';
  if (typeof deactivateHolidayMode === 'function') deactivateHolidayMode();
  renderBadgeRow();
  renderNav(_getFilteredSections());
  emitPeriodChange();
  closeBadgeDropdowns();
}

function sidebarSelectSession(sessionId) {
  sidebarState.currentTermId = sessionId;
  sidebarState.periodMode    = 'holiday';
  const s = (state.holidaySessions||[]).find(s=>s.id===sessionId);
  if (s && typeof activateHolidayMode === 'function') activateHolidayMode(s);
  if (typeof loadDataForHolidaySession === 'function') loadDataForHolidaySession(sessionId);
  renderBadgeRow();
  renderNav(_getFilteredSections());
  emitPeriodChange();
  closeBadgeDropdowns();
  if (typeof TopbarPeriod !== 'undefined') TopbarPeriod.refresh();
}

/**
 * Emit the academicPeriodChanged event
 */
function emitPeriodChange() {
  const inHoliday = sidebarState.periodMode === 'holiday';
  const currentYear = (state.academicYears||[]).find(y=>y.id===sidebarState.currentYearId);
  const currentTerm = (state.terms||[]).find(t=>t.id===sidebarState.currentTermId);
  const currentSession = (state.holidaySessions||[]).find(s=>s.id===sidebarState.currentTermId);
  const locked = currentTerm?.status === 'completed' || false;
  // Legacy compat
  const data = { locked, lockedTerms: [] };
  const _locked_compat = locked; // used below
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
    navigateTo(moduleId);
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

window.sidebarSelectYear    = sidebarSelectYear;
window.sidebarSelectTerm    = sidebarSelectTerm;
window.sidebarSelectSession = sidebarSelectSession;
