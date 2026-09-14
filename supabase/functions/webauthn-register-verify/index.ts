// supabase/functions/webauthn-register-verify/index.ts
// Called after navigator.credentials.create() resolves on client.
// Real crypto verification by @simplewebauthn/server — not hand-rolled.
// Request:  { userId: number, response: RegistrationResponseJSON, deviceLabel?: string }
// Response: { verified: boolean }

import { verifyRegistrationResponse } from 'npm:@simplewebauthn/server@9';
import { corsHeaders, getServiceClient, jsonResponse, RP_ID, ORIGIN } from '../_shared/webauthn-helpers.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { userId, response, deviceLabel } = await req.json();
    if (!userId || !response) {
      return jsonResponse({ error: 'userId and response are required' }, 400);
    }

    const supabase = getServiceClient();

    // Challenge must exist, unused, unexpired, belong to this user
    const { data: challengeRow, error: challengeErr } = await supabase
      .from('webauthn_challenges')
      .select('*')
      .eq('user_id', userId)
      .eq('type', 'registration')
      .eq('used', false)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (challengeErr || !challengeRow) {
      return jsonResponse({ error: 'No valid pending registration challenge' }, 400);
    }

    const verification = await verifyRegistrationResponse({
      response,
      expectedChallenge:      challengeRow.challenge,
      expectedOrigin:         ORIGIN,
      expectedRPID:           RP_ID,
      requireUserVerification: true,
    });

    // Mark single-use regardless of outcome
    await supabase.from('webauthn_challenges').update({ used: true }).eq('id', challengeRow.id);

    if (!verification.verified || !verification.registrationInfo) {
      return jsonResponse({ verified: false, error: 'Verification failed' }, 400);
    }

    const { credential } = verification.registrationInfo;

    const { error: insertErr } = await supabase.from('webauthn_credentials').insert({
      user_id:      userId,
      credential_id: credential.id,
      public_key:   Buffer.from(credential.publicKey).toString('base64url'),
      sign_count:   credential.counter,
      device_label: deviceLabel ?? null,
      transports:   response.response?.transports
                      ? JSON.stringify(response.response.transports)
                      : null,
      is_active:    true,
      created_at:   new Date().toISOString(),
      updated_at:   new Date().toISOString(),
    });
    if (insertErr) throw insertErr;

    return jsonResponse({ verified: true });
  } catch (err) {
    console.error('[webauthn-register-verify]', err);
    return jsonResponse({ error: err.message ?? 'Internal error' }, 500);
  }
});
