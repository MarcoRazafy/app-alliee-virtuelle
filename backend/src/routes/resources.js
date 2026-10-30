const express = require('express');
const rateLimit = require('express-rate-limit');
const resourceController = require('../controllers/resourceController');
const resourcePageController = require('../controllers/resourcePageController');
const { handlePageUpload } = require('../services/pageMedia.service');
const authMiddleware = require('../middleware/auth.middleware');
const { handleSingleUpload } = require('../config/resourceUpload');

const router = express.Router();

const pdfPageLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 200,
  keyGenerator: (req) => req.user.id,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Trop de pages demandées. Patientez une minute.' },
});

router.use(authMiddleware);

router.get('/resources/folders', resourceController.getFolders);
router.get('/resources/folders/:id/files', resourceController.getFolderFiles);
router.get('/resources/files/:id', resourceController.getFile);
router.get('/resources/files/:id/preview', resourceController.previewFile);
router.get('/resources/files/:id/download', resourceController.downloadFile);
router.get('/resources/files/:id/pages', resourceController.filePdfPages);
router.get('/resources/files/:id/pages/:page', pdfPageLimiter, resourceController.filePdfPage);
router.get('/resources/files/:id/page-media/:name', resourcePageController.servePageMedia);
router.get('/resources/files/:id/page-media/:name/pages', resourceController.pageDocumentPages);
router.get('/resources/files/:id/page-media/:name/pages/:page', pdfPageLimiter, resourceController.pageDocumentPage);
router.get('/resources/media/:id', resourceController.serveDocumentMedia);
router.get('/resources/media/:id/pages', resourceController.mediaPdfPages);
router.get('/resources/media/:id/pages/:page', pdfPageLimiter, resourceController.mediaPdfPage);

const requireAdmin = authMiddleware.requireRole('ADMIN');

router.get('/resources/trash', requireAdmin, resourceController.getTrash);
router.post('/resources/trash/folders/:id/restore', requireAdmin, resourceController.restoreFolder);
router.delete('/resources/trash/folders/:id', requireAdmin, resourceController.permanentlyDeleteFolder);
router.post('/resources/trash/files/:id/restore', requireAdmin, resourceController.restoreFile);
router.delete('/resources/trash/files/:id', requireAdmin, resourceController.permanentlyDeleteFile);

router.post('/resources/folders', requireAdmin, resourceController.createFolder);
router.put('/resources/folders/:id', requireAdmin, resourceController.renameFolder);
router.delete('/resources/folders/:id', requireAdmin, resourceController.deleteFolder);
router.post('/resources/folders/:id/files', requireAdmin, handleSingleUpload, resourceController.uploadFile);
router.post('/resources/folders/:id/documents', requireAdmin, resourceController.createDocument);
router.post('/resources/page-uploads', requireAdmin, handlePageUpload, resourcePageController.uploadPageMedia);
router.post('/resources/folders/:id/pages', requireAdmin, resourcePageController.createPage);
router.put('/resources/pages/:id', requireAdmin, resourcePageController.updatePage);
router.post('/resources/folders/:id/media', requireAdmin, handleSingleUpload, resourceController.uploadDocumentMedia);
router.delete('/resources/media/:id', requireAdmin, resourceController.deleteDocumentMedia);
router.put('/resources/files/:id', requireAdmin, resourceController.updateDocument);
router.delete('/resources/files/:id', requireAdmin, resourceController.deleteFile);
router.post('/resources/folders/:id/share', requireAdmin, resourceController.shareFolder);
router.get('/resources/folders/:id/shares', requireAdmin, resourceController.getFolderShares);
router.delete('/resources/shares/:id', requireAdmin, resourceController.revokeShare);

module.exports = router;
