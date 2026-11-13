// src/modules/dashboard/dashboard.service.js
// Production-ready Analytics, Dashboard KPIs, Inventory Valuation, and Profit Reporting

const prisma = require('../../config/db');
const {
  convertQuantity,
  calculateProductRecipeCost,
  roundDecimals,
} = require('../../utils/inventoryCosting');
const { validateBranchAccess } = require('../../middleware/branchScope.middleware');

function photoToDataUri(photoBuffer) {
  if (!photoBuffer) return null;

  let buf;
  if (photoBuffer?.type === 'Buffer' && Array.isArray(photoBuffer.data)) {
    buf = Buffer.from(photoBuffer.data);
  } else if (Buffer.isBuffer(photoBuffer)) {
    buf = photoBuffer;
  } else if (typeof photoBuffer === 'string') {
    return photoBuffer.startsWith('data:') ? photoBuffer : `data:image/jpeg;base64,${photoBuffer}`;
  } else {
    return null;
  }

  const hex = buf.slice(0, 4).toString('hex');
  const mime = hex.startsWith('ffd8ff')
    ? 'image/jpeg'
    : hex.startsWith('89504e47')
      ? 'image/png'
      : hex.startsWith('47494638')
        ? 'image/gif'
        : hex.startsWith('52494646')
          ? 'image/webp'
          : 'image/jpeg';

  return `data:${mime};base64,${buf.toString('base64')}`;
}

function rankBestSellers(itemsMap, limit) {
  const allItems = Object.values(itemsMap).map((i) => ({
    ...i,
    revenue: roundDecimals(i.revenue, 2),
    cogs: roundDecimals(i.cogs, 2),
    profit: roundDecimals(i.profit, 2),
  }));

  // Primary sort: Units sold (qty DESC)
  // Secondary sort: Revenue (revenue DESC)
  // Tie-breaker: Name (alphabetical ASC)
  allItems.sort((a, b) => b.qty - a.qty || b.revenue - a.revenue || a.name.localeCompare(b.name));

  // Rank assignment with tie handling:
  // If two items have identical units sold AND revenue, they share the same rank.
  const ranked = allItems.map((item, idx) => {
    if (idx > 0) {
      const prev = allItems[idx - 1];
      if (item.qty === prev.qty && item.revenue === prev.revenue) {
        return { ...item, rank: prev.rank };
      }
      return { ...item, rank: idx + 1 };
    }
    return { ...item, rank: 1 };
  });

  return limit ? ranked.slice(0, limit) : ranked;
}

function getDateRange(period, from, to) {
  const now = new Date();

  if (period === 'today') {
    const start = new Date(now); start.setHours(0, 0, 0, 0);
    const end = new Date(now); end.setHours(23, 59, 59, 999);
    return { start, end };
  }

  if (period === 'yesterday') {
    const start = new Date(now); start.setDate(now.getDate() - 1); start.setHours(0, 0, 0, 0);
    const end = new Date(now); end.setDate(now.getDate() - 1); end.setHours(23, 59, 59, 999);
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

  if (period === 'year') {
    const start = new Date(now.getFullYear(), 0, 1);
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
  const scopedBranchId = validateBranchAccess(requestingUser, branchId);
  const scopedCashierId = requestingUser.role === 'CASHIER' ? requestingUser.id : null;

  const orderWhere = {
    status: 'COMPLETED',
    createdAt: { gte: start, lte: end },
    ...(scopedBranchId && { branchId: scopedBranchId }),
    ...(scopedCashierId && { cashierId: scopedCashierId }),
  };

  const [completedOrders, allOrdersCount, cancelledCount, inventoryRows, expensesAggregate] = await Promise.all([
    prisma.order.findMany({
      where: orderWhere,
      include: {
        payments: true,
        items: {
          include: {
            menuItem: {
              select: {
                id: true,
                name: true,
                photo: true,
                category: { select: { id: true, name: true } },
                recipes: {
                  include: {
                    ingredient: {
                      select: { id: true, name: true, unit: true, defaultPrice: true },
                    },
                  },
                },
              },
            },
          },
        },
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
    prisma.order.count({
      where: {
        status: 'CANCELLED',
        createdAt: { gte: start, lte: end },
        ...(scopedBranchId && { branchId: scopedBranchId }),
        ...(scopedCashierId && { cashierId: scopedCashierId }),
      },
    }),
    prisma.inventoryItem.findMany({
      where: {
        ...(scopedBranchId && { branchId: scopedBranchId }),
        isActive: true,
      },
      include: {
        ingredient: { select: { defaultPrice: true } },
      },
    }),
    prisma.expense.aggregate({
      where: {
        expenseDate: { gte: start, lte: end },
        ...(scopedBranchId && { branchId: scopedBranchId }),
      },
      _sum: { amount: true },
    }),
  ]);

  // Financial aggregation across completed orders
  let grossSales = 0;
  let totalDiscounts = 0;
  let totalCogs = 0;

  for (const order of completedOrders) {
    grossSales += Number(order.totalAmount);

    // Sum discounts from payments or order.discountTotal
    let orderDiscount = Number(order.discountTotal || 0);
    if (!orderDiscount && order.payments && order.payments.length > 0) {
      orderDiscount = order.payments.reduce((sum, p) => sum + Number(p.discountAmount || 0), 0);
    }
    totalDiscounts += orderDiscount;

    // Sum COGS: prefer snapshotted order.cogs; fallback to sum of item COGS
    let orderCogs = Number(order.cogs || 0);
    if (!orderCogs && order.items && order.items.length > 0) {
      orderCogs = order.items.reduce((sum, item) => {
        const itemCogs = Number(item.cogs || 0);
        if (itemCogs > 0) return sum + itemCogs;
        // Fallback: calculate using recipe if historical snapshot is missing
        if (item.menuItem?.recipes?.length) {
          const calc = calculateProductRecipeCost(item.menuItem.recipes, order.branchId);
          return sum + calc.totalCost * item.quantity;
        }
        return sum;
      }, 0);
    }
    totalCogs += orderCogs;
  }

  grossSales = roundDecimals(grossSales, 2);
  totalDiscounts = roundDecimals(totalDiscounts, 2);
  const netSales = roundDecimals(Math.max(0, grossSales - totalDiscounts), 2);
  totalCogs = roundDecimals(totalCogs, 2);
  const grossProfit = roundDecimals(netSales - totalCogs, 2);
  const grossProfitMargin = netSales > 0 ? roundDecimals((grossProfit / netSales) * 100, 2) : 0;

  const operatingExpenses = roundDecimals(Number(expensesAggregate._sum.amount || 0), 2);
  const netProfit = roundDecimals(grossProfit - operatingExpenses, 2);
  const netProfitMargin = netSales > 0 ? roundDecimals((netProfit / netSales) * 100, 2) : 0;

  const totalOrders = completedOrders.length;
  const avgOrderValue = totalOrders > 0 ? roundDecimals(grossSales / totalOrders, 2) : 0;

  // Inventory valuation & stock alerts
  let totalInventoryValue = 0;
  let lowStockCount = 0;
  let outOfStockCount = 0;

  for (const row of inventoryRows) {
    const qty = Number(row.quantity) || 0;
    const min = Number(row.minThreshold) || 0;
    const price =
      row.price != null && Number(row.price) > 0
        ? Number(row.price)
        : row.ingredient?.defaultPrice != null
        ? Number(row.ingredient.defaultPrice)
        : 0;

    totalInventoryValue += qty * price;
    if (qty <= 0) outOfStockCount++;
    else if (qty <= min) lowStockCount++;
  }
  totalInventoryValue = roundDecimals(totalInventoryValue, 2);

  // Item sales breakdown and best sellers
  const itemSalesMap = {};
  for (const order of completedOrders) {
    for (const item of order.items) {
      const id = item.menuItemId;
      const name = item.menuItem?.name || 'Unknown';
      if (!itemSalesMap[id]) {
        itemSalesMap[id] = {
          id,
          name,
          photo: photoToDataUri(item.menuItem?.photo),
          qty: 0,
          revenue: 0,
          cogs: 0,
          profit: 0,
        };
      }
      itemSalesMap[id].qty += item.quantity;
      itemSalesMap[id].revenue += Number(item.subtotal);

      let lineCogs = Number(item.cogs || 0);
      if (!lineCogs && item.menuItem?.recipes?.length) {
        const calc = calculateProductRecipeCost(item.menuItem.recipes, order.branchId);
        lineCogs = calc.totalCost * item.quantity;
      }
      itemSalesMap[id].cogs += lineCogs;
      itemSalesMap[id].profit += (Number(item.subtotal) - lineCogs);
    }
  }

  const allSellers = rankBestSellers(itemSalesMap);
  const bestSellers = allSellers.slice(0, 10);

  // Sales by category
  const allCategories = await prisma.category.findMany({ select: { name: true } });
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
  const salesByCategory = Object.values(categoryMap)
    .map((c) => ({ ...c, value: roundDecimals(c.value, 2) }))
    .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name));

  // Sales trend by date
  const trendMap = {};
  for (const order of completedOrders) {
    const day = order.createdAt.toISOString().split('T')[0];
    if (!trendMap[day]) trendMap[day] = { date: day, sales: 0, orders: 0, cogs: 0, grossProfit: 0 };
    trendMap[day].sales += Number(order.totalAmount);
    trendMap[day].orders += 1;
    trendMap[day].cogs += Number(order.cogs || 0);
    trendMap[day].grossProfit += (Number(order.totalAmount) - Number(order.cogs || 0));
  }
  const salesTrend = Object.values(trendMap)
    .map((t) => ({
      ...t,
      sales: roundDecimals(t.sales, 2),
      cogs: roundDecimals(t.cogs, 2),
      grossProfit: roundDecimals(t.grossProfit, 2),
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  // Sales by branch (for Owner)
  let salesByBranch = [];
  if (requestingUser.role === 'OWNER' && !scopedBranchId) {
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

    salesByBranch = Object.values(branchMap)
      .map((b) => ({ ...b, sales: roundDecimals(b.sales, 2) }))
      .sort((a, b) => b.sales - a.sales || a.name.localeCompare(b.name));
  }

  // Payment method breakdown
  const ALL_PAYMENT_METHODS = ['CASH', 'GCASH', 'MAYA', 'CARD'];
  const paymentMap = {};
  for (const m of ALL_PAYMENT_METHODS) {
    paymentMap[m] = { method: m, count: 0, total: 0 };
  }

  for (const order of completedOrders) {
    if (!order.payments || order.payments.length === 0) continue;
    for (const p of order.payments) {
      const m = p.method;
      if (!paymentMap[m]) paymentMap[m] = { method: m, count: 0, total: 0 };
      paymentMap[m].count += 1;
      paymentMap[m].total += Number(p.amountPaid);
    }
  }
  const paymentBreakdown = Object.values(paymentMap)
    .map((p) => ({ ...p, total: roundDecimals(p.total, 2) }))
    .sort((a, b) => b.total - a.total || a.method.localeCompare(b.method));

  return {
    period: { label: period, start, end },
    summary: {
      grossSales,
      totalSales: grossSales, // backward compatibility
      discounts: totalDiscounts,
      netSales,
      totalCogs,
      cogs: totalCogs, // alias
      grossProfit,
      grossProfitMargin,
      operatingExpenses,
      netProfit,
      netProfitMargin,
      totalOrders,
      avgOrderValue,
      allOrdersCount,
      cancelledCount,
      inventoryValue: totalInventoryValue,
      lowStockCount,
      outOfStockCount,
    },
    bestSellers,
    allSellers,
    bestSellersComparison: await getBestSellers(
      { period, from, to, branchId, limit: 10 },
      requestingUser
    ),
    salesByCategory,
    salesTrend,
    salesByBranch,
    paymentBreakdown,
  };
}

/**
 * Best-Selling Products calculation and multi-branch comparison.
 * - Primary metric: Units sold (SUM(quantity) for COMPLETED sales).
 * - Secondary metric: Sales revenue (SUM(subtotal)).
 * - Admin (OWNER): Side-by-side comparison across all active branches or filtered to a single branch.
 * - Cashier & Manager: Strictly locked to user.branchId; cross-branch queries rejected with 403.
 */
async function getBestSellers({ period = 'today', from, to, branchId, limit = 5 }, requestingUser) {
  const scopedBranchId = validateBranchAccess(requestingUser, branchId);
  const { start, end } = getDateRange(period, from, to);
  const parsedLimit = Math.max(1, Math.min(100, parseInt(limit, 10) || 5));

  // Eligible sales criteria:
  // 1. Order status must be COMPLETED (exclude PENDING, CANCELLED, voided, unpaid, failed)
  // 2. Order createdAt within the target date range [start, end]
  // 3. Filtered strictly to scopedBranchId for Cashier/Manager, or if Owner specified a branch
  const orderWhere = {
    status: 'COMPLETED',
    createdAt: { gte: start, lte: end },
    ...(scopedBranchId && { branchId: scopedBranchId }),
  };

  const orders = await prisma.order.findMany({
    where: orderWhere,
    select: {
      id: true,
      branchId: true,
      branch: { select: { id: true, name: true, city: true } },
      items: {
        select: {
          quantity: true,
          subtotal: true,
          cogs: true,
          menuItemId: true,
          menuItem: {
            select: {
              id: true,
              name: true,
              price: true,
              photo: true,
              category: { select: { id: true, name: true } },
            },
          },
        },
      },
    },
  });

  if (scopedBranchId) {
    // Single branch calculation (Cashier, Manager, or Admin scoped to 1 branch)
    const branchInfo =
      orders[0]?.branch ||
      (await prisma.branch.findUnique({
        where: { id: scopedBranchId },
        select: { id: true, name: true, city: true },
      }));

    const itemsMap = {};
    let totalUnitsSold = 0;
    let totalRevenue = 0;

    for (const order of orders) {
      for (const item of order.items) {
        const id = item.menuItemId;
        const name = item.menuItem?.name || `Item #${id}`;
        if (!itemsMap[id]) {
          itemsMap[id] = {
            id,
            name,
            category: item.menuItem?.category?.name || 'Uncategorized',
            price: Number(item.menuItem?.price || 0),
            photo: photoToDataUri(item.menuItem?.photo),
            qty: 0,
            revenue: 0,
            cogs: 0,
            profit: 0,
          };
        }

        const q = Number(item.quantity) || 0;
        const rev = Number(item.subtotal) || 0;
        const cg = Number(item.cogs) || 0;

        itemsMap[id].qty += q;
        itemsMap[id].revenue += rev;
        itemsMap[id].cogs += cg;
        itemsMap[id].profit += (rev - cg);

        totalUnitsSold += q;
        totalRevenue += rev;
      }
    }

    const rankedItems = rankBestSellers(itemsMap, parsedLimit);

    return {
      period: { label: period, start, end },
      limit: parsedLimit,
      isComparison: false,
      branch: {
        branchId: branchInfo ? branchInfo.id : scopedBranchId,
        branchName: branchInfo ? branchInfo.name : `Branch #${scopedBranchId}`,
        city: branchInfo?.city || null,
        totalUnitsSold,
        totalRevenue: roundDecimals(totalRevenue, 2),
        items: rankedItems,
      },
    };
  }

  // Admin / Owner viewing All Branches: Side-by-side multi-branch comparison
  const activeBranches = await prisma.branch.findMany({
    where: { isActive: true },
    select: { id: true, name: true, city: true },
    orderBy: { id: 'asc' },
  });

  const ordersByBranch = new Map();
  for (const b of activeBranches) {
    ordersByBranch.set(b.id, []);
  }

  for (const order of orders) {
    if (ordersByBranch.has(order.branchId)) {
      ordersByBranch.get(order.branchId).push(order);
    }
  }

  const branchComparisons = activeBranches.map((b) => {
    const branchOrders = ordersByBranch.get(b.id) || [];
    const itemsMap = {};
    let totalUnitsSold = 0;
    let totalRevenue = 0;

    for (const order of branchOrders) {
      for (const item of order.items) {
        const id = item.menuItemId;
        const name = item.menuItem?.name || `Item #${id}`;
        if (!itemsMap[id]) {
          itemsMap[id] = {
            id,
            name,
            category: item.menuItem?.category?.name || 'Uncategorized',
            price: Number(item.menuItem?.price || 0),
            photo: photoToDataUri(item.menuItem?.photo),
            qty: 0,
            revenue: 0,
            cogs: 0,
            profit: 0,
          };
        }

        const q = Number(item.quantity) || 0;
        const rev = Number(item.subtotal) || 0;
        const cg = Number(item.cogs) || 0;

        itemsMap[id].qty += q;
        itemsMap[id].revenue += rev;
        itemsMap[id].cogs += cg;
        itemsMap[id].profit += (rev - cg);

        totalUnitsSold += q;
        totalRevenue += rev;
      }
    }

    const rankedItems = rankBestSellers(itemsMap, parsedLimit);

    return {
      branchId: b.id,
      branchName: b.name,
      city: b.city,
      totalUnitsSold,
      totalRevenue: roundDecimals(totalRevenue, 2),
      items: rankedItems,
    };
  });

  return {
    period: { label: period, start, end },
    limit: parsedLimit,
    isComparison: true,
    branches: branchComparisons,
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
  const scopedBranchId = validateBranchAccess(requestingUser, branchId);
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

async function getIngredientRecommendations({ items, branchId }, requestingUser) {
  if (!Array.isArray(items) || items.length === 0) {
    return { recommendations: [] };
  }

  const scopedBranchId = validateBranchAccess(requestingUser, branchId);

  const menuItems = await prisma.menuItem.findMany({
    where: { name: { in: items.map((i) => i.itemName) } },
    include: {
      recipes: {
        include: {
          ingredient: {
            select: { id: true, name: true, unit: true, defaultPrice: true },
          },
        },
      },
    },
  });

  const forecastByName = Object.fromEntries(
    items.map((i) => [i.itemName, Number(i.forecastQty) || 0])
  );

  const requiredMap = {};
  for (const mi of menuItems) {
    const forecastQty = forecastByName[mi.name] || 0;
    if (forecastQty <= 0) continue;

    for (const recipe of mi.recipes) {
      const ing = recipe.ingredient;
      const key = recipe.ingredientId;
      if (!requiredMap[key]) {
        requiredMap[key] = { ingredient: ing, requiredQty: 0 };
      }

      let baseReq = Number(recipe.quantity);
      try {
        baseReq = convertQuantity(baseReq, recipe.unit || ing.unit, ing.unit);
      } catch {
        // ignore
      }
      const yf = Number(recipe.yieldFactor) > 0 ? Number(recipe.yieldFactor) : 1;
      const effectiveReq = (baseReq / yf) * forecastQty;

      requiredMap[key].requiredQty += effectiveReq;
    }
  }

  const ingredientIds = Object.keys(requiredMap).map(Number);
  if (ingredientIds.length === 0) {
    return {
      recommendations: [],
      note: 'No recipes found for the forecasted items — link ingredients under Menu > Recipes first.',
    };
  }

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
    stockByIngredient[s.ingredientId].quantity += Number(s.quantity);
    stockByIngredient[s.ingredientId].minThreshold = Math.max(
      stockByIngredient[s.ingredientId].minThreshold,
      Number(s.minThreshold)
    );
  }

  const recommendations = Object.entries(requiredMap).map(([ingId, { ingredient, requiredQty }]) => {
    const stock = stockByIngredient[ingId] || { quantity: 0, minThreshold: 0 };
    const availableAboveThreshold = Math.max(0, stock.quantity - stock.minThreshold);
    const shortfall = Math.max(0, requiredQty - availableAboveThreshold);

    let status = 'OK';
    if (shortfall > 0 && stock.quantity <= stock.minThreshold) status = 'CRITICAL';
    else if (shortfall > 0) status = 'LOW';

    return {
      ingredientId: Number(ingId),
      name: ingredient.name,
      unit: ingredient.unit,
      currentStock: roundDecimals(stock.quantity, 3),
      minThreshold: roundDecimals(stock.minThreshold, 3),
      requiredForForecast: roundDecimals(requiredQty, 3),
      suggestedRestockQty: roundDecimals(shortfall, 3),
      status,
    };
  });

  const statusRank = { CRITICAL: 0, LOW: 1, OK: 2 };
  recommendations.sort(
    (a, b) => statusRank[a.status] - statusRank[b.status] || b.suggestedRestockQty - a.suggestedRestockQty
  );

  return { recommendations };
}

/**
 * Profit Report ("Tubo" Report)
 * Synchronized with getDashboard metrics:
 * - Gross Revenue, Discounts, Net Revenue, Historical COGS, Gross Profit, Expenses, Net Profit
 * - Item-by-item breakdown using actual snapshot sale costs
 */
async function getProfitReport({ period = 'today', from, to, branchId }, requestingUser) {
  const { start, end } = getDateRange(period, from, to);
  const scopedBranchId = validateBranchAccess(requestingUser, branchId);
  const scopedCashierId = requestingUser.role === 'CASHIER' ? requestingUser.id : null;

  const [completedOrders, expensesAggregate] = await Promise.all([
    prisma.order.findMany({
      where: {
        status: 'COMPLETED',
        createdAt: { gte: start, lte: end },
        ...(scopedBranchId && { branchId: scopedBranchId }),
        ...(scopedCashierId && { cashierId: scopedCashierId }),
      },
      include: {
        payments: true,
        items: {
          include: {
            menuItem: {
              select: {
                id: true,
                name: true,
                photo: true,
                category: { select: { id: true, name: true } },
                recipes: {
                  include: {
                    ingredient: {
                      select: { id: true, name: true, unit: true, defaultPrice: true },
                    },
                  },
                },
              },
            },
          },
        },
      },
    }),
    prisma.expense.aggregate({
      where: {
        expenseDate: { gte: start, lte: end },
        ...(scopedBranchId && { branchId: scopedBranchId }),
      },
      _sum: { amount: true },
    }),
  ]);

  const itemMap = {}; // menuItemId -> row

  let totalGrossRevenue = 0;
  let totalDiscounts = 0;
  let totalCogs = 0;

  for (const order of completedOrders) {
    const orderTotal = Number(order.totalAmount);
    totalGrossRevenue += orderTotal;

    let orderDiscount = Number(order.discountTotal || 0);
    if (!orderDiscount && order.payments?.length) {
      orderDiscount = order.payments.reduce((s, p) => s + Number(p.discountAmount || 0), 0);
    }
    totalDiscounts += orderDiscount;

    for (const oi of order.items) {
      const id = oi.menuItemId;
      const name = oi.menuItem?.name || 'Unknown';
      const catName = oi.menuItem?.category?.name || 'Uncategorized';
      const qty = oi.quantity;
      const grossRevenue = Number(oi.subtotal);

      // Attribute discount proportionally by item revenue
      const discountShare = orderTotal > 0 ? (grossRevenue / orderTotal) * orderDiscount : 0;
      const netRevenue = Math.max(0, grossRevenue - discountShare);

      // Resolve COGS: prefer snapshotted oi.cogs; fallback to recipe calculation
      let lineCogs = Number(oi.cogs || 0);
      let costKnown = lineCogs > 0;
      let unitCost = Number(oi.unitCost || 0);

      if (!costKnown && oi.menuItem?.recipes?.length) {
        const recipeCalc = calculateProductRecipeCost(oi.menuItem.recipes, order.branchId);
        if (recipeCalc.costKnown) {
          unitCost = recipeCalc.totalCost;
          lineCogs = roundDecimals(unitCost * qty, 2);
          costKnown = true;
        }
      }

      totalCogs += lineCogs;

      if (!itemMap[id]) {
        itemMap[id] = {
          menuItemId: id,
          name,
          category: catName,
          qtySold: 0,
          grossRevenue: 0,
          discounts: 0,
          netRevenue: 0,
          cogs: 0,
          grossProfit: 0,
          grossProfitMargin: 0,
          unitCost: unitCost || 0,
          costKnown,
        };
      }

      itemMap[id].qtySold += qty;
      itemMap[id].grossRevenue += grossRevenue;
      itemMap[id].discounts += discountShare;
      itemMap[id].netRevenue += netRevenue;
      itemMap[id].cogs += lineCogs;
      itemMap[id].grossProfit += (netRevenue - lineCogs);
      if (costKnown) {
        itemMap[id].costKnown = true;
        itemMap[id].unitCost = unitCost;
      }
    }
  }

  const items = Object.values(itemMap).map((i) => {
    const grossRev = roundDecimals(i.grossRevenue, 2);
    const disc = roundDecimals(i.discounts, 2);
    const netRev = roundDecimals(i.netRevenue, 2);
    const cost = roundDecimals(i.cogs, 2);
    const profit = roundDecimals(i.grossProfit, 2);
    const margin = netRev > 0 ? roundDecimals((profit / netRev) * 100, 2) : 0;

    return {
      menuItemId: i.menuItemId,
      name: i.name,
      category: i.category,
      qtySold: i.qtySold,
      revenue: grossRev, // backward compatibility
      grossRevenue: grossRev,
      discounts: disc,
      netRevenue: netRev,
      cost: i.costKnown ? cost : null,
      cogs: i.costKnown ? cost : null,
      profit: i.costKnown ? profit : null,
      grossProfit: i.costKnown ? profit : null,
      grossProfitMargin: i.costKnown ? margin : null,
      unitCost: i.costKnown ? roundDecimals(i.unitCost, 4) : null,
      costKnown: i.costKnown,
    };
  });

  items.sort((a, b) => {
    if (a.costKnown && !b.costKnown) return -1;
    if (!a.costKnown && b.costKnown) return 1;
    if (a.costKnown && b.costKnown) return (b.profit || 0) - (a.profit || 0);
    return b.grossRevenue - a.grossRevenue;
  });

  totalGrossRevenue = roundDecimals(totalGrossRevenue, 2);
  totalDiscounts = roundDecimals(totalDiscounts, 2);
  const totalNetSales = roundDecimals(Math.max(0, totalGrossRevenue - totalDiscounts), 2);
  totalCogs = roundDecimals(totalCogs, 2);
  const totalGrossProfit = roundDecimals(totalNetSales - totalCogs, 2);
  const grossProfitMargin = totalNetSales > 0 ? roundDecimals((totalGrossProfit / totalNetSales) * 100, 2) : 0;

  const operatingExpenses = roundDecimals(Number(expensesAggregate._sum.amount || 0), 2);
  const netProfit = roundDecimals(totalGrossProfit - operatingExpenses, 2);
  const netProfitMargin = totalNetSales > 0 ? roundDecimals((netProfit / totalNetSales) * 100, 2) : 0;

  const revenueWithUnknownCost = roundDecimals(
    items.filter((i) => !i.costKnown).reduce((s, i) => s + i.grossRevenue, 0),
    2
  );
  const itemsMissingCost = items.filter((i) => !i.costKnown).map((i) => i.name);

  return {
    period: { label: period, start, end },
    summary: {
      grossSales: totalGrossRevenue,
      totalRevenue: totalGrossRevenue, // backward compatibility
      discounts: totalDiscounts,
      netSales: totalNetSales,
      totalKnownCost: totalCogs,
      totalCogs,
      grossProfit: totalGrossProfit,
      totalKnownProfit: totalGrossProfit, // backward compatibility
      grossProfitMargin,
      operatingExpenses,
      netProfit,
      netProfitMargin,
      revenueWithUnknownCost,
      itemsMissingCostCount: itemsMissingCost.length,
    },
    items,
    itemsMissingCost,
  };
}

module.exports = {
  getDashboard,
  getBestSellers,
  getBranches,
  getAuthLogs,
  getIngredientRecommendations,
  getProfitReport,
};
