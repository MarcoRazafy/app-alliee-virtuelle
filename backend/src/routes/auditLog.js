const express = require('express');
const auditLogController = require('../controllers/auditLogController');
const authMiddleware = require('../middleware/auth.middleware');

const router = express.Router();

router.use(authMiddleware, authMiddleware.requireRole('ADMIN'));

router.get('/audit-log', auditLogController.listAuditLog);

module.exports = router;
