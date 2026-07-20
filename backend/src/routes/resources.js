const express = require('express');
const resourceController = require('../controllers/resourceController');
const authMiddleware = require('../middleware/auth.middleware');
const { handleSingleUpload } = require('../config/resourceUpload');

const router = express.Router();

router.use(authMiddleware);

// Lecture : tout utilisateur connecté (aperçu / téléchargement / lecture de document)
router.get('/resources/folders', resourceController.getFolders);
router.get('/resources/folders/:id/files', resourceController.getFolderFiles);
router.get('/resources/files/:id', resourceController.getFile);
router.get('/resources/files/:id/preview', resourceController.previewFile);
router.get('/resources/files/:id/download', resourceController.downloadFile);

// Gestion : admin uniquement
const requireAdmin = authMiddleware.requireRole('ADMIN');

router.post('/resources/folders', requireAdmin, resourceController.createFolder);
router.put('/resources/folders/:id', requireAdmin, resourceController.renameFolder);
router.delete('/resources/folders/:id', requireAdmin, resourceController.deleteFolder);
router.post('/resources/folders/:id/files', requireAdmin, handleSingleUpload, resourceController.uploadFile);
router.post('/resources/folders/:id/documents', requireAdmin, resourceController.createDocument);
router.put('/resources/files/:id', requireAdmin, resourceController.updateDocument);
router.delete('/resources/files/:id', requireAdmin, resourceController.deleteFile);
router.post('/resources/folders/:id/share', requireAdmin, resourceController.shareFolder);
router.get('/resources/folders/:id/shares', requireAdmin, resourceController.getFolderShares);
router.delete('/resources/shares/:id', requireAdmin, resourceController.revokeShare);

module.exports = router;
