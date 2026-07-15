/* ═══════════════════════════════════════════════════════════════════
   js/modules/staff/teacher-timetable.js
   ═══════════════════════════════════════════════════════════════════
   Renders the weekly grid for ONE teacher (day columns × period rows),
   read-only. Used as a sub-view from staff/timetable.js ("By Teacher"
   tab), and reusable for a "my timetable" widget on teacher-dashboard.js.

   Dependencies (plain-script globals loaded earlier in index.html):
   api.js: getAll
   state.js: state
   utils.js: esc
   constants.js: DAYS_OF_WEEK, TIMETABLE_TIME_SLOTS, isBreakSlot, getBreakIcon
   ═══════════════════════════════════════════════════════════════════ */

async function getSlotsForTeacher(teacherId) {
    if (!state.timetableSlots.length) {
        state.timetableSlots = await getAll('timetable_slots');
    }
    return state.timetableSlots.filter(s => String(s.teacher_id) === String(teacherId));
}

/**
 * Render the read-only weekly grid for one teacher into `container`.
 * @param {string|number} teacherId
 * @param {HTMLElement} container
 */
async function renderTeacherTimetable(teacherId, container) {
    if (!container) return;
    const slots = await getSlotsForTeacher(teacherId);

    const cellFor = (dayId, periodNum) =>
        slots.find(s => Number(s.day_of_week) === dayId && Number(s.period_number) === periodNum);

    const rows = TIMETABLE_TIME_SLOTS.map((timeLabel, idx) => {
        const periodNum = idx + 1;
        if (isBreakSlot(timeLabel)) {
            return `<tr><td class="time-col">${timeLabel}</td><td class="break-row" colspan="${DAYS_OF_WEEK.length}">${getBreakIcon(timeLabel)} Break</td></tr>`;
        }
        return `
            <tr>
                <td class="time-col">${timeLabel}</td>
                ${DAYS_OF_WEEK.map(day => {
                    const slot = cellFor(day.id, periodNum);
                    if (!slot) return `<td><div class="timetable-slot empty">—</div></td>`;
                    const cls = (state.classes || []).find(c => String(c.id) === String(slot.class_id));
                    const subject = (state.subjects || []).find(s => String(s.id) === String(slot.subject_id));
                    return `
                        <td>
                            <div class="timetable-slot">
                                <div class="timetable-slot__subject">${esc(subject?.name || subject?.code || '—')}</div>
                                <div class="timetable-slot__teacher">${esc(cls?.name || '—')}</div>
                            </div>
                        </td>
                    `;
                }).join('')}
            </tr>
        `;
    }).join('');

    container.innerHTML = `
        <div class="timetable-wrap">
            <table class="timetable-table">
                <thead>
                    <tr><th>Time</th>${DAYS_OF_WEEK.map(d => `<th>${d.short}</th>`).join('')}</tr>
                </thead>
                <tbody>${rows}</tbody>
            </table>
        </div>
    `;
}

/* ═══════════════════════════════════════════════════════════════════
   EXPOSE
   ═══════════════════════════════════════════════════════════════════ */

window.getSlotsForTeacher = getSlotsForTeacher;
window.renderTeacherTimetable = renderTeacherTimetable;
