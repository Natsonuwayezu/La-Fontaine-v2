/* ═══════════════════════════════════════════════════════════════════
   js/modules/finance/finance-dashboard.js
   ═══════════════════════════════════════════════════════════════════
   Purpose : Finance Dashboard. KPI summary cards, monthly collection
             trend (ASCII bar chart — no Chart.js), collection rate
             per class, payment method breakdown, top debtors,
             overdue count, quick action buttons.
             Holiday-aware: shows holiday fee summary when active.
   Roles   : admin, accountant
   ═══════════════════════════════════════════════════════════════════ */

'use strict';

async function renderFinanceDashboard() {
    const app = document.getElementById('app');
    if (!canRecordPayment()) {
        app.innerHTML = `<div class="alert alert-danger">Access denied.</div>`;
        return;
    }

    showSkeleton(app);
    await ensureStateLoaded();
    await loadStudentFees();
    await loadPayments();

    const holiday = isHolidayMode();
    const activeYear = getActiveYear();
    const activeTerm = getActiveTerm();

    /* ── KPI computation ─────────────────────────────────────────── */
    const activeStudents = (state.students || []).filter(s => !s.is_deleted && s.status !== 'Inactive');
    const yearFees = (state.studentFees || []).filter(f =>
        f.academic_year_id === getActiveYearId()
    );
    const yearPayments = (state.payments || []).filter(p =>
        p.academic_year_id === getActiveYearId() && !p.is_reversed
    );

    const stats = computeCollectionStats(yearFees);
    const overdueAll = classifyOverdueFees(yearFees);
    const overdueTotal = overdueAll.total;
    const methodBreakdown = computeMethodBreakdown(yearPayments);
    const trend = computePaymentTrend(yearPayments, 'month');

    /* ── Holiday KPIs ─────────────────────────────────────────────── */
    let holidaySection = '';
    if (holiday) {
        const hFees = state.holidayFees || [];
        const hStats = computeCollectionStats(hFees);
        holidaySection = `
        <div class="section-card holiday-section" style="border-left:4px solid ${esc(HOLIDAY_CONFIG.bannerColor)};">
            <div class="section-header">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                     stroke="${esc(HOLIDAY_CONFIG.bannerColor)}" stroke-width="2">
                    <circle cx="12" cy="12" r="10"/>
                    <line x1="12" y1="8" x2="12" y2="12"/>
                    <line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
                <h3>Holiday Session Finance</h3>
            </div>
            <div class="stats-grid stats-grid-3">
                <div class="stat-card">
                    <div class="stat-label">Holiday Fees Expected</div>
                    <div class="stat-value">${fmtCurrency(hStats.totalExpected)}</div>
                </div>
                <div class="stat-card">
                    <div class="stat-label">Holiday Fees Collected</div>
                    <div class="stat-value c-secondary">${fmtCurrency(hStats.totalCollected)}</div>
                </div>
                <div class="stat-card">
                    <div class="stat-label">Pending Next Term</div>
                    <div class="stat-value c-warning">${fmtCurrency(hStats.totalOutstanding)}</div>
                </div>
            </div>
            <p class="section-note">Holiday fees are tracked separately and will be applied at the start of the next term.</p>
        </div>`;
    }

    /* ── Per-class collection breakdown ─────────────────────────── */
    const classRows = (state.classes || []).map(cls => {
        const clsStudentIds = new Set(
            activeStudents.filter(s => s.class_id === cls.id).map(s => s.id)
        );
        if (clsStudentIds.size === 0) return null;

        const clsFees = yearFees.filter(f => clsStudentIds.has(f.student_id));
        const clsStats = computeCollectionStats(clsFees);
        const rateClass = clsStats.collectionRate;
        const rateColor = rateClass >= 80 ? 'var(--color-success)' : rateClass >= 50 ? 'var(--color-warning)' : 'var(--color-danger)';

        return {
            name: cls.name,
            students: clsStudentIds.size,
            expected: clsStats.totalExpected,
            collected: clsStats.totalCollected,
            outstanding: clsStats.totalOutstanding,
            rate: rateClass,
            rateColor,
        };
    }).filter(Boolean).sort((a, b) => b.rate - a.rate);

    const classTableRows = classRows.map(c => `
        <tr>
            <td><strong>${esc(c.name)}</strong></td>
            <td class="text-right">${c.students}</td>
            <td class="text-right">${fmtCurrency(c.expected)}</td>
            <td class="text-right">${fmtCurrency(c.collected)}</td>
            <td class="text-right">${fmtCurrency(c.outstanding)}</td>
            <td class="text-center">
                <span class="badge" style="background:${c.rateColor}20;color:${c.rateColor};font-weight:700;">
                    ${fmtPct(c.rate)}
                </span>
                <div class="mini-bar">
                    <div class="mini-bar-fill" style="width:${Math.min(100, c.rate)}%;background:${c.rateColor};"></div>
                </div>
            </td>
        </tr>`).join('');

    /* ── Monthly trend chart (ASCII canvas approach) ─────────────── */
    const last6Months = trend.slice(-6);
    const maxTrend = Math.max(...last6Months.map(t => t.total), 1);
    const trendBars = last6Months.map(t => {
        const pct = (t.total / maxTrend) * 100;
        return `
        <div class="trend-col">
            <div class="trend-bar-wrap">
                <div class="trend-bar" style="height:${pct}%;"></div>
            </div>
            <div class="trend-label">${esc(t.period.slice(5))}</div>
            <div class="trend-value">${fmtCurrency(t.total)}</div>
        </div>`;
    }).join('');

    /* ── Payment method breakdown ────────────────────────────────── */
    const methodRows = methodBreakdown.map(m => `
        <div class="method-row">
            <span class="method-name">${esc(m.method)}</span>
            <div class="method-bar-wrap">
                <div class="method-bar-fill" style="width:${m.pct}%;"></div>
            </div>
            <span class="method-pct">${fmtPct(m.pct)}</span>
            <span class="method-amount">${fmtCurrency(m.total)}</span>
        </div>`).join('') || '<p class="text-muted">No payments yet.</p>';

    /* ── Top debtors ─────────────────────────────────────────────── */
    const debtorMap = {};
    yearFees.forEach(f => {
        if (f.is_paid || f.is_waived) return;
        const bal = computeFeeBalance(f);
        if (bal.remaining <= 0) return;
        if (!debtorMap[f.student_id]) debtorMap[f.student_id] = 0;
        debtorMap[f.student_id] += bal.remaining;
    });

    const topDebtors = Object.entries(debtorMap)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 8)
        .map(([studentId, amount]) => {
            const s = getStudent(parseInt(studentId));
            const cls = s ? getClass(s.class_id) : null;
            return s ? { s, cls, amount } : null;
        }).filter(Boolean);

    const debtorRows = topDebtors.map(({ s, cls, amount }) => `
        <tr>
            <td>
                <div class="student-cell">
                    <span class="student-name">${esc(s.first_name)} ${esc(s.last_name)}</span>
                    <span class="student-code">${esc(s.code)}</span>
                </div>
            </td>
            <td>${esc(cls?.name || '—')}</td>
            <td class="text-right amount-danger">${fmtCurrency(amount)}</td>
            <td>
                <button class="btn btn-sm btn-primary"
                        onclick="localStorage.setItem('elf_pay_student','${s.id}');navigateTo('record-payment')">
                    Pay Now
                </button>
            </td>
        </tr>`).join('') || '<tr><td colspan="4" class="text-center text-muted" style="padding:20px;">No outstanding balances.</td></tr>';

    /* ── Render ──────────────────────────────────────────────────── */
    app.innerHTML = `
    <div class="module-wrap">
        <!-- Topbar -->
        <div class="mod-topbar">
            <div class="mod-topbar-left">
                <h1 class="mod-title">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
                         stroke="var(--primary)" stroke-width="2">
                        <use href="assets/icons/sprite.svg#icon-gauge"/>
                    </svg>
                    Finance Dashboard
                </h1>
                <span class="mod-meta">
                    ${esc(activeYear?.year_name || '—')}
                    ${activeTerm ? ' · Term ' + activeTerm.term_number : ''}
                </span>
            </div>
            <div class="mod-topbar-right">
                <button class="topbar-btn btn-fill" onclick="navigateTo('record-payment')">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                         stroke="currentColor" stroke-width="2">
                        <use href="assets/icons/sprite.svg#icon-plus"/>
                    </svg>
                    Record Payment
                </button>
                <button class="topbar-btn" onclick="exportFinancialSummary(
                    getActiveYear(), state.payments, state.studentFees)">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                         stroke="currentColor" stroke-width="2">
                        <use href="assets/icons/sprite.svg#icon-download"/>
                    </svg>
                    Export Summary
                </button>
            </div>
        </div>

        ${holidaySection}

        <!-- KPI cards -->
        <div class="stats-grid">
            <div class="stat-card">
                <div class="stat-icon-wrap" style="background:var(--primary-light);">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
                         stroke="var(--primary)" stroke-width="2">
                        <use href="assets/icons/sprite.svg#icon-dollar-sign"/>
                    </svg>
                </div>
                <div class="stat-value">${fmtCurrency(stats.totalExpected)}</div>
                <div class="stat-label">Total Expected</div>
                <div class="stat-sub">${stats.totalStudents} students</div>
            </div>
            <div class="stat-card">
                <div class="stat-icon-wrap" style="background:var(--success-light);">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
                         stroke="var(--success)" stroke-width="2">
                        <use href="assets/icons/sprite.svg#icon-check-circle"/>
                    </svg>
                </div>
                <div class="stat-value c-success">${fmtCurrency(stats.totalCollected)}</div>
                <div class="stat-label">Total Collected</div>
                <div class="stat-sub">${stats.fullPayers} fully paid</div>
            </div>
            <div class="stat-card">
                <div class="stat-icon-wrap" style="background:var(--danger-light);">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
                         stroke="var(--danger)" stroke-width="2">
                        <use href="assets/icons/sprite.svg#icon-alert-triangle"/>
                    </svg>
                </div>
                <div class="stat-value c-danger">${fmtCurrency(stats.totalOutstanding)}</div>
                <div class="stat-label">Outstanding</div>
                <div class="stat-sub">${stats.nonPayers} not yet paid</div>
            </div>
            <div class="stat-card">
                <div class="stat-icon-wrap" style="background:var(--warning-light);">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
                         stroke="var(--warning)" stroke-width="2">
                        <use href="assets/icons/sprite.svg#icon-clock"/>
                    </svg>
                </div>
                <div class="stat-value c-warning">${overdueTotal}</div>
                <div class="stat-label">Overdue Fees</div>
                <div class="stat-sub">${overdueAll.critical.length} critical</div>
            </div>
            <div class="stat-card">
                <div class="stat-icon-wrap" style="background:var(--primary-light);">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
                         stroke="var(--primary)" stroke-width="2">
                        <use href="assets/icons/sprite.svg#icon-pie-chart"/>
                    </svg>
                </div>
                <div class="stat-value">${fmtPct(stats.collectionRate)}</div>
                <div class="stat-label">Collection Rate</div>
                <div class="progress-bar-wrap">
                    <div class="progress-bar-fill"
                         style="width:${Math.min(100, stats.collectionRate)}%;
                                background:${stats.collectionRate >= 80 ? 'var(--success)' :
            stats.collectionRate >= 50 ? 'var(--warning)' :
                'var(--danger)'};"></div>
                </div>
            </div>
            <div class="stat-card">
                <div class="stat-icon-wrap" style="background:var(--success-light);">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
                         stroke="var(--success)" stroke-width="2">
                        <use href="assets/icons/sprite.svg#icon-wallet"/>
                    </svg>
                </div>
                <div class="stat-value c-success">${yearPayments.length}</div>
                <div class="stat-label">Payments Recorded</div>
                <div class="stat-sub">This year</div>
            </div>
        </div>

        <!-- Two-column grid -->
        <div class="two-col-grid">

            <!-- Monthly trend -->
            <div class="section-card">
                <div class="section-header">
                    <h3>Monthly Collection Trend</h3>
                    <span class="section-badge">Last 6 months</span>
                </div>
                <div class="trend-chart-wrap">
                    ${last6Months.length > 0 ? `
                    <div class="trend-chart">${trendBars}</div>` :
            `<div class="empty-chart">No payment data yet.</div>`}
                </div>
            </div>

            <!-- Payment methods -->
            <div class="section-card">
                <div class="section-header">
                    <h3>Payment Methods</h3>
                </div>
                <div class="method-breakdown">${methodRows}</div>
            </div>

        </div>

        <!-- Class breakdown -->
        <div class="section-card">
            <div class="section-header">
                <h3>Collection by Class</h3>
                <button class="topbar-btn" onclick="navigateTo('financial-reports')">
                    Full Report
                </button>
            </div>
            <div class="table-wrap">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>Class</th>
                            <th class="text-right">Students</th>
                            <th class="text-right">Expected</th>
                            <th class="text-right">Collected</th>
                            <th class="text-right">Outstanding</th>
                            <th class="text-center">Rate</th>
                        </tr>
                    </thead>
                    <tbody>${classTableRows || '<tr><td colspan="6" class="text-center">No data.</td></tr>'}</tbody>
                </table>
            </div>
        </div>

        <!-- Top debtors -->
        <div class="section-card">
            <div class="section-header">
                <h3>Top Outstanding Balances</h3>
                <button class="topbar-btn" onclick="navigateTo('overdue-payments')">
                    View All Overdue
                </button>
            </div>
            <div class="table-wrap">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>Student</th>
                            <th>Class</th>
                            <th class="text-right">Outstanding</th>
                            <th></th>
                        </tr>
                    </thead>
                    <tbody>${debtorRows}</tbody>
                </table>
            </div>
        </div>

        <!-- Quick actions -->
        <div class="section-card">
            <div class="section-header"><h3>Quick Actions</h3></div>
            <div class="quick-actions">
                <button class="q-btn" onclick="navigateTo('record-payment')">
                    <div class="q-icon">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
                             stroke="currentColor" stroke-width="2">
                            <use href="assets/icons/sprite.svg#icon-credit-card"/>
                        </svg>
                    </div>
                    <span>Record Payment</span>
                </button>
                <button class="q-btn" onclick="navigateTo('payment-history')">
                    <div class="q-icon">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
                             stroke="currentColor" stroke-width="2">
                            <use href="assets/icons/sprite.svg#icon-receipt"/>
                        </svg>
                    </div>
                    <span>Payment History</span>
                </button>
                <button class="q-btn" onclick="navigateTo('overdue-payments')">
                    <div class="q-icon">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
                             stroke="currentColor" stroke-width="2">
                            <use href="assets/icons/sprite.svg#icon-alert-triangle"/>
                        </svg>
                    </div>
                    <span>Overdue</span>
                </button>
                <button class="q-btn" onclick="navigateTo('fee-structure')">
                    <div class="q-icon">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
                             stroke="currentColor" stroke-width="2">
                            <use href="assets/icons/sprite.svg#icon-dollar-sign"/>
                        </svg>
                    </div>
                    <span>Fee Structure</span>
                </button>
                <button class="q-btn" onclick="navigateTo('fee-waivers')">
                    <div class="q-icon">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
                             stroke="currentColor" stroke-width="2">
                            <use href="assets/icons/sprite.svg#icon-percent"/>
                        </svg>
                    </div>
                    <span>Waivers</span>
                </button>
                <button class="q-btn" onclick="navigateTo('financial-reports')">
                    <div class="q-icon">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
                             stroke="currentColor" stroke-width="2">
                            <use href="assets/icons/sprite.svg#icon-bar-chart-2"/>
                        </svg>
                    </div>
                    <span>Reports</span>
                </button>
                <button class="q-btn" onclick="navigateTo('receipts')">
                    <div class="q-icon">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
                             stroke="currentColor" stroke-width="2">
                            <use href="assets/icons/sprite.svg#icon-printer"/>
                        </svg>
                    </div>
                    <span>Receipts</span>
                </button>
                <button class="q-btn" onclick="navigateTo('balances')">
                    <div class="q-icon">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
                             stroke="currentColor" stroke-width="2">
                            <use href="assets/icons/sprite.svg#icon-wallet"/>
                        </svg>
                    </div>
                    <span>Balances</span>
                </button>
            </div>
        </div>

    </div>`;
}

/* ─────────────────────────────────────────────────────────────────
   SKELETON HELPER
   ───────────────────────────────────────────────────────────────── */
function showSkeleton(el) {
    el.innerHTML = `
    <div class="module-skeleton" aria-busy="true">
        <div class="skeleton-header">
            <div class="skeleton skeleton-title"></div>
            <div class="skeleton skeleton-btn"></div>
        </div>
        <div class="skeleton-stats">
            ${Array(6).fill('<div class="skeleton skeleton-stat-card"></div>').join('')}
        </div>
        <div class="skeleton skeleton-table-header"></div>
        ${Array(5).fill('<div class="skeleton skeleton-table-row"></div>').join('')}
    </div>`;
}

window.renderFinanceDashboard = renderFinanceDashboard;