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

// ADDED — PH standard VAT rate. Menu prices are treated as VAT-inclusive
// (the price on the menu is what the customer pays; VAT is broken out of
// that number for the receipt/reports, not added on top). Stored per-order
// as taxRate so historical orders stay accurate if the rate ever changes.
const VAT_RATE = 12; // percent

/**
 * Splits a VAT-inclusive total into { vatableSales, vatAmount } at the
 * given rate (default PH standard 12%).
 */
function computeVat(totalAmount, rate = VAT_RATE) {
  const vatAmount = Math.round((totalAmount * rate) / (100 + rate) * 100) / 100;
  const vatableSales = Math.round((totalAmount - vatAmount) * 100) / 100;
  return { vatableSales, vatAmount, taxRate: rate };
}

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

  // ADDED — compute VAT breakdown from the VAT-inclusive total
  const { vatableSales, vatAmount, taxRate } = computeVat(totalAmount);

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
        vatableSales,
        vatAmount,
        taxRate,
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
        payments: true,
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
      payments: true,
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
      payments: true,
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
 * Atomically creates one or more Payment rows + sets order to COMPLETED
 *
 * CHANGED — now accepts discountType (e.g. 'SENIOR', 'PWD', 'STUDENT').
 * The percentage discount is looked up server-side from DISCOUNT_TYPES
 * (never trusted from the client) and used to compute the actual amount
 * due, which the tendered amount(s) are validated against. The resulting
 * discount label/percentage/amount are persisted on every Payment row so
 * reprints and the sales report can show them later.
 *
 * CHANGED — supports split/partial payment across multiple methods.
 * `payments` is an array of tenders, e.g.
 *   [{ method: 'CASH', amountPaid: 100 }, { method: 'GCASH', amountPaid: 16, referenceNo: '...' }]
 * covering a case where cash falls short and a second method settles the
 * remainder. A single-method payment is just an array with one entry —
 * the old { method, amountPaid, referenceNo } shape at the top level is
 * still accepted for backward compatibility and normalized into a
 * one-element array below.
 */
async function processPayment({ orderId, payments, method, amountPaid, referenceNo, discountType }, { userRole, userBranchId }) {
  const order = await prisma.order.findUnique({
    where: { id: Number(orderId) },
    include: { payments: true },
  });

  if (!order) throw { statusCode: 404, message: 'Order not found.' };

  if (userRole !== 'OWNER' && order.branchId !== userBranchId) {
    throw { statusCode: 403, message: 'Access denied to this order.' };
  }

  if (order.status === 'COMPLETED') {
    throw { statusCode: 400, message: 'Order is already completed and paid.' };
  }

  // Normalize: accept either the new `payments` array or the legacy
  // single { method, amountPaid, referenceNo } shape.
  const tenders = Array.isArray(payments) && payments.length > 0
    ? payments
    : [{ method, amountPaid, referenceNo }];

  if (tenders.some((t) => !t.method || t.amountPaid == null)) {
    throw { statusCode: 400, message: 'Each payment must include a method and amountPaid.' };
  }

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

  // CHANGED — validate the SUM of all tenders against total due, not a
  // single amountPaid. This is what makes split payment work: cash can be
  // short as long as the combined tenders cover the total.
  const totalTendered = tenders.reduce((sum, t) => sum + Number(t.amountPaid), 0);

  if (totalTendered < total) {
    throw {
      statusCode: 400,
      message: `Insufficient payment. Total is ₱${total.toFixed(2)}, paid ₱${totalTendered.toFixed(2)}.`,
    };
  }

  // Any overpayment is returned as change. Attribute it to the CASH tender
  // if one exists (the normal case — change is physical cash handed back);
  // otherwise fall back to the last tender, in case of an incidental
  // overpayment on a non-cash method.
  const overpayment = Math.round((totalTendered - total) * 100) / 100;
  const cashIdx = tenders.findIndex((t) => t.method === 'CASH');
  const changeIdx = cashIdx !== -1 ? cashIdx : tenders.length - 1;

  const paymentRows = tenders.map((t, idx) => ({
    orderId: Number(orderId),
    method: t.method,
    amountPaid: Number(t.amountPaid),
    change: idx === changeIdx ? overpayment : 0,
    referenceNo: t.referenceNo || null,
    // ADDED — persist discount fields (all null when no discount applied)
    discountType: discount?.type || null,
    discountLabel: discount?.label || null,
    discountPercentage: discount?.percentage || null,
    discountAmount: discount?.amount || null,
  }));

  // Clean up any prior payment rows for this order (e.g. a previously
  // failed/incomplete attempt) before writing the final settled set —
  // mirrors the old delete-then-create pattern, now over the whole set.
  const ops = [];
  if (order.payments.length > 0) {
    ops.push(prisma.payment.deleteMany({ where: { orderId: Number(orderId) } }));
  }
  ops.push(
    prisma.payment.createMany({ data: paymentRows }),
    prisma.order.update({
      where: { id: Number(orderId) },
      data: { status: 'COMPLETED' },
      include: { payments: true },
    }),
  );

  const results = await prisma.$transaction(ops);
  const updatedOrder = results[results.length - 1];

  return {
    order: updatedOrder,
    payments: updatedOrder.payments,
    change: overpayment,
  };
}

module.exports = {
  createOrder,
  getOrders,
  getOrderById,
  updateOrderStatus,
  cancelOrder,
  processPayment,
};