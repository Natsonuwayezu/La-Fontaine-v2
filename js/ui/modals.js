/* ═══════════════════════════════════════════════════════════════════
   js/ui/modals.js — Modal System
   ═══════════════════════════════════════════════════════════════════
   Purpose: Complete modal management with stacking, animations,
   and Promise-based confirm dialogs.

   Features:
   - Show/hide modals with custom HTML content
   - Promise-based confirm dialog (returns boolean)
   - Modal stacking (multiple modals at once)
   - Keyboard support (Escape to close)
   - Click outside to close
   - Auto-focus management
   - Customizable sizes and animations

   Usage:
     // Simple modal
     showModal('<h2>Hello</h2><p>Content here</p>', { title: 'My Modal' });

     // Confirm dialog
     const confirmed = await confirmDialog('Are you sure?', 'Delete Item');
     if (confirmed) { do delete  }

     // Close all modals
     closeAllModals();

   Last updated: 2026-07-14
   ═══════════════════════════════════════════════════════════════════ */

/* ═══════════════════════════════════════════════════════════════════
   STATE
   ═══════════════════════════════════════════════════════════════════ */

let modalStack = [];
let activeModalId = null;
let modalIdCounter = 0;

// Store resolve/reject for confirm dialogs
let confirmResolve = null;
let confirmReject = null;

/* ═══════════════════════════════════════════════════════════════════
   DEFAULT CONFIGURATION
   ═══════════════════════════════════════════════════════════════════ */

const DEFAULT_CONFIG = {
    size: 'md',           // 'xs', 'sm', 'md', 'lg', 'xl', 'full'
    closeOnOutside: true,
    closeOnEscape: true,
    showClose: true,
    animation: 'slideUp', // 'fade', 'slideUp', 'slideDown', 'scale'
    backdropBlur: true,
    title: '',
    footer: '',
    className: '',
    onOpen: null,
    onClose: null
};

/* ═══════════════════════════════════════════════════════════════════
   CORE FUNCTIONS
   ═══════════════════════════════════════════════════════════════════ */

/**
 * Show a modal with custom content
 * @param {string} content - HTML content for the modal body
 * @param {object} options - Modal configuration
 * @param {string} options.size - 'xs', 'sm', 'md', 'lg', 'xl', 'full'
 * @param {boolean} options.closeOnOutside - Click outside to close
 * @param {boolean} options.closeOnEscape - Escape key to close
 * @param {boolean} options.showClose - Show close button in header
 * @param {string} options.animation - 'fade', 'slideUp', 'slideDown', 'scale'
 * @param {boolean} options.backdropBlur - Apply blur to backdrop
 * @param {string} options.title - Modal title (shown in header)
 * @param {string} options.footer - HTML for footer section
 * @param {string} options.className - Additional CSS classes
 * @param {function} options.onOpen - Called when modal opens
 * @param {function} options.onClose - Called when modal closes
 * @returns {string} The modal ID (for programmatic closing)
 */
export function showModal(content, options = {}) {
    const config = { ...DEFAULT_CONFIG, ...options };
    const id = `modal-${++modalIdCounter}`;

    const sizeMap = {
        xs: 'modal-xs',
        sm: 'modal-sm',
        md: 'modal-md',
        lg: 'modal-lg',
        xl: 'modal-xl',
        full: 'modal-full'
    };

    const sizeClass = sizeMap[config.size] || 'modal-md';
    const animationClass = `modal-${config.animation}` || 'modal-slideUp';
    const blurClass = config.backdropBlur ? 'modal-blur' : '';

    // Build modal HTML
    const modalHtml = `
        <div class="modal-overlay ${blurClass} ${config.className}" id="${id}" data-modal-id="${id}">
            <div class="modal ${sizeClass} ${animationClass}" role="dialog" aria-modal="true" aria-labelledby="${id}-title">
                ${config.title || config.showClose ? `
                <div class="modal-header">
                    ${config.title ? `<h3 id="${id}-title">${config.title}</h3>` : ''}
                    ${config.showClose ? `<button class="modal-close" onclick="window.closeModal('${id}')" aria-label="Close modal">✕</button>` : ''}
                </div>
                ` : ''}
                <div class="modal-body">
                    ${content}
                </div>
                ${config.footer ? `
                <div class="modal-footer">
                    ${config.footer}
                </div>
                ` : ''}
            </div>
        </div>
    `;

    // Append to container
    const container = document.getElementById('modals-container');
    if (container) {
        container.insertAdjacentHTML('beforeend', modalHtml);
    } else {
        // Fallback: append to body
        const wrapper = document.createElement('div');
        wrapper.id = 'modals-container';
        document.body.appendChild(wrapper);
        wrapper.insertAdjacentHTML('beforeend', modalHtml);
    }

    // Store in stack
    modalStack.push(id);
    activeModalId = id;

    // Focus management
    const modalEl = document.getElementById(id);
    if (modalEl) {
        // Trap focus inside modal
        const focusable = modalEl.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
        if (focusable.length) {
            setTimeout(() => focusable[0].focus(), 100);
        }

        // Click outside to close
        if (config.closeOnOutside) {
            modalEl.addEventListener('click', (e) => {
                if (e.target === e.currentTarget) {
                    closeModal(id);
                }
            });
        }
    }

    // Call onOpen callback
    if (config.onOpen) {
        setTimeout(() => config.onOpen(id), 50);
    }

    // Dispatch event
    document.dispatchEvent(new CustomEvent('modalOpen', {
        detail: { id, config }
    }));

    return id;
}

/**
 * Close a specific modal by ID
 * @param {string} id - The modal ID to close
 * @param {boolean} skipAnimation - Skip close animation
 */
export function closeModal(id, skipAnimation = false) {
    if (!id) {
        // Close the topmost modal
        if (modalStack.length === 0) return;
        id = modalStack[modalStack.length - 1];
    }

    const modalEl = document.getElementById(id);
    if (!modalEl) return;

    // Get config from data attribute or find in stack
    const config = modalEl._modalConfig || {};

    // Call onClose callback
    if (config.onClose) {
        config.onClose(id);
    }

    if (skipAnimation) {
        removeModal(id);
        return;
    }

    // Animate out
    const modalContent = modalEl.querySelector('.modal');
    if (modalContent) {
        modalContent.classList.add('modal-closing');
        modalContent.style.animation = 'modalOut 0.25s ease forwards';
    }

    // Remove after animation
    setTimeout(() => {
        removeModal(id);
    }, 300);
}

/**
 * Remove modal from DOM and update stack
 * @param {string} id - The modal ID to remove
 */
function removeModal(id) {
    const modalEl = document.getElementById(id);
    if (modalEl) {
        modalEl.remove();
    }

    // Remove from stack
    modalStack = modalStack.filter(mId => mId !== id);

    if (activeModalId === id) {
        activeModalId = modalStack.length > 0 ? modalStack[modalStack.length - 1] : null;
    }

    // Dispatch event
    document.dispatchEvent(new CustomEvent('modalClose', {
        detail: { id }
    }));
}

/**
 * Close all open modals
 * @param {boolean} skipAnimation - Skip close animations
 */
export function closeAllModals(skipAnimation = false) {
    const ids = [...modalStack];
    for (const id of ids) {
        closeModal(id, skipAnimation);
    }
}

/**
 * Get the currently active modal ID
 * @returns {string|null} The active modal ID or null
 */
export function getActiveModal() {
    return activeModalId;
}

/**
 * Check if a modal is currently open
 * @returns {boolean} True if any modal is open
 */
export function isModalOpen() {
    return modalStack.length > 0;
}

/**
 * Get the modal element by ID
 * @param {string} id - The modal ID
 * @returns {HTMLElement|null} The modal element or null
 */
export function getModalElement(id) {
    return document.getElementById(id);
}

/**
 * Update modal content
 * @param {string} id - The modal ID
 * @param {string} content - New HTML content
 */
export function updateModalContent(id, content) {
    const modalEl = document.getElementById(id);
    if (!modalEl) return;

    const body = modalEl.querySelector('.modal-body');
    if (body) {
        body.innerHTML = content;
    }
}

/**
 * Update modal title
 * @param {string} id - The modal ID
 * @param {string} title - New title
 */
export function updateModalTitle(id, title) {
    const modalEl = document.getElementById(id);
    if (!modalEl) return;

    const header = modalEl.querySelector('.modal-header h3, .modal-header h2, .modal-header h4');
    if (header) {
        header.textContent = title;
    }
}

/**
 * Update modal footer
 * @param {string} id - The modal ID
 * @param {string} footer - New footer HTML
 */
export function updateModalFooter(id, footer) {
    const modalEl = document.getElementById(id);
    if (!modalEl) return;

    const footerEl = modalEl.querySelector('.modal-footer');
    if (footerEl) {
        footerEl.innerHTML = footer;
    }
}

/* ═══════════════════════════════════════════════════════════════════
   CONFIRM DIALOG
   ═══════════════════════════════════════════════════════════════════ */

/**
 * Show a confirm dialog and return a Promise
 * @param {string} message - The confirmation message
 * @param {string} title - Dialog title (optional)
 * @param {object} options - Additional options
 * @param {string} options.confirmText - Text for confirm button
 * @param {string} options.cancelText - Text for cancel button
 * @param {string} options.confirmClass - CSS class for confirm button
 * @param {string} options.size - Modal size
 * @returns {Promise<boolean>} True if confirmed, false if cancelled
 */
export function confirmDialog(message, title = 'Confirm', options = {}) {
    return new Promise((resolve, reject) => {
        const {
            confirmText = 'Confirm',
            cancelText = 'Cancel',
            confirmClass = 'btn-danger',
            size = 'sm'
        } = options;

        const id = `confirm-${Date.now()}`;

        // Store resolve/reject
        confirmResolve = resolve;
        confirmReject = reject;

        const content = `
            <div style="display:flex; flex-direction:column; gap:12px;">
                <div style="display:flex; align-items:flex-start; gap:12px;">
                    <div style="font-size:24px; flex-shrink:0; margin-top:2px;">⚠️</div>
                    <div style="font-size:15px; line-height:1.6; color:var(--text-body, #2c241e);">
                        ${message}
                    </div>
                </div>
            </div>
        `;

        const footer = `
            <button class="btn btn-ghost" onclick="window._confirmDialog(false)">${cancelText}</button>
            <button class="btn ${confirmClass}" onclick="window._confirmDialog(true)">${confirmText}</button>
        `;

        // Register global resolver
        window._confirmDialog = (result) => {
            if (confirmResolve) {
                confirmResolve(result);
                confirmResolve = null;
                confirmReject = null;
            }
            // Close any modal with 'confirm-' in its ID
            const modalId = modalStack.find(mId => mId.startsWith('confirm-'));
            if (modalId) {
                closeModal(modalId);
            }
        };

        const modalId = showModal(content, {
            title: title,
            footer: footer,
            size: size,
            closeOnOutside: false,
            closeOnEscape: true,
            className: 'confirm-modal',
            onClose: () => {
                // If closed without clicking a button, reject
                if (confirmResolve) {
                    confirmResolve(false);
                    confirmResolve = null;
                    confirmReject = null;
                }
            }
        });

        // Store the ID for cleanup
        if (modalId) {
            const modalEl = document.getElementById(modalId);
            if (modalEl) {
                modalEl.dataset.confirmId = id;
            }
        }
    });
}

/**
 * Show an alert dialog (similar to alert() but styled)
 * @param {string} message - The alert message
 * @param {string} title - Dialog title (optional)
 * @param {object} options - Additional options
 * @param {string} options.buttonText - Text for the button
 * @param {string} options.size - Modal size
 * @returns {Promise<void>}
 */
export function alertDialog(message, title = 'Alert', options = {}) {
    return new Promise((resolve) => {
        const {
            buttonText = 'OK',
            size = 'sm'
        } = options;

        const content = `
            <div style="display:flex; flex-direction:column; gap:12px;">
                <div style="display:flex; align-items:flex-start; gap:12px;">
                    <div style="font-size:24px; flex-shrink:0; margin-top:2px;">ℹ️</div>
                    <div style="font-size:15px; line-height:1.6; color:var(--text-body, #2c241e);">
                        ${message}
                    </div>
                </div>
            </div>
        `;

        const footer = `
            <button class="btn btn-primary" onclick="window._alertDialog()">${buttonText}</button>
        `;

        window._alertDialog = () => {
            const modalId = modalStack.find(mId => mId.startsWith('alert-'));
            if (modalId) {
                closeModal(modalId);
            }
            resolve();
        };

        showModal(content, {
            title: title,
            footer: footer,
            size: size,
            closeOnOutside: false,
            closeOnEscape: true,
            className: 'alert-modal',
            onClose: () => {
                resolve();
            }
        });
    });
}

/* ═══════════════════════════════════════════════════════════════════
   KEYBOARD SHORTCUTS
   ═══════════════════════════════════════════════════════════════════ */

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        const id = getActiveModal();
        if (id) {
            const modalEl = document.getElementById(id);
            // Check if modal allows Escape to close
            const closeOnEscape = modalEl?._closeOnEscape !== false;
            if (closeOnEscape) {
                closeModal(id);
            }
        }
    }
});

/* ═══════════════════════════════════════════════════════════════════
   EXPOSE TO WINDOW (for onclick handlers)
   ═══════════════════════════════════════════════════════════════════ */

window.showModal = showModal;
window.closeModal = closeModal;
window.closeAllModals = closeAllModals;
window.confirmDialog = confirmDialog;
window.alertDialog = alertDialog;
window.isModalOpen = isModalOpen;
window.getActiveModal = getActiveModal;

/* ═══════════════════════════════════════════════════════════════════
   EXPORTS
   ═══════════════════════════════════════════════════════════════════ */

export default {
    showModal,
    closeModal,
    closeAllModals,
    confirmDialog,
    alertDialog,
    getActiveModal,
    isModalOpen,
    getModalElement,
    updateModalContent,
    updateModalTitle,
    updateModalFooter
};

export {
    showModal,
    closeModal,
    closeAllModals,
    confirmDialog,
    alertDialog,
    getActiveModal,
    isModalOpen,
    getModalElement,
    updateModalContent,
    updateModalTitle,
    updateModalFooter
};