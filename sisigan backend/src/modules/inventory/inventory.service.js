// src/modules/inventory/inventory.service.js
// Inventory operations + deduction rules + audit logging.

const prisma = require('../../config/db');

function getScopedBranchId(requestingUser, branchId) {
  if (requestingUser.role === 'OWNER') {
    return branchId ? Number(branchId) : null;
  }
  return requestingUser.branchId;
}

function startAndEndOfDay(date = new Date()) {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const end = new Date(date);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

async function getInventory({ branchId, lowOnly = false, search = '' }, requestingUser) {
  const scopedBranchId = getScopedBranchId(requestingUser, branchId);

  const where = {
    ...(scopedBranchId && { branchId: scopedBranchId }),
    isActive: true,
    ...(search
      ? {
          ingredient: {
            name: { contains: search },
          },
        }
      : {}),
  };

  const rows = await prisma.inventoryItem.findMany({
    where,
    include: {
      branch: { select: { id: true, name: true, city: true } },
      ingredient: { select: { id: true, name: true, category: true, unit: true } },
    },
    orderBy: [{ branchId: 'asc' }, { ingredient: { name: 'asc' } }],
  });

  const withAlerts = rows.map((row) => ({
    ...row,
    lowStock: Number(row.quantity) <= Number(row.minThreshold),
  }));

  if (lowOnly) {
    return withAlerts.filter((row) => row.lowStock);
  }

  return withAlerts;
}

async function updateInventoryItem(itemId, { quantity, note }, requestingUser) {
  const existing = await prisma.inventoryItem.findUnique({
    where: { id: Number(itemId) },
    include: { ingredient: true },
  });

  if (!existing) {
    throw { statusCode: 404, message: 'Inventory item not found.' };
  }

  if (requestingUser.role !== 'OWNER' && existing.branchId !== requestingUser.branchId) {
    throw { statusCode: 403, message: 'Access denied for this branch inventory.' };
  }

  const nextQty = Number(quantity);
  if (Number.isNaN(nextQty) || nextQty < 0) {
    throw { statusCode: 400, message: 'Quantity must be a non-negative number.' };
  }

  const updated = await prisma.$transaction(async (tx) => {
    const before = Number(existing.quantity);

    const row = await tx.inventoryItem.update({
      where: { id: Number(itemId) },
      data: { quantity: nextQty },
      include: {
        branch: { select: { id: true, name: true, city: true } },
        ingredient: { select: { id: true, name: true, category: true, unit: true } },
      },
    });

    await tx.inventoryAuditLog.create({
      data: {
        inventoryItemId: existing.id,
        actionType: 'MANUAL_EDIT',
        quantityBefore: before,
        quantityAfter: nextQty,
        quantityChanged: nextQty - before,
        note: note || 'Manual quantity update',
        actorUserId: requestingUser.id,
      },
    });

    return row;
  });

  return {
    ...updated,
    lowStock: Number(updated.quantity) <= Number(updated.minThreshold),
  };
}

async function createInventoryItem(payload, requestingUser) {
  const {
    name,
    category,
    unit,
    quantity,
    branchId,
    minThreshold,
    price,
    consumptionRateDays,
    consumptionLabel,
    dailyDeductionAmount,
  } = payload;

  const scopedBranchId = getScopedBranchId(requestingUser, branchId);
  if (!scopedBranchId) {
    throw { statusCode: 400, message: 'Branch is required.' };
  }

  const qty = Number(quantity);
  const min = minThreshold !== undefined ? Number(minThreshold) : 0;
  const p = price !== undefined && price !== null && price !== '' ? Number(price) : null;
  const rateDays =
    consumptionRateDays !== undefined && consumptionRateDays !== null && consumptionRateDays !== ''
      ? Number(consumptionRateDays)
      : null;
  const daily =
    dailyDeductionAmount !== undefined && dailyDeductionAmount !== null && dailyDeductionAmount !== ''
      ? Number(dailyDeductionAmount)
      : rateDays && qty ? qty / rateDays : null;

  const row = await prisma.$transaction(async (tx) => {
    const ingredient = await tx.ingredient.upsert({
      where: { name: String(name).trim() },
      update: {
        category,
        unit,
        ...(rateDays !== null && { defaultConsumptionRateDays: rateDays }),
        ...(consumptionLabel && { defaultConsumptionLabel: consumptionLabel }),
        ...(daily !== null && { defaultDailyDeduction: daily }),
        ...(p !== null && { defaultPrice: p }),
        defaultMinThreshold: min,
      },
      create: {
        name: String(name).trim(),
        category,
        unit,
        defaultConsumptionRateDays: rateDays,
        defaultConsumptionLabel: consumptionLabel || null,
        defaultDailyDeduction: daily,
        defaultPrice: p,
        defaultMinThreshold: min,
      },
    });

    const inventory = await tx.inventoryItem.upsert({
      where: {
        branchId_ingredientId: {
          branchId: Number(scopedBranchId),
          ingredientId: ingredient.id,
        },
      },
      update: {
        quantity: qty,
        minThreshold: min,
        price: p,
        consumptionRateDays: rateDays,
        consumptionLabel: consumptionLabel || null,
        dailyDeductionAmount: daily,
        isActive: true,
      },
      create: {
        branchId: Number(scopedBranchId),
        ingredientId: ingredient.id,
        quantity: qty,
        minThreshold: min,
        price: p,
        consumptionRateDays: rateDays,
        consumptionLabel: consumptionLabel || null,
        dailyDeductionAmount: daily,
      },
      include: {
        branch: { select: { id: true, name: true, city: true } },
        ingredient: { select: { id: true, name: true, category: true, unit: true } },
      },
    });

    await tx.inventoryAuditLog.create({
      data: {
        inventoryItemId: inventory.id,
        actionType: 'MANUAL_EDIT',
        quantityBefore: 0,
        quantityAfter: qty,
        quantityChanged: qty,
        note: 'Created/initialized inventory item',
        actorUserId: requestingUser.id,
      },
    });

    return inventory;
  });

  return {
    ...row,
    lowStock: Number(row.quantity) <= Number(row.minThreshold),
  };
}

// Recipe-based deduction called by POST /orders.
async function deductInventoryForOrder({ tx, branchId, orderId, items }) {
  const db = tx || prisma;
  const menuItemIds = [...new Set(items.map((i) => Number(i.menuItemId)))];

  const recipes = await db.menuItemRecipeIngredient.findMany({
    where: { menuItemId: { in: menuItemIds } },
    include: { ingredient: { select: { id: true, name: true } } },
  });

  if (!recipes.length) return;

  const recipeByMenu = new Map();
  for (const r of recipes) {
    if (!recipeByMenu.has(r.menuItemId)) recipeByMenu.set(r.menuItemId, []);
    recipeByMenu.get(r.menuItemId).push(r);
  }

  const requiredByIngredient = new Map(); // ingredientId -> { total, name }
  for (const item of items) {
    const qtyOrdered = Number(item.quantity);
    const itemRecipes = recipeByMenu.get(Number(item.menuItemId)) || [];

    for (const r of itemRecipes) {
      const prev = requiredByIngredient.get(r.ingredientId) || { total: 0, name: r.ingredient.name };
      requiredByIngredient.set(r.ingredientId, {
        total: prev.total + Number(r.quantity) * qtyOrdered,
        name: r.ingredient.name,
      });
    }
  }

  if (!requiredByIngredient.size) return;

  const ingredientIds = [...requiredByIngredient.keys()];
  const inventoryRows = await db.inventoryItem.findMany({
    where: {
      branchId: Number(branchId),
      ingredientId: { in: ingredientIds },
      isActive: true,
    },
  });

  const inventoryByIngredient = new Map(inventoryRows.map((row) => [row.ingredientId, row]));

  // Validate stock for all ingredients before touching any
  for (const ingredientId of ingredientIds) {
    const row = inventoryByIngredient.get(ingredientId);
    const { total: needed, name } = requiredByIngredient.get(ingredientId);

    if (!row) {
      throw {
        statusCode: 400,
        message: `No inventory stock found for "${name}" in this branch. Please add stock before ordering.`,
      };
    }

    if (Number(row.quantity) < needed) {
      throw {
        statusCode: 400,
        message: `Insufficient stock for "${name}". Need ${needed}, only ${Number(row.quantity)} available.`,
      };
    }
  }

  // All checks passed — now deduct
  for (const ingredientId of ingredientIds) {
    const row = inventoryByIngredient.get(ingredientId);
    const before = Number(row.quantity);
    const deduction = requiredByIngredient.get(ingredientId).total;
    const after = before - deduction;

    await db.inventoryItem.update({
      where: { id: row.id },
      data: { quantity: after },
    });

    await db.inventoryAuditLog.create({
      data: {
        inventoryItemId: row.id,
        actionType: 'ORDER_DEDUCTION',
        quantityBefore: before,
        quantityAfter: after,
        quantityChanged: -deduction,
        orderId: Number(orderId),
        note: 'Auto-deducted from recipe on order creation',
      },
    });
  }
}

// Runs once per day. Deducts inventory using dailyDeductionAmount.
async function runDailyDeduction() {
  const { start, end } = startAndEndOfDay();

  const items = await prisma.inventoryItem.findMany({
    where: {
      isActive: true,
      dailyDeductionAmount: { gt: 0 },
    },
  });

  let processed = 0;
  let skipped = 0;

  for (const item of items) {
    const alreadyDeducted = await prisma.inventoryAuditLog.findFirst({
      where: {
        inventoryItemId: item.id,
        actionType: 'DAILY_DEDUCTION',
        createdAt: { gte: start, lte: end },
      },
      select: { id: true },
    });

    if (alreadyDeducted) {
      skipped++;
      continue;
    }

    const before = Number(item.quantity);
    const deduction = Number(item.dailyDeductionAmount || 0);
    const after = Math.max(0, before - deduction);

    if (before === after) {
      skipped++;
      continue;
    }

    await prisma.$transaction([
      prisma.inventoryItem.update({
        where: { id: item.id },
        data: { quantity: after },
      }),
      prisma.inventoryAuditLog.create({
        data: {
          inventoryItemId: item.id,
          actionType: 'DAILY_DEDUCTION',
          quantityBefore: before,
          quantityAfter: after,
          quantityChanged: after - before,
          note: '6AM scheduled deduction',
        },
      }),
    ]);

    processed++;
  }

  return { processed, skipped, total: items.length };
}

// Called right after a branch is created (see branch.service.js). Gives the new
// branch one InventoryItem row per existing ingredient, quantity 0, seeded from
// that ingredient's default* fields. Pass the transaction client so this lives
// in the same transaction as the branch insert — if either fails, both roll back.
async function seedBranchInventory(branchId, tx) {
  const db = tx || prisma;

  const ingredients = await db.ingredient.findMany();
  if (!ingredients.length) return { seeded: 0 };

  for (const ingredient of ingredients) {
    const inventory = await db.inventoryItem.create({
      data: {
        branchId: Number(branchId),
        ingredientId: ingredient.id,
        quantity: 0,
        minThreshold: ingredient.defaultMinThreshold ?? 0,
        price: ingredient.defaultPrice ?? null,
        consumptionRateDays: ingredient.defaultConsumptionRateDays ?? null,
        consumptionLabel: ingredient.defaultConsumptionLabel ?? null,
        dailyDeductionAmount: ingredient.defaultDailyDeduction ?? null,
      },
    });

    await db.inventoryAuditLog.create({
      data: {
        inventoryItemId: inventory.id,
        actionType: 'MANUAL_EDIT',
        quantityBefore: 0,
        quantityAfter: 0,
        quantityChanged: 0,
        note: 'Auto-seeded on branch creation',
      },
    });
  }

  return { seeded: ingredients.length };
}

async function getAuditLogs({ branchId, actionType, from, to, limit = 100 }, requestingUser) {
  const scopedBranchId = getScopedBranchId(requestingUser, branchId);
  const safeLimit = Math.max(1, Math.min(Number(limit) || 100, 500));

  const where = {
    ...(actionType && { actionType }),
    ...(from || to
      ? {
          createdAt: {
            ...(from && { gte: new Date(from) }),
            ...(to && { lte: new Date(to) }),
          },
        }
      : {}),
    inventoryItem: {
      ...(scopedBranchId && { branchId: scopedBranchId }),
    },
  };

  return prisma.inventoryAuditLog.findMany({
    where,
    include: {
      inventoryItem: {
        include: {
          ingredient: true,
          branch: { select: { id: true, name: true, city: true } },
        },
      },
      actor: { select: { id: true, name: true, email: true, role: true } },
      order: { select: { id: true, orderNumber: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: safeLimit,
  });
}

module.exports = {
  getInventory,
  createInventoryItem,
  updateInventoryItem,
  deductInventoryForOrder,
  runDailyDeduction,
  seedBranchInventory,
  getAuditLogs,
};