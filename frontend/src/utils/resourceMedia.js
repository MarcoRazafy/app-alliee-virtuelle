// Règles d'import et de lecture des ressources, côté interface.
//
// Elles reprennent celles du serveur (config/resourceUpload) pour prévenir AVANT l'envoi :
// découvrir qu'un PDF de 25 Mo est refusé une fois ses 25 Mo transférés ferait perdre du
// temps pour rien. Le serveur reste l'autorité et revérifie tout.

// Formats qu'un navigateur sait lire dans un <video>.
export const VIDEO_MIME_TYPES = ['video/mp4', 'video/webm', 'video/quicktime', 'video/x-m4v', 'video/ogg'];

// Limite des documents. Les vidéos n'en ont pas.
export const DOCUMENT_MAX_BYTES = 20 * 1024 * 1024;

// Extensions ET types : certains systèmes ne reconnaissent un .mov qu'à son extension.
export const RESOURCE_ACCEPT = [
  '.pdf,.png,.jpg,.jpeg,.gif,.webp,.doc,.docx,.xls,.xlsx,.txt',
  '.mp4,.webm,.mov,.m4v,.ogv',
  VIDEO_MIME_TYPES.join(','),
].join(',');

export function isVideoMime(mime) {
  return VIDEO_MIME_TYPES.includes(mime);
}

// Rend le message à afficher si le fichier ne peut pas partir, sinon null.
export function uploadSizeError(file) {
  if (!file) return null;
  if (isVideoMime(file.type)) return null;
  if (file.size > DOCUMENT_MAX_BYTES) return 'Fichier trop volumineux (20 Mo maximum, sauf vidéos)';
  return null;
}

// Progression d'envoi en pourcentage entier, bornée à 0–100. `total` peut manquer quand le
// navigateur ne connaît pas la taille : on ne montre alors rien plutôt qu'un chiffre faux.
export function uploadPercent(loaded, total) {
  if (!total || total <= 0) return null;
  return Math.max(0, Math.min(100, Math.floor((loaded / total) * 100)));
}
