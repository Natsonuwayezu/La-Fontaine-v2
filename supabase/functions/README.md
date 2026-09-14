# Supabase Edge Functions — WebAuthn (Biometric Login)

Four Edge Functions replace the fake localStorage biometric system with
real WebAuthn signature verification using @simplewebauthn/server@9.

## Functions

| Function | Called from | Purpose |
|---|---|---|
| `webauthn-register-challenge` | `enableBiometricLogin()` in auth.js | Generates registration options, stores challenge |
| `webauthn-register-verify`    | `enableBiometricLogin()` in auth.js | Verifies browser response, stores credential |
| `webauthn-login-challenge`    | `tryBiometricLogin()` in auth.js    | Generates authentication options |
| `webauthn-login-verify`       | `tryBiometricLogin()` in auth.js    | Verifies signature, returns teacher record |

## Deploy

```bash
# Install Supabase CLI first: https://supabase.com/docs/guides/cli
supabase login
supabase link --project-ref ovmymtdrugdljnttiltd

# Set required secrets
supabase secrets set SUPABASE_URL=https://ovmymtdrugdljnttiltd.supabase.co
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=<your-service-role-key>
supabase secrets set WEBAUTHN_RP_ID=<your-domain>
supabase secrets set WEBAUTHN_ORIGIN=https://<your-domain>

# Deploy all 4 functions
supabase functions deploy webauthn-register-challenge
supabase functions deploy webauthn-register-verify
supabase functions deploy webauthn-login-challenge
supabase functions deploy webauthn-login-verify
```

## Run SQL first

Run `docs/sql/012_webauthn_schema.sql` in Supabase SQL Editor before deploying.
This adds the real columns to webauthn_credentials and webauthn_challenges.

## How it works

1. Teacher logs in with password normally
2. Settings page shows "Enable Biometric Login" button
3. Click → calls `webauthn-register-challenge` → server generates options
4. Browser triggers device biometric/PIN prompt (Touch ID, Face ID, Windows Hello)
5. Response sent to `webauthn-register-verify` → real COSE/ECDSA verification
6. Credential stored in `webauthn_credentials` with public_key + sign_count

**Login:**
1. Login page shows "Unlock" button if `lf_biometric_enabled` in localStorage
2. Click → calls `webauthn-login-challenge` (with stored userId hint)
3. Browser triggers biometric prompt again
4. Response sent to `webauthn-login-verify` → verifies signature + checks
   sign_count strictly increased (clone/replay detection)
5. Returns teacher record → same `_completeLogin()` path as password login

## Security properties

- Challenge is server-issued and single-use (5 min TTY)
- Signature verified by audited @simplewebauthn/server library
- sign_count must strictly increase → cloned authenticator detection
- Tables have no anon/authenticated RLS policies — only service role key works
- localStorage stores only a UX hint (userId), never the credential itself
