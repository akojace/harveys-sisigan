import { useState, useEffect, useMemo, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { inventoryApi, reportsApi, dashboardApi } from '../api/client'
import { useAuth } from '../context/AuthContext'
import { useIsMobile } from '../hooks/useIsMobile'
import { getUserBranchId } from '../utils/branch'
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
  const isMobile = useIsMobile()
  const [form, setForm] = useState({
    name: '',
    category: 'SAUCE',
    unit: 'PCS',
    quantity: '',
    minThreshold: '',
    price: '',
    gramsPerUnit: '',
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
      if (form.gramsPerUnit !== '') payload.gramsPerUnit = Number(form.gramsPerUnit)
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

        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12 }}>
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

        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12 }}>
          <Input label="Quantity" type="number" value={form.quantity} onChange={(e) => set('quantity', e.target.value)} />
          <Input label="Min Threshold" type="number" value={form.minThreshold} onChange={(e) => set('minThreshold', e.target.value)} />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12 }}>
          <Input label="Price (optional)" type="number" value={form.price} onChange={(e) => set('price', e.target.value)} />
          <Input
            label="Grams per Unit (Optional)"
            type="number"
            step="any"
            min="0.001"
            value={form.gramsPerUnit}
            onChange={(e) => set('gramsPerUnit', e.target.value)}
            placeholder="e.g. 100 (for unit conversion)"
          />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12 }}>
          <Input label="Consumption Days" type="number" value={form.consumptionRateDays} onChange={(e) => set('consumptionRateDays', e.target.value)} />
          <Input label="Daily Deduction" type="number" value={form.dailyDeductionAmount} onChange={(e) => set('dailyDeductionAmount', e.target.value)} />
        </div>

        <Input label="Consumption Label" value={form.consumptionLabel} onChange={(e) => set('consumptionLabel', e.target.value)} placeholder="e.g. Daily" />

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

// ADDED — edits an existing inventory row's category/unit/price/threshold/
// consumption settings, WITHOUT touching quantity (that's handled by the
// separate "Add Quantity" section below). Pre-filled from the row's
// current values, so no risk of retyping the ingredient name wrong and
// accidentally creating a duplicate (which the old "just re-add it with
// the same name" workaround risked).
function EditIngredientModal({ item, onClose, onSaved }) {
  const isMobile = useIsMobile()
  const [form, setForm] = useState({
    category: item.ingredient?.category || 'SAUCE',
    unit: item.ingredient?.unit || 'PCS',
    minThreshold: item.minThreshold != null ? String(item.minThreshold) : '',
    price: item.price != null ? String(item.price) : '',
    gramsPerUnit: item.ingredient?.gramsPerUnit != null ? String(item.ingredient.gramsPerUnit) : '',
    consumptionRateDays: item.consumptionRateDays != null ? String(item.consumptionRateDays) : '',
    consumptionLabel: item.consumptionLabel || '',
    dailyDeductionAmount: item.dailyDeductionAmount != null ? String(item.dailyDeductionAmount) : '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  function set(k, v) { setForm((f) => ({ ...f, [k]: v })) }

  async function save() {
    setSaving(true)
    setError('')
    try {
      const payload = {
        category: form.category,
        unit: form.unit,
      }
      if (form.minThreshold !== '') payload.minThreshold = Number(form.minThreshold)
      if (form.price !== '') payload.price = Number(form.price)
      if (form.gramsPerUnit !== '') {
        payload.gramsPerUnit = Number(form.gramsPerUnit)
      } else {
        payload.gramsPerUnit = null
      }
      if (form.consumptionRateDays !== '') payload.consumptionRateDays = Number(form.consumptionRateDays)
      payload.consumptionLabel = form.consumptionLabel.trim()
      if (form.dailyDeductionAmount !== '') payload.dailyDeductionAmount = Number(form.dailyDeductionAmount)

      await inventoryApi.updateDetails(item.id, payload)
      onSaved()
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal title={`Edit ${item.ingredient?.name}`} onClose={onClose} width={480}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ fontSize: 12.5, color: 'var(--text-muted)', background: 'var(--brown-50)', padding: '10px 14px', borderRadius: 'var(--radius-md)' }}>
          Editing for <strong>{item.branch?.name}</strong>. Quantity isn't changed here — use "Add Quantity" below for stock adjustments.
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12 }}>
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

        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12 }}>
          <Input label="Price" type="number" value={form.price} onChange={(e) => set('price', e.target.value)} placeholder="e.g. 85.00" />
          <Input label="Min Threshold" type="number" value={form.minThreshold} onChange={(e) => set('minThreshold', e.target.value)} />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12 }}>
          <Input
            label="Grams per Unit / Order"
            type="number"
            step="any"
            min="0.001"
            value={form.gramsPerUnit}
            onChange={(e) => set('gramsPerUnit', e.target.value)}
            placeholder="e.g. 100 (auto gram conversion)"
          />
          <Input label="Consumption Days" type="number" value={form.consumptionRateDays} onChange={(e) => set('consumptionRateDays', e.target.value)} />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12 }}>
          <Input label="Daily Deduction" type="number" value={form.dailyDeductionAmount} onChange={(e) => set('dailyDeductionAmount', e.target.value)} />
          <Input label="Consumption Label" value={form.consumptionLabel} onChange={(e) => set('consumptionLabel', e.target.value)} placeholder="e.g. Daily" />
        </div>

        {error && <div style={{ color: 'var(--red)', fontSize: 13 }}>{error}</div>}

        <div style={{ display: 'flex', gap: 12 }}>
          <Button variant="outline" fullWidth onClick={onClose}>Cancel</Button>
          <Button variant="primary" fullWidth disabled={saving} onClick={save}>
            {saving ? 'Saving...' : 'Save Changes'}
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
  const isMobile = useIsMobile()
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
      {/* CHANGED — stack to 1 column on mobile; the fixed 'auto' button
          column plus 2-3 other columns had no overflow protection and
          would squeeze selects/inputs unreadably narrow on a phone */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : (isOwner ? '2fr 1fr 1fr auto' : '2fr 1fr auto'), gap: 10, alignItems: 'end' }}>
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

function TransferStockModal({ isOwner, branches, userBranchId, inventory, onClose, onSaved }) {
  const [sourceBranchId, setSourceBranchId] = useState(isOwner ? (branches[0]?.id || '') : userBranchId)
  const [destBranchId, setDestBranchId] = useState('')
  const [ingredientId, setIngredientId] = useState('')
  const [quantity, setQuantity] = useState('')
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // Filter available items belonging to source branch
  const availableItems = useMemo(() => {
    return inventory.filter((i) => Number(i.branchId) === Number(sourceBranchId) && Number(i.quantity) > 0)
  }, [inventory, sourceBranchId])

  const selectedItem = availableItems.find((i) => Number(i.ingredientId) === Number(ingredientId))
  const unit = selectedItem?.ingredient?.unit || 'GRAM'
  const gpu = selectedItem?.ingredient?.gramsPerUnit ? Number(selectedItem.ingredient.gramsPerUnit) : null
  const isGramConverted = gpu !== null && gpu > 0

  const enteredQty = Number(quantity) || 0
  const calculatedGrams = isGramConverted ? Math.round(enteredQty * gpu * 1000) / 1000 : null
  const availableStock = selectedItem ? Number(selectedItem.quantity) : 0
  const requiredStock = isGramConverted ? calculatedGrams : enteredQty
  const isOverStock = selectedItem && enteredQty > 0 && requiredStock > availableStock

  // Destination branches (exclude source)
  const destinationBranches = branches.filter((b) => Number(b.id) !== Number(sourceBranchId))

  async function submit(e) {
    e.preventDefault()
    if (!sourceBranchId || !destBranchId || !ingredientId || !quantity) {
      setError('Please fill in all required fields.')
      return
    }
    const q = Number(quantity)
    if (isNaN(q) || q <= 0) {
      setError('Quantity must be greater than zero.')
      return
    }
    if (isOverStock) {
      setError(
        isGramConverted
          ? `Cannot transfer ${calculatedGrams.toLocaleString()} g (${enteredQty.toLocaleString()} units). Only ${availableStock.toLocaleString()} g available in source branch.`
          : `Cannot transfer ${enteredQty} ${unit}. Only ${availableStock.toFixed(2)} ${unit} available in source branch.`
      )
      return
    }

    setLoading(true)
    setError('')
    try {
      const payload = {
        sourceBranchId: Number(sourceBranchId),
        destBranchId: Number(destBranchId),
        ingredientId: Number(ingredientId),
        notes: notes.trim() || undefined,
      }

      if (isGramConverted) {
        payload.inputQuantity = q
        payload.inputUnit = 'UNITS'
        payload.quantity = q
        payload.unit = 'GRAM'
      } else {
        payload.quantity = q
        payload.unit = unit
      }

      const res = await inventoryApi.transfer(payload)

      setSuccess(
        isGramConverted
          ? `Transfer successful! Reference: ${res.data?.transferNo || 'Completed'}. Transferred ${q.toLocaleString()} units (${calculatedGrams.toLocaleString()} g).`
          : `Transfer successful! Reference: ${res.data?.transferNo || 'Completed'}. Transferred ${q} ${unit}.`
      )
      setTimeout(() => {
        onSaved()
      }, 1200)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal title="Inter-Branch Inventory Transfer" onClose={onClose} width={540}>
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {error && <div style={{ color: 'var(--red)', fontSize: 13 }}>{error}</div>}
        {success && <div style={{ color: 'var(--green-dark)', fontSize: 13, fontWeight: 700 }}>{success}</div>}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label style={lbl}>Source Branch *</label>
            <select
              value={sourceBranchId}
              onChange={(e) => { setSourceBranchId(e.target.value); setIngredientId(''); }}
              style={selectStyle}
              disabled={!isOwner}
              required
            >
              {branches.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label style={lbl}>Destination Branch *</label>
            <select
              value={destBranchId}
              onChange={(e) => setDestBranchId(e.target.value)}
              style={selectStyle}
              required
            >
              <option value="">Select destination...</option>
              {destinationBranches.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label style={lbl}>Ingredient to Transfer *</label>
          <select
            value={ingredientId}
            onChange={(e) => setIngredientId(e.target.value)}
            style={selectStyle}
            required
          >
            <option value="">Select available ingredient...</option>
            {availableItems.map((item) => {
              const itemGpu = item.ingredient?.gramsPerUnit ? Number(item.ingredient.gramsPerUnit) : null
              return (
                <option key={item.id} value={item.ingredientId}>
                  {item.ingredient?.name} {itemGpu ? `(⚖️ ${itemGpu} g/unit)` : ''} — Stock: {Number(item.quantity).toFixed(2)} {item.ingredient?.unit} @ ₱{Number(item.price || item.unitCost || 0).toFixed(2)}
                </option>
              )
            })}
          </select>
          {availableItems.length === 0 && (
            <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 4 }}>
              No in-stock ingredients available for transfer from this branch.
            </div>
          )}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: isGramConverted ? '1fr' : '2fr 1fr', gap: 12 }}>
          <Input
            label={isGramConverted ? 'Transfer Quantity (Units / Orders) *' : `Transfer Quantity (${unit}) *`}
            type="number"
            step="any"
            min="0.001"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            placeholder={isGramConverted ? 'e.g. 10' : 'e.g. 500'}
            required
          />
          {!isGramConverted && (
            <div>
              <label style={lbl}>Unit</label>
              <input
                type="text"
                value={unit}
                disabled
                style={{ ...selectStyle, background: 'var(--brown-50)', color: 'var(--text-dark)', cursor: 'default' }}
              />
            </div>
          )}
        </div>

        {isGramConverted && (
          <div
            style={{
              background: isOverStock ? 'var(--red-light)' : '#fdf8f0',
              border: `1.5px solid ${isOverStock ? 'var(--red)' : '#f3d9b4'}`,
              borderRadius: 'var(--radius-md)',
              padding: '14px 16px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--brown-900)' }}>
                ⚖️ Automated Gram Conversion Details
              </span>
              <span style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>
                Conversion: <strong>{gpu.toLocaleString()} g/unit</strong>
              </span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, margin: '8px 0' }}>
              <div style={{ background: '#fff', padding: '8px', borderRadius: 6, border: '1px solid #ebd3ba', textAlign: 'center' }}>
                <div style={{ fontSize: 10.5, color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Grams per unit</div>
                <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--brown-900)', marginTop: 2 }}>{gpu.toLocaleString()} g</div>
              </div>
              <div style={{ background: '#fff', padding: '8px', borderRadius: 6, border: '1px solid #ebd3ba', textAlign: 'center' }}>
                <div style={{ fontSize: 10.5, color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Quantity entered</div>
                <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--brown-900)', marginTop: 2 }}>{enteredQty.toLocaleString()} units</div>
              </div>
              <div style={{ background: '#fff', padding: '8px', borderRadius: 6, border: `1.5px solid ${isOverStock ? 'var(--red)' : 'var(--brown-600)'}`, textAlign: 'center' }}>
                <div style={{ fontSize: 10.5, color: isOverStock ? 'var(--red)' : 'var(--brown-700)', textTransform: 'uppercase', fontWeight: 700 }}>Calculated weight</div>
                <div style={{ fontSize: 16, fontWeight: 800, color: isOverStock ? 'var(--red)' : 'var(--brown-900)', marginTop: 2 }}>
                  {calculatedGrams.toLocaleString()} g
                </div>
              </div>
            </div>

            {isOverStock ? (
              <div style={{ color: 'var(--red-dark)', fontSize: 12.5, fontWeight: 600, marginTop: 4 }}>
                ⚠️ Transfer exceeds available source stock ({availableStock.toLocaleString()} g available).
              </div>
            ) : enteredQty > 0 ? (
              <div style={{ color: 'var(--green-dark)', fontSize: 12, fontWeight: 600, marginTop: 4 }}>
                ✓ Source loses <strong>{calculatedGrams.toLocaleString()} g</strong>; Destination receives <strong>{calculatedGrams.toLocaleString()} g</strong>.
              </div>
            ) : (
              <div style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 4 }}>
                Enter transfer quantity in units to calculate total grams automatically.
              </div>
            )}
          </div>
        )}

        <Input
          label="Transfer Notes / Justification (Optional)"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="e.g. Emergency replenishment"
        />

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 10 }}>
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" disabled={loading || !destBranchId || !ingredientId || !quantity || isOverStock}>
            {loading ? 'Transferring...' : 'Confirm Transfer'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}

function DeleteInventoryModal({ item, branchFilterId, onClose, onDeleted }) {
  const [deps, setDeps] = useState(null)
  const [loadingDeps, setLoadingDeps] = useState(true)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState('')
  const scopedBranchId = branchFilterId || item.branchId

  useEffect(() => {
    let active = true
    setLoadingDeps(true)
    setError('')
    inventoryApi.dependencies(item.id, scopedBranchId)
      .then((res) => { if (active) setDeps(res.data) })
      .catch((e) => { if (active) setError(e.message) })
      .finally(() => { if (active) setLoadingDeps(false) })
    return () => { active = false }
  }, [item.id, scopedBranchId])

  async function confirmDelete() {
    setDeleting(true)
    setError('')
    try {
      await inventoryApi.remove(item.id, scopedBranchId)
      onDeleted(item)
    } catch (e) {
      setError(e.message)
    } finally {
      setDeleting(false)
    }
  }

  return (
    <Modal title="🗑️ Delete Branch Inventory Item" onClose={onClose} width={480}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <p style={{ fontSize: 14, color: 'var(--text-mid)', lineHeight: 1.5 }}>
          Remove <strong style={{ color: 'var(--brown-800)' }}>{item.ingredient?.name}</strong> from{' '}
          <strong style={{ color: 'var(--brown-800)' }}>{item.branch?.name}</strong>?
        </p>

        {loadingDeps ? (
          <div style={{ padding: 14, textAlign: 'center', color: 'var(--text-faint)', fontSize: 13 }}>
            Checking audit logs &amp; stock movement history…
          </div>
        ) : deps ? (
          deps.canDelete ? (
            <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 'var(--radius-md)', padding: '12px 14px', fontSize: 13, color: '#9a3412' }}>
              <strong>Safe to delete.</strong> No order-linked deductions, restocks, wastage, or transfers exist for this branch item.
              <div style={{ marginTop: 6, color: 'var(--text-mid)' }}>
                Shared ingredient, menu recipes ({deps.counts.recipeCount}), and other branches&apos; inventory will be preserved.
              </div>
            </div>
          ) : (
            <div style={{ background: 'var(--red-light)', border: '1px solid #fecaca', borderRadius: 'var(--radius-md)', padding: '12px 14px', fontSize: 13, color: 'var(--red-dark)' }}>
              <strong>Deletion blocked — historical audit records must be preserved:</strong>
              <ul style={{ margin: '8px 0 0 18px', padding: 0, lineHeight: 1.6 }}>
                {deps.blockers.map((b) => <li key={b}>{b}</li>)}
              </ul>
            </div>
          )
        ) : null}

        {error && <p style={{ color: 'var(--red)', fontSize: 13 }}>{error}</p>}

        <div style={{ display: 'flex', gap: 12, marginTop: 4 }}>
          <Button variant="outline" fullWidth onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            fullWidth
            disabled={loadingDeps || deleting || !deps?.canDelete}
            onClick={confirmDelete}
            style={{ background: deps?.canDelete ? 'var(--red)' : undefined, borderColor: deps?.canDelete ? 'var(--red)' : undefined }}
          >
            {deleting ? 'Deleting…' : 'Confirm Delete'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

export default function InventoryPage() {
  const { user } = useAuth()
  const isOwner = user?.role === 'OWNER'
  const isMobile = useIsMobile()
  const [searchParams] = useSearchParams()
  const highlightedItemId = searchParams.get('itemId') ? Number(searchParams.get('itemId')) : null

  const [loading, setLoading] = useState(true)
  const [branchId, setBranchId] = useState(() => (isOwner ? (searchParams.get('branchId') || '') : ''))
  const [branches, setBranches] = useState([])
  const [inventory, setInventory] = useState([])
  const [transfers, setTransfers] = useState([])
  const [cancellingTransferId, setCancellingTransferId] = useState(null)
  const [report, setReport] = useState(null)
  const [error, setError] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [showTransfer, setShowTransfer] = useState(false)
  // ADDED — currently-open edit modal's item, or null
  const [editItem, setEditItem] = useState(null)
  const [deleteItem, setDeleteItem] = useState(null)
  const [notice, setNotice] = useState(null)
  const [searchTerm, setSearchTerm] = useState('')

  useEffect(() => {
    dashboardApi.branches().then((d) => {
      const list = d.data || []
      setBranches(list)
      setBranchId((prev) => (prev && !list.some((b) => String(b.id) === String(prev)) ? '' : prev))
    })
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const params = {}
      if (branchId) params.branchId = branchId

      const [invRes, reportRes, trfRes] = await Promise.all([
        inventoryApi.list(params),
        reportsApi.usage({ ...params, period: 'weekly' }),
        inventoryApi.transfers(params),
      ])

      setInventory(invRes.data || [])
      setReport(reportRes.data || null)
      setTransfers(trfRes.data || [])
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [branchId])

  useEffect(() => { load() }, [load])

  async function handleCancelTransfer(transfer) {
    if (!window.confirm(`Cancel transfer ${transfer.transferNo} and return ${Number(transfer.quantity).toLocaleString()} ${transfer.unit} to ${transfer.sourceBranch?.name}?`)) {
      return
    }
    setCancellingTransferId(transfer.id)
    try {
      await inventoryApi.cancelTransfer(transfer.id)
      setNotice(`Transfer ${transfer.transferNo} cancelled. Inventory restored to ${transfer.sourceBranch?.name}.`)
      await load()
    } catch (err) {
      setError(err.message)
    } finally {
      setCancellingTransferId(null)
    }
  }

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

  // CHANGED — less horizontal padding on mobile
  return (
    <div style={{ width: '95%', maxWidth: 1800, margin: '0 auto', padding: isMobile ? '16px 12px' : 28 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24, flexWrap: 'wrap', gap: 14 }}>
        <div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 26, color: 'var(--brown-800)', marginBottom: 4 }}>Inventory Insights</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>
            {isOwner ? 'Cross-branch ingredient visibility and alerts' : `${user?.branch?.name} stock and usage`}
          </p>
        </div>

        {/* CHANGED — on mobile, branch select gets its own full-width row,
            with Add Ingredient / Refresh stacked below it as a separate
            row, instead of all three competing for space on one line */}
        <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: 10, alignItems: isMobile ? 'stretch' : 'center', width: isMobile ? '100%' : undefined, flexWrap: 'wrap' }}>
          {isOwner && (
            <select value={branchId} onChange={(e) => setBranchId(e.target.value)} style={{ padding: '9px 14px', border: '1.5px solid var(--border)', borderRadius: 'var(--radius-md)', background: '#fff', cursor: 'pointer', width: isMobile ? '100%' : undefined }}>
              <option value="">All Branches</option>
              {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          )}
          <div style={{ display: 'flex', gap: 10, width: isMobile ? '100%' : undefined }}>
            <Button variant="primary" size="sm" onClick={() => setShowAdd(true)} style={isMobile ? { flex: 1 } : undefined}>+ Add Ingredient</Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowTransfer(true)}
              style={{
                borderColor: 'var(--brown-600)',
                color: 'var(--brown-800)',
                fontWeight: 700,
                ...(isMobile ? { flex: 1 } : {}),
              }}
            >
              🔄 Transfer Stock
            </Button>
            <Button variant="outline" size="sm" onClick={load} style={isMobile ? { flex: 1 } : undefined}>Refresh</Button>
          </div>
        </div>
      </div>

      {error && <div style={{ background: 'var(--red-light)', color: 'var(--red-dark)', borderRadius: 'var(--radius-md)', padding: '12px 16px', marginBottom: 16 }}>{error}</div>}
      {notice && (
        <div style={{ background: 'var(--green-light)', color: 'var(--green-dark)', borderRadius: 'var(--radius-md)', padding: '12px 16px', marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontWeight: 600, fontSize: 13.5 }}>
          <span>{notice}</span>
          <button onClick={() => setNotice(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700, color: 'inherit' }}>✕</button>
        </div>
      )}

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
            <EmptyState icon="📦" title="No ingredients yet" subtitle="Add ingredients to start tracking stock" />
          ) : filteredInventory.length === 0 ? (
            <EmptyState icon="🔍" title="No matches" subtitle={`No ingredients match "${searchTerm}"`} />
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
                <thead>
                  <tr style={{ background: 'var(--brown-50)' }}>
                    {['Ingredient', 'Category', 'Qty', 'Threshold', 'Price', 'Branch', 'Status', 'Actions'].map((h) => (
                      <th key={h} style={{ padding: '9px 12px', textAlign: 'left', fontWeight: 700, color: 'var(--text-muted)', borderBottom: '1px solid var(--border)', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredInventory.map((item, idx) => {
                    const low = Number(item.quantity) <= Number(item.minThreshold)
                    const isHighlighted = highlightedItemId === item.id
                    return (
                      <tr
                        key={item.id}
                        style={{
                          borderBottom: idx < filteredInventory.length - 1 ? '1px solid var(--border-light)' : 'none',
                          background: isHighlighted ? '#fef3c7' : undefined,
                        }}
                      >
                        <td style={{ padding: '9px 12px', fontWeight: 600 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span>{item.ingredient?.name}</span>
                            {item.ingredient?.gramsPerUnit && (
                              <span
                                title={`Automated Gram Conversion: 1 unit/order = ${Number(item.ingredient.gramsPerUnit)} g`}
                                style={{
                                  fontSize: 10.5,
                                  fontWeight: 700,
                                  padding: '2px 7px',
                                  borderRadius: 'var(--radius-sm)',
                                  background: 'var(--brown-100)',
                                  color: 'var(--brown-800)',
                                  border: '1px solid var(--brown-300)',
                                  whiteSpace: 'nowrap',
                                }}
                              >
                                ⚖️ {Number(item.ingredient.gramsPerUnit)} g/unit
                              </span>
                            )}
                          </div>
                        </td>
                        <td style={{ padding: '9px 12px', color: 'var(--text-mid)' }}>{item.ingredient?.category}</td>
                        <td style={{ padding: '9px 12px' }}>{Number(item.quantity).toFixed(3)} {item.ingredient?.unit}</td>
                        <td style={{ padding: '9px 12px' }}>{Number(item.minThreshold).toFixed(3)} {item.ingredient?.unit}</td>
                        <td style={{ padding: '9px 12px' }}>{item.price ? `₱${Number(item.price).toFixed(2)}` : '-'}</td>
                        <td style={{ padding: '9px 12px', color: 'var(--text-mid)' }}>{item.branch?.name}</td>
                        <td style={{ padding: '9px 12px' }}>
                          <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 10px', borderRadius: 'var(--radius-full)', background: low ? 'var(--red-light)' : 'var(--green-light)', color: low ? 'var(--red-dark)' : 'var(--green-dark)' }}>
                            {low ? 'LOW' : 'OK'}
                          </span>
                        </td>
                        {/* ADDED — Edit button, opens EditIngredientModal pre-filled with this row */}
                        <td style={{ padding: '9px 12px', display: 'flex', gap: 6 }}>
                          <button
                            onClick={() => setEditItem(item)}
                            style={{ padding: '6px 12px', border: '1.5px solid var(--brown-300)', borderRadius: 'var(--radius-sm)', background: '#fff', fontSize: 11.5, fontWeight: 700, cursor: 'pointer', color: 'var(--brown-700)', whiteSpace: 'nowrap' }}
                          >
                            ✏️ Edit
                          </button>
                          {isOwner && (
                            <button
                              onClick={() => setDeleteItem(item)}
                              style={{ padding: '6px 10px', border: '1.5px solid var(--red-light)', borderRadius: 'var(--radius-sm)', background: '#fff', fontSize: 11.5, fontWeight: 700, cursor: 'pointer', color: 'var(--red)', whiteSpace: 'nowrap' }}
                              title="Delete branch inventory item"
                            >
                              🗑️ Delete
                            </button>
                          )}
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

      <div style={{ marginTop: 18 }}>
        <Section
          title="Inter-Branch Stock Transfer History"
          right={
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              {transfers.length} transfer{transfers.length === 1 ? '' : 's'} recorded
            </div>
          }
        >
          {transfers.length === 0 ? (
            <EmptyState icon="🔄" title="No transfers yet" subtitle="Completed and cancelled branch transfers will appear here with automated gram conversion audit records" />
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: 'var(--brown-50)' }}>
                    {['Reference', 'Date & Time', 'Source', 'Destination', 'Ingredient', 'Transferred Amount', 'Cost', 'Status', 'Operator', 'Action'].map((h) => (
                      <th key={h} style={{ padding: '9px 12px', textAlign: 'left', fontWeight: 700, color: 'var(--text-muted)', borderBottom: '1px solid var(--border)', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {transfers.map((trf, idx) => {
                    const hasConv = trf.conversionFactor != null
                    const isCompleted = trf.status === 'COMPLETED'
                    return (
                      <tr key={trf.id} style={{ borderBottom: idx < transfers.length - 1 ? '1px solid var(--border-light)' : 'none' }}>
                        <td style={{ padding: '9px 12px', fontFamily: 'monospace', fontWeight: 600, fontSize: 12 }}>{trf.transferNo}</td>
                        <td style={{ padding: '9px 12px', color: 'var(--text-muted)', fontSize: 12 }}>{new Date(trf.createdAt).toLocaleString()}</td>
                        <td style={{ padding: '9px 12px', fontWeight: 600 }}>{trf.sourceBranch?.name}</td>
                        <td style={{ padding: '9px 12px', fontWeight: 600 }}>{trf.destBranch?.name}</td>
                        <td style={{ padding: '9px 12px', fontWeight: 600 }}>
                          {trf.ingredient?.name}
                          {hasConv && (
                            <span style={{ marginLeft: 6, fontSize: 10, padding: '1px 5px', borderRadius: 4, background: 'var(--brown-100)', color: 'var(--brown-700)' }}>
                              ⚖️ {Number(trf.conversionFactor)} g/unit
                            </span>
                          )}
                        </td>
                        <td style={{ padding: '9px 12px' }}>
                          {hasConv ? (
                            <div>
                              <strong>{Number(trf.inputQuantity || 0).toLocaleString()} {trf.inputUnit || 'units'}</strong>
                              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                                = {Number(trf.quantity).toLocaleString()} {trf.unit} ({Number(trf.conversionFactor)} g/unit)
                              </div>
                            </div>
                          ) : (
                            <span><strong>{Number(trf.quantity).toLocaleString()}</strong> {trf.unit}</span>
                          )}
                        </td>
                        <td style={{ padding: '9px 12px' }}>{trf.totalCost ? `₱${Number(trf.totalCost).toFixed(2)}` : '-'}</td>
                        <td style={{ padding: '9px 12px' }}>
                          <span style={{
                            fontSize: 11,
                            fontWeight: 700,
                            padding: '2px 8px',
                            borderRadius: 'var(--radius-full)',
                            background: isCompleted ? 'var(--green-light)' : 'var(--red-light)',
                            color: isCompleted ? 'var(--green-dark)' : 'var(--red-dark)',
                          }}>
                            {trf.status}
                          </span>
                        </td>
                        <td style={{ padding: '9px 12px', color: 'var(--text-muted)', fontSize: 12 }}>{trf.actor?.name || 'Authorized User'}</td>
                        <td style={{ padding: '9px 12px' }}>
                          {isCompleted && (isOwner || user?.branchId === trf.sourceBranchId) && (
                            <button
                              onClick={() => handleCancelTransfer(trf)}
                              disabled={cancellingTransferId === trf.id}
                              style={{
                                padding: '4px 8px',
                                border: '1px solid var(--red-light)',
                                borderRadius: 'var(--radius-sm)',
                                background: '#fff',
                                fontSize: 11,
                                fontWeight: 600,
                                cursor: 'pointer',
                                color: 'var(--red)',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {cancellingTransferId === trf.id ? 'Reversing…' : '↩️ Cancel'}
                            </button>
                          )}
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

      {showAdd && (
        <AddIngredientModal
          isOwner={isOwner}
          branches={branches}
          branchId={branchId}
          onClose={() => setShowAdd(false)}
          onSaved={onSavedIngredient}
        />
      )}

      {/* ADDED — edit modal, opened via the ✏️ button on each ingredients-table row */}
      {editItem && (
        <EditIngredientModal
          item={editItem}
          onClose={() => setEditItem(null)}
          onSaved={async () => { setEditItem(null); await onSavedIngredient() }}
        />
      )}

      {showTransfer && (
        <TransferStockModal
          isOwner={isOwner}
          branches={branches}
          userBranchId={getUserBranchId(user)}
          inventory={inventory}
          onClose={() => setShowTransfer(false)}
          onSaved={async () => { setShowTransfer(false); await load() }}
        />
      )}

      {deleteItem && (
        <DeleteInventoryModal
          item={deleteItem}
          branchFilterId={branchId}
          onClose={() => setDeleteItem(null)}
          onDeleted={async (removed) => {
            setDeleteItem(null)
            setNotice(`Removed "${removed.ingredient?.name}" from ${removed.branch?.name}.`)
            await load()
          }}
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