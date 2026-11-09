export const HORION_SCHEMA = 'horion';
export const HORION_AUTH_STORAGE_KEY = 'horion-auth';

/** Isolate Horion's Data API and session from other apps on the shared project. */
export function getHorionClientOptions() {
  return {
    db: { schema: HORION_SCHEMA },
    auth: { storageKey: HORION_AUTH_STORAGE_KEY },
    cookieOptions: {
      name: HORION_AUTH_STORAGE_KEY,
      path: '/',
      sameSite: 'lax' as const,
      secure: process.env.NODE_ENV === 'production',
    },
  };
}

export function isHorionAuthCookie(name: string) {
  return (
    name === HORION_AUTH_STORAGE_KEY ||
    name.startsWith(`${HORION_AUTH_STORAGE_KEY}.`) ||
    name.startsWith(`${HORION_AUTH_STORAGE_KEY}-`)
  );
}

/** Server-only opt-in; existing shared-project identities can always sign in. */
export function sharedSignupEnabled() {
  return process.env.HORION_ALLOW_SHARED_SIGNUP === 'true';
}

export function getSupabaseConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return null;
  try {
    const parsed = new URL(url);
    const localHttp =
      parsed.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname);
    if (
      (parsed.protocol !== 'https:' && !localHttp) ||
      parsed.username ||
      parsed.password ||
      parsed.search ||
      parsed.hash
    )
      return null;
  } catch {
    return null;
  }
  return { url: url.replace(/\/$/, ''), key };
}
