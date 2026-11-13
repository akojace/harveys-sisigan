// tests/sellable-stock.test.js
// Production-Ready Verification Test Suite for Recipe-Based Sellable Product Stock,
// Branch-Specific Availability, and POS Concurrency/Validation.
// Covers Scenarios A through L (Section 17):
// - Test A: Limiting ingredient calculation (Pork 25, Chili Oil 20 -> 20 servings, Chili Oil limiting)
// - Test B: Branch independence (Sta. Cruz 20 vs Lumban 30)
// - Test C: Branch runs out of stock (Sta. Cruz chili oil = 0 -> Sisig out of stock; Lumban unaffected)
// - Test D: Restocking (Sta. Cruz chili oil restocked -> availability increases; Lumban unchanged)
// - Test E: Sale deduction (Selling 2 servings deducts ingredients; availability reduces; Lumban unchanged)
// - Test F: Insufficient stock rejection (Attempting to order more than available rejects with 400)
// - Test G: Shared ingredient between products (Two products sharing chili oil deduct correctly)
// - Test H: Cashier branch isolation (Sta. Cruz cashier blocked from accessing Lumban stock)
// - Test I: Admin branch comparison (Admin matrix & breakdown show both branches independently)
// - Test J: Concurrent purchase (Race condition test: two simultaneous orders for last serving; only 1 succeeds, no negative stock)
// - Test K: Recipe changes (Updating recipe quantity updates future availability without modifying past COGS)
// - Test L: Missing recipe (Product with no recipe returns 0 servings, RECIPE_NOT_CONFIGURED, and rejects orders)

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const prisma = require('../src/config/db');
const menuService = require('../src/modules/menu/menu.service');
const orderService = require('../src/modules/orders/order.service');

describe("Harvey's Sisigan — Recipe-Based Sellable Product Stock & Availability Test Suite", () => {
  let ownerUser;
  let staCruzBranch;
  let lumbanBranch;
  let staCruzCashier;
  let lumbanCashier;

  let testCategory;
  let testPorkIng;
  let testChiliIng;
  let testSpecialSauceIng;

  let testSisigClassic;
  let testSizzlingCombo;
  let testSisigNoRecipe;
  let testConcurrentSisig;

  let staCruzPorkInv;
  let staCruzChiliInv;
  let lumbanPorkInv;
  let lumbanChiliInv;
  let staCruzSauceInv;

  const createdOrderIds = [];
  const testTag = `TEST_STK_${Date.now()}`;

  before(async () => {
    // 1. Fetch branches
    staCruzBranch = await prisma.branch.findFirst({ where: { name: { contains: 'Cruz' } } });
    lumbanBranch = await prisma.branch.findFirst({ where: { name: { contains: 'Lumban' } } });
    assert.ok(staCruzBranch, 'Sta. Cruz branch must exist');
    assert.ok(lumbanBranch, 'Lumban branch must exist');

    // 2. Fetch users
    ownerUser = await prisma.user.findFirst({ where: { role: 'OWNER' } });
    staCruzCashier = await prisma.user.findFirst({
      where: { role: 'CASHIER', branchId: staCruzBranch.id },
    });
    lumbanCashier = await prisma.user.findFirst({
      where: { role: 'CASHIER', branchId: lumbanBranch.id },
    });

    if (!lumbanCashier) {
      const anyCashier = await prisma.user.findFirst({ where: { role: 'CASHIER' } });
      lumbanCashier = await prisma.user.create({
        data: {
          name: 'Lumban Test Cashier',
          email: `cashier_lumban_${Date.now()}@test.com`,
          password: anyCashier ? anyCashier.password : '$2a$10$abcdefghijklmnopqrstuvwxyz123456',
          role: 'CASHIER',
          branchId: lumbanBranch.id,
        },
      });
    }

    // 3. Create test category
    testCategory = await prisma.category.create({
      data: {
        name: `Test Cat ${testTag}`,
        sortOrder: 999,
      },
    });

    // 4. Create test ingredients
    testPorkIng = await prisma.ingredient.create({
      data: {
        name: `Pork Belly (${testTag})`,
        unit: 'GRAM',
        category: 'MAIN_INGREDIENT',
        defaultPrice: 0.35,
        defaultMinThreshold: 500,
      },
    });

    testChiliIng = await prisma.ingredient.create({
      data: {
        name: `Chili Oil (${testTag})`,
        unit: 'ML',
        category: 'SPICES',
        defaultPrice: 0.50,
        defaultMinThreshold: 50,
      },
    });

    testSpecialSauceIng = await prisma.ingredient.create({
      data: {
        name: `Special Sauce (${testTag})`,
        unit: 'PCS',
        category: 'SAUCE',
        defaultPrice: 5.0,
        defaultMinThreshold: 1,
      },
    });

    // 5. Create test menu items
    testSisigClassic = await prisma.menuItem.create({
      data: {
        name: `Sisig Classic (${testTag})`,
        categoryId: testCategory.id,
        price: 150.0,
        isAvailable: true,
      },
    });

    testSizzlingCombo = await prisma.menuItem.create({
      data: {
        name: `Sizzling Combo (${testTag})`,
        categoryId: testCategory.id,
        price: 180.0,
        isAvailable: true,
      },
    });

    testSisigNoRecipe = await prisma.menuItem.create({
      data: {
        name: `Sisig No Recipe (${testTag})`,
        categoryId: testCategory.id,
        price: 120.0,
        isAvailable: true,
      },
    });

    testConcurrentSisig = await prisma.menuItem.create({
      data: {
        name: `Concurrent Sisig (${testTag})`,
        categoryId: testCategory.id,
        price: 99.0,
        isAvailable: true,
      },
    });

    // 6. Set up recipes
    // Sisig Classic: 200g Pork, 15ml Chili Oil
    await prisma.menuItemRecipeIngredient.createMany({
      data: [
        {
          menuItemId: testSisigClassic.id,
          ingredientId: testPorkIng.id,
          quantity: 200,
          unit: 'GRAM',
          yieldFactor: 1.0,
        },
        {
          menuItemId: testSisigClassic.id,
          ingredientId: testChiliIng.id,
          quantity: 15,
          unit: 'ML',
          yieldFactor: 1.0,
        },
      ],
    });

    // Sizzling Combo: 250g Pork, 10ml Chili Oil
    await prisma.menuItemRecipeIngredient.createMany({
      data: [
        {
          menuItemId: testSizzlingCombo.id,
          ingredientId: testPorkIng.id,
          quantity: 250,
          unit: 'GRAM',
          yieldFactor: 1.0,
        },
        {
          menuItemId: testSizzlingCombo.id,
          ingredientId: testChiliIng.id,
          quantity: 10,
          unit: 'ML',
          yieldFactor: 1.0,
        },
      ],
    });

    // Concurrent Sisig: 1 Piece Special Sauce
    await prisma.menuItemRecipeIngredient.create({
      data: {
        menuItemId: testConcurrentSisig.id,
        ingredientId: testSpecialSauceIng.id,
        quantity: 1,
        unit: 'PCS',
        yieldFactor: 1.0,
      },
    });

    // 7. Seed Branch Inventory
    // Sta. Cruz: Pork 5000g (25 servings), Chili Oil 300ml (20 servings)
    staCruzPorkInv = await prisma.inventoryItem.create({
      data: {
        branchId: staCruzBranch.id,
        ingredientId: testPorkIng.id,
        quantity: 5000,
        price: 0.35,
        minThreshold: 500,
      },
    });

    staCruzChiliInv = await prisma.inventoryItem.create({
      data: {
        branchId: staCruzBranch.id,
        ingredientId: testChiliIng.id,
        quantity: 300,
        price: 0.50,
        minThreshold: 50,
      },
    });

    staCruzSauceInv = await prisma.inventoryItem.create({
      data: {
        branchId: staCruzBranch.id,
        ingredientId: testSpecialSauceIng.id,
        quantity: 1,
        price: 5.0,
        minThreshold: 1,
      },
    });

    // Lumban: Pork 7000g (35 servings), Chili Oil 450ml (30 servings)
    lumbanPorkInv = await prisma.inventoryItem.create({
      data: {
        branchId: lumbanBranch.id,
        ingredientId: testPorkIng.id,
        quantity: 7000,
        price: 0.35,
        minThreshold: 500,
      },
    });

    lumbanChiliInv = await prisma.inventoryItem.create({
      data: {
        branchId: lumbanBranch.id,
        ingredientId: testChiliIng.id,
        quantity: 450,
        price: 0.50,
        minThreshold: 50,
      },
    });
  });

  after(async () => {
    // Cleanup orders and audit logs
    if (createdOrderIds.length > 0) {
      await prisma.inventoryAuditLog.deleteMany({
        where: { orderId: { in: createdOrderIds } },
      });
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

    // Cleanup inventory audit logs for test items
    await prisma.inventoryAuditLog.deleteMany({
      where: {
        inventoryItemId: {
          in: [
            staCruzPorkInv.id,
            staCruzChiliInv.id,
            staCruzSauceInv.id,
            lumbanPorkInv.id,
            lumbanChiliInv.id,
          ],
        },
      },
    });

    // Cleanup inventory items
    await prisma.inventoryItem.deleteMany({
      where: {
        id: {
          in: [
            staCruzPorkInv.id,
            staCruzChiliInv.id,
            staCruzSauceInv.id,
            lumbanPorkInv.id,
            lumbanChiliInv.id,
          ],
        },
      },
    });

    // Cleanup recipes
    await prisma.menuItemRecipeIngredient.deleteMany({
      where: {
        menuItemId: {
          in: [
            testSisigClassic.id,
            testSizzlingCombo.id,
            testSisigNoRecipe.id,
            testConcurrentSisig.id,
          ],
        },
      },
    });

    // Cleanup menu items
    await prisma.branchMenuItem.deleteMany({
      where: {
        menuItemId: {
          in: [
            testSisigClassic.id,
            testSizzlingCombo.id,
            testSisigNoRecipe.id,
            testConcurrentSisig.id,
          ],
        },
      },
    });

    await prisma.menuItem.deleteMany({
      where: {
        id: {
          in: [
            testSisigClassic.id,
            testSizzlingCombo.id,
            testSisigNoRecipe.id,
            testConcurrentSisig.id,
          ],
        },
      },
    });

    // Cleanup ingredients
    await prisma.ingredient.deleteMany({
      where: {
        id: {
          in: [testPorkIng.id, testChiliIng.id, testSpecialSauceIng.id],
        },
      },
    });

    // Cleanup category
    if (testCategory) {
      await prisma.category.delete({ where: { id: testCategory.id } });
    }
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // TEST A: Limiting ingredient calculation
  // ─────────────────────────────────────────────────────────────────────────────
  it('Test A: Correctly calculates sellable servings based on bottleneck ingredient', async () => {
    // Sta. Cruz has:
    // Pork: 5000g / 200g = 25 servings
    // Chili Oil: 300ml / 15ml = 20 servings
    // Bottleneck must be Chili Oil with exactly 20 servings
    const availMap = await menuService.evaluateBranchProductAvailability(
      [testSisigClassic.id],
      staCruzBranch.id
    );

    const info = availMap.get(testSisigClassic.id);
    assert.ok(info, 'Availability info must exist for product');
    assert.equal(info.availableServings, 20, 'Available servings must be 20 (limited by chili oil, not 25)');
    assert.equal(info.maxProducible, 20);
    assert.equal(info.isStockAvailable, true);
    assert.ok(info.limitingIngredient, 'Must identify limiting ingredient');
    assert.equal(info.limitingIngredient.name, testChiliIng.name);
    assert.equal(info.limitingIngredient.possibleServings, 20);

    // Verify detailed ingredient list
    const chiliDetail = info.ingredients.find((i) => i.ingredientId === testChiliIng.id);
    assert.ok(chiliDetail);
    assert.equal(chiliDetail.isLimiting, true, 'Chili Oil must be flagged as isLimiting');
    assert.equal(chiliDetail.possibleServings, 20);

    const porkDetail = info.ingredients.find((i) => i.ingredientId === testPorkIng.id);
    assert.ok(porkDetail);
    assert.equal(porkDetail.isLimiting, false, 'Pork must not be flagged as limiting');
    assert.equal(porkDetail.possibleServings, 25);
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // TEST B: Branch independence
  // ─────────────────────────────────────────────────────────────────────────────
  it('Test B: Independent stock calculation between Sta. Cruz and Lumban', async () => {
    // Sta. Cruz has 20 servings available (Chili oil = 300ml)
    // Lumban has 30 servings available (Pork = 7000g -> 35, Chili oil = 450ml -> 30)
    const staCruzMap = await menuService.evaluateBranchProductAvailability(
      [testSisigClassic.id],
      staCruzBranch.id
    );
    const lumbanMap = await menuService.evaluateBranchProductAvailability(
      [testSisigClassic.id],
      lumbanBranch.id
    );

    const staCruzInfo = staCruzMap.get(testSisigClassic.id);
    const lumbanInfo = lumbanMap.get(testSisigClassic.id);

    assert.equal(staCruzInfo.availableServings, 20, 'Sta. Cruz must compute 20 servings');
    assert.equal(lumbanInfo.availableServings, 30, 'Lumban must compute 30 servings');
    assert.equal(staCruzInfo.branchId, staCruzBranch.id);
    assert.equal(lumbanInfo.branchId, lumbanBranch.id);
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // TEST C: Branch runs out of stock
  // ─────────────────────────────────────────────────────────────────────────────
  it('Test C: Sta. Cruz running out of stock does not affect Lumban', async () => {
    // Deplete Sta. Cruz chili oil to 0
    await prisma.inventoryItem.update({
      where: { id: staCruzChiliInv.id },
      data: { quantity: 0 },
    });

    const staCruzMap = await menuService.evaluateBranchProductAvailability(
      [testSisigClassic.id],
      staCruzBranch.id
    );
    const lumbanMap = await menuService.evaluateBranchProductAvailability(
      [testSisigClassic.id],
      lumbanBranch.id
    );

    const staCruzInfo = staCruzMap.get(testSisigClassic.id);
    const lumbanInfo = lumbanMap.get(testSisigClassic.id);

    // Sta. Cruz must be 0 servings and OUT_OF_STOCK
    assert.equal(staCruzInfo.availableServings, 0, 'Sta. Cruz must have 0 servings');
    assert.equal(staCruzInfo.isStockAvailable, false, 'Sta. Cruz must be unavailable');
    assert.equal(staCruzInfo.limitingIngredient.name, testChiliIng.name);
    assert.ok(staCruzInfo.outOfStockIngredients.length > 0);

    // Lumban Sisig must REMAIN 30 servings and AVAILABLE
    assert.equal(lumbanInfo.availableServings, 30, 'Lumban must still have 30 servings');
    assert.equal(lumbanInfo.isStockAvailable, true, 'Lumban must remain available');
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // TEST D: Restocking
  // ─────────────────────────────────────────────────────────────────────────────
  it('Test D: Restocking Sta. Cruz updates its available servings while Lumban remains unchanged', async () => {
    // Restock Sta. Cruz chili oil with 1,000ml
    // At 1,000ml / 15ml = 66 servings
    // But Pork has 5,000g / 200g = 25 servings -> Pork becomes the new limiting ingredient!
    await prisma.inventoryItem.update({
      where: { id: staCruzChiliInv.id },
      data: { quantity: 1000 },
    });

    const staCruzMap = await menuService.evaluateBranchProductAvailability(
      [testSisigClassic.id],
      staCruzBranch.id
    );
    const lumbanMap = await menuService.evaluateBranchProductAvailability(
      [testSisigClassic.id],
      lumbanBranch.id
    );

    const staCruzInfo = staCruzMap.get(testSisigClassic.id);
    const lumbanInfo = lumbanMap.get(testSisigClassic.id);

    assert.equal(staCruzInfo.availableServings, 25, 'Sta. Cruz must now have 25 servings (limited by Pork)');
    assert.equal(staCruzInfo.isStockAvailable, true);
    assert.equal(staCruzInfo.limitingIngredient.name, testPorkIng.name, 'Limiting ingredient must now be Pork Belly');

    // Lumban remains 30 servings
    assert.equal(lumbanInfo.availableServings, 30, 'Lumban must remain 30 servings');
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // TEST E: Sale deduction
  // ─────────────────────────────────────────────────────────────────────────────
  it('Test E: Sale deduction correctly reduces ingredient stock and available servings in branch', async () => {
    // Sell 2 servings of Sisig Classic at Sta. Cruz
    // Pork required: 2 * 200g = 400g (5000 - 400 = 4600g -> 23 servings)
    // Chili Oil required: 2 * 15ml = 30ml (1000 - 30 = 970ml -> 64 servings)
    const orderRes = await orderService.createOrder({
      branchId: staCruzBranch.id,
      cashierId: staCruzCashier.id,
      type: 'DINE_IN',
      items: [{ menuItemId: testSisigClassic.id, quantity: 2 }],
    });

    createdOrderIds.push(orderRes.id);

    // Verify Sta. Cruz inventory rows
    const updatedPork = await prisma.inventoryItem.findUnique({ where: { id: staCruzPorkInv.id } });
    const updatedChili = await prisma.inventoryItem.findUnique({ where: { id: staCruzChiliInv.id } });

    assert.equal(Number(updatedPork.quantity), 4600, 'Pork stock must reduce by 400g to 4600g');
    assert.equal(Number(updatedChili.quantity), 970, 'Chili oil must reduce by 30ml to 970ml');

    // Re-evaluate Sta. Cruz availability: min(4600/200, 970/15) = min(23, 64) = 23
    const staCruzMap = await menuService.evaluateBranchProductAvailability(
      [testSisigClassic.id],
      staCruzBranch.id
    );
    const staCruzInfo = staCruzMap.get(testSisigClassic.id);
    assert.equal(staCruzInfo.availableServings, 23, 'Available servings must reduce to 23');

    // Verify Lumban inventory is untouched
    const lumbanPork = await prisma.inventoryItem.findUnique({ where: { id: lumbanPorkInv.id } });
    const lumbanChili = await prisma.inventoryItem.findUnique({ where: { id: lumbanChiliInv.id } });
    assert.equal(Number(lumbanPork.quantity), 7000, 'Lumban pork must be unchanged at 7000g');
    assert.equal(Number(lumbanChili.quantity), 450, 'Lumban chili oil must be unchanged at 450ml');
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // TEST F: Insufficient stock rejection
  // ─────────────────────────────────────────────────────────────────────────────
  it('Test F: Order exceeding available servings is rejected with 400 Insufficient stock', async () => {
    // Current available servings at Sta. Cruz is 23
    // Attempting to order 30 servings must reject
    let orderError = null;
    try {
      await orderService.createOrder({
        branchId: staCruzBranch.id,
        cashierId: staCruzCashier.id,
        type: 'DINE_IN',
        items: [{ menuItemId: testSisigClassic.id, quantity: 30 }],
      });
    } catch (err) {
      orderError = err;
    }

    assert.ok(orderError, 'Should throw error when stock is insufficient');
    assert.equal(orderError.statusCode, 400);
    assert.match(orderError.message, /Insufficient stock/i);

    // Verify inventory balances were not modified (rollback)
    const porkAfter = await prisma.inventoryItem.findUnique({ where: { id: staCruzPorkInv.id } });
    const chiliAfter = await prisma.inventoryItem.findUnique({ where: { id: staCruzChiliInv.id } });
    assert.equal(Number(porkAfter.quantity), 4600, 'Pork stock must remain 4600g after failed order');
    assert.equal(Number(chiliAfter.quantity), 970, 'Chili oil stock must remain 970ml after failed order');
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // TEST G: Shared ingredient between products
  // ─────────────────────────────────────────────────────────────────────────────
  it('Test G: Shared ingredients dynamically update sellable servings for all dependent products', async () => {
    // Sisig Classic: 200g Pork, 15ml Chili Oil
    // Sizzling Combo: 250g Pork, 10ml Chili Oil
    // Current stock: Pork 4600g, Chili Oil 970ml
    // Sisig Classic max = min(4600/200, 970/15) = min(23, 64) = 23
    // Sizzling Combo max = min(4600/250, 970/10) = min(18, 97) = 18

    let availMap = await menuService.evaluateBranchProductAvailability(
      [testSisigClassic.id, testSizzlingCombo.id],
      staCruzBranch.id
    );

    assert.equal(availMap.get(testSisigClassic.id).availableServings, 23);
    assert.equal(availMap.get(testSizzlingCombo.id).availableServings, 18);

    // Purchase 5 Sisig Classic (consumes 5*200 = 1000g Pork and 5*15 = 75ml Chili Oil)
    // New Stock: Pork = 3600g, Chili Oil = 895ml
    const orderRes = await orderService.createOrder({
      branchId: staCruzBranch.id,
      cashierId: staCruzCashier.id,
      type: 'TAKEOUT',
      items: [{ menuItemId: testSisigClassic.id, quantity: 5 }],
    });
    createdOrderIds.push(orderRes.id);

    availMap = await menuService.evaluateBranchProductAvailability(
      [testSisigClassic.id, testSizzlingCombo.id],
      staCruzBranch.id
    );

    // New Sisig Classic max = min(3600/200, 895/15) = min(18, 59) = 18
    // New Sizzling Combo max = min(3600/250, 895/10) = min(14, 89) = 14
    assert.equal(availMap.get(testSisigClassic.id).availableServings, 18);
    assert.equal(availMap.get(testSizzlingCombo.id).availableServings, 14);
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // TEST H: Cashier branch isolation
  // ─────────────────────────────────────────────────────────────────────────────
  it('Test H: Cashier cannot inspect or alter another branch product availability', async () => {
    // Sta. Cruz Cashier queries Sta. Cruz availability -> Succeeds
    const cashierOwnRes = await menuService.getMenuItemAvailability(
      testSisigClassic.id,
      staCruzCashier,
      { branchId: staCruzBranch.id }
    );
    assert.ok(cashierOwnRes.branch);
    assert.equal(cashierOwnRes.branch.branchId, staCruzBranch.id);

    // Sta. Cruz Cashier queries Lumban branch availability -> Must throw 403 Forbidden
    let crossBranchError = null;
    try {
      await menuService.getMenuItemAvailability(
        testSisigClassic.id,
        staCruzCashier,
        { branchId: lumbanBranch.id }
      );
    } catch (err) {
      crossBranchError = err;
    }

    assert.ok(crossBranchError, 'Cross-branch request must be rejected');
    assert.equal(crossBranchError.statusCode, 403);
    assert.match(crossBranchError.message, /Access denied/i);
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // TEST I: Admin branch comparison
  // ─────────────────────────────────────────────────────────────────────────────
  it('Test I: Admin can compare product availability across all branches side-by-side', async () => {
    // 1. Single product breakdown comparison
    const adminCompare = await menuService.getMenuItemAvailability(
      testSisigClassic.id,
      ownerUser,
      {} // No branchId -> Multi-branch comparison mode for Admin
    );

    assert.equal(adminCompare.isComparison, true);
    assert.ok(Array.isArray(adminCompare.branches));
    const staCruzAdmin = adminCompare.branches.find((b) => b.branchId === staCruzBranch.id);
    const lumbanAdmin = adminCompare.branches.find((b) => b.branchId === lumbanBranch.id);

    assert.ok(staCruzAdmin, 'Sta. Cruz branch must be present in admin comparison');
    assert.ok(lumbanAdmin, 'Lumban branch must be present in admin comparison');
    assert.equal(staCruzAdmin.availableServings, 18);
    assert.equal(lumbanAdmin.availableServings, 30);

    // 2. Multi-branch product matrix
    const matrixRes = await menuService.getMenuAvailabilityMatrix(ownerUser);
    assert.ok(Array.isArray(matrixRes.branches));
    assert.ok(Array.isArray(matrixRes.matrix));

    const classicInMatrix = matrixRes.matrix.find((m) => m.id === testSisigClassic.id);
    assert.ok(classicInMatrix);
    assert.equal(classicInMatrix.branchAvailability[staCruzBranch.id].availableServings, 18);
    assert.equal(classicInMatrix.branchAvailability[lumbanBranch.id].availableServings, 30);
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // TEST J: Concurrent purchase (Race condition & overselling prevention)
  // ─────────────────────────────────────────────────────────────────────────────
  it('Test J: Prevents overselling and race conditions under simultaneous checkout', async () => {
    // testConcurrentSisig requires 1 piece of Special Sauce
    // Current stock in Sta. Cruz is exactly 1 piece
    // Launch 2 simultaneous checkout attempts for 1 serving each
    const orderPromises = [
      orderService.createOrder({
        branchId: staCruzBranch.id,
        cashierId: staCruzCashier.id,
        type: 'DINE_IN',
        items: [{ menuItemId: testConcurrentSisig.id, quantity: 1 }],
      }),
      orderService.createOrder({
        branchId: staCruzBranch.id,
        cashierId: staCruzCashier.id,
        type: 'DINE_IN',
        items: [{ menuItemId: testConcurrentSisig.id, quantity: 1 }],
      }),
    ];

    const results = await Promise.allSettled(orderPromises);
    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    // Exactly 1 must succeed, exactly 1 must be rejected
    assert.equal(fulfilled.length, 1, 'Exactly 1 concurrent order must succeed');
    assert.equal(rejected.length, 1, 'Exactly 1 concurrent order must fail');
    assert.match(rejected[0].reason.message, /Insufficient stock/i);

    if (fulfilled[0].value?.id) {
      createdOrderIds.push(fulfilled[0].value.id);
    }

    // Verify remaining stock is exactly 0 and NEVER negative
    const finalSauce = await prisma.inventoryItem.findUnique({
      where: { id: staCruzSauceInv.id },
    });
    assert.equal(Number(finalSauce.quantity), 0, 'Inventory quantity must be exactly 0, never negative');
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // TEST K: Recipe changes
  // ─────────────────────────────────────────────────────────────────────────────
  it('Test K: Modifying recipe immediately updates future availability without corrupting past COGS', async () => {
    // Current Sta. Cruz pork is 3600g
    // Currently recipe requires 200g -> 3600 / 200 = 18 servings
    // Update recipe to require 360g pork per serving
    const porkRecipe = await prisma.menuItemRecipeIngredient.findFirst({
      where: {
        menuItemId: testSisigClassic.id,
        ingredientId: testPorkIng.id,
      },
    });

    await prisma.menuItemRecipeIngredient.update({
      where: { id: porkRecipe.id },
      data: { quantity: 360 },
    });

    // Re-evaluate: 3600g / 360g = 10 servings!
    const availMap = await menuService.evaluateBranchProductAvailability(
      [testSisigClassic.id],
      staCruzBranch.id
    );
    const info = availMap.get(testSisigClassic.id);
    assert.equal(info.availableServings, 10, 'Available servings must immediately update to 10 based on new recipe');

    // Verify historical order COGS from Test E
    const historicalOrder = await prisma.order.findUnique({
      where: { id: createdOrderIds[0] },
      include: { items: true },
    });
    assert.ok(historicalOrder, 'Historical order must exist');
    assert.ok(Number(historicalOrder.cogs) > 0, 'Historical COGS snapshot must be preserved');
    // Original Sisig Classic COGS was 200g * 0.35 (70) + 15ml * 0.50 (7.50) = 77.50 per unit -> 155.00 for 2
    assert.equal(Number(historicalOrder.cogs), 155.0, 'Historical COGS must remain exactly 155.00');
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // TEST L: Missing recipe
  // ─────────────────────────────────────────────────────────────────────────────
  it('Test L: Product with no recipe returns 0 servings, RECIPE_NOT_CONFIGURED, and rejects orders', async () => {
    // testSisigNoRecipe has no ingredients configured
    const availMap = await menuService.evaluateBranchProductAvailability(
      [testSisigNoRecipe.id],
      staCruzBranch.id
    );
    const info = availMap.get(testSisigNoRecipe.id);

    assert.equal(info.availableServings, 0, 'Must have 0 available servings');
    assert.equal(info.maxProducible, 0);
    assert.equal(info.hasRecipe, false);
    assert.equal(info.canOrder, false);
    assert.equal(info.availabilityStatus, 'RECIPE_NOT_CONFIGURED');

    // Attempting to place an order for an unconfigured recipe item must fail
    let orderErr = null;
    try {
      await orderService.createOrder({
        branchId: staCruzBranch.id,
        cashierId: staCruzCashier.id,
        type: 'DINE_IN',
        items: [{ menuItemId: testSisigNoRecipe.id, quantity: 1 }],
      });
    } catch (err) {
      orderErr = err;
    }

    assert.ok(orderErr, 'Order with unconfigured recipe product must be rejected');
    assert.equal(orderErr.statusCode, 400);
    assert.match(orderErr.message, /have no recipe configured/i);
  });
});
