// src/modules/reports/report.service.js

const prisma = require('../../config/db');

function getScopedBranchId(requestingUser, branchId) {
  if (requestingUser.role === 'OWNER') {
    return branchId ? Number(branchId) : null;
  }
  return requestingUser.branchId;
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
      dailyDeduction: 0,
      manualAdjustment: 0,
      netChange: 0,
    };

    const change = Number(log.quantityChanged);
    prev.netChange += change;
    if (log.actionType === 'ORDER_DEDUCTION') prev.orderDeduction += change;
    if (log.actionType === 'DAILY_DEDUCTION') prev.dailyDeduction += change;
    if (log.actionType === 'MANUAL_EDIT') prev.manualAdjustment += change;

    usageByItem.set(key, prev);
  }

  const lowStockItems = await prisma.inventoryItem.findMany({
    where: {
      ...(scopedBranchId && { branchId: scopedBranchId }),
      isActive: true,
    },
    include: {
      ingredient: true,
      branch: { select: { id: true, name: true } },
    },
  });

  return {
    period: { label: range.label, start: range.start, end: range.end },
    summary: {
      totalLogs: logs.length,
      orderDeductionEvents: logs.filter((l) => l.actionType === 'ORDER_DEDUCTION').length,
      dailyDeductionEvents: logs.filter((l) => l.actionType === 'DAILY_DEDUCTION').length,
      manualEditEvents: logs.filter((l) => l.actionType === 'MANUAL_EDIT').length,
    },
    usageByItem: [...usageByItem.values()],
    lowStockAlerts: lowStockItems
      .filter((item) => Number(item.quantity) <= Number(item.minThreshold))
      .map((item) => ({
        id: item.id,
        ingredientName: item.ingredient.name,
        category: item.ingredient.category,
        branch: item.branch,
        quantity: item.quantity,
        minThreshold: item.minThreshold,
        unit: item.ingredient.unit,
      })),
  };
}

module.exports = { getUsageReport };
