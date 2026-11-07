import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import {
  getHorionClientOptions,
  getSupabaseConfig,
  isHorionAuthCookie,
} from './lib/supabase/config';

export async function proxy(request: NextRequest) {
  const forwardedHeaders = new Headers(request.headers);
  const prefix = request.nextUrl.pathname.split('/')[1];
  const locale = prefix === 'pt-BR' ? 'pt-BR' : 'en';
  forwardedHeaders.set('x-horion-locale', locale);
  const next = () => {
    const response = NextResponse.next({ request: { headers: forwardedHeaders } });
    if (prefix === 'en' || prefix === 'pt-BR') {
      response.cookies.set('horion-locale', locale, {
        path: '/',
        maxAge: 31536000,
        sameSite: 'lax',
        secure: request.nextUrl.protocol === 'https:',
      });
    }
    return response;
  };
  const config = getSupabaseConfig();
  if (!config) return next();
  let response = next();
  const supabase = createServerClient(config.url, config.key, {
    ...getHorionClientOptions(),
    cookies: {
      getAll: () => request.cookies.getAll().filter((cookie) => isHorionAuthCookie(cookie.name)),
      setAll(cookiesToSet, headers) {
        cookiesToSet = cookiesToSet.filter((cookie) => isHorionAuthCookie(cookie.name));
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        forwardedHeaders.set('cookie', request.headers.get('cookie') || '');
        response = next();
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        );
        Object.entries(headers ?? {}).forEach(([key, value]) =>
          response.headers.set(key, String(value))
        );
      },
    },
  });
  try {
    // Verifies token signatures; never trust getSession() as authorization.
    await supabase.auth.getClaims();
  } catch {
    // Public navigation remains available if Auth is unavailable. Private handlers
    // independently verify getUser(), fail closed, and return an explicit error.
  }
  response.headers.set('Cache-Control', 'private, no-store');
  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|images/|fonts/|.*\\.(?:svg|png|jpg|jpeg|webp|woff2)$).*)',
  ],
};
