/**
 * ECOLE LA FONTAINE — Toast Notifications
 * Matches toast.html design with Font Awesome icons
 * Last updated: 2026-07-07
 */

// ─── Configuration ──────────────────────────────────────────────────
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
    success: '#10b981',
    error: '#ef4444',
    warning: '#f59e0b',
    info: '#3b82f6',
    reminder: '#8b5cf6',
    notification: '#64748b'
};

let toastCounter = 0;
let containerEl = null;

// ─── Get or create container ──────────────────────────────────────
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

// ─── Show Toast ────────────────────────────────────────────────────
export function showToast(message, type = 'info', options = {}) {
    const {
        title = null,
        duration = 4000,
        icon = null,
        className = ''
    } = options;

    const container = getToastContainer();

    // Build toast
    const toast = document.createElement('div');
    const id = 'toast-' + (++toastCounter);
    toast.id = id;
    toast.className = `toast ${type} ${className}`;

    const iconClass = icon || TOAST_ICONS[type] || 'fa-circle-info';
    const titleText = title || TOAST_TITLES[type] || 'Notification';
    const color = TOAST_COLORS[type] || '#3b82f6';

    toast.style.setProperty('--toast-color', color);
    if (duration > 0) {
        toast.style.setProperty('--toast-duration', duration + 'ms');
    }

    toast.innerHTML = `
        <div class="toast-icon" style="color:${color};">
            <i class="fa ${iconClass}"></i>
        </div>
        <div class="toast-content">
            <div class="toast-title">${esc(titleText)}</div>
            <div class="toast-message">${esc(message)}</div>
        </div>
        <button class="toast-close" onclick="window._dismissToast('${id}')" aria-label="Dismiss">
            <i class="fa fa-xmark"></i>
        </button>
        ${duration > 0 ? `<div class="toast-progress" style="--toast-duration: ${duration}ms;background:${color};"></div>` : ''}
    `;

    container.appendChild(toast);

    // Auto-dismiss
    if (duration > 0) {
        setTimeout(() => {
            dismissToast(id);
        }, duration);
    }

    updateCounter();
    return id;
}

// ─── Dismiss Toast ─────────────────────────────────────────────────
function dismissToast(id) {
    const toast = document.getElementById(id);
    if (!toast) return;

    toast.classList.add('hiding');
    setTimeout(() => {
        if (toast.parentNode) {
            toast.remove();
            updateCounter();
        }
    }, 300);
}

// ─── Clear All Toasts ─────────────────────────────────────────────
export function clearAllToasts() {
    const container = getToastContainer();
    const toasts = container.querySelectorAll('.toast');
    toasts.forEach(toast => {
        toast.classList.add('hiding');
        setTimeout(() => {
            if (toast.parentNode) {
                toast.remove();
            }
        }, 300);
    });
    setTimeout(updateCounter, 400);
}

// ─── Update Counter ───────────────────────────────────────────────
function updateCounter() {
    const container = getToastContainer();
    const count = container.querySelectorAll('.toast:not(.hiding)').length;
    // Store count for badge if needed
    if (window._toastCountUpdate) {
        window._toastCountUpdate(count);
    }
}

// ─── Escape HTML ──────────────────────────────────────────────────
function esc(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// ─── Expose globally ──────────────────────────────────────────────
window.showToast = showToast;
window._dismissToast = dismissToast;
window.clearAllToasts = clearAllToasts;

// ─── Add CSS if not present ───────────────────────────────────────
(function injectToastStyles() {
    // Check if styles already exist
    if (document.getElementById('toast-styles')) return;

    const style = document.createElement('style');
    style.id = 'toast-styles';
    style.textContent = `
        #toast-container {
            position: fixed;
            top: 20px;
            right: 20px;
            z-index: 9999;
            display: flex;
            flex-direction: column;
            gap: 10px;
            max-width: 420px;
            width: 100%;
            pointer-events: none;
        }

        .toast {
            pointer-events: auto;
            background: white;
            border-radius: 12px;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.12);
            padding: 14px 18px;
            display: flex;
            align-items: flex-start;
            gap: 14px;
            border: 1px solid #e2e8f0;
            animation: toastIn 0.35s cubic-bezier(0.22, 1, 0.36, 1);
            position: relative;
            overflow: hidden;
        }

        .toast.hiding {
            animation: toastOut 0.3s ease forwards;
        }

        .toast .toast-icon {
            font-size: 20px;
            flex-shrink: 0;
            width: 34px;
            height: 34px;
            display: flex;
            align-items: center;
            justify-content: center;
            border-radius: 50%;
            background: rgba(0,0,0,0.04);
        }

        .toast .toast-content {
            flex: 1;
            min-width: 0;
        }

        .toast .toast-title {
            font-weight: 600;
            font-size: 14px;
            margin-bottom: 2px;
            color: #0a1628;
        }

        .toast .toast-message {
            font-size: 13px;
            color: #475569;
            line-height: 1.4;
            word-break: break-word;
        }

        .toast .toast-close {
            background: none;
            border: none;
            cursor: pointer;
            color: #94a3b8;
            font-size: 16px;
            padding: 4px;
            flex-shrink: 0;
            transition: color 0.2s;
            border-radius: 6px;
            line-height: 1;
            margin-top: -2px;
        }

        .toast .toast-close:hover {
            color: #0a1628;
            background: #f1f5f9;
        }

        .toast .toast-progress {
            position: absolute;
            bottom: 0;
            left: 0;
            height: 3px;
            border-radius: 0 0 0 12px;
            animation: toastProgress var(--toast-duration, 4s) linear forwards;
        }

        /* ─── Toast Variants ──────────────────────────────────────── */
        .toast.success { border-left: 4px solid #10b981; }
        .toast.success .toast-icon { color: #10b981; background: #d1fae5; }

        .toast.error { border-left: 4px solid #ef4444; }
        .toast.error .toast-icon { color: #ef4444; background: #fee2e2; }

        .toast.warning { border-left: 4px solid #f59e0b; }
        .toast.warning .toast-icon { color: #f59e0b; background: #fef3c7; }

        .toast.info { border-left: 4px solid #3b82f6; }
        .toast.info .toast-icon { color: #3b82f6; background: #dbeafe; }

        .toast.reminder { border-left: 4px solid #8b5cf6; }
        .toast.reminder .toast-icon { color: #8b5cf6; background: #ede9fe; }

        .toast.notification { border-left: 4px solid #64748b; }
        .toast.notification .toast-icon { color: #64748b; background: #f1f5f9; }

        /* ─── Animations ──────────────────────────────────────────── */
        @keyframes toastIn {
            from { opacity: 0; transform: translateX(30px) scale(0.96); }
            to { opacity: 1; transform: translateX(0) scale(1); }
        }

        @keyframes toastOut {
            from { opacity: 1; transform: translateX(0) scale(1); }
            to { opacity: 0; transform: translateX(30px) scale(0.96); }
        }

        @keyframes toastProgress {
            from { width: 100%; }
            to { width: 0%; }
        }

        /* ─── Dark mode support ───────────────────────────────────── */
        [data-theme="dark"] .toast {
            background: #1e293b;
            border-color: rgba(255,255,255,0.06);
        }

        [data-theme="dark"] .toast .toast-title {
            color: #f1f5f9;
        }

        [data-theme="dark"] .toast .toast-message {
            color: #94a3b8;
        }

        [data-theme="dark"] .toast .toast-close {
            color: #64748b;
        }

        [data-theme="dark"] .toast .toast-close:hover {
            color: #f1f5f9;
            background: rgba(255,255,255,0.06);
        }

        [data-theme="dark"] .toast.success .toast-icon {
            background: rgba(16,185,129,0.15);
        }

        [data-theme="dark"] .toast.error .toast-icon {
            background: rgba(239,68,68,0.15);
        }

        [data-theme="dark"] .toast.warning .toast-icon {
            background: rgba(245,158,11,0.15);
        }

        [data-theme="dark"] .toast.info .toast-icon {
            background: rgba(59,130,246,0.15);
        }

        [data-theme="dark"] .toast.reminder .toast-icon {
            background: rgba(139,92,246,0.15);
        }

        [data-theme="dark"] .toast.notification .toast-icon {
            background: rgba(100,116,139,0.15);
        }

        /* ─── Responsive ───────────────────────────────────────────── */
        @media (max-width: 768px) {
            #toast-container {
                top: 12px;
                right: 12px;
                left: 12px;
                max-width: none;
            }

            .toast {
                padding: 12px 14px;
                font-size: 13px;
            }
        }

        @media (max-width: 480px) {
            .toast .toast-icon {
                font-size: 16px;
                width: 28px;
                height: 28px;
            }

            .toast .toast-title {
                font-size: 13px;
            }

            .toast .toast-message {
                font-size: 12px;
            }
        }
    `;
    document.head.appendChild(style);
})();

console.log('✅ Toast system loaded — use showToast(message, type, options)');
console.log('   Types: success, error, warning, info, reminder, notification');
console.log('   Options: { title, duration, icon, className }');