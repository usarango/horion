import type { Locale, PostType } from './domain';
import english from './messages/en.json';
import portuguese from './messages/pt-BR.json';

export const locales = ['en', 'pt-BR'] as const;
export type TranslationKey = keyof typeof english;
const messages: Record<Locale, Record<TranslationKey, string>> = {
  en: english,
  'pt-BR': portuguese,
};

export function translate(locale: Locale, key: TranslationKey): string {
  return messages[locale][key];
}

export function localizedPostType(type: PostType, locale: Locale): string {
  const keys: Record<PostType, TranslationKey> = {
    Photography: 'photography',
    Discussion: 'discussion',
    Review: 'review',
    Question: 'question',
  };
  return translate(locale, keys[type]);
}

function navigationFor(locale: Locale) {
  return {
    home: translate(locale, 'navigation.home'),
    explore: translate(locale, 'navigation.explore'),
    communities: translate(locale, 'communities'),
    watches: translate(locale, 'navigation.watches'),
    collection: translate(locale, 'my-collection'),
    passport: translate(locale, 'navigation.passport'),
    journal: translate(locale, 'navigation.journal'),
    society: translate(locale, 'navigation.society'),
    profile: translate(locale, 'navigation.profile'),
    notifications: translate(locale, 'navigation.notifications'),
    settings: translate(locale, 'navigation.settings'),
    admin: translate(locale, 'navigation.admin'),
  };
}
export const navigation = { en: navigationFor('en'), 'pt-BR': navigationFor('pt-BR') };

export function localizedDate(value: string, locale: Locale) {
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  }).format(new Date(value));
}
