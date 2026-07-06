/**
 * ECOLE LA FONTAINE — API Settings
 * Configure Supabase connection, test connection, view database status
 * Last updated: 2026-06-29
 */


import { state, getCurrentUser } from '../../core/state.js';
import { esc } from '../../core/utils.js';
import { SUPABASE_URL, SUPABASE_KEY, SUPABASE_DEFAULT_URL, SUPABASE_DEFAULT_KEY, setSupabaseCredentials, resetSupabaseCredentials } from '../../config/supabase-config.js';

// ──────────────────────────────────────────────────────────────────────
// MAIN RENDER FUNCTION
// ──────────────────────────────────────────────────────────────────────

export async function renderApiSettings(container) {
    if (!container) return;

    const user = getCurrentUser();
    if (user?.role !== 'admin') {
        container.innerHTML = '<div class="alert alert-danger">Access denied. Admin privileges required.</div>';
        return;
    }

    const currentUrl = localStorage.getItem('sb_url') || SUPABASE_URL;
    const currentKey = localStorage.getItem('sb_key') || SUPABASE_KEY;
    const lastTest = localStorage.getItem('last_api_test') || 'Never';

    container.innerHTML = `
        <div class="dash-card">
            <div class="dash-card-header">
                <span class="dash-card-title">🔌 API Settings</span>
            </div>
            <div class="dash-card-body">
                <div class="alert alert-warning">
                    <strong>⚠️ Warning:</strong> Changing API settings will affect all database connections.
                    The page will reload after saving. Make sure you have the correct credentials.
                </div>
                <div class="form-grid">
                    <div class="form-group full">
                        <label>Supabase URL</label>
                        <input type="text" id="api-url" class="form-control" value="${esc(currentUrl)}" placeholder="https://your-project.supabase.co">
                        <small class="field-hint">Your Supabase project URL (e.g., https://xxxxx.supabase.co)</small>
                    </div>
                    <div class="form-group full">
                        <label>Anon Key / Public API Key</label>
                        <div style="display:flex;gap:8px;">
                            <input type="password" id="api-key" class="form-control" value="${esc(currentKey)}" placeholder="eyJhbGciOiJIUzI1NiIs..." style="flex:1;">
                            <button class="btn btn-sm btn-outline" onclick="window._toggleApiKeyVisibility()" type="button">👁️ Show/Hide</button>
                        </div>
                        <small class="field-hint">Your Supabase anon/public key from Project Settings > API</small>
                    </div>
                </div>
                <div class="btn-group" style="margin-top:16px;flex-wrap:wrap;gap:8px;">
                    <button class="btn btn-primary" onclick="window._testApiConnection()">🔌 Test Connection</button>
                    <button class="btn btn-success" onclick="window._saveApiSettings()">💾 Save Settings</button>
                    <button class="btn btn-outline" onclick="window._resetApiSettings()">🔄 Reset to Default</button>
                    <button class="btn btn-outline" onclick="window._showDatabaseSummary()">📊 Database Summary</button>
                </div>
                <div id="api-connection-status" style="margin-top:20px;display:none;"></div>
            </div>
        </div>

        <div class="dash-card" style="margin-top:20px;">
            <div class="dash-card-header">
                <span class="dash-card-title">🗄️ Database Information</span>
            </div>
            <div class="dash-card-body">
                <div class="form-grid">
                    <div class="form-group">
                        <label>Current Environment</label>
                        <input readonly value="${window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' ? 'Development' : 'Production'}" class="form-control">
                    </div>
                    <div class="form-group">
                        <label>API Version</label>
                        <input readonly value="v1 (REST)" class="form-control">
                    </div>
                    <div class="form-group">
                        <label>Last Connection Test</label>
                        <input readonly id="last-connection-test" value="${lastTest}" class="form-control">
                    </div>
                    <div class="form-group">
                        <label>Default URL</label>
                        <input readonly value="${SUPABASE_DEFAULT_URL}" class="form-control">
                    </div>
                </div>
            </div>
        </div>
    `;

    window._saveApiSettings = saveApiSettings;
    window._resetApiSettings = resetApiSettings;
    window._testApiConnection = testApiConnection;
    window._toggleApiKeyVisibility = toggleApiKeyVisibility;
    window._showDatabaseSummary = showDatabaseSummary;
}

// ──────────────────────────────────────────────────────────────────────
// SAVE API SETTINGS
// ──────────────────────────────────────────────────────────────────────

function saveApiSettings() {
    const url = document.getElementById('api-url')?.value.trim();
    const key = document.getElementById('api-key')?.value.trim();

    if (!url || !key) {
        showToast('Both URL and API Key are required', 'warning');
        return;
    }

    if (!url.startsWith('https://')) {
        showToast('URL must start with https://', 'warning');
        return;
    }

    setSupabaseCredentials(url, key);
    showToast('✅ API settings saved. Reloading page to apply...', 'success', 3000);

    setTimeout(() => {
        location.reload();
    }, 2000);
}

// ──────────────────────────────────────────────────────────────────────
// RESET API SETTINGS
// ──────────────────────────────────────────────────────────────────────

function resetApiSettings() {
    if (!confirm('Reset API settings to defaults? The page will reload.')) return;

    resetSupabaseCredentials();
    document.getElementById('api-url').value = SUPABASE_DEFAULT_URL;
    document.getElementById('api-key').value = SUPABASE_DEFAULT_KEY;

    showToast('✅ API settings reset. Reloading...', 'success', 2000);
    setTimeout(() => location.reload(), 1500);
}

// ──────────────────────────────────────────────────────────────────────
// TEST API CONNECTION
// ──────────────────────────────────────────────────────────────────────

async function testApiConnection() {
    const statusDiv = document.getElementById('api-connection-status');
    if (!statusDiv) return;

    statusDiv.style.display = 'block';
    statusDiv.innerHTML = '<div class="loading-container" style="padding:20px;"><div class="spinner"></div><p>Testing connection...</p></div>';

    try {
        const url = document.getElementById('api-url')?.value.trim() || SUPABASE_URL;
        const key = document.getElementById('api-key')?.value.trim() || SUPABASE_KEY;

        // Test by fetching a single record
        const response = await fetch(`${url}/rest/v1/students?limit=1`, {
            headers: {
                'apikey': key,
                'Authorization': `Bearer ${key}`,
            },
        });

        if (response.ok) {
            const data = await response.json();
            localStorage.setItem('last_api_test', new Date().toLocaleString());
            document.getElementById('last-connection-test').value = new Date().toLocaleString();

            statusDiv.innerHTML = `
                <div class="alert alert-success">
                    ✅ Connection successful! API is working.<br>
                    Response time: ${response.headers.get('x-response-time') || 'N/A'}ms<br>
                    Records available: ${Array.isArray(data) ? data.length : 'N/A'}
                </div>
            `;
            showToast('✅ API connection successful', 'success');
        } else {
            statusDiv.innerHTML = `
                <div class="alert alert-danger">
                    ❌ Connection failed: HTTP ${response.status}<br>
                    ${response.statusText || 'Unknown error'}
                </div>
            `;
            showToast('❌ API connection failed', 'error');
        }
    } catch (error) {
        statusDiv.innerHTML = `
            <div class="alert alert-danger">
                ❌ Connection error: ${esc(error.message)}<br>
                Please check your internet connection and API settings.
            </div>
        `;
        showToast('❌ API connection error', 'error');
    }
}

// ──────────────────────────────────────────────────────────────────────
// TOGGLE API KEY VISIBILITY
// ──────────────────────────────────────────────────────────────────────

function toggleApiKeyVisibility() {
    const el = document.getElementById('api-key');
    if (!el) return;

    el.type = el.type === 'password' ? 'text' : 'password';
    const btn = el.parentElement.querySelector('.btn-outline');
    if (btn) btn.textContent = el.type === 'password' ? '👁️ Show' : '🙈 Hide';
}

// ──────────────────────────────────────────────────────────────────────
// SHOW DATABASE SUMMARY
// ──────────────────────────────────────────────────────────────────────

function showDatabaseSummary() {
    const tables = [
        { name: 'students', label: 'Students', count: (state.students || []).length },
        { name: 'teachers', label: 'Teachers', count: (state.teachers || []).length },
        { name: 'classes', label: 'Classes', count: (state.classes || []).length },
        { name: 'subjects', label: 'Subjects', count: (state.subjects || []).length },
        { name: 'terms', label: 'Terms', count: (state.terms || []).length },
        { name: 'academic_years', label: 'Academic Years', count: (state.academicYears || []).length },
        { name: 'marks', label: 'Marks', count: (state.marks || []).length },
        { name: 'assessments', label: 'Assessments', count: (state.assessments || []).length },
        { name: 'payments', label: 'Payments', count: (state.payments || []).length },
        { name: 'student_fees', label: 'Student Fees', count: (state.studentFees || []).length },
        { name: 'fee_categories', label: 'Fee Categories', count: (state.feeCategories || []).length },
    ];

    const total = tables.reduce((sum, t) => sum + t.count, 0);

    showModal(`
        <div class="modal-overlay" id="db-summary-modal">
            <div class="modal" style="max-width:550px;">
                <div class="modal-header">
                    <h3>🗄️ Database Summary</h3>
                    <button class="modal-close" onclick="window.closeModal('db-summary-modal')">✕</button>
                </div>
                <div class="modal-body">
                    <div class="table-wrapper">
                        <table class="data-table">
                            <thead>
                                <tr>
                                    <th>Table</th>
                                    <th style="text-align:right;">Records</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${tables.map(t => `
                                    <tr>
                                        <td><code>${esc(t.name)}</code></td>
                                        <td style="text-align:right;font-weight:600;">${t.count.toLocaleString()}</td>
                                    </tr>
                                `).join('')}
                                <tr style="background:var(--bg-tertiary);font-weight:700;">
                                    <td>TOTAL</td>
                                    <td style="text-align:right;">${total.toLocaleString()}</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                    <div style="margin-top:12px;font-size:0.8rem;color:var(--text-muted);text-align:center;">
                        Last updated: ${fmtDateTime(state.cache.lastUpdate)}
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-outline" onclick="window.closeModal('db-summary-modal')">Close</button>
                </div>
            </div>
        </div>
    `);
}