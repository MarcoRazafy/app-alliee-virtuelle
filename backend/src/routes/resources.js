const express = require('express');
const resourceController = require('../controllers/resourceController');
const authMiddleware = require('../middleware/auth.middleware');

const router = express.Router();

router.use(authMiddleware);

router.get('/resources/folders', resourceController.getFolders);
router.get('/resources/folders/:id/files', resourceController.getFolderFiles);

// Gestion : admin uniquement
const requireAdmin = authMiddleware.requireRole('ADMIN');

router.post('/resources/folders', requireAdmin, resourceController.createFolder);
router.put('/resources/folders/:id', requireAdmin, resourceController.renameFolder);
router.delete('/resources/folders/:id', requireAdmin, resourceController.deleteFolder);
router.post('/resources/folders/:id/files', requireAdmin, resourceController.createFile);
router.delete('/resources/files/:id', requireAdmin, resourceController.deleteFile);
router.post('/resources/folders/:id/share', requireAdmin, resourceController.shareFolder);
router.get('/resources/folders/:id/shares', requireAdmin, resourceController.getFolderShares);
router.delete('/resources/shares/:id', requireAdmin, resourceController.revokeShare);

module.exports = router;
