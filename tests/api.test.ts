import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { registerHooks } from 'node:module';
import { NextRequest } from 'next/server';
import { detectFileType } from '../lib/supabase/upload-validation';

// Next.js resolves this compile-time boundary marker itself. The tests execute
// only server route modules in Node, so the marker is an empty test-only module.
const marker = registerHooks({
  resolve(specifier, context, next) {
    if (specifier === 'server-only')
      return {
        url: new URL('./helpers/server-only.cjs', import.meta.url).href,
        format: 'commonjs',
        shortCircuit: true,
      };
    if (specifier === 'next/headers')
      return {
        url: new URL('./helpers/route-cookies.cjs', import.meta.url).href,
        format: 'commonjs',
        shortCircuit: true,
      };
    return next(specifier, context);
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

type Cookie = { name: string; value: string };
const routeGlobals = globalThis as typeof globalThis & {
  __horionRouteCookieJar?: Cookie[];
};
const memberId = 'a1111111-1111-4111-8111-111111111111';
const authenticatedUser = {
  id: memberId,
  aud: 'authenticated',
  role: 'authenticated',
  email: 'private-login@example.test',
  created_at: '2026-11-07T00:00:00Z',
  app_metadata: { provider: 'email', providers: ['email'] },
  user_metadata: {},
};
const storeProfile = {
  id: memberId,
  username: 'horion_store',
  display_name: 'A watch store',
  locale: 'pt-BR',
  account_type: 'store',
  website: 'https://shop.example.test',
  contact_email: 'public-contact@example.test',
};

async function withBackend(
  authenticated: boolean,
  action: (
    calls: { path: string; body: Record<string, unknown> | null; headers: Headers }[]
  ) => Promise<void>,
  options: { registrationStatus?: number; registrationPayload?: unknown; loginError?: string } = {}
) {
  const previous = {
    fetch: globalThis.fetch,
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    key: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    signup: process.env.HORION_ALLOW_SHARED_SIGNUP,
    cookies: routeGlobals.__horionRouteCookieJar,
  };
  const expires = Math.floor(Date.now() / 1000) + 3600;
  const token = [
    { alg: 'HS256', typ: 'JWT' },
    { sub: memberId, exp: expires, aud: 'authenticated', role: 'authenticated' },
  ]
    .map((part) => Buffer.from(JSON.stringify(part)).toString('base64url'))
    .concat('test-signature')
    .join('.');
  const session = {
    access_token: token,
    refresh_token: 'test-refresh-token',
    expires_at: expires,
    expires_in: 3600,
    token_type: 'bearer',
    user: authenticatedUser,
  };
  const calls: { path: string; body: Record<string, unknown> | null; headers: Headers }[] = [];
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://horion-test.supabase.co';
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_test_only';
  process.env.HORION_ALLOW_SHARED_SIGNUP = 'true';
  routeGlobals.__horionRouteCookieJar = authenticated
    ? [
        {
          name: 'horion-auth',
          value: 'base64-' + Buffer.from(JSON.stringify(session)).toString('base64url'),
        },
      ]
    : [];
  globalThis.fetch = async (input, init) => {
    const outbound = new Request(input, init);
    const path = new URL(outbound.url).pathname;
    const text = await outbound.text();
    calls.push({ path, body: text ? JSON.parse(text) : null, headers: outbound.headers });
    const data =
      path === '/auth/v1/token'
        ? options.loginError
          ? { error_code: options.loginError, msg: 'Unable to sign in.' }
          : session
        : path === '/auth/v1/user'
          ? authenticatedUser
          : path === '/rest/v1/rpc/onboard_member'
            ? [storeProfile]
            : path === '/rest/v1/profiles'
              ? storeProfile
              : path === '/functions/v1/horion-register'
                ? options.registrationPayload === undefined
                  ? { access_token: token, refresh_token: session.refresh_token }
                  : options.registrationPayload
                : undefined;
    assert.notEqual(data, undefined, `Unexpected test backend path: ${path}`);
    return new Response(JSON.stringify(data), {
      status:
        path === '/functions/v1/horion-register'
          ? options.registrationStatus || 200
          : path === '/auth/v1/token' && options.loginError
            ? 400
            : 200,
      headers: { 'content-type': 'application/json' },
    });
  };
  try {
    await action(calls);
  } finally {
    globalThis.fetch = previous.fetch;
    routeGlobals.__horionRouteCookieJar = previous.cookies;
    for (const [key, value] of Object.entries({
      NEXT_PUBLIC_SUPABASE_URL: previous.url,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: previous.key,
      HORION_ALLOW_SHARED_SIGNUP: previous.signup,
    })) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test('unconfigured authentication reports unavailable accounts without inventing a session', async () => {
  const response = await auth.GET();
  assert.equal(response.status, 200);
  const status = await response.json();
  assert.equal(status.configured, false);
  assert.equal(status.user, null);
  assert.equal(status.member, null);
  assert.equal(status.signupEnabled, false);
  assert.equal(status.sharedAuth, true);
  assert.match(status.notice, /shares.*Rango/i);
  assert.doesNotMatch(status.notice, /preview|demonstration|local records/i);
  const signup = await auth.POST(
    request('/api/auth', {
      action: 'signup',
      email: 'collector@example.test',
      password: 'Safe-test-password-1',
      displayName: 'Test account',
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
    { username: 'collector', displayName: 'A Collector', locale: 'en', accountType: 'moderator' },
    {
      username: 'collector',
      displayName: 'A Collector',
      locale: 'en',
      website: 'javascript:alert(1)',
    },
    {
      username: 'collector',
      displayName: 'A Collector',
      locale: 'en',
      website: 'https://user:password@example.test',
    },
    { username: 'collector', displayName: 'A Collector', locale: 'en', contact: 'not-an-email' },
  ]) {
    const invalid = await onboarding.POST(request('/api/onboarding', body));
    assert.equal(invalid.status, 400);
  }
});

test('store onboarding verifies the user and sends all six owner-scoped RPC arguments', async () => {
  await withBackend(true, async (calls) => {
    const response = await onboarding.POST(
      request('/api/onboarding', {
        username: 'horion_store',
        displayName: ' A watch store ',
        locale: 'pt-BR',
        accountType: 'store',
        website: ' https://shop.example.test ',
        contact: ' Public-Contact@Example.test ',
      })
    );
    assert.equal(response.status, 201);
    const body = await response.json();
    assert.equal(body.member.accountType, 'store');
    assert.equal(body.member.website, 'https://shop.example.test');
    assert.equal(body.member.contact, 'public-contact@example.test');
    assert.deepEqual(
      calls.map((call) => call.path),
      ['/auth/v1/user', '/rest/v1/rpc/onboard_member']
    );
    assert.deepEqual(calls[1].body, {
      p_username: 'horion_store',
      p_display_name: 'A watch store',
      p_locale: 'pt-BR',
      p_account_type: 'store',
      p_website: 'https://shop.example.test',
      p_contact_email: 'Public-Contact@Example.test',
    });
    assert.equal(calls[1].headers.get('content-profile'), 'horion');
    assert.match(calls[1].headers.get('authorization') || '', /^Bearer /);
    assert.equal('p_user_id' in calls[1].body!, false);
  });
});

test('member onboarding defaults to member with no public contact and rejects unauthenticated writes', async () => {
  await withBackend(true, async (calls) => {
    const response = await onboarding.POST(
      request('/api/onboarding', {
        username: 'collector',
        displayName: 'A Collector',
        locale: 'en',
      })
    );
    assert.equal(response.status, 201);
    const rpc = calls.find((call) => call.path === '/rest/v1/rpc/onboard_member');
    assert.equal(rpc?.body?.p_account_type, 'member');
    assert.equal(rpc?.body?.p_contact_email, null, 'Auth email must never become public contact');
    assert.equal(rpc?.body?.p_website, null);
  });
  await withBackend(false, async (calls) => {
    const response = await onboarding.POST(
      request('/api/onboarding', {
        username: 'collector',
        displayName: 'A Collector',
        locale: 'en',
      })
    );
    assert.equal(response.status, 401);
    assert.deepEqual(calls, []);
  });
});

test('authenticated account status returns stored profile category and optional public contact', async () => {
  await withBackend(true, async (calls) => {
    const response = await auth.GET();
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.user.email, 'private-login@example.test');
    assert.deepEqual(body.member, {
      id: memberId,
      username: 'horion_store',
      displayName: 'A watch store',
      locale: 'pt-BR',
      accountType: 'store',
      website: 'https://shop.example.test',
      contact: 'public-contact@example.test',
    });
    assert.equal(calls[1].headers.get('accept-profile'), 'horion');
    assert.match(response.headers.get('cache-control') || '', /no-store/);
  });
});

test('enabled signup establishes a verified Horion session without an email step and leaves onboarding explicit', async () => {
  await withBackend(false, async (calls) => {
    const response = await auth.POST(
      request('/api/auth', {
        action: 'signup',
        email: 'collector@example.test',
        password: 'Safe-test-password-1',
        displayName: 'A Collector',
        locale: 'pt-BR',
      })
    );
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.emailConfirmationRequired, false);
    assert.equal(body.userId, memberId);
    assert.ok(
      routeGlobals.__horionRouteCookieJar?.some((cookie) => cookie.name.startsWith('horion-auth')),
      'session cookies must be established'
    );
    assert.equal(body.horionMembershipCreated, false);
    assert.equal(calls[0].path, '/functions/v1/horion-register');
    assert.equal(calls[0].headers.get('Origin'), 'http://localhost:3000');
    assert.deepEqual(calls[0].body, {
      email: 'collector@example.test',
      password: 'Safe-test-password-1',
      displayName: 'A Collector',
      locale: 'pt-BR',
    });
    assert.ok(calls.slice(1).every((call) => call.path === '/auth/v1/user'));
    assert.ok(
      calls.some((call) => call.path === '/auth/v1/user'),
      'server must verify user after establishing a session'
    );
    assert.doesNotMatch(
      JSON.stringify(calls[0].body),
      /user_metadata|role|street|address|email_confirm|redirect/
    );
  });
});

test('server pending-account login invokes only password-verifying repair and establishes cookies', async () => {
  await withBackend(
    false,
    async (calls) => {
      const response = await auth.POST(
        request('/api/auth', {
          action: 'login',
          email: 'collector@example.test',
          password: 'legacy',
        })
      );
      assert.equal(response.status, 200);
      assert.equal((await response.json()).userId, memberId);
      assert.deepEqual(
        calls.slice(0, 2).map((call) => call.path),
        ['/auth/v1/token', '/functions/v1/horion-register']
      );
      assert.deepEqual(calls[1].body, {
        intent: 'login',
        email: 'collector@example.test',
        password: 'legacy',
      });
      assert.equal(calls[1].headers.get('Origin'), 'http://localhost:3000');
      assert.ok(
        routeGlobals.__horionRouteCookieJar?.some((cookie) => cookie.name.startsWith('horion-auth'))
      );
    },
    { loginError: 'email_not_confirmed' }
  );
});

test('server wrong-password login cannot call registration or confirmation repair', async () => {
  await withBackend(
    false,
    async (calls) => {
      const response = await auth.POST(
        request('/api/auth', {
          action: 'login',
          email: 'collector@example.test',
          password: 'incorrect-password',
        })
      );
      assert.equal(response.status, 401);
      assert.deepEqual(
        calls.map((call) => call.path),
        ['/auth/v1/token']
      );
      assert.equal(routeGlobals.__horionRouteCookieJar?.length, 0);
    },
    { loginError: 'invalid_credentials' }
  );
});

test('server signup rejects malformed backend sessions without creating a success or leaking tokens', async () => {
  await withBackend(
    false,
    async (calls) => {
      const response = await auth.POST(
        request('/api/auth', {
          action: 'signup',
          email: 'collector@example.test',
          password: 'Safe-test-password-1',
          displayName: 'Collector',
        })
      );
      assert.equal(response.status, 400);
      assert.equal((await response.json()).ok, undefined);
      assert.deepEqual(
        calls.map((call) => call.path),
        ['/functions/v1/horion-register']
      );
      assert.equal(routeGlobals.__horionRouteCookieJar?.length, 0);
    },
    { registrationPayload: {} }
  );
});

test('server signup preserves throttling feedback without requesting an email or session', async () => {
  await withBackend(
    false,
    async (calls) => {
      const response = await auth.POST(
        request('/api/auth', {
          action: 'signup',
          email: 'collector@example.test',
          password: 'Safe-test-password-1',
          displayName: 'Collector',
        })
      );
      assert.equal(response.status, 429);
      assert.match((await response.json()).error, /Too many attempts/);
      assert.deepEqual(
        calls.map((call) => call.path),
        ['/functions/v1/horion-register']
      );
      assert.equal(routeGlobals.__horionRouteCookieJar?.length, 0);
    },
    {
      registrationStatus: 429,
      registrationPayload: { error: 'Wait before trying again.', code: 'rate_limited' },
    }
  );
});

test('strict input validation rejects role injection, weak signup passwords and malformed JSON', async () => {
  const role = await auth.POST(
    request('/api/auth', {
      action: 'signup',
      email: 'collector@example.test',
      password: 'Safe-test-password-1',
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
