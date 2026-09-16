const fs = require('fs');
const path = require('path');
const multer = require('multer');

const UPLOAD_DIR = path.join(__dirname, '../../uploads/resources');
// Limite des documents (PDF, Word, images…). Les vidéos, elles, n'en ont pas : une formation
// filmée dépasse vite quelques centaines de Mo. La seule borne est l'espace disque du volume.
const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20 Mo

// multer.diskStorage échoue si le dossier n'existe pas → on le crée au démarrage.
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const DOCUMENT_MIME_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'text/plain',
];

// Formats qu'un navigateur sait lire dans un <video>. MKV et AVI en sont absents à dessein :
// on les accepterait, puis personne ne pourrait les regarder dans l'application.
const VIDEO_MIME_TYPES = ['video/mp4', 'video/webm', 'video/quicktime', 'video/x-m4v', 'video/ogg'];

function isVideoMime(mime) {
  return VIDEO_MIME_TYPES.includes(mime);
}

// path.basename() retire tout composant de chemin (../, /) ; on ne garde que des caractères sûrs.
function sanitizeFileName(originalName) {
  const baseName = path.basename(originalName);
  return baseName.replace(/[^a-zA-Z0-9._-]/g, '_');
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => cb(null, `${Date.now()}-${sanitizeFileName(file.originalname)}`),
});

// Pas de limite de taille ici : multer ne connaît qu'une limite unique, or elle dépend du
// type (documents bornés, vidéos non). Le fichier s'écrit en flux sur le disque — jamais en
// mémoire —, et la borne des documents est vérifiée juste après, dans handleSingleUpload.
const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    if (!DOCUMENT_MIME_TYPES.includes(file.mimetype) && !isVideoMime(file.mimetype)) {
      return cb(new Error('Format non autorisé (PDF, Word, Excel, image, texte ou vidéo MP4, WebM, MOV)'));
    }
    cb(null, true);
  },
});

function handleSingleUpload(req, res, next) {
  upload.single('file')(req, res, (err) => {
    if (err) {
      return res.status(400).json({ error: err.message || 'Upload invalide' });
    }
    if (req.file && !isVideoMime(req.file.mimetype) && req.file.size > MAX_FILE_SIZE) {
      // Déjà écrit sur le disque : on le retire, sinon il occuperait la place sans être
      // référencé nulle part.
      fs.unlink(req.file.path, () => {});
      return res.status(400).json({ error: 'Fichier trop volumineux (20 Mo maximum, sauf vidéos)' });
    }
    next();
  });
}

module.exports = { handleSingleUpload, UPLOAD_DIR, MAX_FILE_SIZE, VIDEO_MIME_TYPES, isVideoMime };
