// js/modules/timetable-import.js
// Timetable Import Module - Import timetable from Excel/CSV files


let _timetableImportPreview = [];

async function renderTimetableImport(container) {
    await ensureStateLoaded();

    const user = state.currentUser;
    if (user?.role !== 'admin') {
        container.innerHTML = '<div class="alert alert-danger">Access denied. Admin privileges required.</div>';
        return;
    }

    container.innerHTML = `
        <div class="dash-card">
            <div class="dash-card-header">
                <span class="dash-card-title">📤 Import Timetable from Excel/CSV</span>
            </div>
            <div class="dash-card-body">
                <div class="alert alert-info">
                    <strong>File Format Requirements:</strong><br>
                    Columns: Day, Time Slot, Class Name, Subject Name, Teacher Name, Room (optional)<br>
                    <button class="btn btn-sm btn-outline" onclick="window.downloadImportTemplate()" style="margin-top:8px">📥 Download Template</button>
                </div>
                
                <div class="form-grid" style="margin-bottom:20px">
                    <div class="form-group full">
                        <label>Import File (.xlsx, .xls, .csv)</label>
                        <input type="file" id="timetable-import-file" accept=".xlsx,.xls,.csv" class="form-control">
                    </div>
                    <div class="form-group">
                        <label>Import Action</label>
                        <select id="import-action" class="form-control">
                            <option value="append">Append to existing slots</option>
                            <option value="replace_class">Replace slots for matching classes</option>
                            <option value="clear_all">Clear all slots before import</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Skip invalid rows</label>
                        <select id="skip-invalid" class="form-control">
                            <option value="true">Yes - Skip invalid rows</option>
                            <option value="false">No - Show errors</option>
                        </select>
                    </div>
                </div>
                
                <div class="btn-group">
                    <button class="btn btn-primary" onclick="window.previewTimetableImport()">👁️ Preview Import</button>
                    <button class="btn btn-success" id="execute-import-btn" style="display:none" onclick="window.executeTimetableImport()">✅ Execute Import</button>
                </div>
                
                <div id="import-preview-container" style="margin-top:20px; display:none">
                    <h4>📋 Import Preview</h4>
                    <div id="import-preview-table" class="table-wrapper"></div>
                </div>
            </div>
        </div>
    `;

    window.downloadImportTemplate = downloadImportTemplate;
    window.previewTimetableImport = previewTimetableImport;
    window.executeTimetableImport = executeTimetableImport;
}

function downloadImportTemplate() {
    const templateData = [
        { Day: 'Monday', 'Time Slot': '08:20-09:00', 'Class Name': 'PRIMARY 4', 'Subject Name': 'Mathematics', 'Teacher Name': 'John DOE', Room: '101' },
        { Day: 'Monday', 'Time Slot': '09:00-09:40', 'Class Name': 'PRIMARY 4', 'Subject Name': 'English', 'Teacher Name': 'Jane SMITH', Room: '101' },
        { Day: 'Tuesday', 'Time Slot': '08:20-09:00', 'Class Name': 'PRIMARY 4', 'Subject Name': 'Science', 'Teacher Name': 'John DOE', Room: '102' }
    ];
    exportToExcel(templateData, 'Timetable_Import_Template');
    showToast('✅ Template downloaded', 'success');
}

async function previewTimetableImport() {
    const file = document.getElementById('timetable-import-file')?.files[0];
    if (!file) {
        showToast('Please select a file to import', 'warning');
        return;
    }

    const skipInvalid = document.getElementById('skip-invalid')?.value === 'true';

    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const sheet = workbook.Sheets[workbook.SheetNames[0]];
            const rows = XLSX.utils.sheet_to_json(sheet);

            _timetableImportPreview = [];
            let validRows = 0;
            let invalidRows = 0;

            for (const row of rows) {
                const day = row.Day || row.day || '';
                const timeSlot = row['Time Slot'] || row.time_slot || row.Time || '';
                const className = row['Class Name'] || row.class_name || row.Class || '';
                const subjectName = row['Subject Name'] || row.subject_name || row.Subject || '';
                const teacherName = row['Teacher Name'] || row.teacher_name || row.Teacher || '';
                const room = row.Room || row.room || '';

                const cls = state.classes.find(c => c.name.toLowerCase() === className.toLowerCase());
                const subject = state.subjects.find(s => s.name.toLowerCase() === subjectName.toLowerCase());
                const teacher = state.teachers.find(t => t.name.toLowerCase() === teacherName.toLowerCase());

                const isValid = day && timeSlot && cls && subject && teacher;

                _timetableImportPreview.push({
                    day, timeSlot, className, subjectName, teacherName, room,
                    classId: cls?.id,
                    subjectId: subject?.id,
                    teacherId: teacher?.id,
                    valid: isValid,
                    error: !isValid ? 'Missing or invalid reference' : null
                });

                if (isValid) validRows++;
                else invalidRows++;
            }

            const previewContainer = document.getElementById('import-preview-container');
            const previewTable = document.getElementById('import-preview-table');
            const executeBtn = document.getElementById('execute-import-btn');

            if (validRows === 0) {
                previewTable.innerHTML = `<div class="alert alert-danger">No valid rows found. Please check your data.</div>`;
                executeBtn.style.display = 'none';
            } else {
                previewTable.innerHTML = `
                    <div class="alert alert-info">Found ${validRows} valid rows, ${invalidRows} invalid rows</div>
                    <table class="data-table">
                        <thead>
                            <tr>
                                <th>Day</th><th>Time Slot</th><th>Class</th><th>Subject</th><th>Teacher</th><th>Room</th><th>Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${_timetableImportPreview.map(row => `
                                <tr>
                                    <td>${esc(row.day)}</span>
                                    <td>${esc(row.timeSlot)}</span>
                                    <td>${esc(row.className)}</span>
                                    <td>${esc(row.subjectName)}</span>
                                    <td>${esc(row.teacherName)}</span>
                                    <td>${esc(row.room)}</span>
                                    <td><span class="badge ${row.valid ? 'badge-success' : 'badge-danger'}">${row.valid ? '✅ Valid' : '❌ Invalid'}</span></span>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                `;
                executeBtn.style.display = 'inline-flex';
            }

            previewContainer.style.display = 'block';

        } catch (err) {
            showToast('Error reading file: ' + err.message, 'error');
        }
    };
    reader.readAsArrayBuffer(file);
}

async function executeTimetableImport() {
    const action = document.getElementById('import-action')?.value;
    const skipInvalid = document.getElementById('skip-invalid')?.value === 'true';

    const validRows = _timetableImportPreview.filter(row => row.valid);

    if (validRows.length === 0) {
        showToast('No valid rows to import', 'warning');
        return;
    }

    if (!await confirmDialog(`Import ${validRows.length} timetable slots?\n\nAction: ${action === 'append' ? 'Append to existing' : action === 'replace_class' ? 'Replace for matching classes' : 'Clear all first'}`)) return;

    // Handle clear_all
    if (action === 'clear_all') {
        await removeWhere('timetable_slots', 'id IS NOT NULL');
        showToast('Cleared all existing slots', 'info');
    }

    let imported = 0;
    let skipped = 0;
    let errors = 0;

    for (const row of validRows) {
        try {
            // Check if slot already exists
            const existing = await getAll('timetable_slots', {
                class_id: row.classId,
                day: row.day,
                time_slot: row.timeSlot
            });

            if (action === 'replace_class' && existing.length > 0) {
                await update('timetable_slots', existing[0].id, {
                    subject_id: row.subjectId,
                    teacher_id: row.teacherId,
                    room: row.room || null
                });
                imported++;
            } else if (existing.length === 0) {
                await insert('timetable_slots', {
                    class_id: row.classId,
                    subject_id: row.subjectId,
                    teacher_id: row.teacherId,
                    day: row.day,
                    time_slot: row.timeSlot,
                    room: row.room || null,
                    created_at: new Date().toISOString()
                });
                imported++;
            } else {
                skipped++;
            }
        } catch (err) {
            errors++;
            console.error('Import error:', err);
        }
    }

    await refreshTable('timetable_slots');

    showToast(`✅ Imported ${imported} slots (${skipped} skipped, ${errors} errors)`, errors === 0 ? 'success' : 'warning');

    document.getElementById('execute-import-btn').style.display = 'none';
    document.getElementById('import-preview-container').style.display = 'none';
    document.getElementById('timetable-import-file').value = '';
}

export { renderTimetableImport };
