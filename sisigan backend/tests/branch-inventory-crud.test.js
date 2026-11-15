// tests/branch-inventory-crud.test.js
// Automated Test Suite for Complete Branch CRUD & Branch-Specific Inventory CRUD

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const prisma = require('../src/config/db');
const branchService = require('../src/modules/branches/branch.service');
const inventoryService = require('../src/modules/inventory/inventory.service');

describe("Harvey's Sisigan — Branch & Inventory Safe CRUD Suite", () => {
  let ownerUser;
  let managerUser;
  let cashierUser;
  let survivingBranch1;
  let survivingBranch2;
  let sharedIngredient;
  let tempBranchId = null;

  const createdUserIds = [];
  const createdBranchIds = [];
  const createdOrderIds = [];
  const createdExpenseIds = [];
  const createdIngredientIds = [];
  const createdCategoryIds = [];
  const createdMenuItemIds = [];

  before(async () => {
    const branches = await prisma.branch.findMany({ where: { isActive: true }, orderBy: { id: 'asc' } });
    survivingBranch1 = branches[0];
    survivingBranch2 = branches[1] || branches[0];

    ownerUser = await prisma.user.findFirst({ where: { role: 'OWNER', isActive: true } });

    const ts = Date.now();
    managerUser = await prisma.user.create({
      data: {
        name: 'CRUD Test Manager',
        email: `crud.mgr.${ts}@test.local`,
        password: 'hashed_password_placeholder',
        role: 'MANAGER',
        branchId: survivingBranch1.id,
        isActive: true,
      },
    });
    createdUserIds.push(managerUser.id);

    cashierUser = await prisma.user.create({
      data: {
        name: 'CRUD Test Cashier',
        email: `crud.cashier.${ts}@test.local`,
        password: 'hashed_password_placeholder',
        role: 'CASHIER',
        branchId: survivingBranch1.id,
        isActive: true,
      },
    });
    createdUserIds.push(cashierUser.id);

    sharedIngredient = await prisma.ingredient.create({
      data: {
        name: `CRUD Shared Spice ${ts}`,
        category: 'SPICES',
        unit: 'GRAM',
        defaultMinThreshold: 50,
        defaultPrice: 10,
      },
    });
    createdIngredientIds.push(sharedIngredient.id);
  });

  after(async () => {
    if (createdExpenseIds.length) {
      await prisma.expense.deleteMany({ where: { id: { in: createdExpenseIds } } });
    }
    if (createdOrderIds.length) {
      await prisma.orderItem.deleteMany({ where: { orderId: { in: createdOrderIds } } });
      await prisma.order.deleteMany({ where: { id: { in: createdOrderIds } } });
    }
    if (createdMenuItemIds.length) {
      await prisma.menuItemRecipeIngredient.deleteMany({ where: { menuItemId: { in: createdMenuItemIds } } });
      await prisma.branchMenuItem.deleteMany({ where: { menuItemId: { in: createdMenuItemIds } } });
      await prisma.menuItem.deleteMany({ where: { id: { in: createdMenuItemIds } } });
    }
    if (createdCategoryIds.length) {
      await prisma.category.deleteMany({ where: { id: { in: createdCategoryIds } } });
    }
    if (createdUserIds.length) {
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    }
    if (createdBranchIds.length) {
      await prisma.authLog.deleteMany({ where: { branchId: { in: createdBranchIds } } });
      await prisma.branchMenuItem.deleteMany({ where: { branchId: { in: createdBranchIds } } });
      await prisma.inventoryAuditLog.deleteMany({ where: { inventoryItem: { branchId: { in: createdBranchIds } } } });
      await prisma.inventoryItem.deleteMany({ where: { branchId: { in: createdBranchIds } } });
      await prisma.branch.deleteMany({ where: { id: { in: createdBranchIds } } });
    }
    if (createdIngredientIds.length) {
      await prisma.inventoryAuditLog.deleteMany({ where: { inventoryItem: { ingredientId: { in: createdIngredientIds } } } });
      await prisma.inventoryItem.deleteMany({ where: { ingredientId: { in: createdIngredientIds } } });
      await prisma.ingredient.deleteMany({ where: { id: { in: createdIngredientIds } } });
    }
  });

  it('1. Branch CRUD: create (auto-seeds inventory), list, update, inspect dependencies, and delete branch with existing seeded inventory', async () => {
    const ts = Date.now();
    const created = await branchService.createBranch({
      name: `Temp Test Branch ${ts}`,
      address: '123 Test St',
      city: 'Laguna',
      contactNo: '09170001111',
    });
    createdBranchIds.push(created.id);
    tempBranchId = created.id;

    const list = await branchService.listBranches();
    assert.ok(list.some((b) => b.id === created.id), 'Created branch should appear in listBranches()');

    const updated = await branchService.updateBranch(created.id, {
      name: `Temp Test Branch Updated ${ts}`,
      city: 'Santa Cruz',
    });
    assert.equal(updated.name, `Temp Test Branch Updated ${ts}`);
    assert.equal(updated.city, 'Santa Cruz');

    const deps = await branchService.getBranchDependencies(created.id);
    assert.equal(deps.isFinalBranch, false);
    assert.ok(deps.previewCounts.inventoryItems >= 1, 'Seeded branch should have inventory items');

    const deleted = await branchService.deleteBranch(created.id, ownerUser);
    assert.equal(deleted.deletedBranchId, created.id);
    assert.ok(deleted.deletedRecords.inventoryItems >= 1);

    const afterList = await branchService.listBranches();
    assert.equal(afterList.some((b) => b.id === created.id), false, 'Deleted branch must disappear from list');

    // Shared ingredient must still exist
    const stillExists = await prisma.ingredient.findUnique({ where: { id: sharedIngredient.id } });
    assert.ok(stillExists, 'Deleting branch must not delete shared ingredients');
  });

  it('2. Full branch cascade delete removes orders, orderItems, payments, employees, authLogs, passwordResets, expenses, transfers, inventory & auditLogs while preserving surviving branches and shared data', async () => {
    const ts = Date.now();
    const cat = await prisma.category.create({ data: { name: `Cascade Cat ${ts}` } });
    createdCategoryIds.push(cat.id);

    const menu = await prisma.menuItem.create({
      data: {
        name: `Cascade Dish ${ts}`,
        price: 150,
        categoryId: cat.id,
        recipes: { create: [{ ingredientId: sharedIngredient.id, quantity: 5 }] },
      },
    });
    createdMenuItemIds.push(menu.id);

    const targetBranch = await branchService.createBranch({
      name: `Cascade Target ${ts}`,
      address: '456 Cascade Ave',
      city: 'Paete',
    });
    createdBranchIds.push(targetBranch.id);

    // Branch-specific employees, auth logs, password resets
    const branchCashier = await prisma.user.create({
      data: {
        name: 'Target Cashier',
        email: `cascade.cashier.${ts}@test.local`,
        password: 'hashed_password_placeholder',
        role: 'CASHIER',
        branchId: targetBranch.id,
        isActive: true,
      },
    });
    createdUserIds.push(branchCashier.id);

    await prisma.authLog.create({
      data: {
        userId: branchCashier.id,
        branchId: targetBranch.id,
        role: 'CASHIER',
        action: 'LOGIN',
      },
    });

    await prisma.passwordReset.create({
      data: {
        userId: branchCashier.id,
        code: '123456',
        expiresAt: new Date(Date.now() + 3600000),
      },
    });

    // Branch-specific order, orderItem, payment
    const order = await prisma.order.create({
      data: {
        orderNumber: `ORD-CASC-${ts}`,
        status: 'COMPLETED',
        type: 'DINE_IN',
        totalAmount: 150,
        branchId: targetBranch.id,
        cashierId: branchCashier.id,
        items: {
          create: [{ menuItemId: menu.id, quantity: 1, unitPrice: 150, subtotal: 150 }],
        },
        payments: {
          create: [{ method: 'CASH', amountPaid: 150, change: 0 }],
        },
      },
    });
    createdOrderIds.push(order.id);

    // Branch-specific expense & inter-branch transfer
    const expense = await prisma.expense.create({
      data: {
        branchId: targetBranch.id,
        category: 'UTILITIES',
        amount: 300,
        description: 'Cascade expense',
        actorUserId: branchCashier.id,
      },
    });
    createdExpenseIds.push(expense.id);

    await prisma.inventoryTransfer.create({
      data: {
        transferNo: `TRF-CASC-${ts}`,
        sourceBranchId: survivingBranch1.id,
        destBranchId: targetBranch.id,
        ingredientId: sharedIngredient.id,
        quantity: 10,
        unit: 'GRAM',
        actorUserId: ownerUser.id,
      },
    });

    // Surviving branch order count snapshot before deletion
    const survivingOrdersBefore = await prisma.order.count({ where: { branchId: survivingBranch1.id } });

    const deps = await branchService.getBranchDependencies(targetBranch.id);
    assert.equal(deps.previewCounts.employees, 1);
    assert.equal(deps.previewCounts.orders, 1);
    assert.equal(deps.previewCounts.orderItems, 1);
    assert.equal(deps.previewCounts.payments, 1);
    assert.equal(deps.previewCounts.expenses, 1);
    assert.equal(deps.previewCounts.inventoryTransfers, 1);

    const res = await branchService.deleteBranch(targetBranch.id, ownerUser);
    assert.equal(res.deletedBranchId, targetBranch.id);
    assert.equal(res.deletedRecords.employees, 1);
    assert.equal(res.deletedRecords.orders, 1);
    assert.equal(res.deletedRecords.orderItems, 1);
    assert.equal(res.deletedRecords.payments, 1);
    assert.equal(res.deletedRecords.expenses, 1);
    assert.equal(res.deletedRecords.inventoryTransfers, 1);
    assert.equal(res.deletedRecords.authLogs, 1);
    assert.equal(res.deletedRecords.passwordResets, 1);
    assert.ok(res.deletedRecords.inventoryItems >= 1);
    assert.ok(res.deletedRecords.inventoryAuditLogs >= 1);

    // Verify deleted records are gone
    assert.equal(await prisma.branch.findUnique({ where: { id: targetBranch.id } }), null);
    assert.equal(await prisma.user.findUnique({ where: { id: branchCashier.id } }), null);
    assert.equal(await prisma.order.findUnique({ where: { id: order.id } }), null);

    // Verify shared records & surviving branch records are untouched
    assert.ok(await prisma.ingredient.findUnique({ where: { id: sharedIngredient.id } }));
    assert.ok(await prisma.menuItem.findUnique({ where: { id: menu.id } }));
    assert.ok(
      await prisma.menuItemRecipeIngredient.findFirst({
        where: { menuItemId: menu.id, ingredientId: sharedIngredient.id },
      })
    );
    const survivingOrdersAfter = await prisma.order.count({ where: { branchId: survivingBranch1.id } });
    assert.equal(survivingOrdersAfter, survivingOrdersBefore);
  });

  it('2b. OWNER protection: requires reassignment to another branch, rolls back atomically on invalid target, and prevents deleting final branch', async () => {
    const ts = Date.now();
    const ownerBranch = await branchService.createBranch({
      name: `Owner Cascade Branch ${ts}`,
      address: '789 Owner Blvd',
      city: 'Lumban',
    });
    createdBranchIds.push(ownerBranch.id);

    const tempOwner = await prisma.user.create({
      data: {
        name: 'Protected Temp Owner',
        email: `temp.owner.${ts}@test.local`,
        password: 'hashed_password_placeholder',
        role: 'OWNER',
        branchId: ownerBranch.id,
        isActive: true,
      },
    });
    createdUserIds.push(tempOwner.id);

    const ownerDeps = await branchService.getBranchDependencies(ownerBranch.id);
    assert.equal(ownerDeps.ownersToReassign.length, 1);
    assert.equal(ownerDeps.ownersToReassign[0].id, tempOwner.id);

    // Without reassignment target -> 400 and rolls back completely
    await assert.rejects(
      branchService.deleteBranch(ownerBranch.id, ownerUser),
      (err) => err.statusCode === 400 && /reassign/i.test(err.message)
    );
    assert.ok(await prisma.branch.findUnique({ where: { id: ownerBranch.id } }), 'Branch must remain after rollback');
    assert.ok(
      (await prisma.inventoryItem.count({ where: { branchId: ownerBranch.id } })) >= 1,
      'Inventory must remain after rollback'
    );

    // With valid reassignment target -> succeeds, reassigns OWNER, and deletes branch
    const delRes = await branchService.deleteBranch(ownerBranch.id, ownerUser, {
      reassignOwnerToBranchId: survivingBranch1.id,
    });
    assert.equal(delRes.reassignedOwnersToBranchId, survivingBranch1.id);

    const reassignedOwner = await prisma.user.findUnique({ where: { id: tempOwner.id } });
    assert.ok(reassignedOwner, 'OWNER account must never be deleted');
    assert.equal(reassignedOwner.branchId, survivingBranch1.id);
  });

  it('2c. Final remaining branch protection (409 when totalBranches <= 1)', async () => {
    // Test via mocked/unit check or verify error when count <= 1
    // Note: live local DB has multiple surviving branches, so we verify the guard directly via Prisma mock
    const originalCount = prisma.branch.count;
    const originalTx = prisma.$transaction;
    try {
      prisma.$transaction = async (fn) =>
        fn({
          branch: {
            findUnique: async () => ({ id: survivingBranch1.id, name: survivingBranch1.name }),
            count: async () => 1,
          },
        });
      await assert.rejects(
        branchService.deleteBranch(survivingBranch1.id, ownerUser),
        (err) => err.statusCode === 409 && /final remaining branch/i.test(err.message)
      );
    } finally {
      prisma.branch.count = originalCount;
      prisma.$transaction = originalTx;
    }
  });

  it('3. Inventory CRUD: create, read, update, and delete unused branch inventory item while preserving shared ingredient & recipes', async () => {
    const ts = Date.now();
    const cat = await prisma.category.create({ data: { name: `CRUD Cat ${ts}` } });
    createdCategoryIds.push(cat.id);

    const menu = await prisma.menuItem.create({
      data: {
        name: `CRUD Dish ${ts}`,
        price: 120,
        categoryId: cat.id,
        recipes: { create: [{ ingredientId: sharedIngredient.id, quantity: 10 }] },
      },
    });
    createdMenuItemIds.push(menu.id);

    const createdItem = await inventoryService.createInventoryItem(
      {
        name: sharedIngredient.name,
        category: 'SPICES',
        unit: 'GRAM',
        quantity: 100,
        minThreshold: 20,
        price: 12,
        branchId: survivingBranch1.id,
      },
      ownerUser
    );

    const fetched = await inventoryService.getInventory(
      { branchId: survivingBranch1.id, search: sharedIngredient.name },
      ownerUser
    );
    assert.equal(fetched.length, 1);
    assert.equal(fetched[0].id, createdItem.id);

    const edited = await inventoryService.updateIngredientDetails(
      createdItem.id,
      { minThreshold: 30, price: 15 },
      ownerUser
    );
    assert.equal(Number(edited.minThreshold), 30);

    // Cross-branch mismatch check must reject
    if (survivingBranch1.id !== survivingBranch2.id) {
      await assert.rejects(
        inventoryService.deleteInventoryItem(createdItem.id, ownerUser, {
          branchId: survivingBranch2.id,
        }),
        (err) => err.statusCode === 403
      );
    }

    const delRes = await inventoryService.deleteInventoryItem(createdItem.id, ownerUser, {
      branchId: survivingBranch1.id,
    });
    assert.equal(delRes.deletedInventoryItemId, createdItem.id);

    // Shared ingredient, recipe, and menu item must remain intact
    const ingAfter = await prisma.ingredient.findUnique({ where: { id: sharedIngredient.id } });
    const recipeAfter = await prisma.menuItemRecipeIngredient.findFirst({
      where: { menuItemId: menu.id, ingredientId: sharedIngredient.id },
    });
    assert.ok(ingAfter, 'Shared ingredient must remain');
    assert.ok(recipeAfter, 'Shared menu recipe must remain');
  });

  it('4. Inventory deletion blocked when historical stock movements (restock / order deduction) exist', async () => {
    const item = await inventoryService.createInventoryItem(
      {
        name: sharedIngredient.name,
        category: 'SPICES',
        unit: 'GRAM',
        quantity: 50,
        minThreshold: 10,
        price: 10,
        branchId: survivingBranch1.id,
      },
      ownerUser
    );

    await inventoryService.restockInventoryItem(
      {
        itemId: item.id,
        branchId: survivingBranch1.id,
        purchaseQuantity: 25,
        purchaseCost: 250,
        note: 'Protected restock',
      },
      ownerUser
    );

    const deps = await inventoryService.getInventoryItemDependencies(item.id, ownerUser, survivingBranch1.id);
    assert.equal(deps.canDelete, false);
    assert.ok(deps.counts.movementAuditLogs >= 1);

    await assert.rejects(
      inventoryService.deleteInventoryItem(item.id, ownerUser, { branchId: survivingBranch1.id }),
      (err) => err.statusCode === 409 && /historical records exist/.test(err.message)
    );
  });

  it('5. Role permissions: MANAGER and CASHIER cannot delete branches or inventory items (403)', async () => {
    await assert.rejects(
      branchService.deleteBranch(survivingBranch1.id, managerUser),
      (err) => err.statusCode === 403
    );
    await assert.rejects(
      branchService.deleteBranch(survivingBranch1.id, cashierUser),
      (err) => err.statusCode === 403
    );
    await assert.rejects(
      inventoryService.deleteInventoryItem(1, managerUser),
      (err) => err.statusCode === 403
    );
    await assert.rejects(
      inventoryService.deleteInventoryItem(1, cashierUser),
      (err) => err.statusCode === 403
    );
  });
});
