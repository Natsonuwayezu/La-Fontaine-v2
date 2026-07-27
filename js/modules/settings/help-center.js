/* ═══════════════════════════════════════════════════════
   js/modules/settings/help-center.js
   Stub module — renders a placeholder for help-center,
   faq, and support routes until full content is built.
   ═══════════════════════════════════════════════════════ */

'use strict';

function _helpStub(container, title, icon, desc) {
    if (!container) return;
    container.innerHTML = `
    <div class="module-wrap">
        <div class="mod-topbar">
            <div class="mod-topbar-left">
                <h1 class="mod-title">
                    <i class="${icon}"></i> ${title}
                </h1>
            </div>
        </div>
        <div class="section-card">
            <div class="empty-state" style="padding:60px 24px;">
                <div class="es-icon">
                    <i class="${icon}" style="font-size:48px;opacity:0.3;"></i>
                </div>
                <div class="es-title">${title}</div>
                <div class="es-sub">${desc}</div>
            </div>
        </div>
    </div>`;
}

function renderHelpCenter(container) {
    _helpStub(container,
        'Help Center',
        'fa-solid fa-circle-question',
        'Browse help articles and guides — coming soon.'
    );
}

function renderFaq(container) {
    _helpStub(container,
        'FAQ',
        'fa-solid fa-list',
        'Frequently asked questions — coming soon.'
    );
}

function renderSupport(container) {
    _helpStub(container,
        'Contact Support',
        'fa-solid fa-envelope',
        'Reach out to the support team — coming soon.'
    );
}

window.renderHelpCenter = renderHelpCenter;
window.renderFaq        = renderFaq;
window.renderSupport    = renderSupport;
