const fs = require('fs');
const path = require('path');
const { Worker } = require('worker_threads');

const PAGE_WIDTH = 1200;
const REQUEST_TIMEOUT_MS = 30000;
const MAX_CACHED_PAGES = 60;
const MAX_CACHED_DESCRIPTIONS = 50;

class PdfRenderError extends Error {
  constructor(message) {
    super(message);
    this.name = 'PdfRenderError';
  }
}

let worker = null;
let nextRequestId = 1;
const pending = new Map();
const pageCache = new Map();
const descriptionCache = new Map();

function failPending(error) {
  for (const [id, request] of pending) {
    clearTimeout(request.timer);
    request.reject(error);
    pending.delete(id);
  }
}

function getWorker() {
  if (worker) return worker;
  const current = new Worker(path.join(__dirname, 'pdfRender.worker.mjs'));
  current.unref();
  current.on('message', ({ id, result, error }) => {
    const request = pending.get(id);
    if (!request) return;
    pending.delete(id);
    clearTimeout(request.timer);
    if (error) request.reject(new PdfRenderError(error));
    else request.resolve(result);
  });
  current.on('error', (err) => failPending(new PdfRenderError(err.message)));
  current.on('exit', () => {
    if (worker === current) worker = null;
    failPending(new PdfRenderError('Rendu PDF interrompu'));
  });
  worker = current;
  return current;
}

function ask(message) {
  return new Promise((resolve, reject) => {
    const id = nextRequestId;
    nextRequestId += 1;
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new PdfRenderError('Rendu PDF trop long'));
      if (worker) worker.terminate().catch(() => {});
    }, REQUEST_TIMEOUT_MS);
    pending.set(id, { resolve, reject, timer });
    getWorker().postMessage({ id, ...message });
  });
}

function remember(cache, key, value, limit) {
  cache.delete(key);
  cache.set(key, value);
  while (cache.size > limit) cache.delete(cache.keys().next().value);
}

function versionOf(filePath) {
  return fs.promises.stat(filePath).then((stat) => stat.mtimeMs);
}

async function describe(filePath) {
  const version = await versionOf(filePath);
  const key = `${filePath}:${version}`;
  if (descriptionCache.has(key)) return descriptionCache.get(key);
  const description = await ask({ kind: 'describe', filePath, version });
  remember(descriptionCache, key, description, MAX_CACHED_DESCRIPTIONS);
  return description;
}

async function renderPage(filePath, page) {
  const version = await versionOf(filePath);
  const key = `${filePath}:${version}:${page}:${PAGE_WIDTH}`;
  if (pageCache.has(key)) {
    const cached = pageCache.get(key);
    remember(pageCache, key, cached, MAX_CACHED_PAGES);
    return cached;
  }
  const image = Buffer.from(await ask({ kind: 'page', filePath, version, page, width: PAGE_WIDTH }));
  remember(pageCache, key, image, MAX_CACHED_PAGES);
  return image;
}

async function shutdown() {
  pageCache.clear();
  descriptionCache.clear();
  if (worker) await worker.terminate();
}

module.exports = { describe, renderPage, shutdown, PdfRenderError, PAGE_WIDTH };
