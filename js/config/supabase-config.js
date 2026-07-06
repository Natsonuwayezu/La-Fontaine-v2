/**
 * ECOLE LA FONTAINE — Supabase Configuration
 * URL and API key — overridable from localStorage
 * Last updated: 2026-06-28
 */

// ──────────────────────────────────────────────────────────────────────
// DEFAULT CREDENTIALS (fallback if no localStorage override)
// ──────────────────────────────────────────────────────────────────────

const DEFAULT_SUPABASE_URL = 'https://ovmymtdrugdljnttiltd.supabase.co';
const DEFAULT_SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im92bXltdGRydWdkbGpudHRpbHRkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI1ODkwMDAsImV4cCI6MjA5ODE2NTAwMH0.8stEjiVUde2wNodGFW1dkNPhm501EqhlqbTFM2yXyLI';

// ──────────────────────────────────────────────────────────────────────
// RESOLVE FROM localStorage (overrides)
// ──────────────────────────────────────────────────────────────────────

function getSupabaseUrl() {
    return localStorage.getItem('sb_url') || DEFAULT_SUPABASE_URL;
}

function getSupabaseKey() {
    return localStorage.getItem('sb_key') || DEFAULT_SUPABASE_KEY;
}

// ──────────────────────────────────────────────────────────────────────
// EXPORT (read-only — use the getters, never mutate directly)
// ──────────────────────────────────────────────────────────────────────

export const SUPABASE_URL = getSupabaseUrl();
export const SUPABASE_KEY = getSupabaseKey();
export const SUPABASE_DEFAULT_URL = DEFAULT_SUPABASE_URL;
export const SUPABASE_DEFAULT_KEY = DEFAULT_SUPABASE_KEY;

window.SUPABASE_URL = SUPABASE_URL;
window.SUPABASE_KEY = SUPABASE_KEY;
window.SUPABASE_DEFAULT_URL = SUPABASE_DEFAULT_URL;
window.SUPABASE_DEFAULT_KEY = SUPABASE_DEFAULT_KEY;

/**
 * Update Supabase credentials in localStorage
 * @param {string} url - New Supabase URL
 * @param {string} key - New API key
 */
export function setSupabaseCredentials(url, key) {
    if (url) localStorage.setItem('sb_url', url);
    if (key) localStorage.setItem('sb_key', key);
    // Update the exported constants
    // Note: This only updates the values for future imports.
    // For live updates, use the getters or call this before any API calls.
}

/**
 * Reset Supabase credentials to defaults
 */
export function resetSupabaseCredentials() {
    localStorage.removeItem('sb_url');
    localStorage.removeItem('sb_key');
}

/**
 * Get current credentials (for API calls)
 */
export function getSupabaseCredentials() {
    return {
        url: getSupabaseUrl(),
        key: getSupabaseKey(),
    };
}