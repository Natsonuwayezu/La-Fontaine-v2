/**
 * ECOLE LA FONTAINE — Fee Structure Module
 * Manage fee categories, class-specific amounts, and fee assignments
 * Last updated: 2026-07-04
 * 
 * FEATURES:
 * - CRUD for fee categories
 * - Class-specific fee amounts per academic year
 * - Copy fee structure from previous year/term
 * - Preview before copying
 * - Selective copying (categories, amounts, assignments)
 * - Academic year filtering
 */


const state = window.state || {}; // global state alias
import {
    state,
    getClassById,
    getCurrentUser,
    isAdmin,
    isAccountant,
    getCurrentAcademicYear,
    getTermsByYear
} from '../../core/state.js';
import { esc, fmtCurrency, fmtDate } from '../../core/utils.js';
import { insert, update, remove, getAll } from '../../core/api.js';
import { notifyAction } from '../../core/notifications.js';
import { exportToExcel } from '../../core/utils.js';

// ──────────────────────────────────────────────────────────────────────
// STATE
// ──────────────────────────────────────────────────────────────────────

let selectedYearId = null;
let copyPreviewData = null;

// ──────────────────────────────────────────────────────────────────────
// MAIN RENDER FUNCTION
// ──────────────────────────────────────────────────────────────────────

export async function renderFeeStructure(container) {
    if (!container) return;

    const user = getCurrentUser();
    if (!isAdmin() && !isAccountant()) {
        container.innerHTML = '<div class="alert alert-danger">Access denied.</div>';
        return;
    }

    await ensureStateLoaded();

    const feeCategories = state.feeCategories || [];
    const feeAmounts = state.feeAmounts || [];
    const classes = state.classes || [];
    const academicYears = state.academicYears || [];
    const currentYear = getCurrentAcademicYear();

    // Default to current year
    if (!selectedYearId) {
        selectedYearId = currentYear?.id || null;
    }

    const selectedYear = academicYears.find(y => y.id === selectedYearId);
    const isActiveYear = selectedYear?.is_active === true;
    const isCurrentYear = selectedYear?.id === currentYear?.id;

    container.innerHTML = `
        <div class="dash-card">
            <div class="dash-card-header" style="flex-wrap:wrap;gap:8px;">
                <span class="dash-card-title">🏷️ Fee Structure</span>
                <div class="btn-group" style="flex-wrap:wrap;gap:6px;">
                    <select id="fs-year-filter" onchange="window._loadFeeStructureData()" style="padding:6px 10px;border-radius:6px;border:1px solid var(--border-medium);font-size:0.8rem;">
                        ${academicYears.map(y => `
                            <option value="${y.id}" ${y.id === selectedYearId ? 'selected' : ''}>
                                ${esc(y.name)} ${y.id === currentYear?.id ? '🟢' : ''}
                            </option>
                        `).join('')}
                    </select>
                    <button class="btn btn-sm btn-primary" onclick="window._openAddCategory()">➕ Add Category</button>
                    <button class="btn btn-sm btn-success" onclick="window._openCopyModal()">📋 Copy from Previous</button>
                    <button class="btn btn-sm btn-outline" onclick="window._refreshFeeStructure()">🔄 Refresh</button>
                    <button class="btn btn-sm btn-outline" onclick="window._exportFeeStructure()">📥 Export</button>
                    ${!isActiveYear ? '<span class="badge badge-neutral" style="font-size:0.65rem;">🔒 Read-only</span>' : ''}
                </div>
            </div>
            <div class="dash-card-body" style="padding:0;">
                <div style="font-size:0.75rem;color:var(--text-muted);padding:6px 16px;background:var(--bg-tertiary);border-bottom:1px solid var(--border-light);display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px;">
                    <span>📅 ${selectedYear?.name || 'All Years'} ${isActiveYear ? '🟢 Active' : '🔒 Inactive (Read-Only)'}</span>
                    <span>${isCurrentYear ? '✅ Current Year' : ''}</span>
                    <span>📊 ${feeCategories.length} categories · ${feeAmounts.length} class overrides</span>
                </div>

                <!-- Tabs -->
                <div class="tabs" style="display:flex;gap:2px;border-bottom:2px solid var(--border-light);padding:0 16px;">
                    <button class="tab-btn active" onclick="window._switchFeeTab('categories', event)">📋 Categories</button>
                    <button class="tab-btn" onclick="window._switchFeeTab('amounts', event)">💰 Class Amounts</button>
                    <button class="tab-btn" onclick="window._switchFeeTab('copy', event)">📋 Copy from Previous</button>
                </div>

                <!-- Categories Tab -->
                <div id="fee-categories-tab" style="padding:16px;">
                    <div class="table-wrapper">
                        <table class="data-table" style="font-size:0.8rem;">
                            <thead>
                                <tr>
                                    <th>Category</th>
                                    <th>Type</th>
                                    <th>Default Amount</th>
                                    <th>Frequency</th>
                                    <th>Status</th>
                                    <th style="text-align:center;">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${feeCategories.length ? feeCategories.map(c => `
                                    <tr>
                                        <td><strong>${esc(c.name)}</strong><br><small style="color:var(--text-muted);">${esc(c.description || '')}</small></td>
                                        <td><span class="badge badge-neutral">${esc(c.fee_type || 'standard')}</span></td>
                                        <td style="font-weight:600;">${fmtCurrency(c.amount || 0)}</td>
                                        <td><span class="badge badge-info">${esc(c.reset_frequency || 'termly')}</span></td>
                                        <td><span class="badge ${c.is_active !== false ? 'badge-success' : 'badge-neutral'}">${c.is_active !== false ? 'Active' : 'Inactive'}</span></td>
                                        <td style="text-align:center;">
                                            <button class="btn btn-sm btn-outline" onclick="window._editCategory(${c.id})" style="padding:2px 6px;font-size:0.7rem;">✏️</button>
                                            <button class="btn btn-sm btn-danger" onclick="window._deleteCategory(${c.id})" style="padding:2px 6px;font-size:0.7rem;">🗑️</button>
                                        </td>
                                    </tr>
                                `).join('') : '<tr><td colspan="6" style="text-align:center;padding:40px;color:var(--text-muted);">No fee categories found</td></tr>'}
                            </tbody>
                        </table>
                    </div>
                </div>

                <!-- Amounts Tab -->
                <div id="fee-amounts-tab" style="display:none;padding:16px;">
                    <div class="filters-bar" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px;margin-bottom:16px;">
                        <div class="form-group" style="margin:0;">
                            <label style="font-size:0.7rem;">Academic Year</label>
                            <select id="fa-year" onchange="window._loadFeeAmounts()" style="padding:6px 10px;border-radius:6px;border:1px solid var(--border-medium);width:100%;">
                                ${academicYears.map(y => `<option value="${y.id}" ${y.id === selectedYearId ? 'selected' : ''}>${esc(y.name)}</option>`).join('')}
                            </select>
                        </div>
                        <div class="form-group" style="margin:0;">
                            <label style="font-size:0.7rem;">Class</label>
                            <select id="fa-class" onchange="window._loadFeeAmounts()" style="padding:6px 10px;border-radius:6px;border:1px solid var(--border-medium);width:100%;">
                                <option value="">All Classes</option>
                                ${classes.filter(c => c.is_active !== false).map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}
                            </select>
                        </div>
                        <div class="form-group" style="margin:0;">
                            <label style="font-size:0.7rem;">Category</label>
                            <select id="fa-category" onchange="window._loadFeeAmounts()" style="padding:6px 10px;border-radius:6px;border:1px solid var(--border-medium);width:100%;">
                                <option value="">All Categories</option>
                                ${feeCategories.filter(c => c.is_active !== false).map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}
                            </select>
                        </div>
                        <div style="display:flex;align-items:flex-end;gap:8px;">
                            <button class="btn btn-sm btn-primary" onclick="window._openAddAmount()" style="padding:4px 12px;">➕ Add Amount</button>
                            <button class="btn btn-sm btn-outline" onclick="window._loadFeeAmounts()" style="padding:4px 12px;">🔄 Refresh</button>
                        </div>
                    </div>
                    <div id="fee-amounts-list">
                        <div class="loading-container"><div class="spinner"></div><p>Loading fee amounts...</p></div>
                    </div>
                </div>

                <!-- Copy Tab -->
                <div id="fee-copy-tab" style="display:none;padding:16px;">
                    <div class="alert alert-info" style="font-size:0.85rem;">
                        <strong>📋 Copy Fee Structure from Previous Year or Term</strong><br>
                        This will copy fee categories, class amounts, and assignments from the selected source to the current year/term.
                        You can preview what will be copied before confirming.
                    </div>
                    <div class="form-grid" style="margin-bottom:16px;">
                        <div class="form-group">
                            <label>Source Type</label>
                            <select id="copy-source-type" onchange="window._toggleCopyOptions()" style="padding:8px 12px;border-radius:6px;border:1px solid var(--border-medium);width:100%;">
                                <option value="year">Previous Academic Year</option>
                                <option value="term">Previous Term</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label>Source Year</label>
                            <select id="copy-source-year" style="padding:8px 12px;border-radius:6px;border:1px solid var(--border-medium);width:100%;">
                                ${academicYears.filter(y => y.id !== selectedYearId).map(y => `
                                    <option value="${y.id}">${esc(y.name)}</option>
                                `).join('')}
                            </select>
                        </div>
                        <div class="form-group" id="copy-source-term-group" style="display:none;">
                            <label>Source Term</label>
                            <select id="copy-source-term" style="padding:8px 12px;border-radius:6px;border:1px solid var(--border-medium);width:100%;">
                                <option value="">All Terms</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label>What to Copy</label>
                            <select id="copy-what" style="padding:8px 12px;border-radius:6px;border:1px solid var(--border-medium);width:100%;">
                                <option value="all">All Categories & Amounts</option>
                                <option value="categories">Categories Only</option>
                                <option value="amounts">Class Amounts Only</option>
                                <option value="assignments">Student Fee Assignments Only</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label>Target Year</label>
                            <select id="copy-target-year" style="padding:8px 12px;border-radius:6px;border:1px solid var(--border-medium);width:100%;">
                                ${academicYears.map(y => `
                                    <option value="${y.id}" ${y.id === selectedYearId ? 'selected' : ''}>
                                        ${esc(y.name)} ${y.id === selectedYearId ? '🟢' : ''}
                                    </option>
                                `).join('')}
                            </select>
                        </div>
                    </div>
                    <div class="btn-group" style="margin-bottom:16px;">
                        <button class="btn btn-primary" onclick="window._previewCopy()">👁️ Preview Copy</button>
                        <button class="btn btn-success" onclick="window._executeCopy()" id="copy-execute-btn" style="display:none;">✅ Execute Copy</button>
                        <button class="btn btn-outline" onclick="window._clearCopyPreview()">🗑️ Clear Preview</button>
                    </div>
                    <div id="copy-preview-container" style="display:none;">
                        <div id="copy-preview-content"></div>
                    </div>
                </div>
            </div>
        </div>
    `;

    // Register global functions
    window._switchFeeTab = switchFeeTab;
    window._openAddCategory = openAddCategory;
    window._editCategory = editCategory;
    window._deleteCategory = deleteCategory;
    window._openAddAmount = openAddAmount;
    window._loadFeeAmounts = loadFeeAmounts;
    window._refreshFeeStructure = refreshFeeStructure;
    window._exportFeeStructure = exportFeeStructure;
    window._saveCategory = saveCategory;
    window._saveAmount = saveAmount;
    window._deleteAmount = deleteAmount;
    window._loadFeeStructureData = loadFeeStructureData;
    window._openCopyModal = openCopyModal;
    window._toggleCopyOptions = toggleCopyOptions;
    window._previewCopy = previewCopy;
    window._executeCopy = executeCopy;
    window._clearCopyPreview = clearCopyPreview;

    // Load initial amounts
    await loadFeeAmounts();
}

// ──────────────────────────────────────────────────────────────────────
// HELPER FUNCTIONS (Shared)
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

function confirmDialog(message) {
    return new Promise((resolve) => {
        const modalId = `confirm-modal-${Date.now()}`;
        const html = `
            <div class="modal-overlay" id="${modalId}">
                <div class="modal modal-sm">
                    <div class="modal-header"><h3>⚠️ Confirm</h3><button class="modal-close" onclick="window.closeModal('${modalId}')">✕</button></div>
                    <div class="modal-body"><p>${esc(message)}</p></div>
                    <div class="modal-footer">
                        <button class="btn btn-outline" onclick="window.closeModal('${modalId}'); window._confirmResolve(false)">Cancel</button>
                        <button class="btn btn-danger" onclick="window.closeModal('${modalId}'); window._confirmResolve(true)">Confirm</button>
                    </div>
                </div>
            </div>
        `;
        showModal(html);
        window._confirmResolve = resolve;
    });
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
    if (!state.classes || !state.classes.length) {
        const fn = window.loadInitialData || (async () => {});
        await fn(false);
    }
}

async function refreshTable(table) {
    const getAll = window.getAll || (async () => []);
    if (table === 'fee_categories') {
        state.feeCategories = await getAll('fee_categories');
    } else if (table === 'fee_amounts') {
        state.feeAmounts = await getAll('fee_amounts');
    } else if (table === 'student_fees') {
        state.studentFees = await getAll('student_fees');
    }
}

// ──────────────────────────────────────────────────────────────────────
// YEAR FILTER HANDLER
// ──────────────────────────────────────────────────────────────────────

async function loadFeeStructureData() {
    const yearId = document.getElementById('fs-year-filter')?.value;
    if (yearId) {
        selectedYearId = parseInt(yearId);
        renderFeeStructure(document.getElementById('dynamic-content'));
    }
}

// ──────────────────────────────────────────────────────────────────────
// TAB SWITCHING
// ──────────────────────────────────────────────────────────────────────

function switchFeeTab(tabName, event) {
    ['categories', 'amounts', 'copy'].forEach(t => {
        const el = document.getElementById(`fee-${t}-tab`);
        if (el) el.style.display = t === tabName ? 'block' : 'none';
    });
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    if (event?.target) event.target.classList.add('active');
}

// ──────────────────────────────────────────────────────────────────────
// COPY MODAL FUNCTIONS
// ──────────────────────────────────────────────────────────────────────

function openCopyModal() {
    // Switch to copy tab
    const copyTab = document.querySelector('[onclick*="copy"]');
    if (copyTab) {
        const event = { target: copyTab };
        switchFeeTab('copy', event);
    }
    loadSourceTerms();
}

function toggleCopyOptions() {
    const sourceType = document.getElementById('copy-source-type')?.value;
    const termGroup = document.getElementById('copy-source-term-group');
    if (termGroup) {
        termGroup.style.display = sourceType === 'term' ? 'block' : 'none';
    }
    if (sourceType === 'term') {
        loadSourceTerms();
    }
}

function loadSourceTerms() {
    const yearId = document.getElementById('copy-source-year')?.value;
    const termSelect = document.getElementById('copy-source-term');
    if (!termSelect || !yearId) return;

    const terms = getTermsByYear(parseInt(yearId));
    termSelect.innerHTML = '<option value="">All Terms</option>' +
        terms.map(t => `<option value="${t.id}">${esc(t.name)}</option>`).join('');
}

async function previewCopy() {
    const sourceYearId = document.getElementById('copy-source-year')?.value;
    const sourceTermId = document.getElementById('copy-source-term')?.value;
    const sourceType = document.getElementById('copy-source-type')?.value;
    const copyWhat = document.getElementById('copy-what')?.value;
    const targetYearId = document.getElementById('copy-target-year')?.value;

    if (!sourceYearId || !targetYearId) {
        showToast('Please select source and target years', 'warning');
        return;
    }

    const container = document.getElementById('copy-preview-container');
    const content = document.getElementById('copy-preview-content');
    const executeBtn = document.getElementById('copy-execute-btn');

    container.style.display = 'block';
    content.innerHTML = '<div class="loading-container"><div class="spinner"></div><p>Loading preview...</p></div>';

    try {
        const sourceYear = state.academicYears.find(y => y.id == sourceYearId);
        const targetYear = state.academicYears.find(y => y.id == targetYearId);

        let sourceData = { categories: [], amounts: [], assignments: [] };

        // Get source data
        if (copyWhat === 'all' || copyWhat === 'categories' || copyWhat === 'assignments') {
            sourceData.categories = state.feeCategories.filter(c => c.is_active !== false);
        }

        if (copyWhat === 'all' || copyWhat === 'amounts' || copyWhat === 'assignments') {
            let amounts = state.feeAmounts.filter(fa => fa.academic_year_id == sourceYearId);
            if (sourceType === 'term' && sourceTermId) {
                amounts = amounts.filter(fa => fa.term_id == sourceTermId);
            }
            sourceData.amounts = amounts;
        }

        if (copyWhat === 'all' || copyWhat === 'assignments') {
            let assignments = state.studentFees.filter(f => f.academic_year_id == sourceYearId);
            if (sourceType === 'term' && sourceTermId) {
                assignments = assignments.filter(f => f.term_id == sourceTermId);
            }
            sourceData.assignments = assignments;
        }

        // Build preview HTML
        let previewHtml = `
            <div class="alert alert-info">
                <strong>📋 Copy Preview</strong><br>
                Source: ${esc(sourceYear?.name || 'Unknown')}${sourceType === 'term' && sourceTermId ? ' - ' + esc(state.terms.find(t => t.id == sourceTermId)?.name || '') : ''}<br>
                Target: ${esc(targetYear?.name || 'Unknown')}<br>
                Copying: ${copyWhat === 'all' ? 'All (Categories, Amounts, Assignments)' : copyWhat}
            </div>
        `;

        let stats = [];

        if (sourceData.categories.length) {
            stats.push(`${sourceData.categories.length} categories`);
        }
        if (sourceData.amounts.length) {
            stats.push(`${sourceData.amounts.length} class fee amounts`);
        }
        if (sourceData.assignments.length) {
            stats.push(`${sourceData.assignments.length} student fee assignments`);
        }

        previewHtml += `
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-bottom:16px;">
                <div class="stat-card" style="padding:12px;text-align:center;">
                    <div class="stat-value">${sourceData.categories.length}</div>
                    <div class="stat-label">Categories</div>
                </div>
                <div class="stat-card" style="padding:12px;text-align:center;">
                    <div class="stat-value">${sourceData.amounts.length}</div>
                    <div class="stat-label">Class Amounts</div>
                </div>
                <div class="stat-card" style="padding:12px;text-align:center;">
                    <div class="stat-value">${sourceData.assignments.length}</div>
                    <div class="stat-label">Student Assignments</div>
                </div>
            </div>
        `;

        // Show sample of what will be copied
        if (sourceData.amounts.length) {
            const sampleAmounts = sourceData.amounts.slice(0, 5);
            previewHtml += `
                <div style="margin-bottom:12px;">
                    <strong>Sample Class Amounts:</strong>
                    <div class="table-wrapper">
                        <table class="data-table" style="font-size:0.75rem;">
                            <thead>
                                <tr>
                                    <th>Category</th>
                                    <th>Class</th>
                                    <th style="text-align:right;">Amount</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${sampleAmounts.map(fa => {
                const cat = state.feeCategories.find(c => c.id === fa.fee_category_id);
                const cls = getClassById(fa.class_id);
                return `
                                        <tr>
                                            <td>${esc(cat?.name || '—')}</td>
                                            <td>${esc(cls?.name || '—')}</td>
                                            <td style="text-align:right;">${fmtCurrency(fa.amount || 0)}</td>
                                        </tr>
                                    `;
            }).join('')}
                                ${sourceData.amounts.length > 5 ? `<tr><td colspan="3" style="text-align:center;color:var(--text-muted);">... and ${sourceData.amounts.length - 5} more</td></tr>` : ''}
                            </tbody>
                        </table>
                    </div>
                </div>
            `;
        }

        // Show warnings
        let warnings = [];
        const existingTargetAmounts = state.feeAmounts.filter(fa => fa.academic_year_id == targetYearId);

        if (existingTargetAmounts.length > 0 && (copyWhat === 'all' || copyWhat === 'amounts' || copyWhat === 'assignments')) {
            warnings.push(`⚠️ ${existingTargetAmounts.length} fee amounts already exist in target year. They will be overwritten.`);
        }

        const existingTargetCategories = state.feeCategories.filter(c => sourceData.categories.some(sc => sc.name === c.name));
        if (existingTargetCategories.length > 0 && (copyWhat === 'all' || copyWhat === 'categories')) {
            warnings.push(`⚠️ ${existingTargetCategories.length} categories with same name already exist. They will be updated.`);
        }

        if (warnings.length) {
            previewHtml += `
                <div class="alert alert-warning" style="margin-bottom:12px;">
                    ${warnings.map(w => `<div>${w}</div>`).join('')}
                </div>
            `;
        }

        // Store preview data for execution
        copyPreviewData = {
            sourceYearId: parseInt(sourceYearId),
            sourceTermId: sourceTermId ? parseInt(sourceTermId) : null,
            sourceType: sourceType,
            copyWhat: copyWhat,
            targetYearId: parseInt(targetYearId),
            data: sourceData,
            warnings: warnings,
        };

        content.innerHTML = previewHtml;
        executeBtn.style.display = 'inline-flex';

        showToast(`✅ Preview ready — ${stats.join(', ')} found`, 'success');

    } catch (error) {
        console.error('[Fee Copy Preview]', error);
        content.innerHTML = `<div class="alert alert-danger">Failed to load preview: ${error.message}</div>`;
    }
}

async function executeCopy() {
    if (!copyPreviewData) {
        showToast('Please preview first', 'warning');
        return;
    }

    const { sourceYearId, sourceTermId, sourceType, copyWhat, targetYearId, data, warnings } = copyPreviewData;

    const targetYear = state.academicYears.find(y => y.id == targetYearId);
    if (!targetYear || !targetYear.is_active) {
        showToast('Target year is not active. Please activate it first.', 'warning');
        return;
    }

    const totalItems = data.categories.length + data.amounts.length + data.assignments.length;
    if (!totalItems) {
        showToast('Nothing to copy', 'warning');
        return;
    }

    if (!await confirmDialog(
        `⚠️ Confirm Copy\n\n` +
        `This will copy:\n` +
        `• ${data.categories.length} categories\n` +
        `• ${data.amounts.length} class fee amounts\n` +
        `• ${data.assignments.length} student fee assignments\n\n` +
        `From: ${state.academicYears.find(y => y.id == sourceYearId)?.name || 'Unknown'}\n` +
        `To: ${targetYear?.name || 'Unknown'}\n\n` +
        `${warnings.length ? '⚠️ ' + warnings.join('\n') + '\n\n' : ''}` +
        `Proceed?`
    )) return;

    const btn = document.getElementById('copy-execute-btn');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-sm"></span> Copying...';

    let copied = { categories: 0, amounts: 0, assignments: 0 };

    try {
        // 1. Copy Categories
        if (copyWhat === 'all' || copyWhat === 'categories') {
            for (const cat of data.categories) {
                const existing = state.feeCategories.find(c => c.name === cat.name && c.is_active !== false);
                if (existing) {
                    await update('fee_categories', existing.id, {
                        description: cat.description || '',
                        fee_type: cat.fee_type || 'standard',
                        reset_frequency: cat.reset_frequency || 'termly',
                        amount: cat.amount || 0,
                        is_active: true,
                        updated_at: new Date().toISOString(),
                    });
                    // Update local state
                    const idx = state.feeCategories.findIndex(c => c.id === existing.id);
                    if (idx !== -1) {
                        state.feeCategories[idx] = { ...state.feeCategories[idx], ...cat, is_active: true };
                    }
                } else {
                    const result = await insert('fee_categories', {
                        name: cat.name,
                        description: cat.description || '',
                        fee_type: cat.fee_type || 'standard',
                        reset_frequency: cat.reset_frequency || 'termly',
                        amount: cat.amount || 0,
                        is_active: true,
                        created_at: new Date().toISOString(),
                    });
                    if (result) {
                        state.feeCategories.push(result);
                    }
                }
                copied.categories++;
            }
        }

        // 2. Copy Class Amounts
        if (copyWhat === 'all' || copyWhat === 'amounts' || copyWhat === 'assignments') {
            for (const fa of data.amounts) {
                const existing = state.feeAmounts.find(f =>
                    f.fee_category_id === fa.fee_category_id &&
                    f.class_id === fa.class_id &&
                    f.academic_year_id === targetYearId
                );

                if (existing) {
                    await update('fee_amounts', existing.id, {
                        amount: fa.amount,
                        updated_at: new Date().toISOString(),
                    });
                    const idx = state.feeAmounts.findIndex(f => f.id === existing.id);
                    if (idx !== -1) {
                        state.feeAmounts[idx].amount = fa.amount;
                    }
                } else {
                    const result = await insert('fee_amounts', {
                        fee_category_id: fa.fee_category_id,
                        class_id: fa.class_id,
                        academic_year_id: targetYearId,
                        amount: fa.amount,
                        created_at: new Date().toISOString(),
                    });
                    if (result) {
                        state.feeAmounts.push(result);
                    }
                }
                copied.amounts++;
            }
        }

        // 3. Copy Student Fee Assignments
        if (copyWhat === 'all' || copyWhat === 'assignments') {
            const targetStudents = state.students.filter(s => s.status === 'Active' && s.academic_year_id === targetYearId);
            const targetStudentIds = new Set(targetStudents.map(s => s.id));

            for (const assignment of data.assignments) {
                if (!targetStudentIds.has(assignment.student_id)) continue;

                const existing = state.studentFees.find(f =>
                    f.student_id === assignment.student_id &&
                    f.fee_category_id === assignment.fee_category_id &&
                    f.academic_year_id === targetYearId
                );

                if (!existing) {
                    await insert('student_fees', {
                        student_id: assignment.student_id,
                        fee_category_id: assignment.fee_category_id,
                        term_id: assignment.term_id,
                        academic_year_id: targetYearId,
                        amount: assignment.amount,
                        paid_amount: 0,
                        is_paid: false,
                        is_waived: false,
                        due_date: assignment.due_date || null,
                        created_at: new Date().toISOString(),
                    });
                    copied.assignments++;
                }
            }
        }

        // Log and notify
        await notifyAction('fee_structure_copied', {
            message: `Copied fee structure from ${state.academicYears.find(y => y.id == sourceYearId)?.name || 'Unknown'} to ${targetYear?.name || 'Unknown'}: ${copied.categories} categories, ${copied.amounts} amounts, ${copied.assignments} assignments`,
            entity_type: 'fee_structure',
        }, ['admin', 'accountant']);

        showToast(`✅ Copied: ${copied.categories} categories, ${copied.amounts} amounts, ${copied.assignments} assignments`, 'success');

        // Refresh data
        await refreshTable('fee_categories');
        await refreshTable('fee_amounts');
        await refreshTable('student_fees');

        // Close preview
        clearCopyPreview();

        // Re-render
        renderFeeStructure(document.getElementById('dynamic-content'));

    } catch (error) {
        console.error('[Fee Copy]', error);
        showToast('Copy failed: ' + error.message, 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = '✅ Execute Copy';
    }
}

function clearCopyPreview() {
    const container = document.getElementById('copy-preview-container');
    const content = document.getElementById('copy-preview-content');
    const executeBtn = document.getElementById('copy-execute-btn');

    container.style.display = 'none';
    content.innerHTML = '';
    executeBtn.style.display = 'none';
    copyPreviewData = null;
}

// ──────────────────────────────────────────────────────────────────────
// CATEGORY CRUD FUNCTIONS
// ──────────────────────────────────────────────────────────────────────

function openAddCategory() {
    const isReadOnly = !isActiveYear();
    if (isReadOnly) {
        showToast('Cannot add categories to inactive academic year', 'warning');
        return;
    }

    const modalHtml = `
        <div class="modal-overlay" id="add-category-modal">
            <div class="modal" style="max-width:450px;">
                <div class="modal-header">
                    <h3>➕ Add Fee Category</h3>
                    <button class="modal-close" onclick="window.closeModal('add-category-modal')">✕</button>
                </div>
                <div class="modal-body">
                    <div class="form-grid">
                        <div class="form-group" style="grid-column:1/-1;">
                            <label>Category Name *</label>
                            <input type="text" id="ac-name" placeholder="e.g., School Fees" style="padding:8px 12px;border-radius:6px;border:1px solid var(--border-medium);width:100%;">
                        </div>
                        <div class="form-group" style="grid-column:1/-1;">
                            <label>Description</label>
                            <input type="text" id="ac-desc" placeholder="Description" style="padding:8px 12px;border-radius:6px;border:1px solid var(--border-medium);width:100%;">
                        </div>
                        <div class="form-group">
                            <label>Fee Type</label>
                            <select id="ac-type" style="padding:8px 12px;border-radius:6px;border:1px solid var(--border-medium);width:100%;">
                                <option value="standard">Standard</option>
                                <option value="transport">Transport</option>
                                <option value="activity">Activity</option>
                                <option value="one-time">One-Time</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label>Reset Frequency</label>
                            <select id="ac-frequency" style="padding:8px 12px;border-radius:6px;border:1px solid var(--border-medium);width:100%;">
                                <option value="termly">Termly</option>
                                <option value="monthly">Monthly</option>
                                <option value="annual">Annual</option>
                                <option value="one_time">One-Time</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label>Default Amount (RWF)</label>
                            <input type="number" id="ac-amount" value="0" min="0" step="1000" style="padding:8px 12px;border-radius:6px;border:1px solid var(--border-medium);width:100%;">
                        </div>
                        <div class="form-group">
                            <label>Status</label>
                            <select id="ac-status" style="padding:8px 12px;border-radius:6px;border:1px solid var(--border-medium);width:100%;">
                                <option value="true">Active</option>
                                <option value="false">Inactive</option>
                            </select>
                        </div>
                    </div>
                    <div style="margin-top:12px;padding:8px 12px;background:var(--bg-tertiary);border-radius:6px;font-size:0.75rem;color:var(--text-muted);">
                        📅 This category will be available for the current academic year.
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-outline" onclick="window.closeModal('add-category-modal')">Cancel</button>
                    <button class="btn btn-primary" onclick="window._saveCategory()">💾 Save</button>
                </div>
            </div>
        </div>
    `;

    showModal(modalHtml);
}

async function saveCategory() {
    const name = document.getElementById('ac-name')?.value.trim();
    const desc = document.getElementById('ac-desc')?.value.trim();
    const type = document.getElementById('ac-type')?.value;
    const frequency = document.getElementById('ac-frequency')?.value;
    const amount = parseFloat(document.getElementById('ac-amount')?.value) || 0;
    const status = document.getElementById('ac-status')?.value === 'true';

    if (!name) {
        showToast('Category name is required', 'warning');
        return;
    }

    const result = await insert('fee_categories', {
        name: name,
        description: desc || null,
        fee_type: type,
        reset_frequency: frequency,
        amount: amount,
        is_active: status,
        created_at: new Date().toISOString(),
    });

    if (result) {
        state.feeCategories.push(result);
        closeModal('add-category-modal');
        showToast('✅ Fee category created', 'success');
        await notifyAction('fee_structure_changed', {
            message: `Created fee category: ${name}`,
            entity_type: 'fee_categories',
            entity_id: result.id,
        }, ['admin']);
        renderFeeStructure(document.getElementById('dynamic-content'));
    } else {
        showToast('Failed to create category', 'error');
    }
}

function editCategory(categoryId) {
    const cat = state.feeCategories.find(c => c.id === categoryId);
    if (!cat) return;

    const isReadOnly = !isActiveYear();
    if (isReadOnly) {
        showToast('Cannot edit categories in inactive academic year', 'warning');
        return;
    }

    const modalHtml = `
        <div class="modal-overlay" id="edit-category-modal">
            <div class="modal" style="max-width:450px;">
                <div class="modal-header">
                    <h3>✏️ Edit Fee Category</h3>
                    <button class="modal-close" onclick="window.closeModal('edit-category-modal')">✕</button>
                </div>
                <div class="modal-body">
                    <div class="form-grid">
                        <div class="form-group" style="grid-column:1/-1;">
                            <label>Category Name *</label>
                            <input type="text" id="ec-name" value="${esc(cat.name || '')}" style="padding:8px 12px;border-radius:6px;border:1px solid var(--border-medium);width:100%;">
                        </div>
                        <div class="form-group" style="grid-column:1/-1;">
                            <label>Description</label>
                            <input type="text" id="ec-desc" value="${esc(cat.description || '')}" style="padding:8px 12px;border-radius:6px;border:1px solid var(--border-medium);width:100%;">
                        </div>
                        <div class="form-group">
                            <label>Fee Type</label>
                            <select id="ec-type" style="padding:8px 12px;border-radius:6px;border:1px solid var(--border-medium);width:100%;">
                                <option value="standard" ${cat.fee_type === 'standard' ? 'selected' : ''}>Standard</option>
                                <option value="transport" ${cat.fee_type === 'transport' ? 'selected' : ''}>Transport</option>
                                <option value="activity" ${cat.fee_type === 'activity' ? 'selected' : ''}>Activity</option>
                                <option value="one-time" ${cat.fee_type === 'one-time' ? 'selected' : ''}>One-Time</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label>Reset Frequency</label>
                            <select id="ec-frequency" style="padding:8px 12px;border-radius:6px;border:1px solid var(--border-medium);width:100%;">
                                <option value="termly" ${cat.reset_frequency === 'termly' ? 'selected' : ''}>Termly</option>
                                <option value="monthly" ${cat.reset_frequency === 'monthly' ? 'selected' : ''}>Monthly</option>
                                <option value="annual" ${cat.reset_frequency === 'annual' ? 'selected' : ''}>Annual</option>
                                <option value="one_time" ${cat.reset_frequency === 'one_time' ? 'selected' : ''}>One-Time</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label>Default Amount (RWF)</label>
                            <input type="number" id="ec-amount" value="${cat.amount || 0}" min="0" step="1000" style="padding:8px 12px;border-radius:6px;border:1px solid var(--border-medium);width:100%;">
                        </div>
                        <div class="form-group">
                            <label>Status</label>
                            <select id="ec-status" style="padding:8px 12px;border-radius:6px;border:1px solid var(--border-medium);width:100%;">
                                <option value="true" ${cat.is_active !== false ? 'selected' : ''}>Active</option>
                                <option value="false" ${cat.is_active === false ? 'selected' : ''}>Inactive</option>
                            </select>
                        </div>
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-outline" onclick="window.closeModal('edit-category-modal')">Cancel</button>
                    <button class="btn btn-primary" onclick="window._saveEditCategory(${categoryId})">💾 Save</button>
                </div>
            </div>
        </div>
    `;

    showModal(modalHtml);
}

async function saveEditCategory(categoryId) {
    const name = document.getElementById('ec-name')?.value.trim();
    const desc = document.getElementById('ec-desc')?.value.trim();
    const type = document.getElementById('ec-type')?.value;
    const frequency = document.getElementById('ec-frequency')?.value;
    const amount = parseFloat(document.getElementById('ec-amount')?.value) || 0;
    const status = document.getElementById('ec-status')?.value === 'true';

    if (!name) {
        showToast('Category name is required', 'warning');
        return;
    }

    const result = await update('fee_categories', categoryId, {
        name: name,
        description: desc || null,
        fee_type: type,
        reset_frequency: frequency,
        amount: amount,
        is_active: status,
        updated_at: new Date().toISOString(),
    });

    if (result) {
        const idx = state.feeCategories.findIndex(c => c.id === categoryId);
        if (idx !== -1) {
            state.feeCategories[idx] = { ...state.feeCategories[idx], name, description: desc, fee_type: type, reset_frequency: frequency, amount, is_active: status };
        }
        closeModal('edit-category-modal');
        showToast('✅ Fee category updated', 'success');
        renderFeeStructure(document.getElementById('dynamic-content'));
    } else {
        showToast('Failed to update category', 'error');
    }
}

async function deleteCategory(categoryId) {
    const cat = state.feeCategories.find(c => c.id === categoryId);
    if (!cat) return;

    if (!await confirmDialog(`Delete fee category "${cat.name}"? This cannot be undone.`)) return;

    const result = await remove('fee_categories', categoryId);

    if (result) {
        state.feeCategories = state.feeCategories.filter(c => c.id !== categoryId);
        showToast('✅ Fee category deleted', 'success');
        renderFeeStructure(document.getElementById('dynamic-content'));
    } else {
        showToast('Failed to delete category', 'error');
    }
}

// ──────────────────────────────────────────────────────────────────────
// AMOUNT CRUD FUNCTIONS
// ──────────────────────────────────────────────────────────────────────

function isActiveYear() {
    const year = state.academicYears.find(y => y.id === selectedYearId);
    return year?.is_active === true;
}

function openAddAmount() {
    const isReadOnly = !isActiveYear();
    if (isReadOnly) {
        showToast('Cannot add amounts to inactive academic year', 'warning');
        return;
    }

    const categories = state.feeCategories.filter(c => c.is_active !== false);
    const classes = state.classes.filter(c => c.is_active !== false);
    const years = state.academicYears || [];

    const modalHtml = `
        <div class="modal-overlay" id="add-amount-modal">
            <div class="modal" style="max-width:450px;">
                <div class="modal-header">
                    <h3>💰 Add Class Fee Amount</h3>
                    <button class="modal-close" onclick="window.closeModal('add-amount-modal')">✕</button>
                </div>
                <div class="modal-body">
                    <div class="form-grid">
                        <div class="form-group">
                            <label>Fee Category *</label>
                            <select id="aa-category" style="padding:8px 12px;border-radius:6px;border:1px solid var(--border-medium);width:100%;">
                                <option value="">— Select —</option>
                                ${categories.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}
                            </select>
                        </div>
                        <div class="form-group">
                            <label>Class *</label>
                            <select id="aa-class" style="padding:8px 12px;border-radius:6px;border:1px solid var(--border-medium);width:100%;">
                                <option value="">— Select —</option>
                                ${classes.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}
                            </select>
                        </div>
                        <div class="form-group">
                            <label>Academic Year *</label>
                            <select id="aa-year" style="padding:8px 12px;border-radius:6px;border:1px solid var(--border-medium);width:100%;">
                                ${years.map(y => `
                                    <option value="${y.id}" ${y.id === selectedYearId ? 'selected' : ''}>
                                        ${esc(y.name)} ${y.id === getCurrentAcademicYear()?.id ? '🟢' : ''}
                                    </option>
                                `).join('')}
                            </select>
                        </div>
                        <div class="form-group" style="grid-column:1/-1;">
                            <label>Amount (RWF) *</label>
                            <input type="number" id="aa-amount" value="0" min="0" step="1000" style="padding:8px 12px;border-radius:6px;border:1px solid var(--border-medium);width:100%;">
                        </div>
                    </div>
                    <div style="margin-top:12px;padding:8px 12px;background:var(--bg-tertiary);border-radius:6px;font-size:0.75rem;color:var(--text-muted);">
                        📅 This amount will apply to the selected academic year.
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-outline" onclick="window.closeModal('add-amount-modal')">Cancel</button>
                    <button class="btn btn-primary" onclick="window._saveAmount()">💾 Save</button>
                </div>
            </div>
        </div>
    `;

    showModal(modalHtml);
}

async function saveAmount() {
    const categoryId = parseInt(document.getElementById('aa-category')?.value);
    const classId = parseInt(document.getElementById('aa-class')?.value);
    const yearId = parseInt(document.getElementById('aa-year')?.value);
    const amount = parseFloat(document.getElementById('aa-amount')?.value) || 0;

    if (!categoryId || !classId || !yearId) {
        showToast('Please select category, class, and academic year', 'warning');
        return;
    }

    if (amount <= 0) {
        showToast('Amount must be greater than 0', 'warning');
        return;
    }

    const year = state.academicYears.find(y => y.id === yearId);
    if (!year?.is_active) {
        showToast('Cannot add amounts to inactive academic year', 'warning');
        return;
    }

    const existing = state.feeAmounts.find(fa =>
        fa.fee_category_id === categoryId &&
        fa.class_id === classId &&
        fa.academic_year_id === yearId
    );

    let result;
    if (existing) {
        result = await update('fee_amounts', existing.id, {
            amount: amount,
            updated_at: new Date().toISOString(),
        });
        if (result) {
            existing.amount = amount;
        }
    } else {
        result = await insert('fee_amounts', {
            fee_category_id: categoryId,
            class_id: classId,
            academic_year_id: yearId,
            amount: amount,
            created_at: new Date().toISOString(),
        });
        if (result) {
            state.feeAmounts.push(result);
        }
    }

    if (result) {
        closeModal('add-amount-modal');
        showToast('✅ Fee amount saved', 'success');
        await loadFeeAmounts();
    } else {
        showToast('Failed to save fee amount', 'error');
    }
}

async function loadFeeAmounts() {
    const container = document.getElementById('fee-amounts-list');
    if (!container) return;

    const yearId = document.getElementById('fa-year')?.value;
    const classId = document.getElementById('fa-class')?.value;
    const categoryId = document.getElementById('fa-category')?.value;

    if (yearId) {
        selectedYearId = parseInt(yearId);
    }

    let amounts = state.feeAmounts || [];

    if (yearId) amounts = amounts.filter(fa => fa.academic_year_id == yearId);
    if (classId) amounts = amounts.filter(fa => fa.class_id == classId);
    if (categoryId) amounts = amounts.filter(fa => fa.fee_category_id == categoryId);

    if (!amounts.length) {
        container.innerHTML = `
            <div style="text-align:center;padding:40px;color:var(--text-muted);">
                No fee amounts found for ${(state.academicYears || []).find(y => y.id === selectedYearId)?.name || 'selected year'}
            </div>
        `;
        return;
    }

    const rows = amounts.map(fa => {
        const cat = state.feeCategories.find(c => c.id === fa.fee_category_id);
        const cls = getClassById(fa.class_id);
        const year = state.academicYears.find(y => y.id === fa.academic_year_id);
        return `
            <tr>
                <td><strong>${esc(cat?.name || '—')}</strong></td>
                <td>${esc(cls?.name || '—')}</td>
                <td style="font-weight:600;">${fmtCurrency(fa.amount || 0)}</td>
                <td>${esc(year?.name || '—')}</td>
                <td style="text-align:center;">
                    <button class="btn btn-sm btn-outline" onclick="window._editAmount(${fa.id})" style="padding:2px 6px;font-size:0.7rem;">✏️</button>
                    <button class="btn btn-sm btn-danger" onclick="window._deleteAmount(${fa.id})" style="padding:2px 6px;font-size:0.7rem;">🗑️</button>
                </td>
            </tr>
        `;
    }).join('');

    container.innerHTML = `
        <div class="table-wrapper">
            <table class="data-table" style="font-size:0.8rem;">
                <thead>
                    <tr>
                        <th>Category</th>
                        <th>Class</th>
                        <th style="text-align:right;">Amount</th>
                        <th>Academic Year</th>
                        <th style="text-align:center;">Actions</th>
                    </tr>
                </thead>
                <tbody>${rows}</tbody>
            </table>
        </div>
    `;
}

function editAmount(amountId) {
    const fa = state.feeAmounts.find(f => f.id === amountId);
    if (!fa) return;

    const isReadOnly = !isActiveYear();
    if (isReadOnly) {
        showToast('Cannot edit amounts in inactive academic year', 'warning');
        return;
    }

    const categories = state.feeCategories.filter(c => c.is_active !== false);
    const classes = state.classes.filter(c => c.is_active !== false);
    const years = state.academicYears || [];

    const modalHtml = `
        <div class="modal-overlay" id="edit-amount-modal">
            <div class="modal" style="max-width:450px;">
                <div class="modal-header">
                    <h3>✏️ Edit Fee Amount</h3>
                    <button class="modal-close" onclick="window.closeModal('edit-amount-modal')">✕</button>
                </div>
                <div class="modal-body">
                    <div class="form-grid">
                        <div class="form-group">
                            <label>Fee Category</label>
                            <select id="ea-category" style="padding:8px 12px;border-radius:6px;border:1px solid var(--border-medium);width:100%;">
                                ${categories.map(c => `<option value="${c.id}" ${c.id === fa.fee_category_id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}
                            </select>
                        </div>
                        <div class="form-group">
                            <label>Class</label>
                            <select id="ea-class" style="padding:8px 12px;border-radius:6px;border:1px solid var(--border-medium);width:100%;">
                                ${classes.map(c => `<option value="${c.id}" ${c.id === fa.class_id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}
                            </select>
                        </div>
                        <div class="form-group">
                            <label>Academic Year</label>
                            <select id="ea-year" style="padding:8px 12px;border-radius:6px;border:1px solid var(--border-medium);width:100%;">
                                ${years.map(y => `
                                    <option value="${y.id}" ${y.id === fa.academic_year_id ? 'selected' : ''}>
                                        ${esc(y.name)} ${y.id === getCurrentAcademicYear()?.id ? '🟢' : ''}
                                    </option>
                                `).join('')}
                            </select>
                        </div>
                        <div class="form-group" style="grid-column:1/-1;">
                            <label>Amount (RWF) *</label>
                            <input type="number" id="ea-amount" value="${fa.amount || 0}" min="0" step="1000" style="padding:8px 12px;border-radius:6px;border:1px solid var(--border-medium);width:100%;">
                        </div>
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-outline" onclick="window.closeModal('edit-amount-modal')">Cancel</button>
                    <button class="btn btn-primary" onclick="window._saveEditAmount(${amountId})">💾 Save</button>
                </div>
            </div>
        </div>
    `;

    showModal(modalHtml);
}

async function saveEditAmount(amountId) {
    const categoryId = parseInt(document.getElementById('ea-category')?.value);
    const classId = parseInt(document.getElementById('ea-class')?.value);
    const yearId = parseInt(document.getElementById('ea-year')?.value);
    const amount = parseFloat(document.getElementById('ea-amount')?.value) || 0;

    if (!categoryId || !classId || !yearId) {
        showToast('Please select all fields', 'warning');
        return;
    }

    if (amount <= 0) {
        showToast('Amount must be greater than 0', 'warning');
        return;
    }

    const year = state.academicYears.find(y => y.id === yearId);
    if (!year?.is_active) {
        showToast('Cannot edit amounts in inactive academic year', 'warning');
        return;
    }

    const result = await update('fee_amounts', amountId, {
        fee_category_id: categoryId,
        class_id: classId,
        academic_year_id: yearId,
        amount: amount,
        updated_at: new Date().toISOString(),
    });

    if (result) {
        const idx = state.feeAmounts.findIndex(f => f.id === amountId);
        if (idx !== -1) {
            state.feeAmounts[idx] = { ...state.feeAmounts[idx], fee_category_id: categoryId, class_id: classId, academic_year_id: yearId, amount };
        }
        closeModal('edit-amount-modal');
        showToast('✅ Fee amount updated', 'success');
        await loadFeeAmounts();
    } else {
        showToast('Failed to update fee amount', 'error');
    }
}

async function deleteAmount(amountId) {
    if (!await confirmDialog('Delete this fee amount override?')) return;

    const result = await remove('fee_amounts', amountId);

    if (result) {
        state.feeAmounts = state.feeAmounts.filter(f => f.id !== amountId);
        showToast('✅ Fee amount deleted', 'success');
        await loadFeeAmounts();
    } else {
        showToast('Failed to delete fee amount', 'error');
    }
}

// ──────────────────────────────────────────────────────────────────────
// REFRESH & EXPORT
// ──────────────────────────────────────────────────────────────────────

async function refreshFeeStructure() {
    await refreshTable('fee_categories');
    await refreshTable('fee_amounts');
    renderFeeStructure(document.getElementById('dynamic-content'));
    showToast('🔄 Refreshed', 'info', 1000);
}

function exportFeeStructure() {
    const categories = state.feeCategories || [];
    const amounts = state.feeAmounts || [];
    const year = state.academicYears.find(y => y.id === selectedYearId);

    const data = categories.map(c => {
        const classAmounts = amounts.filter(fa => fa.fee_category_id === c.id && fa.academic_year_id === selectedYearId);
        return {
            'Category': c.name,
            'Type': c.fee_type || 'standard',
            'Default Amount': c.amount || 0,
            'Frequency': c.reset_frequency || 'termly',
            'Status': c.is_active !== false ? 'Active' : 'Inactive',
            'Class Overrides': classAmounts.length,
            'Academic Year': year?.name || 'All Years',
            'Created': fmtDate(c.created_at),
        };
    });

    const filename = `Fee_Structure_${year?.name?.replace(/\s+/g, '_') || 'All'}_${new Date().toISOString().split('T')[0]}`;
    exportToExcel(data, filename);
    showToast('✅ Fee structure exported', 'success');
}

// ──────────────────────────────────────────────────────────────────────
// EXPOSE GLOBALLY
// ──────────────────────────────────────────────────────────────────────

window._switchFeeTab = switchFeeTab;
window._openAddCategory = openAddCategory;
window._editCategory = editCategory;
window._deleteCategory = deleteCategory;
window._openAddAmount = openAddAmount;
window._loadFeeAmounts = loadFeeAmounts;
window._refreshFeeStructure = refreshFeeStructure;
window._exportFeeStructure = exportFeeStructure;
window._saveCategory = saveCategory;
window._saveAmount = saveAmount;
window._deleteAmount = deleteAmount;
window._loadFeeStructureData = loadFeeStructureData;
window._openCopyModal = openCopyModal;
window._toggleCopyOptions = toggleCopyOptions;
window._previewCopy = previewCopy;
window._executeCopy = executeCopy;
window._clearCopyPreview = clearCopyPreview;
window._saveEditCategory = saveEditCategory;
window._saveEditAmount = saveEditAmount;
window._editAmount = editAmount;