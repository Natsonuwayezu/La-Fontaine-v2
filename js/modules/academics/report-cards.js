/* ═══════════════════════════════════════════════════════════════════
   js/modules/academics/report-cards.js  v9.2
   5 report card types for Ecole La Fontaine:
     1. welcoming   — Welcoming Tests (Primary, first 2 weeks, core /100 each)
     2. midterm     — Midterm (Primary: TS+EX /100; Nursery: EX only /50)
     3. end_of_term — End of Term (TS+EX per subject maxima, 1 term layout)
     4. annual      — Annual Progressive Report (PDF format, 3 terms)
     5. holiday     — Holiday Session Report (TS only /100, core subjects)

   Columns: TS | EX | TOT | GR  (MD renamed to TS = Travaux Scolaires)
   GR grades: A+=6, A=5, B=4, C=3, D=2, S=1, F=0
   Maxima stored on subjects: ts_max, ex_max (fallback: 50/50 for primary, 25/25 nursery)
   Level determined by classes.level ('primary'|'nursery')
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

// ── Module state ─────────────────────────────────────────────────
let _rcClassId   = null;
let _rcStudentId = null;
let _rcYearId    = null;
let _rcTermId    = null;
let _rcType      = 'annual';

const RC_TYPES = {
    welcoming   : 'Welcoming Tests',
    midterm     : 'Midterm Report',
    end_of_term : 'End of Term',
    annual      : 'Annual Report',
    holiday     : 'Holiday Report',
};

// Grade conversion: percentage → letter and number
function _rcGrade(pct) {
    if (pct === null || pct === undefined) return { letter:'—', num:'—' };
    if (pct >= 90) return { letter:'A+', num: 6 };
    if (pct >= 80) return { letter:'A',  num: 5 };
    if (pct >= 75) return { letter:'B',  num: 4 };
    if (pct >= 70) return { letter:'C',  num: 3 };
    if (pct >= 60) return { letter:'D',  num: 2 };
    if (pct >= 50) return { letter:'S',  num: 1 };
    return { letter:'F', num: 0 };
}

// ── Entry point ───────────────────────────────────────────────────
async function renderReportCards(container, params = {
    if (container) {
        container.innerHTML = `<div class="module-wrap">
          <div class="mod-topbar">
            <div class="skeleton skeleton-line w-30" style="height:26px;border-radius:8px;width:180px;"></div>
            <div style="margin-left:auto;display:flex;gap:8px;">
              <div class="skeleton" style="height:32px;width:80px;border-radius:8px;"></div>
            </div>
          </div>
          <div class="skeleton-card"><div class="skeleton skeleton-line w-70"></div><div class="skeleton skeleton-line w-50"></div><div class="skeleton skeleton-line w-80"></div></div>
          <div class="skeleton-card"><div class="skeleton skeleton-line w-60"></div><div class="skeleton skeleton-line w-80"></div><div class="skeleton skeleton-line w-40"></div></div>
          <div class="skeleton-card"><div class="skeleton skeleton-line w-80"></div><div class="skeleton skeleton-line w-50"></div></div>
        </div>`;
    }
}) {
    if (!container) return;
    await ensureStateLoaded();
    _rcYearId    = params.yearId    || getActiveYear()?.id  || null;
    _rcTermId    = params.termId    || getActiveTerm()?.id  || null;
    _rcType      = params.type      || 'annual';
    const accessIds = typeof getAccessibleClassIds === 'function'
        ? getAccessibleClassIds() : (state.classes||[]).map(c=>c.id);
    const myClass = typeof getMyClass === 'function' ? getMyClass() : null;
    _rcClassId   = params.classId   || myClass?.id || accessIds[0] || null;
    _rcStudentId = params.studentId || null;
    _rcShell(container);
}

// ── Shell ─────────────────────────────────────────────────────────
function _rcShell(container) {
    const accessIds = typeof getAccessibleClassIds === 'function'
        ? getAccessibleClassIds() : (state.classes||[]).map(c=>c.id);
    const classes  = (state.classes||[])
        .filter(c=>c.is_active!==false && accessIds.includes(c.id))
        .sort((a,b)=>(a.sort_order||0)-(b.sort_order||0));
    const students = _rcRoster();
    if (!_rcStudentId && students.length) _rcStudentId = students[0].id;
    const years = (state.academicYears||[])
        .sort((a,b)=>(b.year_name||'').localeCompare(a.year_name||''));
    const terms = _rcTermsForYear();
    const needTerm = _rcType !== 'annual';

    container.innerHTML = `
    <div class="module-wrap">
      <div class="mod-topbar">
        <div class="mod-topbar-left">
          <h1 class="mod-title"><i class="fa-solid fa-file-lines"></i> Report Cards</h1>
        </div>
        <div class="mod-topbar-right" style="gap:6px;display:flex;flex-wrap:wrap;align-items:center;">
          <select class="select select-sm" onchange="rcPickYear(parseInt(this.value))">
            ${years.map(y=>`<option value="${y.id}"${y.id===_rcYearId?' selected':''}>${esc(y.year_name)}</option>`).join('')}
          </select>
          ${needTerm ? `<select class="select select-sm" onchange="rcPickTerm(parseInt(this.value))">
            <option value="">— Term —</option>
            ${terms.map(t=>`<option value="${t.id}"${t.id===_rcTermId?' selected':''}>
              ${esc(t.term_label||'Term '+t.term_number)}</option>`).join('')}
          </select>` : ''}
          <select class="select select-sm" onchange="rcPickClass(parseInt(this.value))">
            <option value="">— Class —</option>
            ${classes.map(c=>`<option value="${c.id}"${c.id===_rcClassId?' selected':''}>
              ${esc(c.name)}</option>`).join('')}
          </select>
          <select class="select select-sm" id="rc-stu-sel" onchange="rcPickStudent(parseInt(this.value))">
            <option value="">— Student —</option>
            ${students.map(s=>`<option value="${s.id}"${s.id===_rcStudentId?' selected':''}>
              ${esc(s.last_name)}, ${esc(s.first_name)}</option>`).join('')}
          </select>
          <button class="btn btn-secondary btn-sm" onclick="rcPrintAll()">
            <i class="fa-solid fa-layer-group"></i> Print All</button>
          <button class="btn btn-ghost btn-sm" onclick="navigateTo('rankings')">
            <i class="fa-solid fa-trophy"></i> Rankings</button>
          <button class="btn btn-ghost btn-sm" onclick="navigateTo('second-sitting')">
            <i class="fa-solid fa-clock-rotate-left"></i> 2nd Sitting</button>
          <button class="btn btn-primary btn-sm" onclick="rcPrint()">
            <i class="fa-solid fa-print"></i> Print</button>
        </div>
      </div>

      <!-- Type tabs -->
      <div style="display:flex;gap:4px;margin-bottom:14px;flex-wrap:wrap;">
        ${Object.entries(RC_TYPES).map(([k,v])=>`
        <button class="btn btn-sm ${k===_rcType?'btn-primary':'btn-ghost'}"
                onclick="rcPickType('${k}')">${esc(v)}</button>`).join('')}
      </div>

      <div id="rc-preview" style="padding:4px;">
        ${_rcStudentId ? _rcBuild(_rcStudentId)
          : '<div class="empty-state" style="padding:60px;"><div class="es-title">Select a class and student</div></div>'}
      </div>
    </div>`;
}

// ── Pickers ───────────────────────────────────────────────────────
window.rcPickType    = t  => { _rcType=t;  _rcRefresh(); };
window.rcPickYear    = id => { _rcYearId=id; _rcTermId=null; _rcRefresh(); };
window.rcPickTerm    = id => { _rcTermId=id; _rcRefresh(); };
window.rcPickClass   = id => { _rcClassId=id; _rcStudentId=null; _rcRefresh(); };
window.rcPickStudent = id => { _rcStudentId=id; const el=document.getElementById('rc-preview'); if(el) el.innerHTML=_rcBuild(id); };

function _rcRefresh() {
    const c = document.getElementById('moduleContent') || document.querySelector('.module-wrap')?.parentElement;
    if (c) _rcShell(c);
}

// ── Helpers ───────────────────────────────────────────────────────
function _rcIsNursery() {
    const cls = (state.classes||[]).find(c=>c.id===_rcClassId);
    return cls?.level === 'nursery';
}

function _rcRoster() {
    if (!_rcClassId) return [];
    if (typeof getHistoricalRoster === 'function')
        return getHistoricalRoster(_rcClassId, _rcTermId, _rcYearId);
    return (state.students||[])
        .filter(s=>s.class_id===_rcClassId && s.status==='Active' && !s.is_deleted)
        .sort((a,b)=>(a.last_name||'').localeCompare(b.last_name||''));
}

function _rcTermsForYear() {
    return (state.terms||[])
        .filter(t=>t.academic_year_id===_rcYearId)
        .sort((a,b)=>a.term_number-b.term_number);
}

function _rcGetSubjects(coreOnly) {
    const termIds = new Set(_rcTermsForYear().map(t=>t.id));
    const classAssmnts = (state.assessments||[]).filter(a=>
        a.class_id===_rcClassId && termIds.has(a.term_id) &&
        a.assessment_category !== 'second_sitting');
    const subjIds = [...new Set(classAssmnts.map(a=>a.subject_id))];
    let subjects = subjIds
        .map(id=>(state.subjects||[]).find(s=>s.id===id))
        .filter(Boolean)
        .sort((a,b)=>(a.sort_order||99)-(b.sort_order||99));
    if (coreOnly) subjects = subjects.filter(s=>s.is_core!==false);
    return subjects;
}

// Get marks score for a student across a set of assessment IDs — scaled to target max
function _rcScaled(studentId, assIds, rawMax, targetMax) {
    if (!assIds.length || rawMax <= 0) return { score: null, scaled: null };
    const raw = assIds.reduce((sum, aid) => {
        const m = (state.marks||[]).find(m=>m.student_id===studentId && m.assessment_id===aid);
        return sum + (m && !m.is_absent ? Number(m.score||0) : 0);
    }, 0);
    const rawAssMax = assIds.reduce((sum, aid) => {
        const a = (state.assessments||[]).find(a=>a.id===aid);
        return sum + Number(a?.max_marks||0);
    }, 0);
    if (rawAssMax <= 0) return { score: null, scaled: null };
    const scaled = (raw / rawAssMax) * targetMax;
    return { score: raw, scaled: parseFloat(scaled.toFixed(2)) };
}

// Subject configured maxima
function _rcSubjMax(subj) {
    const nursery = _rcIsNursery();
    const tsMax = subj.ts_max ? Number(subj.ts_max) : (nursery ? 25 : 50);
    const exMax = subj.ex_max ? Number(subj.ex_max) : (nursery ? 25 : 50);
    return { tsMax, exMax, totMax: tsMax + exMax };
}

// Conduct score for a student in a term
function _rcConduct(studentId, termId) {
    return (state.conductScores||[]).find(c=>
        c.student_id===studentId && c.term_id===termId)?.score ?? null;
}

// Rank students in class by total score (annTot)
function _rcRankAll(allStudents, scorer) {
    return allStudents
        .map(s=>({ id:s.id, tot:scorer(s.id) }))
        .sort((a,b)=>b.tot-a.tot);
}

// Common table styles
const TDC = 'style="border:1px solid #cbd5e1;padding:3px 5px;text-align:center;font-size:11px;"';
const TDL = 'style="border:1px solid #cbd5e1;padding:3px 5px;font-size:11px;"';
const TDB = 'style="border:1px solid #cbd5e1;padding:3px 5px;text-align:center;font-size:11px;font-weight:700;"';

function _rcHeader(student, cls, year, school, title, extraInfo) {
    return `
    <div style="text-align:center;margin-bottom:10px;">
      <div style="font-size:11px;font-weight:600;">REPUBLIC OF RWANDA — MINISTRY OF EDUCATION</div>
      <div style="font-size:18px;font-weight:900;margin:4px 0;font-style:italic;">${esc(school.school_name||'ECOLE LA FONTAINE')}</div>
      ${school.school_motto ? `<div style="font-size:11px;font-style:italic;">${esc(school.school_motto)}</div>` : ''}
      ${school.school_phone||school.school_email ? `<div style="font-size:10px;">Phone: ${esc(school.school_phone||'')}  E-mail: ${esc(school.school_email||'')}</div>` : ''}
      <div style="font-size:14px;font-weight:800;text-decoration:underline;margin-top:8px;">${title}</div>
    </div>
    <div style="display:flex;justify-content:space-between;font-size:12px;font-weight:600;margin-bottom:4px;">
      <div>Student's Names: <span style="font-weight:400;">${esc(student.first_name)} ${esc(student.last_name)}</span></div>
      <div>Academic Year: <span style="font-weight:400;">${esc(year?.year_name||'—')}</span></div>
    </div>
    <div style="display:flex;justify-content:space-between;font-size:12px;font-weight:600;margin-bottom:${extraInfo?'4':'12'}px;">
      <div>Registration Number: <span style="font-weight:400;">${esc(student.student_code||student.code||'—')}</span></div>
      <div>Class: <span style="font-weight:400;">${esc(cls?.name||'—')}</span></div>
    </div>
    ${extraInfo ? `<div style="font-size:12px;font-weight:600;margin-bottom:12px;">${extraInfo}</div>` : ''}`;
}

function _rcGradingScale() {
    return `<table style="width:100%;border-collapse:collapse;font-size:10px;margin-top:8px;">
      <tr>
        <td style="border:1px solid #cbd5e1;padding:2px 6px;font-weight:700;">Grading Scale</td>
        <td style="border:1px solid #cbd5e1;padding:2px 6px;">90-100<br><strong>A+</strong></td>
        <td style="border:1px solid #cbd5e1;padding:2px 6px;">80-89<br><strong>A</strong></td>
        <td style="border:1px solid #cbd5e1;padding:2px 6px;">75-79<br><strong>B</strong></td>
        <td style="border:1px solid #cbd5e1;padding:2px 6px;">70-74<br><strong>C</strong></td>
        <td style="border:1px solid #cbd5e1;padding:2px 6px;">60-69<br><strong>D</strong></td>
        <td style="border:1px solid #cbd5e1;padding:2px 6px;">50-59<br><strong>S</strong></td>
        <td style="border:1px solid #cbd5e1;padding:2px 6px;">0-49<br><strong>F</strong></td>
      </tr>
    </table>`;
}

function _rcSignatureBlock(school) {
    return `<div style="display:flex;justify-content:space-between;margin-top:16px;font-size:11px;">
      <div style="flex:1;">
        <div style="border-bottom:1px solid #1e293b;margin-bottom:2px;height:30px;"></div>
        <div>Class Teacher's Signature</div>
      </div>
      <div style="flex:1;margin:0 20px;">
        <div style="border-bottom:1px solid #1e293b;margin-bottom:2px;height:30px;"></div>
        <div>Parent's Signature</div>
      </div>
      <div style="flex:1;text-align:center;border:1px solid #e2e8f0;border-radius:4px;padding:8px;">
        <div style="font-weight:700;">${esc(school.head_teacher_name||'Headmaster')}</div>
        <div style="font-size:10px;color:#64748b;">${esc(school.head_teacher_title||'Head Teacher')}</div>
        <div style="border-top:1px solid #e2e8f0;margin-top:14px;padding-top:4px;font-size:10px;">
          Done on ${new Date().toLocaleDateString('en-GB',{day:'numeric',month:'long',year:'numeric'})}</div>
      </div>
    </div>`;
}

// ── DISPATCHER ────────────────────────────────────────────────────
function _rcBuild(studentId) {
    const student = getStudent(studentId);
    if (!student) return '<div class="empty-state"><div class="es-title">Student not found</div></div>';
    const cls   = (state.classes||[]).find(c=>c.id===_rcClassId);
    const year  = (state.academicYears||[]).find(y=>y.id===_rcYearId);
    const sch   = state.schoolSettings || {};
    switch (_rcType) {
        case 'welcoming':   return _rcWelcoming(studentId, student, cls, year, sch);
        case 'midterm':     return _rcMidterm(studentId, student, cls, year, sch);
        case 'end_of_term': return _rcEndOfTerm(studentId, student, cls, year, sch);
        case 'annual':      return _rcAnnual(studentId, student, cls, year, sch);
        case 'holiday':     return _rcHoliday(studentId, student, cls, year, sch);
        default:            return _rcAnnual(studentId, student, cls, year, sch);
    }
}

// ── 1. WELCOMING TESTS (Primary only) ────────────────────────────
function _rcWelcoming(studentId, student, cls, year, sch) {
    if (_rcIsNursery()) {
        return '<div class="alert alert-info" style="margin:20px;"><i class="fa-solid fa-circle-info"></i> Welcoming Tests are for Primary classes only. Nursery starts from Midterm.</div>';
    }
    const term = (state.terms||[]).find(t=>t.id===_rcTermId);
    if (!_rcTermId || !term) return _rcNeedTerm('Welcoming Tests');

    const subjects = _rcGetSubjects(true); // core only
    const promoMark = Number(sch.promotion_mark||50);

    // Welcoming assessments = phase 'pre_midterm' + category 'welcoming' in first 2 weeks
    const rows = subjects.map(subj => {
        const assIds = (state.assessments||[])
            .filter(a => a.class_id===_rcClassId && a.term_id===_rcTermId &&
                         a.subject_id===subj.id &&
                         a.assessment_category==='welcoming')
            .map(a=>a.id);
        const rawMax = assIds.reduce((s,id)=>{
            const a=(state.assessments||[]).find(a=>a.id===id);
            return s+Number(a?.max_marks||0);
        },0);
        const { scaled } = _rcScaled(studentId, assIds, rawMax, 100);
        const pct  = scaled; // already /100
        const gr   = _rcGrade(pct);
        return { subj, score: scaled, pct, gr };
    });

    const totalScore = rows.reduce((s,r)=>s+(r.score||0),0);
    const totalMax   = rows.length * 100;
    const totalPct   = totalMax>0 ? (totalScore/totalMax)*100 : null;

    const allStu = _rcRoster();
    const ranked = _rcRankAll(allStu, sid => {
        return subjects.reduce((sum,subj) => {
            const ids=(state.assessments||[]).filter(a=>a.class_id===_rcClassId&&a.term_id===_rcTermId&&a.subject_id===subj.id&&a.assessment_category==='welcoming').map(a=>a.id);
            const raw=ids.reduce((s,id)=>{const a=(state.assessments||[]).find(a=>a.id===id);return s+Number(a?.max_marks||0);},0);
            return sum + (_rcScaled(sid,ids,raw,100).scaled||0);
        },0);
    });
    const rankPos = ranked.findIndex(r=>r.id===studentId)+1;

    return `<div class="rc-card" style="${_rcCardStyle()}">
      ${_rcHeader(student,cls,year,sch,'WELCOMING TEST REPORT',
        `Term: <span style="font-weight:400;">${esc(term.term_label||'Term '+term.term_number)}</span>`)}
      <div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;">
        <thead>
          <tr style="background:#1e293b;color:#fff;">
            <th ${TDL} style="min-width:160px;text-align:left;">Subject</th>
            <th ${TDC}>Score /100</th>
            <th ${TDC}>Grade</th>
            <th ${TDC}>Remarks</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map(r=>`<tr>
            <td ${TDL}><strong>${esc(r.subj.name)}</strong></td>
            <td ${TDC} style="font-weight:700;color:${r.pct!==null&&r.pct<promoMark?'#dc2626':'inherit'};">
              ${r.score!==null?r.score.toFixed(1):'—'}</td>
            <td ${TDC} style="font-weight:700;color:${r.pct!==null&&r.pct<promoMark?'#dc2626':'#16a34a'};">
              ${r.gr.letter}</td>
            <td ${TDL} style="min-width:120px;"> </td>
          </tr>`).join('')}
          <tr style="background:#f1f5f9;font-weight:700;">
            <td ${TDL}><strong>TOTAL</strong></td>
            <td ${TDB}>${totalScore.toFixed(1)} / ${totalMax}</td>
            <td ${TDB} style="color:${totalPct!==null&&totalPct<promoMark?'#dc2626':'#16a34a'};">
              ${_rcGrade(totalPct).letter}</td>
            <td></td>
          </tr>
          <tr><td ${TDL}><strong>Percentage</strong></td>
            <td ${TDC} colspan="3" style="font-weight:700;">
              ${totalPct!==null?totalPct.toFixed(1)+'%':'—'}</td></tr>
          <tr><td ${TDL}><strong>Position</strong></td>
            <td ${TDC} colspan="3">${rankPos} of ${allStu.length}</td></tr>
          <tr><td ${TDL}>Class Teacher's Remarks</td>
            <td ${TDL} colspan="3" style="height:32px;"> </td></tr>
          <tr><td ${TDL}>Class Teacher's Signature</td>
            <td ${TDL} colspan="3" style="height:32px;"> </td></tr>
          <tr><td ${TDL}>Parent's Signature</td>
            <td ${TDL} colspan="3" style="height:32px;"> </td></tr>
        </tbody>
      </table></div>
      ${_rcGradingScale()}
      ${_rcSignatureBlock(sch)}
    </div>`;
}

// ── 2. MIDTERM REPORT ─────────────────────────────────────────────
function _rcMidterm(studentId, student, cls, year, sch) {
    const term = (state.terms||[]).find(t=>t.id===_rcTermId);
    if (!_rcTermId || !term) return _rcNeedTerm('Midterm Report');
    const nursery   = _rcIsNursery();
    const subjects  = _rcGetSubjects(true);
    const promoMark = Number(sch.promotion_mark||50);

    const rows = subjects.map(subj => {
        const mx = _rcSubjMax(subj);
        // TS: all assessments with category NOT midterm_exam and NOT school_exam
        const tsIds = (state.assessments||[]).filter(a=>
            a.class_id===_rcClassId && a.term_id===_rcTermId &&
            a.subject_id===subj.id  && a.phase==='pre_midterm' &&
            a.assessment_category !== 'midterm_exam').map(a=>a.id);
        const tsRawMax = tsIds.reduce((s,id)=>{const a=(state.assessments||[]).find(a=>a.id===id);return s+Number(a?.max_marks||0);},0);
        const tsRes = _rcScaled(studentId, tsIds, tsRawMax, nursery?0:100);

        // EX: midterm_exam category
        const exIds = (state.assessments||[]).filter(a=>
            a.class_id===_rcClassId && a.term_id===_rcTermId &&
            a.subject_id===subj.id  && a.assessment_category==='midterm_exam').map(a=>a.id);
        const exRawMax = exIds.reduce((s,id)=>{const a=(state.assessments||[]).find(a=>a.id===id);return s+Number(a?.max_marks||0);},0);
        const exRes = _rcScaled(studentId, exIds, exRawMax, 100);

        const ts  = nursery ? null : (tsRes.scaled||0);
        const ex  = exRes.scaled||0;
        const tot = nursery ? ex : (ts||0)+ex;
        const totMax = nursery ? 100 : 200;
        const pct = (tot/totMax)*100;
        const gr  = _rcGrade(pct);
        return { subj, ts, ex, tot, totMax, pct, gr };
    });

    const totScore = rows.reduce((s,r)=>s+r.tot,0);
    const totMax   = rows.reduce((s,r)=>s+r.totMax,0);
    const totPct   = totMax>0?(totScore/totMax)*100:null;
    const allStu   = _rcRoster();
    const ranked   = _rcRankAll(allStu, sid => rows.reduce((s,r)=>{
        const subj=r.subj;
        const mx=_rcSubjMax(subj);
        const tsIds=(state.assessments||[]).filter(a=>a.class_id===_rcClassId&&a.term_id===_rcTermId&&a.subject_id===subj.id&&a.phase==='pre_midterm'&&a.assessment_category!=='midterm_exam').map(a=>a.id);
        const tsRM=tsIds.reduce((x,id)=>{const a=(state.assessments||[]).find(a=>a.id===id);return x+Number(a?.max_marks||0);},0);
        const exIds=(state.assessments||[]).filter(a=>a.class_id===_rcClassId&&a.term_id===_rcTermId&&a.subject_id===subj.id&&a.assessment_category==='midterm_exam').map(a=>a.id);
        const exRM=exIds.reduce((x,id)=>{const a=(state.assessments||[]).find(a=>a.id===id);return x+Number(a?.max_marks||0);},0);
        const ts=nursery?0:(_rcScaled(sid,tsIds,tsRM,100).scaled||0);
        const ex=_rcScaled(sid,exIds,exRM,100).scaled||0;
        return s+ts+ex;
    },0));
    const rankPos = ranked.findIndex(r=>r.id===studentId)+1;

    return `<div class="rc-card" style="${_rcCardStyle()}">
      ${_rcHeader(student,cls,year,sch,'MID-TERM PROGRESS REPORT',
        `Term: <span style="font-weight:400;">${esc(term.term_label||'Term '+term.term_number)}</span>`)}
      <div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;">
        <thead>
          <tr style="background:#1e293b;color:#fff;">
            <th ${TDL} rowspan="2" style="min-width:160px;text-align:left;">Subject</th>
            <th ${TDC} colspan="${nursery?1:3}" style="border:1px solid #475569;">Maximum</th>
            ${nursery?'':`<th ${TDC} style="border:1px solid #475569;">TS /100</th>`}
            <th ${TDC} style="border:1px solid #475569;">${nursery?'EX /100':'EX /100'}</th>
            <th ${TDC} style="border:1px solid #475569;">TOT /${nursery?100:200}</th>
            <th ${TDC} style="border:1px solid #475569;">GR</th>
          </tr>
          <tr style="background:#334155;color:#fff;">
            ${nursery?`<th ${TDC}>EX</th>`:`<th ${TDC}>TS</th><th ${TDC}>EX</th><th ${TDC}>TOT</th>`}
            ${nursery?'':''}</tr>
        </thead>
        <tbody>
          <tr style="background:#f8fafc;">
            <td ${TDL}>Conduct</td>
            <td ${TDC} colspan="${nursery?1:3}">40</td>
            ${nursery?'':`<td ${TDC}></td>`}
            <td ${TDC}></td><td ${TDC}></td><td ${TDC}></td>
          </tr>
          <tr style="background:#dbeafe;">
            <td colspan="${nursery?5:6}" style="border:1px solid #cbd5e1;padding:3px 6px;font-size:10px;font-weight:700;color:#1e40af;">
              CORE SUBJECTS</td>
          </tr>
          ${rows.map(r=>`<tr>
            <td ${TDL}><strong>${esc(r.subj.name)}</strong></td>
            ${nursery?`<td ${TDC}>${r.tot>0?'':100}</td>`:
              `<td ${TDC}>${_rcSubjMax(r.subj).tsMax}</td>
               <td ${TDC}>${_rcSubjMax(r.subj).exMax}</td>
               <td ${TDC}>${_rcSubjMax(r.subj).tsMax+_rcSubjMax(r.subj).exMax}</td>`}
            ${nursery?'':
              `<td ${TDC} style="font-weight:600;">${r.ts!==null?r.ts.toFixed(1):'—'}</td>`}
            <td ${TDC} style="font-weight:600;">${r.ex!==null?r.ex.toFixed(1):'—'}</td>
            <td ${TDB} style="color:${r.pct<promoMark?'#dc2626':'inherit'};">${r.tot.toFixed(1)}</td>
            <td ${TDB} style="color:${r.pct<promoMark?'#dc2626':'#16a34a'};">${r.gr.letter}</td>
          </tr>`).join('')}
          <tr style="background:#f1f5f9;font-weight:700;">
            <td ${TDL}><strong>TOTAL</strong></td>
            ${nursery?`<td ${TDC}>${rows.length*100}</td>`:
              `<td ${TDC}>${rows.reduce((s,r)=>s+_rcSubjMax(r.subj).tsMax,0)}</td>
               <td ${TDC}>${rows.reduce((s,r)=>s+_rcSubjMax(r.subj).exMax,0)}</td>
               <td ${TDB}>${rows.reduce((s,r)=>s+_rcSubjMax(r.subj).tsMax+_rcSubjMax(r.subj).exMax,0)}</td>`}
            ${nursery?'':
              `<td ${TDB}>${rows.reduce((s,r)=>s+(r.ts||0),0).toFixed(1)}</td>`}
            <td ${TDB}>${rows.reduce((s,r)=>s+r.ex,0).toFixed(1)}</td>
            <td ${TDB}>${totScore.toFixed(1)}</td>
            <td ${TDB} style="color:${totPct!==null&&totPct<promoMark?'#dc2626':'#16a34a'};">${_rcGrade(totPct).letter}</td>
          </tr>
          <tr><td ${TDL}><strong>Percentage</strong></td>
            <td colspan="${nursery?4:5}" ${TDC}>${totPct!==null?totPct.toFixed(2)+'%':'—'}</td></tr>
          <tr><td ${TDL}><strong>Position</strong></td>
            <td colspan="${nursery?4:5}" ${TDC}>${rankPos} of ${allStu.length}</td></tr>
          <tr><td ${TDL}>Class Teacher's Remarks</td>
            <td colspan="${nursery?4:5}" ${TDL} style="height:32px;"> </td></tr>
          <tr><td ${TDL}>Class Teacher's Signature</td>
            <td colspan="${nursery?4:5}" ${TDL} style="height:32px;"> </td></tr>
          <tr><td ${TDL}>Parent's Signature</td>
            <td colspan="${nursery?4:5}" ${TDL} style="height:32px;"> </td></tr>
        </tbody>
      </table></div>
      ${_rcGradingScale()}
      ${_rcSignatureBlock(sch)}
    </div>`;
}

// ── 3. END OF TERM ────────────────────────────────────────────────
function _rcEndOfTerm(studentId, student, cls, year, sch) {
    const term = (state.terms||[]).find(t=>t.id===_rcTermId);
    if (!_rcTermId || !term) return _rcNeedTerm('End of Term Examinations');
    const nursery    = _rcIsNursery();
    const promoMark  = Number(sch.promotion_mark||50);
    const termNo     = term.term_number || 1;
    const allSubjects= _rcGetSubjects(false);
    const core       = allSubjects.filter(s=>s.is_core!==false);
    const nonCore    = allSubjects.filter(s=>s.is_core===false);

    // Exam categories for this term and level
    // Primary T1: school_exam; T2: school_exam+district_exam; T3: school_exam+nesa_exam
    // Nursery: always school_exam only
    const exCats = nursery ? ['school_exam'] :
        termNo===1 ? ['school_exam'] :
        termNo===2 ? ['school_exam','district_exam'] :
                     ['school_exam','nesa_exam'];

    function computeRow(subj) {
        const mx = _rcSubjMax(subj);
        // TS: ALL marks in term except exam categories
        const tsIds = (state.assessments||[]).filter(a=>
            a.class_id===_rcClassId && a.term_id===_rcTermId &&
            a.subject_id===subj.id  &&
            !['school_exam','district_exam','nesa_exam','second_sitting'].includes(a.assessment_category)
        ).map(a=>a.id);
        const tsRawMax = tsIds.reduce((s,id)=>{const a=(state.assessments||[]).find(a=>a.id===id);return s+Number(a?.max_marks||0);},0);
        const tsRes = nursery ? {scaled:null} : _rcScaled(studentId, tsIds, tsRawMax, mx.tsMax);

        // EX: exam categories (all exam types summed, scaled to ex_max)
        const exIds = (state.assessments||[]).filter(a=>
            a.class_id===_rcClassId && a.term_id===_rcTermId &&
            a.subject_id===subj.id  && exCats.includes(a.assessment_category)
        ).map(a=>a.id);
        const exRawMax = exIds.reduce((s,id)=>{const a=(state.assessments||[]).find(a=>a.id===id);return s+Number(a?.max_marks||0);},0);
        const exRes = _rcScaled(studentId, exIds, exRawMax, mx.exMax);

        const ts  = nursery ? null : (tsRes.scaled||0);
        const ex  = exRes.scaled||0;
        const tot = nursery ? ex : (ts||0)+ex;
        const pct = mx.totMax>0?(tot/mx.totMax)*100:null;
        const gr  = _rcGrade(pct);
        return { subj, ts, ex, tot, pct, gr, mx };
    }

    const coreRows    = core.map(computeRow);
    const nonCoreRows = nonCore.map(computeRow);
    const allRows     = [...coreRows, ...nonCoreRows];
    const conduct     = _rcConduct(studentId, _rcTermId);

    const grandTot    = allRows.reduce((s,r)=>s+r.tot,0);
    const grandMax    = allRows.reduce((s,r)=>s+r.mx.totMax,0);
    const grandPct    = grandMax>0?(grandTot/grandMax)*100:null;
    const allStu      = _rcRoster();
    const ranked      = _rcRankAll(allStu, sid => allSubjects.reduce((s,subj)=>{
        const mx=_rcSubjMax(subj);
        const exIds=(state.assessments||[]).filter(a=>a.class_id===_rcClassId&&a.term_id===_rcTermId&&a.subject_id===subj.id&&exCats.includes(a.assessment_category)).map(a=>a.id);
        const exRM=exIds.reduce((x,id)=>{const a=(state.assessments||[]).find(a=>a.id===id);return x+Number(a?.max_marks||0);},0);
        const ex=_rcScaled(sid,exIds,exRM,mx.exMax).scaled||0;
        if (nursery) return s+ex;
        const tsIds=(state.assessments||[]).filter(a=>a.class_id===_rcClassId&&a.term_id===_rcTermId&&a.subject_id===subj.id&&!['school_exam','district_exam','nesa_exam','second_sitting'].includes(a.assessment_category)).map(a=>a.id);
        const tsRM=tsIds.reduce((x,id)=>{const a=(state.assessments||[]).find(a=>a.id===id);return x+Number(a?.max_marks||0);},0);
        const ts=_rcScaled(sid,tsIds,tsRM,mx.tsMax).scaled||0;
        return s+ts+ex;
    },0));
    const rankPos = ranked.findIndex(r=>r.id===studentId)+1;

    const examLabel = nursery ? 'School Exam' :
        termNo===1 ? 'School Exam' :
        termNo===2 ? 'School Exam + District Exam' :
                     'School Exam + NESA Exam';

    function subjectRow(r) {
        const isFail = r.pct!==null && r.pct<promoMark;
        return `<tr>
          <td ${TDL}><strong>${esc(r.subj.name)}</strong></td>
          <td ${TDC}>${r.mx.tsMax}</td>
          <td ${TDC}>${r.mx.exMax}</td>
          <td ${TDB}>${r.mx.totMax}</td>
          <td ${TDC}>${r.subj.coefficient||6}</td>
          ${nursery?'':
            `<td ${TDC} style="font-weight:600;color:${isFail?'#dc2626':'inherit'};">${r.ts!==null?r.ts.toFixed(1):'—'}</td>`}
          <td ${TDC} style="font-weight:600;">${r.ex.toFixed(1)}</td>
          <td ${TDB} style="color:${isFail?'#dc2626':'inherit'};">${r.tot.toFixed(1)}</td>
          <td ${TDB} style="color:${isFail?'#dc2626':'#16a34a'};">${r.gr.letter}</td>
        </tr>`;
    }

    const colCount = nursery ? 7 : 8;

    return `<div class="rc-card" style="${_rcCardStyle()}">
      ${_rcHeader(student,cls,year,sch,'END OF TERM EXAMINATION REPORT',
        `Term: <span style="font-weight:400;">${esc(term.term_label||'Term '+term.term_number)}</span>
         &nbsp;|&nbsp; Exams: <span style="font-weight:400;">${examLabel}</span>`)}
      <div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;">
        <thead>
          <tr style="background:#1e293b;color:#fff;">
            <th ${TDL} rowspan="2" style="min-width:160px;text-align:left;">Subjects</th>
            <th colspan="4" style="border:1px solid #475569;padding:3px;text-align:center;font-size:11px;">MAXIMUM</th>
            ${nursery?'':`<th ${TDC} rowspan="2">TS</th>`}
            <th ${TDC} rowspan="2">EX</th>
            <th ${TDC} rowspan="2">TOT</th>
            <th ${TDC} rowspan="2">GR</th>
          </tr>
          <tr style="background:#334155;color:#fff;">
            <th ${TDC}>TS</th><th ${TDC}>EX</th><th ${TDB}>TOT</th><th ${TDC}>GR</th>
          </tr>
        </thead>
        <tbody>
          <!-- Conduct -->
          <tr style="background:#f8fafc;">
            <td ${TDL}>Conduct</td>
            <td ${TDC}></td><td ${TDC}></td><td ${TDB}>40</td><td ${TDC}>6</td>
            ${nursery?'':''}<td ${TDC}>${conduct!==null?conduct.toFixed(0):''}</td>
            <td ${TDB}>${conduct!==null?conduct.toFixed(0):''}</td>
            <td ${TDB}>${conduct!==null?_rcGrade((conduct/40)*100).letter:''}</td>
          </tr>

          <!-- Core subjects -->
          <tr style="background:#dbeafe;">
            <td colspan="${colCount}" style="border:1px solid #cbd5e1;padding:3px 6px;font-size:10px;font-weight:700;color:#1e40af;">
              CORE SUBJECTS</td>
          </tr>
          ${coreRows.map(subjectRow).join('')}

          ${nonCoreRows.length ? `
          <tr style="background:#f0fdf4;">
            <td colspan="${colCount}" style="border:1px solid #cbd5e1;padding:3px 6px;font-size:10px;font-weight:700;color:#166534;">
              NON-CORE SUBJECTS</td>
          </tr>
          ${nonCoreRows.map(subjectRow).join('')}` : ''}

          <!-- Totals -->
          <tr style="background:#f1f5f9;font-weight:700;">
            <td ${TDL}><strong>TOTAL</strong></td>
            <td ${TDB}>${allRows.reduce((s,r)=>s+r.mx.tsMax,0)}</td>
            <td ${TDB}>${allRows.reduce((s,r)=>s+r.mx.exMax,0)}</td>
            <td ${TDB}>${grandMax}</td>
            <td ${TDB}>${allRows.reduce((s,r)=>s+(r.subj.coefficient||6),0)}</td>
            ${nursery?'':
              `<td ${TDB}>${allRows.reduce((s,r)=>s+(r.ts||0),0).toFixed(1)}</td>`}
            <td ${TDB}>${allRows.reduce((s,r)=>s+r.ex,0).toFixed(1)}</td>
            <td ${TDB}>${grandTot.toFixed(1)}</td>
            <td ${TDB} style="color:${grandPct!==null&&grandPct<promoMark?'#dc2626':'#16a34a'};">${_rcGrade(grandPct).letter}</td>
          </tr>
          <tr><td ${TDL}><strong>PERCENTAGE</strong></td>
            <td colspan="${colCount-1}" ${TDB}>${grandPct!==null?grandPct.toFixed(2)+'%':'—'}</td></tr>
          <tr><td ${TDL}><strong>POSITION</strong></td>
            <td colspan="${colCount-1}" ${TDB}>${rankPos} of ${allStu.length}</td></tr>
          <tr><td ${TDL}>Class Teacher's Remarks &amp; Signature</td>
            <td colspan="${colCount-1}" ${TDL} style="height:36px;"> </td></tr>
          <tr><td ${TDL}>Parent's Signature</td>
            <td colspan="${colCount-1}" ${TDL} style="height:36px;"> </td></tr>
        </tbody>
      </table></div>
      ${_rcGradingScale()}
      ${_rcSignatureBlock(sch)}
    </div>`;
}

// ── 4. ANNUAL REPORT ──────────────────────────────────────────────
function _rcAnnual(studentId, student, cls, year, sch) {
    const terms     = _rcTermsForYear();
    const nursery   = _rcIsNursery();
    const promoMark = Number(sch.promotion_mark||50);
    if (!terms.length) return '<div class="empty-state" style="padding:40px;"><div class="es-title">No terms configured for this year</div></div>';

    const allSubjects = _rcGetSubjects(false);
    if (!allSubjects.length) return '<div class="empty-state" style="padding:40px;"><div class="es-title">No subjects found for this class/year</div></div>';
    const core    = allSubjects.filter(s=>s.is_core!==false);
    const nonCore = allSubjects.filter(s=>s.is_core===false);

    function computeTermRow(subj, term) {
        const mx = _rcSubjMax(subj);
        const termNo = term.term_number||1;
        const exCats = nursery ? ['school_exam'] :
            termNo===1?['school_exam']:termNo===2?['school_exam','district_exam']:['school_exam','nesa_exam'];

        const tsIds = nursery ? [] : (state.assessments||[]).filter(a=>
            a.class_id===_rcClassId && a.term_id===term.id && a.subject_id===subj.id &&
            !['school_exam','district_exam','nesa_exam','second_sitting'].includes(a.assessment_category)
        ).map(a=>a.id);
        const tsRM = tsIds.reduce((s,id)=>{const a=(state.assessments||[]).find(a=>a.id===id);return s+Number(a?.max_marks||0);},0);
        const tsRes= nursery?{scaled:null}:_rcScaled(studentId,tsIds,tsRM,mx.tsMax);

        const exIds = (state.assessments||[]).filter(a=>
            a.class_id===_rcClassId && a.term_id===term.id && a.subject_id===subj.id &&
            exCats.includes(a.assessment_category)
        ).map(a=>a.id);
        const exRM = exIds.reduce((s,id)=>{const a=(state.assessments||[]).find(a=>a.id===id);return s+Number(a?.max_marks||0);},0);
        const exRes= _rcScaled(studentId,exIds,exRM,mx.exMax);

        const ts   = nursery ? null : (tsRes.scaled||0);
        const ex   = exRes.scaled||0;
        const tot  = nursery ? ex : (ts||0)+ex;
        const pct  = mx.totMax>0?(tot/mx.totMax)*100:null;
        const gr   = _rcGrade(pct);
        return { ts, ex, tot, pct, gr, mx };
    }

    // For each subject: term rows + annual
    function buildSubjectData(subj) {
        const mx = _rcSubjMax(subj);
        const termRows = terms.map(t=>computeTermRow(subj,t));
        const annTot  = termRows.reduce((s,r)=>s+r.tot,0);
        const annMax  = mx.totMax*terms.length;
        const annPct  = annMax>0?(annTot/annMax)*100:null;
        const annGr   = _rcGrade(annPct);
        // 2nd sitting
        const ssAssmnt= (state.assessments||[]).find(a=>
            a.class_id===_rcClassId && a.subject_id===subj.id &&
            a.assessment_category==='second_sitting' &&
            terms.some(t=>t.id===a.term_id));
        const ssMark  = ssAssmnt?(state.marks||[]).find(m=>m.student_id===studentId&&m.assessment_id===ssAssmnt.id):null;
        const ssPct   = ssMark?.second_sitting_score ?? null;
        return { subj, termRows, annTot, annMax, annPct, annGr, ssPct, mx };
    }

    const coreData    = core.map(buildSubjectData);
    const nonCoreData = nonCore.map(buildSubjectData);
    const allData     = [...coreData, ...nonCoreData];

    // Conduct
    const conducts = terms.map(t=>({ term:t, score:_rcConduct(studentId,t.id) }));
    const conductAnn = conducts.reduce((s,c)=>s+(c.score||0),0);
    const conductMax = 40*terms.length;

    // Grand totals
    const annTotAll = allData.reduce((s,d)=>s+d.annTot,0);
    const annMaxAll = allData.reduce((s,d)=>s+d.annMax,0);
    const annPctAll = annMaxAll>0?(annTotAll/annMaxAll)*100:null;
    const annGrAll  = _rcGrade(annPctAll);

    // Per-term grand totals
    const termGrandTots = terms.map((_,ti)=>({
        ts : nursery?null:allData.reduce((s,d)=>s+(d.termRows[ti]?.ts||0),0),
        ex : allData.reduce((s,d)=>s+(d.termRows[ti]?.ex||0),0),
        tot: allData.reduce((s,d)=>s+(d.termRows[ti]?.tot||0),0),
        max: allData.reduce((s,d)=>s+(d.termRows[ti]?.mx.totMax||0),0),
        pct: null,
    }));
    termGrandTots.forEach(t=>{t.pct=t.max>0?(t.tot/t.max)*100:null;});

    // Position
    const allStu  = _rcRoster();
    const ranked  = _rcRankAll(allStu, sid => allSubjects.reduce((s,subj)=>{
        const d = buildSubjectDataFor(sid,subj);
        return s+d.annTot;
    },0));
    function buildSubjectDataFor(sid,subj) {
        const mx=_rcSubjMax(subj);
        const termRows=terms.map(t=>computeTermRowFor(sid,subj,t));
        const annTot=termRows.reduce((s,r)=>s+r.tot,0);
        return {annTot};
    }
    function computeTermRowFor(sid,subj,term) {
        const mx=_rcSubjMax(subj);
        const termNo=term.term_number||1;
        const exCats=nursery?['school_exam']:termNo===1?['school_exam']:termNo===2?['school_exam','district_exam']:['school_exam','nesa_exam'];
        const ts=nursery?0:(()=>{
            const ids=(state.assessments||[]).filter(a=>a.class_id===_rcClassId&&a.term_id===term.id&&a.subject_id===subj.id&&!['school_exam','district_exam','nesa_exam','second_sitting'].includes(a.assessment_category)).map(a=>a.id);
            const rm=ids.reduce((x,id)=>{const a=(state.assessments||[]).find(a=>a.id===id);return x+Number(a?.max_marks||0);},0);
            return _rcScaled(sid,ids,rm,mx.tsMax).scaled||0;
        })();
        const ex=(()=>{
            const ids=(state.assessments||[]).filter(a=>a.class_id===_rcClassId&&a.term_id===term.id&&a.subject_id===subj.id&&exCats.includes(a.assessment_category)).map(a=>a.id);
            const rm=ids.reduce((x,id)=>{const a=(state.assessments||[]).find(a=>a.id===id);return x+Number(a?.max_marks||0);},0);
            return _rcScaled(sid,ids,rm,mx.exMax).scaled||0;
        })();
        return {tot:nursery?ex:ts+ex};
    }
    const rankPos = ranked.findIndex(r=>r.id===studentId)+1;
    const promoDecision = (state.promotionDecisions||[]).find(d=>d.student_id===studentId&&d.academic_year_id===_rcYearId);

    // Column widths and headers
    const termHeaders = terms.map(t=>`
        <th colspan="${nursery?2:3}" style="border:1px solid #475569;padding:3px;text-align:center;font-size:11px;background:#e2e8f0;">
          ${esc(t.term_label||'Term '+t.term_number)}</th>`).join('');
    const termSubH = terms.map(()=>nursery?
        `<th ${TDC}>EX</th><th ${TDC}>GR</th>`:
        `<th ${TDC}>TS</th><th ${TDC}>EX</th><th ${TDC}>GR</th>`).join('');
    const termColCount = nursery ? terms.length*2 : terms.length*3;
    const totColSpan   = 5 + termColCount + 4 + 1; // maxima(4) + coeff(1) + terms + annual(4) + 2ndsitting(1)

    function subjectDataRow(d) {
        const isFail = d.annPct!==null&&d.annPct<promoMark;
        const termCells = d.termRows.map(r=>{
            const fail=r.pct!==null&&r.pct<promoMark;
            return nursery?
                `<td ${TDC} style="font-weight:600;">${r.ex.toFixed(1)}</td>
                 <td ${TDC} style="color:${fail?'#dc2626':'#16a34a'};font-weight:700;">${r.gr.letter}</td>`:
                `<td ${TDC} style="font-weight:600;">${r.ts!==null?r.ts.toFixed(1):'—'}</td>
                 <td ${TDC} style="font-weight:600;">${r.ex.toFixed(1)}</td>
                 <td ${TDC} style="color:${fail?'#dc2626':'#16a34a'};font-weight:700;">${r.gr.letter}</td>`;
        }).join('');
        const ssCell = d.subj.is_core!==false && d.ssPct!==null
            ? `<td ${TDC} style="font-weight:700;color:${d.ssPct>=promoMark?'#16a34a':'#dc2626'};">${d.ssPct.toFixed(1)}%</td>`
            : `<td ${TDC}>—</td>`;
        return `<tr>
          <td ${TDL}><strong>${esc(d.subj.name)}</strong></td>
          <td ${TDC}>${d.mx.tsMax}</td>
          <td ${TDC}>${d.mx.exMax}</td>
          <td ${TDB}>${d.mx.totMax}</td>
          <td ${TDC}>${d.subj.coefficient||6}</td>
          ${termCells}
          <td ${TDB}>${d.annTot.toFixed(1)}</td>
          <td ${TDB}>${d.annMax}</td>
          <td ${TDB} style="color:${isFail?'#dc2626':'inherit'};text-decoration:${isFail?'underline':'none'};">${d.annPct!==null?d.annPct.toFixed(1)+'%':'—'}</td>
          <td ${TDB} style="color:${isFail?'#dc2626':'#16a34a'};">${d.annGr.letter}</td>
          ${ssCell}
        </tr>`;
    }

    const termTotalCells = termGrandTots.map(t=>nursery?
        `<td ${TDB}>${t.ex.toFixed(1)}</td><td ${TDB}>${_rcGrade(t.pct).letter}</td>`:
        `<td ${TDB}>${(t.ts||0).toFixed(1)}</td><td ${TDB}>${t.ex.toFixed(1)}</td><td ${TDB}>${_rcGrade(t.pct).letter}</td>`
    ).join('');

    const FIRST_OPTIONS = ['promoted','second_sitting','repeated','discontinued','promoted_elsewhere','repeated_elsewhere'];
    const FINAL_OPTIONS = ['promoted','repeated','discontinued','promoted_after_2nd','repeated_after_2nd'];
    const FIRST_LABELS  = {promoted:'Promoted',second_sitting:'2nd Sitting',repeated:'Repeated',discontinued:'Discontinued',promoted_elsewhere:'Promoted Elsewhere',repeated_elsewhere:'Repeated Elsewhere'};
    const FINAL_LABELS  = {promoted:'Promoted',repeated:'Repeated',discontinued:'Discontinued',promoted_after_2nd:'Promoted After 2nd Sitting',repeated_after_2nd:'Repeated After 2nd Sitting'};
    const autoFirst = annPctAll!==null ? (annPctAll>=promoMark?'promoted':'second_sitting') : null;
    const firstDec  = promoDecision?.first_decision || autoFirst;
    const finalDec  = promoDecision?.final_decision || null;

    return `<div class="annual-report-card" style="${_rcCardStyle()}">
      ${_rcHeader(student,cls,year,sch,"STUDENT'S PROGRESSIVE ANNUAL REPORT",'')}

      <div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;font-size:11px;">
        <thead>
          <tr style="background:#1e293b;color:#fff;">
            <th rowspan="2" style="border:1px solid #475569;padding:4px 6px;text-align:left;min-width:130px;">Subjects</th>
            <th colspan="4" style="border:1px solid #475569;padding:3px;text-align:center;font-size:10px;">MAXIMUM</th>
            ${termHeaders}
            <th colspan="4" style="border:1px solid #475569;padding:3px;text-align:center;">ANNUAL</th>
            <th rowspan="2" style="border:1px solid #475569;padding:3px;text-align:center;font-size:10px;min-width:44px;">2nd SITTING</th>
          </tr>
          <tr style="background:#334155;color:#fff;">
            <th ${TDC}>TS</th><th ${TDC}>EX</th><th ${TDB}>TOT</th><th ${TDC}>GR</th>
            ${termSubH}
            <th ${TDC}>TOT</th><th ${TDC}>MAX</th><th ${TDC}>%</th><th ${TDC}>GR</th>
          </tr>
        </thead>
        <tbody>
          <!-- Conduct -->
          <tr style="background:#f8fafc;">
            <td ${TDL}>Conduct</td>
            <td ${TDC}></td><td ${TDC}></td><td ${TDB}>40</td><td ${TDC}>6</td>
            ${conducts.map(c=>nursery?
                `<td ${TDC}>${c.score!==null?c.score.toFixed(0):''}</td><td ${TDC}>${c.score!==null?_rcGrade((c.score/40)*100).letter:''}` :
                `<td ${TDC}>${c.score!==null?c.score.toFixed(0):''}</td><td ${TDC}></td><td ${TDC}>${c.score!==null?_rcGrade((c.score/40)*100).letter:''}`
            ).map(x=>x+'</td>').join('')}
            <td ${TDB}>${conductAnn.toFixed(0)}</td>
            <td ${TDB}>${conductMax}</td>
            <td ${TDB}>${conductMax>0?((conductAnn/conductMax)*100).toFixed(0)+'%':''}</td>
            <td ${TDB}>${conductAnn>0?_rcGrade((conductAnn/conductMax)*100).letter:''}</td>
            <td ${TDC}></td>
          </tr>

          <!-- Core -->
          <tr style="background:#dbeafe;">
            <td colspan="${totColSpan}" style="border:1px solid #cbd5e1;padding:3px 6px;font-size:10px;font-weight:700;color:#1e40af;">CORE SUBJECTS</td>
          </tr>
          ${coreData.map(subjectDataRow).join('')}

          ${nonCoreData.length ? `
          <tr style="background:#f0fdf4;">
            <td colspan="${totColSpan}" style="border:1px solid #cbd5e1;padding:3px 6px;font-size:10px;font-weight:700;color:#166534;">NON-CORE SUBJECTS</td>
          </tr>
          ${nonCoreData.map(subjectDataRow).join('')}` : ''}

          <!-- Grand total -->
          <tr style="background:#f1f5f9;font-weight:700;">
            <td ${TDL}><strong>TOTAL</strong></td>
            <td ${TDB}>${allData.reduce((s,d)=>s+d.mx.tsMax,0)}</td>
            <td ${TDB}>${allData.reduce((s,d)=>s+d.mx.exMax,0)}</td>
            <td ${TDB}>${allData.reduce((s,d)=>s+d.mx.totMax,0)}</td>
            <td ${TDB}>${allData.reduce((s,d)=>s+(d.subj.coefficient||6),0)}</td>
            ${termTotalCells}
            <td ${TDB}>${annTotAll.toFixed(1)}</td>
            <td ${TDB}>${annMaxAll}</td>
            <td ${TDB} style="color:${annPctAll!==null&&annPctAll<promoMark?'#dc2626':'#16a34a'};">${annPctAll!==null?annPctAll.toFixed(1)+'%':'—'}</td>
            <td ${TDB}>${annGrAll.letter}</td>
            <td ${TDC}></td>
          </tr>

          <!-- Percentage row -->
          <tr>
            <td ${TDL}><strong>PRECENTAGE</strong></td>
            <td ${TDC} colspan="4"></td>
            ${termGrandTots.map(t=>`<td ${TDC} colspan="${nursery?2:3}">${t.pct!==null?t.pct.toFixed(1)+'%':'—'}</td>`).join('')}
            <td ${TDC} colspan="4">${annPctAll!==null?annPctAll.toFixed(1)+'%':'—'}</td>
            <td ${TDC}></td>
          </tr>

          <!-- Position row -->
          <tr>
            <td ${TDL}><strong>POSITION</strong></td>
            <td ${TDC} colspan="4"></td>
            ${terms.map((_,ti)=>{
                const stuForTerm = allStu.map(s=>({
                    id:s.id,
                    tot:allSubjects.reduce((sum,subj)=>sum+computeTermRowFor(s.id,subj,terms[ti]).tot,0)
                })).sort((a,b)=>b.tot-a.tot);
                const pos=stuForTerm.findIndex(r=>r.id===studentId)+1;
                return `<td ${TDC} colspan="${nursery?2:3}">${pos} of ${allStu.length}</td>`;
            }).join('')}
            <td ${TDC} colspan="4">${rankPos} of ${allStu.length}</td>
            <td ${TDC}></td>
          </tr>

          <!-- Remarks -->
          <tr>
            <td ${TDL} colspan="3">CLASS TEACHER'S REMARKS &amp; SIGNATURE</td>
            <td colspan="${totColSpan-3}" ${TDL} style="height:36px;">${esc(promoDecision?.teacher_remarks||'')} </td>
          </tr>
          <tr>
            <td ${TDL} colspan="3">PARENT'S SIGNATURE</td>
            <td colspan="${totColSpan-3}" ${TDL} style="height:36px;"> </td>
          </tr>
        </tbody>
      </table></div>

      ${_rcGradingScale()}

      <!-- Decisions + headmaster -->
      <div style="display:flex;gap:16px;margin-top:12px;font-size:11px;">
        <div style="flex:1;border:1px solid #e2e8f0;border-radius:4px;padding:8px;">
          <div style="font-weight:700;margin-bottom:6px;">FIRST DECISION</div>
          ${FIRST_OPTIONS.map(opt=>`<div style="display:flex;align-items:center;gap:4px;margin-bottom:2px;">
            <input type="checkbox" ${firstDec===opt?'checked':''} readonly> ${esc(FIRST_LABELS[opt])}</div>`).join('')}
        </div>
        <div style="flex:1;border:1px solid #e2e8f0;border-radius:4px;padding:8px;">
          <div style="font-weight:700;margin-bottom:6px;">FINAL DECISION</div>
          ${FINAL_OPTIONS.map(opt=>`<div style="display:flex;align-items:center;gap:4px;margin-bottom:2px;">
            <input type="checkbox" ${finalDec===opt?'checked':''} readonly> ${esc(FINAL_LABELS[opt])}</div>`).join('')}
        </div>
        <div style="flex:1;text-align:center;border:1px solid #e2e8f0;border-radius:4px;padding:12px;">
          <div style="font-weight:700;font-size:12px;">The School Headteacher</div>
          <div style="font-weight:700;margin-top:20px;">${esc(sch.head_teacher_name||'Headmaster')}</div>
          <div style="font-size:10px;color:#64748b;border-top:1px solid #e2e8f0;margin-top:16px;padding-top:4px;">
            Done on ${new Date().toLocaleDateString('en-GB',{day:'numeric',month:'long',year:'numeric'})}</div>
        </div>
      </div>
    </div>`;
}

// ── 5. HOLIDAY REPORT ─────────────────────────────────────────────
function _rcHoliday(studentId, student, cls, year, sch) {
    const session = getActiveHolidaySession?.() || null;
    const subjects = _rcGetSubjects(true);
    const promoMark= Number(sch.promotion_mark||50);

    if (!session && !_rcTermId) {
        return '<div class="alert alert-info" style="margin:20px;"><i class="fa-solid fa-circle-info"></i> Select a holiday session from the sidebar to view the Holiday Report.</div>';
    }

    const sessId   = session?.id || _rcTermId;
    const sessName = session?.name || 'Holiday Session';

    const rows = subjects.map(subj => {
        const assIds = (state.holidayMarks || state.assessments || []).filter(a=>
            (a.holiday_session_id===sessId || a.term_id===sessId) &&
            (a.class_id===_rcClassId) && (a.subject_id===subj.id) &&
            a.assessment_category === 'holiday'
        ).map(a=>a.id || a.assessment_id);
        const rawMax = assIds.reduce((s,id)=>{
            const a=(state.assessments||[]).find(a=>a.id===id);
            return s+Number(a?.max_marks||0);
        },0);
        const { scaled } = _rcScaled(studentId, assIds, rawMax, 100);
        const pct = scaled;
        const gr  = _rcGrade(pct);
        return { subj, score: scaled, pct, gr };
    });

    const totalScore = rows.reduce((s,r)=>s+(r.score||0),0);
    const totalMax   = rows.length * 100;
    const totalPct   = totalMax>0?(totalScore/totalMax)*100:null;
    const allStu     = _rcRoster();
    const ranked     = _rcRankAll(allStu, sid => rows.reduce((s,r)=>s+(r.score||0),0));
    const rankPos    = ranked.findIndex(r=>r.id===studentId)+1;

    return `<div class="rc-card" style="${_rcCardStyle()}">
      ${_rcHeader(student,cls,year,sch,'HOLIDAY PROGRAMME REPORT',
        `Session: <span style="font-weight:400;">${esc(sessName)}</span>`)}
      <div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;">
        <thead>
          <tr style="background:#1e293b;color:#fff;">
            <th ${TDL} style="min-width:160px;text-align:left;">Subject</th>
            <th ${TDC}>Score /100</th>
            <th ${TDC}>Grade</th>
            <th ${TDC}>Remarks</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map(r=>`<tr>
            <td ${TDL}><strong>${esc(r.subj.name)}</strong></td>
            <td ${TDC} style="font-weight:700;color:${r.pct!==null&&r.pct<promoMark?'#dc2626':'inherit'};">${r.score!==null?r.score.toFixed(1):'—'}</td>
            <td ${TDC} style="font-weight:700;color:${r.pct!==null&&r.pct<promoMark?'#dc2626':'#16a34a'};">${r.gr.letter}</td>
            <td ${TDL}> </td>
          </tr>`).join('')}
          <tr style="background:#f1f5f9;font-weight:700;">
            <td ${TDL}><strong>TOTAL</strong></td>
            <td ${TDB}>${totalScore.toFixed(1)} / ${totalMax}</td>
            <td ${TDB} style="color:${totalPct!==null&&totalPct<promoMark?'#dc2626':'#16a34a'};">${_rcGrade(totalPct).letter}</td>
            <td></td>
          </tr>
          <tr><td ${TDL}>Percentage</td><td ${TDC} colspan="3">${totalPct!==null?totalPct.toFixed(1)+'%':'—'}</td></tr>
          <tr><td ${TDL}>Position</td><td ${TDC} colspan="3">${rankPos} of ${allStu.length}</td></tr>
          <tr><td ${TDL}>Class Teacher's Remarks</td><td ${TDL} colspan="3" style="height:32px;"> </td></tr>
          <tr><td ${TDL}>Parent's Signature</td><td ${TDL} colspan="3" style="height:32px;"> </td></tr>
        </tbody>
      </table></div>
      ${_rcGradingScale()}
      ${_rcSignatureBlock(sch)}
    </div>`;
}

// ── UTILITIES ─────────────────────────────────────────────────────
function _rcNeedTerm(type) {
    return `<div class="alert alert-warning" style="margin:20px;">
        <i class="fa-solid fa-triangle-exclamation"></i>
        Please select a <strong>term</strong> above to generate the <strong>${esc(type)}</strong>.</div>`;
}

function _rcCardStyle() {
    return 'background:#fff;color:#1e293b;font-family:"Segoe UI",Arial,sans-serif;max-width:960px;margin:0 auto;padding:16px 20px;border:1px solid #e2e8f0;border-radius:4px;';
}

// ── PRINT ─────────────────────────────────────────────────────────
const _CSS = `@media print{body{margin:8mm;}}
body{font-family:"Segoe UI",Arial,sans-serif;font-size:11px;}
table{border-collapse:collapse;width:100%;}
th,td{border:1px solid #cbd5e1;padding:3px 5px;font-size:10px;}
.rc-card,.annual-report-card{max-width:100%!important;page-break-after:always;}`;

window.rcPrint = () => {
    const area = document.getElementById('rc-preview');
    const card = area?.querySelector('.rc-card,.annual-report-card');
    if (!card) { showToast('No report card to print.','warning'); return; }
    const w = window.open('','_blank','width=1100,height=900');
    if (!w) return;
    w.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><style>${_CSS}</style></head><body>${card.outerHTML}</body></html>`);
    w.document.close();
    setTimeout(()=>w.print(),400);
    if (typeof createReportCardSnapshot==='function')
        createReportCardSnapshot(_rcStudentId,_rcType,card.outerHTML).catch(()=>{});
};

window.rcPrintAll = () => {
    const students=_rcRoster();
    if (!students.length){showToast('No students in class.','warning');return;}
    const html=students.map(s=>_rcBuild(s.id)).join('');
    const w=window.open('','_blank','width=1100,height=900');
    if(!w) return;
    w.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><style>${_CSS}</style></head><body>${html}</body></html>`);
    w.document.close();
    setTimeout(()=>w.print(),600);
};

window.renderReportCards  = renderReportCards;
window.destroyReportCards = ()=>{};
