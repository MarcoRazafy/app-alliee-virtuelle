const test = require('node:test');
const assert = require('node:assert/strict');
const { extractMediaIds, mediaKind, isUuid } = require('../src/utils/documentMedia');
const { isVideoMime } = require('../src/config/resourceUpload');

const A = '3d59871b-311d-4fff-a8d3-381895944df1';
const B = '542fb22b-16cf-4b28-900e-97940566d02c';

test('retrouve les médias d’un document, quelle que soit la balise', () => {
  const html = `<p>Intro</p>
    <figure><img src="/api/resources/media/${A}" alt="x"></figure>
    <figure><video src="/api/resources/media/${B}" controls></video></figure>`;
  assert.deepEqual(extractMediaIds(html).sort(), [A, B].sort());
});

test('un même média cité deux fois ne compte qu’une fois', () => {
  const html = `<a href="/api/resources/media/${A}" data-media-id="${A}">cours.pdf</a><img src="/api/resources/media/${A}">`;
  assert.deepEqual(extractMediaIds(html), [A]);
});

test('identifiants normalisés en minuscules (la base compare en minuscules)', () => {
  assert.deepEqual(extractMediaIds(`<img src="/api/resources/media/${A.toUpperCase()}">`), [A]);
});

test('document sans média, vide ou absent', () => {
  assert.deepEqual(extractMediaIds('<p>Texte seul, et un lien /api/resources/files/abc</p>'), []);
  assert.deepEqual(extractMediaIds(''), []);
  assert.deepEqual(extractMediaIds(null), []);
});

test('seuls photos, vidéos et PDF entrent dans un document', () => {
  assert.equal(mediaKind('image/png', isVideoMime), 'image');
  assert.equal(mediaKind('image/jpeg', isVideoMime), 'image');
  assert.equal(mediaKind('video/mp4', isVideoMime), 'video');
  assert.equal(mediaKind('video/quicktime', isVideoMime), 'video');
  assert.equal(mediaKind('application/pdf', isVideoMime), 'pdf');
  assert.equal(mediaKind('application/msword', isVideoMime), null);
  assert.equal(mediaKind('text/plain', isVideoMime), null);
});

test('isUuid : protège les requêtes SQL d’un identifiant mal formé', () => {
  assert.equal(isUuid(A), true);
  assert.equal(isUuid('not-a-uuid'), false);
  assert.equal(isUuid(`${A}' OR 1=1`), false);
  assert.equal(isUuid(undefined), false);
});
