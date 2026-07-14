/* ═══════════════════════════════════════════════════════════════════
   js/core/logger.js
   ═══════════════════════════════════════════════════════════════════
   Purpose : Write audit trail entries to the system_logs table.
             Every meaningful user action (logins, data changes,
             exports, setting updates) must call logAction().
             Failures are silent — a log write must never crash the UI.
   References: backend.txt Part 2.21 (system_logs table), Part 5.12
   Load order: AFTER api.js and state.js.
   ═══════════════════════════════════════════════════════════════════ */

'use strict';

/* ─────────────────────────────────────────────────────────────────
   LOG QUEUE
   When the app is offline, log entries are queued in memory and
   flushed to the DB once connectivity is restored.
   ───────────────────────────────────────────────────────────────── */

const _logQueue = [];
let _logFlushing = false;

/* ─────────────────────────────────────────────────────────────────
   CORE LOG FUNCTION
   ───────────────────────────────────────────────────────────────── */

/**
 * Write one audit entry to system_logs.
 * Always silent on failure — logging must never interrupt the user.
 *
 * @param {string}  action       - one of LOG_ACTIONS constants
 * @param {string}  [entityType] - DB table affected (e.g. 'students')
 * @param {number}  [entityId]   - primary key of the affected row
 * @param {Object}  [details]    - any extra data (stored as JSONB)
 * @param {string}  [level]      - 'info' | 'warning' | 'error' (default 'info')
 */
async function logAction(action, entityType = null, entityId = null, details = {}, level = 'info') {
    try {
        const user = state.currentUser;
        const now = new Date().toISOString();

        const entry = {
            action: String(action),
            entity_type: entityType || null,
            entity_id: entityId || null,
            performed_by: user?.id || null,
            performed_by_name: user ? `${user.first_name || ''} ${user.last_name || ''}`.trim() : 'System',
            role: user?.role || null,
            details: details && Object.keys(details).length > 0 ? details : null,
            level: level,
            holiday_mode: isHolidayMode(),
            created_at: now,
        };

        // If offline, queue for later
        if (state.offline) {
            _logQueue.push(entry);
            return;
        }

        await insert('system_logs', entry);

    } catch (err) {
        // Never propagate — silently queue if DB is unreachable
        _logQueue.push({
            action,
            entity_type: entityType,
            entity_id: entityId,
            performed_by: state.currentUser?.id || null,
            details,
            level,
            created_at: new Date().toISOString(),
        });
        // Don't console.error here — would clutter offline use
    }
}

/* ─────────────────────────────────────────────────────────────────
   CONVENIENCE WRAPPERS
   ───────────────────────────────────────────────────────────────── */

/** Log a successful login event. */
async function logLogin(userId, role) {
    await logAction(LOG_ACTIONS.LOGIN, 'teachers', userId, {
        role,
        timestamp: new Date().toISOString(),
        userAgent: navigator.userAgent.substring(0, 200),
    });
}

/** Log a logout event. */
async function logLogout(userId) {
    await logAction(LOG_ACTIONS.LOGOUT, 'teachers', userId, {
        timestamp: new Date().toISOString(),
    });
}

/** Log a student creation. */
async function logCreateStudent(studentId, studentName) {
    await logAction(LOG_ACTIONS.CREATE_STUDENT, 'students', studentId, {
        name: studentName,
    });
}

/** Log a student update. */
async function logUpdateStudent(studentId, changes) {
    await logAction(LOG_ACTIONS.UPDATE_STUDENT, 'students', studentId, {
        changes: _sanitizeLogDetails(changes),
    });
}

/** Log a student archive (soft delete). */
async function logArchiveStudent(studentId, studentName, reason) {
    await logAction(LOG_ACTIONS.ARCHIVE_STUDENT, 'students', studentId, {
        name: studentName,
        reason: reason || null,
    });
}

/** Log a batch promotion. */
async function logBatchPromotion(classId, className, count) {
    await logAction(LOG_ACTIONS.PROMOTE_BATCH, 'classes', classId, {
        class_name: className,
        count,
    });
}

/** Log a marks save operation. */
async function logSaveMarks(assessmentId, savedCount, errors = []) {
    await logAction(LOG_ACTIONS.SAVE_MARKS, 'marks', assessmentId, {
        saved_count: savedCount,
        error_count: errors.length,
        holiday_mode: isHolidayMode(),
    });
}

/** Log an assessment lock. */
async function logLockAssessment(assessmentId, assessmentName) {
    await logAction(LOG_ACTIONS.LOCK_ASSESSMENT, 'assessments', assessmentId, {
        name: assessmentName,
    });
}

/** Log an assessment unlock. */
async function logUnlockAssessment(assessmentId, assessmentName) {
    await logAction(LOG_ACTIONS.UNLOCK_ASSESSMENT, 'assessments', assessmentId, {
        name: assessmentName,
    });
}

/** Log a payment creation. */
async function logCreatePayment(paymentId, studentId, amount, method) {
    await logAction(LOG_ACTIONS.CREATE_PAYMENT, 'payments', paymentId, {
        student_id: studentId,
        amount,
        method,
        holiday_mode: isHolidayMode(),
    });
}

/** Log a payment reversal. */
async function logReversePayment(paymentId, studentId, amount, reason) {
    await logAction(LOG_ACTIONS.REVERSE_PAYMENT, 'payments', paymentId, {
        student_id: studentId,
        amount,
        reason,
    }, 'warning');
}

/** Log a waiver creation. */
async function logWaiveFee(feeId, studentId, waiverType, amount, reason) {
    await logAction(LOG_ACTIONS.WAIVE_FEE, 'student_fees', feeId, {
        student_id: studentId,
        waiver_type: waiverType,
        amount,
        reason,
    });
}

/** Log a teacher creation. */
async function logCreateTeacher(teacherId, teacherName, role) {
    await logAction(LOG_ACTIONS.CREATE_TEACHER, 'teachers', teacherId, {
        name: teacherName,
        role,
    });
}

/** Log a teacher update. */
async function logUpdateTeacher(teacherId, changes) {
    await logAction(LOG_ACTIONS.UPDATE_TEACHER, 'teachers', teacherId, {
        changes: _sanitizeLogDetails(changes),
    });
}

/** Log a settings update. */
async function logUpdateSettings(settingsKey, oldValue, newValue) {
    await logAction(LOG_ACTIONS.UPDATE_SETTINGS, 'school_settings', null, {
        key: settingsKey,
        old_value: _truncateLogValue(oldValue),
        new_value: _truncateLogValue(newValue),
    });
}

/** Log a grading scale update. */
async function logUpdateGrading() {
    await logAction(LOG_ACTIONS.UPDATE_GRADING, 'grading_scale', null, {
        timestamp: new Date().toISOString(),
    });
}

/** Log a backup. */
async function logBackup(tableCount, fileSize) {
    await logAction(LOG_ACTIONS.BACKUP, null, null, {
        table_count: tableCount,
        file_size_kb: fileSize,
        timestamp: new Date().toISOString(),
    });
}

/** Log a restore. */
async function logRestore(tableCount) {
    await logAction(LOG_ACTIONS.RESTORE, null, null, {
        table_count: tableCount,
        timestamp: new Date().toISOString(),
    }, 'warning');
}

/** Log a timetable update. */
async function logUpdateTimetable(classId, className) {
    await logAction(LOG_ACTIONS.UPDATE_TIMETABLE, 'timetable_slots', null, {
        class_id: classId,
        class_name: className,
    });
}

/** Log an announcement creation. */
async function logCreateAnnouncement(announcementId, title) {
    await logAction(LOG_ACTIONS.CREATE_ANNOUNCEMENT, 'announcements', announcementId, {
        title: _truncateLogValue(title, 80),
    });
}

/* ─────────────────────────────────────────────────────────────────
   ERROR LOGGING
   ───────────────────────────────────────────────────────────────── */

/**
 * Log an application error to system_logs.
 * Called by error-handler.js on unhandled errors.
 *
 * @param {Error|string} err
 * @param {string}       [context]  - e.g. 'marks-entry:saveMark'
 */
async function logError(err, context = '') {
    const message = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? (err.stack || '').substring(0, 500) : '';

    await logAction('APP_ERROR', null, null, {
        message,
        stack: stack || undefined,
        context: context || undefined,
        url: window.location.pathname,
    }, 'error');
}

/* ─────────────────────────────────────────────────────────────────
   LOG QUEUE FLUSH
   Called by sync-engine.js when connectivity is restored.
   ───────────────────────────────────────────────────────────────── */

/**
 * Flush any queued log entries to the DB.
 * Called automatically when the app comes back online.
 */
async function flushLogQueue() {
    if (_logFlushing || _logQueue.length === 0) return;
    _logFlushing = true;

    const toFlush = [..._logQueue];
    _logQueue.length = 0; // Clear queue optimistically

    try {
        // Insert all queued entries
        for (const entry of toFlush) {
            await insert('system_logs', entry).catch(() => {
                // If individual insert fails, re-queue
                _logQueue.push(entry);
            });
        }
        if (toFlush.length > 0) {
            console.info(`[Logger] Flushed ${toFlush.length} queued log entries.`);
        }
    } finally {
        _logFlushing = false;
    }
}

/* ─────────────────────────────────────────────────────────────────
   LOAD SYSTEM LOGS FOR DISPLAY
   ───────────────────────────────────────────────────────────────── */

/**
 * Load system_logs from the DB for the admin's log viewer.
 * Supports filtering by action, entity_type, date range, and user.
 *
 * @param {Object} filters
 * @param {number} [limit]
 * @param {number} [offset]
 */
async function loadSystemLogs(filters = {}, limit = 100, offset = 0) {
    let query = `select=*&order=created_at.desc&limit=${limit}&offset=${offset}`;

    if (filters.action) query += `&action=eq.${encodeURIComponent(filters.action)}`;
    if (filters.entity_type) query += `&entity_type=eq.${encodeURIComponent(filters.entity_type)}`;
    if (filters.level) query += `&level=eq.${encodeURIComponent(filters.level)}`;
    if (filters.user_id) query += `&performed_by=eq.${filters.user_id}`;
    if (filters.from_date) query += `&created_at=gte.${filters.from_date}T00:00:00`;
    if (filters.to_date) query += `&created_at=lte.${filters.to_date}T23:59:59`;
    if (filters.holiday_mode !== undefined) query += `&holiday_mode=is.${filters.holiday_mode}`;

    try {
        return await getAll('system_logs', query);
    } catch (err) {
        console.warn('[Logger] loadSystemLogs failed:', err.message);
        return [];
    }
}

/**
 * Get the most recent N log entries for the activity feed
 * shown on the admin dashboard.
 *
 * @param {number} [n] - number of entries (default 15)
 */
async function getRecentActivity(n = 15) {
    try {
        return await getAll('system_logs',
            `select=*&order=created_at.desc&limit=${n}`
        );
    } catch {
        return [];
    }
}

/* ─────────────────────────────────────────────────────────────────
   PRIVATE HELPERS
   ───────────────────────────────────────────────────────────────── */

/**
 * Strip sensitive fields from a changes object before logging.
 * Removes passwords, keys, tokens.
 */
function _sanitizeLogDetails(obj) {
    if (!obj || typeof obj !== 'object') return obj;
    const SENSITIVE = ['password', 'password_hash', 'token', 'key', 'secret', 'api_key'];
    const clean = {};
    Object.entries(obj).forEach(([k, v]) => {
        if (SENSITIVE.some(s => k.toLowerCase().includes(s))) {
            clean[k] = '[REDACTED]';
        } else {
            clean[k] = _truncateLogValue(v);
        }
    });
    return clean;
}

/**
 * Truncate a log value to avoid bloating the details JSONB.
 */
function _truncateLogValue(val, maxLen = 200) {
    if (val === null || val === undefined) return val;
    const s = String(val);
    return s.length > maxLen ? s.substring(0, maxLen) + '…' : s;
}

/* ─────────────────────────────────────────────────────────────────
   EXPOSE
   ───────────────────────────────────────────────────────────────── */

window.logAction = logAction;
window.logLogin = logLogin;
window.logLogout = logLogout;
window.logCreateStudent = logCreateStudent;
window.logUpdateStudent = logUpdateStudent;
window.logArchiveStudent = logArchiveStudent;
window.logBatchPromotion = logBatchPromotion;
window.logSaveMarks = logSaveMarks;
window.logLockAssessment = logLockAssessment;
window.logUnlockAssessment = logUnlockAssessment;
window.logCreatePayment = logCreatePayment;
window.logReversePayment = logReversePayment;
window.logWaiveFee = logWaiveFee;
window.logCreateTeacher = logCreateTeacher;
window.logUpdateTeacher = logUpdateTeacher;
window.logUpdateSettings = logUpdateSettings;
window.logUpdateGrading = logUpdateGrading;
window.logBackup = logBackup;
window.logRestore = logRestore;
window.logUpdateTimetable = logUpdateTimetable;
window.logCreateAnnouncement = logCreateAnnouncement;
window.logError = logError;
window.flushLogQueue = flushLogQueue;
window.loadSystemLogs = loadSystemLogs;
window.getRecentActivity = getRecentActivity;