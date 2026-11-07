import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createRegistrationHandler,
  hashRegistrationIdentifier,
  HORION_REGISTRATION_ORIGIN,
  type AuthAttempt,
  type RegistrationBackend,
} from '../supabase/functions/horion-register/handler';

const SECRET = 'unit-test-hmac-key-never-a-runtime-credential';
const USER = 'aaa11111-1111-4111-8111-111111111111';
const TOKENS = { access_token: 'synthetic-access-token', refresh_token: 'synthetic-refresh-token' };
const INPUT = {
  email: 'Collector@Example.test',
  password: 'GoodPassword1234',
  displayName: ' Watch Collector ',
  locale: 'pt-BR',
};
type Call = { name: string; args?: unknown };
type Options = {
  allowed?: boolean;
  limiterThrows?: boolean;
  creation?: { ok: boolean; errorCode?: string | null };
  logins?: AuthAttempt[];
  pending?: string | null;
  confirmed?: boolean;
  confirmationThrows?: boolean;
};
function fixture(options: Options = {}) {
  const calls: Call[] = [];
  const logins = [...(options.logins || [{ tokens: TOKENS }])];
  const backend: RegistrationBackend = {
    async consumeAttempt(ip, email) {
      calls.push({ name: 'limit', args: { ip, email } });
      if (options.limiterThrows) throw new Error('INTERNAL PRIVATE DETAILS');
      return options.allowed !== false;
    },
    async createConfirmedUser(input) {
      calls.push({ name: 'create', args: input });
      return options.creation || { ok: true };
    },
    async signIn(email, password) {
      calls.push({ name: 'login', args: { email, password } });
      return logins.shift() || { errorCode: 'invalid_credentials' };
    },
    async resolvePendingUser(email) {
      calls.push({ name: 'resolve', args: email });
      return options.pending === undefined ? USER : options.pending;
    },
    async confirmUser(userId) {
      calls.push({ name: 'confirm', args: userId });
      if (options.confirmationThrows) throw new Error(`PRIVATE ${SECRET} ${TOKENS.access_token}`);
      return options.confirmed !== false;
    },
  };
  return { calls, handle: createRegistrationHandler({ backend, hmacSecret: SECRET }) };
}
function request(
  body: unknown = INPUT,
  options: { origin?: string; method?: string; raw?: string; type?: string } = {}
) {
  const method = options.method || 'POST';
  return new Request('https://selected.supabase.co/functions/v1/horion-register', {
    method,
    headers: {
      origin: options.origin ?? HORION_REGISTRATION_ORIGIN,
      'content-type': options.type || 'application/json',
      'x-real-ip': '192.0.2.10',
    },
    ...(['GET', 'OPTIONS', 'HEAD'].includes(method)
      ? {}
      : {
          body: options.raw === undefined ? JSON.stringify(body) : options.raw,
        }),
  });
}

test('registration uses a private limiter before creating a confirmed identity and returning only tokens', async () => {
  const { calls, handle } = fixture();
  const response = await handle(request());
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('access-control-allow-origin'), HORION_REGISTRATION_ORIGIN);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await response.json(), TOKENS);
  assert.deepEqual(
    calls.map((call) => call.name),
    ['limit', 'create', 'login']
  );
  const digest = calls[0].args as { ip: string; email: string };
  assert.match(digest.ip, /^[0-9a-f]{64}$/);
  assert.match(digest.email, /^[0-9a-f]{64}$/);
  assert.notEqual(digest.ip, digest.email);
  assert.deepEqual(calls[1].args, {
    email: 'collector@example.test',
    password: INPUT.password,
    email_confirm: true,
    user_metadata: { display_name: 'Watch Collector' },
  });
});

test('CORS accepts only the public Site and explicit local development origins', async () => {
  for (const origin of [
    HORION_REGISTRATION_ORIGIN,
    'http://localhost:3000',
    'http://127.0.0.1:3000',
  ]) {
    const { handle, calls } = fixture();
    const response = await handle(request(null, { origin, method: 'OPTIONS' }));
    assert.equal(response.status, 204);
    assert.equal(response.headers.get('access-control-allow-origin'), origin);
    assert.equal(response.headers.get('access-control-allow-methods'), 'POST, OPTIONS');
    assert.equal(calls.length, 0);
  }
  for (const origin of [
    'https://attacker.example',
    'https://horion-watch-club-preview.victortb12.chatgpt.site.attacker.example',
    'null',
    'http://localhost:4000',
    '',
  ]) {
    const { handle, calls } = fixture();
    assert.equal((await handle(request(INPUT, { origin }))).status, 403);
    assert.equal(calls.length, 0);
  }
});

test('unsupported methods, content types and invalid/oversized bodies never reach Auth or the limiter', async () => {
  const attempts = [
    request(null, { method: 'GET' }),
    request(INPUT, { type: 'text/plain' }),
    request(INPUT, { raw: '{not-json' }),
    request({ ...INPUT, displayName: 'a'.repeat(9000) }),
    request({ ...INPUT, password: 'short' }),
    request({ ...INPUT, password: 'a'.repeat(129) }),
    request({ ...INPUT, email: 'not-an-email' }),
    request({ ...INPUT, user_metadata: { role: 'admin' } }),
    request({ ...INPUT, role: 'service_role' }),
    request({ ...INPUT, displayName: '' }),
    request({ ...INPUT, intent: 'reset-password' }),
  ];
  for (const attempted of attempts) {
    const { calls, handle } = fixture();
    assert.ok([400, 405].includes((await handle(attempted)).status));
    assert.equal(calls.length, 0);
  }
});

test('a reached limiter returns 429 without Auth calls and a failed limiter fails closed', async () => {
  const limited = fixture({ allowed: false });
  const response = await limited.handle(request());
  assert.equal(response.status, 429);
  assert.equal(response.headers.get('retry-after'), '60');
  assert.deepEqual(
    limited.calls.map((call) => call.name),
    ['limit']
  );
  const failed = fixture({ limiterThrows: true });
  const unavailable = await failed.handle(request());
  assert.equal(unavailable.status, 503);
  assert.ok(!(await unavailable.text()).includes('INTERNAL PRIVATE DETAILS'));
  assert.deepEqual(
    failed.calls.map((call) => call.name),
    ['limit']
  );
});

test('duplicate confirmed accounts sign in with the submitted password without confirmation or mutation', async () => {
  const { handle, calls } = fixture({ creation: { ok: false, errorCode: 'email_exists' } });
  const response = await handle(request());
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), TOKENS);
  assert.deepEqual(
    calls.map((call) => call.name),
    ['limit', 'create', 'login']
  );
  assert.deepEqual(calls[2].args, { email: 'collector@example.test', password: INPUT.password });
});

test('wrong credentials, blocked identities and unrelated Auth errors never resolve or confirm an account', async () => {
  for (const errorCode of [
    'invalid_credentials',
    'user_banned',
    'phone_not_confirmed',
    'over_request_rate_limit',
    'unexpected_failure',
  ]) {
    const { handle, calls } = fixture({
      creation: { ok: false, errorCode: 'email_exists' },
      logins: [{ errorCode }],
    });
    const response = await handle(request());
    assert.equal(response.status, 401);
    const body = await response.text();
    assert.ok(!body.includes('collector@example.test'));
    if (errorCode !== 'invalid_credentials') assert.ok(!body.includes(errorCode));
    assert.deepEqual(
      calls.map((call) => call.name),
      ['limit', 'create', 'login']
    );
  }
});

test('pending email confirmation requires password proof, exact pending UUID and successful Auth confirmation', async () => {
  const { handle, calls } = fixture({
    creation: { ok: false, errorCode: 'user_already_exists' },
    logins: [{ errorCode: 'email_not_confirmed' }, { tokens: TOKENS }],
  });
  const response = await handle(request());
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), TOKENS);
  assert.deepEqual(
    calls.map((call) => call.name),
    ['limit', 'create', 'login', 'resolve', 'confirm', 'login']
  );
  assert.equal(calls[3].args, 'collector@example.test');
  assert.equal(calls[4].args, USER);
});

test('missing or invalid pending identities are never confirmed and confirmation errors do not expose credentials', async () => {
  for (const pending of [null, 'not-a-user-uuid']) {
    const { handle, calls } = fixture({
      creation: { ok: false, errorCode: 'email_exists' },
      logins: [{ errorCode: 'email_not_confirmed' }],
      pending,
    });
    assert.equal((await handle(request())).status, 401);
    assert.deepEqual(
      calls.map((call) => call.name),
      ['limit', 'create', 'login', 'resolve']
    );
  }
  const failed = fixture({
    creation: { ok: false, errorCode: 'email_exists' },
    logins: [{ errorCode: 'email_not_confirmed' }],
    confirmationThrows: true,
  });
  const response = await failed.handle(request());
  assert.equal(response.status, 503);
  const body = await response.text();
  for (const secret of [SECRET, TOKENS.access_token, 'PRIVATE', INPUT.password])
    assert.ok(!body.includes(secret));
});

test('a failed second password login after confirmation never returns a fabricated session', async () => {
  const { handle, calls } = fixture({
    creation: { ok: false, errorCode: 'email_exists' },
    logins: [{ errorCode: 'email_not_confirmed' }, { errorCode: 'invalid_credentials' }],
  });
  const response = await handle(request());
  assert.equal(response.status, 401);
  assert.ok(!(await response.text()).includes('access_token'));
  assert.equal(calls.filter((call) => call.name === 'login').length, 2);
});

test('login intent supports existing legacy passwords, never creates identities and rechecks pending-account credentials', async () => {
  const { handle, calls } = fixture({
    logins: [{ errorCode: 'email_not_confirmed' }, { tokens: TOKENS }],
  });
  const response = await handle(
    request({ intent: 'login', email: INPUT.email, password: 'legacy' })
  );
  assert.equal(response.status, 200);
  assert.deepEqual(
    calls.map((call) => call.name),
    ['limit', 'login', 'resolve', 'confirm', 'login']
  );
  const wrong = fixture({ logins: [{ errorCode: 'invalid_credentials' }] });
  assert.equal(
    (await wrong.handle(request({ intent: 'login', email: INPUT.email, password: 'wrong' })))
      .status,
    401
  );
  assert.deepEqual(
    wrong.calls.map((call) => call.name),
    ['limit', 'login']
  );
});

test('keyed limiter digests are deterministic, purpose-separated, and change when the server key rotates', async () => {
  const first = await hashRegistrationIdentifier(SECRET, 'email', 'collector@example.test');
  assert.equal(first, await hashRegistrationIdentifier(SECRET, 'email', 'collector@example.test'));
  assert.notEqual(first, await hashRegistrationIdentifier(SECRET, 'ip', 'collector@example.test'));
  assert.notEqual(
    first,
    await hashRegistrationIdentifier('rotated-test-secret', 'email', 'collector@example.test')
  );
  assert.match(first, /^[0-9a-f]{64}$/);
  await assert.rejects(hashRegistrationIdentifier('', 'email', 'collector@example.test'));
});
