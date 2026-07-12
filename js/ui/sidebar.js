/* ═══════════════════════════════════════════════════════════════════
   js/ui/sidebar.js — Sidebar controller
   ═══════════════════════════════════════════════════════════════════
   Renders the sidebar from NAV_SECTIONS (below) into #app-sidebar,
   wires up group expand/collapse, the hub overlay (a section's label
   opens a full module-picker grid), the Year/Term badge dropdowns, and
   mobile open/close + desktop collapse.

   Selecting a year/term does NOT talk to the topbar directly — it
   dispatches `academicPeriodChanged` on document (Rule #9). Any module,
   not just the topbar, can listen for this to re-scope its data.

   Real nav data will eventually come from js/config/navigation.js
   filtered by js/config/role-permissions.js for the signed-in role;
   NAV_SECTIONS here is the full admin-level structure as a starting
   point — swap the source once those two files exist.
   ═══════════════════════════════════════════════════════════════════ */

const Sidebar = (() => {

  const NAV_SECTIONS = {
    dashboard: {
      label: 'Dashboard', icon: 'grid', color: 'var(--accent)', bg: 'var(--accent-glow)',
      desc: 'Your central command center — role-specific dashboards and live school metrics.',
      items: [
        { id: 'admin-dashboard', label: 'Admin Dashboard', icon: 'fa-gauge-high', desc: 'School-wide overview, attendance today, recent activity' },
        { id: 'accountant-dashboard', label: 'Accountant Dashboard', icon: 'fa-chart-pie', desc: 'Collection rates, overdue alerts, today\u2019s payments' },
        { id: 'teacher-dashboard', label: 'Teacher Dashboard', icon: 'fa-table', desc: 'My classes, pending marks, next periods' },
        { id: 'analytics', label: 'Academic Analytics', icon: 'fa-chart-line', desc: 'Performance trends, subject analysis, grade distribution' },
        { id: 'finance-dashboard', label: 'Finance Dashboard', icon: 'fa-sack-dollar', desc: 'Real-time financial overview and fee status' }
      ]
    },
    comms: {
      label: 'Communication', icon: 'message-square', color: 'var(--accent)', bg: 'var(--accent-glow)',
      desc: 'Notifications, announcements, and personal reminders.',
      items: [
        { id: 'notifications', label: 'Notifications', icon: 'fa-bell', desc: 'System alerts, payment confirmations, marks updates', badge: 3 },
        { id: 'announcements', label: 'Announcements', icon: 'fa-bullhorn', desc: 'Publish school-wide announcements with read tracking' },
        { id: 'reminders', label: 'Reminders', icon: 'fa-clock', desc: 'Personal reminders with due dates' }
      ]
    },
    attendance: {
      label: 'Attendance', icon: 'check-square', color: 'var(--attendance-accent, #f59e0b)', bg: 'rgba(245,158,11,0.15)',
      desc: 'Record, monitor, and analyze daily attendance.',
      items: [
        { id: 'attendance', label: 'Record Attendance', icon: 'fa-pen-to-square', desc: 'Mark daily attendance in bulk' },
        { id: 'attendance-reports', label: 'Reports', icon: 'fa-file-lines', desc: 'By class and date range, export to Excel' },
        { id: 'attendance-summary', label: 'Summary', icon: 'fa-chart-bar', desc: 'Rates per student and class' },
        { id: 'attendance-analytics', label: 'Analytics', icon: 'fa-chart-line', desc: 'Trends and patterns over time' }
      ]
    },
    students: {
      label: 'Students', icon: 'users', color: 'var(--students-accent, #06b6d4)', bg: 'rgba(6,182,212,0.15)',
      desc: 'Manage the complete student lifecycle.',
      items: [
        { id: 'student-list', label: 'All Students', icon: 'fa-users', desc: 'Search, filter, and manage enrolled students' },
        { id: 'enroll-student', label: 'Enroll Student', icon: 'fa-user-plus', desc: 'Register new students with auto fee assignment' },
        { id: 'student-details', label: 'Student Profile', icon: 'fa-id-card', desc: 'Academic records, fee history, family info' },
        { id: 'family-management', label: 'Family Management', icon: 'fa-house-chimney-user', desc: 'Sibling linking and family discounts' },
        { id: 'student-archive', label: 'Archive', icon: 'fa-box-archive', desc: 'Graduated or transferred students' },
        { id: 'student-fee-status', label: 'Student Fee Status', icon: 'fa-coins', desc: 'Live balance view per student' }
      ]
    },
    academics: {
      label: 'Academics', icon: 'fa-graduation-cap', color: 'var(--academics-accent, #8b5cf6)', bg: 'rgba(139,92,246,0.15)',
      desc: 'Assessments, marks entry, registers, report cards, transcripts.',
      items: [
        { id: 'assessments', label: 'Assessments', icon: 'fa-clipboard-list', desc: 'Create and lock assessments by class/subject/term' },
        { id: 'marks-entry', label: 'Marks Entry', icon: 'fa-pencil', desc: 'Live-validated entry with batch save' },
        { id: 'marks-database', label: 'Marks Database', icon: 'fa-database', desc: 'Browse and edit marks across assessments' },
        { id: 'class-register', label: 'Class Register', icon: 'fa-table-list', desc: 'Pre/Post/Annual layouts, Nursery and Primary' },
        { id: 'report-cards', label: 'Report Cards', icon: 'fa-file-invoice', desc: 'Individual and batch generation with QR codes' },
        { id: 'transcripts', label: 'Transcripts', icon: 'fa-scroll', desc: 'Full academic history' },
        { id: 'statistics', label: 'Statistics', icon: 'fa-chart-pie', desc: 'Compare performance by subject, class, term' }
      ]
    },
    finance: {
      label: 'Finance', icon: 'fa-sack-dollar', color: 'var(--finance-accent, #10b981)', bg: 'rgba(16,185,129,0.15)',
      desc: 'Fee collection, receipts, waivers, overdue alerts, reporting.',
      items: [
        { id: 'finance-dashboard', label: 'Finance Dashboard', icon: 'fa-chart-column', desc: 'Collection rates and recent payments' },
        { id: 'fee-structure', label: 'Fee Structure', icon: 'fa-list-ol', desc: 'Fee categories and amounts per class/year' },
        { id: 'record-payment', label: 'Record Payment', icon: 'fa-money-bill-wave', desc: 'FIFO auto-allocation, instant receipt' },
        { id: 'payment-history', label: 'Payment History', icon: 'fa-clock-rotate-left', desc: 'Filter by student, class, date, method' },
        { id: 'receipts', label: 'Receipts', icon: 'fa-receipt', desc: 'Print, reprint, export' },
        { id: 'fee-waivers', label: 'Waivers / Discounts', icon: 'fa-tag', desc: 'With reason and audit trail' },
        { id: 'payment-reversals', label: 'Reversals', icon: 'fa-rotate-left', desc: 'Reverse with balance recalculation' },
        { id: 'finance-audit', label: 'Finance Audit', icon: 'fa-magnifying-glass-chart', desc: 'Audit trail for all transactions' },
        { id: 'family-fee-summary', label: 'Family Fee Summary', icon: 'fa-users-rectangle', desc: 'By family group' }
      ]
    },
    staff: {
      label: 'Staff', icon: 'fa-chalkboard-user', color: 'var(--staff-accent, #f43f5e)', bg: 'rgba(244,63,94,0.15)',
      desc: 'Staff accounts, assignments, performance, master timetable.',
      items: [
        { id: 'user-management', label: 'User Management', icon: 'fa-users-gear', desc: 'Teacher/accountant accounts and roles' },
        { id: 'class-management', label: 'Class / Subjects', icon: 'fa-book', desc: 'Class names, levels, class teacher assignment' },
        { id: 'teacher-assignments', label: 'Teacher Assignments', icon: 'fa-person-chalkboard', desc: 'Visual matrix view' },
        { id: 'teacher-performance', label: 'Teacher Performance', icon: 'fa-chart-line', desc: 'Completion rates and class averages' },
        { id: 'timetable', label: 'Timetable', icon: 'fa-calendar-days', desc: 'Master grid with conflict detection' }
      ]
    },
    bulk: {
      label: 'Bulk Operations', icon: 'fa-layer-group', color: 'var(--topbar-text-dim)', bg: 'rgba(148,163,184,0.12)',
      desc: 'Mass import/export and year-end workflows.',
      items: [
        { id: 'bulk-import', label: 'Bulk Import', icon: 'fa-file-import', desc: 'Students, marks, payments, teachers' },
        { id: 'bulk-export', label: 'Bulk Export', icon: 'fa-file-export', desc: 'Excel/JSON, full DB backup' },
        { id: 'student-promotion', label: 'Student Promotion', icon: 'fa-arrow-up-right-dots', desc: 'Promote or repeat, batch processing' },
        { id: 'carry-forward', label: 'Carry Forward', icon: 'fa-forward', desc: 'Outstanding balances to next term/year' }
      ]
    },
    settings: {
      label: 'Settings', icon: 'fa-gear', color: 'var(--topbar-text-dim)', bg: 'rgba(100,116,139,0.12)',
      desc: 'School profile, academic years, grading rules, maintenance.',
      items: [
        { id: 'school-settings', label: 'School Settings', icon: 'fa-school', desc: 'Name, logo, head teacher, contact details' },
        { id: 'academic-calendar', label: 'Academic Calendar', icon: 'fa-calendar', desc: 'Years, terms, midterm dates' },
        { id: 'grading-scale', label: 'Grading Settings', icon: 'fa-star-half-stroke', desc: 'Grade boundaries, colors, pass mark' },
        { id: 'backup-restore', label: 'Backup & Restore', icon: 'fa-hard-drive', desc: 'Full DB backup, auto-schedule, restore' },
        { id: 'system-logs', label: 'System Logs', icon: 'fa-list-check', desc: 'Audit trail of user actions' },
        { id: 'system-health', label: 'System Health', icon: 'fa-heart-pulse', desc: 'App performance and connectivity' }
      ]
    }
  };

  // Mock — replace with real academic-years data from core/data-loader.js
  const YEAR_TERM_DATA = {
    '2025-2026': { locked: false, activeTerm: 'Term 3', lockedTerms: ['Term 1', 'Term 2'], progress: { 'Term 1': 100, 'Term 2': 100, 'Term 3': 68 }, days: { 'Term 3': 24 } },
    '2026-2027': { locked: true, activeTerm: null, lockedTerms: ['Term 1', 'Term 2', 'Term 3'], progress: {}, days: {} },
    '2027-2028': { locked: true, activeTerm: null, lockedTerms: ['Term 1', 'Term 2', 'Term 3'], progress: {}, days: {} }
  };

  let state = {
    currentYear: '2025-2026',
    currentTerm: 'Term 3',
    openGroup: null,
    activeModule: 'admin-dashboard'
  };

  function el(html) {
    const t = document.createElement('template');
    t.innerHTML = html.trim();
    return t.content.firstElementChild;
  }

  // ── Rendering ────────────────────────────────────────────────────
  function render() {
    const mount = document.getElementById('app-sidebar');
    if (!mount) return;

    mount.innerHTML = `
      <div class="sidebar-header">
        <div class="school-brand">
          <div class="logo-box">
            <svg viewBox="0 0 40 40"><path d="M8 8h6v22h12v5H8V8zm20 0h13v5h-9v7h8v5h-8v10h-4V8z"/></svg>
          </div>
          <div class="brand-text">
            <div class="brand-name">ECOLE LA FONTAINE</div>
            <div class="brand-sub">School Management System</div>
          </div>
          <button class="sidebar-collapse-btn" id="sidebar-collapse-btn" title="Collapse sidebar" aria-label="Collapse sidebar">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
        </div>
        <div class="badge-row" id="badge-row"></div>
      </div>
      <nav class="sidebar-nav" id="sidebar-nav"></nav>
      <div class="user-profile">
        <div class="user-avatar">UG</div>
        <div class="user-info">
          <div class="user-name">UWAYO GANZA Eugene</div>
          <div class="user-role">Head Teacher</div>
        </div>
        <div class="logout-btn" id="sidebar-logout-btn" title="Log out">
          <i class="fa-solid fa-right-from-bracket"></i>
        </div>
      </div>
    `;

    renderBadgeRow();
    renderNav();
  }

  function renderBadgeRow() {
    const row = document.getElementById('badge-row');
    if (!row) return;
    const yearData = YEAR_TERM_DATA[state.currentYear];

    row.innerHTML = `
      <span class="badge-pill" id="year-pill">
        <span class="dot ${yearData.locked ? 'locked' : 'green'}">
          ${yearData.locked ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="4" y="10" width="16" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>' : ''}
        </span>
        <strong>${state.currentYear.replace('-', ' \u2013 ')}</strong>
        <svg class="badge-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>
      </span>
      <div class="badge-dropdown" id="year-dropdown">
        ${Object.keys(YEAR_TERM_DATA).map(y => `
          <div class="badge-dropdown-item ${y === state.currentYear ? 'active' : ''} ${YEAR_TERM_DATA[y].locked ? 'locked' : ''}" data-year="${y}">
            <span>${y.replace('-', ' \u2013 ')}</span>
            ${YEAR_TERM_DATA[y].locked ? '<i class="fa-solid fa-lock lock-icon"></i>' : ''}
            <i class="fa-solid fa-check check"></i>
          </div>
        `).join('')}
      </div>
      <span class="badge-pill" id="term-pill">
        <span class="dot blue"></span>
        <strong>${state.currentTerm}</strong>
        <svg class="badge-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>
      </span>
      <div class="badge-dropdown" id="term-dropdown">
        ${['Term 1', 'Term 2', 'Term 3'].map(t => {
          const locked = yearData.lockedTerms.includes(t);
          return `
            <div class="badge-dropdown-item ${t === state.currentTerm ? 'active' : ''} ${locked ? 'locked' : ''}" data-term="${t}">
              <span>${t}</span>
              ${locked ? '<i class="fa-solid fa-lock lock-icon"></i>' : ''}
              <i class="fa-solid fa-check check"></i>
            </div>`;
        }).join('')}
      </div>
      <button class="help-button" id="sidebar-help-btn">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><circle cx="12" cy="17" r="0.5" fill="currentColor"/></svg>
        <span class="tooltip">Help</span>
      </button>
    `;

    document.getElementById('year-pill').addEventListener('click', () => toggleBadgeDropdown('year-dropdown', 'year-pill'));
    document.getElementById('term-pill').addEventListener('click', () => toggleBadgeDropdown('term-dropdown', 'term-pill'));
    document.getElementById('sidebar-help-btn').addEventListener('click', () => {
      if (window.Router) window.Router.navigate('help');
    });

    row.querySelectorAll('#year-dropdown [data-year]').forEach(item => {
      item.addEventListener('click', () => selectYear(item.dataset.year));
    });
    row.querySelectorAll('#term-dropdown [data-term]').forEach(item => {
      item.addEventListener('click', () => selectTerm(item.dataset.term));
    });
  }

  function renderNav() {
    const nav = document.getElementById('sidebar-nav');
    if (!nav) return;

    const groups = Object.entries(NAV_SECTIONS).map(([id, sec]) => `
      <div class="nav-group" id="grp-${id}">
        <div class="nav-group-header" data-group="${id}">
          <i class="fa-solid ${sec.icon.startsWith('fa-') ? sec.icon : 'fa-circle'}"></i>
          <span class="label" data-hub="${id}">${sec.label}</span>
          <svg class="nav-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="9 18 15 12 9 6"/></svg>
        </div>
        <div class="nav-children" id="ch-${id}">
          <div class="nav-children-inner">
            ${sec.items.map(item => `
              <div class="nav-child ${item.id === state.activeModule ? 'active' : ''}" data-module="${item.id}">
                <span class="child-dot"></span>
                <span class="child-label">${item.label}</span>
                ${item.badge ? `<span class="child-badge">${item.badge}</span>` : ''}
              </div>
            `).join('')}
          </div>
        </div>
      </div>
    `).join('');

    nav.innerHTML = `
      <div class="nav-section-label">Overview</div>
      ${groups}
    `;

    nav.querySelectorAll('.nav-group-header').forEach(header => {
      header.addEventListener('click', (e) => {
        if (e.target.closest('[data-hub]')) return; // handled separately below
        toggleGroup(header.dataset.group);
      });
    });
    nav.querySelectorAll('[data-hub]').forEach(label => {
      label.addEventListener('click', (e) => {
        e.stopPropagation();
        openHub(label.dataset.hub);
      });
    });
    nav.querySelectorAll('.nav-child').forEach(child => {
      child.addEventListener('click', () => navigate(child.dataset.module));
    });
  }

  // ── Group expand/collapse ───────────────────────────────────────
  function toggleGroup(id) {
    const header = document.querySelector(`#grp-${id} .nav-group-header`);
    const children = document.getElementById(`ch-${id}`);
    if (!header || !children) return;
    const isOpen = children.classList.contains('open');

    if (state.openGroup && state.openGroup !== id) {
      document.querySelector(`#grp-${state.openGroup} .nav-group-header`)?.classList.remove('open');
      document.getElementById(`ch-${state.openGroup}`)?.classList.remove('open');
    }
    header.classList.toggle('open', !isOpen);
    children.classList.toggle('open', !isOpen);
    state.openGroup = isOpen ? null : id;
  }

  // ── Hub overlay ──────────────────────────────────────────────────
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
            <button class="hub-close" id="hub-close"><i class="fa-solid fa-xmark"></i></button>
          </div>
          <div class="hub-body"><div class="hub-grid" id="hub-grid"></div></div>
        </div>
      </div>
    `);
    document.getElementById('hub-close').addEventListener('click', closeHub);
    document.getElementById('hub-overlay').addEventListener('click', (e) => {
      if (e.target.id === 'hub-overlay') closeHub();
    });
  }

  function openHub(sectionId) {
    const sec = NAV_SECTIONS[sectionId];
    if (!sec) return;
    ensureHubOverlay();

    document.getElementById('hub-title').textContent = sec.label;
    document.getElementById('hub-sub').textContent = sec.desc;
    const iconEl = document.getElementById('hub-header-icon');
    iconEl.style.background = sec.bg;
    iconEl.style.color = sec.color;
    iconEl.innerHTML = `<i class="fa-solid ${sec.icon.startsWith('fa-') ? sec.icon : 'fa-circle'}"></i>`;

    const grid = document.getElementById('hub-grid');
    grid.innerHTML = sec.items.map(item => `
      <div class="hub-card" data-module="${item.id}">
        <div class="hub-card-icon" style="background:${sec.bg};color:${sec.color}">
          <i class="fa-solid ${item.icon}"></i>
        </div>
        <div class="hub-card-title">${item.label}</div>
        <div class="hub-card-desc">${item.desc}</div>
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

  function closeHub() {
    document.getElementById('hub-overlay')?.classList.remove('show');
    document.body.style.overflow = '';
  }

  // ── Badge dropdowns ─────────────────────────────────────────────
  function toggleBadgeDropdown(dropdownId, pillId) {
    document.querySelectorAll('.badge-dropdown.open').forEach(d => {
      if (d.id !== dropdownId) d.classList.remove('open');
    });
    document.querySelectorAll('.badge-pill.open').forEach(p => {
      if (p.id !== pillId) p.classList.remove('open');
    });
    document.getElementById(dropdownId)?.classList.toggle('open');
    document.getElementById(pillId)?.classList.toggle('open');
  }

  function closeBadgeDropdowns() {
    document.querySelectorAll('.badge-dropdown.open').forEach(d => d.classList.remove('open'));
    document.querySelectorAll('.badge-pill.open').forEach(p => p.classList.remove('open'));
  }

  function selectYear(year) {
    const data = YEAR_TERM_DATA[year];
    state.currentYear = year;
    state.currentTerm = data.activeTerm || 'Term 1';
    renderBadgeRow();
    emitPeriodChange();
  }

  function selectTerm(term) {
    const data = YEAR_TERM_DATA[state.currentYear];
    if (data.lockedTerms.includes(term) && term !== data.activeTerm) {
      // still allow viewing a locked/completed term read-only (Section 3.1) —
      // just don't treat it as the active editable term
    }
    state.currentTerm = term;
    renderBadgeRow();
    emitPeriodChange();
  }

  function emitPeriodChange() {
    const data = YEAR_TERM_DATA[state.currentYear];
    const locked = data.locked || data.lockedTerms.includes(state.currentTerm);
    const progress = data.progress?.[state.currentTerm] ?? 0;
    const days = data.days?.[state.currentTerm] ?? null;

    document.dispatchEvent(new CustomEvent('academicPeriodChanged', {
      detail: {
        year: state.currentYear,
        term: state.currentTerm,
        locked,
        isActive: !locked && data.activeTerm === state.currentTerm,
        progress,
        daysRemaining: days
      }
    }));
  }

  // ── Navigation ───────────────────────────────────────────────────
  function navigate(moduleId) {
    state.activeModule = moduleId;
    document.querySelectorAll('.nav-child.active').forEach(e => e.classList.remove('active'));
    document.querySelector(`.nav-child[data-module="${moduleId}"]`)?.classList.add('active');
    if (window.Router) {
      window.Router.navigate(moduleId);
    }
    closeMobileSidebar();
  }

  // ── Mobile + collapse ────────────────────────────────────────────
  function openMobileSidebar() {
    document.getElementById('app-sidebar')?.classList.add('mobile-open');
    document.getElementById('sidebar-overlay-el')?.classList.add('show');
    document.body.style.overflow = 'hidden';
  }

  function closeMobileSidebar() {
    if (window.innerWidth > 820) return;
    document.getElementById('app-sidebar')?.classList.remove('mobile-open');
    document.getElementById('sidebar-overlay-el')?.classList.remove('show');
    document.body.style.overflow = '';
  }

  function ensureMobileOverlay() {
    if (document.getElementById('sidebar-overlay-el')) return;
    const overlay = el(`<div class="sidebar-overlay" id="sidebar-overlay-el"></div>`);
    document.body.appendChild(overlay);
    overlay.addEventListener('click', closeMobileSidebar);
  }

  function toggleCollapse() {
    document.getElementById('app-sidebar')?.classList.toggle('collapsed');
  }

  function init() {
    render();
    ensureMobileOverlay();

    document.getElementById('sidebar-collapse-btn')?.addEventListener('click', toggleCollapse);
    document.getElementById('sidebar-logout-btn')?.addEventListener('click', () => {
      if (window.Auth) window.Auth.logout();
    });

    document.addEventListener('click', (e) => {
      if (!e.target.closest('.badge-pill') && !e.target.closest('.badge-dropdown')) {
        closeBadgeDropdowns();
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { closeMobileSidebar(); closeHub(); }
    });

    window.addEventListener('resize', () => {
      if (window.innerWidth > 820) closeMobileSidebar();
    });

    // Fire once on load so listeners (topbar, modules) get the initial period
    emitPeriodChange();
  }

  return { init, openMobileSidebar, closeMobileSidebar, navigate };
})();

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', Sidebar.init);
} else {
  Sidebar.init();
}
