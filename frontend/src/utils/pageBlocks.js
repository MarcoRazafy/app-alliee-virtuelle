export const MAX_BLOCKS = 80;
export const MAX_TEXT_CHARS = 30000;

export const PALETTE = [
  { value: '#256bff', label: 'Bleu' },
  { value: '#4da3ff', label: 'Bleu ciel' },
  { value: '#22c55e', label: 'Vert' },
  { value: '#f59e0b', label: 'Orange' },
  { value: '#ef4444', label: 'Rouge' },
  { value: '#64748b', label: 'Gris' },
];
export const PALETTE_VALUES = PALETTE.map((color) => color.value);

export const SIZES = [
  { value: 'petit', label: 'Petit' },
  { value: '', label: 'Normal' },
  { value: 'grand', label: 'Grand' },
  { value: 'tres-grand', label: 'Très grand' },
];

export const ALIGNMENTS = [
  { value: '', label: 'Aligner à gauche' },
  { value: 'centre', label: 'Centrer' },
  { value: 'droite', label: 'Aligner à droite' },
];

export const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
export const VIDEO_TYPES = ['video/mp4', 'video/webm', 'video/quicktime'];
export const PHOTO_ACCEPT = PHOTO_TYPES.join(',');
export const VIDEO_ACCEPT = `${VIDEO_TYPES.join(',')},.mov`;
export const DOCUMENT_ACCEPT = 'application/pdf';
export const MAX_DOCUMENT_NAME_CHARS = 200;

export const isPhotoFile = (file) => PHOTO_TYPES.includes(file?.type);
export const isVideoFile = (file) => VIDEO_TYPES.includes(file?.type) || /\.mov$/i.test(file?.name || '');
export const isDocumentFile = (file) => file?.type === 'application/pdf';
export const documentLabel = (fileName) => (fileName || '').replace(/\.pdf$/i, '').trim().slice(0, MAX_DOCUMENT_NAME_CHARS);

const DOMAIN_RE = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i;
const EMBED_RE = /^https:\/\/(?:www\.youtube-nocookie\.com\/embed\/[A-Za-z0-9_-]{11}|player\.vimeo\.com\/video\/\d{1,12})$/;
const UPLOAD_TOKEN_RE = /^televersement:[0-9a-f-]{36}$/;

export function lienSur(value) {
  if (typeof value !== 'string') return null;
  const raw = value.trim();
  if (!raw || raw.length > 500) return null;
  if (/[\s<>"'`\\\u0000-\u001f\u007f]/.test(raw)) return null;
  if (raw.startsWith('/')) return raw.startsWith('//') ? null : raw;
  const lower = raw.toLowerCase();
  if (lower.startsWith('mailto:')) return /^mailto:[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,63}$/i.test(raw) ? raw : null;
  if (lower.startsWith('tel:')) return /^tel:\+?[0-9().-]{3,30}$/.test(raw) ? raw : null;
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
  return url.href.length > 500 ? null : url.href;
}

export function lienVideo(value) {
  if (typeof value !== 'string') return null;
  const raw = value.trim();
  if (!raw || raw.length > 500 || /[\s<>"'`\\]/.test(raw)) return null;
  let url;
  try {
    url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  const host = url.hostname.toLowerCase().replace(/^(www|m)\./, '');
  let youtubeId = null;
  if (host === 'youtu.be') youtubeId = url.pathname.split('/')[1] || '';
  else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    if (url.pathname === '/watch') youtubeId = url.searchParams.get('v') || '';
    else {
      const match = url.pathname.match(/^\/(?:embed|shorts|live)\/([^/]+)\/?$/);
      youtubeId = match ? match[1] : '';
    }
  }
  if (youtubeId !== null) {
    return /^[A-Za-z0-9_-]{11}$/.test(youtubeId)
      ? { fournisseur: 'youtube', url: `https://www.youtube-nocookie.com/embed/${youtubeId}` }
      : null;
  }
  if (host === 'vimeo.com' || host === 'player.vimeo.com') {
    const match = url.pathname.match(/^\/(?:video\/)?(\d{1,12})\/?$/);
    return match ? { fournisseur: 'vimeo', url: `https://player.vimeo.com/video/${match[1]}` } : null;
  }
  return null;
}

export const isSafeEmbedUrl = (url) => typeof url === 'string' && EMBED_RE.test(url);
export const isUploadToken = (value) => typeof value === 'string' && UPLOAD_TOKEN_RE.test(value);
export const isExternalLink = (href) => /^https?:\/\//i.test(href);

let keyCounter = 0;
export function newKey() {
  keyCounter += 1;
  return `bloc-${Date.now().toString(36)}-${keyCounter}`;
}

export function newBlock(type) {
  const cle = newKey();
  if (type === 'titre') return { cle, type: 'titre', texte: '', niveau: 2 };
  if (type === 'texte') return { cle, type: 'texte', lignes: [{ genre: 'p', passages: [] }] };
  if (type === 'photo') return { cle, type: 'photo', fichier: '', legende: '' };
  if (type === 'document') return { cle, type: 'document', fichier: '', nom: '' };
  return { cle, type: 'video', source: 'fichier', fichier: '', url: '' };
}

export const withKeys = (blocks) => (Array.isArray(blocks) ? blocks : []).map((block) => ({ ...block, cle: newKey() }));

export function serializeBlocks(blocks) {
  return blocks.map((block) => {
    if (block.type === 'titre') {
      const out = { type: 'titre', texte: block.texte, niveau: block.niveau };
      if (block.alignement) out.alignement = block.alignement;
      if (block.couleur) out.couleur = block.couleur;
      return out;
    }
    if (block.type === 'texte') return { type: 'texte', lignes: block.lignes };
    if (block.type === 'photo') {
      const out = { type: 'photo', fichier: block.fichier || '' };
      if (block.legende && block.legende.trim()) out.legende = block.legende.trim();
      return out;
    }
    if (block.type === 'document') {
      const out = { type: 'document', fichier: block.fichier || '' };
      if (block.nom && block.nom.trim()) out.nom = block.nom.trim();
      return out;
    }
    if (block.source === 'lien') return { type: 'video', source: 'lien', url: block.url || '' };
    return { type: 'video', source: 'fichier', fichier: block.fichier || '' };
  });
}

function linesText(lines) {
  return (lines || [])
    .flatMap((line) => (line.genre === 'p' ? [line.passages] : line.items))
    .flat()
    .map((passage) => passage.t)
    .join('');
}

export function textLength(blocks) {
  return blocks.reduce((total, block) => {
    if (block.type === 'titre') return total + (block.texte || '').trim().length;
    if (block.type === 'texte') return total + linesText(block.lignes).length;
    if (block.type === 'photo') return total + (block.legende || '').trim().length;
    return total;
  }, 0);
}

export const isLinesEmpty = (lines) => !linesText(lines).trim();
