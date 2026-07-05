/**
 * ECOLE LA FONTAINE — Supabase Configuration
 * Last updated: 2026-07-05
 */

// ── DEFAULT CREDENTIALS ─────────────────────────────────────────────────────
const DEFAULT_SUPABASE_URL = 'https://ovmymtdrugdljnttiltd.supabase.co';
const DEFAULT_SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im92bXltdGRydWdkbGpudHRpbHRkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI1ODkwMDAsImV4cCI6MjA5ODE2NTAwMH0.8stEjiVUde2wNodGFW1dkNPhm501EqhlqbTFM2yXyLI';

// ── RESOLVE FROM localStorage (allows override from API settings page) ───────
function getSupabaseUrl() {
    return localStorage.getItem('sb_url') || DEFAULT_SUPABASE_URL;
}

function getSupabaseKey() {
    return localStorage.getItem('sb_key') || DEFAULT_SUPABASE_KEY;
}

// ── LIVE VALUES ──────────────────────────────────────────────────────────────
const SUPABASE_URL = getSupabaseUrl();
const SUPABASE_KEY = getSupabaseKey();

// ── WINDOW GLOBALS (for plain scripts) ──────────────────────────────────────
window.SUPABASE_URL             = SUPABASE_URL;
window.SUPABASE_KEY             = SUPABASE_KEY;
window.DEFAULT_SUPABASE_URL     = DEFAULT_SUPABASE_URL;
window.DEFAULT_SUPABASE_KEY     = DEFAULT_SUPABASE_KEY;
window.getSupabaseUrl           = getSupabaseUrl;
window.getSupabaseKey           = getSupabaseKey;

// ── ES MODULE EXPORTS (for type="module" scripts like api.js) ────────────────
// These are live reads so api.js always gets the current value
export { SUPABASE_URL, SUPABASE_KEY, DEFAULT_SUPABASE_URL, DEFAULT_SUPABASE_KEY };
export { getSupabaseUrl, getSupabaseKey };

export function setSupabaseCredentials(url, key) {
    if (url) localStorage.setItem('sb_url', url);
    if (key) localStorage.setItem('sb_key', key);
}

export function resetSupabaseCredentials() {
    localStorage.removeItem('sb_url');
    localStorage.removeItem('sb_key');
}

export function getSupabaseCredentials() {
    return { url: getSupabaseUrl(), key: getSupabaseKey() };
}
