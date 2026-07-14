/* ═══════════════════════════════════════════════════════════════════
   js/core/sync-engine.js
   ═══════════════════════════════════════════════════════════════════
   Purpose : Background synchronisation coordinator.
             Orchestrates flushing offline queues, refreshing stale
             state tables, resolving conflicts (server wins), and
             keeping the topbar sync badge up to date.
             Does NOT write to the DB directly — delegates to api.js
             and offline.js.
   Load order: AFTER offline.js, logger.js.
   ═══════════════════════════════════════════════════════════════════ */

'use strict';

/* ─────────────────────────────────────────────────────────────────
   SYNC STATE
   ───────────────────────────────────────────────────────────────── */

const _syncState = {
    isSyncing: false,
    lastSyncAt: null,
    lastSyncResult: null,     // { synced, failed, errors }
    syncInterval: null,     // setInterval handle
    POLL_INTERVAL: 60 * 1000, // check for offline items every 60s
};

/* ─────────────────────────────────────────────────────────────────
   MAIN SYNC FUNCTION
   ───────────────────────────────────────────────────────────────── */

/**
 * Run a full sync cycle:
 *   1. Flush queued log entries
 *   2. Sync offline marks (holiday-aware routing)
 *   3. Sync offline payments
 *   4. Refresh stale state tables if needed
 *   5. Update badge counts
 *
 * Re-entrant guard: skips if a sync is already running.
 *
 * @param {boolean} [silent] - if true, suppresses toasts
 * @returns {Promise<{ synced: number, failed: number }>}
 */
async function runSync(silent = false) {
    if (_syncState.isSyncing) {
        console.info('[Sync] Already syncing — skipped.');
        return { synced: 0, failed: 0 };
    }

    if (state.offline || !navigator.onLine) {
        console.info('[Sync] Offline — skipping sync cycle.');
        return { synced: 0, failed: 0 };
    }

    _syncState.isSyncing = true;
    setSyncBadge('syncing');

    const result = { synced: 0, failed: 0, errors: [] };

    try {
        // 1. Flush log queue
        await flushLogQueue().catch(e => {
            result.errors.push(`Log flush: ${e.message}`);
        });

        // 2. Sync offline marks
        const marksResult = await syncOfflineMarks().catch(e => {
            result.errors.push(`Marks sync: ${e.message}`);
            return { synced: 0, failed: 0 };
        });
        result.synced += marksResult.synced;
        result.failed += marksResult.failed;

        // 3. Sync offline payments
        const paymentsResult = await syncOfflinePayments().catch(e => {
            result.errors.push(`Payments sync: ${e.message}`);
            return { synced: 0, failed: 0 };
        });
        result.synced += paymentsResult.synced;
        result.failed += paymentsResult.failed;

        // 4. Refresh notifications count (cheap — just a count query)
        await refreshNotificationCount().catch(() => { });

        // 5. Record sync time
        _syncState.lastSyncAt = new Date();
        _syncState.lastSyncResult = result;

        if (result.synced > 0 && !silent && typeof showToast === 'function') {
            showToast(
                `Synced ${result.synced} offline record(s) successfully.`,
                'success',
                3500
            );
        }

        if (result.failed > 0 && !silent && typeof showToast === 'function') {
            showToast(
                `${result.failed} record(s) could not sync. Will retry automatically.`,
                'warning',
                5000
            );
        }

    } catch (err) {
        result.errors.push(err.message);
        console.error('[Sync] Sync cycle error:', err.message);
    } finally {
        _syncState.isSyncing = false;
        await updateSyncBadge();
    }

    return result;
}

/* ─────────────────────────────────────────────────────────────────
   CONFLICT RESOLUTION  (Part 12)
   Server-wins policy: if both local and server versions changed,
   the server version is always kept. Local offline changes that
   conflict with server changes are discarded and the user is notified.
   ───────────────────────────────────────────────────────────────── */

/**
 * Detect and resolve write conflicts for a set of mark rows.
 * If the server already has a newer mark (updated_at is more recent),
 * the local offline version is discarded.
 *
 * @param {Array} offlineMarks  - marks from the offline queue
 * @param {Array} serverMarks   - current marks from Supabase
 * @returns {{ toSync: Array, discarded: number }}
 *   toSync = marks safe to upsert (no conflict or local is newer)
 */
function resolveMarkConflicts(offlineMarks, serverMarks) {
    const serverIndex = {};
    serverMarks.forEach(m => {
        const key = `${m.assessment_id}_${m.student_id}`;
        serverIndex[key] = m;
    });

    const toSync = [];
    let discarded = 0;

    offlineMarks.forEach(local => {
        const key = `${local.assessment_id}_${local.student_id}`;
        const server = serverIndex[key];

        if (!server) {
            // No server version — safe to sync
            toSync.push(local);
            return;
        }

        // Server-wins: if server's updated_at is NEWER than local's queued_at, discard
        const serverTime = new Date(server.updated_at || 0).getTime();
        const localTime = new Date(local.queued_at || 0).getTime();

        if (serverTime > localTime) {
            discarded++;
            console.info(
                `[Sync] Conflict discarded: assessment ${local.assessment_id}, ` +
                `student ${local.student_id} — server version is newer.`
            );
        } else {
            toSync.push(local);
        }
    });

    if (discarded > 0 && typeof showToast === 'function') {
        showToast(
            `${discarded} offline mark(s) were discarded because the server has newer data.`,
            'warning',
            6000
        );
    }

    return { toSync, discarded };
}

/* ─────────────────────────────────────────────────────────────────
   SELECTIVE TABLE REFRESH
   After sync, only refresh tables that changed to avoid a full reload.
   ───────────────────────────────────────────────────────────────── */

/**
 * Refresh only state tables that are likely stale.
 * Called periodically and after sync cycles.
 *
 * @param {string[]} [tables] - explicit list; if omitted, uses smart defaults
 */
async function refreshStaleData(tables = []) {
    if (!navigator.onLine || state.offline) return;

    const toRefresh = tables.length > 0 ? tables : _getDefaultRefreshList();

    await refreshTables(toRefresh).catch(e => {
        console.warn('[Sync] refreshStaleData failed:', e.message);
    });
}

/**
 * Determine which tables are most likely to be stale.
 * Based on current module and time since last refresh.
 */
function _getDefaultRefreshList() {
    const base = ['notifications', 'announcements'];

    // If viewing a finance module, also refresh payment data
    const mod = state.currentModule || '';
    if (mod.includes('finance') || mod.includes('payment') || mod.includes('fee')) {
        base.push('student_fees', 'payments');
    }

    // If viewing academics, refresh marks
    if (mod.includes('marks') || mod.includes('register') || mod.includes('report')) {
        base.push('marks', 'assessments');
    }

    return base;
}

/* ─────────────────────────────────────────────────────────────────
   NOTIFICATION COUNT REFRESH
   ───────────────────────────────────────────────────────────────── */

/**
 * Refresh just the unread notification count for the current user.
 * Very lightweight — used in the background polling cycle.
 */
async function refreshNotificationCount() {
    if (!state.currentUser?.id) return;

    const count = await getCount(
        'notifications',
        `recipient_id=eq.${state.currentUser.id}&is_read=is.false`
    );

    // Update the bell badge in the topbar
    const badge = document.getElementById('notif-bell-badge');
    if (badge) {
        if (count > 0) {
            badge.textContent = count > 99 ? '99+' : String(count);
            badge.style.display = 'inline-flex';
        } else {
            badge.style.display = 'none';
        }
    }
}

/* ─────────────────────────────────────────────────────────────────
   SYNC BADGE (topbar indicator)
   ───────────────────────────────────────────────────────────────── */

/**
 * Update the topbar sync badge based on pending offline items.
 */
async function updateSyncBadge() {
    const pending = await getPendingCount().catch(() => 0);
    const badge = document.getElementById('sync-badge');
    if (!badge) return;

    if (pending > 0) {
        badge.textContent = `${pending} pending`;
        badge.className = 'sync-badge sync-badge-pending';
        badge.title = `${pending} item(s) waiting to sync`;
        badge.style.display = 'inline-flex';
    } else {
        badge.textContent = '';
        badge.style.display = 'none';
    }
}

/**
 * Set the sync badge to a specific state immediately.
 * @param {'syncing'|'ok'|'error'|'pending'} status
 */
function setSyncBadge(status) {
    const badge = document.getElementById('sync-badge');
    if (!badge) return;

    const labels = {
        syncing: 'Syncing…',
        ok: 'Synced',
        error: 'Sync failed',
        pending: 'Pending',
    };
    const classes = {
        syncing: 'sync-badge sync-badge-syncing',
        ok: 'sync-badge sync-badge-ok',
        error: 'sync-badge sync-badge-error',
        pending: 'sync-badge sync-badge-pending',
    };

    badge.textContent = labels[status] || '';
    badge.className = classes[status] || 'sync-badge';
    badge.style.display = status === 'ok' ? 'none' : 'inline-flex';
}

/* ─────────────────────────────────────────────────────────────────
   AUTO-SYNC POLLING
   ───────────────────────────────────────────────────────────────── */

/**
 * Start the background polling loop.
 * Checks for pending offline items every POLL_INTERVAL ms.
 * Called once at boot.
 */
function startSyncPolling() {
    if (_syncState.syncInterval) return; // already started

    _syncState.syncInterval = setInterval(async () => {
        const pending = await getPendingCount().catch(() => 0);
        if (pending > 0 && navigator.onLine && !state.offline) {
            await runSync(true); // silent mode — no toasts during auto-sync
        }
        await updateSyncBadge();
    }, _syncState.POLL_INTERVAL);

    console.info('[Sync] Background polling started.');
}

/**
 * Stop the background polling loop.
 * Called on logout.
 */
function stopSyncPolling() {
    if (_syncState.syncInterval) {
        clearInterval(_syncState.syncInterval);
        _syncState.syncInterval = null;
    }
}

/* ─────────────────────────────────────────────────────────────────
   LAST SYNC TIME DISPLAY HELPER
   ───────────────────────────────────────────────────────────────── */

/**
 * Return a human-readable string of when the last sync happened.
 */
function getLastSyncLabel() {
    if (!_syncState.lastSyncAt) return 'Not synced yet';
    return `Last synced ${fmtAgo(_syncState.lastSyncAt.toISOString())}`;
}

/* ─────────────────────────────────────────────────────────────────
   EXPOSE
   ───────────────────────────────────────────────────────────────── */

window.runSync = runSync;
window.resolveMarkConflicts = resolveMarkConflicts;
window.refreshStaleData = refreshStaleData;
window.refreshNotificationCount = refreshNotificationCount;
window.updateSyncBadge = updateSyncBadge;
window.setSyncBadge = setSyncBadge;
window.startSyncPolling = startSyncPolling;
window.stopSyncPolling = stopSyncPolling;
window.getLastSyncLabel = getLastSyncLabel;