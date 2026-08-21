/* ═══════════════════════════════════════════════════════════════════
   tests/validation-tests.js
   ═══════════════════════════════════════════════════════════════════
   Tests for js/core/validators.js — the shared field/form validators
   used across every form in the app.
   ═══════════════════════════════════════════════════════════════════ */

const { loadScripts } = require('./helpers/load-scripts');

beforeAll(() => {
    loadScripts([
        'js/config/constants.js',
        'js/core/utils.js',
        'js/core/sanitizers.js',
        'js/core/validators.js',
    ]);
});

describe('validateRequired', () => {
    test('rejects empty, null, undefined, and whitespace-only values', () => {
        expect(validateRequired('').valid).toBe(false);
        expect(validateRequired(null).valid).toBe(false);
        expect(validateRequired(undefined).valid).toBe(false);
        expect(validateRequired('   ').valid).toBe(false);
    });

    test('accepts a non-empty value', () => {
        expect(validateRequired('Kalisa').valid).toBe(true);
    });
});

describe('validateLength', () => {
    test('rejects strings shorter than min', () => {
        expect(validateLength('ab', { min: 3 }).valid).toBe(false);
    });
    test('rejects strings longer than max', () => {
        expect(validateLength('a'.repeat(300), { max: 255 }).valid).toBe(false);
    });
    test('accepts strings within bounds', () => {
        expect(validateLength('abcdef', { min: 3, max: 30 }).valid).toBe(true);
    });
});

describe('validateNumber', () => {
    test('rejects non-numeric input', () => {
        expect(validateNumber('abc').valid).toBe(false);
    });
    test('accepts numbers formatted with thousands separators', () => {
        expect(validateNumber('12,500').valid).toBe(true);
    });
    test('enforces min/max range', () => {
        expect(validateNumber('150', { min: 0, max: 100 }).valid).toBe(false);
        expect(validateNumber('50', { min: 0, max: 100 }).valid).toBe(true);
    });
    test('enforces integer-only when requested', () => {
        expect(validateNumber('4.5', { integer: true }).valid).toBe(false);
        expect(validateNumber('4', { integer: true }).valid).toBe(true);
    });
});

describe('validateEmail / validatePhone', () => {
    test('email and phone are optional by default (empty passes)', () => {
        expect(validateEmail('').valid).toBe(true);
        expect(validatePhone('').valid).toBe(true);
    });
    test('rejects a malformed email when provided', () => {
        expect(validateEmail('not-an-email').valid).toBe(false);
    });
    test('accepts a well-formed email', () => {
        expect(validateEmail('teacher@lafontaine.rw').valid).toBe(true);
    });
});

describe('validateDateRange', () => {
    test('rejects when end date is not after start date', () => {
        expect(validateDateRange('2026-09-01', '2026-09-01').valid).toBe(false);
        expect(validateDateRange('2026-09-10', '2026-09-01').valid).toBe(false);
    });
    test('accepts when end date is after start date', () => {
        expect(validateDateRange('2026-09-01', '2026-12-01').valid).toBe(true);
    });
});

describe('validateEnum', () => {
    test('rejects values outside the allowed list', () => {
        expect(validateEnum('guardian', USER_ROLES).valid).toBe(false);
    });
    test('accepts values in the allowed list', () => {
        expect(validateEnum('teacher', USER_ROLES).valid).toBe(true);
    });
});

describe('validateMarkValue', () => {
    test('treats an empty score as valid (not yet entered)', () => {
        expect(validateMarkValue('', 50)).toEqual({ valid: true, issue: null });
    });
    test('flags a non-numeric score', () => {
        expect(validateMarkValue('abc', 50).issue).toBe('NOT_NUMBER');
    });
    test('flags a negative score', () => {
        expect(validateMarkValue(-5, 50).issue).toBe('NEGATIVE');
    });
    test('flags a score above the assessment max', () => {
        expect(validateMarkValue(60, 50).issue).toBe('OVER_MAX');
    });
    test('accepts a score within range', () => {
        expect(validateMarkValue(45, 50)).toEqual({ valid: true, issue: null });
    });
});

describe('validateTeacherForm', () => {
    const validData = {
        first_name: 'Jean', last_name: 'Uwimana', role: 'teacher',
        username: 'juwimana', password: 'Secret123'
    };

    test('accepts a fully valid new-teacher submission', () => {
        expect(validateTeacherForm(validData, true).valid).toBe(true);
    });

    test('rejects an invalid role (regression check for the TEACHER_ROLES fix)', () => {
        const result = validateTeacherForm({ ...validData, role: 'guardian' }, true);
        expect(result.valid).toBe(false);
        expect(result.errors.role).toBeDefined();
    });

    test('requires a password for new accounts but not when editing', () => {
        const { password, ...noPassword } = validData;
        expect(validateTeacherForm(noPassword, true).valid).toBe(false);
        expect(validateTeacherForm(noPassword, false).valid).toBe(true);
    });

    test('rejects a username shorter than 3 characters', () => {
        expect(validateTeacherForm({ ...validData, username: 'ab' }, true).valid).toBe(false);
    });
});

describe('validateAcademicYearForm / validateTermForm', () => {
    test('rejects an academic year with end before start', () => {
        const result = validateAcademicYearForm({
            year_name: '2026-2027', start_date: '2026-09-01', end_date: '2026-08-01'
        });
        expect(result.valid).toBe(false);
    });
    test('accepts a valid academic year', () => {
        const result = validateAcademicYearForm({
            year_name: '2026-2027', start_date: '2026-09-01', end_date: '2027-06-30'
        });
        expect(result.valid).toBe(true);
    });
});

describe('validateHolidayForm', () => {
    test('accepts a valid holiday', () => {
        const result = validateHolidayForm({
            name: 'Umuganura', type: 'Public Holiday',
            start_date: '2026-08-06', end_date: '2026-08-06'
        });
        expect(result.valid).toBe(true);
    });
    test('rejects a holiday missing a name', () => {
        const result = validateHolidayForm({
            name: '', type: 'Public Holiday', start_date: '2026-08-06', end_date: '2026-08-06'
        });
        expect(result.valid).toBe(false);
    });
});

describe('buildErrorSummary', () => {
    test('joins multiple field errors into one readable string', () => {
        const summary = buildErrorSummary({ first_name: 'First name is required.', role: 'Role is invalid.' });
        expect(typeof summary).toBe('string');
        expect(summary.length).toBeGreaterThan(0);
    });
});

describe('validatePasswordStrength', () => {
    test('rejects passwords under 6 characters', () => {
        expect(validatePasswordStrength('Ab1').valid).toBe(false);
    });
    test('rejects a password with no uppercase letter', () => {
        expect(validatePasswordStrength('abcde1').valid).toBe(false);
    });
    test('rejects a password with no lowercase letter', () => {
        expect(validatePasswordStrength('ABCDE1').valid).toBe(false);
    });
    test('rejects a password with neither a number nor a symbol', () => {
        expect(validatePasswordStrength('Abcdefgh').valid).toBe(false);
    });
    test('accepts a 6-character password with upper/lower/number', () => {
        expect(validatePasswordStrength('Abcde1').valid).toBe(true);
    });
    test('accepts a symbol in place of a number', () => {
        expect(validatePasswordStrength('Abcde!').valid).toBe(true);
    });
});

describe('validateTeacherForm password handling', () => {
    const baseNewUser = { first_name: 'A', last_name: 'B', role: 'teacher', username: 'abtest' };

    test('a new account requires a password meeting the strength rule', () => {
        const weak = validateTeacherForm({ ...baseNewUser, password: 'weak' }, true);
        expect(weak.valid).toBe(false);
        expect(weak.errors.password).toBeDefined();
    });

    test('a new account with a strong password passes', () => {
        const strong = validateTeacherForm({ ...baseNewUser, password: 'Abcde1' }, true);
        expect(strong.valid).toBe(true);
    });

    test('regression: editing a user with a blank password (keep current) is valid', () => {
        const result = validateTeacherForm({ ...baseNewUser, password: '' }, false);
        expect(result.errors.password).toBeUndefined();
    });

    test('regression: editing a user and entering a WEAK new password is now caught (previously this branch was skipped entirely on edit)', () => {
        const result = validateTeacherForm({ ...baseNewUser, password: 'weak' }, false);
        expect(result.valid).toBe(false);
        expect(result.errors.password).toBeDefined();
    });

    test('editing a user with a strong new password passes', () => {
        const result = validateTeacherForm({ ...baseNewUser, password: 'Abcde1' }, false);
        expect(result.errors.password).toBeUndefined();
    });
});
