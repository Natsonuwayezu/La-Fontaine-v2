/**
 * ECOLE LA FONTAINE — Help Search Engine
 * Fast client-side search for modules, articles, and actions
 * Last updated: 2026-07-06
 */

import { HELP_ARTICLES, QUICK_ACTIONS } from './help-data.js';

// ──────────────────────────────────────────────────────────────────────
// SEARCH INDEX
// ──────────────────────────────────────────────────────────────────────

let searchIndex = [];

function buildSearchIndex() {
    const index = [];

    // Add articles
    HELP_ARTICLES.forEach(article => {
        index.push({
            id: article.id,
            type: 'article',
            title: article.title,
            summary: article.summary,
            category: article.category,
            keywords: article.title.toLowerCase().split(' ').concat(
                article.summary.toLowerCase().split(' ')
            ),
            score: 0,
            data: article
        });
    });

    // Add quick actions
    QUICK_ACTIONS.forEach(action => {
        index.push({
            id: action.id,
            type: 'action',
            title: action.label,
            summary: action.desc,
            keywords: action.label.toLowerCase().split(' ').concat(
                action.desc.toLowerCase().split(' ')
            ),
            score: 0,
            data: action
        });
    });

    searchIndex = index;
}

// ──────────────────────────────────────────────────────────────────────
// PERFORM SEARCH
// ──────────────────────────────────────────────────────────────────────

export function searchHelp(query) {
    if (!searchIndex.length) buildSearchIndex();

    query = query.toLowerCase().trim();
    if (!query) return [];

    const terms = query.split(' ').filter(t => t.length > 1);

    const results = searchIndex.map(item => {
        let score = 0;

        for (const term of terms) {
            // Check title (highest weight)
            if (item.title.toLowerCase().includes(term)) {
                score += 10;
            }
            // Check summary
            if (item.summary.toLowerCase().includes(term)) {
                score += 5;
            }
            // Check keywords
            if (item.keywords.some(k => k.includes(term) || term.includes(k))) {
                score += 3;
            }
        }

        return { ...item, score };
    });

    // Filter and sort
    return results
        .filter(r => r.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 20);
}

// ──────────────────────────────────────────────────────────────────────
// GET SEARCH SUGGESTIONS
// ──────────────────────────────────────────────────────────────────────

export function getSearchSuggestions(query) {
    const results = searchHelp(query);
    return results.slice(0, 5).map(r => ({
        text: r.title,
        type: r.type,
        id: r.id
    }));
}

// ──────────────────────────────────────────────────────────────────────
// NAVIGATE TO RESULT
// ──────────────────────────────────────────────────────────────────────

export function navigateToSearchResult(result) {
    if (result.type === 'article') {
        // Show article detail
        showArticleDetail(result.data);
    } else if (result.type === 'action') {
        // Trigger action
        const actionId = result.data.id;
        handleQuickAction(actionId);
    }
}

// ──────────────────────────────────────────────────────────────────────
// SHOW ARTICLE DETAIL
// ──────────────────────────────────────────────────────────────────────

function showArticleDetail(article) {
    // Create modal with article content
    const modal = document.createElement('div');
    modal.className = 'help-article-modal';
    modal.innerHTML = `
        <div class="help-article-modal-content">
            <div class="help-article-modal-header">
                <div class="help-article-modal-icon" style="background:${article.bg || 'rgba(59,130,246,0.1)'};color:${article.color || '#60a5fa'}">
                    <i class="fa-solid ${article.icon}"></i>
                </div>
                <div>
                    <h3>${article.title}</h3>
                    <span class="help-article-modal-tag">${article.category}</span>
                </div>
                <button class="help-article-modal-close" onclick="this.closest('.help-article-modal').remove()">
                    <i class="fa-solid fa-xmark"></i>
                </button>
            </div>
            <div class="help-article-modal-body">
                <p>${article.summary}</p>
                ${article.steps ? `
                    <h4>Steps:</h4>
                    <ol>
                        ${article.steps.map(s => `<li>${s}</li>`).join('')}
                    </ol>
                ` : ''}
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    // Close on overlay click
    modal.addEventListener('click', function (e) {
        if (e.target === this) this.remove();
    });
}

// ──────────────────────────────────────────────────────────────────────
// HANDLE QUICK ACTION
// ──────────────────────────────────────────────────────────────────────

function handleQuickAction(actionId) {
    const actions = {
        'reset-password': () => {
            if (typeof showChangePasswordModal === 'function') {
                showChangePasswordModal();
            }
        },
        'change-theme': () => {
            if (typeof toggleTheme === 'function') {
                toggleTheme();
            }
        },
        'insert-marks': () => navigateTo('marks-entry'),
        'record-payment': () => navigateTo('record-payment'),
        'record-attendance': () => navigateTo('attendance'),
        'view-timetable': () => navigateTo('teacher-timetable'),
        'print-receipt': () => navigateTo('receipts'),
        'view-register': () => navigateTo('class-register'),
    };

    const fn = actions[actionId];
    if (fn) {
        closeHelpCenter();
        setTimeout(fn, 300);
    }
}

// ──────────────────────────────────────────────────────────────────────
// EXPOSE
// ──────────────────────────────────────────────────────────────────────

window.searchHelp = searchHelp;
window.getSearchSuggestions = getSearchSuggestions;