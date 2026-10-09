const express = require('express');
const aiController = require('../controllers/aiController');
const authMiddleware = require('../middleware/auth.middleware');
const { handleSingleUpload } = require('../config/upload');

const router = express.Router();

const authenticatedUser = [authMiddleware, authMiddleware.requireRole('ADMIN', 'EMPLOYEE')];

router.post('/ai/ask', ...authenticatedUser, handleSingleUpload, aiController.ask);
router.get('/ai/history', ...authenticatedUser, aiController.getHistory);

router.patch('/ai/conversations/:id', ...authenticatedUser, aiController.editConversation);
router.delete('/ai/conversations/:id', ...authenticatedUser, aiController.deleteConversation);
router.get('/ai/conversations/:id/attachment', ...authenticatedUser, aiController.getConversationAttachment);
router.patch('/ai/sessions/:sessionId', ...authenticatedUser, aiController.renameSession);
router.delete('/ai/sessions/:sessionId', ...authenticatedUser, aiController.deleteSession);

module.exports = router;
