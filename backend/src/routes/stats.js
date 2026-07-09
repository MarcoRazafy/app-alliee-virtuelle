const express = require('express');
const statsController = require('../controllers/statsController');
const authMiddleware = require('../middleware/auth.middleware');

const router = express.Router();

router.use(authMiddleware, authMiddleware.requireRole('ADMIN'));

router.get('/stats/team', statsController.getTeamStats);

module.exports = router;
