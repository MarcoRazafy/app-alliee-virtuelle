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

router.get('/resources/trash', requireAdmin, resourceController.getTrash);
router.post('/resources/trash/folders/:id/restore', requireAdmin, resourceController.restoreFolder);
router.delete('/resources/trash/folders/:id', requireAdmin, resourceController.permanentlyDeleteFolder);
router.post('/resources/trash/files/:id/restore', requireAdmin, resourceController.restoreFile);
router.delete('/resources/trash/files/:id', requireAdmin, resourceController.permanentlyDeleteFile);

router.post('/resources/folders', requireAdmin, resourceController.createFolder);
router.put('/resources/folders/:id', requireAdmin, resourceController.renameFolder);
router.delete('/resources/folders/:id', requireAdmin, resourceController.deleteFolder);
// Dépôt de fichier : ouvert à tout utilisateur connecté (demande des employés). L'auteur est
// enregistré (created_by), ce qui permet de limiter la suppression à ses propres dépôts.
router.post('/resources/folders/:id/files', handleSingleUpload, resourceController.uploadFile);
router.post('/resources/folders/:id/documents', requireAdmin, resourceController.createDocument);
router.put('/resources/files/:id', requireAdmin, resourceController.updateDocument);
// Suppression : le contrôleur autorise l'admin OU l'auteur du fichier uniquement.
router.delete('/resources/files/:id', resourceController.deleteFile);
router.post('/resources/folders/:id/share', requireAdmin, resourceController.shareFolder);
router.get('/resources/folders/:id/shares', requireAdmin, resourceController.getFolderShares);
router.delete('/resources/shares/:id', requireAdmin, resourceController.revokeShare);

module.exports = router;
