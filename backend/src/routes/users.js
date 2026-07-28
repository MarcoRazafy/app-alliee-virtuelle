const express = require('express');
const userController = require('../controllers/userController');
const authMiddleware = require('../middleware/auth.middleware');

const router = express.Router();

router.use(authMiddleware);

// Annuaire minimal, ouvert à tout utilisateur connecté (messagerie)
router.get('/users/directory', userController.listDirectory);
router.get('/users/:id/avatar', userController.getUserAvatar);

// Gestion des comptes : admin uniquement
router.get('/users/pending', authMiddleware.requireRole('ADMIN'), userController.listPending);
router.get('/users', authMiddleware.requireRole('ADMIN'), userController.listUsers);
router.get('/users/:id/detail', authMiddleware.requireRole('ADMIN'), userController.getUserDetail);
router.post('/users/:id/approve', authMiddleware.requireRole('ADMIN'), userController.approveUser);
router.post('/users/:id/reject', authMiddleware.requireRole('ADMIN'), userController.rejectUser);
router.post('/users/:id/suspend', authMiddleware.requireRole('ADMIN'), userController.suspendUser);
router.post('/users/:id/activate', authMiddleware.requireRole('ADMIN'), userController.activateUser);
router.post('/users/:id/promote', authMiddleware.requireRole('ADMIN'), userController.promoteUser);

module.exports = router;
