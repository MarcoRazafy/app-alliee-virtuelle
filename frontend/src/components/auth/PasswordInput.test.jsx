import test from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import PasswordInput from './PasswordInput.jsx';

test('PasswordInput masque le mot de passe par défaut', () => {
  const html = renderToStaticMarkup(<PasswordInput id="pwd" value="secret" onChange={() => {}} />);
  assert.match(html, /type="password"/);
  assert.match(html, /value="secret"/);
});

test('PasswordInput expose un bouton "Show password"', () => {
  const html = renderToStaticMarkup(<PasswordInput id="pwd" value="" onChange={() => {}} />);
  assert.match(html, /aria-label="Show password"/);
});

test('PasswordInput transmet le placeholder et l’attribut required', () => {
  const html = renderToStaticMarkup(
    <PasswordInput id="pwd" value="" onChange={() => {}} placeholder="8 caractères minimum" required />
  );
  assert.match(html, /placeholder="8 caractères minimum"/);
  assert.match(html, /required/);
});
