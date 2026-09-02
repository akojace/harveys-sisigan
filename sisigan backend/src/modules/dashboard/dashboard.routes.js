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

// Profit ("tubo") report — revenue, cost, profit per menu item over a period.
router.get('/profit', roleMiddleware('OWNER', 'MANAGER'), dashboardController.getProfitReport);

// ADDED — ingredient recommendations from forecasted demand. Open to all
// authenticated roles (same as the main dashboard route) since the
// service function already scopes stock to the requester's own branch
// for MANAGER/CASHIER, and to an optional branchId (or org-wide) for OWNER.
router.post('/ingredient-recommendations', dashboardController.getIngredientRecommendations);

module.exports = router;
