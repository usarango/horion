import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { loadActiveHorionMigrations, loadSharedMigration } from './helpers/shared-migration';

test('baseline refuses an existing application before creating schemas or changing its data', async () => {
  const db = new PGlite();
  try {
    await db.exec(
      "create table public.existing_app_marker (value text); insert into public.existing_app_marker values ('preserved');"
    );
    const migration = await readFile(
      new URL('../docs/archive/20261106233423_horion_foundation.sql.txt', import.meta.url),
      'utf8'
    );
    await assert.rejects(db.exec(migration), /requires an empty public schema/);
    await db.exec('rollback');
    assert.deepEqual((await db.query('select value from public.existing_app_marker')).rows, [
      { value: 'preserved' },
    ]);
    assert.equal(
      (await db.query("select nspname from pg_namespace where nspname='app_private'")).rows.length,
      0
    );
    assert.deepEqual(
      (await db.query("select tablename from pg_tables where schemaname='public'")).rows,
      [{ tablename: 'existing_app_marker' }]
    );
  } finally {
    await db.close();
  }
});

// This fixture deliberately models another application in the same Supabase project.
// Existing Storage policies are dangerously broad on purpose: Horion must protect its
// own namespaces even when a different application's permissive policy also matches.
const MEMBER_A = 'aaaaaaaa-1111-4111-8111-111111111111';
const MEMBER_B = 'bbbbbbbb-2222-4222-8222-222222222222';
const NEW_MEMBER = 'cccccccc-3333-4333-8333-333333333333';
const WATCH_A = 'dddddddd-4444-4444-8444-444444444444';
const PASSPORT_A = 'eeeeeeee-5555-4555-8555-555555555555';
const DOCUMENT_A = 'ffffffff-6666-4666-8666-666666666666';
const DOCUMENT_PATH_A = `${MEMBER_A}/${PASSPORT_A}/private-receipt.pdf`;
const EXISTING_OBJECT = '11111111-7777-4777-8777-777777777777';

async function makeSharedProject() {
  const db = new PGlite();
  await db.exec(`
    create role anon;
    create role authenticated;
    create schema auth;
    create schema storage;
    create table auth.users (
      id uuid primary key,
      raw_user_meta_data jsonb not null default '{}'
    );
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;
    grant usage on schema auth, storage to anon, authenticated;
    grant execute on function auth.uid() to anon, authenticated;

    create table public.restaurants (
      id uuid primary key,
      name text not null,
      is_open boolean not null default true
    );
    create table public.profiles (
      id uuid primary key references auth.users(id) on delete cascade,
      restaurant_id uuid references public.restaurants(id),
      name text not null,
      role text not null default 'customer'
    );
    create table public.orders (
      id uuid primary key,
      restaurant_id uuid not null references public.restaurants(id),
      customer_id uuid not null references public.profiles(id),
      status text not null default 'received',
      total_cents integer not null check (total_cents >= 0)
    );
    alter table public.restaurants enable row level security;
    alter table public.profiles enable row level security;
    alter table public.orders enable row level security;
    grant select on public.restaurants to anon;
    grant select, insert, update, delete on public.restaurants, public.profiles, public.orders to authenticated;
    create policy rango_restaurants_read on public.restaurants for select to anon, authenticated using (true);
    create policy rango_profiles_owner on public.profiles for all to authenticated
      using (id = (select auth.uid())) with check (id = (select auth.uid()));
    create policy rango_orders_owner on public.orders for all to authenticated
      using (customer_id = (select auth.uid())) with check (customer_id = (select auth.uid()));

    create function public.handle_new_user() returns trigger
    language plpgsql security definer set search_path = '' as $$
    begin
      insert into public.profiles (id, name)
      values (new.id, coalesce(new.raw_user_meta_data->>'name', 'Rango customer'));
      return new;
    end;
    $$;
    revoke all on function public.handle_new_user() from public;
    create trigger on_auth_user_created after insert on auth.users
      for each row execute function public.handle_new_user();

    create table storage.buckets (
      id text primary key,
      name text not null,
      public boolean not null default false,
      file_size_limit bigint,
      allowed_mime_types text[],
      metadata jsonb not null default '{}'
    );
    create table storage.objects (
      id uuid primary key default gen_random_uuid(),
      bucket_id text not null references storage.buckets(id),
      name text not null,
      owner_id text,
      metadata jsonb not null default '{}',
      unique (bucket_id, name)
    );
    alter table storage.objects enable row level security;
    grant select on storage.buckets to anon, authenticated;
    grant select, insert, update, delete on storage.objects to anon, authenticated;
    create function storage.foldername(text) returns text[] language sql immutable as $$
      select (string_to_array($1, '/'))[1:array_length(string_to_array($1, '/'), 1)-1]
    $$;
    create policy rango_storage_anon_read on storage.objects as permissive for select to anon using (true);
    create policy rango_storage_read on storage.objects as permissive for select to authenticated using (true);
    create policy rango_storage_insert on storage.objects as permissive for insert to public with check (true);
    create policy rango_storage_update on storage.objects as permissive for update to public using (true) with check (true);
    create policy rango_storage_delete on storage.objects as permissive for delete to public using (true);

    insert into public.restaurants(id,name)
      values ('99999999-aaaa-4aaa-8aaa-aaaaaaaaaaaa','Rango existing restaurant');
    insert into auth.users(id,raw_user_meta_data)
      values ('${MEMBER_A}','{"name":"Existing Rango member A"}'),
             ('${MEMBER_B}','{"name":"Existing Rango member B"}');
    insert into public.orders(id,restaurant_id,customer_id,total_cents)
      values ('88888888-bbbb-4bbb-8bbb-bbbbbbbbbbbb','99999999-aaaa-4aaa-8aaa-aaaaaaaaaaaa','${MEMBER_A}',2590);
    insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types,metadata)
      values ('rango-assets','Rango existing assets',true,4194304,array['image/jpeg','image/png'],'{"owner":"rango","sentinel":"preserve"}');
    insert into storage.objects(id,bucket_id,name,owner_id,metadata)
      values ('${EXISTING_OBJECT}','rango-assets','restaurants/existing-menu.png','${MEMBER_A}','{"sentinel":"preserve"}');
    -- An unrelated application may have established dangerous global defaults.
    -- Horion must revoke those inherited privileges on its new tables only.
    alter default privileges grant all on tables to public;
  `);
  return db;
}

async function queryAs<T extends Record<string, unknown> = Record<string, unknown>>(
  db: PGlite,
  role: 'anon' | 'authenticated' | 'postgres',
  user: string | null,
  sql: string,
  params: unknown[] = []
) {
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [user ?? '']);
  if (role !== 'postgres') await db.exec(`set role ${role}`);
  return db.query<T>(sql, params);
}

async function existingProjectSnapshot(db: PGlite) {
  await db.exec('reset role');
  const definitions = await db.query(`
    select ns.nspname as schema_name, c.relname, c.relkind, c.relrowsecurity,
      c.relforcerowsecurity, c.relacl::text,
      (select jsonb_agg(jsonb_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod),
        'not_null',a.attnotnull,'default',pg_get_expr(d.adbin,d.adrelid)) order by a.attnum)
       from pg_attribute a left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum
       where a.attrelid=c.oid and a.attnum>0 and not a.attisdropped) as columns,
      (select jsonb_agg(pg_get_constraintdef(con.oid) order by con.conname)
       from pg_constraint con where con.conrelid=c.oid) as constraints,
      (select jsonb_agg(pg_get_indexdef(i.indexrelid) order by i.indexrelid::regclass::text)
       from pg_index i where i.indrelid=c.oid) as indexes
    from pg_class c join pg_namespace ns on ns.oid=c.relnamespace
    where c.relkind='r' and ((ns.nspname='public' and c.relname in ('profiles','restaurants','orders'))
      or (ns.nspname='auth' and c.relname='users')
      or (ns.nspname='storage' and c.relname in ('buckets','objects')))
    order by ns.nspname,c.relname
  `);
  const publicObjects = await db.query(`
    select c.relname,c.relkind from pg_class c join pg_namespace ns on ns.oid=c.relnamespace
    where ns.nspname='public' order by c.relname,c.relkind
  `);
  const functions = await db.query(`
    select ns.nspname,p.proname,p.proacl::text,pg_get_functiondef(p.oid) as definition
    from pg_proc p join pg_namespace ns on ns.oid=p.pronamespace
    where ns.nspname='public'
       or (ns.nspname='auth' and p.proname='uid')
       or (ns.nspname='storage' and p.proname='foldername')
    order by ns.nspname,p.proname
  `);
  const policies = await db.query(`
    select ns.nspname,c.relname,p.polname,p.polpermissive,p.polcmd,p.polroles::text,
      pg_get_expr(p.polqual,p.polrelid) as using_expression,
      pg_get_expr(p.polwithcheck,p.polrelid) as check_expression
    from pg_policy p join pg_class c on c.oid=p.polrelid join pg_namespace ns on ns.oid=c.relnamespace
    where p.polname like 'rango_%' order by ns.nspname,c.relname,p.polname
  `);
  const triggers = await db.query(`
    select t.tgname,pg_get_triggerdef(t.oid) as definition,t.tgenabled
    from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace ns on ns.oid=c.relnamespace
    where ns.nspname='auth' and c.relname='users' and not t.tgisinternal order by t.tgname
  `);
  const defaultAcls = await db.query(`
    select d.defaclrole::regrole::text as owner_role,
      coalesce(n.nspname,'*') as schema_name,d.defaclobjtype,d.defaclacl::text
    from pg_default_acl d left join pg_namespace n on n.oid=d.defaclnamespace
    order by owner_role,schema_name,d.defaclobjtype
  `);
  const restaurants = await db.query('select * from public.restaurants order by id');
  const profiles = await db.query('select * from public.profiles order by id');
  const orders = await db.query('select * from public.orders order by id');
  const buckets = await db.query("select * from storage.buckets where id='rango-assets'");
  const objects = await db.query(
    "select * from storage.objects where bucket_id='rango-assets' order by id"
  );
  return {
    definitions: definitions.rows,
    publicObjects: publicObjects.rows,
    functions: functions.rows,
    policies: policies.rows,
    triggers: triggers.rows,
    defaultAcls: defaultAcls.rows,
    restaurants: restaurants.rows,
    profiles: profiles.rows,
    orders: orders.rows,
    buckets: buckets.rows,
    objects: objects.rows,
  };
}

async function expectPermissionDenied(operation: Promise<unknown>) {
  await assert.rejects(operation, (error: unknown) => {
    assert.ok(error && typeof error === 'object' && 'code' in error);
    assert.ok(['42501', '23503', '23514'].includes(String(error.code)), String(error.code));
    return true;
  });
}

async function protectedPreflight(db: PGlite) {
  await db.exec('reset role');
  const sql = await readFile(new URL('../supabase/preflight_shared.sql', import.meta.url), 'utf8');
  const results = await db.exec(sql);
  const row = results
    .flatMap((result) => result.rows)
    .find((result) => 'protected_fingerprint' in result);
  assert.ok(row, 'tracked preflight SQL must produce a fingerprint');
  return {
    fingerprint: row.protected_fingerprint,
    components: row.protected_components,
  };
}

async function applySharedMigration(db: PGlite) {
  const migrations = await loadActiveHorionMigrations();
  assert.ok(migrations.length > 0, 'active Horion migration chain must exist');
  for (const migration of migrations) {
    assert.ok(migration.trim().length > 0, 'every active Horion migration must be populated');
    await db.exec(migration);
  }
}

async function onboard(db: PGlite, user: string, username: string) {
  await queryAs(
    db,
    'authenticated',
    user,
    'select horion.onboard_member(p_username => $1, p_display_name => $2, p_locale => $3)',
    [username, `Horion ${username}`, 'en']
  );
}

async function seedPrivatePassport(db: PGlite) {
  await onboard(db, MEMBER_A, 'member_a');
  await onboard(db, MEMBER_B, 'member_b');
  await queryAs(
    db,
    'postgres',
    null,
    `insert into horion.user_watches(id,owner_id,label) values($1,$2,'Private Horion watch')`,
    [WATCH_A, MEMBER_A]
  );
  await db.query('insert into horion.passports(id,watch_id,owner_id) values($1,$2,$3)', [
    PASSPORT_A,
    WATCH_A,
    MEMBER_A,
  ]);
  await db.query(
    `insert into horion.passport_documents(id,passport_id,owner_id,storage_path,file_name,mime_type,size_bytes)
    values($1,$2,$3,$4,'private-receipt.pdf','application/pdf',120)`,
    [DOCUMENT_A, PASSPORT_A, MEMBER_A, DOCUMENT_PATH_A]
  );
  await db.query(
    `insert into storage.objects(bucket_id,name,owner_id)
    values('horion-passport-documents',$1,$2)`,
    [DOCUMENT_PATH_A, MEMBER_A]
  );
}

test('shared migration preserves every existing Rango definition, grant, policy, trigger, bucket and sentinel row', async () => {
  const db = await makeSharedProject();
  try {
    const before = await existingProjectSnapshot(db);
    const fingerprintBefore = await protectedPreflight(db);
    await applySharedMigration(db);
    assert.deepEqual(await existingProjectSnapshot(db), before);
    assert.deepEqual(await protectedPreflight(db), fingerprintBefore);
    assert.deepEqual(
      (
        await db.query(
          "select nspname from pg_namespace where nspname in ('horion','horion_private') order by nspname"
        )
      ).rows,
      [{ nspname: 'horion' }, { nspname: 'horion_private' }]
    );
    const rls = await db.query(
      "select relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('horion','horion_private') and c.relkind='r' and not c.relrowsecurity"
    );
    assert.deepEqual(rls.rows, []);
  } finally {
    await db.close();
  }
});

test('shared Auth signup invokes only the existing Rango hook and Horion membership requires explicit onboarding', async () => {
  const db = await makeSharedProject();
  try {
    await applySharedMigration(db);
    assert.equal((await db.query('select * from horion.profiles')).rows.length, 0);
    await db.query(
      'insert into auth.users(id,raw_user_meta_data) values($1,\'{"name":"New Rango customer"}\')',
      [NEW_MEMBER]
    );
    assert.deepEqual(
      (await db.query('select name from public.profiles where id=$1', [NEW_MEMBER])).rows,
      [{ name: 'New Rango customer' }]
    );
    assert.equal((await db.query('select * from horion.profiles')).rows.length, 0);
    const hooks = await db.query(
      "select tgname from pg_trigger where tgrelid='auth.users'::regclass and not tgisinternal order by tgname"
    );
    assert.deepEqual(hooks.rows, [{ tgname: 'on_auth_user_created' }]);
    await expectPermissionDenied(
      queryAs(db, 'anon', null, "select horion.onboard_member('anonymous_member','Anonymous','en')")
    );
    await onboard(db, NEW_MEMBER, 'new_horion_member');
    assert.deepEqual(
      (
        await queryAs(
          db,
          'authenticated',
          NEW_MEMBER,
          'select id,username,display_name,locale from horion.profiles where id=$1',
          [NEW_MEMBER]
        )
      ).rows,
      [
        {
          id: NEW_MEMBER,
          username: 'new_horion_member',
          display_name: 'Horion new_horion_member',
          locale: 'en',
        },
      ]
    );
    assert.deepEqual(
      (
        await queryAs(db, 'postgres', null, 'select name from public.profiles where id=$1', [
          NEW_MEMBER,
        ])
      ).rows,
      [{ name: 'New Rango customer' }]
    );
  } finally {
    await db.close();
  }
});

test('restrictive Horion Storage guards keep Passport documents private despite existing permissive reads', async () => {
  const db = await makeSharedProject();
  try {
    await applySharedMigration(db);
    await seedPrivatePassport(db);
    for (const [role, user] of [
      ['anon', null],
      ['authenticated', MEMBER_B],
    ] as const) {
      assert.deepEqual(
        (
          await queryAs(
            db,
            role,
            user,
            "select name from storage.objects where bucket_id='horion-passport-documents'"
          )
        ).rows,
        []
      );
    }
    assert.deepEqual(
      (
        await queryAs(
          db,
          'authenticated',
          MEMBER_A,
          "select name from storage.objects where bucket_id='horion-passport-documents'"
        )
      ).rows,
      [{ name: DOCUMENT_PATH_A }]
    );
    assert.deepEqual(
      (await queryAs(db, 'authenticated', MEMBER_B, 'select * from horion.passport_documents'))
        .rows,
      []
    );
    await queryAs(
      db,
      'postgres',
      null,
      "insert into storage.objects(bucket_id,name,owner_id) values('horion-post-media',$1,$2)",
      [`${MEMBER_A}/orphan-photo.jpg`, MEMBER_A]
    );
    assert.deepEqual(
      (
        await queryAs(
          db,
          'anon',
          null,
          "select name from storage.objects where bucket_id='horion-post-media'"
        )
      ).rows,
      []
    );
    const bucket = await queryAs(
      db,
      'postgres',
      null,
      "select public from storage.buckets where id='horion-passport-documents'"
    );
    assert.equal(bucket.rows[0].public, false);
  } finally {
    await db.close();
  }
});

test('restrictive Horion Storage guards reject cross-user uploads and moving an existing Rango object into a private bucket', async () => {
  const db = await makeSharedProject();
  try {
    await applySharedMigration(db);
    await seedPrivatePassport(db);
    await expectPermissionDenied(
      queryAs(
        db,
        'authenticated',
        MEMBER_B,
        "insert into storage.objects(bucket_id,name,owner_id) values('horion-passport-documents',$1,$2)",
        [`${MEMBER_A}/${PASSPORT_A}/forged.pdf`, MEMBER_B]
      )
    );
    await expectPermissionDenied(
      queryAs(
        db,
        'authenticated',
        MEMBER_B,
        "insert into storage.objects(bucket_id,name,owner_id) values('horion-passport-documents',$1,$2)",
        [`${MEMBER_B}/${PASSPORT_A}/forged.pdf`, MEMBER_B]
      )
    );
    await expectPermissionDenied(
      queryAs(
        db,
        'authenticated',
        MEMBER_B,
        "update storage.objects set bucket_id='horion-passport-documents',name=$1 where id=$2 returning id",
        [`${MEMBER_A}/${PASSPORT_A}/moved.pdf`, EXISTING_OBJECT]
      )
    );
    const ownPath = `${MEMBER_A}/${PASSPORT_A}/owner-upload.pdf`;
    const own = await queryAs(
      db,
      'authenticated',
      MEMBER_A,
      "insert into storage.objects(bucket_id,name,owner_id) values('horion-passport-documents',$1,$2) returning name",
      [ownPath, MEMBER_A]
    );
    assert.deepEqual(own.rows, [{ name: ownPath }]);
  } finally {
    await db.close();
  }
});

test('restrictive Horion Storage guards prevent cross-user update and deletion under existing broad policies', async () => {
  const db = await makeSharedProject();
  try {
    await applySharedMigration(db);
    await seedPrivatePassport(db);
    assert.deepEqual(
      (
        await queryAs(
          db,
          'authenticated',
          MEMBER_B,
          "update storage.objects set name=$1 where bucket_id='horion-passport-documents' returning id",
          [`${MEMBER_B}/stolen.pdf`]
        )
      ).rows,
      []
    );
    assert.deepEqual(
      (
        await queryAs(
          db,
          'authenticated',
          MEMBER_B,
          "delete from storage.objects where bucket_id='horion-passport-documents' returning id"
        )
      ).rows,
      []
    );
    assert.deepEqual(
      (
        await queryAs(
          db,
          'authenticated',
          MEMBER_A,
          "select name from storage.objects where bucket_id='horion-passport-documents'"
        )
      ).rows,
      [{ name: DOCUMENT_PATH_A }]
    );
  } finally {
    await db.close();
  }
});

test('existing Rango bucket read, upload, update and deletion behavior remains unchanged', async () => {
  const db = await makeSharedProject();
  try {
    await applySharedMigration(db);
    assert.deepEqual(
      (
        await queryAs(
          db,
          'anon',
          null,
          "select name from storage.objects where bucket_id='rango-assets'"
        )
      ).rows,
      [{ name: 'restaurants/existing-menu.png' }]
    );
    const inserted = await queryAs(
      db,
      'authenticated',
      MEMBER_B,
      "insert into storage.objects(bucket_id,name,owner_id) values('rango-assets','members/new-menu.png',$1) returning id",
      [MEMBER_B]
    );
    const id = inserted.rows[0].id;
    assert.deepEqual(
      (
        await queryAs(
          db,
          'authenticated',
          MEMBER_B,
          "update storage.objects set name='members/updated-menu.png' where id=$1 returning name",
          [id]
        )
      ).rows,
      [{ name: 'members/updated-menu.png' }]
    );
    assert.deepEqual(
      (
        await queryAs(
          db,
          'authenticated',
          MEMBER_B,
          'delete from storage.objects where id=$1 returning id',
          [id]
        )
      ).rows,
      [{ id }]
    );
    assert.deepEqual(
      (
        await queryAs(
          db,
          'anon',
          null,
          "select name from storage.objects where bucket_id='rango-assets'"
        )
      ).rows,
      [{ name: 'restaurants/existing-menu.png' }]
    );
    assert.deepEqual(
      (await queryAs(db, 'authenticated', MEMBER_A, 'select total_cents from public.orders')).rows,
      [{ total_cents: 2590 }]
    );
  } finally {
    await db.close();
  }
});

test('a Horion schema collision aborts transaction before altering any existing project object', async () => {
  const db = await makeSharedProject();
  try {
    await db.exec(
      "create schema horion; create table horion.sentinel(value text); insert into horion.sentinel values('preserved')"
    );
    const before = await existingProjectSnapshot(db);
    const migration = await loadSharedMigration();
    await assert.rejects(db.exec(migration), /horion|already exists|collision/i);
    await db.exec('rollback');
    assert.deepEqual(await existingProjectSnapshot(db), before);
    assert.deepEqual((await db.query('select * from horion.sentinel')).rows, [
      { value: 'preserved' },
    ]);
    assert.deepEqual(
      (await db.query("select nspname from pg_namespace where nspname='horion_private'")).rows,
      []
    );
    assert.deepEqual(
      (await db.query("select id from storage.buckets where id like 'horion-%'")).rows,
      []
    );
  } finally {
    await db.close();
  }
});

test('anonymous Horion writes are denied even when legacy Storage policies grant writes to PUBLIC', async () => {
  const db = await makeSharedProject();
  try {
    await applySharedMigration(db);
    await seedPrivatePassport(db);
    await expectPermissionDenied(
      queryAs(
        db,
        'anon',
        null,
        "insert into storage.objects(bucket_id,name) values('horion-passport-documents',$1)",
        [`${MEMBER_A}/${PASSPORT_A}/anonymous.pdf`]
      )
    );
    await expectPermissionDenied(
      queryAs(
        db,
        'anon',
        null,
        "insert into storage.objects(bucket_id,name) values('horion-post-media',$1)",
        [`${MEMBER_A}/anonymous.jpg`]
      )
    );
    assert.deepEqual(
      (
        await queryAs(
          db,
          'anon',
          null,
          "delete from storage.objects where bucket_id='horion-passport-documents' returning id"
        )
      ).rows,
      []
    );
    assert.deepEqual(
      (
        await queryAs(
          db,
          'anon',
          null,
          "update storage.objects set name='anonymous-change.pdf' where bucket_id='horion-passport-documents' returning id"
        )
      ).rows,
      []
    );
    await expectPermissionDenied(
      queryAs(
        db,
        'anon',
        null,
        "update storage.objects set bucket_id='horion-passport-documents',name=$1 where id=$2 returning id",
        [`${MEMBER_A}/${PASSPORT_A}/anonymous-move.pdf`, EXISTING_OBJECT]
      )
    );
    const legacy = await queryAs(
      db,
      'anon',
      null,
      "insert into storage.objects(bucket_id,name) values('rango-assets','legacy-anonymous.png') returning id"
    );
    const legacyId = legacy.rows[0].id;
    assert.deepEqual(
      (
        await queryAs(
          db,
          'anon',
          null,
          "update storage.objects set name='legacy-anonymous-updated.png' where id=$1 returning id",
          [legacyId]
        )
      ).rows,
      [{ id: legacyId }]
    );
    assert.deepEqual(
      (
        await queryAs(db, 'anon', null, 'delete from storage.objects where id=$1 returning id', [
          legacyId,
        ])
      ).rows,
      [{ id: legacyId }]
    );
  } finally {
    await db.close();
  }
});

test('a Horion bucket ID collision rolls back both schemas and preserves the existing bucket and application', async () => {
  const db = await makeSharedProject();
  try {
    await db.query(`insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types,metadata)
      values('horion-passport-documents','Existing unrelated bucket',true,2048,array['text/plain'],'{"sentinel":"keep-existing-bucket"}')`);
    const bucketBefore = await db.query(
      "select * from storage.buckets where id='horion-passport-documents'"
    );
    const projectBefore = await existingProjectSnapshot(db);
    const migration = await loadSharedMigration();
    await assert.rejects(db.exec(migration), (error: unknown) => {
      assert.ok(error && typeof error === 'object' && 'code' in error);
      assert.equal(error.code, '23505');
      return true;
    });
    await db.exec('rollback');
    assert.deepEqual(await existingProjectSnapshot(db), projectBefore);
    assert.deepEqual(
      (await db.query("select * from storage.buckets where id='horion-passport-documents'")).rows,
      bucketBefore.rows
    );
    assert.deepEqual(
      (
        await db.query(
          "select nspname from pg_namespace where nspname in ('horion','horion_private')"
        )
      ).rows,
      []
    );
    assert.deepEqual(
      (await db.query("select id from storage.buckets where id='horion-post-media'")).rows,
      []
    );
  } finally {
    await db.close();
  }
});

test('global default grants to PUBLIC cannot expose Horion private tables or future billing records', async () => {
  const db = await makeSharedProject();
  try {
    const defaultsBefore = await db.query<{ defaclacl: string }>(
      'select defaclrole,defaclnamespace,defaclobjtype,defaclacl::text from pg_default_acl order by oid'
    );
    assert.ok(
      defaultsBefore.rows.some((row) => String(row.defaclacl).includes('=arwdDxt')),
      'fixture must establish a global PUBLIC table grant'
    );
    await applySharedMigration(db);
    const defaultsAfter = await db.query(
      'select defaclrole,defaclnamespace,defaclobjtype,defaclacl::text from pg_default_acl order by oid'
    );
    assert.deepEqual(defaultsAfter.rows, defaultsBefore.rows);
    const forbidden = await db.query(`
      select r.role_name, n.nspname, c.relname, p.privilege
      from pg_class c join pg_namespace n on n.oid=c.relnamespace
      cross join (values ('anon'),('authenticated')) r(role_name)
      cross join (values ('SELECT'),('INSERT'),('UPDATE'),('DELETE'),('TRUNCATE'),('REFERENCES'),('TRIGGER')) p(privilege)
      where c.relkind='r'
        and (n.nspname='horion_private' or (n.nspname='horion' and c.relname='billing_events'))
        and has_table_privilege(r.role_name,c.oid,p.privilege)
      order by r.role_name,n.nspname,c.relname,p.privilege
    `);
    assert.deepEqual(forbidden.rows, []);
    for (const [role, user] of [
      ['anon', null],
      ['authenticated', MEMBER_B],
    ] as const) {
      await expectPermissionDenied(
        queryAs(db, role, user, 'select * from horion_private.user_roles')
      );
      await expectPermissionDenied(
        queryAs(db, role, user, 'select * from horion_private.audit_log')
      );
      await expectPermissionDenied(queryAs(db, role, user, 'select * from horion.billing_events'));
    }
    const intendedPublicRead = await queryAs(
      db,
      'postgres',
      null,
      "select has_table_privilege('anon','horion.profiles','SELECT') as allowed"
    );
    assert.equal(intendedPublicRead.rows[0].allowed, true);
  } finally {
    await db.close();
  }
});

test('shared migration fails closed if Storage objects are missing or their RLS is disabled', async () => {
  for (const state of ['missing', 'rls-disabled'] as const) {
    const db = await makeSharedProject();
    try {
      await db.exec(
        state === 'missing'
          ? 'drop table storage.objects'
          : 'alter table storage.objects disable row level security'
      );
      const bucketsBefore = await db.query('select * from storage.buckets order by id');
      const ordersBefore = await db.query('select * from public.orders order by id');
      const publicProfilesBefore = await db.query('select * from public.profiles order by id');
      const migration = await loadSharedMigration();
      await assert.rejects(db.exec(migration), /storage\.objects with RLS enabled/i);
      await db.exec('rollback');
      assert.deepEqual(
        (await db.query('select * from storage.buckets order by id')).rows,
        bucketsBefore.rows
      );
      assert.deepEqual(
        (await db.query('select * from public.orders order by id')).rows,
        ordersBefore.rows
      );
      assert.deepEqual(
        (await db.query('select * from public.profiles order by id')).rows,
        publicProfilesBefore.rows
      );
      assert.deepEqual(
        (
          await db.query(
            "select nspname from pg_namespace where nspname in ('horion','horion_private')"
          )
        ).rows,
        []
      );
      const storageState = await db.query<{ relrowsecurity: boolean }>(
        "select relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='storage' and c.relname='objects'"
      );
      assert.deepEqual(storageState.rows, state === 'missing' ? [] : [{ relrowsecurity: false }]);
    } finally {
      await db.close();
    }
  }
});
