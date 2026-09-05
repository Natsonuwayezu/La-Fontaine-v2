/* ═══════════════════════════════════════════════════════════════════
   js/modules/students/student-details.js  v9.1
   ═══════════════════════════════════════════════════════════════════
   Quick-peek drawer + full edit modal with cascade updates.

   CLASS CHANGE LOGIC:
   When class changes:
     1. Delete all student_fees for this student + year (reassign fresh)
     2. Close old class_enrollments row
     3. Open new class_enrollments row
     4. Write student_class_history row
     5. Assign fees for new class automatically

   GUARDIAN CASCADE:
   When guardian name/phone/email changes:
     - updates guardians table
     - updates students.guardian_name/phone/email (flat compat)
     - updates families.guardian_name/phone if this guardian is primary
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

const StudentDetails = (() => {

    function escH(str) {
        const d = document.createElement('div');
        d.textContent = str ?? '';
        return d.innerHTML;
    }

    function initials(name) {
        return (name||'?').split(' ').map(w=>w[0]).filter(Boolean).slice(0,2).join('').toUpperCase();
    }

    // ── QUICK-PEEK DRAWER ──────────────────────────────────────────
    async function open(studentId) {
        const raw = (state.students||[]).find(s=>s.id===studentId);
        if (!raw) { showToast('Student not found.','warning'); return; }

        const classMap = new Map((state.classes||[]).map(c=>[c.id,c.name]));
        const yearId   = typeof getActiveYearId==='function'?getActiveYearId():null;
        const termId   = typeof getActiveTermId==='function'?getActiveTermId():null;

        // Fees
        const myFees = (state.studentFees||[]).filter(f=>
            f.student_id===raw.id&&(!yearId||f.academic_year_id===yearId));
        const credit = Number((state.creditBalances||[]).find(c=>c.student_id===raw.id)?.credit_amount||0);
        const summary = typeof computeStudentFeeSummary==='function'
            ? computeStudentFeeSummary(myFees,credit)
            : {outstanding:0,paid:0,isFullyPaid:!myFees.length};
        const feeStatus = !myFees.length?'unknown':summary.isFullyPaid?'paid':summary.paid>0?'partial':'unpaid';

        // Academics
        const termAssIds = new Set((state.assessments||[])
            .filter(a=>!termId||String(a.term_id)===String(termId)).map(a=>a.id));
        const myMarks = (state.marks||[]).filter(m=>
            m.student_id===raw.id&&termAssIds.has(m.assessment_id)&&!m.is_absent&&m.score!=null);
        const pcts = myMarks.map(m=>{
            const a=(state.assessments||[]).find(x=>x.id===m.assessment_id);
            return a?.max_marks?(m.score/a.max_marks)*100:null;
        }).filter(p=>p!==null);
        const average = pcts.length
            ? Math.round(pcts.reduce((a,b)=>a+b,0)/pcts.length):null;

        // Guardians from state
        const links = (state.studentGuardians||[]).filter(g=>g.student_id===raw.id);
        const gIds  = links.map(g=>g.guardian_id).filter(Boolean);
        const guards= (state.guardians||[]).filter(g=>gIds.includes(g.id));
        const father= guards.find(g=>g.guardian_type==='father'||links.find(l=>l.guardian_id===g.id&&l.relationship==='father'));
        const mother= guards.find(g=>g.guardian_type==='mother'||links.find(l=>l.guardian_id===g.id&&l.relationship==='mother'));
        const primaryG = father||mother;
        const guardianName  = primaryG?`${primaryG.first_name||''} ${primaryG.last_name||''}`.trim():raw.guardian_name||'—';
        const guardianPhone = primaryG?.phone||raw.guardian_phone||'—';

        const name      = `${raw.first_name||''} ${raw.last_name||''}`.trim()||`#${raw.id}`;
        const className = classMap.get(raw.class_id)||'—';

        const rows = [
            ['Code',          raw.student_code||'—'],
            ['Gender',        raw.gender||'—'],
            ['Date of Birth', raw.date_of_birth?(typeof fmtDate==='function'?fmtDate(raw.date_of_birth):raw.date_of_birth):'—'],
            ['Birthplace',    raw.birthplace||'—'],
            ['Nationality',   raw.nationality||'—'],
            ['Insurance',     raw.medical_insurance||'—'],
            ['Province',      raw.province||'—'],
            ['District',      raw.district||'—'],
            ['Sector',        raw.sector||'—'],
            ['Cell',          raw.cell||'—'],
            ['Village',       raw.village||'—'],
            ['SDMS Code',     raw.sdms_code||'—'],
            ['Guardian',      guardianName],
            ['Guardian Phone',guardianPhone],
            ['Fee Balance',   typeof fmtCurrency==='function'?fmtCurrency(summary.outstanding||0):'—'],
            ['Term Average',  average!==null?average+'%':'—'],
        ];

        showModal(`
        <div style="display:flex;align-items:center;gap:14px;margin-bottom:16px;">
          <div style="width:48px;height:48px;border-radius:50%;background:var(--role-primary);
               display:flex;align-items:center;justify-content:center;font-weight:700;
               font-size:18px;color:#fff;flex-shrink:0;">${escH(initials(name))}</div>
          <div>
            <div style="font-weight:600;font-size:15px;">${escH(name)}</div>
            <div style="display:flex;gap:6px;margin-top:4px;flex-wrap:wrap;">
              <span class="badge ${raw.status==='Active'?'badge-success':'badge-neutral'}">${escH(raw.status||'Active')}</span>
              <span class="badge ${feeStatus==='paid'?'badge-success':feeStatus==='partial'?'badge-warning':feeStatus==='unpaid'?'badge-danger':'badge-neutral'}">${escH(feeStatus)}</span>
              <span class="badge badge-neutral">${escH(className)}</span>
            </div>
          </div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:12px;">
          ${rows.map(([k,v])=>`
          <div style="padding:6px 8px;background:rgba(255,255,255,.03);border-radius:4px;">
            <div style="color:var(--text-muted);font-size:10px;text-transform:uppercase;letter-spacing:.5px;">${escH(k)}</div>
            <div style="font-weight:600;margin-top:2px;">${escH(String(v))}</div>
          </div>`).join('')}
        </div>`, {
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

    // ── FULL EDIT MODAL ────────────────────────────────────────────
    async function openEdit(studentId) {
        const raw = (state.students||[]).find(s=>s.id===studentId);
        if (!raw) { showToast('Student not found.','warning'); return; }

        // Load guardians from state
        const links  = (state.studentGuardians||[]).filter(g=>g.student_id===studentId);
        const gIds   = links.map(g=>g.guardian_id).filter(Boolean);
        const guards = (state.guardians||[]).filter(g=>gIds.includes(g.id));
        const father = guards.find(g=>g.guardian_type==='father'||links.find(l=>l.guardian_id===g.id&&l.relationship==='father'))||{};
        const mother = guards.find(g=>g.guardian_type==='mother'||links.find(l=>l.guardian_id===g.id&&l.relationship==='mother'))||{};

        const classes = (state.classes||[]).filter(c=>c.is_active!==false)
            .sort((a,b)=>(a.sort_order||0)-(b.sort_order||0));
        const INS = ['MUTUELLE DE SANTE','RSSB','MMI','RADIANT','SORAS','BRITAM','COGEBANQUE'];
        const curIns = raw.medical_insurance||'';
        const isOther = curIns && !INS.includes(curIns);

        // Fee categories for new class assignment section
        const feeCats = (state.feeCategories||[]).filter(c=>c.is_active!==false);

        window._sdCtx = {
            studentId, raw,
            fatherId: father.id||null,
            motherId: mother.id||null,
        };

        showModal(`
        <div style="max-height:75vh;overflow-y:auto;padding-right:4px;">

          <!-- STUDENT INFO -->
          <div style="font-weight:700;font-size:12px;text-transform:uppercase;letter-spacing:.5px;
               color:var(--text-muted);margin-bottom:10px;border-bottom:1px solid var(--border);padding-bottom:6px;">
            <i class="fa-solid fa-child"></i> Student Information
          </div>
          <div class="form-grid" style="margin-bottom:16px;">
            <div class="field"><label class="field-label">First Name *</label>
              <input type="text" id="ed-first" class="input" value="${escH(raw.first_name||'')}"></div>
            <div class="field"><label class="field-label">Last Name *</label>
              <input type="text" id="ed-last" class="input" value="${escH(raw.last_name||'')}"></div>
            <div class="field"><label class="field-label">Class *</label>
              <select id="ed-class" class="select" onchange="sdClassChanged()">
                <option value="">— Select class —</option>
                ${classes.map(c=>`<option value="${c.id}" ${c.id===raw.class_id?'selected':''}>${escH(c.name)}</option>`).join('')}
              </select></div>
            <div class="field"><label class="field-label">Gender</label>
              <select id="ed-gender" class="select">
                <option value="">—</option>
                <option value="Male" ${raw.gender==='Male'?'selected':''}>Male</option>
                <option value="Female" ${raw.gender==='Female'?'selected':''}>Female</option>
              </select></div>
            <div class="field"><label class="field-label">Date of Birth</label>
              <input type="date" id="ed-dob" class="input" value="${escH(raw.date_of_birth||'')}"></div>
            <div class="field"><label class="field-label">Birthplace</label>
              <input type="text" id="ed-birthplace" class="input" value="${escH(raw.birthplace||'')}"></div>
            <div class="field"><label class="field-label">Nationality</label>
              <input type="text" id="ed-nationality" class="input" value="${escH(raw.nationality||'Rwandan')}"></div>
            <div class="field"><label class="field-label">Insurance</label>
              <select id="ed-insurance" class="select" onchange="sdInsChange()">
                <option value="">— None —</option>
                ${INS.map(o=>`<option value="${o}" ${curIns===o?'selected':''}>${o}</option>`).join('')}
                <option value="__other__" ${isOther?'selected':''}>Other</option>
              </select></div>
            <div class="field" id="ed-ins-other-wrap" style="${isOther?'':'display:none;'}">
              <label class="field-label">Other Insurance</label>
              <input type="text" id="ed-insurance-other" class="input" value="${isOther?escH(curIns):''}"></div>
            <div class="field"><label class="field-label">SDMS Code</label>
              <input type="text" id="ed-sdms" class="input" value="${escH(raw.sdms_code||'')}"></div>
            <div class="field"><label class="field-label">Previous School</label>
              <input type="text" id="ed-prevschool" class="input" value="${escH(raw.previous_school||'')}"></div>
            <div class="field"><label class="field-label">Prev. School Marks (%)</label>
              <input type="number" id="ed-prevmarks" class="input" min="0" max="100" step="0.1"
                     value="${raw.previous_school_marks||''}"></div>
            <div class="field"><label class="field-label">Status</label>
              <select id="ed-status" class="select">
                <option value="Active" ${raw.status==='Active'?'selected':''}>Active</option>
                <option value="Inactive" ${raw.status==='Inactive'?'selected':''}>Inactive</option>
                <option value="Archived" ${raw.status==='Archived'?'selected':''}>Archived</option>
              </select></div>
            <div class="field" style="grid-column:1/-1;"><label class="field-label">Notes</label>
              <textarea id="ed-notes" class="input" rows="2">${escH(raw.notes||'')}</textarea></div>
          </div>

          <!-- LOCATION -->
          <div style="font-weight:700;font-size:12px;text-transform:uppercase;letter-spacing:.5px;
               color:var(--text-muted);margin-bottom:10px;border-bottom:1px solid var(--border);padding-bottom:6px;">
            <i class="fa-solid fa-location-dot"></i> Home Location
          </div>
          <div class="form-grid" style="margin-bottom:16px;">
            <div class="field"><label class="field-label">Province</label>
              <input type="text" id="ed-province" class="input" value="${escH(raw.province||'')}"></div>
            <div class="field"><label class="field-label">District</label>
              <input type="text" id="ed-district" class="input" value="${escH(raw.district||'')}"></div>
            <div class="field"><label class="field-label">Sector</label>
              <input type="text" id="ed-sector" class="input" value="${escH(raw.sector||'')}"></div>
            <div class="field"><label class="field-label">Cell</label>
              <input type="text" id="ed-cell" class="input" value="${escH(raw.cell||'')}"></div>
            <div class="field"><label class="field-label">Village</label>
              <input type="text" id="ed-village" class="input" value="${escH(raw.village||'')}"></div>
          </div>

          <!-- CLASS CHANGE WARNING + FEE REASSIGNMENT -->
          <div id="sd-class-change-section" style="display:none;margin-bottom:16px;">
            <div class="alert alert-warning">
              <i class="fa-solid fa-triangle-exclamation"></i>
              <strong>Class changed</strong> — all existing fee assignments for this student
              will be deleted and replaced with the fees for the new class.
              Payments already recorded are kept.
            </div>
            <div style="font-weight:700;font-size:12px;text-transform:uppercase;letter-spacing:.5px;
                 color:var(--text-muted);margin-bottom:10px;margin-top:14px;border-bottom:1px solid var(--border);padding-bottom:6px;">
              <i class="fa-solid fa-tags"></i> Fee Assignment for New Class
            </div>
            <div id="sd-fee-reassign">
              ${feeCats.length ? feeCats.map(fc=>`
              <div style="display:flex;align-items:center;gap:10px;padding:7px 0;
                   border-bottom:1px solid var(--border);">
                <input type="checkbox" id="sd-fee-${fc.id}" data-cat="${fc.id}" checked
                       style="width:16px;height:16px;cursor:pointer;" onchange="sdFeeToggle(${fc.id})">
                <label for="sd-fee-${fc.id}" style="flex:1;font-size:13px;cursor:pointer;">${escH(fc.name)}</label>
                <span style="font-size:12px;color:var(--text-muted);">RWF</span>
                <input type="number" id="sd-fee-amt-${fc.id}" class="input"
                       style="width:130px;text-align:right;"
                       value="${fc.default_amount||0}" min="0" step="500">
              </div>`).join('') :
              '<div style="color:var(--text-muted);font-size:13px;">No fee categories configured.</div>'}
            </div>
          </div>

          <!-- FATHER -->
          <div style="font-weight:700;font-size:12px;text-transform:uppercase;letter-spacing:.5px;
               color:var(--text-muted);margin-bottom:10px;border-bottom:1px solid var(--border);padding-bottom:6px;">
            <i class="fa-solid fa-person"></i> Father / Paternal Guardian
          </div>
          <div class="form-grid" style="margin-bottom:16px;">
            <div class="field"><label class="field-label">First Name</label>
              <input type="text" id="ed-father-first" class="input" value="${escH(father.first_name||'')}"></div>
            <div class="field"><label class="field-label">Last Name</label>
              <input type="text" id="ed-father-last" class="input" value="${escH(father.last_name||'')}"></div>
            <div class="field"><label class="field-label">Phone</label>
              <input type="tel" id="ed-father-phone" class="input" value="${escH(father.phone||'')}"></div>
            <div class="field"><label class="field-label">National ID</label>
              <input type="text" id="ed-father-nid" class="input" value="${escH(father.national_id||'')}" maxlength="20"></div>
            <div class="field"><label class="field-label">Email</label>
              <input type="email" id="ed-father-email" class="input" value="${escH(father.email||'')}"></div>
            <div class="field"><label class="field-label">Occupation</label>
              <input type="text" id="ed-father-occupation" class="input" value="${escH(father.occupation||'')}"></div>
            <div class="field"><label class="field-label">Employer</label>
              <input type="text" id="ed-father-employer" class="input" value="${escH(father.employer||'')}"></div>
          </div>

          <!-- MOTHER -->
          <div style="font-weight:700;font-size:12px;text-transform:uppercase;letter-spacing:.5px;
               color:var(--text-muted);margin-bottom:10px;border-bottom:1px solid var(--border);padding-bottom:6px;">
            <i class="fa-solid fa-person-dress"></i> Mother / Maternal Guardian
          </div>
          <div class="form-grid" style="margin-bottom:16px;">
            <div class="field"><label class="field-label">First Name</label>
              <input type="text" id="ed-mother-first" class="input" value="${escH(mother.first_name||'')}"></div>
            <div class="field"><label class="field-label">Last Name</label>
              <input type="text" id="ed-mother-last" class="input" value="${escH(mother.last_name||'')}"></div>
            <div class="field"><label class="field-label">Phone</label>
              <input type="tel" id="ed-mother-phone" class="input" value="${escH(mother.phone||'')}"></div>
            <div class="field"><label class="field-label">National ID</label>
              <input type="text" id="ed-mother-nid" class="input" value="${escH(mother.national_id||'')}" maxlength="20"></div>
            <div class="field"><label class="field-label">Email</label>
              <input type="email" id="ed-mother-email" class="input" value="${escH(mother.email||'')}"></div>
            <div class="field"><label class="field-label">Occupation</label>
              <input type="text" id="ed-mother-occupation" class="input" value="${escH(mother.occupation||'')}"></div>
            <div class="field"><label class="field-label">Employer</label>
              <input type="text" id="ed-mother-employer" class="input" value="${escH(mother.employer||'')}"></div>
          </div>

        </div>`, {
            title: `Edit — ${raw.first_name} ${raw.last_name}`,
            size: 'xl',
            footer: `
            <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
            <button class="btn btn-primary" onclick="sdSave()">
              <i class="fa-solid fa-floppy-disk"></i> Save All Changes</button>`,
        });
    }

    function render(container, params) {
        if (params?.studentId) open(params.studentId);
    }

    return { open, openEdit, render };
})();

// ── HELPERS ──────────────────────────────────────────────────────────
window.sdInsChange = () => {
    const v = document.getElementById('ed-insurance')?.value;
    const w = document.getElementById('ed-ins-other-wrap');
    if (w) w.style.display = v==='__other__'?'block':'none';
};

window.sdClassChanged = () => {
    const sel  = document.getElementById('ed-class');
    const orig = window._sdCtx?.raw?.class_id;
    const sec  = document.getElementById('sd-class-change-section');
    if (!sec) return;
    const newId = parseInt(sel?.value||'0')||null;
    sec.style.display = (newId && newId!==orig) ? 'block' : 'none';
};

window.sdFeeToggle = catId => {
    const inp = document.getElementById(`sd-fee-amt-${catId}`);
    const cb  = document.getElementById(`sd-fee-${catId}`);
    if (inp) inp.disabled = !cb?.checked;
};

// ── SAVE ALL CHANGES ─────────────────────────────────────────────────
window.sdSave = async () => {
    const ctx = window._sdCtx;
    if (!ctx) return;

    const g   = id => (document.getElementById(id)?.value||'').trim();
    const now = new Date().toISOString();
    const today = now.split('T')[0];
    const year  = getActiveYear();
    const term  = getActiveTerm();

    const newClassId = parseInt(document.getElementById('ed-class')?.value||'0')||null;
    const oldClassId = ctx.raw.class_id||null;
    const classChanged = newClassId && newClassId!==oldClassId;

    const insRaw = document.getElementById('ed-insurance')?.value;
    const insurance = insRaw==='__other__' ? g('ed-insurance-other') : insRaw;

    const fName = g('ed-first')||ctx.raw.first_name;
    const lName = g('ed-last') ||ctx.raw.last_name;

    // ── Read guardian fields ────────────────────────────────────────
    const fatherData = {
        first_name : g('ed-father-first'),
        last_name  : g('ed-father-last'),
        phone      : g('ed-father-phone')||null,
        national_id: g('ed-father-nid')||null,
        email      : g('ed-father-email')||null,
        occupation : g('ed-father-occupation')||null,
        employer   : g('ed-father-employer')||null,
    };
    const motherData = {
        first_name : g('ed-mother-first'),
        last_name  : g('ed-mother-last'),
        phone      : g('ed-mother-phone')||null,
        national_id: g('ed-mother-nid')||null,
        email      : g('ed-mother-email')||null,
        occupation : g('ed-mother-occupation')||null,
        employer   : g('ed-mother-employer')||null,
    };

    const primaryName  = fatherData.first_name
        ? `${fatherData.first_name} ${fatherData.last_name||''}`.trim()
        : `${motherData.first_name||''} ${motherData.last_name||''}`.trim();
    const primaryPhone = fatherData.phone||motherData.phone||null;
    const primaryEmail = fatherData.email||motherData.email||null;

    try {
        // ── 1. Update student record ──────────────────────────────────
        await update('students', ctx.studentId, {
            first_name            : fName,
            last_name             : lName,
            class_id              : newClassId||oldClassId,
            gender                : document.getElementById('ed-gender')?.value||null,
            date_of_birth         : document.getElementById('ed-dob')?.value||null,
            birthplace            : g('ed-birthplace')||null,
            nationality           : g('ed-nationality')||null,
            medical_insurance     : insurance||null,
            sdms_code             : g('ed-sdms')||null,
            previous_school       : g('ed-prevschool')||null,
            previous_school_marks : parseFloat(document.getElementById('ed-prevmarks')?.value||'')||null,
            province              : g('ed-province')||null,
            district              : g('ed-district')||null,
            sector                : g('ed-sector')||null,
            cell                  : g('ed-cell')||null,
            village               : g('ed-village')||null,
            address               : [g('ed-village'),g('ed-cell'),g('ed-sector'),g('ed-district'),g('ed-province')].filter(Boolean).join(', ')||null,
            status                : document.getElementById('ed-status')?.value||'Active',
            notes                 : g('ed-notes')||null,
            // Flat guardian compat fields — cascade from guardian update below
            guardian_name         : primaryName||ctx.raw.guardian_name||null,
            guardian_phone        : primaryPhone||ctx.raw.guardian_phone||null,
            guardian_email        : primaryEmail||ctx.raw.guardian_email||null,
            updated_at            : now,
        });

        // ── 2. Update / insert guardians + cascade everywhere ─────────
        const guardianDefs = [
            { data: fatherData, id: ctx.fatherId, type: 'father', isPrimary: true  },
            { data: motherData, id: ctx.motherId, type: 'mother', isPrimary: false },
        ];

        for (const gd of guardianDefs) {
            if (!gd.data.first_name) continue;

            const payload = {
                first_name    : gd.data.first_name,
                last_name     : gd.data.last_name||null,
                phone         : gd.data.phone,
                national_id   : gd.data.national_id,
                email         : gd.data.email,
                occupation    : gd.data.occupation,
                employer      : gd.data.employer,
                guardian_type : gd.type,
                is_primary    : gd.isPrimary,
                is_active     : true,
                province      : g('ed-province')||null,
                district      : g('ed-district')||null,
                sector        : g('ed-sector')||null,
                cell          : g('ed-cell')||null,
                village       : g('ed-village')||null,
                updated_at    : now,
            };

            let guardianId = gd.id;
            if (guardianId) {
                await update('guardians', guardianId, payload).catch(()=>{});
            } else {
                payload.family_id  = ctx.raw.family_id||null;
                payload.created_at = now;
                const newG = await insert('guardians', payload).catch(()=>null);
                if (newG?.id) {
                    guardianId = newG.id;
                    await insert('student_guardians', {
                        student_id          : ctx.studentId,
                        guardian_id         : guardianId,
                        relationship        : gd.type,
                        is_emergency_contact: gd.isPrimary,
                        created_at          : now,
                    }).catch(()=>{});
                }
            }

            // CASCADE: if primary guardian, update families table too
            if (gd.isPrimary && ctx.raw.family_id && guardianId) {
                const fullName = `${gd.data.first_name} ${gd.data.last_name||''}`.trim();
                await update('families', ctx.raw.family_id, {
                    guardian_name  : fullName||null,
                    guardian_phone : gd.data.phone||null,
                    guardian_email : gd.data.email||null,
                    updated_at     : now,
                }).catch(()=>{});
            }

            // CASCADE: update all siblings (same family) flat guardian fields
            // so every sibling's students.guardian_name reflects the update
            if (gd.isPrimary && ctx.raw.family_id) {
                const siblings = (state.students||[]).filter(s=>
                    s.family_id===ctx.raw.family_id && s.id!==ctx.studentId);
                for (const sib of siblings) {
                    await update('students', sib.id, {
                        guardian_name  : `${gd.data.first_name} ${gd.data.last_name||''}`.trim()||null,
                        guardian_phone : gd.data.phone||null,
                        guardian_email : gd.data.email||null,
                        updated_at     : now,
                    }).catch(()=>{});
                }
            }
        }

        // ── 3. Class change: delete old fees + reassign for new class ──
        if (classChanged) {
            // Delete all student_fees for this year (but NOT payments — they stay)
            const oldFees = (state.studentFees||[]).filter(f=>
                f.student_id===ctx.studentId&&(!year?.id||f.academic_year_id===year.id));
            for (const f of oldFees) {
                await remove('student_fees', f.id).catch(()=>{});
            }

            // Assign fees for new class
            const feeAmounts = (state.feeAmounts||[]).filter(fa=>
                String(fa.class_id)===String(newClassId)&&
                (!year?.id||fa.academic_year_id===year.id));
            const feeCats = feeAmounts.length
                ? feeAmounts.map(fa=>({
                    feeAmountId: fa.id,
                    categoryId : fa.fee_category_id,
                    amount     : fa.amount,
                    name       : (state.feeCategories||[]).find(c=>c.id===fa.fee_category_id)?.name||'Fee',
                  }))
                : (state.feeCategories||[]).filter(c=>c.is_active!==false).map(c=>({
                    feeAmountId: null,
                    categoryId : c.id,
                    amount     : c.default_amount||0,
                    name       : c.name,
                  }));

            for (const fc of feeCats) {
                const cb  = document.getElementById(`sd-fee-${fc.categoryId}`);
                if (cb && !cb.checked) continue;
                const amt = parseFloat(document.getElementById(`sd-fee-amt-${fc.categoryId}`)?.value||String(fc.amount))||0;
                const needsApproval = amt>0;
                await insert('student_fees', {
                    student_id        : ctx.studentId,
                    fee_category_id   : fc.categoryId,
                    fee_name          : fc.name,
                    amount            : fc.amount||amt,
                    waived_amount     : 0,
                    paid_amount       : 0,
                    is_paid           : false,
                    is_waived         : false,
                    requires_approval : needsApproval,
                    is_approved       : !needsApproval,
                    source            : 'class_change',
                    academic_year_id  : year?.id||null,
                    term_id           : term?.id||null,
                    due_date          : term?.end_date||null,
                    notes             : `Re-assigned after class change to ${(state.classes||[]).find(c=>c.id===newClassId)?.name||newClassId}`,
                    created_at        : now,
                    updated_at        : now,
                }).catch(()=>{});
            }

            // Update enrollment history
            const oldEnroll = (state.classEnrollments||[]).find(e=>
                e.student_id===ctx.studentId&&e.is_active);
            if (oldEnroll) {
                await update('class_enrollments', oldEnroll.id, {
                    is_active:'false'===String(false)||false,
                    status   :'transferred',
                    end_date : today,
                    updated_at:now,
                }).catch(()=>{});
            }
            await insert('class_enrollments', {
                student_id       : ctx.studentId,
                class_id         : newClassId,
                academic_year_id : year?.id||null,
                term_id          : term?.id||null,
                enrollment_date  : today,
                is_active        : true,
                status           : 'active',
                enrolled_by      : state.currentUser?.id||null,
                notes            : `Class changed from ${oldClassId} → ${newClassId}`,
                created_at       : now,
                updated_at       : now,
            }).catch(()=>{});
            await insert('student_class_history', {
                student_id       : ctx.studentId,
                class_id         : newClassId,
                from_class_id    : oldClassId,
                academic_year_id : year?.id||null,
                term_id          : term?.id||null,
                start_date       : today,
                status           : 'transferred',
                reason           : 'class_change',
                recorded_by      : state.currentUser?.id||null,
                created_at       : now,
            }).catch(()=>{});
        }

        // ── 4. Log ──────────────────────────────────────────────────────
        if (typeof logAction==='function') {
            logAction('student_updated','students',ctx.studentId,{
                name:`${fName} ${lName}`,
                classChanged, oldClassId, newClassId,
                guardianUpdated: !!(fatherData.first_name||motherData.first_name),
            });
        }

        await loadAllData({silent:true});
        closeModal();
        showToast(`${fName} ${lName} updated successfully.`,'success');

    } catch(err) { handleApiError(err,'update student'); }
};

// ── PROFILE PAGE EDIT BUTTON WIRE ───────────────────────────────────
// Called from student-profile.js #profile-edit-btn
window.openStudentEdit = studentId => StudentDetails.openEdit(studentId);

window.StudentDetails     = StudentDetails;
window.renderStudentDetails = StudentDetails.render;
