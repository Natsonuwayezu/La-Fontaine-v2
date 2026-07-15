/* ═══════════════════════════════════════════════════════════════════
   js/modules/staff/timetable-import.js
   ═══════════════════════════════════════════════════════════════════
   Bulk-import path for the timetable: upload a CSV, resolve human-
   readable codes (class code, subject code, teacher username) to DB
   ids, then run the exact same validate-then-insert pipeline as
   staff/timetable-generator.js (checkBatchConflicts). No auto-
   scheduling — this only parses and validates what was prepared
   manually outside the app (e.g. in a spreadsheet).

   Expected CSV columns (header row required):
     class_code,subject_code,teacher_username,day,period_number
   day may be a name ("Monday") or a number (1-5).

   NOTE: only .csv is implemented here. .xlsx/.xls (also listed in
   SUPPORTED_IMPORT_FORMATS) will need js/integrations/xlsx.js, which
   is currently an empty file — out of scope for this pass.

   Dependencies (plain-script globals loaded earlier in index.html):
   api.js: getAll, insertMany, refreshTable
   staff/timetable-conflicts.js: checkBatchConflicts, renderConflictPanel
   state.js: state
   utils.js: esc
   toast.js: showToast
   logger.js: logUpdateTimetable
   constants.js: DAYS_OF_WEEK, SUPPORTED_IMPORT_FORMATS
   ═══════════════════════════════════════════════════════════════════ */

function parseTimetableCSV(text) {
    const lines = text.split(/\r?\n/).filter(l => l.trim().length);
    if (lines.length < 2) return { rows: [], errors: ['File is empty or has no data rows.'] };

    const header = lines[0].split(',').map(h => h.trim().toLowerCase());
    const required = ['class_code', 'subject_code', 'teacher_username', 'day', 'period_number'];
    const missing = required.filter(r => !header.includes(r));
    if (missing.length) {
        return { rows: [], errors: [`Missing required column(s): ${missing.join(', ')}`] };
    }

    const rows = [];
    const errors = [];

    for (let i = 1; i < lines.length; i++) {
        const cells = lines[i].split(',').map(c => c.trim());
        if (cells.length < header.length) { errors.push(`Row ${i + 1}: not enough columns.`); continue; }
        const obj = {};
        header.forEach((h, idx) => { obj[h] = cells[idx]; });
        rows.push(obj);
    }

    return { rows, errors };
}

function resolveImportRow(raw) {
    const cls = state.classes.find(c => c.code === raw.class_code);
    const subject = state.subjects.find(s => s.code === raw.subject_code);
    const teacher = state.teachers.find(t => t.username === raw.teacher_username);

    const dayNum = isNaN(Number(raw.day))
        ? (DAYS_OF_WEEK.find(d => d.name.toLowerCase() === raw.day.toLowerCase()) || {}).id
        : Number(raw.day);

    const missing = [];
    if (!cls) missing.push(`unknown class code "${raw.class_code}"`);
    if (!subject) missing.push(`unknown subject code "${raw.subject_code}"`);
    if (!teacher) missing.push(`unknown teacher username "${raw.teacher_username}"`);
    if (!dayNum) missing.push(`unrecognized day "${raw.day}"`);

    if (missing.length) return { slot: null, error: missing.join('; ') };

    return {
        slot: {
            class_id: cls.id,
            subject_id: subject.id,
            teacher_id: teacher.id,
            day_of_week: dayNum,
            period_number: Number(raw.period_number)
        },
        error: null
    };
}

const TimetableImportPanel = (() => {

    function render(container) {
        if (!container) return;
        window.showModal(`
            <div class="setting-desc" style="margin-bottom:12px;">
                CSV columns required: <code>class_code,subject_code,teacher_username,day,period_number</code>
            </div>
            <input type="file" id="tt-import-file" accept=".csv" class="form-input">
            <div id="tt-import-result" style="margin-top:12px;"></div>
        `, {
            title: 'Bulk Import Timetable',
            footer: `<button class="btn btn-outline" data-close>Close</button>`
        });

        document.getElementById('tt-import-file').addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            await handleFile(file);
        });
    }

    async function handleFile(file) {
        const resultEl = document.getElementById('tt-import-result');
        resultEl.innerHTML = '<div class="loading-inline">Processing...</div>';

        const text = await file.text();
        const { rows, errors: parseErrors } = parseTimetableCSV(text);

        if (parseErrors.length) {
            resultEl.innerHTML = `<div class="conflict-panel"><div class="conflict-panel__title">Could not read file</div><ul>${parseErrors.map(e => `<li>${esc(e)}</li>`).join('')}</ul></div>`;
            return;
        }

        if (!state.timetableSlots.length) state.timetableSlots = await getAll('timetable_slots');

        const resolved = rows.map(resolveImportRow);
        const lookupErrors = resolved.filter(r => r.error);
        const readyToCheck = resolved.filter(r => r.slot).map(r => r.slot);

        const { valid, invalid } = await checkBatchConflicts(readyToCheck, state.timetableSlots);

        if (valid.length) {
            await insertMany('timetable_slots', valid);
            await refreshTable('timetable_slots');
            await logUpdateTimetable(null, `import of ${valid.length}`);
        }

        const problems = [
            ...lookupErrors.map(e => ({ slot: null, conflicts: [{ message: e.error }] })),
            ...invalid
        ];

        resultEl.innerHTML = `
            <div class="setting-desc" style="margin-bottom:8px;">
                ${valid.length} row${valid.length === 1 ? '' : 's'} inserted, ${problems.length} skipped.
            </div>
            ${renderConflictPanel(problems)}
        `;

        if (valid.length) showToast('Import complete', 'success', `${valid.length} slot${valid.length === 1 ? '' : 's'} added.`);
    }

    return { render };
})();

/* ═══════════════════════════════════════════════════════════════════
   EXPOSE
   ═══════════════════════════════════════════════════════════════════ */

window.parseTimetableCSV = parseTimetableCSV;
window.resolveImportRow = resolveImportRow;
window.renderTimetableImport = TimetableImportPanel.render;
window.TimetableImportPanel = TimetableImportPanel;
