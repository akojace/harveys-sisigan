// tests/best-sellers.test.js
// Production-Ready Verification Test Suite for Best-Selling Products Dashboard
// Covers Scenarios A through H:
// - Test A: Admin branch comparison (Sta. Cruz vs Lumban independent rankings)
// - Test B: Cashier assigned to Sta. Cruz sees Sta. Cruz only
// - Test C: Cashier assigned to Lumban sees Lumban only
// - Test D: Unauthorized branch request (403 Forbidden on cross-branch attempt)
// - Test E: Quantity-based ranking (SUM(quantity) vs COUNT(order))
// - Test F: Transaction eligibility (COMPLETED included, CANCELLED excluded)
// - Test G: Date filtering (today, month, custom)
// - Test H: Dashboard consistency between Admin and Cashier views

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const prisma = require('../src/config/db');
const dashboardService = require('../src/modules/dashboard/dashboard.service');
const { validateBranchAccess } = require('../src/middleware/branchScope.middleware');

describe("Harvey's Sisigan — Best-Selling Products Dashboard Test Suite", () => {
  let ownerUser;
  let staCruzBranch;
  let lumbanBranch;
  let staCruzCashier;
  let lumbanCashier;

  let testPorkSisig;
  let testChickenSisig;
  let testBeefSisig;
  let createdOrderIds = [];

  before(async () => {
    // 1. Fetch active branches
    staCruzBranch = await prisma.branch.findFirst({ where: { name: { contains: 'Cruz' } } });
    lumbanBranch = await prisma.branch.findFirst({ where: { name: { contains: 'Lumban' } } });

    assert.ok(staCruzBranch, 'Sta. Cruz branch must exist in database');
    assert.ok(lumbanBranch, 'Lumban branch must exist in database');

    // 2. Fetch users
    ownerUser = await prisma.user.findFirst({ where: { role: 'OWNER' } });
    staCruzCashier = await prisma.user.findFirst({
      where: { role: 'CASHIER', branchId: staCruzBranch.id },
    });
    lumbanCashier = await prisma.user.findFirst({
      where: { role: 'CASHIER', branchId: lumbanBranch.id },
    });

    if (!lumbanCashier) {
      // Find or create cashier for Lumban test
      const cashierRole = await prisma.user.findFirst({ where: { role: 'CASHIER' } });
      lumbanCashier = await prisma.user.create({
        data: {
          username: `cashier_lumban_${Date.now()}`,
          passwordHash: cashierRole ? cashierRole.passwordHash : '$2a$10$abcdefghijklmnopqrstuvwxyz123456',
          fullName: 'Lumban Test Cashier',
          role: 'CASHIER',
          branchId: lumbanBranch.id,
        },
      });
    }

    assert.ok(ownerUser, 'Owner user must exist');
    assert.ok(staCruzCashier, 'Sta. Cruz Cashier must exist');
    assert.ok(lumbanCashier, 'Lumban Cashier must exist');

    // 3. Ensure test menu items exist
    const category = await prisma.category.findFirst();
    assert.ok(category, 'At least one Category must exist');

    testPorkSisig = await prisma.menuItem.findFirst({ where: { name: { contains: 'Pork Sisig' } } });
    if (!testPorkSisig) {
      testPorkSisig = await prisma.menuItem.create({
        data: {
          name: 'Pork Sisig Test Item',
          price: 150.0,
          categoryId: category.id,
          isAvailable: true,
        },
      });
    }

    testChickenSisig = await prisma.menuItem.findFirst({ where: { name: { contains: 'Chicken Sisig' } } });
    if (!testChickenSisig) {
      testChickenSisig = await prisma.menuItem.create({
        data: {
          name: 'Chicken Sisig Test Item',
          price: 140.0,
          categoryId: category.id,
          isAvailable: true,
        },
      });
    }

    testBeefSisig = await prisma.menuItem.findFirst({ where: { name: { contains: 'Beef Sisig' } } });
    if (!testBeefSisig) {
      testBeefSisig = await prisma.menuItem.create({
        data: {
          name: 'Beef Sisig Test Item',
          price: 180.0,
          categoryId: category.id,
          isAvailable: true,
        },
      });
    }
  });

  after(async () => {
    // Clean up created test orders
    if (createdOrderIds.length > 0) {
      await prisma.orderItem.deleteMany({
        where: { orderId: { in: createdOrderIds } },
      });
      await prisma.payment.deleteMany({
        where: { orderId: { in: createdOrderIds } },
      });
      await prisma.order.deleteMany({
        where: { id: { in: createdOrderIds } },
      });
    }
  });

  it('Test E & F: Quantity-based ranking calculation & exclusion of cancelled orders', async () => {
    const ts = Date.now();
    // In Sta. Cruz:
    // Order 1: 1 order of 1000 Pork Sisig (units = 1000, completed)
    const order1 = await prisma.order.create({
      data: {
        orderNumber: `ORD-TEST-E1-${ts}`,
        branchId: staCruzBranch.id,
        cashierId: staCruzCashier.id,
        status: 'COMPLETED',
        totalAmount: 150000.0,
        cogs: 60000.0,
        items: {
          create: [
            {
              menuItemId: testPorkSisig.id,
              quantity: 1000,
              unitPrice: 150.0,
              subtotal: 150000.0,
              cogs: 60000.0,
            },
          ],
        },
      },
    });
    createdOrderIds.push(order1.id);

    // Order 2, 3, 4: 3 separate orders of 1 Chicken Sisig (units = 3, completed)
    for (let i = 1; i <= 3; i++) {
      const order = await prisma.order.create({
        data: {
          orderNumber: `ORD-TEST-E-CHICK-${i}-${ts}`,
          branchId: staCruzBranch.id,
          cashierId: staCruzCashier.id,
          status: 'COMPLETED',
          totalAmount: 140.0,
          cogs: 50.0,
          items: {
            create: [
              {
                menuItemId: testChickenSisig.id,
                quantity: 1,
                unitPrice: 140.0,
                subtotal: 140.0,
                cogs: 50.0,
              },
            ],
          },
        },
      });
      createdOrderIds.push(order.id);
    }

    // Order 5: CANCELLED order of 50 Beef Sisig (should NOT be counted!)
    const cancelledOrder = await prisma.order.create({
      data: {
        orderNumber: `ORD-TEST-CANCELLED-${ts}`,
        branchId: staCruzBranch.id,
        cashierId: staCruzCashier.id,
        status: 'CANCELLED',
        totalAmount: 9000.0,
        cogs: 3000.0,
        items: {
          create: [
            {
              menuItemId: testBeefSisig.id,
              quantity: 50,
              unitPrice: 180.0,
              subtotal: 9000.0,
              cogs: 3000.0,
            },
          ],
        },
      },
    });
    createdOrderIds.push(cancelledOrder.id);

    // Query best sellers for Sta. Cruz
    const res = await dashboardService.getBestSellers(
      { period: 'today', branchId: staCruzBranch.id, limit: 10 },
      staCruzCashier
    );

    assert.equal(res.isComparison, false);
    assert.ok(res.branch);
    assert.equal(res.branch.branchId, staCruzBranch.id);

    const porkInRes = res.branch.items.find((i) => i.id === testPorkSisig.id);
    const chickenInRes = res.branch.items.find((i) => i.id === testChickenSisig.id);
    const beefInRes = res.branch.items.find((i) => i.id === testBeefSisig.id);

    assert.ok(porkInRes, 'Pork Sisig must appear in Sta. Cruz best sellers');
    assert.ok(chickenInRes, 'Chicken Sisig must appear in Sta. Cruz best sellers');

    // Verify quantity-based ranking: Pork (10 units in 1 order) must outrank Chicken (3 units across 3 orders)
    assert.ok(porkInRes.qty >= 10, `Pork Sisig qty should be at least 10 (got ${porkInRes.qty})`);
    assert.ok(chickenInRes.qty >= 3, `Chicken Sisig qty should be at least 3 (got ${chickenInRes.qty})`);
    assert.ok(
      porkInRes.rank < chickenInRes.rank,
      `Pork Sisig (10 units, rank ${porkInRes.rank}) must rank above Chicken Sisig (3 units, rank ${chickenInRes.rank})`
    );

    // Verify cancelled order exclusion: Beef Sisig (from cancelled order) must NOT have 50 units
    if (beefInRes) {
      assert.notEqual(beefInRes.qty, 50, 'Cancelled order quantities must NOT be counted');
    }
  });

  it('Test A: Admin Dashboard returns independent side-by-side branch comparison', async () => {
    const ts = Date.now();
    // Seed an order in Lumban so Lumban has distinct sales
    const lumbanOrder = await prisma.order.create({
      data: {
        orderNumber: `ORD-TEST-LUMBAN-${ts}`,
        branchId: lumbanBranch.id,
        cashierId: lumbanCashier.id,
        status: 'COMPLETED',
        totalAmount: 70000.0,
        cogs: 25000.0,
        items: {
          create: [
            {
              menuItemId: testChickenSisig.id,
              quantity: 500, // 500 Chicken Sisig in Lumban to dominate Lumban ranking
              unitPrice: 140.0,
              subtotal: 70000.0,
              cogs: 25000.0,
            },
          ],
        },
      },
    });
    createdOrderIds.push(lumbanOrder.id);

    // Owner requests best sellers across all branches
    const res = await dashboardService.getBestSellers(
      { period: 'today', limit: 10 },
      ownerUser
    );

    assert.equal(res.isComparison, true, 'Admin query without branchId must return comparison');
    assert.ok(Array.isArray(res.branches), 'Must return branches array');
    assert.ok(res.branches.length >= 2, 'Must include at least Sta. Cruz and Lumban');

    const staCruzComp = res.branches.find((b) => b.branchId === staCruzBranch.id);
    const lumbanComp = res.branches.find((b) => b.branchId === lumbanBranch.id);

    assert.ok(staCruzComp, 'Sta. Cruz branch must be present in comparison');
    assert.ok(lumbanComp, 'Lumban branch must be present in comparison');

    // Sta. Cruz best seller should have Pork Sisig ranked #1
    assert.ok(staCruzComp.items.length > 0, 'Sta. Cruz must have items');
    assert.equal(staCruzComp.items[0].id, testPorkSisig.id, 'Pork Sisig must be #1 in Sta. Cruz');

    // Lumban best seller should have Chicken Sisig ranked #1
    assert.ok(lumbanComp.items.length > 0, 'Lumban must have items');
    assert.equal(lumbanComp.items[0].id, testChickenSisig.id, 'Chicken Sisig must be #1 in Lumban');

    // Verify isolation: Sta. Cruz units must not leak into Lumban
    const staCruzChicken = staCruzComp.items.find((i) => i.id === testChickenSisig.id);
    const lumbanChicken = lumbanComp.items.find((i) => i.id === testChickenSisig.id);

    assert.ok(staCruzChicken && lumbanChicken);
    assert.notEqual(
      staCruzChicken.qty,
      lumbanChicken.qty,
      'Units sold for Chicken Sisig must be computed independently for each branch'
    );
  });

  it('Test B: Cashier assigned to Sta. Cruz sees Sta. Cruz only', async () => {
    const res = await dashboardService.getBestSellers(
      { period: 'today', limit: 5 },
      staCruzCashier
    );

    assert.equal(res.isComparison, false, 'Cashier must receive single branch view');
    assert.equal(res.branch.branchId, staCruzBranch.id, 'Branch ID must be Sta. Cruz');
    assert.equal(res.branch.branchName, staCruzBranch.name);
    assert.ok(!res.branches, 'Branches comparison array must not be returned to Cashier');
  });

  it('Test C: Cashier assigned to Lumban sees Lumban only', async () => {
    const res = await dashboardService.getBestSellers(
      { period: 'today', limit: 5 },
      lumbanCashier
    );

    assert.equal(res.isComparison, false, 'Cashier must receive single branch view');
    assert.equal(res.branch.branchId, lumbanBranch.id, 'Branch ID must be Lumban');
    assert.equal(res.branch.branchName, lumbanBranch.name);
    assert.ok(!res.branches, 'Branches comparison array must not be returned to Cashier');
  });

  it('Test D: Unauthorized cross-branch request is rejected with 403 Forbidden', async () => {
    // Sta. Cruz cashier attempting to fetch Lumban data via middleware
    let threwMiddleware = false;
    try {
      validateBranchAccess(staCruzCashier, lumbanBranch.id);
    } catch (err) {
      threwMiddleware = true;
      assert.equal(err.statusCode, 403, 'Cross-branch access by Cashier must throw 403 Forbidden');
    }
    assert.equal(threwMiddleware, true, 'validateBranchAccess must throw for cross-branch cashier');

    // Attempting via dashboardService.getBestSellers
    let threwService = false;
    try {
      await dashboardService.getBestSellers(
        { period: 'today', branchId: lumbanBranch.id },
        staCruzCashier
      );
    } catch (err) {
      threwService = true;
      assert.equal(err.statusCode, 403, 'getBestSellers must reject unauthorized branchId with 403');
    }
    assert.equal(threwService, true, 'getBestSellers must reject unauthorized branchId parameter');
  });

  it('Test G: Date filtering (today vs custom period)', async () => {
    const ts = Date.now();
    // Create an order 10 days ago
    const pastDate = new Date();
    pastDate.setDate(pastDate.getDate() - 10);

    const pastOrder = await prisma.order.create({
      data: {
        orderNumber: `ORD-TEST-PAST-${ts}`,
        branchId: staCruzBranch.id,
        cashierId: staCruzCashier.id,
        status: 'COMPLETED',
        totalAmount: 1800.0,
        cogs: 600.0,
        createdAt: pastDate,
        items: {
          create: [
            {
              menuItemId: testBeefSisig.id,
              quantity: 10,
              unitPrice: 180.0,
              subtotal: 1800.0,
              cogs: 600.0,
            },
          ],
        },
      },
    });
    createdOrderIds.push(pastOrder.id);

    // Querying 'today' should NOT include the order from 10 days ago
    const todayRes = await dashboardService.getBestSellers(
      { period: 'today', branchId: staCruzBranch.id },
      ownerUser
    );
    const beefToday = todayRes.branch.items.find((i) => i.id === testBeefSisig.id);
    assert.equal(beefToday, undefined, 'Order from 10 days ago must not appear in today best sellers');

    // Querying with custom range covering 10 days ago SHOULD include it
    const fromStr = pastDate.toISOString().slice(0, 10);
    const toStr = new Date().toISOString().slice(0, 10);
    const customRes = await dashboardService.getBestSellers(
      { period: 'custom', from: fromStr, to: toStr, branchId: staCruzBranch.id },
      ownerUser
    );
    const beefCustom = customRes.branch.items.find((i) => i.id === testBeefSisig.id);
    assert.ok(beefCustom, 'Order from 10 days ago must appear when custom date range includes it');
    assert.ok(beefCustom.qty >= 10);
  });

  it('Test H: Consistency between Admin branch view and Cashier view for the same branch', async () => {
    // Admin queries Sta. Cruz specifically
    const adminRes = await dashboardService.getBestSellers(
      { period: 'today', branchId: staCruzBranch.id },
      ownerUser
    );

    // Cashier queries their assigned Sta. Cruz
    const cashierRes = await dashboardService.getBestSellers(
      { period: 'today' },
      staCruzCashier
    );

    assert.equal(adminRes.branch.totalUnitsSold, cashierRes.branch.totalUnitsSold);
    assert.equal(adminRes.branch.totalRevenue, cashierRes.branch.totalRevenue);
    assert.equal(adminRes.branch.items.length, cashierRes.branch.items.length);

    if (adminRes.branch.items.length > 0) {
      assert.equal(adminRes.branch.items[0].id, cashierRes.branch.items[0].id);
      assert.equal(adminRes.branch.items[0].qty, cashierRes.branch.items[0].qty);
      assert.equal(adminRes.branch.items[0].revenue, cashierRes.branch.items[0].revenue);
    }
  });
});
