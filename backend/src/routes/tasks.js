const express = require('express');
const taskController = require('../controllers/taskController');
const authMiddleware = require('../middleware/auth.middleware');
const { handleSingleUpload } = require('../config/upload');

const router = express.Router();

router.use(authMiddleware);

// Routes statiques déclarées avant /tasks/:id pour éviter tout conflit de matching
router.get('/tasks/late', authMiddleware.requireRole('ADMIN'), taskController.getLateTasks);

// Demandes de tâche supplémentaire (après validation de la journée).
// Déclarées ici, avant /tasks/:id, sinon "extra-requests" serait pris pour un :id.
router.post('/tasks/extra-requests', taskController.createExtraTaskRequest);
router.get('/tasks/extra-requests/me', taskController.getMyExtraTaskRequests);
router.get('/tasks/extra-requests', authMiddleware.requireRole('ADMIN'), taskController.listExtraTaskRequests);
router.post('/tasks/extra-requests/:id/approve', authMiddleware.requireRole('ADMIN'), taskController.approveExtraTaskRequest);
router.post('/tasks/extra-requests/:id/reject', authMiddleware.requireRole('ADMIN'), taskController.rejectExtraTaskRequest);

// Employé
router.get('/tasks', taskController.listTasks);
router.get('/tasks/:id', taskController.getTask);
router.post('/tasks/:id/complete', taskController.completeTask);

router.post('/timelog/:taskId/start', taskController.startTimelog);
router.post('/timelog/:taskId/stop', taskController.stopTimelog);
// Tâche en cours de chronométrage (widget employé). Avant /timelog/:taskId sinon 'active' = :taskId.
router.get('/timelog/active', taskController.getActiveTask);
router.get('/timelog/:taskId', taskController.getTimelogHistory);
// Ajout manuel d'un temps (admin) : chrono oublié, saisi a posteriori.
router.post('/timelog/:taskId/manual', authMiddleware.requireRole('ADMIN'), taskController.addManualTimelog);

router.get('/my-day', taskController.getMyDay);
router.post('/my-day', taskController.setMyDay);
router.post('/my-day/validate', taskController.validateMyDay);
router.get('/my-activity', taskController.getMyActivity);

router.get('/tasks/:id/detail', taskController.getTaskDetail);
router.get('/tasks/:id/subtasks', taskController.getSubtasks);

router.get('/tasks/:id/comments', taskController.getComments);
router.post('/tasks/:id/comments', taskController.createComment);

router.get('/tasks/:id/attachments', taskController.getAttachments);
router.post('/tasks/:id/attachments', handleSingleUpload, taskController.uploadAttachment);
router.delete('/tasks/:id/attachments/:fileId', taskController.deleteAttachment);
router.get('/attachments/:fileId/download', taskController.downloadAttachment);

// Admin
// Création ouverte à tous : un admin crée une tâche directement actionnable ;
// un employé crée une proposition (DECLAREE) que l'admin doit valider.
router.post('/tasks', taskController.createTask);
router.post('/tasks/:id/validate', authMiddleware.requireRole('ADMIN'), taskController.validateTask);
router.post('/tasks/:id/confirm', authMiddleware.requireRole('ADMIN'), taskController.confirmTask);
router.post('/tasks/:id/reject', authMiddleware.requireRole('ADMIN'), taskController.rejectTask);
router.get('/tasks/:id/notes', authMiddleware.requireRole('ADMIN'), taskController.getNotes);
router.post('/tasks/:id/notes', authMiddleware.requireRole('ADMIN'), taskController.createNote);
// Modification d'une tâche (admin) : titre, description, priorité, échéance.
router.patch('/tasks/:id', authMiddleware.requireRole('ADMIN'), taskController.updateTask);

// Assignation (admin) : transférer à une seule personne, ajouter une personne, ou en retirer une.
router.post('/tasks/:id/reassign', authMiddleware.requireRole('ADMIN'), taskController.reassignTask);
router.post('/tasks/:id/add-assignee', authMiddleware.requireRole('ADMIN'), taskController.addTaskAssignee);
router.delete('/tasks/:id/assignees/:userId', authMiddleware.requireRole('ADMIN'), taskController.removeTaskAssignee);

// Suppression d'une tâche (admin) : supprime aussi ses sous-tâches, commentaires, chronos… (CASCADE).
router.delete('/tasks/:id', authMiddleware.requireRole('ADMIN'), taskController.deleteTask);

module.exports = router;
