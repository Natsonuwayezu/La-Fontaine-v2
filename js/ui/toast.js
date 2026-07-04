/**
 * ECOLE LA FONTAINE — Toast Notifications
 * Clean, minimal toast system
 * Last updated: 2026-06-28
 */

// ──────────────────────────────────────────────────────────────────────
// TOAST CONFIG
// ──────────────────────────────────────────────────────────────────────

const TOAST_TYPES = {
    success: { icon: '✅', bg: 'var(--success-bg, #d1fae5)', color: 'var(--success, #10b981)' },
    error: { icon: '❌', bg: 'var(--danger-bg, #fee2e2)', color: 'var(--danger, #ef4444)' },
    warning: { icon: '⚠️', bg: 'var(--warning-bg, #fef3c7)', color: 'var(--warning, #f59e0b)' },
    info: { icon: 'ℹ️', bg: 'var(--info-bg, #dbeafe)', color: 'var(--info, #3b82f6)' },
};

let toastTimeout = null;

// ──────────────────────────────────────────────────────────────────────
// SHOW TOAST
// ──────────────────────────────────────────────────────────────────────

/**
 * Show a toast notification
 * @param {string} message - Toast message
 * @param {string} type - 'success' | 'error' | 'warning' | 'info'
 * @param {number} duration - Auto-dismiss time in ms (default 3500)
 */
export function showToast(message, type = 'info', duration = 3500) {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const config = TOAST_TYPES[type] || TOAST_TYPES.info;
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.style.cssText = `
        background: var(--bg-secondary, #fff);
        border: 1px solid var(--border-light, #e2e8f0);
        border-left: 4px solid ${config.color};
        border-radius: 8px;
        padding: 12px 16px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        font-size: 0.875rem;
        max-width: 400px;
        display: flex;
        align-items: center;
        gap: 10px;
        animation: toastIn 0.3s ease;
        margin-bottom: 8px;
    `;

    toast.innerHTML = `
        <span style="font-size: 1.1rem; flex-shrink: 0;">${config.icon}</span>
        <span style="flex: 1;">${esc(message)}</span>
        <button onclick="this.parentElement.remove()" style="background:none;border:none;cursor:pointer;font-size:1rem;color:var(--text-muted);padding:4px;">✕</button>
    `;

    container.appendChild(toast);

    // Auto-dismiss
    if (duration > 0) {
        setTimeout(() => {
            toast.style.animation = 'toastOut 0.3s ease forwards';
            setTimeout(() => toast.remove(), 300);
        }, duration);
    }
}

// ──────────────────────────────────────────────────────────────────────
// TOAST ANIMATIONS (injected once)
// ──────────────────────────────────────────────────────────────────────

(function injectToastStyles() {
    const style = document.createElement('style');
    style.textContent = `
        @keyframes toastIn {
            from { transform: translateX(20px); opacity: 0; }
            to { transform: translateX(0); opacity: 1; }
        }
        @keyframes toastOut {
            from { transform: translateX(0); opacity: 1; }
            to { transform: translateX(20px); opacity: 0; }
        }
    `;
    document.head.appendChild(style);
})();

// ──────────────────────────────────────────────────────────────────────
// EXPOSE GLOBALLY
// ──────────────────────────────────────────────────────────────────────

window.showToast = showToast;