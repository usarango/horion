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
  refresh_token: 'ab12cd34ef56',
};
function authClient(
  options: {
    session?: object | null;
    fail?: boolean;
    loginError?: string;
    loginErrorName?: string;
    loginStatus?: number;
    loginThrows?: Error;
    registrationResponse?: unknown;
    registrationStatus?: number;
    registrationCode?: unknown;
    registrationErrorName?: string;
    registrationThrows?: Error;
    sessionError?: boolean;
    sessionThrows?: Error;
    userError?: boolean;
    userThrows?: Error;
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
        if (options.registrationThrows) throw options.registrationThrows;
        return {
          data:
            options.registrationResponse === undefined
              ? tokenResponse
              : options.registrationResponse,
          error: options.registrationStatus
            ? {
                context: new Response(
                  JSON.stringify({
                    code: options.registrationCode,
                    error: 'PRIVATE PROVIDER DETAILS',
                  }),
                  {
                    status: options.registrationStatus,
                  }
                ),
              }
            : options.registrationErrorName
              ? { name: options.registrationErrorName, message: 'PRIVATE PROVIDER DETAILS' }
              : null,
        };
      },
    },
    auth: {
      async signInWithPassword(input: unknown) {
        calls.push({ method: 'login', input });
        if (options.loginThrows) throw options.loginThrows;
        return options.loginError || options.loginErrorName || options.loginStatus
          ? {
              data: { session: null },
              error: {
                code: options.loginError,
                name: options.loginErrorName,
                status: options.loginStatus,
                message: 'PRIVATE PROVIDER DETAILS',
              },
            }
          : result;
      },
      async setSession(input: unknown) {
        calls.push({ method: 'setSession', input });
        if (options.sessionThrows) throw options.sessionThrows;
        return options.sessionError
          ? { data: { session: null }, error: { message: 'private details' } }
          : result;
      },
      async getUser() {
        calls.push({ method: 'getUser', input: null });
        if (options.userThrows) throw options.userThrows;
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
    { ...tokenResponse, refresh_token: '' },
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

test('registration separates credential, form, gateway and unavailable-service failures without exposing provider messages', async () => {
  const cases = [
    [401, 'invalid_credentials', 'invalid_credentials'],
    [401, undefined, 'service_unavailable'],
    [401, 'unexpected_gateway_code', 'service_unavailable'],
    [400, 'invalid_request', 'invalid_input'],
    [400, 'invalid_input', 'invalid_input'],
    [400, 'unexpected_gateway_code', 'registration_failed'],
    [403, 'forbidden_origin', 'service_unavailable'],
    [429, 'invalid_credentials', 'rate_limited'],
    [500, 'invalid_credentials', 'service_unavailable'],
    [503, 'unavailable', 'service_unavailable'],
  ] as const;
  for (const [registrationStatus, registrationCode, expected] of cases) {
    const { client, calls } = authClient({ registrationStatus, registrationCode });
    await assert.rejects(
      signupLiveAccount(client, registration, signupOptions),
      (error) =>
        error instanceof RegistrationError &&
        error.code === expected &&
        !error.message.includes('PRIVATE PROVIDER DETAILS')
    );
    assert.deepEqual(
      calls.map((call) => call.method),
      ['function:horion-register']
    );
  }
});

test('function fetch, relay and thrown network errors do not blame the account credentials', async () => {
  for (const [registrationErrorName, expected] of [
    ['FunctionsFetchError', 'network_failed'],
    ['FunctionsRelayError', 'service_unavailable'],
  ] as const) {
    const { client } = authClient({ registrationErrorName });
    await assert.rejects(
      signupLiveAccount(client, registration, signupOptions),
      (error) =>
        error instanceof RegistrationError &&
        error.code === expected &&
        !error.message.includes('PRIVATE')
    );
  }
  const { client } = authClient({ registrationThrows: new TypeError('PRIVATE FETCH DETAILS') });
  await assert.rejects(
    signupLiveAccount(client, registration, signupOptions),
    (error) =>
      error instanceof RegistrationError &&
      error.code === 'network_failed' &&
      !error.message.includes('PRIVATE')
  );
});

test('invalid form input is reported before any Auth or registration call', async () => {
  const { client, calls } = authClient();
  const invalid = (error: unknown) =>
    error instanceof RegistrationError && error.code === 'invalid_input';
  await assert.rejects(
    signupLiveAccount(client, { ...registration, email: 'invalid' }, signupOptions),
    invalid
  );
  await assert.rejects(loginLiveAccount(client, 'invalid', 'password'), invalid);
  assert.deepEqual(calls, []);
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
    (error) => error instanceof RegistrationError && error.code === 'session_failed'
  );
});

test('normal sign-in reports credentials, rate limits and upstream/network errors separately', async () => {
  const cases = [
    [{ loginError: 'invalid_credentials', loginStatus: 400 }, 'invalid_credentials'],
    [{ loginError: 'over_request_rate_limit', loginStatus: 429 }, 'rate_limited'],
    [{ loginError: 'unexpected_failure', loginStatus: 500 }, 'service_unavailable'],
    [{ loginErrorName: 'AuthRetryableFetchError', loginStatus: 503 }, 'service_unavailable'],
    [{ loginErrorName: 'AuthRetryableFetchError' }, 'network_failed'],
    [{ loginThrows: new TypeError('PRIVATE FETCH DETAILS') }, 'network_failed'],
  ] as const;
  for (const [options, expected] of cases) {
    const { client, calls } = authClient(options);
    await assert.rejects(
      loginLiveAccount(client, 'collector@example.test', 'legacy'),
      (error) =>
        error instanceof RegistrationError &&
        error.code === expected &&
        !error.message.includes('PRIVATE')
    );
    assert.deepEqual(
      calls.map((call) => call.method),
      ['login']
    );
  }
});

test('network failures during session establishment remain distinct and verification failures revoke only Horion', async () => {
  const initial = authClient({ sessionThrows: new TypeError('PRIVATE SESSION DETAILS') });
  await assert.rejects(
    signupLiveAccount(initial.client, registration, signupOptions),
    (error) =>
      error instanceof RegistrationError &&
      error.code === 'network_failed' &&
      !error.message.includes('PRIVATE')
  );
  assert.deepEqual(
    initial.calls.map((call) => call.method),
    ['function:horion-register', 'setSession']
  );
  const verification = authClient({ userThrows: new TypeError('PRIVATE VERIFICATION DETAILS') });
  await assert.rejects(
    signupLiveAccount(verification.client, registration, signupOptions),
    (error) =>
      error instanceof RegistrationError &&
      error.code === 'network_failed' &&
      !error.message.includes('PRIVATE')
  );
  assert.deepEqual(verification.calls.at(-1), { method: 'logout', input: { scope: 'local' } });
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
