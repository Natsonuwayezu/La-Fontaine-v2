/* ═══════════════════════════════════════════════════════════════════
   js/modules/staff/class-timetable.js
   ═══════════════════════════════════════════════════════════════════
   Renders the weekly grid for ONE class (day columns × period rows),
   read-only. Used as a sub-view from staff/timetable.js ("By Class"
   tab) and can be reused anywhere a single class's schedule is needed.

   Dependencies (plain-script globals loaded earlier in index.html):
   api.js: getAll
   state.js: state
   staff/teachers.js: getTeacherById, teacherFullName
   staff/subjects.js: getSubjectById
   utils.js: esc
   constants.js: DAYS_OF_WEEK, TIMETABLE_TIME_SLOTS, BREAK_SLOTS,
                 isBreakSlot, getBreakIcon
   ═══════════════════════════════════════════════════════════════════ */

async function getSlotsForClass(classId) {
    if (!state.timetableSlots.length) {
        state.timetableSlots = await getAll('timetable_slots');
    }
    return state.timetableSlots.filter(s => String(s.class_id) === String(classId));
}

/**
 * Render the read-only weekly grid for one class into `container`.
 * @param {string|number} classId
 * @param {HTMLElement} container
 */
async function renderClassTimetable(classId, container) {
    if (!container) return;
    const slots = await getSlotsForClass(classId);

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
                    const subject = getSubjectByIdSync(slot.subject_id);
                    const teacher = getTeacherByIdSync(slot.teacher_id);
                    return `
                        <td>
                            <div class="timetable-slot">
                                <div class="timetable-slot__subject">${esc(subject?.name || subject?.code || '—')}</div>
                                <div class="timetable-slot__teacher">${esc(teacher ? teacherFullName(teacher) : '—')}</div>
                                ${slot.room ? `<div class="timetable-slot__room">${esc(slot.room)}</div>` : ''}
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

// Sync lookups from already-loaded state (subjects/teachers are loaded by
// the time this renders, via ensureStateLoaded() upstream in timetable.js).
function getSubjectByIdSync(id) {
    return (state.subjects || []).find(s => String(s.id) === String(id)) || null;
}
function getTeacherByIdSync(id) {
    return (state.teachers || []).find(t => String(t.id) === String(id)) || null;
}

/* ═══════════════════════════════════════════════════════════════════
   EXPOSE
   ═══════════════════════════════════════════════════════════════════ */

window.getSlotsForClass = getSlotsForClass;
window.renderClassTimetable = renderClassTimetable;
