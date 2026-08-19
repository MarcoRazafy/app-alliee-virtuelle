const express = require('express');
const emailController = require('../controllers/emailController');
const authMiddleware = require('../middleware/auth.middleware');

const router = express.Router();

// Boîte mail entrante : réservée aux administrateurs.
router.use(authMiddleware, authMiddleware.requireRole('ADMIN'));

router.get('/emails', emailController.listEmails);
router.get('/emails/unread-count', emailController.getUnreadCount);
router.post('/emails/refresh', emailController.refresh);
router.get('/emails/:id', emailController.getEmail);
router.patch('/emails/:id/read', emailController.markRead);
router.post('/emails/:id/reply', emailController.replyEmail);

module.exports = router;
