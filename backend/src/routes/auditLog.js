const express = require('express');
const auditLogController = require('../controllers/auditLogController');
const authMiddleware = require('../middleware/auth.middleware');

const router = express.Router();

router.get('/audit-log', authMiddleware, authMiddleware.requireRole('ADMIN'), auditLogController.listAuditLog);

module.exports = router;
