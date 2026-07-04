/**
 * ECOLE LA FONTAINE — Offline Support (IndexedDB)
 * Caching, offline marks queue, sync
 * Last updated: 2026-06-28
 */

import { state } from './state.js';
import { insert, update } from './api.js';

// ──────────────────────────────────────────────────────────────────────
// CONSTANTS
// ──────────────────────────────────────────────────────────────────────

const DB_NAME = 'EcoleLaFontaineDB';
const DB_VERSION = 3;
const STORES = {
    OFFLINE_MARKS: 'offline_marks',
    PENDING_SYNC: 'pending_sync',
    CACHED_DATA: 'cached_data',
};

let db = null;
let isSyncing = false;

// ──────────────────────────────────────────────────────────────────────
// DATABASE INITIALISATION
// ──────────────────────────────────────────────────────────────────────

export async function openDatabase() {
    return new Promise((resolve, reject) => {
        if (db && db.name === DB_NAME) {
            resolve(db);
            return;
        }

        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onerror = () => {
            console.error('IndexedDB error:', request.error);
            reject(request.error);
        };

        request.onsuccess = () => {
            db = request.result;
            resolve(db);
        };

        request.onupgradeneeded = (event) => {
            const database = event.target.result;

            if (!database.objectStoreNames.contains(STORES.OFFLINE_MARKS)) {
                const store = database.createObjectStore(STORES.OFFLINE_MARKS, { keyPath: 'id', autoIncrement: true });
                store.createIndex('assessment_id', 'assessment_id', { unique: false });
                store.createIndex('student_id', 'student_id', { unique: false });
                store.createIndex('synced', 'synced', { unique: false });
                store.createIndex('timestamp', 'timestamp', { unique: false });
            }

            if (!database.objectStoreNames.contains(STORES.PENDING_SYNC)) {
                const store = database.createObjectStore(STORES.PENDING_SYNC, { keyPath: 'id', autoIncrement: true });
                store.createIndex('type', 'type', { unique: false });
                store.createIndex('created_at', 'created_at', { unique: false });
            }

            if (!database.objectStoreNames.contains(STORES.CACHED_DATA)) {
                const store = database.createObjectStore(STORES.CACHED_DATA, { keyPath: 'key' });
                store.createIndex('expiry', 'expiry', { unique: false });
            }
        };
    });
}

// ──────────────────────────────────────────────────────────────────────
// PER-USER STATE CACHE
// ──────────────────────────────────────────────────────────────────────

const CACHEABLE_STATE_KEYS = [
    'academicYears', 'classes', 'subjects', 'schoolSettings', 'terms',
    'students', 'teachers', 'assessments', 'marks', 'feeCategories',
    'feeAmounts', 'studentFees', 'payments', 'families', 'activityLogs',
    'gradingScale', 'currentAcadYear', 'currentTerm',
];

const STATE_CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

function _stateCacheKey(user) {
    return `state_v1:${user.role}:${user.id}`;
}

/**
 * Save state to cache
 * @param {object} user - User object
 */
export async function saveStateToCache(user) {
    if (!user) return;
    try {
        await openDatabase();
        const snapshot = {};
        for (const key of CACHEABLE_STATE_KEYS) {
            snapshot[key] = state[key];
        }
        await new Promise((resolve, reject) => {
            const tx = db.transaction([STORES.CACHED_DATA], 'readwrite');
            const store = tx.objectStore(STORES.CACHED_DATA);
            const req = store.put({
                key: _stateCacheKey(user),
                data: snapshot,
                expiry: Date.now() + STATE_CACHE_MAX_AGE_MS,
            });
            req.onsuccess = () => resolve();
            req.onerror = () => reject(req.error);
        });
    } catch (e) {
        console.warn('[State Cache] Save failed:', e);
    }
}

/**
 * Load state from cache
 * @param {object} user - User object
 * @returns {Promise<boolean>} True if cache was loaded
 */
export async function loadStateFromCache(user) {
    if (!user) return false;
    try {
        await openDatabase();
        const record = await new Promise((resolve, reject) => {
            const tx = db.transaction([STORES.CACHED_DATA], 'readonly');
            const store = tx.objectStore(STORES.CACHED_DATA);
            const req = store.get(_stateCacheKey(user));
            req.onsuccess = () => resolve(req.result || null);
            req.onerror = () => reject(req.error);
        });
        if (!record || !record.data || record.expiry < Date.now()) return false;
        for (const key of CACHEABLE_STATE_KEYS) {
            if (record.data[key] !== undefined) state[key] = record.data[key];
        }
        return true;
    } catch (e) {
        console.warn('[State Cache] Load failed:', e);
        return false;
    }
}

/**
 * Clear all cached state
 */
export async function clearStateCache() {
    try {
        await openDatabase();
        await new Promise((resolve, reject) => {
            const tx = db.transaction([STORES.CACHED_DATA], 'readwrite');
            const store = tx.objectStore(STORES.CACHED_DATA);
            const req = store.clear();
            req.onsuccess = () => resolve();
            req.onerror = () => reject(req.error);
        });
    } catch (e) {
        console.warn('[State Cache] Clear failed:', e);
    }
}

// ──────────────────────────────────────────────────────────────────────
// OFFLINE MARKS
// ──────────────────────────────────────────────────────────────────────

/**
 * Save marks offline (when no internet)
 * @param {object} data - Marks data
 * @returns {Promise<number>} Record ID
 */
export async function saveMarksOffline(data) {
    await openDatabase();
    return new Promise((resolve, reject) => {
        const tx = db.transaction([STORES.OFFLINE_MARKS], 'readwrite');
        const store = tx.objectStore(STORES.OFFLINE_MARKS);
        const req = store.add({
            data,
            synced: false,
            timestamp: Date.now(),
        });
        req.onsuccess = () => {
            updatePendingBadge();
            resolve(req.result);
        };
        req.onerror = () => reject(req.error);
    });
}

/**
 * Get unsynced offline marks
 * @returns {Promise<Array>} Unsynced marks
 */
export async function getUnsyncedOfflineMarks() {
    await openDatabase();
    return new Promise((resolve, reject) => {
        try {
            const tx = db.transaction([STORES.OFFLINE_MARKS], 'readonly');
            const store = tx.objectStore(STORES.OFFLINE_MARKS);
            const req = store.getAll();
            req.onsuccess = () => {
                const results = (req.result || []).filter(r => !r.synced);
                resolve(results);
            };
            req.onerror = () => reject(req.error);
        } catch (e) {
            resolve([]);
        }
    });
}

/**
 * Mark offline marks as synced (delete them)
 * @param {number} id - Record ID
 */
export async function markOfflineMarksSynced(id) {
    await openDatabase();
    return new Promise((resolve, reject) => {
        const tx = db.transaction([STORES.OFFLINE_MARKS], 'readwrite');
        const store = tx.objectStore(STORES.OFFLINE_MARKS);
        const req = store.delete(id);
        req.onsuccess = () => {
            updatePendingBadge();
            resolve(true);
        };
        req.onerror = () => reject(req.error);
    });
}

// ──────────────────────────────────────────────────────────────────────
// SYNC ENGINE
// ──────────────────────────────────────────────────────────────────────

/**
 * Sync all pending offline marks to Supabase
 * @returns {Promise<object>} Sync result
 */
export async function syncOfflineMarks() {
    if (!navigator.onLine) {
        showToast('No internet connection. Cannot sync.', 'warning');
        return { success: false, message: 'No internet connection' };
    }

    if (isSyncing) {
        showToast('Sync already in progress...', 'info');
        return { success: false, message: 'Sync already in progress' };
    }

    const unsynced = await getUnsyncedOfflineMarks();
    if (unsynced.length === 0) {
        showToast('No pending marks to sync', 'success');
        return { success: true, message: 'No pending marks' };
    }

    isSyncing = true;
    showToast(`⏳ Syncing ${unsynced.length} marks...`, 'info');

    let syncedIds = [];
    let failedIds = [];

    for (const offlineMark of unsynced) {
        try {
            const data = offlineMark.data || offlineMark.marks;
            if (!data || !data.marks || !data.marks.length) {
                failedIds.push(offlineMark.id);
                continue;
            }

            // Create assessment if needed
            let assessmentId = offlineMark.assessment_id;
            if (!assessmentId) {
                const assessment = await insert('assessments', {
                    class_id: data.classId,
                    subject_id: data.subjectId,
                    assessment_type: data.assessmentType,
                    assessment_name: data.assessmentName,
                    max_marks: data.maxMarks,
                    due_date: data.dueDate || null,
                    recorded_at: new Date().toISOString().split('T')[0],
                    is_locked: false,
                    created_by: state.currentUser?.id || null,
                });
                assessmentId = assessment?.id;
            }

            if (!assessmentId) {
                failedIds.push(offlineMark.id);
                continue;
            }

            // Save marks to server
            for (const studentMark of data.marks) {
                const existing = await get('marks', {
                    assessment_id: assessmentId,
                    student_id: studentMark.student_id,
                });

                if (existing.length > 0) {
                    await update('marks', existing[0].id, { score: studentMark.score });
                } else {
                    await insert('marks', {
                        assessment_id: assessmentId,
                        student_id: studentMark.student_id,
                        score: studentMark.score,
                        entered_by: state.currentUser?.id || null,
                        entered_at: new Date().toISOString(),
                    });
                }
            }

            await markOfflineMarksSynced(offlineMark.id);
            syncedIds.push(offlineMark.id);
        } catch (error) {
            console.error('Sync error:', error);
            failedIds.push(offlineMark.id);
        }
    }

    await updatePendingBadge();

    if (failedIds.length === 0) {
        showToast(`✅ Successfully synced ${syncedIds.length} marks`, 'success');
    } else {
        showToast(`⚠️ Synced ${syncedIds.length} marks, ${failedIds.length} failed`, 'warning');
    }

    isSyncing = false;
    return {
        success: failedIds.length === 0,
        syncedCount: syncedIds.length,
        failedCount: failedIds.length,
    };
}

// ──────────────────────────────────────────────────────────────────────
// PENDING BADGE
// ──────────────────────────────────────────────────────────────────────

export async function updatePendingBadge() {
    const unsynced = await getUnsyncedOfflineMarks();
    const count = unsynced.length;
    const badge = document.getElementById('offline-badge');

    if (badge) {
        if (count > 0) {
            badge.style.display = 'flex';
            badge.innerHTML = `📱 ${count} pending ${count === 1 ? 'mark' : 'marks'} to sync`;
            badge.onclick = () => {
                if (navigator.onLine) {
                    syncOfflineMarks();
                } else {
                    showToast('No internet connection. Please connect to sync.', 'warning');
                }
            };
        } else {
            badge.style.display = 'none';
        }
    }
}

// ──────────────────────────────────────────────────────────────────────
// OFFLINE SUPPORT INIT
// ──────────────────────────────────────────────────────────────────────

export function initOfflineSupport() {
    openDatabase().catch(console.error);
    console.log('[Offline] Initialized');

    window.addEventListener('online', () => {
        updateConnectionStatus();
        showToast('📶 Internet connection restored. Syncing offline marks...', 'success');
        syncOfflineMarks();
    });

    window.addEventListener('offline', () => {
        updateConnectionStatus();
        showToast('📴 Internet connection lost. Marks will be saved locally.', 'warning');
    });

    updateConnectionStatus();
    createOfflineUI();
    updatePendingBadge();
}

function createOfflineUI() {
    // Offline badge
    const badge = document.createElement('div');
    badge.id = 'offline-badge';
    badge.style.cssText = `
        position: fixed;
        bottom: 20px;
        left: 20px;
        background: var(--warning, #f59e0b);
        color: white;
        padding: 8px 16px;
        border-radius: 30px;
        font-size: 12px;
        font-weight: 600;
        z-index: 1000;
        cursor: pointer;
        display: none;
        box-shadow: 0 2px 8px rgba(0,0,0,0.2);
    `;
    document.body.appendChild(badge);

    // Connection status
    const status = document.createElement('div');
    status.id = 'connection-status';
    status.style.cssText = `
        position: fixed;
        bottom: 20px;
        right: 20px;
        padding: 6px 14px;
        border-radius: 20px;
        font-size: 12px;
        font-weight: 700;
        z-index: 1000;
        display: none;
        align-items: center;
        gap: 6px;
        letter-spacing: .5px;
        box-shadow: 0 2px 8px rgba(0,0,0,0.25);
    `;
    document.body.appendChild(status);
}

function updateConnectionStatus() {
    const statusDiv = document.getElementById('connection-status');
    if (statusDiv) {
        if (navigator.onLine) {
            statusDiv.style.display = 'none';
        } else {
            statusDiv.style.display = 'flex';
            statusDiv.innerHTML = '🔴 OFFLINE';
            statusDiv.style.background = '#ef4444';
            statusDiv.style.color = 'white';
        }
    }
}