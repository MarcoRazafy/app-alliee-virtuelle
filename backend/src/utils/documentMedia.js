const MEDIA_URL_PREFIX = '/api/resources/media/';

const UUID = '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}';
const MEDIA_REF_RE = new RegExp(`/api/resources/media/(${UUID})`, 'g');
const UUID_RE = new RegExp(`^${UUID}$`);

const IMAGE_MIME_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];

function extractMediaIds(html) {
  const ids = new Set();
  for (const match of String(html || '').matchAll(MEDIA_REF_RE)) ids.add(match[1].toLowerCase());
  return [...ids];
}

function mediaKind(mime, isVideoMime) {
  if (IMAGE_MIME_TYPES.includes(mime)) return 'image';
  if (isVideoMime(mime)) return 'video';
  if (mime === 'application/pdf') return 'pdf';
  return null;
}

function isUuid(value) {
  return UUID_RE.test(String(value || ''));
}

module.exports = { MEDIA_URL_PREFIX, extractMediaIds, mediaKind, isUuid };
