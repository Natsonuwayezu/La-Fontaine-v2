/**
 * ECOLE LA FONTAINE — Bulk Export Module
 * Export students, marks, payments, attendance, fee structure, teachers, subjects, families
 * Last updated: 2026-07-03
 * 
 * CHANGES:
 * - Added academic year filter for all exports
 * - Added term filter for year-specific exports
 * - Export data is now filtered by selected year/term
 * - Added year/term labels in export preview
 * - Export history includes year/term info
 */

import {
    state,
    getCurrentUser,
    getClassById,
    getSubjectById,
    getCurrentAcademicYear,
    getActiveAcademicYearId,
    getTermById,
    getTermsByYear,
    getYearData
} from '../../core/state.js';
import { esc, fmtDate, fmtCurrency } from '../../core/utils.js';
import { getGrade } from '../../core/formulas.js';
import { exportToExcel } from '../../core/utils.js';
import { showToast } from '../../ui/toast.js';

// ──────────────────────────────────────────────────────────────────────
// STATE
// ──────────────────────────────────────────────────────────────────────

let selectedYearId = null;

// ──────────────────────────────────────────────────────────────────────
// MAIN RENDER FUNCTION
// ──────────────────────────────────────────────────────────────────────

export async function renderBulkExport(container) {
    if (!container) return;

    const user = getCurrentUser();
    if (user?.role !== 'admin') {
        container.innerHTML = '<div class="alert alert-danger">Access denied. Admin privileges required.</div>';
        return;
    }

    await ensureStateLoaded();

    const currentYear = getCurrentAcademicYear();
    const years = (state.academicYears || []).sort((a, b) => b.id - a.id);
    const terms = getTermsByYear(currentYear?.id);

    // Default to current year
    if (!selectedYearId) {
        selectedYearId = currentYear?.id || null;
    }

    container.innerHTML = `
        <div class="dash-card">
            <div class="dash-card-header" style="flex-wrap:wrap;gap:8px;">
                <span class="dash-card-title">📥 Bulk Export</span>
                <div class="btn-group" style="flex-wrap:wrap;gap:6px;">
                    <button class="btn btn-sm btn-primary" onclick="window._executeBulkExport()">📤 Export Now</button>
                    <button class="btn btn-sm btn-outline" onclick="window._resetBulkExport()">🔄 Reset</button>
                </div>
            </div>
            <div class="dash-card-body">
                <div class="form-grid">
                    <div class="form-group">
                        <label>Academic Year *</label>
                        <select id="export-year" class="form-control" onchange="window._onExportYearChange()">
                            ${years.map(y => `
                                <option value="${y.id}" ${y.id === selectedYearId ? 'selected' : ''}>
                                    ${esc(y.name)} ${y.id === currentYear?.id ? '🟢' : ''} ${y.is_active ? '✅' : '🔒'}
                                </option>
                            `).join('')}
                        </select>
                    </div>
                    <div class="form-group" id="export-term-group">
                        <label>Term</label>
                        <select id="export-term" class="form-control">
                            <option value="">All Terms</option>
                            ${terms.map(t => `
                                <option value="${t.id}" ${t.id === state.currentTerm?.id ? 'selected' : ''}>
                                    ${esc(t.name)}
                                </option>
                            `).join('')}
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Export Type *</label>
                        <select id="export-type" class="form-control" onchange="window._updateExportOptions()">
                            <option value="students">🎓 Students</option>
                            <option value="marks">📝 Marks</option>
                            <option value="payments">💰 Payments</option>
                            <option value="attendance">📋 Attendance</option>
                            <option value="fee_structure">🏷️ Fee Structure</option>
                            <option value="teachers">👨‍🏫 Teachers</option>
                            <option value="subjects">📖 Subjects</option>
                            <option value="families">👨‍👩‍👧 Families</option>
                            <option value="class_register">📊 Class Register</option>
                        </select>
                    </div>
                    <div class="form-group" id="export-class-group">
                        <label>Class</label>
                        <select id="export-class" class="form-control">
                            <option value="">All Classes</option>
                            ${(state.classes || []).filter(c => c.is_active !== false).map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Format</label>
                        <select id="export-format" class="form-control">
                            <option value="excel">Excel (.xlsx)</option>
                            <option value="csv">CSV (.csv)</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Include Headers</label>
                        <select id="export-headers" class="form-control">
                            <option value="true">Yes</option>
                            <option value="false">No</option>
                        </select>
                    </div>
                </div>

                <div id="export-preview" style="margin-top:20px;display:none;">
                    <div class="alert alert-info" id="export-preview-info"></div>
                </div>

                <div id="export-history" style="margin-top:20px;">
                    <h4 style="margin-bottom:12px;">📋 Export History</h4>
                    <div id="export-history-list" class="table-wrapper">
                        <div class="loading-container"><div class="spinner"></div><p>Loading history...</p></div>
                    </div>
                </div>
            </div>
        </div>
    `;

    window._executeBulkExport = executeBulkExport;
    window._updateExportOptions = updateExportOptions;
    window._resetBulkExport = resetBulkExport;
    window._onExportYearChange = onExportYearChange;

    updateExportOptions();
    renderExportHistory();
}

// ──────────────────────────────────────────────────────────────────────
// ON EXPORT YEAR CHANGE
// ──────────────────────────────────────────────────────────────────────

function onExportYearChange() {
    const yearId = document.getElementById('export-year')?.value;
    if (yearId) {
        selectedYearId = parseInt(yearId);

        // Update term dropdown for this year
        const terms = getTermsByYear(selectedYearId);
        const termSelect = document.getElementById('export-term');
        if (termSelect) {
            termSelect.innerHTML = `
                <option value="">All Terms</option>
                ${terms.map(t => `
                    <option value="${t.id}">${esc(t.name)}</option>
                `).join('')}
            `;
        }

        updateExportOptions();
    }
}

// ──────────────────────────────────────────────────────────────────────
// UPDATE EXPORT OPTIONS
// ──────────────────────────────────────────────────────────────────────

function updateExportOptions() {
    const type = document.getElementById('export-type')?.value;
    const classGroup = document.getElementById('export-class-group');
    const termGroup = document.getElementById('export-term-group');

    if (classGroup) {
        classGroup.style.display = ['students', 'marks', 'payments', 'attendance', 'class_register'].includes(type) ? 'block' : 'none';
    }
    if (termGroup) {
        termGroup.style.display = ['marks', 'payments', 'attendance', 'class_register'].includes(type) ? 'block' : 'none';
    }

    // Update preview
    const preview = document.getElementById('export-preview');
    if (preview) {
        const year = state.academicYears.find(y => y.id === selectedYearId);
        const typeLabels = {
            students: 'Students',
            marks: 'Marks',
            payments: 'Payments',
            attendance: 'Attendance',
            fee_structure: 'Fee Structure',
            teachers: 'Teachers',
            subjects: 'Subjects',
            families: 'Families',
            class_register: 'Class Register',
        };
        const count = getExportCount(type);
        preview.style.display = 'block';
        document.getElementById('export-preview-info').textContent =
            `${typeLabels[type] || type}: ${count} records available for export (${year?.name || 'Current Year'})`;
    }
}

// ──────────────────────────────────────────────────────────────────────
// GET EXPORT COUNT
// ──────────────────────────────────────────────────────────────────────

function getExportCount(type) {
    const yearId = document.getElementById('export-year')?.value;
    const classId = document.getElementById('export-class')?.value;
    const termId = document.getElementById('export-term')?.value;
    const year = yearId || selectedYearId || state.currentAcadYear?.id;

    if (type === 'students') {
        let students = state.students || [];
        if (year) students = students.filter(s => s.academic_year_id == year);
        if (classId) students = students.filter(s => s.class_id == classId);
        return students.length;
    }
    if (type === 'marks') {
        let marks = state.marks || [];
        if (year) marks = marks.filter(m => m.academic_year_id == year && !m.is_archived);
        if (classId) {
            const assessments = (state.assessments || []).filter(a => a.class_id == classId);
            const ids = new Set(assessments.map(a => a.id));
            marks = marks.filter(m => ids.has(m.assessment_id));
        }
        if (termId) {
            const assessments = (state.assessments || []).filter(a => a.term_id == termId);
            const ids = new Set(assessments.map(a => a.id));
            marks = marks.filter(m => ids.has(m.assessment_id));
        }
        return marks.length;
    }
    if (type === 'payments') {
        let payments = state.payments || [];
        if (year) payments = payments.filter(p => p.academic_year_id == year);
        if (classId) {
            const students = (state.students || []).filter(s => s.class_id == classId);
            const ids = new Set(students.map(s => s.id));
            payments = payments.filter(p => ids.has(p.student_id));
        }
        if (termId) payments = payments.filter(p => p.term_id == termId);
        return payments.length;
    }
    if (type === 'teachers') return (state.teachers || []).length;
    if (type === 'subjects') return (state.subjects || []).length;
    if (type === 'families') return (state.families || []).length;
    if (type === 'fee_structure') return (state.feeCategories || []).length;
    if (type === 'attendance') {
        let attendance = state.attendance || [];
        if (year) {
            const terms = getTermsByYear(year);
            const termIds = terms.map(t => t.id);
            attendance = attendance.filter(a => termIds.includes(a.term_id));
        }
        if (classId) attendance = attendance.filter(a => a.class_id == classId);
        if (termId) attendance = attendance.filter(a => a.term_id == termId);
        return attendance.length;
    }

    return 0;
}

// ──────────────────────────────────────────────────────────────────────
// EXECUTE BULK EXPORT
// ──────────────────────────────────────────────────────────────────────

function executeBulkExport() {
    const type = document.getElementById('export-type')?.value || 'students';
    const format = document.getElementById('export-format')?.value || 'excel';
    const includeHeaders = document.getElementById('export-headers')?.value === 'true';
    const yearId = document.getElementById('export-year')?.value || selectedYearId;
    const classId = document.getElementById('export-class')?.value;
    const termId = document.getElementById('export-term')?.value;

    const year = state.academicYears.find(y => y.id == yearId);
    const term = getTermById(termId);

    let data = [];
    let filename = `${type}_Export_${year?.name || 'Current'}`;

    switch (type) {
        case 'students':
            data = exportStudents(classId, yearId);
            break;
        case 'marks':
            data = exportMarks(classId, yearId, termId);
            break;
        case 'payments':
            data = exportPayments(classId, yearId, termId);
            break;
        case 'attendance':
            data = exportAttendance(classId, yearId, termId);
            break;
        case 'fee_structure':
            data = exportFeeStructure(yearId);
            break;
        case 'teachers':
            data = exportTeachers();
            break;
        case 'subjects':
            data = exportSubjects();
            break;
        case 'families':
            data = exportFamilies();
            break;
        case 'class_register':
            data = exportClassRegister(classId, yearId, termId);
            break;
        default:
            showToast('Invalid export type', 'error');
            return;
    }

    if (!data || !data.length) {
        showToast('No data to export for the selected filters', 'warning');
        return;
    }

    // Save to history
    saveExportHistory(type, data.length, yearId, termId);

    // Export
    const yearLabel = year?.name || 'Current';
    const filenameFull = `${filename}_${new Date().toISOString().split('T')[0]}`;

    if (format === 'excel') {
        exportToExcel(data, filenameFull);
    } else if (format === 'csv') {
        if (typeof XLSX !== 'undefined') {
            const ws = XLSX.utils.json_to_sheet(data);
            const csv = XLSX.utils.sheet_to_csv(ws);
            const blob = new Blob([csv], { type: 'text/csv' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${filenameFull}.csv`;
            a.click();
            URL.revokeObjectURL(url);
        } else {
            // Fallback: manual CSV
            const headers = Object.keys(data[0]);
            const rows = data.map(row => headers.map(h => `"${String(row[h] || '').replace(/"/g, '""')}"`).join(','));
            const csv = [headers.join(','), ...rows].join('\n');
            const blob = new Blob([csv], { type: 'text/csv' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${filenameFull}.csv`;
            a.click();
            URL.revokeObjectURL(url);
        }
    }

    const termLabel = term ? ` (${term.name})` : '';
    showToast(`✅ Exported ${data.length} records from ${yearLabel}${termLabel}`, 'success');
    renderExportHistory();
}

// ──────────────────────────────────────────────────────────────────────
// EXPORT STUDENTS
// ──────────────────────────────────────────────────────────────────────

function exportStudents(classId, yearId) {
    let students = state.students || [];
    if (yearId) students = students.filter(s => s.academic_year_id == yearId);
    if (classId) students = students.filter(s => s.class_id == classId);

    const year = state.academicYears.find(y => y.id == yearId);

    return students.map(s => {
        const cls = getClassById(s.class_id);
        return {
            'Student Code': s.student_code || '',
            'First Name': s.first_name || '',
            'Last Name': s.last_name || '',
            'Class': cls?.name || '',
            'Gender': s.gender || '',
            'Date of Birth': s.date_of_birth || '',
            'Guardian Name': s.guardian_name || '',
            'Guardian Phone': s.guardian_phone || '',
            'Guardian Email': s.guardian_email || '',
            'Address': s.address || '',
            'Status': s.status || 'Active',
            'Academic Year': year?.name || '',
            'Enrollment Date': fmtDate(s.enrollment_date),
            'Family ID': s.family_id || '',
        };
    });
}

// ──────────────────────────────────────────────────────────────────────
// EXPORT MARKS
// ──────────────────────────────────────────────────────────────────────

function exportMarks(classId, yearId, termId) {
    let assessments = state.assessments || [];
    if (classId) assessments = assessments.filter(a => a.class_id == classId);
    if (yearId) assessments = assessments.filter(a => a.academic_year_id == yearId);
    if (termId) assessments = assessments.filter(a => a.term_id == termId);

    const ids = new Set(assessments.map(a => a.id));
    let marks = (state.marks || []).filter(m => ids.has(m.assessment_id) && !m.is_archived);

    const year = state.academicYears.find(y => y.id == yearId);
    const term = getTermById(termId);

    return marks.map(m => {
        const assessment = assessments.find(a => a.id === m.assessment_id);
        const student = state.students.find(s => s.id === m.student_id);
        const subject = getSubjectById(assessment?.subject_id);
        const cls = getClassById(assessment?.class_id);
        const pct = assessment && assessment.max_marks > 0 ? (m.score / assessment.max_marks) * 100 : null;
        return {
            'Student Code': student?.student_code || '',
            'Student Name': student ? `${student.first_name} ${student.last_name}` : '',
            'Class': cls?.name || '',
            'Subject': subject?.name || '',
            'Assessment': assessment?.assessment_name || '',
            'Score': m.score ?? '',
            'Max Marks': assessment?.max_marks || '',
            'Percentage': pct !== null ? pct.toFixed(1) + '%' : '',
            'Grade': pct !== null ? getGrade(pct) : '',
            'Academic Year': year?.name || '',
            'Term': term?.name || '',
            'Date': fmtDate(assessment?.date || assessment?.created_at),
        };
    });
}

// ──────────────────────────────────────────────────────────────────────
// EXPORT PAYMENTS
// ──────────────────────────────────────────────────────────────────────

function exportPayments(classId, yearId, termId) {
    let payments = state.payments || [];
    if (yearId) payments = payments.filter(p => p.academic_year_id == yearId);
    if (classId) {
        const students = (state.students || []).filter(s => s.class_id == classId);
        const ids = new Set(students.map(s => s.id));
        payments = payments.filter(p => ids.has(p.student_id));
    }
    if (termId) payments = payments.filter(p => p.term_id == termId);

    const year = state.academicYears.find(y => y.id == yearId);
    const term = getTermById(termId);

    return payments.map(p => {
        const student = state.students.find(s => s.id === p.student_id);
        const cls = student ? getClassById(student.class_id) : null;
        return {
            'Receipt #': p.receipt_number || '',
            'Date': fmtDate(p.payment_date || p.created_at),
            'Student': student ? `${student.first_name} ${student.last_name}` : '',
            'Class': cls?.name || '',
            'Amount (RWF)': p.amount || 0,
            'Method': p.payment_method || '',
            'Reference': p.reference || '',
            'Recorded By': p.recorded_by || '',
            'Notes': p.notes || '',
            'Academic Year': year?.name || '',
            'Term': term?.name || '',
        };
    });
}

// ──────────────────────────────────────────────────────────────────────
// EXPORT ATTENDANCE
// ──────────────────────────────────────────────────────────────────────

function exportAttendance(classId, yearId, termId) {
    let attendance = state.attendance || [];
    if (classId) attendance = attendance.filter(a => a.class_id == classId);
    if (yearId) {
        const terms = getTermsByYear(yearId);
        const termIds = terms.map(t => t.id);
        attendance = attendance.filter(a => termIds.includes(a.term_id));
    }
    if (termId) attendance = attendance.filter(a => a.term_id == termId);

    const year = state.academicYears.find(y => y.id == yearId);
    const term = getTermById(termId);

    return attendance.map(a => {
        const student = state.students.find(s => s.id === a.student_id);
        const cls = getClassById(a.class_id);
        return {
            'Date': fmtDate(a.date),
            'Student': student ? `${student.first_name} ${student.last_name}` : '',
            'Class': cls?.name || '',
            'Status': a.status || '',
            'Time': a.time || '',
            'Notes': a.notes || '',
            'Recorded By': a.recorded_by || '',
            'Academic Year': year?.name || '',
            'Term': term?.name || '',
        };
    });
}

// ──────────────────────────────────────────────────────────────────────
// EXPORT FEE STRUCTURE
// ──────────────────────────────────────────────────────────────────────

function exportFeeStructure(yearId) {
    const categories = state.feeCategories || [];
    const year = state.academicYears.find(y => y.id == yearId);

    return categories.map(c => {
        const amounts = (state.feeAmounts || []).filter(f =>
            f.fee_category_id === c.id && (yearId ? f.academic_year_id == yearId : true)
        );
        return {
            'Category': c.name || '',
            'Description': c.description || '',
            'Type': c.fee_type || '',
            'Frequency': c.reset_frequency || '',
            'Default Amount (RWF)': c.amount || 0,
            'Academic Year': year?.name || '',
            'Status': c.is_active !== false ? 'Active' : 'Inactive',
            'Class Overrides': amounts.map(f => {
                const cls = getClassById(f.class_id);
                return `${cls?.name || '—'}: ${fmtCurrency(f.amount)}`;
            }).join('; '),
        };
    });
}

// ──────────────────────────────────────────────────────────────────────
// EXPORT TEACHERS
// ──────────────────────────────────────────────────────────────────────

function exportTeachers() {
    const teachers = state.teachers || [];

    return teachers.map(t => ({
        'First Name': t.first_name || '',
        'Last Name': t.last_name || '',
        'Username': t.username || '',
        'Role': t.role || '',
        'Email': t.email || '',
        'Phone': t.phone || '',
        'Status': t.status !== 'inactive' ? 'Active' : 'Inactive',
        'Department': t.department || '',
        'Last Login': fmtDate(t.last_login),
        'Joined': fmtDate(t.created_at),
    }));
}

// ──────────────────────────────────────────────────────────────────────
// EXPORT SUBJECTS
// ──────────────────────────────────────────────────────────────────────

function exportSubjects() {
    const subjects = state.subjects || [];

    return subjects.map(s => ({
        'Name': s.name || '',
        'Code': s.code || '',
        'Level': s.level || '',
        'MG Max': s.mg_max || 50,
        'EX Max': s.ex_max || 50,
        'Post-Midterm Only': s.appears_only_post_midterm ? 'Yes' : 'No',
        'Sort Order': s.sort_order || 0,
        'Status': s.is_active !== false ? 'Active' : 'Inactive',
    }));
}

// ──────────────────────────────────────────────────────────────────────
// EXPORT FAMILIES
// ──────────────────────────────────────────────────────────────────────

function exportFamilies() {
    const families = state.families || [];

    return families.map(f => {
        const students = (state.students || []).filter(s => s.family_id === f.id);
        return {
            'Family Code': f.family_code || '',
            'Guardian Name': f.guardian_name || '',
            'Guardian Phone': f.guardian_phone || '',
            'Guardian Email': f.guardian_email || '',
            'Address': f.address || '',
            'Students': students.map(s => `${s.first_name} ${s.last_name} (${s.student_code})`).join('; '),
            'Student Count': students.length,
            'Discount (RWF)': f.discount_amount || 0,
        };
    });
}

// ──────────────────────────────────────────────────────────────────────
// EXPORT CLASS REGISTER
// ──────────────────────────────────────────────────────────────────────

function exportClassRegister(classId, yearId, termId) {
    if (!classId) {
        showToast('Please select a class for register export', 'warning');
        return [];
    }

    const cls = getClassById(classId);
    const year = state.academicYears.find(y => y.id == yearId);
    const term = getTermById(termId);

    let students = (state.students || []).filter(s => s.class_id == classId && s.status === 'Active');
    if (yearId) students = students.filter(s => s.academic_year_id == yearId);

    let assessments = (state.assessments || []).filter(a => a.class_id == classId);
    if (yearId) assessments = assessments.filter(a => a.academic_year_id == yearId);
    if (termId) assessments = assessments.filter(a => a.term_id == termId);

    const subjects = (state.subjects || []).filter(s => s.level === cls?.level && s.is_active !== false);

    const data = students.map(student => {
        const row = {
            'Student Code': student.student_code || '',
            'Student Name': `${student.first_name} ${student.last_name}`,
            'Class': cls?.name || '',
            'Academic Year': year?.name || '',
            'Term': term?.name || '',
        };

        for (const subject of subjects) {
            const subAssessments = assessments.filter(a => a.subject_id === subject.id);
            let totalScore = 0, totalMax = 0;

            for (const a of subAssessments) {
                const mark = (state.marks || []).find(m => m.assessment_id === a.id && m.student_id === student.id);
                if (mark) {
                    totalScore += mark.score;
                    totalMax += a.max_marks;
                }
            }

            const pct = totalMax > 0 ? (totalScore / totalMax) * 100 : 0;
            row[`${subject.name} (%)`] = pct > 0 ? pct.toFixed(1) + '%' : '—';
            row[`${subject.name} (Score)`] = totalScore > 0 ? totalScore.toFixed(1) : '—';
        }

        // Overall
        let overallScore = 0, overallMax = 0;
        for (const a of assessments) {
            const mark = (state.marks || []).find(m => m.assessment_id === a.id && m.student_id === student.id);
            if (mark) {
                overallScore += mark.score;
                overallMax += a.max_marks;
            }
        }
        row['Overall %'] = overallMax > 0 ? (overallScore / overallMax) * 100 : 0;
        row['Grade'] = row['Overall %'] > 0 ? getGrade(row['Overall %']) : '—';

        return row;
    });

    return data;
}

// ──────────────────────────────────────────────────────────────────────
// EXPORT HISTORY
// ──────────────────────────────────────────────────────────────────────

function saveExportHistory(type, count, yearId, termId) {
    const year = state.academicYears.find(y => y.id == yearId);
    const term = getTermById(termId);
    const history = JSON.parse(localStorage.getItem('export_history') || '[]');

    history.unshift({
        id: Date.now(),
        type: type,
        count: count,
        date: new Date().toISOString(),
        user: state.currentUser?.name || 'System',
        year: year?.name || 'Current Year',
        term: term?.name || '',
    });
    if (history.length > 20) history = history.slice(0, 20);
    localStorage.setItem('export_history', JSON.stringify(history));
}

function renderExportHistory() {
    const container = document.getElementById('export-history-list');
    if (!container) return;

    const history = JSON.parse(localStorage.getItem('export_history') || '[]');

    if (!history.length) {
        container.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text-muted);">No export history yet</div>';
        return;
    }

    const labels = {
        students: '🎓 Students',
        marks: '📝 Marks',
        payments: '💰 Payments',
        attendance: '📋 Attendance',
        fee_structure: '🏷️ Fee Structure',
        teachers: '👨‍🏫 Teachers',
        subjects: '📖 Subjects',
        families: '👨‍👩‍👧 Families',
        class_register: '📊 Class Register',
    };

    container.innerHTML = `
        <table class="data-table">
            <thead>
                <tr>
                    <th>Date</th>
                    <th>Type</th>
                    <th>Records</th>
                    <th>Year</th>
                    <th>Term</th>
                    <th>Exported By</th>
                </tr>
            </thead>
            <tbody>
                ${history.map(h => `
                    <tr>
                        <td>${fmtDate(h.date)} ${new Date(h.date).toLocaleTimeString()}</td>
                        <td>${labels[h.type] || h.type}</td>
                        <td>${h.count}</td>
                        <td>${esc(h.year || '—')}</td>
                        <td>${esc(h.term || '—')}</td>
                        <td>${esc(h.user)}</td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
}

// ──────────────────────────────────────────────────────────────────────
// RESET BULK EXPORT
// ──────────────────────────────────────────────────────────────────────

function resetBulkExport() {
    const currentYear = getCurrentAcademicYear();
    document.getElementById('export-year').value = currentYear?.id || '';
    document.getElementById('export-type').value = 'students';
    document.getElementById('export-class').value = '';
    document.getElementById('export-term').value = '';
    document.getElementById('export-format').value = 'excel';
    document.getElementById('export-headers').value = 'true';
    selectedYearId = currentYear?.id || null;
    onExportYearChange();
    updateExportOptions();
    showToast('Filters reset', 'info', 1500);
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
    if (!state.classes.length) {
        const { loadInitialData } = await import('../../core/boot.js');
        await loadInitialData(false);
    }
}

// Export functions to window
window._executeBulkExport = executeBulkExport;
window._updateExportOptions = updateExportOptions;
window._resetBulkExport = resetBulkExport;
window._onExportYearChange = onExportYearChange;