const express = require('express');
const messageController = require('../controllers/messageController');
const authMiddleware = require('../middleware/auth.middleware');
const { handleSingleUpload } = require('../config/upload');

const router = express.Router();

router.use(authMiddleware);

// Statut en ligne (déclaré avant les routes /messages/:id pour éviter tout conflit)
router.get('/messages/online-users', messageController.getOnlineUsers);

router.get('/messages/global', messageController.getGlobalMessages);
router.post('/messages/global', handleSingleUpload, messageController.postGlobalMessage);

router.get('/conversations', messageController.getConversations);
router.get('/messages/private/:userId', messageController.getPrivateMessages);
router.post('/messages/private/:userId', handleSingleUpload, messageController.postPrivateMessage);

router.get('/message-groups', messageController.getGroups);
router.post('/message-groups', handleSingleUpload, messageController.createGroup);
router.get('/message-groups/:groupId/avatar', messageController.getGroupAvatar);
router.get('/message-groups/:groupId/messages', messageController.getGroupMessages);
router.post('/message-groups/:groupId/messages', handleSingleUpload, messageController.postGroupMessage);

// Actions sur un message (édition, suppression douce, réactions, pièce jointe)
router.get('/messages/:id/attachment', messageController.getMessageAttachment);
router.patch('/messages/:id', messageController.editMessage);
router.delete('/messages/:id', messageController.deleteMessage);
router.post('/messages/:id/react', messageController.reactMessage);

module.exports = router;
