import test from 'node:test';
import assert from 'node:assert/strict';
import { parsePreviewRoute, preferredPreviewLocale, previewRoutePaths } from '../preview/routes';

test('public preview respects a manual language preference before browser detection', () => {
  assert.equal(preferredPreviewLocale('en', 'pt-BR'), 'en');
  assert.equal(preferredPreviewLocale('pt-BR', 'en-US'), 'pt-BR');
  assert.equal(preferredPreviewLocale(null, 'pt-PT'), 'pt-BR');
  assert.equal(preferredPreviewLocale('unsupported', 'es-ES'), 'en');
  const redirect = parsePreviewRoute(
    new URL('https://preview.example/?post=local-story#post-local-story'),
    { savedLocale: 'pt-BR', browserLanguage: 'en' }
  );
  assert.deepEqual(redirect, {
    kind: 'redirect',
    locale: 'pt-BR',
    to: '/pt-BR?post=local-story#post-local-story',
  });
});

test('public preview preserves search and local deep links in both interface languages', () => {
  for (const locale of ['en', 'pt-BR']) {
    const explore = parsePreviewRoute(
      new URL(`https://preview.example/${locale}/explore?q=Seiko%205`)
    );
    assert.equal(explore.kind, 'page');
    if (explore.kind !== 'page') assert.fail('Expected a page');
    assert.equal(explore.page, 'explore');
    assert.equal(explore.query, 'Seiko 5');
    const home = parsePreviewRoute(
      new URL(`https://preview.example/${locale}/home?post=local-123`)
    );
    assert.equal(home.kind, 'page');
    if (home.kind !== 'page') assert.fail('Expected a page');
    assert.equal(home.sharedPost, 'local-123');
    const passport = parsePreviewRoute(
      new URL(`https://preview.example/${locale}/passport?watch=watch-456`)
    );
    assert.equal(passport.kind, 'page');
    if (passport.kind !== 'page') assert.fail('Expected a page');
    assert.equal(passport.watchId, 'watch-456');
  }
});

test('unknown or nested preview destinations remain not-found rather than falling back to home', () => {
  for (const pathname of [
    '/en/unknown',
    '/pt-BR/unknown',
    '/en/collection/extra',
    '/es',
    '/api/auth',
    '/en//collection',
    '/en/%2e%2e/unknown',
  ]) {
    assert.equal(
      parsePreviewRoute(new URL(pathname, 'https://preview.example')).kind,
      'not-found',
      pathname
    );
  }
  assert.equal(parsePreviewRoute(new URL('https://preview.example/pt-BR/settings/')).kind, 'page');
});

test('every emitted locale destination opens a recognized product page', () => {
  const paths = previewRoutePaths();
  assert.equal(paths.length, 26);
  assert.equal(new Set(paths).size, paths.length);
  for (const pathname of paths)
    assert.equal(
      parsePreviewRoute(new URL(pathname, 'https://preview.example')).kind,
      'page',
      pathname
    );
});
