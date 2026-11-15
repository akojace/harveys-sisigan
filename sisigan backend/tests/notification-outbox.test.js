// tests/notification-outbox.test.js
// Automated Test Suite for Transactional Outbox (NotificationOutbox) Inventory Alerts

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const prisma = require('../src/config/db');
const inventoryService = require('../src/modules/inventory/inventory.service');
const orderService = require('../src/modules/orders/order.service');
const notificationService = require('../src/modules/notifications/notification.service');

describe("Harvey's Sisigan — Transactional Outbox Inventory Notification Suite", () => {
  let branch1;
  let branch2;
  let ownerUser;
  let branch1Cashier;
  let branch2Cashier;
  let branch2Manager;
  let testIngredient;
  let testCategory;
  let testMenuItem;
  let invItemB2;

  const createdUserIds = [];
  const createdOrderIds = [];
  const createdOutboxEventIds = [];

  before(async () => {
    const branches = await prisma.branch.findMany({ where: { isActive: true }, orderBy: { id: 'asc' } });
    branch1 = branches[0];
    branch2 = branches[1] || branches[0];

    ownerUser = await prisma.user.findFirst({ where: { role: 'OWNER', isActive: true } });

    const ts = Date.now();
    branch1Cashier = await prisma.user.create({
      data: {
        name: 'Outbox B1 Cashier',
        email: `outbox.b1.cashier.${ts}@test.local`,
        password: 'hashed_password_placeholder',
        role: 'CASHIER',
        branchId: branch1.id,
        isActive: true,
      },
    });
    createdUserIds.push(branch1Cashier.id);

    branch2Cashier = await prisma.user.create({
      data: {
        name: 'Outbox B2 Cashier',
        email: `outbox.b2.cashier.${ts}@test.local`,
        password: 'hashed_password_placeholder',
        role: 'CASHIER',
        branchId: branch2.id,
        isActive: true,
      },
    });
    createdUserIds.push(branch2Cashier.id);

    branch2Manager = await prisma.user.create({
      data: {
        name: 'Outbox B2 Manager',
        email: `outbox.b2.manager.${ts}@test.local`,
        password: 'hashed_password_placeholder',
        role: 'MANAGER',
        branchId: branch2.id,
        isActive: true,
      },
    });
    createdUserIds.push(branch2Manager.id);

    testIngredient = await prisma.ingredient.create({
      data: {
        name: `Outbox Test Pork ${ts}`,
        category: 'MAIN_INGREDIENT',
        unit: 'KG',
        defaultMinThreshold: 5,
        defaultPrice: 250,
      },
    });

    invItemB2 = await prisma.inventoryItem.create({
      data: {
        branchId: branch2.id,
        ingredientId: testIngredient.id,
        quantity: 10,
        minThreshold: 5,
        price: 250,
        alertState: 'NORMAL',
      },
    });

    testCategory = await prisma.category.create({
      data: { name: `Outbox Cat ${ts}` },
    });

    testMenuItem = await prisma.menuItem.create({
      data: {
        name: `Outbox Sisig ${ts}`,
        price: 150,
        categoryId: testCategory.id,
        isAvailable: true,
        recipes: {
          create: [{ ingredientId: testIngredient.id, quantity: 2 }],
        },
        branchAvailability: {
          create: [{ branchId: branch2.id, isAvailable: true }],
        },
      },
    });
  });

  after(async () => {
    if (createdOutboxEventIds.length > 0) {
      await prisma.notification.deleteMany({
        where: { outboxEventId: { in: createdOutboxEventIds } },
      });
      await prisma.notificationOutbox.deleteMany({
        where: { eventId: { in: createdOutboxEventIds } },
      });
    }
    if (invItemB2) {
      await prisma.notification.deleteMany({ where: { inventoryItemId: invItemB2.id } });
      await prisma.notificationOutbox.deleteMany({ where: { inventoryItemId: invItemB2.id } });
      await prisma.inventoryAuditLog.deleteMany({ where: { inventoryItemId: invItemB2.id } });
    }
    if (createdOrderIds.length > 0) {
      await prisma.orderItem.deleteMany({ where: { orderId: { in: createdOrderIds } } });
      await prisma.order.deleteMany({ where: { id: { in: createdOrderIds } } });
    }
    if (testMenuItem) {
      await prisma.menuItemRecipeIngredient.deleteMany({ where: { menuItemId: testMenuItem.id } });
      await prisma.branchMenuItem.deleteMany({ where: { menuItemId: testMenuItem.id } });
      await prisma.menuItem.deleteMany({ where: { id: testMenuItem.id } });
    }
    if (testCategory) {
      await prisma.category.deleteMany({ where: { id: testCategory.id } });
    }
    if (invItemB2) {
      await prisma.inventoryItem.deleteMany({ where: { id: invItemB2.id } });
    }
    if (testIngredient) {
      await prisma.ingredient.deleteMany({ where: { id: testIngredient.id } });
    }
    if (createdUserIds.length > 0) {
      await prisma.notification.deleteMany({ where: { userId: { in: createdUserIds } } });
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    }
  });

  it('1. Inventory transition and outbox creation commit together as PENDING', async () => {
    const outboxEvent = await prisma.$transaction(async (tx) => {
      await tx.inventoryItem.update({
        where: { id: invItemB2.id },
        data: { quantity: 3 },
      });
      return notificationService.evaluateAndClaimTransition(tx, {
        inventoryItemId: invItemB2.id,
        branchId: branch2.id,
        newQuantity: 3,
        minThreshold: 5,
        itemName: testIngredient.name,
        branchName: branch2.name,
        unit: 'KG',
      });
    });

    assert.ok(outboxEvent, 'Outbox event should be created on OK -> LOW_STOCK transition');
    assert.equal(outboxEvent.status, 'PENDING');
    assert.equal(outboxEvent.targetState, 'LOW_STOCK');
    assert.equal(outboxEvent.inventoryItemId, invItemB2.id);
    createdOutboxEventIds.push(outboxEvent.eventId);

    const persisted = await prisma.notificationOutbox.findUnique({
      where: { eventId: outboxEvent.eventId },
    });
    assert.ok(persisted);
    assert.equal(persisted.status, 'PENDING');
  });

  it('2. Inventory transaction rollback also rolls back its NotificationOutbox event', async () => {
    let rolledBackEventId = null;

    await assert.rejects(
      prisma.$transaction(async (tx) => {
        await tx.inventoryItem.update({
          where: { id: invItemB2.id },
          data: { quantity: 0 },
        });
        const ev = await notificationService.evaluateAndClaimTransition(tx, {
          inventoryItemId: invItemB2.id,
          branchId: branch2.id,
          newQuantity: 0,
          minThreshold: 5,
          itemName: testIngredient.name,
          branchName: branch2.name,
          unit: 'KG',
        });
        rolledBackEventId = ev.eventId;
        throw new Error('Simulated POS transaction failure');
      }),
      /Simulated POS transaction failure/
    );

    assert.ok(rolledBackEventId);
    const outboxAfterRollback = await prisma.notificationOutbox.findUnique({
      where: { eventId: rolledBackEventId },
    });
    assert.equal(outboxAfterRollback, null, 'Outbox row must not exist after tx rollback');

    const invAfterRollback = await prisma.inventoryItem.findUnique({ where: { id: invItemB2.id } });
    assert.equal(invAfterRollback.alertState, 'LOW_STOCK', 'alertState must remain LOW_STOCK');
  });

  it('3. Simulated DB failure during notification delivery leaves event PENDING with backoff', async () => {
    const outboxEvent = await prisma.notificationOutbox.findFirst({
      where: { inventoryItemId: invItemB2.id, targetState: 'LOW_STOCK' },
      orderBy: { id: 'desc' },
    });
    assert.ok(outboxEvent);

    const res = await notificationService.processOutboxEvent(outboxEvent, {
      createNotificationFn: async () => {
        throw new Error('Simulated transient notification DB failure');
      },
    });

    assert.equal(res.status, 'PENDING');
    const updated = await prisma.notificationOutbox.findUnique({ where: { id: outboxEvent.id } });
    assert.equal(updated.status, 'PENDING');
    assert.equal(updated.attempts, 1);
    assert.match(updated.lastError, /Simulated transient notification DB failure/);
    assert.ok(updated.nextRetryAt.getTime() > Date.now(), 'nextRetryAt must be in the future');
  });

  it('4 & 5. Partial recipient failure delivers to remaining missed recipients on retry without duplicating first', async () => {
    const outboxEvent = await prisma.notificationOutbox.findFirst({
      where: { inventoryItemId: invItemB2.id, targetState: 'LOW_STOCK' },
      orderBy: { id: 'desc' },
    });

    let callCount = 0;
    const partialRes = await notificationService.processOutboxEvent(outboxEvent, {
      createNotificationFn: async (data) => {
        callCount += 1;
        if (callCount === 2) {
          throw new Error('Simulated failure on 2nd recipient');
        }
        return prisma.notification.create({ data });
      },
    });

    assert.equal(partialRes.status, 'PENDING');
    const createdSoFar = await prisma.notification.findMany({
      where: { outboxEventId: outboxEvent.eventId },
    });
    assert.equal(createdSoFar.length, 1, 'First recipient notification should be persisted');

    // Make event immediately eligible for retry via dispatcher
    await prisma.notificationOutbox.update({
      where: { id: outboxEvent.id },
      data: { nextRetryAt: new Date(Date.now() - 1000) },
    });

    const summary = await notificationService.dispatchPendingOutboxEvents({ batchSize: 20 });
    assert.ok(summary.sent >= 1);

    const afterRetry = await prisma.notificationOutbox.findUnique({ where: { id: outboxEvent.id } });
    assert.equal(afterRetry.status, 'SENT');
    assert.ok(afterRetry.processedAt);

    const delivered = await prisma.notification.findMany({
      where: { outboxEventId: outboxEvent.eventId },
    });
    const deliveredUserIds = new Set(delivered.map((n) => n.userId));
    assert.ok(deliveredUserIds.has(branch2Cashier.id), 'Branch 2 cashier must receive notification on retry');
    assert.ok(deliveredUserIds.has(branch2Manager.id), 'Branch 2 manager must receive notification on retry');
    if (ownerUser) {
      assert.ok(deliveredUserIds.has(ownerUser.id), 'Owner must receive notification on retry');
    }
    assert.equal(
      delivered.filter((n) => n.userId === branch2Cashier.id).length,
      1,
      'First recipient must not receive duplicate notification'
    );
  });

  it('6. Duplicate dispatcher execution does not duplicate notifications', async () => {
    const outboxEvent = await prisma.notificationOutbox.findFirst({
      where: { inventoryItemId: invItemB2.id, targetState: 'LOW_STOCK' },
      orderBy: { id: 'desc' },
    });
    const beforeCount = await prisma.notification.count({
      where: { outboxEventId: outboxEvent.eventId, userId: { in: [branch2Cashier.id, branch2Manager.id] } },
    });

    // Force-run processOutboxEvent again on the already-delivered event
    await notificationService.processOutboxEvent(outboxEvent);

    const afterCount = await prisma.notification.count({
      where: { outboxEventId: outboxEvent.eventId, userId: { in: [branch2Cashier.id, branch2Manager.id] } },
    });
    assert.equal(afterCount, beforeCount);
  });

  it('7. Concurrent dispatchPendingOutboxEvents calls cannot claim/process the same event twice', async () => {
    const outboxEvent = await prisma.notificationOutbox.create({
      data: {
        eventId: `conc-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
        idempotencyKey: `conc-key-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
        inventoryItemId: invItemB2.id,
        branchId: branch2.id,
        targetState: 'LOW_STOCK',
        eventType: 'LOW_STOCK',
        newQuantity: 2,
        minThreshold: 5,
        itemName: testIngredient.name,
        branchName: branch2.name,
        unit: 'KG',
        status: 'PENDING',
        nextRetryAt: new Date(Date.now() - 1000),
      },
    });
    createdOutboxEventIds.push(outboxEvent.eventId);

    const results = await Promise.all([
      notificationService.dispatchPendingOutboxEvents({ batchSize: 10 }),
      notificationService.dispatchPendingOutboxEvents({ batchSize: 10 }),
      notificationService.dispatchPendingOutboxEvents({ batchSize: 10 }),
    ]);

    const totalSent = results.reduce((sum, r) => sum + r.sent, 0);
    assert.equal(totalSent, 1, 'Exactly one concurrent worker should claim and send the event');

    const createdNotifs = await prisma.notification.findMany({
      where: { outboxEventId: outboxEvent.eventId },
    });
    const createdUserSet = new Set(createdNotifs.map((n) => n.userId));
    assert.ok(createdUserSet.has(branch2Cashier.id));
    assert.ok(createdUserSet.has(branch2Manager.id));
    assert.equal(createdNotifs.filter((n) => n.userId === branch2Cashier.id).length, 1);
  });

  it('8, 9 & 10. End-to-end POS order deduction -> OUT_OF_STOCK -> cancellation -> RESTOCKED, preserving recipient roles & branch isolation', async () => {
    // Reset inventory to exact quantity needed for 1 order (2 KG) so 1 order triggers OUT_OF_STOCK
    await prisma.inventoryItem.update({
      where: { id: invItemB2.id },
      data: { quantity: 2, alertState: 'LOW_STOCK' },
    });

    const order = await orderService.createOrder({
      items: [{ menuItemId: testMenuItem.id, quantity: 1 }],
      type: 'TAKEOUT',
      branchId: branch2.id,
      cashierId: branch2Cashier.id,
    });
    createdOrderIds.push(order.id);

    const outOfStockOutbox = await prisma.notificationOutbox.findFirst({
      where: { inventoryItemId: invItemB2.id, targetState: 'OUT_OF_STOCK' },
      orderBy: { id: 'desc' },
    });
    assert.ok(outOfStockOutbox, 'POS deduction to 0 must create OUT_OF_STOCK outbox event');
    assert.equal(outOfStockOutbox.status, 'SENT', 'processTransitionsSafely should dispatch it');
    createdOutboxEventIds.push(outOfStockOutbox.eventId);

    // Verify 9: OWNER, branch2 MANAGER, branch2 CASHIER received it
    const oosNotifs = await prisma.notification.findMany({
      where: { outboxEventId: outOfStockOutbox.eventId },
    });
    const oosUserIds = new Set(oosNotifs.map((n) => n.userId));
    assert.ok(oosUserIds.has(branch2Cashier.id), 'Branch 2 cashier must receive OUT_OF_STOCK');
    assert.ok(oosUserIds.has(branch2Manager.id), 'Branch 2 manager must receive OUT_OF_STOCK');
    if (ownerUser) {
      assert.ok(oosUserIds.has(ownerUser.id), 'OWNER must receive OUT_OF_STOCK');
    }

    // Verify 10: Branch 1 cashier must NOT receive Branch 2 notifications
    if (branch1.id !== branch2.id) {
      assert.equal(oosUserIds.has(branch1Cashier.id), false, 'Branch 1 cashier must be isolated');
    }

    // Cancel order -> restores 2 KG (OUT_OF_STOCK -> LOW_STOCK, emitting RESTOCKED recovery notification)
    await orderService.cancelOrder(order.id, {
      userRole: 'MANAGER',
      userBranchId: branch2.id,
      actorUserId: branch2Manager.id,
    });

    const restockOutbox = await prisma.notificationOutbox.findFirst({
      where: { inventoryItemId: invItemB2.id, targetState: 'LOW_STOCK' },
      orderBy: { id: 'desc' },
    });
    assert.ok(restockOutbox, 'Order cancellation restoring stock must create outbox transition event');
    assert.equal(restockOutbox.status, 'SENT');
    createdOutboxEventIds.push(restockOutbox.eventId);

    const restockedNotifs = await prisma.notification.findMany({
      where: { inventoryItemId: invItemB2.id, type: 'RESTOCKED' },
    });
    assert.ok(restockedNotifs.length >= 1, 'Order cancellation must emit RESTOCKED recovery notification');

    // Verify per-recipient read/unread isolation
    const cashierNotif = oosNotifs.find((n) => n.userId === branch2Cashier.id);
    const managerNotif = oosNotifs.find((n) => n.userId === branch2Manager.id);
    await notificationService.markNotificationAsRead(cashierNotif.id, branch2Cashier.id);

    const updatedCashierNotif = await prisma.notification.findUnique({ where: { id: cashierNotif.id } });
    const updatedManagerNotif = await prisma.notification.findUnique({ where: { id: managerNotif.id } });
    assert.equal(updatedCashierNotif.isRead, true);
    assert.equal(updatedManagerNotif.isRead, false, 'Marking read for cashier must not affect manager');
  });
});
