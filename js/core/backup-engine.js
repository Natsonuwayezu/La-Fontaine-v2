/* ═══════════════════════════════════════════════════════════════════
   js/core/backup-engine.js
   ═══════════════════════════════════════════════════════════════════
   Purpose : Full database backup and restore.
             doFullBackup()  — reads every table from Supabase,
                               packages into a dated JSON file,
                               and triggers browser download.
             restoreFromBackup() — uploads a JSON backup file,
                               validates its structure, then
                               upserts all rows back to the DB.
             Auto-schedule   — daily backup reminder if admin
                               hasn't backed up in > 7 days.
             Integrity check — validates that a backup file contains
                               the expected tables before restoring.
   References: backend.txt Part 5.11
   Load order: AFTER api.js, logger.js, state.js.
   ═══════════════════════════════════════════════════════════════════ */

'use strict';

/* ─────────────────────────────────────────────────────────────────
   BACKUP STATE
   ───────────────────────────────────────────────────────────────── */

const LAST_BACKUP_KEY = 'lf_last_backup_date';
const BACKUP_REMINDER_DAYS = 7;   // remind after 7 days without backup

/* ─────────────────────────────────────────────────────────────────
   FULL BACKUP
   ───────────────────────────────────────────────────────────────── */

/**
 * Perform a full database backup.
 * Reads ALL_TABLES from constants.js, fetches every row from each,
 * and packages into a single timestamped JSON file which is
 * immediately downloaded to the user's device.
 *
 * The JSON structure:
 * {
 *   meta: { app, version, school, backedUpAt, backedUpBy, tableCount, rowCount },
 *   tables: { table_name: [ ...rows ], ... }
 * }
 *
 * @param {Object} [opts]
 * @param {boolean} [opts.silent]      - skip toasts (for auto-backup)
 * @param {boolean} [opts.includeHoliday] - include holiday_* tables (default true)
 * @returns {Promise<{ success: boolean, filename: string, rowCount: number }>}
 */
async function doFullBackup(opts = {}) {
    const { silent = false, includeHoliday = true } = opts;

    if (!silent) {
        showToast('Starting backup… this may take a moment.', 'info', 4000);
    }

    const s = state.schoolSettings || {};
    const schoolNm = s.school_name || SCHOOL_DEFAULTS.school_name;
    const user = state.currentUser;
    const now = new Date();
    const dateStr = now.toISOString().replace(/[:.]/g, '-').substring(0, 19);

    const tables = includeHoliday
        ? BACKUP_ALL_TABLES
        : BACKUP_ALL_TABLES.filter(t => !t.startsWith('holiday_'));

    const backup = {
        meta: {
            app: APP_NAME,
            version: APP_VERSION,
            school: schoolNm,
            backedUpAt: now.toISOString(),
            backedUpBy: user ? `${user.first_name} ${user.last_name} (${user.role})` : 'System',
            tableCount: 0,
            rowCount: 0,
        },
        tables: {},
    };

    let totalRows = 0;
    let failedTbls = [];

    // Fetch each table
    for (const tableName of tables) {
        try {
            const rows = await getAllRecords(tableName);
            backup.tables[tableName] = rows;
            totalRows += rows.length;
        } catch (err) {
            console.warn(`[Backup] Failed to read table "${tableName}":`, err.message);
            failedTbls.push(tableName);
            backup.tables[tableName] = []; // include empty array so structure is complete
        }
    }

    backup.meta.tableCount = Object.keys(backup.tables).length;
    backup.meta.rowCount = totalRows;

    // Download
    const filename = `${BACKUP_FILENAME_PREFIX}${dateStr}.json`;
    downloadJSON(backup, filename);

    // Record backup date
    localStorage.setItem(LAST_BACKUP_KEY, now.toISOString());

    // Log the backup action
    await logBackup(backup.meta.tableCount, Math.round(JSON.stringify(backup).length / 1024));

    if (!silent) {
        if (failedTbls.length > 0) {
            showToast(
                `Backup downloaded with warnings: ${failedTbls.length} table(s) failed. Check console.`,
                'warning',
                6000
            );
        } else {
            showToast(
                `Backup complete — ${totalRows.toLocaleString()} rows across ${backup.meta.tableCount} tables.`,
                'success',
                5000
            );
        }
    }

    return { success: true, filename, rowCount: totalRows, failedTables: failedTbls };
}

/* ─────────────────────────────────────────────────────────────────
   PARTIAL BACKUP  (selected tables only)
   ───────────────────────────────────────────────────────────────── */

/**
 * Backup only the specified tables.
 * Used for quick targeted exports (e.g. just students + marks).
 *
 * @param {string[]} tableNames - list of table names to include
 * @param {string}   [label]    - label for the filename
 */
async function doPartialBackup(tableNames, label = 'partial') {
    if (!tableNames || tableNames.length === 0) {
        showToast('No tables specified for partial backup.', 'warning');
        return null;
    }

    showToast(`Backing up ${tableNames.length} tables…`, 'info', 3000);

    const now = new Date();
    const dateStr = now.toISOString().replace(/[:.]/g, '-').substring(0, 19);
    const s = state.schoolSettings || {};

    const backup = {
        meta: {
            app: APP_NAME,
            version: APP_VERSION,
            school: s.school_name || SCHOOL_DEFAULTS.school_name,
            backedUpAt: now.toISOString(),
            type: 'partial',
            tables_included: tableNames,
            tableCount: 0,
            rowCount: 0,
        },
        tables: {},
    };

    let totalRows = 0;

    for (const tableName of tableNames) {
        try {
            const rows = await getAllRecords(tableName);
            backup.tables[tableName] = rows;
            totalRows += rows.length;
        } catch (err) {
            console.warn(`[Backup] Partial backup failed for "${tableName}":`, err.message);
            backup.tables[tableName] = [];
        }
    }

    backup.meta.tableCount = Object.keys(backup.tables).length;
    backup.meta.rowCount = totalRows;

    const filename = `${BACKUP_FILENAME_PREFIX}${label}_${dateStr}.json`;
    downloadJSON(backup, filename);

    showToast(`Partial backup downloaded — ${totalRows.toLocaleString()} rows.`, 'success');
    return { filename, rowCount: totalRows };
}

/* ─────────────────────────────────────────────────────────────────
   BACKUP INTEGRITY CHECK
   ───────────────────────────────────────────────────────────────── */

/**
 * Validate a parsed backup JSON object before restoring it.
 * Returns { valid: boolean, errors: string[], warnings: string[], meta: Object }
 *
 * @param {Object} backup - parsed JSON from a backup file
 */
function validateBackup(backup) {
    const errors = [];
    const warnings = [];

    // Check top-level structure
    if (!backup || typeof backup !== 'object') {
        errors.push('Invalid file — not a valid JSON object.');
        return { valid: false, errors, warnings, meta: null };
    }

    if (!backup.meta) {
        errors.push('Missing "meta" section — this may not be an École La Fontaine backup file.');
    }

    if (!backup.tables || typeof backup.tables !== 'object') {
        errors.push('Missing "tables" section — cannot restore.');
        return { valid: false, errors, warnings, meta: backup.meta || null };
    }

    // Check app identity
    if (backup.meta?.app && backup.meta.app !== APP_NAME) {
        warnings.push(`This backup was created by "${backup.meta.app}" — may not be compatible.`);
    }

    // Check version compatibility
    if (backup.meta?.version) {
        const bvParts = String(backup.meta.version).split('.').map(Number);
        const cvParts = String(APP_VERSION).split('.').map(Number);
        if (bvParts[0] < cvParts[0]) {
            warnings.push(`Backup is from an older major version (v${backup.meta.version}). Some fields may differ.`);
        }
    }

    // Check for critical tables
    const CRITICAL = ['students', 'teachers', 'classes', 'subjects', 'academic_years', 'terms'];
    CRITICAL.forEach(t => {
        if (!backup.tables[t]) {
            errors.push(`Missing critical table: "${t}".`);
        } else if (!Array.isArray(backup.tables[t])) {
            errors.push(`Table "${t}" has invalid format — expected array.`);
        }
    });

    // Check total row count
    if (backup.meta?.rowCount === 0) {
        warnings.push('Backup contains 0 rows — it may be empty.');
    }

    // Date of backup
    if (backup.meta?.backedUpAt) {
        const age = daysBetween(backup.meta.backedUpAt.split('T')[0], todayISO());
        if (age > 90) {
            warnings.push(`This backup is ${age} days old. Consider using a more recent backup.`);
        }
    }

    return {
        valid: errors.length === 0,
        errors,
        warnings,
        meta: backup.meta || null,
    };
}

/* ─────────────────────────────────────────────────────────────────
   RESTORE FROM BACKUP
   ───────────────────────────────────────────────────────────────── */

/**
 * Restore the database from a parsed backup JSON object.
 * Uses UPSERT (merge-duplicates) so existing rows are updated
 * and new rows are inserted. Does NOT delete rows that exist in
 * the DB but not in the backup — this is a safe merge, not a wipe.
 *
 * IMPORTANT: Show a confirmation dialog BEFORE calling this function.
 * The restore process cannot be undone automatically.
 *
 * @param {Object}   backup         - validated parsed backup JSON
 * @param {Object}   [opts]
 * @param {string[]} [opts.onlyTables] - restore only these tables (optional filter)
 * @param {Function} [opts.onProgress] - called with (tableName, done, total) after each table
 * @returns {Promise<{ success, tablesRestored, rowsRestored, errors }>}
 */
async function restoreFromBackup(backup, opts = {}) {
    const { onlyTables = null, onProgress = null } = opts;

    // Validate first
    const validation = validateBackup(backup);
    if (!validation.valid) {
        const errMsg = validation.errors.join(' | ');
        showToast(`Cannot restore: ${errMsg}`, 'error', 8000);
        return { success: false, tablesRestored: 0, rowsRestored: 0, errors: validation.errors };
    }

    showToast('Restoring from backup… do not close this tab.', 'warning', 10000);

    const tables = onlyTables
        ? Object.entries(backup.tables).filter(([name]) => onlyTables.includes(name))
        : Object.entries(backup.tables);

    const total = tables.length;
    let tablesRestored = 0;
    let rowsRestored = 0;
    const errors = [];

    // Restore in safe order: reference tables first, dependent tables last
    const RESTORE_ORDER = [
        // Independent / reference tables first
        'school_settings', 'grading_scale',
        'academic_years', 'terms', 'holidays',
        'classes', 'subjects',
        'teachers',
        'families', 'students',
        // Dependent tables
        'teacher_assignments', 'timetable_slots',
        'assessments',
        'marks',
        'fee_categories', 'fee_amounts',
        'student_fees', 'student_credit_balance',
        'payments', 'payment_allocations',
        'fee_waivers',
        'notifications', 'announcements',
        'system_logs', 'student_promotions', 'student_promotion_records',
        // Holiday tables last
        'holiday_subjects', 'holiday_enrollments',
        'holiday_marks', 'holiday_fees',
    ];

    // Sort tables according to restore order
    const sortedTables = [...tables].sort(([a], [b]) => {
        const ia = RESTORE_ORDER.indexOf(a);
        const ib = RESTORE_ORDER.indexOf(b);
        if (ia === -1 && ib === -1) return 0;
        if (ia === -1) return 1;
        if (ib === -1) return -1;
        return ia - ib;
    });

    for (const [tableName, rows] of sortedTables) {
        if (!Array.isArray(rows) || rows.length === 0) {
            tablesRestored++;
            if (onProgress) onProgress(tableName, tablesRestored, total);
            continue;
        }

        try {
            // Upsert in batches of 200 to avoid request size limits
            const BATCH = 200;
            for (let i = 0; i < rows.length; i += BATCH) {
                const batch = rows.slice(i, i + BATCH);
                await upsertMany(tableName, batch);
            }

            rowsRestored += rows.length;
            tablesRestored++;
            console.info(`[Backup] Restored "${tableName}": ${rows.length} rows.`);

        } catch (err) {
            const msg = `Failed to restore "${tableName}": ${err.message}`;
            errors.push(msg);
            console.error(`[Backup] ${msg}`);
        }

        if (onProgress) onProgress(tableName, tablesRestored, total);

        // Small delay between tables to avoid overwhelming the API rate limit
        await _sleep(80);
    }

    // Log the restore action
    await logRestore(tablesRestored);

    // Reload all state data from the newly restored DB
    await loadAllData({ silent: true }).catch(err => {
        console.warn('[Backup] State reload after restore failed:', err.message);
    });

    const success = errors.length < Math.floor(tables.length * 0.5); // success if < 50% failed

    if (success) {
        showToast(
            `Restore complete — ${tablesRestored} tables, ${rowsRestored.toLocaleString()} rows.` +
            (errors.length > 0 ? ` ${errors.length} table(s) had errors.` : ''),
            errors.length > 0 ? 'warning' : 'success',
            6000
        );
    } else {
        showToast(
            `Restore failed — ${errors.length} errors. Check the console for details.`,
            'error',
            8000
        );
    }

    return { success, tablesRestored, rowsRestored, errors };
}

/* ─────────────────────────────────────────────────────────────────
   READ BACKUP FILE  (parse uploaded JSON file)
   ───────────────────────────────────────────────────────────────── */

/**
 * Read and parse a backup JSON file from a <input type="file"> element.
 * Returns the parsed backup object.
 *
 * @param {File} file - File object from file input
 * @returns {Promise<Object>} parsed backup JSON
 */
function readBackupFile(file) {
    return new Promise((resolve, reject) => {
        if (!file) {
            reject(new Error('No file provided.'));
            return;
        }

        if (!file.name.endsWith('.json')) {
            reject(new Error('Please select a .json backup file.'));
            return;
        }

        const MAX_SIZE = 200 * 1024 * 1024; // 200 MB
        if (file.size > MAX_SIZE) {
            reject(new Error('File is too large (max 200 MB).'));
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const parsed = JSON.parse(e.target.result);
                resolve(parsed);
            } catch (err) {
                reject(new Error('Invalid JSON file — could not parse.'));
            }
        };
        reader.onerror = () => reject(new Error('Failed to read file.'));
        reader.readAsText(file);
    });
}

/* ─────────────────────────────────────────────────────────────────
   RESTORE PREVIEW
   ───────────────────────────────────────────────────────────────── */

/**
 * Build a human-readable summary of what a backup contains.
 * Used to show the user what they are about to restore.
 *
 * @param {Object} backup - parsed backup JSON
 * @returns {Object} summary
 */
function getBackupPreview(backup) {
    if (!backup || !backup.tables) return null;

    const tableList = Object.entries(backup.tables).map(([name, rows]) => ({
        name,
        rowCount: Array.isArray(rows) ? rows.length : 0,
    })).sort((a, b) => b.rowCount - a.rowCount);

    const totalRows = tableList.reduce((sum, t) => sum + t.rowCount, 0);

    return {
        meta: backup.meta || {},
        tableList,
        totalRows,
        totalTables: tableList.length,
        isValid: validateBackup(backup),
    };
}

/* ─────────────────────────────────────────────────────────────────
   AUTO-BACKUP SCHEDULER
   ───────────────────────────────────────────────────────────────── */

/**
 * Check if the admin should be reminded to back up.
 * Shown once per login session if backup hasn't been done in
 * BACKUP_REMINDER_DAYS days.
 *
 * Call from boot.js after login.
 */
function checkBackupReminder() {
    if (!iAmAdmin()) return;

    const lastBackup = localStorage.getItem(LAST_BACKUP_KEY);
    if (!lastBackup) {
        // Never backed up
        _showBackupReminder('You have never backed up this database. Create a backup in Settings → Backup & Restore.');
        return;
    }

    const daysSince = daysBetween(lastBackup.split('T')[0], todayISO());
    if (daysSince >= BACKUP_REMINDER_DAYS) {
        _showBackupReminder(`Your last backup was ${daysSince} days ago. Consider backing up soon.`);
    }
}

function _showBackupReminder(message) {
    // Delayed so it doesn't compete with the boot toasts
    setTimeout(() => {
        if (typeof showToast === 'function') {
            showToast(`Backup reminder: ${message}`, 'warning', 8000);
        }
    }, 3000);
}

/**
 * Get the date of the last backup as a formatted string.
 */
function getLastBackupLabel() {
    const last = localStorage.getItem(LAST_BACKUP_KEY);
    if (!last) return 'Never';
    const days = daysBetween(last.split('T')[0], todayISO());
    if (days === 0) return 'Today';
    if (days === 1) return 'Yesterday';
    return `${days} days ago (${fmtDate(last)})`;
}

/* ─────────────────────────────────────────────────────────────────
   TABLE-LEVEL EXPORT  (for individual table dumps)
   ───────────────────────────────────────────────────────────────── */

/**
 * Export a single table as a JSON file.
 * Useful for debugging or sharing a subset of data.
 *
 * @param {string} tableName
 */
async function exportTable(tableName) {
    try {
        showToast(`Exporting ${tableName}…`, 'info', 2000);
        const rows = await getAllRecords(tableName);
        const dateStr = new Date().toISOString().split('T')[0];
        const filename = `${tableName}_${dateStr}.json`;
        downloadJSON({ table: tableName, rows, exportedAt: new Date().toISOString() }, filename);
        showToast(`Exported ${rows.length} rows from ${tableName}.`, 'success');
    } catch (err) {
        handleApiError(err, `export table ${tableName}`);
    }
}

/* ─────────────────────────────────────────────────────────────────
   WIPE + RESTORE  (destructive — admin only)
   ───────────────────────────────────────────────────────────────── */

/**
 * Wipe all data from a table and re-insert from backup.
 * Much more destructive than restoreFromBackup() but produces
 * a clean state. Only used when merge-restore fails.
 *
 * This function does NOT attempt to wipe — Supabase RLS and
 * the app's policy prevent mass deletes. Instead it calls
 * restoreFromBackup() with a strong upsert that overwrites
 * all matching rows.
 *
 * Call with confirmed=true only after the user has clicked
 * through a double-confirm dialog.
 *
 * @param {Object}  backup    - parsed validated backup JSON
 * @param {boolean} confirmed - must be exactly true
 */
async function wipeAndRestore(backup, confirmed) {
    if (confirmed !== true) {
        showToast('Wipe & Restore requires explicit confirmation.', 'error');
        return { success: false };
    }
    if (!iAmAdmin()) {
        showToast('Only administrators can perform a wipe & restore.', 'error');
        return { success: false };
    }

    await logAction('WIPE_RESTORE_INITIATED', null, null, {
        by: state.currentUser?.name,
        timestamp: new Date().toISOString(),
    }, 'warning');

    return restoreFromBackup(backup, {});
}

/* ─────────────────────────────────────────────────────────────────
   UTILITY
   ───────────────────────────────────────────────────────────────── */

function _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/* ─────────────────────────────────────────────────────────────────
   EXPOSE
   ───────────────────────────────────────────────────────────────── */

window.doFullBackup = doFullBackup;
window.doPartialBackup = doPartialBackup;
window.validateBackup = validateBackup;
window.restoreFromBackup = restoreFromBackup;
window.readBackupFile = readBackupFile;
window.getBackupPreview = getBackupPreview;
window.checkBackupReminder = checkBackupReminder;
window.getLastBackupLabel = getLastBackupLabel;
window.exportTable = exportTable;
window.wipeAndRestore = wipeAndRestore;