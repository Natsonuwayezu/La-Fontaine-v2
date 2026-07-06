/**
 * ECOLE LA FONTAINE — Supabase API Wrappers
 * All database operations go through this file
 * Last updated: 2026-07-03
 * 
 * CHANGES:
 * - Added academic_year_id filtering support
 * - Added getYearData() helper
 * - Added archiveMarksForYear() helper
 * - Added getPromotionHistory() helper
 */

import { SUPABASE_URL, SUPABASE_KEY } from '../config/supabase-config.js';

// ──────────────────────────────────────────────────────────────────────
// REQUEST HEADERS
// ──────────────────────────────────────────────────────────────────────

function apiHeaders() {
    return {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation',
    };
}

// ──────────────────────────────────────────────────────────────────────
// CORE HTTP WRAPPER
// ──────────────────────────────────────────────────────────────────────

/**
 * Low-level fetch wrapper for Supabase REST API
 * @param {string} path - API path (table + query string)
 * @param {string} method - HTTP method
 * @param {object} body - Request body (for POST/PATCH)
 * @param {boolean} returnHeaders - Whether to return headers
 * @param {object} extraHeaders - Additional headers
 * @returns {Promise<{success, data, error, headers?}>}
 */
export async function apiRequest(path, method = 'GET', body = null, returnHeaders = false, extraHeaders = {}) {
    try {
        const headers = { ...apiHeaders(), ...extraHeaders };
        const opts = { method, headers };
        if (body) opts.body = JSON.stringify(body);

        // Add default limit for GET requests if not specified
        if (method === 'GET' && !path.includes('limit=')) {
            path += (path.includes('?') ? '&' : '?') + 'limit=50000';
        }

        const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, opts);

        if (res.status === 204) {
            return { success: true, data: [], headers: res.headers };
        }

        const data = await res.json();

        if (!res.ok) {
            const msg = data?.message || data?.hint || `HTTP ${res.status}`;
            console.error('[API]', method, path, 'failed:', msg);

            // Fallback for missing term_number column in terms table
            if (method === 'GET' && path.includes('order=term_number') && msg.includes('term_number')) {
                const fallbackPath = path.replace(/order=term_number\.(asc|desc)/, 'order=name.$1');
                console.warn('[API] Falling back from term_number ordering to name ordering:', fallbackPath);
                return apiRequest(fallbackPath, method, body, returnHeaders, extraHeaders);
            }

            return { success: false, error: msg, data: [] };
        }

        if (returnHeaders) {
            return { success: true, data: Array.isArray(data) ? data : [data], headers: res.headers };
        }
        return { success: true, data: Array.isArray(data) ? data : [data] };

    } catch (err) {
        if (err.message?.includes('Failed to fetch')) {
            console.warn('[API] Network error — check internet connection');
            return { success: false, error: 'Network error — please check your connection', data: [] };
        }
        console.error('[API]', err);
        return { success: false, error: err.message, data: [] };
    }
}

// ──────────────────────────────────────────────────────────────────────
// READ OPERATIONS
// ──────────────────────────────────────────────────────────────────────

/**
 * Get all records from a table (auto-paginated)
 * @param {string} table - Table name
 * @param {string} filter - Filter string (e.g., 'status=eq.active')
 * @param {number} batchSize - Page size
 * @returns {Promise<Array>} Records
 */
export async function getAllRecords(table, filter = '', batchSize = 1000) {
    console.log(`📥 Fetching all from: ${table} (filter: ${filter?.substring(0, 50) || 'none'}...)`);

    let allRecords = [];
    let page = 0;
    let totalFetched = 0;

    while (true) {
        const offset = page * batchSize;
        const params = filter + (filter ? '&' : '') + `limit=${batchSize}&offset=${offset}`;
        const result = await apiRequest(table + '?' + params, 'GET');

        if (!result.success || !result.data.length) break;

        allRecords = allRecords.concat(result.data);
        totalFetched += result.data.length;
        page++;

        if (result.data.length < batchSize) break;
        if (page > 50) break;  // Safety limit: 50,000 records
    }

    console.log(`✅ Completed ${table}: ${totalFetched} records`);
    return allRecords;
}

/**
 * Get records with filters — SUPPORTS ACADEMIC YEAR FILTERING
 * @param {string} table - Table name
 * @param {object|string} filters - Filter object or query string
 * @returns {Promise<Array>} Records
 */
export async function get(table, filters = {}) {
    let q = '';

    if (typeof filters === 'string') {
        q = filters;
    } else if (filters && typeof filters === 'object') {
        const parts = [];
        for (const [k, v] of Object.entries(filters)) {
            if (k === 'order') {
                parts.push(`order=${encodeURIComponent(v)}`);
            } else if (k === 'limit') {
                if (v && v !== 'all') parts.push(`limit=${encodeURIComponent(v)}`);
            } else if (k === 'academic_year_id' && v) {
                parts.push(`academic_year_id=eq.${encodeURIComponent(v)}`);
            } else if (k === 'is_archived' && v !== undefined) {
                parts.push(`is_archived=eq.${encodeURIComponent(v)}`);
            } else if (v !== null && v !== undefined && v !== '') {
                parts.push(`${k}=eq.${encodeURIComponent(v)}`);
            }
        }
        q = parts.join('&');
    }

    // For large tables, use paginated get
    const largeTables = ['marks', 'assessments', 'payments', 'student_fees', 'attendance'];
    if (largeTables.includes(table) && !q.includes('limit=')) {
        return getAllRecords(table, q);
    }

    if (!q.includes('limit=')) {
        q += (q ? '&' : '') + 'limit=50000';
    }

    const result = await apiRequest(`${table}?${q}`, 'GET');
    let data = result.success ? result.data : [];

    // Normalize terms: if `term_number` column is missing in the live schema,
    // derive it from the `name` (e.g. "Term 1") or fallback to the array index.
    if (table === 'terms' && Array.isArray(data)) {
        data = data.map((r, idx) => {
            if (r.term_number === undefined || r.term_number === null) {
                const m = (r.name || '').match(/(\d+)/);
                const inferred = m ? parseInt(m[1], 10) : (idx + 1);
                return { ...r, term_number: inferred };
            }
            return r;
        });
    }

    return data;
}

/**
 * Get a single record by ID
 * @param {string} table - Table name
 * @param {number|string} id - Record ID
 * @returns {Promise<object|null>} Record or null
 */
export async function getById(table, id) {
    const result = await apiRequest(`${table}?id=eq.${id}`, 'GET');
    return result.success && result.data.length > 0 ? result.data[0] : null;
}

/**
 * Get record count with optional filters
 * @param {string} table - Table name
 * @param {string} filters - Filter string
 * @returns {Promise<number>} Record count
 */
export async function getCount(table, filters = '') {
    const result = await apiRequest(`${table}?select=id&${filters}&limit=0`, 'GET', null, true);
    if (result.headers) {
        const range = result.headers.get('Content-Range');
        if (range) {
            const match = range.match(/\/(\d+)$/);
            if (match) return parseInt(match[1]);
        }
    }
    // Fallback: fetch all ids (lightweight)
    const data = await get(table, `select=id&${filters}&limit=50000`);
    return data.length;
}

// ──────────────────────────────────────────────────────────────────────
// WRITE OPERATIONS
// ──────────────────────────────────────────────────────────────────────

/**
 * Insert a single record
 * @param {string} table - Table name
 * @param {object} data - Record data
 * @returns {Promise<object|null>} Created record
 */
export async function insert(table, data) {
    let result = await apiRequest(table, 'POST', data);
    if (!result.success && typeof result.error === 'string' && result.error.includes('null value in column "id"')) {
        console.warn('[API] Insert failed with null id; retrying with explicit id for table:', table);
        const existing = await get(table, 'select=id&order=id.desc&limit=1').catch(() => []);
        const nextId = (existing[0]?.id || 0) + 1;
        const retryData = { id: nextId, ...data };
        result = await apiRequest(table, 'POST', retryData);
    }
    return result.success ? (Array.isArray(result.data) ? result.data[0] : result.data) : null;
}

/**
 * Insert multiple records
 * @param {string} table - Table name
 * @param {Array} data - Array of records
 * @returns {Promise<Array>} Created records
 */
export async function insertBatch(table, data) {
    if (!data?.length) return [];
    const result = await apiRequest(table, 'POST', data);
    return result.success ? result.data : [];
}

/**
 * Update a record by ID
 * @param {string} table - Table name
 * @param {number|string} id - Record ID
 * @param {object} data - Update data
 * @returns {Promise<boolean>} Success
 */
export async function update(table, id, data) {
    const result = await apiRequest(`${table}?id=eq.${id}`, 'PATCH', data);
    return result.success;
}

/**
 * Update records matching a filter
 * @param {string} table - Table name
 * @param {string} filterStr - Filter string (e.g., 'student_id=eq.3')
 * @param {object} data - Update data
 * @returns {Promise<boolean>} Success
 */
export async function updateWhere(table, filterStr, data) {
    const result = await apiRequest(`${table}?${filterStr}`, 'PATCH', data);
    return result.success;
}

/**
 * Delete a record by ID
 * @param {string} table - Table name
 * @param {number|string} id - Record ID
 * @returns {Promise<boolean>} Success
 */
export async function remove(table, id) {
    const result = await apiRequest(`${table}?id=eq.${id}`, 'DELETE');
    return result.success;
}

/**
 * Delete records matching a filter
 * @param {string} table - Table name
 * @param {string} filterStr - Filter string (e.g., 'student_id=eq.3')
 * @returns {Promise<boolean>} Success
 */
export async function removeWhere(table, filterStr) {
    const result = await apiRequest(`${table}?${filterStr}`, 'DELETE');
    return result.success;
}

// ──────────────────────────────────────────────────────────────────────
// UPSERT (insert or update)
// ──────────────────────────────────────────────────────────────────────

/**
 * Upsert a record (insert or update on conflict)
 * @param {string} table - Table name
 * @param {object} data - Record data
 * @param {string} conflictKey - Conflict column
 * @returns {Promise<object|null>} Record
 */
export async function upsert(table, data, conflictKey = 'id') {
    const result = await apiRequest(table, 'POST', data, false, {
        'Prefer': 'return=representation, resolution=merge-duplicates',
        'Prefer-Conflict': `${conflictKey}=eq.${data[conflictKey]}`,
    });
    return result.success ? (Array.isArray(result.data) ? result.data[0] : result.data) : null;
}

// ──────────────────────────────────────────────────────────────────────
// YEAR-SPECIFIC DATA HELPERS
// ──────────────────────────────────────────────────────────────────────

/**
 * Get data for a specific academic year
 * @param {string} table - Table name (students, marks, assessments)
 * @param {number} yearId - Academic year ID
 * @param {object} extraFilters - Additional filters
 * @returns {Promise<Array>} Records
 */
export async function getYearData(table, yearId, extraFilters = {}) {
    const filters = { academic_year_id: yearId, ...extraFilters };
    return await get(table, filters);
}

/**
 * Get current year data (uses active academic year)
 * @param {string} table - Table name
 * @param {object} extraFilters - Additional filters
 * @returns {Promise<Array>} Records
 */
export async function getCurrentYearData(table, extraFilters = {}) {
    // Get active academic year from school_settings or state
    let yearId = null;
    try {
        const settings = await getSchoolSettings();
        yearId = settings.active_academic_year_id;
    } catch (e) {
        // Fallback: get from academic_years table
        const years = await get('academic_years', { is_active: true });
        yearId = years[0]?.id;
    }
    if (!yearId) return [];
    return await getYearData(table, yearId, extraFilters);
}

/**
 * Get marks for a specific year (including archived)
 * @param {number} studentId - Student ID
 * @param {number} yearId - Academic year ID
 * @param {boolean} includeArchived - Include archived marks
 * @returns {Promise<Array>} Marks
 */
export async function getStudentMarksByYear(studentId, yearId, includeArchived = false) {
    const filters = {
        student_id: studentId,
        academic_year_id: yearId
    };
    if (!includeArchived) {
        filters.is_archived = false;
    }
    return await get('marks', filters);
}

/**
 * Archive marks for a student for a specific year
 * @param {number} studentId - Student ID
 * @param {number} yearId - Academic year ID
 * @param {number} userId - User ID archiving
 * @returns {Promise<{archived: number, errors: number}>}
 */
export async function archiveStudentMarksForYear(studentId, yearId, userId = null) {
    const marks = await get('marks', {
        student_id: studentId,
        academic_year_id: yearId,
        is_archived: false
    });

    let archived = 0;
    let errors = 0;

    for (const mark of marks) {
        // Copy to archive table
        const archivedMark = await insert('marks_archive', {
            original_mark_id: mark.id,
            student_id: mark.student_id,
            assessment_id: mark.assessment_id,
            score: mark.score,
            academic_year_id: mark.academic_year_id,
            term_id: mark.term_id,
            archived_at: new Date().toISOString(),
            archived_by: userId
        });

        if (archivedMark) {
            // Mark as archived in original table
            await update('marks', mark.id, {
                is_archived: true,
                archived_at: new Date().toISOString(),
                archived_to: yearId
            });
            archived++;
        } else {
            errors++;
        }
    }

    return { archived, errors };
}

// ──────────────────────────────────────────────────────────────────────
// PROMOTION HELPERS
// ──────────────────────────────────────────────────────────────────────

/**
 * Get promotion history for a student
 * @param {number} studentId - Student ID
 * @returns {Promise<Array>} Promotion records
 */
export async function getStudentPromotionHistory(studentId) {
    const records = await get('student_promotion_records', {
        student_id: studentId,
        order: 'created_at.desc'
    });

    // Enrich with batch details
    const enriched = [];
    for (const record of records) {
        const batch = await getById('student_promotions', record.promotion_id);
        const fromYear = await getById('academic_years', record.from_academic_year_id);
        const toYear = await getById('academic_years', record.to_academic_year_id);
        const fromClass = await getById('classes', record.from_class_id);
        const toClass = await getById('classes', record.to_class_id);

        enriched.push({
            ...record,
            batch: batch,
            from_year: fromYear,
            to_year: toYear,
            from_class: fromClass,
            to_class: toClass
        });
    }

    return enriched;
}

/**
 * Get all promotions for a batch
 * @param {number} batchId - Promotion batch ID
 * @returns {Promise<Array>} Promotion records with student details
 */
export async function getBatchPromotionDetails(batchId) {
    const records = await get('student_promotion_records', {
        promotion_id: batchId
    });

    const enriched = [];
    for (const record of records) {
        const student = await getById('students', record.student_id);
        enriched.push({
            ...record,
            student: student
        });
    }

    return enriched;
}

/**
 * Get class history for a student across years
 * @param {number} studentId - Student ID
 * @returns {Promise<Array>} Class history records
 */
export async function getStudentClassHistory(studentId) {
    return await get('student_class_history', {
        student_id: studentId,
        order: 'academic_year_id.desc'
    });
}

// ──────────────────────────────────────────────────────────────────────
// SCHOOL SETTINGS HELPERS
// ──────────────────────────────────────────────────────────────────────

let _settingsCache = null;
let _settingsCacheTime = 0;
const SETTINGS_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Get all school settings as a key-value map
 * @returns {Promise<object>} Settings map
 */
export async function getSchoolSettings() {
    const now = Date.now();
    if (_settingsCache && (now - _settingsCacheTime) < SETTINGS_CACHE_TTL) {
        return _settingsCache;
    }
    const rows = await get('school_settings');
    const settings = {};
    rows.forEach(r => { settings[r.key] = r.value; });
    _settingsCache = settings;
    _settingsCacheTime = now;
    return settings;
}

/**
 * Get a single setting value
 * @param {string} key - Setting key
 * @param {any} defaultVal - Default value if not found
 * @returns {Promise<any>} Setting value
 */
export async function getSchoolSetting(key, defaultVal = null) {
    try {
        const settings = await getSchoolSettings();
        return settings[key] !== undefined ? settings[key] : defaultVal;
    } catch (e) {
        console.warn('[getSchoolSetting]', e.message);
        return defaultVal;
    }
}

/**
 * Update a school setting
 * @param {string} key - Setting key
 * @param {any} value - New value
 * @returns {Promise<boolean>} Success
 */
export async function updateSchoolSetting(key, value) {
    const existing = await get('school_settings', { key });
    let result;
    if (existing.length > 0) {
        result = await updateWhere('school_settings', `key=eq.${key}`, {
            value: String(value),
        });
    } else {
        result = await insert('school_settings', {
            key: key,
            value: String(value),
        });
    }
    invalidateSettingsCache();
    return result;
}

/**
 * Invalidate the settings cache
 */
export function invalidateSettingsCache() {
    _settingsCache = null;
    _settingsCacheTime = 0;
}

// ──────────────────────────────────────────────────────────────────────
// ACTIVITY LOGGING
// ──────────────────────────────────────────────────────────────────────

/**
 * Log an activity to the activity_logs table
 * @param {number} userId - User ID
 * @param {string} userRole - User role
 * @param {string} action - Action description
 * @param {string} entityType - Entity type (e.g., 'student', 'payment')
 * @param {number} entityId - Entity ID
 * @param {object} details - Additional details
 * @returns {Promise<void>}
 */
export async function logActivity(userId, userRole, action, entityType = null, entityId = null, details = null) {
    try {
        await insert('activity_logs', {
            user_id: userId,
            user_role: userRole,
            action: action,
            entity_type: entityType,
            entity_id: entityId,
            details: details ? JSON.stringify(details) : null,
            created_at: new Date().toISOString(),
        });
    } catch (e) {
        console.warn('Failed to log activity:', e);
    }
}
// ──────────────────────────────────────────────────────────────────────
// COMPATIBILITY ALIASES (modules import these names)
// ──────────────────────────────────────────────────────────────────────

/** Alias for getAllRecords — used by most modules */
export const getAll = getAllRecords;

/** Re-fetch a table and update state — modules call this after mutations */
export async function refreshTable(tableName) {
    const state = window.state || {};
    const loadInitialData = window.loadInitialData || (async () => { });
    try {
        const data = await getAll(tableName);
        const keyMap = {
            marks: 'marks', assessments: 'assessments', students: 'students',
            teachers: 'teachers', classes: 'classes', subjects: 'subjects',
            terms: 'terms', academic_years: 'academicYears', payments: 'payments',
            student_fees: 'studentFees', fee_categories: 'feeCategories',
            fee_amounts: 'feeAmounts', families: 'families', attendance: 'attendance',
            teacher_assignments: 'teacherAssignments', grading_scale: 'gradingScale',
            school_settings: 'schoolSettings', notifications: 'notifications',
            reminders: 'reminders', holidays: 'holidays', discounts: 'discounts',
            announcements: 'announcements', activity_logs: 'activityLogs',
        };
        const stateKey = keyMap[tableName] || tableName;
        if (stateKey in state) state[stateKey] = data;
        return data;
    } catch (e) {
        console.warn('[refreshTable] failed for', tableName, e);
        return [];
    }
}
