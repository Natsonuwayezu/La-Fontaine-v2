/* ═══════════════════════════════════════════════════════════════════
   js/modules/staff/timetable-generator.js
   ═══════════════════════════════════════════════════════════════════
   NOTE: this is NOT an auto-scheduling algorithm. The timetable is
   built manually (by staff/timetable.js, one slot at a time, or via
   staff/timetable-import.js for bulk upload). This file's only job is
   to take a manually-assembled BATCH of draft slots, validate every
   one against each other and against what's already saved (no teacher
   or class double-booking), and insert only the ones that pass —
   reporting the rest as errors. Used as a staging area when building
   out a whole class's or a whole term's schedule at once, rather than
   one slot at a time through the Add Slot modal in timetable.js.

   Dependencies (plain-script globals loaded earlier in index.html):
   api.js: insertMany, refreshTable
   staff/timetable-conflicts.js: checkBatchConflicts, renderConflictPanel
   state.js: state
   utils.js: esc
   toast.js: showToast
   logger.js: logUpdateTimetable
   constants.js: DAYS_OF_WEEK, TIMETABLE_TIME_SLOTS, isBreakSlot
   ═══════════════════════════════════════════════════════════════════ */

const TimetableGenerator = (() => {

    let draftRows = [];

    function render(container) {
        if (!container) return;
        container.innerHTML = `
            <div class="settings-section">
                <div class="settings-section__title">Build &amp; Insert Timetable Batch</div>
                <div class="settings-section__desc">Add each slot you've planned below, then validate and insert them all at once. Conflicts are checked against each other and against the saved timetable — nothing is scheduled automatically.</div>
            </div>

            <div class="setting-card">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                    <div class="setting-title" style="margin:0;">Draft Slots (${draftRows.length})</div>
                    <div style="display:flex; gap:8px;">
                        <button class="btn btn-sm btn-outline" id="gen-add-row-btn"><i class="fa-solid fa-plus"></i> Add Row</button>
                        <button class="btn btn-sm btn-primary" id="gen-validate-btn" ${draftRows.length ? '' : 'disabled'}>
                            <i class="fa-solid fa-check-double"></i> Validate &amp; Insert All
                        </button>
                    </div>
                </div>
                <div id="gen-rows-table">${renderRowsTable()}</div>
                <div id="gen-result-slot"></div>
            </div>
        `;
        bindEvents(container);
    }

    function renderRowsTable() {
        if (!draftRows.length) return '<div class="setting-desc">No draft rows yet. Click "Add Row" to start.</div>';
        return `
            <table class="logs-table">
                <thead><tr><th>Class</th><th>Subject</th><th>Teacher</th><th>Day</th><th>Period</th><th></th></tr></thead>
                <tbody>
                    ${draftRows.map((r, idx) => `
                        <tr>
                            <td>${esc(classNameOf(r.class_id))}</td>
                            <td>${esc(subjectNameOf(r.subject_id))}</td>
                            <td>${esc(teacherNameOf(r.teacher_id))}</td>
                            <td>${esc((DAYS_OF_WEEK.find(d => d.id === r.day_of_week) || {}).name || '')}</td>
                            <td>${esc(TIMETABLE_TIME_SLOTS[r.period_number - 1] || '')}</td>
                            <td><button class="btn btn-sm btn-outline" data-remove-row="${idx}"><i class="fa-solid fa-trash"></i></button></td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
    }

    function classNameOf(id) { return (state.classes.find(c => String(c.id) === String(id)) || {}).name || '—'; }
    function subjectNameOf(id) { return (state.subjects.find(s => String(s.id) === String(id)) || {}).name || '—'; }
    function teacherNameOf(id) {
        const t = state.teachers.find(t => String(t.id) === String(id));
        return t ? `${t.first_name} ${t.last_name}` : '—';
    }

    function rowForm() {
        const periods = TIMETABLE_TIME_SLOTS
            .map((label, idx) => ({ label, periodNum: idx + 1 }))
            .filter((_, idx) => !isBreakSlot(TIMETABLE_TIME_SLOTS[idx]));

        return `
            <form id="gen-row-form">
                <div class="form-group"><label class="form-label">Class</label>
                    <select name="class_id" class="form-select" required>${state.classes.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select></div>
                <div class="form-group"><label class="form-label">Subject</label>
                    <select name="subject_id" class="form-select" required>${state.subjects.map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join('')}</select></div>
                <div class="form-group"><label class="form-label">Teacher</label>
                    <select name="teacher_id" class="form-select" required>${state.teachers.map(t => `<option value="${t.id}">${esc(t.first_name)} ${esc(t.last_name)}</option>`).join('')}</select></div>
                <div class="form-group"><label class="form-label">Day</label>
                    <select name="day_of_week" class="form-select" required>${DAYS_OF_WEEK.map(d => `<option value="${d.id}">${d.name}</option>`).join('')}</select></div>
                <div class="form-group"><label class="form-label">Period</label>
                    <select name="period_number" class="form-select" required>${periods.map(p => `<option value="${p.periodNum}">${p.label}</option>`).join('')}</select></div>
            </form>
        `;
    }

    function bindEvents(container) {
        container.querySelector('#gen-add-row-btn')?.addEventListener('click', () => {
            window.showModal(rowForm(), {
                title: 'Add Draft Slot',
                footer: `<button class="btn btn-outline" data-close>Cancel</button><button class="btn btn-primary" id="gen-save-row-btn">Add to Draft</button>`
            });
            document.getElementById('gen-save-row-btn').onclick = () => {
                const form = document.getElementById('gen-row-form');
                const data = Object.fromEntries(new FormData(form).entries());
                draftRows.push({
                    class_id: data.class_id, subject_id: data.subject_id, teacher_id: data.teacher_id,
                    day_of_week: Number(data.day_of_week), period_number: Number(data.period_number)
                });
                window.closeModal();
                render(container);
            };
        });

        container.addEventListener('click', (e) => {
            const rm = e.target.closest('[data-remove-row]');
            if (rm) { draftRows.splice(Number(rm.dataset.removeRow), 1); render(container); }
        });

        container.querySelector('#gen-validate-btn')?.addEventListener('click', () => validateAndInsert(container));
    }

    async function validateAndInsert(container) {
        const btn = container.querySelector('#gen-validate-btn');
        window.Loaders?.button?.start(btn, 'Checking...');
        try {
            if (!state.timetableSlots.length) state.timetableSlots = await getAll('timetable_slots');
            const { valid, invalid } = await checkBatchConflicts(draftRows, state.timetableSlots);

            if (valid.length) {
                await insertMany('timetable_slots', valid);
                await refreshTable('timetable_slots');
                await logUpdateTimetable(null, `batch of ${valid.length}`);
            }

            const resultSlot = container.querySelector('#gen-result-slot');
            resultSlot.innerHTML = renderConflictPanel(invalid.map(i => ({ slot: i.slot, conflicts: i.conflicts })));

            if (valid.length && !invalid.length) {
                showToast('Batch inserted', 'success', `${valid.length} slot${valid.length === 1 ? '' : 's'} added.`);
                draftRows = [];
            } else if (valid.length) {
                showToast('Partially inserted', 'success', `${valid.length} added, ${invalid.length} skipped due to conflicts.`);
                draftRows = invalid.map(i => i.slot);
            } else {
                showToast('Nothing inserted', 'error', 'All rows had conflicts — see details below.');
            }
            render(container);
        } finally {
            window.Loaders?.button?.stop(btn);
        }
    }

    function destroy() { draftRows = []; }

    return { render, destroy };
})();

window.renderTimetableGenerator = TimetableGenerator.render;
window.TimetableGenerator = TimetableGenerator;
