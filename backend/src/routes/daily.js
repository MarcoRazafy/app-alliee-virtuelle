const express = require('express');
const dailyController = require('../controllers/dailyController');
const authMiddleware = require('../middleware/auth.middleware');

const router = express.Router();

router.use(authMiddleware);

// Employé : sa sélection « Daily » (tâches faites) du jour.
router.get('/daily/done', dailyController.getMyDailyDone);
router.put('/daily/done', dailyController.saveMyDailyDone);

// Admin : vue d'ensemble des To Do / Daily des employés pour une date.
router.get('/daily/admin', authMiddleware.requireRole('ADMIN'), dailyController.getOverview);

module.exports = router;
