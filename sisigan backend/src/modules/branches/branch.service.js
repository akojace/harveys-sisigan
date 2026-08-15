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
  const branch = await prisma.branch.findUnique({ where: { id: Number(id) } });
  if (!branch) throw { statusCode: 404, message: 'Branch not found.' };

  return prisma.branch.update({
    where: { id: Number(id) },
    data: {
      ...(name      !== undefined && { name }),
      ...(address   !== undefined && { address }),
      ...(city      !== undefined && { city }),
      ...(contactNo !== undefined && { contactNo }),
      ...(isActive  !== undefined && { isActive }),
    },
  });
}

async function toggleBranch(id) {
  const branch = await prisma.branch.findUnique({ where: { id: Number(id) } });
  if (!branch) throw { statusCode: 404, message: 'Branch not found.' };

  return prisma.branch.update({
    where: { id: Number(id) },
    data: { isActive: !branch.isActive },
  });
}

module.exports = { listBranches, createBranch, updateBranch, toggleBranch };