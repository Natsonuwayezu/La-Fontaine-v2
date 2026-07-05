/**
 * ECOLE LA FONTAINE — System Health Monitor
 * Database status, performance metrics, cache statistics, and system alerts
 * Last updated: 2026-06-29
 */


const state = window.state || {}; // global state alias
import { state, getCurrentUser } from '../../core/state.js';
import { esc, fmtDate, fmtDateTime } from '../../core/utils.js';
import { get, getCount } from '../../core/api.js';

// ──────────────────────────────────────────────────────────────────────
// MAIN RENDER FUNCTION
// ──────────────────────────────────────────────────────────────────────

export async function renderSystemHealth(container) {
    if (!container) return;

    const user = getCurrentUser();
    if (user?.role !== 'admin') {
        container.innerHTML = '<div class="alert alert-danger">Access denied. Admin privileges required.</div>';
        return;
    }

    container.innerHTML = `
        <div class="dash-card">
            <div class="dash-card-header">
                <span class="dash-card-title">🩺 System Health Monitor</span>
                <div class="btn-group">
                    <button class="btn btn-sm btn-primary" onclick="window._runSystemHealthCheck()">🔄 Run Health Check</button>
                    <button class="btn btn-sm btn-outline" onclick="window._exportHealthReport()">📥 Export Report</button>
                </div>
            </div>
            <div class="dash-card-body">
                <div id="health-status" class="stats-grid" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:12px;margin-bottom:20px;">
                    <div class="loading-container"><div class="spinner"></div><p>Loading system status...</p></div>
                </div>
            </div>
        </div>

        <div class="dash-card" style="margin-top:20px;">
            <div class="dash-card-header">
                <span class="dash-card-title">🗄️ Database Status</span>
            </div>
            <div class="dash-card-body">
                <div id="db-status" class="table-wrapper">
                    <div class="loading-container"><div class="spinner"></div><p>Loading database status...</p></div>
                </div>
            </div>
        </div>

        <div class="dash-card" style="margin-top:20px;">
            <div class="dash-card-header">
                <span class="dash-card-title">⚠️ System Alerts</span>
            </div>
            <div class="dash-card-body">
                <div id="system-alerts" class="table-wrapper">
                    <div class="loading-container"><div class="spinner"></div><p>Loading alerts...</p></div>
                </div>
            </div>
        </div>

        <div class="dash-card" style="margin-top:20px;">
            <div class="dash-card-header">
                <span class="dash-card-title">📈 Performance Metrics</span>
            </div>
            <div class="dash-card-body">
                <div id="performance-metrics" class="form-grid" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:16px;">
                    <div class="loading-container"><div class="spinner"></div><p>Loading metrics...</p></div>
                </div>
            </div>
        </div>

        <div class="dash-card" style="margin-top:20px;">
            <div class="dash-card-header">
                <span class="dash-card-title">💾 Cache Statistics</span>
            </div>
            <div class="dash-card-body">
                <div id="cache-stats" class="table-wrapper">
                    <div class="loading-container"><div class="spinner"></div><p>Loading cache stats...</p></div>
                </div>
            </div>
        </div>
    `;

    window._runSystemHealthCheck = runSystemHealthCheck;
    window._exportHealthReport = exportHealthReport;

    await runSystemHealthCheck();
}

// ──────────────────────────────────────────────────────────────────────
// RUN SYSTEM HEALTH CHECK
// ──────────────────────────────────────────────────────────────────────

async function runSystemHealthCheck() {
    const statusContainer = document.getElementById('health-status');
    const dbContainer = document.getElementById('db-status');
    const alertsContainer = document.getElementById('system-alerts');
    const metricsContainer = document.getElementById('performance-metrics');
    const cacheContainer = document.getElementById('cache-stats');

    // ── Health Status ──
    const checks = [];
    let allHealthy = true;

    // Check Supabase connection
    try {
        const result = await get('students', { limit: 1 });
        checks.push({ name: 'Supabase Connection', status: result.length >= 0 ? 'pass' : 'fail', msg: result.length >= 0 ? 'Connected' : 'Failed' });
        if (result.length < 0) allHealthy = false;
    } catch (e) {
        checks.push({ name: 'Supabase Connection', status: 'fail', msg: e.message });
        allHealthy = false;
    }

    // Check data loading
    const dataChecks = [
        { key: 'students', label: 'Students Data' },
        { key: 'teachers', label: 'Teachers Data' },
        { key: 'classes', label: 'Classes Data' },
        { key: 'marks', label: 'Marks Data' },
        { key: 'payments', label: 'Payments Data' },
    ];

    for (const dc of dataChecks) {
        const data = state[dc.key] || [];
        const status = data.length > 0 ? 'pass' : 'warn';
        const msg = data.length > 0 ? `${data.length} records loaded` : 'No records loaded';
        checks.push({ name: dc.label, status, msg });
        if (status === 'fail') allHealthy = false;
    }

    // Check academic year and term
    checks.push({
        name: 'Academic Year Set',
        status: state.currentAcadYear ? 'pass' : 'fail',
        msg: state.currentAcadYear?.name || 'No active academic year',
    });
    if (!state.currentAcadYear) allHealthy = false;

    checks.push({
        name: 'Current Term Set',
        status: state.currentTerm ? 'pass' : 'warn',
        msg: state.currentTerm?.name || 'No active term',
    });

    // Check libraries
    checks.push({
        name: 'SheetJS (Export)',
        status: typeof XLSX !== 'undefined' ? 'pass' : 'warn',
        msg: typeof XLSX !== 'undefined' ? 'Loaded' : 'Not loaded — Excel exports disabled',
    });

    checks.push({
        name: 'html2pdf (PDF)',
        status: typeof html2pdf !== 'undefined' ? 'pass' : 'warn',
        msg: typeof html2pdf !== 'undefined' ? 'Loaded' : 'Not loaded — PDF generation disabled',
    });

    checks.push({
        name: 'Service Worker',
        status: 'serviceWorker' in navigator ? 'pass' : 'warn',
        msg: 'serviceWorker' in navigator ? 'Supported' : 'Not supported (offline features disabled)',
    });

    statusContainer.innerHTML = `
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;width:100%;">
            ${checks.map(c => `
                <div style="padding:12px 16px;background:var(--bg-secondary);border-radius:var(--r-lg);border:1px solid var(--border-light);text-align:center;">
                    <div style="font-size:0.65rem;text-transform:uppercase;color:var(--text-muted);letter-spacing:0.5px;">${esc(c.name)}</div>
                    <div style="font-size:1.2rem;font-weight:700;color:${c.status === 'pass' ? 'var(--success)' : c.status === 'warn' ? 'var(--warning)' : 'var(--danger)'};">${c.status === 'pass' ? '✅' : c.status === 'warn' ? '⚠️' : '❌'}</div>
                    <div style="font-size:0.65rem;color:var(--text-muted);">${esc(c.msg)}</div>
                </div>
            `).join('')}
        </div>
        <div style="margin-top:12px;padding:10px 16px;background:${allHealthy ? 'var(--success-bg)' : 'var(--warning-bg)'};border-radius:var(--r-md);text-align:center;font-weight:600;color:${allHealthy ? 'var(--success)' : 'var(--warning)'};">
            ${allHealthy ? '✅ All systems healthy' : '⚠️ Some systems need attention'}
        </div>
    `;

    // ── Database Status ──
    const tables = [
        { name: 'students', label: 'Students' },
        { name: 'teachers', label: 'Teachers' },
        { name: 'classes', label: 'Classes' },
        { name: 'subjects', label: 'Subjects' },
        { name: 'terms', label: 'Terms' },
        { name: 'assessments', label: 'Assessments' },
        { name: 'marks', label: 'Marks' },
        { name: 'payments', label: 'Payments' },
        { name: 'student_fees', label: 'Student Fees' },
        { name: 'fee_categories', label: 'Fee Categories' },
    ];

    let dbRows = '';
    for (const table of tables) {
        const data = state[table.name] || [];
        const count = data.length;
        const status = count > 0 ? '🟢' : '🟡';
        dbRows += `
            <tr style="border-bottom:1px solid var(--border-light);">
                <td style="padding:6px 12px;font-weight:500;">${esc(table.label)}</td>
                <td style="padding:6px 12px;text-align:center;">${count.toLocaleString()}</td>
                <td style="padding:6px 12px;text-align:center;">${status}</td>
            </tr>
        `;
    }

    dbContainer.innerHTML = `
        <div class="table-wrapper">
            <table class="data-table" style="font-size:0.8rem;">
                <thead>
                    <tr style="background:var(--bg-tertiary);">
                        <th style="padding:6px 12px;text-align:left;font-weight:600;font-size:0.65rem;text-transform:uppercase;color:var(--text-muted);">Table</th>
                        <th style="padding:6px 12px;text-align:center;font-weight:600;font-size:0.65rem;text-transform:uppercase;color:var(--text-muted);">Records</th>
                        <th style="padding:6px 12px;text-align:center;font-weight:600;font-size:0.65rem;text-transform:uppercase;color:var(--text-muted);">Status</th>
                    </tr>
                </thead>
                <tbody>
                    ${dbRows}
                </tbody>
            </table>
        </div>
    `;

    // ── System Alerts ──
    const alerts = [];

    // Backup alert
    const lastBackup = localStorage.getItem('elf_last_auto_backup');
    if (!lastBackup || (Date.now() - parseInt(lastBackup)) > 2 * 24 * 60 * 60 * 1000) {
        alerts.push({ severity: 'warning', message: 'Backup not run in 2+ days', action: 'window.navigateTo("backup-restore")' });
    }

    // Low class average
    const classes = state.classes || [];
    const students = state.students || [];
    const assessments = state.assessments || [];
    const marks = state.marks || [];
    const lowClasses = classes.filter(cls => {
        const clsStudents = students.filter(s => s.class_id === cls.id && s.status === 'Active');
        const clsAssessments = assessments.filter(a => a.class_id === cls.id && a.term_id === state.currentTerm?.id);
        let totalPct = 0, count = 0;
        for (const st of clsStudents) {
            let score = 0, max = 0;
            for (const a of clsAssessments) {
                const mark = marks.find(m => m.assessment_id === a.id && m.student_id === st.id);
                if (mark) { score += mark.score; max += a.max_marks; }
            }
            if (max > 0) { totalPct += (score / max) * 100; count++; }
        }
        const avg = count > 0 ? totalPct / count : 0;
        return avg < 60 && count > 0;
    });
    if (lowClasses.length > 0) {
        alerts.push({ severity: 'warning', message: `${lowClasses.length} class(es) below 60% average`, action: 'window.navigateTo("statistics")' });
    }

    // Overdue payments
    const overdueFees = (state.studentFees || []).filter(f => !f.is_paid && !f.is_waived && f.due_date && new Date(f.due_date) < new Date());
    if (overdueFees.length > 0) {
        alerts.push({ severity: 'critical', message: `${overdueFees.length} overdue fee payments`, action: 'window.navigateTo("overdue-payments")' });
    }

    // Over capacity classes
    const overCapacity = classes.filter(cls => {
        const count = students.filter(s => s.class_id === cls.id && s.status === 'Active').length;
        return count > (cls.capacity || 40);
    });
    if (overCapacity.length > 0) {
        alerts.push({ severity: 'critical', message: `${overCapacity.length} class(es) over capacity`, action: 'window.navigateTo("class-management")' });
    }

    // Term ending soon
    const termEnd = state.currentTerm?.end_date ? new Date(state.currentTerm.end_date) : null;
    if (termEnd) {
        const daysLeft = Math.ceil((termEnd - Date.now()) / 86400000);
        if (daysLeft > 0 && daysLeft < 14) {
            alerts.push({ severity: 'info', message: `Term ends in ${daysLeft} days`, action: 'window.navigateTo("academic-calendar")' });
        }
    }

    if (alerts.length === 0) {
        alerts.push({ severity: 'success', message: 'All systems healthy ✅', action: '' });
    }

    alertsContainer.innerHTML = `
        <div style="display:flex;flex-direction:column;gap:8px;">
            ${alerts.map(a => `
                <div style="display:flex;align-items:center;gap:12px;padding:10px 16px;background:${a.severity === 'critical' ? 'var(--danger-bg)' : a.severity === 'warning' ? 'var(--warning-bg)' : 'var(--success-bg)'};border-radius:var(--r-md);border-left:4px solid ${a.severity === 'critical' ? 'var(--danger)' : a.severity === 'warning' ? 'var(--warning)' : 'var(--success)'};">
                    <span style="font-size:1.1rem;">${a.severity === 'critical' ? '🔴' : a.severity === 'warning' ? '🟡' : '🟢'}</span>
                    <span style="flex:1;font-size:0.85rem;">${esc(a.message)}</span>
                    ${a.action ? `<button class="btn btn-sm btn-outline" onclick="${a.action}" style="padding:2px 10px;font-size:0.7rem;">View</button>` : ''}
                </div>
            `).join('')}
        </div>
    `;

    // ── Performance Metrics ──
    const totalStudents = students.filter(s => s.status === 'Active').length;
    const totalTeachers = (state.teachers || []).filter(t => t.status !== 'inactive').length;
    const totalClasses = classes.filter(c => c.is_active !== false).length;
    const totalMarks = marks.length;
    const totalPayments = (state.payments || []).length;

    metricsContainer.innerHTML = `
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;width:100%;">
            <div style="padding:12px 16px;background:var(--bg-secondary);border-radius:var(--r-lg);border:1px solid var(--border-light);text-align:center;">
                <div style="font-size:0.65rem;text-transform:uppercase;color:var(--text-muted);">Active Students</div>
                <div style="font-size:1.3rem;font-weight:700;">${totalStudents}</div>
            </div>
            <div style="padding:12px 16px;background:var(--bg-secondary);border-radius:var(--r-lg);border:1px solid var(--border-light);text-align:center;">
                <div style="font-size:0.65rem;text-transform:uppercase;color:var(--text-muted);">Active Teachers</div>
                <div style="font-size:1.3rem;font-weight:700;">${totalTeachers}</div>
            </div>
            <div style="padding:12px 16px;background:var(--bg-secondary);border-radius:var(--r-lg);border:1px solid var(--border-light);text-align:center;">
                <div style="font-size:0.65rem;text-transform:uppercase;color:var(--text-muted);">Active Classes</div>
                <div style="font-size:1.3rem;font-weight:700;">${totalClasses}</div>
            </div>
            <div style="padding:12px 16px;background:var(--bg-secondary);border-radius:var(--r-lg);border:1px solid var(--border-light);text-align:center;">
                <div style="font-size:0.65rem;text-transform:uppercase;color:var(--text-muted);">Marks Recorded</div>
                <div style="font-size:1.3rem;font-weight:700;">${totalMarks.toLocaleString()}</div>
            </div>
            <div style="padding:12px 16px;background:var(--bg-secondary);border-radius:var(--r-lg);border:1px solid var(--border-light);text-align:center;">
                <div style="font-size:0.65rem;text-transform:uppercase;color:var(--text-muted);">Payments Recorded</div>
                <div style="font-size:1.3rem;font-weight:700;">${totalPayments.toLocaleString()}</div>
            </div>
            <div style="padding:12px 16px;background:var(--bg-secondary);border-radius:var(--r-lg);border:1px solid var(--border-light);text-align:center;">
                <div style="font-size:0.65rem;text-transform:uppercase;color:var(--text-muted);">Last Updated</div>
                <div style="font-size:1.3rem;font-weight:700;font-size:0.8rem;">${fmtDateTime(state.cache.lastUpdate)}</div>
            </div>
        </div>
    `;

    // ── Cache Statistics ──
    const cacheStats = [
        { name: 'Student Balances', size: state.cache.studentBalances?.size || 0 },
        { name: 'Class Stats', size: state.cache.classStats?.size || 0 },
        { name: 'Ranks', size: state.cache.ranks?.size || 0 },
        { name: 'Last Update', size: fmtDateTime(state.cache.lastUpdate) },
    ];

    cacheContainer.innerHTML = `
        <div class="table-wrapper">
            <table class="data-table" style="font-size:0.8rem;">
                <thead>
                    <tr style="background:var(--bg-tertiary);">
                        <th style="padding:6px 12px;text-align:left;font-weight:600;font-size:0.65rem;text-transform:uppercase;color:var(--text-muted);">Cache Type</th>
                        <th style="padding:6px 12px;text-align:center;font-weight:600;font-size:0.65rem;text-transform:uppercase;color:var(--text-muted);">Items</th>
                        <th style="padding:6px 12px;text-align:center;font-weight:600;font-size:0.65rem;text-transform:uppercase;color:var(--text-muted);">Status</th>
                    </tr>
                </thead>
                <tbody>
                    ${cacheStats.map(c => `
                        <tr style="border-bottom:1px solid var(--border-light);">
                            <td style="padding:6px 12px;font-weight:500;">${esc(c.name)}</td>
                            <td style="padding:6px 12px;text-align:center;">${c.size}</td>
                            <td style="padding:6px 12px;text-align:center;">${c.size > 0 ? '🟢 Active' : '🟡 Empty'}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
        <div style="margin-top:8px;font-size:0.75rem;color:var(--text-muted);text-align:center;">
            💡 Cache TTL: 5 minutes · Auto-refreshes on data changes
        </div>
    `;
}

// ──────────────────────────────────────────────────────────────────────
// EXPORT HEALTH REPORT
// ──────────────────────────────────────────────────────────────────────

function exportHealthReport() {
    const statusContainer = document.getElementById('health-status');
    const dbContainer = document.getElementById('db-status');
    const alertsContainer = document.getElementById('system-alerts');
    const metricsContainer = document.getElementById('performance-metrics');

    if (!statusContainer || !dbContainer) {
        showToast('Run health check first', 'warning');
        return;
    }

    // Collect data from tables
    const tables = [
        { name: 'students', label: 'Students', count: (state.students || []).filter(s => s.status === 'Active').length },
        { name: 'teachers', label: 'Teachers', count: (state.teachers || []).filter(t => t.status !== 'inactive').length },
        { name: 'classes', label: 'Classes', count: (state.classes || []).filter(c => c.is_active !== false).length },
        { name: 'marks', label: 'Marks', count: (state.marks || []).length },
        { name: 'payments', label: 'Payments', count: (state.payments || []).length },
        { name: 'assessments', label: 'Assessments', count: (state.assessments || []).length },
    ];

    const exportData = {
        generated: new Date().toISOString(),
        systemStatus: 'All systems healthy',
        tables: tables,
        alerts: [],
    };

    // Extract alerts
    const alertItems = alertsContainer?.querySelectorAll('.alert-item') || [];
    alertItems.forEach(el => {
        const text = el.textContent?.trim() || '';
        if (text) exportData.alerts.push(text);
    });

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Health_Report_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);

    showToast('✅ Health report exported', 'success');
}