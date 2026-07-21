/* ═══════════════════════════════════════════════════════════════════
   js/modules/holidays/holidays-fees.js
   ═══════════════════════════════════════════════════════════════════
   Fees specific to the holiday period (Section 3.5) — isolated in the
   real holiday_fees table, never student_fees. Uses the real backend
   functions already implemented in js/core/fees.js:
   window.createHolidayFees(feeData, studentIds, academicYearId) and
   window.markHolidayFeesAsApplied(holidayFeeIds, newTermId).

   Note on the current core/fees.js implementation: createHolidayFees()
   currently sets apply_at_next_term=true unconditionally for every
   holiday fee. The original spec (Section 3.5) called for some holiday
   fees — like a remedial-course fee — to post and be payable
   immediately during the holiday itself, while only fees meant for the
   next term get deferred. This module exposes both framings in the UI
   (an "Applies" toggle) but the deferred flag is currently a no-op on
   the backend until core/fees.js is revisited — flagged clearly here
   rather than silently working around it.
   ═══════════════════════════════════════════════════════════════════ */

const HolidaysFees = (() => {

    function esc(str) {
        if (window.esc) return window.esc(str);
        const div = document.createElement('div');
        div.textContent = str ?? '';
        return div.innerHTML;
    }

    function rwf(n) { return window.fmtCurrency ? window.fmtCurrency(n) : (window.Forms?.formatRWF(n) ?? n); }

    let selectedStudentIds = new Set();

    function render(container) {
        if (!container) return;
        const holidayActive = window.isHolidayMode ? window.isHolidayMode() : false;

        container.innerHTML = `
      <div class="dashboard-page">
        <div class="dash-card" style="margin-bottom:16px; ${holidayActive ? 'border-color:rgba(245,158,11,0.35);' : ''}">
          <div class="dash-card-body" style="display:flex; align-items:center; gap:10px;">
            <i class="fa-solid ${holidayActive ? 'fa-umbrella-beach' : 'fa-circle-check'}" style="color:${holidayActive ? 'var(--warning)' : 'var(--success)'}; font-size:1.1rem;"></i>
            <span style="font-size:0.85rem; color:var(--card-text,#e2e8f0);">
              ${holidayActive
                ? 'Holiday mode is active \u2014 fees created here are written to the isolated holiday_fees table, never to the regular term fees.'
                : 'Holiday mode is not currently active. You can still create/manage holiday fees here for planning purposes.'}
            </span>
          </div>
        </div>

        <div class="two-col">
          <div class="dash-card">
            <div class="dash-card-header"><span class="dash-card-title">Create Holiday Fee</span></div>
            <div class="dash-card-body">
              <div class="form-group">
                <label>Fee Name <span class="required">*</span></label>
                <input type="text" class="form-input" id="hf-name" placeholder="e.g. Holiday Remedial Course" />
              </div>
              <div class="form-row" style="margin-top:12px;">
                <div class="form-group">
                  <label>Amount (RWF) <span class="required">*</span></label>
                  <div class="currency-input-wrap"><input type="text" class="form-input" id="hf-amount" data-currency placeholder="0" /><span class="currency-input-wrap__suffix">RWF</span></div>
                </div>
                <div class="form-group">
                  <label>Applies</label>
                  <select class="form-select" id="hf-applies">
                    <option value="immediate">Immediately (holiday-period fee)</option>
                    <option value="next-term">At start of next term</option>
                  </select>
                </div>
              </div>
              <div class="form-group" style="margin-top:12px;">
                <label>Description</label>
                <textarea class="form-textarea" id="hf-description" placeholder="Optional notes about this fee..."></textarea>
              </div>
              <div class="form-group" style="margin-top:12px;">
                <label>Target Students <span class="required">*</span></label>
                <div id="hf-student-picker" style="max-height:200px; overflow-y:auto; border:1px solid var(--card-border, rgba(255,255,255,0.07)); border-radius:8px; padding:8px;"></div>
                <div class="form-hint" id="hf-selected-count">0 students selected</div>
              </div>
              <div class="form-actions" style="margin-top:14px;">
                <button class="btn btn-primary" id="hf-create-btn"><i class="fa-solid fa-plus"></i> Create Holiday Fee</button>
              </div>
            </div>
          </div>

          <div class="dash-card">
            <div class="dash-card-header"><span class="dash-card-title">Existing Holiday Fees</span><span class="dash-card-action" id="hf-pending-count"></span></div>
            <div class="dash-card-body">
              <div class="form-actions" style="margin-bottom:12px; justify-content:flex-start;">
                <button class="btn btn-outline btn-sm" id="hf-apply-next-term-btn"><i class="fa-solid fa-forward"></i> Apply Pending Fees to New Term</button>
              </div>
              <div id="hf-list-wrap"></div>
            </div>
          </div>
        </div>
      </div>
    `;

        renderStudentPicker(container);
        renderFeeList(container);

        container.querySelector('#hf-create-btn').addEventListener('click', () => createFee(container));
        container.querySelector('#hf-apply-next-term-btn').addEventListener('click', () => applyPendingToNewTerm(container));
    }

    function studentPool() {
        if (window.state?.holidayEnrollments?.length && window.state?.students?.length) {
            const enrolledIds = new Set(window.state.holidayEnrollments.map(e => e.student_id));
            return window.state.students.filter(s => enrolledIds.has(s.id) && !s.is_deleted)
                .map(s => ({ id: s.id, name: s.full_name || `${s.first_name || ''} ${s.last_name || ''}`.trim() }));
        }
        if (window.state?.students?.length) {
            return window.state.students.filter(s => !s.is_deleted)
                .map(s => ({ id: s.id, name: s.full_name || `${s.first_name || ''} ${s.last_name || ''}`.trim() }));
        }
        console.warn('HolidaysFees: no real student directory available yet — student picker will be empty.');
        return [];
    }

    function renderStudentPicker(container) {
        const pool = studentPool();
        const el = container.querySelector('#hf-student-picker');
        if (!pool.length) {
            window.EmptyStates?.renderInto(el, { title: 'No students available', message: 'Student data hasn\u2019t loaded yet.' });
            return;
        }
        el.innerHTML = pool.map(s => `
      <label class="checkbox" style="display:flex; padding:5px 0;">
        <input type="checkbox" data-student="${s.id}" />
        <span class="checkbox__box"><svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg></span>
        ${esc(s.name)} <span style="color:var(--card-text-muted,#475569); font-size:0.7rem; margin-left:6px;">${esc(s.id)}</span>
      </label>
    `).join('');

        el.querySelectorAll('[data-student]').forEach(cb => {
            cb.addEventListener('change', () => {
                if (cb.checked) selectedStudentIds.add(cb.dataset.student);
                else selectedStudentIds.delete(cb.dataset.student);
                container.querySelector('#hf-selected-count').textContent = `${selectedStudentIds.size} student${selectedStudentIds.size === 1 ? '' : 's'} selected`;
            });
        });
    }

    async function createFee(container) {
        const name = container.querySelector('#hf-name').value.trim();
        const amountInput = container.querySelector('#hf-amount');
        const amount = parseInt(amountInput.dataset.rawValue || '0', 10);
        const description = container.querySelector('#hf-description').value.trim();
        const applies = container.querySelector('#hf-applies').value;

        if (!name) { window.Toast?.warning('Name required', 'Enter a name for this holiday fee.'); return; }
        if (!amount || amount <= 0) { window.Toast?.warning('Amount required', 'Enter a valid amount.'); return; }
        if (!selectedStudentIds.size) { window.Toast?.warning('No students selected', 'Select at least one student.'); return; }

        const btn = container.querySelector('#hf-create-btn');
        window.Loaders?.button?.start(btn);

        try {
            const yearId = window.getActiveYearId ? window.getActiveYearId() : null;
            if (!window.createHolidayFees) throw new Error('Holiday fee creation is not available yet (core/fees.js not loaded).');

            const result = await window.createHolidayFees(
                { name, amount, description, fee_type: applies === 'next-term' ? 'holiday_deferred' : 'holiday' },
                [...selectedStudentIds],
                yearId
            );

            window.Toast?.success('Holiday fee created', `Applied to ${result.created} student${result.created === 1 ? '' : 's'}.`);
            container.querySelector('#hf-name').value = '';
            amountInput.value = ''; amountInput.dataset.rawValue = '0';
            container.querySelector('#hf-description').value = '';
            selectedStudentIds.clear();
            renderStudentPicker(container);
            container.querySelector('#hf-selected-count').textContent = '0 students selected';
            renderFeeList(container);
        } catch (err) {
            window.Toast?.error('Could not create holiday fee', err?.message || 'Please try again.');
        } finally {
            window.Loaders?.button?.stop(btn);
        }
    }

    function renderFeeList(container) {
        const fees = window.state?.holidayFees || [];
        const pendingCount = fees.filter(f => f.apply_at_next_term && !f.is_applied_next_term).length;
        container.querySelector('#hf-pending-count').textContent = pendingCount ? `${pendingCount} pending` : '';

        const wrap = container.querySelector('#hf-list-wrap');
        if (!fees.length) {
            window.EmptyStates?.renderPreset(wrap, 'noData', { title: 'No holiday fees yet', message: 'Create one using the form on the left.' });
            return;
        }

        window.DataTable?.create(wrap, {
            rowKey: 'id',
            pageSize: 10,
            columns: [
                { key: 'name', label: 'Fee', sortable: true },
                { key: 'student_id', label: 'Student', render: (f) => esc(studentName(f.student_id)) },
                { key: 'amount', label: 'Amount', align: 'right', render: (f) => rwf(f.amount) },
                { key: 'is_paid', label: 'Status', align: 'center', render: (f) => `<span class="fee-status-chip ${f.is_paid ? 'paid' : 'unpaid'}">${f.is_paid ? 'paid' : 'unpaid'}</span>` },
                { key: 'apply_at_next_term', label: 'Timing', align: 'center', render: (f) => f.apply_at_next_term ? (f.is_applied_next_term ? '<span class="overdue-badge mild">Applied</span>' : '<span class="overdue-badge warning">Pending</span>') : '<span class="overdue-badge">Immediate</span>' },
                { key: 'actions', label: '', align: 'right', render: (f) => f.is_paid ? '' : `<button class="btn btn-sm btn-primary" data-pay="${f.id}">Record Payment</button>` }
            ],
            data: fees,
            emptyState: { title: 'No holiday fees' }
        });

        wrap.querySelectorAll('[data-pay]').forEach(btn => {
            btn.addEventListener('click', () => recordHolidayPayment(container, btn.dataset.pay));
        });
    }

    function studentName(studentId) {
        const s = window.state?.students?.find(x => x.id === studentId);
        return s ? (s.full_name || `${s.first_name || ''} ${s.last_name || ''}`.trim()) : studentId;
    }

    async function recordHolidayPayment(container, feeId) {
        const fee = (window.state?.holidayFees || []).find(f => f.id === feeId);
        if (!fee) return;

        const confirmed = await window.Modals?.confirm({
            title: 'Record full payment?',
            message: `Mark "${fee.name}" (${rwf(fee.amount)} RWF) as paid in full for ${studentName(fee.student_id)}?`,
            confirmLabel: 'Record Payment',
            tone: 'info'
        });
        if (!confirmed) return;

        try {
            await window.update?.('holiday_fees', feeId, { paid_amount: fee.amount, is_paid: true, updated_at: new Date().toISOString() });
            fee.paid_amount = fee.amount;
            fee.is_paid = true;
            window.Toast?.success('Payment recorded');
            renderFeeList(container);
        } catch (err) {
            window.Toast?.error('Could not record payment', err?.message);
        }
    }

    async function applyPendingToNewTerm(container) {
        const pending = (window.state?.holidayFees || []).filter(f => f.apply_at_next_term && !f.is_applied_next_term);
        if (!pending.length) { window.Toast?.info('Nothing to apply', 'No pending holiday fees are waiting for next term.'); return; }

        const confirmed = await window.Modals?.confirm({
            title: `Apply ${pending.length} fee${pending.length === 1 ? '' : 's'} to the new term?`,
            message: 'These holiday fees will be marked as applied and become part of the upcoming term\u2019s fee tracking.',
            confirmLabel: 'Apply Now',
            tone: 'warning'
        });
        if (!confirmed) return;

        try {
            const newTermId = window.getActiveTermId ? window.getActiveTermId() : null;
            await window.markHolidayFeesAsApplied?.(pending.map(f => f.id), newTermId);
            pending.forEach(f => { f.is_applied_next_term = true; });
            window.Toast?.success('Fees applied', `${pending.length} holiday fee${pending.length === 1 ? '' : 's'} applied to the new term.`);
            renderFeeList(container);
        } catch (err) {
            window.Toast?.error('Could not apply fees', err?.message);
        }
    }

    return { render };
})();

// ─── EXPOSE ─────────────────────────────────────────────────────────
// window.HolidaysFees was never assigned anywhere in this file, and the router
// looks up window.renderHolidaysFees specifically (see core/router.js's
// moduleIdToRenderFn) — this page was completely unreachable via navigation
// despite being fully built.
window.HolidaysFees = HolidaysFees;
window.renderHolidaysFees = HolidaysFees.render;
