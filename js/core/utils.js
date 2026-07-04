/**
 * ECOLE LA FONTAINE — Utility Functions
 * Formatting, escaping, file operations, etc.
 * Last updated: 2026-06-28
 */

// ──────────────────────────────────────────────────────────────────────
// STRING HELPERS
// ──────────────────────────────────────────────────────────────────────

/**
 * HTML-escape a string to prevent XSS
 * @param {string} str - String to escape
 * @returns {string} Escaped string
 */
export function esc(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/**
 * Truncate a string to a maximum length
 * @param {string} str - String to truncate
 * @param {number} max - Maximum length
 * @param {string} suffix - Suffix to add (default '…')
 * @returns {string} Truncated string
 */
export function truncate(str, max = 50, suffix = '…') {
    if (!str || str.length <= max) return str;
    return str.slice(0, max - suffix.length) + suffix;
}

/**
 * Capitalize the first letter of a string
 * @param {string} str - String to capitalize
 * @returns {string} Capitalized string
 */
export function capitalize(str) {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

/**
 * Slugify a string (for URLs, IDs)
 * @param {string} str - String to slugify
 * @returns {string} Slugified string
 */
export function slugify(str) {
    if (!str) return '';
    return String(str)
        .toLowerCase()
        .replace(/[^\w\s-]/g, '')
        .replace(/[\s_-]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

// ──────────────────────────────────────────────────────────────────────
// DATE HELPERS
// ──────────────────────────────────────────────────────────────────────

/**
 * Format a date string as 'DD/MM/YYYY'
 * @param {string|Date} date - Date to format
 * @returns {string} Formatted date
 */
export function fmtDate(date) {
    if (!date) return '—';
    try {
        const d = typeof date === 'string' ? new Date(date) : date;
        if (isNaN(d.getTime())) return '—';
        return d.toLocaleDateString('en-GB', {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
        });
    } catch (e) {
        return String(date) || '—';
    }
}

/**
 * Format a date-time string
 * @param {string|Date} date - Date to format
 * @returns {string} Formatted date-time
 */
export function fmtDateTime(date) {
    if (!date) return '—';
    try {
        const d = typeof date === 'string' ? new Date(date) : date;
        if (isNaN(d.getTime())) return '—';
        return d.toLocaleDateString('en-GB', {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        });
    } catch (e) {
        return String(date) || '—';
    }
}

/**
 * Format a time string
 * @param {string} time - Time string (e.g., '08:20:00')
 * @returns {string} Formatted time
 */
export function fmtTime(time) {
    if (!time) return '—';
    try {
        const d = new Date(`2000-01-01T${time}`);
        return d.toLocaleTimeString('en-GB', {
            hour: '2-digit',
            minute: '2-digit',
        });
    } catch (e) {
        return time || '—';
    }
}

/**
 * Get relative time (e.g., '2h ago', 'just now')
 * @param {string|Date} date - Date to compare
 * @returns {string} Relative time string
 */
export function fmtAgo(date) {
    if (!date) return '—';
    try {
        const d = typeof date === 'string' ? new Date(date) : date;
        const secs = Math.floor((Date.now() - d.getTime()) / 1000);
        if (secs < 60) return 'just now';
        const mins = Math.floor(secs / 60);
        if (mins < 60) return `${mins}m ago`;
        const hrs = Math.floor(mins / 60);
        if (hrs < 24) return `${hrs}h ago`;
        const days = Math.floor(hrs / 24);
        if (days < 7) return `${days}d ago`;
        return fmtDate(d);
    } catch (e) {
        return String(date) || '—';
    }
}

// ──────────────────────────────────────────────────────────────────────
// NUMBER HELPERS
// ──────────────────────────────────────────────────────────────────────

/**
 * Format a number with thousands separators
 * @param {number} n - Number to format
 * @param {number} decimals - Number of decimal places
 * @returns {string} Formatted number
 */
export function fmt(n, decimals = 0) {
    if (n === null || n === undefined || isNaN(n)) return '—';
    return Number(n).toLocaleString('en-US', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
    });
}

/**
 * Format a number as currency (RWF)
 * @param {number} n - Number to format
 * @returns {string} Formatted currency
 */
export function fmtCurrency(n) {
    if (n === null || n === undefined || isNaN(n)) return '—';
    return fmt(Math.round(n), 0) + ' RWF';
}

/**
 * Format a number as a percentage
 * @param {number} n - Number to format
 * @param {number} decimals - Number of decimal places
 * @returns {string} Formatted percentage
 */
export function fmtPct(n, decimals = 1) {
    if (n === null || n === undefined || isNaN(n)) return '—';
    return Number(n).toFixed(decimals) + '%';
}

/**
 * Parse a number from a string (safe)
 * @param {string} str - String to parse
 * @param {number} fallback - Fallback value
 * @returns {number} Parsed number
 */
export function parseNum(str, fallback = 0) {
    if (str === null || str === undefined || str === '') return fallback;
    const num = parseFloat(String(str).replace(/,/g, ''));
    return isNaN(num) ? fallback : num;
}

// ──────────────────────────────────────────────────────────────────────
// FILE HELPERS
// ──────────────────────────────────────────────────────────────────────

/**
 * Trigger a browser file download
 * @param {Blob|string} content - File content
 * @param {string} filename - Output filename
 * @param {string} mime - MIME type
 */
export function downloadBlob(content, filename, mime = 'application/octet-stream') {
    const blob = typeof content === 'string'
        ? new Blob([content], { type: mime })
        : content;
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
 * Export JSON data to Excel (via SheetJS)
 * @param {Array} data - Array of objects to export
 * @param {string} filename - Output filename (without extension)
 */
export function exportToExcel(data, filename) {
    if (!data?.length) {
        showToast('No data to export', 'warning');
        return;
    }
    try {
        if (typeof XLSX === 'undefined') {
            showToast('SheetJS library not loaded', 'error');
            return;
        }
        const ws = XLSX.utils.json_to_sheet(data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Data');
        XLSX.writeFile(wb, `${filename}_${new Date().toISOString().split('T')[0]}.xlsx`);
    } catch (e) {
        console.error('[Export]', e);
        showToast('Export failed: ' + e.message, 'error');
    }
}

/**
 * Export 2D array to Excel
 * @param {Array} data - 2D array of data
 * @param {string} filename - Output filename
 * @param {string} sheetName - Sheet name
 */
export function exportArrayToExcel(data, filename, sheetName = 'Data') {
    if (!data?.length) {
        showToast('No data to export', 'warning');
        return;
    }
    try {
        if (typeof XLSX === 'undefined') {
            showToast('SheetJS library not loaded', 'error');
            return;
        }
        const ws = XLSX.utils.aoa_to_sheet(data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, sheetName);
        XLSX.writeFile(wb, `${filename}_${new Date().toISOString().split('T')[0]}.xlsx`);
    } catch (e) {
        console.error('[Export]', e);
        showToast('Export failed: ' + e.message, 'error');
    }
}

// ──────────────────────────────────────────────────────────────────────
// RANDOM / GENERATORS
// ──────────────────────────────────────────────────────────────────────

/**
 * Generate a random ID (short)
 * @returns {string} Random ID
 */
export function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

/**
 * Generate a student code
 * @param {number} year - Academic year
 * @param {number} sequence - Sequential number
 * @returns {string} Student code
 */
export function generateStudentCode(year, sequence) {
    const yearStr = String(year).slice(-2);
    const seqStr = String(sequence).padStart(4, '0');
    return `STU-${yearStr}-${seqStr}`;
}

/**
 * Generate a receipt number
 * @param {number} sequence - Sequential number
 * @returns {string} Receipt number
 */
export function generateReceiptNumber(sequence) {
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const seqStr = String(sequence).padStart(4, '0');
    return `RCP-${date}-${seqStr}`;
}

// ──────────────────────────────────────────────────────────────────────
// VALIDATION HELPERS
// ──────────────────────────────────────────────────────────────────────

/**
 * Check if a value is a valid number
 * @param {any} value - Value to check
 * @returns {boolean} Is valid number
 */
export function isValidNumber(value) {
    if (value === null || value === undefined || value === '') return false;
    return !isNaN(parseFloat(value)) && isFinite(value);
}

/**
 * Check if a value is a valid email
 * @param {string} email - Email to check
 * @returns {boolean} Is valid email
 */
export function isValidEmail(email) {
    if (!email) return false;
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/**
 * Check if a value is a valid phone number (Rwanda)
 * @param {string} phone - Phone to check
 * @returns {boolean} Is valid phone
 */
export function isValidPhone(phone) {
    if (!phone) return false;
    return /^(\+250|0)?[7-9]\d{8}$/.test(phone.replace(/\s/g, ''));
}

// ──────────────────────────────────────────────────────────────────────
// CLIPBOARD HELPERS
// ──────────────────────────────────────────────────────────────────────

/**
 * Copy text to clipboard
 * @param {string} text - Text to copy
 * @returns {Promise<boolean>} Success
 */
export async function copyToClipboard(text) {
    try {
        await navigator.clipboard.writeText(text);
        return true;
    } catch (e) {
        // Fallback
        const ta = document.createElement('textarea');
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        try {
            document.execCommand('copy');
            return true;
        } catch (e2) {
            return false;
        } finally {
            document.body.removeChild(ta);
        }
    }
}

// ──────────────────────────────────────────────────────────────────────
// BROWSER HELPERS
// ──────────────────────────────────────────────────────────────────────

/**
 * Check if running in a PWA (standalone mode)
 * @returns {boolean} Is standalone
 */
export function isStandalone() {
    return window.matchMedia('(display-mode: standalone)').matches ||
        window.navigator.standalone === true;
}

/**
 * Check if online
 * @returns {boolean} Is online
 */
export function isOnline() {
    return navigator.onLine;
}

/**
 * ECOLE LA FONTAINE — Utility Functions (Additional)
 * Additional utilities that weren't in the first pass
 * Last updated: 2026-06-28
 */

// ──────────────────────────────────────────────────────────────────────
// DEEP CLONE
// ──────────────────────────────────────────────────────────────────────

/**
 * Deep clone an object or array
 * @param {any} obj - Object to clone
 * @returns {any} Cloned object
 */
export function deepClone(obj) {
    if (obj === null || typeof obj !== 'object') return obj;
    if (obj instanceof Date) return new Date(obj);
    if (obj instanceof Array) return obj.map(item => deepClone(item));
    const cloned = {};
    for (const key in obj) {
        if (obj.hasOwnProperty(key)) {
            cloned[key] = deepClone(obj[key]);
        }
    }
    return cloned;
}

// ──────────────────────────────────────────────────────────────────────
// DEBOUNCE / THROTTLE
// ──────────────────────────────────────────────────────────────────────

/**
 * Debounce a function
 * @param {Function} fn - Function to debounce
 * @param {number} delay - Delay in ms
 * @returns {Function} Debounced function
 */
export function debounce(fn, delay = 300) {
    let timeoutId;
    return function (...args) {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => fn.apply(this, args), delay);
    };
}

/**
 * Throttle a function
 * @param {Function} fn - Function to throttle
 * @param {number} limit - Limit in ms
 * @returns {Function} Throttled function
 */
export function throttle(fn, limit = 300) {
    let inThrottle = false;
    return function (...args) {
        if (!inThrottle) {
            fn.apply(this, args);
            inThrottle = true;
            setTimeout(() => inThrottle = false, limit);
        }
    };
}

// ──────────────────────────────────────────────────────────────────────
// OBJECT HELPERS
// ──────────────────────────────────────────────────────────────────────

/**
 * Pick specific keys from an object
 * @param {object} obj - Source object
 * @param {Array} keys - Keys to pick
 * @returns {object} Picked object
 */
export function pick(obj, keys) {
    const result = {};
    for (const key of keys) {
        if (obj && obj.hasOwnProperty(key)) {
            result[key] = obj[key];
        }
    }
    return result;
}

/**
 * Omit specific keys from an object
 * @param {object} obj - Source object
 * @param {Array} keys - Keys to omit
 * @returns {object} Omitted object
 */
export function omit(obj, keys) {
    const result = { ...obj };
    for (const key of keys) {
        delete result[key];
    }
    return result;
}

// ──────────────────────────────────────────────────────────────────────
// GROUP BY
// ──────────────────────────────────────────────────────────────────────

/**
 * Group an array by a key
 * @param {Array} arr - Array to group
 * @param {string|Function} key - Key or function
 * @returns {object} Grouped object
 */
export function groupBy(arr, key) {
    return arr.reduce((acc, item) => {
        const groupKey = typeof key === 'function' ? key(item) : item[key];
        if (!acc[groupKey]) acc[groupKey] = [];
        acc[groupKey].push(item);
        return acc;
    }, {});
}

// ──────────────────────────────────────────────────────────────────────
// ARRAY HELPERS
// ──────────────────────────────────────────────────────────────────────

/**
 * Chunk an array into smaller arrays
 * @param {Array} arr - Array to chunk
 * @param {number} size - Chunk size
 * @returns {Array} Chunked array
 */
export function chunk(arr, size) {
    const chunks = [];
    for (let i = 0; i < arr.length; i += size) {
        chunks.push(arr.slice(i, i + size));
    }
    return chunks;
}

/**
 * Shuffle an array (Fisher-Yates)
 * @param {Array} arr - Array to shuffle
 * @returns {Array} Shuffled array
 */
export function shuffle(arr) {
    const result = [...arr];
    for (let i = result.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
}

// ──────────────────────────────────────────────────────────────────────
// STORAGE HELPERS
// ──────────────────────────────────────────────────────────────────────

/**
 * Set a value in localStorage with JSON serialization
 * @param {string} key - Storage key
 * @param {any} value - Value to store
 */
export function setStorage(key, value) {
    try {
        localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
        console.warn('[Storage] Set failed:', e);
    }
}

/**
 * Get a value from localStorage with JSON parsing
 * @param {string} key - Storage key
 * @param {any} fallback - Fallback value
 * @returns {any} Stored value
 */
export function getStorage(key, fallback = null) {
    try {
        const value = localStorage.getItem(key);
        return value ? JSON.parse(value) : fallback;
    } catch (e) {
        return fallback;
    }
}

/**
 * Remove a value from localStorage
 * @param {string} key - Storage key
 */
export function removeStorage(key) {
    try {
        localStorage.removeItem(key);
    } catch (e) {
        console.warn('[Storage] Remove failed:', e);
    }
}
// ──────────────────────────────────────────────────────────────────────
// RECEIPT PDF DOWNLOAD
// ──────────────────────────────────────────────────────────────────────

/**
 * Download a receipt as PDF using html2pdf
 * @param {string} htmlContent - HTML string of the receipt
 * @param {string} filename - output filename
 */
export async function downloadReceiptPDF(htmlContent, filename = 'receipt.pdf') {
    if (typeof html2pdf === 'undefined') {
        showToast('PDF library not loaded', 'error');
        return;
    }
    const container = document.createElement('div');
    container.innerHTML = htmlContent;
    container.style.cssText = 'position:fixed;left:-9999px;top:0;z-index:-1;background:white;padding:20px;width:800px;';
    document.body.appendChild(container);
    try {
        await html2pdf().set({
            margin: 10,
            filename,
            html2canvas: { scale: 2 },
            jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
        }).from(container).save();
    } finally {
        document.body.removeChild(container);
    }
}
