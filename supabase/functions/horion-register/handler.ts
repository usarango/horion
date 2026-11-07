/** Public Horion enrollment. Privileged Auth operations stay behind this handler. */
export const HORION_REGISTRATION_ORIGIN =
  'https://horion-watch-club-preview.victortb12.chatgpt.site';

type Tokens = { access_token: string; refresh_token: string };
export type AuthAttempt = { tokens?: Tokens | null; errorCode?: string | null };
export interface RegistrationBackend {
  consumeAttempt(ipHash: string, emailHash: string): Promise<boolean>;
  createConfirmedUser(input: {
    email: string;
    password: string;
    email_confirm: true;
    user_metadata: { display_name: string };
  }): Promise<{ ok: boolean; errorCode?: string | null }>;
  signIn(email: string, password: string): Promise<AuthAttempt>;
  resolvePendingUser(email: string): Promise<string | null>;
  confirmUser(userId: string): Promise<boolean>;
}
export interface RegistrationDependencies {
  backend: RegistrationBackend;
  hmacSecret: string;
  allowedOrigins?: readonly string[];
}
type RegistrationInput = {
  intent: 'signup' | 'login';
  email: string;
  password: string;
  displayName: string;
};
const MAX_BODY_BYTES = 8192;
const encoder = new TextEncoder();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const duplicateCodes = new Set(['email_exists', 'user_already_exists']);

function parseInput(value: unknown): RegistrationInput {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('input');
  const input = value as Record<string, unknown>;
  if (
    Object.keys(input).some(
      (key) => !['intent', 'email', 'password', 'displayName', 'locale'].includes(key)
    )
  )
    throw new Error('input');
  const intent = input.intent ?? 'signup';
  if (intent !== 'signup' && intent !== 'login') throw new Error('input');
  if (typeof input.email !== 'string' || typeof input.password !== 'string')
    throw new Error('input');
  const email = input.email.trim().toLowerCase();
  const password = input.password;
  if (
    email.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
    password.length < (intent === 'login' ? 1 : 12) ||
    password.length > 128 ||
    (input.locale !== undefined && !['en', 'pt-BR'].includes(String(input.locale))) ||
    (input.displayName !== undefined && typeof input.displayName !== 'string')
  )
    throw new Error('input');
  const displayName = typeof input.displayName === 'string' ? input.displayName.trim() : '';
  if (displayName.length > 80 || (intent === 'signup' && displayName.length < 1))
    throw new Error('input');
  return { intent, email, password, displayName };
}

/** Stream and bound the payload before decoding; never buffer an arbitrary upload. */
async function readInput(request: Request): Promise<RegistrationInput> {
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type') || ''))
    throw new Error('input');
  if (Number(request.headers.get('content-length') || 0) > MAX_BODY_BYTES) throw new Error('input');
  const reader = request.body?.getReader();
  if (!reader) throw new Error('input');
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > MAX_BODY_BYTES) {
        await reader.cancel();
        throw new Error('input');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return parseInput(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)));
}

/** Only keyed, purpose-separated digests are persisted by the private limiter. */
export async function hashRegistrationIdentifier(
  secret: string,
  purpose: 'ip' | 'email',
  value: string
): Promise<string> {
  if (!secret) throw new Error('unavailable');
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const bytes = new Uint8Array(
    await crypto.subtle.sign('HMAC', key, encoder.encode(`horion-register:v1:${purpose}:${value}`))
  );
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** Platform forwarding is only a rate-limit signal; a global DB cap also applies. */
function clientIp(headers: Headers): string {
  const forwarded = headers.get('x-forwarded-for')?.split(',').at(-1)?.trim();
  const candidate =
    headers.get('x-real-ip')?.trim() || headers.get('cf-connecting-ip')?.trim() || forwarded || '';
  return candidate.length <= 128 && /^[0-9a-fA-F.:]+$/.test(candidate)
    ? candidate.toLowerCase()
    : 'unknown';
}

function sessionTokens(result: AuthAttempt): Tokens | null {
  if (
    result.errorCode ||
    !result.tokens ||
    typeof result.tokens.access_token !== 'string' ||
    !result.tokens.access_token ||
    typeof result.tokens.refresh_token !== 'string' ||
    !result.tokens.refresh_token
  )
    return null;
  return { access_token: result.tokens.access_token, refresh_token: result.tokens.refresh_token };
}

export function createRegistrationHandler(dependencies: RegistrationDependencies) {
  const origins = new Set(
    dependencies.allowedOrigins || [
      HORION_REGISTRATION_ORIGIN,
      'http://localhost:3000',
      'http://127.0.0.1:3000',
    ]
  );
  const baseHeaders = {
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers':
      'authorization, apikey, content-type, x-client-info, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
    'Access-Control-Max-Age': '600',
    'Cache-Control': 'no-store',
    Vary: 'Origin',
    'Content-Type': 'application/json; charset=utf-8',
    'X-Content-Type-Options': 'nosniff',
  };
  return async function registration(request: Request): Promise<Response> {
    const origin = request.headers.get('origin') || '';
    const headers = {
      ...baseHeaders,
      'Access-Control-Allow-Origin': origins.has(origin) ? origin : HORION_REGISTRATION_ORIGIN,
    };
    function error(status: number, code: string, message: string, retryAfter = false) {
      return new Response(JSON.stringify({ error: message, code }), {
        status,
        headers: { ...headers, ...(retryAfter ? { 'Retry-After': '60' } : {}) },
      });
    }
    const invalidCredentials = () =>
      error(
        401,
        'invalid_credentials',
        'Unable to complete access. Check your details or sign in to your existing account.'
      );
    // An allowed Origin helps browser isolation; it is never authentication.
    if (!origins.has(origin)) return error(403, 'forbidden_origin', 'This request is not allowed.');
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (request.method !== 'POST')
      return error(405, 'invalid_request', 'This request is not allowed.');
    let input: RegistrationInput;
    try {
      input = await readInput(request);
    } catch {
      return error(400, 'invalid_request', 'Review your account details.');
    }
    const { backend } = dependencies;
    try {
      const [ipHash, emailHash] = await Promise.all([
        hashRegistrationIdentifier(dependencies.hmacSecret, 'ip', clientIp(request.headers)),
        hashRegistrationIdentifier(dependencies.hmacSecret, 'email', input.email),
      ]);
      if (!(await backend.consumeAttempt(ipHash, emailHash)))
        return error(429, 'rate_limited', 'Please wait before trying again.', true);

      if (input.intent === 'signup') {
        const creation = await backend.createConfirmedUser({
          email: input.email,
          password: input.password,
          email_confirm: true,
          user_metadata: { display_name: input.displayName },
        });
        if (!creation.ok && !duplicateCodes.has(creation.errorCode || ''))
          return invalidCredentials();
      }
      let login = await backend.signIn(input.email, input.password);
      let tokens = sessionTokens(login);
      if (tokens) return new Response(JSON.stringify(tokens), { status: 200, headers });

      // GoTrue v2.197.0 emits this code only AFTER checking the password.
      // Wrong credentials, banned users or any other failure never reach admin confirmation.
      if (login.errorCode !== 'email_not_confirmed') return invalidCredentials();
      const pendingUserId = await backend.resolvePendingUser(input.email);
      if (!pendingUserId || !UUID.test(pendingUserId)) return invalidCredentials();
      if (!(await backend.confirmUser(pendingUserId))) return invalidCredentials();
      login = await backend.signIn(input.email, input.password);
      tokens = sessionTokens(login);
      if (!tokens) return invalidCredentials();
      return new Response(JSON.stringify(tokens), { status: 200, headers });
    } catch {
      // Never echo SDK exceptions, user details, tokens or privileged credentials.
      return error(
        503,
        'unavailable',
        'Account access is temporarily unavailable. Please try again.'
      );
    }
  };
}
