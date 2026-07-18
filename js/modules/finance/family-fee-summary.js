/* ═══════════════════════════════════════════════════════════════════
   js/modules/finance/family-fee-summary.js
   ═══════════════════════════════════════════════════════════════════
   Purpose : Family-level fee view.
             - Search / select a family (FAM code or parent name)
             - Show every child in the family with their full fee table
             - Show per-child balance and sibling discount applied
             - Family total: expected, paid, outstanding
             - "Pay for Family" button — opens record-payment with
               all children's fees pre-selected
             - Export family statement
   Roles   : admin, accountant
   ═══════════════════════════════════════════════════════════════════ */

'use strict';

let _ffsFamilyId = null;

async function renderFamilyFeeSummary(params = {}) {
    const app = document.getElementById('app');
    if (!canViewPayments()) {
        app.innerHTML = `<div class="alert alert-danger">Access denied.</div>`;
        return;
    }

    await ensureStateLoaded();
    await loadStudentFees();

    _ffsFamilyId = params.familyId || null;

    const activeYear = getActiveYear();
    const families = (state.families || []).sort((a, b) =>
        (a.parent_name || '').localeCompare(b.parent_name || '')
    );

    app.innerHTML = `
    <div class="module-wrap">

        <div class="mod-topbar">
            <div class="mod-topbar-left">
                <h1 class="mod-title">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
                         stroke="var(--primary)" stroke-width="2">
                        <use href="assets/icons/sprite.svg#icon-users-round"/>
                    </svg>
                    Family Fee Summary
                </h1>
                <span class="mod-meta">${esc(activeYear?.year_name || '—')}</span>
            </div>
            <div class="mod-topbar-right">
                <button class="topbar-btn" id="btn-export-family" style="display:none"
                        onclick="exportFamilyStatement()">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                         stroke="currentColor" stroke-width="2">
                        <use href="assets/icons/sprite.svg#icon-download"/>
                    </svg>
                    Export Statement
                </button>
                <button class="topbar-btn btn-fill" id="btn-pay-family" style="display:none"
                        onclick="payForFamily()">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                         stroke="currentColor" stroke-width="2">
                        <use href="assets/icons/sprite.svg#icon-credit-card"/>
                    </svg>
                    Pay for Family
                </button>
            </div>
        </div>

        <!-- Family selector -->
        <div class="section-card" style="margin-bottom:16px;">
            <div class="form-row" style="align-items:flex-end;">
                <div class="field" style="flex:1;">
                    <label class="field-label">Select Family</label>
                    <div class="input-icon-wrap">
                        <svg viewBox="0 0 24 24" fill="none" stroke-width="2">
                            <use href="assets/icons/sprite.svg#icon-search"/>
                        </svg>
                        <select id="ffs-family-select" class="input"
                                onchange="onFamilySelect(this.value)">
                            <option value="">— Select a family —</option>
                            ${families.map(f => `
                                <option value="${f.id}" ${f.id === _ffsFamilyId ? 'selected' : ''}>
                                    ${esc(f.family_code || '—')} — ${esc(f.parent_name || 'Unknown')}
                                    ${f.parent_contact ? ' · ' + esc(f.parent_contact) : ''}
                                </option>`
    ).join('')}
                        </select>
                    </div>
                </div>
                <div class="field" style="flex:0 0 auto;">
                    <button class="btn btn-secondary" onclick="navigateTo('family-management')">
                        Manage Families
                    </button>
                </div>
            </div>
        </div>

        <!-- Family content -->
        <div id="family-content">
            <div class="empty-state">
                <div class="es-icon">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none"
                         stroke="currentColor" stroke-width="1.2" opacity="0.3">
                        <use href="assets/icons/sprite.svg#icon-users-round"/>
                    </svg>
                </div>
                <div class="es-title">Select a Family</div>
                <div class="es-sub">Choose a family above to view their fee summary.</div>
            </div>
        </div>

    </div>`;

    // Auto-load if familyId passed
    if (_ffsFamilyId) {
        setTimeout(() => onFamilySelect(_ffsFamilyId), 80);
    }
}

window.onFamilySelect = async function (familyId) {
    _ffsFamilyId = familyId ? parseInt(familyId) : null;

    const content = document.getElementById('family-content');
    const btnPay = document.getElementById('btn-pay-family');
    const btnExp = document.getElementById('btn-export-family');

    if (!_ffsFamilyId) {
        content.innerHTML = `
        <div class="empty-state">
            <div class="es-icon"><svg width="48" height="48" viewBox="0 0 24 24" fill="none"
                 stroke="currentColor" stroke-width="1.2" opacity="0.3">
                <use href="assets/icons/sprite.svg#icon-users-round"/>
            </svg></div>
            <div class="es-title">Select a Family</div>
        </div>`;
        if (btnPay) btnPay.style.display = 'none';
        if (btnExp) btnExp.style.display = 'none';
        return;
    }

    const family = (state.families || []).find(f => f.id === _ffsFamilyId);
    if (!family) { showToast('Family not found.', 'error'); return; }

    // Get all children in this family
    const children = (state.students || []).filter(s =>
        s.family_id === _ffsFamilyId && !s.is_deleted
    ).sort((a, b) => (a.last_name || '').localeCompare(b.last_name || ''));

    if (children.length === 0) {
        content.innerHTML = `
        <div class="section-card">
            <div class="empty-state">
                <div class="es-title">No children linked to this family</div>
                <div class="es-sub">Link students in <a href="#" onclick="navigateTo('family-management')">Family Management</a>.</div>
            </div>
        </div>`;
        if (btnPay) btnPay.style.display = 'none';
        return;
    }

    const yearId = getActiveYearId();

    // Get all fees and credits for all children
    const allChildIds = children.map(c => c.id);
    const allFees = (state.studentFees || []).filter(f =>
        allChildIds.includes(f.student_id) && f.academic_year_id === yearId
    );
    const allCredits = (state.creditBalances || []).filter(c =>
        allChildIds.includes(c.student_id)
    );

    // Family-level totals
    const familyCredit = allCredits.reduce((s, c) => s + Number(c.credit_amount || 0), 0);
    const familySummary = computeStudentFeeSummary(allFees, familyCredit);

    // Sibling discount info from family row
    const discountPct = Number(family.sibling_discount_pct || 0);

    // Build per-child cards
    const childCards = children.map(child => {
        const cls = getClass(child.class_id);
        const childFees = allFees.filter(f => f.student_id === child.id);
        const childCredit = allCredits.find(c => c.student_id === child.id);
        const creditBal = childCredit ? Number(childCredit.credit_amount || 0) : 0;
        const summary = computeStudentFeeSummary(childFees, creditBal);

        const unpaidFees = childFees.filter(f => !f.is_paid && !f.is_waived);
        const paidFees = childFees.filter(f => f.is_paid);
        const waivedFees = childFees.filter(f => f.is_waived);

        const feeRows = childFees.map(fee => {
            const bal = computeFeeBalance(fee);
            const status = getFeeStatusDisplay(fee);
            return `
            <tr>
                <td>${esc(fee.fee_name || '—')}</td>
                <td class="text-right">${fmtCurrency(bal.amount)}</td>
                <td class="text-right" style="color:var(--color-success);">${fmtCurrency(bal.waived)}</td>
                <td class="text-right" style="color:var(--color-success);">${fmtCurrency(bal.paid)}</td>
                <td class="text-right" style="font-weight:${bal.remaining > 0 ? '700' : '400'};
                    color:${bal.remaining > 0 ? 'var(--color-danger)' : 'var(--color-success)'};">
                    ${fmtCurrency(bal.remaining)}
                </td>
                <td>
                    <span class="badge" style="background:${status.color}20;color:${status.color};font-size:10px;">
                        ${esc(status.label)}
                    </span>
                </td>
                <td>
                    ${!fee.is_paid && !fee.is_waived ? `
                    <button class="btn btn-sm btn-primary"
                            onclick="payChildFee(${child.id},${fee.id})">Pay</button>
                    <button class="btn btn-sm btn-ghost"
                            onclick="navigateTo('fee-waivers',{studentId:${child.id}})">Waive</button>
                    ` : ''}
                </td>
            </tr>`;
        }).join('') || `<tr><td colspan="7" class="text-center text-muted" style="padding:16px;">No fees assigned.</td></tr>`;

        return `
        <div class="section-card" style="margin-bottom:16px;">
            <div class="child-card-header">
                <div class="child-info">
                    <div class="child-avatar">
                        ${esc((child.first_name || '?')[0].toUpperCase())}
                    </div>
                    <div>
                        <div class="child-name">${esc(child.first_name)} ${esc(child.last_name)}</div>
                        <div class="child-meta">
                            ${esc(child.code)} · ${esc(cls?.name || '—')} · ${esc(child.gender || '—')}
                        </div>
                    </div>
                </div>
                <div class="child-summary">
                    <div class="child-stat">
                        <span class="child-stat-label">Expected</span>
                        <span class="child-stat-value">${fmtCurrency(summary.effective)}</span>
                    </div>
                    <div class="child-stat">
                        <span class="child-stat-label">Paid</span>
                        <span class="child-stat-value" style="color:var(--color-success);">${fmtCurrency(summary.paid)}</span>
                    </div>
                    <div class="child-stat">
                        <span class="child-stat-label">Outstanding</span>
                        <span class="child-stat-value" style="color:${summary.outstanding > 0 ? 'var(--color-danger)' : 'var(--color-success)'};">
                            ${fmtCurrency(summary.outstanding)}
                        </span>
                    </div>
                    ${creditBal > 0 ? `
                    <div class="child-stat">
                        <span class="child-stat-label">Credit</span>
                        <span class="child-stat-value" style="color:var(--teal);">${fmtCurrency(creditBal)}</span>
                    </div>` : ''}
                    <div class="child-stat">
                        <span class="child-stat-label">Status</span>
                        <span class="badge ${summary.isFullyPaid ? 'badge-success' : 'badge-danger'}" style="font-size:11px;">
                            ${summary.isFullyPaid ? 'Settled' : 'Owing'}
                        </span>
                    </div>
                </div>
            </div>

            <div class="table-wrap" style="margin-top:12px;">
                <table class="data-table data-table-compact">
                    <thead>
                        <tr>
                            <th>Fee</th>
                            <th class="text-right">Amount</th>
                            <th class="text-right">Waived</th>
                            <th class="text-right">Paid</th>
                            <th class="text-right">Remaining</th>
                            <th>Status</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>${feeRows}</tbody>
                </table>
            </div>

            <div style="display:flex;gap:8px;margin-top:10px;justify-content:flex-end;">
                <button class="btn btn-sm btn-secondary"
                        onclick="navigateTo('student-details',{studentId:${child.id}})">
                    View Profile
                </button>
                <button class="btn btn-sm btn-primary"
                        onclick="payForChild(${child.id})">
                    Pay All for ${esc(child.first_name)}
                </button>
                <button class="btn btn-sm btn-ghost"
                        onclick="printStudentStatement(
                            getStudent(${child.id}),
                            state.studentFees.filter(f=>f.student_id===${child.id}),
                            state.payments.filter(p=>p.student_id===${child.id}),
                            0,
                            getActiveYear()
                        )">
                    Statement
                </button>
            </div>
        </div>`;
    }).join('');

    // Family totals summary bar
    const totalBar = `
    <div class="family-totals-bar">
        <div class="family-info-block">
            <div class="family-name">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                     stroke="currentColor" stroke-width="2">
                    <use href="assets/icons/sprite.svg#icon-users-round"/>
                </svg>
                ${esc(family.family_code || '—')} — ${esc(family.parent_name || 'Unknown Family')}
            </div>
            <div class="family-meta">
                ${children.length} child${children.length !== 1 ? 'ren' : ''} ·
                ${esc(family.parent_contact || '')}
                ${discountPct > 0 ? ` · ${discountPct}% sibling discount applied` : ''}
            </div>
        </div>
        <div class="family-totals">
            <div class="family-total-item">
                <span class="ft-label">Total Expected</span>
                <span class="ft-value">${fmtCurrency(familySummary.effective)}</span>
            </div>
            <div class="family-total-item">
                <span class="ft-label">Total Paid</span>
                <span class="ft-value" style="color:var(--color-success);">${fmtCurrency(familySummary.paid)}</span>
            </div>
            <div class="family-total-item">
                <span class="ft-label">Total Outstanding</span>
                <span class="ft-value" style="color:${familySummary.outstanding > 0 ? 'var(--color-danger)' : 'var(--color-success)'};">
                    ${fmtCurrency(familySummary.outstanding)}
                </span>
            </div>
            ${familyCredit > 0 ? `
            <div class="family-total-item">
                <span class="ft-label">Total Credit</span>
                <span class="ft-value" style="color:var(--teal);">${fmtCurrency(familyCredit)}</span>
            </div>` : ''}
            <div class="family-total-item">
                <span class="ft-label">Collection Rate</span>
                <span class="ft-value">
                    ${familySummary.effective > 0
            ? fmtPct((familySummary.paid / familySummary.effective) * 100)
            : '—'}
                </span>
            </div>
        </div>
    </div>`;

    content.innerHTML = totalBar + childCards;

    if (btnPay) btnPay.style.display = familySummary.outstanding > 0 ? 'inline-flex' : 'none';
    if (btnExp) btnExp.style.display = 'inline-flex';
};

// Pay for a single child — navigate to record-payment pre-selected
window.payForChild = function (studentId) {
    localStorage.setItem('elf_pay_student', String(studentId));
    navigateTo('record-payment');
};

// Pay a specific fee for a child
window.payChildFee = function (studentId, feeId) {
    localStorage.setItem('elf_pay_student', String(studentId));
    localStorage.setItem('elf_pay_fee_ids', JSON.stringify([feeId]));
    navigateTo('record-payment');
};

// Pay for all children in the family
window.payForFamily = function () {
    if (!_ffsFamilyId) return;
    const family = (state.families || []).find(f => f.id === _ffsFamilyId);
    const children = (state.students || []).filter(s =>
        s.family_id === _ffsFamilyId && !s.is_deleted
    );

    // Navigate to record-payment in family mode
    localStorage.setItem('elf_pay_family_id', String(_ffsFamilyId));
    navigateTo('record-payment', { familyId: _ffsFamilyId });
};

// Export family statement as Excel
window.exportFamilyStatement = function () {
    if (!_ffsFamilyId) return;
    const family = (state.families || []).find(f => f.id === _ffsFamilyId);
    const children = (state.students || []).filter(s =>
        s.family_id === _ffsFamilyId && !s.is_deleted
    );
    const yearId = getActiveYearId();
    const allFees = (state.studentFees || []).filter(f =>
        children.map(c => c.id).includes(f.student_id) && f.academic_year_id === yearId
    );

    const data = allFees.map(f => {
        const child = children.find(c => c.id === f.student_id);
        const cls = child ? getClass(child.class_id) : null;
        const bal = computeFeeBalance(f);
        return {
            'Family Code': family?.family_code || '',
            'Student Name': child ? `${child.first_name} ${child.last_name}` : '—',
            'Student Code': child?.code || '',
            'Class': cls?.name || '',
            'Fee Name': f.fee_name || '',
            'Amount': bal.amount,
            'Waived': bal.waived,
            'Paid': bal.paid,
            'Outstanding': bal.remaining,
            'Status': getFeeStatusDisplay(f).label,
        };
    });

    exportAsCSV(data, `Family_${family?.family_code || 'Statement'}`);
};

window.renderFamilyFeeSummary = renderFamilyFeeSummary;