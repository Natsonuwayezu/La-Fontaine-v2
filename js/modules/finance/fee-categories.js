/* ═══════════════════════════════════════════════════════════════════
   js/modules/finance/fee-categories.js  v9.0
   Manage fee categories: name, default_amount, is_core toggle.
   is_core = true  → required for all students, appears in enrollment
   is_core = false → optional, assigned manually
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

async function renderFeeCategories(container, params = {}) {
    if (!container) return;
    await ensureStateLoaded();
    _fcShell(container);
}

function _fcShell(container) {
    const cats = (state.feeCategories || [])
        .sort((a,b) => (a.sort_order||99) - (b.sort_order||99));

    container.innerHTML = `
    <div class="module-wrap">
      <div class="mod-topbar">
        <div class="mod-topbar-left">
          <h1 class="mod-title"><i class="fa-solid fa-tags"></i> Fee Categories</h1>
        </div>
        <div class="mod-topbar-right">
          <button class="btn btn-ghost btn-sm" onclick="navigateTo('fee-structure')">
            <i class="fa-solid fa-layer-group"></i> Fee Structure</button>
          <button class="btn btn-ghost btn-sm" onclick="navigateTo('fee-approvals')">
            <i class="fa-solid fa-check-circle"></i> Approvals</button>
          <button class="btn btn-primary" onclick="fcOpenNew()">
            <i class="fa-solid fa-plus"></i> Add Category</button>
        </div>
      </div>

      <div class="alert alert-info" style="margin-bottom:14px;">
        <i class="fa-solid fa-circle-info"></i>
        <strong>Core fees</strong> are required for all students and appear automatically
        in the enrollment form. Non-core fees are assigned manually per student.
      </div>

      <div class="section-card" style="padding:0;overflow:hidden;">
        <table style="width:100%;border-collapse:collapse;">
          <thead>
            <tr style="background:var(--bg-sidebar);border-bottom:2px solid var(--border);">
              <th style="padding:10px 14px;text-align:left;font-size:12px;">Name</th>
              <th style="padding:10px 14px;text-align:right;font-size:12px;">Default Amount (RWF)</th>
              <th style="padding:10px 14px;text-align:center;font-size:12px;">Core</th>
              <th style="padding:10px 14px;text-align:center;font-size:12px;">Active</th>
              <th style="padding:10px 14px;text-align:center;font-size:12px;">Actions</th>
            </tr>
          </thead>
          <tbody>
            ${cats.length ? cats.map((c,i) => `
            <tr style="border-bottom:1px solid var(--border);background:${i%2===0?'transparent':'rgba(255,255,255,.02)'}">
              <td style="padding:10px 14px;font-weight:600;">${esc(c.name)}</td>
              <td style="padding:10px 14px;text-align:right;">${typeof fmtCurrency==='function'?fmtCurrency(c.default_amount||0):(c.default_amount||0).toLocaleString()}</td>
              <td style="padding:10px 14px;text-align:center;">
                <span class="badge ${c.is_core?'badge-success':'badge-neutral'}">
                  ${c.is_core?'Core':'Optional'}</span>
              </td>
              <td style="padding:10px 14px;text-align:center;">
                <label style="display:inline-flex;align-items:center;cursor:pointer;gap:6px;">
                  <input type="checkbox" ${c.is_active!==false?'checked':''}
                         onchange="fcToggleActive(${c.id}, this.checked)"
                         style="width:16px;height:16px;">
                </label>
              </td>
              <td style="padding:10px 14px;text-align:center;">
                <button class="btn btn-sm btn-ghost" onclick="fcOpenEdit(${c.id})">
                  <i class="fa-solid fa-pen"></i> Edit</button>
                <button class="btn btn-sm btn-danger" onclick="fcDelete(${c.id})">
                  <i class="fa-solid fa-trash"></i></button>
              </td>
            </tr>`).join('') :
            `<tr><td colspan="5" style="padding:40px;text-align:center;color:var(--text-muted);">
              No fee categories yet. Click <strong>Add Category</strong> to create the first one.
            </td></tr>`}
          </tbody>
        </table>
      </div>
    </div>`;
}

/* ── NEW / EDIT MODAL ────────────────────────────────────────────── */
function _fcModal(cat) {
    const isEdit = !!cat;
    showModal(`
    <div class="form-grid">
      <div class="field" style="grid-column:1/-1;">
        <label class="field-label">Category Name *</label>
        <input type="text" id="fc-name" class="input"
               value="${esc(cat?.name||'')}" placeholder="e.g. Tuition Fee, Activity Fee">
      </div>
      <div class="field">
        <label class="field-label">Default Amount (RWF)</label>
        <input type="number" id="fc-amount" class="input"
               value="${cat?.default_amount||0}" min="0" step="500">
      </div>
      <div class="field">
        <label class="field-label">Sort Order</label>
        <input type="number" id="fc-sort" class="input"
               value="${cat?.sort_order||99}" min="1" step="1">
      </div>
      <div class="field" style="grid-column:1/-1;">
        <label class="field-label">Description</label>
        <textarea id="fc-desc" class="input" rows="2"
                  placeholder="Optional description">${esc(cat?.description||'')}</textarea>
      </div>
      <div class="field" style="grid-column:1/-1;display:flex;gap:20px;">
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:13px;">
          <input type="checkbox" id="fc-is-core" ${cat?.is_core?'checked':''}
                 style="width:16px;height:16px;">
          <div>
            <div style="font-weight:600;">Core Fee</div>
            <div style="font-size:11px;color:var(--text-muted);">Appears in enrollment form for all students</div>
          </div>
        </label>
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:13px;">
          <input type="checkbox" id="fc-is-active" ${cat?.is_active!==false?'checked':''}
                 style="width:16px;height:16px;">
          <div>
            <div style="font-weight:600;">Active</div>
            <div style="font-size:11px;color:var(--text-muted);">Visible in fee assignment</div>
          </div>
        </label>
      </div>
    </div>`, {
        title: isEdit ? 'Edit Fee Category' : 'New Fee Category',
        size: 'md',
        footer: `
        <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
        <button class="btn btn-primary" onclick="fcSave(${cat?.id||'null'})">
          <i class="fa-solid fa-floppy-disk"></i> Save</button>`,
    });
}

window.fcOpenNew  = ()       => _fcModal(null);
window.fcOpenEdit = (id)     => _fcModal((state.feeCategories||[]).find(c=>c.id===id));

window.fcSave = async (id) => {
    const name = document.getElementById('fc-name')?.value?.trim();
    if (!name) { showToast('Category name is required.','warning'); return; }
    const now = new Date().toISOString();
    const payload = {
        name         : name,
        default_amount: parseFloat(document.getElementById('fc-amount')?.value||'0')||0,
        sort_order   : parseInt(document.getElementById('fc-sort')?.value||'99')||99,
        description  : document.getElementById('fc-desc')?.value?.trim()||null,
        is_core      : document.getElementById('fc-is-core')?.checked||false,
        is_active    : document.getElementById('fc-is-active')?.checked!==false,
        updated_at   : now,
    };
    try {
        if (id) {
            await update('fee_categories', id, payload);
            showToast('Fee category updated.','success');
        } else {
            payload.created_at = now;
            await insert('fee_categories', payload);
            showToast('Fee category created.','success');
        }
        closeModal();
        await loadAllData({silent:true});
        const c = document.getElementById('moduleContent');
        if (c) _fcShell(c);
    } catch(err) { handleApiError(err,'save fee category'); }
};

window.fcToggleActive = async (id, active) => {
    try {
        await update('fee_categories', id, { is_active: active, updated_at: new Date().toISOString() });
        await loadAllData({silent:true});
        showToast(`Category ${active?'activated':'deactivated'}.`,'success');
    } catch(err) { handleApiError(err,'update fee category'); }
};

window.fcDelete = async (id) => {
    const cat = (state.feeCategories||[]).find(c=>c.id===id);
    if (!cat) return;
    const used = (state.studentFees||[]).some(f=>f.fee_category_id===id);
    if (used) {
        showToast('Cannot delete — this category has assigned fees. Deactivate it instead.','warning');
        return;
    }
    const ok = await confirmDialog(
        `Delete fee category "${cat.name}"? This cannot be undone.`,
        'Delete Fee Category',
        { confirmText:'Delete', confirmClass:'btn-danger' }
    );
    if (!ok) return;
    try {
        await remove('fee_categories', id);
        showToast('Fee category deleted.','success');
        await loadAllData({silent:true});
        const c = document.getElementById('moduleContent');
        if (c) _fcShell(c);
    } catch(err) { handleApiError(err,'delete fee category'); }
};

window.renderFeeCategories = renderFeeCategories;
