// src/modules/inventory/inventory.service.js
// Production-ready Inventory operations + Weighted-Average Costing + Recipe Deductions + Auditing.

const prisma = require('../../config/db');
const {
  convertQuantity,
  calculateWeightedAverageCost,
  calculateProductRecipeCost,
  roundDecimals,
} = require('../../utils/inventoryCosting');
const { validateBranchAccess } = require('../../middleware/branchScope.middleware');

function getScopedBranchId(requestingUser, branchId) {
  return validateBranchAccess(requestingUser, branchId);
}

function startAndEndOfDay(date = new Date()) {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const end = new Date(date);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

/**
 * Get inventory items for branch with valuation, alerts, and search.
 */
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
      ingredient: {
        select: {
          id: true,
          name: true,
          category: true,
          unit: true,
          defaultPrice: true,
          yieldPercentage: true,
        },
      },
    },
    orderBy: [{ branchId: 'asc' }, { ingredient: { name: 'asc' } }],
  });

  const withMetrics = rows.map((row) => {
    const qty = Number(row.quantity) || 0;
    const min = Number(row.minThreshold) || 0;
    const unitPrice =
      row.price != null && Number(row.price) > 0
        ? Number(row.price)
        : row.ingredient.defaultPrice != null
        ? Number(row.ingredient.defaultPrice)
        : 0;

    const inventoryValue = roundDecimals(qty * unitPrice, 2);

    return {
      ...row,
      quantity: roundDecimals(qty, 3),
      minThreshold: roundDecimals(min, 3),
      unitCost: roundDecimals(unitPrice, 4),
      inventoryValue,
      lowStock: qty <= min && qty > 0,
      outOfStock: qty <= 0,
    };
  });

  if (lowOnly) {
    return withMetrics.filter((row) => row.lowStock || row.outOfStock);
  }

  return withMetrics;
}

/**
 * RESTOCK an inventory item using Perpetual Weighted-Average Costing.
 * Converts purchase unit to base inventory unit, factors in yield/trimming waste,
 * updates inventory quantity and weighted-average unit cost, and creates an audit log.
 */
async function restockInventoryItem(payload, requestingUser) {
  const {
    itemId,
    branchId,
    ingredientId,
    purchaseQuantity,
    purchaseUnit,
    purchaseCost,
    yieldPercentage = 100,
    referenceNo,
    note,
  } = payload;

  const targetBranchId = getScopedBranchId(requestingUser, branchId);
  if (!targetBranchId) {
    throw { statusCode: 400, message: 'Branch ID is required for restocking.' };
  }

  let inventoryItem;
  if (itemId) {
    inventoryItem = await prisma.inventoryItem.findUnique({
      where: { id: Number(itemId) },
      include: { ingredient: true, branch: true },
    });
  } else if (ingredientId) {
    inventoryItem = await prisma.inventoryItem.findUnique({
      where: {
        branchId_ingredientId: {
          branchId: Number(targetBranchId),
          ingredientId: Number(ingredientId),
        },
      },
      include: { ingredient: true, branch: true },
    });
  }

  if (!inventoryItem) {
    throw { statusCode: 404, message: 'Inventory item not found.' };
  }

  if (requestingUser.role !== 'OWNER' && inventoryItem.branchId !== requestingUser.branchId) {
    throw { statusCode: 403, message: 'Access denied for this branch inventory.' };
  }

  const pQty = Number(purchaseQuantity);
  const pCost = Number(purchaseCost);
  const yieldPct = Number(yieldPercentage) || 100;

  if (Number.isNaN(pQty) || pQty <= 0) {
    throw { statusCode: 400, message: 'Purchase quantity must be greater than 0.' };
  }
  if (Number.isNaN(pCost) || pCost < 0) {
    throw { statusCode: 400, message: 'Purchase cost must be a non-negative number.' };
  }
  if (yieldPct <= 0 || yieldPct > 100) {
    throw { statusCode: 400, message: 'Yield percentage must be between 1% and 100%.' };
  }

  // Convert purchase quantity from purchaseUnit to ingredient's inventory unit
  const sourceUnit = purchaseUnit || inventoryItem.ingredient.unit;
  const baseUnit = inventoryItem.ingredient.unit;
  let quantityInBaseUnit = pQty;

  try {
    quantityInBaseUnit = convertQuantity(pQty, sourceUnit, baseUnit);
  } catch (err) {
    throw { statusCode: 400, message: `Unit conversion failed: ${err.message}` };
  }

  // Execute in atomic transaction
  const result = await prisma.$transaction(async (tx) => {
    // Lock and get fresh row
    const freshItem = await tx.inventoryItem.findUnique({
      where: { id: inventoryItem.id },
      include: { ingredient: true },
    });

    const currentQty = Number(freshItem.quantity);
    const currentPrice =
      freshItem.price != null && Number(freshItem.price) > 0
        ? Number(freshItem.price)
        : freshItem.ingredient.defaultPrice != null
        ? Number(freshItem.ingredient.defaultPrice)
        : 0;

    // Calculate perpetual weighted-average cost
    const weightedCalc = calculateWeightedAverageCost({
      existingQuantity: currentQty,
      existingAvgCost: currentPrice,
      purchaseQuantity: quantityInBaseUnit,
      purchaseCost: pCost,
      yieldPercentage: yieldPct,
    });

    const nextQty = roundDecimals(currentQty + weightedCalc.usablePurchaseQuantity, 3);
    const nextAvgCost = weightedCalc.newAverageCost;

    // Update inventory item
    const updated = await tx.inventoryItem.update({
      where: { id: freshItem.id },
      data: {
        quantity: nextQty,
        price: nextAvgCost,
      },
      include: {
        branch: { select: { id: true, name: true, city: true } },
        ingredient: { select: { id: true, name: true, category: true, unit: true, defaultPrice: true } },
      },
    });

    // Record audit log
    await tx.inventoryAuditLog.create({
      data: {
        inventoryItemId: freshItem.id,
        actionType: 'RESTOCK',
        quantityBefore: currentQty,
        quantityAfter: nextQty,
        quantityChanged: weightedCalc.usablePurchaseQuantity,
        unitCost: nextAvgCost,
        totalCost: pCost,
        referenceNo: referenceNo || null,
        note:
          note ||
          `Restocked ${pQty} ${sourceUnit} @ ₱${pCost.toFixed(2)} (yield: ${yieldPct}%, new avg: ₱${nextAvgCost.toFixed(4)}/${baseUnit})`,
        actorUserId: requestingUser.id,
      },
    });

    return {
      ...updated,
      restockSummary: {
        purchasedQuantity: pQty,
        purchasedUnit: sourceUnit,
        usableQuantityAdded: weightedCalc.usablePurchaseQuantity,
        inventoryUnit: baseUnit,
        purchaseCost: pCost,
        yieldPercentage: yieldPct,
        previousQuantity: currentQty,
        newQuantity: nextQty,
        previousUnitCost: currentPrice,
        newAverageUnitCost: nextAvgCost,
        totalInventoryValue: roundDecimals(nextQty * nextAvgCost, 2),
      },
    };
  });

  return result;
}

/**
 * Adjust inventory quantity (Wastage / Spoilage / Manual Count Adjustment).
 */
async function adjustInventoryItem(itemId, { newQuantity, actionType = 'MANUAL_EDIT', note }, requestingUser) {
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

  const nextQty = Number(newQuantity);
  if (Number.isNaN(nextQty) || nextQty < 0) {
    throw { statusCode: 400, message: 'Quantity must be a non-negative number.' };
  }

  const validActionTypes = ['MANUAL_EDIT', 'WASTAGE'];
  const finalActionType = validActionTypes.includes(actionType) ? actionType : 'MANUAL_EDIT';

  const updated = await prisma.$transaction(async (tx) => {
    const before = Number(existing.quantity);
    const changed = roundDecimals(nextQty - before, 3);
    const unitCost =
      existing.price != null && Number(existing.price) > 0
        ? Number(existing.price)
        : existing.ingredient.defaultPrice != null
        ? Number(existing.ingredient.defaultPrice)
        : 0;

    const totalCost = roundDecimals(Math.abs(changed) * unitCost, 2);

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
        actionType: finalActionType,
        quantityBefore: before,
        quantityAfter: nextQty,
        quantityChanged: changed,
        unitCost: unitCost > 0 ? unitCost : null,
        totalCost: totalCost > 0 ? totalCost : null,
        note: note || (finalActionType === 'WASTAGE' ? 'Wastage / Spoilage logged' : 'Manual stock adjustment'),
        actorUserId: requestingUser.id,
      },
    });

    return row;
  });

  return {
    ...updated,
    lowStock: Number(updated.quantity) <= Number(updated.minThreshold),
    outOfStock: Number(updated.quantity) <= 0,
  };
}

/**
 * Legacy update quantity endpoint preserved for backward compatibility.
 * Redirects to adjustInventoryItem with MANUAL_EDIT action.
 */
async function updateInventoryItem(itemId, { quantity, note }, requestingUser) {
  return adjustInventoryItem(itemId, { newQuantity: quantity, actionType: 'MANUAL_EDIT', note }, requestingUser);
}

/**
 * Edit ingredient details (category, unit, price/cost, threshold, consumption)
 * WITHOUT touching quantity.
 */
async function updateIngredientDetails(itemId, payload, requestingUser) {
  const { category, unit, price, minThreshold, consumptionRateDays, consumptionLabel, dailyDeductionAmount, yieldPercentage } = payload;

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

  const p = price !== undefined && price !== null && price !== '' ? Number(price) : null;
  const min = minThreshold !== undefined && minThreshold !== null && minThreshold !== '' ? Number(minThreshold) : Number(existing.minThreshold);
  const rateDays = consumptionRateDays !== undefined && consumptionRateDays !== null && consumptionRateDays !== '' ? Number(consumptionRateDays) : null;
  const daily = dailyDeductionAmount !== undefined && dailyDeductionAmount !== null && dailyDeductionAmount !== '' ? Number(dailyDeductionAmount) : null;
  const yieldPct = yieldPercentage !== undefined && yieldPercentage !== null && yieldPercentage !== '' ? Number(yieldPercentage) : undefined;

  const updated = await prisma.$transaction(async (tx) => {
    // Only OWNER can update master ingredient template
    if (requestingUser.role === 'OWNER') {
      await tx.ingredient.update({
        where: { id: existing.ingredientId },
        data: {
          ...(category && { category }),
          ...(unit && { unit }),
          ...(p !== null && { defaultPrice: p }),
          ...(yieldPct !== undefined && { yieldPercentage: yieldPct }),
          defaultMinThreshold: min,
          ...(rateDays !== null && { defaultConsumptionRateDays: rateDays }),
          ...(consumptionLabel !== undefined && { defaultConsumptionLabel: consumptionLabel || null }),
          ...(daily !== null && { defaultDailyDeduction: daily }),
        },
      });
    }

    // Update this branch's InventoryItem (quantity excluded)
    const row = await tx.inventoryItem.update({
      where: { id: Number(itemId) },
      data: {
        price: p,
        minThreshold: min,
        ...(rateDays !== null && { consumptionRateDays: rateDays }),
        ...(consumptionLabel !== undefined && { consumptionLabel: consumptionLabel || null }),
        ...(daily !== null && { dailyDeductionAmount: daily }),
      },
      include: {
        branch: { select: { id: true, name: true, city: true } },
        ingredient: { select: { id: true, name: true, category: true, unit: true, defaultPrice: true, yieldPercentage: true } },
      },
    });

    await tx.inventoryAuditLog.create({
      data: {
        inventoryItemId: row.id,
        actionType: 'MANUAL_EDIT',
        quantityBefore: Number(row.quantity),
        quantityAfter: Number(row.quantity),
        quantityChanged: 0,
        note: 'Edited ingredient details (cost/unit/category/threshold)',
        actorUserId: requestingUser.id,
      },
    });

    return row;
  });

  return {
    ...updated,
    lowStock: Number(updated.quantity) <= Number(updated.minThreshold),
    outOfStock: Number(updated.quantity) <= 0,
  };
}

/**
 * Create or initialize inventory item with ingredient.
 */
async function createInventoryItem(payload, requestingUser) {
  const {
    name,
    category,
    unit,
    quantity,
    branchId,
    minThreshold,
    price,
    yieldPercentage = 100,
    consumptionRateDays,
    consumptionLabel,
    dailyDeductionAmount,
  } = payload;

  const scopedBranchId = getScopedBranchId(requestingUser, branchId);
  if (!scopedBranchId) {
    throw { statusCode: 400, message: 'Branch is required.' };
  }

  const qty = Number(quantity) || 0;
  const min = minThreshold !== undefined ? Number(minThreshold) : 0;
  const p = price !== undefined && price !== null && price !== '' ? Number(price) : null;
  const yieldPct = Number(yieldPercentage) || 100;
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
        yieldPercentage: yieldPct,
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
        yieldPercentage: yieldPct,
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
        unitCost: p,
        totalCost: p != null ? roundDecimals(qty * p, 2) : null,
        note: 'Created/initialized inventory item',
        actorUserId: requestingUser.id,
      },
    });

    // Ensure all other active branches also have an independent inventoryItem record initialized with 0 stock
    const otherBranches = await tx.branch.findMany({
      where: {
        id: { not: Number(scopedBranchId) },
        isActive: true,
      },
      select: { id: true },
    });

    for (const ob of otherBranches) {
      await tx.inventoryItem.upsert({
        where: {
          branchId_ingredientId: {
            branchId: ob.id,
            ingredientId: ingredient.id,
          },
        },
        update: {},
        create: {
          branchId: ob.id,
          ingredientId: ingredient.id,
          quantity: 0,
          minThreshold: min,
          price: p,
          consumptionRateDays: rateDays,
          consumptionLabel: consumptionLabel || null,
          dailyDeductionAmount: daily,
          isActive: true,
        },
      });
    }

    return inventory;
  });

  return {
    ...row,
    lowStock: Number(row.quantity) <= Number(row.minThreshold),
    outOfStock: Number(row.quantity) <= 0,
  };
}

/**
 * Recipe-based deduction called when an order is created / finalized.
 * Atomic, unit-converted, yield-aware, and snapshots COGS on order items.
 *
 * @param {Object} params
 * @param {PrismaClient} params.tx - Transaction client
 * @param {number} params.branchId - Branch ID
 * @param {number} params.orderId - Order ID
 * @param {Array<{ menuItemId: number, quantity: number, orderItemId?: number }>} params.items
 * @returns {Promise<{ totalOrderCogs: number, itemCogs: Array }>}
 */
async function deductInventoryForOrder({ tx, branchId, orderId, items }) {
  const db = tx || prisma;
  const menuItemIds = [...new Set(items.map((i) => Number(i.menuItemId)))];

  const recipes = await db.menuItemRecipeIngredient.findMany({
    where: { menuItemId: { in: menuItemIds } },
    include: {
      ingredient: {
        select: {
          id: true,
          name: true,
          unit: true,
          defaultPrice: true,
        },
      },
    },
  });

  // If no recipes are linked to any menu items in this order, compute COGS as 0
  if (!recipes.length) {
    return { totalOrderCogs: 0, itemCogs: [] };
  }

  const recipeByMenu = new Map();
  for (const r of recipes) {
    if (!recipeByMenu.has(r.menuItemId)) recipeByMenu.set(r.menuItemId, []);
    recipeByMenu.get(r.menuItemId).push(r);
  }

  // Pre-fetch all branch inventory rows for the ingredients involved
  const allIngredientIds = [...new Set(recipes.map((r) => r.ingredientId))];

  // 1. Acquire exclusive row-level lock in MySQL to prevent concurrent overselling / race conditions
  if (allIngredientIds.length > 0) {
    const ingIdList = allIngredientIds.map(Number).join(',');
    await db.$queryRawUnsafe(
      `SELECT id FROM inventory_items WHERE branchId = ${Number(branchId)} AND ingredientId IN (${ingIdList}) FOR UPDATE`
    );
  }

  const inventoryRows = await db.inventoryItem.findMany({
    where: {
      branchId: Number(branchId),
      ingredientId: { in: allIngredientIds },
      isActive: true,
    },
  });

  const inventoryByIngredient = new Map(inventoryRows.map((row) => [row.ingredientId, row]));

  // Calculate required ingredient quantities with unit conversion & yield factor
  // Map: ingredientId -> { totalBaseRequired, name, baseUnit, unitCost }
  const requiredByIngredient = new Map();

  // Also calculate snapshot COGS per menu item and order item
  const itemCogsList = [];
  let totalOrderCogs = 0;

  for (const item of items) {
    const qtyOrdered = Number(item.quantity) || 1;
    const itemRecipes = recipeByMenu.get(Number(item.menuItemId)) || [];

    let menuItemUnitCost = 0;

    for (const r of itemRecipes) {
      const ing = r.ingredient;
      const recipeUnit = r.unit || ing.unit;
      const baseUnit = ing.unit;
      const reqRaw = Number(r.quantity) || 0;
      const yieldFactor = Number(r.yieldFactor) > 0 ? Number(r.yieldFactor) : 1;

      // Convert recipe quantity to base inventory unit
      let baseQtyPerServing = reqRaw;
      try {
        baseQtyPerServing = convertQuantity(reqRaw, recipeUnit, baseUnit);
      } catch (err) {
        throw {
          statusCode: 400,
          message: `Recipe conversion error for ingredient "${ing.name}": ${err.message}`,
        };
      }

      // Factor in yield/trimming loss
      const effectiveBaseQtyPerServing = yieldFactor > 0 ? baseQtyPerServing / yieldFactor : baseQtyPerServing;
      const totalBaseDeduction = roundDecimals(effectiveBaseQtyPerServing * qtyOrdered, 4);

      // Determine unit cost: branch inventory price or ingredient defaultPrice
      const branchStock = inventoryByIngredient.get(ing.id);
      const unitCost =
        branchStock && branchStock.price != null && Number(branchStock.price) > 0
          ? Number(branchStock.price)
          : ing.defaultPrice != null && Number(ing.defaultPrice) > 0
          ? Number(ing.defaultPrice)
          : 0;

      const lineCost = effectiveBaseQtyPerServing * unitCost;
      menuItemUnitCost += lineCost;

      // Accumulate total deduction across all order lines for this ingredient
      const prev = requiredByIngredient.get(ing.id) || {
        total: 0,
        name: ing.name,
        baseUnit,
        unitCost,
      };

      requiredByIngredient.set(ing.id, {
        total: roundDecimals(prev.total + totalBaseDeduction, 4),
        name: ing.name,
        baseUnit,
        unitCost,
      });
    }

    const itemTotalCogs = roundDecimals(menuItemUnitCost * qtyOrdered, 2);
    totalOrderCogs += itemTotalCogs;

    itemCogsList.push({
      menuItemId: Number(item.menuItemId),
      orderItemId: item.orderItemId || null,
      unitCost: roundDecimals(menuItemUnitCost, 4),
      cogs: itemTotalCogs,
      quantity: qtyOrdered,
    });
  }

  // Stock availability validation across all required ingredients
  for (const [ingredientId, { total: needed, name, baseUnit }] of requiredByIngredient.entries()) {
    const row = inventoryByIngredient.get(ingredientId);

    if (!row) {
      throw {
        statusCode: 400,
        message: `No inventory stock record found for "${name}" in this branch. Please add stock before ordering.`,
      };
    }

    const available = Number(row.quantity) || 0;
    if (available < needed) {
      throw {
        statusCode: 400,
        message: `Insufficient stock for "${name}". Required: ${needed} ${baseUnit}, but only ${available} ${baseUnit} available.`,
      };
    }
  }

  // Fetch order number for clear audit logging
  const orderRecord = await db.order.findUnique({
    where: { id: Number(orderId) },
    select: { orderNumber: true },
  });
  const orderNumber = orderRecord?.orderNumber || `ID#${orderId}`;

  // Execute atomic stock deductions and audit logs
  for (const [ingredientId, { total: deduction, unitCost }] of requiredByIngredient.entries()) {
    const row = inventoryByIngredient.get(ingredientId);
    const before = Number(row.quantity);
    const after = roundDecimals(before - deduction, 3);
    const totalDeductionCost = roundDecimals(deduction * unitCost, 2);

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
        unitCost: unitCost > 0 ? unitCost : null,
        totalCost: totalDeductionCost > 0 ? totalDeductionCost : null,
        orderId: Number(orderId),
        referenceNo: orderNumber,
        note: `Auto-deducted for order ${orderNumber}`,
      },
    });
  }

  // Update snapshot COGS on OrderItems and Order
  for (const itemCogs of itemCogsList) {
    if (itemCogs.orderItemId) {
      await db.orderItem.update({
        where: { id: itemCogs.orderItemId },
        data: {
          unitCost: itemCogs.unitCost,
          cogs: itemCogs.cogs,
        },
      });
    } else {
      // Find matching order item line for this order
      await db.orderItem.updateMany({
        where: {
          orderId: Number(orderId),
          menuItemId: itemCogs.menuItemId,
        },
        data: {
          unitCost: itemCogs.unitCost,
          cogs: itemCogs.cogs,
        },
      });
    }
  }

  // Snapshot total COGS on Order
  await db.order.update({
    where: { id: Number(orderId) },
    data: {
      cogs: roundDecimals(totalOrderCogs, 2),
      inventoryDeducted: true,
    },
  });

  return {
    totalOrderCogs: roundDecimals(totalOrderCogs, 2),
    itemCogs: itemCogsList,
  };
}

/**
 * Reverse order inventory deduction when an order is CANCELLED.
 * Restores ingredient quantities atomically and records ORDER_RESTORE audit log.
 * Idempotent: does nothing if inventory was not deducted.
 */
async function restoreInventoryForOrder({ tx, orderId, reason = 'Order cancelled', actorUserId = null }) {
  const db = tx || prisma;

  const order = await db.order.findUnique({
    where: { id: Number(orderId) },
    include: {
      items: {
        include: {
          menuItem: {
            include: {
              recipes: {
                include: { ingredient: true },
              },
            },
          },
        },
      },
    },
  });

  if (!order) {
    throw { statusCode: 404, message: 'Order not found.' };
  }

  // If inventory was not deducted, no restoration needed
  if (!order.inventoryDeducted) {
    return { restored: false, message: 'Order inventory was not deducted; no restoration needed.' };
  }

  // Calculate quantities to restore
  const restoreMap = new Map(); // ingredientId -> { total, name, unitCost }

  for (const item of order.items) {
    const qtyOrdered = Number(item.quantity) || 1;
    const recipes = item.menuItem?.recipes || [];

    for (const r of recipes) {
      const ing = r.ingredient;
      const recipeUnit = r.unit || ing.unit;
      const baseUnit = ing.unit;
      const reqRaw = Number(r.quantity) || 0;
      const yieldFactor = Number(r.yieldFactor) > 0 ? Number(r.yieldFactor) : 1;

      let baseQtyPerServing = reqRaw;
      try {
        baseQtyPerServing = convertQuantity(reqRaw, recipeUnit, baseUnit);
      } catch {
        baseQtyPerServing = reqRaw;
      }

      const effectiveBaseQty = yieldFactor > 0 ? baseQtyPerServing / yieldFactor : baseQtyPerServing;
      const totalToRestore = roundDecimals(effectiveBaseQty * qtyOrdered, 4);

      const prev = restoreMap.get(ing.id) || { total: 0, name: ing.name };
      restoreMap.set(ing.id, {
        total: roundDecimals(prev.total + totalToRestore, 4),
        name: ing.name,
      });
    }
  }

  // Restore inventory items
  for (const [ingredientId, { total: restoreQty }] of restoreMap.entries()) {
    const inventoryItem = await db.inventoryItem.findUnique({
      where: {
        branchId_ingredientId: {
          branchId: order.branchId,
          ingredientId,
        },
      },
    });

    if (!inventoryItem) continue;

    const before = Number(inventoryItem.quantity);
    const after = roundDecimals(before + restoreQty, 3);
    const unitCost = Number(inventoryItem.price) || 0;
    const totalCost = roundDecimals(restoreQty * unitCost, 2);

    await db.inventoryItem.update({
      where: { id: inventoryItem.id },
      data: { quantity: after },
    });

    await db.inventoryAuditLog.create({
      data: {
        inventoryItemId: inventoryItem.id,
        actionType: 'ORDER_RESTORE',
        quantityBefore: before,
        quantityAfter: after,
        quantityChanged: restoreQty,
        unitCost: unitCost > 0 ? unitCost : null,
        totalCost: totalCost > 0 ? totalCost : null,
        orderId: order.id,
        referenceNo: order.orderNumber,
        note: reason || `Stock restored for cancelled order ${order.orderNumber}`,
        actorUserId: actorUserId || null,
      },
    });
  }

  // Update order flag
  await db.order.update({
    where: { id: order.id },
    data: {
      inventoryDeducted: false,
    },
  });

  return {
    restored: true,
    orderNumber: order.orderNumber,
    itemsRestored: restoreMap.size,
  };
}

/**
 * Scheduled daily deduction for utilities / gas / recurring consumption.
 */
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
    const after = Math.max(0, roundDecimals(before - deduction, 3));

    if (before === after) {
      skipped++;
      continue;
    }

    const unitCost = Number(item.price) || 0;
    const totalCost = roundDecimals((before - after) * unitCost, 2);

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
          quantityChanged: roundDecimals(after - before, 3),
          unitCost: unitCost > 0 ? unitCost : null,
          totalCost: totalCost > 0 ? totalCost : null,
          note: 'Daily scheduled deduction',
        },
      }),
    ]);

    processed++;
  }

  return { processed, skipped, total: items.length };
}

/**
 * Seed initial inventory items for newly created branch.
 */
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

/**
 * Get detailed audit log records with cost traceability.
 */
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

/**
 * Transfer inventory stock from one branch to another atomically.
 */
async function transferInventory(payload, requestingUser) {
  const { sourceBranchId, destBranchId, ingredientId, quantity, unit, notes } = payload;

  const sBranchId = Number(sourceBranchId);
  const dBranchId = Number(destBranchId);
  const ingId = Number(ingredientId);
  const qty = Number(quantity);

  if (!sBranchId || !dBranchId || !ingId || Number.isNaN(qty) || qty <= 0) {
    throw { statusCode: 400, message: 'sourceBranchId, destBranchId, ingredientId, and positive quantity are required.' };
  }

  if (sBranchId === dBranchId) {
    throw { statusCode: 400, message: 'Source and destination branches cannot be the same.' };
  }

  // Validate authorization: only OWNER or MANAGER of source branch can initiate transfer
  if (requestingUser.role !== 'OWNER') {
    if (Number(requestingUser.branchId) !== sBranchId) {
      throw { statusCode: 403, message: 'Access denied. You can only transfer stock from your own branch.' };
    }
  }

  const [sourceBranch, destBranch, ingredient] = await Promise.all([
    prisma.branch.findUnique({ where: { id: sBranchId } }),
    prisma.branch.findUnique({ where: { id: dBranchId } }),
    prisma.ingredient.findUnique({ where: { id: ingId } }),
  ]);

  if (!sourceBranch || !sourceBranch.isActive) throw { statusCode: 404, message: 'Source branch not found or inactive.' };
  if (!destBranch || !destBranch.isActive) throw { statusCode: 404, message: 'Destination branch not found or inactive.' };
  if (!ingredient) throw { statusCode: 404, message: 'Ingredient not found.' };

  const transferUnit = unit || ingredient.unit;
  let baseQuantity = qty;
  try {
    baseQuantity = convertQuantity(qty, transferUnit, ingredient.unit);
  } catch (err) {
    throw { statusCode: 400, message: `Unit conversion failed: ${err.message}` };
  }

  const transferNo = `TRF-${Date.now()}-${Math.floor(100 + Math.random() * 900)}`;

  const result = await prisma.$transaction(async (tx) => {
    // 1. Lock and inspect source item
    const sourceItem = await tx.inventoryItem.findUnique({
      where: {
        branchId_ingredientId: { branchId: sBranchId, ingredientId: ingId },
      },
    });

    if (!sourceItem) {
      throw { statusCode: 400, message: `Ingredient "${ingredient.name}" does not exist in source branch #${sBranchId}.` };
    }

    const sourceCurrentQty = Number(sourceItem.quantity);
    if (sourceCurrentQty < baseQuantity) {
      throw {
        statusCode: 400,
        message: `Insufficient stock in ${sourceBranch.name}. Available: ${sourceCurrentQty} ${ingredient.unit}, Transfer requested: ${baseQuantity} ${ingredient.unit}.`,
      };
    }

    const sourceUnitCost =
      sourceItem.price != null && Number(sourceItem.price) > 0
        ? Number(sourceItem.price)
        : ingredient.defaultPrice != null
        ? Number(ingredient.defaultPrice)
        : 0;

    const transferTotalCost = roundDecimals(baseQuantity * sourceUnitCost, 2);
    const newSourceQty = roundDecimals(sourceCurrentQty - baseQuantity, 3);

    // 2. Deduct from source branch
    await tx.inventoryItem.update({
      where: { id: sourceItem.id },
      data: { quantity: newSourceQty },
    });

    await tx.inventoryAuditLog.create({
      data: {
        inventoryItemId: sourceItem.id,
        actionType: 'TRANSFER_OUT',
        quantityBefore: sourceCurrentQty,
        quantityAfter: newSourceQty,
        quantityChanged: -baseQuantity,
        unitCost: sourceUnitCost,
        totalCost: transferTotalCost,
        referenceNo: transferNo,
        note: `Transferred ${qty} ${transferUnit} to ${destBranch.name}. ${notes || ''}`.trim(),
        actorUserId: requestingUser.id,
      },
    });

    // 3. Upsert destination item
    const destItem = await tx.inventoryItem.findUnique({
      where: {
        branchId_ingredientId: { branchId: dBranchId, ingredientId: ingId },
      },
    });

    const destCurrentQty = destItem ? Number(destItem.quantity) : 0;
    const destCurrentCost = destItem && destItem.price != null && Number(destItem.price) > 0
      ? Number(destItem.price)
      : sourceUnitCost;

    // Compute weighted-average cost in destination
    const weighted = calculateWeightedAverageCost({
      existingQuantity: destCurrentQty,
      existingAvgCost: destCurrentCost,
      purchaseQuantity: baseQuantity,
      purchaseCost: transferTotalCost,
      yieldPercentage: 100,
    });

    const newDestQty = roundDecimals(destCurrentQty + baseQuantity, 3);
    const newDestCost = weighted.newAverageCost;

    let targetDestItem;
    if (destItem) {
      targetDestItem = await tx.inventoryItem.update({
        where: { id: destItem.id },
        data: {
          quantity: newDestQty,
          price: newDestCost,
        },
      });
    } else {
      targetDestItem = await tx.inventoryItem.create({
        data: {
          branchId: dBranchId,
          ingredientId: ingId,
          quantity: newDestQty,
          price: newDestCost,
          minThreshold: ingredient.defaultMinThreshold ?? 0,
        },
      });
    }

    await tx.inventoryAuditLog.create({
      data: {
        inventoryItemId: targetDestItem.id,
        actionType: 'TRANSFER_IN',
        quantityBefore: destCurrentQty,
        quantityAfter: newDestQty,
        quantityChanged: baseQuantity,
        unitCost: newDestCost,
        totalCost: transferTotalCost,
        referenceNo: transferNo,
        note: `Received transfer of ${qty} ${transferUnit} from ${sourceBranch.name}. ${notes || ''}`.trim(),
        actorUserId: requestingUser.id,
      },
    });

    // 4. Record transfer ledger
    const transfer = await tx.inventoryTransfer.create({
      data: {
        transferNo,
        sourceBranchId: sBranchId,
        destBranchId: dBranchId,
        ingredientId: ingId,
        quantity: baseQuantity,
        unit: ingredient.unit,
        unitCost: sourceUnitCost,
        totalCost: transferTotalCost,
        notes: notes || null,
        actorUserId: requestingUser.id,
        status: 'COMPLETED',
      },
      include: {
        sourceBranch: { select: { id: true, name: true } },
        destBranch: { select: { id: true, name: true } },
        ingredient: { select: { id: true, name: true, unit: true } },
        actor: { select: { id: true, name: true, email: true } },
      },
    });

    return transfer;
  });

  return result;
}

async function getTransfers({ branchId, status, limit = 50 }, requestingUser) {
  const scopedBranchId = validateBranchAccess(requestingUser, branchId);
  const where = {
    ...(status && { status }),
    ...(scopedBranchId
      ? {
          OR: [{ sourceBranchId: scopedBranchId }, { destBranchId: scopedBranchId }],
        }
      : {}),
  };

  return prisma.inventoryTransfer.findMany({
    where,
    include: {
      sourceBranch: { select: { id: true, name: true } },
      destBranch: { select: { id: true, name: true } },
      ingredient: { select: { id: true, name: true, unit: true } },
      actor: { select: { id: true, name: true, email: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: Math.min(Number(limit) || 50, 200),
  });
}

module.exports = {
  getInventory,
  createInventoryItem,
  updateInventoryItem,
  restockInventoryItem,
  adjustInventoryItem,
  updateIngredientDetails,
  deductInventoryForOrder,
  restoreInventoryForOrder,
  runDailyDeduction,
  seedBranchInventory,
  getAuditLogs,
  transferInventory,
  getTransfers,
};
