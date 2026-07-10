const express = require('express');
const aiController = require('../controllers/aiController');
const authMiddleware = require('../middleware/auth.middleware');

const router = express.Router();

router.use(authMiddleware, authMiddleware.requireRole('ADMIN'));

router.post('/ai/ask', aiController.ask);
router.get('/ai/history', aiController.getHistory);

module.exports = router;
