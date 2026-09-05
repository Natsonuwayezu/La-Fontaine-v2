/* ═══════════════════════════════════════════════════════════════════
   js/modules/settings/academic-years.js
   ═══════════════════════════════════════════════════════════════════
   Data layer for the academic_years and terms tables. No render() —
   this is consumed by settings/academic-calendar.js (the actual
   'academic-calendar' nav page) and by anything else that needs to
   list/create/edit years and terms.

   Tables:
     academic_years { id, year_name, start_date, end_date, is_active }
     terms          { id, academic_year_id, term_number, start_date,
                       end_date, midterm_date, status }

   Dependencies (all plain-script globals loaded earlier in index.html):
   api.js: getAll, insert, update, remove, refreshTable
   validators.js: validateAcademicYearForm, validateTermForm
   state.js: state
   toast.js: showToast
   logger.js: logAction
   constants.js: TERM_STATUSES
   ═══════════════════════════════════════════════════════════════════ */

/* ─── Academic Years ─────────────────────────────────────────────── */

async function listAcademicYears() {
    if (!state.academicYears.length) {
        state.academicYears = await getAll('academic_years');
    }
    return [...state.academicYears].sort((a, b) => (b.year_name || '').localeCompare(a.year_name || ''));
}

async function createAcademicYear(data) {
    const { valid, errors } = validateAcademicYearForm(data);
    if (!valid) return { success: false, errors };

    const row = await insert('academic_years', {
        year_name: data.year_name.trim(),
        start_date: data.start_date,
        end_date: data.end_date,
        is_active: !!data.is_active
    });
    await refreshTable('academic_years');
    await logAction('ACADEMIC_YEAR_CREATED', 'academic_years', row?.id, { year_name: data.year_name });
    return { success: true, row };
}

async function updateAcademicYear(id, data) {
    const { valid, errors } = validateAcademicYearForm(data);
    if (!valid) return { success: false, errors };

    await update('academic_years', id, {
        year_name: data.year_name.trim(),
        start_date: data.start_date,
        end_date: data.end_date
    });
    await refreshTable('academic_years');
    await logAction('ACADEMIC_YEAR_UPDATED', 'academic_years', id, { year_name: data.year_name });
    return { success: true };
}

async function setActiveAcademicYear(id) {
    // Only one academic year can be active at a time.
    const years = await listAcademicYears();
    await Promise.all(years
        .filter(y => y.is_active && y.id !== id)
        .map(y => update('academic_years', y.id, { is_active: false })));
    await update('academic_years', id, { is_active: true });
    await refreshTable('academic_years');
    await logAction('ACADEMIC_YEAR_ACTIVATED', 'academic_years', id);
    
        if (typeof loadAllData === 'function') loadAllData({ silent: true }).catch(() => {});
        showToast('Academic year activated', 'success');
}

async function deleteAcademicYear(id) {
    const terms = await listTermsForYear(id);
    if (terms.length) {
        showToast('Cannot delete', 'error', 'This academic year still has terms. Delete its terms first.');
        return { success: false };
    }
    await remove('academic_years', id);
    await refreshTable('academic_years');
    await logAction('ACADEMIC_YEAR_DELETED', 'academic_years', id);
    return { success: true };
}

/* ─── Terms ───────────────────────────────────────────────────────── */

async function listTermsForYear(academicYearId) {
    if (!state.terms.length) {
        state.terms = await getAll('terms');
    }
    return state.terms
        .filter(t => t.academic_year_id === academicYearId)
        .sort((a, b) => (a.term_number || 0) - (b.term_number || 0));
}

async function createTerm(data) {
    const { valid, errors } = validateTermForm(data);
    if (!valid) return { success: false, errors };

    const row = await insert('terms', {
        academic_year_id: data.academic_year_id,
        term_number: Number(data.term_number),
        start_date: data.start_date,
        end_date: data.end_date,
        midterm_date: data.midterm_date || null,
        status: data.status || 'upcoming'
    });
    await refreshTable('terms');
    await logAction('TERM_CREATED', 'terms', row?.id, { term_number: data.term_number });
    return { success: true, row };
}

async function updateTerm(id, data) {
    const { valid, errors } = validateTermForm(data);
    if (!valid) return { success: false, errors };

    await update('terms', id, {
        academic_year_id: data.academic_year_id,
        term_number: Number(data.term_number),
        start_date: data.start_date,
        end_date: data.end_date,
        midterm_date: data.midterm_date || null,
        status: data.status || 'upcoming'
    });
    await refreshTable('terms');
    await logAction('TERM_UPDATED', 'terms', id, { term_number: data.term_number });
    return { success: true };
}

async function setTermStatus(id, status) {
    if (!TERM_STATUSES.includes(status)) return { success: false };
    await update('terms', id, { status });
    await refreshTable('terms');
    await logAction('TERM_STATUS_CHANGED', 'terms', id, { status });
    return { success: true };
}

async function deleteTerm(id) {
    await remove('terms', id);
    await refreshTable('terms');
    await logAction('TERM_DELETED', 'terms', id);
    return { success: true };
}

/* ═══════════════════════════════════════════════════════════════════
   EXPOSE
   ═══════════════════════════════════════════════════════════════════ */

window.listAcademicYears = listAcademicYears;
window.createAcademicYear = createAcademicYear;
window.updateAcademicYear = updateAcademicYear;
window.setActiveAcademicYear = setActiveAcademicYear;
window.deleteAcademicYear = deleteAcademicYear;
window.listTermsForYear = listTermsForYear;
window.createTerm = createTerm;
window.updateTerm = updateTerm;
window.setTermStatus = setTermStatus;
window.deleteTerm = deleteTerm;

// Router bridge — academic-years is a utility module used by settings.js
// When navigated to directly, delegate to the settings page
function renderAcademicYears(container, params) {
    if (typeof renderSettings === 'function') return renderSettings(container, Object.assign({}, params, { tab: 'academic-years' }));
    if (container) container.innerHTML = '<div class="section-card"><div class="empty-state"><div class="es-title">Academic Years</div><div class="es-sub">Use Settings → Academic Years to manage years and terms.</div></div></div>';
}
window.renderAcademicYears = renderAcademicYears;
