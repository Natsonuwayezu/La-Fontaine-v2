/**
 * ECOLE LA FONTAINE — Analytics Settings
 * Configure analytics preferences, report templates, caching, and year selection
 * Last updated: 2026-07-03
 * 
 * CHANGES:
 * - Added default academic year for analytics
 * - Added year selector for analytics data
 * - Settings now include year-specific preferences
 * - Templates can be year-specific
 * - Cache includes year information
 */

import {
    state,
    getCurrentUser,
    getCurrentAcademicYear,
    getActiveAcademicYearId,
    setYearFilter
} from '../../core/state.js';
import { esc } from '../../core/utils.js';
import { updateSchoolSetting, getSchoolSettings } from '../../core/api.js';

// ──────────────────────────────────────────────────────────────────────
// MAIN RENDER FUNCTION
// ──────────────────────────────────────────────────────────────────────

export async function renderAnalyticsSettings(container) {
    if (!container) return;

    const user = getCurrentUser();
    if (user?.role !== 'admin') {
        container.innerHTML = '<div class="alert alert-danger">Access denied. Admin privileges required.</div>';
        return;
    }

    await ensureStateLoaded();

    const settings = state.schoolSettings || {};
    const currentYear = getCurrentAcademicYear();
    const years = (state.academicYears || []).sort((a, b) => b.id - a.id);
    const selectedYearId = state.filters?.academic_year_id || currentYear?.id;

    container.innerHTML = `
        <div class="dash-card">
            <div class="dash-card-header">
                <span class="dash-card-title">📊 Analytics Settings</span>
                <button class="btn btn-sm btn-success" onclick="window._saveAnalyticsSettings()">💾 Save Settings</button>
            </div>
            <div class="dash-card-body">
                <div class="form-grid">
                    <div class="form-group">
                        <label>Default Academic Year for Analytics</label>
                        <select id="analytics-default-year" class="form-control" onchange="window._onAnalyticsYearChange(this.value)">
                            ${years.map(y => `
                                <option value="${y.id}" ${y.id === selectedYearId ? 'selected' : ''}>
                                    ${esc(y.name)} ${y.id === currentYear?.id ? '🟢' : ''} ${y.is_active ? '✅' : '🔒'}
                                </option>
                            `).join('')}
                            <option value="all" ${selectedYearId === 'all' ? 'selected' : ''}>All Years</option>
                        </select>
                        <small class="field-hint">Select which academic year to show analytics for by default</small>
                    </div>
                    <div class="form-group">
                        <label>Default Analytics Period</label>
                        <select id="analytics-period" class="form-control">
                            <option value="current_term" ${settings.analytics_period === 'current_term' || !settings.analytics_period ? 'selected' : ''}>Current Term</option>
                            <option value="current_year" ${settings.analytics_period === 'current_year' ? 'selected' : ''}>Current Academic Year</option>
                            <option value="selected_year" ${settings.analytics_period === 'selected_year' ? 'selected' : ''}>Selected Academic Year</option>
                            <option value="last_3_years" ${settings.analytics_period === 'last_3_years' ? 'selected' : ''}>Last 3 Years</option>
                            <option value="all" ${settings.analytics_period === 'all' ? 'selected' : ''}>All Time</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Dashboard Charts Refresh Rate (seconds)</label>
                        <input type="number" id="analytics-refresh-rate" value="${settings.analytics_refresh_rate || 60}" min="10" max="3600" class="form-control">
                        <small class="field-hint">How often auto-refresh analytics charts (0 = disabled)</small>
                    </div>
                    <div class="form-group">
                        <label>Default Report Format</label>
                        <select id="analytics-default-format" class="form-control">
                            <option value="pdf" ${settings.analytics_default_format === 'pdf' || !settings.analytics_default_format ? 'selected' : ''}>PDF Document</option>
                            <option value="excel" ${settings.analytics_default_format === 'excel' ? 'selected' : ''}>Excel Spreadsheet</option>
                            <option value="csv" ${settings.analytics_default_format === 'csv' ? 'selected' : ''}>CSV File</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Show Year-over-Year Comparison</label>
                        <select id="analytics-show-comparison" class="form-control">
                            <option value="true" ${settings.analytics_show_comparison !== 'false' ? 'selected' : ''}>Yes</option>
                            <option value="false" ${settings.analytics_show_comparison === 'false' ? 'selected' : ''}>No</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Show Trend Lines on Charts</label>
                        <select id="analytics-show-trend-lines" class="form-control">
                            <option value="true" ${settings.analytics_show_trend_lines !== 'false' ? 'selected' : ''}>Yes</option>
                            <option value="false" ${settings.analytics_show_trend_lines === 'false' ? 'selected' : ''}>No</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Export Date Format</label>
                        <select id="analytics-date-format" class="form-control">
                            <option value="DD/MM/YYYY" ${settings.analytics_date_format === 'DD/MM/YYYY' || !settings.analytics_date_format ? 'selected' : ''}>DD/MM/YYYY</option>
                            <option value="MM/DD/YYYY" ${settings.analytics_date_format === 'MM/DD/YYYY' ? 'selected' : ''}>MM/DD/YYYY</option>
                            <option value="YYYY-MM-DD" ${settings.analytics_date_format === 'YYYY-MM-DD' ? 'selected' : ''}>YYYY-MM-DD</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Analytics Data Retention (days)</label>
                        <input type="number" id="analytics-retention" value="${settings.analytics_retention || 365}" min="30" max="730" class="form-control">
                        <small class="field-hint">How long to keep analytics data before archiving</small>
                    </div>
                    <div class="form-group">
                        <label>Include Archived Students in Analytics</label>
                        <select id="analytics-include-archived" class="form-control">
                            <option value="false" ${settings.analytics_include_archived !== 'true' ? 'selected' : ''}>No</option>
                            <option value="true" ${settings.analytics_include_archived === 'true' ? 'selected' : ''}>Yes</option>
                        </select>
                        <small class="field-hint">Include archived/graduated students in historical analytics</small>
                    </div>
                </div>
            </div>
        </div>

        <div class="dash-card" style="margin-top:20px;">
            <div class="dash-card-header">
                <span class="dash-card-title">📈 Report Templates</span>
                <div class="btn-group">
                    <button class="btn btn-sm btn-outline" onclick="window._exportReportTemplates()">📥 Export Templates</button>
                    <button class="btn btn-sm btn-primary" onclick="window._openUploadTemplateModal()">📤 Upload Custom Template</button>
                </div>
            </div>
            <div class="dash-card-body">
                <div id="report-templates-list">
                    <div class="loading-container"><div class="spinner"></div><p>Loading templates...</p></div>
                </div>
            </div>
        </div>

        <div class="dash-card" style="margin-top:20px;">
            <div class="dash-card-header">
                <span class="dash-card-title">💾 Cached Analytics Data</span>
                <button class="btn btn-sm btn-danger" onclick="window._clearAnalyticsCache()">🗑️ Clear Cache</button>
            </div>
            <div class="dash-card-body">
                <div id="cache-stats" class="alert alert-info">
                    <div><strong>📅 Current Year:</strong> ${esc(currentYear?.name || 'None')}</div>
                    <div><strong>📅 Selected Year:</strong> ${esc(years.find(y => y.id === selectedYearId)?.name || 'All Years')}</div>
                    <div><strong>🔄 Last cache update:</strong> ${localStorage.getItem('analytics_cache_time') ? new Date(localStorage.getItem('analytics_cache_time')).toLocaleString() : 'Never'}</div>
                    <div><strong>📦 Cache size:</strong> ${localStorage.getItem('analytics_cache') ? (JSON.parse(localStorage.getItem('analytics_cache')).length || 0) : 0} items</div>
                    ${selectedYearId !== 'all' ? `<div><strong>📊 Data for:</strong> ${esc(years.find(y => y.id === selectedYearId)?.name || '')}</div>` : ''}
                </div>
            </div>
        </div>
    `;

    window._saveAnalyticsSettings = saveAnalyticsSettings;
    window._exportReportTemplates = exportReportTemplates;
    window._openUploadTemplateModal = openUploadTemplateModal;
    window._clearAnalyticsCache = clearAnalyticsCache;
    window._onAnalyticsYearChange = onAnalyticsYearChange;

    await loadReportTemplates();
}

// ──────────────────────────────────────────────────────────────────────
// ON ANALYTICS YEAR CHANGE
// ──────────────────────────────────────────────────────────────────────

function onAnalyticsYearChange(yearId) {
    // Update the filter in state
    if (yearId === 'all') {
        state.filters.academic_year_id = null;
    } else {
        setYearFilter(parseInt(yearId));
    }

    // Update cache stats
    updateCacheStats(yearId);

    showToast(`📅 Analytics year changed to ${yearId === 'all' ? 'All Years' : state.academicYears.find(y => y.id == yearId)?.name || 'Selected'}`, 'info', 2000);
}

// ──────────────────────────────────────────────────────────────────────
// UPDATE CACHE STATS
// ──────────────────────────────────────────────────────────────────────

function updateCacheStats(yearId) {
    const years = state.academicYears || [];
    const cacheStats = document.getElementById('cache-stats');
    if (!cacheStats) return;

    const yearLabel = yearId === 'all' ? 'All Years' : years.find(y => y.id == yearId)?.name || 'None';
    const cacheSize = localStorage.getItem('analytics_cache') ? (JSON.parse(localStorage.getItem('analytics_cache')).length || 0) : 0;
    const cacheTime = localStorage.getItem('analytics_cache_time');

    cacheStats.innerHTML = `
        <div><strong>📅 Current Year:</strong> ${esc(state.currentAcadYear?.name || 'None')}</div>
        <div><strong>📅 Selected Year:</strong> ${esc(yearLabel)}</div>
        <div><strong>🔄 Last cache update:</strong> ${cacheTime ? new Date(cacheTime).toLocaleString() : 'Never'}</div>
        <div><strong>📦 Cache size:</strong> ${cacheSize} items</div>
        ${yearId !== 'all' ? `<div><strong>📊 Data for:</strong> ${esc(yearLabel)}</div>` : ''}
    `;
}

// ──────────────────────────────────────────────────────────────────────
// SAVE ANALYTICS SETTINGS
// ──────────────────────────────────────────────────────────────────────

async function saveAnalyticsSettings() {
    const defaultYear = document.getElementById('analytics-default-year')?.value;
    const period = document.getElementById('analytics-period')?.value;
    const refreshRate = parseInt(document.getElementById('analytics-refresh-rate')?.value) || 60;
    const defaultFormat = document.getElementById('analytics-default-format')?.value;
    const showComparison = document.getElementById('analytics-show-comparison')?.value === 'true';
    const showTrendLines = document.getElementById('analytics-show-trend-lines')?.value === 'true';
    const dateFormat = document.getElementById('analytics-date-format')?.value;
    const retention = parseInt(document.getElementById('analytics-retention')?.value) || 365;
    const includeArchived = document.getElementById('analytics-include-archived')?.value === 'true';

    // Save default year setting
    if (defaultYear) {
        await updateSchoolSetting('analytics_default_year', defaultYear);
        if (defaultYear !== 'all') {
            setYearFilter(parseInt(defaultYear));
        } else {
            state.filters.academic_year_id = null;
        }
    }

    await updateSchoolSetting('analytics_period', period);
    await updateSchoolSetting('analytics_refresh_rate', String(refreshRate));
    await updateSchoolSetting('analytics_default_format', defaultFormat);
    await updateSchoolSetting('analytics_show_comparison', String(showComparison));
    await updateSchoolSetting('analytics_show_trend_lines', String(showTrendLines));
    await updateSchoolSetting('analytics_date_format', dateFormat);
    await updateSchoolSetting('analytics_retention', String(retention));
    await updateSchoolSetting('analytics_include_archived', String(includeArchived));

    // Update cache stats
    updateCacheStats(defaultYear);

    showToast('✅ Analytics settings saved', 'success');
}

// ──────────────────────────────────────────────────────────────────────
// LOAD REPORT TEMPLATES
// ──────────────────────────────────────────────────────────────────────

async function loadReportTemplates() {
    const container = document.getElementById('report-templates-list');
    if (!container) return;

    const currentYear = getCurrentAcademicYear();

    const templates = [
        { id: 'report_card', name: 'Report Card', desc: 'Standard report card template with grades and comments' },
        { id: 'transcript', name: 'Transcript', desc: 'Academic transcript with all subjects and terms' },
        { id: 'attendance', name: 'Attendance Report', desc: 'Monthly attendance summary report' },
        { id: 'fee_statement', name: 'Fee Statement', desc: 'Fee payment statement with receipt history' },
        { id: 'class_register', name: 'Class Register', desc: 'Complete class register with all formats' },
    ];

    const hasCustom = !!localStorage.getItem('custom_report_template');
    const activeTemplate = localStorage.getItem('report_template') || 'report_card';

    container.innerHTML = `
        <div class="table-wrapper">
            <table class="data-table">
                <thead>
                    <tr>
                        <th>Template</th>
                        <th>Description</th>
                        <th>Status</th>
                        <th>Year</th>
                    </tr>
                </thead>
                <tbody>
                    ${templates.map(t => `
                        <tr>
                            <td><strong>${esc(t.name)}</strong></td>
                            <td>${esc(t.desc)}</td>
                            <td>
                                <span class="badge ${activeTemplate === t.id ? 'badge-success' : 'badge-info'}">
                                    ${activeTemplate === t.id ? '✅ Active' : 'Built-in'}
                                </span>
                            </td>
                            <td>${esc(currentYear?.name || 'All')}</td>
                        </tr>
                    `).join('')}
                    ${hasCustom ? `
                        <tr>
                            <td><strong>Custom Template</strong></td>
                            <td>Uploaded custom report template</td>
                            <td>
                                <span class="badge ${activeTemplate === 'custom' ? 'badge-success' : 'badge-info'}">
                                    ${activeTemplate === 'custom' ? '✅ Active' : 'Uploaded'}
                                </span>
                            </td>
                            <td>${esc(currentYear?.name || 'All')}</td>
                        </tr>
                    ` : ''}
                </tbody>
            </table>
        </div>
    `;
}

// ──────────────────────────────────────────────────────────────────────
// EXPORT REPORT TEMPLATES
// ──────────────────────────────────────────────────────────────────────

function exportReportTemplates() {
    const currentYear = getCurrentAcademicYear();

    const templates = {
        version: '1.0',
        generated: new Date().toISOString(),
        academic_year: currentYear?.name || 'Current Year',
        templates: {
            report_card: 'Standard report card template with grades and comments',
            transcript: 'Academic transcript with all subjects and terms',
            attendance: 'Monthly attendance summary report',
            fee_statement: 'Fee payment statement with receipt history',
            class_register: 'Complete class register with all formats',
        }
    };

    const blob = new Blob([JSON.stringify(templates, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `report_templates_${currentYear?.name || 'Current'}_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);

    showToast('✅ Templates exported', 'success');
}

// ──────────────────────────────────────────────────────────────────────
// UPLOAD TEMPLATE MODAL
// ──────────────────────────────────────────────────────────────────────

function openUploadTemplateModal() {
    const currentYear = getCurrentAcademicYear();

    showModal(`
        <div class="modal-overlay" id="upload-template-modal">
            <div class="modal" style="max-width:500px;">
                <div class="modal-header">
                    <h3>📤 Upload Report Template</h3>
                    <button class="modal-close" onclick="window.closeModal('upload-template-modal')">✕</button>
                </div>
                <div class="modal-body">
                    <div class="form-grid">
                        <div class="form-group full">
                            <label>Template Name *</label>
                            <input type="text" id="template-name" class="form-control" placeholder="e.g., Custom Report Card">
                        </div>
                        <div class="form-group full">
                            <label>Template Type</label>
                            <select id="template-type" class="form-control">
                                <option value="report_card">Report Card</option>
                                <option value="transcript">Transcript</option>
                                <option value="fee_statement">Fee Statement</option>
                                <option value="attendance">Attendance Report</option>
                                <option value="class_register">Class Register</option>
                            </select>
                        </div>
                        <div class="form-group full">
                            <label>Academic Year</label>
                            <input type="text" class="form-control" readonly value="${esc(currentYear?.name || 'Current Year')}">
                            <small class="field-hint">Template will be associated with the current academic year</small>
                        </div>
                        <div class="form-group full">
                            <label>HTML Template File *</label>
                            <input type="file" id="template-file" accept=".html,.htm" class="form-control">
                            <small class="field-hint">Upload an HTML file with the template structure</small>
                        </div>
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-outline" onclick="window.closeModal('upload-template-modal')">Cancel</button>
                    <button class="btn btn-primary" onclick="window._uploadTemplate()">📤 Upload</button>
                </div>
            </div>
        </div>
    `);

    window._uploadTemplate = uploadTemplate;
}

// ──────────────────────────────────────────────────────────────────────
// UPLOAD TEMPLATE
// ──────────────────────────────────────────────────────────────────────

async function uploadTemplate() {
    const name = document.getElementById('template-name')?.value.trim();
    const type = document.getElementById('template-type')?.value;
    const file = document.getElementById('template-file')?.files[0];
    const currentYear = getCurrentAcademicYear();

    if (!name || !file) {
        showToast('Name and file are required', 'warning');
        return;
    }

    try {
        const content = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = e => resolve(e.target.result);
            reader.onerror = reject;
            reader.readAsText(file);
        });

        // Store template with year association
        const templateData = {
            name: name,
            type: type,
            content: content,
            academic_year_id: currentYear?.id || null,
            academic_year_name: currentYear?.name || 'Current Year',
            uploaded_at: new Date().toISOString(),
        };

        localStorage.setItem('custom_report_template', JSON.stringify(templateData));
        localStorage.setItem('report_template', 'custom');
        localStorage.setItem(`template_${type}_name`, name);

        closeModal('upload-template-modal');
        showToast(`✅ Template "${name}" uploaded for ${currentYear?.name || 'Current Year'}`, 'success');
        await loadReportTemplates();
    } catch (error) {
        showToast('Failed to upload template: ' + error.message, 'error');
    }
}

// ──────────────────────────────────────────────────────────────────────
// CLEAR ANALYTICS CACHE
// ──────────────────────────────────────────────────────────────────────

function clearAnalyticsCache() {
    if (!confirm('Clear all cached analytics data? Charts will reload from the database.')) return;

    localStorage.removeItem('analytics_cache');
    localStorage.removeItem('analytics_cache_time');

    const cacheStats = document.getElementById('cache-stats');
    if (cacheStats) {
        const currentYear = getCurrentAcademicYear();
        cacheStats.innerHTML = `
            <div><strong>📅 Current Year:</strong> ${esc(currentYear?.name || 'None')}</div>
            <div><strong>🔄 Cache cleared at:</strong> ${new Date().toLocaleString()}</div>
            <div><strong>📦 Cache size:</strong> 0 items</div>
            <div style="color:var(--success);">✅ Cache cleared. Data will reload on next analytics view.</div>
        `;
    }

    showToast('✅ Analytics cache cleared', 'success');
}

// ──────────────────────────────────────────────────────────────────────
// HELPER FUNCTIONS
// ──────────────────────────────────────────────────────────────────────

function showToast(message, type = 'info', duration = 3500) {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `<span class="toast-icon">${icons[type] || 'ℹ️'}</span><span class="toast-message">${esc(message)}</span>`;
    container.appendChild(toast);
    setTimeout(() => { toast.classList.add('hiding'); setTimeout(() => toast.remove(), 300); }, duration);
}

function showModal(html) {
    const container = document.getElementById('modals-container');
    if (container) container.innerHTML = html;
}

function closeModal(modalId) {
    if (modalId) {
        const modal = document.getElementById(modalId);
        if (modal) modal.remove();
    } else {
        const container = document.getElementById('modals-container');
        if (container) container.innerHTML = '';
    }
}

async function ensureStateLoaded() {
    if (!state.classes.length) {
        const { loadInitialData } = await import('../../core/boot.js');
        await loadInitialData(false);
    }
}

// Export functions to window
window._saveAnalyticsSettings = saveAnalyticsSettings;
window._exportReportTemplates = exportReportTemplates;
window._openUploadTemplateModal = openUploadTemplateModal;
window._clearAnalyticsCache = clearAnalyticsCache;
window._onAnalyticsYearChange = onAnalyticsYearChange;
window._uploadTemplate = uploadTemplate;