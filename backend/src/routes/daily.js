const express = require('express');
const dailyController = require('../controllers/dailyController');
const authMiddleware = require('../middleware/auth.middleware');

const router = express.Router();

router.use(authMiddleware);

router.get('/daily/done', dailyController.getMyDailyDone);
router.put('/daily/done', dailyController.saveMyDailyDone);

router.get('/daily/admin', authMiddleware.requireRole('ADMIN'), dailyController.getOverview);

module.exports = router;
