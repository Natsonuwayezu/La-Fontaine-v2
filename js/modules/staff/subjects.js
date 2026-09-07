/* ═══════════════════════════════════════════════════════════════════
   js/modules/staff/subjects.js
   ═══════════════════════════════════════════════════════════════════
   Read-oriented data layer over the `subjects` table, falling back to
   NURSERY_SUBJECTS/PRIMARY_SUBJECTS from constants.js when the DB
   table is empty. Used by the timetable modules and
   teacher-assignments.js. For creating/editing subjects, see
   settings/class-management.js, which owns that table's CRUD.

   Dependencies (plain-script globals loaded earlier in index.html):
   api.js: getAll
   state.js: state
   constants.js: NURSERY_SUBJECTS, PRIMARY_SUBJECTS
   ═══════════════════════════════════════════════════════════════════ */

async function listSubjects() {
    if (!state.subjects.length) {
        state.subjects = (await getAll('subjects')).sort((a, b) => (a.sort_order || 99) - (b.sort_order || 99));
    }
    return state.subjects.length ? state.subjects : [...NURSERY_SUBJECTS, ...PRIMARY_SUBJECTS];
}

async function getSubjectById(id) {
    const all = await listSubjects();
    return all.find(s => String(s.id) === String(id)) || null;
}

async function getSubjectByCode(code) {
    const all = await listSubjects();
    return all.find(s => s.code === code) || null;
}

/* ═══════════════════════════════════════════════════════════════════
   EXPOSE
   ═══════════════════════════════════════════════════════════════════ */

window.listSubjects = listSubjects;
window.getSubjectById = getSubjectById;
window.getSubjectByCode = getSubjectByCode;

// ── Router entry point ────────────────────────────────────────────
async function renderSubjects(container, params = {}) {
    if (!container) return;
    await ensureStateLoaded();

    // Cross-module navigation strip
    const _navStrip = document.createElement('div');
    _navStrip.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap;padding:8px 16px;background:rgba(255,255,255,.02);border-bottom:1px solid var(--border);';
    _navStrip.innerHTML = `<button class="btn btn-ghost btn-sm" onclick="navigateTo('teachers')"><i class="fa-solid fa-person-chalkboard"></i> Teachers</button>         <button class="btn btn-ghost btn-sm" onclick="navigateTo('teacher-assignments')"><i class="fa-solid fa-chalkboard"></i> Assignments</button>`;
    if (container) container.prepend(_navStrip);
    await listSubjects(container, params);
}
window.renderSubjects = renderSubjects;
