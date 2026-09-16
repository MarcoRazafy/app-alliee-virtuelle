// Médias insérés dans un document des Ressources (photo, vidéo, PDF).
//
// Un document référence ses médias par leur adresse dans son HTML : /api/resources/media/<id>.
// C'est la seule trace du lien entre les deux — pas de table de liaison à tenir à jour. Ces
// fonctions retrouvent donc les médias d'un document en lisant son contenu.

const MEDIA_URL_PREFIX = '/api/resources/media/';

const UUID = '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}';
const MEDIA_REF_RE = new RegExp(`/api/resources/media/(${UUID})`, 'g');
const UUID_RE = new RegExp(`^${UUID}$`);

const IMAGE_MIME_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];

// Identifiants des médias cités dans un HTML, sans doublon, en minuscules.
function extractMediaIds(html) {
  const ids = new Set();
  for (const match of String(html || '').matchAll(MEDIA_REF_RE)) ids.add(match[1].toLowerCase());
  return [...ids];
}

// Famille d'un média insérable, ou null si le type n'a pas sa place dans un document.
// (Un Word ou un Excel s'importe comme fichier du dossier, pas dans le texte.)
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
