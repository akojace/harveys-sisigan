// src/modules/reports/report.routes.js

const express = require('express');
const reportController = require('./report.controller');
const authMiddleware = require('../../middleware/auth.middleware');
const roleMiddleware = require('../../middleware/role.middleware');

const router = express.Router();
router.use(authMiddleware);
router.use(roleMiddleware('OWNER', 'MANAGER'));

// GET /api/reports?period=daily|weekly|custom&from=YYYY-MM-DD&to=YYYY-MM-DD&branchId=1
router.get('/', reportController.getReports);

module.exports = router;
