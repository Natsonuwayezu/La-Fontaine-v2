/* ═══════════════════════════════════════════════════════════════════
   js/modules/finance/discounts.js
   ═══════════════════════════════════════════════════════════════════
   Purpose : Sibling fee discounts. Lists every family with 2+
             actively-enrolled students (families table, linked via
             students.family_id — see students/enroll-student.js's
             sibling-linking flow) and lets an admin/accountant apply a
             discount percentage to a sibling's outstanding fees.

             Uses the discount math already written in core/formulas.js
             (applySiblingDiscount) and records each discount through
             the same fee_waivers audit table fee-waivers.js writes to
             (waiver_type: 'sibling_discount'), rather than inventing a
             parallel table — a discount is, mechanically, a waiver
             with a rule-based reason instead of a case-by-case one,
             and this keeps one single audit trail for every reduction
             ever applied to a fee.

   Dependencies (plain-script globals loaded earlier in index.html):
   api.js: ensureStateLoaded, insert, update, refreshTables
   data-loader.js: loadStudentFees
   formulas.js: applySiblingDiscount
   finance-formulas.js: computeFeeBalance
   permissions.js: canManageFees, myId, myRole
   state.js: state
   utils.js: esc, fmtCurrency
   toast.js: showToast
   modals.js: showModal, closeModal, confirmDialog
   logger.js: logAction
   loaders.js: window.Loaders
   ═══════════════════════════════════════════════════════════════════ */

'use strict';

async function renderDiscounts(container, params = {}) {
    if (!container) return;

    if (!canManageFees()) {
        container.innerHTML = `<div class="alert alert-danger">Access denied.</div>`;
        return;
    }

    container.innerHTML = `<div class="dashboard-page"><div class="loading-inline">Loading families…</div></div>`;

    await ensureStateLoaded();
    await loadStudentFees();

    function siblingsOf(familyId) {
        return (state.students || []).filter(s => s.family_id === familyId && s.is_active !== false);
    }

    function familiesWithSiblings() {
        return (state.families || []).filter(f => siblingsOf(f.id).length >= 2);
    }

    function outstandingFor(studentId) {
        return (state.studentFees || []).filter(f =>
            f.student_id === studentId && !f.is_paid && !f.is_waived
        );
    }

    function render() {
        const families = familiesWithSiblings();

        container.innerHTML = `
            <div class="dashboard-page">
                <div class="settings-section">
                    <div class="settings-section__title">Sibling Discounts</div>
                    <div class="settings-section__desc">${families.length} famil${families.length === 1 ? 'y' : 'ies'} with 2 or more enrolled students.</div>
                </div>

                ${families.map(family => {
                    const siblings = siblingsOf(family.id);
                    return `
                        <div class="setting-card" style="margin-bottom:14px;">
                            <div class="setting-title">${esc(family.family_name || family.name || `Family #${family.id}`)}</div>
                            <table class="logs-table" style="margin-top:10px;">
                                <thead><tr><th>Student</th><th>Outstanding Fees</th><th></th></tr></thead>
                                <tbody>
                                    ${siblings.map(s => {
                                        const owed = outstandingFor(s.id);
                                        const total = owed.reduce((sum, f) => sum + computeFeeBalance(f).remaining, 0);
                                        return `
                                            <tr>
                                                <td>${esc(s.first_name)} ${esc(s.last_name)}</td>
                                                <td>${owed.length ? `${owed.length} fee${owed.length === 1 ? '' : 's'} — ${fmtCurrency(total)}` : 'None outstanding'}</td>
                                                <td>${owed.length ? `<button class="btn btn-sm btn-primary" data-apply-discount="${s.id}">Apply Discount</button>` : ''}</td>
                                            </tr>
                                        `;
                                    }).join('')}
                                </tbody>
                            </table>
                        </div>
                    `;
                }).join('') || '<div class="setting-card" style="text-align:center; padding:24px;">No families with multiple enrolled students found.</div>'}
            </div>
        `;

        bindEvents();
    }

    function discountForm() {
        return `
            <form id="disc-form">
                <div class="form-group">
                    <label class="form-label">Discount Percentage</label>
                    <input type="number" name="percent" class="form-input" min="1" max="100" value="10" required>
                </div>
                <div class="form-group">
                    <label class="form-label">Reason / Note</label>
                    <input type="text" name="reason" class="form-input" placeholder="e.g. Sibling discount — 2nd child" value="Sibling discount">
                </div>
            </form>
        `;
    }

    function openDiscountModal(studentId) {
        const owed = outstandingFor(parseInt(studentId));
        if (!owed.length) return;

        window.showModal(discountForm(), {
            title: 'Apply Sibling Discount',
            footer: `<button class="btn btn-outline" data-close>Cancel</button>
                     <button class="btn btn-primary" id="disc-confirm-btn">Apply to All Outstanding Fees</button>`
        });

        document.getElementById('disc-confirm-btn').onclick = async () => {
            const form = document.getElementById('disc-form');
            const data = Object.fromEntries(new FormData(form).entries());
            const percent = Number(data.percent);

            if (!percent || percent <= 0 || percent > 100) {
                showToast('Invalid percentage', 'error');
                return;
            }

            const preview = owed.map(fee => {
                const bal = computeFeeBalance(fee);
                const discounted = applySiblingDiscount(bal.remaining, percent);
                return { fee, waivedAmount: bal.remaining - discounted };
            });
            const totalWaived = preview.reduce((sum, p) => sum + p.waivedAmount, 0);

            const ok = await confirmDialog(
                `Apply a ${percent}% discount across ${owed.length} outstanding fee${owed.length === 1 ? '' : 's'}? Total reduction: ${fmtCurrency(totalWaived)}.`,
                'Confirm Discount'
            );
            if (!ok) return;

            const btn = document.getElementById('disc-confirm-btn');
            window.Loaders?.button?.start(btn, 'Applying...');
            try {
                for (const { fee, waivedAmount } of preview) {
                    if (waivedAmount <= 0) continue;
                    await update('student_fees', fee.id, {
                        waived_amount: Number(fee.waived_amount || 0) + waivedAmount,
                        updated_at: new Date().toISOString(),
                    });
                    await insert('fee_waivers', {
                        student_fee_id: fee.id,
                        student_id: fee.student_id,
                        waiver_type: 'sibling_discount',
                        waiver_value: percent,
                        waived_amount: waivedAmount,
                        reason: data.reason || `Sibling discount (${percent}%)`,
                        granted_by: myId(),
                        granted_by_name: state.currentUser?.name || myRole(),
                    });
                }

                await refreshTables(['student_fees', 'fee_waivers']);
                await logAction('SIBLING_DISCOUNT_APPLIED', 'fee_waivers', null, {
                    student_id: studentId, percent, total_waived: totalWaived, fee_count: owed.length
                });

                showToast('Discount applied', 'success', `${fmtCurrency(totalWaived)} reduced across ${owed.length} fee${owed.length === 1 ? '' : 's'}.`);
                window.closeModal();
                await loadStudentFees();
                render();
            } catch (err) {
                showToast('Could not apply discount', 'error', err.message);
            } finally {
                window.Loaders?.button?.stop(btn);
            }
        };
    }

    function bindEvents() {
        container.querySelectorAll('[data-apply-discount]').forEach(btn => {
            btn.addEventListener('click', () => openDiscountModal(btn.dataset.applyDiscount));
        });
    }

    render();
}

function destroyDiscounts() {
    // Nothing to tear down — no timers/listeners outlive the container.
}

/* ═══════════════════════════════════════════════════════════════════
   EXPOSE
   ═══════════════════════════════════════════════════════════════════ */

window.renderDiscounts = renderDiscounts;
window.destroyDiscounts = destroyDiscounts;
