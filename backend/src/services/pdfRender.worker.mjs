import { parentPort } from 'node:worker_threads';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { createCanvas } from '@napi-rs/canvas';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';

const require = createRequire(import.meta.url);
const pdfjsRoot = path.dirname(require.resolve('pdfjs-dist/package.json'));

const DOCUMENT_OPTIONS = {
  isEvalSupported: false,
  verbosity: pdfjs.VerbosityLevel.ERRORS,
  standardFontDataUrl: `${pdfjsRoot}/standard_fonts/`,
  cMapUrl: `${pdfjsRoot}/cmaps/`,
  cMapPacked: true,
};
const MAX_OPEN_DOCUMENTS = 4;
const WEBP_QUALITY = 85;

const openDocuments = new Map();

function openDocument(filePath, version) {
  const key = `${filePath}:${version}`;
  if (openDocuments.has(key)) {
    const loading = openDocuments.get(key);
    openDocuments.delete(key);
    openDocuments.set(key, loading);
    return loading;
  }
  const loading = fs
    .readFile(filePath)
    .then((bytes) => pdfjs.getDocument({ ...DOCUMENT_OPTIONS, data: new Uint8Array(bytes) }).promise);
  loading.catch(() => openDocuments.delete(key));
  openDocuments.set(key, loading);
  while (openDocuments.size > MAX_OPEN_DOCUMENTS) {
    const [oldestKey, oldest] = openDocuments.entries().next().value;
    openDocuments.delete(oldestKey);
    oldest.then((doc) => doc.destroy()).catch(() => {});
  }
  return loading;
}

async function describe(doc) {
  const pages = [];
  for (let number = 1; number <= doc.numPages; number += 1) {
    const viewport = (await doc.getPage(number)).getViewport({ scale: 1 });
    pages.push({ width: Math.round(viewport.width), height: Math.round(viewport.height) });
  }
  return { pages };
}

async function renderPage(doc, number, width) {
  if (!Number.isInteger(number) || number < 1 || number > doc.numPages) {
    throw new Error('Page hors du document');
  }
  const page = await doc.getPage(number);
  const scale = width / page.getViewport({ scale: 1 }).width;
  const viewport = page.getViewport({ scale });
  const canvas = createCanvas(Math.floor(viewport.width), Math.floor(viewport.height));
  const context = canvas.getContext('2d');
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: context, viewport }).promise;
  page.cleanup();
  return new Uint8Array(await canvas.encode('webp', WEBP_QUALITY));
}

parentPort.on('message', async ({ id, kind, filePath, version, page, width }) => {
  try {
    const doc = await openDocument(filePath, version);
    if (kind === 'describe') {
      parentPort.postMessage({ id, result: await describe(doc) });
      return;
    }
    const image = await renderPage(doc, page, width);
    parentPort.postMessage({ id, result: image }, [image.buffer]);
  } catch (err) {
    parentPort.postMessage({ id, error: err?.message || 'Rendu impossible' });
  }
});
