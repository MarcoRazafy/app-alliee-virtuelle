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

test('Markdown rend le barré ~~texte~~ en <s>', () => {
  const html = renderToStaticMarkup(<Markdown text="c'est ~~annulé~~ finalement" />);
  assert.match(html, /<s>annulé<\/s>/);
});

test('Markdown rend un lien [texte](url) en <a> qui s’ouvre dans un nouvel onglet', () => {
  const html = renderToStaticMarkup(<Markdown text="voir [le planning](https://exemple.com/p)" />);
  assert.match(html, /<a href="https:\/\/exemple\.com\/p"/);
  assert.match(html, /target="_blank"/);
  assert.match(html, /rel="noopener noreferrer"/);
  assert.match(html, />le planning<\/a>/);
});

test('Markdown refuse une URL non http(s) : javascript: ne devient jamais un lien', () => {
  const html = renderToStaticMarkup(<Markdown text="[clic](javascript:alert(1))" />);
  assert.doesNotMatch(html, /<a /);
  assert.doesNotMatch(html, /javascript:alert\(1\)"/);
});

test('Markdown : une mention est rendue par renderMention quand il est fourni', () => {
  const uuid = '3d59871b-311d-4fff-a8d3-3818959444f1';
  const html = renderToStaticMarkup(
    <Markdown
      text={`salut @[Marco](${uuid}) regarde`}
      renderMention={(name, userId, key) => <b key={key} data-id={userId}>{`@${name}`}</b>}
    />
  );
  assert.match(html, /<b data-id="[0-9a-f-]{36}">@Marco<\/b>/);
});

test('Markdown : sans renderMention, une mention retombe sur « @Nom » et jamais sur un lien', () => {
  const uuid = '3d59871b-311d-4fff-a8d3-3818959444f1';
  const html = renderToStaticMarkup(<Markdown text={`salut @[Marco](${uuid})`} />);
  assert.match(html, /@Marco/);
  assert.doesNotMatch(html, /<a /);
});

test('Markdown : une mention dans une puce reste une mention', () => {
  const uuid = '3d59871b-311d-4fff-a8d3-3818959444f1';
  const html = renderToStaticMarkup(
    <Markdown
      text={`- relancer @[Marco](${uuid})\n- puis archiver`}
      renderMention={(name, userId, key) => <b key={key}>{`@${name}`}</b>}
    />
  );
  assert.match(html, /<li><b>@Marco<\/b><\/li>|<li>relancer <b>@Marco<\/b><\/li>/);
  assert.match(html, /<li>puis archiver<\/li>/);
});
