/**
 * ECOLE LA FONTAINE — Notification Center
 * Full notification management with tabs, filters, actions, and term cleanup
 * Last updated: 2026-07-03
 * 
 * CHANGES:
 * - Added automatic announcement cleanup when term ends
 * - Notifications are filtered by academic year
 * - Announcements from previous terms are archived (not deleted)
 * - New term notifications are auto-created
 * - Cleanup runs on page load and term change
 * - Archived announcements can be viewed
 */


const state = window.state || {}; // global state alias
import { state, getCurrentUser, getCurrentAcademicYear, getCurrentTerm, getTermsByYear } from '../../core/state.js';
import { esc, fmtDate, fmtDateTime, fmtAgo } from '../../core/utils.js';
import { update, getAll, insert, remove, logActivity, get } from '../../core/api.js';
import { updateNotificationBadge, fetchUnreadNotifications, markNotificationRead, markAllNotificationsRead } from '../../core/notifications.js';

// ──────────────────────────────────────────────────────────────────────
// STATE
// ──────────────────────────────────────────────────────────────────────

let showArchived = false;
let currentFilterYear = null;

// ──────────────────────────────────────────────────────────────────────
// MAIN RENDER FUNCTION
// ──────────────────────────────────────────────────────────────────────

export async function renderNotificationCenter(container) {
    if (!container) return;

    const user = getCurrentUser();
    if (!user) {
        container.innerHTML = '<div class="alert alert-warning">Please login to view notifications.</div>';
        return;
    }

    await ensureStateLoaded();

    // Run term cleanup on load
    await runTermCleanup();

    // Load notifications
    await fetchUnreadNotifications();

    const notifs = state.notifications || [];
    const announcements = state.announcements || [];

    // Filter by academic year if set
    const yearId = currentFilterYear || state.currentAcadYear?.id;
    let allItems = [...notifs, ...announcements];

    if (yearId) {
        allItems = allItems.filter(n =>
            !n.academic_year_id || n.academic_year_id == yearId
        );
    }

    // Sort by date
    allItems.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    const unreadCount = allItems.filter(n => !n.is_read).length;

    container.innerHTML = `
        <div class="dash-card">
            <div class="dash-card-header" style="flex-wrap:wrap;gap:8px;">
                <span class="dash-card-title">🔔 Notification Center
                    ${unreadCount > 0 ? `<span class="badge badge-danger" style="font-size:0.7rem;">${unreadCount} unread</span>` : ''}
                </span>
                <div class="btn-group" style="flex-wrap:wrap;gap:6px;">
                    <select id="notif-year-filter" onchange="window._filterNotifsByYear(this.value)" style="padding:6px 12px;border-radius:6px;border:1px solid var(--border-medium);font-size:0.8rem;">
                        <option value="">All Years</option>
                        ${(state.academicYears || []).sort((a, b) => b.id - a.id).map(y => `
                            <option value="${y.id}" ${y.id === yearId ? 'selected' : ''}>
                                ${esc(y.name)} ${y.id === state.currentAcadYear?.id ? '🟢' : ''}
                            </option>
                        `).join('')}
                    </select>
                    <button class="btn btn-sm btn-success" onclick="window._markAllRead()" ${unreadCount === 0 ? 'disabled' : ''}>✅ Mark All Read</button>
                    <button class="btn btn-sm btn-primary" onclick="window._createSystemNotification()">📢 New Announcement</button>
                    <button class="btn btn-sm btn-outline" onclick="window._toggleArchived()">
                        ${showArchived ? '📦 Hide Archived' : '📦 Show Archived'}
                    </button>
                    <button class="btn btn-sm btn-outline" onclick="window._exportNotifications()">📥 Export</button>
                    <button class="btn btn-sm btn-outline" onclick="window._refreshNotificationsCenter()">🔄 Refresh</button>
                </div>
            </div>
            <div class="dash-card-body" style="padding:0;">
                <!-- Tabs -->
                <div class="tabs" style="display:flex;gap:2px;border-bottom:2px solid var(--border-light);padding:0 16px;flex-wrap:wrap;">
                    <button class="tab-btn active" onclick="window._filterNotifTab('all', event)" style="padding:10px 16px;font-size:0.8rem;">All (${allItems.length})</button>
                    <button class="tab-btn" onclick="window._filterNotifTab('unread', event)" style="padding:10px 16px;font-size:0.8rem;">📌 Unread (${unreadCount})</button>
                    <button class="tab-btn" onclick="window._filterNotifTab('announcement', event)" style="padding:10px 16px;font-size:0.8rem;">📢 Announcements</button>
                    <button class="tab-btn" onclick="window._filterNotifTab('system', event)" style="padding:10px 16px;font-size:0.8rem;">🔧 System</button>
                    <button class="tab-btn" onclick="window._filterNotifTab('payment', event)" style="padding:10px 16px;font-size:0.8rem;">💰 Payments</button>
                    <button class="tab-btn" onclick="window._filterNotifTab('marks', event)" style="padding:10px 16px;font-size:0.8rem;">✏️ Marks</button>
                </div>

                <!-- Filters -->
                <div style="padding:12px 16px;border-bottom:1px solid var(--border-light);display:flex;flex-wrap:wrap;gap:8px;align-items:center;">
                    <input type="text" id="notif-search" class="form-control" style="flex:1;min-width:150px;" placeholder="🔍 Search notifications..." oninput="window._filterNotificationsList()">
                    <select id="notif-type-filter" class="form-control" style="width:130px;" onchange="window._filterNotificationsList()">
                        <option value="all">All Types</option>
                        <option value="payment">💰 Payment</option>
                        <option value="marks">✏️ Marks</option>
                        <option value="attendance">✅ Attendance</option>
                        <option value="student">🎓 Student</option>
                        <option value="system">🔧 System</option>
                        <option value="announcement">📢 Announcement</option>
                        <option value="overdue">⚠️ Overdue</option>
                        <option value="reminder">⏰ Reminder</option>
                    </select>
                    <select id="notif-status-filter" class="form-control" style="width:120px;" onchange="window._filterNotificationsList()">
                        <option value="all">All Status</option>
                        <option value="unread">Unread</option>
                        <option value="read">Read</option>
                    </select>
                    <span class="result-count" id="notif-count"></span>
                </div>

                <!-- List -->
                <div id="notifications-list" style="padding:12px 16px;max-height:600px;overflow-y:auto;">
                    ${renderNotificationCenterList(allItems)}
                </div>

                <!-- Pagination -->
                <div class="pagination" id="notif-pagination" style="padding:12px 16px;border-top:1px solid var(--border-light);"></div>
            </div>
        </div>
    `;

    window._filterNotifTab = filterNotifTab;
    window._filterNotificationsList = filterNotificationsList;
    window._markAllRead = markAllRead;
    window._createSystemNotification = createSystemNotification;
    window._exportNotifications = exportNotifications;
    window._refreshNotificationsCenter = refreshNotificationsCenter;
    window._markNotificationRead = markNotificationRead;
    window._filterNotifsByYear = filterNotifsByYear;
    window._toggleArchived = toggleArchived;

    window._allNotifItems = allItems;
    window._currentNotifPage = 1;
    window._notifPageSize = 20;

    updateNotificationBadge();
    renderNotifPagination(allItems.length);
}

// ──────────────────────────────────────────────────────────────────────
// FILTER NOTIFICATIONS BY YEAR
// ──────────────────────────────────────────────────────────────────────

function filterNotifsByYear(yearId) {
    currentFilterYear = yearId ? parseInt(yearId) : null;
    renderNotificationCenter(document.getElementById('dynamic-content'));
}

// ──────────────────────────────────────────────────────────────────────
// TOGGLE ARCHIVED NOTIFICATIONS
// ──────────────────────────────────────────────────────────────────────

function toggleArchived() {
    showArchived = !showArchived;
    renderNotificationCenter(document.getElementById('dynamic-content'));
}

// ──────────────────────────────────────────────────────────────────────
// RENDER NOTIFICATION CENTER LIST
// ──────────────────────────────────────────────────────────────────────

function renderNotificationCenterList(items) {
    let filtered = items;

    // Filter archived if not showing
    if (!showArchived) {
        filtered = items.filter(n => n.status !== 'archived' && n.is_archived !== true);
    }

    if (!filtered || !filtered.length) {
        return `<div style="text-align:center;padding:60px;color:var(--text-muted);">
            📭 No notifications found
            ${!showArchived ? '<br><small><a href="#" onclick="window._toggleArchived(); return false;">Click here to show archived notifications</a></small>' : ''}
        </div>`;
    }

    return filtered.map(n => {
        const isUnread = !n.is_read;
        const isArchived = n.status === 'archived' || n.is_archived === true;
        const typeIcon = getNotificationIcon(n.type || n.category);
        const borderColor = getNotificationColor(n.type || n.category);
        const isAnnouncement = n.recipients !== undefined;

        return `
            <div class="notif-item" 
                 data-id="${n.id}" 
                 data-type="${n.type || n.category || 'system'}"
                 data-read="${n.is_read ? 'read' : 'unread'}"
                 style="border-left:4px solid ${borderColor};
                        padding:12px 16px;
                        margin-bottom:10px;
                        background:${isUnread ? 'var(--info-bg)' : 'var(--bg-secondary)'};
                        ${isArchived ? 'opacity:0.7;' : ''}
                        border-radius:0 var(--r-md) var(--r-md) 0;
                        box-shadow:var(--shadow-sm);
                        cursor:pointer;
                        transition:all 0.2s;"
                 onclick="window._markNotificationRead(${n.id})">
                <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:6px;flex-wrap:wrap;gap:8px;">
                    <span style="font-weight:700;font-size:0.9rem;">${typeIcon} ${esc(n.title || 'Notification')}</span>
                    <span style="font-size:0.7rem;color:var(--text-muted);">${fmtAgo(n.created_at)}</span>
                </div>
                <div style="font-size:0.85rem;color:var(--text-secondary);white-space:pre-wrap;margin-bottom:6px;">${esc(n.message || '')}</div>
                <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
                    ${isUnread ? '<span class="badge badge-info" style="font-size:0.6rem;">📌 New</span>' : ''}
                    ${isArchived ? '<span class="badge badge-neutral" style="font-size:0.6rem;">📦 Archived</span>' : ''}
                    ${isAnnouncement ? `<span class="badge badge-neutral" style="font-size:0.6rem;">📢 To: ${esc(n.recipients || 'all')}</span>` : ''}
                    ${n.academic_year_id ? `<span class="badge badge-neutral" style="font-size:0.6rem;">📅 ${esc(state.academicYears.find(y => y.id === n.academic_year_id)?.name || '')}</span>` : ''}
                    ${n.action_url ? `<button class="btn btn-sm btn-outline" onclick="event.stopPropagation();window.navigateTo('${n.action_url}')" style="padding:2px 10px;font-size:0.7rem;">Go →</button>` : ''}
                </div>
            </div>
        `;
    }).join('');
}

// ──────────────────────────────────────────────────────────────────────
// RUN TERM CLEANUP
// ──────────────────────────────────────────────────────────────────────

async function runTermCleanup() {
    const currentTerm = getCurrentTerm();
    const currentYear = getCurrentAcademicYear();

    if (!currentTerm || !currentYear) return;

    const today = new Date().toISOString().split('T')[0];
    const terms = getTermsByYear(currentYear.id);

    // Find completed terms
    const completedTerms = terms.filter(t =>
        t.end_date && t.end_date < today && t.id !== currentTerm.id
    );

    if (completedTerms.length === 0) return;

    // Get announcements for completed terms
    for (const term of completedTerms) {
        const termAnnouncements = await get('announcements', {
            term_id: term.id,
            status: 'sent'
        });

        for (const ann of termAnnouncements) {
            // Archive instead of delete
            await update('announcements', ann.id, {
                status: 'archived',
                is_archived: true,
                archived_at: new Date().toISOString(),
                archived_term_id: term.id,
                archived_year_id: currentYear.id,
                notes: `Auto-archived after term ${term.name} ended`
            });
        }

        // Create notification about term end
        await insert('notifications', {
            title: `📅 ${term.name} has ended`,
            message: `All announcements from ${term.name} have been archived. Please create new announcements for the current term.`,
            type: 'system',
            category: 'system',
            is_read: false,
            recipients: 'all',
            academic_year_id: currentYear.id,
            term_id: term.id,
            created_at: new Date().toISOString(),
            created_by: state.currentUser?.id || null
        });

        // Log the cleanup
        await logActivity(
            state.currentUser?.id || 0,
            state.currentUser?.role || 'system',
            `Term cleanup: Archived ${termAnnouncements.length} announcements from ${term.name}`,
            'system',
            null,
            { term_id: term.id, count: termAnnouncements.length }
        );

        console.log(`[Term Cleanup] Archived ${termAnnouncements.length} announcements from ${term.name}`);
    }

    // Update state
    await refreshNotificationsCenter();
}

// ──────────────────────────────────────────────────────────────────────
// FILTER NOTIFICATION TAB
// ──────────────────────────────────────────────────────────────────────

function filterNotifTab(tab, event) {
    // Update active tab
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    if (event?.target) event.target.classList.add('active');

    let items = window._allNotifItems || [];

    // Apply archive filter
    if (!showArchived) {
        items = items.filter(n => n.status !== 'archived' && n.is_archived !== true);
    }

    let filtered = items;
    if (tab === 'unread') {
        filtered = items.filter(n => !n.is_read);
    } else if (tab === 'announcement') {
        filtered = items.filter(n => n.recipients !== undefined);
    } else if (tab === 'system') {
        filtered = items.filter(n => n.recipients === undefined && !['payment', 'marks', 'attendance', 'student', 'overdue', 'reminder'].includes(n.type || n.category));
    } else if (tab === 'payment') {
        filtered = items.filter(n => n.type === 'payment' || n.category === 'payment');
    } else if (tab === 'marks') {
        filtered = items.filter(n => n.type === 'marks' || n.category === 'marks');
    }

    window._filteredNotifItems = filtered;
    window._currentNotifPage = 1;

    const container = document.getElementById('notifications-list');
    if (container) {
        container.innerHTML = renderNotificationCenterList(filtered);
    }

    renderNotifPagination(filtered.length);
    updateNotifCount(filtered.length);
}

// ──────────────────────────────────────────────────────────────────────
// FILTER NOTIFICATIONS LIST
// ──────────────────────────────────────────────────────────────────────

function filterNotificationsList() {
    const search = document.getElementById('notif-search')?.value?.toLowerCase() || '';
    const typeFilter = document.getElementById('notif-type-filter')?.value || 'all';
    const statusFilter = document.getElementById('notif-status-filter')?.value || 'all';

    let items = window._allNotifItems || [];

    // Apply archive filter
    if (!showArchived) {
        items = items.filter(n => n.status !== 'archived' && n.is_archived !== true);
    }

    if (search) {
        items = items.filter(n =>
            (n.title || '').toLowerCase().includes(search) ||
            (n.message || '').toLowerCase().includes(search)
        );
    }

    if (typeFilter !== 'all') {
        items = items.filter(n => (n.type || n.category) === typeFilter);
    }

    if (statusFilter === 'unread') {
        items = items.filter(n => !n.is_read);
    } else if (statusFilter === 'read') {
        items = items.filter(n => n.is_read);
    }

    window._filteredNotifItems = items;
    window._currentNotifPage = 1;

    const container = document.getElementById('notifications-list');
    if (container) {
        container.innerHTML = renderNotificationCenterList(items);
    }

    renderNotifPagination(items.length);
    updateNotifCount(items.length);
}

// ──────────────────────────────────────────────────────────────────────
// RENDER NOTIFICATION PAGINATION
// ──────────────────────────────────────────────────────────────────────

function renderNotifPagination(total) {
    const totalPages = Math.ceil(total / window._notifPageSize);
    const pagination = document.getElementById('notif-pagination');
    if (!pagination) return;

    if (totalPages <= 1) { pagination.innerHTML = ''; return; }

    let html = '';
    for (let i = 1; i <= Math.min(totalPages, 8); i++) {
        html += `<div class="page-btn ${i === window._currentNotifPage ? 'active' : ''}" onclick="window._goToNotifPage(${i})">${i}</div>`;
    }
    if (totalPages > 8) html += `<div class="page-btn" onclick="window._goToNotifPage(${totalPages})">${totalPages}</div>`;
    pagination.innerHTML = html;

    window._goToNotifPage = function (page) {
        window._currentNotifPage = page;
        const start = (page - 1) * window._notifPageSize;
        const items = window._filteredNotifItems || window._allNotifItems || [];
        const container = document.getElementById('notifications-list');
        if (container) {
            container.innerHTML = renderNotificationCenterList(items.slice(start, start + window._notifPageSize));
        }
        renderNotifPagination(items.length);
    };
}

// ──────────────────────────────────────────────────────────────────────
// UPDATE NOTIFICATION COUNT
// ──────────────────────────────────────────────────────────────────────

function updateNotifCount(count) {
    const el = document.getElementById('notif-count');
    if (el) el.textContent = `${count} notification${count !== 1 ? 's' : ''}`;
}

// ──────────────────────────────────────────────────────────────────────
// MARK ALL READ
// ──────────────────────────────────────────────────────────────────────

async function markAllRead() {
    await markAllNotificationsRead();
    refreshNotificationsCenter();
}

// ──────────────────────────────────────────────────────────────────────
// CREATE SYSTEM NOTIFICATION
// ──────────────────────────────────────────────────────────────────────

function createSystemNotification() {
    const currentTerm = getCurrentTerm();
    const currentYear = getCurrentAcademicYear();

    showModal(`
        <div class="modal-overlay" id="create-notif-modal">
            <div class="modal" style="max-width:500px;">
                <div class="modal-header">
                    <h3>📢 Create Announcement</h3>
                    <button class="modal-close" onclick="window.closeModal('create-notif-modal')">✕</button>
                </div>
                <div class="modal-body">
                    <div class="form-grid">
                        <div class="form-group full">
                            <label>Title *</label>
                            <input type="text" id="notif-title" class="form-control" placeholder="Announcement title">
                        </div>
                        <div class="form-group full">
                            <label>Message *</label>
                            <textarea id="notif-message" class="form-control" rows="4" placeholder="Announcement message..."></textarea>
                        </div>
                        <div class="form-group">
                            <label>Type</label>
                            <select id="notif-type" class="form-control">
                                <option value="info">ℹ️ Info</option>
                                <option value="urgent">🚨 Urgent</option>
                                <option value="warning">⚠️ Warning</option>
                                <option value="event">📅 Event</option>
                                <option value="reminder">⏰ Reminder</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label>Recipients</label>
                            <select id="notif-recipients" class="form-control">
                                <option value="all">All Users</option>
                                <option value="teachers">Teachers Only</option>
                                <option value="accountants">Accountants Only</option>
                                <option value="admin">Admin Only</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label>Academic Year</label>
                            <select id="notif-year" class="form-control">
                                ${(state.academicYears || []).sort((a, b) => b.id - a.id).map(y => `
                                    <option value="${y.id}" ${y.id === currentYear?.id ? 'selected' : ''}>
                                        ${esc(y.name)} ${y.id === currentYear?.id ? '🟢' : ''}
                                    </option>
                                `).join('')}
                            </select>
                        </div>
                        <div class="form-group">
                            <label>Term</label>
                            <select id="notif-term" class="form-control">
                                ${(currentYear ? getTermsByYear(currentYear.id) : []).map(t => `
                                    <option value="${t.id}" ${t.id === currentTerm?.id ? 'selected' : ''}>
                                        ${esc(t.name)}
                                    </option>
                                `).join('')}
                                <option value="">All Terms</option>
                            </select>
                        </div>
                        <div class="form-group full">
                            <label>Action URL (optional)</label>
                            <input type="text" id="notif-action" class="form-control" placeholder="e.g., marks-entry">
                            <small class="field-hint">Module to navigate to when clicked (e.g., marks-entry, record-payment)</small>
                        </div>
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-outline" onclick="window.closeModal('create-notif-modal')">Cancel</button>
                    <button class="btn btn-primary" onclick="window._sendNotification()">📢 Send</button>
                </div>
            </div>
        </div>
    `);

    window._sendNotification = sendNotification;
}

// ──────────────────────────────────────────────────────────────────────
// SEND NOTIFICATION
// ──────────────────────────────────────────────────────────────────────

async function sendNotification() {
    const title = document.getElementById('notif-title')?.value.trim();
    const message = document.getElementById('notif-message')?.value.trim();
    const type = document.getElementById('notif-type')?.value || 'info';
    const recipients = document.getElementById('notif-recipients')?.value || 'all';
    const actionUrl = document.getElementById('notif-action')?.value.trim() || null;
    const yearId = document.getElementById('notif-year')?.value;
    const termId = document.getElementById('notif-term')?.value;

    if (!title || !message) {
        showToast('Title and message are required', 'warning');
        return;
    }

    const result = await insert('announcements', {
        title: title,
        message: message,
        type: type,
        recipients: recipients,
        action_url: actionUrl,
        is_read: false,
        sender_id: state.currentUser?.id,
        academic_year_id: yearId || state.currentAcadYear?.id,
        term_id: termId || state.currentTerm?.id,
        created_at: new Date().toISOString(),
        status: 'sent',
    });

    if (result) {
        closeModal('create-notif-modal');
        await refreshNotificationsCenter();
        await logActivity(state.currentUser?.id, state.currentUser?.role, `Sent announcement: ${title}`);
        showToast('✅ Announcement sent successfully', 'success');
    } else {
        showToast('Failed to send announcement', 'error');
    }
}

// ──────────────────────────────────────────────────────────────────────
// EXPORT NOTIFICATIONS
// ──────────────────────────────────────────────────────────────────────

function exportNotifications() {
    const items = window._filteredNotifItems || window._allNotifItems || [];

    if (!items.length) {
        showToast('No notifications to export', 'warning');
        return;
    }

    const data = items.map(n => {
        const year = state.academicYears.find(y => y.id === n.academic_year_id);
        const term = state.terms.find(t => t.id === n.term_id);
        return {
            'Title': n.title || '',
            'Message': n.message || '',
            'Type': n.type || n.category || 'system',
            'Status': n.is_read ? 'Read' : 'Unread',
            'Date': fmtDateTime(n.created_at),
            'Academic Year': year?.name || '',
            'Term': term?.name || '',
            'Recipients': n.recipients || 'all',
            'Entity': n.entity_type || '',
            'Action': n.action_url || '',
        };
    });

    exportToExcel(data, `Notifications_${new Date().toISOString().split('T')[0]}`);
    showToast('✅ Notifications exported', 'success');
}

// ──────────────────────────────────────────────────────────────────────
// REFRESH NOTIFICATIONS CENTER
// ──────────────────────────────────────────────────────────────────────

async function refreshNotificationsCenter() {
    await fetchUnreadNotifications();
    renderNotificationCenter(document.getElementById('dynamic-content'));
    showToast('🔄 Refreshed', 'info', 1500);
}

// ──────────────────────────────────────────────────────────────────────
// HELPER FUNCTIONS
// ──────────────────────────────────────────────────────────────────────

function getNotificationIcon(type) {
    const icons = {
        'payment': '💰',
        'marks': '✏️',
        'attendance': '✅',
        'student': '🎓',
        'system': '🔧',
        'announcement': '📢',
        'overdue': '⚠️',
        'reminder': '⏰',
        'urgent': '🚨',
        'warning': '⚠️',
        'event': '📅',
        'info': 'ℹ️',
    };
    return icons[type] || '📬';
}

function getNotificationColor(type) {
    const colors = {
        'payment': '#10b981',
        'marks': '#3b82f6',
        'attendance': '#8b5cf6',
        'student': '#06b6d4',
        'system': '#6b7280',
        'announcement': '#f59e0b',
        'overdue': '#ef4444',
        'reminder': '#f97316',
        'urgent': '#ef4444',
        'warning': '#f59e0b',
        'event': '#8b5cf6',
    };
    return colors[type] || '#6b7280';
}

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
window._filterNotifTab = filterNotifTab;
window._filterNotificationsList = filterNotificationsList;
window._markAllRead = markAllRead;
window._createSystemNotification = createSystemNotification;
window._exportNotifications = exportNotifications;
window._refreshNotificationsCenter = refreshNotificationsCenter;
window._markNotificationRead = markNotificationRead;
window._filterNotifsByYear = filterNotifsByYear;
window._toggleArchived = toggleArchived;
window._sendNotification = sendNotification;
window._goToNotifPage = function () { };