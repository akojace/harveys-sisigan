// src/pages/MenuPage.jsx
import { useState, useEffect, useRef, useCallback } from 'react'
import { menuApi, inventoryApi, branchesApi } from '../api/client'
import { Button, Input, Modal, Badge, EmptyState, Card } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { useIsMobile } from '../hooks/useIsMobile'
import { getUserBranchId, resolveBranchId } from '../utils/branch'

function AddItemModal({ categories, onClose, onSaved }) {
  const [form,    setForm]    = useState({ name: '', price: '', description: '', categoryId: categories[0]?.id || '' })
  const [photo,   setPhoto]   = useState(null)
  const [preview, setPreview] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState('')
  const fileRef = useRef()

  function set(k, v) { setForm(f => ({ ...f, [k]: v })) }

  function handleFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setPreview(URL.createObjectURL(file))
    const reader = new FileReader()
    reader.onload = () => setPhoto(reader.result.split(',')[1])
    reader.readAsDataURL(file)
  }

  function removePhoto() {
    setPhoto(null); setPreview(null)
    if (fileRef.current) fileRef.current.value = ''
  }

  async function save() {
    if (!form.name || !form.price) { setError('Name and price are required.'); return }
    setLoading(true); setError('')
    try {
      await menuApi.create({ ...form, price: Number(form.price), categoryId: Number(form.categoryId), ...(photo && { photo }) })
      onSaved()
    } catch (e) { setError(e.message) }
    finally     { setLoading(false) }
  }

  return (
    <Modal title="Add Menu Item" onClose={onClose} width={420}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Input label="Item Name" value={form.name} onChange={e => set('name', e.target.value)} placeholder="e.g. Spicy Sisig" />
        <Input label="Price (₱)" type="number" value={form.price} onChange={e => set('price', e.target.value)} placeholder="0.00" />

        <div>
          <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 7 }}>Category</label>
          <select value={form.categoryId} onChange={e => set('categoryId', e.target.value)}
            style={{ width: '100%', padding: '12px 14px', border: '1.5px solid var(--border)', borderRadius: 'var(--radius-md)', fontSize: 14.5, background: '#fff', outline: 'none', cursor: 'pointer' }}>
            {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>

        <div>
          <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 7 }}>Description (optional)</label>
          <textarea value={form.description} onChange={e => set('description', e.target.value)}
            placeholder="Short description…" rows={3}
            style={{ width: '100%', padding: '12px 14px', border: '1.5px solid var(--border)', borderRadius: 'var(--radius-md)', fontSize: 14.5, background: '#fff', outline: 'none', resize: 'vertical', fontFamily: 'var(--font-body)' }}
          />
        </div>

        <div>
          <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 7 }}>Photo (optional)</label>
          {preview ? (
            <div style={{ position: 'relative', width: '100%', height: 170, borderRadius: 'var(--radius-md)', overflow: 'hidden', border: '1.5px solid var(--border)' }}>
              <img src={preview} alt="preview" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
              <button onClick={removePhoto} style={{ position: 'absolute', top: 8, right: 8, background: 'rgba(0,0,0,0.55)', color: '#fff', border: 'none', borderRadius: '50%', width: 30, height: 30, cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
            </div>
          ) : (
            <div onClick={() => fileRef.current?.click()} style={{ width: '100%', height: 108, border: '2px dashed var(--border)', borderRadius: 'var(--radius-md)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', gap: 7, background: 'var(--brown-50)' }}
              onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--brown-400)'}
              onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}>
              <span style={{ fontSize: 26 }}>📷</span>
              <span style={{ fontSize: 12.5, color: 'var(--text-muted)', fontWeight: 600 }}>Click to upload photo</span>
            </div>
          )}
          <input ref={fileRef} type="file" accept="image/*" onChange={handleFile} style={{ display: 'none' }} />
        </div>

        {error && <p style={{ color: 'var(--red)', fontSize: 13 }}>{error}</p>}
        <div style={{ display: 'flex', gap: 12 }}>
          <Button variant="outline" fullWidth onClick={onClose}>Cancel</Button>
          <Button variant="primary" fullWidth disabled={loading} onClick={save}>{loading ? 'Saving…' : 'Add Item'}</Button>
        </div>
      </div>
    </Modal>
  )
}

function EditItemModal({ item, categories, role, onClose, onSaved }) {
  const isManager = role === 'MANAGER'
  const isOwner   = role === 'OWNER'
  const canManageMenu = isOwner || isManager

  const [form,    setForm]    = useState({
    name:        item.name        || '',
    price:       item.price       || '',
    description: item.description || '',
    categoryId:  item.categoryId  || categories[0]?.id || '',
    remarks:     item.remarks     || '',
  })
  const [photo,   setPhoto]   = useState(null)   // new photo base64
  const [preview, setPreview] = useState(null)   // new photo preview URL
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState('')
  const fileRef = useRef()

  function set(k, v) { setForm(f => ({ ...f, [k]: v })) }

  function handleFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setPreview(URL.createObjectURL(file))
    const reader = new FileReader()
    reader.onload = () => setPhoto(reader.result.split(',')[1])
    reader.readAsDataURL(file)
  }

  function removePhoto() {
    setPhoto(null); setPreview(null)
    if (fileRef.current) fileRef.current.value = ''
  }

  async function save() {
    if (!form.name || !form.price) { setError('Name and price are required.'); return }
    setLoading(true); setError('')
    try {
      const payload = {
        name:        form.name,
        price:       Number(form.price),
        description: form.description,
        categoryId:  Number(form.categoryId),
        ...(isOwner && { remarks: form.remarks }),
        ...(photo   && { photo }),
      }
      await menuApi.update(item.id, payload)
      onSaved()
    } catch (e) { setError(e.message) }
    finally     { setLoading(false) }
  }

  // Current photo to show (existing item photo or new preview)
  const displayPhoto = preview || (item.photo ? item.photo : null)

  return (
    <Modal title="Edit Menu Item" onClose={onClose} width={420}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* Fields only OWNER/MANAGER can edit */}
        <Input label="Item Name" value={form.name} onChange={e => set('name', e.target.value)} disabled={!canManageMenu} />
        <Input label="Price (₱)" type="number" value={form.price} onChange={e => set('price', e.target.value)} disabled={!canManageMenu} />

        <div>
          <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 7 }}>Category</label>
          <select value={form.categoryId} onChange={e => set('categoryId', e.target.value)} disabled={!canManageMenu}
            style={{ width: '100%', padding: '12px 14px', border: '1.5px solid var(--border)', borderRadius: 'var(--radius-md)', fontSize: 14.5, background: canManageMenu ? '#fff' : 'var(--brown-50)', outline: 'none', color: 'var(--text-dark)', opacity: canManageMenu ? 1 : 0.6, cursor: canManageMenu ? 'pointer' : 'not-allowed' }}>
            {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>

        <div>
          <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 7 }}>Description</label>
          <textarea value={form.description} onChange={e => set('description', e.target.value)}
            disabled={!canManageMenu} rows={3} placeholder="Short description…"
            style={{ width: '100%', padding: '12px 14px', border: '1.5px solid var(--border)', borderRadius: 'var(--radius-md)', fontSize: 14.5, background: canManageMenu ? '#fff' : 'var(--brown-50)', outline: 'none', resize: 'vertical', fontFamily: 'var(--font-body)', opacity: canManageMenu ? 1 : 0.6 }}
          />
        </div>

        {/* Photo — owner/manager only */}
        {canManageMenu && (
          <div>
            <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 7 }}>Photo</label>
            {displayPhoto ? (
              <div style={{ position: 'relative', width: '100%', height: 170, borderRadius: 'var(--radius-md)', overflow: 'hidden', border: '1.5px solid var(--border)' }}>
                <img src={displayPhoto} alt="preview" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                <button onClick={removePhoto} style={{ position: 'absolute', top: 8, right: 8, background: 'rgba(0,0,0,0.55)', color: '#fff', border: 'none', borderRadius: '50%', width: 30, height: 30, cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
                <button onClick={() => fileRef.current?.click()} style={{ position: 'absolute', bottom: 8, right: 8, background: 'rgba(0,0,0,0.55)', color: '#fff', border: 'none', borderRadius: 'var(--radius-sm)', padding: '5px 12px', cursor: 'pointer', fontSize: 11.5, fontWeight: 700 }}>Change</button>
              </div>
            ) : (
              <div onClick={() => fileRef.current?.click()} style={{ width: '100%', height: 108, border: '2px dashed var(--border)', borderRadius: 'var(--radius-md)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', gap: 7, background: 'var(--brown-50)' }}
                onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--brown-400)'}
                onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}>
                <span style={{ fontSize: 26 }}>📷</span>
                <span style={{ fontSize: 12.5, color: 'var(--text-muted)', fontWeight: 600 }}>Click to upload photo</span>
              </div>
            )}
            <input ref={fileRef} type="file" accept="image/*" onChange={handleFile} style={{ display: 'none' }} />
          </div>
        )}

        {error && <p style={{ color: 'var(--red)', fontSize: 13 }}>{error}</p>}
        <div style={{ display: 'flex', gap: 12 }}>
          <Button variant="outline" fullWidth onClick={onClose}>Cancel</Button>
          <Button variant="primary" fullWidth disabled={loading} onClick={save}>{loading ? 'Saving…' : 'Save Changes'}</Button>
        </div>
      </div>
    </Modal>
  )
}

// ── Recipe Manager Modal ─────────────────────────────────────────────
function RecipeManagerModal({ item, onClose }) {
  const [recipe, setRecipe] = useState([])
  const [costMetrics, setCostMetrics] = useState(null)
  const [ingredients, setIngredients] = useState([])
  const [selectedIngId, setSelectedIngId] = useState('')
  const [quantity, setQuantity] = useState('')
  const [selectedUnit, setSelectedUnit] = useState('GRAM')
  const [yieldFactor, setYieldFactor] = useState('1.0')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [removing, setRemoving] = useState(null)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const loadRecipeData = useCallback(async () => {
    setLoading(true)
    try {
      const [recipeRes, invRes] = await Promise.all([
        menuApi.getRecipe(item.id),
        inventoryApi.list(),
      ])
      const data = recipeRes.data || []
      setRecipe(Array.isArray(data) ? data : data.recipe || [])
      setCostMetrics(data.costMetrics || null)

      // Deduplicate ingredients by name (across branches)
      const seen = new Map()
      for (const inv of (invRes.data || [])) {
        if (!seen.has(inv.ingredient.id)) seen.set(inv.ingredient.id, inv.ingredient)
      }
      const ingList = [...seen.values()]
      setIngredients(ingList)
      if (ingList.length > 0 && !selectedIngId) {
        setSelectedIngId(String(ingList[0].id))
        setSelectedUnit(ingList[0].unit)
      }
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [item.id, selectedIngId])

  useEffect(() => {
    loadRecipeData()
  }, [loadRecipeData])

  function handleIngredientChange(e) {
    const id = e.target.value
    setSelectedIngId(id)
    const found = ingredients.find(i => String(i.id) === String(id))
    if (found) setSelectedUnit(found.unit)
  }

  async function addIngredient() {
    if (!selectedIngId || !quantity || Number(quantity) <= 0) {
      setError('Select an ingredient and enter a valid quantity > 0.')
      return
    }
    setSaving(true); setError(''); setSuccess('')
    try {
      await menuApi.addRecipeIngredient(item.id, {
        ingredientId: Number(selectedIngId),
        quantity: Number(quantity),
        unit: selectedUnit,
        yieldFactor: Number(yieldFactor) || 1.0,
      })
      setQuantity('')
      setSuccess('Ingredient added to recipe!')
      setTimeout(() => setSuccess(''), 2500)
      await loadRecipeData()
    } catch (e) { setError(e.message) }
    finally { setSaving(false) }
  }

  async function removeIngredient(ingredientId) {
    setRemoving(ingredientId); setError(''); setSuccess('')
    try {
      await menuApi.removeRecipeIngredient(item.id, ingredientId)
      setSuccess('Ingredient removed from recipe!')
      setTimeout(() => setSuccess(''), 2500)
      await loadRecipeData()
    } catch (e) { setError(e.message) }
    finally { setRemoving(null) }
  }

  const selectStyle = {
    width: '100%', padding: '10px 12px', border: '1.5px solid var(--border)',
    borderRadius: 'var(--radius-md)', fontSize: 13, background: '#fff', outline: 'none', cursor: 'pointer',
  }

  const sellingPrice = Number(item.price) || 0
  const totalCost = Number(costMetrics?.totalCost || 0)
  const grossProfit = Number(costMetrics?.grossProfit || (sellingPrice - totalCost))
  const margin = Number(costMetrics?.grossProfitMargin || (sellingPrice > 0 ? (grossProfit / sellingPrice) * 100 : 0))

  return (
    <Modal title={`Recipe & Costing: ${item.name}`} onClose={onClose} width={620}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {error && (
          <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 10, padding: '10px 14px', fontSize: 13, color: '#dc2626' }}>
            ⚠️ {error}
          </div>
        )}
        {success && (
          <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 10, padding: '10px 14px', fontSize: 13, color: '#16a34a' }}>
            ✅ {success}
          </div>
        )}

        {/* Financial KPI Banner */}
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10,
          background: 'var(--brown-50)', border: '1.5px solid var(--border)',
          borderRadius: 'var(--radius-md)', padding: '12px 14px', textAlign: 'center',
        }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Selling Price</div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 700, color: 'var(--brown-800)', marginTop: 4 }}>
              ₱{sellingPrice.toFixed(2)}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Ingredient Cost</div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 700, color: costMetrics?.costKnown ? '#b45309' : '#dc2626', marginTop: 4 }}>
              ₱{totalCost.toFixed(2)}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Gross Profit</div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 700, color: 'var(--green-dark)', marginTop: 4 }}>
              ₱{grossProfit.toFixed(2)}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Margin</div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 700, color: margin >= 50 ? 'var(--green-dark)' : '#b45309', marginTop: 4 }}>
              {margin.toFixed(1)}%
            </div>
          </div>
        </div>

        {/* Add ingredient form */}
        <div style={{ background: '#fff', borderRadius: 'var(--radius-md)', padding: 14, border: '1.5px solid var(--border)' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>
            Add / Update Recipe Line
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr auto', gap: 8, alignItems: 'flex-end' }}>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Ingredient</label>
              <select value={selectedIngId} onChange={handleIngredientChange} style={selectStyle}>
                {ingredients.map(ing => (
                  <option key={ing.id} value={ing.id}>{ing.name} ({ing.unit})</option>
                ))}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Qty / Serving</label>
              <input
                type="number" min="0.001" step="any" value={quantity}
                onChange={e => setQuantity(e.target.value)}
                placeholder="e.g. 100"
                style={{ ...selectStyle, textAlign: 'center', cursor: 'text' }}
              />
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Unit</label>
              <select value={selectedUnit} onChange={e => setSelectedUnit(e.target.value)} style={selectStyle}>
                {['GRAM', 'KG', 'ML', 'LITER', 'PCS', 'PACK', 'BAG', 'TUB'].map(u => (
                  <option key={u} value={u}>{u}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Yield Factor</label>
              <input
                type="number" min="0.1" max="1.0" step="0.05" value={yieldFactor}
                onChange={e => setYieldFactor(e.target.value)}
                placeholder="1.0"
                style={{ ...selectStyle, textAlign: 'center', cursor: 'text' }}
              />
            </div>
            <Button variant="primary" onClick={addIngredient} disabled={saving || loading}>
              {saving ? '…' : '+ Add'}
            </Button>
          </div>
        </div>

        {/* Current recipe table */}
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
            Current Recipe Lines {recipe.length > 0 && `(${recipe.length} ingredients)`}
          </div>
          {loading ? (
            <div style={{ textAlign: 'center', padding: 20, color: 'var(--text-muted)', fontSize: 13.5 }}>Loading recipe…</div>
          ) : recipe.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '24px', background: 'var(--brown-50)', border: '1.5px dashed var(--border)', borderRadius: 'var(--radius-md)', color: 'var(--text-faint)', fontSize: 13.5 }}>
              No recipe configured. Add ingredients above to establish accurate product costs and stock deductions.
            </div>
          ) : (
            <div style={{ border: '1.5px solid var(--border)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 70px', padding: '8px 12px', background: 'var(--brown-50)', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                <span>Ingredient</span>
                <span style={{ textAlign: 'right' }}>Qty / Serving</span>
                <span style={{ textAlign: 'right' }}>Unit Cost</span>
                <span style={{ textAlign: 'right' }}>Line Cost</span>
                <span></span>
              </div>
              {recipe.map((r, i) => {
                const ingName = r.ingredientName || r.ingredient?.name || 'Unknown'
                const rUnit = r.unit || r.ingredient?.unit || ''
                const unitCost = Number(r.unitCost || 0)
                const lineCost = Number(r.lineCost || 0)
                return (
                  <div key={r.ingredientId} style={{
                    display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 70px',
                    padding: '10px 12px', alignItems: 'center',
                    borderTop: i > 0 ? '1px solid var(--border-light)' : 'none',
                    background: '#fff', fontSize: 13,
                  }}>
                    <div>
                      <div style={{ fontWeight: 600, color: 'var(--text-dark)' }}>{ingName}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                        {r.yieldFactor && Number(r.yieldFactor) < 1 ? `Yield factor: ${(Number(r.yieldFactor) * 100).toFixed(0)}%` : '100% usable'}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right', fontWeight: 600, color: 'var(--brown-700)' }}>
                      {Number(r.quantity).toFixed(2)} {rUnit}
                    </div>
                    <div style={{ textAlign: 'right', color: 'var(--text-mid)' }}>
                      ₱{unitCost.toFixed(4)}
                    </div>
                    <div style={{ textAlign: 'right', fontWeight: 700, color: 'var(--brown-800)' }}>
                      ₱{lineCost.toFixed(2)}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                      <button
                        onClick={() => removeIngredient(r.ingredientId)}
                        disabled={removing === r.ingredientId}
                        style={{ padding: '3px 8px', fontSize: 11, fontWeight: 700, border: '1px solid #fca5a5', borderRadius: 'var(--radius-sm)', background: '#fef2f2', color: '#dc2626', cursor: 'pointer' }}
                      >
                        {removing === r.ingredientId ? '…' : '✕'}
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <div style={{ fontSize: 11.5, color: 'var(--text-faint)', lineHeight: 1.6 }}>
          💡 When a sale is completed at POS, the exact quantities above are deducted from branch inventory and the snapshot ingredient cost is preserved as COGS.
        </div>
      </div>
    </Modal>
  )
}

// ── Availability Breakdown Modal (Single Branch or Admin Multi-Branch) ─────────
function AvailabilityBreakdownModal({ item, branches, branchId, isOwner, onClose }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [activeBranchId, setActiveBranchId] = useState(branchId || (branches[0]?.id ? String(branches[0].id) : ''))

  useEffect(() => {
    setLoading(true)
    menuApi.availability(item.id)
      .then(res => {
        setData(res.data)
        if (res.data?.branches?.length && !activeBranchId) {
          setActiveBranchId(String(res.data.branches[0].branchId))
        }
      })
      .catch(err => alert(err.message))
      .finally(() => setLoading(false))
  }, [item.id])

  const currentBranch = (() => {
    if (!data) return null
    if (data.isComparison && data.branches) {
      return data.branches.find(b => String(b.branchId) === String(activeBranchId)) || data.branches[0]
    }
    return data.branch
  })()

  return (
    <Modal title={`🔍 Stock Breakdown — ${item.name}`} onClose={onClose} width={760}>
      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
          Calculating ingredient requirements and branch stock…
        </div>
      ) : !data ? (
        <EmptyState icon="⚠️" title="Could not load availability data" />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Header metadata */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
            <div>
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                {data.category} · ₱{Number(data.price).toFixed(2)}
              </span>
            </div>
            {!data.isGloballyAvailable && (
              <span style={{ background: '#fee2e2', color: '#991b1b', fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 'var(--radius-full)' }}>
                Globally Disabled
              </span>
            )}
          </div>

          {/* Branch selector tabs if Owner viewing multi-branch comparison */}
          {data.isComparison && data.branches?.length > 1 && (
            <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4 }}>
              {data.branches.map(b => (
                <button
                  key={b.branchId}
                  onClick={() => setActiveBranchId(String(b.branchId))}
                  style={{
                    padding: '8px 16px',
                    borderRadius: 'var(--radius-full)',
                    border: '1.5px solid var(--border)',
                    background: String(b.branchId) === String(activeBranchId) ? 'var(--gradient-primary)' : 'var(--cream)',
                    color: String(b.branchId) === String(activeBranchId) ? '#fff' : 'var(--brown-800)',
                    fontWeight: 700,
                    fontSize: 12.5,
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  <span>📍 {b.branchName}</span>
                  <span style={{
                    fontSize: 11,
                    padding: '2px 6px',
                    borderRadius: 'var(--radius-full)',
                    background: String(b.branchId) === String(activeBranchId) ? 'rgba(255,255,255,0.25)' : 'var(--brown-100)',
                  }}>
                    {b.availableServings} servings
                  </span>
                </button>
              ))}
            </div>
          )}

          {currentBranch && (
            <>
              {/* Summary Highlight Cards */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
                <div style={{
                  background: currentBranch.availableServings > 10 ? '#f0fdf4' : currentBranch.availableServings > 0 ? '#fffbeb' : '#fef2f2',
                  border: `1.5px solid ${currentBranch.availableServings > 10 ? '#bbf7d0' : currentBranch.availableServings > 0 ? '#fde68a' : '#fca5a5'}`,
                  borderRadius: 'var(--radius-md)',
                  padding: '16px 18px',
                }}>
                  <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    Available Stock ({currentBranch.branchName})
                  </div>
                  <div style={{
                    fontSize: 28,
                    fontWeight: 800,
                    color: currentBranch.availableServings > 10 ? '#15803d' : currentBranch.availableServings > 0 ? '#b45309' : '#dc2626',
                    marginTop: 4,
                  }}>
                    {currentBranch.availableServings} {currentBranch.availableServings === 1 ? 'serving' : 'servings'}
                  </div>
                  <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 4 }}>
                    Formula: MIN(FLOOR(Stock / Recipe Requirement))
                  </div>
                </div>

                <div style={{
                  background: '#fff',
                  border: '1.5px solid var(--border)',
                  borderRadius: 'var(--radius-md)',
                  padding: '16px 18px',
                }}>
                  <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    Limiting Ingredient
                  </div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--brown-800)', marginTop: 6 }}>
                    {currentBranch.limitingIngredient ? (
                      <>
                        🎯 {currentBranch.limitingIngredient.name}
                      </>
                    ) : (
                      '—'
                    )}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                    {currentBranch.limitingIngredient ? (
                      `Stock: ${currentBranch.limitingIngredient.currentStock} ${currentBranch.limitingIngredient.unit} · Needs: ${currentBranch.limitingIngredient.required} ${currentBranch.limitingIngredient.unit}/serving`
                    ) : currentBranch.hasRecipe ? (
                      'All ingredients sufficient'
                    ) : (
                      'No recipe configured'
                    )}
                  </div>
                </div>
              </div>

              {/* Ingredient Breakdown Table */}
              <div style={{ background: '#fff', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: 'var(--brown-50)' }}>
                      <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 700, color: 'var(--brown-800)' }}>Required Ingredient</th>
                      <th style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700, color: 'var(--brown-800)' }}>Branch Stock</th>
                      <th style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700, color: 'var(--brown-800)' }}>Per Serving</th>
                      <th style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 700, color: 'var(--brown-800)' }}>Possible Servings</th>
                      <th style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 700, color: 'var(--brown-800)' }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {currentBranch.ingredients?.length ? (
                      currentBranch.ingredients.map(ing => (
                        <tr
                          key={ing.ingredientId}
                          style={{
                            borderBottom: '1px solid var(--border-light)',
                            background: ing.isLimiting ? '#fffbeb' : undefined,
                          }}
                        >
                          <td style={{ padding: '10px 14px', fontWeight: 600, color: 'var(--text-dark)' }}>
                            {ing.name}
                            {ing.isLimiting && (
                              <span style={{
                                marginLeft: 8,
                                background: '#fef3c7',
                                color: '#92400e',
                                fontSize: 10,
                                fontWeight: 800,
                                padding: '2px 6px',
                                borderRadius: 4,
                                textTransform: 'uppercase',
                              }}>
                                🎯 Limiting
                              </span>
                            )}
                          </td>
                          <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700, color: ing.currentStock <= 0 ? '#dc2626' : 'var(--brown-800)' }}>
                            {ing.currentStock} {ing.unit}
                          </td>
                          <td style={{ padding: '10px 14px', textAlign: 'right', color: 'var(--text-muted)' }}>
                            {ing.requiredPerServing} {ing.unit}
                            {ing.yieldFactor < 1 && <span style={{ fontSize: 11, opacity: 0.75 }}> ({(ing.yieldFactor * 100).toFixed(0)}% yield)</span>}
                          </td>
                          <td style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 800, color: ing.possibleServings <= 0 ? '#dc2626' : 'var(--brown-700)' }}>
                            {ing.possibleServings}
                          </td>
                          <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                            <span style={{
                              fontSize: 11,
                              fontWeight: 700,
                              padding: '2px 8px',
                              borderRadius: 4,
                              background: ing.status === 'OK' ? '#f0fdf4' : ing.status === 'LOW_STOCK' ? '#fffbeb' : '#fee2e2',
                              color: ing.status === 'OK' ? '#166534' : ing.status === 'LOW_STOCK' ? '#92400e' : '#991b1b',
                            }}>
                              {ing.status === 'OK' ? 'OK' : ing.status === 'LOW_STOCK' ? 'Low Stock' : 'Out of Stock'}
                            </span>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={5} style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)' }}>
                          No recipe configured. Configure recipe ingredients under Menu &gt; Recipe.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
            <Button variant="outline" onClick={onClose}>Close</Button>
          </div>
        </div>
      )}
    </Modal>
  )
}

// ── Multi-Branch Availability Matrix Modal ─────────────────────────────────────
function AvailabilityMatrixModal({ onClose }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    menuApi.matrix()
      .then(res => setData(res.data))
      .catch(err => alert(err.message))
      .finally(() => setLoading(false))
  }, [])

  return (
    <Modal title="📊 Multi-Branch Product Availability Matrix" onClose={onClose} width={960}>
      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
          Computing sellable stock across all authorized branches…
        </div>
      ) : !data ? (
        <EmptyState icon="⚠️" title="Could not load availability matrix" />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>
            Live side-by-side comparison of calculated sellable servings and limiting ingredients for all products across branches.
          </p>

          <div style={{ overflowX: 'auto', background: '#fff', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: 'var(--brown-50)' }}>
                  <th style={{ padding: '11px 14px', textAlign: 'left', fontWeight: 700, color: 'var(--brown-800)' }}>Menu Item</th>
                  <th style={{ padding: '11px 14px', textAlign: 'left', fontWeight: 700, color: 'var(--brown-800)' }}>Category</th>
                  <th style={{ padding: '11px 14px', textAlign: 'right', fontWeight: 700, color: 'var(--brown-800)' }}>Price</th>
                  {data.branches?.map(b => (
                    <th key={b.id} style={{ padding: '11px 14px', textAlign: 'center', fontWeight: 800, color: 'var(--brown-900)' }}>
                      📍 {b.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.matrix?.map(item => (
                  <tr key={item.id} style={{ borderBottom: '1px solid var(--border-light)' }}>
                    <td style={{ padding: '11px 14px', fontWeight: 700, color: 'var(--text-dark)' }}>
                      {item.name}
                    </td>
                    <td style={{ padding: '11px 14px', color: 'var(--text-muted)', fontSize: 12 }}>
                      {item.category}
                    </td>
                    <td style={{ padding: '11px 14px', textAlign: 'right', fontWeight: 700, color: 'var(--brown-700)' }}>
                      ₱{Number(item.price).toFixed(2)}
                    </td>
                    {data.branches?.map(b => {
                      const branchInfo = item.branchAvailability?.[b.id]
                      const servings = branchInfo?.availableServings ?? 0
                      const limiting = branchInfo?.limitingIngredient?.name

                      return (
                        <td key={b.id} style={{ padding: '11px 14px', textAlign: 'center' }}>
                          <span style={{
                            display: 'inline-block',
                            padding: '3px 10px',
                            borderRadius: 'var(--radius-full)',
                            fontSize: 12,
                            fontWeight: 800,
                            background: servings > 10 ? '#f0fdf4' : servings > 0 ? '#fffbeb' : '#fee2e2',
                            color: servings > 10 ? '#15803d' : servings > 0 ? '#b45309' : '#dc2626',
                            border: `1px solid ${servings > 10 ? '#bbf7d0' : servings > 0 ? '#fde68a' : '#fca5a5'}`,
                          }}>
                            {servings} servings
                          </span>
                          {limiting && servings > 0 && (
                            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 3 }}>
                              Limiting: {limiting}
                            </div>
                          )}
                          {!branchInfo?.hasRecipe && (
                            <div style={{ fontSize: 10, color: '#b45309', marginTop: 3, fontWeight: 600 }}>
                              No recipe
                            </div>
                          )}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
            <Button variant="outline" onClick={onClose}>Close</Button>
          </div>
        </div>
      )}
    </Modal>
  )
}

export default function MenuPage() {
  const { user } = useAuth()
  const isMobile = useIsMobile()
  const isOwner = user?.role === 'OWNER'
  const userBranchId = getUserBranchId(user)

  const [branches,   setBranches]  = useState([])
  const [selectedBranchId, setSelectedBranchId] = useState(isOwner ? null : userBranchId)
  const [menu,       setMenu]      = useState([])
  const [activeTab,  setActiveTab] = useState(null)
  const [showAdd,    setShowAdd]   = useState(false)
  const [editItem,   setEditItem]  = useState(null)
  const [recipeItem, setRecipeItem]= useState(null)
  const [availabilityItem, setAvailabilityItem] = useState(null)
  const [showMatrix, setShowMatrix] = useState(false)
  const [toggling,   setToggling]  = useState(null)
  const [search,     setSearch]    = useState('')

  const canEdit = isOwner || user?.role === 'MANAGER'
  const effectiveBranchId = resolveBranchId({ isOwner, selectedBranchId, user, branches })

  useEffect(() => {
    if (isOwner) {
      branchesApi.list().then((res) => {
        const list = (res.data || []).filter((b) => b.isActive)
        setBranches(list)
        if (list.length) {
          setSelectedBranchId((prev) => {
            if (prev != null && list.some((b) => b.id === Number(prev))) {
              return Number(prev)
            }
            if (userBranchId != null && list.some((b) => b.id === Number(userBranchId))) {
              return Number(userBranchId)
            }
            return list[0].id
          })
        }
      }).catch(() => {})
    } else {
      setSelectedBranchId(userBranchId)
    }
  }, [isOwner, userBranchId])

  async function load() {
    if (!effectiveBranchId) return
    const data = await menuApi.categories({
      branchId: effectiveBranchId,
      includeUnavailable: true,
      enforceStock: false,
    })
    setMenu(data.data || [])
    if (!activeTab && data.data?.length) setActiveTab(data.data[0].id)
  }

  useEffect(() => {
    load()
  }, [effectiveBranchId])

  async function handleToggle(itemId, { global = false } = {}) {
    if (!global && !effectiveBranchId) return
    setToggling(itemId)
    try {
      await menuApi.toggle(itemId, {
        branchId: global ? undefined : effectiveBranchId,
        global,
      })
      await load()
    } finally {
      setToggling(null)
    }
  }

  function renderStatusBadge(item) {
    if (!item.isGloballyAvailable) {
      return (
        <span style={{
          fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 'var(--radius-full)',
          background: 'var(--red-light)', color: 'var(--red-dark)', flexShrink: 0,
        }}>
          Globally Disabled
        </span>
      )
    }
    if (item.isBranchEnabled === false) {
      return (
        <span style={{
          fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 'var(--radius-full)',
          background: '#fef3c7', color: '#92400e', border: '1px solid #fde68a', flexShrink: 0,
        }}>
          Disabled in Branch
        </span>
      )
    }
    if (item.hasRecipe === false) {
      return (
        <span style={{
          fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 'var(--radius-full)',
          background: '#fffbeb', color: '#b45309', border: '1px solid #fde68a', flexShrink: 0,
        }}>
          ⚠️ No Recipe
        </span>
      )
    }
    const servings = item.availableServings ?? (item.isStockAvailable ? '✓' : 0)
    if (servings === 0 || item.isStockAvailable === false) {
      const limitName = item.limitingIngredient?.name
      return (
        <span style={{
          fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 'var(--radius-full)',
          background: '#fee2e2', color: '#991b1b', border: '1px solid #fca5a5', flexShrink: 0,
        }} title={limitName ? `Limited by ${limitName}` : 'Out of stock'}>
          ⛔ Out of Stock {limitName ? `(${limitName})` : ''}
        </span>
      )
    }
    if (typeof servings === 'number' && servings <= 10) {
      return (
        <span style={{
          fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 'var(--radius-full)',
          background: '#fffbeb', color: '#92400e', border: '1px solid #fde68a', flexShrink: 0,
        }}>
          ⚠️ Low: {servings} left
        </span>
      )
    }
    return (
      <span style={{
        fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 'var(--radius-full)',
        background: 'var(--green-light)', color: 'var(--green-dark)', flexShrink: 0,
      }}>
        ✓ {typeof servings === 'number' ? `${servings} servings` : 'Available'}
      </span>
    )
  }

  const categories   = menu
  const currentItems = search.trim()
    ? menu.flatMap(c => c.items).filter(i =>
        i.name.toLowerCase().includes(search.toLowerCase()) ||
        (i.description || '').toLowerCase().includes(search.toLowerCase())
      )
    : categories.find(c => c.id === activeTab)?.items || []

  // CHANGED — less horizontal padding on mobile
  return (
    <div style={{ width: '95%', maxWidth: 1800, margin: '0 auto', padding: isMobile ? '16px 12px' : 28 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, flexWrap: 'wrap', gap: 14 }}>
        <div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 26, color: 'var(--brown-800)', margin: 0 }}>Menu Management</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: 13.5, margin: '4px 0 0' }}>
            Branch-specific product availability, pricing, and recipe Bill of Materials
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          {isOwner && branches.length > 0 ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--brown-800)' }}>📍 Branch:</span>
              <select
                value={selectedBranchId ?? effectiveBranchId ?? ''}
                onChange={e => setSelectedBranchId(Number(e.target.value))}
                style={{
                  padding: '8px 14px',
                  borderRadius: 'var(--radius-md)',
                  border: '1.5px solid var(--brown-600)',
                  background: '#fff',
                  fontSize: 13.5,
                  fontWeight: 700,
                  color: 'var(--brown-800)',
                  cursor: 'pointer',
                  outline: 'none',
                }}
              >
                {branches.map(b => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
          ) : user?.branch ? (
            <div style={{
              fontSize: 12.5,
              fontWeight: 700,
              color: 'var(--brown-700)',
              background: 'var(--brown-50)',
              padding: '7px 16px',
              borderRadius: 'var(--radius-full)',
              border: '1.5px solid var(--brown-200)',
            }}>
              📍 {user.branch.name}
            </div>
          ) : null}

          {isOwner && (
            <Button variant="outline" onClick={() => setShowMatrix(true)}>
              📊 Branch Stock Matrix
            </Button>
          )}

          {canEdit && <Button variant="primary" onClick={() => setShowAdd(true)}>+ Add Item</Button>}
        </div>
      </div>

      {/* Search bar */}
      <div style={{ position: 'relative', marginBottom: 20, maxWidth: 480 }}>
        <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', fontSize: 17, pointerEvents: 'none' }}>🔍</span>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search menu items…"
          style={{ width: '100%', padding: '12px 14px 12px 42px', border: '1.5px solid var(--border)', borderRadius: 'var(--radius-full)', fontSize: 14.5, background: '#fff', outline: 'none', boxSizing: 'border-box', borderColor: search ? 'var(--brown-400)' : 'var(--border)', transition: 'border-color 180ms ease' }}
          onFocus={e => e.target.style.borderColor = 'var(--brown-500)'}
          onBlur={e  => e.target.style.borderColor = search ? 'var(--brown-400)' : 'var(--border)'}
        />
        {search && (
          <button onClick={() => setSearch('')} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, color: 'var(--text-muted)', padding: 4 }}>✕</button>
        )}
      </div>

      {/* Category tabs */}
      {!search && (
        <div style={{ display: 'flex', gap: 10, marginBottom: 24, flexWrap: 'wrap' }}>
          {categories.map(cat => {
            const disabledCount = cat.items.filter(i => !i.isAvailable).length
            return (
              <button key={cat.id} onClick={() => setActiveTab(cat.id)} style={{
                padding: '11px 20px', borderRadius: 'var(--radius-full)', border: 'none',
                background: activeTab === cat.id ? 'var(--gradient-primary)' : 'var(--brown-100)',
                color:      activeTab === cat.id ? '#fff' : 'var(--brown-800)',
                fontWeight: 700, fontSize: 13, cursor: 'pointer', transition: 'all 200ms ease',
                boxShadow: activeTab === cat.id ? '0 4px 14px rgba(180,83,9,0.28)' : 'none',
                whiteSpace: 'nowrap',
              }}>
                {cat.name} <span style={{ opacity: 0.7 }}>({cat.items.length})</span>
                {disabledCount > 0 && (
                  <span style={{ marginLeft: 6, background: 'var(--red-light)', color: 'var(--red-dark)', borderRadius: 'var(--radius-full)', fontSize: 10, padding: '2px 7px', fontWeight: 700 }}>
                    {disabledCount} off
                  </span>
                )}
              </button>
            )
          })}
        </div>
      )}

      {/* Search result count */}
      {search && (
        <div style={{ marginBottom: 16, fontSize: 13.5, color: 'var(--text-muted)' }}>
          {currentItems.length === 0 ? `No items found for "${search}"` : `${currentItems.length} item${currentItems.length !== 1 ? 's' : ''} found for "${search}"`}
        </div>
      )}

      {/* Items table */}
      {currentItems.length === 0 ? (
        <EmptyState icon="🍽️" title="No items in this category" />
      ) : isMobile ? (
        /* ADDED — mobile card layout. The desktop table below needs
           1fr + 100px + 200px + 230px of fixed columns (~530px minimum
           before the name column gets any space), which doesn't fit on
           a phone — items would overflow or squeeze unreadably. */
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {currentItems.map(item => (
            <div key={item.id} style={{
              background: !item.isAvailable ? 'rgba(220,38,38,0.04)' : 'var(--cream)',
              border: '1.5px solid var(--border)', borderRadius: 'var(--radius-lg)',
              padding: '14px 16px', boxShadow: 'var(--shadow-sm)',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 15, color: item.isAvailable ? 'var(--text-dark)' : 'var(--text-faint)', textDecoration: !item.isAvailable ? 'line-through' : 'none' }}>
                    {item.name}
                  </div>
                  <div style={{ fontWeight: 700, color: item.isAvailable ? 'var(--brown-700)' : 'var(--text-faint)', fontSize: 14, marginTop: 2 }}>
                    ₱{Number(item.price).toFixed(2)}
                  </div>
                </div>
                {renderStatusBadge(item)}
              </div>

              <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginTop: 8 }}>
                {item.description || <span style={{ color: 'var(--text-faint)', fontStyle: 'italic' }}>No description</span>}
              </div>

              <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                <button
                  onClick={() => setAvailabilityItem(item)}
                  style={{ flex: 1, minWidth: 90, padding: '9px 10px', border: '1.5px solid #0284c7', borderRadius: 'var(--radius-sm)', background: '#f0f9ff', fontSize: 12, fontWeight: 700, cursor: 'pointer', color: '#0369a1' }}
                >
                  🔍 Breakdown
                </button>
                {canEdit && (
                  <>
                    <button
                      onClick={() => setEditItem(item)}
                      style={{ flex: 1, minWidth: 80, padding: '9px 10px', border: '1.5px solid var(--brown-300)', borderRadius: 'var(--radius-sm)', background: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', color: 'var(--brown-700)' }}
                    >
                      ✏️ Edit
                    </button>
                    <button
                      onClick={() => setRecipeItem(item)}
                      style={{ flex: 1, minWidth: 80, padding: '9px 10px', border: '1.5px solid #6d28d9', borderRadius: 'var(--radius-sm)', background: '#f5f3ff', fontSize: 12, fontWeight: 700, cursor: 'pointer', color: '#6d28d9' }}
                    >
                      🍲 Recipe
                    </button>
                    <button
                      onClick={() => handleToggle(item.id)} disabled={toggling === item.id}
                      style={{ flex: 1, minWidth: 80, padding: '9px 10px', border: `1.5px solid ${item.isBranchEnabled !== false ? 'var(--border)' : 'var(--green)'}`, borderRadius: 'var(--radius-sm)', background: item.isBranchEnabled !== false ? '#fff' : 'var(--green-light)', fontSize: 12, fontWeight: 700, cursor: 'pointer', color: item.isBranchEnabled !== false ? 'var(--text-muted)' : 'var(--green-dark)' }}
                    >
                      {toggling === item.id ? '…' : item.isBranchEnabled !== false ? 'Disable in Branch' : '✓ Enable in Branch'}
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ background: 'var(--cream)', border: '1.5px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden', boxShadow: 'var(--shadow-sm)' }}>
          <div style={{
            display: 'grid', gridTemplateColumns: canEdit ? '1fr 90px 180px 380px' : '1fr 90px 180px 220px',
            padding: '13px 20px', background: 'var(--brown-50)', borderBottom: '1px solid var(--border)',
            fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5,
          }}>
            <span>Item</span><span>Price</span><span>Description</span><span style={{ textAlign: 'right' }}>Actions</span>
          </div>

          {currentItems.map((item, i) => (
            <div key={item.id} style={{
              display: 'grid', gridTemplateColumns: canEdit ? '1fr 90px 180px 380px' : '1fr 90px 180px 220px',
              padding: '15px 20px', alignItems: 'center',
              borderBottom: i < currentItems.length - 1 ? '1px solid var(--border-light)' : 'none',
              background: !item.isAvailable ? 'rgba(220,38,38,0.04)' : (i % 2 === 1 ? 'rgba(180,83,9,0.015)' : undefined),
            }}>
              <div style={{ fontWeight: 600, fontSize: 14.5, color: item.isAvailable ? 'var(--text-dark)' : 'var(--text-faint)', textDecoration: !item.isAvailable ? 'line-through' : 'none' }}>
                {item.name}
              </div>
              <div style={{ fontWeight: 700, color: item.isAvailable ? 'var(--brown-700)' : 'var(--text-faint)' }}>
                ₱{Number(item.price).toFixed(2)}
              </div>
              <div style={{ fontSize: 12.5, color: 'var(--text-muted)', paddingRight: 14 }}>
                {item.description || <span style={{ color: 'var(--text-faint)', fontStyle: 'italic' }}>No description</span>}
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 8 }}>
                {renderStatusBadge(item)}
                <button
                  onClick={() => setAvailabilityItem(item)}
                  style={{ padding: '5px 12px', border: '1.5px solid #0284c7', borderRadius: 'var(--radius-sm)', background: '#f0f9ff', fontSize: 11, fontWeight: 700, cursor: 'pointer', color: '#0369a1', transition: 'all 180ms ease' }}
                >
                  🔍 Breakdown
                </button>
                {canEdit && (
                  <>
                    <button
                      onClick={() => setEditItem(item)}
                      style={{ padding: '5px 12px', border: '1.5px solid var(--brown-300)', borderRadius: 'var(--radius-sm)', background: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer', color: 'var(--brown-700)', transition: 'all 180ms ease' }}
                    >
                      ✏️ Edit
                    </button>
                    <button
                      onClick={() => setRecipeItem(item)}
                      style={{ padding: '5px 12px', border: '1.5px solid #6d28d9', borderRadius: 'var(--radius-sm)', background: '#f5f3ff', fontSize: 11, fontWeight: 700, cursor: 'pointer', color: '#6d28d9', transition: 'all 180ms ease' }}
                    >
                      🍲 Recipe
                    </button>
                    <button
                      onClick={() => handleToggle(item.id)} disabled={toggling === item.id}
                      style={{ padding: '5px 12px', border: `1.5px solid ${item.isBranchEnabled !== false ? 'var(--border)' : 'var(--green)'}`, borderRadius: 'var(--radius-sm)', background: item.isBranchEnabled !== false ? '#fff' : 'var(--green-light)', fontSize: 11, fontWeight: 700, cursor: 'pointer', color: item.isBranchEnabled !== false ? 'var(--text-muted)' : 'var(--green-dark)', transition: 'all 180ms ease' }}
                    >
                      {toggling === item.id ? '…' : item.isBranchEnabled !== false ? 'Disable in Branch' : '✓ Enable in Branch'}
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {showAdd && (
        <AddItemModal categories={categories} onClose={() => setShowAdd(false)} onSaved={() => { setShowAdd(false); load() }} />
      )}
      {editItem && (
        <EditItemModal
          item={editItem} categories={categories} role={user?.role}
          onClose={() => setEditItem(null)}
          onSaved={() => { setEditItem(null); load() }}
        />
      )}
      {recipeItem && (
        <RecipeManagerModal
          item={recipeItem}
          onClose={() => setRecipeItem(null)}
        />
      )}
      {availabilityItem && (
        <AvailabilityBreakdownModal
          item={availabilityItem}
          branches={branches}
          branchId={effectiveBranchId}
          isOwner={isOwner}
          onClose={() => setAvailabilityItem(null)}
        />
      )}
      {showMatrix && (
        <AvailabilityMatrixModal onClose={() => setShowMatrix(false)} />
      )}
    </div>
  )
}