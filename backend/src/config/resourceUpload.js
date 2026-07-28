const fs = require('fs');
const path = require('path');
const multer = require('multer');

const UPLOAD_DIR = path.join(__dirname, '../../uploads/resources');
const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20 Mo (les PDF/documents peuvent être volumineux)

// multer.diskStorage échoue si le dossier n'existe pas → on le crée au démarrage.
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const ALLOWED_MIME_TYPES = [
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

// path.basename() retire tout composant de chemin (../, /) ; on ne garde que des caractères sûrs.
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
      return cb(new Error('Format not allowed (PDF, Word, Excel, image or text only)'));
    }
    cb(null, true);
  },
});

function handleSingleUpload(req, res, next) {
  upload.single('file')(req, res, (err) => {
    if (err) {
      return res.status(400).json({ error: err.message || 'Upload invalide' });
    }
    next();
  });
}

module.exports = { handleSingleUpload, UPLOAD_DIR, MAX_FILE_SIZE };
