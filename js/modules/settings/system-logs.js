/* ═══════════════════════════════════════════════════════════════════
   js/modules/settings/system-logs.js
   ═══════════════════════════════════════════════════════════════════
   Rendered into #app-main by core/router.js for the 'system-logs'
   nav item. Read-only audit trail table, sourced from the system_logs
   table (written by core/logger.js's logAction() on every significant
   action across the app).

   Table: system_logs { id, action, entity_type, entity_id, performed_by,
                          performed_by_name, role, details, level,
                          holiday_mode, created_at }

   Dependencies (plain-script globals loaded earlier in index.html):
   api.js: getAll
   utils.js: esc, fmtDate
   ═══════════════════════════════════════════════════════════════════ */

const SystemLogsPage = (() => {

    let allLogs = [];
    let filters = { level: '', action: '', from: '', to: '' };

    async function render(container) {
        if (!container) return;
        container.innerHTML = `<div class="dashboard-page"><div class="loading-inline">Loading system logs…</div></div>`;

        allLogs = await getAll('system_logs', {}, '*').catch(() => []);
        allLogs.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

        container.innerHTML = `
            <div class="dashboard-page">
                ${window.SettingsTabs ? window.SettingsTabs.render('system-logs') : ''}
                <div class="settings-section">
                    <div class="settings-section__title">System Logs</div>
                    <div class="settings-section__desc">Audit trail of user actions across the app. ${allLogs.length} entries loaded.</div>
                </div>

                <div class="filters-bar">
                    <select class="form-select" id="log-level-filter">
                        <option value="">All levels</option>
                        <option value="info">Info</option>
                        <option value="warning">Warning</option>
                        <option value="error">Error</option>
                    </select>
                    <input type="text" class="form-input" id="log-action-filter" placeholder="Filter by action...">
                    <input type="date" class="form-input" id="log-from-filter">
                    <input type="date" class="form-input" id="log-to-filter">
                    <span class="result-count" id="log-result-count"></span>
                </div>

                <div class="logs-table-wrap">
                    <table class="logs-table">
                        <thead>
                            <tr>
                                <th>When</th>
                                <th>Action</th>
                                <th>Table</th>
                                <th>By</th>
                                <th>Role</th>
                                <th>Level</th>
                            </tr>
                        </thead>
                        <tbody id="logs-tbody"></tbody>
                    </table>
                </div>
            </div>
        `;

        bindEvents(container);
        applyFilters(container);
    }

    function applyFilters(container) {
        let rows = allLogs;
        if (filters.level) rows = rows.filter(r => r.level === filters.level);
        if (filters.action) rows = rows.filter(r => (r.action || '').toLowerCase().includes(filters.action.toLowerCase()));
        if (filters.from) rows = rows.filter(r => r.created_at >= filters.from);
        if (filters.to) rows = rows.filter(r => r.created_at <= filters.to + 'T23:59:59');

        const tbody = container.querySelector('#logs-tbody');
        container.querySelector('#log-result-count').textContent = `${rows.length} of ${allLogs.length}`;

        if (!rows.length) {
            tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:24px;">No log entries match these filters.</td></tr>`;
            return;
        }

        tbody.innerHTML = rows.slice(0, 500).map(r => `
            <tr>
                <td>${fmtDate(r.created_at)}</td>
                <td><span class="log-action-badge">${esc(r.action)}</span></td>
                <td>${esc(r.entity_type || '—')}</td>
                <td>${esc(r.performed_by_name || 'System')}</td>
                <td>${esc(r.role || '—')}</td>
                <td><span class="badge ${levelClass(r.level)}">${esc(r.level || 'info')}</span></td>
            </tr>
        `).join('');
    }

    function levelClass(level) {
        if (level === 'error') return 'error';
        if (level === 'warning') return 'warn';
        return 'ok';
    }

    function bindEvents(container) {
        container.querySelector('#log-level-filter')?.addEventListener('change', (e) => {
            filters.level = e.target.value; applyFilters(container);
        });
        container.querySelector('#log-action-filter')?.addEventListener('input', debounce((e) => {
            filters.action = e.target.value; applyFilters(container);
        }, DEBOUNCE_SEARCH));
        container.querySelector('#log-from-filter')?.addEventListener('change', (e) => {
            filters.from = e.target.value; applyFilters(container);
        });
        container.querySelector('#log-to-filter')?.addEventListener('change', (e) => {
            filters.to = e.target.value; applyFilters(container);
        });
    }

    function destroy() { allLogs = []; filters = { level: '', action: '', from: '', to: '' }; }

    return { render, destroy };
})();

window.renderSystemLogs = SystemLogsPage.render;
window.SystemLogsPage = SystemLogsPage;
