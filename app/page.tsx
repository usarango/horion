import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
export default async function Index() {
  const preferred = (await cookies()).get('horion-locale')?.value;
  if (preferred === 'en' || preferred === 'pt-BR') redirect(`/${preferred}`);
  const language = (await headers()).get('accept-language') || '';
  redirect(language.toLowerCase().startsWith('pt') ? '/pt-BR' : '/en');
}
