/* ═══════════════════════════════════════════════════════════════════
   js/ui/skeletons.js — Skeleton loading placeholders
   ═══════════════════════════════════════════════════════════════════
   Purpose: Show loading placeholders while data is being fetched.
   Every module shows a skeleton before real content ever appears —
   never a blank flash.

   Usage:
     Skeletons.showIn(container, 'card', 3)
     Skeletons.showIn(container, 'list', 5)
     Skeletons.showIn(container, 'text', 1)
     Skeletons.showTableRows(container, { columns: 5, rows: 8 })
     Skeletons.clear(container)
     Skeletons.isActive(container)

   Base .skeleton / .skeleton-text / .skeleton-card / .skeleton-avatar
   classes are defined in css/components/loaders.css.

   Last updated: 2026-07-14
   ═══════════════════════════════════════════════════════════════════ */

const Skeletons = (() => {

  /* ═══════════════════════════════════════════════════════════════
     SKELETON BUILDERS
     ═══════════════════════════════════════════════════════════════ */

  /**
   * Build a card skeleton with avatar, title, and text lines
   * @param {number} index - Optional index for unique IDs
   * @returns {string} HTML string
   */
  function cardSkeleton(index = 0) {
    return `
            <div class="skeleton skeleton-card" style="margin-bottom:12px; padding:16px; border-radius:var(--r-md, 10px);">
                <div style="display:flex; align-items:center; gap:12px; margin-bottom:12px;">
                    <div class="skeleton skeleton-avatar" style="width:48px; height:48px; border-radius:50%;"></div>
                    <div style="flex:1; display:flex; flex-direction:column; gap:6px;">
                        <div class="skeleton skeleton-text" style="width:60%; height:14px;"></div>
                        <div class="skeleton skeleton-text sm" style="width:35%; height:10px;"></div>
                    </div>
                </div>
                <div style="display:flex; flex-direction:column; gap:6px;">
                    <div class="skeleton skeleton-text" style="width:90%; height:10px;"></div>
                    <div class="skeleton skeleton-text" style="width:75%; height:10px;"></div>
                    <div class="skeleton skeleton-text" style="width:85%; height:10px;"></div>
                </div>
                <div style="display:flex; gap:8px; margin-top:12px;">
                    <div class="skeleton" style="width:60px; height:28px; border-radius:var(--r-sm, 6px);"></div>
                    <div class="skeleton" style="width:80px; height:28px; border-radius:var(--r-sm, 6px);"></div>
                </div>
            </div>
        `;
  }

  /**
   * Build a list row skeleton with avatar and text
   * @param {number} index - Optional index for unique IDs
   * @returns {string} HTML string
   */
  function listRowSkeleton(index = 0) {
    return `
            <div style="display:flex; align-items:center; gap:12px; padding:10px 0; border-bottom:1px solid rgba(26,20,16,0.04);">
                <div class="skeleton skeleton-avatar" style="width:36px; height:36px; border-radius:50%; flex-shrink:0;"></div>
                <div style="flex:1; display:flex; flex-direction:column; gap:5px;">
                    <div class="skeleton skeleton-text" style="width:55%; height:12px;"></div>
                    <div class="skeleton skeleton-text sm" style="width:30%; height:9px;"></div>
                </div>
                <div class="skeleton" style="width:60px; height:20px; border-radius:var(--r-sm, 6px); flex-shrink:0;"></div>
            </div>
        `;
  }

  /**
   * Build a text skeleton with multiple lines
   * @param {number} count - Number of text lines
   * @returns {string} HTML string
   */
  function textSkeleton(count = 4) {
    const lines = Array.from({ length: count }, (_, i) => {
      const width = 70 + Math.round(Math.random() * 25);
      return `<div class="skeleton skeleton-text" style="width:${width}%; height:${i === 0 ? 18 : 12}px; margin-bottom:6px;"></div>`;
    }).join('');

    return `
            <div style="display:flex; flex-direction:column; gap:4px; padding:8px 0;">
                ${lines}
            </div>
        `;
  }

  /**
   * Build a compact card skeleton (for stats, mini cards)
   * @returns {string} HTML string
   */
  function compactCardSkeleton() {
    return `
            <div class="skeleton skeleton-card" style="padding:14px; border-radius:var(--r-md, 10px);">
                <div style="display:flex; align-items:center; gap:10px;">
                    <div class="skeleton" style="width:32px; height:32px; border-radius:var(--r-sm, 6px); flex-shrink:0;"></div>
                    <div style="flex:1; display:flex; flex-direction:column; gap:4px;">
                        <div class="skeleton skeleton-text" style="width:40%; height:16px;"></div>
                        <div class="skeleton skeleton-text sm" style="width:25%; height:10px;"></div>
                    </div>
                </div>
            </div>
        `;
  }

  /**
   * Build a chart skeleton (bar chart placeholder)
   * @param {number} bars - Number of bars to show
   * @returns {string} HTML string
   */
  function chartSkeleton(bars = 8) {
    const barHeights = Array.from({ length: bars }, () => 20 + Math.round(Math.random() * 60));
    const barsHtml = barHeights.map(h => `
            <div class="skeleton" style="width:${100 / bars - 2}%; height:${h}%; border-radius:var(--r-sm, 6px); min-height:8px;"></div>
        `).join('');

    return `
            <div style="display:flex; align-items:flex-end; gap:4px; height:160px; padding:12px 0;">
                ${barsHtml}
            </div>
        `;
  }

  /* ═══════════════════════════════════════════════════════════════
     BUILDER REGISTRY
     ═══════════════════════════════════════════════════════════════ */

  const BUILDERS = {
    card: cardSkeleton,
    list: listRowSkeleton,
    text: textSkeleton,
    compact: compactCardSkeleton,
    chart: chartSkeleton
  };

  /* ═══════════════════════════════════════════════════════════════
     PUBLIC API
     ═══════════════════════════════════════════════════════════════ */

  /**
   * Show skeleton placeholders in a container
   * @param {HTMLElement} container - The container element
   * @param {string} type - 'card', 'list', 'text', 'compact', or 'chart'
   * @param {number} count - Number of skeletons to show (default: 3)
   */
  function showIn(container, type = 'card', count = 3) {
    if (!container) return;

    const builder = BUILDERS[type] || BUILDERS.card;
    container.dataset.skeletonActive = 'true';

    const items = Array.from({ length: count }, (_, i) => builder(i));
    container.innerHTML = items.join('');
  }

  /**
   * Show a table skeleton with specified columns and rows
   * @param {HTMLElement} container - The container element
   * @param {object} options - Configuration
   * @param {number} options.columns - Number of columns (default: 4)
   * @param {number} options.rows - Number of rows (default: 6)
   * @param {boolean} options.withHeader - Include header row (default: true)
   * @param {string} options.tableClass - Additional table classes
   */
  function showTableRows(container, {
    columns = 4,
    rows = 6,
    withHeader = true,
    tableClass = ''
  } = {}) {
    if (!container) return;

    container.dataset.skeletonActive = 'true';

    // Header
    const headerCells = Array.from({ length: columns }, () => `
            <th><div class="skeleton skeleton-text sm" style="width:60%; height:10px;"></div></th>
        `).join('');

    // Body rows with random widths for natural look
    const bodyRows = Array.from({ length: rows }, () => {
      const cells = Array.from({ length: columns }, () => {
        const width = 50 + Math.round(Math.random() * 45);
        return `<td><div class="skeleton skeleton-text" style="width:${width}%; height:10px;"></div></td>`;
      }).join('');
      return `<tr>${cells}</tr>`;
    }).join('');

    const headerHtml = withHeader ? `<thead><tr>${headerCells}</tr></thead>` : '';

    container.innerHTML = `
            <div class="table-wrap">
                <table class="data-table ${tableClass}">
                    ${headerHtml}
                    <tbody>${bodyRows}</tbody>
                </table>
            </div>
        `;
  }

  /**
   * Show a grid skeleton (cards in a grid layout)
   * @param {HTMLElement} container - The container element
   * @param {object} options - Configuration
   * @param {number} options.columns - Number of columns (default: 3)
   * @param {number} options.rows - Number of rows (default: 2)
   */
  function showGrid(container, { columns = 3, rows = 2 } = {}) {
    if (!container) return;

    container.dataset.skeletonActive = 'true';
    container.style.display = 'grid';
    container.style.gridTemplateColumns = `repeat(${columns}, 1fr)`;
    container.style.gap = '16px';

    const total = columns * rows;
    const items = Array.from({ length: total }, () => cardSkeleton());
    container.innerHTML = items.join('');
  }

  /**
   * Show a stats grid skeleton (compact stat cards)
   * @param {HTMLElement} container - The container element
   * @param {number} count - Number of stat cards (default: 4)
   */
  function showStatsGrid(container, count = 4) {
    if (!container) return;

    container.dataset.skeletonActive = 'true';
    container.style.display = 'grid';
    container.style.gridTemplateColumns = `repeat(auto-fit, minmax(180px, 1fr))`;
    container.style.gap = '14px';

    const items = Array.from({ length: count }, () => compactCardSkeleton());
    container.innerHTML = items.join('');
  }

  /**
   * Clear all skeleton placeholders from a container
   * @param {HTMLElement} container - The container element
   */
  function clear(container) {
    if (!container) return;
    delete container.dataset.skeletonActive;
    container.innerHTML = '';

    // Reset grid styles if they were applied
    container.style.display = '';
    container.style.gridTemplateColumns = '';
    container.style.gap = '';
  }

  /**
   * Check if a container currently has skeletons active
   * @param {HTMLElement} container - The container element
   * @returns {boolean} True if skeletons are active
   */
  function isActive(container) {
    return container?.dataset.skeletonActive === 'true';
  }

  /**
   * Replace skeletons with content smoothly (fade transition)
   * @param {HTMLElement} container - The container element
   * @param {string} content - The new HTML content
   */
  function replaceWithContent(container, content) {
    if (!container) return;

    container.style.transition = 'opacity 0.3s ease';
    container.style.opacity = '0.4';

    setTimeout(() => {
      container.innerHTML = content;
      delete container.dataset.skeletonActive;
      container.style.opacity = '1';
    }, 150);
  }

  /* ═══════════════════════════════════════════════════════════════
     EXPORTS
     ═══════════════════════════════════════════════════════════════ */

  return {
    // Primary API
    showIn,
    showTableRows,
    showGrid,
    showStatsGrid,
    clear,
    isActive,
    replaceWithContent,

    // Individual builders (for custom composition)
    builders: BUILDERS,
    cardSkeleton,
    listRowSkeleton,
    textSkeleton,
    compactCardSkeleton,
    chartSkeleton
  };

})();

// ─── EXPOSE TO WINDOW ───────────────────────────────────────────────
window.Skeletons = Skeletons;

export default Skeletons;