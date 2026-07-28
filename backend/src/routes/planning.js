const express = require('express');
const planningController = require('../controllers/planningController');
const authMiddleware = require('../middleware/auth.middleware');

const router = express.Router();

router.use(authMiddleware);

// Routes admin statiques déclarées avant /admin/:planningId pour éviter tout conflit de matching
// (même pattern que routes/tasks.js).
router.get('/planning/admin/non-submitted', authMiddleware.requireRole('ADMIN'), planningController.adminNonSubmitted);
router.get('/planning/admin/availability', authMiddleware.requireRole('ADMIN'), planningController.adminAvailabilitySearch);
router.get('/planning/admin/summary', authMiddleware.requireRole('ADMIN'), planningController.adminGetPlanningSummary);
router.get('/planning/admin/attendance', authMiddleware.requireRole('ADMIN'), planningController.adminAttendance);
router.get(
  '/planning/admin/attendance/:userId/stats',
  authMiddleware.requireRole('ADMIN'),
  planningController.adminAttendanceStats
);
router.put(
  '/planning/admin/attendance/:userId',
  authMiddleware.requireRole('ADMIN'),
  planningController.adminSetAttendanceOverride
);
router.get('/planning/admin/:planningId/history', authMiddleware.requireRole('ADMIN'), planningController.adminPlanningHistory);
router.get('/planning/admin/:planningId', authMiddleware.requireRole('ADMIN'), planningController.adminGetPlanningDetail);
router.put('/planning/admin/:planningId', authMiddleware.requireRole('ADMIN'), planningController.adminUpdatePlanning);
router.post('/planning/admin', authMiddleware.requireRole('ADMIN'), planningController.adminCreatePlanningForUser);
router.get('/planning/admin', authMiddleware.requireRole('ADMIN'), planningController.adminListPlannings);

// Employé
router.get('/planning/current', planningController.getCurrentWeek);
router.get('/planning/week', planningController.getWeekByDate);
router.get('/planning/next-week', planningController.getNextWeek);
router.post('/planning/next-week', planningController.createNextWeekPlanning);
router.put('/planning/next-week', planningController.updateNextWeekPlanning);
router.post('/planning/next-week/submit', planningController.submitNextWeekPlanning);
// Rattrapage : écriture sur la semaine EN COURS (autorisée seulement si les conditions
// de rattrapage sont réunies, cf. canEmployeeEditWeek).
router.post('/planning/current-week', planningController.createCurrentWeekPlanning);
router.put('/planning/current-week', planningController.updateCurrentWeekPlanning);
router.post('/planning/current-week/submit', planningController.submitCurrentWeekPlanning);
router.get('/planning/history', planningController.getMyPlanningHistory);
router.get('/planning/mine', planningController.getMyPlannings);

module.exports = router;
