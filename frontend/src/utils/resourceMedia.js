export const VIDEO_MIME_TYPES = ['video/mp4', 'video/webm', 'video/quicktime', 'video/x-m4v', 'video/ogg'];

export const DOCUMENT_MAX_BYTES = 20 * 1024 * 1024;

export const RESOURCE_ACCEPT = [
  '.pdf,.png,.jpg,.jpeg,.gif,.webp,.doc,.docx,.xls,.xlsx,.txt',
  '.mp4,.webm,.mov,.m4v,.ogv',
  VIDEO_MIME_TYPES.join(','),
].join(',');

export function isVideoMime(mime) {
  return VIDEO_MIME_TYPES.includes(mime);
}

export function uploadSizeError(file) {
  if (!file) return null;
  if (isVideoMime(file.type)) return null;
  if (file.size > DOCUMENT_MAX_BYTES) return 'Fichier trop volumineux (20 Mo maximum, sauf vidéos)';
  return null;
}

export function uploadPercent(loaded, total) {
  if (!total || total <= 0) return null;
  return Math.max(0, Math.min(100, Math.floor((loaded / total) * 100)));
}
