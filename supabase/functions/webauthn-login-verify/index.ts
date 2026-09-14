// supabase/functions/webauthn-login-verify/index.ts
// Real signature verification + sign_count clone detection.
// Request:  { response: AuthenticationResponseJSON }
// Response: { verified: boolean, user?: { id, username, first_name, last_name, role, ... } }

import { verifyAuthenticationResponse } from 'npm:@simplewebauthn/server@9';
import { corsHeaders, getServiceClient, jsonResponse, RP_ID, ORIGIN } from '../_shared/webauthn-helpers.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { response } = await req.json();
    if (!response?.id) return jsonResponse({ error: 'response is required' }, 400);

    const supabase = getServiceClient();

    // Which credential is this response claiming to be?
    const { data: credRow, error: credErr } = await supabase
      .from('webauthn_credentials')
      .select('*')
      .eq('credential_id', response.id)
      .eq('is_active', true)
      .maybeSingle();

    if (credErr || !credRow) {
      return jsonResponse({ verified: false, error: 'Unknown credential' }, 400);
    }

    // Find matching unused unexpired challenge for this user
    const { data: challengeRow, error: challengeErr } = await supabase
      .from('webauthn_challenges')
      .select('*')
      .eq('type', 'authentication')
      .eq('used', false)
      .gt('expires_at', new Date().toISOString())
      .or(`user_id.eq.${credRow.user_id},user_id.is.null`)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (challengeErr || !challengeRow) {
      return jsonResponse({ verified: false, error: 'No valid pending login challenge' }, 400);
    }

    const verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge:      challengeRow.challenge,
      expectedOrigin:         ORIGIN,
      expectedRPID:           RP_ID,
      requireUserVerification: true,
      credential: {
        id:        credRow.credential_id,
        publicKey: Buffer.from(credRow.public_key, 'base64url'),
        counter:   Number(credRow.sign_count),
      },
    });

    // Always mark challenge used — single-use regardless of outcome
    await supabase.from('webauthn_challenges').update({ used: true }).eq('id', challengeRow.id);

    if (!verification.verified) {
      return jsonResponse({ verified: false, error: 'Signature verification failed' }, 400);
    }

    // Clone/replay detection: counter must strictly increase
    const newCounter = verification.authenticationInfo.newCounter;
    if (newCounter > 0 && newCounter <= Number(credRow.sign_count)) {
      console.warn(
        `[webauthn-login-verify] sign_count did not increase for credential ${credRow.id}` +
        ` — possible cloned authenticator`
      );
      return jsonResponse({
        verified: false,
        error: 'Security check failed — please contact your administrator',
      }, 400);
    }

    // Update counter and last used timestamp
    await supabase
      .from('webauthn_credentials')
      .update({ sign_count: newCounter, last_used_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', credRow.id);

    // Fetch the teacher record to return — same shape as login_check()
    const { data: teacher, error: teacherErr } = await supabase
      .from('teachers')
      .select('id, username, first_name, last_name, role, phone, email, class_id, is_active')
      .eq('id', credRow.user_id)
      .single();

    if (teacherErr || !teacher || teacher.is_active === false) {
      return jsonResponse({ verified: false, error: 'Account not found or inactive' }, 403);
    }

    return jsonResponse({ verified: true, user: teacher });
  } catch (err) {
    console.error('[webauthn-login-verify]', err);
    return jsonResponse({ error: err.message ?? 'Internal error' }, 500);
  }
});
