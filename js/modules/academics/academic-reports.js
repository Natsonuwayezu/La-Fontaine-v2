/* ═══════════════════════════════════════════════════════════════════
   js/modules/academics/academic-reports.js
   ═══════════════════════════════════════════════════════════════════
   Rendered into #mainContent by core/router.js for 'academic-reports'.

   The Academics section landing page — a card grid linking to every
   other academics module (marks entry/database, assessments,
   registers, statistics, rankings, report generation, transcripts).
   This file has no legacy version to port from (new in the v2 plan)
   so it's built directly against css/modules/reports.css's
   report-type-grid/report-type-card components, reused here as a
   navigation hub rather than a report-type picker.

   Loaded as a plain <script> — no import/export.

   Last updated: 2026-07-14
   ═══════════════════════════════════════════════════════════════════ */

(function () {
    'use strict';

    const esc = window.esc || function (s) { return String(s == null ? '' : s); };

    // ─── HUB SECTIONS ────────────────────────────────────────────────

    const SECTIONS = [
        {
            title: 'Marks',
            items: [
                { nav: 'marks-entry', icon: 'fa-pen-to-square', label: 'Marks Entry', sub: 'Enter scores per assessment' },
                { nav: 'marks-database', icon: 'fa-database', label: 'Marks Database', sub: 'Browse all recorded marks' },
                { nav: 'marks-analysis', icon: 'fa-magnifying-glass-chart', label: 'Marks Analysis', sub: 'Trends & subject comparison' },
                { nav: 'marks-import-export', icon: 'fa-file-import', label: 'Import / Export', sub: 'Bulk CSV marks in and out' }
            ]
        },
        {
            title: 'Assessments',
            items: [
                { nav: 'assessments', icon: 'fa-clipboard-list', label: 'Assessments', sub: 'Create & manage assessments' },
                { nav: 'assessment-locking', icon: 'fa-lock', label: 'Assessment Locking', sub: 'Bulk lock / unlock' }
            ]
        },
        {
            title: 'Registers',
            items: [
                { nav: 'class-register', icon: 'fa-table-list', label: 'Class Register', sub: 'Per-phase register grid' },
                { nav: 'annual-register', icon: 'fa-calendar-days', label: 'Annual Register', sub: 'Full-year rollup' },
                { nav: 'register-export', icon: 'fa-file-export', label: 'Register Export', sub: 'Batch export registers' }
            ]
        },
        {
            title: 'Statistics & Rankings',
            items: [
                { nav: 'statistics', icon: 'fa-chart-simple', label: 'Statistics', sub: 'Comparisons & heatmap' },
                { nav: 'rankings', icon: 'fa-ranking-star', label: 'Rankings', sub: 'Class, subject & school' }
            ]
        },
        {
            title: 'Reports',
            items: [
                { nav: 'report-cards', icon: 'fa-file-lines', label: 'Report Cards', sub: 'Single-student preview & print' },
                { nav: 'report-generator', icon: 'fa-layer-group', label: 'Report Generator', sub: 'Batch generation' },
                { nav: 'transcripts', icon: 'fa-scroll', label: 'Transcripts', sub: 'Multi-year academic record' }
            ]
        }
    ];

    let rootEl = null;

    // ─── RENDER ──────────────────────────────────────────────────────

    function renderAcademicReports(container) {
        if (!container) {
            console.warn('[AcademicReports] No container provided');
            return;
        }
        rootEl = container;

        container.innerHTML =
            '<div class="academic-reports-page">' +
                SECTIONS.map(function (section) {
                    return (
                        '<div class="reports-section" style="margin-bottom:22px;">' +
                            '<div class="reports-section__title" style="font-weight:700;font-size:0.85rem;margin-bottom:10px;">' + esc(section.title) + '</div>' +
                            '<div class="report-type-grid">' +
                                section.items.map(function (item) {
                                    return (
                                        '<div class="report-type-card" data-nav="' + item.nav + '">' +
                                            '<div class="report-type-card__icon"><i class="fa-solid ' + item.icon + '"></i></div>' +
                                            '<div class="report-type-card__title">' + esc(item.label) + '</div>' +
                                            '<div class="report-type-card__desc">' + esc(item.sub) + '</div>' +
                                        '</div>'
                                    );
                                }).join('') +
                            '</div>' +
                        '</div>'
                    );
                }).join('') +
            '</div>';

        wireCards();
    }

    function wireCards() {
        Array.prototype.forEach.call(rootEl.querySelectorAll('[data-nav]'), function (card) {
            card.style.cursor = 'pointer';
            card.addEventListener('click', function () {
                const target = card.dataset.nav;
                if (window.navigateTo) {
                    window.navigateTo(target);
                } else {
                    notify('Router not available yet — cannot navigate to ' + target, 'warning');
                }
            });
        });
    }

    // ─── TOAST HELPER ────────────────────────────────────────────────

    function notify(message, type) {
        if (typeof window.showToast === 'function') {
            window.showToast(message, type || 'info');
        }
    }

    // ─── DESTROY ─────────────────────────────────────────────────────

    function destroyAcademicReports() {
        rootEl = null;
    }

    // ─── EXPOSE ──────────────────────────────────────────────────────

    window.renderAcademicReports = async (container, params = {}) => {
    if (params && params.classId && typeof canAccessClass === 'function' && !canAccessClass(params.classId)) {
        if (container) container.innerHTML = `<div class="module-wrap"><div class="alert alert-danger" style="margin:24px;">
            <i class="fa-solid fa-lock"></i>
            <strong>Access denied</strong></div></div>`;
        return;
    }
    return renderAcademicReports(container, params);
};
    window.destroyAcademicReports = destroyAcademicReports;
})();
