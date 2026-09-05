/* ═══════════════════════════════════════════════════════════════════
   js/modules/holidays/holidays-marks.js — Session-aware holiday marks
   Two tabs: Marks Entry | Marks Register
   Every mark tagged with holiday_session_id — never mixed.
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

let _hmTab = 'entry', _hmSessionId = null, _hmClassId = null,
    _hmSubjectId = null, _hmAssessId = null;

async function renderHolidaysMarks(container, params = {}) {
    // Class teacher access control
    if (params.classId && typeof canAccessClass === 'function' && !canAccessClass(params.classId)) {
        container.innerHTML = `<div class="module-wrap"><div class="alert alert-danger" style="margin:24px;">
            <i class="fa-solid fa-lock"></i>
            <strong>Access denied</strong> — you can only view data for your assigned class.</div></div>`;
        return;
    }

    if (!container) return;
    await ensureStateLoaded();
    const sessions = state.holidaySessions || [];
    _hmSessionId = params.sessionId || getActiveHolidaySessionId() || sessions[0]?.id || null;
    if (_hmSessionId && !(state.sessionClasses||[]).some(c=>c.holiday_session_id===_hmSessionId))
        await loadDataForHolidaySession(_hmSessionId);
    if (!sessions.length) {
        container.innerHTML = `<div class="module-wrap"><div class="mod-topbar"><div class="mod-topbar-left">
            <h1 class="mod-title"><i class="fa-solid fa-book-open"></i> Holiday Marks</h1></div></div>
            <div class="section-card"><div class="empty-state" style="padding:60px;">
            <div class="es-icon"><i class="fa-solid fa-umbrella-beach" style="font-size:48px;opacity:.3;"></i></div>
            <div class="es-title">No Holiday Sessions</div>
            <div class="es-sub">Create a holiday session in Settings → Holidays first.</div>
            </div></div></div>`; return;
    }
    _hmShell(container, sessions);
}

function _hmShell(container, sessions) {
    const cur = sessions.find(s=>s.id===_hmSessionId)||sessions[0];
    const classes = (state.sessionClasses||[]).filter(c=>c.holiday_session_id===_hmSessionId);
    container.innerHTML = `
    <div class="module-wrap">
      <div class="mod-topbar">
        <div class="mod-topbar-left">
          <h1 class="mod-title"><i class="fa-solid fa-book-open"></i> Holiday Marks</h1>
          <span class="badge" style="background:rgba(217,119,6,.15);color:#d97706;margin-left:8px;">
            <i class="fa-solid fa-umbrella-beach"></i> ${esc(cur?.name||'—')}</span>
        </div>
        <div class="mod-topbar-right">
          <select class="select select-sm" onchange="hmPickSession(parseInt(this.value))">
            ${sessions.map(s=>`<option value="${s.id}"${s.id===_hmSessionId?' selected':''}>
              ${esc(s.name)}${s.status==='active'?' ●':''}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="tabs" style="margin-bottom:0;">
        <button class="tab-btn${_hmTab==='entry'?' active':''}" onclick="hmTab('entry')">
          <i class="fa-solid fa-pen-to-square"></i> Marks Entry</button>
        <button class="tab-btn${_hmTab==='register'?' active':''}" onclick="hmTab('register')">
          <i class="fa-solid fa-table-cells"></i> Marks Register</button>
      </div>
      <div class="section-card" style="border-top-left-radius:0;margin-top:0;">
        <div id="hm-body"></div>
      </div>
    </div>`;
    if (classes.length) _hmDraw();
    else document.getElementById('hm-body').innerHTML =
        `<div class="empty-state" style="padding:40px;">
         <div class="es-title">No holiday classes for this session</div>
         <div class="es-sub">Add classes in Settings → Holidays.</div></div>`;
}

function _hmDraw() {
    const el = document.getElementById('hm-body');
    if (!el) return;
    if (_hmTab==='entry') _hmEntry(el);
    else _hmRegister(el);
}

window.hmTab = t => { _hmTab=t; _hmDraw(); };
window.hmPickSession = async id => {
    _hmSessionId=id; _hmClassId=_hmSubjectId=_hmAssessId=null;
    await loadDataForHolidaySession(id);
    const s=state.holidaySessions||[];
    const c=document.querySelector('.module-wrap');
    if(c) _hmShell(c.parentElement,s);
};

/* ── ENTRY ── */
function _hmEntry(el) {
    const classes   = (state.sessionClasses  ||[]).filter(c=>c.holiday_session_id===_hmSessionId);
    const subjects  = (state.sessionSubjects ||[]).filter(s=>s.session_class_id===_hmClassId);
    const assmnts   = (state.sessionAssessments||[]).filter(a=>
        a.session_class_id===_hmClassId && a.session_subject_id===_hmSubjectId);
    const enrollments=(state.holidayEnrollments||[]).filter(e=>
        e.holiday_session_id===_hmSessionId && e.session_class_id===_hmClassId);
    const students  = (state.students||[]).filter(s=>enrollments.some(e=>e.student_id===s.id))
        .sort((a,b)=>(a.last_name||'').localeCompare(b.last_name||''));
    const markMap   = {};
    (state.holidayMarks||[]).filter(m=>m.session_assessment_id===_hmAssessId&&m.holiday_session_id===_hmSessionId)
        .forEach(m=>{markMap[m.student_id]=m;});
    const assessment = assmnts.find(a=>a.id===_hmAssessId);

    el.innerHTML = `
    <div class="form-row" style="margin-bottom:14px;flex-wrap:wrap;gap:10px;">
      <div class="field" style="min-width:160px;">
        <label class="field-label">Class *</label>
        <select class="select" onchange="hmClass(parseInt(this.value))">
          <option value="">— Select —</option>
          ${classes.map(c=>`<option value="${c.id}"${c.id===_hmClassId?' selected':''}>${esc(c.name)}</option>`).join('')}
        </select>
      </div>
      <div class="field" style="min-width:160px;">
        <label class="field-label">Subject *</label>
        <select class="select" onchange="hmSubject(parseInt(this.value))"${!_hmClassId?' disabled':''}>
          <option value="">— Select —</option>
          ${subjects.map(s=>`<option value="${s.id}"${s.id===_hmSubjectId?' selected':''}>${esc(s.name)}</option>`).join('')}
        </select>
      </div>
      <div class="field" style="min-width:160px;">
        <label class="field-label">Assessment *</label>
        <select class="select" onchange="hmAssess(parseInt(this.value))"${!_hmSubjectId?' disabled':''}>
          <option value="">— Select —</option>
          ${assmnts.map(a=>`<option value="${a.id}"${a.id===_hmAssessId?' selected':''}>${esc(a.name)} (/${a.max_marks})</option>`).join('')}
        </select>
      </div>
      ${_hmClassId&&_hmSubjectId?`
      <div class="field" style="align-self:flex-end;">
        <button class="btn btn-secondary" onclick="hmNewAssess()">
          <i class="fa-solid fa-plus"></i> New Assessment</button>
      </div>`:''}
    </div>
    <div id="hm-marks-body">
      ${!_hmAssessId
        ? `<div class="empty-state" style="padding:32px;"><div class="es-title">Select class, subject and assessment</div></div>`
        : students.length===0
        ? `<div class="empty-state" style="padding:32px;"><div class="es-title">No enrolled students</div>
           <div class="es-sub">Enroll students first in Holiday Enrollment.</div></div>`
        : _hmMarksTable(students,markMap,assessment)}
    </div>`;
}

function _hmMarksTable(students, markMap, assessment) {
    const max = assessment?.max_marks||100;
    return `
    <div class="table-wrap">
      <table class="data-table">
        <thead><tr><th>Student</th><th style="width:70px;text-align:center;">Absent</th>
          <th style="width:130px;">Score /${max}</th><th style="width:70px;">Grade</th></tr></thead>
        <tbody>
        ${students.map(s=>{
            const m=markMap[s.id], absent=m?.is_absent||false, score=m?.score??'';
            return `<tr>
              <td><div class="student-cell">
                <span class="student-name">${esc(s.last_name)}, ${esc(s.first_name)}</span>
                <span class="student-code">${esc(s.code||'')}</span></div></td>
              <td style="text-align:center;">
                <input type="checkbox" ${absent?'checked':''} onchange="hmAbsent(${s.id},this.checked)"
                  style="width:16px;height:16px;cursor:pointer;"></td>
              <td><input type="number" class="input" min="0" max="${max}" step="0.5"
                  placeholder="—" value="${absent?'':esc(String(score))}"
                  ${absent?'disabled':''}
                  id="hm-s-${s.id}" onchange="hmGrade(${s.id},this.value,${max})"></td>
              <td id="hm-g-${s.id}" style="font-size:12px;color:var(--text-muted);">
                ${score!==''&&!absent?esc(getGrade((Number(score)/max)*100)):'—'}</td>
            </tr>`;}).join('')}
        </tbody>
      </table>
    </div>
    <div style="display:flex;gap:8px;margin-top:12px;align-items:center;">
      <button class="btn btn-primary" onclick="hmSaveAll()">
        <i class="fa-solid fa-floppy-disk"></i> Save All Marks</button>
      <span style="font-size:12px;color:var(--text-muted);">
        ${students.length} student${students.length!==1?'s':''} · max ${max}</span>
    </div>`;
}

window.hmClass   = id => { _hmClassId=id||null; _hmSubjectId=_hmAssessId=null; _hmDraw(); };
window.hmSubject = id => { _hmSubjectId=id||null; _hmAssessId=null; _hmDraw(); };
window.hmAssess  = id => { _hmAssessId=id||null; _hmDraw(); };
window.hmAbsent  = (sid,v) => {
    const inp=document.getElementById(`hm-s-${sid}`),g=document.getElementById(`hm-g-${sid}`);
    if(inp){inp.disabled=v;if(v)inp.value='';}
    if(g) g.textContent='—';
};
window.hmGrade   = (sid,val,max) => {
    const g=document.getElementById(`hm-g-${sid}`);
    if(g){const s=parseFloat(val);g.textContent=isNaN(s)?'—':esc(getGrade((s/max)*100));}
};

window.hmSaveAll = async () => {
    if(!_hmAssessId||!_hmClassId||!_hmSessionId) return;
    const enrollments=(state.holidayEnrollments||[]).filter(e=>
        e.holiday_session_id===_hmSessionId&&e.session_class_id===_hmClassId);
    const students=(state.students||[]).filter(s=>enrollments.some(e=>e.student_id===s.id));
    const now=new Date().toISOString(); let saved=0,errors=0;
    for(const s of students){
        const inp=document.getElementById(`hm-s-${s.id}`);
        const cb=inp?.closest('tr')?.querySelector('input[type="checkbox"]');
        const absent=cb?.checked||false;
        const score=absent?null:(parseFloat(inp?.value)??null);
        const existing=(state.holidayMarks||[]).find(m=>
            m.student_id===s.id&&m.session_assessment_id===_hmAssessId&&m.holiday_session_id===_hmSessionId);
        const payload={student_id:s.id,holiday_session_id:_hmSessionId,
            session_assessment_id:_hmAssessId,session_class_id:_hmClassId,
            session_subject_id:_hmSubjectId,score,is_absent:absent,
            entered_by:state.currentUser?.id||null,entered_at:now,updated_at:now};
        try{
            if(existing) await update('holiday_marks',existing.id,payload);
            else{ payload.created_at=now; await insert('holiday_marks',payload);}
            saved++;
        }catch(e){errors++;}
    }
    
        if (typeof loadAllData === 'function') loadAllData({ silent: true }).catch(() => {});
        showToast(`${saved} mark${saved!==1?'s':''} saved.${errors?` ${errors} error(s).`:''}`,
        errors?'warning':'success');
    await loadDataForHolidaySession(_hmSessionId);
    _hmDraw();
};

window.hmNewAssess = () => {
    showModal(`
    <div class="form-group"><label>Assessment Name *</label>
      <input type="text" id="hm-na-name" class="input" placeholder="Test 1, Final Exam…"></div>
    <div class="form-group"><label>Max Marks *</label>
      <input type="number" id="hm-na-max" class="input" value="100" min="1"></div>
    <div class="form-group"><label>Date</label>
      <input type="date" id="hm-na-date" class="input"></div>`,
    {title:'New Assessment',footer:`
      <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="hmSubmitAssess()">Create</button>`});
};

window.hmSubmitAssess = async () => {
    const name=cleanInput(document.getElementById('hm-na-name')?.value);
    const max=parseFloat(document.getElementById('hm-na-max')?.value)||100;
    const date=document.getElementById('hm-na-date')?.value||null;
    if(!name){showToast('Assessment name required.','warning');return;}
    try{
        await insert('session_assessments',{holiday_session_id:_hmSessionId,
            session_class_id:_hmClassId,session_subject_id:_hmSubjectId,
            name,max_marks:max,date,is_locked:false,
            created_by:state.currentUser?.id||null,created_at:new Date().toISOString()});
        
        if (typeof loadAllData === 'function') loadAllData({ silent: true }).catch(() => {});
        showToast(`"${name}" created.`,'success'); closeModal();
        await loadDataForHolidaySession(_hmSessionId); _hmDraw();
    }catch(e){handleApiError(e,'create assessment');}
};

/* ── REGISTER ── */
function _hmRegister(el) {
    const classes=(state.sessionClasses||[]).filter(c=>c.holiday_session_id===_hmSessionId);
    el.innerHTML = `
    <div class="form-row" style="margin-bottom:14px;">
      <div class="field" style="min-width:180px;">
        <label class="field-label">Class</label>
        <select class="select" onchange="hmRegClass(parseInt(this.value))">
          <option value="">— Select —</option>
          ${classes.map(c=>`<option value="${c.id}"${c.id===_hmClassId?' selected':''}>${esc(c.name)}</option>`).join('')}
        </select>
      </div>
      ${_hmClassId?`
      <div class="field" style="align-self:flex-end;">
        <button class="btn btn-secondary" onclick="hmExportReg(${_hmClassId},${_hmSessionId})">
          <i class="fa-solid fa-download"></i> Export CSV</button>
      </div>`:''}
    </div>
    <div id="hm-reg-grid">${_hmRegGrid()}</div>`;
}

window.hmRegClass = id => { _hmClassId=id||null; _hmDraw(); };

function _hmRegGrid() {
    if(!_hmClassId) return `<div class="empty-state" style="padding:32px;">
        <div class="es-title">Select a class</div></div>`;
    const enrolls  =(state.holidayEnrollments||[]).filter(e=>e.holiday_session_id===_hmSessionId&&e.session_class_id===_hmClassId);
    const students =(state.students||[]).filter(s=>enrolls.some(e=>e.student_id===s.id)).sort((a,b)=>(a.last_name||'').localeCompare(b.last_name||''));
    const subjects =(state.sessionSubjects||[]).filter(s=>s.session_class_id===_hmClassId);
    const assmnts  =(state.sessionAssessments||[]).filter(a=>a.session_class_id===_hmClassId&&a.holiday_session_id===_hmSessionId);
    const markMap  ={};
    (state.holidayMarks||[]).filter(m=>m.session_class_id===_hmClassId&&m.holiday_session_id===_hmSessionId)
        .forEach(m=>{markMap[`${m.student_id}-${m.session_assessment_id}`]=m;});

    if(!students.length) return `<div class="empty-state" style="padding:32px;"><div class="es-title">No enrolled students</div></div>`;
    if(!assmnts.length)  return `<div class="empty-state" style="padding:32px;"><div class="es-title">No assessments yet</div></div>`;

    const headers = assmnts.map(a=>{
        const subj=subjects.find(s=>s.id===a.session_subject_id);
        return `<th title="${esc(subj?.name||'')} · ${esc(a.name)}" style="min-width:60px;font-size:11px;">
            <div style="opacity:.7;">${esc((subj?.name||'').slice(0,5))}</div>
            <div>${esc(a.name.slice(0,8))}</div>
            <div style="opacity:.5;">/${a.max_marks}</div></th>`;}).join('');

    const rows = students.map((s,i)=>{
        const cells=assmnts.map(a=>{
            const m=markMap[`${s.id}-${a.id}`];
            const pct=(!m?.is_absent&&m?.score!=null)?(m.score/a.max_marks)*100:null;
            const col=pct===null?'':pct>=80?'color:var(--color-success);':pct<50?'color:var(--color-danger);':'';
            return `<td class="text-center" style="${col}font-size:12px;">
                ${m?.is_absent?'ABS':m?.score!=null?m.score:'—'}</td>`;}).join('');
        const valid=assmnts.map(a=>{const m=markMap[`${s.id}-${a.id}`];return(!m||m.is_absent||m.score==null)?null:{score:m.score,max:a.max_marks};}).filter(Boolean);
        const avgPct=valid.length?valid.reduce((sum,m)=>sum+(m.score/m.max)*100,0)/valid.length:null;
        return `<tr>
            <td style="font-size:11px;color:var(--text-muted);">${i+1}</td>
            <td><div class="student-name" style="font-size:13px;">${esc(s.last_name)}, ${esc(s.first_name)}</div>
                <div class="student-code">${esc(s.code||'')}</div></td>
            ${cells}
            <td class="text-center" style="font-weight:700;font-size:12px;color:${avgPct===null?'inherit':avgPct>=50?'var(--color-success)':'var(--color-danger)'};">
                ${avgPct!==null?fmtPct(avgPct,1):'—'}</td>
            <td class="text-center" style="font-size:12px;">${avgPct!==null?esc(getGrade(avgPct)):'—'}</td>
        </tr>`;}).join('');

    return `<div style="overflow-x:auto;">
        <table class="data-table" style="font-size:12px;">
          <thead><tr>
            <th style="width:28px;">#</th><th style="min-width:140px;">Student</th>
            ${headers}<th style="min-width:55px;">Avg%</th><th style="min-width:50px;">Grade</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table></div>
        <div class="table-footer"><span>${students.length} students · ${assmnts.length} assessments</span></div>`;
}

window.hmExportReg = (classId,sessionId) => {
    const cls    =(state.sessionClasses||[]).find(c=>c.id===classId);
    const sess   =(state.holidaySessions||[]).find(s=>s.id===sessionId);
    const assmnts=(state.sessionAssessments||[]).filter(a=>a.session_class_id===classId);
    const enrolls=(state.holidayEnrollments||[]).filter(e=>e.session_class_id===classId);
    const studs  =(state.students||[]).filter(s=>enrolls.some(e=>e.student_id===s.id));
    const markMap={};
    (state.holidayMarks||[]).filter(m=>m.session_class_id===classId)
        .forEach(m=>{markMap[`${m.student_id}-${m.session_assessment_id}`]=m;});
    const data=studs.map(s=>{
        const row={'Code':s.code||'','Last Name':s.last_name,'First Name':s.first_name};
        assmnts.forEach(a=>{const m=markMap[`${s.id}-${a.id}`];
            row[`${a.name}/${a.max_marks}`]=m?.is_absent?'ABS':(m?.score??'');});
        return row;});
    if(typeof exportAsCSV==='function') exportAsCSV(data,`Holiday_Register_${cls?.name||''}_${sess?.name||''}`);
    else showToast('Export not available.','warning');
};

window.renderHolidaysMarks = renderHolidaysMarks;
