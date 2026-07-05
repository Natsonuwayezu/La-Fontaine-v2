/**
 * ECOLE LA FONTAINE — Notification System
 * Real-time notifications, bell badge, action alerts
 * Last updated: 2026-06-28
 */


const state = window.state || {}; // global state alias
import { state, getCurrentUser } from './state.js';
import { insert, get, update } from './api.js';
import { NOTIFICATION_TYPES, NOTIFICATION_PRIORITY } from '../config/constants.js';

// ──────────────────────────────────────────────────────────────────────
// NOTIFY ACTION
// ──────────────────────────────────────────────────────────────────────

/**
 * Send a notification for an action
 * @param {string} action - Action type (e.g., 'payment_recorded')
 * @param {object} details - Notification details
 * @param {Array} targetRoles - Roles to notify (default: ['admin'])
 */
export async function notifyAction(action, details = {}, targetRoles = ['admin']) {
    const user = state.currentUser;
    if (!user) return;

    const categoryMap = {
        marks_import: 'academic',
        marks_edited: 'academic',
        payment_recorded: 'payment',
        payment_reversed: 'payment',
        setting_updated: 'system',
        backup_created: 'system',
        student_enrolled: 'student',
        fee_waived: 'finance',
        fee_structure_changed: 'finance',
        attendance_recorded: 'attendance',
        assessment_locked: 'academic',
    };

    const iconMap = {
        marks_import: '📝',
        marks_edited: '✏️',
        payment_recorded: '💰',
        payment_reversed: '↩️',
        setting_updated: '⚙️',
        backup_created: '💾',
        student_enrolled: '🎓',
        fee_waived: '🎁',
        fee_structure_changed: '🏷️',
        attendance_recorded: '✅',
        assessment_locked: '🔒',
    };

    const category = categoryMap[action] || 'system';
    const icon = iconMap[action] || '🔔';
    const title = `${icon} ${action.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}`;

    try {
        // Insert notification for each target role
        for (const role of targetRoles) {
            // Skip if the current user is the same role (don't notify self)
            if (role === user.role && !details.notify_self) continue;

            await insert('notifications', {
                recipient_role: role,
                sender_id: user.id,
                type: category,
                title: title,
                message: details.message || JSON.stringify(details),
                action_url: details.action_url || null,
                entity_type: details.entity_type || null,
                entity_id: details.entity_id || null,
                is_read: false,
                created_at: new Date().toISOString(),
            });
        }

        // Update bell badge
        updateNotificationBadge();

    } catch (err) {
        console.warn('[notifyAction] Failed:', err);
    }
}

// ──────────────────────────────────────────────────────────────────────
// NOTIFICATION BELL BADGE
// ──────────────────────────────────────────────────────────────────────

/**
 * Update the notification badge count on the bell icon
 * @param {number} count - Unread count
 */
export function updateNotificationBadgeCount(count) {
    const dot = document.getElementById('notif-dot');
    if (!dot) return;

    if (count > 0) {
        dot.textContent = count > 9 ? '9+' : String(count);
        dot.style.cssText = `
            display: inline-flex;
            align-items: center;
            justify-content: center;
            background: #ef4444;
            color: #fff;
            border-radius: 99px;
            font-size: 0.6rem;
            font-weight: 700;
            min-width: 16px;
            height: 16px;
            padding: 0 3px;
            position: absolute;
            top: -4px;
            right: -4px;
        `;
        const bell = document.querySelector('.notif-bell');
        if (bell && !bell.style.position) bell.style.position = 'relative';
    } else {
        dot.style.display = 'none';
    }
}

/**
 * Update the notification badge from state
 */
export function updateNotificationBadge() {
    const unreadNotifs = (state.notifications || []).filter(n => !n.is_read).length;
    const unreadAnnouncements = (state.announcements || []).filter(a => !a.is_read).length;
    updateNotificationBadgeCount(unreadNotifs + unreadAnnouncements);
}

// ──────────────────────────────────────────────────────────────────────
// FETCH NOTIFICATIONS
// ──────────────────────────────────────────────────────────────────────

/**
 * Fetch unread notifications for the current user
 * @returns {Promise<Array>} Unread notifications
 */
export async function fetchUnreadNotifications() {
    const user = state.currentUser;
    if (!user) return [];

    try {
        const result = await get('notifications', {
            recipient_role: user.role,
            is_read: false,
            order: 'created_at.desc',
            limit: 50,
        });

        // Also check announcements
        const announcements = await get('announcements', {
            recipients: ['all', user.role + 's', user.role],
            is_read: false,
            order: 'created_at.desc',
            limit: 20,
        });

        const allNotifs = [...result, ...announcements];
        allNotifs.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

        state.notifications = allNotifs;
        updateNotificationBadge();

        return allNotifs;
    } catch (e) {
        console.warn('[Notifications] Fetch failed:', e);
        return [];
    }
}

// ──────────────────────────────────────────────────────────────────────
// MARK AS READ
// ──────────────────────────────────────────────────────────────────────

/**
 * Mark a notification as read
 * @param {number} id - Notification ID
 */
export async function markNotificationRead(id) {
    try {
        await update('notifications', id, { is_read: true, read_at: new Date().toISOString() });
        const notif = state.notifications.find(n => n.id === id);
        if (notif) notif.is_read = true;
        updateNotificationBadge();
    } catch (e) {
        console.warn('[Notifications] Mark read failed:', e);
    }
}

/**
 * Mark all notifications as read
 */
export async function markAllNotificationsRead() {
    const user = state.currentUser;
    if (!user) return;

    try {
        await updateWhere('notifications', `recipient_role=eq.${user.role} AND is_read=eq.false`, {
            is_read: true,
            read_at: new Date().toISOString(),
        });
        (state.notifications || []).forEach(n => n.is_read = true);
        updateNotificationBadge();
        showToast('✅ All notifications marked as read', 'success');
    } catch (e) {
        console.warn('[Notifications] Mark all read failed:', e);
        showToast('Failed to mark all as read', 'error');
    }
}

// ──────────────────────────────────────────────────────────────────────
// NOTIFICATION POLLING
// ──────────────────────────────────────────────────────────────────────

let _pollingInterval = null;

/**
 * Start polling for notifications
 * @param {number} interval - Polling interval in ms (default: 30000)
 */
export function startNotificationPolling(interval = 30000) {
    if (_pollingInterval) clearInterval(_pollingInterval);

    _pollingInterval = setInterval(async () => {
        if (state.currentUser) {
            await fetchUnreadNotifications();
        }
    }, interval);

    // Also poll on visibility change
    document.addEventListener('visibilitychange', async () => {
        if (document.visibilityState === 'visible' && state.currentUser) {
            await fetchUnreadNotifications();
        }
    });

    // Initial fetch
    fetchUnreadNotifications();
}

/**
 * Stop polling for notifications
 */
export function stopNotificationPolling() {
    if (_pollingInterval) {
        clearInterval(_pollingInterval);
        _pollingInterval = null;
    }
}