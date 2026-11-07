function navigate(href: string, replace = false) {
  const destination = new URL(href, window.location.href);
  if (
    destination.origin !== window.location.origin ||
    !['http:', 'https:'].includes(destination.protocol)
  )
    throw new Error('Preview navigation requires a local page.');
  const path = `${destination.pathname}${destination.search}${destination.hash}`;
  if (replace) window.location.replace(path);
  else window.location.assign(path);
}

const router = {
  push: (href: string) => navigate(href),
  replace: (href: string) => navigate(href, true),
  refresh: () => window.location.reload(),
  back: () => window.history.back(),
  forward: () => window.history.forward(),
  prefetch: async (_href: string) => {},
};

/** Only navigation is adapted. The canonical Next.js hooks remain unchanged. */
export function useRouter() {
  return router;
}
