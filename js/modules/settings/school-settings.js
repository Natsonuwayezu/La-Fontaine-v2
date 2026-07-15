/* ═══════════════════════════════════════════════════════════════════
   js/modules/settings/school-settings.js
   ═══════════════════════════════════════════════════════════════════
   Rendered into #app-main by core/router.js for the 'school-settings'
   nav item. Edits the school_settings key/value table: name, motto,
   logo, head teacher, and contact details.

   Dependencies (plain-script globals loaded earlier in index.html):
   api.js: getSchoolSettings, updateSchoolSetting
   utils.js: esc
   toast.js: showToast
   theme.js: applySchoolLogo
   logger.js: logAction
   loaders.js: window.Loaders
   ═══════════════════════════════════════════════════════════════════ */

const SchoolSettingsPage = (() => {

    const FIELDS = [
        { key: 'school_name', label: 'School Name', type: 'text', placeholder: 'ECOLE LA FONTAINE' },
        { key: 'school_motto', label: 'School Motto', type: 'text', placeholder: 'School Management System' },
        { key: 'head_teacher_name', label: 'Head Teacher Name', type: 'text', placeholder: '' },
        { key: 'contact_phone', label: 'Contact Phone', type: 'tel', placeholder: '' },
        { key: 'contact_email', label: 'Contact Email', type: 'email', placeholder: '' },
        { key: 'address', label: 'Address', type: 'text', placeholder: 'Rubavu, Rwanda' },
    ];

    async function render(container) {
        if (!container) return;
        container.innerHTML = `<div class="dashboard-page"><div class="loading-inline">Loading school settings…</div></div>`;

        const settings = await getSchoolSettings();

        container.innerHTML = `
            <div class="dashboard-page">
                ${window.SettingsTabs ? window.SettingsTabs.render('school-settings') : ''}
                <div class="settings-section">
                    <div class="settings-section__title">School Settings</div>
                    <div class="settings-section__desc">Name, logo, head teacher, and contact details shown across the app and on printed documents.</div>
                </div>

                <form id="school-settings-form" class="setting-card">
                    <div class="form-group">
                        <label class="form-label">School Logo</label>
                        <div style="display:flex; align-items:center; gap:14px;">
                            <img id="logo-preview" src="${esc(settings.school_logo || '')}" alt="School logo"
                                 style="width:64px; height:64px; object-fit:contain; border-radius:10px; background:var(--card-bg,#241a2e); ${settings.school_logo ? '' : 'display:none;'}">
                            <input type="file" id="logo-file-input" accept="image/*" style="display:none;">
                            <button type="button" class="btn btn-sm btn-outline" id="logo-upload-btn"><i class="fa-solid fa-upload"></i> Upload Logo</button>
                            <input type="hidden" name="school_logo" id="school_logo_hidden" value="${esc(settings.school_logo || '')}">
                        </div>
                    </div>

                    ${FIELDS.map(f => `
                        <div class="form-group">
                            <label class="form-label">${f.label}</label>
                            <input type="${f.type}" name="${f.key}" class="form-input" placeholder="${f.placeholder}" value="${esc(settings[f.key] || '')}">
                        </div>
                    `).join('')}

                    <button type="submit" class="btn btn-primary" id="save-school-settings-btn">
                        <i class="fa-solid fa-floppy-disk"></i> Save Changes
                    </button>
                </form>
            </div>
        `;

        bindEvents(container);
    }

    function bindEvents(container) {
        const form = container.querySelector('#school-settings-form');
        const fileInput = container.querySelector('#logo-file-input');
        const preview = container.querySelector('#logo-preview');
        const hidden = container.querySelector('#school_logo_hidden');

        container.querySelector('#logo-upload-btn')?.addEventListener('click', () => fileInput.click());

        fileInput?.addEventListener('change', () => {
            const file = fileInput.files[0];
            if (!file) return;
            if (file.size > MAX_UPLOAD_SIZE_MB * 1024 * 1024) {
                showToast('File too large', 'error', `Logo must be under ${MAX_UPLOAD_SIZE_MB}MB.`);
                return;
            }
            const reader = new FileReader();
            reader.onload = () => {
                preview.src = reader.result;
                preview.style.display = '';
                hidden.value = reader.result;
            };
            reader.readAsDataURL(file);
        });

        form?.addEventListener('submit', async (e) => {
            e.preventDefault();
            const btn = container.querySelector('#save-school-settings-btn');
            window.Loaders?.button?.start(btn, 'Saving...');

            try {
                const data = Object.fromEntries(new FormData(form).entries());
                await Promise.all(Object.entries(data).map(([key, value]) => updateSchoolSetting(key, value)));
                await refreshTable('school_settings');
                applySchoolLogo?.(data.school_logo);
                await logAction('SCHOOL_SETTINGS_UPDATED', 'school_settings', null, { keys: Object.keys(data) });
                showToast('School settings saved', 'success');
            } catch (err) {
                showToast('Could not save settings', 'error', err.message);
            } finally {
                window.Loaders?.button?.stop(btn);
            }
        });
    }

    return { render };
})();

window.renderSchoolSettings = SchoolSettingsPage.render;
window.SchoolSettingsPage = SchoolSettingsPage;
