const express = require('express');
const messageController = require('../controllers/messageController');
const authMiddleware = require('../middleware/auth.middleware');

const router = express.Router();

router.use(authMiddleware);

router.get('/messages/global', messageController.getGlobalMessages);
// Seul un admin peut écrire dans le chat global (DECISIONS.md)
router.post('/messages/global', authMiddleware.requireRole('ADMIN'), messageController.postGlobalMessage);

router.get('/conversations', messageController.getConversations);
router.get('/messages/private/:userId', messageController.getPrivateMessages);
router.post('/messages/private/:userId', messageController.postPrivateMessage);

module.exports = router;
