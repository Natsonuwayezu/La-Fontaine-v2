/* ═══════════════════════════════════════════════════════════════════
   js/modules/students/enroll-student.js  v9.1
   ═══════════════════════════════════════════════════════════════════
   Multi-student enrollment wizard (siblings from same family).
   4 steps — shared guardian info, multiple student cards, location,
   fee ASSIGNMENT only (no payment recording here).

   IMPORTANT: Fee recording is done in Finance → Record Payment.
   Here we only create student_fees rows (approval queue entries).
   A fee is auto-approved ONLY when its assigned amount = 0 (free).
   All non-zero fees go to the approval queue for admin/accountant.

   DB writes on submit:
     - families            × 1
     - guardians           × 2 (father + mother if filled)
     - student_guardians   × 2 per student
     - students            × N (one per student card)
     - class_enrollments   × N
     - student_class_history × N
     - student_fees        × N × fees (assignment only, no payment)
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

// ── Module state ────────────────────────────────────────────────────
let _esStep    = 1;
let _esLocData = null;
let _esAddr    = { province:'', district:'', sector:'', cell:'', village:'' };
window._esStudents = [{}]; // array of student objects, one per card

const ES_INSURANCE = ['MUTUELLE DE SANTE','RSSB','MMI','RADIANT','SORAS','BRITAM','COGEBANQUE'];
const ES_NATIONALITIES = ['Rwandan','Congolese','Ugandan','Burundian','Tanzanian','Kenyan','Other'];

// ── Entry point ──────────────────────────────────────────────────────
async function renderEnrollStudent(container, params = {}) {
    if (!container) return;
    await ensureStateLoaded();
    _esStep = 1;
    _esAddr = { province:'', district:'', sector:'', cell:'', village:'' };
    _esLocData = null;
    window._esStudents = [{}];
    _esShell(container);
}

function _esShell(container) {
    container.innerHTML = `
    <div class="module-wrap">
      <div class="mod-topbar">
        <div class="mod-topbar-left">
          <h1 class="mod-title"><i class="fa-solid fa-user-plus"></i> Enroll Students</h1>
          <span class="badge badge-neutral" style="margin-left:8px;">
            ${esc(getActiveYear()?.year_name||'—')}</span>
        </div>
        <div class="mod-topbar-right">
          <button class="btn btn-ghost" onclick="navigateTo('student-list')">
            <i class="fa-solid fa-arrow-left"></i> Back</button>
        </div>
      </div>

      <!-- Steps bar -->
      <div style="display:flex;align-items:center;gap:0;margin-bottom:20px;" id="es-step-bar">
        ${[
          {n:1,label:'Guardian Info',icon:'fa-person'},
          {n:2,label:'Students',icon:'fa-children'},
          {n:3,label:'Location',icon:'fa-location-dot'},
          {n:4,label:'Fee Assignment',icon:'fa-tags'},
        ].map((s,i,arr) => `
        <div class="enroll-step ${_esStep===s.n?'active':_esStep>s.n?'done':''}"
             id="es-tab-${s.n}"
             style="display:flex;align-items:center;gap:8px;padding:8px 16px;
             border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;
             background:${_esStep===s.n?'var(--color-primary)':_esStep>s.n?'rgba(74,222,128,.15)':'rgba(255,255,255,.04)'};
             color:${_esStep===s.n?'#fff':_esStep>s.n?'var(--color-success)':'var(--text-muted)'};
             transition:.15s;">
          <i class="fa-solid ${s.icon}"></i>${s.label}
          ${_esStep>s.n?'<i class="fa-solid fa-check" style="margin-left:4px;"></i>':''}
        </div>
        ${i<arr.length-1?'<div style="flex:1;height:2px;background:rgba(255,255,255,.06);"></div>':''}
        `).join('')}
      </div>

      <div class="section-card" id="es-panel"></div>
    </div>`;

    _esDraw();
}

function _esDraw() {
    // Update step tabs
    [1,2,3,4].forEach(n => {
        const tab = document.getElementById(`es-tab-${n}`);
        if (!tab) return;
        const active = _esStep === n, done = _esStep > n;
        tab.style.background = active ? 'var(--color-primary)' : done ? 'rgba(74,222,128,.15)' : 'rgba(255,255,255,.04)';
        tab.style.color = active ? '#fff' : done ? 'var(--color-success)' : 'var(--text-muted)';
    });

    const panel = document.getElementById('es-panel');
    if (!panel) return;

    if (_esStep === 1) _esStep1(panel);
    else if (_esStep === 2) _esStep2(panel);
    else if (_esStep === 3) _esStep3(panel);
    else if (_esStep === 4) _esStep4(panel);
}

// ══ STEP 1 — GUARDIAN INFORMATION ════════════════════════════════════
function _esStep1(panel) {
    panel.innerHTML = `
    <h3 style="margin-bottom:4px;"><i class="fa-solid fa-person"></i> Guardian Information</h3>
    <p style="color:var(--text-muted);font-size:13px;margin-bottom:18px;">
      Enter family guardian details — shared for all students in this enrollment.
      At least one guardian (father or mother) is required.
    </p>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-bottom:20px;">
      <!-- FATHER -->
      <div>
        <div style="font-weight:700;font-size:12px;text-transform:uppercase;letter-spacing:.5px;
             color:var(--text-muted);margin-bottom:12px;border-bottom:1px solid var(--border);padding-bottom:6px;">
          <i class="fa-solid fa-person"></i> Father / Paternal Guardian
        </div>
        <div class="form-group"><label class="field-label">First Name</label>
          <input type="text" id="es-father-first" class="input" placeholder="First name"></div>
        <div class="form-group"><label class="field-label">Last Name</label>
          <input type="text" id="es-father-last" class="input" placeholder="Last name"></div>
        <div class="form-group"><label class="field-label">Phone</label>
          <input type="tel" id="es-father-phone" class="input" placeholder="07XXXXXXXX"></div>
        <div class="form-group"><label class="field-label">National ID</label>
          <input type="text" id="es-father-nid" class="input" placeholder="1 19XX X XXXXXXX X XX" maxlength="20"></div>
        <div class="form-group"><label class="field-label">Email</label>
          <input type="email" id="es-father-email" class="input" placeholder="email@example.com"></div>
        <div class="form-group"><label class="field-label">Occupation</label>
          <input type="text" id="es-father-occupation" class="input" placeholder="e.g. Teacher, Farmer"></div>
        <div class="form-group"><label class="field-label">Employer</label>
          <input type="text" id="es-father-employer" class="input" placeholder="e.g. Ministry, School name"></div>
      </div>

      <!-- MOTHER -->
      <div>
        <div style="font-weight:700;font-size:12px;text-transform:uppercase;letter-spacing:.5px;
             color:var(--text-muted);margin-bottom:12px;border-bottom:1px solid var(--border);padding-bottom:6px;">
          <i class="fa-solid fa-person-dress"></i> Mother / Maternal Guardian
        </div>
        <div class="form-group"><label class="field-label">First Name</label>
          <input type="text" id="es-mother-first" class="input" placeholder="First name"></div>
        <div class="form-group"><label class="field-label">Last Name</label>
          <input type="text" id="es-mother-last" class="input" placeholder="Last name"></div>
        <div class="form-group"><label class="field-label">Phone</label>
          <input type="tel" id="es-mother-phone" class="input" placeholder="07XXXXXXXX"></div>
        <div class="form-group"><label class="field-label">National ID</label>
          <input type="text" id="es-mother-nid" class="input" placeholder="1 19XX X XXXXXXX X XX" maxlength="20"></div>
        <div class="form-group"><label class="field-label">Email</label>
          <input type="email" id="es-mother-email" class="input" placeholder="email@example.com"></div>
        <div class="form-group"><label class="field-label">Occupation</label>
          <input type="text" id="es-mother-occupation" class="input" placeholder="Occupation"></div>
        <div class="form-group"><label class="field-label">Employer</label>
          <input type="text" id="es-mother-employer" class="input" placeholder="Employer"></div>
      </div>
    </div>

    <!-- Sibling link -->
    <div style="margin-bottom:20px;">
      <label class="field-label">
        <i class="fa-solid fa-people-group"></i>
        Link to existing family (search by sibling name or code)
      </label>
      <input type="text" id="es-sibling-search" class="input"
             style="margin-top:4px;"
             placeholder="Type sibling name or code to find their family…"
             oninput="esSibSearch(this.value)">
      <div id="es-sibling-results" style="display:none;max-height:160px;overflow-y:auto;
           border:1px solid var(--border);border-radius:6px;margin-top:4px;"></div>
      <div id="es-sibling-chosen" style="margin-top:6px;font-size:13px;color:var(--color-success);"></div>
    </div>

    <div style="display:flex;justify-content:flex-end;">
      <button class="btn btn-primary" onclick="esNext()">
        Next: Students <i class="fa-solid fa-arrow-right"></i></button>
    </div>`;
}

window.esSibSearch = q => {
    const res = document.getElementById('es-sibling-results');
    if (!res || !q || q.length < 2) { if(res) res.style.display='none'; return; }
    const lower = q.toLowerCase();
    const matches = (state.students||[]).filter(s =>
        s.status !== 'Archived' && !s.is_deleted &&
        `${s.first_name} ${s.last_name} ${s.student_code||s.code||''}`.toLowerCase().includes(lower)
    ).slice(0,8);
    if (!matches.length) {
        res.innerHTML='<div style="padding:8px 12px;font-size:13px;color:var(--text-muted);">No results</div>';
        res.style.display='block'; return;
    }
    res.innerHTML = matches.map(s=>`
    <div style="padding:8px 12px;cursor:pointer;font-size:13px;border-bottom:1px solid var(--border);"
         onclick="esPickSibling(${s.id},'${esc(s.first_name+' '+s.last_name)}',${s.family_id||'null'})">
      <strong>${esc(s.first_name)} ${esc(s.last_name)}</strong>
      <span style="color:var(--text-muted);margin-left:8px;">${esc(s.student_code||s.code||'')}</span>
      ${s.family_id?'<span style="color:var(--color-success);margin-left:6px;font-size:11px;"><i class="fa-solid fa-link"></i> Family</span>':''}
    </div>`).join('');
    res.style.display='block';
};

window.esPickSibling = (id, name, familyId) => {
    window._esLinkedFamilyId = familyId || null;
    const res = document.getElementById('es-sibling-results');
    const search = document.getElementById('es-sibling-search');
    const chosen = document.getElementById('es-sibling-chosen');
    if (res) res.style.display='none';
    if (search) search.value = name;
    if (chosen) chosen.innerHTML = familyId
        ? `<i class="fa-solid fa-check"></i> Linked to family of ${esc(name)}`
        : `<i class="fa-solid fa-info-circle"></i> ${esc(name)} has no family record yet`;
};

// ══ STEP 2 — STUDENT CARDS ═══════════════════════════════════════════
function _esStep2(panel) {
    const classes = (state.classes||[]).filter(c=>c.is_active!==false)
        .sort((a,b)=>(a.sort_order||0)-(b.sort_order||0));

    panel.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
      <h3 style="margin:0;"><i class="fa-solid fa-children"></i>
        Students <span id="es-student-count" style="font-size:14px;color:var(--text-muted);">(${window._esStudents.length})</span>
      </h3>
      <button class="btn btn-secondary" onclick="esAddStudent()">
        <i class="fa-solid fa-plus"></i> Add Another Student</button>
    </div>

    <div id="es-cards-container">
      <!-- Cards rendered by esRenderCards() -->
    </div>

    <div style="display:flex;justify-content:space-between;margin-top:16px;">
      <button class="btn btn-ghost" onclick="esPrev()">
        <i class="fa-solid fa-arrow-left"></i> Back</button>
      <button class="btn btn-primary" onclick="esNext()">
        Next: Location <i class="fa-solid fa-arrow-right"></i></button>
    </div>`;

    esRenderCards(classes);
}

window.esRenderCards = (classes) => {
    if (!classes) {
        classes = (state.classes||[]).filter(c=>c.is_active!==false)
            .sort((a,b)=>(a.sort_order||0)-(b.sort_order||0));
    }
    const container = document.getElementById('es-cards-container');
    if (!container) return;

    const count = document.getElementById('es-student-count');
    if (count) count.textContent = `(${window._esStudents.length})`;

    container.innerHTML = window._esStudents.map((s, idx) => `
    <div style="border:1px solid var(--border);border-radius:10px;padding:16px;margin-bottom:14px;
         background:rgba(255,255,255,.02);">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">
        <strong style="font-size:14px;"><i class="fa-solid fa-user-graduate"></i>
          Student ${idx+1}${s.firstName?' — '+esc(s.firstName)+(s.lastName?' '+esc(s.lastName):''):''}</strong>
        ${window._esStudents.length > 1
          ? `<button class="btn btn-sm btn-danger" onclick="esRemoveStudent(${idx})">
               <i class="fa-solid fa-xmark"></i> Remove</button>` : ''}
      </div>
      <div class="form-grid">
        <div class="field"><label class="field-label">First Name *</label>
          <input type="text" id="es-first-${idx}" class="input"
                 value="${esc(s.firstName||'')}"
                 oninput="esReadCard(${idx})" placeholder="First name"></div>
        <div class="field"><label class="field-label">Last Name *</label>
          <input type="text" id="es-last-${idx}" class="input"
                 value="${esc(s.lastName||'')}"
                 oninput="esReadCard(${idx})" placeholder="Last name"></div>
        <div class="field"><label class="field-label">Class *</label>
          <select id="es-class-${idx}" class="select"
                  onchange="esReadCard(${idx});esRenderFeeSection()">
            <option value="">— Select class —</option>
            ${classes.map(c=>`<option value="${c.id}" ${String(s.classId)===String(c.id)?'selected':''}>${esc(c.name)}</option>`).join('')}
          </select></div>
        <div class="field"><label class="field-label">Gender</label>
          <select id="es-gender-${idx}" class="select" onchange="esReadCard(${idx})">
            <option value="">— Select —</option>
            <option value="Male"   ${s.gender==='Male'?'selected':''}>Male</option>
            <option value="Female" ${s.gender==='Female'?'selected':''}>Female</option>
          </select></div>
        <div class="field"><label class="field-label">Date of Birth</label>
          <input type="date" id="es-dob-${idx}" class="input"
                 value="${esc(s.dob||'')}" onchange="esReadCard(${idx})"></div>
        <div class="field"><label class="field-label">Birthplace (District)</label>
          <input type="text" id="es-birthplace-${idx}" class="input"
                 value="${esc(s.birthplace||'')}" placeholder="e.g. Rubavu"
                 oninput="esReadCard(${idx})"></div>
        <div class="field"><label class="field-label">Nationality</label>
          <select id="es-nationality-${idx}" class="select" onchange="esReadCard(${idx})">
            <option value="">— Select —</option>
            ${ES_NATIONALITIES.map(n=>`<option value="${n}" ${s.nationality===n?'selected':''}>${n}</option>`).join('')}
          </select></div>
        <div class="field"><label class="field-label">Medical Insurance</label>
          <select id="es-insurance-${idx}" class="select" onchange="esInsuranceChange(${idx})">
            <option value="">— None / Unknown —</option>
            ${ES_INSURANCE.map(o=>`<option value="${o}" ${s.insurance===o?'selected':''}>${o}</option>`).join('')}
            <option value="__other__" ${s.insurance&&!ES_INSURANCE.includes(s.insurance)?'selected':''}>Other</option>
          </select></div>
        <div class="field" id="es-ins-other-wrap-${idx}"
             style="${s.insurance&&!ES_INSURANCE.includes(s.insurance)?'':'display:none;'}">
          <label class="field-label">Other Insurance Name</label>
          <input type="text" id="es-insurance-other-${idx}" class="input"
                 value="${s.insurance&&!ES_INSURANCE.includes(s.insurance)?esc(s.insurance):''}"
                 oninput="esReadCard(${idx})" placeholder="Specify insurance name"></div>
        <div class="field"><label class="field-label">SDMS Code</label>
          <input type="text" id="es-sdms-${idx}" class="input"
                 value="${esc(s.sdmsCode||'')}" placeholder="Ministry code (optional)"
                 oninput="esReadCard(${idx})"></div>
        <div class="field"><label class="field-label">Previous School</label>
          <input type="text" id="es-prevschool-${idx}" class="input"
                 value="${esc(s.previousSchool||'')}" placeholder="Transfers only"
                 oninput="esReadCard(${idx})"></div>
        <div class="field" style="grid-column:1/-1;"><label class="field-label">Notes</label>
          <textarea id="es-notes-${idx}" class="input" rows="2"
                    oninput="esReadCard(${idx})"
                    placeholder="Any notes about this student…">${esc(s.notes||'')}</textarea></div>
      </div>
    </div>`).join('');
};

window.esReadCard = idx => {
    const g = id => document.getElementById(id)?.value?.trim() || '';
    const insRaw = g(`es-insurance-${idx}`);
    const s = window._esStudents[idx] || {};
    window._esStudents[idx] = {
        ...s,
        firstName      : g(`es-first-${idx}`),
        lastName       : g(`es-last-${idx}`),
        classId        : g(`es-class-${idx}`),
        gender         : g(`es-gender-${idx}`),
        dob            : g(`es-dob-${idx}`),
        birthplace     : g(`es-birthplace-${idx}`),
        nationality    : g(`es-nationality-${idx}`),
        insurance      : insRaw === '__other__' ? g(`es-insurance-other-${idx}`) : insRaw,
        sdmsCode       : g(`es-sdms-${idx}`),
        previousSchool : g(`es-prevschool-${idx}`),
        notes          : document.getElementById(`es-notes-${idx}`)?.value?.trim()||'',
    };
};

window.esInsuranceChange = idx => {
    const sel  = document.getElementById(`es-insurance-${idx}`);
    const wrap = document.getElementById(`es-ins-other-wrap-${idx}`);
    if (wrap) wrap.style.display = sel?.value === '__other__' ? 'block' : 'none';
    esReadCard(idx);
};

window.esAddStudent = () => {
    // Read all existing cards first
    window._esStudents.forEach((_, i) => esReadCard(i));
    window._esStudents.push({});
    esRenderCards();
};

window.esRemoveStudent = idx => {
    if (window._esStudents.length <= 1) { showToast('At least one student is required.', 'warning'); return; }
    window._esStudents.forEach((_, i) => esReadCard(i));
    window._esStudents.splice(idx, 1);
    esRenderCards();
};

// ══ STEP 3 — RWANDA LOCATION CASCADE ═════════════════════════════════
function _esStep3(panel) {
    panel.innerHTML = `
    <h3 style="margin-bottom:4px;"><i class="fa-solid fa-location-dot"></i> Home Location</h3>
    <p style="color:var(--text-muted);font-size:13px;margin-bottom:16px;">
      The family home location — shared for all students in this enrollment.
      Select from Rwanda's administrative hierarchy.
    </p>
    <div class="form-grid" style="margin-bottom:20px;">
      <div class="field"><label class="field-label">Province</label>
        <select id="es-province" class="select" onchange="esProvinceChange()">
          <option value="">— Select province —</option>
        </select></div>
      <div class="field"><label class="field-label">District</label>
        <select id="es-district" class="select" disabled onchange="esDistrictChange()">
          <option value="">— Select province first —</option>
        </select></div>
      <div class="field"><label class="field-label">Sector</label>
        <select id="es-sector" class="select" disabled onchange="esSectorChange()">
          <option value="">— Select district first —</option>
        </select></div>
      <div class="field"><label class="field-label">Cell</label>
        <select id="es-cell" class="select" disabled onchange="esCellChange()">
          <option value="">— Select sector first —</option>
        </select></div>
      <div class="field"><label class="field-label">Village</label>
        <select id="es-village" class="select" disabled onchange="esVillageChange()">
          <option value="">— Select cell first —</option>
        </select></div>
    </div>
    <div style="display:flex;justify-content:space-between;">
      <button class="btn btn-ghost" onclick="esPrev()">
        <i class="fa-solid fa-arrow-left"></i> Back</button>
      <button class="btn btn-primary" onclick="esNext()">
        Next: Fee Assignment <i class="fa-solid fa-arrow-right"></i></button>
    </div>`;

    _esLoadProvinces();
}

async function _esGetLoc() {
    if (_esLocData) return _esLocData;
    const rows = await getAll('rwanda_locations',
        'order=province.asc,district.asc,sector.asc,cell.asc,village.asc'
    ).catch(() => []);
    const h = {};
    (rows||[]).forEach(r => {
        if (!r.province) return;
        h[r.province] = h[r.province] || {};
        if (!r.district) return;
        h[r.province][r.district] = h[r.province][r.district] || {};
        if (!r.sector) return;
        h[r.province][r.district][r.sector] = h[r.province][r.district][r.sector] || {};
        if (!r.cell) return;
        h[r.province][r.district][r.sector][r.cell] = h[r.province][r.district][r.sector][r.cell] || [];
        if (r.village && !h[r.province][r.district][r.sector][r.cell].includes(r.village))
            h[r.province][r.district][r.sector][r.cell].push(r.village);
    });
    _esLocData = h;
    return h;
}

async function _esLoadProvinces() {
    const data = await _esGetLoc();
    const sel = document.getElementById('es-province');
    if (!sel) return;
    const provinces = Object.keys(data).sort();
    sel.innerHTML = '<option value="">— Select province —</option>' +
        provinces.map(p => `<option value="${esc(p)}"${_esAddr.province===p?' selected':''}>${esc(p)}</option>`).join('');
    if (_esAddr.province) esProvinceChange();
}

function _esClear(id, label) {
    const s = document.getElementById(id);
    if (!s) return;
    s.disabled = true;
    s.innerHTML = `<option value="">${esc(label)}</option>`;
}

window.esProvinceChange = async () => {
    _esAddr.province = document.getElementById('es-province')?.value || '';
    _esAddr.district = _esAddr.sector = _esAddr.cell = _esAddr.village = '';
    _esClear('es-district', '— Select province first —');
    _esClear('es-sector',   '— Select district first —');
    _esClear('es-cell',     '— Select sector first —');
    _esClear('es-village',  '— Select cell first —');
    if (!_esAddr.province) return;
    const data = await _esGetLoc();
    const sel = document.getElementById('es-district');
    if (!sel) return;
    sel.disabled = false;
    sel.innerHTML = '<option value="">— Select district —</option>' +
        Object.keys(data[_esAddr.province]||{}).sort()
            .map(d => `<option value="${esc(d)}">${esc(d)}</option>`).join('');
};

window.esDistrictChange = async () => {
    _esAddr.district = document.getElementById('es-district')?.value || '';
    _esAddr.sector = _esAddr.cell = _esAddr.village = '';
    _esClear('es-sector',  '— Select district first —');
    _esClear('es-cell',    '— Select sector first —');
    _esClear('es-village', '— Select cell first —');
    if (!_esAddr.district) return;
    const data = await _esGetLoc();
    const sel = document.getElementById('es-sector');
    if (!sel) return;
    sel.disabled = false;
    sel.innerHTML = '<option value="">— Select sector —</option>' +
        Object.keys(data[_esAddr.province]?.[_esAddr.district]||{}).sort()
            .map(s => `<option value="${esc(s)}">${esc(s)}</option>`).join('');
};

window.esSectorChange = async () => {
    _esAddr.sector = document.getElementById('es-sector')?.value || '';
    _esAddr.cell = _esAddr.village = '';
    _esClear('es-cell',    '— Select sector first —');
    _esClear('es-village', '— Select cell first —');
    if (!_esAddr.sector) return;
    const data = await _esGetLoc();
    const sel = document.getElementById('es-cell');
    if (!sel) return;
    sel.disabled = false;
    sel.innerHTML = '<option value="">— Select cell —</option>' +
        Object.keys(data[_esAddr.province]?.[_esAddr.district]?.[_esAddr.sector]||{}).sort()
            .map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join('');
};

window.esCellChange = async () => {
    _esAddr.cell = document.getElementById('es-cell')?.value || '';
    _esAddr.village = '';
    _esClear('es-village', '— Select cell first —');
    if (!_esAddr.cell) return;
    const data = await _esGetLoc();
    const sel = document.getElementById('es-village');
    if (!sel) return;
    sel.disabled = false;
    sel.innerHTML = '<option value="">— Select village —</option>' +
        (data[_esAddr.province]?.[_esAddr.district]?.[_esAddr.sector]?.[_esAddr.cell]||[]).sort()
            .map(v => `<option value="${esc(v)}">${esc(v)}</option>`).join('');
};

window.esVillageChange = () => {
    _esAddr.village = document.getElementById('es-village')?.value || '';
};

// ══ STEP 4 — FEE ASSIGNMENT ═══════════════════════════════════════════
function _esStep4(panel) {
    panel.innerHTML = `
    <h3 style="margin-bottom:4px;"><i class="fa-solid fa-tags"></i> Fee Assignment</h3>
    <div class="alert alert-info" style="margin-bottom:14px;font-size:13px;">
      <i class="fa-solid fa-circle-info"></i>
      <strong>Fee assignment only</strong> — this creates fee records for each student.
      Actual payment recording is done in <strong>Finance → Record Payment</strong>.
      All assigned fees go to the approval queue. Admin or accountant approves before
      they appear in finance reports.
    </div>

    <div id="es-fee-section">
      <!-- Rendered by esRenderFeeSection() -->
    </div>

    <div style="display:flex;justify-content:space-between;margin-top:16px;">
      <button class="btn btn-ghost" onclick="esPrev()">
        <i class="fa-solid fa-arrow-left"></i> Back</button>
      <button class="btn btn-primary" id="es-submit-btn" onclick="esSubmit()">
        <i class="fa-solid fa-user-plus"></i> Enroll ${window._esStudents.length} Student${window._esStudents.length>1?'s':''}</button>
    </div>`;

    esRenderFeeSection();
}

window.esRenderFeeSection = () => {
    const container = document.getElementById('es-fee-section');
    if (!container) return;

    // Read all student cards first
    window._esStudents.forEach((_, i) => {
        try { esReadCard(i); } catch(e) {}
    });

    const yearId   = getActiveYear()?.id;
    const withClass = window._esStudents.map((s,i) => ({...s, idx:i})).filter(s => s.classId);

    if (!withClass.length) {
        container.innerHTML = `<div class="alert alert-warning">
          <i class="fa-solid fa-triangle-exclamation"></i>
          Select a class for at least one student to see available fees.</div>`;
        return;
    }

    container.innerHTML = withClass.map(s => {
        const cls = (state.classes||[]).find(c => String(c.id) === String(s.classId));
        // Get fee amounts for this class and year
        const feeAmounts = (state.feeAmounts||[]).filter(fa =>
            String(fa.class_id) === String(s.classId) &&
            (!yearId || fa.academic_year_id === yearId)
        );
        // Fallback to all fee categories if no class-specific amounts
        const fees = feeAmounts.length
            ? feeAmounts.map(fa => {
                const cat = (state.feeCategories||[]).find(c => c.id === fa.fee_category_id);
                return { feeAmountId: fa.id, categoryId: fa.fee_category_id,
                         name: cat?.name||'Fee', amount: fa.amount };
              })
            : (state.feeCategories||[]).filter(c=>c.is_active!==false).map(c => ({
                feeAmountId: null, categoryId: c.id, name: c.name, amount: c.default_amount||0
              }));

        const label = `${s.firstName||'Student '+(s.idx+1)}${s.lastName?' '+s.lastName:''}`.trim();

        if (!fees.length) return `
        <div style="border:1px solid var(--border);border-radius:8px;padding:12px 16px;margin-bottom:12px;">
          <div style="font-weight:600;">${esc(label)}</div>
          <div style="color:var(--text-muted);font-size:13px;margin-top:4px;">
            No fees configured for <strong>${esc(cls?.name||'this class')}</strong> yet.
            Add fees in Finance → Fee Structure.</div>
        </div>`;

        return `
        <div style="border:1px solid var(--border);border-radius:8px;padding:14px 16px;margin-bottom:12px;">
          <div style="font-weight:600;margin-bottom:10px;">
            ${esc(label)}
            <span style="color:var(--text-muted);font-weight:400;font-size:12px;margin-left:8px;">
              ${esc(cls?.name||'')}</span>
          </div>
          ${fees.map(f => `
          <div style="display:flex;align-items:center;gap:10px;padding:7px 0;
               border-bottom:1px solid var(--border);flex-wrap:wrap;">
            <input type="checkbox" class="es-fee-cb"
                   id="es-fee-cb-${s.idx}-${f.categoryId}"
                   data-idx="${s.idx}" data-cat="${f.categoryId}" checked
                   style="width:16px;height:16px;cursor:pointer;flex-shrink:0;"
                   onchange="esFeeToggle(${s.idx},${f.categoryId})">
            <label for="es-fee-cb-${s.idx}-${f.categoryId}"
                   style="flex:1;min-width:120px;font-size:13px;cursor:pointer;">
              ${esc(f.name)}</label>
            <div style="display:flex;align-items:center;gap:4px;">
              <span style="font-size:12px;color:var(--text-muted);">RWF</span>
              <input type="number" id="es-fee-amt-${s.idx}-${f.categoryId}"
                     data-idx="${s.idx}" data-cat="${f.categoryId}"
                     class="input" style="width:130px;text-align:right;"
                     value="${f.amount||0}" min="0" step="500"
                     oninput="esFeeAmtChange(${s.idx},${f.categoryId},${f.amount||0})">
            </div>
          </div>
          <div id="es-fee-note-${s.idx}-${f.categoryId}"
               style="font-size:11px;color:var(--color-success);padding-left:26px;display:none;">
            <i class="fa-solid fa-tag"></i> <span></span> will be waived (discount)
          </div>`).join('')}
        </div>`;
    }).join('');
};

window.esFeeToggle = (idx, catId) => {
    const cb  = document.getElementById(`es-fee-cb-${idx}-${catId}`);
    const inp = document.getElementById(`es-fee-amt-${idx}-${catId}`);
    if (inp) inp.disabled = !cb?.checked;
    if (!cb?.checked) {
        const note = document.getElementById(`es-fee-note-${idx}-${catId}`);
        if (note) note.style.display = 'none';
    }
};

window.esFeeAmtChange = (idx, catId, fullAmt) => {
    const amt  = parseFloat(document.getElementById(`es-fee-amt-${idx}-${catId}`)?.value||'0')||0;
    const note = document.getElementById(`es-fee-note-${idx}-${catId}`);
    if (!note) return;
    const discount = fullAmt > 0 && amt < fullAmt ? fullAmt - amt : 0;
    note.style.display = discount > 0 ? 'block' : 'none';
    const span = note.querySelector('span');
    if (span) span.textContent = fmtCurrency(discount);
};

// ══ NAVIGATION ════════════════════════════════════════════════════════
window.esNext = () => {
    if (!_esValidateStep(_esStep)) return;
    // Sync all cards before moving
    if (_esStep === 2) window._esStudents.forEach((_, i) => esReadCard(i));
    _esStep++;
    _esDraw();
    window.scrollTo({top:0, behavior:'smooth'});
};

window.esPrev = () => {
    _esStep--;
    _esDraw();
    window.scrollTo({top:0, behavior:'smooth'});
};

function _esValidateStep(step) {
    if (step === 1) {
        const fFirst = document.getElementById('es-father-first')?.value?.trim();
        const mFirst = document.getElementById('es-mother-first')?.value?.trim();
        if (!fFirst && !mFirst) {
            showToast('Enter at least father or mother first name.', 'warning'); return false;
        }
        return true;
    }
    if (step === 2) {
        window._esStudents.forEach((_, i) => esReadCard(i));
        for (let i = 0; i < window._esStudents.length; i++) {
            const s = window._esStudents[i];
            if (!s.firstName) { showToast(`Student ${i+1}: first name is required.`, 'warning'); return false; }
            if (!s.lastName)  { showToast(`Student ${i+1}: last name is required.`, 'warning'); return false; }
            if (!s.classId)   { showToast(`Student ${i+1}: class selection is required.`, 'warning'); return false; }
        }
        return true;
    }
    return true; // steps 3 and 4 have no hard blockers
}

// ══ SUBMIT ════════════════════════════════════════════════════════════
window.esSubmit = async () => {
    window._esStudents.forEach((_, i) => esReadCard(i));
    const btn = document.getElementById('es-submit-btn');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Enrolling…'; }

    const g   = id => document.getElementById(id)?.value?.trim() || '';
    const now = new Date().toISOString();
    const today = now.split('T')[0];
    const year  = getActiveYear();
    const term  = getActiveTerm();

    // ── Read guardian data ──────────────────────────────────────────
    const father = {
        first_name    : g('es-father-first'),
        last_name     : g('es-father-last'),
        phone         : g('es-father-phone') || null,
        national_id   : g('es-father-nid')   || null,
        email         : g('es-father-email')  || null,
        occupation    : g('es-father-occupation') || null,
        employer      : g('es-father-employer')   || null,
        guardian_type : 'father',
        is_primary    : true,
        is_active     : true,
    };
    const mother = {
        first_name    : g('es-mother-first'),
        last_name     : g('es-mother-last'),
        phone         : g('es-mother-phone') || null,
        national_id   : g('es-mother-nid')   || null,
        email         : g('es-mother-email')  || null,
        occupation    : g('es-mother-occupation') || null,
        employer      : g('es-mother-employer')   || null,
        guardian_type : 'mother',
        is_primary    : false,
        is_active     : true,
    };

    const addressLine = [_esAddr.village, _esAddr.cell, _esAddr.sector,
                         _esAddr.district, _esAddr.province].filter(Boolean).join(', ') || null;
    const primaryName  = father.first_name
        ? `${father.first_name} ${father.last_name||''}`.trim()
        : `${mother.first_name||''} ${mother.last_name||''}`.trim();
    const primaryPhone = father.phone || mother.phone || null;

    let enrolled = 0, errors = 0;

    try {
        // ── 1. Create or reuse family ─────────────────────────────
        let familyId = window._esLinkedFamilyId || null;
        if (!familyId) {
            const famResult = await insert('families', {
                family_code    : `FAM-${new Date().getFullYear()}-${Date.now().toString().slice(-5)}`,
                guardian_name  : primaryName  || null,
                guardian_phone : primaryPhone || null,
                guardian_email : father.email || mother.email || null,
                address        : addressLine,
                total_children : window._esStudents.length,
                active_children: window._esStudents.length,
                created_at     : now,
                updated_at     : now,
            });
            familyId = famResult?.id || null;
        }

        // ── 2. Insert father guardian ─────────────────────────────
        let fatherId = null;
        if (father.first_name) {
            const fRes = await insert('guardians', {
                ...father,
                family_id  : familyId,
                province   : _esAddr.province || null,
                district   : _esAddr.district || null,
                sector     : _esAddr.sector   || null,
                cell       : _esAddr.cell     || null,
                village    : _esAddr.village  || null,
                address    : addressLine,
                created_at : now,
                updated_at : now,
            });
            fatherId = fRes?.id || null;
        }

        // ── 3. Insert mother guardian ─────────────────────────────
        let motherId = null;
        if (mother.first_name) {
            const mRes = await insert('guardians', {
                ...mother,
                family_id  : familyId,
                province   : _esAddr.province || null,
                district   : _esAddr.district || null,
                sector     : _esAddr.sector   || null,
                cell       : _esAddr.cell     || null,
                village    : _esAddr.village  || null,
                address    : addressLine,
                created_at : now,
                updated_at : now,
            });
            motherId = mRes?.id || null;
        }

        // ── 4. Enroll each student ────────────────────────────────
        for (const s of window._esStudents) {
            try {
                const code = typeof generateStudentCode === 'function'
                    ? generateStudentCode()
                    : `STU-${new Date().getFullYear()}-${Date.now().toString().slice(-4)}`;

                const studentPayload = {
                    student_code          : code,
                    first_name            : s.firstName,
                    last_name             : s.lastName,
                    class_id              : parseInt(s.classId) || null,
                    gender                : s.gender            || null,
                    date_of_birth         : s.dob               || null,
                    birthplace            : s.birthplace        || null,
                    nationality           : s.nationality        || 'Rwandan',
                    medical_insurance     : s.insurance          || null,
                    sdms_code             : s.sdmsCode           || null,
                    previous_school       : s.previousSchool     || null,
                    notes                 : s.notes              || null,
                    province              : _esAddr.province     || null,
                    district              : _esAddr.district     || null,
                    sector                : _esAddr.sector       || null,
                    cell                  : _esAddr.cell         || null,
                    village               : _esAddr.village      || null,
                    address               : addressLine,
                    guardian_name         : primaryName          || null,
                    guardian_phone        : primaryPhone         || null,
                    guardian_email        : father.email || mother.email || null,
                    family_id             : familyId,
                    enrollment_date       : today,
                    academic_year_id      : year?.id             || null,
                    status                : 'Active',
                    is_deleted            : false,
                    created_at            : now,
                    updated_at            : now,
                };

                const stuResult = await insert('students', studentPayload);
                if (!stuResult?.id) { errors++; continue; }
                const studentId = stuResult.id;

                // Update state immediately so next code() call sees this student
                if (state.students) state.students.push(stuResult);

                // ── Link guardians ──────────────────────────────────
                if (fatherId) await insert('student_guardians', {
                    student_id          : studentId,
                    guardian_id         : fatherId,
                    relationship        : 'father',
                    is_emergency_contact: true,
                    created_at          : now,
                }).catch(() => {});

                if (motherId) await insert('student_guardians', {
                    student_id          : studentId,
                    guardian_id         : motherId,
                    relationship        : 'mother',
                    is_emergency_contact: !fatherId,
                    created_at          : now,
                }).catch(() => {});

                // ── Class enrollment (historical roster) ────────────
                if (s.classId && year?.id) {
                    await insert('class_enrollments', {
                        student_id       : studentId,
                        class_id         : parseInt(s.classId),
                        academic_year_id : year.id,
                        term_id          : term?.id  || null,
                        enrollment_date  : today,
                        is_active        : true,
                        status           : 'active',
                        enrolled_by      : state.currentUser?.id || null,
                        notes            : 'Enrolled via enrollment form',
                        created_at       : now,
                        updated_at       : now,
                    }).catch(() => {});

                    await insert('student_class_history', {
                        student_id       : studentId,
                        class_id         : parseInt(s.classId),
                        academic_year_id : year.id,
                        term_id          : term?.id  || null,
                        start_date       : today,
                        status           : 'active',
                        reason           : 'new_enrollment',
                        recorded_by      : state.currentUser?.id || null,
                        created_at       : now,
                    }).catch(() => {});
                }

                // ── Fee ASSIGNMENT only (no payment) ─────────────────
                // Fees go to approval queue. No payment is recorded here.
                // Payment is done in Finance → Record Payment.
                const feeCbs = document.querySelectorAll(`.es-fee-cb[data-idx="${s.idx}"]`);
                for (const cb of feeCbs) {
                    if (!cb.checked) continue;
                    const catId   = parseInt(cb.dataset.cat);
                    const amtInp  = document.getElementById(`es-fee-amt-${s.idx}-${catId}`);
                    const assignedAmt = parseFloat(amtInp?.value || '0') || 0;
                    const cat     = (state.feeCategories||[]).find(c => c.id === catId);
                    const fullAmt = cat?.default_amount || 0;
                    const discount= assignedAmt < fullAmt ? Math.max(0, fullAmt - assignedAmt) : 0;
                    const netAmt  = fullAmt - discount;

                    // Approval rules:
                    // - Free fee (netAmt = 0) → auto-approved, no approval needed
                    // - Any non-zero fee → goes to approval queue
                    const needsApproval = netAmt > 0;
                    const isApproved    = !needsApproval; // auto-approve only free fees

                    await insert('student_fees', {
                        student_id        : studentId,
                        fee_category_id   : catId,
                        fee_name          : cat?.name || 'Fee',
                        amount            : fullAmt,
                        waived_amount     : discount,
                        paid_amount       : 0,       // NO payment recorded here
                        is_paid           : false,   // not paid yet
                        is_waived         : false,
                        requires_approval : needsApproval,
                        is_approved       : isApproved,
                        source            : 'enrollment',
                        academic_year_id  : year?.id  || null,
                        term_id           : term?.id   || null,
                        due_date          : term?.end_date || null,
                        notes             : `Assigned at enrollment — ${cat?.name||'Fee'}`,
                        created_at        : now,
                        updated_at        : now,
                    }).catch(() => {});
                }

                // ── Audit log ─────────────────────────────────────────
                if (typeof logAction === 'function') {
                    logAction('student_enrolled', 'students', studentId, {
                        name  : `${s.firstName} ${s.lastName}`,
                        class : s.classId,
                        year  : year?.year_name,
                    });
                }

                enrolled++;
            } catch(e) {
                console.error('Failed to enroll student:', e);
                errors++;
            }
        }

        // ── Reload and show result ────────────────────────────────
        await loadAllData({ silent: true });

        if (errors === 0) {
            showToast(
                `${enrolled} student${enrolled>1?'s':''} enrolled successfully!`,
                'success'
            );
        } else {
            showToast(
                `${enrolled} enrolled, ${errors} failed. Check console for details.`,
                'warning'
            );
        }
        navigateTo('student-list');

    } catch(err) {
        handleApiError(err, 'enrollment');
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = `<i class="fa-solid fa-user-plus"></i> Enroll ${window._esStudents.length} Student${window._esStudents.length>1?'s':''}`;
        }
    }
};

window.renderEnrollStudent = renderEnrollStudent;
