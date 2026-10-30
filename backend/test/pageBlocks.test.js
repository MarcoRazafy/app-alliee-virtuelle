const test = require('node:test');
const assert = require('node:assert/strict');
const { lireBlocs, lienSur, lienVideo, PageBlockError, MAX_BLOCKS, MAX_TEXT_CHARS } = require('../src/utils/pageBlocks');

const TOKEN = 'televersement:1b4e28ba-2fa1-4d3b-a3f5-ef19b5a7633b';

test('lienSur accepte https, http, mailto, tel et les chemins internes', () => {
  assert.equal(lienSur('https://exemple.mg/page?x=1'), 'https://exemple.mg/page?x=1');
  assert.equal(lienSur('http://exemple.mg'), 'http://exemple.mg/');
  assert.equal(lienSur('exemple.mg/ressources'), 'https://exemple.mg/ressources');
  assert.equal(lienSur('mailto:contact@exemple.mg'), 'mailto:contact@exemple.mg');
  assert.equal(lienSur('tel:+261340000000'), 'tel:+261340000000');
  assert.equal(lienSur('/resources'), '/resources');
});

test('lienSur refuse javascript:, data:, les chemins // et les adresses douteuses', () => {
  for (const bad of [
    'javascript:alert(1)',
    'JaVaScRiPt:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'vbscript:msgbox',
    '//evil.example',
    '/\\evil.example',
    'https://exemple.mg/a b',
    'https://exemple.mg/"onmouseover',
    'https://exemple.mg/<x>',
    'https://localhost/admin',
    'https://192.168.1.10/',
    'https://user:pass@exemple.mg/',
    'https://exemple.mg:8080/',
    'ftp://exemple.mg/fichier',
    `https://exemple.mg/${'a'.repeat(500)}`,
    'mailto:pas-une-adresse',
    'tel:+261 34 00',
    '',
    42,
  ]) {
    assert.equal(lienSur(bad), null, String(bad));
  }
});

test('lienVideo reconstruit l’adresse d’intégration à partir d’un identifiant vérifié', () => {
  const embed = 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ';
  assert.equal(lienVideo('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42').url, embed);
  assert.equal(lienVideo('youtu.be/dQw4w9WgXcQ').url, embed);
  assert.equal(lienVideo('https://m.youtube.com/shorts/dQw4w9WgXcQ').url, embed);
  assert.equal(lienVideo('https://www.youtube.com/embed/dQw4w9WgXcQ').url, embed);
  assert.equal(lienVideo('https://vimeo.com/76979871').url, 'https://player.vimeo.com/video/76979871');
  assert.equal(lienVideo('https://player.vimeo.com/video/76979871').url, 'https://player.vimeo.com/video/76979871');
});

test('lienVideo refuse les identifiants invalides et les autres sites', () => {
  for (const bad of [
    'https://www.youtube.com/watch?v=court',
    'https://www.youtube.com/watch?v=dQw4w9WgXcQ"><script>',
    'https://youtu.be/dQw4w9WgXc!',
    'https://www.youtube.com/channel/UC123',
    'https://vimeo.com/abc',
    'https://vimeo.com/channels/staffpicks',
    'https://vimeo.com/123abc',
    'https://evil.example/embed/dQw4w9WgXcQ',
    'javascript:alert(1)',
    'https://www.youtube.com.evil.example/watch?v=dQw4w9WgXcQ',
  ]) {
    assert.equal(lienVideo(bad), null, bad);
  }
});

test('lireBlocs reconstruit chaque bloc en ignorant les champs inconnus', () => {
  const { blocs, tokens } = lireBlocs(
    JSON.stringify([
      { type: 'titre', texte: ' Bienvenue\n ', niveau: 3, alignement: 'centre', couleur: '#256BFF', onclick: 'x', html: '<b>' },
      {
        type: 'texte',
        style: 'position:fixed',
        lignes: [
          {
            genre: 'p',
            alignement: 'droite',
            passages: [
              { t: 'Gras ', g: true, i: 'oui', script: 1 },
              { t: 'gras', g: true },
              { t: ' lien', lien: 'javascript:alert(1)' },
              { t: ' couleur', couleur: '#123456', taille: 'enorme' },
              { t: '' },
            ],
          },
          { genre: 'ul', items: [[{ t: 'un' }], [], [{ t: 'deux', s: true }]] },
          { genre: 'h1', passages: [{ t: 'refusé' }] },
        ],
      },
      { type: 'photo', fichier: TOKEN, legende: 'Légende', src: 'https://evil.example/x.png' },
      { type: 'video', source: 'lien', url: 'https://youtu.be/dQw4w9WgXcQ' },
      { type: 'script', code: 'alert(1)' },
    ])
  );
  assert.deepEqual(blocs, [
    { type: 'titre', texte: 'Bienvenue', niveau: 3, alignement: 'centre', couleur: '#256bff' },
    {
      type: 'texte',
      lignes: [
        { genre: 'p', alignement: 'droite', passages: [{ t: 'Gras gras', g: true }, { t: ' lien couleur' }] },
        { genre: 'ul', items: [[{ t: 'un' }], [{ t: 'deux', s: true }]] },
      ],
    },
    { type: 'photo', fichier: TOKEN, legende: 'Légende' },
    { type: 'video', source: 'lien', url: 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ' },
  ]);
  assert.deepEqual(tokens, ['1b4e28ba-2fa1-4d3b-a3f5-ef19b5a7633b']);
});

test('lireBlocs applique les limites de blocs et de caractères', () => {
  const titre = { type: 'titre', texte: 'T' };
  assert.equal(lireBlocs(Array(MAX_BLOCKS).fill(titre)).blocs.length, MAX_BLOCKS);
  assert.throws(() => lireBlocs(Array(MAX_BLOCKS + 1).fill(titre)), PageBlockError);

  const long = 'a'.repeat(10000);
  const texte = (n) => ({ type: 'texte', lignes: [{ genre: 'p', passages: [{ t: long.slice(0, n) }] }] });
  assert.doesNotThrow(() => lireBlocs([texte(10000), texte(10000), texte(10000)]));
  assert.throws(() => lireBlocs([texte(10000), texte(10000), texte(10000), titre]), PageBlockError);
  assert.equal(MAX_TEXT_CHARS, 30000);
});

test('lireBlocs refuse les contenus qui ne sont pas une liste de blocs', () => {
  for (const bad of ['{', '"texte"', '{"type":"titre"}', 'null', 42]) {
    assert.throws(() => lireBlocs(bad), PageBlockError, String(bad));
  }
});

test('lireBlocs n’accepte qu’un jeton ou un fichier déjà attaché à la ressource', () => {
  const existingFiles = new Set(['photo-0123456789abcdef.webp', 'video-0123456789abcdef.mp4']);
  const ok = lireBlocs(
    [
      { type: 'photo', fichier: 'photo-0123456789abcdef.webp' },
      { type: 'video', source: 'fichier', fichier: 'video-0123456789abcdef.mp4' },
    ],
    { existingFiles }
  );
  assert.equal(ok.blocs.length, 2);

  for (const fichier of [
    '../../../etc/passwd',
    'photo-0123456789abcdef.webp/../../x',
    'photo-ffffffffffffffff.webp',
    'video-0123456789abcdef.mp4',
    'televersement:pas-un-uuid',
    '/uploads/resources/x.pdf',
  ]) {
    assert.throws(() => lireBlocs([{ type: 'photo', fichier }], { existingFiles }), PageBlockError, fichier);
  }
});

test('lireBlocs refuse un lien vidéo non reconnu plutôt que de le perdre en silence', () => {
  assert.throws(() => lireBlocs([{ type: 'video', source: 'lien', url: 'https://evil.example/v.mp4' }]), PageBlockError);
});

test('lireBlocs retire les lignes vides en début et fin de texte, garde celles du milieu', () => {
  const { blocs } = lireBlocs([
    {
      type: 'texte',
      lignes: [
        { genre: 'p', passages: [] },
        { genre: 'p', passages: [{ t: 'a' }] },
        { genre: 'p', passages: [] },
        { genre: 'p', passages: [{ t: 'b' }] },
        { genre: 'p', passages: [{ t: '' }] },
      ],
    },
  ]);
  assert.deepEqual(blocs[0].lignes, [
    { genre: 'p', passages: [{ t: 'a' }] },
    { genre: 'p', passages: [] },
    { genre: 'p', passages: [{ t: 'b' }] },
  ]);
});

test('lireBlocs accepte un document PDF : jeton ou fichier attaché, nom nettoyé', () => {
  const existingFiles = new Set(['document-0123456789abcdef.pdf', 'photo-0123456789abcdef.webp']);
  const { blocs, tokens } = lireBlocs(
    [
      { type: 'document', fichier: TOKEN, nom: '  Règlement\ninterne  ', taille: 999 },
      { type: 'document', fichier: 'document-0123456789abcdef.pdf' },
      { type: 'document', fichier: '' },
    ],
    { existingFiles }
  );
  assert.deepEqual(blocs, [
    { type: 'document', fichier: TOKEN, nom: 'Règlement interne' },
    { type: 'document', fichier: 'document-0123456789abcdef.pdf' },
  ]);
  assert.deepEqual(tokens, [TOKEN.split(':')[1]]);

  for (const fichier of ['photo-0123456789abcdef.webp', 'document-ffffffffffffffff.pdf', '../document-0123456789abcdef.pdf']) {
    assert.throws(() => lireBlocs([{ type: 'document', fichier }], { existingFiles }), PageBlockError, fichier);
  }
  assert.throws(() => lireBlocs([{ type: 'document', fichier: TOKEN, nom: 'x'.repeat(201) }]), PageBlockError);
});
