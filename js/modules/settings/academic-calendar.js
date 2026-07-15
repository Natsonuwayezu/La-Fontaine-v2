/* ═══════════════════════════════════════════════════════════════════
   js/modules/settings/academic-calendar.js
   ═══════════════════════════════════════════════════════════════════
   Rendered into #app-main by core/router.js for the 'academic-calendar'
   nav item. Lists academic years, and for the expanded year, its terms
   (with midterm dates). Data layer lives in settings/academic-years.js,
   loaded just before this file.
   ═══════════════════════════════════════════════════════════════════ */

const AcademicCalendar = (() => {

    let expandedYearId = null;

    function fmtD(iso) {
        if (!iso) return '—';
        const d = new Date(iso);
        return isNaN(d) ? iso : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    }

    async function render(container) {
        if (!container) return;
        container.innerHTML = `<div class="dashboard-page"><div class="loading-inline">Loading academic calendar…</div></div>`;

        await ensureStateLoaded();
        const years = await listAcademicYears();

        container.innerHTML = `
            <div class="dashboard-page">
                ${window.SettingsTabs ? window.SettingsTabs.render('academic-calendar') : ''}
                <div class="settings-section">
                    <div class="settings-section__title">Academic Years &amp; Terms</div>
                    <div class="settings-section__desc">Manage academic years, their three terms, and midterm dates.</div>
                </div>

                <div style="display:flex; justify-content:flex-end; margin-bottom:12px;">
                    <button class="btn btn-primary" id="cal-add-year-btn"><i class="fa-solid fa-plus"></i> Add Academic Year</button>
                </div>

                <div id="cal-years-list">
                    ${years.length ? years.map(y => renderYearCard(y)).join('') : emptyState()}
                </div>
            </div>
        `;

        bindEvents(container);
        if (expandedYearId) {
            const list = container.querySelector('#cal-years-list');
            renderTermsForYear(list, expandedYearId);
        }
    }

    function emptyState() {
        return `<div class="setting-card" style="text-align:center; padding:30px;">
            <div class="setting-desc">No academic years yet. Add one to get started.</div>
        </div>`;
    }

    function renderYearCard(y) {
        return `
            <div class="setting-card" data-year-card="${y.id}" style="margin-bottom:12px;">
                <div style="display:flex; align-items:center; gap:12px; cursor:pointer;" data-toggle-year="${y.id}">
                    <div class="setting-icon"><i class="fa-solid fa-calendar-days"></i></div>
                    <div style="flex:1;">
                        <div class="setting-title">${esc(y.year_name)} ${y.is_active ? '<span class="badge badge-success">Active</span>' : ''}</div>
                        <div class="setting-desc">${fmtD(y.start_date)} — ${fmtD(y.end_date)}</div>
                    </div>
                    ${!y.is_active ? `<button class="btn btn-sm btn-outline" data-activate-year="${y.id}">Set Active</button>` : ''}
                    <button class="btn btn-sm btn-outline" data-edit-year="${y.id}"><i class="fa-solid fa-pen"></i></button>
                    <button class="btn btn-sm btn-outline" data-delete-year="${y.id}"><i class="fa-solid fa-trash"></i></button>
                    <i class="fa-solid fa-chevron-down"></i>
                </div>
                <div class="cal-terms-slot" data-terms-slot="${y.id}"></div>
            </div>
        `;
    }

    async function renderTermsForYear(listEl, yearId) {
        const slot = listEl.querySelector(`[data-terms-slot="${yearId}"]`);
        if (!slot) return;
        const terms = await listTermsForYear(yearId);

        slot.innerHTML = `
            <div style="padding:14px 14px 4px 46px;">
                ${terms.map(t => `
                    <div class="term-editor-row" data-term-id="${t.id}">
                        <span class="term-editor-row__label">Term ${t.term_number}</span>
                        <span>${fmtD(t.start_date)} — ${fmtD(t.end_date)}</span>
                        <span>Midterm: ${fmtD(t.midterm_date)}</span>
                        <span class="badge">${esc(t.status || 'upcoming')}</span>
                        <button class="btn btn-sm btn-outline" data-edit-term="${t.id}" data-year="${yearId}"><i class="fa-solid fa-pen"></i></button>
                        <button class="btn btn-sm btn-outline" data-delete-term="${t.id}"><i class="fa-solid fa-trash"></i></button>
                    </div>
                `).join('') || '<div class="setting-desc" style="padding:8px 0;">No terms yet.</div>'}
                <button class="btn btn-sm btn-outline" data-add-term="${yearId}" style="margin-top:8px;">
                    <i class="fa-solid fa-plus"></i> Add Term
                </button>
            </div>
        `;
    }

    function yearForm(existing = null) {
        return `
            <form id="year-form">
                <div class="form-group">
                    <label class="form-label">Year Name</label>
                    <input type="text" name="year_name" class="form-input" placeholder="e.g. 2026-2027" value="${existing ? esc(existing.year_name) : ''}" required>
                </div>
                <div class="form-group">
                    <label class="form-label">Start Date</label>
                    <input type="date" name="start_date" class="form-input" value="${existing ? esc(existing.start_date) : ''}" required>
                </div>
                <div class="form-group">
                    <label class="form-label">End Date</label>
                    <input type="date" name="end_date" class="form-input" value="${existing ? esc(existing.end_date) : ''}" required>
                </div>
            </form>
        `;
    }

    function termForm(yearId, existing = null) {
        return `
            <form id="term-form">
                <input type="hidden" name="academic_year_id" value="${yearId}">
                <div class="form-group">
                    <label class="form-label">Term Number</label>
                    <select name="term_number" class="form-select" required>
                        ${[1, 2, 3].map(n => `<option value="${n}" ${existing?.term_number === n ? 'selected' : ''}>Term ${n}</option>`).join('')}
                    </select>
                </div>
                <div class="form-group">
                    <label class="form-label">Start Date</label>
                    <input type="date" name="start_date" class="form-input" value="${existing ? esc(existing.start_date) : ''}" required>
                </div>
                <div class="form-group">
                    <label class="form-label">End Date</label>
                    <input type="date" name="end_date" class="form-input" value="${existing ? esc(existing.end_date) : ''}" required>
                </div>
                <div class="form-group">
                    <label class="form-label">Midterm Date</label>
                    <input type="date" name="midterm_date" class="form-input" value="${existing ? esc(existing.midterm_date || '') : ''}">
                </div>
                <div class="form-group">
                    <label class="form-label">Status</label>
                    <select name="status" class="form-select">
                        ${TERM_STATUSES.map(s => `<option value="${s}" ${existing?.status === s ? 'selected' : ''}>${s.replace('_', ' ')}</option>`).join('')}
                    </select>
                </div>
            </form>
        `;
    }

    function bindEvents(container) {
        container.querySelector('#cal-add-year-btn')?.addEventListener('click', () => {
            window.showModal(yearForm(), {
                title: 'Add Academic Year',
                footer: `<button class="btn btn-outline" data-close>Cancel</button>
                         <button class="btn btn-primary" id="save-year-btn">Save</button>`
            });
            document.getElementById('save-year-btn').onclick = async () => {
                const form = document.getElementById('year-form');
                const data = Object.fromEntries(new FormData(form).entries());
                const result = await createAcademicYear(data);
                if (result.success) {
                    showToast('Academic year created', 'success');
                    window.closeModal();
                    render(container);
                } else {
                    showToast('Please fix the errors', 'error', Object.values(result.errors || {})[0]);
                }
            };
        });

        container.querySelectorAll('[data-toggle-year]').forEach(el => {
            el.addEventListener('click', (e) => {
                if (e.target.closest('button')) return;
                const yearId = el.dataset.toggleYear;
                expandedYearId = (expandedYearId === yearId) ? null : yearId;
                const list = container.querySelector('#cal-years-list');
                if (expandedYearId) renderTermsForYear(list, expandedYearId);
                else {
                    const slot = list.querySelector(`[data-terms-slot="${yearId}"]`);
                    if (slot) slot.innerHTML = '';
                }
            });
        });

        container.querySelectorAll('[data-activate-year]').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                await setActiveAcademicYear(btn.dataset.activateYear);
                render(container);
            });
        });

        container.querySelectorAll('[data-delete-year]').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const ok = await confirmDialog('Delete this academic year? This cannot be undone.', 'Delete Academic Year');
                if (!ok) return;
                const result = await deleteAcademicYear(btn.dataset.deleteYear);
                if (result.success) render(container);
            });
        });

        container.querySelectorAll('[data-add-term]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const yearId = btn.dataset.addTerm;
                window.showModal(termForm(yearId), {
                    title: 'Add Term',
                    footer: `<button class="btn btn-outline" data-close>Cancel</button>
                             <button class="btn btn-primary" id="save-term-btn">Save</button>`
                });
                document.getElementById('save-term-btn').onclick = async () => {
                    const form = document.getElementById('term-form');
                    const data = Object.fromEntries(new FormData(form).entries());
                    const result = await createTerm(data);
                    if (result.success) {
                        showToast('Term added', 'success');
                        window.closeModal();
                        expandedYearId = yearId;
                        render(container);
                    } else {
                        showToast('Please fix the errors', 'error', Object.values(result.errors || {})[0]);
                    }
                };
            });
        });

        container.addEventListener('click', async (e) => {
            const delBtn = e.target.closest('[data-delete-term]');
            if (delBtn) {
                const ok = await confirmDialog('Delete this term?', 'Delete Term');
                if (ok) { await deleteTerm(delBtn.dataset.deleteTerm); render(container); }
            }
        });
    }

    function destroy() { expandedYearId = null; }

    return { render, destroy };
})();

window.renderAcademicCalendar = AcademicCalendar.render;
window.AcademicCalendar = AcademicCalendar;
