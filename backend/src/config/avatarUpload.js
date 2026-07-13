const path = require('path');
const multer = require('multer');

const UPLOAD_DIR = path.join(__dirname, '../../uploads/avatars');
const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2 Mo

const ALLOWED_MIME_TYPES = ['image/png', 'image/jpeg'];

// Même logique que config/upload.js : path.basename() + un jeu de caractères sûr
// pour éviter qu'un nom de fichier client ne permette une écriture hors de UPLOAD_DIR
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
      return cb(new Error('Format de fichier non autorisé (image PNG ou JPEG uniquement)'));
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
