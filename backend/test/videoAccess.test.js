const test = require('node:test');
const assert = require('node:assert/strict');
const { videoAccessError, DOWNLOAD_REFUSED } = require('../src/utils/videoAccess');

test('le lecteur <video> de l’application reçoit la vidéo', () => {
  assert.equal(videoAccessError({ disposition: 'inline', fetchDest: 'video' }), null);
});

test('la route de téléchargement est refusée, quelle que soit la provenance', () => {
  assert.equal(videoAccessError({ disposition: 'attachment', fetchDest: 'video' }), DOWNLOAD_REFUSED);
  assert.equal(videoAccessError({ disposition: 'attachment', fetchDest: undefined }), DOWNLOAD_REFUSED);
});

test('adresse collée dans un onglet : refusée', () => {
  assert.equal(videoAccessError({ disposition: 'inline', fetchDest: 'document' }), DOWNLOAD_REFUSED);
});

test('fetch ou XHR lancé depuis la console : refusé', () => {
  assert.equal(videoAccessError({ disposition: 'inline', fetchDest: 'empty' }), DOWNLOAD_REFUSED);
});

test('navigateur ancien sans Sec-Fetch-Dest : servi, pour ne pas bloquer la lecture', () => {
  assert.equal(videoAccessError({ disposition: 'inline', fetchDest: undefined }), null);
  assert.equal(videoAccessError({ disposition: 'inline', fetchDest: '' }), null);
});
