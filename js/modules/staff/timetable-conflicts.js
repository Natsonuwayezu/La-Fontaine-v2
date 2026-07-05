/**
 * ECOLE LA FONTAINE — Timetable Conflicts
 * Detect and resolve teacher, class, and room conflicts
 * Last updated: 2026-06-29
 */



const state = window.state || {}; // global state alias
const ensureStateLoaded = window.ensureStateLoaded || (async () => {}); // global from boot.js
import { state, getCurrentUser, getClassById, getSubjectById, getTeacherById } from '../../core/state.js';
import { esc } from '../../core/utils.js';
import { getAll, remove, refreshTable, logActivity } from '../../core/api.js';
import { TIMETABLE_DAYS, TIMETABLE_TIME_SLOTS } from '../../config/constants.js';

// ──────────────────────────────────────────────────────────────────────
// MAIN RENDER FUNCTION
// ──────────────────────────────────────────────────────────────────────

export async function renderTimetableConflicts(container) {
    if (!container) return;

    const user = getCurrentUser();
    if (user?.role !== 'admin') {
        container.innerHTML = '<div class="alert alert-danger">Access denied. Admin privileges required.</div>';
        return;
    }

    await ensureStateLoaded();

    container.innerHTML = `
        <div class="dash-card">
            <div class="dash-card-header" style="flex-wrap:wrap;gap:8px;">
                <span class="dash-card-title">⚠️ Timetable Conflict Detector</span>
                <div class="btn-group" style="flex-wrap:wrap;gap:6px;">
                    <button class="btn btn-sm btn-primary" onclick="window._detectAllConflicts()">🔍 Detect Conflicts</button>
                    <button class="btn btn-sm btn-outline" onclick="window._exportConflictReport()">📥 Export Report</button>
                </div>
            </div>
            <div class="dash-card-body">
                <div class="alert alert-info" style="font-size:0.8rem;">
                    <strong>Conflict Types:</strong>
                    <ul style="margin-top:8px;margin-left:20px;">
                        <li><strong>Teacher Conflict:</strong> Same teacher assigned to two different classes at the same time</li>
                        <li><strong>Classroom Conflict:</strong> Same classroom assigned to two different classes at the same time</li>
                        <li><strong>Teacher Overload:</strong> Teacher has more than 8 periods in a single day</li>
                    </ul>
                </div>

                <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:12px;align-items:center;">
                    <select id="conflict-type-filter" class="form-control" style="width:150px;" onchange="window._filterConflicts()">
                        <option value="all">All Conflicts</option>
                        <option value="teacher">Teacher Conflicts</option>
                        <option value="room">Classroom Conflicts</option>
                        <option value="overload">Teacher Overload</option>
                    </select>
                    <span class="result-count" id="conflict-count"></span>
                </div>

                <div id="conflicts-container" class="table-wrapper">
                    <div class="loading-container"><div class="spinner"></div><p>Click "Detect Conflicts" to start analysis</p></div>
                </div>
            </div>
        </div>

        <div class="dash-card" style="margin-top:20px;">
            <div class="dash-card-header">
                <span class="dash-card-title">📊 Conflict Statistics</span>
            </div>
            <div class="dash-card-body">
                <div id="conflict-stats" class="stats-grid" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:12px;">
                    <div class="loading-container"><div class="spinner"></div><p>Run detection to see stats</p></div>
                </div>
            </div>
        </div>
    `;

    window._detectAllConflicts = detectAllConflicts;
    window._exportConflictReport = exportConflictReport;
    window._filterConflicts = filterConflicts;
    window._resolveConflict = resolveConflict;

    window._currentConflicts = [];
}

// ──────────────────────────────────────────────────────────────────────
// DETECT ALL CONFLICTS
// ──────────────────────────────────────────────────────────────────────

async function detectAllConflicts() {
    const container = document.getElementById('conflicts-container');
    const statsContainer = document.getElementById('conflict-stats');
    if (!container) return;

    container.innerHTML = '<div class="loading-container"><div class="spinner"></div><p>Scanning for conflicts...</p></div>';

    let allSlots = [];
    try {
        allSlots = await getAll('timetable_slots', 'order=teacher_id.asc,day_of_week.asc,time_slot.asc');
    } catch (e) {
        allSlots = [];
    }

    const conflicts = [];
    const seen = {};

    // ── Teacher conflicts (same teacher, same day, same time) ──
    for (const slot of allSlots) {
        if (!slot.teacher_id) continue;
        const key = `${slot.teacher_id}_${slot.day_of_week}_${slot.time_slot}`;
        if (seen[key]) {
            conflicts.push({
                type: 'teacher',
                slot1: seen[key],
                slot2: slot,
                message: `Teacher ${seen[key].teacher_id} has conflicting slots at ${slot.day_of_week} ${slot.time_slot}`,
            });
        } else {
            seen[key] = slot;
        }
    }

    // ── Room conflicts (same room, same day, same time) ──
    const roomSeen = {};
    for (const slot of allSlots) {
        if (!slot.room) continue;
        const key = `${slot.room}_${slot.day_of_week}_${slot.time_slot}`;
        if (roomSeen[key]) {
            conflicts.push({
                type: 'room',
                slot1: roomSeen[key],
                slot2: slot,
                message: `Room ${slot.room} has conflicting bookings at ${slot.day_of_week} ${slot.time_slot}`,
            });
        } else {
            roomSeen[key] = slot;
        }
    }

    // ── Teacher overload (more than 8 periods in a day) ──
    const teacherDayCount = {};
    for (const slot of allSlots) {
        if (!slot.teacher_id) continue;
        const key = `${slot.teacher_id}_${slot.day_of_week}`;
        teacherDayCount[key] = (teacherDayCount[key] || 0) + 1;
    }

    for (const [key, count] of Object.entries(teacherDayCount)) {
        if (count > 8) {
            const [teacherId, day] = key.split('_');
            const slots = allSlots.filter(s => s.teacher_id == teacherId && s.day_of_week === day);
            conflicts.push({
                type: 'overload',
                teacher_id: parseInt(teacherId),
                day: day,
                count: count,
                slots: slots,
                message: `Teacher ${teacherId} has ${count} periods on ${day} (overload)`,
            });
        }
    }

    window._currentConflicts = conflicts;

    // ── Render conflicts ──
    const countEl = document.getElementById('conflict-count');
    if (countEl) countEl.textContent = `${conflicts.length} conflict${conflicts.length !== 1 ? 's' : ''}`;

    if (!conflicts.length) {
        container.innerHTML = '<div class="alert alert-success">✅ No conflicts detected!</div>';
        statsContainer.innerHTML = `
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:12px;width:100%;">
                <div class="stat-card" style="padding:10px 14px;background:var(--bg-secondary);border-radius:var(--r-lg);border:1px solid var(--border-light);text-align:center;">
                    <div style="font-size:1.2rem;font-weight:700;color:var(--success);">0</div>
                    <div style="font-size:0.65rem;color:var(--text-muted);text-transform:uppercase;">Total</div>
                </div>
                <div class="stat-card" style="padding:10px 14px;background:var(--bg-secondary);border-radius:var(--r-lg);border:1px solid var(--border-light);text-align:center;">
                    <div style="font-size:1.2rem;font-weight:700;color:var(--success);">0</div>
                    <div style="font-size:0.65rem;color:var(--text-muted);text-transform:uppercase;">Teacher</div>
                </div>
                <div class="stat-card" style="padding:10px 14px;background:var(--bg-secondary);border-radius:var(--r-lg);border:1px solid var(--border-light);text-align:center;">
                    <div style="font-size:1.2rem;font-weight:700;color:var(--success);">0</div>
                    <div style="font-size:0.65rem;color:var(--text-muted);text-transform:uppercase;">Room</div>
                </div>
                <div class="stat-card" style="padding:10px 14px;background:var(--bg-secondary);border-radius:var(--r-lg);border:1px solid var(--border-light);text-align:center;">
                    <div style="font-size:1.2rem;font-weight:700;color:var(--success);">0</div>
                    <div style="font-size:0.65rem;color:var(--text-muted);text-transform:uppercase;">Overload</div>
                </div>
            </div>
        `;
        return;
    }

    // ── Render conflict table ──
    const rows = conflicts.map((c, i) => {
        if (c.type === 'teacher') {
            const t = getTeacherById(c.slot1.teacher_id);
            const s1 = getSubjectById(c.slot1.subject_id);
            const s2 = getSubjectById(c.slot2.subject_id);
            const c1 = getClassById(c.slot1.class_id);
            const c2 = getClassById(c.slot2.class_id);
            return `
                <tr>
                    <td><span class="badge badge-danger">👨‍🏫 Teacher</span></td>
                    <td>${esc(t ? `${t.first_name} ${t.last_name}` : '—')}</td>
                    <td>${esc(c.slot1.day_of_week)} ${esc(c.slot1.time_slot)}</td>
                    <td>${esc(c1?.name || '—')} — ${esc(s1?.name || '—')}</td>
                    <td>${esc(c2?.name || '—')} — ${esc(s2?.name || '—')}</td>
                    <td><button class="btn btn-sm btn-danger" onclick="window._resolveConflict(${c.slot2.id})" style="padding:2px 8px;font-size:0.7rem;">🗑️ Remove 2nd</button></td>
                </tr>
            `;
        } else if (c.type === 'room') {
            const s1 = getSubjectById(c.slot1.subject_id);
            const s2 = getSubjectById(c.slot2.subject_id);
            const c1 = getClassById(c.slot1.class_id);
            const c2 = getClassById(c.slot2.class_id);
            return `
                <tr>
                    <td><span class="badge badge-warning">🚪 Room</span></td>
                    <td>${esc(c.slot1.room)}</td>
                    <td>${esc(c.slot1.day_of_week)} ${esc(c.slot1.time_slot)}</td>
                    <td>${esc(c1?.name || '—')} — ${esc(s1?.name || '—')}</td>
                    <td>${esc(c2?.name || '—')} — ${esc(s2?.name || '—')}</td>
                    <td><button class="btn btn-sm btn-danger" onclick="window._resolveConflict(${c.slot2.id})" style="padding:2px 8px;font-size:0.7rem;">🗑️ Remove 2nd</button></td>
                </tr>
            `;
        } else if (c.type === 'overload') {
            const t = getTeacherById(c.teacher_id);
            return `
                <tr>
                    <td><span class="badge badge-warning">📊 Overload</span></td>
                    <td>${esc(t ? `${t.first_name} ${t.last_name}` : '—')}</td>
                    <td>${esc(c.day)}</td>
                    <td colspan="2">${c.count} periods (${c.slots.map(s => {
                const subj = getSubjectById(s.subject_id);
                const cls = getClassById(s.class_id);
                return `${cls?.name || '—'} (${subj?.name || '—'})`;
            }).join(', ')})</td>
                    <td><span class="badge badge-danger">Overload by ${c.count - 8}</span></td>
                </tr>
            `;
        }
        return '';
    }).join('');

    container.innerHTML = `
        <div class="table-wrapper">
            <table class="data-table">
                <thead>
                    <tr>
                        <th style="width:100px;">Type</th>
                        <th>Teacher/Room</th>
                        <th>Day & Time</th>
                        <th>Slot 1</th>
                        <th>Slot 2</th>
                        <th>Action</th>
                    </tr>
                </thead>
                <tbody>
                    ${rows}
                </tbody>
            </table>
        </div>
    `;

    // ── Render stats ──
    const teacherConflicts = conflicts.filter(c => c.type === 'teacher').length;
    const roomConflicts = conflicts.filter(c => c.type === 'room').length;
    const overloadConflicts = conflicts.filter(c => c.type === 'overload').length;

    statsContainer.innerHTML = `
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:12px;width:100%;">
            <div class="stat-card" style="padding:10px 14px;background:var(--bg-secondary);border-radius:var(--r-lg);border:1px solid var(--border-light);text-align:center;">
                <div style="font-size:1.2rem;font-weight:700;color:var(--danger);">${conflicts.length}</div>
                <div style="font-size:0.65rem;color:var(--text-muted);text-transform:uppercase;">Total</div>
            </div>
            <div class="stat-card" style="padding:10px 14px;background:var(--bg-secondary);border-radius:var(--r-lg);border:1px solid var(--border-light);text-align:center;">
                <div style="font-size:1.2rem;font-weight:700;color:var(--danger);">${teacherConflicts}</div>
                <div style="font-size:0.65rem;color:var(--text-muted);text-transform:uppercase;">Teacher</div>
            </div>
            <div class="stat-card" style="padding:10px 14px;background:var(--bg-secondary);border-radius:var(--r-lg);border:1px solid var(--border-light);text-align:center;">
                <div style="font-size:1.2rem;font-weight:700;color:var(--warning);">${roomConflicts}</div>
                <div style="font-size:0.65rem;color:var(--text-muted);text-transform:uppercase;">Room</div>
            </div>
            <div class="stat-card" style="padding:10px 14px;background:var(--bg-secondary);border-radius:var(--r-lg);border:1px solid var(--border-light);text-align:center;">
                <div style="font-size:1.2rem;font-weight:700;color:var(--warning);">${overloadConflicts}</div>
                <div style="font-size:0.65rem;color:var(--text-muted);text-transform:uppercase;">Overload</div>
            </div>
        </div>
    `;
}

// ──────────────────────────────────────────────────────────────────────
// FILTER CONFLICTS
// ──────────────────────────────────────────────────────────────────────

function filterConflicts() {
    const filter = document.getElementById('conflict-type-filter')?.value || 'all';
    const rows = document.querySelectorAll('#conflicts-container tbody tr');

    let visible = 0;
    rows.forEach(row => {
        const type = row.querySelector('td:first-child .badge')?.textContent?.trim() || '';
        let show = true;
        if (filter === 'teacher') show = type === '👨‍🏫 Teacher';
        else if (filter === 'room') show = type === '🚪 Room';
        else if (filter === 'overload') show = type === '📊 Overload';
        row.style.display = show ? '' : 'none';
        if (show) visible++;
    });

    const count = document.getElementById('conflict-count');
    if (count) count.textContent = `${visible} conflict${visible !== 1 ? 's' : ''}`;
}

// ──────────────────────────────────────────────────────────────────────
// RESOLVE CONFLICT
// ──────────────────────────────────────────────────────────────────────

async function resolveConflict(slotId) {
    if (!await confirmDialog('Delete this timetable slot to resolve the conflict?')) return;

    const result = await remove('timetable_slots', slotId);
    if (result) {
        await refreshTable('timetable_slots');
        await logActivity(state.currentUser?.id, state.currentUser?.role, `Resolved timetable conflict (deleted slot ${slotId})`);
        showToast('✅ Conflict resolved', 'success');
        detectAllConflicts();
    } else {
        showToast('Failed to resolve conflict', 'error');
    }
}

// ──────────────────────────────────────────────────────────────────────
// EXPORT CONFLICT REPORT
// ──────────────────────────────────────────────────────────────────────

function exportConflictReport() {
    const conflicts = window._currentConflicts || [];

    if (!conflicts.length) {
        showToast('No conflicts to export', 'info');
        return;
    }

    const data = conflicts.map(c => {
        if (c.type === 'teacher') {
            const t = getTeacherById(c.slot1.teacher_id);
            const s1 = getSubjectById(c.slot1.subject_id);
            const s2 = getSubjectById(c.slot2.subject_id);
            const c1 = getClassById(c.slot1.class_id);
            const c2 = getClassById(c.slot2.class_id);
            return {
                'Type': 'Teacher Conflict',
                'Teacher': t ? `${t.first_name} ${t.last_name}` : '—',
                'Day': c.slot1.day_of_week,
                'Time': c.slot1.time_slot,
                'Slot 1': `${c1?.name || '—'} — ${s1?.name || '—'}`,
                'Slot 2': `${c2?.name || '—'} — ${s2?.name || '—'}`,
            };
        } else if (c.type === 'room') {
            const s1 = getSubjectById(c.slot1.subject_id);
            const s2 = getSubjectById(c.slot2.subject_id);
            const c1 = getClassById(c.slot1.class_id);
            const c2 = getClassById(c.slot2.class_id);
            return {
                'Type': 'Room Conflict',
                'Room': c.slot1.room,
                'Day': c.slot1.day_of_week,
                'Time': c.slot1.time_slot,
                'Slot 1': `${c1?.name || '—'} — ${s1?.name || '—'}`,
                'Slot 2': `${c2?.name || '—'} — ${s2?.name || '—'}`,
            };
        } else if (c.type === 'overload') {
            const t = getTeacherById(c.teacher_id);
            return {
                'Type': 'Teacher Overload',
                'Teacher': t ? `${t.first_name} ${t.last_name}` : '—',
                'Day': c.day,
                'Periods': c.count,
                'Overload': c.count - 8,
                'Slots': c.slots.map(s => {
                    const subj = getSubjectById(s.subject_id);
                    const cls = getClassById(s.class_id);
                    return `${cls?.name || '—'} (${subj?.name || '—'})`;
                }).join('; '),
            };
        }
        return {};
    });

    exportToExcel(data, `Timetable_Conflicts_${new Date().toISOString().split('T')[0]}`);
    showToast('✅ Conflict report exported', 'success');
}