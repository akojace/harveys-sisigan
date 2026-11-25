// tests/transfer-gram-conversion-fix.test.js
// Production verification of Barkada Meat 100g/order transfer conversion,
// custom conversion factors (80g), and branch dropdown stock accuracy.

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const prisma = require('../src/config/db');
const inventoryService = require('../src/modules/inventory/inventory.service');

describe("Harvey's Sisigan — Barkada Meat Gram Conversion & Transfer Accuracy Test Suite", () => {
  let ownerUser;
  let branchA;
  let branchB;

  let barkadaMeat;
  let custom80gItem;

  const testTag = `TEST_CONV_${Date.now()}`;
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

    // 3. Ensure Barkada Meat exists with authorized conversion factor: 100g per order
    barkadaMeat = await prisma.ingredient.upsert({
      where: { name: `Barkada Meat (${testTag})` },
      update: {
        unit: 'GRAM',
        category: 'MAIN_INGREDIENT',
        gramsPerUnit: 100.000,
        defaultPrice: 0.28,
      },
      create: {
        name: `Barkada Meat (${testTag})`,
        unit: 'GRAM',
        category: 'MAIN_INGREDIENT',
        gramsPerUnit: 100.000,
        defaultPrice: 0.28,
      },
    });

    // 4. Create Custom Item with 80g conversion factor (to prove 80g is supported dynamically)
    custom80gItem = await prisma.ingredient.create({
      data: {
        name: `Custom 80g Item (${testTag})`,
        unit: 'GRAM',
        category: 'MAIN_INGREDIENT',
        gramsPerUnit: 80.000,
        defaultPrice: 0.35,
      },
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

    // Cleanup test items
    const ingIds = [barkadaMeat?.id, custom80gItem?.id].filter(Boolean);
    if (ingIds.length > 0) {
      await prisma.inventoryTransfer.deleteMany({ where: { ingredientId: { in: ingIds } } });
      await prisma.inventoryAuditLog.deleteMany({
        where: { inventoryItem: { ingredientId: { in: ingIds } } },
      });
      await prisma.inventoryItem.deleteMany({ where: { ingredientId: { in: ingIds } } });
      await prisma.ingredient.deleteMany({ where: { id: { in: ingIds } } });
    }
  });

  it('Test 1: Barkada Meat — 1 order @ 100g/order transfers exactly 100g (894g -> 794g)', async () => {
    // Initial reported business condition:
    // Source Branch inventory: 894 grams
    // Destination Branch inventory: 0 grams (or newly initialized)
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

    // Execute transfer of 1 order
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

    assert.ok(transfer, 'Transfer must succeed');
    assert.equal(transfer.status, 'COMPLETED');
    createdTransferIds.push(transfer.id);

    // Verify snapshot fields on transfer record
    assert.equal(Number(transfer.inputQuantity), 1, 'Input quantity must be 1 order');
    assert.equal(transfer.inputUnit, 'ORDERS', 'Input unit must be ORDERS');
    assert.equal(Number(transfer.conversionFactor), 100, 'Conversion factor must be 100g/order');
    assert.equal(Number(transfer.quantity), 100, 'Total transferred quantity must be exactly 100 grams');
    assert.equal(transfer.unit, 'GRAM');

    // Verify Source Branch stock: exactly 894 - 100 = 794 grams (NOT 814 grams!)
    const sourceStock = await prisma.inventoryItem.findUnique({
      where: { branchId_ingredientId: { branchId: branchA.id, ingredientId: barkadaMeat.id } },
    });
    assert.equal(Number(sourceStock.quantity), 794, 'Source branch stock must be exactly 794 grams (894 - 100)');

    // Verify Destination Branch stock: exactly 0 + 100 = 100 grams
    const destStock = await prisma.inventoryItem.findUnique({
      where: { branchId_ingredientId: { branchId: branchB.id, ingredientId: barkadaMeat.id } },
    });
    assert.equal(Number(destStock.quantity), 100, 'Destination branch stock must be exactly 100 grams');

    // Verify Audit Logs: TRANSFER_OUT (-100) and TRANSFER_IN (+100)
    const logs = await prisma.inventoryAuditLog.findMany({
      where: { referenceNo: transfer.transferNo },
    });
    assert.equal(logs.length, 2, 'Exactly 2 audit logs must be created');
    const outLog = logs.find((l) => l.actionType === 'TRANSFER_OUT');
    const inLog = logs.find((l) => l.actionType === 'TRANSFER_IN');
    assert.equal(Number(outLog.quantityChanged), -100, 'Out log must be -100 grams');
    assert.equal(Number(inLog.quantityChanged), 100, 'In log must be +100 grams');
  });

  it('Test 2: Barkada Meat — 2 orders @ 100g/order deducts exactly 200g (794g -> 594g)', async () => {
    const transfer = await inventoryService.transferInventory(
      {
        sourceBranchId: branchA.id,
        destBranchId: branchB.id,
        ingredientId: barkadaMeat.id,
        inputQuantity: 2,
        inputUnit: 'ORDERS',
        notes: 'Transfer 2 orders Barkada Meat',
      },
      ownerUser
    );

    assert.ok(transfer);
    assert.equal(transfer.status, 'COMPLETED');
    createdTransferIds.push(transfer.id);

    assert.equal(Number(transfer.inputQuantity), 2);
    assert.equal(Number(transfer.conversionFactor), 100);
    assert.equal(Number(transfer.quantity), 200, 'Total transferred must be 200 grams');

    // Source: 794 - 200 = 594 grams
    const sourceStock = await prisma.inventoryItem.findUnique({
      where: { branchId_ingredientId: { branchId: branchA.id, ingredientId: barkadaMeat.id } },
    });
    assert.equal(Number(sourceStock.quantity), 594, 'Source stock must be 594 grams (794 - 200)');

    // Destination: 100 + 200 = 300 grams
    const destStock = await prisma.inventoryItem.findUnique({
      where: { branchId_ingredientId: { branchId: branchB.id, ingredientId: barkadaMeat.id } },
    });
    assert.equal(Number(destStock.quantity), 300, 'Destination stock must be 300 grams');
  });

  it('Test 3: Barkada Meat — 5 orders @ 100g/order deducts exactly 500g (594g -> 94g)', async () => {
    const transfer = await inventoryService.transferInventory(
      {
        sourceBranchId: branchA.id,
        destBranchId: branchB.id,
        ingredientId: barkadaMeat.id,
        inputQuantity: 5,
        inputUnit: 'ORDERS',
        notes: 'Transfer 5 orders Barkada Meat',
      },
      ownerUser
    );

    assert.ok(transfer);
    assert.equal(transfer.status, 'COMPLETED');
    createdTransferIds.push(transfer.id);

    assert.equal(Number(transfer.inputQuantity), 5);
    assert.equal(Number(transfer.conversionFactor), 100);
    assert.equal(Number(transfer.quantity), 500, 'Total transferred must be 500 grams');

    // Source: 594 - 500 = 94 grams
    const sourceStock = await prisma.inventoryItem.findUnique({
      where: { branchId_ingredientId: { branchId: branchA.id, ingredientId: barkadaMeat.id } },
    });
    assert.equal(Number(sourceStock.quantity), 94, 'Source stock must be 94 grams (594 - 500)');

    // Destination: 300 + 500 = 800 grams
    const destStock = await prisma.inventoryItem.findUnique({
      where: { branchId_ingredientId: { branchId: branchB.id, ingredientId: barkadaMeat.id } },
    });
    assert.equal(Number(destStock.quantity), 800, 'Destination stock must be 800 grams');
  });

  it('Test 4: Barkada Meat — 10 orders @ 100g/order deducts exactly 1,000g from replenished stock', async () => {
    // Replenish Branch A to 2,000g
    await prisma.inventoryItem.update({
      where: { branchId_ingredientId: { branchId: branchA.id, ingredientId: barkadaMeat.id } },
      data: { quantity: 2000.000 },
    });

    const transfer = await inventoryService.transferInventory(
      {
        sourceBranchId: branchA.id,
        destBranchId: branchB.id,
        ingredientId: barkadaMeat.id,
        inputQuantity: 10,
        inputUnit: 'ORDERS',
        notes: 'Transfer 10 orders Barkada Meat',
      },
      ownerUser
    );

    assert.ok(transfer);
    assert.equal(transfer.status, 'COMPLETED');
    createdTransferIds.push(transfer.id);

    assert.equal(Number(transfer.inputQuantity), 10);
    assert.equal(Number(transfer.conversionFactor), 100);
    assert.equal(Number(transfer.quantity), 1000, 'Total transferred must be 1,000 grams');

    // Source: 2,000 - 1,000 = 1,000 grams
    const sourceStock = await prisma.inventoryItem.findUnique({
      where: { branchId_ingredientId: { branchId: branchA.id, ingredientId: barkadaMeat.id } },
    });
    assert.equal(Number(sourceStock.quantity), 1000, 'Source stock must be 1,000 grams (2,000 - 1,000)');

    // Destination: 800 + 1,000 = 1,800 grams
    const destStock = await prisma.inventoryItem.findUnique({
      where: { branchId_ingredientId: { branchId: branchB.id, ingredientId: barkadaMeat.id } },
    });
    assert.equal(Number(destStock.quantity), 1800, 'Destination stock must be 1,800 grams');
  });

  it('Test 5: Custom Item — 1 order @ 80g/order deducts exactly 80g (verifying dynamic conversion)', async () => {
    // Initial stock: Branch A = 500g, Branch B = 0g
    await prisma.inventoryItem.upsert({
      where: { branchId_ingredientId: { branchId: branchA.id, ingredientId: custom80gItem.id } },
      update: { quantity: 500.000, price: 0.35 },
      create: { branchId: branchA.id, ingredientId: custom80gItem.id, quantity: 500.000, price: 0.35 },
    });
    await prisma.inventoryItem.upsert({
      where: { branchId_ingredientId: { branchId: branchB.id, ingredientId: custom80gItem.id } },
      update: { quantity: 0.000, price: 0.35 },
      create: { branchId: branchB.id, ingredientId: custom80gItem.id, quantity: 0.000, price: 0.35 },
    });

    const transfer = await inventoryService.transferInventory(
      {
        sourceBranchId: branchA.id,
        destBranchId: branchB.id,
        ingredientId: custom80gItem.id,
        inputQuantity: 1,
        inputUnit: 'ORDERS',
        notes: 'Transfer 1 order of 80g custom item',
      },
      ownerUser
    );

    assert.ok(transfer);
    assert.equal(transfer.status, 'COMPLETED');
    createdTransferIds.push(transfer.id);

    // Verify 80g conversion snapshot
    assert.equal(Number(transfer.inputQuantity), 1);
    assert.equal(Number(transfer.conversionFactor), 80, 'Conversion factor must reflect custom 80g setting');
    assert.equal(Number(transfer.quantity), 80, 'Transferred quantity must be exactly 80 grams');

    // Source: 500 - 80 = 420 grams
    const sourceStock = await prisma.inventoryItem.findUnique({
      where: { branchId_ingredientId: { branchId: branchA.id, ingredientId: custom80gItem.id } },
    });
    assert.equal(Number(sourceStock.quantity), 420, 'Source stock must be 420 grams (500 - 80)');

    // Destination: 0 + 80 = 80 grams
    const destStock = await prisma.inventoryItem.findUnique({
      where: { branchId_ingredientId: { branchId: branchB.id, ingredientId: custom80gItem.id } },
    });
    assert.equal(Number(destStock.quantity), 80, 'Destination stock must be 80 grams');
  });

  it('Test 6: Branch Selection Consistency — Verifies branch inventory query resolves 19,460g vs 894g discrepancy', async () => {
    // Setup realistic scenario:
    // Branch A (e.g. Sta. Cruz) has 19,460g Barkada Meat
    // Branch B (e.g. Lumban) has 894g Barkada Meat
    await prisma.inventoryItem.update({
      where: { branchId_ingredientId: { branchId: branchA.id, ingredientId: barkadaMeat.id } },
      data: { quantity: 19460.000 },
    });
    await prisma.inventoryItem.update({
      where: { branchId_ingredientId: { branchId: branchB.id, ingredientId: barkadaMeat.id } },
      data: { quantity: 894.000 },
    });

    // Query inventory specifically for Branch A
    const branchAInventory = await inventoryService.getInventory(
      { branchId: branchA.id },
      ownerUser
    );
    const itemInBranchA = branchAInventory.find((i) => i.ingredientId === barkadaMeat.id);
    assert.ok(itemInBranchA, 'Barkada Meat must be in Branch A inventory');
    assert.equal(Number(itemInBranchA.quantity), 19460, 'Branch A must return 19,460g');

    // Query inventory specifically for Branch B
    const branchBInventory = await inventoryService.getInventory(
      { branchId: branchB.id },
      ownerUser
    );
    const itemInBranchB = branchBInventory.find((i) => i.ingredientId === barkadaMeat.id);
    assert.ok(itemInBranchB, 'Barkada Meat must be in Branch B inventory');
    assert.equal(Number(itemInBranchB.quantity), 894, 'Branch B must return 894g');

    // Ensure they are strictly distinct and branch-scoped
    assert.notEqual(
      Number(itemInBranchA.quantity),
      Number(itemInBranchB.quantity),
      'Quantities between Branch A and Branch B must never bleed into each other'
    );
  });
});
