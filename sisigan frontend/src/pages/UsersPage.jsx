// src/pages/UsersPage.jsx
import { useState, useEffect } from 'react'
import { usersApi, dashboardApi } from '../api/client'
import { useAuth } from '../context/AuthContext'
import { Button, Input, Modal, EmptyState } from '../components/ui'

const ROLE_COLORS = {
  OWNER: { bg: '#FEE2E2', color: '#991B1B' },
  MANAGER: { bg: '#DBEAFE', color: '#1E40AF' },
  CASHIER: { bg: '#D1FAE5', color: '#065F46' },
}

function RoleBadge({ role }) {
  const s = ROLE_COLORS[role] || ROLE_COLORS.CASHIER
  return (
    <span style={{
      background: s.bg, color: s.color,
      padding: '4px 12px', borderRadius: 'var(--radius-full)',
      fontSize: 11, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase',
    }}>{role}</span>
  )
}

// ─── CREATE / EDIT MODAL ──────────────────────────────────
function UserModal({ editUser, branches, onClose, onSaved, requestingRole }) {
  const isEdit = !!editUser
  const [form, setForm] = useState({
    name: editUser?.name || '',
    email: editUser?.email || '',
    password: '',
    confirmPassword: '',
    role: editUser?.role || 'CASHIER',
    branchId: editUser?.branch?.id || branches[0]?.id || '',
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Roles that current user can assign
  const assignableRoles = requestingRole === 'OWNER'
    ? ['MANAGER', 'CASHIER']
    : ['CASHIER']  // Manager can only create cashiers

  // Only relevant on create — confirmPassword never gets sent to the backend,
  // it's just a client-side check that the two fields match before we submit.
  const passwordsMismatch = !isEdit && form.password !== '' && form.confirmPassword !== '' && form.password !== form.confirmPassword

  function set(k, v) { setForm(f => ({ ...f, [k]: v })) }

  async function save() {
    setLoading(true); setError('')
    try {
      if (isEdit) {
        const payload = { name: form.name, email: form.email }
        if (requestingRole === 'OWNER') {
          payload.role = form.role
          payload.branchId = form.branchId
        }
        await usersApi.update(editUser.id, payload)
      } else {
        // CREATE NEW ACCOUNT
        if (!form.password) {
          setError('Password is required.');
          setLoading(false);
          return
        }

        if (form.password !== form.confirmPassword) {
          setError('Passwords do not match.');
          setLoading(false);
          return
        }

        // Build payload
        const payload = {
          name: form.name,
          email: form.email,
          password: form.password,
          role: form.role,
        }

        // Only OWNER specifies branchId - Manager's branch is auto-assigned by backend
        if (requestingRole === 'OWNER') {
          payload.branchId = Number(form.branchId)
          // Validate branch selected
          if (!payload.branchId) {
            setError('Branch is required.')
            setLoading(false)
            return
          }
        }
        // For MANAGER: don't send branchId - backend will use their own branch

        await usersApi.create(payload)
      }
      onSaved()
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal title={isEdit ? 'Edit Account' : 'Create Account'} onClose={onClose} width={440}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Input label="Full Name" value={form.name} onChange={e => set('name', e.target.value)} placeholder="e.g. Juan dela Cruz" />
        <Input label="Email" type="email" value={form.email} onChange={e => set('email', e.target.value)} placeholder="email@sisigan.ph" />

        {!isEdit && (
          <>
            <Input label="Password" type="password" value={form.password} onChange={e => set('password', e.target.value)} placeholder="Minimum 6 characters" />
            <div>
              <Input
                label="Confirm Password"
                type="password"
                value={form.confirmPassword}
                onChange={e => set('confirmPassword', e.target.value)}
                placeholder="Re-enter password"
              />
              {passwordsMismatch && (
                <p style={{ color: 'var(--red)', fontSize: 12, marginTop: 6 }}>Passwords do not match.</p>
              )}
            </div>
          </>
        )}

        <div>
          <label style={lbl}>Role</label>
          <div style={{ display: 'flex', gap: 10 }}>
            {assignableRoles.map(r => (
              <button key={r} onClick={() => set('role', r)} style={{
                flex: 1, padding: '11px 4px',
                border: `2px solid ${form.role === r ? 'var(--brown-600)' : 'var(--border)'}`,
                borderRadius: 'var(--radius-md)',
                background: form.role === r ? 'var(--gradient-primary)' : '#fff',
                color: form.role === r ? '#fff' : 'var(--brown-700)',
                fontWeight: 700, fontSize: 12.5, cursor: 'pointer', transition: 'all 180ms ease',
              }}>{r}</button>
            ))}
          </div>
        </div>

        {/* Branch assignment — Owner can pick any branch */}
        {requestingRole === 'OWNER' && (
          <div>
            <label style={lbl}>Branch</label>
            <select value={form.branchId} onChange={e => set('branchId', e.target.value)}
              style={{ width: '100%', padding: '12px 14px', border: '1.5px solid var(--border)', borderRadius: 'var(--radius-md)', fontSize: 14.5, background: '#fff', outline: 'none', cursor: 'pointer' }}>
              {branches.map(b => <option key={b.id} value={b.id}>{b.name} — {b.city}</option>)}
            </select>
          </div>
        )}

        {error && <p style={{ color: 'var(--red)', fontSize: 13 }}>{error}</p>}

        <div style={{ display: 'flex', gap: 12 }}>
          <Button variant="outline" fullWidth onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            fullWidth
            disabled={loading || (!isEdit && (passwordsMismatch || !form.confirmPassword))}
            onClick={save}
          >
            {loading ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Account'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

// ─── RESET PASSWORD MODAL ─────────────────────────────────
function ResetPasswordModal({ user, onClose }) {
  const [pwd, setPwd] = useState('')
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')

  async function save() {
    setLoading(true); setError('')
    try {
      await usersApi.resetPassword(user.id, pwd)
      setDone(true)
    } catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }

  return (
    <Modal title={`Reset Password — ${user.name}`} onClose={onClose} width={380}>
      {done ? (
        <div style={{ textAlign: 'center', padding: '24px 0' }}>
          <div style={{ fontSize: 44, marginBottom: 12 }}>✅</div>
          <div style={{ fontWeight: 700, color: 'var(--green)', marginBottom: 18, fontSize: 15 }}>Password updated!</div>
          <Button variant="primary" fullWidth onClick={onClose}>Close</Button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Input label="New Password" type="password" value={pwd} onChange={e => setPwd(e.target.value)} placeholder="Minimum 6 characters" />
          {error && <p style={{ color: 'var(--red)', fontSize: 13 }}>{error}</p>}
          <div style={{ display: 'flex', gap: 12 }}>
            <Button variant="outline" fullWidth onClick={onClose}>Cancel</Button>
            <Button variant="primary" fullWidth disabled={loading || pwd.length < 6} onClick={save}>
              {loading ? 'Updating…' : 'Reset Password'}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  )
}

// ─── USERS PAGE ───────────────────────────────────────────
export default function UsersPage() {
  const { user: me } = useAuth()
  const [users, setUsers] = useState([])
  const [branches, setBranches] = useState([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [editUser, setEditUser] = useState(null)
  const [resetUser, setResetUser] = useState(null)
  const [toggling, setToggling] = useState(null)
  const [filterRole, setFilterRole] = useState('ALL')
  const [authLogs, setAuthLogs] = useState([])

  async function load() {
    setLoading(true)
    try {
      const [u, b, logs] = await Promise.all([
        usersApi.list(),
        me?.role === 'OWNER' ? dashboardApi.branches() : Promise.resolve({ data: [] }),
        dashboardApi.authLogs({ period: 'month', limit: 50 }),
      ])
      setUsers(u.data || [])
      setAuthLogs(logs.data || [])
      // For manager, their own branch only
      if (me?.role === 'MANAGER') {
        const selfFromList = (u.data || []).find(x => x.id === me?.id)
        const managerBranch = me?.branch || selfFromList?.branch
        setBranches(managerBranch ? [managerBranch] : [])
      } else {
        setBranches(b.data || [])
      }
    } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  async function handleToggle(userId) {
    setToggling(userId)
    try {
      await usersApi.toggle(userId)
      await load()
    } finally { setToggling(null) }
  }

  const filtered = filterRole === 'ALL' ? users : users.filter(u => u.role === filterRole)
  const fmtDateTime = (value) => new Date(value).toLocaleString('en-PH')

  return (
    <div style={{ width: '95%', maxWidth: 1800, margin: '0 auto', padding: 28 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 26, flexWrap: 'wrap', gap: 14 }}>
        <div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 26, color: 'var(--brown-800)' }}>Accounts</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: 14, marginTop: 4 }}>
            {me?.role === 'OWNER' ? 'Manage accounts across all branches' : `Manage accounts for ${me?.branch?.name}`}
          </p>
        </div>
        <Button variant="primary" onClick={() => setShowCreate(true)}>+ New Account</Button>
      </div>

      {/* Role filter */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 24, flexWrap: 'wrap' }}>
        {['ALL', 'OWNER', 'MANAGER', 'CASHIER'].map(r => (
          <button key={r} onClick={() => setFilterRole(r)} style={{
            padding: '10px 20px', borderRadius: 'var(--radius-full)', border: 'none',
            background: filterRole === r ? 'var(--gradient-primary)' : 'var(--brown-100)',
            color: filterRole === r ? '#fff' : 'var(--brown-800)',
            fontWeight: 700, fontSize: 12.5, cursor: 'pointer', transition: 'all 200ms ease',
            boxShadow: filterRole === r ? '0 4px 14px rgba(180,83,9,0.28)' : 'none',
          }}>{r} {r !== 'ALL' ? `(${users.filter(u => u.role === r).length})` : `(${users.length})`}</button>
        ))}
      </div>

      {/* Users table */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-faint)' }}>Loading accounts…</div>
      ) : filtered.length === 0 ? (
        <EmptyState icon="👤" title="No accounts found" />
      ) : (
        <div style={{ background: 'var(--cream)', border: '1.5px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden', boxShadow: 'var(--shadow-sm)' }}>
          {/* Table header */}
          <div style={{
            display: 'grid', gridTemplateColumns: '1fr 1fr 120px 160px 110px 130px',
            padding: '14px 22px', background: 'var(--brown-50)', borderBottom: '1px solid var(--border)',
            fontSize: 11.5, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5,
            position: 'sticky', top: 0, zIndex: 1,
          }}>
            <span>Name</span>
            <span>Email</span>
            <span>Role</span>
            <span>Branch</span>
            <span>Status</span>
            <span style={{ textAlign: 'right' }}>Actions</span>
          </div>

          {filtered.map((u, i) => (
            <div key={u.id} style={{
              display: 'grid', gridTemplateColumns: '1fr 1fr 120px 160px 110px 130px',
              padding: '16px 22px', alignItems: 'center',
              borderBottom: i < filtered.length - 1 ? '1px solid var(--border-light)' : 'none',
              opacity: !u.isActive ? 0.55 : 1,
              background: u.id === me?.id ? 'rgba(180,83,9,0.03)' : i % 2 === 1 ? 'rgba(180,83,9,0.015)' : undefined,
              transition: 'background 150ms ease',
            }}>
              <div>
                <div style={{ fontWeight: 600, color: 'var(--text-dark)', fontSize: 14.5 }}>
                  {u.name} {u.id === me?.id && <span style={{ fontSize: 10.5, color: 'var(--brown-500)' }}>(you)</span>}
                </div>
              </div>
              <div style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>{u.email}</div>
              <div><RoleBadge role={u.role} /></div>
              <div style={{ fontSize: 12.5, color: 'var(--text-mid)' }}>{u.branch?.name || '—'}</div>
              <div>
                <span style={{
                  fontSize: 11, fontWeight: 700, padding: '4px 12px',
                  borderRadius: 'var(--radius-full)',
                  background: u.isActive ? 'var(--green-light)' : 'var(--red-light)',
                  color: u.isActive ? 'var(--green-dark)' : 'var(--red-dark)',
                }}>
                  {u.isActive ? 'Active' : 'Inactive'}
                </span>
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                {/* Manager can only act on Cashiers — hide buttons for Owner/Manager rows */}
                {(me?.role === 'OWNER' || u.role === 'CASHIER') && (
                  <>
                    <button onClick={() => setEditUser(u)} style={actionBtn} title="Edit">✏️</button>
                    <button onClick={() => setResetUser(u)} style={actionBtn} title="Reset password">🔑</button>
                    {u.id !== me?.id && (
                      <button
                        onClick={() => handleToggle(u.id)}
                        disabled={toggling === u.id}
                        style={{ ...actionBtn, color: u.isActive ? 'var(--red)' : 'var(--green)' }}
                        title={u.isActive ? 'Deactivate' : 'Activate'}
                      >
                        {toggling === u.id ? '…' : u.isActive ? '🚫' : '✅'}
                      </button>
                    )}
                  </>
                )}
                {/* Show a lock icon for rows the Manager cannot touch */}
                {me?.role === 'MANAGER' && u.role !== 'CASHIER' && u.id !== me?.id && (
                  <span title="No permission to edit this account" style={{ fontSize: 16, opacity: 0.35 }}>🔒</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={{ marginTop: 26, background: 'var(--cream)', border: '1.5px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden', boxShadow: 'var(--shadow-sm)' }}>
        <div style={{ padding: '16px 22px', borderBottom: '1px solid var(--border)', background: 'var(--brown-50)' }}>
          <h3 style={{ margin: 0, fontSize: 15, color: 'var(--brown-800)', fontFamily: 'var(--font-display)' }}>Login / Logout Audit Trail</h3>
          <p style={{ margin: '5px 0 0', fontSize: 12.5, color: 'var(--text-muted)' }}>
            Latest authentication activity for accounts in your scope.
          </p>
        </div>

        {authLogs.length === 0 ? (
          <div style={{ padding: 28, color: 'var(--text-faint)', fontSize: 13.5, textAlign: 'center' }}>
            No login or logout activity yet.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
              <thead>
                <tr style={{ background: 'var(--brown-50)' }}>
                  {['When', 'Account', 'Role', 'Action', 'Branch'].map(h => (
                    <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 700, color: 'var(--text-muted)', borderBottom: '1px solid var(--border)', fontSize: 11.5, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {authLogs.map((log, i) => (
                  <tr key={log.id} style={{
                    borderBottom: i < authLogs.length - 1 ? '1px solid var(--border-light)' : 'none',
                    background: i % 2 === 1 ? 'rgba(180,83,9,0.015)' : undefined,
                  }}>
                    <td style={{ padding: '12px 16px', color: 'var(--text-mid)' }}>{fmtDateTime(log.createdAt)}</td>
                    <td style={{ padding: '12px 16px' }}>
                      <div style={{ fontWeight: 600, color: 'var(--text-dark)' }}>{log.user?.name || 'Unknown user'}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{log.user?.email || '-'}</div>
                    </td>
                    <td style={{ padding: '12px 16px' }}><RoleBadge role={log.role} /></td>
                    <td style={{ padding: '12px 16px' }}>
                      <span style={{
                        fontSize: 11,
                        fontWeight: 700,
                        padding: '4px 12px',
                        borderRadius: 'var(--radius-full)',
                        background: log.action === 'LOGIN' ? 'var(--green-light)' : 'var(--brown-100)',
                        color: log.action === 'LOGIN' ? 'var(--green-dark)' : 'var(--brown-800)',
                      }}>
                        {log.action}
                      </span>
                    </td>
                    <td style={{ padding: '12px 16px', color: 'var(--text-mid)' }}>{log.branch?.name || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showCreate && (
        <UserModal
          branches={branches}
          requestingRole={me?.role}
          onClose={() => setShowCreate(false)}
          onSaved={() => { setShowCreate(false); load() }}
        />
      )}

      {editUser && (
        <UserModal
          editUser={editUser}
          branches={branches}
          requestingRole={me?.role}
          onClose={() => setEditUser(null)}
          onSaved={() => { setEditUser(null); load() }}
        />
      )}

      {resetUser && (
        <ResetPasswordModal
          user={resetUser}
          onClose={() => { setResetUser(null); load() }}
        />
      )}
    </div>
  )
}

const lbl = { fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 8 }
const actionBtn = {
  background: '#fff', border: '1.5px solid var(--border)', borderRadius: 'var(--radius-md)',
  cursor: 'pointer', padding: '7px 11px', fontSize: 14, transition: 'all 180ms ease',
}
