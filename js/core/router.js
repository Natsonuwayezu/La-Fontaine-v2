/* ═══════════════════════════════════════════════════════════════════
   js/core/router.js
   ═══════════════════════════════════════════════════════════════════
   Purpose : Client-side router. navigateTo(moduleId) is the single
             entry point for all navigation in the app.
             Handles: role-gating, holiday banner injection,
             module file loading (lazy), active nav highlight,
             module-level skeleton while loading, and browser history.
   References: backend.txt Part 3.2, Part 10.3
   Load order: AFTER auth.js, permissions.js, ui/sidebar.js.
   ═══════════════════════════════════════════════════════════════════ */

'use strict';

/* ─────────────────────────────────────────────────────────────────
   MODULE FILE MAP
   Maps every moduleId to the JS file path that exports its render
   function. The render function must be named render<PascalCase>()
   and exposed on window.
   ───────────────────────────────────────────────────────────────── */

const MODULE_FILE_MAP = {
    // Dashboard
    'admin-dashboard': 'js/modules/dashboard/admin-dashboard.js',
    'accountant-dashboard': 'js/modules/dashboard/accountant-dashboard.js',
    'teacher-dashboard': 'js/modules/dashboard/teacher-dashboard.js',

    // Attendance
    'attendance-entry': 'js/modules/attendance/attendance-entry.js',
    'attendance-reports': 'js/modules/attendance/attendance-reports.js',
    'attendance-summary': 'js/modules/attendance/attendance-summary.js',
    'attendance-analytics': 'js/modules/attendance/attendance-analytics.js',

    // Students
    'student-list': ['js/modules/bulk/bulk-student-actions.js', 'js/modules/students/student-list.js'],
    'enroll-student': 'js/modules/students/enroll-student.js',
    'student-details': 'js/modules/students/student-details.js',
    'student-profile': 'js/modules/students/student-profile.js',
    'family-management': 'js/modules/students/family-management.js',
    'sibling-linking': 'js/modules/students/sibling-linking.js',
    'student-promotion': 'js/modules/students/student-promotion.js',
    'student-archive': 'js/modules/students/student-archive.js',

    // Academics
    'marks-entry': 'js/modules/academics/marks-entry.js',
    'marks-database': 'js/modules/academics/marks-database.js',
    'marks-analysis': 'js/modules/academics/marks-analysis.js',
    'marks-import-export': 'js/modules/academics/marks-import-export.js',
    'assessments': 'js/modules/academics/assessments.js',
    'assessment-locking': 'js/modules/academics/assessment-locking.js',
    'class-register': 'js/modules/academics/class-register.js',
    'register-export': 'js/modules/academics/register-export.js',
    'annual-register': 'js/modules/academics/annual-register.js',
    'report-cards': ['js/modules/academics/ranking-engine.js', 'js/modules/academics/report-cards.js'],
    'report-generator': 'js/modules/academics/report-generator.js',
    'ranking-engine': 'js/modules/academics/ranking-engine.js',
    'rankings': ['js/modules/academics/ranking-engine.js', 'js/modules/academics/rankings.js'],
    'transcripts': ['js/modules/academics/ranking-engine.js', 'js/modules/academics/transcripts.js'],
    'statistics': 'js/modules/academics/statistics.js',
    'academic-reports': 'js/modules/academics/academic-reports.js',

    // Holidays (academic)
    'holidays-marks': 'js/modules/holidays/holidays-marks.js',

    // Finance
    'finance-dashboard': 'js/modules/finance/finance-dashboard.js',
    'fee-structure': 'js/modules/finance/fee-structure.js',
    'fee-assignments': 'js/modules/finance/fee-assignments.js',
    'fee-term-status': 'js/modules/finance/fee-term-status.js',
    'record-payment': 'js/modules/finance/record-payment.js',
    'payment-history': 'js/modules/finance/payment-history.js',
    'receipts': 'js/modules/finance/receipts.js',
    'overdue-payments': 'js/modules/finance/overdue-payments.js',
    'fee-waivers': 'js/modules/finance/fee-waivers.js',
    'credit-balances': 'js/modules/finance/credit-balances.js',
    'balances': 'js/modules/finance/balances.js',
    'student-fees': 'js/modules/finance/student-fees.js',
    'student-statements': 'js/modules/finance/student-statements.js',
    'family-fee-summary': 'js/modules/finance/family-fee-summary.js',
    'payment-reversals': 'js/modules/finance/payment-reversals.js',
    'manual-adjustments': 'js/modules/finance/manual-adjustments.js',
    'discounts': 'js/modules/finance/discounts.js',
    'carry-forward': 'js/modules/finance/carry-forward.js',
    'finance-audit'
    'help-center': 'js/modules/settings/help-center.js',
    'faq': 'js/modules/settings/help-center.js',
    'support': 'js/modules/settings/help-center.js',: 'js/modules/finance/finance-audit.js',
    'financial-reports': 'js/modules/finance/financial-reports.js',

    // Holidays (finance)
    'holidays-fees': 'js/modules/holidays/holidays-fees.js',

    // Staff
    'user-management': ['js/modules/settings/users.js', 'js/modules/staff/user-management.js'],
    'teachers': 'js/modules/staff/teachers.js',
    'subjects': 'js/modules/staff/subjects.js',
    'teacher-assignments': ['js/modules/staff/teachers.js', 'js/modules/staff/subjects.js', 'js/modules/staff/teacher-assignments.js'],
    'teacher-performance': ['js/modules/staff/teachers.js', 'js/modules/staff/teacher-performance.js'],
    'timetable': [
        'js/modules/staff/teachers.js',
        'js/modules/staff/subjects.js',
        'js/modules/staff/timetable-conflicts.js',
        'js/modules/staff/class-timetable.js',
        'js/modules/staff/teacher-timetable.js',
        'js/modules/staff/staff-timetable.js',
        'js/modules/staff/timetable-import.js',
        'js/modules/staff/timetable.js',
    ],
    'class-timetable': 'js/modules/staff/class-timetable.js',
    'teacher-timetable': 'js/modules/staff/teacher-timetable.js',
    'staff-timetable': 'js/modules/staff/staff-timetable.js',
    'timetable-conflicts': 'js/modules/staff/timetable-conflicts.js',
    'timetable-generator': 'js/modules/staff/timetable-generator.js',
    'timetable-import': 'js/modules/staff/timetable-import.js',

    // Communication
    'announcements': 'js/modules/communication/announcements.js',
    'announcement-center': 'js/modules/communication/announcement-center.js',
    'notifications': 'js/modules/communication/notifications.js',
    'notification-center': 'js/modules/communication/notification-center.js',
    'reminders': 'js/modules/communication/reminders.js',

    // Analytics
    'analytics': 'js/modules/analytics/analytics.js',
    'analytics-settings': 'js/modules/analytics/analytics-settings.js',
    'system-health': 'js/modules/analytics/system-health.js',

    // Settings
    'school-settings': 'js/modules/settings/school-settings.js',
    'academic-calendar': ['js/modules/settings/academic-years.js', 'js/modules/settings/academic-calendar.js'],
    'academic-years': 'js/modules/settings/academic-years.js',
    'class-management': ['js/modules/staff/teachers.js', 'js/modules/settings/class-management.js'],
    'grading-scale': ['js/modules/settings/grading-scale.js', 'js/modules/settings/grading-settings.js'],
    'grading-settings': 'js/modules/settings/grading-settings.js',
    'holidays': 'js/modules/settings/holidays.js',
    'backup-restore': 'js/modules/settings/backup-restore.js',
    'system-logs': 'js/modules/settings/system-logs.js',
    'api-settings': 'js/modules/settings/api-settings.js',
    'settings': 'js/modules/settings/settings.js',
    'users': 'js/modules/settings/users.js',

    // Bulk
    'bulk-import': 'js/modules/bulk/bulk-import.js',
    'bulk-export': 'js/modules/bulk/bulk-export.js',
    'bulk-finance-actions': 'js/modules/bulk/bulk-finance-actions.js',
    'bulk-student-actions': 'js/modules/bulk/bulk-student-actions.js',
};

/* ─────────────────────────────────────────────────────────────────
   RENDER FUNCTION NAME MAP
   Maps a moduleId to the window function name that renders it.
   Convention: render + PascalCase(moduleId)
   ───────────────────────────────────────────────────────────────── */

/**
 * Convert a kebab-case moduleId to its render function name.
 * 'admin-dashboard' → 'renderAdminDashboard'
 */
function moduleIdToRenderFn(moduleId) {
    return 'render' + moduleId
        .split('-')
        .map(w => w.charAt(0).toUpperCase() + w.slice(1))
        .join('');
}

/* ─────────────────────────────────────────────────────────────────
   LOADED MODULES REGISTRY
   Track which module scripts have already been injected into the DOM
   so we never load the same <script> twice.
   ───────────────────────────────────────────────────────────────── */

const _loadedModules = new Set();
const _loadedFiles = new Set();

/**
 * Load a single file (by path) if not already loaded. Internal helper
 * for loadModuleScript() below.
 */
function _loadFile(filePath) {
    return new Promise((resolve, reject) => {
        if (_loadedFiles.has(filePath)) { resolve(); return; }

        const script = document.createElement('script');
        script.src = filePath + '?v=' + APP_VERSION;
        script.async = false;
        script.defer = false;
        script.onload = () => { _loadedFiles.add(filePath); resolve(); };
        script.onerror = () => reject(new Error(`Failed to load module script: ${filePath}`));
        document.head.appendChild(script);
    });
}

/**
 * Dynamically load a module's JS file(s) if not already loaded.
 * MODULE_FILE_MAP entries may be a single path (most modules) or an
 * array of paths (for pages split into a data-layer file + a render-
 * page file, e.g. 'grading-scale': [settings/grading-scale.js,
 * settings/grading-settings.js] — loaded in order, so the data layer
 * is always in scope before the page that calls it). Companion files
 * shared across multiple moduleIds (e.g. staff/teachers.js) are only
 * ever injected once, regardless of how many pages reference them.
 * Returns a promise that resolves when all of them are ready.
 */
async function loadModuleScript(moduleId) {
    const mapped = MODULE_FILE_MAP[moduleId];

    if (!mapped) {
        throw new Error(`No file mapped for moduleId: "${moduleId}"`);
    }

    if (_loadedModules.has(moduleId)) return; // already loaded

    const filePaths = Array.isArray(mapped) ? mapped : [mapped];
    for (const filePath of filePaths) {
        await _loadFile(filePath);
    }
    _loadedModules.add(moduleId);
}

/* ─────────────────────────────────────────────────────────────────
   HOLIDAY BANNER
   The moving banner shown during holiday mode.
   Cannot be dismissed — reappears on every navigation.
   ───────────────────────────────────────────────────────────────── */

/**
 * Inject (or update) the holiday mode banner above #app.
 * The banner scrolls horizontally via CSS animation (marquee effect).
 */
function injectHolidayBanner() {
    let banner = document.getElementById('holiday-mode-banner');

    if (!banner) {
        banner = document.createElement('div');
        banner.id = 'holiday-mode-banner';
        banner.className = 'holiday-banner';
        banner.setAttribute('role', 'status');
        banner.setAttribute('aria-live', 'polite');

        // Insert above #app
        const app = document.getElementById('app');
        if (app && app.parentNode) {
            app.parentNode.insertBefore(banner, app);
        } else {
            document.body.insertBefore(banner, document.body.firstChild);
        }
    }

    banner.style.display = 'block';
    banner.innerHTML = `
        <div class="holiday-banner-track">
            <span class="holiday-banner-content">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                     stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="12" r="10"/>
                    <line x1="12" y1="8" x2="12" y2="12"/>
                    <line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
                ${esc(HOLIDAY_CONFIG.bannerText)}
                &nbsp;&nbsp;&nbsp;—&nbsp;&nbsp;&nbsp;
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                     stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="12" r="10"/>
                    <line x1="12" y1="8" x2="12" y2="12"/>
                    <line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
                ${esc(HOLIDAY_CONFIG.bannerText)}
                &nbsp;&nbsp;&nbsp;—&nbsp;&nbsp;&nbsp;
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                     stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="12" r="10"/>
                    <line x1="12" y1="8" x2="12" y2="12"/>
                    <line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
                ${esc(HOLIDAY_CONFIG.bannerText)}
            </span>
        </div>`;
}

/**
 * Remove the holiday banner when holiday mode ends.
 */
function removeHolidayBanner() {
    const banner = document.getElementById('holiday-mode-banner');
    if (banner) banner.remove();
}

/* ─────────────────────────────────────────────────────────────────
   MAIN NAVIGATION FUNCTION
   ───────────────────────────────────────────────────────────────── */

/**
 * Navigate to a module. This is the ONLY function that should
 * be called to change the displayed module anywhere in the app.
 *
 * Flow:
 *   1. Check if user is logged in
 *   2. Handle 'login' special case
 *   3. Role-gate check
 *   4. Holiday banner injection/removal
 *   5. Show skeleton loader in #app
 *   6. Load module script if needed
 *   7. Call render function
 *   8. Update sidebar active state
 *   9. Update browser history
 *  10. Scroll #app to top
 *
 * @param {string} moduleId - target module id
 * @param {Object} [params] - optional params passed to render function
 */
async function navigateTo(moduleId, params = {}) {
    // ── Handle login page ──────────────────────────────────────────
    if (moduleId === 'login') {
        renderLoginPage();
        _updateHistory('login');
        hideSidebar();
        return;
    }

    // ── Require login ──────────────────────────────────────────────
    if (!state.currentUser) {
        renderLoginPage();
        _updateHistory('login');
        return;
    }

    // ── Role gate ──────────────────────────────────────────────────
    const holiday = isHolidayMode();
    if (!canNavigateTo(moduleId, holiday)) {
        if (typeof showToast === 'function') {
            showToast('You do not have access to this section.', 'error', 4000);
        }
        console.warn(`[Router] Access denied: ${state.currentUser.role} → ${moduleId}`);
        // Navigate to their home instead
        const home = DEFAULT_MODULE[state.currentUser.role] || 'admin-dashboard';
        if (moduleId !== home) navigateTo(home);
        return;
    }

    // ── Holiday banner ─────────────────────────────────────────────
    if (holiday) {
        injectHolidayBanner();
    } else {
        removeHolidayBanner();
    }

    // ── Update current module ──────────────────────────────────────
    state.currentModule = moduleId;

    // ── Show sidebar if hidden ─────────────────────────────────────
    showSidebar();

    // ── Skeleton loader ────────────────────────────────────────────
    _showModuleSkeleton(moduleId);

    // ── Update active nav ──────────────────────────────────────────
    setActiveNav(moduleId);

    // ── Update topbar ──────────────────────────────────────────────
    if (typeof updateTopbarTitle === 'function') {
        const navItem = getNavItem(moduleId);
        updateTopbarTitle(navItem?.label || moduleId);
    }

    // ── Update browser history ─────────────────────────────────────
    _updateHistory(moduleId);

    // ── Load and render module ─────────────────────────────────────
    try {
        // Load the module's script file if not already done
        await loadModuleScript(moduleId);

        // Find the render function
        const renderFnName = moduleIdToRenderFn(moduleId);
        const renderFn = window[renderFnName];

        if (typeof renderFn !== 'function') {
            throw new Error(
                `Render function "${renderFnName}" not found. ` +
                `Check that ${MODULE_FILE_MAP[moduleId]} exports it on window.`
            );
        }

        // Render the module safely — every render(container) function across
        // this app (settings/, staff/, academics/, dashboard/, attendance/, ...)
        // expects an actual DOM element as its first argument, not `params`.
        // #moduleContent is the real dynamic-content target in index.html
        // (the div literally commented "Dynamic content rendered here") —
        // NOT #app (the whole shell, sidebar included) and not #app-main
        // (referenced in some file header comments but not an id that
        // actually exists in index.html).
        const moduleContainer = document.getElementById('moduleContent');
        if (!moduleContainer) {
            throw new Error('#moduleContent element not found in the page — cannot render any module.');
        }
        await safeRenderModule(moduleId, () => renderFn(moduleContainer, params));

        // Apply role/holiday visibility overrides after render
        enforceRoleVisibility();
        applyHolidayVisibility();

        // Scroll to top
        const app = document.getElementById('app');
        if (app) app.scrollTop = 0;

    } catch (err) {
        handleApiError(err, `render ${moduleId}`);
        console.error(`[Router] Failed to render module "${moduleId}":`, err);
    }
}

/* ─────────────────────────────────────────────────────────────────
   SKELETON LOADER
   ───────────────────────────────────────────────────────────────── */

/**
 * Show a skeleton placeholder in #moduleContent while the module loads.
 * Instantly replaced by the real content when render() completes.
 */
function _showModuleSkeleton(moduleId) {
    const container = document.getElementById('moduleContent');
    if (!container) return;

    // Module title for skeleton heading
    const navItem = getNavItem(moduleId);
    const label = navItem?.label || moduleId;

    container.innerHTML = `
        <div class="module-skeleton" aria-busy="true" aria-label="Loading ${esc(label)}">
            <div class="skeleton-header">
                <div class="skeleton skeleton-title"></div>
                <div class="skeleton skeleton-btn"></div>
            </div>
            <div class="skeleton-stats">
                <div class="skeleton skeleton-stat-card"></div>
                <div class="skeleton skeleton-stat-card"></div>
                <div class="skeleton skeleton-stat-card"></div>
                <div class="skeleton skeleton-stat-card"></div>
            </div>
            <div class="skeleton skeleton-table-header"></div>
            <div class="skeleton skeleton-table-row"></div>
            <div class="skeleton skeleton-table-row"></div>
            <div class="skeleton skeleton-table-row"></div>
            <div class="skeleton skeleton-table-row"></div>
            <div class="skeleton skeleton-table-row short"></div>
        </div>`;
}

/* ─────────────────────────────────────────────────────────────────
   BROWSER HISTORY
   ───────────────────────────────────────────────────────────────── */

/**
 * Push a state entry to the browser history so the back button works.
 */
function _updateHistory(moduleId) {
    const url = `${window.location.pathname}#${moduleId}`;
    window.history.pushState({ moduleId }, '', url);
}

/**
 * Handle the browser back/forward buttons.
 */
window.addEventListener('popstate', (e) => {
    const moduleId = e.state?.moduleId || _moduleIdFromHash();
    if (moduleId && state.currentUser) {
        navigateTo(moduleId);
    }
});

/**
 * Extract moduleId from the URL hash on first load.
 */
function _moduleIdFromHash() {
    const hash = window.location.hash.replace('#', '').trim();
    return MODULE_FILE_MAP[hash] ? hash : null;
}

/* ─────────────────────────────────────────────────────────────────
   SIDEBAR SHOW / HIDE
   ───────────────────────────────────────────────────────────────── */

/**
 * Show the sidebar (used when navigating away from login).
 */
function showSidebar() {
    const sidebar = document.getElementById('sidebar');
    if (sidebar) sidebar.style.display = '';
    const topbar = document.getElementById('topbar');
    if (topbar) topbar.style.display = '';
}

/**
 * Hide the sidebar (used on login page).
 */
function hideSidebar() {
    const sidebar = document.getElementById('sidebar');
    if (sidebar) sidebar.style.display = 'none';
    const topbar = document.getElementById('topbar');
    if (topbar) topbar.style.display = 'none';
}

/* ─────────────────────────────────────────────────────────────────
   DEEP-LINK SUPPORT
   ───────────────────────────────────────────────────────────────── */

/**
 * Read the URL hash on first page load and navigate there
 * if a valid moduleId is found.
 * Called by boot.js after session is restored.
 */
function handleInitialHash() {
    const moduleId = _moduleIdFromHash();
    if (moduleId && state.currentUser && canNavigateTo(moduleId)) {
        navigateTo(moduleId);
    }
}

/* ─────────────────────────────────────────────────────────────────
   EXPOSE
   ───────────────────────────────────────────────────────────────── */

window.navigateTo = navigateTo;
window.loadModuleScript = loadModuleScript;
window.moduleIdToRenderFn = moduleIdToRenderFn;
window.injectHolidayBanner = injectHolidayBanner;
window.removeHolidayBanner = removeHolidayBanner;
window.showSidebar = showSidebar;
window.hideSidebar = hideSidebar;
window.handleInitialHash = handleInitialHash;
window.MODULE_FILE_MAP = MODULE_FILE_MAP;