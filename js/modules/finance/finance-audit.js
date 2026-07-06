// js/modules/finance-audit.js
// Finance Audit Module - Track and audit all financial transactions


async function renderFinanceAudit(container) {
    await ensureStateLoaded();

    const user = state.currentUser;
    if (user?.role !== 'admin') {
        container.innerHTML = '<div class="alert alert-danger">Access denied. Admin privileges required.</div>';
        return;
    }

    const auditLogs = state.activityLogs.filter(log =>
        log.entity_type === 'payments' ||
        log.entity_type === 'student_fees' ||
        log.entity_type === 'fee_amounts' ||
        log.entity_type === 'fee_categories'
    ).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    container.innerHTML = `
        <div class="dash-card">
            <div class="dash-card-header">
                <span class="dash-card-title">🔍 Financial Audit Trail</span>
                <div class="btn-group">
                    <button class="btn btn-sm btn-outline" onclick="window.exportAuditLog()">📥 Export</button>
                    <button class="btn btn-sm btn-outline" onclick="window.refreshAuditLog()">🔄 Refresh</button>
                </div>
            </div>
            <div class="dash-card-body">
                <div class="filters-bar">
                    <select id="audit-type-filter" class="form-control" style="width:150px" onchange="window.filterAuditLog()">
                        <option value="">All Types</option>
                        <option value="payments">Payments</option>
                        <option value="student_fees">Fee Assignments</option>
                        <option value="fee_amounts">Fee Amounts</option>
                        <option value="fee_categories">Fee Categories</option>
                    </select>
                    <select id="audit-action-filter" class="form-control" style="width:150px" onchange="window.filterAuditLog()">
                        <option value="">All Actions</option>
                        <option value="insert">Created</option>
                        <option value="update">Modified</option>
                        <option value="delete">Deleted</option>
                    </select>
                    <input type="date" id="audit-date-start" class="form-control" style="width:150px" onchange="window.filterAuditLog()">
                    <input type="date" id="audit-date-end" class="form-control" style="width:150px" onchange="window.filterAuditLog()">
                    <input type="text" id="audit-search" class="form-control flex-1" placeholder="🔍 Search..." oninput="window.filterAuditLog()">
                    <span class="result-count" id="audit-count"></span>
                </div>
                
                <div class="table-wrapper" id="audit-table-container">
                    <div class="loading-container"><div class="spinner"></div><p>Loading audit logs...</p></div>
                </div>
            </div>
        </div>
        
        <div class="dash-card" style="margin-top:20px">
            <div class="dash-card-header">
                <span class="dash-card-title">📊 Audit Summary</span>
            </div>
            <div class="dash-card-body">
                <div id="audit-summary-stats" class="stats-grid" style="grid-template-columns:repeat(4,1fr)">
                    <div class="loading-container"><div class="spinner"></div><p>Loading summary...</p></div>
                </div>
            </div>
        </div>
    `;

    window.exportAuditLog = exportAuditLog;
    window.refreshAuditLog = refreshAuditLog;
    window.filterAuditLog = filterAuditLog;
    window.viewAuditDetails = viewAuditDetails;

    await refreshAuditLog();
    await renderAuditSummary();
}

async function refreshAuditLog() {
    const logs = await getAll('activity_logs', { order: 'created_at.desc', limit: 500 });
    window._allAuditLogs = logs.filter(log =>
        log.entity_type === 'payments' ||
        log.entity_type === 'student_fees' ||
        log.entity_type === 'fee_amounts' ||
        log.entity_type === 'fee_categories'
    );
    filterAuditLog();
}

function filterAuditLog() {
    let logs = window._allAuditLogs || [];
    const typeFilter = document.getElementById('audit-type-filter')?.value;
    const actionFilter = document.getElementById('audit-action-filter')?.value;
    const startDate = document.getElementById('audit-date-start')?.value;
    const endDate = document.getElementById('audit-date-end')?.value;
    const search = document.getElementById('audit-search')?.value.toLowerCase();

    if (typeFilter) logs = logs.filter(log => log.entity_type === typeFilter);
    if (actionFilter) logs = logs.filter(log => log.action?.toLowerCase().includes(actionFilter.toLowerCase()));
    if (startDate) logs = logs.filter(log => log.created_at >= startDate);
    if (endDate) logs = logs.filter(log => log.created_at <= `${endDate}T23:59:59`);
    if (search) logs = logs.filter(log =>
        log.action?.toLowerCase().includes(search) ||
        log.user_role?.toLowerCase().includes(search) ||
        (log.details || '').toLowerCase().includes(search)
    );

    renderAuditTable(logs);
}

function renderAuditTable(logs) {
    const container = document.getElementById('audit-table-container');
    const countSpan = document.getElementById('audit-count');

    if (countSpan) countSpan.textContent = `${logs.length} record${logs.length !== 1 ? 's' : ''}`;

    if (logs.length === 0) {
        container.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-muted)">No audit records found</div>';
        return;
    }

    container.innerHTML = `
        <table class="data-table">
            <thead>
                <tr>
                    <th>Date & Time</th>
                    <th>Action</th>
                    <th>Entity Type</th>
                    <th>Entity ID</th>
                    <th>User</th>
                    <th>Role</th>
                    <th>Details</th>
                    <th>Actions</th>
                </tr>
            </thead>
            <tbody>
                ${logs.map(log => `
                    <tr>
                        <td>${fmtDateTime(log.created_at)}</span>
                        <td><strong>${esc(log.action)}</strong></span>
                        <td><span class="badge badge-info">${esc(log.entity_type)}</span></span>
                        <td><code>${log.entity_id || '—'}</code></span>
                        <td>${esc(log.user_role || 'System')}</span>
                        <td>${log.user_role ? `<span class="badge ${getRoleBadgeClass(log.user_role)}">${log.user_role}</span>` : '—'}</span>
                        <td>
                            <div style="max-width:200px; overflow-x:auto; font-size:11px">
                                ${log.details ? (typeof log.details === 'string' ? esc(log.details.substring(0, 100)) : esc(JSON.stringify(log.details).substring(0, 100))) : '—'}
                                ${log.details && log.details.length > 100 ? '...' : ''}
                            </div>
                         </span>
                        <td>
                            <button class="btn btn-sm btn-outline" onclick="window.viewAuditDetails('${log.id}')">👁️</button>
                         </span>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
}

async function renderAuditSummary() {
    const container = document.getElementById('audit-summary-stats');
    if (!container) return;

    const logs = window._allAuditLogs || [];
    const paymentActions = logs.filter(l => l.entity_type === 'payments').length;
    const feeAssignments = logs.filter(l => l.entity_type === 'student_fees').length;
    const modifications = logs.filter(l => l.action?.includes('update')).length;
    const deletions = logs.filter(l => l.action?.includes('delete')).length;

    container.innerHTML = `
        <div class="stat-card">
            <div class="stat-icon">💸</div>
            <div class="stat-value">${paymentActions}</div>
            <div class="stat-label">Payment Transactions</div>
        </div>
        <div class="stat-card">
            <div class="stat-icon">🏷️</div>
            <div class="stat-value">${feeAssignments}</div>
            <div class="stat-label">Fee Assignments</div>
        </div>
        <div class="stat-card">
            <div class="stat-icon">✏️</div>
            <div class="stat-value">${modifications}</div>
            <div class="stat-label">Modifications</div>
        </div>
        <div class="stat-card">
            <div class="stat-icon">🗑️</div>
            <div class="stat-value">${deletions}</div>
            <div class="stat-label">Deletions</div>
        </div>
    `;
}

function getRoleBadgeClass(role) {
    if (role === 'admin') return 'badge-danger';
    if (role === 'accountant') return 'badge-warning';
    if (role === 'teacher') return 'badge-info';
    return 'badge-neutral';
}

async function viewAuditDetails(logId) {
    const log = await getById('activity_logs', logId);
    if (!log) return;

    let detailsHtml = '';
    if (log.details) {
        try {
            const details = typeof log.details === 'string' ? JSON.parse(log.details) : log.details;
            detailsHtml = `<pre style="background:var(--bg-tertiary); padding:12px; border-radius:8px; overflow-x:auto; font-size:12px">${esc(JSON.stringify(details, null, 2))}</pre>`;
        } catch (e) {
            detailsHtml = `<div style="background:var(--bg-tertiary); padding:12px; border-radius:8px">${esc(log.details)}</div>`;
        }
    }

    showModal(`
        <div class="modal-overlay">
            <div class="modal" style="max-width: 600px;">
                <div class="modal-header">
                    <h3>📋 Audit Record Details</h3>
                    <button class="modal-close" onclick="closeModal()">✕</button>
                </div>
                <div class="modal-body">
                    <div class="form-grid">
                        <div class="form-group"><label>Date</label><input readonly value="${fmtDateTime(log.created_at)}" class="form-control"></div>
                        <div class="form-group"><label>Action</label><input readonly value="${esc(log.action)}" class="form-control"></div>
                        <div class="form-group"><label>Entity Type</label><input readonly value="${esc(log.entity_type)}" class="form-control"></div>
                        <div class="form-group"><label>Entity ID</label><input readonly value="${log.entity_id || '—'}" class="form-control"></div>
                        <div class="form-group"><label>User Role</label><input readonly value="${esc(log.user_role || 'System')}" class="form-control"></div>
                        <div class="form-group"><label>User ID</label><input readonly value="${log.user_id || '—'}" class="form-control"></div>
                    </div>
                    <div class="form-group full">
                        <label>Details</label>
                        ${detailsHtml || '<div class="alert alert-info">No additional details</div>'}
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-outline" onclick="closeModal()">Close</button>
                </div>
            </div>
        </div>
    `);
}

function exportAuditLog() {
    const logs = window._allAuditLogs || [];
    const data = logs.map(log => ({
        'Date': fmtDateTime(log.created_at),
        'Action': log.action,
        'Entity Type': log.entity_type,
        'Entity ID': log.entity_id,
        'User Role': log.user_role || 'System',
        'User ID': log.user_id || '—',
        'Details': typeof log.details === 'string' ? log.details : JSON.stringify(log.details || {})
    }));

    exportToExcel(data, `Finance_Audit_Log_${new Date().toISOString().split('T')[0]}`);
    showToast('✅ Audit log exported', 'success');
}

function getById(table, id) {
    return getAll(table, { id: id }).then(r => r[0]);
}

export { renderFinanceAudit };
