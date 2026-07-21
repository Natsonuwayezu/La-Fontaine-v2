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
   ═══════════════════════════════════════════════════════════════════ */

const StudentDetails = (() => {

  // MOCK_DATA — same shape core/api.js will return for a single student
  const MOCK_STUDENT_LOOKUP = {
    'STU-2024-0012': {
      id: 'STU-2024-0012', name: 'MUGISHA Jean', classId: 'Primary 4A', status: 'active',
      gender: 'M', dob: '2016-03-14', guardianName: 'MUGISHA Emmanuel', guardianPhone: '+250 788 123 456',
      feeStatus: 'partial', balance: '35,000 RWF', average: 74, attendanceRate: 92
    }
  };

  function escapeHTML(str) {
    const div = document.createElement('div');
    div.textContent = str ?? '';
    return div.innerHTML;
  }

  function initials(name) {
    return name.split(' ').map(w => w[0]).slice(0, 2).join('');
  }

  function fetchStudent(studentId) {
    // TODO(api): replace with core/api.js lookup
    return MOCK_STUDENT_LOOKUP[studentId] || {
      id: studentId, name: 'Unknown Student', classId: '\u2014', status: 'active',
      gender: '\u2014', dob: '\u2014', guardianName: '\u2014', guardianPhone: '\u2014',
      feeStatus: 'unpaid', balance: '\u2014', average: 0, attendanceRate: 0
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
              <span class="student-status-badge ${s.status}">${s.status}</span>
              <span class="fee-status-chip ${s.feeStatus}">${s.feeStatus}</span>
            </div>
          </div>
        </div>
        <div class="profile-info-grid" style="grid-template-columns:1fr 1fr;">
          <div class="profile-info-item"><span class="k">Gender</span><span class="v">${s.gender === 'M' ? 'Male' : (s.gender === 'F' ? 'Female' : '\u2014')}</span></div>
          <div class="profile-info-item"><span class="k">Date of Birth</span><span class="v">${escapeHTML(s.dob)}</span></div>
          <div class="profile-info-item"><span class="k">Guardian</span><span class="v">${escapeHTML(s.guardianName)}</span></div>
          <div class="profile-info-item"><span class="k">Phone</span><span class="v">${escapeHTML(s.guardianPhone)}</span></div>
          <div class="profile-info-item"><span class="k">Fee Balance</span><span class="v" style="color:${s.feeStatus === 'unpaid' ? 'var(--danger)' : 'var(--card-text,#e2e8f0)'};">${escapeHTML(s.balance)}</span></div>
          <div class="profile-info-item"><span class="k">Class Average</span><span class="v">${s.average}%</span></div>
        </div>
        <div class="stats-inline-bar" style="margin-top:12px;">
          <span style="font-size:0.72rem; color:var(--card-text-muted,#475569); min-width:90px;">Attendance</span>
          <div class="stats-inline-bar__track"><div class="stats-inline-bar__fill" style="width:${s.attendanceRate}%; background:var(--attendance-accent, #f59e0b);"></div></div>
          <span class="stats-inline-bar__value">${s.attendanceRate}%</span>
        </div>
      `,
      footer: `
        <button class="btn btn-outline" data-modal-close>Close</button>
        <button class="btn btn-primary" data-open-full>Open Full Profile</button>
      `,
      onMount(modal, record) {
        modal.querySelector('[data-open-full]').addEventListener('click', () => {
          window.Modals?.close(record);
          window.Router?.navigate('student-profile', { studentId: s.id });
        });
      }
    };
  });

  let _activeStudent = null;

  function open(studentId) {
    _activeStudent = fetchStudent(studentId);
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
// window.StudentDetails was never assigned anywhere in this file, and the router
// looks up window.renderStudentDetails specifically (see core/router.js's
// moduleIdToRenderFn) — this page was completely unreachable via navigation
// despite being fully built.
window.StudentDetails = StudentDetails;
window.renderStudentDetails = StudentDetails.render;
