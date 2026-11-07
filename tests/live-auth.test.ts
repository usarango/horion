import test from 'node:test';
import assert from 'node:assert/strict';
import {
  confirmLiveEmail,
  loginLiveAccount,
  signoutLiveAccount,
  signupLiveAccount,
} from '../lib/live/auth';
import type { LiveClient } from '../lib/live/types';

function authClient(options: { session?: object | null; fail?: boolean } = {}) {
  const calls: { method: string; input: unknown }[] = [];
  const result = {
    data: {
      session: options.session === undefined ? { user: { id: 'confirmed-user' } } : options.session,
    },
    error: options.fail ? { message: 'Internal details must not be shown' } : null,
  };
  const client = {
    auth: {
      async signInWithPassword(input: unknown) {
        calls.push({ method: 'login', input });
        return result;
      },
      async signUp(input: unknown) {
        calls.push({ method: 'signup', input });
        return result;
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

test('disabled live signup makes no Auth request', async () => {
  const { client, calls } = authClient();
  await assert.rejects(
    signupLiveAccount(client, registration, { enabled: false, origin: 'https://horion.example' }),
    /not available/
  );
  assert.equal(calls.length, 0);
});

test('signup reflects confirmation-required responses and never sets authorization metadata', async () => {
  const { client, calls } = authClient({ session: null });
  assert.deepEqual(
    await signupLiveAccount(client, registration, {
      enabled: true,
      origin: 'https://horion.example',
    }),
    { emailConfirmationRequired: true }
  );
  const request = calls[0].input as { options: { data: object; emailRedirectTo: string } };
  assert.deepEqual(request.options.data, { display_name: 'Collector' });
  assert.equal(request.options.emailRedirectTo, 'https://horion.example/pt-BR');
});

test('existing-account login accepts short legacy passwords but requires a returned session', async () => {
  const valid = authClient();
  await loginLiveAccount(valid.client, 'collector@example.test', 'legacy');
  assert.equal(valid.calls[0].method, 'login');
  const invalid = authClient({ session: null });
  await assert.rejects(
    loginLiveAccount(invalid.client, 'collector@example.test', 'legacy'),
    /Unable to sign in/
  );
});

test('signing out scopes revocation to the current Horion session', async () => {
  const { client, calls } = authClient();
  await signoutLiveAccount(client);
  assert.deepEqual(calls, [{ method: 'logout', input: { scope: 'local' } }]);
});

test('email confirmation verifies only a configured-project token and requires a session', async () => {
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
