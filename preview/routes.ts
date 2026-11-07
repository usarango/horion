import type { Locale } from '../lib/domain';

/** The same public product destinations as the canonical Next.js application. */
export const previewPages = [
  'home',
  'explore',
  'communities',
  'watches',
  'collection',
  'passport',
  'journal',
  'society',
  'profile',
  'notifications',
  'settings',
  'admin',
] as const;
export type PreviewPage = (typeof previewPages)[number];
export const PREVIEW_LOCALE_KEY = 'horion.preview.locale';

export type PreviewRoute =
  | { kind: 'redirect'; to: string; locale: Locale }
  | { kind: 'not-found'; locale: Locale }
  | {
      kind: 'page';
      locale: Locale;
      page: PreviewPage;
      query: string;
      sharedPost?: string;
      watchId?: string;
      authError: boolean;
    };

export function preferredPreviewLocale(
  saved?: string | null,
  browserLanguage?: string | null
): Locale {
  if (saved === 'en' || saved === 'pt-BR') return saved;
  return browserLanguage?.toLowerCase().startsWith('pt') ? 'pt-BR' : 'en';
}

/** Unknown destinations remain unknown; query strings never select a page. */
export function parsePreviewRoute(
  url: URL,
  preferences: { savedLocale?: string | null; browserLanguage?: string | null } = {}
): PreviewRoute {
  const preferred = preferredPreviewLocale(preferences.savedLocale, preferences.browserLanguage);
  if (url.pathname === '/')
    return { kind: 'redirect', locale: preferred, to: `/${preferred}${url.search}${url.hash}` };
  const path = url.pathname.replace(/\/$/, '');
  const segments = path.slice(1).split('/');
  const locale = segments[0];
  if (locale !== 'en' && locale !== 'pt-BR') return { kind: 'not-found', locale: preferred };
  const page = segments[1] || 'home';
  if (segments.length > 2 || !previewPages.includes(page as PreviewPage))
    return { kind: 'not-found', locale };
  return {
    kind: 'page',
    locale,
    page: page as PreviewPage,
    query: url.searchParams.get('q') || '',
    sharedPost: url.searchParams.get('post') || undefined,
    watchId: url.searchParams.get('watch') || undefined,
    authError: url.searchParams.get('auth') === 'failed',
  };
}

export function previewRoutePaths(): string[] {
  return ['en', 'pt-BR'].flatMap((locale) => [
    `/${locale}`,
    ...previewPages.map((page) => `/${locale}/${page}`),
  ]);
}
