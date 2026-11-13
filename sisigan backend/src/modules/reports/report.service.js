// src/modules/reports/report.service.js

const prisma = require('../../config/db');
const { roundDecimals } = require('../../utils/inventoryCosting');
const { validateBranchAccess } = require('../../middleware/branchScope.middleware');

function getScopedBranchId(requestingUser, branchId) {
  return validateBranchAccess(requestingUser, branchId);
}

function getRange(period, from, to) {
  const now = new Date();

  if (period === 'weekly') {
    const start = new Date(now);
    start.setDate(now.getDate() - 6);
    start.setHours(0, 0, 0, 0);
    const end = new Date(now);
    end.setHours(23, 59, 59, 999);
    return { start, end, label: 'weekly' };
  }

  if (period === 'custom' && from && to) {
    const start = new Date(from);
    start.setHours(0, 0, 0, 0);
    const end = new Date(to);
    end.setHours(23, 59, 59, 999);
    return { start, end, label: 'custom' };
  }

  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);
  return { start, end, label: 'daily' };
}

async function getUsageReport({ branchId, period = 'daily', from, to }, requestingUser) {
  const scopedBranchId = getScopedBranchId(requestingUser, branchId);
  const range = getRange(period, from, to);

  const logs = await prisma.inventoryAuditLog.findMany({
    where: {
      createdAt: { gte: range.start, lte: range.end },
      inventoryItem: {
        ...(scopedBranchId && { branchId: scopedBranchId }),
      },
    },
    include: {
      inventoryItem: {
        include: {
          ingredient: true,
          branch: { select: { id: true, name: true } },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  const usageByItem = new Map();
  for (const log of logs) {
    const key = `${log.inventoryItemId}`;
    const prev = usageByItem.get(key) || {
      inventoryItemId: log.inventoryItemId,
      ingredientName: log.inventoryItem.ingredient.name,
      category: log.inventoryItem.ingredient.category,
      unit: log.inventoryItem.ingredient.unit,
      branch: log.inventoryItem.branch,
      orderDeduction: 0,
      orderRestore: 0,
      dailyDeduction: 0,
      restock: 0,
      wastage: 0,
      manualAdjustment: 0,
      netChange: 0,
      totalCostImpact: 0,
    };

    const change = Number(log.quantityChanged);
    const costImpact = Number(log.totalCost || 0);

    prev.netChange += change;
    prev.totalCostImpact += costImpact;

    if (log.actionType === 'ORDER_DEDUCTION') prev.orderDeduction += change;
    if (log.actionType === 'ORDER_RESTORE') prev.orderRestore += change;
    if (log.actionType === 'DAILY_DEDUCTION') prev.dailyDeduction += change;
    if (log.actionType === 'RESTOCK') prev.restock += change;
    if (log.actionType === 'WASTAGE') prev.wastage += change;
    if (log.actionType === 'MANUAL_EDIT') prev.manualAdjustment += change;

    usageByItem.set(key, prev);
  }

  const allItems = await prisma.inventoryItem.findMany({
    where: {
      ...(scopedBranchId && { branchId: scopedBranchId }),
      isActive: true,
    },
    include: {
      ingredient: true,
      branch: { select: { id: true, name: true } },
    },
  });

  let totalValuation = 0;
  const lowStockAlerts = [];

  for (const item of allItems) {
    const qty = Number(item.quantity) || 0;
    const min = Number(item.minThreshold) || 0;
    const price =
      item.price != null && Number(item.price) > 0
        ? Number(item.price)
        : item.ingredient?.defaultPrice != null
        ? Number(item.ingredient.defaultPrice)
        : 0;

    totalValuation += qty * price;

    if (qty <= min) {
      lowStockAlerts.push({
        id: item.id,
        ingredientName: item.ingredient.name,
        category: item.ingredient.category,
        branch: item.branch,
        quantity: roundDecimals(qty, 3),
        minThreshold: roundDecimals(min, 3),
        unit: item.ingredient.unit,
        unitCost: roundDecimals(price, 4),
        inventoryValue: roundDecimals(qty * price, 2),
      });
    }
  }

  return {
    period: { label: range.label, start: range.start, end: range.end },
    summary: {
      totalLogs: logs.length,
      orderDeductionEvents: logs.filter((l) => l.actionType === 'ORDER_DEDUCTION').length,
      orderRestoreEvents: logs.filter((l) => l.actionType === 'ORDER_RESTORE').length,
      dailyDeductionEvents: logs.filter((l) => l.actionType === 'DAILY_DEDUCTION').length,
      restockEvents: logs.filter((l) => l.actionType === 'RESTOCK').length,
      wastageEvents: logs.filter((l) => l.actionType === 'WASTAGE').length,
      manualEditEvents: logs.filter((l) => l.actionType === 'MANUAL_EDIT').length,
      totalInventoryValuation: roundDecimals(totalValuation, 2),
      lowStockItemCount: lowStockAlerts.length,
    },
    usageByItem: [...usageByItem.values()].map((u) => ({
      ...u,
      netChange: roundDecimals(u.netChange, 3),
      orderDeduction: roundDecimals(u.orderDeduction, 3),
      orderRestore: roundDecimals(u.orderRestore, 3),
      dailyDeduction: roundDecimals(u.dailyDeduction, 3),
      restock: roundDecimals(u.restock, 3),
      wastage: roundDecimals(u.wastage, 3),
      manualAdjustment: roundDecimals(u.manualAdjustment, 3),
      totalCostImpact: roundDecimals(u.totalCostImpact, 2),
    })),
    lowStockAlerts,
  };
}

module.exports = { getUsageReport };
