/* ═══════════════════════════════════════════════════════════════════
   js/core/validators.js
   ═══════════════════════════════════════════════════════════════════
   Purpose : All validation logic. Form field validators, the 3-choice
             mark validation popup (Part 5.2), fee amount validators,
             date range validators, and student data validators.
             Returns { valid, errors } objects — never throws directly.
   Load order: AFTER sanitizers.js and utils.js.
   ═══════════════════════════════════════════════════════════════════ */

'use strict';

/* ═══════════════════════════════════════════════════════════════════
   1. GENERIC FIELD VALIDATORS
   Each returns { valid: bool, error: string|null }
   ═══════════════════════════════════════════════════════════════════ */

/**
 * Check a required field is not empty.
 */
function validateRequired(value, label = 'This field') {
    const v = (value === null || value === undefined) ? '' : String(value).trim();
    if (!v) return { valid: false, error: `${label} is required.` };
    return { valid: true, error: null };
}

/**
 * Check a string length is within bounds.
 */
function validateLength(value, { min = 0, max = 255, label = 'This field' } = {}) {
    const s = String(value || '').trim();
    if (s.length < min) return { valid: false, error: `${label} must be at least ${min} characters.` };
    if (s.length > max) return { valid: false, error: `${label} must not exceed ${max} characters.` };
    return { valid: true, error: null };
}

/**
 * Check a value is a valid number within optional range.
 */
function validateNumber(value, { min, max, label = 'Value', integer = false } = {}) {
    const n = parseFloat(String(value || '').replace(/,/g, ''));
    if (isNaN(n)) return { valid: false, error: `${label} must be a valid number.` };
    if (integer && !Number.isInteger(n)) return { valid: false, error: `${label} must be a whole number.` };
    if (min !== undefined && n < min) return { valid: false, error: `${label} must be at least ${min}.` };
    if (max !== undefined && n > max) return { valid: false, error: `${label} must not exceed ${max}.` };
    return { valid: true, error: null };
}

/**
 * Check a value is a valid email.
 */
function validateEmail(value, label = 'Email') {
    if (!value) return { valid: true, error: null }; // optional by default
    if (!isValidEmail(String(value).trim())) {
        return { valid: false, error: `${label} must be a valid email address.` };
    }
    return { valid: true, error: null };
}

/**
 * Check a value is a valid phone number.
 */
function validatePhone(value, label = 'Phone') {
    if (!value) return { valid: true, error: null };
    if (!isValidPhone(String(value).trim())) {
        return { valid: false, error: `${label} must be a valid phone number.` };
    }
    return { valid: true, error: null };
}

/**
 * Check a date string is valid and within optional range.
 * @param {string} value   - ISO date string 'YYYY-MM-DD'
 * @param {{ min?: string, max?: string, label?: string }} [opts]
 */
function validateDate(value, { min, max, label = 'Date' } = {}) {
    if (!value) return { valid: false, error: `${label} is required.` };
    const d = new Date(value);
    if (isNaN(d.getTime())) return { valid: false, error: `${label} is not a valid date.` };
    if (min && value < min) return { valid: false, error: `${label} must not be before ${fmtDate(min)}.` };
    if (max && value > max) return { valid: false, error: `${label} must not be after ${fmtDate(max)}.` };
    return { valid: true, error: null };
}

/**
 * Check that endDate is after startDate.
 */
function validateDateRange(startISO, endISO, { startLabel = 'Start date', endLabel = 'End date' } = {}) {
    if (!startISO || !endISO) return { valid: false, error: 'Both start and end dates are required.' };
    if (endISO <= startISO) {
        return { valid: false, error: `${endLabel} must be after ${startLabel}.` };
    }
    return { valid: true, error: null };
}

/**
 * Check a value is in a given allowed list.
 */
function validateEnum(value, allowed, label = 'Value') {
    if (!allowed.includes(value)) {
        return { valid: false, error: `${label} must be one of: ${allowed.join(', ')}.` };
    }
    return { valid: true, error: null };
}

/* ═══════════════════════════════════════════════════════════════════
   2. MARK VALIDATION  (Part 5.2)
   ═══════════════════════════════════════════════════════════════════
   When a teacher enters a mark that is outside the expected range
   (0 to assessment max_score), the app must show a 3-choice popup:
     1. Correct it  — focus the input so teacher can retype
     2. Record as-is — proceed with the out-of-range value
     3. Mark absent  — save with is_absent=true, score=null

   This popup REPLACES the default browser confirm/alert.
   It is rendered inside the modal overlay, not a browser dialog.
   ═══════════════════════════════════════════════════════════════════ */

/**
 * Validate a single mark input value.
 * @param {number|string} score    - the entered score
 * @param {number}        maxScore - assessment max_score
 * @returns {{ valid: boolean, issue: string|null }}
 *   issue values: null | 'OVER_MAX' | 'NEGATIVE' | 'NOT_NUMBER'
 */
function validateMarkValue(score, maxScore) {
    if (score === '' || score === null || score === undefined) {
        return { valid: true, issue: null }; // empty = not yet entered, OK
    }

    const n = parseFloat(String(score));
    if (isNaN(n)) {
        return { valid: false, issue: 'NOT_NUMBER' };
    }
    if (n < 0) {
        return { valid: false, issue: 'NEGATIVE' };
    }
    if (n > parseFloat(maxScore)) {
        return { valid: false, issue: 'OVER_MAX' };
    }
    return { valid: true, issue: null };
}

/**
 * Show the 3-choice mark validation popup.
 * Returns a Promise that resolves with one of:
 *   'correct'  — teacher wants to fix the value
 *   'save'     — teacher confirms saving as-is
 *   'absent'   — mark as absent
 *
 * @param {object} opts
 * @param {number}  opts.score      - the problematic score
 * @param {number}  opts.maxScore   - assessment max_score
 * @param {string}  opts.studentName
 * @param {string}  opts.assessmentName
 * @param {string}  opts.issue      - 'OVER_MAX' | 'NEGATIVE' | 'NOT_NUMBER'
 * @returns {Promise<'correct'|'save'|'absent'>}
 */
function showMarkValidationPopup({ score, maxScore, studentName, assessmentName, issue }) {
    return new Promise((resolve) => {
        // Build message based on issue type
        let title, message, saveLabel;
        if (issue === 'OVER_MAX') {
            title     = 'Score Exceeds Maximum';
            message   = `You entered <strong>${esc(String(score))}</strong> for <strong>${esc(studentName)}</strong> on <strong>${esc(assessmentName)}</strong>. The maximum score is <strong>${esc(String(maxScore))}</strong>.`;
            saveLabel = `Save ${esc(String(score))} anyway`;
        } else if (issue === 'NEGATIVE') {
            title     = 'Negative Score';
            message   = `You entered <strong>${esc(String(score))}</strong> for <strong>${esc(studentName)}</strong>. Scores cannot be negative.`;
            saveLabel = `Save ${esc(String(score))} anyway`;
        } else {
            title     = 'Invalid Score';
            message   = `The value "<strong>${esc(String(score))}</strong>" is not a valid number for <strong>${esc(studentName)}</strong>.`;
            saveLabel = 'Save as-is';
        }

        // Render the popup inside #modalOverlay (the real shared modal
        // container defined in index.html)
        const overlay = document.getElementById('modalOverlay');
        if (!overlay) {
            // Fallback if modal overlay isn't in DOM yet
            const choice = window.confirm(`${title}\n${studentName}: ${score} (max ${maxScore})\n\nOK = save anyway | Cancel = correct it`);
            resolve(choice ? 'save' : 'correct');
            return;
        }

        overlay.innerHTML = `
            <div class="modal-panel modal-sm" id="mark-validation-popup" style="max-width:420px;">
                <div class="modal-header">
                    <h2>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--warning,#e8a33d)" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                        ${esc(title)}
                    </h2>
                </div>
                <div class="modal-body" style="padding:0 0 4px;">
                    <p style="font-size:0.9rem;color:var(--ink-dim,#5B6478);line-height:1.6;margin-bottom:20px;">${message}</p>
                    <p style="font-size:0.82rem;color:var(--ink-dim,#5B6478);margin-bottom:4px;">What would you like to do?</p>
                </div>
                <div class="modal-footer" style="display:flex;flex-direction:column;gap:8px;padding-top:16px;border-top:1px solid var(--line,#E2E6F0);">
                    <button class="btn btn-primary" id="mvp-correct" style="width:100%;">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 3a2.85 2.83 0 114 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>
                        Correct the score
                    </button>
                    <button class="btn btn-secondary" id="mvp-save" style="width:100%;background:var(--warning,#e8a33d);border-color:var(--warning,#e8a33d);">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
                        ${saveLabel}
                    </button>
                    <button class="btn btn-danger btn-outline" id="mvp-absent" style="width:100%;">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
                        Mark as absent
                    </button>
                </div>
            </div>`;

        overlay.classList.add('show');

        // Attach handlers
        const cleanup = () => {
            overlay.classList.remove('show');
            overlay.innerHTML = '';
        };

        document.getElementById('mvp-correct').addEventListener('click', () => {
            cleanup(); resolve('correct');
        });
        document.getElementById('mvp-save').addEventListener('click', () => {
            cleanup(); resolve('save');
        });
        document.getElementById('mvp-absent').addEventListener('click', () => {
            cleanup(); resolve('absent');
        });
    });
}

/* ═══════════════════════════════════════════════════════════════════
   3. STUDENT FORM VALIDATION  (Part 5.1)
   ═══════════════════════════════════════════════════════════════════ */

/**
 * Validate the student enrollment form data.
 * @param {Object} data - cleaned form data
 * @returns {{ valid: boolean, errors: Object }}
 *   errors = { fieldName: 'error message', ... }
 */
function validateStudentForm(data) {
    const errors = {};

    // First name
    const fnR = validateRequired(data.first_name, 'First name');
    if (!fnR.valid) errors.first_name = fnR.error;

    // Last name
    const lnR = validateRequired(data.last_name, 'Last name');
    if (!lnR.valid) errors.last_name = lnR.error;

    // Gender
    if (!['Male', 'Female'].includes(data.gender)) {
        errors.gender = 'Gender is required.';
    }

    // Date of birth — optional but must be valid if provided
    if (data.date_of_birth) {
        const dob = validateDate(data.date_of_birth, {
            label : 'Date of birth',
            max   : todayISO(),
        });
        if (!dob.valid) errors.date_of_birth = dob.error;
    }

    // Class
    const clsR = validateRequired(data.class_id, 'Class');
    if (!clsR.valid) errors.class_id = clsR.error;

    // Academic year
    const yrR = validateRequired(data.academic_year_id, 'Academic year');
    if (!yrR.valid) errors.academic_year_id = yrR.error;

    // Parent contact — required
    const pcR = validateRequired(data.parent_contact, 'Parent contact');
    if (!pcR.valid) errors.parent_contact = pcR.error;
    else {
        const pv = validatePhone(data.parent_contact, 'Parent contact');
        if (!pv.valid) errors.parent_contact = pv.error;
    }

    // Email — optional
    if (data.parent_email) {
        const em = validateEmail(data.parent_email, 'Parent email');
        if (!em.valid) errors.parent_email = em.error;
    }

    return {
        valid  : Object.keys(errors).length === 0,
        errors,
    };
}

/* ═══════════════════════════════════════════════════════════════════
   4. ASSESSMENT FORM VALIDATION  (Part 2.8)
   ═══════════════════════════════════════════════════════════════════ */

/**
 * Validate the create/edit assessment form.
 * @param {Object} data
 * @param {string} phase - 'pre_midterm' | 'post_midterm'
 */
function validateAssessmentForm(data, phase) {
    const errors = {};

    const nameR = validateRequired(data.name, 'Assessment name');
    if (!nameR.valid) errors.name = nameR.error;

    const typeCheck = validateEnum(data.type, ASSESSMENT_TYPES.all, 'Assessment type');
    if (!typeCheck.valid) errors.type = typeCheck.error;

    // If post_midterm_only type is used in pre_midterm phase, warn
    if (phase === 'pre_midterm' && EX_TYPES.includes(data.type)) {
        errors.type = `"${esc(data.type)}" assessments can only be added in the post-midterm phase.`;
    }

    const clsR = validateRequired(data.class_id, 'Class');
    if (!clsR.valid) errors.class_id = clsR.error;

    const subR = validateRequired(data.subject_id, 'Subject');
    if (!subR.valid) errors.subject_id = subR.error;

    const termR = validateRequired(data.term_id, 'Term');
    if (!termR.valid) errors.term_id = termR.error;

    // max_score must be a positive number
    const maxCheck = validateNumber(data.max_score, {
        min   : 0.1,
        max   : 1000,
        label : 'Maximum score',
    });
    if (!maxCheck.valid) errors.max_score = maxCheck.error;

    // date — optional but if provided must be valid
    if (data.date) {
        const dv = validateDate(data.date, { label: 'Assessment date' });
        if (!dv.valid) errors.date = dv.error;
    }

    return { valid: Object.keys(errors).length === 0, errors };
}

/* ═══════════════════════════════════════════════════════════════════
   5. FEE FORM VALIDATION  (Part 2.14)
   ═══════════════════════════════════════════════════════════════════ */

/**
 * Validate a fee category or fee amount form.
 */
function validateFeeForm(data) {
    const errors = {};

    const nameR = validateRequired(data.name, 'Fee name');
    if (!nameR.valid) errors.name = nameR.error;

    if (data.amount !== undefined) {
        const amtCheck = validateNumber(data.amount, {
            min   : 0,
            label : 'Amount',
        });
        if (!amtCheck.valid) errors.amount = amtCheck.error;
    }

    if (data.frequency) {
        const freqCheck = validateEnum(data.frequency, FEE_FREQUENCIES, 'Frequency');
        if (!freqCheck.valid) errors.frequency = freqCheck.error;
    }

    return { valid: Object.keys(errors).length === 0, errors };
}

/**
 * Validate a payment recording form.
 */
function validatePaymentForm(data) {
    const errors = {};

    const stuR = validateRequired(data.student_id, 'Student');
    if (!stuR.valid) errors.student_id = stuR.error;

    const amtCheck = validateNumber(data.total_amount, {
        min   : 1,
        label : 'Payment amount',
    });
    if (!amtCheck.valid) errors.total_amount = amtCheck.error;

    if (!PAYMENT_METHODS.includes(data.payment_method)) {
        errors.payment_method = 'Please select a valid payment method.';
    }

    const dateR = validateRequired(data.payment_date, 'Payment date');
    if (!dateR.valid) errors.payment_date = dateR.error;
    else {
        const dv = validateDate(data.payment_date, { label: 'Payment date' });
        if (!dv.valid) errors.payment_date = dv.error;
    }

    // At least one fee must be selected
    if (!data.selected_fees || !Array.isArray(data.selected_fees) || data.selected_fees.length === 0) {
        errors.selected_fees = 'Please select at least one fee to record payment against.';
    }

    // Amounts per fee — each must be a positive number
    if (data.fee_amounts && typeof data.fee_amounts === 'object') {
        Object.entries(data.fee_amounts).forEach(([feeId, amt]) => {
            if (amt !== '' && amt !== null && amt !== undefined) {
                const n = parseFloat(amt);
                if (isNaN(n) || n < 0) {
                    errors[`fee_amount_${feeId}`] = 'Enter a valid amount (0 or more).';
                }
            }
        });
    }

    return { valid: Object.keys(errors).length === 0, errors };
}

/**
 * Validate a waiver form.
 */
function validateWaiverForm(data) {
    const errors = {};

    const stuR = validateRequired(data.student_id, 'Student');
    if (!stuR.valid) errors.student_id = stuR.error;

    const typeR = validateEnum(data.waiver_type, WAIVER_TYPES, 'Waiver type');
    if (!typeR.valid) errors.waiver_type = typeR.error;

    if (data.waiver_type === 'percentage') {
        const pctR = validateNumber(data.percentage, { min: 1, max: 100, label: 'Percentage' });
        if (!pctR.valid) errors.percentage = pctR.error;
    } else if (data.waiver_type === 'partial') {
        const amtR = validateNumber(data.amount, { min: 1, label: 'Waiver amount' });
        if (!amtR.valid) errors.amount = amtR.error;
    }

    const reasonR = validateRequired(data.reason, 'Reason');
    if (!reasonR.valid) errors.reason = reasonR.error;

    return { valid: Object.keys(errors).length === 0, errors };
}

/* ═══════════════════════════════════════════════════════════════════
   6. TEACHER FORM VALIDATION  (Part 2.6)
   ═══════════════════════════════════════════════════════════════════ */

/**
 * Strong password rule: at least 6 characters, at least one uppercase
 * letter, one lowercase letter, and one number OR symbol.
 */
function validatePasswordStrength(value, label = 'Password') {
    const s = String(value || '');
    if (s.length < 6) return { valid: false, error: `${label} must be at least 6 characters.` };
    if (!/[A-Z]/.test(s)) return { valid: false, error: `${label} must include at least one uppercase letter.` };
    if (!/[a-z]/.test(s)) return { valid: false, error: `${label} must include at least one lowercase letter.` };
    if (!/[0-9]/.test(s) && !/[^A-Za-z0-9]/.test(s)) return { valid: false, error: `${label} must include at least one number or symbol.` };
    return { valid: true, error: null };
}

function validateTeacherForm(data, isNew = true) {
    const errors = {};

    const fnR = validateRequired(data.first_name, 'First name');
    if (!fnR.valid) errors.first_name = fnR.error;

    const lnR = validateRequired(data.last_name, 'Last name');
    if (!lnR.valid) errors.last_name = lnR.error;

    const roleR = validateEnum(data.role, TEACHER_ROLES, 'Role');
    if (!roleR.valid) errors.role = roleR.error;

    const unR = validateRequired(data.username, 'Username');
    if (!unR.valid) errors.username = unR.error;
    else {
        const unLen = validateLength(data.username, { min: 3, max: 30, label: 'Username' });
        if (!unLen.valid) errors.username = unLen.error;
    }

    // New accounts always require a password; on edit, a password is
    // optional (blank = keep current) but if one IS entered, it must
    // meet the same strength rule — previously this branch only ran
    // for isNew, so changing a password during an edit silently
    // skipped validation entirely, including the length check.
    if (isNew || data.password) {
        const pwR = validateRequired(data.password, 'Password');
        if (!pwR.valid) errors.password = pwR.error;
        else {
            const pwStrength = validatePasswordStrength(data.password);
            if (!pwStrength.valid) errors.password = pwStrength.error;
        }
    }

    if (data.email) {
        const em = validateEmail(data.email, 'Email');
        if (!em.valid) errors.email = em.error;
    }

    return { valid: Object.keys(errors).length === 0, errors };
}

/* ═══════════════════════════════════════════════════════════════════
   7. ACADEMIC YEAR / TERM VALIDATION  (Part 2.3)
   ═══════════════════════════════════════════════════════════════════ */

function validateAcademicYearForm(data) {
    const errors = {};

    const nameR = validateRequired(data.year_name, 'Year name');
    if (!nameR.valid) errors.year_name = nameR.error;

    const sdR = validateRequired(data.start_date, 'Start date');
    if (!sdR.valid) errors.start_date = sdR.error;

    const edR = validateRequired(data.end_date, 'End date');
    if (!edR.valid) errors.end_date = edR.error;

    if (data.start_date && data.end_date) {
        const rng = validateDateRange(data.start_date, data.end_date);
        if (!rng.valid) errors.end_date = rng.error;
    }

    return { valid: Object.keys(errors).length === 0, errors };
}

function validateTermForm(data) {
    const errors = {};

    const yrR = validateRequired(data.academic_year_id, 'Academic year');
    if (!yrR.valid) errors.academic_year_id = yrR.error;

    const tnR = validateNumber(data.term_number, { min: 1, max: 3, integer: true, label: 'Term number' });
    if (!tnR.valid) errors.term_number = tnR.error;

    const sdR = validateDate(data.start_date, { label: 'Start date' });
    if (!sdR.valid) errors.start_date = sdR.error;

    const edR = validateDate(data.end_date, { label: 'End date' });
    if (!edR.valid) errors.end_date = edR.error;

    if (data.start_date && data.end_date) {
        const rng = validateDateRange(data.start_date, data.end_date);
        if (!rng.valid) errors.end_date = rng.error;
    }

    // midterm_date must fall between start and end
    if (data.midterm_date && data.start_date && data.end_date) {
        if (data.midterm_date <= data.start_date || data.midterm_date >= data.end_date) {
            errors.midterm_date = 'Midterm date must fall between the term start and end dates.';
        }
    }

    return { valid: Object.keys(errors).length === 0, errors };
}

/* ═══════════════════════════════════════════════════════════════════
   8. TIMETABLE VALIDATION  (Part 2.9)
   ═══════════════════════════════════════════════════════════════════ */

/**
 * Check a new timetable slot for conflicts.
 * Returns an array of conflicting slot objects.
 *
 * @param {Object} slot - { class_id, teacher_id, day_of_week, period_number }
 * @param {Array}  existingSlots
 * @param {number} [excludeId] - id of slot being edited (to ignore self)
 */
function validateTimetableSlot(slot, existingSlots, excludeId = null) {
    const conflicts = [];

    for (const existing of existingSlots) {
        if (excludeId && existing.id === excludeId) continue;
        if (existing.day_of_week !== slot.day_of_week) continue;
        if (existing.period_number !== slot.period_number) continue;

        // Same class, same period — conflict
        if (existing.class_id === slot.class_id) {
            conflicts.push({ type: 'CLASS', slot: existing });
        }
        // Same teacher, same period — conflict
        if (existing.teacher_id === slot.teacher_id) {
            conflicts.push({ type: 'TEACHER', slot: existing });
        }
    }

    return conflicts;
}

/* ═══════════════════════════════════════════════════════════════════
   9. HOLIDAY FORM VALIDATION  (Part 2.4)
   ═══════════════════════════════════════════════════════════════════ */

function validateHolidayForm(data) {
    const errors = {};

    const nameR = validateRequired(data.name, 'Holiday name');
    if (!nameR.valid) errors.name = nameR.error;

    const typeR = validateEnum(data.type, HOLIDAY_TYPES, 'Holiday type');
    if (!typeR.valid) errors.type = typeR.error;

    const sdR = validateDate(data.start_date, { label: 'Start date' });
    if (!sdR.valid) errors.start_date = sdR.error;

    const edR = validateDate(data.end_date, { label: 'End date' });
    if (!edR.valid) errors.end_date = edR.error;

    if (data.start_date && data.end_date && data.end_date < data.start_date) {
        errors.end_date = 'End date must be on or after start date.';
    }

    return { valid: Object.keys(errors).length === 0, errors };
}

/* ═══════════════════════════════════════════════════════════════════
   10. UI VALIDATION RUNNER
   ═══════════════════════════════════════════════════════════════════ */

/**
 * Run a validator function and apply field-level error highlights
 * to form fields, then return valid/errors.
 *
 * @param {Function} validatorFn  - one of the validate*Form functions above
 * @param {Object}   data         - cleaned form data
 * @param {string}   [formId]     - form element ID for field highlighting
 * @param {...*}     args         - extra args forwarded to validatorFn
 */
function runValidator(validatorFn, data, formId, ...args) {
    // Clear previous errors
    if (formId) clearFieldErrors(formId);

    const result = validatorFn(data, ...args);

    if (!result.valid && formId) {
        Object.entries(result.errors).forEach(([field, msg]) => {
            const el = document.querySelector(`#${formId} [name="${field}"], #${formId} #${field}`);
            if (el) markFieldError(el, msg);
        });
    }

    return result;
}

/**
 * Build a simple error summary HTML string from an errors object.
 * Rendered at the top of a form when there are multiple errors.
 */
function buildErrorSummary(errors) {
    if (!errors || Object.keys(errors).length === 0) return '';
    const items = Object.values(errors)
        .map(e => `<li>${esc(e)}</li>`)
        .join('');
    return `
        <div class="form-error-summary" role="alert" aria-live="polite">
            <strong>Please fix the following:</strong>
            <ul>${items}</ul>
        </div>`;
}

/* ═══════════════════════════════════════════════════════════════════
   EXPOSE
   ═══════════════════════════════════════════════════════════════════ */

window.validateRequired         = validateRequired;
window.validateLength           = validateLength;
window.validateNumber           = validateNumber;
window.validateEmail            = validateEmail;
window.validatePhone            = validatePhone;
window.validateDate             = validateDate;
window.validateDateRange        = validateDateRange;
window.validateEnum             = validateEnum;
window.validateMarkValue        = validateMarkValue;
window.showMarkValidationPopup  = showMarkValidationPopup;
window.validateStudentForm      = validateStudentForm;
window.validateAssessmentForm   = validateAssessmentForm;
window.validateFeeForm          = validateFeeForm;
window.validatePaymentForm      = validatePaymentForm;
window.validateWaiverForm       = validateWaiverForm;
window.validateTeacherForm      = validateTeacherForm;
window.validatePasswordStrength = validatePasswordStrength;
window.validateAcademicYearForm = validateAcademicYearForm;
window.validateTermForm         = validateTermForm;
window.validateTimetableSlot    = validateTimetableSlot;
window.validateHolidayForm      = validateHolidayForm;
window.runValidator             = runValidator;
window.buildErrorSummary        = buildErrorSummary;