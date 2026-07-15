/* ═══════════════════════════════════════════════════════════════════
   js/ui/toast.js — Toast Notification System
   ═══════════════════════════════════════════════════════════════════
   Purpose: Show beautiful toast notifications with Font Awesome icons,
   auto-dismiss, and full dark mode support.

   Usage:
     import { showToast, clearAllToasts } from './toast.js';

     // Simple
     showToast('Payment recorded successfully', 'success');

     // With options
     showToast('Marks saved for 28 students', 'success', {
       title: 'Marks Entry Complete',
       duration: 5000
     });

     // Types: success, error, warning, info, reminder, notification

   Matches toast.html design with warm, rich colors.

   Last updated: 2026-07-14
   ═══════════════════════════════════════════════════════════════════ */

/* ═══════════════════════════════════════════════════════════════════
   CONFIGURATION
   ═══════════════════════════════════════════════════════════════════ */

const TOAST_ICONS = {
    success: 'fa-check-circle',
    error: 'fa-times-circle',
    warning: 'fa-triangle-exclamation',
    info: 'fa-circle-info',
    reminder: 'fa-clock',
    notification: 'fa-bell'
};

const TOAST_TITLES = {
    success: 'Success',
    error: 'Error',
    warning: 'Warning',
    info: 'Info',
    reminder: 'Reminder',
    notification: 'Notification'
};

const TOAST_COLORS = {
    success: '#3a7a5a',
    error: '#c45a4a',
    warning: '#b8983a',
    info: '#4a7a8a',
    reminder: '#8a6aaa',
    notification: '#6b5f56'
};

const TOAST_BG_COLORS = {
    success: '#dce8e0',
    error: '#f0e0dc',
    warning: '#f0e8d0',
    info: '#dce8ec',
    reminder: '#e8dcec',
    notification: '#f0ebe6'
};

let toastCounter = 0;
let containerEl = null;

/* ═══════════════════════════════════════════════════════════════════
   CONTAINER MANAGEMENT
   ═══════════════════════════════════════════════════════════════════ */

/**
 * Get or create the toast container element
 * @returns {HTMLElement} The toast container
 */
function getToastContainer() {
    if (containerEl) return containerEl;

    containerEl = document.getElementById('toast-container');
    if (!containerEl) {
        containerEl = document.createElement('div');
        containerEl.id = 'toast-container';
        document.body.appendChild(containerEl);
    }

    return containerEl;
}

/**
 * Escape HTML to prevent XSS
 * @param {string} str - String to escape
 * @returns {string} Escaped string
 */
function esc(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/* ═══════════════════════════════════════════════════════════════════
   TOAST API
   ═══════════════════════════════════════════════════════════════════ */

/**
 * Show a toast notification
 * @param {string} message - The message to display
 * @param {string} type - 'success', 'error', 'warning', 'info', 'reminder', 'notification'
 * @param {object} options - Configuration options
 * @param {string} options.title - Custom title (overrides default)
 * @param {number} options.duration - Auto-dismiss time in ms (0 = no auto-dismiss)
 * @param {string} options.icon - Custom Font Awesome icon class
 * @param {string} options.className - Additional CSS class for the toast
 * @param {boolean} options.silent - If true, don't show toast (for internal use)
 * @returns {string} The toast element ID (for manual dismissal)
 */
function showToast(message, type = 'info', options = {}) {
    const {
        title = null,
        duration = 4000,
        icon = null,
        className = '',
        silent = false
    } = options;

    // If silent, just log and return
    if (silent) {
        console.log(`[Toast] ${type}: ${message}`);
        return null;
    }

    const container = getToastContainer();

    // Build toast
    const toast = document.createElement('div');
    const id = 'toast-' + (++toastCounter);
    toast.id = id;
    toast.className = `toast ${type} ${className}`;

    const iconClass = icon || TOAST_ICONS[type] || 'fa-circle-info';
    const titleText = title || TOAST_TITLES[type] || 'Notification';
    const color = TOAST_COLORS[type] || '#4a7a8a';
    const bgColor = TOAST_BG_COLORS[type] || '#dce8ec';

    toast.style.setProperty('--toast-color', color);

    if (duration > 0) {
        toast.style.setProperty('--toast-duration', duration + 'ms');
    }

    toast.innerHTML = `
        <div class="toast-icon" style="color:${color}; background:${bgColor};">
            <i class="fa-solid ${iconClass}"></i>
        </div>
        <div class="toast-content">
            <div class="toast-title">${esc(titleText)}</div>
            <div class="toast-message">${esc(message)}</div>
        </div>
        <button class="toast-close" onclick="window._dismissToast('${id}')" aria-label="Dismiss">
            <i class="fa-solid fa-xmark"></i>
        </button>
        ${duration > 0 ? `<div class="toast-progress" style="--toast-duration: ${duration}ms; background:${color};"></div>` : ''}
    `;

    container.appendChild(toast);

    // Auto-dismiss
    if (duration > 0) {
        const timer = setTimeout(() => {
            dismissToast(id);
        }, duration);
        toast._timer = timer;
    }

    updateCounter();
    return id;
}

/**
 * Dismiss a specific toast by ID
 * @param {string} id - The toast element ID
 */
function dismissToast(id) {
    const toast = document.getElementById(id);
    if (!toast) return;

    // Clear any pending timer
    if (toast._timer) {
        clearTimeout(toast._timer);
        toast._timer = null;
    }

    toast.classList.add('hiding');
    toast.addEventListener('animationend', () => {
        if (toast.parentNode) {
            toast.remove();
            updateCounter();
        }
    }, { once: true });

    // Fallback if animationend doesn't fire
    setTimeout(() => {
        if (toast.parentNode) {
            toast.remove();
            updateCounter();
        }
    }, 350);
}

/**
 * Dismiss a toast by ID (exposed globally for onclick handlers)
 * @param {string} id - The toast element ID
 */
function dismissToastById(id) {
    dismissToast(id);
}

/**
 * Clear all active toasts
 */
function clearAllToasts() {
    const container = getToastContainer();
    const toasts = container.querySelectorAll('.toast:not(.hiding)');

    toasts.forEach((toast) => {
        if (toast._timer) {
            clearTimeout(toast._timer);
            toast._timer = null;
        }
        toast.classList.add('hiding');
        setTimeout(() => {
            if (toast.parentNode) {
                toast.remove();
            }
        }, 300);
    });

    setTimeout(updateCounter, 400);
}

/**
 * Update the toast counter for any badge displays
 */
function updateCounter() {
    const container = getToastContainer();
    const count = container.querySelectorAll('.toast:not(.hiding)').length;

    // Dispatch event for any listeners
    document.dispatchEvent(new CustomEvent('toastCountUpdate', {
        detail: { count }
    }));

    // Update global callback if set
    if (window._toastCountUpdate) {
        window._toastCountUpdate(count);
    }
}

/* ═══════════════════════════════════════════════════════════════════
   CONVENIENCE WRAPPERS
   ═══════════════════════════════════════════════════════════════════ */

/**
 * Show a success toast
 * @param {string} message - The message
 * @param {object} options - Toast options
 */
function toastSuccess(message, options = {}) {
    return showToast(message, 'success', options);
}

/**
 * Show an error toast
 * @param {string} message - The message
 * @param {object} options - Toast options
 */
function toastError(message, options = {}) {
    return showToast(message, 'error', options);
}

/**
 * Show a warning toast
 * @param {string} message - The message
 * @param {object} options - Toast options
 */
function toastWarning(message, options = {}) {
    return showToast(message, 'warning', options);
}

/**
 * Show an info toast
 * @param {string} message - The message
 * @param {object} options - Toast options
 */
function toastInfo(message, options = {}) {
    return showToast(message, 'info', options);
}

/**
 * Show a reminder toast
 * @param {string} message - The message
 * @param {object} options - Toast options
 */
function toastReminder(message, options = {}) {
    return showToast(message, 'reminder', options);
}

/**
 * Show a notification toast
 * @param {string} message - The message
 * @param {object} options - Toast options
 */
function toastNotification(message, options = {}) {
    return showToast(message, 'notification', options);
}

/* ═══════════════════════════════════════════════════════════════════
   EXPOSE GLOBALLY (for onclick handlers)
   ═══════════════════════════════════════════════════════════════════ */

window.showToast = showToast;
window._dismissToast = dismissToastById;
window.clearAllToasts = clearAllToasts;