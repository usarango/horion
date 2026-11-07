import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';

test('baseline refuses an existing application before creating schemas or changing its data', async () => {
  const db = new PGlite();
  try {
    await db.exec(
      "create table public.existing_app_marker (value text); insert into public.existing_app_marker values ('preserved');"
    );
    const migration = await readFile(
      new URL('../supabase/migrations/20261106233423_horion_foundation.sql', import.meta.url),
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
