// src/modules/notifications/notification.service.js
const crypto = require('crypto');
const prisma = require('../../config/db');
const { getIO } = require('../../socket/orderSocket');

const BASE_BACKOFF_MS = 5000;
const MAX_BACKOFF_MS = 15 * 60 * 1000; // 15 minutes
const MAX_ATTEMPTS = 10;

function computeAlertState(quantity, minThreshold) {
  const qty = Number(quantity) || 0;
  const min = Number(minThreshold) || 0;
  if (qty <= 0) return 'OUT_OF_STOCK';
  if (min > 0 && qty <= min) return 'LOW_STOCK';
  return 'NORMAL';
}

function computeEventType(targetState) {
  if (targetState === 'OUT_OF_STOCK') return 'OUT_OF_STOCK';
  if (targetState === 'LOW_STOCK') return 'LOW_STOCK';
  return 'RESTOCKED';
}

function formatQty(val) {
  const num = Number(val) || 0;
  return Number.isInteger(num) ? String(num) : num.toFixed(3).replace(/\.?0+$/, '');
}

function computeBackoffDelayMs(attempts) {
  const exp = Math.max(0, Number(attempts) - 1);
  return Math.min(MAX_BACKOFF_MS, BASE_BACKOFF_MS * Math.pow(2, exp));
}

/**
 * Fetches active recipients for a branch inventory alert:
 * - Active CASHIER and MANAGER assigned to the affected branch
 * - Active OWNER accounts (cross-branch visibility)
 */
async function getBranchAlertRecipients(db, branchId) {
  return db.user.findMany({
    where: {
      isActive: true,
      OR: [
        { branchId: Number(branchId), role: { in: ['CASHIER', 'MANAGER'] } },
        { role: 'OWNER' },
      ],
    },
    select: { id: true, role: true, branchId: true },
  });
}

/**
 * Atomically claims an alertState transition on InventoryItem inside a transaction.
 */
async function claimAlertStateTransition(db, inventoryItemId, targetState) {
  const result = await db.inventoryItem.updateMany({
    where: {
      id: Number(inventoryItemId),
      alertState: { not: targetState },
    },
    data: { alertState: targetState },
  });
  return result.count > 0;
}

/**
 * Evaluates and atomically claims an inventory alert state transition inside `db` (tx or prisma),
 * and durably writes the corresponding NotificationOutbox event in the same transaction.
 * If the caller's transaction rolls back, the outbox event rolls back with it.
 */
async function evaluateAndClaimTransition(db, {
  inventoryItemId,
  branchId,
  newQuantity,
  minThreshold,
  itemName,
  branchName,
  unit,
}) {
  const targetState = computeAlertState(newQuantity, minThreshold);
  const claimed = await claimAlertStateTransition(db, inventoryItemId, targetState);
  if (!claimed) return null;

  const eventId = crypto.randomUUID();
  const eventType = computeEventType(targetState);
  const idempotencyKey = `inv:${Number(inventoryItemId)}:${targetState}:${eventId}`;

  return db.notificationOutbox.create({
    data: {
      eventId,
      idempotencyKey,
      inventoryItemId: Number(inventoryItemId),
      branchId: Number(branchId),
      targetState,
      eventType,
      newQuantity: Number(newQuantity) || 0,
      minThreshold: Number(minThreshold) || 0,
      itemName: itemName || null,
      branchName: branchName || null,
      unit: unit || null,
      status: 'PENDING',
      nextRetryAt: new Date(),
    },
  });
}

function emitNotificationToUsers(notifications) {
  try {
    const io = getIO();
    if (!io || !Array.isArray(notifications)) return;
    for (const notif of notifications) {
      io.to(`user_${notif.userId}`).emit('notification:new', notif);
    }
  } catch (err) {
    console.error('[Notification Socket Emit Error]', err.message);
  }
}

/**
 * Idempotently creates a single notification for (outboxEventId, userId).
 * If a previous attempt already persisted this recipient's notification, returns null without duplicating.
 */
async function createNotificationIdempotent(db, data, createFn) {
  try {
    return await (createFn ? createFn(data) : db.notification.create({ data }));
  } catch (err) {
    // Prisma P2002 unique constraint violation on (outboxEventId, userId)
    if (err?.code === 'P2002') {
      return null;
    }
    // Prisma P2003 foreign key constraint violation (e.g. inventoryItem deleted before background outbox dispatch)
    if (err?.code === 'P2003') {
      return null;
    }
    throw err;
  }
}

/**
 * Processes a single claimed NotificationOutbox event.
 * Marks status SENT only after all recipient notifications are persisted.
 * On failure, records error, increments attempts, and schedules exponential backoff.
 */
async function processOutboxEvent(outboxEvent, { db = prisma, createNotificationFn } = {}) {
  const now = new Date();
  const createdNotifications = [];

  try {
    const {
      id: outboxId,
      eventId,
      inventoryItemId,
      branchId,
      targetState,
      newQuantity,
      minThreshold,
      itemName,
      branchName,
      unit,
    } = outboxEvent;

    let resolvedItemName = itemName;
    let resolvedBranchName = branchName;
    let resolvedUnit = unit;
    if (!resolvedItemName || !resolvedBranchName || !resolvedUnit) {
      const inv = await db.inventoryItem.findUnique({
        where: { id: inventoryItemId },
        select: {
          ingredient: { select: { name: true, unit: true } },
          branch: { select: { name: true } },
        },
      });
      resolvedItemName = resolvedItemName || inv?.ingredient?.name || `Item #${inventoryItemId}`;
      resolvedBranchName = resolvedBranchName || inv?.branch?.name || `Branch #${branchId}`;
      resolvedUnit = resolvedUnit || inv?.ingredient?.unit || null;
    }

    const actionUrl = `/inventory?branchId=${branchId}&itemId=${inventoryItemId}`;
    const qtyStr = formatQty(newQuantity);
    const unitStr = resolvedUnit || '';

    if (targetState === 'OUT_OF_STOCK') {
      await db.notification.updateMany({
        where: { inventoryItemId, type: 'LOW_STOCK', isResolved: false },
        data: { isResolved: true, resolvedAt: now },
      });

      const recipients = await getBranchAlertRecipients(db, branchId);
      const existing = await db.notification.findMany({
        where: { outboxEventId: eventId },
        select: { userId: true },
      });
      const existingUserIds = new Set(existing.map((e) => e.userId));

      for (const r of recipients) {
        if (existingUserIds.has(r.id)) continue;
        const created = await createNotificationIdempotent(
          db,
          {
            userId: r.id,
            branchId,
            inventoryItemId,
            outboxEventId: eventId,
            type: 'OUT_OF_STOCK',
            severity: 'CRITICAL',
            title: 'Inventory Out of Stock',
            message: `${resolvedItemName} at ${resolvedBranchName} has reached zero available stock. Immediate replenishment is required.`,
            itemName: resolvedItemName,
            branchName: resolvedBranchName,
            currentQty: newQuantity,
            minThreshold,
            unit: resolvedUnit,
            actionUrl,
          },
          createNotificationFn
        );
        if (created) createdNotifications.push(created);
      }
    } else if (targetState === 'LOW_STOCK' || targetState === 'NORMAL') {
      // Recovery notifications for any unresolved OUT_OF_STOCK alerts on this item
      const unresolvedStockouts = await db.notification.findMany({
        where: { inventoryItemId, type: 'OUT_OF_STOCK', isResolved: false },
        select: {
          id: true,
          userId: true,
          user: { select: { isActive: true } },
        },
      });

      if (unresolvedStockouts.length > 0) {
        const recoveryEventId = targetState === 'NORMAL' ? eventId : `${eventId}:recovery`;
        const recoveryRecipientIds = [
          ...new Set(
            unresolvedStockouts
              .filter((n) => n.user?.isActive)
              .map((n) => n.userId)
          ),
        ];

        const existingRecovery = await db.notification.findMany({
          where: { outboxEventId: recoveryEventId },
          select: { userId: true },
        });
        const existingRecoveryIds = new Set(existingRecovery.map((e) => e.userId));

        for (const uid of recoveryRecipientIds) {
          if (existingRecoveryIds.has(uid)) continue;
          const created = await createNotificationIdempotent(
            db,
            {
              userId: uid,
              branchId,
              inventoryItemId,
              outboxEventId: recoveryEventId,
              type: 'RESTOCKED',
              severity: 'RECOVERY',
              title: 'Inventory Restocked',
              message: `${resolvedItemName} at ${resolvedBranchName} is available again. Current stock: ${qtyStr} ${unitStr}.`,
              itemName: resolvedItemName,
              branchName: resolvedBranchName,
              currentQty: newQuantity,
              minThreshold,
              unit: resolvedUnit,
              actionUrl,
              isResolved: true,
              resolvedAt: now,
            },
            createNotificationFn
          );
          if (created) createdNotifications.push(created);
        }

        // Resolve prior OUT_OF_STOCK alerts only after all recovery notifications are persisted
        await db.notification.updateMany({
          where: { inventoryItemId, type: 'OUT_OF_STOCK', isResolved: false },
          data: { isResolved: true, resolvedAt: now },
        });
      }

      if (targetState === 'LOW_STOCK') {
        const recipients = await getBranchAlertRecipients(db, branchId);
        const existing = await db.notification.findMany({
          where: { outboxEventId: eventId },
          select: { userId: true },
        });
        const existingUserIds = new Set(existing.map((e) => e.userId));

        for (const r of recipients) {
          if (existingUserIds.has(r.id)) continue;
          const created = await createNotificationIdempotent(
            db,
            {
              userId: r.id,
              branchId,
              inventoryItemId,
              outboxEventId: eventId,
              type: 'LOW_STOCK',
              severity: 'WARNING',
              title: 'Low Inventory Warning',
              message: `${resolvedItemName} at ${resolvedBranchName} is running low. Only ${qtyStr} ${unitStr} remaining.`,
              itemName: resolvedItemName,
              branchName: resolvedBranchName,
              currentQty: newQuantity,
              minThreshold,
              unit: resolvedUnit,
              actionUrl,
            },
            createNotificationFn
          );
          if (created) createdNotifications.push(created);
        }
      } else {
        await db.notification.updateMany({
          where: { inventoryItemId, type: 'LOW_STOCK', isResolved: false },
          data: { isResolved: true, resolvedAt: now },
        });
      }
    }

    await db.notificationOutbox.update({
      where: { id: outboxId },
      data: {
        status: 'SENT',
        processedAt: new Date(),
        lastError: null,
      },
    });

    // Real-time Socket.IO push after durable persistence; never fails the outbox event
    emitNotificationToUsers(createdNotifications);
    return { status: 'SENT', createdCount: createdNotifications.length };
  } catch (err) {
    const nextAttempts = (outboxEvent.attempts || 0) + 1;
    const isTerminal = nextAttempts >= MAX_ATTEMPTS;
    const delayMs = computeBackoffDelayMs(nextAttempts);
    const nextRetryAt = new Date(Date.now() + delayMs);
    const errorMsg = String(err?.message || err || 'Unknown dispatch error').slice(0, 500);

    try {
      await db.notificationOutbox.update({
        where: { id: outboxEvent.id },
        data: {
          status: isTerminal ? 'FAILED' : 'PENDING',
          attempts: nextAttempts,
          nextRetryAt,
          lastError: errorMsg,
        },
      });
    } catch (updateErr) {
      console.error('[Outbox Error Recording Failed]', {
        outboxId: outboxEvent.id,
        error: updateErr.message,
      });
    }

    console.error('[Outbox Dispatch Failed]', {
      outboxId: outboxEvent.id,
      eventId: outboxEvent.eventId,
      attempts: nextAttempts,
      nextStatus: isTerminal ? 'FAILED' : 'PENDING',
      error: errorMsg,
    });

    return { status: isTerminal ? 'FAILED' : 'PENDING', error: errorMsg };
  }
}

/**
 * Claims and dispatches a bounded batch of eligible pending outbox events.
 * Uses atomic conditional updates so concurrent workers cannot claim the same event.
 */
async function dispatchPendingOutboxEvents({
  batchSize = 20,
  staleLockMs = 120000,
  db = prisma,
  createNotificationFn,
} = {}) {
  const now = new Date();
  const staleCutoff = new Date(now.getTime() - staleLockMs);

  const candidates = await db.notificationOutbox.findMany({
    where: {
      OR: [
        { status: 'PENDING', nextRetryAt: { lte: now } },
        { status: 'PROCESSING', updatedAt: { lte: staleCutoff } },
      ],
    },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    take: Math.max(1, Math.min(100, Number(batchSize) || 20)),
  });

  let claimed = 0;
  let sent = 0;
  let failed = 0;

  for (const candidate of candidates) {
    const claim = await db.notificationOutbox.updateMany({
      where: {
        id: candidate.id,
        OR: [
          { status: 'PENDING', nextRetryAt: { lte: now } },
          { status: 'PROCESSING', updatedAt: { lte: staleCutoff } },
        ],
      },
      data: { status: 'PROCESSING' },
    });

    if (claim.count === 0) continue; // Claimed concurrently by another worker
    claimed++;

    const res = await processOutboxEvent(candidate, { db, createNotificationFn });
    if (res.status === 'SENT') {
      sent++;
    } else {
      failed++;
    }
  }

  return { claimed, sent, failed };
}

/**
 * Immediately attempts to dispatch any newly queued transitions after transaction commit.
 * If this fails or is interrupted, events remain durable in `notification_outbox` for retry.
 */
async function processTransitionsSafely(transitions) {
  const valid = Array.isArray(transitions) ? transitions.filter(Boolean) : [];
  if (valid.length === 0) return { claimed: 0, sent: 0, failed: 0 };

  try {
    return await dispatchPendingOutboxEvents({ batchSize: Math.max(20, valid.length) });
  } catch (err) {
    console.error('[Outbox Immediate Trigger Error]', err.message);
    return { claimed: 0, sent: 0, failed: valid.length };
  }
}

/**
 * Lists notifications strictly for the authenticated user.
 */
async function getUserNotifications(user, { severity, unreadOnly = false, resolved, limit = 50, branchId } = {}) {
  const parsedLimit = Math.max(1, Math.min(200, parseInt(limit, 10) || 50));
  const where = {
    userId: Number(user.id),
    ...(severity ? { severity } : {}),
    ...(unreadOnly ? { isRead: false } : {}),
    ...(resolved === true || resolved === 'true' ? { isResolved: true } : {}),
    ...(resolved === false || resolved === 'false' ? { isResolved: false } : {}),
    ...(user.role === 'OWNER' && branchId ? { branchId: Number(branchId) } : {}),
  };

  const [notifications, unreadCount, activeCriticalCount, activeWarningCount] = await Promise.all([
    prisma.notification.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: parsedLimit,
    }),
    prisma.notification.count({
      where: { userId: Number(user.id), isRead: false },
    }),
    prisma.notification.count({
      where: { userId: Number(user.id), type: 'OUT_OF_STOCK', isResolved: false },
    }),
    prisma.notification.count({
      where: { userId: Number(user.id), type: 'LOW_STOCK', isResolved: false },
    }),
  ]);

  return {
    notifications,
    unreadCount,
    counts: {
      activeCriticalCount,
      activeWarningCount,
    },
  };
}

/**
 * Returns inventory alert summary metrics for the dashboard, strictly scoped to the user.
 */
async function getInventoryAlertSummary(user, { branchId } = {}) {
  const branchFilter = user.role === 'OWNER'
    ? (branchId ? { branchId: Number(branchId) } : {})
    : { branchId: Number(user.branchId) };

  const baseWhere = {
    userId: Number(user.id),
    ...branchFilter,
  };

  const [activeOutOfStock, activeLowStock, mostRecentAlert, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where: { ...baseWhere, type: 'OUT_OF_STOCK', isResolved: false },
      select: { branchId: true, branchName: true },
    }),
    prisma.notification.findMany({
      where: { ...baseWhere, type: 'LOW_STOCK', isResolved: false },
      select: { branchId: true, branchName: true },
    }),
    prisma.notification.findFirst({
      where: { ...baseWhere, type: { in: ['OUT_OF_STOCK', 'LOW_STOCK', 'RESTOCKED'] } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    }),
    prisma.notification.count({
      where: { userId: Number(user.id), isRead: false },
    }),
  ]);

  const branchMap = new Map();
  for (const row of [...activeOutOfStock, ...activeLowStock]) {
    if (row.branchId && !branchMap.has(row.branchId)) {
      branchMap.set(row.branchId, row.branchName || `Branch #${row.branchId}`);
    }
  }

  return {
    totalActiveStockoutAlerts: activeOutOfStock.length,
    totalLowStockWarnings: activeLowStock.length,
    unresolvedCriticalAlerts: activeOutOfStock.length,
    affectedBranches: Array.from(branchMap.entries()).map(([id, name]) => ({ id, name })),
    mostRecentAlert,
    unreadCount,
  };
}

/**
 * Marks a single notification as read. Rejects with 403 if it belongs to another user.
 */
async function markNotificationAsRead(notificationId, userId) {
  const notif = await prisma.notification.findUnique({
    where: { id: Number(notificationId) },
  });
  if (!notif) {
    throw { statusCode: 404, message: 'Notification not found.' };
  }
  if (notif.userId !== Number(userId)) {
    throw { statusCode: 403, message: 'Access denied. You cannot modify another user\'s notification.' };
  }

  if (notif.isRead) return notif;

  return prisma.notification.update({
    where: { id: notif.id },
    data: { isRead: true, readAt: new Date() },
  });
}

async function markAllNotificationsAsRead(userId) {
  const result = await prisma.notification.updateMany({
    where: { userId: Number(userId), isRead: false },
    data: { isRead: true, readAt: new Date() },
  });
  return { updatedCount: result.count };
}

module.exports = {
  BASE_BACKOFF_MS,
  MAX_BACKOFF_MS,
  MAX_ATTEMPTS,
  computeAlertState,
  computeBackoffDelayMs,
  getBranchAlertRecipients,
  claimAlertStateTransition,
  evaluateAndClaimTransition,
  processOutboxEvent,
  dispatchPendingOutboxEvents,
  processTransitionsSafely,
  getUserNotifications,
  getInventoryAlertSummary,
  markNotificationAsRead,
  markAllNotificationsAsRead,
};
