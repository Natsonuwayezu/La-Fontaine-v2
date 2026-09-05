/* ═══════════════════════════════════════════════════════════════════
   js/modules/students/student-profile.js
   ═══════════════════════════════════════════════════════════════════
   The full profile page (student-details.js is the quick-peek drawer;
   this is the destination "Open Full Profile" navigates to). Tabs:
   Overview, Academics, Fees, Family, Documents.

   Reads real state.students/classes/subjects/marks/assessments/
   studentFees/payments/creditBalances. The Fees tab's payment-recording
   panel mirrors js/modules/finance/record-payment.js's real commit
   logic (same field names, same credit-balance handling fixed there)
   rather than a simplified stand-in — recording a payment from here
   writes the same real rows that page does.

   Last updated: 2026-07-29
   ═══════════════════════════════════════════════════════════════════ */

const StudentProfile = (() => {

  function escapeHTML(str) {
    const div = document.createElement('div');
    div.textContent = str ?? '';
    return div.innerHTML;
  }

  function initials(name) {
    return name.split(' ').map(w => w[0]).slice(0, 2).join('');
  }

  // ─── DATA ────────────────────────────────────────────────────────

  function buildView(s) {
    const classMap = new Map((state.classes || []).map(c => [c.id, c.name]));
    const subjectMap = new Map((state.subjects || []).map(sub => [sub.id, sub.name]));
    const yearId = window.getActiveYearId ? window.getActiveYearId() : null;
    const termId = window.getActiveTermId ? window.getActiveTermId() : null;

    // ── Academics: real marks for this student in the active term ──
    const termAssessmentIds = new Set(
      (state.assessments || []).filter(a => !termId || String(a.term_id) === String(termId)).map(a => a.id)
    );
    const myMarks = (state.marks || []).filter(m => m.student_id === s.id && termAssessmentIds.has(m.assessment_id) && !m.is_absent && m.score !== null && m.score !== undefined);

    const bySubject = new Map();
    myMarks.forEach(m => {
      const a = (state.assessments || []).find(x => x.id === m.assessment_id);
      if (!a) return;
      const pct = a.max_score ? (m.score / a.max_score) * 100 : 0;
      if (!bySubject.has(a.subject_id)) bySubject.set(a.subject_id, []);
      bySubject.get(a.subject_id).push(pct);
    });
    const subjects = [...bySubject.entries()].map(([subjectId, pcts]) => ({
      name: subjectMap.get(subjectId) || `Subject #${subjectId}`,
      score: Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length),
    })).sort((a, b) => a.name.localeCompare(b.name));
    const average = subjects.length ? Math.round(subjects.reduce((sum, x) => sum + x.score, 0) / subjects.length) : 0;

    // Class position — rank every student in the same class by total
    // real marks in the active term, using the same shared rankStudents()
    // the ranking-engine/report-cards logic uses.
    const classStudents = (state.students || []).filter(st => String(st.class_id) === String(s.class_id) && !st.is_deleted);
    const rankInput = classStudents.map(st => {
      const total = (state.marks || [])
        .filter(m => m.student_id === st.id && termAssessmentIds.has(m.assessment_id) && !m.is_absent && m.score !== null && m.score !== undefined)
        .reduce((sum, m) => sum + Number(m.score || 0), 0);
      return { id: st.id, first_name: st.first_name, last_name: st.last_name, total };
    });
    rankStudents(rankInput);
    const position = rankInput.find(r => r.id === s.id)?.rank || null;

    // ── Fees: real student_fees + payments + credit for this student ──
    const myFees = (state.studentFees || []).filter(f => f.student_id === s.id && (!yearId || f.academic_year_id === yearId));
    const unpaidFees = myFees.filter(f => !f.is_paid && !f.is_waived);
    const myPayments = (state.payments || [])
      .filter(p => p.student_id === s.id && !p.is_reversed)
      .sort((a, b) => String(b.payment_date || '').localeCompare(String(a.payment_date || '')));
    const creditRow = (state.creditBalances || []).find(c => c.student_id === s.id);
    const credit = creditRow ? Number(creditRow.credit_amount || 0) : 0;

    // ── Family: real siblings sharing the same family_id ──
    const family = s.family_id
      ? (state.students || []).filter(st => st.family_id === s.family_id && st.id !== s.id && !st.is_deleted)
        .map(st => ({ id: st.id, name: `${st.first_name || ''} ${st.last_name || ''}`.trim(), className: classMap.get(st.class_id) || '—' }))
      : [];

    // ── Guardian info from guardians table (joined via student_guardians) ──
      const guardianLinks = (state.studentGuardians || []).filter(g => g.student_id === s.id);
      const guardianIds   = guardianLinks.map(g => g.guardian_id).filter(Boolean);
      const allGuardians  = (state.guardians || []).filter(g => guardianIds.includes(g.id));
      const father = allGuardians.find(g => g.guardian_type === 'father' || guardianLinks.find(l => l.guardian_id === g.id && l.relationship === 'father')) || null;
      const mother = allGuardians.find(g => g.guardian_type === 'mother' || guardianLinks.find(l => l.guardian_id === g.id && l.relationship === 'mother')) || null;
      // Fallback to flat fields if guardians table not yet populated
      const primaryGuardian = father || mother || null;
      const guardianName    = primaryGuardian ? `${primaryGuardian.first_name || ''} ${primaryGuardian.last_name || ''}`.trim() : (s.guardian_name || '—');
      const guardianPhone   = primaryGuardian?.phone  || s.guardian_phone || '—';
      const guardianEmail   = primaryGuardian?.email  || s.guardian_email || '—';

      return {
      id: s.id,
      code: s.student_code || s.code || '',
      name: `${s.first_name || ''} ${s.last_name || ''}`.trim() || 'Unnamed Student',
      classId: s.class_id,
      className: classMap.get(s.class_id) || '—',
      status: s.status || 'Active',
      gender: s.gender || '—',
      dob: s.date_of_birth || '—',
      birthplace: s.birthplace || '—',
      nationality: s.nationality || '—',
      insurance: s.medical_insurance || '—',
      sdmsCode: s.sdms_code || '—',
      previousSchool: s.previous_school || '—',
      previousMarks: s.previous_school_marks != null ? s.previous_school_marks + '%' : '—',
      province: s.province || '—',
      district: s.district || '—',
      sector: s.sector || '—',
      cell: s.cell || '—',
      village: s.village || '—',
      address: [s.village, s.cell, s.sector, s.district, s.province].filter(Boolean).join(', ') || s.address || '—',
      enrollmentDate: s.enrollment_date || s.created_at?.slice(0, 10) || '—',
      academicYearId: s.academic_year_id || null,
      guardianName,
      guardianPhone,
      guardianEmail,
      guardians: allGuardians,
      father,
      mother,
      notes: s.notes || '',
      academics: { average, position, classSize: classStudents.length, subjects },
      fees: { unpaid: unpaidFees, all: myFees, history: myPayments, credit },
      family,
    };
  }

  // ─── RENDER ────────────────────────────────────────────────────────

  function render(container, params) {
    if (!container) return;

    const raw = (state.students || []).find(x => x.id === params?.studentId);
    if (!raw) {
      container.innerHTML = `
        <div class="dashboard-page">
          <div class="dash-card" style="max-width:480px;margin:40px auto;padding:24px;text-align:center;">
            <i class="fa-solid fa-user-slash" style="font-size:2rem;color:var(--text-soft);margin-bottom:12px;"></i>
            <p>Student not found.</p>
            <button class="btn btn-outline" id="profile-back-btn" style="margin-top:12px;">Back to Student List</button>
          </div>
        </div>
      `;
      container.querySelector('#profile-back-btn')?.addEventListener('click', () => window.navigateTo('student-list'));
      return;
    }

    const s = buildView(raw);

    container.innerHTML = `
      <div class="dashboard-page">
        <div class="profile-header">
          <div class="profile-header__avatar">${escapeHTML(initials(s.name))}</div>
          <div>
            <div class="profile-header__name">${escapeHTML(s.name)}</div>
            <div class="profile-header__meta">${escapeHTML(s.code)} \u00b7 ${escapeHTML(s.className)} \u00b7 <span class="student-status-badge ${escapeHTML(s.status.toLowerCase())}">${escapeHTML(s.status)}</span></div>
          </div>
          <div class="profile-header__actions">
            <button class="btn btn-outline" id="profile-edit-btn"><i class="fa-solid fa-pencil"></i> Edit</button>
            <button class="btn btn-primary" id="profile-report-btn"><i class="fa-solid fa-file-invoice"></i> Report Card</button>
          </div>
        </div>

        <div class="profile-tabs" data-tab-group data-panel-scope="#profile-panels">
          <span class="profile-tab" data-tab="overview">Overview</span>
          <span class="profile-tab" data-tab="academics">Academics</span>
          <span class="profile-tab" data-tab="fees">Fees</span>
          <span class="profile-tab" data-tab="family">Family</span>
          <span class="profile-tab" data-tab="documents">Documents</span>
        </div>

        <div id="profile-panels">
          <div data-tab-panel="overview">${overviewPanel(s)}</div>
          <div data-tab-panel="academics">${academicsPanel(s)}</div>
          <div data-tab-panel="fees">${feesPanel(s)}</div>
          <div data-tab-panel="family">${familyPanel(s)}</div>
          <div data-tab-panel="documents">${documentsPanel(s)}</div>
        </div>
      </div>
    `;

    window.Tabs?.init(container.querySelector('[data-tab-group]'));

    container.querySelector('#profile-report-btn').addEventListener('click', () => window.navigateTo('report-cards', { studentId: s.id }));
    const editBtn = container.querySelector('#profile-edit-btn');
    if (editBtn) editBtn.addEventListener('click', () => {
        if (typeof StudentDetails !== 'undefined') StudentDetails.openEdit(view.id);
        else if (typeof openStudentEdit === 'function') openStudentEdit(view.id);
    });

    wireFeesTab(container, s, raw);

    // student_fees/payments are lazily-loaded large tables — trigger a
    // load if this session hasn't already, then re-render with real
    // fee data once available.
    if ((!state.studentFees || state.studentFees.length === 0) || (!state.payments || state.payments.length === 0)) {
      Promise.all([
        (!state.studentFees || state.studentFees.length === 0) ? window.loadStudentFees?.() : Promise.resolve(),
        (!state.payments || state.payments.length === 0) ? window.loadPayments?.() : Promise.resolve(),
      ]).then(() => {
        if (container.isConnected) render(container, params);
      }).catch(() => {});
    }
  }

  // ─── PANELS ──────────────────────────────────────────────────────

  function _infoRow(k, v) {
    return `<div class="profile-info-item"><span class="k">${k}</span><span class="v">${escapeHTML(String(v||'—'))}</span></div>`;
  }

  function _guardianCard(title, icon, g) {
    if (!g) return '';
    const name = `${g.first_name||''} ${g.last_name||''}`.trim() || '—';
    return `<div class="dash-card" style="margin-bottom:10px;">
      <div class="dash-card-header">
        <span class="dash-card-title"><i class="fa-solid ${icon}"></i> ${title}</span>
      </div>
      <div class="dash-card-body">
        <div class="profile-info-grid">
          ${_infoRow('Name', name)}
          ${_infoRow('Phone', g.phone)}
          ${_infoRow('Email', g.email)}
          ${_infoRow('National ID', g.national_id)}
          ${_infoRow('Occupation', g.occupation)}
          ${_infoRow('Employer', g.employer)}
        </div>
      </div>
    </div>`;
  }

  function overviewPanel(s) {
    return `
      <div class="two-col">
        <!-- LEFT: full personal info -->
        <div>
          <div class="dash-card" style="margin-bottom:10px;">
            <div class="dash-card-header">
              <span class="dash-card-title"><i class="fa-solid fa-child"></i> Personal Information</span>
              <button class="btn btn-sm btn-ghost" onclick="StudentDetails.openEdit(${s.id})">
                <i class="fa-solid fa-pen"></i> Edit</button>
            </div>
            <div class="dash-card-body">
              <div class="profile-info-grid">
                ${_infoRow('Student Code', s.code)}
                ${_infoRow('Gender', s.gender)}
                ${_infoRow('Date of Birth', s.dob !== '—' && typeof fmtDate === 'function' ? fmtDate(s.dob) : s.dob)}
                ${_infoRow('Birthplace', s.birthplace)}
                ${_infoRow('Nationality', s.nationality)}
                ${_infoRow('Insurance', s.insurance)}
                ${_infoRow('SDMS Code', s.sdmsCode)}
                ${_infoRow('Previous School', s.previousSchool)}
                ${_infoRow('Prev. School Marks', s.previousMarks)}
                ${_infoRow('Enrollment Date', s.enrollmentDate)}
                ${_infoRow('Status', s.status)}
                ${_infoRow('Notes', s.notes)}
              </div>
            </div>
          </div>

          <div class="dash-card" style="margin-bottom:10px;">
            <div class="dash-card-header">
              <span class="dash-card-title"><i class="fa-solid fa-location-dot"></i> Home Location</span>
            </div>
            <div class="dash-card-body">
              <div class="profile-info-grid">
                ${_infoRow('Province', s.province)}
                ${_infoRow('District', s.district)}
                ${_infoRow('Sector', s.sector)}
                ${_infoRow('Cell', s.cell)}
                ${_infoRow('Village', s.village)}
              </div>
            </div>
          </div>
        </div>

        <!-- RIGHT: guardians -->
        <div>
          ${_guardianCard('Father', 'fa-person', s.father)}
          ${_guardianCard('Mother', 'fa-person-dress', s.mother)}
          ${!s.father && !s.mother ? `<div class="dash-card"><div class="dash-card-body" style="color:var(--text-soft);text-align:center;padding:24px;">
            <i class="fa-solid fa-person-circle-question" style="font-size:2rem;margin-bottom:8px;opacity:.4;"></i>
            <div>No guardian records found.</div>
            <div style="font-size:12px;margin-top:4px;">Guardian info will appear here after enrollment or editing.</div>
          </div></div>` : ''}
        </div>
      </div>
    `;
  }

  function academicsPanel(s) {
    if (!s.academics.subjects.length) {
      return `<div class="dash-card"><div class="dash-card-body" style="text-align:center;padding:32px;color:var(--text-soft);">No marks recorded yet for this term.</div></div>`;
    }
    return `
      <div class="stats-summary-row">
        <div class="stats-summary-tile"><div class="stats-summary-tile__value">${s.academics.average}%</div><div class="stats-summary-tile__label">Average</div></div>
        <div class="stats-summary-tile"><div class="stats-summary-tile__value">${s.academics.position ? `${s.academics.position}/${s.academics.classSize}` : '—'}</div><div class="stats-summary-tile__label">Class Position</div></div>
      </div>
      <div class="dash-card">
        <div class="dash-card-header"><span class="dash-card-title">Subject Breakdown</span></div>
        <div class="dash-card-body no-padding">
          <table class="data-table">
            <thead><tr><th>Subject</th><th style="text-align:center;">Score</th><th style="text-align:center;">Grade</th></tr></thead>
            <tbody>${s.academics.subjects.map(sub => `
              <tr><td>${escapeHTML(sub.name)}</td><td style="text-align:center;">${sub.score}%</td><td style="text-align:center;"><span class="badge ${getGrade(sub.score).cls}">${getGrade(sub.score).grade}</span></td></tr>
            `).join('')}</tbody>
          </table>
        </div>
      </div>
    `;
  }

  function getGrade(pct) {
    if (pct >= 90) return { grade: 'A+', cls: 'grade-Ap' };
    if (pct >= 80) return { grade: 'A', cls: 'grade-A' };
    if (pct >= 70) return { grade: 'B', cls: 'grade-B' };
    if (pct >= 60) return { grade: 'C', cls: 'grade-C' };
    if (pct >= 50) return { grade: 'D', cls: 'grade-D' };
    return { grade: 'F', cls: 'grade-F' };
  }

  function feesPanel(s) {
    const totalDue = s.fees.all.reduce((sum, f) => sum + computeFeeBalance(f).remaining, 0);
    return `
      <div class="two-col">
        <div class="dash-card">
          <div class="dash-card-header">
            <span class="dash-card-title">Fee Balance</span>
            <span class="dash-card-action" style="color:${totalDue > 0 ? 'var(--warning)' : 'var(--success)'};">${fmtCurrency(totalDue)} due${s.fees.credit > 0 ? ` \u00b7 ${fmtCurrency(s.fees.credit)} credit` : ''}</span>
          </div>
          <div class="dash-card-body no-padding">
            ${s.fees.all.length ? `
            <table class="data-table">
              <thead><tr><th>Fee</th><th style="text-align:right;">Total</th><th style="text-align:right;">Paid</th><th style="text-align:right;">Balance</th></tr></thead>
              <tbody>${s.fees.all.map(f => {
      const bal = computeFeeBalance(f);
      return `
                <tr>
                  <td>${escapeHTML(f.fee_name || '—')}</td>
                  <td style="text-align:right;">${fmtCurrency(bal.effective)}</td>
                  <td style="text-align:right;color:var(--success);">${fmtCurrency(bal.paid)}</td>
                  <td style="text-align:right;font-weight:600;">${fmtCurrency(bal.remaining)}</td>
                </tr>
              `;
    }).join('')}</tbody>
            </table>` : `<div style="padding:24px;text-align:center;color:var(--text-soft);">No fees assigned yet.</div>`}
          </div>
        </div>

        <div class="dash-card">
          <div class="dash-card-header"><span class="dash-card-title">Record a Payment</span></div>
          <div class="dash-card-body">
            <div class="payment-category-select" id="profile-fee-select"></div>
            <div class="payment-total-bar">
              <span class="payment-total-bar__label">Total to record</span>
              <span class="payment-total-bar__value" id="profile-fee-total">0 RWF</span>
            </div>
            <div class="field" style="margin-top:10px;">
              <label>Method</label>
              <select id="profile-payment-method" style="width:100%;">
                <option value="Cash">Cash</option>
                <option value="Mobile Money">Mobile Money</option>
                <option value="Bank Transfer">Bank Transfer</option>
                <option value="Cheque">Cheque</option>
              </select>
            </div>
            <div class="form-actions" style="margin-top:14px;">
              <button class="btn btn-primary" id="profile-record-payment-btn"><i class="fa-solid fa-money-bill-wave"></i> Record Payment</button>
            </div>
          </div>
        </div>
      </div>

      <div class="dash-card" style="margin-top:20px;">
        <div class="dash-card-header"><span class="dash-card-title">Payment History</span></div>
        <div class="dash-card-body no-padding">
          ${s.fees.history.length ? `
          <table class="data-table">
            <thead><tr><th>Date</th><th>Receipt</th><th>Method</th><th style="text-align:right;">Amount</th></tr></thead>
            <tbody>${s.fees.history.map(h => `
              <tr><td>${esc(fmtDate(h.payment_date))}</td><td>${escapeHTML(h.receipt_number || '—')}</td><td>${escapeHTML(h.payment_method || '—')}</td><td style="text-align:right; color:var(--success); font-weight:600;">${fmtCurrency(h.amount)}</td></tr>
            `).join('')}</tbody>
          </table>` : `<div style="padding:24px;text-align:center;color:var(--text-soft);">No payments recorded yet.</div>`}
        </div>
      </div>
    `;
  }

  function familyPanel(s) {
    // Guardian cards
    function guardianCard(title, icon, g) {
      if (!g) return '';
      const name = `${g.first_name||''} ${g.last_name||''}`.trim()||'—';
      return `<div class="dash-card" style="margin-bottom:10px;">
        <div class="dash-card-header">
          <span class="dash-card-title"><i class="fa-solid ${icon}"></i> ${title}</span>
        </div>
        <div class="dash-card-body">
          <div class="profile-info-grid">
            <div class="profile-info-item"><span class="k">Name</span><span class="v">${escapeHTML(name)}</span></div>
            <div class="profile-info-item"><span class="k">Phone</span><span class="v">${escapeHTML(g.phone||'—')}</span></div>
            <div class="profile-info-item"><span class="k">Email</span><span class="v">${escapeHTML(g.email||'—')}</span></div>
            <div class="profile-info-item"><span class="k">National ID</span><span class="v">${escapeHTML(g.national_id||'—')}</span></div>
            <div class="profile-info-item"><span class="k">Occupation</span><span class="v">${escapeHTML(g.occupation||'—')}</span></div>
            <div class="profile-info-item"><span class="k">Employer</span><span class="v">${escapeHTML(g.employer||'—')}</span></div>
          </div>
        </div>
      </div>`;
    }

    return `
      <div class="two-col">
        <div>
          <!-- Guardians -->
          ${guardianCard('Father', 'fa-person', s.father)}
          ${guardianCard('Mother', 'fa-person-dress', s.mother)}
          ${!s.father && !s.mother ? `<div class="dash-card"><div class="dash-card-body"
            style="text-align:center;padding:24px;color:var(--text-soft);">
            No guardian records found.</div></div>` : ''}
        </div>
        <div>
          <!-- Siblings -->
          <div class="dash-card">
            <div class="dash-card-header">
              <span class="dash-card-title">
                <i class="fa-solid fa-people-group"></i> Siblings
              </span>
            </div>
            <div class="dash-card-body">
              ${s.family.length ? s.family.map(f => `
                <div class="family-tree-node" style="margin-bottom:8px;cursor:pointer;display:flex;
                     align-items:center;gap:10px;padding:8px;border-radius:6px;
                     background:rgba(255,255,255,.03);border:1px solid var(--border);"
                     data-goto-student="${f.id}">
                  <div style="width:36px;height:36px;border-radius:50%;background:var(--role-light);
                       display:flex;align-items:center;justify-content:center;
                       font-weight:700;color:var(--role-primary);font-size:14px;flex-shrink:0;">
                    ${escapeHTML(initials(f.name))}
                  </div>
                  <div>
                    <div style="font-weight:600;font-size:13px;">${escapeHTML(f.name)}</div>
                    <div style="font-size:11px;color:var(--text-muted);">${escapeHTML(f.className)}</div>
                  </div>
                  <i class="fa-solid fa-chevron-right" style="margin-left:auto;color:var(--text-muted);font-size:11px;"></i>
                </div>`).join('') : `
                <div style="text-align:center;padding:24px;color:var(--text-soft);">
                  <i class="fa-solid fa-person-circle-question" style="font-size:2rem;opacity:.3;"></i>
                  <div style="margin-top:8px;font-size:13px;">No siblings linked</div>
                </div>`}
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function documentsPanel() {
    return `<div class="dash-card"><div class="dash-card-body" style="text-align:center;padding:32px;color:var(--text-soft);">No documents uploaded yet.</div></div>`;
  }

  // ─── FEES TAB WIRING (real payment recording) ───────────────────────

  function wireFeesTab(container, s, rawStudent) {
    const list = container.querySelector('#profile-fee-select');
    if (!list) return;

    container.querySelectorAll('[data-goto-student]').forEach(el => {
      el.addEventListener('click', () => window.navigateTo('student-profile', { studentId: parseInt(el.dataset.gotoStudent, 10) }));
    });

    const dueItems = s.fees.unpaid.map(f => ({ ...f, balance: computeFeeBalance(f).remaining })).filter(f => f.balance > 0);
    if (!dueItems.length) {
      window.EmptyStates?.renderInto(list, { title: 'No balance due', message: 'All fees for this student are fully paid.' });
    } else {
      list.innerHTML = dueItems.map(f => `
          <div class="payment-category-item" data-fee-row="${f.id}">
            <input type="checkbox" class="payment-category-item__checkbox" data-fee-check="${f.id}" />
            <div class="payment-category-item__info">
              <div class="payment-category-item__name">${escapeHTML(f.fee_name || '—')}</div>
              <div class="payment-category-item__balance">Balance: <strong>${fmtCurrency(f.balance)}</strong></div>
            </div>
            <div class="payment-category-item__amount-wrap disabled">
              <input type="number" class="payment-category-item__amount-input" data-fee-amount="${f.id}" min="0" max="${f.balance}" step="100" placeholder="0" disabled />
              <span class="payment-category-item__currency">RWF</span>
            </div>
            <span class="payment-category-item__max-btn" data-fee-max="${f.id}" data-max-value="${f.balance}">Pay full</span>
          </div>
        `).join('');
    }

    const selections = {};
    function recalc() {
      const total = Object.values(selections).reduce((sum, v) => sum + (v.checked ? v.amount : 0), 0);
      const totalEl = container.querySelector('#profile-fee-total');
      if (totalEl) totalEl.textContent = fmtCurrency(total);
    }

    list.querySelectorAll('[data-fee-check]').forEach(cb => {
      const feeId = cb.dataset.feeCheck;
      selections[feeId] = { checked: false, amount: 0 };
      cb.addEventListener('change', () => {
        selections[feeId].checked = cb.checked;
        const row = list.querySelector(`[data-fee-row="${feeId}"]`);
        const input = list.querySelector(`[data-fee-amount="${feeId}"]`);
        row.classList.toggle('checked', cb.checked);
        row.querySelector('.payment-category-item__amount-wrap').classList.toggle('disabled', !cb.checked);
        input.disabled = !cb.checked;
        if (!cb.checked) { input.value = ''; selections[feeId].amount = 0; }
        recalc();
      });
    });

    list.querySelectorAll('[data-fee-amount]').forEach(input => {
      input.addEventListener('input', () => {
        selections[input.dataset.feeAmount].amount = parseInt(input.value || '0', 10);
        recalc();
      });
    });

    list.querySelectorAll('[data-fee-max]').forEach(btn => {
      btn.addEventListener('click', () => {
        const feeId = btn.dataset.feeMax;
        const value = parseInt(btn.dataset.maxValue, 10);
        const input = list.querySelector(`[data-fee-amount="${feeId}"]`);
        const checkbox = list.querySelector(`[data-fee-check="${feeId}"]`);
        checkbox.checked = true;
        checkbox.dispatchEvent(new Event('change'));
        input.value = value;
        selections[feeId].amount = value;
        recalc();
      });
    });

    container.querySelector('#profile-record-payment-btn')?.addEventListener('click', async () => {
      const toPay = Object.entries(selections).filter(([, v]) => v.checked && v.amount > 0);
      if (!toPay.length) {
        window.Toast?.warning('Nothing to record', 'Select at least one fee and enter an amount.');
        return;
      }
      const total = toPay.reduce((sum, [, v]) => sum + v.amount, 0);
      const method = container.querySelector('#profile-payment-method')?.value || 'Cash';
      const btn = container.querySelector('#profile-record-payment-btn');
      window.Loaders?.button?.start(btn);

      try {
        const receiptNumber = await generateReceiptNumber();
        const now = new Date().toISOString();
        const yearId = window.getActiveYearId ? window.getActiveYearId() : null;
        const termId = window.getActiveTermId ? window.getActiveTermId() : null;

        const paymentRow = await insert('payments', {
          student_id: s.id,
          academic_year_id: yearId,
          term_id: termId,
          amount       : total,
          payment_date: now.slice(0, 10),
          payment_method: method,
          receipt_number: receiptNumber,
          recorded_by: state.currentUser?.id ?? null,
          recorded_by_name: state.currentUser?.name || '',
          student_name: s.name,
          created_at: now,
        });

        // Apply each entered amount directly to its fee row (matching
        // record-payment.js's real commit pattern).
        await Promise.all(toPay.map(([feeId, v]) => {
          const fee = s.fees.all.find(f => String(f.id) === String(feeId));
          const newPaid = Number(fee.paid_amount || 0) + v.amount;
          const bal = computeFeeBalance(fee);
          return update('student_fees', fee.id, {
            paid_amount: newPaid,
            is_paid    : newPaid >= bal.effective,
            updated_at : new Date().toISOString(),
          }).then(() => {
            fee.paid_amount = newPaid;
            fee.is_paid = newPaid >= bal.effective;
          });
        }));

        // Credit balance: same fixed pattern as record-payment.js —
        // any existing credit consumed here must actually be removed
        // from the DB, not just implied.
        const preview = previewFIFOAllocation(total, dueItems, s.fees.credit);
        if (preview.creditUsed > 0 || preview.creditAdded > 0) {
          const existingCredit = (state.creditBalances || []).find(c => c.student_id === s.id);
          const newCreditAmount = Math.max(0, Number(existingCredit?.credit_amount || 0) - preview.creditUsed + preview.creditAdded);
          if (existingCredit) {
            await update('student_credit_balance', existingCredit.id, { credit_amount: newCreditAmount, updated_at: now });
            existingCredit.credit_amount = newCreditAmount;
          } else if (newCreditAmount > 0) {
            const created = await insert('student_credit_balance', { student_id: s.id, credit_amount: newCreditAmount, updated_at: now });
            state.creditBalances = [...(state.creditBalances || []), created];
          }
        }

        state.payments = [...(state.payments || []), paymentRow];

        window.Toast?.success('Payment recorded', `${fmtCurrency(total)} recorded for ${s.name}.`);
        render(container, { studentId: s.id });
        window.Tabs?.activate(container.querySelector('[data-tab-group]'), 'fees');
      } catch (err) {
        window.Toast?.error('Could not record payment', err?.message);
      } finally {
        window.Loaders?.button?.stop(btn);
      }
    });

    recalc();
  }

  return { render };
})();

// ─── EXPOSE ─────────────────────────────────────────────────────────

window.StudentProfile = StudentProfile;
window.renderStudentProfile = StudentProfile.render;
