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

// ─── MOCK DATA (will be replaced with real API calls) ──────────────────

const MOCK_DATA = {
  stats: [
    {
      family: 'finance',
      icon: '<i class="fa-solid fa-sack-dollar"></i>',
      value: '12.4M',
      label: 'Total Fees (Term)',
      trend: { dir: 'up', text: '8% · +1.2M vs last term' }
    },
    {
      family: 'finance',
      icon: '<i class="fa-solid fa-circle-check"></i>',
      value: '9.8M',
      label: 'Collected',
      trend: { dir: 'up', text: '79% of total' }
    },
    {
      family: 'attendance',
      icon: '<i class="fa-solid fa-clock"></i>',
      value: '2.6M',
      label: 'Pending',
      trend: { dir: 'down', text: '21% outstanding' }
    },
    {
      family: 'staff',
      icon: '<i class="fa-solid fa-triangle-exclamation"></i>',
      value: '24',
      label: 'Overdue Students',
      trend: { dir: 'up', text: '+4 from last week' }
    },
    {
      family: 'analytics',
      icon: '<i class="fa-solid fa-percent"></i>',
      value: '79.3%',
      label: 'Collection Rate',
      trend: { dir: 'up', text: 'Target 85%' }
    },
    {
      family: 'students',
      icon: '<i class="fa-solid fa-gift"></i>',
      value: '245K',
      label: 'Waived (Term)',
      trend: { dir: 'up', text: '12 waivers applied' }
    },
    {
      family: 'finance',
      icon: '<i class="fa-solid fa-calendar-day"></i>',
      value: '5',
      label: 'Payments Today',
      trend: { dir: 'up', text: '150K RWF collected' }
    }
  ],

  collectionByClass: {
    labels: ['P1', 'P2', 'P3A', 'P4A', 'P5B', 'P6'],
    values: [84, 67, 100, 41, 77, 89]
  },

  monthlyTrend: {
    points: [
      { x: 1, y: 6.2 },
      { x: 2, y: 7.1 },
      { x: 3, y: 6.8 },
      { x: 4, y: 8.4 },
      { x: 5, y: 9.1 },
      { x: 6, y: 9.8 }
    ],
    labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun']
  },

  todaysPayments: [
    { time: '10:42', name: 'MUGISHA Jean', classId: 'Primary 4A', amount: 50000, by: 'Admin' },
    { time: '09:15', name: 'UWERA Grace', classId: 'Primary 5B', amount: 30000, by: 'Admin' },
    { time: '08:30', name: 'KAMALI Moses', classId: 'Primary 3A', amount: 25000, by: 'Self' },
    { time: '08:00', name: 'NIYONZIMA C.', classId: 'Primary 1', amount: 20000, by: 'Self' },
    { time: '07:45', name: 'HABIMANA E.', classId: 'Primary 4A', amount: 25000, by: 'Self' }
  ],

  notifications: [
    {
      type: 'payment',
      text: '<strong>Admin</strong> recorded 50,000 RWF for MUGISHA Jean',
      time: '10:42 AM',
      action: 'View'
    },
    {
      type: 'overdue',
      text: '<strong>HABIMANA Eric</strong> overdue 14 days · Balance 45,000 RWF',
      time: '08:20 AM',
      action: 'Pay'
    },
    {
      type: 'info',
      text: '<strong>Collection rate</strong> reached 79.3%',
      time: 'Yesterday',
      action: 'Report'
    },
    {
      type: 'overdue',
      text: '<strong>3 new overdue</strong> students detected',
      time: 'Yesterday',
      action: 'View'
    }
  ],

  severityBuckets: [
    { key: 'critical', label: `Critical >${OVERDUE_THRESHOLDS_DEFAULT?.critical ?? 45}d`, count: 6 },
    { key: 'high', label: `High ${OVERDUE_THRESHOLDS_DEFAULT?.warning ?? 21}-${(OVERDUE_THRESHOLDS_DEFAULT?.critical ?? 45) - 1}d`, count: 8 },
    { key: 'medium', label: `Medium ${OVERDUE_THRESHOLDS_DEFAULT?.mild ?? 7}-${(OVERDUE_THRESHOLDS_DEFAULT?.warning ?? 21) - 1}d`, count: 16 },
    { key: 'recent', label: `Recent 7-13d`, count: 20 }
  ],

  overdueStudents: [
    { name: 'HABIMANA Eric', classId: 'P4A', balance: '85,000 RWF', days: 47, severity: 'critical' },
    { name: 'INGABIRE Sarah', classId: 'P2B', balance: '60,000 RWF', days: 31, severity: 'high' },
    { name: 'KAMALI Moses', classId: 'P3A', balance: '45,000 RWF', days: 28, severity: 'medium' },
    { name: 'UWERA Grace', classId: 'P5B', balance: '30,000 RWF', days: 12, severity: 'recent' }
  ],

  paymentMethods: [
    { name: 'Cash', pct: 55, color: '#3a7a5a' },
    { name: 'Mobile Money', pct: 22, color: '#4a7a8a' },
    { name: 'Bank Transfer', pct: 18, color: '#7a5a9a' },
    { name: 'Cheque', pct: 5, color: '#b8983a' }
  ],

  classRanking: [
    { name: 'Primary 3', rate: 100 },
    { name: 'Primary 6', rate: 89 },
    { name: 'Primary 1', rate: 84 },
    { name: 'Primary 5B', rate: 77 },
    { name: 'Primary 2', rate: 67 },
    { name: 'Primary 4A', rate: 41 }
  ],

  quickActions: [
    { id: 'record-payment', label: 'Record Payment', family: 'finance', icon: 'fa-money-bill-wave' },
    { id: 'receipts', label: 'Print Receipt', family: 'finance', icon: 'fa-receipt' },
    { id: 'student-fee-status', label: 'Student Fees', family: 'students', icon: 'fa-users' },
    { id: 'fee-structure', label: 'Fee Structure', family: 'finance', icon: 'fa-list-check' },
    { id: 'bulk-export', label: 'Export Report', family: 'analytics', icon: 'fa-file-lines' },
    { id: 'payment-history', label: 'Overdue List', family: 'attendance', icon: 'fa-triangle-exclamation' },
    { id: 'payment-reversals', label: 'Reversal', family: 'finance', icon: 'fa-rotate-left' },
    { id: 'finance-audit', label: 'Finance Audit', family: 'staff', icon: 'fa-magnifying-glass-chart' }
  ]
};

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

// ─── RENDER FUNCTION ─────────────────────────────────────────────────

function renderAccountantDashboard(container) {
  if (!container) {
    console.warn('[AccountantDashboard] No container provided');
    return;
  }

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
                        <span class="badge">${MOCK_DATA.todaysPayments.length} payments</span>
                    </div>
                    <div id="todays-payments-list"></div>
                    <div style="margin-top:8px;font-size:11px;color:var(--text-soft);text-align:center;">
                        <i class="fa-regular fa-clock"></i> ${MOCK_DATA.todaysPayments.length} payments · 150K RWF collected today
                        <span style="color:var(--success);margin-left:6px;">📈 +20% vs yesterday</span>
                    </div>
                </div>

                <div class="activity-panel">
                    <div class="panel-head">
                        <span class="title"><i class="fa-regular fa-bell" style="color:var(--gold);margin-right:6px;"></i> Live Notifications</span>
                        <span class="badge">${MOCK_DATA.notifications.length} unread</span>
                    </div>
                    <div id="live-notifications-list"></div>
                </div>
            </div>

            <!-- ═══ OVERDUE SECTION ═══ -->
            <div class="overdue-section">
                <div class="overdue-card">
                    <div class="overdue-head">
                        <span class="title"><i class="fa-solid fa-triangle-exclamation" style="color:var(--danger);margin-right:6px;"></i> Overdue Payments</span>
                        <span class="badge">${MOCK_DATA.overdueStudents.length} students · 2.6M RWF</span>
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
}

// ─── RENDER STATS ─────────────────────────────────────────────────────

function renderStats(container) {
  const el = container.querySelector('#acc-stats-grid');
  if (!el) return;

  el.innerHTML = MOCK_DATA.stats.map((stat, idx) => {
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

  el.innerHTML = MOCK_DATA.todaysPayments.map(p => `
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
  info: '<i class="fa-regular fa-circle-check"></i>'
};

const NOTIF_COLORS = {
  payment: 'var(--success)',
  overdue: 'var(--danger)',
  info: 'var(--info)'
};

function renderNotifications(container) {
  const el = container.querySelector('#live-notifications-list');
  if (!el) return;

  el.innerHTML = MOCK_DATA.notifications.map((n, i) => `
        <div class="notif-item">
            <div class="notif-icon ${n.type}" style="color:${NOTIF_COLORS[n.type]};">${NOTIF_ICONS[n.type]}</div>
            <div class="notif-body">
                <div class="text">${n.text}</div>
                <div class="time">${esc(n.time)}</div>
            </div>
            <button class="notif-action" data-notif-action="${i}">${esc(n.action)}</button>
        </div>
    `).join('');

  el.querySelectorAll('[data-notif-action]').forEach(btn => {
    btn.addEventListener('click', () => {
      const n = MOCK_DATA.notifications[parseInt(btn.dataset.notifAction, 10)];
      if (n.type === 'overdue' && n.action === 'Pay') {
        window.navigateTo('record-payment');
      } else {
        window.navigateTo('payment-history');
      }
    });
  });
}

// ─── RENDER SEVERITY BUCKETS ─────────────────────────────────────────

function renderSeverityBuckets(container) {
  const el = container.querySelector('#severity-buckets');
  if (!el) return;

  el.innerHTML = MOCK_DATA.severityBuckets.map(b => {
    const color = SEVERITY_COLORS[b.key]?.color || 'var(--text-soft)';
    return `
            <div class="severity-item ${b.key}">
                <div class="sev-label">${esc(b.label)}</div>
                <div class="sev-count" style="color:${color}">${b.count}</div>
                <div class="sev-trend"><span class="arrow">${b.key === 'critical' || b.key === 'recent' ? '↑' : '↓'}</span> ${b.key === 'critical' ? '+2' : b.key === 'recent' ? '+1' : '-1'}</div>
            </div>
        `;
  }).join('');
}

// ─── RENDER OVERDUE TABLE ────────────────────────────────────────────

function renderOverdueTable(container) {
  const el = container.querySelector('#overdue-table-container');
  if (!el) return;

  const rows = MOCK_DATA.overdueStudents.map(s => {
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
      showToast(`📧 Reminder sent to ${name}`, 'info');
    });
  });
}

// ─── RENDER PAYMENT METHODS ──────────────────────────────────────────

function renderPaymentMethods(container) {
  const el = container.querySelector('#payment-methods-list');
  if (!el) return;

  el.innerHTML = MOCK_DATA.paymentMethods.map(m => `
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

  const medals = ['🥇', '🥈', '🥉'];
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

  el.innerHTML = MOCK_DATA.classRanking.map((c, i) => {
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

  el.innerHTML = MOCK_DATA.quickActions.map(a => {
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
        labels: MOCK_DATA.collectionByClass.labels,
        datasets: [{
          label: 'Collection Rate (%)',
          data: MOCK_DATA.collectionByClass.values,
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
        labels: MOCK_DATA.monthlyTrend.labels,
        datasets: [{
          label: 'Collected (M RWF)',
          data: MOCK_DATA.monthlyTrend.points.map(p => p.y),
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
        `Send payment reminders to all ${MOCK_DATA.overdueStudents.length} overdue families?`
      );
      if (confirmed) {
        showToast(`📨 Reminders sent to ${MOCK_DATA.overdueStudents.length} families`, 'success');
      }
    });
  });
}

// ─── EXPOSE ────────────────────────────────────────────────────────── ──────────────────────────────────────────────────────────

window.renderAccountantDashboard = renderAccountantDashboard;
