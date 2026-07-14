/* ═══════════════════════════════════════════════════════════════════
   js/mobile/mobile-tables.js — Responsive table-to-card transform
   ═══════════════════════════════════════════════════════════════════
   Below the tablet breakpoint, wide data-tables (student lists, marks
   database, payment history) become unreadable even with horizontal
   scroll. This annotates every <td> with a `data-label` attribute
   copied from its column header, so CSS can lay the row out as a
   stacked label/value card instead — the CSS side of this is a
   `.data-table.mobile-stacked` rule using `content: attr(data-label)`,
   toggled by the class this file adds/removes at the breakpoint.

   Runs automatically on any `.data-table` present now or added later
   (via a MutationObserver), and re-evaluates on `breakpointChanged`
   (js/ui/responsive-ui.js) rather than raw resize events.

   Expected CSS: `.data-table.mobile-stacked` + `.data-table.mobile-
   stacked td::before { content: attr(data-label); }` (or equivalent).

   Last updated: 2026-07-13
   ═══════════════════════════════════════════════════════════════════ */

const MobileTables = (() => {

  // ─── CONFIGURATION ───────────────────────────────────────────────────

  const STACK_BREAKPOINTS = ['xs', 'sm', 'md']; // matches responsive-ui.js names, i.e. <= 768px
  let observer = null;
  let resizeTimeout = null;

  // ─── HELPERS ────────────────────────────────────────────────────────

  /**
   * Check if current breakpoint should stack tables
   * @returns {boolean} True if tables should be stacked
   */
  function shouldStack() {
    if (window.ResponsiveUI && typeof window.ResponsiveUI.getCurrentBreakpoint === 'function') {
      const bp = window.ResponsiveUI.getCurrentBreakpoint();
      return STACK_BREAKPOINTS.includes(bp);
    }
    // Fallback to window width
    return window.innerWidth <= 768;
  }

  /**
   * Clean a header text by removing sort arrows and extra whitespace
   * @param {string} text - The header text
   * @returns {string} Cleaned text
   */
  function cleanHeader(text) {
    return text
      .trim()
      .replace(/\s*\u2193\s*$/, '') // ↓ arrow
      .replace(/\s*\u2191\s*$/, '') // ↑ arrow
      .replace(/\s*↕\s*$/, '')      // ↕ arrow
      .trim();
  }

  /**
   * Annotate table cells with data-label attributes from headers
   * @param {HTMLTableElement} table - The table to annotate
   */
  function annotate(table) {
    const thead = table.querySelector('thead');
    if (!thead) return;

    // Get all header cells across all header rows
    const headerRows = thead.querySelectorAll('tr');
    const headerCells = [];

    headerRows.forEach(row => {
      const cells = row.querySelectorAll('th');
      cells.forEach((th, index) => {
        const text = cleanHeader(th.textContent);
        if (text) {
          // Store the most specific header (last one wins for multi-row headers)
          headerCells[index] = text;
        }
      });
    });

    // If no headers found, try a different approach
    if (headerCells.length === 0) {
      const firstRow = thead.querySelector('tr');
      if (firstRow) {
        firstRow.querySelectorAll('th').forEach((th, index) => {
          const text = cleanHeader(th.textContent);
          if (text) {
            headerCells[index] = text;
          }
        });
      }
    }

    // If still no headers, skip
    if (headerCells.length === 0) return;

    // Annotate each row
    table.querySelectorAll('tbody tr').forEach(row => {
      const cells = row.querySelectorAll('td');
      cells.forEach((td, index) => {
        const label = headerCells[index] || '';
        if (label) {
          td.setAttribute('data-label', label);
        }
      });
    });
  }

  /**
   * Apply stacked state to all tables
   */
  function applyStackedState() {
    const stack = shouldStack();

    document.querySelectorAll('.data-table').forEach(table => {
      if (stack) {
        // Annotate with labels if not already done
        const needsAnnotation = !table.querySelector('td[data-label]');
        if (needsAnnotation) {
          annotate(table);
        }
        table.classList.add('mobile-stacked');
      } else {
        table.classList.remove('mobile-stacked');
      }
    });
  }

  // ─── OBSERVER ───────────────────────────────────────────────────────

  /**
   * Watch for new tables added to the DOM
   */
  function watchForNewTables() {
    // Clean up existing observer
    if (observer) {
      observer.disconnect();
      observer = null;
    }

    observer = new MutationObserver((mutations) => {
      let sawTable = false;

      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType !== 1) continue;

          // Check if the node itself is a data-table
          if (node.matches && node.matches('.data-table')) {
            sawTable = true;
            break;
          }

          // Check if the node contains a data-table
          if (node.querySelector && node.querySelector('.data-table')) {
            sawTable = true;
            break;
          }
        }
        if (sawTable) break;
      }

      if (sawTable) {
        // Small delay to ensure the table is fully rendered
        setTimeout(applyStackedState, 50);
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  /**
   * Force re-annotation of all tables (useful after dynamic content changes)
   */
  function refreshAll() {
    document.querySelectorAll('.data-table').forEach(table => {
      // Clear existing annotations
      table.querySelectorAll('td[data-label]').forEach(td => {
        td.removeAttribute('data-label');
      });
      // Re-annotate
      annotate(table);
    });
    applyStackedState();
  }

  // ─── INIT ────────────────────────────────────────────────────────────

  /**
   * Initialize mobile tables
   */
  function init() {
    // Initial application
    applyStackedState();

    // Watch for new tables
    watchForNewTables();

    // Listen for breakpoint changes
    document.addEventListener('breakpointChanged', function () {
      // Re-apply stacked state
      applyStackedState();
    });

    // Listen for content changes that might affect tables
    document.addEventListener('contentLoaded', function () {
      refreshAll();
    });

    // Also listen for navigation changes
    document.addEventListener('navigationChanged', function () {
      // Small delay to let the new content render
      setTimeout(applyStackedState, 100);
    });

    // Clean up on page unload
    window.addEventListener('beforeunload', function () {
      if (observer) {
        observer.disconnect();
        observer = null;
      }
      if (resizeTimeout) {
        clearTimeout(resizeTimeout);
        resizeTimeout = null;
      }
    });
  }

  // ─── PUBLIC API ─────────────────────────────────────────────────────

  return {
    applyStackedState: applyStackedState,
    annotate: annotate,
    refreshAll: refreshAll,
    shouldStack: shouldStack,
    init: init
  };

})();

// ─── EXPOSE TO WINDOW ────────────────────────────────────────────────

window.MobileTables = MobileTables;

export default MobileTables;
export const { applyStackedState, annotate, refreshAll, shouldStack, init } = MobileTables;