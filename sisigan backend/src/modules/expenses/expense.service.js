// src/modules/expenses/expense.service.js
// Operating expense tracking (Rent, Utilities, Salaries, Supplies, Maintenance, Other)

const prisma = require('../../config/db');
const { roundDecimals } = require('../../utils/inventoryCosting');
const { validateBranchAccess } = require('../../middleware/branchScope.middleware');

function getScopedBranchId(requestingUser, branchId, requireSpecific = false) {
  return validateBranchAccess(requestingUser, branchId, { requireSpecificBranch: requireSpecific });
}

async function createExpense(payload, requestingUser) {
  const { branchId, category = 'OTHER', amount, description, expenseDate } = payload;
  const targetBranchId = getScopedBranchId(requestingUser, branchId, true);

  if (!targetBranchId) {
    throw { statusCode: 400, message: 'Branch ID is required.' };
  }

  const amt = Number(amount);
  if (Number.isNaN(amt) || amt <= 0) {
    throw { statusCode: 400, message: 'Amount must be greater than 0.' };
  }

  const validCategories = ['RENT', 'UTILITIES', 'SALARIES', 'SUPPLIES', 'MAINTENANCE', 'OTHER'];
  if (!validCategories.includes(category)) {
    throw { statusCode: 400, message: `Invalid category. Must be one of [${validCategories.join(', ')}]` };
  }

  return prisma.expense.create({
    data: {
      branchId: Number(targetBranchId),
      category,
      amount: roundDecimals(amt, 2),
      description: description ? String(description).trim() : null,
      expenseDate: expenseDate ? new Date(expenseDate) : new Date(),
      actorUserId: requestingUser.id,
    },
    include: {
      branch: { select: { id: true, name: true, city: true } },
      actor: { select: { id: true, name: true, role: true } },
    },
  });
}

async function getExpenses({ branchId, category, from, to, page = 1, limit = 50 }, requestingUser) {
  const targetBranchId = getScopedBranchId(requestingUser, branchId, true);
  const safeLimit = Math.max(1, Math.min(Number(limit) || 50, 200));
  const skip = (Math.max(1, Number(page) || 1) - 1) * safeLimit;

  const where = {
    ...(targetBranchId && { branchId: targetBranchId }),
    ...(category && { category }),
    ...(from || to
      ? {
          expenseDate: {
            ...(from && { gte: new Date(from) }),
            ...(to && { lte: new Date(to) }),
          },
        }
      : {}),
  };

  const [expenses, total, summary] = await Promise.all([
    prisma.expense.findMany({
      where,
      orderBy: { expenseDate: 'desc' },
      skip,
      take: safeLimit,
      include: {
        branch: { select: { id: true, name: true } },
        actor: { select: { id: true, name: true, role: true } },
      },
    }),
    prisma.expense.count({ where }),
    prisma.expense.aggregate({
      where,
      _sum: { amount: true },
    }),
  ]);

  return {
    expenses,
    totalExpenses: Number(summary._sum.amount || 0),
    pagination: {
      total,
      page: Number(page),
      limit: safeLimit,
      totalPages: Math.ceil(total / safeLimit),
    },
  };
}

async function deleteExpense(id, requestingUser) {
  const existing = await prisma.expense.findUnique({ where: { id: Number(id) } });
  if (!existing) {
    throw { statusCode: 404, message: 'Expense record not found.' };
  }

  if (requestingUser.role !== 'OWNER' && existing.branchId !== requestingUser.branchId) {
    throw { statusCode: 403, message: 'Access denied to this expense record.' };
  }

  return prisma.expense.delete({ where: { id: Number(id) } });
}

module.exports = {
  createExpense,
  getExpenses,
  deleteExpense,
};
