/**
 * ECOLE LA FONTAINE — Boot Sequence
 * App initialization and startup
 * Last updated: 2026-07-03
 * 
 * CHANGES:
 * - Added loadPromotionData() to load promotion tables
 * - Added loadHistoricalData() for year-specific data
 * - Added initializeYearFilters() on boot
 * - Added refreshYearData() helper
 * - Added getActiveYearId() helper
 * - Boot now loads marks_archive, student_promotions, etc.
 */


import { state, updateState, invalidateCache, resetFilters, initState } from './state.js';
import { checkAuth, saveSession, clearSession, logout, resetSessionExpiry } from './auth.js';
import { get, getSchoolSettings, getAllRecords, getYearData } from './api.js';
import { navigateTo, getLastModule } from './router.js';
import { getDefaultModule, getNavConfig } from '../config/navigation.js';
import { APP_CONFIG, STORAGE_KEYS, DEFAULT_GRADES } from '../config/constants.js';
import { getCurrentPhase, termProgress } from './formulas.js';
import { initOfflineSupport, loadStateFromCache, saveStateToCache, clearStateCache } from './offline.js';
import { initTheme } from '../ui/theme.js';
import { buildSidebar, initSidebar } from '../ui/sidebar.js';
import { updateTopbarUser, renderTopbar, initUserDropdown } from '../ui/topbar.js';
import { initPWA } from '../ui/shell.js';
import { showToast } from '../ui/toast.js';

// ──────────────────────────────────────────────────────────────────────
// BOOT STATE
// ──────────────────────────────────────────────────────────────────────

let isBooted = false;
let isLoading = false;
let loadPromise = null;

// ──────────────────────────────────────────────────────────────────────
// INITIAL DATA LOAD
// ──────────────────────────────────────────────────────────────────────

/**
 * Check if the core state is already loaded
 * @returns {boolean}
 */
export function isStateLoaded() {
    return state.classes.length > 0 && state.students.length > 0 && state.academicYears.length > 0;
}

/**
 * Load promotion-related data from database
 * @returns {Promise<void>}
 */
async function loadPromotionData() {
    try {
        const [promotions, promotionRecords, classHistory, marksArchive] = await Promise.all([
            get('student_promotions', { order: 'executed_at.desc' }),
            get('student_promotion_records', { order: 'created_at.desc' }),
            get('student_class_history', { order: 'academic_year_id.desc' }),
            get('marks_archive', { order: 'archived_at.desc' }),
        ]);

        updateState('studentPromotions', promotions || []);
        updateState('studentPromotionRecords', promotionRecords || []);
        updateState('studentClassHistory', classHistory || []);
        updateState('marksArchive', marksArchive || []);

        console.log('[DataLoader] Promotion data loaded:', {
            promotions: promotions.length,
            promotionRecords: promotionRecords.length,
            classHistory: classHistory.length,
            marksArchive: marksArchive.length,
        });
    } catch (error) {
        console.warn('[DataLoader] Promotion data load failed (tables may not exist):', error);
        // Initialize empty arrays if tables don't exist yet
        updateState('studentPromotions', []);
        updateState('studentPromotionRecords', []);
        updateState('studentClassHistory', []);
        updateState('marksArchive', []);
    }
}

/**
 * Load all initial data from Supabase
 * @param {boolean} forceRefresh - Force refresh even if cached
 * @returns {Promise<boolean>}
 */
export async function loadInitialData(forceRefresh = false) {
    if (isLoading && loadPromise) {
        return loadPromise;
    }

    if (!forceRefresh && isStateLoaded()) {
        return true;
    }

    isLoading = true;
    console.log('[DataLoader] Loading initial data...');

    loadPromise = (async () => {
        try {
            const promises = {
                academicYears: get('academic_years'),
                classes: get('classes', { order: 'sort_order.asc' }),
                subjects: get('subjects', { order: 'sort_order.asc' }),
                settings: getSchoolSettings(),
                terms: get('terms', { order: 'term_number.asc' }),
                students: get('students', { is_deleted: false }),
                teachers: get('teachers'),
                assessments: get('assessments'),
                marks: getAllRecords('marks', '', 1000),
                feeCategories: get('fee_categories', { is_active: true }),
                feeAmounts: get('fee_amounts'),
                studentFees: get('student_fees'),
                payments: get('payments'),
                // NEW: Load promotion-related data
                promotions: loadPromotionData(),
            };

            // Optional tables (don't fail if missing)
            const optionalPromises = {
                families: get('families').catch(() => []),
                activityLogs: get('activity_logs').catch(() => []),
                gradingScale: get('grading_scale').catch(() => []),
            };

            const results = await Promise.all(Object.values(promises));
            const optionalResults = await Promise.all(Object.values(optionalPromises));

            const [
                academicYears, classes, subjects, settings, terms, students, teachers,
                assessments, marks, feeCategories, feeAmounts, studentFees, payments,
                // promotion data loaded inside loadPromotionData()
            ] = results;

            const [families, activityLogs, gradingScale] = optionalResults;

            // Update state
            updateState('academicYears', academicYears);
            updateState('classes', classes);
            updateState('subjects', subjects);
            updateState('schoolSettings', settings);
            updateState('terms', terms);
            updateState('students', students);
            updateState('teachers', teachers);
            updateState('assessments', assessments);
            updateState('marks', marks);
            updateState('feeCategories', feeCategories);
            updateState('feeAmounts', feeAmounts);
            updateState('studentFees', studentFees);
            updateState('payments', payments);
            updateState('families', families || []);
            updateState('activityLogs', activityLogs || []);

            // Map grading scale
            if (gradingScale && gradingScale.length) {
                updateState('gradingScale', gradingScale.map(g => ({
                    grade: g.grade,
                    min: g.min_percentage,
                    max: g.max_percentage,
                    desc: g.description,
                    color: g.color || '#d1fae5',
                    bg: g.color || '#d1fae5',
                    sort_order: g.sort_order,
                })));
            } else {
                updateState('gradingScale', DEFAULT_GRADES);
            }

            // Set current academic year and term
            const currentAcadYear = academicYears.find(y => y.is_active) || academicYears[academicYears.length - 1];
            updateState('currentAcadYear', currentAcadYear);

            const currentTerm = terms.find(t => t.name === (settings.current_term || 'Term 3'));
            updateState('currentTerm', currentTerm);

            // Initialize filters with current year/term
            initState();

            console.log('[DataLoader] Loaded:', {
                students: students.length,
                classes: classes.length,
                marks: marks.length,
                academicYears: academicYears.length,
                currentYear: currentAcadYear?.name,
                currentTerm: currentTerm?.name,
            });

            return true;
        } catch (error) {
            console.error('[DataLoader] Failed:', error);
            showToast('Failed to load data. Please refresh the page.', 'error');
            return false;
        } finally {
            isLoading = false;
            loadPromise = null;
        }
    })();

    return loadPromise;
}

// ──────────────────────────────────────────────────────────────────────
// YEAR DATA REFRESH
// ──────────────────────────────────────────────────────────────────────

/**
 * Get the active academic year ID
 * @returns {number|null}
 */
export function getActiveYearId() {
    return state.filters.academic_year_id || state.currentAcadYear?.id || null;
}

/**
 * Refresh data for a specific academic year
 * @param {number} yearId - Academic year ID
 * @returns {Promise<boolean>}
 */
export async function refreshYearData(yearId) {
    if (!yearId) return false;

    try {
        console.log(`[DataLoader] Refreshing data for year ${yearId}...`);

        // Load year-specific data
        const [yearStudents, yearMarks, yearAssessments] = await Promise.all([
            get('students', { academic_year_id: yearId, is_deleted: false }),
            get('marks', { academic_year_id: yearId, is_archived: false }),
            get('assessments', { academic_year_id: yearId }),
        ]);

        // Update state with year-filtered data
        // We keep all data in state but these helpers will filter
        updateState('students', yearStudents);
        updateState('marks', yearMarks);
        updateState('assessments', yearAssessments);

        // Update active filters
        state.filters.academic_year_id = parseInt(yearId);

        // Update current academic year
        const year = state.academicYears.find(y => y.id === parseInt(yearId));
        if (year) {
            updateState('currentAcadYear', year);
        }

        // Invalidate cache
        invalidateCache();

        console.log(`[DataLoader] Year ${yearId} data refreshed:`, {
            students: yearStudents.length,
            marks: yearMarks.length,
            assessments: yearAssessments.length,
        });

        return true;
    } catch (error) {
        console.error('[DataLoader] Year refresh failed:', error);
        return false;
    }
}

/**
 * Load historical data for a specific year (including archived marks)
 * @param {number} yearId - Academic year ID
 * @returns {Promise<object>}
 */
export async function loadHistoricalYearData(yearId) {
    if (!yearId) return { students: [], marks: [], assessments: [] };

    try {
        const [students, marks, assessments, archivedMarks] = await Promise.all([
            get('students', { academic_year_id: yearId }),
            get('marks', { academic_year_id: yearId, is_archived: false }),
            get('assessments', { academic_year_id: yearId }),
            get('marks_archive', { academic_year_id: yearId }),
        ]);

        return {
            students: students || [],
            marks: marks || [],
            assessments: assessments || [],
            archivedMarks: archivedMarks || [],
        };
    } catch (error) {
        console.error('[DataLoader] Historical data load failed:', error);
        return { students: [], marks: [], assessments: [], archivedMarks: [] };
    }
}

// ──────────────────────────────────────────────────────────────────────
// BOOT APP
// ──────────────────────────────────────────────────────────────────────

/**
 * Boot the application after successful login
 * @param {object} user - User object
 */
export async function bootApp(user) {
    if (isBooted) {
        console.warn('[Boot] Already booted — skipping');
        return;
    }
    console.log('[Boot] bootApp called for:', user?.name);

    // Swap login → app
    const loginPage = document.getElementById('login-page');
    const appPage = document.getElementById('app-page');
    if (loginPage) loginPage.style.display = 'none';
    if (appPage) appPage.style.display = 'block';

    // Set role class on body
    document.body.className = `role-${user.role}`;

    // Render shell UI
    renderTopbar();
    updateTopbarUser(user);
    buildSidebar(user.role);
    updateSidebarUser(user);

    // Show loading spinner
    const content = document.getElementById('dynamic-content');
    if (content) {
        content.innerHTML = `<div class="loading-container"><div class="spinner"></div><p>Loading data from server…</p></div>`;
    }

    try {
        // ── 1. Load data — cache first ──────────────────────────────
        const fromCache = await loadStateFromCache(user);
        let loaded;
        if (fromCache) {
            loaded = true;
            // Refresh in the background
            loadInitialData(true).then(ok => {
                if (ok) saveStateToCache(user);
            }).catch(console.warn);
        } else {
            loaded = await loadInitialData();
            if (loaded) saveStateToCache(user).catch(console.warn);
        }

        if (!loaded) throw new Error('Data load returned false');

        // ── 2. Load promotion data ───────────────────────────────────
        await loadPromotionData();

        // ── 3. Academic phase ──────────────────────────────────────
        state.currentPhase = getCurrentPhase();
        updateProgressBar();

        // ── 4. Initialize filters ──────────────────────────────────
        initState();

        // ── 5. Determine which module to open ────────────────────
        const lastModule = localStorage.getItem(STORAGE_KEYS.MODULE) || getDefaultModule(user.role);
        // Verify the module exists in the sidebar for this role
        const config = getNavConfig(user.role);
        const hasModule = config.some(s => s.items.some(i => i.id === lastModule));
        const targetModule = hasModule ? lastModule : getDefaultModule(user.role);

        // ── 6. Navigate to first module ──────────────────────────
        await navigateTo(targetModule);

        // ── 7. Background services ──────────────────────────────
        startSessionWatcher();
        startIdleWatcher();

        // ── 8. Offline / sync ────────────────────────────────────
        initOfflineSupport();

        // ── 9. UI polish ─────────────────────────────────────────
        initSidebar();
        initUserDropdown();
        initTheme();
        initPWA();
        initNotifications();

        isBooted = true;

        // Flush any offline marks
        if (navigator.onLine) {
            setTimeout(() => {
                if (typeof syncOfflineMarks === 'function') syncOfflineMarks();
            }, 3000);
        }

        console.log('✅ ECOLE LA FONTAINE v9.0 — App booted successfully');

    } catch (error) {
        console.error('[Boot] Failed:', error);
        if (content) {
            content.innerHTML = `
                <div class="alert alert-danger" style="margin:2rem">
                    <strong>⚠️ Failed to load data from server.</strong><br>
                    ${error.message}<br><br>
                    <button class="btn btn-primary" onclick="location.reload()">🔄 Retry</button>
                    <button class="btn btn-outline" onclick="navigateTo('api-settings')">⚙️ API Settings</button>
                </div>
            `;
        }
    }
}

// ──────────────────────────────────────────────────────────────────────
// SIDEBAR USER UPDATE
// ──────────────────────────────────────────────────────────────────────

function updateSidebarUser(user) {
    if (!user) return;
    const avatarEl = document.getElementById('sidebar-avatar');
    if (avatarEl) avatarEl.textContent = '👤';
    const nameEl = document.getElementById('sidebar-username');
    if (nameEl) nameEl.textContent = user.name || user.username || 'User';
    const roleEl = document.getElementById('sidebar-userrole');
    if (roleEl) roleEl.textContent = user.role ? (user.role.charAt(0).toUpperCase() + user.role.slice(1)) : '—';
}

// ──────────────────────────────────────────────────────────────────────
// PROGRESS BAR UPDATE
// ──────────────────────────────────────────────────────────────────────

export function updateProgressBar() {
    const term = state.currentTerm;
    const { pct, daysLeft, text } = termProgress(term);
    const fill = document.getElementById('prog-fill');
    const textEl = document.getElementById('prog-text');
    const daysEl = document.getElementById('prog-days');
    const termNameEl = document.getElementById('prog-term-name');
    const yearEl = document.getElementById('prog-acad-year');

    if (fill) fill.style.width = pct + '%';
    if (textEl) textEl.textContent = text;
    if (daysEl) daysEl.textContent = daysLeft;
    if (termNameEl) termNameEl.textContent = state.schoolSettings?.current_term || 'Term 3';
    if (yearEl) yearEl.textContent = state.currentAcadYear?.name || '2025-2026';

    // Phase indicator
    const phase = getCurrentPhase(term);
    const phaseText = phase === 'pre_midterm' ? '📅 Pre' : '📅 Post';
    const phaseClass = phase === 'pre_midterm' ? 'phase-pre' : 'phase-post';
    const indicator = document.getElementById('phase-indicator-compact');
    if (indicator) {
        indicator.textContent = phaseText;
        indicator.className = `phase-badge-compact ${phaseClass}`;
    }
}

// ──────────────────────────────────────────────────────────────────────
// SESSION WATCHER
// ──────────────────────────────────────────────────────────────────────

let _sessionTimer = null;

function startSessionWatcher() {
    if (_sessionTimer) clearInterval(_sessionTimer);

    _sessionTimer = setInterval(() => {
        if (!checkAuth()) {
            showToast('Session expired. Please login again.', 'warning');
            logout();
        }
    }, 60000);

    // Reset expiry on user activity
    const events = ['click', 'keydown', 'mousemove', 'touchstart'];
    events.forEach(ev => {
        document.addEventListener(ev, () => {
            if (state.currentUser) {
                resetSessionExpiry();
            }
        }, { passive: true });
    });
}

// ──────────────────────────────────────────────────────────────────────
// IDLE WATCHER
// ──────────────────────────────────────────────────────────────────────

let _idleTimer = null;

function startIdleWatcher() {
    const events = ['mousemove', 'keydown', 'click', 'touchstart', 'scroll'];
    events.forEach(e => document.addEventListener(e, resetIdleTimer, { passive: true }));
    resetIdleTimer();
}

function resetIdleTimer() {
    window._lastActivity = Date.now();
    const overlay = document.getElementById('idle-warning-overlay');
    if (overlay) overlay.classList.remove('visible');
    clearInterval(window._idleCountdownTimer);
}

// ──────────────────────────────────────────────────────────────────────
// INIT APP (entry point)
// ──────────────────────────────────────────────────────────────────────

export async function initApp() {
    if (isBooted) {
        console.warn('[Boot] App already booted — skipping');
        return;
    }
    console.log('[Boot] initApp called');
    const storedUser = checkAuth();
    if (storedUser) {
        state.currentUser = storedUser;
        await bootApp(storedUser);
    } else {
        document.getElementById('login-page').style.display = 'flex';
        document.getElementById('app-page').style.display = 'none';
        document.getElementById('card-wrap')?.classList.remove('open');
        document.getElementById('login-password').value = '';
    }
}

// ──────────────────────────────────────────────────────────────────────
// ─── EXPOSE FUNCTIONS ────────────────────────────────────────────────
// ──────────────────────────────────────────────────────────────────────

window.initApp = initApp;
window.bootApp = bootApp;
// ── ensureStateLoaded — shared global used by all modules ─────────────────────
export async function ensureStateLoaded(forceRefresh = false) {
    if (!state.classes || !state.classes.length) {
        console.log('[Boot] State empty — loading initial data...');
        await loadInitialData(forceRefresh);
    }
}

window.ensureStateLoaded = ensureStateLoaded;
window.loadInitialData = loadInitialData;


console.log('[Boot] initApp exported:', typeof initApp);
console.log('[Boot] bootApp exported:', typeof bootApp);