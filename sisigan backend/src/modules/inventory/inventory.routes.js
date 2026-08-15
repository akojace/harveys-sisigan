// src/modules/inventory/inventory.routes.js

const express = require('express');
const { body } = require('express-validator');
const inventoryController = require('./inventory.controller');
const authMiddleware = require('../../middleware/auth.middleware');
const roleMiddleware = require('../../middleware/role.middleware');

const router = express.Router();
router.use(authMiddleware);
router.use(roleMiddleware('OWNER', 'MANAGER'));

// GET /api/inventory?branchId=1&lowOnly=true&search=ketchup
router.get('/', inventoryController.getInventory);

// POST /api/inventory
router.post(
  '/',
  [
    body('name').notEmpty().withMessage('Ingredient name is required.'),
    body('category')
      .isIn(['SAUCE', 'SPICES', 'MAIN_INGREDIENT', 'RICE', 'UTILITIES', 'GAS'])
      .withMessage('Invalid ingredient category.'),
    body('unit')
      .isIn(['ML', 'GRAM', 'LITER', 'PCS', 'GALLON', 'TANK', 'BAG', 'PACK', 'TUB'])
      .withMessage('Invalid unit.'),
    body('quantity').isFloat({ min: 0 }).withMessage('Quantity must be a non-negative number.'),
    body('branchId').optional().isInt({ min: 1 }).withMessage('branchId must be a valid ID.'),
    body('minThreshold').optional().isFloat({ min: 0 }).withMessage('minThreshold must be non-negative.'),
    body('price').optional({ nullable: true }).isFloat({ min: 0 }).withMessage('price must be non-negative.'),
    body('consumptionRateDays').optional({ nullable: true }).isInt({ min: 1 }).withMessage('consumptionRateDays must be >= 1.'),
    body('consumptionLabel').optional({ nullable: true }).isString().trim().isLength({ max: 100 }),
    body('dailyDeductionAmount').optional({ nullable: true }).isFloat({ min: 0 }).withMessage('dailyDeductionAmount must be non-negative.'),
  ],
  inventoryController.createInventory
);

// PATCH /api/inventory/:id
router.patch(
  '/:id',
  [
    body('quantity').isFloat({ min: 0 }).withMessage('Quantity must be a non-negative number.'),
    body('note').optional().isString().trim().isLength({ max: 255 }),
  ],
  inventoryController.patchInventory
);

module.exports = router;
