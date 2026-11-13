// src/modules/expenses/expense.routes.js

const express = require('express');
const { body } = require('express-validator');
const expenseController = require('./expense.controller');
const authMiddleware = require('../../middleware/auth.middleware');
const roleMiddleware = require('../../middleware/role.middleware');

const router = express.Router();
router.use(authMiddleware);
router.use(roleMiddleware('OWNER', 'MANAGER'));

router.get('/', expenseController.getExpenses);

router.post(
  '/',
  [
    body('amount').isFloat({ min: 0.01 }).withMessage('Amount must be greater than 0.'),
    body('category')
      .optional()
      .isIn(['RENT', 'UTILITIES', 'SALARIES', 'SUPPLIES', 'MAINTENANCE', 'OTHER'])
      .withMessage('Invalid expense category.'),
    body('branchId').optional({ nullable: true }).isInt({ min: 1 }),
    body('description').optional({ nullable: true }).isString().trim().isLength({ max: 255 }),
    body('expenseDate').optional({ nullable: true }).isISO8601().withMessage('Invalid expense date.'),
  ],
  expenseController.createExpense
);

router.delete('/:id', expenseController.deleteExpense);

module.exports = router;
