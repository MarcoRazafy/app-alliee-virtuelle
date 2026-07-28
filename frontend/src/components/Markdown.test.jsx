import test from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import Markdown from './Markdown.jsx';

test('Markdown rend le gras **texte** en <strong>', () => {
  const html = renderToStaticMarkup(<Markdown text="Bonjour **Marco**" />);
  assert.match(html, /<strong>Marco<\/strong>/);
});

test('Markdown rend une liste à puces', () => {
  const html = renderToStaticMarkup(<Markdown text={'- un\n- deux'} />);
  assert.match(html, /<ul[^>]*>/);
  assert.match(html, /<li>un<\/li>/);
  assert.match(html, /<li>deux<\/li>/);
});

test('Markdown rend le code `inline` en <code>', () => {
  const html = renderToStaticMarkup(<Markdown text="voir `npm test` ici" />);
  assert.match(html, /<code>npm test<\/code>/);
});

test('Markdown gère un texte vide sans planter', () => {
  const html = renderToStaticMarkup(<Markdown text="" />);
  assert.equal(typeof html, 'string');
});
