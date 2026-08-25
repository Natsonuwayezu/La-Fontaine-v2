/* ═══════════════════════════════════════════════════════════════════
   js/modules/academics/second-sitting.js
   ═══════════════════════════════════════════════════════════════════
   Second sitting marks entry — available only after Term 3 ends.
   
   HOW IT WORKS:
   - Only students below promotion threshold are shown (auto-registered)
   - Only CORE subjects appear (non-core excluded)
   - Score entered as PERCENTAGE (0-100) directly
   - Score stored in marks.second_sitting_score (separate column)
   - Annual average is NOT recalculated — 2nd sitting is a separate column
   - After entry, promotion module can re-evaluate final decisions
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

let _ssClassId = null, _ssPage = 1;
const _ssSize  = 60;

async function renderSecondSitting(container, params = {}) {
    if (!container) return;
    await ensureStateLoaded();

    // Only available after Term 3 ends
    const terms   = (state.terms||[]).filter(t=>t.academic_year_id===getActiveYear()?.id)
        .sort((a,b)=>a.term_number-b.term_number);
    const term3   = terms.find(t=>t.term_number===3);
    const isAvailable = term3?.status==='completed';

    if (!isAvailable) {
        container.innerHTML = `<div class="module-wrap">
          <div class="mod-topbar"><div class="mod-topbar-left">
            <h1 class="mod-title"><i class="fa-solid fa-clock-rotate-left"></i> Second Sitting</h1>
          </div></div>
          <div class="section-card">
            <div class="empty-state" style="padding:60px;">
              <div class="es-icon"><i class="fa-solid fa-lock" style="font-size:48px;opacity:.3;"></i></div>
              <div class="es-title">Second Sitting Not Yet Available</div>
              <div class="es-sub">Second sitting marks can only be entered after Term 3 is marked as completed.</div>
            </div>
          </div></div>`;
        return;
    }

    _ssClassId = params.classId || state.classes?.[0]?.id || null;
    _ssShell(container);
}

function _ssShell(container) {
    const classes  = (state.classes||[]).filter(c=>c.is_active!==false)
        .sort((a,b)=>(a.sort_order||0)-(b.sort_order||0));
    const promoMark = parseFloat(state.schoolSettings?.promotion_mark||'50');
    const year     = getActiveYear();

    container.innerHTML = `
    <div class="module-wrap">
      <div class="mod-topbar">
        <div class="mod-topbar-left">
          <h1 class="mod-title"><i class="fa-solid fa-clock-rotate-left"></i> Second Sitting Marks</h1>
          <span class="badge badge-warning" style="margin-left:8px;">
            After Term 3 · Core Subjects Only</span>
        </div>
        <div class="mod-topbar-right">
          <select class="select select-sm" onchange="ssPickClass(parseInt(this.value))">
            <option value="">— Select class —</option>
            ${classes.map(c=>`<option value="${c.id}"${c.id===_ssClassId?' selected':''}>
              ${esc(c.name)}</option>`).join('')}
          </select>
        </div>
      </div>

      <div class="alert alert-info" style="margin-bottom:14px;">
        <i class="fa-solid fa-circle-info"></i>
        Enter scores as <strong>percentages (0-100)</strong>.
        Only students below <strong>${promoMark}%</strong> annual average are shown.
        The annual average is <strong>not changed</strong> — this column is used only for promotion eligibility.
      </div>

      <div class="section-card">
        <div id="ss-body">
          <div class="empty-state" style="padding:40px;">
            <div class="es-title">Select a class to see students eligible for second sitting</div>
          </div>
        </div>
      </div>
    </div>`;

    if (_ssClassId) ssPickClass(_ssClassId);
}

window.ssPickClass = classId => {
    _ssClassId = classId; _ssPage = 1;
    _ssRender(document.getElementById('ss-body'));
};

function _ssGetCoreSubjects(classId) {
    const yearTermIds = new Set((state.terms||[])
        .filter(t=>t.academic_year_id===getActiveYear()?.id).map(t=>t.id));
    const assmnts = (state.assessments||[]).filter(a=>
        a.class_id===classId && yearTermIds.has(a.term_id) && a.phase!=='second_sitting');
    const subjIds = [...new Set(assmnts.map(a=>a.subject_id))];
    return subjIds.map(id=>(state.subjects||[]).find(s=>s.id===id&&s.is_core!==false))
        .filter(Boolean).sort((a,b)=>(a.sort_order||99)-(b.sort_order||99));
}

function _ssComputeAnnualPct(studentId, classId) {
    const yearTermIds = new Set((state.terms||[])
        .filter(t=>t.academic_year_id===getActiveYear()?.id).map(t=>t.id));
    const assmnts = (state.assessments||[]).filter(a=>
        a.class_id===classId && yearTermIds.has(a.term_id) && a.phase!=='second_sitting');
    let tot=0, max=0;
    assmnts.forEach(a=>{
        const m=(state.marks||[]).find(m=>m.student_id===studentId&&m.assessment_id===a.id);
        if (m&&!m.is_absent&&m.score!=null) {tot+=Number(m.score); max+=Number(a.max_marks||0);}
    });
    return max>0?(tot/max)*100:null;
}

function _ssGetExistingSSScore(studentId, subjectId, classId) {
    const yearTermIds = new Set((state.terms||[])
        .filter(t=>t.academic_year_id===getActiveYear()?.id).map(t=>t.id));
    const ssAssmnt = (state.assessments||[]).find(a=>
        a.class_id===classId && a.subject_id===subjectId &&
        a.phase==='second_sitting' && yearTermIds.has(a.term_id));
    if (!ssAssmnt) return null;
    const mark = (state.marks||[]).find(m=>
        m.student_id===studentId && m.assessment_id===ssAssmnt.id);
    return mark?.second_sitting_score ?? null;
}

function _ssRender(el) {
    if (!el||!_ssClassId) return;
    const promoMark = parseFloat(state.schoolSettings?.promotion_mark||'50');
    const coreSubjs = _ssGetCoreSubjects(_ssClassId);

    // Get all active students in class
    const allStudents = (state.students||[]).filter(s=>
        s.class_id===_ssClassId&&s.status==='Active'&&!s.is_deleted);

    // Compute annual % and filter to below promotion mark
    const eligible = allStudents.map(s=>{
        const pct = _ssComputeAnnualPct(s.id, _ssClassId);
        return { student:s, annualPct:pct };
    }).filter(r=>r.annualPct===null||r.annualPct<promoMark)
      .sort((a,b)=>(a.student.last_name||''). localeCompare(b.student.last_name||'')); 

    if (!eligible.length) {
        el.innerHTML=`<div class="empty-state" style="padding:40px;">
            <div class="es-icon"><i class="fa-solid fa-party-horn" style="font-size:48px;color:#4ade80;opacity:.6;"></i></div>
            <div class="es-title" style="color:var(--color-success);">All students passed!</div>
            <div class="es-sub">No students are below the ${promoMark}% promotion threshold.</div>
          </div>`; return;
    }

    if (!coreSubjs.length) {
        el.innerHTML=`<div class="empty-state" style="padding:40px;">
            <div class="es-title">No core subjects found</div>
            <div class="es-sub">Mark subjects as core in Settings → Subjects.</div>
          </div>`; return;
    }

    const total=eligible.length, start=(_ssPage-1)*_ssSize, paged=eligible.slice(start,start+_ssSize);

    const subjHeaders = coreSubjs.map(s=>
        `<th class="text-center" style="min-width:90px;font-size:12px;">${esc(s.name)}<br>
         <span style="font-weight:400;font-size:10px;">2nd Sit %</span></th>`).join('');

    const rows = paged.map(({student:s, annualPct})=>{
        const subjCells = coreSubjs.map(subj=>{
            const existing = _ssGetExistingSSScore(s.id, subj.id, _ssClassId);
            const color = existing===null?'':(existing>=promoMark?'color:var(--color-success);':' color:var(--color-danger);');
            return `<td class="text-center">
              <input type="number" class="input" min="0" max="100" step="0.5"
                     style="width:75px;text-align:center;${color}"
                     id="ss-${s.id}-${subj.id}"
                     value="${existing!==null?existing:''}" placeholder="—"
                     oninput="ssScoreChanged(${s.id},${subj.id},this.value,${promoMark})">
            </td>`;}).join('');

        const pctColor = annualPct===null?'color:var(--text-muted);':
            annualPct<promoMark?'color:var(--color-danger);font-weight:700;':'color:var(--color-success);';

        return `<tr>
          <td><div class="student-cell">
            <span class="student-name">${esc(s.last_name)}, ${esc(s.first_name)}</span>
            <span class="student-code">${esc(s.code||'')} </span></div></td>
          <td class="text-center" style="${pctColor}">
            ${annualPct!==null?annualPct.toFixed(1)+'%':'No marks'}</td>
          ${subjCells}
        </tr>`;
    }).join('');

    el.innerHTML=`
    <div style="margin-bottom:10px;display:flex;justify-content:space-between;align-items:center;">
      <div style="font-size:13px;font-weight:600;">
        ${eligible.length} student${eligible.length!==1?'s':''} eligible for second sitting
      </div>
      <button class="btn btn-primary" onclick="ssSaveAll()">
        <i class="fa-solid fa-floppy-disk"></i> Save All Second Sitting Marks</button>
    </div>
    <div style="overflow-x:auto;">
      <table class="data-table">
        <thead><tr>
          <th>Student</th>
          <th class="text-center">Annual %</th>
          ${subjHeaders}
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    <div class="table-footer">
      <span>${total} student${total!==1?'s':''}</span>
      <div style="display:flex;gap:6px;">
        ${_ssPage>1?`<button class="btn btn-sm btn-ghost" onclick="ssPage(${_ssPage-1})">Prev</button>`:''}
        ${start+_ssSize<total?`<button class="btn btn-sm btn-ghost" onclick="ssPage(${_ssPage+1})">Next</button>`:''}
      </div>
    </div>`;
}

window.ssScoreChanged = (studentId, subjectId, value, promoMark) => {
    const inp = document.getElementById(`ss-${studentId}-${subjectId}`);
    if (!inp) return;
    const score = parseFloat(value);
    if (!isNaN(score)) {
        inp.style.color = score>=promoMark?'var(--color-success)':'var(--color-danger)';
    } else {
        inp.style.color = '';
    }
};

window.ssPage = p => { _ssPage=p; _ssRender(document.getElementById('ss-body')); };

/* ── ENSURE SECOND SITTING ASSESSMENT EXISTS ── */
async function _ssEnsureAssessment(classId, subjectId) {
    const year    = getActiveYear();
    const terms   = (state.terms||[]).filter(t=>t.academic_year_id===year?.id)
        .sort((a,b)=>b.term_number-a.term_number);
    const term3   = terms.find(t=>t.term_number===3);
    if (!term3) return null;

    // Check if second_sitting assessment exists for this class+subject+term3
    let existing = (state.assessments||[]).find(a=>
        a.class_id===classId && a.subject_id===subjectId &&
        a.phase==='second_sitting' && a.term_id===term3.id);

    if (!existing) {
        const subj = (state.subjects||[]).find(s=>s.id===subjectId);
        const cls  = (state.classes||[]).find(c=>c.id===classId);
        const newA = await insert('assessments', {
            class_id  : classId,
            subject_id: subjectId,
            term_id   : term3.id,
            name      : `Second Sitting — ${subj?.name||''} (${cls?.name||''})`,
            phase     : 'second_sitting',
            max_marks : 100,
            is_locked : false,
            created_at: new Date().toISOString(),
        });
        if (newA?.id) {
            state.assessments = state.assessments||[];
            state.assessments.push(newA);
            existing = newA;
        }
    }
    return existing;
}

window.ssSaveAll = async () => {
    if (!_ssClassId) return;
    const promoMark = parseFloat(state.schoolSettings?.promotion_mark||'50');
    const coreSubjs = _ssGetCoreSubjects(_ssClassId);
    const eligible  = (state.students||[]).filter(s=>
        s.class_id===_ssClassId&&s.status==='Active'&&!s.is_deleted)
        .filter(s=>{const p=_ssComputeAnnualPct(s.id,_ssClassId);return p===null||p<promoMark;});

    const now = new Date().toISOString();
    let saved=0, errors=0;

    for (const subj of coreSubjs) {
        // Ensure assessment row exists
        const assmnt = await _ssEnsureAssessment(_ssClassId, subj.id);
        if (!assmnt) continue;

        for (const s of eligible) {
            const inp = document.getElementById(`ss-${s.id}-${subj.id}`);
            const rawVal = inp?.value?.trim();
            if (rawVal===''||rawVal===undefined) continue; // skip empty
            const score = parseFloat(rawVal);
            if (isNaN(score)||score<0||score>100) continue;

            // Find or create marks row
            const existing = (state.marks||[]).find(m=>
                m.student_id===s.id && m.assessment_id===assmnt.id);

            try {
                const payload = {
                    second_sitting_score    : score,
                    second_sitting_entered_by: state.currentUser?.id||null,
                    second_sitting_entered_at: now,
                    updated_at              : now,
                };
                if (existing) {
                    await update('marks', existing.id, payload);
                    Object.assign(existing, payload);
                } else {
                    const newMark = await insert('marks', {
                        student_id   : s.id,
                        assessment_id: assmnt.id,
                        score        : null,
                        is_absent    : false,
                        created_at   : now,
                        ...payload,
                    });
                    if (newMark) { state.marks=state.marks||[]; state.marks.push(newMark); }
                }

                // Log
                if (typeof insert==='function') {
                    insert('system_logs', {
                        action_type : 'second_sitting_mark',
                        description : `2nd sitting: ${score}% for ${s.first_name} ${s.last_name} — ${subj.name}`,
                        actor_id    : state.currentUser?.id||null,
                        actor_name  : state.currentUser?.name||'Unknown',
                        created_at  : now,
                        metadata    : JSON.stringify({studentId:s.id,subjectId:subj.id,score}),
                    }).catch(()=>{});
                }
                saved++;
            } catch(e) { errors++; }
        }
    }

    showToast(
        `${saved} second sitting score${saved!==1?'s':''} saved.${errors?` ${errors} error(s).`:''}`,
        errors?'warning':'success'
    );
    _ssRender(document.getElementById('ss-body'));
};

window.renderSecondSitting = renderSecondSitting;
