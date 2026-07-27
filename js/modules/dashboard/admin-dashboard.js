/* ═══════════════════════════════════════════════════════════════════
   js/modules/dashboard/admin-dashboard.js
   ═══════════════════════════════════════════════════════════════════
   Rendered into #app-main by core/router.js when navigating to
   'admin-dashboard'.

   TODO: Replace MOCK_DATA with real DB queries once finance/analytics modules are complete.
   All data below is MOCK_DATA clearly marked for replacement once
   core/api.js can query Supabase — the render logic itself is real
   and won't need to change shape when that swap happens, since it
   already reads from these same field names.

   Last updated: 2026-07-14
   ═══════════════════════════════════════════════════════════════════ */

const AdminDashboard = (() => {

  /* ═══════════════════════════════════════════════════════════════
     MOCK DATA — Replace with API calls once Supabase is ready
     ═══════════════════════════════════════════════════════════════ */

  const MOCK_DATA = {
    // ── Hero Stats ──────────────────────────────────────────────
    heroStats: {
      students: 428,
      passRate: 89,
      collectionRate: 79
    },

    // ── Stat Cards ──────────────────────────────────────────────
    stats: [
      {
        icon: '<i class="fa-solid fa-users"></i>',
        value: '428',
        label: 'Students',
        trend: { dir: 'up', text: '12% · 398 active' }
      },
      {
        icon: '<i class="fa-regular fa-clipboard"></i>',
        value: '45',
        label: 'Assessments',
        trend: { dir: 'up', text: '3 new · 8 this week' }
      },
      {
        icon: '<i class="fa-regular fa-pen-to-square"></i>',
        value: '1,247',
        label: 'Marks Recorded',
        trend: { dir: 'up', text: '15% · 28 today' }
      },
      {
        icon: '<i class="fa-solid fa-chart-line"></i>',
        value: '72.4%',
        label: 'School Average',
        trend: { dir: 'up', text: '2.1% · above target' }
      },
      {
        icon: '<i class="fa-regular fa-calendar-check"></i>',
        value: '384',
        label: 'Present Today',
        trend: { dir: 'down', text: '44 absent' }
      },
      {
        icon: '<i class="fa-solid fa-sack-dollar"></i>',
        value: '79.3%',
        label: 'Fee Collection',
        trend: { dir: 'up', text: '9.8M / 12.4M RWF' }
      }
    ],

    // ── Charts ──────────────────────────────────────────────────
    classPerformance: {
      labels: ['P3', 'P6', 'P5B', 'P4A', 'P1', 'P2'],
      values: [89, 84, 78, 72, 62, 56],
      colors: ['#3a7a5a', '#3a7a5a', '#c9a84c', '#c9a84c', '#b56576', '#c45a4a']
    },

    gradeDistribution: {
      labels: ['A+', 'A', 'B', 'C', 'D', 'F'],
      values: [27, 25, 17, 12, 8, 6],
      colors: ['#3a7a5a', '#5a9a7a', '#6a8aba', '#c9a84c', '#c48a3a', '#c45a4a']
    },

    attendanceOverview: {
      present: 384,
      absent: 44,
      total: 428,
      labels: ['Present', 'Absent'],
      values: [384, 44],
      colors: ['#3a7a5a', '#c45a4a']
    },

    finance: {
      expected: '12.4M',
      collected: '9.8M',
      outstanding: '2.6M',
      rate: '79.3%',
      byClass: {
        labels: ['P3', 'P6', 'P5B', 'P4A', 'P1', 'P2'],
        values: [100, 89, 78, 71, 67, 62],
        colors: ['#3a7a5a', '#3a7a5a', '#c9a84c', '#c9a84c', '#b56576', '#c45a4a']
      }
    },

    // ── Top Performers ──────────────────────────────────────────
    topPerformers: [
      { name: 'HABIMANA Eric', class: 'Primary 3', score: 96 },
      { name: 'MUGISHA Jean', class: 'Primary 4A', score: 92 },
      { name: 'KAMALI Moses', class: 'Primary 6', score: 88 },
      { name: 'UWERA Grace', class: 'Primary 5B', score: 85 },
      { name: 'INGABIRE Sarah', class: 'Primary 2', score: 78 }
    ],

    // ── At-Risk Students ────────────────────────────────────────
    atRisk: [
      { name: 'MUGISHA Grace', class: 'Primary 1', score: 42 },
      { name: 'HABIMANA Jean', class: 'Primary 1', score: 48 },
      { name: 'KAMALI Jean', class: 'Primary 2', score: 52 },
      { name: 'UWERA Grace', class: 'Primary 2', score: 55 },
      { name: 'KAMALI Moses', class: 'Primary 3', score: 58 },
      { name: 'NIYONZIMA Jean', class: 'Primary 3', score: 60 },
      { name: 'MUKAMANA Ange', class: 'Primary 4A', score: 54 },
      { name: 'ISHIMWE Jean', class: 'Primary 4A', score: 56 },
      { name: 'UWIMANA Alice', class: 'Primary 5B', score: 57 },
      { name: 'BIZIMANA Eric', class: 'Primary 5B', score: 59 },
      { name: 'NSHIMIYE Paul', class: 'Primary 6', score: 61 },
      { name: 'MUTONI Divine', class: 'Primary 6', score: 63 }
    ],

    // ── Recent Activity ─────────────────────────────────────────
    recentActivity: [
      { text: '<strong>Admin</strong> logged in', time: '2m ago', family: 'system' },
      { text: '<strong>UWAYO Ganza</strong> saved 28 marks · P4A Math', time: '12m ago', family: 'academics' },
      { text: '<strong>Payment</strong> 50,000 RWF · MUGISHA Jean', time: '25m ago', family: 'finance' },
      { text: '<strong>New student</strong> HABIMANA Grace enrolled', time: '1h ago', family: 'students' },
      { text: '<strong>Backup</strong> created · 12.8 MB', time: '2h ago', family: 'system' },
      { text: '<strong>Fee structure</strong> updated', time: '3h ago', family: 'finance' },
      { text: '<strong>Admin</strong> updated school settings', time: '4h ago', family: 'system' },
      { text: '<strong>KAMANA Grace</strong> generated report cards', time: '5h ago', family: 'academics' },
      { text: '<strong>Payment</strong> 25,000 RWF · UWERA Grace', time: '6h ago', family: 'finance' },
      { text: '<strong>Class register</strong> exported to Excel', time: '7h ago', family: 'academics' }
    ]
  };

  /* ═══════════════════════════════════════════════════════════════
     COLOR PALETTE — Warm, no pure white, no pure black
     ═══════════════════════════════════════════════════════════════ */

  const COLORS = {
    primary: '#2d1f3a',
    primaryLight: '#7a5a7a',
    success: '#3a7a5a',
    successLight: '#5a9a7a',
    warning: '#c9a84c',
    warningLight: '#d9ba6a',
    danger: '#c45a4a',
    dangerLight: '#d46a5a',
    info: '#4a7a8a',
    infoLight: '#6a9aaa',
    rose: '#b56576',
    roseLight: '#d58a9a',
    gold: '#c9a84c',
    goldLight: '#f5e6c8',
    textBody: '#2c241e',
    textSoft: '#6b5f56',
    textMuted: '#a8988e',
    bgCard: '#fcfaf8',
    bgBody: '#f5f0eb'
  };

  /* ═══════════════════════════════════════════════════════════════
     HELPER FUNCTIONS
     ═══════════════════════════════════════════════════════════════ */

  function escapeHTML(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function formatNumber(num) {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return String(num);
  }

  function getScoreClass(score) {
    if (score >= 80) return 'high';
    if (score >= 60) return 'medium';
    return 'low';
  }

  function getScoreColor(score) {
    if (score >= 80) return COLORS.success;
    if (score >= 60) return COLORS.warning;
    return COLORS.danger;
  }

  // Icon shown inside the risk-status dot — no emoji, Font Awesome only.
  function getRiskIcon(score) {
    if (score < 50) return { color: COLORS.danger, cls: 'fa-solid fa-circle' };
    if (score < 60) return { color: COLORS.warning, cls: 'fa-solid fa-circle' };
    return { color: COLORS.success, cls: 'fa-solid fa-circle' };
  }

  function getTrendIcon(dir) {
    if (dir === 'up') return '<i class="fa-solid fa-arrow-up arrow" style="font-size:9px;"></i>';
    if (dir === 'down') return '<i class="fa-solid fa-arrow-down arrow" style="font-size:9px;"></i>';
    return '<i class="fa-solid fa-minus" style="font-size:9px;"></i>';
  }

  function getTrendClass(dir) {
    return dir === 'up' ? 'up' : dir === 'down' ? 'down' : 'neutral';
  }

  // Pulls the FA class string (e.g. "fa-solid fa-users") out of a
  // '<i class="...">' snippet so it can be matched against iconMap.
  function extractIconClass(iconHTML) {
    const match = iconHTML.match(/class="([^"]+)"/);
    return match ? match[1] : '';
  }

  /* ═══════════════════════════════════════════════════════════════
     RENDER FUNCTIONS
     ═══════════════════════════════════════════════════════════════ */

  /**
   * Main render function — builds the entire admin dashboard
   * @param {HTMLElement} container - The DOM element to render into
   */
  function render(container) {
    if (!container) {
      console.error('[AdminDashboard] No container provided');
      return;
    }

    const html = buildDashboardHTML();
    container.innerHTML = html;

    // Render all sub-components
    renderStats(container);
    renderCharts(container);
    renderTopPerformers(container);
    renderAtRisk(container);
    renderActivity(container);
    renderHeroStats(container);

    // Wire up event listeners
    wireEvents(container);
    wireNavLinks(container);

    // Initialize live clock
    updateClock();
    if (clockInterval) clearInterval(clockInterval);
    clockInterval = setInterval(updateClock, 30000);
  }

  /**
   * Build the main dashboard HTML structure
   */
  function buildDashboardHTML() {
    return `
            <div class="admin-dashboard">

                <!-- ═══ HERO BANNER ═══ -->
                <div class="hero-banner">
                    <div class="hero-banner-left">
                        <div class="hero-banner-badges">
                            <span class="hero-banner-badge">
                                <i class="fa-solid fa-chart-simple"></i> 78% Complete
                            </span>
                            <span class="hero-banner-badge green">
                                <i class="fa-regular fa-clock"></i> 24 Days Left
                            </span>
                        </div>
                        <h1 class="hero-banner-title">
                            Welcome back, <span class="hero-banner-highlight">Administrator</span>
                        </h1>
                        <p class="hero-banner-subtitle">
                            Here's what's happening at <strong>ECOLE LA FONTAINE</strong> today.
                        </p>
                    </div>
                    <div class="hero-banner-right" id="hero-stats">
                        <!-- Populated by renderHeroStats() -->
                    </div>
                </div>

                <!-- ═══ STATS CARDS ═══ -->
                <div class="stats-grid" id="admin-stats-grid">
                    <!-- Populated by renderStats() -->
                </div>

                <!-- ═══ CHARTS ROW ═══ -->
                <div class="charts-row">
                    <div class="dash-card">
                        <div class="dash-card-header">
                            <span class="dash-card-title"><i class="fa-solid fa-chart-column"></i> Class Performance</span>
                            <span class="dash-card-badge">This Term</span>
                        </div>
                        <div class="dash-card-body">
                            <canvas id="chart-class-performance" height="200"></canvas>
                        </div>
                    </div>
                    <div class="dash-card">
                        <div class="dash-card-header">
                            <span class="dash-card-title"><i class="fa-solid fa-bullseye"></i> Grade Distribution</span>
                            <span class="dash-card-badge">428 Students</span>
                        </div>
                        <div class="dash-card-body">
                            <canvas id="chart-grade-distribution" height="200"></canvas>
                        </div>
                    </div>
                    <div class="dash-card">
                        <div class="dash-card-header">
                            <span class="dash-card-title"><i class="fa-solid fa-square-check"></i> Attendance Overview</span>
                            <span class="dash-card-badge">Today</span>
                        </div>
                        <div class="dash-card-body">
                            <canvas id="chart-attendance" height="200"></canvas>
                        </div>
                    </div>
                </div>

                <!-- ═══ FINANCE ROW ═══ -->
                <div class="finance-row">
                    <div class="finance-hub">
                        <div class="finance-hub-header">
                            <span class="finance-hub-title"><i class="fa-solid fa-sack-dollar"></i> Financial Summary</span>
                            <span class="finance-hub-badge">This Term</span>
                        </div>
                        <div class="finance-hub-grid" id="finance-hub-grid">
                            <div class="finance-mini-card">
                                <div class="finance-mini-value">12.4<span class="suffix">M</span></div>
                                <div class="finance-mini-label">Expected</div>
                                <div class="finance-mini-trend up"><span class="arrow">↑</span> 8%</div>
                            </div>
                            <div class="finance-mini-card">
                                <div class="finance-mini-value">9.8<span class="suffix">M</span></div>
                                <div class="finance-mini-label">Collected</div>
                                <div class="finance-mini-trend up"><span class="arrow">↑</span> 12%</div>
                            </div>
                            <div class="finance-mini-card">
                                <div class="finance-mini-value">2.6<span class="suffix">M</span></div>
                                <div class="finance-mini-label">Outstanding</div>
                                <div class="finance-mini-trend down"><span class="arrow">↓</span> 5%</div>
                            </div>
                            <div class="finance-mini-card">
                                <div class="finance-mini-value">79.3<span class="suffix">%</span></div>
                                <div class="finance-mini-label">Rate</div>
                                <div class="finance-mini-trend up"><span class="arrow">↑</span> 4.1%</div>
                            </div>
                        </div>
                    </div>
                    <div class="dash-card">
                        <div class="dash-card-header">
                            <span class="dash-card-title"><i class="fa-solid fa-chart-line"></i> Fee Collection by Class</span>
                            <span class="dash-card-badge">This Term</span>
                        </div>
                        <div class="dash-card-body">
                            <canvas id="chart-fee-collection" height="200"></canvas>
                        </div>
                    </div>
                </div>

                <!-- ═══ WIDGETS ROW ═══ -->
                <div class="widgets-row">
                    <!-- Top Performers -->
                    <div class="widget-card">
                        <div class="widget-card-header">
                            <span class="widget-card-title"><i class="fa-solid fa-medal"></i> Top Performers</span>
                            <button class="widget-card-action" data-nav="statistics">View All →</button>
                        </div>
                        <div class="widget-card-body" id="top-performers-list">
                            <!-- Populated by renderTopPerformers() -->
                        </div>
                    </div>

                    <!-- At-Risk Students -->
                    <div class="widget-card">
                        <div class="widget-card-header">
                            <span class="widget-card-title"><i class="fa-solid fa-triangle-exclamation"></i> At-Risk Students</span>
                            <button class="widget-card-action" data-nav="statistics">View All →</button>
                        </div>
                        <div class="widget-card-body" id="at-risk-list">
                            <!-- Populated by renderAtRisk() -->
                        </div>
                    </div>

                    <!-- Recent Activities -->
                    <div class="widget-card">
                        <div class="widget-card-header">
                            <span class="widget-card-title"><i class="fa-solid fa-bolt"></i> Recent Activities</span>
                            <button class="widget-card-action" data-nav="system-logs">View All →</button>
                        </div>
                        <div class="widget-card-body" id="recent-activity-feed">
                            <!-- Populated by renderActivity() -->
                        </div>
                    </div>
                </div>

                <!-- ═══ FOOTER ═══ -->
                <div class="dashboard-footer">
                    ECOLE LA FONTAINE · School Management System
                    <span>·</span> v9.0
                    <span>·</span> <span id="footerTime">--</span>
                </div>

            </div>
        `;
  }

  /* ═══════════════════════════════════════════════════════════════
     STATS CARDS
     ═══════════════════════════════════════════════════════════════ */

  function renderStats(container) {
    const grid = container.querySelector('#admin-stats-grid');
    if (!grid) return;

    const iconMap = {
      'fa-solid fa-users': 'i1',
      'fa-regular fa-clipboard': 'i2',
      'fa-regular fa-pen-to-square': 'i3',
      'fa-solid fa-chart-line': 'i4',
      'fa-regular fa-calendar-check': 'i5',
      'fa-solid fa-sack-dollar': 'i6'
    };

    grid.innerHTML = MOCK_DATA.stats.map((stat, index) => {
      const iconClass = iconMap[extractIconClass(stat.icon)] || `i${index + 1}`;
      const trendClass = getTrendClass(stat.trend.dir);
      const trendIcon = getTrendIcon(stat.trend.dir);

      return `
                <div class="stat-card">
                    <div class="stat-card-top">
                        <div class="stat-card-left">
                            <div class="stat-card-icon ${iconClass}">${stat.icon}</div>
                            <span class="stat-card-title">${stat.label}</span>
                        </div>
                        <span class="stat-card-trend ${trendClass}">
                            ${trendIcon} ${stat.trend.text.split('·')[0].trim()}
                        </span>
                    </div>
                    <div class="stat-card-value">${stat.value}</div>
                    <div class="stat-card-sub">${stat.trend.text}</div>
                </div>
            `;
    }).join('');
  }

  /* ═══════════════════════════════════════════════════════════════
     CHARTS — Using Chart.js
     ═══════════════════════════════════════════════════════════════ */

  let chartInstances = {};
  let clockInterval = null;

  function renderCharts(container) {
    // ─── 1. Class Performance (Bar Chart) ──────────────────────
    const classCtx = document.getElementById('chart-class-performance');
    if (classCtx) {
      if (chartInstances.classPerformance) chartInstances.classPerformance.destroy();
      chartInstances.classPerformance = new Chart(classCtx, {
        type: 'bar',
        data: {
          labels: MOCK_DATA.classPerformance.labels,
          datasets: [{
            label: 'Average Score (%)',
            data: MOCK_DATA.classPerformance.values,
            backgroundColor: MOCK_DATA.classPerformance.colors,
            borderRadius: 4,
            barPercentage: 0.7
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: true,
          plugins: { legend: { display: false } },
          scales: {
            y: { beginAtZero: true, max: 100, grid: { color: 'rgba(26,20,16,0.05)' } },
            x: { grid: { display: false } }
          }
        }
      });
    }

    // ─── 2. Grade Distribution (Doughnut Chart) ────────────────
    const gradeCtx = document.getElementById('chart-grade-distribution');
    if (gradeCtx) {
      if (chartInstances.gradeDistribution) chartInstances.gradeDistribution.destroy();
      chartInstances.gradeDistribution = new Chart(gradeCtx, {
        type: 'doughnut',
        data: {
          labels: MOCK_DATA.gradeDistribution.labels,
          datasets: [{
            data: MOCK_DATA.gradeDistribution.values,
            backgroundColor: MOCK_DATA.gradeDistribution.colors,
            borderColor: COLORS.bgCard,
            borderWidth: 2
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: true,
          cutout: '65%',
          plugins: {
            legend: {
              position: 'bottom',
              labels: { boxWidth: 10, padding: 6, font: { size: 10 } }
            }
          }
        }
      });
    }

    // ─── 3. Attendance Overview (Doughnut Chart) ──────────────
    const attendCtx = document.getElementById('chart-attendance');
    if (attendCtx) {
      if (chartInstances.attendance) chartInstances.attendance.destroy();

      chartInstances.attendance = new Chart(attendCtx, {
        type: 'doughnut',
        data: {
          labels: MOCK_DATA.attendanceOverview.labels,
          datasets: [{
            data: MOCK_DATA.attendanceOverview.values,
            backgroundColor: MOCK_DATA.attendanceOverview.colors,
            borderColor: COLORS.bgCard,
            borderWidth: 2
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: true,
          cutout: '65%',
          plugins: {
            legend: {
              position: 'bottom',
              labels: { boxWidth: 10, padding: 6, font: { size: 10 } }
            }
          }
        }
      });
    }

    // ─── 4. Fee Collection by Class (Bar Chart) ────────────────
    const feeCtx = document.getElementById('chart-fee-collection');
    if (feeCtx) {
      if (chartInstances.feeCollection) chartInstances.feeCollection.destroy();
      chartInstances.feeCollection = new Chart(feeCtx, {
        type: 'bar',
        data: {
          labels: MOCK_DATA.finance.byClass.labels,
          datasets: [{
            label: 'Collection Rate (%)',
            data: MOCK_DATA.finance.byClass.values,
            backgroundColor: MOCK_DATA.finance.byClass.colors,
            borderRadius: 4,
            barPercentage: 0.7
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: true,
          plugins: { legend: { display: false } },
          scales: {
            y: { beginAtZero: true, max: 100, grid: { color: 'rgba(26,20,16,0.05)' }, ticks: { callback: v => v + '%' } },
            x: { grid: { display: false } }
          }
        }
      });
    }
  }

  /* ═══════════════════════════════════════════════════════════════
     TOP PERFORMERS — Font Awesome medals, no emoji.
     ═══════════════════════════════════════════════════════════════ */

  function renderTopPerformers(container) {
    const list = container.querySelector('#top-performers-list');
    if (!list) return;

    const medalClasses = ['gold', 'silver', 'bronze', '', ''];

    list.innerHTML = MOCK_DATA.topPerformers.map((p, i) => {
      const medalCls = medalClasses[i] || '';
      const rankMarkup = medalCls
        ? `<i class="fa-solid fa-medal"></i>`
        : String(i + 1);

      return `
                <div class="performer-item">
                    <span class="performer-rank ${medalCls}">${rankMarkup}</span>
                    <div class="performer-info">
                        <div class="performer-name">${escapeHTML(p.name)}</div>
                        <div class="performer-class">${escapeHTML(p.class)}</div>
                    </div>
                    <span class="performer-score">${p.score}%</span>
                </div>
            `;
    }).join('');
  }

  /* ═══════════════════════════════════════════════════════════════
     AT-RISK STUDENTS — Font Awesome status dot, no emoji.
     ═══════════════════════════════════════════════════════════════ */

  function renderAtRisk(container) {
    const list = container.querySelector('#at-risk-list');
    if (!list) return;

    list.innerHTML = MOCK_DATA.atRisk.map(s => {
      const scoreColor = getScoreColor(s.score);
      const { color: statusColor, cls: statusCls } = getRiskIcon(s.score);
      return `
                <div class="risk-item">
                    <span class="risk-status" style="color:${statusColor};"><i class="${statusCls}"></i></span>
                    <div class="risk-info">
                        <div class="risk-name">${escapeHTML(s.name)}</div>
                        <div class="risk-class">${escapeHTML(s.class)}</div>
                    </div>
                    <span class="risk-score" style="color:${scoreColor};">${s.score}%</span>
                    <button class="risk-action" data-contact="${escapeHTML(s.name)}">Contact</button>
                </div>
            `;
    }).join('');

    // Wire contact buttons
    list.querySelectorAll('[data-contact]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const name = btn.dataset.contact;
        showToast(`Contacting parent of ${name}`, 'info');
      });
    });
  }

  /* ═══════════════════════════════════════════════════════════════
     RECENT ACTIVITY
     ═══════════════════════════════════════════════════════════════ */

  function renderActivity(container) {
    const feed = container.querySelector('#recent-activity-feed');
    if (!feed) return;

    const avatarColors = ['a1', 'a2', 'a3', 'a4', 'a5', 'a6'];

    feed.innerHTML = MOCK_DATA.recentActivity.map((a, i) => {
      const avatarClass = avatarColors[i % avatarColors.length];
      // Extract first letter for avatar
      const firstLetter = a.text.replace(/<[^>]*>/g, '').trim().charAt(0).toUpperCase() || 'A';

      return `
                <div class="activity-item">
                    <div class="activity-avatar ${avatarClass}">${firstLetter}</div>
                    <div class="activity-body">
                        <div class="activity-text">${a.text}</div>
                        <div class="activity-time">${escapeHTML(a.time)}</div>
                    </div>
                </div>
            `;
    }).join('');
  }

  /* ═══════════════════════════════════════════════════════════════
     HERO STATS
     ═══════════════════════════════════════════════════════════════ */

  function renderHeroStats(container) {
    const heroRight = container.querySelector('#hero-stats');
    if (!heroRight) return;

    const stats = MOCK_DATA.heroStats;

    heroRight.innerHTML = `
            <div class="hero-stat-block">
                <div class="hero-stat-num">${stats.students}</div>
                <div class="hero-stat-label">Students</div>
                <div class="hero-stat-trend up"><span class="arrow">↑</span> 12%</div>
            </div>
            <div class="hero-stat-block">
                <div class="hero-stat-num">${stats.passRate}<span class="suffix">%</span></div>
                <div class="hero-stat-label">Pass Rate</div>
                <div class="hero-stat-trend up"><span class="arrow">↑</span> 1.5%</div>
            </div>
            <div class="hero-stat-block">
                <div class="hero-stat-num">${stats.collectionRate}<span class="suffix">%</span></div>
                <div class="hero-stat-label">Collection</div>
                <div class="hero-stat-trend up"><span class="arrow">↑</span> 4.1%</div>
            </div>
        `;
  }

  /* ═══════════════════════════════════════════════════════════════
     LIVE CLOCK
     ═══════════════════════════════════════════════════════════════ */

  function updateClock() {
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10) + ' ' +
      now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    const el = document.getElementById('footerTime');
    if (el) el.textContent = dateStr;
  }

  /* ═══════════════════════════════════════════════════════════════
     EVENT WIRING
     ═══════════════════════════════════════════════════════════════ */

  function wireEvents(container) {
    // Theme toggle — already handled globally, but ensure it works
    const themeBtn = container.querySelector('#themeBtn');
    if (themeBtn) {
      themeBtn.addEventListener('click', () => {
        if (typeof toggleTheme === 'function') toggleTheme();
        else if (window.toggleTheme) window.toggleTheme();
      });
    }

    // Search button
    const searchBtn = container.querySelector('.topbar-btn .fa-magnifying-glass')?.closest('.topbar-btn');
    if (searchBtn) {
      searchBtn.addEventListener('click', () => {
        if (typeof openSearch === 'function') openSearch();
        else if (window.openSearch) window.openSearch();
      });
    }

    // Avatar button
    const avatarBtn = container.querySelector('.avatar-btn');
    if (avatarBtn) {
      avatarBtn.addEventListener('click', () => {
        showToast('Profile', 'info', 'Loading your profile...');
      });
    }

    // Filter button in search
    const filterBtn = container.querySelector('.filter-btn');
    if (filterBtn) {
      filterBtn.addEventListener('click', () => {
        if (typeof openFilter === 'function') openFilter();
        else if (window.openFilter) window.openFilter();
      });
    }
  }

  function wireNavLinks(container) {
    container.querySelectorAll('[data-nav]').forEach(el => {
      el.style.cursor = 'pointer';
      el.addEventListener('click', () => {
        const target = el.dataset.nav;
        if (typeof navigateTo === 'function') navigateTo(target);
        else if (window.navigateTo) window.navigateTo(target);
        else showToast('Navigation', 'info', `Navigating to ${target}...`);
      });
    });

    // Also wire any .widget-card-action buttons
    container.querySelectorAll('.widget-card-action').forEach(el => {
      if (!el.dataset.nav) return;
      el.style.cursor = 'pointer';
      el.addEventListener('click', () => {
        const target = el.dataset.nav;
        if (typeof navigateTo === 'function') navigateTo(target);
        else if (window.navigateTo) window.navigateTo(target);
        else showToast('Navigation', 'info', `Navigating to ${target}...`);
      });
    });
  }

  /* ═══════════════════════════════════════════════════════════════
     TOAST HELPER (fallback) — Font Awesome icons, no emoji.
     ═══════════════════════════════════════════════════════════════ */

  function showToast(message, type = 'info', details = '') {
    if (typeof window.showToast === 'function') {
      window.showToast(message, type);
      return;
    }
    // Fallback
    console.log(`[${type.toUpperCase()}] ${message} ${details}`);
    const container = document.getElementById('toastContainer');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    const icons = {
      success: '<i class="fa-solid fa-circle-check"></i>',
      error: '<i class="fa-solid fa-circle-xmark"></i>',
      warning: '<i class="fa-solid fa-triangle-exclamation"></i>',
      info: '<i class="fa-solid fa-circle-info"></i>'
    };
    toast.innerHTML = `
            <span class="icon">${icons[type] || icons.info}</span>
            <span class="msg"><strong>${type.charAt(0).toUpperCase() + type.slice(1)}</strong> · ${message}</span>
            <button class="close" onclick="this.closest('.toast').remove()"><i class="fa-solid fa-xmark"></i></button>
        `;
    container.appendChild(toast);
    setTimeout(() => {
      toast.classList.add('hiding');
      setTimeout(() => toast.remove(), 300);
    }, 3500);
  }

  /* ═══════════════════════════════════════════════════════════════
     DESTROY — Clean up chart instances and the clock interval.
     Call this from router.js before rendering the next module so
     Chart.js canvases and the setInterval don't leak between
     navigations.
     ═══════════════════════════════════════════════════════════════ */

  function destroy() {
    Object.values(chartInstances).forEach(chart => {
      if (chart && typeof chart.destroy === 'function') chart.destroy();
    });
    chartInstances = {};

    if (clockInterval) {
      clearInterval(clockInterval);
      clockInterval = null;
    }
  }

  /* ═══════════════════════════════════════════════════════════════
     PUBLIC API
     ═══════════════════════════════════════════════════════════════ */

  return {
    render,
    destroy
  };

})();

/* ═══════════════════════════════════════════════════════════════════
   GLOBAL EXPOSURE
   ═══════════════════════════════════════════════════════════════════
   router.js currently loads dashboard modules as plain scripts and
   calls them off the window object (see AdminDashboard.render(container)
   / AdminDashboard.destroy()), matching the pattern already used by
   the shorter admin-dashboard.js version already committed. The
   `export default` below is added too so this file keeps working if
   router.js is later switched to `import('...').then(m => m.default)`
   the way js/core dynamic-import routing does in the old v2-main
   router.js — this way you don't have to touch this file again when
   that decision gets made.
   ═══════════════════════════════════════════════════════════════════ */

window.AdminDashboard = AdminDashboard;

// NOTE: window.AdminDashboard was already exposed, but the router looks up
// window.renderAdminDashboard specifically (see core/router.js's moduleIdToRenderFn) —
// that exact name was never assigned, so this page was unreachable via
// navigation despite being fully built.
window.renderAdminDashboard = AdminDashboard.render;
