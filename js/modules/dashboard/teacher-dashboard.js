/* ═══════════════════════════════════════════════════════════════════
   js/modules/dashboard/teacher-dashboard.js
   ═══════════════════════════════════════════════════════════════════
   Teacher Dashboard — Complete implementation matching the
   HTML design. Rendered into #app-main by core/router.js.

   Features:
   - 6 stat cards with icons and trends
   - Marks completion rate with animated bar
   - Grade distribution (donut chart)
   - Subject completion (horizontal bar chart)
   - Assessment completion bars per class
   - Marks entry reminders with overdue indicators
   - Notifications with lock status
   - Today's classes with action buttons
   - Quick actions grid

   Last updated: 2026-07-14
   ═══════════════════════════════════════════════════════════════════ */

// ─── MOCK DATA ──────────────────────────────────────────────────────

const MOCK_DATA = {
  stats: [
    {
      id: 'students',
      icon: 'fa-users',
      color: '#3b82f6',
      value: '115',
      label: 'My Students',
      trend: { dir: 'up', text: '3 classes · +5 new this term' },
      subText: '<strong>3</strong> classes',
      arrowCount: '<span class="num">+5</span> new this term <span class="up">↑</span>'
    },
    {
      id: 'assessments',
      icon: 'fa-clipboard',
      color: '#8b5cf6',
      value: '14',
      label: 'Assessments',
      trend: { dir: 'up', text: '+3 this term' },
      subText: '<strong>8</strong> active',
      arrowCount: '<span class="num">6</span> completed <span class="up">↑</span>'
    },
    {
      id: 'marks',
      icon: 'fa-pen-to-square',
      color: '#f59e0b',
      value: '380',
      label: 'Marks Entered',
      trend: { dir: 'up', text: '+15% vs last term' },
      subText: '<strong>413</strong> total slots',
      arrowCount: '<span class="num">33</span> remaining <span class="down">↓</span>'
    },
    {
      id: 'class-avg',
      icon: 'fa-chart-line',
      color: '#10b981',
      value: '78<span class="suffix">%</span>',
      label: 'Class Avg',
      trend: { dir: 'up', text: '+2.1% improvement' },
      subText: '<strong>B+</strong> grade',
      arrowCount: '<span class="num">+3%</span> from last term <span class="up">↑</span>'
    },
    {
      id: 'pending-tasks',
      icon: 'fa-clock',
      color: '#ef4444',
      value: '6',
      label: 'Pending Tasks',
      trend: { dir: 'down', text: '-2 from last week' },
      subText: '<strong>3</strong> overdue',
      arrowCount: '<span class="num">-2</span> from last week <span class="down">↓</span>'
    },
    {
      id: 'attendance',
      icon: 'fa-calendar-check',
      color: '#06b6d4',
      value: '30',
      label: 'Attendance',
      trend: { dir: 'up', text: '🟢 COMPLETED' },
      subText: '<strong>4</strong> absent today',
      arrowCount: '<span class="num">-3</span> vs yesterday <span class="down">↓</span>',
      extra: `
                <div style="margin-top:8px;display:flex;gap:6px;font-size:10px;color:var(--text-soft, #6b5f56);flex-wrap:wrap;">
                    <span style="display:flex;align-items:center;gap:3px;">
                        <span style="width:8px;height:8px;border-radius:50%;background:var(--emerald, #10b981);display:inline-block;"></span>
                        Present: 26
                    </span>
                    <span style="display:flex;align-items:center;gap:3px;">
                        <span style="width:8px;height:8px;border-radius:50%;background:var(--danger, #ef4444);display:inline-block;"></span>
                        Absent: 4
                    </span>
                    <span style="display:flex;align-items:center;gap:3px;margin-left:auto;">
                        <span style="width:8px;height:8px;border-radius:50%;background:var(--gold, #fbbf24);display:inline-block;"></span>
                        Rate: 89.7%
                    </span>
                </div>
            `
    }
  ],

  marksCompletion: {
    filled: 380,
    total: 413,
    pct: 92,
    onTrack: true
  },

  gradeDistribution: [
    { label: 'A+', value: 27, color: '#10b981' },
    { label: 'A', value: 25, color: '#34d399' },
    { label: 'B', value: 17, color: '#fbbf24' },
    { label: 'C', value: 12, color: '#f59e0b' },
    { label: 'D', value: 8, color: '#f472b6' },
    { label: 'F', value: 6, color: '#ef4444' }
  ],

  subjectCompletion: {
    labels: ['Mathematics', 'Science', 'English', 'Kinyarwanda', 'French', 'Social St.'],
    values: [95, 92, 88, 78, 60, 52],
    colors: ['#10b981', '#34d399', '#fbbf24', '#f59e0b', '#f472b6', '#ef4444']
  },

  assessmentCompletion: [
    {
      classId: 'Primary 4A (28 students)',
      items: [
        { name: 'Quiz 1', filled: 28, total: 28 },
        { name: 'Quiz 2', filled: 22, total: 28 },
        { name: 'Quiz 3', filled: 28, total: 28 },
        { name: 'Mid-Term', filled: 15, total: 28 },
        { name: 'Assignment', filled: 28, total: 28 },
        { name: 'Exam 1', filled: 28, total: 28 },
        { name: 'Exam 2', filled: 0, total: 28 }
      ]
    },
    {
      classId: 'Primary 5B (31 students)',
      items: [
        { name: 'Quiz 1', filled: 31, total: 31 },
        { name: 'Quiz 2', filled: 31, total: 31 },
        { name: 'Quiz 3', filled: 22, total: 31 },
        { name: 'Mid-Term', filled: 31, total: 31 },
        { name: 'Assignment', filled: 16, total: 31 },
        { name: 'Exam 1', filled: 0, total: 31 },
        { name: 'Exam 2', filled: 0, total: 31 }
      ]
    }
  ],

  reminders: [
    {
      id: 1,
      title: 'Exam 1',
      classId: 'Primary 4A',
      dueDate: '2026-06-20',
      filled: 0,
      total: 28,
      status: 'critical',
      daysOverdue: 6
    },
    {
      id: 2,
      title: 'Exam 1',
      classId: 'Primary 5B',
      dueDate: '2026-06-20',
      filled: 0,
      total: 31,
      status: 'critical',
      daysOverdue: 6
    },
    {
      id: 3,
      title: 'Assignment',
      classId: 'Primary 5B',
      dueDate: '2026-06-26',
      filled: 16,
      total: 31,
      status: 'warning',
      daysOverdue: 0
    },
    {
      id: 4,
      title: 'Quiz 3',
      classId: 'Primary 4A',
      dueDate: '2026-06-27',
      filled: 22,
      total: 28,
      status: 'info',
      daysLeft: 1
    },
    {
      id: 5,
      title: 'Quiz 3',
      classId: 'Primary 5B',
      dueDate: '2026-06-27',
      filled: 22,
      total: 31,
      status: 'info',
      daysLeft: 1
    }
  ],

  notifications: [
    {
      id: 1,
      type: 'locked',
      title: 'Assessment Locked',
      message: 'Exam 1 — Primary 4A locked by Admin · No changes allowed',
      action: 'View'
    },
    {
      id: 2,
      type: 'locked',
      title: 'Assessment Locked',
      message: 'Exam 1 — Primary 5B locked by Admin · No changes allowed',
      action: 'View'
    },
    {
      id: 3,
      type: 'info',
      title: 'All locked assessments',
      message: 'Marked as complete in your stats · 2 assessments locked',
      action: 'Report'
    }
  ],

  todaysClasses: [
    {
      time: '08:20',
      classId: 'Primary 4A',
      subject: 'Mathematics',
      students: 28,
      pendingMarks: 0,
      filled: 28,
      total: 28,
      status: 'complete'
    },
    {
      time: '09:40',
      classId: 'Primary 5B',
      subject: 'English',
      students: 31,
      pendingMarks: 8,
      filled: 23,
      total: 31,
      status: 'pending'
    },
    {
      time: '11:20',
      classId: 'Primary 4A',
      subject: 'Mathematics',
      students: 28,
      pendingMarks: 0,
      filled: 28,
      total: 28,
      status: 'complete'
    },
    {
      time: '13:00',
      classId: 'Primary 4A',
      subject: 'Mathematics',
      students: 28,
      pendingMarks: 15,
      filled: 13,
      total: 28,
      status: 'pending'
    }
  ],

  quickActions: [
    { id: 'marks-entry', label: 'Marks Entry', icon: 'fa-pen-to-square', color: '#8b5cf6' },
    { id: 'class-register', label: 'Register', icon: 'fa-table', color: '#f59e0b' },
    { id: 'report-cards', label: 'Report Cards', icon: 'fa-file-lines', color: '#10b981' },
    { id: 'statistics', label: 'Statistics', icon: 'fa-chart-pie', color: '#3b82f6' },
    { id: 'assessments', label: 'Assessments', icon: 'fa-clipboard-list', color: '#06b6d4' },
    { id: 'student-list', label: 'Students', icon: 'fa-users', color: '#f472b6' }
  ]
};

// ─── HELPERS ─────────────────────────────────────────────────────────

function esc(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getStatusColor(status) {
  const map = {
    critical: '#ef4444',
    warning: '#f59e0b',
    info: '#06b6d4',
    complete: '#10b981'
  };
  return map[status] || '#6b5f56';
}

function getStatusIcon(status) {
  const map = {
    critical: 'fa-circle',
    warning: 'fa-circle',
    info: 'fa-circle',
    complete: 'fa-circle-check'
  };
  return map[status] || 'fa-circle';
}

function getStatusLabel(status) {
  const map = {
    critical: 'Overdue',
    warning: 'Due today',
    info: 'Upcoming',
    complete: 'Complete'
  };
  return map[status] || '—';
}

function getBarColor(pct) {
  if (pct === 100) return 'green';
  if (pct === 0) return 'red';
  if (pct < 60) return 'red';
  if (pct < 80) return 'amber';
  return 'green';
}

function getStatusIconClass(pct) {
  if (pct === 100) return 'complete';
  if (pct === 0) return 'none';
  if (pct < 60) return 'partial';
  return 'partial';
}

function getStatusIconHtml(pct) {
  if (pct === 100) return '<i class="fa-regular fa-circle-check"></i>';
  if (pct === 0) return '<i class="fa-solid fa-circle-xmark"></i>';
  return '<i class="fa-solid fa-triangle-exclamation"></i>';
}

// ─── RENDER FUNCTIONS ───────────────────────────────────────────────

/**
 * Main render function — builds the entire teacher dashboard
 * @param {HTMLElement} container - The DOM element to render into
 */
function renderTeacherDashboard(container) {
  if (!container) return;

  const today = new Date();
  const dateStr = today.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });

  container.innerHTML = `
        <div class="dashboard-page">

            <!-- Stats Grid (6 cards) -->
            <div class="stats-grid" id="teach-stats-grid"></div>

            <!-- Marks Completion Rate -->
            <div class="completion-card">
                <div class="comp-head">
                    <span class="title">
                        <i class="fa-solid fa-chart-simple" style="color:var(--role-primary, #4a2d5a);margin-right:8px;"></i>
                        Marks Completion Rate
                    </span>
                    <span class="badge">This Term</span>
                </div>
                <div class="comp-body">
                    <div class="comp-stats">
                        <span><strong>${MOCK_DATA.marksCompletion.filled}</strong> / ${MOCK_DATA.marksCompletion.total} slots filled</span>
                        <span><strong>${MOCK_DATA.marksCompletion.pct}%</strong> complete</span>
                    </div>
                    <div class="comp-bar">
                        <div class="fill" style="width:0%;" data-target="${MOCK_DATA.marksCompletion.pct}">
                            <div class="glow"></div>
                        </div>
                    </div>
                    <div class="comp-footer">
                        <span><i class="fa-regular fa-circle-check" style="color:var(--success, #10b981);"></i> ${MOCK_DATA.marksCompletion.filled} marks entered</span>
                        <span><i class="fa-regular fa-clock" style="color:var(--warning, #f59e0b);"></i> ${MOCK_DATA.marksCompletion.total - MOCK_DATA.marksCompletion.filled} marks remaining</span>
                        <span class="status"><span class="dot ${MOCK_DATA.marksCompletion.onTrack ? 'green' : 'amber'}"></span> ${MOCK_DATA.marksCompletion.onTrack ? 'On track' : 'Needs attention'}</span>
                    </div>
                </div>
            </div>

            <!-- Charts Row -->
            <div class="charts-row">
                <!-- Grade Distribution (Donut) -->
                <div class="chart-card">
                    <div class="chart-head">
                        <span class="title">
                            <i class="fa-solid fa-chart-pie" style="color:var(--role-primary, #4a2d5a);margin-right:6px;"></i>
                            Grade Distribution
                        </span>
                        <span class="badge">${MOCK_DATA.gradeDistribution.reduce((sum, g) => sum + g.value, 0)} Students</span>
                    </div>
                    <div class="chart-container">
                        <canvas id="grade-distribution-chart"></canvas>
                    </div>
                </div>

                <!-- Subject Completion (Horizontal Bar) -->
                <div class="chart-card">
                    <div class="chart-head">
                        <span class="title">
                            <i class="fa-solid fa-chart-bar" style="color:var(--role-secondary, #8a5a9a);margin-right:6px;"></i>
                            Subject Completion
                        </span>
                        <span class="badge">This Term</span>
                    </div>
                    <div class="chart-container tall">
                        <canvas id="subject-completion-chart"></canvas>
                    </div>
                </div>
            </div>

            <!-- Assessment Completion Bars -->
            <div class="assessment-section">
                <div class="assessment-card">
                    <div class="assess-head">
                        <span class="title">
                            <i class="fa-solid fa-list-check" style="color:var(--info, #4a7a8a);margin-right:6px;"></i>
                            Completion by Assessment
                        </span>
                        <span class="badge">${MOCK_DATA.assessmentCompletion.reduce((sum, g) => sum + g.items.length, 0)} assessments</span>
                    </div>
                    <div id="assessment-completion-body"></div>
                    <div class="assess-legend">
                        <span><i class="fa-solid fa-circle-check" style="color:var(--success, #10b981);"></i> Complete</span>
                        <span><i class="fa-solid fa-triangle-exclamation" style="color:var(--warning, #f59e0b);"></i> Partial</span>
                        <span><i class="fa-solid fa-circle-xmark" style="color:var(--danger, #ef4444);"></i> Not Started</span>
                        <span style="margin-left:auto;">🎯 Target: 90% completion</span>
                    </div>
                </div>
            </div>

            <!-- Reminders + Notifications Row -->
            <div class="reminders-row">
                <!-- Marks Entry Reminders -->
                <div class="reminder-card">
                    <div class="remind-head">
                        <span class="title">
                            <i class="fa-regular fa-clock" style="color:var(--warning, #f59e0b);margin-right:6px;"></i>
                            Marks Entry Reminders
                        </span>
                        <span class="badge">${MOCK_DATA.reminders.length} pending</span>
                    </div>
                    <div id="reminders-list"></div>
                    <div class="remind-footer">
                        📊 Total pending: ${MOCK_DATA.reminders.length} assessments · ${MOCK_DATA.reminders.reduce((sum, r) => sum + (r.total - r.filled), 0)} marks remaining
                    </div>
                </div>

                <!-- Notifications -->
                <div class="reminder-card">
                    <div class="remind-head">
                        <span class="title">
                            <i class="fa-regular fa-bell" style="color:var(--role-primary, #4a2d5a);margin-right:6px;"></i>
                            Notifications
                        </span>
                        <span class="badge">${MOCK_DATA.notifications.filter(n => n.type === 'locked').length} unread</span>
                    </div>
                    <div id="notifications-list"></div>
                    <div class="remind-footer">
                        🔒 Locked assessments: 100% complete in completion rate
                    </div>
                </div>
            </div>

            <!-- Today's Classes -->
            <div class="today-card">
                <div class="today-head">
                    <span class="title">
                        <i class="fa-regular fa-calendar" style="color:var(--success, #10b981);margin-right:6px;"></i>
                        Today's Classes
                    </span>
                    <span class="badge">${dateStr}</span>
                </div>
                <div id="todays-classes-list"></div>
                <div class="today-footer">
                    📊 Today: ${MOCK_DATA.todaysClasses.length} classes · ${MOCK_DATA.todaysClasses.reduce((sum, c) => sum + c.students, 0)} students · ${MOCK_DATA.todaysClasses.reduce((sum, c) => sum + c.pendingMarks, 0)} marks pending
                </div>
            </div>

            <!-- Quick Actions -->
            <div class="quick-actions" id="teach-quick-actions"></div>

            <!-- Footer -->
            <div class="dashboard-footer">
                ECOLE LA FONTAINE · School Management System
                <span>·</span> v9.0
                <span>·</span> <span id="footerTime"></span>
            </div>
        </div>
    `;

  // ─── Render sub-components ──────────────────────────────────────

  renderStats(container);
  renderCharts();
  renderAssessmentCompletion(container);
  renderReminders(container);
  renderNotifications(container);
  renderTodaysClasses(container);
  renderQuickActions(container);

  // ─── Animate bars ──────────────────────────────────────────────

  setTimeout(() => {
    animateBars();
  }, 400);

  // ─── Live clock ──────────────────────────────────────────────────

  updateClock();
  setInterval(updateClock, 30000);

  // ─── Toast welcome ──────────────────────────────────────────────

  setTimeout(() => {
    if (window.showToast) {
      window.showToast('👩‍🏫 Welcome back! Your academic overview is ready.', 'success');
    }
  }, 1000);
}

// ─── STATS ──────────────────────────────────────────────────────────

function renderStats(container) {
  const grid = container.querySelector('#teach-stats-grid');
  if (!grid) return;

  const accentClasses = ['accent-1', 'accent-2', 'accent-3', 'accent-4', 'accent-5', 'accent-6'];

  grid.innerHTML = MOCK_DATA.stats.map((stat, index) => `
        <div class="stat-card ${accentClasses[index % accentClasses.length]}">
            <div class="top-row">
                <div class="left">
                    <div class="icon i${index + 1}"><i class="fa-solid ${stat.icon}"></i></div>
                    <span class="title">${esc(stat.label)}</span>
                </div>
                <span class="trend ${stat.trend.dir}">
                    <span class="arrow">${stat.trend.dir === 'up' ? '↑' : '↓'}</span> ${stat.trend.text}
                </span>
            </div>
            <div class="main-value">${stat.value}</div>
            <div class="sub-text">${stat.subText}</div>
            <div class="arrow-count">→ ${stat.arrowCount}</div>
            ${stat.extra || ''}
        </div>
    `).join('');
}

// ─── CHARTS ──────────────────────────────────────────────────────────

function renderCharts() {
  // Grade Distribution (Donut)
  const gradeCtx = document.getElementById('grade-distribution-chart')?.getContext('2d');
  if (gradeCtx) {
    if (window._gradeChart) window._gradeChart.destroy();
    window._gradeChart = new Chart(gradeCtx, {
      type: 'doughnut',
      data: {
        labels: MOCK_DATA.gradeDistribution.map(g => g.label),
        datasets: [{
          data: MOCK_DATA.gradeDistribution.map(g => g.value),
          backgroundColor: MOCK_DATA.gradeDistribution.map(g => g.color),
          borderColor: 'var(--bg-card, #fcfaf8)',
          borderWidth: 2,
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '65%',
        plugins: {
          legend: {
            position: 'bottom',
            labels: {
              boxWidth: 10,
              padding: 6,
              color: 'var(--text-soft, #6b5f56)'
            }
          },
          tooltip: {
            callbacks: {
              label: function (ctx) {
                const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
                const pct = ((ctx.raw / total) * 100).toFixed(1);
                return `${ctx.label}: ${ctx.raw} (${pct}%)`;
              }
            }
          }
        }
      }
    });
  }

  // Subject Completion (Horizontal Bar)
  const subjectCtx = document.getElementById('subject-completion-chart')?.getContext('2d');
  if (subjectCtx) {
    if (window._subjectChart) window._subjectChart.destroy();
    window._subjectChart = new Chart(subjectCtx, {
      type: 'bar',
      data: {
        labels: MOCK_DATA.subjectCompletion.labels,
        datasets: [{
          label: 'Completion Rate (%)',
          data: MOCK_DATA.subjectCompletion.values,
          backgroundColor: MOCK_DATA.subjectCompletion.colors,
          borderRadius: 4,
        }]
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: function (ctx) {
                return ctx.parsed.x + '% completed';
              }
            }
          }
        },
        scales: {
          x: {
            beginAtZero: true,
            max: 100,
            grid: {
              color: 'rgba(107, 95, 86, 0.06)'
            },
            ticks: {
              callback: function (v) { return v + '%'; },
              color: 'var(--text-soft, #6b5f56)'
            }
          },
          y: {
            grid: { display: false },
            ticks: {
              color: 'var(--text-soft, #6b5f56)'
            }
          }
        }
      }
    });
  }
}

// ─── ASSESSMENT COMPLETION ──────────────────────────────────────────

function renderAssessmentCompletion(container) {
  const body = container.querySelector('#assessment-completion-body');
  if (!body) return;

  body.innerHTML = MOCK_DATA.assessmentCompletion.map(group => `
        <div class="assess-group">
            <div class="group-label">${esc(group.classId)}</div>
            ${group.items.map(item => {
    const pct = Math.round((item.filled / item.total) * 100);
    const barClass = getBarColor(pct);
    const iconClass = getStatusIconClass(pct);
    const iconHtml = getStatusIconHtml(pct);
    return `
                    <div class="assess-item">
                        <span class="name">${esc(item.name)}</span>
                        <div class="bar-track">
                            <div class="fill ${barClass}" style="width:0%;" data-target="${pct}"></div>
                        </div>
                        <span class="info">${item.filled}/${item.total}</span>
                        <span class="status-icon ${iconClass}">${iconHtml}</span>
                    </div>
                `;
  }).join('')}
        </div>
    `).join('');
}

// ─── REMINDERS ──────────────────────────────────────────────────────

function renderReminders(container) {
  const list = container.querySelector('#reminders-list');
  if (!list) return;

  list.innerHTML = MOCK_DATA.reminders.map(reminder => {
    const color = getStatusColor(reminder.status);
    const icon = getStatusIcon(reminder.status);
    const label = getStatusLabel(reminder.status);
    const pct = Math.round((reminder.filled / reminder.total) * 100);
    const isOverdue = reminder.status === 'critical';
    const isDueToday = reminder.status === 'warning';
    const isUpcoming = reminder.status === 'info';

    let timeDisplay = '';
    if (isOverdue) {
      timeDisplay = `<span style="color:var(--danger, #ef4444);">-${reminder.daysOverdue}d overdue</span>`;
    } else if (isDueToday) {
      timeDisplay = `<span style="color:var(--warning, #f59e0b);">Due today</span>`;
    } else if (isUpcoming) {
      timeDisplay = `<span style="color:var(--info, #06b6d4);">${reminder.daysLeft}d left</span>`;
    }

    return `
            <div class="remind-item">
                <span class="icon ${reminder.status}"><i class="fa-solid ${icon}"></i></span>
                <div class="body">
                    <div class="text"><strong>${esc(reminder.title)}</strong> — ${esc(reminder.classId)}</div>
                    <div class="sub">Due: ${esc(reminder.dueDate)} · ${reminder.filled}/${reminder.total} entered · ${timeDisplay}</div>
                </div>
                <button class="action ${reminder.filled < reminder.total ? 'enter' : ''}" onclick="window.navigateTo('marks-entry')">
                    ${reminder.filled < reminder.total ? 'Enter' : 'View'}
                </button>
            </div>
        `;
  }).join('');
}

// ─── NOTIFICATIONS ──────────────────────────────────────────────────

function renderNotifications(container) {
  const list = container.querySelector('#notifications-list');
  if (!list) return;

  list.innerHTML = MOCK_DATA.notifications.map(notif => {
    const color = notif.type === 'locked' ? '#ef4444' : '#06b6d4';
    const icon = notif.type === 'locked' ? 'fa-lock' : 'fa-circle-check';
    const actionClass = notif.type === 'locked' ? '' : '';

    return `
            <div class="remind-item">
                <span class="icon ${notif.type}"><i class="fa-solid ${icon}"></i></span>
                <div class="body">
                    <div class="text"><strong>${esc(notif.title)}</strong></div>
                    <div class="sub">${esc(notif.message)}</div>
                </div>
                <button class="action" onclick="window.showToast('📊 ${esc(notif.action)}', 'info')">${esc(notif.action)}</button>
            </div>
        `;
  }).join('');
}

// ─── TODAY'S CLASSES ────────────────────────────────────────────────

function renderTodaysClasses(container) {
  const list = container.querySelector('#todays-classes-list');
  if (!list) return;

  list.innerHTML = MOCK_DATA.todaysClasses.map(cls => {
    const isComplete = cls.status === 'complete';
    const hasPending = cls.pendingMarks > 0;
    const statusIcon = isComplete ? '✅' : '⚠️';
    const statusClass = isComplete ? 'complete' : 'pending';
    const studentsDisplay = `${cls.filled}/${cls.total}`;

    return `
            <div class="today-item">
                <span class="time">${esc(cls.time)}</span>
                <div class="info">
                    <div class="class">${esc(cls.classId)} — ${esc(cls.subject)}</div>
                    <div class="subject">${cls.students} students · ${cls.pendingMarks} marks pending</div>
                </div>
                <div class="details">
                    <span class="students">${studentsDisplay}</span>
                    <span class="${statusClass}">${statusIcon}</span>
                </div>
                <div class="actions">
                    ${hasPending ? `<button class="btn-sm primary" onclick="window.navigateTo('marks-entry')">Enter</button>` : ''}
                    <button class="btn-sm" onclick="window.navigateTo('class-register')">Register</button>
                    <button class="btn-sm" onclick="window.navigateTo('student-list')">Students</button>
                </div>
            </div>
        `;
  }).join('');
}

// ─── QUICK ACTIONS ──────────────────────────────────────────────────

function renderQuickActions(container) {
  const el = container.querySelector('#teach-quick-actions');
  if (!el) return;

  el.innerHTML = MOCK_DATA.quickActions.map(action => `
        <button class="quick-btn" onclick="window.navigateTo('${action.id}')">
            <span class="icon ${action.id}" style="color:${action.color};">
                <i class="fa-solid ${action.icon}"></i>
            </span>
            <span class="label">${esc(action.label)}</span>
        </button>
    `).join('');
}

// ─── ANIMATE BARS ───────────────────────────────────────────────────

function animateBars() {
  // Completion bar
  document.querySelectorAll('.completion-card .fill').forEach(function (bar) {
    const target = parseFloat(bar.dataset.target) || 0;
    bar.style.width = target + '%';
  });

  // Assessment bars
  document.querySelectorAll('.assess-item .fill').forEach(function (bar) {
    const target = parseFloat(bar.dataset.target) || 0;
    bar.style.width = target + '%';
  });
}

// ─── CLOCK ──────────────────────────────────────────────────────────

function updateClock() {
  const el = document.getElementById('footerTime');
  if (!el) return;
  const now = new Date();
  const date = now.toISOString().slice(0, 10) + ' ' +
    now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  el.textContent = date;
}

// ─── EXPOSE ─────────────────────────────────────────────────────────

export {
  renderTeacherDashboard,
  animateBars,
  updateClock
};

// Default export for router compatibility
export default renderTeacherDashboard;