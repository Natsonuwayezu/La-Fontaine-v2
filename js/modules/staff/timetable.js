/**
 * ECOLE LA FONTAINE — Master Timetable
 * Class and teacher timetables with grid view
 * Last updated: 2026-07-03
 * 
 * CHANGES:
 * - Added academic year filtering
 * - Timetable slots are now year-specific
 * - Year selector in the UI
 * - Slots can be filtered by academic year
 * - Historical timetables can be viewed
 */


import {
    state,
    getCurrentUser,
    getClassById,
    getSubjectById,
    getTeacherById,
    getCurrentAcademicYear
} from '../../core/state.js';
import { esc, fmtTime } from '../../core/utils.js';
import { getAll, insert, remove, refreshTable, logActivity, get } from '../../core/api.js';
import { TIMETABLE_DAYS, TIMETABLE_TIME_SLOTS, isBreakSlot, getBreakIcon } from '../../config/constants.js';

// ──────────────────────────────────────────────────────────────────────
// STATE
// ──────────────────────────────────────────────────────────────────────

let selectedYearId = null;

// ──────────────────────────────────────────────────────────────────────
// MAIN RENDER FUNCTION
// ──────────────────────────────────────────────────────────────────────

export async function renderTimetable(container) {
    if (!container) return;

    const user = getCurrentUser();
    if (user?.role !== 'admin') {
        container.innerHTML = '<div class="alert alert-danger">Access denied. Admin privileges required.</div>';
        return;
    }

    await ensureStateLoaded();

    const classes = (state.classes || []).filter(c => c.is_active !== false);
    const teachers = (state.teachers || []).filter(t => t.role === 'teacher' && t.status !== 'inactive');
    const currentYear = getCurrentAcademicYear();
    const years = (state.academicYears || []).sort((a, b) => b.id - a.id);

    // Default to current year
    if (!selectedYearId) {
        selectedYearId = currentYear?.id || null;
    }

    container.innerHTML = `
        <div class="dash-card">
            <div class="dash-card-header" style="flex-wrap:wrap;gap:8px;">
                <span class="dash-card-title">🕐 Master Timetable</span>
                <div class="btn-group" style="flex-wrap:wrap;gap:6px;">
                    <select id="tt-year-filter" onchange="window._loadTimetableData()" style="padding:6px 12px;border-radius:var(--r-md);border:1px solid var(--border-medium);font-size:0.8rem;">
                        ${years.map(y => `
                            <option value="${y.id}" ${y.id === selectedYearId ? 'selected' : ''}>
                                ${esc(y.name)} ${y.id === currentYear?.id ? '🟢' : ''}
                            </option>
                        `).join('')}
                    </select>
                    <select id="tt-view-type" onchange="window._loadTimetableData()" style="padding:6px 12px;border-radius:var(--r-md);border:1px solid var(--border-medium);">
                        <option value="class">📚 Class Timetable</option>
                        <option value="teacher">👩‍🏫 Teacher Timetable</option>
                    </select>
                    <select id="tt-class-filter" onchange="window._loadTimetableData()" style="padding:6px 12px;border-radius:var(--r-md);border:1px solid var(--border-medium);">
                        <option value="">All Classes</option>
                        ${classes.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}
                    </select>
                    <select id="tt-teacher-filter" style="display:none;padding:6px 12px;border-radius:var(--r-md);border:1px solid var(--border-medium);">
                        <option value="">All Teachers</option>
                        ${teachers.map(t => `<option value="${t.id}">${esc(t.first_name)} ${esc(t.last_name)}</option>`).join('')}
                    </select>
                    <button class="btn btn-sm btn-primary" onclick="window._openAddTimetableSlot()">➕ Add Slot</button>
                    <button class="btn btn-sm btn-outline" onclick="window._exportTimetable()">📥 Export</button>
                    <button class="btn btn-sm btn-outline" onclick="window._printTimetable()">🖨️ Print</button>
                </div>
            </div>
            <div class="dash-card-body" style="padding:0;overflow-x:auto;">
                <div id="timetable-container">
                    <div class="loading-container"><div class="spinner"></div><p>Loading timetable...</p></div>
                </div>
            </div>
        </div>
    `;

    window._loadTimetableData = loadTimetableData;
    window._openAddTimetableSlot = openAddTimetableSlot;
    window._exportTimetable = exportTimetable;
    window._printTimetable = printTimetable;

    await loadTimetableData();
}

// ──────────────────────────────────────────────────────────────────────
// LOAD TIMETABLE DATA
// ──────────────────────────────────────────────────────────────────────

async function loadTimetableData() {
    const container = document.getElementById('timetable-container');
    if (!container) return;

    const viewType = document.getElementById('tt-view-type')?.value || 'class';
    const classFilter = document.getElementById('tt-class-filter')?.value;
    const teacherFilter = document.getElementById('tt-teacher-filter')?.value;
    const yearId = document.getElementById('tt-year-filter')?.value;

    if (yearId) {
        selectedYearId = parseInt(yearId);
    }

    // Show/hide filters
    document.getElementById('tt-class-filter').style.display = viewType === 'class' ? '' : 'none';
    document.getElementById('tt-teacher-filter').style.display = viewType === 'teacher' ? '' : 'none';

    // Build query with year filter
    let queryParts = [];
    if (selectedYearId) {
        queryParts.push(`academic_year_id=eq.${selectedYearId}`);
    }
    if (viewType === 'class' && classFilter) {
        queryParts.push(`class_id=eq.${classFilter}`);
    }
    const query = queryParts.join('&');

    // Load slots
    let slots = [];
    try {
        slots = await get('timetable_slots', query);
    } catch (e) {
        slots = [];
    }

    // Filter by teacher if needed
    if (viewType === 'teacher' && teacherFilter) {
        slots = slots.filter(s => s.teacher_id == teacherFilter);
    }

    // Get target name
    let targetName = 'All Classes';
    const year = (state.academicYears || []).find(y => y.id === selectedYearId);
    if (viewType === 'class' && classFilter) {
        const cls = getClassById(classFilter);
        targetName = cls?.name || 'Class';
    } else if (viewType === 'teacher' && teacherFilter) {
        const t = getTeacherById(teacherFilter);
        targetName = t ? `${t.first_name} ${t.last_name}` : 'Teacher';
    }

    // Render grid
    const html = renderTimetableGrid(slots, viewType, targetName, year);
    container.innerHTML = html;
}

// ──────────────────────────────────────────────────────────────────────
// RENDER TIMETABLE GRID
// ──────────────────────────────────────────────────────────────────────

function renderTimetableGrid(slots, viewType, targetName, year) {
    // Build slot map: day|time -> slot data
    const slotMap = new Map();
    for (const slot of slots) {
        const key = `${slot.day_of_week}|${slot.time_slot}`;
        slotMap.set(key, slot);
    }

    const yearLabel = year ? ` — ${esc(year.name)}` : '';

    let gridHtml = `
        <div style="padding:12px 16px;border-bottom:1px solid var(--border-light);background:var(--bg-tertiary);display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">
            <div>
                <strong>${esc(targetName)}</strong>
                <span style="font-size:0.7rem;color:var(--text-muted);margin-left:12px;">${slots.length} slots${yearLabel}</span>
            </div>
            <div style="font-size:0.7rem;color:var(--text-muted);">
                📅 ${year?.name || 'All Years'}
            </div>
        </div>
        <div class="table-wrapper">
            <table class="data-table" style="min-width:800px;font-size:0.78rem;">
                <thead>
                    <tr>
                        <th style="min-width:80px;">Time</th>
                        ${TIMETABLE_DAYS.map(d => `<th style="text-align:center;min-width:100px;">${d}</th>`).join('')}
                    </tr>
                </thead>
                <tbody>
                    ${TIMETABLE_TIME_SLOTS.map(ts => {
        const isBreak = isBreakSlot(ts);
        const breakIcon = getBreakIcon(ts);
        const cells = TIMETABLE_DAYS.map(day => {
            const key = `${day}|${ts}`;
            const slot = slotMap.get(key);

            if (slot) {
                const subj = getSubjectById(slot.subject_id);
                const teacher = getTeacherById(slot.teacher_id);
                return `
                                    <td style="background:var(--role-light);padding:4px 6px;text-align:center;font-size:0.7rem;">
                                        <div style="font-weight:600;">${esc(subj?.code || subj?.name || '?')}</div>
                                        ${teacher ? `<div style="font-size:0.6rem;color:var(--text-muted);">${esc(teacher.first_name)} ${esc(teacher.last_name)}</div>` : ''}
                                        ${slot.room ? `<div style="font-size:0.55rem;color:var(--text-muted);">${esc(slot.room)}</div>` : ''}
                                    </td>
                                `;
            }

            if (isBreak) {
                return `<td style="background:var(--bg-tertiary);text-align:center;color:var(--text-muted);font-size:1.2rem;">${breakIcon}</td>`;
            }

            return `<td style="background:var(--bg-tertiary);"></td>`;
        }).join('');

        return `
                            <tr>
                                <td style="font-size:0.65rem;color:var(--text-muted);white-space:nowrap;${isBreak ? 'background:var(--bg-tertiary);' : ''}">${esc(ts)}</td>
                                ${cells}
                            </tr>
                        `;
    }).join('')}
                </tbody>
            </table>
        </div>
        ${slots.length === 0 ? `
            <div style="text-align:center;padding:20px;color:var(--text-muted);font-size:0.85rem;">
                No timetable slots found for ${esc(targetName)}${year ? ` in ${esc(year.name)}` : ''}.
                <br><button class="btn btn-sm btn-primary" onclick="window._openAddTimetableSlot()" style="margin-top:8px;">➕ Add First Slot</button>
            </div>
        ` : ''}
    `;

    return gridHtml;
}

// ──────────────────────────────────────────────────────────────────────
// OPEN ADD TIMETABLE SLOT
// ──────────────────────────────────────────────────────────────────────

function openAddTimetableSlot() {
    const classes = (state.classes || []).filter(c => c.is_active !== false);
    const teachers = (state.teachers || []).filter(t => t.role === 'teacher' && t.status !== 'inactive');
    const subjects = (state.subjects || []).filter(s => s.is_active !== false);
    const currentYear = getCurrentAcademicYear();
    const years = (state.academicYears || []).sort((a, b) => b.id - a.id);

    // Use selected year or current year
    const yearId = selectedYearId || currentYear?.id;

    showModal(`
        <div class="modal-overlay" id="add-slot-modal">
            <div class="modal" style="max-width:450px;">
                <div class="modal-header">
                    <h3>➕ Add Timetable Slot</h3>
                    <button class="modal-close" onclick="window.closeModal('add-slot-modal')">✕</button>
                </div>
                <div class="modal-body">
                    <div class="form-grid">
                        <div class="form-group full">
                            <label>Academic Year *</label>
                            <select id="ts-year" class="form-control">
                                ${years.map(y => `
                                    <option value="${y.id}" ${y.id === yearId ? 'selected' : ''}>
                                        ${esc(y.name)} ${y.id === currentYear?.id ? '🟢' : ''}
                                    </option>
                                `).join('')}
                            </select>
                        </div>
                        <div class="form-group full">
                            <label>Class *</label>
                            <select id="ts-class" class="form-control">
                                ${classes.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}
                            </select>
                        </div>
                        <div class="form-group">
                            <label>Day *</label>
                            <select id="ts-day" class="form-control">
                                ${TIMETABLE_DAYS.map(d => `<option value="${d}">${d}</option>`).join('')}
                            </select>
                        </div>
                        <div class="form-group">
                            <label>Time Slot *</label>
                            <select id="ts-time" class="form-control">
                                ${TIMETABLE_TIME_SLOTS.map(t => `<option value="${t}">${t}</option>`).join('')}
                            </select>
                        </div>
                        <div class="form-group full">
                            <label>Subject *</label>
                            <select id="ts-subject" class="form-control">
                                <option value="">— Select —</option>
                                ${subjects.map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join('')}
                            </select>
                        </div>
                        <div class="form-group full">
                            <label>Teacher</label>
                            <select id="ts-teacher" class="form-control">
                                <option value="">— None —</option>
                                ${teachers.map(t => `<option value="${t.id}">${esc(t.first_name)} ${esc(t.last_name)}</option>`).join('')}
                            </select>
                        </div>
                        <div class="form-group full">
                            <label>Room</label>
                            <input type="text" id="ts-room" class="form-control" placeholder="e.g., R-01">
                        </div>
                    </div>
                    <div style="margin-top:12px;padding:8px 12px;background:var(--bg-tertiary);border-radius:6px;font-size:0.75rem;color:var(--text-muted);">
                        📅 Slot will be assigned to the selected academic year.
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-outline" onclick="window.closeModal('add-slot-modal')">Cancel</button>
                    <button class="btn btn-primary" onclick="window._saveTimetableSlot()">💾 Save</button>
                </div>
            </div>
        </div>
    `);

    window._saveTimetableSlot = saveTimetableSlot;
}

// ──────────────────────────────────────────────────────────────────────
// SAVE TIMETABLE SLOT
// ──────────────────────────────────────────────────────────────────────

async function saveTimetableSlot() {
    const yearId = document.getElementById('ts-year')?.value;
    const classId = document.getElementById('ts-class')?.value;
    const day = document.getElementById('ts-day')?.value;
    const timeSlot = document.getElementById('ts-time')?.value;
    const subjectId = document.getElementById('ts-subject')?.value;
    const teacherId = document.getElementById('ts-teacher')?.value || null;
    const room = document.getElementById('ts-room')?.value?.trim() || null;

    if (!yearId || !classId || !day || !timeSlot || !subjectId) {
        showToast('Academic year, class, day, time, and subject are required', 'warning');
        return;
    }

    // Check for conflicts (same teacher, same day, same time in same year)
    if (teacherId) {
        const existing = await get('timetable_slots', {
            teacher_id: teacherId,
            day_of_week: day,
            time_slot: timeSlot,
            academic_year_id: yearId,
        });
        if (existing.length > 0) {
            showToast('⚠️ This teacher already has a slot at this time in this academic year', 'warning');
            return;
        }
    }

    // Check for class conflicts (same class, same day, same time in same year)
    const existingClass = await get('timetable_slots', {
        class_id: classId,
        day_of_week: day,
        time_slot: timeSlot,
        academic_year_id: yearId,
    });
    if (existingClass.length > 0) {
        showToast('⚠️ This class already has a slot at this time in this academic year', 'warning');
        return;
    }

    const result = await insert('timetable_slots', {
        academic_year_id: parseInt(yearId),
        class_id: parseInt(classId),
        day_of_week: day,
        time_slot: timeSlot,
        subject_id: parseInt(subjectId),
        teacher_id: teacherId ? parseInt(teacherId) : null,
        room: room,
        created_at: new Date().toISOString(),
    });

    if (result) {
        closeModal('add-slot-modal');
        await refreshTable('timetable_slots');
        const year = (state.academicYears || []).find(y => y.id == yearId);
        await logActivity(
            state.currentUser?.id,
            state.currentUser?.role,
            `Added timetable slot for class ${classId} ${day} ${timeSlot} (${year?.name || 'Current Year'})`
        );
        showToast('✅ Timetable slot added', 'success');
        loadTimetableData();
    } else {
        showToast('Failed to add timetable slot', 'error');
    }
}

// ──────────────────────────────────────────────────────────────────────
// EXPORT TIMETABLE
// ──────────────────────────────────────────────────────────────────────

function exportTimetable() {
    const table = document.querySelector('#timetable-container table');
    if (!table) {
        showToast('No timetable to export', 'warning');
        return;
    }

    const year = (state.academicYears || []).find(y => y.id === selectedYearId);
    const filename = `Timetable${year ? '_' + year.name : ''}_${new Date().toISOString().split('T')[0]}`;

    const ws = XLSX.utils.table_to_sheet(table);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Timetable');
    XLSX.writeFile(wb, `${filename}.xlsx`);
    showToast('✅ Timetable exported', 'success');
}

// ──────────────────────────────────────────────────────────────────────
// PRINT TIMETABLE
// ──────────────────────────────────────────────────────────────────────

function printTimetable() {
    const container = document.getElementById('timetable-container');
    if (!container) {
        showToast('No timetable to print', 'warning');
        return;
    }

    const printWindow = window.open('', '_blank');
    if (!printWindow) {
        showToast('Popup blocked. Please allow popups.', 'warning');
        return;
    }

    const school = state.schoolSettings || {};
    const year = (state.academicYears || []).find(y => y.id === selectedYearId);

    printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Timetable${year ? ' - ' + year.name : ''}</title>
            <style>
                body { font-family: Arial, sans-serif; padding: 20px; font-size: 11px; }
                table { width: 100%; border-collapse: collapse; }
                th, td { border: 1px solid #ccc; padding: 6px 8px; text-align: center; }
                th { background: #1a3a5c; color: white; font-weight: 700; }
                h1 { text-align: center; color: #1a3a5c; }
                .year-label { text-align: center; font-size: 14px; color: #64748b; margin-bottom: 16px; }
                @media print { body { padding: 0; } button { display: none; } }
            </style>
        </head>
        <body>
            <h1>${esc(school.school_name || 'ECOLE LA FONTAINE')}</h1>
            <h2 style="text-align:center;">Timetable</h2>
            <div class="year-label">📅 ${year ? esc(year.name) : 'All Years'} · Generated on ${new Date().toLocaleString()}</div>
            ${container.innerHTML}
            <script>
                window.print();
                setTimeout(function() { window.close(); }, 500);
            <\/script>
        </body>
        </html>
    `);
    printWindow.document.close();
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

function showModal(html) {
    const container = document.getElementById('modals-container');
    if (container) container.innerHTML = html;
}

function closeModal(modalId) {
    if (modalId) {
        const modal = document.getElementById(modalId);
        if (modal) modal.remove();
    } else {
        const container = document.getElementById('modals-container');
        if (container) container.innerHTML = '';
    }
}

async function ensureStateLoaded() {
    if (!state.classes.length) {
        const loadInitialData = window.loadInitialData || (async () => {});
        await loadInitialData(false);
    }
}

// Export functions to window
window._loadTimetableData = loadTimetableData;
window._openAddTimetableSlot = openAddTimetableSlot;
window._exportTimetable = exportTimetable;
window._printTimetable = printTimetable;
window._saveTimetableSlot = saveTimetableSlot;