/* ═══════════════════════════════════════════════════════════════════
   js/modules/students/student-details.js  v9.0
   ═══════════════════════════════════════════════════════════════════
   Two modes:
   1. Drawer (quick-peek) — StudentDetails.open(studentId)
      Shows summary card with key fields, fee balance, attendance.
      "Open Full Profile" → student-profile module.
      "Edit Student" → opens full edit form in modal.

   2. Edit form (full) — StudentDetails.openEdit(studentId)
      Shows ALL students table fields in editable form.
      Also loads guardians via student_guardians and allows editing.
      Saves all fields with updated_at, logs via logAction().
      Class change triggers class_enrollments + student_class_history.
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

const StudentDetails = (() => {

    function escapeHTML(str) {
        const d = document.createElement('div');
        d.textContent = str ?? '';
        return d.innerHTML;
    }

    function initials(name) {
        return (name || '?').split(' ').map(w => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();
    }

    // ── QUICK-PEEK DRAWER ──────────────────────────────────────────
    async function open(studentId) {
        const raw = (state.students || []).find(s => s.id === studentId);
        if (!raw) { showToast('Student not found.', 'warning'); return; }

        const classMap   = new Map((state.classes || []).map(c => [c.id, c.name]));
        const yearId     = typeof getActiveYearId === 'function' ? getActiveYearId() : null;
        const termId     = typeof getActiveTermId === 'function' ? getActiveTermId() : null;

        // Fees
        const myFees  = (state.studentFees || []).filter(f =>
            f.student_id === raw.id && (!yearId || f.academic_year_id === yearId));
        const creditRow = (state.creditBalances || []).find(c => c.student_id === raw.id);
        const credit    = creditRow ? Number(creditRow.credit_amount || 0) : 0;
        const summary   = typeof computeStudentFeeSummary === 'function'
            ? computeStudentFeeSummary(myFees, credit)
            : { outstanding: 0, paid: 0, isFullyPaid: !myFees.length };
        const feeStatus = !myFees.length ? 'unknown' : summary.isFullyPaid ? 'paid'
            : summary.paid > 0 ? 'partial' : 'unpaid';

        // Academics
        const termAssIds = new Set((state.assessments || [])
            .filter(a => !termId || String(a.term_id) === String(termId)).map(a => a.id));
        const myMarks = (state.marks || []).filter(m =>
            m.student_id === raw.id && termAssIds.has(m.assessment_id)
            && !m.is_absent && m.score != null);
        const pcts = myMarks.map(m => {
            const a = (state.assessments || []).find(x => x.id === m.assessment_id);
            return a?.max_marks ? (m.score / a.max_marks) * 100 : null;
        }).filter(p => p !== null);
        const average = pcts.length
            ? Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length) : null;

        // Attendance (on-demand)
        let attendanceRate = null;
        try {
            const filters = [`student_id=eq.${raw.id}`];
            if (termId) filters.push(`term_id=eq.${termId}`);
            const records = await getAll('attendance', filters.join('&'));
            if (records?.length && typeof countAttendance === 'function') {
                attendanceRate = typeof computeAttendanceRate === 'function'
                    ? computeAttendanceRate(countAttendance(records)) : null;
            }
        } catch(e) {}

        const name      = `${raw.first_name || ''} ${raw.last_name || ''}`.trim() || `#${raw.id}`;
        const className = classMap.get(raw.class_id) || '—';

        // Resolve primary guardian name from guardians or flat field
        const guardianName  = raw.guardian_name || '—';
        const guardianPhone = raw.guardian_phone || '—';

        const content = `
        <div style="display:flex;align-items:center;gap:14px;margin-bottom:16px;">
          <div style="width:48px;height:48px;border-radius:50%;background:var(--color-primary);
               display:flex;align-items:center;justify-content:center;font-weight:700;
               font-size:18px;color:#fff;flex-shrink:0;">${escapeHTML(initials(name))}</div>
          <div>
            <div style="font-weight:600;font-size:15px;">${escapeHTML(name)}</div>
            <div style="display:flex;gap:6px;margin-top:4px;flex-wrap:wrap;">
              <span class="badge ${raw.status === 'Active' ? 'badge-success' : 'badge-neutral'}">${escapeHTML(raw.status||'Active')}</span>
              <span class="badge ${feeStatus === 'paid' ? 'badge-success' : feeStatus === 'partial' ? 'badge-warning' : feeStatus === 'unpaid' ? 'badge-danger' : 'badge-neutral'}">${escapeHTML(feeStatus)}</span>
              <span class="badge badge-neutral">${escapeHTML(className)}</span>
            </div>
          </div>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:12px;">
          ${[
            ['Code',       raw.student_code || '—'],
            ['Gender',     raw.gender || '—'],
            ['Date of Birth', raw.date_of_birth ? (typeof fmtDate === 'function' ? fmtDate(raw.date_of_birth) : raw.date_of_birth) : '—'],
            ['Birthplace', raw.birthplace || '—'],
            ['Nationality',raw.nationality || '—'],
            ['Insurance',  raw.medical_insurance || '—'],
            ['Province',   raw.province || '—'],
            ['District',   raw.district || '—'],
            ['Sector',     raw.sector || '—'],
            ['Cell',       raw.cell || '—'],
            ['Village',    raw.village || '—'],
            ['SDMS Code',  raw.sdms_code || '—'],
            ['Guardian',   guardianName],
            ['Guardian Phone', guardianPhone],
            ['Fee Balance', typeof fmtCurrency === 'function' ? fmtCurrency(summary.outstanding || 0) : '—'],
            ['Term Average', average !== null ? average + '%' : '—'],
          ].map(([k, v]) => `
          <div style="padding:6px 8px;background:rgba(255,255,255,.03);border-radius:4px;">
            <div style="color:var(--text-muted);font-size:10px;text-transform:uppercase;letter-spacing:.5px;">${escapeHTML(k)}</div>
            <div style="font-weight:600;margin-top:2px;">${escapeHTML(String(v))}</div>
          </div>`).join('')}
        </div>

        ${attendanceRate !== null ? `
        <div style="display:flex;align-items:center;gap:8px;margin-top:12px;font-size:12px;">
          <span style="color:var(--text-muted);min-width:80px;">Attendance</span>
          <div style="flex:1;height:6px;background:rgba(255,255,255,.08);border-radius:3px;">
            <div style="width:${attendanceRate}%;height:100%;background:var(--color-success);border-radius:3px;"></div>
          </div>
          <span style="font-weight:700;">${attendanceRate}%</span>
        </div>` : ''}`;

        showModal(content, {
            title: name,
            size: 'md',
            footer: `
            <button class="btn btn-ghost" onclick="closeModal()">Close</button>
            <button class="btn btn-secondary" onclick="closeModal();StudentDetails.openEdit(${raw.id})">
                <i class="fa-solid fa-pen"></i> Edit</button>
            <button class="btn btn-primary" onclick="closeModal();navigateTo('student-profile',{studentId:${raw.id}})">
                <i class="fa-solid fa-user"></i> Full Profile</button>`,
        });
    }

    // ── FULL EDIT FORM ─────────────────────────────────────────────
    async function openEdit(studentId) {
        const raw = (state.students || []).find(s => s.id === studentId);
        if (!raw) { showToast('Student not found.', 'warning'); return; }

        // Load guardians for this student
        let guardians = [];
        try {
            const links = await getAll('student_guardians', `student_id=eq.${studentId}&order=relationship.asc`);
            if (links?.length) {
                const gIds = links.map(l => l.guardian_id).filter(Boolean);
                if (gIds.length) {
                    const gs = await getAll('guardians', `id=in.(${gIds.join(',')})`);
                    guardians = (gs || []).map(g => ({
                        ...g,
                        relationship: links.find(l => l.guardian_id === g.id)?.relationship || g.guardian_type || 'guardian',
                    }));
                }
            }
        } catch(e) {}

        const father = guardians.find(g => g.relationship === 'father' || g.guardian_type === 'father') || {};
        const mother = guardians.find(g => g.relationship === 'mother' || g.guardian_type === 'mother') || {};

        const classes = (state.classes || []).filter(c => c.is_active !== false)
            .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));

        const insuranceOptions = ['MUTUELLE DE SANTE','RSSB','MMI','RADIANT','SORAS','BRITAM','COGEBANQUE','Other'];
        const currentInsurance = raw.medical_insurance || '';
        const isOtherInsurance = currentInsurance && !insuranceOptions.slice(0,-1).includes(currentInsurance);

        const formHTML = `
        <div style="max-height:70vh;overflow-y:auto;padding-right:8px;">

          <!-- Student info -->
          <div style="font-weight:700;font-size:13px;margin-bottom:10px;color:var(--text-muted);
               text-transform:uppercase;letter-spacing:.5px;">
            <i class="fa-solid fa-child"></i> Student Information
          </div>
          <div class="form-grid" style="margin-bottom:16px;">
            <div class="field">
              <label class="field-label">First Name *</label>
              <input type="text" id="edit-first-name" class="input" value="${escapeHTML(raw.first_name||'')}">
            </div>
            <div class="field">
              <label class="field-label">Last Name *</label>
              <input type="text" id="edit-last-name" class="input" value="${escapeHTML(raw.last_name||'')}">
            </div>
            <div class="field">
              <label class="field-label">Student Code</label>
              <input type="text" id="edit-code" class="input" value="${escapeHTML(raw.student_code||raw.code||'')}" readonly
                     style="opacity:.6;cursor:not-allowed;" title="Code is auto-generated">
            </div>
            <div class="field">
              <label class="field-label">Class</label>
              <select id="edit-class" class="select">
                <option value="">— Select class —</option>
                ${classes.map(c => `<option value="${c.id}" ${c.id === raw.class_id ? 'selected' : ''}>${escapeHTML(c.name)}</option>`).join('')}
              </select>
            </div>
            <div class="field">
              <label class="field-label">Gender</label>
              <select id="edit-gender" class="select">
                <option value="">— Select —</option>
                <option value="Male"   ${raw.gender === 'Male'   ? 'selected' : ''}>Male</option>
                <option value="Female" ${raw.gender === 'Female' ? 'selected' : ''}>Female</option>
              </select>
            </div>
            <div class="field">
              <label class="field-label">Date of Birth</label>
              <input type="date" id="edit-dob" class="input" value="${escapeHTML(raw.date_of_birth||'')}">
            </div>
            <div class="field">
              <label class="field-label">Birthplace (District)</label>
              <input type="text" id="edit-birthplace" class="input" value="${escapeHTML(raw.birthplace||'')}">
            </div>
            <div class="field">
              <label class="field-label">Nationality</label>
              <input type="text" id="edit-nationality" class="input" value="${escapeHTML(raw.nationality||'Rwandan')}">
            </div>
            <div class="field">
              <label class="field-label">Medical Insurance</label>
              <select id="edit-insurance" class="select" onchange="editInsuranceChange()">
                <option value="">— Select —</option>
                ${insuranceOptions.map(o => {
                    const val = o === 'Other' ? '__other__' : o;
                    const sel = (isOtherInsurance && o === 'Other') || currentInsurance === o ? 'selected' : '';
                    return `<option value="${val}" ${sel}>${escapeHTML(o)}</option>`;
                }).join('')}
              </select>
            </div>
            <div class="field" id="edit-insurance-other-wrap" style="${isOtherInsurance ? '' : 'display:none;'}">
              <label class="field-label">Other Insurance Name</label>
              <input type="text" id="edit-insurance-other" class="input"
                     value="${isOtherInsurance ? escapeHTML(currentInsurance) : ''}">
            </div>
            <div class="field">
              <label class="field-label">SDMS Code</label>
              <input type="text" id="edit-sdms-code" class="input" value="${escapeHTML(raw.sdms_code||'')}">
            </div>
            <div class="field">
              <label class="field-label">Previous School</label>
              <input type="text" id="edit-prev-school" class="input" value="${escapeHTML(raw.previous_school||'')}">
            </div>
            <div class="field">
              <label class="field-label">Previous School Marks (%)</label>
              <input type="number" id="edit-prev-marks" class="input" min="0" max="100" step="0.1"
                     value="${raw.previous_school_marks || ''}">
            </div>
            <div class="field">
              <label class="field-label">Status</label>
              <select id="edit-status" class="select">
                <option value="Active"   ${raw.status === 'Active'   ? 'selected' : ''}>Active</option>
                <option value="Inactive" ${raw.status === 'Inactive' ? 'selected' : ''}>Inactive</option>
                <option value="Archived" ${raw.status === 'Archived' ? 'selected' : ''}>Archived</option>
              </select>
            </div>
            <div class="field" style="grid-column:1/-1;">
              <label class="field-label">Notes</label>
              <textarea id="edit-notes" class="input" rows="2">${escapeHTML(raw.notes||'')}</textarea>
            </div>
          </div>

          <!-- Location -->
          <div style="font-weight:700;font-size:13px;margin-bottom:10px;color:var(--text-muted);
               text-transform:uppercase;letter-spacing:.5px;">
            <i class="fa-solid fa-location-dot"></i> Home Location
          </div>
          <div class="form-grid" style="margin-bottom:16px;">
            <div class="field">
              <label class="field-label">Province</label>
              <input type="text" id="edit-province" class="input" value="${escapeHTML(raw.province||'')}">
            </div>
            <div class="field">
              <label class="field-label">District</label>
              <input type="text" id="edit-district" class="input" value="${escapeHTML(raw.district||'')}">
            </div>
            <div class="field">
              <label class="field-label">Sector</label>
              <input type="text" id="edit-sector" class="input" value="${escapeHTML(raw.sector||'')}">
            </div>
            <div class="field">
              <label class="field-label">Cell</label>
              <input type="text" id="edit-cell" class="input" value="${escapeHTML(raw.cell||'')}">
            </div>
            <div class="field">
              <label class="field-label">Village</label>
              <input type="text" id="edit-village" class="input" value="${escapeHTML(raw.village||'')}">
            </div>
          </div>

          <!-- Father -->
          <div style="font-weight:700;font-size:13px;margin-bottom:10px;color:var(--text-muted);
               text-transform:uppercase;letter-spacing:.5px;">
            <i class="fa-solid fa-person"></i> Father / Paternal Guardian
          </div>
          <div class="form-grid" style="margin-bottom:16px;">
            <div class="field"><label class="field-label">First Name</label>
              <input type="text" id="edit-father-first" class="input" value="${escapeHTML(father.first_name||'')}"></div>
            <div class="field"><label class="field-label">Last Name</label>
              <input type="text" id="edit-father-last" class="input" value="${escapeHTML(father.last_name||'')}"></div>
            <div class="field"><label class="field-label">Phone</label>
              <input type="tel" id="edit-father-phone" class="input" value="${escapeHTML(father.phone||'')}"></div>
            <div class="field"><label class="field-label">National ID</label>
              <input type="text" id="edit-father-nid" class="input" value="${escapeHTML(father.national_id||'')}" maxlength="20"></div>
            <div class="field"><label class="field-label">Email</label>
              <input type="email" id="edit-father-email" class="input" value="${escapeHTML(father.email||'')}"></div>
            <div class="field"><label class="field-label">Occupation</label>
              <input type="text" id="edit-father-occupation" class="input" value="${escapeHTML(father.occupation||'')}"></div>
            <div class="field"><label class="field-label">Employer</label>
              <input type="text" id="edit-father-employer" class="input" value="${escapeHTML(father.employer||'')}"></div>
          </div>

          <!-- Mother -->
          <div style="font-weight:700;font-size:13px;margin-bottom:10px;color:var(--text-muted);
               text-transform:uppercase;letter-spacing:.5px;">
            <i class="fa-solid fa-person-dress"></i> Mother / Maternal Guardian
          </div>
          <div class="form-grid" style="margin-bottom:16px;">
            <div class="field"><label class="field-label">First Name</label>
              <input type="text" id="edit-mother-first" class="input" value="${escapeHTML(mother.first_name||'')}"></div>
            <div class="field"><label class="field-label">Last Name</label>
              <input type="text" id="edit-mother-last" class="input" value="${escapeHTML(mother.last_name||'')}"></div>
            <div class="field"><label class="field-label">Phone</label>
              <input type="tel" id="edit-mother-phone" class="input" value="${escapeHTML(mother.phone||'')}"></div>
            <div class="field"><label class="field-label">National ID</label>
              <input type="text" id="edit-mother-nid" class="input" value="${escapeHTML(mother.national_id||'')}" maxlength="20"></div>
            <div class="field"><label class="field-label">Email</label>
              <input type="email" id="edit-mother-email" class="input" value="${escapeHTML(mother.email||'')}"></div>
            <div class="field"><label class="field-label">Occupation</label>
              <input type="text" id="edit-mother-occupation" class="input" value="${escapeHTML(mother.occupation||'')}"></div>
            <div class="field"><label class="field-label">Employer</label>
              <input type="text" id="edit-mother-employer" class="input" value="${escapeHTML(mother.employer||'')}"></div>
          </div>

        </div>`;

        // Store context for the save handler
        window._sdEditContext = {
            studentId, raw, father, mother,
            fatherId: father.id || null,
            motherId: mother.id || null,
        };

        showModal(formHTML, {
            title: `Edit — ${raw.first_name} ${raw.last_name}`,
            size: 'xl',
            footer: `
            <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
            <button class="btn btn-primary" onclick="sdSaveEdit()">
              <i class="fa-solid fa-floppy-disk"></i> Save Changes</button>`,
        });
    }

    function render(container, params) {
        if (params?.studentId) open(params.studentId);
    }

    return { open, openEdit, render };
})();

// ── INSURANCE CHANGE ────────────────────────────────────────────────
window.editInsuranceChange = () => {
    const sel  = document.getElementById('edit-insurance');
    const wrap = document.getElementById('edit-insurance-other-wrap');
    if (wrap) wrap.style.display = sel?.value === '__other__' ? 'block' : 'none';
};

// ── SAVE EDIT ───────────────────────────────────────────────────────
window.sdSaveEdit = async () => {
    const ctx = window._sdEditContext;
    if (!ctx) return;

    const g   = id => (document.getElementById(id)?.value || '').trim();
    const now = new Date().toISOString();
    const today = now.split('T')[0];
    const year  = getActiveYear();
    const term  = getActiveTerm();

    const insuranceRaw = document.getElementById('edit-insurance')?.value;
    const insurance = insuranceRaw === '__other__' ? g('edit-insurance-other') : insuranceRaw;

    const newClassId = parseInt(document.getElementById('edit-class')?.value || '0') || null;
    const oldClassId = ctx.raw.class_id || null;
    const classChanged = newClassId && newClassId !== oldClassId;

    // ── Update student ──────────────────────────────────────────────
    const studentPayload = {
        first_name            : g('edit-first-name') || ctx.raw.first_name,
        last_name             : g('edit-last-name')  || ctx.raw.last_name,
        class_id              : newClassId || oldClassId,
        gender                : document.getElementById('edit-gender')?.value   || null,
        date_of_birth         : document.getElementById('edit-dob')?.value      || null,
        birthplace            : g('edit-birthplace')    || null,
        nationality           : g('edit-nationality')   || null,
        medical_insurance     : insurance               || null,
        sdms_code             : g('edit-sdms-code')     || null,
        previous_school       : g('edit-prev-school')   || null,
        previous_school_marks : parseFloat(document.getElementById('edit-prev-marks')?.value || '') || null,
        province              : g('edit-province') || null,
        district              : g('edit-district') || null,
        sector                : g('edit-sector')   || null,
        cell                  : g('edit-cell')     || null,
        village               : g('edit-village')  || null,
        address               : [g('edit-village'), g('edit-cell'), g('edit-sector'), g('edit-district'), g('edit-province')].filter(Boolean).join(', ') || null,
        status                : document.getElementById('edit-status')?.value   || 'Active',
        notes                 : g('edit-notes')   || null,
        // Update flat guardian fields for backward compat
        guardian_name         : g('edit-father-first') ? `${g('edit-father-first')} ${g('edit-father-last')}`.trim() : (g('edit-mother-first') ? `${g('edit-mother-first')} ${g('edit-mother-last')}`.trim() : ctx.raw.guardian_name),
        guardian_phone        : g('edit-father-phone') || g('edit-mother-phone') || ctx.raw.guardian_phone || null,
        guardian_email        : g('edit-father-email') || g('edit-mother-email') || ctx.raw.guardian_email || null,
        updated_at            : now,
    };

    try {
        await update('students', ctx.studentId, studentPayload);

        // ── Update or insert guardians ──────────────────────────────
        const guardianUpdates = [
            { prefix: 'father', id: ctx.fatherId, type: 'father', isPrimary: true },
            { prefix: 'mother', id: ctx.motherId, type: 'mother', isPrimary: false },
        ];

        for (const gd of guardianUpdates) {
            const firstName = g(`edit-${gd.prefix}-first`);
            if (!firstName) continue;

            const guardianPayload = {
                first_name    : firstName,
                last_name     : g(`edit-${gd.prefix}-last`)       || null,
                phone         : g(`edit-${gd.prefix}-phone`)       || null,
                national_id   : g(`edit-${gd.prefix}-nid`)         || null,
                email         : g(`edit-${gd.prefix}-email`)       || null,
                occupation    : g(`edit-${gd.prefix}-occupation`)  || null,
                employer      : g(`edit-${gd.prefix}-employer`)    || null,
                guardian_type : gd.type,
                is_primary    : gd.isPrimary,
                is_active     : true,
                province      : g('edit-province') || null,
                district      : g('edit-district') || null,
                sector        : g('edit-sector')   || null,
                cell          : g('edit-cell')     || null,
                village       : g('edit-village')  || null,
                updated_at    : now,
            };

            if (gd.id) {
                await update('guardians', gd.id, guardianPayload).catch(() => {});
            } else {
                // New guardian — insert and link
                guardianPayload.family_id  = ctx.raw.family_id || null;
                guardianPayload.created_at = now;
                const newG = await insert('guardians', guardianPayload).catch(() => null);
                if (newG?.id) {
                    await insert('student_guardians', {
                        student_id          : ctx.studentId,
                        guardian_id         : newG.id,
                        relationship        : gd.type,
                        is_emergency_contact: gd.isPrimary,
                        created_at          : now,
                    }).catch(() => {});
                }
            }
        }

        // ── Class change — update enrollment history ─────────────────
        if (classChanged) {
            // Close old enrollment
            const oldEnroll = (state.classEnrollments || []).find(e =>
                e.student_id === ctx.studentId && e.is_active);
            if (oldEnroll) {
                await update('class_enrollments', oldEnroll.id, {
                    is_active  : false,
                    status     : 'transferred',
                    end_date   : today,
                    updated_at : now,
                }).catch(() => {});
            }
            // Open new enrollment
            await insert('class_enrollments', {
                student_id       : ctx.studentId,
                class_id         : newClassId,
                academic_year_id : year?.id || null,
                term_id          : term?.id  || null,
                enrollment_date  : today,
                is_active        : true,
                status           : 'active',
                enrolled_by      : state.currentUser?.id || null,
                notes            : `Class changed from ${oldClassId} to ${newClassId}`,
                created_at       : now,
                updated_at       : now,
            }).catch(() => {});
            // Record in history
            await insert('student_class_history', {
                student_id       : ctx.studentId,
                class_id         : newClassId,
                from_class_id    : oldClassId,
                academic_year_id : year?.id || null,
                term_id          : term?.id  || null,
                start_date       : today,
                status           : 'transferred',
                reason           : 'class_change',
                recorded_by      : state.currentUser?.id || null,
                created_at       : now,
            }).catch(() => {});
        }

        // ── Log and refresh ─────────────────────────────────────────
        if (typeof logAction === 'function') {
            logAction('student_updated', 'students', ctx.studentId, {
                name        : `${studentPayload.first_name} ${studentPayload.last_name}`,
                classChanged,
                oldClass    : oldClassId,
                newClass    : newClassId,
            });
        }

        await loadAllData({ silent: true });
        closeModal();
        showToast('Student details updated.', 'success');

    } catch(err) { handleApiError(err, 'update student'); }
};

// ── EXPOSE ──────────────────────────────────────────────────────────
window.StudentDetails     = StudentDetails;
window.renderStudentDetails = StudentDetails.render;
