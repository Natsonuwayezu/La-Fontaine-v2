/**
 * ECOLE LA FONTAINE — Bulk Import Module
 * Import students, marks, payments, teachers, subjects, families from Excel
 * Last updated: 2026-07-03
 * 
 * CHANGES:
 * - Added academic year selection for imports
 * - Added term selection for marks/payments imports
 * - Added fee category selection for payments
 * - Added assessment type selection for marks
 * - Imports are linked to selected year/term/fee category
 * - Payments can be recorded for any year/term/fee category
 * - Validation ensures fees are applied to correct period
 * - Full balance tracking with year/term context
 */



const state = window.state || {}; // global state alias
const ensureStateLoaded = window.ensureStateLoaded || (async () => {}); // global from boot.js
import {
    state,
    getCurrentUser,
    getClassById,
    getSubjectById,
    getCurrentAcademicYear,
    getActiveAcademicYearId,
    getTermsByYear,
    isCurrentYearEditable
} from '../../core/state.js';
import { esc, fmtDate, fmtCurrency } from '../../core/utils.js';
import { insert, update, getAll, refreshTable, logActivity } from '../../core/api.js';
import { showToast } from '../../ui/toast.js';
import { showModal, closeModal, confirmDialog } from '../../ui/modals.js';
import { getFullStudentBalance } from '../../core/fees.js';

// ──────────────────────────────────────────────────────────────────────
// STATE
// ──────────────────────────────────────────────────────────────────────

let importData = [];
let importType = 'students';
let importErrors = [];
let importWarnings = [];

// ──────────────────────────────────────────────────────────────────────
// MAIN RENDER FUNCTION
// ──────────────────────────────────────────────────────────────────────

export async function renderBulkImport(container) {
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
    const feeCategories = (state.feeCategories || []).filter(c => c.is_active !== false);

    container.innerHTML = `
        <div class="dash-card">
            <div class="dash-card-header" style="flex-wrap:wrap;gap:8px;">
                <span class="dash-card-title">📤 Bulk Import</span>
                <div class="btn-group" style="flex-wrap:wrap;gap:6px;">
                    <button class="btn btn-sm btn-outline" onclick="window._downloadImportTemplate()">📥 Download Template</button>
                    <button class="btn btn-sm btn-primary" onclick="window._uploadImportFile()">📤 Upload File</button>
                </div>
            </div>
            <div class="dash-card-body">
                <div class="alert alert-info" style="font-size:0.85rem;">
                    <strong>Import Types:</strong> Students, Marks, Payments, Teachers, Subjects, Families
                    <br>Supported formats: <strong>.xlsx, .xls, .csv</strong> (max 500 rows)
                    <br>📅 All imports are linked to the selected academic year and term.
                </div>

                <div class="form-grid" style="margin-bottom:16px;">
                    <div class="form-group">
                        <label>Import Type *</label>
                        <select id="import-type" class="form-control" onchange="window._updateImportType()">
                            <option value="students">🎓 Students</option>
                            <option value="marks">📝 Marks</option>
                            <option value="payments">💰 Payments</option>
                            <option value="teachers">👨‍🏫 Teachers</option>
                            <option value="subjects">📖 Subjects</option>
                            <option value="families">👨‍👩‍👧 Families</option>
                        </select>
                    </div>
                    <div class="form-group" id="import-year-group">
                        <label>Academic Year *</label>
                        <select id="import-year" class="form-control">
                            ${years.map(y => `
                                <option value="${y.id}" ${y.id === currentYear?.id ? 'selected' : ''}>
                                    ${esc(y.name)} ${y.id === currentYear?.id ? '🟢' : ''} ${y.is_active ? '✅' : '🔒'}
                                </option>
                            `).join('')}
                        </select>
                    </div>
                    <div class="form-group" id="import-term-group" style="display:none;">
                        <label>Term</label>
                        <select id="import-term" class="form-control">
                            ${terms.map(t => `
                                <option value="${t.id}" ${t.id === state.currentTerm?.id ? 'selected' : ''}>
                                    ${esc(t.name)}
                                </option>
                            `).join('')}
                            <option value="">All Terms</option>
                        </select>
                    </div>
                    <div class="form-group" id="import-fee-group" style="display:none;">
                        <label>Fee Category</label>
                        <select id="import-fee-category" class="form-control">
                            <option value="">All Categories</option>
                            ${feeCategories.map(c => `
                                <option value="${c.id}">${esc(c.name)}</option>
                            `).join('')}
                        </select>
                    </div>
                    <div class="form-group" id="import-assessment-group" style="display:none;">
                        <label>Assessment Type</label>
                        <select id="import-assessment-type" class="form-control">
                            <option value="Quiz">Quiz</option>
                            <option value="Assignment">Assignment</option>
                            <option value="Mid-term">Mid-term</option>
                            <option value="Exam">Exam</option>
                            <option value="Final Exam">Final Exam</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Skip invalid rows</label>
                        <select id="skip-invalid" class="form-control">
                            <option value="true">Yes</option>
                            <option value="false">No (show errors)</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Update existing</label>
                        <select id="update-existing" class="form-control">
                            <option value="true">Yes</option>
                            <option value="false">No (skip)</option>
                        </select>
                    </div>
                    <div class="form-group" style="align-self:flex-end;">
                        <button class="btn btn-primary" onclick="window._previewImportFile()">👁️ Preview</button>
                    </div>
                </div>

                <div id="import-file-upload" style="border:2px dashed var(--border-light);border-radius:var(--r-lg);padding:40px;text-align:center;cursor:pointer;" onclick="document.getElementById('import-file-input').click()">
                    <div style="font-size:3rem;margin-bottom:8px;">📂</div>
                    <div style="font-size:0.9rem;font-weight:600;">Drop your file here or click to browse</div>
                    <div style="font-size:0.75rem;color:var(--text-muted);margin-top:4px;">Supported: .xlsx, .xls, .csv (max 10MB)</div>
                    <input type="file" id="import-file-input" accept=".xlsx,.xls,.csv" style="display:none;" onchange="window._handleImportFile(this)">
                </div>

                <div id="import-preview" style="display:none;margin-top:20px;"></div>
            </div>
        </div>
    `;

    window._downloadImportTemplate = downloadImportTemplate;
    window._uploadImportFile = uploadImportFile;
    window._handleImportFile = handleImportFile;
    window._previewImportFile = previewImportFile;
    window._updateImportType = updateImportType;
    window._executeImport = executeImport;
    window._resetImport = resetImport;

    importData = [];
    importErrors = [];
    importWarnings = [];

    // Show/hide fields based on import type
    updateImportType();
}

// ──────────────────────────────────────────────────────────────────────
// UPDATE IMPORT TYPE
// ──────────────────────────────────────────────────────────────────────

function updateImportType() {
    importType = document.getElementById('import-type')?.value || 'students';

    // Show/hide fields based on type
    const yearGroup = document.getElementById('import-year-group');
    const termGroup = document.getElementById('import-term-group');
    const feeGroup = document.getElementById('import-fee-group');
    const assessmentGroup = document.getElementById('import-assessment-group');

    // Year is always shown
    if (yearGroup) yearGroup.style.display = 'block';

    // Term: shown for marks and payments
    if (termGroup) {
        termGroup.style.display = (importType === 'marks' || importType === 'payments') ? 'block' : 'none';
    }

    // Fee Category: shown for payments only
    if (feeGroup) {
        feeGroup.style.display = importType === 'payments' ? 'block' : 'none';
    }

    // Assessment Type: shown for marks only
    if (assessmentGroup) {
        assessmentGroup.style.display = importType === 'marks' ? 'block' : 'none';
    }

    // Clear any existing data
    importData = [];
    importErrors = [];
    importWarnings = [];
    document.getElementById('import-preview').style.display = 'none';
}

// ──────────────────────────────────────────────────────────────────────
// UPLOAD IMPORT FILE
// ──────────────────────────────────────────────────────────────────────

function uploadImportFile() {
    document.getElementById('import-file-input').click();
}

// ──────────────────────────────────────────────────────────────────────
// HANDLE IMPORT FILE
// ──────────────────────────────────────────────────────────────────────

function handleImportFile(input) {
    const file = input?.files?.[0];
    if (!file) {
        showToast('No file selected', 'warning');
        return;
    }

    if (file.size > 10 * 1024 * 1024) {
        showToast('File too large. Max 10MB.', 'error');
        return;
    }

    const reader = new FileReader();
    reader.onload = function (e) {
        try {
            if (typeof XLSX === 'undefined') {
                showToast('SheetJS library not loaded', 'error');
                return;
            }
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const sheet = workbook.Sheets[workbook.SheetNames[0]];
            const rows = XLSX.utils.sheet_to_json(sheet);

            if (!rows || !rows.length) {
                showToast('No data found in file', 'warning');
                return;
            }

            importData = rows;
            previewImportFile();

        } catch (error) {
            showToast('Error reading file: ' + error.message, 'error');
        }
    };
    reader.readAsArrayBuffer(file);
}

// ──────────────────────────────────────────────────────────────────────
// PREVIEW IMPORT FILE
// ──────────────────────────────────────────────────────────────────────

function previewImportFile() {
    const previewDiv = document.getElementById('import-preview');
    if (!previewDiv) return;

    if (!importData || !importData.length) {
        showToast('Please upload a file first', 'warning');
        return;
    }

    // Validate based on import type
    const results = validateImportData(importData, importType);
    importErrors = results.errors;
    importWarnings = results.warnings;

    const validCount = results.valid.length;
    const errorCount = results.errors.length;
    const warningCount = results.warnings.length;

    // Get selected year/term for display
    const yearId = document.getElementById('import-year')?.value;
    const termId = document.getElementById('import-term')?.value;
    const year = state.academicYears.find(y => y.id == yearId);
    const term = state.terms.find(t => t.id == termId);
    const feeCat = document.getElementById('import-fee-category')?.value;
    const feeCategory = state.feeCategories.find(c => c.id == feeCat);

    // Build preview table
    const headers = Object.keys(importData[0] || {});
    const previewRows = importData.slice(0, 10);

    let tableHtml = `
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:12px;">
            <div>
                <span class="badge badge-info">📄 ${importData.length} rows</span>
                <span class="badge badge-success">✅ ${validCount} valid</span>
                ${errorCount > 0 ? `<span class="badge badge-danger">❌ ${errorCount} errors</span>` : ''}
                ${warningCount > 0 ? `<span class="badge badge-warning">⚠️ ${warningCount} warnings</span>` : ''}
            </div>
            <div style="font-size:0.75rem;color:var(--text-muted);">
                📅 ${year?.name || 'Current Year'} ${term ? `· ${term.name}` : ''}
                ${feeCategory ? `· ${feeCategory.name}` : ''}
            </div>
            <div class="btn-group">
                ${errorCount === 0 ? `<button class="btn btn-success" onclick="window._executeImport()">✅ Import All</button>` : ''}
                <button class="btn btn-outline" onclick="window._resetImport()">🗑️ Clear</button>
            </div>
        </div>
        <div class="table-wrapper" style="max-height:400px;overflow-y:auto;">
            <table class="data-table" style="font-size:0.75rem;">
                <thead>
                    <tr>
                        <th style="width:30px;">#</th>
                        ${headers.map(h => `<th>${esc(h)}</th>`).join('')}
                        <th style="width:80px;">Status</th>
                    </tr>
                </thead>
                <tbody>
                    ${previewRows.map((row, idx) => {
        const error = results.errors.find(e => e.row === idx);
        const warning = results.warnings.find(w => w.row === idx);
        const status = error ? '❌ Error' : warning ? '⚠️ Warning' : '✅ Valid';
        const statusClass = error ? 'badge-danger' : warning ? 'badge-warning' : 'badge-success';
        return `
                            <tr>
                                <td style="text-align:center;">${idx + 1}</td>
                                ${headers.map(h => `<td>${esc(String(row[h] ?? ''))}</td>`).join('')}
                                <td><span class="badge ${statusClass}" style="font-size:0.6rem;">${status}</span></td>
                            </tr>
                        `;
    }).join('')}
                    ${importData.length > 10 ? `<tr><td colspan="${headers.length + 2}" style="text-align:center;color:var(--text-muted);font-size:0.75rem;">... and ${importData.length - 10} more rows</td></tr>` : ''}
                </tbody>
            </table>
        </div>
        ${errorCount > 0 ? `
            <div style="margin-top:12px;">
                <strong style="color:var(--danger);">Errors:</strong>
                <ul style="font-size:0.8rem;color:var(--danger);margin-top:4px;">
                    ${results.errors.slice(0, 10).map(e => `<li>Row ${e.row + 1}: ${esc(e.message)}</li>`).join('')}
                    ${results.errors.length > 10 ? `<li>... and ${results.errors.length - 10} more</li>` : ''}
                </ul>
            </div>
        ` : ''}
    `;

    previewDiv.innerHTML = tableHtml;
    previewDiv.style.display = 'block';

    // Store results for import
    window._importResults = results;
}

// ──────────────────────────────────────────────────────────────────────
// VALIDATE IMPORT DATA
// ──────────────────────────────────────────────────────────────────────

function validateImportData(data, type) {
    const errors = [];
    const warnings = [];
    const valid = [];

    const yearId = document.getElementById('import-year')?.value;
    const termId = document.getElementById('import-term')?.value;
    const feeCatId = document.getElementById('import-fee-category')?.value;

    for (let i = 0; i < data.length; i++) {
        const row = data[i];
        let isValid = true;

        if (type === 'students') {
            if (!row['First Name'] && !row['First_Name'] && !row['FirstName']) {
                errors.push({ row: i, message: 'Missing First Name' });
                isValid = false;
            }
            if (!row['Last Name'] && !row['Last_Name'] && !row['LastName']) {
                errors.push({ row: i, message: 'Missing Last Name' });
                isValid = false;
            }
            const className = row['Class'] || row['Class Name'] || '';
            if (className) {
                const cls = state.classes.find(c => c.name === className);
                if (!cls) {
                    warnings.push({ row: i, message: `Class "${className}" not found — will be created` });
                }
            }
        } else if (type === 'marks') {
            if (!row['Student Code'] && !row['Student_Code'] && !row['Code']) {
                errors.push({ row: i, message: 'Missing Student Code' });
                isValid = false;
            }
            if (row['Score'] === undefined && row['Marks'] === undefined && row['Mark'] === undefined) {
                errors.push({ row: i, message: 'Missing Score' });
                isValid = false;
            }
            const score = parseFloat(row['Score'] || row['Marks'] || row['Mark'] || 0);
            if (isNaN(score) || score < 0) {
                errors.push({ row: i, message: 'Invalid score (must be a number ≥ 0)' });
                isValid = false;
            }
            // Validate against max marks if provided
            const maxMarks = parseFloat(row['Max Marks'] || row['Max_Marks'] || 100);
            if (score > maxMarks) {
                warnings.push({ row: i, message: `Score (${score}) exceeds max (${maxMarks})` });
            }
            // Check if year/term are valid
            if (!yearId) {
                warnings.push({ row: i, message: 'No academic year selected — marks may not appear correctly' });
            }
        } else if (type === 'payments') {
            if (!row['Student Code'] && !row['Student_Code'] && !row['Code']) {
                errors.push({ row: i, message: 'Missing Student Code' });
                isValid = false;
            }
            const amount = parseFloat(row['Amount'] || row['Amount (RWF)'] || 0);
            if (isNaN(amount) || amount <= 0) {
                errors.push({ row: i, message: 'Invalid amount (must be > 0)' });
                isValid = false;
            }
            if (!row['Date'] && !row['Payment Date']) {
                warnings.push({ row: i, message: 'Missing Date — using today' });
            }
            // Check if fee category is valid
            if (feeCatId) {
                const feeCat = state.feeCategories.find(c => c.id == feeCatId);
                if (!feeCat) {
                    warnings.push({ row: i, message: 'Selected fee category not found' });
                }
            }
        } else if (type === 'teachers') {
            if (!row['First Name'] && !row['First_Name'] && !row['FirstName']) {
                errors.push({ row: i, message: 'Missing First Name' });
                isValid = false;
            }
            if (!row['Last Name'] && !row['Last_Name'] && !row['LastName']) {
                errors.push({ row: i, message: 'Missing Last Name' });
                isValid = false;
            }
            if (!row['Username'] && !row['Username']) {
                errors.push({ row: i, message: 'Missing Username' });
                isValid = false;
            }
            if (!row['Password'] && !row['Password']) {
                errors.push({ row: i, message: 'Missing Password' });
                isValid = false;
            }
        } else if (type === 'subjects') {
            if (!row['Subject Name'] && !row['Subject_Name'] && !row['Name']) {
                errors.push({ row: i, message: 'Missing Subject Name' });
                isValid = false;
            }
        } else if (type === 'families') {
            if (!row['Family Code'] && !row['Family_Code'] && !row['Code']) {
                errors.push({ row: i, message: 'Missing Family Code' });
                isValid = false;
            }
            if (!row['Guardian Name'] && !row['Guardian_Name'] && !row['Guardian']) {
                errors.push({ row: i, message: 'Missing Guardian Name' });
                isValid = false;
            }
        }

        if (isValid) {
            valid.push(row);
        }
    }

    return { errors, warnings, valid };
}

// ──────────────────────────────────────────────────────────────────────
// EXECUTE IMPORT
// ──────────────────────────────────────────────────────────────────────

async function executeImport() {
    const results = window._importResults;
    if (!results || !results.valid.length) {
        showToast('No valid data to import', 'warning');
        return;
    }

    const skipInvalid = document.getElementById('skip-invalid')?.value === 'true';
    const updateExisting = document.getElementById('update-existing')?.value === 'true';
    const yearId = document.getElementById('import-year')?.value;
    const termId = document.getElementById('import-term')?.value;
    const feeCatId = document.getElementById('import-fee-category')?.value;
    const assessmentType = document.getElementById('import-assessment-type')?.value || 'Quiz';

    // Check if year is editable for certain imports
    if ((importType === 'students' || importType === 'marks' || importType === 'payments') && yearId) {
        const year = state.academicYears.find(y => y.id == yearId);
        if (year && !year.is_active) {
            if (!await confirmDialog(`⚠️ The selected academic year (${year.name}) is inactive. Continue anyway?`)) {
                return;
            }
        }
    }

    const total = results.valid.length;
    const errors = results.errors.length;

    if (errors > 0 && !skipInvalid) {
        showToast(`Please fix ${errors} errors before importing`, 'error');
        return;
    }

    const year = state.academicYears.find(y => y.id == yearId);
    const term = state.terms.find(t => t.id == termId);
    const feeCat = state.feeCategories.find(c => c.id == feeCatId);

    const confirmMsg = `Import ${total} record(s) into ${year?.name || 'Current Year'}${term ? ` (${term.name})` : ''}${feeCat ? ` for ${feeCat.name}` : ''}? ${errors > 0 ? `${errors} row(s) will be skipped.` : ''}`;

    if (!await confirmDialog(confirmMsg)) return;

    const btn = document.querySelector('#import-preview .btn-success');
    if (btn) { btn.disabled = true; btn.innerHTML = '<span class="loader-inline"></span> Importing...'; }

    let imported = 0;
    let failed = 0;

    try {
        const type = importType;

        if (type === 'students') {
            const result = await importStudents(results.valid, updateExisting, yearId);
            imported = result.imported;
            failed = result.failed;
        } else if (type === 'marks') {
            const result = await importMarks(results.valid, updateExisting, yearId, termId, assessmentType);
            imported = result.imported;
            failed = result.failed;
        } else if (type === 'payments') {
            const result = await importPayments(results.valid, yearId, termId, feeCatId);
            imported = result.imported;
            failed = result.failed;
        } else if (type === 'teachers') {
            const result = await importTeachers(results.valid, updateExisting);
            imported = result.imported;
            failed = result.failed;
        } else if (type === 'subjects') {
            const result = await importSubjects(results.valid, updateExisting);
            imported = result.imported;
            failed = result.failed;
        } else if (type === 'families') {
            const result = await importFamilies(results.valid, updateExisting);
            imported = result.imported;
            failed = result.failed;
        }

        const yearLabel = year?.name || 'Current Year';
        await logActivity(state.currentUser?.id, state.currentUser?.role,
            `Bulk import: ${imported} ${type} records into ${yearLabel}${term ? ` (${term.name})` : ''}`);

        if (imported > 0) {
            showToast(`✅ Imported ${imported} ${type}${failed > 0 ? ` (${failed} failed)` : ''} into ${yearLabel}`, failed > 0 ? 'warning' : 'success');
            // Refresh relevant tables
            await refreshTable(type === 'students' ? 'students' : type === 'marks' ? 'marks' : type === 'payments' ? 'payments' : type === 'teachers' ? 'teachers' : type === 'subjects' ? 'subjects' : 'families');
        } else {
            showToast('No records were imported', 'warning');
        }

        // Reset
        importData = [];
        importErrors = [];
        importWarnings = [];
        document.getElementById('import-preview').style.display = 'none';
        document.getElementById('import-file-input').value = '';

    } catch (error) {
        showToast('Import failed: ' + error.message, 'error');
    } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = '✅ Import All'; }
    }
}

// ──────────────────────────────────────────────────────────────────────
// IMPORT STUDENTS — WITH YEAR
// ──────────────────────────────────────────────────────────────────────

async function importStudents(data, updateExisting, yearId) {
    let imported = 0, failed = 0;
    const year = state.academicYears.find(y => y.id == yearId);

    for (const row of data) {
        try {
            const firstName = row['First Name'] || row['First_Name'] || row['FirstName'] || '';
            const lastName = row['Last Name'] || row['Last_Name'] || row['LastName'] || '';
            const className = row['Class'] || row['Class Name'] || '';
            const gender = row['Gender'] || '';
            const guardian = row['Guardian Name'] || row['Guardian_Name'] || row['Guardian'] || '';
            const phone = row['Guardian Phone'] || row['Guardian_Phone'] || row['Phone'] || '';
            const dob = row['DOB'] || row['Date of Birth'] || row['Date_Of_Birth'] || '';

            let classId = null;
            if (className) {
                let cls = state.classes.find(c => c.name === className);
                if (!cls) {
                    const newClass = await insert('classes', {
                        name: className,
                        level: className.includes('Nursery') ? 'Nursery' : 'Primary',
                        is_active: true,
                        created_at: new Date().toISOString(),
                    });
                    if (newClass) {
                        cls = newClass;
                        state.classes.push(cls);
                    }
                }
                if (cls) classId = cls.id;
            }

            let existing = null;
            if (updateExisting) {
                existing = state.students.find(s =>
                    s.first_name === firstName && s.last_name === lastName
                );
            }

            const studentCode = existing?.student_code || `STU-${String(state.students.length + imported + 1).padStart(4, '0')}`;

            if (existing) {
                await update('students', existing.id, {
                    first_name: firstName,
                    last_name: lastName,
                    class_id: classId,
                    gender: gender,
                    guardian_name: guardian,
                    guardian_phone: phone,
                    date_of_birth: dob || null,
                    academic_year_id: yearId || existing.academic_year_id,
                    updated_at: new Date().toISOString(),
                });
            } else {
                await insert('students', {
                    first_name: firstName,
                    last_name: lastName,
                    student_code: studentCode,
                    class_id: classId,
                    gender: gender,
                    guardian_name: guardian,
                    guardian_phone: phone,
                    date_of_birth: dob || null,
                    academic_year_id: yearId || null,
                    status: 'Active',
                    is_deleted: false,
                    created_at: new Date().toISOString(),
                });
            }
            imported++;
        } catch (e) {
            failed++;
            console.warn('[Import] Student error:', e);
        }
    }

    return { imported, failed };
}

// ──────────────────────────────────────────────────────────────────────
// IMPORT MARKS — WITH YEAR, TERM, ASSESSMENT TYPE
// ──────────────────────────────────────────────────────────────────────

async function importMarks(data, updateExisting, yearId, termId, assessmentType) {
    let imported = 0, failed = 0;

    for (const row of data) {
        try {
            const code = row['Student Code'] || row['Student_Code'] || row['Code'] || '';
            const score = parseFloat(row['Score'] || row['Marks'] || row['Mark'] || 0);
            const assessmentName = row['Assessment'] || row['Assessment Name'] || 'Imported Assessment';
            const className = row['Class'] || row['Class Name'] || '';
            const subjectName = row['Subject'] || row['Subject Name'] || '';
            const maxMarks = parseFloat(row['Max Marks'] || row['Max_Marks'] || 100);

            const student = state.students.find(s => s.student_code === code);
            if (!student) {
                failed++;
                continue;
            }

            let classId = student.class_id;
            if (className) {
                let cls = state.classes.find(c => c.name === className);
                if (!cls) {
                    const newClass = await insert('classes', {
                        name: className,
                        level: className.includes('Nursery') ? 'Nursery' : 'Primary',
                        is_active: true,
                        created_at: new Date().toISOString(),
                    });
                    if (newClass) {
                        cls = newClass;
                        state.classes.push(cls);
                    }
                }
                if (cls) classId = cls.id;
            }

            let subjectId = null;
            if (subjectName) {
                let subj = state.subjects.find(s => s.name === subjectName);
                if (!subj) {
                    const newSubj = await insert('subjects', {
                        name: subjectName,
                        level: className.includes('Nursery') ? 'Nursery' : 'Primary',
                        mg_max: maxMarks || 50,
                        ex_max: maxMarks || 50,
                        is_active: true,
                        created_at: new Date().toISOString(),
                    });
                    if (newSubj) {
                        subj = newSubj;
                        state.subjects.push(subj);
                    }
                }
                if (subj) subjectId = subj.id;
            }

            let assessmentId = null;
            if (classId && subjectId) {
                let assessment = state.assessments.find(a =>
                    a.class_id === classId &&
                    a.subject_id === subjectId &&
                    a.assessment_name === assessmentName &&
                    a.term_id == termId &&
                    a.academic_year_id == yearId
                );
                if (!assessment) {
                    const newAssessment = await insert('assessments', {
                        class_id: classId,
                        subject_id: subjectId,
                        assessment_name: assessmentName,
                        assessment_type: assessmentType || 'Quiz',
                        max_marks: maxMarks || 100,
                        term_id: termId || state.currentTerm?.id,
                        academic_year_id: yearId || state.currentAcadYear?.id,
                        created_at: new Date().toISOString(),
                    });
                    if (newAssessment) {
                        assessment = newAssessment;
                        state.assessments.push(assessment);
                    }
                }
                if (assessment) assessmentId = assessment.id;
            }

            if (!assessmentId) {
                failed++;
                continue;
            }

            let existingMark = null;
            if (updateExisting) {
                existingMark = state.marks.find(m =>
                    m.assessment_id === assessmentId &&
                    m.student_id === student.id
                );
            }

            if (existingMark) {
                await update('marks', existingMark.id, {
                    score: score,
                    updated_at: new Date().toISOString(),
                });
            } else {
                await insert('marks', {
                    assessment_id: assessmentId,
                    student_id: student.id,
                    score: score,
                    academic_year_id: yearId || state.currentAcadYear?.id,
                    term_id: termId || state.currentTerm?.id,
                    entered_by: state.currentUser?.id,
                    entered_at: new Date().toISOString(),
                });
            }
            imported++;
        } catch (e) {
            failed++;
            console.warn('[Import] Marks error:', e);
        }
    }

    return { imported, failed };
}

// ──────────────────────────────────────────────────────────────────────
// IMPORT PAYMENTS — WITH YEAR, TERM, FEE CATEGORY
// ──────────────────────────────────────────────────────────────────────

async function importPayments(data, yearId, termId, feeCatId) {
    let imported = 0, failed = 0;

    for (const row of data) {
        try {
            const code = row['Student Code'] || row['Student_Code'] || row['Code'] || '';
            const amount = parseFloat(row['Amount'] || row['Amount (RWF)'] || 0);
            const date = row['Date'] || row['Payment Date'] || new Date().toISOString().split('T')[0];
            const method = row['Method'] || row['Payment Method'] || 'Cash';
            const ref = row['Reference'] || row['Receipt'] || '';

            const student = state.students.find(s => s.student_code === code);
            if (!student) {
                failed++;
                continue;
            }

            const receiptNum = `RCP-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${String((state.payments || []).length + imported + 1).padStart(4, '0')}`;

            // Check if fee category exists
            let feeCategoryId = null;
            if (feeCatId) {
                const feeCat = state.feeCategories.find(c => c.id == feeCatId);
                if (feeCat) feeCategoryId = feeCat.id;
            }

            // Insert payment
            const payment = await insert('payments', {
                student_id: student.id,
                amount: amount,
                payment_date: date || new Date().toISOString().split('T')[0],
                payment_method: method,
                receipt_number: ref || receiptNum,
                reference: ref || null,
                recorded_by: state.currentUser?.id,
                term_id: termId || state.currentTerm?.id,
                academic_year_id: yearId || state.currentAcadYear?.id,
                fee_category_id: feeCategoryId,
                created_at: new Date().toISOString(),
            });

            if (payment) {
                // Update student_fees if fee category is specified
                if (feeCategoryId) {
                    const existingFee = state.studentFees.find(f =>
                        f.student_id === student.id &&
                        f.fee_category_id === feeCategoryId &&
                        f.term_id == (termId || state.currentTerm?.id) &&
                        f.academic_year_id == (yearId || state.currentAcadYear?.id)
                    );

                    if (existingFee) {
                        const newPaid = (existingFee.paid_amount || 0) + amount;
                        await update('student_fees', existingFee.id, {
                            paid_amount: newPaid,
                            is_paid: newPaid >= existingFee.amount,
                            updated_at: new Date().toISOString(),
                        });
                    } else {
                        // Create a fee record if it doesn't exist
                        const feeCat = state.feeCategories.find(c => c.id == feeCategoryId);
                        await insert('student_fees', {
                            student_id: student.id,
                            fee_category_id: feeCategoryId,
                            term_id: termId || state.currentTerm?.id,
                            academic_year_id: yearId || state.currentAcadYear?.id,
                            amount: amount,
                            paid_amount: amount,
                            is_paid: true,
                            is_waived: false,
                            due_date: null,
                            created_at: new Date().toISOString(),
                        });
                    }
                }
                imported++;
            } else {
                failed++;
            }
        } catch (e) {
            failed++;
            console.warn('[Import] Payment error:', e);
        }
    }

    return { imported, failed };
}

// ──────────────────────────────────────────────────────────────────────
// IMPORT TEACHERS
// ──────────────────────────────────────────────────────────────────────

async function importTeachers(data, updateExisting) {
    let imported = 0, failed = 0;

    for (const row of data) {
        try {
            const firstName = row['First Name'] || row['First_Name'] || row['FirstName'] || '';
            const lastName = row['Last Name'] || row['Last_Name'] || row['LastName'] || '';
            const username = row['Username'] || row['Username'] || '';
            const password = row['Password'] || row['Password'] || 'teacher123';
            const email = row['Email'] || row['Email'] || '';
            const phone = row['Phone'] || row['Phone'] || '';
            const role = row['Role'] || row['Role'] || 'teacher';

            if (!firstName || !lastName || !username) {
                failed++;
                continue;
            }

            let existing = null;
            if (updateExisting) {
                existing = state.teachers.find(t => t.username === username);
            }

            if (existing) {
                await update('teachers', existing.id, {
                    first_name: firstName,
                    last_name: lastName,
                    email: email,
                    phone: phone,
                    role: role,
                    updated_at: new Date().toISOString(),
                });
            } else {
                await insert('teachers', {
                    first_name: firstName,
                    last_name: lastName,
                    username: username,
                    password: password,
                    email: email,
                    phone: phone,
                    role: role,
                    status: 'active',
                    created_at: new Date().toISOString(),
                });
            }
            imported++;
        } catch (e) {
            failed++;
            console.warn('[Import] Teacher error:', e);
        }
    }

    return { imported, failed };
}

// ──────────────────────────────────────────────────────────────────────
// IMPORT SUBJECTS
// ──────────────────────────────────────────────────────────────────────

async function importSubjects(data, updateExisting) {
    let imported = 0, failed = 0;

    for (const row of data) {
        try {
            const name = row['Subject Name'] || row['Subject_Name'] || row['Name'] || '';
            const code = row['Code'] || row['Subject Code'] || row['Subject_Code'] || '';
            const level = row['Level'] || row['Level'] || 'Primary';
            const mgMax = parseInt(row['MG Max'] || row['MG_Max'] || 50);
            const exMax = parseInt(row['EX Max'] || row['EX_Max'] || 50);

            if (!name) {
                failed++;
                continue;
            }

            let existing = null;
            if (updateExisting) {
                existing = state.subjects.find(s => s.name === name);
            }

            if (existing) {
                await update('subjects', existing.id, {
                    name: name,
                    code: code || existing.code,
                    level: level,
                    mg_max: mgMax,
                    ex_max: exMax,
                    updated_at: new Date().toISOString(),
                });
            } else {
                await insert('subjects', {
                    name: name,
                    code: code || name.substring(0, 4).toUpperCase(),
                    level: level,
                    mg_max: mgMax,
                    ex_max: exMax,
                    sort_order: (state.subjects || []).length + 1,
                    is_active: true,
                    created_at: new Date().toISOString(),
                });
            }
            imported++;
        } catch (e) {
            failed++;
            console.warn('[Import] Subject error:', e);
        }
    }

    return { imported, failed };
}

// ──────────────────────────────────────────────────────────────────────
// IMPORT FAMILIES
// ──────────────────────────────────────────────────────────────────────

async function importFamilies(data, updateExisting) {
    let imported = 0, failed = 0;

    for (const row of data) {
        try {
            const code = row['Family Code'] || row['Family_Code'] || row['Code'] || '';
            const guardian = row['Guardian Name'] || row['Guardian_Name'] || row['Guardian'] || '';
            const phone = row['Guardian Phone'] || row['Guardian_Phone'] || row['Phone'] || '';
            const email = row['Guardian Email'] || row['Guardian_Email'] || row['Email'] || '';
            const address = row['Address'] || row['Address'] || '';
            const studentsStr = row['Students'] || row['Student Codes'] || '';

            if (!code || !guardian) {
                failed++;
                continue;
            }

            let existing = null;
            if (updateExisting) {
                existing = state.families.find(f => f.family_code === code);
            }

            let familyId;
            if (existing) {
                await update('families', existing.id, {
                    guardian_name: guardian,
                    guardian_phone: phone,
                    guardian_email: email,
                    address: address,
                    updated_at: new Date().toISOString(),
                });
                familyId = existing.id;
            } else {
                const newFamily = await insert('families', {
                    family_code: code,
                    guardian_name: guardian,
                    guardian_phone: phone,
                    guardian_email: email,
                    address: address,
                    created_at: new Date().toISOString(),
                });
                if (newFamily) {
                    familyId = newFamily.id;
                    state.families.push(newFamily);
                } else {
                    failed++;
                    continue;
                }
            }

            if (familyId && studentsStr) {
                const codes = studentsStr.split(',').map(c => c.trim());
                for (const c of codes) {
                    const student = state.students.find(s => s.student_code === c);
                    if (student) {
                        await update('students', student.id, {
                            family_id: familyId,
                            updated_at: new Date().toISOString(),
                        });
                    }
                }
            }
            imported++;
        } catch (e) {
            failed++;
            console.warn('[Import] Family error:', e);
        }
    }

    return { imported, failed };
}

// ──────────────────────────────────────────────────────────────────────
// DOWNLOAD IMPORT TEMPLATE
// ──────────────────────────────────────────────────────────────────────

function downloadImportTemplate() {
    const type = document.getElementById('import-type')?.value || 'students';
    let template = [];

    if (type === 'students') {
        template = [
            { 'First Name': 'John', 'Last Name': 'Doe', 'Class': 'Primary 1', 'Gender': 'Male', 'Guardian Name': 'Jane Doe', 'Guardian Phone': '+250 788 534 320' },
            { 'First Name': 'Jane', 'Last Name': 'Smith', 'Class': 'Primary 2', 'Gender': 'Female', 'Guardian Name': 'John Smith', 'Guardian Phone': '+250 788 534 321' },
        ];
    } else if (type === 'marks') {
        template = [
            { 'Student Code': 'STU-001', 'Assessment': 'Quiz 1', 'Class': 'Primary 4A', 'Subject': 'Mathematics', 'Score': 45, 'Max Marks': 50 },
            { 'Student Code': 'STU-002', 'Assessment': 'Quiz 1', 'Class': 'Primary 4A', 'Subject': 'Mathematics', 'Score': 42, 'Max Marks': 50 },
        ];
    } else if (type === 'payments') {
        template = [
            { 'Student Code': 'STU-001', 'Amount': 50000, 'Date': new Date().toISOString().split('T')[0], 'Method': 'Cash', 'Reference': 'REF-001' },
            { 'Student Code': 'STU-002', 'Amount': 45000, 'Date': new Date().toISOString().split('T')[0], 'Method': 'Mobile-Money', 'Reference': 'REF-002' },
        ];
    } else if (type === 'teachers') {
        template = [
            { 'First Name': 'John', 'Last Name': 'Doe', 'Username': 'john.doe', 'Password': 'password123', 'Email': 'john@school.com', 'Role': 'teacher' },
            { 'First Name': 'Jane', 'Last Name': 'Smith', 'Username': 'jane.smith', 'Password': 'password123', 'Email': 'jane@school.com', 'Role': 'accountant' },
        ];
    } else if (type === 'subjects') {
        template = [
            { 'Subject Name': 'Mathematics', 'Code': 'MATH', 'Level': 'Primary', 'MG Max': 50, 'EX Max': 50 },
            { 'Subject Name': 'Science', 'Code': 'SCI', 'Level': 'Primary', 'MG Max': 50, 'EX Max': 50 },
        ];
    } else if (type === 'families') {
        template = [
            { 'Family Code': 'FAM-001', 'Guardian Name': 'Jane Doe', 'Guardian Phone': '+250 788 534 320', 'Students': 'STU-001, STU-002' },
            { 'Family Code': 'FAM-002', 'Guardian Name': 'John Smith', 'Guardian Phone': '+250 788 534 321', 'Students': 'STU-003' },
        ];
    }

    exportToExcel(template, `${type}_Import_Template`);
    showToast('✅ Template downloaded', 'success');
}

// ──────────────────────────────────────────────────────────────────────
// RESET IMPORT
// ──────────────────────────────────────────────────────────────────────

function resetImport() {
    importData = [];
    importErrors = [];
    importWarnings = [];
    document.getElementById('import-preview').style.display = 'none';
    document.getElementById('import-file-input').value = '';
    showToast('Import cleared', 'info', 1500);
}