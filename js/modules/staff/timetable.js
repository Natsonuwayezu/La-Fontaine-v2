/* ═══════════════════════════════════════════════════════════════════
   js/modules/staff/timetable.js
   ═══════════════════════════════════════════════════════════════════
   Rendered into #app-main by core/router.js for the 'timetable' nav
   item — the master timetable page. Three tabs (By Class / By Teacher
   / Staff Availability), each delegating to its own sub-view file,
   plus manual slot entry with conflict checking on save (the
   timetable is built manually, one slot at a time or via bulk import —
   see staff/timetable-import.js — there is no auto-scheduler).

   Dependencies (plain-script globals loaded earlier in index.html):
   api.js: getAll, insert, update, remove, refreshTable
   staff/class-timetable.js: renderClassTimetable
   staff/teacher-timetable.js: renderTeacherTimetable
   staff/staff-timetable.js: window.StaffTimetableOverview
   staff/timetable-conflicts.js: checkSlotConflicts, renderConflictPanel
   staff/teachers.js, staff/subjects.js: for form dropdowns
   utils.js: esc
   toast.js: showToast
   modals.js: showModal, closeModal, confirmDialog
   logger.js: logUpdateTimetable
   constants.js: DAYS_OF_WEEK, TIMETABLE_TIME_SLOTS, isBreakSlot
   ═══════════════════════════════════════════════════════════════════ */

const TimetablePage = (() => {

    let activeTab = 'class';
    let selectedClassId = null;
    let selectedTeacherId = null;

    async function render(container) {
        if (!container) return;
        container.innerHTML = `<div class="dashboard-page"><div class="loading-inline">Loading timetable…</div></div>`;

        await ensureStateLoaded();
        if (!(state.timetableSlots||[]).length) state.timetableSlots = await getAll('timetable_slots');

        selectedClassId = selectedClassId || state.classes[0]?.id || null;
        selectedTeacherId = selectedTeacherId || state.teachers[0]?.id || null;

        container.innerHTML = `
            <div class="dashboard-page">
                <div class="timetable-toolbar">
                    <div class="timetable-view-tabs">
                        <button class="timetable-view-tab ${activeTab === 'class' ? 'active' : ''}" data-tt-tab="class">By Class</button>
                        <button class="timetable-view-tab ${activeTab === 'teacher' ? 'active' : ''}" data-tt-tab="teacher">By Teacher</button>
                        <button class="timetable-view-tab ${activeTab === 'staff' ? 'active' : ''}" data-tt-tab="staff">Staff Availability</button>
                    </div>
                    <div class="timetable-toolbar__spacer"></div>
                    ${activeTab !== 'staff' ? `
                        <select class="form-select" id="tt-scope-select">
                            ${activeTab === 'class'
                                ? (state.classes||[]).map(c => `<option value="${c.id}" ${c.id === selectedClassId ? 'selected' : ''}>${esc(c.name)}</option>`).join('')
                                : (state.teachers||[]).map(t => `<option value="${t.id}" ${t.id === selectedTeacherId ? 'selected' : ''}>${esc(t.first_name)} ${esc(t.last_name)}</option>`).join('')}
                        </select>
                    ` : ''}
                    <button class="btn btn-primary" id="tt-add-slot-btn"><i class="fa-solid fa-plus"></i> Add Slot</button>
                    <button class="btn btn-outline" id="tt-import-btn"><i class="fa-solid fa-file-import"></i> Bulk Import</button>
                </div>

                <div class="timetable-legend">
                    <div class="timetable-legend-item"><span class="timetable-legend-swatch"></span> Scheduled</div>
                    <div class="timetable-legend-item"><span class="timetable-legend-swatch" style="opacity:.4;"></span> Free</div>
                </div>

                <div id="tt-view-slot"></div>
            </div>
        `;

        await renderActiveView(container);
        bindEvents(container);
    }

    async function renderActiveView(container) {
        const slot = container.querySelector('#tt-view-slot');
        if (activeTab === 'class') await renderClassTimetable(selectedClassId, slot);
        else if (activeTab === 'teacher') await renderTeacherTimetable(selectedTeacherId, slot);
        else await window.StaffTimetableOverview.render(slot);
    }

    function slotForm() {
        const periods = TIMETABLE_TIME_SLOTS
            .map((label, idx) => ({ label, periodNum: idx + 1 }))
            .filter((_, idx) => !isBreakSlot(TIMETABLE_TIME_SLOTS[idx]));

        return `
            <form id="slot-form">
                <div class="form-group"><label class="form-label">Class</label>
                    <select name="class_id" class="form-select" required>
                        ${(state.classes||[]).map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}
                    </select></div>
                <div class="form-group"><label class="form-label">Subject</label>
                    <select name="subject_id" class="form-select" required>
                        ${(state.subjects||[]).map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join('')}
                    </select></div>
                <div class="form-group"><label class="form-label">Teacher</label>
                    <select name="teacher_id" class="form-select" required>
                        ${(state.teachers||[]).map(t => `<option value="${t.id}">${esc(t.first_name)} ${esc(t.last_name)}</option>`).join('')}
                    </select></div>
                <div class="form-group"><label class="form-label">Day</label>
                    <select name="day_of_week" class="form-select" required>
                        ${DAYS_OF_WEEK.map(d => `<option value="${d.id}">${d.name}</option>`).join('')}
                    </select></div>
                <div class="form-group"><label class="form-label">Period</label>
                    <select name="period_number" class="form-select" required>
                        ${periods.map(p => `<option value="${p.periodNum}">${p.label}</option>`).join('')}
                    </select></div>
                <div class="form-group"><label class="form-label">Room (optional)</label>
                    <input type="text" name="room" class="form-input"></div>
                <div id="slot-conflict-slot"></div>
            </form>
        `;
    }

    function bindEvents(container) {
        container.querySelectorAll('[data-tt-tab]').forEach(btn => {
            btn.addEventListener('click', () => { activeTab = btn.dataset.ttTab; render(container); });
        });

        container.querySelector('#tt-scope-select')?.addEventListener('change', (e) => {
            if (activeTab === 'class') selectedClassId = e.target.value;
            else selectedTeacherId = e.target.value;
            renderActiveView(container);
        });

        container.querySelector('#tt-add-slot-btn')?.addEventListener('click', () => {
            window.showModal(slotForm(), {
                title: 'Add Timetable Slot',
                footer: `<button class="btn btn-outline" data-close>Cancel</button>
                         <button class="btn btn-primary" id="save-slot-btn">Save</button>`
            });
            document.getElementById('save-slot-btn').onclick = () => saveNewSlot(container);
        });

        container.querySelector('#tt-import-btn')?.addEventListener('click', () => {
            window.renderTimetableImport?.(container);
        });
    }

    async function saveNewSlot(container) {
        const form = document.getElementById('slot-form');
        const data = Object.fromEntries(new FormData(form).entries());
        const slot = {
            class_id: data.class_id,
            subject_id: data.subject_id,
            teacher_id: data.teacher_id,
            day_of_week: Number(data.day_of_week),
            period_number: Number(data.period_number),
            room: data.room || null
        };

        const conflicts = await checkSlotConflicts(slot, state.timetableSlots);
        if (conflicts.length) {
            document.getElementById('slot-conflict-slot').innerHTML =
                renderConflictPanel(conflicts.map(c => ({ slot, conflicts: [c] })));
            return;
        }

        const row = await insert('timetable_slots', slot);
        await refreshTable('timetable_slots');
        await logUpdateTimetable(slot.class_id, (state.classes||[]).find(c => c.id === slot.class_id)?.name);
        
        if (typeof loadAllData === 'function') loadAllData({ silent: true }).catch(() => {});
        showToast('Slot added', 'success');
        window.closeModal();
        render(container);
    }

    function destroy() { activeTab = 'class'; selectedClassId = null; selectedTeacherId = null; }

    return { render, destroy };
})();

window.renderTimetable = TimetablePage.render;
window.TimetablePage = TimetablePage;
