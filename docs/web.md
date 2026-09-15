
I'll follow the established "phase by phase" pattern and build Phase 6, checking the TODO for what's planned. Since this phase replaces the fake biometric system entirely with real WebAuthn, the earlier open question about whether to disable the fake toggle now resolves itself—I'm replacing it outright.

I discover the webauthn_credentials and webauthn_challenges tables already exist as empty shells with no columns, so I need to design their real schema and build the actual registration/authentication flow in auth.js to replace the fake functions. I'm sketching the registration flow: a new RPC generates and stores a challenge with expiry, returning relying party and user info to the client for the browser's WebAuthn API call.

That call triggers the real device biometric or PIN prompt, and the resulting credential gets sent to another RPC that verifies the challenge and stores the credential data. For the login flow, I'm planning a similar challenge-based approach that returns a list of matching credentials for the device or user attempting to unlock the app.

Then it verifies the signature and updates the sign count for replay protection, returning matching user info so the client can finish login. The real problem is that verifying WebAuthn signatures requires actual COSE/CBOR/ASN.1 crypto parsing that Postgres has no native support for—this isn't something I can reasonably build from scratch in plain PL/pgSQL; it normally needs a dedicated library like @simplewebauthn/server or py_webauthn.

…

bash

cd /home/claude/repo && git fetch origin 2>&1 | tail -3 && git log --oneline HEAD..origin/main
Output

exit code 0
Continue

Architected WebAuthn implementation using Edge Functions and audited libraries.
Let me be upfront about something important before I design this: real WebAuthn signature verification is cryptographically complex (COSE key parsing, ECDSA/RSA verification, CBOR decoding) — hand-rolling that in raw SQL would risk creating a second "looks secure but isn't" system, exactly what I flagged as wrong with the current fake biometric login. The correct, industry-standard way to do this with Supabase is a small Edge Function using an audited library. Let me check the real table shells and design around that properly.

Ran 2 commands
Continue

Recovering deleted files after an accidental repo wipe.
Recovering deleted files after an accidental repo wipe.
Bigger concern — TODO.md was apparently rewritten by another session ("Final cleanup... TODO rewritten"). Let me check whether my Phase 1-7 roadmap survived before rebuilding the lost Edge Function files.

Let me be upfront about something important before I design this: real WebAuthn signature verification is cryptographically complex (COSE key parsing, ECDSA/RSA verification, CBOR decoding) — hand-rolling that in raw SQL would risk creating a *second* "looks secure but isn't" system, exactly what I flagged as wrong with the current fake biometric login. The correct, industry-standard way to do this with Supabase is a small Edge Function using an audited library. Let me check the real table shells and design around that properly.Confirmed empty shells, zero rows. Let me check `teachers.id`'s exact type first, since the credential table needs a correct foreign key.

Now writing the four Edge Functions. Let me check if a `supabase/functions/` folder convention already exists in the repo before creating the structure.

mkdir -p /home/claude/repo/supabase/functions/webauthn-register-challenge
mkdir -p /home/claude/repo/supabase/functions/webauthn-register-verify
mkdir -p /home/claude/repo/supabase/functions/webauthn-login-challenge
mkdir -p /home/claude/repo/supabase/functions/webauthn-login-verify
mkdir -p /home/claude/repo/supabase/functions/_shared

Now writing a shared CORS/client helper used by all four functions, then each function itself.

// supabase/functions/_shared/webauthn-helpers.ts
//
// Shared by all four webauthn-* Edge Functions. Kept tiny and
// dependency-free (aside from the Supabase client) — the actual
// cryptographic work lives in @simplewebauthn/server, imported
// directly in each function via the npm: specifier Deno supports.

import { createClient } from 'npm:@supabase/supabase-js@2';

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

/**

* A Supabase client using the SERVICE ROLE key, set as an Edge
* Function secret (SUPABASE_SERVICE_ROLE_KEY) — never the anon key.
* This bypasses RLS entirely, which is intentional and safe here:
* these functions are the ONLY code path that ever touches
* webauthn_credentials/webauthn_challenges (see 007's header comment
* for why those tables have zero anon policies).
 */
export function getServiceClient() {
  const url = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !serviceKey) {
    throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set as Edge Function secrets');
  }
  return createClient(url, serviceKey);
}

/** The site's own origin(s) — WebAuthn ties credentials to a specific

* relying party ID (the bare domain) and expects the request's
* origin to match one of these exactly. Update RP_ID if the school's
* domain ever changes. */
export const RP_NAME = 'Ecole La Fontaine';
export const RP_ID = Deno.env.get('WEBAUTHN_RP_ID') ?? 'localhost';
export const ORIGIN = Deno.env.get('WEBAUTHN_ORIGIN') ?? `https://${RP_ID}`;

export function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Now the registration challenge function — called after a real password/Google login, to start registering the current device.

// supabase/functions/webauthn-register-challenge/index.ts
//
// Called from js/core/auth.js's enableBiometricLogin() (Phase 6),
// AFTER a real password or Google login already succeeded — this
// starts registering the CURRENT device against the CURRENT user.
//
// Request body: { userId: number }
// Response:     the PublicKeyCredentialCreationOptions object, ready
//               to pass straight to navigator.credentials.create()
//               on the client (after base64url-decoding challenge/
//               user.id, which js/core/auth.js's helper does).

import { generateRegistrationOptions } from 'npm:@simplewebauthn/server@9';
import { corsHeaders, getServiceClient, jsonResponse, RP_NAME, RP_ID } from '../_shared/webauthn-helpers.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { userId } = await req.json();
    if (!userId) return jsonResponse({ error: 'userId is required' }, 400);

    const supabase = getServiceClient();

    const { data: teacher, error: teacherErr } = await supabase
      .from('teachers')
      .select('id, username, first_name, last_name')
      .eq('id', userId)
      .eq('is_active', true)
      .single();

    if (teacherErr || !teacher) {
      return jsonResponse({ error: 'User not found or inactive' }, 404);
    }

    // Existing registered devices are excluded so the same device
    // can't accidentally register twice as two separate credentials.
    const { data: existing } = await supabase
      .from('webauthn_credentials')
      .select('credential_id, transports')
      .eq('user_id', userId);

    const options = await generateRegistrationOptions({
      rpName: RP_NAME,
      rpID: RP_ID,
      userID: new TextEncoder().encode(String(teacher.id)),
      userName: teacher.username,
      userDisplayName: `${teacher.first_name} ${teacher.last_name}`.trim(),
      attestationType: 'none',
      excludeCredentials: (existing ?? []).map((c) => ({
        id: c.credential_id,
        transports: c.transports ? JSON.parse(c.transports) : undefined,
      })),
      authenticatorSelection: {
        // 'platform' = the device's own biometric/PIN (Face ID,
        // fingerprint, Windows Hello) — not a separate USB security
        // key, matching what Natso actually asked for.
        authenticatorAttachment: 'platform',
        userVerification: 'required',
        residentKey: 'required',
      },
    });

    // Store the challenge server-side so register-verify can confirm
    // the response actually answers THIS challenge, not a replayed
    // or guessed one.
    const { error: insertErr } = await supabase.from('webauthn_challenges').insert({
      user_id: userId,
      challenge: options.challenge,
      type: 'registration',
      expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    });
    if (insertErr) throw insertErr;

    return jsonResponse(options);
  } catch (err) {
    console.error('[webauthn-register-challenge]', err);
    return jsonResponse({ error: err.message ?? 'Internal error' }, 500);
  }
});

Now the registration verify function — checks the browser's response and stores the credential.

// supabase/functions/webauthn-register-verify/index.ts
//
// Called right after navigator.credentials.create() resolves on the
// client. This is where the actual cryptographic verification
// happens — done by @simplewebauthn/server, not hand-rolled here.
//
// Request body: { userId: number, response: RegistrationResponseJSON, deviceLabel?: string }
// Response:     { verified: boolean }

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

    // The challenge this response claims to answer must exist, be
    // unused, unexpired, and belong to this user — every one of those
    // checks is what stops a replayed or forged response, which is
    // exactly what the CURRENT fake implementation never checks at all.
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
      return jsonResponse({ error: 'No valid pending registration challenge for this user' }, 400);
    }

    const verification = await verifyRegistrationResponse({
      response,
      expectedChallenge: challengeRow.challenge,
      expectedOrigin: ORIGIN,
      expectedRPID: RP_ID,
      requireUserVerification: true,
    });

    // Mark the challenge used regardless of outcome — it's single-use.
    await supabase.from('webauthn_challenges').update({ used: true }).eq('id', challengeRow.id);

    if (!verification.verified || !verification.registrationInfo) {
      return jsonResponse({ verified: false, error: 'Verification failed' }, 400);
    }

    const { credential } = verification.registrationInfo;

    const { error: insertErr } = await supabase.from('webauthn_credentials').insert({
      user_id: userId,
      credential_id: credential.id,
      public_key: Buffer.from(credential.publicKey).toString('base64url'),
      sign_count: credential.counter,
      device_label: deviceLabel ?? null,
      transports: response.response?.transports ? JSON.stringify(response.response.transports) : null,
    });
    if (insertErr) throw insertErr;

    return jsonResponse({ verified: true });
  } catch (err) {
    console.error('[webauthn-register-verify]', err);
    return jsonResponse({ error: err.message ?? 'Internal error' }, 500);
  }
});

Now the login challenge and login verify functions — the actual "unlock the app" flow.

// supabase/functions/webauthn-login-challenge/index.ts
//
// Called when the login page's "Unlock" button is tapped — BEFORE we
// know who's using the device for certain (that's the point: the
// device's own biometric/PIN prompt is what confirms identity, not
// anything the app already trusted). If a specific user is known to
// have last used this browser (js/core/auth.js keeps a small, non-
// secret "who logged in here last" hint in localStorage — a hint the
// UI can use to prefill an allow-list, never used as proof of
// identity), pass it as userId to narrow the credential list. If not
// provided, this issues a discoverable-credential (resident key)
// request instead, and the browser/OS picks from whatever credentials
// it already has for this site.
//
// Request body: { userId?: number }
// Response:     the PublicKeyCredentialRequestOptions object.

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
        .eq('user_id', userId);
      allowCredentials = (creds ?? []).map((c) => ({
        id: c.credential_id,
        transports: c.transports ? JSON.parse(c.transports) : undefined,
      }));
      if (allowCredentials.length === 0) {
        return jsonResponse({ error: 'No registered devices for this user' }, 404);
      }
    }
    // If userId wasn't provided, allowCredentials stays undefined —
    // generateAuthenticationOptions() then issues a discoverable
    // (resident-key) request, letting the browser/OS surface whatever
    // credentials it already has for this exact site.

    const options = await generateAuthenticationOptions({
      rpID: RP_ID,
      userVerification: 'required',
      allowCredentials,
    });

    const { error: insertErr } = await supabase.from('webauthn_challenges').insert({
      user_id: userId ?? null,
      challenge: options.challenge,
      type: 'authentication',
      expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    });
    if (insertErr) throw insertErr;

    return jsonResponse(options);
  } catch (err) {
    console.error('[webauthn-login-challenge]', err);
    return jsonResponse({ error: err.message ?? 'Internal error' }, 500);
  }
});

Now I'm designing the login-verify function, the most critical piece: it needs to locate the credential by ID, resolve its owning user, find the matching unused/…

Now the most critical function — real signature verification and the anti-clone check via `sign_count`.

// supabase/functions/webauthn-login-verify/index.ts
//
// The real "unlock" step. Looks up which credential the response
// claims to be from, verifies the signature against that credential's
// stored public key, and checks sign_count strictly increased (the
// standard WebAuthn clone-detection signal — if a cloned/copied
// authenticator is ever used, its counter will be stale or repeat,
// and this rejects it rather than silently accepting it).
//
// Request body: { response: AuthenticationResponseJSON }
// Response:     { verified: boolean, user?: {...same shape as login_check()} }

import { verifyAuthenticationResponse } from 'npm:@simplewebauthn/server@9';
import { corsHeaders, getServiceClient, jsonResponse, RP_ID, ORIGIN } from '../_shared/webauthn-helpers.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { response } = await req.json();
    if (!response?.id) return jsonResponse({ error: 'response is required' }, 400);

    const supabase = getServiceClient();

    // Which registered device does this response claim to be?
    const { data: credRow, error: credErr } = await supabase
      .from('webauthn_credentials')
      .select('*')
      .eq('credential_id', response.id)
      .maybeSingle();

    if (credErr || !credRow) {
      return jsonResponse({ verified: false, error: 'Unknown credential' }, 400);
    }

    // Find a matching, unused, unexpired authentication challenge —
    // either scoped to this exact user (the common case), or a
    // discoverable-credential request that wasn't scoped to anyone
    // yet (user_id IS NULL) at issue time.
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
      expectedChallenge: challengeRow.challenge,
      expectedOrigin: ORIGIN,
      expectedRPID: RP_ID,
      requireUserVerification: true,
      credential: {
        id: credRow.credential_id,
        publicKey: Buffer.from(credRow.public_key, 'base64url'),
        counter: Number(credRow.sign_count),
      },
    });

    await supabase.from('webauthn_challenges').update({ used: true }).eq('id', challengeRow.id);

    if (!verification.verified) {
      return jsonResponse({ verified: false, error: 'Signature verification failed' }, 400);
    }

    // Clone/replay detection: the authenticator's own counter must
    // have strictly increased since last use. A stale or repeated
    // counter means either a cloned authenticator or a replayed
    // response — reject rather than silently accept, which is exactly
    // what the CURRENT fake implementation has no way to do at all.
    const newCounter = verification.authenticationInfo.newCounter;
    if (newCounter > 0 && newCounter <= Number(credRow.sign_count)) {
      console.warn(`[webauthn-login-verify] sign_count did not increase for credential ${credRow.id} — possible cloned authenticator`);
      return jsonResponse({ verified: false, error: 'Security check failed — please contact your administrator' }, 400);
    }

    await supabase
      .from('webauthn_credentials')
      .update({ sign_count: newCounter, last_used_at: new Date().toISOString() })
      .eq('id', credRow.id);

    const { data: teacher, error: teacherErr } = await supabase
      .from('teachers')
      .select('id, username, first_name, last_name, role, phone, email, is_active')
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

Now I need to update auth.js to replace the fake biometric functions with real calls to these Edge Functions, thinking through how to detect whether a user has an enabled credential without over-querying the server on every page load.

I'm settling on storing a local hint like lf_webauthn_registered_user_id for UX purposes only, while the real credential check happens server-side during login. For enableBiometricLogin(), I need it to call webauthn-register-challenge after the user is authenticated, convert the base64url challenge/user id fields into ArrayBuffers for navigator.credentials.create(), then encode the resulting credential's binary fields back for sending to the server.

I'm keeping the existing tryBiometricLogin() function name for backward compatibility, but rewriting its internals to read the stored user id hint (falling back to a discoverable credential request if none exists) and then call the login-challenge endpoint.

On success it converts the credential response into base64url form, calls the login-verify endpoint, and if verified, routes through the same _completeLogin(user) path used by password/Google auth, updating the stored hint to whichever user actually matched. On failure it just surfaces an error and lets the person fall back to another login method.

For disableBiometricLogin(), I realize a real "disable" needs to delete the credential row server-side, not just clear the local hint, since otherwise the credential would still work on that device. Since the app uses a custom session rather than Supabase Auth, a direct client delete would hit RLS restrictions on webauthn_credentials (no anon policies exist by design), so I need a proper authenticated Edge Function to handle the deletion securely.

Given the time already invested, I think the pragmatic path is to have "disable" just clear the local hint on this device for now, and treat true server-side revocation as a follow-up feature — but if I can fit it in cheaply, I'…

Now let's find where enableBiometricLogin()/disableBiometricLogin() are actually triggered from in the UI, before rewriting them.
