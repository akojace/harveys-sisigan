// src/modules/branches/branch.service.js
const prisma = require('../../config/db');
const { seedBranchInventory } = require('../inventory/inventory.service');

async function listBranches() {
  return prisma.branch.findMany({
    orderBy: { name: 'asc' },
    include: {
      _count: { select: { users: true, orders: true } },
    },
  });
}

async function createBranch({ name, address, city, contactNo }) {
  const existing = await prisma.branch.findFirst({ where: { name } });
  if (existing) throw { statusCode: 409, message: 'A branch with that name already exists.' };

  // Branch creation + inventory seeding happen in one transaction: if seeding
  // fails partway through, the branch insert rolls back too, so you never end
  // up with a branch that's missing some of the master ingredient list.
  return prisma.$transaction(async (tx) => {
    const branch = await tx.branch.create({
      data: { name, address, city, contactNo: contactNo || null },
    });

    await seedBranchInventory(branch.id, tx);

    return branch;
  });
}

async function updateBranch(id, { name, address, city, contactNo, isActive }) {
  const branchId = Number(id);
  if (!Number.isInteger(branchId) || branchId < 1) {
    throw { statusCode: 400, message: 'Invalid branch ID.' };
  }

  const branch = await prisma.branch.findUnique({ where: { id: branchId } });
  if (!branch) throw { statusCode: 404, message: 'Branch not found.' };

  if (name !== undefined && name.trim() !== branch.name) {
    const duplicate = await prisma.branch.findFirst({
      where: { name: name.trim(), id: { not: branchId } },
    });
    if (duplicate) {
      throw { statusCode: 409, message: 'A branch with that name already exists.' };
    }
  }

  return prisma.branch.update({
    where: { id: branchId },
    data: {
      ...(name      !== undefined && { name: name.trim() }),
      ...(address   !== undefined && { address: address.trim() }),
      ...(city      !== undefined && { city: city.trim() }),
      ...(contactNo !== undefined && { contactNo: contactNo || null }),
      ...(isActive  !== undefined && { isActive }),
    },
  });
}

async function toggleBranch(id) {
  const branchId = Number(id);
  if (!Number.isInteger(branchId) || branchId < 1) {
    throw { statusCode: 400, message: 'Invalid branch ID.' };
  }

  const branch = await prisma.branch.findUnique({ where: { id: branchId } });
  if (!branch) throw { statusCode: 404, message: 'Branch not found.' };

  return prisma.branch.update({
    where: { id: branchId },
    data: { isActive: !branch.isActive },
  });
}

async function inspectBranchDependencies(db, branchId) {
  const branch = await db.branch.findUnique({
    where: { id: branchId },
    select: { id: true, name: true, city: true, isActive: true },
  });
  if (!branch) throw { statusCode: 404, message: 'Branch not found.' };

  const [
    totalBranches,
    otherBranches,
    users,
    orders,
    orderItems,
    payments,
    inventoryItems,
    inventoryAuditLogs,
    expenses,
    inventoryTransfers,
    branchMenuItems,
    authLogs,
  ] = await Promise.all([
    db.branch.count(),
    db.branch.findMany({
      where: { id: { not: branchId } },
      select: { id: true, name: true, city: true, isActive: true },
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
    }),
    db.user.findMany({
      where: { branchId },
      select: { id: true, name: true, email: true, role: true, isActive: true },
    }),
    db.order.count({ where: { branchId } }),
    db.orderItem.count({ where: { order: { branchId } } }),
    db.payment.count({ where: { order: { branchId } } }),
    db.inventoryItem.count({ where: { branchId } }),
    db.inventoryAuditLog.count({ where: { inventoryItem: { branchId } } }),
    db.expense.count({ where: { branchId } }),
    db.inventoryTransfer.count({
      where: { OR: [{ sourceBranchId: branchId }, { destBranchId: branchId }] },
    }),
    db.branchMenuItem.count({ where: { branchId } }),
    db.authLog.count({ where: { branchId } }),
  ]);

  let notifications = 0;
  let notificationOutbox = 0;
  try {
    notifications = await db.notification.count({ where: { branchId } });
  } catch (err) {
    if (err?.code !== 'P2021') throw err;
  }
  try {
    notificationOutbox = await db.notificationOutbox.count({ where: { branchId } });
  } catch (err) {
    if (err?.code !== 'P2021') throw err;
  }

  const ownersToReassign = users.filter((u) => u.role === 'OWNER');
  const employees = users.filter((u) => u.role !== 'OWNER');

  return {
    branch,
    totalBranches,
    isFinalBranch: totalBranches <= 1,
    ownersToReassign,
    otherBranches,
    previewCounts: {
      employees: employees.length,
      owners: ownersToReassign.length,
      orders,
      orderItems,
      payments,
      inventoryItems,
      inventoryAuditLogs,
      expenses,
      inventoryTransfers,
      branchMenuItems,
      authLogs,
      notifications,
      notificationOutbox,
    },
  };
}

async function getBranchDependencies(id) {
  const branchId = Number(id);
  if (!Number.isInteger(branchId) || branchId < 1) {
    throw { statusCode: 400, message: 'Invalid branch ID.' };
  }
  return inspectBranchDependencies(prisma, branchId);
}

async function deleteBranch(id, requestingUser, { reassignOwnerToBranchId } = {}) {
  if (!requestingUser || requestingUser.role !== 'OWNER') {
    throw { statusCode: 403, message: 'Only OWNER accounts can permanently delete a branch.' };
  }

  const branchId = Number(id);
  if (!Number.isInteger(branchId) || branchId < 1) {
    throw { statusCode: 400, message: 'Invalid branch ID.' };
  }

  return prisma.$transaction(async (tx) => {
    const branch = await tx.branch.findUnique({
      where: { id: branchId },
      select: { id: true, name: true },
    });
    if (!branch) throw { statusCode: 404, message: 'Branch not found.' };

    const totalBranches = await tx.branch.count();
    if (totalBranches <= 1) {
      throw { statusCode: 409, message: 'Cannot delete the final remaining branch.' };
    }

    // 1. Protect & reassign OWNER accounts assigned to this branch
    const ownersOnBranch = await tx.user.findMany({
      where: { branchId, role: 'OWNER' },
      select: { id: true, name: true, email: true },
    });

    let reassignedToId = null;
    if (ownersOnBranch.length > 0) {
      const targetBranchId = Number(reassignOwnerToBranchId);
      if (!Number.isInteger(targetBranchId) || targetBranchId < 1 || targetBranchId === branchId) {
        throw {
          statusCode: 400,
          message:
            'OWNER account(s) are assigned to this branch. Please select another branch to reassign them to before deleting.',
        };
      }

      const targetBranch = await tx.branch.findUnique({
        where: { id: targetBranchId },
        select: { id: true },
      });
      if (!targetBranch) {
        throw { statusCode: 404, message: 'Reassignment target branch not found.' };
      }

      await tx.user.updateMany({
        where: { branchId, role: 'OWNER' },
        data: { branchId: targetBranchId },
      });

      const remainingOwners = await tx.user.count({ where: { branchId, role: 'OWNER' } });
      if (remainingOwners > 0) {
        throw { statusCode: 500, message: 'Failed to reassign all OWNER accounts from this branch.' };
      }
      reassignedToId = targetBranchId;
    }

    // 2. Identify branch-specific non-OWNER employees (never include currently authenticated OWNER)
    const employeesToDelete = await tx.user.findMany({
      where: {
        branchId,
        role: { not: 'OWNER' },
        id: { not: Number(requestingUser.id) },
      },
      select: { id: true },
    });
    const employeeIds = employeesToDelete.map((u) => u.id);

    // Preserve any surviving-branch orders or transfers if a deleted employee was recorded as actor/cashier
    if (employeeIds.length > 0) {
      await tx.order.updateMany({
        where: { branchId: { not: branchId }, cashierId: { in: employeeIds } },
        data: { cashierId: Number(requestingUser.id) },
      });
      await tx.inventoryTransfer.updateMany({
        where: {
          sourceBranchId: { not: branchId },
          destBranchId: { not: branchId },
          actorUserId: { in: employeeIds },
        },
        data: { actorUserId: Number(requestingUser.id) },
      });
    }

    // 3. Delete optional notification & outbox records first
    let notifications = 0;
    let notificationOutbox = 0;
    try {
      const notifWhere = {
        OR: [
          { branchId },
          { inventoryItem: { branchId } },
          ...(employeeIds.length > 0 ? [{ userId: { in: employeeIds } }] : []),
        ],
      };
      notifications = (await tx.notification.deleteMany({ where: notifWhere })).count;
    } catch (err) {
      if (err?.code !== 'P2021') throw err;
    }
    try {
      notificationOutbox = (await tx.notificationOutbox.deleteMany({ where: { branchId } })).count;
    } catch (err) {
      if (err?.code !== 'P2021') throw err;
    }

    // 4. Delete payments and order_items belonging to branch orders (payments.orderId is RESTRICT)
    const payments = (await tx.payment.deleteMany({ where: { order: { branchId } } })).count;
    const orderItems = (await tx.orderItem.deleteMany({ where: { order: { branchId } } })).count;

    // 5. Delete inventory_audit_logs belonging to branch inventory items & detach/clean order links
    const branchInventoryRows = await tx.inventoryItem.findMany({
      where: { branchId },
      select: { id: true },
    });
    const branchInventoryIds = branchInventoryRows.map((i) => i.id);

    const inventoryAuditLogs = branchInventoryIds.length
      ? (await tx.inventoryAuditLog.deleteMany({
          where: { inventoryItemId: { in: branchInventoryIds } },
        })).count
      : 0;

    await tx.inventoryAuditLog.updateMany({
      where: { order: { branchId } },
      data: { orderId: null },
    });
    if (employeeIds.length > 0) {
      await tx.inventoryAuditLog.updateMany({
        where: { actorUserId: { in: employeeIds } },
        data: { actorUserId: null },
      });
    }

    // 6. Delete branch orders
    const orders = (await tx.order.deleteMany({ where: { branchId } })).count;

    // 7. Delete inventory_transfers involving this branch (does not alter other branch stock quantities)
    const inventoryTransfers = (
      await tx.inventoryTransfer.deleteMany({
        where: { OR: [{ sourceBranchId: branchId }, { destBranchId: branchId }] },
      })
    ).count;

    // 8. Delete branch inventory_items
    const inventoryItems = (await tx.inventoryItem.deleteMany({ where: { branchId } })).count;

    // 9. Delete branch expenses & detach employee actor refs on any surviving expenses
    const expenses = (await tx.expense.deleteMany({ where: { branchId } })).count;
    if (employeeIds.length > 0) {
      await tx.expense.updateMany({
        where: { actorUserId: { in: employeeIds } },
        data: { actorUserId: null },
      });
    }

    // 10. Delete branch_menu_items & auth_logs
    const branchMenuItems = (await tx.branchMenuItem.deleteMany({ where: { branchId } })).count;
    const authLogs = (
      await tx.authLog.deleteMany({
        where: {
          OR: [
            { branchId },
            ...(employeeIds.length > 0 ? [{ userId: { in: employeeIds } }] : []),
          ],
        },
      })
    ).count;

    // 11. Delete password_resets & non-OWNER employees
    let passwordResets = 0;
    let employees = 0;
    if (employeeIds.length > 0) {
      passwordResets = (await tx.passwordReset.deleteMany({ where: { userId: { in: employeeIds } } })).count;
      employees = (
        await tx.user.deleteMany({
          where: { id: { in: employeeIds }, role: { not: 'OWNER' } },
        })
      ).count;
    }

    // 12. Delete the branch record itself
    await tx.branch.delete({ where: { id: branchId } });

    return {
      deletedBranchId: branchId,
      deletedBranch: branch.name,
      reassignedOwnersToBranchId: reassignedToId,
      deletedRecords: {
        employees,
        orders,
        orderItems,
        payments,
        inventoryItems,
        inventoryAuditLogs,
        expenses,
        inventoryTransfers,
        branchMenuItems,
        authLogs,
        passwordResets,
        notifications,
        notificationOutbox,
      },
    };
  });
}

module.exports = {
  listBranches,
  createBranch,
  updateBranch,
  toggleBranch,
  getBranchDependencies,
  deleteBranch,
};