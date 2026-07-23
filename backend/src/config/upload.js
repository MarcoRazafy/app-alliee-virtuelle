const path = require('path');
const multer = require('multer');

const UPLOAD_DIR = path.join(__dirname, '../../uploads/attachments');
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 Mo

const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'image/png',
  'image/jpeg',
  // Messages vocaux (MediaRecorder) et audio
  'audio/webm',
  'audio/ogg',
  'audio/mpeg',
  'audio/mp4',
  'audio/wav',
  'audio/x-wav',
];

// path.basename() retire tout composant de chemin (../, /) d'un nom de fichier fourni par le client ;
// le remplacement ne garde que des caractères sûrs pour éviter d'écrire hors de UPLOAD_DIR
function sanitizeFileName(originalName) {
  const baseName = path.basename(originalName);
  return baseName.replace(/[^a-zA-Z0-9._-]/g, '_');
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => cb(null, `${Date.now()}-${sanitizeFileName(file.originalname)}`),
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      return cb(new Error('Format de fichier non autorisé (PDF, Word, Excel ou image uniquement)'));
    }
    cb(null, true);
  },
});

// Traduit les erreurs multer (taille/format) en 400 propre plutôt qu'un 500 générique
function handleSingleUpload(req, res, next) {
  upload.single('file')(req, res, (err) => {
    if (err) {
      return res.status(400).json({ error: err.message || 'Upload invalide' });
    }
    next();
  });
}

module.exports = { handleSingleUpload, UPLOAD_DIR, MAX_FILE_SIZE };
