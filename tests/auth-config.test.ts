import test from 'node:test';
import assert from 'node:assert/strict';
import { createServerClient } from '@supabase/ssr';
import {
  getHorionClientOptions,
  getSupabaseConfig,
  isHorionAuthCookie,
  sharedSignupEnabled,
} from '../lib/supabase/config';

test('shared signup requires an exact server opt-in and defaults to disabled', () => {
  const original = process.env.HORION_ALLOW_SHARED_SIGNUP;
  try {
    for (const value of [undefined, '', 'false', 'TRUE', '1']) {
      if (value === undefined) delete process.env.HORION_ALLOW_SHARED_SIGNUP;
      else process.env.HORION_ALLOW_SHARED_SIGNUP = value;
      assert.equal(sharedSignupEnabled(), false);
    }
    process.env.HORION_ALLOW_SHARED_SIGNUP = 'true';
    assert.equal(sharedSignupEnabled(), true);
  } finally {
    if (original === undefined) delete process.env.HORION_ALLOW_SHARED_SIGNUP;
    else process.env.HORION_ALLOW_SHARED_SIGNUP = original;
  }
});

test('Supabase configuration rejects unsafe protocols and permits HTTPS or local development', () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  try {
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_test_only';
    for (const value of [
      '',
      'invalid',
      'javascript:alert(1)',
      'http://remote.example',
      'https://user:password@example.test',
      'https://example.test/?secret=1',
    ]) {
      process.env.NEXT_PUBLIC_SUPABASE_URL = value;
      assert.equal(getSupabaseConfig(), null, value);
    }
    for (const value of [
      'https://bkjjzujujedqbsrppvpt.supabase.co',
      'http://127.0.0.1:54321',
      'http://localhost:54321',
    ]) {
      process.env.NEXT_PUBLIC_SUPABASE_URL = value;
      assert.equal(getSupabaseConfig()?.url, value);
    }
  } finally {
    if (url === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = url;
    if (key === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    else process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = key;
  }
});

test('Horion cookie filtering accepts its chunks and verifier but excludes Rango cookies', () => {
  for (const name of ['horion-auth', 'horion-auth.0', 'horion-auth.1', 'horion-auth-code-verifier'])
    assert.equal(isHorionAuthCookie(name), true);
  for (const name of [
    'sb-bkjjzujujedqbsrppvpt-auth-token',
    'rango-auth',
    'horion-locale',
    'horion-authentication',
  ])
    assert.equal(isHorionAuthCookie(name), false);
});

test('Horion client ignores the shared project default session and sends its own schema', async () => {
  const calls: { path: string; schema: string | null }[] = [];
  const changedCookies: string[] = [];
  const sharedCookie = {
    name: 'sb-bkjjzujujedqbsrppvpt-auth-token',
    value: 'a-rango-session-that-horion-must-never-consume',
  };
  const client = createServerClient(
    'https://bkjjzujujedqbsrppvpt.supabase.co',
    'sb_publishable_test_only',
    {
      ...getHorionClientOptions(),
      cookies: {
        getAll: () => [sharedCookie],
        setAll: (cookies) => {
          changedCookies.push(...cookies.map((cookie) => cookie.name));
        },
      },
      global: {
        fetch: async (input, init) => {
          const request = new Request(input, init);
          calls.push({
            path: new URL(request.url).pathname,
            schema: request.headers.get('accept-profile'),
          });
          return new Response('[]', {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        },
      },
    }
  );
  const { data } = await client.auth.getSession();
  assert.equal(data.session, null);
  assert.equal(calls.length, 0, 'Rango cookie must not cause an Auth lookup or refresh');
  await client.from('profiles').select('id');
  assert.deepEqual(calls, [{ path: '/rest/v1/profiles', schema: 'horion' }]);
  assert.deepEqual(changedCookies, []);
  assert.equal(sharedCookie.value, 'a-rango-session-that-horion-must-never-consume');
});
