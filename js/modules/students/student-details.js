/* ═══════════════════════════════════════════════════════════════════
   js/modules/students/student-details.js
   ═══════════════════════════════════════════════════════════════════
   A quick-peek drawer, NOT the full profile page (that's
   student-profile.js). Opened from a student-list row or anywhere
   else a fast glance is more useful than a full navigation — shows
   just the essentials with a "Open Full Profile" button.

   StudentDetails.open(studentId)
   Also handles the 'student-details' route directly (router passing
   { studentId } falls through to open() then redirects back, since
   this is a drawer, not really a full page).

   Reads the real state.students/studentFees/creditBalances/marks/
   assessments, plus a lightweight on-demand fetch of this one
   student's attendance records for the active term (attendance isn't
   part of global state — every real attendance module queries it
   directly, so this follows the same pattern rather than caching a
   whole extra table just for a summary bar).

   Last updated: 2026-07-29
   ═══════════════════════════════════════════════════════════════════ */

const StudentDetails = (() => {

  function escapeHTML(str) {
    const div = document.createElement('div');
    div.textContent = str ?? '';
    return div.innerHTML;
  }

  function initials(name) {
    return name.split(' ').map(w => w[0]).slice(0, 2).join('');
  }

  async function fetchStudent(studentId) {
    const raw = (state.students || []).find(s => s.id === studentId);
    if (!raw) {
      return {
        id: studentId, name: 'Unknown Student', classId: '—', status: 'Active',
        gender: '—', dob: '—', guardianName: '—', guardianPhone: '—',
        feeStatus: 'unknown', balance: '—', average: 0, attendanceRate: null,
      };
    }

    const classMap = new Map((state.classes || []).map(c => [c.id, c.name]));
    const yearId = window.getActiveYearId ? window.getActiveYearId() : null;
    const termId = window.getActiveTermId ? window.getActiveTermId() : null;

    // Fees
    const myFees = (state.studentFees || []).filter(f => f.student_id === raw.id && (!yearId || f.academic_year_id === yearId));
    const creditRow = (state.creditBalances || []).find(c => c.student_id === raw.id);
    const credit = creditRow ? Number(creditRow.credit_amount || 0) : 0;
    const summary = computeStudentFeeSummary(myFees, credit);
    const feeStatus = !myFees.length ? 'unknown' : summary.isFullyPaid ? 'paid' : summary.paid > 0 ? 'partial' : 'unpaid';

    // Academics: average % across real marks in the active term
    const termAssessmentIds = new Set((state.assessments || []).filter(a => !termId || String(a.term_id) === String(termId)).map(a => a.id));
    const myMarks = (state.marks || []).filter(m => m.student_id === raw.id && termAssessmentIds.has(m.assessment_id) && !m.is_absent && m.score !== null && m.score !== undefined);
    const pcts = myMarks.map(m => {
      const a = (state.assessments || []).find(x => x.id === m.assessment_id);
      return a?.max_score ? (m.score / a.max_score) * 100 : null;
    }).filter(p => p !== null);
    const average = pcts.length ? Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length) : 0;

    // Attendance: real on-demand fetch (not part of global state)
    let attendanceRate = null;
    try {
      const filters = [`student_id=eq.${raw.id}`];
      if (termId) filters.push(`term_id=eq.${termId}`);
      const records = await window.getWhere('attendance', filters.join('&'));
      if (records && records.length) {
        attendanceRate = computeAttendanceRate(countAttendance(records));
      }
    } catch (err) {
      console.warn('[StudentDetails] attendance fetch failed:', err.message);
    }

    return {
      id: raw.id,
      name: `${raw.first_name || ''} ${raw.last_name || ''}`.trim() || `Student #${raw.id}`,
      classId: classMap.get(raw.class_id) || '—',
      status: raw.status || 'Active',
      gender: raw.gender,
      dob: raw.date_of_birth,
      guardianName: raw.guardian_name || '—',
      guardianPhone: raw.guardian_phone || '—',
      feeStatus,
      balance: fmtCurrency(summary.outstanding),
      average,
      attendanceRate,
    };
  }

  window.Modals?.register('student-details-drawer', () => {
    const s = _activeStudent;
    return {
      title: s.name,
      subtitle: `${s.id} \u00b7 ${s.classId}`,
      size: 'sm',
      body: `
        <div style="display:flex; align-items:center; gap:14px; margin-bottom:16px;">
          <div class="student-card__avatar" style="margin:0;">${escapeHTML(initials(s.name))}</div>
          <div>
            <div style="display:flex; gap:6px;">
              <span class="student-status-badge ${escapeHTML((s.status || '').toLowerCase())}">${escapeHTML(s.status)}</span>
              <span class="fee-status-chip ${escapeHTML(s.feeStatus)}">${escapeHTML(s.feeStatus)}</span>
            </div>
          </div>
        </div>
        <div class="profile-info-grid" style="grid-template-columns:1fr 1fr;">
          <div class="profile-info-item"><span class="k">Gender</span><span class="v">${s.gender === 'M' ? 'Male' : (s.gender === 'F' ? 'Female' : '\u2014')}</span></div>
          <div class="profile-info-item"><span class="k">Date of Birth</span><span class="v">${s.dob ? esc(fmtDate(s.dob)) : '\u2014'}</span></div>
          <div class="profile-info-item"><span class="k">Guardian</span><span class="v">${escapeHTML(s.guardianName)}</span></div>
          <div class="profile-info-item"><span class="k">Phone</span><span class="v">${escapeHTML(s.guardianPhone)}</span></div>
          <div class="profile-info-item"><span class="k">Fee Balance</span><span class="v" style="color:${s.feeStatus === 'unpaid' ? 'var(--danger)' : 'var(--card-text,#e2e8f0)'};">${escapeHTML(s.balance)}</span></div>
          <div class="profile-info-item"><span class="k">Class Average</span><span class="v">${s.average}%</span></div>
        </div>
        ${s.attendanceRate !== null ? `
        <div class="stats-inline-bar" style="margin-top:12px;">
          <span style="font-size:0.72rem; color:var(--card-text-muted,#475569); min-width:90px;">Attendance</span>
          <div class="stats-inline-bar__track"><div class="stats-inline-bar__fill" style="width:${s.attendanceRate}%; background:var(--attendance-accent, #f59e0b);"></div></div>
          <span class="stats-inline-bar__value">${s.attendanceRate}%</span>
        </div>` : ''}
      `,
      footer: `
        <button class="btn btn-outline" data-modal-close>Close</button>
        <button class="btn btn-primary" data-open-full>Open Full Profile</button>
      `,
      onMount(modal, record) {
        modal.querySelector('[data-open-full]').addEventListener('click', () => {
          window.Modals?.close(record);
          window.navigateTo('student-profile', { studentId: s.id });
        });
      }
    };
  });

  let _activeStudent = null;

  async function open(studentId) {
    _activeStudent = await fetchStudent(studentId);
    window.Modals?.open('student-details-drawer');
  }

  // Router support: if 'student-details' is ever navigated to directly
  // (rather than opened as a drawer), just open the drawer over
  // whatever's currently on screen and let the router's history stay put.
  function render(container, params) {
    open(params?.studentId);
  }

  return { open, render };
})();

// ─── EXPOSE ─────────────────────────────────────────────────────────

window.StudentDetails = StudentDetails;
window.renderStudentDetails = StudentDetails.render;
