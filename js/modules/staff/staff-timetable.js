/* ═══════════════════════════════════════════════════════════════════
   js/modules/staff/staff-timetable.js
   ═══════════════════════════════════════════════════════════════════
   School-wide staff availability overview — one row per teacher, one
   column per (day, period), showing which class each teacher is busy
   with, or "Free" if not. This is the view an admin uses while
   manually building the timetable, to see at a glance who's free
   before creating a new slot (the timetable itself is entered
   manually — see staff/timetable.js — not auto-generated).

   Dependencies (plain-script globals loaded earlier in index.html):
   api.js: getAll
   state.js: state
   staff/teachers.js: activeTeachersOnly, teacherFullName
   utils.js: esc
   constants.js: DAYS_OF_WEEK, TIMETABLE_TIME_SLOTS, isBreakSlot
   ═══════════════════════════════════════════════════════════════════ */

const StaffTimetableOverview = (() => {

    let selectedDay = 1; // Monday

    async function render(container) {
        if (!container) return;
        if (!state.timetableSlots.length) {
            state.timetableSlots = await getAll('timetable_slots');
        }
        const teachers = await activeTeachersOnly();
        const periods = TIMETABLE_TIME_SLOTS
            .map((label, idx) => ({ label, periodNum: idx + 1, isBreak: isBreakSlot(label) }))
            .filter(p => !p.isBreak);

        container.innerHTML = `
            <div class="timetable-toolbar">
                <div class="timetable-view-tabs">
                    ${DAYS_OF_WEEK.map(d => `
                        <button class="timetable-view-tab ${d.id === selectedDay ? 'active' : ''}" data-staff-day="${d.id}">${d.short}</button>
                    `).join('')}
                </div>
                <div class="timetable-toolbar__spacer"></div>
            </div>
            <div class="timetable-wrap">
                <table class="timetable-table">
                    <thead>
                        <tr><th>Teacher</th>${periods.map(p => `<th>${p.label}</th>`).join('')}</tr>
                    </thead>
                    <tbody>
                        ${teachers.map(t => `
                            <tr>
                                <td class="time-col">${esc(teacherFullName(t))}</td>
                                ${periods.map(p => {
                                    const busy = state.timetableSlots.find(s =>
                                        String(s.teacher_id) === String(t.id) &&
                                        Number(s.day_of_week) === selectedDay &&
                                        Number(s.period_number) === p.periodNum);
                                    if (!busy) return `<td><div class="timetable-slot empty">Free</div></td>`;
                                    const cls = (state.classes || []).find(c => String(c.id) === String(busy.class_id));
                                    return `<td><div class="timetable-slot"><div class="timetable-slot__subject">${esc(cls?.name || 'Busy')}</div></div></td>`;
                                }).join('')}
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;

        container.querySelectorAll('[data-staff-day]').forEach(btn => {
            btn.addEventListener('click', () => {
                selectedDay = Number(btn.dataset.staffDay);
                render(container);
            });
        });
    }

    function destroy() { selectedDay = 1; }

    return { render, destroy };
})();

window.StaffTimetableOverview = StaffTimetableOverview;

// Router bridge
window.renderStaffTimetable = function(container, params) {
    return StaffTimetableOverview.render(container, params);
};
