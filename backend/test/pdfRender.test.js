const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const pdfRender = require('../src/services/pdfRender.service');
const { makePdf } = require('./helpers/makePdf');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pdf-render-'));
const pdfPath = path.join(dir, 'deux-pages.pdf');
fs.writeFileSync(
  pdfPath,
  makePdf([
    { width: 300, height: 400, text: 'Page portrait' },
    { width: 400, height: 300, text: 'Page paysage' },
  ])
);

test.after(async () => {
  await pdfRender.shutdown();
  fs.rmSync(dir, { recursive: true, force: true });
});

test('décrit chaque page avec ses dimensions', async () => {
  assert.deepEqual(await pdfRender.describe(pdfPath), {
    pages: [
      { width: 300, height: 400 },
      { width: 400, height: 300 },
    ],
  });
});

test('dessine une page en image WebP à la largeur fixée par le serveur', async () => {
  const image = await pdfRender.renderPage(pdfPath, 2);
  assert.equal(image.subarray(0, 4).toString('latin1'), 'RIFF');
  assert.equal(image.subarray(8, 12).toString('latin1'), 'WEBP');
});

test('une page hors du document est refusée', async () => {
  await assert.rejects(pdfRender.renderPage(pdfPath, 3), pdfRender.PdfRenderError);
});

test('un fichier qui n’est pas un PDF est refusé sans faire tomber le service', async () => {
  const notPdf = path.join(dir, 'faux.pdf');
  fs.writeFileSync(notPdf, 'pas un pdf');
  await assert.rejects(pdfRender.describe(notPdf), pdfRender.PdfRenderError);
  assert.equal((await pdfRender.describe(pdfPath)).pages.length, 2);
});
