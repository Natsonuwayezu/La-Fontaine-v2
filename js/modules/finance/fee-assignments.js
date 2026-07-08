
import { ensureStateLoaded } from '../../core/boot.js';const state = window.state || {}; // state alias — resolves to global state
// js/modules/fee-assignments.js
// Fee Assignments Module - Assign fee categories to classes and students


async function renderFeeAssignments(container) {
    await ensureStateLoaded();

    const user = state.currentUser;
    if (user?.role === 'teacher') {
        container.innerHTML = '<div class="alert alert-danger">Access denied. Teachers cannot manage fee assignments.</div>';
        return;
    }

    const classes = state.classes.filter(c => c.is_active !== false);
    const categories = state.feeCategories.filter(c => c.is_active !== false);
    const terms = state.terms.filter(t => t.academic_year_id === state.currentAcadYear?.id);
    const currentTermId = state.currentTerm?.id;

    container.innerHTML = `
        <div class="dash-card">
            <div class="dash-card-header">
                <span class="dash-card-title">🏷️ Fee Assignments</span>
                <div class="btn-group">
                    <button class="btn btn-sm btn-primary" onclick="window.openAssignFeeModal()">➕ Assign Fee</button>
                    <button class="btn btn-sm btn-outline" onclick="window.exportFeeAssignments()">📥 Export</button>
                </div>
            </div>
            <div class="dash-card-body">
                <div class="filters-bar">
                    <select id="assign-class-filter" class="form-control" style="width:180px" onchange="window.renderFeeAssignmentsTable()">
                        <option value="">All Classes</option>
                        ${classes.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}
                    </select>
                    <select id="assign-term-filter" class="form-control" style="width:150px" onchange="window.renderFeeAssignmentsTable()">
                        <option value="">All Terms</option>
                        ${terms.map(t => `<option value="${t.id}" ${t.id === currentTermId ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}
                    </select>
                    <select id="assign-status-filter" class="form-control" style="width:130px" onchange="window.renderFeeAssignmentsTable()">
                        <option value="">All Status</option>
                        <option value="active">Active</option>
                        <option value="waived">Waived</option>
                        <option value="paid">Paid</option>
                    </select>
                    <span class="result-count" id="assign-count"></span>
                </div>
                
                <div class="table-wrapper" id="fee-assignments-table">
                    <div class="loading-container"><div class="spinner"></div><p>Loading fee assignments...</p></div>
                </div>
            </div>
        </div>
        
        <div class="dash-card" style="margin-top:20px">
            <div class="dash-card-header">
                <span class="dash-card-title">📊 Assignment Statistics</span>
            </div>
            <div class="dash-card-body">
                <div id="assign-stats-container" class="stats-grid" style="grid-template-columns:repeat(4,1fr)">
                    <div class="loading-container"><div class="spinner"></div><p>Loading stats...</p></div>
                </div>
            </div>
        </div>
    `;

    window.renderFeeAssignmentsTable = renderFeeAssignmentsTable;
    window.openAssignFeeModal = openAssignFeeModal;
    window.exportFeeAssignments = exportFeeAssignments;
    window.editFeeAssignment = editFeeAssignment;
    window.deleteFeeAssignment = deleteFeeAssignment;
    window.bulkAssignToClass = bulkAssignToClass;

    await renderFeeAssignmentsTable();
    await renderAssignmentStats();
}

async function renderFeeAssignmentsTable() {
    const classFilter = document.getElementById('assign-class-filter')?.value;
    const termFilter = document.getElementById('assign-term-filter')?.value;
    const statusFilter = document.getElementById('assign-status-filter')?.value;
    const container = document.getElementById('fee-assignments-table');

    if (!container) return;

    let assignments = [...state.studentFees];

    if (classFilter) {
        const studentIds = state.students.filter(s => s.class_id == classFilter).map(s => s.id);
        assignments = assignments.filter(a => studentIds.includes(a.student_id));
    }
    if (termFilter) assignments = assignments.filter(a => a.term_id == termFilter);
    if (statusFilter === 'active') assignments = assignments.filter(a => !a.is_waived && !a.is_paid);
    if (statusFilter === 'waived') assignments = assignments.filter(a => a.is_waived);
    if (statusFilter === 'paid') assignments = assignments.filter(a => a.is_paid);

    // Group by student for better display
    const groupedByStudent = new Map();
    for (const assignment of assignments) {
        if (!groupedByStudent.has(assignment.student_id)) {
            groupedByStudent.set(assignment.student_id, []);
        }
        groupedByStudent.get(assignment.student_id).push(assignment);
    }

    const countSpan = document.getElementById('assign-count');
    if (countSpan) countSpan.textContent = `${assignments.length} fee assignment${assignments.length !== 1 ? 's' : ''}`;

    if (assignments.length === 0) {
        container.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-muted)">No fee assignments found</div>';
        return;
    }

    let html = `
        <table class="data-table">
            <thead>
                <tr>
                    <th>Student</th>
                    <th>Class</th>
                    <th>Fee Category</th>
                    <th style="text-align:right">Amount</th>
                    <th style="text-align:right">Paid</th>
                    <th style="text-align:right">Remaining</th>
                    <th>Due Date</th>
                    <th>Status</th>
                    <th>Actions</th>
                </tr>
            </thead>
            <tbody>
    `;

    for (const [studentId, studentAssignments] of groupedByStudent) {
        const student = getStudentById(studentId);
        const cls = getClassById(student?.class_id);

        for (const assignment of studentAssignments) {
            const category = state.feeCategories.find(c => c.id === assignment.fee_category_id);
            const remaining = assignment.amount - (assignment.paid_amount || 0);
            const isOverdue = assignment.due_date && new Date(assignment.due_date) < new Date() && !assignment.is_paid;

            let statusBadge = '';
            if (assignment.is_waived) statusBadge = '<span class="badge badge-success">✅ Waived</span>';
            else if (assignment.is_paid) statusBadge = '<span class="badge badge-success">✅ Paid</span>';
            else if (remaining <= 0) statusBadge = '<span class="badge badge-success">✅ Settled</span>';
            else if (remaining > 0 && (assignment.paid_amount || 0) > 0) statusBadge = '<span class="badge badge-warning">🟡 Partial</span>';
            else statusBadge = '<span class="badge badge-danger">🔴 Due</span>';

            html += `
                <tr>
                    <td><strong>${esc(student?.first_name)} ${esc(student?.last_name)}</strong><br><small>${esc(student?.student_code || '')}</small></span>
                    <td>${esc(cls?.name || '—')}</span>
                    <td>${esc(category?.name || 'Unknown')}</span>
                    <td style="text-align:right">${fmtCurrency(assignment.amount)}</span>
                    <td style="text-align:right">${fmtCurrency(assignment.paid_amount || 0)}</span>
                    <td style="text-align:right; ${remaining > 0 ? 'color:var(--danger); font-weight:600' : ''}">${fmtCurrency(remaining)}</span>
                    <td style="${isOverdue ? 'color:var(--danger)' : ''}">${fmtDate(assignment.due_date)} ${isOverdue ? '🔴' : ''}</span>
                    <td style="text-align:center">${statusBadge}</span>
                    <td style="text-align:center">
                        <div class="btn-group" style="gap:4px; justify-content:center">
                            <button class="btn btn-sm btn-outline" onclick="window.editFeeAssignment(${assignment.id})">✏️</button>
                            <button class="btn btn-sm btn-danger" onclick="window.deleteFeeAssignment(${assignment.id})">🗑️</button>
                        </div>
                    </span>
                </tr>
            `;
        }
    }

    html += `</tbody></table>`;
    container.innerHTML = html;
}

async function renderAssignmentStats() {
    const container = document.getElementById('assign-stats-container');
    if (!container) return;

    const totalAssignments = state.studentFees.filter(f => !f.is_credit).length;
    const totalAmount = state.studentFees.filter(f => !f.is_credit).reduce((sum, f) => sum + f.amount, 0);
    const totalPaid = state.studentFees.filter(f => !f.is_credit).reduce((sum, f) => sum + (f.paid_amount || 0), 0);
    const waivedCount = state.studentFees.filter(f => f.is_waived).length;
    const waivedAmount = state.studentFees.filter(f => f.is_waived).reduce((sum, f) => sum + f.amount, 0);
    const outstanding = totalAmount - totalPaid;

    container.innerHTML = `
        <div class="stat-card">
            <div class="stat-icon">📋</div>
            <div class="stat-value">${totalAssignments}</div>
            <div class="stat-label">Total Assignments</div>
        </div>
        <div class="stat-card">
            <div class="stat-icon">💰</div>
            <div class="stat-value">${fmtCurrency(totalAmount)}</div>
            <div class="stat-label">Total Amount</div>
        </div>
        <div class="stat-card">
            <div class="stat-icon">✅</div>
            <div class="stat-value">${fmtCurrency(totalPaid)}</div>
            <div class="stat-label">Total Paid</div>
            <div class="stat-trend up">${totalAmount > 0 ? ((totalPaid / totalAmount) * 100).toFixed(1) : 0}%</div>
        </div>
        <div class="stat-card">
            <div class="stat-icon">🎁</div>
            <div class="stat-value">${fmtCurrency(waivedAmount)}</div>
            <div class="stat-label">Waived (${waivedCount})</div>
        </div>
    `;
}

function openAssignFeeModal() {
    const classes = state.classes.filter(c => c.is_active !== false);
    const categories = state.feeCategories.filter(c => c.is_active !== false);
    const terms = state.terms.filter(t => t.academic_year_id === state.currentAcadYear?.id);

    showModal(`
        <div class="modal-overlay" id="assign-fee-modal">
            <div class="modal" onclick="event.stopPropagation()" style="max-width: 550px;">
                <div class="modal-header">
                    <h3>🏷️ Assign Fee</h3>
                    <button class="modal-close" onclick="closeModal('assign-fee-modal')">✕</button>
                </div>
                <div class="modal-body">
                    <div class="form-grid">
                        <div class="form-group full">
                            <label>Assignment Type</label>
                            <select id="assign-type" class="form-control" onchange="window.toggleAssignType()">
                                <option value="class">📚 Assign to Entire Class</option>
                                <option value="student">👤 Assign to Specific Student</option>
                                <option value="family">🏠 Assign to Family</option>
                            </select>
                        </div>
                        <div class="form-group full" id="assign-class-group">
                            <label>Select Class</label>
                            <select id="assign-class" class="form-control">
                                ${classes.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}
                            </select>
                        </div>
                        <div class="form-group full" id="assign-student-group" style="display:none">
                            <label>Select Student</label>
                            <select id="assign-student" class="form-control">
                                ${state.students.filter(s => s.status === 'Active').map(s => `<option value="${s.id}">${esc(s.first_name)} ${esc(s.last_name)} (${esc(s.student_code || '')})</option>`).join('')}
                            </select>
                        </div>
                        <div class="form-group full" id="assign-family-group" style="display:none">
                            <label>Select Family</label>
                            <select id="assign-family" class="form-control">
                                ${state.families.map(f => `<option value="${f.id}">${esc(f.family_code)} - ${esc(f.guardian_name || 'No guardian')}</option>`).join('')}
                            </select>
                        </div>
                        <div class="form-group full">
                            <label>Fee Category</label>
                            <select id="assign-category" class="form-control">
                                ${categories.map(c => `<option value="${c.id}">${esc(c.name)} (${fmtCurrency(c.amount || 0)} default)</option>`).join('')}
                            </select>
                        </div>
                        <div class="form-group">
                            <label>Amount Override (RWF)</label>
                            <input type="number" id="assign-amount" class="form-control" placeholder="Leave empty for default" min="0">
                        </div>
                        <div class="form-group">
                            <label>Term</label>
                            <select id="assign-term" class="form-control">
                                ${terms.map(t => `<option value="${t.id}" ${t.id === state.currentTerm?.id ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}
                            </select>
                        </div>
                        <div class="form-group">
                            <label>Due Date</label>
                            <input type="date" id="assign-due" class="form-control">
                        </div>
                        <div class="form-group full">
                            <label>Notes</label>
                            <textarea id="assign-notes" class="form-control" rows="2" placeholder="Optional notes"></textarea>
                        </div>
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-outline" onclick="closeModal('assign-fee-modal')">Cancel</button>
                    <button class="btn btn-primary" onclick="window.submitFeeAssignment()">✅ Assign Fee</button>
                </div>
            </div>
        </div>
    `);

    window.toggleAssignType = toggleAssignType;
    window.submitFeeAssignment = submitFeeAssignment;
}

function toggleAssignType() {
    const type = document.getElementById('assign-type')?.value;
    const classGroup = document.getElementById('assign-class-group');
    const studentGroup = document.getElementById('assign-student-group');
    const familyGroup = document.getElementById('assign-family-group');

    if (classGroup) classGroup.style.display = type === 'class' ? 'block' : 'none';
    if (studentGroup) studentGroup.style.display = type === 'student' ? 'block' : 'none';
    if (familyGroup) familyGroup.style.display = type === 'family' ? 'block' : 'none';
}

async function submitFeeAssignment() {
    const assignType = document.getElementById('assign-type')?.value;
    const classId = document.getElementById('assign-class')?.value;
    const studentId = document.getElementById('assign-student')?.value;
    const familyId = document.getElementById('assign-family')?.value;
    const categoryId = document.getElementById('assign-category')?.value;
    const amountOverride = parseFloat(document.getElementById('assign-amount')?.value);
    const termId = document.getElementById('assign-term')?.value;
    const dueDate = document.getElementById('assign-due')?.value;
    const notes = document.getElementById('assign-notes')?.value;

    if (!categoryId) {
        showToast('Please select a fee category', 'warning');
        return;
    }

    const category = state.feeCategories.find(c => c.id == categoryId);
    let amount = amountOverride || category?.amount || 0;

    if (amount <= 0) {
        showToast('Fee amount must be greater than 0', 'warning');
        return;
    }

    let targetStudents = [];

    if (assignType === 'class' && classId) {
        targetStudents = state.students.filter(s => s.class_id == classId && s.status === 'Active');
    } else if (assignType === 'student' && studentId) {
        const student = getStudentById(studentId);
        if (student) targetStudents = [student];
    } else if (assignType === 'family' && familyId) {
        targetStudents = state.students.filter(s => s.family_id == familyId && s.status === 'Active');
    }

    if (targetStudents.length === 0) {
        showToast('No students found for the selected target', 'warning');
        return;
    }

    if (!await confirmDialog(`Assign ${category?.name} (${fmtCurrency(amount)}) to ${targetStudents.length} student(s)?`)) return;

    let assigned = 0;
    let skipped = 0;

    for (const student of targetStudents) {
        const existing = state.studentFees.find(f =>
            f.student_id === student.id && f.fee_category_id == categoryId && f.term_id == termId && !f.is_waived
        );

        if (existing) {
            skipped++;
            continue;
        }

        await insert('student_fees', {
            student_id: student.id,
            fee_category_id: parseInt(categoryId),
            term_id: parseInt(termId),
            academic_year_id: state.currentAcadYear?.id,
            amount: amount,
            paid_amount: 0,
            is_paid: false,
            is_waived: false,
            due_date: dueDate || null,
            notes: notes || null,
            created_at: new Date().toISOString()
        });
        assigned++;
    }

    await refreshTable('student_fees');
    closeModal('assign-fee-modal');
    showToast(`✅ Assigned fee to ${assigned} student(s) (${skipped} already had it)`, 'success');
    await renderFeeAssignmentsTable();
    await renderAssignmentStats();
}

async function editFeeAssignment(assignmentId) {
    const assignment = state.studentFees.find(f => f.id === assignmentId);
    if (!assignment) return;

    const student = getStudentById(assignment.student_id);
    const category = state.feeCategories.find(c => c.id === assignment.fee_category_id);

    showModal(`
        <div class="modal-overlay">
            <div class="modal" style="max-width: 500px;">
                <div class="modal-header">
                    <h3>✏️ Edit Fee Assignment</h3>
                    <button class="modal-close" onclick="closeModal()">✕</button>
                </div>
                <div class="modal-body">
                    <div class="form-grid">
                        <div class="form-group full">
                            <label>Student</label>
                            <input type="text" readonly value="${esc(student?.first_name)} ${esc(student?.last_name)}" class="form-control">
                        </div>
                        <div class="form-group full">
                            <label>Fee Category</label>
                            <input type="text" readonly value="${esc(category?.name)}" class="form-control">
                        </div>
                        <div class="form-group">
                            <label>Amount (RWF)</label>
                            <input type="number" id="edit-assign-amount" value="${assignment.amount}" class="form-control" min="0" step="1000">
                        </div>
                        <div class="form-group">
                            <label>Paid Amount (RWF)</label>
                            <input type="number" id="edit-assign-paid" value="${assignment.paid_amount || 0}" class="form-control" min="0" step="1000">
                        </div>
                        <div class="form-group">
                            <label>Due Date</label>
                            <input type="date" id="edit-assign-due" value="${assignment.due_date || ''}" class="form-control">
                        </div>
                        <div class="form-group full">
                            <label>Notes</label>
                            <textarea id="edit-assign-notes" class="form-control" rows="2">${esc(assignment.notes || '')}</textarea>
                        </div>
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-outline" onclick="closeModal()">Cancel</button>
                    <button class="btn btn-primary" onclick="window.updateFeeAssignment(${assignmentId})">Save Changes</button>
                </div>
            </div>
        </div>
    `);

    window.updateFeeAssignment = async (assignmentId) => {
        const amount = parseFloat(document.getElementById('edit-assign-amount')?.value);
        const paidAmount = parseFloat(document.getElementById('edit-assign-paid')?.value);
        const dueDate = document.getElementById('edit-assign-due')?.value;
        const notes = document.getElementById('edit-assign-notes')?.value;

        await update('student_fees', assignmentId, {
            amount: amount,
            paid_amount: paidAmount,
            is_paid: paidAmount >= amount,
            due_date: dueDate || null,
            notes: notes || null,
            updated_at: new Date().toISOString()
        });

        await refreshTable('student_fees');
        closeModal();
        showToast('✅ Fee assignment updated', 'success');
        await renderFeeAssignmentsTable();
        await renderAssignmentStats();
    };
}

async function deleteFeeAssignment(assignmentId) {
    if (!await confirmDialog('Remove this fee assignment? This action cannot be undone.')) return;
    await remove('student_fees', assignmentId);
    await refreshTable('student_fees');
    showToast('✅ Fee assignment removed', 'success');
    await renderFeeAssignmentsTable();
    await renderAssignmentStats();
}

async function bulkAssignToClass() {
    const classId = document.getElementById('assign-class-filter')?.value;
    if (!classId) {
        showToast('Please select a class first', 'warning');
        return;
    }

    const categories = state.feeCategories.filter(c => c.is_active !== false);

    showModal(`
        <div class="modal-overlay">
            <div class="modal" style="max-width: 500px;">
                <div class="modal-header">
                    <h3>📦 Bulk Assign to Class</h3>
                    <button class="modal-close" onclick="closeModal()">✕</button>
                </div>
                <div class="modal-body">
                    <div class="form-grid">
                        <div class="form-group full">
                            <label>Fee Category</label>
                            <select id="bulk-assign-category" class="form-control">
                                ${categories.map(c => `<option value="${c.id}">${esc(c.name)} (${fmtCurrency(c.amount || 0)})</option>`).join('')}
                            </select>
                        </div>
                        <div class="form-group">
                            <label>Amount Override (RWF)</label>
                            <input type="number" id="bulk-assign-amount" class="form-control" placeholder="Use default" min="0">
                        </div>
                        <div class="form-group">
                            <label>Term</label>
                            <select id="bulk-assign-term" class="form-control">
                                ${state.terms.map(t => `<option value="${t.id}">${esc(t.name)}</option>`).join('')}
                            </select>
                        </div>
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-outline" onclick="closeModal()">Cancel</button>
                    <button class="btn btn-primary" onclick="window.executeBulkAssign(${classId})">✅ Assign to Class</button>
                </div>
            </div>
        </div>
    `);

    window.executeBulkAssign = async (classId) => {
        const categoryId = document.getElementById('bulk-assign-category')?.value;
        const amountOverride = parseFloat(document.getElementById('bulk-assign-amount')?.value);
        const termId = document.getElementById('bulk-assign-term')?.value;

        const category = state.feeCategories.find(c => c.id == categoryId);
        const amount = amountOverride || category?.amount || 0;

        const students = state.students.filter(s => s.class_id == classId && s.status === 'Active');

        let assigned = 0;
        for (const student of students) {
            const existing = state.studentFees.find(f =>
                f.student_id === student.id && f.fee_category_id == categoryId && f.term_id == termId
            );
            if (!existing) {
                await insert('student_fees', {
                    student_id: student.id,
                    fee_category_id: parseInt(categoryId),
                    term_id: parseInt(termId),
                    academic_year_id: state.currentAcadYear?.id,
                    amount: amount,
                    paid_amount: 0,
                    is_paid: false,
                    is_waived: false,
                    created_at: new Date().toISOString()
                });
                assigned++;
            }
        }

        await refreshTable('student_fees');
        closeModal();
        showToast(`✅ Assigned fee to ${assigned} student(s) in class`, 'success');
        await renderFeeAssignmentsTable();
    };
}

function exportFeeAssignments() {
    const data = state.studentFees.filter(f => !f.is_credit).map(f => {
        const student = getStudentById(f.student_id);
        const category = state.feeCategories.find(c => c.id === f.fee_category_id);
        const cls = student ? getClassById(student.class_id) : null;

        return {
            'Student': student ? `${student.first_name} ${student.last_name}` : '—',
            'Student Code': student?.student_code || '',
            'Class': cls?.name || '',
            'Fee Category': category?.name || '—',
            'Amount (RWF)': f.amount,
            'Paid (RWF)': f.paid_amount || 0,
            'Remaining (RWF)': f.amount - (f.paid_amount || 0),
            'Due Date': fmtDate(f.due_date),
            'Status': f.is_waived ? 'Waived' : (f.is_paid ? 'Paid' : (f.paid_amount > 0 ? 'Partial' : 'Due')),
            'Term': state.terms.find(t => t.id === f.term_id)?.name || '',
            'Notes': f.notes || ''
        };
    });

    exportToExcel(data, `Fee_Assignments_${new Date().toISOString().split('T')[0]}`);
    showToast('✅ Fee assignments exported', 'success');
}