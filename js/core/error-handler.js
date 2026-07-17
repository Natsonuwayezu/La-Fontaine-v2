/* ═══════════════════════════════════════════════════════════════════
   js/core/error-handler.js
   ═══════════════════════════════════════════════════════════════════
   Purpose : Global error boundary for the app.
             Catches window.onerror and unhandledrejection,
             shows a user-friendly error overlay instead of a blank
             screen, and writes to system_logs via logError().
             Also exports a safeRun() wrapper for module functions.
   Load order: AFTER logger.js — ideally one of the first scripts
               loaded so it catches all subsequent errors.
   ═══════════════════════════════════════════════════════════════════ */

'use strict';

/* ─────────────────────────────────────────────────────────────────
   GLOBAL UNCAUGHT ERROR HANDLER
   ───────────────────────────────────────────────────────────────── */

/**
 * Handle uncaught synchronous errors.
 * Called by the browser for errors not inside try/catch.
 */
window.onerror = function (message, source, lineno, colno, error) {
    const context = `${source || 'unknown'}:${lineno}:${colno}`;
    _handleError(error || new Error(String(message)), context);
    return false; // Don't suppress the default console output
};

/**
 * Handle uncaught Promise rejections.
 * Covers async functions that throw without a catch.
 */
window.addEventListener('unhandledrejection', (event) => {
    const err = event.reason;
    const context = 'unhandledrejection';
    _handleError(err instanceof Error ? err : new Error(String(err)), context);
});

/* ─────────────────────────────────────────────────────────────────
   INTERNAL ERROR PROCESSOR
   ───────────────────────────────────────────────────────────────── */

// Track recent errors to avoid toast flooding
const _recentErrors = [];
const MAX_RECENT = 10;
const ERROR_COOLDOWN = 2000; // ms — don't toast the same message twice within 2s

function _handleError(err, context = '') {
    const message = err?.message || String(err);
    const now = Date.now();

    // Deduplicate: skip if same message appeared within cooldown
    const isDuplicate = _recentErrors.some(e =>
        e.message === message && (now - e.time) < ERROR_COOLDOWN
    );

    // Track this error
    _recentErrors.push({ message, time: now });
    if (_recentErrors.length > MAX_RECENT) _recentErrors.shift();

    // Log to DB silently — logError never throws
    logError(err, context).catch(() => { });

    // Don't show toast for network/offline errors — offline.js handles those
    const isOfflineError = message.includes('OFFLINE') ||
        message.includes('Failed to fetch') ||
        message.includes('NetworkError');
    if (isOfflineError) return;

    // Don't show toast for cancelled fetch (e.g. navigation)
    const isAbortError = message.includes('AbortError') ||
        message.includes('The user aborted');
    if (isAbortError) return;

    if (!isDuplicate && typeof showToast === 'function') {
        // Show a concise, friendly error message
        const friendlyMsg = _friendlyMessage(message);
        showToast(friendlyMsg, 'error', 6000);
    }

    // For critical render errors (app is blank), show the error overlay
    const app = document.getElementById('app');
    if (app && app.innerHTML.trim() === '') {
        _showErrorOverlay(message, context);
    }

    console.error(`[ErrorHandler] ${context}: ${message}`, err);
}

/* ─────────────────────────────────────────────────────────────────
   FRIENDLY MESSAGE TRANSLATION
   ───────────────────────────────────────────────────────────────── */

/**
 * Convert technical Supabase/JS error messages into user-readable text.
 */
function _friendlyMessage(raw) {
    const r = String(raw || '');

    if (r.includes('Invalid API key') || r.includes('apikey'))
        return 'API key error — check Settings → API Settings.';
    if (r.includes('relation') && r.includes('does not exist'))
        return 'Database table not found. Check your Supabase project.';
    if (r.includes('JWT expired') || r.includes('token is expired'))
        return 'Session expired — please log in again.';
    if (r.includes('unique constraint') || r.includes('duplicate key'))
        return 'This record already exists.';
    if (r.includes('violates not-null') || r.includes('null value in column'))
        return 'A required field is missing. Please fill in all required fields.';
    if (r.includes('violates foreign key'))
        return 'This item is referenced elsewhere and cannot be removed.';
    if (r.includes('permission denied'))
        return 'You do not have permission to perform this action.';
    if (r.includes('timeout') || r.includes('ETIMEDOUT'))
        return 'The request timed out. Check your connection.';
    if (r.length > 120)
        return r.substring(0, 120) + '…';

    return r || 'An unexpected error occurred.';
}

/* ─────────────────────────────────────────────────────────────────
   ERROR OVERLAY  (shown when #app is blank after a fatal error)
   ───────────────────────────────────────────────────────────────── */

/**
 * Render a full-screen error overlay with retry button.
 * Only shown when the app main area has completely failed to render.
 */
function _showErrorOverlay(message, context) {
    const app = document.getElementById('app');
    if (!app) return;

    app.innerHTML = `
        <div class="error-overlay" role="alert">
            <div class="error-overlay-card">
                <svg class="error-overlay-icon" width="48" height="48" viewBox="0 0 24 24"
                     fill="none" stroke="var(--danger,#c44536)" stroke-width="1.5">
                    <circle cx="12" cy="12" r="10"/>
                    <line x1="12" y1="8" x2="12" y2="12"/>
                    <line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
                <h2 class="error-overlay-title">Something went wrong</h2>
                <p class="error-overlay-message">${esc(_friendlyMessage(message))}</p>
                ${context ? `<p class="error-overlay-context">${esc(context)}</p>` : ''}
                <div class="error-overlay-actions">
                    <button class="btn btn-primary" onclick="location.reload()">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                             stroke="currentColor" stroke-width="2">
                            <polyline points="23 4 23 10 17 10"/>
                            <path d="M20.49 15a9 9 0 11-2.12-9.36L23 10"/>
                        </svg>
                        Reload App
                    </button>
                    <button class="btn btn-secondary" onclick="window.navigateTo && navigateTo(window.DEFAULT_MODULE && DEFAULT_MODULE[window.state?.currentUser?.role] || 'admin-dashboard')">
                        Go to Dashboard
                    </button>
                </div>
            </div>
        </div>`;
}

/* ─────────────────────────────────────────────────────────────────
   SAFE RUN WRAPPER
   ───────────────────────────────────────────────────────────────── */

/**
 * Wrap an async module function so errors are caught and displayed
 * gracefully without crashing the whole app.
 *
 * Usage:
 *   async function renderStudentList() { ... }
 *   window.renderStudentList = safeRun(renderStudentList, 'student-list');
 *
 * @param {Function} fn        - async function to wrap
 * @param {string}   [context] - label for error logging
 * @param {*}        [fallback]- value to return on error (default null)
 */
function safeRun(fn, context = 'unknown', fallback = null) {
    return async function (...args) {
        try {
            return await fn.apply(this, args);
        } catch (err) {
            _handleError(err, context);
            return fallback;
        }
    };
}

/**
 * Wrap a synchronous function similarly.
 */
function safeRunSync(fn, context = 'unknown', fallback = null) {
    return function (...args) {
        try {
            return fn.apply(this, args);
        } catch (err) {
            _handleError(err, context);
            return fallback;
        }
    };
}

/* ─────────────────────────────────────────────────────────────────
   MODULE RENDER SAFETY NET
   ───────────────────────────────────────────────────────────────── */

/**
 * Render a module safely. If the render function throws,
 * show a partial error message inside #app instead of blank screen.
 *
 * @param {string}   moduleId - for error context
 * @param {Function} renderFn - async function that writes to #app
 */
async function safeRenderModule(moduleId, renderFn) {
    try {
        await renderFn();
    } catch (err) {
        _handleError(err, `render:${moduleId}`);

        const container = document.getElementById('moduleContent');
        if (container) {
            container.innerHTML = `
                <div class="module-error" role="alert">
                    <div class="module-error-inner">
                        <svg width="32" height="32" viewBox="0 0 24 24" fill="none"
                             stroke="var(--danger,#c44536)" stroke-width="1.5">
                            <circle cx="12" cy="12" r="10"/>
                            <line x1="12" y1="8" x2="12" y2="12"/>
                            <line x1="12" y1="16" x2="12.01" y2="16"/>
                        </svg>
                        <h3>Failed to load this module</h3>
                        <p>${esc(_friendlyMessage(err?.message || 'Unknown error'))}</p>
                        <div style="display:flex;gap:8px;margin-top:16px;flex-wrap:wrap;">
                            <button class="btn btn-primary btn-sm" onclick="navigateTo('${esc(moduleId)}')">
                                Retry
                            </button>
                            <button class="btn btn-secondary btn-sm" onclick="navigateTo('${esc(DEFAULT_MODULE[myRole()] || 'admin-dashboard')}')">
                                Go to Dashboard
                            </button>
                        </div>
                    </div>
                </div>`;
        }
    }
}

/* ─────────────────────────────────────────────────────────────────
   API ERROR HELPER
   ───────────────────────────────────────────────────────────────── */

/**
 * Display a user-friendly error when a specific API call fails.
 * Call in the catch block of any module-level fetch.
 *
 * @param {Error}  err      - the caught error
 * @param {string} [action] - what the user was trying to do
 */
function handleApiError(err, action = 'complete this action') {
    const msg = `Failed to ${action}. ${_friendlyMessage(err?.message || '')}`;
    if (typeof showToast === 'function') {
        showToast(msg, 'error', 6000);
    }
    logError(err, action).catch(() => { });
    console.error(`[API Error] ${action}:`, err);
}

/* ─────────────────────────────────────────────────────────────────
   EXPOSE
   ───────────────────────────────────────────────────────────────── */

window.safeRun = safeRun;
window.safeRunSync = safeRunSync;
window.safeRenderModule = safeRenderModule;
window.handleApiError = handleApiError;