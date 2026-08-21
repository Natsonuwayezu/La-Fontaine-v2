/* ═══════════════════════════════════════════════════════════════════
   js/ui/cards.js — Card helpers (CSS-only animations)
   ═══════════════════════════════════════════════════════════════════
   Most cards are static markup + CSS; this file covers the
   interactive/data-driven bits: building stat cards from data,
   expand/collapse, and CSS-driven entrance animations.

   All animations are pure CSS — no GSAP, no JavaScript animation loops.
   Uses CSS classes: .card-enter, .card-enter--stagger, .progress-animate,
   .counter-animate, .ripple.

   Expected CSS classes:
   - .stat-card, .stat-card__icon, .stat-card__value, .stat-card__label
   - .card-expandable, .card-expandable.expanded, .card-expand-toggle
   - .progress-fill.animate, .counter-value

   Last updated: 2026-07-13
   ═══════════════════════════════════════════════════════════════════ */

const Cards = (() => {

  // ─── HELPERS ────────────────────────────────────────────────────────

  /**
   * Escape HTML to prevent XSS
   * @param {string} str - String to escape
   * @returns {string} Escaped string
   */
  function escapeHTML(str) {
    const div = document.createElement('div');
    div.textContent = str ?? '';
    return div.innerHTML;
  }

  /**
   * Get the trend arrow symbol
   * @param {string} dir - 'up', 'down', or 'flat'
   * @returns {string} Arrow symbol
   */
  function trendArrow(dir) {
    if (dir === 'up') return '↑';
    if (dir === 'down') return '↓';
    return '→';
  }

  /**
   * Get the trend class
   * @param {string} dir - 'up', 'down', or 'flat'
   * @returns {string} CSS class name
   */
  function trendClass(dir) {
    if (dir === 'up') return 'up';
    if (dir === 'down') return 'down';
    return 'neutral';
  }

  // ─── RENDER STAT CARDS ─────────────────────────────────────────────

  /**
   * Render a grid of stat cards from data
   * @param {HTMLElement} container - The container element
   * @param {Array} stats - Array of stat objects
   * @param {Object} options - Configuration options
   * @param {number} options.staggerDelay - Delay between each card (ms)
   * @param {boolean} options.animated - Whether to animate entrance
   *
   * Stat object format:
   * {
   *   family: 'sapphire' | 'emerald' | 'purple' | 'gold' | 'ruby' | 'cyan' | 'obsidian' | 'rosegold',
   *   icon: '<svg>...</svg>' or '<i class="fa-solid fa-users"></i>',
   *   value: 428,
   *   label: 'Total Students',
   *   trend: { dir: 'up' | 'down' | 'flat', text: '12%' },
   *   progress: { value: 78, max: 100, label: 'Collection Rate' },
   *   countUp: true,  // animate the number counting up
   *   countSuffix: 'RWF'
   * }
   */
  function renderStatCards(container, stats, options = {}) {
    if (!container) return;

    const { staggerDelay = 60, animated = true } = options;

    container.innerHTML = stats.map((s, i) => {
      const delay = animated ? i * staggerDelay : 0;
      const style = animated ? `style="animation-delay:${delay}ms"` : '';

      // Build trend HTML
      let trendHTML = '';
      if (s.trend) {
        const arrow = trendArrow(s.trend.dir);
        const cls = trendClass(s.trend.dir);
        trendHTML = `
                    <div class="stat-card__trend ${cls}">
                        <span class="stat-card__trend-arrow">${arrow}</span>
                        ${escapeHTML(s.trend.text || '')}
                    </div>
                `;
      }

      // Build progress bar HTML
      let progressHTML = '';
      if (s.progress) {
        const pct = Math.min(100, (s.progress.value / s.progress.max) * 100);
        const label = s.progress.label || '';
        progressHTML = `
                    <div class="stat-card__progress">
                        <div class="stat-card__progress-track">
                            <div class="stat-card__progress-fill animate" data-target="${pct}"></div>
                        </div>
                        ${label ? `<div class="stat-card__progress-label">${escapeHTML(label)}</div>` : ''}
                    </div>
                `;
      }

      // Build value with counting
      const countAttr = s.countUp ? `data-count="${escapeHTML(String(s.value))}"` : '';
      const suffix = s.countSuffix ? `<span class="suffix">${escapeHTML(s.countSuffix)}</span>` : '';
      const valueClass = s.countUp ? 'stat-card__value counter-value' : 'stat-card__value';

      return `
                <div class="stat-card card-enter ${s.family ? `stat-card--${s.family}` : ''}" ${style}>
                    <div class="stat-card__top">
                        <div class="stat-card__icon">${s.icon || ''}</div>
                        ${trendHTML}
                    </div>
                    <div class="${valueClass}" ${countAttr}>
                        ${escapeHTML(String(s.value))}${suffix}
                    </div>
                    <div class="stat-card__label">${escapeHTML(s.label)}</div>
                    ${progressHTML}
                </div>
            `;
    }).join('');

    // Animate progress bars after render
    if (animated) {
      requestAnimationFrame(() => {
        animateProgressBars(container);
      });
    }
  }

  // ─── ANIMATE PROGRESS BARS ────────────────────────────────────────

  /**
   * Animate progress bars using CSS transitions
   * @param {HTMLElement} container - The container element
   */
  function animateProgressBars(container) {
    const fills = container.querySelectorAll('.stat-card__progress-fill.animate');
    fills.forEach((fill, index) => {
      const target = parseFloat(fill.dataset.target) || 0;
      // Set the width with a staggered delay via CSS
      fill.style.setProperty('--target', target + '%');
      fill.style.setProperty('--delay', (index * 0.08) + 's');
      fill.classList.add('animating');
    });
  }

  // ─── COUNTER ANIMATION ────────────────────────────────────────────

  /**
   * Animate counter values using requestAnimationFrame
   * @param {HTMLElement} container - The container element
   */
  function animateCounters(container) {
    const counters = container.querySelectorAll('.counter-value:not(.animated)');
    counters.forEach(counter => {
      const target = parseFloat(counter.dataset.count);
      if (isNaN(target)) return;

      counter.classList.add('animated');

      const isFloat = target % 1 !== 0;
      const duration = 1200;
      const startTime = performance.now();
      const startValue = 0;

      // Extract suffix from the counter's text content
      const originalText = counter.textContent;
      const suffixMatch = originalText.match(/[^\d.]*$/);
      const suffix = suffixMatch ? suffixMatch[0] : '';

      function updateCounter(currentTime) {
        const elapsed = currentTime - startTime;
        const progress = Math.min(1, elapsed / duration);

        // Ease out cubic
        const eased = 1 - Math.pow(1 - progress, 3);
        const currentValue = startValue + (target - startValue) * eased;

        const display = isFloat ? currentValue.toFixed(1) : Math.round(currentValue);
        counter.textContent = display + suffix;

        if (progress < 1) {
          requestAnimationFrame(updateCounter);
        } else {
          counter.textContent = (isFloat ? target.toFixed(1) : Math.round(target)) + suffix;
        }
      }

      requestAnimationFrame(updateCounter);
    });
  }

  // ─── EXPANDABLE CARDS ─────────────────────────────────────────────

  /**
   * Bind expand/collapse to a card
   * @param {HTMLElement} cardEl - The card element
   * @param {number} collapsedHeight - Height in px when collapsed (default: 120)
   */
  function bindExpandable(cardEl, collapsedHeight = 120) {
    if (!cardEl || cardEl.dataset.expandBound) return;
    cardEl.dataset.expandBound = 'true';

    const body = cardEl.querySelector('.dash-card-body') || cardEl;
    const contentHeight = body.scrollHeight;

    // If content is shorter than collapsed height, no need for expand
    if (contentHeight <= collapsedHeight + 20) return;

    cardEl.classList.add('card-expandable');
    body.style.maxHeight = `${collapsedHeight}px`;
    body.style.overflow = 'hidden';
    body.style.transition = 'max-height 0.4s cubic-bezier(0.22, 1, 0.36, 1)';

    const toggle = document.createElement('button');
    toggle.className = 'card-expand-toggle';
    toggle.setAttribute('aria-expanded', 'false');
    toggle.textContent = 'Show more';

    toggle.addEventListener('click', function (e) {
      e.stopPropagation();
      const expanded = cardEl.classList.toggle('expanded');
      const targetHeight = expanded ? contentHeight : collapsedHeight;
      body.style.maxHeight = `${targetHeight}px`;
      this.textContent = expanded ? 'Show less' : 'Show more';
      this.setAttribute('aria-expanded', String(expanded));
    });

    cardEl.appendChild(toggle);
  }

  /**
   * Bind all expandable cards in a container
   * @param {HTMLElement} root - Root element to search (default: document)
   * @param {string} selector - CSS selector for cards (default: '.dash-card')
   */
  function bindAllExpandable(root = document, selector = '.dash-card') {
    root.querySelectorAll(selector).forEach(el => bindExpandable(el));
  }

  // ─── RIPPLE EFFECT ─────────────────────────────────────────────────

  /**
   * Add ripple effect to cards on click
   * @param {HTMLElement} container - Container element
   */
  function setupRippleEffect(container = document) {
    container.querySelectorAll('.card, .stat-card').forEach(card => {
      card.addEventListener('click', function (e) {
        // Only trigger ripple if not clicking on a button or link inside
        if (e.target.closest('button, a, .card-expand-toggle')) return;

        const rect = this.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const size = Math.min(rect.width, rect.height) * 0.4;

        const ripple = document.createElement('div');
        ripple.className = 'ripple';
        ripple.style.width = size + 'px';
        ripple.style.height = size + 'px';
        ripple.style.left = (x - size / 2) + 'px';
        ripple.style.top = (y - size / 2) + 'px';
        this.appendChild(ripple);

        // Remove ripple after animation
        setTimeout(() => {
          if (ripple.parentNode) ripple.remove();
        }, 600);
      });
    });
  }

  // ─── CARD THEMES ───────────────────────────────────────────────────

  const THEMES = ['sapphire', 'emerald', 'purple', 'gold', 'ruby', 'cyan', 'obsidian', 'rosegold'];

  /**
   * Set the theme for all cards in a container
   * @param {string} theme - Theme name
   * @param {HTMLElement} container - Container element
   */
  function setCardTheme(theme, container = document) {
    if (!THEMES.includes(theme)) return;

    container.querySelectorAll('.card, .stat-card').forEach(card => {
      THEMES.forEach(t => card.classList.remove(t));
      card.classList.add(theme);
      card.dataset.theme = theme;
    });
  }

  // ─── ENTRANCE ANIMATION ───────────────────────────────────────────

  /**
   * Trigger entrance animation for cards in a container
   * @param {HTMLElement} container - Container element
   */
  function triggerEntranceAnimation(container = document) {
    const cards = container.querySelectorAll('.card-enter:not(.entered)');

    cards.forEach((card, index) => {
      card.classList.add('entered');
      card.style.animationDelay = (index * 0.06) + 's';

      // Also trigger any counter animations inside
      const counter = card.querySelector('.counter-value:not(.animated)');
      if (counter) {
        // Counter will be animated by the counter observer or manual call
        setTimeout(() => {
          animateCounters(card);
        }, 100 + index * 60);
      }
    });
  }

  // ─── OBSERVER FOR DYNAMIC CARDS ──────────────────────────────────

  let observer = null;

  /**
   * Watch for new cards added to the DOM and enhance them
   */
  function watchForNewCards() {
    if (observer) {
      observer.disconnect();
      observer = null;
    }

    observer = new MutationObserver((mutations) => {
      let sawCard = false;

      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType !== 1) continue;

          if (node.matches && (
            node.matches('.card, .stat-card, .dash-card') ||
            node.querySelector && node.querySelector('.card, .stat-card, .dash-card')
          )) {
            sawCard = true;
            break;
          }
        }
        if (sawCard) break;
      }

      if (sawCard) {
        // Small delay for DOM to settle
        setTimeout(() => {
          const container = document.getElementById('dynamic-content') || document;
          triggerEntranceAnimation(container);
          setupRippleEffect(container);
          bindAllExpandable(container);
        }, 100);
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  // ─── INIT ───────────────────────────────────────────────────────────

  /**
   * Initialize card system
   * @param {HTMLElement} container - Container element (default: document)
   */
  function init(container = document) {
    // Trigger entrance animations
    triggerEntranceAnimation(container);

    // Set up ripple effects
    setupRippleEffect(container);

    // Bind expandable cards
    bindAllExpandable(container);

    // Animate any counters that are already visible
    animateCounters(container);

    // Watch for new cards
    watchForNewCards();

    // Listen for content changes
    document.addEventListener('contentLoaded', function (e) {
      const target = e.detail?.container || document;
      setTimeout(() => {
        triggerEntranceAnimation(target);
        setupRippleEffect(target);
        bindAllExpandable(target);
        animateCounters(target);
      }, 100);
    });

    // Also listen for navigation changes
    document.addEventListener('navigationChanged', function () {
      const container = document.getElementById('dynamic-content');
      if (container) {
        setTimeout(() => {
          triggerEntranceAnimation(container);
          setupRippleEffect(container);
          bindAllExpandable(container);
          animateCounters(container);
        }, 150);
      }
    });
  }

  // ─── PUBLIC API ─────────────────────────────────────────────────────

  return {
    renderStatCards,
    animateProgressBars,
    animateCounters,
    bindExpandable,
    bindAllExpandable,
    setupRippleEffect,
    setCardTheme,
    triggerEntranceAnimation,
    init,
    // Helpers
    escapeHTML,
    trendArrow,
    trendClass,
    THEMES
  };

})();

// ─── EXPOSE TO WINDOW ────────────────────────────────────────────────

window.Cards = Cards;

// Auto-init when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => Cards.init());
} else {
  Cards.init();
}
