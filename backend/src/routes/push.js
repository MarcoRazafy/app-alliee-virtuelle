const express = require('express');
const pushController = require('../controllers/pushController');
const authMiddleware = require('../middleware/auth.middleware');

const router = express.Router();

// La clé publique VAPID n'est pas secrète, mais on garde tout derrière l'auth par cohérence
// (seuls les utilisateurs connectés s'abonnent aux notifications).
router.use(authMiddleware);

router.get('/push/public-key', pushController.getPublicKey);
router.post('/push/subscribe', pushController.subscribe);
router.post('/push/unsubscribe', pushController.unsubscribe);

module.exports = router;
