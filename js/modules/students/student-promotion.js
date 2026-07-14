/* ═══════════════════════════════════════════════════════════════════
   js/modules/students/student-promotion.js
   ═══════════════════════════════════════════════════════════════════
   End-of-year batch workflow: pick a class, review each student's
   pre-filled decision (Promote/Repeat/Transfer/Graduate, seeded from
   their pass/fail decision per Section 3.2), adjust individually if
   needed, then execute as one batch with a determinate progress
   overlay (this is exactly the kind of long-running bulk action
   js/ui/loaders.js's task overlay exists for).
   ═══════════════════════════════════════════════════════════════════ */

const StudentPromotion = (() => {

  const DECISION_OPTIONS = [
    { value: 'promote', label: 'Promote', color: 'var(--success)' },
    { value: 'repeat', label: 'Repeat', color: 'var(--warning)' },
    { value: 'transfer', label: 'Transfer', color: 'var(--accent-light, #60a5fa)' },
    { value: 'graduate', label: 'Graduate', color: 'var(--academics-accent, #8b5cf6)' }
  ];

  // Which class a promoted student moves into
  const NEXT_CLASS = {
    'Baby Class': 'Middle Class', 'Middle Class': 'Top Class', 'Top Class': 'Primary 1',
    'Primary 1': 'Primary 2', 'Primary 2': 'Primary 3', 'Primary 3': 'Primary 4',
    'Primary 4': 'Primary 5', 'Primary 5': 'Primary 6', 'Primary 6': null // graduates
  };

  // MOCK_DATA — replace with core/api.js (students + their final average/decision)
  const MOCK_ROSTER = {
    'Primary 3': [
      { id: 'STU-2024-0201', name: 'KAMALI Moses', average: 81, decision: 'promote' },
      { id: 'STU-2024-0202', name: 'KAMALI Jean', average: 52, decision: 'promote' },
      { id: 'STU-2023-0175', name: 'NIYONZIMA Claude', average: 38, decision: 'repeat' },
      { id: 'STU-2022-0099', name: 'BIZIMANA Eric', average: 64, decision: 'promote' },
      { id: 'STU-2021-0044', name: 'MUKAMANA Alice', average: 45, decision: 'repeat' }
    ]
  };

  let selectedClass = null;
  let roster = [];

  function escapeHTML(str) {
    const div = document.createElement('div');
    div.textContent = str ?? '';
    return div.innerHTML;
  }

  function render(container) {
    if (!container) return;
    container.innerHTML = `
      <div class="dashboard-page">
        <div class="reports-toolbar">
          <select class="form-select" id="promo-class-select" style="min-width:220px;">
            <option value="">Select a class...</option>
            ${[...CLASS_LEVELS.nursery, ...CLASS_LEVELS.primary].map(c => `<option value="${c}">${c}</option>`).join('')}
          </select>
          <div class="reports-toolbar__spacer"></div>
          <span class="result-count" id="promo-count"></span>
        </div>
        <div id="promo-body"></div>
      </div>
    `;

    container.querySelector('#promo-class-select').addEventListener('change', (e) => loadClass(container, e.target.value));
  }

  function loadClass(container, classId) {
    selectedClass = classId;
    const body = container.querySelector('#promo-body');
    if (!classId) { body.innerHTML = ''; container.querySelector('#promo-count').textContent = ''; return; }

    roster = (MOCK_ROSTER[classId] || []).map(s => ({ ...s })); // clone so edits don't mutate mock source
    container.querySelector('#promo-count').textContent = `${roster.length} students`;

    if (!roster.length) {
      window.EmptyStates?.renderPreset(body, 'noData', { title: 'No students in this class', message: 'Nothing to promote here.' });
      return;
    }

    body.innerHTML = `
      <div class="dash-card">
        <div class="dash-card-header">
          <span class="dash-card-title">${escapeHTML(classId)} \u2192 ${NEXT_CLASS[classId] ? escapeHTML(NEXT_CLASS[classId]) : 'Graduation'}</span>
          <div style="display:flex; gap:8px;">
            <button class="btn btn-sm btn-outline" data-bulk-set="promote">Set all: Promote</button>
            <button class="btn btn-sm btn-outline" data-bulk-set="repeat">Set all: Repeat</button>
          </div>
        </div>
        <div class="dash-card-body no-padding" id="promo-table-wrap"></div>
      </div>
      <div class="form-actions" style="margin-top:16px;">
        <button class="btn btn-primary btn-lg" id="promo-execute-btn"><i class="fa-solid fa-arrow-up-right-dots"></i> Execute Promotion</button>
      </div>
    `;

    renderTable(body);

    body.querySelectorAll('[data-bulk-set]').forEach(btn => {
      btn.addEventListener('click', () => {
        roster.forEach(s => { s.decision = btn.dataset.bulkSet; });
        renderTable(body);
      });
    });

    body.querySelector('#promo-execute-btn').addEventListener('click', () => executePromotion(container));
  }

  function renderTable(body) {
    const wrap = body.querySelector('#promo-table-wrap');
    wrap.innerHTML = `
      <table class="data-table">
        <thead><tr><th>Student</th><th style="text-align:center;">Average</th><th style="text-align:center;">Decision</th></tr></thead>
        <tbody>${roster.map(s => `
          <tr>
            <td>${escapeHTML(s.name)} <span style="color:var(--card-text-muted,#475569); font-size:0.7rem;">${s.id}</span></td>
            <td style="text-align:center; color:${s.average < 50 ? 'var(--danger)' : 'var(--success)'};">${s.average}%</td>
            <td style="text-align:center;">
              <select class="form-select" data-decision="${s.id}" style="min-width:130px;">
                ${DECISION_OPTIONS.map(o => `<option value="${o.value}" ${s.decision === o.value ? 'selected' : ''}>${o.label}</option>`).join('')}
              </select>
            </td>
          </tr>
        `).join('')}</tbody>
      </table>
    `;
    wrap.querySelectorAll('[data-decision]').forEach(sel => {
      sel.addEventListener('change', () => {
        roster.find(s => s.id === sel.dataset.decision).decision = sel.value;
      });
    });
  }

  async function executePromotion(container) {
    const summary = roster.reduce((acc, s) => { acc[s.decision] = (acc[s.decision] || 0) + 1; return acc; }, {});
    const summaryText = Object.entries(summary).map(([k, v]) => `${v} ${DECISION_OPTIONS.find(o => o.value === k)?.label.toLowerCase()}`).join(', ');

    const confirmed = await window.Modals?.confirm({
      title: `Promote ${roster.length} students?`,
      message: `${summaryText}. This updates each student's class assignment for the new academic year and cannot be easily undone in bulk.`,
      confirmLabel: 'Execute Promotion',
      tone: 'warning'
    });
    if (!confirmed) return;

    const handle = window.Loaders?.task?.show('students', {
      label: 'Processing promotions\u2026',
      sub: `0 / ${roster.length} students`,
      determinate: true
    });

    for (let i = 0; i < roster.length; i++) {
      // TODO(api): core/api.js batch update per student's class_id / status
      await new Promise(res => setTimeout(res, 80));
      handle?.setProgress(Math.round(((i + 1) / roster.length) * 100));
      handle?.setSub(`${i + 1} / ${roster.length} students`);
    }

    handle?.hide();
    window.Toast?.success('Promotion complete', `${roster.length} students in ${selectedClass} processed: ${summaryText}.`);
    container.querySelector('#promo-class-select').value = '';
    container.querySelector('#promo-body').innerHTML = '';
    container.querySelector('#promo-count').textContent = '';
  }

  return { render };
})();
 