/* ═══════════════════════════════════════════════════════════════════
   js/ui/tables.js — DataTable controller
   ═══════════════════════════════════════════════════════════════════
   Purpose: Create sortable, paginated tables with selection support.

   Usage:
     const table = DataTable.create(container, {
       columns: [
         { key: 'name', label: 'Name', sortable: true },
         { key: 'age', label: 'Age', sortable: true, align: 'center' },
         { key: 'status', label: 'Status', render: (row) => `<span class="badge">${row.status}</span>` }
       ],
       data: [...],
       rowKey: 'id',
       selectable: true,
       pageSize: 25,
       emptyState: { icon: '📭', title: 'No records', message: 'Try adjusting your filters' },
       onSelectionChange: (selectedIds) => { ... },
       onRowClick: (row) => { ... }
     });

     // API
     table.setData(newRows)
     table.getSelected()          // -> array of selected IDs
     table.clearSelection()
     table.showLoading(rows)
     table.destroy()

   Expected CSS classes: .data-table, .table-wrap, .table-sort-icon,
   .checkbox, .checkbox__box (from forms.css), and skeleton classes.

   Last updated: 2026-07-14
   ═══════════════════════════════════════════════════════════════════ */

const DataTable = (() => {

  /* ═══════════════════════════════════════════════════════════════
     INTERNAL STATE
     ═══════════════════════════════════════════════════════════════ */

  const _instances = new WeakMap();

  /* ═══════════════════════════════════════════════════════════════
     CREATE
     ═══════════════════════════════════════════════════════════════ */

  /**
   * Create a new DataTable instance
   * @param {HTMLElement} container - The container element
   * @param {object} opts - Configuration options
   * @param {array} opts.columns - Column definitions
   * @param {array} opts.data - Initial data rows
   * @param {string} opts.rowKey - Unique key field (default: 'id')
   * @param {boolean} opts.selectable - Enable row selection (default: false)
   * @param {number} opts.pageSize - Rows per page (default: 25)
   * @param {object} opts.emptyState - Empty state configuration
   * @param {function} opts.onSelectionChange - Selection change callback
   * @param {function} opts.onRowClick - Row click callback
   * @returns {object} Table instance with API methods
   */
  function create(container, opts) {
    if (!container) {
      console.warn('[DataTable] No container provided');
      return null;
    }

    // ── State ──────────────────────────────────────────────────────

    const state = {
      columns: opts.columns || [],
      data: opts.data || [],
      rowKey: opts.rowKey || 'id',
      selectable: !!opts.selectable,
      pageSize: opts.pageSize || 25,
      sortKey: null,
      sortDir: 'asc',
      selected: new Set(),
      currentPage: 1,
      totalPages: 1,
      paginationElement: null,
      onSelectionChange: opts.onSelectionChange || null,
      onRowClick: opts.onRowClick || null,
      emptyState: opts.emptyState || {
        icon: '📭',
        title: 'No records found',
        message: 'Try adjusting your filters or add new data.'
      }
    };

    _instances.set(container, state);

    /* ═══════════════════════════════════════════════════════════
       INTERNAL HELPERS
       ═══════════════════════════════════════════════════════════ */

    /**
     * Get sorted data
     * @returns {array} Sorted data array
     */
    function getSortedData() {
      if (!state.sortKey) return state.data;

      const col = state.columns.find(c => c.key === state.sortKey);
      const dir = state.sortDir === 'asc' ? 1 : -1;

      return [...state.data].sort((a, b) => {
        let av = col?.sortValue ? col.sortValue(a) : a[state.sortKey];
        let bv = col?.sortValue ? col.sortValue(b) : b[state.sortKey];

        // Handle null/undefined values
        if (av == null) return 1;
        if (bv == null) return -1;

        // Number comparison
        if (typeof av === 'number' && typeof bv === 'number') {
          return (av - bv) * dir;
        }

        // String comparison
        return String(av).localeCompare(String(bv)) * dir;
      });
    }

    /**
     * Get paginated data for the current page
     * @returns {array} Current page data
     */
    function getCurrentPageData() {
      const sorted = getSortedData();
      const total = sorted.length;
      state.totalPages = Math.max(1, Math.ceil(total / state.pageSize));

      // Clamp current page
      if (state.currentPage > state.totalPages) {
        state.currentPage = state.totalPages;
      }
      if (state.currentPage < 1) {
        state.currentPage = 1;
      }

      const start = (state.currentPage - 1) * state.pageSize;
      const end = Math.min(start + state.pageSize, total);

      return sorted.slice(start, end);
    }

    /**
     * Render a cell value
     * @param {object} col - Column definition
     * @param {object} row - Data row
     * @returns {string} Rendered cell HTML
     */
    function renderCell(col, row) {
      if (col.render) {
        return col.render(row);
      }
      const value = row[col.key];
      return value !== undefined && value !== null ? String(value) : '—';
    }

    /**
     * Escape HTML to prevent XSS (fallback if window.esc is unavailable)
     */
    function esc(str) {
      if (typeof window.esc === 'function') return window.esc(str);
      if (!str) return '';
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }

    /* ═══════════════════════════════════════════════════════════
       RENDERERS
       ═══════════════════════════════════════════════════════════ */

    /**
     * Render the table
     */
    function renderTable() {
      const pageData = getCurrentPageData();

      if (state.data.length === 0) {
        renderEmptyState();
        return;
      }

      // ── Build header ──
      let headerCells = '';
      let selectAllCell = '';

      // Select all checkbox
      if (state.selectable) {
        const allSelected = pageData.every(r => state.selected.has(r[state.rowKey]));
        selectAllCell = `
                    <th style="width:36px; text-align:center;">
                        <label class="checkbox checkbox-sm">
                            <input type="checkbox" data-select-all ${allSelected ? 'checked' : ''} />
                            <span class="checkbox__box">
                                <svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
                            </span>
                        </label>
                    </th>
                `;
      }

      // Column headers
      headerCells = state.columns.map(col => {
        const isSorted = state.sortKey === col.key;
        const sortableClass = col.sortable ? 'sortable' : '';
        const alignStyle = col.align ? `text-align:${col.align}` : '';
        const sortIcon = col.sortable
          ? `<span class="table-sort-icon ${isSorted ? state.sortDir : ''}">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                            <polyline points="18 15 12 9 6 15"/>
                        </svg>
                       </span>`
          : '';

        return `<th data-key="${col.key}" class="${sortableClass}" style="${alignStyle}">${esc(col.label)}${sortIcon}</th>`;
      }).join('');

      // ── Build body ──
      const bodyRows = pageData.map(row => {
        const rowKey = row[state.rowKey];
        const isSelected = state.selected.has(rowKey);

        // Selection checkbox
        let selectCell = '';
        if (state.selectable) {
          selectCell = `
                        <td style="text-align:center;">
                            <label class="checkbox checkbox-sm">
                                <input type="checkbox" data-row-select="${esc(rowKey)}" ${isSelected ? 'checked' : ''} />
                                <span class="checkbox__box">
                                    <svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
                                </span>
                            </label>
                        </td>
                    `;
        }

        // Data cells
        const dataCells = state.columns.map(col => {
          const alignStyle = col.align ? `text-align:${col.align}` : '';
          const content = renderCell(col, row);
          return `<td style="${alignStyle}">${content}</td>`;
        }).join('');

        return `<tr data-row-key="${esc(rowKey)}">${selectCell}${dataCells}</tr>`;
      }).join('');

      // ── Assemble table ──
      container.innerHTML = `
                <div class="table-wrap">
                    <table class="data-table">
                        <thead>
                            <tr>${selectAllCell}${headerCells}</tr>
                        </thead>
                        <tbody>${bodyRows}</tbody>
                    </table>
                </div>
                <div class="table-pager" data-pager></div>
            `;

      // ── Wire events ──
      wireHeaderEvents();
      wireRowEvents();
      wirePager();

      // Dispatch a custom event for other modules
      container.dispatchEvent(new CustomEvent('tableRendered', {
        detail: { rows: pageData.length, total: state.data.length }
      }));
    }

    /**
     * Render empty state
     */
    function renderEmptyState() {
      const { icon, title, message } = state.emptyState;

      // Try to use EmptyStates if available
      if (window.EmptyStates && typeof window.EmptyStates.renderInto === 'function') {
        window.EmptyStates.renderInto(container, state.emptyState);
        return;
      }

      // Fallback empty state
      container.innerHTML = `
                <div class="empty-state" style="display:flex; flex-direction:column; align-items:center; justify-content:center; padding:48px 20px; text-align:center; color:var(--text-soft, #6b5f56);">
                    <div style="font-size:48px; margin-bottom:12px; opacity:0.5;">${icon || '📭'}</div>
                    <h3 style="font-size:18px; font-weight:600; color:var(--text-body, #2c241e); margin-bottom:4px;">${esc(title || 'No records found')}</h3>
                    <p style="color:var(--text-muted, #a8988e); font-size:14px;">${esc(message || 'Try adjusting your filters or add new data.')}</p>
                </div>
            `;
    }

    /* ═══════════════════════════════════════════════════════════
       EVENT WIRING
       ═══════════════════════════════════════════════════════════ */

    /**
     * Wire header events (sorting + select all)
     */
    function wireHeaderEvents() {
      // Sortable headers
      container.querySelectorAll('th.sortable').forEach(th => {
        th.addEventListener('click', () => {
          toggleSort(th.dataset.key);
        });
      });

      // Select all checkbox
      const selectAll = container.querySelector('[data-select-all]');
      if (selectAll) {
        selectAll.addEventListener('change', (e) => {
          const pageData = getCurrentPageData();
          if (e.target.checked) {
            pageData.forEach(r => state.selected.add(r[state.rowKey]));
          } else {
            pageData.forEach(r => state.selected.delete(r[state.rowKey]));
          }
          if (state.onSelectionChange) {
            state.onSelectionChange([...state.selected]);
          }
          renderTable();
        });
      }
    }

    /**
     * Wire row events (selection + click)
     */
    function wireRowEvents() {
      // Row selection checkboxes
      container.querySelectorAll('[data-row-select]').forEach(cb => {
        cb.addEventListener('change', (e) => {
          const rowKey = cb.dataset.rowSelect;
          // Find the actual key in the data (handles type mismatches)
          const actualKey = state.data.find(
            r => String(r[state.rowKey]) === String(rowKey)
          )?.[state.rowKey] ?? rowKey;

          if (e.target.checked) {
            state.selected.add(actualKey);
          } else {
            state.selected.delete(actualKey);
          }

          if (state.onSelectionChange) {
            state.onSelectionChange([...state.selected]);
          }

          // Update select-all state
          updateSelectAllState();
        });
      });

      // Row click (if callback provided)
      if (state.onRowClick) {
        container.querySelectorAll('tbody tr').forEach(tr => {
          tr.addEventListener('click', (e) => {
            // Ignore clicks on checkboxes
            if (e.target.closest('[data-row-select]')) return;
            if (e.target.closest('.checkbox')) return;

            const key = tr.dataset.rowKey;
            const row = state.data.find(r => String(r[state.rowKey]) === key);
            if (row) state.onRowClick(row);
          });

          // Add cursor pointer
          tr.style.cursor = 'pointer';
        });
      }
    }

    /**
     * Update the select-all checkbox state
     */
    function updateSelectAllState() {
      const selectAll = container.querySelector('[data-select-all]');
      if (!selectAll) return;

      const pageData = getCurrentPageData();
      const allSelected = pageData.every(r => state.selected.has(r[state.rowKey]));
      const someSelected = pageData.some(r => state.selected.has(r[state.rowKey]));

      selectAll.checked = allSelected;
      selectAll.indeterminate = !allSelected && someSelected;
    }

    /**
     * Wire pagination
     */
    function wirePager() {
      const pagerEl = container.querySelector('[data-pager]');
      if (!pagerEl) return;

      // Use Pagination utility if available
      if (window.Pagination && typeof window.Pagination.create === 'function') {
        state.paginationElement = window.Pagination.create(pagerEl, {
          totalItems: state.data.length,
          pageSize: state.pageSize,
          currentPage: state.currentPage,
          variant: 'full',
          onPageChange: (page) => {
            state.currentPage = page;
            renderTable();
          }
        });
        return;
      }

      // Fallback: simple pagination buttons
      const total = state.data.length;
      const totalPages = Math.max(1, Math.ceil(total / state.pageSize));
      const current = state.currentPage;

      let html = `<div class="pagination" style="display:flex; align-items:center; gap:4px; padding:12px 0; justify-content:center; flex-wrap:wrap;">`;

      // Previous button
      html += `<button class="page-btn" data-page="prev" ${current <= 1 ? 'disabled' : ''}><svg viewBox="0 0 24 24" width="16" height="16"><polyline points="15 18 9 12 15 6" stroke="currentColor" fill="none" stroke-width="2"/></svg></button>`;

      // Page numbers
      const startPage = Math.max(1, current - 2);
      const endPage = Math.min(totalPages, current + 2);

      if (startPage > 1) {
        html += `<button class="page-btn" data-page="1">1</button>`;
        if (startPage > 2) html += `<span class="pagination-ellipsis">…</span>`;
      }

      for (let i = startPage; i <= endPage; i++) {
        html += `<button class="page-btn ${i === current ? 'active' : ''}" data-page="${i}">${i}</button>`;
      }

      if (endPage < totalPages) {
        if (endPage < totalPages - 1) html += `<span class="pagination-ellipsis">…</span>`;
        html += `<button class="page-btn" data-page="${totalPages}">${totalPages}</button>`;
      }

      // Next button
      html += `<button class="page-btn" data-page="next" ${current >= totalPages ? 'disabled' : ''}><svg viewBox="0 0 24 24" width="16" height="16"><polyline points="9 18 15 12 9 6" stroke="currentColor" fill="none" stroke-width="2"/></svg></button>`;

      // Page info
      html += `<span style="font-size:12px; color:var(--text-muted, #a8988e); margin-left:8px;">${total} item${total !== 1 ? 's' : ''}</span>`;

      html += `</div>`;
      pagerEl.innerHTML = html;

      // Wire pagination events
      pagerEl.querySelectorAll('.page-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const page = btn.dataset.page;
          if (page === 'prev' && state.currentPage > 1) {
            state.currentPage--;
          } else if (page === 'next' && state.currentPage < totalPages) {
            state.currentPage++;
          } else if (page && !isNaN(page)) {
            state.currentPage = parseInt(page, 10);
          }
          renderTable();
        });
      });
    }

    /* ═══════════════════════════════════════════════════════════
       PUBLIC API
       ═══════════════════════════════════════════════════════════ */

    /**
     * Toggle sorting by a column
     * @param {string} key - Column key to sort by
     */
    function toggleSort(key) {
      const col = state.columns.find(c => c.key === key);
      if (!col?.sortable) return;

      if (state.sortKey === key) {
        state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
      } else {
        state.sortKey = key;
        state.sortDir = 'asc';
      }

      // Reset to first page when sorting
      state.currentPage = 1;
      renderTable();
    }

    /**
     * Set new data and re-render
     * @param {array} rows - New data rows
     */
    function setData(rows) {
      state.data = rows || [];
      state.selected.clear();
      state.currentPage = 1;
      renderTable();
    }

    /**
     * Get selected row IDs
     * @returns {array} Array of selected IDs
     */
    function getSelected() {
      return [...state.selected];
    }

    /**
     * Get selected row objects
     * @returns {array} Array of selected row objects
     */
    function getSelectedRows() {
      return state.data.filter(r => state.selected.has(r[state.rowKey]));
    }

    /**
     * Clear all selections
     */
    function clearSelection() {
      state.selected.clear();
      if (state.onSelectionChange) {
        state.onSelectionChange([]);
      }
      renderTable();
    }

    /**
     * Select specific rows by ID
     * @param {array} ids - Array of row IDs to select
     */
    function selectRows(ids) {
      ids.forEach(id => state.selected.add(id));
      if (state.onSelectionChange) {
        state.onSelectionChange([...state.selected]);
      }
      renderTable();
    }

    /**
     * Show loading skeletons
     * @param {number} rowCount - Number of skeleton rows (default: 6)
     */
    function showLoading(rowCount = 6) {
      if (window.Skeletons && typeof window.Skeletons.showTableRows === 'function') {
        const colCount = state.columns.length + (state.selectable ? 1 : 0);
        window.Skeletons.showTableRows(container, {
          columns: colCount,
          rows: rowCount,
          withHeader: true
        });
      } else {
        // Fallback: simple loading text
        container.innerHTML = `
                    <div style="display:flex; align-items:center; justify-content:center; padding:40px; gap:12px; color:var(--text-soft, #6b5f56);">
                        <div class="spinner" style="width:24px; height:24px; border:2px solid var(--border-light, #e8e0d8); border-top-color:var(--role-primary, #2d1f3a); border-radius:50%; animation:spin 0.8s linear infinite;"></div>
                        <span>Loading...</span>
                    </div>
                `;
      }
    }

    /**
     * Destroy the table instance
     */
    function destroy() {
      // Clean up pagination
      if (state.paginationElement && typeof state.paginationElement.destroy === 'function') {
        state.paginationElement.destroy();
      }
      container.innerHTML = '';
      _instances.delete(container);
    }

    /**
     * Get the current state (for debugging)
     * @returns {object} Current state
     */
    function getState() {
      return {
        totalRows: state.data.length,
        currentPage: state.currentPage,
        totalPages: state.totalPages,
        selectedCount: state.selected.size,
        sortKey: state.sortKey,
        sortDir: state.sortDir,
        pageSize: state.pageSize
      };
    }

    /* ═══════════════════════════════════════════════════════════
       INITIAL RENDER
       ═══════════════════════════════════════════════════════════ */

    renderTable();

    /* ═══════════════════════════════════════════════════════════
       RETURN API
       ═══════════════════════════════════════════════════════════ */

    return {
      setData,
      getSelected,
      getSelectedRows,
      clearSelection,
      selectRows,
      toggleSort,
      showLoading,
      destroy,
      getState,
      // Expose internal state for advanced use
      _state: state,
      _render: renderTable
    };
  }

  /* ═══════════════════════════════════════════════════════════════
     EXPORTS
     ═══════════════════════════════════════════════════════════════ */

  return { create };

})();

// ─── EXPOSE TO WINDOW ───────────────────────────────────────────────
window.DataTable = DataTable;
