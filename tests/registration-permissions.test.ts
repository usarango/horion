import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { loadActiveHorionMigrations } from './helpers/shared-migration';

const db = new PGlite();
type Role = 'anon' | 'authenticated' | 'service_role' | 'postgres';
const digest = (value: number) => value.toString(16).padStart(64, '0');
const PENDING = '10000000-0000-4000-8000-000000000001';
const CONFIRMED = '20000000-0000-4000-8000-000000000002';
const actor = '30000000-0000-4000-8000-000000000003';

async function as<T extends Record<string, unknown> = Record<string, unknown>>(
  role: Role,
  sql: string,
  args: unknown[] = []
) {
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
    role === 'authenticated' ? actor : '',
  ]);
  if (role !== 'postgres') await db.exec(`set role ${role}`);
  return db.query<T>(sql, args);
}
async function denied(promise: Promise<unknown>, code = '42501') {
  await assert.rejects(promise, (error: unknown) => {
    assert.equal(String((error as { code?: unknown }).code), code, String(error));
    return true;
  });
}
async function consume(ip: number, email: number) {
  const result = await as<{ allowed: boolean }>(
    'service_role',
    'select horion.consume_registration_attempt($1,$2) as allowed',
    [digest(ip), digest(email)]
  );
  return result.rows[0].allowed;
}
async function resolve(email: string) {
  return (
    await as<{ id: string | null }>(
      'service_role',
      'select horion.resolve_pending_registration($1) as id',
      [email]
    )
  ).rows[0].id;
}
before(async () => {
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth; create schema storage;
    create table auth.users(
      id uuid primary key, raw_user_meta_data jsonb not null default '{}',
      email varchar, email_confirmed_at timestamptz, encrypted_password varchar,
      deleted_at timestamptz, is_sso_user boolean not null default false,
      is_anonymous boolean not null default false
    );
    create table auth.identities(user_id uuid references auth.users(id) on delete cascade,provider text);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema auth,storage to anon,authenticated;
    grant execute on function auth.uid() to anon,authenticated;
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);
    alter table storage.objects enable row level security;
    grant select,insert,update,delete on storage.objects to anon,authenticated;
    create function storage.foldername(text) returns text[] language sql immutable as $$ select (string_to_array($1,'/'))[1:array_length(string_to_array($1,'/'),1)-1] $$;
  `);
  for (const migration of await loadActiveHorionMigrations()) await db.exec(migration);
});
beforeEach(async () => {
  await as('postgres', 'delete from horion_private.registration_attempts');
});
after(async () => {
  await db.close();
});

test('registration migration creates no identities, profiles, roles or global Auth hook', async () => {
  for (const table of [
    'auth.users',
    'horion.profiles',
    'horion.communities',
    'horion_private.user_roles',
    'horion_private.registration_attempts',
  ])
    assert.equal((await as('postgres', `select * from ${table}`)).rows.length, 0, table);
  assert.equal(
    (
      await as<{ rls: boolean }>(
        'postgres',
        "select relrowsecurity as rls from pg_class where oid='horion_private.registration_attempts'::regclass"
      )
    ).rows[0].rls,
    true
  );
  assert.equal(
    (
      await as(
        'postgres',
        "select tgname from pg_trigger where tgrelid='auth.users'::regclass and not tgisinternal"
      )
    ).rows.length,
    0
  );
});

test('only the service role can execute either registration RPC or its private helper', async () => {
  for (const role of ['anon', 'authenticated'] as const) {
    for (const schema of ['horion', 'horion_private']) {
      await denied(
        as(role, `select ${schema}.consume_registration_attempt($1,$2)`, [digest(1), digest(2)])
      );
      await denied(
        as(role, `select ${schema}.resolve_pending_registration($1)`, ['member@example.test'])
      );
    }
    await denied(as(role, 'select * from horion_private.registration_attempts'));
    await denied(
      as(
        role,
        'insert into horion_private.registration_attempts(ip_hash,email_hash) values($1,$2)',
        [digest(1), digest(2)]
      )
    );
  }
  assert.equal(await consume(1, 2), true);
  await denied(as('service_role', 'select * from horion_private.registration_attempts'));
  await denied(
    as(
      'service_role',
      'insert into horion_private.registration_attempts(ip_hash,email_hash) values($1,$2)',
      [digest(1), digest(2)]
    )
  );
  await denied(
    as(
      'service_role',
      "update horion_private.registration_attempts set created_at=now()-interval '2 hours'"
    )
  );
});

test('accepted attempts record only HMAC digests with a server timestamp before Auth', async () => {
  assert.equal(await consume(7, 8), true);
  const row = (
    await as<{ ip_hash: string; email_hash: string; fresh: boolean }>(
      'postgres',
      "select ip_hash,email_hash,created_at between now()-interval '5 seconds' and clock_timestamp() as fresh from horion_private.registration_attempts"
    )
  ).rows[0];
  assert.deepEqual(row, { ip_hash: digest(7), email_hash: digest(8), fresh: true });
  assert.deepEqual(
    (
      await as<{ column_name: string }>(
        'postgres',
        "select column_name from information_schema.columns where table_schema='horion_private' and table_name='registration_attempts' order by ordinal_position"
      )
    ).rows.map((row) => row.column_name),
    ['id', 'ip_hash', 'email_hash', 'created_at']
  );
  for (const invalid of [
    '',
    'person@example.test',
    '127.0.0.1',
    'A'.repeat(64),
    'x'.repeat(64),
    'a'.repeat(63),
    'a'.repeat(65),
  ])
    await denied(
      as('service_role', 'select horion.consume_registration_attempt($1,$2)', [invalid, digest(8)]),
      '22023'
    );
  assert.equal(
    (await as('postgres', 'select * from horion_private.registration_attempts')).rows.length,
    1
  );
});

test('the five-per-minute IP limit also bounds a single burst of differently addressed requests', async () => {
  const result = await as<{ allowed: boolean }>(
    'service_role',
    "select horion.consume_registration_attempt($1,lpad(to_hex(n),64,'0')) as allowed from generate_series(1,8) n",
    [digest(999)]
  );
  assert.deepEqual(
    result.rows.map((row) => row.allowed),
    [true, true, true, true, true, false, false, false]
  );
  assert.equal(
    (await as('postgres', 'select * from horion_private.registration_attempts')).rows.length,
    5
  );
});

test('the IP hourly allowance remains enforced after its minute allowance resets', async () => {
  await as(
    'postgres',
    "insert into horion_private.registration_attempts(ip_hash,email_hash,created_at) select $1,lpad(to_hex(n),64,'0'),now()-interval '2 minutes' from generate_series(1,19) n",
    [digest(42)]
  );
  assert.equal(await consume(42, 1001), true);
  assert.equal(await consume(42, 1002), false);
  assert.equal(
    (await as('postgres', 'select * from horion_private.registration_attempts')).rows.length,
    20
  );
});

test('email attempts are bounded across different IP hashes', async () => {
  for (let ip = 1; ip <= 5; ip++) assert.equal(await consume(ip, 999), true);
  assert.equal(await consume(6, 999), false);
  assert.equal(
    (await as('postgres', 'select * from horion_private.registration_attempts')).rows.length,
    5
  );
});

test('the global hourly limit bounds callers rotating both email and IP digests', async () => {
  await as(
    'postgres',
    "insert into horion_private.registration_attempts(ip_hash,email_hash,created_at) select lpad(to_hex(n),64,'0'),lpad(to_hex(n+1000),64,'0'),now()-interval '2 minutes' from generate_series(1,99) n"
  );
  assert.equal(await consume(5000, 6000), true);
  assert.equal(await consume(5001, 6001), false);
  assert.equal(
    (await as('postgres', 'select * from horion_private.registration_attempts')).rows.length,
    100
  );
});

test('expired windows stop counting and entries older than 24 hours are removed on the next attempt', async () => {
  await as(
    'postgres',
    "insert into horion_private.registration_attempts(ip_hash,email_hash,created_at) select $1,$2,now()-interval '61 minutes' from generate_series(1,20)",
    [digest(1), digest(2)]
  );
  await as(
    'postgres',
    "insert into horion_private.registration_attempts(ip_hash,email_hash,created_at) values($1,$2,now()-interval '25 hours')",
    [digest(1), digest(2)]
  );
  assert.equal(await consume(1, 2), true);
  const rows = await as<{ count: number; stale: number }>(
    'postgres',
    "select count(*)::int as count,count(*) filter(where created_at<now()-interval '24 hours')::int as stale from horion_private.registration_attempts"
  );
  assert.deepEqual(rows.rows[0], { count: 21, stale: 0 });
});

test('pending lookup returns only the exact unconfirmed email/password identity without changing it', async () => {
  await as(
    'postgres',
    "insert into auth.users(id,email,encrypted_password) values($1,'Pending.Member@Example.test','fixture-password-hash'),($2,'confirmed@example.test','fixture-password-hash')",
    [PENDING, CONFIRMED]
  );
  await as(
    'postgres',
    "insert into auth.identities(user_id,provider) values($1,'email'),($2,'email')",
    [PENDING, CONFIRMED]
  );
  await as('postgres', 'update auth.users set email_confirmed_at=now() where id=$1', [CONFIRMED]);
  assert.equal(await resolve(' pending.member@example.test '), PENDING);
  assert.equal(await resolve('pending.member@example.test.extra'), null);
  assert.equal(await resolve('confirmed@example.test'), null);
  assert.equal(await resolve('not-registered@example.test'), null);
  assert.equal(
    (
      await as<{ email_confirmed_at: null }>(
        'postgres',
        'select email_confirmed_at from auth.users where id=$1',
        [PENDING]
      )
    ).rows[0].email_confirmed_at,
    null
  );
  assert.equal((await as('postgres', 'select * from horion.profiles')).rows.length, 0);
  assert.equal((await as('postgres', 'select * from horion_private.user_roles')).rows.length, 0);
  await denied(as('service_role', 'select email,encrypted_password from auth.users'));
});

test('pending lookup excludes deleted, SSO, anonymous, passwordless and non-email identities', async () => {
  for (const [column, value] of [
    ['deleted_at', 'now()'],
    ['is_sso_user', 'true'],
    ['is_anonymous', 'true'],
    ['encrypted_password', "''"],
  ]) {
    await as('postgres', `update auth.users set ${column}=${value} where id=$1`, [PENDING]);
    assert.equal(await resolve('pending.member@example.test'), null, column);
    await as(
      'postgres',
      "update auth.users set deleted_at=null,is_sso_user=false,is_anonymous=false,encrypted_password='fixture-password-hash' where id=$1",
      [PENDING]
    );
  }
  await as('postgres', "update auth.identities set provider='github' where user_id=$1", [PENDING]);
  assert.equal(await resolve('pending.member@example.test'), null);
  await as('postgres', "update auth.identities set provider='email' where user_id=$1", [PENDING]);
});

test('ambiguous normalized email matches and malformed inputs fail closed without returning another identity', async () => {
  await as(
    'postgres',
    "insert into auth.users(id,email,encrypted_password) values($1,'pending.member@example.test','fixture-password-hash')",
    [actor]
  );
  await as('postgres', "insert into auth.identities(user_id,provider) values($1,'email')", [actor]);
  assert.equal(await resolve('pending.member@example.test'), null);
  for (const email of [
    '',
    'address-without-at',
    'person@example',
    'private person@example.test',
    'a'.repeat(250) + '@example.test',
  ])
    await denied(
      as('service_role', 'select horion.resolve_pending_registration($1)', [email]),
      '22023'
    );
  assert.equal((await as('postgres', 'select * from horion.profiles')).rows.length, 0);
});
