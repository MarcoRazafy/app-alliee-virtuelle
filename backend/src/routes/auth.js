const express = require('express');
const rateLimit = require('express-rate-limit');
const authController = require('../controllers/authController');
const authMiddleware = require('../middleware/auth.middleware');
const avatarUpload = require('../config/avatarUpload');
const { validateRegister, validateLogin, validateUpdateProfile } = require('../middleware/validation.middleware');

const router = express.Router();

// Limite les tentatives de connexion/inscription par IP (anti brute-force).
// Actif UNIQUEMENT en production : en local/tunnel, tous les clients partagent souvent la
// même IP (proxy) et seraient bloqués ensemble ; les tests enchaînent aussi les connexions.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // 20 tentatives / IP / fenêtre
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Trop de tentatives. Réessayez dans quelques minutes.' },
  skip: () => process.env.NODE_ENV !== 'production',
});

router.post('/register', authLimiter, validateRegister, authController.register);
router.post('/login', authLimiter, validateLogin, authController.login);
router.get('/me', authMiddleware, authController.me);
router.put('/me', authMiddleware, validateUpdateProfile, authController.updateProfile);
router.post('/me/avatar', authMiddleware, avatarUpload.handleSingleUpload, authController.uploadAvatar);
router.get('/me/avatar', authMiddleware, authController.getMyAvatar);
router.post('/logout', authMiddleware, authController.logout);
router.post('/change-password', authMiddleware, authController.changePassword);

module.exports = router;
