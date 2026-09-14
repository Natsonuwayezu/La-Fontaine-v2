// supabase/functions/_shared/webauthn-helpers.ts
// Shared by all four webauthn-* Edge Functions.
// Crypto work lives in @simplewebauthn/server imported in each function.

import { createClient } from 'npm:@supabase/supabase-js@2';

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

/** Service role client — bypasses RLS. Only used by these WebAuthn
 *  Edge Functions which are the sole code path for these tables. */
export function getServiceClient() {
  const url        = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !serviceKey) {
    throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set as Edge Function secrets');
  }
  return createClient(url, serviceKey);
}

export const RP_NAME = 'Ecole La Fontaine';
export const RP_ID   = Deno.env.get('WEBAUTHN_RP_ID')   ?? 'localhost';
export const ORIGIN  = Deno.env.get('WEBAUTHN_ORIGIN')  ?? `https://${RP_ID}`;

export function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
