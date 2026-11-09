import 'server-only';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { getHorionClientOptions, getSupabaseConfig, isHorionAuthCookie } from './config';

/** Uses the requesting user's JWT: RLS remains effective; no service key. */
export async function createClient() {
  const config = getSupabaseConfig();
  if (!config) return null;
  const cookieStore = await cookies();
  return createServerClient(config.url, config.key, {
    ...getHorionClientOptions(),
    cookies: {
      getAll: () => cookieStore.getAll().filter((cookie) => isHorionAuthCookie(cookie.name)),
      setAll(cookiesToSet) {
        try {
          cookiesToSet
            .filter((cookie) => isHorionAuthCookie(cookie.name))
            .forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // A Server Component cannot write cookies; proxy.ts refreshes them.
        }
      },
    },
  });
}
