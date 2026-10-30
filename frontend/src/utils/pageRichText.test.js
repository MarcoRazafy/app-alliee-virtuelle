import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { domToLines, linesToDom } from './pageRichText.js';
import { lienSur, lienVideo, serializeBlocks, textLength } from './pageBlocks.js';

const { document } = new JSDOM('<!doctype html><body></body>').window;

function fromHtml(html) {
  const root = document.createElement('div');
  root.innerHTML = html;
  return domToLines(root);
}

function roundTrip(lines) {
  const root = document.createElement('div');
  root.appendChild(linesToDom(lines, document));
  return domToLines(root);
}

const RICH = [
  {
    genre: 'p',
    alignement: 'centre',
    passages: [
      { t: 'Bonjour ', g: true },
      { t: 'tout', g: true, i: true },
      { t: ' le ' },
      { t: 'monde', s: true, couleur: '#256bff', taille: 'grand' },
      { t: ' et ' },
      { t: 'un lien', lien: 'https://exemple.mg/', g: true },
      { t: '\ndeuxième ligne', taille: 'petit' },
    ],
  },
  { genre: 'p', passages: [] },
  { genre: 'ul', items: [[{ t: 'un' }], [{ t: 'deux', couleur: '#ef4444', taille: 'tres-grand' }]] },
  { genre: 'ol', items: [[{ t: 'premier', i: true }], [{ t: 'contact', lien: 'mailto:contact@exemple.mg' }]] },
  { genre: 'p', alignement: 'droite', passages: [{ t: 'fin avec saut\n' }] },
];

test('aller-retour lignes → DOM → lignes sans perte de mise en forme', () => {
  assert.deepEqual(roundTrip(RICH), RICH);
});

test('le DOM produit par l’éditeur du navigateur (b, font, span en rgb) est relu correctement', () => {
  const lines = fromHtml(
    '<p><b>gras</b> <span style="color: rgb(37, 107, 255); font-size: x-large;">bleu</span> ' +
      '<font color="#ef4444" size="6">rouge</font></p>' +
      '<div style="text-align: center;">centré</div>' +
      '<ul><li>un</li><li><i>deux</i></li></ul>'
  );
  assert.deepEqual(lines, [
    {
      genre: 'p',
      passages: [
        { t: 'gras', g: true },
        { t: ' ' },
        { t: 'bleu', couleur: '#256bff', taille: 'grand' },
        { t: ' ' },
        { t: 'rouge', couleur: '#ef4444', taille: 'tres-grand' },
      ],
    },
    { genre: 'p', alignement: 'centre', passages: [{ t: 'centré' }] },
    { genre: 'ul', items: [[{ t: 'un' }], [{ t: 'deux', i: true }]] },
  ]);
});

test('ce qui n’est pas dans la liste blanche disparaît : script, javascript:, couleurs hors palette', () => {
  const lines = fromHtml(
    '<p><a href="javascript:alert(1)">x</a><script>alert(2)</script>' +
      '<span style="color:#123456;font-family:Comic Sans">y</span><img src="x" onerror="alert(3)">' +
      '<iframe src="https://evil.example"></iframe></p>'
  );
  assert.deepEqual(lines, [{ genre: 'p', passages: [{ t: 'xy' }] }]);
});

test('normalisation : passages voisins fusionnés, vides supprimés, saut final de Chrome retiré', () => {
  assert.deepEqual(fromHtml('<p><b>a</b><strong>b</strong><i></i></p><p><br></p><p>c<br></p>'), [
    { genre: 'p', passages: [{ t: 'ab', g: true }] },
    { genre: 'p', passages: [] },
    { genre: 'p', passages: [{ t: 'c' }] },
  ]);
  assert.deepEqual(fromHtml('texte libre <b>gras</b>'), [
    { genre: 'p', passages: [{ t: 'texte libre ' }, { t: 'gras', g: true }] },
  ]);
  assert.deepEqual(fromHtml(''), [{ genre: 'p', passages: [] }]);
});

test('la couleur « par défaut » retire la couleur héritée', () => {
  assert.deepEqual(fromHtml('<p><span style="color:#22c55e">a<span style="color: rgb(10, 20, 30)">b</span></span></p>'), [
    { genre: 'p', passages: [{ t: 'a', couleur: '#22c55e' }, { t: 'b' }] },
  ]);
});

test('les contrôles côté interface suivent ceux du serveur', () => {
  assert.equal(lienSur('javascript:alert(1)'), null);
  assert.equal(lienSur('data:text/html,x'), null);
  assert.equal(lienSur('//evil.example'), null);
  assert.equal(lienSur('exemple.mg'), 'https://exemple.mg/');
  assert.equal(lienSur('/resources'), '/resources');
  assert.equal(lienVideo('https://youtu.be/dQw4w9WgXcQ').url, 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ');
  assert.equal(lienVideo('https://vimeo.com/76979871').url, 'https://player.vimeo.com/video/76979871');
  assert.equal(lienVideo('https://youtu.be/court'), null);
});

test('l’envoi au serveur ne contient que le format stocké', () => {
  const sent = serializeBlocks([
    { cle: 'k1', type: 'titre', texte: 'T', niveau: 3, alignement: '', couleur: '#256bff' },
    { cle: 'k2', type: 'photo', fichier: 'televersement:x', legende: '  ', apercu: 'blob:x', progression: 40 },
    { cle: 'k3', type: 'video', source: 'lien', url: 'https://youtu.be/dQw4w9WgXcQ', fichier: '' },
  ]);
  assert.deepEqual(sent, [
    { type: 'titre', texte: 'T', niveau: 3, couleur: '#256bff' },
    { type: 'photo', fichier: 'televersement:x' },
    { type: 'video', source: 'lien', url: 'https://youtu.be/dQw4w9WgXcQ' },
  ]);
  assert.equal(textLength([{ type: 'texte', lignes: RICH }]), 'Bonjour tout le monde et un lien\ndeuxième ligneundeuxpremiercontactfin avec saut\n'.length);
});
