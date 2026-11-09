import type { Locale } from './domain';
import english from './messages/live-en.json';
import portuguese from './messages/live-pt-BR.json';

export type LiveTranslationKey = keyof typeof english;

const messages: Record<Locale, Record<LiveTranslationKey, string>> = {
  en: english,
  'pt-BR': portuguese,
};

/** UI labels only. Member content remains in its original language. */
export function liveT(
  locale: Locale,
  key: LiveTranslationKey,
  values: Record<string, string | number> = {}
): string {
  return messages[locale][key].replace(/\{([a-zA-Z0-9_]+)\}/g, (token, name: string) =>
    Object.hasOwn(values, name) ? String(values[name]) : token
  );
}

export function liveDate(value: string, locale: Locale): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? ''
    : new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(date);
}
