/* ═══════════════════════════════════════════════════════════════════
   js/modules/staff/timetable-conflicts.js
   ═══════════════════════════════════════════════════════════════════
   Conflict detection for timetable_slots, built on top of
   validators.js's validateTimetableSlot() (which returns raw
   {type, slot} conflict objects). This file adds:
   - checkSlotConflicts()  — same check, resolved to friendly labels
   - checkBatchConflicts() — validates a whole batch of new slots
     against each other AND against what's already saved, for
     timetable-generator.js / timetable-import.js's insert pipeline
   - renderConflictPanel() — the .conflict-panel UI fragment

   Dependencies (plain-script globals loaded earlier in index.html):
   validators.js: validateTimetableSlot
   staff/teachers.js: getTeacherById, teacherFullName
   staff/subjects.js: getSubjectById
   utils.js: esc
   constants.js: DAYS_OF_WEEK, TIMETABLE_TIME_SLOTS
   ═══════════════════════════════════════════════════════════════════ */

/**
 * Check one slot against a list of existing slots and resolve the raw
 * conflict objects to human-readable messages.
 * @param {Object} slot - { class_id, teacher_id, day_of_week, period_number }
 * @param {Array}  existingSlots
 * @param {number} [excludeId]
 */
async function checkSlotConflicts(slot, existingSlots, excludeId = null) {
    const raw = validateTimetableSlot(slot, existingSlots, excludeId);
    if (!raw.length) return [];

    const dayName = (DAYS_OF_WEEK.find(d => d.id === Number(slot.day_of_week)) || {}).name || `Day ${slot.day_of_week}`;
    const timeLabel = TIMETABLE_TIME_SLOTS[Number(slot.period_number) - 1] || `Period ${slot.period_number}`;

    const resolved = [];
    for (const c of raw) {
        if (c.type === 'TEACHER') {
            const teacher = await getTeacherById(c.slot.teacher_id);
            resolved.push({
                type: 'TEACHER',
                message: `${teacherFullName(teacher)} is already teaching another class at this time (${dayName}, ${timeLabel}).`
            });
        } else if (c.type === 'CLASS') {
            resolved.push({
                type: 'CLASS',
                message: `This class already has a subject scheduled at this time (${dayName}, ${timeLabel}).`
            });
        }
    }
    return resolved;
}

/**
 * Validate a whole batch of new slots (e.g. from timetable-generator.js
 * or a bulk import) against each other and against what's already saved.
 * Returns { valid: [...slots with no conflicts], invalid: [{slot, conflicts}] }.
 */
async function checkBatchConflicts(newSlots, existingSlots) {
    const valid = [];
    const invalid = [];
    const accepted = [...existingSlots]; // grows as we accept slots from the batch

    for (const slot of newSlots) {
        const conflicts = await checkSlotConflicts(slot, accepted);
        if (conflicts.length) {
            invalid.push({ slot, conflicts });
        } else {
            valid.push(slot);
            accepted.push(slot);
        }
    }
    return { valid, invalid };
}

function renderConflictPanel(invalidEntries) {
    if (!invalidEntries || !invalidEntries.length) return '';
    return `
        <div class="conflict-panel">
            <div class="conflict-panel__title">
                <i class="fa-solid fa-triangle-exclamation"></i>
                ${invalidEntries.length} slot${invalidEntries.length === 1 ? '' : 's'} could not be inserted
            </div>
            <div class="conflict-panel__list">
                ${invalidEntries.map(entry => `
                    <div class="conflict-panel__item">
                        <strong>Row:</strong> ${esc(JSON.stringify(entry.slot))}
                        <ul>${entry.conflicts.map(c => `<li>${esc(c.message)}</li>`).join('')}</ul>
                    </div>
                `).join('')}
            </div>
        </div>
    `;
}

/* ═══════════════════════════════════════════════════════════════════
   EXPOSE
   ═══════════════════════════════════════════════════════════════════ */

window.checkSlotConflicts = checkSlotConflicts;
window.checkBatchConflicts = checkBatchConflicts;
window.renderConflictPanel = renderConflictPanel;

// Router bridge
window.renderTimetableConflicts = function(container, params) {
    if (!container) return;
    container.innerHTML = renderConflictPanel([], { title: 'Conflict Checker' });
};
