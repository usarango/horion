import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { loadActiveHorionMigrations } from './helpers/shared-migration';

const db = new PGlite();
const OWNER = '11000000-0000-4000-8000-000000000001';
const MEMBER = '22000000-0000-4000-8000-000000000002';
const STORE = '33000000-0000-4000-8000-000000000003';
const OTHER_ADMIN = '44000000-0000-4000-8000-000000000004';
const OUTSIDER = '55000000-0000-4000-8000-000000000005';
const NOT_JOINED = '66000000-0000-4000-8000-000000000006';
const DELETED = '77000000-0000-4000-8000-000000000007';
let ownCommunity: string;
let storeCommunity: string;
let ownPost: string;
let storePost: string;

async function as<T extends Record<string, unknown> = Record<string, unknown>>(
  role: 'anon' | 'authenticated' | 'postgres',
  uid: string | null,
  sql: string,
  args: unknown[] = []
) {
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [uid ?? '']);
  if (role !== 'postgres') await db.exec(`set role ${role}`);
  return db.query<T>(sql, args);
}
async function denied(query: Promise<unknown>, codes = ['42501', '23514', '22023']) {
  await assert.rejects(query, (error: unknown) => {
    assert.ok(codes.includes(String((error as { code?: unknown }).code)), String(error));
    return true;
  });
}
before(async () => {
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth; create schema storage;
    create table auth.users(id uuid primary key,raw_user_meta_data jsonb not null default '{}');
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
  await as('postgres', null, `insert into auth.users(id,raw_user_meta_data)
    values($1,'{}'),($2,'{}'),($3,'{"role":"admin","account_type":"moderator"}'),($4,'{}'),($5,'{}'),($6,'{}'),($7,'{}')`,
  [OWNER, MEMBER, STORE, OTHER_ADMIN, OUTSIDER, NOT_JOINED, DELETED]);
});
after(async () => { await db.close(); });

test('deferred administrator table is empty, private and does not create a profile or Auth hook', async () => {
  assert.equal((await as('postgres', null, 'select * from horion.profiles')).rows.length, 0);
  assert.equal((await as('postgres', null, 'select * from horion_private.pending_role_assignments')).rows.length, 0);
  assert.equal((await as<{ rls: boolean }>('postgres', null, "select relrowsecurity as rls from pg_class where oid='horion_private.pending_role_assignments'::regclass")).rows[0].rls, true);
  assert.equal((await as('postgres', null, "select tgname from pg_trigger where tgrelid='auth.users'::regclass and not tgisinternal")).rows.length, 0);
  await denied(as('anon', null, 'select * from horion_private.pending_role_assignments'));
  await denied(as('authenticated', OWNER, 'select * from horion_private.pending_role_assignments'));
  await denied(as('authenticated', OWNER, 'insert into horion_private.pending_role_assignments(user_id) values($1)', [OWNER]));
});

test('operator queues only an existing Auth identity without creating its Horion profile', async () => {
  await as('postgres', null, 'insert into horion_private.pending_role_assignments(user_id) values($1)', [OWNER]);
  assert.equal((await as('postgres', null, 'select * from horion.profiles')).rows.length, 0);
  await denied(as('postgres', null, "insert into horion_private.pending_role_assignments(user_id,role) values($1,'moderator')", [MEMBER]));
  await denied(as('postgres', null, 'insert into horion_private.pending_role_assignments(user_id) values($1)', ['88000000-0000-4000-8000-000000000008']), ['23503']);
  await denied(as('authenticated', MEMBER, "insert into horion.profiles(id,username,display_name,locale) values($1,'forged_owner','Forged','en')", [OWNER]));
  await as('authenticated', MEMBER, "select * from horion.onboard_member('normal_member','Normal member','en')");
  await as('authenticated', STORE, "select * from horion.onboard_member('normal_store','Normal store','en','store')");
  assert.equal((await as<{ role: string }>('authenticated', STORE, 'select horion.get_my_role() as role')).rows[0].role, 'member');
  assert.equal((await as('postgres', null, 'select * from horion_private.pending_role_assignments where user_id=$1', [OWNER])).rows.length, 1);
  assert.equal((await as('postgres', null, 'select * from horion_private.user_roles')).rows.length, 0);
});

test('exact queued identity receives admin only after explicit self-onboarding, atomically and once', async () => {
  await as('authenticated', OWNER, "select * from horion.onboard_member('chosen_owner','Chosen owner','pt-BR')");
  assert.equal((await as<{ role: string }>('authenticated', OWNER, 'select horion.get_my_role() as role')).rows[0].role, 'admin');
  assert.equal((await as('postgres', null, 'select * from horion_private.pending_role_assignments')).rows.length, 0);
  assert.deepEqual((await as('postgres', null, "select actor_id,entity_id,operation from horion_private.audit_log where operation='apply_pending:admin'")).rows,
    [{ actor_id: OWNER, entity_id: OWNER, operation: 'apply_pending:admin' }]);
  await as('authenticated', OWNER, "select * from horion.onboard_member('ignored_change','Ignored change','en')");
  assert.equal((await as('postgres', null, "select * from horion_private.audit_log where operation='apply_pending:admin'")).rows.length, 1);
  assert.equal((await as('authenticated', OWNER, 'select display_name from horion.profiles where id=$1', [OWNER])).rows[0].display_name, 'Chosen owner');
  await denied(as('authenticated', OWNER, 'select horion_private.apply_pending_role_assignment()'));
});

test('only a current administrator can assign or remove the moderator role, with an audit record', async () => {
  await denied(as('anon', null, 'select horion.set_member_role($1,$2)', [STORE, 'moderator']));
  await denied(as('authenticated', MEMBER, 'select horion.set_member_role($1,$2)', [STORE, 'moderator']));
  await denied(as('authenticated', STORE, 'select horion_private.set_member_role($1,$2)', [MEMBER, 'moderator']));
  assert.equal((await as<{ role: string }>('authenticated', OWNER, 'select horion.set_member_role($1,$2) as role', [STORE, 'moderator'])).rows[0].role, 'moderator');
  assert.equal((await as<{ role: string }>('authenticated', STORE, 'select horion.get_my_role() as role')).rows[0].role, 'moderator');
  await denied(as('authenticated', STORE, 'select horion.set_member_role($1,$2)', [MEMBER, 'moderator']));
  await denied(as('authenticated', STORE, "insert into horion_private.user_roles(user_id,role) values($1,'admin')", [STORE]));
  assert.equal((await as('postgres', null, "select * from horion_private.audit_log where actor_id=$1 and entity_id=$2 and operation='role:member->moderator'", [OWNER, STORE])).rows.length, 1);
  await as('authenticated', OWNER, 'select horion.set_member_role($1,$2)', [STORE, 'member']);
  assert.equal((await as<{ role: string }>('authenticated', STORE, 'select horion.get_my_role() as role')).rows[0].role, 'member');
  assert.equal((await as('postgres', null, 'select * from horion_private.user_roles where user_id=$1', [STORE])).rows.length, 0);
  assert.equal((await as('postgres', null, "select * from horion_private.audit_log where actor_id=$1 and entity_id=$2 and operation='role:moderator->member'", [OWNER, STORE])).rows.length, 1);
});

test('role API cannot modify self or any admin, create an admin, target an unjoined identity or remove the last admin', async () => {
  await denied(as('authenticated', OWNER, 'select horion.set_member_role($1,$2)', [OWNER, 'member']));
  await denied(as('authenticated', OWNER, 'select horion.set_member_role($1,$2)', [MEMBER, 'admin']));
  await denied(as('authenticated', OWNER, 'select horion.set_member_role($1,$2)', [NOT_JOINED, 'moderator']));
  await denied(as('authenticated', OWNER, 'select horion.set_member_role($1,$2)', [null, 'moderator']));
  await denied(as('authenticated', OWNER, 'select horion.set_member_role($1,$2)', [MEMBER, null]));
  assert.deepEqual((await as('postgres', null, "select user_id from horion_private.user_roles where role='admin'")).rows, [{ user_id: OWNER }]);
  await as('authenticated', OTHER_ADMIN, "select * from horion.onboard_member('second_admin','Second admin','en')");
  await as('postgres', null, "insert into horion_private.user_roles(user_id,role) values($1,'admin')", [OTHER_ADMIN]);
  await denied(as('authenticated', OWNER, 'select horion.set_member_role($1,$2)', [OTHER_ADMIN, 'moderator']));
  await denied(as('authenticated', OTHER_ADMIN, 'select horion.set_member_role($1,$2)', [OWNER, 'member']));
});

test('scoped moderators read and resolve reports only in their community; reporters retain their own read access', async () => {
  await as('authenticated', OUTSIDER, "select * from horion.onboard_member('outside_member','Outside member','en')");
  ownCommunity = String((await as('authenticated', MEMBER, "select * from horion.create_community('Member community','member-scope')")).rows[0].id);
  storeCommunity = String((await as('authenticated', STORE, "select * from horion.create_community('Store community','store-scope')")).rows[0].id);
  await as('authenticated', OUTSIDER, 'insert into horion.memberships(community_id,user_id) values($1,$3),($2,$3)', [ownCommunity, storeCommunity, OUTSIDER]);
  ownPost = String((await as('authenticated', OUTSIDER, "insert into horion.posts(author_id,community_id,title,body) values($1,$2,'Member scope post','Member scope body') returning id", [OUTSIDER, ownCommunity])).rows[0].id);
  storePost = String((await as('authenticated', OUTSIDER, "insert into horion.posts(author_id,community_id,title,body) values($1,$2,'Store scope post','Store scope body') returning id", [OUTSIDER, storeCommunity])).rows[0].id);
  await as('authenticated', OUTSIDER, "insert into horion.reports(reporter_id,post_id,reason) values($1,$2,'Please review member scope'),($1,$3,'Please review store scope')", [OUTSIDER, ownPost, storePost]);
  assert.deepEqual((await as('authenticated', MEMBER, 'select post_id from horion.reports')).rows, [{ post_id: ownPost }]);
  assert.deepEqual((await as('authenticated', STORE, 'select post_id from horion.reports')).rows, [{ post_id: storePost }]);
  assert.equal((await as('authenticated', OUTSIDER, 'select * from horion.reports')).rows.length, 2);
  assert.equal((await as('authenticated', OWNER, 'select * from horion.reports')).rows.length, 2);
  assert.equal((await as('authenticated', MEMBER, "update horion.reports set status='dismissed' where post_id=$1 returning id", [storePost])).rows.length, 0);
  assert.equal((await as('authenticated', OUTSIDER, "update horion.reports set status='dismissed' where post_id=$1 returning id", [ownPost])).rows.length, 0);
  assert.equal((await as('authenticated', MEMBER, "update horion.reports set status='dismissed' where post_id=$1 returning id", [ownPost])).rows.length, 1);
  await as('authenticated', MEMBER, "update horion.reports set status='open' where post_id=$1", [ownPost]);
});

test('moderation RPC atomically removes a scoped post and resolves its open reports, without crossing scopes', async () => {
  await denied(as('anon', null, 'select horion.moderate_reported_post($1)', [ownPost]));
  await denied(as('authenticated', NOT_JOINED, 'select horion.moderate_reported_post($1)', [ownPost]));
  await denied(as('authenticated', OUTSIDER, 'select horion.moderate_reported_post($1)', [ownPost]));
  await denied(as('authenticated', MEMBER, 'select horion.moderate_reported_post($1)', [storePost]));
  await as('authenticated', MEMBER, 'select horion.moderate_reported_post($1)', [ownPost]);
  assert.equal((await as('postgres', null, 'select status from horion.posts where id=$1', [ownPost])).rows[0].status, 'removed');
  assert.equal((await as('authenticated', MEMBER, 'select status from horion.reports where post_id=$1', [ownPost])).rows[0].status, 'resolved');
  assert.equal((await as('postgres', null, 'select status from horion.posts where id=$1', [storePost])).rows[0].status, 'published');
  assert.equal((await as('postgres', null, 'select status from horion.reports where post_id=$1', [storePost])).rows[0].status, 'open');
  assert.equal((await as('postgres', null, "select * from horion_private.audit_log where actor_id=$1 and entity='reports'", [MEMBER])).rows.length >= 3, true);
  await as('authenticated', OWNER, 'select horion.set_member_role($1,$2)', [STORE, 'moderator']);
  assert.equal((await as('authenticated', STORE, 'select * from horion.reports')).rows.length, 2);
  await as('authenticated', STORE, 'select horion.moderate_reported_post($1)', [storePost]);
  assert.equal((await as('postgres', null, 'select status from horion.reports where post_id=$1', [storePost])).rows[0].status, 'resolved');
});

test('moderation RPC rolls post removal back when resolving reports fails', async () => {
  const post = String((await as('authenticated', OUTSIDER, "insert into horion.posts(author_id,community_id,title,body) values($1,$2,'Rollback post','Rollback body') returning id", [OUTSIDER, ownCommunity])).rows[0].id);
  await as('authenticated', OUTSIDER, "insert into horion.reports(reporter_id,post_id,reason) values($1,$2,'Test atomic rollback')", [OUTSIDER, post]);
  await as('postgres', null, `create function horion_private.test_report_failure() returns trigger language plpgsql as $$ begin raise exception 'Simulated report persistence failure'; end; $$`);
  await db.exec('create trigger test_report_failure before update on horion.reports for each row execute function horion_private.test_report_failure()');
  await denied(as('authenticated', MEMBER, 'select horion.moderate_reported_post($1)', [post]), ['P0001']);
  assert.equal((await as('postgres', null, 'select status from horion.posts where id=$1', [post])).rows[0].status, 'published');
  assert.equal((await as('postgres', null, 'select status from horion.reports where post_id=$1', [post])).rows[0].status, 'open');
  await as('postgres', null, 'drop trigger test_report_failure on horion.reports');
  await db.exec('drop function horion_private.test_report_failure()');
});

test('deleting an existing shared Auth identity removes its pending assignment without creating Horion rows', async () => {
  await as('postgres', null, 'insert into horion_private.pending_role_assignments(user_id) values($1)', [DELETED]);
  await as('postgres', null, 'delete from auth.users where id=$1', [DELETED]);
  assert.equal((await as('postgres', null, 'select * from horion_private.pending_role_assignments where user_id=$1', [DELETED])).rows.length, 0);
  assert.equal((await as('postgres', null, 'select * from horion.profiles where id=$1', [DELETED])).rows.length, 0);
});
