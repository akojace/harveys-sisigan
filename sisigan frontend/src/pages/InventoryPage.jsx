import { useState, useEffect, useMemo, useCallback } from 'react'
import { inventoryApi, reportsApi, dashboardApi } from '../api/client'
import { useAuth } from '../context/AuthContext'
import { Button, EmptyState, Modal, Input } from '../components/ui'
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts'

const CATEGORIES = ['SAUCE', 'SPICES', 'MAIN_INGREDIENT', 'RICE', 'UTILITIES', 'GAS']
const UNITS = ['ML', 'GRAM', 'LITER', 'PCS', 'GALLON', 'TANK', 'BAG', 'PACK', 'TUB']

function StatCard({ label, value, sub, tone = 'var(--brown-800)' }) {
  return (
    <div style={{ background: 'var(--cream)', border: '1.5px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '22px 24px', flex: 1, minWidth: 200, boxShadow: 'var(--shadow-sm)' }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>
        {label}
      </div>
      <div style={{ fontFamily: 'var(--font-display)', fontSize: 30, fontWeight: 700, color: tone, lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 12.5, color: 'var(--text-faint)', marginTop: 8 }}>{sub}</div>}
    </div>
  )
}

function Section({ title, right, children }) {
  return (
    <div style={{ background: 'var(--cream)', border: '1.5px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
        <h3 style={{ fontFamily: 'var(--font-display)', color: 'var(--brown-800)', fontSize: 15 }}>{title}</h3>
        {right}
      </div>
      {children}
    </div>
  )
}

function AddIngredientModal({ isOwner, branches, branchId, onClose, onSaved }) {
  const [form, setForm] = useState({
    name: '',
    category: 'SAUCE',
    unit: 'PCS',
    quantity: '',
    minThreshold: '',
    price: '',
    consumptionRateDays: '',
    consumptionLabel: '',
    dailyDeductionAmount: '',
    branchId: branchId || branches[0]?.id || '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  function set(k, v) { setForm((f) => ({ ...f, [k]: v })) }

  async function save() {
    setSaving(true)
    setError('')
    try {
      const payload = {
        name: form.name,
        category: form.category,
        unit: form.unit,
        quantity: Number(form.quantity),
      }

      if (isOwner && form.branchId) payload.branchId = Number(form.branchId)
      if (form.minThreshold !== '') payload.minThreshold = Number(form.minThreshold)
      if (form.price !== '') payload.price = Number(form.price)
      if (form.consumptionRateDays !== '') payload.consumptionRateDays = Number(form.consumptionRateDays)
      if (form.consumptionLabel.trim()) payload.consumptionLabel = form.consumptionLabel.trim()
      if (form.dailyDeductionAmount !== '') payload.dailyDeductionAmount = Number(form.dailyDeductionAmount)

      await inventoryApi.create(payload)
      onSaved()
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal title="Add Ingredient" onClose={onClose} width={480}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Input label="Name" value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. Oyster Sauce" />

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label style={lbl}>Category</label>
            <select value={form.category} onChange={(e) => set('category', e.target.value)} style={selectStyle}>
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label style={lbl}>Unit</label>
            <select value={form.unit} onChange={(e) => set('unit', e.target.value)} style={selectStyle}>
              {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>
        </div>

        {isOwner && (
          <div>
            <label style={lbl}>Branch</label>
            <select value={form.branchId} onChange={(e) => set('branchId', e.target.value)} style={selectStyle}>
              <option value="">Select branch</option>
              {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Input label="Quantity" type="number" value={form.quantity} onChange={(e) => set('quantity', e.target.value)} />
          <Input label="Min Threshold" type="number" value={form.minThreshold} onChange={(e) => set('minThreshold', e.target.value)} />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Input label="Price (optional)" type="number" value={form.price} onChange={(e) => set('price', e.target.value)} />
          <Input label="Consumption Days" type="number" value={form.consumptionRateDays} onChange={(e) => set('consumptionRateDays', e.target.value)} />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Input label="Consumption Label" value={form.consumptionLabel} onChange={(e) => set('consumptionLabel', e.target.value)} placeholder="e.g. Daily" />
          <Input label="Daily Deduction" type="number" value={form.dailyDeductionAmount} onChange={(e) => set('dailyDeductionAmount', e.target.value)} />
        </div>

        {error && <div style={{ color: 'var(--red)', fontSize: 13 }}>{error}</div>}

        <div style={{ display: 'flex', gap: 12 }}>
          <Button variant="outline" fullWidth onClick={onClose}>Cancel</Button>
          <Button variant="primary" fullWidth disabled={saving || !form.name || !form.quantity} onClick={save}>
            {saving ? 'Saving...' : 'Add Ingredient'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

// Adds stock to one existing inventory item. Kept separate from the read-only
// ingredients table below — this is the only place on the page that writes
// quantity. It always ADDS to the current amount; it never lets you set an
// exact value or deduct, since that's not this section's job.
function AddQuantitySection({ inventory, isOwner, onSaved }) {
  const [itemId, setItemId] = useState('')
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const selected = useMemo(
    () => inventory.find((i) => String(i.id) === String(itemId)) || null,
    [inventory, itemId]
  )

  async function submit() {
    setError('')
    setSuccess('')

    const addAmount = Number(amount)
    if (!selected) { setError('Select an ingredient first.'); return }
    if (!amount || Number.isNaN(addAmount) || addAmount <= 0) {
      setError('Enter an amount greater than 0.')
      return
    }

    setSaving(true)
    try {
      const currentQty = Number(selected.quantity)
      const nextQty = currentQty + addAmount

      await inventoryApi.update(selected.id, {
        quantity: nextQty,
        note: note.trim() || 'Stock added',
      })

      setSuccess(`Added ${addAmount} ${selected.ingredient?.unit} to ${selected.ingredient?.name}.`)
      setAmount('')
      setNote('')
      await onSaved()
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Section title="Add Quantity">
      <div style={{ display: 'grid', gridTemplateColumns: isOwner ? '2fr 1fr 1fr auto' : '2fr 1fr auto', gap: 10, alignItems: 'end' }}>
        <div>
          <label style={lbl}>Ingredient</label>
          <select value={itemId} onChange={(e) => setItemId(e.target.value)} style={selectStyle}>
            <option value="">Select ingredient...</option>
            {inventory.map((item) => (
              <option key={item.id} value={item.id}>
                {item.ingredient?.name} {isOwner ? `— ${item.branch?.name}` : ''} (current: {Number(item.quantity).toFixed(3)} {item.ingredient?.unit})
              </option>
            ))}
          </select>
        </div>

        <Input
          label={`Amount to Add${selected ? ` (${selected.ingredient?.unit})` : ''}`}
          type="number"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />

        <Input
          label="Note (optional)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="e.g. Received new stock"
        />

        <Button variant="primary" disabled={saving || !itemId || !amount} onClick={submit}>
          {saving ? 'Adding...' : 'Add Stock'}
        </Button>
      </div>

      {error && <div style={{ color: 'var(--red)', fontSize: 13, marginTop: 10 }}>{error}</div>}
      {success && <div style={{ color: 'var(--green-dark)', fontSize: 13, marginTop: 10 }}>{success}</div>}
    </Section>
  )
}

export default function InventoryPage() {
  const { user } = useAuth()
  const isOwner = user?.role === 'OWNER'

  const [loading, setLoading] = useState(true)
  const [branchId, setBranchId] = useState('')
  const [branches, setBranches] = useState([])
  const [inventory, setInventory] = useState([])
  const [report, setReport] = useState(null)
  const [error, setError] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')

  useEffect(() => {
    if (!isOwner) return
    dashboardApi.branches().then((d) => setBranches(d.data || []))
  }, [isOwner])

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const params = {}
      if (branchId) params.branchId = branchId

      const [invRes, reportRes] = await Promise.all([
        inventoryApi.list(params),
        reportsApi.usage({ ...params, period: 'weekly' }),
      ])

      setInventory(invRes.data || [])
      setReport(reportRes.data || null)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [branchId])

  useEffect(() => { load() }, [load])

  const lowStockItems = useMemo(
    () => inventory.filter((i) => Number(i.quantity) <= Number(i.minThreshold)),
    [inventory]
  )

  // Filters the "All Ingredients" table by ingredient name and category as the user types.
  const filteredInventory = useMemo(() => {
    const term = searchTerm.trim().toLowerCase()
    if (!term) return inventory
    return inventory.filter((item) => {
      const name = item.ingredient?.name?.toLowerCase() || ''
      const category = item.ingredient?.category?.toLowerCase() || ''
      return name.includes(term) || category.includes(term)
    })
  }, [inventory, searchTerm])

  const topUsageData = useMemo(() => {
    const rows = report?.usageByItem || []
    return rows
      .map((r) => ({
        name: r.ingredientName,
        usage: Math.abs(Number(r.netChange || 0)),
      }))
      .sort((a, b) => b.usage - a.usage)
      .slice(0, 8)
  }, [report])

  const onSavedIngredient = async () => {
    setShowAdd(false)
    await load()
  }

  if (loading && !report) {
    return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', color: 'var(--text-muted)' }}>Loading inventory insights...</div>
  }

  return (
    <div style={{ width: '95%', maxWidth: 1800, margin: '0 auto', padding: 28 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24, flexWrap: 'wrap', gap: 14 }}>
        <div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 26, color: 'var(--brown-800)', marginBottom: 4 }}>Inventory Insights</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>
            {isOwner ? 'Cross-branch ingredient visibility and alerts' : `${user?.branch?.name} stock and usage`}
          </p>
        </div>

        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          {isOwner && (
            <select value={branchId} onChange={(e) => setBranchId(e.target.value)} style={{ padding: '9px 14px', border: '1.5px solid var(--border)', borderRadius: 'var(--radius-md)', background: '#fff', cursor: 'pointer' }}>
              <option value="">All Branches</option>
              {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          )}
          <Button variant="primary" size="sm" onClick={() => setShowAdd(true)}>+ Add Ingredient</Button>
          <Button variant="outline" size="sm" onClick={load}>Refresh</Button>
        </div>
      </div>

      {error && <div style={{ background: 'var(--red-light)', color: 'var(--red-dark)', borderRadius: 'var(--radius-md)', padding: '12px 16px', marginBottom: 16 }}>{error}</div>}

      <div style={{ display: 'flex', gap: 16, marginBottom: 18, flexWrap: 'wrap' }}>
        <StatCard label="Inventory Items" value={inventory.length} />
        <StatCard label="Low Stock Alerts" value={lowStockItems.length} tone={lowStockItems.length ? 'var(--red)' : 'var(--green)'} />
        <StatCard label="Weekly Usage Events" value={report?.summary?.totalLogs || 0} sub="Based on audit logs" />
      </div>

      <div style={{ marginBottom: 16 }}>
        <AddQuantitySection inventory={inventory} isOwner={isOwner} onSaved={load} />
      </div>

      <div style={{ marginBottom: 16 }}>
        <Section
          title="All Ingredients List"
          right={
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by name or category..."
              style={searchInputStyle}
            />
          }
        >
          {inventory.length === 0 ? (
            <EmptyState icon="??" title="No ingredients yet" subtitle="Add ingredients to start tracking stock" />
          ) : filteredInventory.length === 0 ? (
            <EmptyState icon="??" title="No matches" subtitle={`No ingredients match "${searchTerm}"`} />
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
                <thead>
                  <tr style={{ background: 'var(--brown-50)' }}>
                    {['Ingredient', 'Category', 'Qty', 'Threshold', 'Price', 'Branch', 'Status'].map((h) => (
                      <th key={h} style={{ padding: '9px 12px', textAlign: 'left', fontWeight: 700, color: 'var(--text-muted)', borderBottom: '1px solid var(--border)', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredInventory.map((item, idx) => {
                    const low = Number(item.quantity) <= Number(item.minThreshold)
                    return (
                      <tr key={item.id} style={{ borderBottom: idx < filteredInventory.length - 1 ? '1px solid var(--border-light)' : 'none' }}>
                        <td style={{ padding: '9px 12px', fontWeight: 600 }}>{item.ingredient?.name}</td>
                        <td style={{ padding: '9px 12px', color: 'var(--text-mid)' }}>{item.ingredient?.category}</td>
                        <td style={{ padding: '9px 12px' }}>{Number(item.quantity).toFixed(3)} {item.ingredient?.unit}</td>
                        <td style={{ padding: '9px 12px' }}>{Number(item.minThreshold).toFixed(3)} {item.ingredient?.unit}</td>
                        <td style={{ padding: '9px 12px' }}>{item.price ? `?${Number(item.price).toFixed(2)}` : '-'}</td>
                        <td style={{ padding: '9px 12px', color: 'var(--text-mid)' }}>{item.branch?.name}</td>
                        <td style={{ padding: '9px 12px' }}>
                          <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 10px', borderRadius: 'var(--radius-full)', background: low ? 'var(--red-light)' : 'var(--green-light)', color: low ? 'var(--red-dark)' : 'var(--green-dark)' }}>
                            {low ? 'LOW' : 'OK'}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Section>
      </div>

      <div style={{ marginBottom: 18 }}>
        <Section title="Low Stock Alerts">
          {lowStockItems.length === 0 ? (
            <EmptyState icon="✅" title="No low stock items" subtitle="All tracked ingredients are above threshold" />
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
                <thead>
                  <tr style={{ background: 'var(--brown-50)' }}>
                    {['Ingredient', 'Category', 'Current', 'Threshold', 'Branch'].map((h) => (
                      <th key={h} style={{ padding: '11px 14px', textAlign: 'left', fontWeight: 700, color: 'var(--text-muted)', borderBottom: '1px solid var(--border)', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {lowStockItems.map((item, idx) => (
                    <tr key={item.id} style={{ borderBottom: idx < lowStockItems.length - 1 ? '1px solid var(--border-light)' : 'none' }}>
                      <td style={{ padding: '11px 14px', fontWeight: 600 }}>{item.ingredient?.name}</td>
                      <td style={{ padding: '11px 14px', color: 'var(--text-mid)' }}>{item.ingredient?.category}</td>
                      <td style={{ padding: '11px 14px', color: 'var(--red-dark)', fontWeight: 700 }}>{Number(item.quantity).toFixed(3)} {item.ingredient?.unit}</td>
                      <td style={{ padding: '11px 14px' }}>{Number(item.minThreshold).toFixed(3)} {item.ingredient?.unit}</td>
                      <td style={{ padding: '11px 14px', color: 'var(--text-mid)' }}>{item.branch?.name}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Section>
      </div>

      <Section title="Top Weekly Ingredient Usage">
        {topUsageData.length === 0 ? (
          <EmptyState icon="📊" title="No usage logs yet" subtitle="Create orders or run daily deduction to populate" />
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={topUsageData} layout="vertical" margin={{ left: 10, right: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 11 }} />
              <YAxis type="category" dataKey="name" width={140} tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v) => [Number(v).toFixed(3), 'Used']} />
              <Bar dataKey="usage" fill="var(--brown-500)" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </Section>

      {showAdd && (
        <AddIngredientModal
          isOwner={isOwner}
          branches={branches}
          branchId={branchId}
          onClose={() => setShowAdd(false)}
          onSaved={onSavedIngredient}
        />
      )}
    </div>
  )
}

const lbl = {
  fontSize: 12,
  fontWeight: 700,
  color: 'var(--text-muted)',
  textTransform: 'uppercase',
  letterSpacing: 0.5,
  display: 'block',
  marginBottom: 7,
}

const selectStyle = {
  width: '100%',
  padding: '12px 14px',
  border: '1.5px solid var(--border)',
  borderRadius: 'var(--radius-md)',
  fontSize: 14.5,
  background: '#fff',
  cursor: 'pointer',
}

const searchInputStyle = {
  padding: '8px 12px',
  border: '1.5px solid var(--border)',
  borderRadius: 'var(--radius-md)',
  fontSize: 13,
  background: '#fff',
  minWidth: 220,
}