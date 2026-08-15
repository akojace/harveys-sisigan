const express = require('express');
const dashboardController = require('./dashboard.controller');
const authMiddleware = require('../../middleware/auth.middleware');
const roleMiddleware = require('../../middleware/role.middleware');

const router = express.Router();
router.use(authMiddleware);

// All authenticated users can see dashboard (service applies role scoping).
router.get('/', dashboardController.getDashboard);

// Branch list for owner filter dropdown.
router.get('/branches', roleMiddleware('OWNER'), dashboardController.getBranches);

// Login/logout activity trail (owner and manager).
router.get('/auth-logs', roleMiddleware('OWNER', 'MANAGER'), dashboardController.getAuthLogs);

module.exports = router;
