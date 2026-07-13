const express = require('express');
const dashboardController = require('../controllers/dashboardController');
const authMiddleware = require('../middleware/auth.middleware');

const router = express.Router();

// Gate posé sur cette seule route (pas via router.use) : plusieurs routers sont montés
// sur le même préfixe /api, un router.use() sans chemin intercepterait tout le trafic /api/*
// qui transite par ce router, y compris les routes définies dans d'autres fichiers de routes.
router.get('/dashboard/realtime', authMiddleware, authMiddleware.requireRole('ADMIN'), dashboardController.getRealtime);

module.exports = router;
