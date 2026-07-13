const express = require('express');
const aiController = require('../controllers/aiController');
const authMiddleware = require('../middleware/auth.middleware');

const router = express.Router();

// Gate posé sur chaque route (pas via router.use) : plusieurs routers sont montés sur le
// même préfixe /api, un router.use() sans chemin intercepterait tout le trafic /api/*
// qui transite par ce router, y compris les routes définies dans d'autres fichiers de routes.
router.post('/ai/ask', authMiddleware, authMiddleware.requireRole('ADMIN'), aiController.ask);
router.get('/ai/history', authMiddleware, authMiddleware.requireRole('ADMIN'), aiController.getHistory);

module.exports = router;
