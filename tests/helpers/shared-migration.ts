import { readFile, readdir } from 'node:fs/promises';

const directory = new URL('../../supabase/migrations/', import.meta.url);

/** A native remote migration may assign a version; discover its stable name. */
export async function loadSharedMigration() {
  const names = (await readdir(directory)).filter((name) =>
    /_horion_shared_foundation\.sql$/.test(name)
  );
  if (names.length !== 1)
    throw new Error(`Expected one Horion shared foundation migration; found ${names.length}.`);
  return readFile(new URL(names[0], directory), 'utf8');
}

/** Test the repository's complete active Horion chain, including follow-ups. */
export async function loadActiveHorionMigrations() {
  const names = (await readdir(directory)).filter((name) => name.endsWith('.sql')).sort();
  if (
    names.filter((name) => /_horion_shared_foundation\.sql$/.test(name)).length !== 1 ||
    names.some((name) => !/^\d+_horion_[a-z0-9_]+\.sql$/.test(name))
  ) {
    throw new Error(
      'Expected a versioned Horion migration chain with exactly one shared foundation.'
    );
  }
  return Promise.all(names.map((name) => readFile(new URL(name, directory), 'utf8')));
}
