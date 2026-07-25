/* ═══════════════════════════════════════════════════════════════════
   js/modules/settings/settings.js
   ═══════════════════════════════════════════════════════════════════
   Shared tab-strip shell (window.SettingsTabs) used by every settings
   sub-page — school-settings.js, academic-calendar.js,
   grading-settings.js, backup-restore.js, system-logs.js, and
   class-management.js — so navigating between them feels like one
   connected settings area. Not itself a nav destination.

   Each sub-page calls window.SettingsTabs.render(activeId) at the top
   of its own render() and drops the returned HTML string into its
   markup — see any of those files for the pattern.

   Dependencies (plain-script globals loaded earlier in index.html):
   navigation.js: getNavLabel (falls back to a local label map below
                  if a tab id isn't a registered nav item, e.g.
                  'class-management' is filed under the Staff section)
   ═══════════════════════════════════════════════════════════════════ */

const SettingsTabs = (() => {

    const TABS = [
        { id: 'school-settings', label: 'School', icon: 'fa-school' },
        { id: 'academic-calendar', label: 'Academic Calendar', icon: 'fa-calendar' },
        { id: 'grading-scale', label: 'Grading', icon: 'fa-star-half-stroke' },
        { id: 'class-management', label: 'Classes / Subjects', icon: 'fa-book' },
        { id: 'backup-restore', label: 'Backup & Restore', icon: 'fa-hard-drive' },
        { id: 'system-logs', label: 'System Logs', icon: 'fa-list-check' },
    ];

    function render(activeId) {
        return `
            <div class="settings-tabs">
                ${TABS.map(t => `
                    <button class="tab-btn ${t.id === activeId ? 'active' : ''}" data-settings-nav="${t.id}">
                        <i class="fa-solid ${t.icon}"></i> ${t.label}
                    </button>
                `).join('')}
            </div>
        `;
    }

    // Event delegation: bound once, works for tab buttons in any sub-page's
    // markup since they're all rendered from the same render() above.
    document.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-settings-nav]');
        if (!btn) return;
        navigateTo(btn.dataset.settingsNav);
    });

    return { render, TABS };
})();

window.SettingsTabs = SettingsTabs;

// Router bridge
window.renderSettings = function(container, params) {
    return SettingsTabs.render(container, params);
};
