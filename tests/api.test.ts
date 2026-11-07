import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { registerHooks } from 'node:module';
import { NextRequest } from 'next/server';
import { detectFileType } from '../lib/supabase/upload-validation';

// Next.js resolves this compile-time boundary marker itself. The tests execute
// only server route modules in Node, so the marker is an empty test-only module.
const marker = registerHooks({
  resolve(specifier, context, next) {
    return specifier === 'server-only'
      ? {
          url: new URL('./helpers/server-only.cjs', import.meta.url).href,
          format: 'commonjs',
          shortCircuit: true,
        }
      : next(specifier, context);
  },
});
const original = {
  url: process.env.NEXT_PUBLIC_SUPABASE_URL,
  key: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  app: process.env.NEXT_PUBLIC_APP_URL,
  signup: process.env.HORION_ALLOW_SHARED_SIGNUP,
};
let auth: typeof import('../app/api/auth/route');
let club: typeof import('../app/api/club/route');
let callback: typeof import('../app/auth/callback/route');
let documents: typeof import('../app/api/passport-documents/route');
let media: typeof import('../app/api/post-media/route');
let onboarding: typeof import('../app/api/onboarding/route');
before(async () => {
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000';
  delete process.env.HORION_ALLOW_SHARED_SIGNUP;
  [auth, club, callback, documents, media, onboarding] = await Promise.all([
    import('../app/api/auth/route'),
    import('../app/api/club/route'),
    import('../app/auth/callback/route'),
    import('../app/api/passport-documents/route'),
    import('../app/api/post-media/route'),
    import('../app/api/onboarding/route'),
  ]);
});
after(() => {
  marker.deregister();
  for (const [key, value] of Object.entries({
    NEXT_PUBLIC_SUPABASE_URL: original.url,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: original.key,
    NEXT_PUBLIC_APP_URL: original.app,
    HORION_ALLOW_SHARED_SIGNUP: original.signup,
  })) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});
const request = (path: string, body: unknown, origin = 'http://localhost:3000') =>
  new NextRequest(`http://localhost:3000${path}`, {
    method: 'POST',
    headers: { origin, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

test('unconfigured authentication discloses demo mode without creating an account', async () => {
  const response = await auth.GET();
  assert.equal(response.status, 200);
  const status = await response.json();
  assert.equal(status.configured, false);
  assert.equal(status.user, null);
  assert.equal(status.member, null);
  assert.equal(status.signupEnabled, false);
  assert.equal(status.sharedAuth, true);
  assert.match(status.notice, /shares.*Rango/i);
  const signup = await auth.POST(
    request('/api/auth', {
      action: 'signup',
      email: 'collector@example.test',
      password: 'Safe-demo-password-1',
      displayName: 'Demo',
    })
  );
  assert.equal(signup.status, 503);
  assert.match((await signup.json()).error, /not configured/i);
  assert.match(signup.headers.get('cache-control') || '', /no-store/);
});

test('unconfigured durable resources and document/media downloads fail explicitly', async () => {
  for (const [handler, path] of [
    [club.GET, '/api/club'],
    [documents.GET, '/api/passport-documents?id=invalid'],
    [media.GET, '/api/post-media?id=invalid'],
  ] as const) {
    const response = await handler(new NextRequest(`http://localhost:3000${path}`));
    assert.equal(response.status, 503, path);
  }
});

test('mutating auth, membership and community requests reject cross-origin and absent origins', async () => {
  for (const handler of [auth.POST, onboarding.POST, club.POST, documents.POST, media.POST]) {
    const bad = await handler(
      request('/api/auth', { action: 'logout' }, 'https://attacker.example')
    );
    assert.equal(bad.status, 403);
    const absent = await handler(
      new NextRequest('http://localhost:3000/api/auth', { method: 'POST', body: '{}' })
    );
    assert.equal(absent.status, 403);
  }
});

test('shared-project signup is disabled before invoking any Auth client operation', async () => {
  const previousFetch = globalThis.fetch;
  let fetchCalls = 0;
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://bkjjzujujedqbsrppvpt.supabase.co';
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_test_only';
  process.env.HORION_ALLOW_SHARED_SIGNUP = 'false';
  globalThis.fetch = async () => {
    fetchCalls++;
    throw new Error('Network is forbidden in this test');
  };
  try {
    const response = await auth.POST(
      request('/api/auth', {
        action: 'signup',
        email: 'collector@example.test',
        password: 'Long-enough-test-password',
      })
    );
    assert.equal(response.status, 403);
    assert.equal((await response.json()).signupEnabled, false);
    assert.equal(fetchCalls, 0, 'disabled signup must never reach Auth');
  } finally {
    globalThis.fetch = previousFetch;
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    delete process.env.HORION_ALLOW_SHARED_SIGNUP;
  }
});

test('existing short passwords reach login configuration checks while signup remains strict', async () => {
  const login = await auth.POST(
    request('/api/auth', { action: 'login', email: 'collector@example.test', password: 'legacy' })
  );
  assert.equal(
    login.status,
    503,
    'existing passwords must not be rejected by the signup length rule'
  );
  const signup = await auth.POST(
    request('/api/auth', { action: 'signup', email: 'collector@example.test', password: 'legacy' })
  );
  assert.equal(signup.status, 400);
});

test('explicit membership validates its own fields and never creates an account without configuration', async () => {
  const valid = await onboarding.POST(
    request('/api/onboarding', {
      username: 'collector',
      displayName: 'A Collector',
      locale: 'pt-BR',
    })
  );
  assert.equal(valid.status, 503);
  for (const body of [
    { username: 'collector', displayName: 'A Collector', locale: 'en', user_id: 'forged' },
    { username: '../admin', displayName: 'A Collector', locale: 'en' },
    { username: 'collector', displayName: 'A Collector', locale: 'unsupported' },
  ]) {
    const invalid = await onboarding.POST(request('/api/onboarding', body));
    assert.equal(invalid.status, 400);
  }
});

test('strict input validation rejects role injection, weak signup passwords and malformed JSON', async () => {
  const role = await auth.POST(
    request('/api/auth', {
      action: 'signup',
      email: 'collector@example.test',
      password: 'Safe-demo-password-1',
      role: 'admin',
    })
  );
  assert.equal(role.status, 400);
  const weak = await auth.POST(
    request('/api/auth', { action: 'signup', email: 'collector@example.test', password: 'short' })
  );
  assert.equal(weak.status, 400);
  const malformed = await club.POST(
    new NextRequest('http://localhost:3000/api/club', {
      method: 'POST',
      headers: { origin: 'http://localhost:3000' },
      body: '{broken',
    })
  );
  assert.equal(malformed.status, 400);
  const forged = await club.POST(
    request('/api/club', {
      action: 'event',
      passport_id: 'aaaaaaaa-1111-4111-8111-111111111111',
      event_type: 'service',
      occurred_on: '2026-11-01',
      description: 'Service event',
      verification: 'partner-verified',
    })
  );
  assert.equal(forged.status, 400);
});

test('JSON body size is bounded before parsing or persistence', async () => {
  const response = await club.POST(
    request('/api/club', { action: 'post', body: 'x'.repeat(40000) })
  );
  assert.equal(response.status, 413);
});

test('auth callback restricts redirects to supported locale roots', async () => {
  const response = await callback.GET(
    new NextRequest('http://localhost:3000/auth/callback?next=https://attacker.example')
  );
  assert.equal(response.status, 307);
  assert.equal(response.headers.get('location'), 'http://localhost:3000/en?auth=failed');
});

test('upload signatures reject HTML and SVG, identify bounded supported binary headers', () => {
  const encode = (value: string) => new TextEncoder().encode(value);
  assert.equal(detectFileType(encode('<html>fake image</html>')), null);
  assert.equal(detectFileType(encode('<svg xmlns="http://www.w3.org/2000/svg"></svg>')), null);
  assert.equal(detectFileType(new Uint8Array()), null);
  assert.equal(detectFileType(new Uint8Array([137, 80, 78, 71])), null);
  assert.equal(detectFileType(new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])), 'image/png');
  assert.equal(detectFileType(new Uint8Array([255, 216, 255, 224])), 'image/jpeg');
  assert.equal(detectFileType(encode('%PDF-1.7')), 'application/pdf');
  assert.equal(detectFileType(encode('RIFFxxxxWEBP')), 'image/webp');
});
