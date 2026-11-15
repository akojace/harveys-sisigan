// src/modules/orders/order.service.js
// Core business logic for Order Management + COGS Snapshot + Inventory Consistency

const prisma = require('../../config/db');
const inventoryService = require('../inventory/inventory.service');
const notificationService = require('../notifications/notification.service');
const { roundDecimals } = require('../../utils/inventoryCosting');

// ─────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────

/**
 * Generates a unique order number per branch
 * Format: BR{branchId}-{5-digit-count}
 * Example: BR1-00042
 */
async function generateOrderNumber(branchId) {
  const count = await prisma.order.count({ where: { branchId: Number(branchId) } });
  let nextSeq = count + 1;
  const rand = Math.floor(100 + Math.random() * 900);
  let orderNumber = `BR${branchId}-${String(nextSeq).padStart(4, '0')}-${rand}`;

  // Guard against sequence collisions under concurrent execution
  while (await prisma.order.findUnique({ where: { orderNumber } })) {
    nextSeq += 1;
    orderNumber = `BR${branchId}-${String(nextSeq).padStart(4, '0')}-${Math.floor(100 + Math.random() * 900)}`;
  }
  return orderNumber;
}

const DISCOUNT_TYPES = {
  SENIOR:  { label: 'Senior Citizen', percentage: 20 },
  PWD:     { label: 'PWD',            percentage: 20 },
  STUDENT: { label: 'Student',        percentage: 10 },
};

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

async function createOrder({ items, type, tableNumber, customerName, notes, branchId, cashierId }) {
  // 1. Validate and fetch menu items (globally available)
  const menuItemIds = items.map((i) => Number(i.menuItemId));
  const menuItems = await prisma.menuItem.findMany({
    where: { id: { in: menuItemIds }, isAvailable: true },
    select: { id: true, name: true, price: true, isAvailable: true },
  });

  if (menuItems.length !== menuItemIds.length) {
    const foundIds = menuItems.map((m) => m.id);
    const missing = menuItemIds.filter((id) => !foundIds.includes(id));
    throw { statusCode: 400, message: `Menu item(s) unavailable or not found: IDs [${missing.join(', ')}]` };
  }

  // 1b. Validate branch-specific manual disablement
  const branchOverrides = await prisma.branchMenuItem.findMany({
    where: {
      branchId: Number(branchId),
      menuItemId: { in: menuItemIds },
      isAvailable: false,
    },
    include: { menuItem: { select: { name: true } } },
  });

  if (branchOverrides.length > 0) {
    const disabledNames = branchOverrides.map((bo) => bo.menuItem?.name || `ID ${bo.menuItemId}`);
    throw {
      statusCode: 400,
      message: `Menu item(s) are disabled in branch #${branchId}: [${disabledNames.join(', ')}]`,
    };
  }

  // 1c. Validate recipe configuration: products must have recipes before selling
  const recipes = await prisma.menuItemRecipeIngredient.findMany({
    where: { menuItemId: { in: menuItemIds } },
    select: { menuItemId: true },
  });
  const itemsWithRecipes = new Set(recipes.map((r) => r.menuItemId));
  const unconfiguredItems = menuItems.filter((m) => !itemsWithRecipes.has(m.id));

  if (unconfiguredItems.length > 0) {
    const unconfiguredNames = unconfiguredItems.map((m) => m.name).join(', ');
    throw {
      statusCode: 400,
      message: `Cannot place order: Product(s) [${unconfiguredNames}] have no recipe configured. Ingredient requirements cannot be verified.`,
    };
  }

  // 2. Build order items with price snapshot
  const orderItemsData = items.map((item) => {
    const menu = menuItems.find((m) => m.id === Number(item.menuItemId));
    const unitPrice = Number(menu.price);
    const qty = parseInt(item.quantity, 10) || 1;
    const subtotal = roundDecimals(unitPrice * qty, 2);

    return {
      menuItemId: Number(item.menuItemId),
      quantity: qty,
      unitPrice,
      subtotal,
      notes: item.notes || null,
    };
  });

  // 3. Calculate total
  const totalAmount = roundDecimals(orderItemsData.reduce((sum, i) => sum + i.subtotal, 0), 2);
  const { vatableSales, vatAmount, taxRate } = computeVat(totalAmount);

  // 4 & 5. Persist order, order items, and deduct inventory with COGS snapshots atomically
  // Includes optimistic collision retry for orderNumber under high concurrency
  let lastError;
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      const orderNumber = await generateOrderNumber(branchId);

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
            branchId: Number(branchId),
            cashierId: Number(cashierId),
            inventoryDeducted: false,
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

        // 6. Deduct inventory and calculate COGS snapshot for this order
        // If stock is insufficient, this throws and the whole transaction safely rolls back
        const deductionResult = await inventoryService.deductInventoryForOrder({
          tx,
          branchId: Number(branchId),
          orderId: createdOrder.id,
          items: createdOrder.items.map((item) => ({
            menuItemId: item.menuItemId,
            quantity: item.quantity,
            orderItemId: item.id,
          })),
        });

        // Fetch the updated order with COGS snapshots
        const refreshed = await tx.order.findUnique({
          where: { id: createdOrder.id },
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

        return { refreshed, transitions: deductionResult?.transitions || [] };
      });

      await notificationService.processTransitionsSafely(order.transitions);
      return order.refreshed;
    } catch (err) {
      if (err.code === 'P2002' && attempt < 5) {
        lastError = err;
        continue;
      }
      throw err;
    }
  }

  throw lastError;
}

// ─────────────────────────────────────────
// GET ORDERS
// ─────────────────────────────────────────

async function getOrders({ branchId, status, type, date, page = 1, limit = 20, userRole, userBranchId }) {
  const effectiveBranchId = userRole === 'MANAGER' ? branchId : userBranchId;

  const where = {};
  if (effectiveBranchId) where.branchId = Number(effectiveBranchId);
  if (status) where.status = status;
  if (type) where.type = type;

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
        include: {
          menuItem: {
            select: { id: true, name: true, price: true, imageUrl: true, categoryId: true },
          },
        },
      },
      payments: true,
      cashier: { select: { id: true, name: true } },
      branch: { select: { id: true, name: true, city: true, address: true } },
    },
  });

  if (!order) throw { statusCode: 404, message: 'Order not found.' };

  if (userRole !== 'OWNER' && order.branchId !== userBranchId) {
    throw { statusCode: 403, message: 'Access denied to this order.' };
  }

  return order;
}

// ─────────────────────────────────────────
// UPDATE ORDER STATUS
// ─────────────────────────────────────────

const VALID_TRANSITIONS = {
  PENDING:   ['PREPARING', 'CANCELLED'],
  PREPARING: ['READY', 'CANCELLED'],
  READY:     ['COMPLETED', 'CANCELLED'],
  COMPLETED: ['PENDING'],  
  CANCELLED: ['PENDING'], 
};

async function updateOrderStatus(orderId, newStatus, { userRole, userBranchId, actorUserId }) {
  const order = await prisma.order.findUnique({
    where: { id: Number(orderId) },
    include: { items: true },
  });

  if (!order) throw { statusCode: 404, message: 'Order not found.' };

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

  const txResult = await prisma.$transaction(async (tx) => {
    const transitions = [];

    // If transitioning to CANCELLED and inventory was deducted, restore it
    if (newStatus === 'CANCELLED' && order.inventoryDeducted) {
      const res = await inventoryService.restoreInventoryForOrder({
        tx,
        orderId: order.id,
        reason: `Status transition to CANCELLED for ${order.orderNumber}`,
        actorUserId,
      });
      if (res?.transitions?.length) transitions.push(...res.transitions);
    }

    // If reopening a cancelled order (CANCELLED -> PENDING), re-deduct inventory
    if (order.status === 'CANCELLED' && newStatus === 'PENDING' && !order.inventoryDeducted) {
      const res = await inventoryService.deductInventoryForOrder({
        tx,
        branchId: order.branchId,
        orderId: order.id,
        items: order.items.map((i) => ({ menuItemId: i.menuItemId, quantity: i.quantity, orderItemId: i.id })),
      });
      if (res?.transitions?.length) transitions.push(...res.transitions);
    }

    const updated = await tx.order.update({
      where: { id: Number(orderId) },
      data: { status: newStatus },
      include: {
        items:   { include: { menuItem: { select: { id: true, name: true } } } },
        payments: true,
        branch:  { select: { id: true, name: true } },
      },
    });

    return { updated, transitions };
  });

  await notificationService.processTransitionsSafely(txResult.transitions);
  return txResult.updated;
}

// ─────────────────────────────────────────
// CANCEL ORDER
// ─────────────────────────────────────────

async function cancelOrder(orderId, { userRole, userBranchId, actorUserId }) {
  const order = await prisma.order.findUnique({
    where: { id: Number(orderId) },
  });

  if (!order) throw { statusCode: 404, message: 'Order not found.' };

  if (userRole !== 'OWNER' && userRole !== 'ADMIN' && order.branchId !== userBranchId) {
    throw { statusCode: 403, message: 'Access denied to this order.' };
  }

  if (order.status === 'CANCELLED') {
    throw { statusCode: 400, message: 'Order is already cancelled.' };
  }

  const txResult = await prisma.$transaction(async (tx) => {
    const transitions = [];
    // Atomically restore deducted ingredients if any
    if (order.inventoryDeducted) {
      const res = await inventoryService.restoreInventoryForOrder({
        tx,
        orderId: order.id,
        reason: `Order cancelled (${order.orderNumber})`,
        actorUserId,
      });
      if (res?.transitions?.length) transitions.push(...res.transitions);
    }

    const updated = await tx.order.update({
      where: { id: Number(orderId) },
      data: { status: 'CANCELLED' },
      include: {
        items:   { include: { menuItem: { select: { id: true, name: true } } } },
        payments: true,
        branch:  { select: { id: true, name: true } },
      },
    });

    return { updated, transitions };
  });

  await notificationService.processTransitionsSafely(txResult.transitions);
  return txResult.updated;
}

// ─────────────────────────────────────────
// PROCESS PAYMENT
// ─────────────────────────────────────────

async function processPayment({ orderId, payments, method, amountPaid, referenceNo, discountType }, { userRole, userBranchId }) {
  const order = await prisma.order.findUnique({
    where: { id: Number(orderId) },
    include: { payments: true, items: true },
  });

  if (!order) throw { statusCode: 404, message: 'Order not found.' };

  if (userRole !== 'OWNER' && order.branchId !== userBranchId) {
    throw { statusCode: 403, message: 'Access denied to this order.' };
  }

  if (order.status === 'COMPLETED') {
    throw { statusCode: 400, message: 'Order is already completed and paid.' };
  }

  const tenders = Array.isArray(payments) && payments.length > 0
    ? payments
    : [{ method, amountPaid, referenceNo }];

  if (tenders.some((t) => !t.method || t.amountPaid == null)) {
    throw { statusCode: 400, message: 'Each payment must include a method and amountPaid.' };
  }

  const originalTotal = Number(order.totalAmount);

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

  const total = discount ? Math.max(0, originalTotal - discount.amount) : originalTotal;
  const totalTendered = tenders.reduce((sum, t) => sum + Number(t.amountPaid), 0);

  if (totalTendered < total) {
    throw {
      statusCode: 400,
      message: `Insufficient payment. Total is ₱${total.toFixed(2)}, paid ₱${totalTendered.toFixed(2)}.`,
    };
  }

  const overpayment = Math.round((totalTendered - total) * 100) / 100;
  const cashIdx = tenders.findIndex((t) => t.method === 'CASH');
  const changeIdx = cashIdx !== -1 ? cashIdx : tenders.length - 1;

  const paymentRows = tenders.map((t, idx) => ({
    orderId: Number(orderId),
    method: t.method,
    amountPaid: Number(t.amountPaid),
    change: idx === changeIdx ? overpayment : 0,
    referenceNo: t.referenceNo || null,
    discountType: discount?.type || null,
    discountLabel: discount?.label || null,
    discountPercentage: discount?.percentage || null,
    discountAmount: discount?.amount || null,
  }));

  const updatedOrder = await prisma.$transaction(async (tx) => {
    // Clear old payment rows if any
    if (order.payments.length > 0) {
      await tx.payment.deleteMany({ where: { orderId: Number(orderId) } });
    }

    // Insert new payment tenders
    await tx.payment.createMany({ data: paymentRows });

    // Idempotency: ensure inventory is deducted and COGS is snapshotted
    let transitions = [];
    if (!order.inventoryDeducted) {
      const res = await inventoryService.deductInventoryForOrder({
        tx,
        branchId: order.branchId,
        orderId: order.id,
        items: order.items.map((i) => ({ menuItemId: i.menuItemId, quantity: i.quantity, orderItemId: i.id })),
      });
      transitions = res?.transitions || [];
    }

    const completed = await tx.order.update({
      where: { id: Number(orderId) },
      data: {
        status: 'COMPLETED',
        discountTotal: discount?.amount || 0,
      },
      include: { payments: true, items: true },
    });

    return { completed, transitions };
  });

  await notificationService.processTransitionsSafely(updatedOrder.transitions);

  return {
    order: updatedOrder.completed,
    payments: updatedOrder.completed.payments,
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
