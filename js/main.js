'use strict';
/* ═══════════════════════════════════════════════════════════════
   main.js — App entry point. Just calls boot() on DOM ready.
   ═══════════════════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
    if (typeof boot === 'function') boot();
});
