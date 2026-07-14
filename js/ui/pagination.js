/* ═══════════════════════════════════════════════════════════════════
   js/ui/pagination.js — Pagination controller
   ═══════════════════════════════════════════════════════════════════
   Purpose: Provide a reusable pagination component with two variants.

   Usage:
     const pager = Pagination.create(container, {
       totalItems: 428,
       pageSize: 25,
       currentPage: 1,
       variant: 'full',      // 'full' | 'compact'
       pageSizeOptions: [25, 50, 100],
       onPageChange: (page, pageSize) => { load data }
     });

pager.setTotalItems(500);     // Update total count
pager.setPage(3);             // Go to page 3
pager.getPage();              // Returns current page
pager.getPageSize();          // Returns current page size
pager.destroy();              // Clean up

'full' — numbered pages with ellipsis collapsing + rows - per - page +
  "Showing X–Y of Z" label.Used for tables.
   'compact' — just prev / next, for small dashboard widgets / feeds.

   Expected CSS classes: .pagination, .pagination--compact, .page - btn,
   .page - btn.active, .page - btn.ellipsis, .page - btn[disabled],
   .pagination - meta, .pagination - size - select.

   Last updated: 2026-07 - 14
   ═══════════════════════════════════════════════════════════════════ */

const Pagination = (() => {

  /* ═══════════════════════════════════════════════════════════════
     SVG ICONS
     ═══════════════════════════════════════════════════════════════ */

  const ICONS = {
    prev: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>`,
    next: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>`,
    doubleLeft: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="11 18 5 12 11 6"/><polyline points="18 18 12 12 18 6"/></svg>`,
    doubleRight: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="13 6 19 12 13 18"/><polyline points="6 6 12 12 6 18"/></svg>`
  };

  /* ═══════════════════════════════════════════════════════════════
     INTERNAL HELPERS
     ═══════════════════════════════════════════════════════════════ */

  /**
   * Build the page list with ellipsis collapsing
   * @param {number} total - Total number of pages
   * @param {number} current - Current page number
   * @param {number} delta - Number of pages to show around current
   * @returns {Array} Array of page numbers and '...' strings
   */
  function buildPageList(total, current, delta = 2) {
    if (total <= 1) return [1];

    const pages = [];
    const range = new Set([1, total]);

    // Add pages around the current page
    for (let i = current - delta; i <= current + delta; i++) {
      if (i > 1 && i < total) {
        range.add(i);
      }
    }

    // Also add pages at the beginning and end
    for (let i = 2; i <= Math.min(3, total); i++) {
      range.add(i);
    }
    for (let i = total - 2; i <= total - 1; i++) {
      if (i > 1 && i < total) {
        range.add(i);
      }
    }

    const sorted = [...range].sort((a, b) => a - b);

    // Insert ellipsis where there are gaps
    let prev = 0;
    for (const p of sorted) {
      if (prev && p - prev > 1) {
        pages.push('...');
      }
      pages.push(p);
      prev = p;
    }

    return pages;
  }

  /**
   * Create a page button element
   * @param {number|string} page - Page number or '...'
   * @param {number} current - Current page number
   * @param {Function} onClick - Click handler
   * @returns {HTMLElement} Button element
   */
  function createPageButton(page, current, onClick) {
    if (page === '...') {
      const span = document.createElement('span');
      span.className = 'page-btn ellipsis';
      span.textContent = '…';
      span.setAttribute('aria-hidden', 'true');
      return span;
    }

    const btn = document.createElement('button');
    btn.className = `page-btn${page === current ? ' active' : ''}`;
    btn.textContent = page;
    btn.dataset.page = page;
    btn.setAttribute('aria-label', `Go to page ${page}`);
    btn.setAttribute('role', 'button');

    if (page === current) {
      btn.setAttribute('aria-current', 'page');
    }

    btn.addEventListener('click', (e) => {
      e.preventDefault();
      onClick(page);
    });

    return btn;
  }

  /* ═══════════════════════════════════════════════════════════════
     PAGINATION INSTANCE
     ═══════════════════════════════════════════════════════════════ */

  /**
   * Create a pagination instance
   * @param {HTMLElement} container - Container element
   * @param {object} opts - Configuration options
   * @returns {object} Pagination instance
   */
  function create(container, opts = {}) {
    if (!container) {
      throw new Error('Pagination: container element is required');
    }

    const state = {
      totalItems: opts.totalItems ?? 0,
      pageSize: opts.pageSize ?? 25,
      currentPage: opts.currentPage ?? 1,
      variant: opts.variant ?? 'full',
      pageSizeOptions: opts.pageSizeOptions ?? [25, 50, 100],
      delta: opts.delta ?? 2,
      onPageChange: opts.onPageChange ?? (() => { })
    };

    let isDestroyed = false;
    let eventListeners = [];

    /**
     * Calculate total pages
     * @returns {number} Total number of pages
     */
    function totalPages() {
      return Math.max(1, Math.ceil(state.totalItems / state.pageSize));
    }

    /**
     * Clamp a page number to valid range
     * @param {number} p - Page number
     * @returns {number} Clamped page number
     */
    function clampPage(p) {
      return Math.min(Math.max(1, p), totalPages());
    }

    /**
     * Navigate to a specific page
     * @param {number} page - Page number
     */
    function goTo(page) {
      if (isDestroyed) return;

      const clamped = clampPage(page);
      if (clamped === state.currentPage && container.dataset.rendered) {
        return;
      }

      state.currentPage = clamped;
      render();
      state.onPageChange(state.currentPage, state.pageSize);
    }

    /**
     * Change the page size
     * @param {number} size - New page size
     */
    function changePageSize(size) {
      if (isDestroyed) return;

      // Calculate which page the first item would be on with the new size
      const firstItemIndex = (state.currentPage - 1) * state.pageSize;
      state.pageSize = size;
      state.currentPage = clampPage(Math.floor(firstItemIndex / size) + 1);

      render();
      state.onPageChange(state.currentPage, state.pageSize);
    }

    /**
     * Add an event listener with cleanup tracking
     * @param {HTMLElement} el - Element to bind to
     * @param {string} event - Event name
     * @param {Function} handler - Event handler
     */
    function addEventListener(el, event, handler) {
      el.addEventListener(event, handler);
      eventListeners.push({ el, event, handler });
    }

    /**
     * Render the pagination component
     */
    function render() {
      if (isDestroyed) return;

      container.dataset.rendered = 'true';
      const total = totalPages();

      // ── Compact Variant ──────────────────────────────────────

      if (state.variant === 'compact') {
        container.innerHTML = `
                    <div class="pagination pagination--compact">
                        <button class="page-btn" data-action="prev" ${state.currentPage <= 1 ? 'disabled' : ''} aria-label="Previous page">
                            ${ICONS.prev}
                        </button>
                        <span class="pagination-meta">${state.currentPage} / ${total}</span>
                        <button class="page-btn" data-action="next" ${state.currentPage >= total ? 'disabled' : ''} aria-label="Next page">
                            ${ICONS.next}
                        </button>
                    </div>
                `;

        // Wire events
        const prevBtn = container.querySelector('[data-action="prev"]');
        const nextBtn = container.querySelector('[data-action="next"]');

        if (prevBtn) addEventListener(prevBtn, 'click', () => goTo(state.currentPage - 1));
        if (nextBtn) addEventListener(nextBtn, 'click', () => goTo(state.currentPage + 1));

        return;
      }

      // ── Full Variant ─────────────────────────────────────────

      const startItem = state.totalItems === 0 ? 0 : (state.currentPage - 1) * state.pageSize + 1;
      const endItem = Math.min(state.currentPage * state.pageSize, state.totalItems);

      const pageList = buildPageList(total, state.currentPage, state.delta);

      // Build page buttons
      const pageButtonsHtml = pageList.map(p => {
        if (p === '...') {
          return `<span class="page-btn ellipsis" aria-hidden="true">…</span>`;
        }
        const active = p === state.currentPage ? 'active' : '';
        return `<button class="page-btn ${active}" data-page="${p}" aria-label="Go to page ${p}"${p === state.currentPage ? ' aria-current="page"' : ''}>${p}</button>`;
      }).join('');

      // Build page size options
      const sizeOptionsHtml = state.pageSizeOptions.map(n =>
        `<option value="${n}" ${n === state.pageSize ? 'selected' : ''}>${n}</option>`
      ).join('');

      container.innerHTML = `
                <div class="pagination-wrapper">
                    <div class="pagination">
                        <button class="page-btn" data-action="first" ${state.currentPage <= 1 ? 'disabled' : ''} aria-label="First page">
                            ${ICONS.doubleLeft}
                        </button>
                        <button class="page-btn" data-action="prev" ${state.currentPage <= 1 ? 'disabled' : ''} aria-label="Previous page">
                            ${ICONS.prev}
                        </button>
                        ${pageButtonsHtml}
                        <button class="page-btn" data-action="next" ${state.currentPage >= total ? 'disabled' : ''} aria-label="Next page">
                            ${ICONS.next}
                        </button>
                        <button class="page-btn" data-action="last" ${state.currentPage >= total ? 'disabled' : ''} aria-label="Last page">
                            ${ICONS.doubleRight}
                        </button>
                    </div>
                    <div class="pagination-controls">
                        <span class="pagination-meta">
                            ${state.totalItems > 0 ? `Showing ${startItem}–${endItem} of ${state.totalItems}` : 'No items'}
                        </span>
                        <select class="pagination-size-select" data-action="pageSize" aria-label="Items per page">
                            ${sizeOptionsHtml}
                        </select>
                    </div>
                </div>
            `;

      // ── Wire events ──────────────────────────────────────────

      const firstBtn = container.querySelector('[data-action="first"]');
      const prevBtn = container.querySelector('[data-action="prev"]');
      const nextBtn = container.querySelector('[data-action="next"]');
      const lastBtn = container.querySelector('[data-action="last"]');
      const pageBtns = container.querySelectorAll('[data-page]');
      const sizeSelect = container.querySelector('[data-action="pageSize"]');

      if (firstBtn) addEventListener(firstBtn, 'click', () => goTo(1));
      if (prevBtn) addEventListener(prevBtn, 'click', () => goTo(state.currentPage - 1));
      if (nextBtn) addEventListener(nextBtn, 'click', () => goTo(state.currentPage + 1));
      if (lastBtn) addEventListener(lastBtn, 'click', () => goTo(total));

      pageBtns.forEach(btn => {
        addEventListener(btn, 'click', () => {
          goTo(parseInt(btn.dataset.page, 10));
        });
      });

      if (sizeSelect) {
        addEventListener(sizeSelect, 'change', (e) => {
          changePageSize(parseInt(e.target.value, 10));
        });
      }

      // ── Keyboard navigation ──────────────────────────────────

      // Allow arrow keys to navigate between page buttons
      container.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowLeft') {
          e.preventDefault();
          goTo(state.currentPage - 1);
        }
        if (e.key === 'ArrowRight') {
          e.preventDefault();
          goTo(state.currentPage + 1);
        }
        if (e.key === 'Home') {
          e.preventDefault();
          goTo(1);
        }
        if (e.key === 'End') {
          e.preventDefault();
          goTo(total);
        }
      });
    }

    /* ═══════════════════════════════════════════════════════════════
       PUBLIC API
       ═══════════════════════════════════════════════════════════════ */

    /**
     * Set the total number of items
     * @param {number} n - Total items
     */
    function setTotalItems(n) {
      if (isDestroyed) return;
      state.totalItems = Math.max(0, n);
      state.currentPage = clampPage(state.currentPage);
      render();
    }

    /**
     * Set the current page
     * @param {number} page - Page number
     */
    function setPage(page) {
      goTo(page);
    }

    /**
     * Get the current page number
     * @returns {number} Current page
     */
    function getPage() {
      return state.currentPage;
    }

    /**
     * Get the current page size
     * @returns {number} Current page size
     */
    function getPageSize() {
      return state.pageSize;
    }

    /**
     * Get the total number of items
     * @returns {number} Total items
     */
    function getTotalItems() {
      return state.totalItems;
    }

    /**
     * Get the total number of pages
     * @returns {number} Total pages
     */
    function getTotalPages() {
      return totalPages();
    }

    /**
     * Destroy the pagination instance
     */
    function destroy() {
      if (isDestroyed) return;
      isDestroyed = true;

      // Remove all event listeners
      eventListeners.forEach(({ el, event, handler }) => {
        el.removeEventListener(event, handler);
      });
      eventListeners = [];

      container.innerHTML = '';
      delete container.dataset.rendered;
    }

    // ── Initial render ────────────────────────────────────────────

    render();

    // ── Return API ────────────────────────────────────────────────

    return {
      setTotalItems,
      setPage,
      getPage,
      getPageSize,
      getTotalItems,
      getTotalPages,
      destroy
    };
  }

  /* ═══════════════════════════════════════════════════════════════════
     EXPORTS
     ═══════════════════════════════════════════════════════════════════ */

  return { create };

})();

// ─── EXPOSE TO WINDOW ───────────────────────────────────────────────
window.Pagination = Pagination;

export default Pagination;