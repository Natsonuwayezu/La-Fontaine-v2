/**
 * ECOLE LA FONTAINE — Teacher Dashboard
 * Clean dashboard with completion rates, timetable, and quick actions
 * Last updated: 2026-07-03
 * 
 * CHANGES:
 * - Filters all data by selected academic year from sidebar
 * - Uses selected term from the academic year
 * - Enhanced greeting with two lines (time + special day)
 * - Data reflects the selected year, not just current year
 * - Shows year/term info in the dashboard
 */

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
import { esc, fmtDate, fmtAgo, fmtCurrency } from '../../core/utils.js';
import { getGrade, getGradeClass, getCurrentPhase } from '../../core/formulas.js';
import { asciiHorizontalBar, progressBar } from '../../ui/charts.js';
import { getAll } from '../../core/api.js';

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
    const name = user?.name?.split(' ')[0] || user?.username || 'Teacher';

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

export async function renderTeacherDashboard(container) {
    if (!container) return;

    await ensureStateLoaded();

    const user = getCurrentUser();
    const isTeacherUser = user?.role === 'teacher';

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
    if (!selectedTerm && terms.length > 0) {
        selectedTerm = terms[terms.length - 1];
    }

    const currentTerm = selectedTerm || state.currentTerm;
    const phase = getCurrentPhase(currentTerm);

    // ── GET TEACHER'S CLASSES ──────────────────────────────────────
    let teacherClasses = [];
    if (isTeacherUser) {
        const assignments = await getAll('teacher_assignments', { teacher_id: user.id });
        const classIds = [...new Set(assignments.map(a => a.class_id))];
        teacherClasses = (state.classes || []).filter(c =>
            classIds.includes(c.id) && c.is_active !== false
        );
    } else {
        teacherClasses = (state.classes || []).filter(c => c.is_active !== false);
    }

    // ── GET STUDENTS FILTERED BY YEAR ──────────────────────────────
    const allStudents = (state.students || []).filter(s =>
        s.academic_year_id == selectedYearId &&
        s.status === 'Active' &&
        !s.is_deleted
    );

    // ── GET ASSESSMENTS FILTERED BY YEAR AND TERM ──────────────────
    const allAssessments = (state.assessments || []).filter(a =>
        a.academic_year_id == selectedYearId &&
        (currentTerm?.id ? a.term_id === currentTerm.id : true)
    );

    // ── GET MARKS FILTERED BY YEAR ──────────────────────────────────
    const allMarks = (state.marks || []).filter(m =>
        m.academic_year_id == selectedYearId &&
        !m.is_archived
    );

    const students = allStudents;
    const assessments = allAssessments;
    const marks = allMarks;

    // ── Class Performance ──
    const classPerformance = teacherClasses.map(cls => {
        const clsStudents = students.filter(s => s.class_id === cls.id);
        const clsAssessments = assessments.filter(a => a.class_id === cls.id);
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
    });

    const totalStudents = classPerformance.reduce((a, c) => a + c.students, 0);
    const avgScore = classPerformance.length ? classPerformance.reduce((a, c) => a + c.avg, 0) / classPerformance.length : 0;

    // ── Completion Rate ──
    let totalPossible = 0, totalFilled = 0;
    for (const cls of teacherClasses) {
        const clsStudents = students.filter(s => s.class_id === cls.id);
        const clsAssessments = assessments.filter(a => a.class_id === cls.id);
        for (const a of clsAssessments) {
            totalPossible += clsStudents.length;
            if (a.is_locked) {
                totalFilled += clsStudents.length;
            } else {
                const entered = marks.filter(m => m.assessment_id === a.id).length;
                totalFilled += entered;
            }
        }
    }
    const completionRate = totalPossible > 0 ? (totalFilled / totalPossible) * 100 : 0;

    // ── Pending Tasks ──
    const pending = [];
    for (const cls of teacherClasses) {
        const clsAssessments = assessments.filter(a => a.class_id === cls.id && !a.is_locked);
        for (const a of clsAssessments) {
            const expected = students.filter(s => s.class_id === cls.id).length;
            const entered = marks.filter(m => m.assessment_id === a.id).length;
            if (entered < expected) {
                const dueDate = a.due_date ? new Date(a.due_date) : null;
                const days = dueDate ? Math.ceil((dueDate - Date.now()) / 86400000) : null;
                let priority = 'medium';
                if (days === null) priority = 'medium';
                else if (days < 0) priority = 'overdue';
                else if (days <= 3) priority = 'high';
                pending.push({
                    id: a.id,
                    name: a.assessment_name,
                    cls: cls.name,
                    entered,
                    expected,
                    due: a.due_date,
                    priority,
                });
            }
        }
    }
    pending.sort((a, b) => a.priority === 'overdue' ? -1 : b.priority === 'overdue' ? 1 : 0);

    // ── Today's Classes ──
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const todayName = dayNames[new Date().getDay()];

    let todaySlots = [];
    try {
        const slots = await getAll('timetable_slots', {
            teacher_id: user.id,
            day_of_week: todayName,
            academic_year_id: selectedYearId,
        });
        todaySlots = slots || [];
    } catch (e) {
        todaySlots = [];
    }

    // ── Get Enhanced Greeting ──
    const greeting = getEnhancedGreeting();
    const pendingCount = pending.length;

    // ── Year Status Indicator ──
    const yearStatusIcon = isActiveYear ? '🟢' : '🔒';
    const yearStatusText = isActiveYear ? 'Active' : 'Read-only';
    const termDisplay = currentTerm?.name || 'No Term';

    // ── Render ──
    container.innerHTML = `
        <div class="teacher-dashboard">

            <!-- GREETING BANNER — TWO LINES -->
            <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;padding:16px 20px;background:var(--bg-secondary);border-radius:var(--r-lg);margin-bottom:20px;border:1px solid var(--border-light);">
                <div>
                    <div style="font-size:1.2rem;font-weight:700;color:var(--text-primary);">${greeting.line1}</div>
                    <div style="font-size:0.85rem;color:var(--text-muted);margin-top:2px;">
                        ${greeting.line2}
                        <span style="margin-left:12px;font-size:0.75rem;">
                            📅 ${fmtDate(new Date())} · ${yearName} ${yearStatusIcon} · ${termDisplay}
                            · ${phase === 'pre_midterm' ? '📋 Pre-Midterm' : '📝 Post-Midterm'}
                            ${pendingCount > 0 ? ` · ⏳ ${pendingCount} pending task${pendingCount > 1 ? 's' : ''}` : ''}
                        </span>
                    </div>
                </div>
                <div style="display:flex;gap:8px;flex-wrap:wrap;">
                    <button class="btn btn-sm btn-primary" onclick="window.navigateTo('marks-entry')" style="padding:6px 14px;font-size:0.8rem;">✏️ Enter Marks</button>
                    <button class="btn btn-sm btn-outline" onclick="window.navigateTo('class-register')" style="padding:6px 14px;font-size:0.8rem;">📋 Register</button>
                    <button class="btn btn-sm btn-outline" onclick="window.navigateTo('report-cards')" style="padding:6px 14px;font-size:0.8rem;">📄 Reports</button>
                </div>
            </div>

            <!-- YEAR & TERM INFO BANNER -->
            <div style="display:flex;gap:16px;flex-wrap:wrap;padding:10px 16px;background:var(--bg-tertiary);border-radius:var(--r-md);margin-bottom:20px;font-size:0.8rem;border:1px solid var(--border-light);">
                <div><strong>📅 Academic Year:</strong> ${esc(yearName)} <span class="badge ${isActiveYear ? 'badge-success' : 'badge-neutral'}">${yearStatusText}</span></div>
                <div><strong>📚 Term:</strong> ${esc(termDisplay)}</div>
                <div><strong>👥 Students:</strong> ${totalStudents}</div>
                <div><strong>📝 Assessments:</strong> ${assessments.filter(a => teacherClasses.some(c => c.id === a.class_id)).length}</div>
                <div><strong>✏️ Marks:</strong> ${marks.filter(m => teacherClasses.some(c => c.id === (assessments.find(a => a.id === m.assessment_id)?.class_id))).length}</div>
            </div>

            <!-- KEY METRICS -->
            <div class="stats-grid" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:12px;margin-bottom:20px;">
                <div class="stat-card" style="padding:14px 16px;background:var(--bg-secondary);border-radius:var(--r-lg);border:1px solid var(--border-light);">
                    <div style="font-size:0.65rem;text-transform:uppercase;color:var(--text-muted);letter-spacing:0.5px;">Students</div>
                    <div style="font-size:1.5rem;font-weight:700;color:var(--text-primary);">${totalStudents}</div>
                    <div style="font-size:0.7rem;color:var(--text-muted);">${teacherClasses.length} classes</div>
                </div>
                <div class="stat-card" style="padding:14px 16px;background:var(--bg-secondary);border-radius:var(--r-lg);border:1px solid var(--border-light);">
                    <div style="font-size:0.65rem;text-transform:uppercase;color:var(--text-muted);letter-spacing:0.5px;">Assessments</div>
                    <div style="font-size:1.5rem;font-weight:700;color:var(--text-primary);">${teacherClasses.reduce((a, c) => a + assessments.filter(ass => ass.class_id === c.id).length, 0)}</div>
                    <div style="font-size:0.7rem;color:var(--text-muted);">${termDisplay}</div>
                </div>
                <div class="stat-card" style="padding:14px 16px;background:var(--bg-secondary);border-radius:var(--r-lg);border:1px solid var(--border-light);">
                    <div style="font-size:0.65rem;text-transform:uppercase;color:var(--text-muted);letter-spacing:0.5px;">Completion</div>
                    <div style="font-size:1.5rem;font-weight:700;color:${completionRate >= 90 ? 'var(--success)' : completionRate >= 70 ? 'var(--warning)' : 'var(--danger)'};">${completionRate.toFixed(1)}%</div>
                    <div style="font-size:0.7rem;color:var(--text-muted);">${totalFilled}/${totalPossible} marks</div>
                </div>
                <div class="stat-card" style="padding:14px 16px;background:var(--bg-secondary);border-radius:var(--r-lg);border:1px solid var(--border-light);">
                    <div style="font-size:0.65rem;text-transform:uppercase;color:var(--text-muted);letter-spacing:0.5px;">Avg Score</div>
                    <div style="font-size:1.5rem;font-weight:700;color:${avgScore >= 70 ? 'var(--success)' : avgScore >= 50 ? 'var(--warning)' : 'var(--danger)'};">${avgScore.toFixed(1)}%</div>
                    <div style="font-size:0.7rem;color:var(--text-muted);">class average</div>
                </div>
                <div class="stat-card" style="padding:14px 16px;background:var(--bg-secondary);border-radius:var(--r-lg);border:1px solid var(--border-light);">
                    <div style="font-size:0.65rem;text-transform:uppercase;color:var(--text-muted);letter-spacing:0.5px;">Pending</div>
                    <div style="font-size:1.5rem;font-weight:700;color:${pendingCount > 0 ? 'var(--warning)' : 'var(--success)'};">${pendingCount}</div>
                    <div style="font-size:0.7rem;color:var(--text-muted);">${pendingCount > 0 ? 'tasks to complete' : '🎉 all done!'}</div>
                </div>
            </div>

            <!-- TWO COLUMN: CLASS PERFORMANCE + PENDING TASKS -->
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px;">
                <div class="dash-card" style="background:var(--bg-secondary);border-radius:var(--r-lg);border:1px solid var(--border-light);overflow:hidden;">
                    <div class="dash-card-header" style="padding:12px 16px;border-bottom:1px solid var(--border-light);">
                        <span style="font-weight:600;font-size:0.9rem;">📊 My Classes</span>
                    </div>
                    <div class="dash-card-body" style="padding:12px 16px;">
                        ${classPerformance.length ? classPerformance.map(c => `
                            <div style="display:flex;align-items:center;gap:10px;padding:4px 0;border-bottom:1px solid var(--border-light);">
                                <span style="min-width:80px;font-weight:500;font-size:0.85rem;">${esc(c.name)}</span>
                                <div style="flex:1;">${progressBar(c.avg, 20, c.avg >= 70 ? '#10b981' : c.avg >= 50 ? '#f59e0b' : '#ef4444')}</div>
                                <span style="font-size:0.75rem;color:var(--text-muted);min-width:30px;">${c.grade}</span>
                            </div>
                        `).join('') : '<div style="text-align:center;padding:20px;color:var(--text-muted);">No classes assigned</div>'}
                    </div>
                </div>
                <div class="dash-card" style="background:var(--bg-secondary);border-radius:var(--r-lg);border:1px solid var(--border-light);overflow:hidden;">
                    <div class="dash-card-header" style="padding:12px 16px;border-bottom:1px solid var(--border-light);display:flex;justify-content:space-between;align-items:center;">
                        <span style="font-weight:600;font-size:0.9rem;">⏰ Pending Tasks</span>
                        <span style="font-size:0.7rem;color:var(--text-muted);">${pendingCount} pending</span>
                    </div>
                    <div class="dash-card-body" style="padding:12px 16px;max-height:200px;overflow-y:auto;">
                        ${pendingCount > 0 ? pending.slice(0, 8).map(p => `
                            <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid var(--border-light);font-size:0.8rem;">
                                <div>
                                    <span style="font-weight:500;">${esc(p.name)}</span>
                                    <span style="color:var(--text-muted);font-size:0.7rem;"> (${esc(p.cls)})</span>
                                </div>
                                <div style="display:flex;align-items:center;gap:8px;">
                                    <span style="font-size:0.7rem;color:var(--text-muted);">${p.entered}/${p.expected}</span>
                                    <span class="badge ${p.priority === 'overdue' ? 'badge-danger' : p.priority === 'high' ? 'badge-warning' : 'badge-info'}" style="padding:2px 8px;border-radius:12px;font-size:0.6rem;font-weight:600;">${p.priority}</span>
                                </div>
                            </div>
                        `).join('') : '<div style="text-align:center;padding:20px;color:var(--text-muted);">🎉 No pending tasks!</div>'}
                        ${pendingCount > 8 ? `<div style="text-align:center;padding:8px;font-size:0.7rem;color:var(--text-muted);">+ ${pendingCount - 8} more</div>` : ''}
                    </div>
                </div>
            </div>

            <!-- TODAY'S CLASSES -->
            <div class="dash-card" style="background:var(--bg-secondary);border-radius:var(--r-lg);border:1px solid var(--border-light);overflow:hidden;margin-bottom:20px;">
                <div class="dash-card-header" style="padding:12px 16px;border-bottom:1px solid var(--border-light);display:flex;justify-content:space-between;align-items:center;">
                    <span style="font-weight:600;font-size:0.9rem;">📅 Today's Classes</span>
                    <span style="font-size:0.7rem;color:var(--text-muted);">${todayName} · ${todaySlots.length} classes · ${yearName}</span>
                </div>
                <div class="dash-card-body" style="padding:12px 16px;">
                    ${todaySlots.length ? todaySlots.map(slot => {
        const cls = getClassById(slot.class_id);
        const sub = state.subjects.find(s => s.id === slot.subject_id);
        const isActive = cls?.is_active !== false;
        return `
                            <div style="display:flex;align-items:center;gap:12px;padding:8px 0;border-bottom:1px solid var(--border-light);${!isActive ? 'opacity:0.5;' : ''}">
                                <span style="font-size:0.7rem;color:var(--text-muted);min-width:60px;">${slot.time_slot || '—'}</span>
                                <span style="font-weight:500;font-size:0.85rem;">${esc(cls?.name || '—')}</span>
                                <span style="font-size:0.8rem;color:var(--text-muted);">${esc(sub?.name || '—')}</span>
                                <div style="flex:1;"></div>
                                ${isActive ? `
                                    <button class="btn btn-sm btn-outline" onclick="window.navigateTo('marks-entry')" style="padding:4px 10px;font-size:0.7rem;">✏️ Marks</button>
                                    <button class="btn btn-sm btn-outline" onclick="window.navigateTo('class-register')" style="padding:4px 10px;font-size:0.7rem;">📋 Register</button>
                                ` : `
                                    <span class="badge badge-neutral" style="font-size:0.6rem;">🔒 Inactive</span>
                                `}
                            </div>
                        `;
    }).join('') : '<div style="text-align:center;padding:20px;color:var(--text-muted);">No classes scheduled for today</div>'}
                </div>
            </div>

            <!-- QUICK ACTIONS -->
            <div class="dash-card" style="background:var(--bg-secondary);border-radius:var(--r-lg);border:1px solid var(--border-light);overflow:hidden;">
                <div class="dash-card-header" style="padding:12px 16px;border-bottom:1px solid var(--border-light);">
                    <span style="font-weight:600;font-size:0.9rem;">⚡ Quick Actions</span>
                </div>
                <div class="dash-card-body" style="padding:12px 16px;">
                    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(90px,1fr));gap:8px;">
                        <button class="quick-btn" onclick="window.navigateTo('marks-entry')" style="padding:10px;border:1px solid var(--border-light);border-radius:var(--r-md);background:var(--bg-tertiary);cursor:pointer;text-align:center;transition:all 0.2s;font-size:0.75rem;">
                            <div style="font-size:1.2rem;">✏️</div>
                            <div>Marks</div>
                        </button>
                        <button class="quick-btn" onclick="window.navigateTo('class-register')" style="padding:10px;border:1px solid var(--border-light);border-radius:var(--r-md);background:var(--bg-tertiary);cursor:pointer;text-align:center;transition:all 0.2s;font-size:0.75rem;">
                            <div style="font-size:1.2rem;">📋</div>
                            <div>Register</div>
                        </button>
                        <button class="quick-btn" onclick="window.navigateTo('report-cards')" style="padding:10px;border:1px solid var(--border-light);border-radius:var(--r-md);background:var(--bg-tertiary);cursor:pointer;text-align:center;transition:all 0.2s;font-size:0.75rem;">
                            <div style="font-size:1.2rem;">📄</div>
                            <div>Reports</div>
                        </button>
                        <button class="quick-btn" onclick="window.navigateTo('student-list')" style="padding:10px;border:1px solid var(--border-light);border-radius:var(--r-md);background:var(--bg-tertiary);cursor:pointer;text-align:center;transition:all 0.2s;font-size:0.75rem;">
                            <div style="font-size:1.2rem;">👥</div>
                            <div>Students</div>
                        </button>
                        <button class="quick-btn" onclick="window.navigateTo('attendance')" style="padding:10px;border:1px solid var(--border-light);border-radius:var(--r-md);background:var(--bg-tertiary);cursor:pointer;text-align:center;transition:all 0.2s;font-size:0.75rem;">
                            <div style="font-size:1.2rem;">✅</div>
                            <div>Attendance</div>
                        </button>
                        <button class="quick-btn" onclick="window.navigateTo('statistics')" style="padding:10px;border:1px solid var(--border-light);border-radius:var(--r-md);background:var(--bg-tertiary);cursor:pointer;text-align:center;transition:all 0.2s;font-size:0.75rem;">
                            <div style="font-size:1.2rem;">📊</div>
                            <div>Stats</div>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;
}