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
/* ═══════════════════════════════════════════════════════════════════
   js/config/supabase-config.js — Supabase client setup
   ═══════════════════════════════════════════════════════════════════ */

const DEFAULT_SUPABASE_URL = 'https://ovmymtdrugdljnttiltd.supabase.co';
const DEFAULT_SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im92bXltdGRydWdkbGpudHRpbHRkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI1ODkwMDAsImV4cCI6MjA5ODE2NTAwMH0.8stEjiVUde2wNodGFW1dkNPhm501EqhlqbTFM2yXyLI';

function getSupabaseUrl() {
  return localStorage.getItem('sb_url') || DEFAULT_SUPABASE_URL;
}

function getSupabaseKey() {
  return localStorage.getItem('sb_key') || DEFAULT_SUPABASE_KEY;
}

let supabaseClient = null;

function initSupabase() {
  if (typeof window.supabase === 'undefined') {
    console.error('Supabase JS library not found.');
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

initSupabase();

function isSupabaseConfigured() {
  return supabaseClient !== null && !getSupabaseUrl().includes('YOUR-PROJECT-REF');
}

function getSupabaseClient() {
  return supabaseClient;
}

function setSupabaseCredentials(url, key) {
  if (url) localStorage.setItem('sb_url', url);
  if (key) localStorage.setItem('sb_key', key);
  return initSupabase();
}

function resetSupabaseCredentials() {
  localStorage.removeItem('sb_url');
  localStorage.removeItem('sb_key');
  return initSupabase();
}

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

// ==================================================================================
// ✅ FIXED: ALWAYS returns an object with ok/error properties
// ==================================================================================

async function testSupabaseConnection() {
  try {
    const url = getSupabaseUrl();
    const key = getSupabaseKey();

    if (!url || !key) {
      return { ok: false, error: 'No Supabase credentials configured' };
    }

    const res = await fetch(`${url}/rest/v1/academic_years?select=id&limit=1`, {
      method: 'GET',
      headers: {
        'apikey': key,
        'Authorization': `Bearer ${key}`
      },
    });

    if (res.ok) {
      return { ok: true, error: null };
    }

    if (res.status === 401 || res.status === 403) {
      return { ok: false, error: 'Invalid API key or insufficient permissions' };
    }

    return { ok: false, error: `HTTP ${res.status}: ${res.statusText || 'Unknown error'}` };

  } catch (err) {
    // ✅ Catch ANY error and return an object
    return { ok: false, error: err.message || 'Network error' };
  }
}

// Alias for boot.js
function hasSupabaseCredentials() {
  return isSupabaseConfigured();
}

function saveSupabaseCredentials(url, key) {
  return setSupabaseCredentials(url, key);
}

// Expose to window
window.SUPABASE_URL = getSupabaseUrl();
window.SUPABASE_KEY = getSupabaseKey();
window.SUPABASE_DEFAULT_URL = DEFAULT_SUPABASE_URL;
window.SUPABASE_DEFAULT_KEY = DEFAULT_SUPABASE_KEY;
// NOTE: window.supabaseClient (a snapshot) used to be exposed here,
// but it was only ever set once at module load — if initSupabase()
// ran again later (setSupabaseCredentials()/resetSupabaseCredentials()
// reassign the module-scoped `supabaseClient` variable, not this
// property), anything reading window.supabaseClient directly would
// silently keep using a stale client. Nothing in the app currently
// reads it directly (checked before removing it), but exposing a live
// getter instead removes the trap for whoever reaches for it next.
Object.defineProperty(window, 'supabaseClient', { get: getSupabaseClient, configurable: true });
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