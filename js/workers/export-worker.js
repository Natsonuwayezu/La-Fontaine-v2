/* ═══════════════════════════════════════════════════════════════════
   js/workers/export-worker.js — Bulk export computation
   ═══════════════════════════════════════════════════════════════════
   Handles large bulk exports (full student roster, years of payment
   history, whole-DB backup JSON) without freezing the UI. Uses
   SheetJS (xlsx) loaded via importScripts — the same library
   js/integrations/xlsx.js uses on the main thread for smaller,
   synchronous exports; this worker is for the "this could be
   thousands of rows" cases.

   Incoming message:
     { type: 'EXPORT_XLSX', payload: { sheets: [{ name, rows: [...] }], options: { ... } } }
     { type: 'EXPORT_CSV', payload: { rows: [...], headers: [...] } }
     { type: 'EXPORT_JSON_BACKUP', payload: { tables: { [tableName]: rows }, meta: { ... } } }
     { type: 'EXPORT_HTML', payload: { rows: [...], title: '...', columns: [...] } }
     { type: 'EXPORT_PDF', payload: { html: '...', options: { ... } } }
     { type: 'CANCEL' }

   Outgoing messages:
     { type: 'PROGRESS', payload: { pct: 0-100, message: '...' } }
     { type: 'COMPLETE', payload: { blob: Blob, filename: '...' } }
     { type: 'ERROR', payload: { message: '...', stack: '...' } }

   Last updated: 2026-07-13
   ═══════════════════════════════════════════════════════════════════ */

// ─── LOAD DEPENDENCIES ────────────────────────────────────────────────

// Load SheetJS for Excel support
importScripts('https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js');

// Check if XLSX loaded successfully
const XLSX_AVAILABLE = typeof XLSX !== 'undefined';

// ─── STATE ────────────────────────────────────────────────────────────

let isCancelled = false;

// ─── HELPERS ───────────────────────────────────────────────────────────

/**
 * Escape a cell value for CSV export
 * @param {any} val - The value to escape
 * @returns {string} Escaped string
 */
function escapeCSV(val) {
  const str = String(val ?? '');
  if (/[",\n\r]/.test(str) || str.includes('"')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Convert rows to CSV blob
 * @param {Array} rows - Array of row objects
 * @param {Array} headers - Optional headers (uses Object.keys if not provided)
 * @returns {Blob} CSV blob
 */
function rowsToCSVBlob(rows, headers = null) {
  if (!rows || !rows.length) {
    return new Blob([''], { type: 'text/csv;charset=utf-8' });
  }

  const hdr = headers || Object.keys(rows[0]);
  const lines = [
    hdr.map(escapeCSV).join(','),
    ...rows.map(row => hdr.map(h => escapeCSV(row[h])).join(','))
  ];

  return new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
}

/**
 * Build an Excel workbook from sheets
 * @param {Array} sheets - Array of { name, rows } objects
 * @returns {object} XLSX workbook
 */
function buildWorkbook(sheets) {
  if (!XLSX_AVAILABLE) {
    throw new Error('SheetJS library not available');
  }

  const wb = XLSX.utils.book_new();

  sheets.forEach(({ name, rows }) => {
    if (!rows || !rows.length) {
      // Create empty sheet
      const ws = XLSX.utils.aoa_to_sheet([[]]);
      XLSX.utils.book_append_sheet(wb, ws, name.slice(0, 31));
      return;
    }

    const ws = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, name.slice(0, 31));
  });

  return wb;
}

/**
 * Convert workbook to blob
 * @param {object} wb - XLSX workbook
 * @param {object} options - Options for write
 * @returns {Blob} Excel blob
 */
function workbookToBlob(wb, options = {}) {
  if (!XLSX_AVAILABLE) {
    throw new Error('SheetJS library not available');
  }

  const buffer = XLSX.write(wb, {
    bookType: options.bookType || 'xlsx',
    type: 'array',
    ...options
  });

  const mimeType = options.bookType === 'xls'
    ? 'application/vnd.ms-excel'
    : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

  return new Blob([buffer], { type: mimeType });
}

/**
 * Convert rows to HTML table
 * @param {Array} rows - Array of row objects
 * @param {string} title - Table title
 * @param {Array} columns - Optional column definitions
 * @returns {string} HTML string
 */
function rowsToHTML(rows, title = '', columns = null) {
  if (!rows || !rows.length) {
    return `<h3>${title || 'No data'}</h3><p>No records found.</p>`;
  }

  const hdr = columns || Object.keys(rows[0]);
  const headerRow = hdr.map(h => `<th>${escapeHTML(h)}</th>`).join('');
  const bodyRows = rows.map(row =>
    `<tr>${hdr.map(h => `<td>${escapeHTML(String(row[h] ?? ''))}</td>`).join('')}</tr>`
  ).join('');

  return `
        ${title ? `<h3>${escapeHTML(title)}</h3>` : ''}
        <div class="table-wrapper">
            <table class="data-table">
                <thead><tr>${headerRow}</tr></thead>
                <tbody>${bodyRows}</tbody>
            </table>
        </div>
        <p><em>Generated on ${new Date().toLocaleString()}</em></p>
    `;
}

/**
 * Simple HTML escape for text
 * @param {string} str - String to escape
 * @returns {string} Escaped string
 */
function escapeHTML(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Convert HTML to Blob
 * @param {string} html - HTML content
 * @param {string} title - Page title
 * @returns {Blob} HTML blob
 */
function htmlToBlob(html, title = 'Export') {
  const fullHtml = `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escapeHTML(title)}</title>
    <style>
        *{margin:0;padding:0;box-sizing:border-box}
        body{font-family:'DM Sans',Arial,sans-serif;padding:40px;background:#f5f0eb;color:#2c241e}
        h1{font-family:'Syne',sans-serif;font-weight:700;color:#1a1410;margin-bottom:8px}
        h3{font-family:'Syne',sans-serif;font-weight:600;color:#2c241e;margin:20px 0 10px}
        .table-wrapper{overflow-x:auto;margin-top:12px}
        table{width:100%;border-collapse:collapse;font-size:13px}
        th{background:#2d1f3a;color:#f5f0eb;padding:10px 14px;text-align:left;font-weight:600}
        td{padding:8px 14px;border-bottom:1px solid #e8e0d8;color:#2c241e}
        tr:hover{background:#f5f0eb}
        .footer{margin-top:30px;padding-top:16px;border-top:1px solid #e8e0d8;font-size:12px;color:#6b5f56;text-align:center}
        @media print{body{padding:20px}tr:hover{background:transparent}}
        @media (max-width:640px){body{padding:16px}table{font-size:11px}th,td{padding:6px 8px}}
    </style>
</head>
<body>
    ${html}
    <div class="footer">ECOLE LA FONTAINE · Export generated on ${new Date().toLocaleString()}</div>
</body>
</html>`;

  return new Blob([fullHtml], { type: 'text/html;charset=utf-8' });
}

// ─── EXPORT HANDLERS ─────────────────────────────────────────────────

/**
 * Handle Excel export
 * @param {object} payload - Export payload
 * @param {Array} payload.sheets - Sheet definitions
 * @param {object} payload.options - Export options
 * @param {string} payload.filename - Output filename
 */
function handleExportXLSX(payload) {
  const { sheets = [], options = {}, filename = 'export.xlsx' } = payload;

  self.postMessage({ type: 'PROGRESS', payload: { pct: 20, message: 'Building workbook...' } });

  if (isCancelled) {
    self.postMessage({ type: 'CANCEL' });
    return;
  }

  const totalRows = sheets.reduce((sum, s) => sum + (s.rows ? s.rows.length : 0), 0);
  let processedRows = 0;

  // Process sheets with progress tracking
  const processedSheets = sheets.map(sheet => {
    // Report progress
    const pct = 20 + Math.min(60, (processedRows / Math.max(1, totalRows)) * 60);
    self.postMessage({ type: 'PROGRESS', payload: { pct: Math.round(pct), message: `Processing ${sheet.name}...` } });

    processedRows += sheet.rows ? sheet.rows.length : 0;
    return sheet;
  });

  self.postMessage({ type: 'PROGRESS', payload: { pct: 80, message: 'Writing Excel file...' } });

  const wb = buildWorkbook(processedSheets);
  const blob = workbookToBlob(wb, options);

  self.postMessage({ type: 'PROGRESS', payload: { pct: 100, message: 'Complete!' } });
  self.postMessage({ type: 'COMPLETE', payload: { blob, filename } });
}

/**
 * Handle CSV export
 * @param {object} payload - Export payload
 * @param {Array} payload.rows - Row data
 * @param {Array} payload.headers - Optional headers
 * @param {string} payload.filename - Output filename
 */
function handleExportCSV(payload) {
  const { rows = [], headers = null, filename = 'export.csv' } = payload;

  self.postMessage({ type: 'PROGRESS', payload: { pct: 30, message: 'Processing CSV data...' } });

  if (isCancelled) {
    self.postMessage({ type: 'CANCEL' });
    return;
  }

  self.postMessage({ type: 'PROGRESS', payload: { pct: 60, message: 'Building CSV...' } });

  const blob = rowsToCSVBlob(rows, headers);

  self.postMessage({ type: 'PROGRESS', payload: { pct: 100, message: 'Complete!' } });
  self.postMessage({ type: 'COMPLETE', payload: { blob, filename } });
}

/**
 * Handle JSON backup export
 * @param {object} payload - Export payload
 * @param {object} payload.tables - Table data
 * @param {object} payload.meta - Metadata
 * @param {string} payload.filename - Output filename
 */
function handleExportJSONBackup(payload) {
  const { tables = {}, meta = {}, filename = 'backup.json' } = payload;

  self.postMessage({ type: 'PROGRESS', payload: { pct: 20, message: 'Preparing backup data...' } });

  if (isCancelled) {
    self.postMessage({ type: 'CANCEL' });
    return;
  }

  self.postMessage({ type: 'PROGRESS', payload: { pct: 50, message: 'Serializing JSON...' } });

  const backupData = {
    version: '9.0',
    exportedAt: new Date().toISOString(),
    school: meta.schoolName || 'ECOLE LA FONTAINE',
    tables: tables
  };

  const json = JSON.stringify(backupData, null, 2);

  self.postMessage({ type: 'PROGRESS', payload: { pct: 80, message: 'Creating file...' } });

  const blob = new Blob([json], { type: 'application/json;charset=utf-8' });

  self.postMessage({ type: 'PROGRESS', payload: { pct: 100, message: 'Complete!' } });
  self.postMessage({ type: 'COMPLETE', payload: { blob, filename } });
}

/**
 * Handle HTML export
 * @param {object} payload - Export payload
 * @param {Array} payload.rows - Row data
 * @param {string} payload.title - Page title
 * @param {Array} payload.columns - Column definitions
 * @param {string} payload.filename - Output filename
 */
function handleExportHTML(payload) {
  const { rows = [], title = 'Export', columns = null, filename = 'export.html' } = payload;

  self.postMessage({ type: 'PROGRESS', payload: { pct: 30, message: 'Building HTML...' } });

  if (isCancelled) {
    self.postMessage({ type: 'CANCEL' });
    return;
  }

  self.postMessage({ type: 'PROGRESS', payload: { pct: 60, message: 'Generating content...' } });

  const htmlContent = rowsToHTML(rows, title, columns);
  const blob = htmlToBlob(htmlContent, title);

  self.postMessage({ type: 'PROGRESS', payload: { pct: 100, message: 'Complete!' } });
  self.postMessage({ type: 'COMPLETE', payload: { blob, filename } });
}

// ─── MESSAGE HANDLER ─────────────────────────────────────────────────

self.onmessage = function (e) {
  const { type, payload = {} } = e.data || {};

  // Handle cancellation
  if (type === 'CANCEL') {
    isCancelled = true;
    self.postMessage({ type: 'CANCELLED' });
    return;
  }

  // Reset cancellation flag for new job
  isCancelled = false;

  try {
    switch (type) {
      case 'EXPORT_XLSX':
        handleExportXLSX(payload);
        break;

      case 'EXPORT_CSV':
        handleExportCSV(payload);
        break;

      case 'EXPORT_JSON_BACKUP':
        handleExportJSONBackup(payload);
        break;

      case 'EXPORT_HTML':
        handleExportHTML(payload);
        break;

      default:
        self.postMessage({
          type: 'ERROR',
          payload: {
            message: `Unknown export type: ${type}`,
            stack: null
          }
        });
    }
  } catch (err) {
    self.postMessage({
      type: 'ERROR',
      payload: {
        message: err?.message || 'Export failed',
        stack: err?.stack || null
      }
    });
  }
};

// ─── HANDLE UNCAUGHT ERRORS ──────────────────────────────────────────

self.onerror = function (error) {
  self.postMessage({
    type: 'ERROR',
    payload: {
      message: error?.message || 'Uncaught worker error',
      stack: error?.stack || null
    }
  });
};

// ─── HANDLE UNHANDLED REJECTIONS ─────────────────────────────────────

self.onunhandledrejection = function (event) {
  self.postMessage({
    type: 'ERROR',
    payload: {
      message: event?.reason?.message || 'Unhandled promise rejection',
      stack: event?.reason?.stack || null
    }
  });
};

// ─── EXPOSE FOR DEBUGGING ────────────────────────────────────────────

// Log that the worker is ready
console.log('[ExportWorker] Ready — waiting for tasks');

// ─── EXPORT WORKER API ───────────────────────────────────────────────

// The worker self registers all exports above. 
// No additional exports needed for a worker file.