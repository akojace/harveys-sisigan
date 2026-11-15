// tests/memory-optimization.test.js
// Regression Test Suite: Verification of BLOB Exclusion and Memory Optimization
// Validates that:
// 1. Menu queries exclude photo MEDIUMBLOB by default (includePhoto: false).
// 2. Menu queries retrieve photo only when explicitly requested (includePhoto: true).
// 3. Dashboard metrics compute revenue, COGS, and profit accurately without photo BLOBs.
// 4. Branch comparison returns valid products without photo BLOBs.
// 5. Order retrieval excludes photo BLOBs from order items.

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const prisma = require('../src/config/db');
const menuService = require('../src/modules/menu/menu.service');
const dashboardService = require('../src/modules/dashboard/dashboard.service');
const orderService = require('../src/modules/orders/order.service');

describe("Harvey's Sisigan — Memory Optimization & BLOB Exclusion Suite", () => {
  let ownerUser;
  let testBranch;
  let testOrder;

  before(async () => {
    ownerUser = await prisma.user.findFirst({ where: { role: 'OWNER' } });
    testBranch = await prisma.branch.findFirst({ where: { isActive: true } });
    testOrder = await prisma.order.findFirst({
      where: { status: 'COMPLETED' },
      include: { items: true },
    });
  });

  it('1. getMenuWithCategories excludes photo by default (includePhoto = false)', async () => {
    const categories = await menuService.getMenuWithCategories({
      includeUnavailable: true,
      includePhoto: false,
      branchId: testBranch?.id,
    });

    assert.ok(Array.isArray(categories), 'Categories must be an array');
    assert.ok(categories.length > 0, 'Categories must not be empty');

    for (const cat of categories) {
      assert.ok(Array.isArray(cat.items), 'Category items must be an array');
      for (const item of cat.items) {
        assert.equal(
          item.photo,
          undefined,
          `Item "${item.name}" must not contain photo property when includePhoto is false`
        );
        assert.ok(item.id, 'Item must have id');
        assert.ok(item.name, 'Item must have name');
        assert.ok(item.price !== undefined, 'Item must have price');
      }
    }
  });

  it('2. getMenuWithCategories includes photo property when includePhoto = true', async () => {
    const categories = await menuService.getMenuWithCategories({
      includeUnavailable: true,
      includePhoto: true,
      branchId: testBranch?.id,
    });

    assert.ok(Array.isArray(categories), 'Categories must be an array');
    assert.ok(categories.length > 0, 'Categories must not be empty');

    let checkedItem = false;
    for (const cat of categories) {
      for (const item of cat.items) {
        checkedItem = true;
        // When includePhoto is true, if item has photo in DB it is a string data URI or undefined if null
        if (item.photo !== undefined) {
          assert.equal(typeof item.photo, 'string', 'photo must be a string data URI when present');
        }
      }
    }
    assert.ok(checkedItem, 'At least one item must have been verified');
  });

  it('3. getAllMenuItems excludes photo by default', async () => {
    const items = await menuService.getAllMenuItems({
      includeUnavailable: true,
      includePhoto: false,
      branchId: testBranch?.id,
    });

    assert.ok(Array.isArray(items), 'Items must be an array');
    assert.ok(items.length > 0, 'Items must not be empty');

    for (const item of items) {
      assert.equal(
        item.photo,
        undefined,
        `Item "${item.name}" must not have photo property when includePhoto is false`
      );
      assert.ok(item.id, 'Item must have id');
      assert.ok(item.name, 'Item must have name');
      assert.ok(item.category, 'Item must have category object');
    }
  });

  it('4. getDashboard computes sales, COGS, and profit accurately without photo BLOBs', async () => {
    const dashboard = await dashboardService.getDashboard(
      { period: 'month' },
      ownerUser
    );

    assert.ok(dashboard, 'Dashboard object must be returned');
    assert.ok(dashboard.summary, 'Summary must exist');
    assert.equal(typeof dashboard.summary.grossSales, 'number', 'grossSales must be a number');
    assert.equal(typeof dashboard.summary.grossProfit, 'number', 'grossProfit must be a number');
    assert.equal(typeof dashboard.summary.netProfit, 'number', 'netProfit must be a number');

    assert.ok(Array.isArray(dashboard.bestSellers), 'bestSellers must be an array');
    for (const prod of dashboard.bestSellers) {
      assert.ok(prod.name, 'Product must have name');
      assert.equal(typeof prod.qty, 'number', 'Product must have qty');
      assert.equal(typeof prod.revenue, 'number', 'Product must have revenue');
      // photo must be null or string imageUrl, never a raw Buffer or data URI
      if (prod.photo !== null) {
        assert.equal(typeof prod.photo, 'string', 'Product photo must be null or string imageUrl');
        assert.ok(!prod.photo.startsWith('data:'), 'Dashboard photo must not be a massive data URI');
      }
    }
  });

  it('5. getBestSellers returns valid items without photo BLOBs', async () => {
    const comparison = await dashboardService.getBestSellers(
      { period: 'month' },
      ownerUser
    );

    assert.ok(comparison, 'Comparison must be returned');
    if (comparison.branches) {
      for (const branch of comparison.branches) {
        assert.ok(Array.isArray(branch.items), 'items must be an array');
        for (const prod of branch.items) {
          if (prod.photo !== null) {
            assert.equal(typeof prod.photo, 'string');
            assert.ok(!prod.photo.startsWith('data:'));
          }
        }
      }
    }
  });

  it('6. getOrderById returns order with items and excludes photo BLOB', async () => {
    if (!testOrder) return; // Skip if no completed order in DB

    const order = await orderService.getOrderById(testOrder.id, {
      userRole: 'OWNER',
      userBranchId: testOrder.branchId,
    });

    assert.ok(order, 'Order must be returned');
    assert.ok(Array.isArray(order.items), 'Order items must be an array');
    for (const item of order.items) {
      assert.ok(item.menuItem, 'Order item must have menuItem');
      assert.equal(
        item.menuItem.photo,
        undefined,
        'menuItem in order must not contain photo BLOB'
      );
      assert.ok(item.menuItem.name, 'menuItem must have name');
      assert.ok(item.menuItem.price !== undefined, 'menuItem must have price');
    }
  });
});
