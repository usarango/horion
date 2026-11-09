// Deno resolves pinned npm specifiers in the hosted Edge Function runtime.
import { createClient } from 'npm:@supabase/supabase-js@2.119.0';
import { createRegistrationHandler, type RegistrationBackend } from './handler.ts';

function runtimeKey(modernName: string, legacyName: string): string {
  const raw = Deno.env.get(modernName);
  if (raw) {
    const values = JSON.parse(raw) as Record<string, unknown>;
    if (typeof values.default === 'string' && values.default) return values.default;
  }
  return Deno.env.get(legacyName) || '';
}

let secretKey = '';
let publicKey = '';
let configurationReady = false;
try {
  secretKey = runtimeKey('SUPABASE_SECRET_KEYS', 'SUPABASE_SERVICE_ROLE_KEY');
  publicKey = runtimeKey('SUPABASE_PUBLISHABLE_KEYS', 'SUPABASE_ANON_KEY');
  configurationReady = !!secretKey && !!publicKey && !!Deno.env.get('SUPABASE_URL');
} catch {
  /* Invalid runtime configuration must fail closed. */
}
const url = Deno.env.get('SUPABASE_URL') || 'https://unconfigured.invalid';

// Modern API keys are sent only as apikey, never as a Bearer JWT. Session JWTs
// are unaffected. No runtime key is returned, logged or saved in source.
const safeFetch: typeof fetch = (input, init) => {
  const request = new Request(input, init);
  for (const key of [secretKey, publicKey]) {
    if (
      /^sb_(?:secret|publishable)_/.test(key) &&
      request.headers.get('authorization') === `Bearer ${key}`
    )
      request.headers.delete('authorization');
  }
  return fetch(request);
};
const options = {
  db: { schema: 'horion' },
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  global: { fetch: safeFetch },
};
const admin = configurationReady ? createClient(url, secretKey, options) : null;
function ready() {
  if (!admin) throw new Error('unavailable');
  return admin;
}
const backend: RegistrationBackend = {
  async consumeAttempt(ipHash, emailHash) {
    const { data, error } = await ready().rpc('consume_registration_attempt', {
      p_ip_hash: ipHash,
      p_email_hash: emailHash,
    });
    if (error || typeof data !== 'boolean') throw new Error('unavailable');
    return data;
  },
  async createConfirmedUser(input) {
    const { data, error } = await ready().auth.admin.createUser(input);
    return { ok: !error && !!data.user?.id, errorCode: error?.code || null };
  },
  async signIn(email, password) {
    ready();
    // A fresh unprivileged client prevents identity/session reuse across requests.
    const client = createClient(url, publicKey, options);
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    return {
      errorCode: error?.code || (error ? 'auth_service_unavailable' : null),
      tokens: data.session
        ? {
            access_token: data.session.access_token,
            refresh_token: data.session.refresh_token,
          }
        : null,
    };
  },
  async resolvePendingUser(email) {
    const { data, error } = await ready().rpc('resolve_pending_registration', { p_email: email });
    if (error || (data !== null && typeof data !== 'string')) throw new Error('unavailable');
    return data;
  },
  async confirmUser(userId) {
    const { data, error } = await ready().auth.admin.updateUserById(userId, {
      email_confirm: true,
    });
    return !error && data.user?.id === userId && !!data.user.email_confirmed_at;
  },
};

Deno.serve(createRegistrationHandler({ backend, hmacSecret: secretKey }));
