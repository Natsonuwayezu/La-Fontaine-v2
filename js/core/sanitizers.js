/* ═══════════════════════════════════════════════════════════════════
   js/core/sanitizers.js
   ═══════════════════════════════════════════════════════════════════
   Purpose : All XSS-prevention helpers, safe DOM insertion wrappers,
             and input cleaning functions.
             CRITICAL: Every piece of user-controlled data that goes
             into innerHTML MUST pass through esc() or safeHTML().
             (Part 10.7 — Critical never-do rules)
   Load order: AFTER utils.js (uses esc()), BEFORE all modules.
   ═══════════════════════════════════════════════════════════════════ */

'use strict';

/* ═══════════════════════════════════════════════════════════════════
   1. CORE SANITIZATION
   ═══════════════════════════════════════════════════════════════════ */

/**
 * ALLOWED_TAGS: The only tags permitted inside safeHTML().
 * Designed for rich-text content in announcements and descriptions.
 * Script, style, iframe, object, embed etc. are never allowed.
 */
const ALLOWED_TAGS = new Set([
    'p', 'br', 'strong', 'b', 'em', 'i', 'u', 's',
    'h3', 'h4', 'h5',
    'ul', 'ol', 'li',
    'span', 'div', 'small',
    'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td',
    'a',                    // href only — sanitized further
    'img',                  // src only — sanitized further
    'hr',
]);

/**
 * ALLOWED_ATTRS: Per-tag allowed attributes.
 * All other attributes are stripped silently.
 */
const ALLOWED_ATTRS = {
    '*'    : ['class', 'style', 'id', 'title', 'data-id'],
    'a'    : ['href', 'target', 'rel'],
    'img'  : ['src', 'alt', 'width', 'height'],
    'td'   : ['colspan', 'rowspan'],
    'th'   : ['colspan', 'rowspan', 'scope'],
};

/**
 * Dangerous attribute patterns — stripped even if the attr is allowed.
 * Catches: onerror, onclick, javascript: hrefs, data: src etc.
 */
const DANGEROUS_ATTR_PATTERN = /^(on\w+|javascript:|data:|vbscript:)/i;

/**
 * Sanitize an HTML string to allow only ALLOWED_TAGS and ALLOWED_ATTRS.
 * Any tag or attribute not in the whitelist is stripped.
 * NEVER use this for raw SQL inputs — use cleanInput() for that.
 *
 * @param {string} html - untrusted HTML from DB or user input
 * @returns {string}    - sanitized HTML safe to use in innerHTML
 */
function safeHTML(html) {
    if (!html) return '';

    // Parse into a DOM fragment in an isolated context
    const doc      = document.implementation.createHTMLDocument('');
    const template = doc.createElement('template');
    template.innerHTML = String(html);

    // Walk all nodes and sanitize
    _sanitizeNode(template.content);

    return template.innerHTML;
}

/**
 * Recursively sanitize a DOM subtree in place.
 * @param {Node} node
 */
function _sanitizeNode(node) {
    const children = [...node.childNodes];

    for (const child of children) {
        if (child.nodeType === Node.TEXT_NODE) continue; // text is safe

        if (child.nodeType === Node.ELEMENT_NODE) {
            const tag = child.tagName.toLowerCase();

            // Remove disallowed tags (keep their text content)
            if (!ALLOWED_TAGS.has(tag)) {
                while (child.firstChild) {
                    node.insertBefore(child.firstChild, child);
                }
                node.removeChild(child);
                continue;
            }

            // Sanitize attributes
            const attrs = [...child.attributes];
            for (const attr of attrs) {
                const name = attr.name.toLowerCase();
                const val  = attr.value;

                // Check if attribute is allowed for this tag or globally
                const tagAttrs  = ALLOWED_ATTRS[tag]  || [];
                const starAttrs = ALLOWED_ATTRS['*']   || [];
                const isAllowed = tagAttrs.includes(name) || starAttrs.includes(name);

                if (!isAllowed) {
                    child.removeAttribute(attr.name);
                    continue;
                }

                // Check dangerous value patterns
                if (DANGEROUS_ATTR_PATTERN.test(val.trim())) {
                    child.removeAttribute(attr.name);
                    continue;
                }

                // Force target="_blank" on links to open safely
                if (tag === 'a' && name === 'href') {
                    child.setAttribute('rel', 'noopener noreferrer');
                    child.setAttribute('target', '_blank');
                }
            }

            // Recurse into children
            _sanitizeNode(child);

        } else if (child.nodeType === Node.COMMENT_NODE) {
            // Remove HTML comments — can hide malicious content
            node.removeChild(child);
        }
    }
}

/* ═══════════════════════════════════════════════════════════════════
   2. SAFE DOM INSERTION HELPERS
   ═══════════════════════════════════════════════════════════════════ */

/**
 * Safely set the textContent of an element.
 * Use for single values that should never contain HTML.
 *
 * @param {string|HTMLElement} selector - CSS selector or element
 * @param {string}             value
 */
function safeText(selector, value) {
    const el = typeof selector === 'string'
        ? document.querySelector(selector)
        : selector;
    if (el) el.textContent = value ?? '';
}

/**
 * Safely set innerHTML using sanitized HTML.
 * Use for announcement bodies, notes, or any rich-text content.
 *
 * @param {string|HTMLElement} selector
 * @param {string}             html - will be sanitized before insertion
 */
function safeInnerHTML(selector, html) {
    const el = typeof selector === 'string'
        ? document.querySelector(selector)
        : selector;
    if (el) el.innerHTML = safeHTML(html);
}

/**
 * Set innerHTML directly when the content is KNOWN SAFE (generated
 * entirely by app code, not from user/DB input).
 * This is intentionally named differently to make it findable in code review.
 *
 * RULE: Only call this when EVERY dynamic value has gone through esc().
 * NEVER call this with raw DB values, user input, or external data.
 *
 * @param {string|HTMLElement} selector
 * @param {string}             trustedHTML - developer-generated HTML
 */
function setHTML(selector, trustedHTML) {
    const el = typeof selector === 'string'
        ? document.querySelector(selector)
        : selector;
    if (el) el.innerHTML = trustedHTML;
}

/**
 * Append a trusted HTML string to a container.
 */
function appendHTML(selector, trustedHTML) {
    const el = typeof selector === 'string'
        ? document.querySelector(selector)
        : selector;
    if (el) el.insertAdjacentHTML('beforeend', trustedHTML);
}

/**
 * Replace the content of the #app container with trusted HTML.
 * This is the main render function used by all modules.
 *
 * @param {string} trustedHTML - fully-escaped markup
 */
function renderApp(trustedHTML) {
    const app = document.getElementById('app');
    if (!app) {
        console.error('[Sanitizers] #app element not found in DOM.');
        return;
    }
    app.innerHTML = trustedHTML;
}

/* ═══════════════════════════════════════════════════════════════════
   3. INPUT CLEANING
   Used before saving any user-typed value to the DB.
   ═══════════════════════════════════════════════════════════════════ */

/**
 * Trim whitespace from a string and return null if empty.
 * Use before saving any text field to the DB.
 */
function cleanInput(val) {
    if (val === null || val === undefined) return null;
    const s = String(val).trim();
    return s === '' ? null : s;
}

/**
 * Clean and normalize a name field.
 * - Trims whitespace
 * - Collapses internal multiple spaces to single space
 * - Uppercases (names are stored uppercase in this system — Part 5.1)
 */
function cleanName(val) {
    if (!val) return null;
    return String(val)
        .trim()
        .replace(/\s+/g, ' ')
        .toUpperCase();
}

/**
 * Clean a phone number — remove non-digit characters except + and spaces.
 */
function cleanPhone(val) {
    if (!val) return null;
    const s = String(val).trim().replace(/[^\d+\s\-()]/g, '');
    return s || null;
}

/**
 * Clean an email — trim and lowercase.
 */
function cleanEmail(val) {
    if (!val) return null;
    const s = String(val).trim().toLowerCase();
    return s || null;
}

/**
 * Clean a numeric input — parse to float, return null if not a valid number.
 */
function cleanNumber(val) {
    if (val === null || val === undefined || val === '') return null;
    const n = parseFloat(String(val).replace(/,/g, '').trim());
    return isNaN(n) ? null : n;
}

/**
 * Clean an integer input.
 */
function cleanInt(val) {
    if (val === null || val === undefined || val === '') return null;
    const n = parseInt(String(val).replace(/,/g, '').trim(), 10);
    return isNaN(n) ? null : n;
}

/**
 * Clean a date input — normalise to 'YYYY-MM-DD' or return null.
 */
function cleanDate(val) {
    if (!val) return null;
    const s = String(val).trim();
    // Already ISO
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    // Try native Date parse
    const d = new Date(s);
    if (!isNaN(d.getTime())) {
        return d.toISOString().split('T')[0];
    }
    return null;
}

/**
 * Clean a boolean input.
 * Accepts true/false, 'true'/'false', 1/0, 'yes'/'no'.
 */
function cleanBool(val) {
    if (val === true  || val === 1 || val === 'true'  || val === 'yes' || val === '1') return true;
    if (val === false || val === 0 || val === 'false' || val === 'no'  || val === '0') return false;
    return null;
}

/**
 * Strip a string down to safe URL-compatible characters.
 * Used to sanitize URLs entered by users in school settings.
 */
function cleanURL(val) {
    if (!val) return null;
    const s = String(val).trim();
    // Only allow http:// and https:// protocols
    if (!/^https?:\/\//i.test(s)) return null;
    // Remove any script-injection attempts
    if (/javascript:|data:|vbscript:/i.test(s)) return null;
    return s;
}

/**
 * Clean a form data object by applying cleanInput() to all string values
 * and cleanNumber() to all numeric values.
 *
 * @param {Object} formData   - raw form object
 * @param {string[]} numericFields - field names that should be numeric
 * @param {string[]} nameFields    - field names to apply cleanName()
 * @param {string[]} dateFields    - field names to apply cleanDate()
 * @param {string[]} boolFields    - field names to apply cleanBool()
 */
function cleanFormData(formData, {
    numericFields = [],
    nameFields    = [],
    dateFields    = [],
    boolFields    = [],
} = {}) {
    const cleaned = {};

    for (const [key, val] of Object.entries(formData)) {
        if (numericFields.includes(key)) {
            cleaned[key] = cleanNumber(val);
        } else if (nameFields.includes(key)) {
            cleaned[key] = cleanName(val);
        } else if (dateFields.includes(key)) {
            cleaned[key] = cleanDate(val);
        } else if (boolFields.includes(key)) {
            cleaned[key] = cleanBool(val);
        } else {
            cleaned[key] = cleanInput(val);
        }
    }

    return cleaned;
}

/* ═══════════════════════════════════════════════════════════════════
   4. FORM SERIALIZATION
   ═══════════════════════════════════════════════════════════════════ */

/**
 * Serialize all named inputs from a form into a plain object.
 * Handles text, select, checkbox, radio, textarea, and hidden inputs.
 *
 * @param {string|HTMLFormElement} formOrId - form element or its ID
 * @returns {Object} field name → raw string value
 */
function serializeForm(formOrId) {
    const form = typeof formOrId === 'string'
        ? document.getElementById(formOrId)
        : formOrId;

    if (!form) return {};

    const data = {};
    const inputs = form.querySelectorAll('input, select, textarea');

    inputs.forEach(el => {
        const name = el.name || el.id;
        if (!name) return;

        if (el.type === 'checkbox') {
            data[name] = el.checked;
        } else if (el.type === 'radio') {
            if (el.checked) data[name] = el.value;
        } else {
            data[name] = el.value;
        }
    });

    return data;
}

/**
 * Populate a form with values from an object.
 * Useful for pre-filling edit forms.
 *
 * @param {string|HTMLFormElement} formOrId
 * @param {Object} values
 */
function populateForm(formOrId, values) {
    const form = typeof formOrId === 'string'
        ? document.getElementById(formOrId)
        : formOrId;
    if (!form || !values) return;

    Object.entries(values).forEach(([key, val]) => {
        const el = form.querySelector(`[name="${key}"], #${key}`);
        if (!el) return;

        if (el.type === 'checkbox') {
            el.checked = Boolean(val);
        } else if (el.type === 'radio') {
            const radio = form.querySelector(`[name="${key}"][value="${val}"]`);
            if (radio) radio.checked = true;
        } else {
            el.value = val ?? '';
        }
    });
}

/**
 * Clear all inputs in a form back to empty/default.
 */
function clearForm(formOrId) {
    const form = typeof formOrId === 'string'
        ? document.getElementById(formOrId)
        : formOrId;
    if (!form) return;
    form.querySelectorAll('input, select, textarea').forEach(el => {
        if (el.type === 'checkbox' || el.type === 'radio') {
            el.checked = false;
        } else {
            el.value = '';
        }
        el.classList.remove('field-error', 'field-valid');
    });
    form.querySelectorAll('.field-error-msg').forEach(el => el.remove());
}

/* ═══════════════════════════════════════════════════════════════════
   5. FIELD-LEVEL VISUAL FEEDBACK
   ═══════════════════════════════════════════════════════════════════ */

/**
 * Mark a form field as having an error, showing a message below it.
 *
 * @param {string|HTMLElement} fieldOrId
 * @param {string}             message
 */
function markFieldError(fieldOrId, message) {
    const el = typeof fieldOrId === 'string'
        ? document.getElementById(fieldOrId)
        : fieldOrId;
    if (!el) return;

    el.classList.add('field-error');
    el.classList.remove('field-valid');

    // Remove any existing error message
    const parent = el.parentElement;
    const existing = parent.querySelector('.field-error-msg');
    if (existing) existing.remove();

    // Insert error message
    const msg = document.createElement('span');
    msg.className   = 'field-error-msg';
    msg.textContent = message;
    parent.appendChild(msg);
}

/**
 * Mark a form field as valid (clear error state).
 */
function markFieldValid(fieldOrId) {
    const el = typeof fieldOrId === 'string'
        ? document.getElementById(fieldOrId)
        : fieldOrId;
    if (!el) return;

    el.classList.remove('field-error');
    el.classList.add('field-valid');

    const parent = el.parentElement;
    const existing = parent?.querySelector('.field-error-msg');
    if (existing) existing.remove();
}

/**
 * Clear all field-level error states in a container.
 */
function clearFieldErrors(containerOrId) {
    const el = typeof containerOrId === 'string'
        ? document.getElementById(containerOrId)
        : containerOrId;
    if (!el) return;
    el.querySelectorAll('.field-error').forEach(f => f.classList.remove('field-error'));
    el.querySelectorAll('.field-valid').forEach(f => f.classList.remove('field-valid'));
    el.querySelectorAll('.field-error-msg').forEach(m => m.remove());
}

/* ═══════════════════════════════════════════════════════════════════
   6. CONTENT SECURITY POLICY GUARD
   ═══════════════════════════════════════════════════════════════════ */

/**
 * Safe event handler attachment that avoids inline onclick= handlers.
 * Attaches a click handler to elements matching a selector inside a
 * container, using data-* attributes to pass parameters.
 *
 * Example usage in rendered HTML:
 *   <button data-action="edit" data-id="${esc(id)}">Edit</button>
 *
 * Then in JS:
 *   delegateEvent('#students-list', 'click', '[data-action]', (el) => {
 *       const action = el.dataset.action;
 *       const id = el.dataset.id;
 *       if (action === 'edit') openEditModal(id);
 *   });
 *
 * @param {string}   containerSelector - CSS selector of the container
 * @param {string}   eventType         - 'click', 'change', etc.
 * @param {string}   targetSelector    - CSS selector for matching children
 * @param {Function} handler           - callback(targetElement, event)
 */
function delegateEvent(containerSelector, eventType, targetSelector, handler) {
    const container = typeof containerSelector === 'string'
        ? document.querySelector(containerSelector)
        : containerSelector;
    if (!container) return;

    container.addEventListener(eventType, function (e) {
        const target = e.target.closest(targetSelector);
        if (target && container.contains(target)) {
            handler(target, e);
        }
    });
}

/**
 * Attach a delegated click handler to the #app container.
 * Useful for top-level module event wiring.
 */
function onAppClick(targetSelector, handler) {
    delegateEvent('#app', 'click', targetSelector, handler);
}

/* ═══════════════════════════════════════════════════════════════════
   EXPOSE
   ═══════════════════════════════════════════════════════════════════ */

window.safeHTML        = safeHTML;
window.safeText        = safeText;
window.safeInnerHTML   = safeInnerHTML;
window.setHTML         = setHTML;
window.appendHTML      = appendHTML;
window.renderApp       = renderApp;
window.cleanInput      = cleanInput;
window.cleanName       = cleanName;
window.cleanPhone      = cleanPhone;
window.cleanEmail      = cleanEmail;
window.cleanNumber     = cleanNumber;
window.cleanInt        = cleanInt;
window.cleanDate       = cleanDate;
window.cleanBool       = cleanBool;
window.cleanURL        = cleanURL;
window.cleanFormData   = cleanFormData;
window.serializeForm   = serializeForm;
window.populateForm    = populateForm;
window.clearForm       = clearForm;
window.markFieldError  = markFieldError;
window.markFieldValid  = markFieldValid;
window.clearFieldErrors= clearFieldErrors;
window.delegateEvent   = delegateEvent;
window.onAppClick      = onAppClick;