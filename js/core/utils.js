/* ═══════════════════════════════════════════════════════════════════
   js/core/utils.js
   ═══════════════════════════════════════════════════════════════════
   Purpose : Pure utility functions — no API calls, no DOM writes.
             Formatting, dates, strings, currency, ASCII charts,
             debounce, download helpers, amount-in-words, and more.
   Load order: AFTER state.js, can be loaded alongside api.js.
   ═══════════════════════════════════════════════════════════════════ */

'use strict';

/* ═══════════════════════════════════════════════════════════════════
   1. NUMBER & CURRENCY FORMATTING
   ═══════════════════════════════════════════════════════════════════ */

/**
 * Format a number with thousands separators.
 * @param {number} n    - the number
 * @param {number} [d]  - decimal places (default 0)
 */
function fmt(n, d = 0) {
    if (n === null || n === undefined || n === '' || isNaN(Number(n))) return '—';
    return Number(n).toLocaleString('en-US', {
        minimumFractionDigits: d,
        maximumFractionDigits: d,
    });
}

/**
 * Format a number as Rwandan Francs.
 * Examples: fmtCurrency(12500) → '12,500 RWF'
 *           fmtCurrency(0)     → '0 RWF'
 */
function fmtCurrency(n) {
    if (n === null || n === undefined || n === '' || isNaN(Number(n))) return '— RWF';
    return `${Number(n).toLocaleString('en-US', { maximumFractionDigits: 0 })} RWF`;
}

// Alias used in some older code
const formatCurrency = fmtCurrency;

/**
 * Format a number as a percentage string.
 * @param {number} n  - value (already as percent, e.g. 74.3)
 * @param {number} [d] - decimal places (default 1)
 */
function fmtPct(n, d = 1) {
    if (n === null || n === undefined || isNaN(Number(n))) return '—';
    return `${Number(n).toFixed(d)}%`;
}

/**
 * Format a mark score to 1 decimal place.
 * Scores are always stored and displayed to 1 decimal (Part 2.13).
 */
function fmtScore(n) {
    if (n === null || n === undefined || n === '' || isNaN(Number(n))) return '—';
    return Number(n).toFixed(1);
}

/**
 * Round a number to 1 decimal place (for mark storage).
 */
function roundScore(n) {
    return Math.round(Number(n) * 10) / 10;
}

/* ═══════════════════════════════════════════════════════════════════
   2. AMOUNT IN WORDS  (used on receipts — Part 9)
   ═══════════════════════════════════════════════════════════════════ */

const _ONES = [
    '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
    'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen',
    'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen',
];
const _TENS = [
    '', '', 'Twenty', 'Thirty', 'Forty', 'Fifty',
    'Sixty', 'Seventy', 'Eighty', 'Ninety',
];

function _wordsUnder1000(n) {
    if (n === 0) return '';
    if (n < 20) return _ONES[n];
    if (n < 100) {
        const t = Math.floor(n / 10);
        const o = n % 10;
        return _TENS[t] + (o ? ' ' + _ONES[o] : '');
    }
    const h = Math.floor(n / 100);
    const r = n % 100;
    return _ONES[h] + ' Hundred' + (r ? ' ' + _wordsUnder1000(r) : '');
}

/**
 * Convert an integer amount to English words for receipts.
 * @param {number} n - integer RWF amount
 * @returns {string} e.g. 'One Hundred Thousand Rwandan Francs Only'
 */
function amountInWords(n) {
    const amount = Math.round(Number(n));
    if (isNaN(amount) || amount < 0) return 'Invalid Amount';
    if (amount === 0) return 'Zero Rwandan Francs Only';

    let billions = Math.floor(amount / 1_000_000_000);
    let millions = Math.floor((amount % 1_000_000_000) / 1_000_000);
    let thousands = Math.floor((amount % 1_000_000) / 1_000);
    let remainder = amount % 1_000;

    const parts = [];
    if (billions) parts.push(_wordsUnder1000(billions) + ' Billion');
    if (millions) parts.push(_wordsUnder1000(millions) + ' Million');
    if (thousands) parts.push(_wordsUnder1000(thousands) + ' Thousand');
    if (remainder) parts.push(_wordsUnder1000(remainder));

    return parts.join(' ') + ' Rwandan Francs Only';
}

// French variant — used on Nursery receipts
function amountInWordsFr(n) {
    // Simplified French — full implementation can be added later
    // For now, return English with French currency label
    const amount = Math.round(Number(n));
    if (isNaN(amount)) return 'Montant Invalide';
    return amountInWords(amount).replace('Rwandan Francs Only', 'Francs Rwandais Seulement');
}

/* ═══════════════════════════════════════════════════════════════════
   3. DATE FORMATTING  (Part 10.1)
   ═══════════════════════════════════════════════════════════════════ */

/**
 * Format an ISO date string as 'DD Mon YYYY' (e.g. '14 Jun 2025').
 * This is the display format used throughout the app.
 */
function fmtDate(s) {
    if (!s) return '—';
    try {
        // Parse as local date to avoid timezone shifts on date-only strings
        const [y, m, d] = String(s).split('T')[0].split('-').map(Number);
        const date = new Date(y, m - 1, d);
        return date.toLocaleDateString('en-GB', {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
        });
    } catch (e) {
        return String(s);
    }
}

/**
 * Format an ISO datetime string as 'DD Mon YYYY, HH:MM'.
 */
function fmtDateTime(s) {
    if (!s) return '—';
    try {
        return new Date(s).toLocaleDateString('en-GB', {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        });
    } catch (e) {
        return String(s);
    }
}

/**
 * Format a time string (HH:MM:SS or HH:MM) as 'HH:MM'.
 */
function fmtTime(s) {
    if (!s) return '—';
    // If it's a time-only string like '08:20:00'
    if (/^\d{2}:\d{2}/.test(s)) return s.substring(0, 5);
    try {
        return new Date(s).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    } catch (e) {
        return String(s);
    }
}

/**
 * Return a human-readable relative time ('3h ago', 'just now', '2d ago').
 */
function fmtAgo(s) {
    if (!s) return '—';
    const secs = Math.floor((Date.now() - new Date(s).getTime()) / 1000);
    if (secs < 60) return 'just now';
    const mins = Math.floor(secs / 60);
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (days < 7) return `${days}d ago`;
    return fmtDate(s);
}

/**
 * Convert a display date (DD/MM/YYYY or DD Mon YYYY) back to ISO (YYYY-MM-DD).
 * Used when reading date inputs for API calls.
 */
function toISODate(displayStr) {
    if (!displayStr) return '';
    // Already ISO
    if (/^\d{4}-\d{2}-\d{2}/.test(displayStr)) return displayStr.split('T')[0];
    // Try native parse
    const d = new Date(displayStr);
    if (!isNaN(d)) {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
    }
    return displayStr;
}

/**
 * Return today's date as 'YYYY-MM-DD' (local time, no UTC shift).
 * Preferred over new Date().toISOString().split('T')[0] which uses UTC.
 */
function todayISO() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Return current time as 'HH:MM' local. */
function nowTime() {
    const d = new Date();
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/**
 * Calculate the number of calendar days between two ISO date strings.
 * @returns {number} positive if end > start
 */
function daysBetween(startISO, endISO) {
    const s = new Date(startISO).getTime();
    const e = new Date(endISO).getTime();
    return Math.round((e - s) / 86400000);
}

/**
 * Check if a given ISO date string falls within any holiday in state.holidays.
 * Used by attendance-entry.js to block marking on holidays.
 */
function isHolidayDate(isoDate) {
    if (!state.holidays || !state.holidays.length) return false;
    return state.holidays.some(h => {
        if (!h.start_date || !h.end_date) return false;
        return isoDate >= h.start_date && isoDate <= h.end_date;
    });
}

/**
 * Return the month name from a date string or Date object.
 */
function getMonthName(d, short = false) {
    const date = d instanceof Date ? d : new Date(d);
    return date.toLocaleDateString('en-GB', { month: short ? 'short' : 'long' });
}

/* ═══════════════════════════════════════════════════════════════════
   4. STRING & SECURITY UTILITIES
   ═══════════════════════════════════════════════════════════════════ */

/**
 * HTML-escape a string to prevent XSS.
 * ALWAYS use this before inserting user-controlled data into innerHTML.
 * (Part 10.7 — Critical never-do rules)
 */
function esc(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/**
 * Capitalise the first letter of each word.
 */
function titleCase(str) {
    if (!str) return '';
    return String(str).toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
}

/**
 * Truncate a string to maxLen characters, adding '…' if truncated.
 */
function truncate(str, maxLen = 60) {
    if (!str) return '';
    const s = String(str);
    return s.length > maxLen ? s.substring(0, maxLen - 1) + '…' : s;
}

/**
 * Strip all HTML tags from a string (for displaying plain-text previews).
 */
function stripTags(html) {
    return String(html || '').replace(/<[^>]*>/g, '');
}

/**
 * Slugify a string for use in IDs or filenames.
 * 'Class Register P5' → 'class-register-p5'
 */
function slugify(str) {
    return String(str || '')
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

/**
 * Check if a string is a valid email address.
 */
function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || ''));
}

/**
 * Check if a string is a valid phone number (basic — E.164-ish).
 */
function isValidPhone(phone) {
    return /^\+?[\d\s\-()]{7,15}$/.test(String(phone || ''));
}

/**
 * Generate a random alphanumeric string of given length.
 * Used for temporary IDs and nonces.
 */
function randomString(len = 8) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < len; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

/* ═══════════════════════════════════════════════════════════════════
   5. ORDINAL NUMBERS  (for ranks: 1st, 2nd, 3rd…)
   ═══════════════════════════════════════════════════════════════════ */

/**
 * Convert a number to its ordinal string.
 * ordinal(1) → '1st' | ordinal(12) → '12th' | ordinal(23) → '23rd'
 */
function ordinal(n) {
    const num = parseInt(n, 10);
    if (isNaN(num)) return String(n);
    const s = num % 100;
    if (s >= 11 && s <= 13) return `${num}th`;
    switch (num % 10) {
        case 1: return `${num}st`;
        case 2: return `${num}nd`;
        case 3: return `${num}rd`;
        default: return `${num}th`;
    }
}

/* ═══════════════════════════════════════════════════════════════════
   6. ASCII CHARTS  (Part 10.2 — NO Chart.js for these)
   ═══════════════════════════════════════════════════════════════════ */

/**
 * Build a horizontal ASCII progress bar.
 * @param {number} pct    - 0 to 100
 * @param {number} [width]- total character width (default ASCII_BAR_WIDTH)
 * @returns {string}  e.g. '████████████░░░░░░░░'
 */
function asciiBar(pct, width = ASCII_BAR_WIDTH) {
    const clamped = Math.max(0, Math.min(100, Number(pct) || 0));
    const filled = Math.round((clamped / 100) * width);
    return ASCII_FILL_CHAR.repeat(filled) + ASCII_EMPTY_CHAR.repeat(width - filled);
}

/**
 * Build a full ASCII bar label with percentage.
 * asciiBarLabel('Mathematics', 78.5)
 * → 'Mathematics  ███████████████░░░░░  78.5%'
 */
function asciiBarLabel(label, pct, width = ASCII_BAR_WIDTH, labelWidth = 20) {
    const paddedLabel = String(label || '').padEnd(labelWidth, ' ').substring(0, labelWidth);
    return `${paddedLabel}  ${asciiBar(pct, width)}  ${fmtPct(pct)}`;
}

/**
 * Build an ASCII vertical column chart as an HTML string.
 * Returns a <div class="ascii-chart"> element.
 *
 * @param {Array<{label:string, value:number}>} data
 * @param {number} maxHeight - number of rows in the chart (default 10)
 */
function asciiColumnChart(data, maxHeight = 10) {
    if (!data || data.length === 0) return '<div class="ascii-chart">No data</div>';

    const maxVal = Math.max(...data.map(d => d.value), 1);

    // Build rows top to bottom
    let rows = '';
    for (let row = maxHeight; row >= 1; row--) {
        const threshold = (row / maxHeight) * maxVal;
        const cells = data.map(d => {
            const fill = d.value >= threshold ? ASCII_FILL_CHAR : ' ';
            return `<td class="ascii-cell">${esc(fill)}</td>`;
        }).join('');
        rows += `<tr>${cells}</tr>`;
    }

    // Labels row
    const labels = data.map(d =>
        `<td class="ascii-label">${esc(String(d.label || '').substring(0, 4))}</td>`
    ).join('');

    // Values row
    const values = data.map(d =>
        `<td class="ascii-value">${esc(fmt(d.value, 0))}</td>`
    ).join('');

    return `
        <div class="ascii-chart">
            <table class="ascii-col-chart">
                <tbody>${rows}</tbody>
                <tfoot>
                    <tr>${labels}</tr>
                    <tr>${values}</tr>
                </tfoot>
            </table>
        </div>`;
}

/* ═══════════════════════════════════════════════════════════════════
   7. DEBOUNCE & THROTTLE
   ═══════════════════════════════════════════════════════════════════ */

/**
 * Returns a debounced version of fn — delays execution until after
 * `wait` milliseconds have passed since the last call.
 * Used for search inputs, resize handlers, auto-save.
 */
function debounce(fn, wait = DEBOUNCE_SEARCH) {
    let timer;
    return function (...args) {
        clearTimeout(timer);
        timer = setTimeout(() => fn.apply(this, args), wait);
    };
}

/**
 * Returns a throttled version of fn — executes at most once every
 * `limit` milliseconds.
 * Used for scroll handlers and resize events.
 */
function throttle(fn, limit = 100) {
    let lastCall = 0;
    return function (...args) {
        const now = Date.now();
        if (now - lastCall >= limit) {
            lastCall = now;
            return fn.apply(this, args);
        }
    };
}

/* ═══════════════════════════════════════════════════════════════════
   8. FILE DOWNLOAD HELPERS
   ═══════════════════════════════════════════════════════════════════ */

/**
 * Trigger a browser download from in-memory content.
 * @param {string|Blob} content  - file content
 * @param {string}      filename - download filename with extension
 * @param {string}      [mime]   - MIME type
 */
function downloadBlob(content, filename, mime = 'application/octet-stream') {
    const blob = content instanceof Blob
        ? content
        : new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

/**
 * Download a JSON object as a .json file.
 */
function downloadJSON(data, filename) {
    const content = JSON.stringify(data, null, 2);
    downloadBlob(content, filename, 'application/json');
}

/**
 * Export a flat array of objects to Excel using SheetJS.
 * Falls back gracefully if XLSX is not loaded.
 *
 * @param {Array<Object>} data      - rows (array of plain objects)
 * @param {string}        filename  - without extension
 * @param {string}        [sheet]   - sheet name (default 'Data')
 */
function exportToExcel(data, filename, sheet = 'Data') {
    if (typeof XLSX === 'undefined') {
        console.error('[Utils] SheetJS (XLSX) not loaded — cannot export to Excel.');
        if (typeof showToast === 'function') showToast('Excel export unavailable.', 'error');
        return false;
    }
    if (!data || data.length === 0) {
        if (typeof showToast === 'function') showToast('No data to export.', 'warning');
        return false;
    }
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, sheet);
    XLSX.writeFile(wb, `${filename}_${todayISO()}.xlsx`);
    return true;
}

/**
 * Export an array-of-arrays (AOA) to Excel, giving full column control.
 * First row should be headers.
 *
 * @param {Array<Array>} aoa      - rows including header row
 * @param {string}       filename - without extension
 * @param {string}       [sheet]
 */
function exportAOAtoExcel(aoa, filename, sheet = 'Sheet1') {
    if (typeof XLSX === 'undefined') {
        if (typeof showToast === 'function') showToast('Excel export unavailable.', 'error');
        return false;
    }
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, sheet);
    XLSX.writeFile(wb, `${filename}_${todayISO()}.xlsx`);
    return true;
}

/**
 * Export a CSV string and trigger download.
 */
function exportToCSV(data, filename) {
    if (!data || data.length === 0) return;
    const headers = Object.keys(data[0]).join(',');
    const rows = data.map(row =>
        Object.values(row).map(v =>
            `"${String(v || '').replace(/"/g, '""')}"`
        ).join(',')
    );
    const csv = [headers, ...rows].join('\n');
    downloadBlob(csv, `${filename}_${todayISO()}.csv`, 'text/csv;charset=utf-8;');
}

/* ═══════════════════════════════════════════════════════════════════
   9. PRINT HELPERS
   ═══════════════════════════════════════════════════════════════════ */

/* openPrintWindow() and printElement() used to be declared here too,
   colliding with core/print-engine.js's richer versions (which load after
   this file, per index.html) — that redeclaration threw "Identifier
   already declared" and silently killed every function in print-engine.js
   the moment it was added. Removed here; print-engine.js's versions
   (which take an extraCSS param and use APP_NAME) are canonical now. */

/* ═══════════════════════════════════════════════════════════════════
   10. QR CODE GENERATION  (Part 7.3)
   ═══════════════════════════════════════════════════════════════════ */

/**
 * Generate a QR code image URL for a student's report card.
 * The QR encodes a URL that opens qr-verify.html with student data.
 *
 * @param {string} studentCode  - e.g. 'STU-2026-0045'
 * @param {number} termNumber   - 1, 2, or 3
 * @param {number} yearId       - academic_year.id
 * @returns {string} QR code image as data URL
 *
 * Uses qrcodejs (window.QRCode) loaded via CDN.
 * If QRCode is not available, returns a placeholder SVG.
 */
function generateQRCode(studentCode, termNumber, yearId) {
    const params = new URLSearchParams({
        [QR_CONFIG.studentParam]: studentCode,
        [QR_CONFIG.termParam]: termNumber,
        [QR_CONFIG.yearParam]: yearId,
    });
    const url = `${QR_CONFIG.verifyBaseUrl}?${params.toString()}`;

    // Create a temporary off-screen div for QRCode rendering
    const container = document.createElement('div');
    container.style.cssText = 'position:absolute;left:-9999px;top:-9999px;';
    document.body.appendChild(container);

    try {
        const qr = new QRCode(container, {
            text: url,
            width: QR_CONFIG.size,
            height: QR_CONFIG.size,
            colorDark: '#1a1410',
            colorLight: '#fcfaf8',
            correctLevel: QRCode.CorrectLevel.M,
        });
        const img = container.querySelector('img') || container.querySelector('canvas');
        const src = img ? (img.src || img.toDataURL()) : '';
        document.body.removeChild(container);
        return { src, url };
    } catch (e) {
        document.body.removeChild(container);
        console.warn('[Utils] QRCode generation failed:', e.message);
        return { src: '', url };
    }
}

/**
 * Return an inline SVG placeholder when QR code is not available.
 */
function qrPlaceholderSVG(size = 80) {
    return `<svg width="${size}" height="${size}" viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect width="80" height="80" fill="#f0ebe6" rx="4"/>
        <rect x="10" y="10" width="24" height="24" fill="none" stroke="#6b5f56" stroke-width="2"/>
        <rect x="15" y="15" width="14" height="14" fill="#6b5f56"/>
        <rect x="46" y="10" width="24" height="24" fill="none" stroke="#6b5f56" stroke-width="2"/>
        <rect x="51" y="15" width="14" height="14" fill="#6b5f56"/>
        <rect x="10" y="46" width="24" height="24" fill="none" stroke="#6b5f56" stroke-width="2"/>
        <rect x="15" y="51" width="14" height="14" fill="#6b5f56"/>
        <rect x="46" y="46" width="7" height="7" fill="#6b5f56"/>
        <rect x="57" y="46" width="7" height="7" fill="#6b5f56"/>
        <rect x="46" y="57" width="7" height="7" fill="#6b5f56"/>
        <rect x="57" y="57" width="7" height="7" fill="#6b5f56"/>
    </svg>`;
}

/* ═══════════════════════════════════════════════════════════════════
   11. LOGO HELPER
   ═══════════════════════════════════════════════════════════════════ */

/**
 * Return school logo HTML for use in headers and report cards.
 * Falls back to initials if no logo is set.
 */
function getSchoolLogoHtml(logoUrl, size = '48px') {
    if (logoUrl && logoUrl.startsWith('http')) {
        return `<img src="${esc(logoUrl)}" alt="School Logo" style="width:${size};height:${size};object-fit:contain;border-radius:8px;">`;
    }
    const s = state.schoolSettings || {};
    const name = s.school_name || 'ELF';
    const initials = name.split(' ').map(w => w[0]).join('').substring(0, 3).toUpperCase();
    return `<div style="width:${size};height:${size};border-radius:8px;background:#1a3a5c;color:#f5f0eb;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:calc(${size} * 0.35);flex-shrink:0;">${esc(initials)}</div>`;
}

/* ═══════════════════════════════════════════════════════════════════
   12. OVERDUE SEVERITY  (Part 4.12)
   ═══════════════════════════════════════════════════════════════════ */

/**
 * Return the overdue severity for a fee given its due date.
 * @param {string} dueDateISO
 * @returns {{ level: string, days: number, label: string, color: string }}
 */
function getOverdueSeverity(dueDateISO) {
    if (!dueDateISO) return { level: 'none', days: 0, label: 'No due date', color: '#6b5f56' };
    const days = daysBetween(dueDateISO, todayISO());
    if (days < 1) return { level: 'not_yet', days, label: 'Not yet due', color: '#2d6a4f' };
    if (days < OVERDUE_SEVERITY.RECENT) return { level: 'recent', days, label: 'Recent', color: '#c99a3b' };
    if (days < OVERDUE_SEVERITY.MILD) return { level: 'mild', days, label: 'Mild', color: '#c99a3b' };
    if (days < OVERDUE_SEVERITY.WARNING) return { level: 'warning', days, label: 'Warning', color: '#e8a33d' };
    return { level: 'critical', days, label: 'Critical', color: '#c44536' };
}

/* ═══════════════════════════════════════════════════════════════════
   13. REPORT CARD PRINT HEADER
   (Part 7, Part 4.6)
   ═══════════════════════════════════════════════════════════════════ */

/**
 * Build the standard school header block for any printable document.
 * @param {string} title    - document title (e.g. 'PAYMENT RECEIPT')
 * @param {string} [sub]    - optional subtitle
 */
function buildPrintHeader(title, sub = '') {
    const s = state.schoolSettings || {};
    const logoUrl = s.school_logo || '';
    const logoHtml = getSchoolLogoHtml(logoUrl, '56px');
    const today = fmtDate(todayISO());

    return `
    <div class="print-header">
        <div class="print-header-left">
            ${logoHtml}
            <div class="print-header-text">
                <div class="print-school-name">${esc(s.school_name || SCHOOL_DEFAULTS.school_name)}</div>
                <div class="print-school-location">${esc(s.school_location || SCHOOL_DEFAULTS.school_location)}</div>
                <div class="print-school-contact">${esc(s.school_phone || '')}${s.school_email ? ' · ' + esc(s.school_email) : ''}</div>
            </div>
        </div>
        <div class="print-header-right">
            <div class="print-doc-title">${esc(title)}</div>
            ${sub ? `<div class="print-doc-sub">${esc(sub)}</div>` : ''}
            <div class="print-doc-date">${today}</div>
        </div>
    </div>`;
}

/* ═══════════════════════════════════════════════════════════════════
   14. SEARCH / FILTER HELPERS
   ═══════════════════════════════════════════════════════════════════ */

/**
 * Simple case-insensitive substring search across multiple fields.
 * @param {Array<Object>} items   - array of objects to filter
 * @param {string}        query   - search query
 * @param {string[]}      fields  - object fields to search
 */
function filterBySearch(items, query, fields) {
    if (!query || !query.trim()) return items;
    const q = query.toLowerCase().trim();
    return items.filter(item =>
        fields.some(field => {
            const val = item[field];
            return val && String(val).toLowerCase().includes(q);
        })
    );
}

/**
 * Sort an array of objects by a key.
 * @param {Array<Object>} items
 * @param {string}        key
 * @param {string}        [dir] - 'asc' | 'desc'
 */
function sortBy(items, key, dir = 'asc') {
    return [...items].sort((a, b) => {
        let va = a[key];
        let vb = b[key];
        if (typeof va === 'string') va = va.toLowerCase();
        if (typeof vb === 'string') vb = vb.toLowerCase();
        if (va < vb) return dir === 'asc' ? -1 : 1;
        if (va > vb) return dir === 'asc' ? 1 : -1;
        return 0;
    });
}

/**
 * Group an array of objects by a key.
 * @param {Array<Object>} items
 * @param {string}        key
 * @returns {Object} { groupValue: [items], ... }
 */
function groupBy(items, key) {
    return items.reduce((acc, item) => {
        const group = String(item[key] ?? 'Other');
        if (!acc[group]) acc[group] = [];
        acc[group].push(item);
        return acc;
    }, {});
}

/* ═══════════════════════════════════════════════════════════════════
   15. MISC HELPERS
   ═══════════════════════════════════════════════════════════════════ */

/**
 * Deep-clone a plain object or array using JSON round-trip.
 * Suitable for cloning state snapshots, not for circular refs.
 */
function deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
}

/**
 * Check if two values are deeply equal (simple JSON comparison).
 */
function deepEqual(a, b) {
    return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Safe parseInt — returns defaultVal if NaN.
 */
function safeInt(val, defaultVal = 0) {
    const n = parseInt(val, 10);
    return isNaN(n) ? defaultVal : n;
}

/**
 * Safe parseFloat — returns defaultVal if NaN.
 */
function safeFloat(val, defaultVal = 0) {
    const n = parseFloat(val);
    return isNaN(n) ? defaultVal : n;
}

/**
 * Returns true if a value is null, undefined, or empty string.
 */
function isEmpty(val) {
    return val === null || val === undefined || val === '';
}

/**
 * Pad a number to a given length with leading zeros.
 * zeroPad(5, 4) → '0005'
 */
function zeroPad(n, len = 2) {
    return String(Math.abs(safeInt(n))).padStart(len, '0');
}

/**
 * Copy text to clipboard. Shows a toast on success/failure.
 */
async function copyToClipboard(text) {
    try {
        await navigator.clipboard.writeText(text);
        if (typeof showToast === 'function') showToast('Copied to clipboard', 'success', 1500);
        return true;
    } catch (e) {
        if (typeof showToast === 'function') showToast('Could not copy to clipboard', 'error');
        return false;
    }
}

/**
 * Scroll a container to smoothly reveal an element.
 */
function scrollIntoView(elementOrId) {
    const el = typeof elementOrId === 'string'
        ? document.getElementById(elementOrId)
        : elementOrId;
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

/**
 * Add a CSS class temporarily (e.g. to flash a row).
 * @param {HTMLElement|string} el  - element or ID
 * @param {string}             cls - CSS class to add
 * @param {number}             [ms] - duration before removing (default 1200)
 */
function flashClass(el, cls, ms = 1200) {
    const elem = typeof el === 'string' ? document.getElementById(el) : el;
    if (!elem) return;
    elem.classList.add(cls);
    setTimeout(() => elem.classList.remove(cls), ms);
}

/* ═══════════════════════════════════════════════════════════════════
   EXPOSE
   ═══════════════════════════════════════════════════════════════════ */

window.fmt = fmt;
window.fmtCurrency = fmtCurrency;
window.formatCurrency = formatCurrency;
window.fmtPct = fmtPct;
window.fmtScore = fmtScore;
window.roundScore = roundScore;
window.amountInWords = amountInWords;
window.amountInWordsFr = amountInWordsFr;
window.fmtDate = fmtDate;
window.fmtDateTime = fmtDateTime;
window.fmtTime = fmtTime;
window.fmtAgo = fmtAgo;
window.toISODate = toISODate;
window.todayISO = todayISO;
window.nowTime = nowTime;
window.daysBetween = daysBetween;
window.isHolidayDate = isHolidayDate;
window.getMonthName = getMonthName;
window.esc = esc;
window.titleCase = titleCase;
window.truncate = truncate;
window.stripTags = stripTags;
window.slugify = slugify;
window.isValidEmail = isValidEmail;
window.isValidPhone = isValidPhone;
window.randomString = randomString;
window.ordinal = ordinal;
window.asciiBar = asciiBar;
window.asciiBarLabel = asciiBarLabel;
window.asciiColumnChart = asciiColumnChart;
window.debounce = debounce;
window.throttle = throttle;
window.downloadBlob = downloadBlob;
window.downloadJSON = downloadJSON;
window.exportToExcel = exportToExcel;
window.exportAOAtoExcel = exportAOAtoExcel;
window.exportToCSV = exportToCSV;

window.generateQRCode = generateQRCode;
window.qrPlaceholderSVG = qrPlaceholderSVG;
window.getSchoolLogoHtml = getSchoolLogoHtml;
window.getOverdueSeverity = getOverdueSeverity;
window.buildPrintHeader = buildPrintHeader;
window.filterBySearch = filterBySearch;
window.sortBy = sortBy;
window.groupBy = groupBy;
window.deepClone = deepClone;
window.deepEqual = deepEqual;
window.safeInt = safeInt;
window.safeFloat = safeFloat;
window.isEmpty = isEmpty;
window.zeroPad = zeroPad;
window.copyToClipboard = copyToClipboard;
window.scrollIntoView = scrollIntoView;
window.flashClass = flashClass;