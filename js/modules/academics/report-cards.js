/* ═══════════════════════════════════════════════════════════════════
   js/modules/academics/report-cards.js
   Annual report card matching the ECOLE LA FONTAINE PDF template.
   Columns: TS|EX|TOT|GR per term × 3 + Annual TOT|MAX|%|GR + 2nd Sitting %
   Annual % is FIXED (not recalculated after 2nd sitting).
   2nd sitting % = separate column, core subjects only.
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

let _rcClassId = null, _rcStudentId = null, _rcYearId = null;

async function renderReportCards(container, params = {}) {
    if (!container) return;
    await ensureStateLoaded();
    _rcYearId    = params.yearId || getActiveYear()?.id || null;

    // Class teacher restriction: teacher sees only their own class
    const myClass = typeof getMyClass === 'function' ? getMyClass() : null;
    const isAdmin = state.currentUser?.role === 'admin';
    const accessibleIds = typeof getAccessibleClassIds === 'function'
        ? getAccessibleClassIds() : (state.classes||[]).map(c=>c.id);

    _rcClassId = params.classId || myClass?.id || accessibleIds[0] || null;
    _rcStudentId = params.studentId || null;
    _rcShell(container);
}

function _rcShell(container) {
    const accessIds = typeof getAccessibleClassIds === 'function' ? getAccessibleClassIds() : (state.classes||[]).map(c=>c.id);
    const classes  = (state.classes||[]).filter(c=>c.is_active!==false&&accessIds.includes(c.id)).sort((a,b)=>(a.sort_order||0)-(b.sort_order||0));
    const students = _rcStudentsForClass(_rcClassId);
    if (!_rcStudentId && students.length) _rcStudentId = students[0].id;
    const years    = (state.academicYears||[]).sort((a,b)=>(b.year_name||'').localeCompare(a.year_name||''));

    container.innerHTML = `
    <div class="module-wrap">
      <div class="mod-topbar">
        <div class="mod-topbar-left">
          <h1 class="mod-title"><i class="fa-solid fa-file-lines"></i> Annual Report Cards</h1>
        </div>
        <div class="mod-topbar-right" style="gap:8px;display:flex;flex-wrap:wrap;">
          <select class="select select-sm" onchange="rcPickYear(parseInt(this.value))">
            ${years.map(y=>`<option value="${y.id}"${y.id===_rcYearId?' selected':''}>
              ${esc(y.year_name)}</option>`).join('')}
          </select>
          <select class="select select-sm" onchange="rcPickClass(parseInt(this.value))">
            <option value="">— Class —</option>
            ${classes.map(c=>`<option value="${c.id}"${c.id===_rcClassId?' selected':''}>
              ${esc(c.name)}</option>`).join('')}
          </select>
          <select class="select select-sm" id="rc-student-sel"
                  onchange="rcPickStudent(parseInt(this.value))">
            <option value="">— Student —</option>
            ${students.map(s=>`<option value="${s.id}"${s.id===_rcStudentId?' selected':''}>
              ${esc(s.last_name)}, ${esc(s.first_name)}</option>`).join('')}
          </select>
          <button class="btn btn-secondary btn-sm" onclick="rcPrintAll()">
            <i class="fa-solid fa-layer-group"></i> Print All Class</button>
          <button class="btn btn-primary btn-sm" onclick="rcPrint()">
            <i class="fa-solid fa-print"></i> Print</button>
        </div>
      </div>
      <div id="rc-preview" style="padding:8px;">
        ${_rcStudentId ? _rcBuildReport(_rcStudentId) : '<div class="empty-state" style="padding:60px;"><div class="es-title">Select a class and student</div></div>'}
      </div>
    </div>`;
}

function _rcStudentsForClass(classId) {
    if (!classId) return [];
    return (state.students||[]).filter(s=>s.class_id===classId&&s.status==='Active'&&!s.is_deleted)
        .sort((a,b)=>(a.last_name||''). localeCompare(b.last_name||'')); 
}

window.rcPickYear    = id  => { _rcYearId=id; _rcRefresh(); };
window.rcPickClass   = id  => { _rcClassId=id; _rcStudentId=null; _rcRefresh(); };
window.rcPickStudent = id  => { _rcStudentId=id; document.getElementById('rc-preview').innerHTML=_rcBuildReport(id); };

function _rcRefresh() {
    const c = document.getElementById('moduleContent')||document.querySelector('.module-wrap')?.parentElement;
    if (c) _rcShell(c);
}

/* ── CORE COMPUTATION ── */
function _rcGetTerms() {
    return (state.terms||[]).filter(t=>t.academic_year_id===_rcYearId)
        .sort((a,b)=>a.term_number-b.term_number);
}

function _rcGetSubjects(classId) {
    // Get all subjects that have assessments for this class in this year
    const termIds = new Set(_rcGetTerms().map(t=>t.id));
    const classAssmnts = (state.assessments||[]).filter(a=>
        a.class_id===classId && termIds.has(a.term_id) && a.phase!=='second_sitting');
    const subjIds = [...new Set(classAssmnts.map(a=>a.subject_id))];
    const subjects = subjIds.map(id=>(state.subjects||[]).find(s=>s.id===id)).filter(Boolean)
        .sort((a,b)=>(a.sort_order||99)-(b.sort_order||99));
    return subjects;
}

function _rcComputeTermMarks(studentId, classId, termId) {
    // Get all assessments for this class/term (not second sitting)
    const assmnts = (state.assessments||[]).filter(a=>
        a.class_id===classId && a.term_id===termId && a.phase!=='second_sitting');
    // Split into pre_midterm (TS) and post_midterm (EX)
    const tsAssmnts = assmnts.filter(a=>a.phase==='pre_midterm');
    const exAssmnts = assmnts.filter(a=>a.phase==='post_midterm');
    // Max marks
    const tsMax = tsAssmnts.reduce((s,a)=>s+Number(a.max_marks||0),0);
    const exMax = exAssmnts.reduce((s,a)=>s+Number(a.max_marks||0),0);
    const totMax = tsMax + exMax;
    return { tsMax, exMax, totMax, assmnts };
}

function _rcComputeSubjectRow(studentId, classId, subjectId, terms) {
    const termRows = terms.map(term => {
        const assmnts = (state.assessments||[]).filter(a=>
            a.class_id===classId && a.term_id===term.id &&
            a.subject_id===subjectId && a.phase!=='second_sitting');
        const tsAssmnts = assmnts.filter(a=>a.phase==='pre_midterm');
        const exAssmnts = assmnts.filter(a=>a.phase==='post_midterm');
        const tsMax = tsAssmnts.reduce((s,a)=>s+Number(a.max_marks||0),0);
        const exMax = exAssmnts.reduce((s,a)=>s+Number(a.max_marks||0),0);
        const totMax = tsMax+exMax;

        const marks = (state.marks||[]).filter(m=>
            m.student_id===studentId && assmnts.some(a=>a.id===m.assessment_id));

        const tsScore = tsAssmnts.reduce((s,a)=>{
            const m=(state.marks||[]).find(m=>m.student_id===studentId&&m.assessment_id===a.id);
            return s+(m&&!m.is_absent?Number(m.score||0):0);},0);
        const exScore = exAssmnts.reduce((s,a)=>{
            const m=(state.marks||[]).find(m=>m.student_id===studentId&&m.assessment_id===a.id);
            return s+(m&&!m.is_absent?Number(m.score||0):0);},0);
        const totScore = tsScore+exScore;
        const pct = totMax>0?(totScore/totMax)*100:null;
        const grade = pct!==null?(typeof getGrade==='function'?getGrade(pct):'—'):'—';
        return { tsScore, exScore, totScore, tsMax, exMax, totMax, pct, grade };
    });

    // Annual total
    const annTot  = termRows.reduce((s,r)=>s+r.totScore,0);
    const annMax  = termRows.reduce((s,r)=>s+r.totMax,0);
    const annPct  = annMax>0?(annTot/annMax)*100:null;
    const annGrade= annPct!==null?(typeof getGrade==='function'?getGrade(annPct):'—'):'—';

    // Second sitting score (percentage, direct entry, core only)
    const ssAssmnt = (state.assessments||[]).find(a=>
        a.class_id===classId && a.subject_id===subjectId &&
        a.phase==='second_sitting' &&
        (state.terms||[]).some(t=>t.academic_year_id===_rcYearId&&t.id===a.term_id));
    const ssMark = ssAssmnt
        ? (state.marks||[]).find(m=>m.student_id===studentId&&m.assessment_id===ssAssmnt.id)
        : null;
    const ssPct  = ssMark?.second_sitting_score ?? null;

    return { termRows, annTot, annMax, annPct, annGrade, ssPct };
}

function _rcComputeTermTotals(studentId, classId, termId, subjects) {
    // Sum across all subjects for one term
    let tsTotal=0, exTotal=0, totTotal=0, tsMax=0, exMax=0, totMax=0;
    subjects.forEach(subj=>{
        const assmnts=(state.assessments||[]).filter(a=>
            a.class_id===classId&&a.term_id===termId&&a.subject_id===subj.id&&a.phase!=='second_sitting');
        const tsA=assmnts.filter(a=>a.phase==='pre_midterm');
        const exA=assmnts.filter(a=>a.phase==='post_midterm');
        tsMax+=tsA.reduce((s,a)=>s+Number(a.max_marks||0),0);
        exMax+=exA.reduce((s,a)=>s+Number(a.max_marks||0),0);
        totMax+=tsMax+exMax;
        tsA.forEach(a=>{const m=(state.marks||[]).find(m=>m.student_id===studentId&&m.assessment_id===a.id);tsTotal+=(m&&!m.is_absent?Number(m.score||0):0);});
        exA.forEach(a=>{const m=(state.marks||[]).find(m=>m.student_id===studentId&&m.assessment_id===a.id);exTotal+=(m&&!m.is_absent?Number(m.score||0):0);});
        totTotal=tsTotal+exTotal;
    });
    const pct=totMax>0?(totTotal/totMax)*100:null;
    const grade=pct!==null?(typeof getGrade==='function'?getGrade(pct):'—'):'—';
    return {tsTotal,exTotal,totTotal,tsMax,exMax,totMax,pct,grade};
}

function _rcRankInClass(studentId, classId, subjects) {
    const students=_rcStudentsForClass(classId);
    const terms=_rcGetTerms();
    const avgs=students.map(s=>{
        const rows=subjects.map(subj=>_rcComputeSubjectRow(s.id,classId,subj.id,terms));
        const tot=rows.reduce((sum,r)=>sum+r.annTot,0);
        const max=rows.reduce((sum,r)=>sum+r.annMax,0);
        return {id:s.id, pct:max>0?(tot/max)*100:0};
    }).sort((a,b)=>b.pct-a.pct);
    const pos=avgs.findIndex(a=>a.id===studentId)+1;
    return {pos, total:students.length};
}

function _rcGetPromoDecision(studentId) {
    return (state.promotionDecisions||[]).find(d=>
        d.student_id===studentId && d.academic_year_id===_rcYearId) || null;
}

/* ── BUILD REPORT (matches PDF exactly) ── */
function _rcBuildReport(studentId) {
    const student = getStudent(studentId);
    if (!student) return '<div class="empty-state"><div class="es-title">Student not found</div></div>';

    const cls     = (state.classes||[]).find(c=>c.id===_rcClassId);
    const year    = (state.academicYears||[]).find(y=>y.id===_rcYearId);
    const terms   = _rcGetTerms();
    const subjects= _rcGetSubjects(_rcClassId);
    const s       = state.schoolSettings||{};
    const promoMark = parseFloat(s.promotion_mark||'50');

    if (!terms.length || !subjects.length) {
        return '<div class="empty-state" style="padding:40px;"><div class="es-title">No term or subject data for this year</div></div>';
    }

    // Core vs non-core
    const coreSubjects    = subjects.filter(s=>s.is_core!==false);
    const nonCoreSubjects = subjects.filter(s=>s.is_core===false);

    // Compute subject rows
    const allRows = {};
    subjects.forEach(subj=>{allRows[subj.id]=_rcComputeSubjectRow(studentId,_rcClassId,subj.id,terms);});

    // Annual totals across all subjects
    const annTotAll = subjects.reduce((s,subj)=>s+(allRows[subj.id].annTot||0),0);
    const annMaxAll = subjects.reduce((s,subj)=>s+(allRows[subj.id].annMax||0),0);
    const annPctAll = annMaxAll>0?(annTotAll/annMaxAll)*100:null;
    const annGradeAll = annPctAll!==null?(typeof getGrade==='function'?getGrade(annPctAll):'—'):'—';

    // Per-term totals
    const termTotals = terms.map(term=>_rcComputeTermTotals(studentId,_rcClassId,term.id,subjects));

    // Rank
    const rank = _rcRankInClass(studentId,_rcClassId,subjects);

    // Promotion decision
    const promoDecision = _rcGetPromoDecision(studentId);

    // Conduct (40 per term)
    const conductMax = 40*terms.length;

    const tdC = 'style="border:1px solid #cbd5e1;padding:3px 5px;text-align:center;font-size:11px;"';
    const tdL = 'style="border:1px solid #cbd5e1;padding:3px 5px;font-size:11px;"';
    const tdB = 'style="border:1px solid #cbd5e1;padding:3px 5px;text-align:center;font-size:11px;font-weight:700;"';

    // Column headers for 3 terms
    const termHeaders = terms.map(t=>`
        <th colspan="4" style="border:1px solid #cbd5e1;padding:3px;text-align:center;
            font-size:11px;background:#e2e8f0;">${esc(t.term_label||'Term '+t.term_number)}</th>`).join('');

    const termSubHeaders = terms.map(()=>'<th '+tdC+'>TS</th><th '+tdC+'>EX</th><th '+tdC+'>TOT</th><th '+tdC+'>GR</th>').join('');

    function subjectRow(subj, isCore) {
        const row = allRows[subj.id];
        const termCells = row.termRows.map(tr=>`
            <td ${tdC}>${tr.tsScore>0?tr.tsScore.toFixed(1):'—'}</td>
            <td ${tdC}>${tr.exScore>0?tr.exScore.toFixed(1):'—'}</td>
            <td ${tdC}>${tr.totScore>0?tr.totScore.toFixed(1):'—'}</td>
            <td ${tdC} style="border:1px solid #cbd5e1;padding:3px;text-align:center;
                font-size:11px;color:${tr.pct!==null&&tr.pct<promoMark?'#dc2626':'inherit'};">
                ${esc(tr.grade)}</td>`).join('');

        const ssCell = isCore && row.ssPct!==null
            ? `<td ${tdC} style="color:${row.ssPct>=promoMark?'#16a34a':'#dc2626'};font-weight:700;">
               ${row.ssPct.toFixed(1)}%</td>`
            : `<td ${tdC} style="color:var(--text-muted);">—</td>`;

        return `<tr>
            <td ${tdL}><strong>${esc(subj.name)}</strong></td>
            <td ${tdC}>${terms[0]?allRows[subj.id].termRows[0].tsMax||'—':'—'}</td>
            <td ${tdC}>${terms[0]?allRows[subj.id].termRows[0].exMax||'—':'—'}</td>
            <td ${tdC}>${terms[0]?(allRows[subj.id].termRows[0].tsMax+allRows[subj.id].termRows[0].exMax)||'—':'—'}</td>
            <td ${tdC}>${terms.length}</td>
            ${termCells}
            <td ${tdB}>${row.annTot>0?row.annTot.toFixed(1):'—'}</td>
            <td ${tdB}>${row.annMax||'—'}</td>
            <td ${tdB} style="color:${row.annPct!==null&&row.annPct<promoMark?'#dc2626':'inherit'};
                text-decoration:${row.annPct!==null&&row.annPct<promoMark?'underline':'none'};">
                ${row.annPct!==null?row.annPct.toFixed(1)+'%':'—'}</td>
            <td ${tdB} style="color:${row.annPct!==null&&row.annPct<promoMark?'#dc2626':'inherit'};">
                ${esc(row.annGrade)}</td>
            ${ssCell}
        </tr>`;
    }

    // Term totals row
    const termTotalCells = termTotals.map((tt,i)=>`
        <td ${tdB}>${tt.tsTotal.toFixed(1)}</td>
        <td ${tdB}>${tt.exTotal.toFixed(1)}</td>
        <td ${tdB}>${tt.totTotal.toFixed(1)}</td>
        <td ${tdB} style="color:${tt.pct!==null&&tt.pct<promoMark?'#dc2626':'inherit'}">${esc(tt.grade)}</td>`).join('');

    // First / Final decision checkboxes
    const FIRST_OPTIONS  = ['promoted','second_sitting','repeated','discontinued','promoted_elsewhere','repeated_elsewhere'];
    const FINAL_OPTIONS  = ['promoted','repeated','discontinued','promoted_after_2nd','repeated_after_2nd'];
    const FIRST_LABELS   = {promoted:'Promoted',second_sitting:'2nd sitting',repeated:'Repeated',discontinued:'Discontinued',promoted_elsewhere:'Promoted elsewhere',repeated_elsewhere:'Repeated elsewhere'};
    const FINAL_LABELS   = {promoted:'Promoted',repeated:'Repeated',discontinued:'Discontinued',promoted_after_2nd:'Promoted after 2nd sitting',repeated_after_2nd:'Repeated after 2nd sitting'};

    const firstDecision  = promoDecision?.first_decision  || (annPctAll!==null&&annPctAll>=promoMark?'promoted':annPctAll!==null?'second_sitting':null);
    const finalDecision  = promoDecision?.final_decision  || null;

    const firstBoxes = FIRST_OPTIONS.map(opt=>`
        <div style="display:flex;align-items:center;gap:4px;font-size:10px;">
          <input type="checkbox" ${firstDecision===opt?'checked':''} readonly> ${esc(FIRST_LABELS[opt])}
        </div>`).join('');
    const finalBoxes = FINAL_OPTIONS.map(opt=>`
        <div style="display:flex;align-items:center;gap:4px;font-size:10px;">
          <input type="checkbox" ${finalDecision===opt?'checked':''} readonly> ${esc(FINAL_LABELS[opt])}
        </div>`).join('');

    return `
    <div class="annual-report-card" style="background:#fff;color:#1e293b;font-family:'Segoe UI',Arial,sans-serif;
         max-width:960px;margin:0 auto;padding:16px 20px;border:1px solid #e2e8f0;border-radius:4px;">

      <!-- Header -->
      <div style="text-align:center;margin-bottom:10px;">
        <div style="font-size:11px;font-weight:600;">REPUBLIC OF RWANDA<br>MINISTRY OF EDUCATION</div>
        <div style="font-size:16px;font-weight:800;margin:6px 0;">${esc(s.school_name||'ECOLE LA FONTAINE')}</div>
        <div style="font-size:14px;font-weight:700;text-decoration:underline;">STUDENT ANNUAL REPORT</div>
      </div>

      <!-- Student info -->
      <div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:8px;">
        <div><strong>Student Names:</strong> ${esc(student.first_name)} ${esc(student.last_name)}</div>
        <div><strong>Academic Year:</strong> ${esc(year?.year_name||'—')}</div>
      </div>
      <div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:12px;">
        <div><strong>Registration Number:</strong> ${esc(student.code||'—')}</div>
        <div><strong>Class:</strong> ${esc(cls?.name||'—')}</div>
      </div>

      <!-- Main table -->
      <div style="overflow-x:auto;">
      <table style="width:100%;border-collapse:collapse;font-size:11px;">
        <thead>
          <tr style="background:#1e293b;color:#fff;">
            <th rowspan="2" style="border:1px solid #cbd5e1;padding:4px 6px;text-align:left;min-width:120px;">Subject</th>
            <th colspan="4" style="border:1px solid #cbd5e1;padding:3px;text-align:center;font-size:10px;">Maxima</th>
            ${termHeaders}
            <th colspan="4" style="border:1px solid #cbd5e1;padding:3px;text-align:center;">Annual Total</th>
            <th rowspan="2" style="border:1px solid #cbd5e1;padding:3px;text-align:center;min-width:50px;font-size:10px;">2nd Sitting %</th>
          </tr>
          <tr style="background:#334155;color:#fff;">
            <th ${tdC}>TS</th><th ${tdC}>EX</th><th ${tdC}>TOT</th><th ${tdC}>GR</th>
            ${termSubHeaders}
            <th ${tdC}>TOT</th><th ${tdC}>MAX</th><th ${tdC}>%</th><th ${tdC}>GR</th>
          </tr>
        </thead>
        <tbody>
          <!-- Conduct -->
          <tr style="background:#f8fafc;">
            <td ${tdL}>Conduct</td>
            <td ${tdC}></td><td ${tdC}></td><td ${tdC}>40</td><td ${tdC}></td>
            ${terms.map(()=>'<td '+tdC+'></td><td '+tdC+'></td><td '+tdC+'>40</td><td '+tdC+'></td>').join('')}
            <td ${tdC}>${conductMax}</td><td ${tdC}>${conductMax}</td>
            <td ${tdC}>100%</td><td ${tdC}></td><td ${tdC}></td>
          </tr>

          <!-- Core subjects header -->
          <tr style="background:#dbeafe;">
            <td colspan="${5+terms.length*4+5}" style="border:1px solid #cbd5e1;padding:3px 6px;
                font-size:10px;font-weight:700;color:#1e40af;">Core subjects</td>
          </tr>
          ${coreSubjects.map(s=>subjectRow(s,true)).join('')}

          <!-- Non-core header -->
          ${nonCoreSubjects.length?`<tr style="background:#f0fdf4;">
            <td colspan="${5+terms.length*4+5}" style="border:1px solid #cbd5e1;padding:3px 6px;
                font-size:10px;font-weight:700;color:#166534;">Non Core Subjects</td>
          </tr>
          ${nonCoreSubjects.map(s=>subjectRow(s,false)).join('')}`:''} 

          <!-- TOTALS row -->
          <tr style="background:#f1f5f9;font-weight:700;">
            <td ${tdL}><strong>Total</strong></td>
            <td ${tdC}></td><td ${tdC}></td>
            <td ${tdB}>${annMaxAll||'—'}</td>
            <td ${tdC}>${subjects.length}</td>
            ${termTotalCells}
            <td ${tdB}>${annTotAll.toFixed(1)}</td>
            <td ${tdB}>${annMaxAll||'—'}</td>
            <td ${tdB} style="color:${annPctAll!==null&&annPctAll<promoMark?'#dc2626':'#16a34a'};">
                ${annPctAll!==null?annPctAll.toFixed(2)+'%':'—'}</td>
            <td ${tdB}>${esc(annGradeAll)}</td>
            <td ${tdC}></td>
          </tr>

          <!-- Percentage row -->
          <tr>
            <td ${tdL}>Percentage</td>
            <td ${tdC}></td><td ${tdC}></td><td ${tdC}></td><td ${tdC}></td>
            ${termTotals.map(tt=>`<td ${tdC}></td><td ${tdC}></td>
                <td ${tdC} colspan="2">${tt.pct!==null?tt.pct.toFixed(2)+'%':'—'}</td>`).join('')}
            <td ${tdC} colspan="4">${annPctAll!==null?annPctAll.toFixed(2)+'%':'—'}</td>
            <td ${tdC}></td>
          </tr>

          <!-- Position row -->
          <tr>
            <td ${tdL}>Position</td>
            <td ${tdC}></td><td ${tdC}></td><td ${tdC}></td><td ${tdC}></td>
            ${terms.map(()=>'<td colspan="4" '+tdC+'></td>').join('')}
            <td ${tdC} colspan="4">${rank.pos} out of ${rank.total}</td>
            <td ${tdC}></td>
          </tr>

          <!-- Class Teacher Remarks -->
          <tr>
            <td ${tdL} colspan="2">Class Teacher's Remarks and Signature</td>
            <td colspan="${3+terms.length*4+5}" ${tdL}>${esc(promoDecision?.teacher_remarks||'')} </td>
          </tr>
          <tr>
            <td ${tdL} colspan="2">Parent's Signature</td>
            <td colspan="${3+terms.length*4+5}" ${tdL}> </td>
          </tr>
        </tbody>
      </table>
      </div>

      <!-- Grading scale -->
      <table style="width:100%;border-collapse:collapse;font-size:10px;margin-top:8px;">
        <tr>
          <td style="border:1px solid #cbd5e1;padding:2px 6px;">Grading Scale</td>
          <td style="border:1px solid #cbd5e1;padding:2px 6px;">80-100<br><strong>A</strong></td>
          <td style="border:1px solid #cbd5e1;padding:2px 6px;">75-79<br><strong>B</strong></td>
          <td style="border:1px solid #cbd5e1;padding:2px 6px;">70-74<br><strong>C</strong></td>
          <td style="border:1px solid #cbd5e1;padding:2px 6px;">65-69<br><strong>D</strong></td>
          <td style="border:1px solid #cbd5e1;padding:2px 6px;">60-64<br><strong>E</strong></td>
          <td style="border:1px solid #cbd5e1;padding:2px 6px;">50-59<br><strong>S</strong></td>
          <td style="border:1px solid #cbd5e1;padding:2px 6px;">0-49<br><strong>F</strong></td>
        </tr>
      </table>

      <!-- Decisions + signature -->
      <div style="display:flex;gap:20px;margin-top:12px;font-size:11px;">
        <div style="flex:1;border:1px solid #e2e8f0;border-radius:4px;padding:8px;">
          <div style="font-weight:700;margin-bottom:6px;">FIRST DECISION</div>
          ${firstBoxes}
        </div>
        <div style="flex:1;border:1px solid #e2e8f0;border-radius:4px;padding:8px;">
          <div style="font-weight:700;margin-bottom:6px;">FINAL DECISION</div>
          ${finalBoxes}
        </div>
        <div style="flex:1;text-align:center;border:1px solid #e2e8f0;border-radius:4px;padding:8px;">
          <div style="font-size:10px;color:#64748b;margin-bottom:4px;">Date: ${new Date().toLocaleDateString('en-GB',{day:'numeric',month:'long',year:'numeric'})}</div>
          <div style="font-weight:700;">${esc(s.head_teacher_name||'Headmaster')}</div>
          <div style="font-size:10px;color:#64748b;">${esc(s.head_teacher_title||'Head Teacher')}</div>
          <div style="margin-top:16px;font-size:10px;border-top:1px solid #e2e8f0;padding-top:6px;">
            Scan for verification</div>
        </div>
      </div>
    </div>`;
}

/* ── PRINT ── */
window.rcPrint = () => {
    const area = document.getElementById('rc-preview');
    if (!area) return;
    const card = area.querySelector('.annual-report-card');
    if (!card) return;
    const w = window.open('','_blank','width=1100,height=900');
    if (!w) return;
    w.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css"/>
    <style>@media print{body{margin:10mm;}}body{font-family:'Segoe UI',Arial,sans-serif;}
    table{border-collapse:collapse;width:100%;}th,td{border:1px solid #cbd5e1;padding:3px 5px;font-size:10px;}
    </style></head><body>${card.outerHTML}</body></html>`);
    w.document.close();
    setTimeout(()=>{w.print();},400);
};

window.rcPrintAll = () => {
    const students = _rcStudentsForClass(_rcClassId);
    if (!students.length){showToast('No students in class.','warning');return;}
    const allHTML = students.map(s=>_rcBuildReport(s.id)).join('<div style="page-break-after:always;"></div>');
    const w=window.open('','_blank','width=1100,height=900');
    if(!w) return;
    w.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8">
    <style>@media print{body{margin:10mm;}}body{font-family:'Segoe UI',Arial,sans-serif;}
    table{border-collapse:collapse;width:100%;}th,td{border:1px solid #cbd5e1;padding:3px 5px;font-size:10px;}
    </style></head><body>${allHTML}</body></html>`);
    w.document.close();
    setTimeout(()=>{w.print();},600);
};

window.renderReportCards  = renderReportCards;
window.destroyReportCards = () => {};
