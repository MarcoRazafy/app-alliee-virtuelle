const express = require('express');
const dashboardController = require('../controllers/dashboardController');
const authMiddleware = require('../middleware/auth.middleware');

const router = express.Router();

router.use(authMiddleware, authMiddleware.requireRole('ADMIN'));

router.get('/dashboard/realtime', dashboardController.getRealtime);

module.exports = router;
