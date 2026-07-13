const express = require('express');
const taskController = require('../controllers/taskController');
const authMiddleware = require('../middleware/auth.middleware');
const { handleSingleUpload } = require('../config/upload');

const router = express.Router();

router.use(authMiddleware);

// Routes statiques déclarées avant /tasks/:id pour éviter tout conflit de matching
router.get('/tasks/late', authMiddleware.requireRole('ADMIN'), taskController.getLateTasks);

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

router.get('/tasks/:id/detail', taskController.getTaskDetail);
router.get('/tasks/:id/subtasks', taskController.getSubtasks);

router.get('/tasks/:id/comments', taskController.getComments);
router.post('/tasks/:id/comments', taskController.createComment);

router.get('/tasks/:id/attachments', taskController.getAttachments);
router.post('/tasks/:id/attachments', handleSingleUpload, taskController.uploadAttachment);
router.delete('/tasks/:id/attachments/:fileId', taskController.deleteAttachment);
router.get('/attachments/:fileId/download', taskController.downloadAttachment);

// Admin
router.post('/tasks', authMiddleware.requireRole('ADMIN'), taskController.createTask);
router.post('/tasks/:id/validate', authMiddleware.requireRole('ADMIN'), taskController.validateTask);
router.post('/tasks/:id/confirm', authMiddleware.requireRole('ADMIN'), taskController.confirmTask);
router.post('/tasks/:id/reject', authMiddleware.requireRole('ADMIN'), taskController.rejectTask);
router.get('/tasks/:id/notes', authMiddleware.requireRole('ADMIN'), taskController.getNotes);
router.post('/tasks/:id/notes', authMiddleware.requireRole('ADMIN'), taskController.createNote);

module.exports = router;
