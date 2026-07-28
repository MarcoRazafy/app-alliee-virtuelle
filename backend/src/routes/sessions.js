const express = require('express');
const sessionController = require('../controllers/sessionController');
const authMiddleware = require('../middleware/auth.middleware');

const router = express.Router();

router.use(authMiddleware);

// Route admin déclarée avant /sessions/week pour rester lisible (pas de conflit de matching ici).
router.get('/sessions/admin/week', authMiddleware.requireRole('ADMIN'), sessionController.getUserSessionsForWeekAdmin);
router.get('/sessions/week', sessionController.getMySessionsForWeek);
router.get('/sessions/current', sessionController.getMyCurrentSession);
router.post('/sessions/heartbeat', sessionController.heartbeatMySession);
router.post('/sessions/disconnect', sessionController.requestMyDisconnect);
router.post('/sessions/close', sessionController.closeMySession);

module.exports = router;
