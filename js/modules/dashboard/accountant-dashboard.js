/**
 * ECOLE LA FONTAINE — Accountant Dashboard
 * Clean finance dashboard with collection metrics and overdue tracking
 * Last updated: 2026-07-03
 * 
 * CHANGES:
 * - Filters all data by selected academic year from sidebar
 * - Uses selected term from the academic year
 * - Shows appropriate term (1st/2nd/3rd) based on selected year
 * - Data reflects the selected year, not just current year
 */



const ensureStateLoaded = window.ensureStateLoaded || (async () => { }); // global from boot.js
import {
    state,
    getCurrentUser,
    getClassById,
    getStudentById,
    getCurrentAcademicYear,
    getActiveAcademicYearId,
    getTermsByYear,
    getYearData,
    getCurrentYearData
} from '../../core/state.js';
import { esc, fmtCurrency, fmtDate, fmtAgo, fmtPct } from '../../core/utils.js';
import { asciiHorizontalBar, asciiVerticalBar, progressBar } from '../../ui/charts.js';
import { animateCards, setupCardClickEffects } from '../../ui/card-animations.js';
import { ensureStateLoaded } from '../../core/boot.js';

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
    const name = user?.name?.split(' ')[0] || user?.username || 'User';

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
        selectedYear: state.filters?.academic_year_id || state.currentAcadYear?.id,
        selectedYearName: state.filters?.academic_year_id ?
            state.academicYears.find(y => y.id === state.filters.academic_year_id)?.name :
            state.currentAcadYear?.name,
    };
}

// ──────────────────────────────────────────────────────────────────────
// MAIN RENDER FUNCTION
// ──────────────────────────────────────────────────────────────────────

export async function renderAccountantDashboard(container) {
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

    // Find the active term based on current date within the selected year
    let selectedTerm = null;
    for (const term of terms) {
        if (term.start_date && term.end_date) {
            if (today >= term.start_date && today <= term.end_date) {
                selectedTerm = term;
                break;
            }
        }
    }
    // If no active term found, use the last term (or first if none)
    if (!selectedTerm && terms.length > 0) {
        selectedTerm = terms[terms.length - 1];
    }

    const currentTerm = selectedTerm || state.currentTerm;

    // ── GET DATA FILTERED BY SELECTED YEAR ──────────────────────────
    const students = (state.students || []).filter(s =>
        s.academic_year_id == selectedYearId &&
        s.status === 'Active' &&
        !s.is_deleted
    );

    const classes = state.classes || [];

    // ── STUDENT FEES FILTERED BY YEAR AND TERM ─────────────────────
    let allStudentFees = (state.studentFees || []).filter(f =>
        f.academic_year_id == selectedYearId
    );

    // If term is selected, filter by term too
    let studentFees = allStudentFees;
    if (currentTerm?.id) {
        studentFees = allStudentFees.filter(f => f.term_id === currentTerm.id);
    }

    // ── PAYMENTS FILTERED BY YEAR AND TERM ─────────────────────────
    let allPayments = (state.payments || []).filter(p =>
        p.academic_year_id == selectedYearId
    );

    let payments = allPayments;
    if (currentTerm?.id) {
        payments = allPayments.filter(p => p.term_id === currentTerm.id);
    }

    // ── Fee Totals ──
    let totalFees = 0;
    let totalPaid = 0;
    let totalWaived = 0;

    const currentTermFees = studentFees.filter(f =>
        !f.is_waived &&
        !f.is_credit &&
        !f.manually_deleted
    );

    for (const fee of currentTermFees) {
        totalFees += fee.amount || 0;
        totalPaid += fee.paid_amount || 0;
    }

    const waivedFees = studentFees.filter(f => f.is_waived === true);
    for (const fee of waivedFees) {
        totalWaived += fee.amount || 0;
    }

    const effectivePaid = totalPaid;
    const pending = Math.max(0, totalFees - effectivePaid);
    const collectionRate = totalFees > 0 ? (effectivePaid / totalFees) * 100 : 0;

    // ── Overdue Students ──
    const overdueStudents = [];

    for (const student of students) {
        const studentFeesForTerm = studentFees.filter(f =>
            f.student_id === student.id &&
            !f.is_waived &&
            !f.is_credit &&
            !f.manually_deleted
        );
        const studentPaid = studentFeesForTerm.reduce((sum, f) => sum + (f.paid_amount || 0), 0);
        const studentTotal = studentFeesForTerm.reduce((sum, f) => sum + (f.amount || 0), 0);
        const balance = studentTotal - studentPaid;

        if (balance <= 0) continue;

        const cls = getClassById(student.class_id);
        const unpaidFees = studentFees.filter(f =>
            f.student_id === student.id &&
            !f.is_paid &&
            !f.is_waived &&
            !f.is_credit
        );
        const oldest = unpaidFees.sort((a, b) => new Date(a.due_date) - new Date(b.due_date))[0];

        if (!oldest?.due_date) continue;

        const days = Math.ceil((Date.now() - new Date(oldest.due_date)) / 86400000);
        if (days < 7) continue;

        overdueStudents.push({
            id: student.id,
            name: `${student.first_name} ${student.last_name}`,
            class_name: cls?.name || '—',
            amount: balance,
            days: days,
            severity: days >= 44 ? 'critical' : days >= 30 ? 'high' : days >= 14 ? 'medium' : 'recent',
        });
    }
    overdueStudents.sort((a, b) => b.days - a.days);

    // ── Recent Payments ──
    const recent = [...payments]
        .sort((a, b) => new Date(b.payment_date || b.created_at) - new Date(a.payment_date || a.created_at))
        .slice(0, 10);

    // ── Collection by Class ──
    const classData = [];
    for (const cls of classes) {
        let expected = 0;
        let collected = 0;
        const studentsInClass = students.filter(s => s.class_id === cls.id);

        for (const student of studentsInClass) {
            const studentFeesForTerm = studentFees.filter(f =>
                f.student_id === student.id &&
                !f.is_waived &&
                !f.is_credit &&
                !f.manually_deleted
            );
            expected += studentFeesForTerm.reduce((sum, f) => sum + (f.amount || 0), 0);
            collected += studentFeesForTerm.reduce((sum, f) => sum + (f.paid_amount || 0), 0);
        }

        if (expected > 0 || collected > 0) {
            classData.push({
                name: cls.name,
                expected: expected / 1000,
                collected: collected / 1000,
                rate: expected > 0 ? (collected / expected) * 100 : 0,
            });
        }
    }
    classData.sort((a, b) => b.rate - a.rate);

    // ── Severity Breakdown ──
    const severityCounts = { critical: 0, high: 0, medium: 0, recent: 0 };
    const severityAmounts = { critical: 0, high: 0, medium: 0, recent: 0 };
    for (const o of overdueStudents) {
        severityCounts[o.severity]++;
        severityAmounts[o.severity] += o.amount;
    }

    // ── Get Enhanced Greeting ──
    const greeting = getEnhancedGreeting();
    const totalOverdue = overdueStudents.length;

    // ── Year Status Indicator ──
    const yearStatusIcon = isActiveYear ? '🟢' : '🔒';
    const yearStatusText = isActiveYear ? 'Active' : 'Read-only';
    const termDisplay = currentTerm?.name || 'No Term';

    // ── Render ──
    container.innerHTML = `
        <div class="accountant-dashboard">

            <!-- GREETING BANNER — TWO LINES -->
            <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;padding:16px 20px;background:var(--bg-secondary);border-radius:var(--r-lg);margin-bottom:20px;border:1px solid var(--border-light);">
                <div>
                    <div style="font-size:1.2rem;font-weight:700;color:var(--text-primary);">${greeting.line1}</div>
                    <div style="font-size:0.85rem;color:var(--text-muted);margin-top:2px;">
                        ${greeting.line2}
                        <span style="margin-left:12px;font-size:0.75rem;">
                            📅 ${fmtDate(new Date())} · ${yearName} ${yearStatusIcon}
                            · ${termDisplay}
                            ${totalOverdue > 0 ? ` · ⚠️ ${totalOverdue} overdue student${totalOverdue > 1 ? 's' : ''}` : ' · 🎉 All fees up to date!'}
                        </span>
                    </div>
                </div>
                <div style="display:flex;gap:8px;flex-wrap:wrap;">
                    ${isActiveYear ? `
                        <button class="btn btn-sm btn-primary" onclick="window.navigateTo('record-payment')" style="padding:6px 14px;font-size:0.8rem;">💰 Record Payment</button>
                    ` : `
                        <span class="badge badge-neutral" style="font-size:0.8rem;padding:6px 12px;">🔒 Read-only (inactive year)</span>
                    `}
                    <button class="btn btn-sm btn-outline" onclick="window.navigateTo('overdue-payments')" style="padding:6px 14px;font-size:0.8rem;">⚠️ Overdue</button>
                    <button class="btn btn-sm btn-outline" onclick="window.navigateTo('financial-reports')" style="padding:6px 14px;font-size:0.8rem;">📊 Reports</button>
                </div>
            </div>

            <!-- YEAR & TERM INFO BANNER -->
            <div style="display:flex;gap:16px;flex-wrap:wrap;padding:10px 16px;background:var(--bg-tertiary);border-radius:var(--r-md);margin-bottom:20px;font-size:0.8rem;border:1px solid var(--border-light);">
                <div><strong>📅 Academic Year:</strong> ${esc(yearName)} <span class="badge ${isActiveYear ? 'badge-success' : 'badge-neutral'}">${yearStatusText}</span></div>
                <div><strong>📚 Term:</strong> ${esc(termDisplay)}</div>
                <div><strong>👥 Students:</strong> ${students.length}</div>
                <div><strong>💰 Fees:</strong> ${studentFees.length} records</div>
                <div><strong>💳 Payments:</strong> ${payments.length} records</div>
            </div>

            <!-- KEY METRICS -->
            <div class="stats-grid" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:12px;margin-bottom:20px;">
                <div class="stat-card" style="padding:14px 16px;background:var(--bg-secondary);border-radius:var(--r-lg);border:1px solid var(--border-light);">
                    <div style="font-size:0.65rem;text-transform:uppercase;color:var(--text-muted);letter-spacing:0.5px;">Total Fees</div>
                    <div style="font-size:1.5rem;font-weight:700;color:var(--text-primary);">${fmtCurrency(totalFees)}</div>
                    <div style="font-size:0.7rem;color:var(--text-muted);">${termDisplay}</div>
                </div>
                <div class="stat-card" style="padding:14px 16px;background:var(--bg-secondary);border-radius:var(--r-lg);border:1px solid var(--border-light);">
                    <div style="font-size:0.65rem;text-transform:uppercase;color:var(--text-muted);letter-spacing:0.5px;">Collected</div>
                    <div style="font-size:1.5rem;font-weight:700;color:var(--success);">${fmtCurrency(effectivePaid)}</div>
                    <div style="font-size:0.7rem;color:var(--text-muted);">${collectionRate.toFixed(1)}% collected</div>
                </div>
                <div class="stat-card" style="padding:14px 16px;background:var(--bg-secondary);border-radius:var(--r-lg);border:1px solid var(--border-light);">
                    <div style="font-size:0.65rem;text-transform:uppercase;color:var(--text-muted);letter-spacing:0.5px;">Pending</div>
                    <div style="font-size:1.5rem;font-weight:700;color:var(--danger);">${fmtCurrency(pending)}</div>
                    <div style="font-size:0.7rem;color:var(--text-muted);">${pending > 0 ? 'outstanding' : '🎉 fully paid'}</div>
                </div>
                <div class="stat-card" style="padding:14px 16px;background:var(--bg-secondary);border-radius:var(--r-lg);border:1px solid var(--border-light);">
                    <div style="font-size:0.65rem;text-transform:uppercase;color:var(--text-muted);letter-spacing:0.5px;">Overdue</div>
                    <div style="font-size:1.5rem;font-weight:700;color:${totalOverdue > 0 ? 'var(--danger)' : 'var(--success)'};">${totalOverdue}</div>
                    <div style="font-size:0.7rem;color:var(--text-muted);">${totalOverdue > 0 ? 'students' : '🎉 none'}</div>
                </div>
                <div class="stat-card" style="padding:14px 16px;background:var(--bg-secondary);border-radius:var(--r-lg);border:1px solid var(--border-light);">
                    <div style="font-size:0.65rem;text-transform:uppercase;color:var(--text-muted);letter-spacing:0.5px;">Collection Rate</div>
                    <div style="font-size:1.5rem;font-weight:700;color:${collectionRate >= 80 ? 'var(--success)' : collectionRate >= 60 ? 'var(--warning)' : 'var(--danger)'};">${collectionRate.toFixed(1)}%</div>
                    <div style="font-size:0.7rem;color:var(--text-muted);">${collectionRate >= 80 ? '✅ on track' : '⚠️ needs attention'}</div>
                </div>
                <div class="stat-card" style="padding:14px 16px;background:var(--bg-secondary);border-radius:var(--r-lg);border:1px solid var(--border-light);">
                    <div style="font-size:0.65rem;text-transform:uppercase;color:var(--text-muted);letter-spacing:0.5px;">Waived</div>
                    <div style="font-size:1.5rem;font-weight:700;color:var(--warning);">${fmtCurrency(totalWaived)}</div>
                    <div style="font-size:0.7rem;color:var(--text-muted);">${waivedFees.length} waivers</div>
                </div>
            </div>

            <!-- TWO COLUMN: COLLECTION BY CLASS + OVERDUE SEVERITY -->
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px;">
                <div class="dash-card" style="background:var(--bg-secondary);border-radius:var(--r-lg);border:1px solid var(--border-light);overflow:hidden;">
                    <div class="dash-card-header" style="padding:12px 16px;border-bottom:1px solid var(--border-light);display:flex;justify-content:space-between;align-items:center;">
                        <span style="font-weight:600;font-size:0.9rem;">📊 Collection by Class</span>
                        <span style="font-size:0.7rem;color:var(--text-muted);">${classData.length} classes · ${yearName}</span>
                    </div>
                    <div class="dash-card-body" style="padding:12px 16px;">
                        ${classData.length ? asciiHorizontalBar(classData.map(c => ({
        label: c.name,
        value: c.rate,
        color: c.rate >= 90 ? '#10b981' : c.rate >= 70 ? '#f59e0b' : '#ef4444'
    })), 30) : '<div style="text-align:center;padding:20px;color:var(--text-muted);">No data available for this year</div>'}
                        <div style="display:flex;justify-content:space-between;margin-top:8px;font-size:0.65rem;color:var(--text-muted);">
                            <span>🟢 ≥90%</span>
                            <span>🟡 70-89%</span>
                            <span>🔴 &lt;70%</span>
                            <span>🎯 Target: 90%</span>
                        </div>
                    </div>
                </div>
                <div class="dash-card" style="background:var(--bg-secondary);border-radius:var(--r-lg);border:1px solid var(--border-light);overflow:hidden;">
                    <div class="dash-card-header" style="padding:12px 16px;border-bottom:1px solid var(--border-light);">
                        <span style="font-weight:600;font-size:0.9rem;">⚠️ Overdue Severity</span>
                    </div>
                    <div class="dash-card-body" style="padding:12px 16px;">
                        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px;">
                            <div style="padding:8px;background:var(--danger-bg);border-radius:6px;text-align:center;">
                                <div style="font-size:1.2rem;font-weight:700;color:var(--danger);">${severityCounts.critical}</div>
                                <div style="font-size:0.65rem;color:var(--text-muted);">Critical ≥44d</div>
                                <div style="font-size:0.6rem;color:var(--danger);">${fmtCurrency(severityAmounts.critical)}</div>
                            </div>
                            <div style="padding:8px;background:var(--warning-bg);border-radius:6px;text-align:center;">
                                <div style="font-size:1.2rem;font-weight:700;color:var(--warning);">${severityCounts.high}</div>
                                <div style="font-size:0.65rem;color:var(--text-muted);">High 30-43d</div>
                                <div style="font-size:0.6rem;color:var(--warning);">${fmtCurrency(severityAmounts.high)}</div>
                            </div>
                            <div style="padding:8px;background:var(--info-bg);border-radius:6px;text-align:center;">
                                <div style="font-size:1.2rem;font-weight:700;color:var(--info);">${severityCounts.medium}</div>
                                <div style="font-size:0.65rem;color:var(--text-muted);">Medium 14-29d</div>
                                <div style="font-size:0.6rem;color:var(--info);">${fmtCurrency(severityAmounts.medium)}</div>
                            </div>
                            <div style="padding:8px;background:var(--success-bg);border-radius:6px;text-align:center;">
                                <div style="font-size:1.2rem;font-weight:700;color:var(--success);">${severityCounts.recent}</div>
                                <div style="font-size:0.65rem;color:var(--text-muted);">Recent 7-13d</div>
                                <div style="font-size:0.6rem;color:var(--success);">${fmtCurrency(severityAmounts.recent)}</div>
                            </div>
                        </div>
                        ${totalOverdue > 0 ? asciiHorizontalBar([
        { label: 'Critical', value: severityCounts.critical || 0, color: '#ef4444' },
        { label: 'High', value: severityCounts.high || 0, color: '#f59e0b' },
        { label: 'Medium', value: severityCounts.medium || 0, color: '#3b82f6' },
        { label: 'Recent', value: severityCounts.recent || 0, color: '#10b981' },
    ], 25) : '<div style="text-align:center;padding:8px;color:var(--text-muted);font-size:0.8rem;">🎉 No overdue payments!</div>'}
                    </div>
                </div>
            </div>

            <!-- RECENT PAYMENTS -->
            <div class="dash-card" style="background:var(--bg-secondary);border-radius:var(--r-lg);border:1px solid var(--border-light);overflow:hidden;margin-bottom:20px;">
                <div class="dash-card-header" style="padding:12px 16px;border-bottom:1px solid var(--border-light);display:flex;justify-content:space-between;align-items:center;">
                    <span style="font-weight:600;font-size:0.9rem;">💳 Recent Payments (${yearName})</span>
                    <button class="btn btn-sm btn-outline" onclick="window.navigateTo('payment-history')" style="padding:4px 10px;font-size:0.7rem;">View All →</button>
                </div>
                <div class="dash-card-body" style="padding:0;">
                    <div style="overflow-x:auto;">
                        <table style="width:100%;border-collapse:collapse;font-size:0.8rem;">
                            <thead>
                                <tr style="background:var(--bg-tertiary);">
                                    <th style="padding:8px 12px;text-align:left;font-weight:600;font-size:0.65rem;text-transform:uppercase;color:var(--text-muted);">Date</th>
                                    <th style="padding:8px 12px;text-align:left;font-weight:600;font-size:0.65rem;text-transform:uppercase;color:var(--text-muted);">Student</th>
                                    <th style="padding:8px 12px;text-align:left;font-weight:600;font-size:0.65rem;text-transform:uppercase;color:var(--text-muted);">Amount</th>
                                    <th style="padding:8px 12px;text-align:left;font-weight:600;font-size:0.65rem;text-transform:uppercase;color:var(--text-muted);">Method</th>
                                    <th style="padding:8px 12px;text-align:left;font-weight:600;font-size:0.65rem;text-transform:uppercase;color:var(--text-muted);">By</th>
                                    <th style="padding:8px 12px;text-align:left;font-weight:600;font-size:0.65rem;text-transform:uppercase;color:var(--text-muted);">Receipt</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${recent.length ? recent.map(p => {
        const student = getStudentById(p.student_id);
        const isAdmin = p.recorded_by === 'admin' || p.recorded_by === 'Administrator';
        return `
                                        <tr style="border-bottom:1px solid var(--border-light);${isAdmin ? 'background:var(--info-bg);' : ''}">
                                            <td style="padding:8px 12px;">${fmtDate(p.payment_date || p.created_at)}</td>
                                            <td style="padding:8px 12px;font-weight:500;">${esc(student ? `${student.first_name} ${student.last_name}` : '—')}</td>
                                            <td style="padding:8px 12px;font-weight:600;">${fmtCurrency(p.amount)}</td>
                                            <td style="padding:8px 12px;">${esc(p.payment_method || '—')}</td>
                                            <td style="padding:8px 12px;">
                                                <span style="${isAdmin ? 'color:var(--info);font-weight:600;' : ''}">${isAdmin ? '🔵 Admin' : '⚪ Self'}</span>
                                            </td>
                                            <td style="padding:8px 12px;"><code style="font-size:0.7rem;background:var(--bg-tertiary);padding:2px 6px;border-radius:4px;">${esc(p.receipt_number || '—')}</code></td>
                                        </tr>
                                    `;
    }).join('') : '<tr><td colspan="6" style="text-align:center;padding:20px;color:var(--text-muted);">No payments recorded for this year</td></tr>'}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            <!-- QUICK ACTIONS -->
            <div class="dash-card" style="background:var(--bg-secondary);border-radius:var(--r-lg);border:1px solid var(--border-light);overflow:hidden;">
                <div class="dash-card-header" style="padding:12px 16px;border-bottom:1px solid var(--border-light);">
                    <span style="font-weight:600;font-size:0.9rem;">⚡ Quick Actions</span>
                </div>
                <div class="dash-card-body" style="padding:12px 16px;">
                    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(90px,1fr));gap:8px;">
                        <button class="quick-btn" onclick="window.navigateTo('record-payment')" style="padding:10px;border:1px solid var(--border-light);border-radius:var(--r-md);background:var(--bg-tertiary);cursor:pointer;text-align:center;transition:all 0.2s;font-size:0.75rem;">
                            <div style="font-size:1.2rem;">💰</div>
                            <div>Pay</div>
                        </button>
                        <button class="quick-btn" onclick="window.navigateTo('receipt-printing')" style="padding:10px;border:1px solid var(--border-light);border-radius:var(--r-md);background:var(--bg-tertiary);cursor:pointer;text-align:center;transition:all 0.2s;font-size:0.75rem;">
                            <div style="font-size:1.2rem;">🧾</div>
                            <div>Receipts</div>
                        </button>
                        <button class="quick-btn" onclick="window.navigateTo('balances')" style="padding:10px;border:1px solid var(--border-light);border-radius:var(--r-md);background:var(--bg-tertiary);cursor:pointer;text-align:center;transition:all 0.2s;font-size:0.75rem;">
                            <div style="font-size:1.2rem;">⚖️</div>
                            <div>Balances</div>
                        </button>
                        <button class="quick-btn" onclick="window.navigateTo('fee-structure')" style="padding:10px;border:1px solid var(--border-light);border-radius:var(--r-md);background:var(--bg-tertiary);cursor:pointer;text-align:center;transition:all 0.2s;font-size:0.75rem;">
                            <div style="font-size:1.2rem;">🏷️</div>
                            <div>Fees</div>
                        </button>
                        <button class="quick-btn" onclick="window.navigateTo('overdue-payments')" style="padding:10px;border:1px solid var(--border-light);border-radius:var(--r-md);background:var(--bg-tertiary);cursor:pointer;text-align:center;transition:all 0.2s;font-size:0.75rem;">
                            <div style="font-size:1.2rem;">⚠️</div>
                            <div>Overdue</div>
                        </button>
                        <button class="quick-btn" onclick="window.navigateTo('financial-reports')" style="padding:10px;border:1px solid var(--border-light);border-radius:var(--r-md);background:var(--bg-tertiary);cursor:pointer;text-align:center;transition:all 0.2s;font-size:0.75rem;">
                            <div style="font-size:1.2rem;">📊</div>
                            <div>Reports</div>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;
}