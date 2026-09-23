'use strict';
/* ═══════════════════════════════════════════════════════════════
   boot.js — Entry point. Mirrors old single-file flow exactly.
   1. Show login page immediately — nothing else loads first.
   2. On login success → show boot loader → load data → show app.
   ═══════════════════════════════════════════════════════════════ */

async function boot() {
    console.log('[Boot] ECOLE LA FONTAINE starting...');

    // Apply saved theme
    const savedTheme = localStorage.getItem('lf_theme') || 'light';
    document.documentElement.setAttribute('data-theme', savedTheme);

    // Show login page immediately
    showLoginPage();

    // Check for existing valid session
    const saved = typeof loadSession === 'function' ? loadSession() : null;
    if (saved && saved.id !== undefined) {
        console.log('[Boot] Restoring session for:', saved.name);
        state.currentUser = saved;
        await bootApp(saved);
        return;
    }

    // No session — open the card after short delay
    setTimeout(() => {
        if (typeof openLoginCard === 'function') openLoginCard();
    }, 300);
}

// ── bootApp — called after login succeeds ────────────────────
async function bootApp(user) {
    const loginPage = document.getElementById('login-page');
    const bootEl    = document.getElementById('boot-loader');
    const appEl     = document.getElementById('app-shell');

    if (loginPage) loginPage.style.display = 'none';
    if (bootEl)    bootEl.style.display    = 'flex';
    if (appEl)     appEl.style.display     = 'none';

    _setBootMsg('Loading school settings...');
    _setBootProgress(10);

    try {
        // Phase 1: school settings + years + terms + classes (fast, parallel)
        const [settings, years, terms, classes, subjects, teachers] = await Promise.all([
            typeof getSchoolSettings === 'function'
                ? getSchoolSettings().catch(() => ({}))
                : Promise.resolve({}),
            getAll('academic_years').catch(() => []),
            getAll('terms').catch(() => []),
            getAll('classes', { is_active: true }).catch(() => []),
            getAll('subjects').catch(() => []),
            getAll('teachers', { is_active: true }).catch(() => []),
        ]);

        if (typeof updateStateBatch === 'function') {
            updateStateBatch({ schoolSettings: settings, academicYears: years,
                               terms, classes, subjects, teachers });
        } else {
            state.schoolSettings = settings;
            state.academicYears  = years;
            state.terms          = terms;
            state.classes        = classes;
            state.subjects       = subjects;
            state.teachers       = teachers;
        }

        _setBootProgress(40);
        _setBootMsg('Loading students and fees...');

        // Phase 2: students and finance data
        const [students, studentFees, payments, feeCategories,
               assessments, marks, attendance] = await Promise.all([
            getAll('students', { is_deleted: false }).catch(() => []),
            getAll('student_fees').catch(() => []),
            getAll('payments').catch(() => []),
            getAll('fee_categories').catch(() => []),
            getAll('assessments').catch(() => []),
            getAll('marks').catch(() => []),
            getAll('attendance').catch(() => []),
        ]);

        if (typeof updateStateBatch === 'function') {
            updateStateBatch({ students, studentFees, payments, feeCategories,
                               assessments, marks, attendance });
        } else {
            state.students      = students;
            state.studentFees   = studentFees;
            state.payments      = payments;
            state.feeCategories = feeCategories;
            state.assessments   = assessments;
            state.marks         = marks;
            state.attendance    = attendance;
        }

        _setBootProgress(80);
        _setBootMsg('Building interface...');

        // Apply role theme + build UI
        _applyRoleTheme(user.role);
        _buildSidebar(user.role);
        _updateTopbar(user);
        _updateProgressBar();

        _setBootProgress(100);

        // Show app
        if (bootEl) bootEl.style.display = 'none';
        if (appEl)  appEl.style.display  = '';

        // Navigate to home
        const home = { admin:'admin-dashboard', accountant:'accountant-dashboard',
                       teacher:'teacher-dashboard' }[user.role] || 'admin-dashboard';
        if (typeof navigateTo === 'function') navigateTo(home);

        console.log('[Boot] Ready.', user.role, '-', user.name);

    } catch (err) {
        console.error('[Boot] Error:', err.message);
        if (bootEl) bootEl.style.display = 'none';
        if (appEl)  appEl.style.display  = '';
        if (typeof showToast === 'function')
            showToast('Some data failed to load. Refresh to retry.', 'warning');
        _applyRoleTheme(user.role);
        _buildSidebar(user.role);
        _updateTopbar(user);
        const home = { admin:'admin-dashboard', accountant:'accountant-dashboard',
                       teacher:'teacher-dashboard' }[user.role] || 'admin-dashboard';
        if (typeof navigateTo === 'function') navigateTo(home);
    }
}

// ── Helpers ───────────────────────────────────────────────────
function _setBootMsg(msg) {
    const el = document.getElementById('boot-msg');
    if (el) el.textContent = msg;
}

function _setBootProgress(pct) {
    const el = document.getElementById('boot-progress');
    if (el) el.style.width = pct + '%';
}

function _applyRoleTheme(role) {
    document.body.className = document.body.className
        .replace(/\btheme-\w+/g, '').trim();
    document.body.classList.add('theme-' + role);
}

function _buildSidebar(role) {
    const nav = document.getElementById('sidebar-nav');
    if (!nav) return;
    const config = typeof getNavConfig === 'function'
        ? getNavConfig(role)
        : [{ section: 'Dashboard', items: [{ id: role + '-dashboard', icon: '📊', label: 'Dashboard' }] }];

    nav.innerHTML = config.map(section => `
        <div class="nav-section">
            <div class="nav-section-title" onclick="this.closest('.nav-section').classList.toggle('collapsed')">
                ${section.section}
                <span class="nav-section-arrow">▾</span>
            </div>
            <div class="nav-section-items">
                ${(section.items || []).map(item => `
                    <div class="nav-item" data-module="${item.id}"
                         onclick="navigateTo('${item.id}')">
                        <span class="nav-icon">${item.icon}</span>
                        <span>${item.label}</span>
                    </div>`).join('')}
            </div>
        </div>`).join('');

    // Update sidebar footer
    const u = state.currentUser || {};
    const av = document.getElementById('sidebar-avatar');
    const nm = document.getElementById('sidebar-username');
    const rl = document.getElementById('sidebar-userrole');
    if (av) av.textContent = (u.name || 'U')[0].toUpperCase();
    if (nm) nm.textContent = u.name || u.username || 'User';
    if (rl) rl.textContent = u.role || '';

    const s   = state.schoolSettings || {};
    const sub = document.getElementById('sidebar-school-subtitle');
    if (sub) sub.textContent = s.school_motto || 'School Portal';
    const logo = document.getElementById('sidebar-logo');
    if (logo && s.school_logo) {
        logo.innerHTML = `<img src="${s.school_logo}" alt="logo">`;
    }
}

function _updateTopbar(user) {
    const name    = user.name || user.username || 'User';
    const initial = name[0].toUpperCase();
    const fields  = {
        'topbar-avatar'   : initial,
        'topbar-username' : name,
        'dd-avatar'       : initial,
        'dd-name'         : name,
        'dd-role'         : user.role,
        'sidebar-avatar'  : initial,
        'sidebar-username': name,
        'sidebar-userrole': user.role,
    };
    for (const [id, val] of Object.entries(fields)) {
        const el = document.getElementById(id);
        if (el) el.textContent = val;
    }
}

function _updateProgressBar() {
    const today   = new Date();
    today.setHours(0, 0, 0, 0);
    const activeYear = (state.academicYears || []).find(y => y.is_current)
                    || (state.academicYears || [])[0];
    if (!activeYear) return;

    const yearTerms = (state.terms || []).filter(t => t.academic_year_id === activeYear.id);
    const active = yearTerms.find(t =>
        new Date(t.start_date) <= today && today <= new Date(t.end_date)
    ) || yearTerms[0];

    if (!active) {
        const yr = document.getElementById('prog-acad-year');
        if (yr) yr.textContent = activeYear.year_name || '';
        return;
    }

    const start     = new Date(active.start_date);
    const end       = new Date(active.end_date);
    const total     = Math.max(1, Math.round((end - start) / 86400000));
    const elapsed   = Math.min(total, Math.max(0, Math.round((today - start) / 86400000)));
    const remaining = Math.max(0, Math.round((end - today) / 86400000));
    const pct       = Math.min(100, Math.round((elapsed / total) * 100));

    const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    const setW = (id, val) => { const el = document.getElementById(id); if (el) el.style.width = val; };

    set('prog-term-name', active.term_label || 'Term ' + active.term_number);
    set('prog-text',      pct + '% complete');
    set('prog-days',      remaining > 0 ? remaining + ' days remaining' : 'Term ended');
    set('prog-acad-year', activeYear.year_name || '');
    setW('prog-fill', pct + '%');

    const badge = document.getElementById('period-badge');
    if (badge) badge.textContent = '📖 ' + (activeYear.year_name || '');
}

// ── UI helpers ────────────────────────────────────────────────
window.toggleUserDropdown = function() {
    document.getElementById('user-dropdown')?.classList.toggle('open');
};

window.toggleSidebar = function() {
    document.getElementById('sidebar')?.classList.toggle('mobile-open');
    document.getElementById('sidebar-overlay')?.classList.toggle('show');
};

document.addEventListener('click', e => {
    if (!e.target.closest('.user-menu') && !e.target.closest('#user-dropdown')) {
        document.getElementById('user-dropdown')?.classList.remove('open');
    }
});

// ── Active nav item highlighting ──────────────────────────────
function _setActiveNav(moduleId) {
    document.querySelectorAll('.nav-item').forEach(el => {
        el.classList.toggle('active', el.dataset.module === moduleId);
    });
    const item = document.querySelector(`.nav-item[data-module="${moduleId}"]`);
    if (item) {
        item.closest('.nav-section')?.classList.remove('collapsed');
        item.scrollIntoView({ block: 'nearest' });
    }
}

window.boot            = boot;
window.bootApp         = bootApp;
window._setActiveNav   = _setActiveNav;
window._updateProgressBar = _updateProgressBar;
window._buildSidebar   = _buildSidebar;
