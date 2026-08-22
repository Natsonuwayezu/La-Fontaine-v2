/* ═══════════════════════════════════════════════════════════════════
   js/core/api.js
   ═══════════════════════════════════════════════════════════════════
   Purpose : All Supabase REST API wrappers used across the app.
             Low-level fetch → high-level table helpers.
             Offline detection + de-duplicated toast.
             Holiday-aware write routing: marks/fees writes go to
             holiday tables when isHolidayMode() is true.
   Load order: AFTER state.js, BEFORE all modules.
   ═══════════════════════════════════════════════════════════════════ */

'use strict';

/* ─────────────────────────────────────────────────────────────────
   OFFLINE THROTTLE
   Show "no internet" toast at most once every 10 seconds no matter
   how many parallel requests fail at the same time. (Part 10.1)
   ───────────────────────────────────────────────────────────────── */

let _lastOfflineNotice = 0;

function notifyOffline() {
    const now = Date.now();
    if (now - _lastOfflineNotice < APP_CONFIG.offlineToastCooldown) return;
    _lastOfflineNotice = now;
    state.offline = true;
    console.warn('[API] Offline or server unreachable.');
    // showToast is defined in ui/toast.js which loads after api.js.
    // Use a safe call that won't throw if toast isn't ready yet.
    if (typeof showToast === 'function') {
        showToast('No internet connection. Some data may not load.', 'warning', 6000);
    }
}

/* ─────────────────────────────────────────────────────────────────
   HOLIDAY TABLE ROUTING
   When holiday mode is active, certain writes go to separate tables
   so they never pollute the normal academic year data.
   ───────────────────────────────────────────────────────────────── */

/**
 * Map a "logical" table name to the actual DB table, considering
 * whether we are in holiday mode.
 *
 * In holiday mode:
 *   'marks'        → 'holiday_marks'
 *   'student_fees' → 'holiday_fees'
 *   'assessments'  → kept as 'assessments' (same table, but filtered by context)
 *
 * All other tables are unaffected.
 *
 * @param {string} table  - logical table name
 * @param {string} op     - 'read' | 'write' (only writes are rerouted)
 */
function resolveTable(table, op = 'read') {
    if (op === 'write' && isHolidayMode()) {
        if (table === 'marks') return HOLIDAY_CONFIG.marksTable;
        if (table === 'student_fees') return HOLIDAY_CONFIG.feesTable;
    }
    return table;
}

/* ─────────────────────────────────────────────────────────────────
   LOW-LEVEL FETCH WRAPPER
   (Part 6 — API Operations Reference)
   ───────────────────────────────────────────────────────────────── */

/**
 * Low-level Supabase REST fetch.
 * @param {string} path   - Table + query string, e.g. 'students?class_id=eq.3'
 * @param {string} method - 'GET' | 'POST' | 'PATCH' | 'DELETE'
 * @param {object} [body] - Request body for POST/PATCH
 * @param {object} [extraHeaders] - Override or add headers (e.g. upsert header)
 * @returns {Promise<Array|Object>} - Parsed JSON or empty array for 204
 * @throws {Error} on non-2xx response or network failure
 */
async function apiFetch(path, method = 'GET', body = null, extraHeaders = {}) {
    if (!SUPABASE_URL || !SUPABASE_KEY) {
        throw new Error('Supabase credentials are not set. Go to Settings → API Settings.');
    }

    const headers = { ...apiHeaders(), ...extraHeaders };
    const opts = { method, headers };
    if (body) opts.body = JSON.stringify(body);

    let res;
    try {
        res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, opts);
    } catch (networkErr) {
        // fetch() itself threw — device is offline or DNS failed
        notifyOffline();
        throw new Error('OFFLINE: ' + networkErr.message);
    }

    // 204 No Content (successful DELETE / no rows)
    if (res.status === 204) return [];

    const json = await res.json().catch(() => ({}));

    if (!res.ok) {
        const msg = json.message || json.hint || json.error || `HTTP ${res.status}`;
        throw new Error(`[Supabase] ${msg} (path: ${path})`);
    }

    // Mark as online again after a successful response
    if (state.offline) {
        state.offline = false;
        console.info('[API] Connection restored.');
    }

    return json;
}

/* ─────────────────────────────────────────────────────────────────
   PAGINATED GET  (handles tables > 1000 rows)
   Supabase default page size is 1000; we loop until a short page.
   ───────────────────────────────────────────────────────────────── */

/**
 * Fetch ALL records from a table using automatic pagination.
 * Use for large tables: marks, student_fees, payments, assessments.
 *
 * @param {string} table     - table name
 * @param {string} [filter]  - raw query string (no leading '?')
 * @param {number} [batchSize] - page size (default 1000)
 */
async function getAllRecords(table, filter = '', batchSize = 1000) {
    let all = [];
    let page = 0;

    while (true) {
        const offset = page * batchSize;
        const sep = filter ? '&' : '';
        const path = `${table}?${filter}${sep}limit=${batchSize}&offset=${offset}`;
        const rows = await apiFetch(path);

        if (!rows || rows.length === 0) break;

        all = all.concat(rows);
        page++;

        if (rows.length < batchSize) break;
        if (page > 100) {
            console.warn(`[API] getAllRecords: safety limit reached for table "${table}"`);
            break;
        }
    }

    return all;
}

/* ─────────────────────────────────────────────────────────────────
   HIGH-LEVEL READ OPERATIONS
   ───────────────────────────────────────────────────────────────── */

/**
 * Generic GET — accepts either a filter object or raw query string.
 *
 * Object filter: { class_id: 3, is_deleted: false, order: 'last_name.asc' }
 * String filter: 'class_id=eq.3&is_deleted=eq.false'
 *
 * @param {string}        table
 * @param {Object|string} [filters]
 * @param {string}        [select]  - columns to select (default '*')
 */
async function getAll(table, filters = {}, select = '*') {
    let q = `select=${select}`;

    if (typeof filters === 'string') {
        if (filters) q += `&${filters}`;
    } else if (filters && typeof filters === 'object') {
        for (const [k, v] of Object.entries(filters)) {
            if (v === undefined || v === null || v === '') continue;
            if (k === 'order') { q += `&order=${encodeURIComponent(v)}`; continue; }
            if (k === 'limit') { q += `&limit=${v}`; continue; }
            if (k === 'offset') { q += `&offset=${v}`; continue; }
            if (k === 'select') { /* already handled */ continue; }
            // Supabase filter operators: eq, neq, gt, gte, lt, lte, is
            if (typeof v === 'boolean') {
                q += `&${k}=is.${v}`;
            } else {
                q += `&${k}=eq.${encodeURIComponent(v)}`;
            }
        }
    }

    // For known large tables, use paginated get
    const LARGE_TABLES = ['marks', 'assessments', 'payments', 'student_fees',
        'payment_allocations', 'system_logs', 'activity_logs',
        'holiday_marks', 'holiday_fees'];
    if (LARGE_TABLES.includes(table)) {
        return getAllRecords(table, q);
    }

    return apiFetch(`${table}?${q}`);
}

/**
 * Fetch a single record by primary key.
 * Returns the row object or null if not found.
 */
async function getById(table, id) {
    const rows = await apiFetch(`${table}?id=eq.${id}&select=*&limit=1`);
    return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
}

/**
 * Fetch records matching a raw filter string.
 * @param {string} table
 * @param {string} filterStr - e.g. 'student_id=eq.3&is_paid=is.false'
 */
async function getWhere(table, filterStr) {
    return apiFetch(`${table}?${filterStr}`);
}

/**
 * Fetch a record count without pulling all data.
 * Uses the Content-Range header.
 */
async function getCount(table, filterStr = '') {
    const sep = filterStr ? '&' : '';
    const path = `${table}?select=id${sep}${filterStr}&limit=0`;
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
        method: 'GET',
        headers: { ...apiHeaders(), 'Prefer': 'count=exact' },
    }).catch(() => null);

    if (!res || !res.ok) return 0;

    const range = res.headers.get('Content-Range');
    if (range) {
        const m = range.match(/\/(\d+)$/);
        if (m) return parseInt(m[1], 10);
    }

    // Fallback: count from actual data
    const rows = await apiFetch(`${table}?select=id&${filterStr}&limit=50000`);
    return Array.isArray(rows) ? rows.length : 0;
}

/* ─────────────────────────────────────────────────────────────────
   HIGH-LEVEL WRITE OPERATIONS
   ───────────────────────────────────────────────────────────────── */

/**
 * Insert a single row. Returns the created record or null.
 * Automatically routes to holiday tables in holiday mode.
 */
/**
 * Call a Postgres function (RPC) via PostgREST.
 * @param {string} fnName - the function name (e.g. 'login_check')
 * @param {Object} params - named parameters matching the function's signature
 * @returns {Promise<Array>} - PostgREST always returns RPC results as an array
 */
async function callRPC(fnName, params = {}) {
    return await apiFetch(`rpc/${fnName}`, 'POST', params);
}

async function insert(table, data) {
    const target = resolveTable(table, 'write');
    const rows = await apiFetch(target, 'POST', data);
    return Array.isArray(rows) ? rows[0] : rows;
}

/**
 * Insert multiple rows in a single request. Returns array of created records.
 */
async function insertMany(table, dataArray) {
    if (!dataArray || dataArray.length === 0) return [];
    const target = resolveTable(table, 'write');
    const rows = await apiFetch(target, 'POST', dataArray);
    return Array.isArray(rows) ? rows : [];
}

/**
 * Update a single row by primary key. Returns true on success.
 */
async function update(table, id, data) {
    await apiFetch(`${table}?id=eq.${id}`, 'PATCH', data);
    return true;
}

/**
 * Update rows matching an arbitrary filter string.
 * @param {string} table
 * @param {string} filterStr - e.g. 'student_id=eq.3'
 * @param {object} data      - fields to update
 */
async function updateWhere(table, filterStr, data) {
    await apiFetch(`${table}?${filterStr}`, 'PATCH', data);
    return true;
}

/**
 * Hard-delete a single row by primary key.
 * NEVER call this for students — use soft-delete (is_deleted=TRUE).
 */
async function remove(table, id) {
    await apiFetch(`${table}?id=eq.${id}`, 'DELETE');
    return true;
}

/**
 * Delete rows matching a filter string.
 */
async function removeWhere(table, filterStr) {
    await apiFetch(`${table}?${filterStr}`, 'DELETE');
    return true;
}

/**
 * UPSERT — insert or update on conflict.
 * Uses Supabase's resolution=merge-duplicates strategy.
 * Critical for marks saving: (assessment_id, student_id) unique constraint.
 * (Part 2.13, Part 5.3)
 */
async function upsert(table, data) {
    const target = resolveTable(table, 'write');
    const rows = await apiFetch(target, 'POST', data, {
        'Prefer': 'return=representation,resolution=merge-duplicates',
    });
    return Array.isArray(rows) ? rows[0] : rows;
}

/**
 * Upsert multiple rows at once.
 */
async function upsertMany(table, dataArray) {
    if (!dataArray || dataArray.length === 0) return [];
    const target = resolveTable(table, 'write');
    const rows = await apiFetch(target, 'POST', dataArray, {
        'Prefer': 'return=representation,resolution=merge-duplicates',
    });
    return Array.isArray(rows) ? rows : [];
}

/* ─────────────────────────────────────────────────────────────────
   SCHOOL SETTINGS HELPERS  (Part 3.5)
   ───────────────────────────────────────────────────────────────── */

let _settingsCache = null;
let _settingsCacheAt = 0;

/**
 * Load all school_settings rows as a { key: value } object.
 * Cached for SETTINGS_CACHE_TTL milliseconds.
 */
async function getSchoolSettings() {
    const now = Date.now();
    if (_settingsCache && (now - _settingsCacheAt) < APP_CONFIG.settingsCacheTTL) {
        return _settingsCache;
    }

    const rows = await getAll('school_settings');
    const map = {};
    if (Array.isArray(rows)) {
        rows.forEach(r => { map[r.key] = r.value; });
    }
    _settingsCache = map;
    _settingsCacheAt = now;
    return map;
}

/** Return a single setting value by key, with optional fallback. */
async function getSchoolSetting(key, fallback = null) {
    try {
        const settings = await getSchoolSettings();
        return settings[key] !== undefined ? settings[key] : fallback;
    } catch (e) {
        console.warn('[API] getSchoolSetting:', e.message);
        return fallback;
    }
}

/**
 * Insert or update a single school setting.
 * Flushes the settings cache so the next read is fresh.
 */
async function updateSchoolSetting(key, value) {
    const existing = await getAll('school_settings', { key });
    if (existing.length > 0) {
        await updateWhere('school_settings', `key=eq.${encodeURIComponent(key)}`, {
            value,
            updated_at: new Date().toISOString(),
        });
    } else {
        await insert('school_settings', {
            key,
            value,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        });
    }
    // Flush cache
    _settingsCache = null;
    _settingsCacheAt = 0;
}

/** Explicitly flush the settings cache (call after batch updates). */
function invalidateSettingsCache() {
    _settingsCache = null;
    _settingsCacheAt = 0;
}

/* ─────────────────────────────────────────────────────────────────
   RECEIPT NUMBER GENERATOR  (Part 5.6, Part 9)
   Format: RCP-YYYYMMDD-NNN (sequential per day)
   ───────────────────────────────────────────────────────────────── */

/**
 * Generate the next receipt number for today.
 * Queries the payments table to find the highest NNN suffix used
 * today, then increments it.
 *
 * @returns {Promise<string>} e.g. 'RCP-20260712-007'
 */
async function generateReceiptNumber() {
    const today = todayString().replace(/-/g, '');
    const prefix = `${RECEIPT_PREFIX}-${today}-`;

    const rows = await getAll('payments', `receipt_number=like.${prefix}%&order=receipt_number.desc&limit=1`).catch(() => []);

    let seq = 1;
    if (rows && rows.length > 0) {
        const last = rows[0].receipt_number || '';
        const parts = last.split('-');
        const lastSeq = parseInt(parts[parts.length - 1], 10);
        if (!isNaN(lastSeq)) seq = lastSeq + 1;
    }

    return `${prefix}${String(seq).padStart(3, '0')}`;
}

/* ─────────────────────────────────────────────────────────────────
   STUDENT CODE GENERATOR  (Part 5.4)
   Format: STU-YYYY-NNNN
   ───────────────────────────────────────────────────────────────── */

/**
 * Generate the next student code for the current enrollment year.
 * @param {number} [year] - Enrollment year (default: current year)
 * @returns {Promise<string>} e.g. 'STU-2026-0046'
 */
async function generateStudentCode(year) {
    const yr = year || new Date().getFullYear();
    const prefix = `${STUDENT_CODE_PREFIX}-${yr}-`;

    const rows = await getAll('students', `code=like.${prefix}%&order=code.desc&limit=1`).catch(() => []);

    let seq = 1;
    if (rows && rows.length > 0) {
        const last = rows[0].code || '';
        const parts = last.split('-');
        const lastN = parseInt(parts[parts.length - 1], 10);
        if (!isNaN(lastN)) seq = lastN + 1;
    }

    return `${prefix}${String(seq).padStart(4, '0')}`;
}

/* ─────────────────────────────────────────────────────────────────
   FAMILY CODE GENERATOR
   Format: FAM-NNN
   ───────────────────────────────────────────────────────────────── */

/**
 * Generate the next family code.
 * @returns {Promise<string>} e.g. 'FAM-042'
 */
async function generateFamilyCode() {
    const rows = await getAll('families', 'order=id.desc&limit=1').catch(() => []);

    let seq = 1;
    if (rows && rows.length > 0) {
        const last = rows[0].code || 'FAM-000';
        const parts = last.split('-');
        const lastN = parseInt(parts[parts.length - 1], 10);
        if (!isNaN(lastN)) seq = lastN + 1;
    }

    return `${FAMILY_CODE_PREFIX}-${String(seq).padStart(3, '0')}`;
}

/* ─────────────────────────────────────────────────────────────────
   MARKS BATCH SAVE  (Part 5.2, Part 5.3)
   Holiday-mode aware: writes to holiday_marks when appropriate.
   ───────────────────────────────────────────────────────────────── */

/**
 * Save an array of mark records using UPSERT on (assessment_id, student_id).
 * This is the ONLY function that should be used to save marks.
 * It enforces holiday routing and validates scores before sending.
 *
 * @param {Array<{assessment_id, student_id, score, is_absent, recorded_by}>} markRows
 * @returns {Promise<{saved: number, errors: string[]}>}
 */
async function saveMarcsBatch(markRows) {
    if (!markRows || markRows.length === 0) return { saved: 0, errors: [] };

    const errors = [];
    const toSave = [];
    const now = new Date().toISOString();

    markRows.forEach(row => {
        // Basic validation — more thorough validation is in validators.js
        if (row.is_absent) {
            toSave.push({ ...row, score: null, updated_at: now });
            return;
        }
        if (row.score === null || row.score === undefined || row.score === '') {
            return; // skip empty — do not save
        }
        const s = parseFloat(row.score);
        if (isNaN(s)) {
            errors.push(`Invalid score for student ${row.student_id}: "${row.score}"`);
            return;
        }
        toSave.push({ ...row, score: Math.round(s * 10) / 10, updated_at: now });
    });

    if (toSave.length === 0) {
        return { saved: 0, errors };
    }

    // resolveTable handles holiday routing for 'marks'
    const target = resolveTable('marks', 'write');
    await apiFetch(target, 'POST', toSave, {
        'Prefer': 'return=representation,resolution=merge-duplicates',
    });

    return { saved: toSave.length, errors };
}

// Alias for backwards compatibility with existing index.html calls
const saveMarksBatch = saveMarcsBatch;

/* ─────────────────────────────────────────────────────────────────
   PAYMENT FIFO ALLOCATION  (Part 5.6)
   ───────────────────────────────────────────────────────────────── */

/**
 * Allocate a payment amount across a student's unpaid fees using FIFO.
 * Inserts payment_allocations rows, updates student_fees.paid_amount,
 * and applies any remainder to student_credit_balance.
 *
 * @param {number} paymentId  - id of the payments row just inserted
 * @param {number} studentId  - student whose fees to allocate against
 * @param {number} amount     - total payment amount in RWF
 * @returns {Promise<{allocated: number, credit: number}>}
 */
async function allocatePaymentFIFO(paymentId, studentId, amount) {
    // Get all unpaid fees ordered by creation date (FIFO)
    const unpaidFees = await getAll('student_fees',
        `student_id=eq.${studentId}&is_paid=is.false&is_waived=is.false&order=created_at.asc`
    );

    let remaining = amount;
    let totalAlloc = 0;
    const now = new Date().toISOString();

    for (const fee of unpaidFees) {
        if (remaining <= 0) break;

        const owed = parseFloat(fee.amount) - parseFloat(fee.paid_amount || 0);
        if (owed <= 0) continue;

        const alloc = Math.min(remaining, owed);
        const newPaid = parseFloat(fee.paid_amount || 0) + alloc;
        const isPaid = newPaid >= parseFloat(fee.amount);

        // Insert allocation record
        await insert('payment_allocations', {
            payment_id: paymentId,
            student_fee_id: fee.id,
            amount: alloc,
            created_at: now,
        });

        // Update the fee row
        await update('student_fees', fee.id, {
            paid_amount: newPaid,
            is_paid: isPaid,
            updated_at: now,
        });

        remaining -= alloc;
        totalAlloc += alloc;
    }

    // Any remaining amount goes to credit balance
    let creditAdded = 0;
    if (remaining > 0) {
        const existingRows = await getAll('student_credit_balance',
            `student_id=eq.${studentId}&limit=1`
        );
        if (existingRows.length > 0) {
            const newCredit = parseFloat(existingRows[0].credit_amount || 0) + remaining;
            await update('student_credit_balance', existingRows[0].id, {
                credit_amount: newCredit,
                updated_at: now,
            });
        } else {
            await insert('student_credit_balance', {
                student_id: studentId,
                credit_amount: remaining,
                updated_at: now,
            });
        }
        creditAdded = remaining;
    }

    return { allocated: totalAlloc, credit: creditAdded };
}

/* ─────────────────────────────────────────────────────────────────
   SELECTIVE TABLE REFRESH  (Part 7.3)
   After a write operation, refresh only the affected table in state
   rather than reloading everything via loadInitialData().
   ───────────────────────────────────────────────────────────────── */

const REFRESH_MAP = {
    students: async () => { state.students = await getAll('students', { is_deleted: false }); },
    teachers: async () => { state.teachers = await getAll('teachers'); },
    classes: async () => { state.classes = (await getAll('classes')).sort((a, b) => (a.sort_order || 99) - (b.sort_order || 99)); },
    subjects: async () => { state.subjects = (await getAll('subjects')).sort((a, b) => (a.sort_order || 99) - (b.sort_order || 99)); },
    terms: async () => { state.terms = await getAll('terms'); },
    academic_years: async () => { state.academicYears = await getAll('academic_years'); },
    holidays: async () => { state.holidays = await getAll('holidays', { academic_year_id: getActiveYearId() }); },
    assessments: async () => { state.assessments = await getAll('assessments'); },
    marks: async () => { state.marks = await getAllRecords('marks'); },
    fee_categories: async () => { state.feeCategories = await getAll('fee_categories'); },
    fee_amounts: async () => { state.feeAmounts = await getAll('fee_amounts'); },
    student_fees: async () => { state.studentFees = await getAllRecords('student_fees'); },
    student_credit_balance: async () => { state.creditBalances = await getAll('student_credit_balance'); },
    payments: async () => { state.payments = await getAllRecords('payments'); },
    payment_allocations: async () => { state.paymentAllocations = await getAllRecords('payment_allocations'); },
    families: async () => { state.families = await getAll('families'); },
    timetable_slots: async () => { state.timetableSlots = await getAll('timetable_slots'); },
    announcements: async () => { state.announcements = await getAll('announcements'); },
    notifications: async () => { state.notifications = await getAll('notifications', { recipient_id: state.currentUser?.id }); },
    grading_scale: async () => { state.gradingScale = await getAll('grading_scale'); },
    school_settings: async () => { state.schoolSettings = await getSchoolSettings(); },
    // Holiday tables
    holiday_marks: async () => { state.holidayMarks = await getAllRecords('holiday_marks'); },
    holiday_fees: async () => { state.holidayFees = await getAllRecords('holiday_fees'); },
    holiday_enrollments: async () => { state.holidayEnrollments = await getAll('holiday_enrollments'); },
    holiday_subjects: async () => { state.holidaySubjects = await getAll('holiday_subjects'); },
};

/**
 * Refresh a single table in state after a mutation.
 * Invalidates cache after loading.
 *
 * @param {string} table - DB table name or logical alias
 */
async function refreshTable(table) {
    if (REFRESH_MAP[table]) {
        await REFRESH_MAP[table]();
        invalidateCache();
    } else {
        console.warn(`[API] refreshTable: no refresh map entry for "${table}"`);
    }
}

/**
 * Refresh multiple tables in parallel.
 * @param {string[]} tables
 */
async function refreshTables(tables) {
    await Promise.all(tables.map(t => refreshTable(t).catch(e =>
        console.warn(`[API] refreshTables: failed for "${t}":`, e.message)
    )));
}

/* ─────────────────────────────────────────────────────────────────
   ENSURE STATE LOADED
   Called at the top of any module that needs data, as a safety net
   in case the module was deep-linked or hot-navigated to.
   ───────────────────────────────────────────────────────────────── */

/**
 * Ensure the most critical tables are loaded.
 * Only loads tables that are currently empty in state.
 */
async function ensureStateLoaded() {
    const loaders = [];

    if (!state.classes.length)
        loaders.push(getAll('classes').then(d => {
            state.classes = d.sort((a, b) => (a.sort_order || 99) - (b.sort_order || 99));
        }));

    if (!state.subjects.length)
        loaders.push(getAll('subjects').then(d => {
            state.subjects = d.sort((a, b) => (a.sort_order || 99) - (b.sort_order || 99));
        }));

    if (!state.terms.length)
        loaders.push(getAll('terms').then(d => { state.terms = d; }));

    if (!state.academicYears.length)
        loaders.push(getAll('academic_years').then(d => { state.academicYears = d; }));

    if (!state.students.length)
        loaders.push(getAll('students', { is_deleted: false }).then(d => { state.students = d; }));

    if (!state.teachers.length)
        loaders.push(getAll('teachers').then(d => { state.teachers = d; }));

    if (!state.families.length)
        loaders.push(getAll('families').then(d => { state.families = d || []; }).catch(() => { }));

    if (!Object.keys(state.schoolSettings).length)
        loaders.push(getSchoolSettings().then(s => { state.schoolSettings = s; }));

    if (loaders.length > 0) {
        await Promise.all(loaders).catch(e => console.warn('[API] ensureStateLoaded:', e.message));
    }
}

/* ─────────────────────────────────────────────────────────────────
   RAW API REQUEST  (legacy alias used by older code in index.html)
   ───────────────────────────────────────────────────────────────── */

/**
 * Low-level wrapper that returns { success, data, error } shape.
 * Kept for backwards compatibility with any module that still uses
 * the apiRequest() pattern from the original index.html.
 */
async function apiRequest(path, method = 'GET', body = null) {
    try {
        const data = await apiFetch(path, method, body);
        return { success: true, data };
    } catch (e) {
        return { success: false, error: e.message, data: [] };
    }
}

// Alias: some modules call api() directly
const api = apiFetch;

/* ─────────────────────────────────────────────────────────────────
   EXPOSE
   ───────────────────────────────────────────────────────────────── */

window.api = api;
window.apiFetch = apiFetch;
window.apiRequest = apiRequest;
window.getAll = getAll;
window.getAllRecords = getAllRecords;
window.getById = getById;
window.getWhere = getWhere;
window.getCount = getCount;
window.insert = insert;
window.callRPC = callRPC;
window.insertMany = insertMany;
window.update = update;
window.updateWhere = updateWhere;
window.remove = remove;
window.removeWhere = removeWhere;
window.upsert = upsert;
window.upsertMany = upsertMany;
window.getSchoolSettings = getSchoolSettings;
window.getSchoolSetting = getSchoolSetting;
window.updateSchoolSetting = updateSchoolSetting;
window.invalidateSettingsCache = invalidateSettingsCache;
window.generateReceiptNumber = generateReceiptNumber;
window.generateStudentCode = generateStudentCode;
window.generateFamilyCode = generateFamilyCode;
window.saveMarcsBatch = saveMarcsBatch;
window.saveMarksBatch = saveMarksBatch;
window.allocatePaymentFIFO = allocatePaymentFIFO;
window.refreshTable = refreshTable;
window.refreshTables = refreshTables;
window.ensureStateLoaded = ensureStateLoaded;
window.resolveTable = resolveTable;