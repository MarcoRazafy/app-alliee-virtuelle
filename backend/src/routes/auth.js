const express = require('express');
const authController = require('../controllers/authController');
const authMiddleware = require('../middleware/auth.middleware');
const avatarUpload = require('../config/avatarUpload');
const { validateRegister, validateLogin, validateUpdateProfile } = require('../middleware/validation.middleware');

const router = express.Router();

router.post('/register', validateRegister, authController.register);
router.post('/login', validateLogin, authController.login);
router.get('/me', authMiddleware, authController.me);
router.put('/me', authMiddleware, validateUpdateProfile, authController.updateProfile);
router.post('/me/avatar', authMiddleware, avatarUpload.handleSingleUpload, authController.uploadAvatar);
router.get('/me/avatar', authMiddleware, authController.getMyAvatar);
router.post('/logout', authMiddleware, authController.logout);
router.post('/change-password', authMiddleware, authController.changePassword);

module.exports = router;
