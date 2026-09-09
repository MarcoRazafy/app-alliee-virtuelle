import test from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import Linkify from './Linkify.jsx';

test('Linkify rend une adresse cliquable dans un texte brut', () => {
  const html = renderToStaticMarkup(<Linkify text="doc ici https://exemple.com/a merci" />);
  assert.match(html, /<a href="https:\/\/exemple\.com\/a"[^>]*>https:\/\/exemple\.com\/a<\/a>/);
  assert.match(html, /target="_blank"/);
  assert.match(html, /rel="noopener noreferrer"/);
});

test('Linkify laisse le texte intact et n’interprète aucun Markdown', () => {
  const html = renderToStaticMarkup(<Linkify text="**gras** et - tiret" />);
  assert.match(html, /\*\*gras\*\* et - tiret/);
  assert.doesNotMatch(html, /<strong>|<ul>/);
});

test('Linkify laisse la ponctuation finale hors du lien', () => {
  const html = renderToStaticMarkup(<Linkify text="voir https://exemple.com/a." />);
  assert.match(html, /href="https:\/\/exemple\.com\/a"/);
  assert.doesNotMatch(html, /href="https:\/\/exemple\.com\/a\."/);
});

test('Linkify ne transforme pas une adresse non http', () => {
  const html = renderToStaticMarkup(<Linkify text="javascript:alert(1)" />);
  assert.doesNotMatch(html, /<a /);
});

test('Linkify gère un texte vide ou absent', () => {
  assert.equal(typeof renderToStaticMarkup(<Linkify text="" />), 'string');
  assert.equal(typeof renderToStaticMarkup(<Linkify />), 'string');
});
