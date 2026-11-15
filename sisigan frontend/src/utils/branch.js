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
 * - OWNER: validates selectedBranchId against the active branch list.
 *   If selectedBranchId is invalid, stale, or deleted, automatically falls back to:
 *     1. The owner's assigned branch (if present in the active list)
 *     2. The first active branch in the list
 *     3. null (if branches are not yet loaded, preventing speculative requests)
 * - Non-OWNER (MANAGER, CASHIER): strictly locked to their assigned branch ID.
 *   Never falls back to branch ID 1.
 *
 * @param {{
 *   isOwner: boolean,
 *   selectedBranchId?: number|string|null,
 *   user?: object|null,
 *   branches?: Array<{ id: number, isActive?: boolean }>
 * }} params
 * @returns {number|null}
 */
export function resolveBranchId({ isOwner, selectedBranchId, user, branches = [] }) {
  if (isOwner) {
    if (Array.isArray(branches) && branches.length > 0) {
      const activeBranches = branches.filter((b) => b.isActive !== false)
      if (activeBranches.length > 0) {
        if (
          selectedBranchId != null &&
          activeBranches.some((b) => b.id === Number(selectedBranchId))
        ) {
          return Number(selectedBranchId)
        }
        const homeId = getUserBranchId(user)
        if (homeId != null && activeBranches.some((b) => b.id === Number(homeId))) {
          return Number(homeId)
        }
        return Number(activeBranches[0].id)
      }
    }
    return selectedBranchId ? Number(selectedBranchId) : null
  }
  return getUserBranchId(user)
}
