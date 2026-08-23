/* ═══════════════════════════════════════════════════════════════════
   js/config/supabase-config.js — Supabase client setup
   ═══════════════════════════════════════════════════════════════════
   Requires the Supabase JS UMD build loaded via CDN in index.html
   BEFORE this script (added as <script src=".../supabase-js@2"...>).
   core/api.js will use `supabaseClient` as its only way of talking
   to the backend — no other file should call window.supabase directly.

   IMPORTANT: replace DEFAULT_SUPABASE_URL / DEFAULT_SUPABASE_KEY with
   the real project values before deploying. The anon key is safe to
   ship client-side (Supabase's row-level security is what actually
   protects data — it must be configured on the tables themselves).

   Credentials can be overridden via localStorage:
   - sb_url  : custom Supabase URL
   - sb_key  : custom API key

   Last updated: 2026-07-13
   ═══════════════════════════════════════════════════════════════════ */

/* ═══════════════════════════════════════════════════════════════════
   DEFAULT CREDENTIALS
   ═══════════════════════════════════════════════════════════════════ */

const DEFAULT_SUPABASE_URL = 'https://ovmymtdrugdljnttiltd.supabase.co';
const DEFAULT_SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im92bXltdGRydWdkbGpudHRpbHRkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI1ODkwMDAsImV4cCI6MjA5ODE2NTAwMH0.8stEjiVUde2wNodGFW1dkNPhm501EqhlqbTFM2yXyLI';

/* ═══════════════════════════════════════════════════════════════════
   RESOLVE FROM localStorage (overrides)
   ═══════════════════════════════════════════════════════════════════ */

/**
 * Get the Supabase URL from localStorage or fallback to default
 * @returns {string} The Supabase URL
 */
function getSupabaseUrl() {
  return localStorage.getItem('sb_url') || DEFAULT_SUPABASE_URL;
}

/**
 * Get the Supabase API key from localStorage or fallback to default
 * @returns {string} The Supabase API key
 */
function getSupabaseKey() {
  return localStorage.getItem('sb_key') || DEFAULT_SUPABASE_KEY;
}

/* ═══════════════════════════════════════════════════════════════════
   SUPABASE CLIENT INITIALIZATION
   ═══════════════════════════════════════════════════════════════════ */

let supabaseClient = null;

/**
 * Initialize the Supabase client
 * @returns {object|null} The Supabase client instance or null if failed
 */
function initSupabase() {
  if (typeof window.supabase === 'undefined') {
    console.error(
      'Supabase JS library not found. Make sure the CDN script tag ' +
      '(@supabase/supabase-js) is included in index.html before ' +
      'js/config/supabase-config.js.'
    );
    return null;
  }

  const url = getSupabaseUrl();
  const key = getSupabaseKey();

  supabaseClient = window.supabase.createClient(url, key, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false
    }
  });

  return supabaseClient;
}

// Initialize the client immediately
initSupabase();

/* ═══════════════════════════════════════════════════════════════════
   HELPERS
   ═══════════════════════════════════════════════════════════════════ */

/**
 * Check if Supabase is properly configured
 * @returns {boolean} True if client exists and URL is not a placeholder
 */
function isSupabaseConfigured() {
  return supabaseClient !== null && !getSupabaseUrl().includes('YOUR-PROJECT-REF');
}

/**
 * Get the current Supabase client instance
 * @returns {object|null} The Supabase client or null if not initialized
 */
function getSupabaseClient() {
  return supabaseClient;
}

/**
 * Update Supabase credentials in localStorage and reinitialize the client
 * @param {string} url - New Supabase URL
 * @param {string} key - New API key
 * @returns {object|null} The reinitialized client or null if failed
 */
function setSupabaseCredentials(url, key) {
  if (url) localStorage.setItem('sb_url', url);
  if (key) localStorage.setItem('sb_key', key);
  // Reinitialize the client with new credentials
  return initSupabase();
}

/**
 * Reset Supabase credentials to defaults and reinitialize
 * @returns {object|null} The reinitialized client or null if failed
 */
function resetSupabaseCredentials() {
  localStorage.removeItem('sb_url');
  localStorage.removeItem('sb_key');
  return initSupabase();
}

/**
 * Get current credentials (for display or API calls)
 * @returns {object} { url, key, isUsingDefaults }
 */
function getSupabaseCredentials() {
  const url = getSupabaseUrl();
  const key = getSupabaseKey();
  return {
    url: url,
    key: key,
    isUsingDefaults: url === DEFAULT_SUPABASE_URL && key === DEFAULT_SUPABASE_KEY,
    defaultUrl: DEFAULT_SUPABASE_URL,
    defaultKey: DEFAULT_SUPABASE_KEY
  };
}

/* ═══════════════════════════════════════════════════════════════════
   EXPOSE TO WINDOW (for debugging and legacy onclick handlers)
   ═══════════════════════════════════════════════════════════════════ */

/**
 * Alias for isSupabaseConfigured() — called by boot.js step 5.
 */
function hasSupabaseCredentials() {
  return isSupabaseConfigured();
}

/**
 * Test the Supabase connection with a lightweight request.
 * Returns { ok: boolean, error: string|null }
 */
async function testSupabaseConnection() {
  try {
    const url = getSupabaseUrl();
    const key = getSupabaseKey();
    if (!url || !key) return { ok: false, error: 'No credentials configured' };
    const res = await fetch(`${url}/rest/v1/`, {
      method: 'GET',
      headers: { 'apikey': key, 'Authorization': `Bearer ${key}` },
    });
    // 200 = connected, 400 = connected but bad path, both mean server reachable
    if (res.ok || res.status === 400) return { ok: true, error: null };
    return { ok: false, error: `HTTP ${res.status}` };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

/**
 * Alias for setSupabaseCredentials() — called by boot.js API setup screen.
 */
function saveSupabaseCredentials(url, key) {
  return setSupabaseCredentials(url, key);
}

window.SUPABASE_URL = getSupabaseUrl();
window.SUPABASE_KEY = getSupabaseKey();
window.SUPABASE_DEFAULT_URL = DEFAULT_SUPABASE_URL;
window.SUPABASE_DEFAULT_KEY = DEFAULT_SUPABASE_KEY;
window.supabaseClient = supabaseClient;
window.getSupabaseClient = getSupabaseClient;
window.initSupabase = initSupabase;
window.isSupabaseConfigured = isSupabaseConfigured;
window.getSupabaseUrl = getSupabaseUrl;
window.getSupabaseKey = getSupabaseKey;
window.getSupabaseCredentials = getSupabaseCredentials;
window.setSupabaseCredentials = setSupabaseCredentials;
window.resetSupabaseCredentials = resetSupabaseCredentials;
window.hasSupabaseCredentials = hasSupabaseCredentials;
window.testSupabaseConnection = testSupabaseConnection;
window.saveSupabaseCredentials = saveSupabaseCredentials;
