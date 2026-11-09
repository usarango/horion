import '../app/globals.css';
import { createRoot } from 'react-dom/client';
import { ClubApp } from '../components/club-app';
import NotFound from '../app/not-found';
import { parsePreviewRoute, PREVIEW_LOCALE_KEY } from './routes';

declare const __HORION_SIGNUP_ENABLED__: boolean;

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
    /* Theme and language preferences are optional; product records stay remote. */
  }
  const root = document.getElementById('root');
  if (!root) throw new Error('The application root element is missing.');
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
        backendConfigured={true}
        signupEnabled={__HORION_SIGNUP_ENABLED__}
      />
    )
  );
}
