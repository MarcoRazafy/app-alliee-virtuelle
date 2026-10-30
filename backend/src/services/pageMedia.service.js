const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const db = require('../config/database');
const { UPLOAD_DIR } = require('../config/resourceUpload');
const { imageSize, jpegOrientation } = require('../utils/imageInfo');
const { isPageFileName, filesUsedBy, UPLOAD_TOKEN_RE } = require('../utils/pageBlocks');
const pdfRender = require('./pdfRender.service');

const TEMP_DIR = path.join(UPLOAD_DIR, 'page-uploads');
const PAGES_DIR = path.join(UPLOAD_DIR, 'pages');
const MAX_PHOTO_BYTES = 15 * 1024 * 1024;
const MAX_PHOTO_PIXELS = 60 * 1000 * 1000;
const MAX_PHOTO_WIDTH = 1600;
const WEBP_QUALITY = 82;
const MAX_DOCUMENT_BYTES = 20 * 1024 * 1024;
const UPLOAD_TTL_MS = 24 * 60 * 60 * 1000;

const PHOTO_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const VIDEO_EXTENSION_BY_MIME = { 'video/mp4': 'mp4', 'video/webm': 'webm', 'video/quicktime': 'mov' };
const PDF_MIME_TYPE = 'application/pdf';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

fs.mkdirSync(TEMP_DIR, { recursive: true });
fs.mkdirSync(PAGES_DIR, { recursive: true });

class PageMediaError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = 'PageMediaError';
    this.status = status;
  }
}

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => fs.mkdir(TEMP_DIR, { recursive: true }, (err) => cb(err, TEMP_DIR)),
    filename: (req, file, cb) => cb(null, `${crypto.randomUUID()}.envoi`),
  }),
  fileFilter: (req, file, cb) => {
    if (PHOTO_MIME_TYPES.includes(file.mimetype) || VIDEO_EXTENSION_BY_MIME[file.mimetype] || file.mimetype === PDF_MIME_TYPE) {
      return cb(null, true);
    }
    return cb(new PageMediaError('Format non pris en charge : photo (JPEG, PNG, WebP, GIF), vidéo (MP4, WebM, MOV) ou document PDF.'));
  },
});

function handlePageUpload(req, res, next) {
  upload.single('file')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err instanceof PageMediaError ? err.message : 'Envoi invalide' });
    if (!req.file) return res.status(400).json({ error: 'Aucun fichier reçu' });
    return next();
  });
}

function pageDir(resourceId) {
  if (!UUID_RE.test(String(resourceId))) throw new PageMediaError('Ressource invalide', 404);
  return path.join(PAGES_DIR, resourceId);
}

function mediaPath(resourceId, name) {
  if (!isPageFileName(name)) return null;
  return path.join(pageDir(resourceId), name);
}

function drawOriented(context, image, orientation, width, height) {
  const transforms = {
    2: [-1, 0, 0, 1, width, 0],
    3: [-1, 0, 0, -1, width, height],
    4: [1, 0, 0, -1, 0, height],
    5: [0, 1, 1, 0, 0, 0],
    6: [0, 1, -1, 0, width, 0],
    7: [0, -1, -1, 0, width, height],
    8: [0, -1, 1, 0, 0, height],
  };
  if (transforms[orientation]) context.transform(...transforms[orientation]);
  const swapped = orientation >= 5;
  context.drawImage(image, 0, 0, swapped ? height : width, swapped ? width : height);
}

async function convertPhoto(rawPath) {
  const { loadImage, createCanvas } = require('@napi-rs/canvas');
  const bytes = await fs.promises.readFile(rawPath);
  const size = imageSize(bytes);
  if (!size) throw new PageMediaError('Image illisible.');
  if (size.width * size.height > MAX_PHOTO_PIXELS) {
    throw new PageMediaError('Image trop grande (60 mégapixels au plus).');
  }
  let image;
  try {
    image = await loadImage(bytes);
  } catch {
    throw new PageMediaError('Image illisible.');
  }
  const orientation = size.format === 'jpeg' ? jpegOrientation(bytes) : 1;
  const uprightWidth = orientation >= 5 ? image.height : image.width;
  const uprightHeight = orientation >= 5 ? image.width : image.height;
  const scale = Math.min(1, MAX_PHOTO_WIDTH / uprightWidth);
  const width = Math.max(1, Math.round(uprightWidth * scale));
  const height = Math.max(1, Math.round(uprightHeight * scale));
  const canvas = createCanvas(width, height);
  drawOriented(canvas.getContext('2d'), image, orientation, width, height);
  return canvas.encode('webp', WEBP_QUALITY);
}

async function assertVideoSignature(filePath, extension) {
  const handle = await fs.promises.open(filePath, 'r');
  try {
    const { buffer, bytesRead } = await handle.read(Buffer.alloc(12), 0, 12, 0);
    const head = buffer.subarray(0, bytesRead);
    const box = head.toString('latin1', 4, 8);
    const valid =
      extension === 'webm'
        ? head.length >= 4 && head.readUInt32BE(0) === 0x1a45dfa3
        : ['ftyp', 'moov', 'mdat', 'wide', 'free', 'skip'].includes(box);
    if (!valid) throw new PageMediaError('Vidéo illisible : le fichier ne correspond pas à son format.');
  } finally {
    await handle.close();
  }
}

async function assertReadablePdf(filePath) {
  const handle = await fs.promises.open(filePath, 'r');
  let head;
  try {
    const { buffer, bytesRead } = await handle.read(Buffer.alloc(1024), 0, 1024, 0);
    head = buffer.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
  if (!head.includes('%PDF-')) throw new PageMediaError('Document illisible : le fichier n’est pas un PDF.');
  let pages = [];
  try {
    ({ pages } = await pdfRender.describe(filePath));
  } catch {
    throw new PageMediaError('PDF illisible : le fichier est abîmé ou protégé par un mot de passe.');
  }
  if (!pages.length) throw new PageMediaError('Ce PDF ne contient aucune page.');
}

async function purgeExpired() {
  const { rows } = await db.query(
    `DELETE FROM resource_page_uploads WHERE created_at < now() - interval '24 hours' RETURNING file_path`
  );
  rows.forEach((row) => fs.unlink(row.file_path, () => {}));
  const names = await fs.promises.readdir(TEMP_DIR).catch(() => []);
  const now = Date.now();
  for (const name of names.filter((n) => n.endsWith('.envoi'))) {
    const stat = await fs.promises.stat(path.join(TEMP_DIR, name)).catch(() => null);
    if (stat && now - stat.mtimeMs > UPLOAD_TTL_MS) fs.unlink(path.join(TEMP_DIR, name), () => {});
  }
}

async function storeUpload(file, userId) {
  purgeExpired().catch(() => {});
  const id = crypto.randomUUID();
  let finalPath = null;
  try {
    let kind;
    let extension;
    let size;
    if (PHOTO_MIME_TYPES.includes(file.mimetype)) {
      if (file.size > MAX_PHOTO_BYTES) throw new PageMediaError('Photo trop lourde (15 Mo au plus).');
      const webp = await convertPhoto(file.path);
      kind = 'photo';
      extension = 'webp';
      finalPath = path.join(TEMP_DIR, `${id}.webp`);
      await fs.promises.writeFile(finalPath, webp);
      size = webp.length;
    } else if (file.mimetype === PDF_MIME_TYPE) {
      if (file.size > MAX_DOCUMENT_BYTES) throw new PageMediaError('Document trop lourd (20 Mo au plus).');
      kind = 'document';
      extension = 'pdf';
      finalPath = path.join(TEMP_DIR, `${id}.pdf`);
      await fs.promises.rename(file.path, finalPath);
      await assertReadablePdf(finalPath);
      size = file.size;
    } else {
      extension = VIDEO_EXTENSION_BY_MIME[file.mimetype];
      await assertVideoSignature(file.path, extension);
      kind = 'video';
      finalPath = path.join(TEMP_DIR, `${id}.${extension}`);
      await fs.promises.rename(file.path, finalPath);
      size = file.size;
    }
    await db.query(
      `INSERT INTO resource_page_uploads (id, user_id, kind, extension, file_path, file_size)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [id, userId, kind, extension, finalPath, size]
    );
    return { jeton: `televersement:${id}`, genre: kind };
  } catch (err) {
    if (finalPath) fs.unlink(finalPath, () => {});
    throw err;
  } finally {
    fs.unlink(file.path, () => {});
  }
}

async function claimUploads(tokenIds, userId) {
  if (tokenIds.length === 0) return new Map();
  const { rows } = await db.query(
    `SELECT id, kind, extension, file_path FROM resource_page_uploads
     WHERE id = ANY($1::uuid[]) AND user_id = $2 AND created_at > now() - interval '24 hours'`,
    [tokenIds, userId]
  );
  const uploads = new Map(rows.map((row) => [row.id, row]));
  if (tokenIds.some((tokenId) => !uploads.has(tokenId) || !fs.existsSync(uploads.get(tokenId).file_path))) {
    throw new PageMediaError('Un fichier envoyé a expiré ou ne vous appartient pas. Renvoyez-le.');
  }
  return uploads;
}

async function moveFile(from, to) {
  try {
    await fs.promises.rename(from, to);
  } catch (err) {
    if (err.code !== 'EXDEV') throw err;
    await fs.promises.copyFile(from, to);
    await fs.promises.unlink(from);
  }
}

async function undoMoves(moves) {
  for (const move of [...moves].reverse()) {
    if (move.done) await moveFile(move.to, move.from).catch(() => {});
  }
}

async function materialize(blocs, { resourceId, uploads }) {
  const dir = pageDir(resourceId);
  const moves = [];
  const names = new Map();
  const result = blocs.map((block) => {
    const token = typeof block.fichier === 'string' ? block.fichier.match(UPLOAD_TOKEN_RE) : null;
    if (!token) return block;
    const row = uploads.get(token[1]);
    if (!row || row.kind !== block.type) throw new PageMediaError('Un fichier envoyé ne correspond pas à son bloc.');
    if (!names.has(row.id)) {
      const name = `${row.kind}-${crypto.randomBytes(8).toString('hex')}.${row.extension}`;
      names.set(row.id, name);
      moves.push({ id: row.id, from: row.file_path, to: path.join(dir, name), done: false });
    }
    return { ...block, fichier: names.get(row.id) };
  });
  await fs.promises.mkdir(dir, { recursive: true });
  try {
    for (const move of moves) {
      await moveFile(move.from, move.to);
      move.done = true;
    }
  } catch (err) {
    await undoMoves(moves);
    throw err;
  }
  return { blocs: result, moves };
}

async function forgetUploads(moves) {
  const ids = moves.map((move) => move.id);
  if (ids.length) await db.query('DELETE FROM resource_page_uploads WHERE id = ANY($1::uuid[])', [ids]);
}

async function existingFiles(resourceId) {
  const names = await fs.promises.readdir(pageDir(resourceId)).catch(() => []);
  return new Set(names.filter(isPageFileName));
}

async function removeUnusedFiles(resourceId, blocs) {
  const used = filesUsedBy(blocs);
  const removed = [];
  for (const name of await existingFiles(resourceId)) {
    if (used.has(name)) continue;
    await fs.promises.unlink(path.join(pageDir(resourceId), name)).catch(() => {});
    removed.push(name);
  }
  return removed;
}

async function removePageDir(resourceId) {
  await fs.promises.rm(pageDir(resourceId), { recursive: true, force: true });
}

module.exports = {
  handlePageUpload,
  storeUpload,
  claimUploads,
  materialize,
  undoMoves,
  forgetUploads,
  existingFiles,
  removeUnusedFiles,
  removePageDir,
  mediaPath,
  convertPhoto,
  PageMediaError,
  TEMP_DIR,
  PAGES_DIR,
};
