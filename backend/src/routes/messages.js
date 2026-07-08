const express = require('express');
const messageController = require('../controllers/messageController');
const authMiddleware = require('../middleware/auth.middleware');

const router = express.Router();

router.use(authMiddleware);

router.get('/messages/global', messageController.getGlobalMessages);
router.post('/messages/global', messageController.postGlobalMessage);

router.get('/conversations', messageController.getConversations);
router.get('/messages/private/:userId', messageController.getPrivateMessages);
router.post('/messages/private/:userId', messageController.postPrivateMessage);

module.exports = router;
