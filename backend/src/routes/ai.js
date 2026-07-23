const express = require('express');
const aiController = require('../controllers/aiController');
const authMiddleware = require('../middleware/auth.middleware');
const { handleSingleUpload } = require('../config/upload');

const router = express.Router();

// Gate posé sur chaque route (pas via router.use) : plusieurs routers sont montés sur le
// même préfixe /api, un router.use() sans chemin intercepterait tout le trafic /api/*
// qui transite par ce router, y compris les routes définies dans d'autres fichiers de routes.
const admin = [authMiddleware, authMiddleware.requireRole('ADMIN')];

router.post('/ai/ask', ...admin, handleSingleUpload, aiController.ask);
router.get('/ai/history', ...admin, aiController.getHistory);

// Édition / suppression / pièce jointe d'un échange, gestion des discussions
router.patch('/ai/conversations/:id', ...admin, aiController.editConversation);
router.delete('/ai/conversations/:id', ...admin, aiController.deleteConversation);
router.get('/ai/conversations/:id/attachment', ...admin, aiController.getConversationAttachment);
router.patch('/ai/sessions/:sessionId', ...admin, aiController.renameSession);
router.delete('/ai/sessions/:sessionId', ...admin, aiController.deleteSession);

module.exports = router;
