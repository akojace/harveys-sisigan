// src/modules/auditLogs/auditLog.routes.js

const express = require('express');
const auditLogController = require('./auditLog.controller');
const authMiddleware = require('../../middleware/auth.middleware');
const roleMiddleware = require('../../middleware/role.middleware');

const router = express.Router();
router.use(authMiddleware);
router.use(roleMiddleware('OWNER', 'MANAGER'));

// GET /api/audit-logs?actionType=ORDER_DEDUCTION&branchId=1
router.get('/', auditLogController.getAuditLogs);

module.exports = router;
