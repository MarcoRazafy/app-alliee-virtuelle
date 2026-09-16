import test from 'node:test';
import assert from 'node:assert/strict';
import { isVideoMime, uploadSizeError, uploadPercent, RESOURCE_ACCEPT, DOCUMENT_MAX_BYTES } from './resourceMedia.js';

const MB = 1024 * 1024;

test('vidéos lisibles reconnues, formats illisibles écartés', () => {
  for (const mime of ['video/mp4', 'video/webm', 'video/quicktime', 'video/x-m4v', 'video/ogg']) {
    assert.equal(isVideoMime(mime), true, mime);
  }
  for (const mime of ['video/x-matroska', 'video/x-msvideo', 'application/pdf', '', undefined]) {
    assert.equal(isVideoMime(mime), false, String(mime));
  }
});

test('une vidéo n’a aucune limite de taille', () => {
  assert.equal(uploadSizeError({ type: 'video/mp4', size: 5 * 1024 * MB }), null);
});

test('un document est borné à 20 Mo, borne comprise', () => {
  assert.equal(uploadSizeError({ type: 'application/pdf', size: DOCUMENT_MAX_BYTES }), null);
  assert.match(uploadSizeError({ type: 'application/pdf', size: DOCUMENT_MAX_BYTES + 1 }), /20 Mo/);
});

test('pas de fichier, pas d’erreur', () => {
  assert.equal(uploadSizeError(null), null);
});

test('le sélecteur de fichier propose les vidéos et les documents', () => {
  for (const ext of ['.mp4', '.webm', '.mov', '.pdf', '.docx']) {
    assert.ok(RESOURCE_ACCEPT.split(',').includes(ext), ext);
  }
  assert.ok(!RESOURCE_ACCEPT.includes('.mkv'));
});

test('progression : pourcentage entier et borné', () => {
  assert.equal(uploadPercent(0, 200), 0);
  assert.equal(uploadPercent(99, 200), 49);
  assert.equal(uploadPercent(200, 200), 100);
  assert.equal(uploadPercent(250, 200), 100);
});

test('progression : taille inconnue → rien plutôt qu’un chiffre faux', () => {
  assert.equal(uploadPercent(100, 0), null);
  assert.equal(uploadPercent(100, undefined), null);
});
