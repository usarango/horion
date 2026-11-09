'use client';
import { createBrowserClient } from '@supabase/ssr';
import { getHorionClientOptions, getSupabaseConfig } from './config';

let client: ReturnType<typeof createBrowserClient> | null = null;

export function createClient() {
  const config = getSupabaseConfig();
  if (!config) return null;
  // Avoid the SSR package's global singleton, which could belong to another app.
  client ??= createBrowserClient(config.url, config.key, {
    ...getHorionClientOptions(),
    isSingleton: false,
  });
  return client;
}
