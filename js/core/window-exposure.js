/* ═══════════════════════════════════════════════════════════════════
   js/core/window-exposure.js
   ═══════════════════════════════════════════════════════════════════
   Purpose : The LAST script loaded before main.js.
             Single place for all remaining window.* aliases needed
             by inline onclick= handlers in rendered HTML templates.
             Every module uses onclick="someFunction(id)" in its
             innerHTML templates. Those functions must exist on window
             at the moment the HTML is clicked — not just when the
             module file is loaded.
             This file also serves as the global "is everything wired?"
             check — if a function is missing from window here, it
             will be obvious.
   RULE    : No business logic here. Only aliases and delegation.
             All actual logic lives in the correct module file.
   Load order: SECOND TO LAST — after ALL core and ui files,
               BEFORE js/main.js.
   ═══════════════════════════════════════════════════════════════════ */

'use strict';

/* ═══════════════════════════════════════════════════════════════════
   SECTION 1 — NAVIGATION & ROUTING
   ═══════════════════════════════════════════════════════════════════ */

// navigateTo() is the primary navigation function used everywhere.
// It is already exposed by router.js — aliased here for clarity.
window.go = window.navigateTo;

/* ═══════════════════════════════════════════════════════════════════
   SECTION 2 — AUTH ACTIONS
   onclick= handlers used in login.html and the topbar user menu.
   ═══════════════════════════════════════════════════════════════════ */

// These are already on window from auth.js but listed here so
// any developer can find them in one place.
// window.submitLogin            → auth.js
// window.logout                 → auth.js
// window.onRoleChange           → auth.js
// window.togglePasswordVisibility → auth.js
// window.tryBiometricLogin      → auth.js
// window.openLoginCard          → auth.js
// window.testAndSaveSetup       → boot.js

/* ═══════════════════════════════════════════════════════════════════
   SECTION 3 — SIDEBAR ONCLICK HANDLERS
   ═══════════════════════════════════════════════════════════════════ */

// sidebar.js exposes these — aliased for onclick= in sidebar HTML:
// window.toggleSidebarSection   → ui/sidebar.js
// window.toggleSidebar          → ui/sidebar.js
// window.setActiveNav           → ui/sidebar.js

/* ═══════════════════════════════════════════════════════════════════
   SECTION 4 — TOPBAR ONCLICK HANDLERS
   ═══════════════════════════════════════════════════════════════════ */

// window.toggleTheme            → ui/theme.js
// window.openNotifications      → ui/topbar.js or notification-center.js
// window.onYearSelectorChange   → ui/topbar.js
// window.onTermSelectorChange   → ui/topbar.js
// window.installPWA             → pwa.js
// window.applyPWAUpdate         → pwa.js

/* ═══════════════════════════════════════════════════════════════════
   SECTION 5 — MODAL ONCLICK HANDLERS
   ═══════════════════════════════════════════════════════════════════ */

// window.showModal              → ui/modals.js
// window.closeModal             → ui/modals.js
// window.closeModalById         → ui/modals.js (alias)

/**
 * Close any open modal when user clicks the overlay background.
 * Attached to the modal-overlay element's onclick in the shell HTML.
 */
window.onModalOverlayClick = function (e) {
    // Only close if the click is directly on the overlay, not a child
    if (e.target === e.currentTarget && typeof closeModal === 'function') {
        closeModal();
    }
};

/* ═══════════════════════════════════════════════════════════════════
   SECTION 6 — TOAST ONCLICK HANDLERS
   ═══════════════════════════════════════════════════════════════════ */

/**
 * Dismiss a toast by its element ID.
 * Used by the × button inside each toast.
 */
window.dismissToast = function (toastId) {
    const el = document.getElementById(toastId);
    if (!el) return;
    el.classList.add('hiding');
    setTimeout(() => el.remove(), 350);
};

/* ═══════════════════════════════════════════════════════════════════
   SECTION 7 — TABLE & LIST ONCLICK ALIASES
   Common patterns used across many modules.
   ═══════════════════════════════════════════════════════════════════ */

/**
 * Generic row action dispatcher.
 * Many tables use:
 *   <button data-action="edit" data-id="42" onclick="tableAction(this)">
 * This function reads data-action and data-id and calls the
 * appropriate module-level function.
 *
 * Module functions must be named: handle<Module><Action>
 * e.g. handleStudentEdit, handlePaymentDelete
 *
 * @param {HTMLElement} btn
 */
window.tableAction = function (btn) {
    const action = btn.dataset.action;
    const id = btn.dataset.id;
    const module = btn.dataset.module || state.currentModule || '';

    if (!action) return;

    // Build function name: handle + PascalCase(module) + PascalCase(action)
    const fnName = 'handle'
        + (module ? module.split('-').map(w => w[0].toUpperCase() + w.slice(1)).join('') : '')
        + action[0].toUpperCase() + action.slice(1);

    if (typeof window[fnName] === 'function') {
        window[fnName](id, btn);
    } else {
        console.warn(`[WindowExposure] tableAction: no handler "${fnName}" for action "${action}" in module "${module}"`);
    }
};

/* ═══════════════════════════════════════════════════════════════════
   SECTION 8 — PAGINATION ONCLICK HANDLERS
   ═══════════════════════════════════════════════════════════════════ */

// window.goToPage               → ui/pagination.js
// window.changePageSize         → ui/pagination.js

/* ═══════════════════════════════════════════════════════════════════
   SECTION 9 — DROPDOWN ONCLICK HANDLERS
   ═══════════════════════════════════════════════════════════════════ */

// window.toggleDropdown         → ui/dropdowns.js
// window.closeAllDropdowns      → ui/dropdowns.js

/**
 * Close all dropdowns when user clicks anywhere outside them.
 */
document.addEventListener('click', function (e) {
    if (typeof closeAllDropdowns === 'function') {
        if (!e.target.closest('.dropdown')) {
            closeAllDropdowns();
        }
    }
});

/* ═══════════════════════════════════════════════════════════════════
   SECTION 10 — TAB ONCLICK HANDLERS
   ═══════════════════════════════════════════════════════════════════ */

/**
 * Switch the active tab in a tab group.
 * Used by: onclick="switchTab(this, 'tab-id')"
 */
window.switchTab = function (btn, tabId) {
    if (typeof initTabs === 'function') return; // initTabs handles it
    // Fallback inline tab logic
    const group = btn.closest('.tabs');
    if (!group) return;
    group.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const container = group.nextElementSibling;
    if (container) {
        container.querySelectorAll('.tab-panel').forEach(p => {
            p.style.display = p.id === tabId ? '' : 'none';
        });
    }
};

/* ═══════════════════════════════════════════════════════════════════
   SECTION 11 — ACCORDION ONCLICK HANDLERS
   ═══════════════════════════════════════════════════════════════════ */

/**
 * Toggle an accordion item open/closed.
 * Used by: onclick="toggleAccordion(this)"
 */
window.toggleAccordion = function (headerEl) {
    const item = headerEl.closest('.accordion-item');
    if (!item) return;
    item.classList.toggle('open');
};

/* ═══════════════════════════════════════════════════════════════════
   SECTION 12 — SORT & FILTER ONCLICK HANDLERS
   ═══════════════════════════════════════════════════════════════════ */

/**
 * Sort a data table by a column.
 * Used by: onclick="sortTable(this, 'column_name')"
 */
window.sortTable = function (thEl, column) {
    const table = thEl.closest('table');
    if (!table) return;

    // Toggle direction
    const currentDir = thEl.dataset.sortDir || 'asc';
    const newDir = currentDir === 'asc' ? 'desc' : 'asc';

    // Clear all sort indicators
    table.querySelectorAll('th[data-sort-col]').forEach(th => {
        th.dataset.sortDir = '';
        th.classList.remove('sorted-asc', 'sorted-desc');
    });

    thEl.dataset.sortDir = newDir;
    thEl.classList.add(newDir === 'asc' ? 'sorted-asc' : 'sorted-desc');

    // Let the module re-render if it has a sort handler
    if (typeof window.onTableSort === 'function') {
        window.onTableSort(column, newDir, table.id);
    }
};

/* ═══════════════════════════════════════════════════════════════════
   SECTION 13 — FORM SUBMIT SHORTCUTS
   ═══════════════════════════════════════════════════════════════════ */

/**
 * Prevent default form submission (app uses JS-only submits).
 * Attached to all <form> elements globally.
 */
document.addEventListener('submit', function (e) {
    e.preventDefault();
});

/**
 * Allow pressing Enter in text inputs to submit the nearest form.
 * Only if the input has data-enter-submit="true".
 */
document.addEventListener('keydown', function (e) {
    if (e.key !== 'Enter') return;
    const el = e.target;
    if (el.dataset.enterSubmit !== 'true') return;
    const form = el.closest('[data-form-id]');
    if (!form) return;
    const submitFn = window[form.dataset.formId + 'Submit'];
    if (typeof submitFn === 'function') submitFn();
});

/* ═══════════════════════════════════════════════════════════════════
   SECTION 14 — PRINT & EXPORT SHORTCUTS
   ═══════════════════════════════════════════════════════════════════ */

// window.printElement            → utils.js
// window.openPrintWindow         → utils.js
// window.exportToExcel           → utils.js
// window.exportToCSV             → utils.js
// window.downloadJSON            → utils.js
// window.copyToClipboard         → utils.js

/* ═══════════════════════════════════════════════════════════════════
   SECTION 15 — MARKS ENTRY SHORTCUTS
   ═══════════════════════════════════════════════════════════════════ */

// These are set by marks-entry.js at render time.
// Listed here so developers know where to look.
// window.saveMarksNow            → marks-entry.js
// window.onMarkInput             → marks-entry.js
// window.markAbsent              → marks-entry.js
// window.lockAssessment          → assessment-locking.js

/* ═══════════════════════════════════════════════════════════════════
   SECTION 16 — PAYMENT SHORTCUTS
   ═══════════════════════════════════════════════════════════════════ */

// window.savePaymentNow          → record-payment.js
// window.onFeeCheckboxChange     → record-payment.js
// window.onFeeAmountInput        → record-payment.js
// window.printReceipt            → receipts.js
// window.reprintReceipt          → receipts.js

/* ═══════════════════════════════════════════════════════════════════
   SECTION 17 — STUDENT ACTIONS
   ═══════════════════════════════════════════════════════════════════ */

// window.openStudentDetails      → student-list.js / student-details.js
// window.archiveStudent          → student-archive.js
// window.promoteStudent          → student-promotion.js

/* ═══════════════════════════════════════════════════════════════════
   SECTION 18 — NOTIFICATION ACTIONS
   ═══════════════════════════════════════════════════════════════════ */

// window.markNotificationRead    → notifications-engine.js
// window.markAllNotificationsRead → notifications-engine.js

/* ═══════════════════════════════════════════════════════════════════
   SECTION 19 — HOLIDAY MODE TOGGLE
   ═══════════════════════════════════════════════════════════════════ */

/**
 * Allow admin to manually toggle holiday mode from the calendar page.
 * @param {boolean} activate - true to activate, false to deactivate
 */
window.toggleHolidayMode = function (activate) {
    if (!iAmAdmin()) {
        if (typeof showToast === 'function') {
            showToast('Only administrators can toggle holiday mode.', 'error');
        }
        return;
    }

    if (activate) {
        activateHolidayMode();
        injectHolidayBanner();
        if (typeof showToast === 'function') {
            showToast('Holiday session activated. Data will now write to holiday tables.', 'warning', 6000);
        }
    } else {
        deactivateHolidayMode();
        removeHolidayBanner();
        if (typeof showToast === 'function') {
            showToast('Holiday session deactivated. Normal academic year data is active.', 'success', 4000);
        }
    }

    // Re-render the sidebar to show/hide holiday modules
    if (typeof renderSidebar === 'function') {
        renderSidebar();
    }
};

/* ═══════════════════════════════════════════════════════════════════
   SECTION 20 — YEAR / TERM SELECTOR CHANGE HANDLER
   ═══════════════════════════════════════════════════════════════════ */

/**
 * Called when the user changes the year selector in the topbar/sidebar.
 * Reloads all year-specific data and re-renders the current module.
 */
window.onYearSelectorChange = async function (yearId) {
    if (!yearId) return;
    updateState('selectedYearId', parseInt(yearId, 10));
    updateState('selectedTermId', null); // reset term when year changes

    await reloadForYear(parseInt(yearId, 10));

    // Re-render current module with new year context
    if (state.currentModule) {
        navigateTo(state.currentModule);
    }
};

/**
 * Called when the user changes the term selector.
 */
window.onTermSelectorChange = async function (termId) {
    if (!termId) return;
    updateState('selectedTermId', parseInt(termId, 10));
    computePhase();

    // Re-render current module with new term context
    if (state.currentModule) {
        navigateTo(state.currentModule);
    }
};

/* ═══════════════════════════════════════════════════════════════════
   SECTION 21 — SEARCH
   ═══════════════════════════════════════════════════════════════════ */

// window.openGlobalSearch        → js/core/search-engine.js
// window.closeGlobalSearch       → js/core/search-engine.js
// window.onGlobalSearchInput     → js/core/search-engine.js

/* ═══════════════════════════════════════════════════════════════════
   SECTION 22 — KEYBOARD SHORTCUTS (Global)
   ═══════════════════════════════════════════════════════════════════ */

document.addEventListener('keydown', function (e) {
    // Escape: close open modal
    if (e.key === 'Escape') {
        if (typeof closeModal === 'function') closeModal();
        if (typeof closeAllDropdowns === 'function') closeAllDropdowns();
    }

    // Ctrl/Cmd + K: open global search
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        if (typeof openGlobalSearch === 'function') openGlobalSearch();
    }

    // Ctrl/Cmd + Shift + L: logout
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'L') {
        e.preventDefault();
        if (state.currentUser && typeof logout === 'function') logout();
    }
});

/* ═══════════════════════════════════════════════════════════════════
   SECTION 23 — SANITY CHECK (development only)
   Logs missing critical functions to the console on load.
   Remove or gate with a DEV flag before production.
   ═══════════════════════════════════════════════════════════════════ */

(function _sanityCheck() {
    const REQUIRED = [
        'navigateTo', 'doLogin', 'logout', 'checkSession',
        'loadAllData', 'renderLoginPage', 'boot',
        'getAll', 'insert', 'update', 'remove', 'upsert',
        'showToast', 'showModal', 'closeModal',
        'updateState', 'getActiveYear', 'getActiveTerm', 'isHolidayMode',
        'calcMG', 'calcEX', 'calcTOT', 'getGrade', 'isPassing',
        'computeStudentFeeSummary', 'allocatePaymentFIFO',
        'esc', 'fmtCurrency', 'fmtDate', 'amountInWords',
        'logAction', 'safeRenderModule', 'canAccess',
        'renderSidebar', 'renderTopbar', 'renderShell',
    ];

    const missing = REQUIRED.filter(fn => typeof window[fn] !== 'function');
    if (missing.length > 0) {
        console.warn(
            '[WindowExposure] The following required functions are not on window:\n' +
            missing.map(f => `  • ${f}`).join('\n') +
            '\nCheck load order in index.html.'
        );
    } else {
        console.info('[WindowExposure] All critical functions verified on window.');
    }
})();

/* ═══════════════════════════════════════════════════════════════════
   SECTION 24 — VERSION STAMP
   ═══════════════════════════════════════════════════════════════════ */

window.APP_BUILD = {
    name: APP_NAME,
    version: APP_VERSION,
    built: new Date().toISOString().split('T')[0],
};

console.info(
    `%c${APP_NAME} %cv${APP_VERSION}`,
    'color:#c44536;font-weight:800;font-size:14px;',
    'color:#6b5f56;font-size:12px;'
);