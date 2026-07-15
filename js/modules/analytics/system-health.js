/* ═══════════════════════════════════════════════════════════════════
   js/modules/analytics/system-health.js
   ═══════════════════════════════════════════════════════════════════
   Rendered into #mainContent by core/router.js for 'system-health'
   (registered in navigation.js right next to 'system-logs' — this is
   functionally a Settings-section page, even though the file lives
   in js/modules/analytics/).

   Unlike the mock-data-driven academics/analytics pages, most of this
   page reads REAL browser diagnostics — no backend needed for these
   to be genuinely accurate right now:
     - navigator.onLine + online/offline events (connectivity)
     - navigator.storage.estimate() (storage quota usage)
     - navigator.serviceWorker.getRegistration() (PWA status)
     - caches.keys() / cache entry counts (Cache Storage API)
     - performance.memory (Chrome/Edge only — feature-detected)

   Three integrations are OPTIONAL and feature-detected rather than
   assumed, since I haven't inspected these files directly (they're
   listed as already correctly written in the audit, but their exact
   exposed global names weren't confirmed): window.SyncEngine (pending
   sync queue), window.ErrorHandler (recent error log), window.Offline
   (queued offline actions). If any of these globals aren't present,
   that card shows "Not available" instead of fabricating numbers.

   Styled with css/modules/analytics.css (analysis-grid, analysis-card,
   status-badge, progress-dot) — same design system as analytics.js.

   Loaded as a plain <script> — no import/export.

   Last updated: 2026-07-14
   ═══════════════════════════════════════════════════════════════════ */

(function () {
    'use strict';

    const esc = window.esc || function (s) { return String(s == null ? '' : s); };

    // ─── STATE ───────────────────────────────────────────────────────

    let rootEl = null;
    let refreshInterval = null;
    let onlineHandler = null;
    let offlineHandler = null;

    // ─── FORMATTERS ──────────────────────────────────────────────────

    function formatBytes(bytes) {
        if (!bytes && bytes !== 0) return '—';
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
        return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
    }

    function formatMs(ms) {
        if (ms < 1000) return Math.round(ms) + ' ms';
        return (ms / 1000).toFixed(2) + ' s';
    }

    // ─── RENDER ──────────────────────────────────────────────────────

    function renderSystemHealth(container) {
        if (!container) {
            console.warn('[SystemHealth] No container provided');
            return;
        }
        rootEl = container;

        container.innerHTML =
            '<div class="analytics-page">' +
                '<div class="analytics-app">' +

                    '<div class="analytics-page-header">' +
                        '<div class="title"><i class="fa-solid fa-heart-pulse"></i> System Health</div>' +
                        '<div class="actions">' +
                            '<button class="btn primary" id="sh-refresh"><i class="fa-solid fa-rotate"></i> Refresh Now</button>' +
                        '</div>' +
                    '</div>' +

                    '<div class="analysis-grid">' +

                        '<div class="analysis-card">' +
                            '<div class="card-head"><span class="title"><i class="fa-solid fa-signal"></i> Connectivity</span><span class="badge" id="sh-conn-badge"></span></div>' +
                            '<div id="sh-conn-body"></div>' +
                        '</div>' +

                        '<div class="analysis-card">' +
                            '<div class="card-head"><span class="title"><i class="fa-solid fa-gauge-high"></i> Page Performance</span><span class="badge">This Session</span></div>' +
                            '<div id="sh-perf-body"></div>' +
                        '</div>' +

                        '<div class="analysis-card">' +
                            '<div class="card-head"><span class="title"><i class="fa-solid fa-database"></i> Storage Usage</span><span class="badge" id="sh-storage-badge"></span></div>' +
                            '<div id="sh-storage-body"></div>' +
                        '</div>' +

                        '<div class="analysis-card">' +
                            '<div class="card-head"><span class="title"><i class="fa-solid fa-download"></i> Service Worker / PWA</span><span class="badge" id="sh-sw-badge"></span></div>' +
                            '<div id="sh-sw-body"></div>' +
                        '</div>' +

                        '<div class="analysis-card">' +
                            '<div class="card-head"><span class="title"><i class="fa-solid fa-rotate"></i> Sync Queue</span><span class="badge" id="sh-sync-badge"></span></div>' +
                            '<div id="sh-sync-body"></div>' +
                        '</div>' +

                        '<div class="analysis-card full">' +
                            '<div class="card-head"><span class="title"><i class="fa-solid fa-triangle-exclamation"></i> Recent Errors</span><span class="badge" id="sh-error-badge"></span></div>' +
                            '<div class="analytics-table-wrap"><table id="sh-error-table"></table></div>' +
                        '</div>' +

                    '</div>' +

                    '<div class="analytics-footer">ECOLE LA FONTAINE · System Health <span>·</span> v9.0 <span>·</span> <span id="sh-last-check"></span></div>' +

                '</div>' +
            '</div>';

        renderAll();
        wireHeader();
        wireConnectivityListeners();

        // Passive auto-refresh every 30s for the live-changing cards
        // (connectivity/perf/storage). Cleared in destroySystemHealth().
        refreshInterval = setInterval(renderAll, 30000);
    }

    function renderAll() {
        renderConnectivity();
        renderPerformance();
        renderStorage();
        renderServiceWorker();
        renderSyncQueue();
        renderErrors();

        const lastCheck = rootEl.querySelector('#sh-last-check');
        if (lastCheck) {
            const now = new Date();
            lastCheck.textContent = 'Last checked ' + now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        }
    }

    // ─── CONNECTIVITY (real: navigator.onLine) ──────────────────────

    function renderConnectivity() {
        const badge = rootEl.querySelector('#sh-conn-badge');
        const body = rootEl.querySelector('#sh-conn-body');
        if (!badge || !body) return;

        const online = navigator.onLine;
        badge.textContent = online ? 'Online' : 'Offline';

        const connInfo = navigator.connection || navigator.mozConnection || navigator.webkitConnection;

        body.innerHTML =
            '<table>' +
                '<tbody>' +
                    '<tr><td><span class="progress-dot ' + (online ? 'green' : 'red') + '"></span> Status</td><td><span class="status-badge ' + (online ? 'pass' : 'fail') + '">' + (online ? 'Connected' : 'Disconnected') + '</span></td></tr>' +
                    (connInfo
                        ? '<tr><td>Connection Type</td><td>' + esc(connInfo.effectiveType || 'unknown') + '</td></tr>' +
                          '<tr><td>Downlink</td><td>' + (connInfo.downlink != null ? connInfo.downlink + ' Mbps' : '—') + '</td></tr>'
                        : '<tr><td colspan="2" style="color:var(--analytics-text-soft);">Network Information API not supported in this browser</td></tr>') +
                '</tbody>' +
            '</table>';
    }

    function wireConnectivityListeners() {
        onlineHandler = function () { renderConnectivity(); notify('Connection restored', 'success'); };
        offlineHandler = function () { renderConnectivity(); notify('Connection lost — working offline', 'warning'); };
        window.addEventListener('online', onlineHandler);
        window.addEventListener('offline', offlineHandler);
    }

    // ─── PERFORMANCE (real: Navigation Timing API + performance.memory) ─

    function renderPerformance() {
        const body = rootEl.querySelector('#sh-perf-body');
        if (!body) return;

        let loadTime = null;
        let domReady = null;
        try {
            const nav = performance.getEntriesByType('navigation')[0];
            if (nav) {
                loadTime = nav.loadEventEnd - nav.startTime;
                domReady = nav.domContentLoadedEventEnd - nav.startTime;
            }
        } catch (err) {
            // Navigation Timing Level 2 not supported — leave as null
        }

        const rows = [
            '<tr><td>Page Load Time</td><td>' + (loadTime != null && loadTime > 0 ? formatMs(loadTime) : 'Not available') + '</td></tr>',
            '<tr><td>DOM Ready</td><td>' + (domReady != null && domReady > 0 ? formatMs(domReady) : 'Not available') + '</td></tr>'
        ];

        if (performance.memory) {
            const usedMb = (performance.memory.usedJSHeapSize / (1024 * 1024)).toFixed(1);
            const limitMb = (performance.memory.jsHeapSizeLimit / (1024 * 1024)).toFixed(0);
            rows.push('<tr><td>JS Heap Used</td><td>' + usedMb + ' MB / ' + limitMb + ' MB</td></tr>');
        } else {
            rows.push('<tr><td colspan="2" style="color:var(--analytics-text-soft);">Memory API only available in Chrome/Edge</td></tr>');
        }

        body.innerHTML = '<table><tbody>' + rows.join('') + '</tbody></table>';
    }

    // ─── STORAGE (real: navigator.storage.estimate) ─────────────────

    function renderStorage() {
        const badge = rootEl.querySelector('#sh-storage-badge');
        const body = rootEl.querySelector('#sh-storage-body');
        if (!badge || !body) return;

        if (!navigator.storage || !navigator.storage.estimate) {
            badge.textContent = 'Unsupported';
            body.innerHTML = '<table><tbody><tr><td colspan="2" style="color:var(--analytics-text-soft);">Storage Estimation API not supported in this browser</td></tr></tbody></table>';
            return;
        }

        navigator.storage.estimate().then(function (estimate) {
            const usage = estimate.usage || 0;
            const quota = estimate.quota || 0;
            const pct = quota ? Math.round((usage / quota) * 100) : 0;
            badge.textContent = pct + '% used';

            const dotColor = pct >= 90 ? 'red' : pct >= 70 ? 'amber' : 'green';

            let breakdownRows = '';
            if (estimate.usageDetails) {
                Object.keys(estimate.usageDetails).forEach(function (key) {
                    breakdownRows += '<tr><td style="padding-left:20px;">' + esc(key) + '</td><td>' + formatBytes(estimate.usageDetails[key]) + '</td></tr>';
                });
            }

            body.innerHTML =
                '<table><tbody>' +
                    '<tr><td><span class="progress-dot ' + dotColor + '"></span> Used</td><td>' + formatBytes(usage) + '</td></tr>' +
                    '<tr><td>Quota</td><td>' + formatBytes(quota) + '</td></tr>' +
                    breakdownRows +
                '</tbody></table>';
        }).catch(function (err) {
            badge.textContent = 'Error';
            body.innerHTML = '<table><tbody><tr><td colspan="2" style="color:var(--analytics-danger);">Could not read storage estimate: ' + esc(err.message) + '</td></tr></tbody></table>';
        });
    }

    // ─── SERVICE WORKER (real: navigator.serviceWorker) ─────────────

    function renderServiceWorker() {
        const badge = rootEl.querySelector('#sh-sw-badge');
        const body = rootEl.querySelector('#sh-sw-body');
        if (!badge || !body) return;

        if (!('serviceWorker' in navigator)) {
            badge.textContent = 'Unsupported';
            body.innerHTML = '<table><tbody><tr><td colspan="2" style="color:var(--analytics-text-soft);">Service Workers not supported in this browser</td></tr></tbody></table>';
            return;
        }

        navigator.serviceWorker.getRegistration().then(function (reg) {
            if (!reg) {
                badge.textContent = 'Not Registered';
                body.innerHTML = '<table><tbody><tr><td colspan="2"><span class="status-badge warn">No active service worker</span></td></tr></tbody></table>';
                return;
            }

            const state = reg.active ? reg.active.state : 'unknown';
            badge.textContent = state;

            caches.keys().then(function (cacheNames) {
                body.innerHTML =
                    '<table><tbody>' +
                        '<tr><td><span class="progress-dot green"></span> Status</td><td><span class="status-badge pass">' + esc(state) + '</span></td></tr>' +
                        '<tr><td>Scope</td><td>' + esc(reg.scope) + '</td></tr>' +
                        '<tr><td>Cache Stores</td><td>' + cacheNames.length + '</td></tr>' +
                    '</tbody></table>';
            }).catch(function () {
                body.innerHTML =
                    '<table><tbody>' +
                        '<tr><td><span class="progress-dot green"></span> Status</td><td><span class="status-badge pass">' + esc(state) + '</span></td></tr>' +
                        '<tr><td>Scope</td><td>' + esc(reg.scope) + '</td></tr>' +
                    '</tbody></table>';
            });
        }).catch(function (err) {
            badge.textContent = 'Error';
            body.innerHTML = '<table><tbody><tr><td colspan="2" style="color:var(--analytics-danger);">' + esc(err.message) + '</td></tr></tbody></table>';
        });
    }

    // ─── SYNC QUEUE (optional integration — feature-detected) ───────

    function renderSyncQueue() {
        const badge = rootEl.querySelector('#sh-sync-badge');
        const body = rootEl.querySelector('#sh-sync-body');
        if (!badge || !body) return;

        const engine = window.SyncEngine || window.syncEngine;

        if (!engine || typeof engine.getPendingCount !== 'function') {
            badge.textContent = 'Not available';
            body.innerHTML = '<table><tbody><tr><td colspan="2" style="color:var(--analytics-text-soft);">core/sync-engine.js does not expose a queue-status API this page recognizes yet</td></tr></tbody></table>';
            return;
        }

        const pending = engine.getPendingCount();
        badge.textContent = pending + ' pending';
        body.innerHTML =
            '<table><tbody>' +
                '<tr><td><span class="progress-dot ' + (pending > 0 ? 'amber' : 'green') + '"></span> Pending Operations</td><td>' + pending + '</td></tr>' +
            '</tbody></table>';
    }

    // ─── RECENT ERRORS (optional integration — feature-detected) ────

    function renderErrors() {
        const badge = rootEl.querySelector('#sh-error-badge');
        const table = rootEl.querySelector('#sh-error-table');
        if (!badge || !table) return;

        const handler = window.ErrorHandler || window.errorHandler;
        const errors = handler && typeof handler.getRecent === 'function' ? handler.getRecent(10) : null;

        if (!errors) {
            badge.textContent = 'Not available';
            table.innerHTML = '<tbody><tr><td style="color:var(--analytics-text-soft);padding:12px;">core/error-handler.js does not expose a log-reading API this page recognizes yet</td></tr></tbody>';
            return;
        }

        badge.textContent = errors.length + ' recent';

        if (!errors.length) {
            table.innerHTML = '<tbody><tr><td style="color:var(--analytics-text-soft);padding:12px;"><span class="progress-dot green"></span> No errors recorded this session</td></tr></tbody>';
            return;
        }

        table.innerHTML =
            '<thead><tr><th>Time</th><th>Message</th><th>Source</th></tr></thead>' +
            '<tbody>' + errors.map(function (e) {
                return '<tr><td>' + esc(e.time || '') + '</td><td class="cell-poor">' + esc(e.message || '') + '</td><td>' + esc(e.source || '') + '</td></tr>';
            }).join('') + '</tbody>';
    }

    // ─── HEADER ──────────────────────────────────────────────────────

    function wireHeader() {
        rootEl.querySelector('#sh-refresh').addEventListener('click', function () {
            renderAll();
            notify('System health refreshed', 'success');
        });
    }

    // ─── TOAST HELPER ────────────────────────────────────────────────

    function notify(message, type) {
        if (typeof window.showToast === 'function') {
            window.showToast(message, type || 'info');
        }
    }

    // ─── DESTROY ─────────────────────────────────────────────────────

    function destroySystemHealth() {
        if (refreshInterval) {
            clearInterval(refreshInterval);
            refreshInterval = null;
        }
        if (onlineHandler) { window.removeEventListener('online', onlineHandler); onlineHandler = null; }
        if (offlineHandler) { window.removeEventListener('offline', offlineHandler); offlineHandler = null; }
        rootEl = null;
    }

    // ─── EXPOSE ──────────────────────────────────────────────────────

    window.renderSystemHealth = renderSystemHealth;
    window.destroySystemHealth = destroySystemHealth;
})();
