// tests/transfer-serving-synchronization.test.js
// Production-grade verification of Recipe-Based POS Available Servings
// Synchronization with Branch Ingredient Stock Transfers.

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const prisma = require('../src/config/db');
const inventoryService = require('../src/modules/inventory/inventory.service');
const menuService = require('../src/modules/menu/menu.service');
const orderService = require('../src/modules/orders/order.service');

describe("Harvey's Sisigan — POS Product Servings & Branch Stock Transfer Sync Test Suite", () => {
  let ownerUser;
  let branchA;
  let branchB;
  let branchC;

  let testCategory;
  let barkadaMeatIng;
  let barkadaSauceIng;
  let gramMeatIng;

  let barkadaProduct;
  let comboProduct;
  let gramProduct;

  const createdTransferIds = [];
  const createdOrderIds = [];
  const testTag = `TEST_SYNC_${Date.now()}`;

  before(async () => {
    // 1. Fetch owner
    ownerUser = await prisma.user.findFirst({ where: { role: 'OWNER' } });
    assert.ok(ownerUser, 'Owner user must exist');

    // 2. Fetch branches
    const branches = await prisma.branch.findMany({ where: { isActive: true }, take: 3 });
    assert.ok(branches.length >= 2, 'At least 2 active branches required');
    branchA = branches[0];
    branchB = branches[1];

    if (branches.length >= 3) {
      branchC = branches[2];
    } else {
      branchC = await prisma.branch.create({
        data: {
          name: `Isolation Branch ${testTag}`,
          city: 'Paete',
          address: 'Test Address',
          phone: '09123456789',
          isActive: true,
        },
      });
    }

    // 3. Create test category
    testCategory = await prisma.category.create({
      data: {
        name: `Test Sync Cat ${testTag}`,
        sortOrder: 999,
      },
    });

    // 4. Create Ingredients:
    // - Barkada Meat (unit: PCS, 1 unit per serving)
    barkadaMeatIng = await prisma.ingredient.create({
      data: {
        name: `Barkada Meat (${testTag})`,
        category: 'MAIN_INGREDIENT',
        unit: 'PCS',
        defaultPrice: 50.00,
        defaultMinThreshold: 10,
      },
    });

    // - Barkada Sauce (unit: PCS, 2 units per serving)
    barkadaSauceIng = await prisma.ingredient.create({
      data: {
        name: `Barkada Sauce (${testTag})`,
        category: 'SAUCE',
        unit: 'PCS',
        defaultPrice: 15.00,
        defaultMinThreshold: 10,
      },
    });

    // - Gram Meat (unit: GRAM, 100g per serving)
    gramMeatIng = await prisma.ingredient.create({
      data: {
        name: `Gram Meat (${testTag})`,
        category: 'MAIN_INGREDIENT',
        unit: 'GRAM',
        gramsPerUnit: 100,
        defaultPrice: 0.35,
        defaultMinThreshold: 500,
      },
    });

    // 5. Create Menu Items:
    // - Barkada Product (requires 1 unit of Barkada Meat)
    barkadaProduct = await prisma.menuItem.create({
      data: {
        name: `Barkada Sisig (${testTag})`,
        price: 250.00,
        categoryId: testCategory.id,
        isAvailable: true,
      },
    });
    await prisma.menuItemRecipeIngredient.create({
      data: {
        menuItemId: barkadaProduct.id,
        ingredientId: barkadaMeatIng.id,
        quantity: 1,
        unit: 'PCS',
        yieldFactor: 1,
      },
    });

    // - Combo Product (requires 1 unit Meat AND 2 units Sauce)
    comboProduct = await prisma.menuItem.create({
      data: {
        name: `Combo Platter (${testTag})`,
        price: 320.00,
        categoryId: testCategory.id,
        isAvailable: true,
      },
    });
    await prisma.menuItemRecipeIngredient.create({
      data: {
        menuItemId: comboProduct.id,
        ingredientId: barkadaMeatIng.id,
        quantity: 1,
        unit: 'PCS',
        yieldFactor: 1,
      },
    });
    await prisma.menuItemRecipeIngredient.create({
      data: {
        menuItemId: comboProduct.id,
        ingredientId: barkadaSauceIng.id,
        quantity: 2,
        unit: 'PCS',
        yieldFactor: 1,
      },
    });

    // - Gram Product (requires 100g of Gram Meat)
    gramProduct = await prisma.menuItem.create({
      data: {
        name: `Gram Sisig Rice (${testTag})`,
        price: 130.00,
        categoryId: testCategory.id,
        isAvailable: true,
      },
    });
    await prisma.menuItemRecipeIngredient.create({
      data: {
        menuItemId: gramProduct.id,
        ingredientId: gramMeatIng.id,
        quantity: 100,
        unit: 'GRAM',
        yieldFactor: 1,
      },
    });
  });

  after(async () => {
    // Cleanup created orders
    for (const orderId of createdOrderIds) {
      await prisma.payment.deleteMany({ where: { orderId } }).catch(() => {});
      await prisma.orderItem.deleteMany({ where: { orderId } }).catch(() => {});
      await prisma.order.delete({ where: { id: orderId } }).catch(() => {});
    }

    // Cleanup transfers and audit logs
    for (const transferId of createdTransferIds) {
      const trf = await prisma.inventoryTransfer.findUnique({ where: { id: transferId } }).catch(() => null);
      if (trf) {
        await prisma.inventoryAuditLog.deleteMany({ where: { referenceNo: trf.transferNo } }).catch(() => {});
        await prisma.inventoryTransfer.delete({ where: { id: transferId } }).catch(() => {});
      }
    }

    // Cleanup menu items and recipes
    const itemIds = [barkadaProduct?.id, comboProduct?.id, gramProduct?.id].filter(Boolean);
    await prisma.menuItemRecipeIngredient.deleteMany({ where: { menuItemId: { in: itemIds } } }).catch(() => {});
    await prisma.branchMenuItem.deleteMany({ where: { menuItemId: { in: itemIds } } }).catch(() => {});
    await prisma.menuItem.deleteMany({ where: { id: { in: itemIds } } }).catch(() => {});

    // Cleanup category
    if (testCategory) {
      await prisma.category.delete({ where: { id: testCategory.id } }).catch(() => {});
    }

    // Cleanup inventory items and audit logs
    const ingIds = [barkadaMeatIng?.id, barkadaSauceIng?.id, gramMeatIng?.id].filter(Boolean);
    for (const ingId of ingIds) {
      const invs = await prisma.inventoryItem.findMany({ where: { ingredientId: ingId } });
      for (const inv of invs) {
        await prisma.inventoryAuditLog.deleteMany({ where: { inventoryItemId: inv.id } }).catch(() => {});
      }
      await prisma.inventoryTransfer.deleteMany({ where: { ingredientId: ingId } }).catch(() => {});
      await prisma.inventoryItem.deleteMany({ where: { ingredientId: ingId } }).catch(() => {});
      await prisma.ingredient.delete({ where: { id: ingId } }).catch(() => {});
    }
  });

  it('Test A: Barkada Meat — Transferring 10 units of Meat deducts 10 from Branch A and reduces POS servings from 100 to 90', async () => {
    // Branch A: Seed 100 units of Meat (Recipe requires 1 unit/serving -> 100 servings)
    await prisma.inventoryItem.upsert({
      where: { branchId_ingredientId: { branchId: branchA.id, ingredientId: barkadaMeatIng.id } },
      update: { quantity: 100, price: 50.00 },
      create: { branchId: branchA.id, ingredientId: barkadaMeatIng.id, quantity: 100, price: 50.00 },
    });

    // Branch B: Seed 20 units of Meat
    await prisma.inventoryItem.upsert({
      where: { branchId_ingredientId: { branchId: branchB.id, ingredientId: barkadaMeatIng.id } },
      update: { quantity: 20, price: 50.00 },
      create: { branchId: branchB.id, ingredientId: barkadaMeatIng.id, quantity: 20, price: 50.00 },
    });

    // Verify Initial Branch A POS availability: exactly 100 servings
    const initialBranchA = await menuService.checkMenuItemStock(barkadaProduct.id, branchA.id);
    assert.equal(initialBranchA.availableServings, 100, 'Initial Branch A availability must be 100 servings');
    assert.equal(initialBranchA.isStockAvailable, true);

    // Transfer 10 units of Meat from Branch A to Branch B
    const transfer = await inventoryService.transferInventory(
      {
        sourceBranchId: branchA.id,
        destBranchId: branchB.id,
        ingredientId: barkadaMeatIng.id,
        quantity: 10,
        unit: 'PCS',
        notes: 'Transfer 10 units of Meat to Branch B',
      },
      ownerUser
    );

    assert.ok(transfer);
    assert.equal(transfer.status, 'COMPLETED');
    createdTransferIds.push(transfer.id);

    // 1. Verify Branch A Meat raw inventory: exactly 90
    const sourceInv = await prisma.inventoryItem.findUnique({
      where: { branchId_ingredientId: { branchId: branchA.id, ingredientId: barkadaMeatIng.id } },
    });
    assert.equal(Number(sourceInv.quantity), 90, 'Branch A remaining Meat must be 90 units');

    // 2. Verify Branch A POS availability: automatically 90 servings
    const postBranchA = await menuService.checkMenuItemStock(barkadaProduct.id, branchA.id);
    assert.equal(postBranchA.availableServings, 90, 'Branch A POS availability must automatically be 90 servings');

    // 3. Verify transfer affectedProducts payload
    assert.ok(transfer.affectedProducts, 'Transfer response must include affectedProducts synchronization summary');
    const sourceSummary = transfer.affectedProducts.sourceBranch.find((p) => p.menuItemId === barkadaProduct.id);
    assert.ok(sourceSummary, 'Barkada Product must be in source affected products');
    assert.equal(sourceSummary.previousServings, 100);
    assert.equal(sourceSummary.availableServings, 90);
    assert.equal(sourceSummary.difference, -10);
  });

  it('Test B: Destination Branch — Receives 10 units of Meat and POS availability automatically increases from 20 to 30', async () => {
    // 1. Verify Branch B Meat raw inventory: 20 + 10 = 30
    const destInv = await prisma.inventoryItem.findUnique({
      where: { branchId_ingredientId: { branchId: branchB.id, ingredientId: barkadaMeatIng.id } },
    });
    assert.equal(Number(destInv.quantity), 30, 'Branch B received Meat must be 30 units');

    // 2. Verify Branch B POS availability: automatically 30 servings
    const postBranchB = await menuService.checkMenuItemStock(barkadaProduct.id, branchB.id);
    assert.equal(postBranchB.availableServings, 30, 'Branch B POS availability must automatically be 30 servings');
  });

  it('Test C: Multiple Recipe Ingredients — Non-limiting ingredient transfer does not change servings; limiting ingredient transfer reduces servings', async () => {
    // Combo Platter requires: 1 Meat AND 2 Sauce
    // In Branch A:
    // Meat currently: 90 units (90 / 1 = 90 possible servings)
    // Seed Sauce: 150 units (150 / 2 = 75 possible servings)
    // Limiting ingredient is Sauce -> Available servings = 75
    await prisma.inventoryItem.upsert({
      where: { branchId_ingredientId: { branchId: branchA.id, ingredientId: barkadaSauceIng.id } },
      update: { quantity: 150, price: 15.00 },
      create: { branchId: branchA.id, ingredientId: barkadaSauceIng.id, quantity: 150, price: 15.00 },
    });

    const initialCombo = await menuService.checkMenuItemStock(comboProduct.id, branchA.id);
    assert.equal(initialCombo.availableServings, 75, 'Initial Combo availability must be 75 servings (limited by Sauce)');
    assert.equal(initialCombo.limitingIngredient.name, barkadaSauceIng.name);

    // Part 1: Transfer 10 units of Meat (non-limiting ingredient: Meat drops from 90 to 80, still > 75)
    const transferMeat = await inventoryService.transferInventory(
      {
        sourceBranchId: branchA.id,
        destBranchId: branchB.id,
        ingredientId: barkadaMeatIng.id,
        quantity: 10,
        unit: 'PCS',
        notes: 'Transfer 10 Meat (non-limiting)',
      },
      ownerUser
    );
    createdTransferIds.push(transferMeat.id);

    // POS availability must REMAINS 75 because Sauce is still the bottleneck (75 servings)
    const midCombo = await menuService.checkMenuItemStock(comboProduct.id, branchA.id);
    assert.equal(midCombo.availableServings, 75, 'Combo servings must remain 75 after transferring non-limiting ingredient');

    // Part 2: Transfer 20 units of Sauce (limiting ingredient: Sauce drops from 150 to 130)
    // New Sauce servings = Floor(130 / 2) = 65 servings
    const transferSauce = await inventoryService.transferInventory(
      {
        sourceBranchId: branchA.id,
        destBranchId: branchB.id,
        ingredientId: barkadaSauceIng.id,
        quantity: 20,
        unit: 'PCS',
        notes: 'Transfer 20 Sauce (limiting)',
      },
      ownerUser
    );
    createdTransferIds.push(transferSauce.id);

    // POS availability must now drop to 65 servings
    const postCombo = await menuService.checkMenuItemStock(comboProduct.id, branchA.id);
    assert.equal(postCombo.availableServings, 65, 'Combo servings must reduce to 65 when limiting ingredient is transferred');
    assert.equal(postCombo.limitingIngredient.name, barkadaSauceIng.name);
  });

  it('Test D: Gram-Based Recipe — Transferring 1,000 grams out of 10,000 grams reduces POS availability from 100 to 90', async () => {
    // Gram Meat recipe: 100g per serving
    // Branch A: Seed 10,000 grams -> 100 servings
    await prisma.inventoryItem.upsert({
      where: { branchId_ingredientId: { branchId: branchA.id, ingredientId: gramMeatIng.id } },
      update: { quantity: 10000, price: 0.35 },
      create: { branchId: branchA.id, ingredientId: gramMeatIng.id, quantity: 10000, price: 0.35 },
    });

    // Branch B: Seed 2,000 grams -> 20 servings
    await prisma.inventoryItem.upsert({
      where: { branchId_ingredientId: { branchId: branchB.id, ingredientId: gramMeatIng.id } },
      update: { quantity: 2000, price: 0.35 },
      create: { branchId: branchB.id, ingredientId: gramMeatIng.id, quantity: 2000, price: 0.35 },
    });

    const initialGramA = await menuService.checkMenuItemStock(gramProduct.id, branchA.id);
    assert.equal(initialGramA.availableServings, 100, 'Initial Gram Sisig availability must be 100 servings');

    // Transfer 1,000 grams (10 orders @ 100g/unit)
    const transferGram = await inventoryService.transferInventory(
      {
        sourceBranchId: branchA.id,
        destBranchId: branchB.id,
        ingredientId: gramMeatIng.id,
        inputQuantity: 10,
        inputUnit: 'ORDERS',
        quantity: 10,
        unit: 'GRAM',
        notes: 'Transfer 10 orders (1,000 grams) of meat',
      },
      ownerUser
    );
    createdTransferIds.push(transferGram.id);

    // 1. Verify remaining stock in Branch A: 10,000 - 1,000 = 9,000 grams
    const sourceGramInv = await prisma.inventoryItem.findUnique({
      where: { branchId_ingredientId: { branchId: branchA.id, ingredientId: gramMeatIng.id } },
    });
    assert.equal(Number(sourceGramInv.quantity), 9000, 'Branch A remaining Gram Meat must be 9,000g');

    // 2. Verify POS availability in Branch A: 9,000 / 100 = 90 servings
    const postGramA = await menuService.checkMenuItemStock(gramProduct.id, branchA.id);
    assert.equal(postGramA.availableServings, 90, 'Branch A POS availability must be 90 servings');

    // 3. Verify Branch B: 2,000 + 1,000 = 3,000g -> 30 servings
    const destGramInv = await prisma.inventoryItem.findUnique({
      where: { branchId_ingredientId: { branchId: branchB.id, ingredientId: gramMeatIng.id } },
    });
    assert.equal(Number(destGramInv.quantity), 3000, 'Branch B Gram Meat must be 3,000g');
    const postGramB = await menuService.checkMenuItemStock(gramProduct.id, branchB.id);
    assert.equal(postGramB.availableServings, 30, 'Branch B POS availability must be 30 servings');
  });

  it('Test E: Existing Sales and Reservations — Order deduction and stock transfer interact without double-counting', async () => {
    // Current Branch A Gram Meat: 9,000 grams (90 servings)
    // Place an order for 5 servings (500 grams deducted)
    const order = await orderService.createOrder({
      items: [{ menuItemId: gramProduct.id, quantity: 5 }],
      type: 'DINE_IN',
      branchId: branchA.id,
      cashierId: ownerUser.id,
    });
    createdOrderIds.push(order.id);

    // After order: 9,000 - 500 = 8,500 grams -> 85 servings
    const afterOrderA = await menuService.checkMenuItemStock(gramProduct.id, branchA.id);
    assert.equal(afterOrderA.availableServings, 85, 'POS availability must drop to 85 after selling 5 servings');

    // Now transfer 500 grams (5 orders @ 100g) to Branch B
    const transfer = await inventoryService.transferInventory(
      {
        sourceBranchId: branchA.id,
        destBranchId: branchB.id,
        ingredientId: gramMeatIng.id,
        inputQuantity: 5,
        inputUnit: 'ORDERS',
        quantity: 5,
        unit: 'GRAM',
        notes: 'Transfer 5 orders (500g) after sale',
      },
      ownerUser
    );
    createdTransferIds.push(transfer.id);

    // After transfer: 8,500 - 500 = 8,000 grams -> 80 servings
    const afterTransferA = await menuService.checkMenuItemStock(gramProduct.id, branchA.id);
    assert.equal(afterTransferA.availableServings, 80, 'POS availability must drop to 80 after transferring 500g');

    // Now cancel the order (restores 500 grams back to Branch A)
    await orderService.cancelOrder(order.id, {
      userRole: 'OWNER',
      userBranchId: branchA.id,
      actorUserId: ownerUser.id,
    });

    // After order cancellation: 8,000 + 500 = 8,500 grams -> 85 servings restored!
    const afterCancelA = await menuService.checkMenuItemStock(gramProduct.id, branchA.id);
    assert.equal(afterCancelA.availableServings, 85, 'POS availability must restore to 85 after order cancellation');
  });

  it('Test F: Multi-Branch Stock Isolation — Transfers between A and B do not modify unrelated Branch C', async () => {
    // Branch C: Seed 50 units of Meat
    await prisma.inventoryItem.upsert({
      where: { branchId_ingredientId: { branchId: branchC.id, ingredientId: barkadaMeatIng.id } },
      update: { quantity: 50, price: 50.00 },
      create: { branchId: branchC.id, ingredientId: barkadaMeatIng.id, quantity: 50, price: 50.00 },
    });

    const initialBranchC = await menuService.checkMenuItemStock(barkadaProduct.id, branchC.id);
    assert.equal(initialBranchC.availableServings, 50, 'Branch C must initially have 50 servings');

    // Transfer between Branch A and Branch B
    const transfer = await inventoryService.transferInventory(
      {
        sourceBranchId: branchA.id,
        destBranchId: branchB.id,
        ingredientId: barkadaMeatIng.id,
        quantity: 5,
        unit: 'PCS',
        notes: 'Transfer 5 Meat between A and B',
      },
      ownerUser
    );
    createdTransferIds.push(transfer.id);

    // Verify Branch C remains completely unchanged (still 50 servings)
    const postBranchC = await menuService.checkMenuItemStock(barkadaProduct.id, branchC.id);
    assert.equal(postBranchC.availableServings, 50, 'Branch C servings must remain completely isolated and unchanged');

    const invC = await prisma.inventoryItem.findUnique({
      where: { branchId_ingredientId: { branchId: branchC.id, ingredientId: barkadaMeatIng.id } },
    });
    assert.equal(Number(invC.quantity), 50, 'Branch C ingredient stock must remain 50');
  });

  it('Test G: Transfer Cancellation Reversal — Reversing a transfer restores raw stock and POS servings for both branches', async () => {
    // Capture pre-transfer servings
    const preTransferA = await menuService.checkMenuItemStock(barkadaProduct.id, branchA.id);
    const preTransferB = await menuService.checkMenuItemStock(barkadaProduct.id, branchB.id);

    // Perform a transfer of 15 units of Meat
    const transfer = await inventoryService.transferInventory(
      {
        sourceBranchId: branchA.id,
        destBranchId: branchB.id,
        ingredientId: barkadaMeatIng.id,
        quantity: 15,
        unit: 'PCS',
        notes: 'Transfer 15 Meat to be reversed',
      },
      ownerUser
    );

    // Cancel the transfer
    const cancelled = await inventoryService.cancelTransfer(transfer.id, ownerUser);
    assert.equal(cancelled.status, 'CANCELLED');
    assert.ok(cancelled.affectedProducts, 'Cancellation response must include affectedProducts summary');

    // Verify Branch A POS servings restored to pre-transfer state
    const restoredA = await menuService.checkMenuItemStock(barkadaProduct.id, branchA.id);
    assert.equal(restoredA.availableServings, preTransferA.availableServings, 'Branch A servings must restore to pre-transfer level');

    // Verify Branch B POS servings restored to pre-transfer state
    const restoredB = await menuService.checkMenuItemStock(barkadaProduct.id, branchB.id);
    assert.equal(restoredB.availableServings, preTransferB.availableServings, 'Branch B servings must restore to pre-transfer level');
  });
});
