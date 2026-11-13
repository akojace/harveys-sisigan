// src/middleware/branchScope.middleware.js
// Centralized multi-branch authorization and parameter sanitization.
// Enforces strict role- and branch-level boundaries:
// - CASHIER & MANAGER: Restricted solely to their assigned user.branchId.
//   Attempts to view or manipulate other branches (via URL, query, or body) are rejected with 403.
// - OWNER: Full oversight. May filter by any branch or view consolidated data across all branches.

function validateBranchAccess(user, requestedBranchId, { requireSpecificBranch = false } = {}) {
  if (!user) {
    throw { statusCode: 401, message: 'Unauthorized.' };
  }

  // Non-owner roles are strictly locked to their assigned branchId
  if (user.role !== 'OWNER') {
    if (requestedBranchId != null && requestedBranchId !== '') {
      if (Number(requestedBranchId) !== Number(user.branchId)) {
        throw {
          statusCode: 403,
          message: `Access denied. You are assigned to branch #${user.branchId} and cannot access or modify branch #${requestedBranchId}.`,
        };
      }
    }
    return Number(user.branchId);
  }

  // OWNER role
  if (requestedBranchId != null && requestedBranchId !== '') {
    const parsed = Number(requestedBranchId);
    if (Number.isNaN(parsed) || parsed <= 0) {
      throw { statusCode: 400, message: 'Invalid branch ID.' };
    }
    return parsed;
  }

  if (requireSpecificBranch) {
    // If an operation requires a specific branch and Owner did not specify one,
    // fallback to Owner's home branch or throw 400
    if (user.branchId) return Number(user.branchId);
    throw { statusCode: 400, message: 'branchId is required for this operation.' };
  }

  return null; // All branches / consolidated
}

/**
 * Express middleware to enforce branch scoping on routes.
 * Populates req.scopedBranchId on success.
 */
function branchScopeMiddleware({ requireSpecificBranch = false, source = 'auto' } = {}) {
  return (req, res, next) => {
    try {
      let targetBranchId = null;

      if (source === 'query' || (source === 'auto' && req.query?.branchId !== undefined)) {
        targetBranchId = req.query.branchId;
      } else if (source === 'body' || (source === 'auto' && req.body?.branchId !== undefined)) {
        targetBranchId = req.body.branchId;
      } else if (source === 'params' || (source === 'auto' && req.params?.branchId !== undefined)) {
        targetBranchId = req.params.branchId;
      }

      req.scopedBranchId = validateBranchAccess(req.user, targetBranchId, { requireSpecificBranch });

      // Overwrite/sanitize target branchId in params/query/body for downstream handlers
      if (req.user.role !== 'OWNER') {
        if (req.query) req.query.branchId = req.scopedBranchId;
        if (req.body && typeof req.body === 'object') req.body.branchId = req.scopedBranchId;
      } else if (req.scopedBranchId != null) {
        if (req.query && req.query.branchId) req.query.branchId = req.scopedBranchId;
        if (req.body && typeof req.body === 'object' && req.body.branchId) req.body.branchId = req.scopedBranchId;
      }

      next();
    } catch (err) {
      next(err);
    }
  };
}

module.exports = {
  validateBranchAccess,
  branchScopeMiddleware,
};
