const express = require('express');
const statsController = require('../controllers/statsController');
const authMiddleware = require('../middleware/auth.middleware');

const router = express.Router();

router.use(authMiddleware);

router.get('/stats/me', statsController.getMyStats);
router.get('/stats/team', authMiddleware.requireRole('ADMIN'), statsController.getTeamStats);
router.get('/stats/weekly-connections', statsController.getWeeklyConnections);
router.get('/stats/weekly-timelog', statsController.getWeeklyTimelog);

module.exports = router;
