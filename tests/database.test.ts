import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

// Executes PostgreSQL RLS and constraints, with minimal Auth/Storage schema stand-ins.
// This does not emulate Supabase Auth HTTP, Storage service, signing, or advisors.
const db = new PGlite();
const A = 'aaaaaaaa-1111-4111-8111-111111111111';
const B = 'bbbbbbbb-2222-4222-8222-222222222222';
const ADMIN = 'cccccccc-3333-4333-8333-333333333333';
const C = 'dddddddd-4444-4444-8444-444444444444';
const P = 'eeeeeeee-5555-4555-8555-555555555555';
const P2 = 'ffffffff-6666-4666-8666-666666666666';
const W = '11111111-7777-4777-8777-777777777777';
const WP = '22222222-8888-4888-8888-888888888888';
const WB = '33333333-9999-4999-8999-999999999999';
const PASSPORT = '44444444-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const DOC = '55555555-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const COMMENT = '66666666-cccc-4ccc-8ccc-cccccccccccc';
const path = `${A}/${PASSPORT}/receipt.pdf`;

async function as<T extends Record<string, unknown> = Record<string, unknown>>(
  role: 'anon' | 'authenticated' | 'postgres',
  user: string | null,
  sql: string,
  params: unknown[] = []
) {
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [user ?? '']);
  if (role !== 'postgres') await db.exec(`set role ${role}`);
  return db.query<T>(sql, params);
}
async function denied(operation: Promise<unknown>) {
  await assert.rejects(operation, (e: unknown) => {
    assert.ok(e && typeof e === 'object' && 'code' in e);
    assert.ok(['42501', '23503', '23505', '23514'].includes(String(e.code)), String(e.code));
    return true;
  });
}

before(async () => {
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth; create schema storage;
    create table auth.users(id uuid primary key,raw_user_meta_data jsonb not null default '{}');
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
    $$;
    grant usage on schema auth,storage to anon,authenticated;
    grant execute on function auth.uid() to anon,authenticated;
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);
    alter table storage.objects enable row level security;
    grant select,insert,update,delete on storage.objects to anon,authenticated;
    create function storage.foldername(text) returns text[] language sql immutable as $$
      select (string_to_array($1,'/'))[1:array_length(string_to_array($1,'/'),1)-1]
    $$;
  `);
  await db.exec(
    await readFile(
      new URL('../supabase/migrations/20261106233423_horion_foundation.sql', import.meta.url),
      'utf8'
    )
  );
  await db.query(
    `insert into auth.users(id,raw_user_meta_data) values($1,'{}'),($2,'{"role":"admin","app_metadata":{"role":"admin"}}'),($3,'{}')`,
    [A, B, ADMIN]
  );
  await db.query(`insert into app_private.user_roles(user_id,role) values($1,'admin')`, [ADMIN]);
  await db.query(`update public.profiles set collection_public=true where id=$1`, [A]);
  await db.query(
    `insert into public.communities(id,slug,name) values($1,'test-community','Test community')`,
    [C]
  );
  await db.query(`insert into public.memberships(community_id,user_id) values($1,$2),($1,$3)`, [
    C,
    A,
    B,
  ]);
  await as(
    'postgres',
    A,
    `insert into public.posts(id,author_id,community_id,title,body) values($1,$2,$3,'An accessible post','A public discussion')`,
    [P, A, C]
  );
  await as(
    'postgres',
    B,
    `insert into public.posts(id,author_id,community_id,title,body) values($1,$2,$3,'Another public post','Another discussion')`,
    [P2, B, C]
  );
  await db.query(
    `insert into public.user_watches(id,owner_id,label,visibility) values($1,$2,'Public watch','public'),($3,$2,'Private watch','private'),($4,$5,'Other member watch','private')`,
    [W, A, WP, WB, B]
  );
  await db.query(
    `insert into public.watch_private(watch_id,owner_id,serial_number,acquisition_amount,currency) values($1,$2,'SERIAL-SECRET',900,'BRL')`,
    [W, A]
  );
  await db.query(`insert into public.passports(id,watch_id,owner_id) values($1,$2,$3)`, [
    PASSPORT,
    W,
    A,
  ]);
  await db.query(
    `insert into public.passport_documents(id,passport_id,owner_id,storage_path,file_name,mime_type,size_bytes) values($1,$2,$3,$4,'receipt.pdf','application/pdf',120)`,
    [DOC, PASSPORT, A, path]
  );
  await db.query(`insert into storage.objects(bucket_id,name) values('passport-documents',$1)`, [
    path,
  ]);
  await db.query(
    `insert into public.comments(id,post_id,author_id,body) values($1,$2,$3,'A parent comment')`,
    [COMMENT, P, A]
  );
  await db.query(
    `insert into public.reputation_rules(code,points,daily_limit) values('catalog-approved',10,5)`
  );
  await db.query(
    `insert into public.reputation_events(user_id,rule_code,points,evidence_key,granted_by) values($1,'catalog-approved',10,'source-1',$2)`,
    [A, ADMIN]
  );
});
after(async () => {
  await db.close();
});

test('migration enables RLS on every Horion public table', async () => {
  const result = await as(
    'postgres',
    null,
    `select relname from pg_class join pg_namespace ns on ns.oid=relnamespace where ns.nspname='public' and relkind='r' and not relrowsecurity`
  );
  assert.deepEqual(result.rows, []);
});

test('visitors can browse public posts and public watches; private details are unavailable', async () => {
  const posts = await as('anon', null, 'select id from public.posts');
  assert.equal(posts.rows.length, 2);
  const watches = await as('anon', null, 'select id from public.user_watches');
  assert.deepEqual(
    watches.rows.map((r) => r.id),
    [W]
  );
  await denied(as('anon', null, 'select * from public.watch_private'));
  await denied(as('anon', null, 'select * from public.passport_documents'));
  assert.equal((await as('anon', null, 'select * from storage.objects')).rows.length, 0);
});

test('member B cannot read member A serials, passports or document metadata/object', async () => {
  for (const table of ['watch_private', 'passports', 'passport_documents']) {
    const result = await as('authenticated', B, `select * from public.${table}`);
    assert.equal(result.rows.length, 0, table);
  }
  assert.equal((await as('authenticated', B, 'select * from storage.objects')).rows.length, 0);
  assert.equal(
    (await as('authenticated', A, 'select * from public.watch_private')).rows[0].serial_number,
    'SERIAL-SECRET'
  );
  assert.equal(
    (await as('authenticated', A, 'select * from public.passport_documents')).rows.length,
    1
  );
  assert.equal((await as('authenticated', A, 'select * from storage.objects')).rows.length, 1);
});

test('admin role does not override owner-only passport privacy', async () => {
  assert.equal(
    (await as<{ is_admin: boolean }>('authenticated', ADMIN, 'select app_private.is_admin()'))
      .rows[0].is_admin,
    true
  );
  assert.equal(
    (await as('authenticated', ADMIN, 'select * from public.passport_documents')).rows.length,
    0
  );
  assert.equal(
    (await as('authenticated', ADMIN, 'select * from public.watch_private')).rows.length,
    0
  );
});

test('public visibility requires both the watch setting and the owner profile setting', async () => {
  await as('authenticated', A, 'update public.profiles set collection_public=false where id=$1', [
    A,
  ]);
  assert.equal((await as('anon', null, 'select * from public.user_watches')).rows.length, 0);
  await as('authenticated', A, 'update public.profiles set collection_public=true where id=$1', [
    A,
  ]);
});

test('owners cannot forge a partner verification or a passport for somebody else watch', async () => {
  await denied(
    as(
      'authenticated',
      A,
      `insert into public.passport_events(passport_id,owner_id,event_type,occurred_on,description,verification) values($1,$2,'service','2026-10-01','Claimed verification','partner-verified')`,
      [PASSPORT, A]
    )
  );
  await denied(
    as('authenticated', B, `insert into public.passports(watch_id,owner_id) values($1,$2)`, [WP, B])
  );
  await denied(
    as(
      'authenticated',
      B,
      `insert into public.passport_events(passport_id,owner_id,event_type,occurred_on,description) values($1,$2,'service','2026-10-01','Other member event')`,
      [PASSPORT, B]
    )
  );
  const valid = await as(
    'authenticated',
    A,
    `insert into public.passport_events(passport_id,owner_id,event_type,occurred_on,description) values($1,$2,'service','2026-10-01','Owner recorded service') returning verification`,
    [PASSPORT, A]
  );
  assert.equal(valid.rows[0].verification, 'owner-declared');
});

test('document paths cannot impersonate another owner or passport', async () => {
  await denied(
    as(
      'authenticated',
      B,
      `insert into public.passport_documents(passport_id,owner_id,storage_path,file_name,mime_type,size_bytes) values($1,$2,$3,'fraud.pdf','application/pdf',10)`,
      [PASSPORT, B, `${B}/${PASSPORT}/fraud.pdf`]
    )
  );
  await denied(
    as(
      'authenticated',
      B,
      `insert into storage.objects(bucket_id,name) values('passport-documents',$1)`,
      [`${A}/${PASSPORT}/forged.pdf`]
    )
  );
  await denied(
    as(
      'authenticated',
      B,
      `insert into storage.objects(bucket_id,name) values('passport-documents',$1)`,
      [`${B}/${PASSPORT}/forged.pdf`]
    )
  );
});

test('passport ownership cannot be transferred through direct table updates', async () => {
  await denied(
    as('authenticated', A, 'update public.passports set owner_id=$1 where id=$2', [B, PASSPORT])
  );
  await denied(
    as('authenticated', A, 'update public.user_watches set owner_id=$1 where id=$2', [B, W])
  );
  assert.equal(
    (
      await as(
        'authenticated',
        B,
        'update public.watch_private set notes=$1 where watch_id=$2 returning watch_id',
        ['tamper', W]
      )
    ).rows.length,
    0
  );
});

test('user metadata cannot grant an administrator role or reputation', async () => {
  assert.equal(
    (await as<{ is_admin: boolean }>('authenticated', B, 'select app_private.is_admin()')).rows[0]
      .is_admin,
    false
  );
  await denied(
    as('authenticated', B, `insert into app_private.user_roles(user_id,role) values($1,'admin')`, [
      B,
    ])
  );
  await denied(
    as(
      'authenticated',
      B,
      `insert into public.reputation_events(user_id,rule_code,points,evidence_key) values($1,'catalog-approved',10,'forged')`,
      [B]
    )
  );
  await denied(
    as('authenticated', A, `update public.reputation_events set points=100 where user_id=$1`, [A])
  );
  assert.equal(
    (await as('authenticated', B, 'select * from public.reputation_events')).rows.length,
    0
  );
});

test('votes require another author and a signed-in voter; updates cannot change identity', async () => {
  await denied(
    as('anon', null, 'insert into public.votes(post_id,user_id,value) values($1,$2,1)', [P, B])
  );
  await denied(
    as('authenticated', A, 'insert into public.votes(post_id,user_id,value) values($1,$2,1)', [
      P,
      A,
    ])
  );
  await as('authenticated', B, 'insert into public.votes(post_id,user_id,value) values($1,$2,1)', [
    P,
    B,
  ]);
  await denied(
    as('authenticated', B, 'update public.votes set user_id=$1 where post_id=$2', [A, P])
  );
  await as('authenticated', B, 'update public.votes set value=-1 where post_id=$1', [P]);
});

test('publishing requires actual membership, not a forged author or membership identity', async () => {
  await denied(
    as(
      'authenticated',
      ADMIN,
      "insert into public.posts(author_id,community_id,title,body) values($1,$2,'A title','Content')",
      [ADMIN, C]
    )
  );
  await denied(
    as('authenticated', B, 'insert into public.memberships(community_id,user_id) values($1,$2)', [
      C,
      ADMIN,
    ])
  );
  await denied(
    as(
      'authenticated',
      B,
      "insert into public.posts(author_id,community_id,title,body) values($1,$2,'A title','Content')",
      [A, C]
    )
  );
});

test('a reply must belong to the same post as its parent', async () => {
  await denied(
    as(
      'authenticated',
      B,
      "insert into public.comments(post_id,author_id,parent_id,body) values($1,$2,$3,'Cross-post reply')",
      [P2, B, COMMENT]
    )
  );
  await denied(
    as(
      'authenticated',
      B,
      "insert into public.comments(post_id,author_id,parent_id,body) values($1,$2,$3,'Missing parent reply')",
      [P, B, '77777777-dddd-4ddd-8ddd-dddddddddddd']
    )
  );
  const reply = await as(
    'authenticated',
    B,
    "insert into public.comments(post_id,author_id,parent_id,body) values($1,$2,$3,'A valid reply') returning id",
    [P, B, COMMENT]
  );
  assert.equal(reply.rows.length, 1);
});

test('a block prevents the blocked member from commenting and following the blocker', async () => {
  await as('authenticated', A, 'insert into public.blocks(user_id,blocked_id) values($1,$2)', [
    A,
    B,
  ]);
  await denied(
    as(
      'authenticated',
      B,
      "insert into public.comments(post_id,author_id,body) values($1,$2,'Blocked interaction')",
      [P, B]
    )
  );
  await denied(
    as('authenticated', B, 'insert into public.follows(follower_id,followed_id) values($1,$2)', [
      B,
      A,
    ])
  );
  await as('authenticated', A, 'delete from public.blocks where user_id=$1 and blocked_id=$2', [
    A,
    B,
  ]);
});

test('sensitive moderation changes are recorded and unprivileged members cannot hide others posts', async () => {
  const mediaPath = `${A}/${P}/photo.jpg`;
  const orphanPath = `${A}/unattached.jpg`;
  await as(
    'authenticated',
    A,
    `insert into storage.objects(bucket_id,name) values('post-media',$1),('post-media',$2)`,
    [mediaPath, orphanPath]
  );
  await as(
    'authenticated',
    A,
    `insert into public.media(owner_id,post_id,storage_path,mime_type,size_bytes) values($1,$2,$3,'image/jpeg',120)`,
    [A, P, mediaPath]
  );
  const visibleMedia = await as(
    'anon',
    null,
    "select name from storage.objects where bucket_id='post-media'"
  );
  assert.deepEqual(
    visibleMedia.rows.map((r) => r.name),
    [mediaPath]
  );
  assert.equal(
    (
      await as(
        'authenticated',
        B,
        "update public.posts set status='removed' where id=$1 returning id",
        [P]
      )
    ).rows.length,
    0
  );
  const changed = await as(
    'authenticated',
    ADMIN,
    "update public.posts set status='removed' where id=$1 returning id",
    [P]
  );
  assert.equal(changed.rows.length, 1);
  assert.equal(
    (await as('anon', null, 'select * from public.posts where id=$1', [P])).rows.length,
    0
  );
  assert.equal(
    (await as('anon', null, "select * from storage.objects where bucket_id='post-media'")).rows
      .length,
    0
  );
  assert.equal(
    (
      await as('authenticated', ADMIN, 'select * from public.moderation_actions where post_id=$1', [
        P,
      ])
    ).rows.length,
    1
  );
  assert.equal(
    (await as('postgres', null, 'select * from app_private.audit_log where entity_id=$1', [P])).rows
      .length,
    1
  );
});

test('vote RPC changes only a caller-owned vote and supports idempotent removal', async () => {
  const inserted = await as('authenticated', A, 'select * from public.cast_vote($1,1::smallint)', [
    P2,
  ]);
  assert.equal(inserted.rows[0].value, 1);
  const changed = await as('authenticated', A, 'select * from public.cast_vote($1,-1::smallint)', [
    P2,
  ]);
  assert.equal(changed.rows[0].value, -1);
  assert.equal(changed.rows[0].user_id, A);
  assert.equal(
    (await as('authenticated', A, 'select * from public.cast_vote($1,0::smallint)', [P2])).rows
      .length,
    1
  );
  assert.equal(
    (await as('authenticated', A, 'select * from public.cast_vote($1,0::smallint)', [P2])).rows
      .length,
    0
  );
  await denied(as('anon', null, 'select * from public.cast_vote($1,1::smallint)', [P2]));
});

test('publishing rate limit cannot be bypassed with a caller-supplied old creation date', async () => {
  const before = await as<{ count: string }>(
    'postgres',
    A,
    "select count(*) from public.posts where author_id=$1 and created_at>now()-interval '1 minute'",
    [A]
  );
  const available = 5 - Number(before.rows[0].count);
  for (let i = 0; i < available; i++)
    await as(
      'authenticated',
      A,
      "insert into public.posts(author_id,community_id,title,body,created_at) values($1,$2,'Rate-limit test','Fictional test content','2001-01-01')",
      [A, C]
    );
  await assert.rejects(
    as(
      'authenticated',
      A,
      "insert into public.posts(author_id,community_id,title,body,created_at) values($1,$2,'One too many','Fictional test content','2001-01-01')",
      [A, C]
    ),
    (e: unknown) => {
      assert.equal((e as { code: string }).code, 'P0001');
      return true;
    }
  );
});
