/**
 * ECOLE LA FONTAINE — Student Details Module
 * Full student profile with tabs: Info, Academics, Fees, Family, History
 * Last updated: 2026-06-29
 */


const state = window.state || {}; // global state alias
import { state, getClassById, getStudentById, getCurrentUser } from '../../core/state.js';
import { esc, fmtDate, fmtCurrency } from '../../core/utils.js';
import { getGrade, getGradeClass } from '../../core/formulas.js';
import { getFullStudentBalance, getStudentCreditBalance } from '../../core/fees.js';
import { generateSingleReport } from '../academics/report-cards.js';

// ──────────────────────────────────────────────────────────────────────
// STATE
// ──────────────────────────────────────────────────────────────────────

let currentStudentId = null;
let activeTab = 'info';

// ──────────────────────────────────────────────────────────────────────
// MAIN RENDER FUNCTION
// ──────────────────────────────────────────────────────────────────────

export async function renderStudentDetails(container) {
    if (!container) return;

    const id = parseInt(localStorage.getItem('elf_view_student'));
    const student = getStudentById(id);

    if (!student) {
        container.innerHTML = `
            <div class="dash-card">
                <div class="dash-card-header">
                    <span class="dash-card-title">ℹ️ Student Details</span>
                </div>
                <div class="dash-card-body">
                    <p>No student selected. Go to <a href="#" onclick="window.navigateTo('student-list')">Student List</a> and click 👁️.</p>
                </div>
            </div>
        `;
        return;
    }

    currentStudentId = student.id;
    activeTab = 'info';

    const user = getCurrentUser();
    const isAdmin = user?.role === 'admin';
    const isAccountant = user?.role === 'accountant';
    const isTeacher = user?.role === 'teacher';

    const cls = getClassById(student.class_id);
    const age = student.date_of_birth ? Math.floor((new Date() - new Date(student.date_of_birth)) / (1000 * 60 * 60 * 24 * 365.25)) : null;

    container.innerHTML = `
        <div class="btn-group" style="margin-bottom:12px;">
            <button class="btn btn-outline" onclick="window.navigateTo('student-list')">← Back to List</button>
            ${isAdmin || isAccountant ? `<button class="btn btn-primary" onclick="window._editStudentFromDetails(${student.id})">✏️ Edit</button>` : ''}
            ${isAdmin || isAccountant ? `<button class="btn btn-outline" onclick="window.navigateToWithData('record-payment', { student_id: ${student.id} })">💰 Pay</button>` : ''}
        </div>

        <!-- Student Header -->
        <div style="display:flex;align-items:center;gap:16px;padding:16px 20px;background:var(--bg-secondary);border-radius:var(--r-lg);border:1px solid var(--border-light);margin-bottom:16px;">
            <div style="width:64px;height:64px;border-radius:50%;background:var(--role-light);display:flex;align-items:center;justify-content:center;font-size:2rem;flex-shrink:0;">
                ${student.gender === 'Male' ? '👨' : '👩'}
            </div>
            <div style="flex:1;">
                <div style="font-size:1.2rem;font-weight:700;">${esc(student.first_name)} ${esc(student.last_name)}</div>
                <div style="font-size:0.85rem;color:var(--text-muted);">
                    ${esc(student.student_code || '')} · ${esc(cls?.name || '—')}
                    ${age !== null ? ` · ${age} yrs` : ''}
                </div>
            </div>
            <div>
                <span class="badge ${student.status === 'Active' ? 'badge-success' : 'badge-neutral'}">${esc(student.status || 'Active')}</span>
            </div>
        </div>

        <!-- Tabs -->
        <div class="tabs" style="display:flex;gap:2px;border-bottom:2px solid var(--border-light);margin-bottom:16px;">
            <button class="tab-btn active" onclick="window._switchStudentTab('info', ${student.id}, event)">📋 Info</button>
            ${isAdmin || isTeacher ? `<button class="tab-btn" onclick="window._switchStudentTab('academics', ${student.id}, event)">📊 Academics</button>` : ''}
            ${isAdmin || isAccountant ? `<button class="tab-btn" onclick="window._switchStudentTab('fees', ${student.id}, event)">💰 Fees</button>` : ''}
            <button class="tab-btn" onclick="window._switchStudentTab('family', ${student.id}, event)">👨‍👩‍👧 Family</button>
            <button class="tab-btn" onclick="window._switchStudentTab('history', ${student.id}, event)">📜 History</button>
        </div>

        <!-- Tab Content -->
        <div id="student-tab-content">
            <div class="loading-container"><div class="spinner"></div><p>Loading...</p></div>
        </div>
    `;

    window._switchStudentTab = switchStudentTab;
    window._editStudentFromDetails = editStudentFromDetails;

    await loadTabContent('info', student.id);
}

// ──────────────────────────────────────────────────────────────────────
// SWITCH STUDENT TAB
// ──────────────────────────────────────────────────────────────────────

async function switchStudentTab(tabName, studentId, event) {
    activeTab = tabName;

    // Update tab buttons
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
        btn.style.borderBottom = '2px solid transparent';
        btn.style.color = 'var(--text-muted)';
    });
    if (event?.target) {
        event.target.classList.add('active');
        event.target.style.borderBottom = '2px solid var(--role-primary)';
        event.target.style.color = 'var(--role-primary)';
    }

    await loadTabContent(tabName, studentId);
}

// ──────────────────────────────────────────────────────────────────────
// LOAD TAB CONTENT
// ──────────────────────────────────────────────────────────────────────

async function loadTabContent(tabName, studentId) {
    const container = document.getElementById('student-tab-content');
    if (!container) return;

    container.innerHTML = '<div class="loading-container"><div class="spinner"></div><p>Loading...</p></div>';

    try {
        switch (tabName) {
            case 'info':
                await renderInfoTab(container, studentId);
                break;
            case 'academics':
                await renderAcademicsTab(container, studentId);
                break;
            case 'fees':
                await renderFeesTab(container, studentId);
                break;
            case 'family':
                await renderFamilyTab(container, studentId);
                break;
            case 'history':
                await renderHistoryTab(container, studentId);
                break;
            default:
                container.innerHTML = '<div class="alert alert-warning">Unknown tab</div>';
        }
    } catch (error) {
        console.error('[Student Tab]', error);
        container.innerHTML = `<div class="alert alert-danger">Error loading tab: ${esc(error.message)}</div>`;
    }
}

// ──────────────────────────────────────────────────────────────────────
// INFO TAB
// ──────────────────────────────────────────────────────────────────────

async function renderInfoTab(container, studentId) {
    const student = getStudentById(studentId);
    if (!student) {
        container.innerHTML = '<div class="alert alert-warning">Student not found</div>';
        return;
    }

    const cls = getClassById(student.class_id);
    const age = student.date_of_birth ? Math.floor((new Date() - new Date(student.date_of_birth)) / (1000 * 60 * 60 * 24 * 365.25)) : null;

    container.innerHTML = `
        <div class="dash-card">
            <div class="dash-card-body">
                <div class="form-grid">
                    <div class="form-group">
                        <label>Full Name</label>
                        <div style="font-weight:600;">${esc(student.first_name)} ${esc(student.last_name)}</div>
                    </div>
                    <div class="form-group">
                        <label>Student Code</label>
                        <div><code>${esc(student.student_code || '—')}</code></div>
                    </div>
                    <div class="form-group">
                        <label>Class</label>
                        <div>${esc(cls?.name || '—')}</div>
                    </div>
                    <div class="form-group">
                        <label>Status</label>
                        <div><span class="badge ${student.status === 'Active' ? 'badge-success' : 'badge-neutral'}">${esc(student.status || '—')}</span></div>
                    </div>
                    <div class="form-group">
                        <label>Gender</label>
                        <div>${esc(student.gender || '—')}</div>
                    </div>
                    <div class="form-group">
                        <label>Date of Birth</label>
                        <div>${fmtDate(student.date_of_birth)}${age !== null ? ` (${age} yrs)` : ''}</div>
                    </div>
                    <div class="form-group">
                        <label>Nationality</label>
                        <div>${esc(student.nationality || '—')}</div>
                    </div>
                    <div class="form-group">
                        <label>Enrollment Date</label>
                        <div>${fmtDate(student.enrollment_date)}</div>
                    </div>
                    <div class="form-group" style="grid-column:1/-1;">
                        <label>Guardian Name</label>
                        <div style="font-weight:600;">${esc(student.guardian_name || '—')}</div>
                    </div>
                    <div class="form-group">
                        <label>Guardian Phone</label>
                        <div>${esc(student.guardian_phone || '—')}</div>
                    </div>
                    <div class="form-group">
                        <label>Guardian Email</label>
                        <div>${esc(student.guardian_email || '—')}</div>
                    </div>
                    <div class="form-group" style="grid-column:1/-1;">
                        <label>Address</label>
                        <div>${esc(student.address || '—')}</div>
                    </div>
                    ${student.notes ? `<div class="form-group" style="grid-column:1/-1;"><label>Notes</label><div>${esc(student.notes)}</div></div>` : ''}
                </div>
            </div>
        </div>
    `;
}

// ──────────────────────────────────────────────────────────────────────
// ACADEMICS TAB
// ──────────────────────────────────────────────────────────────────────

async function renderAcademicsTab(container, studentId) {
    const student = getStudentById(studentId);
    if (!student) {
        container.innerHTML = '<div class="alert alert-warning">Student not found</div>';
        return;
    }

    try {
        const data = await generateSingleReport(studentId);
        if (!data) {
            container.innerHTML = '<div class="alert alert-info">No academic data available for this student.</div>';
            return;
        }

        const cls = getClassById(student.class_id);
        const isNursery = cls?.level === 'Nursery';

        // Extract term data
        const terms = data.termsToProcess || [];
        const subjects = data.subjects || [];
        const termScores = data.termScores || {};

        // Build subject rows
        let subjectRows = '';
        for (const subject of subjects) {
            let row = `<tr><td style="font-weight:600;">${esc(subject.name)}</td>`;
            for (const term of terms) {
                const ts = termScores[term.id]?.subjects[subject.id];
                const pct = ts?.total !== null && ts?.max > 0 ? (ts.total / ts.max) * 100 : 0;
                const grade = pct > 0 ? getGrade(pct) : '—';
                const gradeClass = pct > 0 ? getGradeClass(pct) : '';
                row += `<td style="text-align:center;"><span class="badge ${gradeClass}">${pct > 0 ? pct.toFixed(1) + '%' : '—'}</span></td>`;
            }
            row += `</tr>`;
            subjectRows += row;
        }

        const termHeaders = terms.map(t => `<th style="text-align:center;font-size:0.7rem;">${esc(t.name)}</th>`).join('');

        container.innerHTML = `
            <div class="dash-card" style="margin-bottom:16px;">
                <div class="dash-card-body">
                    <div class="form-grid" style="grid-template-columns:repeat(4,1fr);">
                        <div class="form-group">
                            <label>Overall Average</label>
                            <div style="font-size:1.2rem;font-weight:700;color:${data.overallPercentage >= 70 ? 'var(--success)' : 'var(--warning)'};">${data.overallPercentage.toFixed(1)}%</div>
                        </div>
                        <div class="form-group">
                            <label>Overall Grade</label>
                            <div style="font-size:1.2rem;font-weight:700;"><span class="badge ${getGradeClass(data.overallPercentage)}">${data.overallGrade}</span></div>
                        </div>
                        <div class="form-group">
                            <label>Class Rank</label>
                            <div style="font-size:1.2rem;font-weight:700;">${data.rank || '—'}</div>
                        </div>
                        <div class="form-group">
                            <label>Subjects</label>
                            <div style="font-size:1.2rem;font-weight:700;">${subjects.length}</div>
                        </div>
                    </div>
                </div>
            </div>
            <div class="dash-card">
                <div class="dash-card-header">
                    <span class="dash-card-title">📊 Subject Performance</span>
                </div>
                <div class="dash-card-body" style="padding:0;">
                    <div class="table-wrapper">
                        <table class="data-table" style="font-size:0.8rem;">
                            <thead>
                                <tr>
                                    <th>${isNursery ? 'Matière' : 'Subject'}</th>
                                    ${termHeaders}
                                </tr>
                            </thead>
                            <tbody>${subjectRows || '<tr><td colspan="' + (terms.length + 1) + '" style="text-align:center;padding:20px;color:var(--text-muted);">No subject data available</td></tr>'}</tbody>
                        </table>
                    </div>
                </div>
            </div>
        `;
    } catch (error) {
        console.error('[Academics Tab]', error);
        container.innerHTML = `<div class="alert alert-warning">Could not load academic data: ${esc(error.message)}</div>`;
    }
}

// ──────────────────────────────────────────────────────────────────────
// FEES TAB
// ──────────────────────────────────────────────────────────────────────

async function renderFeesTab(container, studentId) {
    const student = getStudentById(studentId);
    if (!student) {
        container.innerHTML = '<div class="alert alert-warning">Student not found</div>';
        return;
    }

    const balance = await getFullStudentBalance(studentId);
    const credit = getStudentCreditBalance(studentId);
    const fees = (state.studentFees || []).filter(f => f.student_id == studentId && !f.is_credit && !f.manually_deleted);
    const payments = (state.payments || []).filter(p => p.student_id == studentId).sort((a, b) => new Date(b.payment_date || b.created_at) - new Date(a.payment_date || a.created_at));

    const feeRows = fees.map(f => {
        const cat = (state.feeCategories || []).find(c => c.id === f.fee_category_id);
        const due = f.is_waived ? 0 : Math.max(0, (f.amount || 0) - (f.paid_amount || 0));
        const status = f.is_paid ? 'Paid' : f.is_waived ? 'Waived' : (f.paid_amount > 0 ? 'Partial' : 'Due');
        const statusClass = f.is_paid ? 'badge-success' : f.is_waived ? 'badge-info' : (f.paid_amount > 0 ? 'badge-warning' : 'badge-danger');
        return `
            <tr>
                <td>${esc(cat?.name || 'Fee')}</td>
                <td style="text-align:right;">${fmtCurrency(f.amount || 0)}</td>
                <td style="text-align:right;">${fmtCurrency(f.paid_amount || 0)}</td>
                <td style="text-align:right;${due > 0 ? 'color:var(--danger);font-weight:600;' : 'color:var(--success);'}">${fmtCurrency(due)}</td>
                <td style="text-align:center;"><span class="badge ${statusClass}">${status}</span></td>
                <td style="font-size:0.7rem;">${fmtDate(f.due_date)}</td>
            </tr>
        `;
    }).join('') || '<tr><td colspan="6" style="text-align:center;padding:20px;color:var(--text-muted);">No fees assigned</td></tr>';

    const paymentRows = payments.slice(0, 10).map(p => `
        <tr>
            <td>${fmtDate(p.payment_date || p.created_at)}</td>
            <td><code>${esc(p.receipt_number || '—')}</code></td>
            <td style="text-align:right;">${fmtCurrency(p.amount)}</td>
            <td>${esc(p.payment_method || '—')}</td>
        </tr>
    `).join('') || '<tr><td colspan="4" style="text-align:center;padding:20px;color:var(--text-muted);">No payments recorded</td></tr>';

    container.innerHTML = `
        <div class="dash-card" style="margin-bottom:16px;">
            <div class="dash-card-body">
                <div class="form-grid" style="grid-template-columns:repeat(4,1fr);">
                    <div class="form-group">
                        <label>Total Fees</label>
                        <div style="font-size:1.1rem;font-weight:700;">${fmtCurrency(balance.total)}</div>
                    </div>
                    <div class="form-group">
                        <label>Total Paid</label>
                        <div style="font-size:1.1rem;font-weight:700;color:var(--success);">${fmtCurrency(balance.paid)}</div>
                    </div>
                    <div class="form-group">
                        <label>Balance Due</label>
                        <div style="font-size:1.1rem;font-weight:700;${balance.balance > 0 ? 'color:var(--danger);' : 'color:var(--success);'}">${fmtCurrency(balance.balance)}</div>
                    </div>
                    <div class="form-group">
                        <label>Credit Available</label>
                        <div style="font-size:1.1rem;font-weight:700;color:${credit.available > 0 ? 'var(--info)' : 'var(--text-muted)'};">${fmtCurrency(credit.available)}</div>
                    </div>
                </div>
                <div class="btn-group" style="margin-top:12px;">
                    <button class="btn btn-sm btn-primary" onclick="window.navigateToWithData('record-payment', { student_id: ${studentId} })">💰 Record Payment</button>
                    <button class="btn btn-sm btn-outline" onclick="window.navigateTo('fee-waivers')">🎁 Apply Waiver</button>
                </div>
            </div>
        </div>

        <div class="dash-card" style="margin-bottom:16px;">
            <div class="dash-card-header">
                <span class="dash-card-title">📋 Fee Breakdown</span>
            </div>
            <div class="dash-card-body" style="padding:0;">
                <div class="table-wrapper">
                    <table class="data-table" style="font-size:0.8rem;">
                        <thead>
                            <tr>
                                <th>Category</th>
                                <th style="text-align:right;">Amount</th>
                                <th style="text-align:right;">Paid</th>
                                <th style="text-align:right;">Due</th>
                                <th style="text-align:center;">Status</th>
                                <th>Due Date</th>
                            </tr>
                        </thead>
                        <tbody>${feeRows}</tbody>
                    </table>
                </div>
            </div>
        </div>

        <div class="dash-card">
            <div class="dash-card-header">
                <span class="dash-card-title">📜 Payment History</span>
                <span style="font-size:0.7rem;color:var(--text-muted);">${payments.length} payments</span>
            </div>
            <div class="dash-card-body" style="padding:0;">
                <div class="table-wrapper">
                    <table class="data-table" style="font-size:0.8rem;">
                        <thead>
                            <tr>
                                <th>Date</th>
                                <th>Receipt #</th>
                                <th style="text-align:right;">Amount</th>
                                <th>Method</th>
                            </tr>
                        </thead>
                        <tbody>${paymentRows}</tbody>
                    </table>
                </div>
                ${payments.length > 10 ? `<div style="padding:8px 12px;text-align:center;font-size:0.7rem;color:var(--text-muted);">Showing 10 of ${payments.length} payments</div>` : ''}
            </div>
        </div>
    `;
}

// ──────────────────────────────────────────────────────────────────────
// FAMILY TAB
// ──────────────────────────────────────────────────────────────────────

async function renderFamilyTab(container, studentId) {
    const student = getStudentById(studentId);
    if (!student) {
        container.innerHTML = '<div class="alert alert-warning">Student not found</div>';
        return;
    }

    if (!student.family_id) {
        container.innerHTML = `
            <div class="alert alert-info">This student is not linked to a family group.</div>
            ${isAdmin() ? `<button class="btn btn-sm btn-primary" onclick="window.navigateTo('sibling-linking')">🔗 Link to Family</button>` : ''}
        `;
        return;
    }

    const family = (state.families || []).find(f => f.id === student.family_id);
    const siblings = (state.students || []).filter(s => s.family_id === student.family_id && s.id !== student.id && s.status === 'Active');

    const siblingRows = siblings.map(sib => {
        const sc = getClassById(sib.class_id);
        return `
            <tr>
                <td>${esc(sib.first_name)} ${esc(sib.last_name)}</td>
                <td>${esc(sc?.name || '—')}</td>
                <td><button class="btn btn-sm btn-outline" onclick="localStorage.setItem('elf_view_student', ${sib.id}); window.navigateTo('student-details')">👁️ View</button></td>
            </tr>
        `;
    }).join('') || '<tr><td colspan="3" style="text-align:center;padding:20px;color:var(--text-muted);">No siblings linked</td></tr>';

    container.innerHTML = `
        <div class="dash-card" style="margin-bottom:16px;">
            <div class="dash-card-body">
                <div class="form-grid">
                    <div class="form-group">
                        <label>Family Code</label>
                        <div><code>${esc(family?.family_code || '—')}</code></div>
                    </div>
                    <div class="form-group">
                        <label>Guardian Name</label>
                        <div style="font-weight:600;">${esc(family?.guardian_name || student.guardian_name || '—')}</div>
                    </div>
                    <div class="form-group">
                        <label>Guardian Phone</label>
                        <div>${esc(family?.guardian_phone || student.guardian_phone || '—')}</div>
                    </div>
                    <div class="form-group">
                        <label>Guardian Email</label>
                        <div>${esc(family?.guardian_email || student.guardian_email || '—')}</div>
                    </div>
                    ${family?.address ? `<div class="form-group" style="grid-column:1/-1;"><label>Address</label><div>${esc(family.address)}</div></div>` : ''}
                    ${family?.discount_amount ? `<div class="form-group"><label>Family Discount</label><div>${fmtCurrency(family.discount_amount)}</div></div>` : ''}
                </div>
            </div>
        </div>
        <div class="dash-card">
            <div class="dash-card-header">
                <span class="dash-card-title">👨‍👩‍👧 Siblings (${siblings.length})</span>
            </div>
            <div class="dash-card-body" style="padding:0;">
                <div class="table-wrapper">
                    <table class="data-table" style="font-size:0.8rem;">
                        <thead>
                            <tr>
                                <th>Name</th>
                                <th>Class</th>
                                <th>Action</th>
                            </tr>
                        </thead>
                        <tbody>${siblingRows}</tbody>
                    </table>
                </div>
            </div>
        </div>
        <div class="btn-group" style="margin-top:12px;">
            <button class="btn btn-sm btn-outline" onclick="window.navigateTo('sibling-linking')">🔗 Manage Family Links</button>
        </div>
    `;
}

// ──────────────────────────────────────────────────────────────────────
// HISTORY TAB
// ──────────────────────────────────────────────────────────────────────

async function renderHistoryTab(container, studentId) {
    const student = getStudentById(studentId);
    if (!student) {
        container.innerHTML = '<div class="alert alert-warning">Student not found</div>';
        return;
    }

    const events = [];

    // Enrollment
    if (student.enrollment_date) {
        events.push({ date: student.enrollment_date, label: 'Enrolled', detail: `Class: ${getClassById(student.class_id)?.name || '—'}` });
    }

    // Fee records (only for admin/accountant)
    if (isAdmin() || isAccountant()) {
        const fees = (state.studentFees || []).filter(f => f.student_id == studentId);
        for (const fee of fees) {
            if (fee.is_waived) {
                events.push({ date: fee.created_at, label: 'Fee Waived', detail: `${fmtCurrency(fee.amount)} - ${fee.waiver_reason || 'No reason'}` });
            }
        }
        const payments = (state.payments || []).filter(p => p.student_id == studentId);
        for (const p of payments) {
            events.push({ date: p.payment_date || p.created_at, label: 'Payment', detail: `${fmtCurrency(p.amount)} (${p.payment_method || '—'})` });
        }
    }

    // Attendance records
    let attendance = [];
    try {
        attendance = await getAll('attendance', { student_id: studentId });
    } catch (e) { attendance = []; }
    for (const a of attendance) {
        events.push({ date: a.date, label: 'Attendance', detail: `${a.status} - ${a.notes || ''}` });
    }

    // Sort by date descending
    events.sort((a, b) => new Date(b.date) - new Date(a.date));

    const rows = events.slice(0, 50).map(e => `
        <tr>
            <td style="font-size:0.8rem;">${fmtDate(e.date)}</td>
            <td><span class="badge badge-neutral">${esc(e.label)}</span></td>
            <td style="font-size:0.85rem;">${esc(e.detail)}</td>
        </tr>
    `).join('') || '<tr><td colspan="3" style="text-align:center;padding:40px;color:var(--text-muted);">No history recorded</td></tr>';

    container.innerHTML = `
        <div class="dash-card">
            <div class="dash-card-header">
                <span class="dash-card-title">📜 Activity History (${events.length})</span>
                <span style="font-size:0.7rem;color:var(--text-muted);">Showing last 50 events</span>
            </div>
            <div class="dash-card-body" style="padding:0;">
                <div class="table-wrapper">
                    <table class="data-table" style="font-size:0.8rem;">
                        <thead>
                            <tr>
                                <th>Date</th>
                                <th>Event</th>
                                <th>Details</th>
                            </tr>
                        </thead>
                        <tbody>${rows}</tbody>
                    </table>
                </div>
            </div>
        </div>
    `;
}

// ──────────────────────────────────────────────────────────────────────
// EDIT STUDENT FROM DETAILS
// ──────────────────────────────────────────────────────────────────────

function editStudentFromDetails(studentId) {
    const student = getStudentById(studentId);
    if (!student) return;

    // Reuse the edit modal from student-list
    if (typeof window._editStudent === 'function') {
        window._editStudent(studentId);
    } else {
        navigateTo('student-list');
        setTimeout(() => {
            if (typeof window._editStudent === 'function') {
                window._editStudent(studentId);
            }
        }, 500);
    }
}