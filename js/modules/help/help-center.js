'use strict';

let isOpen = false;
let searchTimeout = null;

// ──────────────────────────────────────────────────────────────────────
// MAIN RENDER FUNCTION (Called by router)
// ──────────────────────────────────────────────────────────────────────

function renderHelpCenter(container) {
    if (!container) return;

    // If we're rendering in the main content area, use full layout
    container.innerHTML = `
        <div class="help-full-page" id="help-full-page">
            ${renderHelpHTML()}
            <button class="help-close-full" onclick="window.closeHelpCenter()">
                <i class="fa-solid fa-xmark"></i> Close Help
            </button>
        </div>
    `;

    // Setup event listeners
    setupSearchListener();
    setupKeyboardShortcuts();
    setupCardClickHandlers();
    loadRecentlyAccessed();
    updateStats();

    // Focus search
    setTimeout(() => {
        const input = document.getElementById('help-search-input');
        if (input) input.focus();
    }, 300);

    return true;
}

// ──────────────────────────────────────────────────────────────────────
// OPEN HELP CENTER (Global)
// ──────────────────────────────────────────────────────────────────────

function openHelpCenter() {
    // Check if already open in overlay mode
    const existingContainer = document.getElementById('help-center-container');
    if (existingContainer && isOpen) {
        // Already open, focus search
        const input = document.getElementById('help-search-input');
        if (input) input.focus();
        return;
    }

    // If there's already a container, remove it
    if (existingContainer) {
        existingContainer.remove();
    }

    isOpen = true;

    // Create overlay
    let overlay = document.getElementById('help-center-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'help-center-overlay';
        overlay.className = 'help-center-overlay';
        document.body.appendChild(overlay);
    }

    // Create container
    let container = document.getElementById('help-center-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'help-center-container';
        container.className = 'help-center-container';
        document.body.appendChild(container);
    }

    // Render content into container
    container.innerHTML = renderHelpHTML();

    // Setup event listeners
    setupSearchListener();
    setupKeyboardShortcuts();
    setupCardClickHandlers();
    loadRecentlyAccessed();
    updateStats();

    // Show with animation
    overlay.classList.add('show');
    container.classList.add('show');

    // Focus search input
    setTimeout(() => {
        const input = document.getElementById('help-search-input');
        if (input) input.focus();
    }, 300);

    // Prevent body scroll
    document.body.style.overflow = 'hidden';

    // Update theme toggle text
    updateThemeToggleText();
}

// ──────────────────────────────────────────────────────────────────────
// UPDATE THEME TOGGLE TEXT
// ──────────────────────────────────────────────────────────────────────

function updateThemeToggleText() {
    const theme = getCurrentTheme() || 'dark';
    const toggle = document.querySelector('.help-step-card[data-action="change-theme"] .help-step-title');
    if (toggle) {
        toggle.textContent = theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode';
    }
}

// ──────────────────────────────────────────────────────────────────────
// CLOSE HELP CENTER
// ──────────────────────────────────────────────────────────────────────

function closeHelpCenter() {
    isOpen = false;

    const overlay = document.getElementById('help-center-overlay');
    const container = document.getElementById('help-center-container');

    if (overlay) overlay.classList.remove('show');
    if (container) {
        container.classList.remove('show');
        // Remove after animation
        setTimeout(() => {
            if (container.parentNode) {
                container.remove();
            }
        }, 400);
    }

    // Also clean up full page version
    const fullPage = document.getElementById('help-full-page');
    if (fullPage) {
        const parent = fullPage.parentElement;
        if (parent) {
            parent.innerHTML = `
                <div class="loading-container">
                    <div class="spinner"></div>
                    <p>Loading...</p>
                </div>
            `;
        }
    }

    document.body.style.overflow = '';
}

// ──────────────────────────────────────────────────────────────────────
// SETUP SEARCH LISTENER
// ──────────────────────────────────────────────────────────────────────

function setupSearchListener() {
    const input = document.getElementById('help-search-input');
    if (!input) return;

    // Remove old listeners (prevent duplicates)
    const newInput = input.cloneNode(true);
    input.parentNode.replaceChild(newInput, input);

    newInput.addEventListener('input', function (e) {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
            performSearch(this.value);
        }, 200);
    });

    newInput.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') {
            this.value = '';
            performSearch('');
            this.blur();
        }
    });

    // Re-assign ID
    newInput.id = 'help-search-input';
}

// ──────────────────────────────────────────────────────────────────────
// PERFORM SEARCH
// ──────────────────────────────────────────────────────────────────────

function performSearch(query) {
    query = query.toLowerCase().trim();

    // Get all searchable elements
    const cards = document.querySelectorAll('.help-quick-card, .help-step-card');
    const articles = document.querySelectorAll('.help-article-item');

    if (!query) {
        // Reset all
        cards.forEach(el => {
            el.style.display = '';
            el.style.borderColor = '';
            el.style.background = '';
        });
        articles.forEach(el => {
            el.style.display = '';
        });
        const resultsEl = document.querySelector('.help-search-results');
        if (resultsEl) resultsEl.innerHTML = '';
        return;
    }

    let found = 0;

    cards.forEach(el => {
        const text = el.textContent.toLowerCase();
        const match = text.includes(query);
        if (match) {
            el.style.display = '';
            el.style.borderColor = 'rgba(59, 130, 246, 0.3)';
            el.style.background = 'rgba(59, 130, 246, 0.04)';
            found++;
        } else {
            el.style.display = 'none';
            el.style.borderColor = '';
            el.style.background = '';
        }
    });

    articles.forEach(el => {
        const text = el.textContent.toLowerCase();
        if (text.includes(query)) {
            el.style.display = '';
            found++;
        } else {
            el.style.display = 'none';
        }
    });

    // Show results status
    const resultsEl = document.querySelector('.help-search-results');
    if (resultsEl) {
        if (found > 0) {
            resultsEl.innerHTML = `<div class="help-search-status">🔍 Found <strong>${found}</strong> result${found > 1 ? 's' : ''}</div>`;
        } else {
            resultsEl.innerHTML = `
                <div class="help-search-status">
                    <div style="font-size:32px;margin-bottom:8px;">🔍</div>
                    <div style="font-weight:600;color:#f1f5f9;">No results found</div>
                    <div style="font-size:13px;color:#64748b;">Try a different search term</div>
                </div>
            `;
        }
    }
}

// ──────────────────────────────────────────────────────────────────────
// SETUP KEYBOARD SHORTCUTS
// ──────────────────────────────────────────────────────────────────────

function setupKeyboardShortcuts() {
    // Only set up once
    if (window._helpKeyboardSetup) return;
    window._helpKeyboardSetup = true;

    document.addEventListener('keydown', function (e) {
        // Ctrl+K or Cmd+K to open
        if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
            e.preventDefault();
            if (!isOpen) {
                openHelpCenter();
            } else {
                const input = document.getElementById('help-search-input');
                if (input) input.focus();
            }
        }

        // Escape to close
        if (e.key === 'Escape' && isOpen) {
            closeHelpCenter();
        }
    });

    // Click outside to close (overlay)
    document.addEventListener('click', function (e) {
        if (isOpen) {
            const container = document.getElementById('help-center-container');
            const overlay = document.getElementById('help-center-overlay');
            if (overlay && e.target === overlay) {
                closeHelpCenter();
            }
        }
    });
}

// ──────────────────────────────────────────────────────────────────────
// SETUP CARD CLICK HANDLERS
// ──────────────────────────────────────────────────────────────────────

function setupCardClickHandlers() {
    // Remove old listeners by re-delegating
    const container = document.getElementById('help-center-container') || document.getElementById('help-full-page');
    if (!container) return;

    // Use a single delegated listener
    container.addEventListener('click', function (e) {
        const card = e.target.closest('.help-quick-card, .help-step-card, .help-article-item');
        if (!card) return;

        const moduleId = card.dataset.module;
        const action = card.dataset.action;
        const articleId = card.dataset.article;

        if (moduleId) {
            closeHelpCenter();
            setTimeout(() => {
                navigateTo(moduleId);
            }, 300);
        } else if (action) {
            handleAction(action);
        } else if (articleId) {
            // Show article detail
            const article = HELP_ARTICLES.find(a => a.id === articleId);
            if (article) {
                showArticleDetail(article);
            }
        }
    });
}

// ──────────────────────────────────────────────────────────────────────
// SHOW ARTICLE DETAIL
// ──────────────────────────────────────────────────────────────────────

function showArticleDetail(article) {
    const modal = document.createElement('div');
    modal.className = 'help-article-modal';
    modal.style.cssText = `
        position: fixed;
        inset: 0;
        background: rgba(0,0,0,0.6);
        backdrop-filter: blur(4px);
        z-index: 10000;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 20px;
        animation: fadeIn 0.2s ease;
    `;
    modal.innerHTML = `
        <div style="
            background: var(--bg-secondary, #1e293b);
            border-radius: 16px;
            max-width: 560px;
            width: 100%;
            padding: 28px 32px;
            box-shadow: 0 20px 60px rgba(0,0,0,0.5);
            position: relative;
        ">
            <button onclick="this.closest('.help-article-modal').remove()" style="
                position: absolute;
                top: 12px;
                right: 16px;
                background: none;
                border: none;
                color: var(--text-muted, #94a3b8);
                font-size: 20px;
                cursor: pointer;
            ">
                <i class="fa-solid fa-xmark"></i>
            </button>
            <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;">
                <div style="
                    width:44px;height:44px;border-radius:12px;
                    display:flex;align-items:center;justify-content:center;
                    font-size:18px;
                    background:${article.bg || 'rgba(59,130,246,0.12)'};
                    color:${article.color || '#60a5fa'};
                ">
                    <i class="fa-solid ${article.icon}"></i>
                </div>
                <div>
                    <h3 style="margin:0;font-size:18px;font-weight:700;color:var(--text-primary, #f1f5f9);">${esc(article.title)}</h3>
                    <span style="font-size:11px;color:var(--text-muted, #94a3b8);text-transform:uppercase;letter-spacing:0.5px;">${esc(article.category)}</span>
                </div>
            </div>
            <p style="color:var(--text-secondary, #cbd5e1);font-size:14px;line-height:1.6;">${esc(article.summary)}</p>
            ${article.steps ? `
                <h4 style="font-size:13px;font-weight:600;color:var(--text-primary, #f1f5f9);margin-top:16px;margin-bottom:8px;">Steps:</h4>
                <ol style="color:var(--text-secondary, #cbd5e1);font-size:13px;line-height:1.8;padding-left:20px;">
                    ${article.steps.map(s => `<li>${esc(s)}</li>`).join('')}
                </ol>
            ` : ''}
            <button onclick="this.closest('.help-article-modal').remove()" style="
                margin-top:20px;
                padding:8px 20px;
                border-radius:8px;
                border:1px solid var(--border-light, #e2e8f0);
                background:transparent;
                color:var(--text-secondary, #cbd5e1);
                cursor:pointer;
                font-size:13px;
            ">
                Close
            </button>
        </div>
    `;
    document.body.appendChild(modal);

    modal.addEventListener('click', function (e) {
        if (e.target === this) this.remove();
    });
}

// ──────────────────────────────────────────────────────────────────────
// HANDLE ACTIONS
// ──────────────────────────────────────────────────────────────────────

function handleAction(action) {
    switch (action) {
        case 'reset-password':
            closeHelpCenter();
            setTimeout(() => {
                if (typeof showChangePasswordModal === 'function') {
                    showChangePasswordModal();
                } else {
                    showToast('🔑 Change Password', 'info');
                }
            }, 300);
            break;

        case 'change-theme':
            if (typeof toggleTheme === 'function') {
                toggleTheme();
                showToast(getCurrentTheme() === 'dark' ? '🌙 Dark mode' : '☀️ Light mode', 'info');
            }
            closeHelpCenter();
            break;

        case 'insert-marks':
            closeHelpCenter();
            setTimeout(() => navigateTo('marks-entry'), 300);
            break;

        case 'record-payment':
            closeHelpCenter();
            setTimeout(() => navigateTo('record-payment'), 300);
            break;

        case 'record-attendance':
            closeHelpCenter();
            setTimeout(() => navigateTo('attendance'), 300);
            break;

        case 'view-timetable':
            closeHelpCenter();
            setTimeout(() => navigateTo('teacher-timetable'), 300);
            break;

        case 'print-receipt':
            closeHelpCenter();
            setTimeout(() => navigateTo('receipts'), 300);
            break;

        case 'view-register':
            closeHelpCenter();
            setTimeout(() => navigateTo('class-register'), 300);
            break;

        default:
            showToast(`⚡ Action: ${action}`, 'info');
            closeHelpCenter();
    }
}

// ──────────────────────────────────────────────────────────────────────
// LOAD RECENTLY ACCESSED
// ──────────────────────────────────────────────────────────────────────

function loadRecentlyAccessed() {
    const container = document.getElementById('help-recent-grid');
    if (!container) return;

    // Get from localStorage or use defaults
    let recent = [];
    try {
        const stored = localStorage.getItem('help_recently_accessed');
        if (stored) {
            recent = JSON.parse(stored);
        }
    } catch (e) {
        recent = [];
    }

    if (recent.length === 0) {
        recent = RECENTLY_ACCESSED;
    }

    container.innerHTML = recent.map(item => `
        <div class="help-quick-card" data-module="${item.moduleId}" style="cursor:pointer;">
            <div class="help-qc-icon" style="background:${item.bg || 'rgba(59,130,246,0.12)'};color:${item.color || '#60a5fa'};">
                <i class="fa-solid ${item.icon}"></i>
            </div>
            <div class="help-qc-title">${esc(item.label)}</div>
            <div class="help-qc-desc">${esc(item.desc || '')}</div>
            <span class="help-qc-badge">${esc(item.badge || '')}</span>
        </div>
    `).join('');
}

// ──────────────────────────────────────────────────────────────────────
// UPDATE STATS
// ──────────────────────────────────────────────────────────────────────

function updateStats() {
    const totalEl = document.getElementById('help-total-modules');
    if (totalEl) {
        const allModules = document.querySelectorAll('.help-quick-card, .help-step-card, .help-article-item');
        totalEl.textContent = allModules.length;
    }
}

// ──────────────────────────────────────────────────────────────────────
// EXPOSE GLOBALLY
// ──────────────────────────────────────────────────────────────────────

window.openHelpCenter = openHelpCenter;
window.closeHelpCenter = closeHelpCenter;
window.renderHelpCenter = renderHelpCenter;

console.log('✅ Help Center module loaded — press Ctrl+K to open');
