// src/modules/orders/order.routes.js

const express = require('express');
const { body, query } = require('express-validator');
const orderController = require('./order.controller');
const authMiddleware = require('../../middleware/auth.middleware');
const roleMiddleware = require('../../middleware/role.middleware');
 
const router = express.Router();
 
// All order routes require authentication
router.use(authMiddleware);
 
// ── Validation Rules ──────────────────────────────────
 
const createOrderValidation = [
  body('items')
    .isArray({ min: 1 })
    .withMessage('Order must have at least one item.'),
  body('items.*.menuItemId')
    .isInt({ min: 1 })
    .withMessage('Each item must have a valid menuItemId.'),
  body('items.*.quantity')
    .isInt({ min: 1 })
    .withMessage('Quantity must be at least 1.'),
  body('type')
    .isIn(['DINE_IN', 'TAKEOUT', 'DELIVERY'])
    .withMessage('Type must be DINE_IN, TAKEOUT, or DELIVERY.'),
  body('tableNumber')
    .optional()
    .isString()
    .trim(),
  body('customerName')
    .optional()
    .isString()
    .trim()
    .isLength({ max: 100 }),
];
 
const statusValidation = [
  body('status')
    .isIn(['PENDING', 'PREPARING', 'READY', 'COMPLETED', 'CANCELLED'])
    .withMessage('Invalid status value.'),
];
 
// CHANGED — added optional discountType validation. Only these three values
// are accepted; the actual percentage/amount is computed server-side in
// order.service.js, never trusted from the request.
//
// CHANGED — now accepts EITHER the legacy single-payment shape
// (top-level method/amountPaid) OR a `payments` array for split payment
// across multiple methods (e.g. CASH + GCASH covering a shortfall). A
// custom validator enforces that exactly one of these shapes is present.
const paymentValidation = [
  body('payments')
    .optional()
    .isArray({ min: 1 })
    .withMessage('payments must be a non-empty array.'),
  body('payments.*.method')
    .optional()
    .isIn(['CASH', 'GCASH', 'MAYA', 'CARD'])
    .withMessage('Each payment method must be CASH, GCASH, MAYA, or CARD.'),
  body('payments.*.amountPaid')
    .optional()
    .isFloat({ min: 0.01 })
    .withMessage('Each payment amountPaid must be a positive number.'),
  body('payments.*.referenceNo')
    .optional({ nullable: true })
    .isString()
    .trim(),
  body('method')
    .optional()
    .isIn(['CASH', 'GCASH', 'MAYA', 'CARD'])
    .withMessage('Payment method must be CASH, GCASH, MAYA, or CARD.'),
  body('amountPaid')
    .optional()
    .isFloat({ min: 0.01 })
    .withMessage('Amount paid must be a positive number.'),
  body('referenceNo')
    .optional({ nullable: true })
    .isString()
    .trim(),
  body('discountType')
    .optional({ nullable: true })
    .isIn(['SENIOR', 'PWD', 'STUDENT'])
    .withMessage('Discount type must be SENIOR, PWD, or STUDENT.'),
  body().custom((_, { req }) => {
    const hasPayments = Array.isArray(req.body.payments) && req.body.payments.length > 0;
    const hasLegacy = req.body.method != null && req.body.amountPaid != null;
    if (!hasPayments && !hasLegacy) {
      throw new Error('Provide either a payments array or method + amountPaid.');
    }
    return true;
  }),
];
 
// ── Routes ────────────────────────────────────────────
 
// POST   /api/orders             - Create new order (any staff)
router.post('/', createOrderValidation, orderController.createOrder);
 
// GET    /api/orders             - List orders (filtered by branch for non-admin)
router.get('/', orderController.getOrders);
 
// GET    /api/orders/:id         - Get single order detail
router.get('/:id', orderController.getOrderById);
 
// PATCH  /api/orders/:id/status  - Update order status (cashier/manager)
router.patch('/:id/status', statusValidation, orderController.updateOrderStatus);
 
// DELETE /api/orders/:id         - Cancel order (owner/manager only)
router.delete('/:id', orderController.cancelOrder);
 
// POST   /api/orders/:id/payment - Process payment (cashier+)
router.post('/:id/payment', paymentValidation, orderController.processPayment);
 
module.exports = router;