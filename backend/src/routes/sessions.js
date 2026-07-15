const express = require('express');
const sessionController = require('../controllers/sessionController');
const authMiddleware = require('../middleware/auth.middleware');

const router = express.Router();

router.use(authMiddleware);

router.get('/sessions/week', sessionController.getMySessionsForWeek);
router.get('/sessions/current', sessionController.getMyCurrentSession);
router.post('/sessions/close', sessionController.closeMySession);

module.exports = router;
