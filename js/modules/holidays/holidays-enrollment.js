/* ═══════════════════════════════════════════════════════════════════
   js/modules/holidays/holidays-enrollment.js
   ═══════════════════════════════════════════════════════════════════
   Purpose : Enroll students into holiday session classes + assign fees.
             Fee assignment logic:
             - Select fee category → enter amount to apply per student
             - If entered amount < category amount → difference is
               auto-waived (discount). Fee goes to approval queue.
             - If fee already paid before approval → auto-approved.
             - Reject → fee row deleted from student_fees.
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

let _heSessionId = null, _heClassId = null, _heFilter = { search: '' }, _hePage = 1;
const _heSize = 50;

async function renderHolidaysEnrollment(container, params = {}) {
    if (!container) return;
    await ensureStateLoaded();
    const sessions = state.holidaySessions || [];
    _heSessionId = params.sessionId || getActiveHolidaySessionId() || sessions[0]?.id || null;
    if (_heSessionId && !(state.sessionClasses||[]).some(c=>c.holiday_session_id===_heSessionId))
        await loadDataForHolidaySession(_heSessionId);
    if (!sessions.length) {
        container.innerHTML = `<div class="module-wrap"><div class="section-card">
            <div class="empty-state" style="padding:60px;">
            <div class="es-title">No Holiday Sessions</div>
            <div class="es-sub">Create a holiday session first.</div></div></div></div>`; return;
    }
    _heShell(container, sessions);
}

function _heShell(container, sessions) {
    const cur     = sessions.find(s=>s.id===_heSessionId)||sessions[0];
    const classes = (state.sessionClasses||[]).filter(c=>c.holiday_session_id===_heSessionId);
    const enrolled = (state.holidayEnrollments||[]).filter(e=>e.holiday_session_id===_heSessionId);

    container.innerHTML = `
    <div class="module-wrap">
      <div class="mod-topbar">
        <div class="mod-topbar-left">
          <h1 class="mod-title"><i class="fa-solid fa-user-plus"></i> Holiday Enrollment</h1>
          <span class="badge" style="background:rgba(217,119,6,.15);color:#d97706;margin-left:8px;">
            <i class="fa-solid fa-umbrella-beach"></i> ${esc(cur?.name||'—')}</span>
        </div>
        <div class="mod-topbar-right">
          <select class="select select-sm" onchange="hePick(parseInt(this.value))">
            ${sessions.map(s=>`<option value="${s.id}"${s.id===_heSessionId?' selected':''}>
              ${esc(s.name)}${s.status==='active'?' ●':''}</option>`).join('')}
          </select>
          <button class="btn btn-primary" onclick="heEnrollModal()">
            <i class="fa-solid fa-user-plus"></i> Enroll Student</button>
        </div>
      </div>

      <!-- KPI row -->
      <div class="stats-grid stats-grid-3" style="margin-bottom:14px;">
        <div class="stat-card">
          <div class="stat-value">${enrolled.length}</div>
          <div class="stat-label">Total Enrolled</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${classes.length}</div>
          <div class="stat-label">Holiday Classes</div>
        </div>
        <div class="stat-card">
          <div class="stat-value c-warning">${state.pendingFeeApprovals?.length||0}</div>
          <div class="stat-label">Fees Pending Approval</div>
          ${state.pendingFeeApprovals?.length ? `<div class="stat-sub">
            <a href="#" onclick="navigateTo('fee-approvals')">Review now</a></div>`:''}
        </div>
      </div>

      <!-- Filters -->
      <div class="filters-bar">
        <div class="filter-group">
          <label>Holiday Class</label>
          <select class="select" onchange="heFilterClass(this.value)">
            <option value="">All Classes</option>
            ${classes.map(c=>`<option value="${c.id}">${esc(c.name)}</option>`).join('')}
          </select>
        </div>
        <div class="search-group">
          <i class="fa-solid fa-magnifying-glass"></i>
          <input type="text" class="input" placeholder="Search student…"
                 oninput="heSearch(this.value)">
        </div>
      </div>

      <!-- Enrolled students table -->
      <div class="section-card">
        <div class="section-header">
          <h3>Enrolled Students</h3>
          <button class="btn btn-sm btn-secondary" onclick="heManageClasses()">
            <i class="fa-solid fa-gear"></i> Manage Classes</button>
        </div>
        <div id="he-table"></div>
      </div>
    </div>`;

    _heRenderTable();
}

function _heRenderTable() {
    let rows = (state.holidayEnrollments||[]).filter(e=>e.holiday_session_id===_heSessionId);
    if (_heClassId) rows = rows.filter(e=>e.session_class_id===parseInt(_heClassId));
    if (_heFilter.search) {
        const q=_heFilter.search.toLowerCase();
        rows=rows.filter(e=>{const s=getStudent(e.student_id);
            return s&&`${s.first_name} ${s.last_name} ${s.code}`.toLowerCase().includes(q);});
    }
    const total=rows.length, start=(_hePage-1)*_heSize, paged=rows.slice(start,start+_heSize);
    const el=document.getElementById('he-table'); if(!el) return;

    if(!paged.length){el.innerHTML=`<div class="empty-state" style="padding:40px;">
        <div class="es-icon"><i class="fa-solid fa-user-plus" style="font-size:40px;opacity:.3;"></i></div>
        <div class="es-title">No enrolled students</div>
        <div class="es-sub">Click "Enroll Student" to add students to this holiday session.</div>
        </div>`; return;}

    const tableRows=paged.map(e=>{
        const s=getStudent(e.student_id);
        const cls=(state.sessionClasses||[]).find(c=>c.id===e.session_class_id);
        const fees=(state.holidayFees||[]).filter(f=>f.student_id===e.student_id&&f.holiday_session_id===_heSessionId);
        const pending=(state.holidayFees||[]).filter(f=>f.student_id===e.student_id&&f.holiday_session_id===_heSessionId&&f.requires_approval&&f.is_approved===false).length;
        return `<tr>
          <td><div class="student-cell">
            <span class="student-name">${s?`${esc(s.last_name)}, ${esc(s.first_name)}`:`#${e.student_id}`}</span>
            <span class="student-code">${s?esc(s.code||''):'—'}</span></div></td>
          <td>${esc(cls?.name||'—')}</td>
          <td>${e.enrolled_at?fmtDate(e.enrolled_at):'—'}</td>
          <td>${pending?`<span class="badge badge-warning">${pending} pending</span>`:`<span class="badge badge-success">OK</span>`}</td>
          <td>
            <button class="btn btn-sm btn-secondary" onclick="heViewFees(${e.student_id})">
              <i class="fa-solid fa-coins"></i> Fees</button>
            <button class="btn btn-sm btn-danger" onclick="heUnenroll(${e.id},${e.student_id})">
              <i class="fa-solid fa-xmark"></i></button>
          </td></tr>`;}).join('');

    el.innerHTML=`<div class="table-wrap"><table class="data-table">
        <thead><tr><th>Student</th><th>Holiday Class</th><th>Enrolled</th>
          <th>Fees</th><th>Actions</th></tr></thead>
        <tbody>${tableRows}</tbody></table></div>
        <div class="table-footer"><span>${total} student${total!==1?'s':''}</span>
        <div style="display:flex;gap:6px;">
          ${_hePage>1?`<button class="btn btn-sm btn-ghost" onclick="hePage(${_hePage-1})">Prev</button>`:''}
          ${start+_heSize<total?`<button class="btn btn-sm btn-ghost" onclick="hePage(${_hePage+1})">Next</button>`:''}
        </div></div>`;
}

window.hePick = async id => {
    _heSessionId=id; _heClassId=null; _heFilter={search:''};
    await loadDataForHolidaySession(id);
    const c=document.querySelector('.module-wrap');
    if(c) _heShell(c.parentElement, state.holidaySessions||[]);
};
window.heFilterClass = v => { _heClassId=v; _hePage=1; _heRenderTable(); };
window.heSearch = v => { _heFilter.search=v; _hePage=1; _heRenderTable(); };
window.hePage   = p => { _hePage=p; _heRenderTable(); };

/* ── ENROLL MODAL ── */
window.heEnrollModal = () => {
    const classes=(state.sessionClasses||[]).filter(c=>c.holiday_session_id===_heSessionId);
    const feeCats=(state.feeCategories||[]).filter(c=>c.is_active!==false);

    showModal(`
    <div class="form-group">
      <label>Student *</label>
      <input type="text" id="he-student-search" class="input" placeholder="Search by name or code…"
             oninput="heStudentSearch(this.value)">
      <div id="he-student-results" style="max-height:160px;overflow-y:auto;border:1px solid var(--border);border-radius:6px;margin-top:4px;display:none;"></div>
      <input type="hidden" id="he-student-id">
      <div id="he-student-chosen" style="margin-top:6px;font-size:13px;color:var(--color-success);"></div>
    </div>
    <div class="form-group">
      <label>Holiday Class *</label>
      <select id="he-class-sel" class="select">
        <option value="">— Select class —</option>
        ${classes.map(c=>`<option value="${c.id}">${esc(c.name)}</option>`).join('')}
      </select>
    </div>
    <hr style="margin:16px 0;border-color:var(--border);">
    <div style="font-weight:600;margin-bottom:10px;font-size:14px;">
      <i class="fa-solid fa-coins"></i> Fee Assignment
      <span style="font-size:12px;font-weight:400;color:var(--text-muted);margin-left:6px;">
        Enter amount below full price = auto-discount (waiver)</span>
    </div>
    <div id="he-fees-list">
      ${feeCats.map(fc=>`
      <div class="payment-category-item" data-fc="${fc.id}" style="margin-bottom:8px;">
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;">
          <input type="checkbox" data-he-check="${fc.id}" style="width:15px;height:15px;">
          <div style="flex:1;">
            <div style="font-size:13px;font-weight:600;">${esc(fc.name)}</div>
            <div style="font-size:11px;color:var(--text-muted);">Full: ${fmtCurrency(fc.default_amount||0)}</div>
          </div>
          <div style="display:flex;align-items:center;gap:4px;">
            <span style="font-size:12px;color:var(--text-muted);">RWF</span>
            <input type="number" data-he-amt="${fc.id}" class="input"
                   style="width:110px;" placeholder="${fc.default_amount||0}"
                   min="0" max="${fc.default_amount||999999}" disabled>
          </div>
        </label>
        <div data-he-discount="${fc.id}" style="font-size:11px;color:var(--color-success);padding-left:24px;display:none;">
          <i class="fa-solid fa-check"></i> Discount: <span></span>
        </div>
      </div>`).join('')}
    </div>`,
    {title:'Enroll Student in Holiday Session', size:'lg', footer:`
      <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="heSubmitEnroll()">Enroll & Assign Fees</button>`});

    // Wire checkboxes and amount inputs
    document.querySelectorAll('[data-he-check]').forEach(cb=>{
        const fid=cb.dataset.heCheck;
        const amtEl=document.querySelector(`[data-he-amt="${fid}"]`);
        cb.addEventListener('change',()=>{ amtEl.disabled=!cb.checked; if(!cb.checked)amtEl.value=''; _heCalcDiscount(fid); });
        amtEl?.addEventListener('input',()=>_heCalcDiscount(fid));
    });
};

function _heCalcDiscount(fid) {
    const cb=document.querySelector(`[data-he-check="${fid}"]`);
    const amt=parseFloat(document.querySelector(`[data-he-amt="${fid}"]`)?.value)||0;
    const fc=(state.feeCategories||[]).find(f=>String(f.id)===String(fid));
    const discEl=document.querySelector(`[data-he-discount="${fid}"]`);
    if(!discEl||!fc) return;
    const full=Number(fc.default_amount||0);
    const discount=amt>0&&amt<full?full-amt:0;
    discEl.style.display=discount>0&&cb?.checked?'block':'none';
    const span=discEl.querySelector('span');
    if(span) span.textContent=fmtCurrency(discount)+' waived (discount)';
}

window.heStudentSearch = q => {
    const res=document.getElementById('he-student-results');
    if(!res||!q||q.length<2){if(res)res.style.display='none';return;}
    const lower=q.toLowerCase();
    const enrolled=new Set((state.holidayEnrollments||[])
        .filter(e=>e.holiday_session_id===_heSessionId).map(e=>e.student_id));
    const matches=(state.students||[]).filter(s=>
        !enrolled.has(s.id)&&s.status!=='Archived'&&
        `${s.first_name} ${s.last_name} ${s.code||''}`.toLowerCase().includes(lower)
    ).slice(0,8);
    if(!matches.length){res.innerHTML='<div style="padding:8px 12px;font-size:13px;color:var(--text-muted);">No results</div>';res.style.display='block';return;}
    res.innerHTML=matches.map(s=>`
    <div style="padding:8px 12px;cursor:pointer;font-size:13px;border-bottom:1px solid var(--border);"
         onclick="heChooseStudent(${s.id},'${esc(s.first_name+' '+s.last_name)}','${esc(s.code||'')}')">
      <strong>${esc(s.first_name)} ${esc(s.last_name)}</strong>
      <span style="color:var(--text-muted);margin-left:8px;">${esc(s.code||'')}</span>
    </div>`).join('');
    res.style.display='block';
};

window.heChooseStudent = (id,name,code) => {
    document.getElementById('he-student-id').value=id;
    document.getElementById('he-student-search').value=name+' ('+code+')';
    document.getElementById('he-student-results').style.display='none';
    document.getElementById('he-student-chosen').textContent=`${name} selected`;
};

window.heSubmitEnroll = async () => {
    const studentId=parseInt(document.getElementById('he-student-id')?.value);
    const classId  =parseInt(document.getElementById('he-class-sel')?.value);
    if(!studentId||isNaN(studentId)){showToast('Select a student.','warning');return;}
    if(!classId||isNaN(classId)){showToast('Select a holiday class.','warning');return;}
    if(!_heSessionId){showToast('No session selected.','warning');return;}

    const now=new Date().toISOString();
    try{
        // 1. Create enrollment row
        const enrollment=await insert('holiday_enrollments',{
            student_id:studentId, holiday_session_id:_heSessionId,
            session_class_id:classId,
            enrolled_at:now, enrolled_by:state.currentUser?.id||null,
            created_at:now,
        });
        if(!enrollment) throw new Error('Failed to enroll student');

        // 2. Create fee assignments for checked fees
        const feeCats=(state.feeCategories||[]).filter(c=>c.is_active!==false);
        let feesCreated=0, feesApprovalNeeded=0;
        for(const fc of feeCats){
            const cb=document.querySelector(`[data-he-check="${fc.id}"]`);
            if(!cb?.checked) continue;
            const enteredAmt=parseFloat(document.querySelector(`[data-he-amt="${fc.id}"]`)?.value)||Number(fc.default_amount||0);
            const fullAmt=Number(fc.default_amount||0);
            const discount=enteredAmt<fullAmt?Math.max(0,fullAmt-enteredAmt):0;
            const effectiveAmt=fullAmt-discount;
            const isPaid=false; // enrollment only assigns, doesn't record payment

            const needsApproval=true; // ALL holiday enrollment fees need approval
            // Holiday enrollment fees go to holiday_fees (separate from student_fees)
            const feeRow=await insert('holiday_fees',{
                student_id         : studentId,
                holiday_session_id : _heSessionId,
                session_class_id   : classId,
                academic_year_id   : (state.holidaySessions||[]).find(s=>s.id===_heSessionId)?.academic_year_id || null,
                fee_name           : fc.name,
                amount             : fullAmt,
                waived_amount      : discount,
                paid_amount        : 0,
                is_paid            : false,
                requires_approval  : true,
                is_approved        : false,
                source             : 'holiday_enrollment',
                created_at         : now,
                updated_at         : now,
            });
            if(feeRow){feesCreated++;feesApprovalNeeded++;}
        }

        // 3. Reload state
        await loadDataForHolidaySession(_heSessionId);
        closeModal();
        showToast(`Student enrolled.${feesCreated?' '+feesCreated+' fee(s) assigned — '+feesApprovalNeeded+' pending approval.':''}`, 'success');
        _heShell(document.getElementById('moduleContent')||document.querySelector('.module-wrap')?.parentElement, state.holidaySessions||[]);
    }catch(e){handleApiError(e,'holiday enrollment');}
};

/* ── UNENROLL ── */
window.heUnenroll = async (enrollmentId, studentId) => {
    const confirmed=await confirmDialog(
        'Remove this student from the holiday session?',
        'Unenroll Student',
        {confirmText:'Unenroll',confirmClass:'btn-danger'});
    if(!confirmed) return;
    try{
        await remove('holiday_enrollments',enrollmentId);
        state.holidayEnrollments=(state.holidayEnrollments||[]).filter(e=>e.id!==enrollmentId);
        _heRenderTable();
        showToast('Student unenrolled.','success');
    }catch(e){handleApiError(e,'unenroll student');}
};

/* ── VIEW FEES ── */
window.heViewFees = studentId => {
    const student=getStudent(studentId);
    const fees=(state.holidayFees||[]).filter(f=>
        f.student_id===studentId&&f.holiday_session_id===_heSessionId);
    if(!fees.length){showToast('No holiday fees for this student.','info');return;}
    const rows=fees.map(f=>{
        const amt=Number(f.amount||0), waived=Number(f.waived_amount||0);
        const status=f.is_approved===true?'<span class="badge badge-success">Approved</span>'
            :f.is_approved===false&&f.requires_approval?'<span class="badge badge-warning">Pending</span>'
            :'<span class="badge badge-neutral">—</span>';
        return `<tr>
          <td>${esc(f.fee_name||'—')}</td>
          <td class="text-right">${fmtCurrency(amt)}</td>
          <td class="text-right" style="color:var(--color-success);">${waived?`— ${fmtCurrency(waived)}`:'—'}</td>
          <td class="text-right">${fmtCurrency(amt-waived)}</td>
          <td>${status}</td></tr>`;}).join('');
    showModal(`
    <div class="table-wrap"><table class="data-table">
      <thead><tr><th>Fee</th><th>Full Amt</th><th>Discount</th><th>Net</th><th>Status</th></tr></thead>
      <tbody>${rows}</tbody></table></div>
    <div style="margin-top:10px;font-size:12px;color:var(--text-muted);">
      Fees pending approval will be reviewed in Finance → Fee Approvals.</div>`,
    {title:`Holiday Fees — ${student?`${student.first_name} ${student.last_name}`:'Student'}`,
     footer:`<button class="btn btn-ghost" onclick="closeModal()">Close</button>
             <button class="btn btn-primary" onclick="navigateTo('fee-approvals');closeModal()">Review Approvals</button>`});
};

/* ── MANAGE CLASSES ── */
window.heManageClasses = () => {
    const classes=(state.sessionClasses||[]).filter(c=>c.holiday_session_id===_heSessionId);
    const subjects=(state.sessionSubjects||[]); 
    showModal(`
    <div style="margin-bottom:14px;">
      <div style="font-weight:600;margin-bottom:8px;">Existing Classes</div>
      ${classes.length?classes.map(c=>{
        const subjs=subjects.filter(s=>s.session_class_id===c.id);
        const enrollCount=(state.holidayEnrollments||[]).filter(e=>e.session_class_id===c.id).length;
        return `<div style="padding:10px 12px;border:1px solid var(--border);border-radius:8px;margin-bottom:6px;display:flex;justify-content:space-between;align-items:center;">
          <div><strong>${esc(c.name)}</strong>
            <span style="margin-left:8px;font-size:12px;color:var(--text-muted);">${enrollCount} students · ${subjs.length} subjects</span>
          </div>
          <div style="display:flex;gap:6px;">
            <button class="btn btn-sm btn-secondary" onclick="heAddSubjectToClass(${c.id},'${esc(c.name)}')">+ Subject</button>
            <button class="btn btn-sm btn-danger" onclick="heDeleteClass(${c.id})"><i class="fa-solid fa-xmark"></i></button>
          </div>
        </div>`; }).join(''):`<div style="color:var(--text-muted);font-size:13px;">No classes yet.</div>`}
    </div>
    <hr style="border-color:var(--border);margin:14px 0;">
    <div style="font-weight:600;margin-bottom:8px;">Add New Class</div>
    <div class="form-group">
      <input type="text" id="he-new-class-name" class="input" placeholder="e.g. Holiday Primary 3">
    </div>`,
    {title:'Manage Holiday Classes',footer:`
      <button class="btn btn-ghost" onclick="closeModal()">Close</button>
      <button class="btn btn-primary" onclick="heAddClass()">Add Class</button>`});
};

window.heAddClass = async () => {
    const name=cleanInput(document.getElementById('he-new-class-name')?.value);
    if(!name){showToast('Class name required.','warning');return;}
    try{
        await insert('session_classes',{holiday_session_id:_heSessionId,name,is_active:true,created_at:new Date().toISOString()});
        showToast(`Class "${name}" created.`,'success');
        await loadDataForHolidaySession(_heSessionId);
        closeModal(); heManageClasses();
    }catch(e){handleApiError(e,'add class');}
};

window.heDeleteClass = async id => {
    const confirmed=await confirmDialog('Delete this class and all its data?','Delete Class',{confirmText:'Delete',confirmClass:'btn-danger'});
    if(!confirmed) return;
    await remove('session_classes',id).catch(()=>{});
    await loadDataForHolidaySession(_heSessionId);
    closeModal(); heManageClasses();
};

window.heAddSubjectToClass = (classId, className) => {
    showModal(`
    <div class="form-group"><label>Subject Name *</label>
      <input type="text" id="he-subj-name" class="input" placeholder="Mathematics, English…"></div>
    <div class="form-group"><label>Max Marks</label>
      <input type="number" id="he-subj-max" class="input" value="100" min="1"></div>`,
    {title:`Add Subject to ${className}`,footer:`
      <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="heSubmitSubject(${classId},'${esc(className)}')">Add Subject</button>`});
};

window.heSubmitSubject = async (classId, className) => {
    const name=cleanInput(document.getElementById('he-subj-name')?.value);
    const max=parseFloat(document.getElementById('he-subj-max')?.value)||100;
    if(!name){showToast('Subject name required.','warning');return;}
    try{
        await insert('session_subjects',{session_class_id:classId,holiday_session_id:_heSessionId,name,max_marks:max,is_active:true});
        showToast(`"${name}" added.`,'success');
        await loadDataForHolidaySession(_heSessionId);
        closeModal(); heAddSubjectToClass(classId,className);
    }catch(e){handleApiError(e,'add subject');}
};

window.renderHolidaysEnrollment = renderHolidaysEnrollment;
