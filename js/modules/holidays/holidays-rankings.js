/* ═══════════════════════════════════════════════════════════════════
   js/modules/holidays/holidays-rankings.js
   Rankings within holiday session classes.
   Ranked by average % across all session subjects.
   Every ranking tagged with holiday_session_id — never mixed.
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

let _hrkSessionId = null, _hrkClassId = null;

async function renderHolidaysRankings(container, params = {}) {
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
    _hrkSessionId = params.sessionId || getActiveHolidaySessionId() || sessions[0]?.id || null;
    if (_hrkSessionId && !(state.sessionClasses || []).some(c => c.holiday_session_id === _hrkSessionId))
        await loadDataForHolidaySession(_hrkSessionId);
    if (!sessions.length) {
        container.innerHTML = `<div class="module-wrap"><div class="section-card">
            <div class="empty-state" style="padding:60px;">
            <div class="es-title">No Holiday Sessions</div>
            <div class="es-sub">Create a holiday session in Settings first.</div>
            </div></div></div>`;
        return;
    }
    _hrkShell(container, sessions);
}

function _hrkShell(container, sessions) {
    const cur     = sessions.find(s => s.id === _hrkSessionId) || sessions[0];
    const classes = (state.sessionClasses || []).filter(c => c.holiday_session_id === _hrkSessionId);
    container.innerHTML = `
    <div class="module-wrap">
      <div class="mod-topbar">
        <div class="mod-topbar-left">
          <h1 class="mod-title"><i class="fa-solid fa-trophy"></i> Holiday Rankings</h1>
          <span class="badge" style="background:rgba(217,119,6,.15);color:#d97706;margin-left:8px;">
            <i class="fa-solid fa-umbrella-beach"></i> ${esc(cur?.name || '—')}</span>
        </div>
        <div class="mod-topbar-right">
          <select class="select select-sm" onchange="hrkPickSession(parseInt(this.value))">
            ${sessions.map(s => `<option value="${s.id}"${s.id === _hrkSessionId ? ' selected' : ''}>
              ${esc(s.name)}${s.status === 'active' ? ' ●' : ''}</option>`).join('')}
          </select>
          ${_hrkClassId ? `
          <button class="btn btn-secondary btn-sm" onclick="hrkExport()">
            <i class="fa-solid fa-download"></i> Export</button>` : ''}
        </div>
      </div>

      <div class="tabs" style="margin-bottom:0;">
        ${classes.length ? classes.map(c => `
        <button class="tab-btn${c.id === _hrkClassId ? ' active' : ''}"
                onclick="hrkSelectClass(${c.id})">
          ${esc(c.name)}
        </button>`).join('') : `<span style="color:var(--text-muted);padding:8px 16px;font-size:13px;">
          No holiday classes in this session</span>`}
      </div>

      <div class="section-card" style="border-top-left-radius:0;margin-top:0;">
        <div id="hrk-body">
          ${!_hrkClassId ? `<div class="empty-state" style="padding:40px;">
            <div class="es-title">Select a class above to view rankings</div>
          </div>` : ''}
        </div>
      </div>
    </div>`;

    if (_hrkClassId) _hrkRender();
}

window.hrkPickSession = async id => {
    _hrkSessionId = id; _hrkClassId = null;
    await loadDataForHolidaySession(id);
    _hrkShell(
        document.getElementById('moduleContent') ||
        document.querySelector('.module-wrap')?.parentElement,
        state.holidaySessions || []
    );
};

window.hrkSelectClass = id => {
    _hrkClassId = id;
    _hrkShell(
        document.getElementById('moduleContent') ||
        document.querySelector('.module-wrap')?.parentElement,
        state.holidaySessions || []
    );
    _hrkRender();
};

function _hrkRender() {
    const el = document.getElementById('hrk-body');
    if (!el) return;

    const enrollments = (state.holidayEnrollments || []).filter(e =>
        e.holiday_session_id === _hrkSessionId && e.session_class_id === _hrkClassId);
    const students  = (state.students || []).filter(s =>
        enrollments.some(e => e.student_id === s.id));
    const subjects  = (state.sessionSubjects || []).filter(s =>
        s.session_class_id === _hrkClassId);
    const assmnts   = (state.sessionAssessments || []).filter(a =>
        a.session_class_id === _hrkClassId && a.holiday_session_id === _hrkSessionId);

    if (!students.length) {
        el.innerHTML = `<div class="empty-state" style="padding:40px;">
            <div class="es-title">No enrolled students</div>
            <div class="es-sub">Enroll students in Holiday Enrollment first.</div>
        </div>`;
        return;
    }
    if (!assmnts.length) {
        el.innerHTML = `<div class="empty-state" style="padding:40px;">
            <div class="es-title">No assessments yet</div>
            <div class="es-sub">Create assessments and enter marks first.</div>
        </div>`;
        return;
    }

    // Build mark index
    const markMap = {};
    (state.holidayMarks || [])
        .filter(m => m.session_class_id === _hrkClassId && m.holiday_session_id === _hrkSessionId)
        .forEach(m => { markMap[`${m.student_id}-${m.session_assessment_id}`] = m; });

    // Compute per-student average across all subjects
    const ranked = students.map(s => {
        const subjectAvgs = subjects.map(subj => {
            const subjAssmnts = assmnts.filter(a => a.session_subject_id === subj.id);
            const marks = subjAssmnts
                .map(a => markMap[`${s.id}-${a.id}`])
                .filter(m => m && !m.is_absent && m.score != null);
            if (!marks.length) return null;
            const total  = marks.reduce((sum, m) => sum + Number(m.score), 0);
            const maxTot = marks.reduce((sum, m) => {
                const a = assmnts.find(x => x.id === m.session_assessment_id);
                return sum + Number(a?.max_marks || 0);
            }, 0);
            return maxTot > 0 ? (total / maxTot) * 100 : null;
        }).filter(p => p !== null);

        const avgPct = subjectAvgs.length
            ? subjectAvgs.reduce((s, p) => s + p, 0) / subjectAvgs.length
            : null;
        return { student: s, avgPct, subjectAvgs };
    }).sort((a, b) => (b.avgPct ?? -1) - (a.avgPct ?? -1));

    // Assign ranks with tie handling
    ranked.forEach((r, i) => {
        r.rank = i > 0 && r.avgPct === ranked[i - 1].avgPct
            ? ranked[i - 1].rank
            : i + 1;
    });

    // Build table
    const subjHeaders = subjects.map(s =>
        `<th class="text-center" style="font-size:11px;min-width:70px;">${esc(s.name.slice(0, 8))}</th>`
    ).join('');

    const rowBg = ['rgba(250,204,21,.06)', 'rgba(156,163,175,.05)', 'rgba(180,120,60,.05)'];
    const medals = { 1: '<i class="fa-solid fa-medal" style="color:#f59e0b;font-size:18px;"></i>',
                     2: '<i class="fa-solid fa-medal" style="color:#94a3b8;font-size:18px;"></i>',
                     3: '<i class="fa-solid fa-medal" style="color:#b45309;font-size:18px;"></i>' };
    const sfx = n => n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th';

    const rows = ranked.map((r, i) => {
        const rankCell = medals[r.rank]
            ? medals[r.rank]
            : `<span style="font-weight:700;color:var(--text-muted);">${r.rank}${sfx(r.rank)}</span>`;
        const pctColor = r.avgPct === null ? '' : r.avgPct >= 80
            ? 'color:var(--color-success);' : r.avgPct < 50 ? 'color:var(--color-danger);' : '';
        const subjCells = r.subjectAvgs.map(pct => `
            <td class="text-center" style="font-size:12px;
              ${pct === null ? '' : pct >= 80 ? 'color:var(--color-success);' : pct < 50 ? 'color:var(--color-danger);' : ''}">
              ${pct !== null ? fmtPct(pct, 1) : '—'}
            </td>`).join('');
        return `<tr style="${rowBg[i] || ''}">
          <td style="text-align:center;width:50px;">${rankCell}</td>
          <td>
            <div class="student-name">${esc(r.student.last_name)}, ${esc(r.student.first_name)}</div>
            <div class="student-code">${esc(r.student.code || '')}</div>
          </td>
          ${subjCells}
          <td class="text-center" style="font-weight:800;font-size:14px;${pctColor}">
            ${r.avgPct !== null ? fmtPct(r.avgPct, 1) : '—'}
          </td>
          <td class="text-center" style="font-weight:700;${pctColor}">
            ${r.avgPct !== null ? esc(typeof getGrade === 'function' ? getGrade(r.avgPct) : '—') : '—'}
          </td>
        </tr>`;
    }).join('');

    const cls     = (state.sessionClasses || []).find(c => c.id === _hrkClassId);
    const session = (state.holidaySessions || []).find(s => s.id === _hrkSessionId);

    el.innerHTML = `
    <div style="margin-bottom:12px;display:flex;justify-content:space-between;align-items:center;">
      <div>
        <div style="font-size:16px;font-weight:700;">${esc(cls?.name || 'Class')}</div>
        <div style="font-size:12px;color:var(--text-muted);">
          ${students.length} students · ${subjects.length} subjects · ${assmnts.length} assessments
        </div>
      </div>
      <div style="font-size:12px;color:var(--text-muted);">${esc(session?.name || '')}</div>
    </div>
    <div style="overflow-x:auto;">
      <table class="data-table">
        <thead>
          <tr>
            <th style="width:50px;text-align:center;">Rank</th>
            <th>Student</th>
            ${subjHeaders}
            <th class="text-center" style="min-width:70px;">Avg %</th>
            <th class="text-center" style="min-width:60px;">Grade</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    <div class="table-footer">
      <span>${ranked.length} student${ranked.length !== 1 ? 's' : ''} ranked</span>
    </div>`;
}

window.hrkExport = () => {
    const cls     = (state.sessionClasses || []).find(c => c.id === _hrkClassId);
    const session = (state.holidaySessions || []).find(s => s.id === _hrkSessionId);
    const enrolls = (state.holidayEnrollments || []).filter(e =>
        e.holiday_session_id === _hrkSessionId && e.session_class_id === _hrkClassId);
    const students = (state.students || []).filter(s => enrolls.some(e => e.student_id === s.id));
    const subjects = (state.sessionSubjects || []).filter(s => s.session_class_id === _hrkClassId);
    const assmnts  = (state.sessionAssessments || []).filter(a =>
        a.session_class_id === _hrkClassId && a.holiday_session_id === _hrkSessionId);
    const markMap  = {};
    (state.holidayMarks || [])
        .filter(m => m.session_class_id === _hrkClassId && m.holiday_session_id === _hrkSessionId)
        .forEach(m => { markMap[`${m.student_id}-${m.session_assessment_id}`] = m; });

    const data = students.map(s => {
        const row = { 'Code': s.code || '', 'Last Name': s.last_name, 'First Name': s.first_name };
        subjects.forEach(subj => {
            const sa    = assmnts.filter(a => a.session_subject_id === subj.id);
            const marks = sa.map(a => markMap[`${s.id}-${a.id}`]).filter(m => m && !m.is_absent && m.score != null);
            const tot   = marks.reduce((sum, m) => sum + Number(m.score), 0);
            const maxT  = marks.reduce((sum, m) => {
                const a = assmnts.find(x => x.id === m.session_assessment_id);
                return sum + Number(a?.max_marks || 0);
            }, 0);
            row[`${subj.name} Avg%`] = maxT > 0 ? ((tot / maxT) * 100).toFixed(1) : '—';
        });
        return row;
    });

    if (typeof exportAsCSV === 'function')
        exportAsCSV(data, `HolidayRankings_${cls?.name || ''}_${session?.name || ''}`);
    else showToast('Export not available.', 'warning');
};

window.renderHolidaysRankings = renderHolidaysRankings;
