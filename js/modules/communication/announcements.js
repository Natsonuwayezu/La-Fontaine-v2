/**
 * ECOLE LA FONTAINE — Announcements Management
 * Create, edit, delete, and manage all announcements
 * Last updated: 2026-07-03
 * 
 * CHANGES:
 * - Added academic year and term tracking for announcements
 * - Auto-archiving of announcements when term ends
 * - Announcements linked to specific academic years/terms
 * - Archive view for historical announcements
 * - Cleanup of old announcements when new term starts
 */

import {
    state,
    getCurrentUser,
    getCurrentAcademicYear,
    getCurrentTerm,
    getTermsByYear,
    getTermStatus
} from '../../core/state.js';
import { esc, fmtDate, fmtDateTime } from '../../core/utils.js';
import { insert, update, remove, getAll, logActivity, get } from '../../core/api.js';

// ──────────────────────────────────────────────────────────────────────
// MAIN RENDER FUNCTION
// ──────────────────────────────────────────────────────────────────────

export async function renderAnnouncements(container) {
    if (!container) return;

    const user = getCurrentUser();
    if (user?.role !== 'admin') {
        container.innerHTML = '<div class="alert alert-danger">Access denied. Admin privileges required.</div>';
        return;
    }

    await ensureStateLoaded();

    const currentYear = getCurrentAcademicYear();
    const currentTerm = getCurrentTerm();
    const years = (state.academicYears || []).sort((a, b) => b.id - a.id);

    // Auto-archive old announcements if term has ended
    await autoArchiveOldAnnouncements();

    let announcements = [];
    try {
        announcements = await getAll('announcements', 'order=created_at.desc');
    } catch (e) {
        announcements = [];
    }

    // Separate active and archived
    const activeAnnouncements = announcements.filter(a => !a.is_archived);
    const archivedAnnouncements = announcements.filter(a => a.is_archived);

    const totalRead = activeAnnouncements.reduce((sum, a) => sum + (a.read_count || 0), 0);
    const totalRecipients = activeAnnouncements.length > 0
        ? activeAnnouncements.reduce((sum, a) => sum + (a.recipients === 'all' ? (state.teachers?.length || 0) + 1 : 1), 0)
        : 0;

    container.innerHTML = `
        <div class="dash-card">
            <div class="dash-card-header" style="flex-wrap:wrap;gap:8px;">
                <span class="dash-card-title">📢 Announcements Management</span>
                <div class="btn-group" style="flex-wrap:wrap;gap:6px;">
                    <button class="btn btn-sm btn-primary" onclick="window._openCreateAnnouncement()">➕ New Announcement</button>
                    <button class="btn btn-sm btn-outline" onclick="window._refreshAnnouncements()">🔄 Refresh</button>
                    <button class="btn btn-sm btn-outline" onclick="window._exportAnnouncements()">📥 Export</button>
                    <button class="btn btn-sm btn-outline" onclick="window._archiveAllAnnouncements()">📦 Archive Old</button>
                </div>
            </div>
            <div class="dash-card-body" style="padding:0;">
                <div class="stats-grid" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:12px;padding:12px 16px;border-bottom:1px solid var(--border-light);background:var(--bg-tertiary);">
                    <div style="text-align:center;">
                        <div style="font-size:1.2rem;font-weight:700;">${activeAnnouncements.length}</div>
                        <div style="font-size:0.65rem;color:var(--text-muted);text-transform:uppercase;">Active</div>
                    </div>
                    <div style="text-align:center;">
                        <div style="font-size:1.2rem;font-weight:700;">${archivedAnnouncements.length}</div>
                        <div style="font-size:0.65rem;color:var(--text-muted);text-transform:uppercase;">Archived</div>
                    </div>
                    <div style="text-align:center;">
                        <div style="font-size:1.2rem;font-weight:700;">${activeAnnouncements.filter(a => a.type === 'urgent').length}</div>
                        <div style="font-size:0.65rem;color:var(--text-muted);text-transform:uppercase;">Urgent</div>
                    </div>
                    <div style="text-align:center;">
                        <div style="font-size:1.2rem;font-weight:700;">${totalRead}</div>
                        <div style="font-size:0.65rem;color:var(--text-muted);text-transform:uppercase;">Total Reads</div>
                    </div>
                    <div style="text-align:center;">
                        <div style="font-size:1.2rem;font-weight:700;">${activeAnnouncements.filter(a => a.status === 'draft').length}</div>
                        <div style="font-size:0.65rem;color:var(--text-muted);text-transform:uppercase;">Drafts</div>
                    </div>
                    <div style="text-align:center;">
                        <div style="font-size:0.8rem;color:var(--text-secondary);">
                            📅 ${currentYear?.name || 'No Year'} · ${currentTerm?.name || 'No Term'}
                        </div>
                    </div>
                </div>

                <div class="filters-bar" style="padding:8px 16px;border-bottom:1px solid var(--border-light);display:flex;gap:12px;flex-wrap:wrap;align-items:center;">
                    <select id="ann-filter-status" onchange="window._filterAnnouncements()" style="padding:4px 10px;border-radius:6px;border:1px solid var(--border-medium);font-size:0.75rem;">
                        <option value="all">All Status</option>
                        <option value="active">Active</option>
                        <option value="archived">Archived</option>
                        <option value="draft">Drafts</option>
                    </select>
                    <select id="ann-filter-type" onchange="window._filterAnnouncements()" style="padding:4px 10px;border-radius:6px;border:1px solid var(--border-medium);font-size:0.75rem;">
                        <option value="all">All Types</option>
                        <option value="urgent">🚨 Urgent</option>
                        <option value="warning">⚠️ Warning</option>
                        <option value="event">📅 Event</option>
                        <option value="reminder">⏰ Reminder</option>
                        <option value="info">ℹ️ Info</option>
                    </select>
                    <input type="text" id="ann-search" placeholder="🔍 Search..." oninput="window._filterAnnouncements()" style="padding:4px 10px;border-radius:6px;border:1px solid var(--border-medium);font-size:0.75rem;flex:1;min-width:150px;">
                    <span class="result-count" id="ann-count" style="font-size:0.75rem;color:var(--text-muted);">${activeAnnouncements.length} active</span>
                </div>

                <div class="table-wrapper" id="announcements-table">
                    <table class="data-table">
                        <thead>
                            <tr>
                                <th>Type</th>
                                <th>Title</th>
                                <th>Recipients</th>
                                <th>Date</th>
                                <th>Status</th>
                                <th>Year</th>
                                <th>Read</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${announcements.length ? announcements.map(a => {
        const readCount = a.read_count || 0;
        const totalCount = a.recipients === 'all' ? (state.teachers?.length || 0) + 1 :
            a.recipients === 'teachers' ? (state.teachers || []).filter(t => t.role === 'teacher').length :
                a.recipients === 'accountants' ? (state.teachers || []).filter(t => t.role === 'accountant').length : 1;
        const isArchived = a.is_archived;
        const year = state.academicYears.find(y => y.id === a.academic_year_id);
        const isCurrentYear = year?.id === currentYear?.id;
        const rowClass = isArchived ? 'style="opacity:0.7;"' : '';
        return `
                                    <tr data-archived="${isArchived}" data-type="${a.type || 'info'}" data-status="${a.status || 'sent'}" ${rowClass}>
                                        <td><span class="badge ${a.type === 'urgent' ? 'badge-danger' : a.type === 'event' ? 'badge-warning' : a.type === 'warning' ? 'badge-warning' : 'badge-info'}">${a.type || 'general'}</span></td>
                                        <td><strong>${esc(a.title)}</strong> ${isArchived ? '📦' : ''}</td>
                                        <td>${esc(a.recipients || 'All Users')}</td>
                                        <td>${fmtDate(a.created_at)}</td>
                                        <td><span class="badge ${a.status === 'sent' ? 'badge-success' : a.status === 'draft' ? 'badge-neutral' : 'badge-info'}">${a.status || 'sent'}</span></td>
                                        <td>${year ? (isCurrentYear ? '🟢' : '') + esc(year.name) : '—'}</td>
                                        <td>${readCount}/${totalCount}</td>
                                        <td>
                                            <button class="btn btn-sm btn-outline" onclick="window._viewAnnouncement(${a.id})" style="padding:2px 8px;font-size:0.7rem;">👁️</button>
                                            ${!isArchived ? `
                                                <button class="btn btn-sm btn-outline" onclick="window._editAnnouncement(${a.id})" style="padding:2px 8px;font-size:0.7rem;">✏️</button>
                                                <button class="btn btn-sm btn-danger" onclick="window._deleteAnnouncement(${a.id})" style="padding:2px 8px;font-size:0.7rem;">🗑️</button>
                                                <button class="btn btn-sm btn-outline" onclick="window._toggleArchiveAnnouncement(${a.id})" style="padding:2px 8px;font-size:0.7rem;">📦</button>
                                            ` : `
                                                <button class="btn btn-sm btn-success" onclick="window._toggleArchiveAnnouncement(${a.id})" style="padding:2px 8px;font-size:0.7rem;">♻️ Restore</button>
                                            `}
                                        </td>
                                    </tr>
                                `;
    }).join('') : '<tr><td colspan="8" style="text-align:center;padding:20px;color:var(--text-muted);">No announcements yet</td></tr>'}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    `;

    window._openCreateAnnouncement = openCreateAnnouncement;
    window._refreshAnnouncements = refreshAnnouncements;
    window._exportAnnouncements = exportAnnouncements;
    window._viewAnnouncement = viewAnnouncement;
    window._editAnnouncement = editAnnouncement;
    window._deleteAnnouncement = deleteAnnouncement;
    window._filterAnnouncements = filterAnnouncements;
    window._toggleArchiveAnnouncement = toggleArchiveAnnouncement;
    window._archiveAllAnnouncements = archiveAllAnnouncements;
}

// ──────────────────────────────────────────────────────────────────────
// AUTO-ARCHIVE OLD ANNOUNCEMENTS
// ──────────────────────────────────────────────────────────────────────

async function autoArchiveOldAnnouncements() {
    try {
        const currentYear = getCurrentAcademicYear();
        const currentTerm = getCurrentTerm();

        if (!currentYear || !currentTerm) return;

        // Get all announcements for this year/term
        let announcements = [];
        try {
            announcements = await getAll('announcements', 'order=created_at.desc');
        } catch (e) {
            return;
        }

        // Find announcements that should be archived
        const toArchive = announcements.filter(a => {
            // Don't archive drafts
            if (a.status === 'draft') return false;
            // Don't archive already archived
            if (a.is_archived) return false;

            // If announcement has no year/term, check if it's old
            if (!a.academic_year_id && !a.term_id) {
                const createdDate = new Date(a.created_at);
                const termEnd = new Date(currentTerm.end_date);
                // Archive if created before term start
                return createdDate < new Date(currentTerm.start_date);
            }

            // If announcement belongs to a different year/term, archive it
            if (a.academic_year_id && a.academic_year_id !== currentYear.id) {
                return true;
            }
            if (a.term_id && a.term_id !== currentTerm.id) {
                return true;
            }

            // If announcement is from previous term
            if (a.term_id) {
                const term = state.terms.find(t => t.id === a.term_id);
                if (term && term.end_date && new Date(term.end_date) < new Date()) {
                    return true;
                }
            }

            return false;
        });

        if (toArchive.length === 0) return;

        // Archive them
        for (const ann of toArchive) {
            await update('announcements', ann.id, {
                is_archived: true,
                archived_at: new Date().toISOString(),
                archived_reason: 'Auto-archived: term ended',
                updated_at: new Date().toISOString(),
            });
        }

        console.log(`[Announcements] Auto-archived ${toArchive.length} announcements`);

        // Log the action
        if (toArchive.length > 0) {
            await logActivity(
                state.currentUser?.id || 0,
                state.currentUser?.role || 'system',
                `Auto-archived ${toArchive.length} announcements (term ended)`,
                'announcements',
                null,
                { count: toArchive.length }
            );
        }

        // Show notification if we archived some
        if (toArchive.length > 5) {
            showToast(`📦 ${toArchive.length} announcements archived (term ended)`, 'info', 4000);
        }

    } catch (e) {
        console.warn('[Announcements] Auto-archive failed:', e);
    }
}

// ──────────────────────────────────────────────────────────────────────
// OPEN CREATE ANNOUNCEMENT
// ──────────────────────────────────────────────────────────────────────

function openCreateAnnouncement(editId = null) {
    const isEdit = !!editId;
    let ann = null;
    if (isEdit) {
        ann = state.announcements?.find(a => a.id === editId);
        if (!ann) {
            showToast('Announcement not found', 'error');
            return;
        }
    }

    const currentYear = getCurrentAcademicYear();
    const currentTerm = getCurrentTerm();
    const years = (state.academicYears || []).sort((a, b) => b.id - a.id);
    const terms = getTermsByYear(currentYear?.id);

    showModal(`
        <div class="modal-overlay" id="create-announcement-modal">
            <div class="modal" style="max-width:550px;">
                <div class="modal-header">
                    <h3>${isEdit ? '✏️ Edit' : '📢 New'} Announcement</h3>
                    <button class="modal-close" onclick="window.closeModal('create-announcement-modal')">✕</button>
                </div>
                <div class="modal-body">
                    <div class="form-grid">
                        <div class="form-group full">
                            <label>Title *</label>
                            <input type="text" id="ann-title" class="form-control" value="${esc(ann?.title || '')}" placeholder="Announcement title">
                        </div>
                        <div class="form-group full">
                            <label>Message *</label>
                            <textarea id="ann-message" class="form-control" rows="4" placeholder="Announcement message...">${esc(ann?.message || '')}</textarea>
                        </div>
                        <div class="form-group">
                            <label>Type</label>
                            <select id="ann-type" class="form-control">
                                <option value="info" ${ann?.type === 'info' ? 'selected' : ''}>ℹ️ Info</option>
                                <option value="urgent" ${ann?.type === 'urgent' ? 'selected' : ''}>🚨 Urgent</option>
                                <option value="warning" ${ann?.type === 'warning' ? 'selected' : ''}>⚠️ Warning</option>
                                <option value="event" ${ann?.type === 'event' ? 'selected' : ''}>📅 Event</option>
                                <option value="reminder" ${ann?.type === 'reminder' ? 'selected' : ''}>⏰ Reminder</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label>Academic Year</label>
                            <select id="ann-year" class="form-control">
                                ${years.map(y => `
                                    <option value="${y.id}" ${y.id === (ann?.academic_year_id || currentYear?.id) ? 'selected' : ''}>
                                        ${esc(y.name)} ${y.id === currentYear?.id ? '🟢' : ''}
                                    </option>
                                `).join('')}
                            </select>
                        </div>
                        <div class="form-group">
                            <label>Term</label>
                            <select id="ann-term" class="form-control">
                                <option value="">All Terms</option>
                                ${terms.map(t => `
                                    <option value="${t.id}" ${t.id === (ann?.term_id || currentTerm?.id) ? 'selected' : ''}>
                                        ${esc(t.name)}
                                    </option>
                                `).join('')}
                            </select>
                        </div>
                        <div class="form-group">
                            <label>Recipients</label>
                            <select id="ann-recipients" class="form-control">
                                <option value="all" ${ann?.recipients === 'all' ? 'selected' : ''}>All Users</option>
                                <option value="teachers" ${ann?.recipients === 'teachers' ? 'selected' : ''}>Teachers Only</option>
                                <option value="accountants" ${ann?.recipients === 'accountants' ? 'selected' : ''}>Accountants Only</option>
                                <option value="admin" ${ann?.recipients === 'admin' ? 'selected' : ''}>Admin Only</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label>Status</label>
                            <select id="ann-status" class="form-control">
                                <option value="sent" ${ann?.status !== 'draft' ? 'selected' : ''}>✅ Sent</option>
                                <option value="draft" ${ann?.status === 'draft' ? 'selected' : ''}>📝 Draft</option>
                            </select>
                        </div>
                        <div class="form-group full">
                            <label>Action URL (optional)</label>
                            <input type="text" id="ann-action" class="form-control" value="${esc(ann?.action_url || '')}" placeholder="e.g., marks-entry">
                            <small class="field-hint">Module to navigate to when clicked</small>
                        </div>
                        <div class="form-group full" style="font-size:0.8rem;color:var(--text-muted);">
                            📅 This announcement will be associated with ${currentYear?.name || 'Current Year'}${currentTerm ? ` (${currentTerm.name})` : ''}
                            ${ann?.is_archived ? '<br>📦 Currently archived' : ''}
                        </div>
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-outline" onclick="window.closeModal('create-announcement-modal')">Cancel</button>
                    <button class="btn btn-primary" onclick="window._saveAnnouncement(${isEdit ? editId : 'null'})">${isEdit ? '💾 Update' : '📢 Send'}</button>
                </div>
            </div>
        </div>
    `);

    window._saveAnnouncement = saveAnnouncement;
}

// ──────────────────────────────────────────────────────────────────────
// SAVE ANNOUNCEMENT
// ──────────────────────────────────────────────────────────────────────

async function saveAnnouncement(editId = null) {
    const title = document.getElementById('ann-title')?.value.trim();
    const message = document.getElementById('ann-message')?.value.trim();
    const type = document.getElementById('ann-type')?.value || 'info';
    const recipients = document.getElementById('ann-recipients')?.value || 'all';
    const status = document.getElementById('ann-status')?.value || 'sent';
    const actionUrl = document.getElementById('ann-action')?.value.trim() || null;
    const yearId = document.getElementById('ann-year')?.value || null;
    const termId = document.getElementById('ann-term')?.value || null;

    if (!title || !message) {
        showToast('Title and message are required', 'warning');
        return;
    }

    const data = {
        title: title,
        message: message,
        type: type,
        recipients: recipients,
        status: status,
        action_url: actionUrl,
        academic_year_id: yearId ? parseInt(yearId) : null,
        term_id: termId ? parseInt(termId) : null,
        updated_at: new Date().toISOString(),
        is_archived: false,
    };

    let result;
    if (editId) {
        result = await update('announcements', editId, data);
        if (result) {
            await logActivity(state.currentUser?.id, state.currentUser?.role, `Updated announcement: ${title}`);
            showToast('✅ Announcement updated', 'success');
        }
    } else {
        data.created_at = new Date().toISOString();
        data.sender_id = state.currentUser?.id;
        result = await insert('announcements', data);
        if (result) {
            await logActivity(state.currentUser?.id, state.currentUser?.role, `Created announcement: ${title}`);
            showToast('✅ Announcement sent', 'success');
        }
    }

    if (result) {
        closeModal('create-announcement-modal');
        await refreshAnnouncements();
    } else {
        showToast('Failed to save announcement', 'error');
    }
}

// ──────────────────────────────────────────────────────────────────────
// VIEW ANNOUNCEMENT
// ──────────────────────────────────────────────────────────────────────

function viewAnnouncement(id) {
    const ann = state.announcements?.find(a => a.id === id);
    if (!ann) {
        showToast('Announcement not found', 'error');
        return;
    }

    const year = state.academicYears.find(y => y.id === ann.academic_year_id);
    const term = state.terms.find(t => t.id === ann.term_id);

    showModal(`
        <div class="modal-overlay" id="view-announcement-modal">
            <div class="modal" style="max-width:550px;">
                <div class="modal-header">
                    <h3>📢 ${esc(ann.title)}</h3>
                    <button class="modal-close" onclick="window.closeModal('view-announcement-modal')">✕</button>
                </div>
                <div class="modal-body">
                    <div style="margin-bottom:12px;display:flex;gap:8px;flex-wrap:wrap;">
                        <span class="badge ${ann.type === 'urgent' ? 'badge-danger' : ann.type === 'event' ? 'badge-warning' : 'badge-info'}">${ann.type || 'general'}</span>
                        <span class="badge badge-neutral">To: ${esc(ann.recipients || 'All Users')}</span>
                        <span class="badge badge-neutral">${fmtDateTime(ann.created_at)}</span>
                        <span class="badge ${ann.status === 'sent' ? 'badge-success' : 'badge-neutral'}">${ann.status || 'sent'}</span>
                        <span class="badge badge-neutral">${ann.read_count || 0} reads</span>
                        ${year ? `<span class="badge badge-neutral">📅 ${esc(year.name)}</span>` : ''}
                        ${term ? `<span class="badge badge-neutral">${esc(term.name)}</span>` : ''}
                        ${ann.is_archived ? '<span class="badge badge-neutral">📦 Archived</span>' : ''}
                    </div>
                    <div style="white-space:pre-wrap;line-height:1.6;font-size:0.9rem;">${esc(ann.message || '')}</div>
                    ${ann.action_url ? `<div style="margin-top:12px;font-size:0.8rem;color:var(--text-muted);">🔗 Action: ${esc(ann.action_url)}</div>` : ''}
                </div>
                <div class="modal-footer">
                    <button class="btn btn-outline" onclick="window.closeModal('view-announcement-modal')">Close</button>
                    ${ann.action_url ? `<button class="btn btn-primary" onclick="window.closeModal('view-announcement-modal');window.navigateTo('${ann.action_url}')">Go →</button>` : ''}
                </div>
            </div>
        </div>
    `);
}

// ──────────────────────────────────────────────────────────────────────
// EDIT ANNOUNCEMENT
// ──────────────────────────────────────────────────────────────────────

function editAnnouncement(id) {
    closeModal('view-announcement-modal');
    setTimeout(() => openCreateAnnouncement(id), 200);
}

// ──────────────────────────────────────────────────────────────────────
// DELETE ANNOUNCEMENT
// ──────────────────────────────────────────────────────────────────────

async function deleteAnnouncement(id) {
    if (!await confirmDialog('Delete this announcement?')) return;

    const result = await remove('announcements', id);
    if (result) {
        await logActivity(state.currentUser?.id, state.currentUser?.role, `Deleted announcement ID ${id}`);
        showToast('✅ Announcement deleted', 'success');
        await refreshAnnouncements();
    } else {
        showToast('Failed to delete announcement', 'error');
    }
}

// ──────────────────────────────────────────────────────────────────────
// TOGGLE ARCHIVE ANNOUNCEMENT
// ──────────────────────────────────────────────────────────────────────

async function toggleArchiveAnnouncement(id) {
    const ann = state.announcements?.find(a => a.id === id);
    if (!ann) return;

    const newArchived = !ann.is_archived;
    const action = newArchived ? 'Archive' : 'Restore';

    if (newArchived && !await confirmDialog(`Archive this announcement? It will be hidden from main view.`)) return;
    if (!newArchived && !await confirmDialog(`Restore this archived announcement?`)) return;

    const result = await update('announcements', id, {
        is_archived: newArchived,
        archived_at: newArchived ? new Date().toISOString() : null,
        archived_reason: newArchived ? 'Manually archived' : null,
        updated_at: new Date().toISOString(),
    });

    if (result) {
        await logActivity(state.currentUser?.id, state.currentUser?.role, `${action}ed announcement: ${ann.title}`);
        showToast(`✅ Announcement ${action}ed`, 'success');
        await refreshAnnouncements();
    } else {
        showToast(`Failed to ${action.toLowerCase()} announcement`, 'error');
    }
}

// ──────────────────────────────────────────────────────────────────────
// ARCHIVE ALL OLD ANNOUNCEMENTS
// ──────────────────────────────────────────────────────────────────────

async function archiveAllAnnouncements() {
    const currentYear = getCurrentAcademicYear();
    const currentTerm = getCurrentTerm();

    if (!currentYear) {
        showToast('No active academic year', 'warning');
        return;
    }

    let announcements = [];
    try {
        announcements = await getAll('announcements', 'order=created_at.desc');
    } catch (e) {
        announcements = [];
    }

    const toArchive = announcements.filter(a =>
        !a.is_archived &&
        a.status !== 'draft' &&
        (a.academic_year_id !== currentYear.id ||
            (a.term_id && a.term_id !== currentTerm?.id))
    );

    if (toArchive.length === 0) {
        showToast('No old announcements to archive', 'info');
        return;
    }

    if (!await confirmDialog(`Archive ${toArchive.length} old announcements?`)) return;

    let archived = 0;
    for (const ann of toArchive) {
        const result = await update('announcements', ann.id, {
            is_archived: true,
            archived_at: new Date().toISOString(),
            archived_reason: 'Bulk archive',
            updated_at: new Date().toISOString(),
        });
        if (result) archived++;
    }

    await logActivity(state.currentUser?.id, state.currentUser?.role, `Bulk archived ${archived} announcements`);
    showToast(`✅ Archived ${archived} announcements`, 'success');
    await refreshAnnouncements();
}

// ──────────────────────────────────────────────────────────────────────
// FILTER ANNOUNCEMENTS
// ──────────────────────────────────────────────────────────────────────

function filterAnnouncements() {
    const status = document.getElementById('ann-filter-status')?.value || 'all';
    const type = document.getElementById('ann-filter-type')?.value || 'all';
    const search = (document.getElementById('ann-search')?.value || '').toLowerCase();

    const rows = document.querySelectorAll('#announcements-table tbody tr');
    let visible = 0;

    rows.forEach(row => {
        const isArchived = row.dataset.archived === 'true';
        const rowType = row.dataset.type || '';
        const rowStatus = row.dataset.status || '';
        const text = row.textContent.toLowerCase();

        let show = true;
        if (status === 'active' && isArchived) show = false;
        if (status === 'archived' && !isArchived) show = false;
        if (status === 'draft' && rowStatus !== 'draft') show = false;
        if (type !== 'all' && rowType !== type) show = false;
        if (search && !text.includes(search)) show = false;

        row.style.display = show ? '' : 'none';
        if (show) visible++;
    });

    const count = document.getElementById('ann-count');
    if (count) count.textContent = `${visible} announcement${visible !== 1 ? 's' : ''}`;
}

// ──────────────────────────────────────────────────────────────────────
// REFRESH ANNOUNCEMENTS
// ──────────────────────────────────────────────────────────────────────

async function refreshAnnouncements() {
    try {
        const announcements = await getAll('announcements', 'order=created_at.desc');
        state.announcements = announcements;
        renderAnnouncements(document.getElementById('dynamic-content'));
        showToast('🔄 Refreshed', 'info', 1500);
    } catch (e) {
        showToast('Failed to refresh: ' + e.message, 'error');
    }
}

// ──────────────────────────────────────────────────────────────────────
// EXPORT ANNOUNCEMENTS
// ──────────────────────────────────────────────────────────────────────

function exportAnnouncements() {
    const announcements = state.announcements || [];

    if (!announcements.length) {
        showToast('No announcements to export', 'warning');
        return;
    }

    const data = announcements.map(a => {
        const year = state.academicYears.find(y => y.id === a.academic_year_id);
        const term = state.terms.find(t => t.id === a.term_id);
        return {
            'Title': a.title,
            'Message': a.message,
            'Type': a.type || 'general',
            'Recipients': a.recipients || 'all',
            'Status': a.status || 'sent',
            'Date': fmtDateTime(a.created_at),
            'Academic Year': year?.name || '—',
            'Term': term?.name || '—',
            'Read Count': a.read_count || 0,
            'Archived': a.is_archived ? 'Yes' : 'No',
            'Action': a.action_url || '',
        };
    });

    exportToExcel(data, `Announcements_${new Date().toISOString().split('T')[0]}`);
    showToast('✅ Announcements exported', 'success');
}