/* ═══════════════════════════════════════════════════════════════════
   js/core/notifications-engine.js
   ═══════════════════════════════════════════════════════════════════
   Purpose : Create in-app notifications automatically when key events
             occur: payments received, marks saved, fees overdue,
             assessments locked, announcements published.
             All writes go through insert('notifications', ...).
             No push notifications — in-app only.
   References: backend.txt Part 2.21 (notifications table)
   Load order: AFTER api.js, state.js, logger.js.
   ═══════════════════════════════════════════════════════════════════ */

'use strict';

/* ─────────────────────────────────────────────────────────────────
   CORE NOTIFICATION WRITER
   ───────────────────────────────────────────────────────────────── */

/**
 * Create one in-app notification row.
 * Silently swallows errors — notification failures must never
 * interrupt the action that triggered them.
 *
 * @param {Object} opts
 * @param {number}  opts.recipientId   - teacher/accountant id (recipient)
 * @param {string}  opts.type          - one of NOTIFICATION_TYPES
 * @param {string}  opts.title
 * @param {string}  opts.message
 * @param {string}  [opts.link]        - deep-link module id (navigateTo target)
 * @param {Object}  [opts.meta]        - extra JSONB data
 * @param {string}  [opts.priority]    - 'low' | 'normal' | 'high' | 'urgent'
 */
async function createNotification({
    recipientId,
    type,
    title,
    message,
    link = null,
    meta = {},
    priority = 'normal',
}) {
    try {
        await insert('notifications', {
            recipient_id: recipientId,
            type,
            title,
            message,
            link,
            meta: Object.keys(meta).length > 0 ? meta : null,
            priority,
            is_read: false,
            created_at: new Date().toISOString(),
        });
        // Update bell badge immediately
        await refreshNotificationCount();
    } catch (err) {
        // Silent — notification failures must not surface to user
        console.warn('[Notifications] Failed to create notification:', err.message);
    }
}

/**
 * Create notifications for multiple recipients at once.
 * Each recipient gets their own row.
 *
 * @param {number[]} recipientIds
 * @param {Object}   opts - same as createNotification (without recipientId)
 */
async function notifyMany(recipientIds, opts) {
    if (!recipientIds || recipientIds.length === 0) return;

    const now = new Date().toISOString();
    const rows = recipientIds.map(id => ({
        recipient_id: id,
        type: opts.type,
        title: opts.title,
        message: opts.message,
        link: opts.link || null,
        meta: opts.meta && Object.keys(opts.meta).length > 0 ? opts.meta : null,
        priority: opts.priority || 'normal',
        is_read: false,
        created_at: now,
    }));

    try {
        await insertMany('notifications', rows);
        await refreshNotificationCount();
    } catch (err) {
        console.warn('[Notifications] notifyMany failed:', err.message);
    }
}

/* ─────────────────────────────────────────────────────────────────
   ADMIN IDs HELPER
   ───────────────────────────────────────────────────────────────── */

/**
 * Return all admin user IDs from state.teachers.
 * Used when notifying "all admins".
 */
function getAdminIds() {
    return (state.teachers || [])
        .filter(t => t.role === 'admin' && t.is_active !== false)
        .map(t => t.id);
}

/**
 * Return all accountant IDs from state.teachers.
 */
function getAccountantIds() {
    return (state.teachers || [])
        .filter(t => t.role === 'accountant' && t.is_active !== false)
        .map(t => t.id);
}

/**
 * Return all teacher IDs (role='teacher') from state.teachers.
 */
function getTeacherIds() {
    return (state.teachers || [])
        .filter(t => t.role === 'teacher' && t.is_active !== false)
        .map(t => t.id);
}

/* ─────────────────────────────────────────────────────────────────
   PAYMENT NOTIFICATIONS
   ───────────────────────────────────────────────────────────────── */

/**
 * Notify admins and accountants when a payment is recorded.
 *
 * @param {Object} payment - { id, student_id, total_amount, payment_method, receipt_number }
 * @param {Object} student - { first_name, last_name, code }
 */
async function notifyPaymentReceived(payment, student) {
    const recipientIds = [...new Set([...getAdminIds(), ...getAccountantIds()])];
    if (recipientIds.length === 0) return;

    const studentName = `${student.first_name || ''} ${student.last_name || ''}`.trim();
    const amount = fmtCurrency(payment.total_amount);

    await notifyMany(recipientIds, {
        type: 'payment',
        title: 'Payment Received',
        message: `${studentName} (${esc(student.code)}) — ${amount} received via ${esc(payment.payment_method)}.`,
        link: 'payment-history',
        priority: 'normal',
        meta: {
            payment_id: payment.id,
            student_id: student.id,
            amount: payment.total_amount,
            receipt: payment.receipt_number,
        },
    });
}

/**
 * Notify relevant users when a payment is reversed.
 */
async function notifyPaymentReversed(payment, student, reversedBy) {
    const adminIds = getAdminIds();
    if (adminIds.length === 0) return;

    const studentName = `${student.first_name || ''} ${student.last_name || ''}`.trim();
    const amount = fmtCurrency(payment.total_amount);

    await notifyMany(adminIds, {
        type: 'payment',
        title: 'Payment Reversed',
        message: `Payment of ${amount} for ${studentName} was reversed by ${esc(reversedBy)}.`,
        link: 'payment-reversals',
        priority: 'high',
        meta: {
            payment_id: payment.id,
            student_id: student.id,
        },
    });
}

/* ─────────────────────────────────────────────────────────────────
   OVERDUE NOTIFICATIONS
   ───────────────────────────────────────────────────────────────── */

/**
 * Generate overdue fee notifications for accountants and admins.
 * Called by the daily auto-check in boot.js.
 * Only creates notifications if they don't already exist for today.
 *
 * @param {Array} overdueFees   - student_fee rows classified as overdue
 */
async function notifyOverdueFees(overdueFees) {
    if (!overdueFees || overdueFees.length === 0) return;

    const recipientIds = [...new Set([...getAdminIds(), ...getAccountantIds()])];
    if (recipientIds.length === 0) return;

    // Count by severity
    const critical = overdueFees.filter(f => f.days_overdue >= OVERDUE_SEVERITY.CRITICAL).length;
    const total = overdueFees.length;

    if (total === 0) return;

    const priority = critical > 0 ? 'high' : 'normal';

    await notifyMany(recipientIds, {
        type: 'overdue',
        title: `${total} Overdue Fee${total > 1 ? 's' : ''}`,
        message: `${total} student fee${total > 1 ? 's are' : ' is'} overdue${critical > 0 ? ` — ${critical} critical (30+ days).` : '.'
            }`,
        link: 'overdue-payments',
        priority,
        meta: { count: total, critical },
    });
}

/* ─────────────────────────────────────────────────────────────────
   MARKS NOTIFICATIONS
   ───────────────────────────────────────────────────────────────── */

/**
 * Notify the admin when a teacher saves marks for an assessment.
 * Admin gets one notification per assessment (not per student).
 *
 * @param {Object} assessment - { id, name, class_id, subject_id, created_by }
 * @param {number} savedCount - number of student marks saved
 */
async function notifyMarksSaved(assessment, savedCount) {
    const adminIds = getAdminIds();
    if (adminIds.length === 0) return;

    // Find teacher name
    const teacher = getTeacher(assessment.created_by);
    const teacherName = teacher
        ? `${teacher.first_name || ''} ${teacher.last_name || ''}`.trim()
        : 'A teacher';

    // Find class and subject names
    const cls = getClass(assessment.class_id);
    const subject = getSubject(assessment.subject_id);
    const context = [
        cls ? esc(cls.name) : '',
        subject ? esc(subject.name) : '',
    ].filter(Boolean).join(' — ');

    await notifyMany(adminIds, {
        type: 'marks',
        title: 'Marks Saved',
        message: `${teacherName} saved ${savedCount} mark(s) for "${esc(assessment.name)}"${context ? ` (${context})` : ''
            }.`,
        link: 'marks-database',
        priority: 'low',
        meta: {
            assessment_id: assessment.id,
            saved_count: savedCount,
            holiday_mode: isHolidayMode(),
        },
    });
}

/**
 * Notify admin when an assessment is locked.
 */
async function notifyAssessmentLocked(assessment) {
    const adminIds = getAdminIds();
    if (adminIds.length === 0) return;

    await notifyMany(adminIds, {
        type: 'marks',
        title: 'Assessment Locked',
        message: `"${esc(assessment.name)}" has been locked. No further marks can be entered.`,
        link: 'assessments',
        priority: 'normal',
        meta: { assessment_id: assessment.id },
    });
}

/**
 * Notify the responsible teacher when their assessment is unlocked by admin.
 */
async function notifyAssessmentUnlocked(assessment) {
    const teacherId = assessment.created_by;
    if (!teacherId) return;

    await createNotification({
        recipientId: teacherId,
        type: 'marks',
        title: 'Assessment Unlocked',
        message: `"${esc(assessment.name)}" has been unlocked by admin. You can enter marks again.`,
        link: 'marks-entry',
        priority: 'high',
        meta: { assessment_id: assessment.id },
    });
}

/* ─────────────────────────────────────────────────────────────────
   STUDENT NOTIFICATIONS
   ───────────────────────────────────────────────────────────────── */

/**
 * Notify admins when a new student is enrolled.
 */
async function notifyStudentEnrolled(student) {
    const adminIds = getAdminIds();
    if (adminIds.length === 0) return;

    const name = `${student.first_name || ''} ${student.last_name || ''}`.trim();
    const cls = getClass(student.class_id);

    await notifyMany(adminIds, {
        type: 'student',
        title: 'New Student Enrolled',
        message: `${name} (${esc(student.code)}) has been enrolled${cls ? ` in ${esc(cls.name)}` : ''}.`,
        link: 'student-list',
        priority: 'low',
        meta: { student_id: student.id },
    });
}

/**
 * Notify admins when a student is archived.
 */
async function notifyStudentArchived(student, reason) {
    const adminIds = getAdminIds();
    if (adminIds.length === 0) return;

    const name = `${student.first_name || ''} ${student.last_name || ''}`.trim();

    await notifyMany(adminIds, {
        type: 'student',
        title: 'Student Archived',
        message: `${name} (${esc(student.code)}) was archived.${reason ? ' Reason: ' + esc(reason) : ''}`,
        link: 'student-archive',
        priority: 'normal',
        meta: { student_id: student.id, reason },
    });
}

/* ─────────────────────────────────────────────────────────────────
   SYSTEM NOTIFICATIONS
   ───────────────────────────────────────────────────────────────── */

/**
 * Notify all admins of a system event (backup, restore, errors).
 *
 * @param {string} title
 * @param {string} message
 * @param {string} [priority]
 */
async function notifySystem(title, message, priority = 'normal') {
    const adminIds = getAdminIds();
    if (adminIds.length === 0) return;

    await notifyMany(adminIds, {
        type: 'system',
        title,
        message,
        link: 'system-logs',
        priority,
    });
}

/* ─────────────────────────────────────────────────────────────────
   ANNOUNCEMENT PUBLISHED NOTIFICATION
   ───────────────────────────────────────────────────────────────── */

/**
 * Notify recipients when an announcement is published.
 *
 * @param {Object}   announcement - { id, title, target_roles, target_user_ids }
 */
async function notifyAnnouncementPublished(announcement) {
    let recipientIds = [];

    // Determine recipients based on target_roles
    const targets = announcement.target_roles || ['all'];

    if (targets.includes('all')) {
        recipientIds = (state.teachers || [])
            .filter(t => t.is_active !== false)
            .map(t => t.id);
    } else {
        if (targets.includes('teachers')) recipientIds.push(...getTeacherIds());
        if (targets.includes('accountants')) recipientIds.push(...getAccountantIds());
        if (targets.includes('admin')) recipientIds.push(...getAdminIds());
    }

    // Override with specific user IDs if set
    if (announcement.target_user_ids && announcement.target_user_ids.length > 0) {
        recipientIds = announcement.target_user_ids;
    }

    // Exclude the sender
    const currentUserId = state.currentUser?.id;
    recipientIds = [...new Set(recipientIds)].filter(id => id !== currentUserId);

    if (recipientIds.length === 0) return;

    await notifyMany(recipientIds, {
        type: 'announcement',
        title: 'New Announcement',
        message: `"${esc(announcement.title)}" has been published.`,
        link: 'notification-center',
        priority: announcement.priority || 'normal',
        meta: { announcement_id: announcement.id },
    });
}

/* ─────────────────────────────────────────────────────────────────
   HOLIDAY MODE NOTIFICATIONS
   ───────────────────────────────────────────────────────────────── */

/**
 * Notify all active staff that holiday mode has been activated.
 */
async function notifyHolidayModeActivated() {
    const allIds = [
        ...getAdminIds(),
        ...getAccountantIds(),
        ...getTeacherIds(),
    ];
    const uniqueIds = [...new Set(allIds)].filter(id => id !== state.currentUser?.id);
    if (uniqueIds.length === 0) return;

    await notifyMany(uniqueIds, {
        type: 'system',
        title: 'Holiday Session Started',
        message: HOLIDAY_CONFIG.bannerText,
        link: 'holidays-marks',
        priority: 'high',
    });
}

/**
 * Notify all active staff that holiday mode has ended and the new term is starting.
 */
async function notifyHolidayModeDeactivated(newTermName) {
    const allIds = [...new Set([...getAdminIds(), ...getAccountantIds(), ...getTeacherIds()])];
    const uniqueIds = allIds.filter(id => id !== state.currentUser?.id);
    if (uniqueIds.length === 0) return;

    await notifyMany(uniqueIds, {
        type: 'system',
        title: 'New Term Starting',
        message: `Holiday session has ended. ${newTermName || 'The new term'} is now beginning.`,
        link: 'academic-years',
        priority: 'high',
    });
}

/* ─────────────────────────────────────────────────────────────────
   MARK NOTIFICATION AS READ
   ───────────────────────────────────────────────────────────────── */

/**
 * Mark a single notification as read.
 * @param {number} notificationId
 */
async function markNotificationRead(notificationId) {
    try {
        await update('notifications', notificationId, {
            is_read: true,
            read_at: new Date().toISOString(),
        });
        // Update state
        const idx = state.notifications.findIndex(n => n.id === notificationId);
        if (idx !== -1) {
            state.notifications[idx].is_read = true;
        }
        await refreshNotificationCount();
    } catch (err) {
        console.warn('[Notifications] markNotificationRead failed:', err.message);
    }
}

/**
 * Mark all notifications for the current user as read.
 */
async function markAllNotificationsRead() {
    const userId = state.currentUser?.id;
    if (!userId) return;

    try {
        await updateWhere('notifications',
            `recipient_id=eq.${userId}&is_read=is.false`,
            { is_read: true, read_at: new Date().toISOString() }
        );
        // Update state
        state.notifications.forEach(n => {
            if (n.recipient_id === userId) n.is_read = true;
        });
        await refreshNotificationCount();
    } catch (err) {
        console.warn('[Notifications] markAllNotificationsRead failed:', err.message);
    }
}

/**
 * Load notifications for the current user into state.notifications.
 * Called at boot and after changes.
 */
async function loadUserNotifications() {
    const userId = state.currentUser?.id;
    if (!userId) return;

    try {
        state.notifications = await getAll('notifications',
            `recipient_id=eq.${userId}&order=created_at.desc&limit=100`
        );
        await refreshNotificationCount();
    } catch (err) {
        console.warn('[Notifications] loadUserNotifications failed:', err.message);
    }
}

/* ─────────────────────────────────────────────────────────────────
   DAILY OVERDUE CHECK
   Called once per session by boot.js to flag overdue fees.
   Only runs once per calendar day to avoid spam.
   ───────────────────────────────────────────────────────────────── */

/**
 * Run the daily overdue fee check and create notifications if needed.
 * Skips if already run today.
 */
async function runDailyOverdueCheck() {
    const today = todayISO();
    const lastRun = localStorage.getItem('lf_last_overdue_check');
    if (lastRun === today) return; // already ran today

    try {
        const overdueFees = await getAll('student_fees',
            `is_paid=is.false&is_waived=is.false&due_date=lt.${today}&select=*`
        );

        if (overdueFees.length > 0) {
            const buckets = classifyOverdueFees(overdueFees);
            const allOverdue = [
                ...buckets.critical,
                ...buckets.warning,
                ...buckets.mild,
                ...buckets.recent,
            ];
            if (allOverdue.length > 0) {
                await notifyOverdueFees(allOverdue);
            }
        }

        localStorage.setItem('lf_last_overdue_check', today);

    } catch (err) {
        console.warn('[Notifications] runDailyOverdueCheck failed:', err.message);
    }
}

/* ─────────────────────────────────────────────────────────────────
   EXPOSE
   ───────────────────────────────────────────────────────────────── */

window.createNotification = createNotification;
window.notifyMany = notifyMany;
window.getAdminIds = getAdminIds;
window.getAccountantIds = getAccountantIds;
window.getTeacherIds = getTeacherIds;
window.notifyPaymentReceived = notifyPaymentReceived;
window.notifyPaymentReversed = notifyPaymentReversed;
window.notifyOverdueFees = notifyOverdueFees;
window.notifyMarksSaved = notifyMarksSaved;
window.notifyAssessmentLocked = notifyAssessmentLocked;
window.notifyAssessmentUnlocked = notifyAssessmentUnlocked;
window.notifyStudentEnrolled = notifyStudentEnrolled;
window.notifyStudentArchived = notifyStudentArchived;
window.notifySystem = notifySystem;
window.notifyAnnouncementPublished = notifyAnnouncementPublished;
window.notifyHolidayModeActivated = notifyHolidayModeActivated;
window.notifyHolidayModeDeactivated = notifyHolidayModeDeactivated;
window.markNotificationRead = markNotificationRead;
window.markAllNotificationsRead = markAllNotificationsRead;
window.loadUserNotifications = loadUserNotifications;
window.runDailyOverdueCheck = runDailyOverdueCheck;