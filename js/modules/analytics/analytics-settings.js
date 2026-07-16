/* ═══════════════════════════════════════════════════════════════════
   js/modules/analytics/analytics-settings.js
   ═══════════════════════════════════════════════════════════════════
   NOT routed directly — navigation.js has no 'analytics-settings' nav
   id, and there's no dedicated CSS file for it either. This is a
   settings panel invoked from analytics.js's "Settings" button
   (window.openAnalyticsSettings()), reusing analytics.css's
   .analytics-filter-modal / .filter-panel structure since that's the
   confirmed real modal component in this design system — no new
   classes invented here.

   Preferences are genuinely persisted to localStorage (not a fake
   toast-only stub): default class/term/subject, at-risk threshold,
   and whether the trend chart defaults to line or bar. analytics.js
   reads window.getAnalyticsSettings() at render time to seed its
   filters, so changing a setting here has a real, visible effect the
   next time Academic Analytics is opened.

   Loaded as a plain <script> — no import/export.

   Last updated: 2026-07-14
   ═══════════════════════════════════════════════════════════════════ */

(function () {
    'use strict';

    const esc = window.esc || function (s) { return String(s == null ? '' : s); };
    const STORAGE_KEY = 'lafontaine.analyticsSettings';

    const DEFAULTS = {
        defaultClassId: 'all',
        defaultTerm: 'current',
        defaultSubject: 'all',
        atRiskThreshold: 50,
        trendChartType: 'line',
        autoRefreshMinutes: 0
    };

    // ─── PERSISTENCE ─────────────────────────────────────────────────

    function getAnalyticsSettings() {
        try {
            const raw = window.localStorage.getItem(STORAGE_KEY);
            if (!raw) return Object.assign({}, DEFAULTS);
            const parsed = JSON.parse(raw);
            return Object.assign({}, DEFAULTS, parsed);
        } catch (err) {
            console.warn('[AnalyticsSettings] Could not read stored settings, using defaults', err);
            return Object.assign({}, DEFAULTS);
        }
    }

    function saveAnalyticsSettings(next) {
        try {
            window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
            return true;
        } catch (err) {
            console.warn('[AnalyticsSettings] Could not persist settings (localStorage unavailable)', err);
            return false;
        }
    }

    // ─── MODAL ───────────────────────────────────────────────────────

    const CLASS_OPTIONS = [
        { value: 'all', label: 'All Classes' },
        { value: 'p1', label: 'Primary 1' }, { value: 'p2', label: 'Primary 2' },
        { value: 'p3', label: 'Primary 3' }, { value: 'p4a', label: 'Primary 4A' },
        { value: 'p5b', label: 'Primary 5B' }, { value: 'p6', label: 'Primary 6' }
    ];
    const TERM_OPTIONS = [
        { value: 'current', label: 'Current Term' },
        { value: 'term2', label: 'Term 2' },
        { value: 'term1', label: 'Term 1' }
    ];
    const SUBJECT_OPTIONS = [
        { value: 'all', label: 'All Subjects' },
        { value: 'math', label: 'Mathematics' }, { value: 'eng', label: 'English' },
        { value: 'kiny', label: 'Kinyarwanda' }, { value: 'sci', label: 'Science' }
    ];

    let modalEl = null;

    function openAnalyticsSettings() {
        closeAnalyticsSettings();

        const settings = getAnalyticsSettings();
        const modal = document.createElement('div');
        modal.className = 'analytics-filter-modal show';
        modal.id = 'analytics-settings-modal';

        modal.innerHTML =
            '<div class="filter-panel">' +
                '<div class="filter-header"><h2><i class="fa-solid fa-sliders"></i> Analytics Settings</h2><button class="close-filter" id="as-close"><i class="fa-solid fa-xmark"></i></button></div>' +
                '<div class="filter-body">' +
                    '<div class="field"><label>Default Class</label><select id="as-class">' +
                        CLASS_OPTIONS.map(function (o) { return '<option value="' + o.value + '"' + (o.value === settings.defaultClassId ? ' selected' : '') + '>' + esc(o.label) + '</option>'; }).join('') +
                    '</select></div>' +
                    '<div class="field"><label>Default Term</label><select id="as-term">' +
                        TERM_OPTIONS.map(function (o) { return '<option value="' + o.value + '"' + (o.value === settings.defaultTerm ? ' selected' : '') + '>' + esc(o.label) + '</option>'; }).join('') +
                    '</select></div>' +
                    '<div class="field"><label>Default Subject</label><select id="as-subject">' +
                        SUBJECT_OPTIONS.map(function (o) { return '<option value="' + o.value + '"' + (o.value === settings.defaultSubject ? ' selected' : '') + '>' + esc(o.label) + '</option>'; }).join('') +
                    '</select></div>' +
                    '<div class="field"><label>At-Risk Threshold (%)</label><input type="number" id="as-threshold" min="0" max="100" value="' + settings.atRiskThreshold + '" /></div>' +
                    '<div class="field"><label>Trend Chart Type</label><select id="as-chart-type">' +
                        '<option value="line"' + (settings.trendChartType === 'line' ? ' selected' : '') + '>Line</option>' +
                        '<option value="bar"' + (settings.trendChartType === 'bar' ? ' selected' : '') + '>Bar</option>' +
                    '</select></div>' +
                    '<div class="field"><label>Auto-Refresh (minutes, 0 = off)</label><input type="number" id="as-refresh" min="0" max="60" value="' + settings.autoRefreshMinutes + '" /></div>' +
                '</div>' +
                '<div class="filter-footer">' +
                    '<button class="btn-primary" id="as-save">Save Settings</button>' +
                    '<button class="btn-ghost" id="as-reset">Reset to Defaults</button>' +
                    '<button class="btn-danger" id="as-cancel" style="margin-left:auto;">Cancel</button>' +
                '</div>' +
            '</div>';

        document.body.appendChild(modal);
        modalEl = modal;

        modal.querySelector('#as-close').addEventListener('click', closeAnalyticsSettings);
        modal.querySelector('#as-cancel').addEventListener('click', closeAnalyticsSettings);
        modal.addEventListener('click', function (e) { if (e.target === modal) closeAnalyticsSettings(); });

        modal.querySelector('#as-save').addEventListener('click', function () {
            const next = {
                defaultClassId: modal.querySelector('#as-class').value,
                defaultTerm: modal.querySelector('#as-term').value,
                defaultSubject: modal.querySelector('#as-subject').value,
                atRiskThreshold: clampNumber(modal.querySelector('#as-threshold').value, 0, 100, DEFAULTS.atRiskThreshold),
                trendChartType: modal.querySelector('#as-chart-type').value,
                autoRefreshMinutes: clampNumber(modal.querySelector('#as-refresh').value, 0, 60, DEFAULTS.autoRefreshMinutes)
            };
            const ok = saveAnalyticsSettings(next);
            closeAnalyticsSettings();
            notify(ok ? 'Analytics settings saved — will apply next time Analytics opens' : 'Could not save settings (storage unavailable)', ok ? 'success' : 'error');
        });

        modal.querySelector('#as-reset').addEventListener('click', function () {
            saveAnalyticsSettings(Object.assign({}, DEFAULTS));
            closeAnalyticsSettings();
            notify('Analytics settings reset to defaults', 'success');
        });
    }

    function closeAnalyticsSettings() {
        if (modalEl) {
            modalEl.remove();
            modalEl = null;
        }
    }

    function clampNumber(raw, min, max, fallback) {
        const n = parseInt(raw, 10);
        if (Number.isNaN(n)) return fallback;
        return Math.max(min, Math.min(max, n));
    }

    // ─── TOAST HELPER ────────────────────────────────────────────────

    function notify(message, type) {
        if (typeof window.showToast === 'function') {
            window.showToast(message, type || 'info');
        }
    }

    // ─── EXPOSE ──────────────────────────────────────────────────────

    window.getAnalyticsSettings = getAnalyticsSettings;
    window.saveAnalyticsSettings = saveAnalyticsSettings;
    window.openAnalyticsSettings = openAnalyticsSettings;
    window.closeAnalyticsSettings = closeAnalyticsSettings;
})();
