const express = require('express');
const aiController = require('../controllers/aiController');
const authMiddleware = require('../middleware/auth.middleware');
const { handleSingleUpload } = require('../config/upload');

const router = express.Router();

// Gate posé sur chaque route (pas via router.use) : plusieurs routers sont montés sur le
// même préfixe /api, un router.use() sans chemin intercepterait tout le trafic /api/*
// qui transite par ce router, y compris les routes définies dans d'autres fichiers de routes.
const authenticatedUser = [authMiddleware, authMiddleware.requireRole('ADMIN', 'EMPLOYEE')];

router.post('/ai/ask', ...authenticatedUser, handleSingleUpload, aiController.ask);
router.get('/ai/history', ...authenticatedUser, aiController.getHistory);

// Édition / suppression / pièce jointe d'un échange, gestion des discussions
router.patch('/ai/conversations/:id', ...authenticatedUser, aiController.editConversation);
router.delete('/ai/conversations/:id', ...authenticatedUser, aiController.deleteConversation);
router.get('/ai/conversations/:id/attachment', ...authenticatedUser, aiController.getConversationAttachment);
router.patch('/ai/sessions/:sessionId', ...authenticatedUser, aiController.renameSession);
router.delete('/ai/sessions/:sessionId', ...authenticatedUser, aiController.deleteSession);

module.exports = router;
