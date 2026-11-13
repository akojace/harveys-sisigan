// src/modules/orders/order.controller.js
 
const { validationResult } = require('express-validator');
const orderService = require('./order.service');
const { validateBranchAccess } = require('../../middleware/branchScope.middleware');
 
// POST /api/orders
async function createOrder(req, res, next) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }
 
    const { items, type, tableNumber, customerName, notes, branchId: requestedBranchId } = req.body;
    const branchId = validateBranchAccess(req.user, requestedBranchId, { requireSpecificBranch: true });
 
    const order = await orderService.createOrder({
      items,
      type,
      tableNumber,
      customerName,
      notes,
      branchId,
      cashierId: req.user.id,
    });
 
    // Emit real-time event to kitchen display
    req.io?.to(`branch_${order.branchId}`).emit('new_order', order);
 
    res.status(201).json({ success: true, data: order });
  } catch (err) {
    next(err);
  }
}
 
// GET /api/orders
async function getOrders(req, res, next) {
  try {
    const { branchId, status, type, date, page, limit } = req.query;
    const scopedBranchId = validateBranchAccess(req.user, branchId);
 
    const result = await orderService.getOrders({
      branchId: scopedBranchId,
      status,
      type,
      date,
      page,
      limit,
      userRole: req.user.role,
      userBranchId: req.user.branchId,
    });
 
    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
}
 
// GET /api/orders/:id
async function getOrderById(req, res, next) {
  try {
    const order = await orderService.getOrderById(req.params.id, {
      userRole: req.user.role,
      userBranchId: req.user.branchId,
    });
 
    res.json({ success: true, data: order });
  } catch (err) {
    next(err);
  }
}
 
// PATCH /api/orders/:id/status
async function updateOrderStatus(req, res, next) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }
 
    const { status } = req.body;
 
    const order = await orderService.updateOrderStatus(req.params.id, status, {
      userRole: req.user.role,
      userBranchId: req.user.branchId,
      actorUserId: req.user.id,
    });
 
    // Broadcast status change to branch room
    req.io?.to(`branch_${order.branchId}`).emit('order_status_updated', {
      orderId: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
    });
 
    res.json({ success: true, data: order });
  } catch (err) {
    next(err);
  }
}
 
// DELETE /api/orders/:id  (cancel)
async function cancelOrder(req, res, next) {
  try {
    const order = await orderService.cancelOrder(req.params.id, {
      userRole: req.user.role,
      userBranchId: req.user.branchId,
      actorUserId: req.user.id,
    });
 
    req.io?.to(`branch_${order.branchId}`).emit('order_cancelled', {
      orderId: order.id,
      orderNumber: order.orderNumber,
    });
 
    res.json({ success: true, data: order });
  } catch (err) {
    next(err);
  }
}
 
// POST /api/orders/:id/payment
async function processPayment(req, res, next) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }
 
    const { payments, method, amountPaid, referenceNo, discountType } = req.body;
 
    const result = await orderService.processPayment(
      { orderId: req.params.id, payments, method, amountPaid, referenceNo, discountType },
      { userRole: req.user.role, userBranchId: req.user.branchId }
    );
 
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}
 
module.exports = {
  createOrder,
  getOrders,
  getOrderById,
  updateOrderStatus,
  cancelOrder,
  processPayment,
};
