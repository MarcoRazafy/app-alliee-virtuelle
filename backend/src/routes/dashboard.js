const express = require('express');
const dashboardController = require('../controllers/dashboardController');
const authMiddleware = require('../middleware/auth.middleware');

const router = express.Router();

router.get('/dashboard/realtime', authMiddleware, authMiddleware.requireRole('ADMIN'), dashboardController.getRealtime);

module.exports = router;
