// src/modules/inventory/inventory.routes.js

const express = require('express');
const { body } = require('express-validator');
const inventoryController = require('./inventory.controller');
const authMiddleware = require('../../middleware/auth.middleware');
const roleMiddleware = require('../../middleware/role.middleware');

const router = express.Router();
router.use(authMiddleware);
router.use(roleMiddleware('OWNER', 'MANAGER'));

const VALID_UNITS = ['KG', 'GRAM', 'LITER', 'ML', 'PCS', 'GALLON', 'TANK', 'BAG', 'PACK', 'TUB'];
const VALID_CATEGORIES = ['SAUCE', 'SPICES', 'MAIN_INGREDIENT', 'RICE', 'UTILITIES', 'GAS'];

// GET /api/inventory?branchId=1&lowOnly=true&search=ketchup
router.get('/', inventoryController.getInventory);

// POST /api/inventory/restock — Restock with weighted-average costing & unit conversion
router.post(
  '/restock',
  [
    body('itemId').optional({ nullable: true }).isInt({ min: 1 }),
    body('ingredientId').optional({ nullable: true }).isInt({ min: 1 }),
    body('branchId').optional({ nullable: true }).isInt({ min: 1 }),
    body('purchaseQuantity').isFloat({ min: 0.0001 }).withMessage('purchaseQuantity must be greater than 0.'),
    body('purchaseUnit').optional().isIn(VALID_UNITS).withMessage('Invalid purchase unit.'),
    body('purchaseCost').isFloat({ min: 0 }).withMessage('purchaseCost must be a non-negative number.'),
    body('yieldPercentage').optional().isFloat({ min: 1, max: 100 }).withMessage('yieldPercentage must be 1 to 100.'),
    body('referenceNo').optional({ nullable: true }).isString().trim().isLength({ max: 100 }),
    body('note').optional({ nullable: true }).isString().trim().isLength({ max: 255 }),
  ],
  inventoryController.restockInventory
);

// POST /api/inventory/adjust — Wastage or manual count adjustment
router.post(
  '/adjust',
  [
    body('itemId').isInt({ min: 1 }).withMessage('itemId must be a valid ID.'),
    body('newQuantity').isFloat({ min: 0 }).withMessage('newQuantity must be non-negative.'),
    body('actionType').optional().isIn(['MANUAL_EDIT', 'WASTAGE']).withMessage('actionType must be MANUAL_EDIT or WASTAGE.'),
    body('note').optional({ nullable: true }).isString().trim().isLength({ max: 255 }),
  ],
  inventoryController.adjustInventory
);

// POST /api/inventory — Create or initialize inventory item
router.post(
  '/',
  [
    body('name').notEmpty().withMessage('Ingredient name is required.'),
    body('category').isIn(VALID_CATEGORIES).withMessage('Invalid ingredient category.'),
    body('unit').isIn(VALID_UNITS).withMessage('Invalid unit.'),
    body('quantity').isFloat({ min: 0 }).withMessage('Quantity must be a non-negative number.'),
    body('branchId').optional().isInt({ min: 1 }).withMessage('branchId must be a valid ID.'),
    body('minThreshold').optional().isFloat({ min: 0 }).withMessage('minThreshold must be non-negative.'),
    body('price').optional({ nullable: true }).isFloat({ min: 0 }).withMessage('price must be non-negative.'),
    body('yieldPercentage').optional().isFloat({ min: 1, max: 100 }).withMessage('yieldPercentage must be 1 to 100.'),
    body('consumptionRateDays').optional({ nullable: true }).isInt({ min: 1 }).withMessage('consumptionRateDays must be >= 1.'),
    body('consumptionLabel').optional({ nullable: true }).isString().trim().isLength({ max: 100 }),
    body('dailyDeductionAmount').optional({ nullable: true }).isFloat({ min: 0 }).withMessage('dailyDeductionAmount must be non-negative.'),
    body('gramsPerUnit').optional({ nullable: true }).isFloat({ min: 0.0001 }).withMessage('gramsPerUnit must be a positive number.'),
  ],
  inventoryController.createInventory
);

// PATCH /api/inventory/:id — Legacy quantity edit
router.patch(
  '/:id',
  [
    body('quantity').isFloat({ min: 0 }).withMessage('Quantity must be a non-negative number.'),
    body('note').optional().isString().trim().isLength({ max: 255 }),
  ],
  inventoryController.patchInventory
);

// PATCH /api/inventory/:id/details — Edit ingredient details without touching quantity
router.patch(
  '/:id/details',
  [
    body('category').optional().isIn(VALID_CATEGORIES).withMessage('Invalid ingredient category.'),
    body('unit').optional().isIn(VALID_UNITS).withMessage('Invalid unit.'),
    body('price').optional({ nullable: true }).isFloat({ min: 0 }).withMessage('price must be non-negative.'),
    body('yieldPercentage').optional({ nullable: true }).isFloat({ min: 1, max: 100 }).withMessage('yieldPercentage must be 1 to 100.'),
    body('minThreshold').optional({ nullable: true }).isFloat({ min: 0 }).withMessage('minThreshold must be non-negative.'),
    body('consumptionRateDays').optional({ nullable: true }).isInt({ min: 1 }).withMessage('consumptionRateDays must be >= 1.'),
    body('consumptionLabel').optional({ nullable: true }).isString().trim().isLength({ max: 100 }),
    body('dailyDeductionAmount').optional({ nullable: true }).isFloat({ min: 0 }).withMessage('dailyDeductionAmount must be non-negative.'),
    body('gramsPerUnit')
      .optional({ nullable: true })
      .custom((val) => {
        if (val === null || val === '') return true;
        const n = Number(val);
        if (Number.isNaN(n) || n <= 0) throw new Error('gramsPerUnit must be a positive number.');
        return true;
      }),
  ],
  inventoryController.patchInventoryDetails
);

// POST /api/inventory/transfers — Transfer stock between branches
router.post(
  '/transfers',
  [
    body('sourceBranchId').isInt({ min: 1 }).withMessage('sourceBranchId is required.'),
    body('destBranchId').isInt({ min: 1 }).withMessage('destBranchId is required.'),
    body('ingredientId').isInt({ min: 1 }).withMessage('ingredientId is required.'),
    body('quantity').optional().isFloat({ min: 0.0001 }).withMessage('quantity must be greater than 0.'),
    body('inputQuantity').optional().isFloat({ min: 0.0001 }).withMessage('inputQuantity must be greater than 0.'),
    body('unit').optional().isString().trim(),
    body('inputUnit').optional().isString().trim(),
    body('notes').optional({ nullable: true }).isString().trim().isLength({ max: 255 }),
  ],
  inventoryController.transferStock
);

// POST /api/inventory/transfers/:id/cancel — Cancel transfer and restore inventory atomically
router.post('/transfers/:id/cancel', inventoryController.cancelTransfer);

// GET /api/inventory/transfers — List cross-branch transfers
router.get('/transfers', inventoryController.getTransfers);

// GET /api/inventory/:id/dependencies — Inspect dependent audit/transfer records before deletion
router.get('/:id/dependencies', inventoryController.getInventoryDependencies);

// DELETE /api/inventory/:id — Permanently delete branch inventory item (OWNER only, if no historical logs)
router.delete('/:id', roleMiddleware('OWNER'), inventoryController.deleteInventory);

module.exports = router;
