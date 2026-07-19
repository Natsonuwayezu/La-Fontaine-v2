/* ═══════════════════════════════════════════════════════════════════
   js/modules/finance/financial-reports.js
   ═══════════════════════════════════════════════════════════════════
   Purpose : School-wide financial reporting — collection rate overall,
             broken down by class and by term, plus waiver/discount and
             credit totals for the period. Built entirely on the
             already-tested core/finance-formulas.js calculation layer
             (computeCollectionStats) rather than recomputing anything
             here. Exportable to Excel via the newly-added
             integrations/xlsx.js.

   Dependencies (plain-script globals loaded earlier in index.html):
   api.js: ensureStateLoaded, getAll
   data-loader.js: loadStudentFees
   finance-formulas.js: computeCollectionStats
   permissions.js: canViewFinanceReports
   state.js: state
   utils.js: esc, fmtCurrency, todayISO
   toast.js: showToast
   integrations/xlsx.js: XLSXIntegration (bare reference — see
                          receipts.js's header comment for why this
                          file doesn't need `window.` prefix)
   ═══════════════════════════════════════════════════════════════════ */

'use strict';

async function renderFinancialReports(container, params = {}) {
    if (!container) return;

    if (!canViewFinanceReports()) {
        container.innerHTML = `<div class="alert alert-danger">Access denied.</div>`;
        return;
    }

    container.innerHTML = `<div class="dashboard-page"><div class="loading-inline">Loading financial reports…</div></div>`;

    await ensureStateLoaded();
    await loadStudentFees();
    const waivers = await getAll('fee_waivers').catch(() => []);

    let classFilter = '';

    function feesInScope() {
        if (!classFilter) return state.studentFees || [];
        const classStudentIds = new Set((state.students || []).filter(s => String(s.class_id) === classFilter).map(s => s.id));
        return (state.studentFees || []).filter(f => classStudentIds.has(f.student_id));
    }

    function statsByClass() {
        return (state.classes || []).map(c => {
            const studentIds = new Set((state.students || []).filter(s => s.class_id === c.id).map(s => s.id));
            const fees = (state.studentFees || []).filter(f => studentIds.has(f.student_id));
            return { classInfo: c, stats: computeCollectionStats(fees) };
        }).filter(row => row.stats.totalStudents > 0);
    }

    function waiverTotalsFor(fees) {
        const feeIds = new Set(fees.map(f => f.id));
        const relevant = waivers.filter(w => feeIds.has(w.student_fee_id));
        return relevant.reduce((sum, w) => sum + Number(w.waived_amount || 0), 0);
    }

    function render() {
        const fees = feesInScope();
        const overall = computeCollectionStats(fees);
        const byClass = statsByClass();
        const totalWaived = waiverTotalsFor(fees);
        const totalCredit = (state.creditBalances || []).reduce((sum, c) => sum + Number(c.credit_amount || 0), 0);

        container.innerHTML = `
            <div class="dashboard-page">
                <div class="settings-section">
                    <div class="settings-section__title">Financial Reports</div>
                    <div class="settings-section__desc">School-wide collection overview for the active academic year.</div>
                </div>

                <div class="filters-bar">
                    <select class="form-select" id="fr-class-filter">
                        <option value="">All Classes</option>
                        ${(state.classes || []).map(c => `<option value="${c.id}" ${classFilter === String(c.id) ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}
                    </select>
                    <button class="btn btn-outline" id="fr-export-btn"><i class="fa-solid fa-file-export"></i> Export by Class</button>
                </div>

                <div class="dashboard-stats-grid" style="display:grid; grid-template-columns:repeat(auto-fit, minmax(180px, 1fr)); gap:14px; margin-bottom:20px;">
                    <div class="setting-card"><div class="setting-desc">Total Expected</div><div class="setting-title">${fmtCurrency(overall.totalExpected)}</div></div>
                    <div class="setting-card"><div class="setting-desc">Total Collected</div><div class="setting-title">${fmtCurrency(overall.totalCollected)}</div></div>
                    <div class="setting-card"><div class="setting-desc">Outstanding</div><div class="setting-title">${fmtCurrency(overall.totalOutstanding)}</div></div>
                    <div class="setting-card"><div class="setting-desc">Collection Rate</div><div class="setting-title">${overall.collectionRate}%</div></div>
                    <div class="setting-card"><div class="setting-desc">Waived (this scope)</div><div class="setting-title">${fmtCurrency(totalWaived)}</div></div>
                    <div class="setting-card"><div class="setting-desc">Total Credit Balances</div><div class="setting-title">${fmtCurrency(totalCredit)}</div></div>
                </div>

                <div class="settings-section__title" style="margin-bottom:10px;">By Student Payment Status</div>
                <div class="setting-card" style="margin-bottom:20px; display:flex; gap:24px; flex-wrap:wrap;">
                    <div><div class="setting-desc">Full Payers</div><div class="setting-title">${overall.fullPayers}</div></div>
                    <div><div class="setting-desc">Partial Payers</div><div class="setting-title">${overall.partialPayers}</div></div>
                    <div><div class="setting-desc">Non-Payers</div><div class="setting-title">${overall.nonPayers}</div></div>
                </div>

                <div class="settings-section__title" style="margin-bottom:10px;">By Class</div>
                <table class="logs-table">
                    <thead><tr><th>Class</th><th>Students</th><th>Expected</th><th>Collected</th><th>Outstanding</th><th>Rate</th></tr></thead>
                    <tbody>
                        ${byClass.map(row => `
                            <tr>
                                <td>${esc(row.classInfo.name)}</td>
                                <td>${row.stats.totalStudents}</td>
                                <td>${fmtCurrency(row.stats.totalExpected)}</td>
                                <td>${fmtCurrency(row.stats.totalCollected)}</td>
                                <td>${fmtCurrency(row.stats.totalOutstanding)}</td>
                                <td>${row.stats.collectionRate}%</td>
                            </tr>
                        `).join('') || '<tr><td colspan="6" style="text-align:center; padding:20px;">No fee data yet.</td></tr>'}
                    </tbody>
                </table>
            </div>
        `;

        bindEvents();
    }

    async function exportByClass() {
        const byClass = statsByClass();
        if (!byClass.length) { showToast('Nothing to export', 'error'); return; }

        try {
            await XLSXIntegration.exportRows(`financial-report_${todayISO()}.xlsx`, [{
                name: 'By Class',
                rows: byClass.map(row => ({
                    'Class': row.classInfo.name,
                    'Students': row.stats.totalStudents,
                    'Expected (RWF)': row.stats.totalExpected,
                    'Collected (RWF)': row.stats.totalCollected,
                    'Outstanding (RWF)': row.stats.totalOutstanding,
                    'Collection Rate (%)': row.stats.collectionRate,
                    'Full Payers': row.stats.fullPayers,
                    'Partial Payers': row.stats.partialPayers,
                    'Non-Payers': row.stats.nonPayers,
                })),
            }]);
            showToast('Export ready', 'success');
        } catch (err) {
            showToast('Export failed', 'error', err.message);
        }
    }

    function bindEvents() {
        document.getElementById('fr-class-filter')?.addEventListener('change', (e) => {
            classFilter = e.target.value; render();
        });
        document.getElementById('fr-export-btn')?.addEventListener('click', exportByClass);
    }

    render();
}

function destroyFinancialReports() {
    // Nothing to tear down — no timers/listeners outlive the container.
}

/* ═══════════════════════════════════════════════════════════════════
   EXPOSE
   ═══════════════════════════════════════════════════════════════════ */

window.renderFinancialReports = renderFinancialReports;
window.destroyFinancialReports = destroyFinancialReports;
