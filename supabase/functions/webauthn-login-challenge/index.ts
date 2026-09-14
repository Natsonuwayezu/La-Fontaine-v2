// supabase/functions/webauthn-login-challenge/index.ts
// Called when "Unlock with Biometric" is tapped on login page.
// userId is optional hint from localStorage (never used as proof).
// If omitted → discoverable credential request (browser picks credential).
// Request:  { userId?: number }
// Response: PublicKeyCredentialRequestOptions

import { generateAuthenticationOptions } from 'npm:@simplewebauthn/server@9';
import { corsHeaders, getServiceClient, jsonResponse, RP_ID } from '../_shared/webauthn-helpers.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { userId } = await req.json().catch(() => ({}));

    const supabase = getServiceClient();

    let allowCredentials: { id: string; transports?: string[] }[] | undefined;

    if (userId) {
      const { data: creds } = await supabase
        .from('webauthn_credentials')
        .select('credential_id, transports')
        .eq('user_id', userId)
        .eq('is_active', true);

      allowCredentials = (creds ?? []).map((c) => ({
        id:         c.credential_id,
        transports: c.transports ? JSON.parse(c.transports) : undefined,
      }));

      if (allowCredentials.length === 0) {
        return jsonResponse({ error: 'No registered devices for this user' }, 404);
      }
    }
    // allowCredentials undefined → discoverable credential (resident key)

    const options = await generateAuthenticationOptions({
      rpID: RP_ID,
      userVerification: 'required',
      allowCredentials,
    });

    const { error: insertErr } = await supabase.from('webauthn_challenges').insert({
      user_id:    userId ?? null,
      challenge:  options.challenge,
      type:       'authentication',
      used:       false,
      expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
      created_at: new Date().toISOString(),
    });
    if (insertErr) throw insertErr;

    return jsonResponse(options);
  } catch (err) {
    console.error('[webauthn-login-challenge]', err);
    return jsonResponse({ error: err.message ?? 'Internal error' }, 500);
  }
});
