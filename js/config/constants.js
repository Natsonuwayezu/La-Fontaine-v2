/**
 * ECOLE LA FONTAINE — Constants & Configuration
 * Single source of truth for all app constants
 * Last updated: 2026-06-28
 */

// ──────────────────────────────────────────────────────────────────────
// APP CONFIGURATION
// ──────────────────────────────────────────────────────────────────────

const APP_CONFIG = {
    name: 'ECOLE LA FONTAINE',
    version: '9.0.0',
    sessionDuration: 60 * 60 * 1000,          // 1 hour
    idleWarningMs: 25 * 60 * 1000,            // warn at 25 min
    idleLogoutMs: 30 * 60 * 1000,             // logout at 30 min
    autoBackupInterval: 6 * 60 * 60 * 1000,   // 6 hours
    maxBackups: 5,
    itemsPerPage: 20,
    maxLoginAttempts: 5,
    lockoutDuration: 15 * 60 * 1000,          // 15 minutes
    cacheTTL: 5 * 60 * 1000,                  // 5 minutes
    maxImportRows: 500,
    maxUploadSize: 2 * 1024 * 1024,           // 2 MB
    receiptPrefix: 'RCP',
    studentCodePrefix: 'STU',
};

// ──────────────────────────────────────────────────────────────────────
// CURRENCY SETTINGS
// ──────────────────────────────────────────────────────────────────────

const CURRENCY = {
    code: 'RWF',
    symbol: 'RWF',
    locale: 'en-RW',
    decimalPlaces: 0,
};

// ──────────────────────────────────────────────────────────────────────
// ACADEMIC CONSTANTS
// ──────────────────────────────────────────────────────────────────────

const DEFAULT_GRADES = [
    { grade: 'A+', min: 90, max: 100, desc: 'Excellent', color: '#10b981', sort_order: 1 },
    { grade: 'A', min: 80, max: 89, desc: 'Very Good', color: '#34d399', sort_order: 2 },
    { grade: 'B', min: 70, max: 79, desc: 'Good', color: '#60a5fa', sort_order: 3 },
    { grade: 'C', min: 60, max: 69, desc: 'Average', color: '#fbbf24', sort_order: 4 },
    { grade: 'D', min: 50, max: 59, desc: 'Below Average', color: '#f97316', sort_order: 5 },
    { grade: 'F', min: 0, max: 49, desc: 'Fail', color: '#ef4444', sort_order: 6 },
];

const PROMOTION_RULES = [
    { from: 'NURSERY 1', to: 'NURSERY 2' },
    { from: 'NURSERY 2', to: 'NURSERY 3' },
    { from: 'NURSERY 3', to: 'PRIMARY 1' },
    { from: 'PRIMARY 1', to: 'PRIMARY 2' },
    { from: 'PRIMARY 2', to: 'PRIMARY 3' },
    { from: 'PRIMARY 3', to: 'PRIMARY 4' },
    { from: 'PRIMARY 4', to: 'PRIMARY 5' },
    { from: 'PRIMARY 5', to: 'PRIMARY 6' },
    { from: 'PRIMARY 6', to: 'GRADUATED' },
];

const PROMOTION_MAP = Object.fromEntries(
    PROMOTION_RULES.map(r => [r.from, r.to])
);

// ──────────────────────────────────────────────────────────────────────
// TIMETABLE CONSTANTS
// ──────────────────────────────────────────────────────────────────────

const TIMETABLE_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

const TIMETABLE_TIME_SLOTS = [
    '08:20-09:00',
    '09:00-09:40',
    '09:40-10:20',
    '10:20-10:40',  // ☕ Morning break
    '10:40-11:20',
    '11:20-12:00',
    '12:00-13:00',  // 🍽️ Lunch break
    '13:00-13:40',
    '13:40-14:20',
    '14:20-15:00',
    '15:00-15:20',  // ☕ Afternoon break
    '15:20-16:00',
    '16:00-16:40',
];

const BREAK_SLOTS = new Set(['10:20-10:40', '12:00-13:00', '15:00-15:20']);

function isBreakSlot(timeSlot) {
    return BREAK_SLOTS.has(timeSlot);
}

function getBreakIcon(timeSlot) {
    if (timeSlot === '10:20-10:40') return '☕';
    if (timeSlot === '12:00-13:00') return '🍽️';
    if (timeSlot === '15:00-15:20') return '☕';
    return '';
}

// ──────────────────────────────────────────────────────────────────────
// ASSESSMENT CONSTANTS
// ──────────────────────────────────────────────────────────────────────

const ASSESSMENT_TYPES = ['Quiz', 'Assignment', 'Mid-term', 'Exam', 'Final Exam'];

const PRE_MIDTERM_TYPES = ['Quiz', 'Assignment', 'Mid-term'];

const POST_MIDTERM_TYPES = ['Quiz', 'Assignment', 'Mid-term', 'Exam', 'Final Exam'];

// ──────────────────────────────────────────────────────────────────────
// FINANCE CONSTANTS
// ──────────────────────────────────────────────────────────────────────

const PAYMENT_METHODS = ['Cash', 'Mobile-Money', 'Bank Transfer', 'Cheque'];

const FEE_FREQUENCIES = ['monthly', 'termly', 'annual', 'one_time'];

const FEE_TYPES = ['standard', 'transport', 'activity', 'one-time'];

// ──────────────────────────────────────────────────────────────────────
// STUDENT CONSTANTS
// ──────────────────────────────────────────────────────────────────────

const STUDENT_STATUSES = ['Active', 'Inactive', 'Transferred', 'Graduated'];

const GENDER_OPTIONS = ['Male', 'Female'];

// ──────────────────────────────────────────────────────────────────────
// USER CONSTANTS
// ──────────────────────────────────────────────────────────────────────

const USER_ROLES = ['admin', 'accountant', 'teacher'];

const USER_ROLE_LABELS = {
    admin: 'Administrator',
    accountant: 'Accountant',
    teacher: 'Teacher',
};

// ──────────────────────────────────────────────────────────────────────
// NOTIFICATION TYPES
// ──────────────────────────────────────────────────────────────────────

const NOTIFICATION_TYPES = {
    PAYMENT: 'payment',
    MARKS: 'marks',
    ATTENDANCE: 'attendance',
    STUDENT: 'student',
    SYSTEM: 'system',
    OVERDUE: 'overdue',
    ANNOUNCEMENT: 'announcement',
    REMINDER: 'reminder',
    URGENT: 'urgent',
    WARNING: 'warning',
    INFO: 'info',
};

const NOTIFICATION_PRIORITY = {
    CRITICAL: 'critical',
    HIGH: 'high',
    MEDIUM: 'medium',
    LOW: 'low',
};

// ──────────────────────────────────────────────────────────────────────
// ERROR CONSTANTS
// ──────────────────────────────────────────────────────────────────────

const ERROR_SEVERITY = {
    LOW: 'low',
    MEDIUM: 'medium',
    HIGH: 'high',
    CRITICAL: 'critical',
};

const ERROR_CATEGORIES = {
    NETWORK: 'network',
    DATABASE: 'database',
    AUTH: 'auth',
    VALIDATION: 'validation',
    RENDER: 'render',
    UNKNOWN: 'unknown',
};

// ──────────────────────────────────────────────────────────────────────
// Z-INDEX LAYERS
// ──────────────────────────────────────────────────────────────────────

const Z_INDEX = {
    NEGATIVE: -1,
    LOW: 10,
    MEDIUM: 100,
    HIGH: 200,
    MODAL: 1000,
    MODAL_CONTENT: 1010,
    DROPDOWN: 1100,
    TOOLTIP: 1200,
    TOAST: 9999,
    MAX: 99999,
};

// ──────────────────────────────────────────────────────────────────────
// STORAGE KEYS
// ──────────────────────────────────────────────────────────────────────

const STORAGE_KEYS = {
    USER: 'elf_user',
    EXPIRY: 'elf_expiry',
    THEME: 'elf_theme',
    MODULE: 'elf_module',
    BACKUP_HISTORY: 'elf_backup_history',
    COLLAPSED_SECTIONS: 'sidebar_collapsed_sections',
    PAY_STUDENT: 'elf_pay_student',
    VIEW_STUDENT: 'elf_view_student',
    BIOMETRIC_CRED: 'elf_biometric_cred',
    BIOMETRIC_USER: 'elf_biometric_user',
    LAST_BACKUP: 'elf_last_auto_backup',
    LAST_FEE_RESET_CHECK: 'elf_last_fee_reset_check',
    LAST_ARCHIVE_CHECK: 'elf_last_archive_check',
    REGISTER_EXPORT_HISTORY: 'register_export_history',
    REPORT_TEMPLATE: 'report_template',
    CUSTOM_REPORT_TEMPLATE: 'custom_report_template',
    REPORT_BATCH_QUEUE: 'report_batch_queue',
    AUTO_BACKUP_ENABLED: 'auto_backup_enabled',
    AUTO_BACKUP_FREQUENCY: 'auto_backup_frequency',
    AUTO_BACKUP_KEEP: 'auto_backup_keep',
    DEFAULT_REGISTER_FORMAT: 'default_register_format',
    DEFAULT_REGISTER_ORIENTATION: 'default_register_orientation',
    REGISTER_DATE_FORMAT: 'register_date_format',
    REGISTER_DECIMALS: 'register_decimals',
    TRANSCRIPT_DEFAULT_FORMAT: 'transcript_default_format',
    TRANSCRIPT_GPA_SCALE: 'transcript_gpa_scale',
    TRANSCRIPT_INCLUDE_LETTERHEAD: 'transcript_include_letterhead',
    TRANSCRIPT_SIGNATURE_STYLE: 'transcript_signature_style',
    DEFAULT_RANKING_TYPE: 'default_ranking_type',
    RANKING_TIE_RULE: 'ranking_tie_rule',
    RANKING_DECIMALS: 'ranking_decimals',
    RANKING_SHOW_PERCENTAGE: 'ranking_show_percentage',
    ANALYTICS_CACHE: 'analytics_cache',
    ANALYTICS_CACHE_TIME: 'analytics_cache_time',
    PWA_PROMPT_SHOWN: 'pwa_prompt_shown',
};
// ── GLOBAL EXPORTS ──────────────────────────────────────────────────
window.APP_CONFIG    = APP_CONFIG;
window.STORAGE_KEYS  = STORAGE_KEYS;
window.SUPABASE_URL  = typeof SUPABASE_URL !== 'undefined' ? SUPABASE_URL : window.SUPABASE_URL;
window.USER_ROLES    = USER_ROLES;
window.USER_ROLE_LABELS = USER_ROLE_LABELS;
window.GRADE_COLORS  = typeof GRADE_COLORS !== 'undefined' ? GRADE_COLORS : {};
window.ASSESSMENT_TYPES = typeof ASSESSMENT_TYPES !== 'undefined' ? ASSESSMENT_TYPES : [];

export {
    APP_CONFIG,
    CURRENCY,
    DEFAULT_GRADES,
    PROMOTION_RULES,
    PROMOTION_MAP,
    TIMETABLE_DAYS,
    TIMETABLE_TIME_SLOTS,
    BREAK_SLOTS,
    isBreakSlot,
    getBreakIcon,
    ASSESSMENT_TYPES,
    PRE_MIDTERM_TYPES,
    POST_MIDTERM_TYPES,
    PAYMENT_METHODS,
    FEE_FREQUENCIES,
    FEE_TYPES,
    STUDENT_STATUSES,
    GENDER_OPTIONS,
    USER_ROLES,
    USER_ROLE_LABELS,
    NOTIFICATION_TYPES,
    NOTIFICATION_PRIORITY,
    ERROR_SEVERITY,
    ERROR_CATEGORIES,
    Z_INDEX,
    STORAGE_KEYS,
};