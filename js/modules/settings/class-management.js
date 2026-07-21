/* ═══════════════════════════════════════════════════════════════════
   js/modules/settings/class-management.js
   ═══════════════════════════════════════════════════════════════════
   Rendered into #app-main by core/router.js for the 'class-management'
   nav item ("Class / Subjects" under the Staff section — filed here
   in settings/ since it's config data, not a staff-person record).
   Manages class names/levels/class-teacher assignment, and the
   subject list, falling back to CLASS_LIST/NURSERY_SUBJECTS/
   PRIMARY_SUBJECTS from constants.js when the DB tables are empty.

   Tables: classes  { id, code, name, level, sort_order, class_teacher_id }
           subjects { id, code, name, level, mg_max, ex_max,
                       appears_only_post_midterm, sort_order }

   Dependencies (plain-script globals loaded earlier in index.html):
   api.js: getAll, insert, update, remove, refreshTable
   utils.js: esc
   toast.js: showToast
   modals.js: confirmDialog
   logger.js: logAction
   constants.js: CLASS_LIST, NURSERY_SUBJECTS, PRIMARY_SUBJECTS
   state.js: state
   staff/teachers.js: listTeachers (for the class-teacher dropdown)
   ═══════════════════════════════════════════════════════════════════ */

const ClassManagement = (() => {

    let activeTab = 'classes';

    async function getClasses() {
        if (!state.classes.length) {
            state.classes = (await getAll('classes')).sort((a, b) => (a.sort_order || 99) - (b.sort_order || 99));
        }
        return state.classes.length ? state.classes : CLASS_LIST;
    }

    async function getSubjects() {
        if (!state.subjects.length) {
            state.subjects = (await getAll('subjects')).sort((a, b) => (a.sort_order || 99) - (b.sort_order || 99));
        }
        return state.subjects.length ? state.subjects : [...NURSERY_SUBJECTS, ...PRIMARY_SUBJECTS];
    }

    async function render(container) {
        if (!container) return;
        container.innerHTML = `<div class="dashboard-page"><div class="loading-inline">Loading classes &amp; subjects…</div></div>`;

        const [classes, subjects, teachers] = await Promise.all([
            getClasses(), getSubjects(),
            (typeof listTeachers === 'function' ? listTeachers() : Promise.resolve(state.teachers || []))
        ]);

        container.innerHTML = `
            <div class="dashboard-page">
                ${window.SettingsTabs ? window.SettingsTabs.render('class-management') : ''}
                <div class="settings-section">
                    <div class="settings-section__title">Classes &amp; Subjects</div>
                    <div class="settings-section__desc">Class names, levels, class-teacher assignment, and the subject list used across marks entry and report cards.</div>
                </div>

                <div class="settings-tabs" style="margin-bottom:16px;">
                    <button class="tab-btn ${activeTab === 'classes' ? 'active' : ''}" data-cm-tab="classes">Classes</button>
                    <button class="tab-btn ${activeTab === 'subjects' ? 'active' : ''}" data-cm-tab="subjects">Subjects</button>
                </div>

                <div id="cm-tab-content">
                    ${activeTab === 'classes' ? renderClassesTab(classes, teachers) : renderSubjectsTab(subjects)}
                </div>
            </div>
        `;

        bindEvents(container);
    }

    function renderClassesTab(classes, teachers) {
        return `
            <div style="display:flex; justify-content:flex-end; margin-bottom:10px;">
                <button class="btn btn-sm btn-primary" id="add-class-btn"><i class="fa-solid fa-plus"></i> Add Class</button>
            </div>
            <table class="logs-table">
                <thead><tr><th>Code</th><th>Name</th><th>Level</th><th>Class Teacher</th><th></th></tr></thead>
                <tbody>
                    ${classes.map(c => `
                        <tr>
                            <td>${esc(c.code)}</td>
                            <td>${esc(c.name)}</td>
                            <td><span class="badge">${esc(c.level)}</span></td>
                            <td>${esc(teacherName(teachers, c.class_teacher_id))}</td>
                            <td>
                                ${c.id ? `
                                    <button class="btn btn-sm btn-outline" data-edit-class="${c.id}"><i class="fa-solid fa-pen"></i></button>
                                    <button class="btn btn-sm btn-outline" data-delete-class="${c.id}"><i class="fa-solid fa-trash"></i></button>
                                ` : '<span class="setting-desc">default</span>'}
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
    }

    function renderSubjectsTab(subjects) {
        return `
            <div style="display:flex; justify-content:flex-end; margin-bottom:10px;">
                <button class="btn btn-sm btn-primary" id="add-subject-btn"><i class="fa-solid fa-plus"></i> Add Subject</button>
            </div>
            <table class="logs-table">
                <thead><tr><th>Code</th><th>Name</th><th>MG Max</th><th>EX Max</th><th>Post-Midterm Only</th><th></th></tr></thead>
                <tbody>
                    ${subjects.map(s => `
                        <tr>
                            <td>${esc(s.code)}</td>
                            <td>${esc(s.name)}</td>
                            <td>${s.mg_max}</td>
                            <td>${s.ex_max}</td>
                            <td>${s.appears_only_post_midterm ? 'Yes' : 'No'}</td>
                            <td>
                                ${s.id ? `
                                    <button class="btn btn-sm btn-outline" data-edit-subject="${s.id}"><i class="fa-solid fa-pen"></i></button>
                                    <button class="btn btn-sm btn-outline" data-delete-subject="${s.id}"><i class="fa-solid fa-trash"></i></button>
                                ` : '<span class="setting-desc">default</span>'}
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
    }

    function teacherName(teachers, id) {
        if (!id) return '—';
        const t = (teachers || []).find(t => t.id === id);
        return t ? `${t.first_name} ${t.last_name}` : '—';
    }

    function classForm(existing, teachers) {
        return `
            <form id="class-form">
                <div class="form-group"><label class="form-label">Code</label>
                    <input type="text" name="code" class="form-input" value="${existing ? esc(existing.code) : ''}" required></div>
                <div class="form-group"><label class="form-label">Name</label>
                    <input type="text" name="name" class="form-input" value="${existing ? esc(existing.name) : ''}" required></div>
                <div class="form-group"><label class="form-label">Level</label>
                    <select name="level" class="form-select">
                        <option value="nursery" ${existing?.level === 'nursery' ? 'selected' : ''}>Nursery</option>
                        <option value="primary" ${existing?.level === 'primary' ? 'selected' : ''}>Primary</option>
                    </select></div>
                <div class="form-group"><label class="form-label">Class Teacher</label>
                    <select name="class_teacher_id" class="form-select">
                        <option value="">— None —</option>
                        ${(teachers || []).map(t => `<option value="${t.id}" ${existing?.class_teacher_id === t.id ? 'selected' : ''}>${esc(t.first_name)} ${esc(t.last_name)}</option>`).join('')}
                    </select></div>
            </form>
        `;
    }

    function subjectForm(existing) {
        return `
            <form id="subject-form">
                <div class="form-group"><label class="form-label">Code</label>
                    <input type="text" name="code" class="form-input" value="${existing ? esc(existing.code) : ''}" required></div>
                <div class="form-group"><label class="form-label">Name</label>
                    <input type="text" name="name" class="form-input" value="${existing ? esc(existing.name) : ''}" required></div>
                <div class="form-group" style="display:flex; gap:10px;">
                    <div style="flex:1;"><label class="form-label">MG Max</label>
                        <input type="number" name="mg_max" class="form-input" value="${existing ? existing.mg_max : 50}" required></div>
                    <div style="flex:1;"><label class="form-label">EX Max</label>
                        <input type="number" name="ex_max" class="form-input" value="${existing ? existing.ex_max : 50}" required></div>
                </div>
                <label style="display:flex; align-items:center; gap:8px; margin-top:8px;">
                    <input type="checkbox" name="appears_only_post_midterm" ${existing?.appears_only_post_midterm ? 'checked' : ''}>
                    Appears only in post-midterm assessments
                </label>
            </form>
        `;
    }

    function bindEvents(container) {
        container.querySelectorAll('[data-cm-tab]').forEach(btn => {
            btn.addEventListener('click', () => { activeTab = btn.dataset.cmTab; render(container); });
        });

        container.querySelector('#add-class-btn')?.addEventListener('click', async () => {
            const teachers = state.teachers || [];
            window.showModal(classForm(null, teachers), {
                title: 'Add Class',
                footer: `<button class="btn btn-outline" data-close>Cancel</button><button class="btn btn-primary" id="save-class-btn">Save</button>`
            });
            document.getElementById('save-class-btn').onclick = async () => {
                const data = Object.fromEntries(new FormData(document.getElementById('class-form')).entries());
                const row = await insert('classes', {
                    code: data.code.trim(), name: data.name.trim(), level: data.level,
                    class_teacher_id: data.class_teacher_id || null,
                    sort_order: (state.classes.length || 0) + 1
                });
                await refreshTable('classes');
                await logAction('CLASS_CREATED', 'classes', row?.id, { name: data.name });
                showToast('Class added', 'success');
                window.closeModal();
                render(container);
            };
        });

        container.querySelectorAll('[data-edit-class]').forEach(btn => {
            btn.addEventListener('click', () => {
                const cls = state.classes.find(c => String(c.id) === btn.dataset.editClass);
                window.showModal(classForm(cls, state.teachers || []), {
                    title: 'Edit Class',
                    footer: `<button class="btn btn-outline" data-close>Cancel</button><button class="btn btn-primary" id="save-class-btn">Save</button>`
                });
                document.getElementById('save-class-btn').onclick = async () => {
                    const data = Object.fromEntries(new FormData(document.getElementById('class-form')).entries());
                    await update('classes', cls.id, {
                        code: data.code.trim(), name: data.name.trim(), level: data.level,
                        class_teacher_id: data.class_teacher_id || null
                    });
                    await refreshTable('classes');
                    await logAction('CLASS_UPDATED', 'classes', cls.id, { name: data.name });
                    showToast('Class updated', 'success');
                    window.closeModal();
                    render(container);
                };
            });
        });

        container.querySelectorAll('[data-delete-class]').forEach(btn => {
            btn.addEventListener('click', async () => {
                const ok = await confirmDialog('Delete this class? Students in it will not be moved automatically.', 'Delete Class', { confirmClass: 'btn-danger' });
                if (!ok) return;
                await remove('classes', btn.dataset.deleteClass);
                await refreshTable('classes');
                await logAction('CLASS_DELETED', 'classes', btn.dataset.deleteClass, null, 'warning');
                render(container);
            });
        });

        container.querySelector('#add-subject-btn')?.addEventListener('click', () => {
            window.showModal(subjectForm(null), {
                title: 'Add Subject',
                footer: `<button class="btn btn-outline" data-close>Cancel</button><button class="btn btn-primary" id="save-subject-btn">Save</button>`
            });
            document.getElementById('save-subject-btn').onclick = async () => {
                const form = document.getElementById('subject-form');
                const data = Object.fromEntries(new FormData(form).entries());
                const row = await insert('subjects', {
                    code: data.code.trim(), name: data.name.trim(),
                    mg_max: Number(data.mg_max), ex_max: Number(data.ex_max),
                    appears_only_post_midterm: form.appears_only_post_midterm.checked,
                    sort_order: (state.subjects.length || 0) + 1
                });
                await refreshTable('subjects');
                await logAction('SUBJECT_CREATED', 'subjects', row?.id, { name: data.name });
                showToast('Subject added', 'success');
                window.closeModal();
                render(container);
            };
        });

        container.querySelectorAll('[data-edit-subject]').forEach(btn => {
            btn.addEventListener('click', () => {
                const subj = state.subjects.find(s => String(s.id) === btn.dataset.editSubject);
                window.showModal(subjectForm(subj), {
                    title: 'Edit Subject',
                    footer: `<button class="btn btn-outline" data-close>Cancel</button><button class="btn btn-primary" id="save-subject-btn">Save</button>`
                });
                document.getElementById('save-subject-btn').onclick = async () => {
                    const form = document.getElementById('subject-form');
                    const data = Object.fromEntries(new FormData(form).entries());
                    await update('subjects', subj.id, {
                        code: data.code.trim(), name: data.name.trim(),
                        mg_max: Number(data.mg_max), ex_max: Number(data.ex_max),
                        appears_only_post_midterm: form.appears_only_post_midterm.checked
                    });
                    await refreshTable('subjects');
                    await logAction('SUBJECT_UPDATED', 'subjects', subj.id, { name: data.name });
                    showToast('Subject updated', 'success');
                    window.closeModal();
                    render(container);
                };
            });
        });

        container.querySelectorAll('[data-delete-subject]').forEach(btn => {
            btn.addEventListener('click', async () => {
                const ok = await confirmDialog('Delete this subject?', 'Delete Subject', { confirmClass: 'btn-danger' });
                if (!ok) return;
                await remove('subjects', btn.dataset.deleteSubject);
                await refreshTable('subjects');
                await logAction('SUBJECT_DELETED', 'subjects', btn.dataset.deleteSubject, null, 'warning');
                render(container);
            });
        });
    }

    function destroy() { activeTab = 'classes'; }

    return { render, destroy };
})();

window.renderClassManagement = ClassManagement.render;
window.ClassManagement = ClassManagement;
