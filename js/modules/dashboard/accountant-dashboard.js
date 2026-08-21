/* ═══════════════════════════════════════════════════════════════════
   js/modules/dashboard/accountant-dashboard.js
   ═══════════════════════════════════════════════════════════════════
   Rendered into #dynamic-content by core/router.js for 'accountant-dashboard'.
   Complete accountant dashboard with stats, charts, payments, overdue,
   and quick actions.
   Last updated: 2026-07-14
   ═══════════════════════════════════════════════════════════════════ */

// formatCurrency, fmtDate, esc (core/utils.js) and OVERDUE_THRESHOLDS (config/constants.js)
// are plain-script globals loaded earlier in index.html — no import needed.
// NOTE: getFullStudentBalance / getStudentCreditBalance were imported here previously but
// don't exist in core/finance-formulas.js and were never called in this file — removed as dead code.
const OVERDUE_THRESHOLDS_DEFAULT = OVERDUE_THRESHOLDS;

// ─── REAL DATA ───────────────────────────────────────────────────────
// Reuses the same shared formulas record-payment.js / student-fees.js /
// financial-reports.js already use, rather than inventing separate
// aggregation logic here.

function getDashboardData() {
  const termId = window.getActiveTermId ? window.getActiveTermId() : null;
  const todayStr = todayISO();

  const termFees = (state.studentFees || []).filter(f =>
    !termId || String(f.term_id) === String(termId)
  );
  const termPayments = (state.payments || []).filter(p =>
    !p.is_reversed && (!termId || String(p.term_id) === String(termId))
  );

  const collection = computeCollectionStats(termFees);
  const overdueBuckets = classifyOverdueFees(termFees);
  const allOverdueFees = [...overdueBuckets.critical, ...overdueBuckets.warning, ...overdueBuckets.mild, ...overdueBuckets.recent];
  const overdueOutstanding = allOverdueFees.reduce((sum, f) => sum + f.remaining, 0);

  const todaysPayments = (state.payments || [])
    .filter(p => !p.is_reversed && p.payment_date === todayStr)
    .sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
  const paymentsTodayTotal = todaysPayments.reduce((sum, p) => sum + Number(p.total_amount || 0), 0);

  const waivedTotal = termFees.reduce((sum, f) => sum + Number(f.waived_amount || 0), 0);
  const waivedCount = termFees.filter(f => f.is_waived).length;

  const stats = [
    { family: 'finance', icon: '<i class="fa-solid fa-sack-dollar"></i>', value: formatCurrency(collection.totalExpected), label: 'Total Fees (Term)', trend: { dir: 'up', text: `${collection.totalStudents} student${collection.totalStudents === 1 ? '' : 's'} billed` } },
    { family: 'finance', icon: '<i class="fa-solid fa-circle-check"></i>', value: formatCurrency(collection.totalCollected), label: 'Collected', trend: { dir: 'up', text: `${collection.collectionRate}% of total` } },
    { family: 'attendance', icon: '<i class="fa-solid fa-clock"></i>', value: formatCurrency(collection.totalOutstanding), label: 'Pending', trend: { dir: 'down', text: `${collection.totalExpected > 0 ? Math.round((collection.totalOutstanding / collection.totalExpected) * 100) : 0}% outstanding` } },
    { family: 'staff', icon: '<i class="fa-solid fa-triangle-exclamation"></i>', value: String(overdueBuckets.total), label: 'Overdue Students', trend: { dir: 'up', text: `${formatCurrency(overdueOutstanding)} outstanding` } },
    { family: 'analytics', icon: '<i class="fa-solid fa-percent"></i>', value: `${collection.collectionRate}%`, label: 'Collection Rate', trend: { dir: collection.collectionRate >= 50 ? 'up' : 'down', text: `${collection.fullPayers} fully paid · ${collection.partialPayers} partial` } },
    { family: 'students', icon: '<i class="fa-solid fa-gift"></i>', value: formatCurrency(waivedTotal), label: 'Waived (Term)', trend: { dir: 'up', text: `${waivedCount} waiver${waivedCount === 1 ? '' : 's'} applied` } },
    { family: 'finance', icon: '<i class="fa-solid fa-calendar-day"></i>', value: String(todaysPayments.length), label: 'Payments Today', trend: { dir: 'up', text: `${formatCurrency(paymentsTodayTotal)} collected` } },
  ];

  // Per-class collection rate — used for both the bar chart and the
  // ranked list below it.
  const classMap = new Map((state.classes || []).map(c => [c.id, c.name]));
  const studentClassMap = new Map((state.students || []).map(s => [s.id, s.class_id]));
  const feesByClass = new Map();
  termFees.forEach(f => {
    const classId = studentClassMap.get(f.student_id);
    if (classId == null) return;
    if (!feesByClass.has(classId)) feesByClass.set(classId, []);
    feesByClass.get(classId).push(f);
  });
  const classRanking = [...feesByClass.entries()]
    .map(([classId, fees]) => ({
      name: classMap.get(classId) || `Class ${classId}`,
      rate: computeCollectionStats(fees).collectionRate,
    }))
    .sort((a, b) => b.rate - a.rate);
  const collectionByClass = {
    labels: classRanking.map(c => c.name),
    values: classRanking.map(c => c.rate),
  };

  const monthlyTrendPoints = computePaymentTrend(state.payments || [], 'month').slice(-6);
  const monthlyTrend = {
    labels: monthlyTrendPoints.map(p => {
      const [, m] = p.period.split('-');
      return ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][Number(m)] || p.period;
    }),
    points: monthlyTrendPoints.map((p, i) => ({ x: i + 1, y: Math.round((p.total / 1000000) * 100) / 100 })),
  };

  const studentMap = new Map((state.students || []).map(s => [s.id, s]));
  const overdueStudentTotals = new Map();
  allOverdueFees.forEach(f => {
    const cur = overdueStudentTotals.get(f.student_id) || { balance: 0, days: 0 };
    cur.balance += f.remaining;
    cur.days = Math.max(cur.days, f.days_overdue);
    overdueStudentTotals.set(f.student_id, cur);
  });
  const severityKeyFor = (days) => days >= OVERDUE_SEVERITY.CRITICAL ? 'critical'
    : days >= OVERDUE_SEVERITY.WARNING ? 'high'
    : days >= OVERDUE_SEVERITY.MILD ? 'medium'
    : 'recent';
  const overdueStudents = [...overdueStudentTotals.entries()]
    .map(([studentId, totals]) => {
      const s = studentMap.get(studentId);
      return {
        name: s ? `${s.first_name || ''} ${s.last_name || ''}`.trim() : `Student #${studentId}`,
        classId: classMap.get(s?.class_id) || '—',
        balance: `${formatCurrency(totals.balance)}`,
        days: totals.days,
        severity: severityKeyFor(totals.days),
      };
    })
    .sort((a, b) => b.days - a.days)
    .slice(0, 15);

  const severityBuckets = [
    { key: 'critical', label: `Critical >${OVERDUE_SEVERITY.CRITICAL}d`, count: overdueBuckets.critical.length },
    { key: 'high', label: `High ${OVERDUE_SEVERITY.WARNING}-${OVERDUE_SEVERITY.CRITICAL - 1}d`, count: overdueBuckets.warning.length },
    { key: 'medium', label: `Medium ${OVERDUE_SEVERITY.MILD}-${OVERDUE_SEVERITY.WARNING - 1}d`, count: overdueBuckets.mild.length },
    { key: 'recent', label: `Recent 1-${OVERDUE_SEVERITY.MILD - 1}d`, count: overdueBuckets.recent.length },
  ];

  const methodBreakdown = computeMethodBreakdown(termPayments);
  const METHOD_COLORS = { Cash: '#3a7a5a', 'Mobile Money': '#4a7a8a', 'M-Pesa': '#4a7a8a', 'Bank Transfer': '#7a5a9a', Cheque: '#b8983a' };
  const paymentMethods = methodBreakdown.map(m => ({ name: m.method, pct: m.pct, color: METHOD_COLORS[m.method] || '#6a6a6a' }));

  const notifications = (state.notifications || []).slice(0, 6).map(n => ({
    id: n.id,
    type: n.type || 'info',
    text: esc(n.message || ''),
    time: n.created_at ? fmtDate(n.created_at) : '',
    action: (n.type === 'overdue' || n.type === 'payment') ? 'Pay' : 'View',
    isRead: !!n.is_read,
  }));

  return {
    stats, collectionByClass, monthlyTrend, todaysPayments: todaysPayments.map(p => {
      const s = studentMap.get(p.student_id);
      return {
        time: p.created_at ? new Date(p.created_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '—',
        name: s ? `${s.first_name || ''} ${s.last_name || ''}`.trim() : `Student #${p.student_id}`,
        classId: classMap.get(s?.class_id) || '—',
        amount: Number(p.total_amount || 0),
        by: p.recorded_by_name || 'Staff',
      };
    }),
    paymentsTodayTotal,
    notifications, severityBuckets, overdueStudents, paymentMethods, classRanking,
    overdueCount: overdueBuckets.total,
    overdueOutstanding,
  };
}

// ─── SEVERITY COLORS ──────────────────────────────────────────────────

const SEVERITY_COLORS = {
  critical: { bg: 'rgba(196, 90, 74, 0.15)', color: '#c45a4a', label: 'Critical' },
  high: { bg: 'rgba(184, 152, 58, 0.15)', color: '#b8983a', label: 'High' },
  medium: { bg: 'rgba(184, 152, 58, 0.10)', color: '#b8983a', label: 'Medium' },
  recent: { bg: 'rgba(58, 122, 90, 0.12)', color: '#3a7a5a', label: 'Recent' }
};

// ─── MODULE ACCENTS ──────────────────────────────────────────────────

const MODULE_ACCENTS = {
  finance: '#3a7a5a',
  attendance: '#b8983a',
  staff: '#c45a4a',
  analytics: '#4a7a8a',
  students: '#7a5a9a',
  academics: '#8a6aaa'
};

// ─── QUICK ACTIONS ─────────────────────────────────────────────────────
// Static navigation shortcuts, not entity data — nothing here to load
// from the database.

const QUICK_ACTIONS = [
  { id: 'record-payment', label: 'Record Payment', family: 'finance', icon: 'fa-money-bill-wave' },
  { id: 'receipts', label: 'Print Receipt', family: 'finance', icon: 'fa-receipt' },
  { id: 'student-fees', label: 'Student Fees', family: 'students', icon: 'fa-users' },
  { id: 'fee-structure', label: 'Fee Structure', family: 'finance', icon: 'fa-list-check' },
  { id: 'bulk-export', label: 'Export Report', family: 'analytics', icon: 'fa-file-lines' },
  { id: 'payment-history', label: 'Overdue List', family: 'attendance', icon: 'fa-triangle-exclamation' },
  { id: 'payment-reversals', label: 'Reversal', family: 'finance', icon: 'fa-rotate-left' },
  { id: 'finance-audit', label: 'Finance Audit', family: 'staff', icon: 'fa-magnifying-glass-chart' }
];

// Holds the last computed real dataset so each render* helper below can
// read from it without recomputing or threading it through every call.
let dashboardData = null;
let hasTriedLazyLoad = false;

// ─── RENDER FUNCTION ─────────────────────────────────────────────────

function renderAccountantDashboard(container) {
  if (!container) {
    console.warn('[AccountantDashboard] No container provided');
    return;
  }

  dashboardData = getDashboardData();

  container.innerHTML = `
        <div class="accountant-dashboard">

            <!-- ═══ STATS CARDS (7) ═══ -->
            <div class="stats-grid" id="acc-stats-grid"></div>

            <!-- ═══ CHARTS ROW ═══ -->
            <div class="charts-row">
                <div class="dash-card">
                    <div class="chart-head">
                        <span class="title"><i class="fa-solid fa-chart-column" style="color:var(--success);margin-right:6px;"></i> Collection by Class</span>
                        <span class="badge">This Term</span>
                    </div>
                    <div class="chart-container tall"><canvas id="collectionChart"></canvas></div>
                </div>
                <div class="dash-card">
                    <div class="chart-head">
                        <span class="title"><i class="fa-solid fa-chart-line" style="color:var(--info);margin-right:6px;"></i> Monthly Trend</span>
                        <span class="badge">Last 6 Months</span>
                    </div>
                    <div class="chart-container tall"><canvas id="trendChart"></canvas></div>
                </div>
            </div>

            <!-- ═══ TODAY'S ACTIVITY + NOTIFICATIONS ═══ -->
            <div class="activity-row">
                <div class="activity-panel">
                    <div class="panel-head">
                        <span class="title"><i class="fa-solid fa-credit-card" style="color:var(--success);margin-right:6px;"></i> Today's Payments</span>
                        <span class="badge">${dashboardData.todaysPayments.length} payments</span>
                    </div>
                    <div id="todays-payments-list"></div>
                    <div style="margin-top:8px;font-size:11px;color:var(--text-soft);text-align:center;">
                        <i class="fa-regular fa-clock"></i> ${dashboardData.todaysPayments.length} payments · ${formatCurrency(dashboardData.paymentsTodayTotal)} collected today
                    </div>
                </div>

                <div class="activity-panel">
                    <div class="panel-head">
                        <span class="title"><i class="fa-regular fa-bell" style="color:var(--gold);margin-right:6px;"></i> Live Notifications</span>
                        <span class="badge">${dashboardData.notifications.filter(n => !n.isRead).length} unread</span>
                    </div>
                    <div id="live-notifications-list"></div>
                </div>
            </div>

            <!-- ═══ OVERDUE SECTION ═══ -->
            <div class="overdue-section">
                <div class="overdue-card">
                    <div class="overdue-head">
                        <span class="title"><i class="fa-solid fa-triangle-exclamation" style="color:var(--danger);margin-right:6px;"></i> Overdue Payments</span>
                        <span class="badge">${dashboardData.overdueCount} students · ${formatCurrency(dashboardData.overdueOutstanding)}</span>
                    </div>

                    <div class="severity-row" id="severity-buckets"></div>

                    <div id="overdue-table-container"></div>

                    <div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap;">
                        <button class="action-btn" data-nav="payment-history" style="padding:4px 16px;font-size:10px;background:var(--bg-tertiary);color:var(--text-soft);border:1px solid var(--border-light);border-radius:20px;cursor:pointer;">
                            <i class="fa-solid fa-file-export"></i> Export Overdue
                        </button>
                        <button class="action-btn" data-bulk-remind style="padding:4px 16px;font-size:10px;background:var(--bg-tertiary);color:var(--text-soft);border:1px solid var(--border-light);border-radius:20px;cursor:pointer;">
                            <i class="fa-solid fa-envelope"></i> Bulk Reminders
                        </button>
                        <button class="action-btn" data-nav="record-payment" style="padding:4px 16px;font-size:10px;background:var(--role-primary);color:var(--text-inverse);border:1px solid var(--role-primary);border-radius:20px;cursor:pointer;">
                            <i class="fa-solid fa-money-bills"></i> Bulk Pay
                        </button>
                    </div>
                </div>
            </div>

            <!-- ═══ PAYMENT METHODS + CLASS RANKING ═══ -->
            <div class="bottom-row">
                <div class="method-card">
                    <div class="method-head">
                        <span class="title"><i class="fa-solid fa-chart-pie" style="color:var(--gold);margin-right:6px;"></i> Payment Methods</span>
                        <span class="badge">This Term</span>
                    </div>
                    <div id="payment-methods-list"></div>
                </div>

                <div class="method-card">
                    <div class="method-head">
                        <span class="title"><i class="fa-solid fa-ranking-star" style="color:var(--gold);margin-right:6px;"></i> Class Collection Ranking</span>
                        <span class="badge">This Term</span>
                    </div>
                    <div id="class-ranking-list"></div>
                </div>
            </div>

            <!-- ═══ QUICK ACTIONS ═══ -->
            <div class="quick-actions" id="acc-quick-actions"></div>

        </div>
    `;

  // ─── Render all sections ────────────────────────────────────────────

  renderStats(container);
  renderTodaysPayments(container);
  renderNotifications(container);
  renderSeverityBuckets(container);
  renderOverdueTable(container);
  renderPaymentMethods(container);
  renderClassRanking(container);
  renderQuickActions(container);

  // ─── Charts ─────────────────────────────────────────────────────────

  renderCharts(container);

  // ─── Wire navigation ───────────────────────────────────────────────

  wireStaticNav(container);

  // ─── Apply animations ──────────────────────────────────────────────

  animateBars();

  // student_fees/payments are lazily-loaded large tables — trigger a
  // load if this session hasn't already, then recompute + re-render so
  // the dashboard reflects real numbers instead of empty totals.
  const needsFees = !state.studentFees || state.studentFees.length === 0;
  const needsPayments = !state.payments || state.payments.length === 0;
  if (!hasTriedLazyLoad && (needsFees || needsPayments)) {
    hasTriedLazyLoad = true;
    Promise.all([
      needsFees ? window.loadStudentFees?.() : Promise.resolve(),
      needsPayments ? window.loadPayments?.() : Promise.resolve(),
    ]).then(() => {
      if (container.isConnected) renderAccountantDashboard(container);
    }).catch(() => {});
  }
}

// ─── RENDER STATS ─────────────────────────────────────────────────────

function renderStats(container) {
  const el = container.querySelector('#acc-stats-grid');
  if (!el) return;

  el.innerHTML = dashboardData.stats.map((stat, idx) => {
    const accentClass = `accent-${(idx % 7) + 1}`;
    const trendIcon = stat.trend.dir === 'up' ? '↑' : '↓';
    const trendClass = stat.trend.dir === 'up' ? 'up' : 'down';

    return `
            <div class="stat-card ${accentClass}">
                <div class="top-row">
                    <div class="left">
                        <div class="icon i${(idx % 7) + 1}">${stat.icon}</div>
                        <span class="title">${esc(stat.label)}</span>
                    </div>
                    <span class="trend ${trendClass}"><span class="arrow">${trendIcon}</span> ${stat.trend.text}</span>
                </div>
                <div class="main-value">${esc(stat.value)}</div>
                <div class="sub-text">${stat.trend.text}</div>
            </div>
        `;
  }).join('');
}

// ─── RENDER TODAY'S PAYMENTS ─────────────────────────────────────────

function renderTodaysPayments(container) {
  const el = container.querySelector('#todays-payments-list');
  if (!el) return;

  el.innerHTML = dashboardData.todaysPayments.map(p => `
        <div class="payment-item">
            <span class="time">${esc(p.time)}</span>
            <div class="info">
                <div class="name">${esc(p.name)}</div>
                <div class="class">${esc(p.classId)}</div>
            </div>
            <span class="amount">${formatCurrency(p.amount)}</span>
            <span class="by ${p.by.toLowerCase()}">${esc(p.by)}</span>
        </div>
    `).join('');
}

// ─── RENDER NOTIFICATIONS ─────────────────────────────────────────────

const NOTIF_ICONS = {
  payment: '<i class="fa-solid fa-money-bill-wave"></i>',
  overdue: '<i class="fa-solid fa-triangle-exclamation"></i>',
  info: '<i class="fa-regular fa-circle-check"></i>',
  marks: '<i class="fa-solid fa-pen-to-square"></i>',
  attendance: '<i class="fa-solid fa-clipboard-check"></i>',
  student: '<i class="fa-solid fa-user-graduate"></i>',
  system: '<i class="fa-solid fa-gear"></i>',
  announcement: '<i class="fa-solid fa-bullhorn"></i>',
  reminder: '<i class="fa-regular fa-bell"></i>',
  urgent: '<i class="fa-solid fa-circle-exclamation"></i>',
  warning: '<i class="fa-solid fa-triangle-exclamation"></i>',
};
const NOTIF_ICON_DEFAULT = '<i class="fa-regular fa-bell"></i>';

const NOTIF_COLORS = {
  payment: 'var(--success)',
  overdue: 'var(--danger)',
  info: 'var(--info)',
  marks: 'var(--accent)',
  attendance: 'var(--warning)',
  student: 'var(--info)',
  system: 'var(--text-soft)',
  announcement: 'var(--gold)',
  reminder: 'var(--warning)',
  urgent: 'var(--danger)',
  warning: 'var(--warning)',
};
const NOTIF_COLOR_DEFAULT = 'var(--text-soft)';

function renderNotifications(container) {
  const el = container.querySelector('#live-notifications-list');
  if (!el) return;

  if (!dashboardData.notifications.length) {
    el.innerHTML = `<div style="padding:24px;text-align:center;color:var(--text-soft);font-size:0.8rem;">No notifications yet.</div>`;
    return;
  }

  el.innerHTML = dashboardData.notifications.map((n, i) => `
        <div class="notif-item" style="${n.isRead ? 'opacity:0.6;' : ''}">
            <div class="notif-icon ${n.type}" style="color:${NOTIF_COLORS[n.type] || NOTIF_COLOR_DEFAULT};">${NOTIF_ICONS[n.type] || NOTIF_ICON_DEFAULT}</div>
            <div class="notif-body">
                <div class="text">${n.text}</div>
                <div class="time">${esc(n.time)}</div>
            </div>
            <button class="notif-action" data-notif-action="${i}">${esc(n.action)}</button>
        </div>
    `).join('');

  el.querySelectorAll('[data-notif-action]').forEach(btn => {
    btn.addEventListener('click', () => {
      const n = dashboardData.notifications[parseInt(btn.dataset.notifAction, 10)];
      if (n.id != null) window.markNotificationRead?.(n.id);
      if (n.type === 'overdue' || n.type === 'payment') {
        window.navigateTo('payment-history');
      } else if (n.type === 'marks') {
        window.navigateTo('marks-database');
      } else if (n.type === 'attendance') {
        window.navigateTo('attendance-reports');
      }
    });
  });
}

// ─── RENDER SEVERITY BUCKETS ─────────────────────────────────────────

function renderSeverityBuckets(container) {
  const el = container.querySelector('#severity-buckets');
  if (!el) return;

  el.innerHTML = dashboardData.severityBuckets.map(b => {
    const color = SEVERITY_COLORS[b.key]?.color || 'var(--text-soft)';
    return `
            <div class="severity-item ${b.key}">
                <div class="sev-label">${esc(b.label)}</div>
                <div class="sev-count" style="color:${color}">${b.count}</div>
            </div>
        `;
  }).join('');
}

// ─── RENDER OVERDUE TABLE ────────────────────────────────────────────

function renderOverdueTable(container) {
  const el = container.querySelector('#overdue-table-container');
  if (!el) return;

  const rows = dashboardData.overdueStudents.map(s => {
    const sev = SEVERITY_COLORS[s.severity] || SEVERITY_COLORS.medium;
    return `
            <tr>
                <td><strong>${esc(s.name)}</strong></td>
                <td>${esc(s.classId)}</td>
                <td>${esc(s.balance)}</td>
                <td>${s.days}d</td>
                <td><span class="sev-badge ${s.severity}" style="background:${sev.bg};color:${sev.color};">${esc(sev.label)}</span></td>
                <td>
                    <button class="action-btn pay" data-pay="${esc(s.name)}">Pay</button>
                    <button class="action-btn" data-remind="${esc(s.name)}">Remind</button>
                </td>
            </tr>
        `;
  }).join('');

  el.innerHTML = `
        <table class="overdue-table">
            <thead>
                <tr>
                    <th>Student</th>
                    <th>Class</th>
                    <th>Balance</th>
                    <th>Days</th>
                    <th>Severity</th>
                    <th>Action</th>
                </tr>
            </thead>
            <tbody>${rows}</tbody>
        </table>
    `;

  el.querySelectorAll('[data-pay]').forEach(btn => {
    btn.addEventListener('click', () => {
      window.navigateTo('record-payment');
    });
  });

  el.querySelectorAll('[data-remind]').forEach(btn => {
    btn.addEventListener('click', () => {
      const name = btn.dataset.remind;
      showToast(`Reminder sent to ${name}`, 'info');
    });
  });
}

// ─── RENDER PAYMENT METHODS ──────────────────────────────────────────

function renderPaymentMethods(container) {
  const el = container.querySelector('#payment-methods-list');
  if (!el) return;

  el.innerHTML = dashboardData.paymentMethods.map(m => `
        <div class="method-item">
            <div class="icon ${m.name.toLowerCase().replace(/\s/g, '')}"><i class="fa-solid ${m.icon || 'fa-money-bill'}"></i></div>
            <div class="info">
                <div class="name">${esc(m.name)}</div>
                <div class="bar">
                    <div class="fill" style="width:${m.pct}%;background:${m.color};" data-target="${m.pct}"></div>
                </div>
            </div>
            <span class="pct">${m.pct}%</span>
        </div>
    `).join('');
}

// ─── RENDER CLASS RANKING ────────────────────────────────────────────

function renderClassRanking(container) {
  const el = container.querySelector('#class-ranking-list');
  if (!el) return;

  const medals = [
    '<i class="fa-solid fa-medal" style="color:#d4af37;"></i>',
    '<i class="fa-solid fa-medal" style="color:#a8a8a8;"></i>',
    '<i class="fa-solid fa-medal" style="color:#b08d57;"></i>'
  ];
  const statusMap = [
    { min: 90, label: 'Excellent', class: 'good' },
    { min: 75, label: 'Good', class: 'good' },
    { min: 60, label: 'Partial', class: 'warn' },
    { min: 0, label: 'Low', class: 'danger' }
  ];

  const getStatus = (rate) => {
    for (const s of statusMap) {
      if (rate >= s.min) return s;
    }
    return statusMap[statusMap.length - 1];
  };

  el.innerHTML = dashboardData.classRanking.map((c, i) => {
    const medal = medals[i] || `${i + 1}`;
    const status = getStatus(c.rate);
    return `
            <div class="rank-item">
                <span class="pos ${i < 3 ? ['gold', 'silver', 'bronze'][i] : ''}">${medal}</span>
                <div class="info">
                    <div class="name">${esc(c.name)}</div>
                    <div class="rate">${c.rate}% collected</div>
                </div>
                <span class="status ${status.class}">${esc(status.label)}</span>
            </div>
        `;
  }).join('');
}

// ─── RENDER QUICK ACTIONS ────────────────────────────────────────────

function renderQuickActions(container) {
  const el = container.querySelector('#acc-quick-actions');
  if (!el) return;

  const accentColors = {
    finance: 'var(--success)',
    students: 'var(--info)',
    analytics: 'var(--purple)',
    attendance: 'var(--warning)',
    staff: 'var(--danger)',
    academics: 'var(--accent)'
  };

  el.innerHTML = QUICK_ACTIONS.map(a => {
    const color = accentColors[a.family] || 'var(--text-soft)';
    return `
            <button class="quick-btn" data-nav="${a.id}">
                <span class="icon" style="background:${color}22;color:${color};"><i class="fa-solid ${a.icon}"></i></span>
                <span class="label">${esc(a.label)}</span>
            </button>
        `;
  }).join('');
}

// ─── RENDER CHARTS ───────────────────────────────────────────────────

function renderCharts(container) {
  // Collection by Class Chart
  const ctx1 = container.querySelector('#collectionChart')?.getContext('2d');
  if (ctx1) {
    const colors = ['#3a7a5a', '#3a7a5a', '#4a7a8a', '#b8983a', '#b8983a', '#c45a4a'];
    new Chart(ctx1, {
      type: 'bar',
      data: {
        labels: dashboardData.collectionByClass.labels,
        datasets: [{
          label: 'Collection Rate (%)',
          data: dashboardData.collectionByClass.values,
          backgroundColor: colors,
          borderRadius: 6
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: function (context) {
                return context.parsed.y + '% collected';
              }
            }
          }
        },
        scales: {
          y: {
            beginAtZero: true,
            max: 100,
            grid: { color: 'rgba(26, 20, 16, 0.04)' },
            ticks: { callback: function (v) { return v + '%'; } }
          },
          x: { grid: { display: false } }
        }
      }
    });
  }

  // Monthly Trend Chart
  const ctx2 = container.querySelector('#trendChart')?.getContext('2d');
  if (ctx2) {
    new Chart(ctx2, {
      type: 'line',
      data: {
        labels: dashboardData.monthlyTrend.labels,
        datasets: [{
          label: 'Collected (M RWF)',
          data: dashboardData.monthlyTrend.points.map(p => p.y),
          borderColor: '#3a7a5a',
          backgroundColor: function (context) {
            const ctx = context.chart.ctx;
            const gradient = ctx.createLinearGradient(0, 0, 0, 220);
            gradient.addColorStop(0, 'rgba(58, 122, 90, 0.25)');
            gradient.addColorStop(1, 'rgba(58, 122, 90, 0)');
            return gradient;
          },
          fill: true,
          tension: 0.4,
          pointBackgroundColor: '#3a7a5a',
          pointBorderColor: '#1a1410',
          pointBorderWidth: 2,
          pointRadius: 4
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: function (context) {
                return context.parsed.y + 'M RWF';
              }
            }
          }
        },
        scales: {
          y: {
            beginAtZero: true,
            grid: { color: 'rgba(26, 20, 16, 0.04)' },
            ticks: { callback: function (v) { return v + 'M'; } }
          },
          x: { grid: { display: false } }
        }
      }
    });
  }
}

// ─── ANIMATE BARS ────────────────────────────────────────────────────

function animateBars() {
  document.querySelectorAll('.method-item .fill').forEach(bar => {
    const target = parseFloat(bar.dataset.target) || 0;
    setTimeout(() => {
      bar.style.width = target + '%';
    }, 200);
  });
}

// ─── WIRE STATIC NAV ─────────────────────────────────────────────────

function wireStaticNav(container) {
  container.querySelectorAll('[data-nav]').forEach(el => {
    el.style.cursor = 'pointer';
    el.addEventListener('click', () => {
      const moduleId = el.dataset.nav;
      if (moduleId && window.navigateTo) {
        window.navigateTo(moduleId);
      }
    });
  });

  container.querySelectorAll('[data-bulk-remind]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const confirmed = confirm(
        `Send payment reminders to all ${dashboardData.overdueStudents.length} overdue families?`
      );
      if (confirmed) {
        showToast(`Reminders sent to ${dashboardData.overdueStudents.length} families`, 'success');
      }
    });
  });
}

// ─── EXPOSE ────────────────────────────────────────────────────────── ──────────────────────────────────────────────────────────

window.renderAccountantDashboard = renderAccountantDashboard;
