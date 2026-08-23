/* ═══════════════════════════════════════════════════════════════════
   js/modules/holidays/holidays-reports.js
   Holiday report cards — pre-midterm format.
   Uses session_subjects, session_teacher_assignments, holiday_marks.
   Every report tagged with holiday_session_id — never mixed.
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

let _hrSessionId = null, _hrClassId = null, _hrStudentId = null;

async function renderHolidaysReports(container, params = {}) {
    if (!container) return;
    await ensureStateLoaded();
    const sessions = state.holidaySessions || [];
    _hrSessionId = params.sessionId || getActiveHolidaySessionId() || sessions[0]?.id || null;
    if (_hrSessionId && !(state.sessionClasses||[]).some(c => c.holiday_session_id === _hrSessionId))
        await loadDataForHolidaySession(_hrSessionId);
    if (!sessions.length) {
        container.innerHTML = `<div class="module-wrap"><div class="section-card">
            <div class="empty-state" style="padding:60px;">
            <div class="es-title">No Holiday Sessions</div>
            <div class="es-sub">Create a holiday session in Settings first.</div>
            </div></div></div>`;
        return;
    }
    _hrShell(container, sessions);
}

function _hrShell(container, sessions) {
    const cur     = sessions.find(s => s.id === _hrSessionId) || sessions[0];
    const classes = (state.sessionClasses || []).filter(c => c.holiday_session_id === _hrSessionId);
    container.innerHTML = `
    <div class="module-wrap">
      <div class="mod-topbar">
        <div class="mod-topbar-left">
          <h1 class="mod-title"><i class="fa-solid fa-file-lines"></i> Holiday Reports</h1>
          <span class="badge" style="background:rgba(217,119,6,.15);color:#d97706;margin-left:8px;">
            <i class="fa-solid fa-umbrella-beach"></i> ${esc(cur?.name || '—')}</span>
        </div>
        <div class="mod-topbar-right">
          <select class="select select-sm" onchange="hrPickSession(parseInt(this.value))">
            ${sessions.map(s => `<option value="${s.id}"${s.id === _hrSessionId ? ' selected' : ''}>
              ${esc(s.name)}${s.status === 'active' ? ' ●' : ''}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="two-col-grid" style="gap:16px;">
        <div class="section-card" style="min-width:220px;max-width:280px;">
          <div class="section-header"><h3><i class="fa-solid fa-users"></i> Select Student</h3></div>
          <div class="form-group" style="margin-bottom:10px;">
            <label class="field-label">Holiday Class</label>
            <select class="select" onchange="hrSelectClass(parseInt(this.value))">
              <option value="">— Select class —</option>
              ${classes.map(c => `<option value="${c.id}"${c.id === _hrClassId ? ' selected' : ''}>${esc(c.name)}</option>`).join('')}
            </select>
          </div>
          <div id="hr-student-list">
            <div style="color:var(--text-muted);font-size:13px;padding:8px;">Select a class first.</div>
          </div>
        </div>
        <div class="section-card" style="flex:1;">
          <div id="hr-report-area">
            <div class="empty-state" style="padding:40px;">
              <div class="es-icon"><i class="fa-solid fa-file-lines" style="font-size:48px;opacity:.25;"></i></div>
              <div class="es-title">Select a student to preview their report</div>
            </div>
          </div>
        </div>
      </div>
    </div>`;
    if (_hrClassId) hrSelectClass(_hrClassId);
}

window.hrPickSession = async id => {
    _hrSessionId = id; _hrClassId = null; _hrStudentId = null;
    await loadDataForHolidaySession(id);
    _hrShell(document.getElementById('moduleContent') ||
        document.querySelector('.module-wrap')?.parentElement, state.holidaySessions || []);
};

window.hrSelectClass = classId => {
    _hrClassId = classId || null; _hrStudentId = null;
    const enrollments = (state.holidayEnrollments || []).filter(e =>
        e.holiday_session_id === _hrSessionId && e.session_class_id === _hrClassId);
    const students = (state.students || []).filter(s => enrollments.some(e => e.student_id === s.id))
        .sort((a, b) => (a.last_name || '').localeCompare(b.last_name || ''));
    const el = document.getElementById('hr-student-list');
    if (!el) return;
    if (!students.length) {
        el.innerHTML = `<div style="color:var(--text-muted);font-size:13px;padding:8px;">No enrolled students.</div>`;
        return;
    }
    el.innerHTML = students.map(s => `
    <div style="cursor:pointer;padding:8px 10px;border-radius:6px;margin-bottom:2px;
         ${s.id === _hrStudentId ? 'background:rgba(255,255,255,.06);font-weight:700;' : ''}"
         onclick="hrSelectStudent(${s.id})">
      <div style="font-size:13px;">${esc(s.last_name)}, ${esc(s.first_name)}</div>
      <div style="font-size:11px;color:var(--text-muted);">${esc(s.code || '')}</div>
    </div>`).join('');
};

window.hrSelectStudent = studentId => {
    _hrStudentId = studentId;
    hrSelectClass(_hrClassId);
    const area = document.getElementById('hr-report-area');
    if (area) area.innerHTML = _hrBuildReport(studentId);
};

function _hrBuildReport(studentId) {
    const student = getStudent(studentId);
    if (!student) return '<div class="empty-state"><div class="es-title">Student not found</div></div>';
    const session   = (state.holidaySessions || []).find(s => s.id === _hrSessionId);
    const cls       = (state.sessionClasses || []).find(c => c.id === _hrClassId);
    const subjects  = (state.sessionSubjects || []).filter(s => s.session_class_id === _hrClassId);
    const assmnts   = (state.sessionAssessments || []).filter(a =>
        a.session_class_id === _hrClassId && a.holiday_session_id === _hrSessionId);

    // marks per subject
    const markMap = {};
    (state.holidayMarks || [])
        .filter(m => m.student_id === studentId && m.holiday_session_id === _hrSessionId)
        .forEach(m => {
            const a = assmnts.find(x => x.id === m.session_assessment_id);
            if (!a) return;
            if (!markMap[a.session_subject_id]) markMap[a.session_subject_id] = [];
            markMap[a.session_subject_id].push({ ...m, assessment: a });
        });

    const subjectRows = subjects.map(subj => {
        const marks  = markMap[subj.id] || [];
        const valid  = marks.filter(m => !m.is_absent && m.score != null);
        const total  = valid.reduce((s, m) => s + Number(m.score), 0);
        const maxTot = valid.reduce((s, m) => s + Number(m.assessment.max_marks || 0), 0);
        const pct    = maxTot > 0 ? (total / maxTot) * 100 : null;
        return { subj, marks, total, maxTot, pct,
            grade: pct !== null ? (typeof getGrade === 'function' ? getGrade(pct) : '—') : '—' };
    });

    const validRows = subjectRows.filter(r => r.pct !== null);
    const avgPct    = validRows.length ? validRows.reduce((s, r) => s + r.pct, 0) / validRows.length : null;
    const overall   = avgPct !== null ? (typeof getGrade === 'function' ? getGrade(avgPct) : '—') : '—';
    const rank      = _hrComputeRank(studentId, subjectRows);
    const s         = state.schoolSettings || {};

    // Assessment header columns (max 6 columns)
    const assHeaders = assmnts.slice(0, 6).map(a =>
        `<th class="text-center" style="font-size:11px;min-width:60px;">
          ${esc(a.name.slice(0, 8))}<br>
          <span style="font-weight:400;opacity:.6;">/${a.max_marks}</span>
        </th>`).join('');

    const tableRows = subjectRows.map(r => {
        const cells = r.marks.map(m =>
            `<td class="text-center" style="font-size:12px;">
              ${m.is_absent ? 'ABS' : (m.score != null ? `${m.score}/${m.assessment.max_marks}` : '—')}
            </td>`).join('');
        const col = r.pct === null ? '' : r.pct >= 80 ? 'color:#16a34a;' : r.pct < 50 ? 'color:#dc2626;' : '';
        return `<tr>
          <td style="font-weight:600;font-size:13px;">${esc(r.subj.name)}</td>
          ${cells}
          <td class="text-center" style="font-weight:700;${col}">${r.pct !== null ? fmtPct(r.pct, 1) : '—'}</td>
          <td class="text-center" style="font-weight:700;${col}">${esc(r.grade)}</td>
        </tr>`;
    }).join('');

    const avgCol = avgPct === null ? '' : avgPct >= 50 ? 'color:#16a34a;' : 'color:#dc2626;';

    return `
    <div class="holiday-report-card" style="background:#fff;color:#1e293b;border-radius:10px;
         padding:24px;font-family:'Segoe UI',sans-serif;">
      <div style="text-align:center;border-bottom:2px solid #1a3a5c;padding-bottom:12px;margin-bottom:14px;">
        <div style="font-size:18px;font-weight:800;color:#1a3a5c;">${esc(s.school_name || 'ECOLE LA FONTAINE')}</div>
        <div style="font-size:11px;color:#64748b;">${esc(s.school_address || 'Rubavu, Rwanda')}</div>
        <div style="margin-top:6px;font-size:14px;font-weight:700;color:#d97706;">
          <i class="fa-solid fa-umbrella-beach"></i>
          HOLIDAY PROGRAMME RESULT — ${esc(session?.name || '')}
        </div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;font-size:12px;
           background:#f8fafc;border-radius:6px;padding:10px 14px;margin-bottom:14px;">
        <div><strong>Name:</strong> ${esc(student.first_name)} ${esc(student.last_name)}</div>
        <div><strong>Code:</strong> ${esc(student.code || '—')}</div>
        <div><strong>Holiday Class:</strong> ${esc(cls?.name || '—')}</div>
        <div><strong>Date:</strong> ${typeof fmtDate === 'function' ? fmtDate(new Date().toISOString().split('T')[0]) : new Date().toLocaleDateString()}</div>
        <div><strong>Session:</strong> ${esc(session?.name || '—')}</div>
        <div><strong>Rank:</strong> ${rank}</div>
      </div>
      <table style="width:100%;border-collapse:collapse;font-size:12px;margin-bottom:12px;">
        <thead>
          <tr style="background:#1a3a5c;color:#fff;">
            <th style="text-align:left;padding:6px 8px;">Subject</th>
            ${assHeaders}
            <th class="text-center" style="padding:6px 8px;">Average %</th>
            <th class="text-center" style="padding:6px 8px;">Grade</th>
          </tr>
        </thead>
        <tbody>${tableRows || `<tr><td colspan="10" style="text-align:center;padding:16px;color:#94a3b8;">No marks recorded yet.</td></tr>`}</tbody>
        <tfoot>
          <tr style="background:#f1f5f9;font-weight:700;">
            <td style="padding:6px 8px;">OVERALL</td>
            ${assmnts.slice(0, 6).map(() => '<td></td>').join('')}
            <td class="text-center" style="${avgCol}">${avgPct !== null ? fmtPct(avgPct, 1) : '—'}</td>
            <td class="text-center">${esc(overall)}</td>
          </tr>
        </tfoot>
      </table>
      <div style="display:flex;justify-content:space-between;align-items:flex-end;
           border-top:1px solid #e2e8f0;padding-top:12px;font-size:11px;color:#64748b;">
        <div><strong>${esc(s.head_teacher_name || 'Head Teacher')}</strong><br>Head of School</div>
        <div style="text-align:right;">Done: ${new Date().toLocaleDateString('en-GB')}</div>
      </div>
    </div>
    <div style="display:flex;gap:8px;margin-top:12px;">
      <button class="btn btn-primary" onclick="hrPrint(${studentId})">
        <i class="fa-solid fa-print"></i> Print</button>
      <button class="btn btn-secondary" onclick="hrPrintAll()">
        <i class="fa-solid fa-layer-group"></i> Print All Class</button>
    </div>`;
}

function _hrComputeRank(studentId, myRows) {
    const myAvg = _hrAvg(myRows);
    if (myAvg === null) return '—';
    const enrollments = (state.holidayEnrollments || []).filter(e =>
        e.holiday_session_id === _hrSessionId && e.session_class_id === _hrClassId);
    const avgs = enrollments.map(e => {
        if (e.student_id === studentId) return myAvg;
        return _hrAvg(_hrRowsForStudent(e.student_id));
    }).filter(a => a !== null).sort((a, b) => b - a);
    const pos = avgs.findIndex(a => Math.abs(a - myAvg) < 0.01) + 1;
    const sfx = pos === 1 ? 'st' : pos === 2 ? 'nd' : pos === 3 ? 'rd' : 'th';
    return `${pos}${sfx} of ${avgs.length}`;
}

function _hrRowsForStudent(studentId) {
    const subjects = (state.sessionSubjects || []).filter(s => s.session_class_id === _hrClassId);
    const assmnts  = (state.sessionAssessments || []).filter(a =>
        a.session_class_id === _hrClassId && a.holiday_session_id === _hrSessionId);
    const markMap  = {};
    (state.holidayMarks || [])
        .filter(m => m.student_id === studentId && m.holiday_session_id === _hrSessionId)
        .forEach(m => {
            const a = assmnts.find(x => x.id === m.session_assessment_id);
            if (!a) return;
            if (!markMap[a.session_subject_id]) markMap[a.session_subject_id] = [];
            markMap[a.session_subject_id].push({ ...m, assessment: a });
        });
    return subjects.map(subj => {
        const marks  = markMap[subj.id] || [];
        const valid  = marks.filter(m => !m.is_absent && m.score != null);
        const total  = valid.reduce((s, m) => s + Number(m.score), 0);
        const maxTot = valid.reduce((s, m) => s + Number(m.assessment.max_marks || 0), 0);
        return { pct: maxTot > 0 ? (total / maxTot) * 100 : null };
    });
}

function _hrAvg(rows) {
    const valid = rows.filter(r => r.pct !== null);
    return valid.length ? valid.reduce((s, r) => s + r.pct, 0) / valid.length : null;
}

window.hrPrint = studentId => {
    const area = document.getElementById('hr-report-area');
    if (!area) return;
    const card = area.querySelector('.holiday-report-card');
    if (!card) return;
    const w = window.open('', '_blank', 'width=800,height=1000');
    if (!w) return;
    w.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css"/>
    <style>body{margin:20px;font-family:'Segoe UI',sans-serif;}
    .text-center{text-align:center;}table{border-collapse:collapse;width:100%;}
    th,td{padding:5px 8px;border:1px solid #e2e8f0;}</style>
    </head><body>${card.outerHTML}</body></html>`);
    w.document.close();
    setTimeout(() => { w.print(); }, 400);
};

window.hrPrintAll = () => {
    const enrollments = (state.holidayEnrollments || []).filter(e =>
        e.holiday_session_id === _hrSessionId && e.session_class_id === _hrClassId);
    const students = (state.students || []).filter(s => enrollments.some(e => e.student_id === s.id));
    if (!students.length) { showToast('No enrolled students.', 'warning'); return; }
    const allHTML = students.map(s => _hrBuildReport(s.id)).join('<div style="page-break-after:always;"></div>');
    const w = window.open('', '_blank', 'width=800,height=1100');
    if (!w) return;
    w.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css"/>
    <style>body{margin:20px;font-family:'Segoe UI',sans-serif;}
    .text-center{text-align:center;}table{border-collapse:collapse;width:100%;}
    th,td{padding:5px 8px;border:1px solid #e2e8f0;}</style>
    </head><body>${allHTML}</body></html>`);
    w.document.close();
    setTimeout(() => { w.print(); }, 600);
};

window.renderHolidaysReports = renderHolidaysReports;
