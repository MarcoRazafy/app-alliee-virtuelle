const express = require('express');
const taskController = require('../controllers/taskController');
const authMiddleware = require('../middleware/auth.middleware');

const router = express.Router();

router.use(authMiddleware);

// Employé
router.get('/tasks', taskController.listTasks);
router.get('/tasks/:id', taskController.getTask);
router.post('/tasks/:id/complete', taskController.completeTask);

router.post('/timelog/:taskId/start', taskController.startTimelog);
router.post('/timelog/:taskId/stop', taskController.stopTimelog);
router.get('/timelog/:taskId', taskController.getTimelogHistory);

router.get('/my-day', taskController.getMyDay);
router.post('/my-day', taskController.setMyDay);
router.post('/my-day/validate', taskController.validateMyDay);

// Admin
router.post('/tasks', authMiddleware.requireRole('ADMIN'), taskController.createTask);
router.post('/tasks/:id/confirm', authMiddleware.requireRole('ADMIN'), taskController.confirmTask);
router.post('/tasks/:id/reject', authMiddleware.requireRole('ADMIN'), taskController.rejectTask);

module.exports = router;
