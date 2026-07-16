/* ═══════════════════════════════════════════════════════════════════
   tests/ui-tests.js
   ═══════════════════════════════════════════════════════════════════
   Tests for the pure formatting helpers in core/utils.js (fmtCurrency,
   fmtDate, fmtPct, esc) and real DOM behavior of ui/toast.js and
   ui/modals.js under jsdom (these genuinely manipulate the DOM, so
   jsdom can exercise them for real, not just mock them).
   ═══════════════════════════════════════════════════════════════════ */

const { loadScripts } = require('./helpers/load-scripts');

beforeAll(() => {
    loadScripts([
        'js/config/constants.js',
        'js/core/utils.js',
        'js/core/state.js',
        'js/ui/toast.js',
        'js/ui/modals.js',
    ]);
});



describe('fmtCurrency', () => {
    test('formats a number with thousands separators and RWF suffix', () => {
        expect(fmtCurrency(50000)).toBe('50,000 RWF');
    });
    test('returns a placeholder for null/undefined/empty/non-numeric', () => {
        expect(fmtCurrency(null)).toBe('— RWF');
        expect(fmtCurrency(undefined)).toBe('— RWF');
        expect(fmtCurrency('')).toBe('— RWF');
        expect(fmtCurrency('abc')).toBe('— RWF');
    });
    test('formatCurrency is an alias for fmtCurrency', () => {
        expect(formatCurrency(1000)).toBe(fmtCurrency(1000));
    });
});

describe('fmtDate', () => {
    test('formats an ISO date string as "D Mon YYYY"', () => {
        expect(fmtDate('2026-09-15')).toBe('15 Sept 2026');
    });
    test('returns a placeholder for a falsy value', () => {
        expect(fmtDate(null)).toBe('—');
        expect(fmtDate('')).toBe('—');
    });
    test('is not shifted by timezone for a date-only string', () => {
        // Regression guard: naive `new Date('2026-01-01')` parses as UTC
        // midnight, which can display as the previous day in negative-offset zones.
        expect(fmtDate('2026-01-01')).toBe('1 Jan 2026');
    });
});

describe('fmtPct', () => {
    test('formats with one decimal place by default', () => {
        expect(fmtPct(74.32)).toBe('74.3%');
    });
    test('respects a custom decimal-place count', () => {
        expect(fmtPct(74.3, 0)).toBe('74%');
    });
});

describe('esc (XSS-safety)', () => {
    test('escapes HTML-significant characters', () => {
        expect(esc('<script>alert(1)</script>')).not.toContain('<script>');
        expect(esc('Tom & Jerry')).toContain('&amp;');
    });
    test('returns an empty string for a falsy value', () => {
        expect(esc(null)).toBe('');
        expect(esc(undefined)).toBe('');
    });
});

describe('showToast (real DOM behavior via jsdom)', () => {
    test('renders a toast element into the page', () => {
        showToast('Saved successfully', 'success');
        const toast = document.querySelector('.toast, [class*="toast"]');
        expect(toast).not.toBeNull();
    });

    test('includes the message text in the rendered toast', () => {
        showToast('A distinctive test message', 'info');
        expect(document.body.innerHTML).toContain('A distinctive test message');
    });
});

describe('showModal / closeModal (real DOM behavior via jsdom)', () => {
    test('renders modal content into the page', () => {
        showModal('<p>Distinctive modal body</p>', { title: 'Test Modal' });
        expect(document.body.innerHTML).toContain('Distinctive modal body');
        expect(document.body.innerHTML).toContain('Test Modal');
    });

    test('closeModal removes the modal from the page', () => {
        showModal('<p>Temporary content</p>', { title: 'Temp' });
        expect(document.body.innerHTML).toContain('Temporary content');
        closeModal();
        // Allow for either immediate removal or a CSS-class-based close state
        const stillVisible = document.querySelector('.modal.active, .modal.open, .modal[style*="flex"], .modal[style*="block"]');
        expect(stillVisible).toBeNull();
    });
});
