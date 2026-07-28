const express = require('express');
const statsController = require('../controllers/statsController');
const authMiddleware = require('../middleware/auth.middleware');

const router = express.Router();

router.use(authMiddleware);

router.get('/stats/me', statsController.getMyStats);
router.get('/stats/team', authMiddleware.requireRole('ADMIN'), statsController.getTeamStats);

module.exports = router;
