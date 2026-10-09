const express = require('express');
const taskController = require('../controllers/taskController');
const authMiddleware = require('../middleware/auth.middleware');
const { handleSingleUpload } = require('../config/upload');

const router = express.Router();

router.use(authMiddleware);

router.get('/tasks/late', authMiddleware.requireRole('ADMIN'), taskController.getLateTasks);

router.post('/tasks/extra-requests', taskController.createExtraTaskRequest);
router.get('/tasks/extra-requests/me', taskController.getMyExtraTaskRequests);
router.get('/tasks/extra-requests', authMiddleware.requireRole('ADMIN'), taskController.listExtraTaskRequests);
router.post('/tasks/extra-requests/:id/approve', authMiddleware.requireRole('ADMIN'), taskController.approveExtraTaskRequest);
router.post('/tasks/extra-requests/:id/reject', authMiddleware.requireRole('ADMIN'), taskController.rejectExtraTaskRequest);

router.get('/tasks', taskController.listTasks);
router.get('/tasks/:id', taskController.getTask);
router.post('/tasks/:id/complete', taskController.completeTask);

router.post('/timelog/:taskId/start', taskController.startTimelog);
router.post('/timelog/:taskId/stop', taskController.stopTimelog);
router.get('/timelog/active', taskController.getActiveTask);
router.get('/timelog/:taskId', taskController.getTimelogHistory);
router.post('/timelog/:taskId/manual', authMiddleware.requireRole('ADMIN'), taskController.addManualTimelog);
router.patch('/timelog/entry/:entryId', authMiddleware.requireRole('ADMIN'), taskController.updateTimelogEntry);
router.delete('/timelog/entry/:entryId', authMiddleware.requireRole('ADMIN'), taskController.deleteTimelogEntry);

router.get('/my-day', taskController.getMyDay);
router.post('/my-day', taskController.setMyDay);
router.post('/my-day/validate', taskController.validateMyDay);
router.get('/my-activity', taskController.getMyActivity);

router.get('/tasks/:id/detail', taskController.getTaskDetail);
router.get('/tasks/:id/subtasks', taskController.getSubtasks);

router.get('/tasks/:id/comments', taskController.getComments);
router.post('/tasks/:id/comments', taskController.createComment);
router.patch('/tasks/:id/comments/:commentId', taskController.updateComment);
router.delete('/tasks/:id/comments/:commentId', taskController.deleteComment);
router.post('/tasks/:id/comments/:commentId/reactions', taskController.toggleCommentReaction);

router.get('/tasks/:id/attachments', taskController.getAttachments);
router.post('/tasks/:id/attachments', handleSingleUpload, taskController.uploadAttachment);
router.delete('/tasks/:id/attachments/:fileId', taskController.deleteAttachment);
router.get('/attachments/:fileId/download', taskController.downloadAttachment);

router.post('/tasks', taskController.createTask);
router.post('/tasks/:id/validate', authMiddleware.requireRole('ADMIN'), taskController.validateTask);
router.post('/tasks/:id/confirm', authMiddleware.requireRole('ADMIN'), taskController.confirmTask);
router.post('/tasks/:id/reject', authMiddleware.requireRole('ADMIN'), taskController.rejectTask);
router.get('/tasks/:id/notes', authMiddleware.requireRole('ADMIN'), taskController.getNotes);
router.post('/tasks/:id/notes', authMiddleware.requireRole('ADMIN'), taskController.createNote);
router.patch('/tasks/:id', taskController.updateTask);
router.patch('/tasks/:id/description', taskController.updateTaskDescription);
router.patch('/tasks/:id/deadline', taskController.updateTaskDeadline);
router.patch('/tasks/:id/status', authMiddleware.requireRole('ADMIN'), taskController.updateTaskStatus);

router.post('/tasks/:id/reassign', authMiddleware.requireRole('ADMIN'), taskController.reassignTask);
router.post('/tasks/:id/add-assignee', authMiddleware.requireRole('ADMIN'), taskController.addTaskAssignee);
router.delete('/tasks/:id/assignees/:userId', authMiddleware.requireRole('ADMIN'), taskController.removeTaskAssignee);

router.delete('/tasks/:id', taskController.deleteTask);

module.exports = router;
