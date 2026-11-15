/**
 * Extracts the authenticated user's assigned branch ID.
 * Supports both `user.branch.id` (returned by /auth/login and /auth/me)
 * and `user.branchId`. Never falls back to a hardcoded branch ID.
 *
 * @param {object|null|undefined} user
 * @returns {number|null}
 */
export function getUserBranchId(user) {
  return user?.branch?.id ?? user?.branchId ?? null
}

/**
 * Resolves the effective branch ID for branch-scoped operations.
 * - OWNER: returns the explicitly selected branchId (or null if none selected yet).
 * - Non-OWNER (MANAGER, CASHIER): strictly locked to their assigned branch ID.
 *
 * @param {{ isOwner: boolean, selectedBranchId: number|string|null|undefined, user: object|null|undefined }} params
 * @returns {number|null}
 */
export function resolveBranchId({ isOwner, selectedBranchId, user }) {
  if (isOwner) {
    return selectedBranchId ? Number(selectedBranchId) : null
  }
  return getUserBranchId(user)
}
