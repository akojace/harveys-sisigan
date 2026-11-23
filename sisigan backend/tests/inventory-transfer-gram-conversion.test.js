// tests/inventory-transfer-gram-conversion.test.js
// Production-grade verification of automated gram conversion for branch inventory transfers.

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const prisma = require('../src/config/db');
const inventoryService = require('../src/modules/inventory/inventory.service');

describe("Harvey's Sisigan — Automated Gram Conversion for Branch Transfers Test Suite", () => {
  let ownerUser;
  let branchA;
  let branchB;
  let sisigItemA; // 100 g/unit
  let sisigItemB; // 150 g/unit
  let normalItem; // Non-converted (e.g. PCS)
  let initialStockA = 5000; // grams
  let initialStockB = 2000; // grams

  const createdTransferIds = [];

  before(async () => {
    // 1. Fetch owner
    ownerUser = await prisma.user.findFirst({ where: { role: 'OWNER' } });
    assert.ok(ownerUser, 'Owner user must exist');

    // 2. Fetch two distinct active branches
    const branches = await prisma.branch.findMany({ where: { isActive: true }, take: 2 });
    assert.equal(branches.length >= 2, true, 'At least 2 active branches required');
    branchA = branches[0];
    branchB = branches[1];

    // 3. Create or find Test Sisig Item A (100g/unit)
    sisigItemA = await prisma.ingredient.upsert({
      where: { name: 'Automated Test Sisig Item A (100g)' },
      update: { gramsPerUnit: 100, unit: 'GRAM', category: 'MAIN_INGREDIENT', defaultPrice: 0.35 },
      create: {
        name: 'Automated Test Sisig Item A (100g)',
        category: 'MAIN_INGREDIENT',
        unit: 'GRAM',
        gramsPerUnit: 100,
        defaultPrice: 0.35,
      },
    });

    // 4. Create or find Test Sisig Item B (150g/unit)
    sisigItemB = await prisma.ingredient.upsert({
      where: { name: 'Automated Test Sisig Item B (150g)' },
      update: { gramsPerUnit: 150, unit: 'GRAM', category: 'MAIN_INGREDIENT', defaultPrice: 0.40 },
      create: {
        name: 'Automated Test Sisig Item B (150g)',
        category: 'MAIN_INGREDIENT',
        unit: 'GRAM',
        gramsPerUnit: 150,
        defaultPrice: 0.40,
      },
    });

    // 5. Create or find Test Normal Item (No gram conversion)
    normalItem = await prisma.ingredient.upsert({
      where: { name: 'Automated Test Egg (No Gram Conv)' },
      update: { gramsPerUnit: null, unit: 'PCS', category: 'MAIN_INGREDIENT', defaultPrice: 8.50 },
      create: {
        name: 'Automated Test Egg (No Gram Conv)',
        category: 'MAIN_INGREDIENT',
        unit: 'PCS',
        gramsPerUnit: null,
        defaultPrice: 8.50,
      },
    });

    // 6. Seed stock in Branch A (5,000 g) and Branch B (2,000 g) for Sisig Item A
    await prisma.inventoryItem.upsert({
      where: { branchId_ingredientId: { branchId: branchA.id, ingredientId: sisigItemA.id } },
      update: { quantity: initialStockA, price: 0.35 },
      create: { branchId: branchA.id, ingredientId: sisigItemA.id, quantity: initialStockA, price: 0.35 },
    });

    await prisma.inventoryItem.upsert({
      where: { branchId_ingredientId: { branchId: branchB.id, ingredientId: sisigItemA.id } },
      update: { quantity: initialStockB, price: 0.35 },
      create: { branchId: branchB.id, ingredientId: sisigItemA.id, quantity: initialStockB, price: 0.35 },
    });

    // Seed stock for Sisig Item B: 4,000 g in Branch A
    await prisma.inventoryItem.upsert({
      where: { branchId_ingredientId: { branchId: branchA.id, ingredientId: sisigItemB.id } },
      update: { quantity: 4000, price: 0.40 },
      create: { branchId: branchA.id, ingredientId: sisigItemB.id, quantity: 4000, price: 0.40 },
    });

    // Seed stock for normalItem: 100 PCS in Branch A
    await prisma.inventoryItem.upsert({
      where: { branchId_ingredientId: { branchId: branchA.id, ingredientId: normalItem.id } },
      update: { quantity: 100, price: 8.50 },
      create: { branchId: branchA.id, ingredientId: normalItem.id, quantity: 100, price: 8.50 },
    });
  });

  after(async () => {
    // Cleanup created transfers and logs
    if (createdTransferIds.length > 0) {
      const trfs = await prisma.inventoryTransfer.findMany({
        where: { id: { in: createdTransferIds } },
        select: { transferNo: true },
      });
      const refs = trfs.map((t) => t.transferNo);
      await prisma.inventoryAuditLog.deleteMany({ where: { referenceNo: { in: refs } } });
      await prisma.inventoryTransfer.deleteMany({ where: { id: { in: createdTransferIds } } });
    }

    // Cleanup test inventory and ingredients
    const ingIds = [sisigItemA?.id, sisigItemB?.id, normalItem?.id].filter(Boolean);
    if (ingIds.length > 0) {
      await prisma.inventoryAuditLog.deleteMany({
        where: { inventoryItem: { ingredientId: { in: ingIds } } },
      });
      await prisma.inventoryItem.deleteMany({ where: { ingredientId: { in: ingIds } } });
      await prisma.ingredient.deleteMany({ where: { id: { in: ingIds } } });
    }
  });

  it('1. Authoritative Automated Gram Conversion: Transferring 10 units @ 100g/unit transfers exactly 1,000g', async () => {
    // Initial: Branch A = 5,000 g, Branch B = 2,000 g
    const transfer = await inventoryService.transferInventory(
      {
        sourceBranchId: branchA.id,
        destBranchId: branchB.id,
        ingredientId: sisigItemA.id,
        inputQuantity: 10,
        inputUnit: 'UNITS',
        notes: 'Replenish Branch B with 10 units',
      },
      ownerUser
    );

    assert.ok(transfer);
    assert.equal(transfer.status, 'COMPLETED');
    createdTransferIds.push(transfer.id);

    // Verify snapshot fields on transfer record
    assert.equal(Number(transfer.inputQuantity), 10);
    assert.equal(transfer.inputUnit, 'UNITS');
    assert.equal(Number(transfer.conversionFactor), 100);
    assert.equal(Number(transfer.quantity), 1000); // 10 × 100 = 1,000 g
    assert.equal(transfer.unit, 'GRAM');

    // Verify Source Branch stock: 5,000 - 1,000 = 4,000 g
    const sourceItem = await prisma.inventoryItem.findUnique({
      where: { branchId_ingredientId: { branchId: branchA.id, ingredientId: sisigItemA.id } },
    });
    assert.equal(Number(sourceItem.quantity), 4000);

    // Verify Destination Branch stock: 2,000 + 1,000 = 3,000 g
    const destItem = await prisma.inventoryItem.findUnique({
      where: { branchId_ingredientId: { branchId: branchB.id, ingredientId: sisigItemA.id } },
    });
    assert.equal(Number(destItem.quantity), 3000);

    // Verify Audit Logs: exactly one TRANSFER_OUT (-1000) and one TRANSFER_IN (+1000)
    const logs = await prisma.inventoryAuditLog.findMany({
      where: { referenceNo: transfer.transferNo },
    });
    assert.equal(logs.length, 2);

    const outLog = logs.find((l) => l.actionType === 'TRANSFER_OUT');
    const inLog = logs.find((l) => l.actionType === 'TRANSFER_IN');

    assert.equal(Number(outLog.quantityChanged), -1000);
    assert.equal(Number(inLog.quantityChanged), 1000);
    assert.match(outLog.note, /10 UNITS \(1,000 g @ 100 g\/unit\)/);
    assert.match(inLog.note, /10 UNITS \(1,000 g @ 100 g\/unit\)/);
  });

  it('2. Independent Conversion Factor: Transferring 10 units @ 150g/unit transfers exactly 1,500g', async () => {
    // Initial Sisig Item B: Branch A = 4,000 g, Branch B does not exist yet (upsert test)
    const transfer = await inventoryService.transferInventory(
      {
        sourceBranchId: branchA.id,
        destBranchId: branchB.id,
        ingredientId: sisigItemB.id,
        inputQuantity: 10,
        inputUnit: 'ORDERS',
        notes: 'Emergency sisig orders',
      },
      ownerUser
    );

    assert.ok(transfer);
    createdTransferIds.push(transfer.id);

    // Verify snapshot fields
    assert.equal(Number(transfer.inputQuantity), 10);
    assert.equal(transfer.inputUnit, 'ORDERS');
    assert.equal(Number(transfer.conversionFactor), 150);
    assert.equal(Number(transfer.quantity), 1500); // 10 × 150 = 1,500 g

    // Source Branch: 4,000 - 1,500 = 2,500 g
    const sourceItem = await prisma.inventoryItem.findUnique({
      where: { branchId_ingredientId: { branchId: branchA.id, ingredientId: sisigItemB.id } },
    });
    assert.equal(Number(sourceItem.quantity), 2500);

    // Destination Branch: newly created with 1,500 g
    const destItem = await prisma.inventoryItem.findUnique({
      where: { branchId_ingredientId: { branchId: branchB.id, ingredientId: sisigItemB.id } },
    });
    assert.ok(destItem);
    assert.equal(Number(destItem.quantity), 1500);
  });

  it('3. Historical Immutability: Updating an item conversion factor does NOT alter past transfer records', async () => {
    // Change Sisig Item A from 100 g/unit to 120 g/unit
    await prisma.ingredient.update({
      where: { id: sisigItemA.id },
      data: { gramsPerUnit: 120 },
    });

    // Retrieve previous transfer records via getTransfers
    const list = await inventoryService.getTransfers({ branchId: branchA.id }, ownerUser);
    const pastTransfer = list.find((t) => t.id === createdTransferIds[0]);

    assert.ok(pastTransfer);
    assert.equal(Number(pastTransfer.inputQuantity), 10);
    assert.equal(Number(pastTransfer.conversionFactor), 100, 'Historical transfer must keep 100g conversion factor');
    assert.equal(Number(pastTransfer.quantity), 1000, 'Historical transfer must keep 1,000g transferred');

    // Reset back to 100 for remaining tests
    await prisma.ingredient.update({
      where: { id: sisigItemA.id },
      data: { gramsPerUnit: 100 },
    });
  });

  it('4. Insufficient Stock Prevention: Rejects transfer when calculated grams exceed source stock', async () => {
    // Branch A currently has 4,000 g of Sisig Item A.
    // Requesting 50 units @ 100 g/unit = 5,000 g, which exceeds 4,000 g.
    await assert.rejects(
      async () => {
        await inventoryService.transferInventory(
          {
            sourceBranchId: branchA.id,
            destBranchId: branchB.id,
            ingredientId: sisigItemA.id,
            inputQuantity: 50, // 5,000 g
            inputUnit: 'UNITS',
          },
          ownerUser
        );
      },
      (err) => {
        assert.equal(err.statusCode, 400);
        assert.match(err.message, /Insufficient stock/i);
        return true;
      }
    );

    // Verify stock was NOT touched
    const sourceItem = await prisma.inventoryItem.findUnique({
      where: { branchId_ingredientId: { branchId: branchA.id, ingredientId: sisigItemA.id } },
    });
    assert.equal(Number(sourceItem.quantity), 4000);
  });

  it('5. Input Validation: Rejects zero, negative, invalid quantities and identical branches', async () => {
    // Zero quantity
    await assert.rejects(
      async () => {
        await inventoryService.transferInventory(
          {
            sourceBranchId: branchA.id,
            destBranchId: branchB.id,
            ingredientId: sisigItemA.id,
            inputQuantity: 0,
          },
          ownerUser
        );
      },
      (err) => {
        assert.equal(err.statusCode, 400);
        return true;
      }
    );

    // Negative quantity
    await assert.rejects(
      async () => {
        await inventoryService.transferInventory(
          {
            sourceBranchId: branchA.id,
            destBranchId: branchB.id,
            ingredientId: sisigItemA.id,
            inputQuantity: -5,
          },
          ownerUser
        );
      },
      (err) => {
        assert.equal(err.statusCode, 400);
        return true;
      }
    );

    // Identical branches
    await assert.rejects(
      async () => {
        await inventoryService.transferInventory(
          {
            sourceBranchId: branchA.id,
            destBranchId: branchA.id,
            ingredientId: sisigItemA.id,
            inputQuantity: 5,
          },
          ownerUser
        );
      },
      (err) => {
        assert.equal(err.statusCode, 400);
        assert.match(err.message, /cannot be the same/i);
        return true;
      }
    );
  });

  it('6. Compatibility: Standard non-gram item transfers continue to work without modification', async () => {
    // Normal Item (Egg PCS): Branch A = 100 PCS
    const transfer = await inventoryService.transferInventory(
      {
        sourceBranchId: branchA.id,
        destBranchId: branchB.id,
        ingredientId: normalItem.id,
        quantity: 25,
        unit: 'PCS',
        notes: 'Transfer 25 PCS eggs',
      },
      ownerUser
    );

    assert.ok(transfer);
    createdTransferIds.push(transfer.id);

    // Verify conversion snapshot fields are null for non-gram items
    assert.equal(transfer.conversionFactor, null);
    assert.equal(transfer.inputQuantity, null);
    assert.equal(Number(transfer.quantity), 25);
    assert.equal(transfer.unit, 'PCS');

    // Source loses 25 PCS: 100 - 25 = 75 PCS
    const sourceItem = await prisma.inventoryItem.findUnique({
      where: { branchId_ingredientId: { branchId: branchA.id, ingredientId: normalItem.id } },
    });
    assert.equal(Number(sourceItem.quantity), 75);

    // Destination receives 25 PCS
    const destItem = await prisma.inventoryItem.findUnique({
      where: { branchId_ingredientId: { branchId: branchB.id, ingredientId: normalItem.id } },
    });
    assert.equal(Number(destItem.quantity), 25);
  });

  it('7. Unconfigured Item Protection: Rejects unit-based gram conversion on items without conversion factor', async () => {
    await assert.rejects(
      async () => {
        await inventoryService.transferInventory(
          {
            sourceBranchId: branchA.id,
            destBranchId: branchB.id,
            ingredientId: normalItem.id,
            inputQuantity: 5,
            inputUnit: 'UNITS', // Item has gramsPerUnit: null
          },
          ownerUser
        );
      },
      (err) => {
        assert.equal(err.statusCode, 400);
        assert.match(err.message, /does not have a configured gram conversion factor/i);
        return true;
      }
    );
  });

  it('8. Atomic Transfer Cancellation & Inventory Restoration', async () => {
    // Current Sisig Item A: Branch A = 4,000 g, Branch B = 3,000 g
    // Transfer 5 units @ 100g/unit = 500 g
    const transfer = await inventoryService.transferInventory(
      {
        sourceBranchId: branchA.id,
        destBranchId: branchB.id,
        ingredientId: sisigItemA.id,
        inputQuantity: 5,
        inputUnit: 'UNITS',
        notes: 'Transfer to be cancelled',
      },
      ownerUser
    );

    createdTransferIds.push(transfer.id);
    assert.equal(Number(transfer.quantity), 500);

    // After transfer: Branch A = 3,500 g, Branch B = 3,500 g
    let sA = await prisma.inventoryItem.findUnique({
      where: { branchId_ingredientId: { branchId: branchA.id, ingredientId: sisigItemA.id } },
    });
    let sB = await prisma.inventoryItem.findUnique({
      where: { branchId_ingredientId: { branchId: branchB.id, ingredientId: sisigItemA.id } },
    });
    assert.equal(Number(sA.quantity), 3500);
    assert.equal(Number(sB.quantity), 3500);

    // Now cancel the transfer
    const cancelled = await inventoryService.cancelTransfer(transfer.id, ownerUser);
    assert.equal(cancelled.status, 'CANCELLED');

    // Verify inventory restored atomically:
    // Branch A receives 500 g back: 3,500 + 500 = 4,000 g
    // Branch B loses 500 g: 3,500 - 500 = 3,000 g
    sA = await prisma.inventoryItem.findUnique({
      where: { branchId_ingredientId: { branchId: branchA.id, ingredientId: sisigItemA.id } },
    });
    sB = await prisma.inventoryItem.findUnique({
      where: { branchId_ingredientId: { branchId: branchB.id, ingredientId: sisigItemA.id } },
    });
    assert.equal(Number(sA.quantity), 4000);
    assert.equal(Number(sB.quantity), 3000);

    // Verify double cancellation is blocked
    await assert.rejects(
      async () => {
        await inventoryService.cancelTransfer(transfer.id, ownerUser);
      },
      (err) => {
        assert.equal(err.statusCode, 400);
        assert.match(err.message, /already CANCELLED/i);
        return true;
      }
    );
  });

  it('9. Item-Level Configuration via updateIngredientDetails: Updates and clears conversion factor with validation', async () => {
    // Find inventory item for sisigItemA in Branch A
    const itemA = await prisma.inventoryItem.findUnique({
      where: { branchId_ingredientId: { branchId: branchA.id, ingredientId: sisigItemA.id } },
    });

    // Valid update to 200 g/unit
    const updated = await inventoryService.updateIngredientDetails(
      itemA.id,
      { gramsPerUnit: 200 },
      ownerUser
    );
    assert.equal(Number(updated.ingredient.gramsPerUnit), 200);

    // Verify persisted in DB
    const inDb = await prisma.ingredient.findUnique({ where: { id: sisigItemA.id } });
    assert.equal(Number(inDb.gramsPerUnit), 200);

    // Reject invalid gramsPerUnit (negative, 0)
    await assert.rejects(
      async () => {
        await inventoryService.updateIngredientDetails(itemA.id, { gramsPerUnit: -50 }, ownerUser);
      },
      (err) => {
        assert.equal(err.statusCode, 400);
        assert.match(err.message, /greater than zero/i);
        return true;
      }
    );

    // Clear gramsPerUnit (set to null)
    const cleared = await inventoryService.updateIngredientDetails(
      itemA.id,
      { gramsPerUnit: '' },
      ownerUser
    );
    assert.equal(cleared.ingredient.gramsPerUnit, null);

    // Reset back to 100 for test cleanliness
    await inventoryService.updateIngredientDetails(
      itemA.id,
      { gramsPerUnit: 100 },
      ownerUser
    );
  });

  it('10. Inventory Listing Verification: getInventory surfaces gramsPerUnit for UI rendering', async () => {
    const items = await inventoryService.getInventory({ branchId: branchA.id }, ownerUser);
    const foundA = items.find((i) => i.ingredientId === sisigItemA.id);
    const foundNormal = items.find((i) => i.ingredientId === normalItem.id);

    assert.ok(foundA);
    assert.equal(Number(foundA.ingredient.gramsPerUnit), 100);

    assert.ok(foundNormal);
    assert.equal(foundNormal.ingredient.gramsPerUnit, null);
  });

  it('11. Concurrency Simulation: Prevents double-transfer or negative stock under race conditions', async () => {
    // Set Branch A stock to exactly 1,000 g
    await prisma.inventoryItem.update({
      where: { branchId_ingredientId: { branchId: branchA.id, ingredientId: sisigItemA.id } },
      data: { quantity: 1000 },
    });

    // Attempt two simultaneous transfers of 10 units (1,000 g each)
    const [res1, res2] = await Promise.allSettled([
      inventoryService.transferInventory(
        {
          sourceBranchId: branchA.id,
          destBranchId: branchB.id,
          ingredientId: sisigItemA.id,
          inputQuantity: 10,
          inputUnit: 'UNITS',
          notes: 'Race transfer 1',
        },
        ownerUser
      ),
      inventoryService.transferInventory(
        {
          sourceBranchId: branchA.id,
          destBranchId: branchB.id,
          ingredientId: sisigItemA.id,
          inputQuantity: 10,
          inputUnit: 'UNITS',
          notes: 'Race transfer 2',
        },
        ownerUser
      ),
    ]);

    // Track any succeeded transfer for cleanup
    if (res1.status === 'fulfilled') createdTransferIds.push(res1.value.id);
    if (res2.status === 'fulfilled') createdTransferIds.push(res2.value.id);

    const fulfilledCount = [res1, res2].filter((r) => r.status === 'fulfilled').length;
    const rejectedCount = [res1, res2].filter((r) => r.status === 'rejected').length;

    assert.equal(fulfilledCount, 1, 'Exactly one concurrent transfer must succeed');
    assert.equal(rejectedCount, 1, 'The competing transfer must be rejected due to insufficient stock');

    // Final source stock must be exactly 0, never negative
    const finalSource = await prisma.inventoryItem.findUnique({
      where: { branchId_ingredientId: { branchId: branchA.id, ingredientId: sisigItemA.id } },
    });
    assert.equal(Number(finalSource.quantity), 0);
  });

  it('12. Recipe-Derived Conversion Factor: Automatically retrieves portion from recipe BOM when gramsPerUnit is null', async () => {
    // Create an ingredient with gramsPerUnit = null
    const recipeItem = await prisma.ingredient.upsert({
      where: { name: 'Automated Recipe BOM Meat (Null GPU)' },
      update: { gramsPerUnit: null, unit: 'GRAM', category: 'MAIN_INGREDIENT', defaultPrice: 0.50 },
      create: {
        name: 'Automated Recipe BOM Meat (Null GPU)',
        category: 'MAIN_INGREDIENT',
        unit: 'GRAM',
        gramsPerUnit: null,
        defaultPrice: 0.50,
      },
    });

    // Find any existing menu item
    let menuItem = await prisma.menuItem.findFirst();
    if (!menuItem) {
      const cat = await prisma.category.findFirst() || await prisma.category.create({ data: { name: 'Test Cat' } });
      menuItem = await prisma.menuItem.create({
        data: { name: 'Test Sisig Plate', categoryId: cat.id, price: 120 },
      });
    }

    // Link a recipe BOM with 100g per order
    const recipeLink = await prisma.menuItemRecipeIngredient.create({
      data: {
        menuItemId: menuItem.id,
        ingredientId: recipeItem.id,
        quantity: 100,
        unit: 'GRAM',
      },
    });

    // Seed stock: 3,000 g in Branch A
    await prisma.inventoryItem.upsert({
      where: { branchId_ingredientId: { branchId: branchA.id, ingredientId: recipeItem.id } },
      update: { quantity: 3000, price: 0.50 },
      create: { branchId: branchA.id, ingredientId: recipeItem.id, quantity: 3000, price: 0.50 },
    });

    let transfer;
    try {
      // Transfer 10 orders -> automatically converts to 1,000 g using recipe BOM!
      transfer = await inventoryService.transferInventory(
        {
          sourceBranchId: branchA.id,
          destBranchId: branchB.id,
          ingredientId: recipeItem.id,
          inputQuantity: 10,
          inputUnit: 'ORDERS',
          notes: 'Transfer 10 orders using recipe BOM',
        },
        ownerUser
      );

      assert.ok(transfer);

      assert.equal(Number(transfer.inputQuantity), 10);
      assert.equal(Number(transfer.conversionFactor), 100);
      assert.equal(Number(transfer.quantity), 1000);
      assert.equal(transfer.unit, 'GRAM');

      // Verify stock in source: 3,000 - 1,000 = 2,000 g
      const updatedSource = await prisma.inventoryItem.findUnique({
        where: { branchId_ingredientId: { branchId: branchA.id, ingredientId: recipeItem.id } },
      });
      assert.equal(Number(updatedSource.quantity), 2000);
    } finally {
      // Cleanup recipe link, transfers, and test ingredient
      await prisma.menuItemRecipeIngredient.delete({ where: { id: recipeLink.id } });
      if (transfer?.transferNo) {
        await prisma.inventoryAuditLog.deleteMany({
          where: { referenceNo: transfer.transferNo },
        });
      }
      await prisma.inventoryTransfer.deleteMany({
        where: { ingredientId: recipeItem.id },
      });
      await prisma.inventoryAuditLog.deleteMany({
        where: { inventoryItem: { ingredientId: recipeItem.id } },
      });
      await prisma.inventoryItem.deleteMany({ where: { ingredientId: recipeItem.id } });
      await prisma.ingredient.delete({ where: { id: recipeItem.id } });
    }
  });

  it('13. Unconfigured Gram Item Protection: Blocks transfer if gram item has neither gramsPerUnit nor recipe BOM', async () => {
    // Create an ingredient with gramsPerUnit = null and NO recipes
    const unconfiguredItem = await prisma.ingredient.upsert({
      where: { name: 'Automated Unconfigured Gram Item' },
      update: { gramsPerUnit: null, unit: 'GRAM', category: 'MAIN_INGREDIENT', defaultPrice: 0.30 },
      create: {
        name: 'Automated Unconfigured Gram Item',
        category: 'MAIN_INGREDIENT',
        unit: 'GRAM',
        gramsPerUnit: null,
        defaultPrice: 0.30,
      },
    });

    // Seed stock: 2,000 g in Branch A
    await prisma.inventoryItem.upsert({
      where: { branchId_ingredientId: { branchId: branchA.id, ingredientId: unconfiguredItem.id } },
      update: { quantity: 2000, price: 0.30 },
      create: { branchId: branchA.id, ingredientId: unconfiguredItem.id, quantity: 2000, price: 0.30 },
    });

    try {
      await assert.rejects(
        async () => {
          await inventoryService.transferInventory(
            {
              sourceBranchId: branchA.id,
              destBranchId: branchB.id,
              ingredientId: unconfiguredItem.id,
              inputQuantity: 10,
              inputUnit: 'ORDERS',
            },
            ownerUser
          );
        },
        (err) => {
          assert.equal(err.statusCode, 400);
          assert.match(err.message, /does not have a configured gram conversion factor or recipe requirement/i);
          return true;
        }
      );
    } finally {
      await prisma.inventoryAuditLog.deleteMany({
        where: { inventoryItem: { ingredientId: unconfiguredItem.id } },
      });
      await prisma.inventoryItem.deleteMany({ where: { ingredientId: unconfiguredItem.id } });
      await prisma.ingredient.delete({ where: { id: unconfiguredItem.id } });
    }
  });
});
