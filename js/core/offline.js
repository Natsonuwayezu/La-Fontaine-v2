/* ═══════════════════════════════════════════════════════════════════
   js/core/offline.js
   ═══════════════════════════════════════════════════════════════════
   Purpose : IndexedDB-based offline queue for marks and payments.
             When the user saves marks or records payments without
             internet, entries are stored locally and synced
             automatically when connectivity is restored.
             Holiday-mode aware: routes queued writes to correct tables.
   References: backend.txt Part 12 (Offline / PWA)
   Load order: AFTER api.js, state.js, logger.js.
   ═══════════════════════════════════════════════════════════════════ */

'use strict';

/* ─────────────────────────────────────────────────────────────────
   INDEXEDDB SETUP
   ───────────────────────────────────────────────────────────────── */

let _db = null; // IndexedDB connection

/**
 * Open (or create) the app's IndexedDB database.
 * Called once at boot, awaited before any offline operations.
 * @returns {Promise<IDBDatabase>}
 */
function openOfflineDB() {
    return new Promise((resolve, reject) => {
        if (_db) { resolve(_db); return; }

        const req = indexedDB.open(IDB_NAME, IDB_VERSION);

        req.onupgradeneeded = (e) => {
            const db = e.target.result;

            // pending_marks store — keyed by (assessment_id + student_id)
            if (!db.objectStoreNames.contains(IDB_STORES.pendingMarks)) {
                const ms = db.createObjectStore(IDB_STORES.pendingMarks, {
                    keyPath: 'local_id', autoIncrement: true,
                });
                ms.createIndex('assessment_id', 'assessment_id', { unique: false });
                ms.createIndex('student_id', 'student_id', { unique: false });
                ms.createIndex('queued_at', 'queued_at', { unique: false });
            }

            // pending_payments store
            if (!db.objectStoreNames.contains(IDB_STORES.pendingPayments)) {
                const ps = db.createObjectStore(IDB_STORES.pendingPayments, {
                    keyPath: 'local_id', autoIncrement: true,
                });
                ps.createIndex('student_id', 'student_id', { unique: false });
                ps.createIndex('queued_at', 'queued_at', { unique: false });
            }

            // cached_students store — for reading offline
            if (!db.objectStoreNames.contains(IDB_STORES.cachedStudents)) {
                db.createObjectStore(IDB_STORES.cachedStudents, { keyPath: 'id' });
            }
        };

        req.onsuccess = (e) => { _db = e.target.result; resolve(_db); };
        req.onerror = (e) => {
            console.error('[Offline] IndexedDB open failed:', e.target.error);
            reject(e.target.error);
        };
    });
}

/* ─────────────────────────────────────────────────────────────────
   IDB TRANSACTION HELPERS
   ───────────────────────────────────────────────────────────────── */

function idbGetAll(storeName) {
    return new Promise((resolve, reject) => {
        if (!_db) { resolve([]); return; }
        const tx = _db.transaction(storeName, 'readonly');
        const req = tx.objectStore(storeName).getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error);
    });
}

function idbAdd(storeName, record) {
    return new Promise((resolve, reject) => {
        if (!_db) { resolve(null); return; }
        const tx = _db.transaction(storeName, 'readwrite');
        const req = tx.objectStore(storeName).add(record);
        req.onsuccess = () => resolve(req.result); // returns local_id
        req.onerror = () => reject(req.error);
    });
}

function idbDelete(storeName, key) {
    return new Promise((resolve, reject) => {
        if (!_db) { resolve(); return; }
        const tx = _db.transaction(storeName, 'readwrite');
        const req = tx.objectStore(storeName).delete(key);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
    });
}

function idbClear(storeName) {
    return new Promise((resolve, reject) => {
        if (!_db) { resolve(); return; }
        const tx = _db.transaction(storeName, 'readwrite');
        const req = tx.objectStore(storeName).clear();
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
    });
}

function idbCount(storeName) {
    return new Promise((resolve) => {
        if (!_db) { resolve(0); return; }
        const tx = _db.transaction(storeName, 'readonly');
        const req = tx.objectStore(storeName).count();
        req.onsuccess = () => resolve(req.result || 0);
        req.onerror = () => resolve(0);
    });
}

/* ─────────────────────────────────────────────────────────────────
   QUEUE MARK FOR OFFLINE SAVE  (Part 12)
   ───────────────────────────────────────────────────────────────── */

/**
 * Queue a mark entry to be saved when connectivity returns.
 * Called by marks-entry.js when saveMarcsBatch() fails due to offline.
 *
 * Each item stores:
 *   assessment_id, student_id, score, is_absent, recorded_by,
 *   is_holiday (flag to route to holiday_marks on sync),
 *   queued_at
 *
 * @param {Array} markRows - same shape as saveMarcsBatch() input
 */
async function queueMarksOffline(markRows) {
    if (!markRows || markRows.length === 0) return;

    await openOfflineDB();

    const isHoliday = isHolidayMode();
    const now = new Date().toISOString();

    for (const row of markRows) {
        await idbAdd(IDB_STORES.pendingMarks, {
            ...row,
            is_holiday: isHoliday,
            queued_at: now,
            synced: false,
        });
    }

    updateOfflineBadge();
    console.info(`[Offline] Queued ${markRows.length} mark(s) for later sync.`);
}

/**
 * Queue a payment for offline save.
 * @param {Object} paymentData - full payment object + allocations
 */
async function queuePaymentOffline(paymentData) {
    await openOfflineDB();

    await idbAdd(IDB_STORES.pendingPayments, {
        ...paymentData,
        is_holiday: isHolidayMode(),
        queued_at: new Date().toISOString(),
        synced: false,
    });

    updateOfflineBadge();
    console.info('[Offline] Queued payment for later sync.');
}

/* ─────────────────────────────────────────────────────────────────
   STUDENT CACHE  (for offline reading)
   ───────────────────────────────────────────────────────────────── */

/**
 * Cache the current students list into IndexedDB so they can be
 * read while offline.
 */
async function cacheStudentsLocally() {
    if (!state.students || state.students.length === 0) return;
    await openOfflineDB();
    await idbClear(IDB_STORES.cachedStudents);

    for (const student of state.students) {
        await idbAdd(IDB_STORES.cachedStudents, student).catch(() => { });
    }
    console.info(`[Offline] Cached ${state.students.length} students locally.`);
}

/**
 * Read cached students from IndexedDB (fallback when offline).
 * @returns {Promise<Array>}
 */
async function getCachedStudents() {
    await openOfflineDB();
    return idbGetAll(IDB_STORES.cachedStudents);
}

/* ─────────────────────────────────────────────────────────────────
   SYNC — FLUSH QUEUED MARKS  (Part 12)
   ───────────────────────────────────────────────────────────────── */

/**
 * Attempt to sync all queued offline marks to Supabase.
 * Called by sync-engine.js when connectivity is restored.
 *
 * @returns {Promise<{ synced: number, failed: number }>}
 */
async function syncOfflineMarks() {
    await openOfflineDB();
    const pending = await idbGetAll(IDB_STORES.pendingMarks);

    if (pending.length === 0) return { synced: 0, failed: 0 };

    let synced = 0;
    let failed = 0;

    // Group by is_holiday flag so we can route to correct table
    const normalMarks = pending.filter(m => !m.is_holiday);
    const holidayMarks = pending.filter(m => m.is_holiday);

    // Sync normal marks → marks table
    if (normalMarks.length > 0) {
        try {
            const rows = normalMarks.map(m => ({
                assessment_id: m.assessment_id,
                student_id: m.student_id,
                score: m.score,
                is_absent: m.is_absent || false,
                recorded_by: m.recorded_by,
                updated_at: new Date().toISOString(),
            }));

            await apiFetch('marks', 'POST', rows, {
                'Prefer': 'return=representation,resolution=merge-duplicates',
            });

            // Delete from queue
            for (const m of normalMarks) {
                await idbDelete(IDB_STORES.pendingMarks, m.local_id);
            }
            synced += normalMarks.length;

        } catch (err) {
            console.warn('[Offline] Sync normal marks failed:', err.message);
            failed += normalMarks.length;
        }
    }

    // Sync holiday marks → holiday_marks table
    if (holidayMarks.length > 0) {
        try {
            const rows = holidayMarks.map(m => ({
                assessment_id: m.assessment_id,
                student_id: m.student_id,
                score: m.score,
                is_absent: m.is_absent || false,
                recorded_by: m.recorded_by,
                updated_at: new Date().toISOString(),
            }));

            await apiFetch('holiday_marks', 'POST', rows, {
                'Prefer': 'return=representation,resolution=merge-duplicates',
            });

            for (const m of holidayMarks) {
                await idbDelete(IDB_STORES.pendingMarks, m.local_id);
            }
            synced += holidayMarks.length;

        } catch (err) {
            console.warn('[Offline] Sync holiday marks failed:', err.message);
            failed += holidayMarks.length;
        }
    }

    if (synced > 0) {
        await logAction('OFFLINE_SYNC', 'marks', null, { synced, failed });
        await refreshTable('marks');
    }

    updateOfflineBadge();
    return { synced, failed };
}

/* ─────────────────────────────────────────────────────────────────
   SYNC — FLUSH QUEUED PAYMENTS
   ───────────────────────────────────────────────────────────────── */

/**
 * Attempt to sync all queued offline payments.
 * @returns {Promise<{ synced: number, failed: number }>}
 */
async function syncOfflinePayments() {
    await openOfflineDB();
    const pending = await idbGetAll(IDB_STORES.pendingPayments);

    if (pending.length === 0) return { synced: 0, failed: 0 };

    let synced = 0;
    let failed = 0;

    for (const payment of pending) {
        try {
            // Re-attempt the full payment + allocation write
            // payment object contains everything needed
            const { local_id, is_holiday, queued_at, synced: _s, ...paymentData } = payment;

            const result = await insert('payments', {
                ...paymentData,
                created_at: new Date().toISOString(),
            });

            if (result && result.id) {
                // Run FIFO allocation
                await allocatePaymentFIFO(
                    result.id,
                    paymentData.student_id,
                    paymentData.total_amount
                );
                await idbDelete(IDB_STORES.pendingPayments, local_id);
                synced++;
            }

        } catch (err) {
            console.warn('[Offline] Sync payment failed:', err.message);
            failed++;
        }
    }

    if (synced > 0) {
        await logAction('OFFLINE_SYNC', 'payments', null, { synced, failed });
        await refreshTables(['payments', 'student_fees', 'payment_allocations']);
    }

    updateOfflineBadge();
    return { synced, failed };
}

/* ─────────────────────────────────────────────────────────────────
   QUEUE COUNT  (for sidebar badge)
   ───────────────────────────────────────────────────────────────── */

/**
 * Return the total number of items waiting to sync.
 */
async function getPendingCount() {
    await openOfflineDB().catch(() => null);
    const markCount = await idbCount(IDB_STORES.pendingMarks);
    const paymentCount = await idbCount(IDB_STORES.pendingPayments);
    return markCount + paymentCount;
}

/**
 * Update the offline sync badge in the topbar.
 * Shows a count of items pending sync.
 */
async function updateOfflineBadge() {
    const count = await getPendingCount();
    const badge = document.getElementById('offline-sync-badge');
    if (!badge) return;

    if (count > 0) {
        badge.textContent = count;
        badge.style.display = 'inline-flex';
        badge.title = `${count} item(s) pending sync`;
    } else {
        badge.style.display = 'none';
    }
}

/* ─────────────────────────────────────────────────────────────────
   ONLINE / OFFLINE EVENT LISTENERS
   ───────────────────────────────────────────────────────────────── */

/**
 * Initialise online/offline listeners.
 * Called once at boot by boot.js.
 */
function initOfflineListeners() {
    // Online: hide offline banner, trigger sync
    window.addEventListener('online', async () => {
        state.offline = false;
        hideOfflineBanner();

        console.info('[Offline] Connection restored — triggering sync.');
        if (typeof showToast === 'function') {
            showToast('Connection restored. Syncing offline data…', 'info', 3000);
        }

        // Flush logs, then sync data
        await flushLogQueue().catch(() => { });
        const marksResult = await syncOfflineMarks().catch(() => ({ synced: 0, failed: 0 }));
        const paymentsResult = await syncOfflinePayments().catch(() => ({ synced: 0, failed: 0 }));

        const totalSynced = marksResult.synced + paymentsResult.synced;
        if (totalSynced > 0 && typeof showToast === 'function') {
            showToast(`Synced ${totalSynced} offline record(s) successfully.`, 'success', 4000);
        }
    });

    // Offline: show banner
    window.addEventListener('offline', () => {
        state.offline = true;
        showOfflineBanner();
        if (typeof showToast === 'function') {
            showToast('You are offline. Changes will sync when connection returns.', 'warning', 8000);
        }
    });

    // Initial state check
    if (!navigator.onLine) {
        state.offline = true;
        showOfflineBanner();
    }
}

/* ─────────────────────────────────────────────────────────────────
   OFFLINE BANNER
   ───────────────────────────────────────────────────────────────── */

/**
 * Show the offline indicator banner below the topbar.
 */
function showOfflineBanner() {
    let banner = document.getElementById('offline-banner');
    if (!banner) {
        banner = document.createElement('div');
        banner.id = 'offline-banner';
        banner.className = 'offline-banner';
        banner.innerHTML = `
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                 stroke="currentColor" stroke-width="2">
                <line x1="1" y1="1" x2="23" y2="23"/>
                <path d="M16.72 11.06A10.94 10.94 0 0119 12.55M5 12.55a10.94 10.94 0 015.17-2.39M10.71 5.05A16 16 0 0122.56 9M1.42 9a15.91 15.91 0 014.7-2.88M8.53 16.11a6 6 0 016.95 0M12 20h.01"/>
            </svg>
            <span>You are offline — changes will sync when you reconnect.</span>`;

        // Insert after topbar or at top of body
        const topbar = document.getElementById('topbar');
        if (topbar && topbar.nextSibling) {
            topbar.parentNode.insertBefore(banner, topbar.nextSibling);
        } else {
            document.body.insertBefore(banner, document.body.firstChild);
        }
    }
    banner.style.display = 'flex';
}

/**
 * Hide the offline banner.
 */
function hideOfflineBanner() {
    const banner = document.getElementById('offline-banner');
    if (banner) banner.style.display = 'none';
}

/* ─────────────────────────────────────────────────────────────────
   EXPOSE
   ───────────────────────────────────────────────────────────────── */

window.openOfflineDB = openOfflineDB;
window.queueMarksOffline = queueMarksOffline;
window.queuePaymentOffline = queuePaymentOffline;
window.cacheStudentsLocally = cacheStudentsLocally;
window.getCachedStudents = getCachedStudents;
window.syncOfflineMarks = syncOfflineMarks;
window.syncOfflinePayments = syncOfflinePayments;
window.getPendingCount = getPendingCount;
window.updateOfflineBadge = updateOfflineBadge;
window.initOfflineListeners = initOfflineListeners;
window.showOfflineBanner = showOfflineBanner;
window.hideOfflineBanner = hideOfflineBanner;