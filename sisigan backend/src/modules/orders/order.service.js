// src/modules/orders/order.service.js
// Core business logic for Order Management

const prisma = require('../../config/db');
const inventoryService = require('../inventory/inventory.service');

// ─────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────

/**
 * Generates a unique order number per branch
 * Format: BR{branchId}-{5-digit-count}
 * Example: BR1-00042
 */
async function generateOrderNumber(branchId) {
  const count = await prisma.order.count({ where: { branchId } });
  return `BR${branchId}-${String(count + 1).padStart(5, '0')}`;
}

// ADDED — server-side source of truth for valid discount types and their
// percentages. Mirrors the PH_DISCOUNTS map on the frontend (OrdersPage.jsx).
// Keeping this on the backend too means the server never trusts a raw
// discountAmount sent by the client — it recalculates the deduction itself
// from the order's total and the discount type, so the number can't be
// tampered with client-side.
const DISCOUNT_TYPES = {
  SENIOR:  { label: 'Senior Citizen', percentage: 20 },
  PWD:     { label: 'PWD',            percentage: 20 },
  STUDENT: { label: 'Student',        percentage: 10 },
};

// ─────────────────────────────────────────
// CREATE ORDER
// ─────────────────────────────────────────

/**
 * Creates a new order with snapshot pricing
 * @param {Object} payload
 * @param {Array}  payload.items         - [{ menuItemId, quantity, notes }]
 * @param {string} payload.type          - DINE_IN | TAKEOUT | DELIVERY
 * @param {string} payload.tableNumber   - Optional
 * @param {string} payload.customerName  - Optional
 * @param {string} payload.notes         - Order-level notes
 * @param {number} payload.branchId      - From JWT
 * @param {number} payload.cashierId     - From JWT
 */
async function createOrder({ items, type, tableNumber, customerName, notes, branchId, cashierId }) {
  // 1. Validate and fetch menu items
  const menuItemIds = items.map((i) => i.menuItemId);
  const menuItems = await prisma.menuItem.findMany({
    where: { id: { in: menuItemIds }, isAvailable: true },
  });

  if (menuItems.length !== menuItemIds.length) {
    const foundIds = menuItems.map((m) => m.id);
    const missing = menuItemIds.filter((id) => !foundIds.includes(id));
    throw { statusCode: 400, message: `Menu item(s) unavailable or not found: IDs [${missing.join(', ')}]` };
  }

  // 2. Build order items with price snapshot (prevents price drift)
  const orderItemsData = items.map((item) => {
    const menu = menuItems.find((m) => m.id === item.menuItemId);
    const unitPrice = Number(menu.price);
    const subtotal = unitPrice * item.quantity;

    return {
      menuItemId: item.menuItemId,
      quantity: item.quantity,
      unitPrice,
      subtotal,
      notes: item.notes || null,
    };
  });

  // 3. Calculate total
  const totalAmount = orderItemsData.reduce((sum, i) => sum + i.subtotal, 0);

  // 4. Generate order number
  const orderNumber = await generateOrderNumber(branchId);

  // 5. Persist in a transaction (order + items atomically)
  const order = await prisma.$transaction(async (tx) => {
    const createdOrder = await tx.order.create({
      data: {
        orderNumber,
        type,
        tableNumber: tableNumber || null,
        customerName: customerName || null,
        notes: notes || null,
        totalAmount,
        branchId,
        cashierId,
        items: {
          create: orderItemsData,
        },
      },
      include: {
        items: {
          include: {
            menuItem: { select: { id: true, name: true, price: true } },
          },
        },
        cashier: { select: { id: true, name: true } },
        branch: { select: { id: true, name: true, city: true } },
      },
    });

    // 6. Deduct inventory based on configured recipe ingredients.
    // If stock is insufficient, this throws and the entire transaction rolls back.
    await inventoryService.deductInventoryForOrder({
      tx,
      branchId,
      orderId: createdOrder.id,
      items: items.map((item) => ({
        menuItemId: item.menuItemId,
        quantity: item.quantity,
      })),
    });

    return createdOrder;
  });

  return order;
}

// ─────────────────────────────────────────
// GET ORDERS (with filters)
// ─────────────────────────────────────────

/**
 * List orders for a branch, with optional filters
 * - OWNER can query any branch
 * - CASHIER/MANAGER only see their own branch
 */
async function getOrders({ branchId, status, type, date, page = 1, limit = 20, userRole, userBranchId }) {
  // Enforce branch scope for non-admins
  const effectiveBranchId = userRole === 'MANAGER' ? branchId : userBranchId;

  const where = {};
  if (effectiveBranchId) where.branchId = Number(effectiveBranchId);
  if (status) where.status = status;
  if (type) where.type = type;

  // Filter by date (full day)
  if (date) {
    const start = new Date(date);
    start.setHours(0, 0, 0, 0);
    const end = new Date(date);
    end.setHours(23, 59, 59, 999);
    where.createdAt = { gte: start, lte: end };
  }

  const skip = (page - 1) * limit;

  const [orders, total] = await Promise.all([
    prisma.order.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: Number(limit),
      include: {
        items: {
          include: { menuItem: { select: { id: true, name: true } } },
        },
        payment: true,
        cashier: { select: { id: true, name: true } },
        branch: { select: { id: true, name: true } },
      },
    }),
    prisma.order.count({ where }),
  ]);

  return {
    orders,
    pagination: {
      total,
      page: Number(page),
      limit: Number(limit),
      totalPages: Math.ceil(total / limit),
    },
  };
}

// ─────────────────────────────────────────
// GET SINGLE ORDER
// ─────────────────────────────────────────

async function getOrderById(orderId, { userRole, userBranchId }) {
  const order = await prisma.order.findUnique({
    where: { id: Number(orderId) },
    include: {
      items: {
        include: { menuItem: true },
      },
      payment: true,
      cashier: { select: { id: true, name: true } },
      branch: { select: { id: true, name: true, city: true, address: true } },
    },
  });

  if (!order) throw { statusCode: 404, message: 'Order not found.' };

  // Non-owners can only view their branch's orders
  if (userRole !== 'OWNER' && order.branchId !== userBranchId) {
    throw { statusCode: 403, message: 'Access denied to this order.' };
  }

  return order;
}

// ─────────────────────────────────────────
// UPDATE ORDER STATUS
// ─────────────────────────────────────────

/**
 * Valid status transitions:
 * PENDING → PREPARING → READY → COMPLETED
 * Any → CANCELLED (except COMPLETED)
 */
const VALID_TRANSITIONS = {
  PENDING:   ['PREPARING', 'CANCELLED'],
  PREPARING: ['READY', 'CANCELLED'],
  READY:     ['COMPLETED', 'CANCELLED'],
  COMPLETED: ['PENDING'],  
  CANCELLED: ['PENDING'], 
};

async function updateOrderStatus(orderId, newStatus, { userRole, userBranchId }) {
  const order = await prisma.order.findUnique({ where: { id: Number(orderId) } });

  if (!order) throw { statusCode: 404, message: 'Order not found.' };

  // Branch check — any role in same branch can cancel/reopen
  // Only OWNER can touch other branches
  if (userRole !== 'OWNER' && userRole !== 'ADMIN' && order.branchId !== userBranchId) {
    throw { statusCode: 403, message: 'Access denied to this order.' };
  }

  const allowed = VALID_TRANSITIONS[order.status];
  if (!allowed.includes(newStatus)) {
    throw {
      statusCode: 400,
      message: `Cannot transition order from ${order.status} to ${newStatus}. Allowed: [${allowed.join(', ')}]`,
    };
  }

  const updated = await prisma.order.update({
    where: { id: Number(orderId) },
    data: { status: newStatus },
    include: {
      items:   { include: { menuItem: { select: { id: true, name: true } } } },
      payment: true,
      branch:  { select: { id: true, name: true } },
    },
  });

  return updated;
}

// ─────────────────────────────────────────
// CANCEL ORDER
// ─────────────────────────────────────────

async function cancelOrder(orderId, { userRole, userBranchId }) {
  console.log('cancelling order:', orderId, 'role:', userRole, 'branchId:', userBranchId)
  return updateOrderStatus(orderId, 'CANCELLED', { userRole, userBranchId });
}

// ─────────────────────────────────────────
// PROCESS PAYMENT
// ─────────────────────────────────────────

/**
 * Process payment for a READY or PENDING order
 * Atomically creates Payment + sets order to COMPLETED
 *
 * CHANGED — now accepts discountType (e.g. 'SENIOR', 'PWD', 'STUDENT').
 * The percentage discount is looked up server-side from DISCOUNT_TYPES
 * (never trusted from the client) and used to compute the actual amount
 * due, which amountPaid is validated against. The resulting discount
 * label/percentage/amount are persisted on the Payment record so reprints
 * and the sales report can show them later.
 */
async function processPayment({ orderId, method, amountPaid, referenceNo, discountType }, { userRole, userBranchId }) {
  const order = await prisma.order.findUnique({
    where: { id: Number(orderId) },
    include: { payment: true },
  });

  if (!order) throw { statusCode: 404, message: 'Order not found.' };

  if (userRole !== 'OWNER' && order.branchId !== userBranchId) {
    throw { statusCode: 403, message: 'Access denied to this order.' };
  }

  if (order.status === 'COMPLETED') {
    throw { statusCode: 400, message: 'Order is already completed and paid.' };
  }

  const paid          = Number(amountPaid);
  const originalTotal = Number(order.totalAmount);

  // ADDED — validate discountType (if provided) and compute the deduction
  // server-side. This is the fix: previously `total` below was always
  // `order.totalAmount`, ignoring any discount the cashier applied.
  let discount = null;
  if (discountType) {
    const discountConfig = DISCOUNT_TYPES[discountType];
    if (!discountConfig) {
      throw { statusCode: 400, message: `Invalid discount type: ${discountType}` };
    }
    const deducted = Math.round((discountConfig.percentage / 100) * originalTotal * 100) / 100;
    discount = {
      type: discountType,
      label: discountConfig.label,
      percentage: discountConfig.percentage,
      amount: deducted,
    };
  }

  // CHANGED — total due now factors in the discount, if any
  const total = discount ? Math.max(0, originalTotal - discount.amount) : originalTotal;

  if (paid < total) {
    throw {
      statusCode: 400,
      message: `Insufficient payment. Total is ₱${total.toFixed(2)}, paid ₱${paid.toFixed(2)}.`,
    };
  }

  const change = paid - total;

  const ops = []
  if (order.payment) {
    ops.push(prisma.payment.delete({ where: { orderId: Number(orderId) } }))
  }
  ops.push(
    prisma.payment.create({
      data: {
        orderId: Number(orderId),
        method,
        amountPaid: paid,
        change,
        referenceNo: referenceNo || null,
        // ADDED — persist discount fields (all null when no discount applied)
        discountType: discount?.type || null,
        discountLabel: discount?.label || null,
        discountPercentage: discount?.percentage || null,
        discountAmount: discount?.amount || null,
      },
    }),
    prisma.order.update({
      where: { id: Number(orderId) },
      data:  { status: 'COMPLETED' },
    }),
  )

  const results      = await prisma.$transaction(ops)
  const payment      = results[results.length - 2]
  const updatedOrder = results[results.length - 1]

  return { payment, order: updatedOrder, change };
}

module.exports = {
  createOrder,
  getOrders,
  getOrderById,
  updateOrderStatus,
  cancelOrder,
  processPayment,
};