/* ═══════════════════════════════════════════════════════════════════
   js/core/export-engine.js
   ═══════════════════════════════════════════════════════════════════
   Purpose : Build and trigger Excel / CSV downloads for every
             exportable dataset in the app.
             Uses SheetJS (XLSX) for Excel and the built-in
             exportToCSV() from utils.js for CSV.
             Every export function:
               - Builds the data array from state or passed args
               - Adds a readable header row
               - Calls exportAOAtoExcel() or exportToCSV()
               - Shows a success toast
             No API calls here — data is always pre-loaded.
   Load order: AFTER utils.js, state.js, academic-formulas.js,
               finance-formulas.js.
   ═══════════════════════════════════════════════════════════════════ */

'use strict';

/* ─────────────────────────────────────────────────────────────────
   HELPER — ensure SheetJS is loaded
   ───────────────────────────────────────────────────────────────── */

function _checkXLSX() {
    if (typeof XLSX === 'undefined') {
        showToast('Excel export requires SheetJS. Check your internet connection.', 'error');
        return false;
    }
    return true;
}

/* ─────────────────────────────────────────────────────────────────
   1. STUDENT LIST EXPORT
   ───────────────────────────────────────────────────────────────── */

/**
 * Export the full student list to Excel.
 * @param {Array}  [students]  - defaults to state.students
 * @param {string} [filename]
 */
function exportStudentList(students, filename = 'Student_List') {
    if (!_checkXLSX()) return;

    const rows = (students || state.students || []).map(s => {
        const cls = getClass(s.class_id);
        return [
            s.code || '',
            s.last_name || '',
            s.first_name || '',
            s.gender || '',
            cls?.name || '',
            fmtDate(s.date_of_birth || ''),
            s.parent_name || '',
            s.parent_contact || '',
            s.parent_email || '',
            s.status || 'Active',
            s.family_code || '',
            fmtDate(s.enrollment_date || ''),
        ];
    });

    const header = [
        'Code', 'Last Name', 'First Name', 'Gender', 'Class',
        'Date of Birth', 'Parent/Guardian', 'Contact', 'Email',
        'Status', 'Family Code', 'Enrollment Date',
    ];

    exportAOAtoExcel([header, ...rows], filename, 'Students');
    showToast(`Exported ${rows.length} students.`, 'success');
}

/* ─────────────────────────────────────────────────────────────────
   2. CLASS REGISTER EXPORT  (Part 8)
   ───────────────────────────────────────────────────────────────── */

/**
 * Export the class register to Excel with all MG/EX/TOT columns.
 *
 * @param {Object} cls       - class row
 * @param {Array}  subjects  - subject rows
 * @param {Array}  registerRows - from buildRegisterRows()
 * @param {string} phase     - 'pre_midterm' | 'post_midterm'
 * @param {Object} term      - term row
 */
function exportClassRegister(cls, subjects, registerRows, phase, term) {
    if (!_checkXLSX()) return;

    const termLabel = term ? `T${term.term_number}` : '';
    const phaseLabel = phase === 'pre_midterm' ? 'PreMid' : 'PostMid';

    // Build dynamic header: Rank, Name, Code, then per subject columns, then TOTAL
    const subjectHeaders = [];
    subjects.forEach(sub => {
        subjectHeaders.push(`${sub.name} MG`);
        if (phase === 'post_midterm') subjectHeaders.push(`${sub.name} EX`);
        subjectHeaders.push(`${sub.name} TOT`);
    });

    const header = [
        'Rank', 'Last Name', 'First Name', 'Code',
        ...subjectHeaders,
        'G.TOT', 'G.TOT MAX', '%', 'Grade', 'Result',
    ];

    const rows = registerRows.map(row => {
        const student = row.student;
        const subCols = [];

        subjects.forEach(sub => {
            const data = row.subjects[sub.id] || {};
            subCols.push(data.mg !== null && data.mg !== undefined ? data.mg : '');
            if (phase === 'post_midterm') {
                subCols.push(data.ex !== null && data.ex !== undefined ? data.ex : '');
            }
            subCols.push(data.tot !== null && data.tot !== undefined ? data.tot : '');
        });

        return [
            row.rank || '',
            student.last_name || '',
            student.first_name || '',
            student.code || '',
            ...subCols,
            row.gTot !== null ? row.gTot : '',
            row.gTotMax || '',
            row.gTotPct !== null ? row.gTotPct : '',
            row.grade || '',
            row.isPassing ? 'PASS' : row.gTotPct !== null ? 'FAIL' : '',
        ];
    });

    const filename = `Register_${cls?.name || 'Class'}_${termLabel}_${phaseLabel}`;
    exportAOAtoExcel([header, ...rows], filename, `${cls?.name} Register`);
    showToast(`Exported ${rows.length} student records.`, 'success');
}

/* ─────────────────────────────────────────────────────────────────
   3. ANNUAL REGISTER EXPORT
   ───────────────────────────────────────────────────────────────── */

/**
 * Export the annual register to Excel.
 * @param {Object} cls
 * @param {Array}  subjects
 * @param {Array}  annualRows - from buildAnnualRegisterRows()
 */
function exportAnnualRegister(cls, subjects, annualRows) {
    if (!_checkXLSX()) return;

    // Headers: Rank, Name, Code, then per subject T1/T2/T3/Annual, then totals
    const subjectHeaders = [];
    subjects.forEach(sub => {
        subjectHeaders.push(`${sub.name} T1`);
        subjectHeaders.push(`${sub.name} T2`);
        subjectHeaders.push(`${sub.name} T3`);
        subjectHeaders.push(`${sub.name} Annual`);
    });

    const header = [
        'Rank', 'Last Name', 'First Name', 'Code',
        ...subjectHeaders,
        'T1 Total', 'T2 Total', 'T3 Total',
        'Annual Total', 'Annual Max', 'Annual %', 'Grade', 'Decision',
    ];

    const rows = annualRows.map(row => {
        const student = row.student;
        const subCols = [];

        subjects.forEach(sub => {
            const sa = row.perSubjectAnnual[sub.id] || {};
            subCols.push(sa.term1Tot !== null && sa.term1Tot !== undefined ? sa.term1Tot : '');
            subCols.push(sa.term2Tot !== null && sa.term2Tot !== undefined ? sa.term2Tot : '');
            subCols.push(sa.term3Tot !== null && sa.term3Tot !== undefined ? sa.term3Tot : '');
            subCols.push(sa.annualTot !== null && sa.annualTot !== undefined ? sa.annualTot : '');
        });

        // Term totals
        const termTotals = [1, 2, 3].map(n => {
            const termEntry = Object.values(row.perTerm || {})
                .find(t => t.termNumber === n);
            return termEntry?.gTot !== null && termEntry?.gTot !== undefined ? termEntry.gTot : '';
        });

        return [
            row.rank || '',
            student.last_name || '',
            student.first_name || '',
            student.code || '',
            ...subCols,
            ...termTotals,
            row.annualGTot !== null ? row.annualGTot : '',
            row.annualGTotMax || '',
            row.annualPct !== null ? row.annualPct : '',
            row.grade || '',
            row.decision?.label || '',
        ];
    });

    const filename = `Annual_Register_${cls?.name || 'Class'}`;
    exportAOAtoExcel([header, ...rows], filename, `${cls?.name} Annual`);
    showToast(`Exported ${rows.length} student records.`, 'success');
}

/* ─────────────────────────────────────────────────────────────────
   4. MARKS EXPORT — per assessment
   ───────────────────────────────────────────────────────────────── */

/**
 * Export all marks for one assessment to Excel.
 * @param {Object} assessment
 * @param {Array}  students  - students in the class
 * @param {Array}  marks     - mark rows for this assessment
 */
function exportAssessmentMarks(assessment, students, marks) {
    if (!_checkXLSX()) return;

    const markMap = {};
    marks.forEach(m => { markMap[m.student_id] = m; });

    const header = ['Code', 'Last Name', 'First Name', 'Score', 'Max Score', '%', 'Absent', 'Notes'];

    const rows = students.map(s => {
        const mark = markMap[s.id];
        const score = mark?.is_absent ? 'ABS' : (mark?.score !== null && mark?.score !== undefined ? mark.score : '');
        const pct = (mark && !mark.is_absent && mark.score !== null)
            ? Math.round((mark.score / assessment.max_score) * 100)
            : '';

        return [
            s.code || '',
            s.last_name || '',
            s.first_name || '',
            score,
            assessment.max_score || '',
            pct,
            mark?.is_absent ? 'YES' : 'NO',
            mark?.notes || '',
        ];
    });

    const cls = getClass(assessment.class_id);
    const subj = getSubject(assessment.subject_id);
    const filename = `Marks_${assessment.name}_${cls?.name || ''}_${subj?.name || ''}`;

    exportAOAtoExcel([header, ...rows], filename, assessment.name || 'Marks');
    showToast(`Exported ${rows.length} mark records.`, 'success');
}

/* ─────────────────────────────────────────────────────────────────
   5. ATTENDANCE EXPORT
   ───────────────────────────────────────────────────────────────── */

/**
 * Export attendance records for a class and date range.
 * @param {Object} cls
 * @param {Array}  students
 * @param {Array}  records   - attendance rows { student_id, date, status }
 * @param {string} from
 * @param {string} to
 */
function exportAttendance(cls, students, records, from, to) {
    if (!_checkXLSX()) return;

    // Get unique dates
    const dates = [...new Set(records.map(r => r.date || r.attendance_date))].sort();

    const header = ['Code', 'Last Name', 'First Name', ...dates, 'P', 'A', 'L', 'E', 'Total', 'Rate %'];

    const rows = students.map(s => {
        const studentRecs = records.filter(r => r.student_id === s.id);
        const recMap = {};
        studentRecs.forEach(r => { recMap[r.date || r.attendance_date] = r.status; });

        const dateCols = dates.map(d => recMap[d] || '');
        const counts = countAttendance(studentRecs);
        const rate = computeAttendanceRate(counts);

        return [
            s.code || '',
            s.last_name || '',
            s.first_name || '',
            ...dateCols,
            counts.P, counts.A, counts.L, counts.E,
            counts.total,
            rate,
        ];
    });

    const filename = `Attendance_${cls?.name || 'Class'}_${from}_to_${to}`;
    exportAOAtoExcel([header, ...rows], filename, `${cls?.name} Attendance`);
    showToast(`Exported ${rows.length} attendance records.`, 'success');
}

/* ─────────────────────────────────────────────────────────────────
   6. PAYMENT HISTORY EXPORT
   ───────────────────────────────────────────────────────────────── */

/**
 * Export payment history to Excel.
 * @param {Array}  payments   - filtered payment rows
 * @param {string} [filename]
 */
function exportPaymentHistory(payments, filename = 'Payment_History') {
    if (!_checkXLSX()) return;

    const header = [
        'Receipt No.', 'Date', 'Student Code', 'Student Name',
        'Class', 'Amount (RWF)', 'Method', 'Academic Year',
        'Term', 'Recorded By', 'Notes',
    ];

    const rows = payments.map(p => {
        const student = getStudent(p.student_id);
        const cls = student ? getClass(student.class_id) : null;
        const year = getAcadYear(p.academic_year_id);
        const term = getTerm(p.term_id);

        return [
            p.receipt_number || '',
            fmtDate(p.payment_date || ''),
            student?.code || '',
            student ? `${student.first_name} ${student.last_name}` : `Student #${p.student_id}`,
            cls?.name || '',
            Number(p.total_amount || 0),
            p.payment_method || '',
            year?.year_name || '',
            term ? `Term ${term.term_number}` : '',
            p.recorded_by_name || '',
            p.notes || '',
        ];
    });

    exportAOAtoExcel([header, ...rows], filename, 'Payments');

    const total = payments.reduce((sum, p) => sum + Number(p.total_amount || 0), 0);
    showToast(`Exported ${rows.length} payments totalling ${fmtCurrency(total)}.`, 'success');
}

/* ─────────────────────────────────────────────────────────────────
   7. FEE STATUS EXPORT  (grid view)
   ───────────────────────────────────────────────────────────────── */

/**
 * Export the fee status grid (all students × all fee types).
 * @param {Array}  students
 * @param {Array}  feeCategories
 * @param {Array}  studentFees
 * @param {string} [filename]
 */
function exportFeeStatus(students, feeCategories, studentFees, filename = 'Fee_Status') {
    if (!_checkXLSX()) return;

    const catHeaders = feeCategories.map(c => c.name);
    const header = [
        'Code', 'Last Name', 'First Name', 'Class',
        ...catHeaders,
        'Total Expected', 'Total Paid', 'Outstanding',
    ];

    const rows = students.map(s => {
        const cls = getClass(s.class_id);
        const fees = studentFees.filter(f => f.student_id === s.id);

        const catCols = feeCategories.map(cat => {
            const catFees = fees.filter(f => f.fee_category_id === cat.id);
            if (catFees.length === 0) return '—';
            const bal = computeStudentFeeSummary(catFees, 0);
            if (bal.outstanding <= 0) return 'Paid';
            if (bal.paid > 0) return `Partial (${fmtCurrency(bal.outstanding)} left)`;
            return `Unpaid (${fmtCurrency(bal.effective)})`;
        });

        const summary = computeStudentFeeSummary(fees, 0);

        return [
            s.code || '',
            s.last_name || '',
            s.first_name || '',
            cls?.name || '',
            ...catCols,
            summary.effective,
            summary.paid,
            summary.outstanding,
        ];
    });

    exportAOAtoExcel([header, ...rows], filename, 'Fee Status');
    showToast(`Exported fee status for ${rows.length} students.`, 'success');
}

/* ─────────────────────────────────────────────────────────────────
   8. OVERDUE FEES EXPORT
   ───────────────────────────────────────────────────────────────── */

/**
 * Export overdue fees to Excel.
 * @param {Array} overdueFees - classified overdue fee rows
 */
function exportOverdueFees(overdueFees, filename = 'Overdue_Fees') {
    if (!_checkXLSX()) return;

    const header = [
        'Student Code', 'Student Name', 'Class',
        'Fee Name', 'Original Amount', 'Paid', 'Outstanding',
        'Due Date', 'Days Overdue', 'Severity',
    ];

    const rows = overdueFees.map(fee => {
        const student = getStudent(fee.student_id);
        const cls = student ? getClass(student.class_id) : null;
        const sev = getOverdueSeverity(fee.due_date);

        return [
            student?.code || '',
            student ? `${student.first_name} ${student.last_name}` : `#${fee.student_id}`,
            cls?.name || '',
            fee.fee_name || fee.name || '—',
            Number(fee.amount || 0),
            Number(fee.paid_amount || 0),
            Number(fee.remaining || fee.amount || 0) - Number(fee.paid_amount || 0),
            fmtDate(fee.due_date || ''),
            fee.days_overdue || sev.days,
            sev.label,
        ];
    });

    exportAOAtoExcel([header, ...rows], filename, 'Overdue Fees');
    showToast(`Exported ${rows.length} overdue fee records.`, 'success');
}

/* ─────────────────────────────────────────────────────────────────
   9. FINANCIAL SUMMARY EXPORT
   ───────────────────────────────────────────────────────────────── */

/**
 * Export a financial summary report by class.
 * @param {Object} academicYear
 * @param {Array}  payments
 * @param {Array}  studentFees
 */
function exportFinancialSummary(academicYear, payments, studentFees, filename = 'Financial_Summary') {
    if (!_checkXLSX()) return;

    // Group by class
    const classSummaries = [];
    const classes = state.classes || [];

    classes.forEach(cls => {
        const classStudents = (state.students || []).filter(s => s.class_id === cls.id);
        const classStudentIds = new Set(classStudents.map(s => s.id));

        const classFees = studentFees.filter(f => classStudentIds.has(f.student_id));
        const classPayments = payments.filter(p => classStudentIds.has(p.student_id));

        const stats = computeCollectionStats(classFees);
        const totalPayments = classPayments.reduce((sum, p) => sum + Number(p.total_amount || 0), 0);

        classSummaries.push([
            cls.name,
            classStudents.length,
            stats.totalExpected,
            totalPayments,
            stats.totalOutstanding,
            stats.collectionRate,
            stats.fullPayers,
            stats.partialPayers,
            stats.nonPayers,
        ]);
    });

    // Overall totals row
    const totals = classSummaries.reduce((acc, row) => {
        acc[1] += row[1]; acc[2] += row[2];
        acc[3] += row[3]; acc[4] += row[4];
        acc[6] += row[6]; acc[7] += row[7]; acc[8] += row[8];
        return acc;
    }, ['TOTAL', 0, 0, 0, 0, 0, 0, 0, 0]);

    totals[5] = totals[2] > 0 ? Math.round((totals[3] / totals[2]) * 1000) / 10 : 0;

    const header = [
        'Class', 'Students', 'Expected (RWF)', 'Collected (RWF)',
        'Outstanding (RWF)', 'Collection Rate %',
        'Full Payers', 'Partial Payers', 'Non Payers',
    ];

    exportAOAtoExcel([header, ...classSummaries, [], totals], filename, 'Summary');
    showToast(`Exported financial summary for ${classes.length} classes.`, 'success');
}

/* ─────────────────────────────────────────────────────────────────
   10. TIMETABLE EXPORT
   ───────────────────────────────────────────────────────────────── */

/**
 * Export the timetable to Excel (rows = days × periods, cols = classes).
 * @param {Array} slots - timetable_slots rows
 */
function exportTimetable(slots, filename = 'Timetable') {
    if (!_checkXLSX()) return;

    const classes = state.classes || [];
    const periods = [...new Set(slots.map(s => s.period_number))].sort((a, b) => a - b);

    const header = ['Day / Period', ...classes.map(c => c.name)];

    const rows = [];
    DAYS_OF_WEEK.forEach(day => {
        periods.forEach(period => {
            const row = [`${day.name} P${period}`];
            classes.forEach(cls => {
                const slot = slots.find(s =>
                    s.day_of_week === day.id &&
                    s.period_number === period &&
                    s.class_id === cls.id
                );
                if (slot) {
                    const teacher = getTeacher(slot.teacher_id);
                    const subj = getSubject(slot.subject_id);
                    row.push(`${subj?.name || '—'} (${teacher?.last_name || '—'})`);
                } else {
                    row.push('');
                }
            });
            rows.push(row);
        });
    });

    exportAOAtoExcel([header, ...rows], filename, 'Timetable');
    showToast('Timetable exported.', 'success');
}

/* ─────────────────────────────────────────────────────────────────
   11. SYSTEM LOGS EXPORT
   ───────────────────────────────────────────────────────────────── */

/**
 * Export system logs to Excel.
 * @param {Array}  logs
 * @param {string} [filename]
 */
function exportSystemLogs(logs, filename = 'System_Logs') {
    if (!_checkXLSX()) return;

    const header = [
        'Date/Time', 'Action', 'Entity Type', 'Entity ID',
        'Performed By', 'Role', 'Level', 'Holiday Mode', 'Details',
    ];

    const rows = logs.map(log => [
        fmtDateTime(log.created_at || ''),
        log.action || '',
        log.entity_type || '',
        log.entity_id || '',
        log.performed_by_name || '',
        log.role || '',
        log.level || 'info',
        log.holiday_mode ? 'YES' : 'NO',
        log.details ? JSON.stringify(log.details) : '',
    ]);

    exportAOAtoExcel([header, ...rows], filename, 'Logs');
    showToast(`Exported ${rows.length} log entries.`, 'success');
}

/* ─────────────────────────────────────────────────────────────────
   12. TEACHER PERFORMANCE EXPORT
   ───────────────────────────────────────────────────────────────── */

/**
 * Export teacher performance report.
 * @param {Array}  teachers
 * @param {Array}  performanceData - [{ teacherId, className, subjectName, avgScore, completionPct, onTimePct }]
 */
function exportTeacherPerformance(performanceData, filename = 'Teacher_Performance') {
    if (!_checkXLSX()) return;

    const header = [
        'Teacher', 'Class', 'Subject',
        'Avg Class Score', 'Completion Rate %', 'On-Time Rate %',
    ];

    const rows = performanceData.map(d => {
        const teacher = getTeacher(d.teacherId);
        return [
            teacher ? `${teacher.first_name} ${teacher.last_name}` : `#${d.teacherId}`,
            d.className || '',
            d.subjectName || '',
            d.avgScore !== null ? d.avgScore : '—',
            d.completionPct !== null ? d.completionPct : '—',
            d.onTimePct !== null ? d.onTimePct : '—',
        ];
    });

    exportAOAtoExcel([header, ...rows], filename, 'Performance');
    showToast(`Exported ${rows.length} teacher records.`, 'success');
}

/* ─────────────────────────────────────────────────────────────────
   13. RANKINGS EXPORT
   ───────────────────────────────────────────────────────────────── */

/**
 * Export class rankings to Excel.
 * @param {Object} cls
 * @param {Array}  rankedRows - from buildRegisterRows() or getCachedRanks()
 * @param {string} phaseLabel
 */
function exportRankings(cls, rankedRows, phaseLabel, filename) {
    if (!_checkXLSX()) return;

    const fn = filename || `Rankings_${cls?.name || 'Class'}_${phaseLabel}`;

    const header = [
        'Rank', 'Code', 'Last Name', 'First Name',
        'Total Score', 'Max Score', 'Percentage', 'Grade', 'Result',
    ];

    const rows = rankedRows.map(row => {
        const s = row.student || row;
        return [
            row.rank || '',
            s.code || '',
            s.last_name || '',
            s.first_name || '',
            row.gTot !== null ? row.gTot : '',
            row.gTotMax || '',
            row.gTotPct !== null ? row.gTotPct : '',
            row.grade || '',
            row.isPassing ? 'PASS' : row.gTotPct !== null ? 'FAIL' : '',
        ];
    });

    exportAOAtoExcel([header, ...rows], fn, `${cls?.name} Rankings`);
    showToast(`Exported ${rows.length} student rankings.`, 'success');
}

/* ─────────────────────────────────────────────────────────────────
   14. MARKS IMPORT TEMPLATE
   ───────────────────────────────────────────────────────────────── */

/**
 * Generate and download a blank Excel import template for marks.
 * @param {Object} assessment - the assessment to pre-fill
 * @param {Array}  students   - students to list as rows
 */
function downloadMarksImportTemplate(assessment, students) {
    if (!_checkXLSX()) return;

    const cls = getClass(assessment.class_id);
    const subj = getSubject(assessment.subject_id);

    const info = [
        [`Assessment: ${assessment.name}`],
        [`Class: ${cls?.name || '—'}`],
        [`Subject: ${subj?.name || '—'}`],
        [`Max Score: ${assessment.max_score}`],
        [`Date: ${fmtDate(assessment.date || todayISO())}`],
        [],
    ];

    const header = ['Student Code', 'Last Name', 'First Name', 'Score (0–' + assessment.max_score + ')', 'Absent? (YES/NO)', 'Notes'];

    const rows = students.map(s => [
        s.code || '',
        s.last_name || '',
        s.first_name || '',
        '',   // score — to be filled
        'NO', // absent
        '',   // notes
    ]);

    const filename = `Marks_Template_${assessment.name}_${cls?.name || ''}`;
    exportAOAtoExcel([...info, header, ...rows], filename, 'Marks Entry');
    showToast('Marks import template downloaded.', 'success');
}

/**
 * Generate and download a blank Excel import template for students.
 */
function downloadStudentsImportTemplate() {
    if (!_checkXLSX()) return;

    const header = [
        'Last Name*', 'First Name*', 'Gender* (Male/Female)',
        'Class Name*', 'Date of Birth (YYYY-MM-DD)',
        'Parent/Guardian Name', 'Parent Contact*', 'Parent Email',
        'Enrollment Date (YYYY-MM-DD)', 'Family Code',
    ];

    const example = [
        'UWASE', 'Aline', 'Female', 'PRIMARY 5',
        '2014-03-15', 'UWASE John', '+250788000000',
        'uwase@example.com', todayISO(), '',
    ];

    exportAOAtoExcel([header, example], 'Students_Import_Template', 'Students');
    showToast('Student import template downloaded.', 'success');
}

/* ─────────────────────────────────────────────────────────────────
   15. CSV EXPORTS (lightweight alternatives)
   ───────────────────────────────────────────────────────────────── */

/**
 * Export any flat data array as CSV.
 * @param {Array}  data     - array of plain objects
 * @param {string} filename
 */
function exportAsCSV(data, filename) {
    exportToCSV(data, filename);
    showToast('CSV exported.', 'success');
}

/* ─────────────────────────────────────────────────────────────────
   EXPOSE
   ───────────────────────────────────────────────────────────────── */

window.exportStudentList = exportStudentList;
window.exportClassRegister = exportClassRegister;
window.exportAnnualRegister = exportAnnualRegister;
window.exportAssessmentMarks = exportAssessmentMarks;
window.exportAttendance = exportAttendance;
window.exportPaymentHistory = exportPaymentHistory;
window.exportFeeStatus = exportFeeStatus;
window.exportOverdueFees = exportOverdueFees;
window.exportFinancialSummary = exportFinancialSummary;
window.exportTimetable = exportTimetable;
window.exportSystemLogs = exportSystemLogs;
window.exportTeacherPerformance = exportTeacherPerformance;
window.exportRankings = exportRankings;
window.downloadMarksImportTemplate = downloadMarksImportTemplate;
window.downloadStudentsImportTemplate = downloadStudentsImportTemplate;
window.exportAsCSV = exportAsCSV;