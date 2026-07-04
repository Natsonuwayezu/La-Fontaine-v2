/**
 * ECOLE LA FONTAINE — Backup & Restore
 * Manual backup, auto-backup schedule, restore from backup file
 * Last updated: 2026-06-29
 */

import { state, getCurrentUser } from '../../core/state.js';
import { esc, fmtDateTime } from '../../core/utils.js';
import { getAllRecords, insertBatch, removeWhere, logActivity } from '../../core/api.js';
import { APP_CONFIG } from '../../config/constants.js';

const BACKUP_KEY = 'elf_backup_history';

// ──────────────────────────────────────────────────────────────────────
// MAIN RENDER FUNCTION
// ──────────────────────────────────────────────────────────────────────

export async function renderBackupRestore(container) {
    if (!container) return;

    const user = getCurrentUser();
    if (user?.role !== 'admin') {
        container.innerHTML = '<div class="alert alert-danger">Access denied. Admin privileges required.</div>';
        return;
    }

    await ensureStateLoaded();

    let backupHistory = [];
    try {
        backupHistory = JSON.parse(localStorage.getItem(BACKUP_KEY) || '[]');
    } catch (e) {
        backupHistory = [];
    }

    container.innerHTML = `
        <div class="dash-card">
            <div class="dash-card-header">
                <span class="dash-card-title">💾 Backup & Restore</span>
                <div class="btn-group">
                    <button class="btn btn-sm btn-outline" onclick="window._showBackupList()">📋 Backup History</button>
                    <button class="btn btn-sm btn-outline" onclick="window._exportAllBackups()">📤 Export All Backups</button>
                </div>
            </div>
            <div class="dash-card-body">

                <!-- MANUAL BACKUP -->
                <div style="margin-bottom:24px;padding:16px;background:var(--bg-tertiary);border-radius:var(--r-lg);">
                    <h4 style="margin-bottom:12px;">💾 MANUAL BACKUP</h4>
                    <p style="font-size:0.85rem;color:var(--text-muted);margin-bottom:12px;">Download a complete backup of all school data.</p>
                    <div class="btn-group">
                        <button class="btn btn-primary" onclick="window._doFullBackup()">📥 Download Full Backup</button>
                        <button class="btn btn-outline" onclick="window._createFullBackup()">💾 Create Backup (Keep in System)</button>
                    </div>
                    <span style="margin-left:12px;font-size:0.75rem;color:var(--text-muted);">Last backup: ${backupHistory[0] ? fmtDateTime(backupHistory[0].date) : 'Never'}</span>
                </div>

                <!-- RESTORE FROM BACKUP -->
                <div style="margin-bottom:24px;padding:16px;background:var(--bg-tertiary);border-radius:var(--r-lg);">
                    <h4 style="margin-bottom:12px;">🔄 RESTORE FROM BACKUP</h4>
                    <p style="font-size:0.85rem;color:var(--text-muted);margin-bottom:12px;">⚠️ Warning: Restoring will replace ALL current data!</p>
                    <div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap;">
                        <input type="file" id="restore-file" accept=".json" style="display:none;" onchange="window._previewRestoreFile()">
                        <button class="btn btn-outline" onclick="document.getElementById('restore-file').click()">📂 Select Backup File</button>
                        <button class="btn btn-danger" id="restore-btn" style="display:none;" onclick="window._confirmRestore()">⚠️ Restore Data</button>
                    </div>
                    <div id="restore-preview" style="margin-top:12px;display:none;"></div>
                </div>

                <!-- AUTOMATIC BACKUP SCHEDULE -->
                <div style="margin-bottom:24px;padding:16px;background:var(--bg-tertiary);border-radius:var(--r-lg);">
                    <h4 style="margin-bottom:12px;">🤖 AUTOMATIC BACKUP SCHEDULE</h4>
                    <div class="form-grid" style="grid-template-columns:repeat(auto-fit,minmax(160px,1fr));">
                        <div class="form-group">
                            <label>Enable Auto-Backup</label>
                            <select id="auto-backup-enabled" class="form-control">
                                <option value="true" ${localStorage.getItem('auto_backup_enabled') === 'true' ? 'selected' : ''}>Yes</option>
                                <option value="false" ${localStorage.getItem('auto_backup_enabled') !== 'true' ? 'selected' : ''}>No</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label>Frequency</label>
                            <select id="auto-backup-frequency" class="form-control">
                                <option value="daily" ${localStorage.getItem('auto_backup_frequency') === 'daily' ? 'selected' : ''}>Daily</option>
                                <option value="weekly" ${localStorage.getItem('auto_backup_frequency') === 'weekly' ? 'selected' : ''}>Weekly</option>
                                <option value="monthly" ${localStorage.getItem('auto_backup_frequency') === 'monthly' || !localStorage.getItem('auto_backup_frequency') ? 'selected' : ''}>Monthly</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label>Keep backups</label>
                            <select id="auto-backup-keep" class="form-control">
                                <option value="3">Last 3</option>
                                <option value="5">Last 5</option>
                                <option value="10" selected>Last 10</option>
                            </select>
                        </div>
                    </div>
                    <button class="btn btn-sm btn-outline" onclick="window._saveAutoBackupSettings()" style="margin-top:12px;">💾 Save Settings</button>
                </div>

                <!-- BACKUP HISTORY -->
                <div>
                    <h4 style="margin-bottom:12px;">📋 BACKUP HISTORY</h4>
                    <div class="table-wrapper">
                        <table class="data-table">
                            <thead>
                                <tr>
                                    <th>Date</th>
                                    <th>Type</th>
                                    <th>Size</th>
                                    <th>Records</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody id="backup-history-tbody">
                                ${backupHistory.map(b => `
                                    <tr>
                                        <td>${fmtDateTime(b.date)}</td>
                                        <td><span class="badge ${b.type === 'auto' ? 'badge-info' : 'badge-success'}">${b.type === 'auto' ? '🤖 Auto' : '👤 Manual'}</span></td>
                                        <td>${b.size || '—'}</td>
                                        <td>${b.records?.students || 0} students, ${b.records?.marks || 0} marks</td>
                                        <td>
                                            <button class="btn btn-sm btn-outline" onclick="window._downloadBackupFile('${esc(b.filename)}', '${esc(b.data || '')}')">📥 Download</button>
                                            <button class="btn btn-sm btn-danger" onclick="window._deleteBackupRecord('${esc(b.filename)}')">🗑️ Delete</button>
                                        </td>
                                    </tr>
                                `).join('') || '<tr><td colspan="5" style="text-align:center;padding:20px;color:var(--text-muted);">No backups found</td></tr>'}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    `;

    window._doFullBackup = doFullBackup;
    window._createFullBackup = createFullBackup;
    window._previewRestoreFile = previewRestoreFile;
    window._confirmRestore = confirmRestore;
    window._saveAutoBackupSettings = saveAutoBackupSettings;
    window._showBackupList = showBackupList;
    window._exportAllBackups = exportAllBackups;
    window._downloadBackupFile = downloadBackupFile;
    window._deleteBackupRecord = deleteBackupRecord;
}

// ──────────────────────────────────────────────────────────────────────
// DO FULL BACKUP
// ──────────────────────────────────────────────────────────────────────

async function doFullBackup() {
    const btn = event?.target || document.querySelector('.btn-primary');
    if (btn) { btn.disabled = true; btn.innerHTML = '<span class="loader-inline"></span> Backing up...'; }

    try {
        showToast('⏳ Creating full backup...', 'info', 3000);

        const backup = {
            version: APP_CONFIG.version,
            created_at: new Date().toISOString(),
            school: state.schoolSettings?.school_name || 'ECOLE LA FONTAINE',
            tables: {
                students: state.students || [],
                teachers: state.teachers || [],
                classes: state.classes || [],
                subjects: state.subjects || [],
                terms: state.terms || [],
                academic_years: state.academicYears || [],
                assessments: state.assessments || [],
                marks: state.marks || [],
                student_fees: state.studentFees || [],
                payments: state.payments || [],
                fee_categories: state.feeCategories || [],
                fee_amounts: state.feeAmounts || [],
                families: state.families || [],
                school_settings: state.schoolSettings || {},
                grading_scale: state.gradingScale || [],
            },
            totalRecords: {
                students: (state.students || []).length,
                marks: (state.marks || []).length,
                payments: (state.payments || []).length,
                total: (state.students || []).length + (state.marks || []).length + (state.payments || []).length + (state.studentFees || []).length,
            }
        };

        const json = JSON.stringify(backup, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        const dateStr = new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-');
        a.href = url;
        a.download = `ELF_Backup_${dateStr}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        // Save to history
        const history = JSON.parse(localStorage.getItem(BACKUP_KEY) || '[]');
        history.unshift({
            date: new Date().toISOString(),
            type: 'manual',
            filename: `ELF_Backup_${dateStr}.json`,
            size: (blob.size / 1024).toFixed(1) + ' KB',
            records: backup.totalRecords,
        });
        if (history.length > 10) history = history.slice(0, 10);
        localStorage.setItem(BACKUP_KEY, JSON.stringify(history));

        await logActivity(state.currentUser?.id, state.currentUser?.role, 'Created full backup');
        showToast(`✅ Backup complete! ${backup.totalRecords.total} records saved.`, 'success', 5000);

    } catch (error) {
        console.error('[Backup]', error);
        showToast('❌ Backup failed: ' + error.message, 'error');
    } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = '📥 Download Full Backup'; }
    }
}

// ──────────────────────────────────────────────────────────────────────
// CREATE FULL BACKUP (Keep in System)
// ──────────────────────────────────────────────────────────────────────

async function createFullBackup() {
    await doFullBackup();
}

// ──────────────────────────────────────────────────────────────────────
// PREVIEW RESTORE FILE
// ──────────────────────────────────────────────────────────────────────

function previewRestoreFile() {
    const fileInput = document.getElementById('restore-file');
    const preview = document.getElementById('restore-preview');
    const restoreBtn = document.getElementById('restore-btn');

    if (!fileInput?.files[0]) {
        preview.style.display = 'none';
        restoreBtn.style.display = 'none';
        return;
    }

    const reader = new FileReader();
    reader.onload = function (e) {
        try {
            const data = JSON.parse(e.target.result);
            if (!data.version || !data.tables) {
                preview.innerHTML = '<div class="alert alert-danger">❌ Invalid backup file format</div>';
                preview.style.display = 'block';
                restoreBtn.style.display = 'none';
                return;
            }

            window._restoreData = data;

            const tableList = Object.entries(data.tables)
                .filter(([name, records]) => records && (Array.isArray(records) ? records.length : Object.keys(records).length))
                .map(([name, records]) => {
                    const count = Array.isArray(records) ? records.length : Object.keys(records).length;
                    return `<li><strong>${esc(name)}:</strong> ${count} records</li>`;
                }).join('');

            preview.innerHTML = `
                <div class="alert alert-info">
                    <strong>📦 Backup Preview</strong><br>
                    Version: ${esc(data.version)}<br>
                    Created: ${fmtDateTime(data.created_at)}<br>
                    School: ${esc(data.school || '—')}
                </div>
                <ul style="max-height:200px;overflow-y:auto;font-size:0.85rem;margin:8px 0;">${tableList}</ul>
                <div class="alert alert-warning" style="margin-top:8px;">⚠️ Restoring will OVERWRITE current data. This cannot be undone.</div>
            `;
            preview.style.display = 'block';
            restoreBtn.style.display = 'inline-flex';

        } catch (error) {
            preview.innerHTML = `<div class="alert alert-danger">❌ Failed to read file: ${esc(error.message)}</div>`;
            preview.style.display = 'block';
            restoreBtn.style.display = 'none';
        }
    };
    reader.readAsText(fileInput.files[0]);
}

// ──────────────────────────────────────────────────────────────────────
// CONFIRM RESTORE
// ──────────────────────────────────────────────────────────────────────

async function confirmRestore() {
    const data = window._restoreData;
    if (!data?.tables) {
        showToast('No backup data loaded', 'warning');
        return;
    }

    if (!await confirmDialog('⚠️ RESTORE BACKUP? This will overwrite ALL current data. Are you sure?')) return;
    if (!await confirmDialog('Final confirmation. This CANNOT be undone.')) return;

    const restoreBtn = document.getElementById('restore-btn');
    if (restoreBtn) { restoreBtn.disabled = true; restoreBtn.innerHTML = '<span class="loader-inline"></span> Restoring...'; }

    try {
        showToast('⏳ Restoring backup...', 'info', 5000);

        const tables = data.tables;
        let restored = 0;

        // Restore each table
        for (const [tableName, records] of Object.entries(tables)) {
            if (!records || (Array.isArray(records) && !records.length) || (typeof records === 'object' && !Object.keys(records).length)) continue;

            // Special handling for school_settings and grading_scale (key-value)
            if (tableName === 'school_settings' || tableName === 'grading_scale') {
                // Delete existing
                await removeWhere(tableName, 'id=gt.0');
                // Insert new
                if (Array.isArray(records)) {
                    for (const r of records) {
                        await insert(tableName, r);
                    }
                } else {
                    for (const [key, value] of Object.entries(records)) {
                        await insert(tableName, { key, value });
                    }
                }
                restored += Array.isArray(records) ? records.length : Object.keys(records).length;
                continue;
            }

            // Delete existing
            await removeWhere(tableName, 'id=gt.0');

            // Insert records in batches
            if (Array.isArray(records) && records.length) {
                for (let i = 0; i < records.length; i += 100) {
                    const batch = records.slice(i, i + 100);
                    for (const r of batch) {
                        await insert(tableName, r);
                    }
                }
                restored += records.length;
            }
        }

        await refreshTable('all');
        await logActivity(state.currentUser?.id, state.currentUser?.role, 'Restored backup');
        showToast(`✅ Backup restored — ${restored} records`, 'success');
        window._restoreData = null;

    } catch (error) {
        showToast('❌ Restore failed: ' + error.message, 'error');
    } finally {
        if (restoreBtn) { restoreBtn.disabled = false; restoreBtn.innerHTML = '⚠️ Restore Data'; }
    }
}

// ──────────────────────────────────────────────────────────────────────
// SAVE AUTO BACKUP SETTINGS
// ──────────────────────────────────────────────────────────────────────

function saveAutoBackupSettings() {
    const enabled = document.getElementById('auto-backup-enabled')?.value === 'true';
    const frequency = document.getElementById('auto-backup-frequency')?.value;
    const keep = document.getElementById('auto-backup-keep')?.value;

    localStorage.setItem('auto_backup_enabled', String(enabled));
    localStorage.setItem('auto_backup_frequency', frequency);
    localStorage.setItem('auto_backup_keep', keep);

    showToast('✅ Auto-backup settings saved', 'success');
}

// ──────────────────────────────────────────────────────────────────────
// SHOW BACKUP LIST
// ──────────────────────────────────────────────────────────────────────

function showBackupList() {
    let backups = [];
    try {
        backups = JSON.parse(localStorage.getItem(BACKUP_KEY) || '[]');
    } catch (e) {
        backups = [];
    }

    const rows = backups.map(b => `
        <tr>
            <td>${fmtDateTime(b.date)}</td>
            <td><span class="badge ${b.type === 'auto' ? 'badge-info' : 'badge-success'}">${b.type === 'auto' ? '🤖 Auto' : '👤 Manual'}</span></td>
            <td>${b.size || '—'}</td>
            <td>${b.records?.students || 0} students, ${b.records?.marks || 0} marks</td>
            <td><button class="btn btn-sm btn-outline" onclick="window._downloadBackupFile('${esc(b.filename)}','')">📥 Download</button>
            <button class="btn btn-sm btn-danger" onclick="window._deleteBackupRecord('${esc(b.filename)}')">🗑️</button></td>
        </tr>
    `).join('') || '<tr><td colspan="5" style="text-align:center;padding:20px;color:var(--text-muted);">No backup history found</td></tr>';

    showModal(`
        <div class="modal-overlay" id="backup-list-modal">
            <div class="modal" style="max-width:700px;">
                <div class="modal-header">
                    <h3>📋 Backup History</h3>
                    <button class="modal-close" onclick="window.closeModal('backup-list-modal')">✕</button>
                </div>
                <div class="modal-body">
                    <div class="table-wrapper">
                        <table class="data-table">
                            <thead>
                                <tr>
                                    <th>Date</th>
                                    <th>Type</th>
                                    <th>Size</th>
                                    <th>Records</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>${rows}</tbody>
                        </table>
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-outline" onclick="window.closeModal('backup-list-modal')">Close</button>
                </div>
            </div>
        </div>
    `);
}

// ──────────────────────────────────────────────────────────────────────
// EXPORT ALL BACKUPS
// ──────────────────────────────────────────────────────────────────────

function exportAllBackups() {
    let backups = [];
    try {
        backups = JSON.parse(localStorage.getItem(BACKUP_KEY) || '[]');
    } catch (e) {
        backups = [];
    }

    if (!backups.length) {
        showToast('No backups to export', 'warning');
        return;
    }

    const exportData = backups.map(b => ({
        date: b.date,
        type: b.type,
        filename: b.filename,
        size: b.size,
        records: b.records,
    }));

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Backup_History_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);

    showToast('✅ Backup history exported', 'success');
}

// ──────────────────────────────────────────────────────────────────────
// DOWNLOAD BACKUP FILE
// ──────────────────────────────────────────────────────────────────────

function downloadBackupFile(filename, data) {
    if (!filename) {
        showToast('No backup file to download', 'warning');
        return;
    }

    // Try to find the backup in history
    let backups = [];
    try {
        backups = JSON.parse(localStorage.getItem(BACKUP_KEY) || '[]');
    } catch (e) {
        backups = [];
    }

    const backup = backups.find(b => b.filename === filename);
    if (!backup) {
        showToast('Backup file not found', 'warning');
        return;
    }

    // If we have the data, download it
    if (backup.data) {
        const blob = new Blob([backup.data], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
        showToast('✅ Backup downloaded', 'success');
    } else {
        showToast('No data available for this backup', 'warning');
    }
}

// ──────────────────────────────────────────────────────────────────────
// DELETE BACKUP RECORD
// ──────────────────────────────────────────────────────────────────────

function deleteBackupRecord(filename) {
    if (!confirm(`Delete backup record "${filename}"?`)) return;

    let backups = [];
    try {
        backups = JSON.parse(localStorage.getItem(BACKUP_KEY) || '[]');
    } catch (e) {
        backups = [];
    }

    backups = backups.filter(b => b.filename !== filename);
    localStorage.setItem(BACKUP_KEY, JSON.stringify(backups));

    showToast('✅ Backup record deleted', 'success');
    renderBackupRestore(document.getElementById('dynamic-content'));
}