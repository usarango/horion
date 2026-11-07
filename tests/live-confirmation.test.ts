import assert from 'node:assert/strict';
import test from 'node:test';
import { parseConfirmationLink } from '../lib/live/confirmation';

const origin = 'https://horion-project.supabase.co';
const tokenHash = 'pkce_' + 'aB0123456789_-'.repeat(5);

function link(query = `token=${tokenHash}&type=email`) {
  return `${origin}/auth/v1/verify?${query}`;
}

test('default signup confirmation links produce the verifyOtp token-hash contract', () => {
  assert.deepEqual(
    parseConfirmationLink(
      `  ${link()}&redirect_to=${encodeURIComponent('https://another-app.example/callback')}  `,
      origin
    ),
    { token_hash: tokenHash, type: 'email' }
  );
  assert.deepEqual(parseConfirmationLink(link(`token_hash=${tokenHash}&type=signup`), origin), {
    token_hash: tokenHash,
    type: 'email',
  });
});

test('confirmation links must belong to the configured HTTPS verification endpoint', () => {
  const untrusted = [
    link().replace(origin, 'https://horion-project.supabase.co.attacker.example'),
    link().replace(origin, 'https://attacker.example/horion-project.supabase.co'),
    link().replace(origin, 'http://horion-project.supabase.co'),
    link().replace(origin, 'https://horion-project.supabase.co:444'),
    link().replace(origin, 'https://user:password@horion-project.supabase.co'),
    link().replace(origin, 'https://attacker.example@horion-project.supabase.co'),
    link().replace('/auth/v1/verify', '/auth/v1/verify/'),
    link().replace('/auth/v1/verify', '/auth/v1/token'),
    link().replace('/auth/v1/verify', '/auth%2Fv1%2Fverify'),
    link().replace('/auth/v1/verify', '\\auth\\v1\\verify'),
    `/auth/v1/verify?token=${tokenHash}&type=email`,
    `//horion-project.supabase.co/auth/v1/verify?token=${tokenHash}&type=email`,
  ];
  for (const input of untrusted) assert.throws(() => parseConfirmationLink(input, origin));
});

test('only an unambiguous email or signup token hash can be confirmed', () => {
  const invalidQueries = [
    `token=${tokenHash}`,
    'type=email',
    `token=${tokenHash}&type=recovery`,
    `token=${tokenHash}&type=invite`,
    `token=${tokenHash}&type=email_change`,
    `token=${tokenHash}&type=magiclink`,
    `token=${tokenHash}&type=email&type=signup`,
    `token=${tokenHash}&token=${tokenHash}&type=email`,
    `token=${tokenHash}&token_hash=${tokenHash}&type=email`,
    `token_hash=${tokenHash}&token_hash=${tokenHash}&type=email`,
    'token=123456&type=email',
    `token=${'a'.repeat(31)}&type=email`,
    `token=${'a'.repeat(513)}&type=email`,
    `token=${encodeURIComponent('a'.repeat(32) + '+/')}&type=email`,
    `token=${encodeURIComponent('a'.repeat(32) + '\n')}&type=email`,
  ];
  for (const query of invalidQueries)
    assert.throws(() => parseConfirmationLink(link(query), origin));
});

test('fragments, malformed links, huge inputs and invalid configuration are rejected safely', () => {
  const invalidInputs = [
    '',
    'not a URL',
    `${origin}/auth/v1/verify#token=${tokenHash}&type=email`,
    `${link()}#access_token=another-secret`,
    `${link()}#`,
    link().replace('verify?', 'ver\nify?'),
    `${link()}&redirect_to=${'a'.repeat(4096)}`,
  ];
  for (const input of invalidInputs) assert.throws(() => parseConfirmationLink(input, origin));
  for (const config of [
    'not a URL',
    'http://horion-project.supabase.co',
    'https://x:y@horion-project.supabase.co',
  ])
    assert.throws(() => parseConfirmationLink(link(), config));

  assert.throws(
    () => parseConfirmationLink(link(`token=${tokenHash}&type=recovery`), origin),
    (error: Error) => {
      assert.equal(error.message.includes(tokenHash), false);
      assert.equal(error.message.includes(origin), false);
      return true;
    }
  );
});
