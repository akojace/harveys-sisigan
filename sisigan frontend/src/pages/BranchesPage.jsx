// src/pages/BranchesPage.jsx
import { useState, useEffect } from 'react'
import { branchesApi } from '../api/client'
import { Button, Input, Modal, EmptyState } from '../components/ui'

// ─── BRANCH FORM MODAL ────────────────────────────────────
function BranchModal({ editBranch, onClose, onSaved }) {
  const isEdit = !!editBranch
  const [form, setForm] = useState({
    name:      editBranch?.name      || '',
    address:   editBranch?.address   || '',
    city:      editBranch?.city      || '',
    contactNo: editBranch?.contactNo || '',
  })
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState('')

  function set(k, v) { setForm(f => ({ ...f, [k]: v })) }

  async function save() {
    setLoading(true); setError('')
    try {
      if (isEdit) {
        await branchesApi.update(editBranch.id, form)
      } else {
        await branchesApi.create(form)
      }
      onSaved()
    } catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }

  return (
    <Modal title={isEdit ? '✏️ Edit Branch' : '🏪 New Branch'} onClose={onClose} width={440}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Input
          label="Branch Name *"
          value={form.name}
          onChange={e => set('name', e.target.value)}
          placeholder="e.g. Sisigan BGC"
        />
        <Input
          label="Address *"
          value={form.address}
          onChange={e => set('address', e.target.value)}
          placeholder="e.g. 5th Ave, Bonifacio Global City"
        />
        <Input
          label="City *"
          value={form.city}
          onChange={e => set('city', e.target.value)}
          placeholder="e.g. Taguig"
        />
        <Input
          label="Contact No. (optional)"
          value={form.contactNo}
          onChange={e => set('contactNo', e.target.value)}
          placeholder="e.g. 09171234567"
        />

        {error && <p style={{ color: 'var(--red)', fontSize: 13 }}>{error}</p>}

        <div style={{ display: 'flex', gap: 12, marginTop: 6 }}>
          <Button variant="outline" fullWidth onClick={onClose}>Cancel</Button>
          <Button variant="primary" fullWidth disabled={loading} onClick={save}>
            {loading ? 'Saving…' : isEdit ? 'Save Changes' : '+ Create Branch'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

// ─── DELETE BRANCH MODAL ──────────────────────────────────
function DeleteBranchModal({ branch, onClose, onDeleted }) {
  const [deps, setDeps] = useState(null)
  const [loadingDeps, setLoadingDeps] = useState(true)
  const [reassignBranchId, setReassignBranchId] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    setLoadingDeps(true)
    setError('')
    setConfirmed(false)
    setReassignBranchId('')
    branchesApi.dependencies(branch.id)
      .then((res) => {
        if (!active) return
        setDeps(res.data)
        if (res.data?.otherBranches?.length === 1) {
          setReassignBranchId(String(res.data.otherBranches[0].id))
        }
      })
      .catch((e) => { if (active) setError(e.message) })
      .finally(() => { if (active) setLoadingDeps(false) })
    return () => { active = false }
  }, [branch.id])

  const needsOwnerReassign = (deps?.ownersToReassign?.length || 0) > 0
  const canConfirm =
    !loadingDeps &&
    !deleting &&
    !!deps &&
    !deps.isFinalBranch &&
    confirmed &&
    (!needsOwnerReassign || Boolean(reassignBranchId))

  async function confirmDelete() {
    setDeleting(true)
    setError('')
    try {
      const res = await branchesApi.remove(branch.id, reassignBranchId ? Number(reassignBranchId) : undefined)
      onDeleted(res)
    } catch (e) {
      setError(e.message)
    } finally {
      setDeleting(false)
    }
  }

  const c = deps?.previewCounts || {}

  return (
    <Modal title={`Permanently delete ${branch.name}?`} onClose={onClose} width={520}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 'var(--radius-md)', padding: '12px 14px', fontSize: 13.5, color: 'var(--red-dark)', lineHeight: 1.5 }}>
          <strong>Warning:</strong> All records exclusively belonging to <strong>{branch.name}</strong> will be permanently deleted, including sales history, payments, employee accounts, inventory, expenses, transfers, and audit records.
          <div style={{ marginTop: 6, fontSize: 12.5, color: 'var(--text-mid)' }}>
            Shared ingredients, recipes, menu items, OWNER accounts, and other branches&apos; records will be preserved.
          </div>
        </div>

        {loadingDeps ? (
          <div style={{ padding: 16, textAlign: 'center', color: 'var(--text-faint)', fontSize: 13 }}>
            Inspecting branch records…
          </div>
        ) : deps ? (
          deps.isFinalBranch ? (
            <div style={{ background: 'var(--red-light)', border: '1px solid #fecaca', borderRadius: 'var(--radius-md)', padding: '12px 14px', fontSize: 13, color: 'var(--red-dark)' }}>
              <strong>Cannot delete the final remaining branch.</strong> At least one branch must remain active in the system.
            </div>
          ) : (
            <>
              <div style={{ background: 'var(--brown-50)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '12px 14px' }}>
                <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--brown-800)', marginBottom: 8 }}>
                  Deletion Preview
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '6px 14px', fontSize: 13, color: 'var(--text-mid)' }}>
                  <div>Employees: <strong>{c.employees ?? 0}</strong></div>
                  <div>Orders: <strong>{c.orders ?? 0}</strong></div>
                  <div>Order Items: <strong>{c.orderItems ?? 0}</strong></div>
                  <div>Payments: <strong>{c.payments ?? 0}</strong></div>
                  <div>Inventory Items: <strong>{c.inventoryItems ?? 0}</strong></div>
                  <div>Audit Logs: <strong>{c.inventoryAuditLogs ?? 0}</strong></div>
                  <div>Expenses: <strong>{c.expenses ?? 0}</strong></div>
                  <div>Transfers: <strong>{c.inventoryTransfers ?? 0}</strong></div>
                  <div>Menu Links: <strong>{c.branchMenuItems ?? 0}</strong></div>
                  <div>Auth Logs: <strong>{c.authLogs ?? 0}</strong></div>
                  <div>Notifications: <strong>{c.notifications ?? 0}</strong></div>
                </div>
              </div>

              {needsOwnerReassign && (
                <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 'var(--radius-md)', padding: '12px 14px', fontSize: 13, color: '#9a3412' }}>
                  <div style={{ fontWeight: 700, marginBottom: 6 }}>
                    OWNER Account Reassignment Required ({deps.ownersToReassign.length})
                  </div>
                  <div style={{ marginBottom: 8, fontSize: 12.5 }}>
                    Protected OWNER account(s) ({deps.ownersToReassign.map((o) => o.name).join(', ')}) are currently assigned to {branch.name} and will never be deleted. Select a surviving branch to reassign them to:
                  </div>
                  <select
                    value={reassignBranchId}
                    onChange={(e) => setReassignBranchId(e.target.value)}
                    style={{ width: '100%', padding: '9px 12px', border: '1.5px solid #fdba74', borderRadius: 'var(--radius-md)', background: '#fff', fontSize: 13.5 }}
                  >
                    <option value="">Select destination branch…</option>
                    {deps.otherBranches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name} ({b.city}){b.isActive ? '' : ' [Inactive]'}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, fontSize: 13, color: 'var(--text-mid)', cursor: 'pointer', padding: '4px 2px' }}>
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={(e) => setConfirmed(e.target.checked)}
                  style={{ marginTop: 3 }}
                />
                <span>
                  I understand that this action permanently deletes <strong>{branch.name}</strong> and all of its branch-specific records above.
                </span>
              </label>
            </>
          )
        ) : null}

        {error && <p style={{ color: 'var(--red)', fontSize: 13 }}>{error}</p>}

        <div style={{ display: 'flex', gap: 12, marginTop: 6 }}>
          <Button variant="outline" fullWidth onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            fullWidth
            disabled={!canConfirm}
            onClick={confirmDelete}
            style={{ background: canConfirm ? 'var(--red)' : undefined, borderColor: canConfirm ? 'var(--red)' : undefined }}
          >
            {deleting ? 'Deleting…' : 'Permanently Delete Branch'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

// ─── BRANCHES PAGE ────────────────────────────────────────
export default function BranchesPage() {
  const [branches,     setBranches]     = useState([])
  const [loading,      setLoading]      = useState(true)
  const [showCreate,   setShowCreate]   = useState(false)
  const [editBranch,   setEditBranch]   = useState(null)
  const [deleteBranch, setDeleteBranch] = useState(null)
  const [toggling,     setToggling]     = useState(null)
  const [notice,       setNotice]       = useState(null)

  async function load() {
    setLoading(true)
    try {
      const data = await branchesApi.list()
      setBranches(data.data || [])
    } catch (e) {
      setNotice({ type: 'error', text: e.message })
    } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  async function handleToggle(id) {
    setToggling(id)
    try {
      await branchesApi.toggle(id)
      await load()
    } finally { setToggling(null) }
  }

  const active   = branches.filter(b => b.isActive)
  const inactive = branches.filter(b => !b.isActive)

  return (
    <div style={{ width: '95%', maxWidth: 1800, margin: '0 auto', padding: 28 }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28, flexWrap: 'wrap', gap: 14 }}>
        <div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 26, color: 'var(--brown-800)' }}>Branches</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: 14, marginTop: 4 }}>
            {active.length} active · {inactive.length} inactive
          </p>
        </div>
        <Button variant="primary" onClick={() => setShowCreate(true)}>+ New Branch</Button>
      </div>

      {notice && (
        <div style={{
          marginBottom: 18,
          padding: '12px 16px',
          borderRadius: 'var(--radius-md)',
          background: notice.type === 'error' ? 'var(--red-light)' : 'var(--green-light)',
          color: notice.type === 'error' ? 'var(--red-dark)' : 'var(--green-dark)',
          fontSize: 13.5,
          fontWeight: 600,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <span>{notice.text}</span>
          <button onClick={() => setNotice(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700, color: 'inherit' }}>✕</button>
        </div>
      )}

      {/* Stats row */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        gap: 16, marginBottom: 28,
      }}>
        {[
          { label: 'Total Branches', value: branches.length,  icon: '🏪' },
          { label: 'Active',         value: active.length,    icon: '✅' },
          { label: 'Inactive',       value: inactive.length,  icon: '🚫' },
          { label: 'Total Staff',    value: branches.reduce((s, b) => s + (b._count?.users || 0), 0), icon: '👥' },
        ].map(s => (
          <div key={s.label} style={{
            background: 'var(--cream)', border: '1.5px solid var(--border)',
            borderRadius: 'var(--radius-lg)', padding: '22px 24px',
            display: 'flex', alignItems: 'center', gap: 16,
            boxShadow: 'var(--shadow-sm)',
          }}>
            <div style={{
              width: 52, height: 52, borderRadius: 'var(--radius-md)',
              background: 'var(--brown-100)', display: 'flex',
              alignItems: 'center', justifyContent: 'center', fontSize: 26, flexShrink: 0,
            }}>{s.icon}</div>
            <div>
              <div style={{ fontSize: 26, fontWeight: 700, fontFamily: 'var(--font-display)', color: 'var(--brown-800)' }}>
                {s.value}
              </div>
              <div style={{ fontSize: 11.5, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 700 }}>
                {s.label}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Branch list */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-faint)' }}>Loading branches…</div>
      ) : branches.length === 0 ? (
        <EmptyState icon="🏪" title="No branches yet" subtitle="Create your first branch above" />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {branches.map(branch => (
            <div key={branch.id} style={{
              background: 'var(--cream)',
              border: `1.5px solid ${branch.isActive ? 'var(--border)' : 'var(--border-light)'}`,
              borderRadius: 'var(--radius-lg)',
              padding: '22px 26px',
              display: 'flex', alignItems: 'center', gap: 20,
              opacity: branch.isActive ? 1 : 0.6,
              boxShadow: 'var(--shadow-sm)',
              flexWrap: 'wrap',
            }}>

              {/* Icon */}
              <div style={{
                width: 56, height: 56, borderRadius: 'var(--radius-md)',
                background: branch.isActive ? 'var(--brown-100)' : 'var(--border)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 28, flexShrink: 0,
              }}>
                🏪
              </div>

              {/* Info */}
              <div style={{ flex: 1, minWidth: 220 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6, flexWrap: 'wrap' }}>
                  <span style={{ fontWeight: 700, fontSize: 18, color: 'var(--brown-800)', fontFamily: 'var(--font-display)' }}>
                    {branch.name}
                  </span>
                  <span style={{
                    fontSize: 11, fontWeight: 700, padding: '4px 12px',
                    borderRadius: 'var(--radius-full)',
                    background: branch.isActive ? 'var(--green-light)' : 'var(--red-light)',
                    color: branch.isActive ? 'var(--green-dark)' : 'var(--red-dark)',
                  }}>
                    {branch.isActive ? 'Active' : 'Inactive'}
                  </span>
                </div>
                <div style={{ fontSize: 13.5, color: 'var(--text-muted)' }}>
                  📍 {branch.address}, {branch.city}
                </div>
                {branch.contactNo && (
                  <div style={{ fontSize: 12.5, color: 'var(--text-faint)', marginTop: 4 }}>
                    📞 {branch.contactNo}
                  </div>
                )}
              </div>

              {/* Stats */}
              <div style={{ display: 'flex', gap: 28, flexShrink: 0 }}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--brown-700)' }}>
                    {branch._count?.users || 0}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 700 }}>Staff</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--brown-700)' }}>
                    {branch._count?.orders || 0}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 700 }}>Orders</div>
                </div>
              </div>

              {/* Actions */}
              <div style={{ display: 'flex', gap: 10, flexShrink: 0 }}>
                <button
                  onClick={() => setEditBranch(branch)}
                  style={actionBtn}
                  title="Edit branch"
                  onMouseEnter={e => { e.currentTarget.style.background = 'var(--brown-50)'; e.currentTarget.style.borderColor = 'var(--brown-300)' }}
                  onMouseLeave={e => { e.currentTarget.style.background = '#fff'; e.currentTarget.style.borderColor = 'var(--border)' }}
                >
                  ✏️
                </button>
                <button
                  onClick={() => handleToggle(branch.id)}
                  disabled={toggling === branch.id}
                  title={branch.isActive ? 'Deactivate branch' : 'Activate branch'}
                  style={{
                    ...actionBtn,
                    borderColor: branch.isActive ? 'var(--border)' : 'var(--green)',
                    background: branch.isActive ? '#fff' : 'var(--green-light)',
                    color: branch.isActive ? 'var(--red)' : 'var(--green-dark)',
                  }}
                >
                  {toggling === branch.id ? '…' : branch.isActive ? '🚫' : '✅'}
                </button>
                <button
                  onClick={() => setDeleteBranch(branch)}
                  style={{ ...actionBtn, color: 'var(--red)' }}
                  title="Delete branch"
                  onMouseEnter={e => { e.currentTarget.style.background = 'var(--red-light)'; e.currentTarget.style.borderColor = 'var(--red)' }}
                  onMouseLeave={e => { e.currentTarget.style.background = '#fff'; e.currentTarget.style.borderColor = 'var(--border)' }}
                >
                  🗑️
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showCreate && (
        <BranchModal
          onClose={() => setShowCreate(false)}
          onSaved={() => { setShowCreate(false); setNotice({ type: 'success', text: 'Branch created successfully.' }); load() }}
        />
      )}

      {editBranch && (
        <BranchModal
          editBranch={editBranch}
          onClose={() => setEditBranch(null)}
          onSaved={() => { setEditBranch(null); setNotice({ type: 'success', text: 'Branch updated successfully.' }); load() }}
        />
      )}

      {deleteBranch && (
        <DeleteBranchModal
          branch={deleteBranch}
          onClose={() => setDeleteBranch(null)}
          onDeleted={(res) => {
            const r = res?.deletedRecords || {}
            setDeleteBranch(null)
            setNotice({
              type: 'success',
              text: `Permanently deleted "${res?.deletedBranch || deleteBranch.name}" (removed ${r.orders ?? 0} orders, ${r.payments ?? 0} payments, ${r.employees ?? 0} employees, ${r.inventoryItems ?? 0} inventory items).`,
            })
            load()
          }}
        />
      )}
    </div>
  )
}

const actionBtn = {
  background: '#fff', border: '1.5px solid var(--border)',
  borderRadius: 'var(--radius-md)', cursor: 'pointer',
  padding: '9px 13px', fontSize: 16,
  transition: 'all 180ms ease',
}