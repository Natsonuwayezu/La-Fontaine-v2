'use strict';
/* ═══════════════════════════════════════════════════════════════
   api.js — Simple Supabase REST wrapper.
   Mirrors what the old single-file used exactly.
   ═══════════════════════════════════════════════════════════════ */

function _apiHeaders() {
    return {
        'Content-Type' : 'application/json',
        'apikey'       : SUPABASE_KEY,
        'Authorization': 'Bearer ' + SUPABASE_KEY,
        'Prefer'       : 'return=representation',
    };
}

function _buildQuery(filters) {
    if (!filters || typeof filters === 'string') return filters || '';
    return Object.entries(filters)
        .map(([k, v]) => {
            if (v === true)  return `${k}=eq.true`;
            if (v === false) return `${k}=eq.false`;
            if (v === null)  return `${k}=is.null`;
            return `${k}=eq.${encodeURIComponent(v)}`;
        })
        .join('&');
}

// ── getAll ────────────────────────────────────────────────────
async function getAll(table, filters = {}) {
    const qs    = _buildQuery(filters);
    const url   = `${SUPABASE_URL}/rest/v1/${table}?${qs}&order=id.asc`;
    const res   = await fetch(url, { headers: _apiHeaders() });
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(`[getAll:${table}] ${err.message || res.status}`);
    }
    return res.json();
}

// ── insert ────────────────────────────────────────────────────
async function insert(table, data) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
        method : 'POST',
        headers: _apiHeaders(),
        body   : JSON.stringify(data),
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(`[insert:${table}] ${err.message || res.status}`);
    }
    const rows = await res.json();
    return Array.isArray(rows) ? rows[0] : rows;
}

// ── update ────────────────────────────────────────────────────
async function update(table, id, data) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?id=eq.${id}`, {
        method : 'PATCH',
        headers: _apiHeaders(),
        body   : JSON.stringify(data),
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(`[update:${table}] ${err.message || res.status}`);
    }
    const rows = await res.json();
    return Array.isArray(rows) ? rows[0] : rows;
}

// ── remove ────────────────────────────────────────────────────
async function remove(table, id) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?id=eq.${id}`, {
        method : 'DELETE',
        headers: _apiHeaders(),
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(`[remove:${table}] ${err.message || res.status}`);
    }
    return true;
}

// ── upsert ────────────────────────────────────────────────────
async function upsert(table, data, onConflict = 'id') {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?on_conflict=${onConflict}`, {
        method : 'POST',
        headers: { ..._apiHeaders(), 'Prefer': 'return=representation,resolution=merge-duplicates' },
        body   : JSON.stringify(data),
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(`[upsert:${table}] ${err.message || res.status}`);
    }
    const rows = await res.json();
    return Array.isArray(rows) ? rows[0] : rows;
}

// ── callRPC ───────────────────────────────────────────────────
async function callRPC(fnName, params = {}) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fnName}`, {
        method : 'POST',
        headers: _apiHeaders(),
        body   : JSON.stringify(params),
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(`[rpc:${fnName}] ${err.message || err.hint || res.status}`);
    }
    return res.json();
}

// ── getSchoolSettings ─────────────────────────────────────────
async function getSchoolSettings() {
    const rows = await getAll('school_settings');
    const map  = {};
    (rows || []).forEach(r => { map[r.key] = r.value; });
    state.schoolSettings = map;
    return map;
}

// ── logActivity ───────────────────────────────────────────────
async function logActivity(userId, role, action, details = {}) {
    return insert('system_logs', {
        user_id    : userId || 0,
        role       : role   || 'system',
        action_type: action,
        details    : JSON.stringify(details),
        created_at : new Date().toISOString(),
    }).catch(() => {});
}

// ── showToast ─────────────────────────────────────────────────
function showToast(message, type = 'info', duration = 4000) {
    const container = document.getElementById('toast-container');
    if (!container) { console.log('[Toast]', message); return; }

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `
        <span class="toast-icon">${{
            success:'✅', error:'❌', danger:'❌',
            warning:'⚠️', info:'ℹ️'
        }[type] || 'ℹ️'}</span>
        <span class="toast-msg">${esc(message)}</span>
        <button class="toast-close" onclick="this.closest('.toast').remove()">×</button>`;

    container.appendChild(toast);
    setTimeout(() => toast.classList.add('show'), 10);
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 400);
    }, duration);
}

// ── confirmDialog ─────────────────────────────────────────────
function confirmDialog(message, title = 'Confirm', opts = {}) {
    return new Promise(resolve => {
        const overlay = document.createElement('div');
        overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:9000;display:flex;align-items:center;justify-content:center;';
        overlay.innerHTML = `
            <div style="background:var(--bg-card,#fff);border-radius:12px;padding:24px;max-width:400px;width:90%;box-shadow:0 20px 60px rgba(0,0,0,.3);">
                <div style="font-weight:700;font-size:16px;margin-bottom:12px;">${esc(title)}</div>
                <div style="color:var(--text-secondary,#64748b);margin-bottom:20px;">${esc(message)}</div>
                <div style="display:flex;gap:10px;justify-content:flex-end;">
                    <button id="cd-cancel" style="padding:8px 18px;border-radius:8px;border:1px solid var(--border,#e2e8f0);background:transparent;cursor:pointer;">Cancel</button>
                    <button id="cd-confirm" style="padding:8px 18px;border-radius:8px;border:none;background:${opts.confirmClass==='btn-danger'?'#ef4444':'var(--role-primary,#2563eb)'};color:#fff;cursor:pointer;font-weight:600;">${esc(opts.confirmText || 'Confirm')}</button>
                </div>
            </div>`;
        document.body.appendChild(overlay);
        overlay.querySelector('#cd-cancel').onclick  = () => { overlay.remove(); resolve(false); };
        overlay.querySelector('#cd-confirm').onclick = () => { overlay.remove(); resolve(true); };
        overlay.onclick = e => { if (e.target === overlay) { overlay.remove(); resolve(false); } };
    });
}

// ── showModal / closeModal ────────────────────────────────────
function showModal(content, opts = {}) {
    closeModal();
    const overlay = document.createElement('div');
    overlay.id = 'modal-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:8000;display:flex;align-items:center;justify-content:center;padding:16px;';
    overlay.innerHTML = `
        <div class="modal-box" style="background:var(--bg-card,#fff);border-radius:14px;padding:24px;
             max-width:${opts.size==='lg'?'800px':opts.size==='sm'?'380px':'560px'};width:100%;
             max-height:90vh;overflow-y:auto;box-shadow:0 24px 80px rgba(0,0,0,.3);">
            ${opts.title ? `<div style="font-weight:700;font-size:17px;margin-bottom:16px;">${esc(opts.title)}</div>` : ''}
            <div class="modal-content">${content}</div>
            ${opts.footer ? `<div style="margin-top:20px;display:flex;gap:10px;justify-content:flex-end;">${opts.footer}</div>` : ''}
        </div>`;
    document.body.appendChild(overlay);
    overlay.onclick = e => { if (e.target === overlay) closeModal(); };
    document.addEventListener('keydown', _modalEsc);
}

function closeModal() {
    document.getElementById('modal-overlay')?.remove();
    document.removeEventListener('keydown', _modalEsc);
}

function _modalEsc(e) { if (e.key === 'Escape') closeModal(); }

// ── esc utility ───────────────────────────────────────────────
function esc(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g,'&amp;').replace(/</g,'&lt;')
        .replace(/>/g,'&gt;').replace(/"/g,'&quot;')
        .replace(/'/g,'&#39;');
}

// ── fmtCurrency ───────────────────────────────────────────────
function fmtCurrency(n) {
    return (Number(n) || 0).toLocaleString('en-RW') + ' RWF';
}

// ── ensureStateLoaded ─────────────────────────────────────────
async function ensureStateLoaded() {
    // Data is loaded during bootApp — by the time any module renders
    // state should already be populated. This is just a safety check.
    if (!state.students || state.students.length === 0) {
        await getAll('students', { is_deleted: false })
            .then(r => { state.students = r || []; })
            .catch(() => {});
    }
}

// ── Expose all to window ──────────────────────────────────────
window.getAll          = getAll;
window.insert          = insert;
window.update          = update;
window.remove          = remove;
window.upsert          = upsert;
window.callRPC         = callRPC;
window.getSchoolSettings = getSchoolSettings;
window.logActivity     = logActivity;
window.showToast       = showToast;
window.confirmDialog   = confirmDialog;
window.showModal       = showModal;
window.closeModal      = closeModal;
window.esc             = esc;
window.fmtCurrency     = fmtCurrency;
window.ensureStateLoaded = ensureStateLoaded;
