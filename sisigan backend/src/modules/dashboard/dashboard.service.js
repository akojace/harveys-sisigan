// src/modules/dashboard/dashboard.service.js
// Analytics and auth activity logs

const prisma = require('../../config/db');

function getDateRange(period, from, to) {
  const now = new Date();

  if (period === 'today') {
    const start = new Date(now); start.setHours(0, 0, 0, 0);
    const end = new Date(now); end.setHours(23, 59, 59, 999);
    return { start, end };
  }

  if (period === 'week') {
    const start = new Date(now);
    start.setDate(now.getDate() - now.getDay());
    start.setHours(0, 0, 0, 0);
    const end = new Date(now); end.setHours(23, 59, 59, 999);
    return { start, end };
  }

  if (period === 'month') {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now); end.setHours(23, 59, 59, 999);
    return { start, end };
  }

  if (period === 'custom' && from && to) {
    const start = new Date(from); start.setHours(0, 0, 0, 0);
    const end = new Date(to); end.setHours(23, 59, 59, 999);
    return { start, end };
  }

  const start = new Date(now); start.setHours(0, 0, 0, 0);
  const end = new Date(now); end.setHours(23, 59, 59, 999);
  return { start, end };
}

async function getDashboard({ period = 'today', from, to, branchId }, requestingUser) {
  const { start, end } = getDateRange(period, from, to);

  const scopedBranchId =
    requestingUser.role === 'OWNER'
      ? (branchId ? Number(branchId) : null)
      : requestingUser.branchId;

  const scopedCashierId = requestingUser.role === 'CASHIER' ? requestingUser.id : null;

  const orderWhere = {
    status: 'COMPLETED',
    createdAt: { gte: start, lte: end },
    ...(scopedBranchId && { branchId: scopedBranchId }),
    ...(scopedCashierId && { cashierId: scopedCashierId }),
  };

  const [completedOrders, allOrders] = await Promise.all([
    prisma.order.findMany({
      where: orderWhere,
      include: {
        payment: true,
        items: { include: { menuItem: { include: { category: true } } } },
        branch: { select: { id: true, name: true } },
      },
    }),
    prisma.order.count({
      where: {
        createdAt: { gte: start, lte: end },
        ...(scopedBranchId && { branchId: scopedBranchId }),
        ...(scopedCashierId && { cashierId: scopedCashierId }),
      },
    }),
  ]);

  const totalSales = completedOrders.reduce((s, o) => s + Number(o.totalAmount), 0);
  const totalOrders = completedOrders.length;
  const avgOrder = totalOrders > 0 ? totalSales / totalOrders : 0;

  const cancelledCount = await prisma.order.count({
    where: {
      status: 'CANCELLED',
      createdAt: { gte: start, lte: end },
      ...(scopedBranchId && { branchId: scopedBranchId }),
      ...(scopedCashierId && { cashierId: scopedCashierId }),
    },
  });

  const itemSalesMap = {};
  for (const order of completedOrders) {
    for (const item of order.items) {
      const id = item.menuItemId;
      const name = item.menuItem?.name || 'Unknown';
      if (!itemSalesMap[id]) itemSalesMap[id] = { id, name, qty: 0, revenue: 0 };
      itemSalesMap[id].qty += item.quantity;
      itemSalesMap[id].revenue += Number(item.subtotal);
    }
  }

  // Seed every category at 0 first, so categories with no completed sales
  // in this period still show up in the chart instead of being silently
  // dropped. Completed orders below only ever add to these.
  const allCategories = await prisma.category.findMany({
    select: { name: true },
  });

  const allSellers = Object.values(itemSalesMap).sort((a, b) => b.qty - a.qty)
  const bestSellers = allSellers.slice(0, 10);
  const categoryMap = {};
  for (const c of allCategories) {
    categoryMap[c.name] = { name: c.name, value: 0, qty: 0 };
  }

  for (const order of completedOrders) {
    for (const item of order.items) {
      const catName = item.menuItem?.category?.name || 'Uncategorized';
      if (!categoryMap[catName]) categoryMap[catName] = { name: catName, value: 0, qty: 0 };
      categoryMap[catName].value += Number(item.subtotal);
      categoryMap[catName].qty += item.quantity;
    }
  }
  // Sort by value desc, alphabetical tiebreak (same convention as salesByBranch)
  const salesByCategory = Object.values(categoryMap).sort((a, b) => b.value - a.value || a.name.localeCompare(b.name));

  const trendMap = {};
  for (const order of completedOrders) {
    const day = order.createdAt.toISOString().split('T')[0];
    if (!trendMap[day]) trendMap[day] = { date: day, sales: 0, orders: 0 };
    trendMap[day].sales += Number(order.totalAmount);
    trendMap[day].orders += 1;
  }
  const salesTrend = Object.values(trendMap).sort((a, b) => a.date.localeCompare(b.date));

  let salesByBranch = [];
  if (requestingUser.role === 'OWNER' && !scopedBranchId) {
    // Seed every active branch at 0 first, so branches with no completed
    // orders in this period still show up in the chart instead of being
    // silently dropped. Completed orders below only ever add to these.
    const allBranches = await prisma.branch.findMany({
      where: { isActive: true },
      select: { id: true, name: true },
    });

    const branchMap = {};
    for (const b of allBranches) {
      branchMap[b.id] = { id: b.id, name: b.name, sales: 0, orders: 0 };
    }

    for (const order of completedOrders) {
      const bId = order.branch?.id;
      const bName = order.branch?.name || 'Unknown';
      if (!branchMap[bId]) branchMap[bId] = { id: bId, name: bName, sales: 0, orders: 0 };
      branchMap[bId].sales += Number(order.totalAmount);
      branchMap[bId].orders += 1;
    }

    // Sort by sales desc, but keep it stable-ish for ties (alphabetical by name)
    salesByBranch = Object.values(branchMap).sort((a, b) => b.sales - a.sales || a.name.localeCompare(b.name));
  }

  // Seed every payment method at 0 first, so methods with no completed
  // payments in this period still show up in the chart instead of being
  // silently dropped. Completed orders below only ever add to these.
  //
  // NOTE: PaymentMethod is a Prisma enum, not a table, so it can't be
  // queried with findMany. Confirm this list matches the `enum PaymentMethod`
  // block in your schema.prisma and adjust if needed.
  const ALL_PAYMENT_METHODS = ['CASH', 'GCASH', 'CARD'];

  const paymentMap = {};
  for (const m of ALL_PAYMENT_METHODS) {
    paymentMap[m] = { method: m, count: 0, total: 0 };
  }

  for (const order of completedOrders) {
    if (!order.payment) continue;
    const m = order.payment.method;
    if (!paymentMap[m]) paymentMap[m] = { method: m, count: 0, total: 0 };
    paymentMap[m].count += 1;
    paymentMap[m].total += Number(order.payment.amountPaid);
  }
  // Sort by total desc, alphabetical tiebreak (same convention as salesByBranch/salesByCategory)
  const paymentBreakdown = Object.values(paymentMap).sort((a, b) => b.total - a.total || a.method.localeCompare(b.method));

  return {
    period: { label: period, start, end },
    summary: {
      totalSales,
      totalOrders,
      avgOrderValue: avgOrder,
      allOrdersCount: allOrders,
      cancelledCount,
    },
    bestSellers,
    allSellers,
    salesByCategory,
    salesTrend,
    salesByBranch,
    paymentBreakdown,
  };
}

async function getBranches() {
  return prisma.branch.findMany({
    where: { isActive: true },
    select: { id: true, name: true, city: true },
    orderBy: { name: 'asc' },
  });
}

async function getAuthLogs({ period = 'today', from, to, branchId, limit = 30 }, requestingUser) {
  const { start, end } = getDateRange(period, from, to);

  const scopedBranchId =
    requestingUser.role === 'OWNER'
      ? (branchId ? Number(branchId) : null)
      : requestingUser.branchId;

  const safeLimit = Math.max(1, Math.min(Number(limit) || 30, 200));

  return prisma.authLog.findMany({
    where: {
      createdAt: { gte: start, lte: end },
      ...(scopedBranchId && { branchId: scopedBranchId }),
    },
    select: {
      id: true,
      action: true,
      role: true,
      ipAddress: true,
      userAgent: true,
      createdAt: true,
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
        },
      },
      branch: {
        select: {
          id: true,
          name: true,
          city: true,
        },
      },
    },
    orderBy: { createdAt: 'desc' },
    take: safeLimit,
  });
}

/**
 * Given forecasted quantities for a set of menu items (from the Python
 * analytics service's /api/trending-items-forecast), work out how much
 * of each ingredient that demand will consume, and flag anything that
 * won't have enough stock on hand.
 *
 * @param {Object} params
 * @param {Array<{itemName: string, forecastQty: number}>} params.items
 * @param {number} [params.branchId] - OWNER only; scopes stock to one branch.
 *   If omitted, stock is summed across all branches (useful for an
 *   org-wide view). MANAGER/CASHIER are always scoped to their own branch.
 */
async function getIngredientRecommendations({ items, branchId }, requestingUser) {
  if (!Array.isArray(items) || items.length === 0) {
    return { recommendations: [] };
  }

  const scopedBranchId =
    requestingUser.role === 'OWNER'
      ? (branchId ? Number(branchId) : null)
      : requestingUser.branchId;

  // 1. Resolve the forecasted item names to their recipes
  const menuItems = await prisma.menuItem.findMany({
    where: { name: { in: items.map((i) => i.itemName) } },
    include: { recipes: { include: { ingredient: true } } },
  });

  const forecastByName = Object.fromEntries(
    items.map((i) => [i.itemName, Number(i.forecastQty) || 0])
  );

  // 2. Sum required quantity per ingredient across all forecasted items
  //    e.g. if both Sisilog and CM1 use egg, their egg requirements combine.
  const requiredMap = {}; // ingredientId -> { ingredient, requiredQty }
  for (const mi of menuItems) {
    const forecastQty = forecastByName[mi.name] || 0;
    if (forecastQty <= 0) continue;

    for (const recipe of mi.recipes) {
      const key = recipe.ingredientId;
      if (!requiredMap[key]) {
        requiredMap[key] = { ingredient: recipe.ingredient, requiredQty: 0 };
      }
      requiredMap[key].requiredQty += Number(recipe.quantity) * forecastQty;
    }
  }

  const ingredientIds = Object.keys(requiredMap).map(Number);
  if (ingredientIds.length === 0) {
    return {
      recommendations: [],
      note: 'No recipes found for the forecasted items — link ingredients under Menu > Recipes first.',
    };
  }

  // 3. Pull current stock for just those ingredients
  const stockItems = await prisma.inventoryItem.findMany({
    where: {
      ingredientId: { in: ingredientIds },
      isActive: true,
      ...(scopedBranchId && { branchId: scopedBranchId }),
    },
  });

  const stockByIngredient = {};
  for (const s of stockItems) {
    if (!stockByIngredient[s.ingredientId]) {
      stockByIngredient[s.ingredientId] = { quantity: 0, minThreshold: 0 };
    }
    // Summed across branches when no single branch is scoped
    stockByIngredient[s.ingredientId].quantity += Number(s.quantity);
    // Conservative: keep the highest minThreshold seen across branches
    stockByIngredient[s.ingredientId].minThreshold = Math.max(
      stockByIngredient[s.ingredientId].minThreshold,
      Number(s.minThreshold)
    );
  }

  // 4. Build the recommendation list
  const recommendations = Object.entries(requiredMap).map(([ingId, { ingredient, requiredQty }]) => {
    const stock = stockByIngredient[ingId] || { quantity: 0, minThreshold: 0 };

    // Stock "available" for forecasted demand excludes the safety buffer
    // (minThreshold) you already keep in reserve.
    const availableAboveThreshold = Math.max(0, stock.quantity - stock.minThreshold);
    const shortfall = Math.max(0, requiredQty - availableAboveThreshold);

    let status = 'OK';
    if (shortfall > 0 && stock.quantity <= stock.minThreshold) status = 'CRITICAL';
    else if (shortfall > 0) status = 'LOW';

    return {
      ingredientId: Number(ingId),
      name: ingredient.name,
      unit: ingredient.unit,
      currentStock: Number(stock.quantity.toFixed(3)),
      minThreshold: Number(stock.minThreshold.toFixed(3)),
      requiredForForecast: Number(requiredQty.toFixed(3)),
      suggestedRestockQty: Number(shortfall.toFixed(3)),
      status, // 'OK' | 'LOW' | 'CRITICAL'
    };
  });

  // Worst first: CRITICAL, then LOW, then OK; biggest shortfall first within each
  const statusRank = { CRITICAL: 0, LOW: 1, OK: 2 };
  recommendations.sort(
    (a, b) => statusRank[a.status] - statusRank[b.status] || b.suggestedRestockQty - a.suggestedRestockQty
  );

  return { recommendations };
}

module.exports = { getDashboard, getBranches, getAuthLogs, getIngredientRecommendations };