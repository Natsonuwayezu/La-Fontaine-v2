'use strict';

/**
 * ECOLE LA FONTAINE — Help Center Data
 * All help content, categories, articles, and quick actions
 * Last updated: 2026-07-06
 */

// ──────────────────────────────────────────────────────────────────────
// HELP CATEGORIES
// ──────────────────────────────────────────────────────────────────────

const HELP_CATEGORIES = [
    { id: 'getting-started', label: '🚀 Getting Started', icon: 'fa-rocket', color: '#3b82f6' },
    { id: 'academics', label: '📚 Academics', icon: 'fa-graduation-cap', color: '#f59e0b' },
    { id: 'finance', label: '💰 Finance', icon: 'fa-sack-dollar', color: '#10b981' },
    { id: 'students', label: '👥 Students', icon: 'fa-users', color: '#8b5cf6' },
    { id: 'staff', label: '👨‍🏫 Staff', icon: 'fa-chalkboard-user', color: '#ef4444' },
    { id: 'settings', label: '⚙️ Settings', icon: 'fa-gear', color: '#64748b' },
    { id: 'troubleshooting', label: '🔧 Troubleshooting', icon: 'fa-wrench', color: '#f97316' },
];

// ──────────────────────────────────────────────────────────────────────
// HELP ARTICLES
// ──────────────────────────────────────────────────────────────────────

const HELP_ARTICLES = [
    {
        id: 'getting-started-1',
        category: 'getting-started',
        title: 'Welcome to ECOLE LA FONTAINE',
        summary: 'Overview of the school management system and how to navigate it.',
        icon: 'fa-house',
        color: '#3b82f6',
        steps: [
            'Login with your credentials',
            'Use the sidebar to navigate between modules',
            'The dashboard gives you an overview of key metrics',
            'Use Ctrl+K to open the help center anytime'
        ]
    },
    {
        id: 'getting-started-2',
        category: 'getting-started',
        title: 'Understanding Your Dashboard',
        summary: 'Learn about the different dashboard views for Admin, Teacher, and Accountant.',
        icon: 'fa-gauge-high',
        color: '#3b82f6'
    },
    {
        id: 'marks-entry',
        category: 'academics',
        title: 'How to Enter Marks',
        summary: 'Step-by-step guide to entering student marks for assessments.',
        icon: 'fa-pencil',
        color: '#f59e0b',
        steps: [
            'Select a class from the dropdown',
            'Choose a subject',
            'Select or create an assessment',
            'Enter scores for each student',
            'Click "Save" to save all marks'
        ]
    },
    {
        id: 'class-register',
        category: 'academics',
        title: 'Viewing the Class Register',
        summary: 'Access and export class registers in 6 different formats.',
        icon: 'fa-table-list',
        color: '#f59e0b'
    },
    {
        id: 'report-cards',
        category: 'academics',
        title: 'Generating Report Cards',
        summary: 'Create individual and batch report cards with QR codes.',
        icon: 'fa-file-invoice',
        color: '#f59e0b'
    },
    {
        id: 'record-payment',
        category: 'finance',
        title: 'Recording a Payment',
        summary: 'How to record fee payments and generate receipts.',
        icon: 'fa-money-bill-wave',
        color: '#10b981',
        steps: [
            'Search for the student',
            'Select the fees to pay',
            'Enter the payment amount',
            'Choose payment method',
            'Click "Record Payment" to save'
        ]
    },
    {
        id: 'fee-structure',
        category: 'finance',
        title: 'Managing Fee Structure',
        summary: 'Set up fee categories and amounts per class and year.',
        icon: 'fa-list-ol',
        color: '#10b981'
    },
    {
        id: 'overdue-payments',
        category: 'finance',
        title: 'Handling Overdue Payments',
        summary: 'Track and manage overdue student fees with severity alerts.',
        icon: 'fa-triangle-exclamation',
        color: '#10b981'
    },
    {
        id: 'enroll-student',
        category: 'students',
        title: 'Enrolling a New Student',
        summary: 'Complete enrollment process with fee assignment and family linking.',
        icon: 'fa-user-plus',
        color: '#8b5cf6'
    },
    {
        id: 'student-promotion',
        category: 'students',
        title: 'Student Promotion',
        summary: 'End-of-year promotion and class progression workflow.',
        icon: 'fa-arrow-up-right-dots',
        color: '#8b5cf6'
    },
    {
        id: 'timetable',
        category: 'staff',
        title: 'Managing Timetables',
        summary: 'Create and manage class and teacher timetables.',
        icon: 'fa-calendar-days',
        color: '#ef4444'
    },
    {
        id: 'teacher-assignments',
        category: 'staff',
        title: 'Teacher Assignments',
        summary: 'Assign teachers to classes and subjects.',
        icon: 'fa-person-chalkboard',
        color: '#ef4444'
    },
    {
        id: 'backup-restore',
        category: 'settings',
        title: 'Backup & Restore',
        summary: 'Backup your data and restore from previous backups.',
        icon: 'fa-hard-drive',
        color: '#64748b'
    },
    {
        id: 'system-logs',
        category: 'settings',
        title: 'System Logs',
        summary: 'View and export system activity logs for audit purposes.',
        icon: 'fa-list-check',
        color: '#64748b'
    },
    {
        id: 'api-settings',
        category: 'settings',
        title: 'API Settings',
        summary: 'Configure Supabase connection settings.',
        icon: 'fa-plug',
        color: '#64748b'
    },
    {
        id: 'attendance',
        category: 'troubleshooting',
        title: 'Recording Attendance',
        summary: 'Mark daily attendance with bulk options.',
        icon: 'fa-clipboard-check',
        color: '#f97316'
    },
    {
        id: 'offline-mode',
        category: 'troubleshooting',
        title: 'Offline Mode',
        summary: 'How the system works without internet connection.',
        icon: 'fa-wifi-slash',
        color: '#f97316'
    },
];

// ──────────────────────────────────────────────────────────────────────
// QUICK ACTIONS
// ──────────────────────────────────────────────────────────────────────

const QUICK_ACTIONS = [
    {
        id: 'reset-password',
        label: 'Reset Password',
        desc: 'Change your account password',
        icon: 'fa-key',
        color: '#3b82f6',
        bg: 'rgba(59,130,246,0.12)'
    },
    {
        id: 'change-theme',
        label: 'Change Theme',
        desc: 'Switch between light / dark mode',
        icon: 'fa-moon',
        color: '#8b5cf6',
        bg: 'rgba(139,92,246,0.12)'
    },
    {
        id: 'insert-marks',
        label: 'Insert Marks',
        desc: 'Enter marks for a subject / class',
        icon: 'fa-pencil',
        color: '#f59e0b',
        bg: 'rgba(245,158,11,0.12)'
    },
    {
        id: 'record-payment',
        label: 'Record Payment',
        desc: 'Log a fee payment transaction',
        icon: 'fa-money-bill-wave',
        color: '#10b981',
        bg: 'rgba(16,185,129,0.12)'
    },
    {
        id: 'record-attendance',
        label: 'Record Attendance',
        desc: 'Mark daily attendance by class',
        icon: 'fa-clipboard-check',
        color: '#14b8a6',
        bg: 'rgba(20,184,166,0.12)'
    },
    {
        id: 'view-timetable',
        label: 'My Timetable',
        desc: 'View your weekly class schedule',
        icon: 'fa-calendar-days',
        color: '#ef4444',
        bg: 'rgba(239,68,68,0.12)'
    },
    {
        id: 'print-receipt',
        label: 'Print Receipt',
        desc: 'Generate and print a payment receipt',
        icon: 'fa-receipt',
        color: '#f97316',
        bg: 'rgba(249,115,22,0.12)'
    },
    {
        id: 'view-register',
        label: 'View Class Register',
        desc: 'See full class performance register',
        icon: 'fa-table-list',
        color: '#6366f1',
        bg: 'rgba(99,102,241,0.12)'
    },
];

// ──────────────────────────────────────────────────────────────────────
// RECENTLY ACCESSED (Default)
// ──────────────────────────────────────────────────────────────────────

const RECENTLY_ACCESSED = [
    {
        moduleId: 'marks-entry',
        label: 'Marks Entry',
        desc: 'Primary 4A · Mathematics',
        icon: 'fa-pencil',
        color: '#60a5fa',
        bg: 'rgba(59,130,246,0.12)',
        badge: 'now'
    },
    {
        moduleId: 'student-details',
        label: 'Student Profile',
        desc: 'MUGISHA Jean · P4A',
        icon: 'fa-user',
        color: '#34d399',
        bg: 'rgba(16,185,129,0.12)',
        badge: '2m'
    },
    {
        moduleId: 'record-payment',
        label: 'Record Payment',
        desc: 'Fee for Term 3',
        icon: 'fa-money-bill-wave',
        color: '#fbbf24',
        bg: 'rgba(245,158,11,0.12)',
        badge: '5m'
    },
    {
        moduleId: 'analytics',
        label: 'Analytics',
        desc: 'Term 3 Performance',
        icon: 'fa-chart-line',
        color: '#a78bfa',
        bg: 'rgba(139,92,246,0.12)',
        badge: '12m'
    },
    {
        moduleId: 'timetable',
        label: 'Timetable',
        desc: 'Class P4A · Week 8',
        icon: 'fa-calendar-days',
        color: '#f472b6',
        bg: 'rgba(236,72,153,0.12)',
        badge: '1h'
    },
    {
        moduleId: 'receipts',
        label: 'Receipts',
        desc: 'Last 7 days',
        icon: 'fa-receipt',
        color: '#38bdf8',
        bg: 'rgba(56,189,248,0.12)',
        badge: '2h'
    },
];
