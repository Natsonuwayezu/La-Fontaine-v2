/* ═══════════════════════════════════════════════════════════════════
   js/modules/students/enroll-student.js  v9.0
   ═══════════════════════════════════════════════════════════════════
   4-step enrollment wizard:
     Step 1 — Father / Mother / Guardian information (→ guardians table)
     Step 2 — Student personal details (all students table columns)
     Step 3 — Rwanda location (province→district→sector→cell→village)
     Step 4 — Fee assignment + initial payment
   On save:
     - insert('students', {...})           — all columns
     - insert('guardians', father)         — father row
     - insert('guardians', mother)         — mother row (if filled)
     - insert('student_guardians', link)   — father + mother links
     - insert('families', {...})           — or link existing
     - insert('class_enrollments', {...})  — historical roster
     - insert('student_class_history', {}) — audit trail
     - insert('student_fees', {...})       — per fee category
     - insert('payments', {...})           — if initial payment
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

// ── Module state ────────────────────────────────────────────────────
let _esStep        = 1;
let _esAddress     = { province:'', district:'', sector:'', cell:'', village:''}; 
let _esLocData     = null; // Rwanda location hierarchy cache
let _esLinkedFamily= null;

async function renderEnrollStudent(container, params = {}) {
    if (!container) return;
    await ensureStateLoaded();
    _esStep = 1;
    _esAddress = { province:'', district:'', sector:'', cell:'', village:''}; 
    _esLinkedFamily = null;
    _esShell(container);
}

function _esShell(container) {
    const year  = getActiveYear();
    const terms = (state.terms||[]).filter(t=>t.academic_year_id===year?.id).sort((a,b)=>a.term_number-b.term_number);
    const classes = (state.classes||[]).filter(c=>c.is_active!==false).sort((a,b)=>(a.sort_order||0)-(b.sort_order||0));

    container.innerHTML = `
    <div class="module-wrap">
      <div class="mod-topbar">
        <div class="mod-topbar-left">
          <h1 class="mod-title"><i class="fa-solid fa-user-plus"></i> Enroll Student</h1>
        </div>
        <div class="mod-topbar-right">
          <button class="btn btn-ghost" onclick="navigateTo('student-list')">
            <i class="fa-solid fa-arrow-left"></i> Back to Students</button>
        </div>
      </div>

      <!-- Step indicator -->
      <div class="enroll-steps" id="es-steps">
        ${[
          {n:1, label:'Guardian Info', icon:'fa-person'},
          {n:2, label:'Student Details', icon:'fa-child'},
          {n:3, label:'Location', icon:'fa-location-dot'},
          {n:4, label:'Fees & Payment', icon:'fa-coins'},
        ].map(s=>`
        <div class="enroll-step ${_esStep===s.n?'active':_esStep>s.n?'done':''}" id="es-step-tab-${s.n}">
          <div class="step-circle">${_esStep>s.n?'<i class="fa-solid fa-check"></i>':s.n}</div>
          <div class="step-label">${s.label}</div>
        </div>`).join('<div class="step-connector"></div>')}
      </div>

      <!-- Step panels -->
      <div class="section-card" id="es-panel">
        <!-- Rendered by _esRenderStep() -->
      </div>
    </div>`;

    _esRenderStep(year, classes, terms);
}

function _esRenderStep(year, classes, terms) {
    const panel = document.getElementById('es-panel');
    if (!panel) return;

    if (_esStep === 1) _esStep1(panel);
    else if (_esStep === 2) _esStep2(panel, classes);
    else if (_esStep === 3) _esStep3(panel);
    else if (_esStep === 4) _esStep4(panel, year, terms);

    // Update step tabs
    [1,2,3,4].forEach(n=>{
        const tab = document.getElementById(`es-step-tab-${n}`);
        if (tab) {
            tab.className = `enroll-step ${_esStep===n?'active':_esStep>n?'done':''}`;
            tab.querySelector('.step-circle').innerHTML =
                _esStep>n?'<i class="fa-solid fa-check"></i>':String(n);
        }
    });
}

/* ══ STEP 1 — GUARDIAN INFORMATION ════════════════════════════════ */
function _esStep1(panel) {
    panel.innerHTML = `
    <h3 style="margin-bottom:16px;"><i class="fa-solid fa-person"></i> Guardian Information</h3>
    <p style="color:var(--text-muted);font-size:13px;margin-bottom:16px;">
      Enter father and/or mother details. At least one guardian is required.
      Phone numbers will be used for communication.
    </p>

    <!-- FATHER -->
    <div class="section-divider" style="margin-bottom:12px;">
      <i class="fa-solid fa-person"></i> Father / Paternal Guardian
    </div>
    <div class="form-grid" style="margin-bottom:14px;">
      <div class="field">
        <label class="field-label">First Name</label>
        <input type="text" id="es-father-first" class="input" placeholder="First name">
      </div>
      <div class="field">
        <label class="field-label">Last Name</label>
        <input type="text" id="es-father-last" class="input" placeholder="Last name">
      </div>
      <div class="field">
        <label class="field-label">Phone <span style="color:var(--text-muted);font-size:11px;">(07xxxxxxxx)</span></label>
        <input type="tel" id="es-father-phone" class="input" placeholder="0780000000">
      </div>
      <div class="field">
        <label class="field-label">National ID <span style="color:var(--text-muted);font-size:11px;">(16 digits)</span></label>
        <input type="text" id="es-father-nid" class="input" placeholder="1 19XX X XXXXXXX X XX" maxlength="20">
      </div>
      <div class="field">
        <label class="field-label">Email</label>
        <input type="email" id="es-father-email" class="input" placeholder="email@example.com">
      </div>
      <div class="field">
        <label class="field-label">Occupation</label>
        <input type="text" id="es-father-occupation" class="input" placeholder="e.g. Teacher, Farmer, Business">
      </div>
      <div class="field">
        <label class="field-label">Employer / Business</label>
        <input type="text" id="es-father-employer" class="input" placeholder="e.g. School name, Ministry">
      </div>
    </div>

    <!-- MOTHER -->
    <div class="section-divider" style="margin-bottom:12px;">
      <i class="fa-solid fa-person-dress"></i> Mother / Maternal Guardian
    </div>
    <div class="form-grid" style="margin-bottom:20px;">
      <div class="field">
        <label class="field-label">First Name</label>
        <input type="text" id="es-mother-first" class="input" placeholder="First name">
      </div>
      <div class="field">
        <label class="field-label">Last Name</label>
        <input type="text" id="es-mother-last" class="input" placeholder="Last name">
      </div>
      <div class="field">
        <label class="field-label">Phone</label>
        <input type="tel" id="es-mother-phone" class="input" placeholder="0780000000">
      </div>
      <div class="field">
        <label class="field-label">National ID</label>
        <input type="text" id="es-mother-nid" class="input" placeholder="1 19XX X XXXXXXX X XX" maxlength="20">
      </div>
      <div class="field">
        <label class="field-label">Email</label>
        <input type="email" id="es-mother-email" class="input" placeholder="email@example.com">
      </div>
      <div class="field">
        <label class="field-label">Occupation</label>
        <input type="text" id="es-mother-occupation" class="input" placeholder="Occupation">
      </div>
      <div class="field">
        <label class="field-label">Employer / Business</label>
        <input type="text" id="es-mother-employer" class="input" placeholder="Employer">
      </div>
    </div>

    <!-- Sibling link -->
    <div class="section-divider" style="margin-bottom:12px;">
      <i class="fa-solid fa-people-group"></i> Sibling Link (optional)
    </div>
    <div class="form-group" style="margin-bottom:20px;">
      <label class="field-label">Search existing sibling to link family</label>
      <input type="text" id="es-sibling-search" class="input"
             placeholder="Type student name or code…"
             oninput="esSiblingSearch(this.value)">
      <div id="es-sibling-results" style="max-height:140px;overflow-y:auto;border:1px solid var(--border);
           border-radius:6px;margin-top:4px;display:none;"></div>
      <div id="es-sibling-chosen" style="margin-top:6px;font-size:13px;color:var(--color-success);"></div>
    </div>

    <div class="form-footer">
      <button class="btn btn-primary" onclick="esNext()">
        Next <i class="fa-solid fa-arrow-right"></i></button>
    </div>`;
}

/* ══ STEP 2 — STUDENT DETAILS ══════════════════════════════════════ */
function _esStep2(panel, classes) {
    const insuranceOptions = ['MUTUELLE DE SANTE','RSSB','MMI','RADIANT','SORAS','BRITAM','COGEBANQUE','Other'];
    panel.innerHTML = `
    <h3 style="margin-bottom:16px;"><i class="fa-solid fa-child"></i> Student Details</h3>
    <div class="form-grid">
      <div class="field">
        <label class="field-label">First Name *</label>
        <input type="text" id="es-first-name" class="input" placeholder="First name" required>
      </div>
      <div class="field">
        <label class="field-label">Last Name *</label>
        <input type="text" id="es-last-name" class="input" placeholder="Last name" required>
      </div>
      <div class="field">
        <label class="field-label">Class *</label>
        <select id="es-class" class="select" required>
          <option value="">— Select class —</option>
          ${classes.map(c=>`<option value="${c.id}">${esc(c.name)}</option>`).join('')}
        </select>
      </div>
      <div class="field">
        <label class="field-label">Gender</label>
        <select id="es-gender" class="select">
          <option value="">— Select —</option>
          <option value="Male">Male</option>
          <option value="Female">Female</option>
        </select>
      </div>
      <div class="field">
        <label class="field-label">Date of Birth</label>
        <input type="date" id="es-dob" class="input">
      </div>
      <div class="field">
        <label class="field-label">Birthplace (District)</label>
        <input type="text" id="es-birthplace" class="input" placeholder="e.g. Rubavu">
      </div>
      <div class="field">
        <label class="field-label">Nationality</label>
        <input type="text" id="es-nationality" class="input" placeholder="e.g. Rwandan" value="Rwandan">
      </div>
      <div class="field">
        <label class="field-label">Medical Insurance</label>
        <select id="es-insurance" class="select" onchange="esInsuranceChange()">
          <option value="">— Select —</option>
          ${insuranceOptions.map(o=>`<option value="${o==='Other'?'__other__':o}">${o}</option>`).join('')}
        </select>
      </div>
      <div class="field" id="es-insurance-other-wrap" style="display:none;">
        <label class="field-label">Other Insurance Name</label>
        <input type="text" id="es-insurance-other" class="input" placeholder="Specify insurance">
      </div>
      <div class="field">
        <label class="field-label">SDMS Code <span style="color:var(--text-muted);font-size:11px;">(if any)</span></label>
        <input type="text" id="es-sdms-code" class="input" placeholder="Ministry SDMS code">
      </div>
      <div class="field">
        <label class="field-label">Previous School</label>
        <input type="text" id="es-prev-school" class="input" placeholder="School name (transfers only)">
      </div>
      <div class="field">
        <label class="field-label">Previous School Marks (%)</label>
        <input type="number" id="es-prev-marks" class="input" min="0" max="100" step="0.1"
               placeholder="Average % from previous school">
      </div>
      <div class="field" style="grid-column:1/-1;">
        <label class="field-label">Notes</label>
        <textarea id="es-notes" class="input" rows="2"
                  placeholder="Any additional notes about this student…"></textarea>
      </div>
    </div>
    <div class="form-footer">
      <button class="btn btn-ghost" onclick="esPrev()">
        <i class="fa-solid fa-arrow-left"></i> Back</button>
      <button class="btn btn-primary" onclick="esNext()">
        Next <i class="fa-solid fa-arrow-right"></i></button>
    </div>`;
}

window.esInsuranceChange = () => {
    const sel = document.getElementById('es-insurance');
    const wrap = document.getElementById('es-insurance-other-wrap');
    if (wrap) wrap.style.display = sel?.value === '__other__' ? 'block' : 'none';
};

/* ══ STEP 3 — RWANDA LOCATION ══════════════════════════════════════ */
function _esStep3(panel) {
    panel.innerHTML = `
    <h3 style="margin-bottom:16px;"><i class="fa-solid fa-location-dot"></i> Home Location</h3>
    <p style="color:var(--text-muted);font-size:13px;margin-bottom:14px;">
      Select the student's home address from Rwanda's administrative divisions.
      All levels will be saved on the student's record.
    </p>
    <div class="form-grid" style="margin-bottom:20px;">
      <div class="field">
        <label class="field-label">Province</label>
        <select id="es-province" class="select" onchange="esProvinceChange()">
          <option value="">— Select province —</option>
        </select>
      </div>
      <div class="field">
        <label class="field-label">District</label>
        <select id="es-district" class="select" disabled onchange="esDistrictChange()">
          <option value="">— Select province first —</option>
        </select>
      </div>
      <div class="field">
        <label class="field-label">Sector</label>
        <select id="es-sector" class="select" disabled onchange="esSectorChange()">
          <option value="">— Select district first —</option>
        </select>
      </div>
      <div class="field">
        <label class="field-label">Cell</label>
        <select id="es-cell" class="select" disabled onchange="esCellChange()">
          <option value="">— Select sector first —</option>
        </select>
      </div>
      <div class="field">
        <label class="field-label">Village</label>
        <select id="es-village" class="select" disabled onchange="esVillageChange()">
          <option value="">— Select cell first —</option>
        </select>
      </div>
    </div>
    <div class="form-footer">
      <button class="btn btn-ghost" onclick="esPrev()">
        <i class="fa-solid fa-arrow-left"></i> Back</button>
      <button class="btn btn-primary" onclick="esNext()">
        Next <i class="fa-solid fa-arrow-right"></i></button>
    </div>`;

    _esLoadProvinces();
}

async function _esGetLocData() {
    if (_esLocData) return _esLocData;
    const rows = await getAll('rwanda_locations', 'order=province.asc,district.asc,sector.asc,cell.asc,village.asc').catch(()=>[]);
    const h = {};
    (rows||[]).forEach(r=>{
        if (!r.province||!r.district||!r.sector||!r.cell||!r.village) return;
        h[r.province] = h[r.province]||{};
        h[r.province][r.district] = h[r.province][r.district]||{};
        h[r.province][r.district][r.sector] = h[r.province][r.district][r.sector]||{};
        h[r.province][r.district][r.sector][r.cell] = h[r.province][r.district][r.sector][r.cell]||[];
        if (!h[r.province][r.district][r.sector][r.cell].includes(r.village))
            h[r.province][r.district][r.sector][r.cell].push(r.village);
    });
    _esLocData = h;
    return h;
}

async function _esLoadProvinces() {
    const data = await _esGetLocData();
    const sel = document.getElementById('es-province');
    if (!sel) return;
    const provinces = Object.keys(data).sort();
    sel.innerHTML = '<option value="">— Select province —</option>' +
        provinces.map(p=>`<option value="${esc(p)}" ${_esAddress.province===p?'selected':''}>
            ${esc(p)}</option>`).join('');
    if (_esAddress.province) esProvinceChange();
}

window.esProvinceChange = async () => {
    _esAddress.province = document.getElementById('es-province')?.value||'';
    _esAddress.district = _esAddress.sector = _esAddress.cell = _esAddress.village = '';
    _esClearSel('es-district','— Select province first —');
    _esClearSel('es-sector','— Select district first —');
    _esClearSel('es-cell','— Select sector first —');
    _esClearSel('es-village','— Select cell first —');
    if (!_esAddress.province) return;
    const data = await _esGetLocData();
    const districts = Object.keys(data[_esAddress.province]||{}).sort();
    const sel = document.getElementById('es-district');
    if (!sel) return;
    sel.disabled = false;
    sel.innerHTML = '<option value="">— Select district —</option>' +
        districts.map(d=>`<option value="${esc(d)}">${esc(d)}</option>`).join('');
};

window.esDistrictChange = async () => {
    _esAddress.district = document.getElementById('es-district')?.value||'';
    _esAddress.sector = _esAddress.cell = _esAddress.village = '';
    _esClearSel('es-sector','— Select district first —');
    _esClearSel('es-cell','— Select sector first —');
    _esClearSel('es-village','— Select cell first —');
    if (!_esAddress.district) return;
    const data = await _esGetLocData();
    const sectors = Object.keys(data[_esAddress.province]?.[_esAddress.district]||{}).sort();
    const sel = document.getElementById('es-sector');
    if (!sel) return;
    sel.disabled = false;
    sel.innerHTML = '<option value="">— Select sector —</option>' +
        sectors.map(s=>`<option value="${esc(s)}">${esc(s)}</option>`).join('');
};

window.esSectorChange = async () => {
    _esAddress.sector = document.getElementById('es-sector')?.value||'';
    _esAddress.cell = _esAddress.village = '';
    _esClearSel('es-cell','— Select sector first —');
    _esClearSel('es-village','— Select cell first —');
    if (!_esAddress.sector) return;
    const data = await _esGetLocData();
    const cells = Object.keys(data[_esAddress.province]?.[_esAddress.district]?.[_esAddress.sector]||{}).sort();
    const sel = document.getElementById('es-cell');
    if (!sel) return;
    sel.disabled = false;
    sel.innerHTML = '<option value="">— Select cell —</option>' +
        cells.map(c=>`<option value="${esc(c)}">${esc(c)}</option>`).join('');
};

window.esCellChange = async () => {
    _esAddress.cell = document.getElementById('es-cell')?.value||'';
    _esAddress.village = '';
    _esClearSel('es-village','— Select cell first —');
    if (!_esAddress.cell) return;
    const data = await _esGetLocData();
    const villages = (data[_esAddress.province]?.[_esAddress.district]?.[_esAddress.sector]?.[_esAddress.cell]||[]).sort();
    const sel = document.getElementById('es-village');
    if (!sel) return;
    sel.disabled = false;
    sel.innerHTML = '<option value="">— Select village —</option>' +
        villages.map(v=>`<option value="${esc(v)}">${esc(v)}</option>`).join('');
};

window.esVillageChange = () => {
    _esAddress.village = document.getElementById('es-village')?.value||'';
};

function _esClearSel(id, placeholder) {
    const sel = document.getElementById(id);
    if (!sel) return;
    sel.disabled = true;
    sel.innerHTML = `<option value="">${esc(placeholder)}</option>`;
}

/* ══ STEP 4 — FEES & PAYMENT ═══════════════════════════════════════ */
function _esStep4(panel, year, terms) {
    const feeCats = (state.feeCategories||[]).filter(c=>c.is_active!==false);
    panel.innerHTML = `
    <h3 style="margin-bottom:16px;"><i class="fa-solid fa-coins"></i> Fee Assignment & Initial Payment</h3>

    <div class="section-divider" style="margin-bottom:12px;">
      <i class="fa-solid fa-tags"></i> Fee Categories
    </div>
    <p style="color:var(--text-muted);font-size:13px;margin-bottom:12px;">
      Select fees to assign. Enter amount paid today (leave 0 if not paid yet).
      Entered amount less than full price creates an automatic discount (waiver).
    </p>
    <div id="es-fee-list" style="margin-bottom:18px;">
      ${feeCats.length ? feeCats.map(fc=>`
      <div style="display:flex;align-items:center;gap:10px;padding:10px 0;
           border-bottom:1px solid var(--border);">
        <input type="checkbox" id="es-fee-${fc.id}" style="width:16px;height:16px;cursor:pointer;"
               onchange="esFeeToggle(${fc.id})">
        <div style="flex:1;">
          <div style="font-size:13px;font-weight:600;">${esc(fc.name)}</div>
          <div style="font-size:11px;color:var(--text-muted);">
            Full amount: ${fmtCurrency(fc.default_amount||0)}</div>
        </div>
        <div style="display:flex;align-items:center;gap:6px;">
          <span style="font-size:12px;color:var(--text-muted);">RWF</span>
          <input type="number" id="es-fee-amt-${fc.id}" class="input" style="width:120px;"
                 value="${fc.default_amount||0}" min="0" step="500" disabled
                 oninput="esFeeAmtChange(${fc.id},${fc.default_amount||0})">
        </div>
      </div>
      <div id="es-fee-discount-${fc.id}" style="font-size:11px;color:var(--color-success);
           padding-left:26px;display:none;">
        <i class="fa-solid fa-tag"></i> Discount: <span></span> will be waived
      </div>`)  .join('') :
      '<div class="empty-state" style="padding:24px;"><div class="es-title">No fee categories configured</div><div class="es-sub">Add fee categories in Finance → Fee Structure first.</div></div>'}
    </div>

    <div class="section-divider" style="margin-bottom:12px;">
      <i class="fa-solid fa-money-bill-wave"></i> Initial Payment (optional)
    </div>
    <div class="form-grid" style="margin-bottom:16px;">
      <div class="field">
        <label class="field-label">Payment Method</label>
        <select id="es-pay-method" class="select">
          <option value="Cash">Cash</option>
          <option value="Bank Transfer">Bank Transfer</option>
          <option value="Mobile Money">Mobile Money (MTN/Airtel)</option>
          <option value="Cheque">Cheque</option>
        </select>
      </div>
      <div class="field">
        <label class="field-label">Reference / Receipt Note</label>
        <input type="text" id="es-pay-ref" class="input" placeholder="Transaction reference (optional)">
      </div>
    </div>

    <div class="alert alert-info" style="margin-bottom:16px;">
      <i class="fa-solid fa-circle-info"></i>
      All assigned fees will be sent to the <strong>Fee Approvals</strong> queue.
      Fees paid in full today will be auto-approved.
    </div>

    <div class="form-footer" style="justify-content:space-between;">
      <button class="btn btn-ghost" onclick="esPrev()">
        <i class="fa-solid fa-arrow-left"></i> Back</button>
      <button class="btn btn-primary" onclick="esSubmit()" id="es-submit-btn">
        <i class="fa-solid fa-user-plus"></i> Enroll Student</button>
    </div>`;
}

window.esFeeToggle = (fcId) => {
    const cb  = document.getElementById(`es-fee-${fcId}`);
    const inp = document.getElementById(`es-fee-amt-${fcId}`);
    if (!inp) return;
    inp.disabled = !cb?.checked;
    if (!cb?.checked) {
        document.getElementById(`es-fee-discount-${fcId}`)?.style && (document.getElementById(`es-fee-discount-${fcId}`).style.display='none');
    }
};

window.esFeeAmtChange = (fcId, fullAmt) => {
    const amt = parseFloat(document.getElementById(`es-fee-amt-${fcId}`)?.value||'0');
    const discEl = document.getElementById(`es-fee-discount-${fcId}`);
    if (!discEl) return;
    const discount = fullAmt > 0 && amt < fullAmt ? fullAmt - amt : 0;
    discEl.style.display = discount > 0 ? 'block' : 'none';
    const span = discEl.querySelector('span');
    if (span) span.textContent = fmtCurrency(discount);
};

/* ══ NAVIGATION ════════════════════════════════════════════════════ */
window.esNext = () => {
    if (!_esValidateStep()) return;
    _esStep++;
    const year  = getActiveYear();
    const terms = (state.terms||[]).filter(t=>t.academic_year_id===year?.id);
    const classes = (state.classes||[]).filter(c=>c.is_active!==false);
    _esRenderStep(year, classes, terms);
    document.getElementById('es-panel')?.scrollIntoView({behavior:'smooth'});
};

window.esPrev = () => {
    _esStep--;
    const year  = getActiveYear();
    const terms = (state.terms||[]).filter(t=>t.academic_year_id===year?.id);
    const classes = (state.classes||[]).filter(c=>c.is_active!==false);
    _esRenderStep(year, classes, terms);
};

function _esValidateStep() {
    if (_esStep === 1) {
        const fFirst = cleanInput(document.getElementById('es-father-first')?.value);
        const mFirst = cleanInput(document.getElementById('es-mother-first')?.value);
        if (!fFirst && !mFirst) {
            showToast('Enter at least father or mother first name.', 'warning');
            return false;
        }
        const fPhone = document.getElementById('es-father-phone')?.value?.trim();
        const mPhone = document.getElementById('es-mother-phone')?.value?.trim();
        if (fPhone && !/^(07|\+250)\d{8,9}$/.test(fPhone.replace(/\s/g,''))) {
            showToast('Father phone format: 07XXXXXXXX or +250XXXXXXXXX', 'warning'); return false;
        }
        if (mPhone && !/^(07|\+250)\d{8,9}$/.test(mPhone.replace(/\s/g,''))) {
            showToast('Mother phone format: 07XXXXXXXX or +250XXXXXXXXX', 'warning'); return false;
        }
        return true;
    }
    if (_esStep === 2) {
        if (!cleanInput(document.getElementById('es-first-name')?.value)) {
            showToast('Student first name is required.', 'warning'); return false;
        }
        if (!cleanInput(document.getElementById('es-last-name')?.value)) {
            showToast('Student last name is required.', 'warning'); return false;
        }
        if (!document.getElementById('es-class')?.value) {
            showToast('Class selection is required.', 'warning'); return false;
        }
        const dob = document.getElementById('es-dob')?.value;
        if (dob) {
            const age = (new Date() - new Date(dob)) / (365.25*24*3600*1000);
            if (age < 3 || age > 25) {
                showToast('Date of birth seems incorrect — check the year.', 'warning'); return false;
            }
        }
        return true;
    }
    return true; // Step 3 (location) and 4 (fees) are optional
}

/* ══ SIBLING SEARCH ════════════════════════════════════════════════ */
window.esSiblingSearch = (q) => {
    const res = document.getElementById('es-sibling-results');
    if (!res || !q || q.length < 2) { if(res) res.style.display='none'; return; }
    const lower = q.toLowerCase();
    const matches = (state.students||[]).filter(s=>
        s.status!=='Archived' && !s.is_deleted &&
        `${s.first_name} ${s.last_name} ${s.code||''  }`.toLowerCase().includes(lower)
    ).slice(0,8);
    if (!matches.length) {
        res.innerHTML='<div style="padding:8px 12px;font-size:13px;color:var(--text-muted);">No results</div>';
        res.style.display='block'; return;
    }
    res.innerHTML = matches.map(s=>`
    <div style="padding:8px 12px;cursor:pointer;font-size:13px;border-bottom:1px solid var(--border);"
         onclick="esChooseSibling(${s.id},'${esc(s.first_name+' '+s.last_name)}',${s.family_id||'null'})">
      <strong>${esc(s.first_name)} ${esc(s.last_name)}</strong>
      <span style="color:var(--text-muted);margin-left:8px;">${esc(s.code||''  )}</span>
      ${s.family_id?'<span style="color:var(--color-success);margin-left:6px;font-size:11px;">Family linked</span>':''}
    </div>`).join('');
    res.style.display='block';
};

window.esChooseSibling = (id, name, familyId) => {
    if (familyId) {
        _esLinkedFamily = { id: familyId, siblingId: id };
        document.getElementById('es-sibling-results').style.display='none';
        document.getElementById('es-sibling-search').value = name;
        document.getElementById('es-sibling-chosen').textContent = `Linked to family of ${name}`;
    } else {
        showToast('This student has no family record yet.', 'info');
    }
};

/* ══ SUBMIT ════════════════════════════════════════════════════════ */
window.esSubmit = async () => {
    const btn = document.getElementById('es-submit-btn');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving…'; }

    const now = new Date().toISOString();
    const today = now.split('T')[0];
    const year  = getActiveYear();

    try {
        // ── READ FORM DATA ────────────────────────────────────────────
        const g = id => cleanInput(document.getElementById(id)?.value);

        const father = {
            first_name    : g('es-father-first'),
            last_name     : g('es-father-last'),
            phone         : g('es-father-phone')||null,
            national_id   : g('es-father-nid')||null,
            email         : g('es-father-email')||null,
            occupation    : g('es-father-occupation')||null,
            employer      : g('es-father-employer')||null,
            guardian_type : 'father',
            is_primary    : true,
            is_active     : true,
        };
        const mother = {
            first_name    : g('es-mother-first'),
            last_name     : g('es-mother-last'),
            phone         : g('es-mother-phone')||null,
            national_id   : g('es-mother-nid')||null,
            email         : g('es-mother-email')||null,
            occupation    : g('es-mother-occupation')||null,
            employer      : g('es-mother-employer')||null,
            guardian_type : 'mother',
            is_primary    : false,
            is_active     : true,
        };

        const insuranceRaw = document.getElementById('es-insurance')?.value;
        const insurance = insuranceRaw === '__other__' ? g('es-insurance-other') : insuranceRaw;
        const classId  = parseInt(document.getElementById('es-class')?.value||'0');
        const prevMarks = parseFloat(document.getElementById('es-prev-marks')?.value||'0')||null;

        // ── 1. CREATE FAMILY (or link existing) ───────────────────────
        let familyId = _esLinkedFamily?.id || null;
        if (!familyId && father.first_name) {
            const primaryName = `${father.first_name} ${father.last_name}`.trim();
            const primaryPhone = father.phone || mother.phone;
            const familyResult = await insert('families', {
                family_code    : `FAM-${new Date().getFullYear()}-${Date.now().toString().slice(-4)}`,
                guardian_name  : primaryName || null,
                guardian_phone : primaryPhone || null,
                guardian_email : father.email || mother.email || null,
                address        : [_esAddress.sector, _esAddress.district, _esAddress.province].filter(Boolean).join(', ')|null,
                created_at     : now,
                updated_at     : now,
            });
            familyId = familyResult?.id || null;
        }

        // ── 2. INSERT FATHER GUARDIAN ─────────────────────────────────
        let fatherId = null;
        if (father.first_name) {
            const fRes = await insert('guardians', {
                ...father,
                family_id  : familyId,
                province   : _esAddress.province||null,
                district   : _esAddress.district||null,
                sector     : _esAddress.sector||null,
                cell       : _esAddress.cell||null,
                village    : _esAddress.village||null,
                created_at : now,
                updated_at : now,
            });
            fatherId = fRes?.id||null;
        }

        // ── 3. INSERT MOTHER GUARDIAN ─────────────────────────────────
        let motherId = null;
        if (mother.first_name) {
            const mRes = await insert('guardians', {
                ...mother,
                family_id  : familyId,
                province   : _esAddress.province||null,
                district   : _esAddress.district||null,
                sector     : _esAddress.sector||null,
                cell       : _esAddress.cell||null,
                village    : _esAddress.village||null,
                created_at : now,
                updated_at : now,
            });
            motherId = mRes?.id||null;
        }

        // ── 4. INSERT STUDENT ─────────────────────────────────────────
        const studentCode = typeof generateStudentCode==='function'
            ? generateStudentCode() : `STU-${new Date().getFullYear()}-${Date.now().toString().slice(-4)}`;

        const studentPayload = {
            student_code          : studentCode,
            first_name            : g('es-first-name'),
            last_name             : g('es-last-name'),
            class_id              : classId||null,
            gender                : document.getElementById('es-gender')?.value||null,
            date_of_birth         : document.getElementById('es-dob')?.value||null,
            birthplace            : g('es-birthplace')||null,
            nationality           : g('es-nationality')||'Rwandan',
            medical_insurance     : insurance||null,
            sdms_code             : g('es-sdms-code')||null,
            previous_school       : g('es-prev-school')||null,
            previous_school_marks : prevMarks,
            province              : _esAddress.province||null,
            district              : _esAddress.district||null,
            sector                : _esAddress.sector||null,
            cell                  : _esAddress.cell||null,
            village               : _esAddress.village||null,
            address               : [_esAddress.village, _esAddress.cell, _esAddress.sector, _esAddress.district, _esAddress.province].filter(Boolean).join(', ')||null,
            // Legacy flat guardian fields for backward compat
            guardian_name         : father.first_name ? `${father.first_name} ${father.last_name}`.trim() : (mother.first_name ? `${mother.first_name} ${mother.last_name}`.trim() : null),
            guardian_phone        : father.phone || mother.phone || null,
            guardian_email        : father.email || mother.email || null,
            family_id             : familyId,
            enrollment_date       : today,
            academic_year_id      : year?.id||null,
            status                : 'Active',
            is_deleted            : false,
            notes                 : g('es-notes')||null,
            created_at            : now,
            updated_at            : now,
        };

        const studentResult = await insert('students', studentPayload);
        if (!studentResult) throw new Error('Failed to create student record');
        const studentId = studentResult.id;

        // ── 5. LINK GUARDIANS VIA student_guardians ───────────────────
        if (fatherId) {
            await insert('student_guardians', {
                student_id          : studentId,
                guardian_id         : fatherId,
                relationship        : 'father',
                is_emergency_contact: true,
                created_at          : now,
            }).catch(()=>{});
        }
        if (motherId) {
            await insert('student_guardians', {
                student_id          : studentId,
                guardian_id         : motherId,
                relationship        : 'mother',
                is_emergency_contact: !fatherId,
                created_at          : now,
            }).catch(()=>{});
        }

        // ── 6. CLASS ENROLLMENT (historical roster) ───────────────────
        const currentTerm = getActiveTerm();
        if (classId && year?.id) {
            await insert('class_enrollments', {
                student_id       : studentId,
                class_id         : classId,
                academic_year_id : year.id,
                term_id          : currentTerm?.id||null,
                enrollment_date  : today,
                is_active        : true,
                status           : 'active',
                enrolled_by      : state.currentUser?.id||null,
                notes            : 'Enrolled via enrollment form',
                created_at       : now,
                updated_at       : now,
            }).catch(()=>{});

            await insert('student_class_history', {
                student_id       : studentId,
                class_id         : classId,
                academic_year_id : year.id,
                term_id          : currentTerm?.id||null,
                start_date       : today,
                end_date         : null,
                status           : 'active',
                reason           : 'new_enrollment',
                recorded_by      : state.currentUser?.id||null,
                created_at       : now,
            }).catch(()=>{});
        }

        // ── 7. FEE ASSIGNMENT ─────────────────────────────────────────
        const feeCats = (state.feeCategories||[]).filter(c=>c.is_active!==false);
        let totalPaidToday = 0;
        const assignedFees = [];

        for (const fc of feeCats) {
            const cb = document.getElementById(`es-fee-${fc.id}`);
            if (!cb?.checked) continue;
            const enteredAmt = parseFloat(document.getElementById(`es-fee-amt-${fc.id}`)?.value||'0')||0;
            const fullAmt    = Number(fc.default_amount||0);
            const discount   = enteredAmt < fullAmt ? Math.max(0, fullAmt - enteredAmt) : 0;
            const netAmt     = fullAmt - discount;
            const isPaid     = enteredAmt >= netAmt && netAmt > 0;
            if (isPaid) totalPaidToday += enteredAmt;

            const feeResult = await insert('student_fees', {
                student_id        : studentId,
                fee_category_id   : fc.id,
                fee_name          : fc.name,
                amount            : fullAmt,
                waived_amount     : discount,
                paid_amount       : isPaid ? enteredAmt : 0,
                is_paid           : isPaid,
                is_waived         : false,
                requires_approval : !isPaid,
                is_approved       : isPaid,
                source            : 'enrollment',
                academic_year_id  : year?.id||null,
                term_id           : currentTerm?.id||null,
                due_date          : currentTerm?.end_date||null,
                notes             : `Assigned at enrollment — ${fc.name}`,
                created_at        : now,
                updated_at        : now,
            });
            if (feeResult) {
                assignedFees.push({...feeResult, enteredAmt, isPaid});
                if (isPaid) {
                    await insert('fee_approval_log', {
                        student_fee_id : feeResult.id,
                        student_id     : studentId,
                        action         : 'auto_approved',
                        acted_by       : state.currentUser?.id||null,
                        acted_at       : now,
                        note           : 'Auto-approved: paid in full at enrollment.',
                    }).catch(()=>{});
                }
            }
        }

        // ── 8. INITIAL PAYMENT ────────────────────────────────────────
        if (totalPaidToday > 0) {
            const receiptNumber = `RCT-${new Date().getFullYear()}${String(new Date().getMonth()+1).padStart(2,'0')}-${Date.now().toString().slice(-4)}`;
            const payMethod  = document.getElementById('es-pay-method')?.value||'Cash';
            const payRef     = g('es-pay-ref')||null;

            const payResult = await insert('payments', {
                student_id       : studentId,
                amount           : totalPaidToday,
                payment_date     : today,
                payment_method   : payMethod,
                receipt_number   : receiptNumber,
                reference        : payRef,
                notes            : `Initial enrollment payment — ${studentPayload.first_name} ${studentPayload.last_name}`,
                recorded_by      : state.currentUser?.id||null,
                recorded_by_name : state.currentUser?.name||null,
                academic_year_id : year?.id||null,
                term_id          : currentTerm?.id||null,
                created_at       : now,
                updated_at       : now,
            });

            // Payment allocations — link to each paid fee
            if (payResult?.id) {
                for (const fee of assignedFees.filter(f=>f.isPaid)) {
                    await insert('payment_allocations', {
                        payment_id     : payResult.id,
                        student_fee_id : fee.id,
                        amount         : fee.enteredAmt,
                        notes          : 'Enrollment payment allocation',
                        created_at     : now,
                    }).catch(()=>{});
                }
            }
        }

        // ── 9. LOG + NOTIFY ───────────────────────────────────────────
        if (typeof logAction==='function') {
            logAction('student_enrolled', 'students', studentId, {
                name  : `${studentPayload.first_name} ${studentPayload.last_name}`,
                class : classId,
                year  : year?.year_name,
                fees  : assignedFees.length,
                paid  : totalPaidToday,
            });
        }

        // ── 10. RELOAD AND NAVIGATE ───────────────────────────────────
        await loadAllData({ silent: true });
        showToast(
            `${studentPayload.first_name} ${studentPayload.last_name} enrolled successfully!`,
            'success'
        );
        navigateTo('student-list');

    } catch(err) {
        handleApiError(err, 'student enrollment');
        if (btn) { btn.disabled=false; btn.innerHTML='<i class="fa-solid fa-user-plus"></i> Enroll Student'; }
    }
};

window.renderEnrollStudent = renderEnrollStudent;
