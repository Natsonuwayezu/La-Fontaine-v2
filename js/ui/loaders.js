/* ═══════════════════════════════════════════════════════════════════
   js/ui/loaders.js — Loaders controller
   ═══════════════════════════════════════════════════════════════════
   Two small public APIs, attached to the global Loaders namespace
   (final window exposure, if any, happens in core/window-exposure.js —
   this file itself never touches window.* directly per Rule #7 of the
   build spec).

   Loaders.task.show(type, { label, sub, determinate }) → handle
   Loaders.task.hide()
   Loaders.button.start(buttonEl)
   Loaders.button.stop(buttonEl)

   The boot loader (#boot-loader) is intentionally NOT controlled here —
   it's a single-use, one-time element wired directly by core/boot.js.
   ═══════════════════════════════════════════════════════════════════ */

const Loaders = (() => {

    // ── Task type → family + icon markup ──────────────────────────────
    // Families map to the module accent colors defined in loaders.css
    // (Section 2.4 of the build spec). Icons are inline SVG — never emoji.
    const TASK_DEFS = {
        academics: {
            family: 'academics',
            markup: `
        <div class="task-loader task-loader--book" data-family="academics">
          <div class="task-loader__stage">
            <div class="book-page"></div>
            <div class="book-page"></div>
            <div class="book-page"></div>
          </div>
        </div>`
        },
        finance: {
            family: 'finance',
            markup: `
        <div class="task-loader task-loader--coin" data-family="finance">
          <div class="task-loader__stage">
            <div class="coin-ring"></div>
            <div class="coin-ring"></div>
            <div class="coin-disc">
              <svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M12 2v20M17 5.5c0-1.93-2.24-3.5-5-3.5s-5 1.57-5 3.5 2.24 3.5 5 3.5 5 1.57 5 3.5-2.24 3.5-5 3.5-5-1.57-5-3.5"/>
              </svg>
            </div>
          </div>
        </div>`
        },
        attendance: {
            family: 'attendance',
            markup: `
        <div class="task-loader task-loader--check" data-family="attendance">
          <div class="task-loader__stage">
            <div class="check-circle c1"></div>
            <div class="check-circle c2"></div>
            <div class="check-circle c3"></div>
            <div class="check-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
            </div>
          </div>
        </div>`
        },
        reports: {
            family: 'system',
            markup: `
        <div class="task-loader task-loader--doc" data-family="system">
          <div class="task-loader__stage">
            <div class="doc-page"></div>
            <div class="doc-page"></div>
            <div class="doc-page"></div>
            <div class="doc-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
                <line x1="8" y1="13" x2="16" y2="13"/>
                <line x1="8" y1="17" x2="13" y2="17"/>
              </svg>
            </div>
          </div>
        </div>`
        },
        settings: {
            family: 'system',
            markup: `
        <div class="task-loader task-loader--gear" data-family="system">
          <div class="task-loader__stage">
            <svg viewBox="0 0 24 24" fill="none" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="3"/>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
            </svg>
            <svg viewBox="0 0 24 24" fill="none" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="3"/>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
            </svg>
          </div>
        </div>`
        },
        save: {
            family: 'system',
            markup: `
        <div class="task-loader task-loader--save" data-family="system">
          <div class="task-loader__stage">
            <div class="save-ring r1"></div>
            <div class="save-ring r2"></div>
            <div class="save-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
                <polyline points="17 21 17 13 7 13 7 21"/>
                <polyline points="7 3 7 8 15 8"/>
              </svg>
            </div>
          </div>
        </div>`
        },
        payment: {
            family: 'finance',
            markup: `
        <div class="task-loader task-loader--doc" data-family="finance">
          <div class="task-loader__stage">
            <div class="doc-page"></div>
            <div class="doc-page"></div>
            <div class="doc-page"></div>
            <div class="doc-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M4 4h16v16H4z" opacity="0"/>
                <path d="M6 3h12l1 3v15l-3-2-3 2-3-2-3 2-3-2V6z"/>
                <line x1="9" y1="9" x2="15" y2="9"/>
                <line x1="9" y1="13" x2="15" y2="13"/>
              </svg>
            </div>
          </div>
        </div>`
        },
        timetable: {
            family: 'staff',
            markup: `
        <div class="task-loader task-loader--clock" data-family="staff">
          <div class="task-loader__stage">
            <div class="clock-face"></div>
            <div class="clock-hand hour"></div>
            <div class="clock-hand minute"></div>
            <div class="clock-dot"></div>
          </div>
        </div>`
        },
        analytics: {
            family: 'analytics',
            markup: `
        <div class="task-loader task-loader--chart" data-family="analytics">
          <div class="task-loader__stage" style="align-items:flex-end;">
            <div class="bar"></div>
            <div class="bar"></div>
            <div class="bar"></div>
            <div class="bar"></div>
            <div class="bar"></div>
          </div>
        </div>`
        },
        students: {
            family: 'students',
            markup: `
        <div class="task-loader task-loader--students" data-family="students">
          <div class="task-loader__stage" style="align-items:flex-end;">
            <div class="student"></div>
            <div class="student"></div>
            <div class="student"></div>
            <div class="student"></div>
          </div>
        </div>`
        },
        default: {
            family: 'system',
            markup: `
        <div class="task-loader task-loader--ring" data-family="system">
          <div class="task-loader__stage"><div class="ring"></div></div>
        </div>`
        }
    };

    let overlayEl = null;
    let progressTimer = null;

    function getOverlay() {
        if (!overlayEl) {
            overlayEl = document.getElementById('task-loader-overlay');
        }
        return overlayEl;
    }

    /**
     * Show the task-loader overlay.
     * @param {string} type - key into TASK_DEFS (falls back to 'default')
     * @param {object} opts
     * @param {string} [opts.label]
     * @param {string} [opts.sub]
     * @param {boolean} [opts.determinate] - if true, caller drives progress via handle.setProgress()
     */
    function show(type, opts = {}) {
        const overlay = getOverlay();
        if (!overlay) return null;

        const def = TASK_DEFS[type] || TASK_DEFS.default;
        const { label = '', sub = '', determinate = false } = opts;

        overlay.innerHTML = `
      ${def.markup}
      ${label ? `<div class="task-loader__label">${escapeHTML(label)}</div>` : ''}
      ${sub ? `<div class="task-loader__sub">${escapeHTML(sub)}</div>` : ''}
      ${determinate ? `
        <div class="task-loader__progress">
          <div class="progress-bar">
            <div class="progress-fill" id="task-loader-progress-fill" style="width:0%"></div>
          </div>
        </div>` : ''}
    `;

        overlay.classList.add('is-visible');
        overlay.setAttribute('aria-hidden', 'false');

        return {
            setProgress(pct) {
                const fill = document.getElementById('task-loader-progress-fill');
                if (fill) fill.style.width = `${Math.max(0, Math.min(100, pct))}%`;
            },
            setLabel(text) {
                const el = overlay.querySelector('.task-loader__label');
                if (el) el.textContent = text;
            },
            setSub(text) {
                const el = overlay.querySelector('.task-loader__sub');
                if (el) el.textContent = text;
            },
            hide
        };
    }

    function hide() {
        const overlay = getOverlay();
        if (!overlay) return;
        overlay.classList.remove('is-visible');
        overlay.setAttribute('aria-hidden', 'true');
        if (progressTimer) {
            clearInterval(progressTimer);
            progressTimer = null;
        }
        setTimeout(() => {
            if (!overlay.classList.contains('is-visible')) overlay.innerHTML = '';
        }, 300);
    }

    function escapeHTML(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    // ── Button loader ────────────────────────────────────────────────
    const BTN_STATE = new WeakMap();

    function startButton(btn) {
        if (!btn || BTN_STATE.has(btn)) return;
        BTN_STATE.set(btn, {
            html: btn.innerHTML,
            disabled: btn.disabled
        });
        btn.disabled = true;
        btn.classList.add('is-loading');
        btn.innerHTML = `
      <span class="btn-loader">
        <span class="spinner"></span>
        <span>${escapeHTML(btn.dataset.loadingText || 'Please wait')}</span>
      </span>`;
    }

    function stopButton(btn) {
        const state = BTN_STATE.get(btn);
        if (!state) return;
        btn.innerHTML = state.html;
        btn.disabled = state.disabled;
        btn.classList.remove('is-loading');
        BTN_STATE.delete(btn);
    }

    return {
        task: { show, hide },
        button: { start: startButton, stop: stopButton }
    };
})();
