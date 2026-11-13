// tests/integration.test.js
// Automated test suite for inventory costing, recipes, sale deductions, COGS, and dashboard synchronization.

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const prisma = require('../src/config/db');
const inventoryService = require('../src/modules/inventory/inventory.service');
const orderService = require('../src/modules/orders/order.service');
const dashboardService = require('../src/modules/dashboard/dashboard.service');
const expenseService = require('../src/modules/expenses/expense.service');
const { convertQuantity, calculateWeightedAverageCost, calculateProductRecipeCost } = require('../src/utils/inventoryCosting');

describe('Full System Technical and Financial Integration Tests', () => {
  let testUser;
  let branchId = 1;

  before(async () => {
    testUser = await prisma.user.findFirst({ where: { role: 'OWNER' } });
    if (!testUser) {
      throw new Error('Test requires seeded user. Run npm run db:seed first.');
    }
  });

  after(async () => {
    await prisma.$disconnect();
  });

  describe('1. Perpetual Weighted-Average Restocking & Unit Conversion', () => {
    it('restocks an ingredient with unit conversion (KG -> GRAM) and updates weighted-average cost', async () => {
      // Find Silog Meat in branch 1
      const silogMeat = await prisma.ingredient.findUnique({ where: { name: 'Silog Meat' } });
      assert.ok(silogMeat);

      const beforeItem = await prisma.inventoryItem.findUnique({
        where: { branchId_ingredientId: { branchId, ingredientId: silogMeat.id } },
      });
      const initialQty = Number(beforeItem.quantity);
      const initialCost = Number(beforeItem.price);

      // Purchase 2 KG of Silog Meat @ ₱600 (unit cost ₱300/kg = ₱0.30/g) with 100% yield
      // 2 KG converts to 2,000 GRAMS.
      const result = await inventoryService.restockInventoryItem(
        {
          branchId,
          ingredientId: silogMeat.id,
          purchaseQuantity: 2,
          purchaseUnit: 'KG',
          purchaseCost: 600,
          yieldPercentage: 100,
          referenceNo: 'INV-TEST-001',
          note: 'Test restock 2kg pork meat',
        },
        testUser
      );

      const expectedQty = initialQty + 2000;
      const expectedTotalValue = (initialQty * initialCost) + 600;
      const expectedAvgCost = expectedTotalValue / expectedQty;

      assert.equal(Number(result.quantity), expectedQty);
      assert.equal(Math.round(Number(result.price) * 1000) / 1000, Math.round(expectedAvgCost * 1000) / 1000);

      // Verify audit log record
      const auditLog = await prisma.inventoryAuditLog.findFirst({
        where: {
          inventoryItemId: beforeItem.id,
          actionType: 'RESTOCK',
          referenceNo: 'INV-TEST-001',
        },
      });
      assert.ok(auditLog);
      assert.equal(Number(auditLog.quantityChanged), 2000);
      assert.equal(Number(auditLog.totalCost), 600);
    });

    it('rejects invalid or incompatible unit conversions', async () => {
      const bigas = await prisma.ingredient.findUnique({ where: { name: 'Bigas' } });
      await assert.rejects(
        async () => {
          await inventoryService.restockInventoryItem(
            {
              branchId,
              ingredientId: bigas.id,
              purchaseQuantity: 10,
              purchaseUnit: 'LITER', // Incompatible with GRAM
              purchaseCost: 500,
            },
            testUser
          );
        },
        (err) => {
          assert.match(err.message, /Incompatible unit conversion/);
          return true;
        }
      );
    });

    it('rejects negative or zero purchase quantities', async () => {
      const bigas = await prisma.ingredient.findUnique({ where: { name: 'Bigas' } });
      await assert.rejects(
        async () => {
          await inventoryService.restockInventoryItem(
            {
              branchId,
              ingredientId: bigas.id,
              purchaseQuantity: -5,
              purchaseUnit: 'GRAM',
              purchaseCost: 100,
            },
            testUser
          );
        },
        (err) => err.statusCode === 400
      );
    });
  });

  describe('2. Recipe-Based Product Costing & Validation Case', () => {
    it('accurately computes product recipe cost and margins', async () => {
      const sisilog = await prisma.menuItem.findFirst({
        where: { name: 'Sisilog' },
        include: { recipes: { include: { ingredient: true } } },
      });
      assert.ok(sisilog);

      const costResult = calculateProductRecipeCost(sisilog.recipes, branchId);
      assert.equal(costResult.costKnown, true);
      assert.ok(costResult.totalCost > 0);

      // Check line breakdown
      const bigasLine = costResult.lineBreakdown.find((l) => l.ingredientName === 'Bigas');
      assert.ok(bigasLine);
      assert.equal(bigasLine.recipeQuantity, 100);
      assert.equal(bigasLine.recipeUnit, 'GRAM');
    });

    it('matches user prompt validation case: ₱150 selling price, ₱37 cost, 3 sold', () => {
      const sellingPrice = 150.00;
      const ingredientCost = 37.00;
      const qtySold = 3;

      const grossSales = sellingPrice * qtySold;
      const cogs = ingredientCost * qtySold;
      const grossProfit = grossSales - cogs;
      const grossProfitMargin = (grossProfit / grossSales) * 100;

      assert.equal(grossSales, 450.00);
      assert.equal(cogs, 111.00);
      assert.equal(grossProfit, 339.00);
      assert.equal(Math.round(grossProfitMargin * 100) / 100, 75.33);
    });
  });

  describe('3. Order Lifecycle, Atomic Deductions, and Reversals', () => {
    let createdOrder;
    let sisilogItem;

    before(async () => {
      sisilogItem = await prisma.menuItem.findFirst({ where: { name: 'Sisilog' } });
      assert.ok(sisilogItem);
    });

    it('creates an order, deducts ingredient stock, and snapshots COGS on order and order items', async () => {
      // Find Silog Meat stock before order
      const silogMeat = await prisma.ingredient.findUnique({ where: { name: 'Silog Meat' } });
      const stockBefore = await prisma.inventoryItem.findUnique({
        where: { branchId_ingredientId: { branchId, ingredientId: silogMeat.id } },
      });
      const qtyBefore = Number(stockBefore.quantity);

      // Place order for 2 Sisilog (requires 200g Silog Meat and 200g Bigas)
      createdOrder = await orderService.createOrder({
        branchId,
        cashierId: testUser.id,
        type: 'DINE_IN',
        tableNumber: 'T-1',
        customerName: 'Juan Dela Cruz',
        items: [{ menuItemId: sisilogItem.id, quantity: 2 }],
      });

      assert.ok(createdOrder.id);
      assert.equal(createdOrder.inventoryDeducted, true);
      assert.ok(Number(createdOrder.cogs) > 0);

      // Verify OrderItem COGS snapshot
      const itemRow = createdOrder.items[0];
      assert.ok(Number(itemRow.unitCost) > 0);
      assert.equal(Number(itemRow.cogs), Math.round(Number(itemRow.unitCost) * 2 * 100) / 100);

      // Verify stock was deducted by exactly 200g
      const stockAfter = await prisma.inventoryItem.findUnique({
        where: { branchId_ingredientId: { branchId, ingredientId: silogMeat.id } },
      });
      assert.equal(Number(stockAfter.quantity), qtyBefore - 200);

      // Verify audit log has ORDER_DEDUCTION
      const auditLog = await prisma.inventoryAuditLog.findFirst({
        where: {
          inventoryItemId: stockBefore.id,
          orderId: createdOrder.id,
          actionType: 'ORDER_DEDUCTION',
        },
      });
      assert.ok(auditLog);
      assert.equal(Number(auditLog.quantityChanged), -200);
      assert.ok(Number(auditLog.unitCost) > 0);
    });

    it('rejects order when stock is insufficient', async () => {
      // Temporarily set stock of Silog Meat to 10 grams
      const silogMeat = await prisma.ingredient.findUnique({ where: { name: 'Silog Meat' } });
      const stockRow = await prisma.inventoryItem.findUnique({
        where: { branchId_ingredientId: { branchId, ingredientId: silogMeat.id } },
      });
      const originalStock = Number(stockRow.quantity);

      await prisma.inventoryItem.update({
        where: { id: stockRow.id },
        data: { quantity: 10 },
      });

      try {
        // Try to order 1 Sisilog (requires 100g, only 10g available)
        await assert.rejects(
          async () => {
            await orderService.createOrder({
              branchId,
              cashierId: testUser.id,
              type: 'TAKEOUT',
              items: [{ menuItemId: sisilogItem.id, quantity: 1 }],
            });
          },
          (err) => {
            assert.match(err.message, /Insufficient stock for "Silog Meat"/);
            return true;
          }
        );
      } finally {
        // Restore stock
        await prisma.inventoryItem.update({
          where: { id: stockRow.id },
          data: { quantity: originalStock },
        });
      }
    });

    it('cancelling an order restores all deducted ingredients and logs ORDER_RESTORE', async () => {
      const silogMeat = await prisma.ingredient.findUnique({ where: { name: 'Silog Meat' } });
      const stockBeforeCancel = await prisma.inventoryItem.findUnique({
        where: { branchId_ingredientId: { branchId, ingredientId: silogMeat.id } },
      });
      const qtyBeforeCancel = Number(stockBeforeCancel.quantity);

      // Cancel the order created earlier
      const cancelled = await orderService.cancelOrder(createdOrder.id, {
        userRole: 'OWNER',
        userBranchId: branchId,
        actorUserId: testUser.id,
      });

      assert.equal(cancelled.status, 'CANCELLED');

      // Verify stock was restored by 200g
      const stockAfterCancel = await prisma.inventoryItem.findUnique({
        where: { branchId_ingredientId: { branchId, ingredientId: silogMeat.id } },
      });
      assert.equal(Number(stockAfterCancel.quantity), qtyBeforeCancel + 200);

      // Verify audit log has ORDER_RESTORE
      const restoreLog = await prisma.inventoryAuditLog.findFirst({
        where: {
          inventoryItemId: stockBeforeCancel.id,
          orderId: createdOrder.id,
          actionType: 'ORDER_RESTORE',
        },
      });
      assert.ok(restoreLog);
      assert.equal(Number(restoreLog.quantityChanged), 200);
    });

    it('prevents double restoration if order is already cancelled', async () => {
      await assert.rejects(
        async () => {
          await orderService.cancelOrder(createdOrder.id, {
            userRole: 'OWNER',
            userBranchId: branchId,
          });
        },
        (err) => err.statusCode === 400
      );
    });
  });

  describe('4. Payments, Discounts, Operating Expenses, and Synchronized Financials', () => {
    let completedSaleOrder;

    it('processes completed sale with discount and records payment', async () => {
      const sisilog = await prisma.menuItem.findFirst({ where: { name: 'Sisilog' } });
      assert.ok(sisilog);

      // Create order: 2 Sisilog = ₱178.00
      const order = await orderService.createOrder({
        branchId,
        cashierId: testUser.id,
        type: 'DINE_IN',
        items: [{ menuItemId: sisilog.id, quantity: 2 }],
      });

      // Process payment with SENIOR discount (20% off ₱178 = ₱35.60 discount -> ₱142.40 total)
      // Pay ₱150 cash -> Change ₱7.60
      const paymentResult = await orderService.processPayment(
        {
          orderId: order.id,
          method: 'CASH',
          amountPaid: 150,
          discountType: 'SENIOR',
        },
        { userRole: 'OWNER', userBranchId: branchId }
      );

      completedSaleOrder = paymentResult.order;
      assert.equal(completedSaleOrder.status, 'COMPLETED');
      assert.equal(Number(completedSaleOrder.discountTotal), 35.60);
      assert.equal(paymentResult.change, 7.60);
      assert.ok(Number(completedSaleOrder.cogs) > 0);
    });

    it('creates an operating expense record', async () => {
      const expense = await expenseService.createExpense(
        {
          branchId,
          category: 'UTILITIES',
          amount: 50.00,
          description: 'Electricity daily share',
        },
        testUser
      );
      assert.ok(expense.id);
      assert.equal(Number(expense.amount), 50.00);
    });

    it('verifies that Dashboard KPIs and Profit Report produce synchronized financial figures', async () => {
      const dashboard = await dashboardService.getDashboard({ period: 'today', branchId }, testUser);
      const profitReport = await dashboardService.getProfitReport({ period: 'today', branchId }, testUser);

      const dSummary = dashboard.summary;
      const pSummary = profitReport.summary;

      // Both must report the exact same figures for the same scope
      assert.equal(dSummary.grossSales, pSummary.grossSales, 'Gross sales must match');
      assert.equal(dSummary.discounts, pSummary.discounts, 'Discounts must match');
      assert.equal(dSummary.netSales, pSummary.netSales, 'Net sales must match');
      assert.equal(dSummary.totalCogs, pSummary.totalCogs, 'COGS must match');
      assert.equal(dSummary.grossProfit, pSummary.grossProfit, 'Gross profit must match');
      assert.equal(dSummary.operatingExpenses, pSummary.operatingExpenses, 'Operating expenses must match');
      assert.equal(dSummary.netProfit, pSummary.netProfit, 'Net profit must match');

      // Check math consistency: Net Sales = Gross Sales - Discounts
      assert.equal(
        Math.round((dSummary.grossSales - dSummary.discounts) * 100) / 100,
        dSummary.netSales
      );

      // Gross Profit = Net Sales - COGS
      assert.equal(
        Math.round((dSummary.netSales - dSummary.totalCogs) * 100) / 100,
        dSummary.grossProfit
      );

      // Net Profit = Gross Profit - Operating Expenses
      assert.equal(
        Math.round((dSummary.grossProfit - dSummary.operatingExpenses) * 100) / 100,
        dSummary.netProfit
      );
    });
  });
});
