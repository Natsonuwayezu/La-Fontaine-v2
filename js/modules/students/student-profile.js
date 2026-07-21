/* ═══════════════════════════════════════════════════════════════════
   js/modules/students/student-profile.js
   ═══════════════════════════════════════════════════════════════════
   The full profile page (student-details.js is the quick-peek drawer;
   this is the destination "Open Full Profile" navigates to). Tabs:
   Overview, Academics, Fees, Family, Documents.

   The Fees tab includes a real payment-recording panel using the same
   checkbox+amount pattern as record-payment.js and enroll-student.js
   step 3 — recording a payment from here is not a lesser/simplified
   version, it's the same component.
   ═══════════════════════════════════════════════════════════════════ */

const StudentProfile = (() => {

  // MOCK_DATA — replace with core/api.js
  const MOCK_STUDENT = {
    id: 'STU-2024-0012', name: 'MUGISHA Jean', classId: 'Primary 4A', status: 'active',
    gender: 'M', dob: '2016-03-14', enrolledDate: '2023-09-04',
    guardianName: 'MUGISHA Emmanuel', guardianPhone: '+250 788 123 456', guardianEmail: 'e.mugisha@example.rw',
    address: 'Rubavu, Nyamyumba Sector',
    academics: {
      average: 74, position: 6, classSize: 28,
      subjects: [
        { name: 'Mathematics', score: 82, grade: 'A' },
        { name: 'English', score: 71, grade: 'B' },
        { name: 'Kinyarwanda', score: 68, grade: 'C' },
        { name: 'Science', score: 79, grade: 'B' },
        { name: 'Social Studies', score: 74, grade: 'B' }
      ]
    },
    fees: {
      items: [
        { id: 'tuition', name: 'Tuition', total: 80000, paid: 45000 },
        { id: 'uniform', name: 'Uniform', total: 25000, paid: 25000 },
        { id: 'materials', name: 'Books & Materials', total: 18000, paid: 0 },
        { id: 'transport', name: 'Transport', total: 30000, paid: 30000 }
      ],
      history: [
        { date: '2026-05-02', amount: 45000, method: 'Cash', receipt: 'R-018' },
        { date: '2026-03-15', amount: 25000, method: 'Mobile Money', receipt: 'R-009' },
        { date: '2026-01-10', amount: 30000, method: 'Bank Transfer', receipt: 'R-002' }
      ]
    },
    family: [
      { name: 'MUGISHA Aline', relation: 'Sister', classId: 'Primary 2' }
    ]
  };

  function escapeHTML(str) {
    const div = document.createElement('div');
    div.textContent = str ?? '';
    return div.innerHTML;
  }

  function initials(name) {
    return name.split(' ').map(w => w[0]).slice(0, 2).join('');
  }

  function render(container, params) {
    if (!container) return;
    const s = MOCK_STUDENT; // TODO(api): fetch by params?.studentId

    container.innerHTML = `
      <div class="dashboard-page">
        <div class="profile-header">
          <div class="profile-header__avatar">${escapeHTML(initials(s.name))}</div>
          <div>
            <div class="profile-header__name">${escapeHTML(s.name)}</div>
            <div class="profile-header__meta">${escapeHTML(s.id)} \u00b7 ${escapeHTML(s.classId)} \u00b7 <span class="student-status-badge ${s.status}">${s.status}</span></div>
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

    // .profile-tab isn't styled with the base .tab-btn class our Tabs
    // controller assumes active-state on, but it reads .active generically
    // via classList so this works the same way regardless of class name.
    window.Tabs?.init(container.querySelector('[data-tab-group]'));

    container.querySelector('#profile-report-btn').addEventListener('click', () => window.Router?.navigate('report-cards', { studentId: s.id }));
    container.querySelector('#profile-edit-btn').addEventListener('click', () => window.Toast?.info('Edit student', 'Opening edit form...'));

    wireFeesTab(container, s);
  }

  function overviewPanel(s) {
    return `
      <div class="two-col">
        <div class="dash-card">
          <div class="dash-card-header"><span class="dash-card-title">Personal Information</span></div>
          <div class="dash-card-body">
            <div class="profile-info-grid">
              <div class="profile-info-item"><span class="k">Gender</span><span class="v">${s.gender === 'M' ? 'Male' : 'Female'}</span></div>
              <div class="profile-info-item"><span class="k">Date of Birth</span><span class="v">${s.dob}</span></div>
              <div class="profile-info-item"><span class="k">Enrolled</span><span class="v">${s.enrolledDate}</span></div>
              <div class="profile-info-item"><span class="k">Address</span><span class="v">${escapeHTML(s.address)}</span></div>
            </div>
          </div>
        </div>
        <div class="dash-card">
          <div class="dash-card-header"><span class="dash-card-title">Guardian</span></div>
          <div class="dash-card-body">
            <div class="profile-info-grid">
              <div class="profile-info-item"><span class="k">Name</span><span class="v">${escapeHTML(s.guardianName)}</span></div>
              <div class="profile-info-item"><span class="k">Phone</span><span class="v">${escapeHTML(s.guardianPhone)}</span></div>
              <div class="profile-info-item"><span class="k">Email</span><span class="v">${escapeHTML(s.guardianEmail)}</span></div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function academicsPanel(s) {
    return `
      <div class="stats-summary-row">
        <div class="stats-summary-tile"><div class="stats-summary-tile__value">${s.academics.average}%</div><div class="stats-summary-tile__label">Average</div></div>
        <div class="stats-summary-tile"><div class="stats-summary-tile__value">${s.academics.position}/${s.academics.classSize}</div><div class="stats-summary-tile__label">Class Position</div></div>
      </div>
      <div class="dash-card">
        <div class="dash-card-header"><span class="dash-card-title">Subject Breakdown</span></div>
        <div class="dash-card-body no-padding">
          <table class="data-table">
            <thead><tr><th>Subject</th><th style="text-align:center;">Score</th><th style="text-align:center;">Grade</th></tr></thead>
            <tbody>${s.academics.subjects.map(sub => `
              <tr><td>${escapeHTML(sub.name)}</td><td style="text-align:center;">${sub.score}%</td><td style="text-align:center;"><span class="grade-pill grade-${sub.grade.toLowerCase()}">${sub.grade}</span></td></tr>
            `).join('')}</tbody>
          </table>
        </div>
      </div>
    `;
  }

  function feesPanel(s) {
    const totalDue = s.fees.items.reduce((sum, f) => sum + (f.total - f.paid), 0);
    return `
      <div class="two-col">
        <div class="dash-card">
          <div class="dash-card-header"><span class="dash-card-title">Fee Balance</span><span class="dash-card-action" style="color:${totalDue > 0 ? 'var(--warning)' : 'var(--success)'};">${window.Forms?.formatRWF(totalDue) ?? totalDue} RWF due</span></div>
          <div class="dash-card-body no-padding">
            <table class="data-table">
              <thead><tr><th>Fee</th><th style="text-align:right;">Total</th><th style="text-align:right;">Paid</th><th style="text-align:right;">Balance</th></tr></thead>
              <tbody>${s.fees.items.map(f => `
                <tr>
                  <td>${escapeHTML(f.name)}</td>
                  <td style="text-align:right;">${window.Forms?.formatRWF(f.total) ?? f.total}</td>
                  <td style="text-align:right; color:var(--success);">${window.Forms?.formatRWF(f.paid) ?? f.paid}</td>
                  <td style="text-align:right; font-weight:700; color:${f.total - f.paid > 0 ? 'var(--warning)' : 'var(--card-text-muted,#475569)'};">${window.Forms?.formatRWF(f.total - f.paid) ?? (f.total - f.paid)}</td>
                </tr>
              `).join('')}</tbody>
            </table>
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
            <div class="form-actions" style="margin-top:14px;">
              <button class="btn btn-primary" id="profile-record-payment-btn"><i class="fa-solid fa-money-bill-wave"></i> Record Payment</button>
            </div>
          </div>
        </div>
      </div>

      <div class="dash-card" style="margin-top:20px;">
        <div class="dash-card-header"><span class="dash-card-title">Payment History</span></div>
        <div class="dash-card-body no-padding">
          <table class="data-table">
            <thead><tr><th>Date</th><th>Receipt</th><th>Method</th><th style="text-align:right;">Amount</th></tr></thead>
            <tbody>${s.fees.history.map(h => `
              <tr><td>${h.date}</td><td>${h.receipt}</td><td>${h.method}</td><td style="text-align:right; color:var(--success); font-weight:600;">${window.Forms?.formatRWF(h.amount) ?? h.amount} RWF</td></tr>
            `).join('')}</tbody>
          </table>
        </div>
      </div>
    `;
  }

  function familyPanel(s) {
    if (!s.family.length) {
      return `<div class="dash-card"><div class="dash-card-body"><div id="family-empty"></div></div></div>`;
    }
    return `
      <div class="dash-card">
        <div class="dash-card-header"><span class="dash-card-title">Linked Family Members</span></div>
        <div class="dash-card-body">
          ${s.family.map(f => `
            <div class="family-tree-node" style="margin-bottom:8px;">
              <div class="family-tree-node__avatar">${escapeHTML(initials(f.name))}</div>
              <div><div class="family-tree-node__name">${escapeHTML(f.name)}</div><div class="family-tree-node__relation">${escapeHTML(f.relation)} \u00b7 ${escapeHTML(f.classId)}</div></div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  function documentsPanel() {
    return `<div class="dash-card"><div class="dash-card-body"><div id="documents-empty"></div></div></div>`;
  }

  function wireFeesTab(container, s) {
    const list = container.querySelector('#profile-fee-select');
    if (!list) return;

    const dueItems = s.fees.items.filter(f => f.total - f.paid > 0);
    if (!dueItems.length) {
      window.EmptyStates?.renderInto(list, { title: 'No balance due', message: 'All fees for this student are fully paid.' });
    } else {
      list.innerHTML = dueItems.map(f => {
        const balance = f.total - f.paid;
        return `
          <div class="payment-category-item" data-fee-row="${f.id}">
            <input type="checkbox" class="payment-category-item__checkbox" data-fee-check="${f.id}" />
            <div class="payment-category-item__info">
              <div class="payment-category-item__name">${escapeHTML(f.name)}</div>
              <div class="payment-category-item__balance">Balance: <strong>${window.Forms?.formatRWF(balance) ?? balance} RWF</strong></div>
            </div>
            <div class="payment-category-item__amount-wrap disabled">
              <input type="text" class="payment-category-item__amount-input" data-fee-amount="${f.id}" data-currency placeholder="0" />
              <span class="payment-category-item__currency">RWF</span>
            </div>
            <span class="payment-category-item__max-btn" data-fee-max="${f.id}" data-max-value="${balance}">Pay full</span>
          </div>
        `;
      }).join('');
    }

    const selections = {};
    function recalc() {
      const total = Object.values(selections).reduce((sum, v) => sum + (v.checked ? v.amount : 0), 0);
      container.querySelector('#profile-fee-total').textContent = `${window.Forms?.formatRWF(total) ?? total} RWF`;
    }

    list.querySelectorAll('[data-fee-check]').forEach(cb => {
      const feeId = cb.dataset.feeCheck;
      selections[feeId] = { checked: false, amount: 0 };
      cb.addEventListener('change', () => {
        selections[feeId].checked = cb.checked;
        const row = list.querySelector(`[data-fee-row="${feeId}"]`);
        row.classList.toggle('checked', cb.checked);
        row.querySelector('.payment-category-item__amount-wrap').classList.toggle('disabled', !cb.checked);
        recalc();
      });
    });

    list.querySelectorAll('[data-fee-amount]').forEach(input => {
      window.Forms?.bindCurrencyInput(input);
      input.addEventListener('input', () => {
        selections[input.dataset.feeAmount].amount = parseInt(input.dataset.rawValue || '0', 10);
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
        input.dataset.rawValue = value;
        input.value = window.Forms?.formatRWF(value) ?? value;
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
      const btn = container.querySelector('#profile-record-payment-btn');
      window.Loaders?.button?.start(btn);
      try {
        // TODO(api): core/api.js payment insert with FIFO allocation across toPay
        await new Promise(res => setTimeout(res, 600));
        toPay.forEach(([feeId, v]) => {
          const fee = s.fees.items.find(f => f.id === feeId);
          fee.paid += v.amount;
        });
        s.fees.history.unshift({ date: new Date().toISOString().slice(0, 10), amount: total, method: 'Cash', receipt: `R-${Math.floor(Math.random() * 900) + 100}` });
        window.Toast?.success('Payment recorded', `${window.Forms?.formatRWF(total) ?? total} RWF recorded for ${s.name}.`);
        render(container, { studentId: s.id }); // re-render to reflect new balances
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
// window.StudentProfile was never assigned anywhere in this file, and the router
// looks up window.renderStudentProfile specifically (see core/router.js's
// moduleIdToRenderFn) — this page was completely unreachable via navigation
// despite being fully built.
window.StudentProfile = StudentProfile;
window.renderStudentProfile = StudentProfile.render;
