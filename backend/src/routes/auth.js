const express = require('express');
const rateLimit = require('express-rate-limit');
const authController = require('../controllers/authController');
const authMiddleware = require('../middleware/auth.middleware');
const avatarUpload = require('../config/avatarUpload');
const { validateRegister, validateLogin, validateUpdateProfile } = require('../middleware/validation.middleware');

const router = express.Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
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
