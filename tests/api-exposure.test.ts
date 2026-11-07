import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';

async function setup() {
  const db = new PGlite();
  await db.exec(
    'create role authenticator; create schema horion; create schema horion_private; create table horion.profiles(id uuid);'
  );
  const sql = await readFile(
    new URL(
      '../supabase/operations/20261107004936_horion_shared_api_exposure.sql',
      import.meta.url
    ),
    'utf8'
  );
  return { db, sql };
}
async function configured(db: PGlite) {
  const result = await db.query<{ rolconfig: string[] }>(
    'select rolconfig from pg_roles where rolname=$1',
    ['authenticator']
  );
  return result.rows[0].rolconfig;
}

test('shared Data API exposure appends Horion and keeps public as the default', async () => {
  const { db, sql } = await setup();
  try {
    await db.exec(sql);
    assert.deepEqual(await configured(db), ['pgrst.db_schemas=public,graphql_public,horion']);
    await db.exec(sql);
    assert.deepEqual(await configured(db), ['pgrst.db_schemas=public,graphql_public,horion']);
  } finally {
    await db.close();
  }
});

test('shared Data API exposure preserves every existing role-configured schema and other settings', async () => {
  const { db, sql } = await setup();
  try {
    await db.exec(
      "alter role authenticator set pgrst.db_schemas='public,graphql_public,another_app'; alter role authenticator set pgrst.db_max_rows='500';"
    );
    await db.exec(sql);
    const config = await configured(db);
    assert.ok(config.includes('pgrst.db_schemas=public,graphql_public,another_app,horion'));
    assert.ok(config.includes('pgrst.db_max_rows=500'));
  } finally {
    await db.close();
  }
});

test('shared Data API exposure refuses a database-scoped override without changing it', async () => {
  const { db, sql } = await setup();
  try {
    const result = await db.query<{ name: string }>('select current_database() as name');
    const database = result.rows[0].name.replaceAll('"', '""');
    await db.exec(
      `alter role authenticator in database "${database}" set pgrst.db_schemas='public,existing_database_app'`
    );
    await assert.rejects(db.exec(sql), /Database-scoped API override requires review/);
    await db.exec('rollback');
    assert.equal(await configured(db), null);
    const settings = await db.query<{ setconfig: string[] }>(
      'select setconfig from pg_db_role_setting where setrole=(select oid from pg_roles where rolname=$1)',
      ['authenticator']
    );
    assert.deepEqual(settings.rows[0].setconfig, ['pgrst.db_schemas=public,existing_database_app']);
  } finally {
    await db.close();
  }
});
