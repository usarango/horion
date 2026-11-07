import { notFound } from 'next/navigation';
import { ClubApp } from '@/components/club-app';
import type { Locale } from '@/lib/domain';
import { navigation } from '@/lib/i18n';
import { getSupabaseConfig } from '@/lib/supabase/config';
const routes = [
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
];
type Props = {
  params: Promise<{ locale: string; path?: string[] }>;
  searchParams: Promise<{ q?: string; post?: string; auth?: string; watch?: string }>;
};
export async function generateMetadata({ params }: Props) {
  const { locale, path } = await params;
  if (locale !== 'en' && locale !== 'pt-BR') return {};
  const page = path?.[0] || 'home';
  return { title: navigation[locale][page as keyof typeof navigation.en] || 'HORION' };
}
export default async function Page({ params, searchParams }: Props) {
  const { locale, path } = await params;
  const query = await searchParams;
  if (
    (locale !== 'en' && locale !== 'pt-BR') ||
    (path?.length || 0) > 1 ||
    !routes.includes(path?.[0] || 'home')
  )
    notFound();
  return (
    <ClubApp
      locale={locale as Locale}
      page={path?.[0] || 'home'}
      query={query.q || ''}
      sharedPost={query.post}
      backendConfigured={!!getSupabaseConfig()}
      authError={query.auth === 'failed'}
      watchId={query.watch}
    />
  );
}
