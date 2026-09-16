import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DOCUMENT_MEDIA_ACCEPT,
  documentMediaKind,
  escapeHtml,
  extractMediaIds,
  mediaHtml,
  mediaIdsToDelete,
} from './documentMedia.js';

const A = '3d59871b-311d-4fff-a8d3-381895944df1';
const B = '542fb22b-16cf-4b28-900e-97940566d02c';
const C = '2e9f74b4-c3e5-4513-aa19-312d5cb982c7';

test('familles insérables : photo, vidéo, PDF — pas de Word', () => {
  assert.equal(documentMediaKind('image/jpeg'), 'image');
  assert.equal(documentMediaKind('video/mp4'), 'video');
  assert.equal(documentMediaKind('application/pdf'), 'pdf');
  assert.equal(documentMediaKind('application/msword'), null);
  assert.equal(documentMediaKind(''), null);
});

test('le sélecteur propose photos, vidéos et PDF', () => {
  const parts = DOCUMENT_MEDIA_ACCEPT.split(',');
  for (const x of ['.png', '.jpg', '.mp4', '.mov', '.pdf', 'application/pdf']) assert.ok(parts.includes(x), x);
  assert.ok(!parts.includes('.docx'));
});

test('photo : image dans un bloc insécable, suivie d’un paragraphe pour continuer', () => {
  const html = mediaHtml({ id: A, kind: 'image', fileName: 'schéma.png' });
  assert.match(html, new RegExp(`<img src="/api/resources/media/${A}" alt="schéma.png">`));
  assert.match(html, /contenteditable="false"/);
  assert.match(html, /<\/figure><p><br><\/p>$/);
});

test('vidéo : lecteur sans téléchargement', () => {
  const html = mediaHtml({ id: A, kind: 'video', fileName: 'cours.mp4' });
  assert.match(html, /<video [^>]*controls/);
  assert.match(html, /controlslist="nodownload/);
});

test('PDF : carte cliquable qui porte l’identifiant et le nom', () => {
  const html = mediaHtml({ id: A, kind: 'pdf', fileName: 'support.pdf' });
  assert.match(html, new RegExp(`<a class="resource-doc-pdf" href="/api/resources/media/${A}" data-media-id="${A}" data-file-name="support.pdf">support.pdf</a>`));
});

test('un nom de fichier piégé ne devient jamais du HTML', () => {
  const html = mediaHtml({ id: A, kind: 'pdf', fileName: '"><img src=x onerror=alert(1)>.pdf' });
  assert.ok(!html.includes('<img src=x'));
  assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt;'));
  assert.equal(escapeHtml(`a&b'"`), 'a&amp;b&#39;&quot;');
});

test('médias cités retrouvés dans le HTML inséré', () => {
  const html = mediaHtml({ id: A, kind: 'image', fileName: 'a' }) + mediaHtml({ id: B, kind: 'pdf', fileName: 'b' });
  assert.deepEqual(extractMediaIds(html).sort(), [A, B].sort());
});

test('abandon : on efface seulement ce qui a été importé pendant l’édition', () => {
  assert.deepEqual(mediaIdsToDelete({ initialIds: [A], sessionIds: [B, C], finalIds: [], saved: false }), [B, C]);
});

test('enregistré : on efface ce qui n’est plus cité, ancien comme nouveau', () => {
  // A (d'origine) retiré, B (nouveau) gardé, C (nouveau) inséré puis retiré.
  assert.deepEqual(mediaIdsToDelete({ initialIds: [A], sessionIds: [B, C], finalIds: [B], saved: true }).sort(), [A, C].sort());
});

test('enregistré sans rien retirer : rien à effacer', () => {
  assert.deepEqual(mediaIdsToDelete({ initialIds: [A], sessionIds: [B], finalIds: [A, B], saved: true }), []);
});
