/* ═══════════════════════════════════════════════════════════════════
   js/modules/academics/assessment-locking.js
   ═══════════════════════════════════════════════════════════════════
   Rendered into #mainContent by core/router.js for 'assessment-locking'.

   Bulk lock/unlock view — a dense table (not the card grid used in
   assessments.js) so an admin can select many assessments at once
   and freeze/unfreeze marks entry for them. Styled with
   css/components/tables.css (data-table, table-action-bar) and
   css/modules/assessments.css (lock-toggle, assessment-type-badge).

   Loaded as a plain <script> (not type="module") — no import/export.
   Shared helpers (esc, showToast) are read off window,
   set up by core/utils.js, ui/toast.js, and core/router.js respectively.

   MOCK_DATA stands in for the real Supabase table until core/api.js
   is wired up.

   Last updated: 2026-07-14
   ═══════════════════════════════════════════════════════════════════ */

(function () {
    'use strict';

    const esc = window.esc || function (s) { return String(s == null ? '' : s); };

    // ─── MOCK DATA ─────────────────────────────────────────────────

    let assessmentsData = [
        { id: 1, name: 'Quiz 4', className: 'Primary 4A', subject: 'Mathematics', type: 'quiz', phase: 'Post-Midterm', entered: 22, total: 28, locked: false },
        { id: 2, name: 'Mid-Term Exam', className: 'Primary 4A', subject: 'Mathematics', type: 'exam', phase: 'Post-Midterm', entered: 28, total: 28, locked: true },
        { id: 3, name: 'Composition 3', className: 'Primary 5B', subject: 'English', type: 'homework', phase: 'Post-Midterm', entered: 16, total: 31, locked: false },
        { id: 4, name: 'Science Fair Project', className: 'Primary 6', subject: 'Science', type: 'project', phase: 'Annual', entered: 0, total: 26, locked: false },
        { id: 5, name: 'Quiz 3', className: 'Primary 3', subject: 'Kinyarwanda', type: 'quiz', phase: 'Post-Midterm', entered: 24, total: 24, locked: true },
        { id: 6, name: 'Final Exam', className: 'Primary 1', subject: 'Mathematics', type: 'exam', phase: 'Annual', entered: 0, total: 22, locked: false },
        { id: 7, name: 'French Homework 5', className: 'Primary 2', subject: 'French', type: 'homework', phase: 'Pre-Midterm', entered: 20, total: 20, locked: true },
        { id: 8, name: 'Social Studies Quiz 2', className: 'Primary 4A', subject: 'Social Studies', type: 'quiz', phase: 'Pre-Midterm', entered: 28, total: 28, locked: true },
        { id: 9, name: 'Exam 1', className: 'Primary 5B', subject: 'Mathematics', type: 'exam', phase: 'Post-Midterm', entered: 0, total: 31, locked: false },
        { id: 10, name: 'Reading Assessment', className: 'Primary 2', subject: 'English', type: 'quiz', phase: 'Pre-Midterm', entered: 18, total: 20, locked: false }
    ];

    const PHASES = ['Pre-Midterm', 'Post-Midterm', 'Annual'];

    // ─── STATE ───────────────────────────────────────────────────────

    let filters = { phase: 'all', status: 'all' };
    let rootEl = null;

    // ─── HELPERS ─────────────────────────────────────────────────────

    function getFiltered() {
        return assessmentsData.filter(function (a) {
            if (filters.phase !== 'all' && a.phase !== filters.phase) return false;
            if (filters.status === 'locked' && !a.locked) return false;
            if (filters.status === 'open' && a.locked) return false;
            return true;
        });
    }

    function getSelectedIds() {
        return Array.prototype.slice.call(rootEl.querySelectorAll('[data-row-check]:checked'))
            .map(function (cb) { return parseInt(cb.dataset.rowCheck, 10); });
    }

    // ─── RENDER ──────────────────────────────────────────────────────

    function renderAssessmentLocking(container) {
        if (!container) {
            console.warn('[AssessmentLocking] No container provided');
            return;
        }
        rootEl = container;

        container.innerHTML =
            '<div class="assessment-locking-page">' +
            '<div class="assessment-toolbar">' +
            '<select class="marks-toolbar__select" id="al-phase-filter">' +
            '<option value="all">All Phases</option>' +
            PHASES.map(function (p) { return '<option value="' + esc(p) + '">' + esc(p) + '</option>'; }).join('') +
            '</select>' +
            '<select class="marks-toolbar__select" id="al-status-filter">' +
            '<option value="all">All Statuses</option>' +
            '<option value="locked">Locked Only</option>' +
            '<option value="open">Open Only</option>' +
            '</select>' +
            '<span class="assessment-toolbar__spacer"></span>' +
            '<span class="badge badge-neutral" id="al-selected-count">0 selected</span>' +
            '</div>' +
            '<div class="table-action-bar">' +
            '<button class="btn btn-outline-danger btn-sm" id="al-lock-selected"><i class="fa-solid fa-lock"></i> Lock Selected</button>' +
            '<button class="btn btn-outline-success btn-sm" id="al-unlock-selected"><i class="fa-solid fa-lock-open"></i> Unlock Selected</button>' +
            '<span class="marks-toolbar__spacer"></span>' +
            '<button class="btn btn-ghost btn-sm" id="al-select-all"><i class="fa-regular fa-square-check"></i> Select All</button>' +
            '<button class="btn btn-ghost btn-sm" id="al-clear-selection"><i class="fa-regular fa-square"></i> Clear</button>' +
            '</div>' +
            '<div class="table-wrapper">' +
            '<table class="data-table data-table-hover">' +
            '<thead><tr>' +
            '<th style="width:36px;"><input type="checkbox" id="al-select-all-checkbox" /></th>' +
            '<th>Assessment</th><th>Class</th><th>Subject</th><th>Type</th><th>Phase</th>' +
            '<th>Completion</th><th>Status</th><th style="width:80px;">Action</th>' +
            '</tr></thead>' +
            '<tbody id="al-table-body"></tbody>' +
            '</table>' +
            '</div>' +
            '</div>';

        renderTable();
        wireToolbar();
    }

    function renderTable() {
        const tbody = rootEl.querySelector('#al-table-body');
        if (!tbody) return;

        const filtered = getFiltered();

        if (!filtered.length) {
            tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;padding:24px;color:var(--text-soft);">No assessments match these filters.</td></tr>';
        } else {
            tbody.innerHTML = filtered.map(function (a) {
                const pct = a.total ? Math.round((a.entered / a.total) * 100) : 0;
                return (
                    '<tr>' +
                    '<td><input type="checkbox" data-row-check="' + a.id + '" /></td>' +
                    '<td style="font-weight:600;">' + esc(a.name) + '</td>' +
                    '<td>' + esc(a.className) + '</td>' +
                    '<td>' + esc(a.subject) + '</td>' +
                    '<td><span class="assessment-type-badge ' + a.type + '">' + esc(a.type) + '</span></td>' +
                    '<td>' + esc(a.phase) + '</td>' +
                    '<td>' + a.entered + '/' + a.total + ' (' + pct + '%)</td>' +
                    '<td><span class="table-status ' + (a.locked ? 'table-status-warning' : 'table-status-success') + '">' + (a.locked ? 'Locked' : 'Open') + '</span></td>' +
                    '<td><button class="btn btn-ghost btn-xs" data-toggle-id="' + a.id + '" title="' + (a.locked ? 'Unlock' : 'Lock') + '">' +
                    '<i class="fa-solid ' + (a.locked ? 'fa-lock-open' : 'fa-lock') + '"></i></button></td>' +
                    '</tr>'
                );
            }).join('');
        }

        Array.prototype.forEach.call(tbody.querySelectorAll('[data-toggle-id]'), function (btn) {
            btn.addEventListener('click', function () {
                const id = parseInt(btn.dataset.toggleId, 10);
                const a = assessmentsData.filter(function (x) { return x.id === id; })[0];
                if (!a) return;
                a.locked = !a.locked;
                renderTable();
                notify(a.name + ' ' + (a.locked ? 'locked' : 'unlocked'), 'info');
            });
        });

        Array.prototype.forEach.call(tbody.querySelectorAll('[data-row-check]'), function (cb) {
            cb.addEventListener('change', updateSelectedCount);
        });

        updateSelectedCount();
    }

    function updateSelectedCount() {
        const count = getSelectedIds().length;
        const badge = rootEl.querySelector('#al-selected-count');
        if (badge) badge.textContent = count + ' selected';
    }

    // ─── TOOLBAR ───────────────────────────────────────────────────

    function wireToolbar() {
        rootEl.querySelector('#al-phase-filter').addEventListener('change', function (e) {
            filters.phase = e.target.value;
            renderTable();
        });
        rootEl.querySelector('#al-status-filter').addEventListener('change', function (e) {
            filters.status = e.target.value;
            renderTable();
        });

        rootEl.querySelector('#al-select-all').addEventListener('click', function () {
            Array.prototype.forEach.call(rootEl.querySelectorAll('[data-row-check]'), function (cb) { cb.checked = true; });
            updateSelectedCount();
        });
        rootEl.querySelector('#al-clear-selection').addEventListener('click', function () {
            Array.prototype.forEach.call(rootEl.querySelectorAll('[data-row-check]'), function (cb) { cb.checked = false; });
            updateSelectedCount();
        });
        rootEl.querySelector('#al-select-all-checkbox').addEventListener('change', function (e) {
            Array.prototype.forEach.call(rootEl.querySelectorAll('[data-row-check]'), function (cb) { cb.checked = e.target.checked; });
            updateSelectedCount();
        });

        rootEl.querySelector('#al-lock-selected').addEventListener('click', function () {
            const ids = getSelectedIds();
            if (!ids.length) { notify('Select at least one assessment', 'warning'); return; }
            ids.forEach(function (id) {
                const a = assessmentsData.filter(function (x) { return x.id === id; })[0];
                if (a) a.locked = true;
            });
            renderTable();
            notify(ids.length + ' assessment' + (ids.length === 1 ? '' : 's') + ' locked', 'success');
        });

        rootEl.querySelector('#al-unlock-selected').addEventListener('click', function () {
            const ids = getSelectedIds();
            if (!ids.length) { notify('Select at least one assessment', 'warning'); return; }
            ids.forEach(function (id) {
                const a = assessmentsData.filter(function (x) { return x.id === id; })[0];
                if (a) a.locked = false;
            });
            renderTable();
            notify(ids.length + ' assessment' + (ids.length === 1 ? '' : 's') + ' unlocked', 'success');
        });
    }

    // ─── TOAST HELPER ────────────────────────────────────────────────

    function notify(message, type) {
        if (typeof window.showToast === 'function') {
            window.showToast(message, type || 'info');
        }
    }

    // ─── DESTROY ─────────────────────────────────────────────────────

    function destroyAssessmentLocking() {
        rootEl = null;
    }

    // ─── EXPOSE ──────────────────────────────────────────────────────

    window.renderAssessmentLocking = renderAssessmentLocking;
    window.destroyAssessmentLocking = destroyAssessmentLocking;
})();