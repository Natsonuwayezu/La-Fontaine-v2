/* ═══════════════════════════════════════════════════════════════════
   js/ui/theme.js — Theme Management
   ═══════════════════════════════════════════════════════════════════
   Purpose: Manage dark/light mode with localStorage persistence,
   system preference detection, and school logo application.

   Usage:
     import { initTheme, toggleTheme, applyTheme, getCurrentTheme } from './theme.js';
     initTheme();  // Call once on app boot

   The theme state is stored in localStorage under 'elf_theme'.
   The document gets `data-theme="dark"` or `data-theme="light"`.

   Last updated: 2026-07-14
   ═══════════════════════════════════════════════════════════════════ */

/* ═══════════════════════════════════════════════════════════════════
   CONSTANTS
   ═══════════════════════════════════════════════════════════════════ */

const THEME_KEY = 'elf_theme';

const THEMES = {
    LIGHT: 'light',
    DARK: 'dark'
};

const ICONS = {
    [THEMES.LIGHT]: '<i class="fa-solid fa-sun"></i>',
    [THEMES.DARK]: '<i class="fa-solid fa-moon"></i>'
};

const LABELS = {
    [THEMES.LIGHT]: 'Dark Mode',
    [THEMES.DARK]: 'Light Mode'
};

/* ═══════════════════════════════════════════════════════════════════
   CORE FUNCTIONS
   ═══════════════════════════════════════════════════════════════════ */

/**
 * Get the current theme from the document
 * @returns {string} 'light' or 'dark'
 */
function getCurrentTheme() {
    return document.documentElement.getAttribute('data-theme') || THEMES.LIGHT;
}

/**
 * Get the saved theme from localStorage
 * @returns {string} 'light' or 'dark'
 */
function getSavedTheme() {
    try {
        return localStorage.getItem(THEME_KEY) || THEMES.LIGHT;
    } catch (_) {
        return THEMES.LIGHT;
    }
}

/**
 * Apply a theme to the document and persist it
 * @param {string} theme - 'light' or 'dark'
 * @param {boolean} shouldSave - Whether to save to localStorage (default: true)
 */
function applyTheme(theme, shouldSave = true) {
    const validTheme = theme === THEMES.DARK ? THEMES.DARK : THEMES.LIGHT;

    document.documentElement.setAttribute('data-theme', validTheme);

    if (shouldSave) {
        try {
            localStorage.setItem(THEME_KEY, validTheme);
        } catch (_) { /* ignore */ }
    }

    updateThemeUI(validTheme);
    updateThemeMeta(validTheme);

    // Dispatch event for other modules to react
    document.dispatchEvent(new CustomEvent('themeChange', {
        detail: { theme: validTheme }
    }));
}

/**
 * Initialize theme on page load
 * Detects saved preference, falls back to system preference
 * @param {boolean} skipSystemPreference - Force use saved or default
 */
function initTheme(skipSystemPreference = false) {
    const savedTheme = getSavedTheme();

    // Default is always LIGHT — system dark preference is ignored.
    // User can toggle in settings. We never auto-apply dark mode.
    const theme = savedTheme || THEMES.LIGHT;

    applyTheme(theme, true);
    console.log(`[Theme] Initialized: ${theme}`);
}

/**
 * Toggle between light and dark mode
 * @param {boolean} showToast - Whether to show a toast notification
 * @returns {string} The new theme
 */
function toggleTheme(showToast = true) {
    const current = getCurrentTheme();
    const next = current === THEMES.DARK ? THEMES.LIGHT : THEMES.DARK;

    applyTheme(next, true);

    // Show toast if requested (toast module may not be loaded yet)
    if (showToast && typeof window.showToast === 'function') {
        const icon = ICONS[next];
        const label = next === THEMES.DARK ? 'Dark mode activated' : 'Light mode activated';
        window.showToast(`${icon} ${label}`, 'info', 1500);
    }

    return next;
}

/**
 * Check if dark mode is currently active
 * @returns {boolean} True if dark mode is active
 */
function isDarkMode() {
    return getCurrentTheme() === THEMES.DARK;
}

/**
 * Check if dark mode is currently active
 * @returns {boolean} True if light mode is active
 */
function isLightMode() {
    return getCurrentTheme() === THEMES.LIGHT;
}

/* ═══════════════════════════════════════════════════════════════════
   UI UPDATES
   ═══════════════════════════════════════════════════════════════════ */

/**
 * Update theme-related UI elements (dropdown icon, label, etc.)
 * @param {string} theme - 'light' or 'dark'
 */
function updateThemeUI(theme) {
    // Update dropdown theme toggle
    const icon = document.getElementById('dropdown-theme-icon');
    const text = document.getElementById('dropdown-theme-text');

    if (icon) {
        icon.innerHTML = ICONS[theme] || '<i class="fa-solid fa-moon"></i>';
    }

    if (text) {
        text.textContent = LABELS[theme] || 'Dark Mode';
    }

    // Update any other theme toggle buttons
    document.querySelectorAll('[data-theme-toggle]').forEach((btn) => {
        const btnIcon = btn.querySelector('[data-theme-icon]');
        const btnText = btn.querySelector('[data-theme-label]');

        if (btnIcon) {
            btnIcon.innerHTML = ICONS[theme] || '<i class="fa-solid fa-moon"></i>';
        }

        if (btnText) {
            btnText.textContent = theme === THEMES.DARK ? 'Light' : 'Dark';
        }
    });
}

/**
 * Update theme-color meta tag for PWA
 * @param {string} theme - 'light' or 'dark'
 */
function updateThemeMeta(theme) {
    const meta = document.querySelector('meta[name="theme-color"]');
    if (!meta) return;

    const colors = {
        [THEMES.LIGHT]: '#f5f0eb',
        [THEMES.DARK]: '#1a1410'
    };

    meta.content = colors[theme] || '#1a1410';
}

/* ═══════════════════════════════════════════════════════════════════
   SCHOOL LOGO
   ═══════════════════════════════════════════════════════════════════ */

/**
 * Apply school logo from base64 or URL to all logo elements
 * @param {string} logoData - base64 string or URL
 * @param {string} selector - CSS selector for logo elements (optional)
 */
function applySchoolLogo(logoData, selector = '.school-logo, #school-logo, #login-logo-img, .logo-box') {
    if (!logoData) return;

    const targets = document.querySelectorAll(selector);

    targets.forEach((el) => {
        if (el.tagName === 'IMG') {
            el.src = logoData;
            el.alt = 'School Logo';
        } else if (el.tagName === 'DIV' || el.tagName === 'SPAN') {
            // For div/span logos, use background image or inner HTML
            if (logoData.startsWith('data:') || logoData.startsWith('http')) {
                el.style.backgroundImage = `url(${logoData})`;
                el.style.backgroundSize = 'contain';
                el.style.backgroundPosition = 'center';
                el.style.backgroundRepeat = 'no-repeat';
                // Clear any text content
                el.textContent = '';
            } else {
                // If it's an emoji or text, set it directly
                el.textContent = logoData;
            }
        }
    });

    // Also update the login page logo box if it exists
    const loginLogo = document.querySelector('#login-logo-box');
    if (loginLogo && (logoData.startsWith('data:') || logoData.startsWith('http'))) {
        loginLogo.innerHTML = `<img src="${logoData}" alt="School Logo" style="width:100%;height:100%;object-fit:contain;">`;
    } else if (loginLogo) {
        loginLogo.innerHTML = logoData ? esc(logoData) : '<i class="fa-solid fa-school"></i>';
    }
}

/* ═══════════════════════════════════════════════════════════════════
   THEME WATCHER
   ═══════════════════════════════════════════════════════════════════ */

/**
 * Watch for system preference changes and update theme accordingly
 * @param {boolean} autoSwitch - Whether to auto-switch when system changes
 */
function watchSystemTheme(autoSwitch = true) {
    const media = window.matchMedia('(prefers-color-scheme: dark)');

    const handler = (e) => {
        if (!autoSwitch) return;

        // Only switch if user hasn't explicitly set a preference
        const hasSaved = localStorage.getItem(THEME_KEY) !== null;
        if (hasSaved) return;

        const newTheme = e.matches ? THEMES.DARK : THEMES.LIGHT;
        applyTheme(newTheme, true);
        console.log(`[Theme] Auto-switched to ${newTheme} (system preference)`);
    };

    media.addEventListener('change', handler);

    // Return cleanup function
    return () => {
        media.removeEventListener('change', handler);
    };
}

/* ═══════════════════════════════════════════════════════════════════
   RESET
   ═══════════════════════════════════════════════════════════════════ */

/**
 * Reset theme to system preference or default
 * @param {boolean} useSystemPreference - Use system preference or default to light
 */
function resetTheme(useSystemPreference = true) {
    let theme = THEMES.LIGHT;

    if (useSystemPreference) {
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        theme = prefersDark ? THEMES.DARK : THEMES.LIGHT;
    }

    applyTheme(theme, true);
    console.log(`[Theme] Reset to ${theme}`);
}

/**
 * Clear saved theme preference (will use system preference on next load)
 */
function clearSavedTheme() {
    try {
        localStorage.removeItem(THEME_KEY);
        console.log('[Theme] Saved preference cleared');
    } catch (_) { /* ignore */ }
}

/* ═══════════════════════════════════════════════════════════════════
   EXPOSE TO WINDOW (for onclick handlers)
   ═══════════════════════════════════════════════════════════════════ */

window.toggleTheme = toggleTheme;
window.initTheme = initTheme;
window.applyTheme = applyTheme;
window.getCurrentTheme = getCurrentTheme;
window.isDarkMode = isDarkMode;
window.isLightMode = isLightMode;
window.applySchoolLogo = applySchoolLogo;
window.resetTheme = resetTheme;