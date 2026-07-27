const express = require('express');
const notificationController = require('../controllers/notificationController');
const authMiddleware = require('../middleware/auth.middleware');

const router = express.Router();

router.get('/notifications', authMiddleware, notificationController.list);
router.post('/notifications/read', authMiddleware, notificationController.markAllRead);

module.exports = router;
