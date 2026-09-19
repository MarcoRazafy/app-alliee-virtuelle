import test from 'node:test';
import assert from 'node:assert/strict';
import { pastedFileName, filesFromPaste } from './clipboardFiles.js';

const NOW = new Date(2026, 8, 19, 10, 4);

test('une capture « image.png » reçoit un nom daté', () => {
  assert.equal(pastedFileName({ name: 'image.png', type: 'image/png' }, NOW), 'capture-2026-09-19-10h04.png');
  assert.equal(pastedFileName({ name: '', type: 'image/jpeg' }, NOW), 'capture-2026-09-19-10h04.jpg');
});

test('un fichier avec un vrai nom le garde', () => {
  assert.equal(pastedFileName({ name: 'Rapport mensuel.pdf', type: 'application/pdf' }, NOW), 'Rapport mensuel.pdf');
  assert.equal(pastedFileName({ name: 'schéma.png', type: 'image/png' }, NOW), 'schéma.png');
});

test('un fichier sans nom et non-image est nommé « fichier-… »', () => {
  assert.equal(pastedFileName({ name: '', type: 'application/pdf' }, NOW), 'fichier-2026-09-19-10h04.pdf');
});

test('collage de texte : aucun fichier, le collage normal se fait', () => {
  assert.deepEqual(filesFromPaste({ clipboardData: { files: [], items: [{ kind: 'string' }] } }, NOW), []);
  assert.deepEqual(filesFromPaste({}, NOW), []);
});

test('collage d’une capture : un File renommé, contenu et type conservés', async () => {
  const shot = new File([new Uint8Array([1, 2, 3])], 'image.png', { type: 'image/png' });
  const [file] = filesFromPaste({ clipboardData: { files: [shot] } }, NOW);
  assert.equal(file.name, 'capture-2026-09-19-10h04.png');
  assert.equal(file.type, 'image/png');
  assert.equal(file.size, 3);
});

test('navigateur qui ne remplit que `items`', () => {
  const pdf = new File([new Uint8Array([9])], 'devis.pdf', { type: 'application/pdf' });
  const files = filesFromPaste({ clipboardData: { files: [], items: [{ kind: 'file', getAsFile: () => pdf }, { kind: 'string' }] } }, NOW);
  assert.deepEqual(files.map((f) => f.name), ['devis.pdf']);
});
