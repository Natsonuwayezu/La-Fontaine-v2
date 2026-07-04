/**
 * ECOLE LA FONTAINE — Academic Calendar
 * Term dates, holidays, auto-reset rules
 * Last updated: 2026-07-03
 * 
 * CHANGES:
 * - Added active year validation
 * - Read-only mode for inactive years
 * - Term dates cannot be edited for inactive years
 * - Holidays cannot be added/edited for inactive years
 * - Auto-reset rules only apply to active years
 * - Added year status indicators
 */

import {
    state,
    getCurrentUser,
    getTermStatus,
    getCurrentAcademicYear,
    isCurrentYearEditable,
    getTermsByYear
} from '../../core/state.js';
import { esc, fmtDate } from '../../core/utils.js';
import { updateSchoolSetting, getSchoolSettings, insert, update, remove, getAll, logActivity } from '../../core/api.js';

// ──────────────────────────────────────────────────────────────────────
// MAIN RENDER FUNCTION
// ──────────────────────────────────────────────────────────────────────

export async function renderAcademicCalendar(container) {
    if (!container) return;

    const user = getCurrentUser();
    if (user?.role !== 'admin') {
        container.innerHTML = '<div class="alert alert-danger">Access denied. Admin privileges required.</div>';
        return;
    }

    await ensureStateLoaded();

    const currentYear = state.currentAcadYear || state.academicYears[0];
    const years = state.academicYears || [];
    const isEditable = isCurrentYearEditable();
    const isActive = currentYear?.is_active === true;

    let holidays = [];
    try {
        holidays = await getAll('holidays', { academic_year_id: currentYear?.id });
    } catch (e) {
        holidays = [];
    }

    const terms = getTermsByYear(currentYear?.id);

    // Check if Rwanda holidays are imported
    const rwandaHolidaysImported = holidays.some(h => h.holiday_type === 'public' && h.is_recurring === true);

    // Year status indicator
    const yearStatus = isActive ? '🟢 Active' : '🔒 Inactive';
    const yearStatusClass = isActive ? 'badge-success' : 'badge-neutral';
    const editDisabled = !isEditable ? 'disabled' : '';
    const editDisabledAttr = !isEditable ? 'disabled' : '';
    const readOnlyMessage = !isEditable ? ' (Read-only — inactive year)' : '';

    container.innerHTML = `
        <div class="dash-card">
            <div class="dash-card-header" style="flex-wrap:wrap;gap:8px;">
                <span class="dash-card-title">📅 Academic Calendar</span>
                <div class="btn-group" style="flex-wrap:wrap;gap:6px;">
                    <select id="cal-year" onchange="window._loadAcademicCalendar()" style="padding:6px 12px;border-radius:var(--r-md);border:1px solid var(--border-medium);">
                        ${years.map(y => `
                            <option value="${y.id}" ${y.id === currentYear?.id ? 'selected' : ''}>
                                ${esc(y.name)} ${y.is_active ? '🟢' : '🔒'}
                            </option>
                        `).join('')}
                    </select>
                    <span class="badge ${yearStatusClass}" style="font-size:0.7rem;">${yearStatus}</span>
                    ${isActive ? `<span class="badge badge-info" style="font-size:0.7rem;">📝 Editable</span>` : `<span class="badge badge-neutral" style="font-size:0.7rem;">🔒 Read-only</span>`}
                    <button class="btn btn-sm btn-primary" onclick="window._openAddYearModal()">➕ Add New Year</button>
                </div>
            </div>
            <div class="dash-card-body">

                ${!isActive ? `
                    <div class="alert alert-warning" style="font-size:0.85rem;margin-bottom:16px;">
                        <strong>🔒 Read-only mode:</strong> This academic year (${esc(currentYear?.name)}) is inactive. 
                        You cannot modify terms or holidays. Switch to an active year to make changes.
                    </div>
                ` : ''}

                <!-- TERM DATES -->
                <h4 style="margin-bottom:12px;">📅 Term Dates${readOnlyMessage}</h4>
                <div id="terms-container">
                    ${terms.length ? terms.map(term => {
        const status = getTermStatus(term);
        const statusIcon = status === 'completed' ? '✅' : (status === 'current' ? '🟡' : '⏳');
        const statusText = status === 'completed' ? 'Completed' : (status === 'current' ? 'In Progress' : 'Upcoming');
        return `
                            <div style="border:1px solid var(--border-light);border-radius:var(--r-lg);padding:16px;margin-bottom:16px;${!isActive ? 'opacity:0.8;' : ''}">
                                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;flex-wrap:wrap;gap:8px;">
                                    <strong style="font-size:1rem;">${esc(term.name)}</strong>
                                    <span class="badge ${status === 'completed' ? 'badge-success' : (status === 'current' ? 'badge-warning' : 'badge-info')}">${statusIcon} ${statusText}</span>
                                </div>
                                <div class="form-grid" style="grid-template-columns:repeat(auto-fit,minmax(150px,1fr));">
                                    <div class="form-group">
                                        <label>Start Date</label>
                                        <input type="date" id="term-start-${term.id}" class="form-control" value="${term.start_date || ''}" ${!isActive ? 'disabled' : ''}>
                                    </div>
                                    <div class="form-group">
                                        <label>End Date</label>
                                        <input type="date" id="term-end-${term.id}" class="form-control" value="${term.end_date || ''}" ${!isActive ? 'disabled' : ''}>
                                    </div>
                                    <div class="form-group">
                                        <label>Midterm Date</label>
                                        <input type="date" id="term-mid-${term.id}" class="form-control" value="${term.midterm_date || ''}" ${!isActive ? 'disabled' : ''}>
                                    </div>
                                    <div class="form-group" style="justify-content:flex-end;display:flex;gap:8px;align-items:flex-end;">
                                        ${isActive ? `
                                            <button class="btn btn-sm btn-primary" onclick="window._updateTermDates(${term.id})">Save</button>
                                            ${status === 'current' ? `<button class="btn btn-sm btn-success" onclick="window._setCurrentTerm(${term.id})">Set as Current</button>` : ''}
                                        ` : `
                                            <span style="font-size:0.7rem;color:var(--text-muted);">🔒 Read-only</span>
                                        `}
                                    </div>
                                </div>
                            </div>
                        `;
    }).join('') : `
                        <div class="alert alert-info">No terms defined for this academic year.</div>
                    `}
                </div>

                <!-- HOLIDAYS -->
                <div style="margin-top:24px;">
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;flex-wrap:wrap;gap:8px;">
                        <h4 style="margin:0;">🏖️ Holidays & Breaks${readOnlyMessage}</h4>
                        <div class="btn-group">
                            ${isActive ? `
                                <button class="btn btn-sm btn-primary" onclick="window._openAddHolidayModal()">➕ Add Holiday</button>
                                ${rwandaHolidaysImported ? '' : `<button class="btn btn-sm btn-outline" onclick="window._importRwandaHolidays()">🇷🇼 Import RW Holidays</button>`}
                            ` : `
                                <span style="font-size:0.7rem;color:var(--text-muted);">🔒 Read-only</span>
                            `}
                        </div>
                    </div>
                    <div class="table-wrapper">
                        <table class="data-table">
                            <thead>
                                <tr>
                                    <th>Holiday Name</th>
                                    <th>Date</th>
                                    <th>Type</th>
                                    <th>Recurring</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody id="holidays-tbody">
                                ${holidays && holidays.length ? holidays.map(h => `
                                    <tr>
                                        <td><strong>${esc(h.name)}</strong></td>
                                        <td>${fmtDate(h.date)}</td>
                                        <td><span class="badge ${h.holiday_type === 'public' ? 'badge-info' : 'badge-warning'}">${esc(h.holiday_type === 'public' ? 'Public' : (h.holiday_type === 'half-day' ? 'Half Day' : 'School'))}</span></td>
                                        <td>${h.is_recurring ? '✅ Yes' : '❌ No'}</td>
                                        <td>
                                            ${isActive ? `
                                                <button class="btn btn-sm btn-outline" onclick="window._editHoliday(${h.id})">✏️</button>
                                                <button class="btn btn-sm btn-danger" onclick="window._deleteHoliday(${h.id})">🗑️</button>
                                            ` : `
                                                <span style="font-size:0.7rem;color:var(--text-muted);">🔒</span>
                                            `}
                                        </td>
                                    </tr>
                                `).join('') : `
                                    <tr>
                                        <td colspan="5" style="text-align:center;padding:20px;color:var(--text-muted);">
                                            No holidays added yet${!isActive ? ' (read-only)' : ''}
                                        </td>
                                    </tr>
                                `}
                            </tbody>
                        </table>
                    </div>
                </div>

                <!-- AUTO-RESET RULES -->
                <div style="margin-top:24px;">
                    <h4 style="margin-bottom:12px;">⚙️ Auto-Reset Rules${readOnlyMessage}</h4>
                    <div class="form-grid" style="grid-template-columns:repeat(auto-fit,minmax(180px,1fr));">
                        <div class="form-group">
                            <label>Monthly Reset</label>
                            <select id="auto-monthly" class="form-control" ${!isActive ? 'disabled' : ''}>
                                <option value="1st" ${state.schoolSettings.auto_monthly === '1st' ? 'selected' : ''}>1st of every month</option>
                                <option value="disabled" ${state.schoolSettings.auto_monthly === 'disabled' ? 'selected' : ''}>Disabled</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label>Termly Reset</label>
                            <select id="auto-termly" class="form-control" ${!isActive ? 'disabled' : ''}>
                                <option value="end" ${state.schoolSettings.auto_termly === 'end' ? 'selected' : ''}>On term end date</option>
                                <option value="disabled" ${state.schoolSettings.auto_termly === 'disabled' ? 'selected' : ''}>Disabled</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label>Annual Reset</label>
                            <select id="auto-annual" class="form-control" ${!isActive ? 'disabled' : ''}>
                                <option value="end" ${state.schoolSettings.auto_annual === 'end' ? 'selected' : ''}>On academic year end</option>
                                <option value="disabled" ${state.schoolSettings.auto_annual === 'disabled' ? 'selected' : ''}>Disabled</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label><input type="checkbox" id="auto-lock-marks" ${state.schoolSettings.auto_lock_marks ? 'checked' : ''} ${!isActive ? 'disabled' : ''}> Auto-lock marks on term end</label>
                        </div>
                        <div class="form-group">
                            <label>Auto-archive after (days inactive)</label>
                            <input type="number" id="auto-archive-days" class="form-control" value="${state.schoolSettings.auto_archive_days || 365}" min="30" ${!isActive ? 'disabled' : ''}>
                        </div>
                    </div>
                    ${!isActive ? `
                        <div style="font-size:0.75rem;color:var(--text-muted);margin-top:8px;">
                            🔒 Auto-reset rules cannot be modified for inactive years.
                        </div>
                    ` : ''}
                </div>

                <div class="btn-group" style="margin-top:24px;">
                    ${isActive ? `
                        <button class="btn btn-primary" onclick="window._saveAcademicCalendar()">💾 Save Calendar</button>
                    ` : `
                        <button class="btn btn-outline" onclick="window._saveAcademicCalendar()" disabled>💾 Save Calendar (read-only)</button>
                    `}
                    <button class="btn btn-outline" onclick="window._generateYearCalendar()">📅 Generate Year Calendar</button>
                    <button class="btn btn-outline" onclick="window._exportAcademicCalendar()">📤 Export</button>
                    ${!isActive ? `
                        <button class="btn btn-warning" onclick="window._activateYear(${currentYear?.id})">🔄 Activate This Year</button>
                    ` : ''}
                </div>
            </div>
        </div>
    `;

    window._loadAcademicCalendar = loadAcademicCalendar;
    window._updateTermDates = updateTermDates;
    window._setCurrentTerm = setCurrentTerm;
    window._openAddHolidayModal = openAddHolidayModal;
    window._saveAcademicCalendar = saveAcademicCalendar;
    window._generateYearCalendar = generateYearCalendar;
    window._exportAcademicCalendar = exportAcademicCalendar;
    window._editHoliday = editHoliday;
    window._deleteHoliday = deleteHoliday;
    window._importRwandaHolidays = importRwandaHolidays;
    window._openAddYearModal = openAddYearModal;
    window._activateYear = activateYear;
}

// ──────────────────────────────────────────────────────────────────────
// ACTIVATE YEAR
// ──────────────────────────────────────────────────────────────────────

async function activateYear(yearId) {
    const year = state.academicYears.find(y => y.id === yearId);
    if (!year) {
        showToast('Year not found', 'error');
        return;
    }

    if (!await confirmDialog(`Activate academic year "${year.name}"? This will make it the current active year.`)) return;

    // Deactivate all years
    for (const y of state.academicYears) {
        await update('academic_years', y.id, { is_active: y.id === yearId });
    }

    // Update current year in state
    state.currentAcadYear = year;
    state.filters.academic_year_id = yearId;

    await refreshTable('academic_years');
    await logActivity(state.currentUser?.id, state.currentUser?.role, `Activated academic year: ${year.name}`);
    showToast(`✅ ${year.name} is now the active year`, 'success');
    loadAcademicCalendar();
}

// ──────────────────────────────────────────────────────────────────────
// LOAD ACADEMIC CALENDAR
// ──────────────────────────────────────────────────────────────────────

function loadAcademicCalendar() {
    renderAcademicCalendar(document.getElementById('dynamic-content'));
}

// ──────────────────────────────────────────────────────────────────────
// UPDATE TERM DATES
// ──────────────────────────────────────────────────────────────────────

async function updateTermDates(termId) {
    // Check if year is editable
    if (!isCurrentYearEditable()) {
        showToast('❌ Cannot modify terms for an inactive academic year', 'warning');
        return;
    }

    const start = document.getElementById(`term-start-${termId}`)?.value;
    const end = document.getElementById(`term-end-${termId}`)?.value;
    const mid = document.getElementById(`term-mid-${termId}`)?.value;

    if (!start || !end) {
        showToast('Start and end dates are required', 'warning');
        return;
    }

    await update('terms', termId, {
        start_date: start,
        end_date: end,
        midterm_date: mid || null,
        updated_at: new Date().toISOString(),
    });

    await refreshTable('terms');
    await logActivity(state.currentUser?.id, state.currentUser?.role, `Updated term ${termId} dates`);
    showToast('✅ Term dates updated', 'success');
    loadAcademicCalendar();
}

// ──────────────────────────────────────────────────────────────────────
// SET CURRENT TERM
// ──────────────────────────────────────────────────────────────────────

async function setCurrentTerm(termId) {
    if (!isCurrentYearEditable()) {
        showToast('❌ Cannot set current term for an inactive academic year', 'warning');
        return;
    }

    const term = state.terms.find(t => t.id === termId);
    if (!term) {
        showToast('Term not found', 'error');
        return;
    }

    await updateSchoolSetting('current_term', term.name);
    state.schoolSettings = await getSchoolSettings();
    state.currentTerm = term;
    await refreshTable('terms');
    await logActivity(state.currentUser?.id, state.currentUser?.role, `Set current term to ${term.name}`);
    showToast(`✅ Current term set to ${term.name}`, 'success');
    loadAcademicCalendar();
}

// ──────────────────────────────────────────────────────────────────────
// SAVE ACADEMIC CALENDAR
// ──────────────────────────────────────────────────────────────────────

async function saveAcademicCalendar() {
    if (!isCurrentYearEditable()) {
        showToast('❌ Cannot save settings for an inactive academic year', 'warning');
        return;
    }

    const monthly = document.getElementById('auto-monthly')?.value;
    const termly = document.getElementById('auto-termly')?.value;
    const annual = document.getElementById('auto-annual')?.value;
    const lockMarks = document.getElementById('auto-lock-marks')?.checked;
    const archiveDays = document.getElementById('auto-archive-days')?.value;

    if (monthly) await updateSchoolSetting('auto_monthly', monthly);
    if (termly) await updateSchoolSetting('auto_termly', termly);
    if (annual) await updateSchoolSetting('auto_annual', annual);
    if (lockMarks !== undefined) await updateSchoolSetting('auto_lock_marks', String(lockMarks));
    if (archiveDays) await updateSchoolSetting('auto_archive_days', archiveDays);

    state.schoolSettings = await getSchoolSettings();
    await logActivity(state.currentUser?.id, state.currentUser?.role, 'Updated academic calendar settings');
    showToast('✅ Calendar settings saved', 'success');
}

// ──────────────────────────────────────────────────────────────────────
// GENERATE YEAR CALENDAR
// ──────────────────────────────────────────────────────────────────────

function generateYearCalendar() {
    const currentYear = state.currentAcadYear;
    const terms = getTermsByYear(currentYear?.id);
    let holidays = [];
    try {
        holidays = getAll('holidays', { academic_year_id: currentYear?.id });
    } catch (e) {
        holidays = [];
    }

    const isActive = currentYear?.is_active === true;

    const html = `
        <!DOCTYPE html>
        <html>
        <head>
            <title>Academic Calendar - ${esc(currentYear?.name)}</title>
            <style>
                body { font-family: Arial, sans-serif; padding: 20px; }
                h1 { text-align: center; color: #1a3a5c; }
                table { width: 100%; border-collapse: collapse; margin-top: 20px; font-size: 11px; }
                th, td { border: 1px solid #ccc; padding: 6px 8px; text-align: left; }
                th { background: #1a3a5c; color: white; }
                .term { background: #e8f0fe; }
                .holiday { background: #fee2e2; }
                .active-badge { background: #d1fae5; color: #065f46; padding: 2px 8px; border-radius: 12px; font-size: 10px; }
                @media print { body { padding: 0; } }
            </style>
        </head>
        <body>
            <h1>🏫 ECOLE LA FONTAINE</h1>
            <h2 style="text-align:center;">Academic Calendar — ${esc(currentYear?.name)} ${isActive ? '<span class="active-badge">🟢 ACTIVE</span>' : '<span class="active-badge" style="background:#fef3c7;color:#92400e;">🔒 INACTIVE</span>'}</h2>
            <p style="text-align:center;">Generated on ${new Date().toLocaleDateString()}</p>
            <table>
                <thead>
                    <tr>
                        <th>Type</th>
                        <th>Name</th>
                        <th>Start</th>
                        <th>End</th>
                        <th>Notes</th>
                    </tr>
                </thead>
                <tbody>
                    <tr class="term">
                        <td>📅 Academic Year</td>
                        <td><strong>${esc(currentYear?.name)}</strong></td>
                        <td>${fmtDate(currentYear?.start_date)}</td>
                        <td>${fmtDate(currentYear?.end_date)}</td>
                        <td>${isActive ? '🟢 Active' : '🔒 Inactive'}</td>
                    </tr>
                    ${terms.map(t => `
                        <tr class="term">
                            <td>📚 Term</td>
                            <td><strong>${esc(t.name)}</strong></td>
                            <td>${fmtDate(t.start_date)}</td>
                            <td>${fmtDate(t.end_date)}</td>
                            <td>Midterm: ${fmtDate(t.midterm_date)}</td>
                        </tr>
                    `).join('')}
                    ${holidays.map(h => `
                        <tr class="holiday">
                            <td>🏖️ Holiday</td>
                            <td>${esc(h.name)}</td>
                            <td>${fmtDate(h.date)}</td>
                            <td>${fmtDate(h.date)}</td>
                            <td>${esc(h.holiday_type === 'public' ? 'Public' : (h.holiday_type === 'half-day' ? 'Half Day' : 'School'))}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
            <p style="text-align:center;margin-top:30px;font-size:10px;color:#666;">This is an official document of ECOLE LA FONTAINE</p>
        </body>
        </html>
    `;

    const win = window.open('', '_blank');
    if (win) {
        win.document.write(html);
        win.document.close();
        win.print();
    } else {
        showToast('Popup blocked. Please allow popups.', 'warning');
    }
}

// ──────────────────────────────────────────────────────────────────────
// EXPORT ACADEMIC CALENDAR
// ──────────────────────────────────────────────────────────────────────

function exportAcademicCalendar() {
    const currentYear = state.currentAcadYear;
    const terms = getTermsByYear(currentYear?.id);
    let holidays = [];
    try {
        holidays = getAll('holidays', { academic_year_id: currentYear?.id });
    } catch (e) {
        holidays = [];
    }

    const exportData = [
        { Type: 'Academic Year', Name: currentYear?.name, Start: currentYear?.start_date, End: currentYear?.end_date, Status: currentYear?.is_active ? 'Active' : 'Inactive' },
        ...terms.map(t => ({ Type: 'Term', Name: t.name, Start: t.start_date, End: t.end_date, Midterm: t.midterm_date })),
        ...holidays.map(h => ({ Type: 'Holiday', Name: h.name, Date: h.date, Type: h.holiday_type, Recurring: h.is_recurring ? 'Yes' : 'No' })),
    ];

    exportToExcel(exportData, `Academic_Calendar_${currentYear?.name || 'export'}`);
    showToast('✅ Calendar exported', 'success');
}

// ──────────────────────────────────────────────────────────────────────
// OPEN ADD HOLIDAY MODAL
// ──────────────────────────────────────────────────────────────────────

function openAddHolidayModal() {
    if (!isCurrentYearEditable()) {
        showToast('❌ Cannot add holidays to an inactive academic year', 'warning');
        return;
    }

    showModal(`
        <div class="modal-overlay" id="add-holiday-modal">
            <div class="modal" style="max-width:450px;">
                <div class="modal-header">
                    <h3>➕ Add Holiday</h3>
                    <button class="modal-close" onclick="window.closeModal('add-holiday-modal')">✕</button>
                </div>
                <div class="modal-body">
                    <div class="form-grid">
                        <div class="form-group full">
                            <label>Holiday Name *</label>
                            <input type="text" id="nh-name" class="form-control" placeholder="e.g., School Founding Day">
                        </div>
                        <div class="form-group full">
                            <label>Date *</label>
                            <input type="date" id="nh-date" class="form-control">
                        </div>
                        <div class="form-group">
                            <label>Type</label>
                            <select id="nh-type" class="form-control">
                                <option value="school">School</option>
                                <option value="public">Public</option>
                                <option value="half-day">Half Day</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label>Recurring</label>
                            <select id="nh-recurring" class="form-control">
                                <option value="true">Yes (every year)</option>
                                <option value="false">No (one-time)</option>
                            </select>
                        </div>
                        <div class="form-group full">
                            <label>Description</label>
                            <input type="text" id="nh-desc" class="form-control" placeholder="Optional description">
                        </div>
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-outline" onclick="window.closeModal('add-holiday-modal')">Cancel</button>
                    <button class="btn btn-primary" onclick="window._saveHoliday()">💾 Save</button>
                </div>
            </div>
        </div>
    `);

    window._saveHoliday = saveHoliday;
}

// ──────────────────────────────────────────────────────────────────────
// SAVE HOLIDAY
// ──────────────────────────────────────────────────────────────────────

async function saveHoliday() {
    if (!isCurrentYearEditable()) {
        showToast('❌ Cannot save holiday to an inactive academic year', 'warning');
        return;
    }

    const name = document.getElementById('nh-name')?.value.trim();
    const date = document.getElementById('nh-date')?.value;
    const type = document.getElementById('nh-type')?.value;
    const recurring = document.getElementById('nh-recurring')?.value === 'true';
    const desc = document.getElementById('nh-desc')?.value?.trim() || null;

    if (!name || !date) {
        showToast('Name and date are required', 'warning');
        return;
    }

    const yearId = state.currentAcadYear?.id;
    if (!yearId) {
        showToast('No academic year selected', 'warning');
        return;
    }

    const result = await insert('holidays', {
        name: name,
        date: date,
        holiday_type: type || 'school',
        is_recurring: recurring,
        description: desc,
        academic_year_id: yearId,
        created_at: new Date().toISOString(),
    });

    if (result) {
        closeModal('add-holiday-modal');
        await refreshTable('holidays');
        await logActivity(state.currentUser?.id, state.currentUser?.role, `Added holiday: ${name}`);
        showToast('✅ Holiday added', 'success');
        loadAcademicCalendar();
    } else {
        showToast('Failed to add holiday', 'error');
    }
}

// ──────────────────────────────────────────────────────────────────────
// EDIT HOLIDAY
// ──────────────────────────────────────────────────────────────────────

async function editHoliday(holidayId) {
    if (!isCurrentYearEditable()) {
        showToast('❌ Cannot edit holidays in an inactive academic year', 'warning');
        return;
    }

    let holiday;
    try {
        const result = await getAll('holidays', { id: holidayId });
        holiday = result[0];
    } catch (e) {
        showToast('Holiday not found', 'error');
        return;
    }

    if (!holiday) return;

    showModal(`
        <div class="modal-overlay" id="edit-holiday-modal">
            <div class="modal" style="max-width:450px;">
                <div class="modal-header">
                    <h3>✏️ Edit Holiday</h3>
                    <button class="modal-close" onclick="window.closeModal('edit-holiday-modal')">✕</button>
                </div>
                <div class="modal-body">
                    <div class="form-grid">
                        <div class="form-group full">
                            <label>Holiday Name *</label>
                            <input type="text" id="eh-name" class="form-control" value="${esc(holiday.name)}">
                        </div>
                        <div class="form-group full">
                            <label>Date *</label>
                            <input type="date" id="eh-date" class="form-control" value="${holiday.date || ''}">
                        </div>
                        <div class="form-group">
                            <label>Type</label>
                            <select id="eh-type" class="form-control">
                                <option value="school" ${holiday.holiday_type === 'school' ? 'selected' : ''}>School</option>
                                <option value="public" ${holiday.holiday_type === 'public' ? 'selected' : ''}>Public</option>
                                <option value="half-day" ${holiday.holiday_type === 'half-day' ? 'selected' : ''}>Half Day</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label>Recurring</label>
                            <select id="eh-recurring" class="form-control">
                                <option value="true" ${holiday.is_recurring ? 'selected' : ''}>Yes (every year)</option>
                                <option value="false" ${!holiday.is_recurring ? 'selected' : ''}>No (one-time)</option>
                            </select>
                        </div>
                        <div class="form-group full">
                            <label>Description</label>
                            <input type="text" id="eh-desc" class="form-control" value="${esc(holiday.description || '')}" placeholder="Optional description">
                        </div>
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-outline" onclick="window.closeModal('edit-holiday-modal')">Cancel</button>
                    <button class="btn btn-primary" onclick="window._updateHoliday(${holidayId})">💾 Save</button>
                </div>
            </div>
        </div>
    `);

    window._updateHoliday = updateHoliday;
}

// ──────────────────────────────────────────────────────────────────────
// UPDATE HOLIDAY
// ──────────────────────────────────────────────────────────────────────

async function updateHoliday(holidayId) {
    if (!isCurrentYearEditable()) {
        showToast('❌ Cannot update holiday in an inactive academic year', 'warning');
        return;
    }

    const name = document.getElementById('eh-name')?.value.trim();
    const date = document.getElementById('eh-date')?.value;
    const type = document.getElementById('eh-type')?.value;
    const recurring = document.getElementById('eh-recurring')?.value === 'true';
    const desc = document.getElementById('eh-desc')?.value?.trim() || null;

    if (!name || !date) {
        showToast('Name and date are required', 'warning');
        return;
    }

    await update('holidays', holidayId, {
        name: name,
        date: date,
        holiday_type: type,
        is_recurring: recurring,
        description: desc,
        updated_at: new Date().toISOString(),
    });

    closeModal('edit-holiday-modal');
    await refreshTable('holidays');
    await logActivity(state.currentUser?.id, state.currentUser?.role, `Updated holiday: ${name}`);
    showToast('✅ Holiday updated', 'success');
    loadAcademicCalendar();
}

// ──────────────────────────────────────────────────────────────────────
// DELETE HOLIDAY
// ──────────────────────────────────────────────────────────────────────

async function deleteHoliday(holidayId) {
    if (!isCurrentYearEditable()) {
        showToast('❌ Cannot delete holiday in an inactive academic year', 'warning');
        return;
    }

    if (!await confirmDialog('Delete this holiday?')) return;

    await remove('holidays', holidayId);
    await refreshTable('holidays');
    await logActivity(state.currentUser?.id, state.currentUser?.role, `Deleted holiday ID ${holidayId}`);
    showToast('✅ Holiday deleted', 'success');
    loadAcademicCalendar();
}

// ──────────────────────────────────────────────────────────────────────
// IMPORT RWANDA HOLIDAYS
// ──────────────────────────────────────────────────────────────────────

async function importRwandaHolidays() {
    if (!isCurrentYearEditable()) {
        showToast('❌ Cannot import holidays to an inactive academic year', 'warning');
        return;
    }

    const yearId = state.currentAcadYear?.id;
    if (!yearId) {
        showToast('No academic year selected', 'warning');
        return;
    }

    const acadYear = state.currentAcadYear;
    const startDate = new Date(acadYear.start_date || new Date().getFullYear() + '-01-01');
    const endDate = new Date(acadYear.end_date || new Date().getFullYear() + '-12-31');
    const startYear = startDate.getFullYear();
    const endYear = endDate.getFullYear();

    // Rwanda public holidays (fixed dates)
    const rwandaHolidays = [
        { name: "New Year's Day", month: 1, day: 1 },
        { name: "Heroes' Day", month: 2, day: 1 },
        { name: "International Women's Day", month: 3, day: 8 },
        { name: "Genocide Memorial Day", month: 4, day: 7 },
        { name: "Labour Day", month: 5, day: 1 },
        { name: "Liberation Day", month: 7, day: 4 },
        { name: "Assumption Day", month: 8, day: 15 },
        { name: "Christmas Day", month: 12, day: 25 },
        { name: "Boxing Day", month: 12, day: 26 },
    ];

    // Check existing holidays
    let existing = [];
    try {
        existing = await getAll('holidays', { academic_year_id: yearId });
    } catch (e) {
        existing = [];
    }
    const existingNames = new Set(existing.map(h => h.name));

    const toInsert = [];
    for (let yr = startYear; yr <= endYear; yr++) {
        for (const h of rwandaHolidays) {
            const date = `${yr}-${String(h.month).padStart(2, '0')}-${String(h.day).padStart(2, '0')}`;
            if (date < acadYear.start_date || date > acadYear.end_date) continue;
            if (existingNames.has(h.name + ' ' + yr)) continue;
            toInsert.push({
                name: h.name + (startYear !== endYear ? ' ' + yr : ''),
                date: date,
                holiday_type: 'public',
                is_recurring: true,
                academic_year_id: yearId,
                created_at: new Date().toISOString(),
            });
        }
    }

    if (!toInsert.length) {
        showToast('All Rwanda public holidays already imported for this year', 'info');
        return;
    }

    if (!await confirmDialog(`Import ${toInsert.length} Rwanda public holiday(s) for ${acadYear.name}?`)) return;

    let imported = 0;
    for (const holiday of toInsert) {
        const result = await insert('holidays', holiday);
        if (result) imported++;
    }

    await refreshTable('holidays');
    await logActivity(state.currentUser?.id, state.currentUser?.role, `Imported ${imported} Rwanda public holidays`);
    showToast(`✅ ${imported} public holidays imported`, 'success');
    loadAcademicCalendar();
}

// ──────────────────────────────────────────────────────────────────────
// OPEN ADD YEAR MODAL
// ──────────────────────────────────────────────────────────────────────

function openAddYearModal() {
    showModal(`
        <div class="modal-overlay" id="add-year-modal">
            <div class="modal" style="max-width:450px;">
                <div class="modal-header">
                    <h3>📅 Add Academic Year</h3>
                    <button class="modal-close" onclick="window.closeModal('add-year-modal')">✕</button>
                </div>
                <div class="modal-body">
                    <div class="form-grid">
                        <div class="form-group full">
                            <label>Year Name *</label>
                            <input type="text" id="ny-name" class="form-control" placeholder="e.g., 2026-2027">
                        </div>
                        <div class="form-group">
                            <label>Start Date *</label>
                            <input type="date" id="ny-start" class="form-control">
                        </div>
                        <div class="form-group">
                            <label>End Date *</label>
                            <input type="date" id="ny-end" class="form-control">
                        </div>
                        <div class="form-group full">
                            <label>Copy from</label>
                            <select id="ny-copy" class="form-control">
                                <option value="">— Don't copy —</option>
                                ${(state.academicYears || []).map(y => `<option value="${y.id}">${esc(y.name)}</option>`).join('')}
                            </select>
                            <small class="field-hint">Copy terms and holidays from an existing year</small>
                        </div>
                        <div class="form-group full" style="margin-top:8px;">
                            <label>
                                <input type="checkbox" id="ny-active"> Set as active immediately
                            </label>
                        </div>
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-outline" onclick="window.closeModal('add-year-modal')">Cancel</button>
                    <button class="btn btn-primary" onclick="window._saveYear()">💾 Save</button>
                </div>
            </div>
        </div>
    `);

    window._saveYear = saveYear;
}

// ──────────────────────────────────────────────────────────────────────
// SAVE YEAR
// ──────────────────────────────────────────────────────────────────────

async function saveYear() {
    const name = document.getElementById('ny-name')?.value.trim();
    const start = document.getElementById('ny-start')?.value;
    const end = document.getElementById('ny-end')?.value;
    const copyFrom = document.getElementById('ny-copy')?.value;
    const setActive = document.getElementById('ny-active')?.checked;

    if (!name || !start || !end) {
        showToast('Name, start date, and end date are required', 'warning');
        return;
    }

    const result = await insert('academic_years', {
        name: name,
        start_date: start,
        end_date: end,
        is_active: setActive || false,
        created_at: new Date().toISOString(),
    });

    if (!result) {
        showToast('Failed to create academic year', 'error');
        return;
    }

    // If set as active, deactivate all other years
    if (setActive) {
        for (const y of state.academicYears) {
            await update('academic_years', y.id, { is_active: false });
        }
        state.currentAcadYear = result;
        state.filters.academic_year_id = result.id;
    }

    // Copy from existing year
    if (copyFrom) {
        const sourceYear = state.academicYears.find(y => y.id == copyFrom);
        if (sourceYear) {
            // Copy terms
            const sourceTerms = getTermsByYear(copyFrom);
            for (const t of sourceTerms) {
                await insert('terms', {
                    name: t.name,
                    term_number: t.term_number,
                    start_date: t.start_date,
                    end_date: t.end_date,
                    midterm_date: t.midterm_date,
                    academic_year_id: result.id,
                    is_active: false,
                    created_at: new Date().toISOString(),
                });
            }

            // Copy holidays
            const sourceHolidays = await getAll('holidays', { academic_year_id: copyFrom }).catch(() => []);
            for (const h of sourceHolidays) {
                await insert('holidays', {
                    name: h.name,
                    date: h.date,
                    holiday_type: h.holiday_type,
                    is_recurring: h.is_recurring,
                    description: h.description,
                    academic_year_id: result.id,
                    created_at: new Date().toISOString(),
                });
            }
        }
    }

    closeModal('add-year-modal');
    await refreshTable('academic_years');
    await refreshTable('terms');
    await refreshTable('holidays');
    await logActivity(state.currentUser?.id, state.currentUser?.role, `Created academic year: ${name}`);
    showToast(`✅ Academic year created${setActive ? ' and activated' : ''}`, 'success');
    loadAcademicCalendar();
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
        showModal(html);
        window._confirmResolve = resolve;
    });
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

async function refreshTable(table) {
    const { getAll } = await import('../../core/api.js');
    if (table === 'terms') {
        state.terms = await getAll('terms');
    } else if (table === 'academic_years') {
        state.academicYears = await getAll('academic_years');
    } else if (table === 'holidays') {
        state.holidays = await getAll('holidays');
    }
}

async function ensureStateLoaded() {
    if (!state.classes.length) {
        const { loadInitialData } = await import('../../core/boot.js');
        await loadInitialData(false);
    }
}

function exportToExcel(data, filename) {
    if (!data?.length) {
        showToast('No data to export', 'warning');
        return;
    }
    if (typeof XLSX === 'undefined') {
        showToast('SheetJS library not loaded', 'warning');
        return;
    }
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Data');
    XLSX.writeFile(wb, `${filename}.xlsx`);
}

// Export functions to window
window._loadAcademicCalendar = loadAcademicCalendar;
window._updateTermDates = updateTermDates;
window._setCurrentTerm = setCurrentTerm;
window._openAddHolidayModal = openAddHolidayModal;
window._saveAcademicCalendar = saveAcademicCalendar;
window._generateYearCalendar = generateYearCalendar;
window._exportAcademicCalendar = exportAcademicCalendar;
window._editHoliday = editHoliday;
window._deleteHoliday = deleteHoliday;
window._importRwandaHolidays = importRwandaHolidays;
window._openAddYearModal = openAddYearModal;
window._activateYear = activateYear;
window._saveHoliday = saveHoliday;
window._updateHoliday = updateHoliday;
window._saveYear = saveYear;