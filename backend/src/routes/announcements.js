const express = require('express');
const controller = require('../controllers/announcementController');
const authMiddleware = require('../middleware/auth.middleware');

const router = express.Router();

router.use(authMiddleware);

// Routes statiques avant /:id pour éviter que 'unread' soit pris pour un id.
router.get('/announcements/unread', controller.getUnread);
router.get('/announcements', controller.listAnnouncements);
router.post('/announcements', authMiddleware.requireRole('ADMIN'), controller.createAnnouncement);
router.get('/announcements/:id', controller.getAnnouncement);
router.put('/announcements/:id', authMiddleware.requireRole('ADMIN'), controller.updateAnnouncement);
router.delete('/announcements/:id', authMiddleware.requireRole('ADMIN'), controller.deleteAnnouncement);
router.post('/announcements/:id/read', controller.markRead);
router.get('/announcements/:id/readers', controller.getReaders);

module.exports = router;
