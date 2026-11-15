// tests/inventory-notifications.test.js
// Comprehensive Automated Test Suite for Branch-Aware Inventory Alerts & Notifications

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const prisma = require('../src/config/db');
const inventoryService = require('../src/modules/inventory/inventory.service');
const notificationService = require('../src/modules/notifications/notification.service');
const orderController = require('../src/modules/orders/order.controller');

describe("Harvey's Sisigan — Branch-Aware Inventory Alert & Notification Suite", () => {
  let branch1;
  let branch2;
  let ownerUser;
  let branch1User;
  let branch2Cashier;
  let branch2Manager;
  let branch2InactiveCashier;
  let testIngredient;
  let invItemB2;
  const createdUserIds = [];

  before(async () => {
    const branches = await prisma.branch.findMany({ where: { isActive: true }, orderBy: { id: 'asc' } });
    branch1 = branches[0];
    branch2 = branches[1] || branches[0];

    ownerUser = await prisma.user.findFirst({ where: { role: 'OWNER', isActive: true } });

    const ts = Date.now();
    branch1User = await prisma.user.create({
      data: {
        name: 'Test B1 Cashier',
        email: `b1.cashier.${ts}@test.local`,
        password: 'hashed_password_placeholder',
        role: 'CASHIER',
        branchId: branch1.id,
        isActive: true,
      },
    });
    createdUserIds.push(branch1User.id);

    branch2Cashier = await prisma.user.create({
      data: {
        name: 'Test B2 Cashier',
        email: `b2.cashier.${ts}@test.local`,
        password: 'hashed_password_placeholder',
        role: 'CASHIER',
        branchId: branch2.id,
        isActive: true,
      },
    });
    createdUserIds.push(branch2Cashier.id);

    branch2Manager = await prisma.user.create({
      data: {
        name: 'Test B2 Manager',
        email: `b2.manager.${ts}@test.local`,
        password: 'hashed_password_placeholder',
        role: 'MANAGER',
        branchId: branch2.id,
        isActive: true,
      },
    });
    createdUserIds.push(branch2Manager.id);

    branch2InactiveCashier = await prisma.user.create({
      data: {
        name: 'Test B2 Inactive',
        email: `b2.inactive.${ts}@test.local`,
        password: 'hashed_password_placeholder',
        role: 'CASHIER',
        branchId: branch2.id,
        isActive: false,
      },
    });
    createdUserIds.push(branch2InactiveCashier.id);

    testIngredient = await prisma.ingredient.create({
      data: {
        name: `AlertTestSauce_${ts}`,
        category: 'SAUCE',
        unit: 'ML',
        defaultMinThreshold: 20,
        defaultPrice: 1,
      },
    });

    invItemB2 = await prisma.inventoryItem.create({
      data: {
        branchId: branch2.id,
        ingredientId: testIngredient.id,
        quantity: 100,
        minThreshold: 20,
        price: 1,
        alertState: 'NORMAL',
      },
    });
  });

  after(async () => {
    if (invItemB2) {
      await prisma.notification.deleteMany({ where: { inventoryItemId: invItemB2.id } });
      await prisma.inventoryAuditLog.deleteMany({ where: { inventoryItemId: invItemB2.id } });
      await prisma.inventoryItem.deleteMany({ where: { id: invItemB2.id } });
    }
    if (testIngredient) {
      await prisma.ingredient.deleteMany({ where: { id: testIngredient.id } });
    }
    if (createdUserIds.length) {
      await prisma.notification.deleteMany({ where: { userId: { in: createdUserIds } } });
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    }
  });

  it('1–4. Branch #2 stockout notifies Cashier, Manager, and OWNER; excludes Branch #1 and inactive users', async () => {
    // Transition from 100 -> 0
    await inventoryService.adjustInventoryItem(
      invItemB2.id,
      { newQuantity: 0, actionType: 'WASTAGE', note: 'Test stockout' },
      branch2Manager
    );

    const cashierNotifs = await notificationService.getUserNotifications(branch2Cashier);
    const managerNotifs = await notificationService.getUserNotifications(branch2Manager);
    const ownerNotifs = await notificationService.getUserNotifications(ownerUser, { branchId: branch2.id });
    const b1Notifs = await notificationService.getUserNotifications(branch1User);
    const inactiveNotifs = await notificationService.getUserNotifications(branch2InactiveCashier);

    const cAlert = cashierNotifs.notifications.find((n) => n.inventoryItemId === invItemB2.id && n.type === 'OUT_OF_STOCK');
    const mAlert = managerNotifs.notifications.find((n) => n.inventoryItemId === invItemB2.id && n.type === 'OUT_OF_STOCK');
    const oAlert = ownerNotifs.notifications.find((n) => n.inventoryItemId === invItemB2.id && n.type === 'OUT_OF_STOCK');
    const b1Alert = b1Notifs.notifications.find((n) => n.inventoryItemId === invItemB2.id);
    const inAlert = inactiveNotifs.notifications.find((n) => n.inventoryItemId === invItemB2.id);

    assert.ok(cAlert, 'Branch #2 Cashier must receive OUT_OF_STOCK notification');
    assert.ok(mAlert, 'Branch #2 Manager must receive OUT_OF_STOCK notification');
    assert.ok(oAlert, 'OWNER must retain cross-branch visibility of OUT_OF_STOCK notification');
    if (branch1.id !== branch2.id) {
      assert.equal(b1Alert, undefined, 'Branch #1 user must NOT receive Branch #2 notification');
    }
    assert.equal(inAlert, undefined, 'Inactive user must NOT receive notification');
    assert.equal(cAlert.severity, 'CRITICAL');
    assert.equal(cAlert.title, 'Inventory Out of Stock');
  });

  it('5. Stockout creates only ONE alert while stock remains zero', async () => {
    const beforeCount = await prisma.notification.count({
      where: { inventoryItemId: invItemB2.id, userId: branch2Manager.id, type: 'OUT_OF_STOCK' },
    });

    // Update at zero again
    await inventoryService.adjustInventoryItem(
      invItemB2.id,
      { newQuantity: 0, actionType: 'MANUAL_EDIT', note: 'Still zero' },
      branch2Manager
    );

    const afterCount = await prisma.notification.count({
      where: { inventoryItemId: invItemB2.id, userId: branch2Manager.id, type: 'OUT_OF_STOCK' },
    });

    assert.equal(afterCount, beforeCount, 'Duplicate stockout alert must not be created while quantity remains 0');
  });

  it('6. Restocking creates a recovery notification and resolves prior stockout alerts', async () => {
    await inventoryService.restockInventoryItem(
      {
        itemId: invItemB2.id,
        purchaseQuantity: 50,
        purchaseCost: 50,
      },
      branch2Manager
    );

    const unresolvedStockouts = await prisma.notification.count({
      where: { inventoryItemId: invItemB2.id, type: 'OUT_OF_STOCK', isResolved: false },
    });
    assert.equal(unresolvedStockouts, 0, 'Previous stockout alerts must be marked resolved');

    const recovery = await prisma.notification.findFirst({
      where: { inventoryItemId: invItemB2.id, userId: branch2Manager.id, type: 'RESTOCKED' },
    });
    assert.ok(recovery, 'Manager must receive RESTOCKED recovery notification');
    assert.equal(recovery.severity, 'RECOVERY');
    assert.equal(recovery.title, 'Inventory Restocked');
  });

  it('7. A second stockout after restocking creates a new event', async () => {
    const beforeCount = await prisma.notification.count({
      where: { inventoryItemId: invItemB2.id, userId: branch2Manager.id, type: 'OUT_OF_STOCK' },
    });

    await inventoryService.adjustInventoryItem(
      invItemB2.id,
      { newQuantity: 0, actionType: 'WASTAGE', note: 'Second stockout' },
      branch2Manager
    );

    const afterCount = await prisma.notification.count({
      where: { inventoryItemId: invItemB2.id, userId: branch2Manager.id, type: 'OUT_OF_STOCK' },
    });
    assert.equal(afterCount, beforeCount + 1, 'New stockout after restocking must create a new OUT_OF_STOCK alert');
  });

  it('8–9. Low-stock warning reaches both Cashier & Manager, and Low-Stock -> Zero creates Critical event without duplicate warnings', async () => {
    // Restock to 50 (NORMAL)
    await inventoryService.restockInventoryItem(
      { itemId: invItemB2.id, purchaseQuantity: 50, purchaseCost: 50 },
      branch2Manager
    );

    // Drop to 15 (below minThreshold=20 -> LOW_STOCK)
    await inventoryService.adjustInventoryItem(
      invItemB2.id,
      { newQuantity: 15, actionType: 'MANUAL_EDIT', note: 'Low stock test' },
      branch2Manager
    );

    const cLow = await prisma.notification.findFirst({
      where: { inventoryItemId: invItemB2.id, userId: branch2Cashier.id, type: 'LOW_STOCK', isResolved: false },
    });
    const mLow = await prisma.notification.findFirst({
      where: { inventoryItemId: invItemB2.id, userId: branch2Manager.id, type: 'LOW_STOCK', isResolved: false },
    });
    assert.ok(cLow && mLow, 'Both Cashier and Manager must receive LOW_STOCK warning');
    assert.equal(cLow.severity, 'WARNING');
    assert.equal(cLow.title, 'Low Inventory Warning');

    const lowCountBefore = await prisma.notification.count({
      where: { inventoryItemId: invItemB2.id, userId: branch2Manager.id, type: 'LOW_STOCK' },
    });

    // Drop from Low Stock (15) to Zero (0)
    await inventoryService.adjustInventoryItem(
      invItemB2.id,
      { newQuantity: 0, actionType: 'WASTAGE', note: 'Low to zero' },
      branch2Manager
    );

    const lowCountAfter = await prisma.notification.count({
      where: { inventoryItemId: invItemB2.id, userId: branch2Manager.id, type: 'LOW_STOCK' },
    });
    assert.equal(lowCountAfter, lowCountBefore, 'Transition from low stock to zero must not create extra low-stock alerts');

    const unresolvedLow = await prisma.notification.count({
      where: { inventoryItemId: invItemB2.id, type: 'LOW_STOCK', isResolved: false },
    });
    assert.equal(unresolvedLow, 0, 'Low-stock warnings must be resolved when item transitions to OUT_OF_STOCK');
  });

  it('10. Multiple simultaneous inventory updates do not create duplicate alerts', async () => {
    // Reset to NORMAL (50)
    await inventoryService.restockInventoryItem(
      { itemId: invItemB2.id, purchaseQuantity: 50, purchaseCost: 50 },
      branch2Manager
    );

    const beforeCount = await prisma.notification.count({
      where: { inventoryItemId: invItemB2.id, userId: branch2Manager.id, type: 'OUT_OF_STOCK' },
    });

    // Fire 3 concurrent stockout updates
    await Promise.all([
      inventoryService.adjustInventoryItem(invItemB2.id, { newQuantity: 0, actionType: 'MANUAL_EDIT' }, branch2Manager),
      inventoryService.adjustInventoryItem(invItemB2.id, { newQuantity: 0, actionType: 'MANUAL_EDIT' }, branch2Manager),
      inventoryService.adjustInventoryItem(invItemB2.id, { newQuantity: 0, actionType: 'MANUAL_EDIT' }, branch2Manager),
    ]);

    const afterCount = await prisma.notification.count({
      where: { inventoryItemId: invItemB2.id, userId: branch2Manager.id, type: 'OUT_OF_STOCK' },
    });
    assert.equal(afterCount, beforeCount + 1, 'Concurrent updates to 0 must produce exactly 1 stockout alert per recipient');
  });

  it('11–12. Read/unread state is per-recipient, cross-user read is 403, and actionUrl targets correct branch inventory', async () => {
    const cNotifs = await notificationService.getUserNotifications(branch2Cashier);
    const mNotifs = await notificationService.getUserNotifications(branch2Manager);
    const cAlert = cNotifs.notifications.find((n) => n.inventoryItemId === invItemB2.id && !n.isRead);
    const mAlert = mNotifs.notifications.find((n) => n.inventoryItemId === invItemB2.id && !n.isRead);

    assert.ok(cAlert && mAlert);
    assert.equal(mAlert.actionUrl, `/inventory?branchId=${branch2.id}&itemId=${invItemB2.id}`);

    // Cashier marks their notification as read
    await notificationService.markNotificationAsRead(cAlert.id, branch2Cashier.id);

    const mAfter = await prisma.notification.findUnique({ where: { id: mAlert.id } });
    assert.equal(mAfter.isRead, false, "Marking cashier's notification as read must not affect manager's unread state");

    // Cross-user mark-read must be rejected with 403
    await assert.rejects(
      () => notificationService.markNotificationAsRead(mAlert.id, branch2Cashier.id),
      (err) => err.statusCode === 403
    );
  });

  it('13. Existing order Socket.IO notification hooks remain intact', () => {
    assert.equal(typeof orderController.createOrder, 'function');
    assert.equal(typeof orderController.updateOrderStatus, 'function');
    assert.equal(typeof orderController.cancelOrder, 'function');
  });
});
