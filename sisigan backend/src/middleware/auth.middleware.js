// src/middleware/auth.middleware.js
// Verifies JWT token on protected routes, and re-checks that the user
// and their branch are still active (so a disabled branch/user is kicked
// out immediately, not just blocked on next login).

const jwt = require('jsonwebtoken');
const prisma = require('../config/db');

const authMiddleware = async (req, res, next) => {
  const authHeader = req.headers['authorization'];

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      message: 'Access denied. No token provided.',
    });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // NEW — re-check live status on every request instead of trusting
    // whatever was true at the moment the token was issued.
    const user = await prisma.user.findUnique({
      where: { id: decoded.id },
      select: {
        isActive: true,
        branch: { select: { isActive: true } },
      },
    });

    if (!user || !user.isActive) {
      return res.status(401).json({
        success: false,
        message: 'This account has been disabled.',
      });
    }

    // OWNER accounts are exempted from the branch check since owners
    // oversee all branches rather than being tied to one. Remove the
    // role check if you want owners logged out too when their "home"
    // branch is disabled.
    if (decoded.role !== 'OWNER' && user.branch && !user.branch.isActive) {
      return res.status(401).json({
        success: false,
        message: 'This branch has been disabled.',
      });
    }

    req.user = decoded; // { id, name, email, role, branchId }
    next();
  } catch (err) {
    return res.status(401).json({
      success: false,
      message: 'Invalid or expired token.',
    });
  }
};

module.exports = authMiddleware;