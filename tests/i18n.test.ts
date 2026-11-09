import test from 'node:test';
import assert from 'node:assert/strict';
import english from '../lib/messages/en.json';
import portuguese from '../lib/messages/pt-BR.json';
import {
  localizedDate,
  localizedPostType,
  navigation,
  translate,
  type TranslationKey,
} from '../lib/i18n';

test('English and Portuguese dictionaries contain exactly the same complete keys', () => {
  assert.deepEqual(Object.keys(english).sort(), Object.keys(portuguese).sort());
  for (const key of Object.keys(english) as TranslationKey[]) {
    assert.ok(translate('en', key).trim().length > 0, `Empty English translation: ${key}`);
    assert.ok(translate('pt-BR', key).trim().length > 0, `Empty Portuguese translation: ${key}`);
    const parameters = (message: string) =>
      [...message.matchAll(/\{([a-zA-Z][a-zA-Z0-9_]*)\}/g)].map((match) => match[1]).sort();
    assert.deepEqual(
      parameters(english[key]),
      parameters(portuguese[key]),
      `Different interpolation parameters: ${key}`
    );
  }
});

test('locale-specific UI labels and UTC dates use the selected language', () => {
  assert.equal(translate('en', 'close'), 'Close');
  assert.equal(translate('pt-BR', 'close'), 'Fechar');
  assert.equal(navigation.en.collection, 'My collection');
  assert.equal(navigation['pt-BR'].collection, 'Minha coleção');
  assert.equal(localizedPostType('Question', 'pt-BR'), 'Pergunta');
  assert.notEqual(
    localizedDate('2026-11-06T00:00:00.000Z', 'en'),
    localizedDate('2026-11-06T00:00:00.000Z', 'pt-BR')
  );
});
