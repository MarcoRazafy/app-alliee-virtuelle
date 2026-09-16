// Médias insérés dans un document des Ressources : photo, vidéo, PDF.
//
// Le document les cite par leur adresse (/api/resources/media/<id>) dans son HTML — c'est la
// même convention que le serveur (backend/src/utils/documentMedia.js), qui s'en sert pour
// savoir quels médias un document utilise encore.

import { VIDEO_MIME_TYPES, isVideoMime } from './resourceMedia.js';

const UUID = '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}';
const MEDIA_REF_RE = new RegExp(`/api/resources/media/(${UUID})`, 'g');

const IMAGE_MIME_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];

// Sélecteur de fichier du bouton « Photo, vidéo, PDF ».
export const DOCUMENT_MEDIA_ACCEPT = [
  '.png,.jpg,.jpeg,.gif,.webp,.pdf,.mp4,.webm,.mov,.m4v,.ogv',
  IMAGE_MIME_TYPES.join(','),
  VIDEO_MIME_TYPES.join(','),
  'application/pdf',
].join(',');

export function mediaUrl(id) {
  return `/api/resources/media/${id}`;
}

// Famille insérable, ou null (un Word ou un Excel s'importe comme fichier du dossier).
export function documentMediaKind(mime) {
  if (IMAGE_MIME_TYPES.includes(mime)) return 'image';
  if (isVideoMime(mime)) return 'video';
  if (mime === 'application/pdf') return 'pdf';
  return null;
}

export function extractMediaIds(html) {
  const ids = new Set();
  for (const match of String(html || '').matchAll(MEDIA_REF_RE)) ids.add(match[1].toLowerCase());
  return [...ids];
}

// Le nom du fichier vient de l'utilisateur et finit dans du HTML : il doit être échappé,
// sinon un fichier nommé « <img onerror=…>.pdf » deviendrait du code dans le document.
export function escapeHtml(text) {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// HTML à insérer dans l'éditeur pour un média importé.
//
// - Le bloc est en contenteditable="false" : il se comporte comme un seul caractère — on le
//   supprime d'un coup, on ne tape pas de texte au milieu d'une vidéo.
// - Un paragraphe vide suit, pour qu'on puisse continuer à écrire après le média.
// - La vidéo reprend les règles des Ressources : lecture dans l'application, sans bouton de
//   téléchargement.
// - Le PDF est une carte cliquable, pas un cadre intégré : un PDF dans un cadre ne s'affiche
//   pas sur Android, et se manipule mal dans un éditeur. Un clic l'ouvre dans la visionneuse.
export function mediaHtml({ id, kind, fileName }) {
  const url = mediaUrl(id);
  const name = escapeHtml(fileName);
  const open = `<figure class="resource-doc-media resource-doc-media--${kind}" contenteditable="false" data-media-id="${id}">`;
  let inner;
  if (kind === 'image') {
    inner = `<img src="${url}" alt="${name}">`;
  } else if (kind === 'video') {
    inner = `<video src="${url}" controls controlslist="nodownload noremoteplayback" preload="metadata" playsinline></video>`;
  } else {
    inner = `<a class="resource-doc-pdf" href="${url}" data-media-id="${id}" data-file-name="${name}">${name}</a>`;
  }
  return `${open}${inner}</figure><p><br></p>`;
}

// Médias à effacer quand l'éditeur se ferme.
// - Enregistré : tout ce qui était là (au départ ou importé depuis) et n'y est plus.
// - Abandonné : seulement ce qui a été importé pendant cette édition — le document enregistré
//   cite toujours ses médias d'origine.
// Le serveur refuse de toute façon d'effacer un média qu'un autre document cite encore.
export function mediaIdsToDelete({ initialIds = [], sessionIds = [], finalIds = [], saved }) {
  if (!saved) return sessionIds.filter((id) => !initialIds.includes(id));
  const kept = new Set(finalIds);
  return [...new Set([...initialIds, ...sessionIds])].filter((id) => !kept.has(id));
}
