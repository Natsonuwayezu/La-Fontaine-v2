/* ═══════════════════════════════════════════════════════════════════
   js/modules/holidays/holidays-marks.js
   ═══════════════════════════════════════════════════════════════════
   Remedial/holiday coursework marks (Section 3.5) — these NEVER touch
   the regular class register, rankings, or report cards. Unlike the
   regular marks flow (which routes through resolveTable() and only
   goes to holiday_marks when the global holiday-mode toggle is on),
   this module writes directly to the holiday_marks table always,
   since it's a dedicated isolated screen regardless of that toggle's
   current state — a head teacher reviewing/entering holiday marks in
   September shouldn't require flipping a global "we're on holiday"
   flag just to use this page.

   Reuses css/modules/marks.css's .marks-toolbar/.marks-entry-table/
   .marks-input for visual consistency with the regular marks-entry
   screen, with an amber accent to keep the isolation visible.
   ═══════════════════════════════════════════════════════════════════ */

const HolidaysMarks = (() => {

    function esc(str) {
        if (window.esc) return window.esc(str);
        const div = document.createElement('div');
        div.textContent = str ?? '';
        return div.innerHTML;
    }

    let roster = []; // [{ id, name, holidayMarkId|null, score }]

    function render(container) {
        if (!container) return;
        container.innerHTML = `
      <div class="dashboard-page">
        <div class="dash-card" style="margin-bottom:16px; border-color:rgba(245,158,11,0.3); background:rgba(245,158,11,0.04);">
          <div class="dash-card-body" style="display:flex; align-items:center; gap:10px;">
            <i class="fa-solid fa-umbrella-beach" style="color:var(--warning); font-size:1.1rem;"></i>
            <span style="font-size:0.85rem; color:var(--card-text,#e2e8f0);">
              Marks entered here are stored in a separate holiday-only table and never appear in the regular class register, rankings, or report cards.
            </span>
          </div>
        </div>

        <div class="marks-toolbar">
          <select class="form-select marks-toolbar__select" id="hm-class-select">
            <option value="">Select a class...</option>${classOptions()}
          </select>
          <select class="form-select marks-toolbar__select" id="hm-subject-select">
            <option value="">Select a holiday subject...</option>
          </select>
          <div class="marks-toolbar__spacer"></div>
          <button class="btn btn-outline btn-sm" id="hm-manage-subjects-btn"><i class="fa-solid fa-plus"></i> New Holiday Subject</button>
        </div>

        <div id="hm-body"></div>
      </div>
    `;

        populateSubjects(container);
        container.querySelector('#hm-class-select').addEventListener('change', () => loadRoster(container));
        container.querySelector('#hm-subject-select').addEventListener('change', () => loadRoster(container));
        container.querySelector('#hm-manage-subjects-btn').addEventListener('click', () => createHolidaySubject(container));
    }

    function classOptions() {
        if (window.state?.classes?.length) {
            return window.state.classes.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('');
        }
        return [...CLASS_LEVELS.nursery, ...CLASS_LEVELS.primary].map(c => `<option value="${c}">${c}</option>`).join('');
    }

    function populateSubjects(container) {
        const sel = container.querySelector('#hm-subject-select');
        const subjects = window.state?.holidaySubjects || [];
        sel.innerHTML = `<option value="">Select a holiday subject...</option>` +
            subjects.map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join('');
        if (!subjects.length) {
            console.warn('HolidaysMarks: no holiday_subjects loaded yet — create one with "New Holiday Subject" first.');
        }
    }

    function createHolidaySubject(container) {
        openSubjectModal();
    }

    window.Modals?.register('holiday-subject-editor', () => ({
        title: 'New Holiday Subject',
        subtitle: 'e.g. "Remedial Mathematics" or "Summer Reading Club"',
        size: 'sm',
        body: `
      <div class="form-group">
        <label>Subject name <span class="required">*</span></label>
        <input type="text" class="form-input" data-field="name" placeholder="e.g. Remedial Mathematics" />
        <div class="form-hint"></div>
      </div>
    `,
        footer: `
      <button class="btn btn-outline" data-modal-close>Cancel</button>
      <button class="btn btn-primary" data-save>Create</button>
    `,
        onMount(modal, record) {
            modal.querySelector('[data-save]').addEventListener('click', async () => {
                const result = window.Forms?.validate(modal, { name: [window.Forms.rules.required('A subject name is required')] });
                if (result && !result.valid) return;
                const name = modal.querySelector('[data-field="name"]').value.trim();

                try {
                    const row = await window.insert?.('holiday_subjects', { name, academic_year_id: window.getActiveYearId?.() });
                    if (row?.id && window.state) window.state.holidaySubjects = [...(window.state.holidaySubjects || []), row];
                    window.Toast?.success('Holiday subject created', name);
                    window.Modals?.close(record);
                    const container = document.getElementById('moduleContent');
                    if (container) populateSubjects(container);
                } catch (err) {
                    window.Toast?.error('Could not create subject', err?.message);
                }
            });
        }
    }));

    function openSubjectModal() {
        window.Modals?.open('holiday-subject-editor');
    }

    async function loadRoster(container) {
        const classId = container.querySelector('#hm-class-select').value;
        const subjectId = container.querySelector('#hm-subject-select').value;
        const body = container.querySelector('#hm-body');

        if (!classId || !subjectId) { body.innerHTML = ''; return; }
        if (window.Skeletons) window.Skeletons.showIn(body, 'list', 5);

        const students = await fetchHolidayRoster(classId);
        const existing = await fetchExistingMarks(subjectId, students.map(s => s.id));

        roster = students.map(s => {
            const record = existing.find(m => m.student_id === s.id);
            return { id: s.id, name: s.name, holidayMarkId: record?.id || null, score: record?.score ?? '' };
        });

        renderTable(body, subjectId);
    }

    async function fetchHolidayRoster(classId) {
        if (window.state?.holidayEnrollments?.length && window.state?.students?.length) {
            const enrolledIds = new Set(window.state.holidayEnrollments.filter(e => e.class_id === classId).map(e => e.student_id));
            return window.state.students.filter(s => enrolledIds.has(s.id))
                .map(s => ({ id: s.id, name: s.full_name || `${s.first_name || ''} ${s.last_name || ''}`.trim() }));
        }
        if (window.getStudentsInClass && window.state?.students?.length) {
            return window.getStudentsInClass(classId).map(s => ({ id: s.id, name: s.full_name || `${s.first_name || ''} ${s.last_name || ''}`.trim() }));
        }
        console.warn('HolidaysMarks: no real holiday roster available yet.');
        return [];
    }

    async function fetchExistingMarks(subjectId, studentIds) {
        if (!window.getWhere || !studentIds.length) return [];
        try {
            return await window.getWhere('holiday_marks', `subject_id=eq.${subjectId}&student_id=in.(${studentIds.join(',')})`);
        } catch (err) {
            console.warn('HolidaysMarks: getWhere(holiday_marks) failed', err);
            return [];
        }
    }

    function renderTable(body, subjectId) {
        if (!roster.length) {
            window.EmptyStates?.renderPreset(body, 'noData', { title: 'No holiday-enrolled students', message: 'No students are enrolled in the holiday program for this class.' });
            return;
        }

        body.innerHTML = `
      <div class="marks-entry-wrap">
        <table class="marks-entry-table">
          <thead><tr><th class="col-num">Score</th><th>Student</th></tr></thead>
          <tbody>
            ${roster.map((s, i) => `
              <tr>
                <td style="text-align:center;"><input type="text" inputmode="decimal" class="marks-input" data-idx="${i}" value="${s.score}" placeholder="\u2014" /></td>
                <td class="student-name-cell">${esc(s.name)}<div class="student-num-cell">${esc(s.id)}</div></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
      <div class="marks-save-bar">
        <span class="marks-save-status" id="hm-save-status">${roster.length} students</span>
        <button class="btn btn-primary" id="hm-save-btn"><i class="fa-solid fa-floppy-disk"></i> Save Holiday Marks</button>
      </div>
    `;

        body.querySelectorAll('[data-idx]').forEach(input => {
            input.addEventListener('input', () => {
                const val = input.value.trim();
                roster[+input.dataset.idx].score = val;
                const statusEl = body.querySelector('#hm-save-status');
                statusEl.textContent = `${roster.length} students`;
                statusEl.classList.add('dirty');
            });
        });

        body.querySelector('#hm-save-btn').addEventListener('click', () => saveMarks(body, subjectId));
    }

    async function saveMarks(body, subjectId) {
        const btn = body.querySelector('#hm-save-btn');
        window.Loaders?.button?.start(btn);

        try {
            const toSave = roster.filter(s => s.score !== '' && !isNaN(parseFloat(s.score)));
            await Promise.all(toSave.map(s => {
                const payload = { student_id: s.id, subject_id: subjectId, score: parseFloat(s.score), updated_at: new Date().toISOString() };
                if (s.holidayMarkId) {
                    return window.update ? window.update('holiday_marks', s.holidayMarkId, payload) : Promise.resolve();
                }
                return window.insert ? window.insert('holiday_marks', payload).then(row => { if (row?.id) s.holidayMarkId = row.id; }) : Promise.resolve();
            }));

            body.querySelector('#hm-save-status').textContent = `${toSave.length} marks saved`;
            body.querySelector('#hm-save-status').classList.remove('dirty');
            window.Toast?.success('Holiday marks saved', `${toSave.length} mark${toSave.length === 1 ? '' : 's'} saved.`);
        } catch (err) {
            window.Toast?.error('Could not save holiday marks', err?.message || 'Please try again.');
        } finally {
            window.Loaders?.button?.stop(btn);
        }
    }

    return { render };
})();

// ─── EXPOSE ─────────────────────────────────────────────────────────
// window.HolidaysMarks was never assigned anywhere in this file, and the router
// looks up window.renderHolidaysMarks specifically (see core/router.js's
// moduleIdToRenderFn) — this page was completely unreachable via navigation
// despite being fully built.
window.HolidaysMarks = HolidaysMarks;
window.renderHolidaysMarks = HolidaysMarks.render;
