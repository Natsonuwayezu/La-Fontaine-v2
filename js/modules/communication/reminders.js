/**
 * ECOLE LA FONTAINE — Reminders Module
 * Personal reminders for tasks, deadlines, and follow-ups
 * Last updated: 2026-07-03
 * 
 * CHANGES:
 * - Added academic year and term filtering for reminders
 * - Auto-cleanup of completed reminders when term ends
 * - Reminders are tied to academic year/term
 * - "Clear Completed" for current term
 * - Term-based reminder expiration
 * - Bulk cleanup for old reminders
 */



const ensureStateLoaded = window.ensureStateLoaded || (async () => {}); // global from boot.js
import {
    state,
    getCurrentUser,
    getCurrentAcademicYear,
    getCurrentTerm,
    getTermsByYear,
    getActiveAcademicYearId,
    isCurrentYearEditable
} from '../../core/state.js';
import { esc, fmtDate, fmtDateTime, fmtAgo } from '../../core/utils.js';
import { insert, update, remove, getAll, get, logActivity, removeWhere } from '../../core/api.js';
import { ensureStateLoaded } from '../../core/boot.js';

// ──────────────────────────────────────────────────────────────────────
// MAIN RENDER FUNCTION
// ──────────────────────────────────────────────────────────────────────

export async function renderReminders(container) {
    if (!container) return;

    const user = getCurrentUser();
    if (!user) {
        container.innerHTML = '<div class="alert alert-warning">Please login to view reminders.</div>';
        return;
    }

    await ensureStateLoaded();

    const currentYear = getCurrentAcademicYear();
    const currentTerm = getCurrentTerm();
    const years = (state.academicYears || []).sort((a, b) => b.id - a.id);

    // Load reminders with year/term filtering
    let allReminders = [];
    try {
        allReminders = await getAll('reminders', { user_id: user.id, order: 'due_date.asc' });
    } catch (e) {
        allReminders = [];
    }

    // Auto-cleanup: delete completed reminders from previous terms
    await autoCleanupReminders(allReminders, currentYear, currentTerm);

    // Re-load after cleanup
    try {
        allReminders = await getAll('reminders', { user_id: user.id, order: 'due_date.asc' });
    } catch (e) {
        allReminders = [];
    }

    // Filter by current term/year
    const reminders = allReminders.filter(r => {
        if (r.term_id && currentTerm) return r.term_id == currentTerm.id;
        if (r.academic_year_id && currentYear) return r.academic_year_id == currentYear.id;
        return true; // No year/term assigned — show all
    });

    const upcoming = reminders.filter(r => new Date(r.due_date) >= new Date() && !r.completed)
        .sort((a, b) => new Date(a.due_date) - new Date(b.due_date));

    const overdue = reminders.filter(r => new Date(r.due_date) < new Date() && !r.completed)
        .sort((a, b) => new Date(a.due_date) - new Date(b.due_date));

    const completed = reminders.filter(r => r.completed)
        .sort((a, b) => new Date(b.completed_at) - new Date(a.completed_at));

    const hasCompletedOld = allReminders.some(r => r.completed && r.term_id !== currentTerm?.id);

    container.innerHTML = `
        <div class="dash-card">
            <div class="dash-card-header" style="flex-wrap:wrap;gap:8px;">
                <span class="dash-card-title">⏰ Reminders</span>
                <div class="btn-group" style="flex-wrap:wrap;gap:6px;">
                    <button class="btn btn-sm btn-primary" onclick="window._openAddReminder()">➕ Add Reminder</button>
                    <button class="btn btn-sm btn-outline" onclick="window._clearCompletedReminders()">🗑️ Clear Completed</button>
                    <button class="btn btn-sm btn-outline" onclick="window._exportReminders()">📥 Export</button>
                    <button class="btn btn-sm btn-outline" onclick="window._refreshReminders()">🔄 Refresh</button>
                </div>
            </div>
            <div class="dash-card-body" style="padding:0;">
                <!-- Academic Year / Term Info -->
                <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;padding:8px 16px;border-bottom:1px solid var(--border-light);background:var(--bg-tertiary);font-size:0.75rem;color:var(--text-muted);">
                    <div>
                        📅 ${esc(currentYear?.name || 'Current Year')}
                        ${currentTerm ? `· ${esc(currentTerm.name)}` : ''}
                    </div>
                    <div>
                        ${reminders.length} reminder${reminders.length !== 1 ? 's' : ''} for current term
                        ${hasCompletedOld ? '· 📦 Old completed reminders can be cleared' : ''}
                    </div>
                </div>

                <!-- Stats -->
                <div class="stats-grid" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(100px,1fr));gap:12px;padding:12px 16px;border-bottom:1px solid var(--border-light);background:var(--bg-tertiary);">
                    <div style="text-align:center;">
                        <div style="font-size:1.2rem;font-weight:700;color:var(--danger);">${overdue.length}</div>
                        <div style="font-size:0.65rem;color:var(--text-muted);text-transform:uppercase;">Overdue</div>
                    </div>
                    <div style="text-align:center;">
                        <div style="font-size:1.2rem;font-weight:700;color:var(--warning);">${upcoming.length}</div>
                        <div style="font-size:0.65rem;color:var(--text-muted);text-transform:uppercase;">Upcoming</div>
                    </div>
                    <div style="text-align:center;">
                        <div style="font-size:1.2rem;font-weight:700;color:var(--success);">${completed.length}</div>
                        <div style="font-size:0.65rem;color:var(--text-muted);text-transform:uppercase;">Completed</div>
                    </div>
                    <div style="text-align:center;">
                        <div style="font-size:1.2rem;font-weight:700;">${reminders.length}</div>
                        <div style="font-size:0.65rem;color:var(--text-muted);text-transform:uppercase;">Total</div>
                    </div>
                </div>

                <!-- Tabs -->
                <div class="tabs" style="display:flex;gap:2px;border-bottom:2px solid var(--border-light);padding:0 16px;flex-wrap:wrap;">
                    <button class="tab-btn active" onclick="window._showRemindersTab('upcoming', event)" style="padding:10px 16px;font-size:0.8rem;">📅 Upcoming (${upcoming.length})</button>
                    <button class="tab-btn" onclick="window._showRemindersTab('overdue', event)" style="padding:10px 16px;font-size:0.8rem;">⚠️ Overdue (${overdue.length})</button>
                    <button class="tab-btn" onclick="window._showRemindersTab('completed', event)" style="padding:10px 16px;font-size:0.8rem;">✅ Completed (${completed.length})</button>
                </div>

                <!-- Lists -->
                <div id="reminders-upcoming" style="padding:12px 16px;">
                    ${renderRemindersList(upcoming, 'upcoming', currentTerm)}
                </div>
                <div id="reminders-overdue" style="display:none;padding:12px 16px;">
                    ${renderRemindersList(overdue, 'overdue', currentTerm)}
                </div>
                <div id="reminders-completed" style="display:none;padding:12px 16px;">
                    ${renderRemindersList(completed, 'completed', currentTerm)}
                </div>
            </div>
        </div>
    `;

    window._openAddReminder = openAddReminder;
    window._exportReminders = exportReminders;
    window._refreshReminders = refreshReminders;
    window._showRemindersTab = showRemindersTab;
    window._completeReminder = completeReminder;
    window._deleteReminder = deleteReminder;
    window._clearCompletedReminders = clearCompletedReminders;
}

// ──────────────────────────────────────────────────────────────────────
// AUTO CLEANUP REMINDERS
// ──────────────────────────────────────────────────────────────────────

async function autoCleanupReminders(reminders, currentYear, currentTerm) {
    if (!currentTerm) return;

    // Find completed reminders from previous terms
    const oldCompleted = reminders.filter(r =>
        r.completed === true &&
        r.term_id &&
        r.term_id != currentTerm.id
    );

    if (oldCompleted.length === 0) return;

    // Delete old completed reminders
    let deleted = 0;
    for (const r of oldCompleted) {
        try {
            await remove('reminders', r.id);
            deleted++;
        } catch (e) {
            console.warn('[Reminders] Auto-cleanup failed for:', r.id);
        }
    }

    if (deleted > 0) {
        console.log(`[Reminders] Auto-cleaned ${deleted} old completed reminders`);
    }
}

// ──────────────────────────────────────────────────────────────────────
// CLEAR COMPLETED REMINDERS
// ──────────────────────────────────────────────────────────────────────

async function clearCompletedReminders() {
    const user = getCurrentUser();
    if (!user) return;

    const currentTerm = getCurrentTerm();
    const currentYear = getCurrentAcademicYear();

    // Get all reminders for this user
    let reminders = [];
    try {
        reminders = await getAll('reminders', { user_id: user.id });
    } catch (e) {
        reminders = [];
    }

    // Find completed reminders
    const completed = reminders.filter(r => r.completed === true);

    if (completed.length === 0) {
        showToast('No completed reminders to clear', 'info');
        return;
    }

    const confirmMsg = `Delete ${completed.length} completed reminder${completed.length !== 1 ? 's' : ''}?`;
    if (!await confirmDialog(confirmMsg)) return;

    let deleted = 0;
    for (const r of completed) {
        try {
            await remove('reminders', r.id);
            deleted++;
        } catch (e) {
            console.warn('[Reminders] Clear failed:', e);
        }
    }

    await logActivity(user.id, user.role, `Cleared ${deleted} completed reminders`);
    showToast(`✅ Cleared ${deleted} completed reminders`, 'success');
    await refreshReminders();
}

// ──────────────────────────────────────────────────────────────────────
// RENDER REMINDERS LIST
// ──────────────────────────────────────────────────────────────────────

function renderRemindersList(reminders, status, currentTerm) {
    if (!reminders || !reminders.length) {
        return `<div style="text-align:center;padding:30px;color:var(--text-muted);">${status === 'upcoming' ? '📅 No upcoming reminders' : status === 'overdue' ? '🎉 No overdue reminders!' : '📋 No completed reminders'}</div>`;
    }

    return reminders.map(r => {
        const isOverdue = status === 'overdue';
        const daysDiff = Math.ceil((new Date(r.due_date) - new Date()) / 86400000);
        const isUrgent = daysDiff <= 2 && !isOverdue;

        // Term badge
        const term = r.term_id ? state.terms.find(t => t.id == r.term_id) : null;
        const termBadge = term ? `<span class="badge badge-neutral" style="font-size:0.55rem;margin-left:4px;">${esc(term.name)}</span>` : '';

        return `
            <div style="display:flex;justify-content:space-between;align-items:center;padding:12px 16px;margin-bottom:8px;background:var(--bg-secondary);border-radius:var(--r-md);border:1px solid var(--border-light);${isOverdue ? 'border-left:4px solid var(--danger);' : isUrgent ? 'border-left:4px solid var(--warning);' : ''}">
                <div style="flex:1;min-width:0;">
                    <div style="font-weight:600;font-size:0.9rem;">${esc(r.title)} ${termBadge}</div>
                    ${r.message ? `<div style="font-size:0.8rem;color:var(--text-muted);margin-top:2px;">${esc(r.message)}</div>` : ''}
                    <div style="font-size:0.7rem;color:${isOverdue ? 'var(--danger)' : isUrgent ? 'var(--warning)' : 'var(--text-muted)'};margin-top:4px;">
                        ${status === 'completed'
                ? `✅ Completed ${fmtAgo(r.completed_at)}`
                : `📅 Due ${fmtDate(r.due_date)} ${isOverdue ? `(${Math.abs(daysDiff)} days overdue)` : `(${daysDiff} days left)`}`
            }
                        ${r.academic_year_id ? `· ${state.academicYears.find(y => y.id == r.academic_year_id)?.name || ''}` : ''}
                    </div>
                </div>
                <div style="display:flex;gap:6px;flex-shrink:0;margin-left:12px;">
                    ${status !== 'completed' ? `<button class="btn btn-sm btn-success" onclick="window._completeReminder(${r.id})" style="padding:4px 10px;font-size:0.7rem;">✅ Done</button>` : ''}
                    <button class="btn btn-sm btn-danger" onclick="window._deleteReminder(${r.id})" style="padding:4px 10px;font-size:0.7rem;">🗑️</button>
                </div>
            </div>
        `;
    }).join('');
}

// ──────────────────────────────────────────────────────────────────────
// SHOW REMINDERS TAB
// ──────────────────────────────────────────────────────────────────────

function showRemindersTab(tab, event) {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    if (event?.target) event.target.classList.add('active');

    ['upcoming', 'overdue', 'completed'].forEach(t => {
        const el = document.getElementById(`reminders-${t}`);
        if (el) el.style.display = t === tab ? 'block' : 'none';
    });
}

// ──────────────────────────────────────────────────────────────────────
// OPEN ADD REMINDER
// ──────────────────────────────────────────────────────────────────────

function openAddReminder() {
    const currentYear = getCurrentAcademicYear();
    const currentTerm = getCurrentTerm();
    const terms = getTermsByYear(currentYear?.id);

    showModal(`
        <div class="modal-overlay" id="add-reminder-modal">
            <div class="modal" style="max-width:450px;">
                <div class="modal-header">
                    <h3>⏰ Add Reminder</h3>
                    <button class="modal-close" onclick="window.closeModal('add-reminder-modal')">✕</button>
                </div>
                <div class="modal-body">
                    <div class="form-grid">
                        <div class="form-group full">
                            <label>Title *</label>
                            <input type="text" id="rem-title" class="form-control" placeholder="e.g., Fee payment deadline">
                        </div>
                        <div class="form-group full">
                            <label>Academic Year</label>
                            <select id="rem-year" class="form-control">
                                ${(state.academicYears || []).sort((a, b) => b.id - a.id).map(y => `
                                    <option value="${y.id}" ${y.id === currentYear?.id ? 'selected' : ''}>
                                        ${esc(y.name)} ${y.id === currentYear?.id ? '🟢' : ''}
                                    </option>
                                `).join('')}
                            </select>
                        </div>
                        <div class="form-group full">
                            <label>Term</label>
                            <select id="rem-term" class="form-control">
                                <option value="">All Terms</option>
                                ${terms.map(t => `
                                    <option value="${t.id}" ${t.id === currentTerm?.id ? 'selected' : ''}>
                                        ${esc(t.name)}
                                    </option>
                                `).join('')}
                            </select>
                        </div>
                        <div class="form-group full">
                            <label>Due Date *</label>
                            <input type="date" id="rem-due" class="form-control" min="${new Date().toISOString().split('T')[0]}">
                        </div>
                        <div class="form-group full">
                            <label>Message</label>
                            <textarea id="rem-message" class="form-control" rows="3" placeholder="Reminder details..."></textarea>
                        </div>
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-outline" onclick="window.closeModal('add-reminder-modal')">Cancel</button>
                    <button class="btn btn-primary" onclick="window._saveReminder()">💾 Save</button>
                </div>
            </div>
        </div>
    `);

    window._saveReminder = saveReminder;
}

// ──────────────────────────────────────────────────────────────────────
// SAVE REMINDER
// ──────────────────────────────────────────────────────────────────────

async function saveReminder() {
    const title = document.getElementById('rem-title')?.value.trim();
    const dueDate = document.getElementById('rem-due')?.value;
    const message = document.getElementById('rem-message')?.value.trim() || null;
    const yearId = document.getElementById('rem-year')?.value;
    const termId = document.getElementById('rem-term')?.value || null;

    if (!title || !dueDate) {
        showToast('Title and due date are required', 'warning');
        return;
    }

    const result = await insert('reminders', {
        title: title,
        due_date: dueDate,
        message: message,
        user_id: state.currentUser?.id,
        academic_year_id: yearId || null,
        term_id: termId || null,
        completed: false,
        created_at: new Date().toISOString(),
    });

    if (result) {
        closeModal('add-reminder-modal');
        await refreshReminders();
        await logActivity(state.currentUser?.id, state.currentUser?.role, `Created reminder: ${title}`);
        showToast('✅ Reminder saved', 'success');
    } else {
        showToast('Failed to save reminder', 'error');
    }
}

// ──────────────────────────────────────────────────────────────────────
// COMPLETE REMINDER
// ──────────────────────────────────────────────────────────────────────

async function completeReminder(id) {
    const result = await update('reminders', id, {
        completed: true,
        completed_at: new Date().toISOString(),
    });

    if (result) {
        await logActivity(state.currentUser?.id, state.currentUser?.role, `Completed reminder ID ${id}`);
        showToast('✅ Reminder completed', 'success');
        await refreshReminders();
    } else {
        showToast('Failed to complete reminder', 'error');
    }
}

// ──────────────────────────────────────────────────────────────────────
// DELETE REMINDER
// ──────────────────────────────────────────────────────────────────────

async function deleteReminder(id) {
    if (!await confirmDialog('Delete this reminder?')) return;

    const result = await remove('reminders', id);
    if (result) {
        await logActivity(state.currentUser?.id, state.currentUser?.role, `Deleted reminder ID ${id}`);
        showToast('✅ Reminder deleted', 'success');
        await refreshReminders();
    } else {
        showToast('Failed to delete reminder', 'error');
    }
}

// ──────────────────────────────────────────────────────────────────────
// REFRESH REMINDERS
// ──────────────────────────────────────────────────────────────────────

async function refreshReminders() {
    try {
        const user = getCurrentUser();
        if (!user) return;
        const reminders = await getAll('reminders', { user_id: user.id, order: 'due_date.asc' });
        state.reminders = reminders;
        renderReminders(document.getElementById('dynamic-content'));
        showToast('🔄 Refreshed', 'info', 1500);
    } catch (e) {
        showToast('Failed to refresh: ' + e.message, 'error');
    }
}

// ──────────────────────────────────────────────────────────────────────
// EXPORT REMINDERS
// ──────────────────────────────────────────────────────────────────────

function exportReminders() {
    const reminders = state.reminders || [];

    if (!reminders.length) {
        showToast('No reminders to export', 'warning');
        return;
    }

    const data = reminders.map(r => ({
        'Title': r.title,
        'Message': r.message || '',
        'Due Date': fmtDate(r.due_date),
        'Academic Year': state.academicYears.find(y => y.id == r.academic_year_id)?.name || '',
        'Term': state.terms.find(t => t.id == r.term_id)?.name || '',
        'Status': r.completed ? 'Completed' : 'Pending',
        'Created': fmtDateTime(r.created_at),
        'Completed': r.completed_at ? fmtDateTime(r.completed_at) : '',
    }));

    exportToExcel(data, `Reminders_${new Date().toISOString().split('T')[0]}`);
    showToast('✅ Reminders exported', 'success');
}