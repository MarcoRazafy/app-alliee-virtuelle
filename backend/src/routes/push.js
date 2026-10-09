const express = require('express');
const pushController = require('../controllers/pushController');
const authMiddleware = require('../middleware/auth.middleware');

const router = express.Router();

router.use(authMiddleware);

router.get('/push/public-key', pushController.getPublicKey);
router.post('/push/subscribe', pushController.subscribe);
router.post('/push/unsubscribe', pushController.unsubscribe);

module.exports = router;
