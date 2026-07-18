/* ═══════════════════════════════════════════════════════════════════
   js/integrations/xlsx.js — SheetJS wrapper (main thread)
   ═══════════════════════════════════════════════════════════════════
   js/workers/export-worker.js already handles large, off-thread
   exports via SheetJS in a Worker. This file is the main-thread
   counterpart for three things a worker can't (or shouldn't) do:

   1. Reading an uploaded file for bulk import (js/modules/bulk/
      bulk-import.js) — needs the File object directly, and the parse
      is fast enough not to warrant a worker round-trip.
   2. Small, synchronous exports (a single table, a quick report) where
      spinning up a worker is unnecessary overhead.
   3. Generating the three import templates — templates/exports/
      {students,marks,finance}-template.xlsx exist as empty (0-byte)
      placeholder files in this repo, so real templates are built here
      on demand rather than served as static files.

   SheetJS is lazy-loaded from CDN on first use, not in index.html's
   head, since most page loads never touch import/export. NOTE: this
   CDN URL isn't currently cached by sw.js, so import/export won't work
   the very first time a user does it while offline — worth adding to
   the service worker's cache list when that file is revisited.
   ═══════════════════════════════════════════════════════════════════ */

const XLSXIntegration = (() => {

    const CDN_URL = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
    let loadPromise = null;

    function isAvailable() {
        return typeof window.XLSX !== 'undefined';
    }

    function ensureLoaded() {
        if (isAvailable()) return Promise.resolve(window.XLSX);
        if (loadPromise) return loadPromise;

        loadPromise = new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = CDN_URL;
            script.onload = () => resolve(window.XLSX);
            script.onerror = () => {
                loadPromise = null; // allow a retry on the next call
                reject(new Error('Could not load the spreadsheet library. Check your internet connection and try again.'));
            };
            document.head.appendChild(script);
        });
        return loadPromise;
    }

    /**
     * Export rows to a downloaded .xlsx file. Triggers the browser's
     * native download via XLSX.writeFile — no manual Blob/anchor needed.
     * sheets: [{ name: 'Students', rows: [{...}, ...] }]
     */
    async function exportRows(filename, sheets) {
        const XLSX = await ensureLoaded();
        const wb = XLSX.utils.book_new();
        sheets.forEach(({ name, rows }) => {
            const ws = XLSX.utils.json_to_sheet(rows);
            autoSizeColumns(ws, rows);
            XLSX.utils.book_append_sheet(wb, ws, (name || 'Sheet1').slice(0, 31)); // Excel's 31-char sheet name limit
        });
        XLSX.writeFile(wb, filename);
    }

    function autoSizeColumns(ws, rows) {
        if (!rows.length) return;
        const headers = Object.keys(rows[0]);
        ws['!cols'] = headers.map(h => {
            const maxLen = Math.max(h.length, ...rows.map(r => String(r[h] ?? '').length));
            return { wch: Math.min(Math.max(maxLen + 2, 10), 40) };
        });
    }

    /**
     * Parse an uploaded File (.xlsx/.xls/.csv) into plain row objects per
     * sheet. Used by bulk-import.js's file dropzone.
     * Returns { sheetNames: [...], sheets: { [name]: [{col: val}, ...] } }
     */
    async function readFile(file) {
        if (!file) throw new Error('No file provided.');
        const ext = file.name.split('.').pop().toLowerCase();
        if (!SUPPORTED_IMPORT_FORMATS?.some(f => f.slice(1) === ext)) {
            throw new Error(`Unsupported file type ".${ext}". Please upload ${SUPPORTED_IMPORT_FORMATS?.join(', ') || '.xlsx, .xls, or .csv'}.`);
        }
        if (file.size > (MAX_UPLOAD_SIZE_MB || 10) * 1024 * 1024) {
            throw new Error(`File is too large. Maximum size is ${MAX_UPLOAD_SIZE_MB || 10}MB.`);
        }

        const XLSX = await ensureLoaded();
        const buffer = await file.arrayBuffer();
        const wb = XLSX.read(buffer, { type: 'array', cellDates: true });

        const sheets = {};
        wb.SheetNames.forEach(name => {
            sheets[name] = XLSX.utils.sheet_to_json(wb.Sheets[name], { defval: '', raw: false });
        });
        return { sheetNames: wb.SheetNames, sheets };
    }

    // ── Import templates ────────────────────────────────────────────
    // Real, generated templates — the static files in templates/exports/
    // are empty placeholders in this repo, so downloadTemplate() builds
    // the actual workbook on demand rather than pointing at a dead file.
    const TEMPLATES = {
        students: {
            filename: 'students-import-template.xlsx',
            headers: ['First Name', 'Last Name', 'Date of Birth (YYYY-MM-DD)', 'Gender (M/F)', 'Class', 'Guardian Name', 'Guardian Phone', 'Guardian Email'],
            example: ['Jean', 'MUGISHA', '2016-03-14', 'M', 'Primary 4A', 'MUGISHA Emmanuel', '+250788123456', 'e.mugisha@example.rw']
        },
        marks: {
            filename: 'marks-import-template.xlsx',
            headers: ['Student Code', 'Student Name', 'Subject', 'Assessment', 'Score'],
            example: ['STU-2024-0012', 'MUGISHA Jean', 'Mathematics', 'Quiz 4', '82']
        },
        finance: {
            filename: 'finance-import-template.xlsx',
            headers: ['Student Code', 'Fee Category', 'Amount (RWF)', 'Due Date (YYYY-MM-DD)'],
            example: ['STU-2024-0012', 'Tuition', '80000', '2026-09-01']
        }
    };

    async function downloadTemplate(type) {
        const tpl = TEMPLATES[type];
        if (!tpl) throw new Error(`Unknown template type "${type}". Expected one of: ${Object.keys(TEMPLATES).join(', ')}.`);

        const XLSX = await ensureLoaded();
        const ws = XLSX.utils.aoa_to_sheet([tpl.headers, tpl.example]);
        ws['!cols'] = tpl.headers.map(h => ({ wch: Math.max(h.length + 2, 16) }));
        // Light styling on the header row isn't reliably supported by the
        // community (non-Pro) build of SheetJS across all viewers, so the
        // example row below the header is the more dependable way to show
        // the expected format rather than relying on cell formatting.

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Template');
        XLSX.writeFile(wb, tpl.filename);
    }

    return { isAvailable, ensureLoaded, exportRows, readFile, downloadTemplate, TEMPLATES };
})();