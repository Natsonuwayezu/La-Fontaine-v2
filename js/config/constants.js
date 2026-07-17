/**
 * ═══════════════════════════════════════════════════════════════════
 * CONSTANTS — ECOLE LA FONTAINE
 * ═══════════════════════════════════════════════════════════════════
 * Single source of truth for all app constants.
 * Loaded first among core/config scripts — nothing here depends
 * on any other file. Pure data, no logic.
 * Last updated: 2026-07-13
 * ═══════════════════════════════════════════════════════════════════
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
  familyCodePrefix: 'FAM',
  defaultLocale: 'en',
};

// Used as bare top-level identifiers by core/router.js (in every dynamic
// module-load URL — script.src = filePath + '?v=' + APP_VERSION),
// core/boot.js, core/window-exposure.js, and core/print-engine.js (5
// usages) — none of which is APP_CONFIG.name/version. Neither constant
// was ever defined anywhere until now; router.js's loadModuleScript()
// would have thrown ReferenceError the first time any page was navigated
// to at all, since it runs on every single dynamic module load.
const APP_NAME = APP_CONFIG.name;
const APP_VERSION = APP_CONFIG.version;

// ──────────────────────────────────────────────────────────────────────
// SCHOOL METADATA
// ──────────────────────────────────────────────────────────────────────

const APP_META = {
  schoolName: 'ECOLE LA FONTAINE',
  schoolLocation: 'Rubavu, Rwanda',
  schoolPhone: '+250788534320',
  schoolEmail: 'ecoleslafontaine@gmail.com',
  schoolWebsite: 'www.ecoleslafontaine.com',
  adminDisplayName: 'UWAYO GANZA Eugene',
  adminDisplayRole: 'Head of School',
  currency: 'RWF',
  currencySymbol: 'RWF',
  timezone: 'Africa/Kigali',
  defaultLocale: 'en',
};

// ──────────────────────────────────────────────────────────────────────
// CURRENCY SETTINGS
// ──────────────────────────────────────────────────────────────────────

const CURRENCY = {
  code: 'RWF',
  symbol: 'RWF',
  locale: 'en-RW',
  decimalPlaces: 0,
  format: (amount) => {
    if (amount === null || amount === undefined || isNaN(amount)) return '—';
    return Number(amount).toLocaleString('en-US') + ' RWF';
  }
};

// ──────────────────────────────────────────────────────────────────────
// CLASS LEVELS
// ──────────────────────────────────────────────────────────────────────

const CLASS_LEVELS = {
  nursery: ['NURSERY 1', 'NURSERY 2', 'NURSERY 3'],
  primary: ['PRIMARY 1', 'PRIMARY 2', 'PRIMARY 3', 'PRIMARY 4', 'PRIMARY 5', 'PRIMARY 6']
};

const ALL_CLASS_NAMES = [
  ...CLASS_LEVELS.nursery,
  ...CLASS_LEVELS.primary
];

/* ─────────────────────────────────────────────────────────────────
   CLASS LIST  (sort_order mirrors DB sort_order column)
   ───────────────────────────────────────────────────────────────── */

const CLASS_LIST = [
  { code: 'N1', name: 'NURSERY 1', level: 'nursery', sort_order: 1 },
  { code: 'N2', name: 'NURSERY 2', level: 'nursery', sort_order: 2 },
  { code: 'N3', name: 'NURSERY 3', level: 'nursery', sort_order: 3 },
  { code: 'P1', name: 'PRIMARY 1', level: 'primary', sort_order: 4 },
  { code: 'P2', name: 'PRIMARY 2', level: 'primary', sort_order: 5 },
  { code: 'P3', name: 'PRIMARY 3', level: 'primary', sort_order: 6 },
  { code: 'P4', name: 'PRIMARY 4', level: 'primary', sort_order: 7 },
  { code: 'P5', name: 'PRIMARY 5', level: 'primary', sort_order: 8 },
  { code: 'P6', name: 'PRIMARY 6', level: 'primary', sort_order: 9 },
];


/* ─────────────────────────────────────────────────────────────────
   NURSERY CLASS LABELS IN FRENCH  (used on French report cards)
   ───────────────────────────────────────────────────────────────── */

const NURSERY_FR_LABELS = {
  'NURSERY 1': 'MATERNELLE 1',
  'NURSERY 2': 'MATERNELLE 2',
  'NURSERY 3': 'MATERNELLE 3',
};

/* ─────────────────────────────────────────────────────────────────
   SUBJECT LISTS  (fallback if DB subjects table is empty)
   Mirrors Part 2.6 exactly.
   ───────────────────────────────────────────────────────────────── */

const NURSERY_SUBJECTS = [
  { code: 'PCALC', name: 'Pré-Calculé', mg_max: 50, ex_max: 50, appears_only_post_midterm: false, sort_order: 1 },
  { code: 'ESENV', name: 'Education Santé Env.', mg_max: 50, ex_max: 50, appears_only_post_midterm: false, sort_order: 2 },
  { code: 'FREC', name: 'Français Écriture', mg_max: 50, ex_max: 50, appears_only_post_midterm: false, sort_order: 3 },
  { code: 'FRLEC', name: 'Français Lecture', mg_max: 50, ex_max: 50, appears_only_post_midterm: false, sort_order: 4 },
  { code: 'ANG', name: 'Anglais', mg_max: 50, ex_max: 50, appears_only_post_midterm: false, sort_order: 5 },
  { code: 'EXPO', name: 'Expression Orale', mg_max: 50, ex_max: 50, appears_only_post_midterm: true, sort_order: 6 },
  { code: 'ARTPL', name: 'Art Plastique', mg_max: 50, ex_max: 50, appears_only_post_midterm: false, sort_order: 7 },
  { code: 'DEVSOC', name: 'Développement Social', mg_max: 50, ex_max: 50, appears_only_post_midterm: true, sort_order: 8 },
];

const PRIMARY_SUBJECTS = [
  { code: 'MATH', name: 'Mathematics', mg_max: 50, ex_max: 50, appears_only_post_midterm: false, sort_order: 1 },
  { code: 'ENG', name: 'English', mg_max: 50, ex_max: 50, appears_only_post_midterm: false, sort_order: 2 },
  { code: 'KIN', name: 'Kinyarwanda', mg_max: 50, ex_max: 50, appears_only_post_midterm: false, sort_order: 3 },
  { code: 'FRE', name: 'French', mg_max: 50, ex_max: 50, appears_only_post_midterm: false, sort_order: 4 },
  { code: 'SET', name: 'SET', mg_max: 40, ex_max: 40, appears_only_post_midterm: false, sort_order: 5 },
  { code: 'SSRE', name: 'SSRE', mg_max: 40, ex_max: 40, appears_only_post_midterm: false, sort_order: 6 },
  { code: 'READ', name: 'Reading', mg_max: 20, ex_max: 20, appears_only_post_midterm: true, sort_order: 7 },
  { code: 'CART', name: 'Creative Arts', mg_max: 20, ex_max: 20, appears_only_post_midterm: true, sort_order: 8 },
  { code: 'SPORT', name: 'Sports', mg_max: 10, ex_max: 10, appears_only_post_midterm: true, sort_order: 9 },
];

// Annual max totals (Part 4.5)
const ANNUAL_MAX = {
  primary: 1980,
  nursery: 2400,
};

// ──────────────────────────────────────────────────────────────────────
// ACADEMIC CONSTANTS
// ──────────────────────────────────────────────────────────────────────

const DEFAULT_GRADES = [
  { grade: 'A+', min: 90, max: 100, desc: 'Excellent', color: '#3a7a5a', sort_order: 1 },
  { grade: 'A', min: 80, max: 89, desc: 'Very Good', color: '#5a9a7a', sort_order: 2 },
  { grade: 'B', min: 70, max: 79, desc: 'Good', color: '#6a8aba', sort_order: 3 },
  { grade: 'C', min: 60, max: 69, desc: 'Average', color: '#c9a84c', sort_order: 4 },
  { grade: 'D', min: 50, max: 59, desc: 'Below Average', color: '#c48a3a', sort_order: 5 },
  { grade: 'F', min: 0, max: 49, desc: 'Fail', color: '#c45a4a', sort_order: 6 },
];

const DEFAULT_PASS_MARK = 50;

// Used by core/formulas.js's getPassMark() and core/utils.js's print-header
// helper, both of which referenced SCHOOL_DEFAULTS.X without this constant
// being defined anywhere — getPassMark() would have thrown ReferenceError on
// every call, which cascades into getGrade()/isPassing()/isPassingScore()/
// getPromotionDecision(), since they all call it.
const SCHOOL_DEFAULTS = {
  pass_mark: DEFAULT_PASS_MARK,
  school_name: 'ECOLE LA FONTAINE',
  school_location: 'Rubavu, Rwanda',
};

const ACADEMIC_PHASES = ['pre-midterm', 'post-midterm', 'annual'];
const TERMS = ['Term 1', 'Term 2', 'Term 3'];

// ──────────────────────────────────────────────────────────────────────
// PROMOTION RULES
// ──────────────────────────────────────────────────────────────────────

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
  '10:20-10:40',  // Morning break
  '10:40-11:20',
  '11:20-12:00',
  '12:00-13:00',  // Lunch break
  '13:00-13:40',
  '13:40-14:20',
  '14:20-15:00',
  '15:00-15:20',  // Afternoon break
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

// overdue severity thresholds in days  (Part 4.12)
const OVERDUE_SEVERITY = {
  CRITICAL: 30,
  WARNING: 15,
  MILD: 7,
  RECENT: 1,
};
// Receipt number format: RCP-YYYYMMDD-NNN  (Part 9)
const RECEIPT_PREFIX = 'RCP';

/* ─────────────────────────────────────────────────────────────────
   FEE RESET FREQUENCIES
   ───────────────────────────────────────────────────────────────── */

const FEE_APPLY_TO = ['all', 'class', 'student'];
const WAIVER_TYPES = ['full', 'partial', 'percentage'];

const PAYMENT_METHODS = ['Cash', 'Mobile-Money', 'Bank Transfer', 'Cheque'];

const FEE_FREQUENCIES = ['monthly', 'termly', 'annual', 'one_time'];

const FEE_TYPES = ['standard', 'transport', 'activity', 'one-time'];

const FEE_CATEGORIES_DEFAULT = [
  'Tuition',
  'Transport',
  'Uniform',
  'Books & Materials',
  'Trip Fee',
  'Lunch Program',
  'Holiday Occupation'
];

const OVERDUE_THRESHOLDS = { mild: 7, warning: 21, critical: 45 };

/* ─────────────────────────────────────────────────────────────────
   ATTENDANCE STATUS CODES
   ───────────────────────────────────────────────────────────────── */

// P = Present, A = Absent, L = Late, E = Excused
const ATTENDANCE_CODES = ['P', 'A', 'L', 'E'];
const ATTENDANCE_LABELS = { P: 'Present', A: 'Absent', L: 'Late', E: 'Excused' };

// Late counts as 0.5 days for rate calculation  (Part 4.8)
const LATE_WEIGHT = 0.5;

// At-risk thresholds
const ATTENDANCE_THRESHOLDS = {
  AT_RISK: 75,  // below this → red alert
  WARNING: 85,  // below this → yellow warning
};

// ──────────────────────────────────────────────────────────────────────
// STUDENT CONSTANTS
// ──────────────────────────────────────────────────────────────────────

const STUDENT_STATUSES = ['Active', 'Inactive', 'Transferred', 'Graduated'];

const GENDER_OPTIONS = ['Male', 'Female'];

/* ─────────────────────────────────────────────────────────────────
   FAMILY
   ───────────────────────────────────────────────────────────────── */

// Family code format: FAM-NNN
const FAMILY_CODE_PREFIX = 'FAM';

// ──────────────────────────────────────────────────────────────────────
// USER CONSTANTS
// ──────────────────────────────────────────────────────────────────────

const USER_ROLES = ['admin', 'accountant', 'teacher'];

// Alias used by validators.js's validateTeacherForm(), which referenced this
// name without it being defined anywhere — same set of roles as USER_ROLES.
const TEACHER_ROLES = USER_ROLES;

// Used by core/logger.js's logX() convenience wrappers (logCreateStudent,
// logUpdateTimetable, etc.), which referenced LOG_ACTIONS.X in 20 places
// without this constant being defined anywhere — every one of those wrappers
// would have thrown ReferenceError on first call.
const LOG_ACTIONS = {
  LOGIN: 'LOGIN',
  LOGOUT: 'LOGOUT',
  CREATE_STUDENT: 'CREATE_STUDENT',
  UPDATE_STUDENT: 'UPDATE_STUDENT',
  ARCHIVE_STUDENT: 'ARCHIVE_STUDENT',
  PROMOTE_BATCH: 'PROMOTE_BATCH',
  SAVE_MARKS: 'SAVE_MARKS',
  LOCK_ASSESSMENT: 'LOCK_ASSESSMENT',
  UNLOCK_ASSESSMENT: 'UNLOCK_ASSESSMENT',
  CREATE_PAYMENT: 'CREATE_PAYMENT',
  REVERSE_PAYMENT: 'REVERSE_PAYMENT',
  WAIVE_FEE: 'WAIVE_FEE',
  CREATE_TEACHER: 'CREATE_TEACHER',
  UPDATE_TEACHER: 'UPDATE_TEACHER',
  UPDATE_SETTINGS: 'UPDATE_SETTINGS',
  UPDATE_GRADING: 'UPDATE_GRADING',
  BACKUP: 'BACKUP',
  RESTORE: 'RESTORE',
  UPDATE_TIMETABLE: 'UPDATE_TIMETABLE',
  CREATE_ANNOUNCEMENT: 'CREATE_ANNOUNCEMENT',
};

const USER_ROLE_LABELS = {
  admin: 'Administrator',
  accountant: 'Accountant',
  teacher: 'Teacher',
};

/* ─────────────────────────────────────────────────────────────────
   HOLIDAY SESSION CONFIG
   ─────────────────────────────────────────────────────────────────
   When all 3 terms are completed (status='completed') and the user
   navigates into a holiday period, the app switches to HOLIDAY MODE.
 
   Holiday mode rules:
   - A moving banner appears at the top of every page (cannot be
     dismissed — it reappears on page navigation).
   - All marks recorded go to holiday_marks table (NOT marks table).
   - All fees applied go to holiday_fees table (NOT student_fees).
   - Holiday subjects are custom and can differ from normal subjects.
   - Holiday data NEVER appears in term registers or report cards.
   - Holiday fees are shown separately in finance and applied at the
     START of the next term (not deducted immediately).
   - Not all students attend holiday programs — only enrolled ones.
   ───────────────────────────────────────────────────────────────── */
 
const HOLIDAY_CONFIG = {
    // localStorage key to persist holiday session state
    sessionKey       : 'lf_holiday_session',
    // Banner text shown during holiday mode
    bannerText       : 'HOLIDAY SESSION ACTIVE — Data recorded here goes to separate holiday tables and does NOT affect the normal academic year.',
    bannerColor      : '#c44536',
    // Holiday fees are applied at next term start
    feesApplyAt      : 'next_term_start',
    // Tables used during holiday mode (separate from main tables)
    marksTable       : 'holiday_marks',
    feesTable        : 'holiday_fees',
    studentsTable    : 'holiday_enrollments', // only students enrolled in holiday program
    subjectsTable    : 'holiday_subjects',    // custom holiday subjects
};
 
/* ─────────────────────────────────────────────────────────────────
   REPORT CARD STRINGS  (Part 7)
   ───────────────────────────────────────────────────────────────── */
 
const REPORT_STRINGS = {
    nursery: {
        pre_midterm  : 'RÉSULTATS DES TESTS DEMI-TRIMESTRE',
        post_midterm : 'RÉSULTATS DE FIN DE TRIMESTRE',
        annual       : 'RAPPORT ANNUEL',
        subject_col  : 'MATIÈRES',
        note_col     : 'NOTE',
        cote_col     : 'CÔTE',
        total_label  : 'TOTAL DES POINTS',
        avg_label    : 'MOYENNE',
        rank_label   : 'RANG',
        footer_prefix: 'Fait à ECOLE LA FONTAINE, Le',
        pass_msg     : 'FÉLICITATIONS! L\'élève est PROMU(E) en',
        remedial_msg : 'COURS DE RATTRAPAGE — POUR PASSER LES EXAMENS DE DEUXIÈME SESSION',
        fail_msg     : 'L\'élève doit REPRENDRE la classe',
    },
    primary: {
        pre_midterm  : 'MID-TERM EXAMINATION RESULTS',
        post_midterm : 'END OF TERM EXAMINATIONS RESULTS',
        annual       : 'ANNUAL REPORT CARD',
        subject_col  : 'SUBJECT',
        score_col    : 'SCORE/MG',
        grade_col    : 'GRADE/EX',
        total_col    : 'TOTAL',
        total_label  : 'TOTAL SCORE',
        avg_label    : 'AVERAGE',
        grade_label  : 'GRADE',
        rank_label   : 'RANK',
        footer_prefix: 'Done at ECOLE LA FONTAINE, ON',
        pass_msg     : 'CONGRATULATIONS! The student is PROMOTED to',
        remedial_msg : 'HOLIDAY REMEDIAL COURSES — TO SIT FOR SECOND SITTING EXAMINATIONS',
        fail_msg     : 'The student must REPEAT',
    },
};
 
/* ─────────────────────────────────────────────────────────────────
   CELL COLOR THRESHOLDS (class register)  (Part 8, last paragraph)
   ───────────────────────────────────────────────────────────────── */
 
const CELL_COLORS = [
    { min: 80,  max: 100, bg: '#d1fae5', text: '#065f46', cls: 'cell-high'   },
    { min: 60,  max: 79,  bg: '#fef3c7', text: '#92400e', cls: 'cell-medium' },
    { min: 50,  max: 59,  bg: '#ffedd5', text: '#9a3412', cls: 'cell-low'    },
    { min:  0,  max: 49,  bg: '#fee2e2', text: '#991b1b', cls: 'cell-fail'   },
];
 
/* ─────────────────────────────────────────────────────────────────
   DAYS OF WEEK  (timetable)
   ───────────────────────────────────────────────────────────────── */
 
// DB stores 1=Mon … 5=Fri  (Part 2.9)
const DAYS_OF_WEEK = [
    { id: 1, name: 'Monday',    short: 'Mon' },
    { id: 2, name: 'Tuesday',   short: 'Tue' },
    { id: 3, name: 'Wednesday', short: 'Wed' },
    { id: 4, name: 'Thursday',  short: 'Thu' },
    { id: 5, name: 'Friday',    short: 'Fri' },
];
 
/* ─────────────────────────────────────────────────────────────────
   ANNOUNCEMENT TYPES  (Part 2.22)
   ───────────────────────────────────────────────────────────────── */
 
const ANNOUNCEMENT_TYPES      = ['general', 'urgent', 'event'];
const ANNOUNCEMENT_RECIPIENTS = ['all', 'teachers', 'accountants', 'specific'];
const ANNOUNCEMENT_CHANNELS   = ['in_app', 'email', 'sms'];
 
/* ─────────────────────────────────────────────────────────────────
   QR CODE CONFIG  (Part 7.3)
   ───────────────────────────────────────────────────────────────── */
 
const QR_CONFIG = {
    // Base URL of the standalone QR verify page
    // Change this to the deployed domain before production
    verifyBaseUrl : window.location.origin + '/qr-verify.html',
    // Query params encoded into QR
    // ?s=STU-2026-0045&t=2&y=3
    studentParam  : 's',
    termParam     : 't',
    yearParam     : 'y',
    size          : 128,  // px
};
 
/* ─────────────────────────────────────────────────────────────────
   ROLE THEMING  (Part 10.3)
   ───────────────────────────────────────────────────────────────── */
 
const ROLE_THEME = {
    admin      : { primary: '#1a3a5c', gradient: 'linear-gradient(135deg,#1a3a5c,#2d5a8e)', bodyClass: 'role-admin'      },
    accountant : { primary: '#0d9488', gradient: 'linear-gradient(135deg,#0d9488,#14b8a6)', bodyClass: 'role-accountant' },
    teacher    : { primary: '#7c3aed', gradient: 'linear-gradient(135deg,#7c3aed,#8b5cf6)', bodyClass: 'role-teacher'    },
};
 
/* ─────────────────────────────────────────────────────────────────
   ASCII CHART CONFIG  (Part 10.2)
   ───────────────────────────────────────────────────────────────── */
 
const ASCII_BAR_WIDTH    = 20;   // default character width of horizontal bars
const ASCII_FILL_CHAR    = '█';
const ASCII_EMPTY_CHAR   = '░';
 
/* ─────────────────────────────────────────────────────────────────
   PAGINATION
   ───────────────────────────────────────────────────────────────── */
 
const DEFAULT_PAGE_SIZE  = 25;
const PAGE_SIZE_OPTIONS  = [10, 25, 50, 100, 'All'];
 
/* ─────────────────────────────────────────────────────────────────
   DEBOUNCE DELAYS
   ───────────────────────────────────────────────────────────────── */
 
const DEBOUNCE_SEARCH    = 300;  // ms
const DEBOUNCE_SAVE      = 500;  // ms
const DEBOUNCE_RESIZE    = 150;  // ms
 
/* ─────────────────────────────────────────────────────────────────
   OFFLINE / INDEXEDDB CONFIG  (Part 12)
   ───────────────────────────────────────────────────────────────── */
 
const IDB_NAME    = 'ecole_la_fontaine_offline';
const IDB_VERSION = 1;
const IDB_STORES  = {
    pendingMarks    : 'pending_marks',
    pendingPayments : 'pending_payments',
    cachedStudents  : 'cached_students',
};
 
/* ─────────────────────────────────────────────────────────────────
   BACKUP CONFIG  (Part 5.11)
   ───────────────────────────────────────────────────────────────── */
 
const BACKUP_FILENAME_PREFIX = 'backup_ECOLE_';
const BACKUP_ALL_TABLES = [
    'school_settings', 'academic_years', 'terms', 'holidays',
    'classes', 'subjects', 'teachers', 'teacher_assignments',
    'timetable_slots', 'families', 'students', 'assessments',
    'marks', 'fee_categories', 'fee_amounts', 'student_fees',
    'student_credit_balance', 'payments', 'payment_allocations',
    'fee_waivers', 'notifications', 'announcements', 'system_logs',
    'grading_scale', 'student_promotions', 'student_promotion_records',
    // Holiday tables (separate — always back up together)
    'holiday_marks', 'holiday_fees', 'holiday_enrollments', 'holiday_subjects',
];
 
/* ─────────────────────────────────────────────────────────────────
   TERM STATUS OPTIONS  (Part 2.3)
   ───────────────────────────────────────────────────────────────── */
 
const TERM_STATUSES = ['upcoming', 'in_progress', 'completed'];
 
/* ─────────────────────────────────────────────────────────────────
   HOLIDAY TYPE OPTIONS  (Part 2.4)
   ───────────────────────────────────────────────────────────────── */
 
const HOLIDAY_TYPES = ['Public Holiday', 'Vacation', 'Event'];
 
/* ─────────────────────────────────────────────────────────────────
   RWANDA PUBLIC HOLIDAYS  (recurring, by MM-DD)
   Used by importRwandaHolidays() in settings/holidays.js
   ───────────────────────────────────────────────────────────────── */
 
const RWANDA_PUBLIC_HOLIDAYS = [
    { name: 'New Year\'s Day',            month: 1,  day: 1  },
    { name: 'Heroes\' Day',               month: 2,  day: 1  },
    { name: 'International Women\'s Day', month: 3,  day: 8  },
    { name: 'Genocide Memorial Day',      month: 4,  day: 7  },
    { name: 'Good Friday',                month: 4,  day: 18, variable: true },
    { name: 'Easter Monday',              month: 4,  day: 21, variable: true },
    { name: 'Labour Day',                 month: 5,  day: 1  },
    { name: 'Liberation Day',             month: 7,  day: 4  },
    { name: 'Umuganura Day',              month: 8,  day: 1  },
    { name: 'Assumption Day',             month: 8,  day: 15 },
    { name: 'Christmas Day',              month: 12, day: 25 },
    { name: 'Boxing Day',                 month: 12, day: 26 },
];

// ──────────────────────────────────────────────────────────────────────
// COLOR PALETTES
// ──────────────────────────────────────────────────────────────────────

const SUBJECT_COLOR_PALETTE = [
  '#6a8aba',   // Blue
  '#8a6aaa',   // Purple
  '#5a8a6a',   // Green
  '#c9a84c',   // Gold
  '#c45a4a',   // Red
  '#4a8a9a',   // Cyan
  '#5a7a6a',   // Teal
  '#9a7a8a',   // Mauve
  '#c57586',   // Rose
  '#d9aa4b',   // Amber
  '#7a9a6a',   // Olive
  '#6a7a9a',   // Slate
];

const TEACHER_COLOR_PALETTE = [
  '#8a9aba',   // Light blue
  '#9a7aba',   // Light purple
  '#7aaa8a',   // Light green
  '#d9ba6a',   // Light gold
  '#d46a5a',   // Light red
  '#6a9aaa',   // Light cyan
  '#7a9a8a',   // Light teal
  '#aa8a9a',   // Light mauve
  '#d58a9a',   // Light rose
  '#e8c86a',   // Light amber
  '#8aaa7a',   // Light olive
  '#7a8aaa',   // Light slate
];

// ──────────────────────────────────────────────────────────────────────
// MODULE ACCENT COLORS
// ──────────────────────────────────────────────────────────────────────

const MODULE_ACCENTS = {
  dashboard: '#6a8aba',
  academics: '#8a6aaa',
  finance: '#5a8a6a',
  attendance: '#c9a84c',
  students: '#4a8a9a',
  staff: '#c45a4a',
  communication: '#7a6aaa',
  analytics: '#5a7a8a',
  system: '#6a7a8a',
  settings: '#8a7a6a',
  bulk: '#9a8a7a',
  reports: '#c57586',
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
  RECEIPT_FORMAT: 'receipt_format',
  RECEIPT_INCLUDE_LOGO: 'receipt_include_logo',
  RECEIPT_INCLUDE_SIGNATURES: 'receipt_include_signatures',
  RECEIPT_AUTO_PRINT: 'receipt_auto_print',
};

// ──────────────────────────────────────────────────────────────────────
// FILE UPLOAD
// ──────────────────────────────────────────────────────────────────────

const MAX_UPLOAD_SIZE_MB = 10;
const SUPPORTED_IMPORT_FORMATS = ['.xlsx', '.xls', '.csv'];

// ──────────────────────────────────────────────────────────────────────
// HELP CENTER
// ──────────────────────────────────────────────────────────────────────

const HELP_CONFIG = {
  maxRecentItems: 10,
  searchDebounce: 200,
  shortcuts: {
    open: 'Ctrl+K',
    close: 'Escape',
  }
};

// ──────────────────────────────────────────────────────────────────────
// LANGUAGE HELPERS
// ──────────────────────────────────────────────────────────────────────

const CLASS_LEVEL_NAMES = {
  nursery: ['NURSERY 1', 'NURSERY 2', 'NURSERY 3'],
  primary: ['PRIMARY 1', 'PRIMARY 2', 'PRIMARY 3', 'PRIMARY 4', 'PRIMARY 5', 'PRIMARY 6']
};

/**
 * Determine language for a class level
 * Nursery → French (fr), Primary → English (en)
 */
function languageForClassLevel(className) {
  if (!className) return 'en';
  const upper = className.toUpperCase();
  if (CLASS_LEVEL_NAMES.nursery.some(n => n === upper)) return 'fr';
  return 'en';
}

/**
 * Check if a class is Nursery level
 */
function isNurseryClass(className) {
  if (!className) return false;
  const upper = className.toUpperCase();
  return CLASS_LEVEL_NAMES.nursery.some(n => n === upper);
}

/**
 * Check if a class is Primary level
 */
function isPrimaryClass(className) {
  if (!className) return false;
  const upper = className.toUpperCase();
  return CLASS_LEVEL_NAMES.primary.some(n => n === upper);
}

// ──────────────────────────────────────────────────────────────────────
// EXPOSE TO WINDOW (for inline onclick handlers)
// ──────────────────────────────────────────────────────────────────────

if (typeof window !== 'undefined') {
  window.APP_CONFIG = APP_CONFIG;
  window.APP_NAME = APP_NAME;
  window.APP_VERSION = APP_VERSION;
  window.APP_META = APP_META;
  window.CURRENCY = CURRENCY;
  window.CLASS_LEVELS = CLASS_LEVELS;
  window.ALL_CLASS_NAMES = ALL_CLASS_NAMES;
  window.DEFAULT_GRADES = DEFAULT_GRADES;
  window.DEFAULT_PASS_MARK = DEFAULT_PASS_MARK;
  window.PROMOTION_MAP = PROMOTION_MAP;
  window.STORAGE_KEYS = STORAGE_KEYS;
  window.USER_ROLES = USER_ROLES;
  window.USER_ROLE_LABELS = USER_ROLE_LABELS;
  window.ASSESSMENT_TYPES = ASSESSMENT_TYPES;
  window.PAYMENT_METHODS = PAYMENT_METHODS;
  window.STUDENT_STATUSES = STUDENT_STATUSES;
  window.GENDER_OPTIONS = GENDER_OPTIONS;
  window.TIMETABLE_DAYS = TIMETABLE_DAYS;
  window.TIMETABLE_TIME_SLOTS = TIMETABLE_TIME_SLOTS;
  window.Z_INDEX = Z_INDEX;
  window.NOTIFICATION_TYPES = NOTIFICATION_TYPES;
  window.NOTIFICATION_PRIORITY = NOTIFICATION_PRIORITY;
  window.MODULE_ACCENTS = MODULE_ACCENTS;
  window.SUBJECT_COLOR_PALETTE = SUBJECT_COLOR_PALETTE;
  window.TEACHER_COLOR_PALETTE = TEACHER_COLOR_PALETTE;
  window.isBreakSlot = isBreakSlot;
  window.getBreakIcon = getBreakIcon;
  window.languageForClassLevel = languageForClassLevel;
  window.isNurseryClass = isNurseryClass;
  window.isPrimaryClass = isPrimaryClass;
}