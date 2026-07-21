/* ═══════════════════════════════════════════════════════════════════
   js/modules/settings/backup-restore.js
   ═══════════════════════════════════════════════════════════════════
   Rendered into #app-main by core/router.js for the 'backup-restore'
   nav item. Full database backup (JSON export of every table in
   BACKUP_ALL_TABLES) and restore, plus auto-backup schedule settings.

   NOTE: exports as a single JSON file for now. js/core/export-engine.js
   and js/integrations/xlsx.js are still empty — once written, a
   spreadsheet-format export can be added alongside this.

   Dependencies (plain-script globals loaded earlier in index.html):
   api.js: getAll, insertMany, remove
   utils.js: esc, fmtDate
   toast.js: showToast
   modals.js: confirmDialog
   logger.js: logAction
   loaders.js: window.Loaders
   constants.js: BACKUP_ALL_TABLES, BACKUP_FILENAME_PREFIX, STORAGE_KEYS
   ═══════════════════════════════════════════════════════════════════ */

const BackupRestorePage = (() => {

    function getHistory() {
        try { return JSON.parse(localStorage.getItem(STORAGE_KEYS.BACKUP_HISTORY) || '[]'); }
        catch { return []; }
    }

    function pushHistory(entry) {
        const history = getHistory();
        history.unshift(entry);
        localStorage.setItem(STORAGE_KEYS.BACKUP_HISTORY, JSON.stringify(history.slice(0, 20)));
    }

    async function render(container) {
        if (!container) return;
        container.innerHTML = `<div class="dashboard-page"><div class="loading-inline">Loading backup settings…</div></div>`;

        const history = getHistory();
        const autoEnabled = localStorage.getItem(STORAGE_KEYS.AUTO_BACKUP_ENABLED) === 'true';
        const autoFreq = localStorage.getItem(STORAGE_KEYS.AUTO_BACKUP_FREQUENCY) || 'weekly';

        container.innerHTML = `
            <div class="dashboard-page">
                ${window.SettingsTabs ? window.SettingsTabs.render('backup-restore') : ''}
                <div class="settings-section">
                    <div class="settings-section__title">Backup &amp; Restore</div>
                    <div class="settings-section__desc">Full database backup as JSON, restore from a backup file, and automatic backup scheduling.</div>
                </div>

                <div class="setting-card" style="margin-bottom:16px;">
                    <div class="setting-title">Manual Backup</div>
                    <div class="setting-desc" style="margin-bottom:12px;">Downloads every table (${BACKUP_ALL_TABLES.length} in total) as one JSON file.</div>
                    <div style="display:flex; gap:10px; flex-wrap:wrap;">
                        <button class="btn btn-primary" id="run-backup-btn"><i class="fa-solid fa-download"></i> Download Backup Now</button>
                        <label class="btn btn-outline" style="cursor:pointer;">
                            <i class="fa-solid fa-upload"></i> Restore from File
                            <input type="file" id="restore-file-input" accept=".json" style="display:none;">
                        </label>
                    </div>
                </div>

                <div class="setting-card" style="margin-bottom:16px;">
                    <div class="setting-title">Automatic Backup</div>
                    <label style="display:flex; align-items:center; gap:10px; margin:10px 0;">
                        <input type="checkbox" id="auto-backup-toggle" ${autoEnabled ? 'checked' : ''}>
                        Enable automatic backup reminders
                    </label>
                    <select class="form-select" id="auto-backup-freq" ${autoEnabled ? '' : 'disabled'}>
                        <option value="daily" ${autoFreq === 'daily' ? 'selected' : ''}>Daily</option>
                        <option value="weekly" ${autoFreq === 'weekly' ? 'selected' : ''}>Weekly</option>
                        <option value="monthly" ${autoFreq === 'monthly' ? 'selected' : ''}>Monthly</option>
                    </select>
                </div>

                <div class="setting-title" style="margin-bottom:8px;">Backup History</div>
                <div class="backup-info">
                    ${history.length ? history.map(h => `
                        <div class="backup-item">
                            <span class="backup-type-badge ${esc(h.type)}">${esc(h.type)}</span>
                            <span>${esc(h.filename)}</span>
                            <span>${fmtDate(h.date)}</span>
                        </div>
                    `).join('') : '<div class="setting-desc">No backups yet.</div>'}
                </div>
            </div>
        `;

        bindEvents(container);
    }

    async function runBackup(container) {
        const btn = container.querySelector('#run-backup-btn');
        window.Loaders?.button?.start(btn, 'Backing up...');
        try {
            const dump = {};
            for (const table of BACKUP_ALL_TABLES) {
                try { dump[table] = await getAll(table); }
                catch (e) { dump[table] = []; console.warn(`[Backup] skipped ${table}:`, e.message); }
            }
            const payload = { created_at: new Date().toISOString(), tables: dump };
            const filename = `${BACKUP_FILENAME_PREFIX}${new Date().toISOString().slice(0, 10)}.json`;

            const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url; a.download = filename;
            document.body.appendChild(a); a.click(); a.remove();
            URL.revokeObjectURL(url);

            localStorage.setItem(STORAGE_KEYS.LAST_BACKUP, new Date().toISOString());
            pushHistory({ type: 'manual', filename, date: new Date().toISOString() });
            await logAction('BACKUP_CREATED', 'school_settings', null, { filename, tables: BACKUP_ALL_TABLES.length });
            showToast('Backup downloaded', 'success', filename);
        } catch (err) {
            showToast('Backup failed', 'error', err.message);
        } finally {
            window.Loaders?.button?.stop(btn);
        }
    }

    async function restoreFromFile(file, container) {
        const ok = await confirmDialog(
            'Restoring will overwrite existing data in every table found in this backup file. This cannot be undone. Continue?',
            'Restore Backup',
            { confirmClass: 'btn-danger' }
        );
        if (!ok) return;

        try {
            const text = await file.text();
            const payload = JSON.parse(text);
            const tables = payload.tables || {};

            for (const [table, rows] of Object.entries(tables)) {
                if (!Array.isArray(rows) || !rows.length) continue;
                await insertMany(table, rows).catch(e =>
                    console.warn(`[Restore] failed for ${table}:`, e.message));
            }

            pushHistory({ type: 'restore', filename: file.name, date: new Date().toISOString() });
            await logAction('BACKUP_RESTORED', 'school_settings', null, { filename: file.name }, 'warning');
            showToast('Restore complete', 'success', 'Reloading the app to reflect restored data.');
            setTimeout(() => window.location.reload(), 1500);
        } catch (err) {
            showToast('Restore failed', 'error', err.message);
        }
    }

    function bindEvents(container) {
        container.querySelector('#run-backup-btn')?.addEventListener('click', () => runBackup(container));

        container.querySelector('#restore-file-input')?.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) restoreFromFile(file, container);
        });

        const toggle = container.querySelector('#auto-backup-toggle');
        const freqSelect = container.querySelector('#auto-backup-freq');

        toggle?.addEventListener('change', () => {
            localStorage.setItem(STORAGE_KEYS.AUTO_BACKUP_ENABLED, toggle.checked ? 'true' : 'false');
            freqSelect.disabled = !toggle.checked;
            showToast(toggle.checked ? 'Auto-backup enabled' : 'Auto-backup disabled', 'success');
        });

        freqSelect?.addEventListener('change', () => {
            localStorage.setItem(STORAGE_KEYS.AUTO_BACKUP_FREQUENCY, freqSelect.value);
            showToast('Backup frequency updated', 'success');
        });
    }

    return { render };
})();

window.renderBackupRestore = BackupRestorePage.render;
window.BackupRestorePage = BackupRestorePage;
