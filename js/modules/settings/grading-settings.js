/* ═══════════════════════════════════════════════════════════════════
   js/modules/settings/grading-settings.js
   ═══════════════════════════════════════════════════════════════════
   Rendered into #app-main by core/router.js for the 'grading-scale'
   nav item. Edits the grading_scale table and the pass mark, via the
   data layer in settings/grading-scale.js (loaded just before this).
   ═══════════════════════════════════════════════════════════════════ */

const GradingSettings = (() => {

    async function render(container) {
        if (!container) return;
        container.innerHTML = `<div class="dashboard-page"><div class="loading-inline">Loading grading settings…</div></div>`;

        const [bands, passMark] = await Promise.all([listGradingScale(), getPassMarkSetting()]);

        container.innerHTML = `
            <div class="dashboard-page">
                ${window.SettingsTabs ? window.SettingsTabs.render('grading-scale') : ''}
                <div class="settings-section">
                    <div class="settings-section__title">Grading Scale</div>
                    <div class="settings-section__desc">Grade boundaries, colors, and the pass mark used across marks entry, report cards, and rankings.</div>
                </div>

                <div class="setting-card" style="margin-bottom:16px;">
                    <div class="pass-mark-slider-row">
                        <label class="form-label" for="pass-mark-input">Pass Mark</label>
                        <input type="range" id="pass-mark-slider" min="0" max="100" value="${passMark}">
                        <input type="number" id="pass-mark-input" class="form-input" style="width:80px;" min="0" max="100" value="${passMark}">
                        <span>%</span>
                        <button class="btn btn-sm btn-primary" id="save-pass-mark-btn">Save</button>
                    </div>
                </div>

                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                    <div class="settings-section__title" style="margin:0;">Grade Bands</div>
                    <div style="display:flex; gap:8px;">
                        <button class="btn btn-sm btn-outline" id="reset-grades-btn"><i class="fa-solid fa-rotate-left"></i> Reset to Default</button>
                        <button class="btn btn-sm btn-primary" id="add-grade-btn"><i class="fa-solid fa-plus"></i> Add Grade Band</button>
                    </div>
                </div>

                <div id="grade-bands-list">
                    ${bands.map(b => renderBandRow(b)).join('')}
                </div>
            </div>
        `;

        bindEvents(container);
    }

    function renderBandRow(b) {
        return `
            <div class="grade-band-row" data-band-id="${b.id || ''}">
                <span class="grade-band-color-swatch" style="background:${esc(b.color || '#6b5f56')};"></span>
                <span class="grade-band-row__letter">${esc(b.grade)}</span>
                <span>${b.min}–${b.max}</span>
                <span>${esc(b.desc || '')}</span>
                ${b.id ? `
                    <button class="btn btn-sm btn-outline" data-edit-band="${b.id}"><i class="fa-solid fa-pen"></i></button>
                    <button class="btn btn-sm btn-outline" data-delete-band="${b.id}"><i class="fa-solid fa-trash"></i></button>
                ` : '<span class="setting-desc">(default — not yet saved to DB)</span>'}
            </div>
        `;
    }

    function bandForm(existing = null) {
        return `
            <form id="band-form">
                <div class="form-group">
                    <label class="form-label">Grade Label</label>
                    <input type="text" name="grade" class="form-input" placeholder="e.g. A+" value="${existing ? esc(existing.grade) : ''}" required>
                </div>
                <div class="form-group" style="display:flex; gap:10px;">
                    <div style="flex:1;">
                        <label class="form-label">Min %</label>
                        <input type="number" name="min" class="form-input" min="0" max="100" value="${existing ? existing.min : ''}" required>
                    </div>
                    <div style="flex:1;">
                        <label class="form-label">Max %</label>
                        <input type="number" name="max" class="form-input" min="0" max="100" value="${existing ? existing.max : ''}" required>
                    </div>
                </div>
                <div class="form-group">
                    <label class="form-label">Description</label>
                    <input type="text" name="desc" class="form-input" placeholder="e.g. Excellent" value="${existing ? esc(existing.desc || '') : ''}">
                </div>
                <div class="form-group">
                    <label class="form-label">Color</label>
                    <input type="color" name="color" class="form-input" value="${existing ? esc(existing.color || '#6b5f56') : '#6b5f56'}">
                </div>
            </form>
        `;
    }

    function bindEvents(container) {
        const slider = container.querySelector('#pass-mark-slider');
        const input = container.querySelector('#pass-mark-input');
        slider?.addEventListener('input', () => { input.value = slider.value; });
        input?.addEventListener('input', () => { slider.value = input.value; });

        container.querySelector('#save-pass-mark-btn')?.addEventListener('click', async () => {
            const result = await setPassMarkSetting(input.value);
            if (result.success) showToast('Pass mark updated', 'success');
            else showToast('Could not save', 'error', result.error);
        });

        container.querySelector('#reset-grades-btn')?.addEventListener('click', async () => {
            const ok = await confirmDialog('Reset the grading scale to the default bands? Any custom bands will be deleted.', 'Reset Grading Scale');
            if (!ok) return;
            await resetGradingScaleToDefault();
            showToast('Grading scale reset', 'success');
            render(container);
        });

        container.querySelector('#add-grade-btn')?.addEventListener('click', () => openBandModal(container));

        container.querySelectorAll('[data-edit-band]').forEach(btn => {
            btn.addEventListener('click', async () => {
                const bands = await listGradingScale();
                const band = bands.find(b => String(b.id) === btn.dataset.editBand);
                openBandModal(container, band);
            });
        });

        container.querySelectorAll('[data-delete-band]').forEach(btn => {
            btn.addEventListener('click', async () => {
                const ok = await confirmDialog('Delete this grade band?', 'Delete Grade Band');
                if (!ok) return;
                await deleteGradeBand(btn.dataset.deleteBand);
                render(container);
            });
        });
    }

    function openBandModal(container, existing = null) {
        window.showModal(bandForm(existing), {
            title: existing ? 'Edit Grade Band' : 'Add Grade Band',
            footer: `<button class="btn btn-outline" data-close>Cancel</button>
                     <button class="btn btn-primary" id="save-band-btn">Save</button>`
        });
        document.getElementById('save-band-btn').onclick = async () => {
            const form = document.getElementById('band-form');
            const data = Object.fromEntries(new FormData(form).entries());
            const result = existing
                ? await updateGradeBand(existing.id, data)
                : await createGradeBand(data);
            if (result.success) {
                showToast(existing ? 'Grade band updated' : 'Grade band added', 'success');
                window.closeModal();
                render(container);
            } else {
                showToast('Could not save', 'error', result.error);
            }
        };
    }

    return { render };
})();

window.renderGradingSettings = GradingSettings.render;
window.GradingSettings = GradingSettings;
