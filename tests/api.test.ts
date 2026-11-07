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
};
let auth: typeof import('../app/api/auth/route');
let club: typeof import('../app/api/club/route');
let callback: typeof import('../app/auth/callback/route');
let documents: typeof import('../app/api/passport-documents/route');
let media: typeof import('../app/api/post-media/route');
before(async () => {
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000';
  [auth, club, callback, documents, media] = await Promise.all([
    import('../app/api/auth/route'),
    import('../app/api/club/route'),
    import('../app/auth/callback/route'),
    import('../app/api/passport-documents/route'),
    import('../app/api/post-media/route'),
  ]);
});
after(() => {
  marker.deregister();
  for (const [key, value] of Object.entries({
    NEXT_PUBLIC_SUPABASE_URL: original.url,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: original.key,
    NEXT_PUBLIC_APP_URL: original.app,
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
  assert.deepEqual(await response.json(), { configured: false, user: null });
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

test('mutating auth and community requests reject cross-origin and absent origins', async () => {
  for (const handler of [auth.POST, club.POST, documents.POST, media.POST]) {
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
