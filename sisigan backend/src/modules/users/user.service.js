// src/modules/users/user.service.js

const bcrypt = require('bcryptjs');
const prisma = require('../../config/db');

// ── LIST USERS ────────────────────────────────────────────
// Owner:   all users across all branches
// Manager: only users in their own branch
async function listUsers({ requestingUser }) {
  const where = {};

  if (requestingUser.role === 'MANAGER') {
    where.branchId = requestingUser.branchId;
  }
  // OWNER sees everyone — no filter

  return prisma.user.findMany({
    where,
    select: {
      id: true, name: true, email: true,
      role: true, isActive: true, createdAt: true,
      branch: { select: { id: true, name: true, city: true } },
    },
    orderBy: [{ branch: { name: 'asc' } }, { name: 'asc' }],
  });
}

// ── CREATE USER ───────────────────────────────────────────
// Owner:   can create MANAGER or CASHIER for any branch
// Manager: can only create CASHIER for their own branch
async function createUser({ name, email, password, role, branchId }, requestingUser) {
  // Managers can only create cashiers in their own branch
  if (requestingUser.role === 'MANAGER') {
    if (role !== 'CASHIER') {
      throw { statusCode: 403, message: 'Managers can only create Cashier accounts.' };
    }
    // FIX: Auto-assign manager's own branch
    // Make sure it's a valid number
    if (!requestingUser.branchId) {
      throw { statusCode: 400, message: 'Manager branch is not set.' };
    }
    branchId = requestingUser.branchId;
  }

  // Only OWNER can create OWNER accounts
  if (role === 'OWNER' && requestingUser.role !== 'OWNER') {
    throw { statusCode: 403, message: 'Only Owners can create Owner accounts.' };
  }

  // For OWNER: branchId must be provided
  if (requestingUser.role === 'OWNER' && !branchId) {
    throw { statusCode: 400, message: 'Branch is required.' };
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) throw { statusCode: 409, message: 'Email is already in use.' };

  // Ensure branchId is a number
  const finalBranchId = Number(branchId);

  const branch = await prisma.branch.findUnique({ where: { id: finalBranchId } });
  if (!branch) throw { statusCode: 404, message: 'Branch not found.' };

  const hashed = await bcrypt.hash(password, 12);

  return prisma.user.create({
    data: {
      name,
      email,
      password: hashed,
      role,
      branchId: finalBranchId
    },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      isActive: true,
      createdAt: true,
      branch: { select: { id: true, name: true, city: true } },
    },
  });
}


// ── UPDATE USER ───────────────────────────────────────────
async function updateUser(userId, { name, email, role, branchId, isActive }, requestingUser) {
  const target = await prisma.user.findUnique({ where: { id: Number(userId) } });
  if (!target) throw { statusCode: 404, message: 'User not found.' };

  // Manager can only edit users in their own branch
  if (requestingUser.role === 'MANAGER' && target.branchId !== requestingUser.branchId) {
    throw { statusCode: 403, message: 'Access denied.' };
  }

  // Manager cannot edit Owners or other Managers — only Cashiers
  if (requestingUser.role === 'MANAGER' && target.role !== 'CASHIER') {
    throw { statusCode: 403, message: 'Managers can only edit Cashier accounts.' };
  }

  // Manager cannot change roles or branches
  if (requestingUser.role === 'MANAGER' && (role || branchId)) {
    throw { statusCode: 403, message: 'Managers cannot change roles or branch assignments.' };
  }

  const data = {};
  if (name) data.name = name;
  if (email) data.email = email;
  if (role) data.role = role;
  if (branchId) data.branchId = Number(branchId);
  if (isActive !== undefined) data.isActive = isActive;

  return prisma.user.update({
    where: { id: Number(userId) },
    data,
    select: {
      id: true, name: true, email: true, role: true, isActive: true,
      branch: { select: { id: true, name: true, city: true } },
    },
  });
}

// ── RESET PASSWORD ────────────────────────────────────────
async function resetPassword(userId, newPassword, requestingUser) {
  const target = await prisma.user.findUnique({ where: { id: Number(userId) } });
  if (!target) throw { statusCode: 404, message: 'User not found.' };

  if (requestingUser.role === 'MANAGER' && target.branchId !== requestingUser.branchId) {
    throw { statusCode: 403, message: 'Access denied.' };
  }

  // Manager can only reset passwords of Cashiers
  if (requestingUser.role === 'MANAGER' && target.role !== 'CASHIER') {
    throw { statusCode: 403, message: 'Managers can only reset passwords for Cashier accounts.' };
  }

  const hashed = await bcrypt.hash(newPassword, 12);
  await prisma.user.update({ where: { id: Number(userId) }, data: { password: hashed } });
  return { message: 'Password updated successfully.' };
}

// ── TOGGLE ACTIVE ─────────────────────────────────────────
async function toggleActive(userId, requestingUser) {
  const target = await prisma.user.findUnique({ where: { id: Number(userId) } });
  if (!target) throw { statusCode: 404, message: 'User not found.' };

  if (requestingUser.role === 'MANAGER' && target.branchId !== requestingUser.branchId) {
    throw { statusCode: 403, message: 'Access denied.' };
  }

  // Manager can only toggle Cashiers
  if (requestingUser.role === 'MANAGER' && target.role !== 'CASHIER') {
    throw { statusCode: 403, message: 'Managers can only activate/deactivate Cashier accounts.' };
  }

  // Cannot deactivate yourself
  if (target.id === requestingUser.id) {
    throw { statusCode: 400, message: 'You cannot deactivate your own account.' };
  }

  return prisma.user.update({
    where: { id: Number(userId) },
    data: { isActive: !target.isActive },
    select: { id: true, name: true, isActive: true },
  });
}

module.exports = { listUsers, createUser, updateUser, resetPassword, toggleActive };