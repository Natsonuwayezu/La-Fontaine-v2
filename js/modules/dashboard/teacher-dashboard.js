/* ═══════════════════════════════════════════════════════════════════
   js/modules/dashboard/teacher-dashboard.js
   ═══════════════════════════════════════════════════════════════════
   Teacher Dashboard — real data throughout. Rendered into
   #mainContent by core/router.js.

   Scoped to the logged-in teacher via the real teacher_assignments
   table (teacher_id, class_id, subject_id — confirmed against
   staff/teacher-assignments.js, which already reads this table).
   Assessments are further scoped to ones this teacher created
   (assessment.created_by), matching the convention
   core/academic-formulas.js's calcCompletionRate() already uses.

   "Today's Classes" from the original mock needed a real timetable
   with day-of-week time slots — no such table exists anywhere in this
   codebase yet, so rather than fabricate times, this section is now
   "My Classes": every real class/subject this teacher is assigned to,
   with real per-class completion. Attendance is a real on-demand
   fetch for today across the teacher's classes (attendance isn't
   part of global state, matching the pattern already used in
   student-details.js).

   Last updated: 2026-07-29
   ═══════════════════════════════════════════════════════════════════ */

(function () {

let myAssignments = [];
let dashboardData = null;
let hasTriedLazyLoad = false;

// ─── HELPERS ─────────────────────────────────────────────────────────

function getStatusColor(status) {
    const map = { critical: '#ef4444', warning: '#f59e0b', info: '#06b6d4', complete: '#10b981' };
    return map[status] || '#6b5f56';
}
function getStatusIcon(status) {
    const map = { critical: 'fa-circle-exclamation', warning: 'fa-circle-exclamation', info: 'fa-circle-info', complete: 'fa-circle-check' };
    return map[status] || 'fa-circle';
}
function getBarColor(pct) {
    if (pct === 100) return 'green';
    if (pct === 0) return 'red';
    if (pct < 60) return 'red';
    if (pct < 80) return 'amber';
    return 'green';
}
function getStatusIconHtml(pct) {
    if (pct === 100) return '<i class="fa-regular fa-circle-check"></i>';
    if (pct === 0) return '<i class="fa-solid fa-circle-xmark"></i>';
    return '<i class="fa-solid fa-triangle-exclamation"></i>';
}

// ─── REAL DATA ───────────────────────────────────────────────────────

async function getMyAssignments() {
    if (myAssignments.length || !state.currentUser?.id) return myAssignments;
    try {
        myAssignments = await getWhere('teacher_assignments', `teacher_id=eq.${state.currentUser.id}`);
    } catch (err) {
        console.warn('[TeacherDashboard] could not load teacher_assignments:', err.message);
        myAssignments = [];
    }
    return myAssignments;
}

async function getTodaysAttendance(classIds) {
    if (!classIds.length) return null;
    const todayStr = todayISO();
    try {
        const results = await Promise.all(classIds.map(id =>
            getWhere('attendance', `class_id=eq.${id}&date=eq.${todayStr}`).catch(() => [])
        ));
        const all = results.flat();
        if (!all.length) return null;
        return countAttendance(all);
    } catch (err) {
        return null;
    }
}

async function getDashboardData() {
    const assignments = await getMyAssignments();
    const myClassIds = [...new Set(assignments.map(a => a.class_id))];
    const termId = window.getActiveTermId ? window.getActiveTermId() : null;

    const myAssessments = (state.assessments || []).filter(a =>
        a.created_by === state.currentUser?.id && (!termId || String(a.term_id) === String(termId))
    );
    const myAssessmentIds = new Set(myAssessments.map(a => a.id));
    const myMarks = (state.marks || []).filter(m => myAssessmentIds.has(m.assessment_id));

    const classMap = new Map((state.classes || []).map(c => [c.id, c.name]));
    const subjectMap = new Map((state.subjects || []).map(s => [s.id, s.name]));

    // Roster size per class (active, non-deleted students)
    function rosterSize(classId) {
        return (state.students || []).filter(s => String(s.class_id) === String(classId) && !s.is_deleted && (s.status || 'Active') === 'Active').length;
    }

    // ── Marks completion: real filled/total slots across every assessment ──
    let filled = 0, total = 0;
    myAssessments.forEach(a => {
        const roster = rosterSize(a.class_id);
        const entered = new Set(myMarks.filter(m => m.assessment_id === a.id && m.score !== null && m.score !== undefined).map(m => m.student_id)).size;
        filled += entered;
        total += roster;
    });
    const marksCompletionPct = total > 0 ? Math.round((filled / total) * 100) : 0;

    // ── My students: distinct students across my assigned classes ──
    const myStudentIds = new Set();
    myClassIds.forEach(cid => (state.students || []).filter(s => String(s.class_id) === String(cid) && !s.is_deleted && (s.status || 'Active') === 'Active').forEach(s => myStudentIds.add(s.id)));

    // ── Class average: real % across all my marks ──
    const scoredMarks = myMarks.filter(m => !m.is_absent && m.score !== null && m.score !== undefined);
    const pcts = scoredMarks.map(m => {
        const a = myAssessments.find(x => x.id === m.assessment_id);
        return a?.max_score ? (m.score / a.max_score) * 100 : null;
    }).filter(p => p !== null);
    const classAvg = pcts.length ? Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length) : 0;

    // ── Grade distribution across all my real marks ──
    const bands = [
        { label: 'A+', min: 90, color: '#10b981' },
        { label: 'A', min: 80, color: '#34d399' },
        { label: 'B', min: 70, color: '#fbbf24' },
        { label: 'C', min: 60, color: '#f59e0b' },
        { label: 'D', min: 50, color: '#f472b6' },
        { label: 'F', min: 0, color: '#ef4444' }
    ];
    const gradeCounts = bands.map(() => 0);
    pcts.forEach(pct => {
        const idx = bands.findIndex(b => pct >= b.min);
        gradeCounts[idx === -1 ? bands.length - 1 : idx]++;
    });
    const gradeDistribution = bands.map((b, i) => ({ label: b.label, value: gradeCounts[i], color: b.color }));

    // ── Subject completion: group my assessments by subject ──
    const bySubject = new Map();
    myAssessments.forEach(a => {
        if (!bySubject.has(a.subject_id)) bySubject.set(a.subject_id, []);
        bySubject.get(a.subject_id).push(a);
    });
    const subjectCompletion = {
        labels: [], values: [], colors: []
    };
    const SUBJ_COLORS = ['#10b981', '#34d399', '#fbbf24', '#f59e0b', '#f472b6', '#ef4444', '#8b5cf6', '#3b82f6'];
    [...bySubject.entries()].forEach(([subjectId, list], i) => {
        let f = 0, t = 0;
        list.forEach(a => { const r = rosterSize(a.class_id); t += r; f += new Set(myMarks.filter(m => m.assessment_id === a.id && m.score !== null && m.score !== undefined).map(m => m.student_id)).size; });
        subjectCompletion.labels.push(subjectMap.get(subjectId) || `Subject #${subjectId}`);
        subjectCompletion.values.push(t > 0 ? Math.round((f / t) * 100) : 0);
        subjectCompletion.colors.push(SUBJ_COLORS[i % SUBJ_COLORS.length]);
    });

    // ── Assessment completion by class ──
    const byClass = new Map();
    myAssessments.forEach(a => {
        if (!byClass.has(a.class_id)) byClass.set(a.class_id, []);
        const roster = rosterSize(a.class_id);
        const entered = new Set(myMarks.filter(m => m.assessment_id === a.id && m.score !== null && m.score !== undefined).map(m => m.student_id)).size;
        byClass.get(a.class_id).push({ name: a.name, filled: entered, total: roster });
    });
    const assessmentCompletion = [...byClass.entries()].map(([classId, items]) => ({
        classId: `${classMap.get(classId) || `Class #${classId}`} (${rosterSize(classId)} students)`,
        items
    }));

    // ── Reminders: my assessments sorted by lowest completion, with real overdue/due-today/upcoming ──
    const todayStr = todayISO();
    const reminders = myAssessments
        .map(a => {
            const roster = rosterSize(a.class_id);
            const entered = new Set(myMarks.filter(m => m.assessment_id === a.id && m.score !== null && m.score !== undefined).map(m => m.student_id)).size;
            const daysDiff = a.date ? Math.round((new Date(todayStr) - new Date(a.date)) / 86400000) : 0;
            let status = 'info', daysOverdue = 0, daysLeft = 0;
            if (entered >= roster && roster > 0) return null; // fully entered — not a reminder
            if (daysDiff > 0) { status = 'critical'; daysOverdue = daysDiff; }
            else if (daysDiff === 0) { status = 'warning'; }
            else { status = 'info'; daysLeft = Math.abs(daysDiff); }
            return { id: a.id, title: a.name, classId: classMap.get(a.class_id) || '—', dueDate: a.date || '—', filled: entered, total: roster, status, daysOverdue, daysLeft };
        })
        .filter(Boolean)
        .sort((a, b) => (b.daysOverdue || 0) - (a.daysOverdue || 0))
        .slice(0, 6);

    // ── Notifications: real, for this teacher ──
    const notifications = (state.notifications || []).slice(0, 5).map(n => ({
        id: n.id, type: n.type === 'system' || n.type === 'warning' ? 'locked' : 'info',
        title: n.type === 'overdue' ? 'Overdue' : (n.type || 'Notice'),
        message: esc(n.message || ''),
        isRead: !!n.is_read,
    }));

    // ── My classes (replaces "Today's classes" — no real timetable exists) ──
    const myClasses = myClassIds.map(cid => {
        const assessmentsForClass = myAssessments.filter(a => a.class_id === cid);
        const roster = rosterSize(cid);
        let f = 0, t = 0;
        assessmentsForClass.forEach(a => { t += roster; f += new Set(myMarks.filter(m => m.assessment_id === a.id && m.score !== null && m.score !== undefined).map(m => m.student_id)).size; });
        const subjectIds = [...new Set(assignments.filter(a => a.class_id === cid).map(a => a.subject_id))];
        return {
            classId: classMap.get(cid) || `Class #${cid}`,
            subjects: subjectIds.map(id => subjectMap.get(id) || `#${id}`).join(', ') || '—',
            students: roster,
            filled: f, total: t,
            pendingMarks: Math.max(0, t - f),
            status: t > 0 && f >= t ? 'complete' : 'pending',
        };
    });

    // ── Attendance: real on-demand fetch for today across my classes ──
    const attendanceCounts = await getTodaysAttendance(myClassIds);
    const attendanceRate = attendanceCounts ? computeAttendanceRate(attendanceCounts) : null;

    return {
        myStudentCount: myStudentIds.size,
        myClassCount: myClassIds.length,
        assessmentCount: myAssessments.length,
        marksCompletion: { filled, total, pct: marksCompletionPct, onTrack: marksCompletionPct >= 80 },
        classAvg,
        gradeDistribution,
        subjectCompletion,
        assessmentCompletion,
        reminders,
        notifications,
        myClasses,
        attendanceCounts,
        attendanceRate,
        pendingTasksCount: reminders.filter(r => r.status !== 'complete').length,
    };
}

// ─── RENDER ────────────────────────────────────────────────────────

async function renderTeacherDashboard(container) {
    if (!container) return;

    dashboardData = await getDashboardData();
    const d = dashboardData;

    const today = new Date();
    const dateStr = today.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

    container.innerHTML = `
        <div class="dashboard-page">

            <div class="stats-grid" id="teach-stats-grid"></div>

            <div class="completion-card">
                <div class="comp-head">
                    <span class="title"><i class="fa-solid fa-chart-simple" style="color:var(--role-primary, #4a2d5a);margin-right:8px;"></i> Marks Completion Rate</span>
                    <span class="badge">This Term</span>
                </div>
                <div class="comp-body">
                    <div class="comp-stats">
                        <span><strong>${d.marksCompletion.filled}</strong> / ${d.marksCompletion.total} slots filled</span>
                        <span><strong>${d.marksCompletion.pct}%</strong> complete</span>
                    </div>
                    <div class="comp-bar"><div class="fill" style="width:0%;" data-target="${d.marksCompletion.pct}"><div class="glow"></div></div></div>
                    <div class="comp-footer">
                        <span><i class="fa-regular fa-circle-check" style="color:var(--success, #10b981);"></i> ${d.marksCompletion.filled} marks entered</span>
                        <span><i class="fa-regular fa-clock" style="color:var(--warning, #f59e0b);"></i> ${Math.max(0, d.marksCompletion.total - d.marksCompletion.filled)} marks remaining</span>
                        <span class="status"><span class="dot ${d.marksCompletion.onTrack ? 'green' : 'amber'}"></span> ${d.marksCompletion.onTrack ? 'On track' : 'Needs attention'}</span>
                    </div>
                </div>
            </div>

            <div class="charts-row">
                <div class="dash-card">
                    <div class="chart-head">
                        <span class="title"><i class="fa-solid fa-chart-pie" style="color:var(--role-primary, #4a2d5a);margin-right:6px;"></i> Grade Distribution</span>
                        <span class="badge">${d.gradeDistribution.reduce((sum, g) => sum + g.value, 0)} Marks</span>
                    </div>
                    <div class="chart-container"><canvas id="grade-distribution-chart"></canvas></div>
                </div>
                <div class="dash-card">
                    <div class="chart-head">
                        <span class="title"><i class="fa-solid fa-chart-bar" style="color:var(--role-secondary, #8a5a9a);margin-right:6px;"></i> Subject Completion</span>
                        <span class="badge">This Term</span>
                    </div>
                    <div class="chart-container tall"><canvas id="subject-completion-chart"></canvas></div>
                </div>
            </div>

            <div class="assessment-section">
                <div class="assessment-card">
                    <div class="assess-head">
                        <span class="title"><i class="fa-solid fa-list-check" style="color:var(--info, #4a7a8a);margin-right:6px;"></i> Completion by Assessment</span>
                        <span class="badge">${d.assessmentCount} assessments</span>
                    </div>
                    <div id="assessment-completion-body"></div>
                </div>
            </div>

            <div class="reminders-row">
                <div class="reminder-card">
                    <div class="remind-head">
                        <span class="title"><i class="fa-regular fa-clock" style="color:var(--warning, #f59e0b);margin-right:6px;"></i> Marks Entry Reminders</span>
                        <span class="badge">${d.reminders.length} pending</span>
                    </div>
                    <div id="reminders-list"></div>
                </div>
                <div class="reminder-card">
                    <div class="remind-head">
                        <span class="title"><i class="fa-regular fa-bell" style="color:var(--role-primary, #4a2d5a);margin-right:6px;"></i> Notifications</span>
                        <span class="badge">${d.notifications.filter(n => !n.isRead).length} unread</span>
                    </div>
                    <div id="notifications-list"></div>
                </div>
            </div>

            <div class="today-card">
                <div class="today-head">
                    <span class="title"><i class="fa-regular fa-calendar" style="color:var(--success, #10b981);margin-right:6px;"></i> My Classes</span>
                    <span class="badge">${dateStr}</span>
                </div>
                <div id="todays-classes-list"></div>
                <div class="today-footer">${d.myClassCount} classes \u00b7 ${d.myStudentCount} students \u00b7 ${d.pendingTasksCount} assessments pending</div>
            </div>

            <div class="quick-actions" id="teach-quick-actions"></div>

            <div class="dashboard-footer">
                ECOLE LA FONTAINE \u00b7 School Management System <span>\u00b7</span> <span id="footerTime"></span>
            </div>
        </div>
    `;

    renderStats(container);
    renderCharts();
    renderAssessmentCompletion(container);
    renderReminders(container);
    renderNotifications(container);
    renderMyClasses(container);
    renderQuickActions(container);

    setTimeout(() => animateBars(), 400);
    updateClock();
    setInterval(updateClock, 30000);

    // assessments/marks/students for the active term may still be
    // lazily loading — trigger once per visit if needed, then recompute.
    const needsAssessments = !(state.assessments || []).some(a => a.created_by === state.currentUser?.id);
    const needsMarks = !state.marks || state.marks.length === 0;
    if (!hasTriedLazyLoad && (needsAssessments || needsMarks) && window.getActiveTermId?.()) {
        hasTriedLazyLoad = true;
        const termId = window.getActiveTermId();
        window.loadAllAssessmentsForTerm?.(termId)
            .then(() => window.loadAllMarksForTerm?.(termId))
            .then(() => { if (container.isConnected) renderTeacherDashboard(container); })
            .catch(() => {});
    }
}

// ─── STATS ──────────────────────────────────────────────────────────

function renderStats(container) {
    const grid = container.querySelector('#teach-stats-grid');
    if (!grid) return;
    const d = dashboardData;

    const stats = [
        { icon: 'fa-users', label: 'My Students', value: String(d.myStudentCount), sub: `${d.myClassCount} classes` },
        { icon: 'fa-clipboard', label: 'Assessments', value: String(d.assessmentCount), sub: `${d.assessmentCompletion.reduce((s, g) => s + g.items.filter(i => i.filled >= i.total && i.total > 0).length, 0)} completed` },
        { icon: 'fa-pen-to-square', label: 'Marks Entered', value: String(d.marksCompletion.filled), sub: `${d.marksCompletion.total} total slots` },
        { icon: 'fa-chart-line', label: 'Class Avg', value: `${d.classAvg}<span class="suffix">%</span>`, sub: '' },
        { icon: 'fa-clock', label: 'Pending Tasks', value: String(d.pendingTasksCount), sub: `${d.reminders.filter(r => r.status === 'critical').length} overdue` },
        { icon: 'fa-calendar-check', label: 'Attendance Today', value: d.attendanceRate !== null ? `${d.attendanceRate}<span class="suffix">%</span>` : '\u2014', sub: d.attendanceCounts ? `${d.attendanceCounts.A || 0} absent` : 'Not recorded yet' },
    ];

    const accentClasses = ['accent-1', 'accent-2', 'accent-3', 'accent-4', 'accent-5', 'accent-6'];
    grid.innerHTML = stats.map((stat, index) => `
        <div class="stat-card ${accentClasses[index % accentClasses.length]}">
            <div class="top-row">
                <div class="left">
                    <div class="icon i${index + 1}"><i class="fa-solid ${stat.icon}"></i></div>
                    <span class="title">${esc(stat.label)}</span>
                </div>
            </div>
            <div class="main-value">${stat.value}</div>
            <div class="sub-text">${esc(stat.sub)}</div>
        </div>
    `).join('');
}

// ─── CHARTS ──────────────────────────────────────────────────────────

function renderCharts() {
    const d = dashboardData;

    const gradeCtx = document.getElementById('grade-distribution-chart')?.getContext('2d');
    if (gradeCtx) {
        if (window._gradeChart) window._gradeChart.destroy();
        window._gradeChart = new Chart(gradeCtx, {
            type: 'doughnut',
            data: {
                labels: d.gradeDistribution.map(g => g.label),
                datasets: [{ data: d.gradeDistribution.map(g => g.value), backgroundColor: d.gradeDistribution.map(g => g.color), borderColor: 'var(--bg-card, #fcfaf8)', borderWidth: 2 }]
            },
            options: {
                responsive: true, maintainAspectRatio: false, cutout: '65%',
                plugins: {
                    legend: { position: 'bottom', labels: { boxWidth: 10, padding: 6, color: 'var(--text-soft, #6b5f56)' } },
                    tooltip: { callbacks: { label: (ctx) => { const total = ctx.dataset.data.reduce((a, b) => a + b, 0); const pct = total ? ((ctx.raw / total) * 100).toFixed(1) : 0; return `${ctx.label}: ${ctx.raw} (${pct}%)`; } } }
                }
            }
        });
    }

    const subjectCtx = document.getElementById('subject-completion-chart')?.getContext('2d');
    if (subjectCtx) {
        if (window._subjectChart) window._subjectChart.destroy();
        window._subjectChart = new Chart(subjectCtx, {
            type: 'bar',
            data: { labels: d.subjectCompletion.labels, datasets: [{ label: 'Completion Rate (%)', data: d.subjectCompletion.values, backgroundColor: d.subjectCompletion.colors, borderRadius: 4 }] },
            options: {
                indexAxis: 'y', responsive: true, maintainAspectRatio: false,
                plugins: { legend: { display: false }, tooltip: { callbacks: { label: (ctx) => ctx.parsed.x + '% completed' } } },
                scales: {
                    x: { beginAtZero: true, max: 100, grid: { color: 'rgba(107, 95, 86, 0.06)' }, ticks: { callback: (v) => v + '%', color: 'var(--text-soft, #6b5f56)' } },
                    y: { grid: { display: false }, ticks: { color: 'var(--text-soft, #6b5f56)' } }
                }
            }
        });
    }
}

// ─── ASSESSMENT COMPLETION ──────────────────────────────────────────

function renderAssessmentCompletion(container) {
    const body = container.querySelector('#assessment-completion-body');
    if (!body) return;

    if (!dashboardData.assessmentCompletion.length) {
        body.innerHTML = `<div style="padding:20px;text-align:center;color:var(--text-soft);">No assessments created yet this term.</div>`;
        return;
    }

    body.innerHTML = dashboardData.assessmentCompletion.map(group => `
        <div class="assess-group">
            <div class="group-label">${esc(group.classId)}</div>
            ${group.items.map(item => {
        const pct = item.total > 0 ? Math.round((item.filled / item.total) * 100) : 0;
        return `
                    <div class="assess-item">
                        <span class="name">${esc(item.name)}</span>
                        <div class="bar-track"><div class="fill ${getBarColor(pct)}" style="width:0%;" data-target="${pct}"></div></div>
                        <span class="info">${item.filled}/${item.total}</span>
                        <span class="status-icon">${getStatusIconHtml(pct)}</span>
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

    if (!dashboardData.reminders.length) {
        list.innerHTML = `<div style="padding:20px;text-align:center;color:var(--text-soft);">All caught up \u2014 no pending marks entry.</div>`;
        return;
    }

    list.innerHTML = dashboardData.reminders.map(r => {
        let timeDisplay = '';
        if (r.status === 'critical') timeDisplay = `<span style="color:var(--danger, #ef4444);">${r.daysOverdue}d overdue</span>`;
        else if (r.status === 'warning') timeDisplay = `<span style="color:var(--warning, #f59e0b);">Due today</span>`;
        else timeDisplay = `<span style="color:var(--info, #06b6d4);">${r.daysLeft}d left</span>`;

        return `
            <div class="remind-item">
                <span class="icon ${r.status}" style="color:${getStatusColor(r.status)};"><i class="fa-solid ${getStatusIcon(r.status)}"></i></span>
                <div class="body">
                    <div class="text"><strong>${esc(r.title)}</strong> \u2014 ${esc(r.classId)}</div>
                    <div class="sub">Due: ${r.dueDate !== '—' ? esc(fmtDate(r.dueDate)) : '—'} \u00b7 ${r.filled}/${r.total} entered \u00b7 ${timeDisplay}</div>
                </div>
                <button class="action enter" onclick="window.navigateTo('marks-entry', { assessmentId: ${r.id} })">Enter</button>
            </div>
        `;
    }).join('');
}

// ─── NOTIFICATIONS ──────────────────────────────────────────────────

function renderNotifications(container) {
    const list = container.querySelector('#notifications-list');
    if (!list) return;

    if (!dashboardData.notifications.length) {
        list.innerHTML = `<div style="padding:20px;text-align:center;color:var(--text-soft);">No notifications yet.</div>`;
        return;
    }

    list.innerHTML = dashboardData.notifications.map((n, i) => `
        <div class="remind-item" style="${n.isRead ? 'opacity:0.6;' : ''}">
            <span class="icon ${n.type}"><i class="fa-solid ${n.type === 'locked' ? 'fa-lock' : 'fa-circle-info'}"></i></span>
            <div class="body">
                <div class="text"><strong>${esc(n.title)}</strong></div>
                <div class="sub">${n.message}</div>
            </div>
            <button class="action" data-notif="${i}">View</button>
        </div>
    `).join('');

    list.querySelectorAll('[data-notif]').forEach(btn => {
        btn.addEventListener('click', () => {
            const n = dashboardData.notifications[parseInt(btn.dataset.notif, 10)];
            if (n.id != null) window.markNotificationRead?.(n.id);
            btn.closest('.remind-item').style.opacity = '0.6';
        });
    });
}

// ─── MY CLASSES ──────────────────────────────────────────────────────

function renderMyClasses(container) {
    const list = container.querySelector('#todays-classes-list');
    if (!list) return;

    if (!dashboardData.myClasses.length) {
        list.innerHTML = `<div style="padding:20px;text-align:center;color:var(--text-soft);">No classes assigned yet \u2014 contact an admin to set up your teaching assignments.</div>`;
        return;
    }

    list.innerHTML = dashboardData.myClasses.map(cls => `
        <div class="today-item">
            <div class="info">
                <div class="class">${esc(cls.classId)} \u2014 ${esc(cls.subjects)}</div>
                <div class="subject">${cls.students} students \u00b7 ${cls.pendingMarks} marks pending</div>
            </div>
            <div class="details">
                <span class="students">${cls.filled}/${cls.total}</span>
                <span class="${cls.status}">${cls.status === 'complete' ? '\u2705' : '\u26a0\ufe0f'}</span>
            </div>
            <div class="actions">
                ${cls.pendingMarks > 0 ? `<button class="btn-sm primary" onclick="window.navigateTo('assessments')">Enter</button>` : ''}
                <button class="btn-sm" onclick="window.navigateTo('class-register')">Register</button>
                <button class="btn-sm" onclick="window.navigateTo('student-list')">Students</button>
            </div>
        </div>
    `).join('');
}

// ─── QUICK ACTIONS ──────────────────────────────────────────────────

const QUICK_ACTIONS = [
    { id: 'marks-entry', label: 'Marks Entry', icon: 'fa-pen-to-square', color: '#8b5cf6' },
    { id: 'class-register', label: 'Register', icon: 'fa-table', color: '#f59e0b' },
    { id: 'report-cards', label: 'Report Cards', icon: 'fa-file-lines', color: '#10b981' },
    { id: 'statistics', label: 'Statistics', icon: 'fa-chart-pie', color: '#3b82f6' },
    { id: 'assessments', label: 'Assessments', icon: 'fa-clipboard-list', color: '#06b6d4' },
    { id: 'student-list', label: 'Students', icon: 'fa-users', color: '#f472b6' }
];

function renderQuickActions(container) {
    const el = container.querySelector('#teach-quick-actions');
    if (!el) return;
    el.innerHTML = QUICK_ACTIONS.map(action => `
        <button class="quick-btn" onclick="window.navigateTo('${action.id}')">
            <span class="icon ${action.id}" style="color:${action.color};"><i class="fa-solid ${action.icon}"></i></span>
            <span class="label">${esc(action.label)}</span>
        </button>
    `).join('');
}

// ─── ANIMATE BARS ───────────────────────────────────────────────────

function animateBars() {
    document.querySelectorAll('.completion-card .fill').forEach((bar) => { bar.style.width = (parseFloat(bar.dataset.target) || 0) + '%'; });
    document.querySelectorAll('.assess-item .fill').forEach((bar) => { bar.style.width = (parseFloat(bar.dataset.target) || 0) + '%'; });
}

// ─── CLOCK ──────────────────────────────────────────────────────────

function updateClock() {
    const el = document.getElementById('footerTime');
    if (!el) return;
    const now = new Date();
    el.textContent = now.toISOString().slice(0, 10) + ' ' + now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

// ─── EXPOSE ─────────────────────────────────────────────────────────

window.renderTeacherDashboard = renderTeacherDashboard;

})();
