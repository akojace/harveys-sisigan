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
const paymentValidation = [
  body('method')
    .isIn(['CASH', 'GCASH', 'MAYA', 'CARD'])
    .withMessage('Payment method must be CASH, GCASH, MAYA, or CARD.'),
  body('amountPaid')
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