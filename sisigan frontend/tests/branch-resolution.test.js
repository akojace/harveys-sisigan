import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { getUserBranchId, resolveBranchId } from '../src/utils/branch.js'

describe('Frontend Branch ID Resolution & Isolation', () => {
  it('1. Branch #2 MANAGER resolves Menu branchId=2 from user.branch.id', () => {
    const manager = { id: 10, role: 'MANAGER', branch: { id: 2, name: 'Lumban' } }
    const branchId = resolveBranchId({ isOwner: false, selectedBranchId: 1, user: manager })
    assert.equal(branchId, 2)
  })

  it('2. Branch #2 CASHIER resolves POS branchId=2 from user.branch.id', () => {
    const cashier = { id: 11, role: 'CASHIER', branch: { id: 2, name: 'Lumban' } }
    const branchId = resolveBranchId({ isOwner: false, selectedBranchId: null, user: cashier })
    assert.equal(branchId, 2)
  })

  it('3. Branch #3 employee resolves branchId=3', () => {
    const employee = { id: 12, role: 'CASHIER', branch: { id: 3, name: 'Branch 3' } }
    const branchId = resolveBranchId({ isOwner: false, selectedBranchId: 1, user: employee })
    assert.equal(branchId, 3)
  })

  it('4. Missing branch assignment returns null and never falls back to Branch #1', () => {
    const unassignedUser = { id: 13, role: 'CASHIER', branch: null }
    assert.equal(getUserBranchId(unassignedUser), null)
    assert.equal(getUserBranchId(null), null)
    assert.equal(
      resolveBranchId({ isOwner: false, selectedBranchId: 1, user: unassignedUser }),
      null
    )
  })

  it('5. OWNER can select another authorized branch without being overwritten', () => {
    const owner = { id: 1, role: 'OWNER', branch: { id: 1, name: 'Sta. Cruz' } }
    assert.equal(resolveBranchId({ isOwner: true, selectedBranchId: 2, user: owner }), 2)
    assert.equal(resolveBranchId({ isOwner: true, selectedBranchId: '3', user: owner }), 3)
    assert.equal(resolveBranchId({ isOwner: true, selectedBranchId: null, user: owner }), null)
  })

  it('6. POS checkout branchId matches assigned branch for non-OWNER and selected branch for OWNER', () => {
    const cashier2 = { id: 14, role: 'CASHIER', branch: { id: 2, name: 'Lumban' } }
    const owner = { id: 1, role: 'OWNER', branch: { id: 1, name: 'Sta. Cruz' } }
    assert.equal(resolveBranchId({ isOwner: false, selectedBranchId: 1, user: cashier2 }), 2)
    assert.equal(resolveBranchId({ isOwner: true, selectedBranchId: 4, user: owner }), 4)
  })

  it('7. Stock checks use assigned branch for non-OWNER even if selectedBranchId is stale', () => {
    const manager3 = { id: 15, role: 'MANAGER', branch: { id: 3, name: 'Branch 3' } }
    assert.equal(resolveBranchId({ isOwner: false, selectedBranchId: 1, user: manager3 }), 3)
  })

  it('8. Inventory TransferStockModal userBranchId extracts user.branch.id when user.branchId is undefined', () => {
    const manager2 = { id: 16, role: 'MANAGER', branch: { id: 2, name: 'Lumban' } }
    assert.equal(getUserBranchId(manager2), 2)
    const legacyUser = { id: 17, role: 'MANAGER', branchId: 4 }
    assert.equal(getUserBranchId(legacyUser), 4)
  })
})
