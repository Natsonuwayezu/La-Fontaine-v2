/* ═══════════════════════════════════════════════════════════════════
   js/core/search-engine.js
   ═══════════════════════════════════════════════════════════════════
   Purpose : Global search across students, fees, payments, marks,
             teachers, and navigation modules. Opens a floating search
             panel. Results are grouped by category and deep-link to
             the correct module when clicked.
             No external search library — pure JS substring matching
             with relevance scoring.
   Load order: AFTER state.js, utils.js, router.js.
   ═══════════════════════════════════════════════════════════════════ */

'use strict';

/* ─────────────────────────────────────────────────────────────────
   SEARCH PANEL STATE
   ───────────────────────────────────────────────────────────────── */

let _searchOpen      = false;
let _searchDebounce  = null;
let _lastQuery       = '';
let _selectedIdx     = -1;       // keyboard navigation index
let _flatResults     = [];       // flattened results for keyboard nav

/* ─────────────────────────────────────────────────────────────────
   OPEN / CLOSE
   ───────────────────────────────────────────────────────────────── */

/**
 * Open the global search panel.
 * Creates the panel if it does not exist, then focuses the input.
 */
function openGlobalSearch() {
    if (_searchOpen) {
        document.getElementById('gs-input')?.focus();
        return;
    }
    _searchOpen = true;
    _createSearchPanel();
    document.getElementById('gs-input')?.focus();
}

/**
 * Close and destroy the search panel.
 */
function closeGlobalSearch() {
    if (!_searchOpen) return;
    _searchOpen = false;
    _lastQuery  = '';
    _selectedIdx = -1;
    _flatResults = [];

    const overlay = document.getElementById('gs-overlay');
    if (overlay) {
        overlay.classList.add('gs-hiding');
        setTimeout(() => overlay.remove(), 220);
    }
}

/* ─────────────────────────────────────────────────────────────────
   PANEL CREATION
   ───────────────────────────────────────────────────────────────── */

function _createSearchPanel() {
    // Remove any stale panel
    document.getElementById('gs-overlay')?.remove();

    const overlay       = document.createElement('div');
    overlay.id          = 'gs-overlay';
    overlay.className   = 'gs-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', 'Global search');

    overlay.innerHTML = `
        <div class="gs-panel" id="gs-panel" role="search">
            <div class="gs-input-wrap">
                <svg class="gs-search-icon" width="16" height="16" viewBox="0 0 24 24"
                     fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="11" cy="11" r="8"/>
                    <line x1="21" y1="21" x2="16.65" y2="16.65"/>
                </svg>
                <input
                    id="gs-input"
                    class="gs-input"
                    type="text"
                    placeholder="Search students, fees, modules…"
                    autocomplete="off"
                    spellcheck="false"
                    oninput="onGlobalSearchInput(this.value)"
                    onkeydown="onGlobalSearchKeydown(event)"
                    aria-autocomplete="list"
                    aria-controls="gs-results">
                <button class="gs-clear" id="gs-clear" onclick="clearGlobalSearch()"
                        style="display:none" aria-label="Clear search">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                         stroke="currentColor" stroke-width="2">
                        <line x1="18" y1="6" x2="6" y2="18"/>
                        <line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
                </button>
                <kbd class="gs-esc-hint">Esc</kbd>
            </div>
            <div id="gs-results" class="gs-results" role="listbox" aria-label="Search results">
                <div class="gs-empty">
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none"
                         stroke="currentColor" stroke-width="1.2" opacity="0.3">
                        <circle cx="11" cy="11" r="8"/>
                        <line x1="21" y1="21" x2="16.65" y2="16.65"/>
                    </svg>
                    <p>Type to search across the entire system</p>
                </div>
            </div>
            <div class="gs-footer">
                <span><kbd>↑</kbd><kbd>↓</kbd> navigate</span>
                <span><kbd>Enter</kbd> open</span>
                <span><kbd>Esc</kbd> close</span>
            </div>
        </div>`;

    // Close on overlay click (outside panel)
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) closeGlobalSearch();
    });

    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('gs-open'));
}

/* ─────────────────────────────────────────────────────────────────
   INPUT HANDLER (debounced)
   ───────────────────────────────────────────────────────────────── */

/**
 * Called on every keystroke in the search input.
 */
function onGlobalSearchInput(value) {
    const query = value.trim();

    const clearBtn = document.getElementById('gs-clear');
    if (clearBtn) clearBtn.style.display = query ? 'flex' : 'none';

    clearTimeout(_searchDebounce);

    if (!query) {
        _lastQuery   = '';
        _flatResults = [];
        _selectedIdx = -1;
        _renderEmpty();
        return;
    }

    _searchDebounce = setTimeout(() => {
        _lastQuery = query;
        _runSearch(query);
    }, 160);
}

/**
 * Clear the search input and reset results.
 */
function clearGlobalSearch() {
    const input = document.getElementById('gs-input');
    if (input) { input.value = ''; input.focus(); }
    onGlobalSearchInput('');
}

/* ─────────────────────────────────────────────────────────────────
   KEYBOARD NAVIGATION
   ───────────────────────────────────────────────────────────────── */

function onGlobalSearchKeydown(e) {
    if (e.key === 'Escape') { e.preventDefault(); closeGlobalSearch(); return; }

    if (e.key === 'ArrowDown') {
        e.preventDefault();
        _selectedIdx = Math.min(_selectedIdx + 1, _flatResults.length - 1);
        _highlightResult(_selectedIdx);
        return;
    }
    if (e.key === 'ArrowUp') {
        e.preventDefault();
        _selectedIdx = Math.max(_selectedIdx - 1, 0);
        _highlightResult(_selectedIdx);
        return;
    }
    if (e.key === 'Enter') {
        e.preventDefault();
        if (_selectedIdx >= 0 && _flatResults[_selectedIdx]) {
            _activateResult(_flatResults[_selectedIdx]);
        }
    }
}

function _highlightResult(idx) {
    document.querySelectorAll('.gs-result-item').forEach((el, i) => {
        el.classList.toggle('gs-selected', i === idx);
        if (i === idx) el.scrollIntoView({ block: 'nearest' });
    });
}

/* ─────────────────────────────────────────────────────────────────
   SEARCH EXECUTION
   ───────────────────────────────────────────────────────────────── */

/**
 * Run the search across all data sources and render results.
 * @param {string} query
 */
function _runSearch(query) {
    const q         = query.toLowerCase();
    const groups    = [];
    _flatResults    = [];
    _selectedIdx    = -1;

    // ── 1. Navigation modules ──────────────────────────────────────
    const moduleMatches = searchNavItems(query)
        .filter(item => canNavigateTo(item.id))
        .slice(0, 5);

    if (moduleMatches.length > 0) {
        groups.push({
            label   : 'Modules',
            icon    : _icon('layout-dashboard'),
            results : moduleMatches.map(item => ({
                type    : 'module',
                label   : item.label,
                sub     : item.sectionLabel,
                icon    : _icon('layout-dashboard'),
                action  : () => { closeGlobalSearch(); navigateTo(item.id); },
            })),
        });
    }

    // ── 2. Students ────────────────────────────────────────────────
    if (canNavigateTo('student-list')) {
        const studentMatches = (state.students || [])
            .filter(s => {
                const full = `${s.first_name} ${s.last_name} ${s.code} ${s.class_name || ''}`.toLowerCase();
                return full.includes(q);
            })
            .slice(0, 6)
            .map(s => {
                const cls = getClass(s.class_id);
                return {
                    type   : 'student',
                    label  : `${s.first_name} ${s.last_name}`,
                    sub    : `${s.code}${cls ? ' · ' + cls.name : ''}`,
                    icon   : _icon('user'),
                    action : () => {
                        closeGlobalSearch();
                        navigateTo('student-details', { studentId: s.id });
                    },
                };
            });

        if (studentMatches.length > 0) {
            groups.push({ label: 'Students', icon: _icon('users'), results: studentMatches });
        }
    }

    // ── 3. Teachers / Staff ────────────────────────────────────────
    if (canNavigateTo('user-management')) {
        const staffMatches = (state.teachers || [])
            .filter(t => {
                const full = `${t.first_name} ${t.last_name} ${t.username} ${t.role}`.toLowerCase();
                return full.includes(q);
            })
            .slice(0, 4)
            .map(t => ({
                type   : 'teacher',
                label  : `${t.first_name} ${t.last_name}`,
                sub    : `${t.role} · ${t.username}`,
                icon   : _icon('user-cog'),
                action : () => { closeGlobalSearch(); navigateTo('user-management'); },
            }));

        if (staffMatches.length > 0) {
            groups.push({ label: 'Staff', icon: _icon('user-cog'), results: staffMatches });
        }
    }

    // ── 4. Payments ────────────────────────────────────────────────
    if (canNavigateTo('payment-history') && state.payments.length > 0) {
        const payMatches = (state.payments || [])
            .filter(p => {
                const str = `${p.receipt_number} ${p.student_name || ''}`.toLowerCase();
                return str.includes(q);
            })
            .slice(0, 4)
            .map(p => ({
                type   : 'payment',
                label  : p.receipt_number || `Payment #${p.id}`,
                sub    : `${fmtCurrency(p.total_amount)} · ${fmtDate(p.payment_date)}`,
                icon   : _icon('receipt'),
                action : () => { closeGlobalSearch(); navigateTo('payment-history'); },
            }));

        if (payMatches.length > 0) {
            groups.push({ label: 'Payments', icon: _icon('receipt'), results: payMatches });
        }
    }

    // ── 5. Fee categories ──────────────────────────────────────────
    if (canNavigateTo('fee-structure')) {
        const feeMatches = (state.feeCategories || [])
            .filter(f => f.name?.toLowerCase().includes(q))
            .slice(0, 4)
            .map(f => ({
                type   : 'fee',
                label  : f.name,
                sub    : 'Fee Category',
                icon   : _icon('dollar-sign'),
                action : () => { closeGlobalSearch(); navigateTo('fee-structure'); },
            }));

        if (feeMatches.length > 0) {
            groups.push({ label: 'Fees', icon: _icon('dollar-sign'), results: feeMatches });
        }
    }

    // ── 6. Academic years ──────────────────────────────────────────
    const yearMatches = (state.academicYears || [])
        .filter(y => y.year_name?.toLowerCase().includes(q))
        .slice(0, 3)
        .map(y => ({
            type   : 'year',
            label  : y.year_name,
            sub    : y.is_current ? 'Current Year' : 'Academic Year',
            icon   : _icon('calendar'),
            action : () => {
                closeGlobalSearch();
                navigateTo('academic-years');
            },
        }));

    if (yearMatches.length > 0) {
        groups.push({ label: 'Academic Years', icon: _icon('calendar'), results: yearMatches });
    }

    // Build flat list for keyboard nav
    groups.forEach(g => {
        g.results.forEach(r => _flatResults.push(r));
    });

    // Render
    if (_flatResults.length === 0) {
        _renderNoResults(query);
    } else {
        _renderResults(groups, query);
    }
}

/* ─────────────────────────────────────────────────────────────────
   RESULT RENDERING
   ───────────────────────────────────────────────────────────────── */

function _renderEmpty() {
    const el = document.getElementById('gs-results');
    if (!el) return;
    el.innerHTML = `
        <div class="gs-empty">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none"
                 stroke="currentColor" stroke-width="1.2" opacity="0.3">
                <circle cx="11" cy="11" r="8"/>
                <line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <p>Type to search across the entire system</p>
        </div>`;
}

function _renderNoResults(query) {
    const el = document.getElementById('gs-results');
    if (!el) return;
    el.innerHTML = `
        <div class="gs-empty">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none"
                 stroke="currentColor" stroke-width="1.2" opacity="0.3">
                <circle cx="11" cy="11" r="8"/>
                <line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <p>No results for <strong>${esc(query)}</strong></p>
        </div>`;
}

function _renderResults(groups, query) {
    const el = document.getElementById('gs-results');
    if (!el) return;

    let flatIdx = 0;
    let html    = '';

    groups.forEach(group => {
        html += `<div class="gs-group">
            <div class="gs-group-label">${group.icon}${esc(group.label)}</div>`;

        group.results.forEach(result => {
            const i = flatIdx++;
            html += `
                <div class="gs-result-item"
                     role="option"
                     data-result-idx="${i}"
                     onmousedown="onGlobalSearchResultClick(${i})"
                     onmouseover="onGlobalSearchResultHover(${i})">
                    <span class="gs-result-icon">${result.icon}</span>
                    <span class="gs-result-text">
                        <span class="gs-result-label">${_highlight(esc(result.label), query)}</span>
                        ${result.sub ? `<span class="gs-result-sub">${esc(result.sub)}</span>` : ''}
                    </span>
                    <svg class="gs-result-arrow" width="12" height="12" viewBox="0 0 24 24"
                         fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="9 18 15 12 9 6"/>
                    </svg>
                </div>`;
        });

        html += '</div>';
    });

    el.innerHTML = html;
}

/**
 * Highlight matching query characters in a result label.
 * @param {string} escapedLabel - already HTML-escaped label
 * @param {string} query
 */
function _highlight(escapedLabel, query) {
    if (!query) return escapedLabel;
    const q   = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // escape regex
    const rx  = new RegExp(`(${q})`, 'gi');
    return escapedLabel.replace(rx, '<mark class="gs-mark">$1</mark>');
}

/* ─────────────────────────────────────────────────────────────────
   RESULT INTERACTION
   ───────────────────────────────────────────────────────────────── */

function onGlobalSearchResultClick(idx) {
    _activateResult(_flatResults[idx]);
}

function onGlobalSearchResultHover(idx) {
    _selectedIdx = idx;
    _highlightResult(idx);
}

function _activateResult(result) {
    if (!result || typeof result.action !== 'function') return;
    result.action();
}

/* ─────────────────────────────────────────────────────────────────
   ICON HELPER
   ───────────────────────────────────────────────────────────────── */

function _icon(name) {
    return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                 stroke="currentColor" stroke-width="2">
                <use href="assets/icons/sprite.svg#icon-${name}"/>
            </svg>`;
}

/* ─────────────────────────────────────────────────────────────────
   MODULE-LEVEL SEARCH HELPER
   Used by individual modules (student-list, payment-history etc.)
   for their own local search bars.
   ───────────────────────────────────────────────────────────────── */

/**
 * Filter an array of objects by a query string across multiple fields.
 * Returns the filtered array sorted by relevance (exact match first).
 *
 * @param {Array}    items
 * @param {string}   query
 * @param {string[]} fields - object keys to search
 * @param {number}   [limit]
 */
function localSearch(items, query, fields, limit = 500) {
    if (!query || !query.trim()) return items.slice(0, limit);

    const q = query.toLowerCase().trim();

    const scored = items.map(item => {
        let score = 0;
        for (const field of fields) {
            const val = String(item[field] || '').toLowerCase();
            if (val === q)              score += 100;
            else if (val.startsWith(q)) score +=  50;
            else if (val.includes(q))   score +=  10;
        }
        return { item, score };
    }).filter(r => r.score > 0);

    return scored
        .sort((a, b) => b.score - a.score)
        .slice(0, limit)
        .map(r => r.item);
}

/* ─────────────────────────────────────────────────────────────────
   EXPOSE
   ───────────────────────────────────────────────────────────────── */

window.openGlobalSearch           = openGlobalSearch;
window.closeGlobalSearch          = closeGlobalSearch;
window.clearGlobalSearch          = clearGlobalSearch;
window.onGlobalSearchInput        = onGlobalSearchInput;
window.onGlobalSearchKeydown      = onGlobalSearchKeydown;
window.onGlobalSearchResultClick  = onGlobalSearchResultClick;
window.onGlobalSearchResultHover  = onGlobalSearchResultHover;
window.localSearch                = localSearch;