/**
 * ECOLE LA FONTAINE — Attendance Entry Module
 * Daily attendance recording with bulk actions and offline support
 * Last updated: 2026-07-03
 * 
 * CHANGES:
 * - Students filtered by active academic year
 * - Attendance records linked to academic year
 * - Shows warning when viewing inactive year
 * - Prevents attendance recording in inactive years
 * - Year indicator in UI
 */


const state = window.state || {}; // global state alias
import {
    state,
    getClassById,
    getCurrentUser,
    isAdmin,
    isTeacher,
    isAccountant,
    getCurrentAcademicYear,
    getActiveAcademicYearId,
    isCurrentYearEditable,
    getCurrentYearStudents
} from '../../core/state.js';
import { esc, fmtDate } from '../../core/utils.js';
import { insert, update, getAll, remove } from '../../core/api.js';
import { notifyAction } from '../../core/notifications.js';
import { exportToExcel } from '../../core/utils.js';

// ──────────────────────────────────────────────────────────────────────
// STATE
// ──────────────────────────────────────────────────────────────────────

let currentAttendance = {};
let currentClassId = null;
let currentDate = null;
let selectedYearId = null;

// ──────────────────────────────────────────────────────────────────────
// MAIN RENDER FUNCTION
// ──────────────────────────────────────────────────────────────────────

export async function renderAttendanceEntry(container) {
    if (!container) return;

    const user = getCurrentUser();
    if (!isAdmin() && !isTeacher() && !isAccountant()) {
        container.innerHTML = '<div class="alert alert-danger">Access denied.</div>';
        return;
    }

    await ensureStateLoaded();

    const currentYear = getCurrentAcademicYear();
    const isEditable = isCurrentYearEditable();

    let classes = (state.classes || []).filter(c => c.is_active !== false)
        .sort((a, b) => (a.sort_order || 99) - (b.sort_order || 99));

    if (isTeacher()) {
        const assignments = await getAll('teacher_assignments', { teacher_id: user.id });
        const classIds = new Set(assignments.map(a => a.class_id));
        // Also include classes where user is class teacher
        const classTeacherClasses = classes.filter(c => c.class_teacher_id === user.id);
        classIds.forEach(id => classIds.add(id));
        classes = classes.filter(c => classIds.has(c.id) || classTeacherClasses.some(ct => ct.id === c.id));
    }

    const today = new Date().toISOString().split('T')[0];

    // Check if today is a holiday
    const isTodayHoliday = isHoliday(today);

    container.innerHTML = `
        <div class="dash-card">
            <div class="dash-card-header">
                <span class="dash-card-title">📋 Daily Attendance Entry</span>
                <div class="btn-group">
                    <button class="btn btn-sm btn-outline" onclick="window.navigateTo('attendance-reports')">📊 Reports</button>
                    <button class="btn btn-sm btn-outline" onclick="window.navigateTo('attendance-summary')">📈 Summary</button>
                    <button class="btn btn-sm btn-outline" onclick="window._refreshAttendance()">🔄 Refresh</button>
                </div>
            </div>
            <div class="dash-card-body">
                <div class="alert alert-info" style="font-size:0.85rem;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">
                    <div>
                        <strong>📅 Academic Year:</strong> ${esc(currentYear?.name || 'Current Year')}
                        <span class="badge ${isEditable ? 'badge-success' : 'badge-warning'}" style="margin-left:8px;">
                            ${isEditable ? '🟢 Active (Editable)' : '🔒 Inactive (Read-only)'}
                        </span>
                    </div>
                    ${isTodayHoliday ? '<span class="badge badge-warning">🏖️ Holiday — No attendance required</span>' : ''}
                </div>

                <div class="form-grid" style="margin-bottom:16px;">
                    <div class="form-group">
                        <label>Class *</label>
                        <select id="att-class" onchange="window._loadAttendanceStudents()" style="padding:8px 12px;border-radius:6px;border:1px solid var(--border-medium);width:100%;">
                            <option value="">-- Select Class --</option>
                            ${classes.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Date *</label>
                        <input type="date" id="att-date" value="${today}" onchange="window._loadAttendanceStudents()" style="padding:8px 12px;border-radius:6px;border:1px solid var(--border-medium);width:100%;">
                        ${isTodayHoliday ? `<small style="color:var(--warning);">⚠️ This date is a holiday</small>` : ''}
                    </div>
                    <div class="form-group" style="align-self:flex-end;">
                        <button class="btn btn-primary" onclick="window._loadAttendanceStudents()" style="width:100%;">📋 Load</button>
                    </div>
                </div>

                <div id="att-toolbar" style="display:none;margin-bottom:12px;">
                    <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
                        <strong id="att-summary-line" style="color:var(--text-muted);font-size:0.85rem;"></strong>
                        <button class="btn btn-sm btn-success" onclick="window._markAllPresent()" ${!isEditable ? 'disabled' : ''}>✅ All Present</button>
                        <button class="btn btn-sm btn-outline" onclick="window._markAllAbsent()" ${!isEditable ? 'disabled' : ''}>❌ All Absent</button>
                        <button class="btn btn-sm btn-outline" onclick="window._markAllLate()" ${!isEditable ? 'disabled' : ''}>⏰ All Late</button>
                        <button class="btn btn-sm btn-outline" onclick="window._exportAttendanceDay()">📥 Export</button>
                        ${!isEditable ? '<span class="badge badge-warning" style="margin-left:8px;">🔒 Read-only — Cannot save</span>' : ''}
                    </div>
                </div>

                <div id="attendance-students-container"></div>

                <div id="att-save-row" style="display:none;margin-top:16px;">
                    <button class="btn btn-success" onclick="window._saveAttendance()" ${!isEditable ? 'disabled' : ''}>💾 Save Attendance</button>
                    <button class="btn btn-outline" onclick="window._clearAttendance()" ${!isEditable ? 'disabled' : ''}>🗑️ Clear</button>
                    ${!isEditable ? '<span style="margin-left:12px;font-size:0.8rem;color:var(--text-muted);">🔒 Inactive year — changes not allowed</span>' : ''}
                </div>
            </div>
        </div>

        <div class="dash-card" style="margin-top:20px;" id="att-absent-report" style="display:none;">
            <div class="dash-card-header">
                <span class="dash-card-title">❌ Absent Students</span>
            </div>
            <div class="dash-card-body" id="att-absent-list">
                <p style="color:var(--text-muted);">Save attendance first to see the absent report.</p>
            </div>
        </div>
    `;

    window._loadAttendanceStudents = loadAttendanceStudents;
    window._markAllPresent = markAllPresent;
    window._markAllAbsent = markAllAbsent;
    window._markAllLate = markAllLate;
    window._saveAttendance = saveAttendance;
    window._clearAttendance = clearAttendance;
    window._exportAttendanceDay = exportAttendanceDay;
    window._refreshAttendance = refreshAttendance;
    window._updateAttSummary = updateAttSummary;
}

// ──────────────────────────────────────────────────────────────────────
// LOAD ATTENDANCE STUDENTS
// ──────────────────────────────────────────────────────────────────────

async function loadAttendanceStudents() {
    const classId = document.getElementById('att-class')?.value;
    const date = document.getElementById('att-date')?.value;
    const container = document.getElementById('attendance-students-container');
    const toolbar = document.getElementById('att-toolbar');
    const saveRow = document.getElementById('att-save-row');

    if (!container) return;

    if (!classId || !date) {
        container.innerHTML = '<div class="alert alert-info">Select a class and date to load attendance.</div>';
        if (toolbar) toolbar.style.display = 'none';
        if (saveRow) saveRow.style.display = 'none';
        return;
    }

    currentClassId = parseInt(classId);
    currentDate = date;

    // Get current academic year
    const currentYear = getCurrentAcademicYear();
    const isEditable = isCurrentYearEditable();

    container.innerHTML = '<div class="loading-container"><div class="spinner"></div><p>Loading students...</p></div>';

    // Filter students by current academic year AND active status
    const students = (state.students || [])
        .filter(s => s.class_id === currentClassId &&
            s.status === 'Active' &&
            s.academic_year_id === currentYear?.id)
        .sort((a, b) => a.last_name.localeCompare(b.last_name));

    if (!students.length) {
        container.innerHTML = `
            <div class="alert alert-warning">
                No active students in this class for the current academic year (${esc(currentYear?.name || 'Current Year')}).
                ${!isEditable ? '<br><span style="font-size:0.85rem;">🔒 This year is inactive — no attendance can be recorded.</span>' : ''}
            </div>
        `;
        if (toolbar) toolbar.style.display = 'none';
        if (saveRow) saveRow.style.display = 'none';
        return;
    }

    // Check if date is a holiday
    if (isHoliday(date)) {
        container.innerHTML = `
            <div class="alert alert-warning">
                🏖️ <strong>Holiday Notice:</strong> ${fmtDate(date)} is a holiday.
                <br>No attendance is required on this day.
                <br><span style="font-size:0.85rem;color:var(--text-muted);">You can still record attendance if needed.</span>
            </div>
        `;
        // Continue loading — teacher might still want to mark attendance
    }

    // Load existing attendance for this date
    let existing = [];
    try {
        const result = await getAll('attendance', {
            class_id: currentClassId,
            date: date,
        });
        existing = result || [];
    } catch (e) {
        existing = [];
    }

    const existingMap = new Map();
    for (const rec of existing) {
        existingMap.set(rec.student_id, rec);
    }

    currentAttendance = {};

    // Build table
    let rows = students.map((student, idx) => {
        const rec = existingMap.get(student.id);
        const status = rec?.status || 'present';
        const notes = rec?.notes || '';

        currentAttendance[student.id] = status;

        return `
            <tr>
                <td style="text-align:center;font-weight:600;color:var(--text-muted);">${idx + 1}</td>
                <td><strong>${esc(student.first_name)} ${esc(student.last_name)}</strong><br><small style="color:var(--text-muted);">${esc(student.student_code || '')}</small></td>
                <td>${esc(getClassById(student.class_id)?.name || '—')}</td>
                <td>
                    <select id="att-status-${student.id}" onchange="window._updateAttSummary()" style="padding:4px 8px;border-radius:4px;border:1px solid var(--border-medium);" ${!isEditable ? 'disabled' : ''}>
                        <option value="present" ${status === 'present' ? 'selected' : ''}>✅ Present</option>
                        <option value="absent" ${status === 'absent' ? 'selected' : ''}>❌ Absent</option>
                        <option value="late" ${status === 'late' ? 'selected' : ''}>⏰ Late</option>
                        <option value="excused" ${status === 'excused' ? 'selected' : ''}>📋 Excused</option>
                    </select>
                </td>
                <td>
                    <input type="text" id="att-note-${student.id}" value="${esc(notes)}" placeholder="Note…" style="padding:4px 8px;border-radius:4px;border:1px solid var(--border-medium);width:100%;max-width:200px;" ${!isEditable ? 'disabled' : ''}>
                </td>
            </tr>
        `;
    });

    container.innerHTML = `
        <div class="table-wrapper">
            <table class="data-table" style="font-size:0.85rem;">
                <thead>
                    <tr>
                        <th style="width:40px;">#</th>
                        <th>Student</th>
                        <th>Class</th>
                        <th style="width:160px;">Status</th>
                        <th>Note</th>
                    </tr>
                </thead>
                <tbody>${rows.join('')}</tbody>
            </table>
        </div>
        ${!isEditable ? `
            <div style="padding:12px;background:var(--warning-bg);border-radius:6px;margin-top:12px;text-align:center;color:var(--warning);font-size:0.85rem;">
                🔒 This academic year is inactive. Attendance changes will not be saved.
            </div>
        ` : ''}
        ${isHoliday(date) ? `
            <div style="padding:12px;background:var(--info-bg);border-radius:6px;margin-top:8px;text-align:center;color:var(--info);font-size:0.8rem;">
                🏖️ ${fmtDate(date)} is a holiday. Attendance is optional.
            </div>
        ` : ''}
    `;

    if (toolbar) toolbar.style.display = '';
    if (saveRow) saveRow.style.display = isEditable ? '' : 'none';

    updateAttSummary();
    updateAbsentReport(existingMap);
}

// ──────────────────────────────────────────────────────────────────────
// UPDATE ATTENDANCE SUMMARY
// ──────────────────────────────────────────────────────────────────────

function updateAttSummary() {
    const classId = document.getElementById('att-class')?.value;
    if (!classId) return;

    const currentYear = getCurrentAcademicYear();
    const students = (state.students || [])
        .filter(s => s.class_id == classId && s.status === 'Active' && s.academic_year_id === currentYear?.id);

    let present = 0, absent = 0, late = 0, excused = 0;

    for (const s of students) {
        const val = document.getElementById(`att-status-${s.id}`)?.value || 'present';
        if (val === 'present') present++;
        else if (val === 'absent') absent++;
        else if (val === 'late') late++;
        else if (val === 'excused') excused++;
        currentAttendance[s.id] = val;
    }

    const el = document.getElementById('att-summary-line');
    if (el) {
        const total = students.length;
        const isEditable = isCurrentYearEditable();
        el.textContent = `Total: ${total} | ✅ ${present} | ❌ ${absent} | ⏰ ${late} | 📋 ${excused}${!isEditable ? ' | 🔒 Read-only' : ''}`;
    }
}

// ──────────────────────────────────────────────────────────────────────
// UPDATE ABSENT REPORT
// ──────────────────────────────────────────────────────────────────────

function updateAbsentReport(existingMap) {
    const classId = document.getElementById('att-class')?.value;
    const absentDiv = document.getElementById('att-absent-report');
    const absentList = document.getElementById('att-absent-list');

    if (!classId || !absentDiv || !absentList) return;

    const currentYear = getCurrentAcademicYear();
    const students = (state.students || [])
        .filter(s => s.class_id == classId && s.status === 'Active' && s.academic_year_id === currentYear?.id);

    const absentStudents = students.filter(s => {
        const status = document.getElementById(`att-status-${s.id}`)?.value || 'present';
        return status === 'absent';
    });

    if (absentStudents.length) {
        absentDiv.style.display = 'block';
        absentList.innerHTML = absentStudents.map(s => `
            <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--border-light);">
                <span><strong>${esc(s.first_name)} ${esc(s.last_name)}</strong></span>
                <span style="color:var(--text-muted);">${esc(s.student_code || '')}</span>
                <span>
                    <button class="btn btn-sm btn-outline" onclick="document.getElementById('att-status-${s.id}').value='present';window._updateAttSummary();" style="padding:2px 8px;font-size:0.7rem;">✅ Mark Present</button>
                </span>
            </div>
        `).join('');
    } else {
        absentDiv.style.display = 'block';
        absentList.innerHTML = '<p style="color:var(--text-muted);">🎉 No absent students!</p>';
    }
}

// ──────────────────────────────────────────────────────────────────────
// MARK ALL PRESENT
// ──────────────────────────────────────────────────────────────────────

function markAllPresent() {
    const classId = document.getElementById('att-class')?.value;
    if (!classId) return;

    if (!isCurrentYearEditable()) {
        showToast('🔒 Cannot edit attendance in inactive year', 'warning');
        return;
    }

    const currentYear = getCurrentAcademicYear();
    const students = (state.students || [])
        .filter(s => s.class_id == classId && s.status === 'Active' && s.academic_year_id === currentYear?.id);

    for (const s of students) {
        const sel = document.getElementById(`att-status-${s.id}`);
        if (sel) sel.value = 'present';
    }

    updateAttSummary();
    showToast('All marked Present', 'info', 1500);
}

// ──────────────────────────────────────────────────────────────────────
// MARK ALL ABSENT
// ──────────────────────────────────────────────────────────────────────

function markAllAbsent() {
    const classId = document.getElementById('att-class')?.value;
    if (!classId) return;

    if (!isCurrentYearEditable()) {
        showToast('🔒 Cannot edit attendance in inactive year', 'warning');
        return;
    }

    const currentYear = getCurrentAcademicYear();
    const students = (state.students || [])
        .filter(s => s.class_id == classId && s.status === 'Active' && s.academic_year_id === currentYear?.id);

    for (const s of students) {
        const sel = document.getElementById(`att-status-${s.id}`);
        if (sel) sel.value = 'absent';
    }

    updateAttSummary();
    showToast('All marked Absent', 'info', 1500);
}

// ──────────────────────────────────────────────────────────────────────
// MARK ALL LATE
// ──────────────────────────────────────────────────────────────────────

function markAllLate() {
    const classId = document.getElementById('att-class')?.value;
    if (!classId) return;

    if (!isCurrentYearEditable()) {
        showToast('🔒 Cannot edit attendance in inactive year', 'warning');
        return;
    }

    const currentYear = getCurrentAcademicYear();
    const students = (state.students || [])
        .filter(s => s.class_id == classId && s.status === 'Active' && s.academic_year_id === currentYear?.id);

    for (const s of students) {
        const sel = document.getElementById(`att-status-${s.id}`);
        if (sel) sel.value = 'late';
    }

    updateAttSummary();
    showToast('All marked Late', 'info', 1500);
}

// ──────────────────────────────────────────────────────────────────────
// SAVE ATTENDANCE
// ──────────────────────────────────────────────────────────────────────

async function saveAttendance() {
    const classId = document.getElementById('att-class')?.value;
    const date = document.getElementById('att-date')?.value;

    if (!classId || !date) {
        showToast('Select class and date first', 'warning');
        return;
    }

    // Check if year is editable
    if (!isCurrentYearEditable()) {
        showToast('🔒 Cannot save attendance in inactive academic year', 'warning');
        return;
    }

    const currentYear = getCurrentAcademicYear();
    const students = (state.students || [])
        .filter(s => s.class_id == classId && s.status === 'Active' && s.academic_year_id === currentYear?.id);

    if (!students.length) {
        showToast('No students loaded', 'warning');
        return;
    }

    const btn = document.querySelector('#att-save-row .btn-success');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-sm"></span> Saving...';

    let saved = 0;
    let errors = 0;

    try {
        for (const s of students) {
            const status = document.getElementById(`att-status-${s.id}`)?.value || 'present';
            const notes = document.getElementById(`att-note-${s.id}`)?.value || '';

            // Check if record exists
            const existing = await getAll('attendance', {
                student_id: s.id,
                date: date,
            });

            const payload = {
                student_id: s.id,
                class_id: parseInt(classId),
                date: date,
                status: status,
                notes: notes,
                academic_year_id: currentYear?.id,  // ← Store academic year
                term_id: state.currentTerm?.id,     // ← Store term
                recorded_by: getCurrentUser()?.username || getCurrentUser()?.name || '',
                updated_at: new Date().toISOString(),
            };

            let result;
            if (existing && existing.length > 0) {
                result = await update('attendance', existing[0].id, payload);
            } else {
                result = await insert('attendance', {
                    ...payload,
                    created_at: new Date().toISOString(),
                });
            }

            if (result) saved++;
            else errors++;
        }

        await notifyAction('attendance_recorded', {
            message: `Attendance recorded for ${saved} students on ${date} (${currentYear?.name || 'Current Year'})`,
            entity_type: 'attendance',
            academic_year: currentYear?.id,
        }, ['admin', 'teachers']);

        showToast(`✅ Attendance saved — ${saved} students${errors ? ` (${errors} errors)` : ''}`, errors ? 'warning' : 'success');

        // Refresh absent report
        const existing = await getAll('attendance', { class_id: classId, date: date });
        const existingMap = new Map();
        for (const rec of existing) {
            existingMap.set(rec.student_id, rec);
        }
        updateAbsentReport(existingMap);

    } catch (error) {
        console.error('[Attendance] Save error:', error);
        showToast('Error saving attendance: ' + error.message, 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = '💾 Save Attendance';
    }
}

// ──────────────────────────────────────────────────────────────────────
// CLEAR ATTENDANCE
// ──────────────────────────────────────────────────────────────────────

async function clearAttendance() {
    const classId = document.getElementById('att-class')?.value;
    const date = document.getElementById('att-date')?.value;

    if (!classId || !date) {
        showToast('Select class and date first', 'warning');
        return;
    }

    if (!isCurrentYearEditable()) {
        showToast('🔒 Cannot clear attendance in inactive academic year', 'warning');
        return;
    }

    if (!await confirmDialog(`Clear all attendance records for ${date}?`)) return;

    const existing = await getAll('attendance', {
        class_id: classId,
        date: date,
    });

    let deleted = 0;
    for (const rec of existing) {
        const result = await remove('attendance', rec.id);
        if (result) deleted++;
    }

    showToast(`✅ Cleared ${deleted} attendance records`, 'success');
    await loadAttendanceStudents();
}

// ──────────────────────────────────────────────────────────────────────
// EXPORT ATTENDANCE DAY
// ──────────────────────────────────────────────────────────────────────

async function exportAttendanceDay() {
    const classId = document.getElementById('att-class')?.value;
    const date = document.getElementById('att-date')?.value;

    if (!classId || !date) {
        showToast('Load attendance first', 'warning');
        return;
    }

    const currentYear = getCurrentAcademicYear();
    const students = (state.students || [])
        .filter(s => s.class_id == classId && s.status === 'Active' && s.academic_year_id === currentYear?.id)
        .sort((a, b) => a.last_name.localeCompare(b.last_name));

    const cls = getClassById(classId);

    const data = students.map(s => ({
        'Date': date,
        'Academic Year': currentYear?.name || '',
        'Class': cls?.name || '—',
        'Student Code': s.student_code || '',
        'Student Name': `${s.first_name} ${s.last_name}`,
        'Status': document.getElementById(`att-status-${s.id}`)?.value || '—',
        'Notes': document.getElementById(`att-note-${s.id}`)?.value || '',
    }));

    exportToExcel(data, `Attendance_${cls?.name || 'Class'}_${date}`);
    showToast('✅ Attendance exported', 'success');
}

// ──────────────────────────────────────────────────────────────────────
// REFRESH ATTENDANCE
// ──────────────────────────────────────────────────────────────────────

async function refreshAttendance() {
    await refreshTable('attendance');
    await loadAttendanceStudents();
    showToast('🔄 Refreshed', 'info', 1000);
}

// ──────────────────────────────────────────────────────────────────────
// IS HOLIDAY CHECK
// ──────────────────────────────────────────────────────────────────────

function isHoliday(date) {
    const holidays = state.holidays || [];
    return holidays.some(h => h.date === date || (h.start_date && h.end_date && date >= h.start_date && date <= h.end_date));
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

function confirmDialog(message) {
    return new Promise((resolve) => {
        const modalId = `confirm-modal-${Date.now()}`;
        const html = `
            <div class="modal-overlay" id="${modalId}">
                <div class="modal modal-sm">
                    <div class="modal-header"><h3>⚠️ Confirm</h3><button class="modal-close" onclick="window.closeModal('${modalId}')">✕</button></div>
                    <div class="modal-body"><p>${esc(message)}</p></div>
                    <div class="modal-footer">
                        <button class="btn btn-outline" onclick="window.closeModal('${modalId}'); window._confirmResolve(false)">Cancel</button>
                        <button class="btn btn-danger" onclick="window.closeModal('${modalId}'); window._confirmResolve(true)">Confirm</button>
                    </div>
                </div>
            </div>
        `;
        const container = document.getElementById('modals-container');
        if (container) container.innerHTML = html;
        window._confirmResolve = resolve;
    });
}

async function ensureStateLoaded() {
    if (!state.classes || !state.classes.length) {
        const fn = window.loadInitialData || (async () => {});
        await fn(false);
    }
}

async function refreshTable(table) {
    const getAll = window.getAll || (async () => []);
    if (table === 'attendance') {
        state.attendance = await getAll('attendance');
    }
}

// Export functions to window
window._loadAttendanceStudents = loadAttendanceStudents;
window._markAllPresent = markAllPresent;
window._markAllAbsent = markAllAbsent;
window._markAllLate = markAllLate;
window._saveAttendance = saveAttendance;
window._clearAttendance = clearAttendance;
window._exportAttendanceDay = exportAttendanceDay;
window._refreshAttendance = refreshAttendance;
window._updateAttSummary = updateAttSummary;