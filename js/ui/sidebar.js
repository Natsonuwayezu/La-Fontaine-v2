/**
 * ECOLE LA FONTAINE — Sidebar Component v3
 * Matches topbar-sidebar.html design
 * Last updated: 2026-07-07
 */

import { state, setYearFilter, getCurrentAcademicYear, getTermsByYear } from '../core/state.js';
import { navigateTo } from '../core/router.js';
import { refreshYearData } from '../core/boot.js';
import { esc } from '../core/utils.js';
import { STORAGE_KEYS } from '../config/constants.js';
import { showToast } from './toast.js';

// ──────────────────────────────────────────────────────────────────────
// NAV_SECTIONS — Navigation data matching topbar-sidebar.html
// ──────────────────────────────────────────────────────────────────────

export const NAV_SECTIONS = {
    dashboard: {
        label: 'Dashboard',
        icon: 'fa-table-cells-large',
        color: '#3b82f6',
        bg: 'rgba(59,130,246,0.15)',
        desc: 'Your central command center. Quick access to all role-specific dashboards and live school metrics.',
        items: [
            { id: 'admin-dashboard', label: 'Admin Dashboard', icon: 'fa-gauge-high', desc: 'School-wide overview with key metrics, attendance today, and recent activity' },
            { id: 'accountant-dashboard', label: 'Accountant Dashboard', icon: 'fa-chart-pie', desc: 'Collection rates, overdue alerts, today\'s payments, and balance summary' },
            { id: 'teacher-dashboard', label: 'Teacher Dashboard', icon: 'fa-table', desc: 'My classes, pending marks, next periods, and students without marks' },
            { id: 'analytics', label: 'Academic Analytics', icon: 'fa-chart-line', desc: 'Performance trends, subject analysis, class comparisons, and grade distribution' },
            { id: 'finance-dashboard', label: 'Finance Dashboard', icon: 'fa-sack-dollar', desc: 'Real-time financial overview with collection trends and fee status' },
        ]
    },
    comms: {
        label: 'Communication',
        icon: 'fa-comments',
        color: '#3b82f6',
        bg: 'rgba(59,130,246,0.15)',
        desc: 'School-wide communication tools — notifications, announcements, and personal reminders.',
        items: [
            { id: 'notifications', label: 'Notifications', icon: 'fa-bell', desc: 'Inbox for system alerts, payment confirmations, and marks updates' },
            { id: 'announcements', label: 'Announcements', icon: 'fa-bullhorn', desc: 'Create and publish school-wide announcements with read tracking' },
            { id: 'reminders', label: 'Reminders', icon: 'fa-clock', desc: 'Personal and scheduled task reminders with due dates and completion tracking' },
        ]
    },
    attendance: {
        label: 'Attendance',
        icon: 'fa-clipboard-check',
        color: '#10b981',
        bg: 'rgba(16,185,129,0.15)',
        desc: 'Record, monitor, and analyze daily student attendance with holiday-aware calculations.',
        items: [
            { id: 'attendance', label: 'Record Attendance', icon: 'fa-pen-to-square', desc: 'Mark daily attendance with bulk Present/Absent/Late/Excused options' },
            { id: 'attendance-reports', label: 'Reports', icon: 'fa-file-lines', desc: 'Generate attendance reports by class, date range, and export to Excel' },
            { id: 'attendance-summary', label: 'Summary', icon: 'fa-chart-bar', desc: 'Attendance rates per student and class, flagging at-risk students below 75%' },
            { id: 'attendance-analytics', label: 'Analytics', icon: 'fa-chart-line', desc: 'Attendance trends, patterns, and predictive insights over time' },
        ]
    },
    students: {
        label: 'Students',
        icon: 'fa-users',
        color: '#8b5cf6',
        bg: 'rgba(139,92,246,0.15)',
        desc: 'Manage the complete student lifecycle — from enrollment to graduation, families, and archives.',
        items: [
            { id: 'student-list', label: 'All Students', icon: 'fa-users', desc: 'Search, filter, and manage all enrolled students by class or status' },
            { id: 'enroll-student', label: 'Enroll Student', icon: 'fa-user-plus', desc: 'Register new students with auto-generated codes and automatic fee assignment' },
            { id: 'student-details', label: 'Student Profile', icon: 'fa-id-card', desc: 'Full profile with academic records, fee history, and family information' },
            { id: 'family-management', label: 'Family Management', icon: 'fa-house-chimney-user', desc: 'Create family groups, link siblings, and apply family discounts automatically' },
            { id: 'student-archive', label: 'Archive', icon: 'fa-box-archive', desc: 'View graduated or transferred students and restore if needed' },
            { id: 'student-fee-status', label: 'Student Fee Status', icon: 'fa-coins', desc: 'Live balance view with outstanding and credit amounts per student' },
        ]
    },
    academics: {
        label: 'Academics',
        icon: 'fa-graduation-cap',
        color: '#f59e0b',
        bg: 'rgba(245,158,11,0.15)',
        desc: 'Complete academic workflow — assessments, marks entry, registers, report cards, and transcripts.',
        items: [
            { id: 'assessments', label: 'Assessments', icon: 'fa-clipboard-list', desc: 'Create, manage, and lock assessments by class, subject, and term' },
            { id: 'marks-entry', label: 'Marks Entry', icon: 'fa-pencil', desc: 'Enter student marks with live validation, inline popup on errors, and batch save' },
            { id: 'marks-database', label: 'Marks Database', icon: 'fa-database', desc: 'Browse, search, and edit all marks across assessments and classes' },
            { id: 'class-register', label: 'Class Register', icon: 'fa-table-list', desc: 'Full class registers in 6 layouts: Pre/Post/Annual for Nursery and Primary' },
            { id: 'report-cards', label: 'Report Cards', icon: 'fa-file-invoice', desc: 'Generate individual and batch report cards with QR codes and decision banners' },
            { id: 'transcripts', label: 'Transcripts', icon: 'fa-scroll', desc: 'Full academic history transcripts with cumulative results and annual totals' },
            { id: 'statistics', label: 'Statistics', icon: 'fa-chart-pie', desc: 'Compare performance by subject, class, and term with detailed charts' },
        ]
    },
    finance: {
        label: 'Finance',
        icon: 'fa-sack-dollar',
        color: '#10b981',
        bg: 'rgba(16,185,129,0.15)',
        desc: 'Full financial management — fee collection, receipts, waivers, overdue alerts, and reporting.',
        items: [
            { id: 'finance-dashboard', label: 'Finance Dashboard', icon: 'fa-chart-column', desc: 'Financial overview with collection rates, overdue alerts, and recent payments' },
            { id: 'fee-structure', label: 'Fee Structure', icon: 'fa-list-ol', desc: 'Manage fee categories, set amounts per class/year, and copy from previous year' },
            { id: 'record-payment', label: 'Record Payment', icon: 'fa-money-bill-wave', desc: 'Record incoming payments with FIFO auto-allocation and instant receipt generation' },
            { id: 'payment-history', label: 'Payment History', icon: 'fa-clock-rotate-left', desc: 'Full transaction history with filters by student, class, date, and method' },
            { id: 'receipts', label: 'Receipts', icon: 'fa-receipt', desc: 'Print, reprint, and export payment receipts in standard or thermal format' },
            { id: 'fee-waivers', label: 'Waivers / Discounts', icon: 'fa-tag', desc: 'Apply full, partial, or percentage fee waivers with reason and audit trail' },
            { id: 'payment-reversals', label: 'Reversals', icon: 'fa-rotate-left', desc: 'Reverse incorrect payments with full audit trail and balance recalculation' },
            { id: 'finance-audit', label: 'Finance Audit', icon: 'fa-magnifying-glass-chart', desc: 'Audit trail for all financial transactions' },
            { id: 'fee-term-status', label: 'Fee Term Status', icon: 'fa-calendar-check', desc: 'Fee payment status by term with class and student filters' },
            { id: 'student-fee-status', label: 'Student Fee Status', icon: 'fa-wallet', desc: 'Detailed fee payment status per student with filters' },
            { id: 'family-fee-summary', label: 'Family Fee Summary', icon: 'fa-users-rectangle', desc: 'Fee summary by family group with total balances' },
            { id: 'carry-forward', label: 'Carry Forward', icon: 'fa-forward', desc: 'Carry outstanding balances to the next term or academic year' },
        ]
    },
    staff: {
        label: 'Staff',
        icon: 'fa-chalkboard-user',
        color: '#ef4444',
        bg: 'rgba(239,68,68,0.15)',
        desc: 'Manage staff accounts, subject assignments, performance tracking, and the master timetable.',
        items: [
            { id: 'user-management', label: 'User Management', icon: 'fa-users-gear', desc: 'Add, edit, and manage teacher and accountant accounts with role permissions' },
            { id: 'class-management', label: 'Class / Subjects', icon: 'fa-book', desc: 'Manage class names, levels, sort order, and class teacher assignments' },
            { id: 'teacher-assignments', label: 'Teacher Assignments', icon: 'fa-person-chalkboard', desc: 'Assign teachers to classes and subjects with a visual matrix view' },
            { id: 'teacher-performance', label: 'Teacher Performance', icon: 'fa-chart-line', desc: 'Track marks completion rates, on-time entry, and class averages by teacher' },
            { id: 'timetable', label: 'Timetable', icon: 'fa-calendar-days', desc: 'Master timetable grid with class, teacher, and conflict detection views' },
        ]
    },
    bulk: {
        label: 'Bulk Operations',
        icon: 'fa-layer-group',
        color: '#94a3b8',
        bg: 'rgba(148,163,184,0.12)',
        desc: 'Mass operations — import data from Excel, export reports, and run year-end workflows.',
        items: [
            { id: 'bulk-import', label: 'Bulk Import', icon: 'fa-file-import', desc: 'Import students, marks, payments, and teachers from Excel spreadsheets' },
            { id: 'bulk-export', label: 'Bulk Export', icon: 'fa-file-export', desc: 'Export students, marks, receipts, and full DB backup to Excel or JSON' },
            { id: 'student-promotion', label: 'Student Promotion', icon: 'fa-arrow-up-right-dots', desc: 'Promote or repeat students at end of year with batch processing' },
            { id: 'carry-forward', label: 'Carry Forward', icon: 'fa-forward', desc: 'Carry outstanding balances to the next term or academic year' },
        ]
    },
    settings: {
        label: 'Settings',
        icon: 'fa-gear',
        color: '#64748b',
        bg: 'rgba(100,116,139,0.12)',
        desc: 'System configuration — school profile, academic years, grading rules, and maintenance tools.',
        items: [
            { id: 'school-settings', label: 'School Settings', icon: 'fa-school', desc: 'School name, logo, head teacher, contact details, and branding' },
            { id: 'academic-calendar', label: 'Academic Calendar', icon: 'fa-calendar', desc: 'Create and manage academic years, terms, and midterm dates' },
            { id: 'grading-scale', label: 'Grading Settings', icon: 'fa-star-half-stroke', desc: 'Define grade boundaries (A, B, C...), colors, and the school pass mark' },
            { id: 'backup-restore', label: 'Backup & Restore', icon: 'fa-hard-drive', desc: 'Full database backup to JSON, auto-backup scheduling, and restore' },
            { id: 'system-logs', label: 'System Logs', icon: 'fa-list-check', desc: 'Audit trail of all user actions, logins, and data changes' },
            { id: 'system-settings', label: 'System / API Settings', icon: 'fa-plug', desc: 'Supabase URL and key configuration, connection testing' },
            { id: 'system-health', label: 'System Health', icon: 'fa-heart-pulse', desc: 'Monitor app performance, database connectivity, and service status' },
        ]
    },
    help: {
        label: 'Help & Support',
        icon: 'fa-circle-question',
        color: '#f59e0b',
        bg: 'rgba(245,158,11,0.12)',
        desc: 'Find help, search the system, and get support.',
        items: [
            { id: 'help-center', label: 'Help Center', icon: 'fa-circle-question', desc: 'Search and find help' },
            { id: 'faq', label: 'FAQ', icon: 'fa-list', desc: 'Frequently asked questions' },
            { id: 'support', label: 'Contact Support', icon: 'fa-envelope', desc: 'Get help from the support team' },
        ]
    },
};

// ──────────────────────────────────────────────────────────────────────
// STATE
// ──────────────────────────────────────────────────────────────────────

let openGroup = null;

// ──────────────────────────────────────────────────────────────────────
// BUILD SIDEBAR
// ──────────────────────────────────────────────────────────────────────

export function buildSidebar(role) {
    const navContainer = document.getElementById('sidebarNav');
    if (!navContainer) return;

    navContainer.innerHTML = '';

    const sectionOrder = ['dashboard', 'comms', 'attendance', 'students', 'academics', 'finance', 'staff', 'bulk', 'settings', 'help'];
    let firstSection = true;

    for (const key of sectionOrder) {
        const sec = NAV_SECTIONS[key];
        if (!sec) continue;

        const accessibleItems = sec.items.filter(item => {
            if (role === 'teacher' && isTeacherBlocked(item.id)) return false;
            if (role === 'accountant' && isAccountantBlocked(item.id)) return false;
            return true;
        });

        if (accessibleItems.length === 0) continue;

        // Add section label
        if (!firstSection) {
            const label = document.createElement('div');
            label.className = 'nav-section-label';
            label.textContent = key === 'help' ? 'SUPPORT' : key.toUpperCase();
            navContainer.appendChild(label);
        }
        firstSection = false;

        const groupId = `grp-${key}`;
        const childId = `ch-${key}`;
        const isOpen = key === 'dashboard' || key === 'students' || key === 'academics' || key === 'finance';

        const group = document.createElement('div');
        group.className = 'nav-group';
        group.id = groupId;

        // Build SVG icon
        const iconSvg = getIconSvg(key);

        group.innerHTML = `
            <div class="nav-group-header ${isOpen ? 'open' : ''}" onclick="window.toggleGroup('${key}')">
                ${iconSvg}
                <span class="label">${sec.label}</span>
                <svg class="nav-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="9 18 15 12 9 6" />
                </svg>
            </div>
            <div class="nav-children ${isOpen ? 'open' : ''}" id="${childId}">
                <div class="nav-children-inner">
                    ${accessibleItems.map(item => `
                        <div class="nav-child" data-module="${item.id}" onclick="window.navigateTo('${item.id}')">
                            <span class="child-dot"></span>
                            <span class="child-label">${item.label}</span>
                            ${item.id === 'notifications' ? '<span class="child-badge" id="sidebarNotifBadge">3</span>' : ''}
                        </div>
                    `).join('')}
                </div>
            </div>
        `;

        navContainer.appendChild(group);
    }

    // Update user info
    updateSidebarUser(state.currentUser);

    // Restore group state
    restoreGroupState();

    // Set active nav
    const lastModule = localStorage.getItem(STORAGE_KEYS.MODULE);
    if (lastModule) setActiveNav(lastModule);

    console.log('✅ Sidebar built for role:', role);
}

// ──────────────────────────────────────────────────────────────────────
// GET ICON SVG
// ──────────────────────────────────────────────────────────────────────

function getIconSvg(key) {
    const icons = {
        dashboard: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>`,
        comms: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`,
        attendance: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>`,
        students: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87m-4-12a4 4 0 0 1 0 7.75"/></svg>`,
        academics: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c0 1.5 3 2.5 6 2.5s6-1 6-2.5v-5"/></svg>`,
        finance: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M8 12h8"/><path d="M12 8v8"/></svg>`,
        staff: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
        bulk: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>`,
        settings: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 2.83l-.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`,
        help: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`
    };
    return icons[key] || icons.dashboard;
}

// ──────────────────────────────────────────────────────────────────────
// TOGGLE GROUP
// ──────────────────────────────────────────────────────────────────────

export function toggleGroup(id) {
    const header = document.querySelector(`#grp-${id} .nav-group-header`);
    const children = document.getElementById(`ch-${id}`);
    if (!header || !children) return;

    const isOpen = children.classList.contains('open');

    if (openGroup && openGroup !== id) {
        const prevHeader = document.querySelector(`#grp-${openGroup} .nav-group-header`);
        const prevChildren = document.getElementById(`ch-${openGroup}`);
        if (prevHeader) prevHeader.classList.remove('open');
        if (prevChildren) prevChildren.classList.remove('open');
    }

    header.classList.toggle('open', !isOpen);
    children.classList.toggle('open', !isOpen);
    openGroup = isOpen ? null : id;

    saveGroupState();
}

// ──────────────────────────────────────────────────────────────────────
// GROUP STATE PERSISTENCE
// ──────────────────────────────────────────────────────────────────────

function saveGroupState() {
    const state = {};
    document.querySelectorAll('.nav-group').forEach(el => {
        const id = el.id.replace('grp-', '');
        const children = document.getElementById(`ch-${id}`);
        state[id] = children?.classList.contains('open') || false;
    });
    localStorage.setItem('sidebar_group_state', JSON.stringify(state));
}

function restoreGroupState() {
    try {
        const saved = localStorage.getItem('sidebar_group_state');
        if (!saved) return;
        const state = JSON.parse(saved);
        for (const [id, isOpen] of Object.entries(state)) {
            const children = document.getElementById(`ch-${id}`);
            const header = document.querySelector(`#grp-${id} .nav-group-header`);
            if (children && isOpen) {
                children.classList.add('open');
                if (header) header.classList.add('open');
                if (!openGroup) openGroup = id;
            }
        }
    } catch (e) { /* ignore */ }
}

// ──────────────────────────────────────────────────────────────────────
// ROLE-BASED ACCESS CONTROL
// ──────────────────────────────────────────────────────────────────────

function isTeacherBlocked(moduleId) {
    const blocked = [
        'finance-dashboard', 'fee-structure', 'record-payment', 'payment-history',
        'receipts', 'fee-waivers', 'payment-reversals', 'finance-audit',
        'fee-term-status', 'student-fee-status', 'family-fee-summary',
        'carry-forward', 'enroll-student', 'student-archive',
        'user-management', 'class-management', 'teacher-assignments',
        'teacher-performance', 'timetable', 'bulk-import', 'bulk-export',
        'student-promotion', 'school-settings', 'academic-calendar',
        'grading-scale', 'backup-restore', 'system-logs', 'system-settings',
        'system-health', 'analytics'
    ];
    return blocked.includes(moduleId);
}

function isAccountantBlocked(moduleId) {
    const blocked = [
        'marks-entry', 'marks-database', 'class-register', 'report-cards',
        'transcripts', 'statistics', 'assessments', 'teacher-performance',
        'timetable', 'enroll-student', 'student-archive',
        'user-management', 'class-management', 'teacher-assignments',
        'school-settings', 'academic-calendar', 'grading-scale',
        'backup-restore', 'system-logs', 'system-settings', 'system-health',
        'analytics', 'bulk-import', 'bulk-export', 'student-promotion'
    ];
    return blocked.includes(moduleId);
}

// ──────────────────────────────────────────────────────────────────────
// UPDATE SIDEBAR USER
// ──────────────────────────────────────────────────────────────────────

export function updateSidebarUser(user) {
    if (!user) return;

    const avatar = document.getElementById('sidebarUserAvatar');
    const name = document.getElementById('sidebarUserName');
    const role = document.getElementById('sidebarUserRole');

    const initials = user.name ? user.name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2) : 'U';
    if (avatar) avatar.textContent = initials || '👤';
    if (name) name.textContent = user.name || user.username || 'User';
    if (role) role.textContent = user.role ? (user.role.charAt(0).toUpperCase() + user.role.slice(1)) : '—';
}

// ──────────────────────────────────────────────────────────────────────
// SET ACTIVE NAV
// ──────────────────────────────────────────────────────────────────────

export function setActiveNav(id) {
    document.querySelectorAll('.nav-child.active').forEach(el => el.classList.remove('active'));

    const el = document.querySelector(`.nav-child[data-module="${id}"]`);
    if (el) {
        el.classList.add('active');
        const group = el.closest('.nav-group');
        if (group) {
            const groupId = group.id.replace('grp-', '');
            const children = document.getElementById(`ch-${groupId}`);
            const header = document.querySelector(`#grp-${groupId} .nav-group-header`);
            if (children && !children.classList.contains('open')) {
                children.classList.add('open');
                if (header) header.classList.add('open');
                openGroup = groupId;
                saveGroupState();
            }
        }
    }

    localStorage.setItem(STORAGE_KEYS.MODULE, id);
}

// ──────────────────────────────────────────────────────────────────────
// TOGGLE SIDEBAR (Mobile)
// ──────────────────────────────────────────────────────────────────────

export function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    if (!sidebar) return;

    if (window.innerWidth <= 820) {
        sidebar.classList.toggle('mobile-open');
        const overlay = document.getElementById('sidebarOverlay');
        if (sidebar.classList.contains('mobile-open')) {
            if (overlay) overlay.classList.add('show');
            document.body.style.overflow = 'hidden';
        } else {
            if (overlay) overlay.classList.remove('show');
            document.body.style.overflow = '';
        }
    } else {
        sidebar.classList.toggle('collapsed');
    }
}

export function closeSidebarMobile() {
    const sidebar = document.getElementById('sidebar');
    if (sidebar) sidebar.classList.remove('mobile-open');
    const overlay = document.getElementById('sidebarOverlay');
    if (overlay) overlay.classList.remove('show');
    document.body.style.overflow = '';
}

// ──────────────────────────────────────────────────────────────────────
// OPEN HUB
// ──────────────────────────────────────────────────────────────────────

export function openHub(sectionId) {
    const sec = NAV_SECTIONS[sectionId];
    if (!sec) return;

    const overlay = document.getElementById('hubOverlay');
    const title = document.getElementById('hubTitle');
    const sub = document.getElementById('hubSub');
    const iconEl = document.getElementById('hubHeaderIcon');
    const grid = document.getElementById('hubGrid');

    if (!overlay || !grid) return;

    title.textContent = sec.label;
    sub.textContent = sec.desc;

    if (iconEl) {
        iconEl.style.background = sec.bg;
        iconEl.style.color = sec.color;
        iconEl.innerHTML = `<i class="fa-solid ${sec.icon}" style="font-size:18px"></i>`;
    }

    grid.innerHTML = '';

    sec.items.forEach(item => {
        const card = document.createElement('div');
        card.className = 'hub-card';
        card.innerHTML = `
            <div class="hub-card-icon" style="background:${sec.bg};color:${sec.color}">
                <i class="fa-solid ${item.icon}"></i>
            </div>
            <div class="hub-card-title">${item.label}</div>
            <div class="hub-card-desc">${item.desc}</div>
        `;
        card.addEventListener('click', () => {
            closeHub();
            const child = document.querySelector(`.nav-child[data-module="${item.id}"]`);
            if (child) {
                document.querySelectorAll('.nav-child.active').forEach(el => el.classList.remove('active'));
                child.classList.add('active');
            }
            navigateTo(item.id);
            closeSidebarMobile();
        });
        grid.appendChild(card);
    });

    overlay.classList.add('show');
    document.body.style.overflow = 'hidden';
}

export function closeHub() {
    const overlay = document.getElementById('hubOverlay');
    if (overlay) overlay.classList.remove('show');
    document.body.style.overflow = '';
}

// ──────────────────────────────────────────────────────────────────────
// INIT SIDEBAR
// ──────────────────────────────────────────────────────────────────────

export function initSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebarOverlay');

    // Close on Escape
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape') {
            closeSidebarMobile();
            closeHub();
        }
    });

    // Window resize
    window.addEventListener('resize', () => {
        if (window.innerWidth > 820) {
            closeSidebarMobile();
        }
    });

    // Click outside to close
    document.addEventListener('click', e => {
        if (window.innerWidth <= 820) {
            const sidebar = document.getElementById('sidebar');
            if (sidebar?.classList.contains('mobile-open') &&
                !e.target.closest('.sidebar') &&
                !e.target.closest('#hamburgerBtn')) {
                closeSidebarMobile();
            }
        }
    });

    if (overlay) {
        overlay.addEventListener('click', closeSidebarMobile);
    }

    // Restore group state
    restoreGroupState();

    // Set active nav
    const lastModule = localStorage.getItem(STORAGE_KEYS.MODULE);
    if (lastModule) setActiveNav(lastModule);

    console.log('✅ Sidebar initialized');
}

// ──────────────────────────────────────────────────────────────────────
// EXPOSE GLOBALLY
// ──────────────────────────────────────────────────────────────────────

window.toggleSidebar = toggleSidebar;
window.toggleGroup = toggleGroup;
window.closeSidebarMobile = closeSidebarMobile;
window.openHub = openHub;
window.closeHub = closeHub;
window.navigateTo = navigateTo;
window.buildSidebar = buildSidebar;
window.initSidebar = initSidebar;
window.NAV_SECTIONS = NAV_SECTIONS;