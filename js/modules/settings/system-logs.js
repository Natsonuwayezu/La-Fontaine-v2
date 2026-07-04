/**
 * ECOLE LA FONTAINE — System Logs
 * View, filter, export, and clear system activity logs
 * Last updated: 2026-06-29
 */

import { state, getCurrentUser } from '../../core/state.js';
import { esc, fmtDate, fmtDateTime, fmtAgo } from '../../core/utils.js';
import { getAll, removeWhere, logActivity } from '../../core/api.js';
import { exportToExcel } from '../../core/utils.js';

// ──────────────────────────────────────────────────────────────────────
// MAIN RENDER FUNCTION
// ──────────────────────────────────────────────────────────────────────

export async function renderSystemLogs(container) {
    if (!container) return;

    const user = getCurrentUser();
    if (user?.role !== 'admin') {
        container.innerHTML = '<div class="alert alert-danger">Access denied. Admin privileges required.</div>';
        return;
    }

    await ensureStateLoaded();

    let logs = state.activityLogs || [];
    logs = logs.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    const uniqueUsers = [...new Set(logs.map(l => l.user_role).filter(Boolean))];
    const uniqueActions = [...new Set(logs.map(l => l.action).filter(Boolean))];

    container.innerHTML = `
        <div class="dash-card">
            <div class="dash-card-header">
                <span class="dash-card-title">📋 System Logs</span>
                <div class="btn-group">
                    <button class="btn btn-sm btn-outline" onclick="window._exportAllLogs()">📥 Export</button>
                    <button class="btn btn-sm btn-outline" onclick="window._clearOldLogs()">🗑️ Clear Old Logs</button>
                    <button class="btn btn-sm btn-outline" onclick="window._refreshLogs()">🔄 Refresh</button>
                </div>
            </div>
            <div class="dash-card-body">
                <div class="filters-bar" style="flex-wrap:wrap;gap:8px;margin-bottom:16px;">
                    <select id="log-user-filter" class="form-control" style="width:130px;" onchange="window._filterLogs()">
                        <option value="">All Users</option>
                        ${uniqueUsers.map(u => `<option value="${u}">${esc(u)}</option>`).join('')}
                    </select>
                    <select id="log-action-filter" class="form-control" style="width:150px;" onchange="window._filterLogs()">
                        <option value="">All Actions</option>
                        ${uniqueActions.slice(0, 20).map(a => `<option value="${a}">${esc(a)}</option>`).join('')}
                    </select>
                    <select id="log-entity-filter" class="form-control" style="width:130px;" onchange="window._filterLogs()">
                        <option value="">All Entities</option>
                        <option value="students">Students</option>
                        <option value="teachers">Teachers</option>
                        <option value="payments">Payments</option>
                        <option value="marks">Marks</option>
                        <option value="fees">Fees</option>
                        <option value="attendance">Attendance</option>
                    </select>
                    <input type="date" id="log-date-start" class="form-control" style="width:140px;" onchange="window._filterLogs()">
                    <input type="date" id="log-date-end" class="form-control" style="width:140px;" onchange="window._filterLogs()">
                    <input type="text" id="log-search" class="form-control flex-1" placeholder="🔍 Search logs..." oninput="window._filterLogs()">
                    <span class="result-count" id="log-count"></span>
                </div>

                <div class="table-wrapper" id="logs-table-container" style="max-height:500px;overflow-y:auto;">
                    <div class="loading-container"><div class="spinner"></div><p>Loading logs...</p></div>
                </div>

                <div class="pagination" id="logs-pagination" style="margin-top:16px;"></div>
            </div>
        </div>

        <div class="dash-card" style="margin-top:20px;">
            <div class="dash-card-header">
                <span class="dash-card-title">📊 Log Analytics</span>
            </div>
            <div class="dash-card-body">
                <div class="stats-grid" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:12px;" id="log-stats">
                    <div class="loading-container"><div class="spinner"></div><p>Loading stats...</p></div>
                </div>
            </div>
        </div>
    `;

    window._filterLogs = filterLogs;
    window._exportAllLogs = exportAllLogs;
    window._clearOldLogs = clearOldLogs;
    window._refreshLogs = refreshLogs;
    window._viewLogDetails = viewLogDetails;

    window._allLogs = logs;
    window._currentPage = 1;
    window._pageSize = 50;

    filterLogs();
    renderLogStats();
}

// ──────────────────────────────────────────────────────────────────────
// FILTER LOGS
// ──────────────────────────────────────────────────────────────────────

function filterLogs() {
    let logs = window._allLogs || [];

    const userFilter = document.getElementById('log-user-filter')?.value;
    const actionFilter = document.getElementById('log-action-filter')?.value;
    const entityFilter = document.getElementById('log-entity-filter')?.value;
    const startDate = document.getElementById('log-date-start')?.value;
    const endDate = document.getElementById('log-date-end')?.value;
    const search = document.getElementById('log-search')?.value?.toLowerCase();

    if (userFilter) logs = logs.filter(l => l.user_role === userFilter);
    if (actionFilter) logs = logs.filter(l => l.action === actionFilter);
    if (entityFilter) logs = logs.filter(l => l.entity_type === entityFilter);
    if (startDate) logs = logs.filter(l => l.created_at >= startDate);
    if (endDate) logs = logs.filter(l => l.created_at <= `${endDate}T23:59:59`);
    if (search) logs = logs.filter(l =>
        l.action?.toLowerCase().includes(search) ||
        l.user_role?.toLowerCase().includes(search) ||
        (l.details || '').toLowerCase().includes(search)
    );

    window._filteredLogs = logs;
    window._currentPage = 1;
    renderLogsTable();
}

// ──────────────────────────────────────────────────────────────────────
// RENDER LOGS TABLE
// ──────────────────────────────────────────────────────────────────────

function renderLogsTable() {
    const logs = window._filteredLogs || [];
    const start = (window._currentPage - 1) * window._pageSize;
    const pageLogs = logs.slice(start, start + window._pageSize);

    const container = document.getElementById('logs-table-container');
    const countSpan = document.getElementById('log-count');

    if (countSpan) countSpan.textContent = `${logs.length} record${logs.length !== 1 ? 's' : ''}`;

    if (!container) return;

    if (!logs.length) {
        container.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-muted);">No logs found</div>';
        return;
    }

    container.innerHTML = `
        <table class="data-table">
            <thead>
                <tr>
                    <th>Date & Time</th>
                    <th>Action</th>
                    <th>User</th>
                    <th>Role</th>
                    <th>Entity</th>
                    <th>Details</th>
                    <th>Actions</th>
                </tr>
            </thead>
            <tbody>
                ${pageLogs.map(log => `
                    <tr>
                        <td style="font-size:0.75rem;white-space:nowrap;">${fmtDateTime(log.created_at)}</td>
                        <td><strong style="font-size:0.8rem;">${esc(log.action)}</strong></td>
                        <td style="font-size:0.8rem;">${esc(log.user_role || 'System')}</td>
                        <td><span class="badge ${log.user_role === 'admin' ? 'badge-danger' : log.user_role === 'accountant' ? 'badge-warning' : 'badge-info'}">${esc(log.user_role || 'System')}</span></td>
                        <td>${log.entity_type ? `<span class="badge badge-neutral">${esc(log.entity_type)}</span>` : '—'}</td>
                        <td><div style="max-width:200px;font-size:0.75rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
                            ${log.details ? esc((typeof log.details === 'string' ? log.details : JSON.stringify(log.details)).substring(0, 60)) : '—'}
                        </div></td>
                        <td><button class="btn btn-sm btn-outline" onclick="window._viewLogDetails('${log.id}')" style="padding:2px 8px;font-size:0.7rem;">👁️</button></td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;

    renderPagination(logs.length);
}

// ──────────────────────────────────────────────────────────────────────
// RENDER PAGINATION
// ──────────────────────────────────────────────────────────────────────

function renderPagination(total) {
    const totalPages = Math.ceil(total / window._pageSize);
    const pagination = document.getElementById('logs-pagination');
    if (!pagination) return;

    if (totalPages <= 1) { pagination.innerHTML = ''; return; }

    let html = '';
    for (let i = 1; i <= Math.min(totalPages, 10); i++) {
        html += `<div class="page-btn ${i === window._currentPage ? 'active' : ''}" onclick="window._goToLogPage(${i})">${i}</div>`;
    }
    if (totalPages > 10) html += `<div class="page-btn" onclick="window._goToLogPage(${totalPages})">${totalPages}</div>`;
    pagination.innerHTML = html;

    window._goToLogPage = function (page) {
        window._currentPage = page;
        renderLogsTable();
    };
}

// ──────────────────────────────────────────────────────────────────────
// VIEW LOG DETAILS
// ──────────────────────────────────────────────────────────────────────

async function viewLogDetails(logId) {
    const log = state.activityLogs.find(l => l.id == logId);
    if (!log) {
        showToast('Log record not found', 'error');
        return;
    }

    let detailsHtml = '';
    if (log.details) {
        try {
            const d = typeof log.details === 'string' ? JSON.parse(log.details) : log.details;
            detailsHtml = `<pre style="background:var(--bg-tertiary);padding:12px;border-radius:8px;overflow-x:auto;font-size:0.75rem;max-height:200px;">${esc(JSON.stringify(d, null, 2))}</pre>`;
        } catch (e) {
            detailsHtml = `<div style="background:var(--bg-tertiary);padding:12px;border-radius:8px;font-size:0.8rem;">${esc(log.details)}</div>`;
        }
    }

    showModal(`
        <div class="modal-overlay" id="log-detail-modal">
            <div class="modal" style="max-width:600px;">
                <div class="modal-header">
                    <h3>📋 Log Record Details</h3>
                    <button class="modal-close" onclick="window.closeModal('log-detail-modal')">✕</button>
                </div>
                <div class="modal-body">
                    <div class="form-grid">
                        <div class="form-group"><label>Date</label><input readonly value="${fmtDateTime(log.created_at)}" class="form-control"></div>
                        <div class="form-group"><label>Action</label><input readonly value="${esc(log.action)}" class="form-control"></div>
                        <div class="form-group"><label>User Role</label><input readonly value="${esc(log.user_role || 'System')}" class="form-control"></div>
                        <div class="form-group"><label>User ID</label><input readonly value="${log.user_id || '—'}" class="form-control"></div>
                        <div class="form-group"><label>Entity Type</label><input readonly value="${esc(log.entity_type || '—')}" class="form-control"></div>
                        <div class="form-group"><label>Entity ID</label><input readonly value="${log.entity_id || '—'}" class="form-control"></div>
                    </div>
                    <div class="form-group full" style="margin-top:12px;">
                        <label>Details</label>
                        ${detailsHtml || '<div class="alert alert-info">No additional details</div>'}
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-outline" onclick="window.closeModal('log-detail-modal')">Close</button>
                </div>
            </div>
        </div>
    `);
}

// ──────────────────────────────────────────────────────────────────────
// EXPORT ALL LOGS
// ──────────────────────────────────────────────────────────────────────

function exportAllLogs() {
    const logs = window._filteredLogs || window._allLogs || [];

    if (!logs.length) {
        showToast('No logs to export', 'warning');
        return;
    }

    const data = logs.map(log => ({
        'Date': fmtDateTime(log.created_at),
        'Action': log.action,
        'User Role': log.user_role || 'System',
        'User ID': log.user_id || '—',
        'Entity Type': log.entity_type || '—',
        'Entity ID': log.entity_id || '—',
        'Details': typeof log.details === 'string' ? log.details : JSON.stringify(log.details || {}),
    }));

    exportToExcel(data, `System_Logs_${new Date().toISOString().split('T')[0]}`);
    showToast('✅ Logs exported', 'success');
}

// ──────────────────────────────────────────────────────────────────────
// CLEAR OLD LOGS
// ──────────────────────────────────────────────────────────────────────

async function clearOldLogs() {
    const threeMonthsAgo = new Date();
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

    const oldLogs = (window._allLogs || []).filter(l => new Date(l.created_at) < threeMonthsAgo);
    if (!oldLogs.length) {
        showToast('No old logs to clear', 'info');
        return;
    }

    if (!await confirmDialog(`Delete ${oldLogs.length} log records older than 3 months?`)) return;

    try {
        await removeWhere('activity_logs', `created_at=lt.${threeMonthsAgo.toISOString()}`);
        await refreshLogs();
        await logActivity(state.currentUser?.id, state.currentUser?.role, `Cleared ${oldLogs.length} old log records`);
        showToast(`✅ Cleared ${oldLogs.length} old log records`, 'success');
    } catch (e) {
        showToast('Error clearing logs: ' + e.message, 'error');
    }
}

// ──────────────────────────────────────────────────────────────────────
// REFRESH LOGS
// ──────────────────────────────────────────────────────────────────────

async function refreshLogs() {
    try {
        const logs = await getAll('activity_logs', 'order=created_at.desc&limit=5000');
        state.activityLogs = logs;
        window._allLogs = logs;
        filterLogs();
        renderLogStats();
        showToast('🔄 Logs refreshed', 'success', 1500);
    } catch (e) {
        showToast('Failed to refresh logs: ' + e.message, 'error');
    }
}

// ──────────────────────────────────────────────────────────────────────
// RENDER LOG STATS
// ──────────────────────────────────────────────────────────────────────

function renderLogStats() {
    const container = document.getElementById('log-stats');
    if (!container) return;

    const logs = window._allLogs || [];

    const today = new Date().toISOString().split('T')[0];
    const todayLogs = logs.filter(l => l.created_at?.startsWith(today));

    const uniqueUsers = [...new Set(logs.map(l => l.user_role).filter(Boolean))];
    const uniqueActions = [...new Set(logs.map(l => l.action).filter(Boolean))];

    container.innerHTML = `
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:12px;width:100%;">
            <div class="stat-card" style="padding:10px 14px;background:var(--bg-secondary);border-radius:var(--r-lg);border:1px solid var(--border-light);text-align:center;">
                <div style="font-size:1.2rem;font-weight:700;">${logs.length}</div>
                <div style="font-size:0.65rem;color:var(--text-muted);text-transform:uppercase;">Total Logs</div>
            </div>
            <div class="stat-card" style="padding:10px 14px;background:var(--bg-secondary);border-radius:var(--r-lg);border:1px solid var(--border-light);text-align:center;">
                <div style="font-size:1.2rem;font-weight:700;">${todayLogs.length}</div>
                <div style="font-size:0.65rem;color:var(--text-muted);text-transform:uppercase;">Today</div>
            </div>
            <div class="stat-card" style="padding:10px 14px;background:var(--bg-secondary);border-radius:var(--r-lg);border:1px solid var(--border-light);text-align:center;">
                <div style="font-size:1.2rem;font-weight:700;">${uniqueUsers.length}</div>
                <div style="font-size:0.65rem;color:var(--text-muted);text-transform:uppercase;">Users</div>
            </div>
            <div class="stat-card" style="padding:10px 14px;background:var(--bg-secondary);border-radius:var(--r-lg);border:1px solid var(--border-light);text-align:center;">
                <div style="font-size:1.2rem;font-weight:700;">${uniqueActions.length}</div>
                <div style="font-size:0.65rem;color:var(--text-muted);text-transform:uppercase;">Actions</div>
            </div>
        </div>
    `;
}