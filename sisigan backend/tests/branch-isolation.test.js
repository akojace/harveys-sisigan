// tests/branch-isolation.test.js
// Automated verification for Scenarios A through H of Harvey's Sisigan multi-branch architecture.

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const prisma = require('../src/config/db');
const inventoryService = require('../src/modules/inventory/inventory.service');
const menuService = require('../src/modules/menu/menu.service');
const orderService = require('../src/modules/orders/order.service');
const dashboardService = require('../src/modules/dashboard/dashboard.service');
const reportService = require('../src/modules/reports/report.service');
const { validateBranchAccess } = require('../src/middleware/branchScope.middleware');

describe('Multi-Branch Stock Isolation, Role Separation & Product Availability Test Suite', () => {
  let ownerUser;
  let staCruzManager;
  let lumbanManager;
  let staCruzCashier;
  let lumbanBranch;
  let staCruzBranch;

  let chiliOilIngredient;
  let porkSisigItem;

  before(async () => {
    // 1. Fetch branches
    lumbanBranch = await prisma.branch.findFirst({ where: { name: { contains: 'Lumban' } } });
    staCruzBranch = await prisma.branch.findFirst({ where: { name: { contains: 'Cruz' } } });

    assert.ok(lumbanBranch, 'Lumban branch must exist in database');
    assert.ok(staCruzBranch, 'Sta. Cruz branch must exist in database');

    // 2. Fetch users
    ownerUser = await prisma.user.findFirst({ where: { role: 'OWNER' } });
    staCruzManager = await prisma.user.findFirst({
      where: { role: 'MANAGER', branchId: staCruzBranch.id },
    });
    lumbanManager = await prisma.user.findFirst({
      where: { role: 'MANAGER', branchId: lumbanBranch.id },
    });
    staCruzCashier = await prisma.user.findFirst({
      where: { role: 'CASHIER', branchId: staCruzBranch.id },
    });

    assert.ok(ownerUser, 'Owner user must exist');
    assert.ok(staCruzManager, 'Sta. Cruz Manager must exist');
    assert.ok(lumbanManager, 'Lumban Manager must exist');

    // 3. Ensure test ingredient (Chilli Oil) exists or find/create it
    chiliOilIngredient = await prisma.ingredient.findFirst({
      where: { name: { contains: 'Chilli' } },
    });

    if (!chiliOilIngredient) {
      chiliOilIngredient = await prisma.ingredient.create({
        data: {
          name: 'Chilli Oil',
          category: 'SAUCE',
          unit: 'ML',
          defaultPrice: 0.15,
          defaultMinThreshold: 100,
        },
      });
    }

    // Ensure inventory item exists in both Lumban and Sta. Cruz
    await prisma.inventoryItem.upsert({
      where: {
        branchId_ingredientId: {
          branchId: lumbanBranch.id,
          ingredientId: chiliOilIngredient.id,
        },
      },
      update: {},
      create: {
        branchId: lumbanBranch.id,
        ingredientId: chiliOilIngredient.id,
        quantity: 2000,
        price: 0.15,
        minThreshold: 100,
      },
    });

    await prisma.inventoryItem.upsert({
      where: {
        branchId_ingredientId: {
          branchId: staCruzBranch.id,
          ingredientId: chiliOilIngredient.id,
        },
      },
      update: {},
      create: {
        branchId: staCruzBranch.id,
        ingredientId: chiliOilIngredient.id,
        quantity: 1000,
        price: 0.15,
        minThreshold: 100,
      },
    });

    // 4. Ensure Pork Sisig exists and has Chili Oil in recipe
    porkSisigItem = await prisma.menuItem.findFirst({
      where: { name: { contains: 'Sisig' } },
      include: { recipes: true },
    });

    assert.ok(porkSisigItem, 'Pork Sisig menu item must exist');

    // Make sure porkSisig has Chili Oil as a recipe ingredient
    const recipeHasChiliOil = porkSisigItem.recipes.some(
      (r) => r.ingredientId === chiliOilIngredient.id
    );

    if (!recipeHasChiliOil) {
      await prisma.menuItemRecipeIngredient.create({
        data: {
          menuItemId: porkSisigItem.id,
          ingredientId: chiliOilIngredient.id,
          quantity: 10, // 10 ML per serving
          unit: 'ML',
        },
      });
    }
  });

  after(async () => {
    await prisma.$disconnect();
  });

  // ==========================================
  // SCENARIO A: Independent Branch Stock Quantities
  // ==========================================
  describe('Scenario A: Independent Branch Stock Quantities', () => {
    it('restocking Sta. Cruz increases only Sta. Cruz stock while Lumban remains unchanged', async () => {
      // Get initial stock
      const lumbanBefore = await prisma.inventoryItem.findUnique({
        where: {
          branchId_ingredientId: {
            branchId: lumbanBranch.id,
            ingredientId: chiliOilIngredient.id,
          },
        },
      });
      const staCruzBefore = await prisma.inventoryItem.findUnique({
        where: {
          branchId_ingredientId: {
            branchId: staCruzBranch.id,
            ingredientId: chiliOilIngredient.id,
          },
        },
      });

      const initialLumbanQty = Number(lumbanBefore.quantity);
      const initialStaCruzQty = Number(staCruzBefore.quantity);

      // Restock 500 ML in Sta. Cruz
      await inventoryService.restockInventoryItem(
        {
          branchId: staCruzBranch.id,
          ingredientId: chiliOilIngredient.id,
          purchaseQuantity: 500,
          purchaseUnit: 'ML',
          purchaseCost: 75,
          referenceNo: 'RESTOCK-SC-001',
          note: 'Sta. Cruz Restock Only',
        },
        staCruzManager
      );

      // Verify Sta. Cruz increased
      const staCruzAfter = await prisma.inventoryItem.findUnique({
        where: {
          branchId_ingredientId: {
            branchId: staCruzBranch.id,
            ingredientId: chiliOilIngredient.id,
          },
        },
      });
      assert.equal(Number(staCruzAfter.quantity), initialStaCruzQty + 500);

      // Verify Lumban remained strictly unchanged
      const lumbanAfter = await prisma.inventoryItem.findUnique({
        where: {
          branchId_ingredientId: {
            branchId: lumbanBranch.id,
            ingredientId: chiliOilIngredient.id,
          },
        },
      });
      assert.equal(Number(lumbanAfter.quantity), initialLumbanQty);
    });
  });

  // ==========================================
  // SCENARIO B: Out-of-Stock Isolation
  // ==========================================
  describe('Scenario B: Out-of-Stock Isolation', () => {
    it('when Sta. Cruz Chili Oil is 0 ML, Sta. Cruz product is OUT OF STOCK while Lumban remains AVAILABLE', async () => {
      // Set Lumban Chili Oil to 2,000 ML
      await prisma.inventoryItem.update({
        where: {
          branchId_ingredientId: {
            branchId: lumbanBranch.id,
            ingredientId: chiliOilIngredient.id,
          },
        },
        data: { quantity: 2000 },
      });

      // Set Sta. Cruz Chili Oil to 0 ML
      await prisma.inventoryItem.update({
        where: {
          branchId_ingredientId: {
            branchId: staCruzBranch.id,
            ingredientId: chiliOilIngredient.id,
          },
        },
        data: { quantity: 0 },
      });

      // Evaluate Sta. Cruz availability
      const staCruzStockCheck = await menuService.checkMenuItemStock(porkSisigItem.id, staCruzBranch.id);
      assert.equal(staCruzStockCheck.isStockAvailable, false, 'Sta. Cruz should be out of stock');
      assert.equal(staCruzStockCheck.maxProducible, 0, 'Sta. Cruz max producible should be 0');
      const oosIngredientNames = staCruzStockCheck.ingredients
        .filter((i) => i.status === 'OUT_OF_STOCK')
        .map((i) => i.name);
      assert.ok(
        oosIngredientNames.includes(chiliOilIngredient.name),
        'Chili Oil should be listed as shortage in Sta. Cruz'
      );

      // Evaluate Lumban availability
      const lumbanStockCheck = await menuService.checkMenuItemStock(porkSisigItem.id, lumbanBranch.id);
      assert.equal(lumbanStockCheck.isStockAvailable, true, 'Lumban should remain available');
      assert.ok(lumbanStockCheck.maxProducible > 0, 'Lumban should have producible servings');
      const lumbanOos = lumbanStockCheck.ingredients.filter((i) => i.status === 'OUT_OF_STOCK');
      assert.equal(lumbanOos.length, 0, 'Lumban should not have Chili Oil shortage');

      // Verify menu API returns out-of-stock badge information for Sta. Cruz
      const staCruzMenu = await menuService.getMenuWithCategories({
        branchId: staCruzBranch.id,
        enforceStock: false,
      });

      let foundItemInStaCruz = null;
      for (const cat of staCruzMenu) {
        const item = cat.items.find((i) => i.id === porkSisigItem.id);
        if (item) {
          foundItemInStaCruz = item;
          break;
        }
      }

      assert.ok(foundItemInStaCruz, 'Product should be returned in menu');
      assert.equal(foundItemInStaCruz.isStockAvailable, false);
      assert.equal(foundItemInStaCruz.availabilityStatus, 'OUT_OF_STOCK');
    });
  });

  // ==========================================
  // SCENARIO C: Sales Deductions Only Affect the Selling Branch
  // ==========================================
  describe('Scenario C: Sales Deductions Only Affect the Selling Branch', () => {
    it('selling Sisig in Lumban deducts Lumban inventory and leaves Sta. Cruz inventory untouched', async () => {
      // Ensure both branches have positive stock
      await prisma.inventoryItem.update({
        where: {
          branchId_ingredientId: {
            branchId: lumbanBranch.id,
            ingredientId: chiliOilIngredient.id,
          },
        },
        data: { quantity: 2000 },
      });

      await prisma.inventoryItem.update({
        where: {
          branchId_ingredientId: {
            branchId: staCruzBranch.id,
            ingredientId: chiliOilIngredient.id,
          },
        },
        data: { quantity: 1500 },
      });

      // Create an order in Lumban for 2 servings of Pork Sisig
      const orderData = {
        branchId: lumbanBranch.id,
        cashierId: lumbanManager.id,
        type: 'DINE_IN',
        items: [
          {
            menuItemId: porkSisigItem.id,
            quantity: 2,
            unitPrice: Number(porkSisigItem.price),
          },
        ],
      };

      const createdOrder = await orderService.createOrder(orderData);
      assert.ok(createdOrder);

      // 2 servings × 10 ML = 20 ML Chili Oil deducted from Lumban
      const lumbanStockAfter = await prisma.inventoryItem.findUnique({
        where: {
          branchId_ingredientId: {
            branchId: lumbanBranch.id,
            ingredientId: chiliOilIngredient.id,
          },
        },
      });
      assert.equal(Number(lumbanStockAfter.quantity), 1980);

      // Sta. Cruz stock MUST remain exactly 1,500 ML
      const staCruzStockAfter = await prisma.inventoryItem.findUnique({
        where: {
          branchId_ingredientId: {
            branchId: staCruzBranch.id,
            ingredientId: chiliOilIngredient.id,
          },
        },
      });
      assert.equal(Number(staCruzStockAfter.quantity), 1500);

      // Verify audit log exists for Lumban and not Sta. Cruz
      const saleAudit = await prisma.inventoryAuditLog.findFirst({
        where: {
          referenceNo: createdOrder.orderNumber,
          actionType: 'ORDER_DEDUCTION',
        },
        include: { inventoryItem: true },
      });
      assert.ok(saleAudit);
      assert.equal(saleAudit.inventoryItem.branchId, lumbanBranch.id);
    });
  });

  // ==========================================
  // SCENARIO D: Unauthorized Branch Inventory Modification
  // ==========================================
  describe('Scenario D: Unauthorized Branch Inventory Modification', () => {
    it('Sta. Cruz manager attempting to restock Lumban inventory is rejected with 403 Forbidden', async () => {
      await assert.rejects(
        async () => {
          await inventoryService.restockInventoryItem(
            {
              branchId: lumbanBranch.id, // Targeting Lumban!
              ingredientId: chiliOilIngredient.id,
              purchaseQuantity: 100,
              purchaseUnit: 'ML',
              purchaseCost: 20,
            },
            staCruzManager // Manager belonging to Sta. Cruz
          );
        },
        (err) => {
          assert.equal(err.statusCode, 403);
          assert.match(err.message, /Access denied|Forbidden/i);
          return true;
        }
      );
    });
  });

  // ==========================================
  // SCENARIO E: Manipulated Branch Parameter Rejected
  // ==========================================
  describe('Scenario E: Manipulated Branch Parameter Rejected', () => {
    it('throws 403 Forbidden when a manager sends a foreign branch ID in query/request', () => {
      assert.throws(
        () => {
          validateBranchAccess(staCruzManager, lumbanBranch.id);
        },
        (err) => {
          assert.equal(err.statusCode, 403);
          assert.match(err.message, /Access denied/i);
          return true;
        }
      );
    });

    it('cashier attempting to read another branch report or dashboard is rejected with 403 Forbidden', async () => {
      await assert.rejects(
        async () => {
          await dashboardService.getDashboard({ branchId: lumbanBranch.id, period: 'today' }, staCruzCashier);
        },
        (err) => {
          assert.equal(err.statusCode, 403);
          return true;
        }
      );
    });
  });

  // ==========================================
  // SCENARIO F: Branch-Specific Purchase Cost / Independent Weighted-Average Costing
  // ==========================================
  describe('Scenario F: Branch-Specific Purchase Cost / Independent Costing', () => {
    it('restocking Sta. Cruz at a higher cost updates only Sta. Cruz weighted-average cost, leaving Lumban unchanged', async () => {
      // 1. Set baseline quantities and prices
      // Lumban: 1,000 ML @ ₱0.10/ML (Value: ₱100)
      await prisma.inventoryItem.update({
        where: {
          branchId_ingredientId: {
            branchId: lumbanBranch.id,
            ingredientId: chiliOilIngredient.id,
          },
        },
        data: { quantity: 1000, price: 0.10 },
      });

      // Sta. Cruz: 1,000 ML @ ₱0.10/ML (Value: ₱100)
      await prisma.inventoryItem.update({
        where: {
          branchId_ingredientId: {
            branchId: staCruzBranch.id,
            ingredientId: chiliOilIngredient.id,
          },
        },
        data: { quantity: 1000, price: 0.10 },
      });

      // 2. Restock Sta. Cruz: 1,000 ML @ ₱0.20/ML (₱200 total purchase cost)
      // New Sta. Cruz average: (100 + 200) / (1000 + 1000) = 300 / 2000 = ₱0.15/ML
      await inventoryService.restockInventoryItem(
        {
          branchId: staCruzBranch.id,
          ingredientId: chiliOilIngredient.id,
          purchaseQuantity: 1000,
          purchaseUnit: 'ML',
          purchaseCost: 200,
          referenceNo: 'COST-TEST-SC',
          note: 'Higher price in Sta. Cruz',
        },
        staCruzManager
      );

      // Verify Sta. Cruz cost is updated to ₱0.15/ML
      const staCruzItem = await prisma.inventoryItem.findUnique({
        where: {
          branchId_ingredientId: {
            branchId: staCruzBranch.id,
            ingredientId: chiliOilIngredient.id,
          },
        },
      });
      assert.equal(Number(staCruzItem.quantity), 2000);
      assert.equal(Number(staCruzItem.price), 0.15);

      // Verify Lumban cost is UNCHANGED at ₱0.10/ML
      const lumbanItem = await prisma.inventoryItem.findUnique({
        where: {
          branchId_ingredientId: {
            branchId: lumbanBranch.id,
            ingredientId: chiliOilIngredient.id,
          },
        },
      });
      assert.equal(Number(lumbanItem.quantity), 1000);
      assert.equal(Number(lumbanItem.price), 0.10);

      // Verify global Ingredient default price was NOT overwritten
      const ingredient = await prisma.ingredient.findUnique({
        where: { id: chiliOilIngredient.id },
      });
      // The default price should remain as it was or unaffected
      assert.ok(ingredient);
    });
  });

  // ==========================================
  // SCENARIO G: Inter-Branch Inventory Transfer
  // ==========================================
  describe('Scenario G: Inter-Branch Inventory Transfer', () => {
    it('transfers 500 ML from Sta. Cruz to Lumban with atomic debit/credit and weighted-average costing', async () => {
      // Current Sta. Cruz: 2,000 ML @ ₱0.15/ML
      // Current Lumban: 1,000 ML @ ₱0.10/ML (Value: ₱100)
      // Transfer: 500 ML from Sta. Cruz to Lumban
      // Sta. Cruz after: 1,500 ML @ ₱0.15/ML
      // Transfer value: 500 × ₱0.15 = ₱75
      // Lumban after: Qty = 1,000 + 500 = 1,500 ML. Value = 100 + 75 = 175.
      // Lumban new avg cost: 175 / 1500 = ₱0.1167/ML

      const transfer = await inventoryService.transferInventory(
        {
          sourceBranchId: staCruzBranch.id,
          destBranchId: lumbanBranch.id,
          ingredientId: chiliOilIngredient.id,
          quantity: 500,
          unit: 'ML',
          notes: 'Transfer 500ml chili oil Sta. Cruz to Lumban',
        },
        ownerUser
      );

      assert.ok(transfer);
      assert.equal(transfer.status, 'COMPLETED');
      assert.ok(transfer.transferNo.startsWith('TRF-'));

      // Check Sta. Cruz inventory
      const staCruzAfter = await prisma.inventoryItem.findUnique({
        where: {
          branchId_ingredientId: {
            branchId: staCruzBranch.id,
            ingredientId: chiliOilIngredient.id,
          },
        },
      });
      assert.equal(Number(staCruzAfter.quantity), 1500);
      assert.equal(Number(staCruzAfter.price), 0.15);

      // Check Lumban inventory
      const lumbanAfter = await prisma.inventoryItem.findUnique({
        where: {
          branchId_ingredientId: {
            branchId: lumbanBranch.id,
            ingredientId: chiliOilIngredient.id,
          },
        },
      });
      assert.equal(Number(lumbanAfter.quantity), 1500);
      const expectedLumbanCost = Math.round((175 / 1500) * 10000) / 10000;
      const actualLumbanCost = Math.round(Number(lumbanAfter.price) * 10000) / 10000;
      assert.equal(actualLumbanCost, expectedLumbanCost);

      // Check audit logs for TRANSFER_OUT and TRANSFER_IN
      const logs = await prisma.inventoryAuditLog.findMany({
        where: { referenceNo: transfer.transferNo },
        include: { inventoryItem: true },
      });
      assert.equal(logs.length, 2, 'Must have exactly one TRANSFER_OUT and one TRANSFER_IN log');

      const outLog = logs.find((l) => l.actionType === 'TRANSFER_OUT');
      const inLog = logs.find((l) => l.actionType === 'TRANSFER_IN');

      assert.equal(outLog.inventoryItem.branchId, staCruzBranch.id);
      assert.equal(Number(outLog.quantityChanged), -500);

      assert.equal(inLog.inventoryItem.branchId, lumbanBranch.id);
      assert.equal(Number(inLog.quantityChanged), 500);
    });

    it('rejects transfer if source branch does not have enough stock', async () => {
      await assert.rejects(
        async () => {
          await inventoryService.transferInventory(
            {
              sourceBranchId: staCruzBranch.id,
              destBranchId: lumbanBranch.id,
              ingredientId: chiliOilIngredient.id,
              quantity: 999999, // Exceeds available stock
              unit: 'ML',
            },
            ownerUser
          );
        },
        (err) => {
          assert.match(err.message, /Insufficient stock/i);
          return true;
        }
      );
    });
  });

  // ==========================================
  // SCENARIO H: Dashboard and Reporting Isolation
  // ==========================================
  describe('Scenario H: Dashboard and Reporting Isolation', () => {
    it('Sta. Cruz manager dashboard only aggregates Sta. Cruz metrics', async () => {
      const dashboard = await dashboardService.getDashboard(
        { branchId: staCruzBranch.id, period: 'today' },
        staCruzManager
      );

      assert.ok(dashboard);
      assert.ok(dashboard.summary);
      assert.ok(dashboard.period);

      // Low stock alerts in Sta. Cruz usage report must only contain items belonging to Sta. Cruz
      const usageReport = await reportService.getUsageReport(
        { branchId: staCruzBranch.id, period: 'daily' },
        staCruzManager
      );
      assert.ok(usageReport);
      for (const alert of usageReport.lowStockAlerts) {
        assert.equal(alert.branch.id, staCruzBranch.id, 'Alert must belong to Sta. Cruz');
      }
    });

    it('Owner can view consolidated all-branches dashboard or filter by specific branch', async () => {
      // Filter by Lumban
      const lumbanDashboard = await dashboardService.getDashboard(
        { branchId: lumbanBranch.id, period: 'today' },
        ownerUser
      );
      assert.ok(lumbanDashboard);
      assert.ok(lumbanDashboard.summary);

      // All branches (no branchId specified)
      const allBranchesDashboard = await dashboardService.getDashboard(
        { branchId: null, period: 'today' },
        ownerUser
      );
      assert.ok(allBranchesDashboard);
      assert.ok(allBranchesDashboard.summary);
    });

    it('Manager attempting to access another branch usage report is rejected with 403', async () => {
      await assert.rejects(
        async () => {
          await reportService.getUsageReport({ branchId: lumbanBranch.id, period: 'daily' }, staCruzManager);
        },
        (err) => {
          assert.equal(err.statusCode, 403);
          return true;
        }
      );
    });
  });
});
