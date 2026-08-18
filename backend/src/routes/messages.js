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

// Sondages (déclarés avant /messages/:id pour éviter tout conflit de matching)
router.post('/messages/polls', messageController.createPoll);
router.post('/messages/polls/:id/vote', messageController.votePoll);

router.get('/conversations', messageController.getConversations);
router.get('/messages/private/:userId', messageController.getPrivateMessages);
router.post('/messages/private/:userId', handleSingleUpload, messageController.postPrivateMessage);

router.get('/message-groups', messageController.getGroups);
router.post('/message-groups', handleSingleUpload, messageController.createGroup);
router.get('/message-groups/:groupId/avatar', messageController.getGroupAvatar);
router.get('/message-groups/:groupId/messages', messageController.getGroupMessages);
router.post('/message-groups/:groupId/messages', handleSingleUpload, messageController.postGroupMessage);
// Gestion du groupe : renommer/photo, supprimer, membres, quitter (créateur ou admin, sauf « quitter »)
router.patch('/message-groups/:groupId', handleSingleUpload, messageController.updateGroup);
router.delete('/message-groups/:groupId', messageController.deleteGroup);
router.post('/message-groups/:groupId/members', messageController.addGroupMembers);
router.delete('/message-groups/:groupId/members/:userId', messageController.removeGroupMember);
router.post('/message-groups/:groupId/leave', messageController.leaveGroup);

// Actions sur un message (édition, suppression douce, réactions, pièce jointe, transfert)
router.get('/messages/:id/attachment', messageController.getMessageAttachment);
router.patch('/messages/:id', messageController.editMessage);
router.delete('/messages/:id', messageController.deleteMessage);
router.post('/messages/:id/react', messageController.reactMessage);
router.post('/messages/:id/forward', messageController.forwardMessage);

module.exports = router;
