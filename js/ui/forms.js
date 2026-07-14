/* ═══════════════════════════════════════════════════════════════════
   js/ui/forms.js — Form management utilities
   ═══════════════════════════════════════════════════════════════════
   Purpose: Simplify form handling — serialization, validation,
   clearing, and dynamic field creation.

   Works with css/components/forms.css for styling.

   Usage:
     import { serializeForm, validateForm, clearForm, buildField } from './forms.js';

     const data = serializeForm(document.getElementById('my-form'));
     const errors = validateForm(document.getElementById('my-form'));
     clearForm(document.getElementById('my-form'));

   Last updated: 2026-07-14
   ═══════════════════════════════════════════════════════════════════ */

/* ═══════════════════════════════════════════════════════════════════
   CONSTANTS
   ═══════════════════════════════════════════════════════════════════ */

const INPUT_SELECTORS = 'input, select, textarea, button, datalist, output';
const FOCUSABLE_SELECTORS = 'input:not([type="hidden"]), select, textarea, button:not([type="button"]), [tabindex]:not([tabindex="-1"])';

/* ═══════════════════════════════════════════════════════════════════
   SERIALIZATION
   ═══════════════════════════════════════════════════════════════════ */

/**
 * Serialize form data into an object
 * @param {HTMLFormElement} form - The form element
 * @param {object} options - Configuration options
 * @param {boolean} options.includeDisabled - Include disabled fields (default: false)
 * @param {boolean} options.includeButtons - Include button values (default: false)
 * @param {string} options.nullValue - Value to use for empty fields (default: null)
 * @returns {object} Key-value pairs of form data
 */
export function serializeForm(form, options = {}) {
    if (!form || !(form instanceof HTMLFormElement)) {
        console.warn('[Forms] serializeForm: Invalid form element');
        return {};
    }

    const {
        includeDisabled = false,
        includeButtons = false,
        nullValue = null
    } = options;

    const formData = new FormData(form);
    const data = {};

    // Get all form elements
    const elements = form.querySelectorAll(INPUT_SELECTORS);

    for (const el of elements) {
        // Skip buttons unless explicitly included
        if (!includeButtons && (el.type === 'submit' || el.type === 'button' || el.type === 'reset')) {
            continue;
        }

        // Skip disabled fields unless explicitly included
        if (!includeDisabled && el.disabled) {
            continue;
        }

        const name = el.name || el.id;
        if (!name) continue;

        let value;

        // Handle different input types
        if (el.type === 'checkbox') {
            value = el.checked;
        } else if (el.type === 'radio') {
            if (el.checked) {
                value = el.value;
            } else {
                // Skip unchecked radio buttons
                continue;
            }
        } else if (el.type === 'number' || el.type === 'range') {
            value = el.value !== '' ? parseFloat(el.value) : nullValue;
        } else if (el.type === 'date' || el.type === 'datetime-local' || el.type === 'time' || el.type === 'month' || el.type === 'week') {
            value = el.value !== '' ? el.value : nullValue;
        } else if (el.tagName === 'SELECT') {
            if (el.multiple) {
                value = Array.from(el.selectedOptions).map(opt => opt.value);
            } else {
                value = el.value !== '' ? el.value : nullValue;
            }
        } else {
            value = el.value !== '' ? el.value : nullValue;
        }

        // Handle multiple values (checkboxes with same name)
        if (data.hasOwnProperty(name)) {
            if (!Array.isArray(data[name])) {
                data[name] = [data[name]];
            }
            if (value !== null && value !== undefined) {
                data[name].push(value);
            }
        } else {
            data[name] = value;
        }
    }

    return data;
}

/**
 * Serialize form data into a URL-encoded string
 * @param {HTMLFormElement} form - The form element
 * @param {object} options - Same as serializeForm options
 * @returns {string} URL-encoded form data
 */
export function serializeFormEncoded(form, options = {}) {
    const data = serializeForm(form, options);
    return Object.entries(data)
        .filter(([_, value]) => value !== null && value !== undefined)
        .map(([key, value]) => {
            if (Array.isArray(value)) {
                return value.map(v => `${encodeURIComponent(key)}=${encodeURIComponent(v)}`).join('&');
            }
            return `${encodeURIComponent(key)}=${encodeURIComponent(value)}`;
        })
        .join('&');
}

/* ═══════════════════════════════════════════════════════════════════
   VALIDATION
   ═══════════════════════════════════════════════════════════════════ */

/**
 * Validate a form against its constraints
 * @param {HTMLFormElement} form - The form element
 * @param {object} customRules - Custom validation rules { fieldName: (value) => true|string }
 * @returns {object} { valid: boolean, errors: { field: message } }
 */
export function validateForm(form, customRules = {}) {
    if (!form || !(form instanceof HTMLFormElement)) {
        console.warn('[Forms] validateForm: Invalid form element');
        return { valid: false, errors: { _form: 'Invalid form element' } };
    }

    const errors = {};
    let valid = true;

    // 1. HTML5 constraint validation
    const elements = form.querySelectorAll(INPUT_SELECTORS);

    for (const el of elements) {
        // Skip disabled and readonly fields
        if (el.disabled || el.readOnly) continue;

        // Skip fields without validation attributes
        if (!el.required && !el.pattern && !el.min && !el.max && !el.minLength && !el.maxLength) continue;

        const name = el.name || el.id;
        if (!name) continue;

        if (!el.validity.valid) {
            valid = false;
            if (!errors[name]) {
                errors[name] = el.validationMessage || `Invalid value for ${name}`;
            }
        }
    }

    // 2. Custom validation rules
    const data = serializeForm(form);

    for (const [field, rule] of Object.entries(customRules)) {
        const value = data[field];
        const result = rule(value, data);

        if (result !== true) {
            valid = false;
            errors[field] = typeof result === 'string' ? result : `Invalid value for ${field}`;
        }
    }

    // 3. Required field validation (for fields without required attribute)
    const requiredFields = form.querySelectorAll('[data-required]');
    for (const el of requiredFields) {
        const name = el.name || el.id;
        if (!name) continue;

        const value = data[name];
        if (value === null || value === undefined || value === '') {
            valid = false;
            errors[name] = errors[name] || `${name} is required`;
        }
    }

    return { valid, errors };
}

/**
 * Get validation errors as a formatted string
 * @param {object} validationResult - Result from validateForm
 * @returns {string} Formatted error messages
 */
export function formatValidationErrors(validationResult) {
    if (validationResult.valid) return '';

    const messages = Object.entries(validationResult.errors)
        .map(([field, msg]) => `${field}: ${msg}`);

    return messages.join('\n');
}

/**
 * Show validation errors in the UI
 * @param {HTMLFormElement} form - The form element
 * @param {object} errors - Error object from validateForm
 */
export function showValidationErrors(form, errors) {
    if (!form) return;

    // Clear previous errors
    clearValidationErrors(form);

    for (const [field, message] of Object.entries(errors)) {
        // Find the input element
        let el = form.querySelector(`[name="${field}"]`) || form.querySelector(`#${field}`);

        if (!el) continue;

        // Add error class
        el.classList.add('is-invalid');

        // Create error message element
        const errorEl = document.createElement('div');
        errorEl.className = 'invalid-feedback';
        errorEl.textContent = message;
        errorEl.dataset.field = field;
        errorEl.style.cssText = 'display:block;';

        // Insert after the input
        if (el.parentNode) {
            el.parentNode.insertBefore(errorEl, el.nextSibling);
        }
    }
}

/**
 * Clear validation errors from a form
 * @param {HTMLFormElement} form - The form element
 */
export function clearValidationErrors(form) {
    if (!form) return;

    // Remove error classes
    form.querySelectorAll('.is-invalid').forEach(el => {
        el.classList.remove('is-invalid');
    });

    // Remove error messages
    form.querySelectorAll('.invalid-feedback').forEach(el => {
        el.remove();
    });
}

/* ═══════════════════════════════════════════════════════════════════
   FORM CLEARING
   ═══════════════════════════════════════════════════════════════════ */

/**
 * Clear all form fields (reset to default values)
 * @param {HTMLFormElement} form - The form element
 * @param {object} options - Configuration options
 * @param {string|array} options.exclude - Field names to exclude from clearing
 * @param {boolean} options.clearHidden - Clear hidden inputs (default: false)
 * @param {*} options.defaultValue - Default value for empty fields
 */
export function clearForm(form, options = {}) {
    if (!form || !(form instanceof HTMLFormElement)) {
        console.warn('[Forms] clearForm: Invalid form element');
        return;
    }

    const {
        exclude = [],
        clearHidden = false,
        defaultValue = ''
    } = options;

    const excludeSet = new Set(Array.isArray(exclude) ? exclude : [exclude]);

    const elements = form.querySelectorAll(INPUT_SELECTORS);

    for (const el of elements) {
        const name = el.name || el.id;

        // Skip excluded fields
        if (name && excludeSet.has(name)) continue;

        // Skip hidden inputs unless explicitly included
        if (!clearHidden && el.type === 'hidden') continue;

        // Skip disabled fields
        if (el.disabled) continue;

        // Reset based on type
        switch (el.type) {
            case 'checkbox':
            case 'radio':
                el.checked = el.defaultChecked || false;
                break;

            case 'select-one':
            case 'select-multiple':
                el.selectedIndex = -1;
                // Reset to default if available
                if (el.options.length > 0) {
                    for (const opt of el.options) {
                        opt.selected = opt.defaultSelected || false;
                    }
                }
                break;

            case 'range':
                el.value = el.min || '0';
                break;

            default:
                el.value = defaultValue;
        }

        // Remove validation state
        el.classList.remove('is-invalid', 'is-valid');
    }

    // Remove validation messages
    clearValidationErrors(form);

    // Reset form's native validation state
    form.noValidate = false;
}

/**
 * Reset form to its initial state (using form.reset())
 * @param {HTMLFormElement} form - The form element
 */
export function resetForm(form) {
    if (!form || !(form instanceof HTMLFormElement)) {
        console.warn('[Forms] resetForm: Invalid form element');
        return;
    }

    form.reset();
    clearValidationErrors(form);
    form.querySelectorAll('.is-valid').forEach(el => el.classList.remove('is-valid'));
}

/* ═══════════════════════════════════════════════════════════════════
   FIELD BUILDING
   ═══════════════════════════════════════════════════════════════════ */

/**
 * Build a form field HTML string
 * @param {object} config - Field configuration
 * @param {string} config.type - Input type (text, number, select, textarea, checkbox, radio)
 * @param {string} config.name - Field name
 * @param {string} config.label - Field label
 * @param {string} config.id - Field ID (defaults to name)
 * @param {string} config.value - Field value
 * @param {string} config.placeholder - Placeholder text
 * @param {boolean} config.required - Whether the field is required
 * @param {boolean} config.disabled - Whether the field is disabled
 * @param {string} config.helpText - Help text below the field
 * @param {string} config.className - Additional CSS classes
 * @param {array} config.options - Options for select/radio (array of { value, label })
 * @param {string} config.rows - Rows for textarea
 * @param {string} config.cols - Columns for textarea
 * @param {object} config.attrs - Additional HTML attributes
 * @returns {string} HTML string
 */
export function buildField(config) {
    const {
        type = 'text',
        name,
        label = '',
        id = name,
        value = '',
        placeholder = '',
        required = false,
        disabled = false,
        helpText = '',
        className = '',
        options = [],
        rows = 3,
        cols = 30,
        attrs = {}
    } = config;

    if (!name) {
        console.warn('[Forms] buildField: name is required');
        return '';
    }

    const requiredAttr = required ? ' required' : '';
    const disabledAttr = disabled ? ' disabled' : '';
    const classAttr = className ? ` ${className}` : '';

    // Build attributes string
    const attrsStr = Object.entries(attrs)
        .map(([k, v]) => `${k}="${v}"`)
        .join(' ');

    let inputHtml = '';

    switch (type) {
        case 'textarea':
            inputHtml = `
                <textarea
                    id="${id}"
                    name="${name}"
                    rows="${rows}"
                    cols="${cols}"
                    placeholder="${placeholder}"
                    ${requiredAttr}
                    ${disabledAttr}
                    ${attrsStr}
                    class="form-control${classAttr}"
                >${value}</textarea>
            `;
            break;

        case 'select':
            const optionsHtml = options.map(opt => `
                <option value="${opt.value}" ${opt.value === value ? 'selected' : ''}>
                    ${opt.label || opt.value}
                </option>
            `).join('');
            inputHtml = `
                <select
                    id="${id}"
                    name="${name}"
                    ${requiredAttr}
                    ${disabledAttr}
                    ${attrsStr}
                    class="form-control${classAttr}"
                >
                    ${optionsHtml}
                </select>
            `;
            break;

        case 'checkbox':
            const checkedAttr = value ? ' checked' : '';
            inputHtml = `
                <input
                    type="checkbox"
                    id="${id}"
                    name="${name}"
                    value="${value || 'on'}"
                    ${checkedAttr}
                    ${requiredAttr}
                    ${disabledAttr}
                    ${attrsStr}
                    class="form-check-input${classAttr}"
                />
                ${label ? `<label for="${id}" class="form-check-label">${label}</label>` : ''}
            `;
            break;

        case 'radio':
            const radioOptions = options.map(opt => `
                <div class="form-check">
                    <input
                        type="radio"
                        id="${id}_${opt.value}"
                        name="${name}"
                        value="${opt.value}"
                        ${opt.value === value ? 'checked' : ''}
                        ${requiredAttr}
                        ${disabledAttr}
                        ${attrsStr}
                        class="form-check-input${classAttr}"
                    />
                    <label for="${id}_${opt.value}" class="form-check-label">${opt.label || opt.value}</label>
                </div>
            `).join('');
            inputHtml = `<div class="form-check-group">${radioOptions}</div>`;
            break;

        default:
            inputHtml = `
                <input
                    type="${type}"
                    id="${id}"
                    name="${name}"
                    value="${value}"
                    placeholder="${placeholder}"
                    ${requiredAttr}
                    ${disabledAttr}
                    ${attrsStr}
                    class="form-control${classAttr}"
                />
            `;
            break;
    }

    // For checkbox and radio, the label is already included in the input
    const labelHtml = (type !== 'checkbox' && type !== 'radio' && label) ? `
        <label for="${id}" class="form-label">${label}${required ? ' <span class="text-danger">*</span>' : ''}</label>
    ` : '';

    const helpHtml = helpText ? `
        <small class="field-hint">${helpText}</small>
    ` : '';

    return `
        <div class="form-group" data-field="${name}">
            ${labelHtml}
            ${inputHtml}
            ${helpHtml}
        </div>
    `;
}

/**
 * Build multiple fields at once
 * @param {array} fields - Array of field configurations
 * @returns {string} Combined HTML string
 */
export function buildFields(fields) {
    return fields.map(field => buildField(field)).join('');
}

/* ═══════════════════════════════════════════════════════════════════
   FIELD HELPERS
   ═══════════════════════════════════════════════════════════════════ */

/**
 * Get the value of a form field
 * @param {HTMLFormElement} form - The form element
 * @param {string} name - Field name
 * @returns {*} Field value
 */
export function getFieldValue(form, name) {
    if (!form) return null;

    const el = form.querySelector(`[name="${name}"]`) || form.querySelector(`#${name}`);
    if (!el) return null;

    if (el.type === 'checkbox') return el.checked;
    if (el.type === 'radio') {
        const checked = form.querySelector(`[name="${name}"]:checked`);
        return checked ? checked.value : null;
    }
    if (el.tagName === 'SELECT' && el.multiple) {
        return Array.from(el.selectedOptions).map(opt => opt.value);
    }

    return el.value;
}

/**
 * Set the value of a form field
 * @param {HTMLFormElement} form - The form element
 * @param {string} name - Field name
 * @param {*} value - New value
 */
export function setFieldValue(form, name, value) {
    if (!form) return;

    const el = form.querySelector(`[name="${name}"]`) || form.querySelector(`#${name}`);
    if (!el) return;

    if (el.type === 'checkbox') {
        el.checked = !!value;
    } else if (el.type === 'radio') {
        const radio = form.querySelector(`[name="${name}"][value="${value}"]`);
        if (radio) radio.checked = true;
    } else if (el.tagName === 'SELECT' && el.multiple) {
        const values = Array.isArray(value) ? value : [value];
        for (const opt of el.options) {
            opt.selected = values.includes(opt.value);
        }
    } else {
        el.value = value !== null && value !== undefined ? value : '';
    }

    // Trigger change event
    el.dispatchEvent(new Event('change', { bubbles: true }));
}

/**
 * Set multiple field values at once
 * @param {HTMLFormElement} form - The form element
 * @param {object} data - Key-value pairs of field values
 */
export function setFormValues(form, data) {
    if (!form || !data) return;

    for (const [name, value] of Object.entries(data)) {
        setFieldValue(form, name, value);
    }
}

/* ═══════════════════════════════════════════════════════════════════
   FIELD FOCUS
   ═══════════════════════════════════════════════════════════════════ */

/**
 * Focus the first focusable field in a form
 * @param {HTMLFormElement} form - The form element
 * @returns {HTMLElement|null} The focused element
 */
export function focusFirstField(form) {
    if (!form) return null;

    const first = form.querySelector(FOCUSABLE_SELECTORS);
    if (first) {
        first.focus();
        // Select text content for input fields
        if (first.tagName === 'INPUT' && (first.type === 'text' || first.type === 'number' || first.type === 'search')) {
            first.select();
        }
        return first;
    }
    return null;
}

/**
 * Focus the next field (for tab navigation simulation)
 * @param {HTMLFormElement} form - The form element
 * @param {string} currentName - Current field name
 * @returns {HTMLElement|null} The next focused element
 */
export function focusNextField(form, currentName) {
    if (!form) return null;

    const fields = Array.from(form.querySelectorAll(FOCUSABLE_SELECTORS));
    const currentIndex = fields.findIndex(el => (el.name || el.id) === currentName);

    if (currentIndex === -1 || currentIndex === fields.length - 1) {
        return null;
    }

    const next = fields[currentIndex + 1];
    if (next) {
        next.focus();
        return next;
    }
    return null;
}

/* ═══════════════════════════════════════════════════════════════════
   FORM STATE
   ═══════════════════════════════════════════════════════════════════ */

/**
 * Check if a form is dirty (has unsaved changes)
 * @param {HTMLFormElement} form - The form element
 * @returns {boolean} True if the form has changed
 */
export function isFormDirty(form) {
    if (!form) return false;

    // Check if any field value differs from default
    const elements = form.querySelectorAll(INPUT_SELECTORS);

    for (const el of elements) {
        if (el.disabled || el.readOnly) continue;

        let current = el.type === 'checkbox' ? el.checked : el.value;
        let defaultValue = el.defaultValue;

        if (el.type === 'checkbox') {
            defaultValue = el.defaultChecked;
        }

        if (String(current) !== String(defaultValue)) {
            return true;
        }
    }

    return false;
}

/**
 * Enable or disable all fields in a form
 * @param {HTMLFormElement} form - The form element
 * @param {boolean} disabled - Whether to disable or enable
 */
export function setFormDisabled(form, disabled = true) {
    if (!form) return;

    const elements = form.querySelectorAll(INPUT_SELECTORS);
    for (const el of elements) {
        el.disabled = disabled;
    }
}

/**
 * Check if a form is valid (using HTML5 validation)
 * @param {HTMLFormElement} form - The form element
 * @returns {boolean} True if the form is valid
 */
export function isFormValid(form) {
    if (!form) return false;
    return form.checkValidity();
}

/* ═══════════════════════════════════════════════════════════════════
   EXPOSURE
   ═══════════════════════════════════════════════════════════════════ */

// Expose to window for onclick handlers
window.serializeForm = serializeForm;
window.validateForm = validateForm;
window.clearForm = clearForm;
window.resetForm = resetForm;
window.buildField = buildField;
window.buildFields = buildFields;
window.getFieldValue = getFieldValue;
window.setFieldValue = setFieldValue;
window.setFormValues = setFormValues;
window.focusFirstField = focusFirstField;
window.isFormDirty = isFormDirty;
window.setFormDisabled = setFormDisabled;
window.isFormValid = isFormValid;

/* ═══════════════════════════════════════════════════════════════════
   EXPORTS
   ═══════════════════════════════════════════════════════════════════ */

export default {
    // Serialization
    serializeForm,
    serializeFormEncoded,

    // Validation
    validateForm,
    formatValidationErrors,
    showValidationErrors,
    clearValidationErrors,

    // Clearing
    clearForm,
    resetForm,

    // Building
    buildField,
    buildFields,

    // Field helpers
    getFieldValue,
    setFieldValue,
    setFormValues,

    // Focus
    focusFirstField,
    focusNextField,

    // State
    isFormDirty,
    setFormDisabled,
    isFormValid
};