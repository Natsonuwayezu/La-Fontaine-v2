/**
 * ECOLE LA FONTAINE — Help Center Templates
 * HTML templates for the help center
 * Last updated: 2026-07-06
 */

import { HELP_CATEGORIES, HELP_ARTICLES, QUICK_ACTIONS } from './help-data.js';
import { esc } from '../../core/utils.js';

export function renderHelpHTML() {
    return `
        <div class="help-center-container show" id="help-center-container-inner">
            <!-- Header -->
            <div class="help-header">
                <button class="help-back-btn" onclick="closeHelpCenter()">
                    <i class="fa-solid fa-arrow-left"></i>
                </button>
                <div class="help-title-group">
                    <h1>Help &amp; Search</h1>
                    <div class="help-sub">Find anything across the system — modules, students, actions</div>
                </div>
                <button class="help-close-btn" onclick="closeHelpCenter()">
                    <i class="fa-solid fa-xmark"></i>
                </button>
            </div>

            <!-- Search Bar -->
            <div class="help-search-wrapper">
                <div class="help-search-box">
                    <div class="help-search-icon">
                        <i class="fa-solid fa-magnifying-glass"></i>
                    </div>
                    <input
                        type="text"
                        id="help-search-input"
                        class="help-search-input"
                        placeholder="Search for modules, students, actions…"
                    />
                    <div class="help-search-shortcut">
                        <kbd>Ctrl</kbd> + <kbd>K</kbd>
                    </div>
                </div>
                <div class="help-search-results" id="help-search-results"></div>
            </div>

            <!-- Stats Bar -->
            <div class="help-stats-bar">
                <span class="help-stat">
                    <span class="help-stat-num" id="help-total-modules">0</span> Modules
                </span>
                <span class="help-stat">🟧 <strong>Font Awesome</strong> · Icon Font</span>
                <span class="help-stat">🟪 <strong>Lucide</strong> · SVG · Modern</span>
                <span class="help-stat">⬛ <strong>Monochrome</strong> · Custom</span>
                <span class="help-stat">📦 <strong>Emoji</strong> · Universal</span>
            </div>

            <!-- Recently Accessed -->
            <div class="help-section-label">
                ⚡ Recently Accessed
                <span class="help-section-line"></span>
            </div>
            <div class="help-quick-grid" id="help-recent-grid"></div>

            <!-- Quick Actions -->
            <div class="help-section-label">
                📋 Quick Actions
                <span class="help-section-line"></span>
            </div>
            <div class="help-steps-grid">
                ${QUICK_ACTIONS.map((action, index) => `
                    <div class="help-step-card" data-action="${action.id}">
                        <div class="help-step-num">${index + 1}</div>
                        <div class="help-step-content">
                            <div class="help-step-title">${esc(action.label)}</div>
                            <div class="help-step-desc">${esc(action.desc)}</div>
                        </div>
                        <div class="help-step-icon">
                            <i class="fa-solid fa-chevron-right"></i>
                        </div>
                    </div>
                `).join('')}
            </div>

            <!-- Help Articles -->
            <div class="help-section-label">
                📚 Help Articles
                <span class="help-section-line"></span>
            </div>
            <div class="help-articles-grid">
                ${HELP_ARTICLES.map(article => `
                    <div class="help-article-item" data-article="${article.id}">
                        <div class="help-article-icon" style="background:${article.bg || 'rgba(59,130,246,0.1)'};color:${article.color || '#60a5fa'}">
                            <i class="fa-solid ${article.icon}"></i>
                        </div>
                        <div class="help-article-content">
                            <div class="help-article-title">${esc(article.title)}</div>
                            <div class="help-article-summary">${esc(article.summary)}</div>
                            <div class="help-article-category">
                                <span class="help-article-tag">${esc(article.category.replace('-', ' '))}</span>
                            </div>
                        </div>
                    </div>
                `).join('')}
            </div>

            <!-- Footer -->
            <div class="help-footer">
                <span>🏫 ECOLE LA FONTAINE v9.0</span>
                <span>·</span>
                <span>Press <kbd>Esc</kbd> to close</span>
                <span>·</span>
                <a href="https://wa.me/250798791859" target="_blank" class="help-wa-link">
                    <i class="fa-brands fa-whatsapp"></i> WhatsApp Support
                </a>
            </div>
        </div>
    `;
}