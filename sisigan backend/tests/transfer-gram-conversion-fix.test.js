// tests/transfer-gram-conversion-fix.test.js
// Production verification of Universal 100g Automatic Conversion for ALL Gram-Based Ingredients
// and Measurement Unit Protection for Non-Gram Ingredients (ML, PCS, TANK, LITER, GALLON, PACK, BAG, TUB).

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const prisma = require('../src/config/db');
const inventoryService = require('../src/modules/inventory/inventory.service');

describe("Harvey's Sisigan — Universal 100g Conversion & Non-Gram Unit Protection Suite", () => {
  let ownerUser;
  let branchA;
  let branchB;

  // Test Gram-based ingredients
  let barkadaMeat;
  let silogMeat;
  let bigas;
  let driedGarlicGram;
  let karneGram;
  let recipeOverriddenGramItem;

  // Test Non-gram ingredients (native unit protection)
  let testML;
  let testPCS;
  let testTANK;
  let testLITER;
  let testGALLON;
  let testPACK;
  let testBAG;
  let testTUB;

  const testTag = `TEST_UNIV_${Date.now()}`;
  const createdTransferIds = [];

  before(async () => {
    // 1. Fetch Owner user
    ownerUser = await prisma.user.findFirst({ where: { role: 'OWNER' } });
    assert.ok(ownerUser, 'Owner user must exist in system');

    // 2. Fetch or create branches
    const branches = await prisma.branch.findMany({ where: { isActive: true }, take: 2 });
    assert.ok(branches.length >= 2, 'At least 2 active branches required');
    branchA = branches[0];
    branchB = branches[1];

    // 3. Create Gram-based ingredients
    barkadaMeat = await prisma.ingredient.create({
      data: {
        name: `Barkada Meat (${testTag})`,
        unit: 'GRAM',
        category: 'MAIN_INGREDIENT',
        gramsPerUnit: 100.000,
        defaultPrice: 0.28,
      },
    });

    silogMeat = await prisma.ingredient.create({
      data: {
        name: `Silog Meat (${testTag})`,
        unit: 'GRAM',
        category: 'MAIN_INGREDIENT',
        gramsPerUnit: 100.000,
        defaultPrice: 0.28,
      },
    });

    bigas = await prisma.ingredient.create({
      data: {
        name: `Bigas (${testTag})`,
        unit: 'GRAM',
        category: 'RICE',
        gramsPerUnit: 100.000,
        defaultPrice: 0.027,
      },
    });

    driedGarlicGram = await prisma.ingredient.create({
      data: {
        name: `Dried Garlic (${testTag})`,
        unit: 'GRAM',
        category: 'SPICES',
        gramsPerUnit: 100.000,
        defaultPrice: 0.20,
      },
    });

    // Karne created without explicit gramsPerUnit (null) to test automatic universal 100g fallback
    karneGram = await prisma.ingredient.create({
      data: {
        name: `Karne (${testTag})`,
        unit: 'GRAM',
        category: 'MAIN_INGREDIENT',
        gramsPerUnit: null,
        defaultPrice: 0.35,
      },
    });

    // Ingredient linked to an old 80g recipe BOM to verify universal 100g overrides stale recipe
    recipeOverriddenGramItem = await prisma.ingredient.create({
      data: {
        name: `Recipe Legacy Item (${testTag})`,
        unit: 'GRAM',
        category: 'MAIN_INGREDIENT',
        gramsPerUnit: null,
        defaultPrice: 0.30,
      },
    });
    // Create menu item and recipe BOM with 80g
    const legacyMenu = await prisma.menuItem.create({
      data: {
        name: `Legacy Menu (${testTag})`,
        price: 99.00,
        categoryId: 1,
      },
    });
    await prisma.menuItemRecipeIngredient.create({
      data: {
        menuItemId: legacyMenu.id,
        ingredientId: recipeOverriddenGramItem.id,
        quantity: 80, // old 80g recipe portion
        unit: 'GRAM',
      },
    });

    // 4. Create Non-Gram ingredients for Unit Protection testing
    testML = await prisma.ingredient.create({
      data: { name: `Chilli Oil (${testTag})`, unit: 'ML', category: 'SAUCE', defaultPrice: 0.15 },
    });
    testPCS = await prisma.ingredient.create({
      data: { name: `Special Sauce (${testTag})`, unit: 'PCS', category: 'SAUCE', defaultPrice: 15.00 },
    });
    testTANK = await prisma.ingredient.create({
      data: { name: `LPG Gas Tank (${testTag})`, unit: 'TANK', category: 'GAS', defaultPrice: 900.00 },
    });
    testLITER = await prisma.ingredient.create({
      data: { name: `Patis Vinegar (${testTag})`, unit: 'LITER', category: 'SAUCE', defaultPrice: 60.00 },
    });
    testGALLON = await prisma.ingredient.create({
      data: { name: `Mineral Tubig (${testTag})`, unit: 'GALLON', category: 'UTILITIES', defaultPrice: 25.00 },
    });
    testPACK = await prisma.ingredient.create({
      data: { name: `Paminta Pack (${testTag})`, unit: 'PACK', category: 'SPICES', defaultPrice: 50.00 },
    });
    testBAG = await prisma.ingredient.create({
      data: { name: `Charcoal Bag (${testTag})`, unit: 'BAG', category: 'UTILITIES', defaultPrice: 120.00 },
    });
    testTUB = await prisma.ingredient.create({
      data: { name: `Mayonnaise Tub (${testTag})`, unit: 'TUB', category: 'SAUCE', defaultPrice: 180.00 },
    });
  });

  after(async () => {
    // Cleanup created transfers and audit logs
    if (createdTransferIds.length > 0) {
      const trfs = await prisma.inventoryTransfer.findMany({
        where: { id: { in: createdTransferIds } },
        select: { transferNo: true },
      });
      const refs = trfs.map((t) => t.transferNo);
      await prisma.inventoryAuditLog.deleteMany({ where: { referenceNo: { in: refs } } });
      await prisma.inventoryTransfer.deleteMany({ where: { id: { in: createdTransferIds } } });
    }

    // Cleanup test ingredients and menu items
    const allIngs = [
      barkadaMeat?.id,
      silogMeat?.id,
      bigas?.id,
      driedGarlicGram?.id,
      karneGram?.id,
      recipeOverriddenGramItem?.id,
      testML?.id,
      testPCS?.id,
      testTANK?.id,
      testLITER?.id,
      testGALLON?.id,
      testPACK?.id,
      testBAG?.id,
      testTUB?.id,
    ].filter(Boolean);

    if (allIngs.length > 0) {
      await prisma.menuItemRecipeIngredient.deleteMany({ where: { ingredientId: { in: allIngs } } });
      await prisma.inventoryTransfer.deleteMany({ where: { ingredientId: { in: allIngs } } });
      await prisma.inventoryAuditLog.deleteMany({
        where: { inventoryItem: { ingredientId: { in: allIngs } } },
      });
      await prisma.inventoryItem.deleteMany({ where: { ingredientId: { in: allIngs } } });
      await prisma.ingredient.deleteMany({ where: { id: { in: allIngs } } });
    }

    await prisma.menuItem.deleteMany({ where: { name: { contains: testTag } } });
  });

  it('1. Universal 100g Conversion — Barkada Meat: 1 order transfers exactly 100g (894g -> 794g)', async () => {
    await prisma.inventoryItem.upsert({
      where: { branchId_ingredientId: { branchId: branchA.id, ingredientId: barkadaMeat.id } },
      update: { quantity: 894.000, price: 0.28 },
      create: { branchId: branchA.id, ingredientId: barkadaMeat.id, quantity: 894.000, price: 0.28 },
    });
    await prisma.inventoryItem.upsert({
      where: { branchId_ingredientId: { branchId: branchB.id, ingredientId: barkadaMeat.id } },
      update: { quantity: 0.000, price: 0.28 },
      create: { branchId: branchB.id, ingredientId: barkadaMeat.id, quantity: 0.000, price: 0.28 },
    });

    const transfer = await inventoryService.transferInventory(
      {
        sourceBranchId: branchA.id,
        destBranchId: branchB.id,
        ingredientId: barkadaMeat.id,
        inputQuantity: 1,
        inputUnit: 'ORDERS',
        notes: 'Transfer 1 order Barkada Meat',
      },
      ownerUser
    );

    assert.ok(transfer);
    assert.equal(transfer.status, 'COMPLETED');
    createdTransferIds.push(transfer.id);

    assert.equal(Number(transfer.inputQuantity), 1);
    assert.equal(Number(transfer.conversionFactor), 100);
    assert.equal(Number(transfer.quantity), 100); // 1 × 100 = 100g
    assert.equal(transfer.unit, 'GRAM');

    const sourceStock = await prisma.inventoryItem.findUnique({
      where: { branchId_ingredientId: { branchId: branchA.id, ingredientId: barkadaMeat.id } },
    });
    assert.equal(Number(sourceStock.quantity), 794, '894 - 100 must be 794 grams');

    const destStock = await prisma.inventoryItem.findUnique({
      where: { branchId_ingredientId: { branchId: branchB.id, ingredientId: barkadaMeat.id } },
    });
    assert.equal(Number(destStock.quantity), 100, 'Destination must receive 100 grams');
  });

  it('2. Universal 100g Conversion — Silog Meat across 2, 5, 10, 20 orders', async () => {
    // Initial: Branch A = 10,000 g, Branch B = 0 g
    await prisma.inventoryItem.upsert({
      where: { branchId_ingredientId: { branchId: branchA.id, ingredientId: silogMeat.id } },
      update: { quantity: 10000.000, price: 0.28 },
      create: { branchId: branchA.id, ingredientId: silogMeat.id, quantity: 10000.000, price: 0.28 },
    });
    await prisma.inventoryItem.upsert({
      where: { branchId_ingredientId: { branchId: branchB.id, ingredientId: silogMeat.id } },
      update: { quantity: 0.000, price: 0.28 },
      create: { branchId: branchB.id, ingredientId: silogMeat.id, quantity: 0.000, price: 0.28 },
    });

    // Step A: 2 orders -> transfers 200g (10,000 -> 9,800)
    const trf2 = await inventoryService.transferInventory(
      {
        sourceBranchId: branchA.id,
        destBranchId: branchB.id,
        ingredientId: silogMeat.id,
        inputQuantity: 2,
        inputUnit: 'ORDERS',
      },
      ownerUser
    );
    createdTransferIds.push(trf2.id);
    assert.equal(Number(trf2.quantity), 200);

    // Step B: 5 orders -> transfers 500g (9,800 -> 9,300)
    const trf5 = await inventoryService.transferInventory(
      {
        sourceBranchId: branchA.id,
        destBranchId: branchB.id,
        ingredientId: silogMeat.id,
        inputQuantity: 5,
        inputUnit: 'ORDERS',
      },
      ownerUser
    );
    createdTransferIds.push(trf5.id);
    assert.equal(Number(trf5.quantity), 500);

    // Step C: 10 orders -> transfers 1,000g (9,300 -> 8,300)
    const trf10 = await inventoryService.transferInventory(
      {
        sourceBranchId: branchA.id,
        destBranchId: branchB.id,
        ingredientId: silogMeat.id,
        inputQuantity: 10,
        inputUnit: 'ORDERS',
      },
      ownerUser
    );
    createdTransferIds.push(trf10.id);
    assert.equal(Number(trf10.quantity), 1000);

    // Step D: 20 orders -> transfers 2,000g (8,300 -> 6,300)
    const trf20 = await inventoryService.transferInventory(
      {
        sourceBranchId: branchA.id,
        destBranchId: branchB.id,
        ingredientId: silogMeat.id,
        inputQuantity: 20,
        inputUnit: 'ORDERS',
      },
      ownerUser
    );
    createdTransferIds.push(trf20.id);
    assert.equal(Number(trf20.quantity), 2000);

    // Verify final stock: 10,000 - 3,700 = 6,300g in Branch A; 3,700g in Branch B
    const sourceStock = await prisma.inventoryItem.findUnique({
      where: { branchId_ingredientId: { branchId: branchA.id, ingredientId: silogMeat.id } },
    });
    assert.equal(Number(sourceStock.quantity), 6300);

    const destStock = await prisma.inventoryItem.findUnique({
      where: { branchId_ingredientId: { branchId: branchB.id, ingredientId: silogMeat.id } },
    });
    assert.equal(Number(destStock.quantity), 3700);
  });

  it('3. Universal 100g Conversion — Bigas (Rice in GRAMs): 10 orders = 1,000g, 20 orders = 2,000g', async () => {
    await prisma.inventoryItem.upsert({
      where: { branchId_ingredientId: { branchId: branchA.id, ingredientId: bigas.id } },
      update: { quantity: 50000.000, price: 0.027 },
      create: { branchId: branchA.id, ingredientId: bigas.id, quantity: 50000.000, price: 0.027 },
    });
    await prisma.inventoryItem.upsert({
      where: { branchId_ingredientId: { branchId: branchB.id, ingredientId: bigas.id } },
      update: { quantity: 1000.000, price: 0.027 },
      create: { branchId: branchB.id, ingredientId: bigas.id, quantity: 1000.000, price: 0.027 },
    });

    const trf10 = await inventoryService.transferInventory(
      {
        sourceBranchId: branchA.id,
        destBranchId: branchB.id,
        ingredientId: bigas.id,
        inputQuantity: 10,
        inputUnit: 'ORDERS',
      },
      ownerUser
    );
    createdTransferIds.push(trf10.id);
    assert.equal(Number(trf10.quantity), 1000);

    const trf20 = await inventoryService.transferInventory(
      {
        sourceBranchId: branchA.id,
        destBranchId: branchB.id,
        ingredientId: bigas.id,
        inputQuantity: 20,
        inputUnit: 'ORDERS',
      },
      ownerUser
    );
    createdTransferIds.push(trf20.id);
    assert.equal(Number(trf20.quantity), 2000);

    const sourceStock = await prisma.inventoryItem.findUnique({
      where: { branchId_ingredientId: { branchId: branchA.id, ingredientId: bigas.id } },
    });
    assert.equal(Number(sourceStock.quantity), 47000); // 50,000 - 3,000 = 47,000g
  });

  it('4. Universal 100g Conversion — Dried Garlic & Karne: unconfigured items default to 100g', async () => {
    // Karne has gramsPerUnit: null in DB — must automatically convert at universal 100g/order
    await prisma.inventoryItem.upsert({
      where: { branchId_ingredientId: { branchId: branchA.id, ingredientId: karneGram.id } },
      update: { quantity: 3000.000, price: 0.35 },
      create: { branchId: branchA.id, ingredientId: karneGram.id, quantity: 3000.000, price: 0.35 },
    });
    await prisma.inventoryItem.upsert({
      where: { branchId_ingredientId: { branchId: branchB.id, ingredientId: karneGram.id } },
      update: { quantity: 0.000, price: 0.35 },
      create: { branchId: branchB.id, ingredientId: karneGram.id, quantity: 0.000, price: 0.35 },
    });

    const trfKarne = await inventoryService.transferInventory(
      {
        sourceBranchId: branchA.id,
        destBranchId: branchB.id,
        ingredientId: karneGram.id,
        inputQuantity: 5,
        inputUnit: 'ORDERS',
      },
      ownerUser
    );
    createdTransferIds.push(trfKarne.id);
    assert.equal(Number(trfKarne.conversionFactor), 100, 'Must use universal 100g even when gramsPerUnit was null');
    assert.equal(Number(trfKarne.quantity), 500); // 5 × 100 = 500g

    // Dried Garlic (unit: GRAM): 1 order = 100g
    await prisma.inventoryItem.upsert({
      where: { branchId_ingredientId: { branchId: branchA.id, ingredientId: driedGarlicGram.id } },
      update: { quantity: 2000.000, price: 0.20 },
      create: { branchId: branchA.id, ingredientId: driedGarlicGram.id, quantity: 2000.000, price: 0.20 },
    });
    await prisma.inventoryItem.upsert({
      where: { branchId_ingredientId: { branchId: branchB.id, ingredientId: driedGarlicGram.id } },
      update: { quantity: 0.000, price: 0.20 },
      create: { branchId: branchB.id, ingredientId: driedGarlicGram.id, quantity: 0.000, price: 0.20 },
    });

    const trfGarlic = await inventoryService.transferInventory(
      {
        sourceBranchId: branchA.id,
        destBranchId: branchB.id,
        ingredientId: driedGarlicGram.id,
        inputQuantity: 1,
        inputUnit: 'ORDERS',
      },
      ownerUser
    );
    createdTransferIds.push(trfGarlic.id);
    assert.equal(Number(trfGarlic.quantity), 100);
  });

  it('5. Legacy Recipe Override Prevention — Universal 100g overrides stale 80g recipe BOM', async () => {
    // recipeOverriddenGramItem has an existing recipe specifying 80g portion
    // Universal 100g rule must prevail over old 80g recipe BOM!
    await prisma.inventoryItem.upsert({
      where: { branchId_ingredientId: { branchId: branchA.id, ingredientId: recipeOverriddenGramItem.id } },
      update: { quantity: 1000.000, price: 0.30 },
      create: { branchId: branchA.id, ingredientId: recipeOverriddenGramItem.id, quantity: 1000.000, price: 0.30 },
    });
    await prisma.inventoryItem.upsert({
      where: { branchId_ingredientId: { branchId: branchB.id, ingredientId: recipeOverriddenGramItem.id } },
      update: { quantity: 0.000, price: 0.30 },
      create: { branchId: branchB.id, ingredientId: recipeOverriddenGramItem.id, quantity: 0.000, price: 0.30 },
    });

    const trf = await inventoryService.transferInventory(
      {
        sourceBranchId: branchA.id,
        destBranchId: branchB.id,
        ingredientId: recipeOverriddenGramItem.id,
        inputQuantity: 1,
        inputUnit: 'ORDERS',
      },
      ownerUser
    );
    createdTransferIds.push(trf.id);

    // Verify it used 100g, NOT 80g!
    assert.equal(Number(trf.conversionFactor), 100, 'Universal 100g must override 80g recipe BOM');
    assert.equal(Number(trf.quantity), 100, '1 order must transfer 100g, NOT 80g');

    const sourceStock = await prisma.inventoryItem.findUnique({
      where: { branchId_ingredientId: { branchId: branchA.id, ingredientId: recipeOverriddenGramItem.id } },
    });
    assert.equal(Number(sourceStock.quantity), 900, '1000 - 100 must be 900g (NOT 920g)');
  });

  it('6. Measurement Unit Protection — ML, PCS, TANK, LITER, GALLON, PACK, BAG, TUB retain native units', async () => {
    // Test ML: Chilli Oil — 500 ML transfer
    await prisma.inventoryItem.upsert({
      where: { branchId_ingredientId: { branchId: branchA.id, ingredientId: testML.id } },
      update: { quantity: 1000, price: 0.15 },
      create: { branchId: branchA.id, ingredientId: testML.id, quantity: 1000, price: 0.15 },
    });
    await prisma.inventoryItem.upsert({
      where: { branchId_ingredientId: { branchId: branchB.id, ingredientId: testML.id } },
      update: { quantity: 200, price: 0.15 },
      create: { branchId: branchB.id, ingredientId: testML.id, quantity: 200, price: 0.15 },
    });
    const trfML = await inventoryService.transferInventory(
      { sourceBranchId: branchA.id, destBranchId: branchB.id, ingredientId: testML.id, quantity: 500, unit: 'ML' },
      ownerUser
    );
    createdTransferIds.push(trfML.id);
    assert.equal(Number(trfML.quantity), 500);
    assert.equal(trfML.unit, 'ML');

    // Test PCS: Special Sauce — 10 PCS transfer
    await prisma.inventoryItem.upsert({
      where: { branchId_ingredientId: { branchId: branchA.id, ingredientId: testPCS.id } },
      update: { quantity: 50, price: 15.00 },
      create: { branchId: branchA.id, ingredientId: testPCS.id, quantity: 50, price: 15.00 },
    });
    await prisma.inventoryItem.upsert({
      where: { branchId_ingredientId: { branchId: branchB.id, ingredientId: testPCS.id } },
      update: { quantity: 10, price: 15.00 },
      create: { branchId: branchB.id, ingredientId: testPCS.id, quantity: 10, price: 15.00 },
    });
    const trfPCS = await inventoryService.transferInventory(
      { sourceBranchId: branchA.id, destBranchId: branchB.id, ingredientId: testPCS.id, quantity: 10, unit: 'PCS' },
      ownerUser
    );
    createdTransferIds.push(trfPCS.id);
    assert.equal(Number(trfPCS.quantity), 10);
    assert.equal(trfPCS.unit, 'PCS');

    // Test TANK: LPG Gas — 1 TANK transfer
    await prisma.inventoryItem.upsert({
      where: { branchId_ingredientId: { branchId: branchA.id, ingredientId: testTANK.id } },
      update: { quantity: 5, price: 900.00 },
      create: { branchId: branchA.id, ingredientId: testTANK.id, quantity: 5, price: 900.00 },
    });
    await prisma.inventoryItem.upsert({
      where: { branchId_ingredientId: { branchId: branchB.id, ingredientId: testTANK.id } },
      update: { quantity: 1, price: 900.00 },
      create: { branchId: branchB.id, ingredientId: testTANK.id, quantity: 1, price: 900.00 },
    });
    const trfTANK = await inventoryService.transferInventory(
      { sourceBranchId: branchA.id, destBranchId: branchB.id, ingredientId: testTANK.id, quantity: 1, unit: 'TANK' },
      ownerUser
    );
    createdTransferIds.push(trfTANK.id);
    assert.equal(Number(trfTANK.quantity), 1);
    assert.equal(trfTANK.unit, 'TANK');

    // Test LITER: Patis — 2 LITER transfer
    await prisma.inventoryItem.upsert({
      where: { branchId_ingredientId: { branchId: branchA.id, ingredientId: testLITER.id } },
      update: { quantity: 10, price: 60.00 },
      create: { branchId: branchA.id, ingredientId: testLITER.id, quantity: 10, price: 60.00 },
    });
    await prisma.inventoryItem.upsert({
      where: { branchId_ingredientId: { branchId: branchB.id, ingredientId: testLITER.id } },
      update: { quantity: 2, price: 60.00 },
      create: { branchId: branchB.id, ingredientId: testLITER.id, quantity: 2, price: 60.00 },
    });
    const trfLITER = await inventoryService.transferInventory(
      { sourceBranchId: branchA.id, destBranchId: branchB.id, ingredientId: testLITER.id, quantity: 2, unit: 'LITER' },
      ownerUser
    );
    createdTransferIds.push(trfLITER.id);
    assert.equal(Number(trfLITER.quantity), 2);
    assert.equal(trfLITER.unit, 'LITER');

    // Test GALLON: Tubig — 3 GALLON transfer
    await prisma.inventoryItem.upsert({
      where: { branchId_ingredientId: { branchId: branchA.id, ingredientId: testGALLON.id } },
      update: { quantity: 15, price: 25.00 },
      create: { branchId: branchA.id, ingredientId: testGALLON.id, quantity: 15, price: 25.00 },
    });
    await prisma.inventoryItem.upsert({
      where: { branchId_ingredientId: { branchId: branchB.id, ingredientId: testGALLON.id } },
      update: { quantity: 3, price: 25.00 },
      create: { branchId: branchB.id, ingredientId: testGALLON.id, quantity: 3, price: 25.00 },
    });
    const trfGALLON = await inventoryService.transferInventory(
      { sourceBranchId: branchA.id, destBranchId: branchB.id, ingredientId: testGALLON.id, quantity: 3, unit: 'GALLON' },
      ownerUser
    );
    createdTransferIds.push(trfGALLON.id);
    assert.equal(Number(trfGALLON.quantity), 3);
    assert.equal(trfGALLON.unit, 'GALLON');

    // Test PACK: Paminta Pack — 4 PACK transfer
    await prisma.inventoryItem.upsert({
      where: { branchId_ingredientId: { branchId: branchA.id, ingredientId: testPACK.id } },
      update: { quantity: 20, price: 50.00 },
      create: { branchId: branchA.id, ingredientId: testPACK.id, quantity: 20, price: 50.00 },
    });
    await prisma.inventoryItem.upsert({
      where: { branchId_ingredientId: { branchId: branchB.id, ingredientId: testPACK.id } },
      update: { quantity: 5, price: 50.00 },
      create: { branchId: branchB.id, ingredientId: testPACK.id, quantity: 5, price: 50.00 },
    });
    const trfPACK = await inventoryService.transferInventory(
      { sourceBranchId: branchA.id, destBranchId: branchB.id, ingredientId: testPACK.id, quantity: 4, unit: 'PACK' },
      ownerUser
    );
    createdTransferIds.push(trfPACK.id);
    assert.equal(Number(trfPACK.quantity), 4);
    assert.equal(trfPACK.unit, 'PACK');

    // Test BAG: Charcoal Bag — 2 BAG transfer
    await prisma.inventoryItem.upsert({
      where: { branchId_ingredientId: { branchId: branchA.id, ingredientId: testBAG.id } },
      update: { quantity: 10, price: 120.00 },
      create: { branchId: branchA.id, ingredientId: testBAG.id, quantity: 10, price: 120.00 },
    });
    await prisma.inventoryItem.upsert({
      where: { branchId_ingredientId: { branchId: branchB.id, ingredientId: testBAG.id } },
      update: { quantity: 2, price: 120.00 },
      create: { branchId: branchB.id, ingredientId: testBAG.id, quantity: 2, price: 120.00 },
    });
    const trfBAG = await inventoryService.transferInventory(
      { sourceBranchId: branchA.id, destBranchId: branchB.id, ingredientId: testBAG.id, quantity: 2, unit: 'BAG' },
      ownerUser
    );
    createdTransferIds.push(trfBAG.id);
    assert.equal(Number(trfBAG.quantity), 2);
    assert.equal(trfBAG.unit, 'BAG');

    // Test TUB: Mayonnaise Tub — 1 TUB transfer
    await prisma.inventoryItem.upsert({
      where: { branchId_ingredientId: { branchId: branchA.id, ingredientId: testTUB.id } },
      update: { quantity: 5, price: 180.00 },
      create: { branchId: branchA.id, ingredientId: testTUB.id, quantity: 5, price: 180.00 },
    });
    await prisma.inventoryItem.upsert({
      where: { branchId_ingredientId: { branchId: branchB.id, ingredientId: testTUB.id } },
      update: { quantity: 1, price: 180.00 },
      create: { branchId: branchB.id, ingredientId: testTUB.id, quantity: 1, price: 180.00 },
    });
    const trfTUB = await inventoryService.transferInventory(
      { sourceBranchId: branchA.id, destBranchId: branchB.id, ingredientId: testTUB.id, quantity: 1, unit: 'TUB' },
      ownerUser
    );
    createdTransferIds.push(trfTUB.id);
    assert.equal(Number(trfTUB.quantity), 1);
    assert.equal(trfTUB.unit, 'TUB');
  });

  it('7. Branch Selection Consistency — Source branch stock verification (19,460g vs 894g)', async () => {
    await prisma.inventoryItem.update({
      where: { branchId_ingredientId: { branchId: branchA.id, ingredientId: barkadaMeat.id } },
      data: { quantity: 19460.000 },
    });
    await prisma.inventoryItem.update({
      where: { branchId_ingredientId: { branchId: branchB.id, ingredientId: barkadaMeat.id } },
      data: { quantity: 894.000 },
    });

    const branchAInventory = await inventoryService.getInventory(
      { branchId: branchA.id },
      ownerUser
    );
    const itemInBranchA = branchAInventory.find((i) => i.ingredientId === barkadaMeat.id);
    assert.equal(Number(itemInBranchA.quantity), 19460);

    const branchBInventory = await inventoryService.getInventory(
      { branchId: branchB.id },
      ownerUser
    );
    const itemInBranchB = branchBInventory.find((i) => i.ingredientId === barkadaMeat.id);
    assert.equal(Number(itemInBranchB.quantity), 894);
  });
});
