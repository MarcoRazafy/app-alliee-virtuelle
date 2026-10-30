const MAX_BLOCKS = 80;
const MAX_TEXT_CHARS = 30000;
const MAX_CONTENT_JSON_CHARS = 400000;
const MAX_TITLE_CHARS = 200;
const MAX_CAPTION_CHARS = 300;
const MAX_LINES_PER_BLOCK = 500;
const MAX_LINK_CHARS = 500;
const MAX_DOCUMENT_NAME_CHARS = 200;

const PALETTE = ['#256bff', '#4da3ff', '#22c55e', '#f59e0b', '#ef4444', '#64748b'];
const SIZES = ['petit', 'grand', 'tres-grand'];
const ALIGNMENTS = ['centre', 'droite'];
const VIDEO_EXTENSIONS = ['mp4', 'webm', 'mov'];

const UPLOAD_TOKEN_RE = /^televersement:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/;
const PHOTO_FILE_RE = /^photo-[0-9a-f]{16}\.webp$/;
const VIDEO_FILE_RE = /^video-[0-9a-f]{16}\.(mp4|webm|mov)$/;
const DOCUMENT_FILE_RE = /^document-[0-9a-f]{16}\.pdf$/;
const FILE_PATTERNS = { photo: PHOTO_FILE_RE, video: VIDEO_FILE_RE, document: DOCUMENT_FILE_RE };
const MISSING_FILE = {
  photo: 'Une photo de la page est introuvable. Renvoyez-la.',
  video: 'Une vidéo de la page est introuvable. Renvoyez-la.',
  document: 'Un document de la page est introuvable. Renvoyez-le.',
};
const DOMAIN_RE = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i;

class PageBlockError extends Error {
  constructor(message) {
    super(message);
    this.name = 'PageBlockError';
    this.status = 400;
  }
}

const isPlainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

function cleanText(value, { singleLine = false } = {}) {
  if (typeof value !== 'string') return '';
  const text = value.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '');
  return singleLine ? text.replace(/\n+/g, ' ') : text;
}

function lienSur(value) {
  if (typeof value !== 'string') return null;
  const raw = value.trim();
  if (!raw || raw.length > MAX_LINK_CHARS) return null;
  if (/[\s<>"'`\\\u0000-\u001f\u007f]/.test(raw)) return null;

  if (raw.startsWith('/')) return raw.startsWith('//') ? null : raw;

  const lower = raw.toLowerCase();
  if (lower.startsWith('mailto:')) {
    return /^mailto:[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,63}$/i.test(raw) ? raw : null;
  }
  if (lower.startsWith('tel:')) {
    return /^tel:\+?[0-9().-]{3,30}$/.test(raw) ? raw : null;
  }

  const hasScheme = /^[a-z][a-z0-9+.-]*:/i.test(raw);
  if (hasScheme && !/^https?:\/\//i.test(raw)) return null;
  let url;
  try {
    url = new URL(hasScheme ? raw : `https://${raw}`);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  if (url.username || url.password || url.port) return null;
  if (!DOMAIN_RE.test(url.hostname)) return null;
  return url.href.length > MAX_LINK_CHARS ? null : url.href;
}

function lienVideo(value) {
  if (typeof value !== 'string') return null;
  const raw = value.trim();
  if (!raw || raw.length > MAX_LINK_CHARS || /[\s<>"'`\\]/.test(raw)) return null;
  let url;
  try {
    url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  const host = url.hostname.toLowerCase().replace(/^(www|m)\./, '');

  let youtubeId = null;
  if (host === 'youtu.be') {
    youtubeId = url.pathname.split('/')[1] || '';
  } else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    if (url.pathname === '/watch') youtubeId = url.searchParams.get('v') || '';
    else {
      const match = url.pathname.match(/^\/(?:embed|shorts|live)\/([^/]+)\/?$/);
      youtubeId = match ? match[1] : '';
    }
  }
  if (youtubeId !== null) {
    if (!/^[A-Za-z0-9_-]{11}$/.test(youtubeId)) return null;
    return { fournisseur: 'youtube', id: youtubeId, url: `https://www.youtube-nocookie.com/embed/${youtubeId}` };
  }

  if (host === 'vimeo.com' || host === 'player.vimeo.com') {
    const match = url.pathname.match(/^\/(?:video\/)?(\d{1,12})\/?$/);
    if (!match) return null;
    return { fournisseur: 'vimeo', id: match[1], url: `https://player.vimeo.com/video/${match[1]}` };
  }
  return null;
}

function readColor(value) {
  if (typeof value !== 'string') return undefined;
  const color = value.toLowerCase();
  return PALETTE.includes(color) ? color : undefined;
}

function readPassage(value, counter) {
  if (!isPlainObject(value)) return null;
  const t = cleanText(value.t);
  if (!t) return null;
  counter.chars += t.length;
  const passage = { t };
  if (value.g === true) passage.g = true;
  if (value.i === true) passage.i = true;
  if (value.s === true) passage.s = true;
  const lien = lienSur(value.lien);
  if (lien) passage.lien = lien;
  const couleur = readColor(value.couleur);
  if (couleur) passage.couleur = couleur;
  if (SIZES.includes(value.taille)) passage.taille = value.taille;
  return passage;
}

const STYLE_KEYS = ['g', 'i', 's', 'lien', 'couleur', 'taille'];
const sameStyle = (a, b) => STYLE_KEYS.every((key) => a[key] === b[key]);

function readPassages(value, counter) {
  if (!Array.isArray(value)) return [];
  const passages = [];
  for (const raw of value.slice(0, 2000)) {
    const passage = readPassage(raw, counter);
    if (!passage) continue;
    const previous = passages[passages.length - 1];
    if (previous && sameStyle(previous, passage)) previous.t += passage.t;
    else passages.push(passage);
  }
  return passages;
}

function readLine(value, counter) {
  if (!isPlainObject(value)) return null;
  if (value.genre === 'p') {
    const line = { genre: 'p', passages: readPassages(value.passages, counter) };
    if (ALIGNMENTS.includes(value.alignement)) line.alignement = value.alignement;
    return line;
  }
  if (value.genre === 'ul' || value.genre === 'ol') {
    if (!Array.isArray(value.items)) return null;
    const items = value.items
      .slice(0, MAX_LINES_PER_BLOCK)
      .map((item) => readPassages(item, counter))
      .filter((item) => item.length > 0);
    return items.length ? { genre: value.genre, items } : null;
  }
  return null;
}

const isEmptyParagraph = (line) => line.genre === 'p' && line.passages.length === 0;

function readFileReference(value, kind, context) {
  if (typeof value !== 'string') return null;
  const token = value.match(UPLOAD_TOKEN_RE);
  if (token) {
    context.tokens.add(token[1]);
    return value;
  }
  if (FILE_PATTERNS[kind].test(value) && context.existingFiles.has(value)) return value;
  throw new PageBlockError(MISSING_FILE[kind]);
}

function readBlock(value, counter, context) {
  if (!isPlainObject(value)) return null;

  if (value.type === 'titre') {
    const texte = cleanText(value.texte, { singleLine: true }).trim();
    if (!texte) return null;
    if (texte.length > MAX_TITLE_CHARS) throw new PageBlockError(`Un titre dépasse ${MAX_TITLE_CHARS} caractères.`);
    counter.chars += texte.length;
    const block = { type: 'titre', texte, niveau: value.niveau === 3 ? 3 : 2 };
    if (ALIGNMENTS.includes(value.alignement)) block.alignement = value.alignement;
    const couleur = readColor(value.couleur);
    if (couleur) block.couleur = couleur;
    return block;
  }

  if (value.type === 'texte') {
    if (!Array.isArray(value.lignes)) return null;
    if (value.lignes.length > MAX_LINES_PER_BLOCK) {
      throw new PageBlockError(`Un bloc de texte dépasse ${MAX_LINES_PER_BLOCK} lignes.`);
    }
    const lignes = value.lignes.map((line) => readLine(line, counter)).filter(Boolean);
    while (lignes.length && isEmptyParagraph(lignes[0])) lignes.shift();
    while (lignes.length && isEmptyParagraph(lignes[lignes.length - 1])) lignes.pop();
    return lignes.length ? { type: 'texte', lignes } : null;
  }

  if (value.type === 'photo') {
    if (typeof value.fichier !== 'string' || !value.fichier) return null;
    const block = { type: 'photo', fichier: readFileReference(value.fichier, 'photo', context) };
    const legende = cleanText(value.legende, { singleLine: true }).trim();
    if (legende) {
      if (legende.length > MAX_CAPTION_CHARS) throw new PageBlockError(`Une légende dépasse ${MAX_CAPTION_CHARS} caractères.`);
      counter.chars += legende.length;
      block.legende = legende;
    }
    return block;
  }

  if (value.type === 'video') {
    if (value.source === 'fichier') {
      if (typeof value.fichier !== 'string' || !value.fichier) return null;
      return { type: 'video', source: 'fichier', fichier: readFileReference(value.fichier, 'video', context) };
    }
    if (value.source === 'lien') {
      if (typeof value.url !== 'string' || !value.url.trim()) return null;
      const video = lienVideo(value.url);
      if (!video) throw new PageBlockError('Un lien vidéo n’est pas un lien YouTube ou Vimeo valide.');
      return { type: 'video', source: 'lien', url: video.url };
    }
    return null;
  }

  if (value.type === 'document') {
    if (typeof value.fichier !== 'string' || !value.fichier) return null;
    const block = { type: 'document', fichier: readFileReference(value.fichier, 'document', context) };
    const nom = cleanText(value.nom, { singleLine: true }).trim();
    if (nom) {
      if (nom.length > MAX_DOCUMENT_NAME_CHARS) {
        throw new PageBlockError(`Un nom de document dépasse ${MAX_DOCUMENT_NAME_CHARS} caractères.`);
      }
      block.nom = nom;
    }
    return block;
  }

  return null;
}

function lireBlocs(value, { existingFiles = new Set() } = {}) {
  let input = value;
  if (typeof input === 'string') {
    if (input.length > MAX_CONTENT_JSON_CHARS) throw new PageBlockError('Le contenu de la page est trop volumineux.');
    try {
      input = JSON.parse(input);
    } catch {
      throw new PageBlockError('Le contenu de la page est illisible.');
    }
  }
  if (!Array.isArray(input)) throw new PageBlockError('Le contenu de la page est illisible.');
  if (input.length > MAX_BLOCKS) throw new PageBlockError(`Une page compte au plus ${MAX_BLOCKS} blocs.`);

  const counter = { chars: 0 };
  const context = { existingFiles, tokens: new Set() };
  const blocs = input.map((raw) => readBlock(raw, counter, context)).filter(Boolean);
  if (counter.chars > MAX_TEXT_CHARS) {
    throw new PageBlockError(`Le texte de la page dépasse ${MAX_TEXT_CHARS.toLocaleString('fr-FR')} caractères.`);
  }
  return { blocs, tokens: [...context.tokens] };
}

const isPageFileName = (name) => Object.values(FILE_PATTERNS).some((pattern) => pattern.test(name));
const isPageDocumentName = (name) => DOCUMENT_FILE_RE.test(name);

function filesUsedBy(blocs) {
  const files = new Set();
  for (const block of Array.isArray(blocs) ? blocs : []) {
    if (block && typeof block.fichier === 'string' && isPageFileName(block.fichier)) files.add(block.fichier);
  }
  return files;
}

module.exports = {
  lireBlocs,
  lienSur,
  lienVideo,
  filesUsedBy,
  isPageFileName,
  isPageDocumentName,
  PageBlockError,
  PALETTE,
  SIZES,
  ALIGNMENTS,
  VIDEO_EXTENSIONS,
  MAX_BLOCKS,
  MAX_TEXT_CHARS,
  UPLOAD_TOKEN_RE,
};
