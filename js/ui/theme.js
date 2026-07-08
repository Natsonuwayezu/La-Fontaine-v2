/**
 * ECOLE LA FONTAINE — Theme Management
 * Dark/light mode toggle, theme persistence
 * Last updated: 2026-07-07
 */

// ──────────────────────────────────────────────────────────────────────
// THEME CONFIG
// ──────────────────────────────────────────────────────────────────────

const THEME_KEY = 'elf_theme';
const THEMES = {
    LIGHT: 'light',
    DARK: 'dark',
};

// ──────────────────────────────────────────────────────────────────────
// CORE FUNCTIONS
// ──────────────────────────────────────────────────────────────────────

/**
 * Get the current theme from the document
 * @returns {string} 'light' or 'dark'
 */
export function getCurrentTheme() {
    return document.documentElement.getAttribute('data-theme') || THEMES.LIGHT;
}

/**
 * Get the saved theme from localStorage
 * @returns {string} 'light' or 'dark'
 */
export function getSavedTheme() {
    return localStorage.getItem(THEME_KEY) || THEMES.LIGHT;
}

/**
 * Apply a theme to the document
 * @param {string} theme - 'light' or 'dark'
 */
export function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem(THEME_KEY, theme);
    updateThemeUI(theme);
}

/**
 * Initialize theme on page load
 */
export function initTheme() {
    console.log('[Theme] Initialized');
    const savedTheme = getSavedTheme();
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const theme = savedTheme || (prefersDark ? THEMES.DARK : THEMES.LIGHT);
    applyTheme(theme);
}

/**
 * Toggle between light and dark mode
 */
export function toggleTheme() {
    const current = getCurrentTheme();
    const next = current === THEMES.DARK ? THEMES.LIGHT : THEMES.DARK;
    applyTheme(next);
    // Toast will be shown by the caller
}

// ──────────────────────────────────────────────────────────────────────
// UI UPDATES
// ──────────────────────────────────────────────────────────────────────

/**
 * Update theme-related UI elements
 * @param {string} theme - 'light' or 'dark'
 */
function updateThemeUI(theme) {
    const icon = document.getElementById('dropdown-theme-icon');
    const text = document.getElementById('dropdown-theme-text');
    if (icon) icon.textContent = theme === THEMES.DARK ? '☀️' : '🌙';
    if (text) text.textContent = theme === THEMES.DARK ? 'Light Mode' : 'Dark Mode';
}

// ──────────────────────────────────────────────────────────────────────
// SCHOOL LOGO
// ──────────────────────────────────────────────────────────────────────

/**
 * Apply school logo from base64 or URL to all logo elements
 * @param {string} logoData - base64 string or URL
 */
export function applySchoolLogo(logoData) {
    if (!logoData) return;
    const targets = document.querySelectorAll('.school-logo, #school-logo, #login-logo-img');
    targets.forEach(el => {
        if (el.tagName === 'IMG') {
            el.src = logoData;
        } else {
            el.style.backgroundImage = `url(${logoData})`;
        }
    });
}

// ──────────────────────────────────────────────────────────────────────
// EXPOSE GLOBALLY (for onclick handlers)
// ──────────────────────────────────────────────────────────────────────

window.toggleTheme = toggleTheme;
window.initTheme = initTheme;
window.applySchoolLogo = applySchoolLogo;
window.getCurrentTheme = getCurrentTheme;