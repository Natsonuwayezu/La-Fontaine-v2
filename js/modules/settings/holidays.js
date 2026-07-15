/* ═══════════════════════════════════════════════════════════════════
   js/modules/settings/holidays.js
   ═══════════════════════════════════════════════════════════════════
   Data layer + admin panel for the `holidays` table (school closure
   dates, distinct from the separate holiday-programme system in
   js/modules/holidays/). Not its own top-level nav item — rendered as
   a tab inside settings/academic-calendar.js.

   importRwandaHolidays() bulk-adds Rwanda's recurring public holidays
   for a given year from constants.js's RWANDA_PUBLIC_HOLIDAYS list
   (referenced there by name, per that file's own comment).

   Table: holidays { id, name, type, start_date, end_date, academic_year_id }

   Dependencies (plain-script globals loaded earlier in index.html):
   api.js: getAll, insert, update, remove, refreshTable
   validators.js: validateHolidayForm
   state.js: state
   utils.js: esc
   toast.js: showToast
   logger.js: logAction
   constants.js: HOLIDAY_TYPES, RWANDA_PUBLIC_HOLIDAYS
   ═══════════════════════════════════════════════════════════════════ */

async function listHolidays(academicYearId = null) {
    if (!state.holidays.length) {
        state.holidays = await getAll('holidays');
    }
    const rows = academicYearId
        ? state.holidays.filter(h => h.academic_year_id === academicYearId)
        : state.holidays;
    return [...rows].sort((a, b) => (a.start_date || '').localeCompare(b.start_date || ''));
}

async function createHoliday(data) {
    const { valid, errors } = validateHolidayForm(data);
    if (!valid) return { success: false, errors };

    const row = await insert('holidays', {
        name: data.name.trim(),
        type: data.type,
        start_date: data.start_date,
        end_date: data.end_date,
        academic_year_id: data.academic_year_id || null
    });
    await refreshTable('holidays');
    await logAction('HOLIDAY_CREATED', 'holidays', row?.id, { name: data.name });
    return { success: true, row };
}

async function updateHoliday(id, data) {
    const { valid, errors } = validateHolidayForm(data);
    if (!valid) return { success: false, errors };

    await update('holidays', id, {
        name: data.name.trim(),
        type: data.type,
        start_date: data.start_date,
        end_date: data.end_date
    });
    await refreshTable('holidays');
    await logAction('HOLIDAY_UPDATED', 'holidays', id, { name: data.name });
    return { success: true };
}

async function deleteHoliday(id) {
    await remove('holidays', id);
    await refreshTable('holidays');
    await logAction('HOLIDAY_DELETED', 'holidays', id);
    return { success: true };
}

/**
 * Bulk-add Rwanda's recurring public holidays for a given calendar year.
 * Skips any that already exist (by name + year) to avoid duplicates on
 * repeated calls.
 * @param {number} year - e.g. 2027
 * @param {string} [academicYearId]
 */
async function importRwandaHolidays(year, academicYearId = null) {
    const existing = await listHolidays(academicYearId);
    const existingKeys = new Set(existing.map(h => `${h.name}|${h.start_date?.slice(0, 4)}`));

    const toCreate = RWANDA_PUBLIC_HOLIDAYS.filter(h => {
        const key = `${h.name}|${year}`;
        return !existingKeys.has(key);
    });

    let created = 0;
    for (const h of toCreate) {
        const dateStr = `${year}-${String(h.month).padStart(2, '0')}-${String(h.day).padStart(2, '0')}`;
        const result = await createHoliday({
            name: h.name,
            type: 'Public Holiday',
            start_date: dateStr,
            end_date: dateStr,
            academic_year_id: academicYearId
        });
        if (result.success) created++;
    }

    await logAction('RWANDA_HOLIDAYS_IMPORTED', 'holidays', null, { year, created });
    showToast('Rwanda holidays imported', 'success', `${created} holiday${created === 1 ? '' : 's'} added for ${year}.`);
    return { success: true, created };
}

/* ═══════════════════════════════════════════════════════════════════
   EXPOSE
   ═══════════════════════════════════════════════════════════════════ */

window.listHolidays = listHolidays;
window.createHoliday = createHoliday;
window.updateHoliday = updateHoliday;
window.deleteHoliday = deleteHoliday;
window.importRwandaHolidays = importRwandaHolidays;
