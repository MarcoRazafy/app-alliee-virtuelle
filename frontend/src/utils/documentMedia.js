import { VIDEO_MIME_TYPES, isVideoMime } from './resourceMedia.js';

const UUID = '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}';
const MEDIA_REF_RE = new RegExp(`/api/resources/media/(${UUID})`, 'g');

const IMAGE_MIME_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];

export const DOCUMENT_MEDIA_ACCEPT = [
  '.png,.jpg,.jpeg,.gif,.webp,.pdf,.mp4,.webm,.mov,.m4v,.ogv',
  IMAGE_MIME_TYPES.join(','),
  VIDEO_MIME_TYPES.join(','),
  'application/pdf',
].join(',');

export function mediaUrl(id) {
  return `/api/resources/media/${id}`;
}

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

export function escapeHtml(text) {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

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

export function mediaIdsToDelete({ initialIds = [], sessionIds = [], finalIds = [], saved }) {
  if (!saved) return sessionIds.filter((id) => !initialIds.includes(id));
  const kept = new Set(finalIds);
  return [...new Set([...initialIds, ...sessionIds])].filter((id) => !kept.has(id));
}
