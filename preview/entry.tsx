import '../app/globals.css';
import { createRoot } from 'react-dom/client';
import { ClubApp } from '../components/club-app';
import NotFound from '../app/not-found';
import { parsePreviewRoute, PREVIEW_LOCALE_KEY } from './routes';

let savedLocale: string | null = null;
try {
  savedLocale = localStorage.getItem(PREVIEW_LOCALE_KEY);
} catch {
  /* Preference storage is optional. */
}
const route = parsePreviewRoute(new URL(window.location.href), {
  savedLocale,
  browserLanguage: navigator.language,
});

if (route.kind === 'redirect') {
  window.location.replace(route.to);
} else {
  document.documentElement.lang = route.locale;
  try {
    if (route.kind === 'page') localStorage.setItem(PREVIEW_LOCALE_KEY, route.locale);
    document.documentElement.dataset.theme =
      localStorage.getItem('horion-theme') === 'dark' ? 'dark' : 'light';
  } catch {
    /* Public preview still works without browser persistence. */
  }
  const root = document.getElementById('root');
  if (!root) throw new Error('The preview root element is missing.');
  createRoot(root).render(
    route.kind === 'not-found' ? (
      <NotFound />
    ) : (
      <ClubApp
        locale={route.locale}
        page={route.page}
        query={route.query}
        sharedPost={route.sharedPost}
        watchId={route.watchId}
        authError={route.authError}
        backendConfigured={false}
        publicPreview={true}
      />
    )
  );
}
