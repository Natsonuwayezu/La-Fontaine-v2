/* ═══════════════════════════════════════════════════════════════════
   js/modules/settings/grading-scale.js
   ═══════════════════════════════════════════════════════════════════
   Data layer for the grading_scale table + the pass mark setting.
   No render() — consumed by settings/grading-settings.js (the actual
   'grading-scale' nav page). core/formulas.js already reads
   state.gradingScale directly for getGrade()/isPassing(); this file
   is what keeps that table in sync via the settings UI.

   Table: grading_scale { id, grade, min, max, desc, color, sort_order }
   Pass mark is stored as a school_settings key ('pass_mark').

   Dependencies (plain-script globals loaded earlier in index.html):
   api.js: getAll, insert, update, remove, refreshTable,
           getSchoolSetting, updateSchoolSetting
   state.js: state
   logger.js: logAction
   constants.js: DEFAULT_GRADES, DEFAULT_PASS_MARK
   ═══════════════════════════════════════════════════════════════════ */

async function listGradingScale() {
    if (!state.gradingScale.length) {
        state.gradingScale = await getAll('grading_scale');
    }
    const scale = state.gradingScale.length ? state.gradingScale : DEFAULT_GRADES;
    return [...scale].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
}

async function getPassMark() {
    const val = await getSchoolSetting('pass_mark', DEFAULT_PASS_MARK);
    const num = Number(val);
    return Number.isFinite(num) ? num : DEFAULT_PASS_MARK;
}

async function setPassMark(value) {
    const num = Number(value);
    if (!Number.isFinite(num) || num < 0 || num > 100) {
        return { success: false, error: 'Pass mark must be a number between 0 and 100.' };
    }
    await updateSchoolSetting('pass_mark', num);
    await logAction('PASS_MARK_CHANGED', 'school_settings', null, { pass_mark: num });
    return { success: true };
}

function validateGradeBand(band, existingBands, excludeId = null) {
    if (!band.grade || !band.grade.trim()) return { valid: false, error: 'Grade label is required.' };
    const min = Number(band.min), max = Number(band.max);
    if (!Number.isFinite(min) || !Number.isFinite(max)) return { valid: false, error: 'Min and max must be numbers.' };
    if (min > max) return { valid: false, error: 'Min cannot be greater than max.' };
    if (min < 0 || max > 100) return { valid: false, error: 'Range must be within 0–100.' };

    const overlap = existingBands.some(b =>
        b.id !== excludeId && !(max < b.min || min > b.max)
    );
    if (overlap) return { valid: false, error: 'This range overlaps with an existing grade band.' };

    return { valid: true };
}

async function createGradeBand(data) {
    const existing = await listGradingScale();
    const check = validateGradeBand(data, existing);
    if (!check.valid) return { success: false, error: check.error };

    const row = await insert('grading_scale', {
        grade: data.grade.trim(),
        min: Number(data.min),
        max: Number(data.max),
        desc: data.desc || '',
        color: data.color || '#6b5f56',
        sort_order: existing.length + 1
    });
    await refreshTable('grading_scale');
    await logAction('GRADE_BAND_CREATED', 'grading_scale', row?.id, { grade: data.grade });
    return { success: true, row };
}

async function updateGradeBand(id, data) {
    const existing = await listGradingScale();
    const check = validateGradeBand(data, existing, id);
    if (!check.valid) return { success: false, error: check.error };

    await update('grading_scale', id, {
        grade: data.grade.trim(),
        min: Number(data.min),
        max: Number(data.max),
        desc: data.desc || '',
        color: data.color || '#6b5f56'
    });
    await refreshTable('grading_scale');
    await logAction('GRADE_BAND_UPDATED', 'grading_scale', id, { grade: data.grade });
    return { success: true };
}

async function deleteGradeBand(id) {
    await remove('grading_scale', id);
    await refreshTable('grading_scale');
    await logAction('GRADE_BAND_DELETED', 'grading_scale', id);
    return { success: true };
}

async function resetGradingScaleToDefault() {
    const existing = await listGradingScale();
    await Promise.all(existing.filter(b => b.id).map(b => remove('grading_scale', b.id)));
    await Promise.all(DEFAULT_GRADES.map(g => insert('grading_scale', { ...g })));
    await refreshTable('grading_scale');
    await logAction('GRADING_SCALE_RESET', 'grading_scale', null);
    return { success: true };
}

/* ═══════════════════════════════════════════════════════════════════
   EXPOSE
   ═══════════════════════════════════════════════════════════════════ */

window.listGradingScale = listGradingScale;
window.getPassMark = getPassMark;
window.setPassMark = setPassMark;
window.createGradeBand = createGradeBand;
window.updateGradeBand = updateGradeBand;
window.deleteGradeBand = deleteGradeBand;
window.resetGradingScaleToDefault = resetGradingScaleToDefault;
