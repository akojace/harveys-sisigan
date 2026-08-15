// src/pages/MenuPage.jsx
import { useState, useEffect, useRef } from 'react'
import { menuApi, inventoryApi } from '../api/client'
import { Button, Input, Modal, Badge, EmptyState, Card } from '../components/ui'
import { useAuth } from '../context/AuthContext'

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
  const [ingredients, setIngredients] = useState([])
  const [selectedIngId, setSelectedIngId] = useState('')
  const [quantity, setQuantity] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [removing, setRemoving] = useState(null)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  useEffect(() => {
    setLoading(true)
    Promise.all([
      menuApi.getRecipe(item.id),
      inventoryApi.list(),
    ]).then(([recipeRes, invRes]) => {
      setRecipe(recipeRes.data || [])
      // Deduplicate ingredients by name (across branches)
      const seen = new Map()
      for (const inv of (invRes.data || [])) {
        if (!seen.has(inv.ingredient.id)) seen.set(inv.ingredient.id, inv.ingredient)
      }
      setIngredients([...seen.values()])
      if (seen.size > 0) setSelectedIngId(String([...seen.values()][0].id))
    }).catch(e => setError(e.message)).finally(() => setLoading(false))
  }, [item.id])

  async function addIngredient() {
    if (!selectedIngId || !quantity || Number(quantity) <= 0) {
      setError('Select an ingredient and enter a valid quantity > 0.')
      return
    }
    setSaving(true); setError(''); setSuccess('')
    try {
      const res = await menuApi.addRecipeIngredient(item.id, {
        ingredientId: Number(selectedIngId),
        quantity: Number(quantity),
      })
      setRecipe(prev => {
        const existing = prev.find(r => r.ingredientId === res.data.ingredientId)
        if (existing) return prev.map(r => r.ingredientId === res.data.ingredientId ? res.data : r)
        return [...prev, res.data]
      })
      setQuantity('')
      setSuccess('Ingredient added to recipe!')
      setTimeout(() => setSuccess(''), 2500)
    } catch (e) { setError(e.message) }
    finally { setSaving(false) }
  }

  async function removeIngredient(ingredientId) {
    setRemoving(ingredientId); setError(''); setSuccess('Ingredient removed from recipe!'); setTimeout(() => setSuccess(''), 2500)
    try {
      await menuApi.removeRecipeIngredient(item.id, ingredientId)
      setRecipe(prev => prev.filter(r => r.ingredientId !== ingredientId))
    } catch (e) { setError(e.message) }
    finally { setRemoving(null) }
  }

  const selectStyle = {
    width: '100%', padding: '10px 14px', border: '1.5px solid var(--border)',
    borderRadius: 'var(--radius-md)', fontSize: 13.5, background: '#fff', outline: 'none', cursor: 'pointer',
  }

  return (
    <Modal title={`Recipe: ${item.name}`} onClose={onClose} width={540}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        {error && (
          <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 10, padding: '12px 16px', fontSize: 13, color: '#dc2626' }}>
            ⚠️ {error}
          </div>
        )}
        {success && (
          <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 10, padding: '12px 16px', fontSize: 13, color: '#16a34a' }}>
            ✅ {success}
          </div>
        )}

        {/* Add ingredient form */}
        <div style={{ background: 'var(--brown-50)', borderRadius: 'var(--radius-md)', padding: 16, border: '1.5px solid var(--border)' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12 }}>
            Add Ingredient
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
            <div style={{ flex: 2 }}>
              <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>Ingredient</label>
              <select value={selectedIngId} onChange={e => setSelectedIngId(e.target.value)} style={selectStyle}>
                {ingredients.map(ing => (
                  <option key={ing.id} value={ing.id}>{ing.name} ({ing.unit})</option>
                ))}
              </select>
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>Qty per order</label>
              <input
                type="number" min="0.001" step="0.001" value={quantity}
                onChange={e => setQuantity(e.target.value)}
                placeholder="e.g. 1"
                style={{ ...selectStyle, textAlign: 'center', cursor: 'text' }}
              />
            </div>
            <Button variant="primary" onClick={addIngredient} disabled={saving || loading}>
              {saving ? '…' : '+ Add'}
            </Button>
          </div>
        </div>

        {/* Current recipe */}
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>
            Current Recipe {recipe.length > 0 && `(${recipe.length} ingredient${recipe.length !== 1 ? 's' : ''})`}
          </div>
          {loading ? (
            <div style={{ textAlign: 'center', padding: 24, color: 'var(--text-muted)', fontSize: 13.5 }}>Loading…</div>
          ) : recipe.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '24px', background: 'var(--brown-50)', border: '1.5px dashed var(--border)', borderRadius: 'var(--radius-md)', color: 'var(--text-faint)', fontSize: 13.5 }}>
              No recipe set. Add ingredients above to enable auto-deduction.
            </div>
          ) : (
            <div style={{ border: '1.5px solid var(--border)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 100px 90px', padding: '10px 16px', background: 'var(--brown-50)', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                <span>Ingredient</span><span style={{ textAlign: 'right' }}>Qty / Order</span><span></span>
              </div>
              {recipe.map((r, i) => (
                <div key={r.ingredientId} style={{
                  display: 'grid', gridTemplateColumns: '1fr 100px 90px',
                  padding: '12px 16px', alignItems: 'center',
                  borderTop: i > 0 ? '1px solid var(--border-light)' : 'none',
                  background: '#fff',
                }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13.5, color: 'var(--text-dark)' }}>{r.ingredient.name}</div>
                    <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>{r.ingredient.unit} · {r.ingredient.category}</div>
                  </div>
                  <div style={{ textAlign: 'right', fontWeight: 700, fontSize: 14.5, color: 'var(--brown-700)' }}>
                    {Number(r.quantity).toFixed(Number(r.quantity) % 1 === 0 ? 0 : 2)}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <button
                      onClick={() => removeIngredient(r.ingredientId)}
                      disabled={removing === r.ingredientId}
                      style={{ padding: '4px 11px', fontSize: 11, fontWeight: 700, border: '1.5px solid #fca5a5', borderRadius: 'var(--radius-sm)', background: '#fef2f2', color: '#dc2626', cursor: 'pointer' }}
                    >
                      {removing === r.ingredientId ? '…' : '✕ Remove'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{ fontSize: 11.5, color: 'var(--text-faint)', lineHeight: 1.7 }}>
          💡 Ingredients listed here will be automatically deducted from inventory every time this item is ordered. If any ingredient is out of stock, the item will be blocked from the POS.
        </div>
      </div>
    </Modal>
  )
}

export default function MenuPage() {
  const { user } = useAuth()
  const [menu,       setMenu]      = useState([])
  const [activeTab,  setActiveTab] = useState(null)
  const [showAdd,    setShowAdd]   = useState(false)
  const [editItem,   setEditItem]  = useState(null)
  const [recipeItem, setRecipeItem]= useState(null)
  const [toggling,   setToggling]  = useState(null)
  const [search,     setSearch]    = useState('')

  const canEdit = user?.role === 'OWNER' || user?.role === 'MANAGER'

  async function load() {
    const data = await menuApi.categories({ includeUnavailable: true })
    setMenu(data.data || [])
    if (!activeTab && data.data?.length) setActiveTab(data.data[0].id)
  }

  useEffect(() => { load() }, [])

  async function handleToggle(itemId) {
    setToggling(itemId)
    try { await menuApi.toggle(itemId); await load() }
    finally { setToggling(null) }
  }

  const categories   = menu
  const currentItems = search.trim()
    ? menu.flatMap(c => c.items).filter(i =>
        i.name.toLowerCase().includes(search.toLowerCase()) ||
        (i.description || '').toLowerCase().includes(search.toLowerCase())
      )
    : categories.find(c => c.id === activeTab)?.items || []

  return (
    <div style={{ width: '95%', maxWidth: 1800, margin: '0 auto', padding: 28 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, flexWrap: 'wrap', gap: 14 }}>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 26, color: 'var(--brown-800)' }}>Menu Management</h1>
        {canEdit && <Button variant="primary" onClick={() => setShowAdd(true)}>+ Add Item</Button>}
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
      ) : (
        <div style={{ background: 'var(--cream)', border: '1.5px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden', boxShadow: 'var(--shadow-sm)' }}>
          <div style={{
            display: 'grid', gridTemplateColumns: canEdit ? '1fr 100px 200px 230px' : '1fr 100px 200px 120px',
            padding: '13px 20px', background: 'var(--brown-50)', borderBottom: '1px solid var(--border)',
            fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5,
          }}>
            <span>Item</span><span>Price</span><span>Description</span><span style={{ textAlign: 'right' }}>Actions</span>
          </div>

          {currentItems.map((item, i) => (
            <div key={item.id} style={{
              display: 'grid', gridTemplateColumns: canEdit ? '1fr 100px 200px 230px' : '1fr 100px 200px 120px',
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
                <span style={{
                  fontSize: 11, fontWeight: 700, padding: '4px 12px', borderRadius: 'var(--radius-full)',
                  background: item.isAvailable ? 'var(--green-light)' : 'var(--red-light)',
                  color:      item.isAvailable ? 'var(--green-dark)'  : 'var(--red-dark)',
                }}>
                  {item.isAvailable ? 'Available' : 'Disabled'}
                </span>
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
                      style={{ padding: '5px 12px', border: `1.5px solid ${item.isAvailable ? 'var(--border)' : 'var(--green)'}`, borderRadius: 'var(--radius-sm)', background: item.isAvailable ? '#fff' : 'var(--green-light)', fontSize: 11, fontWeight: 700, cursor: 'pointer', color: item.isAvailable ? 'var(--text-muted)' : 'var(--green-dark)', transition: 'all 180ms ease' }}
                    >
                      {toggling === item.id ? '…' : item.isAvailable ? 'Disable' : '✓ Enable'}
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
    </div>
  )
}