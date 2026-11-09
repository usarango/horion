import type { Metadata } from 'next';
import { headers } from 'next/headers';
import './globals.css';
export const metadata: Metadata = {
  title: { default: 'HORION — A shared passion for time', template: '%s | HORION' },
  description:
    'A home for everyone who loves watches. Discover the community, build your collection, and preserve the stories behind your watches.',
  robots: { index: false, follow: false },
};
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = (await headers()).get('x-horion-locale') === 'pt-BR' ? 'pt-BR' : 'en';
  return (
    <html lang={locale} suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
