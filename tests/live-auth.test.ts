import test from 'node:test';
import assert from 'node:assert/strict';
import {
  confirmLiveEmail,
  loginLiveAccount,
  RegistrationError,
  signoutLiveAccount,
  signupLiveAccount,
} from '../lib/live/auth';
import type { LiveClient } from '../lib/live/types';

const user = { id: 'confirmed-user' };
const tokenResponse = {
  access_token: 'test-access-token-for-an-authenticated-session',
  refresh_token: 'test-refresh-token-for-the-session',
};
function authClient(
  options: {
    session?: object | null;
    fail?: boolean;
    loginError?: string;
    registrationResponse?: unknown;
    registrationStatus?: number;
    sessionError?: boolean;
    userError?: boolean;
    verifiedUserId?: string;
  } = {}
) {
  const calls: { method: string; input: unknown }[] = [];
  const result = {
    data: { session: options.session === undefined ? { user } : options.session },
    error: options.fail ? { message: 'Internal details must not be shown' } : null,
  };
  const client = {
    functions: {
      async invoke(name: string, input: unknown) {
        calls.push({ method: `function:${name}`, input });
        return {
          data:
            options.registrationResponse === undefined
              ? tokenResponse
              : options.registrationResponse,
          error: options.registrationStatus
            ? { context: new Response(null, { status: options.registrationStatus }) }
            : null,
        };
      },
    },
    auth: {
      async signInWithPassword(input: unknown) {
        calls.push({ method: 'login', input });
        return options.loginError
          ? { data: { session: null }, error: { code: options.loginError } }
          : result;
      },
      async setSession(input: unknown) {
        calls.push({ method: 'setSession', input });
        return options.sessionError
          ? { data: { session: null }, error: { message: 'private details' } }
          : result;
      },
      async getUser() {
        calls.push({ method: 'getUser', input: null });
        return {
          data: { user: options.userError ? null : { id: options.verifiedUserId || user.id } },
          error: options.userError ? { message: 'private verification details' } : null,
        };
      },
      async verifyOtp(input: unknown) {
        calls.push({ method: 'verify', input });
        return result;
      },
      async signOut(input: unknown) {
        calls.push({ method: 'logout', input });
        return { error: result.error };
      },
    },
  } as unknown as LiveClient;
  return { client, calls };
}
const registration = {
  email: 'collector@example.test',
  password: 'a-long-password-for-tests',
  displayName: 'Collector',
  locale: 'pt-BR' as const,
};
const signupOptions = { enabled: true, origin: 'https://horion.example' };

test('disabled live signup makes no backend or Auth request', async () => {
  const { client, calls } = authClient();
  await assert.rejects(
    signupLiveAccount(client, registration, { ...signupOptions, enabled: false }),
    /not available/
  );
  assert.equal(calls.length, 0);
});

test('signup uses the Horion backend and verifies the session without an email step', async () => {
  const { client, calls } = authClient();
  assert.deepEqual(await signupLiveAccount(client, registration, signupOptions), {
    userId: user.id,
    emailConfirmationRequired: false,
  });
  assert.deepEqual(
    calls.map((call) => call.method),
    ['function:horion-register', 'setSession', 'getUser']
  );
  assert.deepEqual(calls[0].input, { body: registration });
  assert.deepEqual(calls[1].input, tokenResponse);
  assert.doesNotMatch(
    JSON.stringify(calls[0].input),
    /role|user_metadata|email_confirm|redirect|Origin/
  );
});

test('only server callers forward their validated origin to the registration backend', async () => {
  const { client, calls } = authClient();
  await signupLiveAccount(client, registration, { ...signupOptions, forwardOrigin: true });
  assert.deepEqual(calls[0].input, {
    body: registration,
    headers: { Origin: 'https://horion.example' },
  });
});

test('malformed registration responses never establish a session or report success', async () => {
  for (const response of [
    null,
    {},
    { access_token: 'short', refresh_token: 'short' },
    { ...tokenResponse, privilegedKey: 'must-not-be-accepted' },
  ]) {
    const { client, calls } = authClient({ registrationResponse: response });
    await assert.rejects(
      signupLiveAccount(client, registration, signupOptions),
      (error) => error instanceof RegistrationError && error.code === 'session_failed'
    );
    assert.deepEqual(
      calls.map((call) => call.method),
      ['function:horion-register']
    );
  }
});

test('a missing or failed session is rejected before user verification', async () => {
  for (const options of [{ session: null }, { sessionError: true }]) {
    const { client, calls } = authClient(options);
    await assert.rejects(
      signupLiveAccount(client, registration, signupOptions),
      (error) => error instanceof RegistrationError && error.code === 'session_failed'
    );
    assert.deepEqual(
      calls.map((call) => call.method),
      ['function:horion-register', 'setSession']
    );
  }
});

test('failed or mismatched server user verification clears only the new Horion session', async () => {
  for (const options of [{ userError: true }, { verifiedUserId: 'different-user' }]) {
    const { client, calls } = authClient(options);
    await assert.rejects(
      signupLiveAccount(client, registration, signupOptions),
      (error) =>
        error instanceof RegistrationError &&
        error.code === 'session_failed' &&
        !error.message.includes(tokenResponse.access_token)
    );
    assert.deepEqual(calls.at(-1), { method: 'logout', input: { scope: 'local' } });
  }
});

test('registration throttling is a distinct safe error and never establishes a session', async () => {
  const { client, calls } = authClient({ registrationStatus: 429 });
  await assert.rejects(
    signupLiveAccount(client, registration, signupOptions),
    (error) => error instanceof RegistrationError && error.code === 'rate_limited'
  );
  assert.equal(calls.length, 1);
});

test('existing-account login accepts short legacy passwords but requires a returned session', async () => {
  const valid = authClient();
  assert.deepEqual(await loginLiveAccount(valid.client, 'collector@example.test', 'legacy'), {
    userId: user.id,
  });
  assert.equal(valid.calls[0].method, 'login');
  const invalid = authClient({ session: null });
  await assert.rejects(
    loginLiveAccount(invalid.client, 'collector@example.test', 'legacy'),
    /Unable to sign in/
  );
});

test('only an email-not-confirmed login invokes the password-verifying repair backend', async () => {
  const { client, calls } = authClient({ loginError: 'email_not_confirmed' });
  assert.deepEqual(await loginLiveAccount(client, 'collector@example.test', 'legacy'), {
    userId: user.id,
  });
  assert.deepEqual(
    calls.map((call) => call.method),
    ['login', 'function:horion-register', 'setSession', 'getUser']
  );
  assert.deepEqual(calls[1].input, {
    body: { intent: 'login', email: 'collector@example.test', password: 'legacy' },
  });
  const invalid = authClient({ loginError: 'invalid_credentials' });
  await assert.rejects(
    loginLiveAccount(invalid.client, 'collector@example.test', 'wrong-password'),
    /Unable to sign in/
  );
  assert.deepEqual(
    invalid.calls.map((call) => call.method),
    ['login']
  );
});

test('signing out scopes revocation to the current Horion session', async () => {
  const { client, calls } = authClient();
  await signoutLiveAccount(client);
  assert.deepEqual(calls, [{ method: 'logout', input: { scope: 'local' } }]);
});

test('legacy email links still verify only a configured-project token and require a session', async () => {
  const { client, calls } = authClient();
  const token = 'a'.repeat(64);
  const project = 'https://selected.supabase.co';
  await confirmLiveEmail(client, `${project}/auth/v1/verify?token=${token}&type=signup`, project);
  assert.deepEqual(calls, [{ method: 'verify', input: { token_hash: token, type: 'email' } }]);
  await assert.rejects(
    confirmLiveEmail(
      client,
      `https://attacker.example/auth/v1/verify?token=${token}&type=signup`,
      project
    )
  );
  assert.equal(calls.length, 1);
  const expired = authClient({ fail: true });
  await assert.rejects(
    confirmLiveEmail(
      expired.client,
      `${project}/auth/v1/verify?token=${token}&type=signup`,
      project
    ),
    /could not be verified/
  );
});
