/**
 * ECOLE LA FONTAINE — Notifications Module
 * View, filter, mark read, and manage all notifications
 * Last updated: 2026-07-03
 * 
 * CHANGES:
 * - Added term-based notification filtering
 * - Notifications are automatically archived/cleared when term ends
 * - Added "Clear All" with term/date filtering
 * - Notifications are associated with academic terms
 * - Old notifications can be archived or deleted
 * - Added notification retention settings
 */



const ensureStateLoaded = window.ensureStateLoaded || (async () => {}); // global from boot.js
import {
    state,
    getCurrentUser,
    getCurrentAcademicYear,
    getCurrentTerm,
    getTermsByYear,
    getTermStatus
} from '../../core/state.js';
import { esc, fmtDate, fmtDateTime, fmtAgo } from '../../core/utils.js';
import { update, getAll, insert, remove, updateWhere, logActivity } from '../../core/api.js';
import { updateNotificationBadge, fetchUnreadNotifications, markNotificationRead, markAllNotificationsRead } from '../../core/notifications.js';
import { confirmDialog } from '../../ui/modals.js';
import { showToast } from '../../ui/toast.js';

// ──────────────────────────────────────────────────────────────────────
// STATE
// ──────────────────────────────────────────────────────────────────────

let currentFilter = 'all'; // 'all' | 'unread' | 'read' | 'current_term' | 'archived'
let selectedTermId = null;
let showArchived = false;

// ──────────────────────────────────────────────────────────────────────
// MAIN RENDER FUNCTION
// ──────────────────────────────────────────────────────────────────────

export async function renderNotifications(container) {
    if (!container) return;

    const user = getCurrentUser();
    if (!user) {
        container.innerHTML = '<div class="alert alert-warning">Please login to view notifications.</div>';
        return;
    }

    await ensureStateLoaded();

    // Load notifications if not already loaded
    if (!state.notifications || !state.notifications.length) {
        await fetchUnreadNotifications();
    }

    // Load archived notifications
    if (!state.archivedNotifications) {
        state.archivedNotifications = [];
        try {
            const archived = await getAll('notifications_archive');
            state.archivedNotifications = archived || [];
        } catch (e) {
            state.archivedNotifications = [];
        }
    }

    const currentYear = getCurrentAcademicYear();
    const currentTerm = getCurrentTerm();
    const terms = getTermsByYear(currentYear?.id);
    const notifs = state.notifications || [];
    const archivedNotifs = state.archivedNotifications || [];
    const unreadCount = notifs.filter(n => !n.is_read).length;

    // Check if term has ended
    const termStatus = currentTerm ? getTermStatus(currentTerm) : 'unknown';
    const isTermEnded = termStatus === 'completed' || (currentTerm?.end_date && new Date(currentTerm.end_date) < new Date());

    container.innerHTML = `
        <div class="dash-card">
            <div class="dash-card-header" style="flex-wrap:wrap;gap:8px;">
                <span class="dash-card-title">🔔 Notifications 
                    ${unreadCount > 0 ? `<span class="badge badge-danger" style="font-size:0.7rem;">${unreadCount} unread</span>` : ''}
                    ${isTermEnded ? `<span class="badge badge-warning" style="font-size:0.7rem;">📅 Term Ended</span>` : ''}
                </span>
                <div class="btn-group" style="flex-wrap:wrap;gap:6px;">
                    <select id="notif-term-filter" onchange="window._filterNotifications()" style="padding:4px 8px;border-radius:6px;border:1px solid var(--border-medium);font-size:0.75rem;">
                        <option value="all">All Terms</option>
                        ${terms.map(t => `
                            <option value="${t.id}" ${t.id === currentTerm?.id ? 'selected' : ''}>
                                ${esc(t.name)} ${t.id === currentTerm?.id ? '🟢' : ''}
                            </option>
                        `).join('')}
                        <option value="archived">📦 Archived</option>
                    </select>
                    <select id="notif-status-filter" onchange="window._filterNotifications()" style="padding:4px 8px;border-radius:6px;border:1px solid var(--border-medium);font-size:0.75rem;">
                        <option value="all">All Status</option>
                        <option value="unread">Unread</option>
                        <option value="read">Read</option>
                    </select>
                    <button class="btn btn-sm btn-outline" onclick="window._markAllNotificationsRead()" ${unreadCount === 0 ? 'disabled' : ''}>✅ Mark All Read</button>
                    <button class="btn btn-sm btn-outline" onclick="window._clearTermNotifications()" ${notifs.length === 0 ? 'disabled' : ''}>🗑️ Clear Term</button>
                    <button class="btn btn-sm btn-outline" onclick="window._archiveTermNotifications()" ${notifs.length === 0 ? 'disabled' : ''}>📦 Archive Term</button>
                    <button class="btn btn-sm btn-outline" onclick="window._refreshNotifications()">🔄 Refresh</button>
                </div>
            </div>
            <div class="dash-card-body" style="padding:0;">
                <div style="padding:8px 16px;border-bottom:1px solid var(--border-light);display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px;background:var(--bg-tertiary);font-size:0.75rem;color:var(--text-muted);">
                    <span>📅 ${currentTerm?.name || 'Current Term'} · ${currentYear?.name || ''}</span>
                    <span>${isTermEnded ? '⚠️ Term has ended — notifications can be cleared or archived' : '📬 Active term'}</span>
                    <span>${notifs.filter(n => n.is_read).length} read · ${unreadCount} unread</span>
                </div>
                <div id="notifications-list" style="padding:12px 16px;max-height:500px;overflow-y:auto;">
                    ${renderNotificationList(notifs, archivedNotifs)}
                </div>
            </div>
        </div>
    `;

    window._markAllNotificationsRead = markAllNotificationsRead;
    window._refreshNotifications = refreshNotifications;
    window._markNotificationRead = markNotificationRead;
    window._filterNotifications = filterNotifications;
    window._clearTermNotifications = clearTermNotifications;
    window._archiveTermNotifications = archiveTermNotifications;
    window._restoreArchivedNotification = restoreArchivedNotification;
    window._deleteArchivedNotification = deleteArchivedNotification;

    updateNotificationBadge();
}

// ──────────────────────────────────────────────────────────────────────
// RENDER NOTIFICATION LIST
// ──────────────────────────────────────────────────────────────────────

function renderNotificationList(notifications, archivedNotifications) {
    const termFilter = document.getElementById('notif-term-filter')?.value || 'all';
    const statusFilter = document.getElementById('notif-status-filter')?.value || 'all';

    let filteredNotifs = [...notifications];
    let filteredArchived = [...archivedNotifications];

    // Filter by term
    if (termFilter === 'archived') {
        filteredNotifs = [];
        filteredArchived = archivedNotifications || [];
    } else if (termFilter !== 'all') {
        filteredNotifs = filteredNotifs.filter(n => n.term_id == termFilter);
        filteredArchived = filteredArchived.filter(n => n.term_id == termFilter);
    }

    // Filter by status
    if (statusFilter === 'unread') {
        filteredNotifs = filteredNotifs.filter(n => !n.is_read);
        filteredArchived = [];
    } else if (statusFilter === 'read') {
        filteredNotifs = filteredNotifs.filter(n => n.is_read);
        filteredArchived = [];
    }

    // Show active notifications
    let html = '';

    if (filteredNotifs.length) {
        html += filteredNotifs.map(n => renderNotificationItem(n, false)).join('');
    }

    // Show archived notifications if viewing archived
    if (termFilter === 'archived' && filteredArchived.length) {
        html += `<div style="margin-bottom:12px;padding:8px;background:var(--bg-tertiary);border-radius:6px;font-size:0.75rem;color:var(--text-muted);">📦 Archived Notifications (${filteredArchived.length})</div>`;
        html += filteredArchived.map(n => renderNotificationItem(n, true)).join('');
    }

    if (!html) {
        html = '<div style="text-align:center;padding:40px;color:var(--text-muted);">📭 No notifications match the current filters.</div>';
    }

    return html;
}

// ──────────────────────────────────────────────────────────────────────
// RENDER SINGLE NOTIFICATION ITEM
// ──────────────────────────────────────────────────────────────────────

function renderNotificationItem(n, isArchived) {
    const isUnread = !n.is_read && !isArchived;
    const typeIcon = getNotificationIcon(n.type || n.category);
    const borderColor = getNotificationColor(n.type || n.category);
    const timeAgo = fmtAgo(n.created_at);
    const termName = n.term_name || (n.term_id ? state.terms.find(t => t.id == n.term_id)?.name : '');

    const archivedClass = isArchived ? 'opacity-60' : '';
    const archivedBadge = isArchived ? '<span class="badge badge-neutral" style="font-size:0.55rem;">📦 Archived</span>' : '';

    return `
        <div class="notif-item ${archivedClass}" 
             data-id="${n.id}" 
             data-read="${n.is_read ? 'read' : 'unread'}"
             style="border-left:4px solid ${borderColor};
                    padding:12px 16px;
                    margin-bottom:10px;
                    background:${isUnread ? 'var(--info-bg)' : 'var(--bg-secondary)'};
                    border-radius:0 var(--r-md) var(--r-md) 0;
                    box-shadow:var(--shadow-sm);
                    cursor:${isArchived ? 'default' : 'pointer'};
                    transition:all 0.2s;"
                 ${!isArchived ? `onclick="window._markNotificationRead(${n.id})"` : ''}>
            <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:6px;flex-wrap:wrap;gap:8px;">
                <span style="font-weight:700;font-size:0.9rem;">${typeIcon} ${esc(n.title || 'Notification')}</span>
                <span style="font-size:0.7rem;color:var(--text-muted);">${timeAgo}</span>
            </div>
            <div style="font-size:0.85rem;color:var(--text-secondary);white-space:pre-wrap;margin-bottom:6px;">${esc(n.message || '')}</div>
            <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
                ${isUnread ? '<span class="badge badge-info" style="font-size:0.6rem;">📌 New</span>' : ''}
                ${isArchived ? '<span class="badge badge-neutral" style="font-size:0.6rem;">📦 Archived</span>' : ''}
                ${termName ? `<span style="font-size:0.65rem;color:var(--text-muted);">📅 ${esc(termName)}</span>` : ''}
                ${n.action_url ? `<button class="btn btn-sm btn-outline" onclick="event.stopPropagation();window.navigateTo('${n.action_url}')" style="padding:2px 10px;font-size:0.7rem;">Go →</button>` : ''}
                ${isArchived ? `
                    <button class="btn btn-sm btn-outline" onclick="event.stopPropagation();window._restoreArchivedNotification(${n.id})" style="padding:2px 8px;font-size:0.6rem;">♻️ Restore</button>
                    <button class="btn btn-sm btn-danger" onclick="event.stopPropagation();window._deleteArchivedNotification(${n.id})" style="padding:2px 8px;font-size:0.6rem;">🗑️ Delete</button>
                ` : ''}
            </div>
        </div>
    `;
}

// ──────────────────────────────────────────────────────────────────────
// NOTIFICATION HELPERS
// ──────────────────────────────────────────────────────────────────────

function getNotificationIcon(type) {
    const icons = {
        payment: '💰',
        marks: '✏️',
        attendance: '✅',
        student: '🎓',
        system: '🔧',
        overdue: '⚠️',
        announcement: '📢',
        reminder: '⏰',
        urgent: '🚨',
        warning: '⚠️',
        info: 'ℹ️',
        academic: '📚',
        finance: '💰',
        security: '🔒',
        term: '📅',
        promotion: '🎓',
    };
    return icons[type] || '📌';
}

function getNotificationColor(type) {
    const colors = {
        payment: 'var(--success)',
        marks: 'var(--info)',
        attendance: 'var(--success)',
        student: 'var(--info)',
        system: 'var(--text-muted)',
        overdue: 'var(--danger)',
        announcement: 'var(--info)',
        reminder: 'var(--warning)',
        urgent: 'var(--danger)',
        warning: 'var(--warning)',
        info: 'var(--info)',
        academic: 'var(--info)',
        finance: 'var(--success)',
        security: 'var(--danger)',
        term: 'var(--info)',
        promotion: 'var(--success)',
    };
    return colors[type] || 'var(--border-medium)';
}

// ──────────────────────────────────────────────────────────────────────
// FILTER NOTIFICATIONS
// ──────────────────────────────────────────────────────────────────────

function filterNotifications() {
    renderNotifications(document.getElementById('dynamic-content'));
}

// ──────────────────────────────────────────────────────────────────────
// MARK NOTIFICATION READ
// ──────────────────────────────────────────────────────────────────────


// ──────────────────────────────────────────────────────────────────────
// REFRESH NOTIFICATIONS
// ──────────────────────────────────────────────────────────────────────

async function refreshNotifications() {
    await fetchUnreadNotifications();
    renderNotifications(document.getElementById('dynamic-content'));
    showToast('🔄 Notifications refreshed', 'info', 1500);
}

// ──────────────────────────────────────────────────────────────────────
// CLEAR TERM NOTIFICATIONS
// ──────────────────────────────────────────────────────────────────────

async function clearTermNotifications() {
    const currentTerm = getCurrentTerm();
    const notifs = (state.notifications || []).filter(n => n.term_id == currentTerm?.id);

    if (!notifs.length) {
        showToast('No notifications to clear for this term', 'info');
        return;
    }

    if (!await confirmDialog(`Delete ${notifs.length} notification(s) for ${currentTerm?.name}? This cannot be undone.`)) return;

    let deleted = 0;
    for (const n of notifs) {
        try {
            await remove('notifications', n.id);
            deleted++;
        } catch (e) {
            console.warn('[Notifications] Failed to delete:', e);
        }
    }

    state.notifications = state.notifications.filter(n => n.term_id != currentTerm?.id);
    updateNotificationBadge();

    await logActivity(state.currentUser?.id, state.currentUser?.role, `Cleared ${deleted} notifications for ${currentTerm?.name}`);
    showToast(`✅ Cleared ${deleted} notifications for ${currentTerm?.name}`, 'success');
    renderNotifications(document.getElementById('dynamic-content'));
}

// ──────────────────────────────────────────────────────────────────────
// ARCHIVE TERM NOTIFICATIONS
// ──────────────────────────────────────────────────────────────────────

async function archiveTermNotifications() {
    const currentTerm = getCurrentTerm();
    const notifs = (state.notifications || []).filter(n => n.term_id == currentTerm?.id && !n.is_archived);

    if (!notifs.length) {
        showToast('No notifications to archive for this term', 'info');
        return;
    }

    if (!await confirmDialog(`Archive ${notifs.length} notification(s) for ${currentTerm?.name}? They will be moved to the archive.`)) return;

    let archived = 0;
    for (const n of notifs) {
        try {
            // Move to archive table
            await insert('notifications_archive', {
                ...n,
                archived_at: new Date().toISOString(),
                archived_by: state.currentUser?.id,
                original_id: n.id,
            });

            // Delete from active table
            await remove('notifications', n.id);
            archived++;
        } catch (e) {
            console.warn('[Notifications] Failed to archive:', e);
        }
    }

    state.notifications = state.notifications.filter(n => n.term_id != currentTerm?.id);

    // Reload archived notifications
    try {
        const archivedNotifs = await getAll('notifications_archive');
        state.archivedNotifications = archivedNotifs || [];
    } catch (e) {
        state.archivedNotifications = [];
    }

    updateNotificationBadge();

    await logActivity(state.currentUser?.id, state.currentUser?.role, `Archived ${archived} notifications for ${currentTerm?.name}`);
    showToast(`📦 Archived ${archived} notifications for ${currentTerm?.name}`, 'success');
    renderNotifications(document.getElementById('dynamic-content'));
}

// ──────────────────────────────────────────────────────────────────────
// RESTORE ARCHIVED NOTIFICATION
// ──────────────────────────────────────────────────────────────────────

async function restoreArchivedNotification(id) {
    const archived = (state.archivedNotifications || []).find(n => n.id == id);
    if (!archived) {
        showToast('Archived notification not found', 'error');
        return;
    }

    if (!await confirmDialog('Restore this archived notification?')) return;

    try {
        // Remove from archive
        await remove('notifications_archive', id);

        // Add back to active notifications
        const restored = await insert('notifications', {
            title: archived.title,
            message: archived.message,
            type: archived.type,
            category: archived.category,
            recipient_id: archived.recipient_id,
            sender_id: archived.sender_id,
            entity_type: archived.entity_type,
            entity_id: archived.entity_id,
            action_url: archived.action_url,
            is_read: false,
            term_id: archived.term_id,
            created_at: new Date().toISOString(),
        });

        if (restored) {
            state.archivedNotifications = state.archivedNotifications.filter(n => n.id != id);
            state.notifications.unshift(restored);
            showToast('✅ Notification restored', 'success');
            renderNotifications(document.getElementById('dynamic-content'));
        }
    } catch (e) {
        showToast('Failed to restore: ' + e.message, 'error');
    }
}

// ──────────────────────────────────────────────────────────────────────
// DELETE ARCHIVED NOTIFICATION
// ──────────────────────────────────────────────────────────────────────

async function deleteArchivedNotification(id) {
    if (!await confirmDialog('Permanently delete this archived notification?')) return;

    try {
        await remove('notifications_archive', id);
        state.archivedNotifications = state.archivedNotifications.filter(n => n.id != id);
        showToast('✅ Archived notification deleted', 'success');
        renderNotifications(document.getElementById('dynamic-content'));
    } catch (e) {
        showToast('Failed to delete: ' + e.message, 'error');
    }
}

// ──────────────────────────────────────────────────────────────────────
// AUTO-CLEAR ON TERM END
// ──────────────────────────────────────────────────────────────────────

export async function autoClearTermNotifications() {
    const currentTerm = getCurrentTerm();
    if (!currentTerm) return;

    const termStatus = getTermStatus(currentTerm);
    if (termStatus !== 'completed') return;

    // Check if we've already processed this term
    const lastCleared = localStorage.getItem('last_notification_term_cleared');
    if (lastCleared == currentTerm.id) return;

    const notifs = (state.notifications || []).filter(n => n.term_id == currentTerm.id);
    if (!notifs.length) {
        localStorage.setItem('last_notification_term_cleared', String(currentTerm.id));
        return;
    }

    // Auto-archive old notifications
    let archived = 0;
    for (const n of notifs) {
        try {
            await insert('notifications_archive', {
                ...n,
                archived_at: new Date().toISOString(),
                archived_by: null,
                original_id: n.id,
            });
            await remove('notifications', n.id);
            archived++;
        } catch (e) {
            console.warn('[Notifications] Auto-archive failed:', e);
        }
    }

    if (archived > 0) {
        state.notifications = state.notifications.filter(n => n.term_id != currentTerm.id);
        showToast(`📦 Auto-archived ${archived} notifications from ${currentTerm.name}`, 'info', 4000);
        updateNotificationBadge();
    }

    localStorage.setItem('last_notification_term_cleared', String(currentTerm.id));
}

// ──────────────────────────────────────────────────────────────────────
// EXPOSE GLOBALLY
// ──────────────────────────────────────────────────────────────────────

window._markAllNotificationsRead = markAllNotificationsRead;
window._refreshNotifications = refreshNotifications;
window._markNotificationRead = markNotificationRead;
window._filterNotifications = filterNotifications;
window._clearTermNotifications = clearTermNotifications;
window._archiveTermNotifications = archiveTermNotifications;
window._restoreArchivedNotification = restoreArchivedNotification;
window._deleteArchivedNotification = deleteArchivedNotification;