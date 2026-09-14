// supabase/functions/webauthn-register-challenge/index.ts
// Called from auth.js enableBiometricLogin() AFTER a real login succeeded.
// Request:  { userId: number }
// Response: PublicKeyCredentialCreationOptions (pass to navigator.credentials.create())

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

    // Exclude already-registered devices so same device can't register twice
    const { data: existing } = await supabase
      .from('webauthn_credentials')
      .select('credential_id, transports')
      .eq('user_id', userId);

    const options = await generateRegistrationOptions({
      rpName: RP_NAME,
      rpID:   RP_ID,
      userID: new TextEncoder().encode(String(teacher.id)),
      userName: teacher.username,
      userDisplayName: `${teacher.first_name} ${teacher.last_name}`.trim(),
      attestationType: 'none',
      excludeCredentials: (existing ?? []).map((c) => ({
        id: c.credential_id,
        transports: c.transports ? JSON.parse(c.transports) : undefined,
      })),
      authenticatorSelection: {
        authenticatorAttachment: 'platform', // device biometric/PIN only
        userVerification: 'required',
        residentKey: 'required',
      },
    });

    // Store server-side challenge — register-verify confirms response matches this
    const { error: insertErr } = await supabase.from('webauthn_challenges').insert({
      user_id:    userId,
      challenge:  options.challenge,
      type:       'registration',
      used:       false,
      expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
      created_at: new Date().toISOString(),
    });
    if (insertErr) throw insertErr;

    return jsonResponse(options);
  } catch (err) {
    console.error('[webauthn-register-challenge]', err);
    return jsonResponse({ error: err.message ?? 'Internal error' }, 500);
  }
});
