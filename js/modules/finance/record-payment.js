/**
 * ECOLE LA FONTAINE — Record Payment Module
 * Complete payment recording with fee selection, credit application, batch payments, and receipt generation
 * Last updated: 2026-07-04
 * 
 * CHANGES:
 * - Added batch payment recording (multiple students, whole family)
 * - Added Year & Term selectors for any period
 * - Added family support with consolidated receipt
 * - Added fee categories table with checkboxes
 * - No payment limits — pay for past, current, or future years
 * - Download individual receipts or consolidated family receipt
 */


import {
    state,
    getClassById,
    getStudentById,
    getCurrentUser,
    isAdmin,
    isAccountant,
    getCurrentAcademicYear,
    getCurrentTerm,
    getTermsByYear,
    getYearData
} from '../../core/state.js';
import { esc, fmtCurrency, fmtDate, generateReceiptNumber } from '../../core/utils.js';
import { insert, update, getAll, get } from '../../core/api.js';
import { getFullStudentBalance, getStudentCreditBalance } from '../../core/fees.js';
import { notifyAction } from '../../core/notifications.js';
import { downloadReceiptPDF } from '../../core/utils.js';

// ──────────────────────────────────────────────────────────────────────
// STATE
// ──────────────────────────────────────────────────────────────────────

let selectedStudents = new Map(); // studentId -> { selected: true, fees: Map }
let batchMode = false;
let currentFamilyId = null;
let selectedYearId = null;
let selectedTermId = null;

// ──────────────────────────────────────────────────────────────────────
// MAIN RENDER FUNCTION
// ──────────────────────────────────────────────────────────────────────

export async function renderRecordPayment(container) {
    if (!container) return;

    const user = getCurrentUser();
    if (!isAdmin() && !isAccountant()) {
        container.innerHTML = '<div class="alert alert-danger">Access denied.</div>';
        return;
    }

    await ensureStateLoaded();

    const classes = (state.classes || []).filter(c => c.is_active !== false);
    const families = (state.families || []);
    const currentYear = getCurrentAcademicYear();
    const currentTerm = getCurrentTerm();
    const years = (state.academicYears || []).sort((a, b) => b.id - a.id);
    const terms = getTermsByYear(currentYear?.id) || [];

    // Default to current year/term
    if (!selectedYearId) selectedYearId = currentYear?.id || null;
    if (!selectedTermId) selectedTermId = currentTerm?.id || null;

    const activeStudents = (state.students || [])
        .filter(s => s.status === 'Active' && !s.is_deleted)
        .sort((a, b) => a.last_name.localeCompare(b.last_name));

    container.innerHTML = `
        <div class="dash-card">
            <div class="dash-card-header" style="flex-wrap:wrap;gap:8px;">
                <span class="dash-card-title">💸 RECORD PAYMENT</span>
                <div class="btn-group" style="flex-wrap:wrap;gap:6px;">
                    <button class="btn btn-sm btn-outline" onclick="window.navigateTo('payment-history')">← History</button>
                    <button class="btn btn-sm btn-outline" onclick="window._toggleBatchMode()">📋 ${batchMode ? 'Single Mode' : 'Batch Mode'}</button>
                    ${batchMode ? `<button class="btn btn-sm btn-outline" onclick="window._loadFamilyStudents()">👨‍👩‍👧 Family</button>` : ''}
                    <button class="btn btn-sm btn-outline" onclick="window._resetPaymentForm()">🗑️ Clear</button>
                </div>
            </div>
            <div class="dash-card-body">

                <!-- Year & Term Selectors -->
                <div class="form-grid" style="margin-bottom:16px;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));">
                    <div class="form-group">
                        <label>📅 Academic Year</label>
                        <select id="pay-year" onchange="window._onYearChange()" style="padding:8px 12px;border-radius:6px;border:1px solid var(--border-medium);width:100%;">
                            ${years.map(y => `
                                <option value="${y.id}" ${y.id === selectedYearId ? 'selected' : ''}>
                                    ${esc(y.name)} ${y.id === currentYear?.id ? '🟢' : ''}
                                </option>
                            `).join('')}
                        </select>
                    </div>
                    <div class="form-group">
                        <label>📚 Term</label>
                        <select id="pay-term" onchange="window._onTermChange()" style="padding:8px 12px;border-radius:6px;border:1px solid var(--border-medium);width:100%;">
                            <option value="">All Terms</option>
                            ${terms.map(t => `
                                <option value="${t.id}" ${t.id === selectedTermId ? 'selected' : ''}>
                                    ${esc(t.name)} ${t.id === currentTerm?.id ? '🟢' : ''}
                                </option>
                            `).join('')}
                        </select>
                    </div>
                    <div class="form-group" id="pay-class-group" style="${batchMode ? '' : 'display:none;'}">
                        <label>🏛️ Class</label>
                        <select id="pay-class" onchange="window._onClassChange()" style="padding:8px 12px;border-radius:6px;border:1px solid var(--border-medium);width:100%;">
                            <option value="">All Classes</option>
                            ${classes.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}
                        </select>
                    </div>
                    <div class="form-group" id="pay-family-group" style="${batchMode ? '' : 'display:none;'}">
                        <label>👨‍👩‍👧 Family</label>
                        <select id="pay-family" onchange="window._onFamilyChange()" style="padding:8px 12px;border-radius:6px;border:1px solid var(--border-medium);width:100%;">
                            <option value="">All Families</option>
                            ${families.map(f => `
                                <option value="${f.id}">${esc(f.family_code)} — ${esc(f.guardian_name || 'No guardian')}</option>
                            `).join('')}
                        </select>
                    </div>
                </div>

                <!-- Student Selection -->
                <div id="student-selection-section" style="margin-bottom:16px;">
                    ${batchMode ? `
                        <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:8px;">
                            <button class="btn btn-sm btn-outline" onclick="window._selectAllStudents()">✓ Select All</button>
                            <button class="btn btn-sm btn-outline" onclick="window._deselectAllStudents()">✗ Deselect All</button>
                            <span style="font-size:0.8rem;color:var(--text-muted);margin-left:8px;" id="batch-count">0 students selected</span>
                        </div>
                        <div id="batch-student-list" style="max-height:300px;overflow-y:auto;border:1px solid var(--border-light);border-radius:6px;padding:8px;">
                            <div class="loading-container"><div class="spinner"></div><p>Loading students...</p></div>
                        </div>
                    ` : `
                        <div class="form-group" style="max-width:400px;">
                            <label>Student *</label>
                            <select id="pay-student" onchange="window._onStudentChange()" style="padding:8px 12px;border-radius:6px;border:1px solid var(--border-medium);width:100%;">
                                <option value="">— Select student —</option>
                                ${activeStudents.map(s => `
                                    <option value="${s.id}">
                                        ${esc(s.first_name)} ${esc(s.last_name)} (${esc(s.student_code || 'STU')}) - ${esc(getClassById(s.class_id)?.name || '?')}
                                    </option>
                                `).join('')}
                            </select>
                        </div>
                    `}
                </div>

                <!-- Student Info & Balance -->
                <div id="student-info-section" style="display:none;margin-bottom:16px;padding:12px;background:var(--bg-tertiary);border-radius:8px;">
                    <div class="form-grid" style="grid-template-columns:repeat(auto-fill,minmax(150px,1fr));">
                        <div><strong>👤 Student:</strong> <span id="pay-student-name">—</span></div>
                        <div><strong>📚 Class:</strong> <span id="pay-student-class">—</span></div>
                        <div><strong>💰 Balance:</strong> <span id="pay-student-balance">—</span></div>
                        <div><strong>⭐ Credit:</strong> <span id="pay-student-credit">—</span></div>
                    </div>
                </div>

                <!-- Fee Selection Table -->
                <div style="margin-bottom:20px;" id="fee-selection-section">
                    <div style="display:flex;justify-content:space-between;margin-bottom:12px;flex-wrap:wrap;gap:8px;">
                        <strong>📋 Fee Categories</strong>
                        <div style="display:flex;gap:8px;flex-wrap:wrap;">
                            <button class="btn btn-sm btn-outline" onclick="window._selectAllFees()">✓ Select All</button>
                            <button class="btn btn-sm btn-outline" onclick="window._deselectAllFees()">✗ Deselect All</button>
                            <span style="font-size:0.8rem;color:var(--text-muted);align-self:center;" id="fee-count">0 fees selected</span>
                        </div>
                    </div>
                    <div class="table-wrapper">
                        <table class="data-table" style="font-size:0.85rem;">
                            <thead>
                                <tr>
                                    <th style="width:40px;">Select</th>
                                    <th>Student</th>
                                    <th>Fee Category</th>
                                    <th style="text-align:right;">Amount</th>
                                    <th style="text-align:right;">Paid</th>
                                    <th style="text-align:right;">Remaining</th>
                                    <th>Due Date</th>
                                    <th>Term</th>
                                    <th>Status</th>
                                </tr>
                            </thead>
                            <tbody id="record-fee-tbody">
                                <tr><td colspan="9" style="text-align:center;padding:40px;color:var(--text-muted);">Select a student or class to view fees</td></tr>
                            </tbody>
                            <tfoot id="record-fee-total">
                                <tr style="background:var(--bg-tertiary);font-weight:700;">
                                    <td colspan="3" style="padding:8px 12px;">TOTAL SELECTED</td>
                                    <td style="padding:8px 12px;text-align:right;" id="rec-total-amount">0 RWF</td>
                                    <td colspan="5"></td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                </div>

                <!-- Payment Details -->
                <div style="margin-bottom:20px;">
                    <strong>💳 PAYMENT DETAILS</strong>
                    <div class="form-grid">
                        <div class="form-group">
                            <label>Amount Paid *</label>
                            <input type="number" id="pay-amount" min="0" step="100" placeholder="Enter amount" oninput="window._updateReceiptPreview()" style="padding:8px 12px;border-radius:6px;border:1px solid var(--border-medium);width:100%;">
                        </div>
                        <div class="form-group">
                            <label>Payment Date *</label>
                            <input type="date" id="pay-date" value="${new Date().toISOString().split('T')[0]}" style="padding:8px 12px;border-radius:6px;border:1px solid var(--border-medium);width:100%;">
                        </div>
                        <div class="form-group">
                            <label>Payment Method</label>
                            <select id="pay-method" onchange="window._updateReceiptPreview()" style="padding:8px 12px;border-radius:6px;border:1px solid var(--border-medium);width:100%;">
                                <option value="Cash">💵 Cash</option>
                                <option value="Mobile-Money">📱 Mobile-Money</option>
                                <option value="Bank Transfer">🏦 Bank Transfer</option>
                                <option value="Cheque">📄 Cheque</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label>Reference</label>
                            <input type="text" id="pay-ref" placeholder="Optional reference" style="padding:8px 12px;border-radius:6px;border:1px solid var(--border-medium);width:100%;">
                        </div>
                        <div class="form-group" style="grid-column:1/-1;">
                            <label>Notes</label>
                            <textarea id="pay-notes" rows="2" placeholder="Optional notes" style="padding:8px 12px;border-radius:6px;border:1px solid var(--border-medium);width:100%;"></textarea>
                        </div>
                    </div>
                </div>

                <!-- Receipt Options -->
                <div style="margin-bottom:20px;">
                    <strong>🧾 Receipt Options</strong>
                    <div style="display:flex;gap:12px;flex-wrap:wrap;margin-top:8px;">
                        <label style="display:flex;align-items:center;gap:6px;font-size:0.85rem;cursor:pointer;">
                            <input type="radio" name="receipt-option" value="individual" checked onchange="window._toggleReceiptOption()"> Individual Receipts
                        </label>
                        <label style="display:flex;align-items:center;gap:6px;font-size:0.85rem;cursor:pointer;">
                            <input type="radio" name="receipt-option" value="consolidated" onchange="window._toggleReceiptOption()"> Consolidated Receipt
                        </label>
                        ${batchMode ? `
                            <label style="display:flex;align-items:center;gap:6px;font-size:0.85rem;cursor:pointer;">
                                <input type="radio" name="receipt-option" value="family" onchange="window._toggleReceiptOption()"> Family Receipt (One PDF)
                            </label>
                        ` : ''}
                    </div>
                </div>

                <!-- Actions -->
                <div class="btn-group" style="justify-content:flex-end;flex-wrap:wrap;gap:8px;">
                    <button class="btn btn-success" onclick="window._recordPayment(false)">✅ Record Payment</button>
                    <button class="btn btn-primary" onclick="window._recordPayment(true)">📄 Record & Download Receipts</button>
                    ${batchMode ? `<button class="btn btn-warning" onclick="window._recordFamilyPayment()">👨‍👩‍👧 Record Family Payment</button>` : ''}
                </div>
            </div>
        </div>
    `;

    // Register functions
    window._onYearChange = onYearChange;
    window._onTermChange = onTermChange;
    window._onClassChange = onClassChange;
    window._onFamilyChange = onFamilyChange;
    window._onStudentChange = onStudentChange;
    window._toggleBatchMode = toggleBatchMode;
    window._loadFamilyStudents = loadFamilyStudents;
    window._selectAllStudents = selectAllStudents;
    window._deselectAllStudents = deselectAllStudents;
    window._selectAllFees = selectAllFees;
    window._deselectAllFees = deselectAllFees;
    window._toggleFee = toggleFee;
    window._updateReceiptPreview = updateReceiptPreview;
    window._toggleReceiptOption = toggleReceiptOption;
    window._resetPaymentForm = resetPaymentForm;
    window._recordPayment = recordPayment;
    window._recordFamilyPayment = recordFamilyPayment;

    // Load initial data
    if (batchMode) {
        await loadBatchStudents();
    }

    // If a student was pre-selected
    const preselId = parseInt(localStorage.getItem('elf_pay_student')) || null;
    if (preselId) {
        localStorage.removeItem('elf_pay_student');
        if (!batchMode) {
            document.getElementById('pay-student').value = preselId;
            onStudentChange();
        }
    }
}

// ──────────────────────────────────────────────────────────────────────
// YEAR / TERM CHANGE
// ──────────────────────────────────────────────────────────────────────

function onYearChange() {
    const yearId = document.getElementById('pay-year')?.value;
    if (yearId) {
        selectedYearId = parseInt(yearId);
        // Update terms dropdown
        const terms = getTermsByYear(selectedYearId);
        const termSelect = document.getElementById('pay-term');
        termSelect.innerHTML = `
            <option value="">All Terms</option>
            ${terms.map(t => `
                <option value="${t.id}">${esc(t.name)}</option>
            `).join('')}
        `;
        // Reset term selection
        selectedTermId = null;
    }
    loadFees();
}

function onTermChange() {
    const termId = document.getElementById('pay-term')?.value;
    selectedTermId = termId ? parseInt(termId) : null;
    loadFees();
}

function onClassChange() {
    if (batchMode) {
        loadBatchStudents();
    }
}

function onFamilyChange() {
    const familyId = document.getElementById('pay-family')?.value;
    currentFamilyId = familyId ? parseInt(familyId) : null;
    if (batchMode) {
        loadBatchStudents();
    }
}

// ──────────────────────────────────────────────────────────────────────
// TOGGLE BATCH MODE
// ──────────────────────────────────────────────────────────────────────

function toggleBatchMode() {
    batchMode = !batchMode;
    selectedStudents = new Map();
    document.getElementById('student-selection-section').innerHTML = '';
    renderRecordPayment(document.getElementById('dynamic-content'));
}

// ──────────────────────────────────────────────────────────────────────
// LOAD BATCH STUDENTS
// ──────────────────────────────────────────────────────────────────────

async function loadBatchStudents() {
    const classId = document.getElementById('pay-class')?.value;
    const familyId = document.getElementById('pay-family')?.value;
    const container = document.getElementById('batch-student-list');
    if (!container) return;

    let students = (state.students || [])
        .filter(s => s.status === 'Active' && !s.is_deleted);

    if (classId) students = students.filter(s => s.class_id == classId);
    if (familyId) students = students.filter(s => s.family_id == familyId);

    students.sort((a, b) => a.last_name.localeCompare(b.last_name));

    if (!students.length) {
        container.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text-muted);">No students found</div>';
        return;
    }

    container.innerHTML = students.map(s => {
        const cls = getClassById(s.class_id);
        const isSelected = selectedStudents.has(s.id) && selectedStudents.get(s.id).selected;
        return `
            <label style="display:flex;align-items:center;gap:8px;padding:6px 8px;border-bottom:1px solid var(--border-light);cursor:pointer;${isSelected ? 'background:var(--role-light);' : ''}" 
                   onmouseover="this.style.background='var(--bg-hover)'" 
                   onmouseout="this.style.background='${isSelected ? 'var(--role-light)' : 'transparent'}'">
                <input type="checkbox" class="batch-student-cb" value="${s.id}" ${isSelected ? 'checked' : ''} onchange="window._toggleBatchStudent(${s.id}, this.checked)">
                <span><strong>${esc(s.first_name)} ${esc(s.last_name)}</strong></span>
                <span style="font-size:0.75rem;color:var(--text-muted);margin-left:8px;">${esc(cls?.name || '—')}</span>
                <span style="font-size:0.7rem;color:var(--text-muted);margin-left:auto;">${esc(s.student_code || '')}</span>
            </label>
        `;
    }).join('');

    updateBatchCount();
    loadFees();
}

// ──────────────────────────────────────────────────────────────────────
// TOGGLE BATCH STUDENT
// ──────────────────────────────────────────────────────────────────────

function toggleBatchStudent(studentId, checked) {
    if (checked) {
        if (!selectedStudents.has(studentId)) {
            selectedStudents.set(studentId, { selected: true, fees: new Map() });
        } else {
            selectedStudents.get(studentId).selected = true;
        }
    } else {
        if (selectedStudents.has(studentId)) {
            selectedStudents.get(studentId).selected = false;
        }
    }
    updateBatchCount();
    loadFees();
}

function selectAllStudents() {
    document.querySelectorAll('.batch-student-cb').forEach(cb => {
        cb.checked = true;
        const id = parseInt(cb.value);
        if (!selectedStudents.has(id)) {
            selectedStudents.set(id, { selected: true, fees: new Map() });
        } else {
            selectedStudents.get(id).selected = true;
        }
    });
    updateBatchCount();
    loadFees();
}

function deselectAllStudents() {
    document.querySelectorAll('.batch-student-cb').forEach(cb => {
        cb.checked = false;
        const id = parseInt(cb.value);
        if (selectedStudents.has(id)) {
            selectedStudents.get(id).selected = false;
        }
    });
    updateBatchCount();
    loadFees();
}

function updateBatchCount() {
    const count = Array.from(selectedStudents.values()).filter(s => s.selected).length;
    const el = document.getElementById('batch-count');
    if (el) el.textContent = `${count} student${count !== 1 ? 's' : ''} selected`;
}

// ──────────────────────────────────────────────────────────────────────
// ON STUDENT CHANGE (Single Mode)
// ──────────────────────────────────────────────────────────────────────

async function onStudentChange() {
    const studentId = document.getElementById('pay-student')?.value;
    if (!studentId) {
        document.getElementById('record-fee-tbody').innerHTML = '<tr><td colspan="9" style="text-align:center;padding:40px;color:var(--text-muted);">Select a student to view fees</td></tr>';
        document.getElementById('student-info-section').style.display = 'none';
        return;
    }

    const student = getStudentById(parseInt(studentId));
    if (student) {
        const cls = getClassById(student.class_id);
        const balance = await getFullStudentBalance(student.id);
        const credit = getStudentCreditBalance(student.id);

        document.getElementById('pay-student-name').textContent = `${student.first_name} ${student.last_name}`;
        document.getElementById('pay-student-class').textContent = cls?.name || '—';
        document.getElementById('pay-student-balance').textContent = fmtCurrency(balance.balance);
        document.getElementById('pay-student-credit').textContent = fmtCurrency(credit.available);
        document.getElementById('student-info-section').style.display = 'block';
    }

    // Select this student in batch mode too
    if (batchMode) {
        const id = parseInt(studentId);
        if (!selectedStudents.has(id)) {
            selectedStudents.set(id, { selected: true, fees: new Map() });
        } else {
            selectedStudents.get(id).selected = true;
        }
        updateBatchCount();
    }

    loadFees();
}

// ──────────────────────────────────────────────────────────────────────
// LOAD FEES (Filtered by Year/Term)
// ──────────────────────────────────────────────────────────────────────

function loadFees() {
    let studentIds = [];

    if (batchMode) {
        studentIds = Array.from(selectedStudents.entries())
            .filter(([id, data]) => data.selected)
            .map(([id]) => id);
    } else {
        const sid = document.getElementById('pay-student')?.value;
        if (sid) studentIds = [parseInt(sid)];
    }

    if (!studentIds.length) {
        document.getElementById('record-fee-tbody').innerHTML = '<tr><td colspan="9" style="text-align:center;padding:40px;color:var(--text-muted);">Select a student to view fees</td></tr>';
        return;
    }

    let fees = (state.studentFees || [])
        .filter(f => studentIds.includes(f.student_id) && !f.is_credit && !f.manually_deleted && !f.is_paid);

    // Filter by year
    if (selectedYearId) {
        fees = fees.filter(f => f.academic_year_id == selectedYearId);
    }

    // Filter by term
    if (selectedTermId) {
        fees = fees.filter(f => f.term_id == selectedTermId);
    }

    // Sort by student then due date
    fees.sort((a, b) => {
        if (a.student_id !== b.student_id) return a.student_id - b.student_id;
        const dateA = a.due_date ? new Date(a.due_date) : new Date(0);
        const dateB = b.due_date ? new Date(b.due_date) : new Date(0);
        return dateA - dateB;
    });

    const tbody = document.getElementById('record-fee-tbody');
    if (!fees.length) {
        tbody.innerHTML = `<tr><td colspan="9" style="text-align:center;padding:40px;color:var(--text-muted);">No unpaid fees for the selected year/term</td></tr>`;
        updateTotalDisplay();
        return;
    }

    tbody.innerHTML = fees.map(fee => {
        const student = getStudentById(fee.student_id);
        const cat = state.feeCategories.find(c => c.id === fee.fee_category_id);
        const term = getTermById(fee.term_id);
        const paid = fee.paid_amount || 0;
        const remaining = fee.amount - paid;
        const isSelected = selectedStudents.get(fee.student_id)?.fees?.get(fee.id) || false;
        const status = fee.is_paid ? 'Paid' : (paid > 0 ? 'Partial' : 'Due');
        const statusClass = fee.is_paid ? 'badge-success' : (paid > 0 ? 'badge-warning' : 'badge-danger');

        return `
            <tr>
                <td style="text-align:center;">
                    <input type="checkbox" class="fee-cb" data-student-id="${fee.student_id}" data-fee-id="${fee.id}" ${isSelected ? 'checked' : ''} onchange="window._toggleFee(${fee.id}, ${fee.student_id}, this.checked)">
                </td>
                <td>${student ? esc(student.first_name + ' ' + student.last_name) : '—'}</td>
                <td>${esc(cat?.name || 'Unknown')}</td>
                <td style="text-align:right;">${fmtCurrency(fee.amount)}</td>
                <td style="text-align:right;">${fmtCurrency(paid)}</td>
                <td style="text-align:right;font-weight:600;color:${remaining > 0 ? 'var(--danger)' : 'var(--success)'};">${fmtCurrency(remaining)}</td>
                <td style="font-size:0.8rem;">${fmtDate(fee.due_date)}</td>
                <td style="font-size:0.8rem;">${esc(term?.name || '—')}</td>
                <td style="text-align:center;"><span class="badge ${statusClass}">${status}</span></td>
            </tr>
        `;
    }).join('');

    updateTotalDisplay();
}

// ──────────────────────────────────────────────────────────────────────
// TOGGLE FEE
// ──────────────────────────────────────────────────────────────────────

function toggleFee(feeId, studentId, checked) {
    if (!selectedStudents.has(studentId)) {
        selectedStudents.set(studentId, { selected: true, fees: new Map() });
    }
    const studentData = selectedStudents.get(studentId);
    if (checked) {
        studentData.fees.set(feeId, true);
    } else {
        studentData.fees.delete(feeId);
    }
    updateTotalDisplay();
    updateFeeCount();
}

// ──────────────────────────────────────────────────────────────────────
// SELECT / DESELECT ALL FEES
// ──────────────────────────────────────────────────────────────────────

function selectAllFees() {
    document.querySelectorAll('.fee-cb').forEach(cb => {
        cb.checked = true;
        const studentId = parseInt(cb.dataset.studentId);
        const feeId = parseInt(cb.dataset.feeId);
        if (!selectedStudents.has(studentId)) {
            selectedStudents.set(studentId, { selected: true, fees: new Map() });
        }
        selectedStudents.get(studentId).fees.set(feeId, true);
    });
    updateTotalDisplay();
    updateFeeCount();
}

function deselectAllFees() {
    document.querySelectorAll('.fee-cb').forEach(cb => {
        cb.checked = false;
        const studentId = parseInt(cb.dataset.studentId);
        const feeId = parseInt(cb.dataset.feeId);
        if (selectedStudents.has(studentId)) {
            selectedStudents.get(studentId).fees.delete(feeId);
        }
    });
    updateTotalDisplay();
    updateFeeCount();
}

// ──────────────────────────────────────────────────────────────────────
// UPDATE TOTALS
// ──────────────────────────────────────────────────────────────────────

function updateTotalDisplay() {
    let total = 0;
    let count = 0;
    for (const [studentId, data] of selectedStudents) {
        if (!data.selected) continue;
        for (const [feeId, selected] of data.fees) {
            if (selected) {
                const fee = state.studentFees.find(f => f.id === feeId);
                if (fee) {
                    total += Math.max(0, fee.amount - (fee.paid_amount || 0));
                    count++;
                }
            }
        }
    }
    document.getElementById('rec-total-amount').textContent = fmtCurrency(total);
    const amountInput = document.getElementById('pay-amount');
    if (amountInput && !amountInput.value) {
        amountInput.max = total;
    }
}

function updateFeeCount() {
    let count = 0;
    for (const [studentId, data] of selectedStudents) {
        if (!data.selected) continue;
        for (const [feeId, selected] of data.fees) {
            if (selected) count++;
        }
    }
    const el = document.getElementById('fee-count');
    if (el) el.textContent = `${count} fee${count !== 1 ? 's' : ''} selected`;
}

// ──────────────────────────────────────────────────────────────────────
// UPDATE RECEIPT PREVIEW
// ──────────────────────────────────────────────────────────────────────

function updateReceiptPreview() {
    const amount = parseFloat(document.getElementById('pay-amount')?.value) || 0;
    const method = document.getElementById('pay-method')?.value || '—';
    const previewDiv = document.getElementById('receipt-preview-content');

    if (!previewDiv) return;

    // Get selected students and fees
    const selectedList = [];
    for (const [studentId, data] of selectedStudents) {
        if (!data.selected) continue;
        const student = getStudentById(studentId);
        const feeNames = [];
        for (const [feeId, selected] of data.fees) {
            if (selected) {
                const fee = state.studentFees.find(f => f.id === feeId);
                if (fee) {
                    const cat = state.feeCategories.find(c => c.id === fee.fee_category_id);
                    feeNames.push(cat?.name || 'Fee');
                }
            }
        }
        if (feeNames.length) {
            selectedList.push({
                name: student ? `${student.first_name} ${student.last_name}` : '—',
                fees: feeNames,
                count: feeNames.length
            });
        }
    }

    if (!selectedList.length) {
        previewDiv.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text-muted);">Select students and fees to see receipt preview</div>';
        return;
    }

    const receiptNum = generateReceiptNumber(state.payments?.length || 0 + 1);
    const totalStudents = selectedList.length;

    previewDiv.innerHTML = `
        <div style="background:var(--bg-secondary);border:1px solid var(--border-light);border-radius:8px;padding:12px;font-size:12px;max-width:400px;margin:0 auto;">
            <div style="text-align:center;margin-bottom:8px;">
                <strong style="font-size:14px;">ECOLE LA FONTAINE</strong><br>
                <small style="color:var(--text-muted);">${batchMode ? 'BATCH PAYMENT RECEIPT' : 'OFFICIAL PAYMENT RECEIPT'}</small>
            </div>
            <div style="border-top:1px dashed var(--border-medium);margin:6px 0;"></div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:2px;font-size:11px;">
                <span style="color:var(--text-muted);">Receipt #:</span>
                <span style="font-weight:600;">${receiptNum}</span>
                <span style="color:var(--text-muted);">Date:</span>
                <span>${new Date().toLocaleDateString()}</span>
                <span style="color:var(--text-muted);">Students:</span>
                <span>${totalStudents}</span>
                <span style="color:var(--text-muted);">Method:</span>
                <span>${method}</span>
                <span style="color:var(--text-muted);font-weight:700;">Amount:</span>
                <span style="font-weight:700;font-size:14px;color:var(--success);">${fmtCurrency(amount)}</span>
            </div>
            ${totalStudents <= 3 ? `
                <div style="margin-top:6px;font-size:10px;color:var(--text-muted);border-top:1px dotted var(--border-light);padding-top:6px;">
                    ${selectedList.map(s => `<div><strong>${esc(s.name)}</strong>: ${s.fees.slice(0, 3).join(', ')}${s.fees.length > 3 ? ` +${s.fees.length - 3} more` : ''}</div>`).join('')}
                </div>
            ` : `
                <div style="margin-top:6px;font-size:10px;color:var(--text-muted);border-top:1px dotted var(--border-light);padding-top:6px;">
                    ${totalStudents} students · ${selectedList.reduce((sum, s) => sum + s.count, 0)} fees total
                </div>
            `}
            ${amount > 0 ? `
                <div style="text-align:center;margin-top:8px;padding:6px;background:var(--success-bg);border-radius:6px;color:var(--success);font-weight:600;font-size:11px;">
                    ✅ Payment Verified — ${fmtCurrency(amount)}
                </div>
            ` : `
                <div style="text-align:center;margin-top:8px;padding:6px;color:var(--text-muted);font-size:11px;">
                    Enter amount above
                </div>
            `}
            <div style="border-top:1px dashed var(--border-medium);margin:6px 0;"></div>
            <div style="text-align:center;font-size:9px;color:var(--text-muted);">
                Thank you for your payment
            </div>
        </div>
    `;
}

// ──────────────────────────────────────────────────────────────────────
// TOGGLE RECEIPT OPTION
// ──────────────────────────────────────────────────────────────────────

function toggleReceiptOption() {
    // Just update UI — actual logic handled in recordPayment
    const selected = document.querySelector('input[name="receipt-option"]:checked')?.value || 'individual';
    showToast(`Receipt mode: ${selected}`, 'info', 1500);
}

// ──────────────────────────────────────────────────────────────────────
// RESET PAYMENT FORM
// ──────────────────────────────────────────────────────────────────────

function resetPaymentForm() {
    document.getElementById('pay-amount').value = '';
    document.getElementById('pay-ref').value = '';
    document.getElementById('pay-notes').value = '';
    selectedStudents = new Map();
    if (!batchMode) {
        document.getElementById('pay-student').value = '';
        document.getElementById('student-info-section').style.display = 'none';
    } else {
        document.querySelectorAll('.batch-student-cb').forEach(cb => cb.checked = false);
        updateBatchCount();
    }
    document.getElementById('record-fee-tbody').innerHTML = '<tr><td colspan="9" style="text-align:center;padding:40px;color:var(--text-muted);">Select a student to view fees</td></tr>';
    document.getElementById('rec-total-amount').textContent = '0 RWF';
    document.getElementById('fee-count').textContent = '0 fees selected';
    document.getElementById('receipt-preview-content').innerHTML = '<div style="text-align:center;padding:20px;color:var(--text-muted);">Select students and fees to see receipt preview</div>';
    showToast('Form cleared', 'info', 1500);
}

// ──────────────────────────────────────────────────────────────────────
// RECORD PAYMENT
// ──────────────────────────────────────────────────────────────────────

async function recordPayment(printAfter = false) {
    const amount = parseFloat(document.getElementById('pay-amount')?.value);
    const date = document.getElementById('pay-date')?.value;
    const method = document.getElementById('pay-method')?.value;
    const ref = document.getElementById('pay-ref')?.value.trim() || null;
    const notes = document.getElementById('pay-notes')?.value.trim() || null;
    const receiptOption = document.querySelector('input[name="receipt-option"]:checked')?.value || 'individual';

    if (!date) {
        showToast('Please select a payment date', 'warning');
        return;
    }

    if (isNaN(amount) || amount <= 0) {
        showToast('Please enter a valid amount', 'warning');
        return;
    }

    // Get selected fees
    const selectedFeeMap = new Map();
    for (const [studentId, data] of selectedStudents) {
        if (!data.selected) continue;
        for (const [feeId, selected] of data.fees) {
            if (selected) {
                if (!selectedFeeMap.has(studentId)) selectedFeeMap.set(studentId, []);
                selectedFeeMap.get(studentId).push(feeId);
            }
        }
    }

    if (!selectedFeeMap.size) {
        showToast('Please select at least one fee to pay', 'warning');
        return;
    }

    const totalFees = Array.from(selectedFeeMap.values()).reduce((sum, arr) => sum + arr.length, 0);
    const btn = document.querySelector('.btn-success');
    const originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-sm"></span> Processing...';

    try {
        const results = [];
        let totalPaid = 0;

        for (const [studentId, feeIds] of selectedFeeMap) {
            const student = getStudentById(studentId);
            if (!student) continue;

            const receiptNum = generateReceiptNumber(state.payments?.length || 0 + results.length + 1);

            // Get fees for this student
            const studentFees = feeIds
                .map(id => state.studentFees.find(f => f.id === id))
                .filter(f => f)
                .sort((a, b) => {
                    const dateA = a.due_date ? new Date(a.due_date) : new Date(0);
                    const dateB = b.due_date ? new Date(b.due_date) : new Date(0);
                    return dateA - dateB;
                });

            // Calculate total for this student
            let studentTotal = 0;
            for (const fee of studentFees) {
                studentTotal += Math.max(0, fee.amount - (fee.paid_amount || 0));
            }

            // Proportional allocation
            const proportion = Math.min(1, amount / totalFees);
            let studentAmount = Math.round(studentTotal * proportion / 100) * 100 || Math.min(studentTotal, amount);

            // Record payment
            const payment = await insert('payments', {
                student_id: studentId,
                amount: studentAmount,
                payment_date: date,
                payment_method: method,
                receipt_number: receiptNum,
                reference: ref,
                notes: notes || null,
                recorded_by: getCurrentUser()?.username || getCurrentUser()?.name || '',
                created_at: new Date().toISOString(),
            });

            if (!payment) continue;

            // Allocate to fees (FIFO)
            let remaining = studentAmount;
            const feeDetails = [];
            for (const fee of studentFees) {
                if (remaining <= 0) break;
                const feeRemaining = Math.max(0, fee.amount - (fee.paid_amount || 0));
                const allocation = Math.min(remaining, feeRemaining);
                if (allocation > 0) {
                    await update('student_fees', fee.id, {
                        paid_amount: (fee.paid_amount || 0) + allocation,
                        is_paid: (fee.paid_amount || 0) + allocation >= fee.amount,
                        updated_at: new Date().toISOString(),
                    });
                    const cat = state.feeCategories.find(c => c.id === fee.fee_category_id);
                    feeDetails.push({
                        name: cat?.name || 'Fee',
                        amount: fee.amount,
                        paid: (fee.paid_amount || 0) + allocation,
                        thisPayment: allocation,
                    });
                    remaining -= allocation;
                }
            }

            results.push({
                student,
                receiptNum,
                amount: studentAmount,
                fees: feeDetails,
            });

            totalPaid += studentAmount;
        }

        // Refresh state
        await refreshTable('payments');
        await refreshTable('student_fees');

        // Generate receipts based on option
        const school = state.schoolSettings || {};

        if (receiptOption === 'consolidated' && results.length > 1) {
            // Generate one consolidated receipt
            const allFees = results.flatMap(r => r.fees);
            const receiptData = {
                receiptNum: generateReceiptNumber(state.payments?.length || 0 + 1),
                studentName: `${results.length} students`,
                studentCode: 'BATCH',
                className: 'Multiple Classes',
                parentName: '—',
                amount: totalPaid,
                method: method,
                date: new Date(date).toLocaleDateString(),
                recordedBy: getCurrentUser() ? { role: getCurrentUser().role, name: getCurrentUser().name } : null,
                fees: allFees.map(f => ({
                    name: f.name,
                    amount: f.amount,
                    paid: f.paid,
                    thisPayment: f.thisPayment,
                })),
                schoolName: school.school_name || 'ECOLE LA FONTAINE',
                schoolAddress: school.school_address || 'Rubavu, Rwanda',
                logo: school.school_logo || '🏫',
            };
            await downloadReceiptPDF(receiptData);
            showToast(`✅ Batch payment of ${fmtCurrency(totalPaid)} recorded — Consolidated receipt downloaded`, 'success');
        } else {
            // Individual receipts
            for (const result of results) {
                const receiptData = {
                    receiptNum: result.receiptNum,
                    studentName: `${result.student.first_name} ${result.student.last_name}`,
                    studentCode: result.student.student_code || '—',
                    className: getClassById(result.student.class_id)?.name || '—',
                    parentName: result.student.guardian_name || '—',
                    amount: result.amount,
                    method: method,
                    date: new Date(date).toLocaleDateString(),
                    recordedBy: getCurrentUser() ? { role: getCurrentUser().role, name: getCurrentUser().name } : null,
                    fees: result.fees,
                    schoolName: school.school_name || 'ECOLE LA FONTAINE',
                    schoolAddress: school.school_address || 'Rubavu, Rwanda',
                    logo: school.school_logo || '🏫',
                };
                await downloadReceiptPDF(receiptData);
            }
            showToast(`✅ Batch payment of ${fmtCurrency(totalPaid)} recorded — ${results.length} receipts downloaded`, 'success');
        }

        await notifyAction('payment_recorded', {
            message: `Batch payment of ${fmtCurrency(totalPaid)} recorded for ${results.length} students`,
            entity_type: 'payments',
            batch: true,
        }, ['admin', 'accountant']);

        resetPaymentForm();

    } catch (error) {
        console.error('[Payment]', error);
        showToast('Payment failed: ' + error.message, 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalText;
    }
}

// ──────────────────────────────────────────────────────────────────────
// RECORD FAMILY PAYMENT
// ──────────────────────────────────────────────────────────────────────

async function recordFamilyPayment() {
    const familyId = document.getElementById('pay-family')?.value;
    if (!familyId) {
        showToast('Please select a family first', 'warning');
        return;
    }

    // Select all students in the family
    const familyStudents = (state.students || [])
        .filter(s => s.family_id == familyId && s.status === 'Active' && !s.is_deleted);

    if (!familyStudents.length) {
        showToast('No active students in this family', 'warning');
        return;
    }

    // Auto-select all students
    for (const s of familyStudents) {
        if (!selectedStudents.has(s.id)) {
            selectedStudents.set(s.id, { selected: true, fees: new Map() });
        } else {
            selectedStudents.get(s.id).selected = true;
        }
    }

    // Update UI
    document.querySelectorAll('.batch-student-cb').forEach(cb => {
        const id = parseInt(cb.value);
        if (familyStudents.some(s => s.id === id)) {
            cb.checked = true;
        }
    });
    updateBatchCount();
    loadFees();

    // Set receipt option to family
    document.querySelector('input[name="receipt-option"][value="family"]').checked = true;

    // Show family info
    const family = state.families.find(f => f.id == familyId);
    showToast(`👨‍👩‍👧 Family ${family?.family_code} — ${familyStudents.length} students selected. Enter amount and click Record.`, 'info', 4000);

    // Set family name in receipt preview
    updateReceiptPreview();
}

// ──────────────────────────────────────────────────────────────────────
// HELPER FUNCTIONS
// ──────────────────────────────────────────────────────────────────────

function showToast(message, type = 'info', duration = 3500) {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `<span class="toast-icon">${icons[type] || 'ℹ️'}</span><span class="toast-message">${esc(message)}</span>`;
    container.appendChild(toast);
    setTimeout(() => { toast.classList.add('hiding'); setTimeout(() => toast.remove(), 300); }, duration);
}

async function ensureStateLoaded() {
    if (!state.classes || !state.classes.length) {
        const fn = window.loadInitialData || (async () => {});
        await fn(false);
    }
}

async function refreshTable(table) {
    const getAll = window.getAll || (async () => []);
    if (table === 'payments') {
        state.payments = await getAll('payments');
    } else if (table === 'student_fees') {
        state.studentFees = await getAll('student_fees');
    }
}

// Export functions to window
window._onYearChange = onYearChange;
window._onTermChange = onTermChange;
window._onClassChange = onClassChange;
window._onFamilyChange = onFamilyChange;
window._onStudentChange = onStudentChange;
window._toggleBatchMode = toggleBatchMode;

// ──────────────────────────────────────────────────────────────────────
// FAMILY STUDENTS LOADER
// ──────────────────────────────────────────────────────────────────────

async function loadFamilyStudents() {
    const familyId = document.getElementById('family-select')?.value;
    if (!familyId) return;
    const state = window.state || {};
    const students = (state.students || []).filter(s => s.family_id == familyId && !s.is_deleted);
    const list = document.getElementById('family-students-list');
    if (!list) return;
    if (!students.length) { list.innerHTML = '<p class="empty">No students in this family</p>'; return; }
    list.innerHTML = students.map(s => `
        <div class="family-student-row">
            <span>${s.first_name} ${s.last_name}</span>
            <button class="btn btn-sm btn-primary" onclick="window._selectStudent(${s.id})">Select</button>
        </div>
    `).join('');
}

window._loadFamilyStudents = loadFamilyStudents;
window._selectAllStudents = selectAllStudents;
window._deselectAllStudents = deselectAllStudents;
window._selectAllFees = selectAllFees;
window._deselectAllFees = deselectAllFees;
window._toggleFee = toggleFee;
window._updateReceiptPreview = updateReceiptPreview;
window._toggleReceiptOption = toggleReceiptOption;
window._resetPaymentForm = resetPaymentForm;
window._recordPayment = recordPayment;
window._recordFamilyPayment = recordFamilyPayment;