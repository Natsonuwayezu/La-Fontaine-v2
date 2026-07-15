/* ═══════════════════════════════════════════════════════════════════
   js/modules/settings/api-settings.js
   ═══════════════════════════════════════════════════════════════════
   Sub-panel for the Supabase connection (URL + anon key). Not its own
   nav item — rendered inside settings/school-settings.js or accessed
   via an "Advanced" link, since misconfiguring this disconnects the
   whole app from its database. Kept as a separate, careful module for
   that reason.

   Dependencies (plain-script globals loaded earlier in index.html):
   supabase-config.js: getSupabaseCredentials, setSupabaseCredentials,
                        resetSupabaseCredentials
   utils.js: esc
   toast.js: showToast
   modals.js: confirmDialog
   logger.js: logAction
   ═══════════════════════════════════════════════════════════════════ */

const ApiSettingsPanel = (() => {

    function render(container) {
        if (!container) return;
        const creds = getSupabaseCredentials();

        container.innerHTML = `
            <div class="settings-section">
                <div class="settings-section__title">Database Connection</div>
                <div class="settings-section__desc">
                    Advanced — only change this if you're pointing the app at a different Supabase project.
                    Incorrect values will disconnect the app from its database.
                </div>
            </div>

            <div class="setting-card">
                ${creds.isUsingDefaults ? '<div class="badge badge-success" style="margin-bottom:10px;">Using default project</div>' : '<div class="badge" style="margin-bottom:10px;">Using custom project</div>'}

                <form id="api-settings-form">
                    <div class="form-group">
                        <label class="form-label">Supabase URL</label>
                        <input type="url" name="url" class="form-input" value="${esc(creds.url)}" required>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Supabase Anon Key</label>
                        <input type="password" name="key" class="form-input" value="${esc(creds.key)}" required>
                    </div>
                    <div style="display:flex; gap:10px;">
                        <button type="submit" class="btn btn-primary" id="save-api-settings-btn">
                            <i class="fa-solid fa-floppy-disk"></i> Save &amp; Reconnect
                        </button>
                        <button type="button" class="btn btn-outline" id="reset-api-settings-btn">
                            <i class="fa-solid fa-rotate-left"></i> Reset to Default
                        </button>
                    </div>
                </form>
            </div>
        `;

        bindEvents(container);
    }

    function bindEvents(container) {
        container.querySelector('#api-settings-form')?.addEventListener('submit', async (e) => {
            e.preventDefault();
            const ok = await confirmDialog(
                'This will reconnect the app to a different database. Make sure the URL and key are correct.',
                'Change Database Connection'
            );
            if (!ok) return;

            const data = Object.fromEntries(new FormData(e.target).entries());
            const client = setSupabaseCredentials(data.url.trim(), data.key.trim());
            if (client) {
                await logAction('API_SETTINGS_CHANGED', 'school_settings', null, { url: data.url });
                showToast('Database connection updated', 'success');
                render(container);
            } else {
                showToast('Could not connect', 'error', 'Check the URL and key and try again.');
            }
        });

        container.querySelector('#reset-api-settings-btn')?.addEventListener('click', async () => {
            const ok = await confirmDialog('Reset to the default database connection?', 'Reset Connection');
            if (!ok) return;
            resetSupabaseCredentials();
            await logAction('API_SETTINGS_RESET', 'school_settings', null);
            showToast('Reset to default connection', 'success');
            render(container);
        });
    }

    return { render };
})();

window.renderApiSettings = ApiSettingsPanel.render;
window.ApiSettingsPanel = ApiSettingsPanel;
