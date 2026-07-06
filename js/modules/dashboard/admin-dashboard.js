/**
 * ECOLE LA FONTAINE — Admin Dashboard
 * Complete dashboard with ASCII charts, key metrics, and alerts
 * Last updated: 2026-07-03
 * 
 * CHANGES:
 * - Added academic year filtering for all data
 * - Enhanced two-line greeting with special messages
 * - Year selector in the dashboard header
 * - All metrics filtered by selected academic year
 * - Shows year status (Active/Inactive) in dashboard
 */



const ensureStateLoaded = window.ensureStateLoaded || (async () => {}); // global from boot.js
import {
    state,
    getCurrentUser,
    getClassById,
    getStudentById,
    getCurrentAcademicYear,
    getActiveAcademicYearId,
    getTermsByYear,
    getYearData,
    getCurrentYearData,
    setYearFilter
} from '../../core/state.js';
import { esc, fmtCurrency, fmtDate, fmtPct, fmtAgo } from '../../core/utils.js';
import { getGrade, getGradeClass, rankStudents, termProgress } from '../../core/formulas.js';
import { asciiHorizontalBar, gradeDistributionChart, trendIndicator } from '../../ui/charts.js';
import { refreshYearData } from '../../core/boot.js';

// ──────────────────────────────────────────────────────────────────────
// ENHANCED GREETING HELPER — Two Lines
// ──────────────────────────────────────────────────────────────────────

function getEnhancedGreeting() {
    const now = new Date();
    const hour = now.getHours();
    const day = now.getDay();
    const date = now.getDate();
    const month = now.getMonth();
    const user = getCurrentUser();
    const name = user?.name?.split(' ')[0] || user?.username || 'Admin';

    // ── Line 1: Time-based greeting ──
    let timeGreeting;
    if (hour < 12) timeGreeting = 'Good morning';
    else if (hour < 17) timeGreeting = 'Good afternoon';
    else if (hour < 21) timeGreeting = 'Good evening';
    else timeGreeting = 'Good night';

    // ── Line 2: Special day message ──
    let specialMessage = '';
    const holidays = state.holidays || [];
    const todayStr = now.toISOString().split('T')[0];

    const todayHoliday = holidays.find(h => h.date === todayStr || (h.start_date <= todayStr && h.end_date >= todayStr));
    if (todayHoliday) {
        specialMessage = `🎉 ${todayHoliday.name}! Enjoy your day!`;
    }

    if (!specialMessage) {
        if (month === 11 && date === 25) specialMessage = '🎄 Merry Christmas! Wishing you a joyful holiday season!';
        else if (month === 0 && date === 1) specialMessage = '🎊 Happy New Year! May this year bring you success and happiness!';
        else if (month === 11 && date === 31) specialMessage = '🎆 Happy New Year\'s Eve! See you in the new year!';
        else if (month === 6 && date === 4) specialMessage = '🇷🇼 Happy Liberation Day! Kwibohora!';
        else if (month === 1 && date === 1) specialMessage = '🇷🇼 Heroes\' Day! Remembering our heroes.';
        else if (month === 3 && date === 7) specialMessage = '🕊️ Genocide Memorial Day. Never forget.';
        else if (month === 4 && date === 1) specialMessage = '👷 Happy Labour Day! Celebrating all workers!';
        else if (month === 2 && date === 8) specialMessage = '👩 Happy International Women\'s Day!';
        else if (month === 1 && date === 14) specialMessage = '❤️ Happy Valentine\'s Day! Spread love and kindness!';
        else if (day === 6) specialMessage = '🌅 Have a wonderful weekend! Enjoy your Saturday!';
        else if (day === 0) specialMessage = '🌅 Enjoy your Sunday! Wishing you a relaxing day!';
        else if (day === 5) specialMessage = '🎉 Happy Friday! Have a great weekend ahead!';
        else if (day === 1) specialMessage = '💪 Start your week strong! Have a productive Monday!';
        else {
            const dailyMessages = [
                '🌟 Have a productive day!', '📚 Keep up the great work!',
                '✨ Make today count!', '💡 Stay focused and achieve your goals!',
                '🌈 Every day is a new opportunity!', '🚀 Keep moving forward!',
                '🎯 Stay on track!', '💪 You\'ve got this!',
                '🌟 Shine bright today!', '📈 Keep pushing forward!',
            ];
            specialMessage = dailyMessages[date % dailyMessages.length];
        }
    }

    const lastLogin = localStorage.getItem('elf_last_login');
    const today = new Date().toISOString().split('T')[0];
    const isReturning = lastLogin && lastLogin.startsWith(today);

    const greetingName = isReturning ? `Welcome back, ${name}! 👋` : `${timeGreeting}, ${name}! 👋`;

    return {
        line1: greetingName,
        line2: specialMessage,
    };
}

// ──────────────────────────────────────────────────────────────────────
// MAIN RENDER FUNCTION
// ──────────────────────────────────────────────────────────────────────

export async function renderAdminDashboard(container) {
    if (!container) return;

    await ensureStateLoaded();

    // ── GET SELECTED ACADEMIC YEAR ──────────────────────────────────
    const selectedYearId = state.filters?.academic_year_id || state.currentAcadYear?.id;
    const selectedYear = (state.academicYears || []).find(y => y.id === selectedYearId);
    const isActiveYear = selectedYear?.is_active === true;
    const yearName = selectedYear?.name || 'Current Year';

    // ── GET TERMS FOR SELECTED YEAR ─────────────────────────────────
    const terms = getTermsByYear(selectedYearId);
    const today = new Date().toISOString().split('T')[0];

    let currentTerm = null;
    for (const term of terms) {
        if (term.start_date && term.end_date) {
            if (today >= term.start_date && today <= term.end_date) {
                currentTerm = term;
                break;
            }
        }
    }
    if (!currentTerm && terms.length > 0) {
        currentTerm = terms[terms.length - 1];
    }
    if (!currentTerm) {
        currentTerm = state.currentTerm;
    }

    // ── GET DATA FILTERED BY SELECTED YEAR ──────────────────────────
    const allStudents = (state.students || []).filter(s =>
        s.academic_year_id == selectedYearId &&
        !s.is_deleted
    );
    const students = allStudents.filter(s => s.status === 'Active');
    const totalStudents = allStudents.length;
    const activeCount = students.length;

    const teachers = state.teachers || [];
    const classes = state.classes || [];

    // ── ASSESSMENTS & MARKS FILTERED BY YEAR ────────────────────────
    const assessments = (state.assessments || []).filter(a =>
        a.academic_year_id == selectedYearId
    );
    const marks = (state.marks || []).filter(m =>
        m.academic_year_id == selectedYearId &&
        !m.is_archived
    );

    // ── FINANCE DATA FILTERED BY YEAR ──────────────────────────────
    const studentFees = (state.studentFees || []).filter(f =>
        f.academic_year_id == selectedYearId
    );
    const payments = (state.payments || []).filter(p =>
        p.academic_year_id == selectedYearId
    );

    // ── Calculate Key Metrics ──

    // School average
    let schoolAvg = 0;
    let avgCount = 0;
    const termAssessments = assessments.filter(a => a.term_id === currentTerm?.id);
    const termMarks = marks.filter(m => termAssessments.some(a => a.id === m.assessment_id));

    const studentAverages = {};
    for (const mark of termMarks) {
        const assessment = termAssessments.find(a => a.id === mark.assessment_id);
        if (assessment && mark.score !== null && mark.score !== undefined) {
            if (!studentAverages[mark.student_id]) studentAverages[mark.student_id] = { total: 0, max: 0 };
            studentAverages[mark.student_id].total += mark.score;
            studentAverages[mark.student_id].max += assessment.max_marks;
        }
    }

    for (const [sid, data] of Object.entries(studentAverages)) {
        if (data.max > 0) {
            const pct = (data.total / data.max) * 100;
            schoolAvg += pct;
            avgCount++;
        }
    }
    schoolAvg = avgCount > 0 ? schoolAvg / avgCount : 0;

    // Pass rate
    const passMark = parseFloat(state.schoolSettings?.pass_mark || 50);
    let passCount = 0;
    for (const [sid, data] of Object.entries(studentAverages)) {
        if (data.max > 0) {
            const pct = (data.total / data.max) * 100;
            if (pct >= passMark) passCount++;
        }
    }
    const passRate = avgCount > 0 ? (passCount / avgCount) * 100 : 0;

    // Fee collection
    let totalFees = 0;
    let totalPaid = 0;
    for (const fee of studentFees) {
        if (!fee.is_waived && !fee.is_credit) {
            totalFees += fee.amount || 0;
            totalPaid += fee.paid_amount || 0;
        }
    }
    const feeRate = totalFees > 0 ? (totalPaid / totalFees) * 100 : 0;

    // At-risk students
    const atRisk = Object.entries(studentAverages)
        .filter(([sid, data]) => {
            if (data.max === 0) return false;
            const pct = (data.total / data.max) * 100;
            return pct < passMark;
        })
        .length;

    // ── Class Performance ──
    const classPerformance = classes.map(cls => {
        const clsStudents = students.filter(s => s.class_id === cls.id);
        const clsAssessments = termAssessments.filter(a => a.class_id === cls.id);
        let totalPct = 0, count = 0;
        for (const st of clsStudents) {
            let score = 0, max = 0;
            for (const a of clsAssessments) {
                const mark = marks.find(m => m.assessment_id === a.id && m.student_id === st.id);
                if (mark) { score += mark.score; max += a.max_marks; }
            }
            if (max > 0) { totalPct += (score / max) * 100; count++; }
        }
        const avg = count > 0 ? totalPct / count : 0;
        return { name: cls.name, students: clsStudents.length, avg, grade: getGrade(avg) };
    }).filter(c => c.students > 0).sort((a, b) => b.avg - a.avg);

    // ── Grade Distribution ──
    const gradeDist = { 'A+': 0, 'A': 0, 'B': 0, 'C': 0, 'D': 0, 'F': 0 };
    for (const [sid, data] of Object.entries(studentAverages)) {
        if (data.max > 0) {
            const pct = (data.total / data.max) * 100;
            const grade = getGrade(pct);
            if (grade in gradeDist) gradeDist[grade]++;
        }
    }

    // ── Recent Activity ──
    const logs = (state.activityLogs || [])
        .filter(l => l.academic_year_id == selectedYearId || !l.academic_year_id)
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
        .slice(0, 8);

    // ── System Alerts ──
    const alerts = [];
    const lastBackup = localStorage.getItem('elf_last_auto_backup');
    if (!lastBackup || (Date.now() - parseInt(lastBackup)) > 2 * 24 * 60 * 60 * 1000) {
        alerts.push({ severity: 'warning', message: 'Backup not run in 2+ days' });
    }
    const lowClasses = classPerformance.filter(c => c.avg < 60);
    if (lowClasses.length > 0) {
        alerts.push({ severity: 'warning', message: `${lowClasses.length} class(es) below 60% average` });
    }
    const overdueFees = studentFees.filter(f => !f.is_paid && !f.is_waived && f.due_date && new Date(f.due_date) < new Date());
    if (overdueFees.length > 0) {
        alerts.push({ severity: 'critical', message: `${overdueFees.length} overdue fee payments` });
    }
    const overCapacity = classes.filter(c => {
        const count = students.filter(s => s.class_id === c.id).length;
        return count > (c.capacity || 40);
    });
    if (overCapacity.length > 0) {
        alerts.push({ severity: 'critical', message: `${overCapacity.length} class(es) over capacity` });
    }
    const termEnd = currentTerm?.end_date ? new Date(currentTerm.end_date) : null;
    if (termEnd) {
        const daysLeft = Math.ceil((termEnd - Date.now()) / 86400000);
        if (daysLeft > 0 && daysLeft < 30) {
            alerts.push({ severity: 'info', message: `Term ends in ${daysLeft} days` });
        }
    }
    if (alerts.length === 0) {
        alerts.push({ severity: 'success', message: 'All systems healthy ✅' });
    }

    // ── Get Enhanced Greeting ──
    const greeting = getEnhancedGreeting();
    const termPct = termProgress(currentTerm);
    const years = (state.academicYears || []).sort((a, b) => b.id - a.id);
    const yearStatusIcon = isActiveYear ? '🟢' : '🔒';
    const yearStatusText = isActiveYear ? 'Active' : 'Read-only';

    // ── Render ──
    container.innerHTML = `
        <div class="admin-dashboard">

            <!-- YEAR SELECTOR & GREETING BANNER -->
            <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;padding:16px 20px;background:var(--bg-secondary);border-radius:var(--r-lg);margin-bottom:20px;border:1px solid var(--border-light);">
                <div>
                    <div style="font-size:1.2rem;font-weight:700;color:var(--text-primary);">${greeting.line1}</div>
                    <div style="font-size:0.85rem;color:var(--text-muted);margin-top:2px;">
                        ${greeting.line2}
                        <span style="margin-left:12px;font-size:0.75rem;">
                            📅 ${fmtDate(new Date())} · ${yearName} ${yearStatusIcon}
                            · ${currentTerm?.name || 'No Term'} · ${termPct.pct}% complete
                            ${alerts.filter(a => a.severity === 'critical' || a.severity === 'warning').length > 0 ? ` · ⚠️ ${alerts.filter(a => a.severity === 'critical' || a.severity === 'warning').length} alert(s)` : ''}
                        </span>
                    </div>
                </div>
                <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
                    <select id="admin-year-select" onchange="window._onAdminYearChange(this.value)" style="padding:6px 12px;border-radius:var(--r-md);border:1px solid var(--border-medium);font-size:0.8rem;">
                        ${years.map(y => `
                            <option value="${y.id}" ${y.id === selectedYearId ? 'selected' : ''}>
                                ${esc(y.name)} ${y.is_active ? '🟢' : '🔒'}
                            </option>
                        `).join('')}
                    </select>
                    <span class="badge ${isActiveYear ? 'badge-success' : 'badge-neutral'}" style="font-size:0.7rem;">${yearStatusText}</span>
                    <button class="btn btn-sm btn-outline" onclick="window.navigateTo('enroll-student')" style="padding:6px 14px;font-size:0.8rem;">➕ Enroll</button>
                    <button class="btn btn-sm btn-outline" onclick="window.navigateTo('fee-structure')" style="padding:6px 14px;font-size:0.8rem;">🏷️ Fees</button>
                    <button class="btn btn-sm btn-outline" onclick="window.navigateTo('record-payment')" style="padding:6px 14px;font-size:0.8rem;">💰 Pay</button>
                    <button class="btn btn-sm btn-outline" onclick="window.doFullBackup && window.doFullBackup()" style="padding:6px 14px;font-size:0.8rem;">💾 Backup</button>
                </div>
            </div>

            <!-- YEAR INFO BANNER -->
            <div style="display:flex;gap:16px;flex-wrap:wrap;padding:8px 16px;background:var(--bg-tertiary);border-radius:var(--r-md);margin-bottom:20px;font-size:0.8rem;border:1px solid var(--border-light);">
                <div><strong>📅 Year:</strong> ${esc(yearName)} <span class="badge ${isActiveYear ? 'badge-success' : 'badge-neutral'}">${yearStatusText}</span></div>
                <div><strong>📚 Term:</strong> ${esc(currentTerm?.name || 'No Term')}</div>
                <div><strong>👥 Students:</strong> ${totalStudents} (${activeCount} active)</div>
                <div><strong>📝 Marks:</strong> ${marks.length} records</div>
                <div><strong>💰 Fees:</strong> ${studentFees.length} records</div>
            </div>

            <!-- KEY METRICS -->
            <div class="stats-grid" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-bottom:20px;">
                <div class="stat-card" style="padding:14px 16px;background:var(--bg-secondary);border-radius:var(--r-lg);border:1px solid var(--border-light);">
                    <div style="font-size:0.65rem;text-transform:uppercase;color:var(--text-muted);letter-spacing:0.5px;">Students</div>
                    <div style="font-size:1.5rem;font-weight:700;color:var(--text-primary);">${totalStudents}</div>
                    <div style="font-size:0.7rem;color:var(--text-muted);">${activeCount} active</div>
                </div>
                <div class="stat-card" style="padding:14px 16px;background:var(--bg-secondary);border-radius:var(--r-lg);border:1px solid var(--border-light);">
                    <div style="font-size:0.65rem;text-transform:uppercase;color:var(--text-muted);letter-spacing:0.5px;">Teachers</div>
                    <div style="font-size:1.5rem;font-weight:700;color:var(--text-primary);">${teachers.filter(t => t.role === 'teacher' && t.status !== 'inactive').length}</div>
                    <div style="font-size:0.7rem;color:var(--text-muted);">${teachers.filter(t => t.role === 'accountant' && t.status !== 'inactive').length} accountants</div>
                </div>
                <div class="stat-card" style="padding:14px 16px;background:var(--bg-secondary);border-radius:var(--r-lg);border:1px solid var(--border-light);">
                    <div style="font-size:0.65rem;text-transform:uppercase;color:var(--text-muted);letter-spacing:0.5px;">School Average</div>
                    <div style="font-size:1.5rem;font-weight:700;color:${schoolAvg >= 70 ? 'var(--success)' : schoolAvg >= 50 ? 'var(--warning)' : 'var(--danger)'};">${schoolAvg.toFixed(1)}%</div>
                    <div style="font-size:0.7rem;color:var(--text-muted);">${avgCount} students assessed</div>
                </div>
                <div class="stat-card" style="padding:14px 16px;background:var(--bg-secondary);border-radius:var(--r-lg);border:1px solid var(--border-light);">
                    <div style="font-size:0.65rem;text-transform:uppercase;color:var(--text-muted);letter-spacing:0.5px;">Pass Rate</div>
                    <div style="font-size:1.5rem;font-weight:700;color:${passRate >= 70 ? 'var(--success)' : passRate >= 50 ? 'var(--warning)' : 'var(--danger)'};">${passRate.toFixed(1)}%</div>
                    <div style="font-size:0.7rem;color:var(--text-muted);">${passCount} passed</div>
                </div>
                <div class="stat-card" style="padding:14px 16px;background:var(--bg-secondary);border-radius:var(--r-lg);border:1px solid var(--border-light);">
                    <div style="font-size:0.65rem;text-transform:uppercase;color:var(--text-muted);letter-spacing:0.5px;">Fee Collection</div>
                    <div style="font-size:1.5rem;font-weight:700;color:${feeRate >= 70 ? 'var(--success)' : feeRate >= 50 ? 'var(--warning)' : 'var(--danger)'};">${feeRate.toFixed(1)}%</div>
                    <div style="font-size:0.7rem;color:var(--text-muted);">${fmtCurrency(totalPaid)} / ${fmtCurrency(totalFees)}</div>
                </div>
                <div class="stat-card" style="padding:14px 16px;background:var(--bg-secondary);border-radius:var(--r-lg);border:1px solid var(--border-light);">
                    <div style="font-size:0.65rem;text-transform:uppercase;color:var(--text-muted);letter-spacing:0.5px;">At-Risk</div>
                    <div style="font-size:1.5rem;font-weight:700;color:var(--danger);">${atRisk}</div>
                    <div style="font-size:0.7rem;color:var(--text-muted);">below ${passMark}% pass mark</div>
                </div>
            </div>

            <!-- TWO COLUMN: CLASS PERFORMANCE + GRADE DISTRIBUTION -->
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px;">
                <div class="dash-card" style="background:var(--bg-secondary);border-radius:var(--r-lg);border:1px solid var(--border-light);overflow:hidden;">
                    <div class="dash-card-header" style="padding:12px 16px;border-bottom:1px solid var(--border-light);display:flex;justify-content:space-between;align-items:center;">
                        <span style="font-weight:600;font-size:0.9rem;">🏆 Class Performance</span>
                        <span style="font-size:0.7rem;color:var(--text-muted);">${classPerformance.length} classes · ${yearName}</span>
                    </div>
                    <div class="dash-card-body" style="padding:12px 16px;">
                        ${classPerformance.length ? asciiHorizontalBar(classPerformance.map(c => ({
        label: c.name,
        value: c.avg,
        color: c.avg >= 80 ? '#10b981' : c.avg >= 60 ? '#f59e0b' : '#ef4444'
    })), 30) : '<div style="text-align:center;padding:20px;color:var(--text-muted);">No class data available for this year</div>'}
                        <div style="display:flex;justify-content:space-between;margin-top:8px;font-size:0.65rem;color:var(--text-muted);">
                            <span>🟢 ≥80%</span>
                            <span>🟡 60-79%</span>
                            <span>🔴 &lt;60%</span>
                            <span>🎯 Target: 80%</span>
                        </div>
                    </div>
                </div>
                <div class="dash-card" style="background:var(--bg-secondary);border-radius:var(--r-lg);border:1px solid var(--border-light);overflow:hidden;">
                    <div class="dash-card-header" style="padding:12px 16px;border-bottom:1px solid var(--border-light);display:flex;justify-content:space-between;align-items:center;">
                        <span style="font-weight:600;font-size:0.9rem;">📊 Grade Distribution</span>
                        <span style="font-size:0.7rem;color:var(--text-muted);">${Object.values(gradeDist).reduce((a, b) => a + b, 0)} students</span>
                    </div>
                    <div class="dash-card-body" style="padding:12px 16px;">
                        ${Object.values(gradeDist).reduce((a, b) => a + b, 0) > 0 ? gradeDistributionChart(gradeDist, 25) : '<div style="text-align:center;padding:20px;color:var(--text-muted);">No grade data available for this year</div>'}
                    </div>
                </div>
            </div>

            <!-- THREE COLUMN: FINANCIAL SUMMARY + SYSTEM ALERTS + RECENT ACTIVITY -->
            <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px;margin-bottom:20px;">
                <!-- Financial Summary -->
                <div class="dash-card" style="background:var(--bg-secondary);border-radius:var(--r-lg);border:1px solid var(--border-light);overflow:hidden;">
                    <div class="dash-card-header" style="padding:12px 16px;border-bottom:1px solid var(--border-light);">
                        <span style="font-weight:600;font-size:0.9rem;">💰 Financial Summary</span>
                    </div>
                    <div class="dash-card-body" style="padding:12px 16px;font-size:0.85rem;">
                        <div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid var(--border-light);">
                            <span style="color:var(--text-muted);">Expected</span>
                            <span style="font-weight:600;">${fmtCurrency(totalFees)}</span>
                        </div>
                        <div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid var(--border-light);">
                            <span style="color:var(--text-muted);">Collected</span>
                            <span style="font-weight:600;color:var(--success);">${fmtCurrency(totalPaid)}</span>
                        </div>
                        <div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid var(--border-light);">
                            <span style="color:var(--text-muted);">Outstanding</span>
                            <span style="font-weight:600;color:var(--danger);">${fmtCurrency(Math.max(0, totalFees - totalPaid))}</span>
                        </div>
                        <div style="display:flex;justify-content:space-between;padding:4px 0;">
                            <span style="color:var(--text-muted);">Rate</span>
                            <span style="font-weight:600;color:${feeRate >= 70 ? 'var(--success)' : 'var(--warning)'};">${feeRate.toFixed(1)}%</span>
                        </div>
                        <div style="margin-top:8px;font-size:0.7rem;color:var(--text-muted);text-align:center;">
                            ${totalFees > 0 ? asciiHorizontalBar([{ label: 'Collection', value: feeRate }], 20) : ''}
                        </div>
                    </div>
                </div>

                <!-- System Alerts -->
                <div class="dash-card" style="background:var(--bg-secondary);border-radius:var(--r-lg);border:1px solid var(--border-light);overflow:hidden;">
                    <div class="dash-card-header" style="padding:12px 16px;border-bottom:1px solid var(--border-light);">
                        <span style="font-weight:600;font-size:0.9rem;">🔔 System Alerts</span>
                    </div>
                    <div class="dash-card-body" style="padding:12px 16px;font-size:0.85rem;">
                        ${alerts.map(a => `
                            <div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--border-light);${a.severity === 'critical' ? 'color:var(--danger);' : a.severity === 'warning' ? 'color:var(--warning);' : ''}">
                                <span>${a.severity === 'critical' ? '🔴' : a.severity === 'warning' ? '🟡' : '🟢'}</span>
                                <span style="flex:1;">${esc(a.message)}</span>
                            </div>
                        `).join('')}
                    </div>
                </div>

                <!-- Recent Activity -->
                <div class="dash-card" style="background:var(--bg-secondary);border-radius:var(--r-lg);border:1px solid var(--border-light);overflow:hidden;">
                    <div class="dash-card-header" style="padding:12px 16px;border-bottom:1px solid var(--border-light);display:flex;justify-content:space-between;align-items:center;">
                        <span style="font-weight:600;font-size:0.9rem;">📋 Recent Activity</span>
                        <span style="font-size:0.7rem;color:var(--text-muted);">${logs.length} events</span>
                    </div>
                    <div class="dash-card-body" style="padding:12px 16px;max-height:200px;overflow-y:auto;font-size:0.8rem;">
                        ${logs.length ? logs.map(log => `
                            <div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid var(--border-light);">
                                <span style="color:var(--text-muted);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(log.action || '—')}</span>
                                <span style="color:var(--text-muted);font-size:0.7rem;">${fmtAgo(log.created_at)}</span>
                            </div>
                        `).join('') : '<div style="text-align:center;padding:20px;color:var(--text-muted);">No recent activity</div>'}
                    </div>
                </div>
            </div>

            <!-- QUICK ACTIONS -->
            <div class="dash-card" style="background:var(--bg-secondary);border-radius:var(--r-lg);border:1px solid var(--border-light);overflow:hidden;">
                <div class="dash-card-header" style="padding:12px 16px;border-bottom:1px solid var(--border-light);">
                    <span style="font-weight:600;font-size:0.9rem;">⚡ Quick Actions</span>
                </div>
                <div class="dash-card-body" style="padding:12px 16px;">
                    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(100px,1fr));gap:8px;">
                        <button class="quick-btn" onclick="window.navigateTo('enroll-student')" style="padding:10px;border:1px solid var(--border-light);border-radius:var(--r-md);background:var(--bg-tertiary);cursor:pointer;text-align:center;transition:all 0.2s;font-size:0.75rem;">
                            <div style="font-size:1.2rem;">➕</div>
                            <div>Enroll</div>
                        </button>
                        <button class="quick-btn" onclick="window.navigateTo('fee-structure')" style="padding:10px;border:1px solid var(--border-light);border-radius:var(--r-md);background:var(--bg-tertiary);cursor:pointer;text-align:center;transition:all 0.2s;font-size:0.75rem;">
                            <div style="font-size:1.2rem;">🏷️</div>
                            <div>Fees</div>
                        </button>
                        <button class="quick-btn" onclick="window.navigateTo('record-payment')" style="padding:10px;border:1px solid var(--border-light);border-radius:var(--r-md);background:var(--bg-tertiary);cursor:pointer;text-align:center;transition:all 0.2s;font-size:0.75rem;">
                            <div style="font-size:1.2rem;">💰</div>
                            <div>Pay</div>
                        </button>
                        <button class="quick-btn" onclick="window.navigateTo('student-promotion')" style="padding:10px;border:1px solid var(--border-light);border-radius:var(--r-md);background:var(--bg-tertiary);cursor:pointer;text-align:center;transition:all 0.2s;font-size:0.75rem;">
                            <div style="font-size:1.2rem;">🎓</div>
                            <div>Promote</div>
                        </button>
                        <button class="quick-btn" onclick="window.navigateTo('backup-restore')" style="padding:10px;border:1px solid var(--border-light);border-radius:var(--r-md);background:var(--bg-tertiary);cursor:pointer;text-align:center;transition:all 0.2s;font-size:0.75rem;">
                            <div style="font-size:1.2rem;">💾</div>
                            <div>Backup</div>
                        </button>
                        <button class="quick-btn" onclick="window.navigateTo('school-settings')" style="padding:10px;border:1px solid var(--border-light);border-radius:var(--r-md);background:var(--bg-tertiary);cursor:pointer;text-align:center;transition:all 0.2s;font-size:0.75rem;">
                            <div style="font-size:1.2rem;">⚙️</div>
                            <div>Settings</div>
                        </button>
                        <button class="quick-btn" onclick="window.navigateTo('class-register')" style="padding:10px;border:1px solid var(--border-light);border-radius:var(--r-md);background:var(--bg-tertiary);cursor:pointer;text-align:center;transition:all 0.2s;font-size:0.75rem;">
                            <div style="font-size:1.2rem;">📋</div>
                            <div>Register</div>
                        </button>
                        <button class="quick-btn" onclick="window.navigateTo('analytics')" style="padding:10px;border:1px solid var(--border-light);border-radius:var(--r-md);background:var(--bg-tertiary);cursor:pointer;text-align:center;transition:all 0.2s;font-size:0.75rem;">
                            <div style="font-size:1.2rem;">📊</div>
                            <div>Analytics</div>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;
}

// ──────────────────────────────────────────────────────────────────────
// YEAR CHANGE HANDLER
// ──────────────────────────────────────────────────────────────────────

window._onAdminYearChange = async function (yearId) {
    if (!yearId) return;
    const year = (state.academicYears || []).find(y => y.id == yearId);
    if (!year) return;

    // Update state filter
    setYearFilter(yearId);
    state.currentAcadYear = year;

    // Refresh data for this year
    await refreshYearData(yearId);

    // Reload dashboard
    renderAdminDashboard(document.getElementById('dynamic-content'));

    const isActive = year.is_active;
    showToast(`📅 Switched to ${year.name} — ${isActive ? 'Active (editable)' : 'Inactive (read-only)'}`,
        isActive ? 'success' : 'info', 3000);
};