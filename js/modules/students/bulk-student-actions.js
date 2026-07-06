// ============================================================
// BULK STUDENT ACTIONS MODULE - Bulk import/export operations
// ============================================================


// Render Bulk Import page
async function renderBulkImport(container) {
    if (!isAdmin()) {
        container.innerHTML = '<div class="alert alert-danger">Access denied. Admin privileges required.</div>';
        return;
    }

    container.innerHTML = `
        <div class="dash-card">
            <div class="dash-card-header"><span class="dash-card-title">📤 Bulk Import Students</span></div>
            <div class="dash-card-body">
                <div class="alert alert-info">Upload an Excel file (.xlsx) with columns: <strong>First Name, Last Name, Class, Gender, Guardian Name, Guardian Phone</strong>.</div>
                <div style="margin:var(--lg) 0;display:flex;gap:var(--md);flex-wrap:wrap;align-items:center">
                    <button class="btn btn-outline" onclick="downloadImportTemplate()">📥 Download Template</button>
                    <input type="file" id="bulk-file" accept=".xlsx,.xls,.csv" style="display:none" onchange="previewBulkImport()">
                    <button class="btn btn-primary" onclick="document.getElementById('bulk-file').click()">📂 Choose File</button>
                </div>
                <div id="bulk-preview"></div>
            </div>
        </div>
    `;
}

// Download import template
window.downloadImportTemplate = function () {
    const data = [{ 'First Name': 'John', 'Last Name': 'Doe', 'Class': 'PRIMARY 1', 'Gender': 'Male', 'Guardian Name': 'Jane Doe', 'Guardian Phone': '+250 789 000 001' }];
    exportToExcel(data, 'StudentImport_Template');
    showToast('✅ Template downloaded', 'success');
};

// Preview bulk import
window.previewBulkImport = async function () {
    const file = document.getElementById('bulk-file')?.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async ev => {
        const wb = XLSX.read(ev.target.result, { type: 'array' });
        const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
        const prev = document.getElementById('bulk-preview');
        prev.innerHTML = `<div class="alert alert-info">Found <strong>${rows.length}</strong> rows. Preview (first 5):</div>
            <div class="table-wrapper"><table class="data-table"><thead><tr>${Object.keys(rows[0] || {}).map(k => `<th>${esc(k)}</th>`).join('')}</thead><tbody>${rows.slice(0, 5).map(r => `<tr>${Object.values(r).map(v => `<td>${esc(v)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>
            <button class="btn btn-success" onclick="executeBulkImport(${JSON.stringify(rows).replace(/"/g, '&quot;')})">✅ Import All ${rows.length} Students</button>`;
    };
    reader.readAsArrayBuffer(file);
};

// Execute bulk import
window.executeBulkImport = async function (rows) {
    let ok = 0, err = 0;
    for (const row of rows) {
        const firstName = row['First Name'] || row['first_name'] || '';
        const lastName = row['Last Name'] || row['last_name'] || '';
        const className = row['Class'] || row['class'] || '';
        const cls = (state.classes || []).find(c => c.name.toLowerCase() === className.toLowerCase());
        if (!firstName || !lastName || !cls) { err++; continue; }
        const code = `IMP${Date.now().toString().slice(-6)}`;
        await insert('students', {
            student_code: code, first_name: firstName, last_name: lastName,
            class_id: cls.id, gender: row['Gender'] || null,
            guardian_name: row['Guardian Name'] || '—',
            guardian_phone: row['Guardian Phone'] || null,
            status: 'Active', is_deleted: false,
            created_at: new Date().toISOString()
        });
        ok++;
    }
    await refreshTable('students');
    showToast(`✅ Imported ${ok} students (${err} skipped)`, 'success');
    navigateTo('student-list');
};

// Render Bulk Export page
async function renderBulkExport(container) {
    if (!isAdmin()) {
        container.innerHTML = '<div class="alert alert-danger">Access denied. Admin privileges required.</div>';
        return;
    }

    container.innerHTML = `
        <div class="dash-card">
            <div class="dash-card-header"><span class="dash-card-title">📥 Bulk Export Data</span></div>
            <div class="dash-card-body">
                <div class="form-grid">
                    <div class="form-group"><label>Export Type</label><select id="bulk-export-type" onchange="updateBulkExportOptions()"><option value="students">Students</option><option value="teachers">Teachers</option><option value="marks">Marks</option><option value="payments">Payments</option></select></div>
                    <div class="form-group" id="bulk-export-class-group" style="display:none"><label>Class</label><select id="bulk-export-class"><option value="">All Classes</option>${(state.classes || []).map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select></div>
                    <div class="form-group" id="bulk-export-term-group" style="display:none"><label>Term</label><select id="bulk-export-term"><option value="">All Terms</option>${(state.terms || []).map(t => `<option value="${t.id}">${esc(t.name)}</option>`).join('')}</select></div>
                    <div class="form-group"><label>Format</label><select id="bulk-export-format"><option value="excel">Excel (.xlsx)</option><option value="csv">CSV (.csv)</option></select></div>
                </div>
                <div class="btn-group"><button class="btn btn-primary" onclick="executeBulkExport()">📥 Export Data</button><button class="btn btn-outline" onclick="resetBulkExportFilters()">Reset Filters</button></div>
                <div id="bulk-export-preview" style="margin-top:20px;display:none" class="alert alert-info"></div>
            </div>
        </div>
    `;
}

// Update bulk export options
window.updateBulkExportOptions = function () {
    const type = document.getElementById('bulk-export-type').value;
    const classGroup = document.getElementById('bulk-export-class-group');
    const termGroup = document.getElementById('bulk-export-term-group');
    classGroup.style.display = (type === 'students' || type === 'marks') ? 'block' : 'none';
    termGroup.style.display = (type === 'marks' || type === 'assessments') ? 'block' : 'none';
};

// Reset bulk export filters
window.resetBulkExportFilters = function () {
    document.getElementById('bulk-export-type').value = 'students';
    document.getElementById('bulk-export-class').value = '';
    document.getElementById('bulk-export-term').value = '';
    document.getElementById('bulk-export-format').value = 'excel';
    updateBulkExportOptions();
    document.getElementById('bulk-export-preview').style.display = 'none';
};

// Execute bulk export
window.executeBulkExport = async function () {
    const type = document.getElementById('bulk-export-type').value;
    const classId = document.getElementById('bulk-export-class')?.value;
    const termId = document.getElementById('bulk-export-term')?.value;
    const format = document.getElementById('bulk-export-format').value;

    let data = [], filename = '';

    switch (type) {
        case 'students':
            let students = [...(state.students || [])];
            if (classId) students = students.filter(s => s.class_id == classId);
            data = students.map(s => ({
                'Code': s.student_code, 'First Name': s.first_name, 'Last Name': s.last_name,
                'Class': getClassById(s.class_id)?.name, 'Gender': s.gender,
                'Guardian': s.guardian_name, 'Guardian Phone': s.guardian_phone,
                'Status': s.status, 'Enrolled': fmtDate(s.enrollment_date)
            }));
            filename = 'Students_Export';
            break;
        case 'teachers':
            data = (state.teachers || []).map(t => ({ 'Name': t.name, 'Email': t.email, 'Username': t.username, 'Role': t.role, 'Status': t.is_active ? 'Active' : 'Inactive' }));
            filename = 'Teachers_Export';
            break;
        case 'marks':
            let marks = [...(state.marks || [])];
            if (classId) marks = marks.filter(m => { const a = (state.assessments || []).find(x => x.id === m.assessment_id); return a?.class_id == classId; });
            if (termId) marks = marks.filter(m => { const a = (state.assessments || []).find(x => x.id === m.assessment_id); return a?.term_id == termId; });
            data = marks.map(m => {
                const a = (state.assessments || []).find(x => x.id === m.assessment_id);
                const s = getStudentById(m.student_id);
                return { 'Student': s ? `${s.first_name} ${s.last_name}` : '—', 'Assessment': a?.assessment_name, 'Score': m.score, 'Max': a?.max_marks };
            });
            filename = 'Marks_Export';
            break;
        case 'payments':
            data = (state.payments || []).map(p => {
                const s = getStudentById(p.student_id);
                return { 'Receipt': p.receipt_number, 'Date': fmtDate(p.payment_date), 'Student': s ? `${s.first_name} ${s.last_name}` : '—', 'Amount (RWF)': p.amount, 'Method': p.payment_method };
            });
            filename = 'Payments_Export';
            break;
    }

    if (data.length === 0) { showToast('No data to export', 'warning'); return; }
    const preview = document.getElementById('bulk-export-preview');
    preview.style.display = 'block';
    preview.innerHTML = `📊 Found <strong>${data.length}</strong> records to export.`;
    if (format === 'excel') exportToExcel(data, filename);
    else { const ws = XLSX.utils.json_to_sheet(data); const csv = XLSX.utils.sheet_to_csv(ws); downloadBlob(csv, `${filename}.csv`, 'text/csv'); }
    showToast(`✅ Exported ${data.length} records`, 'success');
};

export { renderBulkImport };
