/* ═══════════════════════════════════════════════════════════════════
   js/modules/holidays/holidays-fees.js
   ═══════════════════════════════════════════════════════════════════
   Purpose : Holiday session fee management.

   HOW IT WORKS:
   - Each holiday session can have configured fees (e.g. 20,000 RWF
     for remedial course). Some sessions are FREE (no fee configured).
   - When a student is enrolled in a holiday class, the session fee
     is AUTO-ASSIGNED to that student in the holiday_fees table.
   - holiday_fees is SEPARATE from student_fees — never mixed.
   - Fee has: holiday_session_id, session_class_id, student_id,
     amount, waived_amount (discount), paid_amount, is_paid,
     requires_approval, is_approved, source='holiday_enrollment'
   - Discount: entered < full → difference = waived_amount
   - All go to fee_approval queue (fee-approvals.js handles it)
   - Already paid = auto-approved immediately

   TABS:
   1. Fee Overview — fee status per session/class (who paid, who owes)
   2. Configure Session Fees — set fee amount per holiday session
      (zero = free, students enrolled at no charge)
   3. Record Payment — record payment against a student's holiday fee
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

let _hfTab       = 'overview'; // 'overview' | 'configure' | 'payment'
let _hfSessionId = null;
let _hfClassId   = null;
let _hfFilter    = { search: '', status: 'all' };
let _hfPage      = 1;
const _hfSize    = 50;

async function renderHolidaysFees(container, params = {}) {
    if (!container) return;
    await ensureStateLoaded();
    const sessions = state.holidaySessions || [];
    _hfSessionId = params.sessionId || getActiveHolidaySessionId() || sessions[0]?.id || null;
    if (_hfSessionId && !(state.sessionClasses||[]).some(c=>c.holiday_session_id===_hfSessionId))
        await loadDataForHolidaySession(_hfSessionId);
    if (!sessions.length) {
        container.innerHTML = `<div class="module-wrap"><div class="section-card">
            <div class="empty-state" style="padding:60px;">
            <div class="es-title">No Holiday Sessions</div>
            <div class="es-sub">Create a holiday session first.</div>
            </div></div></div>`; return;
    }
    _hfShell(container, sessions);
}

function _hfShell(container, sessions) {
    const cur     = sessions.find(s=>s.id===_hfSessionId)||sessions[0];
    const classes = (state.sessionClasses||[]).filter(c=>c.holiday_session_id===_hfSessionId);

    // Count stats
    const allFees = (state.holidayFees||[]).filter(f=>f.holiday_session_id===_hfSessionId);
    const totalFees = allFees.length;
    const paidFees  = allFees.filter(f=>f.is_paid).length;
    const pendingApproval = allFees.filter(f=>f.requires_approval&&f.is_approved===false&&!Number(f.paid_amount||0)).length;
    const totalOwed = allFees.reduce((s,f)=>s+Number(f.amount||0)-Number(f.waived_amount||0),0);
    const totalPaid = allFees.reduce((s,f)=>s+Number(f.paid_amount||0),0);

    container.innerHTML = `
    <div class="module-wrap">
      <div class="mod-topbar">
        <div class="mod-topbar-left">
          <h1 class="mod-title"><i class="fa-solid fa-coins"></i> Holiday Fees</h1>
          <span class="badge" style="background:rgba(217,119,6,.15);color:#d97706;margin-left:8px;">
            <i class="fa-solid fa-umbrella-beach"></i> ${esc(cur?.name||'—')}</span>
        </div>
        <div class="mod-topbar-right">
          <select class="select select-sm" onchange="hfPickSession(parseInt(this.value))">
            ${sessions.map(s=>`<option value="${s.id}"${s.id===_hfSessionId?' selected':''}>
              ${esc(s.name)}${s.status==='active'?' ●':''}</option>`).join('')}
          </select>
        </div>
      </div>

      <!-- KPIs -->
      <div class="stats-grid stats-grid-4" style="margin-bottom:14px;">
        <div class="stat-card">
          <div class="stat-value">${totalFees}</div>
          <div class="stat-label">Fee Assignments</div>
        </div>
        <div class="stat-card">
          <div class="stat-value c-success">${paidFees}</div>
          <div class="stat-label">Paid</div>
          <div class="stat-sub">${fmtCurrency(totalPaid)}</div>
        </div>
        <div class="stat-card">
          <div class="stat-value c-warning">${pendingApproval}</div>
          <div class="stat-label">Pending Approval</div>
          ${pendingApproval?`<div class="stat-sub"><a href="#" onclick="navigateTo('fee-approvals')">Review</a></div>`:''}
        </div>
        <div class="stat-card">
          <div class="stat-value">${fmtCurrency(totalOwed-totalPaid)}</div>
          <div class="stat-label">Outstanding</div>
        </div>
      </div>

      <!-- Tabs -->
      <div class="tabs" style="margin-bottom:0;">
        <button class="tab-btn${_hfTab==='overview'?' active':''}" onclick="hfTab('overview')">
          <i class="fa-solid fa-list"></i> Fee Overview</button>
        <button class="tab-btn${_hfTab==='configure'?' active':''}" onclick="hfTab('configure')">
          <i class="fa-solid fa-gear"></i> Configure Session Fees</button>
        <button class="tab-btn${_hfTab==='payment'?' active':''}" onclick="hfTab('payment')">
          <i class="fa-solid fa-money-bill-transfer"></i> Record Payment</button>
      </div>

      <div class="section-card" style="border-top-left-radius:0;margin-top:0;">
        <div id="hf-body"></div>
      </div>
    </div>`;

    _hfDraw();
}

window.hfTab = t => { _hfTab=t; _hfDraw(); };
window.hfPickSession = async id => {
    _hfSessionId=id; _hfClassId=null; _hfFilter={search:'',status:'all'}; _hfPage=1;
    await loadDataForHolidaySession(id);
    _hfShell(document.getElementById('moduleContent')||
        document.querySelector('.module-wrap')?.parentElement, state.holidaySessions||[]);
};

function _hfDraw() {
    const el = document.getElementById('hf-body');
    if (!el) return;
    if (_hfTab==='overview')   _hfOverview(el);
    else if (_hfTab==='configure') _hfConfigure(el);
    else                        _hfPayment(el);
}

/* ══════════════════════════════════════════════════════════════════
   TAB 1: FEE OVERVIEW
   ══════════════════════════════════════════════════════════════════ */
function _hfOverview(el) {
    const classes = (state.sessionClasses||[]).filter(c=>c.holiday_session_id===_hfSessionId);

    // Build fee rows
    let fees = (state.holidayFees||[]).filter(f=>f.holiday_session_id===_hfSessionId);

    // Filter by class
    if (_hfClassId) {
        const enrollIds = new Set((state.holidayEnrollments||[])
            .filter(e=>e.session_class_id===_hfClassId).map(e=>e.student_id));
        fees = fees.filter(f=>enrollIds.has(f.student_id));
    }

    // Filter by status
    if (_hfFilter.status==='paid')    fees=fees.filter(f=>f.is_paid);
    if (_hfFilter.status==='unpaid')  fees=fees.filter(f=>!f.is_paid);
    if (_hfFilter.status==='pending') fees=fees.filter(f=>f.requires_approval&&f.is_approved===false);
    if (_hfFilter.status==='free')    fees=fees.filter(f=>Number(f.amount||0)===0);

    // Search
    if (_hfFilter.search) {
        const q=_hfFilter.search.toLowerCase();
        fees=fees.filter(f=>{
            const s=getStudent(f.student_id);
            return s&&`${s.first_name} ${s.last_name} ${s.code||''}`.toLowerCase().includes(q);
        });
    }

    const total=fees.length, start=(_hfPage-1)*_hfSize, paged=fees.slice(start,start+_hfSize);

    el.innerHTML = `
    <div class="filters-bar">
      <div class="filter-group">
        <label>Class</label>
        <select class="select" onchange="hfFilterClass(this.value)">
          <option value="">All Classes</option>
          ${classes.map(c=>`<option value="${c.id}"${c.id===_hfClassId?' selected':''}>${esc(c.name)}</option>`).join('')}
        </select>
      </div>
      <div class="filter-group">
        <label>Status</label>
        <select class="select" onchange="hfFilterStatus(this.value)">
          <option value="all">All</option>
          <option value="paid">Paid</option>
          <option value="unpaid">Unpaid</option>
          <option value="pending">Pending Approval</option>
          <option value="free">Free (no fee)</option>
        </select>
      </div>
      <div class="search-group">
        <i class="fa-solid fa-magnifying-glass"></i>
        <input type="text" class="input" placeholder="Search student…"
               oninput="hfSearch(this.value)">
      </div>
    </div>

    ${!paged.length
      ? `<div class="empty-state" style="padding:40px;">
           <div class="es-title">No fees found</div>
           <div class="es-sub">Enroll students and configure session fees to see data here.</div>
         </div>`
      : `<div class="table-wrap"><table class="data-table">
          <thead><tr>
            <th>Student</th><th>Class</th><th>Fee</th>
            <th class="text-right">Amount</th><th class="text-right">Discount</th>
            <th class="text-right">Net</th><th class="text-right">Paid</th>
            <th>Status</th><th>Actions</th>
          </tr></thead>
          <tbody>
          ${paged.map(f=>{
              const s   = getStudent(f.student_id);
              const cls = _hfClassForStudent(f.student_id);
              const amt = Number(f.amount||0);
              const wvd = Number(f.waived_amount||0);
              const net = amt-wvd;
              const paid= Number(f.paid_amount||0);
              const bal = Math.max(0, net-paid);

              let statusBadge;
              if (amt===0) statusBadge='<span class="badge" style="background:rgba(99,102,241,.15);color:#818cf8;">Free</span>';
              else if (f.is_paid) statusBadge='<span class="badge badge-success">Paid</span>';
              else if (f.requires_approval&&f.is_approved===false&&paid===0) statusBadge='<span class="badge badge-warning">Pending Approval</span>';
              else if (paid>0) statusBadge='<span class="badge" style="background:rgba(245,158,11,.15);color:#f59e0b;">Partial</span>';
              else statusBadge='<span class="badge badge-danger">Unpaid</span>';

              const canPay = !f.is_paid && (f.is_approved===true||!f.requires_approval) && net>0;

              return `<tr>
                <td><div class="student-cell">
                  <span class="student-name">${s?`${esc(s.last_name)}, ${esc(s.first_name)}`:`#${f.student_id}`}</span>
                  <span class="student-code">${s?esc(s.code||''):'—'}</span></div></td>
                <td style="font-size:12px;">${esc(cls?.name||'—')}</td>
                <td style="font-size:12px;">${esc(f.fee_name||'Holiday Fee')}</td>
                <td class="text-right">${fmtCurrency(amt)}</td>
                <td class="text-right" style="color:var(--color-success);">${wvd?`-${fmtCurrency(wvd)}`:'—'}</td>
                <td class="text-right" style="font-weight:600;">${fmtCurrency(net)}</td>
                <td class="text-right" style="color:var(--color-success);">${paid?fmtCurrency(paid):'—'}</td>
                <td>${statusBadge}</td>
                <td>
                  ${canPay?`<button class="btn btn-sm btn-primary" onclick="hfRecordPayment(${f.id})">
                    <i class="fa-solid fa-money-bill"></i> Pay</button>`:''}
                </td>
              </tr>`;
          }).join('')}
          </tbody>
        </table></div>
        <div class="table-footer">
          <span>${total} record${total!==1?'s':''}</span>
          <div style="display:flex;gap:6px;">
            ${_hfPage>1?`<button class="btn btn-sm btn-ghost" onclick="hfPage(${_hfPage-1})">Prev</button>`:''}
            ${start+_hfSize<total?`<button class="btn btn-sm btn-ghost" onclick="hfPage(${_hfPage+1})">Next</button>`:''}
          </div>
        </div>`}`;
}

function _hfClassForStudent(studentId) {
    const enroll = (state.holidayEnrollments||[]).find(e=>
        e.student_id===studentId && e.holiday_session_id===_hfSessionId);
    return enroll ? (state.sessionClasses||[]).find(c=>c.id===enroll.session_class_id) : null;
}

window.hfFilterClass  = v => { _hfClassId=v?parseInt(v):null; _hfPage=1; _hfDraw(); };
window.hfFilterStatus = v => { _hfFilter.status=v; _hfPage=1; _hfDraw(); };
window.hfSearch       = v => { _hfFilter.search=v; _hfPage=1; _hfDraw(); };
window.hfPage         = p => { _hfPage=p; _hfDraw(); };

/* ══════════════════════════════════════════════════════════════════
   TAB 2: CONFIGURE SESSION FEES
   Set fee amounts per holiday session (per class or global).
   Zero = free session. Fee auto-assigned on enrollment.
   ══════════════════════════════════════════════════════════════════ */
function _hfConfigure(el) {
    const classes = (state.sessionClasses||[]).filter(c=>c.holiday_session_id===_hfSessionId);
    const session = (state.holidaySessions||[]).find(s=>s.id===_hfSessionId);

    // Get configured fees for this session (stored as session metadata or fee_amounts with holiday_session_id)
    // We use a simple approach: store in constants or as a local state key
    const configuredFees = _hfGetSessionFeeConfig();

    el.innerHTML = `
    <div style="margin-bottom:16px;">
      <div class="alert alert-info">
        <i class="fa-solid fa-circle-info"></i>
        Configure the fees for this holiday session. When a student is enrolled in a class,
        the fee for that class is <strong>automatically assigned</strong> to them.
        Set amount to <strong>0 or leave empty</strong> for a free session class.
      </div>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px;">
      <!-- Global session fee -->
      <div class="section-card">
        <div class="section-header"><h3>Session-Wide Fee</h3></div>
        <p style="font-size:13px;color:var(--text-muted);margin-bottom:12px;">
          Applied to all students regardless of class (e.g. holiday programme fee).
          Leave at 0 if there is no session-wide fee.
        </p>
        <div class="form-group">
          <label class="field-label">Fee Name</label>
          <input type="text" id="hfc-global-name" class="input"
                 value="${esc(configuredFees.global?.name||'Holiday Programme Fee')}"
                 placeholder="e.g. Holiday Programme Fee">
        </div>
        <div class="form-group">
          <label class="field-label">Amount (RWF) — 0 = Free</label>
          <input type="number" id="hfc-global-amount" class="input"
                 value="${configuredFees.global?.amount||0}" min="0" step="1000">
        </div>
        <button class="btn btn-primary" onclick="hfSaveGlobalFee()">
          <i class="fa-solid fa-floppy-disk"></i> Save Session Fee</button>
      </div>

      <!-- Per-class fees -->
      <div class="section-card">
        <div class="section-header"><h3>Per-Class Fees (optional)</h3></div>
        <p style="font-size:13px;color:var(--text-muted);margin-bottom:12px;">
          Override session-wide fee per class (e.g. advanced class costs more).
        </p>
        ${classes.length ? classes.map(c=>{
            const classFee = configuredFees.perClass?.[c.id] || {};
            return `
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
              <span style="font-size:13px;font-weight:600;min-width:120px;">${esc(c.name)}</span>
              <input type="number" class="input" style="width:110px;"
                     id="hfc-class-${c.id}" value="${classFee.amount||0}" min="0" step="1000"
                     placeholder="0 = use global">
              <button class="btn btn-sm btn-secondary" onclick="hfSaveClassFee(${c.id})">Save</button>
            </div>`;}).join('')
          : '<div style="color:var(--text-muted);font-size:13px;">No classes in this session yet.</div>'}
      </div>
    </div>

    <div class="section-card">
      <div class="section-header"><h3>Auto-Assign Fees to All Enrolled Students</h3></div>
      <p style="font-size:13px;color:var(--text-muted);margin-bottom:12px;">
        Click below to auto-assign configured fees to all currently enrolled students
        who don't have a fee yet. Students already assigned a fee are skipped.
      </p>
      <button class="btn btn-primary" onclick="hfAutoAssignAll()">
        <i class="fa-solid fa-bolt"></i> Auto-Assign Fees to All Enrolled Students</button>
    </div>`;
}

function _hfGetSessionFeeConfig() {
    // Read from session metadata (stored in holiday_sessions.metadata or local state)
    const session = (state.holidaySessions||[]).find(s=>s.id===_hfSessionId);
    try {
        const meta = session?.fee_config ? JSON.parse(session.fee_config) : {};
        return meta;
    } catch(e) { return {}; }
}

window.hfSaveGlobalFee = async () => {
    const name   = cleanInput(document.getElementById('hfc-global-name')?.value) || 'Holiday Fee';
    const amount = parseInt(document.getElementById('hfc-global-amount')?.value||'0', 10) || 0;
    const config = _hfGetSessionFeeConfig();
    config.global = { name, amount };
    try {
        await update('holiday_sessions', _hfSessionId, {
            fee_config: JSON.stringify(config), updated_at: new Date().toISOString()
        });
        // Update local state
        const sess = (state.holidaySessions||[]).find(s=>s.id===_hfSessionId);
        if (sess) sess.fee_config = JSON.stringify(config);
        
        if (typeof loadAllData === 'function') loadAllData({ silent: true }).catch(() => {});
        showToast(`Session fee set: ${fmtCurrency(amount)} (${amount===0?'Free':name})`, 'success');
    } catch(e) { handleApiError(e, 'save session fee'); }
};

window.hfSaveClassFee = async classId => {
    const amount = parseInt(document.getElementById(`hfc-class-${classId}`)?.value||'0', 10) || 0;
    const config = _hfGetSessionFeeConfig();
    if (!config.perClass) config.perClass = {};
    config.perClass[classId] = { amount };
    try {
        await update('holiday_sessions', _hfSessionId, {
            fee_config: JSON.stringify(config), updated_at: new Date().toISOString()
        });
        const sess = (state.holidaySessions||[]).find(s=>s.id===_hfSessionId);
        if (sess) sess.fee_config = JSON.stringify(config);
        const cls = (state.sessionClasses||[]).find(c=>c.id===classId);
        
        if (typeof loadAllData === 'function') loadAllData({ silent: true }).catch(() => {});
        showToast(`${cls?.name||'Class'} fee: ${fmtCurrency(amount)}`, 'success');
    } catch(e) { handleApiError(e, 'save class fee'); }
};

window.hfAutoAssignAll = async () => {
    const enrollments = (state.holidayEnrollments||[]).filter(e=>e.holiday_session_id===_hfSessionId);
    if (!enrollments.length) { showToast('No enrolled students.', 'warning'); return; }

    const confirmed = await confirmDialog(
        `Auto-assign fees to ${enrollments.length} enrolled student(s)?`,
        'Auto-Assign Holiday Fees',
        { confirmText: 'Assign', confirmClass: 'btn-primary' }
    );
    if (!confirmed) return;

    const config = _hfGetSessionFeeConfig();
    const now    = new Date().toISOString();
    let created  = 0, skipped = 0;

    for (const enroll of enrollments) {
        // Check if fee already exists
        const exists = (state.holidayFees||[]).find(f=>
            f.student_id===enroll.student_id && f.holiday_session_id===_hfSessionId);
        if (exists) { skipped++; continue; }

        // Resolve fee amount: per-class override → global → 0 (free)
        const classOverride = config.perClass?.[enroll.session_class_id];
        const feeAmount = classOverride?.amount ?? config.global?.amount ?? 0;
        const feeName   = config.global?.name || 'Holiday Fee';

        if (feeAmount === 0) { skipped++; continue; } // free session — skip

        try {
            await insert('holiday_fees', {
                student_id         : enroll.student_id,
                holiday_session_id : _hfSessionId,
                session_class_id   : enroll.session_class_id,
                academic_year_id   : (state.holidaySessions||[]).find(s=>s.id===_hfSessionId)?.academic_year_id || null,
                fee_name           : feeName,
                amount             : feeAmount,
                waived_amount      : 0,
                paid_amount        : 0,
                is_paid            : false,
                requires_approval  : true,
                is_approved        : false,
                source             : 'holiday_enrollment',
                created_at         : now,
                updated_at         : now,
            });
            created++;
        } catch(e) { /* continue */ }
    }

    showToast(`${created} fee(s) assigned. ${skipped} skipped (already assigned or free).`, 'success');
    await loadDataForHolidaySession(_hfSessionId);
    _hfDraw();
};

/* ══════════════════════════════════════════════════════════════════
   TAB 3: RECORD PAYMENT
   Record payment against a student's holiday fee.
   Supports partial payment.
   ══════════════════════════════════════════════════════════════════ */
function _hfPayment(el) {
    const classes = (state.sessionClasses||[]).filter(c=>c.holiday_session_id===_hfSessionId);

    // Unpaid / partial fees for this session
    const unpaidFees = (state.holidayFees||[]).filter(f=>
        f.holiday_session_id===_hfSessionId &&
        !f.is_paid &&
        (f.is_approved===true || f.is_approved===null || !f.requires_approval) &&
        (Number(f.amount||0)-Number(f.waived_amount||0)) > 0
    );

    el.innerHTML = `
    <div class="two-col-grid" style="gap:16px;">
      <div>
        <div class="form-group">
          <label class="field-label">Student *</label>
          <input type="text" id="hfp-search" class="input" placeholder="Search by name or code…"
                 oninput="hfpSearch(this.value)">
          <div id="hfp-results" style="max-height:160px;overflow-y:auto;border:1px solid var(--border);
               border-radius:6px;margin-top:4px;display:none;"></div>
          <input type="hidden" id="hfp-student-id">
          <div id="hfp-student-chosen" style="margin-top:6px;font-size:13px;color:var(--color-success);"></div>
        </div>

        <div id="hfp-fee-list" style="margin-top:8px;">
          <div style="color:var(--text-muted);font-size:13px;">Select a student to see their fees.</div>
        </div>
      </div>

      <div class="section-card" style="background:rgba(255,255,255,.02);">
        <div class="section-header"><h3><i class="fa-solid fa-receipt"></i> Payment Form</h3></div>
        <div id="hfp-form">
          <div class="empty-state" style="padding:24px;">
            <div class="es-title" style="font-size:13px;">Select student + fee above</div>
          </div>
        </div>
      </div>
    </div>`;
}

let _hfpSelectedFeeId = null;

window.hfpSearch = q => {
    const res = document.getElementById('hfp-results');
    if (!res||!q||q.length<2) { if(res)res.style.display='none'; return; }
    const lower = q.toLowerCase();
    // Only show students with unpaid holiday fees for this session
    const studentIds = new Set((state.holidayFees||[])
        .filter(f=>f.holiday_session_id===_hfSessionId&&!f.is_paid)
        .map(f=>f.student_id));
    const matches = (state.students||[]).filter(s=>
        studentIds.has(s.id) &&
        `${s.first_name} ${s.last_name} ${s.code||''}`.toLowerCase().includes(lower)
    ).slice(0,8);
    if (!matches.length) {
        res.innerHTML='<div style="padding:8px 12px;font-size:13px;color:var(--text-muted);">No students with unpaid fees</div>';
        res.style.display='block'; return;
    }
    res.innerHTML = matches.map(s=>`
    <div style="padding:8px 12px;cursor:pointer;font-size:13px;border-bottom:1px solid var(--border);"
         onclick="hfpChoose(${s.id},'${esc(s.first_name+' '+s.last_name)}','${esc(s.code||'')}')">
      <strong>${esc(s.first_name)} ${esc(s.last_name)}</strong>
      <span style="color:var(--text-muted);margin-left:8px;">${esc(s.code||'')}</span>
    </div>`).join('');
    res.style.display='block';
};

window.hfpChoose = (id, name, code) => {
    document.getElementById('hfp-student-id').value=id;
    document.getElementById('hfp-search').value=`${name} (${code})`;
    document.getElementById('hfp-results').style.display='none';
    document.getElementById('hfp-student-chosen').textContent=`Selected: ${name}`;
    _hfpShowFees(id);
};

function _hfpShowFees(studentId) {
    const fees = (state.holidayFees||[]).filter(f=>
        f.student_id===studentId && f.holiday_session_id===_hfSessionId && !f.is_paid);
    const el = document.getElementById('hfp-fee-list');
    if (!el) return;
    if (!fees.length) {
        el.innerHTML=`<div style="color:var(--color-success);font-size:13px;padding:8px;">
            <i class="fa-solid fa-circle-check"></i> All fees paid for this student.</div>`;
        return;
    }
    el.innerHTML = `<div style="font-size:12px;font-weight:600;margin-bottom:8px;color:var(--text-muted);">
        Outstanding fees:</div>` +
    fees.map(f=>{
        const net = Number(f.amount||0)-Number(f.waived_amount||0);
        const bal = Math.max(0, net-Number(f.paid_amount||0));
        return `<div style="padding:8px 10px;border-radius:6px;background:rgba(255,255,255,.03);
                     margin-bottom:6px;cursor:pointer;border:1px solid ${_hfpSelectedFeeId===f.id?'var(--color-primary)':'var(--border)'};"
                onclick="hfpSelectFee(${f.id})">
          <div style="font-weight:600;font-size:13px;">${esc(f.fee_name||'Holiday Fee')}</div>
          <div style="font-size:11px;color:var(--text-muted);">
            Balance: ${fmtCurrency(bal)}
            ${f.waived_amount?` (incl. ${fmtCurrency(f.waived_amount)} discount)`:''}</div>
        </div>`;}).join('');
}

window.hfpSelectFee = feeId => {
    _hfpSelectedFeeId = feeId;
    const studentId = parseInt(document.getElementById('hfp-student-id')?.value||'0');
    _hfpShowFees(studentId);
    _hfpShowForm(feeId);
};

function _hfpShowForm(feeId) {
    const fee = (state.holidayFees||[]).find(f=>f.id===feeId);
    if (!fee) return;
    const net = Number(fee.amount||0)-Number(fee.waived_amount||0);
    const bal = Math.max(0, net-Number(fee.paid_amount||0));
    const formEl = document.getElementById('hfp-form');
    if (!formEl) return;

    formEl.innerHTML = `
    <div class="form-group">
      <label class="field-label">Fee</label>
      <div style="font-size:14px;font-weight:700;">${esc(fee.fee_name||'Holiday Fee')}</div>
      <div style="font-size:12px;color:var(--text-muted);">Balance: ${fmtCurrency(bal)}</div>
    </div>
    <div class="form-group">
      <label class="field-label">Amount to Pay (RWF) *</label>
      <input type="number" id="hfp-amount" class="input" min="1" max="${bal}"
             value="${bal}" step="500" placeholder="${bal}">
      <div style="font-size:11px;color:var(--text-muted);margin-top:3px;">
        Max: ${fmtCurrency(bal)}</div>
    </div>
    <div class="form-group">
      <label class="field-label">Payment Method *</label>
      <select id="hfp-method" class="select">
        <option value="cash">Cash</option>
        <option value="bank_transfer">Bank Transfer</option>
        <option value="mobile_money">Mobile Money</option>
        <option value="cheque">Cheque</option>
      </select>
    </div>
    <div class="form-group">
      <label class="field-label">Reference (optional)</label>
      <input type="text" id="hfp-ref" class="input" placeholder="Receipt / transaction ref">
    </div>
    <button class="btn btn-primary" style="width:100%;" onclick="hfpSubmit(${feeId},${bal})">
      <i class="fa-solid fa-check"></i> Record Payment</button>`;
}

window.hfpSubmit = async (feeId, balance) => {
    const amountInput = parseFloat(document.getElementById('hfp-amount')?.value||'0');
    const method      = document.getElementById('hfp-method')?.value||'cash';
    const ref         = cleanInput(document.getElementById('hfp-ref')?.value)||null;

    if (!amountInput||amountInput<=0) { showToast('Enter a valid amount.','warning'); return; }
    if (amountInput>balance) { showToast(`Amount cannot exceed balance of ${fmtCurrency(balance)}.`,'warning'); return; }

    const fee = (state.holidayFees||[]).find(f=>f.id===feeId);
    if (!fee) return;

    const newPaid   = Number(fee.paid_amount||0) + amountInput;
    const net       = Number(fee.amount||0)-Number(fee.waived_amount||0);
    const isPaid    = newPaid >= net;
    const now       = new Date().toISOString();

    try {
        await update('holiday_fees', feeId, {
            paid_amount  : newPaid,
            is_paid      : isPaid,
            is_approved  : true, // paying removes from approval queue
            updated_at   : now,
        });

        // Log to system_logs
        if (typeof insert === 'function') {
            insert('system_logs', {
                action_type : 'holiday_fee_payment',
                description : `Holiday fee payment: ${fmtCurrency(amountInput)} for student #${fee.student_id} — ${fee.fee_name||'Holiday Fee'}`,
                actor_id    : state.currentUser?.id || null,
                actor_name  : state.currentUser?.name || 'Unknown',
                created_at  : now,
                metadata    : JSON.stringify({ feeId, amount: amountInput, method, reference: ref }),
            }).catch(()=>{});
        }

        // Update local state
        const localFee = (state.holidayFees||[]).find(f=>f.id===feeId);
        if (localFee) { localFee.paid_amount=newPaid; localFee.is_paid=isPaid; localFee.is_approved=true; }

        showToast(`Payment of ${fmtCurrency(amountInput)} recorded.${isPaid?' Fee fully paid!':''}`, 'success');

        // Reset form
        _hfpSelectedFeeId = null;
        document.getElementById('hfp-search').value='';
        document.getElementById('hfp-student-id').value='';
        document.getElementById('hfp-student-chosen').textContent='';
        document.getElementById('hfp-fee-list').innerHTML=
            '<div style="color:var(--text-muted);font-size:13px;">Select a student.</div>';
        document.getElementById('hfp-form').innerHTML=
            '<div class="empty-state" style="padding:24px;"><div class="es-title" style="font-size:13px;">Payment recorded successfully</div></div>';

        // Refresh KPIs
        _hfShell(document.getElementById('moduleContent')||
            document.querySelector('.module-wrap')?.parentElement, state.holidaySessions||[]);
    } catch(e) { handleApiError(e, 'record holiday payment'); }
};

/* ── PUBLIC ── */
window.hfRecordPayment = feeId => {
    _hfTab = 'payment';
    _hfDraw();
    setTimeout(() => hfpSelectFee(feeId), 100);
};

window.renderHolidaysFees = renderHolidaysFees;
